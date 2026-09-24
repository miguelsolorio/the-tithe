import * as THREE from 'three';
import { Kit, TAU, finish, aabb, candleLight, centroid, addCandle, addChain, addSkull, addOpenBook, addDrip } from './kit.js';

// Painted stroke (thin plane) between two points in the XY plane at depth z.
function stroke(k, m, x0, y0, x1, y1, z, w = 0.014) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  k.plane(m, Math.hypot(dx, dy) + w * 0.6, w, (x0 + x1) / 2, (y0 + y1) / 2, z, 0, 0, Math.atan2(dy, dx));
}

// Sigil: ring, inverted triangle and a vertical stroke, in the XY plane.
function sigil(k, m, r, x, y, z) {
  k.geo(m, new THREE.RingGeometry(r * 0.88, r, 28), x, y, z);
  const tri = [[0, -r * 0.85], [r * 0.74, r * 0.43], [-r * 0.74, r * 0.43]];
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = tri[i];
    const [bx, by] = tri[(i + 1) % 3];
    stroke(k, m, x + ax, y + ay, x + bx, y + by, z + 0.0005, r * 0.08);
  }
  stroke(k, m, x, y - r * 1.15, x, y + r * 1.15, z + 0.001, r * 0.07);
}

// Stone altar with a blood-soaked linen runner and a sigil on the front.
// opts.candles adds two candles at the back corners.
export function altar(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const st = 'stone';
  k.box(st, 1.96, 0.12, 1.0, 0, 0.06, 0);
  k.box(st, 1.8, 0.8, 0.84, 0, 0.52, 0);
  k.box(st, 2.0, 0.1, 1.02, 0, 0.97, 0);
  const pz = 0.42;
  for (const x of [-0.6, 0, 0.6]) {
    k.box(st, 0.48, 0.58, 0.012, x, 0.52, pz + 0.006);
    k.box(st, 0.4, 0.5, 0.012, x, 0.52, pz + 0.018);
  }
  sigil(k, 'bloodDry', 0.17, 0, 0.53, pz + 0.025);
  for (let i = 0; i < 3; i++) k.dripV('decal:bloodDrip', rng.range(0.03, 0.06), rng.range(0.1, 0.2), rng.range(-0.1, 0.1), 0.4, pz + 0.026);
  // Runner along the top, hanging over both ends.
  const ty = 1.02;
  k.box('linen', 2.06, 0.004, 0.56, 0, ty + 0.002, 0);
  for (const sx of [-1, 1]) k.box('linen', 0.004, 0.42, 0.56, sx * 1.032, ty - 0.206, 0);
  for (let i = 0; i < 4; i++) k.stain('decal:bloodSmear', rng.range(0.08, 0.2), rng.range(0.06, 0.14), rng.range(-0.8, 0.8), ty + 0.0045, rng.range(-0.2, 0.2), 0.45);
  k.stain('blood', 0.3, 0.22, rng.range(-0.1, 0.1), ty + 0.005, 0.08, 0.3);
  for (let i = 0; i < 4; i++) k.stain('blood', rng.range(0.03, 0.07), rng.range(0.03, 0.06), rng.range(-0.5, 0.5), ty + 0.0052, rng.range(-0.1, 0.35), 0.4);
  // Blood running off the front edge and down the carved panels.
  for (let i = 0; i < 4; i++) {
    const x = rng.range(-0.3, 0.3);
    addDrip(k, 'blood', x, ty + 0.004, 0.512, rng.range(0.05, 0.1), 0.006);
    k.dripV('decal:bloodDrip', rng.range(0.04, 0.08), rng.range(0.15, 0.35), x, 0.8, pz + 0.0255);
  }
  for (const sx of [-1, 1]) k.dripV('decal:bloodDrip', 0.12, rng.range(0.15, 0.3), sx * 1.035, ty - 0.02, 0, sx * Math.PI / 2);
  k.stain('decal:bloodSplat', 0.35, 0.2, rng.range(-0.2, 0.2), 0.121, 0.49, 0.4);
  let lights = [];
  if (opts.candles) {
    const flames = [];
    for (const sx of [-1, 1]) {
      k.push(sx * 0.82, ty, -0.36);
      const f = addCandle(k, { h: rng.range(0.15, 0.3), r: 0.035, drips: 4 });
      k.stain('wax', 0.07, 0.06, 0, 0.006, 0, 0.3);
      k.pop();
      if (f) flames.push(f);
    }
    lights = [candleLight(centroid(flames), { intensity: 1.6, distance: 6 })];
  }
  return finish(k, 'altar', { lights, collider: [aabb([-1.0, 0, -0.51], [1.0, 1.03, 0.51])] }, true);
}

// Lectern with an open book on a slanted desk facing +Z.
export function lectern(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const w = 'woodDark';
  k.box(w, 0.46, 0.05, 0.4, 0, 0.025, 0);
  k.box(w, 0.36, 0.04, 0.3, 0, 0.07, 0);
  k.lathe(w, [[0, 0.09], [0.09, 0.09], [0.07, 0.14], [0.05, 0.2], [0.055, 0.5], [0.045, 0.8], [0.07, 0.86], [0.07, 0.92], [0, 0.92]], 0, 0, 0, 10);
  k.box(w, 0.3, 0.1, 0.24, 0, 0.96, 0);
  k.push(0, 1.05, 0, 0.38, 0, 0);
  k.box(w, 0.56, 0.03, 0.42, 0, 0, 0);
  k.box(w, 0.56, 0.035, 0.025, 0, 0.03, 0.2);
  k.push(0, 0.016, -0.01);
  addOpenBook(k, { w: 0.44, d: 0.3, cover: 'leather', lines: 9 });
  k.stain('decal:bloodSmear', 0.05, 0.035, rng.range(0.05, 0.15), 0.0232, rng.range(-0.05, 0.05), 0.45);
  k.pop();
  k.box('clothRed', 0.018, 0.002, 0.2, 0.02, 0.026, 0.1);
  k.box('clothRed', 0.018, 0.16, 0.002, 0.02, -0.06, 0.212);
  k.pop();
  return finish(k, 'lectern', {}, true);
}

// Wall-mounted deer skull with big antlers, daubed with blood. Origin on the
// wall at the plaque centre.
export function antlerSkull(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const s = new THREE.Shape();
  s.moveTo(-0.14, 0.18);
  s.lineTo(0.14, 0.18);
  s.lineTo(0.15, 0.02);
  s.quadraticCurveTo(0.13, -0.14, 0, -0.2);
  s.quadraticCurveTo(-0.13, -0.14, -0.15, 0.02);
  s.lineTo(-0.14, 0.18);
  k.extrude('woodDark', s, 0.022, 0, 0, 0.007, 0, 0, 0, 0.006, 4);
  const bz = 0.04;
  // Skull: braincase, tapering muzzle, sockets and nasal slits.
  k.sphere('bone', 0.058, 0, 0.05, bz + 0.05, 1.0, 0.85, 1.1, 9, 6);
  k.rod('bone', [0, 0.04, bz + 0.09], [0, -0.1, bz + 0.26], 0.042, 0.018, 7);
  k.sphere('bone', 0.022, 0, -0.1, bz + 0.26, 0.9, 0.7, 1, 6, 4);
  for (const sx of [-1, 1]) {
    k.sphere('black', 0.019, sx * 0.045, 0.045, bz + 0.085, 1, 1, 0.8, 6, 4);
    k.rod('black', [sx * 0.01, 0.023, bz + 0.163], [sx * 0.008, -0.064, bz + 0.246], 0.005, 0.004, 4);
    k.box('bone', 0.02, 0.018, 0.07, sx * 0.042, 0.012, bz + 0.1, 0.5, sx * 0.25, 0);
  }
  // Antlers: a curving main beam with tines.
  const antler = (sx) => {
    const pts = [];
    let p = new THREE.Vector3(sx * 0.035, 0.09, bz + 0.05);
    const d = new THREE.Vector3(sx * 0.55, 0.8, 0.12).normalize();
    pts.push(p.clone());
    const segLen = rng.range(0.08, 0.095);
    for (let i = 0; i < 7; i++) {
      d.x += sx * (i < 3 ? 0.1 : -0.13);
      d.y += i < 3 ? 0.04 : -0.06;
      d.z += 0.1;
      d.normalize();
      p = p.clone().addScaledVector(d, segLen);
      pts.push(p.clone());
    }
    k.tube('antler', pts, (t) => 0.017 * (1 - t * 0.72), 16, 6);
    k.torus('antler', 0.021, 0.009, pts[0].x, pts[0].y + 0.006, pts[0].z, Math.PI / 2 - 0.4, 0, sx * 0.5, 4, 9);
    for (const i of [1, 3, 5, 6]) {
      const base = pts[i];
      const td = new THREE.Vector3(sx * rng.range(-0.15, 0.2), 1, i === 1 ? 1.1 : rng.range(0.1, 0.45)).normalize();
      const tl = i === 1 ? 0.12 : rng.range(0.13, 0.21);
      const mid = base.clone().addScaledVector(td, tl * 0.5).add(new THREE.Vector3(sx * 0.01, 0, 0.012));
      const tip = base.clone().addScaledVector(td, tl);
      k.tube('antler', [base, mid, tip], (t) => 0.011 * (1 - t * 0.85), 6, 5);
    }
  };
  antler(-1);
  antler(1);
  // Blood daubed on the brow and run down the plaque.
  k.push(0, 0.075, bz + 0.098, -0.75, 0, 0);
  k.stainV('decal:bloodSmear', 0.035, 0.028, 0, 0, 0.004, 0, 0.4);
  k.pop();
  k.stain('blood', 0.02, 0.015, 0.005, 0.096, bz + 0.07, 0.4);
  for (let i = 0; i < 3; i++) k.dripV('decal:bloodDrip', rng.range(0.02, 0.04), rng.range(0.08, 0.16), rng.range(-0.1, 0.1), -0.02, 0.0365);
  k.stainV('decal:bloodSmear', 0.05, 0.06, rng.range(-0.06, 0.06), -0.12, 0.0366, 0, 0.45);
  return finish(k, 'antlerSkull', { collider: 'none' });
}

// Human skull on the floor. opts.jaw (default random).
export function skull(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const jaw = opts.jaw ?? k.rng() < 0.6;
  addSkull(k, { jaw });
  return finish(k, 'skull', { collider: 'none' });
}

// Heap of long bones, ribs and skulls (walk-through).
export function bonesPile(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const R = opts.r ?? 0.42;
  k.stain('decal:grime', R * 1.15, R, 0, 0.001, 0, 0.35);
  const n = opts.count ?? rng.int(10, 14);
  for (let i = 0; i < n; i++) {
    const layer = i < n * 0.55 ? 0 : i < n * 0.85 ? 1 : 2;
    const d = rng() * R * (1 - layer * 0.3);
    const a = rng() * TAU;
    const len = rng.range(0.25, 0.44);
    k.push(Math.cos(a) * d, 0.016 + layer * 0.026, Math.sin(a) * d, 0, rng() * TAU, rng.range(-0.12, 0.12) * layer);
    k.cyl('bone', 0.01, 0.012, len, 0, 0, 0, 0, 0, Math.PI / 2, 5);
    for (const sx of [-1, 1]) k.sphere('bone', 0.019, (sx * len) / 2, 0, 0, 1, 0.75, 1.3, 5, 4);
    k.pop();
  }
  const nr = rng.int(4, 7);
  for (let i = 0; i < nr; i++) {
    const a = rng() * TAU;
    const d = rng() * R * 0.8;
    k.torus('bone', rng.range(0.09, 0.13), 0.006, Math.cos(a) * d, 0.012 + rng() * 0.03, Math.sin(a) * d, Math.PI / 2 + rng.range(-0.3, 0.3), rng.range(-0.3, 0.3), rng() * TAU, 3, 7, rng.range(1.6, 2.3));
  }
  const ns = opts.skulls ?? rng.int(1, 2);
  for (let i = 0; i < ns; i++) {
    const a = rng() * TAU;
    const d = rng() * R * 0.45;
    k.push(Math.cos(a) * d, i === 0 ? 0.045 : 0.01, Math.sin(a) * d, rng.range(-0.3, 0.15), rng() * TAU, rng.range(-0.4, 0.4));
    addSkull(k, { jaw: rng() < 0.3 });
    k.pop();
  }
  return finish(k, 'bonesPile', { collider: 'none' });
}

// Barricade of rope, cloth strips and sinew across a 1.4 x 2.3 m opening,
// hung with sigil tags. Origin at the floor centre of the opening.
export function ropeBarricade(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const HW = 0.7;
  const H = 2.3;
  const ropes = [];
  // Iron spikes driven into both jambs.
  const anchors = { '-1': [], 1: [] };
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const y = 0.3 + i * 0.36 + rng.range(-0.06, 0.06);
      k.rod('iron', [sx * HW, y, 0], [sx * (HW - 0.05), y + 0.012, 0.004], 0.007, 0.004, 4);
      k.torus('rope', 0.014, 0.008, sx * (HW - 0.03), y + 0.006, 0, 0, Math.PI / 2, 0, 3, 6);
      anchors[sx].push(new THREE.Vector3(sx * (HW - 0.03), y, 0));
    }
  }
  // Sagging strand between two points; returns a sampler for hanging bits.
  const strand = (a, b, sag, m, r, z) => {
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const p = a.clone().lerp(b, t);
      p.y -= 4 * sag * t * (1 - t);
      p.z = z + (i && i < 4 ? rng.range(-0.008, 0.008) : 0);
      pts.push(p);
    }
    k.tube(m, pts, r, 10, 4);
    const curve = new THREE.CatmullRomCurve3(pts);
    ropes.push(curve);
    return curve;
  };
  const L = anchors['-1'];
  const Rr = anchors[1];
  const pairs = [[0, 2], [2, 0], [1, 4], [4, 1], [3, 5], [5, 3], [1, 1], [3, 3], [5, 5]];
  pairs.forEach(([i, j], n) => strand(L[i], Rr[j], rng.range(0.03, 0.12), 'rope', 0.011, ((n % 3) - 1) * 0.018));
  for (let i = 0; i < 3; i++) {
    const a = L[rng.int(0, 5)];
    const b = Rr[rng.int(0, 5)];
    strand(a, b, rng.range(0.05, 0.2), 'sinew', 0.006, rng.range(-0.03, 0.03));
  }
  // Cloth strips knotted on and hanging down.
  const cloth = ['linen', 'clothRed', 'cloth'];
  for (let i = 0; i < 12; i++) {
    const c = rng.pick(ropes);
    const p = c.getPointAt(rng.range(0.15, 0.85));
    const len = rng.range(0.14, 0.4);
    const top = Math.min(p.y, H - 0.02);
    const bot = Math.max(0.02, top - len);
    k.box(rng.pick(cloth), rng.range(0.035, 0.07), top - bot, 0.004, p.x, (top + bot) / 2, p.z + 0.012, rng.range(-0.1, 0.1), rng.range(-0.4, 0.4), rng.range(-0.08, 0.08));
    k.sphere('rope', 0.016, p.x, p.y, p.z, 1.3, 1, 1, 4, 3);
  }
  // Paper tags with blood sigils on short strings.
  for (let i = 0; i < 7; i++) {
    const c = rng.pick(ropes);
    const p = c.getPointAt(rng.range(0.2, 0.8));
    const drop = rng.range(0.04, 0.1);
    const ty = p.y - drop - 0.045;
    if (ty < 0.1) continue;
    const ry = rng.range(-0.35, 0.35);
    k.rod('rope', [p.x, p.y, p.z], [p.x, ty + 0.045, p.z + 0.01], 0.0025, 0.0025, 3);
    k.push(p.x, ty, p.z + 0.01, 0, ry, rng.range(-0.12, 0.12));
    k.box('paper', 0.056, 0.085, 0.002, 0, 0, 0);
    for (const face of [1, -1]) {
      k.push(0, 0, face * 0.0012, 0, face > 0 ? 0 : Math.PI, 0);
      k.geo('bloodDry', new THREE.RingGeometry(0.014, 0.018, 8), 0, 0.005, 0);
      stroke(k, 'bloodDry', 0, -0.03, 0, 0.03, 0.0004, 0.004);
      stroke(k, 'bloodDry', -0.016, -0.012, 0.016, -0.012, 0.0004, 0.004);
      k.pop();
    }
    k.pop();
  }
  // A couple of finger bones knotted in.
  for (let i = 0; i < 3; i++) {
    const c = rng.pick(ropes);
    const p = c.getPointAt(rng.range(0.2, 0.8));
    k.rod('bone', [p.x, p.y - 0.01, p.z + 0.01], [p.x + rng.range(-0.02, 0.02), p.y - 0.07, p.z + 0.012], 0.006, 0.005, 4);
  }
  return finish(k, 'ropeBarricade', { collider: [aabb([-HW, 0, -0.1], [HW, H, 0.1])] });
}

// Small iron cage on a chain. Origin at the ceiling; opts.drop = chain length.
export function hangingCage(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const drop = opts.drop ?? 0.7;
  const m = 'rust';
  const R = 0.24;
  const CH = 0.72;
  const top = -drop - 0.12;
  const bot = top - CH;
  k.cyl('iron', 0.06, 0.06, 0.02, 0, -0.01, 0, 0, 0, 0, 10);
  addChain(k, [0, -0.03, 0], [0, -drop, 0], { m: 'iron' });
  k.torus(m, 0.028, 0.007, 0, -drop - 0.02, 0, 0, 0, 0, 4, 10);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    k.tube(m, [[c * 0.015, -drop - 0.045, s * 0.015], [c * R * 0.7, top + 0.06, s * R * 0.7], [c * R, top, s * R]], 0.006, 6, 4);
  }
  for (const y of [top, top - CH * 0.55, bot]) k.torus(m, R, 0.008, 0, y, 0, Math.PI / 2, 0, 0, 3, 18);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    k.rod(m, [Math.cos(a) * R, top, Math.sin(a) * R], [Math.cos(a) * R, bot, Math.sin(a) * R], 0.0055, 0.0055, 4);
  }
  k.cyl(m, R, R, 0.012, 0, bot - 0.006, 0, 0, 0, 0, 16);
  const ly = top - CH * 0.55;
  k.box('iron', 0.04, 0.05, 0.02, 0, ly - 0.03, R + 0.016);
  k.torus('iron', 0.013, 0.004, 0, ly - 0.005, R + 0.016, 0, 0, 0, 3, 8, Math.PI);
  k.push(rng.range(-0.05, 0.05), bot, rng.range(-0.05, 0.05), rng.range(-0.2, 0), rng() * TAU, rng.range(-0.3, 0.3));
  addSkull(k, { jaw: false, s: 0.9 });
  k.pop();
  for (let i = 0; i < 3; i++) {
    const a = rng() * TAU;
    k.rod('bone', [Math.cos(a) * 0.15, bot + 0.01, Math.sin(a) * 0.15], [Math.cos(a + 1.5) * 0.12, bot + 0.012, Math.sin(a + 1.5) * 0.12], 0.009, 0.008, 5);
  }
  return finish(k, 'hangingCage', { collider: [aabb([-R - 0.01, bot - 0.012, -R - 0.01], [R + 0.01, top + 0.01, R + 0.04])] });
}

// Hanging rope noose. Origin at the ceiling; opts.drop = rope to the knot.
export function noose(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const drop = opts.drop ?? 1.1;
  const m = 'rope';
  k.cyl('iron', 0.04, 0.04, 0.012, 0, -0.006, 0, 0, 0, 0, 8);
  k.torus('iron', 0.022, 0.006, 0, -0.035, 0, 0, 0, 0, 4, 10);
  const ky = -drop;
  k.tube(m, [[0, -0.05, 0], [0.005, ky * 0.4, 0.004], [-0.004, ky * 0.75, -0.003], [0, ky, 0]], 0.012, 10, 5);
  const coil = [[0, ky - 0.135]];
  for (let i = 0; i <= 9; i++) coil.push([i % 2 ? 0.021 : 0.026, ky - 0.13 + i * 0.0144]);
  coil.push([0, ky]);
  k.lathe(m, coil, 0, 0, 0, 8);
  const LR = 0.12;
  k.torus(m, LR, 0.012, 0, ky - 0.13 - LR * 1.35 + 0.012, 0, 0, rng.range(-0.4, 0.4), 0, 5, 20, TAU, 1, 1.35, 1);
  k.tube(m, [[0.022, ky - 0.12, 0.01], [0.03, ky - 0.2, 0.02], [0.026, ky - 0.29, 0.016]], (t) => 0.011 * (1 - t * 0.3), 6, 5);
  return finish(k, 'noose', { collider: 'none' });
}

// Wooden bucket brimming with blood, runs down the side, a splash beneath.
export function bloodBucket(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const H = 0.3;
  const rb = 0.12;
  const rt = 0.145;
  k.lathe('wood', [[0, 0], [rb, 0], [rt, H], [rt - 0.012, H], [rb - 0.012, 0.03], [0, 0.03]], 0, 0, 0, 14);
  for (const y of [0.05, 0.24]) {
    const r = rb + (rt - rb) * (y / H) + 0.003;
    k.cyl('rust', r + 0.002, r - 0.001, 0.028, 0, y, 0, 0, 0, 0, 14, true);
  }
  for (const sx of [-1, 1]) k.box('rust', 0.012, 0.035, 0.024, sx * (rt + 0.004), H - 0.035, 0);
  k.torus('iron', rt + 0.006, 0.0045, 0, H - 0.03, 0, -0.7, 0, 0, 4, 14, Math.PI);
  const fy = H - 0.03;
  const fr = rb - 0.012 + (rt - rb) * ((fy - 0.03) / (H - 0.03));
  k.cyl('blood', fr, fr, 0.002, 0, fy, 0, 0, 0, 0, 14);
  for (let i = 0; i < 4; i++) {
    const a = rng() * TAU;
    const len = rng.range(0.06, 0.2);
    const lean = ((rb - rt) * len) / H;
    addDrip(k, 'blood', Math.cos(a) * (rt + 0.003), H - 0.002, Math.sin(a) * (rt + 0.003), len, 0.006, [Math.cos(a) * lean, Math.sin(a) * lean]);
  }
  k.stain('decal:bloodSplat', 0.26, 0.2, 0.05, 0.001, 0.07, 0.45);
  k.stain('blood', 0.1, 0.07, rng.range(0.08, 0.16), 0.0015, rng.range(0.05, 0.14), 0.35);
  return finish(k, 'bloodBucket', { collider: 'none' });
}
