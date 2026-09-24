import * as THREE from 'three';
import { makeRng } from '../../../core/rng.js';
import { getMaterial, solid, getDecalMaterial } from '../../materials.js';
import { Kit, TAU, UP, v3, toV, xf, box, cyl, sphere, torus, lathe, tube, ico, deform, invert, facet, smoothNormals, fbm3 } from './kit.js';

// Flesh caves and the heart: organic props. Glowing tissue carries the light.

const FLESH_LIGHT = 0xff2a2a;
const MEMBRANE_SKIN = () => solid(0x8a1c18, { roughness: 0.2, transparent: true, opacity: 0.36, emissive: 0x2a0303, emissiveIntensity: 1 });
const EGG_SHELL = () => solid(0x9c665c, { roughness: 0.32 });
const BLOOD_WET = () => solid(0x2a0305, { roughness: 0.08, metalness: 0.2 });

const clamp01 = (t) => Math.min(1, Math.max(0, t));

// Lumpy dome/mound on the floor.
function mound(kit, m, r, h, p = [0, 0, 0], seed = 1, bumpy = 0.4) {
  const g = sphere(r, 12, 5, 0, TAU, 0, Math.PI / 2);
  deform(g, (v) => {
    v.y *= h / r;
    const n = fbm3(v.x * 4 / r * 0.5, v.y * 4, v.z * 4 / r * 0.5, 3, seed);
    v.x *= 1 + n * bumpy;
    v.z *= 1 + n * bumpy;
    v.y *= 1 + n * bumpy * 0.8;
  });
  kit.add(m, g, xf(p));
}

// ---------- vein ----------

// Thick vein from opts.from to opts.to (local coords) sagging by opts.sag.
export function vein(opts = {}) {
  const from = toV(opts.from ?? [-1.5, 2.4, 0]);
  const to = toV(opts.to ?? [1.5, 2.2, 0]);
  const rng = makeRng(opts.seed ?? 31);
  const L = from.distanceTo(to);
  const sag = opts.sag ?? L * 0.15;
  const r = opts.radius ?? 0.07;
  const dir = to.clone().sub(from).normalize();
  let side = new THREE.Vector3().crossVectors(dir, UP);
  if (side.lengthSq() < 1e-4) side = v3(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(side, dir).normalize();
  const n = Math.max(5, Math.ceil(L / 0.3));
  const ph = rng.range(0, 10);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = from.clone().lerp(to, t);
    p.y -= sag * 4 * t * (1 - t);
    const env = Math.sin(t * Math.PI);
    p.addScaledVector(side, Math.sin(t * 7 + ph) * r * 0.8 * env);
    p.addScaledVector(up, Math.sin(t * 5 + ph * 2) * r * 0.5 * env);
    pts.push(p);
  }
  const kit = new Kit();
  const bulge = (t) => 1 + 0.22 * Math.sin(t * L * 5 + ph) + 0.35 * Math.exp(-(((t - 0.37) * 9) ** 2)) + 0.25 * Math.exp(-(((t - 0.71) * 11) ** 2));
  kit.add('fleshDark', tube(pts, { segs: n * 5, radial: 9, radius: (t) => r * bulge(t) * (0.75 + 0.25 * Math.sin(t * Math.PI)) }));
  // branches
  const branches = opts.branches ?? 2;
  const curve = new THREE.CatmullRomCurve3(pts);
  for (let b = 0; b < branches; b++) {
    const t0 = rng.range(0.2, 0.8);
    const p0 = curve.getPointAt(t0);
    const d = side.clone().multiplyScalar(rng.chance(0.5) ? 1 : -1).addScaledVector(dir, rng.range(-0.5, 0.5)).addScaledVector(up, rng.range(-0.6, 0.3)).normalize();
    const len = rng.range(0.3, 0.7);
    const bp = [p0, p0.clone().addScaledVector(d, len * 0.5).addScaledVector(up, -0.05), p0.clone().addScaledVector(d, len).addScaledVector(up, -0.12)];
    kit.add('fleshDark', tube(bp, { segs: 10, radial: 6, radius: (t) => r * 0.45 * (1 - t) + 0.004 }));
  }
  // anchoring knots
  for (const p of [from, to]) {
    const g = sphere(r * 2, 9, 7);
    deform(g, (v) => v.multiplyScalar(1 + fbm3(v.x * 20, v.y * 20, v.z * 20, 2, 5) * 0.6));
    kit.add('flesh', g, xf([p.x, p.y, p.z], [0, 0, 0], [1, 0.8, 1]));
  }
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// ---------- pod ----------

// Curled figure (fetal pose) facing +Z inside a pod; dark silhouette.
function fetalFigure(kit, m, s = 1) {
  const S = (x, y, z) => v3(x * s, y * s, z * s);
  kit.add(m, sphere(0.1 * s, 9, 7), xf([0, 0.7 * s, 0.09 * s], [0.6, 0, 0], [0.95, 1.12, 1.05]));
  kit.add(m, tube([S(0, 0.62, 0.0), S(0, 0.56, -0.1), S(0, 0.42, -0.14), S(0, 0.28, -0.08)], { segs: 8, radial: 6, radius: (t) => (0.1 - 0.015 * t + 0.02 * Math.sin(t * Math.PI)) * s, sx: 1.25 }));
  for (const sx of [-1, 1]) {
    kit.add(m, tube([S(sx * 0.07, 0.27, -0.05), S(sx * 0.07, 0.36, 0.08), S(sx * 0.06, 0.46, 0.16)], { segs: 5, radial: 5, radius: 0.06 * s }));
    kit.add(m, tube([S(sx * 0.06, 0.46, 0.16), S(sx * 0.06, 0.34, 0.14), S(sx * 0.05, 0.22, 0.05)], { segs: 5, radial: 5, radius: (t) => (0.048 - 0.012 * t) * s }));
    kit.add(m, tube([S(sx * 0.12, 0.57, -0.03), S(sx * 0.12, 0.47, 0.06), S(sx * 0.1, 0.4, 0.13)], { segs: 5, radial: 5, radius: 0.036 * s }));
    kit.add(m, tube([S(sx * 0.1, 0.4, 0.13), S(sx * 0.03, 0.39, 0.22), S(-sx * 0.04, 0.37, 0.21)], { segs: 5, radial: 5, radius: 0.03 * s }));
  }
}

const POD_PROFILE = [
  [0.1, 0.0],
  [0.2, 0.05],
  [0.3, 0.16],
  [0.355, 0.32],
  [0.36, 0.48],
  [0.33, 0.66],
  [0.26, 0.82],
  [0.16, 0.93],
  [0.08, 0.98],
];

export function pod(opts = {}) {
  const rng = makeRng(opts.seed ?? 41);
  const H = opts.height ?? 1.2;
  const s = H / 1.2;
  const kit = new Kit();
  mound(kit, 'fleshDark', 0.42 * s, 0.14 * s, [0, 0, 0], rng.int(0, 99));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rng.range(-0.3, 0.3);
    const len = rng.range(0.28, 0.5) * s;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const w = Math.sin(t * 4 + i) * 0.12;
      pts.push(v3(Math.cos(a + w) * (0.22 + t * len), (0.07 * (1 - t) + 0.012) * s, Math.sin(a + w) * (0.22 + t * len)));
    }
    kit.add('fleshDark', tube(pts, { segs: 8, radial: 5, radius: (t) => (0.065 * (1 - t) ** 1.5 + 0.01) * s * (1 + 0.15 * Math.sin(t * 17)), sx: 0.55, sy: 1.3 }));
  }
  kit.add('flesh', lathe([[0.16, 0.08], [0.11, 0.15], [0.1, 0.2], [0.12, 0.24]].map(([r, y]) => [r * s, y * s]), 12));
  const obj = kit.build();
  // pulsing body (pivot at the stalk top)
  const body = new THREE.Group();
  body.name = 'pulse';
  body.position.y = 0.2 * s;
  const bk = new Kit();
  const bh = 0.95 * s;
  const prof = POD_PROFILE.map(([r, y]) => [r * s, y * bh]);
  const seed = rng.int(0, 99);
  const lump = (v) => 1 + fbm3(v.x * 5, v.y * 5, v.z * 5, 3, seed) * 0.18;
  const outer = lathe(prof, 20);
  deform(outer, (v) => {
    const k = lump(v);
    v.x *= k;
    v.z *= k;
  });
  bk.add(MEMBRANE_SKIN(), outer);
  const glow = lathe(prof.map(([r, y]) => [r * 0.94, y * 0.985 + 0.01 * s]), 14);
  deform(glow, (v) => {
    const k = lump(v);
    v.x *= k;
    v.z *= k;
  });
  bk.add('podGlow', invert(glow));
  fetalFigure(bk, 'black', 1.02 * s);
  // surface veins
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * TAU + rng.range(-0.2, 0.2);
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = 0.03 + (k / 8) * 0.9;
      const idx = t * (prof.length - 1);
      const i0 = Math.floor(idx);
      const f = idx - i0;
      const [r0, y0] = prof[i0];
      const [r1, y1] = prof[Math.min(i0 + 1, prof.length - 1)];
      const a = a0 + Math.sin(t * 9 + i) * 0.25;
      const r = (r0 + (r1 - r0) * f) + 0.006;
      const p = v3(Math.sin(a) * r, y0 + (y1 - y0) * f, Math.cos(a) * r);
      const k2 = lump(p);
      p.x *= k2;
      p.z *= k2;
      pts.push(p);
    }
    bk.add('fleshDark', tube(pts, { segs: 12, radial: 4, radius: (t) => (0.016 - 0.01 * t) * s }));
  }
  // puckered crown
  bk.add('flesh', torus(0.075 * s, 0.03 * s, 5, 10), xf([0, bh * 0.975, 0], [Math.PI / 2, 0, 0]));
  bk.build(body);
  obj.add(body);
  obj.userData.pulse = body;
  obj.userData.dynamic = true;
  obj.userData.lights = [{ offset: [0, 0.2 * s + bh * 0.5, 0], color: FLESH_LIGHT, intensity: 1.6, distance: 5, flicker: 0.2, kind: 'flesh' }];
  obj.userData.collider = [{ min: [-0.4 * s, 0, -0.4 * s], max: [0.4 * s, H, 0.4 * s] }];
  return obj;
}

// ---------- sacs ----------

// Cluster of small glowing sacs. opts.mount: 'floor' (default) | 'wall' (+Z out).
export function sac(opts = {}) {
  const rng = makeRng(opts.seed ?? 43);
  const wall = opts.mount === 'wall';
  const kit = new Kit();
  const k = new Kit({ raw: true });
  const n = opts.count ?? rng.int(8, 11);
  const tmp = new Kit({ raw: true });
  mound(tmp, 'fleshDark', 0.32, 0.08, [0, 0, 0], rng.int(0, 99), 0.5);
  k.addParts(tmp.merged());
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const d = Math.sqrt(rng()) * 0.2;
    const r = rng.range(0.045, 0.1) * (1 - d * 1.5);
    const p = [Math.cos(a) * d, 0.035 + r * 0.8 + (0.2 - d) * 0.25, Math.sin(a) * d];
    const lean = [Math.sin(a) * d * 2, 0, -Math.cos(a) * d * 2];
    const M = xf(p, [lean[2], 0, lean[0]], [1, 1.25, 1]);
    k.add('podGlow', sphere(r * 0.78, 6, 5), M);
    k.add(MEMBRANE_SKIN(), sphere(r, 8, 6), M);
    if (rng.chance(0.4)) k.add('black', sphere(r * 0.32, 5, 4), M.clone().multiply(xf([r * 0.15, r * 0.1, r * 0.2], [0, 0, 0], [1, 1.3, 1])));
    // a vein strap over the sac
    const va = rng.range(0, TAU);
    const pts = [];
    for (let j = 0; j <= 6; j++) {
      const th = -Math.PI / 2 + (j / 6) * Math.PI;
      pts.push(v3(Math.cos(va) * Math.cos(th) * r * 1.02, Math.sin(th) * r * 1.02, Math.sin(va) * Math.cos(th) * r * 1.02));
    }
    k.add('fleshDark', tube(pts, { segs: 8, radial: 3, radius: r * 0.07 }), M);
  }
  const m = wall ? xf([0, 0, 0], [Math.PI / 2, 0, 0]) : undefined;
  kit.addParts(k.merged(), m);
  const obj = kit.build();
  obj.userData.collider = 'none';
  const off = wall ? [0, 0, 0.18] : [0, 0.18, 0];
  obj.userData.lights = [{ offset: off, color: FLESH_LIGHT, intensity: 0.9, distance: 3.5, flicker: 0.2, kind: 'flesh' }];
  if (wall) obj.userData.mount = 'wall';
  return obj;
}

// ---------- tendril ----------

export function tendril(opts = {}) {
  const L = opts.length ?? 1.5;
  const rng = makeRng(opts.seed ?? 45);
  const kit = new Kit();
  const ph = rng.range(0, TAU);
  const make = (x0, z0, len, r0, twist) => {
    const pts = [];
    const n = Math.max(6, Math.ceil(len / 0.12));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const curl = Math.max(0, (t - 0.75) / 0.25);
      const a = ph + twist + t * 2.5;
      pts.push(v3(x0 + Math.sin(a) * 0.1 * t + Math.cos(a * 3) * curl * 0.08, -t * len + curl * curl * 0.1, z0 + Math.cos(a) * 0.1 * t + Math.sin(a * 3) * curl * 0.08));
    }
    const g = tube(pts, { segs: n * 3, radial: 8, radius: (t) => (r0 * Math.pow(1 - t, 0.8) + 0.003) * (1 + 0.1 * Math.sin(t * len * 45)) });
    kit.add('flesh', g);
  };
  make(0, 0, L, 0.06, 0);
  const extra = opts.extra ?? 2;
  for (let i = 0; i < extra; i++) make(rng.range(-0.12, 0.12), rng.range(-0.12, 0.12), L * rng.range(0.35, 0.6), 0.03, rng.range(0, TAU));
  const g = sphere(0.16, 10, 6, 0, TAU, Math.PI / 2, Math.PI / 2);
  deform(g, (v) => {
    v.y *= 0.5;
    v.multiplyScalar(1 + fbm3(v.x * 12, v.y * 12, v.z * 12, 2, 7) * 0.6);
  });
  kit.add('fleshDark', g);
  const obj = kit.build();
  obj.userData.collider = 'none';
  obj.userData.mount = 'ceiling';
  return obj;
}

// ---------- pillar ----------

export function fleshPillar(opts = {}) {
  const H = opts.height ?? 3;
  const rng = makeRng(opts.seed ?? 51);
  const kit = new Kit();
  const rOf = (y) => {
    const b = Math.exp(-y / 0.35) * 0.45;
    const t = Math.exp(-(H - y) / 0.35) * 0.5;
    return 0.36 + b + t + 0.05 * Math.sin((y / H) * 7 + 1);
  };
  const prof = [];
  const N = Math.max(16, Math.ceil(H * 8));
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * H;
    prof.push([rOf(y), y]);
  }
  const seed = rng.int(0, 999);
  const knobs = [];
  for (let i = 0; i < 9; i++) knobs.push([rng.range(0, TAU), rng.range(0.4, H - 0.4), rng.range(0.1, 0.22), rng.range(0.05, 0.1)]);
  const disp = (x, y, z) => {
    const a = Math.atan2(x, z);
    let d = fbm3(x * 2.2, y * 1.6, z * 2.2, 3, seed) * 0.22;
    for (const [ka, ky, kr, kh] of knobs) {
      const da = Math.atan2(Math.sin(a - ka), Math.cos(a - ka)) * 0.4;
      const dd = Math.hypot(da, y - ky);
      if (dd < kr) d += kh * (1 - (dd / kr) ** 2);
    }
    return d;
  };
  const g = lathe(prof, 18);
  deform(g, (v) => {
    const r = Math.hypot(v.x, v.z) || 1;
    const d = disp(v.x, v.y, v.z);
    const k = (r + d) / r;
    v.x *= k;
    v.z *= k;
  });
  kit.add('flesh', g);
  // veins spiralling around the trunk
  for (let i = 0; i < 5; i++) {
    const a0 = rng.range(0, TAU);
    const twist = rng.range(-1.6, 1.6);
    const pts = [];
    const n = Math.ceil(H * 4);
    for (let k = 0; k <= n; k++) {
      const y = 0.15 + (k / n) * (H - 0.3);
      const a = a0 + twist * (y / H) + Math.sin(y * 3 + i) * 0.15;
      const dir = v3(Math.sin(a), 0, Math.cos(a));
      const r = rOf(y);
      const p = dir.clone().multiplyScalar(r);
      const d = disp(p.x, y, p.z);
      pts.push(v3(dir.x * (r + d + 0.012), y, dir.z * (r + d + 0.012)));
    }
    kit.add('fleshDark', tube(pts, { segs: n * 2, radial: 4, radius: (t) => 0.022 + 0.012 * Math.sin(t * 13 + i) }));
  }
  // bone nubs breaking through
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, TAU);
    const y = rng.range(0.6, H - 0.6);
    const dir = v3(Math.sin(a), rng.range(-0.3, 0.3), Math.cos(a)).normalize();
    const r = rOf(y) + disp(Math.sin(a) * rOf(y), y, Math.cos(a) * rOf(y));
    const base = v3(Math.sin(a) * r * 0.9, y, Math.cos(a) * r * 0.9);
    kit.add('bone', tube([base, base.clone().addScaledVector(dir, 0.14)], { segs: 4, radial: 6, radius: (t) => 0.035 * (1 - t) + 0.003 }));
  }
  const obj = kit.build();
  obj.userData.collider = [{ min: [-0.46, 0, -0.46], max: [0.46, H, 0.46] }];
  return obj;
}

// ---------- cocoon ----------

export function cocoon(opts = {}) {
  const drop = opts.drop ?? 0.4;
  const rng = makeRng(opts.seed ?? 53);
  const kit = new Kit();
  const top = -drop;
  const len = 1.775;
  // strands from the ceiling
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + rng.range(-0.4, 0.4);
    const sp = rng.range(0.18, 0.35);
    const pts = [v3(Math.cos(a) * sp, 0, Math.sin(a) * sp), v3(Math.cos(a) * sp * 0.5, top * 0.5, Math.sin(a) * sp * 0.5), v3(0, top - 0.05, 0)];
    kit.add('fleshDark', tube(pts, { segs: 8, radial: 5, radius: (t) => 0.035 - 0.015 * t }));
    const knot = sphere(0.06, 7, 5);
    deform(knot, (v) => v.multiplyScalar(1 + fbm3(v.x * 30, v.y * 30, v.z * 30, 2, i) * 0.6));
    kit.add('fleshDark', knot, xf([Math.cos(a) * sp, -0.02, Math.sin(a) * sp], [0, 0, 0], [1, 0.5, 1]));
  }
  // wrapped body (head up): human profile, flattened front to back
  const prof = [
    [0.0, 0.0], [0.04, 0.015], [0.07, 0.07], [0.085, 0.2], [0.1, 0.33], [0.095, 0.45], [0.12, 0.6], [0.145, 0.78],
    [0.16, 0.9], [0.145, 1.0], [0.155, 1.12], [0.175, 1.26], [0.185, 1.37], [0.15, 1.45], [0.07, 1.5], [0.075, 1.54],
    [0.1, 1.6], [0.105, 1.66], [0.09, 1.72], [0.05, 1.76], [0.0, 1.775],
  ];
  const g = lathe(prof.map(([r, y]) => [Math.max(r, 0.001), y]), 18);
  const seed = rng.int(0, 999);
  const widthAt = (y) => 1.1 + 0.3 * Math.exp(-((y - 1.36) ** 2) / 0.01) + 0.15 * Math.exp(-((y - 0.9) ** 2) / 0.02) - 0.12 * Math.exp(-((y - 1.64) ** 2) / 0.006);
  deform(g, (v) => {
    const y = v.y;
    const a = Math.atan2(v.x, v.z);
    v.x *= widthAt(y);
    v.z *= 0.82;
    // spiral wrap bands
    const band = Math.max(0, Math.sin(a * 2 + y * 26)) ** 3 * 0.014 * Math.min(1, y * 3);
    const n = fbm3(v.x * 6, y * 6, v.z * 6, 3, seed) * 0.04;
    const r = Math.hypot(v.x, v.z) || 1;
    const k = (r + band + n) / r;
    v.x *= k;
    v.z *= k;
    // face pressing through the membrane: brow, nose, open mouth
    const front = Math.max(0, Math.cos(a));
    v.z += Math.exp(-((y - 1.655) ** 2) / 0.0012) * front ** 6 * 0.012;
    v.z += Math.exp(-((y - 1.625) ** 2) / 0.0006) * front ** 16 * 0.022;
    v.z -= Math.exp(-((y - 1.585) ** 2) / 0.0004) * front ** 10 * 0.02;
    // crossed arms bulge on the chest
    v.z += Math.exp(-((y - 1.2) ** 2) / 0.004) * front ** 2 * 0.035;
  });
  kit.add('membrane', g, xf([0, top - len, 0]));
  kit.add('black', sphere(0.02, 6, 4), xf([0, top - len + 1.585, 0.068], [0, 0, 0], [1.1, 0.6, 0.4]));
  // wet sheen strands
  for (let i = 0; i < 3; i++) {
    const a = rng.range(-1, 1);
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const y = 0.25 + (k / 6) * 1.1;
      const pr = prof.find((p) => p[1] >= y) ?? [0.2, y];
      pts.push(v3(Math.sin(a + k * 0.3) * pr[0] * widthAt(y) * 1.04, top - len + y, Math.cos(a + k * 0.3) * pr[0] * 0.86));
    }
    kit.add('fleshDark', tube(pts, { segs: 14, radial: 4, radius: 0.01 }));
  }
  const obj = kit.build();
  obj.userData.collider = [{ min: [-0.32, top - len, -0.26], max: [0.32, top, 0.26] }];
  obj.userData.mount = 'ceiling';
  return obj;
}

// ---------- sphincter door ----------

// Fleshy iris blocking a 2.6 m tunnel; setOpen(0..1) dilates it.
export function sphincterDoor(opts = {}) {
  const D = opts.diameter ?? 2.6;
  const R = D / 2;
  const cy = R;
  const Rc = R + 0.1;
  const rng = makeRng(opts.seed ?? 61);
  const obj = new THREE.Group();
  const kit = new Kit();
  // rim with a variable tube radius (thin at the floor so the threshold is walkable)
  const NU = 44;
  const NV = 10;
  const pos = [];
  const uvs = [];
  const idx = [];
  const tubeR = (u) => 0.28 - 0.22 * Math.max(0, -Math.sin(u)) ** 2;
  const seed = rng.int(0, 999);
  for (let i = 0; i <= NU; i++) {
    const u = (i / NU) * TAU;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= NV; j++) {
      const w = (j / NV) * TAU;
      let rt = tubeR(u);
      const px = cu * (Rc + Math.cos(w) * rt);
      const py = su * (Rc + Math.cos(w) * rt);
      const pz = Math.sin(w) * rt * 0.9;
      rt *= 1 + fbm3(px * 2.5, py * 2.5, pz * 2.5, 3, seed) * 0.5;
      const x = cu * (Rc + Math.cos(w) * rt);
      const y = Math.max(-cy + 0.005, su * (Rc + Math.cos(w) * rt));
      pos.push(x, y + cy, Math.sin(w) * rt * 0.9);
      uvs.push(u * Rc, w * 0.25);
      if (i && j) {
        const a = (i - 1) * (NV + 1) + (j - 1);
        const b = i * (NV + 1) + (j - 1);
        const c = i * (NV + 1) + j;
        const d = (i - 1) * (NV + 1) + j;
        idx.push(a, b, d, b, c, d);
      }
    }
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rim.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  rim.setIndex(idx);
  smoothNormals(rim);
  kit.add('flesh', rim);
  // backing collar that blends into the tunnel walls
  const collar = new THREE.RingGeometry(Rc - 0.05, Rc + 0.9, 40, 3);
  deform(collar, (v) => {
    const n = fbm3(v.x * 1.8, v.y * 1.8, 0, 3, seed + 3);
    const r = Math.hypot(v.x, v.y);
    v.z = -0.12 + n * 0.25 * Math.min(1, (r - Rc) * 3);
    v.y = Math.max(-cy, v.y) + cy;
  });
  kit.add('fleshDark', collar);
  // radial veins on the collar
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + rng.range(-0.2, 0.2);
    if (Math.sin(a) < -0.7) continue;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const r = Rc + 0.12 + k * 0.17;
      const aa = a + Math.sin(k + i) * 0.06;
      pts.push(v3(Math.cos(aa) * r, Math.sin(aa) * r + cy, 0.1 - k * 0.04));
    }
    kit.add('fleshDark', tube(pts, { segs: 8, radial: 4, radius: (t) => 0.045 * (1 - t * 0.7) }));
  }
  // ring of small teeth on the inner lip
  for (let i = 0; i < 26; i++) {
    const u = (i / 26) * TAU + 0.06;
    if (Math.sin(u) < -0.55) continue;
    const rr = Rc - tubeR(u) * 0.75;
    const base = v3(Math.cos(u) * rr, Math.sin(u) * rr + cy, 0.17);
    const tip = base.clone().add(v3(-Math.cos(u) * 0.13, -Math.sin(u) * 0.13, 0.05));
    kit.add('bone', tube([base, tip], { segs: 2, radial: 4, radius: (t) => 0.028 * (1 - t) + 0.002 }));
  }
  kit.build(obj);
  // diaphragm: front surface (rim -> lip) then back surface (lip -> rim)
  const N = 40;
  const M = 8;
  const cols = 2 * M + 1;
  const dpos = new Float32Array((N + 1) * cols * 3);
  const duv = new Float32Array((N + 1) * cols * 2);
  const didx = [];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j < cols; j++) {
      duv[(i * cols + j) * 2] = (i / N) * TAU * 1.2;
      duv[(i * cols + j) * 2 + 1] = (j / (cols - 1)) * 2.5;
      if (i && j) {
        const a = (i - 1) * cols + (j - 1);
        const b = i * cols + (j - 1);
        const c = i * cols + j;
        const d = (i - 1) * cols + j;
        didx.push(a, b, d, b, c, d);
      }
    }
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dg.setAttribute('uv', new THREE.BufferAttribute(duv, 2));
  dg.setIndex(didx);
  const diaphragm = new THREE.Mesh(dg, getMaterial('flesh'));
  diaphragm.name = 'diaphragm';
  diaphragm.position.y = cy;
  obj.add(diaphragm);
  const K = 9;
  const setOpen = (t01) => {
    const t = clamp01(t01);
    const e = t * t * (3 - 2 * t);
    const rin = e * (R + 0.04);
    const T = 0.12 + 0.1 * e;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU;
      for (let j = 0; j < cols; j++) {
        const front = j <= M;
        const w = front ? 1 - j / M : (j - M) / M;
        const tw = th + (1 - e * 0.6) * 1.1 * Math.pow(1 - w, 1.6);
        const rho = rin + (Rc - rin) * w;
        const ridge = 0.5 + 0.5 * Math.cos(K * tw);
        const thick = T * Math.sqrt(w) * (1 - 0.3 * w) + ridge * 0.06 * Math.sqrt(w) * (1 - w) * (1 - e * 0.6);
        const bunch = e * 0.08 * Math.sin(w * Math.PI);
        const z = front ? thick + bunch : -(thick * 0.8 + bunch);
        const k = (i * cols + j) * 3;
        dpos[k] = Math.cos(tw) * rho;
        dpos[k + 1] = Math.max(-cy + 0.004, Math.sin(tw) * rho);
        dpos[k + 2] = z;
      }
    }
    dg.attributes.position.needsUpdate = true;
    dg.computeVertexNormals();
    // weld the seam normals
    const nrm = dg.attributes.normal;
    for (let j = 0; j < cols; j++) {
      const a = j;
      const b = N * cols + j;
      const nx = nrm.getX(a) + nrm.getX(b);
      const ny = nrm.getY(a) + nrm.getY(b);
      const nz = nrm.getZ(a) + nrm.getZ(b);
      const l = Math.hypot(nx, ny, nz) || 1;
      nrm.setXYZ(a, nx / l, ny / l, nz / l);
      nrm.setXYZ(b, nx / l, ny / l, nz / l);
    }
    dg.computeBoundingSphere();
    dg.computeBoundingBox();
    obj.userData.open = t;
  };
  setOpen(opts.open ?? 0);
  const closed = { min: [-R, 0, -0.35], max: [R, D, 0.35] };
  obj.userData.setOpen = setOpen;
  obj.userData.colliderClosed = closed;
  obj.userData.collider = [closed];
  obj.userData.diaphragm = diaphragm;
  obj.userData.dynamic = true;
  return obj;
}

// ---------- eggs ----------

export function eggCluster(opts = {}) {
  const rng = makeRng(opts.seed ?? 71);
  const n = opts.count ?? 9;
  const kit = new Kit();
  mound(kit, 'fleshDark', 0.5, 0.1, [0, 0, 0], rng.int(0, 99), 0.5);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const d = Math.sqrt(rng()) * 0.36;
    const r = rng.range(0.08, 0.14);
    const p = [Math.cos(a) * d, 0.05 + r * 1.1, Math.sin(a) * d];
    const tilt = [Math.sin(a) * d * 0.9, 0, -Math.cos(a) * d * 0.9];
    const torn = i === 0 || (i === 4 && n > 6);
    const g = torn ? sphere(r, 10, 7, 0, TAU, 0.9, Math.PI - 0.9) : sphere(r, 9, 7);
    const sd = rng.int(0, 99);
    deform(g, (v) => {
      // egg: narrower, pointed top
      const t = v.y / r;
      v.x *= 1 - 0.18 * Math.max(0, t);
      v.z *= 1 - 0.18 * Math.max(0, t);
      v.y *= 1.35;
      v.multiplyScalar(1 + fbm3(v.x * 25, v.y * 25, v.z * 25, 2, sd) * 0.14);
    });
    kit.add(i % 3 ? 'membrane' : EGG_SHELL(), g, xf(p, [tilt[2], 0, tilt[0]]));
    if (torn) {
      const inner = sphere(r * 0.96, 10, 6, 0, TAU, 0.9, Math.PI - 0.9);
      deform(inner, (v) => {
        v.y *= 1.35;
      }, false);
      kit.add('fleshDark', invert(inner), xf(p, [tilt[2], 0, tilt[0]]));
      kit.add('black', sphere(r * 0.8, 6, 4), xf([p[0], p[1] - r * 0.3, p[2]], [0, 0, 0], [1, 0.9, 1]));
    } else {
      const va = rng.range(0, TAU);
      for (let vv = 0; vv < 2; vv++) {
        const pts = [];
        const vb = va + vv * 2.4;
        for (let k = 0; k <= 6; k++) {
          const th = -1.2 + (k / 6) * 2.3;
          const shrink = 1 - 0.18 * Math.max(0, Math.sin(th));
          pts.push(v3(Math.cos(vb + k * 0.25) * Math.cos(th) * r * 1.02 * shrink, Math.sin(th) * r * 1.37, Math.sin(vb + k * 0.25) * Math.cos(th) * r * 1.02 * shrink));
        }
        kit.add('fleshDark', tube(pts, { segs: 8, radial: 3, radius: r * 0.05 }), xf(p, [tilt[2], 0, tilt[0]]));
      }
    }
  }
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// ---------- blood ----------

export function bloodPool(opts = {}) {
  const rng = makeRng(opts.seed ?? 81);
  const R = opts.radius ?? 0.8;
  const kit = new Kit();
  const blob = (r, y, m, seed, rings = 3, segs = 40, dome = 0.006) => {
    const pos = [0, y + dome, 0];
    const uvs = [0, 0];
    const idx = [];
    for (let k = 1; k <= rings; k++) {
      const f = k / rings;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * TAU;
        const rr = r * f * (1 + fbm3(Math.cos(a) * 1.5, Math.sin(a) * 1.5, seed, 3, seed) * 0.9);
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        pos.push(x, y + dome * (1 - f * f), z);
        uvs.push(x, z);
      }
    }
    for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
    for (let k = 1; k < rings; k++) {
      const a0 = 1 + (k - 1) * segs;
      const a1 = 1 + k * segs;
      for (let i = 0; i < segs; i++) {
        const i1 = (i + 1) % segs;
        idx.push(a0 + i, a0 + i1, a1 + i, a0 + i1, a1 + i1, a1 + i);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    kit.add(m, g);
  };
  blob(R * 1.25, 0.002, getDecalMaterial('bloodSmear'), rng.int(0, 99), 2, 32, 0);
  blob(R, 0.004, BLOOD_WET(), rng.int(0, 99), 3, 44, 0.008);
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, TAU);
    const d = R * rng.range(1.05, 1.6);
    const r = rng.range(0.03, 0.09);
    kit.add(BLOOD_WET(), cyl(r, r * 1.05, 0.006, 10), xf([Math.cos(a) * d, 0.004, Math.sin(a) * d], [0, 0, 0], [1, 1, rng.range(0.6, 1.4)]));
  }
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// ---------- sigil stone ----------

export function sigilStone(opts = {}) {
  const H = opts.height ?? 1.9;
  const rng = makeRng(opts.seed ?? 91);
  const kit = new Kit();
  const W = 0.72;
  const Dp = 0.38;
  const taper = (y) => 1 - 0.22 * (y / H);
  const zFront = (y) => (Dp / 2) * taper(y);
  const panel = (x, y) => Math.max(0, 1 - Math.max(Math.abs(x) / 0.27, Math.abs(y - H * 0.58) / (H * 0.22)) ** 6);
  let g = box(W, H, Dp, 6, 16, 4);
  const seed = rng.int(0, 999);
  deform(g, (v) => {
    const y = v.y + H / 2;
    const tp = taper(y);
    v.x *= tp;
    v.z *= tp;
    // rounded, slightly lopsided top
    const top = Math.max(0, (y - H * 0.8) / (H * 0.2));
    const yy = y - top * top * (Math.abs(v.x) / (W / 2)) * 0.2 - top * top * v.x * 0.12;
    const n = fbm3(v.x * 4, y * 3, v.z * 4, 3, seed);
    const flat = v.z > 0 ? panel(v.x, y) : 0;
    const k = 1 + n * 0.22 * (1 - flat);
    v.x *= k;
    v.z *= k;
    v.y = yy;
  }, false);
  g = facet(g);
  kit.add('stone', g);
  // carved sigil on the front panel (glowing grooves)
  const cy = H * 0.58;
  const sk = new Kit({ raw: true });
  const G = 'sigilGlow';
  const sw = 0.016;
  sk.add(G, torus(0.2, sw * 0.6, 4, 40), xf([0, 0, 0], [0, 0, 0], [1, 1, 0.4]));
  const tri = [0, 1, 2].map((i) => v3(Math.sin(Math.PI + (i * TAU) / 3) * 0.2, Math.cos(Math.PI + (i * TAU) / 3) * 0.2, 0));
  for (let i = 0; i < 3; i++) sk.bar(G, tri[i], tri[(i + 1) % 3], sw, 0.006);
  sk.bar(G, v3(0, -0.36, 0), v3(0, 0.3, 0), sw, 0.006);
  sk.bar(G, v3(-0.1, 0.24, 0), v3(0.1, 0.24, 0), sw, 0.006);
  sk.bar(G, v3(-0.06, -0.3, 0), v3(0.06, -0.3, 0), sw, 0.006);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.2;
    sk.add(G, box(0.022, 0.05, 0.006), xf([Math.sin(a) * 0.26, Math.cos(a) * 0.26, 0], [0, 0, -a]));
  }
  kit.addParts(sk.merged(), xf([0, cy, zFront(cy) + 0.004], [Math.atan(((Dp / 2) * 0.22) / H), 0, 0]));
  // rubble and old blood at the base
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, TAU);
    const r = rng.range(0.4, 0.6);
    const s = ico(rng.range(0.05, 0.1), 0);
    kit.add('stone', s, xf([Math.cos(a) * r, 0.02, Math.sin(a) * r], [rng.range(0, 3), rng.range(0, 3), 0], [1, 0.6, 1]));
  }
  const obj = kit.build();
  obj.userData.collider = [{ min: [-W / 2, 0, -Dp / 2], max: [W / 2, H, Dp / 2] }];
  if (opts.glow !== false) obj.userData.lights = [{ offset: [0, cy, 0.4], color: 0xff1a0a, intensity: 0.8, distance: 3, flicker: 0.15, kind: 'sigil' }];
  return obj;
}

