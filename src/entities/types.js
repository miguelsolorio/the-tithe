import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { clamp, wrapAngle } from '../core/utils.js';

// Enemy types. Numbers are tuned for a knife-first game where guns are scarce.

const _v = new THREE.Vector3();

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
    });
  }

  onState(s, prev) {
    // Praying acolytes chant; the chant stops when they notice you.
    if (s === 'pray' && !this.loop) this.loop = this.game.audio.loop('chantLoop', { pos: this.eye().clone(), gain: 0.55 });
    if (prev === 'pray' && s !== 'pray') {
      this.loop?.stop(0.4);
      this.loop = null;
    }
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
    });
    if (!spec.idle) this.idleMode = 'sniff';
    this.setState(this.initialState());
    this.snarlT = 0;
  }

  onNotice() {
    this.game.audio.play('snarl', { pos: this.eye().clone() });
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
    });
    this.screamT = 0;
  }

  onNotice() {
    this.game.audio.play('skinlessScream', { pos: this.eye().clone() });
  }

  animate(dt) {
    if (this.state === 'notice') {
      this.model.animate(dt, this.game.time, { state: 'scream', stateTime: this.stateTime, speed: 0, attackT: 0 });
      return;
    }
    super.animate(dt);
  }

  think(dt) {
    super.think(dt);
    if (this.state === 'chase') {
      this.screamT -= dt;
      if (this.screamT <= 0) {
        this.screamT = 4 + Math.random() * 4;
        this.game.audio.play('skinlessScream', { pos: this.eye().clone(), gain: 0.6 });
      }
    }
  }
}

// Bloated corpses that rise out of the water (or stand up from a table).
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
    });
    this.gurgleT = 2 + Math.random() * 3;
  }

  wake() {
    if (this.state === 'dormant' || this.state === 'seated') {
      this.setState('rise');
      this.game.audio.play('drownedRise', { pos: this.eye().clone() });
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
  }
}

// Eel on human hands: hides under water, lunges when you pass, then crawls after you.
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
    });
    if (!spec.idle) {
      this.idleMode = 'dormant';
      this.setState('dormant');
    }
    this.lungeCd = 0;
  }

  wake() {
    if (this.state === 'dormant') this.startLunge(true);
  }

  startLunge(ambush) {
    this.setState('lunge');
    this.lungeHit = false;
    this.game.audio.play('lamprey', { pos: this.eye().clone() });
    if (ambush) {
      this.game.audio.play('screech', { gain: 0.5 });
      this.game.enemies.spotted(this, true);
    }
    this.lungeCd = 4;
  }

  thinkExtra(dt, d) {
    const g = this.game;
    if (this.state === 'dormant') {
      if (d < (this.spec.wakeRadius ?? 5.5) && Math.abs(g.player.position.y - this.pos.y) < 2) this.wake();
      return;
    }
    if (this.state === 'lunge') {
      const tm = this.model.timings?.lunge || { duration: 0.9, hit: 0.45 };
      const p = g.player.position;
      if (this.stateTime < tm.hit) {
        this.face(p, dt, 2);
        // Burst forward.
        const s = 7 * (1 - this.stateTime / tm.duration);
        this.level.physics.move(this.move, Math.sin(this.yaw) * s * dt, Math.cos(this.yaw) * s * dt, dt);
        this.speed = s;
      }
      if (!this.lungeHit && this.stateTime >= tm.hit) {
        this.lungeHit = true;
        this.tryHit();
      }
      if (this.stateTime >= tm.duration) this.setState('chase');
    }
  }

  think(dt) {
    this.lungeCd -= dt;
    if (this.state === 'chase' && this.lungeCd <= 0 && this.seesPlayer) {
      const d = this.distToPlayer();
      if (d > 2.5 && d < 4.5) {
        this.startLunge(false);
        return;
      }
    }
    super.think(dt);
  }

  animate(dt) {
    let st = this.state;
    if (st === 'chase' || st === 'search') st = 'crawl';
    if (['dormant', 'lunge', 'crawl', 'attack', 'hurt', 'dead'].includes(st)) {
      this.model.animate(dt, this.game.time, { state: st, stateTime: this.stateTime, speed: this.speed, attackT: this.attackT });
      return;
    }
    super.animate(dt);
  }
}

// A toothed mouth in the flesh wall. Stationary; lunges when you pass in front of it.
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
    });
    this.idleMode = 'dormant';
    this.setState('dormant');
    this.cool = 0;
    this.breath = null;
  }

  perceive() {
    return false;
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

  think(dt) {
    const g = this.game;
    this.cool -= dt;
    const d = this.distToPlayer();
    if (d < 9 && !this.breath) this.breath = g.audio.loop('mawBreath', { pos: this.pos.clone(), gain: 0.7 });
    if (d > 11 && this.breath) {
      this.breath.stop(0.6);
      this.breath = null;
    }
    const tm = this.model.timings?.lunge || { duration: 0.7, hit: 0.25 };
    if (this.state === 'dormant' || this.state === 'hurt') {
      if (this.cool <= 0 && this.inReach() && !g.player.dead) {
        this.setState('lunge');
        this.bit = false;
        g.audio.play('mawLunge', { pos: this.pos.clone() });
      }
    } else if (this.state === 'lunge') {
      if (!this.bit && this.stateTime >= tm.hit) {
        this.bit = true;
        if (this.inReach(0.4)) {
          g.player.damage(this.cfg.damage, { cause: 'wallMaw' });
          g.audio.play('chomp', { pos: this.pos.clone() });
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

  die(w) {
    super.die(w);
    this.breath?.stop(0.5);
    this.breath = null;
  }

  dispose() {
    this.breath?.stop(0.1);
    super.dispose();
  }

  animate(dt) {
    this.model.animate(dt, this.game.time, { state: this.state, stateTime: this.stateTime, speed: 0, attackT: 0 });
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
