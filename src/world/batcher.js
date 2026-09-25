import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collects static geometry per (material, spatial chunk) and merges it into a
// few big meshes. Geometry added with worldUV gets box-projected UVs from its
// world position (u/v = world coord / material tile), so textures keep the
// same density on walls of any size.

const CHUNK = 14;

export class StaticBatcher {
  constructor() {
    this.buckets = new Map();
    this.tracked = [];
    this.trackedGeos = new Set();
  }

  // geo must already be in world space (the batcher takes ownership).
  // vOffset: world height treated as v = 0 (a room's floor), so wallpaper
  // grime sits at the bottom of the wall whatever the floor height.
  add(geo, material, { worldUV = true, cast = true, receive = true, vOffset = 0 } = {}) {
    geo = normalize(geo);
    if (worldUV) projectUVs(geo, material.userData.tile || 1, vOffset);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(_v);
    const key = `${material.uuid}|${Math.floor(c.x / CHUNK)}|${Math.floor(c.z / CHUNK)}|${cast ? 1 : 0}${receive ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { material, geos: [], cast, receive };
      this.buckets.set(key, b);
    }
    b.geos.push(geo);
    return geo;
  }

  // Add every mesh under an Object3D (props). Uses the prop's own UVs.
  // track = true: after build(), obj.userData.batch lists where each of its
  // meshes landed ({ src, mesh, start, count } vertex ranges) so the prop
  // can later be hidden from the batch (see hideRange) and woken up.
  addObject(obj, track = false) {
    obj.updateMatrixWorld(true);
    const entries = track ? [] : null;
    obj.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.length !== 1) return; // multi-material meshes are rare; skip batching them
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      this.add(g, mats[0], { worldUV: !!m.userData.worldUV, cast: m.castShadow !== false, receive: true });
      if (entries) {
        this.trackedGeos.add(g);
        entries.push({ src: m, geo: g });
      }
    });
    if (track) this.tracked.push({ obj, entries });
  }

  build(parent) {
    const meshes = [];
    const where = new Map();
    for (const b of this.buckets.values()) {
      let start = 0;
      const offsets = [];
      for (const g of b.geos) {
        offsets.push(start);
        start += g.attributes.position.count;
      }
      const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, b.material);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
      b.geos.forEach((g, i) => {
        if (this.trackedGeos.has(g)) where.set(g, { mesh, start: offsets[i], count: g.attributes.position.count });
        if (g !== merged) g.dispose();
      });
    }
    for (const { obj, entries } of this.tracked) {
      obj.userData.batch = entries.map(({ src, geo }) => ({ src, ...where.get(geo) })).filter((e) => e.mesh);
    }
    this.tracked = [];
    this.trackedGeos.clear();
    this.buckets.clear();
    return meshes;
  }
}

const _v = new THREE.Vector3();

// Collapse vertices [start, start + count) of a mesh to one point, so their
// triangles vanish without touching the draw call (a batched prop picked up,
// a book knocked off a shelf).
export function hideRange(mesh, start, count) {
  const p = mesh.geometry.attributes.position;
  const x = p.getX(start);
  const y = p.getY(start);
  const z = p.getZ(start);
  for (let i = start; i < start + count; i++) p.setXYZ(i, x, y, z);
  p.addUpdateRange(start * 3, count * 3);
  p.needsUpdate = true;
}

// Keep only position/normal/uv, always indexed, so everything merges.
function normalize(geo) {
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

export function projectUVs(geo, tile, vOffset = 0) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const inv = 1 / tile;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const x = p.getX(i);
    const y = p.getY(i) - vOffset;
    const z = p.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x * inv, z * inv);
    else if (ax >= az) uv.setXY(i, z * inv * Math.sign(n.getX(i) || 1), y * inv);
    else uv.setXY(i, -x * inv * Math.sign(n.getZ(i) || 1), y * inv);
  }
  uv.needsUpdate = true;
}
