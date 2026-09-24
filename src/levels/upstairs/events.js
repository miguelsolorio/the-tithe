import * as THREE from 'three';
import { ATTIC } from './common.js';
import { LADDER_FOOT } from './hatch.js';

// Enemies, scripted moments and ambience for the upstairs level.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HATCH_SPAWN = [LADDER_FOOT[0] - 0.35, 0, -1.6];
const SHEET_SPAWN = [51.9, ATTIC.y, -1.95];
const LADDER_SPAWN = [44.2, ATTIC.y, 0.95];
const HOUND_SPAWN = [-18.0, 0, -1.0];

export function setupEvents(U, { bulbs, hatch, attic }) {
  const { L, game } = U;
  const has = (f) => game.flags.has(f);
  const alive = (id) => !has(`killed:${id}`);

  // Small scheduler that only runs while this level is live.
  const queue = [];
  const later = (sec, fn) => queue.push({ t: sec, fn });
  L.onUpdate((dt, t, g) => {
    for (let i = queue.length - 1; i >= 0; i--) {
      queue[i].t -= dt;
      if (queue[i].t <= 0) queue.splice(i, 1)[0].fn(g);
    }
  });
  const spawn = (g, id, pos, yaw, extra = {}) => {
    if (!alive(id) || L.level.enemies.some((e) => e.id === id)) return null;
    return g.enemies.create(L.level, { type: extra.type || 'acolyte', id, pos: V(...pos), yaw, idle: 'stand', ...extra });
  };

  // ---------- Static enemies ----------
  // Two at prayer before the altar; one walking the east end of the hall.
  L.enemy('acolyte', [-0.95, 0, -10.9], { id: 'u_ac_pray1', yaw: 0, idle: 'pray' });
  L.enemy('acolyte', [1.45, 0, -10.9], { id: 'u_ac_pray2', yaw: 0.1, idle: 'pray' });
  L.enemy('acolyte', [21.0, 0, -1.0], { id: 'u_ac_patrol', yaw: Math.PI / 2, idle: 'patrol', patrol: [[14.6, -1.0], [21.0, -1.0]], cfg: { sightRange: 10 } });
  // Rebuilt after a checkpoint: whoever was already loose is still loose.
  if (has('took:revolver')) L.enemy('acolyte', HATCH_SPAWN, { id: 'u_ac_hatch', yaw: Math.PI / 2, idle: 'wander', wanderRadius: 5 });
  if (has('took:fuse')) {
    L.enemy('acolyte', SHEET_SPAWN, { id: 'u_ac_sheet', yaw: -Math.PI / 2, idle: 'wander', wanderRadius: 3 });
    L.enemy('acolyte', LADDER_SPAWN, { id: 'u_ac_ladder', yaw: -Math.PI / 2, idle: 'wander', wanderRadius: 3 });
  }

  // ---------- Failing power ----------
  for (const s of bulbs) {
    const f = s.onFlicker;
    if (f) s.onFlicker = (v) => f(s.enabled ? v : 0.02);
  }
  const blackout = (g, sec) => {
    for (const s of bulbs) s.enabled = false;
    later(sec, () => {
      for (const s of bulbs) s.enabled = true;
    });
  };

  // ---------- Revolver: the hatch bangs open and something climbs down ----------
  const onRevolver = (g) => {
    later(1.6, (g2) => {
      hatch.open();
      g2.audio.play('doorSlam', { pos: V(22, 2.8, -1) });
      g2.audio.play('creak', { pos: V(22, 2.4, -1) });
      blackout(g2, 0.7);
      if (g2.player.position.x < 0) g2.hud.say('Far down the hall, something heavy drops open with a bang.', 3.5);
      else g2.hud.say('The attic hatch bangs open. The ladder unfolds on its own.', 3.5);
    });
    later(3.4, (g2) => g2.audio.play('creak', { pos: V(21.6, 1.8, -1), gain: 0.9 }));
    later(4.6, (g2) => {
      const e = spawn(g2, 'u_ac_hatch', HATCH_SPAWN, Math.PI / 2);
      e?.alert(g2.player.position);
    });
  };

  // ---------- The fuse: ambush in the attic ----------
  if (has('took:fuse')) {
    if (attic.sheet) attic.sheet.visible = false;
    if (attic.heap) attic.heap.visible = true;
    attic.sheetCol.enabled = false;
  }
  const onFuse = (g) => {
    later(1.1, (g2) => {
      if (attic.sheet) attic.sheet.visible = false;
      if (attic.heap) attic.heap.visible = true;
      attic.sheetCol.enabled = false;
      L.level.markNavDirty();
      g2.audio.play('screech', { pos: V(...SHEET_SPAWN).setY(ATTIC.y + 1) });
      attic.nestLight.intensity = 0.45;
      attic.nestLight.flicker = 0.9;
      const e = spawn(g2, 'u_ac_sheet', SHEET_SPAWN, -Math.PI / 2);
      e?.alert(g2.player.position);
    });
    later(2.3, (g2) => g2.audio.play('creak', { pos: V(43.2, ATTIC.y, 0) }));
    later(3.0, (g2) => {
      const e = spawn(g2, 'u_ac_ladder', LADDER_SPAWN, -Math.PI / 2);
      e?.alert(g2.player.position);
      g2.hud.say('Someone is coming up the ladder.', 2.5);
    });
  };
  L.pickup({
    id: 'fuse',
    kind: 'item',
    item: 'fuse',
    pos: [60.3, attic.fuseTop + 0.01, 0],
    rotY: 0.4,
    prompt: 'Take the fuse',
    message: 'A ceramic fuse, marked BASEMENT.',
    onTake: onFuse,
  });

  // ---------- Late: a hound in the hall once you have the fuse ----------
  let houndOut = false;
  L.onUpdate((dt, t, g) => {
    if (houndOut || !has('took:fuse') || !alive('u_hound')) return;
    const p = g.player.position;
    if (p.x > 30 || p.y > 1.5) return;
    if (Math.hypot(p.x - HOUND_SPAWN[0], p.z - HOUND_SPAWN[2]) < 14) return;
    houndOut = true;
    spawn(g, 'u_hound', HOUND_SPAWN, -Math.PI / 2, { type: 'hound', idle: 'patrol', patrol: [[-3.5, -1.0], [-18.0, -1.0]] });
    g.audio.play('snarl', { pos: V(-17, 0.6, -1), gain: 0.8 });
    later(1.2, (g2) => g2.hud.say('Claws on floorboards, somewhere down the hall. Sniffing.', 3.5));
  });

  // ---------- Ambience ----------
  const chant = L.loopSound('chantLoop', [0.25, 1.4, -9.8], { radius: 15, gain: 0.35 });
  let chantOn = true;
  L.onUpdate(() => {
    if (!chantOn) return;
    const pray = L.level.enemies.filter((e) => e.id === 'u_ac_pray1' || e.id === 'u_ac_pray2');
    if (pray.some((e) => !e.dead && e.state === 'pray')) return;
    chantOn = false;
    chant.handle?.stop(1.5);
    chant.handle = null;
    const i = L.level.loopSpecs.indexOf(chant);
    if (i >= 0) L.level.loopSpecs.splice(i, 1);
  });
  L.sound('creak', [-8, 3.0, -1], { interval: [16, 38], radius: 30 });
  L.sound('creak', [14, 3.0, -1], { interval: [18, 42], radius: 30 });
  L.sound('bell', [0, 8, -40], { interval: [40, 80], radius: 90, gain: 0.3 });

  // First steps into the east half of the hall: the power dips.
  L.trigger({ min: [7.5, -1, -2], max: [9, 3, 0], once: true, onEnter: (g) => {
    if (has('u.dip')) return;
    g.setFlag('u.dip');
    blackout(g, 2.2);
    g.audio.play('creak', { pos: V(10, 2.8, -1) });
  } });

  // Arrival and attic lines.
  L.onEnter((g, sp) => {
    if (!has('u.arrived')) {
      g.setFlag('u.arrived');
      later(2.2, (g2) => g2.hud.say('Chanting, low and steady, behind the double doors.', 4));
      later(6.8, (g2) => g2.hud.say('The bulbs up here buzz and stutter. The power is dying.', 4));
    }
  });
  let inAttic = false;
  const base = { sky: new THREE.Color(), ground: new THREE.Color(), fog: new THREE.Color() };
  const cold = { sky: new THREE.Color(0x1c2530), fog: new THREE.Color(0x05070a) };
  L.onEnter((g) => {
    base.sky.copy(g.hemi.color);
    base.ground.copy(g.hemi.groundColor);
    base.fog.copy(g.scene.fog.color);
  });
  let k = 0;
  L.onUpdate((dt, t, g) => {
    const want = g.player.position.x > 36 ? 1 : 0;
    if (want && !inAttic && !has('u.attic')) {
      g.setFlag('u.attic');
      later(0.8, (g2) => g2.hud.say('Rafters and dust sheets, and the smell of people sleeping. Moonlight at the far end.', 4.5));
    }
    inAttic = !!want;
    const nk = k + (want - k) * Math.min(1, dt * 2);
    if (Math.abs(nk - k) < 1e-4 && (k === 0 || k === 1)) return;
    k = Math.abs(nk - want) < 0.002 ? want : nk;
    g.hemi.color.lerpColors(base.sky, cold.sky, k);
    g.scene.fog.color.lerpColors(base.fog, cold.fog, k);
    g.scene.background.copy(g.scene.fog.color);
  });

  return { onRevolver };
}
