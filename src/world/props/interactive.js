// Which registry props react to the player. Placed props named here stay in
// the static batch until something touches them (see src/systems/props.js).
//   mass:   heavier props take less of a shove (1 = a chair)
//   topple: a hard enough hit tips it onto its side
//   spill:  tagged loose parts ('book', 'jar', ...) knocked out when hit
//   hp:     knife hits = 1, revolver = 2, shotgun pellet = 0.5; at hp it
//           breaks into `breaksInto` (another entry) or bursts into planks.
//           0 = never breaks (it still takes gouges and bullet holes)
// Props with lights never move (their light would stay behind), nor does
// anything with another prop or pickup standing on it (LevelBuilder.finish).
// Opt a placement out with L.prop(name, x, z, { interactive: false }).
export const INTERACTIVE = {
  chair: { mass: 1, topple: true, hp: 5, breaksInto: 'chairBroken' },
  chairBroken: { mass: 0.9, topple: true, hp: 3 },
  crate: { mass: 2.2, topple: true, hp: 7 },
  boxes: { mass: 1.6, topple: false, hp: 3 },
  trunk: { mass: 3, topple: false, hp: 9 },
  bloodBucket: { mass: 0.7, topple: true, hp: 3 },
  washtub: { mass: 1.5, topple: false, hp: 0 },
  barrel: { mass: 3.5, topple: false, hp: 9 },
  barrelRusted: { mass: 3.5, topple: false, hp: 9 },
  coatRack: { mass: 0.8, topple: true, hp: 3 },
  bookshelf: { spill: true },
  shelf: { spill: true },
};
