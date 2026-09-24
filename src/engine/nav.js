import { Physics } from './physics.js';

// 2D navigation grid rasterised from the level's colliders, with A* and
// string-pulling. One floor height per cell (levels keep walkable floors from
// overlapping in XZ, except stairs).

const SQRT2 = Math.SQRT2;

export class NavGrid {
  constructor(physics, bounds, { cell = 0.5, radius = 0.35, maxClimb = 0.6 } = {}) {
    this.physics = physics;
    this.cell = cell;
    this.radius = radius;
    this.maxClimb = maxClimb;
    this.x0 = Math.floor(bounds.minX / cell) * cell;
    this.z0 = Math.floor(bounds.minZ / cell) * cell;
    this.w = Math.max(1, Math.ceil((bounds.maxX - this.x0) / cell));
    this.h = Math.max(1, Math.ceil((bounds.maxZ - this.z0) / cell));
    this.walk = new Uint8Array(this.w * this.h);
    this.height = new Float32Array(this.w * this.h);
    this.build();
  }

  build() {
    const { physics, cell, w, h } = this;
    const list = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = this.x0 + (i + 0.5) * cell;
        const z = this.z0 + (j + 0.5) * cell;
        const k = j * w + i;
        this.walk[k] = 0;
        physics.query(x - this.radius, z - this.radius, x + this.radius, z + this.radius, list);
        // Candidate floors: walkable tops under the centre, highest first.
        const tops = [];
        for (const c of list) {
          if (!c.walkable) continue;
          const t = Physics.topAt(c, x, z);
          if (t > -Infinity) tops.push(t);
        }
        tops.sort((a, b) => b - a);
        for (const top of tops) {
          if (this._clear(list, x, z, top)) {
            this.walk[k] = 1;
            this.height[k] = top;
            break;
          }
        }
      }
    }
  }

  // Headroom and body clearance above a floor height.
  _clear(list, x, z, top) {
    const lo = top + 0.45;
    const hi = top + 1.5;
    const r = this.radius;
    for (const c of list) {
      if (!c.solid || c.type === 'height' || c.navIgnore) continue;
      const bottom = Physics.bottomOf(c);
      if (bottom >= hi) continue;
      if (c.type === 'cyl') {
        if (c.y1 <= lo) continue;
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz < (r + c.r) * (r + c.r)) return false;
        continue;
      }
      const cx = Math.max(c.min.x, Math.min(x, c.max.x));
      const cz = Math.max(c.min.z, Math.min(z, c.max.z));
      const ct = c.type === 'ramp' ? Physics.topAt(c, cx, cz) : c.max.y;
      if (ct <= lo) continue;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  }

  index(x, z) {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  center(k, out) {
    const i = k % this.w;
    const j = (k / this.w) | 0;
    out.x = this.x0 + (i + 0.5) * this.cell;
    out.z = this.z0 + (j + 0.5) * this.cell;
    out.y = this.height[k];
    return out;
  }

  isWalkable(x, z) {
    const k = this.index(x, z);
    return k >= 0 && this.walk[k] === 1;
  }

  // Nearest walkable cell to a world point (small spiral search).
  nearest(x, z, y = null, maxR = 4) {
    const k0 = this.index(x, z);
    if (k0 >= 0 && this.walk[k0] && (y === null || Math.abs(this.height[k0] - y) < 1.2)) return k0;
    const i0 = Math.floor((x - this.x0) / this.cell);
    const j0 = Math.floor((z - this.z0) / this.cell);
    for (let r = 1; r <= maxR; r++) {
      let best = -1;
      let bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const k = j * this.w + i;
          if (!this.walk[k]) continue;
          if (y !== null && Math.abs(this.height[k] - y) > 1.2) continue;
          const d = di * di + dj * dj;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // A* from world point a to b. Returns an array of {x, y, z} waypoints
  // (excluding the start) or null.
  findPath(a, b, maxNodes = 5000) {
    const s = this.nearest(a.x, a.z, a.y);
    const g = this.nearest(b.x, b.z, b.y);
    if (s < 0 || g < 0) return null;
    if (s === g) return [{ x: b.x, y: b.y, z: b.z }];
    const { w, h } = this;
    const n = w * h;
    if (!this._g || this._g.length !== n) {
      this._g = new Float32Array(n);
      this._came = new Int32Array(n);
      this._seen = new Uint32Array(n);
      this._closed = new Uint32Array(n);
      this._gen = 0;
    }
    const gen = ++this._gen;
    const G = this._g;
    const came = this._came;
    const seen = this._seen;
    const closed = this._closed;
    const gi = g % w;
    const gj = (g / w) | 0;
    const heur = (k) => {
      const dx = Math.abs((k % w) - gi);
      const dz = Math.abs(((k / w) | 0) - gj);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };
    const heap = new MinHeap();
    seen[s] = gen;
    G[s] = 0;
    came[s] = -1;
    heap.push(s, heur(s));
    let expanded = 0;
    let found = false;
    while (heap.size) {
      const k = heap.pop();
      if (closed[k] === gen) continue;
      closed[k] = gen;
      if (k === g) {
        found = true;
        break;
      }
      if (++expanded > maxNodes) break;
      const i = k % w;
      const j = (k / w) | 0;
      const hk = this.height[k];
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
          const nk = nj * w + ni;
          if (!this.walk[nk] || closed[nk] === gen) continue;
          if (Math.abs(this.height[nk] - hk) > this.maxClimb) continue;
          if (di && dj && (!this.walk[j * w + ni] || !this.walk[nj * w + i])) continue;
          const cost = G[k] + (di && dj ? SQRT2 : 1);
          if (seen[nk] !== gen || cost < G[nk]) {
            seen[nk] = gen;
            G[nk] = cost;
            came[nk] = k;
            heap.push(nk, cost + heur(nk));
          }
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = g; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    // String-pull: skip cells while a straight grid line stays walkable.
    const out = [];
    let anchor = 0;
    for (let i = 2; i < cells.length; i++) {
      if (!this._lineWalkable(cells[anchor], cells[i])) {
        out.push(this.center(cells[i - 1], {}));
        anchor = i - 1;
      }
    }
    out.push({ x: b.x, y: this.height[g], z: b.z });
    return out;
  }

  _lineWalkable(ka, kb) {
    const w = this.w;
    let x0 = ka % w;
    let y0 = (ka / w) | 0;
    const x1 = kb % w;
    const y1 = (kb / w) | 0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let prevH = this.height[ka];
    for (let guard = 0; guard < 400; guard++) {
      const k = y0 * w + x0;
      if (!this.walk[k] || Math.abs(this.height[k] - prevH) > this.maxClimb) return false;
      prevH = this.height[k];
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
      // Diagonal steps must not cut corners.
      if (e2 > -dy && e2 < dx && (!this.walk[(y0 - sy) * w + x0] || !this.walk[y0 * w + x0 - sx])) return false;
    }
    return false;
  }
}

class MinHeap {
  constructor() {
    this.k = [];
    this.p = [];
  }

  get size() {
    return this.k.length;
  }

  push(key, pri) {
    const k = this.k;
    const p = this.p;
    k.push(key);
    p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[par], k[i]] = [k[i], k[par]];
      [p[par], p[i]] = [p[i], p[par]];
      i = par;
    }
  }

  pop() {
    const k = this.k;
    const p = this.p;
    const top = k[0];
    const lk = k.pop();
    const lp = p.pop();
    if (k.length) {
      k[0] = lk;
      p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
