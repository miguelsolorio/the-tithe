import { table, roundTable, diningTable, desk, ritualTable } from './house/tables.js';
import { chair, chairBroken, armchair, sofa, pew } from './house/seating.js';
import { bookshelf, dresser, nightstand, wardrobe, shelf, crate, trunk, boxes } from './house/storage.js';
import { bed, mirror, painting, rug, clock, piano, coatRack, mannequin, sheetCovered, cradle } from './house/rooms.js';
import { candle, candleCluster, candelabra, chandelier, bulb, sconce, floorLamp, fireplace } from './house/lighting.js';
import { altar, lectern, antlerSkull, skull, bonesPile, ropeBarricade, hangingCage, noose, bloodBucket } from './house/cult.js';
import { stove, counter, bathtub, sink, fuseBox, boardedWindow, sashWindow } from './house/fixtures.js';

// House props (ground floor, upstairs, attic, blood chapel): name -> builder.
// Builders take (opts = {}) with opts.seed for variation and return an
// Object3D in metres, origin on the floor (wall / ceiling for mounted props),
// front facing +Z. See the individual modules for per-prop options.
export const HOUSE_PROPS = {
  table,
  roundTable,
  diningTable,
  chair,
  chairBroken,
  armchair,
  sofa,
  bookshelf,
  desk,
  dresser,
  nightstand,
  wardrobe,
  bed,
  mirror,
  painting,
  rug,
  fireplace,
  clock,
  floorLamp,
  candle,
  candleCluster,
  candelabra,
  chandelier,
  bulb,
  sconce,
  pew,
  altar,
  lectern,
  antlerSkull,
  skull,
  bonesPile,
  crate,
  trunk,
  shelf,
  stove,
  counter,
  bathtub,
  sink,
  piano,
  coatRack,
  mannequin,
  sheetCovered,
  boxes,
  ritualTable,
  ropeBarricade,
  fuseBox,
  boardedWindow,
  window: sashWindow,
  cradle,
  hangingCage,
  noose,
  bloodBucket,
};
