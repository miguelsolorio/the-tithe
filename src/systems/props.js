import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hideRange } from '../world/batcher.js';
import { makeProp } from '../world/props/index.js';
import { INTERACTIVE } from '../world/props/interactive.js';
import { Marks, surfaceHit } from './propDamage.js';

// Interactive props: furniture that slides when walked into, tips over when
// sprinted into or hit hard, and shelves that spill books and jars when
// stabbed or shot. Props named in src/world/props/interactive.js are placed
// into the static batch like any other prop (level.props lists them); the
// first touch "wakes" one by collapsing its range in the batch and adding
// the real object to the scene, so untouched props cost no draw calls.
//
// Per-level state lives on the level (bodies, debris) so a cached level
// keeps its mess when you come back.

const UP = new THREE.Vector3(0, 1, 0);
const HALF_PI = Math.PI / 2;
const _box = new THREE.Box3();
const _c = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _pos = { x: 0, y: 0, z: 0 };
const _ground = { y: -Infinity, collider: null };
const _near = [];
const _contacts = [];

// Knock per weapon: shove (m/s for mass 1), topple chance, loose parts
// spilled, damage (props break at spec.hp) and the mark it leaves.
const HITS = {
  knife: { shove: 1.3, topple: 0.15, spill: [2, 4], damage: 1, mark: 'gouge', chips: [1, 3] },
  revolver: { shove: 3.2, topple: 0.65, spill: [1, 3], damage: 2, mark: 'hole', chips: [1, 2] },
  shotgun: { shove: 1.1, topple: 0.25, spill: [0, 2], damage: 0.5, mark: 'hole', chips: [0, 1] },
};
const CHIP_LIFE = 20;

export class Props {
  constructor(game) {
    this.game = game;
    this._sfxClock = 0;
    this._noiseClock = 0;
  }

  // ---------- Contact from movers (player, enemies) ----------

  // Called after physics.move. state: the mover's move state ({ pos, radius,
  // stepHeight, contacts }); (vx, vz) its velocity. Props it bumped get
  // shoved along; low props (a chair already on its side) get kicked even
  // though the mover walks over them.
  touch(state, vx, vz, sprinting = false, strength = 1) {
    const level = this.game.levels.current;
    if (!level?.props?.length) return;
    const speed = Math.hypot(vx, vz);
    if (speed < 0.3) return;
    const pos = state.pos;
    _near.length = 0;
    for (const c of state.contacts || []) if (c.prop && !_near.includes(c.prop)) _near.push(c.prop);
    // Low props the mover steps through.
    const r = state.radius + 0.08;
    for (const c of level.physics.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, _contacts)) {
      if (!c.prop || !c.enabled || _near.includes(c.prop) || c.type !== 'box') continue;
      if (c.max.y > pos.y + state.stepHeight || c.max.y < pos.y) continue;
      const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
      const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
      if ((pos.x - cx) ** 2 + (pos.z - cz) ** 2 < r * r) _near.push(c.prop);
    }
    for (const entry of _near) {
      if (entry.spec.spill) continue;
      const body = entry.body;
      _box.setFromObject(entry.obj);
      _box.getCenter(_c);
      let nx = _c.x - pos.x;
      let nz = _c.z - pos.z;
      const d = Math.hypot(nx, nz) || 1;
      nx /= d;
      nz /= d;
      // Only when moving into it.
      const approach = (vx * nx + vz * nz) / speed;
      if (approach < 0.25) continue;
      const b = body || this.wake(level, entry);
      const f = Math.min(1.1, (CONFIG.props.push / entry.spec.mass) * strength);
      // Carry it along at (a fraction of) the mover's velocity, pushed out
      // along the contact normal so it doesn't stay glued to the mover.
      const tx = (vx * 0.6 + nx * speed * 0.4) * f;
      const tz = (vz * 0.6 + nz * speed * 0.4) * f;
      const k = 0.35;
      b.vx += (tx - b.vx) * k;
      b.vz += (tz - b.vz) * k;
      // Off-centre pushes turn it (torque about Y: r x v).
      const rx = pos.x - _c.x;
      const rz = pos.z - _c.z;
      const spin = THREE.MathUtils.clamp((rz * vx - rx * vz) * 0.9 * f, -3, 3);
      b.spin += (spin - b.spin) * 0.3;
      if (sprinting && speed > CONFIG.props.toppleSpeed && entry.spec.topple && !b.toppled && !b.tip) {
        this.topple(b, vx / speed, vz / speed, 2.2);
      }
      this.activate(level, b);
    }
  }

  // ---------- Weapon hits ----------

  // A knife or bullet hit a collider. Returns true if it was an interactive prop.
  hit(collider, point, normal, dir, kind = 'knife') {
    const entry = collider?.prop;
    const level = this.game.levels.current;
    if (!entry || !level) return false;
    const H = HITS[kind] || HITS.knife;
    const p = new THREE.Vector3(point.x, point.y, point.z);
    if (entry.spec.spill) {
      const [lo, hi] = H.spill;
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (n > 0) this.spill(level, entry, p, normal, dir, n, kind);
      const surf = surfaceHit(entry.obj, p, dir, kind === 'knife' ? 0.12 : 0);
      if (surf) this.wear(level, entry, surf, dir, kind, H);
      return true;
    }
    const b = entry.body || this.wake(level, entry);
    const surf = surfaceHit(entry.obj, p, dir, kind === 'knife' ? 0.12 : 0);
    if (surf) {
      this.wear(level, entry, surf, dir, kind, H);
      if (entry.broken) return true;
    }
    const h = Math.hypot(dir.x, dir.z) || 1;
    const s = H.shove / entry.spec.mass;
    b.vx += (dir.x / h) * s;
    b.vz += (dir.z / h) * s;
    b.spin += (Math.random() - 0.5) * s * 2.5;
    if (entry.spec.topple && !b.toppled && !b.tip && entry.spec.mass <= 2.5 && Math.random() < H.topple) {
      this.topple(b, dir.x / h, dir.z / h, 2.6);
    }
    this.activate(level, b);
    return true;
  }

  // ---------- Wear and breaking ----------

  // Leave a mark where it was hit, knock splinters and chips off it, and
  // break it once it has taken enough.
  wear(level, entry, surf, dir, kind, H) {
    const { point, normal, mesh } = surf;
    const parent = entry.body ? entry.obj : level.group;
    entry.marks ||= new Marks(parent);
    if (H.mark === 'gouge') {
      // Slash across the swing: the camera's right vector laid on the surface.
      const right = _v.set(1, 0, 0).applyQuaternion(this.game.camera.quaternion).applyAxisAngle(normal, (Math.random() - 0.5) * 0.9);
      entry.marks.add('gouge', mesh, point, normal, right, 0.16 + Math.random() * 0.1, 0.05 + Math.random() * 0.025, 0.03);
      if (Math.random() < 0.4) entry.marks.add('split', mesh, point, normal, right.applyAxisAngle(normal, (Math.random() - 0.5) * 1.2), 0.16 + Math.random() * 0.12, 0.04, 0.03);
    } else {
      const s = kind === 'shotgun' ? 0.045 + Math.random() * 0.025 : 0.08 + Math.random() * 0.035;
      entry.marks.add('hole', mesh, point, normal, null, s, s, 0.12);
    }
    this.game.particles.impact(point, normal, 'wood', kind === 'shotgun' ? 3 : 7);
    entry.damage = (entry.damage || 0) + H.damage;
    const hp = entry.spec.hp || 0;
    // More chips the more worn it is.
    const [lo, hi] = H.chips;
    const worn = hp ? Math.min(1, entry.damage / hp) : 0.3;
    const n = lo + Math.floor(Math.random() * (hi - lo + 1) + worn * 1.5);
    for (let i = 0; i < n; i++) this.chip(level, entry, point, normal, mesh.material, 0.025 + worn * 0.03);
    if (hp && entry.damage >= hp && entry.body) this.breakProp(level, entry, dir);
  }

  // A splinter of wood flicked off the surface.
  chip(level, entry, point, normal, material, size) {
    const w = size * (0.6 + Math.random() * 0.9);
    const geo = new THREE.BoxGeometry(w, size * 0.25, size * (0.3 + Math.random() * 0.5));
    const m = new THREE.Mesh(geo, material);
    m.position.copy(point).addScaledVector(normal, 0.02);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    level.group.add(m);
    geo.computeBoundingBox();
    this.addDebris(level, {
      obj: m,
      kind: 'chip',
      ignore: entry.colliders,
      half: geo.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5),
      v: new THREE.Vector3(normal.x * (1 + Math.random() * 1.5) + (Math.random() - 0.5), 0.8 + Math.random() * 1.4, normal.z * (1 + Math.random() * 1.5) + (Math.random() - 0.5)),
      w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
      expire: this.game.time + CHIP_LIFE,
    });
  }

  // Worn out: a chair gives way into the broken chair; anything else bursts
  // into planks.
  breakProp(level, entry, dir) {
    const obj = entry.obj;
    _box.setFromObject(obj);
    _box.getCenter(_c);
    const into = entry.spec.breaksInto;
    if (into && INTERACTIVE[into]) {
      const next = makeProp(into, { seed: Math.floor(Math.random() * 1e6) });
      next.position.copy(obj.position);
      next.quaternion.copy(obj.quaternion);
      next.traverse((m) => {
        if (m.isMesh) m.receiveShadow = true;
      });
      level.group.add(next);
      next.updateMatrixWorld(true);
      if (entry.marks) next.attach(entry.marks.mesh);
      obj.removeFromParent();
      entry.obj = next;
      entry.spec = INTERACTIVE[into];
      entry.damage = 0;
      entry.body.obj = next;
      entry.body.vx += (dir.x || 0) * 0.8;
      entry.body.vz += (dir.z || 0) * 0.8;
      this.activate(level, entry.body);
      this.game.audio.play('propBreak', { pos: _c.clone(), gain: 0.7 });
      this.game.particles.impact(_c, UP, 'wood', 14);
      this.noise(_c, 12, true);
      return;
    }
    // Planks in the prop's own wood (its biggest mesh).
    let material = null;
    let most = -1;
    obj.traverse((m) => {
      if (m.isMesh && !m.userData.marks && m.geometry.attributes.position.count > most) {
        most = m.geometry.attributes.position.count;
        material = m.material;
      }
    });
    const size = _box.getSize(new THREE.Vector3());
    const big = Math.max(size.x, size.y, size.z);
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const len = big * (0.35 + Math.random() * 0.45);
      const geo = new THREE.BoxGeometry(len, 0.02 + Math.random() * 0.015, 0.05 + Math.random() * 0.06);
      const m = new THREE.Mesh(geo, material);
      m.position.set(_box.min.x + Math.random() * size.x, _box.min.y + Math.random() * size.y, _box.min.z + Math.random() * size.z);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.receiveShadow = true;
      level.group.add(m);
      const out = _v.subVectors(m.position, _c).setY(0).normalize();
      geo.computeBoundingBox();
      this.addDebris(level, {
        obj: m,
        kind: 'plank',
        ignore: entry.colliders,
        half: geo.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5),
        v: new THREE.Vector3(out.x * (0.8 + Math.random() * 1.5) + (dir.x || 0), 1 + Math.random() * 1.5, out.z * (0.8 + Math.random() * 1.5) + (dir.z || 0)),
        w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
      });
    }
    for (let i = 0; i < 6; i++) this.chip(level, entry, _c, _v.set(Math.random() - 0.5, 0.5, Math.random() - 0.5).normalize(), material, 0.05);
    entry.marks?.dispose();
    entry.marks = null;
    obj.removeFromParent();
    entry.broken = true;
    for (const c of entry.colliders) {
      c.enabled = false;
      delete c.prop;
      level.physics.update(c);
    }
    level.props.splice(level.props.indexOf(entry), 1);
    level.markNavDirty();
    this.game.audio.play('propBreak', { pos: _c.clone(), gain: 1 });
    this.game.particles.impact(_c, UP, 'dust', 16);
    this.game.particles.impact(_c, UP, 'wood', 18);
    this.noise(_c, 14, true);
    const p = this.game.player.position;
    if (Math.hypot(p.x - _c.x, p.z - _c.z) < 3) this.game.player.shake = Math.max(this.game.player.shake, 0.15);
  }

  addDebris(level, d) {
    const list = (level.debris ||= []);
    list.push({ grounded: false, rest: false, age: 0, ...d });
    while (list.length > CONFIG.props.debrisCap) {
      // Oldest settled chips go first, then any settled piece.
      let i = list.findIndex((x) => x.rest && x.kind === 'chip');
      if (i < 0) i = list.findIndex((x) => x.rest);
      const [old] = list.splice(i < 0 ? 0 : i, 1);
      this.dispose(old);
    }
  }

  // ---------- Bodies ----------

  // Swap a batched prop for its live object.
  wake(level, entry) {
    const obj = entry.obj;
    for (const e of obj.userData.batch || []) hideRange(e.mesh, e.start, e.count);
    obj.userData.batch = [];
    obj.traverse((m) => {
      if (m.isMesh) m.receiveShadow = true;
    });
    level.group.add(obj);
    obj.updateMatrixWorld(true);
    // Extra authored boxes can't follow a spinning prop: keep one AABB.
    for (let i = 1; i < entry.colliders.length; i++) entry.colliders[i].enabled = false;
    const body = { entry, obj, vx: 0, vz: 0, spin: 0, toppled: entry.fallen, tip: null, active: false, scrape: 0 };
    entry.body = body;
    return body;
  }

  activate(level, b) {
    if (b.active) return;
    b.active = true;
    (level.propBodies ||= []).push(b);
  }

  // Tip a body over onto its side, falling towards (dx, dz).
  topple(b, dx, dz, w0) {
    const obj = b.obj;
    _box.setFromObject(obj);
    _box.getCenter(_c);
    const hx = (_box.max.x - _box.min.x) / 2;
    const hz = (_box.max.z - _box.min.z) / 2;
    const reach = Math.abs(dx) * hx + Math.abs(dz) * hz;
    b.tip = {
      pivot: new THREE.Vector3(_c.x + dx * reach, _box.min.y, _c.z + dz * reach),
      axis: new THREE.Vector3(dz, 0, -dx).normalize(), // up x dir: tips the top towards dir
      p0: obj.position.clone(),
      q0: obj.quaternion.clone(),
      a: 0,
      w: w0,
      bounced: false,
    };
    this.game.audio.play('creak', { pos: _c.clone(), gain: 0.25 });
  }

  update(dt) {
    const level = this.game.levels.current;
    if (!level) return;
    this._sfxClock -= dt;
    this._noiseClock -= dt;
    const bodies = level.propBodies;
    if (bodies?.length) {
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        if (!this.step(level, b, dt)) {
          b.active = false;
          bodies.splice(i, 1);
          level.markNavDirty();
        }
      }
    }
    if (level.debris?.length) this.updateDebris(level, dt);
  }

  // Integrate one body. Returns false once it has come to rest.
  step(level, b, dt) {
    const obj = b.obj;
    const entry = b.entry;
    if (entry.broken) return false;
    const P = CONFIG.props;
    // Friction: exponential drag plus a constant stop so things settle.
    const drag = Math.exp(-P.friction * dt);
    b.vx *= drag;
    b.vz *= drag;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const dec = Math.min(sp, P.stop * dt) / sp;
      b.vx -= b.vx * dec;
      b.vz -= b.vz * dec;
    }
    b.spin *= Math.exp(-P.spinDrag * dt);
    const dx = b.vx * dt;
    const dz = b.vz * dt;
    const t = b.tip;
    if (t) {
      t.p0.x += dx;
      t.p0.z += dz;
      t.pivot.x += dx;
      t.pivot.z += dz;
      // Gravity torque grows as it leans.
      t.w += P.tipGravity * Math.sin(t.a + 0.2) * dt;
      t.a += t.w * dt;
      if (t.a >= HALF_PI) {
        t.a = HALF_PI;
        if (t.w > 1.2) {
          this.landed(level, obj, Math.min(1, t.w / 5), entry.spec.mass);
          t.w = -t.w * 0.22;
        } else {
          b.tip = null;
          b.toppled = true;
        }
      }
      _q.setFromAxisAngle(t.axis, Math.max(0, t.a));
      obj.quaternion.copy(_q).multiply(t.q0);
      _p.copy(t.p0).sub(t.pivot).applyQuaternion(_q);
      obj.position.copy(t.pivot).add(_p);
    } else {
      obj.position.x += dx;
      obj.position.z += dz;
      if (Math.abs(b.spin) > 0.01) obj.rotateOnWorldAxis(UP, b.spin * dt);
    }
    obj.updateMatrixWorld(true);

    // Keep out of walls and other furniture.
    _box.setFromObject(obj);
    _box.getCenter(_c);
    const hx = (_box.max.x - _box.min.x) / 2;
    const hz = (_box.max.z - _box.min.z) / 2;
    const radius = Math.max(0.12, Math.min(hx, hz) * 0.85);
    _pos.x = _c.x;
    _pos.y = _box.min.y;
    _pos.z = _c.z;
    _contacts.length = 0;
    level.physics.resolveCircle(_pos, radius, Math.min(1.4, _box.max.y - _box.min.y), 0.2, entry.colliders, _contacts);
    const cx = _pos.x - _c.x;
    const cz = _pos.z - _c.z;
    if (cx || cz) {
      obj.position.x += cx;
      obj.position.z += cz;
      if (t) {
        t.p0.x += cx;
        t.p0.z += cz;
        t.pivot.x += cx;
        t.pivot.z += cz;
      }
      _box.translate(_v.set(cx, 0, cz));
      obj.updateMatrixWorld(true);
      // Kill the velocity going into the wall, knock on to other props.
      const d = Math.hypot(cx, cz);
      const nx = cx / d;
      const nz = cz / d;
      const into = b.vx * nx + b.vz * nz;
      if (into < 0) {
        for (const c of _contacts) {
          if (c.prop && c.prop !== entry && !c.prop.spec.spill) {
            const o = c.prop.body || this.wake(level, c.prop);
            o.vx -= nx * into * 0.6 * (entry.spec.mass / c.prop.spec.mass);
            o.vz -= nz * into * 0.6 * (entry.spec.mass / c.prop.spec.mass);
            this.activate(level, o);
          }
        }
        b.vx -= nx * into * 1.15;
        b.vz -= nz * into * 1.15;
        if (-into > 1.5) this.sfx('propHit', _c, Math.min(1, -into / 4));
      }
    }

    // Collider follows the object.
    const col = entry.colliders[0];
    col.min.x = _box.min.x;
    col.min.y = _box.min.y;
    col.min.z = _box.min.z;
    col.max.x = _box.max.x;
    col.max.y = _box.max.y;
    col.max.z = _box.max.z;
    level.physics.update(col);

    // Scraping along the floor.
    const speed = Math.hypot(b.vx, b.vz);
    b.scrape -= dt;
    if (speed > 0.45 && b.scrape <= 0) {
      b.scrape = 0.22;
      this.game.audio.play('propScrape', { pos: _c.clone(), gain: Math.min(1, speed / 3) * Math.min(1, 0.5 + entry.spec.mass * 0.2) });
      this.noise(_c, 5);
    }
    return !!b.tip || speed > 0.03 || Math.abs(b.spin) > 0.05;
  }

  // Something heavy hit the floor.
  landed(level, obj, amount, mass) {
    _box.setFromObject(obj);
    _box.getCenter(_c);
    _c.y = _box.min.y + 0.05;
    this.game.audio.play('propTopple', { pos: _c.clone(), gain: 0.4 + amount * 0.6 * Math.min(1.5, 0.6 + mass * 0.3) });
    this.game.particles.impact(_c, UP, 'dust', 10);
    this.noise(_c, 12, true);
    const p = this.game.player.position;
    const d = Math.hypot(p.x - _c.x, p.z - _c.z);
    if (d < 4) this.game.player.shake = Math.max(this.game.player.shake, 0.12 * amount * (1 - d / 4));
  }

  noise(pos, radius, force = false) {
    if (!force && this._noiseClock > 0) return;
    this._noiseClock = 0.8;
    this.game.enemies.noise(pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), radius);
  }

  sfx(name, pos, gain) {
    if (this._sfxClock > 0) return;
    this._sfxClock = 0.05;
    this.game.audio.play(name, { pos: new THREE.Vector3(pos.x, pos.y, pos.z), gain });
  }

  // ---------- Loose parts ----------

  // Index a shelf's tagged loose parts (books, jars) by piece, with world centres.
  pieces(entry) {
    if (entry.pieces) return entry.pieces;
    const byTag = new Map();
    const where = new Map((entry.obj.userData.batch || []).map((e) => [e.src, e]));
    entry.obj.updateMatrixWorld(true);
    entry.obj.traverse((m) => {
      if (!m.isMesh || !m.userData.parts) return;
      const pos = m.geometry.attributes.position;
      for (const part of m.userData.parts) {
        let piece = byTag.get(part.tag);
        if (!piece) byTag.set(part.tag, (piece = { kind: part.tag.kind, bits: [], box: new THREE.Box3(), center: new THREE.Vector3(), gone: false }));
        piece.bits.push({ mesh: m, part, batch: where.get(m) });
        for (let i = part.v0; i < part.v0 + part.vn; i++) piece.box.expandByPoint(_v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
      }
    });
    entry.pieces = [...byTag.values()];
    for (const p of entry.pieces) p.box.getCenter(p.center);
    return entry.pieces;
  }

  // Knock the n pieces nearest the hit point off the shelf.
  spill(level, entry, point, normal, dir, n, kind) {
    const near = this.pieces(entry)
      .filter((p) => !p.gone && p.center.distanceToSquared(point) < 0.5 * 0.5)
      .sort((a, b) => a.center.distanceToSquared(point) - b.center.distanceToSquared(point))
      .slice(0, n);
    if (!near.length) return;
    // Out of the shelf face, back towards the shooter.
    let ox = normal?.x ?? -dir.x;
    let oz = normal?.z ?? -dir.z;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol;
    oz /= ol;
    const force = kind === 'knife' ? 1 : 1.5;
    for (const piece of near) {
      piece.gone = true;
      const obj = this.detach(piece);
      level.group.add(obj);
      const out = (0.7 + Math.random() * 1.2) * force;
      this.addDebris(level, {
        obj,
        kind: piece.kind,
        ignore: entry.colliders,
        half: piece.box.getSize(new THREE.Vector3()).multiplyScalar(0.5),
        v: new THREE.Vector3(ox * out + (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 1.1, oz * out + (Math.random() - 0.5) * 0.8),
        w: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10),
      });
    }
    this.game.particles.impact(point, normal, 'dust', 6);
    this.noise(point, 6);
  }

  // Hide a piece in its shelf and rebuild it as its own little mesh.
  detach(piece) {
    const group = new THREE.Group();
    group.position.copy(piece.center);
    for (const { mesh, part, batch } of piece.bits) {
      if (batch) hideRange(batch.mesh, batch.start + part.v0, part.vn);
      else hideRange(mesh, part.v0, part.vn);
      const src = mesh.geometry;
      const geo = new THREE.BufferGeometry();
      _m.copy(mesh.matrixWorld);
      for (const name of ['position', 'normal', 'uv']) {
        const a = src.attributes[name];
        if (!a) continue;
        geo.setAttribute(name, new THREE.BufferAttribute(a.array.slice(part.v0 * a.itemSize, (part.v0 + part.vn) * a.itemSize), a.itemSize));
      }
      const idx = src.index.array.slice(part.i0, part.i0 + part.in);
      for (let i = 0; i < idx.length; i++) idx[i] -= part.v0;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.applyMatrix4(_m);
      geo.translate(-piece.center.x, -piece.center.y, -piece.center.z);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mesh.material);
      m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }

  updateDebris(level, dt) {
    const list = level.debris;
    const physics = level.physics;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (d.expire && this.game.time > d.expire) {
        list.splice(i, 1);
        this.dispose(d);
        continue;
      }
      if (d.rest) continue;
      d.age += dt;
      const o = d.obj;
      d.v.y -= 9.8 * dt;
      o.position.addScaledVector(d.v, dt);
      const wl = d.w.length();
      if (wl > 0.01) o.rotateOnWorldAxis(_v.copy(d.w).divideScalar(wl), wl * dt);
      o.updateMatrix();
      // Vertical half-extent of the rotated piece.
      const e = o.matrix.elements;
      const ext = Math.abs(e[1]) * d.half.x + Math.abs(e[5]) * d.half.y + Math.abs(e[9]) * d.half.z;
      // Floor first, so a fast fall never dips the piece below it (a floor
      // slab would then count as a wall and fling it sideways).
      _ground.y = -Infinity;
      physics.groundAt(o.position.x, o.position.z, o.position.y + ext, _ground);
      const floor = _ground.y === -Infinity ? o.position.y - ext - 1 : _ground.y;
      const onFloor = o.position.y - ext <= floor;
      if (onFloor) o.position.y = floor + ext;
      // Walls (not the shelf it came from).
      const r = Math.min(0.12, Math.max(d.half.x, d.half.z));
      _pos.x = o.position.x;
      _pos.y = o.position.y - ext;
      _pos.z = o.position.z;
      physics.resolveCircle(_pos, r, ext * 2, 0.06, d.ignore);
      const cx = _pos.x - o.position.x;
      const cz = _pos.z - o.position.z;
      if (cx || cz) {
        o.position.x = _pos.x;
        o.position.z = _pos.z;
        const l = Math.hypot(cx, cz);
        const into = (d.v.x * cx + d.v.z * cz) / l;
        if (into < 0) {
          d.v.x -= (cx / l) * into * 1.4;
          d.v.z -= (cz / l) * into * 1.4;
        }
      }
      if (onFloor) {
        if (d.v.y < -1.3) {
          if (!d.grounded && d.kind === 'jar' && -d.v.y > 2.5) {
            this.shatter(level, d, i);
            continue;
          }
          if (d.kind !== 'chip') this.sfx(d.kind === 'can' ? 'canFall' : 'bookFall', o.position, Math.min(1, -d.v.y / 5) * (d.kind === 'plank' ? 1.3 : 1));
          d.v.y *= -0.28;
          d.v.x *= 0.6;
          d.v.z *= 0.6;
          d.w.multiplyScalar(0.45);
          d.grounded = true;
        } else {
          d.grounded = true;
          d.v.y = 0;
          const k = Math.exp(-7 * dt);
          d.v.x *= k;
          d.v.z *= k;
          d.w.multiplyScalar(Math.exp(-9 * dt));
          // Settle onto its broadest face.
          const flat = this.flatten(d, o, dt);
          if (flat && Math.hypot(d.v.x, d.v.z) < 0.03 && d.w.length() < 0.1) {
            d.rest = true;
            o.updateMatrix();
            o.matrixAutoUpdate = false;
          }
        }
      }
      if (o.position.y < -150) {
        list.splice(i, 1);
        this.dispose(d);
      }
    }
  }

  // Ease a grounded piece towards lying on its broadest face. True when flat.
  flatten(d, o, dt) {
    const h = d.half;
    const axis = h.x <= h.y && h.x <= h.z ? 0 : h.y <= h.z ? 1 : 2;
    _v.set(0, 0, 0).setComponent(axis, 1).applyQuaternion(o.quaternion);
    if (_v.y < 0) _v.negate();
    if (_v.y > 0.999) return true;
    _q.setFromUnitVectors(_v, UP).multiply(o.quaternion);
    o.quaternion.slerp(_q, Math.min(1, dt * 10));
    return false;
  }

  shatter(level, d, i) {
    const p = d.obj.position;
    this.game.particles.impact(p, UP, 'splash', 10);
    this.game.audio.play('glassBreak', { pos: p.clone(), gain: 0.8 });
    this.noise(p, 8, true);
    level.debris.splice(i, 1);
    this.dispose(d);
  }

  dispose(d) {
    d.obj.removeFromParent();
    d.obj.traverse((m) => m.isMesh && m.geometry.dispose());
  }
}
