import * as THREE from 'three';

// Water surfaces: a transparent plane with a scrolling ripple normal map. The
// flashlight catches the ripples, which sells the wet look cheaply.

let rippleTex = null;

function rippleNormalMap() {
  if (rippleTex) return rippleTex;
  const S = 256;
  const h = new Float32Array(S * S);
  // Sum of tileable sine waves (integer frequencies wrap seamlessly).
  const waves = [
    [3, 1, 0.5],
    [-2, 4, 0.35],
    [5, -3, 0.2],
    [1, 7, 0.15],
    [-7, -2, 0.12],
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [kx, ky, a] of waves) v += a * Math.sin(((kx * x + ky * y) / S) * Math.PI * 2 + kx);
      h[y * S + x] = v;
    }
  }
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = h[y * S + ((x - 1 + S) % S)];
      const r = h[y * S + ((x + 1) % S)];
      const u = h[((y - 1 + S) % S) * S + x];
      const d = h[((y + 1) % S) * S + x];
      let nx = (l - r) * 1.5;
      let ny = (u - d) * 1.5;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  rippleTex = new THREE.DataTexture(data, S, S);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.generateMipmaps = true;
  rippleTex.minFilter = THREE.LinearMipmapLinearFilter;
  rippleTex.needsUpdate = true;
  return rippleTex;
}

export const WATER_COLORS = {
  teal: 0x1e4a4f,
  deep: 0x0e2a2e,
  red: 0x5a0a0e,
  black: 0x040304,
  murky: 0x2a3326,
};

export class Water {
  constructor({ x0, z0, x1, z1, y, color = 'teal', opacity = 0.86, flow = [0.02, 0.01] }) {
    this.x0 = Math.min(x0, x1);
    this.x1 = Math.max(x0, x1);
    this.z0 = Math.min(z0, z1);
    this.z1 = Math.max(z0, z1);
    this.y = y;
    this.flow = flow;
    const w = this.x1 - this.x0;
    const d = this.z1 - this.z0;
    const tex = rippleNormalMap().clone();
    tex.repeat.set(w / 3, d / 3);
    tex.needsUpdate = true;
    this.tex = tex;
    this.material = new THREE.MeshStandardMaterial({
      color: WATER_COLORS[color] ?? color,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity,
      normalMap: tex,
      normalScale: new THREE.Vector2(0.35, 0.35),
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set((this.x0 + this.x1) / 2, y, (this.z0 + this.z1) / 2);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.targetColor = null;
  }

  contains(x, z) {
    return x >= this.x0 && x <= this.x1 && z >= this.z0 && z <= this.z1;
  }

  setLevel(y) {
    this.y = y;
    this.mesh.position.y = y;
  }

  // Ease toward a colour over `seconds`.
  tintTo(color, seconds = 4) {
    this.targetColor = new THREE.Color(WATER_COLORS[color] ?? color);
    this.tintRate = 1 / Math.max(0.01, seconds);
  }

  update(dt, t) {
    this.tex.offset.set(t * this.flow[0], t * this.flow[1]);
    if (this.targetColor) this.material.color.lerp(this.targetColor, Math.min(1, dt * this.tintRate * 2));
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}
