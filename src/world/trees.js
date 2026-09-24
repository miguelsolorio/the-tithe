import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

// Procedural trees for the outdoor levels. A template is grown once from a
// seed (trunk, limbs and branches as tapered tubes; twig, leaf and needle
// cards at the tips) and then placed many times through one BatchedMesh per
// material: one draw call each, per-tree frustum culling, per-tree tint and a
// gentle wind sway in the vertex shader. Textures are generated in code too.
//
//   const forest = new Forest(L);
//   const oak = makeTree('oak', 3);
//   forest.place(oak, x, y, z, { rotY, scale });
//   forest.build();
//
// Kinds: oak, oakFar, maple, mapleFar, deadOak, snag, spruce, spruceFar,
// sapling, bush, bramble, log, stump, sticks, fallenBranch.

const TAU = Math.PI * 2;

// ---------- Geometry buffer ----------
// Flat arrays of position / normal / uv / colour (+ optional wind weight),
// turned into one indexed BufferGeometry. The field set dressing extends it
// with boxes and prisms (src/levels/field/kit.js).
export class GeoBuffer {
  constructor({ wind = false } = {}) {
    this.p = [];
    this.n = [];
    this.t = [];
    this.c = [];
    this.i = [];
    this.w = wind ? [] : null;
    this.wind = 0; // wind weight given to vertices while set
    this.tint = null; // optional (x, y, z, rgb, nx, ny, nz) => void, edits rgb in place
    this._rgb = [0, 0, 0];
  }

  get count() {
    return this.p.length / 3;
  }

  vert(x, y, z, nx, ny, nz, u, v, col, w = this.wind) {
    let r = col[0];
    let g = col[1];
    let b = col[2];
    if (this.tint) {
      const k = this._rgb;
      k[0] = r;
      k[1] = g;
      k[2] = b;
      this.tint(x, y, z, k, nx, ny, nz);
      r = k[0];
      g = k[1];
      b = k[2];
    }
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.t.push(u, v);
    this.c.push(r, g, b);
    if (this.w) this.w.push(w);
    return this.p.length / 3 - 1;
  }

  tri(a, b, c) {
    this.i.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.i.push(a, b, c, a, c, d);
  }

  // Tube through pts ([x, y, z]) with a radius per point and `seg` sides.
  // u wraps around uRepeat times, v runs along in metres * vScale.
  // opts: winds / colors per point, cap: colour of a flat cap on the far end.
  tube(pts, radii, seg, col, { winds = null, colors = null, uRepeat = 1, vScale = 1, v0 = 0, cap = null, capStart = null } = {}) {
    const n = pts.length;
    if (n < 2) return;
    const base = this.count;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let v = v0;
    const ring = [];
    for (let k = 0; k < n; k++) {
      const a = pts[k > 0 ? k - 1 : 0];
      const b = pts[k < n - 1 ? k + 1 : n - 1];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      let tz = b[2] - a[2];
      let l = Math.hypot(tx, ty, tz) || 1;
      tx /= l;
      ty /= l;
      tz /= l;
      if (k === 0) {
        if (Math.abs(ty) < 0.9) [nx, ny, nz] = [-tz, 0, tx];
        else [nx, ny, nz] = [0, tz, -ty];
      }
      // Parallel transport: drop the tangent component of the last normal.
      const d = nx * tx + ny * ty + nz * tz;
      nx -= tx * d;
      ny -= ty * d;
      nz -= tz * d;
      l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      const bx = ty * nz - tz * ny;
      const by = tz * nx - tx * nz;
      const bz = tx * ny - ty * nx;
      if (k > 0) v += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]) * vScale;
      const r = radii[k];
      const w = winds ? winds[k] : this.wind;
      const cc = colors ? colors[k] : col;
      const p = pts[k];
      for (let s = 0; s <= seg; s++) {
        const ang = (s / seg) * TAU;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const dx = nx * ca + bx * sa;
        const dy = ny * ca + by * sa;
        const dz = nz * ca + bz * sa;
        this.vert(p[0] + dx * r, p[1] + dy * r, p[2] + dz * r, dx, dy, dz, (s / seg) * uRepeat, v, cc, w);
      }
      if (k === n - 1 || k === 0) ring.push([tx, ty, tz, w]);
    }
    for (let k = 0; k < n - 1; k++) {
      for (let s = 0; s < seg; s++) {
        const a = base + k * (seg + 1) + s;
        const b = a + seg + 1;
        this.quad(a, a + 1, b + 1, b);
      }
    }
    if (cap) this._cap(base + (n - 1) * (seg + 1), seg, pts[n - 1], ring[ring.length - 1], cap, radii[n - 1], 1);
    if (capStart) this._cap(base, seg, pts[0], ring[0], capStart, radii[0], -1);
  }

  // Flat disc closing a tube ring (sign 1: faces along the tangent).
  _cap(start, seg, p, t, col, r, sign) {
    const [tx, ty, tz, w] = t;
    const c = this.vert(p[0], p[1], p[2], tx * sign, ty * sign, tz * sign, 0.5, 0.5, col, w);
    const first = this.count;
    for (let s = 0; s <= seg; s++) {
      const k = (start + s) * 3;
      const x = this.p[k];
      const y = this.p[k + 1];
      const z = this.p[k + 2];
      this.vert(x, y, z, tx * sign, ty * sign, tz * sign, 0.5 + ((x - p[0]) / (r || 1)) * 0.5, 0.5 + ((z - p[2]) / (r || 1)) * 0.5, col, w);
    }
    for (let s = 0; s < seg; s++) {
      if (sign > 0) this.tri(c, first + s, first + s + 1);
      else this.tri(c, first + s + 1, first + s);
    }
  }

  // Flat card: base centre p, grows along unit U for len, wid wide along unit S.
  // uv = [u0, v0, u1, v1] with v0 at the base; nrm = shading normal.
  card(p, U, S, len, wid, uv, nrm, col, w0 = this.wind, w1 = w0) {
    const hw = wid / 2;
    const ax = p[0] - S[0] * hw;
    const ay = p[1] - S[1] * hw;
    const az = p[2] - S[2] * hw;
    const bx = p[0] + S[0] * hw;
    const by = p[1] + S[1] * hw;
    const bz = p[2] + S[2] * hw;
    const a = this.vert(ax, ay, az, nrm[0], nrm[1], nrm[2], uv[0], uv[1], col, w0);
    const b = this.vert(bx, by, bz, nrm[0], nrm[1], nrm[2], uv[2], uv[1], col, w0);
    const c = this.vert(bx + U[0] * len, by + U[1] * len, bz + U[2] * len, nrm[0], nrm[1], nrm[2], uv[2], uv[3], col, w1);
    const d = this.vert(ax + U[0] * len, ay + U[1] * len, az + U[2] * len, nrm[0], nrm[1], nrm[2], uv[0], uv[3], col, w1);
    this.quad(a, b, c, d);
  }

  // Apply a Matrix4 to the vertices added since `start`.
  transform(m, start = 0) {
    const e = m.elements;
    const nm = new THREE.Matrix3().getNormalMatrix(m).elements;
    for (let k = start * 3; k < this.p.length; k += 3) {
      const x = this.p[k];
      const y = this.p[k + 1];
      const z = this.p[k + 2];
      this.p[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      this.p[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      this.p[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = this.n[k];
      const b = this.n[k + 1];
      const c = this.n[k + 2];
      let nx = nm[0] * a + nm[3] * b + nm[6] * c;
      let ny = nm[1] * a + nm[4] * b + nm[7] * c;
      let nz = nm[2] * a + nm[5] * b + nm[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      this.n[k] = nx / l;
      this.n[k + 1] = ny / l;
      this.n[k + 2] = nz / l;
    }
    return this;
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.w) g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- Small vector helpers ([x, y, z] arrays) ----------
export function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}

export function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// Unit vector perpendicular to d (horizontal when d is not vertical).
export function perp3(d) {
  return norm3(Math.abs(d[1]) < 0.95 ? [-d[2], 0, d[0]] : [0, d[2], -d[1]]);
}

// Direction tilted theta away from d, at angle phi around it.
export function tilt3(d, theta, phi) {
  const a = perp3(d);
  const b = cross3(d, a);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  return norm3([d[0] * ct + (a[0] * c + b[0] * s) * st, d[1] * ct + (a[1] * c + b[1] * s) * st, d[2] * ct + (a[2] * c + b[2] * s) * st]);
}

const hex = (h, k = 1) => {
  const c = new THREE.Color(h);
  return [c.r * k, c.g * k, c.b * k];
};

// ---------- Tileable noise for the textures ----------
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Value noise wrapping every px x py lattice cells.
function tnoise(x, y, px, py, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const a = hash(x0, y0, s);
  const b = hash(x1, y0, s);
  const c = hash(x0, y1, s);
  const d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function tfbm(x, y, px, py, oct, s) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * tnoise(x, y, px, py, s + i * 31);
    norm += amp;
    x *= 2;
    y *= 2;
    px *= 2;
    py *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function dataTexture(data, w, h, srgb) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Tangent-space normal map (wrapping Sobel) from a height field.
export function normalTexture(hgt, w, h, strength) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = ((y - 1 + h) % h) * w;
    const y1 = y * w;
    const y2 = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const x0 = (x - 1 + w) % w;
      const x2 = (x + 1) % w;
      const dx = hgt[y0 + x2] + 2 * hgt[y1 + x2] + hgt[y2 + x2] - hgt[y0 + x0] - 2 * hgt[y1 + x0] - hgt[y2 + x0];
      const dy = hgt[y2 + x0] + 2 * hgt[y2 + x] + hgt[y2 + x2] - hgt[y0 + x0] - 2 * hgt[y0 + x] - hgt[y0 + x2];
      const nx = -dx * strength;
      const ny = -dy * strength;
      const inv = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      const k = (y1 + x) * 4;
      out[k] = nx * inv + 128;
      out[k + 1] = ny * inv + 128;
      out[k + 2] = inv + 127.5;
      out[k + 3] = 255;
    }
  }
  return dataTexture(out, w, h, false);
}

// ---------- Textures ----------
// Bark: vertical plates split by furrows, lichen on the plates. Near-neutral
// grey so each tree's vertex colour sets the hue. 1 tile = one wrap of the
// trunk (u) by 1.6 m (v).
function barkTextures() {
  const W = 128;
  const H = 256;
  const col = new Uint8Array(W * H * 4);
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      // Furrows follow the 0.5 isolines of noise stretched along the trunk.
      const warp = tfbm(u * 4, v * 2, 4, 2, 2, 3) - 0.5;
      const f = tfbm(u * 6 + warp * 0.8, v * 1, 6, 1, 3, 11);
      const f2 = tfbm(u * 11 + warp, v * 2, 11, 2, 2, 19);
      const plate = smooth(0.0, 0.07, Math.abs(f - 0.5)) * (0.55 + 0.45 * smooth(0.0, 0.05, Math.abs(f2 - 0.5)));
      const grain = tfbm(u * 32, v * 12, 32, 12, 2, 5);
      const cut = smooth(0.46, 0.5, tfbm(u * 5, v * 14, 5, 14, 2, 17)) * smooth(0.54, 0.5, tfbm(u * 5, v * 14, 5, 14, 2, 17));
      const h = plate * 0.75 + grain * 0.25 - cut * 0.35 * plate;
      const i = y * W + x;
      hgt[i] = h;
      const lichen = smooth(0.6, 0.72, tfbm(u * 6, v * 9, 6, 9, 3, 23)) * plate;
      let a = (0.26 + 0.66 * plate) * (0.82 + grain * 0.36) * (1 - cut * 0.4);
      a = Math.min(1, a + lichen * 0.18);
      const k = i * 4;
      col[k] = Math.min(255, a * 250 * (1 - lichen * 0.06));
      col[k + 1] = Math.min(255, a * 246 * (1 + lichen * 0.1));
      col[k + 2] = Math.min(255, a * 236 * (1 - lichen * 0.08));
      col[k + 3] = 255;
    }
  }
  return { map: dataTexture(col, W, H, true), normal: normalTexture(hgt, W, H, 3.2) };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Recursive twig drawn on a 2D canvas (angles in canvas space, y down).
function drawTwig(ctx, rng, x, y, ang, len, width, depth, o) {
  const segs = 4;
  const pts = [[x, y, ang]];
  let a = ang;
  for (let s = 0; s < segs; s++) {
    a += (rng() - 0.5) * o.kink + o.curl;
    x += (Math.cos(a) * len) / segs;
    y += (Math.sin(a) * len) / segs;
    pts.push([x, y, a]);
  }
  for (let s = 0; s < segs; s++) {
    ctx.lineWidth = Math.max(o.minW, width * (1 - (s / segs) * 0.55));
    ctx.beginPath();
    ctx.moveTo(pts[s][0], pts[s][1]);
    ctx.lineTo(pts[s + 1][0], pts[s + 1][1]);
    ctx.stroke();
  }
  if (depth <= 0) {
    if (o.leaves && rng() < o.leaves) drawLeaf(ctx, rng, x, y, a + (rng() - 0.5) * 0.8, o.leafSize * (0.7 + rng() * 0.6), o);
    return;
  }
  const n = o.children[0] + Math.floor(rng() * (o.children[1] - o.children[0] + 1));
  for (let k = 0; k < n; k++) {
    const t = 0.2 + 0.75 * ((k + rng() * 0.6) / n);
    const f = t * segs;
    const i = Math.min(segs - 1, Math.floor(f));
    const q = f - i;
    const px = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * q;
    const py = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * q;
    const side = (k % 2 ? 1 : -1) * (rng() < 0.25 ? -1 : 1);
    const spread = o.spread[0] + rng() * (o.spread[1] - o.spread[0]);
    drawTwig(ctx, rng, px, py, pts[i + 1][2] + side * spread, len * (o.lenK[0] + rng() * (o.lenK[1] - o.lenK[0])) * (1 - t * 0.35), width * 0.62, depth - 1, o);
  }
  if (o.leaves && rng() < o.leaves * 0.6) drawLeaf(ctx, rng, x, y, a, o.leafSize, o);
}

function drawLeaf(ctx, rng, x, y, ang, size, o) {
  const pal = o.leafColors;
  const saved = ctx.strokeStyle;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = pal[Math.floor(rng() * pal.length)];
  const w = size * (0.32 + rng() * 0.15);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(size * 0.35, -w, size, (rng() - 0.5) * w * 0.4);
  ctx.quadraticCurveTo(size * 0.35, w, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,18,10,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size * 0.9, 0);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = saved;
}

// Twig atlas, 2 x 2 cells; each card's stem enters at the bottom centre.
// 0: fine spray, 1: sparse and angular (dead), 2: twig with dead leaves, 3: dense brush.
const TWIG_STYLES = [
  { depth: 3, children: [3, 4], spread: [0.35, 0.75], lenK: [0.42, 0.62], kink: 0.35, curl: 0, width: 4.2, minW: 0.7, len: 0.66 },
  { depth: 3, children: [2, 3], spread: [0.5, 1.0], lenK: [0.4, 0.65], kink: 0.7, curl: 0, width: 4.6, minW: 0.8, len: 0.7 },
  { depth: 2, children: [3, 4], spread: [0.45, 0.9], lenK: [0.45, 0.65], kink: 0.4, curl: 0, width: 3.6, minW: 0.8, len: 0.6, leaves: 0.95, leafSize: 20 },
  { depth: 3, children: [4, 5], spread: [0.3, 0.8], lenK: [0.45, 0.62], kink: 0.45, curl: 0, width: 3.4, minW: 0.6, len: 0.58 },
];
const LEAF_COLORS = ['#5a3418', '#6e4420', '#7a4a1c', '#4a2c16', '#86561e', '#3e2a18', '#6a2a14'];

function twigAtlas() {
  const S = 512;
  const C = S / 2;
  const cv = canvas(S, S);
  const ctx = cv.getContext('2d');
  const rng = makeRng(4321);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  TWIG_STYLES.forEach((st, k) => {
    const ox = (k % 2) * C;
    const oy = (k >> 1) * C;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox + 3, oy + 3, C - 6, C - 6);
    ctx.clip();
    ctx.strokeStyle = k === 1 ? '#4a4540' : '#3e3630';
    const o = { ...st, leafColors: LEAF_COLORS };
    drawTwig(ctx, rng, ox + C / 2, oy + C - 4, -Math.PI / 2 + (rng() - 0.5) * 0.15, C * st.len, st.width, st.depth, o);
    // A second, smaller spray from the same stem for fullness.
    drawTwig(ctx, rng, ox + C / 2, oy + C - 30, -Math.PI / 2 + (k % 2 ? 0.5 : -0.5), C * st.len * 0.55, st.width * 0.6, st.depth - 1, o);
    ctx.restore();
  });
  return canvasTexture(cv);
}

// UV rects of the twig atlas cells ([u0, v0, u1, v1], v0 at the stem).
const TWIG_CELLS = [0, 1, 2, 3].map((k) => {
  const u0 = (k % 2) * 0.5;
  const v1 = 1 - (k >> 1) * 0.5;
  return [u0 + 0.004, v1 - 0.5 + 0.004, u0 + 0.5 - 0.004, v1 - 0.004];
});
export const LEAFY = 2;

// Needle sprays for conifers: 2 cells stacked (0: dense spruce, 1: drooping, sparser).
function needleAtlas() {
  const W = 256;
  const H = 512;
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');
  const rng = makeRng(99);
  ctx.lineCap = 'round';
  const greens = ['#1a261c', '#223224', '#18221a', '#2a3a28', '#141c16', '#2e3f2c'];
  for (let k = 0; k < 2; k++) {
    const oy = k * 256;
    ctx.save();
    ctx.beginPath();
    ctx.rect(3, oy + 3, W - 6, 250);
    ctx.clip();
    const stems = [];
    // Main stem bottom to top, side stems alternating.
    const main = [];
    let x = 128;
    let y = oy + 252;
    let a = -Math.PI / 2;
    for (let s = 0; s < 24; s++) {
      a += (rng() - 0.5) * 0.08;
      x += Math.cos(a) * 9.8;
      y += Math.sin(a) * 9.8;
      main.push([x, y, a]);
    }
    stems.push({ pts: main, w: 2.4 });
    for (let s = 2; s < 22; s += 2) {
      const [sx, sy, sa] = main[s];
      for (const side of [-1, 1]) {
        const len = (1 - s / 26) * (k ? 70 : 88) * (0.75 + rng() * 0.4);
        const pts = [];
        let bx = sx;
        let by = sy;
        let ba = sa + side * (0.95 + rng() * 0.3) + (k ? side * 0.25 : 0);
        for (let q = 0; q < 8; q++) {
          ba += (k ? side * 0.05 : 0) + (rng() - 0.5) * 0.1;
          bx += (Math.cos(ba) * len) / 8;
          by += (Math.sin(ba) * len) / 8;
          pts.push([bx, by, ba]);
        }
        stems.push({ pts, w: 1.4 });
      }
    }
    // Needles: short strokes along every stem, pointing forward.
    for (const st of stems) {
      for (let q = 0; q < st.pts.length; q++) {
        const [px, py, pa] = st.pts[q];
        const per = k ? 3 : 4;
        for (let m = 0; m < per; m++) {
          const f = m / per;
          const prev = q > 0 ? st.pts[q - 1] : [px, py];
          const nx = prev[0] + (px - prev[0]) * f;
          const ny = prev[1] + (py - prev[1]) * f;
          for (const side of [-1, 1]) {
            const na = pa + side * (0.75 + rng() * 0.35);
            const nl = (k ? 9 : 11) * (0.7 + rng() * 0.5) * (st.w > 2 ? 1.2 : 1);
            ctx.strokeStyle = greens[Math.floor(rng() * greens.length)];
            ctx.lineWidth = 1.5 + rng() * 0.8;
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.lineTo(nx + Math.cos(na) * nl, ny + Math.sin(na) * nl);
            ctx.stroke();
          }
        }
      }
      ctx.strokeStyle = '#2a2018';
      ctx.lineWidth = st.w;
      ctx.beginPath();
      ctx.moveTo(st.pts[0][0], st.pts[0][1]);
      for (const p of st.pts) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
    ctx.restore();
  }
  return canvasTexture(cv);
}

const NEEDLE_CELLS = [0, 1].map((k) => [0.004, 1 - (k + 1) * 0.5 + 0.004, 0.996, 1 - k * 0.5 - 0.004]);

// ---------- Materials ----------
const WIND = { value: 0 };
let MATS = null;

// Sway in the vertex shader: aWind = how far a vertex is from the stiff trunk.
function windPatch(mat, card) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = WIND;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWind;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_BATCHING
          vec3 wOrg = batchingMatrix[3].xyz;
        #else
          vec3 wOrg = vec3(0.0);
        #endif
        float wPh = wOrg.x * 0.31 + wOrg.z * 0.17;
        float wS = sin(uWind * 0.7 + wPh) * 0.65 + sin(uWind * 1.73 + wPh * 1.9) * 0.35;
        transformed.x += aWind * wS * 0.09;
        transformed.z += aWind * sin(uWind * 0.53 + wPh * 0.8) * 0.06;` +
          (card ? '\n        transformed += normal * aWind * sin(uWind * 4.7 + position.x * 5.1 + position.y * 3.7) * 0.025;' : ''),
      );
    // Cards keep their outward shading normal on both faces.
    if (card) shader.fragmentShader = shader.fragmentShader.replace('normal *= faceDirection;', '');
  };
  mat.customProgramCacheKey = () => (card ? 'tithe-tree-card' : 'tithe-tree-bark');
}

// Shared tree materials (built once): { bark, twig, needle }.
export function treeMaterials() {
  if (MATS) return MATS;
  const tex = barkTextures();
  const bark = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normal, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.95, vertexColors: true });
  const twig = new THREE.MeshStandardMaterial({ map: twigAtlas(), transparent: true, alphaTest: 0.04, depthWrite: false, side: THREE.DoubleSide, roughness: 1, vertexColors: true });
  const needle = new THREE.MeshStandardMaterial({ map: needleAtlas(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.95, vertexColors: true });
  windPatch(bark, false);
  windPatch(twig, true);
  windPatch(needle, true);
  bark.name = 'treeBark';
  twig.name = 'treeTwig';
  needle.name = 'treeNeedle';
  MATS = { bark, twig, needle };
  return MATS;
}

// ---------- Growth ----------
// Per-depth arrays: 0 trunk, 1 limbs, 2 branches, 3 twigs.
const BROADLEAF = {
  form: 'broadleaf', height: [9, 12], trunkR: [0.24, 0.34], lean: 0.08, roots: 5, moss: 0.6,
  levels: 2, children: [[6, 8], [5, 7], [3, 4]], tStart: [0.32, 0.12, 0.2], alongTaper: 0.45,
  spread: [[0.8, 1.2], [0.5, 1.0], [0.5, 0.9]], lenK: [[0.42, 0.55], [0.42, 0.58], [0.4, 0.55]],
  rK: [0.46, 0.5, 0.5], tip: [0.3, 0.3, 0.3, 0.35], segLen: [1.4, 0.9, 0.65, 0.45], radial: [8, 5, 3, 3],
  wander: [0.08, 0.24, 0.34, 0.4], trop: [0, 0.05, 0.07, 0.06], upBias: 0.25,
  cards: { per: [4, 5], size: [0.85, 1.35], cells: [0, 0, 1, 3], leafy: 0.12, up: 0.35 },
  bark: 0x5a524a,
};
const CONIFER = {
  form: 'conifer', height: [11, 16], trunkR: [0.2, 0.28], moss: 0.3, deadBelow: 2.2,
  spacing: [0.5, 0.66], perWhorl: [3, 4], branchLen: [2.4, 3.2], droop: [0.5, 0.1], sub: true, curtain: 0.45,
  cardsPerM: 2.2, cardSize: [0.75, 1.05], radial: [7, 3, 3], segLen: [1.6, 1.0, 0.7], wander: [0.03, 0.12, 0.2], trop: [0, 0.02, 0.03],
  deadCards: { per: [1, 1], size: [0.35, 0.55], cells: [1], leafy: 0, up: 0 },
  bark: 0x4a3a30, needle: 0xd8e0d0,
};

const SPECS = {
  oak: BROADLEAF,
  oakFar: { ...BROADLEAF, roots: 0, children: [[5, 6], [3, 4]], radial: [5, 3, 3], segLen: [2.4, 1.6, 1.2], cards: { ...BROADLEAF.cards, per: [3, 4], size: [1.2, 1.8] } },
  mapleFar: {
    ...BROADLEAF, roots: 0, height: [12, 15], trunkR: [0.22, 0.3], children: [[6, 7], [3, 4]], spread: [[0.45, 0.8], [0.45, 0.85]], upBias: 0.35,
    radial: [5, 3, 3], segLen: [2.4, 1.6, 1.2], bark: 0x68625a, cards: { ...BROADLEAF.cards, per: [3, 4], size: [1.2, 1.8] },
  },
  maple: {
    ...BROADLEAF, height: [12, 15], trunkR: [0.22, 0.3], children: [[7, 9], [4, 6], [3, 4]], tStart: [0.28, 0.15, 0.2],
    spread: [[0.45, 0.8], [0.45, 0.85], [0.5, 0.9]], upBias: 0.35, trop: [0, 0.08, 0.08, 0.06], bark: 0x68625a, roots: 4,
  },
  deadOak: { ...BROADLEAF, bark: 0x7a756c, moss: 0.25, broken: 0.35, children: [[5, 7], [3, 5]], cards: { per: [1, 2], size: [0.8, 1.2], cells: [1], leafy: 0, up: 0.2 } },
  snag: { form: 'snag', height: [5, 8.5], trunkR: [0.2, 0.3], bark: 0x8a857c, moss: 0.35, radial: [8, 5, 3], segLen: [1.2, 0.6, 0.4], wander: [0.1, 0.3, 0.4], trop: [0, 0.02, 0.02], cards: { per: [0, 1], size: [0.7, 1.0], cells: [1], leafy: 0, up: 0.2 } },
  spruce: CONIFER,
  spruceFar: { ...CONIFER, radial: [5, 3, 3], segLen: [2.4, 1.8, 1], sub: false, perWhorl: [3, 3], spacing: [0.7, 0.9], cardsPerM: 1.3, cardSize: [1.0, 1.4], curtain: 0.3 },
  sapling: {
    ...BROADLEAF, height: [2.5, 4.2], trunkR: [0.035, 0.055], roots: 0, levels: 1, children: [[5, 7]], tStart: [0.3], spread: [[0.5, 0.9]],
    lenK: [[0.35, 0.5]], rK: [0.5], radial: [5, 3], segLen: [0.6, 0.4], cards: { per: [2, 3], size: [0.5, 0.8], cells: [0, 3], leafy: 0.3, up: 0.4 },
  },
  bush: { form: 'bush', stems: [6, 8], height: [0.9, 1.6], stemR: [0.012, 0.022], radial: [3, 3, 3], segLen: [0.6, 0.6, 0.5], wander: [0.3, 0.35, 0.4], trop: [0.04, 0.04, 0.04], bark: 0x4a4038, moss: 0, cards: { per: [2, 3], size: [0.45, 0.75], cells: [3, 0, 3], leafy: 0.2, up: 0.3 } },
  bramble: { form: 'bramble', canes: [5, 7], len: [1.3, 2.2], radial: [3, 3], segLen: [0.35, 0.35], wander: [0.2, 0.25], trop: [0, -0.2], floor: 0.03, bark: 0x3a2224, moss: 0, leaf: 0x8a6a60, cards: { per: [5, 7], size: [0.25, 0.4], cells: [2], leafy: 1, up: 0.2 } },
  log: { form: 'log', len: [2.5, 4.5], r: [0.16, 0.3], radial: [9, 5, 4], segLen: [1, 0.3, 0.3], wander: [0.05, 0.3, 0.3], trop: [0, 0, 0], bark: 0x4a4038, moss: 1.2, still: true, cap: 0x7a6650 },
  stump: { form: 'stump', h: [0.35, 0.8], r: [0.22, 0.38], radial: [10, 6, 4], segLen: [0.4, 0.3, 0.3], wander: [0, 0, 0], trop: [0, 0, 0], bark: 0x4a4038, moss: 0.9, still: true, cap: 0x8a7458 },
  sticks: { form: 'sticks', radial: [3, 3, 3, 3], bark: 0x5a4c40, moss: 0, still: true },
  fallenBranch: { form: 'fallen', len: [3.8, 4.3], radial: [7, 4, 3], segLen: [0.6, 0.45, 0.35], wander: [0.1, 0.3, 0.35], trop: [0, 0, 0], bark: 0x6a645c, moss: 0.3, still: true, cap: 0x8a7a64, cards: { per: [2, 3], size: [0.6, 0.9], cells: [1, 0], leafy: 0.1, up: 0.05 } },
};

const lerpR = (rng, r) => r[0] + rng() * (r[1] - r[0]);

// One branch as a polyline, bending with wander and tropism.
function grow(ctx, origin, dir, len, r0, r1, depth, w0) {
  const { spec, rng } = ctx;
  const di = Math.min(depth, spec.segLen.length - 1);
  const segs = Math.max(2, Math.round(len / spec.segLen[di]));
  const step = len / segs;
  const wander = spec.wander[di];
  const trop = spec.trop[di];
  const wk = ctx.windK * [0.015, 0.06, 0.12, 0.18][Math.min(depth, 3)];
  const pts = [origin];
  const dirs = [dir.slice()];
  const radii = [r0];
  const winds = [w0];
  let [dx, dy, dz] = dir;
  let [x, y, z] = origin;
  for (let s = 1; s <= segs; s++) {
    dx += (rng() - 0.5) * wander;
    dy += (rng() - 0.5) * wander * 0.5 + trop;
    dz += (rng() - 0.5) * wander;
    if (ctx.reach && depth >= 1 && depth <= 2) {
      dx += ctx.reach[0];
      dz += ctx.reach[1];
    }
    let l = Math.hypot(dx, dy, dz);
    dx /= l;
    dy /= l;
    dz /= l;
    if (ctx.avoid && ctx.avoid(x + dx * step, y + dy * step, z + dz * step)) {
      dy = Math.max(dy, 0) + 1.2;
      l = Math.hypot(dx, dy, dz);
      dx /= l;
      dy /= l;
      dz /= l;
    }
    x += dx * step;
    y = Math.max(ctx.floor, y + dy * step);
    z += dz * step;
    pts.push([x, y, z]);
    dirs.push([dx, dy, dz]);
    radii.push(r0 + (r1 - r0) * Math.pow(s / segs, 0.9));
    winds.push(w0 + wk * step * s);
  }
  const b = { pts, dirs, radii, winds, len, depth, r0 };
  ctx.branches.push(b);
  return b;
}

// Point, direction, radius and wind weight at fraction t along a branch.
function at(b, t) {
  const f = Math.min(1, Math.max(0, t)) * (b.pts.length - 1);
  const i = Math.min(b.pts.length - 2, Math.floor(f));
  const k = f - i;
  const p0 = b.pts[i];
  const p1 = b.pts[i + 1];
  return {
    p: [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k, p0[2] + (p1[2] - p0[2]) * k],
    d: b.dirs ? b.dirs[i + 1] : norm3([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]),
    r: b.radii[i] + (b.radii[i + 1] - b.radii[i]) * k,
    w: b.winds[i] + (b.winds[i + 1] - b.winds[i]) * k,
  };
}

function branchOut(ctx, parent, depth) {
  const { spec, rng } = ctx;
  if (depth >= spec.levels) return;
  const [c0, c1] = spec.children[depth];
  const n = c0 + Math.floor(rng() * (c1 - c0 + 1));
  const ts = spec.tStart[depth];
  for (let k = 0; k < n; k++) {
    const t = ts + (1 - ts) * ((k + 0.25 + rng() * 0.5) / n);
    const a = at(parent, t);
    ctx.phase += 2.39996 + (rng() - 0.5) * 0.6;
    let phi = ctx.phase;
    if (ctx.reach && depth === 0 && rng() < 0.55) phi = Math.atan2(-ctx.reach[0], -ctx.reach[1]) + (rng() - 0.5) * 1.3;
    const [s0, s1] = spec.spread[depth];
    const d = tilt3(a.d, s0 + rng() * (s1 - s0), phi);
    if (depth >= 1) {
      d[1] += spec.upBias;
      norm3(d);
    }
    const [l0, l1] = spec.lenK[depth];
    let len = parent.len * (l0 + rng() * (l1 - l0)) * (1 - t * spec.alongTaper);
    const r = Math.min(a.r * 0.8, parent.r0 * spec.rK[depth] * (0.75 + rng() * 0.35));
    if (len < 0.15 || r < 0.004) continue;
    if (spec.broken && depth === 0 && rng() < spec.broken) {
      len *= 0.25 + rng() * 0.3;
      const stub = grow(ctx, a.p, d, len, r, r * 0.7, depth + 1, a.w);
      stub.cap = true;
      continue;
    }
    const child = grow(ctx, a.p, d, len, r, r * spec.tip[depth + 1], depth + 1, a.w);
    if (depth + 1 >= spec.levels) cardsOn(ctx, child, spec.cards);
    else branchOut(ctx, child, depth + 1);
  }
}

// Twig / leaf cards along a branch (stem at the branch, growing outward).
function cardsOn(ctx, b, cfg, tMin = 0.3) {
  const { rng } = ctx;
  const n = cfg.per[0] + Math.floor(rng() * (cfg.per[1] - cfg.per[0] + 1));
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.8 + rng() * 0.2 : tMin + (1 - tMin) * (k / (n - 1));
    const a = at(b, t);
    const U = norm3([a.d[0] + (rng() - 0.5) * 1.0, a.d[1] + (rng() - 0.5) * 0.8 + cfg.up, a.d[2] + (rng() - 0.5) * 1.0]);
    const S = tilt3(U, Math.PI / 2, rng() * TAU);
    const size = (cfg.size[0] + rng() * (cfg.size[1] - cfg.size[0])) * ctx.cardScale;
    const leafy = rng() < cfg.leafy;
    const cell = leafy ? LEAFY : cfg.cells[Math.floor(rng() * cfg.cells.length)];
    const hx = a.p[0] + U[0];
    const hz = a.p[2] + U[2];
    const hl = Math.hypot(hx, hz) || 1;
    const nrm = norm3([hx / hl, 0.8, hz / hl]);
    const p = [a.p[0] - U[0] * size * 0.06, a.p[1] - U[1] * size * 0.06, a.p[2] - U[2] * size * 0.06];
    ctx.twig.card(p, U, S, size, size * 0.95, TWIG_CELLS[cell], nrm, leafy ? ctx.leafCol : ctx.twigCol, a.w, a.w + ctx.windK * 0.35 * size);
  }
}

// Needle sprays along a conifer branch, plus drooping curtains beneath it.
function needlesOn(ctx, b, L) {
  const { spec, rng } = ctx;
  const n = Math.max(2, Math.round(L * spec.cardsPerM));
  for (let k = 0; k < n; k++) {
    const t = 0.15 + 0.85 * (k / (n - 1));
    const a = at(b, t);
    const U = norm3([a.d[0] + (rng() - 0.5) * 0.5, a.d[1] - 0.1 + (rng() - 0.5) * 0.3, a.d[2] + (rng() - 0.5) * 0.5]);
    const S = tilt3(U, Math.PI / 2, (rng() - 0.5) * 1.4);
    const size = (spec.cardSize[0] + rng() * (spec.cardSize[1] - spec.cardSize[0])) * Math.min(1, 0.55 + L * 0.2) * ctx.cardScale;
    const nrm = norm3([a.d[0], 1.1, a.d[2]]);
    const p = [a.p[0] - U[0] * 0.1, a.p[1] - U[1] * 0.1, a.p[2] - U[2] * 0.1];
    ctx.needle.card(p, U, S, size, size * 0.85, NEEDLE_CELLS[rng() < 0.6 ? 0 : 1], nrm, ctx.needleCol, a.w, a.w + 0.3);
    if (spec.curtain && t > 0.3 && rng() < spec.curtain) {
      const D = norm3([a.d[0] * 0.35, -1, a.d[2] * 0.35]);
      const S2 = norm3([-a.d[2], 0, a.d[0]]);
      ctx.needle.card(a.p, D, S2, size * 0.7, size * 0.6, NEEDLE_CELLS[1], nrm, ctx.needleCol, a.w, a.w + 0.3);
    }
  }
}

// Buttress roots around the foot of a trunk.
function roots(ctx, r0, n) {
  const { rng } = ctx;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rng() * 0.9;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const len = r0 * (2.5 + rng() * 3);
    const m = r0 * 0.9 + len * 0.3;
    const pts = [[dx * r0 * 0.3, 0.55, dz * r0 * 0.3], [dx * m, 0.1, dz * m], [dx * (r0 + len), -0.12, dz * (r0 + len)]];
    ctx.branches.push({ pts, dirs: null, radii: [r0 * 0.5, r0 * 0.26, r0 * 0.05], winds: [0, 0, 0], len, depth: 1, r0: r0 * 0.5 });
  }
}

// ---------- Forms ----------
function trunkFlare(trunk, r0, k = 1.55) {
  // Extra ring half a metre up so the flare stays at the foot.
  const p0 = trunk.pts[0];
  const d = trunk.dirs[1];
  trunk.pts.splice(1, 0, [p0[0] + d[0] * 0.55, p0[1] + d[1] * 0.55, p0[2] + d[2] * 0.55]);
  trunk.dirs.splice(1, 0, d.slice());
  trunk.radii.splice(1, 0, r0 * 1.14);
  trunk.winds.splice(1, 0, 0);
  trunk.radii[0] = r0 * k;
}

const FORMS = {
  broadleaf(ctx, o) {
    const { spec, rng } = ctx;
    const S = o.scale ?? 1;
    const H = lerpR(rng, spec.height) * S;
    const r0 = lerpR(rng, spec.trunkR) * S;
    const d = norm3([(rng() - 0.5) * spec.lean * 2 + (o.lean?.[0] ?? 0), 1, (rng() - 0.5) * spec.lean * 2 + (o.lean?.[1] ?? 0)]);
    const trunk = grow(ctx, [0, -0.3, 0], d, H, r0, r0 * spec.tip[0], 0, 0);
    trunkFlare(trunk, r0);
    if (spec.roots) roots(ctx, r0, spec.roots);
    branchOut(ctx, trunk, 0);
    if (spec.levels > 0) cardsOn(ctx, trunk, { ...spec.cards, per: [2, 3] }, 0.86);
    return { trunkR: r0, height: H };
  },

  conifer(ctx, o) {
    const { spec, rng } = ctx;
    const S = o.scale ?? 1;
    const H = lerpR(rng, spec.height) * S;
    const r0 = lerpR(rng, spec.trunkR) * S;
    const trunk = grow(ctx, [0, -0.3, 0], norm3([(rng() - 0.5) * 0.04, 1, (rng() - 0.5) * 0.04]), H + 0.3, r0, 0.015, 0, 0);
    trunkFlare(trunk, r0, 1.35);
    const T = (h) => (h + 0.3) / (H + 0.3);
    const live = spec.deadBelow * S * (0.8 + rng() * 0.4);
    // Dead stubs on the bare lower trunk.
    for (let h = 0.9; h < live; h += 0.45 + rng() * 0.35) {
      const a = at(trunk, T(h));
      const phi = rng() * TAU;
      const stub = grow(ctx, a.p, norm3([Math.cos(phi), -0.35 - rng() * 0.4, Math.sin(phi)]), 0.3 + rng() * 0.8, 0.012 + rng() * 0.015, 0.004, 2, a.w);
      if (rng() < 0.4) cardsOn(ctx, stub, spec.deadCards, 0.8);
    }
    // Whorls of drooping branches, shorter toward the top.
    let phase = rng() * TAU;
    for (let h = live; h < H * 0.97; h += (spec.spacing[0] + rng() * (spec.spacing[1] - spec.spacing[0])) * S) {
      const rel = (h - live) / (H - live);
      const a = at(trunk, T(h));
      const n = spec.perWhorl[0] + Math.floor(rng() * (spec.perWhorl[1] - spec.perWhorl[0] + 1));
      phase += 0.9 + rng();
      for (let k = 0; k < n; k++) {
        const phi = phase + (k / n) * TAU + (rng() - 0.5) * 0.5;
        const droop = spec.droop[0] + (spec.droop[1] - spec.droop[0]) * rel;
        const d = norm3([Math.cos(phi), -droop + (rng() - 0.5) * 0.15, Math.sin(phi)]);
        const L = Math.max(0.35, lerpR(rng, spec.branchLen) * Math.pow(1 - rel, 0.85) * S);
        const b = grow(ctx, a.p, d, L, Math.max(0.012, a.r * 0.32), 0.006, 1, a.w);
        needlesOn(ctx, b, L);
        if (spec.sub && L > 1.8) {
          for (let q = 0; q < 2; q++) {
            const s = at(b, 0.35 + q * 0.3 + rng() * 0.1);
            const side = q ? 1 : -1;
            const sd = norm3([s.d[0] - s.d[2] * side * 0.9, s.d[1] - 0.1, s.d[2] + s.d[0] * side * 0.9]);
            const sl = L * (0.3 + rng() * 0.15);
            const sb = grow(ctx, s.p, sd, sl, 0.008, 0.004, 2, s.w);
            needlesOn(ctx, sb, sl);
          }
        }
      }
    }
    // Leader tip.
    const top = at(trunk, 1);
    for (let k = 0; k < 3; k++) {
      const U = norm3([(rng() - 0.5) * 0.4, 1, (rng() - 0.5) * 0.4]);
      ctx.needle.card([top.p[0], top.p[1] - 0.5, top.p[2]], U, tilt3(U, Math.PI / 2, (k / 3) * Math.PI), 0.9, 0.55, NEEDLE_CELLS[0], [0, 1, 0], ctx.needleCol, top.w, top.w + 0.3);
    }
    return { trunkR: r0, height: H };
  },

  // Standing dead tree: broken top, a few snapped limbs.
  snag(ctx, o) {
    const { spec, rng } = ctx;
    const S = o.scale ?? 1;
    const H = lerpR(rng, spec.height) * S;
    const r0 = lerpR(rng, spec.trunkR) * S;
    const trunk = grow(ctx, [0, -0.3, 0], norm3([(rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3]), H, r0, r0 * 0.55, 0, 0);
    trunkFlare(trunk, r0, 1.4);
    trunk.cap = true;
    const top = at(trunk, 1);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + rng();
      const off = top.r * 0.6;
      const p = [top.p[0] + Math.cos(a) * off, top.p[1] - 0.05, top.p[2] + Math.sin(a) * off];
      grow(ctx, p, norm3([Math.cos(a) * 0.2, 1, Math.sin(a) * 0.2]), 0.3 + rng() * 0.7, top.r * 0.3, 0.004, 2, top.w);
    }
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const a = at(trunk, 0.3 + rng() * 0.6);
      const limb = grow(ctx, a.p, tilt3(a.d, 0.7 + rng() * 0.6, rng() * TAU), 0.6 + rng() * 2.2, a.r * 0.35, a.r * 0.18, 1, a.w);
      limb.cap = rng() < 0.7;
      if (!limb.cap && rng() < 0.6) {
        const s = at(limb, 0.6);
        const tw = grow(ctx, s.p, tilt3(s.d, 0.6, rng() * TAU), 0.5 + rng() * 0.6, s.r * 0.6, 0.004, 2, s.w);
        cardsOn(ctx, tw, spec.cards, 0.8);
      }
    }
    return { trunkR: r0, height: H };
  },

  // Bare shrub: several stems from one root.
  bush(ctx, o) {
    const { spec, rng } = ctx;
    const S = o.scale ?? 1;
    const n = spec.stems[0] + Math.floor(rng() * (spec.stems[1] - spec.stems[0] + 1));
    let hMax = 0;
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * TAU + rng() * 0.6;
      const len = lerpR(rng, spec.height) * S;
      const r = lerpR(rng, spec.stemR);
      const st = grow(ctx, [Math.cos(phi) * 0.06, -0.05, Math.sin(phi) * 0.06], tilt3([0, 1, 0], 0.15 + rng() * 0.55, phi), len, r, r * 0.3, 1, 0);
      hMax = Math.max(hMax, len);
      for (let q = 0; q < 1; q++) {
        const a = at(st, 0.45 + rng() * 0.2);
        const c = grow(ctx, a.p, tilt3(a.d, 0.5 + rng() * 0.4, rng() * TAU), len * 0.45, a.r * 0.6, 0.003, 2, a.w);
        cardsOn(ctx, c, spec.cards);
      }
      cardsOn(ctx, st, spec.cards);
    }
    return { trunkR: 0, height: hMax };
  },

  // Arching bramble canes with a few dark leaves.
  bramble(ctx, o) {
    const { spec, rng } = ctx;
    const S = o.scale ?? 1;
    const n = spec.canes[0] + Math.floor(rng() * (spec.canes[1] - spec.canes[0] + 1));
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * TAU + rng() * 0.8;
      const cane = grow(ctx, [0, 0, 0], tilt3([0, 1, 0], 0.45 + rng() * 0.35, phi), lerpR(rng, spec.len) * S, 0.011, 0.005, 1, 0);
      cardsOn(ctx, cane, spec.cards, 0.15);
    }
    return { trunkR: 0, height: 1 };
  },

  // Fallen log lying along x, broken ends and stubs.
  log(ctx, o) {
    const { spec, rng } = ctx;
    const S = o.scale ?? 1;
    const len = lerpR(rng, spec.len) * S;
    const r = lerpR(rng, spec.r) * S;
    const bend = (rng() - 0.5) * 0.4;
    const pts = [];
    const radii = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push([(t - 0.5) * len, r * 0.8, Math.sin(t * Math.PI) * bend]);
      radii.push(r * (1.08 - t * 0.2) * (0.94 + rng() * 0.12));
    }
    ctx.branches.push({ pts, dirs: null, radii, winds: pts.map(() => 0), len, depth: 0, r0: r, cap: true, capStart: true });
    const n = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const a = at(ctx.branches[0], 0.15 + rng() * 0.7);
      const d = tilt3([1, 0, 0], 0.8 + rng() * 0.6, rng() * TAU);
      d[1] = Math.max(d[1], -0.1);
      norm3(d);
      const stub = grow(ctx, a.p, d, 0.25 + rng() * 0.6, r * 0.3, r * 0.15, 2, 0);
      stub.cap = true;
    }
    return { trunkR: 0, height: r * 2, len, r };
  },

  stump(ctx, o) {
    const { spec, rng } = ctx;
    const S = o.scale ?? 1;
    const h = lerpR(rng, spec.h) * S;
    const r = lerpR(rng, spec.r) * S;
    const j = () => (rng() - 0.5) * 0.04;
    const pts = [[0, -0.2, 0], [j(), 0.15, j()], [j(), h * 0.6, j()], [j(), h, j()]];
    ctx.branches.push({ pts, dirs: null, radii: [r * 1.5, r * 1.12, r * 1.02, r], winds: [0, 0, 0, 0], len: h, depth: 0, r0: r, cap: true });
    roots(ctx, r, 4);
    if (rng() < 0.6) {
      for (let k = 0; k < 3; k++) {
        const a = rng() * TAU;
        grow(ctx, [Math.cos(a) * r * 0.6, h - 0.02, Math.sin(a) * r * 0.6], norm3([Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15]), 0.1 + rng() * 0.25, r * 0.25, 0.004, 2, 0);
      }
    }
    return { trunkR: r, height: h };
  },

  // A scatter of dead sticks lying on the ground (about 2.5 m across).
  sticks(ctx) {
    const { rng } = ctx;
    const n = 6 + Math.floor(rng() * 5);
    for (let k = 0; k < n; k++) {
      const cx = (rng() - 0.5) * 2.4;
      const cz = (rng() - 0.5) * 2.4;
      const a = rng() * TAU;
      const len = 0.4 + rng() * 1.0;
      const r = 0.008 + rng() * 0.012;
      const dx = Math.cos(a) * len * 0.5;
      const dz = Math.sin(a) * len * 0.5;
      const b = (rng() - 0.5) * 0.08;
      const pts = [[cx - dx, r, cz - dz], [cx - dz * b * 4, r, cz + dx * b * 4], [cx + dx, r, cz + dz]];
      ctx.branches.push({ pts, dirs: null, radii: [r, r * 0.85, r * 0.55], winds: [0, 0, 0], len, depth: 3, r0: r });
      if (rng() < 0.4) {
        const f = [cx + dx * 0.9 - dz * 0.4, r * 0.7, cz + dz * 0.9 + dx * 0.4];
        ctx.branches.push({ pts: [[cx + dx * 0.2, r, cz + dz * 0.2], f], dirs: null, radii: [r * 0.6, r * 0.3], winds: [0, 0], len: len * 0.4, depth: 3, r0: r * 0.6 });
      }
    }
    return { trunkR: 0, height: 0.05 };
  },

  // A dead branch lying flat along +x (local y = the surface it rests on).
  fallen(ctx) {
    const { spec, rng } = ctx;
    const len = lerpR(rng, spec.len);
    const main = grow(ctx, [0, 0.1, 0], [1, 0.02, 0], len, 0.1, 0.03, 1, 0);
    main.capStart = true;
    for (const p of main.pts) p[1] = 0.1 + (p[1] - 0.1) * 0.15;
    const n = 5 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const t = 0.2 + 0.75 * ((k + rng() * 0.5) / n);
      const a = at(main, t);
      const side = k % 2 ? 1 : -1;
      const ang = side * (0.45 + rng() * 0.5);
      const d = norm3([a.d[0] * Math.cos(ang) - a.d[2] * Math.sin(ang), 0.06 + rng() * 0.08, a.d[0] * Math.sin(ang) + a.d[2] * Math.cos(ang)]);
      const cl = len * (0.25 + rng() * 0.2) * (1.2 - t * 0.5);
      const cr = a.r * 0.55;
      const c = grow(ctx, [a.p[0], cr, a.p[2]], d, cl, cr, cr * 0.3, 2, 0);
      for (const p of c.pts) p[1] = Math.max(cr * 0.8, Math.min(p[1], 0.2));
      cardsOn(ctx, c, spec.cards, 0.5);
    }
    return { trunkR: 0, height: 0.3 };
  },
};

// Tubes for every grown branch into the bark buffer.
function emitBark(ctx) {
  const { spec, rng } = ctx;
  const base = hex(spec.bark);
  const capCol = hex(spec.cap ?? 0x8a7a64);
  for (const b of ctx.branches) {
    const radial = spec.radial[Math.min(b.depth, spec.radial.length - 1)];
    const uRep = Math.max(1, Math.round((TAU * b.r0) / 0.55));
    const k = 0.88 + rng() * 0.24;
    ctx.bark.tube(b.pts, b.radii, radial, [base[0] * k, base[1] * k, base[2] * k], {
      winds: b.winds,
      uRepeat: uRep,
      vScale: 1 / 1.6,
      cap: b.cap ? capCol : null,
      capStart: b.capStart ? capCol : null,
    });
  }
}

const MOSS = hex(0x3e4c1c);

// Grow a tree template. opts: { scale, lean: [x, z], reach: [x, z] (limbs bend
// that way), reachK, avoid(x, y, z) -> true inside an obstacle (in the
// template's own frame), cardScale, spec: overrides }.
// Returns { kind, geo: { bark, twig, needle }, trunkR, height, ... }.
export function makeTree(kind, seed = 1, o = {}) {
  const spec = { ...SPECS[kind], ...(o.spec || {}) };
  const rng = makeRng((seed * 7919 + kind.length * 104729) >>> 0);
  const ctx = {
    spec,
    rng,
    branches: [],
    phase: rng() * TAU,
    reach: o.reach ? [o.reach[0] * (o.reachK ?? 0.06), o.reach[1] * (o.reachK ?? 0.06)] : null,
    avoid: o.avoid || null,
    floor: spec.floor ?? -Infinity,
    windK: spec.still ? 0 : spec.windK ?? 1,
    cardScale: o.cardScale ?? 1,
    bark: new GeoBuffer({ wind: true }),
    twig: new GeoBuffer({ wind: true }),
    needle: new GeoBuffer({ wind: true }),
  };
  ctx.twigCol = hex(spec.twig ?? 0xffffff, 0.8 + rng() * 0.3);
  ctx.leafCol = hex(spec.leaf ?? 0xffffff, 0.75 + rng() * 0.3);
  ctx.needleCol = hex(spec.needle ?? 0xffffff, 0.8 + rng() * 0.3);
  const moss = (spec.moss ?? 0.5) * (0.6 + rng() * 0.6);
  if (moss > 0) {
    // Moss on upward faces and on the shaded foot of the trunk.
    ctx.bark.tint = (x, y, z, c, nx, ny, nz) => {
      let m = ny > 0.3 ? (ny - 0.3) * 1.1 * (y < 7 ? 1 : 0.4) : 0;
      if (y < 1.4) m += (1.4 - y) * 0.4 * Math.max(0, 0.4 - nz * 0.8);
      m = Math.min(0.85, m * moss * (0.7 + 0.6 * Math.sin(x * 3.1 + z * 2.3 + y * 1.7) ** 2));
      c[0] += (MOSS[0] - c[0]) * m;
      c[1] += (MOSS[1] - c[1]) * m;
      c[2] += (MOSS[2] - c[2]) * m;
    };
  }
  const info = FORMS[spec.form](ctx, o);
  emitBark(ctx);
  return {
    kind,
    ...info,
    colH: o.colH ?? 4,
    geo: {
      bark: ctx.bark.count ? ctx.bark.toGeometry() : null,
      twig: ctx.twig.count ? ctx.twig.toGeometry() : null,
      needle: ctx.needle.count ? ctx.needle.toGeometry() : null,
    },
  };
}

// ---------- Placement ----------
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _col = new THREE.Color();

function windTick(dt, t) {
  WIND.value = t;
}

// Collects placed templates and builds one BatchedMesh per material.
export class Forest {
  constructor(L, { shadows = true } = {}) {
    this.L = L;
    this.mats = treeMaterials();
    this.items = [];
    this.shadows = shadows;
    this.meshes = [];
  }

  // opts: { rotY, scale, tiltX, tiltZ, tint: [r, g, b] multiplier, collide = true, colR,
  //   shadow = true (casts the flashlight's shadow; keep it for trees near the player's path) }
  place(tpl, x, y, z, o = {}) {
    const s = o.scale ?? 1;
    _e.set(o.tiltX ?? 0, o.rotY ?? 0, o.tiltZ ?? 0, 'YXZ');
    _q.setFromEuler(_e);
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(s, s, s));
    this.items.push({ tpl, m, x, y, z, s, tint: o.tint ?? null, collide: o.collide !== false, colR: o.colR, shadow: o.shadow !== false });
    return this;
  }

  // Place with an explicit Matrix4 (e.g. a branch lying on a roof).
  placeMatrix(tpl, m, o = {}) {
    this.items.push({ tpl, m, x: 0, y: 0, z: 0, s: 1, tint: o.tint ?? null, collide: false, shadow: o.shadow !== false });
    return this;
  }

  build() {
    const L = this.L;
    for (const [part, shadow] of [['bark', true], ['bark', false], ['twig', null], ['needle', null]]) {
      const use = (it) => it.tpl.geo[part] && (shadow === null || it.shadow === shadow);
      const tpls = new Set();
      let inst = 0;
      for (const it of this.items) {
        if (!use(it)) continue;
        tpls.add(it.tpl);
        inst++;
      }
      if (!inst) continue;
      let vc = 0;
      let ic = 0;
      for (const t of tpls) {
        vc += t.geo[part].attributes.position.count;
        ic += t.geo[part].index.count;
      }
      const bm = new THREE.BatchedMesh(inst, vc, ic, this.mats[part]);
      const ids = new Map();
      for (const t of tpls) ids.set(t, bm.addGeometry(t.geo[part]));
      for (const it of this.items) {
        if (!use(it)) continue;
        const id = bm.addInstance(ids.get(it.tpl));
        bm.setMatrixAt(id, it.m);
        if (it.tint) bm.setColorAt(id, _col.setRGB(it.tint[0], it.tint[1], it.tint[2]));
      }
      bm.computeBoundingBox();
      bm.computeBoundingSphere();
      bm.castShadow = this.shadows && shadow === true;
      bm.receiveShadow = true;
      bm.name = `trees:${part}${shadow === false ? ':noShadow' : ''}`;
      L.group.add(bm);
      this.meshes.push(bm);
    }
    for (const it of this.items) {
      if (!it.collide || !it.tpl.trunkR) continue;
      const r = it.colR ?? it.tpl.trunkR * it.s + 0.04;
      L.cylinder(it.x, it.z, r, it.y - 0.5, it.y + it.tpl.colH * it.s, null, { visible: false });
    }
    L.onUpdate(windTick);
    L.onDispose(() => {
      for (const m of this.meshes) m.dispose();
    });
    return this;
  }
}
