import * as THREE from 'three';
import { Entity, pointOnScreen } from './entity.js';
import { makeStalker, makeWendigo } from './models.js';
import { rand, chance } from '../core/rng.js';
import { clamp, damp, yawTo } from '../core/utils.js';
import { getHeight } from '../world/terrain.js';
import { CONFIG } from '../config.js';

const _v = new THREE.Vector3();

// ======================= THE STALKER =======================
// A tall faceless figure. Appears behind trees, just out of view, a little
// closer every time. Looking at him hurts. Letting him reach you is the end.
export class Stalker extends Entity {
  constructor(game) {
    super(game, 'stalker');
    this.height = 3;
    this.radius = 0.35;
    this.m = makeStalker();
    this.group.add(this.m.root);
    this.group.visible = false;
    this.active = false;
    this.timer = 14;
    this.lookTime = 0;
    this.firstSeen = false;
    this.staticLevel = 0;
    this.seen = false;
    this.setState('hidden');
  }

  get relics() {
    return this.game.objectives.count;
  }

  params() {
    const n = this.relics;
    return {
      interval: Math.max(12, 36 - n * 5),
      minD: Math.max(12, 30 - n * 3.5),
      creep: n >= 3 ? 0.6 + (n - 3) * 0.5 : 0,
    };
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.timer = 10;
  }

  teleport() {
    const g = this.game;
    const p = g.player.position;
    const { minD } = this.params();
    const trees = g.grid.treesInRing(p.x, p.z, minD, minD + 10);
    for (let i = trees.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [trees[i], trees[j]] = [trees[j], trees[i]];
    }
    let spot = null;
    for (const t of trees.slice(0, 30)) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      const x = t.x + (dx / d) * (t.r + 0.5);
      const z = t.z + (dz / d) * (t.r + 0.5);
      if (Math.hypot(x, z) > CONFIG.world.radius - 4) continue;
      if (pointOnScreen(_v.set(x, getHeight(x, z) + 1.5, z), 1.6)) continue;
      if (g.grid.overlaps(x, z, 0.3)) continue;
      spot = { x, z };
      break;
    }
    if (!spot) {
      const a = g.camRig.yaw + Math.PI + rand(-0.8, 0.8);
      const r = minD + rand(0, 6);
      spot = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r };
    }
    this.group.position.set(spot.x, getHeight(spot.x, spot.z), spot.z);
    this.group.rotation.y = yawTo(p.x - spot.x, p.z - spot.z);
    this.group.visible = true;
    this.lookTime = 0;
    this.seen = false;
    this.setState('present');
    if (chance(0.5)) g.audio.twig(_v.set(spot.x, this.pos.y + 0.2, spot.z).clone());
  }

  vanish() {
    this.group.visible = false;
    this.timer = this.params().interval * rand(0.8, 1.25);
    this.setState('hidden');
  }

  update(dt) {
    const g = this.game;
    const pl = g.player;
    const t = g.time;
    let staticTarget = 0;

    for (const s of this.m.tendrils) {
      s.seg.rotation.y = Math.sin(t * 1.1 + s.i * 1.7 + s.k * 0.7) * 0.35;
      s.seg.rotation.x = Math.cos(t * 0.9 + s.i + s.k * 0.5) * 0.25;
    }

    if (!this.active) return;
    if (this.state === 'hidden') {
      this.timer -= dt;
      if (this.timer <= 0 && !pl.inSafe && !pl.dead) this.teleport();
    } else if (this.state === 'present') {
      const d = this.distToPlayer();
      this.facePlayer(dt, 30);
      if (pl.inSafe) {
        this.vanish();
      } else if (this.isVisible(45)) {
        this.lookTime += dt;
        const close = 1 - clamp(d / 40, 0, 1);
        staticTarget = 0.2 + close * 0.8;
        pl.hitSanity((1.5 + this.relics * 0.8) * (0.5 + close) * dt);
        pl.flickerBoost = Math.max(pl.flickerBoost, close);
        if (!this.firstSeen) {
          this.firstSeen = true;
          g.hud.notice('Something is watching you.', 4, true);
          g.audio.sting(0.8);
          g.fx.burst(0.6);
        } else if (!this.seen) {
          g.audio.staticBurst(0.5 + close * 0.5);
        }
        this.seen = true;
        if (this.lookTime > 2.4) {
          g.fx.burst(0.5);
          this.vanish();
        }
      } else {
        const { creep } = this.params();
        if (creep > 0 && !this.isOnScreen()) {
          this.moveTowards(pl.position.x, pl.position.z, creep, dt, { face: false, collide: false });
        }
      }
      if (this.state === 'present') {
        if (this.stateTime > 24) this.vanish();
        else if (d < 2.0) this.catch();
      }
    } else if (this.state === 'caught') {
      staticTarget = 1;
    }
    this.staticLevel += (staticTarget - this.staticLevel) * damp(8, dt);
  }

  catch() {
    const g = this.game;
    const cam = g.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const x = cam.position.x + fwd.x * 1.6;
    const z = cam.position.z + fwd.z * 1.6;
    this.group.position.set(x, cam.position.y - 2.75, z);
    this.group.rotation.y = yawTo(cam.position.x - x, cam.position.z - z);
    this.group.visible = true;
    this.setState('caught');
    g.fx.burst(1);
    g.audio.sting(1.2);
    g.audio.staticBurst(1);
    g.player.kill('stalker');
  }
}

// ======================= WENDIGO =======================
// Hunts by light and sound. Sprinting or shining your light draws it in; go
// dark and walk slowly to lose it. It will not come near the fire.
export class Wendigo extends Entity {
  constructor(game, spawn) {
    super(game, 'wendigo');
    this.major = true;
    this.height = 2.4;
    this.radius = 0.45;
    this.m = makeWendigo();
    this.group.add(this.m.root);
    this.group.position.copy(spawn);
    const p = game.player.position;
    this.lastKnown = new THREE.Vector3(p.x + rand(-12, 12), 0, p.z + rand(-12, 12));
    this.crawl = 0;
    this.attackCd = 0;
    this.lostTime = 0;
    this.moveSpeed = 0;
    this.shriekCd = 0;
    this.jawOpen = 0;
    game.audio.shriek(_v.set(spawn.x, spawn.y + 2, spawn.z).clone(), 0.9);
    this.setState('roam');
  }

  perceive() {
    const pl = this.game.player;
    const d = this.distToPlayer();
    if (d < 5) return true;
    const lit = pl.lightActive && pl.strength > 0.4;
    if (lit && d < 14) return true;
    if (lit && d < 32 && !this.game.grid.segmentBlocked(this.pos.x, this.pos.z, pl.position.x, pl.position.z, 0.6, 0.6))
      return true;
    return d < pl.noise * 24;
  }

  shriek() {
    if (this.shriekCd > 0) return;
    this.shriekCd = 6;
    this.jawOpen = 1.4;
    this.game.audio.shriek(this.center().clone(), 1.2);
    this.game.camRig.shake(0.15);
  }

  update(dt) {
    const g = this.game;
    const pl = g.player;
    const p = pl.position;
    const d = this.distToPlayer();
    this.attackCd -= dt;
    this.shriekCd -= dt;
    let speed = 0;
    let crawlTarget = 0;

    if (pl.inSafe && d < 32 && this.state !== 'leave') {
      this.shriek();
      this.setState('leave');
    }

    switch (this.state) {
      case 'roam': {
        speed = 1.9;
        const rem = this.moveTowards(this.lastKnown.x, this.lastKnown.z, speed, dt, { turnRate: 3 });
        if (rem < 1.5) this.lastKnown.set(p.x + rand(-14, 14), 0, p.z + rand(-14, 14));
        if (this.perceive()) {
          this.shriek();
          this.setState('chase');
        } else if (this.stateTime > 75) this.setState('leave');
        break;
      }
      case 'chase': {
        crawlTarget = 1;
        speed = 5.7;
        if (this.perceive()) {
          this.lastKnown.copy(p);
          this.lostTime = 0;
        } else this.lostTime += dt;
        const rem = this.moveTowards(this.lastKnown.x, this.lastKnown.z, speed, dt, { turnRate: 10 });
        if (this.lostTime > 2.5 || (rem < 1 && this.lostTime > 0)) this.setState('search');
        if (d < 1.9 && this.attackCd <= 0) {
          this.attackCd = 1.8;
          this.jawOpen = 1;
          g.audio.snarl(this.center().clone(), 1.4);
          pl.damage(34, 'wendigo');
          this.setState('recoil');
        }
        break;
      }
      case 'recoil': {
        // Backs off after a hit, giving you a moment to kill the light and slip away.
        crawlTarget = 1;
        speed = 4.2;
        this.moveAway(p.x, p.z, speed, dt, { face: false });
        this.facePlayer(dt, 6);
        if (this.stateTime > 2.2) this.setState(this.perceive() ? 'chase' : 'search');
        break;
      }
      case 'search': {
        crawlTarget = 0.35;
        this.m.head.rotation.y = Math.sin(this.stateTime * 2.2) * 0.9;
        if (this.perceive()) {
          this.m.head.rotation.y = 0;
          this.shriek();
          this.setState('chase');
        } else if (this.stateTime > 6) {
          this.m.head.rotation.y = 0;
          this.lastKnown.set(p.x + rand(-25, 25), 0, p.z + rand(-25, 25));
          this.setState('roam');
        }
        break;
      }
      case 'leave': {
        speed = 3.6;
        this.moveAway(p.x, p.z, speed, dt);
        if (d > 60) this.remove();
        break;
      }
    }
    this.animate(dt, speed, crawlTarget);
  }

  animate(dt, speed, crawlTarget) {
    const m = this.m;
    const t = this.game.time;
    this.moveSpeed += (speed - this.moveSpeed) * damp(6, dt);
    this.crawl += (crawlTarget - this.crawl) * damp(4, dt);
    const c = this.crawl;
    const s = this.moveSpeed;
    m.phase += dt * (1.5 + s * 1.7);
    const amp = Math.min(0.9, 0.15 + s * 0.14);

    m.hips.position.y = 1.25 - c * 0.45 + Math.abs(Math.sin(m.phase)) * 0.05 * c;
    m.torso.rotation.x = c * 1.2;
    m.neck.rotation.x = -c * 1.05;
    m.legs.forEach((l, i) => {
      const ph = m.phase + i * Math.PI;
      l.hip.rotation.x = Math.sin(ph) * amp - c * 0.3;
      l.knee.rotation.x = Math.max(0, Math.sin(ph + 1.2)) * amp * 1.3 + c * 0.5;
    });
    m.arms.forEach((a, i) => {
      const ph = m.phase + i * Math.PI + Math.PI / 2;
      a.sh.rotation.x = -c * 1.55 + Math.sin(ph) * amp * (0.2 + c * 0.8);
      a.el.rotation.x = -0.2 - c * 0.2;
      a.sh.rotation.z = (i ? -1 : 1) * (0.08 + (1 - c) * 0.05);
    });
    // Twitch
    if (chance(dt * 1.5)) m.head.rotation.z = rand(-0.5, 0.5);
    m.head.rotation.z *= 1 - damp(3, dt);
    this.jawOpen = Math.max(0, this.jawOpen - dt);
    m.jaw.rotation.x = Math.min(1, this.jawOpen) * 0.6 + Math.sin(t * 9) * 0.03;
  }
}
