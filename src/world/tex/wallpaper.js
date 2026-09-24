import { TAU, makeRng, rgb, smoothstep, fbm, grain, blur, softBlur, byteChannel, maskCtx, readChannel, readBytes, wrapDraw, stampSegment, Surf, surfTextures, hashString } from './core.js';

// Faded Victorian damask. The texture is 1.2 m wide (one tile) and 3.6 m
// tall (texture.repeat.y = 1/3) so the grime at the bottom edge only appears
// once, at floor level (v = 0 at world y = 0), with candle soot toward the
// ceiling. Two 0.6 m strips per tile, butted at visible seams.

const PPM = 512 / 1.2; // pixels per metre
const CELL_W = 128; // motif repeat: 0.3 x 0.45 m, half-drop
const CELL_H = 192;

let motif = null;

function dot(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

// Pointed leaf from (x, y) along angle ang.
function leaf(c, x, y, len, wid, ang) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.25, -wid, len * 0.7, -wid * 0.8, len, 0);
  c.bezierCurveTo(len * 0.7, wid * 0.8, len * 0.25, wid, 0, 0);
  c.fill();
  c.restore();
}

// Tapered stroke along a cubic bezier (stamped discs).
function taper(c, p, w0, w1, steps = 48) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6];
    const y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7];
    dot(c, x, y, (w0 + (w1 - w0) * t) * 0.5);
  }
}

// Curling scroll end.
function spiral(c, cx, cy, r0, a0, turns, w0, dir = 1) {
  const steps = Math.round(70 * turns);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + dir * t * turns * TAU;
    const r = r0 * (1 - 0.75 * t);
    dot(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, w0 * (1 - 0.55 * t) * 0.5);
  }
}

// Right half of the motif, centred on (0, 0), y down. Mirrored for the left.
function motifHalf(c) {
  // Ogee medallion outline
  taper(c, [0, -58, 6, -44, 27, -34, 28, -8], 4, 5.5);
  taper(c, [28, -8, 29, 14, 14, 26, 0, 40], 5.5, 3.5);
  // Flower inside the medallion
  leaf(c, 0, 26, 56, 8, -Math.PI / 2);
  leaf(c, 1, 12, 22, 5.5, -0.85);
  leaf(c, 1, 22, 15, 4, -0.2);
  dot(c, 0, 31, 3.2);
  dot(c, 14, -30, 1.8);
  // Finial above the medallion (fleur-de-lis)
  leaf(c, 0, -60, 28, 6.5, -Math.PI / 2);
  taper(c, [1, -62, 9, -72, 21, -70, 21, -60], 4.2, 2.4);
  spiral(c, 17.5, -60, 3.6, -0.3, 0.85, 2.3, 1);
  dot(c, 9, -86, 1.8);
  // Side scroll sweeping out from the belly
  taper(c, [27, 2, 42, 2, 54, -12, 49, -28], 5.5, 3);
  spiral(c, 44.5, -27, 5, 0.2, 1.05, 3, -1);
  leaf(c, 31, 5, 19, 5.5, 0.55);
  leaf(c, 51, -12, 15, 4.5, -1.35);
  leaf(c, 38, -3, 13, 3.5, -2.2);
  // Lower sweep and tail
  taper(c, [4, 40, 20, 42, 42, 36, 52, 52], 4.8, 2.4);
  spiral(c, 47.5, 56, 4.4, -1.4, 0.9, 2.4, 1);
  leaf(c, 0, 42, 32, 5.5, Math.PI / 2);
  leaf(c, 1, 60, 16, 4, 0.95);
  leaf(c, 24, 42, 12, 3.5, -0.9);
  dot(c, 36, -46, 2.4);
  dot(c, 57, 28, 2);
  dot(c, 25, 64, 1.8);
}

function motifAt(c, x, y) {
  c.save();
  c.translate(x, y);
  motifHalf(c);
  c.scale(-1, 1);
  motifHalf(c);
  c.restore();
}

// One 128 x 192 pattern cell (motif in the centre and at the corners, i.e. a
// half-drop), as hard and softened coverage.
function motifCell() {
  if (motif) return motif;
  const ctx = maskCtx(CELL_W, CELL_H);
  ctx.fillStyle = '#fff';
  motifAt(ctx, CELL_W / 2, CELL_H / 2);
  wrapDraw(ctx, CELL_W, CELL_H, (c) => motifAt(c, 0, 0), [-60, -90, 60, 90]);
  const hard = readChannel(ctx, 0);
  motif = { hard, soft: blur(hard, CELL_W, CELL_H, 1, 2) };
  return motif;
}

// Plain wallpaper, 512 x 1536 (1.2 x 3.6 m).
function wallpaperSurf(seed) {
  const w = 512;
  const h = 1536;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const { hard, soft } = motifCell();

  // Two strips; the second is hung a few px out of register.
  const stripOff = [0, CELL_H * 8 + Math.round((rng() - 0.5) * 8)];
  const seamD = new Float32Array(w);
  const seamI = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    const sx = (x % 256) + 0.5;
    seamD[x] = sx < 128 ? sx : 256 - sx;
    seamI[x] = x >= 128 && x < 384 ? 1 : 0;
  }
  // Where each seam has opened up a little (per row).
  const open = [0, 1].map(() => {
    const a = new Float32Array(h);
    const runs = 1 + Math.floor(rng() * 2.5);
    for (let r = 0; r < runs; r++) {
      const y0 = Math.floor(rng() * h);
      const len = 60 + Math.floor(rng() * 260);
      for (let y = 0; y < len; y++) {
        const k = (y0 + y) % h;
        a[k] = Math.max(a[k], Math.sin((Math.PI * y) / len) ** 0.6);
      }
    }
    return a;
  });

  // Scuffs along the floor and a few scratches exposing the backing paper.
  const scuff = new Float32Array(w * h);
  const scratch = new Float32Array(w * h);
  for (let i = 0; i < 70; i++) {
    const x = rng() * w;
    const y = h - (0.12 + Math.pow(rng(), 1.6) * 0.45) * PPM;
    const len = 8 + rng() * 40;
    const a = (rng() - 0.5) * 0.5;
    stampSegment(scuff, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.6 + rng() * 1.6, 0.25 + rng() * 0.6);
  }
  for (let i = 0; i < 40; i++) {
    const x = rng() * w;
    const y = h - (0.3 + rng() * 2.2) * PPM;
    const len = 10 + rng() * 60;
    const a = rng() * TAU;
    stampSegment(scratch, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.4 + rng() * 0.5, 0.25 + rng() * 0.5);
  }

  const paper = grain(w, h, seed + 1);
  const blot = fbm(w, h, { fx: 3, fy: 9, octaves: 4, seed: seed + 2 });
  const fade = fbm(w, h, { fx: 2, fy: 5, octaves: 3, seed: seed + 3 });
  const stain = fbm(w, h, { fx: 4, fy: 12, octaves: 4, seed: seed + 4 });
  const streak = fbm(w, h, { fx: 56, fy: 3, octaves: 3, seed: seed + 5 });
  const cluster = fbm(w, h, { fx: 5, fy: 6, octaves: 2, seed: seed + 6 });
  const bubble = fbm(w, h, { fx: 5, fy: 15, octaves: 3, seed: seed + 7 });
  const dirt = fbm(512, 512, { fx: 24, octaves: 2, seed: seed + 8 });

  const [br, bg, bb] = rgb('#4a3f2a');
  const [ir, ig, ib] = rgb('#6e5e3d');
  const faded = rgb('#62583f');
  const tide = rgb('#2c2214');
  const damp = rgb('#3d3220');
  const grime = rgb('#17120c');
  const backing = rgb('#8a7c5e');

  for (let y = 0; y < h; y++) {
    const yM = (h - 1 - y) / PPM; // metres above the floor
    const bottom = 1 - smoothstep(0, 0.34, yM);
    const soot = smoothstep(2.2, 3.15, yM);
    const drip = smoothstep(1.0, 2.3, yM) * (1 - smoothstep(3.2, 3.5, yM));
    const stainBias = 0.2 * smoothstep(1.7, 3.0, yM) - 0.04;
    const o0 = ((y + stripOff[0]) % CELL_H) * CELL_W;
    const o1 = ((y + stripOff[1]) % CELL_H) * CELL_W;
    const drow = (y & 511) << 9;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ci = (x < 256 ? o0 : o1) + (x & 127);
      // Damask: contrast drops where the paper has faded.
      const fd = fade[i];
      const contrast = 0.55 + 0.45 * smoothstep(0.25, 0.75, fd);
      const m = hard[ci] * contrast;
      let r = br + (ir - br) * m;
      let g = bg + (ig - bg) * m;
      let b = bb + (ib - bb) * m;
      if (fd > 0.55) {
        const fz = smoothstep(0.55, 0.95, fd) * 0.5;
        r += (faded[0] - r) * fz;
        g += (faded[1] - g) * fz;
        b += (faded[2] - b) * fz;
      }
      // Large blotches and paper grain
      let v = 0.86 + 0.26 * blot[i] + (paper[i] - 0.5) * 0.06;
      if (soot > 0) v *= 1 - soot * (0.28 + 0.2 * blot[i]);
      let rough = 0.8 - m * 0.2 + (paper[i] - 0.5) * 0.06;
      let hh = paper[i] * 0.08 + soft[ci] * 0.4 * contrast + bubble[i] * 1.6;

      // Water stains with tide marks, drips below them
      const sv = stain[i] + stainBias;
      if (sv > 0.64) {
        const inside = smoothstep(0.66, 0.7, sv);
        let ring = 0;
        if (sv < 0.76) {
          const e1 = (sv - 0.672) / 0.008;
          const e2 = (sv - 0.72) / 0.007;
          ring = Math.exp(-e1 * e1) + 0.6 * Math.exp(-e2 * e2) * inside;
        }
        const ki = inside * 0.45;
        r += (damp[0] - r) * ki;
        g += (damp[1] - g) * ki;
        b += (damp[2] - b) * ki;
        const kr = ring * 0.55;
        r += (tide[0] - r) * kr;
        g += (tide[1] - g) * kr;
        b += (tide[2] - b) * kr;
        rough += inside * 0.06;
        hh -= ring * 0.05;
      }
      if (drip > 0 && streak[i] > 0.62) v *= 1 - smoothstep(0.62, 0.85, streak[i]) * drip * smoothstep(0.45, 0.75, cluster[i]) * 0.35;
      r *= v;
      g *= v;
      b *= v;

      // Grime and scuffs along the floor
      if (bottom > 0 || scuff[i] > 0) {
        const gr = Math.min(1, bottom * bottom * (0.55 + 0.9 * dirt[drow | (x & 511)]) + scuff[i] * 0.7 * (0.4 + bottom));
        r += (grime[0] - r) * gr;
        g += (grime[1] - g) * gr;
        b += (grime[2] - b) * gr;
        rough += gr * 0.12;
      }
      // Scratches show the lighter backing paper
      const sc = scratch[i];
      if (sc > 0) {
        const k = sc * 0.6;
        r += (backing[0] - r) * k;
        g += (backing[1] - g) * k;
        b += (backing[2] - b) * k;
        rough += k * 0.1;
        hh -= sc * 0.2;
      }
      // Seam: dark gap with a lifted, lighter lip
      const d = seamD[x];
      if (d < 9) {
        const op = open[seamI[x]][y];
        const gapW = 0.7 + op * 2.2;
        const gap = 1 - smoothstep(gapW - 0.6, gapW + 0.6, d);
        const e = d - gapW - 1.5;
        const lip = Math.exp(-(e * e) / 3) * (0.4 + op);
        const dk = 1 - gap * 0.75;
        r = (r + backing[0] * lip * 0.12) * dk;
        g = (g + backing[1] * lip * 0.12) * dk;
        b = (b + backing[2] * lip * 0.12) * dk;
        hh += lip * 0.5 - gap * 0.6;
        rough += gap * 0.15;
      }
      s.set(i, r, g, b);
      s.hgt[i] = hh;
      s.rgh[i] = rough;
    }
  }
  return s;
}

// The plain wallpaper surface is shared with wallpaperTorn (kept until both
// have taken it).
let baseSurf = null;
const baseTaken = new Set();
function base(who) {
  if (!baseSurf) {
    baseSurf = wallpaperSurf(hashString('wallpaper'));
    baseTaken.clear();
  }
  const b = baseSurf;
  baseTaken.add(who);
  if (baseTaken.size >= 2) baseSurf = null;
  return b;
}

// wallpaperTorn only reads the shared base, so its pixels can back this texture.
export function genWallpaper() {
  return surfTextures(base('plain'), { normal: 1.5, texRepeat: [1, 1 / 3] });
}

// Torn wallpaper: 2.4 m x 3.6 m (two copies of the plain paper) so tears
// repeat less. Holes show plaster and, in the deeper ones, the lath behind
// it. One dark smeared handprint.
export function genWallpaperTorn(seed) {
  const w = 1024;
  const h = 1536;
  const b = base('torn');
  const s = new Surf(w, h);
  for (let y = 0; y < h; y++) {
    const src = y * 512;
    for (let k = 0; k < 2; k++) {
      const dst = y * w + k * 512;
      s.col.set(b.col.subarray(src * 4, (src + 512) * 4), dst * 4);
      s.hgt.set(b.hgt.subarray(src, src + 512), dst);
      s.rgh.set(b.rgh.subarray(src, src + 512), dst);
    }
  }
  const rng = makeRng(seed + 99);

  // Tears: r = paper missing, b = plaster gone (lath); the edge is softened in JS.
  const tears = [];
  for (let t = 0; t < 7; t++) {
    const big = t < 3;
    const rx = (big ? 0.12 + rng() * 0.16 : 0.04 + rng() * 0.08) * PPM;
    tears.push({ cx: rng() * w, cy: h - (0.25 + rng() * 2.5) * PPM, rx, ry: rx * (0.8 + rng() * 0.9), lath: big && rng() < 0.85 });
  }
  // A strip peeling down beside a seam
  tears.push({ cx: 256 * (1 + Math.floor(rng() * 3)) + 30, cy: h - (1.6 + rng() * 0.8) * PPM, rx: 0.07 * PPM, ry: 0.45 * PPM, lath: false });
  const ctx = maskCtx(w, h);
  ctx.globalCompositeOperation = 'lighten';
  for (const t of tears) {
    const bb = [t.cx - t.rx * 1.6 - 12, t.cy - t.ry * 1.6 - 12, t.cx + t.rx * 1.6 + 12, t.cy + t.ry * 1.6 + 12];
    const outer = blobPoints(rng, t.cx, t.cy, t.rx, t.ry, 0.22);
    ctx.fillStyle = '#f00';
    wrapDraw(ctx, w, h, (c) => fillPoly(c, outer), bb);
    if (t.lath) {
      const inner = blobPoints(rng, t.cx, t.cy, t.rx * 0.62, t.ry * 0.62, 0.3);
      ctx.fillStyle = '#00f';
      wrapDraw(ctx, w, h, (c) => fillPoly(c, inner), bb);
    }
  }
  const mask = readBytes(ctx);
  const tearSoft = softBlur(byteChannel(mask, 0), w, h, 4);

  // Detail noise only matters inside tears: reuse cached 512 px fields.
  const plasterN = fbm(512, 512, { fx: 8, octaves: 4, seed: seed + 11 });
  const fine = grain(512, 512, seed + 12);
  const wood = fbm(512, 512, { fx: 2, fy: 32, octaves: 3, seed: seed + 13 });

  const plaster = rgb('#6f6758');
  const lath = rgb('#3e2f20');
  const edge = rgb('#9a8d70');
  const lathPitch = 0.05 * PPM;
  const lathOff = rng() * lathPitch;
  const i255 = 1 / 255;

  for (let y = 0; y < h; y++) {
    const ly = ((y + lathOff) % lathPitch) / lathPitch; // 0..1 across one lath + gap
    const onLath = smoothstep(0.02, 0.1, ly) * (1 - smoothstep(0.66, 0.74, ly));
    const lathRound = Math.sin(Math.PI * Math.min(1, ly / 0.72));
    const trow = (y & 511) << 9;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = i * 4;
      const ts = tearSoft[i];
      const t = mask[k] * i255;
      if (ts === 0 && t === 0) continue;
      const j = trow | (x & 511);
      let r = s.col[k] * i255;
      let g = s.col[k + 1] * i255;
      let bl = s.col[k + 2] * i255;
      let hh = s.hgt[i];
      let rr = s.rgh[i];
      // Lifted torn edge on the paper side: pale fibrous core
      const rim = smoothstep(0.06, 0.4, ts) * (1 - t);
      if (rim > 0) {
        const e = rim * (0.55 + 0.45 * fine[j]) * 0.7;
        r += (edge[0] - r) * e;
        g += (edge[1] - g) * e;
        bl += (edge[2] - bl) * e;
        hh += rim * 0.9;
      }
      if (t > 0) {
        // Plaster under the paper, shadowed near the edge
        const ao = 0.55 + 0.45 * smoothstep(0.55, 0.98, ts);
        const pv = (0.78 + 0.4 * plasterN[j] + (fine[j] - 0.5) * 0.15) * ao;
        let pr = plaster[0] * pv;
        let pg = plaster[1] * pv;
        let pb = plaster[2] * pv;
        let ph = -0.6 + plasterN[j] * 0.5 + fine[j] * 0.15;
        let prr = 0.93;
        const lm = mask[k + 2] * i255;
        if (lm > 0) {
          // Lath strips with dark voids between them, plaster keys oozing out
          const key = smoothstep(0.55, 0.8, plasterN[j]) * (1 - onLath);
          const wv = (0.7 + 0.5 * wood[j]) * (0.5 + 0.5 * lathRound) * ao;
          let lr = lath[0] * wv * onLath + 0.02 * (1 - onLath);
          let lg = lath[1] * wv * onLath + 0.015 * (1 - onLath);
          let lb = lath[2] * wv * onLath + 0.01 * (1 - onLath);
          lr += (plaster[0] * 0.6 - lr) * key;
          lg += (plaster[1] * 0.6 - lg) * key;
          lb += (plaster[2] * 0.6 - lb) * key;
          pr += (lr - pr) * lm;
          pg += (lg - pg) * lm;
          pb += (lb - pb) * lm;
          ph += (-1.4 + onLath * lathRound * 0.7 + key * 0.4 - ph) * lm;
          prr += (0.88 - prr) * lm;
        }
        r += (pr - r) * t;
        g += (pg - g) * t;
        bl += (pb - bl) * t;
        hh += (ph - hh) * t;
        rr += (prr - rr) * t;
      }
      s.set(i, r, g, bl);
      s.hgt[i] = hh;
      s.rgh[i] = rr;
    }
  }

  // Dark smeared handprint in dried blood, painted on a small canvas.
  const size = 0.1 * PPM;
  const hw = Math.ceil(size * 4);
  const hh = Math.ceil(size * 6);
  const hctx = maskCtx(hw, hh);
  drawHand(hctx, hw, hh, hw / 2, size * 1.6, size, rng, { channel: '#fff', wrap: false });
  const hand = readBytes(hctx);
  const blood = fbm(512, 512, { fx: 32, octaves: 3, seed: seed + 14 });
  const hx = Math.floor(rng() * w);
  const hy = Math.floor(h - (1.35 + rng() * 0.3) * PPM - size * 1.6);
  const dried = rgb('#2a0806');
  for (let y = 0; y < hh; y++) {
    const py = (((hy + y) % h) + h) % h;
    for (let x = 0; x < hw; x++) {
      const a = hand[(y * hw + x) * 4] * i255;
      if (a === 0) continue;
      const px = (hx + x) % w;
      const i = py * w + px;
      const k = i * 4;
      const hp = a * (0.55 + 0.45 * smoothstep(0.25, 0.7, blood[((py & 511) << 9) | (px & 511)])) * 0.9;
      const r0 = s.col[k] * i255;
      const g0 = s.col[k + 1] * i255;
      const b0 = s.col[k + 2] * i255;
      s.set(i, r0 + (dried[0] - r0) * hp, g0 + (dried[1] - g0) * hp, b0 + (dried[2] - b0) * hp);
      s.hgt[i] += a * 0.1;
      s.rgh[i] += (0.5 - s.rgh[i]) * hp;
    }
  }
  return surfTextures(s, { normal: 1.6, texRepeat: [0.5, 1 / 3] });
}

// Irregular torn/jagged blob outline (points precomputed so every wrap copy matches).
export function blobPoints(rng, cx, cy, rx, ry, jag, count = 72) {
  const pts = [];
  const ph = rng() * 10;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * TAU;
    const wob = 1 + 0.22 * Math.sin(a * 3 + ph) + 0.12 * Math.sin(a * 5 + ph * 2) + jag * (rng() - 0.5);
    pts.push(cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob);
  }
  return pts;
}

export function fillPoly(c, pts) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]);
  c.closePath();
  c.fill();
}

// Palm, fingers and thumb, smeared downward, drawn with 'lighten' into
// `channel` so other mask channels are untouched. wrap: repeat across edges.
export function drawHand(ctx, w, h, x, y, size, rng, { smear = 1, channel = '#00f', spread = 0.12, flip = false, wrap = true } = {}) {
  const fingers = [
    [-0.33, -0.05, 0.62, -0.22],
    [-0.11, -0.12, 0.78, -0.06],
    [0.12, -0.1, 0.74, 0.07],
    [0.32, -0.02, 0.58, 0.2],
  ].map(([fx, fy, len, ang]) => [fx, fy, len, ang + (rng() - 0.5) * spread]);
  const shape = (c, ox, oy, sc) => {
    c.save();
    c.translate(ox, oy);
    c.scale(flip ? -sc : sc, sc);
    c.beginPath();
    c.ellipse(0, size * 0.55, size * 0.42, size * 0.5, 0, 0, TAU);
    c.fill();
    for (const [fx, fy, len, ang] of fingers) {
      c.save();
      c.translate(fx * size, fy * size + size * 0.2);
      c.rotate(ang);
      c.beginPath();
      c.ellipse(0, -len * size * 0.5, size * 0.1, len * size * 0.52, 0, 0, TAU);
      c.fill();
      c.restore();
    }
    c.save();
    c.translate(-size * 0.4, size * 0.62);
    c.rotate(-0.95);
    c.beginPath();
    c.ellipse(0, -size * 0.3, size * 0.12, size * 0.34, 0, 0, TAU);
    c.fill();
    c.restore();
    c.restore();
  };
  const draw = wrap ? (fn, bb) => wrapDraw(ctx, w, h, fn, bb) : (fn) => fn(ctx);
  const bb = [x - size * 2, y - size * 2, x + size * 2, y + size * 4];
  ctx.globalCompositeOperation = 'lighten';
  const [cr, cg, cb] = rgb(channel).map((v) => Math.round(v * 255));
  // Smear: fading copies dragged down
  for (let k = 12; k >= 1; k--) {
    const a = (1 - k / 13) * 0.35 * smear;
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
    draw((c) => shape(c, x + k * 0.4, y + k * size * 0.09 * smear, 1 - k * 0.01), bb);
  }
  ctx.fillStyle = `rgba(${cr},${cg},${cb},0.95)`;
  draw((c) => shape(c, x, y, 1), bb);
  // Finger drags
  ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.5)`;
  ctx.lineCap = 'round';
  for (let f = 0; f < 4; f++) {
    const fx = x + (flip ? -1 : 1) * (-0.33 + f * 0.22) * size;
    const len = size * (0.6 + rng() * 1.4) * smear;
    const lw = size * (0.1 + rng() * 0.06);
    const mx = fx + (rng() - 0.5) * size * 0.2;
    const ex = fx + (rng() - 0.5) * size * 0.3;
    ctx.lineWidth = lw;
    draw((c) => {
      c.beginPath();
      c.moveTo(fx, y - size * 0.3);
      c.quadraticCurveTo(mx, y + len * 0.5, ex, y + len);
      c.stroke();
    }, bb);
  }
  ctx.globalCompositeOperation = 'source-over';
}
