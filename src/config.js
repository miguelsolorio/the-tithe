// Every gameplay and world tunable lives here.

export const CONFIG = {
  seed: 1031,
  world: {
    size: 440, // terrain plane edge length
    radius: 182, // playable radius; the boundary pushes back beyond this
    boundaryInner: 187,
    boundaryOuter: 205,
  },
  terrain: { segments: 220 },
  forest: {
    treeCount: 2400,
    minSpacing: 2.6,
    deadRatio: 0.3,
    rocks: 280,
    logs: 60,
    mushrooms: 46,
    effigies: 20,
    chunkSize: 55,
  },
  camera: {
    fov: 62,
    near: 0.1,
    far: 72,
    distance: 3.9,
    height: 1.7,
    shoulder: 0.95,
    sensitivity: 0.0022,
    minPitch: -0.85,
    maxPitch: 0.6,
  },
  player: {
    walkSpeed: 3.1,
    sprintSpeed: 6.3,
    radius: 0.35,
    accel: 11,
  },
  stats: {
    batteryDrain: 0.42, // % per second (~4 minutes per full charge)
    batteryPickup: 50,
    staminaDrain: 17,
    staminaRegen: 12,
    sanityDarkDrain: 0.9,
    sanityLightRegen: 0.25,
    sanitySafeRegen: 6,
    healthRegen: 0.6,
  },
  flashlight: {
    color: 0xfff0d2,
    intensity: 5.5,
    distance: 40,
    angle: 0.42,
    penumbra: 0.55,
    decay: 0,
  },
  fog: { color: 0x0f171c, density: 0.042, perRelic: 0.0035 },
  safeRadius: 9,
  relicCount: 5,
};

// Landmark centers. `r` is the clearing radius (terrain is flattened and trees are kept out).
export const LANDMARKS = {
  spawn: { x: 4, z: 158, r: 9 },
  campfire: { x: -16, z: 116, r: 12 },
  cabin: { x: -100, z: 38, r: 15 },
  graveyard: { x: 92, z: 62, r: 18 },
  hangingTree: { x: 0, z: -12, r: 13 },
  well: { x: 72, z: -76, r: 10 },
  stones: { x: -72, z: -96, r: 14 },
  gate: { x: 0, z: -178, r: 14 },
};

// Trails between landmarks. They wobble and are kept clear of trees.
export const PATHS = [
  ['spawn', 'campfire'],
  ['campfire', 'hangingTree'],
  ['campfire', 'cabin'],
  ['hangingTree', 'graveyard'],
  ['hangingTree', 'well'],
  ['hangingTree', 'stones'],
  ['cabin', 'stones'],
  ['graveyard', 'well'],
  ['well', 'gate'],
  ['stones', 'gate'],
];
