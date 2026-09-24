import * as THREE from 'three';

// Tiny CPU particle system for blood, dust and splashes (one Points object).

const MAX = 600;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -9999;
  }

  emit(p, v, color, life, gravity = 9) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
  }

  // kind: 'blood' | 'dust' | 'splash' | 'ichor'
  impact(point, normal, kind = 'dust', count = null) {
    const n = count ?? (kind === 'blood' ? 16 : 10);
    const c = COLORS[kind] || COLORS.dust;
    for (let i = 0; i < n; i++) {
      const s = kind === 'blood' ? 2.2 : kind === 'splash' ? 2.6 : 1.4;
      _v.set(
        (normal?.x ?? 0) * s * 0.6 + (Math.random() - 0.5) * s,
        (normal?.y ?? 0) * s * 0.6 + Math.random() * s * 0.8,
        (normal?.z ?? 0) * s * 0.6 + (Math.random() - 0.5) * s,
      );
      _c.copy(c).multiplyScalar(0.7 + Math.random() * 0.5);
      this.emit(point, _v, _c, 0.4 + Math.random() * 0.5, kind === 'dust' ? 3 : 9);
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) {
        this.pos[k + 1] = -9999;
        continue;
      }
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -9999;
    this.geo.attributes.position.needsUpdate = true;
  }
}

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const COLORS = {
  blood: new THREE.Color(0x5a0508),
  ichor: new THREE.Color(0x2a0306),
  dust: new THREE.Color(0x6b6050),
  splash: new THREE.Color(0x4f8f8c),
};
