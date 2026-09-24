import * as THREE from 'three';
import { fbm2, makeRng } from '../../core/rng.js';
import { getMaterial, solid } from '../../world/materials.js';
import { Kit, TAU, v3, xf, tube, sphere, lathe, deform, fbm3, cyl } from '../../world/props/depths/kit.js';
import { addSkull } from '../../world/props/depths/bones.js';

// Custom organic geometry for the flesh caves: ramp floors, mounds,
// translucent membranes, the gallery spine and the dead hunter.

// Sloped organic floor over a ramp rect: height yA at z0 -> yB at z1.
export function rampSurface(L, x0, z0, x1, z1, yA, yB) {
  const w = x1 - x0 + 0.4;
  const d = z1 - z0;
  const g = new THREE.PlaneGeometry(w, d, Math.ceil(w / 0.33), Math.ceil(d / 0.33));
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k) + cx;
    const z = p.getZ(k) + cz;
    const t = (z - z0) / d;
    p.setXYZ(k, x, yA + (yB - yA) * t + (fbm2(x * 0.7, z * 0.7, 3, 3) - 0.5) * 0.1 - 0.01, z);
  }
  g.computeVertexNormals();
  L.batcher.add(g, getMaterial('fleshDark'));
}

// Lumpy mound (island, growth) with its base at y0 and top at y0 + h.
export function mound(L, x, z, y0, rx, rz, h, mat = 'fleshDark', seed = 1) {
  const g = sphere(1, 16, 7, 0, TAU, 0, Math.PI / 2);
  deform(g, (v) => {
    const n = fbm3(v.x * 2.2 + seed, v.y * 2.2, v.z * 2.2, 3, seed);
    v.set(v.x * rx * (1 + n * 0.5), v.y * h * (1 + n * 0.6), v.z * rz * (1 + n * 0.5));
  });
  g.translate(x, y0, z);
  L.batcher.add(g, getMaterial(mat), { worldUV: true });
}

// Blob of flesh stuck on a surface (growth over bone or stone).
export function blob(L, pos, r, squash = [1, 0.7, 0.6], mat = 'flesh', seed = 3) {
  const g = sphere(1, 12, 9);
  deform(g, (v) => {
    const n = fbm3(v.x * 2.5 + seed, v.y * 2.5, v.z * 2.5, 3, seed);
    v.set(v.x * r * squash[0] * (1 + n * 0.7), v.y * r * squash[1] * (1 + n * 0.7), v.z * r * squash[2] * (1 + n * 0.7));
  });
  g.translate(pos[0], pos[1], pos[2]);
  L.batcher.add(g, getMaterial(mat));
}

// ---------- Membranes ----------

let memMat = null;
export function membraneMaterial() {
  if (!memMat) {
    memMat = new THREE.MeshStandardMaterial({
      color: 0xa0302a,
      roughness: 0.25,
      metalness: 0,
      transparent: true,
      opacity: 0.58,
      emissive: 0x4a0707,
      emissiveIntensity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    memMat.userData.tile = 1;
    memMat.name = 'cavesMembrane';
  }
  return memMat;
}

// Membrane sheet in local XY (x from -w/2..w/2, y from 0..h), billowing
// along Z, with ragged top/bottom edges. Returns { sheet, veins } geometries.
export function membraneGeo(w, h, seed = 5, billow = 0.18) {
  const g = new THREE.PlaneGeometry(w, h, Math.ceil(w / 0.2), Math.ceil(h / 0.2));
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k);
    const y = p.getY(k);
    const ex = 1 - Math.abs((x / w) * 2) ** 3;
    const ey = Math.sin((y / h) * Math.PI);
    const n = fbm3(x * 1.3 + seed, y * 1.3, seed, 3, seed);
    p.setZ(k, (n * 1.2 + 0.25) * billow * 2 * ex * (0.4 + 0.6 * ey));
  }
  g.computeVertexNormals();
  const rng = makeRng(seed);
  const veins = [];
  for (let i = 0; i < 5; i++) {
    const x0 = rng.range(-w / 2, w / 2);
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const y = (k / 6) * h * rng.range(0.7, 1);
      const x = x0 + Math.sin(k * 1.3 + i) * 0.25;
      const ex = 1 - Math.abs(Math.max(-1, Math.min(1, (x / w) * 2))) ** 3;
      const ey = Math.sin((y / h) * Math.PI);
      const n = fbm3(x * 1.3 + seed, y * 1.3, seed, 3, seed);
      pts.push(v3(x, y, (n * 1.2 + 0.25) * billow * 2 * ex * (0.4 + 0.6 * ey) + 0.012));
    }
    veins.push(tube(pts, { segs: 18, radial: 4, radius: (t) => 0.02 * (1 - t * 0.7) + 0.004 }));
  }
  return { sheet: g, veins };
}

// Static membrane curtain: centre (x, z), bottom y0, facing rotY.
export function membrane(L, x, z, y0, w, h, rotY, seed = 5) {
  const { sheet, veins } = membraneGeo(w, h, seed);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1));
  sheet.applyMatrix4(m);
  L.batcher.add(sheet, membraneMaterial(), { worldUV: false, cast: false });
  for (const v of veins) {
    v.applyMatrix4(m);
    L.batcher.add(v, getMaterial('fleshDark'), { worldUV: true, cast: false });
  }
}

// ---------- Rib gallery spine ----------

// Vertebrae along a list of points (the spine runs along the ceiling ridge).
export function spine(L, pts) {
  const kit = new Kit();
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i];
    const s = 0.9 + 0.2 * Math.sin(i * 1.7);
    // Vertebral body: a squat bony drum along z.
    kit.add('bone', cyl(0.15 * s, 0.17 * s, 0.2, 10), xf([x, y, z], [Math.PI / 2, 0, 0]));
    // Spinous process up into the ceiling, transverse processes to the sides.
    kit.add('bone', tube([v3(x, y + 0.1, z), v3(x, y + 0.34, z + 0.1), v3(x, y + 0.5, z + 0.18)], { segs: 5, radial: 5, radius: (t) => 0.05 * (1 - t) + 0.01 }));
    for (const sx of [-1, 1]) {
      kit.add('bone', tube([v3(x + sx * 0.1, y + 0.02, z), v3(x + sx * 0.3, y + 0.08, z + 0.03), v3(x + sx * 0.42, y + 0.02, z + 0.05)], { segs: 5, radial: 4, radius: (t) => 0.035 * (1 - t * 0.6) }));
    }
    // Gristle between vertebrae.
    if (i + 1 < pts.length) {
      const [x2, y2, z2] = pts[i + 1];
      kit.add('fleshDark', tube([v3(x, y, z), v3((x + x2) / 2, (y + y2) / 2 - 0.02, (z + z2) / 2), v3(x2, y2, z2)], { segs: 6, radial: 6, radius: 0.1 }));
    }
  }
  const obj = kit.build();
  L.mesh(obj, { static: true });
}

// ---------- The dead hunter ----------

// A cult hunter slumped against the wall (back at local z = 0, facing +Z),
// the flesh wall grown over his right side and legs. Returns a Group.
export function hunterCorpse(seed = 17) {
  const kit = new Kit();
  const rng = makeRng(seed);
  const coat = solid(0x2b241c, { roughness: 0.92 });
  const leather = solid(0x1c140e, { roughness: 0.7 });
  const shell = solid(0x6a1410, { roughness: 0.5 });
  const brass = solid(0x8a6a2a, { roughness: 0.35, metalness: 0.8 });
  // Torso leaning back, slumped to his left.
  kit.add(coat, tube([v3(0, 0.2, 0.2), v3(0.02, 0.45, 0.14), v3(0.05, 0.72, 0.08)], { segs: 8, radial: 12, radius: (t) => 0.2 - 0.03 * t, sx: 1.25 }));
  kit.add(coat, sphere(0.2, 10, 6, 0, TAU, 0, Math.PI / 2), xf([0.04, 0.72, 0.08], [0, 0, -0.15], [1.3, 0.5, 0.9]));
  // Coat skirt pooled on the floor.
  const skirt = lathe([[0.22, 0.28], [0.3, 0.14], [0.38, 0.02], [0.36, 0.0]], 14);
  deform(skirt, (v) => {
    v.x *= 1.1;
    v.z = v.z * 0.8 + 0.22;
    v.y += fbm3(v.x * 6, 0, v.z * 6, 2, 3) * 0.05;
  });
  kit.add(coat, skirt);
  // Skull head drooping forward onto his chest, flesh creeping over it.
  addSkull(kit, xf([0.1, 0.84, 0.2], [0.75, 0.25, -0.35], 1.15), 'full');
  kit.add('fleshDark', sphere(0.08, 8, 6), xf([0.02, 0.93, 0.13], [0, 0, 0], [1.3, 0.8, 1]));
  // Hat fallen beside him.
  const hat = lathe([[0.001, 0.12], [0.08, 0.115], [0.1, 0.06], [0.11, 0.02], [0.2, 0.012], [0.21, 0]], 16);
  kit.add(leather, hat, xf([0.55, 0, 0.5], [0.15, 0.4, 0.1]));
  // Bandolier across the chest with shell loops.
  const band = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    const a = -0.6 + t * 1.2;
    band.push(v3(Math.sin(a) * 0.24, 0.3 + t * 0.4, 0.17 + Math.cos(a) * 0.08));
  }
  kit.add(leather, tube(band, { segs: 16, radial: 4, radius: 0.022, sy: 0.4 }));
  for (let k = 1; k < 8; k += 1.2) {
    const p = band[Math.floor(k)];
    kit.add(shell, cyl(0.013, 0.013, 0.07, 6), xf([p.x, p.y, p.z + 0.02], [0, 0, 0.9]));
    kit.add(brass, cyl(0.014, 0.014, 0.012, 6), xf([p.x - 0.03, p.y - 0.022, p.z + 0.02], [0, 0, 0.9]));
  }
  // Left arm resting on the lap (bone hand), right arm swallowed by the wall.
  kit.add(coat, tube([v3(0.24, 0.7, 0.08), v3(0.3, 0.42, 0.24), v3(0.14, 0.3, 0.44)], { segs: 8, radial: 7, radius: (t) => 0.065 - 0.015 * t }));
  for (let f = 0; f < 4; f++) kit.add('bone', tube([v3(0.12, 0.3, 0.45), v3(0.08 + f * 0.02, 0.29, 0.52), v3(0.06 + f * 0.025, 0.25, 0.55)], { segs: 4, radial: 3, radius: 0.009 }));
  kit.add(coat, tube([v3(-0.24, 0.7, 0.08), v3(-0.42, 0.9, 0.02), v3(-0.5, 1.1, -0.1)], { segs: 8, radial: 7, radius: 0.065 }));
  // Legs out along the floor, boots.
  for (const sx of [-1, 1]) {
    kit.add(coat, tube([v3(sx * 0.11, 0.16, 0.2), v3(sx * 0.14, 0.18, 0.55), v3(sx * 0.16, 0.12, 0.92)], { segs: 8, radial: 8, radius: (t) => 0.085 - 0.02 * t }));
    kit.add(leather, sphere(0.07, 8, 6), xf([sx * 0.17, 0.07, 1.0], [0, sx * 0.15, 0], [1, 0.9, 1.8]));
  }
  // The wall reclaiming him: mounds over his right side and legs, veins onto his chest.
  const growth = (p, r, sq) => {
    const g = sphere(1, 12, 8);
    const sd = rng.int(0, 99);
    deform(g, (v) => {
      const n = fbm3(v.x * 2.4, v.y * 2.4, v.z * 2.4, 3, sd);
      v.set(v.x * r * sq[0] * (1 + n * 0.7), v.y * r * sq[1] * (1 + n * 0.7), v.z * r * sq[2] * (1 + n * 0.7));
    });
    kit.add('flesh', g, xf(p));
  };
  growth([-0.42, 0.95, -0.05], 0.32, [1, 1.2, 0.7]);
  growth([-0.3, 0.35, 0.05], 0.3, [1, 0.9, 0.8]);
  growth([-0.16, 0.08, 0.7], 0.26, [0.8, 0.45, 1.3]);
  growth([0.0, 1.25, -0.02], 0.28, [1.4, 0.8, 0.4]);
  growth([0.0, 0.75, -0.3], 0.5, [1.3, 1.5, 0.7]);
  for (let i = 0; i < 6; i++) {
    const a = rng.range(-1, 1);
    const from = v3(rng.range(-0.6, 0.4), rng.range(0.9, 1.6), -0.02);
    const to = v3(Math.sin(a) * 0.18, rng.range(0.35, 0.7), 0.2);
    kit.add('fleshDark', tube([from, from.clone().lerp(to, 0.5).add(v3(0, 0.05, 0.12)), to], { segs: 10, radial: 5, radius: (t) => 0.03 * (1 - t * 0.6) }));
  }
  const g = kit.build();
  g.userData.shotgunAt = [0.16, 0.33, 0.44];
  return g;
}

// Small torn strip of cloth (snagged on a tooth near the sphincter).
export function clothScrap() {
  const g = new THREE.PlaneGeometry(0.16, 0.34, 3, 6);
  deform(g, (v) => {
    v.z += Math.sin(v.y * 9) * 0.02 + v.x * v.x * 1.5;
    v.x *= 1 - (v.y + 0.17) * 0.8;
  });
  const m = new THREE.Mesh(g, solid(0x5a1418, { roughness: 0.9, side: THREE.DoubleSide }));
  return m;
}
