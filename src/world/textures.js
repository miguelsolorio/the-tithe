import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { hashString, makeCanvas, normalBytes, dataTexture, clearNoiseCache } from './tex/core.js';
import { genWallpaper, genWallpaperTorn } from './tex/wallpaper.js';
import { genFloorboards, genWainscot, genWoodDark, genWood, genWoodRotten } from './tex/wood.js';
import { genPlaster, genTile, genCloth, genClothRed, genRope, genPaper } from './tex/house.js';
import { genBrick, genStone, genStoneWet, genConcrete, genMetal, genRust, genGlass } from './tex/masonry.js';
import { genFlesh, genFleshDark, genMembrane, genBone, genPodGlow } from './tex/flesh.js';
import { genGrass, genDirt } from './tex/outdoor.js';
import { genBloodSplat, genBloodSmear, genBloodDrip, genSigil, genSigilGlow, genGrime, genHandprint, genFootprints, genBloodPool, genClaws } from './tex/decals.js';

// Procedural texture sets for the shared materials (see materials.js).
// Every generator is deterministic (seeded by the material name), tiles
// seamlessly and returns { map, normalMap, roughnessMap, metalnessMap?,
// emissiveMap? } as three.js textures. Generation is synchronous; callers
// cache the result.

const SURFACES = {
  wallpaper: genWallpaper,
  wallpaperTorn: genWallpaperTorn,
  wainscot: genWainscot,
  plaster: genPlaster,
  floorboards: genFloorboards,
  woodDark: genWoodDark,
  wood: genWood,
  woodRotten: genWoodRotten,
  tile: genTile,
  cloth: genCloth,
  clothRed: genClothRed,
  rope: genRope,
  paper: genPaper,
  brick: genBrick,
  stone: genStone,
  stoneWet: genStoneWet,
  concrete: genConcrete,
  metal: genMetal,
  rust: genRust,
  flesh: genFlesh,
  fleshDark: genFleshDark,
  membrane: genMembrane,
  bone: genBone,
  grass: genGrass,
  dirt: genDirt,
  glass: genGlass,
  podGlow: genPodGlow,
};

const DECALS = {
  bloodSplat: genBloodSplat,
  bloodSmear: genBloodSmear,
  bloodDrip: genBloodDrip,
  sigil: genSigil,
  sigilGlow: genSigilGlow,
  grime: genGrime,
  handprint: genHandprint,
  footprints: genFootprints,
  bloodPool: genBloodPool,
  claws: genClaws,
};

export const SURFACE_TEXTURE_NAMES = Object.keys(SURFACES);

// Texture set for a surface material, or null when it has no generator.
export function generateSurface(name) {
  const gen = SURFACES[name];
  return gen ? gen(hashString(name)) : null;
}

// Decal texture set: { map (RGBA, clamped), normalMap?, emissiveMap?, roughness, aspect }.
export function generateDecal(kind) {
  const gen = DECALS[kind];
  return gen ? gen(hashString(`decal:${kind}`)) : null;
}

export const DECAL_TEXTURE_KINDS = Object.keys(DECALS);

// Drop the memoised noise fields (up to ~64 MB) once loading is done; later
// generations simply rebuild what they need.
export const clearTextureCaches = clearNoiseCache;

// Small canvas-painted texture made the same way as the material maps.
// drawFn(ctx, size, rng) paints the canvas; size is a number or [w, h].
export function makeCanvasTexture(size, drawFn, { srgb = true, repeat = true, seed = 1 } = {}) {
  const [w, h] = Array.isArray(size) ? size : [size, size];
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size, makeRng(seed));
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

// Tangent-space normal map (Sobel, wraps at the edges) from a height source:
// a canvas / 2D context / ImageData (luminance is height) or an array of
// size*size heights. size is a number or [w, h]; strength ~1-4 is typical.
export function heightToNormalMap(src, size, strength = 2) {
  const [w, h] = Array.isArray(size) ? size : [size, size];
  let hgt;
  if (src instanceof Float32Array || Array.isArray(src)) {
    hgt = src instanceof Float32Array ? src : Float32Array.from(src);
  } else {
    let data;
    if (typeof ImageData !== 'undefined' && src instanceof ImageData) data = src.data;
    else {
      const ctx = src.getContext ? src.getContext('2d') : src;
      data = ctx.getImageData(0, 0, w, h).data;
    }
    hgt = new Float32Array(w * h);
    for (let i = 0, k = 0; i < hgt.length; i++, k += 4) hgt[i] = (data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114) / 255;
  }
  return dataTexture(normalBytes(hgt, w, h, strength), w, h, { repeat: true });
}
