import * as THREE from 'three';
import { makeRng } from '../../core/rng.js';

// Low-level toolkit for procedural textures. Everything works on flat typed
// arrays (row 0 = top of the image, like a canvas) and wraps around at the
// edges so results tile seamlessly.

export { makeRng };
export const TAU = Math.PI * 2;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, v) {
  let t = (v - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

// '#4a3f2a' | 0x4a3f2a -> [r, g, b] in 0..1 (sRGB).
export function rgb(c) {
  const n = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- Noise ----------

// Tileable gradient-noise fBm. fx/fy = lattice cells across the tile on each
// axis (integers, so the field wraps). Returns 0..1 (min/max normalised).
// kind: 'fbm' | 'turb' (billowy |n|) | 'ridge' (sharp crests: veins, cracks).
//
// Fields are memoised per spec and size; the seed only picks a wrap-around
// offset into the cached field, so materials that share a spec pay for it
// once (a shifted copy is a row-wise memcpy).
const noiseCache = new Map();
let noiseBytes = 0;
const NOISE_CACHE_LIMIT = 64 * 1048576;

// LRU lookup; make() builds the value (an array or an object of arrays).
function cached(key, make) {
  let v = noiseCache.get(key);
  if (v) {
    noiseCache.delete(key);
  } else {
    v = make();
    noiseBytes += v.byteLength ?? Object.values(v).reduce((a, b) => a + (b.byteLength || 0), 0);
    while (noiseBytes > NOISE_CACHE_LIMIT && noiseCache.size) {
      const [k, old] = noiseCache.entries().next().value;
      noiseCache.delete(k);
      noiseBytes -= old.byteLength ?? Object.values(old).reduce((a, b) => a + (b.byteLength || 0), 0);
    }
  }
  noiseCache.set(key, v);
  return v;
}

const offX = (seed, w) => Math.floor(hash01(seed, 11) * w);
const offY = (seed, h) => Math.floor(hash01(seed, 23) * h);

export function fbm(w, h, { fx = 4, fy = fx, octaves = 4, gain = 0.5, lac = 2, seed = 1, kind = 'fbm' } = {}) {
  const key = `${w}x${h}|${fx}|${fy}|${octaves}|${gain}|${lac}|${kind}`;
  const base = cached(key, () => fbmRaw(w, h, fx, fy, octaves, gain, lac, hashString(key), kind));
  return shifted(base, w, h, offX(seed, w), offY(seed, h));
}

// Drop memoised noise (e.g. after a loading screen has generated everything).
export function clearNoiseCache() {
  noiseCache.clear();
  noiseBytes = 0;
}

// Copy of src rolled by (ox, oy) with wrap-around.
export function shifted(src, w, h, ox, oy) {
  const out = new src.constructor(w * h);
  for (let y = 0; y < h; y++) {
    const srow = ((y + oy) % h) * w;
    const drow = y * w;
    out.set(src.subarray(srow + ox, srow + w), drow);
    if (ox > 0) out.set(src.subarray(srow, srow + ox), drow + w - ox);
  }
  return out;
}

// Low-frequency fields are computed at reduced resolution (keeping at least
// 8 px per cell of the finest octave) and bilinearly upsampled.
function fbmRaw(w, h, fx, fy, octaves, gain, lac, seed, kind) {
  let octs = 0;
  let cxMax = fx;
  let cyMax = fy;
  for (let o = 0, cxf = fx, cyf = fy; o < octaves; o++, cxf *= lac, cyf *= lac) {
    if (Math.round(cxf) * 2 > w || Math.round(cyf) * 2 > h) break;
    octs++;
    cxMax = Math.round(cxf);
    cyMax = Math.round(cyf);
  }
  let dx = 1;
  let dy = 1;
  while (dx < 8 && w % (dx * 2) === 0 && w / (dx * 2) / cxMax >= 8) dx *= 2;
  while (dy < 8 && h % (dy * 2) === 0 && h / (dy * 2) / cyMax >= 8) dy *= 2;
  const lw = w / dx;
  const lh = h / dy;
  const low = new Float32Array(lw * lh);
  const rng = makeRng(seed);
  const k = kind === 'turb' ? 1 : kind === 'ridge' ? 2 : 0;
  let amp = 1;
  for (let o = 0, cxf = fx, cyf = fy; o < octs; o++, cxf *= lac, cyf *= lac) {
    gradOctave(low, lw, lh, Math.max(1, Math.round(cxf)), Math.max(1, Math.round(cyf)), amp, rng, k);
    amp *= gain;
  }
  normalizeInPlace(low);
  return dx === 1 && dy === 1 ? low : upsample(low, lw, lh, dx, dy);
}

// Bilinear upsample with wrap-around by integer factors.
export function upsample(src, lw, lh, dx, dy) {
  const w = lw * dx;
  const h = lh * dy;
  const out = new Float32Array(w * h);
  const x0 = new Int32Array(w);
  const x1 = new Int32Array(w);
  const tx = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const f = x / dx;
    const i = f | 0;
    x0[x] = i;
    x1[x] = i + 1 === lw ? 0 : i + 1;
    tx[x] = f - i;
  }
  for (let y = 0; y < h; y++) {
    const f = y / dy;
    const j = f | 0;
    const ty = f - j;
    const r0 = j * lw;
    const r1 = (j + 1 === lh ? 0 : j + 1) * lw;
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const a = src[r0 + x0[x]];
      const b = src[r0 + x1[x]];
      const top = a + (b - a) * tx[x];
      const c = src[r1 + x0[x]];
      const d = src[r1 + x1[x]];
      const bot = c + (d - c) * tx[x];
      out[o + x] = top + (bot - top) * ty;
    }
  }
  return out;
}

// Per-pixel white noise 0..1, optionally softened (paper grain, grit, pores).
export function grain(w, h, seed = 1, soften = 0) {
  const base = cached(`grain|${w}x${h}|${soften}`, () => grainRaw(w, h, 777, soften));
  return shifted(base, w, h, offX(seed, w), offY(seed, h));
}

function grainRaw(w, h, seed, soften) {
  // Softened grain at large sizes: make it at half size and upsample.
  if (soften > 0 && w >= 1024 && w % 2 === 0 && h % 2 === 0) return upsample(grainRaw(w / 2, h / 2, seed, soften), w / 2, h / 2, 2, 2);
  const out = new Float32Array(w * h);
  let s = (seed * 0x9e3779b1) >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return soften > 0 ? normalizeInPlace(blur(out, w, h, soften, 1)) : out;
}

// Sample a field made for another size with wrap (nearest texel), e.g. to
// reuse cached 512 px noise inside a larger texture.
export function tileField(src, sw, sh, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const srow = (y % sh) * sw;
    for (let x = 0; x < w; x += sw) out.set(src.subarray(srow, srow + Math.min(sw, w - x)), y * w + x);
  }
  return out;
}

// One octave of periodic Perlin noise. Separable trick: the x-interpolation
// of each lattice row is computed once per row, so the per-pixel cost is a
// handful of multiply-adds.
function gradOctave(out, w, h, cx, cy, amp, rng, kind) {
  const n = cx * cy;
  const gxs = new Float32Array(n);
  const gys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    gxs[i] = Math.cos(a);
    gys[i] = Math.sin(a);
  }
  const i0 = new Int32Array(w);
  const i1 = new Int32Array(w);
  const tx = new Float32Array(w);
  const ux = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const f = (x * cx) / w;
    const i = Math.floor(f);
    const t = f - i;
    i0[x] = i % cx;
    i1[x] = (i + 1) % cx;
    tx[x] = t;
    ux[x] = t * t * t * (t * (t * 6 - 15) + 10);
  }
  const A = new Float32Array(cy * w);
  const B = new Float32Array(cy * w);
  for (let j = 0; j < cy; j++) {
    const row = j * cx;
    const o = j * w;
    for (let x = 0; x < w; x++) {
      const a = row + i0[x];
      const b = row + i1[x];
      const t = tx[x];
      const u = ux[x];
      const na = gxs[a] * t;
      const nb = gxs[b] * (t - 1);
      A[o + x] = na + (nb - na) * u;
      B[o + x] = gys[a] + (gys[b] - gys[a]) * u;
    }
  }
  for (let y = 0; y < h; y++) {
    const f = (y * cy) / h;
    const j = Math.floor(f);
    const t = f - j;
    const v = t * t * t * (t * (t * 6 - 15) + 10);
    const o0 = (j % cy) * w;
    const o1 = ((j + 1) % cy) * w;
    const t1 = t - 1;
    const base = y * w;
    if (kind === 0) {
      for (let x = 0; x < w; x++) {
        const bot = A[o0 + x] + B[o0 + x] * t;
        const top = A[o1 + x] + B[o1 + x] * t1;
        out[base + x] += (bot + (top - bot) * v) * amp;
      }
    } else if (kind === 1) {
      for (let x = 0; x < w; x++) {
        const bot = A[o0 + x] + B[o0 + x] * t;
        const top = A[o1 + x] + B[o1 + x] * t1;
        const val = bot + (top - bot) * v;
        out[base + x] += (val < 0 ? -val : val) * amp;
      }
    } else {
      for (let x = 0; x < w; x++) {
        const bot = A[o0 + x] + B[o0 + x] * t;
        const top = A[o1 + x] + B[o1 + x] * t1;
        let val = bot + (top - bot) * v;
        val = 1 - (val < 0 ? -val : val) * 1.41;
        out[base + x] += val * val * amp;
      }
    }
  }
}

export function normalizeInPlace(f) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < f.length; i++) {
    const v = f[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const s = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * s;
  return f;
}

// Tileable cellular (Worley) noise. Distances are in cell units.
// Returns { f1, f2, id } where id is the nearest feature's cell index.
export function worley(w, h, { cx = 8, cy = cx, seed = 1, jitter = 0.9 } = {}) {
  const key = `worley|${w}x${h}|${cx}|${cy}|${jitter}`;
  const base = cached(key, () => worleyRaw(w, h, cx, cy, hashString(key), jitter));
  const ox = offX(seed, w);
  const oy = offY(seed, h);
  return { f1: shifted(base.f1, w, h, ox, oy), f2: shifted(base.f2, w, h, ox, oy), id: shifted(base.id, w, h, ox, oy), count: cx * cy };
}

function worleyRaw(w, h, cx, cy, seed, jitter) {
  const rng = makeRng(seed);
  const n = cx * cy;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = 0.5 + (rng() - 0.5) * jitter;
    py[i] = 0.5 + (rng() - 0.5) * jitter;
  }
  const f1 = new Float32Array(w * h);
  const f2 = new Float32Array(w * h);
  const id = new Int32Array(w * h);
  const sx = cx / w;
  const sy = cy / h;
  for (let y = 0; y < h; y++) {
    const fy = y * sy;
    const cj = fy | 0;
    for (let x = 0; x < w; x++) {
      const fx = x * sx;
      const ci = fx | 0;
      let d1 = 1e9;
      let d2 = 1e9;
      let best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = cj + dj;
        const wy = jj < 0 ? jj + cy : jj >= cy ? jj - cy : jj;
        for (let di = -1; di <= 1; di++) {
          const ii = ci + di;
          const wx = ii < 0 ? ii + cx : ii >= cx ? ii - cx : ii;
          const k = wy * cx + wx;
          const dx = ii + px[k] - fx;
          const dy = jj + py[k] - fy;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = k;
          } else if (d < d2) d2 = d;
        }
      }
      const i = y * w + x;
      f1[i] = Math.sqrt(d1);
      f2[i] = Math.sqrt(d2);
      id[i] = best;
    }
  }
  return { f1, f2, id };
}

// Cheap integer hash -> 0..1 (per-cell / per-plank random values).
export function hash01(n, seed = 0) {
  let h = Math.imul((n | 0) ^ Math.imul(seed | 0, 0x27d4eb2d), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ---------- Field operations ----------

// Separable box blur with wrap-around; 2-3 passes approximate a Gaussian.
export function blur(src, w, h, radius, passes = 2) {
  const r = Math.max(1, Math.round(radius));
  const a = Float32Array.from(src);
  const tmp = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[o + (((k % w) + w) % w)];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s * inv;
        let ad = x + r + 1;
        let sb = x - r;
        if (ad >= w) ad -= w;
        if (sb < 0) sb += w;
        s += a[o + ad] - a[o + sb];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[(((k % h) + h) % h) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s * inv;
        let ad = y + r + 1;
        let sb = y - r;
        if (ad >= h) ad -= h;
        if (sb < 0) sb += h;
        s += tmp[ad * w + x] - tmp[sb * w + x];
      }
    }
  }
  return a;
}

// Bilinear sample with wrap-around (x, y in pixels).
export function sample(f, w, h, x, y) {
  x -= Math.floor(x / w) * w;
  y -= Math.floor(y / h) * h;
  let x0 = x | 0;
  let y0 = y | 0;
  const tx = x - x0;
  const ty = y - y0;
  if (x0 >= w) x0 -= w;
  if (y0 >= h) y0 -= h;
  const x1 = x0 + 1 === w ? 0 : x0 + 1;
  const y1 = y0 + 1 === h ? 0 : y0 + 1;
  const r0 = y0 * w;
  const r1 = y1 * w;
  const a = f[r0 + x0];
  const b = f[r0 + x1];
  const c = f[r1 + x0];
  const d = f[r1 + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

// Domain warp: out(x, y) = src(x + (wx - 0.5) * amt, y + (wy - 0.5) * amt).
export function warp(src, w, h, wx, wy, amt) {
  const out = new Float32Array(w * h);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) out[i] = sample(src, w, h, x + (wx[i] - 0.5) * amt, y + (wy[i] - 0.5) * amt);
  }
  return out;
}

// ---------- Stamps (drawn straight into fields, wrap-aware) ----------

// Anti-aliased capsule from (ax, ay) to (bx, by) with radius r; writes
// max(f, v * coverage). soft > 0 gives a rounded (dome) profile instead.
export function stampSegment(f, w, h, ax, ay, bx, by, r, v = 1, soft = 0) {
  const x0 = Math.floor(Math.min(ax, bx) - r - 1);
  const x1 = Math.ceil(Math.max(ax, bx) + r + 1);
  const y0 = Math.floor(Math.min(ay, by) - r - 1);
  const y1 = Math.ceil(Math.max(ay, by) + r + 1);
  const dx = bx - ax;
  const dy = by - ay;
  const ll = dx * dx + dy * dy || 1e-6;
  for (let y = y0; y <= y1; y++) {
    const row = (((y % h) + h) % h) * w;
    const py = y + 0.5 - ay;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax;
      let t = (px * dx + py * dy) / ll;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - dx * t;
      const ey = py - dy * t;
      const d = Math.sqrt(ex * ex + ey * ey);
      let c;
      if (soft > 0) {
        c = 1 - d / r;
        if (c <= 0) continue;
        c = Math.sqrt(c);
      } else {
        c = r + 0.5 - d;
        if (c <= 0) continue;
        if (c > 1) c = 1;
      }
      const i = row + (((x % w) + w) % w);
      const val = c * v;
      if (val > f[i]) f[i] = val;
    }
  }
}

// Disc of radius r at (cx, cy). soft: 0 = hard AA edge, 1 = dome profile.
export function stampDisc(f, w, h, cx, cy, r, v = 1, soft = 0) {
  stampSegment(f, w, h, cx, cy, cx, cy, r, v, soft);
}

// ---------- Canvas masks ----------

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Black canvas for painting masks. GPU-backed by default: strokes (and the
// 'lighten' blend used to keep channels separate) rasterise far faster there,
// and each mask is read back once.
export function maskCtx(w, h, { cpu = false } = {}) {
  const ctx = makeCanvas(w, h).getContext('2d', { willReadFrequently: cpu });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  return ctx;
}

// Raw RGBA bytes of a mask canvas (index i * 4 + channel).
export function readBytes(ctx) {
  const { width: w, height: h } = ctx.canvas;
  return ctx.getImageData(0, 0, w, h).data;
}

// Canvas channel (0 r, 1 g, 2 b, 3 a) -> Float32Array 0..1.
export function readChannel(ctx, ch = 0) {
  const { width: w, height: h } = ctx.canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0, j = ch; i < out.length; i++, j += 4) out[i] = d[j] * (1 / 255);
  return out;
}

export function readChannels(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    r[i] = d[j] * (1 / 255);
    g[i] = d[j + 1] * (1 / 255);
    b[i] = d[j + 2] * (1 / 255);
  }
  return [r, g, b];
}

// Call fn at every wrap offset whose copy can touch the canvas, so shapes that
// cross an edge reappear on the opposite side. bbox = [x0, y0, x1, y1].
export function wrapDraw(ctx, w, h, fn, bbox = null) {
  for (let oy = -h; oy <= h; oy += h) {
    for (let ox = -w; ox <= w; ox += w) {
      if (bbox && (bbox[2] + ox < 0 || bbox[0] + ox > w || bbox[3] + oy < 0 || bbox[1] + oy > h)) continue;
      ctx.save();
      ctx.translate(ox, oy);
      fn(ctx);
      ctx.restore();
    }
  }
}

// Branching random-walk polylines (cracks, veins) on a w x h tile. Walkers
// wrap around the tile; segments near an edge get shifted copies, so one
// stroke per path is seamless. Segments are bucketed by width into
// continuous polylines. Returns [{ width, path, wrap }].
export function branchPaths(rng, roots, o = {}) {
  const { w, h, step = 4, wiggle = 0.35, branch = 0.06, spread = [0.4, 1.1], taper = 0.985, minWidth = 0.6, maxDepth = 4, childScale = 0.6, lenScale = 0.65, curl = 0, margin = 3 } = o;
  const buckets = new Map();
  const seg = (x0, y0, x1, y1, wd) => {
    const key = Math.max(minWidth, Math.round(wd * 2) / 2);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { width: key, path: new Path2D(), wrap: null, lx: NaN, ly: NaN }));
    if (b.lx !== x0 || b.ly !== y0) b.path.moveTo(x0, y0);
    b.path.lineTo(x1, y1);
    b.lx = x1;
    b.ly = y1;
    const m = key * margin + 4;
    const minx = Math.min(x0, x1) - m;
    const maxx = Math.max(x0, x1) + m;
    const miny = Math.min(y0, y1) - m;
    const maxy = Math.max(y0, y1) + m;
    if (minx > 0 && maxx < w && miny > 0 && maxy < h) return;
    for (let oy = -h; oy <= h; oy += h) {
      for (let ox = -w; ox <= w; ox += w) {
        if ((ox === 0 && oy === 0) || maxx + ox < 0 || minx + ox > w || maxy + oy < 0 || miny + oy > h) continue;
        if (!b.wrap) b.wrap = new Path2D();
        b.wrap.moveTo(x0 + ox, y0 + oy);
        b.wrap.lineTo(x1 + ox, y1 + oy);
      }
    }
  };
  const walk = (x, y, ang, wd, len, depth) => {
    const n = Math.max(2, Math.round(len / step));
    let bend = (rng() - 0.5) * curl;
    for (let i = 0; i < n && wd >= minWidth * 0.5; i++) {
      ang += (rng() - 0.5) * wiggle + bend;
      bend *= 0.97;
      let nx = x + Math.cos(ang) * step;
      let ny = y + Math.sin(ang) * step;
      seg(x, y, nx, ny, wd);
      // Keep walkers on the tile (the jump starts a new subpath).
      if (nx < 0) nx += w;
      else if (nx >= w) nx -= w;
      if (ny < 0) ny += h;
      else if (ny >= h) ny -= h;
      x = nx;
      y = ny;
      wd *= taper;
      if (depth < maxDepth && rng() < branch) {
        const side = rng() < 0.5 ? -1 : 1;
        walk(x, y, ang + side * (spread[0] + rng() * (spread[1] - spread[0])), wd * childScale, len * lenScale * (0.5 + rng() * 0.5), depth + 1);
      }
    }
  };
  for (const r of roots) walk(r.x, r.y, r.angle, r.width, r.length, 0);
  return [...buckets.values()].sort((a, b) => b.width - a.width);
}

// Stroke branchPaths output (widths scaled; wrap copies included).
export function strokePaths(ctx, paths, style = '#fff', widthScale = 1, extra = 0) {
  ctx.strokeStyle = style;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const { width, path, wrap } of paths) {
    ctx.lineWidth = width * widthScale + extra;
    ctx.stroke(path);
    if (wrap) ctx.stroke(wrap);
  }
}

// Soft version of a mask: blurred at half resolution, then upsampled.
export function softBlur(src, w, h, radius, passes = 2) {
  if (radius < 3 || w % 2 || h % 2) return blur(src, w, h, radius, passes);
  const lw = w / 2;
  const lh = h / 2;
  const low = new Float32Array(lw * lh);
  for (let y = 0; y < lh; y++) {
    const r0 = 2 * y * w;
    for (let x = 0; x < lw; x++) {
      const i = r0 + 2 * x;
      low[y * lw + x] = (src[i] + src[i + 1] + src[i + w] + src[i + w + 1]) * 0.25;
    }
  }
  return upsample(blur(low, lw, lh, radius / 2, passes), lw, lh, 2, 2);
}

// softBlur of one channel of RGBA canvas bytes (skips the float copy).
export function softBlurBytes(bytes, ch, w, h, radius, passes = 2) {
  if (radius < 3 || w % 2 || h % 2) return blur(byteChannel(bytes, ch), w, h, radius, passes);
  const lw = w / 2;
  const lh = h / 2;
  const low = new Float32Array(lw * lh);
  const k = 0.25 / 255;
  for (let y = 0; y < lh; y++) {
    const r0 = 2 * y * w;
    for (let x = 0; x < lw; x++) {
      const i = (r0 + 2 * x) * 4 + ch;
      low[y * lw + x] = (bytes[i] + bytes[i + 4] + bytes[i + w * 4] + bytes[i + w * 4 + 4]) * k;
    }
  }
  return upsample(blur(low, lw, lh, radius / 2, passes), lw, lh, 2, 2);
}

// One channel of RGBA bytes as floats 0..1.
export function byteChannel(bytes, ch) {
  const n = bytes.length >> 2;
  const out = new Float32Array(n);
  for (let i = 0, k = ch; i < n; i++, k += 4) out[i] = bytes[k] * (1 / 255);
  return out;
}

// ---------- Output ----------

// Sobel normal map from a height field (wraps). strength is the slope for a
// height step of 1 per pixel at 512 px; it is scaled with resolution so a
// feature looks the same at 512 or 1024. Returns RGBA bytes.
export function normalBytes(hgt, w, h, strength) {
  const out = new Uint8Array(w * h * 4);
  const s = (strength * (Math.max(w, h) / 512)) / 8;
  const xm = new Int32Array(w);
  const xp = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    xm[x] = x === 0 ? w - 1 : x - 1;
    xp[x] = x === w - 1 ? 0 : x + 1;
  }
  for (let y = 0; y < h; y++) {
    const r0 = (y === 0 ? h - 1 : y - 1) * w;
    const r1 = y * w;
    const r2 = (y === h - 1 ? 0 : y + 1) * w;
    for (let x = 0; x < w; x++) {
      const a = xm[x];
      const c = xp[x];
      const tl = hgt[r0 + a];
      const tr = hgt[r0 + c];
      const bl = hgt[r2 + a];
      const br = hgt[r2 + c];
      const dx = tr + 2 * hgt[r1 + c] + br - (tl + 2 * hgt[r1 + a] + bl);
      const dy = bl + 2 * hgt[r2 + x] + br - (tl + 2 * hgt[r0 + x] + tr);
      // Canvas y points down while texture v points up, hence +dy for green.
      const nx = -dx * s;
      const ny = dy * s;
      const inv = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      const k = (r1 + x) * 4;
      out[k] = nx * inv + 128;
      out[k + 1] = ny * inv + 128;
      out[k + 2] = inv + 127.5;
      out[k + 3] = 255;
    }
  }
  return out;
}

// Wrap raw bytes in a DataTexture laid out like a canvas (row 0 = top = v 1).
export function dataTexture(data, w, h, { format = THREE.RGBAFormat, srgb = false, repeat = true, mipmaps = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, format, THREE.UnsignedByteType);
  t.flipY = true;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mipmaps;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Working buffers for one surface: albedo (sRGB bytes), height, roughness,
// optional metalness / emissive.
export class Surf {
  constructor(w, h = w) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    this.col = new Uint8ClampedArray(this.n * 4);
    this.hgt = new Float32Array(this.n);
    this.rgh = new Float32Array(this.n);
    this.met = null;
    this.emi = null;
  }

  // Albedo in 0..1 sRGB.
  set(i, r, g, b, a = 1) {
    const k = i * 4;
    this.col[k] = r * 255 + 0.5;
    this.col[k + 1] = g * 255 + 0.5;
    this.col[k + 2] = b * 255 + 0.5;
    this.col[k + 3] = a * 255 + 0.5;
  }

  setEmissive(i, r, g, b) {
    if (!this.emi) this.emi = new Uint8ClampedArray(this.n * 4);
    const k = i * 4;
    this.emi[k] = r * 255 + 0.5;
    this.emi[k + 1] = g * 255 + 0.5;
    this.emi[k + 2] = b * 255 + 0.5;
    this.emi[k + 3] = 255;
  }
}

// Turn a Surf into textures. Roughness goes in G (and metalness in B when
// present) of one texture, which is how three.js samples those maps.
export function surfTextures(s, { normal = 2, repeat = true, texRepeat = null, alpha = false } = {}) {
  const { w, h, n } = s;
  const out = {};
  out.map = dataTexture(new Uint8Array(s.col.buffer), w, h, { srgb: true, repeat });
  if (normal > 0) out.normalMap = dataTexture(normalBytes(s.hgt, w, h, normal), w, h, { repeat });
  if (s.rgh) {
    if (s.met) {
      const rm = new Uint8Array(n * 4);
      for (let i = 0, k = 0; i < n; i++, k += 4) {
        rm[k] = 255;
        rm[k + 1] = clamp01(s.rgh[i]) * 255 + 0.5;
        rm[k + 2] = clamp01(s.met[i]) * 255 + 0.5;
        rm[k + 3] = 255;
      }
      out.roughnessMap = out.metalnessMap = dataTexture(rm, w, h, { repeat });
    } else {
      const rm = new Uint8Array(n * 2);
      for (let i = 0, k = 0; i < n; i++, k += 2) {
        rm[k] = 255;
        rm[k + 1] = clamp01(s.rgh[i]) * 255 + 0.5;
      }
      out.roughnessMap = dataTexture(rm, w, h, { format: THREE.RGFormat, repeat });
    }
  }
  if (s.emi) out.emissiveMap = dataTexture(new Uint8Array(s.emi.buffer), w, h, { srgb: true, repeat });
  if (texRepeat) for (const t of Object.values(out)) t.repeat.set(texRepeat[0], texRepeat[1]);
  out.alpha = alpha;
  return out;
}
