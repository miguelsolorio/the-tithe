import * as THREE from 'three';

// Prop registry. Every builder returns an Object3D whose origin sits on the
// floor (or wall / ceiling for mounted props), faces +Z and is in metres.
// userData.collider: 'box' (default), 'none', or local boxes [{min, max}].
// userData.lights: [{ offset, color, intensity, distance, flicker, kind }].
//
// The prop modules load asynchronously (propsReady) so one broken module
// can't stop the game from starting; its props fall back to placeholders.

const REGISTRY = {};
export const PROP_NAMES = [];

const mods = import.meta.glob(['./house.js', './depths.js', './items.js']);
export const propsReady = Promise.all(
  Object.entries(mods).map(async ([path, load]) => {
    try {
      const m = await load();
      for (const table of Object.values(m)) {
        if (!table || typeof table !== 'object') continue;
        for (const [name, build] of Object.entries(table)) {
          if (typeof build !== 'function') continue;
          REGISTRY[name] = build;
          if (!PROP_NAMES.includes(name)) PROP_NAMES.push(name);
        }
      }
    } catch (e) {
      console.warn(`[props] ${path} failed to load, using placeholders:`, e.message);
    }
  }),
);

const warned = new Set();

export function makeProp(name, opts = {}) {
  const build = REGISTRY[name];
  if (build) {
    try {
      const obj = build(opts);
      obj.name = obj.name || name;
      return obj;
    } catch (e) {
      console.error(`[props] building "${name}" failed`, e);
    }
  }
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`[props] unknown prop "${name}"`);
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
  m.position.y = 0.25;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// Tip a prop over so it rests on the floor: 'side' (onto its +X side),
// 'back' (onto its back), 'front' (face down). Returns a wrapper group whose
// origin stays at floor level.
export function knockOver(obj, dir = 'side') {
  const wrap = new THREE.Group();
  wrap.add(obj);
  if (dir === 'side') obj.rotation.z = -Math.PI / 2;
  else if (dir === 'back') obj.rotation.x = -Math.PI / 2;
  else if (dir === 'front') obj.rotation.x = Math.PI / 2;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box.min.y;
  obj.position.x -= (box.min.x + box.max.x) / 2;
  obj.position.z -= (box.min.z + box.max.z) / 2;
  // A knocked-over lamp or candle is out.
  wrap.userData = { ...obj.userData, collider: 'box', lights: [] };
  return wrap;
}
