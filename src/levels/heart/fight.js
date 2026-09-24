import * as THREE from 'three';
import { getCreatureBuilder } from '../../entities/enemy.js';
import { WATER_Y, TUNNEL } from './arena.js';

// The boss fight and what follows: the Mother rises when you step into the
// ring, dies over the pool edge, the cage in her ribs opens, you cut your
// sister free and the pool floods the heart while you run for the tunnel.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function setupFight(L, game, A) {
  const has = (f) => game.flags.has(f);
  const escape = has('escape');
  const killed = has('killed:mother') || escape;
  const rootPos = V(0, WATER_Y, 0);
  const anchorsLocal = A.anchorsWorld.map((w) => w.clone().sub(rootPos));
  const S = { mother: null, sister: null, sisterT: 0, sisterState: 'caged', freed: escape, flood: -1, deadT: killed ? 99 : -1, cut: false };

  const hooks = {
    onFight: (m) => {
      game.hud.say('Her chains hold her to the walls. Your sister is inside her ribs.', 4);
    },
    onPhase: (ph) => {
      if (ph === 1) game.hud.say('The pool boils. Something climbs out of it.', 3);
      if (ph === 2) game.hud.say('A chain tears out of the wall. She is going mad.', 3);
    },
    onChainSnap: (i, w) => {
      const c = L.prop('chainHanging', w.x, w.z, { y: w.y - 0.15, dynamic: true, collider: 'none', args: { length: 2.4, heavy: true } });
      c.scale.setScalar(2);
    },
    onDeath: () => {
      S.deadT = 0;
      game.hud.say('She shudders and folds forward over the edge of the pool.', 4);
      game.audio.setZone(null);
      setTimeout(() => {
        if (game.levels.current !== L.level) return;
        game.hud.say('Inside her open ribs the cage has come down to the edge. Your sister is in it.', 5);
        game.audio.setZone('viscera');
        // She stays dead if you die now.
        game.levels.saveCheckpoint('heart', 'fromCaves');
      }, 4500);
    },
  };

  const spec = { id: 'mother', yaw: 0, modelOpts: { anchors: anchorsLocal.map((v) => v.clone()) }, anchorsWorld: A.anchorsWorld, anchorsLocal, hooks, addArc: 1.75 };
  if (killed) L.level.enemySpecs.push({ type: 'mother', pos: rootPos.clone(), ...spec, startDead: true });
  else L.enemy('mother', rootPos, spec);

  const mother = () => S.mother || (S.mother = L.level.enemies.find((e) => e.type === 'mother'));

  // ---------- Your sister, curled up in the cage ----------
  const ensureSister = () => {
    const m = mother();
    if (S.freed || S.sister || !m) return;
    const build = getCreatureBuilder();
    let model = null;
    try {
      model = build ? build('sister') : null;
    } catch (e) {
      console.error('[heart] sister model failed', e);
    }
    if (!model) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.7, 4, 8), new THREE.MeshStandardMaterial({ color: 0xbfb6ac, roughness: 0.8 }));
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.25;
      root.add(body);
      model = { root, animate() {}, dispose() {} };
    }
    S.sister = model;
    m.model.sisterSlot.add(model.root);
  };

  // ---------- The fight starts when you step into the ring ----------
  L.trigger({
    pos: [0, 0, 0],
    radius: 14.3,
    onEnter: (g) => {
      const m = mother();
      if (!m || m.dead || has('escape') || !m.startFight()) return;
      g.audio.setZone('boss');
      g.audio.play('braam');
      g.audio.play('bossRise', { pos: V(0, 0, 0) });
      setTimeout(() => g.levels.current === L.level && g.audio.play('bossRoar', { pos: V(0, 6, 0) }), 2600);
      g.player.lookAt(V(0, 4.2, 0), 3.6, 3);
      g.player.frozen = true;
      g.player.shake = 0.6;
      g.hud.boss('The Mother Below', m.frac);
      g.hud.say('The black water heaves. Something vast stands up out of it.', 4);
      setTimeout(() => {
        if (g.levels.current === L.level) g.player.frozen = false;
      }, 3400);
    },
  });

  // ---------- Cut her free ----------
  const slotPos = V(0, 0.6, 3.9);
  const cage = L.interact({
    pos: slotPos.clone(),
    radius: 2.7,
    noLOS: true,
    enabled: () => !S.freed && !S.cut && S.deadT > 3.8,
    prompt: (g) => (g.inventory.has('knife') ? 'Cut her free' : 'The cage is laced shut with sinew'),
    onUse: (g) => {
      if (!g.inventory.has('knife')) {
        g.hud.say('Sinew and wire, knotted tight. You need a blade.', 3);
        return;
      }
      S.cut = true;
      if (g.weapons.current !== 'knife') g.weapons.equip('knife');
      g.audio.play('knifeSwing');
      g.audio.play('ropeCut', { pos: cage.pos.clone() });
      g.player.lookAt(cage.pos.clone(), 1.8, 5);
      g.player.frozen = true;
      g.hud.say('You saw through the sinew. The cage door falls open.', 3);
      S.sisterState = 'stand';
      S.sisterT = 0;
      setTimeout(() => handOver(g), 1700);
    },
  });

  const handOver = async (g) => {
    if (g.levels.current !== L.level) return;
    g.fx.fadeTo(1, 7);
    await new Promise((r) => setTimeout(r, 170));
    const at = S.sister ? S.sister.root.getWorldPosition(V(0, 0, 0)) : cage.pos.clone();
    if (S.sister) {
      S.sister.root.removeFromParent();
      S.sister.dispose?.();
      S.sister = null;
    }
    S.freed = true;
    g.setFlag('sister.free');
    g.setFlag('escape');
    g.sister.onLevel();
    // Put her on the floor between you and the cage.
    const p = g.player.position;
    const dir = V(at.x - p.x, 0, at.z - p.z);
    const d = Math.min(1.1, dir.length());
    if (g.sister.model && d > 0.2) g.sister.model.root.position.set(p.x + (dir.x / dir.length()) * d, p.y, p.z + (dir.z / dir.length()) * d);
    g.player.frozen = false;
    g.fx.fadeTo(0, 2.5);
    g.hud.say('She is cold and shaking, but alive.', 3.5);
    g.hud.say('The pool is rising. RUN. Back through the tunnel.', 4);
    startFlood(g);
  };

  // ---------- The flood ----------
  const exitLight = L.light({ pos: [0, 2.6, TUNNEL.z1 - 2], color: 0xffd0b0, intensity: 2.4, distance: 10, flicker: 0.15, kind: 'lantern', enabled: escape });
  const startFlood = (g) => {
    S.flood = 0;
    exitLight.enabled = true;
    g.audio.play('flood');
    g.audio.play('boom', { gain: 0.8 });
    g.audio.setZone('escape');
    g.player.shake = 0.8;
  };
  if (escape) A.water.setLevel(0.45);

  // ---------- Per frame ----------
  let rumble = 3;
  L.onUpdate((dt, t, g) => {
    const m = mother();
    for (const u of A.pulses) u.value = g.lights.pulse || 0;
    ensureSister();
    if (S.sister) {
      S.sisterT += dt;
      S.sister.animate?.(dt, g.time, { state: S.sisterState, stateTime: S.sisterT, speed: 0 });
    }
    if (m && m.model.sisterSlot) m.model.sisterSlot.getWorldPosition(cage.pos).add(V(0, 0.35, 0));
    // Sigil: pulses while she lives, dims once she's dead.
    const base = A.sigilMat.userData.base;
    if (S.deadT >= 0) {
      S.deadT += dt;
      const k = Math.max(0.08, 1 - S.deadT / 3);
      A.sigilMat.emissiveIntensity = base * k;
      A.sigilMat.opacity = 0.35 + 0.65 * k;
      for (const s of A.sigilLights) s.intensity = 1.5 * Math.max(0, 1 - S.deadT / 3);
    } else {
      const fighting = m && m.state !== 'submerged';
      A.sigilMat.emissiveIntensity = base * (fighting ? 0.9 + 0.35 * (g.lights.pulse || 0) : 0.55 + 0.2 * Math.sin(t * 1.3));
    }
    // Rising black water.
    if (S.flood >= 0) {
      S.flood += dt;
      A.water.setLevel(Math.min(2.6, WATER_Y + 0.09 * S.flood + 0.0035 * S.flood * S.flood));
      rumble -= dt;
      if (rumble <= 0) {
        rumble = 2.5 + Math.random() * 3;
        g.player.shake = Math.min(1, g.player.shake + 0.35);
        g.audio.play(Math.random() < 0.5 ? 'boom' : 'crack', { pos: V((Math.random() - 0.5) * 20, 8, (Math.random() - 0.5) * 20), gain: 0.6 });
      }
    }
  });

  L.onEnter((g) => {
    const m = mother();
    if (has('escape')) {
      exitLight.enabled = true;
      g.audio.setZone('escape');
      g.hud.say('The heart is filling with black water. Get her out.', 4);
    } else if (m?.dead) {
      g.audio.setZone('viscera');
      if (!S.freed) g.hud.say('The Mother lies across the pool. The cage is at the edge.', 4);
    } else {
      g.audio.setZone('viscera');
      g.hud.say('It is breathing. The whole room is breathing.', 3.5);
    }
  });

  // Leaving mid-fight: she sinks back and waits for you.
  L.onExit(() => {
    const m = mother();
    if (m && !m.dead && m.state !== 'submerged') m.sink();
  });

  return S;
}
