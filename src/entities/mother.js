import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { clamp, wrapAngle, damp } from '../core/utils.js';
import { getDecalMaterial } from '../world/materials.js';

// The Mother Below: a static boss rooted in the black pool of the heart.
// States follow the creature model: submerged -> rise -> idle <-> lash | slam |
// spit | summon | hurt -> dead. The level calls startFight() / sink() and gets
// callbacks through spec.hooks { onFight, onPhase, onDeath }.
// Numbers: 1400 hp; weak points x2-2.5 (model hit spheres); the ritual knife
// does double damage to her. Phases by health: >60% lash/spit/slam, 60-30%
// adds and faster attacks, <30% enraged (short cooldowns, bigger volleys, the
// wrist chains tear out of the walls).

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const SALT = Math.random().toString(36).slice(2, 6);
let SERIAL = 0;
const rnd = (a, b) => a + Math.random() * (b - a);

const PHASES = [
  { speed: 1.0, cd: [2.2, 3.2], spit: 3, turn: 0.9, hold: 1.7, adds: 0, summonCd: 99 },
  { speed: 1.12, cd: [1.7, 2.5], spit: 4, turn: 1.2, hold: 1.3, adds: 2, summonCd: 17 },
  { speed: 1.28, cd: [1.0, 1.7], spit: 5, turn: 1.6, hold: 1.0, adds: 3, summonCd: 14 },
];
const MAX_ADDS = 4;
const LASH = { reach: 7.6, dmg: 28 };
const SLAM = { trigger: 7.8, radius: 3.0, dmg: 34 };
const BILE = { g: 9, direct: 14, splash: 7, splashR: 1.8 };

let bileGeo = null;
let bileMat = null;
let bileDecal = null;

export class Mother extends Enemy {
  constructor(game, level, spec) {
    super(game, level, spec, { health: spec.health ?? 1400, static: true, canStagger: false, radius: 3, deathSound: null, sightRange: 80 });
    this.hooks = spec.hooks || {};
    this.anchorsWorld = (spec.anchorsWorld || []).map((v) => v.clone());
    this.snapT = this.anchorsWorld.map(() => -1);
    this.yaw0 = spec.yaw ?? 0;
    this.phase = 0;
    this.animT = 0;
    this.hold = 0;
    this.adds = [];
    this.climbing = [];
    this.bile = [];
    this.cool = 1.5;
    this.cds = { lash: 0, slam: 0, spit: 0, summon: 0 };
    this.lashSide = 'left';
    this.lastHurtSnd = -9;
    this.lastStagger = -9;
    this.fightOn = false;
    if (!this.model.sisterSlot) {
      // Stand-in model: give it the nodes the level expects.
      this.model.cage = this.model.cage || new THREE.Group();
      this.model.sisterSlot = new THREE.Group();
      this.model.sisterSlot.position.set(0, 1.2, 1.6);
      this.root.add(this.model.sisterSlot);
    }
    for (const s of this.sources) s.enabled = false;
    if (spec.startDead) {
      this.dead = true;
      this.health = 0;
      this.stateTime = 99;
      this.sources = [];
    }
  }

  initialState() {
    return this.spec.startDead ? 'dead' : 'submerged';
  }

  setState(s) {
    if (this.state === s) return;
    super.setState(s);
    this.animT = 0;
    this.hold = 0;
    this.done = false;
    this.held = false;
    this.spawned = false;
  }

  get frac() {
    return clamp(this.health / this.maxHealth, 0, 1);
  }

  perceive() {
    return false;
  }

  hears() {
    return false;
  }

  alert() {}

  // ---------- Level API ----------
  startFight() {
    if (this.dead || this.state !== 'submerged') return false;
    this.setState('rise');
    for (const s of this.sources) s.enabled = true;
    return true;
  }

  // Back under the water (the player left mid-fight). Health is kept.
  sink() {
    if (this.dead) return;
    this.clearAdds();
    this.clearBile();
    this.fightOn = false;
    this.setState('submerged');
    for (const s of this.sources) s.enabled = false;
    this.game.hud.boss(null);
  }

  // ---------- Frame ----------
  update(dt) {
    super.update(dt);
    this.updateBile(dt);
    this.updateClimbers(dt);
    this.updateAnchors(dt);
    const g = this.game;
    if (this.fightOn && !this.dead) {
      g.hud.boss('The Mother Below', this.frac);
      g.audio.setBossHealth(this.frac);
    }
  }

  animate(dt) {
    this.model.animate(dt, this.game.time, {
      state: this.state,
      stateTime: this.state === 'dead' ? this.stateTime : this.animT,
      speed: 0,
      attackT: 0,
      lashSide: this.lashSide,
    });
  }

  think(dt) {
    const g = this.game;
    const st = this.state;
    const P = PHASES[this.phase];
    const attacking = st === 'lash' || st === 'slam' || st === 'spit' || st === 'summon';
    if (this.hold > 0) this.hold -= dt;
    else this.animT += dt * (attacking ? P.speed : 1);
    for (const k in this.cds) this.cds[k] -= dt;
    const tm = this.model.timings || {};
    switch (st) {
      case 'submerged':
        return;
      case 'rise': {
        g.player.shake = Math.max(g.player.shake, 0.35 * (1 - this.animT / 5));
        if (this.animT >= (tm.rise?.duration ?? 4.5)) {
          this.fightOn = true;
          this.cool = 0.8;
          this.setState('idle');
          this.hooks.onFight?.(this);
        }
        return;
      }
      case 'hurt':
        if (this.animT >= (tm.hurt?.duration ?? 0.6)) this.setState('idle');
        return;
      case 'idle':
        this.track(dt, 1);
        this.cool -= dt;
        if (this.cool <= 0 && !g.player.dead) this.choose();
        return;
      case 'lash':
        return this.thinkLash(dt, tm.lash || { duration: 1.6, hit: 0.9 });
      case 'slam':
        return this.thinkSlam(dt, tm.slam || { duration: 2.2, hit: 1.2 });
      case 'spit':
        return this.thinkSpit(dt, tm.spit || { duration: 1.6, release: 0.85 });
      case 'summon':
        return this.thinkSummon(dt, tm.summon || { duration: 3 });
      default:
    }
  }

  // Player angle relative to her facing (+ = her left, the +X arm) and distance.
  rel(out = {}) {
    const p = this.game.player.position;
    out.d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    out.a = wrapAngle(Math.atan2(p.x - this.pos.x, p.z - this.pos.z) - this.yaw);
    return out;
  }

  // Turn toward the player; while chained she can't face more than ~80 deg off her rest yaw.
  track(dt, mul) {
    const p = this.game.player.position;
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    const lim = this.snapT.every((t) => t >= 0) ? 1.95 : 1.4;
    const target = this.yaw0 + clamp(wrapAngle(want - this.yaw0), -lim, lim);
    const diff = wrapAngle(target - this.yaw);
    const rate = PHASES[this.phase].turn * mul;
    this.yaw += clamp(diff, -rate * dt, rate * dt);
  }

  choose() {
    const r = this.rel();
    const P = PHASES[this.phase];
    const opts = [];
    if (r.d < SLAM.trigger && Math.abs(r.a) < 0.55 && this.cds.slam <= 0) opts.push(['slam', 6]);
    if (r.d < LASH.reach + 1 && Math.abs(r.a) < 1.7 && this.cds.lash <= 0) opts.push(['lash', 4]);
    if (P.adds && this.cds.summon <= 0 && this.liveAdds() < 2) opts.push(['summon', 7]);
    if (this.cds.spit <= 0) opts.push(['spit', r.d > LASH.reach + 1 ? 6 : 1.2]);
    if (!opts.length) {
      this.cool = 0.4;
      return;
    }
    let sum = 0;
    for (const o of opts) sum += o[1];
    let x = Math.random() * sum;
    let pick = opts[0][0];
    for (const o of opts) {
      x -= o[1];
      if (x <= 0) {
        pick = o[0];
        break;
      }
    }
    const g = this.game;
    const k = this.phase === 2 ? 0.6 : this.phase === 1 ? 0.8 : 1;
    if (pick === 'lash') {
      this.lashSide = r.a >= 0 ? 'left' : 'right';
      this.cds.lash = 2.2 * k;
      g.audio.play('squelch', { pos: this.headPos(), gain: 0.9 });
    } else if (pick === 'slam') {
      this.cds.slam = 6 * k;
      g.audio.play('bossRoar', { pos: this.headPos(), gain: 0.6 });
    } else if (pick === 'spit') {
      this.cds.spit = 3.6 * k;
      g.audio.play('gurgle', { pos: this.headPos() });
    } else if (pick === 'summon') {
      this.cds.summon = P.summonCd;
    }
    this.setState(pick);
  }

  finishAttack() {
    const P = PHASES[this.phase];
    this.cool = rnd(P.cd[0], P.cd[1]);
    this.setState('idle');
  }

  headPos(out = _c) {
    const m = this.model.mouth;
    if (m) return m.getWorldPosition(out);
    return out.set(this.pos.x, this.pos.y + 6.5, this.pos.z);
  }

  // ---------- Lash: one arm sweeps the side of her front arc the player is on ----------
  thinkLash(dt, tm) {
    if (this.animT < 0.55) this.track(dt, 0.35);
    if (!this.done && this.animT >= tm.hit) {
      this.done = true;
      const g = this.game;
      const r = this.rel();
      const sd = this.lashSide === 'left' ? 1 : -1;
      const side = r.a * sd;
      const hand = this.model.hands?.[sd > 0 ? 0 : 1];
      const hp = hand ? hand.getWorldPosition(_a) : this.headPos(_a);
      g.audio.play('crack', { pos: hp.clone() });
      if (r.d < LASH.reach && side > -0.42 && side < 1.85 && Math.abs(g.player.position.y - this.pos.y) < 3) {
        g.player.damage(LASH.dmg, { cause: 'mother' });
        g.player.shake = Math.min(1, g.player.shake + 0.6);
      }
    }
    if (this.animT >= tm.duration) this.finishAttack();
  }

  // ---------- Slam: both hands crash onto the rim in front, then stay pinned ----------
  thinkSlam(dt, tm) {
    const g = this.game;
    if (this.animT < 0.85) this.track(dt, 0.5);
    if (!this.done && this.animT >= tm.hit) {
      this.done = true;
      g.audio.play('boom', { pos: this.headPos().clone() });
      g.audio.play('splash', { pos: this.pos.clone() });
      const p = g.player.position;
      g.player.shake = Math.min(1, g.player.shake + (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 11 ? 0.9 : 0.4));
      let hit = false;
      for (const h of this.model.hands || []) {
        h.getWorldPosition(_a);
        g.particles.impact(_a.clone().setY(0.1), { x: 0, y: 1, z: 0 }, 'blood', 18);
        if (Math.hypot(p.x - _a.x, p.z - _a.z) < SLAM.radius) hit = true;
      }
      if (!this.model.hands) {
        _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(4.7).add(this.pos);
        hit = Math.hypot(p.x - _a.x, p.z - _a.z) < SLAM.radius + 1;
      }
      if (hit) g.player.damage(SLAM.dmg, { cause: 'mother' });
    }
    // Hands dig into the rim, her head low over the edge: the opening.
    if (!this.held && this.animT >= 1.45) {
      this.held = true;
      this.hold = PHASES[this.phase].hold;
      g.audio.play('squelch', { pos: this.headPos().clone(), gain: 0.8 });
    }
    if (this.animT >= tm.duration) this.finishAttack();
  }

  // ---------- Spit: a volley of slow glowing bile arcing at the player ----------
  thinkSpit(dt, tm) {
    if (this.animT < (tm.release ?? 0.85)) this.track(dt, 0.7);
    if (!this.done && this.animT >= (tm.release ?? 0.85)) {
      this.done = true;
      this.volley(PHASES[this.phase].spit);
    }
    if (this.animT >= tm.duration) this.finishAttack();
  }

  volley(n) {
    const g = this.game;
    const from = this.headPos(new THREE.Vector3());
    const p = g.player.position;
    const vel = g.player.velocity;
    g.audio.play('splash', { pos: from.clone(), gain: 0.7 });
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      const T = clamp(0.95 + d * 0.07, 1.1, 2.0) + i * 0.13;
      const lead = i === 0 ? 0.9 : i === 1 ? 0 : rnd(0.2, 0.8);
      const spread = i < 2 ? 0.3 : 2.4;
      const ang = Math.random() * Math.PI * 2;
      const t = _b.set(
        p.x + vel.x * T * lead + Math.cos(ang) * spread * Math.random(),
        p.y + 0.3,
        p.z + vel.z * T * lead + Math.sin(ang) * spread * Math.random(),
      );
      const v = new THREE.Vector3((t.x - from.x) / T, (t.y - from.y) / T + 0.5 * BILE.g * T, (t.z - from.z) / T);
      this.spawnBile(from, v);
    }
  }

  spawnBile(from, v) {
    const g = this.game;
    if (!bileGeo) {
      bileGeo = new THREE.SphereGeometry(0.2, 12, 8);
      bileMat = new THREE.MeshStandardMaterial({ color: 0x9ab83a, emissive: 0x9ad02a, emissiveIntensity: 2.4, roughness: 0.25 });
    }
    const mesh = new THREE.Mesh(bileGeo, bileMat);
    mesh.position.copy(from);
    mesh.scale.set(1, 1.25, 1);
    this.level.group.add(mesh);
    const src = g.lights.add({ pos: mesh.position, color: 0xa8e03a, intensity: 1.4, distance: 4.5, flicker: 0.3, kind: 'candle', priority: 2.5 });
    this.bile.push({ mesh, v, src, life: 0 });
  }

  updateBile(dt) {
    if (!this.bile.length) return;
    const g = this.game;
    const phys = this.level.physics;
    const pp = g.player.position;
    for (const b of this.bile) {
      b.life += dt;
      const pos = b.mesh.position;
      _a.copy(pos);
      b.v.y -= BILE.g * dt;
      pos.addScaledVector(b.v, dt);
      b.mesh.rotation.set(b.life * 7, b.life * 5, 0);
      // Trail of drops.
      if (Math.random() < 0.5) g.particles.emit(pos, { x: (Math.random() - 0.5) * 0.4, y: 0, z: (Math.random() - 0.5) * 0.4 }, BILE_COL, 0.5, 6);
      // Direct hit on the player?
      _c.set(pp.x, pp.y + 0.95, pp.z);
      if (pos.distanceTo(_c) < 0.75 && !g.player.dead) {
        this.splat(b, pos.clone(), null, true);
        continue;
      }
      // World hit along the step.
      _b.subVectors(pos, _a);
      const len = _b.length();
      if (len > 1e-4) {
        const hit = phys.raycast(_a, _b.divideScalar(len), len, null, {});
        if (hit) {
          this.splat(b, new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z), hit.normal, false);
          continue;
        }
      }
      const r = Math.hypot(pos.x, pos.z);
      const floor = r < 5.15 ? this.level.waterAt(pos.x, pos.z, -9).surface : 0;
      if (pos.y <= floor || b.life > 6) this.splat(b, pos.clone().setY(Math.max(floor, -1)), { x: 0, y: 1, z: 0 }, false, r < 5.15);
    }
    this.bile = this.bile.filter((b) => !b.dead);
  }

  splat(b, point, normal, direct, inPool = false) {
    const g = this.game;
    b.dead = true;
    b.mesh.removeFromParent();
    g.lights.remove(b.src);
    g.audio.play(inPool ? 'splash' : 'squelch', { pos: point, gain: 0.9 });
    for (let i = 0; i < 14; i++) {
      g.particles.emit(point, { x: (Math.random() - 0.5) * 3, y: Math.random() * 2.5, z: (Math.random() - 0.5) * 3 }, BILE_COL, 0.4 + Math.random() * 0.4, 9);
    }
    if (!inPool && normal && g.decals._place) {
      if (!bileDecal) {
        bileDecal = getDecalMaterial('bloodSplat').clone();
        bileDecal.color.set(0xa8c040);
        bileDecal.emissive = new THREE.Color(0x3a5010);
        bileDecal.emissiveIntensity = 1;
      }
      g.decals._place(point, normal, 0.9 + Math.random() * 0.5, bileDecal);
    }
    if (g.player.dead) return;
    const pp = g.player.position;
    if (direct) g.player.damage(BILE.direct, { cause: 'mother' });
    else if (Math.hypot(pp.x - point.x, pp.z - point.z) < BILE.splashR && Math.abs(pp.y - point.y) < 1.8) g.player.damage(BILE.splash, { cause: 'mother' });
  }

  clearBile() {
    for (const b of this.bile) {
      b.mesh.removeFromParent();
      this.game.lights.remove(b.src);
    }
    this.bile = [];
  }

  // ---------- Summon: things climb out of the pool edge ----------
  thinkSummon(dt, tm) {
    const g = this.game;
    if (!this.done && this.animT >= 0.35) {
      this.done = true;
      g.audio.play('bossRoar', { pos: this.headPos().clone() });
      g.player.shake = Math.min(1, g.player.shake + 0.5);
    }
    if (!this.spawned && this.animT >= 1.0) {
      this.spawned = true;
      const n = Math.min(PHASES[this.phase].adds, MAX_ADDS - this.liveAdds());
      this.spawnAdds(n);
    }
    if (this.animT >= tm.duration) this.finishAttack();
  }

  liveAdds() {
    return this.adds.filter((e) => !e.dead).length;
  }

  spawnAdds(n) {
    const g = this.game;
    const p = g.player.position;
    const pa = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    const lim = this.spec.addArc ?? 1.75;
    for (let i = 0; i < n; i++) {
      // Around the front of the pool, away from the player's own spot.
      let a = 0;
      for (let tries = 0; tries < 12; tries++) {
        a = this.yaw0 + rnd(-lim, lim);
        if (Math.abs(wrapAngle(a - pa)) > 0.55 && this.climbing.every((c) => Math.abs(wrapAngle(c.a - a)) > 0.35)) break;
      }
      const type = this.phase === 2 && i === 2 ? 'hound' : i % 2 ? 'hound' : 'skinless';
      const id = `h_add_${SALT}_${++SERIAL}`;
      const drop = SERIAL % 2 ? { kind: 'ammo', amount: 3 } : SERIAL % 4 === 0 ? { kind: 'shells', amount: 2 } : null;
      const pos = new THREE.Vector3(this.pos.x + Math.sin(a) * 4.5, -1.7, this.pos.z + Math.cos(a) * 4.5);
      const e = g.enemies.create(this.level, { type, id, pos, yaw: a, idle: 'stand', cfg: { static: true }, drop });
      if (!e) continue;
      e.setState('notice');
      this.adds.push(e);
      this.climbing.push({ e, a, t: -i * 0.35 });
    }
  }

  updateClimbers(dt) {
    if (!this.climbing.length) return;
    const g = this.game;
    for (const c of this.climbing) {
      const e = c.e;
      c.t += dt;
      if (e.dead) {
        c.done = true;
        continue;
      }
      e.stateTime = 0;
      if (c.t < 0) continue;
      if (!c.splashed) {
        c.splashed = true;
        _a.set(this.pos.x + Math.sin(c.a) * 4.6, -0.3, this.pos.z + Math.cos(c.a) * 4.6);
        g.particles.impact(_a, { x: 0, y: 1, z: 0 }, 'blood', 20);
        g.audio.play('splash', { pos: _a.clone() });
        g.audio.play(e.type === 'hound' ? 'snarl' : 'skinlessScream', { pos: _a.clone(), gain: 0.8 });
      }
      const k = clamp(c.t / 1.3, 0, 1);
      const ease = 1 - (1 - k) * (1 - k);
      const r = 4.5 + 1.55 * ease;
      e.pos.set(this.pos.x + Math.sin(c.a) * r, -1.7 + 1.7 * Math.min(1, ease * 1.25) + Math.sin(k * Math.PI) * 0.35, this.pos.z + Math.cos(c.a) * r);
      e.yaw = c.a;
      if (k >= 1) {
        c.done = true;
        e.pos.y = 0;
        e.cfg.static = false;
        e.move.vy = 0;
        e.move.grounded = true;
        e.alerted = true;
        e.lastSeen.copy(g.player.position);
        e.setState('chase');
      }
    }
    this.climbing = this.climbing.filter((c) => !c.done);
  }

  clearAdds() {
    const list = this.level.enemies;
    for (const e of this.adds) {
      e.dispose();
      const i = list.indexOf(e);
      if (i >= 0) list.splice(i, 1);
    }
    this.adds = [];
    this.climbing = [];
  }

  // ---------- Chains: keep the model's anchors on the wall rings as she turns ----------
  updateAnchors(dt) {
    const an = this.model.anchors;
    if (!an) return;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    for (let i = 0; i < an.length && i < this.anchorsWorld.length; i++) {
      const w = this.anchorsWorld[i];
      const x = w.x - this.pos.x;
      const y = w.y - this.pos.y;
      const z = w.z - this.pos.z;
      const lx = x * c - z * s;
      const lz = x * s + z * c;
      if (this.snapT[i] < 0) an[i].set(lx, y, lz);
      else {
        // Torn free: the loose end falls into the pool beside her.
        this.snapT[i] = Math.min(1, this.snapT[i] + dt * 0.9);
        const k = this.snapT[i] * this.snapT[i];
        const sd = Math.sign(this.spec.anchorsLocal?.[i]?.x ?? lx) || 1;
        an[i].set(lx + (sd * 4.8 - lx) * k, y + (-2.5 - y) * k, lz + (1.4 - lz) * k);
      }
    }
  }

  snapChain(i) {
    if (this.snapT[i] === undefined || this.snapT[i] >= 0) return;
    const g = this.game;
    this.snapT[i] = 0;
    const w = this.anchorsWorld[i];
    g.audio.play('chains', { pos: w.clone() });
    g.audio.play('crack', { pos: w.clone() });
    g.audio.play('boom', { pos: w.clone(), gain: 0.6 });
    g.particles.impact(w, { x: -Math.sign(w.x), y: -0.2, z: 0 }, 'dust', 30);
    g.player.shake = Math.min(1, g.player.shake + 0.5);
    this.hooks.onChainSnap?.(i, w);
  }

  // ---------- Damage ----------
  takeDamage(amount, point, dir, weapon) {
    if (this.dead) return;
    if (this.state === 'submerged' || (this.state === 'rise' && this.animT < 3.4)) return;
    super.takeDamage(weapon === 'knife' ? amount * 2 : amount, point, dir, weapon);
    if (!this.dead) this.checkPhase();
  }

  onDamaged(amount) {
    const g = this.game;
    if (g.time - this.lastHurtSnd > 2.8 && amount >= 25) {
      this.lastHurtSnd = g.time;
      g.audio.play('bossHurt', { pos: this.headPos().clone(), gain: 0.8 });
    }
    // Heavy hits stagger her (and cancel an attack before it lands).
    const st = this.state;
    const early = st === 'idle' || (st === 'spit' && this.animT < 0.8) || (st === 'lash' && this.animT < 0.8) || (st === 'slam' && this.animT < 1.05);
    if (amount >= 90 && early && g.time - this.lastStagger > 5) {
      this.lastStagger = g.time;
      this.setState('hurt');
      this.cool = 0.6;
    }
  }

  checkPhase() {
    const f = this.frac;
    const ph = f > 0.6 ? 0 : f > 0.3 ? 1 : 2;
    if (ph > this.phase) {
      this.phase = ph;
      this.cds.summon = ph === 1 ? 0.5 : 2;
      this.cds.slam = Math.min(this.cds.slam, 2);
      if (ph === 2) this.snapChain(0);
      this.hooks.onPhase?.(ph, this);
    }
    if (f < 0.15 && this.snapT[1] !== undefined && this.snapT[1] < 0) this.snapChain(1);
  }

  onDeath() {
    const g = this.game;
    g.audio.play('bossDeath', { pos: this.headPos().clone() });
    g.player.shake = 1;
    this.fightOn = false;
    this.clearBile();
    this.climbing = [];
    this.adds.forEach((e, i) => {
      setTimeout(() => {
        if (!e.dead && e.level.active) e.takeDamage(9999, null, null, 'boss');
      }, 250 + i * 220);
    });
    g.hud.boss(null);
    g.audio.setBossHealth(0);
    g.analytics?.bossDefeated();
    this.hooks.onDeath?.(this);
  }

  dispose() {
    this.clearBile();
    super.dispose();
  }
}

const BILE_COL = new THREE.Color(0x98b83a);
