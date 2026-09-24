import * as THREE from 'three';
import { put, note, bake, Kit, junk, scum, waterStream, solid } from './util.js';
import { place } from './west.js';
import { Y } from './layout.js';

// Boiler room, coal room and wine cellar.

// ---------- Boiler room ----------
export function boilerRoom(L, fl, water) {
  const k = new Kit(51);
  // Concrete plinth that keeps the firebox above the flood line.
  k.span('concrete', -18.35, 0, -6.35, -16.65, 0.35, -4.65);
  // Clinker, ash and a coal shovel on the plinth.
  k.stain('ash', 0.4, 0.3, -16.9, 0.353, -5.9);
  for (let i = 0; i < 9; i++) k.sphere('char', 0.035 + k.rng() * 0.03, -16.8 - k.rng() * 0.25, 0.37, -5.2 + k.rng() * 0.6, 1, 0.6, 1, 5, 3);
  k.rod('wood', [-16.62, 0.36, -4.8], [-16.62, 1.32, -4.5], 0.016, 0.016, 6);
  k.box('rust', 0.22, 0.012, 0.26, -16.62, 0.4, -4.95, 1.2, 0, 0);
  // Split steam main: the break still pours into the basement.
  bake(L, k, [{ min: [-18.35, 0, -6.35], max: [-16.65, 0.35, -4.65] }]);
  put(L, 'boiler', -17.5, -5.5, { y: 0.35, face: 'e', args: { ceiling: 2.85 } });
  put(L, 'pipe', -13.0, -5.45, { y: 2.9, rotY: Math.PI / 2, args: { length: 6.6, radius: 0.07 } });
  put(L, 'pipe', -13.0, -0.6, { y: 2.9, rotY: Math.PI / 2, args: { length: 2.7, radius: 0.07, flanges: false } });
  put(L, 'pipe', -15.25, -6.44, { y: 2.95, args: { length: 4.5, radius: 0.045 } });
  put(L, 'pipe', -16.5, -8.76, { y: 2.2, args: { length: 8.4, radius: 0.06 } });
  put(L, 'pipe', -16.5, -8.8, { y: 1.1, args: { length: 8.4, radius: 0.035, material: 'metal' } });
  waterStream(L, { x: -13.0, z: -2.1, top: 2.84, r: 0.06, water });

  put(L, 'workbench', -14.6, -8.5, { face: 's' });
  put(L, 'lantern', -15.35, -8.45, { y: 0.9 });
  L.pickup({ id: 'b_ammo_boiler', kind: 'ammo', amount: 4, pos: [-14.1, 0.92, -8.35], rotY: 0.3 });
  put(L, 'barrelRusted', -20.4, 0.35, { args: { open: true } });
  put(L, 'barrelRusted', -20.35, -0.4, { rotY: 1.2 });
  put(L, 'crateStack', -20.2, -7.9, { rotY: 0.1, args: { count: 4 } });
  put(L, 'metalShelves', -20.65, -3.6, { face: 'e' });
  put(L, 'bulb', -16.6, -2.4, { y: 3.2, args: { drop: 0.6, on: false } });
  put(L, 'chainHanging', -19.3, -5.5, { y: 3.2, args: { length: 1.2 } });

  fl.add(place(L, junk('planks', 52), -15.2, -1.2, 0.8), { off: 0.02 });
  scum(L, -13.4, -3.1, 53);
  L.sound('drip', [-19, 3, -2], { interval: [3, 7], radius: 10 });
  L.sound('creak', [-17.5, 2, -5.5], { interval: [18, 40], radius: 14, gain: 0.45 });
}

// ---------- Coal room (deepest water; the lamprey) ----------
export function coalRoom(L, fl) {
  const y = Y.k;
  L.stairs({ x0: -17.1, z0: 1.13, x1: -15.9, z1: 2.33, fromY: y, toY: 0, dir: 'n', material: 'concrete', riser: 'concrete' });
  const k = new Kit(61);
  const coal = solid(0x131211, { roughness: 0.55, metalness: 0.15 });
  // The heap rises out of the water in the far corner.
  const hx = -19.3;
  const hz = 7.2;
  const heap = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = heap.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i);
    const vy = p.getY(i);
    const vz = p.getZ(i);
    const n = Math.sin(vx * 7.1 + vz * 3.3) * 0.05 + Math.sin(vz * 9.7 - vx * 2.1) * 0.04 + Math.sin((vx + vz) * 17) * 0.02;
    p.setXYZ(i, vx * 2.1 * (1 + n), vy * 2.0 + n * 0.5, vz * 1.9 * (1 + n));
  }
  heap.computeVertexNormals();
  k.geo(coal, heap, hx, y, hz);
  for (let i = 0; i < 40; i++) {
    const a = k.rng() * Math.PI * 2;
    const d = 0.8 + k.rng() * 1.5;
    const lx = hx + Math.cos(a) * d;
    const lz = hz + Math.sin(a) * d * 0.9;
    if (lx < -20.85 || lz > 8.85) continue;
    const hy = y + 2.0 * Math.max(0, 1 - (d / 2.05) ** 2);
    k.geo(coal, new THREE.DodecahedronGeometry(0.05 + k.rng() * 0.07, 0), lx, hy, lz, k.rng() * 3, k.rng() * 3, 0);
  }
  // Coal chute from a grated hatch in the ceiling; moonlight through it.
  const A = [-20.1, 2.62, 8.3];
  const B = [-19.45, 1.3, 7.45];
  const dv = [A[0] - B[0], A[1] - B[1], A[2] - B[2]];
  const len = Math.hypot(...dv);
  k.push((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2, Math.atan2(-dv[1] / len, dv[2] / len), Math.asin(dv[0] / len), 0);
  k.box('rust', 0.5, 0.02, len, 0, 0, 0);
  for (const s of [-1, 1]) k.box('rust', 0.02, 0.18, len, s * 0.25, 0.08, 0);
  k.pop();
  k.span(solid(0x0a1018, { emissive: 0x2a3a58, emissiveIntensity: 0.6 }), -20.55, 2.688, 7.95, -19.75, 2.698, 8.75);
  for (const [a, b, c, d] of [[-20.6, 7.9, -19.7, 7.96], [-20.6, 8.74, -19.7, 8.8], [-20.6, 7.9, -20.54, 8.8], [-19.76, 7.9, -19.7, 8.8]]) k.span('iron', a, 2.62, b, c, 2.7, d);
  for (let i = 1; i < 4; i++) k.box('iron', 0.025, 0.04, 0.86, -20.6 + i * 0.225, 2.66, 8.35);
  // Two shovels against the wall.
  for (const [sx, sz] of [[-14.5, 8.6], [-14.1, 8.65]]) {
    k.rod('wood', [sx, y + 0.3, sz + 0.1], [sx + 0.08, y + 1.75, sz + 0.22], 0.018, 0.018, 6);
    k.box('rust', 0.26, 0.34, 0.02, sx - 0.01, y + 0.2, sz + 0.05, 0.12, 0, 0);
  }
  bake(L, k);
  L.cylinder(hx, hz, 1.15, y, y + 2.0, null, { visible: false });
  L.light({ pos: [-20.0, 2.35, 8.2], color: 0x7890b0, intensity: 0.9, distance: 5.5, flicker: 0.04, kind: 'lantern' });
  L.pickup({ id: 'b_bandage_coal', kind: 'bandage', pos: [-18.5, 0.92, 6.25] });

  fl.add(place(L, junk('plank', 62), -15.4, 5.3, 1.3), { off: 0.02 });
  scum(L, -17.6, 3.6, 63);
  L.sound('drip', [-16, 2.6, 6], { interval: [2.5, 6], radius: 9 });
  L.sound('gurgle', [-18, 0.6, 5], { interval: [20, 45], radius: 10, gain: 0.45 });
}

// ---------- Wine cellar ----------
function wineRack(k, x0, x1, zWall, face) {
  // face: +1 rack front faces +z (on the north wall), -1 faces -z.
  const y0 = Y.V;
  const d = 0.42;
  const z0 = zWall;
  const z1 = zWall + face * d;
  const zm = (z0 + z1) / 2;
  const zf = z1 - face * 0.02;
  const wood = 'woodRotten';
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 5) k.span(wood, x - 0.03, y0, Math.min(z0, z1), x + 0.03, y0 + 2.0, Math.max(z0, z1));
  for (const yy of [0.05, 0.9, 1.22, 1.54, 1.98]) k.span(wood, x0, y0 + yy - 0.02, Math.min(z0, z1), x1, y0 + yy + 0.02, Math.max(z0, z1));
  // Bottles lying in the rack, necks out; gaps where they've been taken.
  const rng = k.rng;
  for (const [yy, off] of [[0.956, 0], [1.026, 0.05], [1.276, 0], [1.346, 0.05], [1.596, 0], [1.666, 0.05]]) {
    for (let x = x0 + 0.1 + off; x < x1 - 0.06; x += 0.1 + rng() * 0.012) {
      if (rng() < 0.22) continue;
      const broken = rng() < 0.08;
      k.cyl('glass', 0.036, 0.036, broken ? 0.12 : 0.24, x, y0 + yy, zm, Math.PI / 2, 0, 0, 7);
      if (!broken) {
        k.cyl('glass', 0.012, 0.03, 0.08, x, y0 + yy, zf - face * 0.05, face * Math.PI / 2, 0, 0, 6);
        k.cyl(rng() < 0.6 ? 'waxRed' : 'waxBlack', 0.014, 0.014, 0.04, x, y0 + yy, zf + face * 0.0, Math.PI / 2, 0, 0, 6);
      }
    }
  }
}

export function wineCellar(L, fl) {
  const y = Y.V;
  const k = new Kit(71);
  wineRack(k, 4.2, 13.85, -5.9, 1);
  wineRack(k, 4.2, 13.85, 1.9, -1);
  // Stillages: timber rails the barrels lie on, heads facing the aisle.
  for (const zc of [-4.3, 0.3]) {
    for (const dz of [-0.25, 0.25]) k.span('woodDark', 4.6, y, zc + dz - 0.06, 12.1, 0.22, zc + dz + 0.06);
  }
  // Tasting spot: an upright barrel on a crate by the dining-room door.
  k.span('wood', 12.35, y, -4.65, 13.05, 0.3, -3.95);
  k.span('wood', 12.35, y, -0.05, 13.05, 0.3, 0.65);
  // Broken glass and a knocked-over glass on the barrel tops.
  for (let i = 0; i < 12; i++) k.box('glass', 0.02 + k.rng() * 0.03, 0.004, 0.02 + k.rng() * 0.03, 12.7 + k.rng() * 0.4 - 0.2, 1.165, -4.3 + k.rng() * 0.4 - 0.2, 0, k.rng() * 3, 0);
  bake(L, k, [
    { min: [4.2, y, -5.9], max: [13.85, y + 2.0, -5.48] },
    { min: [4.2, y, 1.48], max: [13.85, y + 2.0, 1.9] },
    { min: [12.35, y, -4.65], max: [13.05, 0.3, -3.95] },
    { min: [12.35, y, -0.05], max: [13.05, 0.3, 0.65] },
  ]);
  const xs = [5.3, 6.2, 7.1, 8.0, 8.9, 9.8, 10.7, 11.6];
  for (const [zi, zc] of [-4.3, 0.3].entries()) {
    for (const [i, x] of xs.entries()) {
      if ((zi === 0 && i === 5) || (zi === 1 && i === 2)) continue; // gaps
      put(L, 'barrel', x, zc, { y: 0.22, fallen: 'side', rotY: Math.PI / 2 + (i % 2 ? 0.04 : -0.03), args: { rotten: i % 3 === 0 } });
    }
  }
  put(L, 'barrel', 12.7, -4.3, { y: 0.3, args: { rotten: true } });
  put(L, 'barrel', 12.7, 0.3, { y: 0.3 });
  put(L, 'candle', 12.55, -4.2, { y: 1.165, args: { h: 0.09, wax: 'wax' }, crackle: true });
  L.pickup({ id: 'b_ammo_cellar', kind: 'ammo', amount: 5, pos: [12.7, 1.17, 0.35], rotY: 1.1 });
  note(L, [12.85, 1.2, -4.45], [
    'The cellar book. The last entry: “Nine bottles of the 1911 sent through to the table for the last supper.”',
    'Underneath, in another hand: “The keepers will not be coming back up.”',
  ], { prompt: 'Read the cellar book', rotY: 1.4 });

  put(L, 'hangingLantern', 4.9, -2.0, { y: 3.48, args: { drop: 1.15 } });

  const floats = [
    ['bottle', 6.1, -2.8, 0.3],
    ['bottle', 9.3, -1.1, 2.4],
    ['bottle', 10.7, -3.1, 4.2],
    ['cork', 7.4, -1.6, 0.9],
    ['cork', 11.2, -2.3, 2.1],
  ];
  for (const [kind, x, z, r] of floats) fl.add(place(L, junk(kind, Math.round(x * 13)), x, z, r), { off: 0.02, tilt: 0.1, drift: 0.4 });
  scum(L, 8.1, -2.2, 72);
  // One barrel has rolled off its stillage and floats in the aisle.
  const fb = put(L, 'barrel', 10.0, -2.7, { y: 0, fallen: 'side', rotY: 0.5, dynamic: true, collider: 'none' });
  if (fb) fl.add(fb, { off: -0.34, amp: 0.02, tilt: 0.03, drift: 0.25 });
  L.sound('drip', [6, 3, -4], { interval: [3, 7], radius: 10 });
  L.sound('drip', [11, 3, 0], { interval: [2.5, 6], radius: 10 });
  L.loopSound('dripping', [9, 2.5, -2], { radius: 10, gain: 0.5 });
}
