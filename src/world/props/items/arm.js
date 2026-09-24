import * as THREE from 'three';
import { solid } from '../../materials.js';
import { Kit, TAU, v3, xf, seg, capsule, sphere, roundBox, tube, deform, smoothNormals, fbm3, invert } from '../depths/kit.js';

// First-person arm. Built in a hand frame (wrist at the origin, fingers -Z,
// palm -Y, thumb -X for the right hand), then aligned so the handle axis the
// fingers wrap matches the weapon's grip axis and the forearm runs back/down.
// Origin = palm grip point (centre of the gripped handle).

const SKIN = () => solid(0xb99583, { roughness: 0.62 });
const SKIN_DARK = () => solid(0x9c7462, { roughness: 0.7 });
const NAIL = () => solid(0xcdb2a2, { roughness: 0.35 });
const GRIME = () => solid(0x3a2a20, { roughness: 0.9 });
const SCRATCH = () => solid(0x6a2a22, { roughness: 0.6 });
const LINING = () => solid(0x141110, { roughness: 1 });

const X = v3(1, 0, 0);
const Y = v3(0, 1, 0);
const DEG = Math.PI / 180;

// T: grip axis in the weapon frame (toward the index/thumb side),
// D: forearm direction (wrist -> elbow), R: handle radius, rd/ext: wrist angles.
export const HOLDS = {
  knife: { grip: true, R: 0.0145, T: [0, 0, -1], D: [0.35, -0.7, 0.62], rd: -0.25, ext: 0.15, theta: 0.5 },
  pistol: { grip: true, R: 0.0165, T: [0, 0.951, -0.309], D: [0.15, -0.35, 0.92], rd: 0.05, ext: 0.1, theta: 0.35 },
  rifle: { grip: true, R: 0.02, T: [0, 0.29, -0.96], D: [0.5, -0.6, 0.62], rd: -0.25, ext: 0.1, theta: 0.55 },
  support: { grip: true, R: 0.024, T: [0, 0, -1], D: [0.35, -0.6, 0.7], rd: -0.2, ext: 0.3, theta: 0.5, limit: [55, 70, 40] },
  relaxed: { grip: false, R: 0.02, T: [0, 0, -1], D: [0.3, -0.6, 0.75], rd: 0.05, ext: 0.1, theta: 0.3 },
};

const FINGERS = [
  { base: [-0.028, 0.0, -0.094], lens: [0.043, 0.025, 0.02], r: 0.0092, splay: 0.06, relax: [14, 20, 10] },
  { base: [-0.009, 0.001, -0.099], lens: [0.047, 0.029, 0.022], r: 0.0095, splay: 0.0, relax: [16, 24, 12] },
  { base: [0.01, 0.0, -0.095], lens: [0.044, 0.027, 0.021], r: 0.009, splay: -0.05, relax: [19, 28, 14] },
  { base: [0.028, -0.002, -0.086], lens: [0.034, 0.021, 0.018], r: 0.008, splay: -0.12, relax: [22, 32, 16] },
];

function segLineDist(a, b, c, t) {
  const d = b.clone().sub(a);
  const r = a.clone().sub(c);
  const aa = d.dot(d);
  const bb = d.dot(t);
  const f = t.dot(r);
  const cc = d.dot(r);
  const den = aa - bb * bb;
  const s = den > 1e-12 ? Math.min(1, Math.max(0, (bb * f - cc) / den)) : 0;
  const p1 = a.clone().addScaledVector(d, s);
  const u = bb * s + f;
  const p2 = c.clone().addScaledVector(t, u);
  return p1.distanceTo(p2);
}

// Finger chain; for grips each joint curls until it touches the handle.
function fingerChain(f, h, C, T) {
  let q = new THREE.Quaternion().setFromAxisAngle(Y, f.splay);
  let p = v3(...f.base);
  const out = [];
  const lim = h.limit ?? [95, 105, 80];
  const qa = new THREE.Quaternion();
  for (let k = 0; k < 3; k++) {
    const r = f.r * (1 - 0.1 * k);
    let ang = f.relax[k];
    if (h.grip) {
      ang = lim[k];
      for (let deg = 6; deg <= lim[k]; deg += 2) {
        qa.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(X, -deg * DEG));
        const end = p.clone().addScaledVector(v3(0, 0, -1).applyQuaternion(qa), f.lens[k]);
        if (segLineDist(p, end, C, T) <= h.R + r - 0.0012) {
          ang = deg;
          break;
        }
      }
    }
    q = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(X, -ang * DEG));
    const end = p.clone().addScaledVector(v3(0, 0, -1).applyQuaternion(q), f.lens[k]);
    out.push({ a: p.clone(), b: end, r, q: q.clone() });
    p = end;
  }
  return out;
}

// Two-bone IK: joint position bending toward pole.
function ik2(S, P, L1, L2, pole) {
  const dv = P.clone().sub(S);
  const d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, dv.length()));
  const u = dv.normalize();
  const w = pole.clone().addScaledVector(u, -pole.dot(u)).normalize();
  const ca = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const J = S.clone().addScaledVector(u, L1 * ca).addScaledVector(w, L1 * sa);
  const tip = J.clone().add(P.clone().sub(J).normalize().multiplyScalar(L2));
  return { J, tip };
}

function bone(kit, m, a, b, r, radial = 8) {
  const { m: mx, len } = seg(a, b);
  kit.add(m, capsule(r, Math.max(0.001, len), 3, radial), mx);
}

// Nail on the dorsal side of a distal segment.
function nail(kit, a, b, r, up) {
  const dir = b.clone().sub(a).normalize();
  const len = a.distanceTo(b);
  const side = new THREE.Vector3().crossVectors(up, dir).normalize();
  const upO = new THREE.Vector3().crossVectors(dir, side).normalize();
  const basis = new THREE.Matrix4().makeBasis(side, upO, dir);
  const c = b.clone().addScaledVector(dir, -len * 0.28).addScaledVector(upO, r * 0.9);
  basis.setPosition(c);
  kit.add(NAIL(), roundBox(r * 1.45, 0.0022, len * 0.62, 0.45, 8, 5), basis);
  const g = b.clone().addScaledVector(dir, r * 0.35).addScaledVector(upO, r * 0.72);
  kit.add(GRIME(), roundBox(r * 1.2, 0.0012, 0.0014, 0.6, 6, 4), basis.clone().setPosition(g));
}

// Loft rings along a frame: sections [{ t, a, b, n }] (t along F from o).
function loft(kit, m, o, F, U, secs, radial, seed, wrinkle = 0) {
  const W = new THREE.Vector3().crossVectors(U, F).normalize();
  const U2 = new THREE.Vector3().crossVectors(F, W).normalize();
  const pos = [];
  const uvs = [];
  const idx = [];
  secs.forEach((s, i) => {
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const c = o.clone().addScaledVector(F, s.t);
      let ra = s.a;
      let rb = s.b;
      if (wrinkle) {
        const n = fbm3(Math.cos(a) * 2, Math.sin(a) * 2, s.t * 18, 3, seed) * wrinkle * 2 + Math.sin(a * 3 + s.t * 60) * wrinkle * 0.5 * (s.t < 0.2 ? 1 : 0.4);
        ra += n;
        rb += n;
      }
      const p = c.addScaledVector(W, Math.cos(a) * ra).addScaledVector(U2, Math.sin(a) * rb);
      pos.push(p.x, p.y, p.z);
      uvs.push((j / radial) * TAU * (s.a + s.b) * 0.5, s.t);
      if (i && j) {
        const A = (i - 1) * (radial + 1) + (j - 1);
        const B = i * (radial + 1) + (j - 1);
        const C = i * (radial + 1) + j;
        const D = (i - 1) * (radial + 1) + j;
        idx.push(A, D, B, B, D, C);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  smoothNormals(g);
  kit.add(m, g);
  return g;
}

function buildHand(kit, h, C, T) {
  // palm: tapered, arched rounded block
  const palm = roundBox(0.082, 0.026, 0.1, 0.45, 14, 10);
  deform(palm, (v) => {
    const t = (0.05 - v.z) / 0.1;
    v.x *= 0.8 + 0.2 * t;
    if (v.y > 0) v.y += 0.003 * (1 - (v.x / 0.041) ** 2);
    v.y *= 1 + 0.2 * (1 - t);
  });
  kit.add(SKIN(), palm, xf([0, 0, -0.05]));
  kit.add(SKIN(), sphere(1, 10, 8), xf([-0.024, -0.01, -0.034], [0, -0.45, 0], [0.017, 0.013, 0.03]));
  kit.add(SKIN(), sphere(1, 10, 8), xf([0.027, -0.008, -0.038], [0, 0.1, 0], [0.013, 0.011, 0.034]));
  // fingers
  const chains = FINGERS.map((f) => fingerChain(f, h, C, T));
  chains.forEach((ch, i) => {
    ch.forEach((s, k) => bone(kit, k === 0 ? SKIN() : SKIN(), s.a, s.b, s.r, 8));
    const base = v3(...FINGERS[i].base);
    kit.add(SKIN_DARK(), sphere(0.0086, 8, 6), xf([base.x, base.y + 0.0045, base.z + 0.002]));
    const d = ch[2];
    nail(kit, d.a, d.b, d.r, v3(0, 1, 0).applyQuaternion(d.q));
    // darker skin over the middle knuckles
    kit.add(SKIN_DARK(), sphere(ch[1].r * 0.95, 6, 4), xf(ch[1].a.clone().add(v3(0, 1, 0).applyQuaternion(ch[1].q).multiplyScalar(ch[1].r * 0.25)).toArray()));
  });
  // thumb: metacarpal from the heel, then two phalanges solved with IK
  const cmc = v3(-0.021, -0.008, -0.022);
  const d0 = v3(-0.5, -0.55, -0.67).normalize();
  const mcp = cmc.clone().addScaledVector(d0, 0.04);
  bone(kit, SKIN(), cmc, mcp, 0.0135, 8);
  let target;
  const out = v3(-0.7, 0.55, 0).normalize();
  if (h.grip) {
    // rest the thumb tip over the index finger's middle phalanx
    const mid = chains[0][1];
    const m = mid.a.clone().lerp(mid.b, 0.6);
    const toward = m.clone().sub(C);
    toward.addScaledVector(T, -toward.dot(T)).normalize();
    target = m.addScaledVector(toward, mid.r + 0.009);
  } else target = mcp.clone().add(v3(-0.012, -0.02, -0.048));
  const { J, tip } = ik2(mcp, target, 0.033, 0.028, out);
  bone(kit, SKIN(), mcp, J, 0.0112, 8);
  bone(kit, SKIN(), J, tip, 0.0102, 8);
  kit.add(SKIN_DARK(), sphere(0.0098, 6, 4), xf(J.toArray()));
  nail(kit, J, tip, 0.0102, out);
  // tendons/veins and a few scratches on the back of the hand
  for (const [x0, x1] of [[-0.012, -0.018], [0.006, 0.012]]) {
    kit.add(SKIN(), tube([v3(x0 * 0.6, 0.0125, -0.006), v3((x0 + x1) / 2, 0.0158, -0.045), v3(x1, 0.0152, -0.08)], { segs: 8, radial: 4, radius: 0.0014 }));
  }
  kit.add(SCRATCH(), roundBox(0.0012, 0.0008, 0.018, 0.6, 5, 3), xf([0.012, 0.0172, -0.055], [0, 0.5, 0]));
  kit.add(SCRATCH(), roundBox(0.001, 0.0008, 0.011, 0.6, 5, 3), xf([0.017, 0.0168, -0.048], [0, 0.35, 0]));
  kit.add(GRIME(), roundBox(0.02, 0.0006, 0.012, 0.8, 6, 3), xf([-0.006, 0.0172, -0.07], [0, 0.3, 0]));
}

function buildForearm(kit, h, seed) {
  const F = v3(-Math.sin(h.rd), Math.sin(h.ext), Math.cos(h.rd) * Math.cos(h.ext)).normalize();
  const o = v3(0, -0.001, 0.004);
  const skin = [
    { t: -0.014, a: 0.025, b: 0.016 },
    { t: 0.0, a: 0.0275, b: 0.0175 },
    { t: 0.025, a: 0.029, b: 0.02 },
    { t: 0.06, a: 0.031, b: 0.023 },
  ];
  loft(kit, SKIN(), o, F, Y, skin, 12, seed);
  kit.add(SKIN_DARK(), sphere(0.0062, 6, 4), xf(o.clone().add(v3(0.024, 0.006, 0.008)).toArray()));
  // jacket sleeve: loose cuff, bunched folds near the wrist
  const sl = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = 0.042 + (i / n) ** 1.3 * 0.46;
    const g = t / 0.5;
    const hem = i === 0 ? 0.0 : i === 1 ? 0.002 : 0;
    sl.push({ t, a: 0.044 + g * 0.022 + hem, b: 0.039 + g * 0.022 + hem });
  }
  loft(kit, 'cloth', o.clone().addScaledVector(Y, 0.002), F, Y, sl, 16, seed + 5, 0.0035);
  // dark lining just inside the cuff
  const lin = loft(new Kit({ raw: true }), LINING(), o, F, Y, [{ t: 0.043, a: 0.041, b: 0.036 }, { t: 0.1, a: 0.043, b: 0.038 }], 14, seed);
  kit.add(LINING(), invert(lin.clone()));
  return F;
}

export function fpArm(opts = {}) {
  const side = opts.side === 'left' ? 'left' : 'right';
  const pose = opts.pose === 'open' ? 'open' : 'grip';
  const holdName = opts.hold && HOLDS[opts.hold] ? opts.hold : pose === 'grip' ? 'knife' : 'relaxed';
  const h = HOLDS[holdName];
  const Th = v3(-Math.cos(h.theta), 0, -Math.sin(h.theta)).normalize();
  const C = h.grip ? v3(0, -0.013 - h.R + 0.0025, -0.078) : v3(0, -0.032, -0.066);
  const hk = new Kit({ raw: true });
  buildHand(hk, h, C, Th);
  const F = buildForearm(hk, h, opts.seed ?? 3);
  // align: Th -> T (exact), forearm -> D (best fit around T)
  const Tw = v3(...h.T).normalize();
  const Dw = v3(...h.D).normalize();
  const basis = (t, d) => {
    const u = d.clone().addScaledVector(t, -d.dot(t)).normalize();
    return new THREE.Matrix4().makeBasis(t, u, new THREE.Vector3().crossVectors(t, u));
  };
  const Bh = basis(Th, F);
  const Bw = basis(Tw, Dw);
  const M = Bw.multiply(Bh.transpose()).multiply(new THREE.Matrix4().makeTranslation(-C.x, -C.y, -C.z));
  if (side === 'left') M.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  const kit = new Kit();
  kit.addParts(hk.merged(), M);
  const obj = kit.build();
  obj.userData.collider = 'none';
  obj.userData.side = side;
  obj.userData.pose = pose;
  obj.userData.hold = holdName;
  return obj;
}
