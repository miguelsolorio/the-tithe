import { buildAcolyte } from './acolyte.js';
import { buildHound } from './hound.js';
import { buildDrowned } from './drowned.js';
import { buildLamprey } from './lamprey.js';
import { buildSkinless } from './skinless.js';
import { buildWallMaw } from './wallMaw.js';
import { buildMother } from './mother.js';
import { buildSister } from './sister.js';

// Creature registry. buildCreature(type, opts) returns
// { root, height, radius, hitSpheres, lights, timings, animate, flash, dispose }
// (see each builder for extra states / exposed nodes).
const BUILDERS = {
  acolyte: buildAcolyte,
  hound: buildHound,
  drowned: buildDrowned,
  lamprey: buildLamprey,
  skinless: buildSkinless,
  wallMaw: buildWallMaw,
  mother: buildMother,
  sister: buildSister,
};

export const CREATURE_TYPES = Object.keys(BUILDERS);

export function buildCreature(type, opts = {}) {
  const build = BUILDERS[type];
  if (!build) throw new Error(`[models] unknown creature type "${type}"`);
  const c = build(opts);
  c.type = type;
  c.root.name = c.root.name || type;
  return c;
}
