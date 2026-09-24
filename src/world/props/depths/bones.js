import * as THREE from 'three';
import { makeRng } from '../../../core/rng.js';
import { Kit, TAU, v3, xf, seg, sphere, cyl, box, tube, lathe, deform, fbm3 } from './kit.js';

// Bone parts: skull / long bone / rib templates plus the ossuary props.

const BONE = 'bone';
const DARK = 'black';

// ---------- templates (built once, cloned into kits) ----------

const cache = new Map();
const once = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

// Skull facing +Z, origin at its base centre, ~0.19 m long.
// lod 'full': with teeth; 'pile': plainer; 'wall': front half only (set into a wall).
function skullParts(lod = 'full') {
  return once(`skull:${lod}`, () => {
    const full = lod === 'full';
    const wall = lod === 'wall';
    const g = wall ? sphere(1, 7, 6, 0, Math.PI) : sphere(1, full ? 12 : 10, full ? 9 : 7);
    deform(g, (v) => {
      const ux = v.x;
      const uy = v.y;
      const uz = v.z;
      let x = ux * 0.066;
      let y = uy * 0.072;
      let z = uz * 0.094;
      const front = Math.max(0, uz);
      const low = Math.max(0, -uy);
      // narrow face / cheeks pinched under the cranium
      x *= 1 - 0.2 * front * (0.4 + 0.6 * low);
      // flatter face plane and a jutting upper jaw
      if (uz > 0.5) z -= 0.012 * (uz - 0.5) * (1 - low);
      if (uy < -0.25 && uz > 0.4) z += 0.01 * low;
      // brow ridge
      const brow = Math.exp(-((uy - 0.22) ** 2) / 0.01) * Math.max(0, uz - 0.6);
      z += brow * 0.01;
      // eye sockets
      for (const sx of [-1, 1]) {
        const d = Math.hypot((ux - sx * 0.4) * 1.1, (uy - 0.02) * 1.25, uz - 0.82);
        if (d < 0.4) {
          const f = 1 - d / 0.4;
          z -= 0.03 * f * f;
        }
      }
      // cheekbones
      for (const sx of [-1, 1]) {
        const d = Math.hypot(ux - sx * 0.75, uy + 0.3, uz - 0.45);
        if (d < 0.35) x += sx * 0.008 * (1 - d / 0.35);
      }
      // temples
      x *= 1 - 0.06 * Math.exp(-((uy - 0.1) ** 2) / 0.05) * Math.max(0, uz);
      y = Math.max(y, -0.056);
      v.set(x, y + 0.074, z);
    });
    const k = new Kit({ raw: true });
    k.add(BONE, g);
    // dark sockets and nose cavity
    for (const sx of [-1, 1]) {
      k.add(DARK, sphere(0.019, wall ? 4 : 6, wall ? 2 : 4), xf([sx * 0.026, 0.078, 0.064], [0, sx * 0.25, 0], [1, 0.9, 0.7]));
    }
    k.add(DARK, cyl(0, 0.012, 0.022, 3, true), xf([0, 0.046, 0.083], [Math.PI, 0, 0], [1, 1, 0.6]));
    if (full) {
      // upper teeth: a curved strip with dark gaps
      k.add(BONE, cyl(0.03, 0.03, 0.014, 8, true, 1, -1, 2), xf([0, 0.02, 0.058]));
      for (let i = 0; i < 5; i++) {
        const a = ((i + 0.5) / 5 - 0.5) * 1.6;
        k.add(DARK, box(0.0015, 0.012, 0.004), xf([Math.sin(a) * 0.0305, 0.02, 0.058 + Math.cos(a) * 0.0305], [0, a, 0]));
      }
    }
    return k.merged();
  });
}

// Add a skull to a kit with matrix m.
export function addSkull(kit, m, lod = 'full') {
  kit.addParts(skullParts(lod), m);
}

// Long bone (femur-like) along +Y from 0 to len.
function longBoneGeo(len, lod) {
  return once(`long:${len}:${lod}`, () => {
    const k = new Kit({ raw: true });
    const lite = lod === 'lite';
    const r = lite ? 0.03 : len * 0.045;
    k.add(BONE, cyl(r * 0.9, r, len * 0.84, lite ? 5 : 6, true, lite ? 1 : 2), xf([0, len * 0.5, 0], [0, lite ? Math.PI / 5 : 0, 0]));
    const knob = (rr) => sphere(rr, 5, 3);
    // proximal head + trochanter, distal condyles
    if (lite) {
      k.add(BONE, knob(r * 1.55), xf([0, len * 0.95, 0], [0, 0.4, 0], [1.25, 0.95, 1]));
      k.add(BONE, knob(r * 1.5), xf([0, len * 0.05, 0], [0, -0.3, 0], [1.35, 0.9, 1]));
    } else {
      k.add(BONE, knob(r * 1.7), xf([r * 0.6, len * 0.95, 0]));
      k.add(BONE, knob(r * 1.3), xf([-r * 0.8, len * 0.9, 0]));
      k.add(BONE, knob(r * 1.5), xf([r * 0.9, len * 0.06, 0], [0, 0, 0], [1, 1.1, 1.2]));
      k.add(BONE, knob(r * 1.5), xf([-r * 0.9, len * 0.06, 0], [0, 0, 0], [1, 1.1, 1.2]));
    }
    return k.merged()[0].geo;
  });
}

export function addLongBone(kit, a, b, lod = 'full') {
  const { m, len } = seg(a, b);
  const L = Math.round(len * 20) / 20;
  const shift = new THREE.Matrix4().makeTranslation(0, -L / 2, 0);
  kit.add(BONE, longBoneGeo(L, lod).clone(), m.multiply(shift));
}

// Curved rib from the origin along an arc in the XY plane.
function ribGeo(len) {
  return once(`rib:${len}`, () => {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const a = t * 1.9;
      pts.push(v3(Math.sin(a) * len * 0.5, (1 - Math.cos(a)) * len * 0.3, 0));
    }
    return tube(pts, { segs: 10, radial: 4, radius: (t) => 0.007 * (1 - 0.4 * t), sy: 2.2, sx: 0.8 });
  });
}

export function addRib(kit, m, len = 0.28) {
  kit.add(BONE, ribGeo(len).clone(), m);
}

// ---------- props ----------

// Ossuary wall panel: 2 m wide x 2.4 m tall, origin at the wall base, facing +Z.
// Bands of stacked long bones between rows of skulls, over dark cavities.
export function skullWall(opts = {}) {
  const rng = makeRng(opts.seed ?? 11);
  const W = opts.width ?? 2;
  const H = opts.height ?? 2.4;
  const kit = new Kit();
  kit.add(DARK, box(W, H, 0.1), xf([0, H / 2, 0.05]));
  const skullRows = (opts.skullRows ?? [0.42, 1.18, 1.94]).filter((y) => y < H - 0.2);
  const bands = [];
  let y0 = 0;
  for (const sy of skullRows) {
    bands.push([y0, sy - 0.01]);
    y0 = sy + 0.21;
  }
  bands.push([y0, H]);
  for (const [a, b] of bands) {
    if (b - a < 0.06) continue;
    const rows = Math.max(1, Math.round((b - a) / 0.088));
    for (let r = 0; r < rows; r++) {
      const y = a + (r + 0.5) * ((b - a) / rows);
      const len0 = 0.66;
      let x = -W / 2 - (r % 2 ? len0 * 0.5 : 0) + rng.range(-0.05, 0.05);
      while (x < W / 2 - 0.12) {
        const len = rng.range(0.6, 0.72);
        const x0 = Math.max(-W / 2 + 0.03, x);
        const x1 = Math.min(W / 2 - 0.03, x + len);
        if (x1 - x0 > 0.2) {
          const dy = rng.range(-0.008, 0.008);
          const flip = rng.chance(0.5);
          addLongBone(kit, [flip ? x1 : x0, y + dy, 0.13], [flip ? x0 : x1, y - dy, 0.13], 'lite');
        }
        x += len + 0.01;
      }
    }
  }
  for (const sy of skullRows) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * (W / n) + rng.range(-0.01, 0.01);
      if (rng.chance(0.06)) continue;
      const s = rng.range(1.12, 1.22);
      addSkull(kit, xf([x, sy, 0.08 + rng.range(0, 0.02)], [rng.range(-0.12, 0.08), rng.range(-0.2, 0.2), rng.range(-0.08, 0.08)], s), 'wall');
    }
  }
  const obj = kit.build();
  obj.userData.collider = [{ min: [-W / 2, 0, 0], max: [W / 2, H, 0.22] }];
  obj.userData.mount = 'wall';
  return obj;
}

// Heap of skulls with a few long bones; walk-through.
export function skullPile(opts = {}) {
  const rng = makeRng(opts.seed ?? 5);
  const kit = new Kit();
  const layers = [
    { n: 6, r: 0.28, y: 0 },
    { n: 3, r: 0.13, y: 0.12 },
    { n: 1, r: 0, y: 0.23 },
  ];
  // earth mound under the heap
  const mound = sphere(0.45, 10, 5, 0, TAU, 0, Math.PI / 2);
  deform(mound, (v) => {
    v.y *= 0.35;
    v.addScaledVector(v.clone().setY(0).normalize(), fbm3(v.x * 6, 0, v.z * 6, 3) * 0.08);
  });
  kit.add('dirt', mound);
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const a = (i / L.n) * TAU + rng.range(-0.2, 0.2);
      const x = Math.cos(a) * L.r;
      const z = Math.sin(a) * L.r;
      const yaw = rng.range(-0.9, 0.9) + (L.n > 1 ? Math.atan2(x, z) * 0.6 : 0);
      addSkull(kit, xf([x, L.y + 0.1 - L.r * 0.18, z], [rng.range(-0.35, 0.2), yaw, rng.range(-0.3, 0.3)], rng.range(0.9, 1.05)), L.n === 1 ? 'full' : 'pile');
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, TAU);
    const r = rng.range(0.25, 0.45);
    const p = [Math.cos(a) * r, 0.03, Math.sin(a) * r];
    const d = rng.range(0, TAU);
    addLongBone(kit, p, [p[0] + Math.cos(d) * 0.4, 0.05 + rng.range(0, 0.1), p[2] + Math.sin(d) * 0.4]);
  }
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// Scattered pile of mixed bones; walk-through.
export function bonesPile(opts = {}) {
  const rng = makeRng(opts.seed ?? 9);
  const kit = new Kit();
  const R = opts.radius ?? 0.6;
  const n = opts.count ?? 14;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const r = Math.sqrt(rng()) * R;
    const len = rng.range(0.25, 0.45);
    const d = rng.range(0, TAU);
    const h = 0.02 + (1 - r / R) * rng.range(0, 0.12);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const tilt = rng.range(-0.08, 0.08);
    addLongBone(kit, [cx - Math.cos(d) * len / 2, h + tilt, cz - Math.sin(d) * len / 2], [cx + Math.cos(d) * len / 2, h - tilt, cz + Math.sin(d) * len / 2]);
  }
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, TAU);
    const r = rng.range(0, R * 0.8);
    addRib(kit, xf([Math.cos(a) * r, 0.01, Math.sin(a) * r], [Math.PI / 2 + rng.range(-0.3, 0.3), rng.range(0, TAU), 0], rng.range(0.8, 1.2)));
  }
  const skulls = opts.skulls ?? 2;
  for (let i = 0; i < skulls; i++) {
    const a = rng.range(0, TAU);
    const r = rng.range(0, R * 0.6);
    addSkull(kit, xf([Math.cos(a) * r, rng.range(0, 0.04), Math.sin(a) * r], [rng.range(-0.4, 0.2), rng.range(0, TAU), rng.range(-0.5, 0.5)]), i ? 'pile' : 'full');
  }
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// Huge rib arch; feet at x = +-span/2 on the floor.
export function rib(opts = {}) {
  const span = opts.span ?? 5;
  const height = opts.height ?? 5;
  const rng = makeRng(opts.seed ?? 3);
  const kit = new Kit();
  const pts = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = t * Math.PI;
    // pointed arch: slightly gothic, leaning sideways a touch
    const x = -Math.cos(a) * span / 2;
    const y = Math.pow(Math.sin(a), 0.8) * height;
    const z = Math.sin(a) * 0.35 * (rng() * 0.3 + 0.85);
    pts.push(v3(x, y, z));
  }
  const thick = Math.min(span, height) * 0.045;
  const g = tube(pts, {
    segs: 36,
    radial: 10,
    radius: (t) => thick * (1.25 - 0.35 * Math.sin(t * Math.PI) + 0.35 * Math.pow(Math.abs(t - 0.5) * 2, 6)),
    sx: 1,
    sy: 1.6,
  });
  deform(g, (v) => {
    v.x += fbm3(v.x * 3, v.y * 3, v.z * 3, 2, 4) * thick * 0.25;
    v.z += fbm3(v.x * 3, v.y * 3 + 9, v.z * 3, 2, 5) * thick * 0.25;
  });
  kit.add(BONE, g);
  // fleshy mounds where the feet grow out of the floor
  for (const sx of [-1, 1]) {
    const m = sphere(thick * 2.6, 10, 6, 0, TAU, 0, Math.PI / 2);
    deform(m, (v) => {
      v.y *= 0.55;
      v.multiplyScalar(1 + fbm3(v.x * 4, v.y * 4, v.z * 4, 3, sx + 7) * 0.5);
    });
    kit.add('fleshDark', m, xf([sx * span / 2, 0, 0]));
  }
  const obj = kit.build();
  const f = thick * 1.8;
  obj.userData.collider = [
    { min: [-span / 2 - f, 0, -f], max: [-span / 2 + f, Math.min(height, 2.4), f + 0.1] },
    { min: [span / 2 - f, 0, -f], max: [span / 2 + f, Math.min(height, 2.4), f + 0.1] },
  ];
  return obj;
}

// Sharp bone spike (with a smaller companion) jutting from the floor.
export function boneSpike(opts = {}) {
  const rng = makeRng(opts.seed ?? 21);
  const h = opts.height ?? 1.2;
  const kit = new Kit();
  const spike = (base, height, r, lean, yaw) => {
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push(v3(base[0] + Math.sin(yaw) * lean * t * t * height, t * height, base[2] + Math.cos(yaw) * lean * t * t * height));
    }
    const g = tube(pts, { segs: 14, radial: 7, radius: (t) => r * Math.pow(1 - t, 1.3) * (1 + 0.15 * Math.sin(t * 20)) + 0.002 });
    deform(g, (v) => v.addScaledVector(v3(1, 0, 1), fbm3(v.x * 8, v.y * 8, v.z * 8, 2, 3) * r * 0.3));
    kit.add(BONE, g);
    const knob = sphere(r * 1.35, 8, 5, 0, TAU, 0, Math.PI / 2);
    deform(knob, (v) => v.multiplyScalar(1 + fbm3(v.x * 9, v.y * 9, v.z * 9, 2, 9) * 0.6));
    kit.add(BONE, knob, xf([base[0], 0, base[2]], [0, 0, 0], [1, 0.8, 1]));
  };
  spike([0, 0, 0], h, 0.09, rng.range(0.1, 0.25), rng.range(0, TAU));
  spike([rng.range(0.12, 0.18), 0, rng.range(-0.1, 0.1)], h * 0.55, 0.06, 0.35, rng.range(0, TAU));
  if (rng.chance(0.6)) spike([rng.range(-0.18, -0.1), 0, rng.range(0.02, 0.1)], h * 0.35, 0.045, 0.5, rng.range(0, TAU));
  // blood-stained gum of flesh at the base
  const gum = sphere(0.22, 10, 5, 0, TAU, 0, Math.PI / 2);
  deform(gum, (v) => {
    v.y *= 0.35;
    v.multiplyScalar(1 + fbm3(v.x * 7, v.y * 7, v.z * 7, 3, 2) * 0.5);
  });
  kit.add('fleshDark', gum);
  const obj = kit.build();
  obj.userData.collider = [{ min: [-0.2, 0, -0.2], max: [0.25, h * 0.8, 0.2] }];
  return obj;
}

// Big curved tooth / tusk rising out of a gum mound.
export function tooth(opts = {}) {
  const h = opts.height ?? 1.4;
  const rng = makeRng(opts.seed ?? 8);
  const kit = new Kit();
  const pts = [];
  const curl = opts.curl ?? 0.45;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = t * curl * Math.PI;
    pts.push(v3(0, Math.sin(a) / (curl * Math.PI) * h, (1 - Math.cos(a)) / (curl * Math.PI) * h));
  }
  const r0 = h * 0.12;
  const g = tube(pts, { segs: 20, radial: 10, radius: (t) => r0 * Math.pow(1 - t, 0.9) + 0.003, sx: 1, sy: 0.8 });
  deform(g, (v) => v.addScaledVector(v3(1, 0, 1), fbm3(v.x * 5, v.y * 5, v.z * 5, 2, rng.int(0, 99)) * r0 * 0.12));
  kit.add(BONE, g);
  // ridged root collar
  kit.add('bone', lathe([[r0 * 1.25, 0], [r0 * 1.2, r0 * 0.4], [r0 * 1.02, r0 * 0.9]], 12));
  const gum = sphere(r0 * 2.6, 12, 6, 0, TAU, 0, Math.PI / 2);
  deform(gum, (v) => {
    v.y *= 0.4;
    v.multiplyScalar(1 + fbm3(v.x * 4, v.y * 4, v.z * 4, 3, 13) * 0.4);
  });
  kit.add('flesh', gum);
  const obj = kit.build();
  obj.userData.collider = [{ min: [-r0 * 1.5, 0, -r0 * 1.5], max: [r0 * 1.5, h * 0.7, h * 0.35] }];
  return obj;
}

