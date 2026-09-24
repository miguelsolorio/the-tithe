import * as THREE from 'three';
import { getMaterial } from './materials.js';
import { fbm2 } from '../core/rng.js';

// Builds rooms and corridors from an ASCII plan. Each character is one cell
// (default 1 m); ' ' and '#' are solid rock/void, any other character is a
// room key. Walls are generated on every edge between different keys, doors
// cut openings into those walls.
//
// spec = {
//   origin: [x, z]      world position of the top-left corner of cell (0, 0); row 0 is the most -z (north)
//   cell: 1, y: 0, wallT: 0.2,
//   rows: ['aaab', ...],
//   rooms: { a: { floor, wall, ceil, h, y, style: 'house' | 'brick' | 'stone' | 'flesh' | 'plain',
//                 wainscot, trim, vault, noCeil, stairs: { dir: 'n'|'s'|'e'|'w', rise } } },
//   doors: [{ at: [i, j], side: 'n'|'s'|'e'|'w', len = 1, h = 2.2, leaf, locked, id, prompt, onOpen, open, material, frame = true }],
// }
// Returns helpers: at(i, j) -> Vector3 cell centre on its floor, rect(key), doors (by id), W, H.

const DEFAULTS = {
  house: { floor: 'floorboards', wall: 'wallpaper', ceil: 'plaster', h: 3.1, trim: true },
  brick: { floor: 'concrete', wall: 'brick', ceil: 'brick', h: 3 },
  stone: { floor: 'stoneWet', wall: 'stoneWet', ceil: 'stone', h: 3.2 },
  flesh: { floor: 'fleshDark', wall: 'flesh', ceil: 'flesh', h: 4 },
  plain: { floor: 'concrete', wall: 'concrete', ceil: 'concrete', h: 3 },
};

export function buildPlan(L, spec) {
  const cell = spec.cell ?? 1;
  const [ox, oz] = spec.origin ?? [0, 0];
  const rows = spec.rows;
  const H = rows.length;
  const W = Math.max(...rows.map((r) => r.length));
  const baseY = spec.y ?? 0;
  const t = spec.wallT ?? 0.2;
  const X = (i) => ox + i * cell;
  const Z = (j) => oz + j * cell;
  const ch = (i, j) => (i < 0 || j < 0 || j >= H || i >= W ? ' ' : rows[j][i] ?? ' ');
  const solidCh = (c) => c === ' ' || c === '#';
  // Room pairs with no wall between them, e.g. open: ['Gu'] (a hall and its stairs).
  const openSet = new Set((spec.open || []).flatMap((p) => [p, p[1] + p[0]]));

  const R = {};
  const room = (c) => {
    if (solidCh(c)) return null;
    if (R[c]) return R[c];
    const def = spec.rooms?.[c] || {};
    const style = def.style || spec.style || 'house';
    const r = { key: c, ...DEFAULTS[style], ...def, style };
    r.y = def.y ?? baseY;
    const rise = r.stairs?.rise ?? 0;
    r.bottom = r.y + Math.min(0, rise);
    r.top = r.y + Math.max(0, rise) + r.h;
    r.vaultRise = r.vault ? Math.min(1.2, (r.vaultWidth ?? 3) * 0.35) : 0;
    r.dome = style === 'flesh' ? r.dome ?? 1 : 0;
    R[c] = r;
    return r;
  };

  // ---------- Floors and ceilings (greedy rectangles per room key) ----------
  const seen = new Uint8Array(W * H);
  const rects = {};
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = ch(i, j);
      if (solidCh(c) || seen[j * W + i]) continue;
      let w = 1;
      while (i + w < W && ch(i + w, j) === c && !seen[j * W + i + w]) w++;
      let h = 1;
      outer: while (j + h < H) {
        for (let k = 0; k < w; k++) if (ch(i + k, j + h) !== c || seen[(j + h) * W + i + k]) break outer;
        h++;
      }
      for (let jj = j; jj < j + h; jj++) for (let ii = i; ii < i + w; ii++) seen[jj * W + ii] = 1;
      (rects[c] ||= []).push({ i, j, w, h, x0: X(i), z0: Z(j), x1: X(i + w), z1: Z(j + h) });
    }
  }

  for (const [c, list] of Object.entries(rects)) {
    const r = room(c);
    for (const q of list) {
      if (r.stairs) {
        L.stairs({ x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1, fromY: r.y, toY: r.y + r.stairs.rise, dir: r.stairs.dir, material: r.stairMat ?? 'woodDark', riser: r.riserMat ?? 'woodDark' });
      } else if (r.style === 'flesh') {
        L.collider([q.x0, r.y - 0.3, q.z0], [q.x1, r.y, q.z1], { surface: 'flesh' });
        organicFloor(L, q, r);
      } else {
        L.box([q.x0, r.y - 0.3, q.z0], [q.x1, r.y, q.z1], r.floor);
      }
      if (!r.noCeil) {
        if (r.style === 'flesh') {
          organicCeiling(L, q, r);
          L.collider([q.x0, r.top + 0.6, q.z0], [q.x1, r.top + 0.9, q.z1], { walkable: false });
        } else if (r.vault) {
          vaultCeiling(L, q, r);
          L.collider([q.x0, r.top + r.vaultRise, q.z0], [q.x1, r.top + r.vaultRise + 0.3, q.z1], { walkable: false });
        } else {
          L.box([q.x0, r.top, q.z0], [q.x1, r.top + 0.3, q.z1], r.ceil, { walkable: false });
        }
      }
    }
  }

  // ---------- Door edges ----------
  const vDoor = new Map();
  const hDoor = new Map();
  const doorsOut = {};
  for (const d of spec.doors || []) {
    const [i, j] = d.at;
    const len = d.len ?? 1;
    d._edges = [];
    for (let k = 0; k < len; k++) {
      if (d.side === 'e' || d.side === 'w') {
        const line = d.side === 'e' ? i + 1 : i;
        vDoor.set(`${line},${j + k}`, d);
      } else {
        const line = d.side === 's' ? j + 1 : j;
        hDoor.set(`${line},${i + k}`, d);
      }
    }
  }

  // ---------- Walls ----------
  // Grid vertices where a wall run ends, per direction (to plug L-corners below).
  const vEnds = new Set();
  const hEnds = new Set();
  // Vertical lines x = X(line): left cell (line-1, j), right cell (line, j).
  for (let line = 0; line <= W; line++) {
    let run = null;
    const flush = () => {
      if (run) {
        emitWall(L, 'z', X(line), Z(run.a), Z(run.b), run.A, run.B, t);
        vEnds.add(`${line},${run.a}`);
        vEnds.add(`${line},${run.b}`);
      }
      run = null;
    };
    for (let j = 0; j <= H; j++) {
      const a = ch(line - 1, j);
      const b = ch(line, j);
      const isWall = j < H && a !== b && !(solidCh(a) && solidCh(b)) && !openSet.has(a + b) && !vDoor.has(`${line},${j}`);
      if (!isWall) {
        flush();
        continue;
      }
      if (run && run.ka === a && run.kb === b) run.b = j + 1;
      else {
        flush();
        run = { a: j, b: j + 1, ka: a, kb: b, A: room(a), B: room(b) };
      }
    }
  }
  // Horizontal lines z = Z(line): north cell (i, line-1), south cell (i, line).
  for (let line = 0; line <= H; line++) {
    let run = null;
    const flush = () => {
      if (run) {
        emitWall(L, 'x', Z(line), X(run.a), X(run.b), run.A, run.B, t);
        hEnds.add(`${run.a},${line}`);
        hEnds.add(`${run.b},${line}`);
      }
      run = null;
    };
    for (let i = 0; i <= W; i++) {
      const a = ch(i, line - 1);
      const b = ch(i, line);
      const isWall = i < W && a !== b && !(solidCh(a) && solidCh(b)) && !openSet.has(a + b) && !hDoor.has(`${line},${i}`);
      if (!isWall) {
        flush();
        continue;
      }
      if (run && run.ka === a && run.kb === b) run.b = i + 1;
      else {
        flush();
        run = { a: i, b: i + 1, ka: a, kb: b, A: room(a), B: room(b) };
      }
    }
  }

  // Where two walls meet at an L their colliders leave a diagonal notch; plug
  // each such corner with a small invisible post.
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of Object.values(R)) {
    lo = Math.min(lo, r.bottom - 0.3);
    hi = Math.max(hi, r.top + r.vaultRise + r.dome * 1.2);
  }
  const post = t / 2 + 0.02;
  for (const key of vEnds) {
    if (!hEnds.has(key)) continue;
    const [i, j] = key.split(',').map(Number);
    L.collider([X(i) - post, lo, Z(j) - post], [X(i) + post, hi, Z(j) + post], { walkable: false });
  }

  // ---------- Door openings ----------
  for (const d of spec.doors || []) {
    const [i, j] = d.at;
    const len = d.len ?? 1;
    let A;
    let B;
    let axis;
    let line;
    let a0;
    let a1;
    if (d.side === 'e' || d.side === 'w') {
      const l = d.side === 'e' ? i + 1 : i;
      A = room(ch(l - 1, j));
      B = room(ch(l, j));
      axis = 'z';
      line = X(l);
      a0 = Z(j);
      a1 = Z(j + len);
    } else {
      const l = d.side === 's' ? j + 1 : j;
      A = room(ch(i, l - 1));
      B = room(ch(i, l));
      axis = 'x';
      line = Z(l);
      a0 = X(i);
      a1 = X(i + len);
    }
    const floorY = Math.max(A ? A.y : -Infinity, B ? B.y : -Infinity);
    const minTop = Math.min(A ? A.top : Infinity, B ? B.top : Infinity);
    const doorH = Math.min(d.h ?? 2.2, minTop - floorY - 0.05);
    // Lintel above the opening.
    emitWall(L, axis, line, a0, a1, A, B, t, floorY + doorH);
    const style = (A || B).style;
    const frame = d.frame ?? (style === 'house' || style === 'brick' || style === 'stone');
    const fm = style === 'house' ? 'woodDark' : style === 'brick' ? 'stone' : 'stone';
    const fw = 0.09;
    const depth = t + 0.06;
    if (frame) {
      // Jambs and head trim.
      for (const s of [a0, a1 - fw]) {
        if (axis === 'x') L.box([s, floorY, line - depth / 2], [s + fw, floorY + doorH, line + depth / 2], fm, { walkable: false });
        else L.box([line - depth / 2, floorY, s], [line + depth / 2, floorY + doorH, s + fw], fm, { walkable: false });
      }
      if (axis === 'x') L.box([a0, floorY + doorH - 0.08, line - depth / 2], [a1, floorY + doorH, line + depth / 2], fm, { collide: false });
      else L.box([line - depth / 2, floorY + doorH - 0.08, a0], [line + depth / 2, floorY + doorH, a1], fm, { collide: false });
      // Threshold.
      if (axis === 'x') L.box([a0, floorY - 0.3, line - depth / 2], [a1, floorY + 0.01, line + depth / 2], fm, { walkable: true });
      else L.box([line - depth / 2, floorY - 0.3, a0], [line + depth / 2, floorY + 0.01, a1], fm, { walkable: true });
    } else {
      // Floor under the opening.
      const fmat = (A || B).floor;
      if (axis === 'x') L.box([a0, floorY - 0.3, line - t / 2], [a1, floorY, line + t / 2], fmat);
      else L.box([line - t / 2, floorY - 0.3, a0], [line + t / 2, floorY, a1], fmat);
    }
    if (d.leaf) {
      const inner = frame ? fw : 0;
      const cx = axis === 'x' ? (a0 + a1) / 2 : line;
      const cz = axis === 'x' ? line : (a0 + a1) / 2;
      const door = L.door({
        x: cx,
        z: cz,
        y: floorY,
        axis,
        width: a1 - a0 - inner * 2,
        height: doorH - (frame ? 0.08 : 0),
        material: d.material ?? 'woodDark',
        locked: d.locked,
        id: d.id,
        prompt: d.prompt,
        onOpen: d.onOpen,
        open: d.open,
        hinge: d.hinge ?? -1,
      });
      if (d.id) doorsOut[d.id] = door;
    }
  }

  return {
    W,
    H,
    cell,
    origin: [ox, oz],
    doors: doorsOut,
    rooms: R,
    at(i, j, dy = 0) {
      const r = room(ch(i, j));
      return new THREE.Vector3(X(i) + cell / 2, (r ? r.y : baseY) + dy, Z(j) + cell / 2);
    },
    x: (i) => X(i) + cell / 2,
    z: (j) => Z(j) + cell / 2,
    rect(c) {
      const list = rects[c] || [];
      const out = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, y: room(c)?.y ?? baseY };
      for (const q of list) {
        out.x0 = Math.min(out.x0, q.x0);
        out.z0 = Math.min(out.z0, q.z0);
        out.x1 = Math.max(out.x1, q.x1);
        out.z1 = Math.max(out.z1, q.z1);
      }
      return out;
    },
    rects,
  };
}

// One wall segment along `axis` ('x': the wall runs along x at z = line;
// 'z': runs along z at x = line) from a0 to a1, between room A (the -side)
// and room B (the +side). yMin set = lintel mode (only above yMin).
function emitWall(L, axis, line, a0, a1, A, B, t, yMin = null) {
  const bottom = Math.min(A ? A.bottom : Infinity, B ? B.bottom : Infinity) - 0.3;
  const colTop = Math.max(A ? A.top + A.vaultRise + A.dome * 1.2 : -Infinity, B ? B.top + B.vaultRise + B.dome * 1.2 : -Infinity);
  const y0 = yMin ?? bottom;
  const half = t / 2;
  for (const [r, side] of [
    [A, -1],
    [B, 1],
  ]) {
    if (!r) continue;
    const top = r.top + r.vaultRise;
    if (top <= y0) continue;
    const n0 = side < 0 ? line - half : line;
    const n1 = side < 0 ? line : line + half;
    if (r.style === 'flesh') {
      organicWall(L, axis, line, a0, a1, yMin ?? r.bottom - 0.05, r.top + 0.9, side, yMin != null);
      continue;
    }
    boxAlong(L, axis, a0, a1, n0, n1, y0, top, r.wall, r.y);
    if (yMin == null && r.style === 'house') {
      const face = side < 0 ? line - half : line + half;
      const d = side < 0 ? -1 : 1;
      if (r.trim !== false) boxAlong(L, axis, a0, a1, face, face + d * 0.025, r.y, r.y + 0.14, 'woodDark');
      if (r.wainscot) {
        boxAlong(L, axis, a0, a1, face, face + d * 0.015, r.y + 0.14, r.y + 1.0, 'wainscot');
        boxAlong(L, axis, a0, a1, face, face + d * 0.03, r.y + 0.98, r.y + 1.04, 'woodDark');
      }
    }
  }
  // One collider through the whole wall; extends into solid space so nothing tunnels.
  const c0 = A ? line - half : line - 0.6;
  const c1 = B ? line + half : line + 0.6;
  if (axis === 'x') L.collider([a0, y0, c0], [a1, colTop, c1], { walkable: false, surface: 'stone' });
  else L.collider([c0, y0, a0], [c1, colTop, a1], { walkable: false, surface: 'stone' });
}

function boxAlong(L, axis, a0, a1, n0, n1, y0, y1, mat, vOffset = 0) {
  const lo = Math.min(n0, n1);
  const hi = Math.max(n0, n1);
  if (axis === 'x') L.box([a0, y0, lo], [a1, y1, hi], mat, { collide: false, vOffset });
  else L.box([lo, y0, a0], [hi, y1, a1], mat, { collide: false, vOffset });
}

// ---------- Organic (flesh) surfaces ----------
const ORG = 0.33;

function organicWall(L, axis, line, a0, a1, y0, y1, faceDir, lintel) {
  const ext = lintel ? 0 : 0.35;
  const len = a1 - a0 + ext * 2;
  const hgt = y1 - y0;
  const g = new THREE.PlaneGeometry(len, hgt, Math.max(2, Math.ceil(len / ORG)), Math.max(2, Math.ceil(hgt / ORG)));
  const mid = (a0 + a1) / 2;
  // Plane faces +z; turn it to face into the room, then place it on the line.
  if (axis === 'x') {
    if (faceDir < 0) g.rotateY(Math.PI);
    g.translate(mid, (y0 + y1) / 2, line);
  } else {
    g.rotateY(faceDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(line, (y0 + y1) / 2, mid);
  }
  // Displace along the face normal with world-space noise (continuous across segments).
  const nx = axis === 'z' ? faceDir : 0;
  const nz = axis === 'x' ? faceDir : 0;
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k);
    const y = p.getY(k);
    const z = p.getZ(k);
    const u = axis === 'x' ? x : z;
    const n = fbm2(u * 0.55 + line * 0.31, y * 0.55, 4, 7);
    const n2 = fbm2(u * 2.1, y * 2.1 + line, 2, 11);
    let off = (n - 0.5) * 1.1 + (n2 - 0.5) * 0.12 - 0.05; // + = toward the room
    off = Math.max(-0.45, Math.min(0.1, off));
    // Curl the top toward the room so walls blend into the domed ceiling.
    const topT = Math.max(0, (y - (y1 - 1.1)) / 1.1);
    off += topT * topT * 0.5;
    p.setXYZ(k, x + nx * off, y - topT * topT * 0.25, z + nz * off);
  }
  g.computeVertexNormals();
  L.batcher.add(g, getMaterial('flesh'));
}

function organicFloor(L, q, r) {
  const w = q.x1 - q.x0;
  const d = q.z1 - q.z0;
  const g = new THREE.PlaneGeometry(w, d, Math.max(2, Math.ceil(w / ORG)), Math.max(2, Math.ceil(d / ORG)));
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const cx = (q.x0 + q.x1) / 2;
  const cz = (q.z0 + q.z1) / 2;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k) + cx;
    const z = p.getZ(k) + cz;
    const n = fbm2(x * 0.7, z * 0.7, 3, 3);
    p.setY(k, (n - 0.5) * 0.12 - 0.02);
  }
  g.translate(cx, r.y, cz);
  g.computeVertexNormals();
  L.batcher.add(g, getMaterial(r.floor));
}

function organicCeiling(L, q, r) {
  const w = q.x1 - q.x0 + 0.6;
  const d = q.z1 - q.z0 + 0.6;
  const g = new THREE.PlaneGeometry(w, d, Math.max(2, Math.ceil(w / ORG)), Math.max(2, Math.ceil(d / ORG)));
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  const cx = (q.x0 + q.x1) / 2;
  const cz = (q.z0 + q.z1) / 2;
  const span = Math.min(w, d);
  for (let k = 0; k < p.count; k++) {
    const lx = p.getX(k);
    const lz = p.getZ(k);
    const u = (lx / w) * 2;
    const v = (lz / d) * 2;
    const dome = (1 - u * u) * (1 - v * v) * Math.min(1.4, span * 0.25) * r.dome;
    const n = fbm2((lx + cx) * 0.5, (lz + cz) * 0.5, 4, 5);
    p.setY(k, dome + (n - 0.5) * 0.8 + 0.2);
  }
  g.translate(cx, r.top, cz);
  g.computeVertexNormals();
  L.batcher.add(g, getMaterial(r.ceil));
}

// Barrel vault along the rect's long axis.
function vaultCeiling(L, q, r) {
  const w = q.x1 - q.x0;
  const d = q.z1 - q.z0;
  const alongX = w >= d;
  const span = alongX ? d : w;
  const len = alongX ? w : d;
  const rise = Math.min(r.vaultRise, span * 0.5);
  const segs = 10;
  const pos = [];
  const idx = [];
  for (let k = 0; k <= segs; k++) {
    const a = Math.PI * (k / segs);
    const s = Math.cos(a) * (span / 2);
    const y = Math.sin(a) * rise;
    pos.push([s, y]);
  }
  const verts = [];
  for (let k = 0; k <= segs; k++) {
    for (const e of [-len / 2, len / 2]) verts.push(alongX ? [e, pos[k][1], pos[k][0]] : [pos[k][0], pos[k][1], e]);
  }
  for (let k = 0; k < segs; k++) {
    const a = k * 2;
    if (alongX) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts.flat(), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure normals face down into the room.
  const n = g.attributes.normal;
  let sum = 0;
  for (let k = 0; k < n.count; k++) sum += n.getY(k);
  if (sum > 0) {
    const ii = g.index.array;
    for (let k = 0; k < ii.length; k += 3) [ii[k + 1], ii[k + 2]] = [ii[k + 2], ii[k + 1]];
    g.computeVertexNormals();
  }
  g.translate((q.x0 + q.x1) / 2, r.top, (q.z0 + q.z1) / 2);
  L.batcher.add(g, getMaterial(r.ceil));
}
