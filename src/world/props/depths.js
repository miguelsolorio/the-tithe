// Props for the drowned basement, cistern tunnels, flesh caves and the heart.
// Builders: (opts = {}) => THREE.Object3D (see src/world/props/index.js for
// the shared conventions). Implementation lives in ./depths/.
import { boiler, pipe, pipeElbow, metalShelves, washtub, barrel, barrelRusted, crateStack, workbench, grate, valveSocket, sluiceGate, ladder, railing, pumpMachine } from './depths/industrial.js';
import { lantern, lanternAmber, hangingLantern } from './depths/lamps.js';
import { chainHanging, meatHook, hangingCage, chainAnchor } from './depths/hanging.js';
import { skullWall, skullPile, bonesPile, rib, boneSpike, tooth } from './depths/bones.js';
import { vein, pod, sac, tendril, fleshPillar, cocoon, sphincterDoor, eggCluster, bloodPool, sigilStone } from './depths/flesh.js';

export const DEPTHS_PROPS = {
  // drowned: basement + cistern
  boiler,
  pipe,
  pipeElbow,
  metalShelves,
  washtub,
  barrel,
  barrelRusted,
  crateStack,
  workbench,
  grate,
  lantern,
  lanternAmber,
  hangingLantern,
  valveSocket,
  sluiceGate,
  ladder,
  railing,
  pumpMachine,
  chainHanging,
  meatHook,
  hangingCage,
  chainAnchor,
  // ossuary
  skullWall,
  skullPile,
  bonesPile,
  // flesh caves + the heart
  rib,
  vein,
  pod,
  sac,
  tooth,
  tendril,
  fleshPillar,
  boneSpike,
  cocoon,
  sphincterDoor,
  sigilStone,
  eggCluster,
  bloodPool,
};
