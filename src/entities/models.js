import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHumanoid } from '../player/character.js';

// Procedural low-poly creature models. Every model faces +Z with its feet at y = 0,
// and returns named joints for animation.

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

function joint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);

// ---------- Ghost shader (noise alpha, fresnel rim, supports fog) ----------
export function ghostMaterial({ color = 0x9fd8ff, opacity = 1, additive = true, rim = 1.4, base = 0.25 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uColor: { value: new THREE.Color(color) },
        uRim: { value: rim },
        uBase: { value: base },
      },
    ]),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec3 p = position;
        float sway = (1.0 - smoothstep(0.0, 1.4, p.y));
        p.x += sin(p.y * 3.0 + uTime * 2.2) * 0.06 * sway;
        p.z += cos(p.y * 2.5 + uTime * 1.7) * 0.06 * sway;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vP = p;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime, uOpacity, uRim, uBase;
      uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
        float n = noise(vP * 3.5 + vec3(0.0, -uTime * 0.9, uTime * 0.2));
        float a = (uBase + fres * uRim) * (0.45 + 0.75 * n) * uOpacity;
        a *= smoothstep(-0.05, 0.5, vP.y);
        gl_FragColor = vec4(uColor * (0.7 + fres * 1.6), clamp(a, 0.0, 1.0));
        #include <fog_fragment>
      }`,
  });
}

// ---------- People ----------
export function makeHiker() {
  const rig = buildHumanoid({ jacket: 0x2e4a58, pants: 0x3a3328, beanie: 0x8b6a22, backpack: 0x5a3a20, skin: 0xbf9a82 });
  // Seated pose, hunched toward the fire
  rig.L.hip.rotation.x = -1.45;
  rig.R.hip.rotation.x = -1.35;
  rig.L.knee.rotation.x = 1.5;
  rig.R.knee.rotation.x = 1.4;
  rig.hips.position.y = 0.48;
  rig.spine.rotation.x = 0.3;
  rig.L.shoulder.rotation.set(-0.9, 0, 0.2);
  rig.R.shoulder.rotation.set(-0.9, 0, -0.2);
  rig.L.elbow.rotation.x = -0.9;
  rig.R.elbow.rotation.x = -0.9;
  return rig;
}

export function makeHermit() {
  const rig = buildHumanoid({ jacket: 0x2a2620, pants: 0x1b1a18, skin: 0xa89484, hair: 0x9a948a, height: 1.08, width: 0.92 });
  const coat = lam(0x24211c);
  mesh(rig.spine, cyl(0.26, 0.42, 0.75, 8), coat, 0, -0.32, 0);
  mesh(rig.head, new THREE.ConeGeometry(0.1, 0.32, 6).rotateX(Math.PI), lam(0xb8b2a6), 0, -0.02, 0.1);
  rig.spine.rotation.x = 0.28;
  rig.head.rotation.x = -0.2;
  // Lantern in the left hand
  const lantern = joint(rig.L.hand, 0, -0.14, 0);
  mesh(lantern, box(0.12, 0.16, 0.12), lam(0x1a1712), 0, -0.08, 0, false);
  mesh(lantern, box(0.08, 0.1, 0.08), glow(3, 1.8, 0.6), 0, -0.08, 0, false);
  rig.L.shoulder.rotation.x = -0.35;
  rig.L.elbow.rotation.x = -0.6;
  rig.lantern = lantern;
  return rig;
}

export function makeGirl() {
  const material = lam(0xdfe6ec, { emissive: 0x1c2a38, transparent: true, opacity: 0.88 });
  const rig = buildHumanoid({ material, height: 0.64, width: 0.72 });
  mesh(rig.spine, cyl(0.16, 0.36, 0.7, 10), material, 0, -0.1, 0);
  const hair = lam(0x050505, { transparent: true, opacity: 0.95 });
  mesh(rig.head, box(0.26, 0.55, 0.08), hair, 0, -0.08, -0.12);
  mesh(rig.head, box(0.24, 0.32, 0.05), hair, 0, 0.04, 0.13); // hair hanging over the face
  rig.material = material;
  return rig;
}

export function makeShadowFigure() {
  const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.92, fog: false });
  const rig = buildHumanoid({ material, height: 1.2, width: 0.9, castShadow: false });
  rig.material = material;
  return rig;
}

// ---------- Animals ----------
export function makeWolf() {
  const fur = lam(0x2b2b2e);
  const dark = lam(0x19191b);
  const root = new THREE.Group();
  const body = joint(root, 0, 0.62, 0);
  mesh(body, box(0.34, 0.34, 0.95), fur, 0, 0, 0);
  mesh(body, box(0.4, 0.42, 0.4), fur, 0, 0.04, 0.3);
  const neck = joint(body, 0, 0.12, 0.5);
  mesh(neck, box(0.2, 0.22, 0.3), fur, 0, 0.05, 0.1).rotation.x = -0.5;
  const head = joint(neck, 0, 0.15, 0.22);
  mesh(head, box(0.24, 0.22, 0.26), fur, 0, 0, 0.05);
  mesh(head, box(0.12, 0.1, 0.22), dark, 0, -0.04, 0.26);
  for (const s of [-1, 1]) mesh(head, new THREE.ConeGeometry(0.05, 0.13, 4), dark, s * 0.08, 0.15, -0.02);
  const eyeMat = glow(4, 3, 0.8);
  for (const s of [-1, 1]) mesh(head, new THREE.SphereGeometry(0.022, 6, 4), eyeMat, s * 0.065, 0.03, 0.18, false);
  const legs = [];
  for (const [x, z] of [
    [-0.12, 0.35],
    [0.12, 0.35],
    [-0.12, -0.36],
    [0.12, -0.36],
  ]) {
    const hip = joint(body, x, -0.08, z);
    mesh(hip, box(0.09, 0.56, 0.1), dark, 0, -0.26, 0);
    legs.push(hip);
  }
  const tail = joint(body, 0, 0.08, -0.47);
  mesh(tail, box(0.08, 0.08, 0.45), fur, 0, 0, -0.22);
  tail.rotation.x = 0.6;
  return { root, body, neck, head, legs, tail, eyeMat, phase: 0 };
}

export function makeDeer() {
  const hide = lam(0x5a4535);
  const dark = lam(0x2f241c);
  const root = new THREE.Group();
  const body = joint(root, 0, 1.0, 0);
  mesh(body, box(0.4, 0.46, 1.1), hide, 0, 0, 0);
  const neck = joint(body, 0, 0.15, 0.48);
  mesh(neck, box(0.16, 0.62, 0.18), hide, 0, 0.28, 0.08).rotation.x = 0.35;
  const head = joint(neck, 0, 0.6, 0.2);
  mesh(head, box(0.18, 0.2, 0.34), hide, 0, 0, 0.08);
  mesh(head, box(0.12, 0.12, 0.14), dark, 0, -0.04, 0.28);
  for (const s of [-1, 1]) {
    mesh(head, box(0.04, 0.16, 0.08), hide, s * 0.12, 0.13, -0.02).rotation.z = s * 0.7;
    // Antlers
    const a = joint(head, s * 0.06, 0.1, 0.0);
    mesh(a, cyl(0.012, 0.02, 0.5, 4).translate(0, 0.25, 0), dark, 0, 0, 0).rotation.z = s * -0.45;
    const b = mesh(a, cyl(0.01, 0.015, 0.25, 4).translate(0, 0.12, 0), dark, s * 0.14, 0.28, 0);
    b.rotation.set(0.5, 0, s * 0.2);
    const c = mesh(a, cyl(0.01, 0.015, 0.22, 4).translate(0, 0.11, 0), dark, s * 0.2, 0.38, 0);
    c.rotation.set(-0.4, 0, s * -0.6);
  }
  const eyeMat = glow(1.6, 2.6, 1.8);
  for (const s of [-1, 1]) mesh(head, new THREE.SphereGeometry(0.02, 6, 4), eyeMat, s * 0.09, 0.03, 0.14, false);
  const legs = [];
  for (const [x, z] of [
    [-0.13, 0.42],
    [0.13, 0.42],
    [-0.13, -0.42],
    [0.13, -0.42],
  ]) {
    const hip = joint(body, x, -0.12, z);
    mesh(hip, box(0.07, 0.9, 0.08), dark, 0, -0.44, 0);
    legs.push(hip);
  }
  return { root, body, neck, head, legs, eyeMat, phase: 0 };
}

const crowMat = lam(0x0c0c10);
let crowBody = null;
export function makeCrow() {
  const mat = crowMat;
  const root = new THREE.Group();
  // Body, head, beak and tail share one merged geometry (one draw call per crow body).
  crowBody ??= mergeGeometries([
    new THREE.SphereGeometry(0.09, 7, 5).scale(0.85, 0.8, 1.6).translate(0, 0.08, 0),
    new THREE.SphereGeometry(0.055, 6, 5).translate(0, 0.13, 0.13),
    new THREE.ConeGeometry(0.02, 0.07, 4).rotateX(Math.PI / 2).translate(0, 0.12, 0.2),
    box(0.1, 0.012, 0.16).translate(0, 0.08, -0.18),
  ]);
  mesh(root, crowBody, mat, 0, 0, 0, false);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = joint(root, s * 0.05, 0.11, 0);
    mesh(w, box(0.26, 0.012, 0.14), mat, s * 0.13, 0, 0, false);
    w.rotation.z = s * -0.1;
    wings.push(w);
  }
  return { root, wings };
}

export function makeOwl() {
  const mat = lam(0x2a2218);
  const root = new THREE.Group();
  mesh(root, new THREE.SphereGeometry(0.13, 7, 6), mat, 0, 0.12, 0, false).scale.set(0.9, 1.3, 0.85);
  const head = joint(root, 0, 0.3, 0);
  mesh(head, new THREE.SphereGeometry(0.11, 7, 6), mat, 0, 0, 0, false);
  for (const s of [-1, 1]) mesh(head, new THREE.ConeGeometry(0.03, 0.08, 4), mat, s * 0.06, 0.1, 0, false);
  const eyeMat = glow(3.2, 1.9, 0.4);
  const eyes = [];
  for (const s of [-1, 1]) eyes.push(mesh(head, new THREE.SphereGeometry(0.028, 6, 5), eyeMat, s * 0.045, 0.01, 0.09, false));
  return { root, head, eyes, eyeMat };
}

// ---------- Ghosts ----------
export function makeWraith() {
  const mat = ghostMaterial({ color: 0x8fcfff, additive: true, rim: 1.5, base: 0.22 });
  const root = new THREE.Group();
  const profile = [
    [0.62, 0.0],
    [0.5, 0.25],
    [0.44, 0.7],
    [0.34, 1.3],
    [0.3, 1.65],
    [0.26, 1.95],
    [0.2, 2.15],
    [0.1, 2.3],
    [0.0, 2.36],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const robe = mesh(root, new THREE.LatheGeometry(profile, 14), mat, 0, 0, 0, false);
  robe.renderOrder = 3;
  mesh(root, new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 1.98, 0.1, false);
  const eyeMat = glow(1.6, 3.2, 4);
  for (const s of [-1, 1]) mesh(root, new THREE.SphereGeometry(0.025, 6, 4), eyeMat, s * 0.06, 2.0, 0.24, false);
  const arms = [];
  for (const s of [-1, 1]) {
    const a = joint(root, s * 0.3, 1.7, 0.05);
    mesh(a, new THREE.ConeGeometry(0.09, 1.0, 6).translate(0, -0.5, 0), mat, 0, 0, 0, false);
    a.rotation.x = -1.0;
    a.rotation.z = s * 0.2;
    arms.push(a);
  }
  return { root, mat, arms };
}

export function makeWeeper() {
  const gownMat = ghostMaterial({ color: 0xdfe8f2, additive: false, rim: 1.1, base: 0.55 });
  const hairMat = new THREE.MeshBasicMaterial({ color: 0x030303, transparent: true, opacity: 0.95 });
  const skinMat = lam(0xcfd6da, { emissive: 0x28323a, transparent: true, opacity: 0.95 });
  const root = new THREE.Group();
  const profile = [
    [0.5, 0.0],
    [0.42, 0.3],
    [0.32, 0.9],
    [0.19, 1.15],
    [0.23, 1.38],
    [0.2, 1.52],
    [0.07, 1.6],
    [0.0, 1.62],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(root, new THREE.LatheGeometry(profile, 14), gownMat, 0, 0, 0, false);
  const head = joint(root, 0, 1.62, 0);
  mesh(head, new THREE.SphereGeometry(0.12, 8, 6), skinMat, 0, 0.1, 0, false).scale.set(0.9, 1.15, 1);
  mesh(head, box(0.28, 0.75, 0.1), hairMat, 0, -0.2, -0.1, false);
  mesh(head, box(0.25, 0.55, 0.06), hairMat, 0, -0.08, 0.12, false);
  // Arms raised, hands over the face
  for (const s of [-1, 1]) {
    const a = joint(root, s * 0.2, 1.5, 0);
    mesh(a, box(0.06, 0.32, 0.06).translate(0, -0.16, 0), skinMat, 0, 0, 0, false);
    const f = joint(a, 0, -0.3, 0);
    mesh(f, box(0.05, 0.28, 0.05).translate(0, -0.14, 0), skinMat, 0, 0, 0, false);
    a.rotation.set(-0.6, 0, s * 0.35);
    f.rotation.set(-2.2, 0, 0);
  }
  return { root, head, gownMat, hairMat, skinMat };
}

// ---------- Monsters ----------
export function makeStalker() {
  const suit = lam(0x070707);
  const pale = lam(0xbdbab4);
  const root = new THREE.Group();
  for (const s of [-1, 1]) mesh(root, cyl(0.06, 0.07, 1.6), suit, s * 0.12, 0.8, 0);
  mesh(root, box(0.44, 1.0, 0.25), suit, 0, 2.05, 0);
  mesh(root, box(0.14, 0.5, 0.02), pale, 0, 2.28, 0.13, false);
  mesh(root, box(0.05, 0.4, 0.025), lam(0x000000), 0, 2.26, 0.142, false);
  mesh(root, cyl(0.05, 0.06, 0.2), pale, 0, 2.62, 0);
  const head = joint(root, 0, 2.82, 0);
  mesh(head, new THREE.SphereGeometry(0.15, 10, 8), pale, 0, 0, 0).scale.set(0.85, 1.3, 0.92);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = joint(root, s * 0.28, 2.5, 0);
    mesh(sh, cyl(0.045, 0.05, 1.5).translate(0, -0.75, 0), suit, 0, 0, 0);
    mesh(sh, cyl(0.02, 0.035, 0.32).translate(0, -1.66, 0), pale, 0, 0, 0);
    sh.rotation.z = s * 0.06;
    arms.push(sh);
  }
  const tendrils = [];
  for (let i = 0; i < 4; i++) {
    const s = i % 2 ? 1 : -1;
    const t = joint(root, s * 0.12, 2.25 + (i > 1 ? 0.25 : 0), -0.12);
    let parent = t;
    for (let k = 0; k < 4; k++) {
      const seg = joint(parent, 0, 0, 0);
      mesh(seg, cyl(0.015, 0.03, 0.5).rotateX(Math.PI / 2).translate(0, 0, -0.25), suit, 0, 0, 0, false);
      seg.position.z = k === 0 ? 0 : -0.5;
      parent = seg;
      tendrils.push({ seg, side: s, k, i });
    }
    t.rotation.set(0.3, s * 0.7, 0);
  }
  return { root, head, arms, tendrils };
}

export function makeWendigo() {
  const skin = lam(0x6e685c);
  const limb = lam(0x48433b);
  const bone = lam(0xa89f8e);
  const antler = lam(0x2a2420);
  const root = new THREE.Group();
  const hips = joint(root, 0, 1.25, 0);
  mesh(hips, box(0.32, 0.18, 0.22), limb, 0, 0, 0);
  const torso = joint(hips, 0, 0.05, 0);
  mesh(torso, box(0.36, 0.85, 0.24), skin, 0, 0.45, 0);
  for (let i = 0; i < 5; i++) mesh(torso, box(0.38, 0.025, 0.04), bone, 0, 0.3 + i * 0.09, 0.12, false);
  for (let i = 0; i < 6; i++) mesh(torso, box(0.05, 0.05, 0.06), bone, 0, 0.1 + i * 0.14, -0.13, false);
  const neck = joint(torso, 0, 0.88, 0.02);
  mesh(neck, box(0.1, 0.3, 0.1), limb, 0, 0.12, 0.05).rotation.x = 0.5;
  const head = joint(neck, 0, 0.28, 0.14);
  mesh(head, box(0.2, 0.24, 0.26), bone, 0, 0, 0);
  mesh(head, box(0.13, 0.12, 0.22), bone, 0, -0.06, 0.2);
  const jaw = joint(head, 0, -0.1, 0.05);
  mesh(jaw, box(0.12, 0.04, 0.26), bone, 0, 0, 0.12);
  for (const s of [-1, 1]) mesh(head, new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0x000000 }), s * 0.06, 0.03, 0.12, false);
  const eyeMat = glow(3, 3.2, 4);
  for (const s of [-1, 1]) mesh(head, new THREE.SphereGeometry(0.014, 5, 4), eyeMat, s * 0.06, 0.03, 0.145, false);
  for (const s of [-1, 1]) {
    const a = joint(head, s * 0.08, 0.12, -0.02);
    a.rotation.set(-0.3, 0, s * -0.5);
    mesh(a, cyl(0.02, 0.035, 0.7, 5).translate(0, 0.35, 0), antler, 0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const b = joint(a, 0, 0.2 + k * 0.18, 0);
      b.rotation.set(k % 2 ? 0.6 : -0.6, 0, s * 0.7);
      mesh(b, cyl(0.01, 0.02, 0.35, 4).translate(0, 0.17, 0), antler, 0, 0, 0);
    }
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = joint(torso, s * 0.24, 0.8, 0);
    mesh(sh, box(0.08, 0.72, 0.08).translate(0, -0.36, 0), limb, 0, 0, 0);
    const el = joint(sh, 0, -0.72, 0);
    mesh(el, box(0.07, 0.78, 0.07).translate(0, -0.39, 0), limb, 0, 0, 0);
    for (let k = -1; k <= 1; k++) {
      mesh(el, new THREE.ConeGeometry(0.015, 0.2, 4).rotateX(Math.PI).translate(k * 0.03, -0.86, 0.02), bone, 0, 0, 0, false);
    }
    arms.push({ sh, el });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = joint(hips, s * 0.13, -0.05, 0);
    mesh(hip, box(0.1, 0.64, 0.1).translate(0, -0.32, 0), limb, 0, 0, 0);
    const knee = joint(hip, 0, -0.64, 0);
    mesh(knee, box(0.08, 0.6, 0.08).translate(0, -0.3, 0), limb, 0, 0, 0);
    mesh(knee, box(0.1, 0.05, 0.22), limb, 0, -0.6, 0.07);
    legs.push({ hip, knee });
  }
  return { root, hips, torso, neck, head, jaw, arms, legs, eyeMat, phase: 0 };
}
