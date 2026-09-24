import * as THREE from 'three';
import { GeoBuffer, dataTexture, normalTexture, tfbm, norm3, cross3, perp3 } from '../../world/trees.js';

// Geometry and material kit for the field set dressing (cabin, fences, well,
// scarecrow...). Boards, bricks, shingles and leaves are written straight into
// flat arrays with a per-vertex colour, so thousands of pieces build in a few
// milliseconds and merge into one mesh per material. UVs are in metres; each
// material's texture repeat turns them into tiles.

const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _nm = new THREE.Matrix3();

// sRGB hex -> linear [r, g, b] (times k).
export const lin = (hex, k = 1) => {
  _c.setHex(hex);
  return [_c.r * k, _c.g * k, _c.b * k];
};
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
// Random brightness (and a touch of hue) variation.
export const vary = (c, rng, amt = 0.12) => {
  const k = 1 + (rng() - 0.5) * 2 * amt;
  return [c[0] * k * (1 + (rng() - 0.5) * 0.08), c[1] * k, c[2] * k * (1 + (rng() - 0.5) * 0.08)];
};
export const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const AX = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export class Geo extends GeoBuffer {
  // Box centred at c on unit axes X, Y, Z with full sizes sx, sy, sz.
  // u follows the longest side (the wood grain).
  obox(c, X, Y, Z, sx, sy, sz, col, uo = 0, vo = 0) {
    const A = [X, Y, Z];
    const h = [sx / 2, sy / 2, sz / 2];
    const long = sx >= sy && sx >= sz ? 0 : sy >= sz ? 1 : 2;
    for (let k = 0; k < 3; k++) {
      for (let sg = 1; sg >= -1; sg -= 2) {
        const i1 = sg > 0 ? (k + 1) % 3 : (k + 2) % 3;
        const i2 = sg > 0 ? (k + 2) % 3 : (k + 1) % 3;
        const n = A[k];
        const a1 = A[i1];
        const a2 = A[i2];
        const h1 = h[i1];
        const h2 = h[i2];
        const cx = c[0] + n[0] * h[k] * sg;
        const cy = c[1] + n[1] * h[k] * sg;
        const cz = c[2] + n[2] * h[k] * sg;
        const swap = i2 === long;
        const base = this.count;
        for (let q = 0; q < 4; q++) {
          const s1 = q === 0 || q === 3 ? -1 : 1;
          const s2 = q < 2 ? -1 : 1;
          const u = swap ? s2 * h2 : s1 * h1;
          const v = swap ? s1 * h1 : s2 * h2;
          this.vert(
            cx + a1[0] * h1 * s1 + a2[0] * h2 * s2,
            cy + a1[1] * h1 * s1 + a2[1] * h2 * s2,
            cz + a1[2] * h1 * s1 + a2[2] * h2 * s2,
            n[0] * sg,
            n[1] * sg,
            n[2] * sg,
            u + uo,
            v + vo,
            col,
          );
        }
        this.quad(base, base + 1, base + 2, base + 3);
      }
    }
  }

  // Box at (cx, cy, cz), sizes, colour, optional Euler rotation (YXZ).
  box(cx, cy, cz, sx, sy, sz, col, rx = 0, ry = 0, rz = 0, uo = 0) {
    if (!rx && !ry && !rz) return this.obox([cx, cy, cz], AX[0], AX[1], AX[2], sx, sy, sz, col, uo);
    _e.set(rx, ry, rz, 'YXZ');
    _m.makeRotationFromEuler(_e);
    const e = _m.elements;
    this.obox([cx, cy, cz], [e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]], sx, sy, sz, col, uo);
  }

  // Axis-aligned box from min to max corners.
  aabb(x0, y0, z0, x1, y1, z1, col, uo = 0) {
    this.obox([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], AX[0], AX[1], AX[2], x1 - x0, y1 - y0, z1 - z0, col, uo);
  }

  // Board / beam along the centre line a -> b, w wide across `up`, t thick.
  beam(a, b, w, t, up, col, uo = 0) {
    const X = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(X[0], X[1], X[2]);
    norm3(X);
    const d = up[0] * X[0] + up[1] * X[1] + up[2] * X[2];
    let Y = [up[0] - X[0] * d, up[1] - X[1] * d, up[2] - X[2] * d];
    if (Math.hypot(Y[0], Y[1], Y[2]) < 1e-4) Y = perp3(X);
    norm3(Y);
    const Z = cross3(X, Y);
    this.obox([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], X, Y, Z, len, w, t, col, uo);
  }

  // 2D outline ([x, y] in the plane of unit X, Y around o) extruded t along X x Y.
  prism(o, X, Y, outline, t, col, uo = 0) {
    const Z = cross3(X, Y);
    let pts = outline.map((p) => new THREE.Vector2(p[0], p[1]));
    if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    const n = pts.length;
    const P = (p, s) => [o[0] + X[0] * p.x + Y[0] * p.y + Z[0] * s * t * 0.5, o[1] + X[1] * p.x + Y[1] * p.y + Z[1] * s * t * 0.5, o[2] + X[2] * p.x + Y[2] * p.y + Z[2] * s * t * 0.5];
    for (const s of [1, -1]) {
      const b0 = this.count;
      for (const p of pts) {
        const q = P(p, s);
        this.vert(q[0], q[1], q[2], Z[0] * s, Z[1] * s, Z[2] * s, p.x + uo, p.y, col);
      }
      for (const f of tris) {
        if (s > 0) this.tri(b0 + f[0], b0 + f[1], b0 + f[2]);
        else this.tri(b0 + f[0], b0 + f[2], b0 + f[1]);
      }
    }
    let run = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const el = Math.hypot(ex, ey) || 1;
      const nx = ey / el;
      const ny = -ex / el;
      const N = [X[0] * nx + Y[0] * ny, X[1] * nx + Y[1] * ny, X[2] * nx + Y[2] * ny];
      const b0 = this.count;
      const c0 = P(p, -1);
      const c1 = P(q, -1);
      const c2 = P(q, 1);
      const c3 = P(p, 1);
      this.vert(c0[0], c0[1], c0[2], N[0], N[1], N[2], run + uo, 0, col);
      this.vert(c1[0], c1[1], c1[2], N[0], N[1], N[2], run + el + uo, 0, col);
      this.vert(c2[0], c2[1], c2[2], N[0], N[1], N[2], run + el + uo, t, col);
      this.vert(c3[0], c3[1], c3[2], N[0], N[1], N[2], run + uo, t, col);
      this.quad(b0, b0 + 1, b0 + 2, b0 + 3);
      run += el;
    }
  }

  // Surface of revolution around the vertical axis at (cx, cy, cz). prof = [[r, y], ...] bottom to top.
  lathe(cx, cy, cz, prof, seg, col, rot = 0) {
    const n = prof.length;
    const base = this.count;
    for (let i = 0; i < n; i++) {
      const [r, y] = prof[i];
      const pa = prof[Math.max(0, i - 1)];
      const pb = prof[Math.min(n - 1, i + 1)];
      let nr = pb[1] - pa[1];
      let ny = -(pb[0] - pa[0]);
      const l = Math.hypot(nr, ny) || 1;
      nr /= l;
      ny /= l;
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2 + rot;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        this.vert(cx + ca * r, cy + y, cz + sa * r, ca * nr, ny, sa * nr, s / seg, y, col);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < seg; s++) {
        const a = base + i * (seg + 1) + s;
        const b = a + seg + 1;
        this.quad(a, b, b + 1, a + 1);
      }
    }
  }

  // Flat quad through four corners (normal from the winding).
  quadP(p0, p1, p2, p3, col, uv = [0, 0, 1, 1]) {
    const n = norm3(cross3([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]]));
    const b = this.count;
    this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], uv[0], uv[1], col);
    this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], uv[2], uv[1], col);
    this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], uv[2], uv[3], col);
    this.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], uv[0], uv[3], col);
    this.quad(b, b + 1, b + 2, b + 3);
  }

  // Append a three.js geometry transformed by a Matrix4.
  geometry(g, m, col) {
    const p = g.attributes.position;
    const nrm = g.attributes.normal;
    const uv = g.attributes.uv;
    const e = m.elements;
    const nm = _nm.getNormalMatrix(m).elements;
    const b = this.count;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = nrm.getX(i);
      const bb = nrm.getY(i);
      const c = nrm.getZ(i);
      const n = norm3([nm[0] * a + nm[3] * bb + nm[6] * c, nm[1] * a + nm[4] * bb + nm[7] * c, nm[2] * a + nm[5] * bb + nm[8] * c]);
      this.vert(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], n[0], n[1], n[2], uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, col);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.i.push(b + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.i.push(b + i);
  }
}

// Add a merged mesh for a Geo to the level (skips empty ones).
export function addMesh(L, geo, mat, { cast = true, receive = true, name = '' } = {}) {
  if (!geo.count) return null;
  const m = new THREE.Mesh(geo.toGeometry(), mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  m.name = name;
  L.group.add(m);
  return m;
}

// ---------- Textures ----------
// Weathered wood grain; u runs along the grain. 1 tile = 1.2 x 0.6 m.
function grainTextures() {
  const W = 256;
  const H = 256;
  const col = new Uint8Array(W * H * 4);
  const hgt = new Float32Array(W * H);
  const knots = [[0.3, 0.35], [0.78, 0.8], [0.55, 0.12]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const warp = tfbm(u * 2, v * 3, 2, 3, 2, 41) - 0.5;
      const lines = tfbm(u * 3, v * 40 + warp * 5, 3, 40, 3, 43);
      const fibre = tfbm(u * 24, v * 96, 24, 96, 1, 47);
      const blot = tfbm(u * 3, v * 4, 3, 4, 3, 53);
      const crack = smooth(0.03, 0, Math.abs(tfbm(u * 2, v * 9, 2, 9, 2, 59) - 0.5));
      let a = 0.84 + (lines - 0.5) * 0.5 + (fibre - 0.5) * 0.12 + (blot - 0.5) * 0.26;
      let h = lines * 0.6 + fibre * 0.25;
      for (const [kx, ky] of knots) {
        let dx = Math.abs(u - kx);
        let dy = Math.abs(v - ky);
        dx = Math.min(dx, 1 - dx) / 0.05;
        dy = Math.min(dy, 1 - dy) / 0.03;
        const d = Math.hypot(dx, dy);
        if (d < 1.6) {
          const ring = 0.5 + 0.5 * Math.cos(d * 9);
          a *= 0.6 + 0.4 * smooth(0, 1.6, d) + ring * 0.08 * (1 - d / 1.6);
          h -= (1 - d / 1.6) * 0.3;
        }
      }
      a *= 1 - crack * 0.65;
      h -= crack * 0.5;
      a = Math.max(0.12, Math.min(1, a));
      const i = y * W + x;
      hgt[i] = h;
      const k = i * 4;
      col[k] = a * 240;
      col[k + 1] = a * 232;
      col[k + 2] = a * 218;
      col[k + 3] = 255;
    }
  }
  const map = dataTexture(col, W, H, true);
  const normal = normalTexture(hgt, W, H, 2.2);
  for (const t of [map, normal]) t.repeat.set(1 / 1.2, 1 / 0.6);
  return { map, normal };
}

// Gritty stone / rust / cloth breakup. 1 tile = 0.6 m.
function gritTextures() {
  const W = 128;
  const col = new Uint8Array(W * W * 4);
  const hgt = new Float32Array(W * W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / W;
      const n = tfbm(u * 6, v * 6, 6, 6, 4, 61);
      const f = tfbm(u * 32, v * 32, 32, 32, 2, 67);
      const pit = smooth(0.7, 0.8, tfbm(u * 12, v * 12, 12, 12, 2, 71));
      const a = Math.max(0.2, Math.min(1, 0.84 + (n - 0.5) * 0.4 + (f - 0.5) * 0.22 - pit * 0.25));
      const i = y * W + x;
      hgt[i] = n * 0.6 + f * 0.4 - pit * 0.3;
      const k = i * 4;
      col[k] = a * 240;
      col[k + 1] = a * 236;
      col[k + 2] = a * 230;
      col[k + 3] = 255;
    }
  }
  const map = dataTexture(col, W, W, true);
  const normal = normalTexture(hgt, W, W, 2.5);
  for (const t of [map, normal]) t.repeat.set(1 / 0.6, 1 / 0.6);
  return { map, normal };
}

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Leaf atlas 2 x 2: 0, 1 ivy (three lobes), 2 dead oval leaf, 3 dead lobed leaf. Pale; vertex colour tints.
function leafAtlas() {
  return canvasTex(256, 256, (ctx) => {
    const lobe = (cx, cy, ang, len, wid) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(wid, -len * 0.45, 0, -len);
      ctx.quadraticCurveTo(-wid, -len * 0.45, 0, 0);
      ctx.fill();
      ctx.restore();
    };
    const veins = (cx, cy, angs, len) => {
      ctx.strokeStyle = 'rgba(120,110,95,0.9)';
      ctx.lineWidth = 1.6;
      for (const a of angs) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
        ctx.stroke();
      }
    };
    for (let k = 0; k < 4; k++) {
      const ox = (k % 2) * 128;
      const oy = (k >> 1) * 128;
      const cx = ox + 64;
      const cy = oy + 118;
      ctx.fillStyle = '#ece6da';
      if (k < 2) {
        const s = k ? 0.9 : 1;
        lobe(cx, cy - 8, 0, 100 * s, 42 * s);
        lobe(cx, cy - 10, -1.0, 70 * s, 32 * s);
        lobe(cx, cy - 10, 1.0, 70 * s, 32 * s);
        veins(cx, cy - 8, [0, -1.0, 1.0], 60 * s);
      } else if (k === 2) {
        lobe(cx, cy, 0, 108, 34);
        veins(cx, cy, [0], 96);
      } else {
        for (const a of [-1.3, -0.65, 0, 0.65, 1.3]) lobe(cx, cy - 6, a, a ? 70 : 100, 24);
        veins(cx, cy - 6, [-1.3, -0.65, 0, 0.65, 1.3], 60);
      }
      ctx.strokeStyle = 'rgba(90,80,65,1)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx, oy + 126);
      ctx.stroke();
    }
  });
}
// Cells as [u0, v0, u1, v1] (v0 at the stem).
export const LEAF_CELLS = [0, 1, 2, 3].map((k) => {
  const u0 = (k % 2) * 0.5;
  const v1 = 1 - (k >> 1) * 0.5;
  return [u0 + 0.01, v1 - 0.5 + 0.01, u0 + 0.49, v1 - 0.01];
});

// Corner cobweb: threads fan out from the bottom-left corner (uv 0, 0).
function webTexture() {
  return canvasTex(256, 256, (ctx) => {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const ox = 2;
    const oy = 254;
    const spokes = [];
    for (let a = 0.04; a < Math.PI / 2 - 0.02; a += 0.12 + r() * 0.12) spokes.push(a);
    ctx.lineCap = 'round';
    for (const a of spokes) {
      ctx.strokeStyle = `rgba(235,235,230,${0.5 + r() * 0.4})`;
      ctx.lineWidth = 1 + r() * 0.6;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      const len = 180 + r() * 70;
      ctx.lineTo(ox + Math.cos(a) * len, oy - Math.sin(a) * len);
      ctx.stroke();
    }
    // Sagging spiral between the spokes.
    for (let rad = 16; rad < 230; rad += 9 + r() * 9) {
      ctx.strokeStyle = `rgba(230,230,225,${0.3 + r() * 0.4})`;
      ctx.lineWidth = 0.8 + r() * 0.5;
      ctx.beginPath();
      for (let i = 0; i < spokes.length - 1; i++) {
        if (r() < 0.12) continue;
        const a0 = spokes[i];
        const a1 = spokes[i + 1];
        const x0 = ox + Math.cos(a0) * rad;
        const y0 = oy - Math.sin(a0) * rad;
        const x1 = ox + Math.cos(a1) * rad;
        const y1 = oy - Math.sin(a1) * rad;
        const am = (a0 + a1) / 2;
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(ox + Math.cos(am) * rad * 0.9, oy - Math.sin(am) * rad * 0.9 + 3, x1, y1);
      }
      ctx.stroke();
    }
    // A few broken strands hanging loose.
    for (let i = 0; i < 5; i++) {
      const x = 30 + r() * 180;
      const y = 254 - r() * 180;
      ctx.strokeStyle = 'rgba(225,225,220,0.45)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 6, y + 20, x + 2, y + 30 + r() * 30);
      ctx.stroke();
    }
  });
}

// ---------- Materials (built once, shared by the dusk and dawn builds) ----------
let MATS = null;

export function fieldMaterials() {
  if (MATS) return MATS;
  const grain = grainTextures();
  const grit = gritTextures();
  MATS = {
    wood: new THREE.MeshStandardMaterial({ map: grain.map, normalMap: grain.normal, roughness: 0.92, vertexColors: true }),
    rough: new THREE.MeshStandardMaterial({ map: grit.map, normalMap: grit.normal, roughness: 0.95, vertexColors: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8a9a94, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    // Unlit and brighter than 1 so it blooms.
    flame: new THREE.MeshBasicMaterial({ vertexColors: true }),
    // Warm light seen through gaps in the boards (only visible from outside).
    leak: new THREE.MeshBasicMaterial({ vertexColors: true }),
    // Soft glow in the windows, faded out up close where the real lights take over.
    haze: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    web: new THREE.MeshStandardMaterial({ map: webTexture(), color: 0xc8c4bc, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, roughness: 0.55 }),
    leaf: new THREE.MeshStandardMaterial({ map: leafAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 }),
    weed: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, vertexColors: true, roughness: 1 }),
  };
  for (const [k, m] of Object.entries(MATS)) m.name = `field:${k}`;
  return MATS;
}

// ---------- Small builders shared by the cabin and the woods ----------

// Clump of dry weed blades (optionally with seed heads) rooted at (x, y, z).
export function weedClump(g, rng, x, y, z, h = 0.7, n = 7, tall = 1) {
  const dry = [lin(0x8a7a52), lin(0x6e6040), lin(0x9a8a60), lin(0x5a5238), lin(0x4e5a2c)];
  for (let b = 0; b < n; b++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 0.12;
    const bx = x + Math.cos(a) * r;
    const bz = z + Math.sin(a) * r;
    const bh = h * (0.5 + rng() * 0.7) * tall;
    const lean = 0.15 + rng() * 0.35;
    const la = rng() * Math.PI * 2;
    const w = 0.012 + rng() * 0.01;
    const px = -Math.sin(la) * w;
    const pz = Math.cos(la) * w;
    const top = vary(dry[Math.floor(rng() * dry.length)], rng, 0.2);
    const bot = mulc(top, 0.35);
    const mx = bx + Math.cos(la) * lean * bh * 0.35;
    const mz = bz + Math.sin(la) * lean * bh * 0.35;
    const tx = bx + Math.cos(la) * lean * bh;
    const tz = bz + Math.sin(la) * lean * bh;
    const i0 = g.vert(bx - px, y, bz - pz, 0, 1, 0, 0, 0, bot);
    const i1 = g.vert(bx + px, y, bz + pz, 0, 1, 0, 1, 0, bot);
    const i2 = g.vert(mx + px * 0.7, y + bh * 0.55, mz + pz * 0.7, 0, 1, 0, 1, 0.5, mixc(bot, top, 0.6));
    const i3 = g.vert(mx - px * 0.7, y + bh * 0.55, mz - pz * 0.7, 0, 1, 0, 0, 0.5, mixc(bot, top, 0.6));
    const i4 = g.vert(tx, y + bh * (0.9 - lean * 0.2), tz, 0, 1, 0, 0.5, 1, top);
    g.quad(i0, i1, i2, i3);
    g.tri(i3, i2, i4);
    // Seed head on some stalks.
    if (rng() < 0.25) {
      const hy = y + bh * (0.9 - lean * 0.2);
      const c = lin(0x3a2e20);
      g.box(tx, hy + 0.03, tz, 0.025, 0.07, 0.025, c, 0, la, lean);
    }
  }
}

// Leaf-card litter lying on a surface at height fn(x, z) around (x, z) within radius r.
export function litter(g, rng, x, z, r, n, heightFn, palette) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r;
    const lx = x + Math.cos(a) * d;
    const lz = z + Math.sin(a) * d;
    const y = heightFn(lx, lz) + 0.012 + rng() * 0.01;
    const s = 0.07 + rng() * 0.08;
    const rot = rng() * Math.PI * 2;
    const U = [Math.cos(rot), (rng() - 0.5) * 0.25, Math.sin(rot)];
    const S = [-Math.sin(rot), (rng() - 0.5) * 0.25, Math.cos(rot)];
    const cell = LEAF_CELLS[2 + (rng() < 0.5 ? 1 : 0)];
    g.card([lx - U[0] * s * 0.5, y, lz - U[2] * s * 0.5], U, S, s, s * 0.9, cell, [0, 1, 0], vary(palette[Math.floor(rng() * palette.length)], rng, 0.25));
  }
}

export const LITTER_COLORS = [lin(0x6a4424), lin(0x5a3a1e), lin(0x7a5226), lin(0x4a3420), lin(0x3a2c1e), lin(0x6e3a1c)];
