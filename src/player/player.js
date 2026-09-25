import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp, lerp } from '../core/utils.js';

// First-person controller: WASD + mouse look, sprint, flashlight, head bob,
// stairs, wading, drowning, health.

const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.camera.rotation.order = 'YXZ';
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.move = { pos: this.position, vy: 0, grounded: true, radius: CONFIG.player.radius, height: CONFIG.player.height, stepHeight: CONFIG.player.stepHeight };
    this.yaw = 0;
    this.pitch = 0;

    const f = CONFIG.flashlight;
    this.spot = new THREE.SpotLight(f.color, f.intensity, f.distance, f.angle, f.penumbra, f.decay);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.2;
    this.spot.shadow.camera.far = f.distance;
    this.spot.shadow.bias = -0.0005;
    this.spot.shadow.normalBias = 0.02;
    game.scene.add(this.spot, this.spot.target);
    // Soft fill around the player so the flashlight's edge never goes pitch black.
    this.fill = new THREE.PointLight(0xc8b8a0, 0, 7, 1.8);
    game.scene.add(this.fill);
    this.lightDir = new THREE.Vector3(0, 0, -1);
    this.reset();
  }

  reset() {
    this.health = CONFIG.player.maxHealth;
    this.dead = false;
    this.flashOn = false;
    this.frozen = false;
    this.velocity.set(0, 0, 0);
    this.move.vy = 0;
    this.move.grounded = true;
    this.eyeY = null;
    this.bob = 0;
    this.bobAmt = 0;
    this.stepDist = 0;
    this.lastHurt = -99;
    this.shake = 0;
    this.lookOverride = null;
    this.eyeScale = 1;
    this.eyeScaleTarget = 1;
    this.crouchZone = false;
    this.water = { depth: 0, surface: -Infinity };
    this.underwater = false;
    this.drownTimer = 0;
    this.speedScale = 1;
    this.noise = 0;
    this.moving = false;
    this.sprinting = false;
  }

  get eyeHeight() {
    return CONFIG.player.eye * this.eyeScale;
  }

  eyePosition(out = new THREE.Vector3()) {
    return out.copy(this.camera.position);
  }

  forward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }

  teleport(pos, yaw = this.yaw) {
    this.position.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this.move.vy = 0;
    this.move.grounded = true;
    this.eyeY = null;
    this.crouchZone = false;
    this.eyeScale = this.eyeScaleTarget = 1;
    this.updateCamera(0);
  }

  damage(amount, source = null) {
    if (this.dead || this.game.godMode || this.game.state !== 'playing') return;
    this.health = Math.max(0, this.health - amount);
    this.lastHurt = this.game.time;
    this.shake = Math.min(1, this.shake + amount / 30);
    this.game.fx.hit(Math.min(1, 0.25 + amount / 40));
    this.game.audio.play('hurt');
    this.game.hud.setHealth(this.health / CONFIG.player.maxHealth);
    if (source && source.isVector3) {
      // Knock the view slightly away from the hit.
      this.pitch += 0.03;
    }
    if (this.health <= 0) {
      this.dead = true;
      this.game.onPlayerDeath(source?.cause || null);
    }
  }

  heal(amount) {
    this.health = Math.min(CONFIG.player.maxHealth, this.health + amount);
    this.game.hud.setHealth(this.health / CONFIG.player.maxHealth);
  }

  toggleFlashlight() {
    this.flashOn = !this.flashOn;
    this.game.audio.play('dryFire', { gain: 0.35 });
  }

  update(dt) {
    const g = this.game;
    const input = g.input;
    const C = CONFIG.player;
    const level = g.levels.current;
    if (!level) return;

    // ---- Look ----
    const m = input.consumeMouse();
    this.lookDelta = m;
    if (!this.frozen && !this.dead) {
      this.yaw -= m.x * C.mouseSens * g.settings.sensitivity;
      this.pitch -= m.y * C.mouseSens * g.settings.sensitivity;
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    }
    if (this.lookOverride) {
      // Cutscene: ease the view toward a target point.
      const lo = this.lookOverride;
      const d = lo.target.clone().sub(this.camera.position);
      const ty = Math.atan2(-d.x, -d.z);
      const tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      const k = damp(lo.speed ?? 4, dt);
      let dy = ty - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * k;
      this.pitch += (tp - this.pitch) * k;
      lo.time -= dt;
      if (lo.time <= 0) this.lookOverride = null;
    }

    if (input.wasPressed('KeyF') && !this.dead) this.toggleFlashlight();
    this.eyeScale += (this.eyeScaleTarget - this.eyeScale) * damp(6, dt);

    // ---- Movement ----
    const water = level.waterAt(this.position.x, this.position.z, this.position.y);
    this.water = water;
    const { f, r } = this.frozen || this.dead ? { f: 0, r: 0 } : input.axis();
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    _wish.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, r);
    const moving = _wish.lengthSq() > 0;
    if (moving) _wish.normalize();
    const wantsSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.sprinting = wantsSprint && moving && f >= 0;
    let speed = this.sprinting ? C.sprintSpeed : C.walkSpeed;
    if (f < 0) speed *= 0.75;
    // Wading: deeper water, slower legs.
    const wade = clamp((water.depth - C.wadeStart) / 0.9, 0, 1);
    speed *= lerp(1, C.wadeMin, wade);
    if (this.crouchZone) speed *= 0.55;
    speed *= this.speedScale;
    _wish.multiplyScalar(moving ? speed : 0);
    const k = damp(C.accel * (1 - wade * 0.6), dt);
    this.velocity.x += (_wish.x - this.velocity.x) * k;
    this.velocity.z += (_wish.z - this.velocity.z) * k;
    this.move.height = C.height * this.eyeScale;
    level.physics.move(this.move, this.velocity.x * dt, this.velocity.z * dt, dt);
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    this.moving = hs > 0.4;
    // How loud we are (enemies hear this): sprinting and splashing carry.
    this.noise = hs < 0.3 ? 0 : (this.sprinting ? 1 : 0.45) + (water.depth > 0.1 ? 0.3 : 0);

    // ---- Footsteps ----
    if (this.move.grounded && hs > 0.5) {
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 0.95 : 0.75;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        let surface = this.move.groundCollider?.surface || 'wood';
        if (water.depth > 0.08) surface = 'water';
        g.audio.footstep(surface, { intensity: this.sprinting ? 1 : 0.65 });
      }
    }

    // ---- Drowning (flood) ----
    const eyeWorld = this.position.y + this.eyeHeight;
    const under = water.surface > eyeWorld - 0.05;
    if (under !== this.underwater) {
      this.underwater = under;
      g.audio.setUnderwater(under);
      if (under) g.audio.play('splash', { gain: 0.6 });
    }
    if (under) {
      this.drownTimer += dt;
      if (this.drownTimer > 2.5) {
        this.drownTimer = 1.5;
        this.damage(12, { cause: 'drowned' });
      }
    } else this.drownTimer = Math.max(0, this.drownTimer - dt * 2);

    // ---- Head bob and camera ----
    const bobTarget = this.move.grounded && hs > 0.5 ? clamp(hs / C.sprintSpeed, 0, 1) : 0;
    this.bobAmt += (bobTarget - this.bobAmt) * damp(8, dt);
    this.bob += dt * (6 + hs * 1.4);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.updateCamera(dt);

    // ---- Flashlight ----
    const F = CONFIG.flashlight;
    this.camera.getWorldDirection(_fwd);
    this.lightDir.lerp(_fwd, damp(14, dt)).normalize();
    this.spot.position.copy(this.camera.position).addScaledVector(_right, 0.18).add(new THREE.Vector3(0, -0.12, 0));
    this.spot.target.position.copy(this.spot.position).addScaledVector(this.lightDir, 5);
    // Dim when the beam is right up against a wall or the floor so it doesn't blow out.
    let near = F.nearRange;
    if (this.flashOn) {
      const level = this.game.levels.current;
      const hit = level && level.physics.raycast(this.spot.position, this.lightDir, F.nearRange, null, this._rayOut || (this._rayOut = {}));
      if (hit) near = hit.dist;
      if (this.lightDir.y < -0.01) near = Math.min(near, (this.spot.position.y - this.position.y) / -this.lightDir.y);
    }
    const nk = clamp((near - 0.3) / (F.nearRange - 0.3), 0, 1);
    const lightTarget = this.flashOn ? F.intensity * lerp(F.nearDim, 1, nk * nk * (3 - 2 * nk)) : 0;
    this.spot.intensity += (lightTarget - this.spot.intensity) * Math.min(1, dt * 10);
    this.spot.visible = this.spot.intensity > 0.05;
    this.fill.position.copy(this.camera.position);
    this.fill.intensity = this.flashOn ? 0.5 : 0.18;
  }

  updateCamera(dt) {
    const eye = this.position.y + this.eyeHeight;
    if (this.eyeY === null || dt === 0) this.eyeY = eye;
    // Smooth stair steps and crouch changes.
    this.eyeY += (eye - this.eyeY) * (dt ? damp(16, dt) : 1);
    if (Math.abs(this.eyeY - eye) > 1.5) this.eyeY = eye;
    const bobY = Math.sin(this.bob * 2) * 0.035 * this.bobAmt;
    const bobX = Math.cos(this.bob) * 0.025 * this.bobAmt;
    const sx = (Math.random() - 0.5) * this.shake * 0.06;
    const sy = (Math.random() - 0.5) * this.shake * 0.06;
    this.camera.position.set(this.position.x, this.eyeY + bobY, this.position.z);
    this.camera.position.x += Math.cos(this.yaw) * bobX;
    this.camera.position.z -= Math.sin(this.yaw) * bobX;
    this.camera.rotation.set(this.pitch + sy, this.yaw + sx, Math.sin(this.bob) * 0.004 * this.bobAmt);
    this.camera.updateMatrixWorld();
  }

  // Ease the view toward a world point for `time` seconds (scripted moments).
  lookAt(target, time = 1.5, speed = 4) {
    this.lookOverride = { target: target.clone(), time, speed };
  }
}
