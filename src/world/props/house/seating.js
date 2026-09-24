import * as THREE from 'three';
import { Kit, finish, legProfile, addBookFlat, bookMat } from './kit.js';

const SY = 0.46; // seat height
const HX = 0.2; // leg half-spacing across
const FZ = 0.19; // front legs
const BZ = -0.19; // back legs
const RAKE = 0.075; // back leans this far back at the top
const BACK_H = 0.96;
const backZ = (y) => BZ - (RAKE * y) / BACK_H;
const BACK_RX = -Math.atan2(RAKE, BACK_H);

// Dining chair parts. broken snaps the front-right leg at `cut` and the back.
function chairParts(k, { broken = false, cut = 0.09 } = {}) {
  const w = 'woodDark';
  const rng = k.rng;
  for (const sx of [-1, 1]) {
    const prof = legProfile(SY - 0.02, 0.022);
    if (broken && sx > 0) {
      // Snapped leg: keep the part above the cut, splinters at the break.
      const kept = [[0, cut], ...prof.filter(([, y]) => y > cut)];
      kept.splice(1, 0, [0.018, cut]);
      k.lathe(w, kept, sx * HX, 0, FZ, 7);
      k.box(w, 0.008, 0.035, 0.01, sx * HX + 0.006, cut - 0.012, FZ + 0.004, 0.2, 0, 0.25);
      k.box(w, 0.007, 0.025, 0.008, sx * HX - 0.007, cut - 0.008, FZ - 0.005, -0.2, 0, -0.3);
    } else {
      k.lathe(w, prof, sx * HX, 0, FZ, 7);
    }
    // Back post: straight, raked, snapped on the broken chair's left side.
    const top = broken && sx < 0 ? 0.64 : BACK_H;
    k.box(w, 0.036, top, 0.036, sx * HX, top / 2, backZ(top / 2), BACK_RX, 0, 0);
    if (broken && sx < 0) k.box(w, 0.012, 0.05, 0.014, sx * HX + 0.008, top + 0.02, backZ(top) + 0.004, 0.3, 0, -0.2);
  }
  // Seat, rails and stretchers.
  k.box(w, 0.46, 0.035, 0.44, 0, SY - 0.0175, 0.005);
  k.box(w, 0.4, 0.06, 0.02, 0, SY - 0.065, FZ);
  k.box(w, 0.4, 0.06, 0.02, 0, SY - 0.065, BZ - 0.004);
  for (const sx of [-1, 1]) {
    k.box(w, 0.02, 0.06, 0.36, sx * HX, SY - 0.065, 0);
    k.box(w, 0.018, 0.022, 0.36, sx * HX, 0.15, 0);
  }
  k.box(w, 0.4, 0.02, 0.018, 0, 0.16, 0);
  // Back: top rail, mid rail, three spindles.
  const rails = (m) => {
    k.box(w, 0.44, 0.075, 0.028, 0, 0.9, backZ(0.9), BACK_RX, 0, 0);
    k.box(w, 0.4, 0.03, 0.022, 0, 0.62, backZ(0.62), BACK_RX, 0, 0);
    for (const x of [-0.09, 0, 0.09]) {
      if (m && x > 0.05) continue;
      k.box(w, 0.024, 0.25, 0.016, x, 0.75, backZ(0.75), BACK_RX, 0, 0);
    }
  };
  if (!broken) {
    rails(false);
  } else {
    // Snapped back: the top rail hangs from the right post by one end.
    k.box(w, 0.4, 0.03, 0.022, 0, 0.62, backZ(0.62), BACK_RX, 0, 0);
    k.box(w, 0.024, 0.12, 0.016, -0.09, 0.69, backZ(0.69), BACK_RX, 0, 0.1);
    const px = HX - 0.01;
    const py = 0.9;
    k.push(px, py, backZ(py) - 0.01, BACK_RX, 0, 0.75);
    k.box(w, 0.44, 0.075, 0.028, -0.22, 0, 0);
    k.box(w, 0.024, 0.16, 0.016, -0.2, -0.1, 0.004, 0, 0, -0.5);
    k.pop();
  }
  if (!broken && rng() < 0.5) k.rbox('clothRed', 0.4, 0.04, 0.38, 0.015, 0, SY + 0.02, 0.01);
}

// Victorian dining chair.
export function chair(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  chairParts(k);
  return finish(k, 'chair', {}, true);
}

// Chair with a snapped front leg (leaning on the stump) and a broken back.
export function chairBroken(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const cut = 0.09;
  chairParts(k, { broken: true, cut });
  // Tip it about the diagonal through the front-left and back-right feet until
  // the front-right stump touches the floor.
  const a = new THREE.Vector3(-HX, 0, FZ);
  const b = new THREE.Vector3(HX, 0, BZ);
  const axis = b.clone().sub(a).normalize();
  const fr = new THREE.Vector3(HX, 0, FZ).sub(a);
  const dist = fr.clone().sub(axis.clone().multiplyScalar(fr.dot(axis))).length();
  let ang = Math.asin(Math.min(1, cut / dist));
  const test = new THREE.Vector3(HX, cut, FZ).sub(a).applyAxisAngle(axis, ang);
  if (test.y > cut) ang = -ang;
  const m = new THREE.Matrix4().makeTranslation(a.x, a.y, a.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(axis, ang))
    .multiply(new THREE.Matrix4().makeTranslation(-a.x, -a.y, -a.z));
  k.transformAll(m);
  const bb = k.bounds();
  k.transformAll(new THREE.Matrix4().makeTranslation(0, -bb.min.y, 0));
  // The snapped-off foot lies under the seat.
  k.push(0.05, 0.02, 0.1, 0, 0.8, Math.PI / 2);
  k.lathe('woodDark', legProfile(SY - 0.02, 0.022).filter(([, y]) => y <= cut).concat([[0.02, cut], [0, cut]]), 0, -cut / 2, 0, 7);
  k.pop();
  return finish(k, 'chairBroken', {}, true);
}

// Wingback armchair, worn through on the seat.
export function armchair(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const up = opts.fabric ?? (rng() < 0.6 ? 'clothRed' : 'cloth');
  const foot = [[0, 0], [0.02, 0], [0.028, 0.04], [0.022, 0.08], [0.03, 0.11], [0.03, 0.13], [0, 0.13]];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.lathe('woodDark', foot, sx * 0.34, 0, sz * 0.32, 7);
  k.rbox(up, 0.84, 0.3, 0.78, 0.04, 0, 0.27, 0.01);
  k.rbox(up, 0.56, 0.11, 0.6, 0.045, 0, 0.47, 0.08);
  k.rbox(up, 0.84, 0.74, 0.18, 0.06, 0, 0.78, -0.3, -0.1, 0, 0);
  for (const sx of [-1, 1]) {
    k.rbox(up, 0.13, 0.25, 0.68, 0.04, sx * 0.355, 0.52, 0.05);
    k.cyl(up, 0.072, 0.072, 0.7, sx * 0.365, 0.645, 0.05, Math.PI / 2, 0, 0, 10);
    k.rbox(up, 0.1, 0.46, 0.32, 0.04, sx * 0.37, 0.9, -0.19, 0, sx * 0.2, 0);
  }
  // Tear in the seat with stuffing coming out, and old stains.
  const tx = rng.range(-0.12, 0.12);
  k.stain('decal:grime', 0.09, 0.06, tx, 0.5265, 0.14, 0.5);
  for (let i = 0; i < 3; i++) k.sphere('linen', rng.range(0.018, 0.03), tx + rng.range(-0.04, 0.04), 0.525, 0.14 + rng.range(-0.03, 0.03), 1, 0.6, 1, 5, 4);
  k.push(0, 0.78, -0.3, -0.1, 0, 0);
  k.stainV('decal:grime', 0.14, 0.1, rng.range(-0.2, 0.2), rng.range(-0.05, 0.2), 0.092, 0, 0.4);
  k.pop();
  if (rng() < 0.5) k.stainV('decal:bloodSmear', 0.05, 0.08, 0.355, 0.5, 0.392, 0, 0.5);
  return finish(k, 'armchair', {}, true);
}

// Three-seat sofa with button tufting and a sagging cushion.
export function sofa(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const up = opts.fabric ?? (rng() < 0.5 ? 'clothRed' : 'cloth');
  const foot = [[0, 0], [0.022, 0], [0.03, 0.04], [0.024, 0.08], [0.028, 0.12], [0, 0.12]];
  for (const x of [-0.9, 0.9]) for (const sz of [-1, 1]) k.lathe('woodDark', foot, x, 0, sz * 0.32, 7);
  k.rbox(up, 2.0, 0.3, 0.8, 0.04, 0, 0.27, 0.02);
  const sag = rng.int(0, 2);
  for (let i = 0; i < 3; i++) {
    const s = i === sag;
    k.rbox(up, 0.58, s ? 0.09 : 0.12, 0.62, 0.045, (i - 1) * 0.6, s ? 0.465 : 0.48, 0.07, s ? 0.04 : 0, 0, s ? 0.03 : 0);
  }
  k.rbox(up, 2.0, 0.58, 0.2, 0.06, 0, 0.67, -0.31, -0.1, 0, 0);
  for (const sx of [-1, 1]) {
    k.rbox(up, 0.16, 0.28, 0.8, 0.04, sx * 0.92, 0.52, 0.02);
    k.cyl(up, 0.085, 0.085, 0.82, sx * 0.93, 0.665, 0.02, Math.PI / 2, 0, 0, 10);
  }
  // Tufting buttons on the back.
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 5; i++) {
      const y = 0.62 + r * 0.16;
      k.sphere('black', 0.012, -0.72 + i * 0.36 + (r ? 0.18 : 0), y, -0.2 - (y - 0.62) * 0.1 + 0.003, 1, 1, 0.6, 4, 3);
    }
  }
  const tx = (sag - 1) * 0.6 + rng.range(-0.1, 0.1);
  k.stain('decal:grime', 0.12, 0.08, tx, 0.509, 0.16, 0.5);
  for (let i = 0; i < 4; i++) k.sphere('linen', rng.range(0.018, 0.03), tx + rng.range(-0.06, 0.06), 0.515, 0.16 + rng.range(-0.04, 0.04), 1, 0.6, 1, 5, 4);
  k.push(0, 0.67, -0.31, -0.1, 0, 0);
  k.stainV('decal:grime', 0.25, 0.12, rng.range(-0.6, 0.6), 0.1, 0.102, 0, 0.4);
  k.pop();
  if (rng() < 0.6) k.stain('decal:bloodSmear', 0.12, 0.09, (((sag + 1) % 3) - 1) * 0.6 + rng.range(-0.15, 0.15), 0.5415, 0.1, 0.5);
  return finish(k, 'sofa', {}, true);
}

// 2.4 m church pew; seat faces +Z, hymnal shelf on the back.
export function pew(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const w = 'woodDark';
  const L = 2.4;
  const zb = (y) => -0.19 - 0.176 * (y - 0.47);
  const s = new THREE.Shape();
  s.moveTo(-0.32, 0);
  s.lineTo(0.3, 0);
  s.lineTo(0.3, 0.6);
  s.quadraticCurveTo(0.3, 0.7, 0.18, 0.7);
  s.lineTo(-0.1, 0.7);
  s.lineTo(-0.24, 0.98);
  s.quadraticCurveTo(-0.29, 1.05, -0.34, 0.98);
  s.lineTo(-0.32, 0);
  for (const sx of [-1, 1]) k.extrude(w, s, 0.06, sx > 0 ? L / 2 : -L / 2 + 0.06, 0, 0, 0, -Math.PI / 2, 0, 0, 5);
  const iw = L - 0.12;
  k.box(w, iw, 0.04, 0.46, 0, 0.45, 0.03, -0.03, 0, 0);
  k.box(w, iw, 0.06, 0.025, 0, 0.405, 0.245);
  k.box(w, 0.04, 0.4, 0.36, 0, 0.2, 0.03);
  for (const [y0, y1] of [[0.49, 0.72], [0.74, 0.96]]) {
    const yc = (y0 + y1) / 2;
    k.box(w, iw, y1 - y0, 0.025, 0, yc, zb(yc), -0.175, 0, 0);
  }
  k.box(w, iw, 0.035, 0.075, 0, 0.978, zb(0.978) - 0.012, -0.175, 0, 0);
  // Hymnal shelf behind the backrest.
  const hz = zb(0.8) - 0.075;
  k.box(w, iw - 0.1, 0.018, 0.11, 0, 0.8, hz);
  k.box(w, iw - 0.1, 0.05, 0.015, 0, 0.82, hz - 0.05);
  const nb = rng.int(1, 3);
  for (let i = 0; i < nb; i++) addBookFlat(k, 0.14, 0.03, 0.2, bookMat(rng.int(0, 7)), rng.range(-0.9, 0.9), 0.809, hz, rng.range(-0.3, 0.3));
  k.stain('decal:grime', 0.3, 0.12, rng.range(-0.7, 0.7), 0.472, 0.05, 0.4);
  return finish(k, 'pew', {}, true);
}
