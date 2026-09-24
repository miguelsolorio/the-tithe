import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { CONFIG, LANDMARKS } from '../config.js';
import { RNG } from '../core/rng.js';
import { smoothstep } from '../core/utils.js';
import { getHeight, distToPath } from './terrain.js';
import { barkTexture } from './textures.js';

const noise = new ImprovedNoise();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// ---------- Shared materials ----------
const bark = barkTexture();
export const MATERIALS = {
  pineBark: new THREE.MeshLambertMaterial({ color: 0x5e4d3e, map: bark }),
  deadBark: new THREE.MeshLambertMaterial({ color: 0x8d867c, map: bark }),
  needles: new THREE.MeshLambertMaterial({ color: 0x25382b, flatShading: true }),
  rock: new THREE.MeshLambertMaterial({ color: 0x6a6d67, flatShading: true }),
  mossLog: new THREE.MeshLambertMaterial({ color: 0x5c5c44, map: bark }),
  shroom: new THREE.MeshLambertMaterial({ color: 0x224438, emissive: 0x3dffc4, emissiveIntensity: 1.3 }),
  twig: new THREE.MeshLambertMaterial({ color: 0x8f7d62 }),
};

// ---------- Geometry builders ----------
function pineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.1, 0.3, 11, 6).translate(0, 5.5, 0);
  const cones = [];
  for (let i = 0; i < 7; i++) {
    const r = 2.1 - i * 0.27;
    const h = 2.6 - i * 0.12;
    cones.push(new THREE.ConeGeometry(r, h, 7).translate(0, 1.9 + i * 1.25 + h / 2, 0));
  }
  return { trunk, foliage: mergeGeometries(cones) };
}

// Dead trees are a trunk plus crooked branches. Branch tips become crow perches.
export function deadTreeGeometry(rng) {
  const parts = [new THREE.CylinderGeometry(0.09, 0.33, 9.5, 6).translate(0, 4.75, 0)];
  const perches = [];
  const nBranches = rng.int(6, 9);
  for (let i = 0; i < nBranches; i++) {
    const h = rng.range(2.8, 8.6);
    const yaw = rng.range(0, Math.PI * 2);
    const tilt = rng.range(0.7, 1.35); // angle from vertical
    const len = rng.range(1.4, 3.4) * (1.2 - h / 12);
    const m = new THREE.Matrix4()
      .makeTranslation(0, h, 0)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationZ(-tilt));
    const g = new THREE.CylinderGeometry(0.02, 0.08, len, 4).translate(0, len / 2, 0).applyMatrix4(m);
    parts.push(g);
    // Twig off the branch
    const twigM = m
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(0, len * 0.6, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(rng.range(-0.9, 0.9)));
    parts.push(new THREE.CylinderGeometry(0.01, 0.03, len * 0.45, 3).translate(0, len * 0.22, 0).applyMatrix4(twigM));
    if (tilt > 0.95) perches.push(new THREE.Vector3(0, len * 0.75, 0).applyMatrix4(m));
  }
  return { geo: mergeGeometries(parts), perches };
}

function rockGeometry(rng) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  // Icosahedron is non-indexed: jitter shared corners consistently via a hash.
  const offsets = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!offsets.has(key)) offsets.set(key, rng.range(0.75, 1.2));
    const k = offsets.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function mushroomCluster(rng) {
  const parts = [];
  const n = rng.int(4, 8);
  for (let i = 0; i < n; i++) {
    const x = rng.range(-0.35, 0.35);
    const z = rng.range(-0.35, 0.35);
    const h = rng.range(0.05, 0.16);
    const r = rng.range(0.03, 0.07);
    parts.push(new THREE.CylinderGeometry(r * 0.25, r * 0.3, h, 5).translate(x, h / 2, z));
    parts.push(
      new THREE.SphereGeometry(r, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(x, h, z)
    );
  }
  return mergeGeometries(parts);
}

// A little twig doll, like something left as a warning.
export function effigyGeometry() {
  const parts = [
    new THREE.CylinderGeometry(0.02, 0.025, 0.55, 3).translate(0, 0, 0), // body
    new THREE.CylinderGeometry(0.015, 0.015, 0.5, 3).rotateZ(Math.PI / 2).translate(0, 0.12, 0), // arms
    new THREE.CylinderGeometry(0.015, 0.015, 0.36, 3).rotateZ(0.35).translate(-0.06, -0.38, 0), // legs
    new THREE.CylinderGeometry(0.015, 0.015, 0.36, 3).rotateZ(-0.35).translate(0.06, -0.38, 0),
    new THREE.CylinderGeometry(0.005, 0.005, 0.6, 3).translate(0, 0.55, 0), // twine
    new THREE.CylinderGeometry(0.018, 0.018, 0.4, 3).rotateZ(0.7).translate(0, 0.03, 0.01), // cross-brace
  ];
  return mergeGeometries(parts);
}

// ---------- Placement ----------
function inClearing(x, z, pad = 0) {
  for (const l of Object.values(LANDMARKS)) {
    if (Math.hypot(x - l.x, z - l.z) < l.r + pad) return true;
  }
  return false;
}

export function buildForest(scene, grid) {
  const rng = new RNG(CONFIG.seed);
  const { chunkSize } = CONFIG.forest;
  const half = CONFIG.world.size / 2;
  const chunkKey = (x, z) => `${Math.floor((x + half) / chunkSize)},${Math.floor((z + half) / chunkSize)}`;

  const pine = pineGeometry();
  const deadVariants = [0, 1, 2].map(() => deadTreeGeometry(rng));
  const rockVariants = [0, 1, 2].map(() => rockGeometry(rng));
  const logGeo = new THREE.CylinderGeometry(0.3, 0.36, 1, 7).rotateZ(Math.PI / 2);
  const stumpGeo = new THREE.CylinderGeometry(0.28, 0.4, 0.7, 7).translate(0, 0.25, 0);

  // Buckets: type -> chunk -> [matrices]
  const buckets = new Map();
  const put = (type, x, z, matrix) => {
    if (!buckets.has(type)) buckets.set(type, new Map());
    const b = buckets.get(type);
    const k = chunkKey(x, z);
    if (!b.has(k)) b.set(k, []);
    b.get(k).push(matrix.clone());
  };

  const perches = [];
  const pines = [];

  const addTree = (x, z, isDead, s) => {
    const y = getHeight(x, z) - 0.2;
    const sy = s * rng.range(0.9, 1.25);
    _e.set(rng.range(-0.05, 0.05), rng.range(0, Math.PI * 2), rng.range(-0.05, 0.05));
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(s, sy, s));
    if (isDead) {
      const v = rng.int(0, deadVariants.length - 1);
      put(`dead${v}`, x, z, _m);
      grid.insert({ type: 'circle', x, z, r: 0.3 * s + 0.05, kind: 'tree', dead: true });
      if (Math.hypot(x, z) < 170) {
        perches.push({
          x,
          z,
          points: deadVariants[v].perches.map((p) => p.clone().applyMatrix4(_m)),
        });
      }
    } else {
      put('pineTrunk', x, z, _m);
      put('pineFoliage', x, z, _m);
      grid.insert({ type: 'circle', x, z, r: 0.28 * s + 0.05, kind: 'tree' });
      pines.push({ x, z, s: sy });
    }
  };

  // Interior forest
  const R = CONFIG.world.boundaryInner;
  let placed = 0;
  for (let attempt = 0; attempt < CONFIG.forest.treeCount * 8 && placed < CONFIG.forest.treeCount; attempt++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.float()) * R;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const density = 0.3 + 0.7 * smoothstep(-0.35, 0.35, noise.noise(x * 0.018, 3.3, z * 0.018));
    if (rng.float() > density) continue;
    if (distToPath(x, z) < rng.range(2.4, 3.4)) continue;
    if (inClearing(x, z)) continue;
    if (grid.overlaps(x, z, CONFIG.forest.minSpacing * 0.85)) continue;
    addTree(x, z, rng.chance(CONFIG.forest.deadRatio), rng.range(0.8, 1.4));
    placed++;
  }

  // The boundary: a near-solid wall of trunks, with a gap only for the north gate.
  for (let attempt = 0; attempt < 5000; attempt++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(CONFIG.world.boundaryInner, CONFIG.world.boundaryOuter);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 6 && z < 0) continue;
    if (grid.overlaps(x, z, 1.25)) continue;
    addTree(x, z, rng.chance(0.2), rng.range(1.0, 1.5));
  }

  // Rocks
  for (let i = 0; i < CONFIG.forest.rocks; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.float()) * 180;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (distToPath(x, z) < 2 || inClearing(x, z, -3)) continue;
    const s = rng.chance(0.8) ? rng.range(0.2, 0.6) : rng.range(0.7, 1.5);
    if (grid.overlaps(x, z, s)) continue;
    _e.set(0, rng.range(0, Math.PI * 2), 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, getHeight(x, z) - s * 0.15, z), _q, _s.set(s, s, s));
    put(`rock${rng.int(0, 2)}`, x, z, _m);
    if (s > 0.55) grid.insert({ type: 'circle', x, z, r: s * 0.85, kind: 'rock' });
  }

  // Fallen logs and stumps
  for (let i = 0; i < CONFIG.forest.logs * 2; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.float()) * 178;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (distToPath(x, z) < 3.5 || inClearing(x, z)) continue;
    const isLog = i % 2 === 0;
    const len = isLog ? rng.range(3, 7) : 1;
    if (grid.overlaps(x, z, isLog ? len / 2 : 0.6)) continue;
    const yaw = rng.range(0, Math.PI * 2);
    _e.set(0, yaw, isLog ? rng.range(-0.05, 0.05) : 0);
    _q.setFromEuler(_e);
    const sc = rng.range(0.8, 1.2);
    _m.compose(_p.set(x, getHeight(x, z) + (isLog ? 0.22 : -0.1), z), _q, _s.set(isLog ? len : sc, sc, sc));
    put(isLog ? 'log' : 'stump', x, z, _m);
    if (isLog) {
      const dx = Math.cos(yaw);
      const dz = -Math.sin(yaw);
      for (let k = -1; k <= 1; k++) {
        grid.insert({ type: 'circle', x: x + dx * k * len * 0.33, z: z + dz * k * len * 0.33, r: 0.42, kind: 'log' });
      }
    } else {
      grid.insert({ type: 'circle', x, z, r: 0.42 * sc, kind: 'stump' });
    }
  }

  // ---------- Build instanced meshes per chunk ----------
  const geos = {
    pineTrunk: [pine.trunk, MATERIALS.pineBark],
    pineFoliage: [pine.foliage, MATERIALS.needles],
    dead0: [deadVariants[0].geo, MATERIALS.deadBark],
    dead1: [deadVariants[1].geo, MATERIALS.deadBark],
    dead2: [deadVariants[2].geo, MATERIALS.deadBark],
    rock0: [rockVariants[0], MATERIALS.rock],
    rock1: [rockVariants[1], MATERIALS.rock],
    rock2: [rockVariants[2], MATERIALS.rock],
    log: [logGeo, MATERIALS.mossLog],
    stump: [stumpGeo, MATERIALS.mossLog],
  };
  const forestGroup = new THREE.Group();
  forestGroup.name = 'forest';
  let instanceTotal = 0;
  for (const [type, chunks] of buckets) {
    const [geo, mat] = geos[type];
    for (const matrices of chunks.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      forestGroup.add(mesh);
      instanceTotal += matrices.length;
    }
  }
  scene.add(forestGroup);

  // ---------- Glowing mushrooms (merged, static) ----------
  const shroomParts = [];
  for (let i = 0; i < CONFIG.forest.mushrooms; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.float()) * 170;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inClearing(x, z, -4) || distToPath(x, z) < 1.5) continue;
    shroomParts.push(mushroomCluster(rng).translate(x, getHeight(x, z), z));
  }
  if (shroomParts.length) scene.add(new THREE.Mesh(mergeGeometries(shroomParts), MATERIALS.shroom));

  // ---------- Effigies hanging near the trails ----------
  const effigy = effigyGeometry();
  const effParts = [];
  const trailPines = pines.filter((p) => distToPath(p.x, p.z) < 7 && Math.hypot(p.x, p.z) < 175);
  for (let i = 0; i < CONFIG.forest.effigies && trailPines.length; i++) {
    const t = trailPines[rng.int(0, trailPines.length - 1)];
    const a = rng.range(0, Math.PI * 2);
    const h = rng.range(2.1, 3.2);
    effParts.push(
      effigy
        .clone()
        .rotateY(a)
        .translate(t.x + Math.cos(a) * 0.55, getHeight(t.x, t.z) + h, t.z + Math.sin(a) * 0.55)
    );
  }
  if (effParts.length) {
    const eff = new THREE.Mesh(mergeGeometries(effParts), MATERIALS.twig);
    eff.castShadow = true;
    scene.add(eff);
  }

  // ---------- Owl roosts ----------
  const owlSpots = [];
  const owlPines = pines.filter((p) => Math.hypot(p.x, p.z) < 165);
  for (let i = 0; i < 18 && owlPines.length; i++) {
    const t = owlPines[rng.int(0, owlPines.length - 1)];
    const a = rng.range(0, Math.PI * 2);
    owlSpots.push(new THREE.Vector3(t.x + Math.cos(a) * 0.35, getHeight(t.x, t.z) + rng.range(3.6, 5.2), t.z + Math.sin(a) * 0.35));
  }

  // Keep the dead trees nearest the trails for crow flocks, spread out.
  const crowPerches = [];
  const candidates = perches.filter((p) => distToPath(p.x, p.z) < 14 && p.points.length >= 2);
  for (const c of candidates) {
    if (crowPerches.every((o) => Math.hypot(o.x - c.x, o.z - c.z) > 30)) crowPerches.push(c);
    if (crowPerches.length >= 14) break;
  }

  return { perches: crowPerches, owlSpots, instanceTotal };
}
