import * as THREE from 'three';
import { damp, wrapAngle } from '../core/utils.js';
import { getCreatureBuilder } from './enemy.js';

// Your sister after you cut her free: follows your trail through the flooding
// house (breadcrumbs, so she never needs pathfinding), keeps up when you run,
// and is re-placed behind you whenever you change level.

export class Sister {
  constructor(game) {
    this.game = game;
    this.model = null;
    this.level = null;
    this.trail = [];
    this.speed = 0;
    this.yaw = 0;
    this.sobT = 6;
    this.state = 'idle';
    this.stateTime = 0;
    game.events.on('levelEnter', () => this.onLevel());
  }

  get active() {
    return this.game.flags.has('sister.free');
  }

  onLevel() {
    this.remove();
    if (!this.active) return;
    this.level = this.game.levels.current;
    const build = getCreatureBuilder();
    this.model = (build && safe(() => build('sister'))) || fallbackModel();
    this.level.group.add(this.model.root);
    this.trail = [];
    this.placeBehindPlayer();
  }

  placeBehindPlayer() {
    if (!this.model) return;
    const p = this.game.player;
    const back = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const ph = this.level.physics;
    let pos = p.position.clone();
    for (const d of [1.6, 1.0, 0.6]) {
      const c = p.position.clone().addScaledVector(back, d);
      if (ph.lineOfSight(p.position.clone().setY(p.position.y + 0.8), c.clone().setY(c.y + 0.8))) {
        pos = c;
        break;
      }
    }
    const g = ph.groundAt(pos.x, pos.z, pos.y + 1);
    if (g.y > -Infinity) pos.y = g.y;
    this.model.root.position.copy(pos);
    this.yaw = p.yaw + Math.PI;
    this.state = 'idle';
    this.stateTime = 0;
  }

  remove() {
    if (this.model) {
      this.model.root.removeFromParent();
      this.model.dispose?.();
    }
    this.model = null;
  }

  update(dt) {
    if (!this.model || !this.active) return;
    const g = this.game;
    const p = g.player.position;
    const pos = this.model.root.position;
    this.stateTime += dt;
    // Breadcrumbs.
    const last = this.trail[this.trail.length - 1];
    if (!last || last.distanceTo(p) > 0.5) this.trail.push(p.clone());
    if (this.trail.length > 80) this.trail.shift();
    // Follow the oldest crumb that keeps her ~1.8 m behind.
    while (this.trail.length > 1 && this.trail[0].distanceTo(pos) < 0.4) this.trail.shift();
    const distToPlayer = pos.distanceTo(p);
    let target = this.trail[0];
    let want = 0;
    if (target && distToPlayer > 1.8) {
      const far = distToPlayer > 4;
      want = far ? Math.min(5.8, g.player.sprinting ? 5.6 : 3.6) : 2.6;
    }
    if (distToPlayer > 14) {
      // Lost: catch up out of sight.
      this.placeBehindPlayer();
      this.trail = [];
      return;
    }
    this.speed += (want - this.speed) * damp(6, dt);
    if (target && this.speed > 0.05) {
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        const step = Math.min(d, this.speed * dt);
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        pos.y += (target.y - pos.y) * Math.min(1, dt * 8);
        const wantYaw = Math.atan2(dx, dz);
        this.yaw += wrapAngle(wantYaw - this.yaw) * damp(8, dt);
      }
    } else {
      // Face you while waiting.
      const wantYaw = Math.atan2(p.x - pos.x, p.z - pos.z);
      this.yaw += wrapAngle(wantYaw - this.yaw) * damp(3, dt);
    }
    this.model.root.rotation.y = this.yaw;
    const st = this.speed > 3 ? 'run' : this.speed > 0.3 ? 'walk' : 'idle';
    if (st !== this.state) {
      this.state = st;
      this.stateTime = 0;
    }
    this.model.animate(dt, g.time, { state: st, stateTime: this.stateTime, speed: this.speed, attackT: 0 });
    this.sobT -= dt;
    if (this.sobT <= 0) {
      this.sobT = 9 + Math.random() * 10;
      g.audio.play('sisterSob', { pos: pos.clone().setY(pos.y + 1.4), gain: 0.6 });
    }
  }
}

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    console.error('[sister] model failed', e);
    return null;
  }
}

function fallbackModel() {
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xbfb6ac, roughness: 0.8 }));
  m.position.y = 0.8;
  root.add(m);
  return { root, animate() {}, dispose() {} };
}
