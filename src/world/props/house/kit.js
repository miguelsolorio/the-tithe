import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getMaterial, solid, getDecalMaterial } from '../../materials.js';
import { makeRng } from '../../../core/rng.js';

// Prop-building kit for the house props: a small builder that collects
// geometry per shared material and merges it into one mesh per material,
// plus reusable parts (candles, chains, skulls, books, drips).

export const TAU = Math.PI * 2;
const Y_UP = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export const v3 = (p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));
const r3 = (n) => Math.round(n * 1000) / 1000;

// Local transform from position, euler rotation and scale.
export function trs(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

// Detail colours the named materials don't cover. They resolve through
// solid()'s cache, so every prop shares the same material objects.
const SOLIDS = {
  brass: [0x6e5220, { roughness: 0.4, metalness: 0.8 }],
  nickel: [0x77756c, { roughness: 0.35, metalness: 0.85 }],
  iron: [0x1a1a1b, { roughness: 0.65, metalness: 0.55 }],
  gilt: [0x5c4418, { roughness: 0.45, metalness: 0.7 }],
  wax: [0xd8caa6, { roughness: 0.55, emissive: 0x40200a, emissiveIntensity: 0.35 }],
  waxOld: [0xb4a684, { roughness: 0.6 }],
  waxRed: [0x5c1010, { roughness: 0.5, emissive: 0x200402, emissiveIntensity: 0.3 }],
  waxBlack: [0x1b1614, { roughness: 0.5 }],
  linen: [0x7a6d57, { roughness: 0.95 }],
  ticking: [0x6c6452, { roughness: 0.95 }],
  dustSheet: [0x8f897b, { roughness: 1 }],
  ceramic: [0xb3ad9d, { roughness: 0.3 }],
  enamel: [0x1d2621, { roughness: 0.45 }],
  ivory: [0xaea48a, { roughness: 0.45 }],
  ink: [0x0b0a09, { roughness: 0.3 }],
  blood: [0x3c0508, { roughness: 0.22 }],
  bloodDry: [0x2c0507, { roughness: 0.6 }],
  water: [0x0b1d20, { roughness: 0.05, metalness: 0.3 }],
  card: [0x5b4730, { roughness: 1 }],
  tape: [0x7a6a4c, { roughness: 0.7 }],
  leather: [0x2b1a10, { roughness: 0.7 }],
  felt: [0x1d2a1e, { roughness: 1 }],
  ash: [0x2c2a27, { roughness: 1 }],
  char: [0x0f0d0c, { roughness: 0.9 }],
  ember: [0x2a0800, { roughness: 0.9, emissive: 0xff4a12, emissiveIntensity: 2.2 }],
  dusk: [0x120804, { roughness: 1, emissive: 0xc8762a, emissiveIntensity: 0.32 }],
  shade: [0x5a4a34, { roughness: 0.95 }],
  shadeOn: [0x6a4a28, { roughness: 0.95, emissive: 0xff9a48, emissiveIntensity: 0.7 }],
  rugDark: [0x1f0c0b, { roughness: 1 }],
  rugGold: [0x5e4626, { roughness: 1 }],
  paint: [0x3a3d33, { roughness: 0.85 }],
  murky: [0x3a3a1e, { roughness: 0.15 }],
  jarRed: [0x4a1712, { roughness: 0.15 }],
  sinew: [0x5a1a18, { roughness: 0.3 }],
  antler: [0x7d6c52, { roughness: 0.7 }],
};

// Book cloth colours (index with rng).
export const BOOK_COLORS = [0x4a1612, 0x1f2e1c, 0x3a2616, 0x141210, 0x1a1e2e, 0x5e4c30, 0x55361a, 0x2a1a24];
export const bookMat = (i) => solid(BOOK_COLORS[i % BOOK_COLORS.length], { roughness: 0.75 });

// Resolve a material token: a Material, a getMaterial() name, a SOLIDS name,
// 'decal:<kind>' for getDecalMaterial(), or a hex number for solid().
export function mat(m) {
  if (m && m.isMaterial) return m;
  if (typeof m === 'string') {
    if (m.startsWith('decal:')) return getDecalMaterial(m.slice(6));
    if (SOLIDS[m]) return solid(SOLIDS[m][0], SOLIDS[m][1]);
    return getMaterial(m);
  }
  if (typeof m === 'number') return solid(m);
  return getMaterial('black');
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// Make a geometry mergeable: indexed, only position/normal/uv, no groups.
function prep(geo) {
  const n = geo.attributes.position.count;
  if (!geo.index) {
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(idx);
  }
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  geo.clearGroups();
  geo.morphAttributes = {};
  return geo;
}

// Box-projected UVs in metres / material tile, like the level's world UVs.
function boxUV(geo, tile, uo, vo) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const k = 1 / tile;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u;
    let v;
    if (ax >= ay && ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else if (ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv.setXY(i, u * k + uo, v * k + vo);
  }
  uv.needsUpdate = true;
}

// Normalise UVs to 0..1 across the geometry's XY bounds (decals, glass).
export function unitUV(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  const w = b.max.x - b.min.x || 1;
  const h = b.max.y - b.min.y || 1;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / w, (p.getY(i) - b.min.y) / h);
  return geo;
}

// Irregular splat outline in the XY plane (faces +Z), UVs 0..1.
export function blobGeo(rng, rx, ry = rx, n = 11, jag = 0.35) {
  const shape = new THREE.Shape();
  const ph = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * TAU;
    const r = 1 - jag * rng();
    const x = Math.cos(a) * rx * r;
    const y = Math.sin(a) * ry * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return unitUV(new THREE.ShapeGeometry(shape));
}

// A run of blood down a vertical face: a band at the top narrowing into a
// wavy trail with a drop at the bottom. XY plane, top edge at y = 0.
export function dripGeo(rng, w, len) {
  const s = new THREE.Shape();
  const tw = w * rng.range(0.18, 0.32);
  const wob = rng.range(-1, 1) * w * 0.2;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.quadraticCurveTo(w * 0.1, -len * 0.15, tw / 2 + wob * 0.5, -len * 0.45);
  s.lineTo(tw / 2 + wob, -len * 0.88);
  s.quadraticCurveTo(tw * 1.1 + wob, -len, wob, -len * 1.02);
  s.quadraticCurveTo(-tw * 1.1 + wob, -len, -tw / 2 + wob, -len * 0.88);
  s.lineTo(-tw / 2 + wob * 0.5, -len * 0.45);
  s.quadraticCurveTo(-w * 0.1, -len * 0.15, -w / 2, 0);
  return unitUV(new THREE.ShapeGeometry(s, 3));
}

// Tube along a Catmull-Rom curve with a radius that varies along its length
// (r may be a number or a function of t in 0..1). Ends are capped when thick.
export function taperTubeGeo(points, r, segments = 8, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map(v3));
  const frames = curve.computeFrenetFrames(segments, false);
  const rf = typeof r === 'function' ? r : () => r;
  const pos = [];
  const nor = [];
  const idx = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, P);
    const rad = rf(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const sn = Math.sin(a);
      const cs = -Math.cos(a);
      N.set(0, 0, 0).addScaledVector(frames.normals[i], cs).addScaledVector(frames.binormals[i], sn).normalize();
      pos.push(P.x + rad * N.x, P.y + rad * N.y, P.z + rad * N.z);
      nor.push(N.x, N.y, N.z);
    }
  }
  for (let i = 1; i <= segments; i++) {
    for (let j = 1; j <= radial; j++) {
      const a = (radial + 1) * (i - 1) + (j - 1);
      const b = (radial + 1) * i + (j - 1);
      const c = (radial + 1) * i + j;
      const d = (radial + 1) * (i - 1) + j;
      idx.push(a, b, d, b, c, d);
    }
  }
  // End caps (fans) facing away from the tube.
  for (const end of [0, 1]) {
    const rad = rf(end);
    if (rad < 0.0015) continue;
    const i = end * segments;
    curve.getPointAt(end, P);
    const tan = frames.tangents[i].clone().multiplyScalar(end ? 1 : -1);
    const c = pos.length / 3;
    pos.push(P.x, P.y, P.z);
    nor.push(tan.x, tan.y, tan.z);
    for (let j = 0; j <= radial; j++) {
      const k = (radial + 1) * i + j;
      pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      nor.push(tan.x, tan.y, tan.z);
    }
    for (let j = 0; j < radial; j++) {
      if (end) idx.push(c, c + 2 + j, c + 1 + j);
      else idx.push(c, c + 1 + j, c + 2 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// Surface through a list of closed rings (each an array of [x, y, z] with the
// same count, ordered bottom to top, counter-clockwise seen from above).
// inward = true flips the faces to be seen from inside (tub interiors).
export function loftGeo(rings, { inward = false, capStart = false, capEnd = false } = {}) {
  const n = rings[0].length;
  const pos = [];
  const idx = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + ((i + 1) % n);
      const d = (r + 1) * n + i;
      if (inward) idx.push(a, c, b, a, d, c);
      else idx.push(a, b, c, a, c, d);
    }
  }
  const cap = (ring, up) => {
    const c = pos.length / 3;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of ring) {
      cx += p[0] / n;
      cy += p[1] / n;
      cz += p[2] / n;
    }
    pos.push(cx, cy, cz);
    const base = c + 1;
    for (const p of ring) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < n; i++) {
      const a = base + i;
      const b = base + ((i + 1) % n);
      if (up) idx.push(c, a, b);
      else idx.push(c, b, a);
    }
  };
  if (capStart) cap(rings[0], inward);
  if (capEnd) cap(rings[rings.length - 1], !inward);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Superellipse ring (rounded rectangle for exponent ~3-4, ellipse for 2).
export function superRing(a, b, y, n = 28, e = 3, cx = 0, cz = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
    const z = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / e);
    // Counter-clockwise seen from above means +X toward -Z.
    out.push([cx + x, y, cz - z]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class Kit {
  constructor(seed = 1) {
    this.seed = seed;
    this.rng = makeRng(seed);
    const r = makeRng(((seed * 2654435761) >>> 0) || 7);
    this.uo = r() * 5;
    this.vo = r() * 5;
    this.parts = new Map();
    this.m = new THREE.Matrix4();
    this.stack = [];
  }

  // Transform stack: parts added between push/pop are placed in that frame.
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    this.stack.push(this.m);
    this.m = this.m.clone().multiply(trs(x, y, z, rx, ry, rz, s));
    return this;
  }

  pushMatrix(m4) {
    this.stack.push(this.m);
    this.m = this.m.clone().multiply(m4);
    return this;
  }

  pop() {
    this.m = this.stack.pop();
    return this;
  }

  // A local point in prop space, as a rounded [x, y, z] array.
  at(x = 0, y = 0, z = 0) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(this.m);
    return [r3(v.x), r3(v.y), r3(v.z)];
  }

  add(m, geo, local = null) {
    const material = mat(m);
    if (local) geo.applyMatrix4(local);
    geo.applyMatrix4(this.m);
    prep(geo);
    if (!material.transparent) boxUV(geo, material.userData.tile || 1, this.uo, this.vo);
    let list = this.parts.get(material);
    if (!list) this.parts.set(material, (list = []));
    list.push(geo);
    return geo;
  }

  box(m, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(m, new THREE.BoxGeometry(w, h, d), trs(x, y, z, rx, ry, rz));
  }

  // Axis-aligned box from two corners.
  span(m, x0, y0, z0, x1, y1, z1) {
    return this.box(m, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }

  // Rounded box (upholstery, cushions, mattresses).
  rbox(m, w, h, d, r, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 1) {
    const rr = Math.min(r, Math.min(w, h, d) / 2 - 0.0005);
    return this.add(m, new RoundedBoxGeometry(w, h, d, seg, rr), trs(x, y, z, rx, ry, rz));
  }

  cyl(m, rt, rb, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 10, open = false, t0 = 0, tl = TAU) {
    return this.add(m, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl), trs(x, y, z, rx, ry, rz));
  }

  // Cylinder from point a to point b (radius r0 at a, r1 at b).
  rod(m, a, b, r0, r1 = r0, seg = 6) {
    const A = v3(a);
    const B = v3(b);
    const dir = B.clone().sub(A);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, dir.normalize());
    const mtx = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(m, g, mtx);
  }

  // Lathe from [radius, height] pairs; profile going up faces outward.
  lathe(m, pts, x = 0, y = 0, z = 0, seg = 12, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 0), h)), seg);
    return this.add(m, g, trs(x, y, z, rx, ry, rz, sx, sy, sz));
  }

  sphere(m, r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6, rx = 0, ry = 0, rz = 0) {
    return this.add(m, new THREE.SphereGeometry(r, ws, hs), trs(x, y, z, rx, ry, rz, sx, sy, sz));
  }

  // Torus lies in the XY plane (faces +Z) before rotation.
  torus(m, R, r, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, radial = 4, tubular = 16, arc = TAU, sx = 1, sy = 1, sz = 1) {
    return this.add(m, new THREE.TorusGeometry(R, r, radial, tubular, arc), trs(x, y, z, rx, ry, rz, sx, sy, sz));
  }

  tube(m, pts, r, segments = 8, radial = 5) {
    return this.add(m, taperTubeGeo(pts, r, segments, radial));
  }

  // Extruded 2D shape (XY plane, extruded along +Z from 0 to depth).
  extrude(m, shape, depth, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, bevel = 0, curveSegments = 6) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      curveSegments,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
    });
    return this.add(m, g, trs(x, y, z, rx, ry, rz));
  }

  // Plane in the XY plane facing +Z before rotation.
  plane(m, w, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(m, new THREE.PlaneGeometry(w, h), trs(x, y, z, rx, ry, rz));
  }

  // Any prebuilt geometry.
  geo(m, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    return this.add(m, g, trs(x, y, z, rx, ry, rz, sx, sy, sz));
  }

  // Flat irregular stain lying on a horizontal surface at height y.
  stain(m, rx, rz, x, y, z, jag = 0.35, n = 11) {
    return this.geo(m, blobGeo(this.rng, rx, rz, n, jag), x, y, z, -Math.PI / 2, 0, 0);
  }

  // Irregular stain on a vertical face (faces +Z unless rotated with ry).
  stainV(m, rx, ry, x, y, z, rotY = 0, jag = 0.35) {
    return this.geo(m, blobGeo(this.rng, rx, ry, 10, jag), x, y, z, 0, rotY, 0);
  }

  // Blood run down a vertical face whose top edge is at (x, y, z).
  dripV(m, w, len, x, y, z, rotY = 0) {
    return this.geo(m, dripGeo(this.rng, w, len), x, y, z, 0, rotY, 0);
  }

  // Apply a matrix to everything added so far.
  transformAll(m4) {
    for (const list of this.parts.values()) for (const g of list) g.applyMatrix4(m4);
    return this;
  }

  bounds() {
    const box = new THREE.Box3();
    for (const list of this.parts.values()) {
      for (const g of list) {
        g.computeBoundingBox();
        box.union(g.boundingBox);
      }
    }
    return box;
  }

  // Merge into one mesh per material.
  build(name = 'prop') {
    const group = new THREE.Group();
    group.name = name;
    for (const [material, list] of this.parts) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `${name}:${material.name || 'solid'}`;
      group.add(mesh);
    }
    return group;
  }
}

// Build a finished prop group with its userData conventions. center = true
// moves a floor prop so its origin is the centre of its footprint.
export function finish(k, name, ud = {}, center = false) {
  const g = k.build(name);
  for (const [key, v] of Object.entries(ud)) if (v !== undefined) g.userData[key] = v;
  return center ? centerFloor(g) : g;
}

// Shift a floor prop (children, light offsets, collider boxes) so its solid
// footprint is centred on the origin. Transparent decals are ignored.
export function centerFloor(g) {
  const box = new THREE.Box3();
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (o.isMesh && !o.material.transparent) box.expandByObject(o);
  });
  if (box.isEmpty()) return g;
  const dx = (box.min.x + box.max.x) / 2;
  const dz = (box.min.z + box.max.z) / 2;
  if (Math.abs(dx) < 0.002 && Math.abs(dz) < 0.002) return g;
  for (const c of g.children) {
    c.position.x -= dx;
    c.position.z -= dz;
  }
  for (const l of g.userData.lights ?? []) l.offset = [r3(l.offset[0] - dx), l.offset[1], r3(l.offset[2] - dz)];
  if (Array.isArray(g.userData.collider)) {
    for (const c of g.userData.collider) {
      c.min = [r3(c.min[0] - dx), c.min[1], r3(c.min[2] - dz)];
      c.max = [r3(c.max[0] - dx), c.max[1], r3(c.max[2] - dz)];
    }
  }
  return g;
}

export const aabb = (min, max) => ({ min: min.map(r3), max: max.map(r3) });

// Light entry helpers (the engine owns the actual lights).
export const candleLight = (offset, o = {}) => ({ offset, color: 0xe08a2c, intensity: 1.2, distance: 5, flicker: 0.5, kind: 'candle', ...o });
export const bulbLight = (offset, o = {}) => ({ offset, color: 0xffc880, intensity: 2, distance: 8, flicker: 0.15, kind: 'bulb', ...o });

// Average several light offsets into one (clusters share one pool light).
export function centroid(points) {
  const c = [0, 0, 0];
  for (const p of points) for (let i = 0; i < 3; i++) c[i] += p[i] / points.length;
  return c.map(r3);
}

// ---------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------

// Turned leg profile, foot at 0, top at h, max radius r.
export function legProfile(h, r) {
  return [
    [0, 0], [r * 0.6, 0], [r * 0.72, h * 0.04], [r * 0.5, h * 0.1], [r * 0.95, h * 0.22],
    [r * 0.55, h * 0.36], [r * 0.82, h * 0.42], [r * 0.5, h * 0.5], [r * 0.72, h * 0.78],
    [r * 0.55, h * 0.84], [r * 0.82, h * 0.88], [r * 0.82, h], [0, h],
  ];
}

const FLAME = [[0, 0], [0.0052, 0.004], [0.0075, 0.013], [0.006, 0.025], [0.0024, 0.036], [0, 0.044]];

// Candle standing at the current frame origin. Returns the flame position in
// prop space (null when unlit).
export function addCandle(k, { h = 0.15, r = 0.03, lit = true, wax = 'wax', drips = 3, flame = 1, seg = 8 } = {}) {
  const rng = k.rng;
  const w = !lit && wax === 'wax' ? 'waxOld' : wax;
  const dip = Math.min(0.01, h * 0.08);
  k.lathe(w, [[0, 0], [r, 0], [r * 1.01, h * 0.55], [r * 0.98, h - dip * 0.3], [r * 0.86, h], [r * 0.5, h - dip], [0, h - dip]], 0, 0, 0, seg);
  for (let i = 0; i < drips; i++) {
    const a = rng() * TAU;
    const len = h * rng.range(0.15, 0.6);
    const top = h - rng.range(0, 0.1) * h;
    k.cyl(w, 0.0035, 0.005, len, Math.cos(a) * r * 0.98, top - len / 2, Math.sin(a) * r * 0.98, 0, a, 0, 3);
  }
  k.cyl('black', 0.0012, 0.0012, 0.012, 0, h - dip + 0.005, 0, 0.15, 0, 0, 3);
  if (!lit) return null;
  const fy = h - dip + 0.008;
  k.lathe('candleFlame', FLAME.map(([a, b]) => [a * flame, b * flame]), 0, fy, 0, 4);
  return k.at(0, fy + 0.02 * flame, 0);
}

// Chain of oval links from a to b.
export function addChain(k, a, b, { link = 0.06, thick = 0.0065, m = 'metal', tubular = 5 } = {}) {
  const A = v3(a);
  const B = v3(b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  dir.normalize();
  const n = Math.max(1, Math.round(len / (link * 0.72)));
  const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, dir);
  const R = link / 3.2 - thick;
  for (let i = 0; i < n; i++) {
    const p = A.clone().lerp(B, (i + 0.5) / n);
    const g = new THREE.TorusGeometry(R, thick, 3, tubular);
    g.scale(1, 1.6, 1);
    if (i % 2) g.rotateY(Math.PI / 2);
    g.applyQuaternion(q);
    g.translate(p.x, p.y, p.z);
    k.add(m, g);
  }
}

// Human skull at the current frame (origin on the floor under it, facing +Z).
export function addSkull(k, { jaw = true, s = 1, m = 'bone' } = {}) {
  k.push(0, jaw ? 0 : -0.027 * s, 0, 0, 0, 0, s);
  k.sphere(m, 0.072, 0, 0.1, -0.014, 0.95, 0.92, 1.16, 9, 6);
  k.box(m, 0.09, 0.05, 0.05, 0, 0.064, 0.056, -0.2, 0, 0);
  k.box(m, 0.108, 0.02, 0.03, 0, 0.114, 0.068, 0.3, 0, 0);
  k.box(m, 0.02, 0.022, 0.05, 0.054, 0.078, 0.04, 0, 0.35, 0);
  k.box(m, 0.02, 0.022, 0.05, -0.054, 0.078, 0.04, 0, -0.35, 0);
  k.sphere('black', 0.02, 0.027, 0.088, 0.07, 1, 0.95, 0.75, 5, 4);
  k.sphere('black', 0.02, -0.027, 0.088, 0.07, 1, 0.95, 0.75, 5, 4);
  k.cyl('black', 0.011, 0.011, 0.02, 0, 0.064, 0.079, Math.PI / 2, 0, Math.PI, 3);
  k.box('ivory', 0.05, 0.014, 0.02, 0, 0.035, 0.072);
  if (jaw) {
    k.box('ivory', 0.046, 0.012, 0.02, 0, 0.022, 0.07);
    k.box(m, 0.05, 0.022, 0.024, 0, 0.011, 0.076);
    k.box(m, 0.016, 0.02, 0.07, 0.035, 0.012, 0.045, 0, 0.3, 0);
    k.box(m, 0.016, 0.02, 0.07, -0.035, 0.012, 0.045, 0, -0.3, 0);
    k.box(m, 0.014, 0.05, 0.022, 0.049, 0.032, 0.012);
    k.box(m, 0.014, 0.05, 0.022, -0.049, 0.032, 0.012);
  }
  k.pop();
}

// Closed book lying flat at the current frame (spine toward -X).
export function addBookFlat(k, w, t, d, cover, x = 0, y = 0, z = 0, ry = 0) {
  k.push(x, y, z, 0, ry, 0);
  k.box(cover, w, t, d, 0, t / 2, 0);
  k.box('paper', w - 0.008, t * 0.8, d - 0.012, 0.005, t / 2, 0);
  k.pop();
}

// Open book lying in the current frame's XZ plane, spine along Z.
export function addOpenBook(k, { w = 0.34, d = 0.24, cover = 'leather', lines = 7 } = {}) {
  const rng = k.rng;
  const pw = w / 2 - 0.004;
  k.box(cover, w + 0.012, 0.005, d + 0.012, 0, 0.0025, 0);
  for (const sx of [-1, 1]) {
    k.push(sx * 0.002, 0.004, 0, 0, 0, sx * -0.06);
    k.box('paper', pw, 0.014, d, sx * pw / 2, 0.007, 0);
    for (let i = 0; i < lines; i++) {
      const lw = pw * rng.range(0.55, 0.8);
      const lz = -d / 2 + 0.03 + (i * (d - 0.06)) / Math.max(1, lines - 1);
      k.plane('ink', lw, 0.004, sx * (pw / 2 + 0.004), 0.0145, lz, -Math.PI / 2, 0, 0);
    }
    k.pop();
  }
}

export function addPlate(k, r = 0.12, x = 0, y = 0, z = 0, m = 'ceramic') {
  k.lathe(m, [[0, 0], [r * 0.6, 0], [r * 0.95, 0.013], [r, 0.016], [r * 0.6, 0.007], [0, 0.007]], x, y, z, r > 0.2 ? 12 : 8);
}

export function addGoblet(k, x = 0, y = 0, z = 0, m = 'brass', h = 0.16, rz = 0, ry = 0) {
  const s = h / 0.16;
  k.lathe(m, [[0, 0], [0.034, 0], [0.008, 0.014], [0.006, 0.07], [0.034, 0.1], [0.037, 0.155], [0.03, 0.108], [0, 0.1]].map(([a, b]) => [a * s, b * s]), x, y, z, 6, 0, ry, rz);
}

export function addJar(k, r, h, body, x = 0, y = 0, z = 0) {
  k.lathe(body, [[0, 0], [r, 0], [r * 1.03, h * 0.72], [r * 0.8, h * 0.86], [r * 0.8, h], [0, h]], x, y, z, 8);
  k.cyl('rust', r * 0.86, r * 0.86, 0.016, x, y + h + 0.006, z, 0, 0, 0, 8);
}

// Dagger lying flat on a surface at the current frame, pointing +X.
export function addKnife(k, len = 0.17, x = 0, y = 0, z = 0, ry = 0, handle = 'woodDark') {
  k.push(x, y, z, 0, ry, 0);
  const s = new THREE.Shape();
  s.moveTo(0, -0.012);
  s.lineTo(len * 0.8, -0.008);
  s.lineTo(len, 0);
  s.lineTo(len * 0.8, 0.009);
  s.lineTo(0, 0.012);
  s.lineTo(0, -0.012);
  k.extrude('nickel', s, 0.003, 0, 0.004, 0, Math.PI / 2, 0, 0);
  k.box('brass', 0.012, 0.012, 0.05, -0.006, 0.007, 0);
  k.cyl(handle, 0.009, 0.011, 0.1, -0.062, 0.01, 0, 0, 0, Math.PI / 2, 6);
  k.pop();
}

// Thick drip running down from (x, y, z) (a tube hanging in space or on a face).
export function addDrip(k, m, x, y, z, len, r = 0.005, lean = [0, 0]) {
  const rng = k.rng;
  const pts = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    pts.push([x + lean[0] * t + (i && i < 3 ? rng.range(-1, 1) * r * 0.6 : 0), y - len * t, z + lean[1] * t]);
  }
  k.tube(m, pts, (t) => r * (0.55 + 0.45 * t) * (t > 0.86 ? 1.35 : 1), 5, 4);
}
