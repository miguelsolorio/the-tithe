import * as THREE from 'three';
import { getDecalMaterial } from '../world/materials.js';

// Runtime decals (bullet holes, blood splashes) from a recycled pool.

const MAX = 60;

export class RuntimeDecals {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.next = 0;
    this.holeMat = new THREE.MeshBasicMaterial({ color: 0x050303, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, map: holeTexture() });
    this.geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(this.geo, this.holeMat);
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.pool.push(m);
    }
  }

  _place(point, normal, size, material) {
    const m = this.pool[this.next];
    this.next = (this.next + 1) % MAX;
    m.material = material;
    m.visible = true;
    const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
    m.position.set(point.x + n.x * 0.01, point.y + n.y * 0.01, point.z + n.z * 0.01);
    m.lookAt(m.position.x + n.x, m.position.y + n.y, m.position.z + n.z);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size);
    return m;
  }

  bulletHole(point, normal) {
    this._place(point, normal, 0.07 + Math.random() * 0.03, this.holeMat);
  }

  blood(point, normal, size = 0.6) {
    this._place(point, normal, size, getDecalMaterial('bloodSplat'));
  }

  clear() {
    for (const m of this.pool) m.visible = false;
  }
}

function holeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
