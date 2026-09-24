// Uniform hash grid for colliders. Supports circles and oriented boxes.
// Collider shapes:
//   { type: 'circle', x, z, r }
//   { type: 'box', x, z, hw, hd, rot }   (rot = yaw in radians)
// Optional flags: disabled (ignored everywhere), noOcclude (doesn't block sight lines).

export class SpatialGrid {
  constructor(cellSize = 4) {
    this.size = cellSize;
    this.cells = new Map();
    this.stamp = 0;
    this.all = [];
  }

  _key(ix, iz) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  _extent(c) {
    return c.type === 'box' ? Math.hypot(c.hw, c.hd) : c.r;
  }

  insert(c) {
    if (c.type === 'box') {
      c.cos = Math.cos(c.rot || 0);
      c.sin = Math.sin(c.rot || 0);
    }
    c._q = 0;
    const e = this._extent(c);
    const x0 = Math.floor((c.x - e) / this.size);
    const x1 = Math.floor((c.x + e) / this.size);
    const z0 = Math.floor((c.z - e) / this.size);
    const z1 = Math.floor((c.z + e) / this.size);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let cell = this.cells.get(k);
        if (!cell) this.cells.set(k, (cell = []));
        cell.push(c);
      }
    }
    this.all.push(c);
    return c;
  }

  query(x, z, r, out = []) {
    out.length = 0;
    const stamp = ++this.stamp;
    const x0 = Math.floor((x - r) / this.size);
    const x1 = Math.floor((x + r) / this.size);
    const z0 = Math.floor((z - r) / this.size);
    const z1 = Math.floor((z + r) / this.size);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const cell = this.cells.get(this._key(ix, iz));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const c = cell[i];
          if (c._q === stamp || c.disabled) continue;
          c._q = stamp;
          out.push(c);
        }
      }
    }
    return out;
  }

  // True if any collider overlaps the circle (used for placement checks).
  overlaps(x, z, r) {
    const list = this.query(x, z, r + 4, _tmp);
    for (const c of list) {
      if (c.type === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < r + c.r) return true;
      } else if (this._boxPoint(c, x, z, r)) return true;
    }
    return false;
  }

  _boxPoint(c, x, z, pad = 0) {
    const dx = x - c.x;
    const dz = z - c.z;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    return Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad;
  }

  // Pushes a circle out of every collider it overlaps. Mutates pos.x / pos.z.
  resolve(pos, radius) {
    let hit = false;
    const list = this.query(pos.x, pos.z, radius + 3, _tmp);
    for (let pass = 0; pass < 2; pass++) {
      for (const c of list) {
        if (c.type === 'circle') {
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const min = radius + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min) {
            const d = Math.sqrt(d2) || 0.0001;
            const push = min - d;
            pos.x += (dx / d) * push;
            pos.z += (dz / d) * push;
            hit = true;
          }
        } else {
          // Transform into box space (rotation by -rot), clamp, push out.
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const lx = dx * c.cos - dz * c.sin;
          const lz = dx * c.sin + dz * c.cos;
          const cx = Math.max(-c.hw, Math.min(c.hw, lx));
          const cz = Math.max(-c.hd, Math.min(c.hd, lz));
          let ox = lx - cx;
          let oz = lz - cz;
          let d = Math.hypot(ox, oz);
          let nlx = lx;
          let nlz = lz;
          if (d < 1e-5) {
            // Center is inside the box: exit along the shallowest axis.
            const px = c.hw - Math.abs(lx);
            const pz = c.hd - Math.abs(lz);
            if (px < pz) nlx = Math.sign(lx || 1) * (c.hw + radius);
            else nlz = Math.sign(lz || 1) * (c.hd + radius);
          } else if (d < radius) {
            nlx = cx + (ox / d) * radius;
            nlz = cz + (oz / d) * radius;
          } else continue;
          // Back to world space (rotation by +rot).
          pos.x = c.x + nlx * c.cos + nlz * c.sin;
          pos.z = c.z - nlx * c.sin + nlz * c.cos;
          hit = true;
        }
      }
    }
    return hit;
  }

  // Does anything solid sit between A and B? Ignores `skipEnd` metres at B so a
  // target standing next to a tree isn't hidden by its own tree.
  segmentBlocked(ax, az, bx, bz, skipStart = 0.5, skipEnd = 0.8) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return false;
    const ux = dx / len;
    const uz = dz / len;
    const stamp = ++this.stamp;
    const step = this.size * 0.5;
    for (let s = 0; s <= len + step; s += step) {
      const px = ax + ux * Math.min(s, len);
      const pz = az + uz * Math.min(s, len);
      const ix = Math.floor(px / this.size);
      const iz = Math.floor(pz / this.size);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const cell = this.cells.get(this._key(ix + ox, iz + oz));
          if (!cell) continue;
          for (const c of cell) {
            if (c._q === stamp || c.disabled || c.noOcclude) continue;
            c._q = stamp;
            if (c.type === 'circle') {
              // Closest point on segment to circle center.
              const t = (c.x - ax) * ux + (c.z - az) * uz;
              if (t < skipStart || t > len - skipEnd) continue;
              const qx = ax + ux * t - c.x;
              const qz = az + uz * t - c.z;
              if (qx * qx + qz * qz < c.r * c.r * 0.8) return true;
            } else {
              for (let t = skipStart; t < len - skipEnd; t += 0.4) {
                if (this._boxPoint(c, ax + ux * t, az + uz * t)) return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  // Nearest circle collider of a given kind inside a ring around (x, z).
  treesInRing(x, z, rMin, rMax, kind = 'tree') {
    const out = [];
    const list = this.query(x, z, rMax, []);
    for (const c of list) {
      if (c.kind !== kind) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d >= rMin && d <= rMax) out.push(c);
    }
    return out;
  }
}

const _tmp = [];
