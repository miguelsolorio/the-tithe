import * as THREE from 'three';
import { makeRng } from '../../../core/rng.js';
import { solid } from '../../materials.js';
import { Kit, TAU, v3, xf, box, cyl, sphere, torus, lathe, tube, roundBox, boltHead, rivet, deform, fbm3 } from './kit.js';

// Drowned-zone machinery: boiler, pipes, shelving, barrels, gates, ladders.

export const BRASS = () => solid(0x8a6a30, { roughness: 0.35, metalness: 0.9 });
export const GLASS = () => solid(0x9ab8b4, { roughness: 0.05, transparent: true, opacity: 0.28 });
const PAINT_RED = () => solid(0x5e1812, { roughness: 0.7, metalness: 0.2 });
const CARD = () => solid(0x6b5238, { roughness: 0.95 });
const MURK = () => solid(0x16201c, { roughness: 0.06, metalness: 0.1 });

// Spoked hand wheel in the XY plane (axis +Z) at matrix m.
export function handWheel(kit, m, R = 0.08, spokes = 4, material = 'metal') {
  const k = new Kit({ raw: true });
  k.add(material, torus(R, R * 0.12, 4, 16));
  k.add(material, cyl(R * 0.2, R * 0.2, R * 0.35, 8), xf([0, 0, 0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    k.add(material, cyl(R * 0.06, R * 0.06, R, 4, true), xf([Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0], [0, 0, a - Math.PI / 2]));
  }
  kit.addParts(k.merged(), m);
}

// Pressure gauge facing +Z at matrix m (dial radius r).
export function gauge(kit, m, r = 0.07) {
  const k = new Kit({ raw: true });
  const rot = [Math.PI / 2, 0, 0];
  k.add(BRASS(), cyl(r * 1.08, r * 1.08, r * 0.45, 14), xf([0, 0, -r * 0.22], rot));
  k.add(BRASS(), torus(r * 1.02, r * 0.08, 4, 14), xf([0, 0, 0.002]));
  k.add('paper', cyl(r * 0.95, r * 0.95, 0.004, 14, true), xf([0, 0, 0.001], rot));
  k.add('paper', cyl(r * 0.95, r * 0.95, 0.001, 14), xf([0, 0, 0.003], rot));
  for (let i = 0; i <= 6; i++) {
    const a = -2.3 + (i / 6) * 4.6;
    const red = i >= 5;
    k.add(red ? PAINT_RED() : 'black', box(r * 0.05, r * (i % 3 ? 0.14 : 0.22), 0.002), xf([Math.sin(a) * r * 0.76, Math.cos(a) * r * 0.76, 0.004], [0, 0, -a]));
  }
  const na = 0.9;
  k.add('black', box(r * 0.05, r * 0.75, 0.002), xf([Math.sin(na) * r * 0.3, Math.cos(na) * r * 0.3, 0.006], [0, 0, -na]));
  k.add('black', cyl(r * 0.08, r * 0.08, 0.006, 8), xf([0, 0, 0.006], rot));
  k.add(GLASS(), cyl(r * 0.98, r * 0.98, 0.003, 14), xf([0, 0, 0.012], rot));
  kit.addParts(k.merged(), m);
}

// ---------- boiler ----------

export function boiler(opts = {}) {
  const ceiling = opts.ceiling ?? 2.8;
  const kit = new Kit();
  const R = 0.5;
  const y0 = 0.34;
  const y1 = 1.62;
  kit.add('brick', box(1.2, 0.3, 1.2), xf([0, 0.15, 0]));
  kit.add('metal', cyl(R + 0.04, R + 0.07, 0.05, 24), xf([0, 0.325, 0]));
  kit.add('rust', cyl(R, R, y1 - y0, 28, true, 2), xf([0, (y0 + y1) / 2, 0]));
  kit.add('rust', sphere(R, 24, 5, 0, TAU, 0, Math.PI / 2), xf([0, y1, 0], [0, 0, 0], [1, 0.55, 1]));
  // lap seams with rivets
  const bands = [y0 + 0.06, 0.98, y1 - 0.03];
  for (const y of bands) {
    kit.add('metal', cyl(R + 0.012, R + 0.012, 0.055, 28, true), xf([0, y, 0]));
    for (let i = 0; i < 18; i++) {
      const a = ((i + 0.5) / 18) * TAU;
      rivet(kit, 'metal', [Math.sin(a) * (R + 0.012), y, Math.cos(a) * (R + 0.012)], [Math.sin(a), 0, Math.cos(a)], 0.009);
    }
  }
  // vertical seam at the back-left
  for (let i = 0; i < 12; i++) {
    const a = -2.4;
    const y = y0 + 0.12 + i * 0.1;
    if (Math.abs(y - 0.98) < 0.05) continue;
    rivet(kit, 'metal', [Math.sin(a) * R, y, Math.cos(a) * R], [Math.sin(a), 0, Math.cos(a)], 0.008);
  }
  // firebox door
  kit.add('metal', box(0.46, 0.42, 0.14), xf([0, 0.62, R - 0.04]));
  kit.add('rust', box(0.38, 0.34, 0.03), xf([0.01, 0.62, R + 0.045], [0, -0.06, 0]));
  kit.add('black', box(0.34, 0.3, 0.01), xf([0, 0.62, R + 0.03]));
  for (const y of [0.52, 0.72]) kit.add('metal', cyl(0.016, 0.016, 0.07, 8), xf([-0.2, y, R + 0.05]));
  kit.add('metal', box(0.03, 0.12, 0.03), xf([0.16, 0.62, R + 0.08]));
  kit.add('metal', cyl(0.012, 0.012, 0.09, 6), xf([0.16, 0.62, R + 0.12], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 4; i++) boltHead(kit, 'metal', [-0.12 + i * 0.08, 0.76, R + 0.06], 0.009, 0.006);
  // ash pit door with vents
  kit.add('metal', box(0.4, 0.14, 0.1), xf([0, 0.42, R - 0.03]));
  for (let i = 0; i < 5; i++) kit.add('black', box(0.05, 0.06, 0.01), xf([-0.14 + i * 0.07, 0.42, R + 0.022]));
  // pressure gauge on a siphon pipe
  kit.rod('metal', [0.22, 1.3, R - 0.02], [0.22, 1.3, R + 0.08], 0.012, 8);
  kit.add('metal', torus(0.03, 0.009, 5, 12), xf([0.22, 1.33, R + 0.08], [0, Math.PI / 2, 0]));
  kit.rod('metal', [0.22, 1.36, R + 0.08], [0.22, 1.42, R + 0.08], 0.01, 6);
  gauge(kit, xf([0.22, 1.5, R + 0.1], [-0.12, 0, 0]), 0.075);
  // water sight glass
  for (const y of [1.02, 1.38]) {
    kit.rod(BRASS(), [-0.26, y, R * 0.86], [-0.26, y, R * 0.86 + 0.07], 0.014, 8);
    kit.add(BRASS(), cyl(0.018, 0.018, 0.04, 8), xf([-0.26, y, R * 0.86 + 0.08]));
  }
  kit.add(GLASS(), cyl(0.011, 0.011, 0.34, 8), xf([-0.26, 1.2, R * 0.86 + 0.08]));
  kit.add(MURK(), cyl(0.008, 0.008, 0.14, 6), xf([-0.26, 1.1, R * 0.86 + 0.08]));
  for (const sx of [-1, 1]) kit.rod(BRASS(), [-0.26 + sx * 0.022, 1.04, R * 0.86 + 0.08], [-0.26 + sx * 0.022, 1.36, R * 0.86 + 0.08], 0.003, 4);
  // safety valve on the dome
  kit.add(BRASS(), cyl(0.04, 0.05, 0.12, 10), xf([0.22, y1 + 0.2, 0.05]));
  kit.rod('metal', [0.22, y1 + 0.27, 0.05], [0.46, y1 + 0.25, 0.05], 0.008, 5);
  kit.add('metal', cyl(0.035, 0.035, 0.06, 8), xf([0.44, y1 + 0.22, 0.05]));
  // flue to the ceiling
  const flueY = y1 + R * 0.55 - 0.02;
  if (ceiling > flueY + 0.1) {
    kit.add('rust', cyl(0.13, 0.13, ceiling - flueY, 16, true), xf([0, (flueY + ceiling) / 2, 0]));
    kit.add('metal', cyl(0.15, 0.15, 0.06, 16), xf([0, flueY + 0.12, 0]));
    kit.add('metal', cyl(0.15, 0.15, 0.05, 16), xf([0, ceiling - 0.05, 0]));
    kit.rod('metal', [-0.18, flueY + 0.35, 0], [0.2, flueY + 0.35, 0], 0.008, 5);
  }
  // steam main to the right, then up
  const py = 1.36;
  const pr = 0.045;
  kit.rod('metal', [R - 0.02, py, 0], [0.84, py, 0], pr, 12);
  kit.add('metal', torus(0.1, pr, 8, 6, Math.PI / 2), xf([0.84, py + 0.1, 0], [0, 0, -Math.PI / 2]));
  if (ceiling > py + 0.2) kit.rod('metal', [0.94, py + 0.1, 0], [0.94, ceiling, 0], pr, 12);
  kit.add('metal', cyl(0.08, 0.08, 0.03, 12), xf([0.6, py, 0], [0, 0, Math.PI / 2]));
  kit.add(BRASS(), sphere(0.065, 8, 5), xf([0.68, py, 0]));
  kit.rod('metal', [0.68, py, 0], [0.68, py + 0.14, 0], 0.01, 6);
  handWheel(kit, xf([0.68, py + 0.15, 0], [Math.PI / 2, 0, 0]), 0.07, 4, PAINT_RED());
  // feed water in on the left, down into the floor
  kit.rod('metal', [-R + 0.02, 0.56, 0.1], [-0.82, 0.56, 0.1], 0.035, 10);
  kit.add('metal', torus(0.08, 0.035, 8, 6, Math.PI / 2), xf([-0.82, 0.48, 0.1], [0, 0, Math.PI / 2]));
  kit.rod('metal', [-0.9, 0.48, 0.1], [-0.9, 0, 0.1], 0.035, 10);
  kit.add('metal', cyl(0.06, 0.06, 0.03, 10), xf([-0.9, 0.015, 0.1]));
  const obj = kit.build();
  obj.userData.collider = [{ min: [-0.62, 0, -0.62], max: [0.62, 2.0, 0.66] }];
  return obj;
}

// ---------- pipes ----------

function flange(kit, m, p, axisRot, r) {
  const M = xf(p, axisRot);
  kit.add(m, cyl(r * 1.55, r * 1.55, 0.028, 12), M);
  // bolt heads on both faces (flange axis = local Y)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    kit.add('metal', cyl(r * 0.16, r * 0.16, 0.042, 6, true), M.clone().multiply(xf([Math.cos(a) * r * 1.3, 0, Math.sin(a) * r * 1.3])));
  }
}

// Straight pipe along X, centred on the origin.
export function pipe(opts = {}) {
  const L = opts.length ?? 2;
  const r = opts.radius ?? 0.06;
  const m = opts.material ?? 'rust';
  const kit = new Kit();
  const rotX = [0, 0, Math.PI / 2];
  kit.add(m, cyl(r, r, L, 14, true, Math.max(1, Math.round(L))), xf([0, 0, 0], rotX));
  if (opts.flanges !== false) {
    for (const sx of [-1, 1]) flange(kit, 'metal', [sx * (L / 2 - 0.014), 0, 0], rotX, r);
  } else {
    for (const sx of [-1, 1]) kit.add('black', cyl(r * 0.9, r * 0.9, 0.004, 14), xf([sx * (L / 2 - 0.004), 0, 0], rotX));
  }
  // couplings every ~1.5 m
  const n = Math.floor(L / 1.5);
  for (let i = 1; i <= n; i++) {
    const x = -L / 2 + (i * L) / (n + 1);
    kit.add('metal', cyl(r * 1.18, r * 1.18, 0.09, 14), xf([x, 0, 0], rotX));
  }
  const obj = kit.build();
  const R = r * 1.6;
  obj.userData.collider = opts.solid ? [{ min: [-L / 2, -R, -R], max: [L / 2, R, R] }] : 'none';
  obj.userData.mount = 'axis';
  return obj;
}

// 90 degree elbow: corner at the origin, legs along -X and +Y.
export function pipeElbow(opts = {}) {
  const r = opts.radius ?? 0.06;
  const rb = opts.bend ?? r * 2;
  const leg = Math.max(opts.leg ?? 0.25, rb + 0.03);
  const m = opts.material ?? 'rust';
  const kit = new Kit();
  kit.rod(m, [-leg, 0, 0], [-rb, 0, 0], r, 14, r, true);
  kit.rod(m, [0, rb, 0], [0, leg, 0], r, 14, r, true);
  kit.add(m, torus(rb, r, 12, 8, Math.PI / 2), xf([-rb, rb, 0], [0, 0, -Math.PI / 2]));
  flange(kit, 'metal', [-leg + 0.014, 0, 0], [0, 0, Math.PI / 2], r);
  flange(kit, 'metal', [0, leg - 0.014, 0], [0, 0, 0], r);
  const obj = kit.build();
  const R = r * 1.6;
  obj.userData.collider = opts.solid ? [{ min: [-leg, -R, -R], max: [R, leg, R] }] : 'none';
  obj.userData.ends = [[-leg, 0, 0], [0, leg, 0]];
  obj.userData.mount = 'axis';
  return obj;
}

// ---------- storage ----------

function jar(kit, rng, x, y, z) {
  const r = rng.range(0.04, 0.058);
  const h = rng.range(0.11, 0.18);
  const fill = rng.range(0.55, 0.9);
  const col = rng.pick([0x4a4a22, 0x3a2a18, 0x4a1612, 0x2c3a26, 0x5a4c30]);
  kit.add(solid(col, { roughness: 0.2 }), cyl(r * 0.9, r * 0.9, h * fill, 8), xf([x, y + (h * fill) / 2 + 0.004, z]));
  kit.add(GLASS(), cyl(r, r, h, 8, true), xf([x, y + h / 2, z]));
  kit.add(rng.chance(0.5) ? 'rust' : 'metal', cyl(r * 0.95, r * 0.95, 0.018, 8), xf([x, y + h + 0.009, z]));
  return r * 2;
}

function can(kit, rng, x, y, z) {
  const r = rng.range(0.035, 0.06);
  const h = rng.range(0.08, 0.15);
  kit.add(rng.chance(0.6) ? 'rust' : 'metal', cyl(r, r, h, 8), xf([x, y + h / 2, z]));
  if (rng.chance(0.7)) kit.add(rng.chance(0.5) ? 'paper' : solid(0x3a2c24, { roughness: 0.9 }), cyl(r + 0.002, r + 0.002, h * 0.6, 8, true), xf([x, y + h / 2, z]));
  return r * 2;
}

function bottle(kit, rng, x, y, z) {
  const r = rng.range(0.028, 0.038);
  const h = rng.range(0.2, 0.28);
  kit.add('glass', lathe([[0, 0], [r, 0.002], [r, h * 0.62], [r * 0.4, h * 0.8], [r * 0.34, h], [0, h]], 8), xf([x, y, z]));
  return r * 2;
}

function carton(kit, rng, x, y, z) {
  const w = rng.range(0.12, 0.22);
  const h = rng.range(0.1, 0.2);
  const d = rng.range(0.18, 0.3);
  kit.add(CARD(), box(w, h, d), xf([x, y + h / 2, z], [0, rng.range(-0.15, 0.15), 0]));
  return w;
}

export function metalShelves(opts = {}) {
  const rng = makeRng(opts.seed ?? 4);
  const W = opts.width ?? 1.2;
  const D = 0.45;
  const H = 1.9;
  const kit = new Kit();
  const F = 'rust';
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.02);
      const z = sz * (D / 2 - 0.02);
      kit.add(F, box(0.04, H, 0.004), xf([x, H / 2, z + sz * 0.018]));
      kit.add(F, box(0.004, H, 0.04), xf([x + sx * 0.018, H / 2, z]));
      kit.add('metal', box(0.06, 0.008, 0.06), xf([x, 0.004, z]));
    }
  }
  // X brace on the back
  const bz = -D / 2 + 0.004;
  const a = Math.atan2(H - 0.2, W - 0.1);
  kit.add(F, box(Math.hypot(W - 0.1, H - 0.2), 0.03, 0.004), xf([0, H / 2, bz], [0, 0, a]));
  kit.add(F, box(Math.hypot(W - 0.1, H - 0.2), 0.03, 0.004), xf([0, H / 2, bz], [0, 0, -a]));
  const levels = [0.12, 0.6, 1.08, 1.56, 1.88];
  for (const y of levels) {
    kit.add('metal', box(W - 0.01, 0.012, D - 0.01), xf([0, y, 0]));
    for (const sz of [-1, 1]) kit.add(F, box(W, 0.035, 0.004), xf([0, y - 0.012, sz * (D / 2 - 0.004)]));
    for (const sx of [-1, 1]) kit.add(F, box(0.004, 0.035, D), xf([sx * (W / 2 - 0.004), y - 0.012, 0]));
  }
  // clutter
  for (let li = 0; li < levels.length - 1; li++) {
    const y = levels[li] + 0.006;
    let x = -W / 2 + 0.06;
    while (x < W / 2 - 0.1) {
      if (rng.chance(0.15)) {
        x += rng.range(0.06, 0.2);
        continue;
      }
      const z = rng.range(-0.08, 0.1);
      const kind = rng.pick(['jar', 'jar', 'jar', 'can', 'can', 'bottle', 'carton']);
      let w;
      if (kind === 'jar') w = jar(kit, rng, x + 0.05, y, z);
      else if (kind === 'can') w = can(kit, rng, x + 0.05, y, z);
      else if (kind === 'bottle') w = bottle(kit, rng, x + 0.04, y, z);
      else w = carton(kit, rng, x + 0.1, y, z - 0.02);
      x += w + rng.range(0.01, 0.04);
    }
  }
  const obj = kit.build();
  obj.userData.collider = [{ min: [-W / 2, 0, -D / 2], max: [W / 2, H, D / 2] }];
  return obj;
}

export function washtub(opts = {}) {
  const kit = new Kit();
  const prof = [
    [0, 0.0],
    [0.235, 0.0],
    [0.25, 0.012],
    [0.262, 0.08],
    [0.272, 0.09],
    [0.28, 0.1],
    [0.29, 0.18],
    [0.3, 0.19],
    [0.308, 0.2],
    [0.318, 0.285],
    [0.33, 0.292],
    [0.326, 0.302],
    [0.312, 0.298],
    [0.3, 0.2],
    [0.24, 0.022],
    [0, 0.018],
  ];
  kit.add('metal', lathe(prof, 20));
  for (const sx of [-1, 1]) {
    kit.add('metal', torus(0.045, 0.006, 5, 10, Math.PI), xf([sx * 0.318, 0.23, 0], [0, sx > 0 ? 0 : Math.PI, -Math.PI / 2]));
    kit.add('metal', box(0.012, 0.03, 0.1), xf([sx * 0.316, 0.23, 0]));
  }
  if (opts.water !== false) kit.add(MURK(), cyl(0.296, 0.296, 0.004, 20, true), xf([0, 0.19, 0]));
  if (opts.water !== false) kit.add(MURK(), new THREE.CircleGeometry(0.296, 20), xf([0, 0.192, 0], [-Math.PI / 2, 0, 0]));
  // washboard leaning in the tub
  const wb = xf([0.02, 0.27, -0.12], [-0.32, 0.2, 0]);
  const k2 = new Kit({ raw: true });
  for (const sx of [-1, 1]) k2.add('wood', box(0.03, 0.62, 0.025), xf([sx * 0.14, 0, 0]));
  k2.add('wood', box(0.31, 0.1, 0.03), xf([0, 0.26, 0]));
  k2.add('wood', box(0.31, 0.05, 0.03), xf([0, -0.22, 0]));
  for (let i = 0; i < 12; i++) k2.add('metal', box(0.26, 0.012, 0.008), xf([0, 0.19 - i * 0.032, 0.004], [0.6, 0, 0]));
  k2.add('metal', box(0.26, 0.38, 0.004), xf([0, 0.02, -0.002]));
  kit.addParts(k2.merged(), wb);
  const obj = kit.build();
  obj.userData.collider = [{ min: [-0.34, 0, -0.34], max: [0.34, 0.31, 0.34] }];
  return obj;
}

// ---------- barrels & crates ----------

// Wooden staves with flat shading across each stave.
function staves(N, H, rfn, hseg = 8, gap = 0.01) {
  const pos = [];
  const nor = [];
  const uvs = [];
  const idx = [];
  const n = new THREE.Vector3();
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * TAU + gap / 2;
    const a1 = ((k + 1) / N) * TAU - gap / 2;
    const ac = (a0 + a1) / 2;
    const base = pos.length / 3;
    for (let j = 0; j <= hseg; j++) {
      const y = (j / hseg) * H;
      const r = rfn(y);
      const dr = (rfn(y + 0.001) - rfn(y - 0.001)) / 0.002;
      n.set(Math.sin(ac), -dr, Math.cos(ac)).normalize();
      for (const a of [a0, a1]) {
        pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
        nor.push(n.x, n.y, n.z);
        uvs.push((a - a0) * r + k * 0.37, y);
      }
      if (j) {
        const b = base + (j - 1) * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

export function barrel(opts = {}) {
  const H = 0.86;
  const rfn = (y) => 0.25 + 0.045 * Math.sin((Math.min(Math.max(y, 0), H) / H) * Math.PI);
  const kit = new Kit();
  const wood = opts.rotten ? 'woodRotten' : 'wood';
  kit.add(wood, staves(16, H, rfn, 8));
  kit.add('black', cyl(0.245, 0.245, H - 0.02, 16, true), xf([0, H / 2, 0]));
  // inner chime + heads
  kit.add(wood, lathe([[0.245, H], [0.23, H - 0.03]], 16));
  kit.add(wood, cyl(0.235, 0.235, 0.02, 16), xf([0, H - 0.035, 0]));
  kit.add('black', box(0.46, 0.022, 0.006), xf([0, H - 0.034, 0.06]));
  kit.add('black', box(0.46, 0.022, 0.006), xf([0, H - 0.034, -0.08]));
  kit.add(wood, cyl(0.24, 0.24, 0.02, 16), xf([0, 0.03, 0]));
  for (const y of [0.07, 0.25, H - 0.25, H - 0.07]) {
    const r = rfn(y) + 0.004;
    kit.add('rust', cyl(r + 0.002, r - 0.002, 0.04, 24, true), xf([0, y, 0]));
  }
  // bung
  kit.add('woodDark', cyl(0.025, 0.025, 0.02, 8), xf([0, 0.43, rfn(0.43) + 0.002], [Math.PI / 2, 0, 0]));
  const obj = kit.build();
  obj.userData.collider = [{ min: [-0.3, 0, -0.3], max: [0.3, H, 0.3] }];
  return obj;
}

// Dented, rusted steel drum.
export function barrelRusted(opts = {}) {
  const rng = makeRng(opts.seed ?? 7);
  const H = 0.88;
  const R = 0.29;
  const kit = new Kit();
  const body = cyl(R, R, H, 24, true, 8);
  const dents = [];
  for (let i = 0; i < 3; i++) dents.push([rng.range(0, TAU), rng.range(0.15, 0.75) * H - H / 2, rng.range(0.03, 0.06)]);
  deform(body, (v) => {
    const a = Math.atan2(v.x, v.z);
    let d = fbm3(v.x * 6, v.y * 6, v.z * 6, 2, 3) * 0.012;
    for (const [da, dy, depth] of dents) {
      const dd = Math.hypot(Math.atan2(Math.sin(a - da), Math.cos(a - da)) * R, v.y - dy);
      if (dd < 0.14) d -= depth * (1 - dd / 0.14) ** 2;
    }
    const s = (R + d) / R;
    v.x *= s;
    v.z *= s;
  });
  kit.add('rust', body, xf([0, H / 2, 0]));
  for (const y of [H / 3, (2 * H) / 3]) kit.add('rust', torus(R + 0.004, 0.012, 3, 24), xf([0, y, 0], [Math.PI / 2, 0, 0]));
  for (const y of [0.01, H - 0.01]) kit.add('metal', torus(R, 0.012, 3, 24), xf([0, y, 0], [Math.PI / 2, 0, 0]));
  const open = opts.open ?? false;
  if (open) {
    kit.add(MURK(), cyl(R - 0.01, R - 0.01, 0.004, 24), xf([0, H - 0.12, 0]));
    kit.add('rust', cyl(R - 0.005, R - 0.005, H - 0.12, 24, true), xf([0, (H - 0.12) / 2, 0]));
  } else {
    kit.add('rust', cyl(R - 0.004, R - 0.004, 0.01, 24), xf([0, H - 0.018, 0]));
    kit.add('metal', cyl(0.03, 0.03, 0.016, 8), xf([0.16, H - 0.008, 0.05]));
    kit.add('metal', cyl(0.018, 0.018, 0.014, 6), xf([-0.17, H - 0.008, -0.06]));
  }
  kit.add('rust', cyl(R - 0.004, R - 0.004, 0.01, 24), xf([0, 0.02, 0]));
  const obj = kit.build();
  obj.userData.collider = [{ min: [-R - 0.02, 0, -R - 0.02], max: [R + 0.02, H, R + 0.02] }];
  return obj;
}

function crate(kit, s, m) {
  const k = new Kit({ raw: true });
  const bw = 0.05;
  const t = 0.02;
  k.add('wood', box(s - 0.01, s - 0.01, s - 0.01), xf([0, s / 2, 0]));
  // plank seams
  for (const f of [-1, 1]) {
    for (let i = 1; i < 4; i++) {
      const o = -s / 2 + (i * s) / 4;
      k.add('black', box(s - 0.02, 0.006, 0.004), xf([0, o + s / 2, f * (s / 2 - 0.004)]));
      k.add('black', box(0.004, 0.006, s - 0.02), xf([f * (s / 2 - 0.004), o + s / 2, 0]));
    }
  }
  // edge battens
  const e = s / 2 - bw / 2 + 0.005;
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      k.add('woodDark', box(bw, s, bw), xf([a * (s / 2 - bw / 2 + 0.005), s / 2, b * (s / 2 - bw / 2 + 0.005)]));
      k.add('woodDark', box(s, bw, bw), xf([0, s / 2 + a * e, b * (s / 2 - bw / 2 + 0.005)]));
      k.add('woodDark', box(bw, bw, s), xf([a * (s / 2 - bw / 2 + 0.005), s / 2 + b * e, 0]));
    }
  }
  // diagonal braces on the four sides
  const diag = Math.hypot(s - bw * 2, s - bw * 2);
  for (const f of [-1, 1]) {
    k.add('woodDark', box(diag, bw * 0.8, t), xf([0, s / 2, f * (s / 2 + 0.004)], [0, 0, Math.PI / 4]));
    k.add('woodDark', box(t, bw * 0.8, diag), xf([f * (s / 2 + 0.004), s / 2, 0], [Math.PI / 4, 0, 0]));
  }
  kit.addParts(k.merged(), m);
}

export function crateStack(opts = {}) {
  const rng = makeRng(opts.seed ?? 12);
  const kit = new Kit();
  const colliders = [];
  const place = (s, x, y, z, yaw) => {
    crate(kit, s, xf([x, y, z], [0, yaw, 0]));
    const e = (s / 2) * (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw)));
    colliders.push({ min: [x - e, y, z - e], max: [x + e, y + s, z + e] });
  };
  const count = opts.count ?? rng.int(2, 4);
  const a = rng.range(0.55, 0.7);
  const b = rng.range(0.5, 0.65);
  place(a, -a / 2 - 0.01, 0, 0, rng.range(-0.08, 0.08));
  if (count >= 2) place(b, b / 2 + 0.02, 0, rng.range(-0.08, 0.08), rng.range(-0.15, 0.15));
  if (count >= 3) {
    const c = rng.range(0.45, 0.55);
    place(c, -a / 2 + rng.range(0, 0.2), a, rng.range(-0.05, 0.05), rng.range(-0.3, 0.3));
  }
  if (count >= 4) {
    const d = rng.range(0.45, 0.6);
    place(d, rng.range(-0.1, 0.1), 0, -Math.max(a, b) / 2 - d / 2 - 0.03, rng.range(-0.2, 0.2));
  }
  const obj = kit.build();
  obj.userData.collider = colliders;
  return obj;
}

// ---------- workbench ----------

export function workbench(opts = {}) {
  const rng = makeRng(opts.seed ?? 14);
  const kit = new Kit();
  const W = 1.8;
  const D = 0.72;
  const top = 0.9;
  for (let i = 0; i < 3; i++) kit.add('wood', box(W, 0.055, D / 3 - 0.006), xf([0, top - 0.0275, -D / 3 + i * (D / 3)]));
  kit.add('woodDark', box(W, 0.12, 0.03), xf([0, top - 0.11, D / 2 - 0.02]));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) kit.add('woodDark', box(0.08, top - 0.055, 0.08), xf([sx * (W / 2 - 0.08), (top - 0.055) / 2, sz * (D / 2 - 0.07)]));
    kit.add('woodDark', box(0.06, 0.08, D - 0.1), xf([sx * (W / 2 - 0.08), 0.2, 0]));
  }
  for (const sz of [-1, 1]) kit.add('woodDark', box(W - 0.16, 0.08, 0.05), xf([0, 0.2, sz * (D / 2 - 0.07)]));
  for (let i = 0; i < 4; i++) kit.add('wood', box(W - 0.2, 0.025, 0.13), xf([0, 0.25, -0.24 + i * 0.16]));
  // bench vice on the front-left corner
  const vx = -W / 2 + 0.25;
  const vz = D / 2 + 0.03;
  kit.add('metal', box(0.18, 0.12, 0.05), xf([vx, top - 0.02, vz]));
  kit.add('metal', box(0.18, 0.12, 0.05), xf([vx, top - 0.02, vz + 0.1]));
  kit.rod('metal', [vx, top - 0.04, vz], [vx, top - 0.04, vz + 0.2], 0.012, 6);
  kit.rod('metal', [vx - 0.12, top - 0.04, vz + 0.2], [vx + 0.12, top - 0.04, vz + 0.2], 0.007, 6);
  for (const sx of [-1, 1]) kit.add('metal', sphere(0.014, 6, 4), xf([vx + sx * 0.12, top - 0.04, vz + 0.2]));
  // tools on top
  const T = top;
  // claw hammer
  kit.add('wood', cyl(0.013, 0.015, 0.3, 8), xf([0.1, T + 0.015, 0.1], [0, 0, Math.PI / 2 - 0.05], [1, 1, 0.8]));
  kit.add('metal', box(0.03, 0.028, 0.11), xf([-0.05, T + 0.02, 0.1]));
  kit.add('metal', box(0.022, 0.02, 0.07), xf([-0.05, T + 0.02, 0.17], [0.3, 0, 0]));
  // wrench
  kit.add('metal', box(0.22, 0.008, 0.026), xf([0.45, T + 0.004, 0.18], [0, 0.4, 0]));
  kit.add('metal', box(0.05, 0.01, 0.05), xf([0.35, T + 0.005, 0.22], [0, 0.4, 0]));
  // hand saw
  const saw = xf([0.55, T + 0.002, -0.12], [0, -0.25, 0]);
  const ks = new Kit({ raw: true });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.42, 0.015);
  shape.lineTo(0.42, 0.06);
  shape.lineTo(0, 0.11);
  shape.closePath();
  const bladeGeo = new THREE.ShapeGeometry(shape);
  ks.add('metal', bladeGeo, xf([-0.3, 0, 0], [-Math.PI / 2, 0, 0]));
  ks.add('wood', box(0.11, 0.022, 0.12), xf([-0.34, 0.01, -0.06]));
  kit.addParts(ks.merged(), saw);
  // screwdrivers
  for (let i = 0; i < 2; i++) {
    const z = -0.2 + i * 0.05;
    kit.add(i ? PAINT_RED() : 'woodDark', cyl(0.013, 0.013, 0.1, 8), xf([-0.35, T + 0.013, z], [0, 0, Math.PI / 2]));
    kit.add('metal', cyl(0.003, 0.003, 0.14, 5), xf([-0.47, T + 0.013, z], [0, 0, Math.PI / 2]));
  }
  // coffee can of nails
  kit.add('rust', cyl(0.06, 0.06, 0.13, 12), xf([-0.6, T + 0.065, -0.2]));
  kit.add('metal', cyl(0.055, 0.055, 0.004, 12), xf([-0.6, T + 0.12, -0.2]));
  // oil can
  kit.add('metal', lathe([[0, 0], [0.06, 0], [0.06, 0.05], [0.015, 0.1], [0, 0.1]], 12), xf([0.78, T, 0.02]));
  kit.rod('metal', [0.78, T + 0.1, 0.02], [0.66, T + 0.2, 0.02], 0.004, 5, 0.002);
  // rag
  const rag = roundBox(0.24, 0.03, 0.18, 0.8, 10, 6);
  deform(rag, (v) => {
    v.y += fbm3(v.x * 18, 0, v.z * 18, 2, rng.int(0, 99)) * 0.03;
  });
  kit.add('cloth', rag, xf([0.2, T + 0.012, -0.18], [0, 0.4, 0]));
  const obj = kit.build();
  obj.userData.collider = [{ min: [-W / 2, 0, -D / 2], max: [W / 2, top + 0.05, D / 2 + 0.05] }];
  return obj;
}

// ---------- grate ----------

export function grate(opts = {}) {
  const S = 1.2;
  const topY = 0.02;
  const inner = S - 0.14;
  const kit = new Kit();
  const M = 'rust';
  // angle-iron frame: top flange + downstand
  for (const s of [-1, 1]) {
    kit.add(M, box(S, 0.014, 0.07), xf([0, topY - 0.007, s * (S / 2 - 0.035)]));
    kit.add(M, box(0.07, 0.014, S - 0.14), xf([s * (S / 2 - 0.035), topY - 0.007, 0]));
    kit.add(M, box(S - 0.1, 0.1, 0.012), xf([0, topY - 0.06, s * (inner / 2 + 0.006)]));
    kit.add(M, box(0.012, 0.1, inner), xf([s * (inner / 2 + 0.006), topY - 0.06, 0]));
  }
  // frame hinge knuckles (back edge)
  for (const x of [-0.4, 0.4]) kit.add('metal', cyl(0.018, 0.018, 0.08, 8), xf([x, topY + 0.004, -inner / 2 - 0.01], [0, 0, Math.PI / 2]));
  // pry notch on the front edge
  kit.add('black', box(0.1, 0.012, 0.03), xf([0, topY - 0.004, inner / 2 + 0.02]));
  if (opts.pit) {
    const d = opts.pit;
    for (const s of [-1, 1]) {
      kit.add('stoneWet', box(inner, d, 0.02), xf([0, -d / 2 - 0.1, s * inner / 2]));
      kit.add('stoneWet', box(0.02, d, inner), xf([s * inner / 2, -d / 2 - 0.1, 0]));
    }
    kit.add('black', box(inner, 0.02, inner), xf([0, -d - 0.1, 0]));
  }
  const obj = kit.build();
  // hinged bar panel; pivot on the back edge at the top surface
  const bars = new THREE.Group();
  bars.name = 'bars';
  bars.position.set(0, topY, -inner / 2);
  const bk = new Kit();
  const P = inner - 0.01;
  const n = 21;
  for (let i = 0; i < n; i++) {
    const x = -P / 2 + 0.02 + (i * (P - 0.04)) / (n - 1);
    bk.add(M, box(0.009, 0.05, P), xf([x, -0.025, P / 2]));
  }
  for (let i = 0; i < 5; i++) bk.add(M, cyl(0.007, 0.007, P, 6), xf([0, -0.006, 0.04 + (i * (P - 0.08)) / 4], [0, 0, Math.PI / 2]));
  for (const s of [-1, 1]) bk.add(M, box(0.02, 0.05, P), xf([s * (P / 2 - 0.01), -0.025, P / 2]));
  bk.add(M, box(P, 0.05, 0.02), xf([0, -0.025, P - 0.01]));
  bk.add(M, box(P, 0.05, 0.02), xf([0, -0.025, 0.01]));
  bk.add('metal', cyl(0.016, 0.016, 0.7, 8), xf([0, 0.004, -0.01], [0, 0, Math.PI / 2]));
  // lifting ring at the front
  bk.add('metal', torus(0.035, 0.006, 5, 12, Math.PI), xf([0, 0.003, P - 0.06], [-Math.PI / 2, 0, 0]));
  bk.build(bars);
  obj.add(bars);
  obj.userData.bars = bars;
  obj.userData.dynamic = true;
  obj.userData.collider = 'none';
  return obj;
}

// ---------- valve socket ----------

// Wall-mounted valve stem with a bare square spindle (the wheel is missing).
export function valveSocket() {
  const kit = new Kit();
  const rz = [Math.PI / 2, 0, 0];
  kit.add('rust', cyl(0.12, 0.12, 0.022, 20), xf([0, 0, 0.011], rz));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    boltHead(kit, 'metal', [Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0.022], 0.012, 0.012);
  }
  kit.add('rust', cyl(0.046, 0.05, 0.16, 14), xf([0, 0, 0.1], rz));
  kit.add('metal', cyl(0.07, 0.07, 0.025, 14), xf([0, 0, 0.18], rz));
  kit.add('rust', sphere(0.075, 14, 10), xf([0, 0, 0.23], [0, 0, 0], [1, 1, 0.8]));
  kit.add('rust', cyl(0.05, 0.05, 0.04, 14), xf([0, 0, 0.29], rz));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    boltHead(kit, 'metal', [Math.cos(a) * 0.058, Math.sin(a) * 0.058, 0.3], 0.009, 0.008);
  }
  kit.add('metal', cyl(0.038, 0.038, 0.035, 6), xf([0, 0, 0.325], rz));
  kit.add('metal', cyl(0.014, 0.014, 0.02, 8), xf([0, 0, 0.35], rz));
  // direction plate above
  kit.add('rust', box(0.16, 0.06, 0.01), xf([0, 0.17, 0.005]));
  kit.add('metal', torus(0.018, 0.004, 4, 10, Math.PI * 1.4), xf([-0.03, 0.17, 0.012]));
  kit.add('metal', cyl(0, 0.008, 0.016, 4), xf([-0.048, 0.162, 0.012], [0, 0, 0.5]));
  const obj = kit.build();
  // slot: wheel hub bottom sits here; wheel axis along +Z; spin slot.rotation.z
  const slot = new THREE.Group();
  slot.name = 'slot';
  slot.position.set(0, 0, 0.36);
  const sk = new Kit();
  sk.add('metal', box(0.024, 0.024, 0.075), xf([0, 0, 0.03]));
  sk.add('metal', cyl(0.006, 0.006, 0.01, 6), xf([0, 0, 0.07], rz));
  sk.build(slot);
  obj.add(slot);
  obj.userData.slot = slot;
  obj.userData.dynamic = true;
  obj.userData.mount = 'wall';
  obj.userData.collider = [{ min: [-0.13, -0.13, 0], max: [0.13, 0.2, 0.44] }];
  return obj;
}

// ---------- sluice gate ----------

export function sluiceGate(opts = {}) {
  const w = opts.w ?? 2.4;
  const h = opts.h ?? 2.6;
  const rng = makeRng(opts.seed ?? 6);
  const postW = 0.5;
  const postD = 0.7;
  const headH = 0.8;
  const top = h + headH;
  const kit = new Kit();
  const wetLine = opts.wetLine ?? 1.1;
  const block = (cx, cz, bw, bd, y0, y1) => {
    let y = y0;
    while (y < y1 - 0.01) {
      const bh = Math.min(rng.range(0.34, 0.52), y1 - y);
      const m = y + bh / 2 < wetLine ? 'stoneWet' : 'stone';
      kit.add(m, box(bw - 0.02 + rng.range(-0.01, 0.01), bh - 0.014, bd - 0.02), xf([cx + rng.range(-0.006, 0.006), y + bh / 2, cz]));
      y += bh;
    }
  };
  for (const sx of [-1, 1]) {
    const cx = sx * (w / 2 + postW / 2);
    block(cx, 0, postW, postD, 0, h);
    kit.add('black', box(postW - 0.05, h, postD - 0.05), xf([cx, h / 2, 0]));
  }
  // lintel: voussoir-like blocks with a slot for the gate
  const span = w + postW * 2;
  const nb = 5;
  for (let i = 0; i < nb; i++) {
    const bw = span / nb;
    const x = -span / 2 + bw * (i + 0.5);
    for (const sz of [-1, 1]) {
      kit.add('stone', box(bw - 0.014, headH - 0.014, postD / 2 - 0.06), xf([x, h + headH / 2, sz * (postD / 4 + 0.03)]));
    }
  }
  // iron guide channels
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 + 0.01);
    kit.add('rust', box(0.02, top, 0.2), xf([x + sx * 0.02, top / 2, 0]));
    for (const sz of [-1, 1]) kit.add('rust', box(0.08, top, 0.016), xf([x - sx * 0.02, top / 2, sz * 0.058]));
    for (let i = 0; i < 6; i++) boltHead(kit, 'metal', [x - sx * 0.03, 0.3 + (i * (top - 0.5)) / 5, 0.066], 0.012, 0.008);
  }
  // lifting gear on top of the lintel
  kit.add('rust', box(0.5, 0.34, 0.36), xf([0, top + 0.17, 0]));
  kit.add('metal', box(0.56, 0.04, 0.42), xf([0, top + 0.02, 0]));
  kit.add('rust', cyl(0.14, 0.14, 0.12, 16), xf([0, top + 0.2, 0.2], [Math.PI / 2, 0, 0]));
  kit.rod('metal', [0, top + 0.2, 0.2], [0, top + 0.2, 0.36], 0.02, 8);
  handWheel(kit, xf([0, top + 0.2, 0.37]), 0.2, 5, 'rust');
  const obj = kit.build();
  // gate panel (raise gate.position.y to open)
  const gate = new THREE.Group();
  gate.name = 'gate';
  const gk = new Kit();
  const gw = w + 0.08;
  const gh = h + 0.1;
  gk.add('rust', box(gw, gh, 0.05), xf([0, gh / 2, 0]));
  for (let i = 0; i < 5; i++) {
    const y = 0.15 + (i * (gh - 0.3)) / 4;
    gk.add('rust', box(gw - 0.1, 0.08, 0.03), xf([0, y, 0.04]));
    gk.add('rust', box(gw - 0.1, 0.08, 0.03), xf([0, y, -0.04]));
    for (let j = 0; j < 9; j++) rivet(gk, 'metal', [-gw / 2 + 0.12 + (j * (gw - 0.24)) / 8, y, 0.055], [0, 0, 1], 0.01);
  }
  for (const sx of [-1, 0, 1]) gk.add('rust', box(0.08, gh - 0.1, 0.03), xf([sx * (gw / 2 - 0.3), gh / 2, 0.04]));
  // stem that rides up through the gearbox
  gk.add('metal', box(0.14, 0.1, 0.1), xf([0, gh + 0.03, 0]));
  gk.rod('metal', [0, gh, 0], [0, top + 0.5, 0], 0.03, 10);
  gk.build(gate);
  obj.add(gate);
  const gateBox = { min: [-w / 2, 0, -0.08], max: [w / 2, gh, 0.08] };
  obj.userData.gate = gate;
  obj.userData.dynamic = true;
  obj.userData.collider = [
    { min: [-w / 2 - postW, 0, -postD / 2], max: [-w / 2, top, postD / 2] },
    { min: [w / 2, 0, -postD / 2], max: [w / 2 + postW, top, postD / 2] },
    { min: [-w / 2, h, -postD / 2], max: [w / 2, top, postD / 2] },
    gateBox,
  ];
  obj.userData.gateCollider = gateBox;
  obj.userData.gateColliderIndex = 3;
  obj.userData.travel = gh;
  return obj;
}

// ---------- ladder / railing ----------

// Iron staple rungs set into a wall; origin on the floor at the wall.
export function ladder(opts = {}) {
  const H = opts.height ?? 3;
  const kit = new Kit();
  const M = 'rust';
  const out = 0.16;
  const half = 0.2;
  const rungs = Math.max(2, Math.floor((H - 0.1) / 0.3));
  for (let i = 0; i < rungs; i++) {
    const y = 0.3 + i * 0.3;
    if (y > H - 0.05) break;
    kit.rod(M, [-half, y, out], [half, y, out], 0.013, 6, 0.013, true);
    for (const sx of [-1, 1]) {
      kit.rod(M, [sx * half, y, 0], [sx * half, y, out], 0.013, 6, 0.013, true);
      kit.add(M, sphere(0.0135, 6, 3), xf([sx * half, y, out]));
      kit.add('metal', box(0.05, 0.05, 0.01), xf([sx * half, y, 0.005]));
    }
  }
  const obj = kit.build();
  obj.userData.collider = 'none';
  obj.userData.mount = 'wall';
  obj.userData.climb = { bottom: [0, 0, 0.4], top: [0, H, 0.4] };
  return obj;
}

// Walkway railing along X, centred; origin on the floor.
export function railing(opts = {}) {
  const L = opts.length ?? 3;
  const kit = new Kit();
  const M = 'rust';
  const n = Math.max(1, Math.ceil(L / 1.2));
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + (i * L) / n;
    const xi = Math.min(Math.max(x, -L / 2 + 0.025), L / 2 - 0.025);
    kit.add(M, box(0.045, 1.02, 0.045), xf([xi, 0.51, 0]));
    kit.add('metal', box(0.1, 0.012, 0.1), xf([xi, 0.006, 0]));
    for (const dx of [-0.035, 0.035]) boltHead(kit, 'metal', [xi + dx, 0.012, 0.035], 0.008, 0.006, [0, 1, 0]);
  }
  kit.rod(M, [-L / 2, 1.03, 0], [L / 2, 1.03, 0], 0.024, 10);
  kit.rod(M, [-L / 2, 0.55, 0], [L / 2, 0.55, 0], 0.016, 8);
  kit.add(M, box(L, 0.1, 0.008), xf([0, 0.07, 0.03]));
  const obj = kit.build();
  obj.userData.collider = [{ min: [-L / 2, 0, -0.05], max: [L / 2, 1.06, 0.05] }];
  return obj;
}

// ---------- pump ----------

export function pumpMachine(opts = {}) {
  const ceiling = opts.ceiling ?? 2.8;
  const kit = new Kit();
  kit.add('concrete', box(1.5, 0.2, 0.8), xf([0, 0.1, 0]));
  const rx = [0, 0, Math.PI / 2];
  // pump volute
  const vx = -0.3;
  const vy = 0.5;
  kit.add('rust', cyl(0.24, 0.24, 0.18, 20), xf([vx, vy, 0], rx));
  kit.add('rust', torus(0.2, 0.06, 6, 16), xf([vx, vy, 0], [0, Math.PI / 2, 0]));
  kit.add('rust', box(0.3, 0.12, 0.24), xf([vx, 0.26, 0]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    rivet(kit, 'metal', [vx + 0.09, vy + Math.cos(a) * 0.2, Math.sin(a) * 0.2], [1, 0, 0], 0.012);
  }
  // bearing pedestal and shaft
  kit.add('rust', box(0.16, 0.26, 0.22), xf([0.02, 0.33, 0]));
  kit.add('metal', cyl(0.07, 0.07, 0.18, 12), xf([0.02, vy, 0], rx));
  kit.rod('metal', [vx, vy, 0], [0.42, vy, 0], 0.03, 10);
  // big spoked flywheel / pulley
  const fx = 0.36;
  const fr = 0.38;
  kit.add('metal', cyl(fr, fr, 0.09, 24, true), xf([fx, vy + 0.05, 0], rx));
  kit.add('metal', cyl(fr - 0.03, fr - 0.03, 0.09, 24, true), xf([fx, vy + 0.05, 0], rx));
  for (const sx of [-1, 1]) kit.add('metal', new THREE.RingGeometry(fr - 0.03, fr, 24, 1), xf([fx + sx * 0.045, vy + 0.05, 0], [0, sx * Math.PI / 2, 0]));
  kit.add('metal', cyl(0.07, 0.07, 0.12, 12), xf([fx, vy + 0.05, 0], rx));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    kit.rod('metal', [fx, vy + 0.05 + Math.cos(a) * 0.06, Math.sin(a) * 0.06], [fx, vy + 0.05 + Math.cos(a) * (fr - 0.03), Math.sin(a) * (fr - 0.03)], 0.018, 5, 0.014, true);
  }
  // motor with belt
  const mx = 0.5;
  const my = 0.34;
  kit.add('metal', cyl(0.14, 0.14, 0.34, 16), xf([mx + 0.1, my - 0.08, -0.26], rx));
  for (let i = 0; i < 5; i++) kit.add('metal', cyl(0.155, 0.155, 0.015, 14, true), xf([mx + 0.0 + i * 0.05, my - 0.08, -0.26], rx));
  kit.add('rust', sphere(0.13, 12, 6, 0, TAU, 0, Math.PI / 2), xf([mx + 0.27, my - 0.08, -0.26], [0, 0, -Math.PI / 2], [1, 0.4, 1]));
  kit.add('metal', box(0.1, 0.08, 0.1), xf([mx + 0.1, my + 0.1, -0.26]));
  kit.rod('metal', [mx + 0.1, my + 0.14, -0.26], [mx + 0.1, my + 0.14, -0.4], 0.012, 6);
  kit.add('metal', cyl(0.07, 0.07, 0.07, 12), xf([fx, my - 0.08, -0.26], rx));
  kit.rod('metal', [fx, my - 0.08, -0.26], [mx + 0.1, my - 0.08, -0.26], 0.02, 8);
  // belt: loop around the flywheel and the motor pulley
  const belt = [];
  const c1 = v3(0, vy + 0.05, 0);
  const c2 = v3(0, my - 0.08, -0.26);
  const r1 = fr + 0.012;
  const r2 = 0.08;
  const d = c2.clone().sub(c1);
  const L = d.length();
  const ang = Math.atan2(d.z, d.y);
  const phi = Math.acos((r1 - r2) / L);
  const arc = (c, r, a0, a1, n) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      belt.push(v3(fx, c.y + Math.cos(a) * r, c.z + Math.sin(a) * r));
    }
  };
  arc(c1, r1, ang + phi, ang + TAU - phi, 18);
  arc(c2, r2, ang - phi, ang + phi, 6);
  kit.add('black', tube(belt, { segs: 40, radial: 4, radius: 0.012, sx: 3, sy: 0.4, closed: true }));
  // suction + discharge
  kit.rod('rust', [vx - 0.09, vy, 0], [-0.62, vy, 0], 0.07, 12);
  kit.add('rust', torus(0.12, 0.07, 10, 6, Math.PI / 2), xf([-0.62, vy - 0.12, 0], [0, 0, Math.PI / 2]));
  kit.rod('rust', [-0.74, vy - 0.12, 0], [-0.74, 0, 0], 0.07, 12);
  kit.add('metal', cyl(0.11, 0.11, 0.03, 12), xf([-0.74, 0.02, 0]));
  kit.rod('rust', [vx, vy + 0.24, 0], [vx, ceiling, 0], 0.06, 12);
  kit.add('metal', cyl(0.095, 0.095, 0.03, 12), xf([vx, vy + 0.3, 0]));
  kit.add('metal', cyl(0.095, 0.095, 0.03, 12), xf([vx, 1.4, 0]));
  kit.rod('metal', [vx, 1.1, 0.06], [vx, 1.1, 0.14], 0.01, 6);
  gauge(kit, xf([vx, 1.1, 0.15]), 0.055);
  const obj = kit.build();
  obj.userData.collider = [{ min: [-0.8, 0, -0.42], max: [0.78, 0.95, 0.42] }];
  return obj;
}
