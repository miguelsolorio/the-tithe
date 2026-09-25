// Tunables in one place.
export const CONFIG = {
  camera: { fov: 72, near: 0.05, far: 220 },
  player: {
    radius: 0.3,
    height: 1.75,
    eye: 1.62,
    stepHeight: 0.5,
    walkSpeed: 3.1,
    sprintSpeed: 5.4,
    accel: 12,
    maxHealth: 100,
    mouseSens: 0.0022,
    // Water depth (m) at which wading starts slowing you, and the slowest multiplier.
    wadeStart: 0.15,
    wadeMin: 0.42,
  },
  flashlight: {
    color: 0xfff1d6,
    intensity: 28,
    distance: 36,
    angle: 0.72,
    penumbra: 0.75,
    decay: 1.3,
    // Dim toward nearDim as the beam's centre closes within nearRange (m) of a surface.
    nearDim: 0.35,
    nearRange: 2.2,
  },
  weapons: {
    knife: { damage: 34, range: 2.0, cooldown: 0.5, hitDelay: 0.12 },
    revolver: { damage: 48, mag: 6, cooldown: 0.42, reload: 1.7, spread: 0.006, range: 60 },
    shotgun: { damage: 16, pellets: 9, mag: 2, cooldown: 0.75, reload: 2.0, spread: 0.075, range: 30 },
  },
  // Interactive props (src/systems/props.js).
  props: {
    push: 1.15, // shove from walking into a mass-1 prop, as a fraction of your speed
    toppleSpeed: 4.4, // sprinting faster than this into a topple prop knocks it over
    friction: 3.2,
    stop: 1.6, // m/s² constant slow-down so things settle
    spinDrag: 4,
    tipGravity: 16,
    debrisCap: 40, // loose books and jars on the floor per level (each is a draw call)
  },
  bandageHeal: 40,
  bandageMax: 3,
  ammoPickup: { revolver: 6, shotgun: 4 },
};
