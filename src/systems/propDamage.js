import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Wear on interactive props: knife gouges and splintered bullet holes that
// build up hit by hit. Each damaged prop gets one Marks mesh (its projected
// decals merged, one draw call) parented to the prop so the marks travel
// with it when it slides or tips over.

const CAP = 24;
const CELLS = { gouge: 0, hole: 1, split: 2 };
let material = null;

// Where exactly a ray meets the prop's geometry (its collider is only a
// box). spread > 0 also tries a ring of rays around it: a knife slash is
// wide and shouldn't slip between a chair's slats.
const _ray = new THREE.Raycaster();
const _hits = [];
const _d = new THREE.Vector3();
const _o = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
export function surfaceHit(obj, point, dir, spread = 0) {
  obj.updateMatrixWorld(true);
  const tries = spread > 0 ? 9 : 1;
  for (let i = 0; i < tries; i++) {
    _d.copy(dir);
    if (i > 0) {
      const a = ((i - 1) / 8) * Math.PI * 2;
      const side = _o.crossVectors(dir, _up).normalize();
      const up = _b.crossVectors(side, dir).normalize();
      _d.addScaledVector(side, Math.cos(a) * spread).addScaledVector(up, Math.sin(a) * spread).normalize();
    }
    _ray.set(_o.set(point.x - dir.x * 0.3, point.y - dir.y * 0.3, point.z - dir.z * 0.3), _d);
    _ray.far = 1.8;
    _hits.length = 0;
    _ray.intersectObject(obj, true, _hits);
    const h = _hits.find((x) => x.face && x.object.isMesh && !x.object.userData.marks && !x.object.material.transparent);
    if (!h) continue;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (n.dot(_d) > 0) n.negate();
    return { point: h.point.clone(), normal: n, mesh: h.object };
  }
  return null;
}

export class Marks {
  constructor(parent) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), markMaterial());
    this.mesh.name = 'propMarks';
    this.mesh.userData.marks = true;
    this.mesh.renderOrder = 2;
    this.parts = [];
    parent.add(this.mesh);
  }

  // Project a mark onto `target` (the mesh that was hit) at a world point.
  // tangent: the mark's long axis (world), or null for a random spin. The
  // decal is clipped to the surface, so it never hangs off a thin slat.
  add(kind, target, point, normal, tangent, len, wid, depth = 0.05) {
    const n = _n.copy(normal).normalize();
    let t = tangent ? _t.copy(tangent).addScaledVector(n, -tangent.dot(n)) : null;
    if (!t || t.lengthSq() < 1e-4) {
      t = _t.set(0, 1, 0);
      if (Math.abs(n.y) > 0.9) t.set(1, 0, 0);
      t.addScaledVector(n, -t.dot(n)).applyAxisAngle(n, Math.random() * Math.PI * 2);
    }
    t.normalize();
    const b = _b.crossVectors(n, t).normalize();
    _e.setFromRotationMatrix(_m.makeBasis(t, b, n));
    target.updateMatrixWorld(true);
    const geo = new DecalGeometry(target, point, _e, _s.set(len, wid, depth));
    if (!geo.attributes.position.count) {
      geo.dispose();
      return;
    }
    // Atlas cell, then into the parent's space (world -> local).
    const cell = CELLS[kind] ?? 0;
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 3);
    const parent = this.mesh.parent;
    parent.updateMatrixWorld(true);
    geo.applyMatrix4(_m.copy(parent.matrixWorld).invert());
    // Nudge off the surface along its normals against z-fighting.
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * 0.0015, pos.getY(i) + nor.getY(i) * 0.0015, pos.getZ(i) + nor.getZ(i) * 0.0015);
    this.parts.push(geo);
    if (this.parts.length > CAP) this.parts.shift().dispose();
    const old = this.mesh.geometry;
    this.mesh.geometry = this.parts.length === 1 ? this.parts[0].clone() : mergeGeometries(this.parts, false);
    old.dispose();
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    for (const g of this.parts) g.dispose();
  }
}

const _m = new THREE.Matrix4();
const _n = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

function markMaterial() {
  if (material) return material;
  const tex = new THREE.CanvasTexture(markAtlas());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  material = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 0.9,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  material.name = 'propMarks';
  return material;
}

// Three 128 px cells: a knife gouge (dark slit in torn pale wood), a
// splintered bullet hole, and a long split along the grain.
function markAtlas() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S * 3;
  cv.height = S;
  const x = cv.getContext('2d');
  const raw = (a) => `rgba(${196 + rand(-12, 12)},${150 + rand(-12, 12)},${98 + rand(-10, 10)},${a})`;
  const dark = (a) => `rgba(22,12,8,${a})`;

  // Gouge: torn raw-wood lips around a dark wedge, splinters at the ends.
  x.save();
  x.translate(S / 2, S / 2);
  jagged(x, 56, 20, 26, raw(0.95));
  jagged(x, 50, 14, 22, 'rgba(120,84,52,0.95)');
  jagged(x, 46, 8, 18, dark(1));
  for (let i = 0; i < 9; i++) {
    x.strokeStyle = raw(0.8);
    x.lineWidth = rand(1, 2.5);
    const sx = rand(-50, 50);
    x.beginPath();
    x.moveTo(sx, rand(-8, 8));
    x.lineTo(sx + rand(-16, 16), rand(-26, 26));
    x.stroke();
  }
  x.restore();

  // Bullet hole: splintered pale star, dark core, soot ring.
  x.save();
  x.translate(S * 1.5, S / 2);
  const g = x.createRadialGradient(0, 0, 8, 0, 0, 58);
  g.addColorStop(0, dark(0.55));
  g.addColorStop(1, dark(0));
  x.fillStyle = g;
  x.fillRect(-64, -64, 128, 128);
  x.fillStyle = raw(0.95);
  x.beginPath();
  const spikes = 14;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 ? rand(14, 20) : rand(26, 50);
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.fill();
  x.fillStyle = 'rgba(140,100,64,0.95)';
  x.beginPath();
  x.arc(0, 0, 16, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = dark(1);
  x.beginPath();
  x.arc(0, 0, 13, 0, Math.PI * 2);
  x.fill();
  x.restore();

  // Split: a long thin crack with pale edges.
  x.save();
  x.translate(S * 2.5, S / 2);
  x.lineCap = 'round';
  for (const [w, c] of [[10, raw(0.85)], [5, dark(1)]]) {
    x.strokeStyle = c;
    x.lineWidth = w;
    x.beginPath();
    let px = -60;
    let py = rand(-4, 4);
    x.moveTo(px, py);
    const r = rngFrom(7);
    while (px < 60) {
      px += 8 + r() * 8;
      py = Math.max(-20, Math.min(20, py + (r() - 0.5) * 12));
      x.lineTo(px, py);
    }
    x.stroke();
  }
  x.restore();
  return cv;
}

// Irregular lens shape: half-length l, half-width w, jagged edge.
function jagged(x, l, w, n, fill) {
  x.fillStyle = fill;
  x.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.75 + Math.random() * 0.4;
    x.lineTo(Math.cos(a) * l * (0.9 + Math.random() * 0.15), Math.sin(a) * w * k * Math.pow(Math.abs(Math.cos(a * 0.5)) * 0.4 + 0.6, 1));
  }
  x.closePath();
  x.fill();
}

const rand = (a, b) => a + Math.random() * (b - a);
function rngFrom(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
