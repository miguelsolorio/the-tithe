import * as THREE from 'three';
import { tunnelFit, channelSteps, ribs, rubble, wallLantern, debris, vaultHole, culvert, M } from './geo.js';
import { R, BED, WATER, vaultOf } from './layout.js';

// The vaulted drainage tunnels: walkways either side of a teal channel, arch
// ribs, pipes, outfalls and lanterns; plus the collapsed, flooded stretch
// between the pump room and the baptism pool.

const lanternPos = (p) => {
  const s = p?.userData?.sources?.[0];
  return s ? [s.pos.x, s.pos.y, s.pos.z] : null;
};

export function buildTunnels(L, fx, rng) {
  const out = {};
  out.east = eastTunnel(L, fx, rng);
  out.north = northTunnel(L, fx, rng);
  out.west = westTunnel(L, fx, rng);
  out.collapse = collapsedTunnel(L, fx, rng);
  return out;
}

function eastTunnel(L, fx, rng) {
  const { top, rise } = vaultOf('E');
  const t = { axis: 'x', ...R.east, bed: BED, water: WATER, top, rise };
  const f = tunnelFit(L, t);
  channelSteps(L, f, 34, 1);
  channelSteps(L, f, 41.2, 0);
  ribs(L, t, [31.4, 36.2, 40.2]);
  const l1 = wallLantern(L, 33.8, 30.1, 's');
  const l2 = wallLantern(L, 43.0, 35.9, 'n');
  // Rising main along the north wall, a smaller pipe to the south.
  L.prop('pipe', 37, 30.44, { y: 2.55, args: { length: 15.6, radius: 0.1 }, collider: 'none' });
  L.prop('pipe', 36.5, 35.62, { y: 2.3, args: { length: 13, radius: 0.055 }, collider: 'none' });
  // An outfall pipe over the south walkway pours into the channel.
  L.prop('pipe', 38.6, 35.0, { y: 2.35, rotY: Math.PI / 2, args: { length: 1.9, radius: 0.13 }, collider: 'none' });
  fx.stream(38.6, 34.1, 2.3, WATER, { w: 0.24, foam: 0.55 });
  L.loopSound('waterFlow', [38.6, 0.5, 34], { radius: 14, gain: 0.8 });
  fx.caustics(t, f.c0, f.c1, [lanternPos(l1), lanternPos(l2), [38.6, 0, 34]].filter(Boolean));
  debris(L, rng, 30.5, 32, 44, 34, WATER, 4);
  // Drag marks where something hauled itself out of the water.
  L.decal('claws', [39.3, 0, 31.2], { face: 'up', size: [0.9, 0.9], rot: 1.4 });
  L.decal('bloodSmear', [39.7, 0, 31.0], { face: 'up', size: [0.7, 1.6], rot: Math.PI / 2 });
  L.decal('grime', [31, 0, 35.2], { face: 'up', size: 2.2 });
  L.decal('grime', [42, 0, 30.8], { face: 'up', size: 2.4 });
  L.decal('grime', [36, 1.2, 35.89], { face: 'n', size: [3, 2.4] });
  L.prop('skull', 36.6, 35.3, { rotY: 2.2 });
  L.prop('bonesPile', 44.9, 35.0, { args: { radius: 0.45, count: 8 } });
  L.sound('gurgle', [37, -0.3, 33], { interval: [12, 28], radius: 18, gain: 0.7 });
  L.sound('drip', [33, 3.5, 33], { interval: [2, 5], radius: 14 });
  L.sound('drip', [42, 3.5, 33], { interval: [3, 7], radius: 14 });
  return f;
}

function northTunnel(L, fx, rng) {
  const { top, rise } = vaultOf('N');
  const t = { axis: 'z', ...R.north, bed: BED, water: WATER, top, rise };
  const f = tunnelFit(L, t);
  channelSteps(L, f, 24.6, 0);
  ribs(L, t, [21.3, 25.9]);
  const l1 = wallLantern(L, 52.9, 23.6, 'w');
  L.prop('pipe', 47.42, 23.5, { y: 2.6, rotY: Math.PI / 2, args: { length: 10, radius: 0.1 }, collider: 'none' });
  // Butchery: hooks over the channel, one still loaded.
  L.prop('meatHook', 49.6, 20.8, { y: 4.25, args: { length: 1.5, meat: true }, collider: 'none' });
  L.prop('meatHook', 50.7, 22.4, { y: 4.3, args: { length: 1.9 }, collider: 'none' });
  L.prop('chainHanging', 49.4, 26.8, { y: 4.25, args: { length: 2.2 }, collider: 'none' });
  L.decal('bloodDrip', [50, -0.38, 20.8], { face: 'up', size: 0.8 });
  // Outfall from the east wall.
  L.prop('pipe', 52.2, 20.4, { y: 2.4, args: { length: 1.7, radius: 0.12 }, collider: 'none' });
  fx.stream(51.35, 20.4, 2.35, WATER, { w: 0.22, foam: 0.5 });
  L.loopSound('waterFlow', [51.3, 0.5, 20.4], { radius: 13, gain: 0.7 });
  fx.caustics(t, f.c0, f.c1, [lanternPos(l1), [51.3, 0, 20.4]].filter(Boolean));
  debris(L, rng, 49, 21, 51, 27, WATER, 3);
  L.decal('grime', [48, 0, 22], { face: 'up', size: 2 });
  L.decal('claws', [48.4, 0, 26.2], { face: 'up', size: 0.8, rot: 0.2 });
  L.sound('gurgle', [50, -0.3, 24], { interval: [14, 30], radius: 16, gain: 0.6 });
  L.sound('drip', [50, 3.6, 22], { interval: [2, 6], radius: 14 });
  return f;
}

function westTunnel(L, fx, rng) {
  const { top, rise } = vaultOf('W');
  const t = { axis: 'z', ...R.west, bed: BED, water: WATER, top, rise };
  const f = tunnelFit(L, t);
  channelSteps(L, f, 25.3, 1);
  ribs(L, t, [24.2]);
  const l1 = wallLantern(L, 21.1, 26.2, 'e');
  // A crack in the crown weeps a thin thread of water.
  fx.stream(24.4, 23.6, top + rise - 0.05, WATER, { w: 0.05, foam: 0.25, splash: false });
  L.sound('drip', [24.4, 2, 23.6], { interval: [1.2, 3], radius: 12 });
  culvert(L, { x: 24, y: -0.56, z: 22.5, face: 's', r: 0.36 });
  fx.caustics(t, f.c0, f.c1, [lanternPos(l1)].filter(Boolean), { strength: 0.8 });
  debris(L, rng, 23, 23.2, 25, 27, WATER, 2);
  L.prop('bonesPile', 22.2, 28.3, { args: { radius: 0.5, count: 10, skulls: 1 } });
  L.decal('bloodSmear', [25.9, 0, 23.4], { face: 'up', size: [0.8, 2], rot: 0.1 });
  L.decal('handprint', [26.89, 1.1, 24.6], { face: 'w', size: 0.32 });
  L.decal('handprint', [26.89, 0.9, 25.1], { face: 'w', size: 0.3 });
  L.sound('gurgle', [24, -0.3, 25], { interval: [15, 30], radius: 14, gain: 0.6 });
  return f;
}

// Half the vault has come down; the walkway broke with it and the water here
// is chest deep. Stepping stones of fallen masonry lead across.
function collapsedTunnel(L, fx, rng) {
  const { top, rise } = vaultOf('C');
  const r = R.collapse;
  const bed = -1.5;
  const wy = -0.3;
  const t = { axis: 'x', ...r, top, rise, foot: bed };
  const mat = 'stoneWet';
  // Landings at both doors with steps down into the water.
  L.box([r.x0, bed, r.z0], [33.5, 0, r.z1], mat);
  L.box([42.5, bed, r.z0], [r.x1, 0, r.z1], mat);
  for (let k = 1; k <= 3; k++) {
    const y = -0.375 * k;
    L.box([33.5 + (k - 1) * 0.55, bed, 10.8], [33.5 + k * 0.55, y, 12.8], 'stone');
    L.box([42.5 - k * 0.55, bed, 10.8], [42.5 - (k - 1) * 0.55, y, 12.8], 'stone');
  }
  // What is left of the north walkway, and the fallen blocks in the gap.
  L.box([33.5, bed, r.z0], [36.2, 0, 10.5], mat);
  L.box([39.4, bed, r.z0], [42.5, 0, 10.5], mat);
  L.box([36.2, bed, 9.1], [37.4, -0.95, 10.45], 'stone');
  L.box([37.4, bed, 9.15], [38.7, -0.85, 10.5], 'stone');
  L.box([38.7, bed, 9.1], [39.4, -0.45, 10.45], 'stone');
  L.box([33.5, -0.16, 10.45], [36.25, 0.025, 10.78], 'stone', { collide: false });
  L.box([39.35, -0.16, 10.45], [42.5, 0.025, 10.78], 'stone', { collide: false });
  rubble(L, rng, { x: 37.4, z: 9.8, y: -0.95, r: 0.9, n: 7, h: 0.2, bricks: 6 });
  rubble(L, rng, { x: 36.4, z: 10.2, y: -0.1, r: 0.35, n: 4, h: 0.1, bricks: 3 });
  // The fall: a mound of vault brick under the hole, and the hole itself.
  L.collider([38.5, bed, 12.9], [41.3, 0.2, 14.9], { walkable: false });
  rubble(L, rng, { x: 39.9, z: 13.9, y: -0.35, r: 1.6, n: 26, h: 0.75, mat: 'brick', bricks: 18, sz: 0.75 });
  rubble(L, rng, { x: 40.2, z: 14.3, y: -0.2, r: 1.0, n: 10, h: 0.6, mat: 'stone', bricks: 6 });
  const hole = vaultHole(L, t, 39.2, Math.PI * 0.36, 1.05, rng);
  for (let k = 0; k < 7; k++) {
    const len = rng.range(0.6, 2.0);
    const g = new THREE.CylinderGeometry(0.012, 0.025, len, 5);
    g.rotateZ(rng.range(-0.25, 0.25));
    g.translate(hole[0] + rng.range(-0.8, 0.8), hole[1] - len / 2 - 0.05, hole[2] + rng.range(-0.4, 0.3));
    L.batcher.add(g, M('woodRotten'));
  }
  fx.stream(38.4, 13.0, hole[1] - 0.1, wy, { w: 0.5, foam: 0.9 });
  L.loopSound('waterFlow', [38.4, 1, 13], { radius: 16, gain: 0.9 });
  L.loopSound('dripping', [36, 2, 11], { radius: 12, gain: 0.6 });
  ribs(L, t, [35.4], { pilasters: true });
  ribs(L, t, [41.8], { pilasters: true });
  L.water({ min: [33.5, r.z0], max: [42.5, r.z1], y: wy, color: 'deep', opacity: 0.88 });
  const lamp = L.prop('lantern', 34.5, 9.55, {});
  L.prop('lanternAmber', 37.1, 9.7, { y: -0.95, fallen: 'side', lights: false, collider: 'none' });
  fx.caustics(t, 33.5, 42.5, [lanternPos(lamp), [38.4, 0.5, 13]].filter(Boolean), { strength: 0.9 });
  debris(L, rng, 34.5, 11, 42, 14, wy, 6);
  L.prop('barrelRusted', 41.6, 11.2, { y: wy - 0.55, rotY: 0.6, fallen: 'side', collider: 'none' });
  L.prop('barrel', 35.2, 13.8, { y: wy - 0.45, rotY: 1.2, collider: 'none' });
  L.decal('grime', [33, 0, 12], { face: 'up', size: 2.2 });
  L.decal('grime', [43.2, 0, 11.5], { face: 'up', size: 2 });
  L.sound('drip', [38, 3.5, 12], { interval: [1.5, 4], radius: 14 });
  L.sound('gurgle', [37, -0.3, 13], { interval: [10, 22], radius: 14, gain: 0.8 });
  return { bed, water: wy };
}
