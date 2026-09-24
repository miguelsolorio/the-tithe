// Collision world for a level: axis-aligned boxes, vertical cylinders, ramps
// and heightfields in a 2D spatial hash. Movers are vertical capsules treated
// as circles in XZ with a height band; anything whose top is within step
// height of the feet counts as floor (so stairs just work), anything above
// the head is ignored.
//
// Collider shapes (all in world space):
//   { type: 'box',    min: {x,y,z}, max: {x,y,z} }
//   { type: 'cyl',    x, z, r, y0, y1 }
//   { type: 'ramp',   min, max, axis: 'x'|'z', dir: 1|-1 }   top rises from min.y to max.y along +axis (dir 1) or -axis (dir -1)
//   { type: 'height', min: {x,z}, max: {x,z}, fn(x, z) -> y }  ground only
// Common fields: enabled (default true), walkable (default true: the top can
// be stood on), solid (default true: blocks movement), surface (footsteps),
// shootable (default true: stops bullets), tag.

const CELL = 4;
const EPS = 1e-6;

export class Physics {
  constructor() {
    this.colliders = [];
    this.cells = new Map();
    this.stamp = 0;
  }

  clear() {
    this.colliders = [];
    this.cells.clear();
  }

  add(c) {
    c.enabled = c.enabled ?? true;
    c.walkable = c.walkable ?? true;
    c.solid = c.solid ?? true;
    c.shootable = c.shootable ?? true;
    c._stamp = 0;
    this._bounds(c);
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  remove(c) {
    const i = this.colliders.indexOf(c);
    if (i < 0) return;
    this.colliders.splice(i, 1);
    this._forCells(c._b, (list) => {
      const j = list.indexOf(c);
      if (j >= 0) list.splice(j, 1);
    });
  }

  // Call after moving a collider (e.g. a sliding bookshelf).
  update(c) {
    this._forCells(c._b, (list) => {
      const j = list.indexOf(c);
      if (j >= 0) list.splice(j, 1);
    });
    this._bounds(c);
    this._insert(c);
  }

  _bounds(c) {
    if (c.type === 'cyl') c._b = { x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r };
    else c._b = { x0: c.min.x, x1: c.max.x, z0: c.min.z, z1: c.max.z };
  }

  _forCells(b, fn, create = false) {
    const cx0 = Math.floor(b.x0 / CELL);
    const cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL);
    const cz1 = Math.floor(b.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 73856093 + cz * 19349663;
        let list = this.cells.get(k);
        if (!list) {
          if (!create) continue;
          list = [];
          this.cells.set(k, list);
        }
        fn(list);
      }
    }
  }

  _insert(c) {
    this._forCells(c._b, (list) => list.push(c), true);
  }

  // Colliders whose XZ bounds overlap the rectangle. Reuses one array.
  query(x0, z0, x1, z1, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    this._forCells({ x0, x1, z0, z1 }, (list) => {
      for (const c of list) {
        if (c._stamp === s || !c.enabled) continue;
        c._stamp = s;
        const b = c._b;
        if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
        out.push(c);
      }
    });
    return out;
  }

  // Height of the collider's top surface at (x, z), or -Infinity if (x, z) is outside it.
  static topAt(c, x, z) {
    if (c.type === 'box') {
      if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) return -Infinity;
      return c.max.y;
    }
    if (c.type === 'cyl') {
      const dx = x - c.x;
      const dz = z - c.z;
      return dx * dx + dz * dz <= c.r * c.r ? c.y1 : -Infinity;
    }
    if (c.type === 'ramp') {
      if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) return -Infinity;
      return rampTop(c, x, z);
    }
    if (c.type === 'height') {
      if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) return -Infinity;
      return c.fn(x, z);
    }
    return -Infinity;
  }

  static bottomOf(c) {
    if (c.type === 'cyl') return c.y0;
    if (c.type === 'height') return -Infinity;
    return c.min.y;
  }

  // Highest walkable surface at (x, z) that is at or below maxY.
  groundAt(x, z, maxY, out = { y: -Infinity, collider: null }) {
    out.y = -Infinity;
    out.collider = null;
    const list = this.query(x - 0.01, z - 0.01, x + 0.01, z + 0.01, this._tmpList || (this._tmpList = []));
    for (const c of list) {
      if (!c.walkable) continue;
      const top = Physics.topAt(c, x, z);
      if (top <= maxY + EPS && top > out.y) {
        out.y = top;
        out.collider = c;
      }
    }
    return out;
  }

  // Resolve a circle (feet at pos.y, given height) against solid colliders
  // in XZ. Mutates pos. Returns true if anything was hit.
  resolveCircle(pos, radius, height, stepHeight) {
    const feet = pos.y;
    const lo = feet + stepHeight;
    const hi = feet + height;
    let hit = false;
    const list = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, this._tmpList2 || (this._tmpList2 = []));
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of list) {
        if (!c.solid || !c.enabled || c.type === 'height') continue;
        const bottom = Physics.bottomOf(c);
        if (bottom >= hi) continue;
        if (c.type === 'cyl') {
          if (c.y1 <= lo) continue;
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const d2 = dx * dx + dz * dz;
          const rr = radius + c.r;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || EPS;
          const push = rr - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
          hit = moved = true;
          continue;
        }
        // Box or ramp: closest point in XZ.
        const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
        const top = c.type === 'ramp' ? rampTop(c, cx, cz) : c.max.y;
        if (top <= lo) continue;
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > EPS) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // Centre is inside the box: push out along the shallowest axis.
          const px0 = pos.x - c.min.x;
          const px1 = c.max.x - pos.x;
          const pz0 = pos.z - c.min.z;
          const pz1 = c.max.z - pos.z;
          const m = Math.min(px0, px1, pz0, pz1);
          if (m === px0) pos.x = c.min.x - radius;
          else if (m === px1) pos.x = c.max.x + radius;
          else if (m === pz0) pos.z = c.min.z - radius;
          else pos.z = c.max.z + radius;
        }
        hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  // Move a grounded circle mover by (dx, dz) with sub-steps, collision and
  // ground snapping. state: { pos, vy, grounded, radius, height, stepHeight }.
  // Returns the ground collider (or null).
  move(state, dx, dz, dt, gravity = 22) {
    const pos = state.pos;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (state.radius * 0.5)));
    const g = this._g || (this._g = { y: 0, collider: null });
    for (let i = 0; i < steps; i++) {
      pos.x += dx / steps;
      pos.z += dz / steps;
      this.resolveCircle(pos, state.radius, state.height, state.stepHeight);
      // Step up onto anything within step height.
      this.groundAt(pos.x, pos.z, pos.y + state.stepHeight, g);
      if (g.y > pos.y && state.grounded) pos.y = g.y;
    }
    // Vertical: fall under gravity, land on the ground.
    this.groundAt(pos.x, pos.z, pos.y + state.stepHeight, g);
    const ground = g.y;
    if (state.grounded && pos.y - ground < 0.35 && ground > -Infinity) {
      pos.y = ground; // stick to the floor going down stairs
      state.vy = 0;
    } else {
      state.vy -= gravity * dt;
      pos.y += state.vy * dt;
      if (pos.y <= ground) {
        pos.y = ground;
        state.vy = 0;
        state.grounded = true;
      } else state.grounded = false;
    }
    if (pos.y < -200) pos.y = -200;
    state.groundCollider = g.collider;
    return g.collider;
  }

  // Nearest hit along a ray. dir must be normalized. filter(c) -> bool.
  raycast(origin, dir, maxDist, filter = null, out = {}) {
    out.dist = Infinity;
    out.collider = null;
    out.normal = out.normal || { x: 0, y: 0, z: 0 };
    // 2D DDA over hash cells.
    let cx = Math.floor(origin.x / CELL);
    let cz = Math.floor(origin.z / CELL);
    const stepX = dir.x > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dir.x) > EPS ? CELL / Math.abs(dir.x) : Infinity;
    const tDeltaZ = Math.abs(dir.z) > EPS ? CELL / Math.abs(dir.z) : Infinity;
    let tMaxX = Math.abs(dir.x) > EPS ? ((dir.x > 0 ? (cx + 1) * CELL : cx * CELL) - origin.x) / dir.x : Infinity;
    let tMaxZ = Math.abs(dir.z) > EPS ? ((dir.z > 0 ? (cz + 1) * CELL : cz * CELL) - origin.z) / dir.z : Infinity;
    const s = ++this.stamp;
    let tCell = 0;
    const n = { x: 0, y: 0, z: 0 };
    for (let guard = 0; guard < 400 && tCell <= maxDist; guard++) {
      const list = this.cells.get(cx * 73856093 + cz * 19349663);
      if (list) {
        for (const c of list) {
          if (c._stamp === s || !c.enabled || !c.shootable) continue;
          c._stamp = s;
          if (filter && !filter(c)) continue;
          const t = rayCollider(c, origin, dir, maxDist, n);
          if (t < out.dist) {
            out.dist = t;
            out.collider = c;
            out.normal.x = n.x;
            out.normal.y = n.y;
            out.normal.z = n.z;
          }
        }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (out.dist <= tNext) break;
      tCell = tNext;
      if (tMaxX < tMaxZ) {
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        cz += stepZ;
        tMaxZ += tDeltaZ;
      }
    }
    if (out.dist === Infinity || out.dist > maxDist) return null;
    out.point = out.point || { x: 0, y: 0, z: 0 };
    out.point.x = origin.x + dir.x * out.dist;
    out.point.y = origin.y + dir.y * out.dist;
    out.point.z = origin.z + dir.z * out.dist;
    return out;
  }

  // True if nothing solid blocks the segment a -> b.
  lineOfSight(a, b, filter = null) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < EPS) return true;
    const dir = this._losDir || (this._losDir = { x: 0, y: 0, z: 0 });
    dir.x = dx / d;
    dir.y = dy / d;
    dir.z = dz / d;
    return !this.raycast(a, dir, d - 0.05, filter || losFilter, this._losOut || (this._losOut = {}));
  }
}

const losFilter = (c) => c.solid && !c.seeThrough;

function rampTop(c, x, z) {
  const a = c.axis === 'x' ? (x - c.min.x) / (c.max.x - c.min.x || 1) : (z - c.min.z) / (c.max.z - c.min.z || 1);
  const t = c.dir === -1 ? 1 - a : a;
  return c.min.y + (c.max.y - c.min.y) * Math.max(0, Math.min(1, t));
}

function rayBox(minx, miny, minz, maxx, maxy, maxz, o, d, maxDist, n) {
  let tmin = 0;
  let tmax = maxDist;
  let axis = -1;
  let sign = 0;
  const lo = [minx, miny, minz];
  const hi = [maxx, maxy, maxz];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < EPS) {
      if (oo[i] < lo[i] || oo[i] > hi[i]) return Infinity;
      continue;
    }
    const inv = 1 / dd[i];
    let t0 = (lo[i] - oo[i]) * inv;
    let t1 = (hi[i] - oo[i]) * inv;
    let s = -1;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
      s = 1;
    }
    if (t0 > tmin) {
      tmin = t0;
      axis = i;
      sign = s;
    }
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return Infinity;
  }
  if (axis < 0) {
    // Origin inside the box.
    n.x = -d.x;
    n.y = -d.y;
    n.z = -d.z;
    return 0;
  }
  n.x = axis === 0 ? sign : 0;
  n.y = axis === 1 ? sign : 0;
  n.z = axis === 2 ? sign : 0;
  return tmin;
}

function rayCollider(c, o, d, maxDist, n) {
  if (c.type === 'box') return rayBox(c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z, o, d, maxDist, n);
  if (c.type === 'cyl') {
    // Infinite cylinder in XZ, clipped to [y0, y1].
    const ox = o.x - c.x;
    const oz = o.z - c.z;
    const a = d.x * d.x + d.z * d.z;
    if (a < EPS) {
      if (ox * ox + oz * oz > c.r * c.r) return Infinity;
      const t = d.y > 0 ? (c.y0 - o.y) / d.y : (c.y1 - o.y) / d.y;
      n.x = 0;
      n.y = d.y > 0 ? -1 : 1;
      n.z = 0;
      return t >= 0 && t <= maxDist ? t : Infinity;
    }
    const b = 2 * (ox * d.x + oz * d.z);
    const cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return Infinity;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > maxDist) return cc < 0 ? 0 : Infinity;
    const y = o.y + d.y * t;
    if (y < c.y0 || y > c.y1) return Infinity;
    const hx = ox + d.x * t;
    const hz = oz + d.z * t;
    const l = Math.hypot(hx, hz) || 1;
    n.x = hx / l;
    n.y = 0;
    n.z = hz / l;
    return t;
  }
  if (c.type === 'ramp') {
    // Only the sloped top: plane through the low and high edges.
    const t0 = rayBox(c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z, o, d, maxDist, n);
    if (t0 === Infinity) return Infinity;
    // March a little inside the box to find the slope crossing.
    for (let t = t0; t <= maxDist; t += 0.1) {
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      if (x < c.min.x - 0.01 || x > c.max.x + 0.01 || z < c.min.z - 0.01 || z > c.max.z + 0.01) break;
      if (o.y + d.y * t <= rampTop(c, x, z)) {
        n.x = 0;
        n.y = 1;
        n.z = 0;
        return t;
      }
    }
    return Infinity;
  }
  if (c.type === 'height') {
    if (d.y >= 0) return Infinity;
    for (let t = 0; t <= maxDist; t += 0.4) {
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue;
      if (o.y + d.y * t <= c.fn(x, z)) {
        n.x = 0;
        n.y = 1;
        n.z = 0;
        return t;
      }
    }
    return Infinity;
  }
  return Infinity;
}
