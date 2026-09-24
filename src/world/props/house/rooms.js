import * as THREE from 'three';
import { getMaterial } from '../../materials.js';
import { valueNoise2 } from '../../../core/rng.js';
import { Kit, TAU, finish, centerFloor, legProfile, addCandle, loftGeo, superRing, unitUV, bookMat, addBookFlat } from './kit.js';
import { portraitMaterial } from './canvas.js';

const FLAT = -Math.PI / 2;

// Double bed, foot end toward +Z. opts.bloody soaks it.
export function bed(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = 1.45;
  const L = 2.05;
  const hw = W / 2;
  const hl = L / 2;
  const w = 'woodDark';
  const post = (x, z, h) => {
    k.lathe(w, legProfile(h - 0.07, 0.034), x, 0, z, 7);
    k.sphere(w, 0.038, x, h - 0.035, z, 1, 1, 1, 7, 5);
  };
  post(-hw + 0.035, -hl + 0.035, 1.38);
  post(hw - 0.035, -hl + 0.035, 1.38);
  post(-hw + 0.035, hl - 0.035, 0.92);
  post(hw - 0.035, hl - 0.035, 0.92);
  // Headboard with an arched crest, footboard, side rails.
  const hz = -hl + 0.035;
  k.box(w, W - 0.1, 0.72, 0.035, 0, 0.86, hz);
  k.box(w, W - 0.36, 0.48, 0.014, 0, 0.84, hz + 0.024);
  k.box(w, W - 0.06, 0.07, 0.06, 0, 1.255, hz);
  k.cyl(w, 0.3, 0.3, 0.035, 0, 1.29, hz, Math.PI / 2, 0, 0, 14, false, Math.PI / 2, Math.PI);
  const fz = hl - 0.035;
  k.box(w, W - 0.1, 0.42, 0.035, 0, 0.56, fz);
  k.box(w, W - 0.36, 0.28, 0.014, 0, 0.56, fz + 0.024);
  k.box(w, W - 0.06, 0.06, 0.055, 0, 0.8, fz);
  for (const sx of [-1, 1]) k.box(w, 0.04, 0.18, L - 0.1, sx * (hw - 0.035), 0.34, 0);
  // Mattress, sheet, pillows.
  k.rbox('ticking', W - 0.1, 0.22, L - 0.12, 0.05, 0, 0.51, 0);
  k.box('linen', W - 0.08, 0.01, L - 0.1, 0, 0.625, 0);
  for (const sx of [-1, 1]) k.rbox('linen', 0.56, 0.13, 0.34, 0.06, sx * 0.32, 0.685, -hl + 0.3, 0.05, sx * rng.range(0.02, 0.12), 0);
  // Blanket over the lower two thirds with a turned-down sheet.
  const bm = opts.blanket ?? (rng() < 0.5 ? 'clothRed' : 'cloth');
  const b0 = -0.32;
  const b1 = hl - 0.06;
  const bl = b1 - b0;
  const bc = (b0 + b1) / 2;
  k.box(bm, W - 0.04, 0.035, bl, 0, 0.645, bc);
  for (const sx of [-1, 1]) k.box(bm, 0.02, 0.33, bl, sx * (hw - 0.01), 0.49, bc);
  k.box('linen', W - 0.03, 0.03, 0.18, 0, 0.67, b0 + 0.08);
  // Stains.
  const top = 0.664;
  k.stain('decal:grime', 0.25, 0.14, rng.range(-0.3, 0.3), top, rng.range(0, 0.6), 0.4);
  k.stain('decal:grime', 0.16, 0.1, rng.range(-0.3, 0.3), 0.7505, -hl + 0.3, 0.4);
  if (opts.bloody) {
    k.stain('decal:bloodSplat', 0.42, 0.34, rng.range(-0.1, 0.1), top + 0.001, 0.2, 0.3);
    k.stain('decal:bloodSmear', 0.3, 0.2, rng.range(-0.3, 0.3), top + 0.0015, 0.55, 0.4);
    k.stain('blood', 0.2, 0.15, rng.range(-0.1, 0.1), top + 0.002, 0.15, 0.35);
    k.stain('decal:bloodSmear', 0.18, 0.12, 0.3, 0.7515, -hl + 0.3, 0.4);
    // Runs down the +X side of the blanket, spatter on the headboard.
    for (let i = 0; i < 4; i++) k.dripV('decal:bloodDrip', rng.range(0.08, 0.2), rng.range(0.15, 0.3), hw + 0.0015, 0.66, rng.range(-0.2, 0.85), Math.PI / 2);
    for (let i = 0; i < 6; i++) k.stainV('decal:bloodSplat', rng.range(0.02, 0.05), rng.range(0.02, 0.05), rng.range(-0.5, 0.5), rng.range(0.7, 1.15), hz + 0.019, 0, 0.5);
  }
  return finish(k, 'bed', {}, true);
}

// Standing oval (cheval) mirror; opts.wall makes a wall-mounted oval.
// userData.glass is the separate 'glass' mesh (UVs 0..1 across the oval).
export function mirror(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const wall = !!opts.wall;
  const a = wall ? 0.26 : 0.27;
  const b = wall ? 0.38 : 0.56;
  const cy = wall ? 0 : 1.05;
  const cz = wall ? 0.02 : 0;
  const tilt = wall ? 0 : -0.07;
  const ellipse = (rx, ry, holeRx, holeRy) => {
    const s = new THREE.Shape();
    s.absellipse(0, 0, rx, ry, 0, TAU, false, 0);
    if (holeRx) {
      const h = new THREE.Path();
      h.absellipse(0, 0, holeRx, holeRy, 0, TAU, true, 0);
      s.holes.push(h);
    }
    return s;
  };
  k.push(0, cy, cz, tilt, 0, 0);
  k.extrude('woodDark', ellipse(a + 0.06, b + 0.06, a + 0.012, b + 0.012), 0.024, 0, 0, -0.012, 0, 0, 0, 0.006, 18);
  k.extrude('gilt', ellipse(a + 0.016, b + 0.016, a, b), 0.028, 0, 0, -0.012, 0, 0, 0, 0, 18);
  if (!wall) k.geo('woodDark', new THREE.ShapeGeometry(ellipse(a + 0.03, b + 0.03), 18), 0, 0, -0.014, 0, Math.PI, 0);
  k.pop();
  if (!wall) {
    // Uprights with finials, pivots, feet and a stretcher.
    const px = a + 0.12;
    for (const sx of [-1, 1]) {
      k.lathe('woodDark', [[0, 0], [0.028, 0], [0.022, 0.08], [0.018, 0.6], [0.024, 0.9], [0.018, 1.2], [0.024, 1.3], [0, 1.3]], sx * px, 0.05, 0, 7);
      k.sphere('woodDark', 0.03, sx * px, 1.38, 0, 1, 1.3, 1, 7, 5);
      k.cyl('brass', 0.022, 0.022, 0.07, sx * (px - 0.045), cy, 0, 0, 0, Math.PI / 2, 8);
      k.box('woodDark', 0.05, 0.05, 0.5, sx * px, 0.025, 0);
      k.sphere('woodDark', 0.03, sx * px, 0.03, 0.25, 1, 0.8, 1, 6, 4);
      k.sphere('woodDark', 0.03, sx * px, 0.03, -0.25, 1, 0.8, 1, 6, 4);
    }
    k.box('woodDark', px * 2, 0.035, 0.03, 0, 0.26, 0);
  }
  const g = finish(k, 'mirror', wall ? { collider: 'none' } : {});
  const glassGeo = unitUV(new THREE.ShapeGeometry(ellipse(a + 0.004, b + 0.004), 18));
  const glass = new THREE.Mesh(glassGeo, getMaterial('glass'));
  glass.name = 'mirror:glass';
  glass.position.set(0, cy, cz);
  glass.rotation.x = tilt;
  glass.translateZ(0.003);
  g.add(glass);
  g.userData.glass = glass;
  g.userData.glassSize = [a * 2, b * 2];
  return wall ? g : centerFloor(g);
}

// Framed dark portrait with a defaced face; wall-mounted (origin at the wall,
// centre of the canvas). opts.w / opts.h size the canvas, opts.tilt hangs it
// crooked.
export function painting(opts = {}) {
  const seed = opts.seed ?? 1;
  const k = new Kit(seed);
  const w = opts.w ?? 0.56;
  const h = opts.h ?? 0.74;
  const tilt = opts.tilt ?? 0;
  const fw = 0.07;
  k.push(0, 0, 0, 0, 0, tilt);
  const X = w / 2 + fw / 2;
  const Y = h / 2 + fw / 2;
  k.box('woodDark', w + fw * 2, fw, 0.04, 0, Y, 0.02);
  k.box('woodDark', w + fw * 2, fw, 0.04, 0, -Y, 0.02);
  k.box('woodDark', fw, h, 0.04, -X, 0, 0.02);
  k.box('woodDark', fw, h, 0.04, X, 0, 0.02);
  const lip = 0.018;
  k.box('gilt', w + lip * 2, lip, 0.046, 0, h / 2 + lip / 2, 0.023);
  k.box('gilt', w + lip * 2, lip, 0.046, 0, -h / 2 - lip / 2, 0.023);
  k.box('gilt', lip, h, 0.046, -w / 2 - lip / 2, 0, 0.023);
  k.box('gilt', lip, h, 0.046, w / 2 + lip / 2, 0, 0.023);
  const ow = w + fw * 2;
  const oh = h + fw * 2;
  k.box('gilt', ow + 0.012, 0.012, 0.03, 0, oh / 2, 0.015);
  k.box('gilt', ow + 0.012, 0.012, 0.03, 0, -oh / 2, 0.015);
  k.box('gilt', 0.012, oh, 0.03, -ow / 2, 0, 0.015);
  k.box('gilt', 0.012, oh, 0.03, ow / 2, 0, 0.015);
  k.box('woodDark', w, h, 0.01, 0, 0, 0.005);
  k.pop();
  const g = finish(k, 'painting', { collider: 'none' });
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), portraitMaterial(seed, w / h));
  canvas.name = 'painting:canvas';
  canvas.position.z = 0.024;
  canvas.rotation.z = tilt;
  g.add(canvas);
  return g;
}

function diamond(rx, rz) {
  const s = new THREE.Shape();
  s.moveTo(0, rz);
  s.lineTo(rx, 0);
  s.lineTo(0, -rz);
  s.lineTo(-rx, 0);
  s.lineTo(0, rz);
  return new THREE.ShapeGeometry(s);
}

// Worn patterned rug (walk-through). opts.w / opts.d size it.
export function rug(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = opts.w ?? 1.8;
  const D = opts.d ?? 2.6;
  const y0 = 0.008;
  k.box('clothRed', W, y0, D, 0, y0 / 2, 0);
  const band = (inset, width, m, y) => {
    const iw = W - inset * 2;
    const id = D - inset * 2;
    k.box(m, iw, 0.001, width, 0, y, id / 2 - width / 2);
    k.box(m, iw, 0.001, width, 0, y, -id / 2 + width / 2);
    k.box(m, width, 0.001, id - width * 2, iw / 2 - width / 2, y, 0);
    k.box(m, width, 0.001, id - width * 2, -iw / 2 + width / 2, y, 0);
  };
  band(0.07, 0.17, 'rugDark', y0 + 0.0005);
  band(0.11, 0.025, 'rugGold', y0 + 0.0012);
  band(0.28, 0.02, 'rugGold', y0 + 0.0005);
  const md = Math.min(W, D);
  k.geo('rugDark', diamond(md * 0.26, md * 0.4), 0, y0 + 0.0006, 0, FLAT, 0, 0);
  k.geo('rugGold', diamond(md * 0.17, md * 0.27), 0, y0 + 0.0012, 0, FLAT, 0, 0);
  k.geo('clothRed', diamond(md * 0.08, md * 0.14), 0, y0 + 0.0018, 0, FLAT, 0, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.geo('rugGold', diamond(0.07, 0.1), sx * (W / 2 - 0.42), y0 + 0.0008, sz * (D / 2 - 0.45), FLAT, 0, 0);
  }
  for (const sz of [-1, 1]) {
    for (let x = -W / 2 + 0.03; x < W / 2 - 0.02; x += 0.035) {
      k.plane('linen', 0.012, 0.07, x + rng.range(-0.004, 0.004), 0.002, sz * (D / 2 + 0.03), FLAT, 0, rng.range(-0.2, 0.2));
    }
  }
  for (let i = 0; i < 4; i++) k.stain('decal:grime', rng.range(0.15, 0.4), rng.range(0.1, 0.3), rng.range(-W / 3, W / 3), y0 + 0.0025, rng.range(-D / 3, D / 3), 0.4);
  if (opts.bloody || rng() < 0.4) k.stain('decal:bloodSmear', rng.range(0.15, 0.3), rng.range(0.1, 0.2), rng.range(-W / 4, W / 4), y0 + 0.003, rng.range(-D / 4, D / 4), 0.45);
  return finish(k, 'rug', { collider: 'none' });
}

// Grandfather clock with a stopped face and a still pendulum.
export function clock(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const w = 'woodDark';
  k.box(w, 0.52, 0.04, 0.31, 0, 0.02, 0);
  k.box(w, 0.5, 0.3, 0.3, 0, 0.19, 0);
  k.box(w, 0.53, 0.04, 0.32, 0, 0.35, 0.005);
  k.box(w, 0.4, 1.12, 0.24, 0, 0.93, -0.01);
  const dz = 0.11;
  const d0 = 0.48;
  const d1 = 1.36;
  const dx = 0.14;
  k.span(w, -dx, d0, dz, dx, d0 + 0.1, dz + 0.015);
  k.span(w, -dx, d1 - 0.08, dz, dx, d1, dz + 0.015);
  k.span(w, -dx, d0, dz, -dx + 0.05, d1, dz + 0.015);
  k.span(w, dx - 0.05, d0, dz, dx, d1, dz + 0.015);
  k.span('black', -dx + 0.05, d0 + 0.1, dz - 0.001, dx - 0.05, d1 - 0.08, dz + 0.002);
  k.box('brass', 0.008, 0.52, 0.004, 0, 1.02, dz + 0.005);
  k.cyl('brass', 0.055, 0.055, 0.008, 0, 0.74, dz + 0.007, Math.PI / 2, 0, 0, 16);
  const hy = 1.49;
  k.box(w, 0.5, 0.04, 0.3, 0, hy - 0.02, 0);
  k.box(w, 0.46, 0.52, 0.26, 0, hy + 0.26, -0.01);
  const fy = hy + 0.27;
  k.box('gilt', 0.36, 0.36, 0.006, 0, fy, 0.123);
  k.cyl('ivory', 0.15, 0.15, 0.006, 0, fy, 0.126, Math.PI / 2, 0, 0, 24);
  k.torus('brass', 0.154, 0.008, 0, fy, 0.13, 0, 0, 0, 4, 24);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    k.box('ink', 0.006, 0.022, 0.002, Math.sin(a) * 0.128, fy + Math.cos(a) * 0.128, 0.13, 0, 0, -a);
  }
  const ha = rng() * TAU;
  const ma = rng() * TAU;
  k.box('ink', 0.009, 0.08, 0.002, Math.sin(ha) * 0.035, fy + Math.cos(ha) * 0.035, 0.132, 0, 0, -ha);
  k.box('ink', 0.006, 0.12, 0.002, Math.sin(ma) * 0.055, fy + Math.cos(ma) * 0.055, 0.134, 0, 0, -ma);
  k.cyl('brass', 0.01, 0.01, 0.006, 0, fy, 0.135, Math.PI / 2, 0, 0, 8);
  for (const sx of [-1, 1]) k.lathe(w, [[0, 0], [0.02, 0], [0.016, 0.03], [0.013, 0.46], [0.02, 0.49], [0.02, 0.52], [0, 0.52]], sx * 0.21, hy, 0.115, 6);
  k.box(w, 0.53, 0.045, 0.31, 0, hy + 0.54, 0);
  k.cyl(w, 0.2, 0.2, 0.25, 0, hy + 0.56, -0.01, Math.PI / 2, 0, 0, 12, false, Math.PI / 2, Math.PI);
  k.sphere('brass', 0.024, 0, hy + 0.785, -0.01, 1, 1.3, 1, 6, 5);
  for (const sx of [-1, 1]) k.sphere('brass', 0.02, sx * 0.23, hy + 0.582, 0.1, 1, 1.3, 1, 6, 5);
  return finish(k, 'clock', {}, true);
}

// Upright piano with a few missing keys and two brass candle arms.
export function piano(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const w = 'woodDark';
  const W = 1.46;
  const hw = W / 2;
  k.span(w, -hw, 0, -0.3, hw, 0.06, 0.06);
  k.span(w, -hw, 0.06, -0.3, hw, 1.28, 0.06);
  k.span(w, -hw - 0.02, 1.28, -0.31, hw + 0.02, 1.31, 0.08);
  for (const sx of [-1, 1]) k.span(w, sx * (hw - 0.06), 0.66, 0.06, sx * hw, 0.8, 0.32);
  k.span(w, -hw + 0.06, 0.66, 0.06, hw - 0.06, 0.72, 0.3);
  k.span(w, -hw + 0.06, 0.66, 0.3, hw - 0.06, 0.725, 0.318);
  // Keys: 52 white, black keys in the 2 + 3 pattern starting from A.
  const x0 = -0.63;
  const pitch = 1.26 / 52;
  const missing = new Set([rng.int(6, 45), rng.int(6, 45)]);
  const sunk = rng.int(6, 45);
  for (let i = 0; i < 52; i++) {
    if (missing.has(i)) continue;
    k.box('ivory', pitch - 0.002, 0.02, 0.15, x0 + pitch * (i + 0.5), i === sunk ? 0.722 : 0.73, 0.23);
  }
  const names = 'ABCDEFG';
  for (let i = 0; i < 51; i++) {
    if (!'ACDFG'.includes(names[i % 7])) continue;
    k.box('black', 0.012, 0.02, 0.09, x0 + pitch * (i + 1), 0.75, 0.2);
  }
  // Fallboard, music desk and sheet music.
  k.box(w, W - 0.14, 0.14, 0.02, 0, 0.83, 0.1, -0.35, 0, 0);
  k.box(w, 0.9, 0.18, 0.015, 0, 0.99, 0.095, -0.25, 0, 0);
  k.box(w, 0.9, 0.02, 0.05, 0, 0.905, 0.12);
  k.box('paper', 0.23, 0.3, 0.002, -0.13, 1.05, 0.087, -0.25, 0, 0.04);
  k.box('paper', 0.23, 0.3, 0.002, 0.12, 1.05, 0.085, -0.25, 0, -0.06);
  // Front panels: upper with a cloth inset, lower raised panel.
  k.box(w, W - 0.16, 0.34, 0.012, 0, 1.1, 0.066);
  k.box('clothRed', W - 0.4, 0.24, 0.004, 0, 1.1, 0.074);
  k.box(w, W - 0.16, 0.48, 0.012, 0, 0.36, 0.066);
  k.box(w, W - 0.4, 0.34, 0.01, 0, 0.36, 0.076);
  // Brass candle arms on the upper panel.
  for (const sx of [-1, 1]) {
    const x = sx * 0.6;
    k.box('brass', 0.03, 0.06, 0.012, x, 1.12, 0.078);
    k.rod('brass', [x, 1.12, 0.08], [x, 1.1, 0.17], 0.006, 0.006, 5);
    k.lathe('brass', [[0, 0], [0.03, 0.004], [0.03, 0.01], [0.012, 0.008], [0.012, 0.022], [0, 0.022]], x, 1.095, 0.18, 8);
    k.push(x, 1.117, 0.18);
    addCandle(k, { h: rng.range(0.04, 0.11), r: 0.011, lit: false, drips: 2 });
    k.pop();
  }
  // Legs on toe blocks, pedals.
  for (const sx of [-1, 1]) {
    k.box(w, 0.07, 0.05, 0.3, sx * (hw - 0.05), 0.025, 0.17);
    k.lathe(w, legProfile(0.61, 0.03), sx * (hw - 0.05), 0.05, 0.26, 7);
  }
  for (const x of [-0.06, 0.06]) k.box('brass', 0.03, 0.012, 0.09, x, 0.08, 0.1);
  // On the lid: a photo frame and a couple of books.
  k.push(rng.range(-0.5, -0.2), 1.31, -0.1, 0, rng.range(-0.3, 0.3), 0);
  k.box('gilt', 0.15, 0.19, 0.014, 0, 0.093, 0, -0.18, 0, 0);
  k.box('black', 0.11, 0.145, 0.004, 0, 0.096, 0.008, -0.18, 0, 0);
  k.box(w, 0.03, 0.11, 0.012, 0, 0.05, -0.05, 0.4, 0, 0);
  k.pop();
  addBookFlat(k, 0.17, 0.035, 0.23, bookMat(rng.int(0, 7)), rng.range(0.25, 0.5), 1.31, -0.1, rng.range(-0.4, 0.4));
  addBookFlat(k, 0.15, 0.03, 0.21, bookMat(rng.int(0, 7)), rng.range(0.25, 0.5), 1.345, -0.1, rng.range(-0.4, 0.4));
  k.stain('decal:grime', 0.3, 0.1, rng.range(-0.3, 0.3), 1.3105, -0.12, 0.4);
  return finish(k, 'piano', {}, true);
}

// Standing coat rack; a long hooded coat and a hat hang from it.
export function coatRack(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const w = 'woodDark';
  const H = 1.8;
  k.lathe(w, [[0, 0.12], [0.03, 0.12], [0.036, 0.16], [0.022, 0.22], [0.02, H - 0.22], [0.028, H - 0.17], [0.021, H - 0.12], [0.022, H], [0, H]], 0, 0, 0, 8);
  k.sphere(w, 0.034, 0, H + 0.03, 0, 1, 1.2, 1, 8, 6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const c = Math.cos(a);
    const s = Math.sin(a);
    k.tube(w, [[c * 0.02, 0.2, s * 0.02], [c * 0.14, 0.12, s * 0.14], [c * 0.26, 0.03, s * 0.26], [c * 0.3, 0.018, s * 0.3]], (t) => 0.024 - 0.008 * t, 6, 5);
  }
  const hooks = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const y = H - 0.14 - (i % 2) * 0.12;
    k.tube('brass', [[c * 0.02, y, s * 0.02], [c * 0.12, y - 0.02, s * 0.12], [c * 0.17, y + 0.04, s * 0.17], [c * 0.16, y + 0.08, s * 0.16]], 0.006, 6, 4);
    k.sphere('brass', 0.011, c * 0.16, y + 0.085, s * 0.16, 1, 1, 1, 5, 4);
    hooks.push([a, y]);
  }
  const ci = rng.int(0, 5);
  const [ca, cy] = hooks[ci];
  k.push(Math.cos(ca) * 0.2, cy + 0.01, Math.sin(ca) * 0.2, 0, Math.PI / 2 - ca, 0);
  k.lathe('cloth', [[0, -1.05], [0.25, -1.05], [0.22, -0.7], [0.2, -0.32], [0.18, -0.1], [0.1, -0.03], [0.03, 0]], 0, 0, 0, 10, 0, 0, 0, 1, 1, 0.45);
  k.sphere('cloth', 0.1, 0, 0.0, -0.03, 1, 1.15, 0.8, 8, 6);
  k.pop();
  const [ha, hy] = hooks[(ci + 3) % 6];
  k.push(Math.cos(ha) * 0.2, hy + 0.06, Math.sin(ha) * 0.2, rng.range(-0.4, 0.4), 0, rng.range(-0.4, 0.4));
  k.cyl('cloth', 0.15, 0.15, 0.008, 0, 0, 0, 0, 0, 0, 14);
  k.cyl('cloth', 0.08, 0.088, 0.1, 0, 0.054, 0, 0, 0, 0, 12);
  k.pop();
  return finish(k, 'coatRack', {}, true);
}

// Dressmaker's dummy on a tripod, a tape measure round its neck.
export function mannequin(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    k.tube('woodDark', [[0, 0.3, 0], [c * 0.12, 0.18, s * 0.12], [c * 0.28, 0.03, s * 0.28]], (t) => 0.018 - 0.006 * t, 5, 5);
    k.sphere('brass', 0.018, c * 0.28, 0.018, s * 0.28, 1, 1, 1, 6, 4);
  }
  k.cyl('woodDark', 0.03, 0.035, 0.06, 0, 0.3, 0, 0, 0, 0, 10);
  k.cyl('brass', 0.013, 0.013, 0.66, 0, 0.63, 0, 0, 0, 0, 6);
  const secs = [
    [0.94, 0.15, 0.115, 0],
    [1.02, 0.172, 0.128, 0],
    [1.1, 0.158, 0.118, 0],
    [1.18, 0.132, 0.1, 0.005],
    [1.28, 0.15, 0.114, 0.022],
    [1.36, 0.166, 0.108, 0.016],
    [1.43, 0.176, 0.094, 0],
    [1.47, 0.14, 0.078, 0],
    [1.5, 0.062, 0.055, 0],
    [1.56, 0.046, 0.046, 0],
  ];
  const torso = opts.fabric ?? 'linen';
  k.geo(torso, loftGeo(secs.map(([y, a, b, cz]) => superRing(a, b, y, 18, 2.2, 0, cz)), { capStart: true, capEnd: true }));
  k.lathe('woodDark', [[0, 0], [0.05, 0], [0.055, 0.02], [0.03, 0.05], [0, 0.058]], 0, 1.56, 0, 10);
  k.tube('tape', [[-0.07, 1.2, 0.13], [-0.066, 1.4, 0.112], [-0.05, 1.5, 0.062], [0, 1.535, -0.056], [0.05, 1.5, 0.062], [0.066, 1.4, 0.112], [0.08, 1.16, 0.132]], 0.005, 20, 3);
  for (let i = 0; i < 4; i++) k.sphere('brass', 0.005, rng.range(-0.12, 0.12), rng.range(1.38, 1.44), 0.09 + rng.range(-0.01, 0.01), 1, 1, 1, 4, 3);
  return finish(k, 'mannequin', {}, true);
}

// Shapes the dust sheet drapes over: boxes [x0, z0, x1, z1, top].
const SHEET_SHAPES = {
  armchair: { cell: 0.045, boxes: [[-0.42, -0.38, 0.42, 0.42, 0.47], [-0.42, -0.42, 0.42, -0.2, 1.08], [-0.42, -0.38, -0.28, 0.42, 0.66], [0.28, -0.38, 0.42, 0.42, 0.66]] },
  chair: { cell: 0.04, boxes: [[-0.23, -0.21, 0.23, 0.23, 0.47], [-0.23, -0.26, 0.23, -0.18, 0.97]] },
  sofa: { cell: 0.06, boxes: [[-1.0, -0.38, 1.0, 0.42, 0.5], [-1.0, -0.42, 1.0, -0.2, 0.9], [-1.0, -0.38, -0.84, 0.42, 0.68], [0.84, -0.38, 1.0, 0.42, 0.68]] },
  table: { cell: 0.06, boxes: [[-0.65, -0.45, 0.65, 0.45, 0.76]] },
  tall: { cell: 0.06, boxes: [[-0.55, -0.3, 0.55, 0.3, 1.95]] },
  piano: { cell: 0.06, boxes: [[-0.73, -0.3, 0.73, 0.06, 1.3], [-0.73, 0.06, 0.73, 0.32, 0.75]] },
};

// Furniture shape under a dusty sheet. opts.shape: armchair | chair | sofa |
// table | tall | piano.
export function sheetCovered(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const S = SHEET_SHAPES[opts.shape] ?? SHEET_SHAPES.armchair;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const b of S.boxes) {
    x0 = Math.min(x0, b[0]);
    z0 = Math.min(z0, b[1]);
    x1 = Math.max(x1, b[2]);
    z1 = Math.max(z1, b[3]);
  }
  const m = 0.1;
  const c = S.cell;
  const nx = Math.ceil((x1 - x0 + 2 * m) / c);
  const nz = Math.ceil((z1 - z0 + 2 * m) / c);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const sx = (x1 - x0 + 2 * m) / nx;
  const sz = (z1 - z0 + 2 * m) / nz;
  const idx = (i, j) => j * (nx + 1) + i;
  let hgt = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = cx - (x1 - x0) / 2 - m + i * sx;
      const z = cz - (z1 - z0) / 2 - m + j * sz;
      let h = 0;
      for (const b of S.boxes) if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]) h = Math.max(h, b[4]);
      hgt[idx(i, j)] = h;
    }
  }
  // Soften so the cloth sags between supports and flares at the floor.
  const orig = hgt.slice();
  for (let pass = 0; pass < 2; pass++) {
    const nh = new Float32Array(hgt.length);
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        let sum = 0;
        let n = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii > nx || jj > nz) continue;
            sum += hgt[idx(ii, jj)];
            n++;
          }
        }
        nh[idx(i, j)] = sum / n;
      }
    }
    hgt = nh;
  }
  const pos = [];
  const seed = (opts.seed ?? 1) * 13;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = cx - (x1 - x0) / 2 - m + i * sx;
      const z = cz - (z1 - z0) / 2 - m + j * sz;
      let h = Math.max(hgt[idx(i, j)], orig[idx(i, j)] * 0.93);
      const edge = i === 0 || j === 0 || i === nx || j === nz;
      if (edge || h < 0.03) h = 0.004;
      else h += (valueNoise2(x * 9, z * 9, seed) - 0.5) * 0.025;
      // Vertical folds on the hanging sides.
      const fold = h > 0.05 && h < 0.9 * orig[idx(i, j)] ? (valueNoise2(x * 14, z * 14, seed + 3) - 0.5) * 0.03 : 0;
      pos.push(x + fold, h, z + fold);
    }
  }
  const ind = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = idx(i, j);
      const b = idx(i + 1, j);
      const cc = idx(i, j + 1);
      const d = idx(i + 1, j + 1);
      ind.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(ind);
  geo.computeVertexNormals();
  k.geo('dustSheet', geo);
  return finish(k, 'sheetCovered', {}, true);
}

// Old rocking cradle with spindle sides and a swaddled bundle.
export function cradle(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const w = 'woodDark';
  const ex = 0.43;
  // Rockers under each end, running across the width.
  const rock = new THREE.Shape();
  const span = 0.32;
  const R = 0.75;
  const arc = (z) => (z * z) / (2 * R);
  const n = 8;
  rock.moveTo(-span, arc(-span));
  for (let i = 1; i <= n; i++) {
    const z = -span + (2 * span * i) / n;
    rock.lineTo(z, arc(z));
  }
  rock.lineTo(span, arc(span) + 0.035);
  for (let i = n - 1; i >= 1; i--) {
    const z = -span + (2 * span * i) / n;
    rock.lineTo(z, arc(z) + 0.07 - Math.abs(z / span) * 0.03);
  }
  rock.lineTo(-span, arc(-span) + 0.035);
  for (const sx of [-1, 1]) k.extrude(w, rock, 0.03, sx * ex + 0.015, 0, 0, 0, -Math.PI / 2, 0, 0, 1);
  // End boards: taller arched head at -X.
  const endShape = (top, crest) => {
    const s = new THREE.Shape();
    s.moveTo(-0.23, 0.06);
    s.lineTo(0.23, 0.06);
    s.lineTo(0.23, top);
    s.quadraticCurveTo(0, top + crest, -0.23, top);
    s.lineTo(-0.23, 0.06);
    return s;
  };
  k.extrude(w, endShape(0.66, 0.2), 0.03, -ex + 0.015, 0, 0, 0, -Math.PI / 2, 0, 0, 6);
  k.extrude(w, endShape(0.56, 0.1), 0.03, ex + 0.015, 0, 0, 0, -Math.PI / 2, 0, 0, 6);
  // Basket: floor, rails and spindles.
  k.box(w, 0.84, 0.02, 0.44, 0, 0.2, 0);
  for (const sz of [-1, 1]) {
    const z = sz * 0.215;
    k.box(w, 0.84, 0.03, 0.03, 0, 0.56, z);
    k.box(w, 0.84, 0.04, 0.03, 0, 0.23, z);
    for (let i = 0; i < 9; i++) k.cyl(w, 0.009, 0.009, 0.31, -0.36 + i * 0.09, 0.395, z, 0, 0, 0, 5);
  }
  k.rbox('linen', 0.8, 0.06, 0.4, 0.02, 0, 0.24, 0);
  k.box('clothRed', 0.42, 0.02, 0.42, 0.18, 0.28, 0, 0, 0, 0.04);
  if (!opts.empty) {
    k.sphere('linen', 0.1, -0.1, 0.32, 0, 1.6, 0.6, 0.8, 8, 6);
    k.sphere('linen', 0.07, -0.27, 0.33, 0, 1, 0.8, 0.9, 7, 5);
    k.stain('decal:bloodSmear', 0.035, 0.03, -0.12, 0.3805, 0.01, 0.45);
  }
  if (rng() < 0.5) k.stain('decal:grime', 0.2, 0.1, 0.1, 0.271, 0, 0.4);
  return finish(k, 'cradle', {}, true);
}
