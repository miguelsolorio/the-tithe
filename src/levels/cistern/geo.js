import * as THREE from 'three';
import { getMaterial } from '../../world/materials.js';
import { fbm2 } from '../../core/rng.js';

// Geometry helpers for the cistern: walkways and channels inside vaulted
// tunnels, arch ribs, rubble, flesh growths and wall details. Everything
// static goes through L.batcher (merged per material, world-space UVs).

export const M = (m) => (typeof m === 'string' ? getMaterial(m) : m);
export const FACE_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
export const FACE_DIR = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

// Triangle soup whose faces are flipped to point along `want`.
export class Soup {
  constructor() {
    this.p = [];
  }

  tri(a, b, c, want) {
    if (want) {
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      if (nx * want[0] + ny * want[1] + nz * want[2] < 0) [b, c] = [c, b];
    }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }

  quad(a, b, c, d, want) {
    this.tri(a, b, c, want);
    this.tri(a, c, d, want);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.computeVertexNormals();
    return g;
  }

  flush(L, mat, opts) {
    if (this.p.length) L.batcher.add(this.geometry(), M(mat), opts);
    this.p = [];
  }
}

// Box in tunnel space: `along` the tunnel axis and `across` it.
export function tbox(L, axis, a0, a1, b0, b1, y0, y1, mat, opts) {
  return axis === 'x' ? L.box([a0, y0, b0], [a1, y1, b1], mat, opts) : L.box([b0, y0, a0], [b1, y1, a1], mat, opts);
}

// World point from tunnel coordinates.
export const tp = (axis, a, y, b) => (axis === 'x' ? [a, y, b] : [b, y, a]);

// Tunnel spec: { axis, x0, x1, z0, z1 } plus derived along/across ranges.
export function span(t) {
  const along = t.axis === 'x' ? [t.x0, t.x1] : [t.z0, t.z1];
  const across = t.axis === 'x' ? [t.z0, t.z1] : [t.x0, t.x1];
  return { along, across, mid: (across[0] + across[1]) / 2, hw: (across[1] - across[0]) / 2 };
}

// Walkways on both sides of a channel, landings at both ends, coping on the lip
// and the channel water. The room floor (plan y) is the channel bed.
// t: { axis, x0, x1, z0, z1, bed, water, walk: [a, b], land: [l0, l1], color }
export function tunnelFit(L, t) {
  const { along, across } = span(t);
  const [l0, l1] = t.land ?? [1.5, 1.5];
  const [wa, wb] = t.walk ?? [1.6, 1.6];
  const bed = t.bed;
  const c0 = along[0] + l0;
  const c1 = along[1] - l1;
  const k0 = across[0] + wa;
  const k1 = across[1] - wb;
  const mat = t.mat ?? 'stoneWet';
  const ax = t.axis;
  if (l0 > 0) tbox(L, ax, along[0], c0, across[0], across[1], bed, 0, mat);
  if (l1 > 0) tbox(L, ax, c1, along[1], across[0], across[1], bed, 0, mat);
  if (wa > 0) tbox(L, ax, c0, c1, across[0], k0, bed, 0, mat);
  if (wb > 0) tbox(L, ax, c0, c1, k1, across[1], bed, 0, mat);
  // Dressed coping stones along the lip (visual only).
  const o = { collide: false };
  const cop = t.coping ?? 'stone';
  if (wa > 0) tbox(L, ax, c0, c1, k0 - 0.28, k0 + 0.05, -0.16, 0.025, cop, o);
  if (wb > 0) tbox(L, ax, c0, c1, k1 - 0.05, k1 + 0.28, -0.16, 0.025, cop, o);
  if (l0 > 0) tbox(L, ax, c0 - 0.28, c0 + 0.05, k0 + 0.05, k1 - 0.05, -0.16, 0.025, cop, o);
  if (l1 > 0) tbox(L, ax, c1 - 0.05, c1 + 0.28, k0 + 0.05, k1 - 0.05, -0.16, 0.025, cop, o);
  // Green-black slime line where the water has stood for years.
  const slime = t.slime ?? 'black';
  const wy = t.water;
  if (wa > 0) tbox(L, ax, c0, c1, k0, k0 + 0.012, wy - 0.05, wy + 0.18, slime, o);
  if (wb > 0) tbox(L, ax, c0, c1, k1 - 0.012, k1, wy - 0.05, wy + 0.18, slime, o);
  const box = ax === 'x' ? { min: [c0, k0], max: [c1, k1] } : { min: [k0, c0], max: [k1, c1] };
  const water = t.water !== null ? L.water({ ...box, y: wy, color: t.color ?? 'teal', opacity: t.opacity ?? 0.84 }) : null;
  return { ...t, c0, c1, k0, k1, water, along, across };
}

// Steps from a walkway down into the channel at along-position s (side 0 = the
// across[0] walkway, 1 = the other one).
export function channelSteps(L, f, s, side, n = 4, w = 1.3) {
  // Deeper than any mover's radius, so lampreys and hounds can climb them too.
  const d = 0.55;
  for (let k = 1; k < n; k++) {
    const top = (f.bed * k) / n;
    const b0 = side === 0 ? f.k0 + (k - 1) * d : f.k1 - k * d;
    const b1 = side === 0 ? f.k0 + k * d : f.k1 - (k - 1) * d;
    tbox(L, f.axis, s - w / 2, s + w / 2, b0, b1, f.bed, top, 'stone');
  }
}

// Point on a barrel vault: angle a (0..PI) across the span, `inset` towards the axis.
export function vaultPt(axis, mid, hw, rise, top, along, a, inset = 0) {
  const b = mid + Math.cos(a) * (hw - inset);
  const y = top + Math.sin(a) * (rise - inset);
  return tp(axis, along, y, b);
}

// Transverse arch ribs with pilasters, every entry of `at` (along positions).
// t: { axis, x0, x1, z0, z1, top, rise, foot }
export function ribs(L, t, at, { mat = 'stone', th = 0.24, w = 0.44, pilasters = true } = {}) {
  const { mid, hw, across } = span(t);
  const soup = new Soup();
  const n = 14;
  const ad = t.axis === 'x' ? [1, 0, 0] : [0, 0, 1];
  for (const s of at) {
    for (let k = 0; k < n; k++) {
      const a0 = (Math.PI * k) / n;
      const a1 = (Math.PI * (k + 1)) / n;
      const am = (a0 + a1) / 2;
      const inward = t.axis === 'x' ? [0, -Math.sin(am), -Math.cos(am)] : [-Math.cos(am), -Math.sin(am), 0];
      for (const [e, sign] of [
        [s - w / 2, -1],
        [s + w / 2, 1],
      ]) {
        const o0 = vaultPt(t.axis, mid, hw, t.rise, t.top, e, a0, 0.015);
        const o1 = vaultPt(t.axis, mid, hw, t.rise, t.top, e, a1, 0.015);
        const i0 = vaultPt(t.axis, mid, hw, t.rise, t.top, e, a0, th);
        const i1 = vaultPt(t.axis, mid, hw, t.rise, t.top, e, a1, th);
        soup.quad(o0, o1, i1, i0, [ad[0] * sign, 0, ad[2] * sign]);
      }
      const f0 = vaultPt(t.axis, mid, hw, t.rise, t.top, s - w / 2, a0, th);
      const f1 = vaultPt(t.axis, mid, hw, t.rise, t.top, s - w / 2, a1, th);
      const b1 = vaultPt(t.axis, mid, hw, t.rise, t.top, s + w / 2, a1, th);
      const b0 = vaultPt(t.axis, mid, hw, t.rise, t.top, s + w / 2, a0, th);
      soup.quad(f0, f1, b1, b0, inward);
    }
    if (!pilasters) continue;
    const foot = t.foot ?? 0;
    for (const side of [0, 1]) {
      const b0 = side === 0 ? across[0] + 0.1 : across[1] - 0.3;
      const b1 = side === 0 ? across[0] + 0.3 : across[1] - 0.1;
      tbox(L, t.axis, s - w / 2 - 0.03, s + w / 2 + 0.03, b0, b1, foot, t.top, mat);
      // Impost block under the springing.
      const c0 = side === 0 ? across[0] + 0.1 : across[1] - 0.38;
      const c1 = side === 0 ? across[0] + 0.38 : across[1] - 0.1;
      tbox(L, t.axis, s - w / 2 - 0.07, s + w / 2 + 0.07, c0, c1, t.top - 0.2, t.top, mat, { collide: false });
    }
  }
  soup.flush(L, mat);
}

// Heap of broken masonry. { x, z, y, r, n, h, mat, bricks }
export function rubble(L, rng, { x, z, y = 0, r = 1, n = 12, h = 0.5, mat = 'stone', bricks = 8, sx = 1, sz = 1 }) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r;
    const s = rng.range(0.14, 0.42) * (1 - (d / r) * 0.4);
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.scale(rng.range(0.9, 1.7), rng.range(0.45, 0.9), rng.range(0.9, 1.5));
    g.rotateY(rng() * 6.28);
    g.rotateX(rng.range(-0.35, 0.35));
    g.translate(x + Math.cos(a) * d * sx, y + h * (1 - d / r) * rng.range(0.4, 1) + s * 0.2, z + Math.sin(a) * d * sz);
    L.batcher.add(g, M(mat));
  }
  for (let i = 0; i < bricks; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r * 1.2;
    const g = new THREE.BoxGeometry(0.23, 0.075, 0.11);
    g.rotateZ(rng.range(-0.6, 0.6));
    g.rotateY(rng() * 6.28);
    g.translate(x + Math.cos(a) * d * sx, y + 0.04 + h * Math.max(0, 1 - d / r) * rng(), z + Math.sin(a) * d * sz);
    L.batcher.add(g, M('brick'));
  }
}

// Lumpy organic growth (flesh). squash scales the sphere per axis.
export function blob(L, x, y, z, r, { mat = 'flesh', squash = [1, 0.6, 1], seed = 1, rot = 0 } = {}) {
  const g = new THREE.SphereGeometry(r, 12, 9);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i);
    const vy = p.getY(i);
    const vz = p.getZ(i);
    const n = fbm2(vx * 2.6 + seed * 3.1 + vy * 1.7, vz * 2.6 + vy * 1.3 + seed, 3, 5 + seed);
    const k = 0.7 + n * 0.6;
    p.setXYZ(i, vx * k * squash[0], vy * k * squash[1], vz * k * squash[2]);
  }
  g.rotateY(rot);
  g.computeVertexNormals();
  g.translate(x, y, z);
  L.batcher.add(g, M(mat), { worldUV: true });
}

// Arched culvert mouth on a wall: dark half-disc and a ring of voussoirs.
export function culvert(L, { x, y, z, face, r = 0.5, mat = 'stone' }) {
  const rot = FACE_ROT[face];
  const [dx, dz] = FACE_DIR[face];
  const hole = new THREE.CircleGeometry(r, 16, 0, Math.PI);
  hole.rotateY(rot);
  hole.translate(x + dx * 0.012, y, z + dz * 0.012);
  L.batcher.add(hole, M('black'), { worldUV: false, cast: false });
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (Math.PI * (k + 0.5)) / n;
    const g = new THREE.BoxGeometry(0.2, (Math.PI * (r + 0.1)) / n - 0.025, 0.14);
    g.rotateZ(a - Math.PI / 2);
    g.translate(Math.cos(a) * (r + 0.1), Math.sin(a) * (r + 0.1), 0.02);
    g.rotateY(rot);
    g.translate(x, y, z);
    L.batcher.add(g, M(mat));
  }
}

// Iron wall bracket with a hanging lantern at its end. Returns the lantern prop.
export function wallLantern(L, x, z, face, { y = 2.75, drop = 0.35, amber = false, arm = 0.5 } = {}) {
  const [dx, dz] = FACE_DIR[face];
  const ex = x + dx * arm;
  const ez = z + dz * arm;
  const bar = new THREE.BoxGeometry(0.04, 0.04, arm);
  bar.rotateY(Math.atan2(dx, dz));
  bar.translate(x + (dx * arm) / 2, y, z + (dz * arm) / 2);
  L.batcher.add(bar, M('metal'));
  const strut = new THREE.BoxGeometry(0.03, 0.03, arm * 0.95);
  strut.rotateX(-0.72);
  strut.rotateY(Math.atan2(dx, dz));
  strut.translate(x + (dx * arm) / 2.2, y - 0.2, z + (dz * arm) / 2.2);
  L.batcher.add(strut, M('metal'));
  const plate = new THREE.BoxGeometry(0.14, 0.4, 0.02);
  plate.rotateY(Math.atan2(dx, dz));
  plate.translate(x + dx * 0.01, y - 0.12, z + dz * 0.01);
  L.batcher.add(plate, M('rust'));
  return L.prop('hangingLantern', ex, ez, { y, args: { drop, color: amber ? 'amber' : 'teal' }, collider: 'none' });
}

// Waterlogged planks and crates adrift on a water surface.
export function debris(L, rng, x0, z0, x1, z1, y, n = 5) {
  for (let i = 0; i < n; i++) {
    const long = rng.range(0.8, 1.9);
    const g = new THREE.BoxGeometry(long, 0.06, rng.range(0.14, 0.26));
    g.rotateY(rng() * Math.PI);
    g.rotateZ(rng.range(-0.05, 0.05));
    g.translate(rng.range(x0, x1), y + 0.01, rng.range(z0, z1));
    L.batcher.add(g, M(rng() < 0.5 ? 'woodRotten' : 'wood'), { cast: false });
  }
}

// Irregular dark hole in a barrel vault where the brick has fallen in.
export function vaultHole(L, t, s, a, radius, rng) {
  const { mid, hw } = span(t);
  const soup = new Soup();
  const n = 18;
  const ring = [];
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2;
    const rr = radius * rng.range(0.6, 1.15);
    const ds = Math.cos(ang) * rr;
    const da = (Math.sin(ang) * rr) / Math.max(1, hw);
    ring.push(vaultPt(t.axis, mid, hw, t.rise, t.top, s + ds, a + da, 0.02));
  }
  const c = vaultPt(t.axis, mid, hw, t.rise, t.top, s, a, 0.02);
  for (let k = 0; k < n; k++) soup.tri(c, ring[k], ring[(k + 1) % n], [0, -1, 0]);
  soup.flush(L, 'black', { worldUV: false, cast: false });
  return c;
}
