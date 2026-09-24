import { TAU, makeRng, rgb, smoothstep, fbm, grain, worley, stampSegment, stampDisc, Surf, surfTextures } from './core.js';

// Wood family. Growth rings: ring coordinate r -> t = fract(r); earlywood is
// light and wide, latewood darkens toward the end of each ring and resets
// sharply, which is what makes grain read as wood.
function late(r) {
  const t = r - Math.floor(r);
  return smoothstep(0.5, 0.97, t);
}

// Worn, staggered floorboards along U. 1024 px for 2 m (12 planks of ~17 cm).
export function genFloorboards(seed) {
  const w = 1024;
  const h = 1024;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const rows = 12;
  const pw = h / rows;
  const ppm = w / 2;

  // Butt joints per row (two per 2 m), staggered against the previous row.
  const joints = [];
  let prev = [-999, -999];
  for (let r = 0; r < rows; r++) {
    let a;
    let b;
    for (let tries = 0; tries < 20; tries++) {
      a = Math.floor(rng() * w);
      b = (a + 380 + Math.floor(rng() * 260)) % w;
      const far = (j) => prev.every((p) => Math.min(Math.abs(j - p), w - Math.abs(j - p)) > 110);
      if (far(a) && far(b)) break;
    }
    joints.push(a < b ? [a, b] : [b, a]);
    prev = [a, b];
  }
  // Per-plank look: two planks per row (index row * 2 + segment).
  const plank = [];
  for (let k = 0; k < rows * 2; k++) {
    plank.push({
      tint: 0.78 + rng() * 0.42,
      warm: (rng() - 0.5) * 0.08,
      rings: 3 + rng() * 6,
      phase: rng() * 10,
      curve: (rng() - 0.3) * 5,
      ox: Math.floor(rng() * 512),
      oy: Math.floor(rng() * 512),
    });
  }

  // Knots bend the rings around them (field added to the ring coordinate).
  const knot = new Float32Array(w * h);
  for (let k = 0; k < 5; k++) {
    const row = Math.floor(rng() * rows);
    const kx = rng() * w;
    const ky = row * pw + pw * (0.25 + rng() * 0.5);
    const rx = 14 + rng() * 14;
    const ry = 6 + rng() * 5;
    for (let y = Math.floor(ky - ry * 3); y < ky + ry * 3; y++) {
      if (y < row * pw || y >= (row + 1) * pw) continue;
      const row0 = (((y % h) + h) % h) * w;
      for (let x = Math.floor(kx - rx * 3); x < kx + rx * 3; x++) {
        const dx = (x - kx) / rx;
        const dy = (y - ky) / ry;
        const d = dx * dx + dy * dy;
        if (d < 9) knot[row0 + (((x % w) + w) % w)] += Math.exp(-d * 0.8);
      }
    }
  }

  // Scuffs (light scratches, dark rubber marks) and nail holes.
  const scratch = new Float32Array(w * h);
  const rub = new Float32Array(w * h);
  const nail = new Float32Array(w * h);
  for (let i = 0; i < 260; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const a = (rng() - 0.5) * 1.2 + (rng() < 0.3 ? Math.PI / 2 : 0);
    const len = 6 + rng() * 50;
    stampSegment(scratch, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.4 + rng() * 0.6, 0.3 + rng() * 0.7);
  }
  for (let i = 0; i < 40; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const a = rng() * TAU;
    const len = 5 + rng() * 25;
    stampSegment(rub, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 1 + rng() * 2.5, 0.3 + rng() * 0.5);
  }
  const joist = ppm * 0.4;
  for (let r = 0; r < rows; r++) {
    for (let jx = joist * 0.5; jx < w; jx += joist) {
      for (const f of [0.22, 0.78]) stampDisc(nail, w, h, jx + (rng() - 0.5) * 3, r * pw + pw * f + (rng() - 0.5) * 3, 2.2 + rng() * 0.8, 1, 1);
    }
    for (const j of joints[r]) {
      for (const side of [-1, 1]) for (const f of [0.25, 0.75]) stampDisc(nail, w, h, j + side * 9, r * pw + pw * f, 2.2, 1, 1);
    }
  }

  const warp = fbm(512, 512, { fx: 2, fy: 8, octaves: 4, seed: seed + 1 });
  const fiber = fbm(512, 512, { fx: 4, fy: 128, octaves: 2, seed: seed + 2 });
  const wear = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 3 });
  const dirt = fbm(w, h, { fx: 8, octaves: 3, seed: seed + 4 });
  const stain = fbm(w, h, { fx: 5, octaves: 4, seed: seed + 5 });
  const px = grain(w, h, seed + 6);

  const base = rgb('#3d2b1d');
  const worn = rgb('#5a4a38');
  const gapC = rgb('#0a0806');

  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / pw);
    const ly = y - row * pw;
    const across = ly / pw;
    const dY = Math.min(ly + 0.5, pw - ly - 0.5);
    const [ja, jb] = joints[row];
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const inMid = x >= ja && x < jb;
      const p = plank[row * 2 + (inMid ? 1 : 0)];
      // Along-plank coordinate from the plank's start (wraps for the outer plank).
      const start = inMid ? ja : jb;
      const len = inMid ? jb - ja : w - (jb - ja);
      const along = (x - start + w) % w;
      const dA = Math.min(Math.abs(x + 0.5 - ja), Math.abs(x + 0.5 - jb), w - Math.abs(x + 0.5 - ja), w - Math.abs(x + 0.5 - jb));
      const edge = Math.min(dY, dA);

      const j = (((y + p.oy) & 511) << 9) | ((x + p.ox) & 511);
      const c = (along / len) * 2 - 1;
      const ring = across * p.rings + warp[j] * 2.2 + c * c * p.curve + p.phase + knot[i] * 3;
      const lw = late(ring);
      const fb = fiber[j];
      const k = knot[i];

      const wr = smoothstep(0.45, 0.85, wear[i]);
      let v = p.tint * (1 - 0.34 * lw) * (0.9 + 0.2 * fb) * (0.96 + px[i] * 0.08);
      let r = base[0] * (1 + p.warm) * v;
      let g = base[1] * v;
      let b = base[2] * (1 - p.warm) * v;
      // Knot cores are dark and resinous
      if (k > 0.6) {
        const kc = smoothstep(0.6, 0.95, k);
        r *= 1 - kc * 0.55;
        g *= 1 - kc * 0.6;
        b *= 1 - kc * 0.6;
      }
      // Traffic wear: finish gone, lighter and greyer
      const wk = wr * 0.45;
      r += (worn[0] * v - r) * wk;
      g += (worn[1] * v - g) * wk;
      b += (worn[2] * v - b) * wk;
      // Dark spills
      const st = smoothstep(0.7, 0.8, stain[i]) * 0.45;
      // Dirt in the cracks and along plank edges
      const de = (1 - smoothstep(1.5, 6, edge)) * (0.4 + 0.6 * dirt[i]);
      const dk = (1 - st) * (1 - de * 0.55) * (1 - rub[i] * 0.5);
      r *= dk;
      g *= dk;
      b *= dk;
      const sc = scratch[i] * (0.35 + wr * 0.4);
      r += (worn[0] * 1.15 - r) * sc;
      g += (worn[1] * 1.15 - g) * sc;
      b += (worn[2] * 1.15 - b) * sc;
      const nl = nail[i];
      const gap = 1 - smoothstep(0.7, 1.6, edge);
      const hole = Math.max(gap, nl * 0.9);
      r += (gapC[0] - r) * hole;
      g += (gapC[1] - g) * hole;
      b += (gapC[2] - b) * hole;
      s.set(i, r, g, b);

      s.hgt[i] = smoothstep(0, 5, edge) * 1.1 + lw * 0.07 + fb * 0.05 + wear[i] * 0.2 - scratch[i] * 0.12 - nl * 0.35 + k * 0.08;
      s.rgh[i] = 0.5 + wr * 0.28 + lw * 0.05 + sc * 0.2 + de * 0.2 + gap * 0.4 - st * 0.1;
    }
  }
  return surfTextures(s, { normal: 2.6 });
}

// Grain field shared by the single-board woods: horizontal grain across the tile.
function boardGrain(w, h, seed, { rings = 22, warpAmp = 2.4, broad = 1.2 }) {
  const warp = fbm(w, h, { fx: 2, fy: 6, octaves: 4, seed });
  const broadF = fbm(w, h, { fx: 1, fy: 2, octaves: 2, seed: seed + 1 });
  const out = new Float32Array(w * h);
  for (let y = 0, i = 0; y < h; y++) {
    const base = (y / h) * rings;
    for (let x = 0; x < w; x++, i++) out[i] = base + warp[i] * warpAmp + broadF[i] * broad * rings * 0.25;
  }
  return out;
}

// Vertical beadboard panelling: 8 boards per metre, V-grooves and a bead.
export function genWainscot(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const bw = 64;
  const boards = [];
  for (let k = 0; k < w / bw; k++) boards.push({ tint: 0.8 + rng() * 0.35, rings: 2 + rng() * 3, phase: rng() * 10, oy: Math.floor(rng() * 512) });
  const warp = fbm(w, h, { fx: 8, fy: 2, octaves: 4, seed: seed + 1 });
  const fiber = fbm(w, h, { fx: 128, fy: 4, octaves: 2, seed: seed + 2 });
  const wear = fbm(w, h, { fx: 4, octaves: 4, seed: seed + 3 });
  const px = grain(w, h, seed + 4);
  // Kick scuffs in the lower part (the band is 0.14 - 1.0 m above the floor).
  const scuff = new Float32Array(w * h);
  for (let i = 0; i < 90; i++) {
    const x = rng() * w;
    const y = h - (0.14 + Math.pow(rng(), 1.5) * 0.3) * h;
    const a = (rng() - 0.5) * 0.8;
    const len = 5 + rng() * 30;
    stampSegment(scuff, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.6 + rng() * 1.4, 0.3 + rng() * 0.6);
  }
  const base = rgb('#2e2016');
  const dust = rgb('#4a4036');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const bi = (x / bw) | 0;
      const b = boards[bi];
      const lx = x - bi * bw + 0.5;
      const e = Math.min(lx, bw - lx);
      // V-groove at the joint, bead near the left edge of each board
      const groove = smoothstep(0, 4.5, e);
      const bd = (lx - 11) / 3;
      const bead = lx > 7 && lx < 15 ? Math.sqrt(Math.max(0, 1 - bd * bd)) : 0;
      const beadGroove = lx > 5.5 && lx < 16.5 && bead === 0 ? 1 : 0;
      const j = (((y + b.oy) & 511) << 9) | x;
      const ring = (lx / bw) * b.rings + warp[j] * 2 + b.phase;
      const lw = late(ring);
      const v = b.tint * (1 - 0.3 * lw) * (0.9 + 0.2 * fiber[i]) * (0.97 + px[i] * 0.06);
      let r = base[0] * v;
      let g = base[1] * v;
      let bl = base[2] * v;
      const wr = smoothstep(0.55, 0.9, wear[i]) * 0.35 + scuff[i] * 0.5;
      r += (dust[0] - r) * wr;
      g += (dust[1] - g) * wr;
      bl += (dust[2] - bl) * wr;
      const cav = (1 - groove) * 0.8 + beadGroove * 0.35;
      r *= 1 - cav;
      g *= 1 - cav;
      bl *= 1 - cav;
      s.set(i, r, g, bl);
      s.hgt[i] = groove * 1.2 + bead * 0.25 - beadGroove * 0.2 + lw * 0.05 + fiber[i] * 0.04 - scuff[i] * 0.1;
      s.rgh[i] = 0.42 + lw * 0.06 + wr * 0.35 + cav * 0.3 + (fiber[i] - 0.5) * 0.06;
    }
  }
  return surfTextures(s, { normal: 2.8 });
}

// Dark stained furniture wood: tight grain, satin varnish, fine scratches.
export function genWoodDark(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const ring = boardGrain(w, h, seed, { rings: 26, warpAmp: 2.6 });
  const fiber = fbm(w, h, { fx: 4, fy: 128, octaves: 2, seed: seed + 2 });
  const figure = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 3 });
  const px = grain(w, h, seed + 4);
  const scratch = new Float32Array(w * h);
  for (let i = 0; i < 90; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const a = rng() * TAU;
    const len = 8 + rng() * 60;
    stampSegment(scratch, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.35 + rng() * 0.4, 0.3 + rng() * 0.6);
  }
  const base = rgb('#2a1a10');
  const lateC = rgb('#150b06');
  const hi = rgb('#3d2213');
  for (let i = 0; i < w * h; i++) {
    const lw = late(ring[i]);
    const f = figure[i];
    const v = (0.9 + 0.2 * fiber[i]) * (0.97 + px[i] * 0.06);
    let r = (base[0] + (hi[0] - base[0]) * f * 0.6) * v;
    let g = (base[1] + (hi[1] - base[1]) * f * 0.6) * v;
    let b = (base[2] + (hi[2] - base[2]) * f * 0.6) * v;
    r += (lateC[0] - r) * lw * 0.7;
    g += (lateC[1] - g) * lw * 0.7;
    b += (lateC[2] - b) * lw * 0.7;
    const sc = scratch[i] * 0.3;
    s.set(i, r + sc * 0.12, g + sc * 0.08, b + sc * 0.05);
    s.hgt[i] = lw * 0.12 + fiber[i] * 0.06 - scratch[i] * 0.15;
    s.rgh[i] = 0.4 + lw * 0.08 + (fiber[i] - 0.5) * 0.08 + sc * 0.5 + (1 - f) * 0.06;
  }
  return surfTextures(s, { normal: 1.6 });
}

// Older, lighter, weathered wood: open grain, raised latewood, checks.
export function genWood(seed) {
  const w = 512;
  const h = 512;
  const s = new Surf(w, h);
  const ring = boardGrain(w, h, seed, { rings: 16, warpAmp: 2.2 });
  const fiber = fbm(w, h, { fx: 4, fy: 128, octaves: 2, seed: seed + 2 });
  const blot = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 3 });
  const check = fbm(w, h, { fx: 3, fy: 48, octaves: 3, kind: 'ridge', seed: seed + 4 });
  const px = grain(w, h, seed + 5);
  const base = rgb('#5a4330');
  const grey = rgb('#5b5247');
  const lateC = rgb('#2e2016');
  for (let i = 0; i < w * h; i++) {
    const lw = late(ring[i]);
    const gr = smoothstep(0.3, 0.8, blot[i]) * 0.45;
    const v = (0.86 + 0.24 * fiber[i]) * (0.95 + px[i] * 0.1);
    let r = (base[0] + (grey[0] - base[0]) * gr) * v;
    let g = (base[1] + (grey[1] - base[1]) * gr) * v;
    let b = (base[2] + (grey[2] - base[2]) * gr) * v;
    r += (lateC[0] - r) * lw * 0.55;
    g += (lateC[1] - g) * lw * 0.55;
    b += (lateC[2] - b) * lw * 0.55;
    // Checks: thin dark cracks along the grain
    const ck = smoothstep(0.93, 0.985, check[i]);
    r *= 1 - ck * 0.7;
    g *= 1 - ck * 0.7;
    b *= 1 - ck * 0.7;
    s.set(i, r, g, b);
    s.hgt[i] = lw * 0.3 + fiber[i] * 0.12 + px[i] * 0.03 - ck * 0.5;
    s.rgh[i] = 0.74 + gr * 0.1 + (fiber[i] - 0.5) * 0.1 + ck * 0.1;
  }
  return surfTextures(s, { normal: 2.4 });
}

// Waterlogged, grey-green rotting wood: eroded grain, cubical cracking,
// mould and wet dark patches.
export function genWoodRotten(seed) {
  const w = 512;
  const h = 512;
  const s = new Surf(w, h);
  const ring = boardGrain(w, h, seed, { rings: 12, warpAmp: 3 });
  const fiber = fbm(w, h, { fx: 4, fy: 128, octaves: 2, seed: seed + 2 });
  const rot = fbm(w, h, { fx: 3, octaves: 5, seed: seed + 3 });
  const wet = fbm(w, h, { fx: 4, octaves: 4, seed: seed + 4 });
  const mould = fbm(w, h, { fx: 16, octaves: 3, seed: seed + 5 });
  const eros = fbm(w, h, { fx: 6, fy: 24, octaves: 4, kind: 'turb', seed: seed + 6 });
  const cells = worley(w, h, { cx: 10, cy: 26, seed: seed + 7 });
  const check = fbm(w, h, { fx: 3, fy: 48, octaves: 3, kind: 'ridge', seed: seed + 8 });
  const px = grain(w, h, seed + 9);
  const base = rgb('#39342a');
  const green = rgb('#3a4232');
  const lateC = rgb('#1a1812');
  const mouldC = rgb('#6a7060');
  const wetC = rgb('#15140f');
  for (let i = 0; i < w * h; i++) {
    const lw = late(ring[i]);
    const rt = smoothstep(0.4, 0.7, rot[i]);
    const v = (0.85 + 0.25 * fiber[i]) * (0.94 + px[i] * 0.12);
    let r = (base[0] + (green[0] - base[0]) * rt) * v;
    let g = (base[1] + (green[1] - base[1]) * rt) * v;
    let b = (base[2] + (green[2] - base[2]) * rt) * v;
    r += (lateC[0] - r) * lw * 0.5;
    g += (lateC[1] - g) * lw * 0.5;
    b += (lateC[2] - b) * lw * 0.5;
    // Cubical checking where rot is advanced, long checks elsewhere
    const edge = cells.f2[i] - cells.f1[i];
    const cube = (1 - smoothstep(0.02, 0.08, edge)) * rt;
    const ck = Math.max(cube, smoothstep(0.9, 0.97, check[i]));
    const wt = smoothstep(0.55, 0.75, wet[i]);
    const md = smoothstep(0.62, 0.8, mould[i]) * (1 - wt) * smoothstep(0.3, 0.6, rot[i]);
    r += (mouldC[0] * (0.7 + 0.3 * px[i]) - r) * md * 0.7;
    g += (mouldC[1] * (0.7 + 0.3 * px[i]) - g) * md * 0.7;
    b += (mouldC[2] * (0.7 + 0.3 * px[i]) - b) * md * 0.7;
    r += (wetC[0] - r) * wt * 0.6;
    g += (wetC[1] - g) * wt * 0.6;
    b += (wetC[2] - b) * wt * 0.6;
    const dk = 1 - ck * 0.8;
    s.set(i, r * dk, g * dk, b * dk);
    s.hgt[i] = lw * 0.35 + fiber[i] * 0.15 - eros[i] * 0.8 * rt - ck * 0.7 + md * 0.1 + px[i] * 0.04;
    s.rgh[i] = 0.88 - wt * 0.5 + md * 0.08 + (fiber[i] - 0.5) * 0.08;
  }
  return surfTextures(s, { normal: 3.2 });
}

