import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../../core/rng.js';
import { span, vaultPt, FACE_ROT, FACE_DIR } from './geo.js';

// Animated effects: caustic light thrown up from the water onto the vaults,
// falling water from pipes and culverts, and paint daubed on the walls.

let causticTex = null;
let streakTex = null;

// Tileable caustic web (cellular F2 - F1 edges).
function causticTexture() {
  if (causticTex) return causticTex;
  const S = 256;
  const rng = makeRng(77);
  const pts = Array.from({ length: 24 }, () => [rng() * S, rng() * S]);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let d1 = 1e9;
      let d2 = 1e9;
      for (const [px, py] of pts) {
        let dx = Math.abs(x - px);
        let dy = Math.abs(y - py);
        if (dx > S / 2) dx = S - dx;
        if (dy > S / 2) dy = S - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      const v = Math.pow(Math.max(0, 1 - e / 9), 2.4);
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(v * 255);
      data[i + 3] = 255;
    }
  }
  causticTex = new THREE.DataTexture(data, S, S);
  causticTex.wrapS = causticTex.wrapT = THREE.RepeatWrapping;
  causticTex.magFilter = THREE.LinearFilter;
  causticTex.minFilter = THREE.LinearMipmapLinearFilter;
  causticTex.generateMipmaps = true;
  causticTex.needsUpdate = true;
  return causticTex;
}

// Vertical streaks for falling water.
function streakTexture() {
  if (streakTex) return streakTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 256);
  const rng = makeRng(31);
  for (let i = 0; i < 70; i++) {
    const px = rng() * 64;
    const w = rng.range(0.6, 3.2);
    const y0 = rng() * 256;
    const len = rng.range(40, 200);
    const a = rng.range(0.15, 0.7);
    const g = x.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.4, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    for (const oy of [-256, 0, 256]) x.fillRect(px, y0 + oy, w, len);
  }
  streakTex = new THREE.CanvasTexture(c);
  streakTex.wrapS = streakTex.wrapT = THREE.RepeatWrapping;
  return streakTex;
}

// Shared animated materials for one level build.
export class CisternFX {
  constructor(L) {
    this.L = L;
    const base = causticTexture();
    this.cA = base.clone();
    this.cB = base.clone();
    this.cA.needsUpdate = this.cB.needsUpdate = true;
    this.cB.repeat.set(1.37, 1.37);
    const mk = (map, color, opacity) =>
      new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true, fog: true });
    this.causticA = mk(this.cA, 0x4fc4bc, 0.55);
    this.causticB = mk(this.cB, 0x3a9f9a, 0.45);
    const st = streakTexture().clone();
    st.needsUpdate = true;
    this.streak = st;
    this.streamMat = new THREE.MeshBasicMaterial({ map: st, color: 0xa8e6e0, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: true });
    this.foamMat = new THREE.MeshBasicMaterial({ map: this.cB, color: 0x9fd8d2, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    this.streams = [];
    this.meshes = [];
    L.onUpdate((dt, t, g) => this.update(dt, t, g));
    L.onDispose(() => {
      for (const m of this.meshes) m.geometry.dispose();
      for (const m of [this.causticA, this.causticB, this.streamMat, this.foamMat]) m.dispose();
      for (const x of [this.cA, this.cB, this.streak]) x.dispose();
    });
  }

  add(mesh) {
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.L.group.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  // Caustic strip on a barrel vault over [a0, a1] along the tunnel. lights:
  // [[x, y, z], ...] that the pattern is brightest around.
  caustics(t, a0, a1, lights, { from = 0.12, to = 0.88, strength = 1 } = {}) {
    const { mid, hw } = span(t);
    const nA = Math.max(2, Math.ceil((a1 - a0) / 0.5));
    const nB = 12;
    const pos = [];
    const uv = [];
    const col = [];
    const idx = [];
    for (let i = 0; i <= nA; i++) {
      const s = a0 + ((a1 - a0) * i) / nA;
      const endFade = Math.min(1, Math.min(i, nA - i) / 3);
      for (let j = 0; j <= nB; j++) {
        const a = Math.PI * (from + ((to - from) * j) / nB);
        const p = vaultPt(t.axis, mid, hw, t.rise, t.top, s, a, 0.03);
        pos.push(...p);
        const arc = (a * (hw + t.rise)) / 2;
        uv.push(s / 3.1, arc / 3.1);
        let b = 0;
        for (const l of lights) {
          const d = Math.hypot(p[0] - l[0], p[1] - l[1], p[2] - l[2]);
          b += Math.pow(Math.max(0, 1 - d / 7), 1.6);
        }
        b = Math.min(1, b) * endFade * strength;
        col.push(b, b, b);
      }
    }
    for (let i = 0; i < nA; i++) {
      for (let j = 0; j < nB; j++) {
        const a = i * (nB + 1) + j;
        const b = a + nB + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    for (const m of [this.causticA, this.causticB]) {
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 2;
      this.add(mesh);
    }
  }

  // Falling water from (x, top, z) down to y = bottom, w wide; foam where it lands.
  stream(x, z, top, bottom, { w = 0.3, foam = 0.6, splash = true } = {}) {
    const h = top - bottom;
    const planes = [0, Math.PI / 2].map((r) => {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 0.8), uv.getY(i) * (h / 1.4));
      g.rotateY(r);
      g.translate(x, bottom + h / 2, z);
      return g;
    });
    const mesh = new THREE.Mesh(mergeGeometries(planes, false), this.streamMat);
    mesh.renderOrder = 2;
    this.add(mesh);
    if (foam > 0) {
      const g = new THREE.CircleGeometry(foam, 14);
      g.rotateX(-Math.PI / 2);
      g.translate(x, bottom + 0.015, z);
      const c = new Float32Array(g.attributes.position.count * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const mesh = new THREE.Mesh(g, this.foamMat);
      mesh.renderOrder = 2;
      this.add(mesh);
    }
    this.streams.push({ pos: new THREE.Vector3(x, bottom + 0.05, z), splash, t: 0 });
  }

  update(dt, t, g) {
    this.cA.offset.set(t * 0.021, t * 0.013);
    this.cB.offset.set(-t * 0.017, t * 0.024);
    this.cB.rotation = Math.sin(t * 0.05) * 0.2;
    this.causticA.opacity = 0.5 + 0.08 * Math.sin(t * 1.3);
    this.streak.offset.y = (t * 1.35) % 1;
    const p = g.player.position;
    for (const s of this.streams) {
      if (!s.splash) continue;
      s.t -= dt;
      if (s.t > 0) continue;
      s.t = 0.12 + Math.random() * 0.12;
      if (p.distanceTo(s.pos) < 14) g.particles.impact(s.pos, { x: 0, y: 1, z: 0 }, 'splash', 2);
    }
  }
}

// Words daubed on a wall in old blood. face: which way the wall faces.
export function paint(L, text, pos, face, { width = 2.4, height = 0.55, color = '92,18,14', size = 118, rot = 0, seed = 5, font = 'Georgia, serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * height) / width);
  const x = c.getContext('2d');
  const rng = makeRng(seed);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `bold ${size}px ${font}`;
  const lines = text.split('\n');
  const lh = c.height / (lines.length + 0.4);
  for (const [li, line] of lines.entries()) {
    const cy = lh * (li + 0.7);
    for (let k = 0; k < 5; k++) {
      x.fillStyle = `rgba(${color},${0.22 + rng() * 0.2})`;
      x.fillText(line, 512 + rng.range(-5, 5), cy + rng.range(-4, 4));
    }
    // Drips running down from the letters.
    const w = x.measureText(line).width;
    for (let k = 0; k < line.length * 0.8; k++) {
      const dx = 512 - w / 2 + rng() * w;
      const len = rng.range(10, lh * 0.9);
      const gr = x.createLinearGradient(0, cy, 0, cy + len);
      gr.addColorStop(0, `rgba(${color},0.55)`);
      gr.addColorStop(1, `rgba(${color},0)`);
      x.fillStyle = gr;
      x.fillRect(dx, cy + size * 0.2, rng.range(2, 5), len);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const g = new THREE.PlaneGeometry(width, height);
  if (rot) g.rotateZ(rot);
  g.rotateY(FACE_ROT[face]);
  const [dx, dz] = FACE_DIR[face];
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(pos[0] + dx * 0.015, pos[1], pos[2] + dz * 0.015);
  mesh.renderOrder = 3;
  L.group.add(mesh);
  L.onDispose(() => {
    tex.dispose();
    mat.dispose();
  });
  return mesh;
}

// Hide level objects (and enemies) beyond what the fog lets you see, and small
// things and enemies that are behind walls. Objects flagged userData.noCull,
// and anything added after the first frame, are left alone.
export function fogCull(L, far = 30) {
  let items = null;
  let t = 0;
  const box = new THREE.Box3();
  const sph = new THREE.Sphere();
  const to = new THREE.Vector3();
  const chest = new THREE.Vector3();
  const seen = (cam, c, r) => {
    to.copy(c).sub(cam);
    const d = to.length();
    if (d < r + 4) return true;
    to.multiplyScalar((d - r - 0.1) / d).add(cam);
    return L.physics.lineOfSight(cam, to);
  };
  L.onUpdate((dt, time, g) => {
    const cam = g.camera.position;
    for (const e of L.level.enemies) {
      if (e.dead && e.stateTime > 5) continue;
      chest.set(e.pos.x, e.pos.y + 0.8, e.pos.z);
      const d = chest.distanceTo(cam);
      // The engine owns root.visible (it hides sleeping enemies); hide walled-off
      // ones by moving their meshes to an unrendered layer instead.
      const hide = d > 7 && !seen(cam, chest, 0.6);
      if (hide !== !!e._walled) {
        e._walled = hide;
        e.root.traverse((m) => m.isMesh && m.layers.set(hide ? 7 : 0));
      }
    }
    t -= dt;
    if (t > 0) return;
    t = 0.2;
    if (!items) {
      items = [];
      const skip = new Set(L.level.enemies.map((e) => e.root));
      if (g.sister?.model) skip.add(g.sister.model.root);
      for (const o of L.group.children) {
        if (skip.has(o) || o.userData.noCull || o.isLight) continue;
        box.setFromObject(o);
        if (box.isEmpty()) continue;
        box.getBoundingSphere(sph);
        items.push({ o, c: sph.center.clone(), r: sph.radius });
      }
    }
    for (const it of items) it.o.visible = cam.distanceTo(it.c) - it.r < far && (it.r > 1.5 || seen(cam, it.c, it.r));
  });
  L.onExit(() => {
    items = null;
  });
}

// Safety net: enemies crowding the player can shove them through a wall (the
// separation push ignores colliders). If the player ends up with no floor
// under them, put them back where they last stood.
export function fallGuard(L) {
  const safe = new THREE.Vector3();
  let has = false;
  let lost = 0;
  L.onUpdate((dt, time, g) => {
    const p = g.player;
    const pos = p.position;
    const ground = L.physics.groundAt(pos.x, pos.z, pos.y + 0.6);
    if (p.move.grounded && ground.y > -Infinity && Math.abs(ground.y - pos.y) < 0.05) {
      safe.copy(pos);
      has = true;
      lost = 0;
      return;
    }
    if (!has) return;
    lost = ground.y === -Infinity ? lost + dt : 0;
    if (lost > 0.1 || pos.y < safe.y - 2.5) {
      pos.copy(safe);
      p.velocity.set(0, 0, 0);
      p.move.vy = 0;
      p.move.grounded = true;
      lost = 0;
    }
  });
  L.onEnter(() => {
    has = false;
  });
}
