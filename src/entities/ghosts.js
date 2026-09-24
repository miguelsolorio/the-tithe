import * as THREE from 'three';
import { Entity } from './entity.js';
import { makeWraith, makeWeeper, makeShadowFigure } from './models.js';
import { rand } from '../core/rng.js';
import { getHeight } from '../world/terrain.js';
import { yawTo } from '../core/utils.js';

// ======================= WRAITH =======================
// Drifts between the trees. Drains sanity up close. Dissolves in the beam.
export class Wraith extends Entity {
  constructor(game, spawn) {
    super(game, 'wraith');
    this.major = true;
    this.height = 2.3;
    this.m = makeWraith();
    this.group.add(this.m.root);
    this.group.position.copy(spawn);
    this.opacity = 0;
    this.litTime = 0;
    this.target = new THREE.Vector3();
    this.retarget = 0;
    this.whisper = rand(2, 5);
    this.setState('drift');
  }

  update(dt) {
    const g = this.game;
    const pl = g.player;
    const d = this.distToPlayer();
    const t = g.time;
    this.m.mat.uniforms.uTime.value = t;
    this.m.arms.forEach((a, i) => (a.rotation.x = -1.0 + Math.sin(t * 1.3 + i) * 0.2));

    if (this.state === 'drift') {
      this.opacity = Math.min(1, this.opacity + dt * 0.5);
      this.retarget -= dt;
      if (this.retarget <= 0) {
        this.retarget = rand(4, 7);
        const p = pl.position;
        this.target.set(p.x + rand(-5, 5), 0, p.z + rand(-5, 5));
      }
      this.moveTowards(this.target.x, this.target.z, d < 10 ? 1.6 : 1.1, dt, { collide: false, turnRate: 2 });
      this.pos.y += 0.25 + Math.sin(t * 1.2) * 0.12;

      if (d < 7) {
        pl.hitSanity((7 - d) * 0.9 * dt);
        pl.flickerBoost = Math.max(pl.flickerBoost, 1 - d / 7);
        this.whisper -= dt;
        if (this.whisper <= 0) {
          this.whisper = rand(2.5, 4.5);
          g.audio.whisper(this.center().clone(), 1.2);
        }
      }
      if (d < 1.1) {
        // It passes right through you.
        pl.hitSanity(14);
        g.audio.sting(0.8);
        g.fx.burst(0.9);
        g.camRig.shake(0.4);
        this.setState('fade');
      } else if (this.isLit(1.4)) {
        this.litTime += dt;
        if (this.litTime > 1.3) {
          g.audio.moan(this.center().clone(), 1.2);
          this.setState('fade');
        }
      } else {
        this.litTime = Math.max(0, this.litTime - dt * 0.5);
      }
      if (this.age > 75 || d > 60) this.setState('fade');
    } else if (this.state === 'fade') {
      this.opacity -= dt * 1.2;
      this.pos.y += dt * 0.6;
      if (this.opacity <= 0) this.remove();
    }
    const lightFade = 1 - Math.min(1, this.litTime / 1.3) * 0.8;
    this.m.mat.uniforms.uOpacity.value = Math.max(0, this.opacity) * lightFade;
  }
}

// ======================= WEEPING WOMAN =======================
// Stands on the trail ahead, back turned, crying. Don't get close. Don't shine your light on her.
export class WeepingWoman extends Entity {
  constructor(game, spawn) {
    super(game, 'weeper');
    this.major = true;
    this.height = 1.7;
    this.m = makeWeeper();
    this.group.add(this.m.root);
    this.group.position.copy(spawn);
    this.litTime = 0;
    this.unseen = 0;
    this.sound = game.audio.weep(spawn);
    this.setState('weep');
  }

  update(dt) {
    const g = this.game;
    const pl = g.player;
    const p = pl.position;
    const d = this.distToPlayer();
    const t = g.time;
    this.m.gownMat.uniforms.uTime.value = t;

    if (this.state === 'weep') {
      // Keep her back to you.
      this.group.rotation.y = yawTo(this.pos.x - p.x, this.pos.z - p.z);
      this.m.root.position.y = Math.sin(t * 2.4) * 0.015; // shoulders shaking
      this.m.head.rotation.x = 0.35 + Math.sin(t * 5) * 0.04;
      if (this.isLit(1.4)) this.litTime += dt;
      if (d < 8 || this.litTime > 0.7) {
        // She's suddenly right in front of you.
        this.sound.stop();
        const cam = g.camera;
        const fwd = new THREE.Vector3();
        cam.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const x = cam.position.x + fwd.x * 2.2;
        const z = cam.position.z + fwd.z * 2.2;
        this.group.position.set(x, getHeight(x, z) + 0.1, z);
        this.group.rotation.y = yawTo(cam.position.x - x, cam.position.z - z);
        this.m.head.rotation.set(-0.1, 0, 0);
        this.m.gownMat.uniforms.uBase.value = 0.9;
        g.audio.scream(null, 1);
        g.audio.sting(1);
        g.fx.burst(1);
        g.camRig.shake(0.7);
        pl.hitSanity(12);
        this.setState('scare');
      }
      if (!this.isOnScreen()) this.unseen += dt;
      else this.unseen = 0;
      if (this.unseen > 6 || d > 55 || this.age > 70) this.remove();
    } else if (this.state === 'scare') {
      this.group.position.y += dt * 0.5;
      if (this.stateTime > 0.45) this.remove();
    }
  }

  onRemove() {
    this.sound.stop();
  }
}

// ======================= HALLUCINATION =======================
// Only when sanity is low: a silhouette at the edge of your vision that's gone when you look.
export class ShadowFigure extends Entity {
  constructor(game, spawn) {
    super(game, 'shadow');
    this.rig = makeShadowFigure();
    this.group.add(this.rig.root);
    this.group.position.copy(spawn);
    this.height = 2;
    game.audio.whisper(new THREE.Vector3(spawn.x, spawn.y + 1.6, spawn.z), 0.8);
  }

  update(dt) {
    this.facePlayer(dt, 10);
    const looked = this.isLookedAt(0.9, 40);
    if (looked || this.age > 2.2) {
      this.rig.material.opacity -= dt * (looked ? 8 : 2);
      if (this.rig.material.opacity <= 0) this.remove();
    }
  }
}
