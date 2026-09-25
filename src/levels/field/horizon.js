import * as THREE from 'three';
import { makeRng, fbm2 } from '../../core/rng.js';
import { smoothstep } from '../../core/utils.js';
import { getMaterial, solid } from '../../world/materials.js';
import { Forest, makeTree } from '../../world/trees.js';
import { Geo, addMesh, fieldMaterials, weedClump } from './kit.js';

// The woods around the field. The field is a clearing and the forest closes in
// just past the invisible boundary (a box at ±88), in three layers:
//  1. the edge: an irregular row of full trees from the same generator as the
//     woods by the cabin (bare autumn oaks and maples, dark spruce stands, dead
//     snags), with bushes, bramble, saplings and dry weeds where the grass meets
//     the trees. Full templates near the spawn, the cheaper far ones elsewhere;
//  2. behind it, far trees, taller and denser;
//  3. at the back, crossed-card silhouettes (drawn in code) that close the gaps.
// The dirt track leaves the field through a gap in the trees and bends away.
// Every tree goes through one Forest (3 draw calls, per-tree culling); the
// cards and the weeds are one mesh each.
// ctx = { L, rng, heightAt }

const TAU = Math.PI * 2;
const B = 88; // the invisible boundary (field.js)
const FAR = 127; // the terrain ends at ±130
const SPAWN = [16, 78];

export function buildTreeLine({ L, heightAt }) {
  const H = {
    L,
    h: heightAt,
    rng: makeRng(1301),
    forest: new Forest(L, { shadows: false }),
    placed: new Map(),
    weeds: new Geo(),
    cullR: [],
  };
  templates(H);
  edgeTrees(H);
  backTrees(H);
  undergrowth(H);
  H.forest.build();
  farCull(H);
  addMesh(L, H.weeds, fieldMaterials().weed, { cast: false, name: 'field:edgeWeeds' });
  cards(H);
  lane(H);
  backstop(H);
}

// ---------- Layout helpers ----------
const cheb = (x, z) => Math.max(Math.abs(x), Math.abs(z));

// Where the woods begin (distance from the field centre, box-shaped): just past
// the boundary, wobbling in and out so the edge is never a straight line.
const edgeAt = (x, z) => 88.4 + 8.5 * smoothstep(0.36, 0.72, fbm2(x * 0.032 + 40, z * 0.032 - 17, 3, 404));

// Clumps and clearings inside the woods (0.2..0.8).
const clump = (x, z) => fbm2(x * 0.055 + 3, z * 0.055 + 9, 3, 77);

// Stands of spruce among the bare broadleaves.
const spruceK = (x, z) => smoothstep(0.38, 0.62, fbm2(x * 0.022 - 7, z * 0.022 + 31, 3, 91));

// Behind the cabin the woods of the field already fill the view: fewer real
// trees there (the cards still close the gaps). Full density toward the road.
const sideK = (x, z) => 0.3 + 0.7 * smoothstep(-60, 30, z);

// The dirt track (same curve as field.js), bending east once it is in the trees.
function laneX(z) {
  const x = 16 * smoothstep(4, 80, z) + Math.sin(z * 0.06) * 2.5 * smoothstep(8, 40, z);
  return z > 109 ? x + ((z - 109) / 19) ** 2 * 9 : x;
}
const laneDist = (x, z) => (z < 60 ? 99 : Math.abs(x - laneX(z)));

// Random point between box radii d0 and d1.
function band(rng, d0, d1) {
  for (;;) {
    const x = (rng() * 2 - 1) * d1;
    const z = (rng() * 2 - 1) * d1;
    const d = cheb(x, z);
    if (d >= d0) return [x, z, d];
  }
}

// Minimum spacing (spatial hash, 4 m cells) per layer.
function room(H, x, z, r, layer, theirs = true) {
  const i0 = Math.floor((x - r) / 4);
  const i1 = Math.floor((x + r) / 4);
  const j0 = Math.floor((z - r) / 4);
  const j1 = Math.floor((z + r) / 4);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const list = H.placed.get(`${layer}${i},${j}`);
      if (!list) continue;
      for (const p of list) if (Math.hypot(p[0] - x, p[1] - z) < (theirs ? Math.max(r, p[2]) : r)) return false;
    }
  }
  return true;
}

function mark(H, x, z, r, layer) {
  const k = `${layer}${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  let list = H.placed.get(k);
  if (!list) H.placed.set(k, (list = []));
  list.push([x, z, r]);
}

const pick = (rng, a) => a[Math.floor(rng() * a.length)];
// Every tree goes through here: the hiding distance for farCull() follows the item order.
function place(H, layer, tpl, x, y, z, o) {
  H.forest.place(tpl, x, y, z, o);
  H.cullR.push(layer === 'low' ? 85 : 128);
}
const tintK = (rng, k = 0.14) => {
  const v = 1 + (rng() - 0.5) * 2 * k;
  return [v, v * (1 + (rng() - 0.5) * 0.06), v * (1 + (rng() - 0.5) * 0.08)];
};

// ---------- Tree templates (own seeds, so no tree repeats one by the cabin) ----------
function templates(H) {
  const t = (kind, ...seeds) => seeds.map((s) => makeTree(kind, s));
  H.T = {
    oak: t('oak', 101, 102, 103),
    maple: t('maple', 104, 105),
    spruce: t('spruce', 106, 107, 108),
    dead: t('deadOak', 109, 110),
    snag: t('snag', 111, 112),
    oakFar: t('oakFar', 113, 114, 115),
    mapleFar: t('mapleFar', 116, 117),
    spruceFar: t('spruceFar', 118, 119, 120),
    // Back-row spruce: fewer, bigger needle sprays on fewer whorls.
    spruceLow: [131, 132].map((s) => makeTree('spruceFar', s, { spec: { radial: [4, 3, 3], segLen: [3, 4, 2], spacing: [1.0, 1.3], cardsPerM: 1.2, cardSize: [1.4, 1.9], curtain: 0.25 } })),
    sapling: t('sapling', 121, 122),
    bush: t('bush', 123, 124, 125),
    bramble: t('bramble', 126, 127),
    log: t('log', 128, 129),
    stump: t('stump', 130),
  };
}

// ---------- 1. The edge ----------
function edgeTrees(H) {
  const { rng, T, h } = H;
  for (let i = 0; i < 7000; i++) {
    const [x, z, d] = band(rng, 86.2, 104);
    const e = edgeAt(x, z);
    if (d < e - 2.2 || d > e + 7) continue;
    // A few strays stand out in front of the edge.
    if (d < e && rng() > 0.2) continue;
    if (laneDist(x, z) < 4.4 || Math.hypot(x - 19, z - 81) < 9) continue;
    if (rng() > (0.25 + clump(x, z)) * sideK(x, z)) continue;
    const spruce = rng() < 0.12 + 0.55 * spruceK(x, z);
    const r = spruce ? 3.5 : 4.4;
    if (!room(H, x, z, r, 'tree')) continue;
    mark(H, x, z, r, 'tree');
    // Detail by side: full trees round the open southern half (the road side is
    // seen up close from the spawn), far ones behind the cabin's woods.
    const near = z > 5 || Math.hypot(x - SPAWN[0], z - SPAWN[1]) < 70;
    const roll = rng();
    let tpl;
    if (spruce) tpl = pick(rng, near ? T.spruce : z > -45 ? T.spruceFar : T.spruceLow);
    else if (roll < 0.12) tpl = pick(rng, T.snag);
    else if (roll < 0.26) tpl = pick(rng, T.dead);
    else if (roll < 0.63) tpl = pick(rng, near ? T.oak : T.oakFar);
    else tpl = pick(rng, near ? T.maple : T.mapleFar);
    const s = (0.82 + rng() * 0.42) * (tpl.kind === 'snag' ? 1.25 : 1);
    place(H, 'edge', tpl, x, h(x, z) - 0.08, z, { rotY: rng() * TAU, scale: s, tint: tintK(rng), shadow: false, collide: d < B + 1 });
  }
}

// ---------- 2. Far trees behind the edge ----------
function backTrees(H) {
  const { rng, T, h } = H;
  for (let i = 0; i < 9000; i++) {
    const [x, z, d] = band(rng, 94, 115);
    if (d < edgeAt(x, z) + 5) continue;
    if (laneDist(x, z) < 4 + Math.max(0, z - 112) * 0.3) continue;
    const k = sideK(x, z);
    if (rng() > (0.1 + clump(x + 50, z) * 0.8) * k * k) continue;
    const spruce = rng() < 0.3 + 0.5 * spruceK(x, z);
    const r = spruce ? 5.2 : 6.2;
    if (!room(H, x, z, r, 'tree')) continue;
    mark(H, x, z, r, 'tree');
    const roll = rng();
    const tpl = spruce ? pick(rng, T.spruceLow) : roll < 0.12 ? pick(rng, T.dead) : roll < 0.58 ? pick(rng, T.oakFar) : pick(rng, T.mapleFar);
    // Taller the deeper they stand, so the wall of trees rises behind the edge.
    const s = (0.95 + rng() * 0.4) * (1 + smoothstep(95, 116, d) * 0.25);
    place(H, 'back', tpl, x, h(x, z) - 0.1, z, { rotY: rng() * TAU, scale: s, tint: tintK(rng, 0.18), shadow: false, collide: false });
  }
}

// ---------- Undergrowth where the field meets the trees ----------
function undergrowth(H) {
  const { rng, T, h, weeds } = H;
  const put = (kind, n, d0, d1, r, scale = [0.8, 1.25]) => {
    let done = 0;
    for (let i = 0; i < n * 40 && done < n; i++) {
      const [x, z] = band(rng, 85.6, 104);
      const e = edgeAt(x, z);
      const d = cheb(x, z);
      if (d < e + d0 || d > e + d1) continue;
      if (laneDist(x, z) < 2.6 || Math.hypot(x - 19, z - 81) < 7) continue;
      if (rng() > sideK(x, z)) continue;
      if (!room(H, x, z, r, 'low') || !room(H, x, z, 1.0, 'tree', false)) continue;
      mark(H, x, z, r, 'low');
      const s = scale[0] + rng() * (scale[1] - scale[0]);
      place(H, 'low', pick(rng, T[kind]), x, h(x, z) - 0.03, z, { rotY: rng() * TAU, scale: s, tint: tintK(rng, 0.18), shadow: false, collide: false });
      done++;
    }
  };
  put('bush', 70, -3, 5, 1.9, [0.9, 1.5]);
  put('bramble', 55, -2.5, 4, 2.0, [1.0, 1.4]);
  put('sapling', 45, -2, 7, 2.4, [0.9, 1.4]);
  put('log', 8, 0, 9, 3.5);
  put('stump', 10, -1, 8, 1.6);
  // Tall dry weeds along the margin, thicker toward the spawn.
  for (let i = 0; i < 4000; i++) {
    const [x, z, d] = band(rng, 84.5, 100);
    const e = edgeAt(x, z);
    if (d < e - 4.5 || d > e + 1.5 || laneDist(x, z) < 1.8) continue;
    if (rng() > sideK(x, z) * (Math.hypot(x - SPAWN[0], z - SPAWN[1]) < 60 ? 0.5 : 0.18)) continue;
    weedClump(weeds, rng, x, h(x, z), z, 0.9, 7, 1 + rng() * 0.5);
  }
}

// Trees far from the camera are hidden: past ~125 m they are fog-coloured shapes
// behind the silhouette cards anyway (undergrowth goes sooner). Checked a few
// times a second; instance ids follow the order Forest.build adds them in.
function farCull(H) {
  const { forest, L } = H;
  const items = forest.items;
  const n = items.length;
  const X = new Float32Array(n);
  const Z = new Float32Array(n);
  const R2 = new Float32Array(n);
  const vis = new Uint8Array(n).fill(1);
  const meshes = [];
  const ids = [];
  for (const mesh of forest.meshes) {
    const part = mesh.name.split(':')[1];
    const id = new Int32Array(n).fill(-1);
    let k = 0;
    for (let i = 0; i < n; i++) if (items[i].tpl.geo[part]) id[i] = k++;
    if (k !== mesh.instanceCount) return; // layout changed: keep everything visible
    meshes.push(mesh);
    ids.push(id);
  }
  for (let i = 0; i < n; i++) {
    X[i] = items[i].x;
    Z[i] = items[i].z;
    R2[i] = H.cullR[i] * H.cullR[i];
  }
  let timer = 0;
  L.onUpdate((dt, t, game) => {
    timer -= dt;
    if (timer > 0) return;
    timer = 0.2;
    const c = game.camera.position;
    for (let i = 0; i < n; i++) {
      const dx = X[i] - c.x;
      const dz = Z[i] - c.z;
      const d2 = dx * dx + dz * dz;
      const v = vis[i] ? d2 < R2[i] : d2 < R2[i] * 0.9;
      if (v === !!vis[i]) continue;
      vis[i] = v ? 1 : 0;
      for (let m = 0; m < meshes.length; m++) if (ids[m][i] >= 0) meshes[m].setVisibleAt(ids[m][i], v);
    }
  });
}

// ---------- 3. Silhouette cards at the back ----------
function cards(H) {
  const { rng, h } = H;
  const g = new Geo();
  const col = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < 30000 && n < 3200; i++) {
    const [x, z, d] = band(rng, 98, FAR);
    if (d < edgeAt(x, z) + 8) continue;
    if (laneDist(x, z) < 3.4 && z < 124) continue;
    const r = 1.9 + rng() * 1.1;
    if (!room(H, x, z, r, 'card') || !room(H, x, z, 1.6, 'tree', false)) continue;
    mark(H, x, z, r, 'card');
    const roll = rng();
    const kind = roll < 0.6 + 0.3 * (spruceK(x, z) - 0.5) ? 0 : roll < 0.92 ? 1 : 2;
    const cell = kind === 0 ? Math.floor(rng() * 4) : kind === 1 ? 4 + Math.floor(rng() * 3) : 7;
    const ht = (kind === 0 ? 15 : kind === 1 ? 14 : 11) * (0.8 + rng() * 0.45) * (1 + smoothstep(100, FAR, d) * 0.3);
    const v = 0.75 + rng() * 0.35;
    col[0] = v * (1 + (rng() - 0.5) * 0.1);
    col[1] = v;
    col[2] = v * (1 + (rng() - 0.5) * 0.12);
    card(g, x, h(x, z) - 0.35, z, ht, rng() * Math.PI, cell, col);
    n++;
  }
  addMesh(H.L, g, cardMaterial(), { cast: false, name: 'field:treeCards' });
}

// Two crossed, two-faced quads. Normals lean out from the trunk and up so a
// card shades like a rounded crown from any side.
function card(g, x, y, z, ht, rot, cell, col) {
  const w = ht * 0.5;
  const uv = CELL_UV[cell];
  const bot = [col[0] * 0.45, col[1] * 0.45, col[2] * 0.45];
  for (let q = 0; q < 2; q++) {
    const a = rot + q * Math.PI * 0.5;
    const dx = Math.cos(a) * w * 0.5;
    const dz = Math.sin(a) * w * 0.5;
    const nx = Math.cos(a) * 0.6;
    const nz = Math.sin(a) * 0.6;
    for (const side of [1, -1]) {
      const b = g.count;
      g.vert(x - dx, y, z - dz, -nx, 0.8, -nz, uv[0], uv[1], bot);
      g.vert(x + dx, y, z + dz, nx, 0.8, nz, uv[2], uv[1], bot);
      g.vert(x + dx, y + ht, z + dz, nx, 0.8, nz, uv[2], uv[3], col);
      g.vert(x - dx, y + ht, z - dz, -nx, 0.8, -nz, uv[0], uv[3], col);
      if (side > 0) g.quad(b, b + 1, b + 2, b + 3);
      else g.quad(b, b + 3, b + 2, b + 1);
    }
  }
}

// Atlas: 4 x 2 cells of 256 x 512 px. 0-3 spruce, 4-6 bare broadleaf, 7 dead snag.
const CELL_UV = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
  const c = k % 4;
  const r = k >> 2;
  return [c * 0.25 + 0.003, 1 - (r + 1) * 0.5 + 0.002, (c + 1) * 0.25 - 0.003, 1 - r * 0.5 - 0.002];
});

let CARD_MAT = null;
function cardMaterial() {
  if (CARD_MAT) return CARD_MAT;
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  const rng = makeRng(2718);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < 8; k++) {
    const ox = (k % 4) * 256;
    const oy = (k >> 2) * 512;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox + 3, oy + 3, 250, 506);
    ctx.clip();
    if (k < 4) drawSpruce(ctx, rng, ox + 128, oy + 509, 480 - k * 18);
    else if (k < 7) drawBroadleaf(ctx, rng, ox + 128, oy + 509, 470);
    else drawSnag(ctx, rng, ox + 128, oy + 509, 380);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  CARD_MAT = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, vertexColors: true, roughness: 1 });
  CARD_MAT.name = 'field:treeCards';
  return CARD_MAT;
}

const BARK = ['#2c251f', '#312922', '#27211c', '#3a3129'];
const NEEDLES = ['#0f1611', '#141d16', '#19241a', '#0c110d', '#1d291e', '#223023'];
const LEAVES = ['#4a2c16', '#5a3418', '#3e2616', '#6a3a18'];

// Spruce: straight trunk, whorls of drooping branches hung with needle sprays.
function drawSpruce(ctx, rng, cx, by, Ht) {
  const top = by - Ht;
  const base = by - Ht * (0.1 + rng() * 0.06);
  const halfW = 92 + rng() * 26;
  ctx.strokeStyle = '#1a1411';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx, by);
  ctx.lineTo(cx + (rng() - 0.5) * 4, top + 6);
  ctx.stroke();
  // Dead stubs on the bare foot of the trunk.
  ctx.lineWidth = 1.6;
  for (let y = by - 20; y > base; y -= 7 + rng() * 8) {
    const s = rng() < 0.5 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + s * (6 + rng() * 14), y + 3 + rng() * 6);
    ctx.stroke();
  }
  for (let y = base; y > top + 3; y -= 3.5 + rng() * 4.5) {
    const rel = (base - y) / (base - top);
    const len = (halfW * Math.pow(1 - rel, 1.08) + 6) * (0.72 + rng() * 0.5);
    for (const s of [-1, 1]) {
      if (rng() < 0.1) continue;
      const droop = (0.18 + (1 - rel) * 0.34) * (0.7 + rng() * 0.6);
      const ex = cx + s * len;
      const ey = y + len * droop * 0.6;
      const mx = cx + s * len * 0.55;
      const my = y + len * droop * 0.62;
      const path = new Path2D();
      const n = Math.ceil(len / 2.2);
      for (let q = 1; q <= n; q++) {
        const t = q / n;
        const px = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * mx + t * t * ex;
        const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * my + t * t * ey;
        const nl = (5 + rng() * 8) * (1.1 - t * 0.5) * (0.6 + (1 - rel) * 0.5);
        // Needles hang down and out, a few stand up.
        const a1 = Math.PI / 2 - s * (0.25 + rng() * 0.7);
        path.moveTo(px, py);
        path.lineTo(px + Math.cos(a1) * nl, py + Math.sin(a1) * nl);
        const a2 = -Math.PI / 2 + s * (0.6 + rng() * 0.6);
        path.moveTo(px, py);
        path.lineTo(px + Math.cos(a2) * nl * 0.55, py + Math.sin(a2) * nl * 0.55);
      }
      ctx.strokeStyle = NEEDLES[Math.floor(rng() * NEEDLES.length)];
      ctx.lineWidth = 1.7 + rng() * 0.8;
      ctx.stroke(path);
      ctx.strokeStyle = '#1a1411';
      ctx.lineWidth = 2.2 * (1 - rel * 0.6);
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }
  }
  // Leader.
  ctx.strokeStyle = NEEDLES[2];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, top + 14);
  ctx.lineTo(cx, top);
  ctx.stroke();
}

// Bare broadleaf: short trunk, three or four limbs forking into a twiggy crown.
function drawBroadleaf(ctx, rng, cx, by, Ht) {
  const trunkTop = by - Ht * (0.3 + rng() * 0.1);
  ctx.strokeStyle = BARK[0];
  for (let s = 0; s < 4; s++) {
    ctx.lineWidth = 11 - s * 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + (rng() - 0.5) * 2, by - ((by - trunkTop) * s) / 4);
    ctx.lineTo(cx + (rng() - 0.5) * 3, by - ((by - trunkTop) * (s + 1)) / 4);
    ctx.stroke();
  }
  const n = 3 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * (0.42 + rng() * 0.12) + (rng() - 0.5) * 0.2;
    limb(ctx, rng, cx, trunkTop + rng() * 12, a, Ht * (0.24 + rng() * 0.08), 7, 0);
  }
}

function limb(ctx, rng, x, y, ang, len, w, depth) {
  ctx.strokeStyle = BARK[depth % BARK.length];
  for (let s = 0; s < 3; s++) {
    ang += (rng() - 0.5) * 0.4;
    ang += (-Math.PI / 2 - ang) * 0.07;
    const nx = x + (Math.cos(ang) * len) / 3;
    const ny = y + (Math.sin(ang) * len) / 3;
    ctx.lineWidth = Math.max(1.2, w * (1 - s * 0.12));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    x = nx;
    y = ny;
  }
  if (depth >= 5 || len < 7) {
    // Twig brush at the tip, now and then a few dead leaves.
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) {
      const a = ang + (rng() - 0.5) * 1.6;
      const l = 5 + rng() * 9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    if (rng() < 0.3) {
      ctx.fillStyle = LEAVES[Math.floor(rng() * LEAVES.length)];
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(x + (rng() - 0.5) * 10, y + (rng() - 0.5) * 10, 2.6, 1.6, rng() * 3, 0, TAU);
        ctx.fill();
      }
    }
    return;
  }
  const n = 2 + (rng() < 0.45 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = ang + (i - (n - 1) / 2) * (0.45 + rng() * 0.35) + (rng() - 0.5) * 0.3;
    limb(ctx, rng, x, y, a, len * (0.64 + rng() * 0.16), w * 0.64, depth + 1);
  }
}

// Standing dead tree: tapering trunk snapped off, a few broken limbs.
function drawSnag(ctx, rng, cx, by, Ht) {
  const top = by - Ht;
  let x = cx;
  ctx.strokeStyle = '#3a342e';
  for (let s = 0; s < 6; s++) {
    const nx = x + (rng() - 0.5) * 6;
    ctx.lineWidth = 12 - s * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, by - ((by - top) * s) / 6);
    ctx.lineTo(nx, by - ((by - top) * (s + 1)) / 6);
    ctx.stroke();
    x = nx;
  }
  for (let k = 0; k < 5; k++) {
    const y = by - Ht * (0.35 + rng() * 0.55);
    const s = k % 2 ? 1 : -1;
    limb(ctx, rng, cx, y, -Math.PI / 2 + s * (0.7 + rng() * 0.5), Ht * (0.08 + rng() * 0.12), 4, 4);
  }
}

// ---------- The track runs on into the woods and bends away ----------
function lane(H) {
  const { h, L } = H;
  const pos = [];
  const idx = [];
  // Continues field.js's ribbon (last point z = 109, index 70) without a seam.
  for (let i = 70; i <= 83; i++) {
    const z = 4 + i * 1.5;
    const x = laneX(z);
    const dx = laneX(z + 0.5) - laneX(z - 0.5);
    const l = Math.hypot(dx, 1);
    const w = (1.3 + Math.sin(i * 0.7) * 0.15) * (1 - smoothstep(118, 125, z) * 0.35);
    // The first pair matches field.js exactly (offset along x), then square to the bend.
    const k = i === 70 ? 0 : 1;
    const px = w + (w / l - w) * k;
    const pz = (-dx / l) * w * k;
    pos.push(x - px, h(x - px, z - pz) + 0.04, z - pz, x + px, h(x + px, z + pz) + 0.04, z + pz);
    if (i > 70) {
      const a = (i - 71) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  L.batcher.add(g, getMaterial('dirt'), { cast: false });
}

// ---------- A dark band where the terrain ends ----------
// Low gaps between the far trunks would otherwise show the sky dome below the
// horizon. A rounded-square band just inside the terrain edge, dark and fogged.
function backstop(H) {
  const { h, L } = H;
  const D = 128.8;
  const n = 480;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const x = D * Math.sign(c) * Math.abs(c) ** 0.25;
    const z = D * Math.sign(sn) * Math.abs(sn) ** 0.25;
    const y = h(x, z);
    pos.push(x, y - 3, z, x, y + 5 + 4 * fbm2(x * 0.08, z * 0.08, 2, 5), z);
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 2, b + 3, b, b + 3, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  L.batcher.add(g, solid(0x0b0c09, { roughness: 1 }), { cast: false, worldUV: false });
}
