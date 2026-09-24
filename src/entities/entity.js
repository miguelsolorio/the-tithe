import * as THREE from 'three';
import { damp, lerpAngle, yawTo } from '../core/utils.js';
import { getHeight } from '../world/terrain.js';

const frustum = new THREE.Frustum();
const projView = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const _t = new THREE.Vector3();

export function updateFrustum(camera) {
  camera.updateMatrixWorld();
  projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projView);
}

export function pointOnScreen(p, radius = 0.8) {
  sphere.center.copy(p);
  sphere.radius = radius;
  return frustum.intersectsSphere(sphere);
}

export class Entity {
  constructor(game, type) {
    this.game = game;
    this.type = type;
    this.group = new THREE.Group();
    this.alive = true;
    this.state = 'idle';
    this.stateTime = 0;
    this.age = 0;
    this.height = 1.7;
    this.radius = 0.4;
    this.major = false; // counts against the director's concurrent encounter cap
    game.scene.add(this.group);
  }

  get pos() {
    return this.group.position;
  }

  get player() {
    return this.game.player;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  tick(dt) {
    this.age += dt;
    this.stateTime += dt;
    this.update(dt);
  }

  update() {}

  distToPlayer() {
    const p = this.player.position;
    return Math.hypot(this.pos.x - p.x, this.pos.z - p.z);
  }

  center(out = _t) {
    return out.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }

  isOnScreen() {
    return pointOnScreen(this.center(), Math.max(0.6, this.height * 0.5));
  }

  // On screen, within range, and not hidden behind a trunk.
  isVisible(maxDist = 34) {
    const cam = this.game.camera.position;
    const d = Math.hypot(this.pos.x - cam.x, this.pos.z - cam.z);
    if (d > maxDist || !this.isOnScreen()) return false;
    return !this.game.grid.segmentBlocked(cam.x, cam.z, this.pos.x, this.pos.z, 0.5, 0.9);
  }

  // Centre of the screen, not just anywhere in view.
  isLookedAt(cosLimit = 0.93, maxDist = 34) {
    const cam = this.game.camera;
    const c = this.center();
    _t.sub(cam.position);
    const d = _t.length();
    if (d > maxDist) return false;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    if (_t.divideScalar(d).dot(fwd) < cosLimit) return false;
    return !this.game.grid.segmentBlocked(cam.position.x, cam.position.z, this.pos.x, this.pos.z, 0.5, 0.9);
  }

  isLit(offset = this.height * 0.55) {
    return this.player.isPointLit(_t.set(this.pos.x, this.pos.y + offset, this.pos.z));
  }

  faceTowards(x, z, dt, rate = 6) {
    const target = yawTo(x - this.pos.x, z - this.pos.z);
    this.group.rotation.y = lerpAngle(this.group.rotation.y, target, damp(rate, dt));
  }

  facePlayer(dt, rate = 6) {
    this.faceTowards(this.player.position.x, this.player.position.z, dt, rate);
  }

  // Walks toward (x, z) at `speed`, sliding around trunks. Returns remaining distance.
  moveTowards(x, z, speed, dt, { collide = true, face = true, turnRate = 8 } = {}) {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      const step = Math.min(d, speed * dt);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      if (collide) this.game.grid.resolve(this.pos, this.radius);
      if (face) this.faceTowards(x, z, dt, turnRate);
    }
    this.snapToGround();
    return d;
  }

  moveAway(x, z, speed, dt, opts) {
    const dx = this.pos.x - x;
    const dz = this.pos.z - z;
    const d = Math.hypot(dx, dz) || 1;
    return this.moveTowards(this.pos.x + (dx / d) * 5, this.pos.z + (dz / d) * 5, speed, dt, opts);
  }

  snapToGround(offset = 0) {
    this.pos.y = getHeight(this.pos.x, this.pos.z) + offset;
  }

  remove() {
    if (!this.alive) return;
    this.alive = false;
    this.game.scene.remove(this.group);
    this.onRemove();
  }

  onRemove() {}
}
