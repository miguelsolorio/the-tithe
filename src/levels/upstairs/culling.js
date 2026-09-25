import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Draw-call savers. The attic is built off to the east in XZ, in line with the
// long hallway, so without this the whole attic renders behind the hallway's
// end wall (and the house behind the attic's gable). Static objects are sorted
// into two containers once the level is finished; only the one the player is
// in stays visible. Door leaves are merged to one mesh per material.

const SPLIT_X = 30;

export function regionCulling(L, far = []) {
  // Dynamic set pieces far from the player are hidden (they would be fogged
  // out anyway): [object, radius] pairs, centres taken once.
  const farItems = far.map(([obj, r]) => ({ obj, r, c: new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()) }));
  let farT = 0;
  let part = null;
  let state = null;
  const box = new THREE.Box3();
  L.onEnter(() => {
    if (part) return;
    const group = L.level.group;
    const enemyRoots = new Set(L.level.enemies.map((e) => e.root));
    part = { house: new THREE.Group(), attic: new THREE.Group() };
    part.house.name = 'upstairs:house';
    part.attic.name = 'upstairs:attic';
    for (const c of [...group.children]) {
      if (enemyRoots.has(c) || c.userData.noCull) continue;
      box.setFromObject(c);
      if (box.isEmpty()) continue;
      const dest = box.min.x > SPLIT_X ? part.attic : box.max.x < SPLIT_X ? part.house : null;
      if (dest) dest.add(c);
    }
    group.add(part.house, part.attic);
    state = null;
  });
  L.onUpdate((dt, t, g) => {
    if (!part) return;
    const inAttic = g.player.position.x > SPLIT_X;
    for (const e of L.level.enemies) e.root.visible = e.pos.x > SPLIT_X === inAttic;
    farT -= dt;
    if (farT <= 0) {
      farT = 0.2;
      const p = g.player.position;
      for (const f of farItems) f.obj.visible = Math.hypot(p.x - f.c.x, p.z - f.c.z) < f.r;
    }
    if (inAttic === state) return;
    state = inAttic;
    part.attic.visible = inAttic;
    part.house.visible = !inAttic;
  });
}

// Merge a door leaf's panel, insets and knobs into one mesh per material.
export function mergeDoor(door) {
  const leaf = door?.pivot?.children[0];
  if (!leaf || leaf.children.length < 3) return;
  const byMat = new Map();
  for (const m of leaf.children) {
    if (!m.isMesh) continue;
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(g.index ? g.toNonIndexed() : g);
  }
  const meshes = [];
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  leaf.clear();
  for (const m of meshes) leaf.add(m);
}
