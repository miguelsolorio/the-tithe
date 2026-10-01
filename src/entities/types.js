import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { clamp, wrapAngle } from '../core/utils.js';
import { pipe } from '../world/props/depths/industrial.js';

// Enemy types. Numbers are tuned for a knife-first game where guns are scarce.

const _v = new THREE.Vector3();

// AI state -> crawler pose (models/acolyte.js); anything else is crawl or crawlIdle by speed.
const CRAWL_POSE = { notice: 'crawlIdle', attack: 'crawlAttack', hurt: 'crawlHurt', dead: 'crawlDead', kill: 'crawlKill' };

export class Acolyte extends Enemy {
  constructor(game, level, spec) {
    super(game, level, spec, {
      health: 70,
      walkSpeed: 1.1,
      runSpeed: 3.3,
      damage: 13,
      attackRange: 1.5,
      attackReach: 2.1,
      attackCooldown: 0.9,
      sightRange: 14,
      hearRange: 9,
      noticeSound: 'acolyteScream',
      steps: { sound: 'acolyteStep', stride: 0.75, runStride: 1.3, walkGain: 0.3, runGain: 1.0 },
      killCam: true,
      killSound: 'acolyteKill',
      killGain: 1.2,
    });
    this.whisperT = 2 + Math.random() * 4;
  }

  // Whispers its prayers while it wanders. Once it crawls, the hunt is
  // hissed prayers and its joints cracking.
  think(dt) {
    super.think(dt);
    if (['pray', 'dead', 'kill'].includes(this.state) || this.turning) return;
    this.whisperT -= dt;
    if (this.whisperT > 0) return;
    const hunting = ['chase', 'search', 'attack'].includes(this.state);
    this.whisperT = hunting ? 1.5 + Math.random() * 2 : 6 + Math.random() * 6;
    if (this.distToPlayer() > 20) return;
    const crack = this.crawling && hunting && Math.random() < 0.5;
    this.game.audio.play(crack ? 'boneCrack' : 'acolyteWhisper', { pos: this.eye().clone(), gain: hunting ? 0.9 : 0.35 });
  }

  // The first time it hunts you it turns its back and folds over backward
  // into the crawler, and stays that way.
  transform() {
    this.crawling = true;
    this.turning = true;
    Object.assign(this.cfg, {
      walkSpeed: 1.2,
      runSpeed: 3.6,
      attackRange: 1.6,
      steps: { sound: 'crawlStep', stride: 0.35, runStride: 0.42, walkGain: 0.3, runGain: 0.8 },
    });
    // The candle's in its teeth now, guttering as it moves.
    const candle = this.sources[0];
    if (candle) {
      candle.flicker = 0.9;
      candle.intensity *= 0.8;
    }
    this.game.audio.play('acolyteScream', { pos: this.eye().clone() });
    if (this.state !== 'notice') this.setState('notice');
  }

  // Low to the ground once it crawls (sight line, sounds).
  eye(out) {
    const e = super.eye(out);
    if (this.crawling && !this.dead) e.y = this.pos.y + 0.6;
    return e;
  }

  animate(dt) {
    if (!this.crawling) return super.animate(dt);
    const pose = this.state === 'notice' && this.turning ? 'turn' : CRAWL_POSE[this.state] ?? (this.speed > 0.15 ? 'crawl' : 'crawlIdle');
    this.model.animate(dt, this.game.time, { state: pose, stateTime: this.stateTime, speed: this.speed, attackT: this.attackT });
  }

  onHitPlayer() {
    this.game.audio.play('stab');
  }

  onState(s, prev) {
    // Praying acolytes chant; the chant stops when they notice you.
    if (s === 'pray' && !this.loop) this.loop = this.game.audio.loop('chantLoop', { pos: this.eye().clone(), gain: 0.3 });
    if (prev === 'pray' && s !== 'pray') {
      this.loop?.stop(0.4);
      this.loop = null;
    }
    if (prev === 'notice') this.turning = false;
    if (!this.crawling && (s === 'notice' || s === 'chase')) this.transform();
  }

  // Deep in prayer they barely notice anything that isn't right beside them.
  perceive() {
    if (this.state === 'pray' && this.distToPlayer() > 4.5) return false;
    return super.perceive();
  }

  hears() {
    if (this.state === 'pray') return this.game.player.noise > 0.9 && this.distToPlayer() < 6;
    return super.hears();
  }

  onNotice() {
    // The fold already screamed (transform()).
    if (this.turning) return;
    this.game.audio.play('acolyteScream', { pos: this.eye().clone() });
  }
}

export class Hound extends Enemy {
  constructor(game, level, spec) {
    super(game, level, spec, {
      health: 55,
      walkSpeed: 1.4,
      runSpeed: 6.0,
      damage: 11,
      attackRange: 1.9,
      attackReach: 2.4,
      attackCooldown: 0.55,
      sightRange: 16,
      hearRange: 12,
      fov: 0.0,
      turnRate: 10,
      staggerDamage: 24,
      radius: 0.4,
      attackSound: 'houndBite',
      steps: { sound: 'pawStep', stride: 0.5, runStride: 0.95, walkGain: 0.3, runGain: 0.9 },
      killCam: true,
      killSound: 'houndKill',
      killGain: 1.3,
    });
    if (!spec.idle) this.idleMode = 'sniff';
    this.setState(this.initialState());
    this.snarlT = 0;
  }

  onNotice() {
    this.game.audio.play('houndNotice', { pos: this.eye().clone() });
  }

  onHitPlayer() {
    this.game.audio.play('squelch', { gain: 0.6 });
  }

  think(dt) {
    super.think(dt);
    if (this.state === 'chase') {
      this.snarlT -= dt;
      if (this.snarlT <= 0) {
        this.snarlT = 2.5 + Math.random() * 3;
        this.game.audio.play('snarl', { pos: this.eye().clone(), gain: 0.7 });
      }
    }
  }
}

// Flayed, starved humanoids. Out in the caves they hang back in the dark and
// call for help in your sister's voice; come close, or put your light on one,
// and the voice breaks into a scream and it runs at you. The ones the Mother
// summons skip the act.
export class Skinless extends Enemy {
  constructor(game, level, spec) {
    super(game, level, spec, {
      health: 75,
      walkSpeed: 1.6,
      runSpeed: 5.4,
      damage: 15,
      attackRange: 1.6,
      attackReach: 2.1,
      attackCooldown: 0.7,
      sightRange: 18,
      hearRange: 11,
      fov: -0.2,
      turnRate: 9,
      steps: { sound: 'fleshStep', stride: 0.9, runStride: 1.6, walkGain: 0.35, runGain: 0.9 },
      killCam: true,
      killSound: 'mimicKill',
      killGain: 1.3,
      killCut: 1700,
    });
    this.screamT = 0;
    this.mimic = !this.cfg.static;
    this.callT = 2 + Math.random() * 5;
    this.breakT = 0;
    this.talkT = 0;
    this.talk = 0;
  }

  // "Help me", in her voice.
  call() {
    this.game.audio.play('mimicCall', { pos: this.eye().clone() });
    this.talkT = 1.1;
  }

  // The voice drops into a scream; the scream pose lands with it (breakT).
  breakVoice() {
    if (this.breakT > 0) return;
    this.setState('lurk');
    this.breakT = 0.95;
    this.talkT = 1;
    this.game.audio.play('mimicBreak', { pos: this.eye().clone() });
  }

  onNotice() {
    if (!this.mimic) this.game.audio.play('skinlessScream', { pos: this.eye().clone() });
  }

  think(dt) {
    const g = this.game;
    const p = g.player;
    const d = this.distToPlayer();
    this.talkT = Math.max(0, this.talkT - dt);
    if (this.mimic && !p.dead && this.state !== 'kill') {
      if (this.breakT > 0) {
        this.breakT -= dt;
        this.speed = 0;
        this.face(p.position, dt, 1.5);
        if (this.breakT <= 0) {
          this.setState('notice');
          g.enemies.spotted(this);
        }
        return;
      }
      if (this.state === 'idle' || this.state === 'wander' || this.state === 'sniff') {
        this.callT -= dt;
        if (this.callT <= 0) {
          this.callT = 6 + Math.random() * 6;
          if (d < 28) this.call();
        }
        if (this.seesPlayer || this.hears()) {
          if (d > 7) {
            this.setState('lurk');
            this.alerted = false;
            this.callT = 0.5;
          } else this.breakVoice();
          return;
        }
      } else if (this.state === 'lurk') {
        // Stock still in the dark, calling, until you come close or light it up.
        this.speed = 0;
        this.face(p.position, dt, 0.5);
        this.callT -= dt;
        if (this.callT <= 0) {
          this.callT = 2.2 + Math.random() * 1.2;
          this.call();
        }
        const lit = this.model.focus && this.eyeShine(this.model.nodes?.head, this.model.focus, 14) > 0.3;
        if (d < 7 || lit || this.alerted || this.stateTime > 16) this.breakVoice();
        else if (!this.seesPlayer && this.lostTimer > 8) this.setState('idle');
        return;
      }
    }
    super.think(dt);
    if (this.state === 'chase') {
      this.screamT -= dt;
      if (this.screamT <= 0) {
        this.screamT = 3 + Math.random() * 3;
        // Still using her voice as it runs, and the voice keeps breaking.
        const name = !this.mimic ? 'skinlessScream' : Math.random() < 0.55 ? 'mimicCall' : 'mimicBreak';
        g.audio.play(name, { pos: this.eye().clone(), gain: name === 'skinlessScream' ? 0.6 : 1 });
        if (name !== 'skinlessScream') this.talkT = 1.1;
      }
    }
  }

  animate(dt) {
    const want = this.talkT > 0 ? 0.6 + 0.4 * Math.sin(this.game.time * 14) : 0;
    this.talk += (want - this.talk) * Math.min(1, dt * 12);
    if (this.model.focus) this.model.setShine?.(0.8 * this.eyeShine(this.model.nodes?.head, this.model.focus));
    if (this.state === 'notice') {
      this.model.animate(dt, this.game.time, { state: 'scream', stateTime: this.stateTime, speed: 0, attackT: 0 });
      return;
    }
    if (this.state === 'lurk' || this.state === 'kill') {
      this.model.animate(dt, this.game.time, { state: this.state, stateTime: this.stateTime, speed: 0, attackT: 0, talk: this.talk });
      return;
    }
    super.animate(dt);
  }
}

// Bloated corpses that rise out of the water (or stand up from a table). They
// stand up in jerks, water running out of their slack jaws, and their milky
// eyes throw your flashlight back. One that kills you drags you under.
const WATER = new THREE.Color(0x9cc4bc);
const _drop = new THREE.Vector3();
const _vel = new THREE.Vector3();

export class Drowned extends Enemy {
  constructor(game, level, spec) {
    super(game, level, spec, {
      health: 150,
      walkSpeed: 0.85,
      runSpeed: 1.35,
      damage: 24,
      attackRange: 1.7,
      attackReach: 2.2,
      attackCooldown: 1.3,
      sightRange: 11,
      hearRange: 7,
      staggerDamage: 60,
      aquatic: true,
      steps: { sound: 'wadeStep', stride: 0.8, runStride: 1.0, walkGain: 0.5, runGain: 0.8 },
      killCam: true,
      killSound: 'drownedKill',
      killGain: 1.2,
      killCut: 1500,
      killLight: true,
    });
    this.gurgleT = 2 + Math.random() * 3;
    this.dribbleT = 0;
    this.coughs = 0;
  }

  wake() {
    if (this.state === 'dormant' || this.state === 'seated') {
      this.setState('rise');
      this.coughs = 0;
      this.game.audio.play('drownedWake', { pos: this.eye().clone() });
      this.game.enemies.spotted(this);
    }
  }

  thinkExtra(dt, d) {
    if (this.state === 'dormant' || this.state === 'seated') {
      const r = this.spec.wakeRadius ?? (this.state === 'seated' ? 2.2 : 5);
      const flag = this.spec.wakeFlag;
      if ((flag && this.game.flags.has(flag)) || (!flag && d < r) || (flag && d < 1.2)) this.wake();
      return;
    }
    if (this.state === 'rise') {
      const dur = this.model.timings?.rise?.duration ?? 2;
      this.face(this.game.player.position, dt, 0.5);
      // Coughing up water between the jerks.
      if (this.coughs < 2 && this.stateTime > 0.55 + this.coughs * 0.65) {
        this.coughs++;
        this.game.audio.play('drownedCough', { pos: this.eye().clone(), gain: 0.9 });
        this.spill(12, 1.8);
      }
      if (this.stateTime >= dur) this.setState('chase');
    }
  }

  think(dt) {
    super.think(dt);
    if (this.state === 'chase') {
      this.gurgleT -= dt;
      if (this.gurgleT <= 0) {
        this.gurgleT = 4 + Math.random() * 4;
        this.game.audio.play('gurgle', { pos: this.eye().clone(), gain: 0.8 });
      }
    }
    // Water running out of its mouth.
    if (this.state !== 'dormant' && this.distToPlayer() < 14) {
      this.dribbleT -= dt;
      if (this.dribbleT <= 0) {
        this.dribbleT = 0.06 + Math.random() * 0.08;
        this.spill(1, 0.3);
      }
    }
  }

  // n drops of water out of the slack jaw, thrown forward at up to `speed` m/s.
  spill(n, speed) {
    const jaw = this.model.nodes?.jaw;
    if (!jaw) return;
    jaw.localToWorld(_drop.set(0, -0.035, 0.085));
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    for (let i = 0; i < n; i++) {
      _vel.set(fx * speed * Math.random() + (Math.random() - 0.5) * speed * 0.4, Math.random() * speed * 0.3, fz * speed * Math.random() + (Math.random() - 0.5) * speed * 0.4);
      this.game.particles.emit(_drop, _vel, WATER, 0.6 + Math.random() * 0.4, 9);
    }
  }

  animate(dt) {
    super.animate(dt);
    const k = this.state === 'dormant' || !this.model.focus ? 0 : this.eyeShine(this.model.nodes?.head, this.model.focus);
    this.model.setShine?.(k);
  }

  // Kill-cam: it pulls you down under the water.
  onKillCam() {
    const g = this.game;
    const p = g.player;
    setTimeout(() => {
      if (g.state !== 'dead') return;
      p.eyeScaleTarget = 0.12;
      p.forceUnder = true;
      g.audio.play('drownedUnder');
      g.fx.fadeTo(0.6, 1.4, 0x0b3633);
    }, 600);
  }
}

// Eel on human hands. Where there's a ceiling it hangs from it, dripping on
// you, and drops when you walk underneath; it hunts hand over hand along the
// ceiling and drops again to strike. With no ceiling above it, it lies under
// the water as before.
const LAIR_MIN = 2.3;
const LAIR_MAX = 6.4;
const CLIMB_MAX = 5.8;
const UP = new THREE.Vector3(0, 1, 0);
const DRIP = new THREE.Color(0xb8d0c8);
const _ray = {};
const _o = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _zero = new THREE.Vector3();
const solidOnly = (c) => c.solid;

export class Lamprey extends Enemy {
  constructor(game, level, spec) {
    super(game, level, spec, {
      health: 90,
      walkSpeed: 1.2,
      runSpeed: 3.7,
      damage: 16,
      attackRange: 1.9,
      attackReach: 2.5,
      attackCooldown: 0.9,
      sightRange: 12,
      hearRange: 9,
      aquatic: true,
      radius: 0.45,
      staggerDamage: 45,
      killCam: true,
      killSound: 'lampreyKill',
      killGain: 1.2,
      killCut: 1100,
      killLight: true,
    });
    if (!spec.idle) {
      this.idleMode = 'dormant';
      this.setState('dormant');
    }
    this.lungeCd = 0;
    this.climbCd = 2;
    // Ceiling height above us (0 = none), whether it's gripping it right now,
    // and whether it made a lair up there (decided on the first update, once
    // the level's colliders exist).
    this.ceil = 0;
    this.onCeil = false;
    this.lair = null;
    this.fromCeil = false;
    this.dripT = 0;
    this.knock = 0;
  }

  // Height of the ceiling above us, or 0 if there's none in [LAIR_MIN, max].
  findCeil(max = LAIR_MAX) {
    _o.set(this.pos.x, this.pos.y + 0.3, this.pos.z);
    const hit = this.level.physics.raycast(_o, UP, max, solidOnly, _ray);
    const h = hit ? hit.dist + 0.3 : 0;
    return h >= LAIR_MIN && h <= max + 0.3 ? h : 0;
  }

  // Up on the ceiling the channel walls and steps below don't stop it (it
  // steps over anything short of a real wall); a bit slower hand over hand.
  setCeil(on) {
    this.onCeil = on;
    this.cfg.runSpeed = on ? 2.7 : 3.7;
    this.move.stepHeight = on ? 3 : 0.5;
  }

  makeLair() {
    this.lair = false;
    if (this.state !== 'dormant') return;
    const c = this.findCeil();
    if (!c) return;
    this.lair = true;
    this.ceil = c;
    this.setCeil(true);
    // Two runs of pipe along the ceiling for its hands to grip.
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    for (const side of [1, -1]) {
      const run = pipe({ length: 3.4, radius: 0.055 });
      run.position.set(this.pos.x - fx * 0.55 + fz * side * 0.34, this.pos.y + c - 0.1, this.pos.z - fz * 0.55 - fx * side * 0.34);
      run.rotation.y = this.yaw - Math.PI / 2;
      this.level.group.add(run);
    }
  }

  // Up on the ceiling its eyes are with its head, not down on the floor.
  eye(out) {
    const head = this.model.nodes?.head;
    if (head && (this.onCeil || this.state === 'kill')) return head.getWorldPosition(out || _hp);
    return super.eye(out);
  }

  update(dt) {
    if (this.lair === null) this.makeLair();
    super.update(dt);
  }

  onState(s) {
    // Hurt or killed up there, it falls.
    if ((s === 'hurt' || s === 'dead') && this.onCeil) this.setCeil(false);
  }

  wake() {
    if (this.state === 'dormant') this.startLunge(true);
  }

  startLunge(ambush) {
    const from = this.eye().clone();
    this.fromCeil = this.onCeil;
    this.setCeil(false);
    this.setState('lunge');
    this.lungeHit = false;
    this.game.audio.play(this.fromCeil ? 'lampreyDrop' : 'lamprey', { pos: from });
    if (ambush) {
      this.game.audio.play('screech', { gain: 0.5 });
      this.game.enemies.spotted(this, true);
    }
    this.lungeCd = 4;
    this.climbCd = 3;
  }

  // Lost its grip (the ceiling ran out): it just falls.
  dropOff() {
    this.setCeil(false);
    this.game.audio.play('squelch', { pos: this.pos.clone(), gain: 0.8 });
    this.climbCd = 4;
  }

  // Water dripping off it onto the floor below, faster as you come closer.
  drip(dt, d) {
    const r = (this.spec.wakeRadius ?? 5.5) + 6;
    if (d > r) return;
    this.dripT -= dt * (1 + 2.5 * (1 - d / r));
    if (this.dripT > 0) return;
    this.dripT = 0.5 + Math.random() * 0.6;
    const head = this.model.nodes?.head;
    if (!head) return;
    head.localToWorld(_hp.set((Math.random() - 0.5) * 0.12, 0, 0.1));
    this.game.particles.emit(_hp, _zero, DRIP, Math.sqrt((2 * Math.max(0.3, _hp.y - this.pos.y)) / 9) + 0.1, 9);
    _o.set(_hp.x, this.pos.y + 0.6, _hp.z);
    this.game.audio.play('drip', { pos: _o, gain: 1.2 });
  }

  // Hands landing on the ceiling as it goes, hand over hand.
  knocks(dt) {
    this.knock += this.speed * dt;
    if (this.knock < 0.45) return;
    this.knock = 0;
    if (this.distToPlayer() > 25) return;
    _o.set(this.pos.x, this.pos.y + this.ceil - 0.1, this.pos.z);
    this.game.audio.play('ceilingKnock', { pos: _o, gain: 0.9 });
  }

  thinkExtra(dt, d) {
    const g = this.game;
    if (this.state === 'dormant') {
      if (this.lair) this.drip(dt, d);
      const dy = Math.abs(g.player.position.y - this.pos.y);
      if (d < (this.spec.wakeRadius ?? 5.5) && dy < (this.lair ? 3.5 : 2)) this.wake();
      return;
    }
    if (this.state === 'lunge') {
      const tm = this.model.timings?.lunge || { duration: 0.9, hit: 0.45 };
      const p = g.player.position;
      if (this.stateTime < tm.hit) {
        this.face(p, dt, 2);
        // Burst forward (a drop from the ceiling only lunges a little).
        const s = (this.fromCeil ? 2.5 : 7) * (1 - this.stateTime / tm.duration);
        this.level.physics.move(this.move, Math.sin(this.yaw) * s * dt, Math.cos(this.yaw) * s * dt, dt);
        this.speed = s;
      }
      if (!this.lungeHit && this.stateTime >= tm.hit) {
        this.lungeHit = true;
        this.tryHit();
      }
      if (this.stateTime >= tm.duration) {
        this.fromCeil = false;
        this.setState('chase');
      }
      return;
    }
    if (this.state === 'climb') {
      this.speed = 0;
      this.face(g.player.position, dt, 1);
      if (this.stateTime >= 0.7) {
        this.setCeil(true);
        this.setState('chase');
      }
    }
  }

  think(dt) {
    this.lungeCd -= dt;
    this.climbCd -= dt;
    const d = this.distToPlayer();
    if (this.state === 'chase' || this.state === 'search') {
      if (this.onCeil) {
        this.ceil = this.findCeil(CLIMB_MAX + 0.6);
        if (!this.ceil) this.dropOff();
        else if (d < 3.8 && this.seesPlayer) {
          // Overhead: let go and come down on you.
          if (this.lungeCd <= 0) {
            this.startLunge(false);
            return;
          }
          this.dropOff();
        }
      } else if (this.state === 'chase') {
        if (this.lungeCd <= 0 && this.seesPlayer && d > 2.5 && d < 4.5) {
          this.startLunge(false);
          return;
        }
        // Too far to catch on the floor: back up the wall and along the ceiling.
        if (this.climbCd <= 0 && d > 5.5) {
          const c = this.findCeil(CLIMB_MAX);
          this.climbCd = 2;
          if (c) {
            this.ceil = c;
            this.setState('climb');
            this.game.audio.play('ceilingKnock', { pos: this.pos.clone(), gain: 0.8 });
            return;
          }
        }
      }
    }
    super.think(dt);
    if (this.onCeil && (this.state === 'chase' || this.state === 'search')) this.knocks(dt);
  }

  animate(dt) {
    let st = this.state;
    if (st === 'chase' || st === 'search') st = this.onCeil ? 'ceilCrawl' : 'crawl';
    else if (st === 'dormant' && this.lair) st = 'hang';
    if (['dormant', 'hang', 'lunge', 'crawl', 'ceilCrawl', 'climb', 'attack', 'hurt', 'dead', 'kill'].includes(st)) {
      const cam = this.game.player.camera.position;
      this.model.animate(dt, this.game.time, {
        state: st,
        stateTime: this.stateTime,
        speed: this.speed,
        attackT: this.attackT,
        ceil: this.ceil ? this.ceil - 0.06 : 0,
        fromCeil: this.fromCeil,
        eyeH: cam.y - this.pos.y,
      });
      return;
    }
    super.animate(dt);
  }

  // Kill-cam: it hangs down in front of your face if there's a ceiling for it.
  onKillCam() {
    this.ceil = this.findCeil();
    this.setCeil(false);
  }
}

// A toothed mouth in the flesh wall. Stationary; it breathes while it waits,
// quicker as you come closer, a red light in its throat brightening on every
// breath in. Just before it strikes it gasps and the light flares.
export class WallMaw extends Enemy {
  constructor(game, level, spec) {
    super(game, level, spec, {
      health: 110,
      damage: 20,
      staggerDamage: 999,
      canStagger: false,
      static: true,
      blood: 'ichor',
      deathSound: 'squelch',
      killCam: true,
      killSound: 'mawKill',
      killGain: 1.2,
      killCut: 1500,
    });
    this.idleMode = 'dormant';
    this.setState('dormant');
    this.cool = 0;
    this.breathPh = Math.random();
    this.flare = 0;
    this.reach = new THREE.Vector3();
  }

  perceive() {
    return false;
  }

  canKillCam() {
    return this.distToPlayer() < 3.8;
  }

  // Player inside the reach cone in front of the mouth?
  inReach(extra = 0) {
    const p = this.game.player.position;
    _v.set(p.x - this.pos.x, 0, p.z - this.pos.z);
    const d = _v.length();
    const fwd = _v.x * Math.sin(this.yaw) + _v.z * Math.cos(this.yaw);
    const side = Math.abs(-_v.x * Math.cos(this.yaw) + _v.z * Math.sin(this.yaw));
    return d < (this.spec.range ?? 2.6) + extra && fwd > 0.2 && side < 1.3 + extra * 0.5 && Math.abs(p.y + 1 - (this.pos.y + 0.2)) < 1.8;
  }

  // 0 (breathed out) .. 1 (breathed in).
  breathK() {
    const ph = this.breathPh;
    const s = (x) => x * x * (3 - 2 * x);
    return ph < 0.5 ? s(ph / 0.5) : 1 - s((ph - 0.5) / 0.5);
  }

  breathe(dt, d) {
    const near = clamp((11 - d) / 8, 0, 1);
    const rate = 0.16 + 0.36 * near * near;
    const prev = this.breathPh;
    this.breathPh = (prev + dt * rate) % 1;
    if (d > 15) return;
    const half = (0.5 / rate) * 0.9;
    if (this.breathPh < prev) this.game.audio.play('mawInhale', { pos: this.pos.clone(), arg: half });
    else if (prev < 0.5 && this.breathPh >= 0.5) this.game.audio.play('mawExhale', { pos: this.pos.clone(), arg: half });
  }

  think(dt) {
    const g = this.game;
    this.cool -= dt;
    this.flare = Math.max(0, this.flare - dt * 1.5);
    if (this.state === 'kill') {
      this.killThink();
      return;
    }
    const d = this.distToPlayer();
    const tm = this.model.timings?.lunge || { duration: 0.7, hit: 0.25 };
    if (this.state === 'dormant' || this.state === 'hurt') {
      this.breathe(dt, d);
      if (this.cool <= 0 && this.inReach() && !g.player.dead) this.strike();
    } else if (this.state === 'notice') {
      if (this.stateTime >= 0.28) {
        this.setState('lunge');
        this.bit = false;
        g.audio.play('mawLunge', { pos: this.pos.clone() });
      }
    } else if (this.state === 'lunge') {
      if (!this.bit && this.stateTime >= tm.hit) {
        this.bit = true;
        if (this.inReach(0.4)) {
          g.player.damage(this.cfg.damage, { cause: 'wallMaw', from: this.pos, killer: this });
          g.audio.play('mawBite', { pos: this.pos.clone() });
        }
      }
      if (this.stateTime >= tm.duration) {
        this.setState('retract');
        this.cool = 1.6;
      }
    } else if (this.state === 'retract') {
      if (this.stateTime >= 0.6) this.setState('dormant');
    }
  }

  // The tell: a sharp breath and the throat flares, then it strikes (think).
  // The caves' rhythm maws call this on their beat too.
  strike() {
    if (this.dead || (this.state !== 'dormant' && this.state !== 'hurt')) return;
    this.setState('notice');
    this.flare = 1.2;
    this.game.audio.play('mawGasp', { pos: this.pos.clone() });
  }

  // Kill-cam: out of the wall and around your head, looking down its throat.
  killThink() {
    const p = this.game.player;
    this.root.updateMatrixWorld();
    this.root.worldToLocal(this.reach.copy(p.camera.position));
    const throat = this.model.nodes?.mouth?.localToWorld(_v.set(0, 0, -0.2)) || this.pos;
    if (p.lookOverride) p.lookOverride.target.copy(throat);
    else p.lookAt(throat, 2, 10);
    p.lookOverride.time = 2;
  }

  onKillCam() {
    const g = this.game;
    setTimeout(() => g.state === 'dead' && g.fx.fadeTo(0.55, 2.4, 0x3a0202), 560);
  }

  animate(dt) {
    const b = this.breathK();
    const glow = this.dead ? 0 : this.state === 'kill' ? 1.1 : 0.18 + 0.45 * b + this.flare;
    if (this.sources[0]) this.sources[0].intensity = 0.15 + 1.2 * glow;
    this.model.animate(dt, this.game.time, {
      state: this.state,
      stateTime: this.stateTime,
      speed: 0,
      attackT: 0,
      breath: this.state === 'dormant' || this.state === 'hurt' ? b : 0.3,
      glow,
      reach: this.state === 'kill' ? this.reach : null,
    });
  }
}

export const ENEMY_TYPES = {
  acolyte: Acolyte,
  hound: Hound,
  skinless: Skinless,
  drowned: Drowned,
  lamprey: Lamprey,
  wallMaw: WallMaw,
};

export { clamp, wrapAngle };
