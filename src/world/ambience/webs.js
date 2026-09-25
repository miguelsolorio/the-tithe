import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lite, dist2 } from './common.js';

// Cobwebs for any level: corner webs, sheets across door tops, loose hanging
// strands, and now and then a spider. Everything merges into one batch (webs),
// one line set (strands) and one instanced mesh (spiders).
//
//   const W = new Webs(L);
//   W.autoCorners([x0, y0, z0], [x1, y1, z1]);   // a room's box
//   W.corner(p, A, B, size); W.span(a, b); W.strands(p, 5, 0.4);
//   W.flush();                                      // once, at the end of build

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

// Corner cobweb: threads fan out from the bottom-left corner (uv 0, 0).
let WEB_TEX = null;
export function webTexture() {
  return (WEB_TEX ??= canvasTex(256, 256, (ctx) => {
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
  }));
}

let MATS = null;
function mats() {
  return (MATS ??= {
    web: new THREE.MeshStandardMaterial({ name: 'ambience:web', map: webTexture(), color: 0xd0ccc4, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, roughness: 0.55 }),
    strand: new THREE.LineBasicMaterial({ name: 'ambience:strand', color: 0x9a968e, transparent: true, opacity: 0.35, depthWrite: false }),
    spider: new THREE.MeshStandardMaterial({ name: 'ambience:spider', color: 0x14100c, roughness: 0.45 }),
  });
}

// Small spider along +X/+Z, legs splayed, ~7 cm across.
let SPIDER = null;
function spiderGeo() {
  if (SPIDER) return SPIDER;
  const parts = [];
  const abd = new THREE.SphereGeometry(0.013, 8, 6);
  abd.scale(1, 0.8, 1.3);
  abd.translate(0, 0, -0.015);
  const head = new THREE.SphereGeometry(0.008, 6, 5);
  head.translate(0, 0, 0.006);
  parts.push(abd, head);
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 4; i++) {
      const a = (-0.9 + i * 0.6) * s;
      const up = new THREE.CylinderGeometry(0.0013, 0.0013, 0.026, 3);
      up.rotateZ(Math.PI / 2 - 0.6 * s);
      up.translate(0.011 * s, 0.007, 0);
      up.rotateY(a);
      const low = new THREE.CylinderGeometry(0.0011, 0.0008, 0.03, 3);
      low.rotateZ(-0.35 * s);
      low.translate(0.026 * s, -0.004, 0);
      low.rotateY(a);
      parts.push(up, low);
    }
  }
  for (const p of parts) p.deleteAttribute('uv');
  SPIDER = mergeGeometries(parts, false);
  // Lie flat on the XY plane (web plane) facing +Z out of it.
  SPIDER.rotateX(Math.PI / 2);
  return SPIDER;
}

const add3 = (p, a, s) => [p[0] + a[0] * s, p[1] + a[1] * s, p[2] + a[2] * s];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export class Webs {
  constructor(L, { spiders = 0.22 } = {}) {
    this.L = L;
    this.rng = L.rng;
    this.chunks = new Map(); // 14 m cells, so level culling can hide far webs
    this.lines = [];
    this.spiderChance = spiders;
    this.spiders = [];
  }

  _quad(p0, p1, p2, p3) {
    const key = `${Math.floor(p0[0] / 14)}|${Math.floor(p0[2] / 14)}`;
    let c = this.chunks.get(key);
    if (!c) this.chunks.set(key, (c = { pos: [], uv: [], idx: [] }));
    const b = c.pos.length / 3;
    c.pos.push(...p0, ...p1, ...p2, ...p3);
    c.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    c.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  // Corner web from corner p0, spreading along unit A and B (size s), sagging toward sag.
  corner(p0, A, B, s, sag = [0, -1, 0]) {
    const p1 = add3(p0, A, s);
    const p3 = add3(p0, B, s);
    const p2 = add3(add3(add3(p0, A, s * 0.55), B, s * 0.55), sag, s * 0.28);
    this._quad(p0, p1, p2, p3);
    if (this.rng() < this.spiderChance) {
      const k = this.rng.range(0.25, 0.42);
      const c = add3(add3(add3(p0, A, s * k), B, s * k), sag, s * 0.12 * k);
      this.spiders.push({ base: c, A, B, s, off: [0, 0], goal: [0, 0], wait: this.rng.range(1, 6) });
    }
    return this;
  }

  // Web across a room corner: from partway along the vertical edge to the two
  // ceiling (or floor) edges, bellied into the room. c is the corner point
  // (on the ceiling when up = -1, the floor when up = 1); A, B point along
  // the two walls into the room.
  nook(c, A, B, up, s) {
    const V = [0, up, 0];
    const p0 = add3(c, V, s * this.rng.range(0.5, 0.8));
    const p1 = add3(c, A, s * this.rng.range(0.8, 1.1));
    const p3 = add3(c, B, s * this.rng.range(0.8, 1.1));
    const p2 = add3(add3(add3(c, A, s * 0.5), B, s * 0.5), V, s * 0.3);
    this._quad(p0, p1, p2, p3);
    if (this.rng() < this.spiderChance) {
      const m = add3(add3(add3(c, A, s * 0.3), B, s * 0.3), V, s * 0.3);
      // Web plane basis: along the p0->p2 line and across it.
      const u = norm([p1[0] - p3[0], p1[1] - p3[1], p1[2] - p3[2]]);
      const v = norm([p0[0] - p2[0], p0[1] - p2[1], p0[2] - p2[2]]);
      this.spiders.push({ base: m, A: u, B: v, s, off: [0, 0], goal: [0, 0], wait: this.rng.range(1, 6) });
    }
    return this;
  }

  // Sheet hanging between two points (a door top, a beam): two corner webs
  // meeting in the middle, sagging down.
  span(a, b, drop = 0.4) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...d);
    const u = d.map((x) => x / len);
    const s = Math.min(len * 0.55, 0.9);
    this.corner(a, u, [0, -1, 0], s * drop * 2.5);
    this.corner(b, u.map((x) => -x), [0, -1, 0], s * drop * 2.5);
    return this;
  }

  // Loose threads hanging from a ceiling point.
  strands(p, n = 4, len = 0.4) {
    for (let i = 0; i < n; i++) {
      const x = p[0] + this.rng.range(-0.25, 0.25);
      const z = p[2] + this.rng.range(-0.25, 0.25);
      const l = len * this.rng.range(0.4, 1.2);
      this.lines.push(x, p[1], z, x + this.rng.range(-0.03, 0.03), p[1] - l, z + this.rng.range(-0.03, 0.03));
    }
    return this;
  }

  // Webs in a random subset of a room's corners. min/max: the room's inner box
  // (floor y to ceiling y). opts: { ceil: chance per top corner, floor: per bottom corner, size: [a, b], strands }
  // check: only use corners that really have a wall on both sides (plan rooms
  // made of several rectangles have corners that are open floor).
  autoCorners(min, max, { ceil = 0.75, floor = 0.3, size = [0.6, 1.25], strands = 0.5, inset = 0.1, check = false } = {}) {
    const r = this.rng;
    const xs = [[min[0] + inset, 1], [max[0] - inset, -1]];
    const zs = [[min[2] + inset, 1], [max[2] - inset, -1]];
    for (const [x, dx] of xs) {
      for (const [z, dz] of zs) {
        if (check && !this._isCorner(x, (min[1] + max[1]) / 2, z, dx, dz)) continue;
        if (r() < ceil) {
          const s = r.range(size[0], size[1]);
          const y = max[1] - 0.02;
          this.nook([x, y, z], [dx, 0, 0], [0, 0, dz], -1, s);
          if (r() < strands) this.strands([x + dx * s * 0.5, y, z + dz * s * 0.5], 2 + r.int(0, 3), 0.35);
        }
        if (r() < floor) this.nook([x, min[1] + 0.01, z], [dx, 0, 0], [0, 0, dz], 1, r.range(size[0] * 0.5, size[1] * 0.6));
      }
    }
    return this;
  }

  _isCorner(x, y, z, dx, dz) {
    const ph = this.L.physics;
    const o = new THREE.Vector3(x + dx * 0.4, y, z + dz * 0.4);
    const hx = ph.raycast(o, new THREE.Vector3(-dx, 0, 0), 0.7, null, {});
    const hz = ph.raycast(o, new THREE.Vector3(0, 0, -dz), 0.7, null, {});
    return !!(hx && hz);
  }

  // Webs in every room of an L.plan result. skip: room keys to leave clean.
  // Stair, open-topped and flesh rooms are skipped; vaulted ones too unless
  // vaults is set (webs then sit where the vault springs from the walls).
  fromPlan(P, { skip = '', only = null, vaults = false, ...opts } = {}) {
    for (const [key, list] of Object.entries(P.rects)) {
      const room = P.rooms[key];
      if (!room || skip.includes(key) || (only && !only.includes(key))) continue;
      if (room.stairs || (room.vault && !vaults) || room.noCeil || room.style === 'flesh') continue;
      for (const q of list) {
        if (q.x1 - q.x0 < 1.5 || q.z1 - q.z0 < 1.5) continue;
        this.autoCorners([q.x0, room.y, q.z0], [q.x1, room.y + room.h, q.z1], { check: true, inset: 0.11, ...opts });
      }
    }
    return this;
  }

  flush() {
    const L = this.L;
    const M = mats();
    for (const c of this.chunks.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2));
      g.setIndex(c.idx);
      g.computeVertexNormals();
      L.batcher.add(g, M.web, { worldUV: false, cast: false });
    }
    if (this.lines.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.lines, 3));
      const ls = new THREE.LineSegments(g, M.strand);
      ls.name = 'ambience:strands';
      ls.userData.noCull = true;
      L.mesh(ls);
    }
    this._spiders(L, M);
  }

  _spiders(L, M) {
    const list = lite(L.game) ? this.spiders.filter((_, i) => i % 2 === 0) : this.spiders;
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(spiderGeo(), M.spider, list.length);
    inst.name = 'ambience:spiders';
    inst.userData.noCull = true;
    inst.castShadow = false;
    inst.frustumCulled = false;
    const m = new THREE.Matrix4();
    const basis = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const place = (i, sp) => {
      const { A, B, base, s, off } = sp;
      const n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
      basis.makeBasis(new THREE.Vector3(...A), new THREE.Vector3(...B), new THREE.Vector3(...n));
      q.setFromRotationMatrix(basis);
      p.set(...add3(add3(base, A, off[0] * s), B, off[1] * s));
      m.compose(p, q, one);
      inst.setMatrixAt(i, m);
    };
    list.forEach((sp, i) => place(i, sp));
    L.mesh(inst);
    const center = new THREE.Vector3();
    L.onUpdate((dt, t, game) => {
      let dirty = false;
      list.forEach((sp, i) => {
        center.set(...sp.base);
        if (dist2(game, center) > 100) return;
        sp.wait -= dt;
        if (sp.wait <= 0) {
          sp.wait = Math.random() < 0.3 ? 0.2 : 1.5 + Math.random() * 6;
          sp.goal = [(Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18];
        }
        const k = Math.min(1, dt * 5);
        const dx = sp.goal[0] - sp.off[0];
        const dy = sp.goal[1] - sp.off[1];
        if (Math.abs(dx) + Math.abs(dy) < 1e-3) return;
        sp.off[0] += dx * k;
        sp.off[1] += dy * k;
        place(i, sp);
        dirty = true;
      });
      if (dirty) inst.instanceMatrix.needsUpdate = true;
    });
  }
}
