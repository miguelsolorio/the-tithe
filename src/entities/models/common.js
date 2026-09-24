import * as THREE from 'three';
import { tex } from './tex.js';
import { clamp } from './rig.js';

export * from './rig.js';
export * from './geo.js';
export { tex } from './tex.js';

// Palette from docs/visual-direction.md plus creature-specific tones.
export const COL = {
  bone: 0xd8ccb0,
  meat: 0x7a0f16,
  driedBlood: 0x3a060a,
  candle: 0xe08a2c,
  teal: 0x1e4a4f,
  muscle: 0x8a141c,
  muscleDark: 0x4a080e,
  tendon: 0xd9c9b4,
  fat: 0xc9a77a,
  teeth: 0xd9cdae,
  gum: 0x5a0a10,
};

// Shared material definitions. All use vertex colours (every generated
// geometry carries a colour attribute), so `color` is only a tint.
const DEF = {
  flesh: { map: 'fiber', bump: 'fiber', bumpScale: 2.2, roughness: 0.33 },
  skinWet: { map: 'skin', bump: 'skin', bumpScale: 1.4, roughness: 0.36 },
  skin: { map: 'skin', bump: 'skin', bumpScale: 0.6, roughness: 0.6 },
  eel: { map: 'skin', bump: 'skin', bumpScale: 1.0, roughness: 0.24 },
  bone: { color: COL.bone, map: 'bone', bump: 'bone', bumpScale: 1.6, roughness: 0.62 },
  teeth: { color: COL.teeth, map: 'bone', roughness: 0.3 },
  horn: { map: 'horn', bump: 'horn', bumpScale: 3.5, roughness: 0.55 },
  cloth: { map: 'cloth', bump: 'cloth', bumpScale: 1.2, roughness: 0.93, side: THREE.DoubleSide },
  clothWet: { map: 'cloth', bump: 'cloth', bumpScale: 1.0, roughness: 0.5, side: THREE.DoubleSide },
  hair: { map: 'hair', bump: 'hair', bumpScale: 1.6, roughness: 0.3 },
  hairDS: { map: 'hair', bump: 'hair', bumpScale: 1.6, roughness: 0.3, side: THREE.DoubleSide },
  iron: { map: 'rust', bump: 'rust', bumpScale: 2.5, roughness: 0.8, metalness: 0.45 },
  blade: { color: 0x9a948c, roughness: 0.28, metalness: 0.85 },
  wax: { color: 0xd4c6a4, roughness: 0.55 },
  eye: { color: 0xffffff, roughness: 0.08 },
  dark: { color: 0x000000, basic: true, noFlash: true },
  flame: { color: 0xffd9a0, emissive: 0xe08a2c, emissiveIntensity: 4, roughness: 1, noFlash: true },
  eyeGlow: { color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 5, roughness: 0.4, noFlash: true },
};

const shared = new Map();

// Shared cached material (never mutate; use instMats for flashable copies).
export function mat(name) {
  let m = shared.get(name);
  if (m) return m;
  const d = DEF[name];
  if (!d) throw new Error(`[models] unknown material ${name}`);
  if (d.basic) {
    m = new THREE.MeshBasicMaterial({ color: d.color ?? 0x000000, vertexColors: true });
    m.name = `creature:${name}`;
    m.userData.noFlash = true;
    shared.set(name, m);
    return m;
  }
  m = new THREE.MeshStandardMaterial({
    color: d.color ?? 0xffffff,
    roughness: d.roughness ?? 0.6,
    metalness: d.metalness ?? 0,
    emissive: d.emissive ?? 0x000000,
    emissiveIntensity: d.emissiveIntensity ?? 1,
    vertexColors: true,
    side: d.side ?? THREE.FrontSide,
  });
  if (d.map) m.map = tex(d.map);
  if (d.bump) { m.bumpMap = tex(d.bump); m.bumpScale = d.bumpScale ?? 1; }
  m.name = `creature:${name}`;
  m.userData.noFlash = !!d.noFlash;
  shared.set(name, m);
  return m;
}

// Per-instance material set: clones of the shared ones so each creature can
// flash on its own. Returns { get(name), flash(v), step(dt), dispose() }.
// flash(v) sets the strength (0..1); step(dt) decays it to 0 in ~0.2 s.
export function instMats() {
  const own = new Map();
  let level = 0;
  const applyFlash = () => {
    for (const m of own.values()) {
      if (m.userData.noFlash) continue;
      m.emissive.setRGB(0.9 * level, 0.1 * level, 0.07 * level);
    }
  };
  return {
    get(name) {
      let m = own.get(name);
      if (!m) {
        m = mat(name).clone();
        m.userData.noFlash = mat(name).userData.noFlash;
        own.set(name, m);
      }
      return m;
    },
    flash(v) { level = clamp(v, 0, 1); applyFlash(); },
    step(dt) { if (level > 0) { level = Math.max(0, level - dt * 5); applyFlash(); } },
    dispose() { for (const m of own.values()) m.dispose(); own.clear(); },
  };
}

// Mesh with shadow flags.
export function mesh(geo, material, parent, { cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (name) m.name = name;
  if (parent) parent.add(m);
  return m;
}

export function pivot(parent, x = 0, y = 0, z = 0, name = '') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.name = name;
  if (parent) parent.add(g);
  return g;
}

const MULT = { head: 2, weak: 2.5, body: 1, limb: 0.7 };

export function hit(node, x, y, z, r, part = 'body', mult = MULT[part]) {
  return { node, offset: new THREE.Vector3(x, y, z), r, part, mult };
}

export function light(node, x, y, z, color, intensity, distance, flicker = 0) {
  return { node, offset: new THREE.Vector3(x, y, z), color, intensity, distance, flicker };
}

// Cache of per-type shared geometry sets, built on first use.
const geoCache = new Map();
export function cached(key, build) {
  if (!geoCache.has(key)) geoCache.set(key, build());
  return geoCache.get(key);
}

// Default state input for animate() when the caller omits fields.
export function normState(s) {
  return {
    state: s?.state ?? 'idle',
    stateTime: s?.stateTime ?? 0,
    speed: s?.speed ?? 0,
    attackT: s?.attackT,
  };
}

// Attack progress: prefer the AI's attackT, else derive from stateTime.
export function progress(s, duration) {
  if (s.attackT !== undefined && s.attackT !== null && s.state === 'attack') return clamp(s.attackT, 0, 1);
  return clamp(s.stateTime / duration, 0, 1);
}

export function colorLerp(out, a, b, t) {
  out.set(a);
  const r = out.r, g = out.g, bl = out.b;
  out.set(b);
  out.setRGB(r + (out.r - r) * t, g + (out.g - g) * t, bl + (out.b - bl) * t);
  return out;
}
