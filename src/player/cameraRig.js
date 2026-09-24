import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../core/utils.js';
import { getHeight } from '../world/terrain.js';

// Over-the-shoulder third-person camera. Shortens itself when a trunk gets in
// the way, and supports trauma-based shake.

export class CameraRig {
  constructor(camera, grid) {
    this.camera = camera;
    this.grid = grid;
    this.yaw = Math.PI; // facing north (-Z)
    this.pitch = -0.2;
    this.trauma = 0;
    this.dist = CONFIG.camera.distance;
    this.pivot = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.flatForward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.shakeTime = 0;
  }

  handleInput(input, dt) {
    const c = CONFIG.camera;
    const m = input.consumeMouse();
    this.yaw -= m.x * c.sensitivity;
    this.pitch -= m.y * c.sensitivity;
    const turn = (input.isDown('ArrowRight') ? 1 : 0) - (input.isDown('ArrowLeft') ? 1 : 0);
    const tilt = (input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('ArrowDown') ? 1 : 0);
    this.yaw -= turn * 2.2 * dt;
    this.pitch += tilt * 1.4 * dt;
    this.pitch = clamp(this.pitch, c.minPitch, c.maxPitch);
  }

  _computeBasis() {
    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.flatForward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  update(dt, target) {
    const c = CONFIG.camera;
    this._computeBasis();
    this.pivot.copy(target).addScaledVector(this.right, c.shoulder);
    this.pivot.y += c.height;

    // Pull in if a trunk sits between the pivot and the camera.
    let want = c.distance;
    for (let d = 0.6; d <= c.distance; d += 0.25) {
      this._p.copy(this.pivot).addScaledVector(this.forward, -d);
      if (this.grid.overlaps(this._p.x, this._p.z, 0.22)) {
        want = Math.max(0.7, d - 0.35);
        break;
      }
    }
    this.dist += (want - this.dist) * damp(want < this.dist ? 20 : 3, dt);

    const cam = this.camera;
    cam.position.copy(this.pivot).addScaledVector(this.forward, -this.dist);
    const gy = getHeight(cam.position.x, cam.position.z) + 0.35;
    if (cam.position.y < gy) cam.position.y = gy;
    this._look.copy(this.pivot).addScaledVector(this.forward, 10);
    cam.lookAt(this._look);

    // Shake
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    this.shakeTime += dt;
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = this.shakeTime * 28;
      cam.rotation.x += Math.sin(t * 1.1) * 0.045 * s;
      cam.rotation.y += Math.sin(t * 0.9 + 3) * 0.045 * s;
      cam.rotation.z += Math.sin(t * 1.3 + 7) * 0.05 * s;
    }

    cam.getWorldDirection(this._p);
    this.aimPoint.copy(cam.position).addScaledVector(this._p, 16);
  }

  // Slow orbit used behind the title screen.
  cinematic(t, center) {
    const cam = this.camera;
    const a = t * 0.06 + 2.2;
    cam.position.set(center.x + Math.cos(a) * 7.5, center.y + 2.3, center.z + Math.sin(a) * 7.5);
    cam.lookAt(center.x, center.y + 1.2, center.z);
    this.yaw = Math.atan2(center.x - cam.position.x, center.z - cam.position.z);
    cam.getWorldDirection(this._p);
    this.aimPoint.copy(cam.position).addScaledVector(this._p, 30);
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
}
