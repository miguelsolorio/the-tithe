import * as THREE from 'three';
import { rubble, culvert, wallLantern, ribs, M } from './geo.js';
import { paint } from './fx.js';
import { R, vaultOf } from './layout.js';

// The ladder shaft and the rooms off the tunnels: the junction by the sluice,
// the hound junction and its drain alcove, the pump room and the sluice run.

const _box = new THREE.Box3();
const topOf = (obj) => _box.setFromObject(obj).max.y;

// Round iron drain cover set into the floor.
function drainCover(L, x, z, r = 0.55) {
  const hole = new THREE.CircleGeometry(r, 20);
  hole.rotateX(-Math.PI / 2);
  hole.translate(x, 0.004, z);
  L.batcher.add(hole, M('black'), { worldUV: false, cast: false });
  const ring = new THREE.TorusGeometry(r, 0.045, 5, 24);
  ring.rotateX(Math.PI / 2);
  ring.translate(x, 0.01, z);
  L.batcher.add(ring, M('rust'));
  for (let k = -3; k <= 3; k++) {
    const len = 2 * Math.sqrt(Math.max(0, r * r - (k * r * 0.26) ** 2));
    const g = new THREE.BoxGeometry(len, 0.03, 0.035);
    g.translate(x, 0.018, z + k * r * 0.26);
    L.batcher.add(g, M('rust'));
  }
}

export function buildRooms(L, fx, rng, game) {
  shaft(L, fx, game);
  ladderRoom(L, rng);
  junction(L, rng);
  houndJunction(L, rng);
  const drainTop = drainAlcove(L, fx);
  const pump = pumpRoom(L, fx, rng);
  sluiceRun(L, rng);
  return { drainTop, benchTop: pump.benchTop };
}

// The shaft down from the basement grate.
function shaft(L, fx, game) {
  const r = R.shaft;
  L.prop('ladder', 12.1, 33.5, { face: 'e', args: { height: 7.45 } });
  // Cap at the top with the grate hole over the ladder.
  const y = 7.5;
  L.box([r.x0, y, r.z0], [r.x1, y + 0.3, 32.9], 'brick', { walkable: false });
  L.box([r.x0, y, 34.1], [r.x1, y + 0.3, r.z1], 'brick', { walkable: false });
  L.box([13.3, y, 32.9], [r.x1, y + 0.3, 34.1], 'brick', { walkable: false });
  // The short neck above, up into the basement floor.
  L.box([11.9, y + 0.3, 32.7], [12.1, 9.2, 34.3], 'brick', { collide: false });
  L.box([13.3, y + 0.3, 32.7], [13.5, 9.2, 34.3], 'brick', { collide: false });
  L.box([12.1, y + 0.3, 32.7], [13.3, 9.2, 32.9], 'brick', { collide: false });
  L.box([12.1, y + 0.3, 34.1], [13.3, 9.2, 34.3], 'brick', { collide: false });
  L.box([11.9, 9.2, 32.7], [13.5, 9.4, 34.3], 'concrete', { collide: false });
  const grate = L.prop('grate', 12.7, 33.5, { y, face: 'e', dynamic: true, collider: 'none' });
  if (grate.userData.bars) grate.userData.bars.rotation.x = game.flags.has('grate.open') ? -1.75 : 0;
  // Light spilling down from the flooded basement.
  L.light({ pos: [12.8, 8.7, 33.5], color: 0x86aaa4, intensity: 1.2, distance: 9.5, flicker: 0.06, kind: 'lantern' });
  fx.stream(13.15, 33.1, 7.45, 0, { w: 0.04, foam: 0.3, splash: false });
  L.loopSound('dripping', [12.8, 2, 33.5], { radius: 10, gain: 0.6 });
  L.decal('grime', [13.9, 5.0, 33.5], { face: 'w', size: [2.4, 4] });
  L.decal('grime', [13, 0, 33.4], { face: 'up', size: 1.4 });
}

function ladderRoom(L, rng) {
  const { top, rise } = vaultOf('S');
  L.prop('hangingLantern', 17.2, 33.5, { y: top + rise - 0.02, args: { drop: 1.3 }, collider: 'none' });
  L.prop('crateStack', 18.6, 35.2, { rotY: 0.15 });
  L.prop('barrel', 15.0, 31.6, {});
  L.prop('barrelRusted', 15.8, 31.5, { rotY: 1 });
  L.prop('lanternAmber', 16.4, 35.4, { fallen: 'side', lights: false, collider: 'none' });
  L.prop('chainHanging', 15.4, 34.6, { y: top + 1.06, args: { length: 1.6 }, collider: 'none' });
  // Someone waited here, counting.
  paint(L, 'THEY WAIT UNDER THE WATER', [17, 1.75, 31.1], 's', { width: 3.2, height: 0.5, size: 92, seed: 3 });
  paint(L, '|||| |||| |||| |||| |||', [17.2, 1.05, 31.1], 's', { width: 2.2, height: 0.3, size: 80, seed: 9, color: '40,30,26' });
  L.decal('grime', [17, 0, 33.4], { face: 'up', size: 2.6 });
  L.decal('footprints', [18.5, 0, 33.6], { face: 'up', size: [0.6, 2.6], rot: Math.PI / 2 });
  rubble(L, rng, { x: 14.6, z: 35.4, r: 0.4, n: 4, h: 0.15, bricks: 4 });
  L.sound('drip', [16.5, 3, 33.5], { interval: [2.5, 6], radius: 12 });
}

function junction(L, rng) {
  const { top, rise } = vaultOf('X');
  const lamp = L.prop('hangingLantern', 24, 33, { y: top + rise - 0.02, args: { drop: 1.7 }, collider: 'none' });
  for (const s of lamp.userData.sources || []) s.flicker = 0.18;
  drainCover(L, 24, 33, 0.6);
  L.loopSound('dripping', [24, 0.3, 33], { radius: 9, gain: 0.5 });
  L.prop('barrelRusted', 20.7, 29.7, {});
  L.prop('crateStack', 27.2, 36.2, { rotY: 0.3 });
  L.prop('bonesPile', 21.0, 29.8, { args: { radius: 0.4, count: 7, skulls: 1 } });
  L.decal('grime', [22, 0, 31], { face: 'up', size: 3 });
  L.decal('grime', [26, 0, 35], { face: 'up', size: 2.5 });
  L.decal('footprints', [24.6, 0, 33.8], { face: 'up', size: [0.6, 3.4], rot: Math.PI / 2 + 0.1 });
  L.decal('claws', [22.6, 0, 29.6], { face: 'up', size: 0.8, rot: 0.3 });
  paint(L, 'KEEP IT STILL', [21.0, 2.25, 36.89], 'n', { width: 1.7, height: 0.45, size: 108, seed: 12 });
  L.decal('bloodDrip', [21.0, 1.8, 36.88], { face: 'n', size: [0.9, 1.1] });
  rubble(L, rng, { x: 27.3, z: 29.8, r: 0.45, n: 4, h: 0.15, bricks: 5 });
}

function houndJunction(L, rng) {
  const { top, rise } = vaultOf('B');
  const lamp = L.prop('hangingLantern', 50, 33, { y: top + rise - 0.02, args: { drop: 1.6 }, collider: 'none' });
  for (const s of lamp.userData.sources || []) s.flicker = 0.45;
  ribs(L, { axis: 'x', ...R.hounds, top, rise }, [47.1, 52.9]);
  // Something was eaten here.
  L.prop('bonesPile', 51.4, 35.2, { args: { radius: 0.7, count: 16, skulls: 1 } });
  L.decal('bloodPool', [51.3, 0, 35.0], { face: 'up', size: 1.8 });
  L.decal('bloodSmear', [50.5, 0, 36.2], { face: 'up', size: [0.9, 2.2], rot: 0.1 });
  L.decal('claws', [53.89, 1.0, 31.5], { face: 'w', size: [0.8, 0.9] });
  L.decal('claws', [46.3, 0, 33.6], { face: 'up', size: 0.9, rot: 2 });
  L.decal('bloodSplat', [48.2, 0, 30.4], { face: 'up', size: 1.1 });
  L.prop('crateStack', 47.0, 30.1, { rotY: 0.2 });
  L.prop('barrelRusted', 53.2, 29.8, { fallen: 'side', rotY: 0.8 });
  L.prop('barrel', 53.1, 36.2, {});
  L.decal('grime', [50, 0, 31], { face: 'up', size: 3.2 });
  rubble(L, rng, { x: 46.6, z: 36.3, r: 0.4, n: 4, h: 0.15, bricks: 4 });
}

// Dead end behind the hound junction: someone camped here and did not leave.
function drainAlcove(L, fx) {
  const r = R.drain;
  culvert(L, { x: 50, y: 0.2, z: r.z1 - 0.1, face: 'n', r: 0.55 });
  fx.stream(50, 41.55, 0.35, 0.0, { w: 0.6, foam: 0.5, splash: false });
  L.loopSound('waterFlow', [50, 0.4, 41.4], { radius: 10, gain: 0.6 });
  drainCover(L, 50, 40.4, 0.45);
  const crate = L.prop('crate', 48.7, 38.2, { rotY: 0.25 });
  const ct = topOf(crate);
  L.prop('candle', 48.55, 38.05, { y: ct, args: { h: 0.06 } });
  L.box([51.0, 0, 37.5], [51.75, 0.12, 39.4], 'cloth', { collide: false });
  L.prop('bonesPile', 51.2, 40.6, { args: { radius: 0.55, count: 14, skulls: 1 } });
  L.prop('lanternAmber', 51.5, 38.0, { fallen: 'side', lights: false, collider: 'none' });
  L.decal('bloodPool', [51.2, 0, 40.4], { face: 'up', size: 1.4 });
  L.decal('handprint', [51.89, 0.8, 40.2], { face: 'w', size: 0.34 });
  return ct;
}

function pumpRoom(L, fx, rng) {
  const { top, rise } = vaultOf('M');
  const pumps = [47.2, 52.6];
  for (const x of pumps) L.prop('pumpMachine', x, 7.2, { face: 's', args: { ceiling: 4.9 } });
  L.prop('boiler', 54.6, 16.4, { face: 'w', args: { ceiling: 5.0 } });
  L.prop('metalShelves', 55.5, 9.6, { face: 'w' });
  L.prop('metalShelves', 55.5, 11.0, { face: 'w' });
  const bench = L.prop('workbench', 45.9, 17.3, { face: 'n' });
  L.prop('crateStack', 55.0, 7.0, { rotY: 0.1 });
  L.prop('barrelRusted', 44.7, 7.0, {});
  L.prop('barrelRusted', 45.5, 6.8, { rotY: 1.3 });
  L.prop('barrel', 44.8, 15.6, {});
  // Rising main and valves overhead.
  L.prop('pipe', 50, 6.45, { y: 3.75, args: { length: 11, radius: 0.16 }, collider: 'none' });
  L.prop('pipe', 50, 6.5, { y: 3.42, args: { length: 11, radius: 0.08 }, collider: 'none' });
  L.prop('pipe', 55.55, 12, { y: 3.1, rotY: Math.PI / 2, args: { length: 11, radius: 0.1 }, collider: 'none' });
  // A burst flange sprays a thin sheet onto the floor.
  fx.stream(45.6, 6.95, 3.3, 0.0, { w: 0.12, foam: 0.45 });
  L.loopSound('waterFlow', [45.6, 1.5, 7], { radius: 10, gain: 0.5 });
  L.decal('grime', [45.8, 0, 8], { face: 'up', size: 2 });
  // Warm light: someone works here.
  L.prop('hangingLantern', 50, 12, { y: top + rise - 0.02, args: { drop: 2.3, color: 'amber' }, collider: 'none' });
  const cage = L.prop('hangingCage', 53.2, 13.2, { y: 5.36, args: { drop: 1.4 }, collider: 'none' });
  cage.rotation.y = 0.4;
  paint(L, 'THE PUMPS STAY OFF', [50, 2.55, 6.1], 's', { width: 3.4, height: 0.5, size: 96, seed: 21 });
  L.decal('bloodSmear', [51, 0, 12.6], { face: 'up', size: [1, 2.6], rot: 0.6 });
  L.decal('grime', [50, 0, 14], { face: 'up', size: 3.5 });
  L.sound('creak', [50, 3.5, 7], { interval: [18, 38], radius: 30, gain: 0.45 });
  L.sound('drip', [52, 3.5, 13], { interval: [2.5, 6], radius: 12 });
  rubble(L, rng, { x: 55.3, z: 15.0, r: 0.35, n: 3, h: 0.1, bricks: 5 });
  return { benchTop: topOf(bench) };
}

// Beyond the sluice gate: the held-back run down to the ossuary.
function sluiceRun(L, rng) {
  const { top, rise } = vaultOf('G');
  ribs(L, { axis: 'z', ...R.sluice, top, rise }, [41.6]);
  L.prop('lantern', 25.4, 43.9, {});
  L.prop('skullPile', 22.55, 44.35, { args: { count: 10 } });
  L.prop('skullPile', 25.45, 44.4, { args: { count: 8 } });
  L.prop('bonesPile', 23.4, 40.6, { args: { radius: 0.6, count: 12, skulls: 2 } });
  L.prop('bonesPile', 24.8, 42.6, { args: { radius: 0.5, count: 10, skulls: 1 } });
  L.decal('bloodSmear', [24, 0, 43.4], { face: 'up', size: [0.9, 2.4], rot: 0 });
  L.decal('handprint', [22.11, 0.5, 44.2], { face: 'e', size: 0.3 });
  L.decal('handprint', [25.89, 0.62, 43.9], { face: 'w', size: 0.3 });
  L.decal('grime', [24, 0, 39.5], { face: 'up', size: 3 });
  L.decal('grime', [22.11, 1.1, 41], { face: 'e', size: [3, 2.2] });
  L.decal('grime', [25.89, 1.1, 40], { face: 'w', size: [3, 2.2] });
  rubble(L, rng, { x: 25.5, z: 39.2, r: 0.35, n: 3, h: 0.1, bricks: 4 });
  L.sound('drip', [24, 3, 41], { interval: [2, 5], radius: 12 });
}
