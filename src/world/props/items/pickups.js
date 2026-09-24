import * as THREE from 'three';
import { makeRng } from '../../../core/rng.js';
import { solid, getDecalMaterial } from '../../materials.js';
import { Kit, TAU, v3, xf, box, cyl, torus, tube, extrude, roundBox, deform, fbm3 } from '../depths/kit.js';
import { BRASS } from './ammo.js';

// Key items and pickups. Lying flat, origin at the bottom centre.

const CASE_MAUVE = () => solid(0x4a3a44, { roughness: 0.7 });
const GLASS_BLACK = () => solid(0x07080a, { roughness: 0.08, metalness: 0.3 });
const INK = () => solid(0x1c2433, { roughness: 0.6 });
const CARD = () => solid(0x5b7394, { roughness: 0.5, emissive: 0x5b7394, emissiveIntensity: 0.6 });
const PIN = () => solid(0xd83a2a, { roughness: 0.5, emissive: 0xd83a2a, emissiveIntensity: 0.9 });
const CRACK = () => solid(0x0a0c10, { roughness: 0.3 });
const PORCELAIN = () => solid(0xe4ddcf, { roughness: 0.3 });
const PAINT_RED = () => solid(0x6e1a14, { roughness: 0.6, metalness: 0.3 });
const GAUZE = () => solid(0xd6cfbf, { roughness: 0.95 });
const PEN = () => solid(0x2a2020, { roughness: 0.85 });
const DRIED = () => solid(0x4a0a0a, { roughness: 0.6 });

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const FLAT = [-Math.PI / 2, 0, 0];

// 7-segment digit on the screen plane (x, z), segments as thin boxes.
function digit(kit, m, n, x, z, w, h, th, y) {
  const on = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'][n];
  const seg = {
    a: [0, -h / 2, true], g: [0, 0, true], d: [0, h / 2, true],
    f: [-w / 2, -h / 4, false], b: [w / 2, -h / 4, false], e: [-w / 2, h / 4, false], c: [w / 2, h / 4, false],
  };
  for (const ch of on) {
    const [dx, dz, horiz] = seg[ch];
    kit.add(m, horiz ? box(w, 0.0002, th) : box(th, 0.0002, h / 2), xf([x + dx, y, z + dz]));
  }
}

// The sister's smartphone, face up, cracked screen still glowing.
export function phone() {
  const kit = new Kit();
  const W = 0.074;
  const L = 0.152;
  const T = 0.0086;
  kit.add(CASE_MAUVE(), extrude(roundedRect(W + 0.003, L + 0.003, 0.011), T - 0.002, 0.001, 2, 4), xf([0, 0.001, 0], FLAT));
  kit.add(GLASS_BLACK(), extrude(roundedRect(W - 0.001, L - 0.001, 0.009), 0.0004, 0, 1, 4), xf([0, T - 0.0002, 0], FLAT));
  const sw = W - 0.007;
  const sl = L - 0.014;
  const screenY = T + 0.0003;
  kit.add('phoneScreen', new THREE.ShapeGeometry(roundedRect(sw, sl, 0.006), 4), xf([0, screenY, 0], FLAT));
  const y = screenY + 0.0002;
  // lock screen: status bar, clock 3:17, date line, ping notification, dock
  kit.add(INK(), box(0.012, 0.0002, 0.0018), xf([-0.024, y, -0.064]));
  kit.add(INK(), box(0.009, 0.0002, 0.0018), xf([0.025, y, -0.064]));
  const dz = -0.042;
  digit(kit, INK(), 3, -0.021, dz, 0.01, 0.018, 0.0022, y);
  kit.add(INK(), box(0.0024, 0.0002, 0.0024), xf([-0.0115, y, dz - 0.004]));
  kit.add(INK(), box(0.0024, 0.0002, 0.0024), xf([-0.0115, y, dz + 0.004]));
  digit(kit, INK(), 1, -0.001, dz, 0.01, 0.018, 0.0022, y);
  digit(kit, INK(), 7, 0.017, dz, 0.01, 0.018, 0.0022, y);
  kit.add(INK(), box(0.03, 0.0002, 0.0016), xf([0, y, -0.026]));
  kit.add(CARD(), extrude(roundedRect(0.058, 0.02, 0.004), 0.0002, 0, 1, 3), xf([0, y, 0.012], FLAT));
  kit.add(PIN(), cyl(0.0032, 0.0032, 0.0003, 10), xf([-0.022, y + 0.0003, 0.011]));
  kit.add(PIN(), cyl(0, 0.0022, 0.0035, 4), xf([-0.022, y + 0.0003, 0.0146], [Math.PI / 2, 0, 0], [1, 1, 0.1]));
  for (let i = 0; i < 2; i++) kit.add(INK(), box(0.03 - i * 0.01, 0.0002, 0.0014), xf([-0.001 - i * 0.005, y + 0.0003, 0.009 + i * 0.0045]));
  for (let i = 0; i < 4; i++) kit.add(CARD(), box(0.009, 0.0002, 0.009), xf([-0.021 + i * 0.014, y, 0.058]));
  // cracks radiating from an impact in the lower-left
  const rng = makeRng(7);
  const imp = v3(-0.02, 0, 0.045);
  const inside = (p) => Math.abs(p.x) < sw / 2 - 0.001 && Math.abs(p.z) < sl / 2 - 0.001;
  const line = (a, b, w = 0.0005) => {
    const len = a.distanceTo(b);
    kit.add(CRACK(), box(w, 0.0002, len), xf([(a.x + b.x) / 2, y + 0.0004, (a.z + b.z) / 2], [0, Math.atan2(b.x - a.x, b.z - a.z), 0]));
  };
  const rays = [];
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * TAU + rng.range(-0.2, 0.2);
    let p = imp.clone();
    const pts = [p];
    const steps = rng.int(2, 4);
    for (let s = 0; s < steps; s++) {
      const q = p.clone().add(v3(Math.sin(ang + rng.range(-0.3, 0.3)) * 0.018, 0, Math.cos(ang + rng.range(-0.3, 0.3)) * 0.018));
      if (!inside(q)) break;
      line(p, q);
      p = q;
      pts.push(p);
    }
    rays.push(pts);
  }
  for (let i = 0; i < rays.length; i++) {
    const a = rays[i][1];
    const b = rays[(i + 1) % rays.length][1];
    if (a && b && rng.chance(0.7)) line(a, b, 0.0004);
  }
  kit.add(CRACK(), cyl(0.003, 0.003, 0.0002, 8), xf([imp.x, y + 0.0004, imp.z]));
  kit.add(GLASS_BLACK(), cyl(0.0022, 0.0022, 0.0003, 10), xf([0, y, -sl / 2 - 0.0035]));
  // camera bump on the back
  kit.add(GLASS_BLACK(), roundBox(0.022, 0.002, 0.03, 0.4, 8, 5), xf([-0.018, 0.0, -0.05]));
  const obj = kit.build();
  obj.userData.collider = 'none';
  obj.userData.lights = [{ offset: [0, 0.05, 0], color: 0xa8ccff, intensity: 0.8, distance: 2.5, flicker: 0, kind: 'screen' }];
  return obj;
}

// Old porcelain cartridge fuse with brass ferrules and blade contacts (~10 cm).
export function fuse() {
  const kit = new Kit();
  const R = 0.0115;
  const rx = [0, 0, Math.PI / 2];
  kit.add(PORCELAIN(), cyl(R, R, 0.066, 16), xf([0, R + 0.0008, 0], rx));
  kit.add('paper', cyl(R + 0.0004, R + 0.0004, 0.028, 16, true), xf([0, R + 0.0008, 0], rx));
  kit.add(PAINT_RED(), cyl(R + 0.0006, R + 0.0006, 0.004, 16, true), xf([0.008, R + 0.0008, 0], rx));
  for (const sx of [-1, 1]) {
    kit.add(BRASS(), cyl(R + 0.0008, R + 0.0008, 0.016, 16), xf([sx * 0.037, R + 0.0008, 0], rx));
    kit.add(BRASS(), torus(R + 0.0008, 0.0007, 4, 16), xf([sx * 0.0295, R + 0.0008, 0], [0, Math.PI / 2, 0]));
    kit.add(BRASS(), box(0.013, 0.0022, 0.009), xf([sx * 0.0505, R + 0.0008, 0]));
  }
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// Rusty hex crowbar (~0.75 m) lying flat: claw hook at +X, chisel at -X.
export function crowbar() {
  const kit = new Kit();
  const r = 0.0105;
  const pts = [v3(-0.37, 0, 0.012), v3(-0.34, 0, 0.004), v3(-0.3, 0, 0), v3(0.1, 0, 0), v3(0.28, 0, 0)];
  const cx = 0.28;
  const cz = -0.055;
  for (let i = 1; i <= 8; i++) {
    const a = Math.PI / 2 - (i / 8) * (Math.PI * 0.95);
    pts.push(v3(cx + Math.cos(a) * 0.055, 0, cz + Math.sin(a) * 0.055));
  }
  const flat = (t) => (t < 0.08 ? 0.45 + (t / 0.08) * 0.55 : t > 0.9 ? 1 - ((t - 0.9) / 0.1) * 0.5 : 1);
  const g = tube(pts, { segs: 60, radial: 6, radius: (t) => r * (t > 0.93 ? 1 - (t - 0.93) * 6 : 1), sx: (t) => flat(t), sy: (t) => 1 / Math.sqrt(flat(t)) });
  kit.add('rust', g, xf([0, r, 0]));
  kit.add(PAINT_RED(), cyl(r * 1.02, r * 1.02, 0.18, 6, true), xf([-0.05, r, 0], [0, 0, Math.PI / 2]));
  // split claw
  const tip = pts[pts.length - 1];
  kit.add('black', box(0.012, 0.004, 0.0035), xf([tip.x + 0.004, r, tip.z + 0.004], [0, -0.6, 0]));
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// Iron valve hand wheel (~0.45 m) lying flat, axis +Y; the hub has a square
// hole for the valveSocket spindle. To mount: slot.add(wheel); wheel.rotation.x = PI / 2.
export function valveWheel() {
  const kit = new Kit();
  const R = 0.2;
  const hub = new THREE.Shape();
  hub.absarc(0, 0, 0.034, 0, TAU, false);
  const hole = new THREE.Path();
  hole.moveTo(-0.013, -0.013);
  hole.lineTo(0.013, -0.013);
  hole.lineTo(0.013, 0.013);
  hole.lineTo(-0.013, 0.013);
  hole.closePath();
  hub.holes.push(hole);
  kit.add('metal', extrude(hub, 0.056, 0.002, 1, 16), xf([0, 0.002, 0], FLAT));
  kit.add(PAINT_RED(), torus(R, 0.018, 8, 36), xf([0, 0.03, 0], [Math.PI / 2, 0, 0], [1, 1, 1.15]));
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4;
    kit.add('rust', torus(R, 0.0186, 8, 6, 0.35), xf([0, 0.03, 0], [Math.PI / 2, 0, a], [1, 1, 1.1]));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const b = a + 0.25;
    const p0 = v3(Math.cos(a) * 0.03, 0.034, Math.sin(a) * 0.03);
    const p1 = v3(Math.cos(a + 0.14) * 0.11, 0.032, Math.sin(a + 0.14) * 0.11);
    const p2 = v3(Math.cos(b) * (R - 0.012), 0.03, Math.sin(b) * (R - 0.012));
    kit.add(PAINT_RED(), tube([p0, p1, p2], { segs: 10, radial: 6, radius: 0.0085, sx: 1, sy: 1 }));
  }
  const obj = kit.build();
  obj.userData.collider = 'none';
  obj.userData.hubDepth = 0.06;
  return obj;
}

// Rolled bandage with a loose tail, plus a folded gauze pad.
export function bandage() {
  const kit = new Kit();
  const r = 0.026;
  const w = 0.056;
  const rx = [0, 0, Math.PI / 2];
  kit.add(GAUZE(), cyl(r, r, w, 18), xf([0, r, 0], rx));
  const spiral = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const a = t * TAU * 4;
    const rr = 0.006 + t * (r - 0.008);
    spiral.push(v3(w / 2 + 0.0003, r + Math.sin(a) * rr, Math.cos(a) * rr));
  }
  kit.add(PEN(), tube(spiral, { segs: 64, radial: 3, radius: 0.00035 }));
  // tail unrolling from under the roll onto the floor
  const tail = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    tail.push(v3(0, 0.0012 + Math.sin(t * 5) * 0.0008, r * 0.2 + t * 0.09));
  }
  const tg = tube(tail, { segs: 12, radial: 4, radius: w / 2, sx: 1, sy: 0.02 });
  kit.add(GAUZE(), tg);
  // gauze pad with a blood spot
  const pad = roundBox(0.075, 0.009, 0.075, 0.25, 12, 8);
  deform(pad, (v) => {
    v.y *= 1 + fbm3(v.x * 40, 0, v.z * 40, 2, 3) * 0.6;
  });
  kit.add(GAUZE(), pad, xf([-0.075, 0.0045, 0.02], [0, 0.4, 0]));
  kit.add(DRIED(), roundBox(0.018, 0.0008, 0.013, 0.8, 8, 4), xf([-0.07, 0.0093, 0.024], [0, 1.1, 0]));
  kit.add(PEN(), box(0.07, 0.0004, 0.0008), xf([-0.075, 0.0092, 0.02], [0, 0.4, 0]));
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// Folded note of aged paper, one leaf lifted and curling, handwriting inside.
export function note() {
  const kit = new Kit();
  const rng = makeRng(19);
  const W = 0.14;
  const D = 0.1;
  const t = 0.0005;
  kit.add('paper', box(W, t, D), xf([0, t / 2, 0]));
  // top leaf hinged on the far (-Z) edge, lifted and curling
  const leaf = box(W, t, D, 1, 1, 8);
  deform(leaf, (v) => {
    const s = (v.z + D / 2) / D;
    const ang = 0.35 + s * s * 0.5;
    const r = s * D;
    const z = -D / 2 + Math.cos(ang * s) * r;
    const y = Math.sin(ang * s) * r * 0.9 + t + v.y;
    v.z = z;
    v.y = y;
  }, false);
  leaf.computeVertexNormals();
  kit.add('paper', leaf);
  // handwriting on the bottom leaf (visible under the lifted one)
  for (let row = 0; row < 7; row++) {
    let x = -W / 2 + 0.012;
    const z = -D / 2 + 0.018 + row * 0.011;
    while (x < W / 2 - 0.02) {
      const len = rng.range(0.006, 0.02);
      if (x + len > W / 2 - 0.012) break;
      kit.add(PEN(), box(len, 0.0002, 0.0012), xf([x + len / 2, t + 0.0001, z + rng.range(-0.001, 0.001)], [0, rng.range(-0.06, 0.06), 0]));
      x += len + rng.range(0.003, 0.005);
    }
  }
  kit.add(getDecalMaterial('bloodSmear'), new THREE.CircleGeometry(0.012, 10), xf([0.045, t + 0.0003, 0.03], [-Math.PI / 2, 0, 0], [1.3, 0.8, 1]));
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

