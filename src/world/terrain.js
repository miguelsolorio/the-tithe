import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { CONFIG, LANDMARKS, PATHS } from '../config.js';
import { RNG } from '../core/rng.js';
import { lerp, smoothstep } from '../core/utils.js';
import { groundTexture } from './textures.js';

const perlin = new ImprovedNoise();

function rawHeight(x, z) {
  return (
    perlin.noise(x * 0.011, 0.31, z * 0.011) * 7.5 +
    perlin.noise(x * 0.034, 1.73, z * 0.034) * 1.9 +
    perlin.noise(x * 0.14, 4.21, z * 0.14) * 0.28
  );
}

const zones = Object.values(LANDMARKS).map((l) => ({ ...l, base: rawHeight(l.x, l.z) }));

// ---------- Trails ----------
// Each trail is a wobbly polyline between two landmarks.
const pathRng = new RNG(CONFIG.seed + 7);
export const pathSegments = [];
export const pathSamples = []; // evenly spaced points along trails, for spawning

for (const [a, b] of PATHS) {
  const A = LANDMARKS[a];
  const B = LANDMARKS[b];
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  const n = Math.max(2, Math.round(len / 14));
  const nx = -(B.z - A.z) / len;
  const nz = (B.x - A.x) / len;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wobble = i === 0 || i === n ? 0 : pathRng.range(-5, 5) * Math.sin(t * Math.PI);
    pts.push({ x: lerp(A.x, B.x, t) + nx * wobble, z: lerp(A.z, B.z, t) + nz * wobble });
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const segLen = Math.hypot(q.x - p.x, q.z - p.z);
    pathSegments.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, len: segLen });
    for (let s = 0; s < segLen; s += 3) {
      const t = s / segLen;
      pathSamples.push({
        x: lerp(p.x, q.x, t),
        z: lerp(p.z, q.z, t),
        dx: (q.x - p.x) / segLen,
        dz: (q.z - p.z) / segLen,
      });
    }
  }
}

export function distToPath(x, z) {
  let best = Infinity;
  for (const s of pathSegments) {
    const vx = s.bx - s.ax;
    const vz = s.bz - s.az;
    let t = ((x - s.ax) * vx + (z - s.az) * vz) / (s.len * s.len);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (s.ax + vx * t);
    const dz = z - (s.az + vz * t);
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ---------- Height ----------
export function getHeight(x, z) {
  let h = rawHeight(x, z);
  for (const zn of zones) {
    const dx = x - zn.x;
    const dz = z - zn.z;
    const reach = zn.r * 1.7;
    if (dx * dx + dz * dz < reach * reach) {
      const d = Math.sqrt(dx * dx + dz * dz);
      h = lerp(h, zn.base, 1 - smoothstep(zn.r * 0.7, reach, d));
    }
  }
  // The land rises into hills past the boundary, which boxes the forest in.
  const rd = Math.hypot(x, z);
  if (rd > 176) h += (rd - 176) * 0.22;
  return h;
}

// ---------- Ground mesh ----------
export function buildTerrain(scene) {
  const { size } = CONFIG.world;
  const seg = CONFIG.terrain.segments;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const moss = new THREE.Color(0x3b4a33);
  const dirt = new THREE.Color(0x4d3f31);
  const trail = new THREE.Color(0x6b5b46);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const pd = distToPath(x, z);
    pos.setY(i, getHeight(x, z));

    const n = perlin.noise(x * 0.06, 9.1, z * 0.06) * 0.5 + 0.5;
    c.copy(moss).lerp(dirt, smoothstep(0.35, 0.75, n));
    c.lerp(trail, 1 - smoothstep(0.8, 2.6, pd));
    const shade = 0.8 + perlin.noise(x * 0.3, 2.2, z * 0.3) * 0.35;
    colors[i * 3] = c.r * shade;
    colors[i * 3 + 1] = c.g * shade;
    colors[i * 3 + 2] = c.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const tex = groundTexture();
  tex.repeat.set(size / 5, size / 5);
  const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}
