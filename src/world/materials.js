import * as THREE from 'three';
import { generateSurface, generateDecal } from './textures.js';

// Shared material palette. Every surface in the game asks for a material by
// name so meshes can be batched by material and textures are generated once.
//
// Conventions
// - getMaterial(name) returns a cached, shared MeshStandardMaterial (never
//   mutate it; clone it if a mesh needs its own copy). Textures are generated
//   procedurally on first use (textures.js) and shared by clones.
// - material.userData.tile = metres covered by one texture repeat. The level
//   builder generates world-space UVs (u = worldCoord / tile) for static
//   geometry, so textures keep a constant density on walls of any size.
//   wallpaper / wallpaperTorn are 3 tiles tall (texture.repeat.y = 1/3) with
//   floor grime at v = 0, so walls should have v = 0 at floor level.
// - material.userData.surface = footstep surface for floors
//   ('wood' | 'stone' | 'grass' | 'water' | 'flesh' | 'metal' | 'dirt').
// - Colour maps hold the full albedo, so material.color is white; roughness
//   (and metalness where it varies) come from the maps with the scalar at 1.

export const PALETTE = {
  dusk: 0xc8762a,
  candle: 0xe08a2c,
  wallpaper: 0x4a3f2a,
  teal: 0x1e4a4f,
  deepWater: 0x0e2a2e,
  meat: 0x7a0f16,
  driedBlood: 0x3a060a,
  bone: 0xd8ccb0,
};

// name: [fallback colour, roughness, metalness, tile (m), surface]
const DEFS = {
  // Upper floors (cult / demonic)
  wallpaper: [0x4a3f2a, 0.9, 0, 1.2, 'wood'],
  wallpaperTorn: [0x51452f, 0.92, 0, 1.2, 'wood'],
  wainscot: [0x2e2016, 0.7, 0, 1.0, 'wood'],
  plaster: [0x6b6254, 0.95, 0, 2.0, 'stone'],
  floorboards: [0x3b2a1c, 0.75, 0, 2.0, 'wood'],
  woodDark: [0x24170f, 0.65, 0, 1.0, 'wood'],
  wood: [0x5a4330, 0.8, 0, 1.0, 'wood'],
  woodRotten: [0x2f2a20, 0.9, 0, 1.5, 'wood'],
  tile: [0x5c5a52, 0.5, 0, 1.0, 'stone'],
  cloth: [0x2a2422, 0.95, 0, 1.0, 'wood'],
  clothRed: [0x5a0d12, 0.9, 0, 1.0, 'wood'],
  rope: [0x6e5a3a, 0.95, 0, 0.5, 'wood'],
  paper: [0xb9ab8a, 0.9, 0, 0.5, 'wood'],
  // Basement / cistern (drowned)
  brick: [0x4a2e24, 0.9, 0, 1.5, 'stone'],
  stone: [0x4d4a44, 0.9, 0, 2.0, 'stone'],
  stoneWet: [0x2c3a38, 0.45, 0, 2.0, 'stone'],
  concrete: [0x4f4d48, 0.9, 0, 3.0, 'stone'],
  metal: [0x2a2c2e, 0.5, 0.7, 1.0, 'metal'],
  rust: [0x5a3320, 0.8, 0.4, 1.0, 'metal'],
  // Flesh caves / the heart
  flesh: [0x7a0f16, 0.45, 0, 2.5, 'flesh'],
  fleshDark: [0x3a060a, 0.5, 0, 2.5, 'flesh'],
  membrane: [0x8a2a2a, 0.35, 0, 1.5, 'flesh'],
  bone: [0xd8ccb0, 0.7, 0, 1.0, 'stone'],
  // Outdoors
  grass: [0x3a3b1e, 1.0, 0, 3.0, 'grass'],
  dirt: [0x3d2f22, 1.0, 0, 3.0, 'dirt'],
  // Misc
  glass: [0x0c1214, 0.1, 0.2, 1.0, 'stone'],
  black: [0x050404, 1.0, 0, 1.0, 'stone'],
};

// Emissive materials: [colour, emissive, intensity, roughness]
const EMISSIVE = {
  candleFlame: [0xffc070, 0xe08a2c, 3.0, 0.6],
  bulbOn: [0xfff0d0, 0xffc880, 2.5, 0.3],
  bulbOff: [0x2a2622, 0x000000, 0, 0.25],
  podGlow: [0x7a0f16, 0xff2a2a, 1.6, 0.35],
  sigilGlow: [0x7a0f16, 0xff1a0a, 2.2, 0.6],
  eyeGlow: [0xff2010, 0xff1000, 4.0, 0.3],
  phoneScreen: [0xcfe4ff, 0xa8ccff, 2.0, 0.2],
  lanternTeal: [0x8fe0d8, 0x3fb8b0, 1.8, 0.4],
  lanternAmber: [0xffd08a, 0xe08a2c, 1.8, 0.4],
};

// Decals: transparent planes (PlaneGeometry(1, 1) scaled to size).
// userData.aspect = intended width / height of the plane.
export const DECAL_KINDS = ['bloodSplat', 'bloodSmear', 'bloodDrip', 'sigil', 'sigilGlow', 'grime', 'handprint', 'footprints', 'bloodPool', 'claws'];

const cache = new Map();

function textures(name) {
  try {
    return generateSurface(name);
  } catch (err) {
    console.warn(`[materials] texture generation failed for "${name}", using flat colour`, err);
    return null;
  }
}

// Apply a generated texture set; roughness / metalness maps hold absolute values.
function applyMaps(m, t) {
  if (!t) return;
  m.color.set(0xffffff);
  m.map = t.map;
  if (t.normalMap) m.normalMap = t.normalMap;
  if (t.roughnessMap) {
    m.roughnessMap = t.roughnessMap;
    m.roughness = 1;
  }
  if (t.metalnessMap) {
    m.metalnessMap = t.metalnessMap;
    m.metalness = 1;
  }
  if (t.emissiveMap) m.emissiveMap = t.emissiveMap;
}

export function getMaterial(name) {
  let m = cache.get(name);
  if (m) return m;
  if (DEFS[name]) {
    const [color, roughness, metalness, tile, surface] = DEFS[name];
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    applyMaps(m, textures(name));
    m.userData.tile = tile;
    m.userData.surface = surface;
  } else if (EMISSIVE[name]) {
    const [color, emissive, emissiveIntensity, roughness] = EMISSIVE[name];
    m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness });
    const t = textures(name);
    if (t) {
      applyMaps(m, t);
      m.emissive.set(emissive);
    }
    m.userData.tile = 1;
    m.userData.surface = 'stone';
  } else {
    console.warn(`[materials] unknown material "${name}", using fallback`);
    m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    m.userData.tile = 1;
  }
  m.name = name;
  cache.set(name, m);
  return m;
}

// Plain coloured material for small details (cached per option set).
export function solid(color, { roughness = 0.8, metalness = 0, emissive = 0x000000, emissiveIntensity = 1, transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
  const key = `solid:${color}:${roughness}:${metalness}:${emissive}:${emissiveIntensity}:${transparent}:${opacity}:${side}`;
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity, transparent, opacity, side });
  m.userData.tile = 1;
  m.userData.surface = 'stone';
  cache.set(key, m);
  return m;
}

// Transparent decal materials, see DECAL_KINDS.
export function getDecalMaterial(kind) {
  const key = `decal:${kind}`;
  let m = cache.get(key);
  if (m) return m;
  let t = null;
  try {
    t = generateDecal(kind);
  } catch (err) {
    console.warn(`[materials] decal generation failed for "${kind}"`, err);
  }
  if (!t && !DECAL_KINDS.includes(kind)) console.warn(`[materials] unknown decal "${kind}"`);
  m = new THREE.MeshStandardMaterial({
    color: t ? 0xffffff : 0x3a060a,
    map: t?.map ?? null,
    normalMap: t?.normalMap ?? null,
    roughness: t?.roughness ?? 0.4,
    metalness: 0,
    transparent: true,
    opacity: t ? 1 : 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  if (t?.emissiveMap) {
    m.emissive.set(t.emissive ?? 0xff1a0a);
    m.emissiveMap = t.emissiveMap;
    m.emissiveIntensity = t.emissiveIntensity ?? 2.5;
  }
  m.name = key;
  m.userData.tile = 1;
  m.userData.kind = kind;
  m.userData.aspect = t?.aspect ?? 1;
  cache.set(key, m);
  return m;
}

export const MATERIAL_NAMES = [...Object.keys(DEFS), ...Object.keys(EMISSIVE)];

// Generate every material (and decal) up front, e.g. behind a loading screen.
// Returns [{ name, ms }] in generation order.
export function prewarmMaterials(names = MATERIAL_NAMES, decals = DECAL_KINDS) {
  const out = [];
  for (const name of names) {
    const t0 = performance.now();
    getMaterial(name);
    out.push({ name, ms: performance.now() - t0 });
  }
  for (const kind of decals) {
    const t0 = performance.now();
    getDecalMaterial(kind);
    out.push({ name: `decal:${kind}`, ms: performance.now() - t0 });
  }
  return out;
}
