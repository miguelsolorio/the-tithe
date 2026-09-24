import * as THREE from 'three';
import { makeRng } from '../../core/rng.js';
import { norm3, cross3 } from '../../world/trees.js';
import { Geo, addMesh, fieldMaterials, lin, mixc, mulc, vary, smooth, weedClump, litter, LEAF_CELLS, LITTER_COLORS } from './kit.js';

// The cabin as seen from the field: small, abandoned and falling apart, with
// candlelight inside (you see it through broken windows, gaps between the
// boards and, once it swings open, the doorway). The level adds the door leaf
// and the doorway exit, so the opening stays clear: x in [c.x - 0.5, c.x + 0.5],
// y from c.base to c.base + 2.08, in the south wall at z = c.z + c.d / 2, and
// the porch in front is walkable. Candles are out in the dawn variant.
//
// c = { x, z, w, d, h, base, dawn, heightAt }

const TAU = Math.PI * 2;
const MOSS = lin(0x3c4a1c);
const BOARDS = [lin(0x7a6e62), lin(0x665a4c), lin(0x564a3e), lin(0x857a6c), lin(0x5e5244), lin(0x6e6152)];
const INNER = lin(0x4a3c30);
const CANDLE = 0xe08a2c;

export function buildCabinExterior(L, c) {
  const K = setup(L, c);
  foundation(K);
  floor(K);
  walls(K);
  roof(K);
  chimney(K);
  porch(K);
  doorway(K);
  windows(K);
  interior(K);
  ivy(K);
  grounds(K);
  finish(K);
}

function setup(L, c) {
  const x0 = c.x - c.w / 2;
  const x1 = c.x + c.w / 2;
  const z0 = c.z - c.d / 2;
  const z1 = c.z + c.d / 2;
  const top = c.base + c.h;
  const K = {
    L,
    c,
    dawn: !!c.dawn,
    rng: makeRng(1234),
    x0,
    x1,
    z0,
    z1,
    top,
    base: c.base,
    mats: fieldMaterials(),
    g: {
      wood: new Geo(),
      rough: new Geo(),
      glass: new Geo(),
      flame: new Geo(),
      leak: new Geo(),
      doorLeak: new Geo(),
      haze: new Geo(),
      web: new Geo(),
      leaf: new Geo(),
      weed: new Geo(),
    },
    // Interior candle lights (dusk): the table, the mantel, and the level's own window light.
    lights: [
      [c.x + 2.45, c.base + 1.05, c.z + 0.9],
      [c.x - 2.45, c.base + 1.45, c.z + 0.25],
      [c.x + 1.6, 1.6, c.z + 1.4],
    ],
  };
  // Walls: start corner, along (x, z) and outward normal; along x up = outward.
  K.walls = {
    S: { ox: x0, oz: z1, ax: 1, az: 0, nx: 0, nz: 1, len: c.w },
    E: { ox: x1, oz: z1, ax: 0, az: -1, nx: 1, nz: 0, len: c.d },
    N: { ox: x1, oz: z0, ax: -1, az: 0, nx: 0, nz: -1, len: c.w },
    W: { ox: x0, oz: z0, ax: 0, az: 1, nx: -1, nz: 0, len: c.d },
  };
  const b = c.base;
  K.windows = [
    { wall: 'S', s0: 0.75, s1: 1.65, y0: b + 0.9, y1: b + 1.9, kind: 'boarded' },
    { wall: 'S', s0: 4.35, s1: 5.25, y0: b + 0.9, y1: b + 1.9, kind: 'shutter' },
    { wall: 'E', s0: 2.4, s1: 3.4, y0: b + 0.9, y1: b + 1.9, kind: 'curtain' },
    { wall: 'N', s0: 3.0, s1: 4.0, y0: b + 1.0, y1: b + 1.8, kind: 'sealed' },
  ];
  K.openings = {
    S: [{ s0: c.w / 2 - 0.5, s1: c.w / 2 + 0.5, y0: b - 1, y1: b + 2.08 }, ...K.windows.filter((w) => w.wall === 'S')],
    E: K.windows.filter((w) => w.wall === 'E'),
    N: K.windows.filter((w) => w.wall === 'N'),
    W: [{ s0: c.d / 2 - 0.48, s1: c.d / 2 + 0.48, y0: -1, y1: 9 }],
  };
  // Boards torn off in patches (wall, s range, rows).
  K.holes = [
    { wall: 'S', s0: 5.32, s1: 5.95, r0: 1, r1: 4 },
    { wall: 'N', s0: 0.15, s1: 1.35, r0: 7, r1: 10 },
    { wall: 'W', s0: 3.7, s1: 4.6, r0: 2, r1: 3 },
    { wall: 'E', s0: 0.55, s1: 1.25, r0: 5, r1: 6 },
  ];
  return K;
}

// World point on a wall: s along it, height y, o outward from the frame.
function wp(wl, s, y, o) {
  return [wl.ox + wl.ax * s + wl.nx * o, y, wl.oz + wl.az * s + wl.nz * o];
}

// Warm light reaching a point from the candles inside (0..1).
function glowAt(K, p) {
  let k = 0;
  for (const l of K.lights) {
    const d = Math.hypot(p[0] - l[0], p[1] - l[1], p[2] - l[2]);
    k = Math.max(k, 1.2 - d / 3.4);
  }
  return Math.min(1, Math.max(0.12, k));
}

// Emissive strip seen through a gap: a quad facing out of the wall, just inside the boards.
function leakStrip(K, wl, s0, s1, y0, y1, geo = K.g.leak) {
  if (K.dawn) return;
  const mid = wp(wl, (s0 + s1) / 2, (y0 + y1) / 2, -0.006);
  const k = glowAt(K, mid);
  const col = [0.62 * k, 0.25 * k, 0.07 * k];
  const a = wp(wl, s0, y0, -0.006);
  const b = wp(wl, s1, y0, -0.006);
  const cc = wp(wl, s1, y1, -0.006);
  const d = wp(wl, s0, y1, -0.006);
  geo.quadP(a, b, cc, d, col);
}

// ---------- Foundation and floor ----------
function foundation(K) {
  const { rng, x0, x1, z0, z1, g } = K;
  const stone = [lin(0x6a665e), lin(0x5a564e), lin(0x74695c), lin(0x4e4c46), lin(0x625a50)];
  g.rough.tint = (x, y, zz, col) => {
    const m = y < 0.12 ? 0.45 : 0;
    col[0] += (MOSS[0] - col[0]) * m;
    col[1] += (MOSS[1] - col[1]) * m;
    col[2] += (MOSS[2] - col[2]) * m;
  };
  // Dark crawlspace behind the stones.
  g.rough.aabb(x0 + 0.05, -0.2, z0 + 0.05, x1 - 0.05, 0.3, z1 - 0.05, lin(0x0a0908));
  for (const id of ['S', 'E', 'N', 'W']) {
    const wl = K.walls[id];
    for (const [yb, hh] of [[-0.12, 0.2], [0.08, 0.22]]) {
      let s = -0.04 + rng() * 0.1;
      while (s < wl.len + 0.04) {
        const len = 0.22 + rng() * 0.24;
        if (rng() > 0.05) {
          const p = wp(wl, s + len / 2, yb + hh / 2, 0.02 + rng() * 0.03);
          const col = vary(stone[Math.floor(rng() * stone.length)], rng, 0.18);
          const ry = Math.atan2(wl.nx, wl.nz);
          g.rough.box(p[0], p[1], p[2], len - 0.02, hh * (0.85 + rng() * 0.2), 0.18, col, (rng() - 0.5) * 0.08, ry + (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.1);
        }
        s += len;
      }
    }
  }
  g.rough.tint = null;
  // Rotten sill beam on the stones.
  for (const id of ['S', 'E', 'N', 'W']) {
    const wl = K.walls[id];
    const a = wp(wl, -0.03, 0.36, 0.0);
    const b = wp(wl, wl.len + 0.03, 0.36, 0.0);
    g.wood.beam(a, b, 0.13, 0.14, [0, 1, 0], vary(lin(0x3a3028), rng, 0.1), rng() * 9);
  }
}

function floor(K) {
  const { rng, x0, x1, z0, z1, base, g } = K;
  const cx = K.c.x;
  // Floorboards along x, a few missing (dark crawlspace below) or broken.
  const missing = (x, zz) => (x > cx - 2.5 && x < cx - 1.55 && zz > K.c.z - 1.35 && zz < K.c.z - 0.85) || (x > cx + 1.2 && x < cx + 1.7 && zz > K.c.z - 1.9 && zz < K.c.z - 1.6);
  g.wood.tint = (x, y, zz, col) => {
    // Darker toward the walls and in a damp patch under the east window.
    const edge = Math.min(x - x0, x1 - x, zz - z0, z1 - zz);
    const k = 0.55 + 0.45 * smooth(0.05, 0.9, edge);
    const damp = Math.max(0, 1 - Math.hypot(x - (x1 - 0.5), zz - (K.c.z - 0.4)) / 1.2) * 0.5;
    col[0] *= k * (1 - damp);
    col[1] *= k * (1 - damp);
    col[2] *= k * (1 - damp * 0.8);
  };
  for (let zz = z0 + 0.1; zz < z1 - 0.1; zz += 0.148) {
    const joint = x0 + 1.2 + rng() * 3.6;
    for (const [a, b] of [[x0 + 0.1, joint], [joint + 0.006, x1 - 0.1]]) {
      const col = mulc(vary(lin(0x6a5a48), rng, 0.15), 0.9);
      // Split around missing boards.
      let s = a;
      for (let x = a; x <= b + 0.001; x += 0.1) {
        const gone = missing(x, zz + 0.07) || x >= b;
        if (gone) {
          const e = Math.min(x, b);
          if (e - s > 0.12) g.wood.box((s + e) / 2, base - 0.0125, zz + 0.07, e - s, 0.025, 0.14, col, 0, 0, 0, rng() * 9);
          s = x + 0.1;
        }
      }
    }
  }
  g.wood.tint = null;
  // Joists under the floor, seen through the holes.
  for (let x = x0 + 0.4; x < x1; x += 0.6) g.wood.aabb(x - 0.04, base - 0.2, z0 + 0.1, x + 0.04, base - 0.026, z1 - 0.1, lin(0x2a2018));
}

// ---------- Walls: frame, studs and weathered siding ----------
function walls(K) {
  const { rng, base, top, g } = K;
  const studCol = lin(0x5a4a3a);
  for (const id of ['S', 'E', 'N', 'W']) {
    const wl = K.walls[id];
    const ops = K.openings[id];
    // Studs (seen through gaps and from inside), plates, corner posts.
    for (let s = 0.05; s < wl.len; s += 0.6) {
      if (ops.some((o) => s > o.s0 - 0.06 && s < o.s1 + 0.06 && o.y0 < base + 0.5)) continue;
      const p = wp(wl, s, (base + top) / 2, -0.05);
      const low = ops.find((o) => s > o.s0 - 0.06 && s < o.s1 + 0.06);
      if (low) {
        // Short studs above and below a window.
        const pa = wp(wl, s, (base + low.y0) / 2, -0.05);
        const pb = wp(wl, s, (low.y1 + top) / 2, -0.05);
        g.wood.beam([pa[0], base, pa[2]], [pa[0], low.y0 - 0.04, pa[2]], 0.1, 0.05, [wl.nx, 0, wl.nz], vary(studCol, rng, 0.12));
        g.wood.beam([pb[0], low.y1 + 0.06, pb[2]], [pb[0], top - 0.08, pb[2]], 0.1, 0.05, [wl.nx, 0, wl.nz], vary(studCol, rng, 0.12));
        continue;
      }
      g.wood.beam([p[0], base, p[2]], [p[0], top - 0.08, p[2]], 0.1, 0.05, [wl.nx, 0, wl.nz], vary(studCol, rng, 0.12), rng() * 9);
    }
    for (const o of ops) {
      if (o.y1 > 8) continue;
      for (const s of [o.s0 - 0.03, o.s1 + 0.03]) {
        const p = wp(wl, s, 0, -0.05);
        g.wood.beam([p[0], base, p[2]], [p[0], top - 0.08, p[2]], 0.1, 0.06, [wl.nx, 0, wl.nz], vary(studCol, rng, 0.1));
      }
      const hp = wp(wl, (o.s0 + o.s1) / 2, o.y1 + 0.03, -0.05);
      const ha = wp(wl, o.s0 - 0.06, o.y1 + 0.03, -0.05);
      const hb = wp(wl, o.s1 + 0.06, o.y1 + 0.03, -0.05);
      g.wood.beam(ha, hb, 0.08, 0.1, [0, 1, 0], vary(studCol, rng, 0.1));
      if (o.y0 > base + 0.2) g.wood.beam(wp(wl, o.s0 - 0.06, o.y0 - 0.03, -0.05), wp(wl, o.s1 + 0.06, o.y0 - 0.03, -0.05), 0.06, 0.1, [0, 1, 0], vary(studCol, rng, 0.1));
      void hp;
    }
    g.wood.beam(wp(wl, 0, top - 0.04, -0.05), wp(wl, wl.len, top - 0.04, -0.05), 0.08, 0.1, [0, 1, 0], vary(studCol, rng, 0.1));
    // Corner boards over the siding ends.
    g.wood.beam(wp(wl, 0.06, 0.3, 0.045), wp(wl, 0.06, top + 0.02, 0.045), 0.13, 0.03, [wl.ax, 0, wl.az], vary(lin(0x4e4236), rng, 0.1), rng() * 9);
    siding(K, id, wl, ops);
  }
}

function siding(K, id, wl, ops) {
  const { rng, base, g } = K;
  const rows = 13;
  const rowH = (K.top - base) / rows;
  // Rot and moss low on the wall, streaks under the windows.
  g.wood.tint = (x, y, zz, col) => {
    const k = 0.5 + 0.5 * smooth(0.25, 1.4, y);
    const m = y < 1.1 ? (1.1 - y) * 0.55 * (0.4 + 0.6 * Math.sin(x * 7.1 + zz * 5.3) ** 2) : 0;
    col[0] = col[0] * k * (1 - m) + MOSS[0] * m;
    col[1] = col[1] * k * (1 - m) + MOSS[1] * m;
    col[2] = col[2] * k * (1 - m) + MOSS[2] * m;
  };
  const inHole = (s0, s1, r) => K.holes.some((h) => h.wall === id && r >= h.r0 && r <= h.r1 && s1 > h.s0 && s0 < h.s1);
  for (let r = 0; r < rows; r++) {
    const y0 = base + r * rowH;
    const y1 = y0 + rowH;
    // Free spans of this row between openings.
    let spans = [[0, wl.len]];
    for (const o of ops) {
      if (o.y1 <= y0 + 0.02 || o.y0 >= y1 - 0.02) continue;
      const next = [];
      for (const [a, b] of spans) {
        if (o.s1 <= a || o.s0 >= b) next.push([a, b]);
        else {
          if (o.s0 > a) next.push([a, o.s0]);
          if (o.s1 < b) next.push([o.s1, b]);
        }
      }
      spans = next;
    }
    for (const [a, b] of spans) {
      // Butt joints split the span into boards.
      let s = a;
      while (s < b - 0.05) {
        let e = Math.min(b, s + 1.1 + rng() * 1.6);
        if (b - e < 0.4) e = b;
        const jg = e < b ? 0.004 + rng() * 0.016 : 0;
        board(K, id, wl, r, s, e - jg, y0, y1, inHole(s, e, r));
        if (jg > 0.01 && r > 0 && !inHole(s - 0.3, e + 0.3, r)) leakStrip(K, wl, e - jg - 0.012, e + 0.012, y0 + 0.01, y1 - 0.01);
        s = e;
      }
    }
  }
  g.wood.tint = null;
}

// One siding board: in place, warped, broken short, hanging off a nail, or gone.
function board(K, id, wl, r, s0, s1, y0, y1, hole) {
  const { rng, g } = K;
  if (hole) return;
  const len = s1 - s0;
  const roll = rng();
  const gap = roll < 0.7 ? 0.004 : roll < 0.9 ? 0.012 + rng() * 0.008 : 0.024 + rng() * 0.018;
  const h = y1 - y0 - gap;
  const col = vary(BOARDS[Math.floor(rng() * BOARDS.length)], rng, 0.14);
  const uo = rng() * 20;
  const fate = rng();
  const nearDoor = id === 'S' && s1 > K.c.w / 2 - 1.0 && s0 < K.c.w / 2 + 1.0;
  const up = [0, 1, 0];
  const along = [wl.ax, 0, wl.az];
  if (!nearDoor && fate < 0.035) return; // missing
  if (!nearDoor && fate < 0.06 && len > 0.5 && len < 2.2 && r > 1) {
    // Hanging from one nail, the free end dropped.
    const left = rng() < 0.5;
    const piv = left ? s0 + 0.05 : s1 - 0.05;
    const ang = 0.25 + rng() * 0.5;
    const L = Math.min(len, 1.4);
    const dir = left ? 1 : -1;
    const a = wp(wl, piv, y1 - 0.06, 0.03);
    const dx = along[0] * Math.cos(ang) * dir;
    const dz = along[2] * Math.cos(ang) * dir;
    const b = [a[0] + dx * L, a[1] - Math.sin(ang) * L, a[2] + dz * L];
    g.wood.beam(a, b, h, 0.026, up, col, uo);
    return;
  }
  if (fate < 0.14 && len > 0.6) {
    // Broken short with a splintered end.
    const cut = 0.15 + rng() * 0.35;
    const keepLeft = rng() < 0.5;
    const L = len - cut;
    const o = wp(wl, keepLeft ? s0 : s0 + cut, y0 + gap, 0.014);
    const j = [];
    const n = 4;
    for (let i = 0; i <= n; i++) j.push([L + (rng() - 0.3) * 0.09, (h * i) / n]);
    const outline = keepLeft ? [[0, 0], ...j, [0, h]] : [[0, 0], [L, 0], [L, h], ...j.reverse().map(([u, v]) => [L - u, v])];
    g.wood.prism(o, along, up, outline, 0.026, col, uo);
    if (gap > 0.01 && !K.dawn) leakStrip(K, wl, s0, s1, y0 - 0.01, y0 + gap + 0.012);
    return;
  }
  const mid = wp(wl, (s0 + s1) / 2, y0 + gap + h / 2, 0.014);
  if (fate < 0.24) {
    // Warped: bottom edge lifting off the wall.
    const t = 0.04 + rng() * 0.06;
    const tu = [wl.nx * Math.sin(t), Math.cos(t), wl.nz * Math.sin(t)];
    g.wood.beam(wp(wl, s0, mid[1], 0.022), wp(wl, s1, mid[1], 0.022), h, 0.026, tu, col, uo);
  } else {
    g.wood.beam(wp(wl, s0, mid[1], 0.014), wp(wl, s1, mid[1], 0.014), h, 0.028, up, col, uo);
  }
  // Light through the gap under this board.
  if (gap > 0.01 && r > 0) leakStrip(K, wl, s0, s1, y0 - 0.012, y0 + gap + 0.012);
}

// ---------- Roof: sagging ridge, rafters, sheathing, shingles with holes ----------
function roofFns(K) {
  const { c, top } = K;
  const eaveZ = c.d / 2 + 0.45;
  const slope = 1.7 / (c.d / 2);
  const ey0 = top - 0.45 * slope;
  const ry0 = top + 1.7;
  const sagK = (x) => Math.max(0, 1 - ((x - c.x) / 3.25) ** 2);
  // Point on the top of the rafters: v = 0 at the eave, 1 at the ridge; side 1 south, -1 north.
  const P = (x, v, side) => {
    const s = sagK(x);
    const ey = ey0 - 0.05 * s;
    const ry = ry0 - 0.26 * s;
    return [x, ey + (ry - ey) * v - 0.07 * Math.sin(Math.PI * v) * s, c.z + side * eaveZ * (1 - v)];
  };
  // Right-handed frame there: X along the ridge, T up the slope, n out of the roof.
  const F = (x, v, side) => {
    const p = P(x, v, side);
    const a = P(x, Math.min(1, v + 0.01), side);
    const b = P(x, Math.max(0, v - 0.01), side);
    const T = norm3([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
    const e = P(x + 0.01, v, side);
    const f = P(x - 0.01, v, side);
    let X = norm3([e[0] - f[0], e[1] - f[1], e[2] - f[2]]);
    let n = norm3(cross3(X, T));
    if (n[1] < 0) {
      n = [-n[0], -n[1], -n[2]];
      X = [-X[0], -X[1], -X[2]];
    }
    return { p, T, X, n };
  };
  const holes = [
    { side: 1, x: c.x + 1.45, v: 0.55, rx: 0.78, rv: 0.2, deep: true },
    { side: 1, x: c.x - 2.1, v: 0.22, rx: 0.4, rv: 0.1 },
    { side: 1, x: c.x + 0.15, v: 0.84, rx: 0.3, rv: 0.07 },
    { side: -1, x: c.x - 0.9, v: 0.68, rx: 0.65, rv: 0.2, deep: true },
    { side: -1, x: c.x + 2.2, v: 0.3, rx: 0.45, rv: 0.12 },
  ];
  // 0 intact, 1 shingles gone, 2 open to the rafters.
  const hole = (x, v, side) => {
    let best = 0;
    for (const h of holes) {
      if (h.side !== side) continue;
      const n = 0.22 * Math.sin(x * 9.1 + v * 23.3) + 0.14 * Math.sin(x * 23.7 - v * 41.1);
      const d = Math.hypot((x - h.x) / h.rx, (v - h.v) / h.rv) + n;
      if (d < 1) best = Math.max(best, h.deep && d < 0.72 ? 2 : 1);
    }
    return best;
  };
  return { P, F, hole, eaveZ, x0: K.x0 - 0.08, x1: K.x1 + 0.3, len: Math.hypot(eaveZ, 1.7 + 0.45 * slope) };
}

const add3 = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];

function roof(K) {
  const { c, rng, g } = K;
  const R = roofFns(K);
  K.roof = R;
  const beamCol = lin(0x4e4032);
  // Rafters, one broken over the big hole with a piece dangling into the room.
  for (const side of [1, -1]) {
    for (let i = 0; i <= 10; i++) {
      const rx = K.x0 + 0.05 + i * 0.59;
      const broken = side === 1 && i === 7;
      const vs = broken ? [[0, 0.2], [0.2, 0.42], [0.68, 0.84], [0.84, 1]] : [[0, 0.33], [0.33, 0.66], [0.66, 1]];
      for (const [va, vb] of vs) {
        const fa = R.F(rx, va, side);
        const fb = R.F(rx, vb, side);
        g.wood.beam(add3(fa.p, fa.n, -0.07), add3(fb.p, fb.n, -0.07), 0.12, 0.05, fa.n, vary(beamCol, rng, 0.12), rng() * 9);
      }
      if (broken) {
        const f = R.F(rx, 0.68, side);
        const a = add3(f.p, f.n, -0.07);
        g.wood.beam(a, [a[0] + 0.18, a[1] - 1.3, a[2] + 0.45], 0.11, 0.05, [1, 0, 0], vary(beamCol, rng, 0.1));
      }
    }
  }
  // Ridge beam and ceiling joists / collar ties across the room.
  for (let x = R.x0; x < R.x1 - 0.05; x += 1.1) {
    const xb = Math.min(R.x1, x + 1.1);
    const a = R.P(x, 1, 1);
    const b = R.P(xb, 1, 1);
    g.wood.beam([a[0], a[1] - 0.1, a[2]], [b[0], b[1] - 0.1, b[2]], 0.16, 0.05, [0, 1, 0], vary(beamCol, rng, 0.1));
  }
  for (const i of [2, 5, 8]) {
    const rx = K.x0 + 0.05 + i * 0.59 + 0.05;
    g.wood.beam([rx, K.top + 0.06, K.z0 + 0.05], [rx, K.top + 0.06, K.z1 - 0.05], 0.12, 0.05, [0, 1, 0], vary(beamCol, rng, 0.1));
    const v = 0.62;
    const fa = R.F(rx, v, 1);
    const fb = R.F(rx, v, -1);
    g.wood.beam([rx, fa.p[1] - 0.2, fa.p[2]], [rx, fb.p[1] - 0.2, fb.p[2]], 0.1, 0.05, [0, 1, 0], vary(beamCol, rng, 0.1));
  }
  // Sheathing boards on the rafters, gone where the roof is open.
  const sheath = lin(0x5a4a3a);
  for (const side of [1, -1]) {
    for (let v = 0.03; v < 0.99; v += 0.25 / R.len) {
      let start = null;
      for (let x = R.x0; x <= R.x1 + 0.051; x += 0.1) {
        const open = x > R.x1 || R.hole(x, v, side) === 2;
        if (!open && start === null) start = x;
        if (open && start !== null) {
          for (let s = start; s < x - 0.12; s += 1.2) {
            const e = Math.min(x - 0.02, s + 1.2);
            const fa = R.F(s, v, side);
            const fb = R.F(e, v, side);
            g.wood.beam(add3(fa.p, fa.n, -0.01), add3(fb.p, fb.n, -0.01), 0.2, 0.02, fa.T, vary(sheath, rng, 0.15), rng() * 9);
          }
          start = null;
        }
      }
    }
  }
  // Wooden shakes: courses from the eave up, curled, slipped and missing ones, moss.
  const SH = [lin(0x5a5046), lin(0x4a4038), lin(0x665a4e), lin(0x40382e), lin(0x70645a)];
  const mossC = lin(0x3e4e1c);
  const dv = 0.2 / R.len;
  const lv = 0.42 / R.len;
  for (const side of [1, -1]) {
    let row = 0;
    for (let v = 0; v < 1 - dv * 0.4; v += dv, row++) {
      let x = R.x0 - 0.03 - (row % 2 ? 0.12 : 0) - rng() * 0.08;
      while (x < R.x1 + 0.02) {
        const w = 0.16 + rng() * 0.16;
        const xc = Math.min(x + w / 2, R.x1 - w / 2 + 0.03);
        const ww = Math.min(w, R.x1 + 0.03 - x);
        x += w + 0.005 + rng() * 0.012;
        if (ww < 0.06 || R.hole(xc, v + dv * 0.5, side) > 0 || rng() < 0.03) continue;
        const vc = Math.min(0.995, v + lv / 2);
        const f = R.F(xc, vc, side);
        let pitch = 0.04;
        if (rng() < 0.07) pitch += 0.08 + rng() * 0.12;
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        let T = [f.T[0] * cp - f.n[0] * sp, f.T[1] * cp - f.n[1] * sp, f.T[2] * cp - f.n[2] * sp];
        const n = [f.n[0] * cp + f.T[0] * sp, f.n[1] * cp + f.T[1] * sp, f.n[2] * cp + f.T[2] * sp];
        let X = f.X;
        let p = add3(f.p, f.n, 0.03);
        if (rng() < 0.035) {
          // Slipped down the roof and twisted.
          p = add3(p, f.T, -(0.08 + rng() * 0.14));
          const a = (rng() - 0.5) * 0.6;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const X2 = [X[0] * ca + T[0] * sa, X[1] * ca + T[1] * sa, X[2] * ca + T[2] * sa];
          T = [T[0] * ca - X[0] * sa, T[1] * ca - X[1] * sa, T[2] * ca - X[2] * sa];
          X = X2;
        }
        let col = vary(SH[Math.floor(rng() * SH.length)], rng, 0.2);
        const mn = 0.5 + 0.5 * Math.sin(xc * 2.3 + vc * 7.1 + side) * Math.sin(xc * 5.7 - vc * 3.3 + 1.1);
        const m = Math.min(0.85, smooth(0.5, 0.85, mn) * (side < 0 ? 0.95 : 0.6) + (vc < 0.18 ? 0.3 : 0));
        col = mixc(col, vary(mossC, rng, 0.2), m);
        g.wood.obox(p, X, T, n, ww - 0.004, 0.42, 0.016, col, rng() * 20);
      }
    }
  }
  // Ridge cap boards (a stretch missing).
  for (const side of [1, -1]) {
    for (let xa = R.x0; xa < R.x1 - 0.05; xa += 1.0) {
      const xb = Math.min(R.x1, xa + 1.0);
      if (xa > c.x + 0.1 && xa < c.x + 1.2) continue;
      const fa = R.F(xa, 0.975, side);
      const fb = R.F(xb, 0.975, side);
      g.wood.beam(add3(fa.p, fa.n, 0.055), add3(fb.p, fb.n, 0.055), 0.2, 0.025, fa.T, vary(lin(0x4a4036), rng, 0.12), rng() * 9);
    }
  }
  gables(K, R);
  roofTrim(K, R);
}

function gables(K, R) {
  const { c, rng, g, top } = K;
  const up = [0, 1, 0];
  for (const id of ['E', 'W']) {
    const wl = K.walls[id];
    const xg = id === 'E' ? K.x1 : K.x0;
    const yRoof = (zz) => {
      const side = zz >= c.z ? 1 : -1;
      const v = 1 - Math.abs(zz - c.z) / R.eaveZ;
      return R.P(xg, v, side)[1] - 0.1;
    };
    const along = [wl.ax, 0, wl.az];
    const yb = top - 0.03;
    let s = 0;
    while (s < wl.len - 0.02) {
      const bw = 0.17 + rng() * 0.06;
      const e = Math.min(wl.len, s + bw);
      const za = wl.oz + wl.az * s;
      const zb = wl.oz + wl.az * e;
      const zm = (za + zb) / 2;
      const ha = Math.max(0.005, yRoof(za) - yb);
      const hb = Math.max(0.005, yRoof(zb) - yb);
      const col = vary(BOARDS[Math.floor(rng() * BOARDS.length)], rng, 0.15);
      const o = wp(wl, s, yb, 0.014);
      const L = e - s;
      const chim = id === 'W' && Math.abs(zm - c.z) < 0.36;
      const vent = id === 'E' && Math.abs(zm - c.z) < 0.26;
      const gone = id === 'E' && Math.abs(zm - (c.z - 0.75)) < 0.12;
      if (!chim && Math.max(ha, hb) > 0.04) {
        if (vent) {
          g.wood.prism(o, along, up, [[0, 0], [L, 0], [L, 0.62], [0, 0.62]], 0.026, col, rng() * 9);
          g.wood.prism(o, along, up, [[0, 1.08], [L, 1.08], [L, hb], [0, ha]], 0.026, col, rng() * 9);
        } else if (gone) {
          g.wood.prism(o, along, up, [[0, 0], [L, 0], [L, 0.35], [0, 0.42]], 0.026, col, rng() * 9);
        } else {
          g.wood.prism(o, along, up, [[0, 0], [L, 0], [L, hb], [0, ha]], 0.026, col, rng() * 9);
        }
      }
      s = e + 0.006 + rng() * 0.02;
    }
    if (id === 'E') {
      // Louvred attic vent, a slat missing.
      const s0 = wl.len / 2 - 0.3;
      const s1 = wl.len / 2 + 0.3;
      for (const [a, b] of [[[s0, yb + 0.62], [s1, yb + 0.62]], [[s0, yb + 1.08], [s1, yb + 1.08]], [[s0, yb + 0.62], [s0, yb + 1.08]], [[s1, yb + 0.62], [s1, yb + 1.08]]]) {
        g.wood.beam(wp(wl, a[0], a[1], 0.03), wp(wl, b[0], b[1], 0.03), 0.05, 0.03, [wl.nx, 0, wl.nz], lin(0x3e342a));
      }
      for (const yy of [0.72, 0.98]) {
        const tu = [wl.nx * 0.6, 0.8, wl.nz * 0.6];
        g.wood.beam(wp(wl, s0, yb + yy, 0.02), wp(wl, s1, yb + yy, 0.02), 0.1, 0.012, tu, lin(0x4a4034));
      }
      g.rough.aabb(xg - 0.3, yb + 0.6, c.z - 0.32, xg - 0.05, yb + 1.1, c.z + 0.32, lin(0x080706));
    }
  }
}

function roofTrim(K, R) {
  const { c, rng, g } = K;
  const trim = lin(0x4a4036);
  // Barge boards on the gable edges; the south-east one hangs loose.
  for (const [xg, sx] of [[R.x1, 1], [R.x0, -1]]) {
    for (const side of [1, -1]) {
      const fa = R.F(xg, 0, side);
      const fb = R.F(xg, 1, side);
      let a = [xg + sx * 0.015, fa.p[1] - 0.06, fa.p[2]];
      const b = [xg + sx * 0.015, fb.p[1] - 0.06, fb.p[2]];
      if (sx > 0 && side > 0) a = [xg + 0.1, fa.p[1] - 0.95, fa.p[2] - 0.35];
      g.wood.beam(a, b, 0.2, 0.028, [0, 1, 0], vary(trim, rng, 0.1), rng() * 9);
    }
  }
  // Fascia along the eaves, a piece missing above the broken gutter.
  for (const side of [1, -1]) {
    const pieces = side > 0 ? [[R.x0, c.x + 0.55], [c.x + 1.55, R.x1]] : [[R.x0, c.x + 0.4], [c.x + 0.42, R.x1]];
    for (const [xa, xb] of pieces) {
      const fa = R.F(xa, 0, side);
      const fb = R.F(xb, 0, side);
      g.wood.beam([xa, fa.p[1] - 0.07, fa.p[2] + side * 0.012], [xb, fb.p[1] - 0.07, fb.p[2] + side * 0.012], 0.18, 0.025, [0, 1, 0], vary(trim, rng, 0.1), rng() * 9);
    }
  }
  // Rusted gutter: attached along the west half, torn loose and hanging to the east.
  const rust = [lin(0x5a3322), lin(0x6a3c24), lin(0x4a2a1c), lin(0x3a2a22)];
  const gz = c.z + R.eaveZ + 0.07;
  const gy = (x) => R.P(x, 0, 1)[1] - 0.17;
  const gutter = (a, b) => {
    const col = vary(rust[Math.floor(rng() * rust.length)], rng, 0.2);
    g.rough.beam(a, b, 0.1, 0.008, [0, 0, 1], col);
    g.rough.beam([a[0], a[1] + 0.035, a[2] - 0.05], [b[0], b[1] + 0.035, b[2] - 0.05], 0.07, 0.008, [0, 1, 0], col);
    g.rough.beam([a[0], a[1] + 0.035, a[2] + 0.05], [b[0], b[1] + 0.035, b[2] + 0.05], 0.07, 0.008, [0, 1, 0], col);
  };
  gutter([K.x0 - 0.05, gy(K.x0), gz], [c.x - 1.3, gy(c.x - 1.3), gz]);
  gutter([c.x - 1.3, gy(c.x - 1.3), gz], [c.x + 0.55, gy(c.x + 0.55), gz]);
  gutter([c.x + 0.55, gy(c.x + 0.55), gz], [c.x + 2.55, 2.08, gz + 0.1]);
  for (let x = K.x0 + 0.3; x < c.x + 0.5; x += 0.9) g.rough.box(x, gy(x) + 0.04, gz - 0.04, 0.03, 0.12, 0.12, lin(0x2a2420));
  // The downspout lies in the weeds.
  g.rough.beam([K.x0 - 0.95, 0.05, c.z + 3.2], [K.x0 - 0.35, 0.1, c.z + 4.9], 0.07, 0.07, [0, 1, 0], rust[1]);
  g.rough.beam([K.x0 - 0.35, 0.1, c.z + 4.9], [K.x0 - 0.15, 0.08, c.z + 5.15], 0.07, 0.07, [0, 1, 0], rust[2]);
}

// ---------- Chimney: stone base, brick stack with a collapsed, leaning top ----------
function chimney(K) {
  const { c, rng, g, L } = K;
  const bx0 = K.x0 - 0.97;
  const bx1 = K.x0 - 0.03;
  const bz0 = c.z - 0.5;
  const bz1 = c.z + 0.5;
  const baseTop = 1.55;
  const stone = [lin(0x6e685e), lin(0x5c564c), lin(0x7a6e60), lin(0x4e4a44), lin(0x665c50)];
  g.rough.aabb(bx0 + 0.04, -0.15, bz0 + 0.04, bx1, baseTop, bz1 - 0.04, lin(0x3a3630));
  g.rough.tint = (x, y, zz, col) => {
    const m = y < 0.5 ? (0.5 - y) * 0.9 : 0;
    col[0] += (MOSS[0] - col[0]) * m;
    col[1] += (MOSS[1] - col[1]) * m;
    col[2] += (MOSS[2] - col[2]) * m;
  };
  const faces = [
    { a: [bx0, bz1], b: [bx0, bz0], n: [-1, 0] },
    { a: [bx0, bz0], b: [bx1, bz0], n: [0, -1] },
    { a: [bx1, bz1], b: [bx0, bz1], n: [0, 1] },
  ];
  for (let y = -0.15; y < baseTop - 0.06; ) {
    const hh = Math.min(baseTop - y, 0.17 + rng() * 0.09);
    for (const f of faces) {
      const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
      let s = -rng() * 0.12;
      while (s < len) {
        const sl = 0.2 + rng() * 0.22;
        const t = Math.min(1, Math.max(0, (s + sl / 2) / len));
        const px = f.a[0] + (f.b[0] - f.a[0]) * t + f.n[0] * 0.02;
        const pz = f.a[1] + (f.b[1] - f.a[1]) * t + f.n[1] * 0.02;
        const col = vary(stone[Math.floor(rng() * stone.length)], rng, 0.2);
        g.rough.box(px, y + hh / 2, pz, sl - 0.025, hh - 0.025, 0.14, col, (rng() - 0.5) * 0.06, Math.atan2(f.n[0], f.n[1]) + (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08);
        s += sl;
      }
    }
    y += hh;
  }
  g.rough.tint = null;
  g.rough.aabb(bx0 - 0.03, baseTop, bz0 - 0.03, bx1, baseTop + 0.06, bz1 + 0.03, lin(0x5a564e));
  // Brick stack.
  const sx0 = K.x0 - 0.72;
  const sx1 = K.x0 - 0.1;
  const sz0 = c.z - 0.31;
  const sz1 = c.z + 0.31;
  const bricks = [lin(0x6a3424), lin(0x7a4030), lin(0x5a2c20), lin(0x844a36), lin(0x4a2a22), lin(0x703a2a)];
  const pivotY = 3.75;
  const lean = -0.075;
  const sf = [
    { a: [sx0, sz1], b: [sx0, sz0], n: [-1, 0] },
    { a: [sx0, sz0], b: [sx1, sz0], n: [0, -1] },
    { a: [sx1, sz0], b: [sx1, sz1], n: [1, 0] },
    { a: [sx1, sz1], b: [sx0, sz1], n: [0, 1] },
  ];
  const y0 = baseTop + 0.06;
  let topMax = 0;
  for (let k = 0; ; k++) {
    const y = y0 + k * 0.075;
    if (y > 4.5) break;
    sf.forEach((f, fi) => {
      const L0 = 0.62;
      const off = (k % 2) * 0.105;
      for (let s = -off; s < L0 - 0.03; s += 0.21) {
        const s0 = Math.max(0, s);
        const s1 = Math.min(L0, s + 0.2);
        if (s1 - s0 < 0.06) continue;
        const t = (s0 + s1) / 2 / L0;
        const topH = 4.02 + 0.3 * Math.sin(fi * 1.7 + s * 5.3) + 0.18 * Math.sin(fi * 3.1 + s * 11.7) - (fi === 3 ? 0.3 : 0);
        if (y > topH) continue;
        if (rng() < 0.02 + Math.max(0, y - 3.4) * 0.14) continue;
        let px = f.a[0] + (f.b[0] - f.a[0]) * t - f.n[0] * 0.05;
        const pz = f.a[1] + (f.b[1] - f.a[1]) * t - f.n[1] * 0.05;
        let py = y + 0.0325;
        let rz = 0;
        if (py > pivotY) {
          const dx = px - sx0;
          const dy = py - pivotY;
          px = sx0 + dx * Math.cos(lean) - dy * Math.sin(lean);
          py = pivotY + dx * Math.sin(lean) + dy * Math.cos(lean);
          rz = lean;
        }
        let col = vary(bricks[Math.floor(rng() * bricks.length)], rng, 0.18);
        if (rng() < 0.05) col = mixc(col, lin(0xa89c88), 0.5);
        if (y > 3.6) col = mulc(col, 1 - Math.min(0.6, (y - 3.6) * 0.8));
        g.rough.box(px + (rng() - 0.5) * 0.008, py, pz + (rng() - 0.5) * 0.008, s1 - s0 - 0.012, 0.064, 0.1, col, 0, Math.atan2(f.n[0], f.n[1]) + (rng() - 0.5) * 0.04, rz);
        topMax = Math.max(topMax, py);
      }
    });
  }
  g.rough.aabb(sx0 + 0.1, y0, sz0 + 0.1, sx1 - 0.1, 3.9, sz1 - 0.1, lin(0x060505));
  // Bricks fallen onto the ground and the roof, the broken crown slab.
  for (let i = 0; i < 16; i++) {
    const x = K.x0 - 1.1 - rng() * 1.3;
    const zz = c.z - 1.4 + rng() * 3.2;
    const half = rng() < 0.3;
    g.rough.box(x, 0.03, zz, half ? 0.1 : 0.2, 0.065, 0.1, vary(bricks[i % bricks.length], rng, 0.2), (rng() - 0.5) * 0.5, rng() * TAU, (rng() - 0.5) * 0.6);
  }
  for (let i = 0; i < 7; i++) g.rough.box(bx0 - 0.1 - rng() * 0.3, 0.05 + rng() * 0.06, c.z - 0.5 + rng(), 0.2, 0.065, 0.1, vary(bricks[i % bricks.length], rng, 0.2), rng() - 0.5, rng() * TAU, rng() - 0.5);
  g.rough.box(K.x0 - 1.5, 0.05, c.z + 0.9, 0.5, 0.07, 0.38, lin(0x5a564e), 0.1, 0.5, -0.12);
  g.rough.box(K.x0 - 1.9, 0.06, c.z + 1.25, 0.32, 0.07, 0.3, lin(0x55514a), -0.15, 1.2, 0.1);
  const R = K.roof;
  for (const [x, v] of [[K.x0 + 0.35, 0.5], [K.x0 + 0.7, 0.3], [K.x0 + 0.25, 0.72]]) {
    const f = R.F(x, v, 1);
    const p = add3(f.p, f.n, 0.07);
    g.rough.obox(p, f.X, f.T, f.n, 0.2, 0.1, 0.065, vary(bricks[2], rng, 0.2));
  }
  L.collider([bx0 - 0.02, -0.2, bz0 - 0.02], [bx1, baseTop + 0.06, bz1 + 0.02], { walkable: false });
  L.collider([sx0 - 0.02, baseTop, sz0 - 0.02], [sx1, topMax, sz1 + 0.02], { walkable: false });
}

// ---------- Porch: rotten deck, broken step, collapsed post, sagging tin roof ----------
function porch(K) {
  const { c, rng, g, L, base, z1 } = K;
  const px0 = K.x0 - 0.1;
  const px1 = K.x1 + 0.1;
  const pz0 = z1 + 0.03;
  const pz1 = z1 + 1.86;
  const beamY = base + 1.78;
  const brk = c.x + 1.0;
  K.porch = { px0, px1, pz0, pz1 };
  g.rough.aabb(px0 + 0.05, -0.15, pz0, px1 - 0.05, 0.2, pz1 - 0.02, lin(0x070605));
  // Deck boards run out from the wall; gaps, holes, a broken board, warped ones.
  const deckCol = [lin(0x6e6050), lin(0x5c4e40), lin(0x786a5c), lin(0x524638)];
  g.wood.tint = (x, y, zz, col) => {
    const k = 0.62 + 0.38 * smooth(pz1 + 0.02, pz1 - 0.5, zz);
    col[0] *= k;
    col[1] *= k;
    col[2] *= k;
  };
  K.deckHoles = [];
  for (let x = px0 + 0.07; x < px1 - 0.05; x += 0.142) {
    const path = Math.abs(x - c.x) < 0.8;
    const col = vary(deckCol[Math.floor(rng() * deckCol.length)], rng, 0.15);
    if (!path && ((x > c.x - 2.45 && x < c.x - 2.12) || (x > c.x + 1.86 && x < c.x + 2.0))) {
      K.deckHoles.push([x, (pz0 + pz1) / 2]);
      continue;
    }
    if (!path && rng() < 0.12) {
      const zc = pz0 + 0.4 + rng() * 0.9;
      g.wood.box(x, base - 0.014, (pz0 + zc) / 2, 0.132, 0.028, zc - pz0, col, 0, 0, 0, rng() * 9);
      g.wood.box(x, base - 0.05, (zc + 0.16 + pz1) / 2, 0.132, 0.028, pz1 - zc - 0.16, col, 0.06, 0, 0, rng() * 9);
      K.deckHoles.push([x, zc + 0.08]);
      continue;
    }
    const tilt = !path && rng() < 0.15 ? (rng() - 0.5) * 0.08 : 0;
    g.wood.box(x, base - 0.014, (pz0 + pz1 + 0.02) / 2, 0.132, 0.028, pz1 + 0.02 - pz0, col, 0, 0, tilt, rng() * 9);
  }
  g.wood.tint = null;
  const joist = lin(0x2e241c);
  for (const zj of [pz0 + 0.1, (pz0 + pz1) / 2, pz1 - 0.08]) g.wood.aabb(px0, base - 0.16, zj - 0.04, px1, base - 0.03, zj + 0.04, joist);
  g.wood.beam([px0, base - 0.11, pz1 + 0.02], [px1, base - 0.11, pz1 + 0.02], 0.2, 0.03, [0, 1, 0], vary(lin(0x4a3e32), rng, 0.1));
  for (const x of [px0, px1]) g.wood.beam([x, base - 0.11, pz0], [x, base - 0.11, pz1], 0.2, 0.03, [0, 1, 0], vary(lin(0x4a3e32), rng, 0.1));
  for (const x of [px0 + 0.12, c.x - 1.0, c.x + 1.0, px1 - 0.12]) g.rough.box(x, 0.07, pz1 - 0.1, 0.3, 0.34, 0.3, vary(lin(0x5a564e), rng, 0.15), 0, rng() * 0.3, 0);
  L.collider([px0, -0.3, pz0 - 0.1], [px1, base, pz1 + 0.02], { walkable: true, surface: 'wood' });

  // Two steps down to the ground; the top tread cracked and sunk on one side.
  const sx0 = c.x - 0.85;
  const sx1 = c.x + 0.85;
  const tread = lin(0x5e5042);
  for (const [top, za, zb] of [[0.28, pz1 + 0.02, pz1 + 0.34], [0.14, pz1 + 0.34, pz1 + 0.66]]) {
    for (let k = 0; k < 2; k++) {
      const zz = za + 0.08 + k * 0.155;
      if (top > 0.2 && k === 1) {
        g.wood.box(c.x - 0.43, top - 0.015, zz, 0.84, 0.03, 0.15, vary(tread, rng, 0.12), 0, 0, 0, rng() * 9);
        g.wood.box(c.x + 0.45, top - 0.05, zz, 0.8, 0.03, 0.15, vary(tread, rng, 0.12), 0.1, 0, -0.1, rng() * 9);
      } else {
        g.wood.box(c.x, top - 0.015, zz, 1.7, 0.03, 0.15, vary(tread, rng, 0.12), 0, 0, 0, rng() * 9);
      }
    }
    g.wood.aabb(sx0 + 0.02, top - 0.2, za - 0.02, sx1 - 0.02, top - 0.03, za + 0.01, lin(0x3a3028));
    L.collider([sx0, -0.3, za], [sx1, top, zb], { walkable: true, surface: 'wood' });
  }
  for (const x of [sx0 + 0.03, sx1 - 0.03]) g.wood.beam([x, 0.02, pz1 + 0.68], [x, base - 0.04, pz1], 0.16, 0.05, [0, 0, -1], vary(lin(0x40362c), rng, 0.1));

  // Posts: three standing (one leaning), the corner one collapsed.
  const postCol = lin(0x54483c);
  for (const [x, lean] of [[c.x - 2.95, -0.01], [c.x - 0.95, 0.008], [c.x + 0.95, 0.07]]) {
    const a = [x, base, pz1 - 0.1];
    const b = [x + lean * 1.8, beamY, pz1 - 0.1];
    g.wood.beam(a, b, 0.12, 0.12, [0, 0, 1], vary(postCol, rng, 0.12), rng() * 9);
    L.collider([x - 0.08, base, pz1 - 0.18], [x + 0.08 + Math.max(0, lean * 1.8), beamY, pz1 - 0.02], { walkable: false });
  }
  g.wood.beam([c.x + 3.05, 0.48, pz1 - 0.05], [c.x + 3.9, 0.08, pz1 + 1.45], 0.12, 0.12, [0, 1, 0], vary(postCol, rng, 0.12));
  // Front beam: whole to the east post, then snapped and sagging onto the railing.
  const frontY = (x) => (x <= brk ? beamY + 0.15 : beamY + 0.1 + (1.26 - beamY - 0.1) * ((x - brk) / (px1 - brk)));
  g.wood.beam([px0 - 0.05, beamY + 0.08, pz1 - 0.1], [brk + 0.02, beamY + 0.08, pz1 - 0.1], 0.15, 0.12, [0, 1, 0], vary(postCol, rng, 0.1));
  g.wood.beam([brk + 0.06, beamY + 0.02, pz1 - 0.08], [px1, 1.18, pz1 - 0.02], 0.15, 0.12, [0, 1, 0], vary(postCol, rng, 0.1));
  for (let i = 0; i < 3; i++) g.wood.box(brk + 0.05, beamY + 0.02 + i * 0.04, pz1 - 0.1, 0.12, 0.018, 0.03, lin(0x6a5c4c), 0, (rng() - 0.5) * 0.4, 0.3 + rng() * 0.5);
  // Ledger on the wall, rafters, corrugated tin sheets (one gone, one peeled up).
  const wallY = base + 2.2;
  g.wood.beam([px0, wallY - 0.06, z1 + 0.06], [px1, wallY - 0.06, z1 + 0.06], 0.14, 0.05, [0, 1, 0], vary(postCol, rng, 0.1));
  const roofY = (x, t) => wallY + (frontY(x) + 0.08 - wallY) * t;
  const tz0 = z1 + 0.04;
  const tz1 = pz1 + 0.16;
  for (let x = px0 + 0.05; x < px1; x += 0.62) {
    const t1 = (tz1 - tz0) / (pz1 - 0.1 - tz0);
    g.wood.beam([x, roofY(x, 0) - 0.05, tz0], [x, roofY(x, t1) - 0.05, tz1], 0.1, 0.05, [0, 1, 0], vary(postCol, rng, 0.12));
  }
  const tAt = (zz) => (zz - tz0) / (pz1 - 0.1 - tz0);
  let si = 0;
  for (let x = px0 - 0.12; x < px1 + 0.1; x += 0.6, si++) {
    if (si === 2) continue;
    tinSheet(K, x, x + 0.66, tz0, tz1, (xx, zz) => roofY(xx, tAt(zz)) + 0.01 * si, si === 0 ? 0.3 : 0);
  }
  // Railings: the west run broken, the east run crushed under the fallen roof.
  const railCol = lin(0x5e5244);
  const rail = (a, b) => g.wood.beam(a, b, 0.07, 0.05, [0, 1, 0], vary(railCol, rng, 0.12), rng() * 9);
  const zr = pz1 - 0.1;
  const ry = base + 0.88;
  rail([c.x - 2.95, ry, zr], [c.x - 2.05, ry, zr]);
  rail([c.x - 1.75, base + 0.42, zr + 0.02], [c.x - 0.95, ry, zr]);
  rail([c.x - 2.95, base + 0.12, zr], [c.x - 0.95, base + 0.12, zr]);
  for (let x = c.x - 2.8; x < c.x - 1.05; x += 0.15) {
    const r = rng();
    if (r < 0.2) continue;
    const h = r < 0.35 ? 0.3 + rng() * 0.3 : 0.72;
    g.wood.box(x, base + 0.15 + h / 2, zr, 0.04, h, 0.04, vary(railCol, rng, 0.12), 0, 0, r > 0.9 ? 0.15 : 0);
  }
  for (const [xs, z0r, z1r, broken] of [[px0 + 0.05, z1 + 0.1, zr, false], [px1 - 0.05, z1 + 0.1, zr, true]]) {
    rail([xs, ry, z0r], [xs, broken ? base + 0.5 : ry, broken ? zr - 0.5 : zr]);
    rail([xs, base + 0.12, z0r], [xs, base + 0.12, zr]);
    for (let zz = z0r + 0.12; zz < zr - 0.05; zz += 0.15) {
      if (rng() < 0.15 || (broken && zz > zr - 0.7)) continue;
      g.wood.box(xs, base + 0.15 + 0.36, zz, 0.04, 0.72, 0.04, vary(railCol, rng, 0.12));
    }
  }
  for (let i = 0; i < 7; i++) {
    const x = brk + 0.3 + rng() * 1.7;
    g.wood.box(x, base + 0.03 + rng() * 0.08, zr - 0.2 + rng() * 0.4, 0.04, 0.04, 0.5 + rng() * 0.3, vary(railCol, rng, 0.12), (rng() - 0.5) * 0.3, rng() * TAU, Math.PI / 2 + (rng() - 0.5) * 0.3);
  }
  rail([brk + 0.2, base + 0.35, zr], [px1 - 0.1, base + 0.08, zr + 0.25]);
  // Colliders: railings and the low, sagging east end of the porch.
  L.collider([c.x - 3.0, base, zr - 0.07], [c.x - 0.88, base + 0.95, zr + 0.07], { walkable: false });
  L.collider([px0 - 0.02, base, z1], [px0 + 0.1, base + 0.95, pz1], { walkable: false });
  L.collider([px1 - 0.1, base, z1], [px1 + 0.02, base + 0.95, pz1], { walkable: false });
  L.collider([brk + 0.15, base, pz1 - 0.5], [px1 + 0.05, 2.3, pz1 + 0.25], { walkable: false });
  L.collider([c.x + 1.9, base, z1 + 0.6], [px1 + 0.05, 2.3, pz1], { walkable: false });
  // Porch clutter: an old chair by the boarded window, a bucket by the steps.
  chair(K, c.x - 2.2, z1 + 0.75, 0.5, { broken: true });
  L.collider([c.x - 2.5, base, z1 + 0.45], [c.x - 1.9, base + 0.95, z1 + 1.05], { walkable: false });
  bucket(K, c.x + 1.35, 0, pz1 + 0.55, true);
  litter(g.leaf, rng, c.x, (pz0 + pz1) / 2, 2.6, 70, () => base, LITTER_COLORS);
  litter(g.leaf, rng, c.x, pz1 + 0.35, 0.8, 14, (x, zz) => (zz < pz1 + 0.34 ? 0.28 : 0.14), LITTER_COLORS);
}

// Corrugated, rusted tin sheet over x0..x1, z0..z1 with top surface yAt(x, z).
function tinSheet(K, x0, x1, z0, z1, yAt, peel) {
  const { g, rng } = K;
  const nx = 16;
  const nz = 5;
  const rustA = lin(0x6a3a22);
  const rustB = lin(0x3a2a22);
  const rustC = lin(0x8a5a36);
  const seed = rng() * 10;
  const P = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const t = j / nz;
      const x = x0 + (x1 - x0) * u;
      const zz = z0 + (z1 - z0) * t;
      let y = yAt(x, zz) + 0.012 * Math.sin(u * Math.PI * 14);
      if (peel) y += peel * Math.max(0, t - 0.45) ** 2 * 3.3 * (1 - u * 0.7);
      P.push([x, y, zz]);
    }
  }
  const idx = (i, j) => j * (nx + 1) + i;
  for (const side of [1, -1]) {
    const b = g.rough.count;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const p = P[idx(i, j)];
        const pa = P[idx(Math.min(nx, i + 1), j)];
        const pb = P[idx(Math.max(0, i - 1), j)];
        const pc = P[idx(i, Math.min(nz, j + 1))];
        const pd = P[idx(i, Math.max(0, j - 1))];
        const n = norm3(cross3([pc[0] - pd[0], pc[1] - pd[1], pc[2] - pd[2]], [pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]]));
        if (n[1] * side < 0) {
          n[0] = -n[0];
          n[1] = -n[1];
          n[2] = -n[2];
        }
        const s1 = Math.sin(p[0] * 3.1 + p[2] * 7.3 + seed) * 0.5 + 0.5;
        const s2 = Math.sin(p[0] * 19.7 + seed * 3) * 0.5 + 0.5;
        let col = mixc(rustA, rustC, s1 * 0.6);
        col = mixc(col, rustB, s2 * s2 * 0.7);
        if (side < 0) col = mulc(col, 0.55);
        g.rough.vert(p[0], p[1] - (side < 0 ? 0.003 : 0), p[2], n[0], n[1], n[2], p[0], p[2], col);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = b + idx(i, j);
        const bb = b + idx(i + 1, j);
        const cc = b + idx(i + 1, j + 1);
        const d = b + idx(i, j + 1);
        if (side > 0) g.rough.quad(a, d, cc, bb);
        else g.rough.quad(a, bb, cc, d);
      }
    }
  }
}

// ---------- Doorway ----------
function doorway(K) {
  const { c, rng, g, base, z1, L } = K;
  const dx0 = c.x - 0.5;
  const dx1 = c.x + 0.5;
  const dy1 = base + 2.08;
  const cas = lin(0x4e4236);
  g.wood.aabb(dx0 - 0.14, base, z1 + 0.026, dx0, dy1 + 0.02, z1 + 0.056, vary(cas, rng, 0.1), 3.1);
  g.wood.aabb(dx1, base, z1 + 0.026, dx1 + 0.14, dy1 + 0.02, z1 + 0.056, vary(cas, rng, 0.1), 5.7);
  g.wood.aabb(dx0 - 0.18, dy1 + 0.02, z1 + 0.026, dx1 + 0.18, dy1 + 0.17, z1 + 0.062, vary(cas, rng, 0.1), 1.3);
  for (const x of [dx0 - 0.02, dx1]) g.wood.aabb(x, base, z1 - 0.1, x + 0.02, dy1, z1 + 0.03, lin(0x3a3028));
  g.wood.aabb(dx0, dy1, z1 - 0.1, dx1, dy1 + 0.02, z1 + 0.03, lin(0x3a3028));
  g.wood.aabb(dx0 - 0.06, base - 0.02, z1 + 0.03, dx1 + 0.06, base + 0.012, z1 + 0.14, lin(0x5a4c3c), 2.2);
  // Horseshoe nailed above the door, upside down.
  const hs = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.1 + (i / 10) * Math.PI * 1.8;
    hs.push([c.x + Math.sin(a) * 0.07, dy1 + 0.3 - Math.cos(a) * 0.08, z1 + 0.075]);
  }
  g.rough.tube(hs, hs.map(() => 0.011), 5, lin(0x3a2a20));
  // Rusted lantern on a nail beside the door (never lit).
  const lx = c.x + 0.9;
  const ly = base + 1.55;
  const lz = z1 + 0.14;
  const rust = lin(0x4a3024);
  g.rough.box(lx, ly + 0.36, z1 + 0.06, 0.012, 0.012, 0.12, lin(0x222020));
  g.rough.lathe(lx, ly, lz, [[0.07, 0], [0.075, 0.03], [0.07, 0.04], [0.05, 0.05]], 8, rust);
  g.rough.lathe(lx, ly + 0.2, lz, [[0.06, 0], [0.075, 0.01], [0.03, 0.08], [0.012, 0.11]], 8, rust);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    g.rough.box(lx + Math.cos(a) * 0.058, ly + 0.12, lz + Math.sin(a) * 0.058, 0.01, 0.16, 0.01, rust);
  }
  g.glass.lathe(lx, ly + 0.05, lz, [[0.05, 0], [0.056, 0.07], [0.05, 0.15]], 8, [1, 1, 1]);
  const bail = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    bail.push([lx + Math.cos(a) * 0.06, ly + 0.31 + Math.sin(a) * 0.07, lz]);
  }
  g.rough.tube(bail, bail.map(() => 0.004), 3, rust);
  // Warm line of light around the shut door (hidden once the door opens).
  if (!K.dawn) {
    const col = [0.8, 0.34, 0.1];
    g.doorLeak.quadP([dx0, base + 0.02, z1 - 0.06], [dx0 + 0.07, base + 0.02, z1 - 0.06], [dx0 + 0.07, dy1, z1 - 0.06], [dx0, dy1, z1 - 0.06], col);
    g.doorLeak.quadP([dx0, base + 2.0, z1 - 0.06], [dx1, base + 2.0, z1 - 0.06], [dx1, dy1, z1 - 0.06], [dx0, dy1, z1 - 0.06], col);
  }
  void L;
}

// ---------- Windows: casings, broken glass, boards, a hanging shutter ----------
function windows(K) {
  const { rng, g } = K;
  for (const w of K.windows) {
    const wl = K.walls[w.wall];
    const along = [wl.ax, 0, wl.az];
    const nrm = [wl.nx, 0, wl.nz];
    const up = [0, 1, 0];
    const cas = vary(lin(0x524538), rng, 0.1);
    // Casing, sill and drip cap.
    g.wood.beam(wp(wl, w.s0 - 0.055, w.y0 - 0.02, 0.04), wp(wl, w.s0 - 0.055, w.y1 + 0.02, 0.04), 0.11, 0.025, nrm, cas, rng() * 9);
    g.wood.beam(wp(wl, w.s1 + 0.055, w.y0 - 0.02, 0.04), wp(wl, w.s1 + 0.055, w.y1 + 0.02, 0.04), 0.11, 0.025, nrm, cas, rng() * 9);
    g.wood.beam(wp(wl, w.s0 - 0.14, w.y1 + 0.075, 0.042), wp(wl, w.s1 + 0.14, w.y1 + 0.075, 0.042), 0.13, 0.03, up, cas, rng() * 9);
    g.wood.beam(wp(wl, w.s0 - 0.13, w.y0 - 0.03, 0.05), wp(wl, w.s1 + 0.13, w.y0 - 0.03, 0.05), 0.12, 0.035, nrm, cas, rng() * 9);
    g.wood.beam(wp(wl, w.s0 - 0.08, w.y0 - 0.015, -0.08), wp(wl, w.s1 + 0.08, w.y0 - 0.015, -0.08), 0.18, 0.03, nrm, lin(0x4a3e32), rng() * 9);
    // Sash with a cross: 2 x 2 panes.
    const sash = lin(0x3e342a);
    const so = -0.03;
    const sm = (w.s0 + w.s1) / 2;
    const ym = (w.y0 + w.y1) / 2;
    for (const [a, b] of [
      [[w.s0 + 0.02, w.y0], [w.s0 + 0.02, w.y1]],
      [[w.s1 - 0.02, w.y0], [w.s1 - 0.02, w.y1]],
      [[w.s0, w.y0 + 0.02], [w.s1, w.y0 + 0.02]],
      [[w.s0, w.y1 - 0.02], [w.s1, w.y1 - 0.02]],
      [[sm, w.y0], [sm, w.y1]],
      [[w.s0, ym], [w.s1, ym]],
    ]) {
      g.wood.beam(wp(wl, a[0], a[1], so), wp(wl, b[0], b[1], so), 0.04, 0.035, nrm, sash);
    }
    // Glass: dirty panes, jagged shards, empty frames.
    const states = { boarded: [1, 2, 2, 0], shutter: [2, 2, 3, 2], curtain: [1, 2, 3, 2], sealed: [1, 1, 2, 1] }[w.kind];
    const panes = [
      [w.s0 + 0.04, sm - 0.02, w.y0 + 0.04, ym - 0.02],
      [sm + 0.02, w.s1 - 0.04, w.y0 + 0.04, ym - 0.02],
      [w.s0 + 0.04, sm - 0.02, ym + 0.02, w.y1 - 0.04],
      [sm + 0.02, w.s1 - 0.04, ym + 0.02, w.y1 - 0.04],
    ];
    panes.forEach(([a, b, y0, y1], k) => {
      const st = states[k];
      if (st === 1) g.glass.quadP(wp(wl, a, y0, so), wp(wl, b, y0, so), wp(wl, b, y1, so), wp(wl, a, y1, so), [1, 1, 1]);
      else if (st === 2) {
        // Shards left in the corners.
        for (const [cs, cy, ds, dy] of [[a, y0, 1, 1], [b, y1, -1, -1], [a, y1, 1, -1]]) {
          if (rng() < 0.3) continue;
          const l1 = 0.08 + rng() * (b - a) * 0.7;
          const l2 = 0.08 + rng() * (y1 - y0) * 0.7;
          const p0 = wp(wl, cs, cy, so);
          const p1 = wp(wl, cs + ds * l1, cy, so);
          const p2 = wp(wl, cs + ds * l1 * 0.3, cy + dy * l2, so);
          const i0 = g.glass.vert(p0[0], p0[1], p0[2], nrm[0], 0, nrm[2], 0, 0, [1, 1, 1]);
          const i1 = g.glass.vert(p1[0], p1[1], p1[2], nrm[0], 0, nrm[2], 1, 0, [1, 1, 1]);
          const i2 = g.glass.vert(p2[0], p2[1], p2[2], nrm[0], 0, nrm[2], 0, 1, [1, 1, 1]);
          g.glass.tri(i0, i1, i2);
        }
      }
    });
    // Glass on the sills below.
    for (let i = 0; i < 6; i++) {
      const o = rng() < 0.5 ? -0.1 - rng() * 0.05 : 0.07;
      const p = wp(wl, w.s0 + rng() * (w.s1 - w.s0), w.y0 + 0.005, o);
      const s = 0.02 + rng() * 0.04;
      const a = rng() * TAU;
      const i0 = g.glass.vert(p[0], p[1], p[2], 0, 1, 0, 0, 0, [1, 1, 1]);
      const i1 = g.glass.vert(p[0] + Math.cos(a) * s, p[1], p[2] + Math.sin(a) * s, 0, 1, 0, 1, 0, [1, 1, 1]);
      const i2 = g.glass.vert(p[0] + Math.cos(a + 2) * s, p[1], p[2] + Math.sin(a + 2) * s, 0, 1, 0, 0, 1, [1, 1, 1]);
      g.glass.tri(i0, i1, i2);
    }
    if (w.kind === 'boarded' || w.kind === 'sealed') {
      // Planks nailed across the casing.
      const pl = w.kind === 'boarded'
        ? [[w.y1 - 0.12, w.y1 - 0.06], [ym + 0.02, ym - 0.12], [w.y0 + 0.28, w.y0 + 0.42], [w.y0 + 0.06, w.y0 + 0.1]]
        : [[w.y1 - 0.08, w.y1 - 0.1], [w.y1 - 0.26, w.y1 - 0.25], [ym - 0.02, ym + 0.02], [w.y0 + 0.24, w.y0 + 0.2], [w.y0 + 0.06, w.y0 - 0.25]];
      pl.forEach(([ya, yb], k) => {
        const col = vary(BOARDS[(k + 2) % BOARDS.length], rng, 0.15);
        g.wood.beam(wp(wl, w.s0 - 0.16, ya, 0.075 + k * 0.004), wp(wl, w.s1 + 0.16, yb, 0.075 + k * 0.004), 0.13 + rng() * 0.04, 0.025, up, col, rng() * 9);
        for (const s of [w.s0 - 0.1, w.s1 + 0.1]) {
          const t = (s - (w.s0 - 0.16)) / (w.s1 - w.s0 + 0.32);
          const p = wp(wl, s, ya + (yb - ya) * t, 0.092 + k * 0.004);
          g.rough.box(p[0], p[1], p[2], 0.012, 0.012, 0.012, lin(0x2a2420));
        }
      });
    }
    if (w.kind === 'shutter') shutter(K, wl, w);
    if (w.kind === 'curtain') curtain(K, wl, w);
    if (w.kind === 'shutter') {
      // A candle burning on the inside sill.
      const p = wp(wl, w.s0 + 0.28, w.y0, -0.1);
      candle(K, p[0], w.y0, p[2], 0.13, 0.022, true);
    }
    // Warm haze in the window, for reading the light from afar.
    if (!K.dawn) {
      const k = w.kind === 'sealed' ? 0.3 : w.kind === 'boarded' ? 0.6 : 0.95;
      const n = 4;
      const b = g.haze.count;
      for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const v = j / n;
          const p = wp(wl, w.s0 - 0.08 + (w.s1 - w.s0 + 0.16) * u, w.y0 - 0.08 + (w.y1 - w.y0 + 0.16) * v, -0.22);
          const f = Math.max(0, 1 - Math.hypot((u - 0.5) * 2, (v - 0.38) * 2.2)) ** 1.5 * k;
          g.haze.vert(p[0], p[1], p[2], nrm[0], 0, nrm[2], u, v, [f, f * 0.52, f * 0.18]);
        }
      }
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const a = b + j * (n + 1) + i;
          g.haze.quad(a, a + 1, a + n + 2, a + n + 1);
        }
      }
    }
  }
}

// Shutter hanging from its top hinge, swung out and drooping; its twin lies on the porch.
function shutter(K, wl, w) {
  const { g, rng } = K;
  const along = [wl.ax, 0, wl.az];
  const nrm = [wl.nx, 0, wl.nz];
  const H = wp(wl, w.s1 + 0.12, w.y1 + 0.04, 0.06);
  const phi = 2.25;
  let X = [-along[0] * Math.cos(phi) + nrm[0] * Math.sin(phi), 0, -along[2] * Math.cos(phi) + nrm[2] * Math.sin(phi)];
  let Y = [0, -1, 0];
  const Z = cross3(X, Y);
  const psi = -0.42;
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  const X2 = [X[0] * c + Y[0] * s, X[1] * c + Y[1] * s, X[2] * c + Y[2] * s];
  Y = [Y[0] * c - X[0] * s, Y[1] * c - X[1] * s, Y[2] * c - X[2] * s];
  X = X2;
  const W = 0.46;
  const Hh = 1.02;
  const col = lin(0x4a4a3e);
  for (let k = 0; k < 3; k++) {
    const p = add3(add3(H, X, 0.08 + k * 0.152), Y, Hh / 2);
    g.wood.obox(p, Y, X, cross3(Y, X), Hh, 0.145, 0.025, vary(col, rng, 0.12), rng() * 9);
  }
  for (const t of [0.12, 0.88]) g.wood.obox(add3(add3(add3(H, X, W / 2), Y, Hh * t), Z, -0.025), X, Y, Z, W, 0.1, 0.025, vary(col, rng, 0.1));
  g.rough.obox(add3(add3(H, X, 0.12), Y, 0.1), X, Y, Z, 0.24, 0.03, 0.04, lin(0x2a2220));
  // The other shutter, fallen on the porch under the sagging roof.
  const p = [wl.ox + wl.ax * (w.s0 + 0.4), K.base + 0.03, wl.oz + 0.75];
  for (let k = 0; k < 3; k++) g.wood.box(p[0] - 0.15 + k * 0.152, p[1], p[2], 0.145, 0.025, Hh, vary(col, rng, 0.12), 0, 0.4, 0, rng() * 9);
}

// Torn curtain hanging inside the window, pulled half aside.
function curtain(K, wl, w) {
  const { g, rng } = K;
  const nrm = [wl.nx, 0, wl.nz];
  const cols = 9;
  const top = w.y1 + 0.06;
  const s0 = w.s0 - 0.05;
  const s1 = w.s0 + (w.s1 - w.s0) * 0.62;
  const base = lin(0x4a1c18);
  g.rough.beam(wp(wl, w.s0 - 0.1, top + 0.02, -0.12), wp(wl, w.s1 + 0.1, top + 0.02, -0.12), 0.02, 0.02, [0, 1, 0], lin(0x2a2420));
  const lens = [];
  for (let i = 0; i <= cols; i++) lens.push(0.65 + rng() * 0.55 - (i > cols - 3 ? 0.3 : 0));
  for (const side of [1, -1]) {
    const b = g.rough.count;
    for (let j = 0; j <= 6; j++) {
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const t = j / 6;
        const s = s0 + (s1 - s0) * u;
        const fold = Math.sin(u * Math.PI * 6) * 0.03;
        const y = top - lens[i] * t;
        const p = wp(wl, s, y, -0.12 + fold * (0.3 + t));
        const shade = (0.7 + 0.3 * Math.cos(u * Math.PI * 6)) * (1 - t * 0.3);
        g.rough.vert(p[0], p[1], p[2], nrm[0] * side, 0, nrm[2] * side, s * 2, y * 2, mulc(base, shade * (side > 0 ? 1 : 0.8)));
      }
    }
    for (let j = 0; j < 6; j++) {
      for (let i = 0; i < cols; i++) {
        if (j > 2 && (i === 3 || i === 4) && j < 5) continue;
        const a = b + j * (cols + 1) + i;
        if (side > 0) g.rough.quad(a, a + cols + 1, a + cols + 2, a + 1);
        else g.rough.quad(a, a + 1, a + cols + 2, a + cols + 1);
      }
    }
  }
}

// ---------- Small props ----------
const _m4 = new THREE.Matrix4();
const _eu = new THREE.Euler();
const _v = new THREE.Vector3();

// Candle with drips and a melted rim; lit ones get an unlit, over-bright flame.
function candle(K, x, y, z, h, r, lit, color = 0xd8ccb0) {
  const { g, rng } = K;
  const wax = vary(lin(color), rng, 0.08);
  g.rough.lathe(x, y, z, [[r * 1.7, 0], [r * 1.3, 0.005], [r, 0.012], [r, h * 0.88], [r * 0.95, h], [r * 0.45, h - 0.004], [0.001, h - 0.006]], 8, wax);
  const n = 2 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU;
    const dl = h * (0.25 + rng() * 0.5);
    g.rough.box(x + Math.cos(a) * r, y + h - dl / 2, z + Math.sin(a) * r, 0.009, dl, 0.009, wax, 0, -a, 0);
  }
  g.rough.box(x, y + h + 0.004, z, 0.003, 0.012, 0.003, lin(0x1a1410));
  if (lit && !K.dawn) {
    const fh = 0.034 + rng() * 0.014;
    g.flame.lathe(x, y + h + 0.003, z, [[0.001, 0], [0.0055, 0.005], [0.0072, 0.013], [0.0048, fh * 0.68], [0.0008, fh]], 6, [6, 3.1, 1.0]);
  }
}

// Wooden chair at (x, z) on the floor y0, facing local +z rotated by ry; tilt leans it over.
function chair(K, x, z, ry, { y0 = K.base, tilt = 0, broken = false } = {}) {
  const { g, rng } = K;
  const col = vary(lin(0x4e4032), rng, 0.1);
  _eu.set(0, ry, tilt, 'YXZ');
  _m4.makeRotationFromEuler(_eu);
  const part = (lx, ly, lz, sx, sy, sz) => {
    _v.set(lx, ly, lz).applyMatrix4(_m4);
    g.wood.box(x + _v.x, y0 + _v.y, z + _v.z, sx, sy, sz, vary(col, rng, 0.08), 0, ry, tilt, rng() * 9);
  };
  part(0, 0.44, 0, 0.42, 0.035, 0.4);
  for (const [lx, lz] of [[-0.18, 0.17], [0.18, 0.17], [-0.18, -0.17], [0.18, -0.17]]) {
    if (broken && lx > 0 && lz > 0) part(lx, 0.33, lz, 0.035, 0.2, 0.035);
    else part(lx, 0.215, lz, 0.035, 0.43, 0.035);
  }
  for (const lx of [-0.18, 0.18]) part(lx, 0.69, -0.18, 0.035, 0.5, 0.035);
  part(0, 0.86, -0.18, 0.36, 0.06, 0.02);
  if (!broken) part(0, 0.7, -0.18, 0.36, 0.05, 0.02);
}

// Rusted bucket, standing or lying on its side.
function bucket(K, x, y, z, lying) {
  const { g, rng } = K;
  const start = g.rough.count;
  const rust = vary(lin(0x5a3322), rng, 0.15);
  g.rough.lathe(0, 0, 0, [[0.1, 0], [0.13, 0.27], [0.128, 0.275]], 10, rust);
  g.rough.lathe(0, 0, 0, [[0.12, 0.27], [0.092, 0.02]], 10, mulc(rust, 0.4));
  g.rough.lathe(0, 0, 0, [[0.0, 0.004], [0.1, 0.004]], 10, mulc(rust, 0.5));
  const arc = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    arc.push([Math.cos(a) * 0.13, 0.27 + Math.sin(a) * 0.12 * (lying ? 0.3 : 1), lying ? 0.1 : 0]);
  }
  g.rough.tube(arc, arc.map(() => 0.004), 3, lin(0x2a2220));
  _eu.set(lying ? Math.PI / 2 - 0.1 : 0, rng() * TAU, 0, 'YXZ');
  _m4.makeRotationFromEuler(_eu).setPosition(x, y + (lying ? 0.13 : 0), z);
  g.rough.transform(_m4, start);
}

// Corner cobweb: corner p0, spreading along unit A and B (size s), sagging toward sag.
function web(K, p0, A, B, s, sag = [0, -1, 0]) {
  const p1 = add3(p0, A, s);
  const p3 = add3(p0, B, s);
  const p2 = add3(add3(add3(p0, A, s * 0.55), B, s * 0.55), sag, s * 0.28);
  K.g.web.quadP(p0, p1, p2, p3, [1, 1, 1], [0, 0, 1, 1]);
}

// ---------- Inside: the small room you glimpse ----------
function interior(K) {
  const { c, rng, g, L, base, top } = K;
  // Table against the east wall with a cluster of candles.
  const T = { x0: c.x + 2.15, x1: c.x + 2.83, z0: c.z + 0.35, z1: c.z + 1.45, y: base + 0.76 };
  const tcol = lin(0x5a4a3a);
  for (let k = 0; k < 4; k++) g.wood.box(T.x0 + 0.085 + k * 0.17, T.y - 0.018, (T.z0 + T.z1) / 2, 0.165, 0.035, T.z1 - T.z0 + 0.06, vary(tcol, rng, 0.12), 0, 0, (rng() - 0.5) * 0.02, rng() * 9);
  for (const [lx, lz] of [[T.x0 + 0.06, T.z0 + 0.06], [T.x1 - 0.06, T.z0 + 0.06], [T.x0 + 0.06, T.z1 - 0.06], [T.x1 - 0.06, T.z1 - 0.06]]) {
    g.wood.box(lx, (base + T.y - 0.035) / 2, lz, 0.06, T.y - 0.035 - base, 0.06, vary(tcol, rng, 0.1));
  }
  for (const lx of [T.x0 + 0.06, T.x1 - 0.06]) g.wood.box(lx, T.y - 0.09, (T.z0 + T.z1) / 2, 0.03, 0.1, T.z1 - T.z0 - 0.1, vary(tcol, rng, 0.1));
  L.collider([T.x0, base, T.z0], [T.x1, T.y, T.z1], { walkable: false });
  const cx = c.x + 2.5;
  const cz = c.z + 0.9;
  g.rough.lathe(cx, T.y, cz, [[0.0, 0.001], [0.2, 0.001], [0.23, 0.0]], 12, lin(0xc8bca0));
  const cands = [[-0.1, -0.15, 0.22, 0.026], [0.05, -0.05, 0.14, 0.022], [-0.06, 0.1, 0.09, 0.03], [0.12, 0.18, 0.18, 0.024], [0.15, -0.26, 0.06, 0.028], [-0.2, 0.3, 0.12, 0.02]];
  cands.forEach(([dx, dz, h, r], i) => candle(K, cx + dx, T.y, cz + dz, h, r, i !== 4, i === 3 ? 0x8a2a20 : 0xd8ccb0));
  // An old photograph, an open book, a tin cup.
  g.rough.box(cx - 0.05, T.y + 0.002, cz + 0.42, 0.1, 0.002, 0.14, lin(0xb8ae98), 0, 0.3, 0);
  g.rough.box(cx + 0.02, T.y + 0.012, c.z + 0.5, 0.2, 0.02, 0.28, lin(0x2a1a14), 0, -0.2, 0);
  g.rough.box(cx + 0.02, T.y + 0.024, c.z + 0.5, 0.19, 0.006, 0.26, lin(0xa89c84), 0, -0.2, 0);
  g.rough.lathe(T.x0 + 0.12, T.y, T.z0 + 0.14, [[0.035, 0], [0.04, 0.08], [0.037, 0.082]], 8, lin(0x4a4640));
  chair(K, c.x + 1.8, c.z + 0.95, Math.PI / 2 + 0.35);
  L.collider([c.x + 1.55, base, c.z + 0.7], [c.x + 2.1, base + 0.95, c.z + 1.2], { walkable: false });

  // Cot against the north wall: frame, slats, a stained mattress, a crumpled blanket.
  const bx0 = c.x - 2.85;
  const bx1 = c.x - 1.0;
  const bz0 = K.z0 + 0.14;
  const bz1 = K.z0 + 0.9;
  const fr = lin(0x3e3228);
  for (const [lx, lz] of [[bx0 + 0.03, bz0 + 0.03], [bx1 - 0.03, bz0 + 0.03], [bx0 + 0.03, bz1 - 0.03], [bx1 - 0.03, bz1 - 0.03]]) g.wood.box(lx, base + 0.19, lz, 0.06, 0.38, 0.06, fr);
  for (const zz of [bz0 + 0.03, bz1 - 0.03]) g.wood.box((bx0 + bx1) / 2, base + 0.3, zz, bx1 - bx0, 0.1, 0.04, vary(fr, rng, 0.1), 0, 0, 0, rng() * 9);
  for (const xx of [bx0 + 0.03, bx1 - 0.03]) g.wood.box(xx, base + 0.3, (bz0 + bz1) / 2, 0.04, 0.1, bz1 - bz0, fr);
  const my = base + 0.46;
  g.rough.aabb(bx0 + 0.05, base + 0.35, bz0 + 0.04, bx1 - 0.05, my - 0.02, bz1 - 0.04, lin(0x5a5040));
  mattressTop(K, bx0 + 0.05, bx1 - 0.05, bz0 + 0.04, bz1 - 0.04, my);
  L.collider([bx0, base, bz0], [bx1, base + 0.55, bz1], { walkable: false });

  fireplace(K);
  shelves(K);

  // Dried bundles hanging from a joist.
  const jx = K.x0 + 0.05 + 2 * 0.59 + 0.05;
  for (const zz of [c.z - 0.9, c.z - 0.3, c.z + 0.45]) {
    const y1 = top - 0.28 - rng() * 0.15;
    g.rough.box(jx, (top + y1) / 2, zz, 0.004, top - y1, 0.004, lin(0x6a5a3a));
    for (let k = 0; k < 9; k++) {
      const a = rng() * TAU;
      const sp = 0.04 + rng() * 0.05;
      const len = 0.28 + rng() * 0.12;
      g.rough.tube([[jx, y1, zz], [jx + Math.cos(a) * sp, y1 - len, zz + Math.sin(a) * sp]], [0.004, 0.002], 3, vary(lin(0x4a4430), rng, 0.2));
      if (rng() < 0.7) {
        const U = norm3([Math.cos(a) * 0.3, -1, Math.sin(a) * 0.3]);
        g.leaf.card([jx + Math.cos(a) * sp * 0.6, y1 - len * 0.5, zz + Math.sin(a) * sp * 0.6], U, norm3([-Math.sin(a), 0, Math.cos(a)]), 0.1, 0.07, LEAF_CELLS[2], [0, 1, 0], vary(lin(0x4a4a2a), rng, 0.25));
      }
    }
  }
  // Leaves blown in, glass under the windows, a fallen board.
  litter(g.leaf, rng, c.x - 0.2, K.z1 - 0.6, 1.0, 40, () => base, LITTER_COLORS);
  litter(g.leaf, rng, c.x + 1.8, K.z1 - 0.5, 0.7, 20, () => base, LITTER_COLORS);
  g.wood.box(c.x + 0.4, base + 0.02, c.z - 1.3, 1.3, 0.025, 0.18, vary(BOARDS[2], rng, 0.1), 0, 0.5, 0.03, 4.2);
  // Cobwebs in the corners, under the table and across the rafters.
  const tt = top - 0.02;
  web(K, [K.x0 + 0.1, tt, K.z0 + 0.1], [1, 0, 0], [0, 0, 1], 0.55);
  web(K, [K.x1 - 0.1, tt, K.z0 + 0.1], [-1, 0, 0], [0, 0, 1], 0.5);
  web(K, [K.x1 - 0.1, tt, K.z1 - 0.1], [-1, 0, 0], [0, 0, -1], 0.45);
  web(K, [K.x0 + 0.1, tt, K.z1 - 0.1], [1, 0, 0], [0, 0, -1], 0.6);
  web(K, [T.x1 - 0.08, T.y - 0.05, T.z0 + 0.08], [-1, 0, 0], [0, -1, 0], 0.32, [0, 0, 1]);
  web(K, [jx, top + 0.02, c.z - 1.6], [0, 0.55, 0.83], [0, 0, 1], 0.5);
  web(K, [K.x0 + 0.12, base + 1.2, K.z0 + 0.12], [0, 1, 0], [1, 0, 1], 0.4, [1, 0, 1]);
}

// Lumpy, stained mattress top and a blanket spilling over its edge.
function mattressTop(K, x0, x1, z0, z1, y) {
  const { g, rng } = K;
  const nx = 10;
  const nz = 5;
  const cloth = lin(0x6a6048);
  const stain = lin(0x2a1c10);
  const b = g.rough.count;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const zz = z0 + ((z1 - z0) * j) / nz;
      const lump = 0.025 * Math.sin(i * 1.3) * Math.sin(j * 1.9) + (j === 0 || j === nz || i === 0 || i === nx ? -0.02 : 0);
      const st = smooth(0.3, 0.7, 0.5 + 0.5 * Math.sin(x * 4.7 + zz * 6.1) * Math.sin(x * 9.1 - zz * 3.3));
      g.rough.vert(x, y + lump, zz, 0, 1, 0, x, zz, mixc(cloth, stain, st * 0.8));
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = b + j * (nx + 1) + i;
      g.rough.quad(a, a + nx + 1, a + nx + 2, a + 1);
    }
  }
  // Blanket: rucked up at one end, hanging over the side.
  const bb = g.rough.count;
  const bl = lin(0x3a3a42);
  const bxs = x0 + (x1 - x0) * 0.55;
  for (let j = 0; j <= 6; j++) {
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const v = j / 6;
      const x = bxs + (x1 - bxs) * u;
      let zz = z0 + (z1 - z0 + 0.15) * v;
      let yy = y + 0.03 + 0.06 * Math.abs(Math.sin(u * 7 + v * 3)) + 0.05 * Math.sin(v * 5 + u * 2) ** 2;
      if (zz > z1) {
        yy -= (zz - z1) * 2.4;
        zz = z1 + 0.01;
      }
      g.rough.vert(x, yy, zz, 0, 1, 0, x * 2, zz * 2, mulc(bl, 0.7 + 0.3 * Math.sin(u * 9 + v * 4) ** 2));
    }
  }
  for (let j = 0; j < 6; j++) {
    for (let i = 0; i < 8; i++) {
      const a = bb + j * 9 + i;
      g.rough.quad(a, a + 9, a + 10, a + 1);
    }
  }
  void rng;
}

function fireplace(K) {
  const { c, rng, g, L, base } = K;
  const fx0 = K.x0 + 0.1;
  const fx1 = K.x0 + 0.44;
  const fz0 = c.z - 0.72;
  const fz1 = c.z + 0.72;
  const fy1 = base + 1.25;
  const oz0 = c.z - 0.36;
  const oz1 = c.z + 0.36;
  const oy1 = base + 0.66;
  const mortar = lin(0x3a3630);
  g.rough.aabb(fx0 - 0.04, base, oz0, fx0 + 0.1, oy1, oz1, lin(0x050404));
  g.rough.aabb(fx0, base, fz0, fx1, fy1, oz0, mortar);
  g.rough.aabb(fx0, base, oz1, fx1, fy1, fz1, mortar);
  g.rough.aabb(fx0, oy1, oz0, fx1, fy1, oz1, mortar);
  g.rough.aabb(fx0 + 0.1, base, oz0, fx1 - 0.02, base + 0.01, oz1, lin(0x2a2826));
  const stone = [lin(0x6e685e), lin(0x5c564c), lin(0x7a6e60), lin(0x4e4a44)];
  for (let y = base; y < fy1 - 0.05; ) {
    const hh = Math.min(fy1 - y, 0.14 + rng() * 0.08);
    let zz = fz0 - rng() * 0.1;
    while (zz < fz1) {
      const w = 0.16 + rng() * 0.16;
      const zc = zz + w / 2;
      if (!(zc > oz0 - 0.02 && zc < oz1 + 0.02 && y < oy1 - 0.02) && zc > fz0 && zc < fz1) {
        const soot = y > oy1 - 0.1 && zc > oz0 - 0.1 && zc < oz1 + 0.1 ? 0.45 : 1;
        g.rough.box(fx1 + 0.012, y + hh / 2, zc, 0.06, hh - 0.02, w - 0.02, mulc(vary(stone[Math.floor(rng() * stone.length)], rng, 0.15), soot), (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.06, 0);
      }
      zz += w;
    }
    y += hh;
  }
  g.rough.aabb(fx1, base - 0.01, fz0 + 0.08, fx1 + 0.42, base + 0.035, fz1 - 0.08, lin(0x55514a));
  // Ash and two charred logs.
  for (let i = 0; i < 6; i++) g.rough.box(fx0 + 0.18 + rng() * 0.12, base + 0.02, c.z - 0.2 + rng() * 0.4, 0.08, 0.03, 0.08, lin(0x4a4844), 0, rng() * 3, 0);
  g.rough.tube([[fx0 + 0.2, base + 0.06, c.z - 0.25], [fx0 + 0.26, base + 0.07, c.z + 0.22]], [0.05, 0.045], 6, lin(0x141210));
  g.rough.tube([[fx0 + 0.3, base + 0.05, c.z - 0.2], [fx0 + 0.18, base + 0.12, c.z + 0.15]], [0.04, 0.035], 6, lin(0x1a1614));
  // Mantel with candles.
  g.wood.aabb(fx0 - 0.02, fy1, fz0 - 0.12, fx1 + 0.12, fy1 + 0.07, fz1 + 0.12, vary(lin(0x3e3228), rng, 0.1), 1.7);
  candle(K, fx1 - 0.05, fy1 + 0.07, c.z + 0.12, 0.2, 0.024, true);
  candle(K, fx1 - 0.1, fy1 + 0.07, c.z + 0.3, 0.11, 0.028, true);
  candle(K, fx1, fy1 + 0.07, c.z + 0.45, 0.07, 0.02, false);
  g.rough.lathe(fx1 - 0.06, fy1 + 0.07, c.z - 0.4, [[0.05, 0], [0.06, 0.1], [0.03, 0.14], [0.025, 0.2]], 8, lin(0x2a3a2c));
  L.collider([K.x0, base, fz0 - 0.12], [fx1 + 0.12, fy1 + 0.07, fz1 + 0.12], { walkable: false });
}

function shelves(K) {
  const { c, rng, g, base } = K;
  const sx0 = c.x + 0.7;
  const sx1 = c.x + 2.2;
  const z0 = K.z0 + 0.1;
  const z1 = K.z0 + 0.34;
  const col = lin(0x4a3c30);
  g.wood.box((sx0 + sx1) / 2, base + 1.75, (z0 + z1) / 2, sx1 - sx0, 0.03, z1 - z0, vary(col, rng, 0.1), 0, 0, 0, 2.2);
  g.wood.box((sx0 + sx1) / 2, base + 1.3, (z0 + z1) / 2, sx1 - sx0, 0.03, z1 - z0, vary(col, rng, 0.1), 0, 0, -0.12, 5.1);
  for (const x of [sx0 + 0.1, sx1 - 0.1]) g.wood.box(x, base + 1.65, z0 + 0.04, 0.03, 0.2, 0.08, col);
  const jars = [lin(0x3a2a14), lin(0x2a3024), lin(0x4a3a20), lin(0x22201c), lin(0x5a4a2a)];
  for (let x = sx0 + 0.12; x < sx1 - 0.1; x += 0.13 + rng() * 0.1) {
    const h = 0.1 + rng() * 0.14;
    const r = 0.03 + rng() * 0.03;
    const col2 = vary(jars[Math.floor(rng() * jars.length)], rng, 0.2);
    if (rng() < 0.5) g.rough.lathe(x, base + 1.765, (z0 + z1) / 2, [[r, 0], [r, h * 0.8], [r * 0.7, h], [r * 0.72, h + 0.01]], 8, col2);
    else g.rough.lathe(x, base + 1.765, (z0 + z1) / 2, [[r * 0.8, 0], [r * 0.85, h * 0.6], [r * 0.3, h * 0.8], [r * 0.3, h * 1.25]], 8, col2);
  }
  // What slid off the drooping lower shelf.
  g.rough.lathe(sx1 - 0.3, base, (z0 + z1) / 2 + 0.3, [[0.04, 0], [0.042, 0.05]], 8, lin(0x3a2a14));
  const start = g.rough.count;
  g.rough.lathe(0, 0, 0, [[0.035, 0], [0.036, 0.16], [0.012, 0.22], [0.012, 0.28]], 8, lin(0x243024));
  _eu.set(Math.PI / 2, 0.8, 0, 'YXZ');
  _m4.makeRotationFromEuler(_eu).setPosition(sx1 - 0.55, base + 0.035, (z0 + z1) / 2 + 0.55);
  g.rough.transform(_m4, start);
}

// ---------- Ivy creeping up the walls and the chimney ----------
function ivy(K) {
  const { c, rng, g } = K;
  const stem = lin(0x2a2018);
  const LEAVES = [lin(0x26341a), lin(0x2e4020), lin(0x1c2814), lin(0x5a1c10), lin(0x6e2a14), lin(0x3e3016), lin(0x7a3218)];
  const vine = (wl, s0, y0, maxY, o0 = 0.035) => {
    const walk = (s, y, a, len, depth) => {
      const pts = [];
      const radii = [];
      for (let i = 0; i < len / 0.08; i++) {
        a += (rng() - 0.5) * 0.55;
        a *= 0.9;
        s += Math.sin(a) * 0.08;
        y += Math.cos(a) * 0.08;
        if (y > maxY || s < 0.04 || s > wl.len - 0.04) break;
        pts.push(wp(wl, s, y, o0 + 0.005));
        radii.push((depth ? 0.005 : 0.009) * (1 - i / (len / 0.08) * 0.5));
        for (let q = 0; q < 2; q++) {
          if (rng() > 0.75) continue;
          const th = (rng() - 0.5) * 2.4;
          const nrm = [wl.nx, 0, wl.nz];
          const along = [wl.ax, 0, wl.az];
          const U = norm3([along[0] * Math.sin(th) + nrm[0] * 0.5, Math.cos(th), along[2] * Math.sin(th) + nrm[2] * 0.5]);
          const S = norm3(cross3(U, nrm));
          const p = wp(wl, s + (rng() - 0.5) * 0.1, y + (rng() - 0.5) * 0.06, o0 + 0.01 + rng() * 0.03);
          const size = 0.07 + rng() * 0.07;
          const col = vary(LEAVES[Math.floor(rng() * LEAVES.length)], rng, 0.25);
          g.leaf.card(p, U, S, size, size * 0.95, LEAF_CELLS[rng() < 0.5 ? 0 : 1], norm3([nrm[0], 0.4, nrm[2]]), col);
        }
        if (depth < 2 && rng() < 0.07) walk(s, y, a + (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 0.6), len * 0.5, depth + 1);
      }
      if (pts.length > 1) g.rough.tube(pts, radii, 3, stem);
    };
    walk(s0, y0, (rng() - 0.5) * 0.6, maxY - y0 + 0.5, 0);
    walk(s0 + 0.1, y0, 0.6, (maxY - y0) * 0.7, 1);
  };
  const W = K.walls;
  vine(W.S, 0.3, K.base, K.top - 0.1);
  vine(W.S, 0.5, K.base, 2.4);
  vine(W.W, 4.3, 0.3, K.top);
  vine(W.W, 4.7, 0.3, 2.7);
  vine(W.W, 1.3, 0.3, 2.5);
  vine(W.E, 4.4, 0.3, 2.9);
  vine(W.E, 4.0, 0.3, 2.2);
  vine(W.N, 5.3, 0.3, K.top);
  vine(W.N, 4.9, 0.3, 2.6);
  vine(W.N, 2.3, 0.3, 2.1);
  // Up the chimney: the stone base, then the brick stack.
  const cb = { ox: K.x0 - 0.97, oz: c.z + 0.5, ax: 0, az: -1, nx: -1, nz: 0, len: 1.0 };
  vine(cb, 0.4, 0.0, 1.5, 0.06);
  vine(cb, 0.7, 0.0, 1.4, 0.06);
  const cs = { ox: K.x0 - 0.72, oz: c.z + 0.31, ax: 0, az: -1, nx: -1, nz: 0, len: 0.62 };
  vine(cs, 0.3, 1.6, 3.3, 0.02);
  // Around the west porch post.
  const px = c.x - 2.95;
  const pz = K.porch.pz1 - 0.1;
  const helix = [];
  for (let i = 0; i <= 40; i++) {
    const a = i * 0.42;
    helix.push([px + Math.cos(a) * 0.085, K.base + i * 0.043, pz + Math.sin(a) * 0.085]);
    if (rng() < 0.7) {
      const U = norm3([Math.cos(a), 0.9, Math.sin(a)]);
      g.leaf.card(helix[i], U, norm3([-Math.sin(a), 0, Math.cos(a)]), 0.09, 0.085, LEAF_CELLS[0], norm3([Math.cos(a), 0.4, Math.sin(a)]), vary(LEAVES[i % LEAVES.length], rng, 0.2));
    }
  }
  g.rough.tube(helix, helix.map(() => 0.007), 3, stem);
}

// ---------- Around the cabin: weeds, fallen boards, woodpile, barrel ----------
function grounds(K) {
  const { c, rng, g, L } = K;
  const hAt = c.heightAt || (() => 0);
  const P = K.porch;
  const blocked = (x, zz) => (x > K.x0 - 0.05 && x < K.x1 + 0.05 && zz > K.z0 - 0.05 && zz < P.pz1 + 0.05) || (Math.abs(x - c.x) < 1.0 && zz < P.pz1 + 1.0);
  // Weeds along the foundation and the porch.
  for (const id of ['S', 'E', 'N', 'W']) {
    const wl = K.walls[id];
    for (let s = -0.4; s < wl.len + 0.4; s += 0.28) {
      if (rng() < 0.3) continue;
      const o = 0.15 + rng() * 0.7 + (id === 'S' ? 1.95 : 0);
      const p = wp(wl, s, 0, o);
      if (blocked(p[0], p[2])) continue;
      weedClump(g.weed, rng, p[0], hAt(p[0], p[2]), p[2], 0.55 + rng() * 0.5, 5 + Math.floor(rng() * 5));
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU;
    const x = K.x0 - 0.5 + Math.cos(a) * (0.6 + rng() * 0.9);
    const zz = c.z + Math.sin(a) * (0.9 + rng() * 0.9);
    if (x < K.x0 - 0.05) weedClump(g.weed, rng, x, hAt(x, zz), zz, 0.5 + rng() * 0.5, 6);
  }
  for (const [x, zz] of K.deckHoles) weedClump(g.weed, rng, x, 0.05, zz, 0.75, 6);
  // Boards fallen off the walls.
  const lying = [[K.x1 + 0.5, c.z + 1.6, 0.3], [K.x1 + 0.9, c.z + 1.2, 1.9], [c.x + 2.2, K.z0 - 0.6, 0.1], [c.x + 1.7, K.z0 - 1.1, 2.6], [c.x + 2.6, K.z0 - 0.9, 1.3], [K.x0 - 0.55, c.z + 1.7, 1.4], [K.x0 - 0.9, c.z + 2.2, 0.2]];
  for (const [x, zz, ry] of lying) g.wood.box(x, hAt(x, zz) + 0.02, zz, 0.9 + rng() * 0.5, 0.026, 0.19, vary(BOARDS[Math.floor(rng() * BOARDS.length)], rng, 0.15), (rng() - 0.5) * 0.1, ry, (rng() - 0.5) * 0.12, rng() * 9);
  // Woodpile against the east wall, half spilled, a chopping block with an axe.
  const wx = K.x1 + 0.12;
  const bark = lin(0x3e342c);
  const cut = lin(0x8a7458);
  const rows = [7, 6, 4, 2];
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      const lr = 0.065 + rng() * 0.015;
      const zz = c.z - 2.25 + i * 0.16 + r * 0.08 + (rng() - 0.5) * 0.02;
      const y = lr + r * 0.125;
      const x = wx + 0.1 + (rng() - 0.5) * 0.04;
      g.wood.tube([[x, y, zz], [x + 0.46, y + (rng() - 0.5) * 0.02, zz + (rng() - 0.5) * 0.04]], [lr, lr * 0.95], 7, vary(bark, rng, 0.15), { cap: cut, capStart: cut });
    }
  });
  for (let i = 0; i < 6; i++) {
    const lr = 0.065;
    const x = wx + 0.6 + rng() * 0.7;
    const zz = c.z - 2.2 + rng() * 1.2;
    const a = rng() * TAU;
    g.wood.tube([[x, lr, zz], [x + Math.cos(a) * 0.45, lr, zz + Math.sin(a) * 0.45]], [lr, lr], 7, vary(bark, rng, 0.15), { cap: cut, capStart: cut });
  }
  L.collider([wx, 0, c.z - 2.35], [wx + 0.65, 0.5, c.z - 1.05], { walkable: true });
  const bxp = K.x1 + 1.35;
  const bzp = c.z - 0.2;
  g.wood.lathe(bxp, 0, bzp, [[0.26, 0], [0.23, 0.08], [0.22, 0.42], [0.2, 0.44], [0.0, 0.445]], 10, lin(0x5a4c3e));
  g.wood.beam([bxp + 0.02, 0.5, bzp], [bxp + 0.32, 1.0, bzp + 0.1], 0.035, 0.03, [0, 0, 1], lin(0x5a4a38));
  g.rough.box(bxp + 0.01, 0.47, bzp, 0.16, 0.08, 0.02, lin(0x3a2a22), 0, 0.3, 0.6);
  L.cylinder(bxp, bzp, 0.28, 0, 0.45, null, { visible: false, walkable: true });
  // Rain barrel at the back corner, black water inside.
  const rx = K.x0 - 0.45;
  const rz = K.z0 - 0.4;
  g.wood.lathe(rx, 0, rz, [[0.26, 0], [0.3, 0.2], [0.32, 0.42], [0.3, 0.64], [0.27, 0.84], [0.25, 0.84], [0.25, 0.8]], 14, lin(0x4a3c30));
  for (const y of [0.12, 0.72]) g.rough.lathe(rx, y, rz, [[0.305, 0], [0.31, 0.04]], 14, lin(0x3a2a22));
  g.rough.lathe(rx, 0.7, rz, [[0.0, 0], [0.27, 0]], 14, lin(0x040404));
  L.cylinder(rx, rz, 0.34, 0, 0.9, null, { visible: false });
}

// ---------- Meshes, lights, colliders ----------
function finish(K) {
  const { L, c, g, mats, base, top } = K;
  addMesh(L, g.wood, mats.wood, { name: 'cabin:wood' });
  addMesh(L, g.rough, mats.rough, { name: 'cabin:rough' });
  addMesh(L, g.glass, mats.glass, { cast: false, receive: false, name: 'cabin:glass' });
  addMesh(L, g.web, mats.web, { cast: false, name: 'cabin:webs' });
  addMesh(L, g.leaf, mats.leaf, { cast: false, name: 'cabin:leaves' });
  addMesh(L, g.weed, mats.weed, { cast: false, name: 'cabin:weeds' });
  if (!K.dawn) {
    addMesh(L, g.flame, mats.flame, { cast: false, receive: false, name: 'cabin:flames' });
    addMesh(L, g.leak, mats.leak, { cast: false, receive: false, name: 'cabin:leaks' });
    const door = addMesh(L, g.doorLeak, mats.leak, { cast: false, receive: false, name: 'cabin:doorLeak' });
    addMesh(L, g.haze, mats.haze, { cast: false, receive: false, name: 'cabin:haze' });
    if (L.flag('field.phone')) door.visible = false;
    L.onUpdate((dt, t, game) => {
      // The glow in the windows gives way to the real candlelight up close.
      const p = game.player.position;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      mats.haze.opacity = Math.min(1, Math.max(0.15, (d - 4) / 12));
      if (door.visible && game.flags.has('field.phone')) door.visible = false;
    });
    const [tl, ml] = K.lights;
    const src = L.light({ pos: tl, color: CANDLE, intensity: 1.8, distance: 6.5, flicker: 0.5, kind: 'candle' });
    L.light({ pos: ml, color: CANDLE, intensity: 1.15, distance: 5, flicker: 0.6, kind: 'candle' });
    src.onFlicker = (f) => {
      mats.flame.color.setScalar(0.7 + 0.35 * f);
      mats.leak.color.setScalar(0.82 + 0.22 * f);
    };
    L.loopSound('candle', tl, { radius: 5, gain: 0.5 });
  }
  L.sound('creak', [c.x, base + 1.6, c.z], { interval: [8, 18], radius: 16, gain: 0.45 });
  // Walls (the doorway stays open) and the floor.
  const wall = { walkable: false, surface: 'wood' };
  L.collider([K.x0 - 0.05, 0, K.z1 - 0.12], [c.x - 0.5, top, K.z1 + 0.05], wall);
  L.collider([c.x + 0.5, 0, K.z1 - 0.12], [K.x1 + 0.05, top, K.z1 + 0.05], wall);
  L.collider([c.x - 0.5, base + 2.08, K.z1 - 0.12], [c.x + 0.5, top, K.z1 + 0.05], wall);
  L.collider([K.x0 - 0.05, 0, K.z0 - 0.05], [K.x1 + 0.05, top, K.z0 + 0.12], wall);
  L.collider([K.x1 - 0.12, 0, K.z0], [K.x1 + 0.05, top, K.z1], wall);
  L.collider([K.x0 - 0.05, 0, K.z0], [K.x0 + 0.12, top, K.z1], wall);
  L.collider([K.x0, -0.3, K.z0], [K.x1, base, K.z1], { walkable: true, surface: 'wood' });
  // Porch roof and eaves stop bullets and the flashlight's shadows need nothing more.
  void INNER;
}
