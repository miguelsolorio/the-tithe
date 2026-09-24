import * as THREE from 'three';
import { Entity } from './entity.js';
import { makeCrow, makeWolf, makeDeer, makeOwl } from './models.js';
import { getHeight } from '../world/terrain.js';
import { damp, lerpAngle, yawTo, wrapAngle } from '../core/utils.js';
import { rand, chance } from '../core/rng.js';

const _v = new THREE.Vector3();

// ======================= CROWS =======================
// Perched on dead branches. Burst into the air when you come close.
export class CrowFlock extends Entity {
  constructor(game, perch) {
    super(game, 'crows');
    this.perch = perch;
    this.crows = perch.points.slice(0, 7).map((p) => {
      const m = makeCrow();
      m.root.position.copy(p);
      m.root.rotation.y = rand(0, Math.PI * 2);
      m.home = p.clone();
      m.vel = new THREE.Vector3();
      m.flap = rand(0, 6);
      game.scene.add(m.root);
      return m;
    });
    this.mid = new THREE.Vector3(perch.x, getHeight(perch.x, perch.z) + 5, perch.z);
    this.setState('perched');
  }

  reset() {
    for (const c of this.crows) {
      c.root.position.copy(c.home);
      c.root.visible = true;
      c.wings.forEach((w, i) => (w.rotation.z = (i ? 1 : -1) * -0.1));
    }
    this.setState('perched');
  }

  update(dt) {
    const g = this.game;
    const p = g.player.position;
    const d = Math.hypot(p.x - this.perch.x, p.z - this.perch.z);
    if (d > 80 && this.state === 'perched') return;

    if (this.state === 'perched') {
      for (const c of this.crows) {
        if (chance(dt * 0.4)) c.root.rotation.y += rand(-0.8, 0.8);
      }
      const lit = d < 22 && g.player.isPointLit(_v.copy(this.mid).setY(this.mid.y - 1));
      if (d < 9 || (g.player.sprinting && d < 18) || (lit && d < 16)) {
        this.setState('flying');
        g.audio.flutter(this.mid);
        g.audio.caw(this.mid, 3);
        setTimeout(() => g.audio.caw(this.mid, 2), 700);
        for (const c of this.crows) {
          const a = rand(0, Math.PI * 2);
          c.vel.set(Math.cos(a) * rand(3, 6), rand(3, 5.5), Math.sin(a) * rand(3, 6));
          c.root.rotation.y = yawTo(c.vel.x, c.vel.z);
        }
      }
    } else if (this.state === 'flying') {
      for (const c of this.crows) {
        c.vel.y += dt * 0.4;
        c.root.position.addScaledVector(c.vel, dt);
        c.flap += dt * 22;
        c.wings[0].rotation.z = Math.sin(c.flap) * 0.9;
        c.wings[1].rotation.z = -Math.sin(c.flap) * 0.9;
      }
      if (this.stateTime > 6) {
        for (const c of this.crows) c.root.visible = false;
        this.setState('gone');
      }
    } else if (this.state === 'gone') {
      if (this.stateTime > 150 && d > 50) this.reset();
    }
  }

  onRemove() {
    for (const c of this.crows) this.game.scene.remove(c.root);
  }
}

// ======================= OWL =======================
export class Owl extends Entity {
  constructor(game, spot) {
    super(game, 'owl');
    this.model = makeOwl();
    this.group.add(this.model.root);
    this.group.position.copy(spot);
    this.hootTimer = rand(8, 30);
    this.blink = 0;
    this.closed = 0;
  }

  update(dt) {
    const g = this.game;
    const p = g.player.position;
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (d > 60) return;
    // Head swivels to follow you, a little too far.
    const want = yawTo(p.x - this.pos.x, p.z - this.pos.z);
    this.model.head.rotation.y = lerpAngle(this.model.head.rotation.y, want, damp(2, dt));

    this.blink -= dt;
    if (this.blink <= 0) this.blink = rand(2, 6);
    if (d < 15 && this.isLit(0.3)) this.closed = 2.5;
    this.closed = Math.max(0, this.closed - dt);
    const open = this.closed <= 0 && this.blink > 0.12;
    this.model.eyes.forEach((e) => (e.visible = open));

    this.hootTimer -= dt;
    if (this.hootTimer <= 0 && d < 35) {
      this.hootTimer = rand(18, 45);
      g.audio.hoot(this.pos);
    }
  }
}

// ======================= WOLF PACK =======================
// Circles just outside your light. The beam drives them back. Darkness makes them brave.
export class WolfPack extends Entity {
  constructor(game, spawn) {
    super(game, 'wolves');
    this.major = true;
    this.life = rand(55, 80);
    const n = chance(0.5) ? 3 : 2;
    this.wolves = [];
    for (let i = 0; i < n; i++) {
      const m = makeWolf();
      m.root.position.set(spawn.x + rand(-3, 3), 0, spawn.z + rand(-3, 3));
      m.root.position.y = getHeight(m.root.position.x, m.root.position.z);
      game.scene.add(m.root);
      this.wolves.push({
        m,
        pos: m.root.position,
        state: 'approach',
        stateTime: 0,
        angle: rand(0, Math.PI * 2),
        dir: chance(0.5) ? 1 : -1,
        r: rand(8, 11),
        courage: 0,
        speed: 0,
        growl: rand(3, 8),
      });
    }
    this.group.position.copy(spawn);
    game.audio.howl(new THREE.Vector3(spawn.x, spawn.y + 1, spawn.z), 1.2);
    this.leaving = false;
  }

  setWolf(w, s) {
    w.state = s;
    w.stateTime = 0;
  }

  moveWolf(w, x, z, speed, dt) {
    const dx = x - w.pos.x;
    const dz = z - w.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, speed * dt);
      w.pos.x += (dx / d) * step;
      w.pos.z += (dz / d) * step;
      this.game.grid.resolve(w.pos, 0.35);
      w.m.root.rotation.y = lerpAngle(w.m.root.rotation.y, yawTo(dx, dz), damp(8, dt));
    }
    w.pos.y = getHeight(w.pos.x, w.pos.z);
    w.speed = Math.min(speed, d / Math.max(dt, 0.001));
    return d;
  }

  update(dt) {
    const g = this.game;
    const pl = g.player;
    const p = pl.position;
    const dark = !pl.lightActive || pl.strength < 0.3;
    this.life -= dt;
    if (!this.leaving && (this.life <= 0 || pl.inSafe)) {
      this.leaving = true;
      for (const w of this.wolves) this.setWolf(w, 'leave');
      g.audio.howl(new THREE.Vector3(this.wolves[0].pos.x, p.y + 1, this.wolves[0].pos.z), 0.8);
    }

    for (const w of this.wolves) {
      if (w.gone) continue;
      w.stateTime += dt;
      const dx = w.pos.x - p.x;
      const dz = w.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const lit = d < 30 && pl.isPointLit(_v.set(w.pos.x, w.pos.y + 0.6, w.pos.z));

      switch (w.state) {
        case 'approach': {
          const tx = p.x + Math.cos(w.angle) * w.r;
          const tz = p.z + Math.sin(w.angle) * w.r;
          if (this.moveWolf(w, tx, tz, 5, dt) < 1.5) this.setWolf(w, 'circle');
          if (lit && d < 16) this.setWolf(w, 'flee');
          break;
        }
        case 'circle': {
          w.angle += (w.dir * 2.8 * dt) / w.r;
          const tx = p.x + Math.cos(w.angle) * w.r;
          const tz = p.z + Math.sin(w.angle) * w.r;
          this.moveWolf(w, tx, tz, 3.4, dt);
          // Look at the player while circling
          w.m.root.rotation.y = lerpAngle(w.m.root.rotation.y, yawTo(-dx, -dz), damp(3, dt));
          w.courage += dt * (dark ? 1 : 0.13);
          w.growl -= dt;
          if (w.growl <= 0) {
            w.growl = rand(4, 9);
            g.audio.growl(_v.set(w.pos.x, w.pos.y + 0.6, w.pos.z).clone(), 1);
          }
          if (lit) {
            w.courage = 0;
            g.audio.whimper(_v.set(w.pos.x, w.pos.y + 0.6, w.pos.z).clone());
            this.setWolf(w, 'flee');
          } else if (w.courage > (dark ? 2.2 : 9)) {
            g.audio.snarl(_v.set(w.pos.x, w.pos.y + 0.6, w.pos.z).clone());
            this.setWolf(w, 'lunge');
          }
          break;
        }
        case 'flee': {
          this.moveWolf(w, w.pos.x + (dx / d) * 5, w.pos.z + (dz / d) * 5, 7, dt);
          if (w.stateTime > rand(1.5, 2.4)) {
            w.r = rand(10, 13);
            w.angle = Math.atan2(dz, dx);
            this.setWolf(w, 'approach');
          }
          break;
        }
        case 'lunge': {
          this.moveWolf(w, p.x, p.z, 8.8, dt);
          if (lit && d > 2.5 && w.stateTime > 0.2) {
            g.audio.whimper(_v.set(w.pos.x, w.pos.y + 0.6, w.pos.z).clone());
            this.setWolf(w, 'flee');
          } else if (d < 1.5) {
            pl.damage(14, 'wolves');
            w.courage = 0;
            this.setWolf(w, 'flee');
          } else if (w.stateTime > 4) this.setWolf(w, 'flee');
          break;
        }
        case 'leave': {
          this.moveWolf(w, w.pos.x + (dx / (d || 1)) * 5, w.pos.z + (dz / (d || 1)) * 5, 7, dt);
          if (d > 40) {
            w.gone = true;
            g.scene.remove(w.m.root);
          }
          break;
        }
      }

      // Gallop / trot animation
      const m = w.m;
      m.phase += dt * (4 + w.speed * 2.2);
      const amp = Math.min(0.7, w.speed * 0.12);
      m.legs[0].rotation.x = Math.sin(m.phase) * amp;
      m.legs[1].rotation.x = Math.sin(m.phase + 0.6) * amp;
      m.legs[2].rotation.x = Math.sin(m.phase + Math.PI) * amp;
      m.legs[3].rotation.x = Math.sin(m.phase + Math.PI + 0.6) * amp;
      m.body.position.y = 0.62 + Math.abs(Math.sin(m.phase)) * amp * 0.08;
      m.neck.rotation.x = w.state === 'circle' ? 0.35 : 0.05; // head low and stalking
      m.tail.rotation.x = w.state === 'flee' ? 1.2 : 0.6;
    }
    if (this.wolves.every((w) => w.gone)) this.remove();
  }

  // Closest wolf distance, for the director's tension.
  nearest() {
    const p = this.game.player.position;
    let best = Infinity;
    for (const w of this.wolves) if (!w.gone) best = Math.min(best, Math.hypot(w.pos.x - p.x, w.pos.z - p.z));
    return best;
  }

  onRemove() {
    for (const w of this.wolves) this.game.scene.remove(w.m.root);
  }
}

// ======================= DEER =======================
// Stands still and stares. Up close its head turns the wrong way and it bolts.
export class Deer extends Entity {
  constructor(game, spawn) {
    super(game, 'deer');
    this.major = true;
    this.height = 1.6;
    this.m = makeDeer();
    this.group.add(this.m.root);
    this.group.position.copy(spawn);
    this.litTime = 0;
    this.twist = 0;
    this.setState('stare');
  }

  update(dt) {
    const g = this.game;
    const d = this.distToPlayer();
    const p = g.player.position;
    if (this.age > 60 || (d > 48 && this.state === 'stare')) return this.remove();

    switch (this.state) {
      case 'stare': {
        this.facePlayer(dt, 1.5);
        const rel = wrapAngle(yawTo(p.x - this.pos.x, p.z - this.pos.z) - this.group.rotation.y);
        this.m.neck.rotation.y = Math.max(-1, Math.min(1, rel));
        if (this.isLit(1.4)) this.litTime += dt;
        if (d < 10 || this.litTime > 1.6) {
          this.setState('twist');
          g.audio.crack(this.center().clone());
          this.m.eyeMat.color.setRGB(4, 0.6, 0.4);
        }
        break;
      }
      case 'twist': {
        this.twist = Math.min(1, this.twist + dt / 1.3);
        const e = this.twist * this.twist;
        this.m.head.rotation.z = e * Math.PI;
        this.m.neck.rotation.x = -e * 0.4;
        if (this.twist >= 1 && this.stateTime > 1.5) {
          g.player.hitSanity(7);
          g.audio.sting(0.5);
          g.camRig.shake(0.25);
          this.setState('bolt');
        }
        break;
      }
      case 'bolt': {
        this.moveAway(p.x, p.z, 24, dt, { collide: false, turnRate: 20 });
        this.m.phase += dt * 30;
        this.m.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.m.phase + (i < 2 ? 0 : Math.PI)) * 0.9));
        if (this.stateTime > 1.8) this.remove();
        break;
      }
    }
  }
}
