import * as THREE from 'three';
import { getMaterial } from '../../world/materials.js';
import { put, note, bake, Kit, junk, scum, sheetMaterial } from './util.js';
import { Y } from './layout.js';

// Stairwell, main hall, storage and laundry.

// ---------- Stairwell and the kitchen glimpse ----------
export function stairwell(L) {
  // Brick underside of the upper flight, rising with the stairs.
  const ang = Math.atan2(1.55, 7);
  const slab = new THREE.BoxGeometry(2.3, 0.3, Math.hypot(7, 1.55) + 0.2).rotateX(ang).translate(-2, 4.73, -12.5);
  L.batcher.add(slab, getMaterial('brick'));

  const k = new Kit(11);
  // Iron handrail on the west wall, on brackets.
  const rail = (z) => 0.95 + ((-9.2 - z) / 6.8) * 2.8;
  k.rod('rust', [-2.84, rail(-9.2), -9.2], [-2.84, rail(-16), -16], 0.02, 0.02, 8);
  for (const z of [-9.8, -11.6, -13.4, -15.2]) k.rod('rust', [-2.9, rail(z) - 0.06, z], [-2.84, rail(z) - 0.01, z], 0.012, 0.012, 5);
  // A tide line of grime a hand above the water, on both stair walls.
  for (const x of [-2.895, -1.105]) k.box('murky', 0.004, 0.18, 6.6, x, 0.78, -12.2);
  // Wet boot prints on the dry steps, going down.
  for (let i = 0; i < 6; i++) {
    const z = -13.25 + i * 0.5;
    const y = 0.2 * (Math.floor((-9 - z) / 0.5) + 1) + 0.002;
    k.stain('water', 0.07, 0.12, i % 2 ? -2.3 : -1.75, y, z);
  }
  bake(L, k);

  // Teal lantern someone left on the last dry step.
  put(L, 'lantern', -1.3, -10.75, { y: 0.8 });
  // The kitchen: amber bulb light spilling down through the open door.
  put(L, 'bulb', 0.6, -16.9, { y: Y.K + 3.0, args: { drop: 0.8, on: true }, flicker: 0.12, buzz: true });
  put(L, 'counter', 0.8, -17.55, { face: 's' });
  put(L, 'shelf', 1.72, -16.6, { face: 'w' });
  L.light({ pos: [-0.7, 4.4, -16.6], color: 0xe08a2c, intensity: 1.5, distance: 6.5, flicker: 0.1, kind: 'bulb' });
  L.decal('grime', [-2, Y.u, -17], { face: 'up', size: 1.8 });
}

// ---------- Main hall ----------
export function hall(L, fl) {
  // Pipes along both walls under the vault springing.
  for (const [x, zs] of [
    [-3.78, [-6.4, -1.9, 2.6, 7.1]],
    [-0.22, [-6.4, -1.9, 2.6, 7.1]],
  ]) {
    for (const z of zs) put(L, 'pipe', x, z, { y: 2.45, rotY: Math.PI / 2, args: { length: 4.5, radius: 0.06 } });
  }
  put(L, 'pipe', -3.84, 0, { y: 1.45, rotY: Math.PI / 2, args: { length: 7.4, radius: 0.035, material: 'metal' } });

  // Light: two teal lanterns and a dying bulb.
  put(L, 'hangingLantern', -2, -3.4, { y: 3.85, args: { drop: 1.35 } });
  put(L, 'hangingLantern', -2, 6.4, { y: 3.85, args: { drop: 1.25 } });
  put(L, 'bulb', -2.7, 1.6, { y: 3.76, args: { drop: 0.95, on: true }, flicker: 0.85, buzz: true });

  // Junk against the walls, half under water.
  put(L, 'barrelRusted', -3.5, -7.0, { args: { open: true } });
  put(L, 'barrelRusted', -3.45, -6.25, { rotY: 0.6 });
  put(L, 'crate', -0.5, 3.6, { rotY: 0.25 });
  put(L, 'crate', -0.48, 9.35, { rotY: -0.2 });
  put(L, 'chairBroken', -3.4, 7.6, { rotY: 1.9 });
  put(L, 'chainHanging', -3.3, -0.6, { y: 3.58, args: { length: 1.5 } });

  // Waterline grime on the walls, and scum along the edges.
  const k = new Kit(12);
  for (const z of [-7, -2, 3, 7.5]) {
    k.box('murky', 0.004, 0.14 + (z % 2) * 0.04, 3.2, -3.895, 0.76, z);
    k.box('murky', 0.004, 0.16, 3.2, -0.105, 0.77, z);
  }
  bake(L, k);

  // Floating debris.
  fl.add(place(L, junk('planks', 3), -1.3, -5.2, 0.4), { off: 0.02 });
  fl.add(place(L, junk('box', 4), -3.2, 2.4, 1.1), { off: 0.06 });
  scum(L, -1.1, 0.8, 5);
  scum(L, -3.1, -7.8, 6);
  fl.add(place(L, junk('plank', 7), -2.6, 8.0, 2.2), { off: 0.02 });

  for (const z of [-7.5, -3, 1, 5, 8.6]) L.sound('drip', [-2 + (z % 3) * 0.4, 2.8, z], { interval: [2.5, 7], radius: 12 });
  L.loopSound('dripping', [-2, 2.5, 0], { radius: 12, gain: 0.6 });
  L.sound('creak', [-2, 4.5, -12], { interval: [25, 55], radius: 30, gain: 0.5 });
}

// Add a dynamic object to the level at (x, z) with a yaw.
export function place(L, obj, x, z, yaw = 0) {
  obj.position.set(x, 0, z);
  obj.rotation.y = yaw;
  L.mesh(obj, { static: false, collider: 'none', cast: false });
  return obj;
}

// ---------- Storage ----------
export function storage(L, fl) {
  const row = (x, z, face) => put(L, 'metalShelves', x, z, { face });
  for (const x of [-11.2, -9.9, -8.6, -7.3, -6.0]) row(x, -7.65, 's');
  for (const x of [-10.2, -8.9, -7.6]) {
    row(x, -5.95, 'n');
    row(x, -5.45, 's');
  }
  put(L, 'crateStack', -11.0, -1.1, { rotY: 0.2, args: { count: 3 } });
  put(L, 'crate', -5.0, -1.0, { rotY: 0.5 });
  put(L, 'boxes', -9.9, -0.7, { face: 'n' });
  put(L, 'barrel', -4.7, -2.3, {});
  put(L, 'barrel', -5.4, -1.7, { rotY: 1 });
  put(L, 'barrelRusted', -11.5, -3.2, {});
  put(L, 'bulb', -8.2, -4.3, { y: 2.8, args: { drop: 0.45, on: true }, flicker: 0.55, buzz: true });

  L.pickup({ id: 'b_ammo_storage', kind: 'ammo', amount: 5, pos: [-8.9, 1.1, -5.35], rotY: 0.4 });
  note(L, [-6.1, 1.15, -7.5], [
    'A letter, the ink run pale: “Father says the pump must stay dead. When the house is dry She dreams, and when She dreams She wakes.”',
    '“So every new moon we open the cistern valves and let the water climb the stairs a little further. I can hear it in the walls at night.”',
  ], { prompt: 'Read the letter' });

  fl.add(place(L, junk('box', 21), -6.9, -3.2, 0.3), { off: 0.07 });
  fl.add(place(L, junk('box', 22), -10.4, -2.4, 2.1), { off: 0.05 });
  scum(L, -8.4, -1.4, 23);
  L.sound('drip', [-9, 2.7, -3], { interval: [3, 8], radius: 10 });
  L.sound('drip', [-5.5, 2.7, -6.5], { interval: [4, 9], radius: 10 });
}

// ---------- Laundry ----------
export function laundry(L, fl) {
  const y = Y.L;
  // Steps down from the hall and from the storage room.
  L.stairs({ x0: -4.9, z0: 3.95, x1: -4.13, z1: 5.05, fromY: y, toY: 0, dir: 'e', material: 'concrete', riser: 'concrete' });
  L.stairs({ x0: -8.05, z0: 0.13, x1: -6.95, z1: 0.92, fromY: y, toY: 0, dir: 'n', material: 'concrete', riser: 'concrete' });

  const k = new Kit(31);
  // Long stone wash trough on the west wall, brimming with black water.
  const t0 = 1.0;
  const t1 = 6.6;
  k.span('stone', -11.9, y, t0, -11.1, 0.95, t0 + 0.12);
  k.span('stone', -11.9, y, t1 - 0.12, -11.1, 0.95, t1);
  k.span('stone', -11.22, y, t0, -11.1, 0.95, t1);
  k.span('stone', -11.9, y, t0, -11.1, 0.6, t1);
  k.span('murky', -11.88, 0.88, t0 + 0.1, -11.24, 0.885, t1 - 0.1);
  // Taps over the trough.
  k.rod('metal', [-11.86, 1.55, 0.8], [-11.86, 1.55, 6.8], 0.022, 0.022, 8);
  for (const z of [1.9, 3.8, 5.7]) {
    k.rod('brass', [-11.86, 1.55, z], [-11.62, 1.5, z], 0.016, 0.014, 6);
    k.rod('brass', [-11.62, 1.5, z], [-11.62, 1.38, z], 0.012, 0.012, 6);
    k.cyl('brass', 0.03, 0.03, 0.02, -11.86, 1.66, z, 0, 0, 0, 8);
  }
  // Bench for the washtubs along the south wall.
  k.span('woodRotten', -10.6, 0.68, 7.15, -5.4, 0.74, 7.88);
  for (const x of [-10.4, -8.0, -5.6]) for (const z of [7.25, 7.78]) k.span('woodRotten', x - 0.04, y, z - 0.04, x + 0.04, 0.68, z + 0.04);
  // Washing lines, wall to wall.
  for (const z of [2.3, 3.9, 5.6]) {
    k.rod('rope', [-11.9, 2.35, z], [-4.1, 2.35, z], 0.008, 0.008, 4);
    for (const x of [-11.9, -4.1]) k.box('rust', 0.04, 0.04, 0.04, x + (x < -8 ? 0.02 : -0.02), 2.35, z);
  }
  bake(L, k, [
    { min: [-11.9, y, t0], max: [-11.1, 0.95, t1] },
    { min: [-10.6, y, 7.15], max: [-5.4, 0.74, 7.88] },
  ]);

  for (const x of [-9.7, -8.3, -6.9]) put(L, 'washtub', x, 7.5, { y: 0.74, rotY: x * 1.7 });
  put(L, 'lantern', -10.3, 7.5, { y: 0.74 });
  put(L, 'mannequin', -4.8, 1.2, { rotY: -2.2 });
  put(L, 'sheetCovered', -11.3, 7.4, { face: 'e' });

  // Sheets on the lines: soaked hems in the water, a slow sway.
  const mat = sheetMaterial();
  const sheets = [];
  const cols = [];
  for (const [z, xs] of [
    [2.3, [-10.3, -7.9, -5.4]],
    [3.9, [-9.3, -6.6]],
    [5.6, [-10.4, -8.1, -5.7]],
  ]) {
    for (const [i, x] of xs.entries()) {
      const w = 1.15 + ((i * 7 + z * 3) % 3) * 0.15;
      const len = 1.95;
      const g = new THREE.PlaneGeometry(w, len, 10, 12);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const px = p.getX(v);
        const py = p.getY(v);
        const t = (len / 2 - py) / len;
        p.setZ(v, Math.sin(px * 9 + z) * 0.035 * (0.3 + t) + Math.sin(px * 3.1 + i) * 0.05 * t);
        p.setY(v, py - len / 2 - Math.abs(Math.sin(px * 2.2 + i)) * 0.06 * t);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, 2.34, z);
      m.castShadow = true;
      m.receiveShadow = true;
      L.group.add(m);
      sheets.push({ m, ph: x * 1.3 + z });
      cols.push(L.collider([x - w / 2 + 0.1, 0.4, z - 0.05], [x + w / 2 - 0.1, 2.3, z + 0.05], { walkable: false }));
    }
  }
  L.onUpdate((dt, t) => {
    for (const s of sheets) s.m.rotation.x = Math.sin(t * 0.6 + s.ph) * 0.03;
  });
  L.onDispose(() => mat.dispose());

  note(L, [-5.9, 0.78, 7.45], [
    'Pinned to a washboard: “Wash the white robes for the keepers. They will wear them to the last supper, and after, under the water, for as long as She sleeps.”',
  ]);

  scum(L, -8.8, 3.1, 41);
  fl.add(place(L, junk('box', 42), -10.6, 4.8, 0.7), { off: 0.06 });
  L.sound('drip', [-11.6, 1.4, 1.9], { interval: [1.5, 4], radius: 9 });
  L.sound('drip', [-11.6, 1.4, 5.7], { interval: [2, 5], radius: 9 });
  L.sound('gurgle', [-8, 0.6, 4], { interval: [25, 50], radius: 12, gain: 0.5 });
  L.loopSound('dripping', [-11.5, 1.5, 3.8], { radius: 9, gain: 0.5 });
  return cols;
}
