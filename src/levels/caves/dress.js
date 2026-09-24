import * as THREE from 'three';
import { makeRng } from '../../core/rng.js';
import { getMaterial } from '../../world/materials.js';
import { Kit, v3, tube } from '../../world/props/depths/kit.js';
import { floorTop, wallPoint } from './layout.js';
import { blob, spine, clothScrap } from './meshes.js';

// Set dressing, part 1: ossuary antechamber, crawlspace mouth, first flesh
// tunnel, rib gallery, sphincter hall and throat. Shared helpers in makeDress().

const FLESH = 0xff2a1a;

export function makeDress(L, ceil) {
  const rng = makeRng(911);
  const kit = new Kit();
  const D = { rng, kit, ceil };
  D.light = (pos, intensity = 1.5, distance = 7, flicker = 0.35) => L.light({ pos, color: FLESH, intensity, distance, flicker, kind: 'flesh' });
  // Vein prop between two world points (sags under its own weight).
  D.vein = (from, to, o = {}) => L.prop('vein', 0, 0, { y: 0, rotY: 0, collider: 'none', args: { from, to, sag: o.sag, radius: o.r ?? 0.06, branches: o.branches ?? 2, seed: rng.int(1, 9999) } });
  // Vein that crawls over an organic wall through [u, y] control points.
  D.wallVein = (axis, line, dir, ctrl, r = 0.045) => {
    const pts = [];
    for (let s = 0; s + 1 < ctrl.length; s++) {
      const [u0, y0] = ctrl[s];
      const [u1, y1] = ctrl[s + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(u1 - u0, y1 - y0) / 0.3));
      for (let k = s ? 1 : 0; k <= n; k++) {
        const t = k / n;
        const u = u0 + (u1 - u0) * t;
        const y = y0 + (y1 - y0) * t + Math.sin((u + y0 + t) * 3.1) * 0.05;
        pts.push(v3(...wallPoint(axis, line, u, y, dir, -r * 0.35)));
      }
    }
    if (pts.length < 2) return;
    kit.add('fleshDark', tube(pts, { segs: pts.length * 2, radial: 5, radius: (t) => r * (0.8 + 0.35 * Math.sin(t * 17 + line)) }));
  };
  // Floor vein through [x, z] points (half sunk into the floor).
  D.floorVein = (ctrl, r = 0.05, base = 0) => {
    const pts = ctrl.map(([x, z]) => v3(x, floorTop(x, z, 0.1, base) - r * 0.3, z));
    kit.add('fleshDark', tube(pts, { segs: pts.length * 6, radial: 5, radius: (t) => r * (1 - 0.5 * t) + 0.01 }));
  };
  D.tendril = (x, z, length, extra = 2) => {
    const c = ceil(x, z);
    if (c == null) return null;
    return L.prop('tendril', x, z, { y: c + 0.12, rotY: rng.range(0, 6.28), args: { length, extra, seed: rng.int(1, 9999) } });
  };
  // Cocoon hanging so its feet end ~bottom metres above the floor.
  D.cocoon = (x, z, bottom = 2.3, floor = 0) => {
    const c = ceil(x, z);
    if (c == null) return null;
    const drop = Math.max(0.3, c - floor - 1.75 - bottom);
    return L.prop('cocoon', x, z, { y: c + 0.1, rotY: rng.range(0, 6.28), args: { drop: drop + 0.1, seed: rng.int(1, 9999) } });
  };
  D.wallSac = (p, rotY, lit = 0) => {
    L.prop('sac', p[0], p[2], { y: p[1], rotY, lights: false, args: { mount: 'wall', seed: rng.int(1, 9999) } });
    if (lit) D.light([p[0] + Math.sin(rotY) * 0.4, p[1] + 0.1, p[2] + Math.cos(rotY) * 0.4], lit, 7);
  };
  D.floorSac = (x, z, lit = 0, base = 0) => {
    L.prop('sac', x, z, { y: floorTop(x, z, 0.3, base) - 0.02, rotY: rng.range(0, 6.28), lights: false, args: { seed: rng.int(1, 9999) } });
    if (lit) D.light([x, base + 0.6, z], lit, 6.5);
  };
  D.decal = (kind, x, z, size, rot = null, base = 0) => {
    const r = Array.isArray(size) ? Math.max(...size) / 2 : size / 2;
    L.decal(kind, [x, floorTop(x, z, r * 0.8, base) + 0.005, z], { face: 'up', size, rot });
  };
  D.finish = () => {
    const obj = kit.build();
    L.mesh(obj, { static: true });
  };
  return D;
}

// ---------- Ossuary antechamber + crawlspace mouth ----------
export function dressOssuary(L, D) {
  const wall = (x, z, rotY, width, height = 2.4, collider) => L.prop('skullWall', x, z, { y: 0, rotY, args: { width, height, seed: D.rng.int(1, 999) }, collider });
  for (const z of [17.23, 19, 20.77]) {
    wall(14.1, z, Math.PI / 2, 1.76);
    wall(20.9, z, -Math.PI / 2, 1.76);
  }
  wall(15.5, 21.9, Math.PI, 2.7);
  wall(19.5, 21.9, Math.PI, 2.7);
  wall(15.05, 16.1, 0, 1.8);
  wall(19.95, 16.1, 0, 1.8);
  // Crawlspace mouth: skulls pressed in on both sides, darkness at the end.
  wall(17.1, 24.0, Math.PI / 2, 3.8, 1.2, 'none');
  wall(17.9, 24.0, -Math.PI / 2, 3.8, 1.2, 'none');
  L.box([17, 0, 25.82], [18, 1.25, 25.88], 'black', { collide: false });
  // Bones heaped in the corners.
  L.prop('skullPile', 14.9, 21.1, { rotY: 0.6 });
  L.prop('bonesPile', 20.0, 21.0, { args: { radius: 0.7 } });
  L.prop('bonesPile', 15.2, 17.3, { args: { radius: 0.5, skulls: 1 } });
  L.prop('skullPile', 20.3, 16.9, { rotY: -0.8, scale: 0.8 });
  // The flesh pushing in from the north: blobs over the skulls, veins on the floor and walls.
  for (const [x, y, z, r] of [[15.7, 1.6, 16.35, 0.34], [16.1, 2.55, 16.3, 0.28], [19.2, 0.7, 16.35, 0.3], [19.4, 2.2, 16.3, 0.36], [18.9, 2.85, 16.25, 0.25], [14.4, 2.6, 16.8, 0.24]]) {
    blob(L, [x, y, z], r, [1.2, 0.9, 0.55], 'flesh', D.rng.int(1, 99));
  }
  D.floorVein([[17.2, 16.1], [17.0, 17.2], [16.4, 18.3], [15.7, 18.9]], 0.06);
  D.floorVein([[18.2, 16.1], [18.6, 17.0], [19.4, 17.6]], 0.05);
  D.floorVein([[16.4, 16.1], [15.6, 16.6], [14.6, 16.9]], 0.04);
  D.vein([16.0, 0.3, 16.2], [15.1, 2.8, 16.25], { sag: -0.1, r: 0.05 });
  D.vein([19.0, 0.4, 16.2], [20.4, 2.6, 16.25], { sag: -0.12, r: 0.05 });
  D.vein([16.2, 2.75, 16.1], [18.8, 2.75, 16.1], { sag: 0.2, r: 0.07 });
  D.wallSac([19.8, 1.85, 16.42], 0, 1.3);
  // The hunter came this way: his lantern, guttering, and a bandage.
  L.prop('lanternAmber', 20.25, 18.25, { rotY: 0.5, flicker: 0.55 });
  // Drag marks from the crawlspace to the flesh.
  L.decal('bloodSmear', [17.5, 0.013, 20.6], { size: [0.8, 2.0], rot: 0.1 });
  L.decal('bloodSmear', [17.3, 0.013, 18.4], { size: [0.7, 2.2], rot: -0.15 });
  L.decal('bloodSmear', [17.6, 0.013, 16.9], { size: [0.7, 1.6], rot: 0.2 });
  L.decal('grime', [17.5, 0.012, 19], { size: 5 });
  L.sound('crack', [17.5, 1.2, 19.5], { interval: [14, 30], radius: 14, gain: 0.7 });
  L.sound('squelch', [17.5, 2, 15.5], { interval: [7, 16], radius: 14, gain: 0.8 });
}

// ---------- First flesh tunnel ----------
export function dressTunnel(L, D) {
  D.tendril(17.4, 14.6, 1.5);
  D.tendril(18.3, 12.7, 2.0);
  D.tendril(15.4, 10.4, 1.7);
  D.tendril(17.6, 10.9, 1.3, 1);
  D.wallVein('z', 16, 1, [[15.8, 0.3], [14.4, 1.2], [13.2, 2.4], [12.2, 2.9]]);
  D.wallVein('z', 16, 1, [[15.6, 2.8], [14.2, 2.1], [12.3, 0.4]], 0.035);
  D.wallVein('z', 19, -1, [[15.5, 2.6], [13.6, 1.8], [11.8, 2.2], [9.6, 0.6]]);
  D.wallVein('z', 19, -1, [[14.8, 0.3], [12.6, 0.9], [10.4, 2.9]], 0.035);
  D.wallVein('x', 9, 1, [[17.2, 0.5], [18.1, 1.9], [18.9, 2.6]]);
  D.wallVein('x', 12, -1, [[13.2, 2.8], [14.4, 1.4], [15.8, 0.8]]);
  D.vein(wallPoint('z', 16, 13.6, 3.3, 1), wallPoint('z', 19, 14.1, 3.2, -1), { sag: 0.55, r: 0.07 });
  D.vein(wallPoint('z', 16, 15.2, 3.0, 1), wallPoint('z', 19, 12.9, 3.4, -1), { sag: 0.7, r: 0.05 });
  D.vein(wallPoint('x', 9, 14.2, 3.85, 1), wallPoint('x', 12, 14.0, 3.2, -1), { sag: 0.6, r: 0.06 });
  D.vein(wallPoint('x', 9, 16.2, 3.8, 1), wallPoint('x', 12, 15.6, 3.3, -1), { sag: 0.75, r: 0.05 });
  D.wallSac(wallPoint('z', 19, 11.0, 1.45, -1), -Math.PI / 2, 1.5);
  D.wallSac(wallPoint('z', 16, 15.2, 1.9, 1), Math.PI / 2, 0);
  L.prop('bonesPile', 18.3, 15.2, { args: { radius: 0.45, skulls: 1 } });
  D.decal('bloodSmear', 17.5, 14.2, [0.7, 2.0], 0.15);
  D.decal('bloodSmear', 17.0, 11.2, [0.7, 2.0], 0.9);
  D.decal('bloodSmear', 15.2, 10.4, [0.7, 1.8], Math.PI / 2);
  L.loopSound('fleshBreath', [18, 1.6, 13], { radius: 11, gain: 0.8 });
}

// ---------- Rib gallery ----------
export function dressGallery(L, D) {
  const ribZ = [7.6, 5.1, 2.6, 0.1, -2.4, -4.9, -7.4, -9.9];
  for (const [k, z] of ribZ.entries()) L.prop('rib', 14.5, z, { y: 0, rotY: (k % 2 ? 0.03 : -0.03), args: { span: 4.5, height: 5.6, seed: 30 + k } });
  // The spine along the rib tops, tied into the ceiling with gristle.
  const pts = [];
  for (let z = 8.4; z >= -10.9; z -= 0.62) pts.push([14.5 + Math.sin(z * 0.4) * 0.05, 5.66 + Math.sin(z * 0.9) * 0.04, z]);
  spine(L, pts);
  for (const z of [6.4, 1.3, -3.7, -8.7]) {
    const c = D.ceil(14.5, z) ?? 7;
    D.vein([14.5, 5.8, z], [14.2 + D.rng.range(-0.3, 0.3), c + 0.25, z + 0.3], { sag: -0.05, r: 0.09, branches: 1 });
    D.vein([14.55, 5.7, z - 0.8], [13.3, c - 0.1, z - 1.0], { sag: 0.1, r: 0.05, branches: 1 });
  }
  // Glowing growths at the rib feet under-light the arches.
  D.floorSac(12.85, 3.85, 1.7);
  D.floorSac(16.15, -3.65, 1.7);
  D.floorSac(12.85, -8.65, 1.6);
  D.floorSac(16.2, 6.4, 0);
  D.floorSac(12.9, -1.2, 0);
  D.tendril(14.5, 6.35, 2.2);
  D.tendril(13.7, 1.35, 2.6);
  D.tendril(15.3, -3.65, 2.4);
  D.tendril(14.5, -8.65, 2.0, 3);
  // Veins crawling along the walls between the ribs.
  D.wallVein('z', 12, 1, [[8.6, 1.1], [5.0, 0.7], [1.5, 1.6], [0.2, 1.3]], 0.055);
  D.wallVein('z', 12, 1, [[-3.2, 1.0], [-7.0, 1.9], [-11.6, 1.2]], 0.055);
  D.wallVein('z', 12, 1, [[8.4, 3.2], [3.0, 2.6], [0.2, 3.4]], 0.04);
  D.wallVein('z', 12, 1, [[-3.4, 3.0], [-8.0, 2.4], [-11.6, 3.3]], 0.04);
  D.wallVein('z', 17, -1, [[8.6, 1.8], [6.4, 1.2]], 0.05);
  D.wallVein('z', 17, -1, [[2.6, 1.4], [-1.5, 0.8], [-5.0, 1.6], [-11.6, 0.9]], 0.055);
  D.wallVein('z', 17, -1, [[2.8, 3.2], [-3.0, 2.8], [-8.4, 3.6]], 0.04);
  // A body in the west alcove, picked clean; the rounds are still in his pocket.
  L.prop('bonesPile', 11.95, -1.6, { args: { radius: 0.55, count: 18, skulls: 1 } });
  D.decal('bloodPool', 12.1, -1.3, 1.4);
  L.prop('bonesPile', 16.3, 7.2, { args: { radius: 0.5 } });
  L.prop('skullPile', 12.95, -6.1, { rotY: 1.2, scale: 0.85 });
  L.prop('boneSpike', 16.2, -0.9, { args: { height: 0.9 } });
  for (const [z, r] of [[6.0, 0.2], [1.0, -0.2], [-4.0, 0.25], [-9.0, -0.1]]) D.decal('bloodSmear', 14.5 + r, z, [0.8, 2.3], r);
  L.loopSound('fleshBreath', [14.5, 2, -3], { radius: 13, gain: 0.8 });
  L.sound('crack', [14.5, 4.5, 1], { interval: [9, 20], radius: 22, gain: 0.8 });
  L.sound('squelch', [12.2, 1, -6], { interval: [8, 18], radius: 14 });
}

// ---------- Sphincter hall + throat ----------
export function dressHall(L, D) {
  L.prop('tooth', 12.25, -19.35, { rotY: 0.3, args: { height: 1.5, curl: 0.5, seed: 81 } });
  L.prop('tooth', 16.75, -19.35, { rotY: -0.3, args: { height: 1.5, curl: 0.5, seed: 82 } });
  L.prop('tooth', 11.4, -18.7, { rotY: 0.9, args: { height: 0.9, curl: 0.4, seed: 83 } });
  L.prop('tooth', 17.6, -18.6, { rotY: -0.8, args: { height: 1.0, curl: 0.45, seed: 84 } });
  for (const [x, z] of [[11.2, -14.6], [17.9, -15.1]]) {
    const c = D.ceil(x, z) ?? 5.5;
    L.prop('fleshPillar', x, z, { args: { height: c + 0.4, seed: D.rng.int(1, 99) } });
  }
  // Glands either side of the sphincter; veins radiate from its collar.
  D.wallSac(wallPoint('x', -20, 12.0, 2.5, 1), 0, 1.6);
  D.wallSac(wallPoint('x', -20, 17.0, 2.5, 1), 0, 1.6);
  D.wallVein('x', -20, 1, [[12.9, 3.2], [12.0, 3.8], [11.2, 4.4]], 0.06);
  D.wallVein('x', -20, 1, [[12.8, 1.1], [11.9, 0.9], [11.1, 1.4]], 0.05);
  D.wallVein('x', -20, 1, [[16.1, 3.3], [17.1, 3.9], [17.9, 4.5]], 0.06);
  D.wallVein('x', -20, 1, [[16.2, 1.2], [17.2, 1.6], [17.9, 1.0]], 0.05);
  D.wallVein('z', 20, -1, [[-17.8, 0.6], [-16.4, 1.8], [-14.2, 1.2]], 0.05);
  D.floorVein([[13.3, -19.6], [12.6, -18.6], [11.9, -17.4], [11.4, -16.0]], 0.06);
  D.floorVein([[15.8, -19.6], [16.6, -18.2], [17.2, -17.3]], 0.06);
  D.floorVein([[14.0, -19.4], [13.6, -17.8], [13.9, -16.3]], 0.04);
  L.prop('eggCluster', 18.35, -13.5, { rotY: 0.5, args: { count: 7 } });
  L.prop('bonesPile', 10.4, -16.4, { args: { radius: 0.5, skulls: 1 } });
  D.tendril(13.2, -15.6, 2.2);
  D.tendril(16.0, -14.2, 2.6);
  D.tendril(14.6, -17.8, 1.8, 1);
  // Drag marks straight into the sphincter, handprints clawing at its lip.
  D.decal('bloodSmear', 14.5, -13.3, [0.8, 2.2], 0.05);
  D.decal('bloodSmear', 14.4, -15.5, [0.8, 2.2], -0.1);
  D.decal('bloodSmear', 14.6, -17.6, [0.9, 2.0], 0.08);
  D.decal('handprint', 13.8, -19.2, 0.32, 2.8);
  D.decal('handprint', 15.1, -19.25, 0.3, 3.4);
  D.decal('claws', 14.4, -18.9, [0.5, 0.6], 3.1);
  // A strip of her sleeve, snagged on the west tooth.
  const scrap = clothScrap();
  scrap.position.set(12.52, 0.72, -18.47);
  scrap.rotation.set(0.1, 0.35, 0.15);
  L.mesh(scrap, { static: true });
  L.loopSound('fleshBreath', [14.5, 2, -19.5], { radius: 12, gain: 0.9 });
  L.sound('squelch', [14.5, 1.4, -19.6], { interval: [5, 11], radius: 16 });
  // Throat: the heart's glow deeper in, a second pucker opening into dark.
  D.light([14.5, 1.8, -22.8], 2.4, 6, 0.5);
  L.prop('sphincterDoor', 14.5, -23.4, { y: 0, face: 's', collider: 'none', args: { diameter: 2.3, open: 1 } });
  L.box([13.2, 0, -23.86], [15.8, 2.5, -23.8], 'black', { collide: false });
  D.wallVein('z', 13, 1, [[-20.3, 0.5], [-21.6, 1.8], [-23.2, 2.6]], 0.05);
  D.wallVein('z', 16, -1, [[-20.3, 2.4], [-21.9, 1.2], [-23.4, 1.9]], 0.05);
}
