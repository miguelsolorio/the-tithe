import * as THREE from 'three';
import { getMaterial } from '../../world/materials.js';
import { ORIGIN, makeRows, CX, CEIL } from './common.js';
import { shaftTexture } from './fixtures.js';

// The upstairs floor plan, the long hallway, the landing at the top of the
// grand stairs and the stairwell back down.

export function buildPlan(L) {
  return L.plan({
    origin: ORIGIN,
    rows: makeRows(),
    rooms: {
      H: { wall: 'wallpaper', wainscot: true, h: CEIL },
      e: { wall: 'wallpaper', wainscot: true, h: CEIL, noCeil: true },
      l: { wall: 'wallpaperTorn', wainscot: true, h: CEIL },
      u: { stairs: { dir: 's', rise: -2.4 }, h: CEIL, stairMat: 'woodDark', riserMat: 'wainscot', wall: 'wallpaperTorn', wainscot: false, trim: false },
      d: { y: -2.4, h: 5.5, wall: 'wallpaperTorn', wainscot: true },
      M: { wall: 'wallpaper', wainscot: true, h: 3.2 },
      R: { wall: 'wallpaperTorn', floor: 'floorboards', h: 3.8 },
      N: { wall: 'wallpaperTorn', wainscot: true, h: CEIL },
      B: { floor: 'tile', wall: 'plaster', h: CEIL, trim: false },
      S: { wall: 'plaster', floor: 'woodRotten', h: 2.9 },
      W: { wall: 'wallpaperTorn', wainscot: true, h: 2.9 },
      C: { wall: 'plaster', h: 2.6, trim: false },
      p: { wall: 'woodRotten', floor: 'woodRotten', ceil: 'woodRotten', h: 1.2, trim: false },
      X: { wall: 'plaster', ceil: 'woodDark', h: 2.3 },
      Q: { wall: 'plaster', wainscot: true, h: CEIL },
    },
    open: ['He', 'Hl', 'lu', 'ud'],
    doors: [
      { at: [7, 11], side: 's', leaf: true, id: 'u_bedroom', prompt: 'Open the bedroom door' },
      { at: [20, 11], side: 's', len: 3, h: 2.7 },
      { at: [32, 11], side: 's', leaf: true, id: 'u_nursery' },
      { at: [40, 11], side: 's', leaf: true, id: 'u_bath' },
      { at: [6, 14], side: 'n', leaf: true, id: 'u_storage' },
      { at: [14, 14], side: 'n', leaf: true, id: 'u_robing', open: true },
      { at: [26, 14], side: 'n', leaf: true, id: 'u_linen', material: 'wood', prompt: 'Open the linen closet' },
      { at: [26, 16], side: 's', frame: false },
      { at: [26, 19], side: 's', frame: false },
      { at: [31, 14], side: 'n', leaf: true, id: 'u_sick' },
    ],
  });
}

// Double doors of the ritual room (one interaction opens both leaves).
export function ritualDoors(U) {
  const { L } = U;
  const x0 = CX(20) - 0.5 + 0.09;
  const x1 = CX(22) + 0.5 - 0.09;
  const w = (x1 - x0) / 2;
  const doors = [];
  const glowMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0xe08a2c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 0.4).rotateX(-Math.PI / 2), glowMat);
  glow.position.set((x0 + x1) / 2, 0.018, -2 + 0.13 + 0.2);
  glow.renderOrder = 2;
  L.group.add(glow);
  const openBoth = (g) => {
    glow.visible = false;
    for (const d of doors) d.openDoor(g, g.player.position);
  };
  for (const [cx, hinge, id] of [[x0 + w / 2, -1, 'u_ritualL'], [x1 - w / 2, 1, 'u_ritualR']]) {
    doors.push(L.door({ x: cx, z: -2, y: 0, axis: 'x', width: w, height: 2.62, hinge, id, material: 'woodDark', prompt: 'Open the double doors', onOpen: openBoth }));
  }
  if (U.has('door:u_ritualL') || U.has('door:u_ritualR')) glow.visible = false;
  return doors;
}

// Hallway: bulbs, portraits, clutter, blood. Returns the bulb light sources.
export function dressHall(U) {
  const { L } = U;
  const bulbs = [];
  const bulb = (x, flicker) => {
    const o = U.prop('bulb', x, -1, { y: CEIL, args: { drop: 0.55, on: true }, flicker, buzz: true, collider: 'none' });
    if (o) bulbs.push(...o.userData.sources);
  };
  bulb(-16.25, 0.65);
  bulb(-7.75, 0.8);
  bulb(6.75, 0.9);
  bulb(14.25, 0.7);
  bulb(20.25, 0.85);

  // Portraits (defaced) along both walls.
  const north = [[-17.4, 0.7, 0.9], [-11.3, 0.6, 0.8], [-4.9, 0.8, 1.0], [4.4, 0.6, 0.75], [8.2, 0.55, 0.7], [14.6, 0.9, 0.7], [16.7, 0.5, 0.65], [23.1, 0.55, 0.7]];
  for (const [x, w, h] of north) U.prop('painting', x, -1.89, { y: 1.65, face: 's', args: { w, h, tilt: L.rng.range(-0.12, 0.12) } });
  const south = [[-18.1, 0.6, 0.8], [-12.2, 0.7, 0.55], [-9.1, 0.55, 0.72], [-4.4, 0.6, 0.8], [7.6, 0.9, 0.65], [13.1, 0.6, 0.8], [17.4, 0.55, 0.75], [21.6, 0.7, 0.9]];
  for (const [x, w, h] of south) U.prop('painting', x, -0.11, { y: 1.62, face: 'n', args: { w, h, tilt: L.rng.range(-0.1, 0.1) } });

  // West end: a stopped clock; east end: a boarded window.
  U.prop('clock', -18.97, -1.35, { face: 'e' });
  U.prop('sheetCovered', -18.7, -0.45, { face: 'e', args: { shape: 'chair' } });
  U.prop('boardedWindow', 23.64, -1, { face: 'w', args: { w: 0.8, h: 1.2 } });

  // Furniture shoved against the walls, some of it knocked over.
  const st = U.prop('table', -10.6, -1.72, { face: 's' });
  if (st) {
    U.prop('candle', -10.75, -1.7, { y: st.userData.colliders?.[0]?.max.y ?? 0.72, args: { lit: false } });
    U.prop('skull', -10.45, -1.75, { y: st.userData.colliders?.[0]?.max.y ?? 0.72, rotY: 2.6 });
  }
  U.prop('chair', -9.7, -0.62, { fallen: 'side', rotY: 0.8 });
  U.prop('coatRack', 8.6, -1.55, { fallen: 'side', rotY: 0.05 });
  U.prop('chair', 16.9, -1.62, { face: 's', rotY: 0.3 });
  U.prop('boxes', 15.7, -0.42, { face: 'n' });
  U.prop('chairBroken', 3.3, -0.55, { rotY: 2.2 });
  U.prop('table', 12.6, -1.72, { fallen: 'back', rotY: 0.2 });
  for (const [x, d] of [[-13.5, 4.5], [-5.4, 3.6], [9.5, 4.2]]) U.prop('rug', x, -1, { rotY: Math.PI / 2, collider: 'none', args: { w: 0.95, d } });

  // A drag trail from the bedroom to the ritual room doors.
  for (const [x, r] of [[-12.9, 1.45], [-10.8, 1.6], [-8.4, 1.5], [-6.1, 1.7], [-3.8, 1.55], [-1.9, 1.2]]) U.floorDecal('bloodSmear', x, -1.15, [0.9, 2.1], r);
  U.floorDecal('bloodPool', -13.75, -1.5, 1.1);
  // Bare, bloody footprints walking east to where the hatch is.
  for (const x of [4.2, 8.1, 12.0, 15.9, 19.4]) U.floorDecal('footprints', x, -0.95, [0.55, 2.6], Math.PI / 2 + L.rng.range(-0.08, 0.08));
  U.floorDecal('bloodSplat', 21.9, -1.0, 1.1);
  // Hands on the walls.
  for (const [x, y] of [[12.9, 1.25], [13.25, 1.05], [13.55, 1.32]]) U.wallDecal('handprint', x, y, -1.89, 's', 0.32);
  for (const [x, y] of [[-15.9, 0.9], [-16.2, 1.15]]) U.wallDecal('handprint', x, y, -0.11, 'n', 0.3);
  U.wallDecal('claws', 12.1, 1.2, -0.11, 'n', [0.9, 0.7]);
  U.wallDecal('bloodDrip', 20.4, 2.3, -1.89, 's', [1.1, 1.5]);
  U.wallDecal('bloodDrip', -7.9, 2.2, -0.11, 'n', [1, 1.4]);
  U.wallDecal('sigil', 21.6, 1.7, -0.11, 'n', 1.0);
  for (const [x, z, s] of [[-16, -1, 3], [-2, -1, 2.6], [6, -1, 3], [17, -1.2, 2.8]]) U.floorDecal('grime', x, z, s);
  return bulbs;
}

// The top of the grand stairs: the ritual room's double doors straight ahead,
// candles and antler skulls around them; the stairwell behind.
export function dressLanding(U) {
  const { L } = U;
  // Candles in wax puddles either side of the doors (one light for all).
  for (const [x, z] of [[-1.9, -1.55], [-2.35, -0.7], [2.4, -1.55], [2.85, -0.75]]) U.prop('candleCluster', x, z, { lights: false });
  L.light({ pos: [0.25, 0.7, -1.1], color: 0xe08a2c, intensity: 1.3, distance: 6, flicker: 0.45, kind: 'candle' });
  U.prop('antlerSkull', -2.75, -1.89, { y: 2.35, face: 's' });
  U.prop('antlerSkull', 3.25, -1.89, { y: 2.35, face: 's' });
  U.wallDecal('sigil', -2.75, 1.35, -1.89, 's', 1.1);
  U.wallDecal('sigil', 3.25, 1.35, -1.89, 's', 1.1);
  U.wallDecal('bloodDrip', -2.75, 1.9, -1.885, 's', [0.8, 1.2]);
  U.floorDecal('bloodSmear', 0.25, 0.9, [1.0, 2.6], 0.1);
  U.floorDecal('bloodSplat', 0.6, -0.3, 1.3);
  U.prop('skull', -2.1, -0.35, { rotY: 0.4 });
  // Portraits down the stairwell walls.
  U.prop('painting', -1.14, 4.2, { y: 0.6, face: 'e', args: { w: 0.6, h: 0.8, tilt: 0.15 } });
  U.prop('painting', 1.64, 6.4, { y: -0.3, face: 'w', args: { w: 0.7, h: 0.55 } });
  // Handrails along the flight.
  const rail = (x) => {
    const len = Math.hypot(6, 2.4);
    const g = new THREE.CylinderGeometry(0.03, 0.03, len, 8).rotateX(Math.PI / 2).rotateX(Math.atan2(2.4, 6)).translate(x, 0.95 - 1.2, 5);
    L.batcher.add(g, getMaterial('woodDark'));
    for (let k = 0; k <= 4; k++) {
      const z = 2.4 + k * 1.3;
      const y = 0.95 - ((z - 2) / 6) * 2.4;
      L.box([x - 0.02, y - 0.12, z - 0.02], [x + 0.02, y, z + 0.02], 'metal', { collide: false });
    }
  };
  rail(-1.08);
  rail(1.58);
  // Warm light from the ground floor, round the turn at the bottom.
  L.light({ pos: [-2.4, -1.2, 8.5], color: 0xe08a2c, intensity: 0.9, distance: 5, flicker: 0.3, kind: 'candle' });
}
