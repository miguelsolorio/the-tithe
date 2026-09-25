import * as THREE from 'three';
import { damp, wrapAngle, clamp } from '../core/utils.js';

// Base enemy: perception, state machine (idle -> notice -> chase -> attack ->
// hurt -> dead), nav-grid pathing, collision and damage. Each type passes a
// config and may override hooks. The look and in-place animation come from a
// CreatureModel (src/entities/models).

// Creature models load lazily so a broken or missing model module degrades to
// stand-ins instead of stopping the game from loading.
const modelMods = import.meta.glob('./models/index.js');
let buildCreature = null;
export const creaturesReady = (async () => {
  try {
    const m = await modelMods['./models/index.js']?.();
    buildCreature = m?.buildCreature || null;
  } catch (e) {
    console.warn('[enemy] creature models unavailable, using stand-ins:', e.message);
  }
})();
export const getCreatureBuilder = () => buildCreature;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _pp = new THREE.Vector3();

export const BASE = {
  health: 80,
  walkSpeed: 1.2,
  runSpeed: 3.2,
  damage: 12,
  attackRange: 1.6,
  attackReach: 2.1,
  attackCooldown: 0.8,
  sightRange: 15,
  fov: 0.2, // cos of half-angle
  hearRange: 9,
  turnRate: 7,
  loseTime: 9,
  staggerDamage: 30,
  radius: 0.35,
  noticeSound: null,
  attackSound: null,
  deathSound: 'enemyDie',
  hurtSound: null,
  blood: 'blood',
  aquatic: false,
  canStagger: true,
};

export class Enemy {
  constructor(game, level, spec, cfg) {
    this.game = game;
    this.level = level;
    this.spec = spec;
    this.type = spec.type;
    this.id = spec.id || null;
    this.cfg = { ...BASE, ...cfg, ...(spec.cfg || {}) };
    this.model = makeModel(spec.type, spec.modelOpts || {});
    this.root = this.model.root;
    this.root.position.copy(spec.pos);
    this.pos = this.root.position;
    this.yaw = spec.yaw ?? 0;
    this.root.rotation.y = this.yaw;
    level.group.add(this.root);
    this.move = { pos: this.pos, vy: 0, grounded: true, radius: this.cfg.radius, height: this.model.height ?? 1.8, stepHeight: 0.5 };
    this.maxHealth = this.cfg.health;
    this.health = this.cfg.health;
    this.speed = 0;
    this.attackT = 0;
    this.cooldown = 0;
    this.path = null;
    this.pathTimer = 0;
    this.lastSeen = new THREE.Vector3();
    this.lostTimer = 0;
    this.seesPlayer = false;
    this.alerted = false;
    this.dead = false;
    this.flashT = 0;
    this.home = spec.pos.clone();
    this.wanderTarget = null;
    this.patrolIndex = 0;
    this.idleMode = spec.idle || 'stand';
    this.sources = [];
    for (const l of this.model.lights || []) {
      const node = l.node;
      const off = l.offset ? l.offset.clone() : new THREE.Vector3();
      const src = {
        getPos: (out) => node.localToWorld(out.copy(off)),
        color: l.color,
        intensity: l.intensity,
        distance: l.distance,
        flicker: l.flicker,
        kind: l.kind || 'candle',
        priority: l.priority ?? 1.5,
      };
      this.sources.push(src);
      // Levels register their enemies' lights on activation; runtime spawns register now.
      if (level.active) game.lights.add(src);
    }
    this.loop = null;
    this.state = null;
    this.setState(this.initialState());
  }

  initialState() {
    const m = this.idleMode;
    if (m === 'pray') return 'pray';
    if (m === 'dormant') return 'dormant';
    if (m === 'seated') return 'seated';
    if (m === 'sniff') return 'sniff';
    return 'idle';
  }

  setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    // Starting a hunt (woken by a flag, a noise or damage): it knows where you are.
    if ((s === 'chase' || s === 'rise' || s === 'lunge') && !['chase', 'attack', 'hurt', 'lunge', 'search', 'rise'].includes(prev)) {
      this.lastSeen.copy(this.game.player.position);
      this.lostTimer = 0;
    }
    this.state = s;
    this.stateTime = 0;
    this.onState?.(s, prev);
  }

  get alive() {
    return !this.dead;
  }

  // World-space hit spheres: [{ center, r, mult, part }]
  hitSpheres(out = []) {
    out.length = 0;
    for (const h of this.model.hitSpheres || []) {
      const c = h._c || (h._c = new THREE.Vector3());
      h.node.updateWorldMatrix(true, false);
      c.copy(h.offset || _v.set(0, 0, 0)).applyMatrix4(h.node.matrixWorld);
      out.push({ center: c, r: h.r, mult: h.mult ?? 1, part: h.part });
    }
    return out;
  }

  distToPlayer() {
    const p = this.game.player.position;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  eye(out = _eye) {
    return out.set(this.pos.x, this.pos.y + (this.model.height ?? 1.8) * 0.85, this.pos.z);
  }

  // Can we see the player right now?
  perceive() {
    const g = this.game;
    const p = g.player;
    if (p.dead) return false;
    const target = _pp.copy(g.camera.position);
    const d = this.pos.distanceTo(p.position);
    const lit = p.flashOn;
    let range = this.cfg.sightRange * (lit ? 1.3 : 0.6);
    if (d > range) return false;
    // Field of view (anything very close is noticed regardless).
    if (d > 2.5) {
      _v.set(target.x - this.pos.x, 0, target.z - this.pos.z).normalize();
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      if (_v.x * fx + _v.z * fz < this.cfg.fov) return false;
    }
    return this.level.physics.lineOfSight(this.eye(), target);
  }

  hears() {
    const p = this.game.player;
    if (p.noise <= 0) return false;
    return this.distToPlayer() < p.noise * this.cfg.hearRange && Math.abs(p.position.y - this.pos.y) < 3;
  }

  // Called by the manager for loud events (gunshots) near us.
  alert(pos) {
    if (this.dead || this.state === 'dormant' || this.state === 'seated') return;
    this.lastSeen.copy(pos);
    this.alerted = true;
    if (['idle', 'pray', 'sniff', 'search', 'wander'].includes(this.state)) this.setState('chase');
  }

  update(dt) {
    this.stateTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 4);
      this.model.flash?.(this.flashT);
    }
    if (this.dead) {
      this.speed = 0;
      this.animate(dt);
      return;
    }
    const g = this.game;
    const p = g.player;
    // Far away and asleep: skip the work and don't draw it (the fog hides it anyway).
    const far = this.distToPlayer() > 34;
    this.root.visible = !far;
    if (far && ['idle', 'pray', 'sniff', 'dormant', 'seated'].includes(this.state)) return;
    this.seesPlayer = this.perceive();
    if (this.seesPlayer) {
      this.lastSeen.copy(p.position);
      this.lostTimer = 0;
    } else this.lostTimer += dt;

    this.think(dt);

    // Gravity / ground for non-moving states.
    if (this.state !== 'chase' && this.state !== 'wander' && this.state !== 'search' && !this.cfg.static) {
      this.level.physics.move(this.move, 0, 0, dt);
    }
    this.root.rotation.y = this.yaw;
    this.animate(dt);
  }

  // Default brain; types override pieces via hooks.
  think(dt) {
    const g = this.game;
    const p = g.player;
    const d = this.distToPlayer();
    switch (this.state) {
      case 'idle':
      case 'pray':
      case 'sniff':
      case 'wander': {
        if (this.seesPlayer || this.hears()) {
          this.setState(this.cfg.skipNotice ? 'chase' : 'notice');
          this.onNotice?.();
          g.enemies.spotted(this);
          break;
        }
        if (this.idleMode === 'wander' || this.idleMode === 'patrol') this.idleWalk(dt);
        break;
      }
      case 'notice': {
        this.face(p.position, dt, 2);
        if (this.stateTime >= (this.model.timings?.notice?.duration ?? 0.8)) this.setState('chase');
        break;
      }
      case 'chase': {
        if (!p.dead && d < this.cfg.attackRange && Math.abs(p.position.y - this.pos.y) < 1.6 && this.cooldown <= 0 && this.seesPlayer) {
          this.setState('attack');
          this.attackDone = false;
          this.cfg.attackSound && g.audio.play(this.cfg.attackSound, { pos: this.eye().clone() });
          break;
        }
        if (!this.seesPlayer && this.lostTimer > this.cfg.loseTime) {
          this.setState('search');
          break;
        }
        this.moveToward(this.seesPlayer ? p.position : this.lastSeen, this.cfg.runSpeed, dt);
        break;
      }
      case 'search': {
        // Walk to the last known position, then give up.
        const dl = Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z);
        if (this.seesPlayer) this.setState('chase');
        else if (dl < 1 || this.stateTime > 12) {
          this.setState('idle');
          this.idleMode = this.spec.idle === 'patrol' ? 'patrol' : 'wander';
          this.home.copy(this.pos);
        } else this.moveToward(this.lastSeen, this.cfg.walkSpeed * 1.3, dt);
        break;
      }
      case 'attack': {
        const tm = this.model.timings?.attack || { duration: 0.9, hit: 0.45 };
        this.attackT = clamp(this.stateTime / tm.duration, 0, 1);
        if (this.stateTime < tm.hit) this.face(p.position, dt, 1.5);
        if (!this.attackDone && this.stateTime >= tm.hit) {
          this.attackDone = true;
          this.tryHit();
        }
        if (this.stateTime >= tm.duration) {
          this.cooldown = this.cfg.attackCooldown;
          this.setState('chase');
        }
        break;
      }
      case 'hurt': {
        if (this.stateTime >= (this.model.timings?.hurt?.duration ?? 0.35)) this.setState('chase');
        break;
      }
      default:
        this.thinkExtra?.(dt, d);
    }
  }

  tryHit() {
    const p = this.game.player;
    const d = this.distToPlayer();
    _v.set(p.position.x - this.pos.x, 0, p.position.z - this.pos.z).normalize();
    const facing = _v.x * Math.sin(this.yaw) + _v.z * Math.cos(this.yaw);
    if (d <= this.cfg.attackReach && facing > 0.2 && Math.abs(p.position.y - this.pos.y) < 1.8) {
      p.damage(this.cfg.damage, { cause: this.type, isVector3: false });
      this.onHitPlayer?.();
      return true;
    }
    return false;
  }

  face(target, dt, rateMul = 1) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    const diff = wrapAngle(want - this.yaw);
    this.yaw += diff * damp(this.cfg.turnRate * rateMul, dt);
    return Math.abs(diff);
  }

  // Steer toward a point using a direct line when clear, else the nav grid.
  moveToward(target, speed, dt) {
    const level = this.level;
    let goal = target;
    const direct = Math.hypot(target.x - this.pos.x, target.z - this.pos.z) < 1.2 || (Math.abs(target.y - this.pos.y) < 0.8 && level.physics.lineOfSight(_w.set(this.pos.x, this.pos.y + 0.6, this.pos.z), _v.set(target.x, target.y + 0.6, target.z)) && this.clearWalk(target));
    if (!direct && level.nav) {
      this.pathTimer -= dt;
      if (!this.path || this.pathTimer <= 0) {
        this.path = level.nav.findPath(this.pos, target, 9000);
        // Unreachable (a shut door): don't burn a search every half second.
        this.pathTimer = this.path ? 0.5 + Math.random() * 0.3 : 2.5 + Math.random();
      }
      if (this.path && this.path.length) {
        while (this.path.length > 1 && Math.hypot(this.path[0].x - this.pos.x, this.path[0].z - this.pos.z) < 0.5) this.path.shift();
        goal = this.path[0];
      }
    } else this.path = null;
    const dx = goal.x - this.pos.x;
    const dz = goal.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      this.speed = 0;
      return;
    }
    const angErr = this.face(goal, dt);
    // Slow down while turning hard; wade slower unless aquatic.
    let s = speed * clamp(1.2 - angErr, 0.25, 1);
    if (!this.cfg.aquatic) {
      const w = level.waterAt(this.pos.x, this.pos.z, this.pos.y);
      s *= 1 - clamp((w.depth - 0.2) / 1.2, 0, 0.5);
    }
    const step = Math.min(dist, s * dt);
    const before = _w.copy(this.pos);
    const bx = before.x;
    const bz = before.z;
    level.physics.move(this.move, Math.sin(this.yaw) * step, Math.cos(this.yaw) * step, dt);
    if (this.move.contacts.length) this.game.props.touch(this.move, Math.sin(this.yaw) * s, Math.cos(this.yaw) * s, false, 0.7);
    const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
    this.speed = moved / Math.max(dt, 1e-4);
    // Stuck on something: force a repath soon.
    if (moved < step * 0.2) this.pathTimer = Math.min(this.pathTimer, 0.1);
  }

  // Nav cells along a straight line are walkable (so direct steering won't hug walls forever).
  clearWalk(target) {
    const nav = this.level.nav;
    if (!nav) return true;
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const n = Math.ceil(d / 0.4);
    for (let i = 1; i < n; i++) {
      const x = this.pos.x + (dx * i) / n;
      const z = this.pos.z + (dz * i) / n;
      if (!nav.isWalkable(x, z)) return false;
    }
    return true;
  }

  idleWalk(dt) {
    const pts = this.spec.patrol;
    if (this.idleMode === 'patrol' && pts?.length) {
      const pt = pts[this.patrolIndex % pts.length];
      const t = _v.set(pt[0], this.pos.y, pt[1]);
      if (Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < 0.6) {
        this.patrolIndex++;
        this.pauseT = 1 + Math.random() * 2;
      }
      if (this.pauseT > 0) {
        this.pauseT -= dt;
        this.speed = 0;
        this.level.physics.move(this.move, 0, 0, dt);
      } else this.moveToward(t, this.cfg.walkSpeed, dt);
      return;
    }
    // Wander around home.
    if (!this.wanderTarget || this.pauseT > 0) {
      this.pauseT = (this.pauseT ?? 0) - dt;
      this.speed = 0;
      this.level.physics.move(this.move, 0, 0, dt);
      if (this.pauseT <= 0) {
        const a = Math.random() * Math.PI * 2;
        const r = 1.5 + Math.random() * (this.spec.wanderRadius ?? 4);
        const tx = this.home.x + Math.cos(a) * r;
        const tz = this.home.z + Math.sin(a) * r;
        if (this.level.nav?.isWalkable(tx, tz)) this.wanderTarget = new THREE.Vector3(tx, this.pos.y, tz);
        else this.pauseT = 0.5;
      }
      return;
    }
    this.moveToward(this.wanderTarget, this.cfg.walkSpeed, dt);
    if (Math.hypot(this.wanderTarget.x - this.pos.x, this.wanderTarget.z - this.pos.z) < 0.6 || this.stateTime > 20) {
      this.wanderTarget = null;
      this.pauseT = 1.5 + Math.random() * 3;
      this.stateTime = 0;
    }
  }

  takeDamage(amount, point, dir, weapon) {
    if (this.dead) return;
    const g = this.game;
    this.health -= amount;
    this.flashT = 1;
    const pt = point ? new THREE.Vector3(point.x, point.y, point.z) : this.eye().clone();
    g.particles.impact(pt, dir ? { x: -dir.x, y: 0.3, z: -dir.z } : null, this.cfg.blood, 14);
    g.audio.play('bulletHit', { pos: pt, gain: 0.8 });
    if (Math.random() < 0.5) {
      const floor = this.pos.clone();
      floor.x += (Math.random() - 0.5) * 0.8;
      floor.z += (Math.random() - 0.5) * 0.8;
      g.decals.blood(floor, { x: 0, y: 1, z: 0 }, 0.4 + Math.random() * 0.5);
    }
    this.lastSeen.copy(g.player.position);
    this.alerted = true;
    if (this.health <= 0) {
      this.die(weapon);
      return;
    }
    this.onDamaged?.(amount, weapon);
    if (this.cfg.canStagger && amount >= this.cfg.staggerDamage && this.state !== 'attack') {
      this.setState('hurt');
      this.cfg.hurtSound && g.audio.play(this.cfg.hurtSound, { pos: this.eye().clone(), gain: 0.7 });
    } else if (!this.cfg.static && ['idle', 'pray', 'sniff', 'wander', 'search', 'notice', 'dormant', 'seated'].includes(this.state)) {
      // (Static things like wall maws keep their own state machine when hit.)
      this.wake?.();
      if (!['rise', 'lunge'].includes(this.state)) this.setState('chase');
      g.enemies.spotted(this);
    }
  }

  die(weapon) {
    const g = this.game;
    this.dead = true;
    this.setState('dead');
    this.health = 0;
    if (this.id) g.setFlag(`killed:${this.id}`);
    for (const s of this.sources) g.lights.remove(s);
    this.sources = [];
    this.loop?.stop(0.5);
    this.loop = null;
    this.cfg.deathSound && g.audio.play(this.cfg.deathSound, { pos: this.eye().clone() });
    this.onDeath?.(weapon);
    const drop = this.spec.drop;
    if (drop && this.id) {
      const pos = this.pos.clone();
      pos.y = this.level.physics.groundAt(pos.x, pos.z, pos.y + 0.5).y;
      if (pos.y === -Infinity) pos.y = this.pos.y;
      pos.x += 0.4;
      const L = g.levels.builderFor(this.level);
      g.pickups.create(L, { id: `drop:${this.id}`, kind: drop.kind, amount: drop.amount, pos });
    }
    g.events.emit('enemyKilled', this);
  }

  animate(dt) {
    let st = this.state;
    if (st === 'chase' || st === 'search' || st === 'wander' || (st === 'idle' && this.speed > 0.2)) st = this.speed > this.cfg.walkSpeed * 1.25 ? 'run' : this.speed > 0.15 ? 'walk' : 'idle';
    this.model.animate(dt, this.game.time, { state: st, stateTime: this.stateTime, speed: this.speed, attackT: this.attackT });
  }

  dispose() {
    for (const s of this.sources) this.game.lights.remove(s);
    this.loop?.stop(0.2);
    this.root.removeFromParent();
    this.model.dispose?.();
  }
}

// ---------- Stand-in model ----------
function makeModel(type, opts) {
  if (buildCreature) {
    try {
      const m = buildCreature(type, opts);
      if (m) return m;
    } catch (e) {
      console.error(`[enemy] building ${type} failed`, e);
    }
  }
  return standIn(type);
}

function standIn(type) {
  const root = new THREE.Group();
  const col = { acolyte: 0x4a0a0e, hound: 0x7a1016, drowned: 0x5a6a68, lamprey: 0x2a3a3a, skinless: 0x8a2020, wallMaw: 0x6a0a10, mother: 0x202020, sister: 0xc0b8b0 }[type] ?? 0x888888;
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
  const h = type === 'hound' ? 0.9 : type === 'lamprey' ? 0.5 : type === 'mother' ? 6.5 : 1.8;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.18, h * 0.6, 4, 8), mat);
  body.position.y = h * 0.5;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.1, 10, 8), mat);
  head.position.y = h * 0.92;
  root.add(body, head);
  return {
    root,
    height: h,
    radius: 0.35,
    hitSpheres: [
      { node: head, offset: new THREE.Vector3(), r: h * 0.12, part: 'head', mult: 2 },
      { node: body, offset: new THREE.Vector3(), r: h * 0.25, part: 'body', mult: 1 },
    ],
    lights: [],
    timings: { attack: { duration: 0.9, hit: 0.45 }, notice: { duration: 0.7 }, hurt: { duration: 0.35 }, death: { duration: 1 } },
    animate(dt, t, s) {
      body.rotation.x = s.state === 'dead' ? Math.min(Math.PI / 2, s.stateTime * 3) : Math.sin(t * 8) * 0.05 * Math.min(1, s.speed);
      body.position.y = s.state === 'dead' ? 0.3 : h * 0.5;
      head.visible = s.state !== 'dead';
    },
    flash(v) {
      mat.emissive.setRGB(v * 0.5, 0, 0);
    },
    dispose() {},
  };
}
