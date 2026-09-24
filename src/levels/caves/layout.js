import { fbm2 } from '../../core/rng.js';

// Flesh caves: the ASCII plan (painted from shapes in world metres) and
// helpers that reproduce the organic surfaces of plan.js, so props can sit
// exactly on the displaced floors, walls and domed ceilings.
//
// World layout (x east, z south; north = -z):
//   A  ossuary antechamber (start), stone, skulls; c = crawlspace mouth (exit)
//   t  first flesh tunnel, north out of A, bends west
//   R  rib gallery, long hall north to H
//   H  sphincter hall; the sphincter seals T (the throat to the heart)
//   V  vein-webbed corridor west (first wall maw, in a niche)
//   G  narrow maw gauntlet south
//   b  ramp down into B, the sunken blood pool
//   n  neck ramp up (a maw) into W, the womb (hunter + shotgun)
//   u  return tunnel from W back to t, sealed by a membrane until the shotgun is taken

export const ORIGIN = [-28, -26];
export const GW = 51;
export const GH = 58;
export const I = (x) => Math.floor(x - ORIGIN[0]);
export const J = (z) => Math.floor(z - ORIGIN[1]);

export const ROOMS = {
  A: { style: 'stone', floor: 'stone', wall: 'stone', ceil: 'stone', h: 3.0, vault: true, vaultWidth: 6 },
  c: { style: 'stone', floor: 'stone', wall: 'stone', ceil: 'stone', h: 1.25 },
  t: { style: 'flesh', h: 4 },
  u: { style: 'flesh', h: 4 },
  R: { style: 'flesh', h: 6 },
  H: { style: 'flesh', h: 5 },
  T: { style: 'flesh', h: 3.4 },
  V: { style: 'flesh', h: 4 },
  G: { style: 'flesh', h: 4 },
  b: { style: 'flesh', y: -0.8, h: 4.8 },
  B: { style: 'flesh', y: -0.8, h: 5.8 },
  n: { style: 'flesh', y: -0.8, h: 4.8 },
  W: { style: 'flesh', h: 6, dome: 1.5 },
};

export const POOL_Y = -0.8; // blood pool floor
export const BLOOD_Y = -0.22; // blood surface

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export function makeRows() {
  const g = Array.from({ length: GH }, () => Array(GW).fill('#'));
  const paint = (k, test) => {
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) if (test(ORIGIN[0] + i + 0.5, ORIGIN[1] + j + 0.5)) g[j][i] = k;
    }
  };
  const rect = (k, x0, z0, x1, z1) => paint(k, (x, z) => x > x0 && x < x1 && z > z0 && z < z1);
  const ell = (k, ox, oz, rx, rz) => paint(k, (x, z) => ((x - ox) / rx) ** 2 + ((z - oz) / rz) ** 2 < 1);
  const path = (k, pts, w) =>
    paint(k, (x, z) => {
      for (let s = 0; s + 1 < pts.length; s++) if (segDist(x, z, ...pts[s], ...pts[s + 1]) < w / 2) return true;
      return false;
    });

  // The womb and the return tunnel out of its east side.
  ell('W', -18, 23, 8, 7);
  rect('W', -13, 17, -10, 20);
  rect('u', -11, 23, -4, 26);
  path('u', [[-4.5, 24.5], [0.5, 21.5], [6, 17], [13, 10.5]], 3);
  // Sunken blood pool, the ramps in and out of it, the gauntlet above.
  ell('B', -6.5, 8.5, 6.5, 4.5);
  rect('B', -12, 9, -9, 12);
  rect('n', -12, 12, -10, 17);
  rect('b', -4, 1, -2, 5);
  rect('G', -4, -15, -2, 1);
  // Vein corridor with a niche (the first maw) and a bulge.
  rect('V', -4, -18, 9, -15);
  rect('V', 0, -19, 5, -18);
  rect('V', 4, -15, 7, -14);
  // Sphincter hall with rounded corners, the throat behind the sphincter.
  rect('H', 9, -20, 20, -12);
  for (const [x0, z0, x1, z1] of [
    [9, -20, 11, -19], [9, -19, 10, -18], [18, -20, 20, -19], [19, -19, 20, -18],
    [9, -13, 11, -12], [9, -14, 10, -13], [18, -13, 20, -12], [19, -14, 20, -13],
  ]) rect('#', x0, z0, x1, z1);
  rect('T', 13, -24, 16, -20);
  // Rib gallery with two shallow alcoves.
  rect('R', 12, -12, 17, 9);
  rect('R', 11, -3, 12, 0);
  rect('R', 17, 3, 18, 6);
  // First flesh tunnel, the ossuary antechamber and the crawlspace mouth.
  rect('t', 16, 12, 19, 16);
  rect('t', 13, 9, 19, 12);
  rect('A', 14, 16, 21, 22);
  rect('c', 17, 22, 18, 26);
  return g.map((r) => r.join(''));
}

// Door openings between rooms (plan cell + side).
export function doors() {
  const d = (x, z, side, len, h) => ({ at: [I(x), J(z)], side, len, h });
  return [
    d(17.5, 21.5, 's', 1, 1.2), // A -> crawlspace
    d(16.5, 16.5, 'n', 3, 2.8), // A -> t
    d(13.5, 9.5, 'n', 4, 3.6), // t -> R
    d(12.5, -11.5, 'n', 5, 4.6), // R -> H
    d(13.5, -19.5, 'n', 3, 3.0), // H -> throat (the sphincter)
    d(9.5, -17.5, 'w', 3, 3.6), // H -> V
    d(-3.5, 4.5, 's', 2, 3.6), // b -> B
    d(-11.5, 12.5, 'n', 2, 3.6), // n -> B
    d(-11.5, 16.5, 's', 2, 3.4), // n -> W
    d(-10.5, 23.5, 'w', 3, 3.4), // u -> W
  ];
}

export const OPEN = ['tu', 'VG', 'Gb'];

// ---------- Organic surface helpers (mirror plan.js) ----------

// Flesh floor height at (x, z) for a room whose floor sits at base.
export const fleshFloor = (x, z, base = 0) => base + (fbm2(x * 0.7, z * 0.7, 3, 3) - 0.5) * 0.12 - 0.02;

// Highest point of the flesh floor under a footprint (for decals / props).
export function floorTop(x, z, r = 0.5, base = 0) {
  let y = -Infinity;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, r * 0.7]]) {
    y = Math.max(y, fleshFloor(x + dx, z + dz, base));
  }
  return y + 0.012;
}

// How far the organic wall on `line` bulges toward the room at (u, y).
export function wallOff(u, y, line) {
  const n = fbm2(u * 0.55 + line * 0.31, y * 0.55, 4, 7);
  const n2 = fbm2(u * 2.1, y * 2.1 + line, 2, 11);
  return Math.max(-0.45, Math.min(0.1, (n - 0.5) * 1.1 + (n2 - 0.5) * 0.12 - 0.05));
}

// Point on the visible surface of a flesh wall. axis 'x': wall along x at
// z = line; axis 'z': wall along z at x = line. dir = +1 if the room is on
// the + side of the line, -1 if on the - side. Returns [x, y, z].
export function wallPoint(axis, line, u, y, dir, inset = 0) {
  const off = wallOff(u, y, line) - inset;
  return axis === 'x' ? [u, y, line + dir * off] : [line + dir * off, y, u];
}

// Deepest recess of a wall over a span (so wide things never float in front of it).
export function wallBack(axis, line, u0, u1, y0, y1, dir) {
  let m = Infinity;
  for (let u = u0; u <= u1 + 1e-6; u += 0.15) for (let y = y0; y <= y1 + 1e-6; y += 0.2) m = Math.min(m, wallOff(u, y, line));
  return line + dir * m;
}

// Ceiling height of the domed flesh ceiling at (x, z) (null outside flesh rooms).
export function makeCeil(P, rows) {
  return (x, z) => {
    const i = I(x);
    const j = J(z);
    const key = rows[j]?.[i];
    const r = P.rooms[key];
    if (!r || r.style !== 'flesh') return null;
    const q = (P.rects[key] || []).find((q) => x >= q.x0 && x < q.x1 && z >= q.z0 && z < q.z1);
    if (!q) return null;
    const w = q.x1 - q.x0 + 0.6;
    const d = q.z1 - q.z0 + 0.6;
    const u = ((x - (q.x0 + q.x1) / 2) / w) * 2;
    const v = ((z - (q.z0 + q.z1) / 2) / d) * 2;
    const dome = (1 - u * u) * (1 - v * v) * Math.min(1.4, Math.min(w, d) * 0.25) * r.dome;
    return r.top + dome + (fbm2(x * 0.5, z * 0.5, 4, 5) - 0.5) * 0.8 + 0.2;
  };
}

// Spawns and exits.
export const SPAWN_START = [17.5, 0, 19.2];
export const SPAWN_HEART = [14.5, 0, -16.6];
export const SPHINCTER = { x: 14.5, z: -20, d: 2.8 };
