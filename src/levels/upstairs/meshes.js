import * as THREE from 'three';
import { makeRng } from '../../core/rng.js';
import { Parts, M, trs } from './common.js';

// Custom figures for the upstairs level: the dead man in the chair, dolls
// with turning heads, a shrouded hanged body, a pale hand, the rocking chair
// and the cradle mobile. All face +Z with the origin on the floor unless noted.

// A man slumped in an armchair (seat ~0.45 m), revolver hand hanging on the
// right (-X) side.
export function corpseSeated() {
  const p = new Parts();
  const suit = M.suit;
  const skin = M.skinDead;
  // Hips and thighs.
  p.sphere(suit, 0.17, 0, 0.56, -0.1, 1.2, 0.65, 0.95);
  p.limb(suit, [-0.1, 0.52, -0.05], [-0.14, 0.53, 0.36], 0.078);
  p.limb(suit, [0.1, 0.52, -0.05], [0.15, 0.51, 0.35], 0.078);
  // Shins and shoes, splayed.
  p.limb(suit, [-0.14, 0.51, 0.38], [-0.19, 0.1, 0.5], 0.06);
  p.limb(suit, [0.15, 0.49, 0.37], [0.23, 0.1, 0.45], 0.06);
  p.box(M.leather, 0.1, 0.08, 0.25, -0.2, 0.04, 0.57, 0, 0.12, 0);
  p.box(M.leather, 0.1, 0.08, 0.25, 0.25, 0.04, 0.52, 0, -0.25, 0);
  // Torso slumped back and to the right.
  p.limb(suit, [0, 0.58, -0.12], [-0.05, 0.96, -0.24], 0.155);
  // Open collar and a dark tie, the shirt front soaked through.
  p.limb(M.shirt, [-0.09, 0.97, -0.13], [-0.04, 0.84, -0.08], 0.022);
  p.limb(M.shirt, [0.04, 0.97, -0.12], [-0.02, 0.84, -0.08], 0.022);
  p.limb(M.bloodDry, [-0.03, 0.9, -0.1], [-0.01, 0.66, -0.02], 0.028);
  p.sphere(M.bloodDry, 0.09, -0.02, 0.76, -0.06, 1.1, 1.4, 0.45);
  // Shoulders.
  p.limb(suit, [-0.21, 0.98, -0.23], [0.15, 0.97, -0.22], 0.068);
  // Right arm hangs over the armrest; the hand is open, palm in.
  p.limb(suit, [-0.22, 0.97, -0.22], [-0.34, 0.67, -0.13], 0.052);
  p.limb(suit, [-0.34, 0.67, -0.13], [-0.39, 0.37, -0.03], 0.045);
  p.sphere(skin, 0.042, -0.4, 0.31, -0.01, 0.75, 1.35, 0.55);
  for (let k = 0; k < 4; k++) p.limb(skin, [-0.4, 0.27, -0.03 + k * 0.015], [-0.405, 0.2, -0.02 + k * 0.016], 0.0095);
  // Left arm lies in the lap.
  p.limb(suit, [0.16, 0.96, -0.21], [0.24, 0.67, -0.03], 0.052);
  p.limb(suit, [0.24, 0.67, -0.03], [0.06, 0.61, 0.17], 0.045);
  p.sphere(skin, 0.042, 0.03, 0.61, 0.22, 1.1, 0.55, 1.35);
  // Neck, and the head fallen onto the right shoulder, chin down.
  p.limb(skin, [-0.05, 1.0, -0.21], [-0.13, 1.07, -0.15], 0.045);
  // Skull, jaw, brow, nose and ears; the face turned down and to the right.
  p.sphere(skin, 0.1, -0.18, 1.09, -0.12, 0.88, 1.08, 1.0);
  p.sphere(skin, 0.065, -0.16, 1.01, -0.05, 0.95, 0.75, 0.9);
  p.sphere(skin, 0.05, -0.15, 1.1, -0.04, 1.25, 0.45, 0.6);
  p.limb(skin, [-0.15, 1.07, -0.03], [-0.15, 1.03, -0.005], 0.013);
  for (const s of [-1, 1]) p.sphere(skin, 0.022, -0.18 + s * 0.085, 1.08, -0.13, 0.5, 1.1, 0.8);
  for (const s of [-1, 1]) p.sphere(M.eye, 0.017, -0.15 + s * 0.035, 1.075, -0.03, 1.2, 0.7, 0.6);
  p.sphere(M.hair, 0.1, -0.2, 1.14, -0.17, 0.95, 0.85, 0.9);
  // The wound and what ran from it.
  p.sphere(M.blood, 0.045, -0.1, 1.15, -0.1, 1, 1, 0.7);
  p.limb(M.blood, [-0.12, 1.02, -0.08], [-0.1, 0.9, -0.03], 0.018);
  return p.build();
}

// Porcelain doll sitting with its legs out. Returns { group, head } where head
// is a pivot at the neck that can be turned.
export function doll(seed = 1) {
  const rng = makeRng(seed * 31 + 7);
  const colors = [0x4a3438, 0x343a4c, 0x55462e, 0x3a2a30, 0x4c4c44];
  const dress = M.dress(colors[seed % colors.length]);
  const p = new Parts();
  p.add(dress, new THREE.CylinderGeometry(0.045, 0.12, 0.13, 10), trs(0, 0.065, 0));
  p.add(dress, new THREE.CylinderGeometry(0.042, 0.05, 0.12, 8), trs(0, 0.18, 0));
  p.limb(M.porcelain, [-0.04, 0.03, 0.03], [-0.05, 0.03, 0.2], 0.021);
  p.limb(M.porcelain, [0.04, 0.03, 0.03], [0.055, 0.03, 0.2], 0.021);
  p.sphere(M.leather, 0.025, -0.05, 0.03, 0.22, 1, 0.8, 1.3);
  p.sphere(M.leather, 0.025, 0.055, 0.03, 0.22, 1, 0.8, 1.3);
  const lift = rng() < 0.3 ? 0.08 : 0;
  p.limb(dress, [-0.055, 0.225, 0], [-0.08, 0.13 + lift, 0.05], 0.017);
  p.limb(dress, [0.055, 0.225, 0], [0.08, 0.13, 0.05], 0.017);
  p.sphere(M.porcelain, 0.017, -0.082, 0.12 + lift, 0.055);
  p.sphere(M.porcelain, 0.017, 0.082, 0.12, 0.055);
  const group = p.build();

  const h = new Parts();
  h.sphere(M.porcelain, 0.062, 0, 0.068, 0, 1, 1.05, 0.98);
  h.add(M.hair, new THREE.SphereGeometry(0.066, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), trs(0, 0.075, -0.012, -0.35, 0, 0));
  const oneEye = rng() < 0.35;
  h.sphere(M.eye, 0.0115, -0.023, 0.075, 0.054);
  if (!oneEye) h.sphere(M.eye, 0.0115, 0.023, 0.075, 0.054);
  else h.sphere(M.bloodDry, 0.013, 0.023, 0.074, 0.052);
  h.sphere(M.blood, 0.0075, 0, 0.04, 0.058, 1.6, 0.6, 0.5);
  if (rng() < 0.5) h.box(M.bloodDry, 0.004, 0.05, 0.004, 0.03, 0.09, 0.058, 0, 0, 0.5);
  // The head is returned separately (placed in world space, turned at runtime).
  const head = new THREE.Group();
  head.add(h.build());
  return { group, head, neck: 0.245 };
}

// Shroud-wrapped body hanging from a rope. Origin at the knot (top).
export function shroudBody() {
  const p = new Parts();
  p.add(M.linenDirty, new THREE.CapsuleGeometry(0.19, 1.25, 4, 10), trs(0, -0.85, 0, 0, 0, 0, 1, 1, 0.8));
  p.sphere(M.linenDirty, 0.12, 0, -0.14, 0.02, 1, 1.15, 1);
  for (const y of [-0.3, -0.55, -0.95, -1.3, -1.55]) p.add('rope', new THREE.TorusGeometry(0.2, 0.014, 5, 16), trs(0, y, 0, Math.PI / 2, 0, 0, 1, 0.82, 1));
  p.add(M.bloodDry, new THREE.SphereGeometry(0.2, 10, 8), trs(0.02, -0.75, 0.06, 0, 0, 0, 0.8, 1.2, 0.55));
  p.add(M.blood, new THREE.SphereGeometry(0.1, 8, 6), trs(0, -1.52, 0.05, 0, 0, 0, 1.1, 1.4, 0.9));
  p.limb('rope', [0, 0.02, 0], [0, -0.1, 0], 0.016);
  return p.build();
}

// A grey forearm hooked over the rim of something, fingers hanging down.
// Origin at the rim point; the arm comes from -Z (inside) and hangs toward +Z.
export function paleHand() {
  const p = new Parts();
  const s = M.skinDead;
  p.limb(s, [0, -0.02, -0.34], [0, 0.03, -0.02], 0.04);
  p.sphere(s, 0.045, 0, 0.03, 0.02, 1.0, 0.55, 1.1);
  for (let k = 0; k < 4; k++) {
    const x = -0.03 + k * 0.02;
    p.limb(s, [x, 0.02, 0.06], [x * 1.1, -0.05, 0.09], 0.0095);
    p.limb(s, [x * 1.1, -0.05, 0.09], [x * 1.1, -0.1, 0.08], 0.0085);
  }
  p.limb(s, [0.045, 0.01, 0.0], [0.06, -0.04, 0.05], 0.011);
  p.box(M.blood, 0.07, 0.004, 0.2, 0, 0.012, -0.12);
  return p.build();
}

// Rocking chair. Returns { group, rock } (rock pivots about X at the floor).
export function rockingChair() {
  const p = new Parts();
  const w = 'woodDark';
  const R = 1.1;
  const arc = (z) => 0.025 + (z * z) / (2 * R);
  for (const x of [-0.24, 0.24]) {
    for (let k = 0; k < 6; k++) {
      const z0 = -0.5 + (k / 6) * 1.0;
      const z1 = -0.5 + ((k + 1) / 6) * 1.0;
      p.limb(w, [x, arc(z0), z0], [x, arc(z1), z1], 0.018, 0.018, false);
    }
    p.limb(w, [x, 0.03, 0.2], [x, 0.44, 0.2], 0.02, 0.02, false);
    p.limb(w, [x, 0.03, -0.2], [x, 1.08, -0.3], 0.022, 0.022, false);
    p.limb(w, [x, 0.66, 0.22], [x, 0.66, -0.25], 0.02, 0.02, false);
    p.limb(w, [x, 0.44, 0.2], [x, 0.66, 0.22], 0.016, 0.016, false);
  }
  p.box(w, 0.52, 0.04, 0.46, 0, 0.45, 0);
  p.box(w, 0.52, 0.06, 0.04, 0, 1.06, -0.3, 0.1, 0, 0);
  for (let k = 0; k < 5; k++) p.limb(w, [-0.16 + k * 0.08, 0.47, -0.21], [-0.16 + k * 0.08, 1.03, -0.29], 0.011, 0.011, false);
  p.box('clothRed', 0.4, 0.04, 0.38, 0, 0.485, 0.01);
  const rock = p.build();
  const group = new THREE.Group();
  group.add(rock);
  return { group, rock };
}

// Mobile over the cradle: little bone birds with antlers on threads. Origin at
// the ceiling. Returns { group, spin }.
export function cradleMobile(drop = 1.0) {
  const top = new Parts();
  top.limb(M.iron, [0, 0, 0], [0, -drop, 0], 0.006, 0.006, false);
  const spin = new THREE.Group();
  spin.position.y = -drop;
  const s = new Parts();
  s.add(M.iron, new THREE.TorusGeometry(0.26, 0.006, 4, 24), trs(0, 0, 0, Math.PI / 2, 0, 0));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const x = Math.cos(a) * 0.26;
    const z = Math.sin(a) * 0.26;
    const len = 0.18 + (k % 2) * 0.1;
    s.limb(M.linen, [x, 0, z], [x, -len, z], 0.002, 0.002, false);
    s.sphere('bone', 0.032, x, -len - 0.03, z, 0.8, 0.75, 1.4);
    s.limb('bone', [x - 0.012, -len - 0.01, z], [x - 0.035, -len + 0.05, z - 0.01], 0.004);
    s.limb('bone', [x + 0.012, -len - 0.01, z], [x + 0.035, -len + 0.05, z - 0.01], 0.004);
    s.sphere(M.eye, 0.006, x, -len - 0.025, z + 0.04);
  }
  spin.add(s.build(false));
  const group = top.build(false);
  group.add(spin);
  return { group, spin };
}
