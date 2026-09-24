import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, TAU, lerp } from './rig.js';

// Geometry helpers. Every generator returns an indexed BufferGeometry with
// position, normal, uv and color attributes so any of them can be merged.

const _c = new THREE.Color();

// Smoothly interpolated profile from keys [[t, a, b?], ...] (t ascending).
// Returns f(t) -> number, or [a, b] when keys carry two values.
export function prof(keys) {
  const two = keys[0].length > 2;
  return (t) => {
    if (t <= keys[0][0]) return two ? [keys[0][1], keys[0][2]] : keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const k1 = keys[i];
      if (t <= k1[0]) {
        const k0 = keys[i - 1];
        let u = (t - k0[0]) / (k1[0] - k0[0]);
        u = u * u * (3 - 2 * u);
        return two ? [lerp(k0[1], k1[1], u), lerp(k0[2], k1[2], u)] : lerp(k0[1], k1[1], u);
      }
    }
    const k = keys[keys.length - 1];
    return two ? [k[1], k[2]] : k[1];
  };
}

function setColor(out, color, a, b, p) {
  if (typeof color === 'function') color(out, a, b, p);
  else out.set(color);
}

// Average normals of coincident vertices (UV seams, poles).
export function weldNormals(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let e = map.get(k);
    if (!e) map.set(k, (e = [0, 0, 0, []]));
    e[0] += nor.getX(i); e[1] += nor.getY(i); e[2] += nor.getZ(i);
    e[3].push(i);
  }
  for (const e of map.values()) {
    if (e[3].length < 2) continue;
    const l = Math.hypot(e[0], e[1], e[2]) || 1;
    for (const i of e[3]) nor.setXYZ(i, e[0] / l, e[1] / l, e[2] / l);
  }
  return geo;
}

// Tube along a centreline with a variable (elliptical) cross-section.
// radius(t) -> r | [rSide, rFront]; shape(t, a) -> multiplier; color may be
// hex or fn(outColor, t, a, point). The cross-section's "front" axis starts
// along `hint` and is parallel-transported down the curve.
export function sweep({
  points, curve, seg = 16, radial = 10, radius = 0.1, shape = null,
  hint = new THREE.Vector3(0, 0, 1), capStart = true, capEnd = true, capRound = 0.35,
  tile = 0.3, color = 0xffffff, bumps = null, twist = 0,
}) {
  const cv = curve || new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
  const P = [], T = [], N = [], B = [], R = [];
  for (let i = 0; i <= seg; i++) P.push(cv.getPointAt(i / seg));
  for (let i = 0; i <= seg; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(seg, i + 1)];
    T.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  let n = hint.clone().addScaledVector(T[0], -hint.dot(T[0]));
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0).addScaledVector(T[0], -T[0].x);
  n.normalize();
  for (let i = 0; i <= seg; i++) {
    n.addScaledVector(T[i], -n.dot(T[i])).normalize();
    N.push(n.clone());
    B.push(new THREE.Vector3().crossVectors(T[i], n));
    const r = typeof radius === 'function' ? radius(i / seg) : radius;
    R.push(Array.isArray(r) ? r : [r, r]);
  }
  // Arc length for V and an integer U repeat so the seam tiles.
  const S = [0];
  for (let i = 1; i <= seg; i++) S.push(S[i - 1] + P[i].distanceTo(P[i - 1]));
  let circ = 0;
  for (const r of R) circ += Math.PI * (r[0] + r[1]);
  const uRep = Math.max(1, Math.round(circ / R.length / tile));

  const pos = [], uv = [], col = [], idx = [];
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  const ring = radial + 1;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU + twist * t;
      const ca = Math.cos(a), sa = Math.sin(a);
      let m = shape ? shape(t, a) : 1;
      d.copy(B[i]).multiplyScalar(R[i][0] * ca).addScaledVector(N[i], R[i][1] * sa);
      p.copy(P[i]).addScaledVector(d, m);
      if (bumps) {
        const k = 1 + bumps.amp * fbm3(p.x * bumps.freq, p.y * bumps.freq, p.z * bumps.freq, 3, bumps.seed || 0);
        p.copy(P[i]).addScaledVector(d, m * k);
      }
      pos.push(p.x, p.y, p.z);
      uv.push((j / radial) * uRep, S[i] / tile);
      setColor(_c, color, t, a, p);
      col.push(_c.r, _c.g, _c.b);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j, b = (i + 1) * ring + j;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const cap = (i, dir) => {
    const c = pos.length / 3;
    const r = (R[i][0] + R[i][1]) * 0.5;
    p.copy(P[i]).addScaledVector(T[i], dir * r * capRound);
    pos.push(p.x, p.y, p.z);
    uv.push(uRep * 0.5, S[i] / tile);
    setColor(_c, color, i / seg, 0, p);
    col.push(_c.r, _c.g, _c.b);
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      if (dir < 0) idx.push(c, a, a + 1);
      else idx.push(c, a + 1, a);
    }
  };
  if (capStart) cap(0, -1);
  if (capEnd) cap(seg, 1);
  return finish(pos, uv, col, idx);
}

function finish(pos, uv, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return weldNormals(g);
}

// Deformed sphere. fn(p, dir) may move p (already scaled) in place.
export function blob({
  r = 0.1, sx = 1, sy = 1, sz = 1, ws = 16, hs = 12, noise = 0, freq = 3, seed = 0,
  color = 0xffffff, fn = null, tile = 0.3,
}) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const pos = g.attributes.position;
  const p = new THREE.Vector3(), dir = new THREE.Vector3();
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    const k = r * (1 + noise * fbm3(dir.x * freq, dir.y * freq, dir.z * freq, 3, seed));
    p.set(dir.x * k * sx, dir.y * k * sy, dir.z * k * sz);
    if (fn) fn(p, dir);
    pos.setXYZ(i, p.x, p.y, p.z);
    setColor(_c, color, dir.y, Math.atan2(dir.x, dir.z), p);
    cols[i * 3] = _c.r; cols[i * 3 + 1] = _c.g; cols[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const uvs = g.attributes.uv;
  const uRep = Math.max(1, Math.round((TAU * r * Math.max(sx, sz)) / tile));
  const vRep = Math.max(1, Math.round((Math.PI * r * sy) / tile));
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * uRep, uvs.getY(i) * vRep);
  g.computeVertexNormals();
  return weldNormals(g);
}

// Give a built-in geometry the shared attribute set (uv + color).
export function prep(g, color = 0xffffff) {
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  const cols = new Float32Array(n * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(g.attributes.position, i);
    setColor(_c, color, 0, 0, p);
    cols[i * 3] = _c.r; cols[i * 3 + 1] = _c.g; cols[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  for (const k of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  }
  if (!g.index) {
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    g.setIndex(idx);
  }
  return g;
}

// Recolour an existing geometry: fn(outColor, point, normal).
export function paint(g, fn) {
  const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    _c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    fn(_c, p, n);
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();

// Transform in place: pos [x,y,z], rot [x,y,z] (euler), scale number|[x,y,z].
export function xf(g, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2]);
  else _s.set(scale, scale, scale);
  _m.compose(_t.set(pos[0], pos[1], pos[2]), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

// Mirror across X (fixes winding).
export function mirrorX(g) {
  const c = g.clone();
  c.applyMatrix4(_m.makeScale(-1, 1, 1));
  const idx = c.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  c.index.needsUpdate = true;
  c.computeVertexNormals();
  return weldNormals(c);
}

// Reverse winding and normals (for surfaces seen from the inside).
export function flip(g) {
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.index.needsUpdate = true;
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

export function merge(list) {
  const g = mergeGeometries(list.filter(Boolean), false);
  if (!g) throw new Error('[models] mergeGeometries failed (attribute mismatch)');
  for (const x of list) if (x) x.dispose();
  return g;
}

// Straight or curved tapered spike (teeth, claws, horn tines).
export function spike({ len = 0.05, r = 0.008, curve = 0, radial = 5, seg = 3, dir = [0, 1, 0], bend = [0, 0, 1], color = 0xffffff, tip = 0.02 }) {
  const d = new THREE.Vector3(...dir).normalize();
  const b = new THREE.Vector3(...bend).normalize();
  const pts = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    pts.push(new THREE.Vector3().addScaledVector(d, len * t).addScaledVector(b, curve * len * t * t));
  }
  return sweep({ points: pts, seg, radial, radius: (t) => r * Math.max(tip, 1 - t) ** 0.8, capStart: true, capEnd: false, capRound: 0.1, color, hint: b, tile: 0.1 });
}

export function triCount(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const c = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    n += o.isInstancedMesh ? c * o.count : c;
  });
  return n;
}
