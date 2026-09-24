import * as THREE from 'three';

// Math, noise, pose rig and IK helpers shared by every creature.

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (t) => { t = sat(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = sat(t); return t * t * t * (t * (t * 6 - 15) + 10); };
// 0..1 ramp of v between a and b, smoothed.
export const ramp = (a, b, v) => smooth((v - a) / (b - a));
export const easeOut = (t) => 1 - (1 - sat(t)) ** 3;
export const easeIn = (t) => sat(t) ** 3;
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
// Fast-in, slow-settle pulse over [a, b] (0 -> 1 -> 0).
export const bump = (a, b, v) => { const t = (v - a) / (b - a); return t <= 0 || t >= 1 ? 0 : Math.sin(t * PI); };

// ---------------------------------------------------------------------------
// Value noise (3D), deterministic.
function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 1440662683 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 668265263);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = hash3(xi, yi, zi, seed), b = hash3(xi + 1, yi, zi, seed);
  const c = hash3(xi, yi + 1, zi, seed), d = hash3(xi + 1, yi + 1, zi, seed);
  const e = hash3(xi, yi, zi + 1, seed), f = hash3(xi + 1, yi, zi + 1, seed);
  const g = hash3(xi, yi + 1, zi + 1, seed), h = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}

// Signed fbm in roughly [-1, 1].
export function fbm3(x, y, z, oct = 3, seed = 0) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * (noise3(x * f, y * f, z * f, seed + i * 31) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

// Smooth 1D noise for twitches and sway, signed [-1, 1].
export const wobble = (t, seed = 0) => noise3(t, seed * 7.13, 0.5, 11) * 2 - 1;

// ---------------------------------------------------------------------------
// Pose rig: named pivots with rotation (and optional position) channels that
// hold offsets from the rest pose. Pose functions write a target, the state
// blender cross-fades from a snapshot of the last applied pose.
export class Rig {
  constructor() {
    this.nodes = [];
    this.map = new Map();
    this.size = 0;
  }

  add(name, node, withPos = false) {
    const base = this.size;
    this.nodes.push({ node, base, withPos, rr: node.rotation.clone(), rp: node.position.clone() });
    this.map.set(name, base);
    this.size += withPos ? 6 : 3;
    return node;
  }

  // Virtual channel holder (IK targets etc.): a detached Object3D at rest 0.
  addVirtual(name) {
    const o = new THREE.Object3D();
    this.add(name, o, true);
    return o;
  }

  finalize() {
    this.cur = new Float32Array(this.size);
    this.from = new Float32Array(this.size);
    this.tgt = new Float32Array(this.size);
    return this;
  }

  r(name, x = 0, y = 0, z = 0) {
    const i = this.map.get(name), t = this.tgt;
    t[i] = x; t[i + 1] = y; t[i + 2] = z;
  }

  ra(name, x = 0, y = 0, z = 0) {
    const i = this.map.get(name), t = this.tgt;
    t[i] += x; t[i + 1] += y; t[i + 2] += z;
  }

  p(name, x = 0, y = 0, z = 0) {
    const i = this.map.get(name) + 3, t = this.tgt;
    t[i] = x; t[i + 1] = y; t[i + 2] = z;
  }

  pa(name, x = 0, y = 0, z = 0) {
    const i = this.map.get(name) + 3, t = this.tgt;
    t[i] += x; t[i + 1] += y; t[i + 2] += z;
  }

  // Read a channel of the current (blended) pose.
  get(name, k = 0) { return this.cur[this.map.get(name) + k]; }

  blend(w) {
    const c = this.cur, f = this.from, t = this.tgt;
    for (let i = 0; i < c.length; i++) c[i] = f[i] + (t[i] - f[i]) * w;
  }

  apply() {
    const c = this.cur;
    for (const n of this.nodes) {
      const b = n.base;
      n.node.rotation.set(n.rr.x + c[b], n.rr.y + c[b + 1], n.rr.z + c[b + 2]);
      if (n.withPos) n.node.position.set(n.rp.x + c[b + 3], n.rp.y + c[b + 4], n.rp.z + c[b + 5]);
    }
  }
}

// Drives a Rig from the AI state: detects state changes (or restarts of the
// same state), snapshots the current pose and cross-fades into the new one.
export class Animator {
  constructor(rig, blendTimes = {}, defaultBlend = 0.22) {
    this.rig = rig;
    this.blendTimes = blendTimes;
    this.defaultBlend = defaultBlend;
    this.state = null;
    this.prev = null;
    this.lastTime = 0;
    this.blendT = 0;
    this.blendDur = 0;
    this.first = true;
  }

  // poseFn(rig, s) writes the target pose for s.state.
  update(dt, s, poseFn) {
    const rig = this.rig;
    const st = s.stateTime ?? 0;
    if (s.state !== this.state || st + 1e-3 < this.lastTime) {
      rig.from.set(rig.cur);
      this.prev = this.state;
      this.state = s.state;
      this.blendT = 0;
      this.blendDur = this.first ? 0 : (this.blendTimes[s.state] ?? this.defaultBlend);
      this.first = false;
    }
    this.lastTime = st;
    rig.tgt.fill(0);
    poseFn(rig, s);
    this.blendT += dt;
    const w = this.blendDur > 0 ? smooth(this.blendT / this.blendDur) : 1;
    rig.blend(w);
    rig.apply();
    return w;
  }
}

// ---------------------------------------------------------------------------
// IK

// Two-bone IK in the y/z plane of the parent. Both bones rest along -Y.
// bend = +1: middle joint points forward (human knee), -1: backward (elbow of
// a quadruped foreleg). Writes [upper rotation.x, lower rotation.x] to out.
export function ik2(l1, l2, tz, ty, bend, out) {
  let d = Math.hypot(tz, ty);
  d = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const aT = Math.atan2(tz, -ty);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const K = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  out[0] = -(aT + bend * A);
  out[1] = bend * (PI - K);
  return out;
}

const _S = new THREE.Vector3();
const _T = new THREE.Vector3();
const _E = new THREE.Vector3();
const _P = new THREE.Vector3();
const _X = new THREE.Vector3();
const _Y = new THREE.Vector3();
const _Z = new THREE.Vector3();
const _M = new THREE.Matrix4();
const _Q = new THREE.Quaternion();
const _QP = new THREE.Quaternion();

// Two-bone IK in 3D (world space). upper/lower are pivots whose bones rest
// along local -Y, lower sits l1 below upper. pole = world point the middle
// joint should point toward. flex = +1 if the lower bone folds toward the
// upper's local +Z (arms), -1 toward -Z (legs). Sets upper.quaternion and
// lower.rotation.x. Returns the clamped reach ratio (1 = fully stretched).
export function ik3(upper, lower, l1, l2, target, pole, flex = 1) {
  const parent = upper.parent;
  parent.updateWorldMatrix(true, false);
  _S.copy(upper.position).applyMatrix4(parent.matrixWorld);
  _T.subVectors(target, _S);
  const dRaw = _T.length();
  const d = clamp(dRaw, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  _T.divideScalar(dRaw || 1);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _P.subVectors(pole, _S);
  _P.addScaledVector(_T, -_P.dot(_T));
  if (_P.lengthSq() < 1e-8) _P.set(0, 0, -1).addScaledVector(_T, -_T.z);
  _P.normalize();
  _E.copy(_S).addScaledVector(_T, cosA * l1).addScaledVector(_P, sinA * l1);
  // Upper bone basis: +Y from elbow to shoulder, Z toward the flex side.
  _Y.subVectors(_S, _E).normalize();
  _Z.copy(_P).addScaledVector(_Y, -_P.dot(_Y)).normalize().multiplyScalar(-flex);
  _X.crossVectors(_Y, _Z).normalize();
  _Z.crossVectors(_X, _Y);
  _M.makeBasis(_X, _Y, _Z);
  _Q.setFromRotationMatrix(_M);
  parent.getWorldQuaternion(_QP).invert();
  upper.quaternion.copy(_QP.multiply(_Q));
  // Lower bone: direction toward the target in upper-local space.
  const tgt = _E.copy(_S).addScaledVector(_T, d);
  _P.subVectors(tgt, _S).addScaledVector(_Y, l1); // tgt - elbow
  _Q.invert();
  _P.applyQuaternion(_Q);
  lower.rotation.set(Math.atan2(-_P.z, -_P.y), 0, 0);
  return dRaw / (l1 + l2);
}

// Parabolic sag between two points; writes n+1 points into out (Vector3[]).
export function sagCurve(a, b, sag, n, out) {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = out[i] || (out[i] = new THREE.Vector3());
    p.lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
  }
  return out;
}
