import * as THREE from 'three';
import { makeProp } from '../../world/props/index.js';
import { floorTop, wallPoint, POOL_Y, BLOOD_Y } from './layout.js';
import { rampSurface, mound, membrane } from './meshes.js';

// Set dressing, part 2: vein corridor, maw gauntlet, blood pool and its
// ramps, the womb and the return tunnel. D comes from makeDress().

// ---------- Vein-webbed corridor ----------
export function dressVeins(L, D) {
  // A web of veins sagging across the corridor overhead.
  let k = 0;
  for (let x = 8.3; x > -3.6; x -= 1.05, k++) {
    const north = x > 0.1 && x < 4.9 ? -19 : -18;
    const south = x > 4.1 && x < 6.9 ? -14 : -15;
    const dx = k % 2 ? 0.6 : -0.5;
    D.vein(wallPoint('x', north, x, 3.25 + (k % 3) * 0.15, 1), wallPoint('x', south, x + dx, 3.2 - (k % 2) * 0.2, -1), { sag: 0.65 + (k % 3) * 0.18, r: 0.045 + (k % 2) * 0.025 });
  }
  D.vein(wallPoint('x', -18, 7.6, 2.9, 1), wallPoint('x', -15, 3.1, 3.3, -1), { sag: 0.9, r: 0.04 });
  D.vein(wallPoint('x', -18, -1.2, 3.1, 1), wallPoint('x', -15, 2.8, 3.0, -1), { sag: 1.0, r: 0.04 });
  // Veins crawling along both walls.
  D.wallVein('x', -18, 1, [[8.8, 0.4], [7.0, 1.4], [5.4, 0.9]], 0.05);
  D.wallVein('x', -18, 1, [[-0.4, 2.6], [-2.0, 1.2], [-3.8, 1.8]], 0.05);
  D.wallVein('x', -19, 1, [[0.3, 2.9], [1.4, 2.2], [3.6, 2.5], [4.8, 3.1]], 0.04);
  D.wallVein('x', -15, -1, [[8.8, 1.6], [7.2, 2.4]], 0.05);
  D.wallVein('x', -15, -1, [[3.8, 0.5], [2.0, 1.5], [0.0, 1.1], [-1.8, 2.2]], 0.055);
  D.wallVein('x', -14, -1, [[4.2, 2.2], [5.6, 1.4], [6.8, 2.0]], 0.045);
  D.wallSac(wallPoint('x', -18, 7.5, 2.0, 1), 0, 1.5);
  D.wallSac(wallPoint('x', -15, -1.0, 2.2, -1), Math.PI, 0);
  D.floorSac(0.9, -18.45, 1.3);
  D.tendril(6.0, -16.5, 1.8);
  D.tendril(1.6, -16.4, 1.5);
  D.tendril(-2.3, -16.2, 1.6, 3);
  L.prop('skullPile', -1.1, -17.3, { rotY: 2.2, scale: 0.8 });
  L.prop('bonesPile', 5.6, -14.6, { args: { radius: 0.5 } });
  D.decal('bloodSplat', 2.5, -18.0, 1.3);
  D.decal('claws', 3.2, -17.2, [0.6, 0.8], 1.2);
  L.loopSound('fleshBreath', [3, 2, -16.5], { radius: 12, gain: 0.8 });
  L.sound('squelch', [-2, 1.5, -16.5], { interval: [6, 14], radius: 14 });
}

// ---------- Maw gauntlet ----------
export function dressGauntlet(L, D) {
  D.light([-3, 3.0, -7], 1.3, 8, 0.4);
  D.tendril(-3.0, -13.4, 1.4);
  D.tendril(-3.2, -5.0, 1.6);
  D.tendril(-2.8, -0.2, 1.3, 1);
  D.wallVein('z', -4, 1, [[-14.8, 2.9], [-12.4, 2.4], [-9.4, 3.1], [-5.2, 2.6], [-1.0, 3.2], [0.8, 2.5]], 0.05);
  D.wallVein('z', -4, 1, [[-14.6, 0.3], [-13.0, 0.5], [-9.6, 0.3], [-5.0, 0.5], [0.8, 0.3]], 0.04);
  D.wallVein('z', -2, -1, [[-14.8, 2.6], [-10.0, 3.0], [-6.0, 2.4], [-2.2, 3.1], [0.8, 2.8]], 0.05);
  D.wallVein('z', -2, -1, [[-14.6, 0.4], [-9.0, 0.3], [-5.2, 0.5], [0.8, 0.35]], 0.04);
  for (const z of [-12.6, -8.8, -5.4, -1.2]) D.vein(wallPoint('z', -4, z, 3.3, 1), wallPoint('z', -2, z + 0.4, 3.4, -1), { sag: 0.45, r: 0.05 });
  L.prop('bonesPile', -3.1, -9.2, { args: { radius: 0.45, skulls: 1 } });
  L.prop('bonesPile', -2.9, -4.8, { args: { radius: 0.4, skulls: 0 } });
  L.prop('skullPile', -3.25, -0.7, { rotY: 0.4, scale: 0.7 });
  for (const z of [-11, -7, -3]) D.decal('bloodSplat', -3, z, 1.1);
  D.decal('bloodSmear', -3, -13.6, [0.6, 1.8], 0.1);
  // Ramp down into the blood.
  rampSurface(L, -4, 1, -2, 5, 0, POOL_Y);
  L.ramp([-4, POOL_Y, 1], [-2, 0, 5], 'z', -1, 'fleshDark', { visible: false });
  D.wallVein('z', -4, 1, [[1.2, 1.8], [2.6, 1.0], [4.8, 0.2]], 0.05);
  D.wallVein('z', -2, -1, [[1.2, 0.8], [3.0, 1.9], [4.8, 1.2]], 0.045);
  L.sound('squelch', [-3, 2, -8], { interval: [7, 15], radius: 12 });
}

// ---------- Blood pool ----------
export function dressPool(L, D, flood) {
  if (!flood) L.water({ min: [-13.3, 1], max: [0.3, 17.1], y: BLOOD_Y, color: 0x3a0406, opacity: 0.92, flow: [0.004, 0.002] });
  // A flesh column rising out of the blood.
  const pc = D.ceil(-7.2, 8.6) ?? 5.5;
  L.prop('fleshPillar', -7.2, 8.6, { y: POOL_Y, args: { height: pc - POOL_Y + 0.4, seed: 12 } });
  // Bone island (shells on it) and glowing growths just above the surface.
  mound(L, -9.6, 6.2, POOL_Y, 0.9, 0.7, 0.85, 'fleshDark', 4);
  L.collider([-10.3, POOL_Y, 5.6], [-8.9, -0.05, 6.8], { walkable: false });
  L.prop('bonesPile', -9.6, 6.25, { y: 0.02, args: { radius: 0.4, count: 8, skulls: 1 } });
  mound(L, -1.5, 10.3, POOL_Y, 0.55, 0.6, 0.72, 'fleshDark', 7);
  D.floorSac(-1.5, 10.3, 0, -0.08);
  D.light([-1.6, 0.55, 10.2], 1.6, 7);
  mound(L, -11.2, 7.4, POOL_Y, 0.6, 0.5, 0.7, 'fleshDark', 9);
  D.floorSac(-11.2, 7.4, 0, -0.1);
  D.light([-11.0, 0.6, 7.5], 1.5, 7);
  L.prop('boneSpike', -2.1, 7.6, { y: POOL_Y, args: { height: 1.5 } });
  L.prop('boneSpike', -11.8, 9.8, { y: POOL_Y, args: { height: 1.2 } });
  L.prop('boneSpike', -5.3, 12.3, { y: POOL_Y, args: { height: 1.3 } });
  L.prop('tooth', -3.9, 12.5, { y: POOL_Y, rotY: Math.PI + 0.3, args: { height: 1.6, curl: 0.5 } });
  L.prop('tooth', -12.4, 5.9, { y: POOL_Y, rotY: 0.9, args: { height: 1.4, curl: 0.45 } });
  // Cocoons dripping over the blood; cords trailing down into it.
  D.cocoon(-8.8, 10.4, 2.1, POOL_Y);
  D.cocoon(-4.3, 10.8, 2.3, POOL_Y);
  D.cocoon(-10.9, 8.6, 2.0, POOL_Y);
  for (const [x, z] of [[-5.6, 7.2], [-3.2, 9.8], [-9.4, 9.2]]) {
    const c = D.ceil(x, z) ?? 5;
    D.vein([x, c + 0.2, z], [x + 0.6, BLOOD_Y - 0.15, z + 0.4], { sag: -0.3, r: 0.05, branches: 1 });
  }
  // Bones floating in the blood.
  L.prop('bonesPile', -6.0, 6.4, { y: BLOOD_Y - 0.06, args: { radius: 0.6, count: 10, skulls: 1 } });
  L.prop('skullPile', -3.7, 9.4, { y: BLOOD_Y - 0.14, rotY: 1.1, scale: 0.9 });
  L.prop('bonesPile', -8.8, 11.6, { y: BLOOD_Y - 0.05, args: { radius: 0.5, count: 7, skulls: 0 } });
  L.sound('drip', [-6, 4, 8], { interval: [1.2, 3.5], radius: 14 });
  L.sound('drip', [-9.5, 4, 10.5], { interval: [2, 5], radius: 12 });
  L.loopSound('fleshBreath', [-6, 1.2, 9], { radius: 12, gain: 0.7 });
  // Neck: ramp up out of the blood into the womb.
  rampSurface(L, -12, 12, -10, 17, POOL_Y, 0);
  L.ramp([-12, POOL_Y, 12], [-10, 0, 17], 'z', 1, 'fleshDark', { visible: false });
  D.wallVein('z', -12, 1, [[12.2, 0.2], [13.4, 1.6], [16.8, 2.8]], 0.05);
  D.wallVein('z', -10, -1, [[12.2, 1.9], [14.2, 0.6], [16.8, 1.4]], 0.05);
  D.tendril(-11.0, 13.2, 1.2, 1);
  D.tendril(-11.1, 16.2, 1.4);
}

// ---------- The womb ----------
export const POD_SPOTS = [
  // [x, z, height, burst id or null]
  [-15.2, 19.4, 1.4, null],
  [-21.4, 19.4, 1.5, 'v_sk_pod1'],
  [-23.8, 26.4, 1.3, null],
  [-17.6, 28.4, 1.5, 'v_sk_pod2'],
  [-13.4, 27.0, 1.3, null],
  [-24.4, 20.6, 1.2, null],
];

export function dressWomb(L, D, game) {
  const burst = game.flags.has('took:shotgun');
  const pods = [];
  for (const [x, z, h, id] of POD_SPOTS) {
    const o = L.prop('pod', x, z, { rotY: D.rng.range(0, 6.28), args: { height: h, seed: D.rng.int(1, 9999) } });
    o.userData.burstId = id;
    pods.push(o);
    if (id && burst) {
      o.userData.pulse.visible = false;
      for (const s of o.userData.sources || []) s.enabled = false;
      for (const c of o.userData.colliders || []) c.enabled = false;
    }
  }
  // Unlit pods packed around the edges (merged into the static batches).
  for (const [x, z, h] of [[-14.0, 18.2, 1.0], [-16.6, 18.0, 0.9], [-22.9, 18.3, 1.0], [-25.0, 25.6, 1.0], [-21.9, 28.3, 1.1], [-19.4, 29.1, 1.0], [-15.6, 29.0, 1.1], [-13.0, 28.0, 1.0], [-19.8, 17.3, 0.8]]) {
    const o = makeProp('pod', { height: h, seed: D.rng.int(1, 9999) });
    o.position.set(x, 0, z);
    o.rotation.y = D.rng.range(0, 6.28);
    L.mesh(o, { static: true, collider: o.userData.collider });
  }
  for (const [x, z, n] of [[-17.2, 26.5, 9], [-23.2, 22.0, 6], [-13.9, 22.4, 7], [-20.6, 27.4, 8], [-15.4, 25.8, 5], [-24.6, 24.4, 5]]) L.prop('eggCluster', x, z, { rotY: D.rng.range(0, 6.28), args: { count: n } });
  // Columns holding up the dome.
  for (const [x, z] of [[-15.6, 26.1], [-21.4, 25.8], [-19.4, 19.0]]) {
    const c = D.ceil(x, z) ?? 7;
    L.prop('fleshPillar', x, z, { args: { height: c + 0.4, seed: D.rng.int(1, 99) } });
  }
  // Membrane curtains with pods glowing through them.
  for (const [x, z, w, rot] of [[-18.7, 27.2, 2.6, 0.1], [-22.5, 27.0, 2.0, -0.55], [-22.8, 20.9, 2.0, 0.95]]) {
    const c = D.ceil(x, z) ?? 7;
    membrane(L, x, z, 0.12, w, c - 0.25, rot, D.rng.int(1, 99));
    const n = 4;
    for (let i = 0; i < n; i++) {
      const s = (i / (n - 1) - 0.5) * (w - 0.3);
      const cx = x + Math.cos(rot) * s;
      const cz = z - Math.sin(rot) * s;
      L.collider([cx - 0.28, 0, cz - 0.28], [cx + 0.28, 3.5, cz + 0.28], { walkable: false, seeThrough: true });
    }
  }
  for (const [x, z] of [[-19.7, 22.3], [-16.7, 24.0], [-22.1, 21.7]]) D.cocoon(x, z, 2.4);
  for (const [x, z, len] of [[-18.4, 23.6, 3.4], [-16.2, 21.4, 3.0], [-20.8, 24.4, 3.1], [-14.6, 23.4, 2.3], [-21.6, 22.8, 2.8], [-17.4, 26.2, 2.6], [-12.8, 21.9, 1.7], [-23.4, 23.8, 2.1]]) D.tendril(x, z, len, 3);
  // Cords from the dome down to some of the pods.
  for (const [x, z, h] of [POD_SPOTS[0], POD_SPOTS[2], POD_SPOTS[4]]) {
    const c = D.ceil(x, z) ?? 7;
    D.vein([x + 0.2, c + 0.2, z - 0.2], [x, h + 0.25, z], { sag: -0.1, r: 0.045, branches: 1 });
  }
  D.wallVein('z', -26, 1, [[21.2, 0.3], [22.0, 1.6], [21.6, 3.4]], 0.06);
  D.wallVein('z', -26, 1, [[24.8, 0.6], [24.0, 2.2], [24.6, 3.6]], 0.05);
  D.wallSac(wallPoint('z', -26, 21.6, 2.3, 1), Math.PI / 2, 1.3);
  L.prop('bloodPool', -24.7, 23.3, { args: { radius: 0.9 } });
  L.prop('bonesPile', -24.6, 21.3, { args: { radius: 0.5, skulls: 1 } });
  L.prop('skullPile', -12.3, 20.9, { rotY: -1.2, scale: 0.75 });
  D.decal('bloodSmear', -13.0, 18.8, [0.8, 2.0], 0.95);
  D.decal('bloodSmear', -16.2, 21.0, [0.8, 2.2], 0.95);
  D.decal('bloodSplat', -19.0, 22.8, 1.8);
  L.loopSound('fleshBreath', [-18, 2, 23], { radius: 16, gain: 1 });
  L.sound('squelch', [-21, 1, 20], { interval: [5, 12], radius: 18 });
  L.sound('squelch', [-15, 1, 27], { interval: [6, 13], radius: 18 });
  return pods;
}

// ---------- Return tunnel ----------
export function dressReturn(L, D) {
  // Path centre line (see layout): (-4.5, 24.5) -> (0.5, 21.5) -> (6, 17) -> (13, 10.5).
  const along = (a, b, t, side = 0) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    return [a[0] + dx * t - (dz / l) * side, a[1] + dz * t + (dx / l) * side];
  };
  const P = [[-4.5, 24.5], [0.5, 21.5], [6, 17], [13, 10.5]];
  for (const [s, t] of [[0, 0.3], [0, 0.8], [1, 0.35], [1, 0.85], [2, 0.3], [2, 0.7]]) {
    const [x0, z0] = along(P[s], P[s + 1], t, -1.9);
    const [x1, z1] = along(P[s], P[s + 1], t + 0.05, 1.9);
    D.vein([x0, 3.3, z0], [x1, 3.2, z1], { sag: 0.7, r: 0.05 });
  }
  const [sx, sz] = along(P[0], P[1], 0.6, 1.0);
  D.floorSac(sx, sz, 1.4);
  const [tx, tz] = along(P[2], P[3], 0.45, 1.0);
  D.floorSac(tx, tz, 1.4);
  const [ex, ez] = along(P[1], P[2], 0.5, -0.9);
  L.prop('eggCluster', ex, ez, { args: { count: 6 } });
  for (const [s, t, len] of [[0, 0.5, 1.6], [1, 0.4, 1.9], [2, 0.2, 1.5], [2, 0.8, 1.7]]) {
    const [x, z] = along(P[s], P[s + 1], t, 0.2);
    D.tendril(x, z, len);
  }
  const [bx, bz] = along(P[1], P[2], 0.2, 0.9);
  L.prop('bonesPile', bx, bz, { args: { radius: 0.5, skulls: 1 } });
  D.wallVein('x', 23, 1, [[-10.8, 0.4], [-8.2, 1.8], [-5.0, 1.2]], 0.05);
  D.wallVein('x', 26, -1, [[-10.8, 2.6], [-7.4, 1.4], [-4.8, 2.4]], 0.05);
  L.loopSound('fleshBreath', [2.5, 1.5, 20], { radius: 12, gain: 0.8 });
  L.sound('squelch', [8.5, 1.5, 14.5], { interval: [7, 15], radius: 14 });
}
