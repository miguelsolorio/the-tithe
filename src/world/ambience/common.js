import * as THREE from 'three';

// Shared bits for the ambience helpers (webs, mist, critters, wolves).

const _d = new THREE.Vector3();

// Phones get fewer particles and critters.
export const lite = (game) => !!game.touch;

// Is p inside the lit flashlight cone (within range)? Critters flee it, eyes blink out.
export function inBeam(game, p, cos = 0.95, range = 14) {
  const pl = game.player;
  if (!pl.flashOn) return false;
  _d.subVectors(p, pl.camera.position);
  const d = _d.length();
  if (d > range || d < 1e-3) return false;
  return _d.dot(pl.lightDir) / d > cos;
}

// Squared horizontal distance from the player's feet.
export function dist2(game, p) {
  const q = game.player.position;
  const dx = p.x - q.x;
  const dz = p.z - q.z;
  return dx * dx + dz * dz;
}
