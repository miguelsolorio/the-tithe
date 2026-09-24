import * as THREE from 'three';
import {
  mesh, pivot, hit, light, instMats, mat, cached, normState, colorLerp, prep,
  sweep, blob, prof, merge, xf, mirrorX, spike, flip,
  Rig, Animator, ik3, clamp, lerp, smooth, ramp, easeOut, easeIn, damp, wobble, fbm3, PI, TAU,
} from './common.js';
import { keepUpright } from './skeleton.js';

// The Mother Below (boss). Root = surface of the black pool; only the body
// from the hips up exists. See buildMother() for states and exposed nodes.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SKIN = 0x3a3534, SKIN_D = 0x161213, BONE = 0xbfae8e, MEAT = 0x5a0a10;
const UA = 2.7, FA = 2.6; // upper arm, forearm
const skinCol = (k = 0.6) => (o, t, a, p) => colorLerp(o, SKIN, SKIN_D, clamp(0.4 + fbm3(p.x * 1.5, p.y * 1.5, p.z * 1.5, 3, 41) * 1.3, 0, 1) * k);
const meatCol = (o, t, a, p) => colorLerp(o, MEAT, 0x1e0204, clamp(0.4 + fbm3(p.x * 3, p.y * 3, p.z * 3, 3, 43) * 1.4, 0, 1));
const solidC = (c) => (o) => o.set(c);

// Chest profile (chest space): y -> [rx, rz, zOffset].
const CHEST = prof([[-0.3, 1.0, 0.85], [0.4, 1.15, 1.0], [1.2, 1.25, 1.05], [1.9, 1.4, 0.95], [2.25, 0.9, 0.7], [2.45, 0.45, 0.42]].map(([y, a, b]) => [(y + 0.3) / 2.75, a, b]));
const chestR = (y) => CHEST((y + 0.3) / 2.75);
const WIN = (y, a) => Math.abs(a) < 1.08 + 0.08 * Math.sin(y * 7) && y > 0.02 && y < 1.95 - 0.25 * Math.abs(a);

// Grid shell around the Y axis. a = angle from +Z. keep(y, a) filters faces.
function shell(y0, y1, rows, cols, rOf, colorFn, keep = null, scale = 1) {
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= rows; i++) {
    const y = lerp(y0, y1, i / rows);
    const r = rOf(y);
    for (let j = 0; j <= cols; j++) {
      const a = (j / cols) * TAU - PI;
      const n = 1 + 0.05 * fbm3(Math.sin(a) * 2, y * 1.5, Math.cos(a) * 2, 3, 7);
      const p = V(Math.sin(a) * r[0] * n * scale, y, Math.cos(a) * r[1] * n * scale);
      pos.push(p.x, p.y, p.z);
      uv.push((j / cols) * 8, y * 2);
      colorFn(c, y, a, p);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + cols + 1;
      const ym = lerp(y0, y1, (i + 0.5) / rows), am = ((j + 0.5) / cols) * TAU - PI;
      if (keep && !keep(ym, am)) continue;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function chestGeo() {
  const outer = shell(-0.3, 2.45, 26, 40, chestR, skinCol(), (y, a) => !WIN(y, a));
  const cavity = flip(shell(-0.1, 2.05, 18, 28, chestR, meatCol, (y, a) => Math.abs(a) < 1.9, 0.8));
  // Raw lip around the window.
  const edge = [];
  for (let i = 0; i <= 32; i++) {
    const s = (i / 32) * TAU;
    const a = 1.05 * Math.sin(s), y = 0.95 - 0.9 * Math.cos(s) * (1 - 0.08 * Math.abs(Math.sin(s)));
    const r = chestR(y);
    edge.push(V(Math.sin(a) * r[0] * 0.97, y, Math.cos(a) * r[1] * 0.97));
  }
  const lip = sweep({ points: edge, seg: 48, radial: 8, radius: 0.09, capStart: false, capEnd: false, bumps: { amp: 0.3, freq: 3 }, color: (o, t, a2, p) => colorLerp(o, 0x6a1418, 0x2a0508, clamp(0.5 + fbm3(p.x * 4, p.y * 4, p.z * 4, 2, 3), 0, 1)), tile: 0.3 });
  return { outer, cavity, lip };
}

// Seven ribs a side: from the spine round the flank, then splayed outward
// and forward out of the opened chest like fingers.
function ribsGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const y = 0.2 + i * 0.26;
    const r = chestR(y);
    for (const s of [1, -1]) {
      const pts = [];
      for (let k = 0; k <= 5; k++) {
        const a = lerp(PI * 0.97, 1.02 + 0.06 * Math.sin(i), k / 5);
        pts.push(V(s * Math.sin(a) * r[0] * 1.03, y + 0.18 * (1 - k / 5), Math.cos(a) * r[1] * 1.03));
      }
      const e = pts[pts.length - 1];
      const out = V(s, 0, 0.35).normalize();
      const len = 1.0 + 0.35 * Math.sin((i / 6) * PI);
      const tip = e.clone().addScaledVector(out, len * 0.55).add(V(0, -0.1 - 0.04 * i, len * 0.7));
      const mid = e.clone().lerp(tip, 0.5).addScaledVector(out, 0.2);
      pts.push(mid, tip, tip.clone().add(V(-s * 0.12, -0.15, 0.12)));
      parts.push(sweep({ points: pts, seg: 26, radial: 7, radius: (t) => lerp(0.12, 0.03, smooth(t * 0.9 + 0.1)), bumps: { amp: 0.12, freq: 6, seed: i }, color: (o, t) => colorLerp(o, BONE, 0x4a1410, smooth((t - 0.75) / 0.25) * 0.8), tile: 0.3 }));
    }
  }
  // Vertebrae down the back of the chest.
  for (let i = 0; i < 9; i++) {
    const y = -0.2 + i * 0.28;
    parts.push(blob({ r: 0.1, sx: 1.2, sy: 0.8, sz: 1, ws: 8, hs: 6, color: solidC(0xa89878), fn: (p) => { p.y += y; p.z -= chestR(y)[1] * 0.98; } }));
  }
  return merge(parts);
}

function heartGeo() {
  const h = blob({ r: 0.36, sx: 1, sy: 1.25, sz: 0.95, ws: 18, hs: 14, noise: 0.18, freq: 3, color: (o, dy, a, p) => colorLerp(o, 0x8a1016, 0x2a0206, clamp(0.4 + fbm3(p.x * 9, p.y * 9, p.z * 9, 3, 2) * 1.6, 0, 1)) });
  const vessels = [[-0.15, 0.35, 0.02], [0.12, 0.4, -0.08], [0.02, 0.3, -0.2]].map(([x, y, z], i) => sweep({ points: [V(x, y, z), V(x * 1.6, y + 0.35, z - 0.1), V(x * 2.2, y + 0.75, z - 0.35 - i * 0.1)], seg: 8, radial: 7, radius: (t) => 0.08 - t * 0.03, color: solidC(0x4a0a12), tile: 0.2 }));
  return merge([h, ...vessels]);
}

function waistGeo() {
  const r = prof([[0, 0.95, 0.75], [0.35, 0.8, 0.62], [0.6, 0.78, 0.6], [1, 1.02, 0.86]]);
  const body = sweep({ points: [V(0, -1.8, 0), V(0, 0.2, 0.02), V(0, 1.85, 0)], seg: 14, radial: 26, radius: r, capStart: false, capEnd: false, bumps: { amp: 0.05, freq: 2 }, color: skinCol(), tile: 0.4 });
  const vert = [...Array(8)].map((_, i) => blob({ r: 0.09, sx: 1.2, sy: 0.8, sz: 1, ws: 8, hs: 6, color: solidC(0xa09070), fn: (p) => { const y = -0.6 + i * 0.32; p.y += y; p.z -= r((y + 1.8) / 3.65)[1] * 0.97; } }));
  return merge([body, ...vert]);
}

function neckGeo() {
  return merge([
    sweep({ points: [V(0, -0.6, -0.1), V(0, 0.1, -0.02), V(0, 0.75, 0.08)], seg: 10, radial: 16, radius: prof([[0, 0.45, 0.42], [0.5, 0.3, 0.32], [1, 0.3, 0.33]]), capStart: false, capEnd: false, color: skinCol(), tile: 0.4 }),
    ...[1, -1].map((s) => sweep({ points: [V(s * 0.22, 0.65, 0.05), V(s * 0.18, 0.0, 0.22), V(s * 0.1, -0.6, 0.35)], seg: 8, radial: 6, radius: 0.07, color: skinCol(0.3), tile: 0.3 })),
  ]);
}

function headGeo() {
  const eyes = [V(0.16, 0.5, 0.4), V(-0.16, 0.5, 0.4)];
  const skull = blob({
    r: 1, sx: 0.42, sy: 0.56, sz: 0.48, ws: 24, hs: 18, noise: 0.04, freq: 3,
    fn: (p, d) => {
      p.y += 0.45; p.z += 0.05;
      if (d.z > 0.2 && Math.abs(d.x) > 0.35 && d.y > -0.5 && d.y < 0.1) p.x *= 0.88;
      if (d.y < -0.3) { p.x *= 1 - 0.3 * smooth((-d.y - 0.3) / 0.5); p.z += 0.05 * smooth((-d.y - 0.3) / 0.5) * (d.z > 0 ? 1 : 0); }
      for (const e of eyes) { const dd = p.distanceTo(e); if (dd < 0.16) p.lerp(e, (1 - dd / 0.16) * 0.5); }
    },
    color: (o, dy, a, p) => {
      skinCol(0.6)(o, 0, 0, p);
      for (const e of eyes) { const dd = p.distanceTo(e); if (dd < 0.2) colorLerp(o, o.getHex(), 0x080303, 1 - dd / 0.2); }
      if (Math.abs(p.x) < 0.05 && p.y > 0.3 && p.y < 0.42 && p.z > 0.4) o.set(0x050202);
    },
  });
  const teeth = [];
  for (let i = 0; i < 12; i++) {
    const a = lerp(-1.1, 1.1, i / 11);
    teeth.push(xf(spike({ len: 0.1 + 0.06 * Math.cos(a), r: 0.022, dir: [0, -1, 0.1], radial: 5, seg: 2, color: solidC(0xb8a888) }), [Math.sin(a) * 0.23, 0.22, 0.18 + Math.cos(a) * 0.24]));
  }
  return { skull, teeth: merge(teeth) };
}

function jawGeo() {
  const jaw = blob({ r: 1, sx: 0.28, sy: 0.14, sz: 0.34, ws: 16, hs: 10, noise: 0.05, freq: 4, color: (o, dy, a, p) => { skinCol(0.6)(o, 0, 0, p); if (dy > 0.45) o.set(0x0c0204); }, fn: (p) => { p.y -= 0.1; p.z += 0.2; } });
  const teeth = [];
  for (let i = 0; i < 10; i++) {
    const a = lerp(-1.0, 1.0, i / 9);
    teeth.push(xf(spike({ len: 0.09, r: 0.02, dir: [0, 1, 0.05], radial: 5, seg: 2, color: solidC(0xb0a080) }), [Math.sin(a) * 0.2, -0.03, 0.2 + Math.cos(a) * 0.22]));
  }
  return { jaw, teeth: merge(teeth) };
}

function hornGeo() {
  const pts = [V(0.2, 0.82, -0.05), V(0.55, 1.1, -0.35), V(1.05, 1.32, -0.62), V(1.55, 1.62, -0.55), V(1.88, 2.1, -0.25), V(1.98, 2.5, 0.18)];
  return sweep({ points: pts, seg: 40, radial: 11, radius: (t) => 0.21 * (1 - t * 0.86) + 0.01, shape: (t, a) => 1 + 0.1 * Math.cos(a * 3), color: (o, t) => colorLerp(o, 0x1a1512, 0x7a6a58, smooth(t)), tile: 0.25, capRound: 0.2 });
}

function armGeo(len, r0, r1, knob) {
  return sweep({ points: [V(0, 0.3, 0), V(0, -len * 0.5, 0.03), V(0, -len - 0.05, 0)], seg: 14, radial: 12, radius: (t) => lerp(r0, r1, t) + knob * smooth((t - 0.85) / 0.15), bumps: { amp: 0.08, freq: 2.5 }, color: skinCol(), tile: 0.4 });
}

function handGeo() {
  const parts = [blob({ r: 1, sx: 0.3, sy: 0.4, sz: 0.1, ws: 12, hs: 8, noise: 0.08, freq: 3, color: skinCol(), fn: (p) => { p.y -= 0.32; } })];
  for (let i = 0; i < 4; i++) {
    const x = -0.21 + i * 0.14, len = [0.8, 0.95, 0.9, 0.72][i];
    const pts = [V(x, -0.62, 0), V(x * 1.15, -0.62 - len * 0.4, 0.06), V(x * 1.25, -0.62 - len * 0.8, 0.2), V(x * 1.25, -0.62 - len, 0.34)];
    parts.push(sweep({ points: pts, seg: 12, radial: 6, radius: (t) => 0.055 - t * 0.02 + 0.012 * Math.max(0, Math.sin(t * PI * 3)), color: (o, t, a, p) => { skinCol()(o, t, a, p); if (t > 0.88) o.set(0x0a0606); }, tile: 0.3, capRound: 1.2 }));
  }
  parts.push(sweep({ points: [V(0.26, -0.2, 0.05), V(0.42, -0.45, 0.15), V(0.46, -0.72, 0.3)], seg: 8, radial: 6, radius: 0.06, color: skinCol(), tile: 0.3, capRound: 1 }));
  return merge(parts);
}

function shackleGeo() {
  const cuff = sweep({ points: [V(0, 0.18, 0), V(0, -0.18, 0)], seg: 2, radial: 16, radius: 0.27, capStart: false, capEnd: false, color: solidC(0xffffff), tile: 0.3 });
  const inner = flip(sweep({ points: [V(0, 0.18, 0), V(0, -0.18, 0)], seg: 2, radial: 16, radius: 0.22, capStart: false, capEnd: false, color: solidC(0x806050), tile: 0.3 }));
  const rims = [0.18, -0.18].map((y) => xf(prep(new THREE.TorusGeometry(0.245, 0.035, 6, 20)), [0, y, 0], [PI / 2, 0, 0]));
  const loop = xf(prep(new THREE.TorusGeometry(0.13, 0.04, 6, 12)), [0, 0, -0.38], [0, PI / 2, 0]);
  return merge([cuff, inner, ...rims, loop]);
}

function cageGeo() {
  const iron = [], bone = [];
  const ringAt = (y, r, t = 0.05) => xf(prep(new THREE.TorusGeometry(r, t, 6, 28)), [0, y, 0], [PI / 2, 0, 0]);
  iron.push(ringAt(-0.05, 0.12, 0.04), ringAt(-0.38, 0.55), ringAt(-1.66, 0.62, 0.06));
  const floor = sweep({ points: [V(0, -1.64, 0), V(0, -1.72, 0)], seg: 1, radial: 20, radius: 0.62, capStart: true, capEnd: true, capRound: 0, color: solidC(0xffffff) });
  iron.push(floor);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    iron.push(sweep({ points: [V(0, -0.1, 0), V(Math.sin(a) * 0.3, -0.25, Math.cos(a) * 0.3), V(Math.sin(a) * 0.55, -0.38, Math.cos(a) * 0.55)], seg: 6, radial: 5, radius: 0.035, color: solidC(0xffffff) }));
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const pts = [0, 0.5, 1].map((u) => { const r = lerp(0.55, 0.62, u) + 0.12 * Math.sin(u * PI); return V(Math.sin(a) * r, lerp(-0.38, -1.66, u), Math.cos(a) * r); });
    if (i % 2) iron.push(sweep({ points: pts, seg: 10, radial: 6, radius: 0.03, color: solidC(0xffffff), tile: 0.2 }));
    else {
      bone.push(sweep({ points: pts, seg: 10, radial: 7, radius: (t) => 0.04 + 0.025 * (smooth((0.12 - t) / 0.12) + smooth((t - 0.88) / 0.12)), bumps: { amp: 0.15, freq: 12, seed: i }, color: (o, t) => colorLerp(o, 0xc8b898, 0x5a3a28, 0.3 + 0.4 * Math.abs(t - 0.5)), tile: 0.2 }));
    }
  }
  return { iron: merge(iron), bone: merge(bone) };
}

function linkGeo() {
  return xf(prep(new THREE.TorusGeometry(0.15, 0.045, 6, 10)), [0, 0, 0], [0, 0, 0], [1, 1.55, 1]);
}

function assets() {
  return cached('mother', () => {
    const A = {};
    Object.assign(A, chestGeo());
    A.ribs = ribsGeo();
    A.heart = heartGeo();
    A.waist = waistGeo();
    A.neck = neckGeo();
    const h = headGeo();
    A.skull = h.skull;
    A.teethU = h.teeth;
    const j = jawGeo();
    A.jaw = j.jaw;
    A.teethL = j.teeth;
    A.eyes = merge([1, -1].map((s) => blob({ r: 0.075, sx: 1.2, sy: 0.8, sz: 0.7, ws: 10, hs: 8, color: solidC(0xffffff), fn: (p) => { p.add(V(s * 0.16, 0.5, 0.38)); } })));
    const hornL = hornGeo();
    A.horns = merge([hornL, mirrorX(hornL)]);
    A.upper = armGeo(UA, 0.3, 0.2, 0.06);
    A.fore = armGeo(FA, 0.22, 0.15, 0.03);
    A.hand = handGeo();
    A.handR = mirrorX(A.hand);
    A.shackle = shackleGeo();
    Object.assign(A, { cage: cageGeo() });
    A.link = linkGeo();
    return A;
  });
}

const TIMINGS = {
  rise: { duration: 4.5 },
  lash: { duration: 1.6, hit: 0.9 },
  attack: { duration: 1.6, hit: 0.9 },
  slam: { duration: 2.2, hit: 1.2 },
  spit: { duration: 1.6, release: 0.85 },
  summon: { duration: 3.0 },
  notice: { duration: 1.0 },
  hurt: { duration: 0.6 },
  death: { duration: 4.0 },
};
const SUB = -9.8;
const NL = 64, PITCH = 0.3;
const NS = 64, NP = 12;

// Verlet hair: NS strands of NP points pinned to the scalp, draped by
// gravity over sphere colliders; heavy damping, drags in the water.
function makeHair(parent, material) {
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const roots = [], lens = [];
  for (let i = 0; i < NS; i++) {
    let az = (i / NS) * TAU + (rnd() - 0.5) * 0.15;
    const front = Math.cos(az) > 0.4;
    // Part the hair so the eyes show; front strands frame the face.
    if (front && Math.abs(Math.sin(az)) < 0.5) az += Math.sign(Math.sin(az) || 1) * 0.45;
    const pol = 0.15 + rnd() * (front ? 0.5 : 1.0);
    roots.push(V(Math.sin(pol) * Math.sin(az) * 0.43, 0.45 + Math.cos(pol) * 0.57, 0.05 + Math.sin(pol) * Math.cos(az) * 0.49));
    lens.push(front ? 1.5 + rnd() * 0.9 : 5.2 + rnd() * 1.8);
  }
  const P = new Float32Array(NS * NP * 3), O = new Float32Array(NS * NP * 3);
  const vcount = NS * NP * 2;
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(vcount * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const nor = new THREE.BufferAttribute(new Float32Array(vcount * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const col = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2), idx = [];
  for (let i = 0; i < NS; i++) {
    for (let k = 0; k < NP; k++) {
      const v = (i * NP + k) * 2;
      const c = 0.012 + 0.012 * (k / NP);
      col.set([c, c * 1.05, c], v * 3); col.set([c, c * 1.05, c], v * 3 + 3);
      uv.set([0, k * 1.5], v * 2); uv.set([1, k * 1.5], v * 2 + 2);
      if (k < NP - 1) idx.push(v, v + 1, v + 3, v, v + 3, v + 2);
    }
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(V(0, 3, 0), 12);
  const m = mesh(geo, material, parent, { cast: true });
  let init = false;
  const r = new THREE.Vector3(), d = new THREE.Vector3(), tn = new THREE.Vector3(), sd = new THREE.Vector3(), nn = new THREE.Vector3();

  // rootFn(i, out) -> scalp point in parent space; colliders: [{c, r}].
  function step(dt, rootFn, colliders) {
    const h = Math.min(dt, 1 / 30), g = 9.8 * h * h;
    for (let i = 0; i < NS; i++) {
      const seg = lens[i] / (NP - 1);
      rootFn(i, r);
      const b = i * NP * 3;
      if (!init) {
        for (let k = 0; k < NP; k++) { P[b + k * 3] = O[b + k * 3] = r.x; P[b + k * 3 + 1] = O[b + k * 3 + 1] = r.y - k * seg; P[b + k * 3 + 2] = O[b + k * 3 + 2] = r.z; }
      }
      P[b] = r.x; P[b + 1] = r.y; P[b + 2] = r.z;
      for (let k = 1; k < NP; k++) {
        const j = b + k * 3;
        const wet = P[j + 1] < 0 ? 0.55 : 0.93;
        let vx = (P[j] - O[j]) * wet, vy = (P[j + 1] - O[j + 1]) * wet, vz = (P[j + 2] - O[j + 2]) * wet;
        const vl = Math.hypot(vx, vy, vz);
        if (vl > 0.14) { vx *= 0.14 / vl; vy *= 0.14 / vl; vz *= 0.14 / vl; }
        O[j] = P[j]; O[j + 1] = P[j + 1]; O[j + 2] = P[j + 2];
        P[j] += vx; P[j + 1] += vy - (P[j + 1] < 0 ? g * 0.1 : g); P[j + 2] += vz;
        // Colliders (pushes move the old position too: no added velocity).
        for (const cl of colliders) {
          d.set(P[j] - cl.c.x, P[j + 1] - cl.c.y, P[j + 2] - cl.c.z);
          const l = d.length();
          if (l < cl.r) {
            d.multiplyScalar((cl.r - l) / (l || 1));
            P[j] += d.x; P[j + 1] += d.y; P[j + 2] += d.z;
            O[j] += d.x; O[j + 1] += d.y; O[j + 2] += d.z;
          }
        }
        // Follow-the-leader length constraint.
        const q = j - 3;
        d.set(P[j] - P[q], P[j + 1] - P[q + 1], P[j + 2] - P[q + 2]);
        const l = d.length() || 1;
        P[j] = P[q] + (d.x / l) * seg; P[j + 1] = P[q + 1] + (d.y / l) * seg; P[j + 2] = P[q + 2] + (d.z / l) * seg;
      }
    }
    init = true;
    // Ribbons lying flat around the body axis.
    const pa = pos.array, na = nor.array;
    for (let i = 0; i < NS; i++) {
      for (let k = 0; k < NP; k++) {
        const j = (i * NP + k) * 3, jn = (i * NP + Math.min(NP - 1, k + 1)) * 3, jp = (i * NP + Math.max(0, k - 1)) * 3;
        tn.set(P[jn] - P[jp], P[jn + 1] - P[jp + 1], P[jn + 2] - P[jp + 2]).normalize();
        r.set(P[j], 0, P[j + 2]);
        if (r.lengthSq() < 1e-4) r.set(0, 0, 1);
        r.normalize();
        sd.crossVectors(tn, r).normalize();
        nn.crossVectors(sd, tn);
        const w = 0.13 * (1 - 0.55 * (k / NP));
        const v = (i * NP + k) * 2 * 3;
        pa[v] = P[j] - sd.x * w; pa[v + 1] = P[j + 1] - sd.y * w; pa[v + 2] = P[j + 2] - sd.z * w;
        pa[v + 3] = P[j] + sd.x * w; pa[v + 4] = P[j + 1] + sd.y * w; pa[v + 5] = P[j + 2] + sd.z * w;
        na[v] = na[v + 3] = nn.x; na[v + 1] = na[v + 4] = nn.y; na[v + 2] = na[v + 5] = nn.z;
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
  return { mesh: m, geo, roots, step, reset() { init = false; } };
}

export function buildMother(opts = {}) {
  const A = assets();
  const M = instMats();
  const skin = M.get('skinWet'), bone = M.get('bone'), horn = M.get('horn'), iron = M.get('iron'), teeth = M.get('teeth'), flesh = M.get('flesh');
  const root = new THREE.Group();
  root.name = 'mother';
  const anchors = (opts.anchors || [V(-9, 7, -4), V(9, 7, -4)]).map((v) => v.clone());
  const body = pivot(root, 0, 0, 0, 'body');
  const hips = pivot(body, 0, -0.2, 0, 'hips');
  const waist = pivot(hips, 0, 1.2, 0, 'waist');
  const chest = pivot(waist, 0, 1.6, 0, 'chest');
  const neck = pivot(chest, 0, 2.3, -0.2, 'neck');
  const head = pivot(neck, 0, 0.65, 0.1, 'head');
  const jaw = pivot(head, 0, 0.22, 0.02, 'jaw');
  const mouth = pivot(jaw, 0, -0.05, 0.45, 'mouth');
  mesh(A.waist, skin, waist);
  mesh(A.outer, skin, chest);
  mesh(A.cavity, flesh, chest);
  mesh(A.lip, flesh, chest);
  mesh(A.ribs, bone, chest);
  const heart = pivot(chest, 0, 1.5, -0.6, 'heart');
  mesh(A.heart, flesh, heart);
  mesh(A.neck, skin, neck);
  mesh(A.skull, skin, head);
  mesh(A.teethU, teeth, head);
  mesh(A.eyes, mat('eyeGlow'), head, { cast: false });
  mesh(A.horns, horn, head);
  mesh(A.jaw, skin, jaw);
  mesh(A.teethL, teeth, jaw);
  const eyes = [pivot(head, 0.16, 0.5, 0.46, 'eyeL'), pivot(head, -0.16, 0.5, 0.46, 'eyeR')];
  const arms = [];
  for (const s of [1, -1]) {
    const clav = pivot(chest, s * 0.5, 1.95, -0.2);
    const up = pivot(clav, s * 1.0, -0.05, 0);
    const fo = pivot(up, 0, -UA, 0);
    const ha = pivot(fo, 0, -FA, 0);
    mesh(A.upper, skin, up);
    mesh(A.fore, skin, fo);
    mesh(s > 0 ? A.hand : A.handR, skin, ha);
    const shackle = pivot(fo, 0, -FA + 0.35, 0);
    mesh(A.shackle, iron, shackle);
    arms.push({ s, clav, up, fo, ha, cuff: pivot(shackle, 0, 0, -0.38), palm: pivot(ha, 0, -0.45, 0.05, s > 0 ? 'palmL' : 'palmR') });
  }
  const cageHook = pivot(chest, 0, 1.85, 0.3, 'cageHook');
  const cage = pivot(cageHook, 0, 0, 0, 'cage');
  mesh(A.cage.iron, iron, cage);
  mesh(A.cage.bone, bone, cage);
  const sisterSlot = pivot(cage, 0, -1.64, 0, 'sisterSlot');

  // Chains: one instanced mesh for both, re-laid every frame.
  const links = new THREE.InstancedMesh(A.link, iron, NL * 2);
  links.castShadow = true;
  links.receiveShadow = true;
  links.frustumCulled = false;
  root.add(links);
  const chainAnchor = arms.map((a) => anchors.find((v) => Math.sign(v.x) === a.s) || anchors[a.s > 0 ? 1 : 0]);
  const baseLen = [0, 0];

  const hair = makeHair(root, M.get('hairDS'));

  const rig = new Rig();
  rig.add('body', body, true);
  for (const [n, o] of [['hips', hips], ['waist', waist], ['chest', chest], ['neck', neck], ['head', head], ['jaw', jaw]]) rig.add(n, o);
  rig.add('clavL', arms[0].clav);
  rig.add('clavR', arms[1].clav);
  rig.add('handL', arms[0].ha);
  rig.add('handR', arms[1].ha);
  const tgt = [rig.addVirtual('tgtL'), rig.addVirtual('tgtR')];
  rig.finalize();
  const anim = new Animator(rig, { lash: 0.2, slam: 0.25, spit: 0.2, hurt: 0.08, dead: 0.2, summon: 0.4, rise: 0.05, submerged: 0.05 }, 0.4);
  let t = 0, lashSide = 'right', prevState = null, prevTime = 0;
  const seed = Math.random() * 50;

  const setHand = (r, i, v) => r.p(i ? 'tgtR' : 'tgtL', v.x, v.y, v.z);
  const idleHand = (i) => { const s = i ? -1 : 1; return V(s * 2.6 + 0.1 * Math.sin(t * 0.35 + i), 1.1 + 0.2 * Math.sin(t * 0.6 + i * 2), 1.5); };
  const arc = (phi) => V(Math.sin(phi) * 4.4, 1.4, Math.cos(phi) * 4.4);

  const POSES = {
    idle(r) {
      const br = Math.sin(t * 0.6), sw = Math.sin(t * 0.35);
      r.r('hips', 0.08 + 0.02 * br, 0.05 * sw, 0.03 * sw);
      r.r('waist', 0.06, 0.04 * sw, 0);
      r.r('chest', 0.04 + 0.03 * br, 0, -0.03 * sw);
      r.r('neck', 0.25 + 0.06 * wobble(t * 0.25, seed), 0.15 * wobble(t * 0.18, seed + 1), 0.1 * sw);
      r.r('head', 0.15, 0, 0.12 * wobble(t * 0.3, seed + 2));
      r.r('jaw', 0.08 + 0.06 * Math.max(0, wobble(t * 0.5, seed + 3)));
      setHand(r, 0, idleHand(0));
      setHand(r, 1, idleHand(1));
      r.r('handL', 0.3, 0, 0.2);
      r.r('handR', 0.3, 0, -0.2);
    },
    submerged(r) {
      POSES.idle(r);
      r.p('body', 0, SUB, 0);
      for (let i = 0; i < 2; i++) setHand(r, i, idleHand(i).add(V(0, SUB, 0)));
    },
    rise(r, s) {
      const tt = s.stateTime;
      POSES.idle(r);
      const k = easeOut(clamp(tt / 4.2, 0, 1));
      const y = SUB * (1 - k) + 0.25 * Math.sin(tt * 2.5) * (1 - k);
      r.p('body', 0, y, 0);
      for (let i = 0; i < 2; i++) setHand(r, i, idleHand(i).add(V(0, y, 0)));
      const bow = 1 - smooth((tt - 3.0) / 1.3);
      r.ra('neck', 0.6 * bow, 0, 0);
      r.ra('head', 0.3 * bow, 0, 0);
      r.ra('hips', 0.25 * bow, 0, 0);
    },
    lash(r, s) {
      POSES.idle(r);
      const tt = clamp(s.stateTime, 0, 1.6);
      const sd = lashSide === 'left' ? 1 : -1, i = sd > 0 ? 0 : 1;
      const W = V(sd * 4.3, 5.2, -0.6), phi0 = sd * 1.4, phi1 = -sd * 1.05, idle = idleHand(i);
      let T;
      if (tt < 0.55) T = idle.lerp(W, smooth(tt / 0.55));
      else if (tt < 0.65) T = W.lerp(arc(phi0), easeIn((tt - 0.55) / 0.1));
      else if (tt < 1.15) T = arc(lerp(phi0, phi1, smooth((tt - 0.65) / 0.5)));
      else T = arc(phi1).lerp(idle, smooth((tt - 1.15) / 0.45));
      setHand(r, i, T);
      const wind = smooth(tt / 0.55) * (1 - smooth((tt - 0.6) / 0.2));
      const sw = smooth((tt - 0.6) / 0.5) * (1 - smooth((tt - 1.15) / 0.45));
      const lean = 0.5 * smooth((tt - 0.5) / 0.2) * (1 - smooth((tt - 1.15) / 0.45));
      r.r('hips', 0.08 + lean * 0.6, sd * (0.3 * wind - 0.35 * sw), 0);
      r.r('waist', 0.06 + lean * 0.3, sd * (0.15 * wind - 0.2 * sw), 0);
      r.r('chest', 0.04 + lean * 0.2, sd * (0.1 * wind - 0.15 * sw), 0);
      r.r('neck', 0.1, -sd * 0.2 * sw, 0);
      r.r('jaw', 0.15 + 0.3 * sw);
    },
    slam(r, s) {
      POSES.idle(r);
      const tt = s.stateTime;
      const up = smooth(tt / 0.85), down = easeIn(clamp((tt - 0.9) / 0.27, 0, 1)), rec = smooth((tt - 1.55) / 0.65);
      for (let i = 0; i < 2; i++) {
        const x = i ? -1 : 1, idle = idleHand(i), hi = V(x * 1.9, 7.8, 1.3), lo = V(x * 1.35, 0.35, 4.7);
        setHand(r, i, tt < 0.9 ? idle.lerp(hi, up) : tt < 1.55 ? hi.lerp(lo, down) : lo.lerp(idle, rec));
      }
      const lean = (tt < 0.9 ? -0.2 * up : lerp(-0.2, 0.9, down)) * (1 - rec);
      r.p('body', 0, -0.4 * Math.max(0, lean), 0.2 * Math.max(0, lean));
      r.r('hips', 0.08 + lean * 0.55, 0, 0);
      r.r('waist', 0.06 + lean * 0.3, 0, 0);
      r.r('chest', 0.04 + lean * 0.3, 0, 0);
      r.r('neck', 0.25 - 0.3 * up * (1 - down) + 0.2 * down * (1 - rec), 0, 0);
      r.r('jaw', 0.1 + 0.5 * down * (1 - rec));
    },
    spit(r, s) {
      POSES.idle(r);
      const tt = s.stateTime;
      const back = smooth(tt / 0.6) * (1 - smooth((tt - 0.6) / 0.15)), lunge = easeOut((tt - 0.6) / 0.25) * (1 - smooth((tt - 1.0) / 0.6));
      r.r('chest', 0.04 - 0.1 * back + 0.15 * lunge, 0, 0);
      r.r('neck', 0.25 - 0.35 * back + 0.55 * lunge, 0, 0);
      r.r('head', 0.15 - 0.35 * back - 0.15 * lunge, 0, 0);
      r.r('jaw', 0.1 + 0.25 * back + 0.75 * lunge);
    },
    summon(r, s) {
      POSES.idle(r);
      const tt = s.stateTime;
      const k = smooth(tt / 0.7) * (1 - smooth((tt - 2.4) / 0.6)), tr = Math.sin(t * 31) * 0.03 * k;
      for (let i = 0; i < 2; i++) setHand(r, i, idleHand(i).lerp(V((i ? -1 : 1) * 3.6, 8.6, 1.0), k));
      r.r('hips', 0.08 - 0.1 * k, 0, 0);
      r.r('chest', 0.04 - 0.25 * k + tr, 0, 0);
      r.r('neck', 0.25 - 0.55 * k, 0, tr);
      r.r('head', 0.15 - 0.4 * k, 0, 0);
      r.r('jaw', 0.08 + 0.9 * k + tr);
    },
    hurt(r, s) {
      POSES.idle(r);
      const k = Math.sin(PI * clamp(s.stateTime / 0.6, 0, 1));
      r.ra('hips', -0.12 * k, 0.1 * k, 0);
      r.ra('chest', -0.2 * k, 0, 0);
      r.ra('neck', -0.35 * k, 0, 0.2 * k);
      r.ra('jaw', 0.5 * k);
      for (let i = 0; i < 2; i++) setHand(r, i, idleHand(i).add(V((i ? 1 : -1) * 0.8 * k, 1.5 * k, -0.5 * k)));
    },
    dead(r, s) {
      POSES.idle(r);
      const tt = s.stateTime;
      const rec = smooth(tt / 0.7) * (1 - smooth((tt - 0.8) / 0.6)), fall = easeIn(clamp((tt - 1.0) / 2.0, 0, 1));
      const settle = Math.sin(PI * clamp((tt - 3.0) / 0.4, 0, 1)) * 0.05;
      r.p('body', 0, -0.1 * fall, 0.3 * fall);
      r.r('hips', 0.08 - 0.25 * rec + 0.58 * fall + settle, 0, 0.08 * fall);
      r.r('waist', 0.06 + 0.1 * fall, 0, 0);
      r.r('chest', 0.04 - 0.15 * rec + 0.05 * fall, 0, 0);
      r.r('neck', 0.25 - 0.4 * rec + 0.75 * fall, 0, 0);
      r.r('head', 0.15 + 0.3 * fall, 0.2 * fall, 0.15 * fall);
      r.r('jaw', 0.2 + 0.5 * rec + 0.35 * fall);
      for (let i = 0; i < 2; i++) {
        const x = i ? -1 : 1;
        setHand(r, i, idleHand(i).lerp(V(x * 3.4, 6.0, 0.8), rec).lerp(V(x * 2.6, 0.3, 6.3), fall));
      }
    },
  };
  POSES.attack = POSES.lash;

  const _t = new THREE.Vector3(), _p = new THREE.Vector3(), _pole = new THREE.Vector3(), _rq = new THREE.Quaternion(), _inv = new THREE.Matrix4();
  function solveArms() {
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_rq);
    for (let i = 0; i < 2; i++) {
      const a = arms[i];
      _t.copy(tgt[i].position);
      root.localToWorld(_t);
      a.up.getWorldPosition(_p);
      _pole.set(a.s * 3.2, 1.2, -2.6).applyQuaternion(_rq).add(_p);
      ik3(a.up, a.fo, UA, FA, _t, _pole, 1);
    }
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
  }

  const toRoot = (v, node) => v.applyMatrix4(node.matrixWorld).applyMatrix4(_inv);
  // Colliders sit forward of the body so falling strands are pushed back and
  // to the sides, keeping the open chest and the eyes visible.
  const COLL = [[head, V(0, 0.45, 0.05), 0.62], [head, V(0, 0.35, 0.55), 0.45], [neck, V(0, 0.1, 0.1), 0.45], [chest, V(0, 1.95, 0.55), 1.2], [chest, V(0, 0.9, 0.7), 1.15], [waist, V(0, 0.6, 0.3), 0.9], [arms[0].up, V(0, -0.2, 0), 0.45], [arms[1].up, V(0, -0.2, 0), 0.45]];
  const colliders = COLL.map(([, , r]) => ({ c: new THREE.Vector3(), r }));
  const rootFn = (i, out) => toRoot(out.copy(hair.roots[i]), head);

  const _a = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _zero = new THREE.Vector3(0, 0, 0), _tan = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  // Chain slack sized from the idle wrist so idle chains hang nearly taut.
  for (let i = 0; i < 2; i++) baseLen[i] = chainAnchor[i].distanceTo(V(arms[i].s * 2.6, 1.3, 1.3)) * 1.035;
  function updateChains() {
    for (let c = 0; c < 2; c++) {
      toRoot(_a.set(0, 0, 0), arms[c].cuff);
      const B = chainAnchor[c];
      const d = _a.distanceTo(B), L = Math.max(baseLen[c], d * 1.004);
      const sag = Math.sqrt(Math.max(0, (3 * d * (L - d)) / 8));
      const n = Math.min(NL, Math.ceil(L / PITCH));
      for (let k = 0; k < NL; k++) {
        if (k >= n) { _m.compose(B, _q.identity(), _zero); links.setMatrixAt(c * NL + k, _m); continue; }
        const u = (k + 0.5) / n;
        _p.lerpVectors(_a, B, u);
        _p.y -= sag * 4 * u * (1 - u);
        _tan.subVectors(B, _a);
        _tan.y -= sag * 4 * (1 - 2 * u);
        _q.setFromUnitVectors(Y, _tan.normalize()).multiply(_q2.setFromAxisAngle(Y, (k % 2) * PI / 2));
        _m.compose(_p, _q, _one);
        links.setMatrixAt(c * NL + k, _m);
      }
    }
    links.instanceMatrix.needsUpdate = true;
  }

  function animate(dt, time, sIn) {
    const s = normState(sIn);
    t = time;
    if ((s.state === 'lash' || s.state === 'attack') && (prevState !== s.state || s.stateTime + 1e-3 < prevTime)) {
      lashSide = sIn?.lashSide || (lashSide === 'left' ? 'right' : 'left');
    }
    prevState = s.state;
    prevTime = s.stateTime;
    anim.update(dt, s, (r, st) => (POSES[st.state] || POSES.idle)(r, st));
    solveArms();
    keepUpright(cage, root, 0.04 * Math.sin(t * 0.9), 0.03 * Math.sin(t * 0.7));
    const beat = s.state === 'dead' ? 0 : Math.max(0, Math.sin(t * 7.2)) ** 8 + 0.5 * Math.max(0, Math.sin(t * 7.2 - 0.9)) ** 8;
    heart.scale.setScalar(1 + 0.09 * beat);
    COLL.forEach(([node, off], i) => toRoot(colliders[i].c.copy(off), node));
    hair.step(dt, rootFn, colliders);
    updateChains();
    M.step(dt);
  }

  const api = {
    root, height: 6.5, radius: 3.0,
    hitSpheres: [
      hit(head, 0, 0.5, 0.2, 0.62, 'weak', 2.5),
      hit(heart, 0, 0, 0, 0.45, 'weak', 2),
      hit(waist, 0, 0.9, -0.1, 0.95, 'body', 1),
      hit(chest, 1.05, 0.9, -0.25, 0.75, 'body', 1),
      hit(chest, -1.05, 0.9, -0.25, 0.75, 'body', 1),
      hit(chest, 0, 1.9, -0.45, 0.95, 'body', 1),
      hit(neck, 0, 0.1, 0, 0.45, 'body', 1),
      ...arms.flatMap((a) => [hit(a.up, 0, -1.3, 0, 0.42, 'limb', 0.5), hit(a.fo, 0, -1.3, 0, 0.35, 'limb', 0.5), hit(a.palm, 0, 0, 0, 0.5, 'limb', 0.5)]),
    ],
    lights: eyes.map((e) => light(e, 0, 0, 0.05, 0xff2010, 3, 8, 0.15)),
    timings: TIMINGS,
    states: ['submerged', 'rise', 'idle', 'lash', 'slam', 'spit', 'summon', 'hurt', 'dead'],
    cage, sisterSlot, mouth,
    hands: [arms[0].palm, arms[1].palm],
    anchors,
    nodes: { head, heart, chest, eyes },
    animate,
    flash: (v) => M.flash(v),
    dispose() { hair.geo.dispose(); links.dispose(); M.dispose(); },
  };
  Object.defineProperty(api, 'lastLashSide', { get: () => lashSide, enumerable: true });
  return api;
}
