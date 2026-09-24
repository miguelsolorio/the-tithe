import * as THREE from 'three';
import { TAU, sat } from './rig.js';

// Small tileable canvas textures (generated once, shared by all creatures).
// Most are near-white luminance maps; hue comes from vertex colours.

function thash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function tnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = thash(x0, y0, seed), b = thash(x1, y0, seed);
  const c = thash(x0, y1, seed), d = thash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Tileable fbm on the unit square, fx/fy = integer base frequencies.
function tfbm(u, v, fx, fy, oct = 3, seed = 0) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    const f = 1 << o;
    sum += amp * tnoise(u * fx * f, v * fy * f, fx * f, fy * f, seed + o * 13);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

const ss = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ridge = (n) => 1 - Math.abs(n * 2 - 1);

function canvasTex(size, fn, srgb = true) {
  if (typeof document === 'undefined') return null; // node tests
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const px = img.data;
  const out = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, out);
      const i = (y * size + x) * 4;
      px[i] = sat(out[0]) * 255;
      px[i + 1] = sat(out[1]) * 255;
      px[i + 2] = sat(out[2]) * 255;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

const GEN = {
  // Muscle fibres running along V, with dark crevices between bundles.
  fiber: () => canvasTex(512, (u, v, o) => {
    const n = tfbm(u, v, 40, 3, 3, 1);
    const stripes = 0.5 + 0.5 * Math.sin(TAU * (u * 36 + n * 2.2));
    const fine = tfbm(u, v, 160, 6, 2, 7);
    const crev = ss(0.82, 0.98, ridge(tfbm(u, v, 14, 2, 3, 3)));
    const L = 0.62 + 0.2 * stripes + 0.22 * (fine - 0.5) - 0.38 * crev;
    const fat = ss(0.72, 0.85, tfbm(u, v, 10, 3, 3, 9)) * 0.25;
    o[0] = L + fat; o[1] = L * 0.92 + fat * 1.4; o[2] = L * 0.9 + fat;
  }),
  // Mottled skin with a faint vein network.
  skin: () => canvasTex(512, (u, v, o) => {
    const m = tfbm(u, v, 6, 6, 4, 21);
    const fine = tfbm(u, v, 64, 64, 2, 22);
    const vein = ss(0.93, 0.99, ridge(tfbm(u, v, 5, 5, 4, 23))) * 0.8;
    const L = 0.8 + 0.28 * (m - 0.5) + 0.12 * (fine - 0.5);
    o[0] = L * (1 - vein * 0.5); o[1] = L * (1 - vein * 0.55); o[2] = L * (1 - vein * 0.25);
  }),
  // Coarse weave with grime.
  cloth: () => canvasTex(256, (u, v, o) => {
    const tx = 0.5 + 0.5 * Math.sin(TAU * u * 64), ty = 0.5 + 0.5 * Math.sin(TAU * v * 64);
    const check = (Math.floor(u * 64) + Math.floor(v * 64)) % 2;
    const weave = check ? tx : ty;
    const grime = tfbm(u, v, 6, 6, 4, 31);
    const L = 0.72 + 0.16 * weave + 0.4 * (grime - 0.5);
    o[0] = o[1] = o[2] = L;
  }),
  // Pitted, cracked bone.
  bone: () => canvasTex(256, (u, v, o) => {
    const m = tfbm(u, v, 8, 8, 4, 41);
    const pit = ss(0.68, 0.8, tfbm(u, v, 40, 40, 2, 42));
    const crack = ss(0.955, 0.99, ridge(tfbm(u, v, 6, 6, 3, 43)));
    const L = 0.86 + 0.3 * (m - 0.5) - 0.3 * pit - 0.45 * crack;
    o[0] = L; o[1] = L * 0.97; o[2] = L * 0.92;
  }),
  // Growth ridges across V (ram horn, antler burr).
  horn: () => canvasTex(256, (u, v, o) => {
    const w = tfbm(u, v, 4, 2, 3, 51);
    const r = 0.5 + 0.5 * Math.sin(TAU * (v * 16 + w * 1.4));
    const streak = tfbm(u, v, 48, 2, 2, 52);
    const L = 0.45 + 0.4 * r ** 2 + 0.3 * (streak - 0.5);
    o[0] = L; o[1] = L * 0.95; o[2] = L * 0.88;
  }),
  // Wet strands along V.
  hair: () => canvasTex(256, (u, v, o) => {
    const s = tfbm(u, v, 96, 2, 3, 61);
    const clump = tfbm(u, v, 12, 1, 2, 62);
    const L = 0.35 + 0.8 * s ** 1.6 * (0.6 + 0.4 * clump);
    o[0] = o[1] = o[2] = L;
  }),
  // Rusted iron (coloured).
  rust: () => canvasTex(256, (u, v, o) => {
    const n = tfbm(u, v, 8, 8, 5, 71);
    const fine = tfbm(u, v, 48, 48, 2, 72);
    const r = ss(0.42, 0.62, n);
    const k = 0.75 + 0.5 * fine;
    o[0] = (0.2 + (0.5 - 0.2) * r) * k;
    o[1] = (0.2 + (0.26 - 0.2) * r) * k;
    o[2] = (0.21 + (0.15 - 0.21) * r) * k;
  }),
};

const cache = new Map();

export function tex(name) {
  if (!cache.has(name)) cache.set(name, GEN[name]());
  return cache.get(name);
}
