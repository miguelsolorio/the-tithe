import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial } from '../../materials.js';

// Geometry kit shared by the depths props and the items.
//
// - Primitives return BufferGeometry whose UVs are in metres; Kit.add()
//   divides them by the material's userData.tile so every prop keeps the same
//   texel density as the level geometry.
// - Kit collects parts per material and build() merges them into one mesh per
//   material (cheap to batch, few draw calls).

export const TAU = Math.PI * 2;
export const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const toV = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
export const mat = (m) => (typeof m === 'string' ? getMaterial(m) : m);

// ---------- transforms ----------

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Matrix from position [x,y,z], Euler rotation [x,y,z] and scale (number | [x,y,z]).
export function xf(p = [0, 0, 0], r = [0, 0, 0], s = 1, order = 'XYZ') {
  _p.set(p[0], p[1], p[2]);
  _q.setFromEuler(_e.set(r[0], r[1], r[2], order));
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Matrix that maps the +Y axis onto the segment a -> b (centred), plus its length.
export function seg(a, b, twist = 0) {
  const A = toV(a);
  const B = toV(b);
  const d = B.clone().sub(A);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.multiplyScalar(1 / (len || 1)));
  if (twist) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, twist));
  const m = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, ONE);
  return { m, len };
}

// Matrix that points +Y along dir (unit) at position p.
export function aimY(p, dir, twist = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, toV(dir).normalize());
  if (twist) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, twist));
  return new THREE.Matrix4().compose(toV(p), q, ONE);
}

// ---------- uv helpers ----------

export function scaleUV(g, su, sv = su) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

// Planar UVs (metres) from the dominant normal axis; ideal for flat faces.
export function planarUV(g) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  let uv = g.attributes.uv;
  if (!uv) {
    uv = new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
    g.setAttribute('uv', uv);
  }
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}

// ---------- primitives (metric UVs) ----------

export function box(w, h, d, ws = 1, hs = 1, ds = 1) {
  return planarUV(new THREE.BoxGeometry(w, h, d, ws, hs, ds));
}

// Cylinder along Y, centred.
export function cyl(rt, rb, h, segs = 12, open = false, hseg = 1, t0 = 0, tl = TAU) {
  const g = new THREE.CylinderGeometry(rt, rb, h, segs, hseg, open, t0, tl);
  const uv = g.attributes.uv;
  const torso = (segs + 1) * (hseg + 1);
  const topCap = !open && rt > 0 ? 2 * segs + 1 : 0;
  const circ = ((rt + rb) / 2) * tl;
  const slant = Math.hypot(h, rt - rb);
  for (let i = 0; i < uv.count; i++) {
    if (i < torso) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * slant);
    else {
      const r = i < torso + topCap ? rt : rb;
      uv.setXY(i, (uv.getX(i) - 0.5) * 2 * r, (uv.getY(i) - 0.5) * 2 * r);
    }
  }
  return g;
}

export function sphere(r, ws = 12, hs = 8, ps = 0, pl = TAU, ts = 0, tl = Math.PI) {
  return scaleUV(new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl), r * pl, r * tl);
}

// Torus in the XY plane (ring around Z).
export function torus(R, r, rs = 6, ts = 16, arc = TAU) {
  return scaleUV(new THREE.TorusGeometry(R, r, rs, ts, arc), R * arc, TAU * r);
}

// Lathe around Y from [[r, y], ...] listed bottom to top.
export function lathe(pts, segs = 12, ps = 0, pl = TAU) {
  const v2 = pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  let len = 0;
  let maxR = 0;
  for (let i = 0; i < v2.length; i++) {
    maxR = Math.max(maxR, v2[i].x);
    if (i) len += v2[i].distanceTo(v2[i - 1]);
  }
  return scaleUV(new THREE.LatheGeometry(v2, segs, ps, pl), maxR * pl, len);
}

// Capsule along Y, centred; len = straight part.
export function capsule(r, len, cap = 3, radial = 8, hseg = 1) {
  return scaleUV(new THREE.CapsuleGeometry(r, len, cap, radial, hseg), TAU * r, len + Math.PI * r);
}

export function ico(r, detail = 0) {
  return scaleUV(new THREE.IcosahedronGeometry(r, detail), TAU * r, Math.PI * r);
}

// Superellipsoid "rounded box": e < 1 is boxy, e = 1 is an ellipsoid.
export function roundBox(w, h, d, e = 0.4, ws = 12, hs = 8) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position;
  const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, f(p.getX(i)) * w * 0.5, f(p.getY(i)) * h * 0.5, f(p.getZ(i)) * d * 0.5);
  }
  smoothNormals(g);
  return scaleUV(g, (w + d) * 1.2, h * 1.6);
}

// Extrude a 2D shape (x, y) by depth along +Z (UVs are already metric).
export function extrude(shape, depth, bevel = 0, bevelSegs = 1, curveSegs = 8) {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: bevelSegs,
    curveSegments: curveSegs,
  });
}

// Extrude a side profile drawn in (z, y) across X, centred on x = 0.
export function sideProfile(shape, width, bevel = 0, bevelSegs = 1, curveSegs = 8) {
  const g = extrude(shape, width, bevel, bevelSegs, curveSegs);
  // (sx, sy, sz) -> (-sz, sy, sx): shape x -> world z, extrusion -> world -x
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
  g.translate(width / 2, 0, 0);
  return g;
}

export function shapeFrom(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

// Tube along a smooth path with radius(t) and an optional elliptical section.
// points: array of [x,y,z] | Vector3, or a THREE.Curve.
export function tube(points, o = {}) {
  const { segs = 16, radial = 8, radius = 0.05, sx = 1, sy = 1, closed = false, capStart = false, capEnd = false, twist = 0 } = o;
  const curve = points.isCurve ? points : new THREE.CatmullRomCurve3(points.map(toV), closed, 'centripetal');
  const frames = curve.computeFrenetFrames(segs, closed);
  const rf = typeof radius === 'function' ? radius : () => radius;
  const secX = typeof sx === 'function' ? sx : () => sx;
  const secY = typeof sy === 'function' ? sy : () => sy;
  const L = curve.getLength();
  const pos = [];
  const nor = [];
  const uvs = [];
  const idx = [];
  const P = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const ov = new THREE.Vector3();
  let rAvg = 0;
  for (let i = 0; i <= segs; i++) rAvg += rf(i / segs) / (segs + 1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = rf(t);
    const ex = secX(t);
    const ey = secY(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU + twist * t;
      const c = -Math.cos(a);
      const s = Math.sin(a);
      ov.copy(N).multiplyScalar(c * r * ex).addScaledVector(B, s * r * ey);
      nv.copy(N).multiplyScalar(c / ex).addScaledVector(B, s / ey).normalize();
      pos.push(P.x + ov.x, P.y + ov.y, P.z + ov.z);
      nor.push(nv.x, nv.y, nv.z);
      uvs.push(t * L, (j / radial) * TAU * rAvg);
    }
  }
  for (let i = 1; i <= segs; i++) {
    for (let j = 1; j <= radial; j++) {
      const a = (radial + 1) * (i - 1) + (j - 1);
      const b = (radial + 1) * i + (j - 1);
      const c = (radial + 1) * i + j;
      const d = (radial + 1) * (i - 1) + j;
      idx.push(a, b, d, b, c, d);
    }
  }
  const cap = (i, flip) => {
    const t = i / segs;
    curve.getPointAt(t, P);
    const T = frames.tangents[i];
    const base = pos.length / 3;
    pos.push(P.x, P.y, P.z);
    nor.push(flip ? -T.x : T.x, flip ? -T.y : T.y, flip ? -T.z : T.z);
    uvs.push(0, 0);
    const ring = (radial + 1) * i;
    for (let j = 0; j < radial; j++) {
      if (flip) idx.push(base, ring + j, ring + j + 1);
      else idx.push(base, ring + j + 1, ring + j);
    }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(segs, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// Quad strip between two polylines (arrays of Vector3); normals smooth along it.
export function ribbon(A, B, uvScale = 1) {
  const pos = [];
  const uvs = [];
  const idx = [];
  let acc = 0;
  for (let i = 0; i < A.length; i++) {
    if (i) acc += A[i].distanceTo(A[i - 1]);
    const w = A[i].distanceTo(B[i]);
    pos.push(A[i].x, A[i].y, A[i].z, B[i].x, B[i].y, B[i].z);
    uvs.push(acc * uvScale, 0, acc * uvScale, w * uvScale);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- geometry ops ----------

export function flipWinding(g) {
  const index = g.index;
  if (index) {
    const a = index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    index.needsUpdate = true;
  } else {
    for (const key of Object.keys(g.attributes)) {
      const at = g.attributes[key];
      const s = at.itemSize;
      const arr = at.array;
      for (let i = 0; i < at.count; i += 3) {
        for (let k = 0; k < s; k++) {
          const t = arr[(i + 1) * s + k];
          arr[(i + 1) * s + k] = arr[(i + 2) * s + k];
          arr[(i + 2) * s + k] = t;
        }
      }
      at.needsUpdate = true;
    }
  }
  return g;
}

// Turn a closed surface inside out (seen from inside, e.g. glowing cavities).
export function invert(g) {
  flipWinding(g);
  const n = g.attributes.normal;
  if (n) for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
  return g;
}

// Smooth normals that ignore UV seams (vertices welded by position).
export function smoothNormals(g) {
  const p = g.attributes.position;
  const count = p.count;
  const index = g.index ? g.index.array : null;
  const tri = index ? index.length / 3 : count / 3;
  const acc = new Map();
  const keys = new Array(count);
  const q = 1e4;
  for (let i = 0; i < count; i++) {
    const k = `${Math.round(p.getX(i) * q)},${Math.round(p.getY(i) * q)},${Math.round(p.getZ(i) * q)}`;
    keys[i] = k;
    if (!acc.has(k)) acc.set(k, [0, 0, 0]);
  }
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const cb = new THREE.Vector3();
  for (let t = 0; t < tri; t++) {
    const i0 = index ? index[t * 3] : t * 3;
    const i1 = index ? index[t * 3 + 1] : t * 3 + 1;
    const i2 = index ? index[t * 3 + 2] : t * 3 + 2;
    a.fromBufferAttribute(p, i0);
    b.fromBufferAttribute(p, i1);
    c.fromBufferAttribute(p, i2);
    cb.subVectors(c, b);
    ab.subVectors(a, b);
    cb.cross(ab);
    for (const i of [i0, i1, i2]) {
      const s = acc.get(keys[i]);
      s[0] += cb.x;
      s[1] += cb.y;
      s[2] += cb.z;
    }
  }
  const nrm = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const s = acc.get(keys[i]);
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    nrm[i * 3] = s[0] / l;
    nrm[i * 3 + 1] = s[1] / l;
    nrm[i * 3 + 2] = s[2] / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

// Hard-edged look: split vertices and use face normals.
export function facet(g) {
  const out = g.index ? g.toNonIndexed() : g;
  out.computeVertexNormals();
  return out;
}

// Move every vertex: fn(v: Vector3, i) mutates v. Then re-smooth normals.
export function deform(g, fn, smooth = true) {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v, i);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  if (smooth) smoothNormals(g);
  return g;
}

// ---------- noise ----------

function hash3(x, y, z, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(seed, 144665)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf0 = x - xi;
  const yf0 = y - yi;
  const zf0 = z - zi;
  const u = xf0 * xf0 * (3 - 2 * xf0);
  const v = yf0 * yf0 * (3 - 2 * yf0);
  const w = zf0 * zf0 * (3 - 2 * zf0);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

// Fractal noise in [-0.5, 0.5].
export function fbm3(x, y, z, oct = 3, seed = 0) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm - 0.5;
}

// ---------- kit ----------

function prep(g) {
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  }
  for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) {
    const n = g.attributes.position.count;
    const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    g.setIndex(new THREE.BufferAttribute(arr, 1));
  }
  g.clearGroups();
  return g;
}

export class Kit {
  // raw: keep metric UVs (for reusable templates that get added to other kits).
  constructor({ raw = false } = {}) {
    this.parts = new Map();
    this.raw = raw;
  }

  // Add a geometry (consumed, so clone shared templates) with an optional matrix.
  add(m, g, matrix) {
    const material = mat(m);
    if (matrix) {
      g.applyMatrix4(matrix);
      const det = matrix.determinant();
      if (det < 0) flipWinding(g);
      const s = Math.cbrt(Math.abs(det));
      if (Math.abs(s - 1) > 1e-3) scaleUV(g, s);
    }
    const tile = material.userData.tile || 1;
    if (!this.raw && tile !== 1) scaleUV(g, 1 / tile);
    let part = this.parts.get(material.uuid);
    if (!part) this.parts.set(material.uuid, (part = { material, geos: [] }));
    part.geos.push(prep(g));
    return this;
  }

  // Merged [{ material, geo }] per material (template use; no meshes).
  merged() {
    const out = [];
    for (const { material, geos } of this.parts.values()) {
      out.push({ material, geo: geos.length === 1 ? geos[0] : mergeGeometries(geos, false) });
    }
    this.parts.clear();
    return out;
  }

  // Add template parts from merged() (cloned) with a matrix.
  addParts(parts, matrix) {
    for (const p of parts) this.add(p.material, p.geo.clone(), matrix ? matrix.clone() : undefined);
    return this;
  }

  // Cylinder between two points (radius r, or r -> rb).
  rod(m, a, b, r, segs = 8, rb = r, open = false) {
    const { m: mx, len } = seg(a, b);
    return this.add(m, cyl(rb, r, len, segs, open), mx);
  }

  // Box whose Y axis runs from a to b (w x d section).
  bar(m, a, b, w, d = w, twist = 0) {
    const { m: mx, len } = seg(a, b, twist);
    return this.add(m, box(w, len, d), mx);
  }

  // Merge everything into meshes (one per material) inside target.
  build(target = new THREE.Group()) {
    for (const { material, geo } of this.merged()) {
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = material.name || 'part';
      target.add(mesh);
    }
    return target;
  }
}

// ---------- shared shapes ----------

// Interlocking chain from `from` along dir (unit) for `length`; returns the end point.
export function chain(kit, m, from, dir, length, o = {}) {
  const { R = 0.018, r = 0.0055, stretch = 1.55, radial = 4, tubular = 6, phase = 0 } = o;
  const pitch = 2 * (R * stretch - r);
  const n = Math.max(1, Math.round(length / pitch));
  const D = toV(dir).normalize();
  const F = toV(from);
  const tmpl = torus(R, r, radial, tubular);
  tmpl.scale(1, stretch, 1);
  const q0 = new THREE.Quaternion().setFromUnitVectors(UP, D);
  const qt = new THREE.Quaternion();
  for (let k = 0; k < n; k++) {
    const c = F.clone().addScaledVector(D, (R * stretch + r) * 0.8 + k * pitch);
    qt.setFromAxisAngle(UP, ((k + phase) % 2) * (Math.PI / 2) + 0.35);
    const q = q0.clone().multiply(qt);
    kit.add(m, tmpl.clone(), new THREE.Matrix4().compose(c, q, ONE));
  }
  return F.clone().addScaledVector(D, (R * stretch + r) * 0.8 + (n - 1) * pitch + R * stretch + r);
}

// Hex nut / bolt head facing +Z at p (r = across-corners radius).
export function boltHead(kit, m, p, r = 0.01, h = 0.006, axis = [0, 0, 1]) {
  const g = cyl(r, r, h, 6);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, toV(axis).normalize());
  const pos = toV(p).addScaledVector(toV(axis).normalize(), h / 2);
  kit.add(m, g, new THREE.Matrix4().compose(pos, q, ONE));
}

// Rivet dome (cheap) at p facing axis.
export function rivet(kit, m, p, axis, r = 0.008) {
  const g = cyl(0, r, r * 0.7, 5, true);
  g.translate(0, r * 0.35, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, toV(axis).normalize());
  kit.add(m, g, new THREE.Matrix4().compose(toV(p), q, ONE));
}

export function count(obj) {
  let t = 0;
  obj.traverse((o) => {
    if (o.isMesh) t += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
  });
  return t;
}

export function box3(min, max) {
  return { min: [...min], max: [...max] };
}
