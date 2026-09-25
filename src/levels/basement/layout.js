// Grid plan of the flooded basement. 1 m cells; row 0 is the most -z (north).
//
//   stairs up to the kitchen (north)
//        |
//   storage -- main hall (vaulted) -- east passage -- wine cellar -- DINING ROOM
//   |    |          |
//   boiler  laundry  pump room (raised, dry) with the grate over the cistern shaft
//   |
//   coal room (deepest)

export const ORIGIN = [-23, -18];
export const W = 51;
export const H = 34;

// One water surface for the whole level; floors sit at different heights.
export const WATER_Y = 0.62;
export const FLOOD_TO = 2.25;
export const FLOOD_SECONDS = 100;

export const X = (i) => ORIGIN[0] + i; // west edge of column i
export const Z = (j) => ORIGIN[1] + j; // north edge of row j
export const cx = (i) => X(i) + 0.5;
export const cz = (j) => Z(j) + 0.5;

// [key, i0, j0, i1, j1] (inclusive). Later entries overwrite earlier cells.
export const ROOMS = [
  ['u', 20, 0, 21, 1], // top landing: the exit back up to the kitchen
  ['K', 22, 0, 24, 1], // a glimpse of the kitchen through the basement door
  ['s', 20, 2, 21, 8], // the lower flight of the basement stairs
  ['h', 19, 9, 22, 27], // main hall, brick barrel vault
  ['T', 11, 10, 18, 17], // storage
  ['L', 11, 18, 18, 25], // laundry (sunken, waist-deep)
  ['B', 2, 9, 10, 18], // boiler room
  ['k', 2, 19, 9, 26], // coal room (chest-deep)
  ['e', 23, 15, 26, 16], // east passage
  ['V', 27, 12, 36, 19], // wine cellar
  ['D', 37, 10, 50, 21], // the drowned dining room
  ['P', 17, 28, 24, 33], // pump room, raised above the water
  ['o', 23, 32, 23, 32], // the shaft under the grate
];

export function makeRows() {
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  for (const [k, i0, j0, i1, j1] of ROOMS) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j][i] = k;
  return g.map((r) => r.join(''));
}

// Floor heights (room y). Water depth = WATER_Y - y.
export const Y = { u: 2.8, K: 2.8, s: 0, h: 0, T: 0, L: -0.5, B: 0, k: -0.7, e: -0.3, V: -0.3, D: -0.45, P: 0.8, o: -5 };

export const ROOM_DEFS = {
  u: { style: 'brick', y: Y.u, h: 2.6 },
  K: { style: 'house', y: Y.K, h: 3.0, floor: 'tile', wall: 'wallpaperTorn', wainscot: true },
  s: { style: 'brick', stairs: { dir: 'n', rise: 2.8 }, h: 2.6, noCeil: true, stairMat: 'stone', riserMat: 'brick' },
  h: { style: 'brick', h: 2.8, vault: true, vaultWidth: 3 },
  T: { style: 'brick', h: 2.8 },
  L: { style: 'brick', y: Y.L, h: 3.3, wall: 'brick' },
  B: { style: 'brick', h: 3.2 },
  k: { style: 'brick', y: Y.k, h: 3.4 },
  e: { style: 'brick', y: Y.e, h: 2.6, vault: true, vaultWidth: 2 },
  V: { style: 'stone', y: Y.V, h: 2.6, floor: 'stoneWet', wall: 'stone', ceil: 'brick', vault: true, vaultWidth: 8 },
  D: { style: 'stone', y: Y.D, h: 3.2, floor: 'stoneWet', wall: 'stone', ceil: 'stone', vault: true, vaultWidth: 12 },
  P: { style: 'brick', y: Y.P, h: 2.65, floor: 'concrete' },
  o: { style: 'brick', y: Y.o, h: 8.45, floor: 'stoneWet' },
};

export const DOORS = [
  { at: [19, 13], side: 'w', leaf: true, id: 'bsm_storage', material: 'woodRotten' }, // hall - storage
  { at: [19, 22], side: 'w', leaf: true, id: 'bsm_laundry', material: 'woodRotten', open: true }, // hall - laundry (left open: the drowned rises right at this threshold)
  { at: [15, 17], side: 's', leaf: true, id: 'bsm_storageLaundry', material: 'woodRotten' }, // storage - laundry
  { at: [11, 14], side: 'w', leaf: true, id: 'bsm_boiler', material: 'rust' }, // storage - boiler room
  { at: [6, 18], side: 's', leaf: true, id: 'bsm_coal', material: 'rust', open: true }, // boiler room - coal room (left open: the lamprey's ambush needs a clear lunge)
  { at: [22, 15], side: 'e', len: 2 }, // hall - east passage
  { at: [26, 15], side: 'e', len: 2 }, // east passage - wine cellar
  { at: [36, 15], side: 'e', len: 2, h: 2.4 }, // wine cellar - dining room
  { at: [20, 27], side: 's', len: 2 }, // hall - pump room
  { at: [21, 1], side: 'e', leaf: true, id: 'bsm_kitchenGlimpse', material: 'woodRotten', open: true }, // landing - kitchen glimpse (always open, matches the lit doorway)
];

export const OPEN = ['sh', 'su', 'oP'];

// Key positions (world metres).
export const SPOT = {
  start: [-2, 0, -8.2],
  cistern: [-0.9, Y.P, 13.2],
  shaft: { x0: 0, z0: 14, x1: 1, z1: 15 }, // cell 'o'
  table: { x0: 18.3, x1: 24.7, z: -2 }, // the feast table (two tables end to end)
  host: [25.15, 0, -2],
};
