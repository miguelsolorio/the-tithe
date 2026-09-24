import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial, solid } from '../../world/materials.js';
import { PROP_NAMES } from '../../world/props/index.js';

// Shared layout and helpers for the upstairs level.
//
// Plan cells are 1 m. ORIGIN is offset by a quarter metre so every 1 m door
// centre lands on a 0.5 m nav-grid cell centre (enemies can path through
// framed doors).

export const ORIGIN = [-21.25, -14];
export const W = 46;
export const H = 26;

// Cell rectangles (inclusive) per room key.
export const ROOMS = [
  ['H', 2, 12, 41, 13], // upper hallway
  ['e', 42, 12, 44, 13], // hallway end under the attic hatch (own ceiling with a hole)
  ['l', 19, 14, 23, 15], // top of the grand stairs
  ['u', 20, 16, 22, 21], // stairs down to the ground floor
  ['d', 18, 22, 22, 22], // turn at the bottom of the flight
  ['M', 2, 2, 11, 11], // master bedroom
  ['R', 14, 1, 28, 11], // ritual room
  ['N', 30, 4, 36, 11], // nursery
  ['B', 38, 6, 43, 11], // bathroom
  ['S', 2, 14, 9, 20], // storage
  ['W', 11, 14, 17, 19], // robing room (masks and robes)
  ['C', 25, 14, 26, 16], // linen closet
  ['p', 26, 17, 26, 19], // crawl passage behind the closet
  ['X', 24, 20, 29, 23], // hidden shrine
  ['Q', 29, 14, 35, 19], // sickroom where she was kept
];

export function makeRows() {
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  for (const [k, i0, j0, i1, j1] of ROOMS) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j][i] = k;
  return g.map((r) => r.join(''));
}

// Cell edges and centres in world space.
export const X = (i) => ORIGIN[0] + i;
export const Z = (j) => ORIGIN[1] + j;
export const CX = (i) => ORIGIN[0] + i + 0.5;
export const CZ = (j) => ORIGIN[1] + j + 0.5;

// Attic: its own XZ area (floors must not overlap). Hallway hatch hole and the
// attic floor hole are the same opening seen from both sides; attic = hall + OFF.
export const HALL_HOLE = { x0: 21.55, x1: 22.75, z0: -1.4, z1: -0.6 };
export const OFF = [21, 0, 1];
export const ATTIC = { x0: 40, x1: 62, z: 6, y: 3.4, ridge: 3.6, eave: 0.35 };
export const LADDER_ANGLE = 1.134; // ~65 degrees
export const CEIL = 3.1;

// Materials for small custom meshes (cached by solid()).
export const M = {
  skin: () => solid(0x8c8174, { roughness: 0.7 }),
  skinDead: () => solid(0x6f6a5e, { roughness: 0.75 }),
  porcelain: () => solid(0xcfc6b4, { roughness: 0.35 }),
  suit: () => solid(0x17130f, { roughness: 0.9 }),
  shirt: () => solid(0x6e665a, { roughness: 0.9 }),
  blood: () => solid(0x3c0508, { roughness: 0.25 }),
  bloodDry: () => solid(0x2a0406, { roughness: 0.6 }),
  robe: () => solid(0x3d0a0f, { roughness: 0.92 }),
  linen: () => solid(0x8c8270, { roughness: 0.95 }),
  linenDirty: () => solid(0x6a604c, { roughness: 0.95 }),
  straw: () => solid(0x5e4c2a, { roughness: 1 }),
  hair: () => solid(0x1a120c, { roughness: 0.8 }),
  eye: () => solid(0x050404, { roughness: 0.2 }),
  dress: (c) => solid(c, { roughness: 0.95 }),
  iron: () => solid(0x1a1a1b, { roughness: 0.65, metalness: 0.55 }),
  brass: () => solid(0x6e5220, { roughness: 0.4, metalness: 0.8 }),
  leather: () => solid(0x2b1a10, { roughness: 0.7 }),
  glow: () => solid(0x201008, { roughness: 1, emissive: 0xe08a2c, emissiveIntensity: 1.6 }),
  moonSky: () => solid(0x0a0e14, { roughness: 1, emissive: 0x8fa8c8, emissiveIntensity: 0.55 }),
};

export const mat = (m) => (typeof m === 'string' ? getMaterial(m) : typeof m === 'function' ? m() : m);

// Collects geometry per material, then builds one mesh per material.
export class Parts {
  constructor() {
    this.map = new Map();
  }

  add(material, geo, matrix = null) {
    const m = mat(material);
    if (matrix) geo.applyMatrix4(matrix);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    let list = this.map.get(m);
    if (!list) this.map.set(m, (list = []));
    list.push(geo.index ? geo.toNonIndexed() : geo);
    return this;
  }

  box(material, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(material, new THREE.BoxGeometry(w, h, d), trs(x, y, z, rx, ry, rz));
  }

  // Capsule / cylinder between two points.
  limb(material, a, b, r, rb = r, capsule = true) {
    const A = v(a);
    const B = v(b);
    const len = A.distanceTo(B);
    const g = capsule ? new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, 8) : new THREE.CylinderGeometry(r, rb, len, 8);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(material, g, m);
  }

  sphere(material, r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 10, hs = 8) {
    return this.add(material, new THREE.SphereGeometry(r, ws, hs), trs(x, y, z, 0, 0, 0, sx, sy, sz));
  }

  build(cast = true) {
    const g = new THREE.Group();
    for (const [m, geos] of this.map) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

export const v = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

export function trs(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

const _box = new THREE.Box3();
export const topOf = (obj) => _box.setFromObject(obj).max.y;

// Level-building context shared by the room modules.
export function makeCtx(L, game, P) {
  const warned = new Set();
  const U = {
    L,
    game,
    P,
    has: (f) => game.flags.has(f),
    rect: (k) => P.rect(k),
    cull: [],
    // Registry prop, skipped (not a magenta box) if another agent's module failed to load.
    prop(name, x, z, opts = {}) {
      if (!PROP_NAMES.includes(name)) {
        if (!warned.has(name)) console.warn(`[upstairs] prop "${name}" unavailable`);
        warned.add(name);
        return null;
      }
      return L.prop(name, x, z, opts);
    },
    // Place a custom Object3D at x, y, z with a yaw. Static ones merge into batches.
    place(obj, x, y, z, rotY = 0, opts = {}) {
      obj.position.set(x, y, z);
      obj.rotation.y = rotY;
      if (opts.scale) obj.scale.setScalar(opts.scale);
      obj.updateMatrixWorld(true);
      const r = L.mesh(obj, { static: opts.static ?? true, collider: opts.collider ?? 'none' });
      return r.object;
    },
    // Flat paper note with an interaction that shows lines of text.
    note(pos, lines, prompt = 'Read the note', { size = [0.2, 0.27], rotY = null, onRead, noLOS = false, paper = true, radius = 1.6 } = {}) {
      if (paper) {
        const g = new THREE.PlaneGeometry(size[0], size[1]).rotateX(-Math.PI / 2).rotateY(rotY ?? L.rng.range(0, 3));
        g.translate(pos[0], pos[1] + 0.004, pos[2]);
        L.batcher.add(g, getMaterial('paper'), { worldUV: false, cast: false });
      }
      let read = false;
      return L.interact({
        pos: [pos[0], pos[1] + 0.05, pos[2]],
        radius,
        noLOS,
        prompt,
        onUse: (g2) => {
          lines.forEach((l, i) => g2.hud.say(l, 4 + i * 0.4));
          if (!read) onRead?.(g2);
          read = true;
        },
      });
    },
    // Blood / grime helpers.
    floorDecal: (kind, x, z, size, rot = null, y = 0) => L.decal(kind, [x, y, z], { face: 'up', size, rot }),
    wallDecal: (kind, x, y, z, face, size, rot = null) => L.decal(kind, [x, y, z], { face, size, rot }),
  };
  return U;
}
