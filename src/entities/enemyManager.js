import * as THREE from 'three';
import { ENEMY_TYPES } from './types.js';

// Owns the live enemies of the active level: spawning, updates, hit tests for
// weapons, player/enemy separation and the encounter (Dread) audio layer.

const _sph = [];
const _oc = new THREE.Vector3();

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.lastBraam = -99;
    this.dread = 0;
    this.extraTypes = {};
  }

  register(type, cls) {
    this.extraTypes[type] = cls;
  }

  get list() {
    return this.game.levels.current?.enemies || [];
  }

  // Build enemies for a freshly built level.
  spawnFromSpecs(level) {
    for (const spec of level.enemySpecs) this.create(level, spec);
  }

  create(level, spec) {
    const Cls = this.extraTypes[spec.type] || ENEMY_TYPES[spec.type];
    if (!Cls) {
      console.warn(`[enemies] unknown type ${spec.type}`);
      return null;
    }
    const e = new Cls(this.game, level, spec);
    level.enemies.push(e);
    return e;
  }

  // Runtime spawn in the current level (debug, boss summons).
  spawn(type, pos, opts = {}) {
    const level = this.game.levels.current;
    return this.create(level, { type, pos: pos.clone(), ...opts });
  }

  // An enemy just noticed the player: stinger + raise the Dread layer.
  spotted(enemy, force = false) {
    const g = this.game;
    this.dread = Math.max(this.dread, 0.8);
    if (force || g.time - this.lastBraam > 22) {
      this.lastBraam = g.time;
      g.audio.play('braam', { gain: 0.7 });
    }
  }

  update(dt) {
    const g = this.game;
    const list = this.list;
    let hunting = 0;
    for (const e of list) {
      e.update(dt);
      if (!e.dead && ['chase', 'attack', 'notice', 'lunge', 'rise', 'hurt'].includes(e.state) && e.distToPlayer() < 25) hunting++;
    }
    // Separation: enemies don't stack, and the player can't walk through them.
    const p = g.player.position;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.cfg.static) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.cfg.static) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = a.cfg.radius + b.cfg.radius;
        if (d < min && d > 1e-4 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
          const push = (min - d) / 2;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
        }
      }
      if (['dormant'].includes(a.state)) continue;
      const dx = p.x - a.pos.x;
      const dz = p.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = a.cfg.radius + 0.3;
      if (d < min && d > 1e-4 && Math.abs(p.y - a.pos.y) < 1.5) {
        p.x += (dx / d) * (min - d);
        p.z += (dz / d) * (min - d);
      }
    }
    // Encounter layer follows how many things are hunting you.
    const target = hunting > 0 ? Math.min(1, 0.55 + hunting * 0.15) : 0;
    const rate = target > this.dread ? 2 : 0.12;
    this.dread += (target - this.dread) * Math.min(1, dt * rate);
    if (this.dread < 0.02) this.dread = 0;
    g.audio.setDread(this.dread);
  }

  // Nearest enemy hit sphere (or level damageable) along a ray within maxDist.
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const e of this.list) {
      if (e.dead) continue;
      for (const s of e.hitSpheres(_sph)) {
        const t = raySphere(origin, dir, s.center, s.r);
        if (t !== null && t < maxDist && (!best || t < best.dist)) {
          best = { target: e, dist: t, mult: s.mult, part: s.part, point: origin.clone().addScaledVector(dir, t) };
        }
      }
    }
    for (const d of this.game.levels.current?.damageables || []) {
      if (d.dead) continue;
      const t = raySphere(origin, dir, d.center, d.r);
      if (t !== null && t < maxDist && (!best || t < best.dist)) best = { target: d, dist: t, mult: 1, point: origin.clone().addScaledVector(dir, t) };
    }
    return best;
  }

  // Melee: nearest enemy whose hit sphere is within range and inside a cone.
  sweep(origin, dir, range, minDot) {
    let best = null;
    for (const e of this.list) {
      if (e.dead) continue;
      for (const s of e.hitSpheres(_sph)) {
        _oc.subVectors(s.center, origin);
        const d = Math.max(0, _oc.length() - s.r);
        if (d > range) continue;
        const dot = _oc.normalize().dot(dir);
        if (dot < minDot) continue;
        if (!best || d < best.dist) best = { target: e, dist: d, mult: Math.min(s.mult, 1.5), part: s.part, point: s.center.clone() };
      }
    }
    return best;
  }

  // Loud noise: nearby enemies come running.
  noise(pos, radius) {
    for (const e of this.list) {
      if (e.dead) continue;
      if (e.pos.distanceTo(pos) < radius) e.alert(pos);
    }
  }

  killAll() {
    for (const e of this.list) if (!e.dead && e.type !== 'mother') e.takeDamage(9999, null, null, 'debug');
  }
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t >= 0) return t;
  return cc < 0 ? 0 : null;
}
