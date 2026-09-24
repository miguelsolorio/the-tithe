import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial } from '../../world/materials.js';
import { wallPoint, wallOff, floorTop, SPAWN_START, SPAWN_HEART, SPHINCTER, POOL_Y } from './layout.js';
import { hunterCorpse, membraneGeo, membraneMaterial } from './meshes.js';

// Gameplay for the flesh caves: spawns and exits, the sphincter, wall maws
// (one safe demonstration, then rhythmic gauntlets), enemies, pickups, the
// dead hunter with the shotgun, the membrane over the way back and the womb
// convulsing when the shotgun is taken.

const RESIST = 'The tissue is too thick. Something heavier might tear it.';

// Timers that run on level time (they pause with the game).
export function scheduler(L) {
  const list = [];
  L.onUpdate((dt) => {
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].t -= dt;
      if (list[i].t > 0) continue;
      const fn = list[i].fn;
      list.splice(i, 1);
      fn();
    }
  });
  return (t, fn) => list.push({ t, fn });
}

const findEnemy = (L, id) => L.level.enemies.find((e) => e.id === id && !e.dead);

export function spawnsAndExits(L, flood) {
  L.spawn('fromCistern', SPAWN_START, 0);
  L.spawn('start', SPAWN_START, 0);
  L.spawn('fromHeart', SPAWN_HEART, Math.PI);
  L.crawl({ min: [16.6, -1, 20.9], max: [18.4, 2, 26] });
  L.exit({ min: [17, -1, 24.6], max: [18, 2, 26], to: 'cistern', spawn: 'fromCaves' });
  if (!flood) L.exit({ min: [13.1, -1, -23.0], max: [15.9, 3, -21.6], to: 'heart', spawn: 'fromCaves', requires: (g) => g.flags.has('sphincter.open') });
}

// ---------- The sphincter ----------
export function sphincter(L, game, flood, after) {
  const { x, z, d } = SPHINCTER;
  const obj = L.prop('sphincterDoor', x, z, { y: 0, face: 's', dynamic: true, args: { diameter: d } });
  const setOpen = obj.userData.setOpen || (() => {});
  const cols = obj.userData.colliders || [];
  const center = new THREE.Vector3(x, d / 2, z + 0.3);
  let opened = flood || game.flags.has('sphincter.open');
  let anim = opened ? 2 : -1;
  let flinch = 0;
  const setCols = (on) => cols.forEach((c) => (c.enabled = on));
  L.light({ pos: [x, 1.5, z + 1.0], color: 0xff2a1a, intensity: 1.0, distance: 5, flicker: 0.4, kind: 'flesh' });
  if (opened) {
    setOpen(1);
    setCols(false);
  }
  const open = (g) => {
    if (anim >= 0) return;
    anim = 0;
    opened = true;
    g.setFlag('sphincter.open');
    setCols(false);
    L.level.markNavDirty();
    g.audio.play('squelch', { pos: center, gain: 1.3 });
    g.audio.play('braam', { gain: 0.8 });
    after(0.35, () => g.audio.play('squelch', { pos: center }));
    after(0.9, () => g.audio.play('heart', { gain: 1.1 }));
    g.particles.impact(center, { x: 0, y: 0.3, z: 1 }, 'blood', 50);
    g.player.shake = Math.max(g.player.shake, 0.7);
    g.hud.say('It spasms and tears open. Past it, a heartbeat you can feel in your teeth.', 4.5);
  };
  if (!opened) {
    L.damageable({
      pos: [x, d / 2, z + 0.3],
      r: 1.25,
      health: 150,
      only: ['shotgun'],
      resist: RESIST,
      onHit: (g) => {
        flinch = 1;
        g.audio.play('squelch', { pos: center, gain: 0.9 });
      },
      onDestroy: (g) => open(g),
    });
    L.interact({
      pos: [x, 1.3, z + 0.7],
      radius: 2.2,
      ignore: cols,
      prompt: 'Push against the tissue',
      enabled: (g) => !opened && !g.inventory.has('shotgun'),
      onUse: (g) => {
        g.hud.say(RESIST, 3.5);
        g.audio.play('squelch', { pos: center, gain: 0.6 });
        flinch = 0.6;
      },
    });
    L.trigger({ pos: [x, 0, z + 5.5], radius: 4, once: true, onEnter: (g) => !opened && g.hud.say('A ring of muscle, clenched shut across the passage. The drag marks run straight into it.', 5) });
  }
  L.onUpdate((dt, t, g) => {
    if (g.player.position.distanceTo(center) > 28) return;
    const p = g.lights.pulse || 0;
    if (anim >= 0 && anim < 1) {
      anim = Math.min(1, anim + dt / 1.6);
      const e = anim * anim * (3 - 2 * anim);
      setOpen(Math.max(0, Math.min(1, e + Math.sin(anim * 28) * 0.08 * (1 - anim))));
      if (anim >= 1) anim = 2;
      return;
    }
    flinch = Math.max(0, flinch - dt * 3);
    setOpen(opened ? 0.93 + 0.05 * p : 0.015 + 0.04 * p + 0.2 * flinch);
  });
}

// ---------- Wall maws ----------
// [id, axis, line, u, floor, dir, gap between rhythmic bites (s) or 0, first-bite phase]
const MAWS = [
  ['v_maw_demo', 'x', -19, 2.5, 0, 1, 0, 0],
  ['v_maw_g1', 'z', -4, -11, 0, 1, 2.0, 0.3],
  ['v_maw_g2', 'z', -2, -7, 0, -1, 2.0, 1.3],
  ['v_maw_g3', 'z', -4, -3, 0, 1, 2.0, 2.3],
  ['v_maw_neck', 'z', -12, 14.5, -0.4, 1, 2.2, 0.8],
];

const lunge = (e, g) => {
  e.setState('lunge');
  e.bit = false;
  g.audio.play('mawLunge', { pos: e.pos.clone() });
};

export function maws(L, after) {
  const rhythm = {};
  for (const [id, axis, line, u, floor, dir, gap, phase] of MAWS) {
    const yaw = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    L.enemy('wallMaw', wallPoint(axis, line, u, floor + 1.15, dir, 0.03), { id, yaw, idle: 'dormant' });
    if (gap) rhythm[id] = [gap, phase];
  }
  L.onUpdate((dt, t, g) => {
    for (const e of L.level.enemies) {
      if (e.type !== 'wallMaw' || e.dead) continue;
      // A hit knocks a maw into a state it never leaves; put it back.
      if (!['dormant', 'lunge', 'retract'].includes(e.state)) e.setState('dormant');
      const r = rhythm[e.id];
      if (!r) continue;
      if (e.state === 'lunge') {
        e._beat = r[0];
        continue;
      }
      if (e.distToPlayer() > 10) {
        e._beat = undefined;
        continue;
      }
      if (e._beat === undefined) e._beat = r[1];
      e._beat -= dt;
      if (e._beat <= 0 && e.state === 'dormant' && e.cool <= 0 && !g.player.dead) lunge(e, g);
    }
  });
  // The first maw bites at the air while you are still well out of reach.
  L.trigger({
    min: [5.5, -1, -18.2],
    max: [8.9, 3, -14.9],
    once: true,
    onEnter: (g) => {
      const e = findEnemy(L, 'v_maw_demo');
      if (!e) return;
      after(0.3, () => {
        if (e.state === 'dormant') lunge(e, g);
        g.player.lookAt(e.pos.clone().add(new THREE.Vector3(0, 0.1, 0.8)), 1.2, 5);
        g.audio.play('screech', { gain: 0.4 });
      });
      after(1.8, () => g.hud.say('The wall bit at the air. Keep out of reach of the mouths.', 4));
    },
  });
  L.trigger({ min: [-4.2, -1, -15], max: [-1.8, 3, -13.4], once: true, onEnter: (g) => g.hud.say('More mouths, snapping on a rhythm. Let one bite, then run past.', 4.5) });
}

// ---------- Enemies ----------
export function enemies(L, game, flood, after) {
  if (flood) {
    L.enemy('skinless', [14.5, 0, -2], { id: 'v_sk_f1', yaw: Math.PI, idle: 'stand' });
    // One tears itself out of the tunnel wall as you run past.
    L.trigger({
      min: [15.6, -1, 11.5],
      max: [19.4, 3, 13.5],
      once: true,
      onEnter: (g) => {
        if (g.flags.has('killed:v_sk_f2')) return;
        const pos = new THREE.Vector3(18.3, 0, 14.6);
        g.audio.play('squelch', { pos, gain: 1.3 });
        g.particles.impact(pos.clone().setY(1.2), { x: -1, y: 0.3, z: 0 }, 'blood', 40);
        const e = g.enemies.create(L.level, { type: 'skinless', id: 'v_sk_f2', pos, yaw: Math.PI, idle: 'stand' });
        if (e) {
          e.setState('notice');
          e.onNotice?.();
          g.enemies.spotted(e, true);
        }
      },
    });
    return;
  }
  L.enemy('skinless', [14.5, 0, -5.5], { id: 'v_sk_gallery', yaw: 0, idle: 'wander', wanderRadius: 3.5 });
  L.enemy('hound', [-2.6, 0, -16.6], { id: 'v_hound_vein', yaw: Math.PI / 2, idle: 'sniff' });
  L.enemy('skinless', [-7.8, POOL_Y, 10.2], { id: 'v_sk_pool', yaw: 0.6, idle: 'wander', wanderRadius: 3 });
  L.enemy('skinless', [-20.3, 0, 23.3], { id: 'v_sk_womb', yaw: -Math.PI / 2, idle: 'stand' });
  if (game.flags.has('took:shotgun')) {
    L.enemy('skinless', [-20.6, 0, 20.4], { id: 'v_sk_pod1', yaw: 1, idle: 'wander', wanderRadius: 3 });
    L.enemy('skinless', [-17.4, 0, 27.3], { id: 'v_sk_pod2', yaw: 3, idle: 'wander', wanderRadius: 3 });
    L.enemy('hound', [14.5, 0, -9.5], { id: 'v_hound_return', yaw: 0, idle: 'sniff' });
  }
}

// ---------- Pickups ----------
export function pickups(L) {
  const f = (x, z, base = 0) => floorTop(x, z, 0.15, base);
  L.pickup({ id: 'v_bandage_start', kind: 'bandage', pos: [19.7, 0.01, 18.9] });
  L.pickup({ id: 'v_ammo_gallery', kind: 'ammo', amount: 6, pos: [12.25, f(12.25, -0.95), -0.95] });
  L.pickup({ id: 'v_shells_hall', kind: 'shells', amount: 3, pos: [18.9, f(18.9, -16.7), -16.7] });
  L.pickup({ id: 'v_ammo_vein', kind: 'ammo', amount: 4, pos: [4.4, f(4.4, -18.45), -18.45] });
  L.pickup({ id: 'v_bandage_gauntlet', kind: 'bandage', pos: [-2.65, f(-2.65, 0.4), 0.4] });
  L.pickup({ id: 'v_shells_pool', kind: 'shells', amount: 4, pos: [-9.55, 0.06, 5.95] });
  L.pickup({ id: 'v_bandage_return', kind: 'bandage', pos: [3.85, f(3.85, 19.98), 19.98] });
}

// ---------- The hunter, the shotgun, the womb's response ----------
export function hunter(L, game, after, pods, tearMembrane) {
  // Sit him against the west wall of the womb, back into the deepest bulge.
  let off = -0.45;
  for (let zz = 22.6; zz <= 23.4; zz += 0.2) for (let y = 0.3; y <= 1.2; y += 0.3) off = Math.max(off, wallOff(zz, y, -26));
  const hx = -26 + off + 0.04;
  const body = hunterCorpse();
  body.position.set(hx, 0, 23);
  body.rotation.y = Math.PI / 2;
  L.mesh(body, { static: true, collider: [{ min: [-0.32, 0, -0.1], max: [0.32, 1.0, 0.28] }, { min: [-0.35, 0, 0.5], max: [0.35, 0.22, 1.05] }] });
  body.updateMatrixWorld(true);
  const gun = new THREE.Vector3(...body.userData.shotgunAt).applyMatrix4(body.matrixWorld);
  L.pickup({ id: 'v_shells_hunter', kind: 'shells', amount: 4, pos: [hx + 0.8, floorTop(hx + 0.8, 22.2, 0.15), 22.2] });
  // His journal, fallen by his hand.
  const note = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.22), getMaterial('paper'));
  note.position.set(hx + 0.55, floorTop(hx + 0.55, 23.75, 0.15) + 0.012, 23.75);
  note.rotation.y = 0.5;
  L.mesh(note, { static: true });
  L.interact({
    pos: [hx + 0.55, 0.3, 23.75],
    radius: 1.5,
    prompt: 'Read the hunter’s journal',
    onUse: (g) => {
      g.hud.say('A hunter’s journal, the last pages stuck together with blood.', 4);
      g.hud.say('“Eleven years tracking the tithe. This year they took a girl. I followed them down.”', 5);
      g.hud.say('“It grows back over anything that stops moving. The door at the heart only opens to lead.”', 6);
    },
  });
  if (game.flags.has('took:shotgun')) return;
  L.pickup({
    id: 'shotgun',
    kind: 'item',
    item: 'shotgun',
    pos: [gun.x, gun.y, gun.z],
    rotY: 0.25,
    prompt: 'Take the shotgun',
    message: 'A double-barrel, still loaded. (Press 3.)',
    onTake: (g) => after(1.6, () => convulse(g)),
  });
  // Taking it wakes the womb: pods split, the membrane to the east tears.
  const convulse = (g) => {
    if (g.levels.current !== L.level) return;
    g.audio.play('heart', { gain: 1.2 });
    g.audio.play('rush', { gain: 0.7 });
    g.player.shake = 1;
    g.hud.say('The whole womb convulses.', 3);
    const burst = pods.filter((o) => o.userData.burstId);
    burst.forEach((o, i) => after(0.5 + i * 0.9, () => burstPod(g, o)));
    after(2.0, () => tearMembrane(g));
    after(3.4, () => g.hud.say('Something tore open to the east. A way back.', 3.5));
    if (!g.flags.has('killed:v_hound_return')) g.enemies.create(L.level, { type: 'hound', id: 'v_hound_return', pos: new THREE.Vector3(14.5, 0, -9.5), yaw: 0, idle: 'sniff' });
  };
  const burstPod = (g, o) => {
    const body = o.userData.pulse;
    if (!body?.visible) return;
    body.visible = false;
    for (const s of o.userData.sources || []) s.enabled = false;
    for (const c of o.userData.colliders || []) c.enabled = false;
    const p = o.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    g.particles.impact(p, { x: 0, y: 1, z: 0 }, 'blood', 45);
    g.decals.blood(o.position.clone().setY(0.03), { x: 0, y: 1, z: 0 }, 1.3);
    g.audio.play('squelch', { pos: p, gain: 1.4 });
    const id = o.userData.burstId;
    if (g.flags.has(`killed:${id}`)) return;
    const dir = g.player.position.clone().sub(o.position).setY(0).normalize();
    const pos = o.position.clone().addScaledVector(dir, 0.8).setY(0);
    const e = g.enemies.create(L.level, { type: 'skinless', id, pos, yaw: Math.atan2(dir.x, dir.z), idle: 'wander', wanderRadius: 3 });
    if (!e) return;
    e.setState('notice');
    e.onNotice?.();
    g.enemies.spotted(e, true);
    L.level.markNavDirty();
  };
}

// ---------- The membrane over the way back ----------
export function returnMembrane(L, game) {
  const x = -8.8;
  const z0 = 23;
  const z1 = 26;
  const h = 3.9;
  const halves = [];
  for (const [zEdge, rot, seed] of [[z0, -Math.PI / 2, 21], [z1, Math.PI / 2, 22]]) {
    const { sheet, veins } = membraneGeo(1.65, h, seed, 0.12);
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(sheet.translate(0.82, 0, 0), membraneMaterial());
    m.renderOrder = 2;
    pivot.add(m);
    pivot.add(new THREE.Mesh(mergeGeometries(veins.map((v) => v.translate(0.82, 0, 0))), getMaterial('fleshDark')));
    pivot.position.set(x, 0, zEdge);
    pivot.rotation.y = rot;
    L.group.add(pivot);
    halves.push({ pivot, rot });
  }
  const col = L.collider([x - 0.15, 0, z0], [x + 0.15, 4, z1], { walkable: false, seeThrough: true });
  let t = game.flags.has('took:shotgun') ? 1 : -1;
  const apply = (k) => {
    for (const hf of halves) {
      hf.pivot.scale.x = 1 - 0.86 * k;
      hf.pivot.rotation.y = hf.rot + (hf.rot < 0 ? 0.7 : -0.7) * k;
    }
  };
  if (t >= 1) {
    col.enabled = false;
    apply(1);
  }
  L.interact({
    pos: [x, 1.3, 24.5],
    radius: 2.1,
    ignore: [col],
    noLOS: true,
    prompt: 'Push against the membrane',
    enabled: () => t < 0,
    onUse: (g) => g.hud.say('It stretches like warm skin, then snaps back. Too tough to tear by hand.', 3.5),
  });
  L.onUpdate((dt, time, g) => {
    if (t < 0) {
      const p = g.lights.pulse || 0;
      for (const hf of halves) hf.pivot.scale.z = 1 + 0.6 * p;
      return;
    }
    if (t >= 1) return;
    t = Math.min(1, t + dt * 1.3);
    apply(t * t * (3 - 2 * t));
  });
  return (g) => {
    if (t >= 0) return;
    t = 0;
    col.enabled = false;
    L.level.markNavDirty();
    const p = new THREE.Vector3(x, 1.6, 24.5);
    g.audio.play('squelch', { pos: p, gain: 1.4 });
    g.audio.play('crack', { pos: p });
    g.particles.impact(p, { x: 1, y: 0.2, z: 0 }, 'blood', 30);
  };
}

// ---------- Story beats ----------
export function beats(L, flood) {
  L.onEnter((g, spawn) => {
    if (flood) {
      g.hud.say('The heart is flooding the caves. Get her back to the crawlspace, the way you came.', 5);
      return;
    }
    if ((spawn === 'fromCistern' || spawn === 'start') && !g.flags.has('caves.intro')) {
      g.setFlag('caves.intro');
      g.hud.say('The skulls end here. Past them the walls are soft, and warm, and breathing.', 5);
    }
  });
  if (flood) return;
  L.trigger({ min: [-4.3, -2, 3.2], max: [-1.7, 2, 5.6], once: true, onEnter: (g) => g.hud.say('Blood, knee-deep and warm.', 3) });
  L.trigger({ min: [-13, -1, 17], max: [-10, 3, 19.5], once: true, onEnter: (g) => g.hud.say('Pods, dozens of them, each lit from inside. Something is curled up in every one.', 5) });
}
