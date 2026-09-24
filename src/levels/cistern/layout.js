// Cistern tunnels: cell layout for L.plan (1 m cells, plan origin at world 0,0,
// so cell (i, j) spans x = i..i+1, z = j..j+1).
//
//            [alcoves]
//        [ BAPTISM POOL ] == collapsed/flooded == [ PUMP ROOM ]
//              |                                     |
//         west tunnel                           north tunnel
//              | (barred gate)                       |
// [shaft]-[ladder]-[JUNCTION]===== east tunnel ===[HOUND JUNCTION]
//                      | (sluice gate)               |
//                  sluice run                   drain alcove
//                      |
//                  ossuary crawlspace -> flesh pocket -> caves

// [key, i0, j0, i1, j1] inclusive.
export const RECTS = [
  ['a', 17, 1, 18, 2], // alcove N1 (acolyte)
  ['a', 22, 1, 23, 2], // alcove N2 (the shrine)
  ['a', 27, 1, 28, 2], // alcove N3 (acolyte)
  ['a', 12, 8, 13, 9], // alcove W1 (acolyte)
  ['a', 12, 15, 13, 16], // alcove W2 (offerings)
  ['P', 14, 3, 31, 20], // baptism pool chamber
  ['C', 32, 9, 43, 14], // collapsed, flooded tunnel
  ['M', 44, 6, 55, 17], // pump room
  ['N', 47, 18, 52, 28], // north tunnel
  ['B', 46, 29, 53, 36], // hound junction
  ['D', 48, 37, 51, 41], // drain alcove
  ['E', 28, 30, 45, 35], // east tunnel
  ['X', 20, 29, 27, 36], // junction by the sluice
  ['W', 21, 21, 26, 28], // west tunnel (shortcut back from the pool)
  ['S', 14, 31, 19, 35], // ladder room
  ['H', 12, 32, 13, 34], // ladder shaft
  ['G', 22, 37, 25, 44], // sluice run
  ['o', 23, 45, 24, 50], // ossuary crawlspace (south leg)
  ['o', 25, 49, 31, 50], // ossuary crawlspace (east leg)
  ['f', 32, 48, 35, 51], // flesh pocket
  ['t', 36, 49, 37, 50], // throat to the caves
];

export const PW = 56;
export const PH = 52;

export function makeRows() {
  const g = Array.from({ length: PH }, () => Array(PW).fill('#'));
  for (const [k, i0, j0, i1, j1] of RECTS) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j][i] = k;
  return g.map((r) => r.join(''));
}

// Channel bed of the vaulted tunnels; walkways sit at y = 0.
export const BED = -1.3;
export const WATER = -0.4;
export const TUNNEL_H = 4.4; // springing at y 3.1
const TUNNEL = { style: 'stone', wall: 'brick', ceil: 'brick', floor: 'stoneWet', y: BED, h: TUNNEL_H, vault: true, vaultWidth: 6 };

export const ROOMS = {
  a: { style: 'stone', wall: 'stone', ceil: 'stone', floor: 'stoneWet', h: 2.6, vault: true, vaultWidth: 2 },
  P: { style: 'stone', wall: 'stone', floor: 'stoneWet', y: -1.0, h: 9.5, noCeil: true },
  C: { style: 'stone', wall: 'stoneWet', ceil: 'brick', floor: 'stoneWet', y: -1.5, h: 4.6, vault: true, vaultWidth: 6 },
  M: { style: 'stone', wall: 'brick', ceil: 'brick', floor: 'concrete', h: 4.2, vault: true, vaultWidth: 12 },
  N: TUNNEL,
  E: TUNNEL,
  W: TUNNEL,
  B: { style: 'stone', wall: 'brick', ceil: 'brick', floor: 'stoneWet', h: 3.4, vault: true, vaultWidth: 8 },
  X: { style: 'stone', wall: 'brick', ceil: 'brick', floor: 'stoneWet', h: 3.4, vault: true, vaultWidth: 8 },
  D: { style: 'brick', floor: 'stoneWet', h: 2.6, vault: true, vaultWidth: 4 },
  S: { style: 'brick', floor: 'stoneWet', h: 3.0, vault: true, vaultWidth: 5 },
  H: { style: 'brick', floor: 'stoneWet', h: 7.5, noCeil: true },
  G: { style: 'stone', wall: 'stoneWet', ceil: 'brick', floor: 'stoneWet', h: 3.6, vault: true, vaultWidth: 4 },
  o: { style: 'stone', wall: 'stone', ceil: 'stone', floor: 'stoneWet', h: 1.25 },
  f: { style: 'flesh', h: 2.2 },
  t: { style: 'flesh', h: 2.0 },
};

export const DOORS = [
  { at: [13, 32], side: 'e', len: 3, h: 2.5 }, // shaft - ladder room
  { at: [19, 32], side: 'e', len: 3, h: 2.6 }, // ladder room - junction
  { at: [27, 31], side: 'e', len: 4, h: 3.0 }, // junction - east tunnel
  { at: [45, 31], side: 'e', len: 4, h: 3.0 }, // east tunnel - hound junction
  { at: [49, 36], side: 's', len: 2, h: 2.3 }, // hound junction - drain alcove
  { at: [48, 28], side: 's', len: 4, h: 3.0 }, // north tunnel - hound junction
  { at: [48, 17], side: 's', len: 4, h: 3.0 }, // pump room - north tunnel
  { at: [43, 10], side: 'e', len: 4, h: 3.0 }, // collapse - pump room
  { at: [31, 10], side: 'e', len: 4, h: 4.0 }, // pool - collapse (floor at -1, bridged to 0)
  { at: [22, 20], side: 's', len: 4, h: 4.0 }, // pool - west tunnel
  { at: [22, 28], side: 's', len: 4, h: 3.0 }, // west tunnel - junction (barred gate)
  { at: [22, 36], side: 's', len: 4, h: 3.0 }, // junction - sluice run
  { at: [23, 44], side: 's', len: 2 }, // sluice run - crawlspace
  { at: [31, 49], side: 'e', len: 2 }, // crawlspace - flesh pocket
  { at: [35, 49], side: 'e', len: 2, h: 1.8 }, // pocket - throat
  { at: [17, 2], side: 's', len: 2, h: 2.3 },
  { at: [22, 2], side: 's', len: 2, h: 2.3 },
  { at: [27, 2], side: 's', len: 2, h: 2.3 },
  { at: [13, 8], side: 'e', len: 2, h: 2.3 },
  { at: [13, 15], side: 'e', len: 2, h: 2.3 },
];

// World rectangles of the spaces.
export const R = {
  shaft: { x0: 12, z0: 32, x1: 14, z1: 35 },
  ladder: { x0: 14, z0: 31, x1: 20, z1: 36 },
  junction: { x0: 20, z0: 29, x1: 28, z1: 37 },
  east: { x0: 28, z0: 30, x1: 46, z1: 36 },
  hounds: { x0: 46, z0: 29, x1: 54, z1: 37 },
  drain: { x0: 48, z0: 37, x1: 52, z1: 42 },
  north: { x0: 47, z0: 18, x1: 53, z1: 29 },
  pump: { x0: 44, z0: 6, x1: 56, z1: 18 },
  collapse: { x0: 32, z0: 9, x1: 44, z1: 15 },
  pool: { x0: 14, z0: 3, x1: 32, z1: 21 },
  west: { x0: 21, z0: 21, x1: 27, z1: 29 },
  sluice: { x0: 22, z0: 37, x1: 26, z1: 45 },
  crawlA: { x0: 23, z0: 45, x1: 25, z1: 51 },
  crawlB: { x0: 25, z0: 49, x1: 32, z1: 51 },
  pocket: { x0: 32, z0: 48, x1: 36, z1: 52 },
  throat: { x0: 36, z0: 49, x1: 38, z1: 51 },
};

export const POOL = { x: 23, z: 12 };

// Alcoves around the pool: centre, and the direction out into the chamber.
export const ALCOVES = {
  n1: { x: 18, z: 2, out: [0, 1] },
  n2: { x: 23, z: 2, out: [0, 1] },
  n3: { x: 28, z: 2, out: [0, 1] },
  w1: { x: 13, z: 9, out: [1, 0] },
  w2: { x: 13, z: 16, out: [1, 0] },
};

// Vault of a tunnel room: springing height and rise (matches plan.js).
export const vaultOf = (room) => {
  const r = ROOMS[room];
  const top = (r.y ?? 0) + r.h;
  const rise = r.vault ? Math.min(1.2, (r.vaultWidth ?? 3) * 0.35) : 0;
  return { top, rise };
};

// plan.js leaves an open diagonal gap between the wall colliders at every
// convex room corner; enemies crowding the player can shove them through it.
// Plug each such corner with a collider in the solid quadrant.
export function plugCorners(L, rows) {
  const solid = (i, j) => {
    const c = rows[j]?.[i];
    return c === undefined || c === '#' || c === ' ';
  };
  for (let j = 0; j <= PH; j++) {
    for (let i = 0; i <= PW; i++) {
      const open = [
        [i - 1, j - 1],
        [i, j - 1],
        [i - 1, j],
        [i, j],
      ].filter(([a, b]) => !solid(a, b));
      if (open.length !== 1) continue;
      const [a, b] = open[0];
      const sx = a === i - 1 ? 1 : -1;
      const sz = b === j - 1 ? 1 : -1;
      L.collider([i, -3, j], [i + sx * 0.6, 12, j + sz * 0.6], { walkable: false, navIgnore: true });
    }
  }
}
