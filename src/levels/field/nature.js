import * as THREE from 'three';
import { makeRng, fbm2 } from '../../core/rng.js';
import { Forest, makeTree, norm3, cross3 } from '../../world/trees.js';
import { Geo, addMesh, fieldMaterials, lin, mixc, mulc, vary, smooth, weedClump, LEAF_CELLS, LITTER_COLORS } from './kit.js';

// The woods around the cabin and the clutter of the field: the cabin sits at
// the edge of the woods (dense behind and beside it, a clearing around it,
// thinning into the open field to the south), two old trees lean over its
// roof, and the field keeps its broken fences, the scarecrow with the antler
// skull, the stone well and rotting hay bales.
// o = { heightAt, cabin: { x, z, w, d }, trackDist(x, z), dawn }

const TAU = Math.PI * 2;
const PHONE = [-7.5, 11];
const WELL = [14, -9];
export const SCARECROW = [7, 22];
const BALES = [[-16, 18, 0.3], [-17.6, 18.5, 1.2], [-9, 36, 0.7], [20, 12, 2]];
const DEAD = [[-11, -6, 'snag', 1.5], [24, 30, 'deadOak', 1.0], [-30, 44, 'deadOak', 1.2]];
export const FENCES = [
  [[-20, 26], [-4, 30], [8, 31]],
  [[26, 22], [34, 8], [36, -10]],
];

export function buildNature(L, o) {
  const { heightAt, cabin } = o;
  const N = {
    L,
    o,
    h: heightAt,
    cx: cabin.x,
    cz: cabin.z,
    dawn: !!o.dawn,
    rng: makeRng(11),
    mats: fieldMaterials(),
    g: { wood: new Geo(), rough: new Geo(), leaf: new Geo(), weed: new Geo(), water: new Geo() },
    forest: new Forest(L),
    placed: new Map(),
  };
  N.keep = keepOut(N);
  templates(N);
  bigTrees(N);
  woods(N);
  undergrowth(N);
  deadTrees(N);
  for (const f of FENCES) fence(N, f);
  scarecrow(N, ...SCARECROW);
  well(N, ...WELL);
  for (const [x, z, r] of BALES) hayBale(N, x, z, r);
  rocks(N);
  groundLitter(N);
  N.forest.build();
  const { g, mats } = N;
  addMesh(L, g.wood, mats.wood, { name: 'field:wood' });
  addMesh(L, g.rough, mats.rough, { name: 'field:rough' });
  addMesh(L, g.leaf, mats.leaf, { cast: false, name: 'field:litter' });
  addMesh(L, g.weed, mats.weed, { cast: false, name: 'field:weeds' });
  addMesh(L, g.water, wellWater(), { cast: false, name: 'field:wellWater' });
}

// ---------- Where things may not go ----------
function segDist(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

function keepOut(N) {
  const { o, cx, cz } = N;
  const porch = [cx, cz + 4.6];
  // kind: 'tree' (big things), 'low' (bushes, rocks, logs), 'litter'
  return (x, z, kind = 'tree') => {
    if (Math.abs(x) > 85 || Math.abs(z) > 85) return true;
    const dc = Math.hypot(x - cx, z - cz);
    const clear = kind === 'tree' ? 8.2 : kind === 'low' ? 6.2 : 3.4;
    if (dc < clear) return true;
    // Her phone and the view of it from the porch.
    if (Math.hypot(x - PHONE[0], z - PHONE[1]) < (kind === 'litter' ? 1.2 : 3.2)) return true;
    if (kind !== 'litter' && segDist(x, z, porch, PHONE) < (kind === 'tree' ? 2.2 : 1.6)) return true;
    // The dirt track and the car.
    if (o.trackDist(x, z) < (kind === 'litter' ? 1.6 : kind === 'low' ? 2.4 : 3.2)) return true;
    if (Math.hypot(x - 17, z - 80) < 8) return true;
    if (kind === 'litter') return false;
    if (Math.hypot(x - WELL[0], z - WELL[1]) < 2.6) return true;
    if (Math.hypot(x - SCARECROW[0], z - SCARECROW[1]) < 2.0) return true;
    for (const [bx, bz] of BALES) if (Math.hypot(x - bx, z - bz) < 1.9) return true;
    for (const [dx, dz] of DEAD) if (Math.hypot(x - dx, z - dz) < 2.4) return true;
    if (kind === 'tree') {
      for (const f of FENCES) for (let i = 0; i < f.length - 1; i++) if (segDist(x, z, f[i], f[i + 1]) < 1.6) return true;
    }
    return false;
  };
}

// Woods density: dense behind and beside the cabin, open field to the south.
function density(N, x, z) {
  const ax = Math.abs(x - N.cx);
  const edge = N.cz + 2 + 10 * smooth(6, 22, ax) + 0.08 * Math.max(0, ax - 22);
  let d = smooth(edge + 4, edge - 3, z);
  d *= smooth(8, 12, Math.hypot(x - N.cx, z - N.cz));
  d *= Math.min(1.2, 0.45 + 1.1 * fbm2(x * 0.045, z * 0.045, 3, 77));
  return d;
}

// Minimum spacing between placed things (spatial hash).
function room(N, x, z, r, layer = 'tree', theirs = true) {
  const m = N.placed;
  const c = 4;
  const i0 = Math.floor((x - r) / c);
  const i1 = Math.floor((x + r) / c);
  const j0 = Math.floor((z - r) / c);
  const j1 = Math.floor((z + r) / c);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const list = m.get(`${layer}${i},${j}`);
      if (!list) continue;
      for (const p of list) if (Math.hypot(p[0] - x, p[1] - z) < (theirs ? Math.max(r, p[2]) : r)) return false;
    }
  }
  return true;
}

function mark(N, x, z, r, layer = 'tree') {
  const k = `${layer}${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  let list = N.placed.get(k);
  if (!list) N.placed.set(k, (list = []));
  list.push([x, z, r]);
}

// ---------- Tree templates ----------
function templates(N) {
  N.T = {
    oak: [makeTree('oak', 1), makeTree('oak', 2), makeTree('oak', 9)],
    maple: [makeTree('maple', 3), makeTree('maple', 4)],
    spruce: [makeTree('spruce', 5), makeTree('spruce', 6), makeTree('spruce', 12)],
    snag: [makeTree('snag', 7), makeTree('snag', 8)],
    oakFar: [makeTree('oakFar', 10), makeTree('oakFar', 11)],
    mapleFar: [makeTree('mapleFar', 13)],
    spruceFar: [makeTree('spruceFar', 14), makeTree('spruceFar', 15)],
    sapling: [makeTree('sapling', 16), makeTree('sapling', 17)],
    bush: [makeTree('bush', 18), makeTree('bush', 19), makeTree('bush', 20)],
    bramble: [makeTree('bramble', 21), makeTree('bramble', 22)],
    log: [makeTree('log', 23), makeTree('log', 24)],
    stump: [makeTree('stump', 25), makeTree('stump', 26)],
    sticks: [makeTree('sticks', 27), makeTree('sticks', 28)],
  };
}

const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const tintK = (rng, k = 0.14) => {
  const v = 1 + (rng() - 0.5) * 2 * k;
  return [v, v * (1 + (rng() - 0.5) * 0.06), v * (1 + (rng() - 0.5) * 0.08)];
};

// ---------- Two old trees leaning over the cabin ----------
function bigTrees(N) {
  const { cx, cz, h, forest } = N;
  // Inside the cabin's roof (plus margin) or the chimney: limbs bend up and over it.
  const inCabin = (x, y, z) => {
    const dx = Math.abs(x - cx);
    const dz = Math.abs(z - cz);
    if (dx < 3.6 && dz < 3.3 && y < 5.1 - 0.62 * dz) return true;
    return x > cx - 4.1 && x < cx - 2.9 && dz < 0.6 && y < 4.9;
  };
  const trees = [
    { x: cx + 4.6, z: cz - 4.3, reach: [-0.8, 0.7], seed: 31, scale: 1.3 },
    { x: cx - 5.7, z: cz + 2.1, reach: [0.9, -0.35], seed: 32, scale: 1.2 },
  ];
  for (const t of trees) {
    const y = h(t.x, t.z) - 0.05;
    const tpl = makeTree('oak', t.seed, {
      scale: t.scale,
      reach: t.reach,
      reachK: 0.09,
      lean: [t.reach[0] * 0.06, t.reach[1] * 0.06],
      avoid: (x, yy, z) => inCabin(x + t.x, yy + y, z + t.z),
      spec: { levels: 3, children: [[7, 8], [5, 6], [3, 4]], roots: 7, cards: { per: [3, 4], size: [0.8, 1.2], cells: [0, 0, 1, 3], leafy: 0.1, up: 0.35 }, height: [9.5, 11] },
    });
    forest.place(tpl, t.x, y, t.z, { tint: [0.95, 0.95, 0.95] });
    mark(N, t.x, t.z, 3.5);
  }
  // A dead branch that fell onto the roof and through the big hole.
  const fb = makeTree('fallenBranch', 33);
  const R = roofFrame(N, cx + 0.35, 0.08);
  const d = norm3([R.T[0] * 0.72 + R.X[0] * 0.7, R.T[1] * 0.72 + R.X[1] * 0.7, R.T[2] * 0.72 + R.X[2] * 0.7]);
  const zb = cross3(d, R.n);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...d), new THREE.Vector3(...R.n), new THREE.Vector3(...zb));
  m.setPosition(R.p[0] + R.n[0] * 0.04, R.p[1] + R.n[1] * 0.04, R.p[2] + R.n[2] * 0.04);
  forest.placeMatrix(fb, m);
}

// Frame on the cabin's south roof slope (same shape as cabin.js builds).
function roofFrame(N, x, v) {
  const top = 0.42 + 2.6;
  const eaveZ = 2.5 + 0.45;
  const sag = Math.max(0, 1 - ((x - N.cx) / 3.25) ** 2);
  const ey = top - 0.45 * 0.68 - 0.05 * sag;
  const ry = top + 1.7 - 0.26 * sag;
  const P = (vv) => [x, ey + (ry - ey) * vv - 0.07 * Math.sin(Math.PI * vv) * sag, N.cz + eaveZ * (1 - vv)];
  const p = P(v);
  const q = P(v + 0.01);
  const T = norm3([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
  const X = [1, 0, 0];
  const n = norm3(cross3(X, T));
  return { p, T, X, n };
}

// ---------- The woods ----------
function woods(N) {
  const { rng, h, keep, forest, T, cx, cz } = N;
  for (let gz = -86; gz < 34; gz += 3.4) {
    for (let gx = -86; gx < 86; gx += 3.4) {
      const x = gx + rng() * 3.4;
      const z = gz + rng() * 3.4;
      const dc = Math.hypot(x - cx, z - cz);
      let d = density(N, x, z);
      // Lone trees out in the field.
      if (d < 0.05 && rng() < 0.006) d = 1;
      const far = dc > 32;
      const very = dc > 58;
      if (rng() > d * (very ? 0.28 : far ? 0.46 : 0.8)) continue;
      if (keep(x, z, 'tree')) continue;
      const r = very ? 5.4 : far ? 4.4 : 3.4;
      if (!room(N, x, z, r)) continue;
      mark(N, x, z, r);
      const y = h(x, z) - 0.08;
      const roll = rng();
      let tpl;
      let s = 0.85 + rng() * 0.35;
      if (!far) tpl = roll < 0.34 ? pick(rng, T.oak) : roll < 0.58 ? pick(rng, T.maple) : roll < 0.86 ? pick(rng, T.spruce) : pick(rng, T.snag);
      else tpl = roll < 0.3 ? pick(rng, T.oakFar) : roll < 0.5 ? pick(rng, T.mapleFar) : roll < 0.93 ? pick(rng, T.spruceFar) : pick(rng, T.snag);
      if (tpl.kind === 'snag') s *= 0.9;
      forest.place(tpl, x, y, z, { rotY: rng() * TAU, scale: s, tint: tintK(rng), shadow: dc < 24 });
    }
  }
}

// ---------- Undergrowth: bushes, bramble, saplings, logs, stumps, sticks ----------
function undergrowth(N) {
  const { rng, h, keep, forest, T, cx, cz } = N;
  const put = (kind, n, where, r, opts = {}) => {
    let tries = 0;
    let done = 0;
    while (done < n && tries++ < n * 30) {
      const [x, z] = where();
      if (keep(x, z, opts.keep ?? 'low') || !room(N, x, z, r, 'low') || !room(N, x, z, opts.treeGap ?? 0.9, 'tree', false)) continue;
      mark(N, x, z, r, 'low');
      const y = h(x, z);
      const tpl = pick(rng, T[kind]);
      const ry = rng() * TAU;
      const s = (opts.scale ?? 1) * (0.8 + rng() * 0.45);
      forest.place(tpl, x, y - (opts.sink ?? 0.02), z, { rotY: ry, scale: s, tint: tintK(rng, 0.18), collide: !!opts.collide, shadow: Math.hypot(x - cx, z - cz) < 16 });
      opts.after?.(tpl, x, y, z, ry, s);
      done++;
    }
  };
  // Random point in the woods within radius R of the cabin (weighted by density).
  const inWoods = (R, min = 7) => () => {
    for (let i = 0; i < 40; i++) {
      const a = rng() * TAU;
      const d = min + Math.sqrt(rng()) * (R - min);
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (rng() < density(N, x, z) + 0.08) return [x, z];
    }
    return [9999, 9999];
  };
  // Along the edge of the woods, where the field meets the trees.
  const edge = () => {
    const x = cx + (rng() - 0.5) * 120;
    const ax = Math.abs(x - cx);
    const e = cz + 2 + 10 * smooth(6, 22, ax) + 0.08 * Math.max(0, ax - 22);
    return [x, e + (rng() - 0.6) * 8];
  };
  put('bush', 50, inWoods(45), 1.6);
  put('bush', 35, edge, 1.6);
  put('bush', 8, () => [cx + (rng() < 0.5 ? -1 : 1) * (6.5 + rng() * 2.5), cz - 1 - rng() * 6], 1.4);
  put('bramble', 30, edge, 1.8, { scale: 1.1 });
  put('bramble', 18, inWoods(30), 1.8);
  put('bramble', 6, () => [cx - 6.8 - rng() * 2, cz - 2 + rng() * 3.5], 1.6);
  put('sapling', 30, edge, 2.2);
  put('sapling', 24, inWoods(40), 2.2);
  put('sticks', 60, inWoods(40, 6), 1.2);
  put('sticks', 10, () => [cx + (rng() - 0.5) * 16, cz - 4 - rng() * 5], 1.2, { keep: 'low' });
  put('stump', 18, inWoods(45), 1.5, {
    after: (tpl, x, y, z, ry, s) => N.L.cylinder(x, z, tpl.trunkR * s * 1.1, y - 0.2, y + tpl.height * s, null, { visible: false, walkable: true }),
  });
  put('log', 16, inWoods(45), 3, {
    after: (tpl, x, y, z, ry, s) => {
      // A few low, walkable cylinders along the log.
      for (const t of [-0.35, 0, 0.35]) {
        const lx = x + Math.cos(ry) * tpl.len * s * t;
        const lz = z - Math.sin(ry) * tpl.len * s * t;
        N.L.cylinder(lx, lz, tpl.r * s, y - 0.2, y + Math.min(0.48, tpl.r * s * 1.8), null, { visible: false, walkable: true });
      }
    },
  });
}

function deadTrees(N) {
  const { h, forest } = N;
  DEAD.forEach(([x, z, kind, s], i) => {
    const tpl = makeTree(kind, 40 + i, kind === 'snag' ? { spec: { height: [7, 8] } } : {});
    forest.place(tpl, x, h(x, z) - 0.1, z, { rotY: i * 2.1, scale: s, tint: [1.05, 1.05, 1.05] });
  });
}

// ---------- Broken fences (a gap and an open gate where the track crosses) ----------
function fence(N, pts) {
  const { rng, h, g, o, L } = N;
  const wood = [lin(0x5a5046), lin(0x4a4038), lin(0x665a4c), lin(0x3e362e)];
  let hinge = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(len / 2.6);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const onTrack = o.trackDist(x, z) < 2.8;
      const y = h(x, z);
      let post = null;
      if (!onTrack && rng() > 0.1) {
        const top = [x + (rng() - 0.5) * 0.3, y + 1.15 + (rng() - 0.5) * 0.15, z + (rng() - 0.5) * 0.3];
        g.wood.beam([x, y - 0.25, z], top, 0.14, 0.12, [Math.cos(ang), 0, Math.sin(ang)], vary(pick(rng, wood), rng, 0.12), rng() * 9);
        L.cylinder(x, z, 0.1, y - 0.25, y + 1.2, null, { visible: false });
        post = { x, y, z, top };
        if (rng() < 0.6) weedClump(g.weed, rng, x + (rng() - 0.5) * 0.4, y, z + (rng() - 0.5) * 0.4, 0.6, 6);
      }
      if (onTrack && prev && !hinge) hinge = { ...prev, ang };
      if (prev && post) {
        for (const hh of [0.42, 0.92]) {
          const r = rng();
          if (r < 0.12) continue;
          const f = hh / 1.15;
          const a = [prev.x + (prev.top[0] - prev.x) * f, prev.y + hh, prev.z + (prev.top[2] - prev.z) * f];
          const b = [post.x + (post.top[0] - post.x) * f, post.y + hh, post.z + (post.top[2] - post.z) * f];
          const col = vary(pick(rng, wood), rng, 0.15);
          if (r < 0.3) {
            // Snapped: one end dropped into the grass.
            if (rng() < 0.5) a[1] = h(a[0], a[2]) + 0.05;
            else b[1] = h(b[0], b[2]) + 0.05;
          }
          g.wood.beam(a, b, 0.1, 0.05, [0, 1, 0], col, rng() * 9);
        }
      }
      prev = post;
    }
  }
  if (hinge) {
    // The gate hangs open from its post, its far end sunk in the grass.
    const a = hinge.ang + 1.25;
    const L0 = 2.4;
    const p0 = [hinge.x, hinge.y, hinge.z];
    const p1 = [hinge.x + Math.cos(a) * L0, h(hinge.x + Math.cos(a) * L0, hinge.z + Math.sin(a) * L0), hinge.z + Math.sin(a) * L0];
    const col = lin(0x5a5046);
    for (const [ya, yb] of [[0.3, 0.05], [0.95, 0.55], [0.3, 0.55]]) g.wood.beam([p0[0], p0[1] + ya, p0[2]], [p1[0], p1[1] + yb, p1[2]], 0.1, 0.05, [0, 1, 0], vary(col, rng, 0.1));
    g.wood.beam([p1[0], p1[1] - 0.05, p1[2]], [p1[0], p1[1] + 0.6, p1[2]], 0.1, 0.06, [Math.cos(a), 0, Math.sin(a)], col);
  }
}

// Flat-shaded rock or skull-ish blob from a displaced icosahedron.
function blob(g, x, y, z, sx, sy, sz, seed, col, ry = 0, detail = 1, jag = 0.22) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i);
    const vy = p.getY(i);
    const vz = p.getZ(i);
    const k = 1 + jag * (Math.sin(vx * 3.1 + seed) * Math.sin(vy * 2.7 + seed * 1.7) + 0.5 * Math.sin(vz * 5.3 + vx * 2.1 + seed * 0.3));
    p.setXYZ(i, vx * k, vy * k, vz * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
  g.geometry(geo, m, col);
  geo.dispose();
}

// ---------- The scarecrow: rags on a cross, an antler skull for a head ----------
function scarecrow(N, x, z) {
  const { rng, h, g, L } = N;
  const y = h(x, z);
  const wood = lin(0x4a4034);
  g.wood.beam([x, y - 0.3, z], [x + 0.06, y + 2.55, z + 0.03], 0.14, 0.14, [1, 0, 0], wood, 1.3);
  const sh = y + 1.95;
  g.wood.beam([x - 0.85, sh, z + 0.02], [x + 0.88, sh - 0.04, z + 0.06], 0.1, 0.08, [0, 1, 0], mulc(wood, 1.1), 3.7);
  const rope = [];
  for (let i = 0; i <= 26; i++) {
    const a = i * 0.9;
    rope.push([x + 0.05 + Math.cos(a) * 0.1, sh - 0.09 + i * 0.007, z + 0.03 + Math.sin(a) * 0.1]);
  }
  g.rough.tube(rope, rope.map(() => 0.012), 4, lin(0x6e5a3a));
  L.cylinder(x, z, 0.3, y, y + 2.5, null, { visible: false });
  const cloth = lin(0x6a5a48);
  const red = lin(0x8a1c1c);
  const strip = (px, py, pz, len, col, ry = 0, rz = 0) => g.rough.box(px, py - len / 2, pz, 0.07, len, 0.006, col, 0, ry, rz);
  if (N.dawn) {
    // At dawn the cross stands empty but for a few rags.
    for (let i = 0; i < 5; i++) strip(x - 0.7 + i * 0.33, sh - 0.03, z + 0.06, 0.2 + rng() * 0.3, vary(cloth, rng, 0.2), rng() * 0.6, (rng() - 0.5) * 0.3);
    return;
  }
  // Ragged coat hanging from the shoulders, two-sided, torn at the hem.
  const nt = 14;
  const nv = 6;
  const lens = [];
  for (let i = 0; i <= nt; i++) lens.push(1.0 + rng() * 0.45);
  lens[nt] = lens[0];
  for (const side of [1, -1]) {
    const b = g.rough.count;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nt; i++) {
        const v = j / nv;
        const a = (i / nt) * TAU;
        const r = 0.17 + 0.2 * v;
        const px = x + 0.05 + Math.cos(a) * r * 1.3;
        const pz = z + 0.03 + Math.sin(a) * r * 0.8;
        const py = sh + 0.03 - lens[i] * v + Math.sin(a * 3 + v * 4) * 0.02;
        const patch = Math.sin(a * 2.3 + 1) * Math.sin(v * 5.1) > 0.45;
        const col = mulc(patch ? red : cloth, (0.7 + 0.3 * Math.sin(a * 5 + v * 3) ** 2) * (side > 0 ? 1 : 0.6));
        g.rough.vert(px, py, pz, Math.cos(a) * side, 0.2 * side, Math.sin(a) * side, a, v, col);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nt; i++) {
        if (j > 2 && (i * 7 + j * 3) % 11 === 0) continue;
        const a = b + j * (nt + 1) + i;
        if (side > 0) g.rough.quad(a, a + nt + 1, a + nt + 2, a + 1);
        else g.rough.quad(a, a + 1, a + nt + 2, a + nt + 1);
      }
    }
  }
  // Sleeves along the crossbar, rags and straw falling out of the cuffs.
  const straw = lin(0x9a8452);
  for (const s of [-1, 1]) {
    g.rough.tube([[x + s * 0.12, sh, z + 0.04], [x + s * 0.45, sh - 0.02, z + 0.04], [x + s * 0.72, sh - 0.04, z + 0.05]], [0.1, 0.085, 0.075], 7, vary(cloth, rng, 0.15));
    for (let i = 0; i < 4; i++) strip(x + s * (0.55 + i * 0.05), sh - 0.05, z + 0.04 + (rng() - 0.5) * 0.1, 0.25 + rng() * 0.3, vary(cloth, rng, 0.2), rng() * 0.8, (rng() - 0.5) * 0.3);
    for (let i = 0; i < 14; i++) g.weed.box(x + s * (0.78 + rng() * 0.06), sh - 0.08 - rng() * 0.05, z + 0.05 + (rng() - 0.5) * 0.12, 0.006, 0.16 + rng() * 0.1, 0.006, vary(straw, rng, 0.2), (rng() - 0.5) * 0.8, 0, s * (1.2 + rng() * 0.8));
  }
  for (let i = 0; i < 20; i++) g.weed.box(x + 0.05 + (rng() - 0.5) * 0.5, sh - 1.1 - rng() * 0.2, z + (rng() - 0.5) * 0.3, 0.006, 0.2, 0.006, vary(straw, rng, 0.2), (rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6);
  // A strip of red cloth tied to the right arm.
  g.rough.tube([[x + 0.6, sh + 0.07, z + 0.04], [x + 0.6, sh - 0.07, z + 0.12], [x + 0.6, sh - 0.07, z - 0.04], [x + 0.6, sh + 0.07, z + 0.04]], [0.012, 0.012, 0.012, 0.012], 4, red);
  strip(x + 0.63, sh - 0.05, z + 0.12, 0.6, red, 0.2, 0.08);
  antlerSkull(N, x + 0.06, sh + 0.7, z + 0.08);
}

// Deer skull with antlers, facing south (toward the track).
function antlerSkull(N, x, y, z) {
  const { g, rng } = N;
  const bone = lin(0xc8bca0);
  const dirty = lin(0x8a7e66);
  g.rough.tint = (px, py, pz, c) => {
    const k = smooth(y - 0.12, y + 0.06, py);
    c[0] = dirty[0] + (c[0] - dirty[0]) * k;
    c[1] = dirty[1] + (c[1] - dirty[1]) * k;
    c[2] = dirty[2] + (c[2] - dirty[2]) * k;
  };
  blob(g.rough, x, y, z, 0.13, 0.11, 0.15, 3, bone, 0, 2, 0.06);
  const snout = new THREE.CylinderGeometry(0.045, 0.085, 0.34, 8, 1);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.08, z + 0.22), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.45, 0, 0)), new THREE.Vector3(1, 1, 0.8));
  g.rough.geometry(snout, m, bone);
  snout.dispose();
  g.rough.tint = null;
  const black = lin(0x060404);
  for (const s of [-1, 1]) g.rough.box(x + s * 0.085, y + 0.01, z + 0.1, 0.055, 0.045, 0.03, black, 0, s * 0.5, 0);
  g.rough.box(x, y - 0.05, z + 0.3, 0.04, 0.03, 0.12, black, -0.4, 0, 0);
  // Antlers: a curving main beam with tines.
  for (const s of [-1, 1]) {
    const b = [x + s * 0.07, y + 0.09, z - 0.03];
    const beam = [b, [b[0] + s * 0.12, b[1] + 0.12, b[2] - 0.05], [b[0] + s * 0.26, b[1] + 0.3, b[2] - 0.04], [b[0] + s * 0.3, b[1] + 0.5, b[2] + 0.04], [b[0] + s * 0.26, b[1] + 0.64, b[2] + 0.1]];
    g.rough.tube(beam, [0.022, 0.018, 0.014, 0.011, 0.006], 6, bone);
    for (const [k, dy, dz] of [[1, 0.16, 0.1], [2, 0.18, 0.12], [3, 0.14, 0.06]]) {
      const p = beam[k];
      g.rough.tube([p, [p[0] + s * 0.02, p[1] + dy, p[2] + dz + (rng() - 0.5) * 0.04]], [0.01, 0.004], 5, bone);
    }
  }
}

// ---------- Stone well, deep and dark: the cisterns below ----------
let WATER = null;
function wellWater() {
  if (!WATER) {
    WATER = new THREE.MeshStandardMaterial({ color: 0x0e2a2e, roughness: 0.06, metalness: 0.5, emissive: 0x041312 });
    WATER.name = 'field:wellWater';
  }
  return WATER;
}

function well(N, x, z) {
  const { rng, h, g, L } = N;
  const y = h(x, z);
  const stone = [lin(0x6a665e), lin(0x5a564e), lin(0x74695c), lin(0x4e4c46)];
  g.rough.tint = (px, py, pz, c) => {
    const m = py < y + 0.25 ? 0.4 : 0;
    c[0] += (0.03 - c[0]) * m;
    c[1] += (0.045 - c[1]) * m;
    c[2] += (0.012 - c[2]) * m;
  };
  for (let c = 0; c < 4; c++) {
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = ((k + (c % 2) * 0.5) / n) * TAU + (rng() - 0.5) * 0.08;
      const r = 1.0 + (rng() - 0.5) * 0.05;
      blob(g.rough, x + Math.cos(a) * r, y + 0.06 + c * 0.2, z + Math.sin(a) * r, 0.25, 0.115 + rng() * 0.02, 0.16, k * 7 + c * 13, vary(pick(rng, stone), rng, 0.18), Math.atan2(-Math.cos(a), -Math.sin(a)), 1, 0.16);
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    blob(g.rough, x + Math.cos(a) * 1.0, y + 0.82, z + Math.sin(a) * 1.0, 0.27, 0.05, 0.19, k * 5.3, vary(pick(rng, stone), rng, 0.15), Math.atan2(-Math.cos(a), -Math.sin(a)) + (rng() - 0.5) * 0.1, 1, 0.12);
  }
  // The shaft darkens to black; water far down.
  g.rough.tint = (px, py, pz, c) => {
    const k = 0.04 + 0.96 * smooth(y - 3.0, y + 0.7, py);
    c[0] *= k;
    c[1] *= k;
    c[2] *= k;
  };
  g.rough.lathe(x, y, z, [[0.88, 0.84], [0.84, 0.6], [0.84, -1.2], [0.8, -3.3]], 16, lin(0x4a4640));
  g.rough.tint = null;
  g.water.lathe(x, y - 3.2, z, [[0.82, 0], [0, 0]], 16, [1, 1, 1]);
  // Windlass frame, rope down into the dark, a little roof half fallen in.
  const wood = lin(0x4a4034);
  for (const s of [-1, 1]) g.wood.beam([x + s * 0.98, y + 0.6, z], [x + s * 0.96, y + 2.05, z], 0.13, 0.13, [0, 0, 1], vary(wood, rng, 0.1), rng() * 9);
  g.wood.tube([[x - 1.05, y + 1.75, z], [x + 1.05, y + 1.75, z]], [0.07, 0.07], 8, vary(wood, rng, 0.1), { cap: lin(0x6a5a44), capStart: lin(0x6a5a44) });
  g.rough.tube([[x - 0.3, y + 1.75, z], [x + 0.3, y + 1.75, z]], [0.1, 0.1], 10, lin(0x6e5a3a));
  g.wood.beam([x + 1.08, y + 1.75, z], [x + 1.08, y + 1.45, z + 0.15], 0.04, 0.04, [0, 0, 1], wood);
  g.wood.beam([x + 1.08, y + 1.45, z + 0.15], [x + 1.25, y + 1.45, z + 0.15], 0.04, 0.04, [0, 1, 0], wood);
  g.rough.tube([[x + 0.05, y + 1.66, z], [x + 0.06, y + 0.2, z + 0.02], [x + 0.08, y - 2.4, z + 0.04]], [0.014, 0.014, 0.012], 5, lin(0x6e5a3a));
  g.wood.beam([x - 1.2, y + 2.05, z - 0.02], [x + 1.2, y + 2.45, z - 0.02], 0.02, 0.02, [0, 1, 0], wood);
  g.wood.obox([x, y + 2.25, z - 0.38], [1, 0, 0], norm3([0, 0.47, -0.88]), norm3(cross3([1, 0, 0], norm3([0, 0.47, -0.88]))), 2.3, 0.85, 0.025, vary(wood, rng, 0.12), 1.1);
  g.wood.obox([x + 0.3, y + 1.3, z + 0.9], norm3([0.9, -0.3, 0.1]), norm3([0, 0.3, 1]), norm3(cross3(norm3([0.9, -0.3, 0.1]), norm3([0, 0.3, 1]))), 1.4, 0.8, 0.025, vary(wood, rng, 0.12), 4.4);
  // A bucket left on the rim.
  const bx = x - 0.72;
  const bz = z + 0.68;
  g.rough.lathe(bx, y + 0.84, bz, [[0.1, 0], [0.13, 0.26], [0.125, 0.265], [0.1, 0.03]], 10, lin(0x4a2c1e));
  L.cylinder(x, z, 1.18, y - 0.3, y + 0.85, null, { visible: false });
  L.sound('drip', [x, y - 2, z], { interval: [3, 7], radius: 10, gain: 0.8 });
  for (let i = 0; i < 8; i++) {
    const a = rng() * TAU;
    weedClump(g.weed, rng, x + Math.cos(a) * 1.35, y, z + Math.sin(a) * 1.35, 0.6, 6);
  }
}

// ---------- Round hay bales, rotting grey on top ----------
function hayBale(N, x, z, rot) {
  const { rng, h, g, L } = N;
  const y = h(x, z);
  const R = 0.72;
  const len = 1.25;
  const ax = [Math.cos(rot), 0, -Math.sin(rot)];
  const side = [-ax[2], 0, ax[0]];
  const straw = lin(0x9a8452);
  const rotten = lin(0x55503e);
  const under = lin(0x2a241c);
  const nt = 22;
  const nl = 5;
  const pt = (t, th, rr) => {
    const cy = Math.cos(th);
    const cs = Math.sin(th);
    const sag = cy > 0 ? 0.86 : 1;
    return [x + ax[0] * t * len + side[0] * cs * rr, y + R * 0.9 + cy * rr * sag, z + ax[2] * t * len + side[2] * cs * rr];
  };
  const b = g.wood.count;
  for (let j = 0; j <= nl; j++) {
    for (let i = 0; i <= nt; i++) {
      const t = j / nl - 0.5;
      const th = (i / nt) * TAU;
      const rr = R * (1 + 0.04 * Math.sin(th * 3 + j) + 0.03 * Math.sin(th * 7 + j * 2)) * (1 - 0.06 * (2 * t) ** 2);
      const p = pt(t, th, rr);
      const cy = Math.cos(th);
      let col = vary(straw, rng, 0.1);
      col = mixc(col, rotten, smooth(0.2, 0.8, cy) * 0.85);
      col = mixc(col, under, smooth(-0.3, -0.9, cy));
      const n = [side[0] * Math.sin(th), cy, side[2] * Math.sin(th)];
      g.wood.vert(p[0], p[1], p[2], n[0], n[1], n[2], th * R, t * len, col);
    }
  }
  for (let j = 0; j < nl; j++) {
    for (let i = 0; i < nt; i++) {
      const a = b + j * (nt + 1) + i;
      g.wood.quad(a, a + 1, a + nt + 2, a + nt + 1);
    }
  }
  // End faces: rings of wound straw.
  for (const e of [-0.5, 0.5]) {
    const c0 = g.wood.count;
    const cp = pt(e, 0, 0);
    const n = [ax[0] * Math.sign(e), 0, ax[2] * Math.sign(e)];
    g.wood.vert(cp[0], cp[1], cp[2], n[0], n[1], n[2], 0, 0, mulc(straw, 0.6));
    for (let ring = 1; ring <= 4; ring++) {
      for (let i = 0; i <= nt; i++) {
        const th = (i / nt) * TAU;
        const rr = (R * ring) / 4 * 0.97;
        const p = pt(e * 0.985, th, rr);
        const k = 0.6 + 0.4 * Math.sin(ring * 2.7 + th * 0.5) ** 2;
        g.wood.vert(p[0], p[1], p[2], n[0], n[1], n[2], th * rr, rr, mixc(mulc(straw, k), under, smooth(-0.3, -0.9, Math.cos(th)) * 0.8));
      }
    }
    const ringStart = (r) => c0 + 1 + (r - 1) * (nt + 1);
    const flip = e > 0;
    for (let i = 0; i < nt; i++) {
      const a = ringStart(1) + i;
      if (flip) g.wood.tri(c0, a, a + 1);
      else g.wood.tri(c0, a + 1, a);
      for (let r = 1; r < 4; r++) {
        const p0 = ringStart(r) + i;
        const p1 = ringStart(r + 1) + i;
        if (flip) g.wood.quad(p0, p1, p1 + 1, p0 + 1);
        else g.wood.quad(p0, p0 + 1, p1 + 1, p1);
      }
    }
  }
  // Twine bands.
  for (const t of [-0.28, 0.28]) {
    const ring = [];
    for (let i = 0; i <= 24; i++) ring.push(pt(t, (i / 24) * TAU, R * 1.012));
    g.rough.tube(ring, ring.map(() => 0.008), 3, lin(0x3a2e22));
  }
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU;
    weedClump(g.weed, rng, x + Math.cos(a) * 1.0, y, z + Math.sin(a) * 1.0, 0.3, 6);
  }
  L.cylinder(x, z, 0.8, y, y + 1.4, null, { visible: false });
}

// ---------- Rocks and dead leaves ----------
function rocks(N) {
  const { rng, h, keep, g, L, cx, cz } = N;
  const grey = [lin(0x5e5c56), lin(0x4e4c48), lin(0x6a665e), lin(0x56524a)];
  g.rough.tint = (px, py, pz, c, nx, ny) => {
    const m = ny > 0.45 ? (ny - 0.45) * 1.4 : 0;
    c[0] += (0.035 - c[0]) * m;
    c[1] += (0.05 - c[1]) * m;
    c[2] += (0.014 - c[2]) * m;
  };
  let n = 0;
  for (let i = 0; i < 400 && n < 46; i++) {
    const a = rng() * TAU;
    const d = 7 + Math.sqrt(rng()) * 50;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    if (rng() > density(N, x, z) + 0.12 || keep(x, z, 'low') || !room(N, x, z, 1.6, 'low')) continue;
    mark(N, x, z, 1.6, 'low');
    const r = 0.25 + rng() ** 2 * 1.2;
    const y = h(x, z);
    blob(g.rough, x, y + r * 0.2, z, r * (0.9 + rng() * 0.4), r * (0.55 + rng() * 0.25), r * (0.9 + rng() * 0.4), i * 1.7, vary(pick(rng, grey), rng, 0.15), rng() * TAU);
    if (r > 0.55) L.cylinder(x, z, r * 0.85, y - 1, y + r * 0.7, null, { visible: false, walkable: r * 0.7 < 0.5 });
    n++;
  }
  // Small stones around the cabin and the well.
  for (let i = 0; i < 18; i++) {
    const a = rng() * TAU;
    const near = i < 12;
    const d = near ? 4.5 + rng() * 3 : 1.4 + rng() * 1.2;
    const x = (near ? cx : WELL[0]) + Math.cos(a) * d;
    const z = (near ? cz : WELL[1]) + Math.sin(a) * d;
    if (near && (keep(x, z, 'litter') || (Math.abs(x - cx) < 1.4 && z > cz + 2))) continue;
    const r = 0.08 + rng() * 0.15;
    blob(g.rough, x, h(x, z) + r * 0.2, z, r, r * 0.6, r * 1.1, i * 3.3, vary(pick(rng, grey), rng, 0.15), rng() * TAU, 0, 0.2);
  }
  g.rough.tint = null;
}

function groundLitter(N) {
  const { rng, h, keep, g, cx, cz } = N;
  let n = 0;
  for (let i = 0; i < 6000 && n < 1100; i++) {
    const a = rng() * TAU;
    const d = 3 + Math.sqrt(rng()) * 45;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    if (rng() > 0.12 + density(N, x, z) * 0.9 || keep(x, z, 'litter')) continue;
    if (x > cx - 3.3 && x < cx + 3.3 && z > cz - 2.8 && z < cz + 5.2) continue;
    litterAt(g.leaf, rng, x, z, h);
    n++;
  }
}

// Three dead leaves lying on the ground around (x, z).
function litterAt(g, rng, x, z, h) {
  for (let k = 0; k < 3; k++) {
    const lx = x + (rng() - 0.5) * 0.7;
    const lz = z + (rng() - 0.5) * 0.7;
    const s = 0.08 + rng() * 0.08;
    const rot = rng() * TAU;
    const U = [Math.cos(rot), (rng() - 0.5) * 0.3, Math.sin(rot)];
    const S = [-Math.sin(rot), (rng() - 0.5) * 0.3, Math.cos(rot)];
    const y = h(lx, lz) + 0.015 + rng() * 0.01;
    g.card([lx - U[0] * s * 0.5, y, lz - U[2] * s * 0.5], U, S, s, s * 0.9, LEAF_CELLS[2 + (rng() < 0.5 ? 1 : 0)], [0, 1, 0], vary(pick(rng, LITTER_COLORS), rng, 0.25));
  }
}
