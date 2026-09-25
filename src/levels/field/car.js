import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeRng } from '../../core/rng.js';
import { norm3, cross3 } from '../../world/trees.js';
import { Geo } from './kit.js';

// Your car at the end of the dirt track: a tired early-90s sedan in dark red,
// driver's door open, the lights left on and the battery going.
// Built in car space (front toward -z, driver's side -x, ground at y = 0):
// - the body is one lofted surface (nose, hood, fenders, doors, pillars, roof,
//   trunk) from a side profile and a cross-section with tumblehome; the wheel
//   arches, the door opening and the windows are cut out of it, with a liner
//   inside and rubber seals round the edges;
// - paint, dirt, rust and panel gaps are painted into a canvas laid along the
//   body (u = length, v = round the section);
// - trim, tyres, seats and plates share one atlas material; glass and lamps
//   have their own. Everything but the flickering headlamp is static-batched.

const LEN = 4.6;
const HALF = LEN / 2;
const WF = 0.93; // front axle, metres from the nose
const WR = 3.55; // rear axle
const WHEEL_R = 0.315;
const ARCH_R = 0.4;
const TRACK = 0.745; // wheel centre x
const S_COWL = 1.62;
const S_DECK = 3.98;
const KN = 16; // section points per side: 0 bottom centre .. 16 top centre
const K_SILL = 4;
const K_BELT = 10;
const K_RAIL = 12;
const K_ROOF = 14;
// Openings: range along the body (s, from the nose) and of section points.
const DOOR = [1.5, 2.56];
const WIN_F = [1.64, 2.53];
const WIN_R = [2.67, 3.25];
const SCREEN = [1.66, 2.3];
const BACKLITE = [3.42, 3.95];
const CUTS = [
  { side: -1, s: DOOR, k: [K_SILL, K_RAIL], door: true },
  { side: -1, s: WIN_R, k: [K_BELT, K_RAIL] },
  { side: 1, s: WIN_F, k: [K_BELT, K_RAIL] },
  { side: 1, s: WIN_R, k: [K_BELT, K_RAIL] },
  { side: 0, s: SCREEN, k: [K_ROOF, KN] },
  { side: 0, s: BACKLITE, k: [K_ROOF, KN] },
];
const OPEN = -1.0; // driver's door swing about its front hinge (rad)
const YAW = 0.25; // as parked (front toward the cabin)

const WHITE = [1, 1, 1];
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildCar(L, x, z, heightAt) {
  const M = carMaterials();
  const G = { paint: new Geo(), parts: new Geo(), glass: new Geo(), lamp: new Geo(), flick: new Geo() };
  const B = bodySurface();
  shell(G, B);
  liner(G, B);
  openings(G, B);
  bodyTrim(G, B);
  const door = driverDoor(G, B);
  ends(G);
  wheels(G);
  interior(G);

  // Sit it on the ground: parked yaw, pitch and roll from the four tyres.
  const c = Math.cos(YAW);
  const sn = Math.sin(YAW);
  const contact = (lx, lz) => {
    const wx = x + c * lx + sn * lz;
    const wz = z - sn * lx + c * lz;
    return new THREE.Vector3(wx, heightAt(wx, wz), wz);
  };
  const fl = contact(-TRACK, WF - HALF);
  const fr = contact(TRACK, WF - HALF);
  const rl = contact(-TRACK, WR - HALF);
  const rr = contact(TRACK, WR - HALF);
  const X = fr.clone().add(rr).sub(fl).sub(rl).normalize();
  const Zf = rl.clone().add(rr).sub(fl).sub(fr).normalize();
  const Y = new THREE.Vector3().crossVectors(Zf, X).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  const rot = new THREE.Matrix4().makeBasis(X, Y, Z);
  const centre = fl.clone().add(fr).add(rl).add(rr).multiplyScalar(0.25);
  const zc = (WF + WR) / 2 - HALF;
  centre.sub(new THREE.Vector3(0, 0, zc).applyMatrix4(rot));

  const group = new THREE.Group();
  group.quaternion.setFromRotationMatrix(rot);
  group.position.copy(centre);
  const add = (grp, geo, mat, cast) => {
    if (!geo.count) return;
    const m = new THREE.Mesh(geo.toGeometry(), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    grp.add(m);
  };
  add(group, G.paint, M.paint, true);
  add(group, G.parts, M.parts, true);
  add(group, G.glass, M.glass, false);
  add(group, G.lamp, M.lamp, false);
  group.updateMatrixWorld(true);
  const toWorld = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(group.matrixWorld);
  L.mesh(group, {
    static: true,
    collider: [
      { min: [-0.9, 0, -HALF - 0.08], max: [0.9, 0.98, -HALF + 1.4] },
      { min: [-0.9, 0, -HALF + 1.4], max: [0.9, 1.42, -HALF + 2.5] },
      { min: [-0.9, 0, -HALF + 2.5], max: [0.9, 1.42, -HALF + 3.5] },
      { min: [-0.9, 0, -HALF + 3.5], max: [0.9, 1.0, HALF + 0.08] },
    ],
  });
  // The open door: a few thin posts along it.
  for (const t of [0.3, 0.62, 0.94]) {
    const p = door.along(t);
    const w = toWorld(p[0], 0, p[2]);
    L.cylinder(w.x, w.z, 0.1, w.y, w.y + 1.3, null, { visible: false });
  }

  // The left headlamp stutters with the battery; its lens is its own mesh.
  const flick = new THREE.Group();
  flick.quaternion.copy(group.quaternion);
  flick.position.copy(group.position);
  add(flick, G.flick, M.flicker, false);
  L.mesh(flick, { cast: false });
  const head = L.light({ pos: toWorld(-0.5, 0.5, -HALF - 1.7), color: 0xffe0b0, intensity: 0.9, distance: 7, flicker: 0.45, kind: 'bulb' });
  head.onFlicker = (f) => {
    M.flicker.emissiveIntensity = 0.15 + 0.85 * f;
  };
  L.light({ pos: toWorld(0.5, 0.5, -HALF - 1.7), color: 0xffe0b0, intensity: 0.75, distance: 6.5, kind: 'bulb' });
  // Dome light: the door is open.
  L.light({ pos: toWorld(0, 1.2, 0.3), color: 0xffcf90, intensity: 0.45, distance: 2.8, kind: 'bulb' });

  groundShadow(L, group, heightAt);

  // Reflections fade with the light (the env map is a dusk sky).
  L.onUpdate((dt, t, g) => {
    const f = g.scene.fog.color;
    const k = Math.min(1, Math.max(0.04, (0.2126 * f.r + 0.7152 * f.g + 0.0722 * f.b) / 0.33));
    M.paint.envMapIntensity = 0.85 * k;
    M.parts.envMapIntensity = 0.6 * k;
    M.glass.envMapIntensity = 1.6 * k;
  });
}

// ---------- The body surface ----------
function bottomY(s) {
  let y = 0.26;
  for (const w of [WF, WR]) {
    const d = (s - w) / ARCH_R;
    if (Math.abs(d) < 1) y = Math.max(y, 0.26 + 0.46 * Math.sqrt(1 - d * d));
  }
  return y;
}

// Height of the shoulder: fender line and hood, beltline, trunk deck.
function beltY(s) {
  if (s < S_COWL) {
    const t = s / S_COWL;
    return 0.715 + 0.215 * (1 - (1 - t) * (1 - t));
  }
  if (s < S_DECK) return 0.93 + (0.05 * (s - S_COWL)) / (S_DECK - S_COWL);
  return 0.98 + 0.012 * Math.sin(Math.PI * Math.min(1, (s - S_DECK) / 0.5)) - 0.07 * sstep(4.4, LEN, s);
}

// Side profile of the cabin: windscreen, roof, rear window (Catmull-Rom).
const ROOF = [[S_COWL, 0.93], [1.95, 1.13], [2.22, 1.3], [2.42, 1.362], [2.8, 1.385], [3.15, 1.372], [3.36, 1.33], [3.68, 1.15], [S_DECK, 0.98]];
function topY(s) {
  if (s <= S_COWL || s >= S_DECK) return beltY(s);
  let i = 0;
  while (i < ROOF.length - 2 && s > ROOF[i + 1][0]) i++;
  const p0 = ROOF[Math.max(0, i - 1)][1];
  const p1 = ROOF[i][1];
  const p2 = ROOF[i + 1][1];
  const p3 = ROOF[Math.min(ROOF.length - 1, i + 2)][1];
  const t = (s - ROOF[i][0]) / (ROOF[i + 1][0] - ROOF[i][0]);
  const y = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  return Math.max(beltY(s), y);
}

// Half width in plan, corners rounded at the nose and tail.
function halfW(s) {
  const W = 0.865;
  const rf = 0.24;
  const rr = 0.2;
  if (s < rf) return W - rf + Math.sqrt(Math.max(0, rf * rf - (rf - s) ** 2));
  if (s > LEN - rr) {
    const d = s - (LEN - rr);
    return W - rr + Math.sqrt(Math.max(0, rr * rr - d * d));
  }
  return W;
}

// Right half of the cross-section at s: KN + 1 points [x, y] from the bottom
// centre, round the sill, up the side with a shoulder line, over the belt
// ledge, up the side glass (leaning in) and across the crowned roof.
function section(s, out = []) {
  const yb = bottomY(s);
  const ys = beltY(s);
  const yt = topY(s);
  const hw = halfW(s);
  const g = Math.max(0, yt - ys);
  const gb = hw - 0.085;
  const gt = gb - g * 0.33;
  const w = sstep(0, 0.1, g);
  const cr = 0.04;
  out[0] = [0, yb];
  out[1] = [hw * 0.6, yb];
  out[2] = [hw - 0.07, yb + 0.004];
  out[3] = [hw - 0.025, yb + 0.03];
  out[4] = [hw - 0.004, yb + 0.085];
  out[5] = [hw + 0.008, lerp(yb, ys, 0.4)];
  out[6] = [hw + 0.012, lerp(yb, ys, 0.63)];
  out[7] = [hw + 0.002, ys - 0.07];
  out[8] = [hw - 0.028, ys - 0.018];
  out[9] = [hw - 0.075, ys];
  out[10] = [gb, ys + Math.min(g, 0.012)];
  out[11] = [lerp(gb, gt, 0.5) + 0.006 * w - 0.008 * (1 - w), ys + g * 0.5];
  out[12] = [gt - 0.016, ys + Math.max(0, g - 0.075)];
  out[13] = [gt - 0.045, ys + Math.max(0, g - 0.018)];
  out[14] = [gt - 0.115, yt + cr * 0.3];
  out[15] = [(gt - 0.115) * 0.5, yt + cr * 0.85];
  out[16] = [0, yt + cr];
  return out;
}

// Stations along the body: denser round the nose and tail, the arches and the
// glass, and exactly on every opening's edges.
function stationList() {
  const out = [];
  const add = (v) => out.push(Math.round(Math.min(LEN, Math.max(0, v)) * 10000) / 10000);
  for (let s = 0; s <= LEN + 1e-6; s += 0.15) add(s);
  for (const v of [0.006, 0.02, 0.04, 0.07, 0.11, 0.16]) {
    add(v);
    add(LEN - v);
  }
  for (const w of [WF, WR]) for (let j = -5; j <= 5; j++) add(w + ARCH_R * Math.sin((j / 5) * (Math.PI / 2)));
  for (let s = S_COWL; s <= 2.5; s += 0.068) add(s);
  for (let s = 3.3; s <= S_DECK; s += 0.068) add(s);
  const keep = new Set([S_COWL, S_DECK, 0, LEN]);
  for (const c of CUTS) for (const v of c.s) keep.add(v);
  for (const v of keep) add(v);
  out.sort((a, b) => a - b);
  const res = [];
  for (const s of out) {
    const last = res[res.length - 1];
    if (last !== undefined && s - last < 0.012) {
      if (keep.has(s)) res[res.length - 1] = s;
      continue;
    }
    res.push(s);
  }
  return res;
}

function bodySurface() {
  const S = stationList();
  const n = S.length;
  const P = [];
  for (let i = 0; i < n; i++) P.push(section(S[i]).map(([x, y]) => [x, y, S[i] - HALF]));
  const N = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let k = 0; k <= KN; k++) {
      const a = P[i][Math.min(KN, k + 1)];
      const b = P[i][Math.max(0, k - 1)];
      const c = P[Math.min(n - 1, i + 1)][k];
      const d = P[Math.max(0, i - 1)][k];
      const q = norm3(cross3([a[0] - b[0], a[1] - b[1], a[2] - b[2]], [c[0] - d[0], c[1] - d[1], c[2] - d[2]]));
      if (k === 0 || k === KN) {
        q[0] = 0;
        norm3(q);
      }
      row.push(q);
    }
    N.push(row);
  }
  // Point and normal on a side (mirrored for side -1), pushed in by `inset`.
  const at = (i, k, side, inset = 0) => {
    const p = P[i][k];
    const q = N[i][k];
    return [(p[0] - q[0] * inset) * side, p[1] - q[1] * inset, p[2] - q[2] * inset];
  };
  const nrm = (i, k, side) => [N[i][k][0] * side, N[i][k][1], N[i][k][2]];
  const range = (s) => {
    const I = [];
    for (let i = 0; i < n; i++) if (S[i] >= s[0] - 1e-4 && S[i] <= s[1] + 1e-4) I.push(i);
    return I;
  };
  const near = (s) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(S[i] - s) < Math.abs(S[best] - s)) best = i;
    return best;
  };
  return { S, n, P, N, at, nrm, range, near };
}

// v of section point k on a side: the right side fills the top half of the paint canvas.
const vOf = (k, side) => (side > 0 ? 0.5 + (0.5 * k) / KN : 0.5 - (0.5 * k) / KN);

function isCut(side, s0, s1, k) {
  for (const c of CUTS) {
    if (c.side !== 0 && c.side !== side) continue;
    if (s0 >= c.s[0] - 1e-4 && s1 <= c.s[1] + 1e-4 && k >= c.k[0] && k + 1 <= c.k[1]) return true;
  }
  return false;
}

function shell(G, B) {
  const { S, n, P, N } = B;
  const g = G.paint;
  for (const side of [1, -1]) {
    const base = g.count;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k <= KN; k++) {
        const p = P[i][k];
        const q = N[i][k];
        g.vert(p[0] * side, p[1], p[2], q[0] * side, q[1], q[2], S[i] / LEN, vOf(k, side), WHITE);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < KN; k++) {
        if (isCut(side, S[i], S[i + 1], k)) continue;
        const a = base + i * (KN + 1) + k;
        if (side > 0) g.quad(a, a + 1, a + KN + 2, a + KN + 1);
        else g.quad(a, a + KN + 1, a + KN + 2, a + 1);
      }
    }
  }
  // Flat nose and tail panels.
  for (const [i, dir] of [[0, -1], [n - 1, 1]]) {
    const ring = [];
    for (let k = 0; k <= KN; k++) ring.push([P[i][k][0], P[i][k][1], k, 1]);
    for (let k = KN - 1; k >= 1; k--) ring.push([-P[i][k][0], P[i][k][1], k, -1]);
    const zc = P[i][0][2];
    const u = Math.min(0.998, Math.max(0.002, S[i] / LEN));
    const c0 = g.vert(0, (P[i][0][1] + P[i][KN][1]) / 2, zc, 0, 0, dir, u, vOf(5, 1), WHITE);
    const first = g.count;
    for (const [rx, ry, k, sd] of ring) g.vert(rx, ry, zc, 0, 0, dir, u, vOf(k, sd), WHITE);
    const m = ring.length;
    for (let j = 0; j < m; j++) {
      const a = first + j;
      const b = first + ((j + 1) % m);
      if (dir > 0) g.tri(c0, a, b);
      else g.tri(c0, b, a);
    }
  }
}

// The same surface 2.5 cm in, facing the cabin (headliner, pillars, door cards).
function liner(G, B) {
  const { S, n } = B;
  const g = G.parts;
  const edges = new Set(CUTS.flatMap((c) => c.s));
  const I = [];
  for (let i = 0; i < n; i++) if (S[i] >= 1.45 && S[i] <= 4.0 && (edges.has(S[i]) || i % 2 === 0)) I.push(i);
  const [u, v] = cellUV(SW.liner);
  const nk = KN - K_SILL + 1;
  for (const side of [1, -1]) {
    const base = g.count;
    for (const i of I) {
      for (let k = K_SILL; k <= KN; k++) {
        const p = B.at(i, k, side, 0.025);
        const q = B.nrm(i, k, side);
        g.vert(p[0], p[1], p[2], -q[0], -q[1], -q[2], u, v, WHITE);
      }
    }
    for (let j = 0; j < I.length - 1; j++) {
      for (let k = K_SILL; k < KN; k++) {
        if (isCut(side, S[I[j]], S[I[j + 1]], k)) continue;
        const a = base + j * nk + (k - K_SILL);
        if (side > 0) g.quad(a, a + nk, a + nk + 1, a + 1);
        else g.quad(a, a + 1, a + nk + 1, a + nk);
      }
    }
  }
}

// Glass for a window region: the body surface over it, set in a little.
function glassPatch(g, B, side, sr, kr, inset) {
  const I = B.range(sr);
  const nk = kr[1] - kr[0] + 1;
  const base = g.count;
  for (const i of I) {
    for (let k = kr[0]; k <= kr[1]; k++) {
      const p = B.at(i, k, side, inset);
      const q = B.nrm(i, k, side);
      g.vert(p[0], p[1], p[2], q[0], q[1], q[2], 0, 0, WHITE);
    }
  }
  for (let j = 0; j < I.length - 1; j++) {
    for (let k = 0; k < nk - 1; k++) {
      const a = base + j * nk + k;
      if (side > 0) g.quad(a, a + 1, a + nk + 1, a + nk);
      else g.quad(a, a + nk, a + nk + 1, a + 1);
    }
  }
}

// Closed loop round a region's edge (both halves when it spans the centre line).
function loopPts(B, cut, side, inset) {
  const I = B.range(cut.s);
  const [k0, k1] = cut.k;
  const pts = [];
  const i0 = I[0];
  const i1 = I[I.length - 1];
  if (cut.side === 0) {
    for (const i of I) pts.push(B.at(i, k0, 1, inset));
    for (let k = k0 + 1; k <= KN; k++) pts.push(B.at(i1, k, 1, inset));
    for (let k = KN - 1; k >= k0; k--) pts.push(B.at(i1, k, -1, inset));
    for (let j = I.length - 2; j >= 0; j--) pts.push(B.at(I[j], k0, -1, inset));
    for (let k = k0 + 1; k <= KN; k++) pts.push(B.at(i0, k, -1, inset));
    for (let k = KN - 1; k >= k0; k--) pts.push(B.at(i0, k, 1, inset));
    return pts;
  }
  for (const i of I) pts.push(B.at(i, k0, side, inset));
  for (let k = k0 + 1; k <= k1; k++) pts.push(B.at(i1, k, side, inset));
  for (let j = I.length - 2; j >= 0; j--) pts.push(B.at(I[j], k1, side, inset));
  for (let k = k1 - 1; k >= k0; k--) pts.push(B.at(i0, k, side, inset));
  return pts;
}

function openings(G, B) {
  for (const cut of CUTS) {
    const sides = cut.side === 0 ? [1, -1] : [cut.side];
    for (const side of sides) if (!cut.door) glassPatch(G.glass, B, side, cut.s, cut.k, 0.012);
    const seal = cut.side === 0 ? [loopPts(B, cut, 1, 0.012)] : [loopPts(B, cut, cut.side, 0.012)];
    for (const pts of seal) tube(G.parts, pts, cut.door ? 0.02 : 0.013, 3, SW.rubber);
  }
}

// ---------- Small geometry helpers ----------
const SW = { rubber: 0, plastic: 1, bumper: 2, chrome: 3, hubcap: 4, steel: 5, rust: 6, fabric: 7, liner: 8, dash: 9, carpet: 10, doorcard: 11 };
function cellUV(c) {
  return [((c % 4) + 0.5) / 4, 1 - ((c >> 2) + 0.5) / 4];
}
// Point every vertex added since `start` at one atlas swatch.
function swatch(g, start, cell) {
  const [u, v] = cellUV(cell);
  for (let i = start; i < g.count; i++) {
    g.t[i * 2] = u;
    g.t[i * 2 + 1] = v;
  }
}
function tube(g, pts, r, seg, cell) {
  const s0 = g.count;
  g.tube(pts, pts.map(() => r), seg, WHITE);
  swatch(g, s0, cell);
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function mat(x, y, z, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  return _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e), new THREE.Vector3(1, 1, 1));
}
function rbox(g, cell, w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) {
  const s0 = g.count;
  const geo = new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
  g.geometry(geo, mat(x, y, z, rx, ry, rz), WHITE);
  geo.dispose();
  swatch(g, s0, cell);
}
function box(g, cell, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const s0 = g.count;
  g.box(x, y, z, w, h, d, WHITE, rx, ry, rz);
  swatch(g, s0, cell);
}
function cyl(g, cell, r0, r1, h, seg, m) {
  const s0 = g.count;
  const geo = new THREE.CylinderGeometry(r0, r1, h, seg);
  g.geometry(geo, m, WHITE);
  geo.dispose();
  swatch(g, s0, cell);
}
// Flat quad with an explicit uv rect [u0, v0, u1, v1] (for lamps and plates).
function quadUV(g, p0, p1, p2, p3, uv) {
  g.quadP(p0, p1, p2, p3, WHITE, uv);
}

// Quad grid over vertices base + i * nv + j; winding picked from the first cell.
function grid(g, base, nu, nv) {
  const P = (i, j) => {
    const k = (base + i * nv + j) * 3;
    return [g.p[k], g.p[k + 1], g.p[k + 2]];
  };
  const mi = (nu - 1) >> 1;
  const mj = (nv - 1) >> 1;
  const a = P(mi, mj);
  const b = P(mi + 1, mj);
  const c = P(mi, mj + 1);
  const fn = cross3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
  const k0 = (base + mi * nv + mj) * 3;
  const flip = fn[0] * g.n[k0] + fn[1] * g.n[k0 + 1] + fn[2] * g.n[k0 + 2] < 0;
  for (let i = 0; i < nu - 1; i++) {
    for (let j = 0; j < nv - 1; j++) {
      const v00 = base + i * nv + j;
      if (!flip) g.quad(v00, v00 + nv, v00 + nv + 1, v00 + 1);
      else g.quad(v00, v00 + 1, v00 + nv + 1, v00 + nv);
    }
  }
}

// Surface height of the hood / windscreen / roof at (s, x).
function topAt(s, x) {
  const sec = section(s);
  const ax = Math.abs(x);
  for (let k = KN; k > 9; k--) {
    const a = sec[k];
    const b = sec[k - 1];
    if (ax >= a[0] && ax <= b[0]) return lerp(a[1], b[1], (ax - a[0]) / (b[0] - a[0] || 1));
  }
  return sec[9][1];
}

// ---------- Trim on the body ----------
function bodyTrim(G, B) {
  const P = G.parts;
  // Black rubbing strips along the doors (the driver's front one is on the door).
  for (const [side, s0, s1] of [[1, 1.53, 2.53], [1, 2.68, 3.2], [-1, 2.68, 3.2]]) {
    const I = B.range([s0, s1]);
    for (let j = 0; j < I.length - 1; j++) {
      const a = B.at(I[j], 6, side, -0.006);
      const b = B.at(I[j + 1], 6, side, -0.006);
      const s = P.count;
      P.beam(a, b, 0.034, 0.014, [0, 1, 0], WHITE);
      swatch(P, s, SW.plastic);
    }
  }
  // Door handles.
  for (const [side, s] of [[1, 2.4], [1, 3.08], [-1, 3.08]]) handle(P, B, side, s);
  // Right door mirror.
  mirror(G, B, 1);
  // Wiper arms and blades parked along the bottom of the windscreen.
  for (const [x0, x1, px] of [[-0.6, -0.06, -0.42], [-0.02, 0.5, 0.14]]) {
    const s = 1.72;
    const y0 = topAt(s, x0) + 0.014;
    const y1 = topAt(s, x1) + 0.014;
    const bs = P.count;
    P.beam([x0, y0, s - HALF], [x1, y1, s - HALF], 0.022, 0.012, [0, 1, 0], WHITE);
    P.beam([px, topAt(1.61, px) + 0.02, 1.61 - HALF], [(x0 + x1) / 2, (y0 + y1) / 2 + 0.012, s - HALF], 0.016, 0.012, [0, 1, 0], WHITE);
    cyl(P, SW.plastic, 0.018, 0.022, 0.03, 8, mat(px, topAt(1.61, px) + 0.012, 1.61 - HALF));
    swatch(P, bs, SW.plastic);
  }
  // Antenna on the right front fender.
  const as = 1.24;
  const ay = beltY(as);
  cyl(P, SW.plastic, 0.012, 0.016, 0.03, 8, mat(0.74, ay + 0.01, as - HALF));
  tube(P, [[0.74, ay + 0.02, as - HALF], [0.735, ay + 0.4, as - HALF + 0.05], [0.728, ay + 0.78, as - HALF + 0.11]], 0.0035, 4, SW.chrome);
  // Inside the wheel arches: black liners so you can't see under the car.
  for (const w of [WF, WR]) {
    for (const side of [1, -1]) {
      const base = P.count;
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.PI;
        const cz = Math.cos(th);
        const sy = Math.sin(th);
        for (const xx of [0.53, halfW(w) - 0.012]) P.vert(xx * side, 0.26 + 0.448 * sy, w - HALF + 0.39 * cz, 0, -sy, -cz, 0, 0, WHITE);
      }
      grid(P, base, n + 1, 2);
      // Inner wall of the well.
      const wb = P.count;
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.PI;
        P.vert(0.53 * side, 0.26 + 0.448 * Math.sin(th), w - HALF + 0.39 * Math.cos(th), side, 0, 0, 0, 0, WHITE);
        P.vert(0.53 * side, 0.26, w - HALF + 0.39 * Math.cos(th), side, 0, 0, 0, 0, WHITE);
      }
      grid(P, wb, n + 1, 2);
      swatch(P, base, SW.rubber);
    }
  }
  // Exhaust under the back.
  tube(P, [[-0.48, 0.24, HALF - 0.6], [-0.48, 0.22, HALF - 0.1], [-0.48, 0.215, HALF + 0.03]], 0.026, 8, SW.rust);
  cyl(P, SW.rubber, 0.02, 0.02, 0.004, 8, mat(-0.48, 0.215, HALF + 0.032, Math.PI / 2));
}

function handle(g, B, side, s) {
  const i = B.near(s);
  const p = B.at(i, 8, side, -0.012);
  const q = B.nrm(i, 8, side);
  const y = p[1] - 0.025;
  box(g, SW.plastic, 0.028, 0.03, 0.13, p[0] + q[0] * 0.004, y, p[2]);
  box(g, SW.rubber, 0.01, 0.04, 0.16, p[0] - q[0] * 0.008, y, p[2]);
}

// Door mirror at the front corner of a front door window.
function mirror(G, B, side) {
  const i = B.near(1.7);
  const p = B.at(i, K_BELT, side, 0);
  const x = p[0] + side * 0.12;
  const y = p[1] + 0.07;
  const z = p[2] + 0.02;
  rbox(G.parts, SW.plastic, 0.21, 0.12, 0.08, 0.03, x, y, z, 0, side * 0.12, 0);
  box(G.parts, SW.plastic, 0.1, 0.045, 0.05, p[0] + side * 0.03, p[1] + 0.035, p[2] + 0.01, 0, 0, side * 0.3);
  const gz = z + 0.041;
  quadUV(G.glass, [x - side * 0.09, y - 0.048, gz], [x + side * 0.085, y - 0.048, gz + side * 0.02], [x + side * 0.085, y + 0.048, gz + side * 0.02], [x - side * 0.09, y + 0.048, gz], [0, 0, 1, 1]);
  fixFacing(G.glass, [0, 0, 1]);
}

// Make the last quad face `dir` (flip its winding and normals if not).
function fixFacing(g, dir) {
  const n = g.count;
  const k = (n - 4) * 3;
  if (g.n[k] * dir[0] + g.n[k + 1] * dir[1] + g.n[k + 2] * dir[2] >= 0) return;
  for (let v = n - 4; v < n; v++) for (let c = 0; c < 3; c++) g.n[v * 3 + c] *= -1;
  const i = g.i.length - 6;
  const t = g.i.slice(i);
  g.i.splice(i, 6, t[0], t[2], t[1], t[3], t[5], t[4]);
}

// ---------- The driver's door, swung open ----------
function driverDoor(G, B) {
  const side = -1;
  const I = B.range(DOOR);
  const T = 0.07;
  const nk = K_BELT - K_SILL + 1;
  const start = { paint: G.paint.count, parts: G.parts.count, glass: G.glass.count };
  // Outer skin (same texture as the body so the paint carries on).
  const g = G.paint;
  const base = g.count;
  for (const i of I) {
    for (let k = K_SILL; k <= K_BELT; k++) {
      const p = B.at(i, k, side);
      const q = B.nrm(i, k, side);
      g.vert(p[0], p[1], p[2], q[0], q[1], q[2], B.S[i] / LEN, vOf(k, side), WHITE);
    }
  }
  for (let j = 0; j < I.length - 1; j++) {
    for (let k = 0; k < nk - 1; k++) {
      const a = base + j * nk + k;
      g.quad(a, a + nk, a + nk + 1, a + 1);
    }
  }
  // Door card inside.
  const P = G.parts;
  const cb = P.count;
  for (const i of I) {
    for (let k = K_SILL; k <= K_BELT; k++) {
      const p = B.at(i, k, side, T);
      const q = B.nrm(i, k, side);
      P.vert(p[0], p[1], p[2], -q[0], -q[1], -q[2], 0, 0, WHITE);
    }
  }
  for (let j = 0; j < I.length - 1; j++) {
    for (let k = 0; k < nk - 1; k++) {
      const a = cb + j * nk + k;
      P.quad(a, a + 1, a + nk + 1, a + nk);
    }
  }
  swatch(P, cb, SW.doorcard);
  // Edges: painted shut faces, a rubber sill along the top.
  const ring = [];
  for (const i of I) ring.push([i, K_SILL]);
  for (let k = K_SILL + 1; k <= K_BELT; k++) ring.push([I[I.length - 1], k]);
  for (let j = I.length - 2; j >= 0; j--) ring.push([I[j], K_BELT]);
  for (let k = K_BELT - 1; k > K_SILL; k--) ring.push([I[0], k]);
  const mid = B.at(I[I.length >> 1], 7, side, T / 2);
  for (let r = 0; r < ring.length; r++) {
    const [ia, ka] = ring[r];
    const [ib, kb] = ring[(r + 1) % ring.length];
    const top = ka === K_BELT && kb === K_BELT;
    const gg = top ? P : g;
    const o0 = B.at(ia, ka, side);
    const o1 = B.at(ib, kb, side);
    const i1 = B.at(ib, kb, side, T);
    const i0 = B.at(ia, ka, side, T);
    const e = [o1[0] - o0[0], o1[1] - o0[1], o1[2] - o0[2]];
    const t = [i0[0] - o0[0], i0[1] - o0[1], i0[2] - o0[2]];
    let nn = norm3(cross3(e, t));
    const c = [(o0[0] + o1[0]) / 2 - mid[0], (o0[1] + o1[1]) / 2 - mid[1], (o0[2] + o1[2]) / 2 - mid[2]];
    const flip = nn[0] * c[0] + nn[1] * c[1] + nn[2] * c[2] < 0;
    if (flip) nn = [-nn[0], -nn[1], -nn[2]];
    const u = B.S[ia] / LEN;
    const v = vOf(6, side);
    const s0 = gg.count;
    gg.vert(o0[0], o0[1], o0[2], nn[0], nn[1], nn[2], u, v, WHITE);
    gg.vert(o1[0], o1[1], o1[2], nn[0], nn[1], nn[2], u, v, WHITE);
    gg.vert(i1[0], i1[1], i1[2], nn[0], nn[1], nn[2], u, v, WHITE);
    gg.vert(i0[0], i0[1], i0[2], nn[0], nn[1], nn[2], u, v, WHITE);
    if (flip) gg.quad(s0, s0 + 3, s0 + 2, s0 + 1);
    else gg.quad(s0, s0 + 1, s0 + 2, s0 + 3);
    if (top) swatch(gg, s0, SW.rubber);
  }
  // Window: glass in a black sash.
  const win = { s: WIN_F, k: [K_BELT, K_RAIL], side };
  glassPatch(G.glass, B, side, WIN_F, win.k, 0.03);
  tube(P, loopPts(B, win, side, 0.03), 0.02, 3, SW.rubber);
  // Rubbing strip, handle, mirror.
  const strip = B.range([1.53, 2.53]);
  for (let j = 0; j < strip.length - 1; j++) {
    const s0 = P.count;
    P.beam(B.at(strip[j], 6, side, -0.006), B.at(strip[j + 1], 6, side, -0.006), 0.034, 0.014, [0, 1, 0], WHITE);
    swatch(P, s0, SW.plastic);
  }
  handle(P, B, side, 2.4);
  mirror(G, B, side);
  // Inside: armrest, pull handle, window crank.
  const ia = B.near(2.1);
  const pa = B.at(ia, 7, side, T + 0.03);
  rbox(P, SW.dash, 0.06, 0.05, 0.34, 0.015, pa[0], pa[1] + 0.02, pa[2]);
  const pc = B.at(B.near(2.35), 6, side, T + 0.02);
  cyl(P, SW.chrome, 0.018, 0.018, 0.03, 8, mat(pc[0], pc[1], pc[2], 0, 0, Math.PI / 2));
  box(P, SW.chrome, 0.012, 0.012, 0.07, pc[0] + 0.02, pc[1] + 0.03, pc[2] + 0.02, 0.6, 0, 0);
  const ph = B.at(B.near(1.72), 8, side, T + 0.012);
  box(P, SW.chrome, 0.02, 0.025, 0.1, ph[0], ph[1], ph[2]);

  // Swing everything added since `start` about the hinge (front edge of the door).
  const h = B.at(I[0], 6, side);
  const hinge = new THREE.Matrix4().makeTranslation(h[0], 0, h[2]).multiply(new THREE.Matrix4().makeRotationY(OPEN)).multiply(new THREE.Matrix4().makeTranslation(-h[0], 0, -h[2]));
  G.paint.transform(hinge, start.paint);
  G.parts.transform(hinge, start.parts);
  G.glass.transform(hinge, start.glass);
  const len = B.S[I[I.length - 1]] - B.S[I[0]];
  return {
    // Point t of the way along the open door (car space, outer face).
    along: (t) => {
      const v = new THREE.Vector3(h[0], 0, h[2] + len * t).applyMatrix4(hinge);
      return [v.x, 0, v.z];
    },
  };
}

// ---------- Nose and tail: bumpers, grille, lamps, plates ----------
// Path round one end of the car in plan: [x, z, nx, nz, taper] from the left side to the right.
function endPath(front) {
  const W = 0.865;
  const r = front ? 0.24 : 0.2;
  const dir = front ? -1 : 1;
  const cz = dir * HALF - dir * r;
  const path = [];
  const back = front ? 0.18 : 0.3;
  path.push([-W, cz - dir * back, -1, 0, 0], [-W, cz - dir * back * 0.55, -1, 0, 0.7], [-W, cz - dir * back * 0.2, -1, 0, 1]);
  for (let j = 0; j <= 6; j++) {
    const f = (j / 6) * (Math.PI / 2);
    path.push([-(W - r) - Math.cos(f) * r, cz + dir * Math.sin(f) * r, -Math.cos(f), dir * Math.sin(f), 1]);
  }
  for (const xx of [-(W - r) * 0.5, 0, (W - r) * 0.5]) path.push([xx, cz + dir * r, 0, dir, 1]);
  for (let j = 6; j >= 0; j--) {
    const f = (j / 6) * (Math.PI / 2);
    path.push([W - r + Math.cos(f) * r, cz + dir * Math.sin(f) * r, Math.cos(f), dir * Math.sin(f), 1]);
  }
  path.push([W, cz - dir * back * 0.2, 1, 0, 1], [W, cz - dir * back * 0.55, 1, 0, 0.7], [W, cz - dir * back, 1, 0, 0]);
  return path;
}

// Sweep a profile ([out, y], out = metres proud of the body outline) along an end path.
function sweep(g, path, prof, cell) {
  const base = g.count;
  for (const [px, pz, nx, nz, tp] of path) {
    for (let j = 0; j < prof.length; j++) {
      const a = prof[Math.max(0, j - 1)];
      const b = prof[Math.min(prof.length - 1, j + 1)];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      const o = prof[j][0] * tp;
      g.vert(px + nx * o, prof[j][1], pz + nz * o, nx * ty, -tx, nz * ty, 0, 0, WHITE);
    }
  }
  grid(g, base, path.length, prof.length);
  swatch(g, base, cell);
}

function ends(G) {
  const P = G.parts;
  // Bumpers: grey plastic wrapping the corners, a black rubbing strip.
  const front = endPath(true);
  const rear = endPath(false);
  sweep(P, front, [[-0.03, 0.27], [0.03, 0.272], [0.058, 0.295], [0.07, 0.34], [0.072, 0.42], [0.066, 0.475], [0.04, 0.5], [-0.03, 0.505]], SW.bumper);
  sweep(P, front, [[0.06, 0.385], [0.084, 0.39], [0.086, 0.415], [0.06, 0.42]], SW.rubber);
  sweep(P, rear, [[-0.03, 0.28], [0.03, 0.282], [0.058, 0.305], [0.07, 0.35], [0.072, 0.44], [0.066, 0.495], [0.04, 0.52], [-0.03, 0.525]], SW.bumper);
  sweep(P, rear, [[0.06, 0.405], [0.084, 0.41], [0.086, 0.435], [0.06, 0.44]], SW.rubber);
  // Grille: a dark recess, chrome surround and slats, a badge.
  const zf = -HALF;
  quadUV(P, [0.34, 0.54, zf - 0.003], [-0.34, 0.54, zf - 0.003], [-0.34, 0.665, zf - 0.003], [0.34, 0.665, zf - 0.003], [0, 0, 0, 0]);
  fixFacing(P, [0, 0, -1]);
  swatch(P, P.count - 4, SW.rubber);
  for (const y of [0.572, 0.602, 0.632]) box(P, SW.chrome, 0.66, 0.009, 0.012, 0, y, zf - 0.01);
  for (const y of [0.54, 0.665]) box(P, SW.chrome, 0.7, 0.012, 0.016, 0, y, zf - 0.01);
  for (const xx of [-0.345, 0.345]) box(P, SW.chrome, 0.012, 0.137, 0.016, xx, 0.6025, zf - 0.01);
  cyl(P, SW.chrome, 0.032, 0.032, 0.014, 14, mat(0, 0.603, zf - 0.022, Math.PI / 2));
  // Headlamps: bezel and lens; the left one flickers (own mesh).
  for (const sd of [-1, 1]) {
    box(P, SW.rubber, 0.262, 0.13, 0.016, sd * 0.49, 0.605, zf - 0.008);
    const g = sd < 0 ? G.flick : G.lamp;
    const x0 = sd * 0.365;
    const x1 = sd * 0.615;
    const zz = zf - 0.0175;
    quadUV(g, [x0, 0.548, zz], [x1, 0.548, zz], [x1, 0.662, zz], [x0, 0.662, zz], sd < 0 ? [0.49, 0.51, 0.01, 0.99] : [0.01, 0.51, 0.49, 0.99]);
    fixFacing(g, [0, 0, -1]);
    // Amber corner lamps round the front corners.
    cornerStrip(G.lamp, true, sd, 0.55, 1.5, 0.552, 0.655, [0.01, 0.01, 0.49, 0.49]);
    // Tail lamps: flat part and round the corner.
    const zr = HALF + 0.004;
    quadUV(G.lamp, [sd * 0.3, 0.72, zr], [sd * 0.64, 0.72, zr], [sd * 0.64, 0.86, zr], [sd * 0.3, 0.86, zr], [0.51, 0.51, 0.99, 0.99]);
    fixFacing(G.lamp, [0, 0, 1]);
    cornerStrip(G.lamp, false, sd, 0.6, 1.53, 0.72, 0.86, [0.51, 0.51, 0.99, 0.99]);
  }
  // Red reflector panel between the tail lamps.
  quadUV(G.lamp, [-0.3, 0.73, HALF + 0.004], [0.3, 0.73, HALF + 0.004], [0.3, 0.85, HALF + 0.004], [-0.3, 0.85, HALF + 0.004], [0.51, 0.01, 0.99, 0.49]);
  fixFacing(G.lamp, [0, 0, 1]);
  // Number plates: front on a bracket on the bumper, rear in a recess.
  box(P, SW.plastic, 0.33, 0.165, 0.02, 0, 0.415, zf - 0.075);
  quadUV(P, [0.153, 0.338, zf - 0.086], [-0.153, 0.338, zf - 0.086], [-0.153, 0.492, zf - 0.086], [0.153, 0.492, zf - 0.086], [0.004, 0.004, 0.496, 0.246]);
  fixFacing(P, [0, 0, -1]);
  quadUV(P, [-0.175, 0.52, HALF + 0.003], [0.175, 0.52, HALF + 0.003], [0.175, 0.7, HALF + 0.003], [-0.175, 0.7, HALF + 0.003], [0, 0, 0, 0]);
  fixFacing(P, [0, 0, 1]);
  swatch(P, P.count - 4, SW.rubber);
  quadUV(P, [-0.153, 0.533, HALF + 0.007], [0.153, 0.533, HALF + 0.007], [0.153, 0.687, HALF + 0.007], [-0.153, 0.687, HALF + 0.007], [0.004, 0.004, 0.496, 0.246]);
  fixFacing(P, [0, 0, 1]);
}

// Lamp strip following a rounded corner of the body (f = angle from the side toward the end).
function cornerStrip(g, front, sd, f0, f1, y0, y1, uv) {
  const r = front ? 0.24 : 0.2;
  const dir = front ? -1 : 1;
  const W = 0.865;
  const cz = dir * HALF - dir * r;
  const R = r + 0.016;
  const base = g.count;
  const n = 5;
  for (let j = 0; j <= n; j++) {
    const f = lerp(f0, f1, j / n);
    const nx = sd * Math.cos(f);
    const nz = dir * Math.sin(f);
    const x = sd * (W - r) + nx * R;
    const zz = cz + nz * R;
    const u = lerp(uv[0], uv[2], j / n);
    g.vert(x, y0, zz, nx, 0, nz, u, uv[1], WHITE);
    g.vert(x, y1, zz, nx, 0, nz, u, uv[3], WHITE);
  }
  grid(g, base, n + 1, 2);
}

// ---------- Wheels ----------
function wheels(G) {
  const P = G.parts;
  const tyreProf = [[0.2, -0.084], [0.262, -0.095], [0.303, -0.088], [0.315, -0.06], [0.315, 0.06], [0.303, 0.088], [0.262, 0.095], [0.2, 0.084]];
  const capProf = [[0.2, 0.084], [0.192, 0.09], [0.178, 0.093], [0.16, 0.098], [0.1, 0.104], [0.045, 0.108], [0, 0.109]];
  const steelProf = [[0.2, 0.084], [0.19, 0.078], [0.175, 0.064], [0.13, 0.058], [0.07, 0.06], [0.04, 0.07], [0, 0.07]];
  const seg = 20;
  const list = [
    [WF, -1, 0.14, false],
    [WF, 1, 0.14, true],
    [WR, -1, 0, true],
    [WR, 1, 0, true],
  ];
  for (const [w, side, steer, cap] of list) {
    const place = new THREE.Matrix4()
      .makeTranslation(side * TRACK, WHEEL_R - 0.012, w - HALF)
      .multiply(new THREE.Matrix4().makeRotationY(steer + (side < 0 ? Math.PI : 0)))
      .multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
    // Tyre (uv into the muddy tyre strip of the atlas).
    let s0 = P.count;
    P.lathe(0, 0, 0, tyreProf.map(([r, y]) => [r, y]), seg, WHITE);
    for (let i = s0; i < P.count; i++) {
      const j = i - s0;
      const ring = Math.floor(j / (seg + 1));
      const a = (j % (seg + 1)) / seg;
      P.t[i * 2] = 0.505 + a * 0.49;
      P.t[i * 2 + 1] = 0.004 + (ring / (tyreProf.length - 1)) * 0.242;
    }
    P.transform(place, s0);
    // Face: plastic hubcap with slots, or the bare rusty steel wheel.
    s0 = P.count;
    P.lathe(0, 0, 0, cap ? capProf : steelProf, 16, WHITE);
    swatch(P, s0, cap ? SW.hubcap : SW.rust);
    if (cap) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        box(P, SW.rubber, 0.05, 0.004, 0.016, Math.cos(a) * 0.125, 0.1035, Math.sin(a) * 0.125, 0, -a, 0);
      }
      cyl(P, SW.chrome, 0.03, 0.03, 0.006, 12, mat(0, 0.111, 0));
    } else {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        cyl(P, SW.steel, 0.011, 0.011, 0.03, 6, mat(Math.cos(a) * 0.05, 0.078, Math.sin(a) * 0.05));
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        box(P, SW.rubber, 0.045, 0.004, 0.028, Math.cos(a) * 0.15, 0.0625, Math.sin(a) * 0.15, 0, -a, 0);
      }
      cyl(P, SW.rubber, 0.03, 0.03, 0.02, 10, mat(0, 0.075, 0));
    }
    P.transform(place, s0);
  }
}

// ---------- Interior ----------
function interior(G) {
  const P = G.parts;
  const z = (s) => s - HALF;
  // Floor.
  box(P, SW.carpet, 1.54, 0.04, 2.0, 0, 0.33, z(2.6));
  // Dashboard: a side profile run across the car, instrument hood, vents.
  const s0 = P.count;
  const prof = [[z(1.6), 0.94], [z(1.99), 0.945], [z(2.05), 0.91], [z(2.05), 0.76], [z(1.94), 0.62], [z(1.72), 0.45], [z(1.6), 0.45]];
  P.prism([0, 0, 0], [0, 0, 1], [0, 1, 0], prof, 1.52, WHITE);
  swatch(P, s0, SW.dash);
  rbox(P, SW.dash, 0.38, 0.09, 0.2, 0.03, -0.37, 0.975, z(1.95));
  for (const xx of [-0.6, -0.08, 0.08, 0.6]) box(P, SW.rubber, 0.1, 0.05, 0.01, xx, 0.86, z(2.052));
  // Steering wheel on its column.
  const wx = -0.37;
  const wy = 0.9;
  const wz = z(2.17);
  const tilt = -0.45;
  const t0 = P.count;
  const torus = new THREE.TorusGeometry(0.182, 0.017, 6, 22);
  P.geometry(torus, mat(wx, wy, wz, tilt), WHITE);
  torus.dispose();
  swatch(P, t0, SW.rubber);
  rbox(P, SW.plastic, 0.1, 0.1, 0.05, 0.02, wx, wy, wz, tilt);
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const cx = Math.cos(a) * 0.1;
    const cy = Math.sin(a) * 0.1;
    box(P, SW.plastic, a === -Math.PI / 2 ? 0.035 : 0.12, a === -Math.PI / 2 ? 0.12 : 0.035, 0.012, wx + cx, wy + cy * Math.cos(tilt), wz - cy * Math.sin(tilt) * -1, tilt);
  }
  cyl(P, SW.plastic, 0.03, 0.04, 0.34, 8, mat(wx, wy - 0.07, wz - 0.16, tilt - Math.PI / 2 + 0.35));
  // Front seats: cushion, reclined back, headrest.
  for (const sx of [-0.38, 0.38]) {
    rbox(P, SW.fabric, 0.5, 0.14, 0.52, 0.05, sx, 0.5, z(2.56), 0.06);
    rbox(P, SW.fabric, 0.5, 0.64, 0.13, 0.05, sx, 0.86, z(2.9), 0.26);
    rbox(P, SW.fabric, 0.27, 0.19, 0.1, 0.04, sx, 1.26, z(3.01), 0.22);
    box(P, SW.plastic, 0.46, 0.18, 0.4, sx, 0.4, z(2.56));
  }
  // Rear bench.
  rbox(P, SW.fabric, 1.36, 0.15, 0.5, 0.06, 0, 0.5, z(3.28), 0.05);
  rbox(P, SW.fabric, 1.36, 0.5, 0.14, 0.06, 0, 0.78, z(3.62), 0.3);
  // Console, gear lever, handbrake, parcel shelf, rear-view mirror.
  rbox(P, SW.dash, 0.2, 0.2, 0.82, 0.03, 0, 0.44, z(2.36));
  cyl(P, SW.plastic, 0.008, 0.01, 0.16, 6, mat(0, 0.6, z(2.2), -0.25));
  rbox(P, SW.plastic, 0.045, 0.05, 0.045, 0.015, 0, 0.68, z(2.18));
  box(P, SW.plastic, 0.035, 0.03, 0.2, 0, 0.56, z(2.62), 0.25);
  box(P, SW.dash, 1.48, 0.02, 0.26, 0, 0.975, z(3.86));
  const my = topAt(2.25, 0) - 0.08;
  box(P, SW.plastic, 0.22, 0.06, 0.025, 0, my, z(2.25), 0.3);
  box(P, SW.plastic, 0.02, 0.06, 0.02, 0, my + 0.05, z(2.23));
  // Dome lamp, lit (the door is open).
  const dy = topAt(2.62, 0) - 0.033;
  quadUV(G.lamp, [-0.07, dy, z(2.58)], [0.07, dy, z(2.58)], [0.07, dy, z(2.66)], [-0.07, dy, z(2.66)], [0.12, 0.62, 0.38, 0.88]);
  fixFacing(G.lamp, [0, -1, 0]);
}

// ---------- Soft shadow on the ground under the car ----------
function groundShadow(L, group, heightAt) {
  const pos = [];
  const uv = [];
  const idx = [];
  const nx = 6;
  const nz = 10;
  const v = new THREE.Vector3();
  for (let i = 0; i <= nz; i++) {
    for (let j = 0; j <= nx; j++) {
      const lx = (j / nx - 0.5) * 2.5;
      const lz = (i / nz - 0.5) * 5.4;
      v.set(lx, 0, lz).applyMatrix4(group.matrixWorld);
      pos.push(v.x, heightAt(v.x, v.z) + 0.03, v.z);
      uv.push(j / nx, i / nz);
      if (i > 0 && j > 0) {
        const a = (i - 1) * (nx + 1) + j - 1;
        const b = a + nx + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  L.batcher.add(g, carMaterials().shadow, { worldUV: false, cast: false, receive: false });
}

// ---------- Materials and textures (built once) ----------
let MATS = null;
function carMaterials() {
  if (MATS) return MATS;
  const env = duskEnv();
  const paint = paintTextures();
  const parts = partsTextures();
  const lamp = lampTextures();
  MATS = {
    paint: new THREE.MeshStandardMaterial({ map: paint.map, roughnessMap: paint.rough, roughness: 1, metalness: 0.25, envMap: env, envMapIntensity: 0.85 }),
    parts: new THREE.MeshStandardMaterial({ map: parts.map, roughnessMap: parts.orm, metalnessMap: parts.orm, roughness: 1, metalness: 1, envMap: env, envMapIntensity: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.04, metalness: 0.4, envMap: env, envMapIntensity: 1.6, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
    lamp: new THREE.MeshStandardMaterial({ map: lamp.map, emissiveMap: lamp.glow, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.2 }),
    shadow: new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
  };
  MATS.flicker = MATS.lamp.clone();
  for (const [k, m] of Object.entries(MATS)) m.name = `car:${k}`;
  return MATS;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(cv, srgb) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A tiny dusk sky for reflections: orange horizon under a tree line, dark ground.
function duskEnv() {
  const rng = makeRng(77);
  const faces = [];
  for (let f = 0; f < 6; f++) {
    const c = canvas(64, 64);
    const x = c.getContext('2d');
    if (f === 2) {
      x.fillStyle = '#2a2034';
      x.fillRect(0, 0, 64, 64);
    } else if (f === 3) {
      x.fillStyle = '#120e0a';
      x.fillRect(0, 0, 64, 64);
    } else {
      const warm = f === 0 || f === 5 ? 1 : 0.7;
      const g = x.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#2c2236');
      g.addColorStop(0.3, '#5a3a44');
      g.addColorStop(0.48, `rgb(${Math.round(200 * warm)},${Math.round(120 * warm)},${Math.round(60 * warm)})`);
      g.addColorStop(0.5, '#1a130e');
      g.addColorStop(1, '#100c09');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      x.fillStyle = '#100c0a';
      for (let i = 0; i < 64; i += 2) {
        const h = 2 + rng() * 10;
        x.fillRect(i, 32 - h, 2, h);
      }
    }
    faces.push(c);
  }
  const t = new THREE.CubeTexture(faces);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Paint: dark red, oxidised on top, road dirt and rust low down, panel gaps.
function paintTextures() {
  const W = 1024;
  const H = 512;
  const cv = canvas(W, H);
  const rc = canvas(W, H);
  const c = cv.getContext('2d');
  const r = rc.getContext('2d');
  const rng = makeRng(1993);
  const X = (s) => (s / LEN) * W;
  const Y = (k, side) => (side > 0 ? 0.5 - (0.5 * k) / KN : 0.5 + (0.5 * k) / KN) * H;
  const rect = (ctx, s0, s1, k0, k1, side) => {
    const ya = Y(k0, side);
    const yb = Y(k1, side);
    ctx.fillRect(X(s0), Math.min(ya, yb), X(s1) - X(s0), Math.abs(yb - ya));
  };
  c.fillStyle = '#5e1417';
  c.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(0,95,0)';
  r.fillRect(0, 0, W, H);
  // Uneven paint.
  for (let i = 0; i < 1400; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const rad = 3 + rng() * 26;
    c.fillStyle = rng() < 0.5 ? `rgba(120,34,34,${0.05 + rng() * 0.07})` : `rgba(40,8,10,${0.05 + rng() * 0.08})`;
    c.beginPath();
    c.ellipse(x, y, rad * 1.6, rad, 0, 0, TAU);
    c.fill();
  }
  for (const side of [1, -1]) {
    // Sun-faded clear coat on the hood, roof and trunk, patchy down the upper sides.
    for (let i = 0; i < 260; i++) {
      const s = rng() * LEN;
      const k = 7.5 + rng() * 8.5;
      const rad = 4 + rng() * 22;
      const a = (0.08 + rng() * 0.16) * sstep(7.5, 11, k);
      c.fillStyle = `rgba(150,78,74,${a})`;
      r.fillStyle = `rgba(0,190,0,${a * 1.6})`;
      for (const ctx of [c, r]) {
        ctx.beginPath();
        ctx.ellipse(X(s), Y(k, side), rad * 1.8, rad, 0, 0, TAU);
        ctx.fill();
      }
    }
    // Road dirt: heavy on the sills, fading up the doors.
    const g0 = Y(0, side);
    const g1 = Y(6.2, side);
    const grad = c.createLinearGradient(0, g0, 0, g1);
    grad.addColorStop(0, 'rgba(56,44,30,0.96)');
    grad.addColorStop(0.45, 'rgba(62,48,32,0.7)');
    grad.addColorStop(1, 'rgba(62,48,32,0)');
    c.fillStyle = grad;
    c.fillRect(0, Math.min(g0, g1), W, Math.abs(g1 - g0));
    const rg = r.createLinearGradient(0, g0, 0, g1);
    rg.addColorStop(0, 'rgba(0,235,0,1)');
    rg.addColorStop(1, 'rgba(0,235,0,0)');
    r.fillStyle = rg;
    r.fillRect(0, Math.min(g0, g1), W, Math.abs(g1 - g0));
    // Spray thrown up behind the wheels.
    for (const w of [WF, WR]) {
      for (let i = 0; i < 90; i++) {
        const s = w + ARCH_R * 0.6 + rng() * 0.9;
        const k0 = 2 + rng() * 2;
        const k1 = k0 + 1 + rng() * 4;
        c.strokeStyle = `rgba(70,54,36,${0.12 + rng() * 0.25})`;
        c.lineWidth = 1 + rng() * 2.5;
        c.beginPath();
        c.moveTo(X(s), Y(k0, side));
        c.lineTo(X(s + 0.05 + rng() * 0.1), Y(k1, side));
        c.stroke();
      }
    }
    // Rust along the sills and round the arch lips.
    for (let i = 0; i < 70; i++) {
      const arch = rng() < 0.55;
      const w = rng() < 0.6 ? WR : WF;
      const s = arch ? w + (rng() < 0.5 ? -1 : 1) * ARCH_R * (0.75 + rng() * 0.3) : 1.3 + rng() * 2.0;
      const k = arch ? 1.8 + rng() * 2.2 : 2.2 + rng() * 2.2;
      const rad = 2 + rng() * 9;
      for (const [col, k2] of [['rgba(92,46,20,0.85)', 1.3], ['rgba(130,66,26,0.8)', 0.8], ['rgba(46,22,12,0.9)', 0.35]]) {
        c.fillStyle = col;
        c.beginPath();
        c.ellipse(X(s) + (rng() - 0.5) * 3, Y(k, side), rad * k2 * 1.4, rad * k2, rng() * 3, 0, TAU);
        c.fill();
      }
      r.fillStyle = 'rgb(0,245,0)';
      r.beginPath();
      r.ellipse(X(s), Y(k, side), rad * 1.9, rad * 1.3, 0, 0, TAU);
      r.fill();
    }
    // Black window trim: B-pillar and belt moulding.
    c.fillStyle = '#0c0b0b';
    rect(c, 2.53, 2.67, K_BELT, K_RAIL, side);
    rect(c, 1.62, 3.26, 9.55, K_BELT, side);
    r.fillStyle = 'rgb(0,150,0)';
    rect(r, 2.53, 2.67, K_BELT, K_RAIL, side);
    // Panel gaps.
    c.strokeStyle = 'rgba(12,4,4,0.9)';
    c.lineWidth = 1.6;
    const line = (s0, k0, s1, k1) => {
      c.beginPath();
      c.moveTo(X(s0), Y(k0, side));
      c.lineTo(X(s1), Y(k1, side));
      c.stroke();
    };
    line(DOOR[0], K_SILL, DOOR[0], K_BELT);
    line(DOOR[1], K_SILL, DOOR[1], K_BELT);
    line(2.64, K_SILL, 2.64, K_BELT);
    line(3.24, K_SILL + 0.6, 3.27, K_BELT);
    line(3.24, K_SILL + 0.6, 3.14, K_SILL + 0.6);
    line(DOOR[0], K_SILL + 0.05, 3.14, K_SILL + 0.05);
    line(0.03, 9.35, 1.56, 9.35);
    line(1.56, 9.35, 1.56, KN);
    line(4.03, 9.35, 4.57, 9.35);
    line(4.03, 9.35, 4.03, KN);
    if (side > 0) {
      c.strokeRect(X(3.74), Y(8.6, side), X(3.9) - X(3.74), Y(7.2, side) - Y(8.6, side));
    }
    // A few scratches.
    c.strokeStyle = 'rgba(170,120,110,0.35)';
    c.lineWidth = 0.8;
    for (let i = 0; i < 8; i++) {
      const s = 2.7 + rng() * 1.4;
      const k = 5 + rng() * 3;
      line(s, k, s + 0.1 + rng() * 0.25, k + (rng() - 0.5) * 0.6);
    }
  }
  return { map: tex(cv, true), rough: tex(rc, false) };
}

// Atlas for the trim: 4 x 4 swatches of 128 px, the bottom row holds the plate and the tyre.
function partsTextures() {
  const S = 512;
  const cv = canvas(S, S);
  const oc = canvas(S, S);
  const c = cv.getContext('2d');
  const o = oc.getContext('2d');
  const rng = makeRng(404);
  // [colour, roughness, metalness, grain]
  const defs = [
    ['#0c0c0c', 0.85, 0, 0.05],
    ['#161616', 0.6, 0, 0.05],
    ['#2a2928', 0.75, 0, 0.12],
    ['#c4c4c4', 0.22, 1, 0.04],
    ['#8a8d90', 0.38, 0.55, 0.08],
    ['#3a3b3c', 0.55, 0.75, 0.1],
    ['#5a3219', 0.95, 0.15, 0.35],
    ['#3b3631', 1, 0, 0.18],
    ['#46403a', 1, 0, 0.1],
    ['#1d1b1a', 0.8, 0, 0.06],
    ['#191715', 1, 0, 0.2],
    ['#2c2926', 0.9, 0, 0.1],
  ];
  defs.forEach(([col, ro, me, grain], k) => {
    const x0 = (k % 4) * 128;
    const y0 = (k >> 2) * 128;
    c.fillStyle = col;
    c.fillRect(x0, y0, 128, 128);
    for (let i = 0; i < 500; i++) {
      c.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${grain * 0.25})` : `rgba(0,0,0,${grain * 0.4})`;
      c.fillRect(x0 + rng() * 128, y0 + rng() * 128, 2, 2);
    }
    o.fillStyle = `rgb(0,${Math.round(ro * 255)},${Math.round(me * 255)})`;
    o.fillRect(x0, y0, 128, 128);
  });
  // Number plate (bottom-left 256 x 128).
  const px = 0;
  const py = 384;
  c.fillStyle = '#d8d2bc';
  c.fillRect(px, py, 256, 128);
  c.strokeStyle = '#2a3446';
  c.lineWidth = 5;
  c.strokeRect(px + 6, py + 6, 244, 116);
  c.fillStyle = '#23304a';
  c.font = 'bold 64px monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('3KE 491', px + 128, py + 70);
  c.font = 'bold 16px monospace';
  c.fillText('EST. 1994', px + 128, py + 22);
  for (let i = 0; i < 120; i++) {
    c.fillStyle = `rgba(70,56,40,${0.08 + rng() * 0.2})`;
    c.fillRect(px + rng() * 256, py + 80 + rng() * 48, 3 + rng() * 10, 2 + rng() * 5);
  }
  o.fillStyle = 'rgb(0,150,40)';
  o.fillRect(px, py, 256, 128);
  // Tyre strip (bottom-right 256 x 128): rows run inner sidewall -> tread -> outer sidewall.
  const tx = 256;
  c.fillStyle = '#111';
  c.fillRect(tx, py, 256, 128);
  for (let i = 0; i < 64; i++) {
    c.fillStyle = '#070707';
    c.fillRect(tx + i * 4, py + 52 + (i % 2) * 6, 2, 18);
  }
  for (let i = 0; i < 90; i++) {
    const x = tx + rng() * 256;
    const y = py + rng() * 128;
    const rad = 3 + rng() * 12;
    c.fillStyle = `rgba(${74 + rng() * 20},${58 + rng() * 14},${38 + rng() * 10},${0.5 + rng() * 0.4})`;
    c.beginPath();
    c.ellipse(x, y, rad * 1.5, rad, 0, 0, TAU);
    c.fill();
  }
  o.fillStyle = 'rgb(0,235,0)';
  o.fillRect(tx, py, 256, 128);
  return { map: tex(cv, true), orm: tex(oc, false) };
}

// Lamp atlas: headlamp, tail lamp, amber, reflector (colour + glow).
function lampTextures() {
  const cv = canvas(256, 128);
  const gv = canvas(256, 128);
  const c = cv.getContext('2d');
  const g = gv.getContext('2d');
  // Top-left: headlamp lens (dome lamp shares it).
  c.fillStyle = '#cfcab8';
  c.fillRect(0, 0, 128, 64);
  c.strokeStyle = 'rgba(90,90,80,0.5)';
  for (let y = 4; y < 64; y += 6) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(128, y);
    c.stroke();
  }
  const hg = g.createRadialGradient(64, 32, 4, 64, 32, 70);
  hg.addColorStop(0, '#fff2d8');
  hg.addColorStop(0.5, '#e0c898');
  hg.addColorStop(1, '#8a7650');
  g.fillStyle = hg;
  g.fillRect(0, 0, 128, 64);
  // Top-right: tail lamp.
  c.fillStyle = '#7a0c0c';
  c.fillRect(128, 0, 128, 64);
  g.fillStyle = '#b01808';
  g.fillRect(128, 0, 128, 64);
  for (let x = 128; x < 256; x += 8) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x, 0, 1, 64);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x, 0, 1, 64);
  }
  // Bottom-left: amber.
  c.fillStyle = '#b86a14';
  c.fillRect(0, 64, 128, 64);
  g.fillStyle = '#5a2a04';
  g.fillRect(0, 64, 128, 64);
  // Bottom-right: reflector panel.
  c.fillStyle = '#4a0a0a';
  c.fillRect(128, 64, 128, 64);
  g.fillStyle = '#1a0202';
  g.fillRect(128, 64, 128, 64);
  return { map: tex(cv, true), glow: tex(gv, true) };
}

function shadowTexture() {
  const cv = canvas(64, 128);
  const c = cv.getContext('2d');
  c.filter = 'blur(7px)';
  c.fillStyle = 'rgba(0,0,0,0.8)';
  c.fillRect(10, 10, 44, 108);
  c.filter = 'none';
  return tex(cv, false);
}
