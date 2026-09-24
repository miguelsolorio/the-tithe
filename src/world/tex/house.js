import { TAU, makeRng, rgb, smoothstep, fbm, grain, hash01, branchPaths, strokePaths, maskCtx, readBytes, stampSegment, stampDisc, Surf, surfTextures } from './core.js';

// Plaster, tiles, fabrics and paper for the house.

// Branching crack network painted on a canvas (wraps). Returns RGBA bytes
// with the cracks in red.
function crackMask(w, h, rng, count, { width = 1.6, length = 220, branch = 0.05 } = {}) {
  const roots = [];
  for (let i = 0; i < count; i++) roots.push({ x: rng() * w, y: rng() * h, angle: rng() * TAU, width: width * (0.6 + rng() * 0.6), length: length * (0.5 + rng()) });
  const paths = branchPaths(rng, roots, { w, h, step: 3, wiggle: 0.55, branch, spread: [0.5, 1.2], taper: 0.992, minWidth: 0.5, maxDepth: 3 });
  const ctx = maskCtx(w, h);
  strokePaths(ctx, paths, '#f00');
  return readBytes(ctx);
}

// Dirty cracked plaster with damp stains and mould (2 m tile).
export function genPlaster(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const crack = crackMask(w, h, rng, 6);
  const low = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 1 });
  const trowel = fbm(w, h, { fx: 5, octaves: 3, kind: 'turb', seed: seed + 2 });
  const damp = fbm(w, h, { fx: 4, octaves: 5, seed: seed + 3 });
  const mould = fbm(w, h, { fx: 32, octaves: 3, seed: seed + 4 });
  const chip = fbm(w, h, { fx: 8, octaves: 4, seed: seed + 5 });
  const grit = grain(w, h, seed + 6);
  const gritSoft = grain(w, h, seed + 7, 1);
  const base = rgb('#6b6254');
  const yellow = rgb('#6a5a3c');
  const tide = rgb('#3f3322');
  const mouldC = rgb('#1c1e16');
  const under = rgb('#4f4336');
  for (let i = 0; i < w * h; i++) {
    const v = 0.82 + 0.3 * low[i] + (grit[i] - 0.5) * 0.08;
    let r = base[0] * v;
    let g = base[1] * v;
    let b = base[2] * v;
    let rough = 0.9 + (gritSoft[i] - 0.5) * 0.1;
    let hh = trowel[i] * 0.9 + gritSoft[i] * 0.25 + grit[i] * 0.05;
    // Damp stains: yellowed inside, dark tide lines at the edge
    const dv = damp[i];
    if (dv > 0.55) {
      const inside = smoothstep(0.6, 0.66, dv);
      const e = (dv - 0.605) / 0.012;
      const ring = Math.exp(-e * e) * 0.8;
      r += (yellow[0] * v - r) * inside * 0.55;
      g += (yellow[1] * v - g) * inside * 0.55;
      b += (yellow[2] * v - b) * inside * 0.55;
      r += (tide[0] - r) * ring * 0.6;
      g += (tide[1] - g) * ring * 0.6;
      b += (tide[2] - b) * ring * 0.6;
      // Mould speckle inside the damp
      const md = smoothstep(0.62, 0.78, mould[i]) * inside * smoothstep(0.66, 0.8, dv);
      r += (mouldC[0] - r) * md;
      g += (mouldC[1] - g) * md;
      b += (mouldC[2] - b) * md;
      rough -= inside * 0.12;
    }
    // Chipped patches show the brown scratch coat below
    const cp = smoothstep(0.8, 0.83, chip[i]);
    if (cp > 0) {
      r += (under[0] * v - r) * cp;
      g += (under[1] * v - g) * cp;
      b += (under[2] * v - b) * cp;
      hh -= cp * 0.8;
    }
    const ck = crack[i * 4] / 255;
    if (ck > 0) {
      r *= 1 - ck * 0.75;
      g *= 1 - ck * 0.75;
      b *= 1 - ck * 0.75;
      hh -= ck * 0.6;
    }
    s.set(i, r, g, b);
    s.hgt[i] = hh;
    s.rgh[i] = rough;
  }
  return surfTextures(s, { normal: 2 });
}

// Dirty bone / black checkerboard, 25 cm tiles, cracked glaze and grout.
export function genTile(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const ts = 128;
  const n = w / ts;
  // A few broken tiles get a crack across them; some corners are chipped.
  const crack = new Float32Array(w * h);
  const chip = new Float32Array(w * h);
  for (let k = 0; k < 5; k++) {
    const tx = Math.floor(rng() * n) * ts;
    const ty = Math.floor(rng() * n) * ts;
    let x = tx + rng() * ts;
    let y = ty;
    let a = Math.PI / 2 + (rng() - 0.5) * 0.8;
    if (rng() < 0.5) {
      x = tx;
      y = ty + rng() * ts;
      a = (rng() - 0.5) * 0.8;
    }
    for (let st = 0; st < 60; st++) {
      const nx = x + Math.cos(a) * 3;
      const ny = y + Math.sin(a) * 3;
      stampSegment(crack, w, h, x, y, nx, ny, 0.55, 1);
      if (rng() < 0.06) {
        let bx = nx;
        let by = ny;
        let ba = a + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.6);
        for (let bs = 0; bs < 8 + rng() * 10; bs++) {
          const cx = bx + Math.cos(ba) * 3;
          const cy = by + Math.sin(ba) * 3;
          stampSegment(crack, w, h, bx, by, cx, cy, 0.45, 0.8);
          bx = cx;
          by = cy;
          ba += (rng() - 0.5) * 0.5;
        }
      }
      x = nx;
      y = ny;
      a += (rng() - 0.5) * 0.35;
      if (x < tx - 2 || x > tx + ts + 2 || y < ty - 2 || y > ty + ts + 2) break;
    }
  }
  for (let k = 0; k < 7; k++) {
    const cx = Math.floor(rng() * n) * ts + (rng() < 0.5 ? 3 : ts - 3);
    const cy = Math.floor(rng() * n) * ts + (rng() < 0.5 ? 3 : ts - 3);
    stampDisc(chip, w, h, cx, cy, 5 + rng() * 9, 1);
  }
  const blot = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 1 });
  const dirt = fbm(w, h, { fx: 8, octaves: 4, seed: seed + 2 });
  const craze = fbm(w, h, { fx: 12, octaves: 3, kind: 'ridge', seed: seed + 3 });
  const wave = fbm(w, h, { fx: 8, octaves: 2, seed: seed + 4 });
  const px = grain(w, h, seed + 5);
  const bone = rgb('#9a917c');
  const black = rgb('#161412');
  const grout = rgb('#3a352d');
  const body = rgb('#6a6254');
  const grime = rgb('#241d15');
  for (let y = 0; y < h; y++) {
    const ty = (y / ts) | 0;
    const ly = y - ty * ts + 0.5;
    const ey = Math.min(ly, ts - ly);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const tx = (x / ts) | 0;
      const lx = x - tx * ts + 0.5;
      const e = Math.min(ey, lx, ts - lx);
      const light = (tx + ty) % 2 === 0;
      const tv = 0.92 + hash01(ty * 8 + tx, seed) * 0.14;
      const col = light ? bone : black;
      const g0 = 1 - smoothstep(2, 3.2, e); // grout line
      const bevel = smoothstep(2.4, 6, e);
      let v = tv * (0.95 + wave[i] * 0.1) * (0.97 + px[i] * 0.06);
      let r = col[0] * v;
      let g = col[1] * v;
      let b = col[2] * v;
      // Crazing on the pale glaze
      const cz = light ? smoothstep(0.9, 0.97, craze[i]) * 0.3 : 0;
      const ck = crack[i];
      const cp = chip[i] * (1 - g0);
      r += (body[0] - r) * cp;
      g += (body[1] - g) * cp;
      b += (body[2] - b) * cp;
      const dk = 1 - Math.max(cz, ck * 0.85);
      r *= dk;
      g *= dk;
      b *= dk;
      // Grime: collects near the grout and in patches
      const gm = Math.min(1, (0.25 + 0.75 * dirt[i]) * ((1 - smoothstep(3, 14, e)) * 0.6 + smoothstep(0.45, 0.85, blot[i]) * 0.45));
      r += (grime[0] - r) * gm * 0.6;
      g += (grime[1] - g) * gm * 0.6;
      b += (grime[2] - b) * gm * 0.6;
      const gv = 0.8 + 0.4 * dirt[i];
      r += (grout[0] * gv - r) * g0;
      g += (grout[1] * gv - g) * g0;
      b += (grout[2] * gv - b) * g0;
      s.set(i, r, g, b);
      s.hgt[i] = bevel * 0.9 + wave[i] * 0.08 - ck * 0.4 - cp * 0.4 + px[i] * 0.02 * g0;
      s.rgh[i] = 0.3 + gm * 0.3 + cp * 0.5 + g0 * 0.6 + ck * 0.3 + (light ? 0 : 0.04);
    }
  }
  return surfTextures(s, { normal: 2.2 });
}

// Woven fabric. twill: 2/2 twill (diagonal ribs), else plain weave.
function weave(seed, { color, twill = false, period = 6, rough = 0.92, stains = 0.4 }) {
  const w = 512;
  const h = 512;
  const s = new Surf(w, h);
  const base = rgb(color);
  const slub = fbm(w, h, { fx: 64, fy: 4, octaves: 2, seed: seed + 1 });
  const slubV = fbm(w, h, { fx: 4, fy: 64, octaves: 2, seed: seed + 2 });
  const fold = fbm(w, h, { fx: 3, octaves: 3, kind: 'ridge', seed: seed + 3 });
  const blot = fbm(w, h, { fx: 4, octaves: 4, seed: seed + 4 });
  const fuzz = grain(w, h, seed + 5);
  const half = period / 2;
  for (let y = 0; y < h; y++) {
    const j = (y / half) | 0;
    const ty = (y % half) / half;
    const rowTone = 0.9 + hash01(j, seed) * 0.2;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = (x / half) | 0;
      const tx = (x % half) / half;
      const warpOver = twill ? (((k - j) % 4) + 4) % 4 < 2 : (k + j) % 2 === 0;
      const across = warpOver ? tx : ty;
      const along = warpOver ? ty : tx;
      const prof = Math.sqrt(Math.sin(Math.PI * (across * 0.9 + 0.05)));
      const hump = 0.75 + 0.25 * Math.sin(Math.PI * along);
      const thread = warpOver ? 0.9 + hash01(k + 999, seed) * 0.2 : rowTone;
      const sl = warpOver ? slubV[i] : slub[i];
      const ht = prof * hump * (0.85 + sl * 0.3);
      const fd = fold[i];
      const v = thread * (0.55 + 0.45 * ht) * (0.9 + sl * 0.2) * (0.96 + fuzz[i] * 0.08) * (1 - smoothstep(0.75, 0.95, fd) * 0.3);
      const st = smoothstep(0.62, 0.8, blot[i]) * stains;
      const dk = 1 - st * 0.45;
      s.set(i, base[0] * v * dk, base[1] * v * dk, base[2] * v * dk);
      s.hgt[i] = ht * 0.35 + fd * 1.4;
      s.rgh[i] = rough - ht * 0.06 + st * 0.03;
    }
  }
  return surfTextures(s, { normal: 2.2 });
}

export const genCloth = (seed) => weave(seed, { color: '#302824', period: 6 });
export const genClothRed = (seed) => weave(seed, { color: '#5e1016', twill: true, period: 5, rough: 0.78, stains: 0.55 });

// Three twisted strands with fibres (for rope along U).
export function genRope(seed) {
  const w = 512;
  const h = 512;
  const s = new Surf(w, h);
  const fib = fbm(w, h, { fx: 96, fy: 6, octaves: 2, seed: seed + 1 });
  const dirt = fbm(w, h, { fx: 4, octaves: 4, seed: seed + 2 });
  const fuzz = grain(w, h, seed + 3);
  const base = rgb('#6e5a3a');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Strand phase: 3 strands across V, twisting twice along U
      const p = (y / h) * 3 + (x / w) * 6;
      const t = p - Math.floor(p);
      const prof = Math.pow(Math.sin(Math.PI * t), 0.6);
      // Fibres run against the strand twist (sheared lookup keeps it tileable)
      const fx = (x + ((y * 2) & 511)) & 511;
      const fb = fib[y * w + fx];
      const v = (0.45 + 0.55 * prof) * (0.85 + fb * 0.3) * (0.95 + fuzz[i] * 0.1) * (0.8 + dirt[i] * 0.3);
      s.set(i, base[0] * v, base[1] * v, base[2] * v);
      s.hgt[i] = prof * 1.2 + fb * 0.2;
      s.rgh[i] = 0.9 + (fuzz[i] - 0.5) * 0.08;
    }
  }
  return surfTextures(s, { normal: 3 });
}

// Aged paper: fibres, foxing spots, stains, creases and a slight crumple.
export function genPaper(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const fox = new Float32Array(w * h);
  for (let k = 0; k < 90; k++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const n = 1 + Math.floor(rng() * 4);
    for (let j = 0; j < n; j++) stampDisc(fox, w, h, cx + (rng() - 0.5) * 20, cy + (rng() - 0.5) * 20, 0.8 + rng() * 3.2, 0.4 + rng() * 0.6, 1);
  }
  // Creases: straight folds across the sheet
  const crease = new Float32Array(w * h);
  const folds = [
    [0, h * (0.3 + rng() * 0.1), w, h * (0.3 + rng() * 0.1)],
    [w * (0.55 + rng() * 0.1), 0, w * (0.55 + rng() * 0.1), h],
  ];
  for (const [ax, ay, bx, by] of folds) stampSegment(crease, w, h, ax - w, ay, bx + w, by, 2.5, 1, 1);
  const fibre = fbm(w, h, { fx: 64, fy: 16, octaves: 2, seed: seed + 1 });
  const blot = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 2 });
  const crumple = fbm(w, h, { fx: 4, octaves: 4, kind: 'ridge', seed: seed + 3 });
  const px = grain(w, h, seed + 4, 1);
  const base = rgb('#a89a78');
  const brown = rgb('#6e5634');
  for (let i = 0; i < w * h; i++) {
    const v = (0.9 + blot[i] * 0.14) * (0.96 + fibre[i] * 0.06) * (0.97 + px[i] * 0.06);
    let r = base[0] * v;
    let g = base[1] * v;
    let b = base[2] * v;
    const st = smoothstep(0.68, 0.8, blot[i]) * 0.35 + fox[i] * 0.6;
    r += (brown[0] - r) * st;
    g += (brown[1] - g) * st;
    b += (brown[2] - b) * st;
    const c = crease[i];
    const dk = 1 - c * 0.12;
    s.set(i, r * dk, g * dk, b * dk);
    s.hgt[i] = crumple[i] * 0.8 + px[i] * 0.1 + fibre[i] * 0.05 - c * 0.35;
    s.rgh[i] = 0.86 + (px[i] - 0.5) * 0.06 - st * 0.05;
  }
  return surfTextures(s, { normal: 1.8 });
}

