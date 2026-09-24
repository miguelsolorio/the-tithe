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
    intensity: 24,
    distance: 28,
    angle: 0.5,
    penumbra: 0.6,
    decay: 1.3,
  },
  weapons: {
    knife: { damage: 34, range: 2.0, cooldown: 0.5, hitDelay: 0.12 },
    revolver: { damage: 48, mag: 6, cooldown: 0.42, reload: 1.7, spread: 0.006, range: 60 },
    shotgun: { damage: 16, pellets: 9, mag: 2, cooldown: 0.75, reload: 2.0, spread: 0.075, range: 30 },
  },
  bandageHeal: 40,
  ammoPickup: { revolver: 6, shotgun: 4 },
};
