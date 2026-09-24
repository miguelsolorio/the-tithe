import * as THREE from 'three';
import { makeRng } from '../../core/rng.js';
import { Parts, M, trs, LADDER_ANGLE, CEIL } from './common.js';

// Custom fixtures: the attic hatch and folding ladder, a pull-chain toilet,
// bedrolls, hanging robes, linen stacks, suitcases, and canvas textures (the
// horned silhouette, tally marks, light shafts).

const LADDER_LEN = CEIL / Math.sin(LADDER_ANGLE);

// Folding attic ladder along local -X from the hinge (origin), rails at z = +-0.22.
export function ladderMesh(len = LADDER_LEN) {
  const p = new Parts();
  for (const z of [-0.22, 0.22]) p.box('wood', len, 0.08, 0.04, -len / 2, -0.07, z);
  for (let d = 0.28; d < len - 0.1; d += 0.29) p.box('woodDark', 0.07, 0.03, 0.44, -d, -0.07, 0);
  // Hinge brackets where the sections fold.
  for (const d of [len * 0.36, len * 0.7]) for (const z of [-0.245, 0.245]) p.box(M.iron, 0.12, 0.1, 0.01, -d, -0.07, z);
  return p.build();
}

// Pull-down hatch: pivot at the hinge edge (east), panel extends to -X.
// Returns { pivot, panel, ladder, cord }. Rotate pivot.rotation.z to open.
export function hatchAssembly(width = 1.2, depth = 0.8) {
  const pivot = new THREE.Group();
  const pp = new Parts();
  pp.box('woodDark', width, 0.045, depth, -width / 2, -0.024, 0);
  pp.box('wood', width - 0.12, 0.012, depth - 0.12, -width / 2, -0.052, 0);
  pp.box(M.brass, 0.07, 0.02, 0.07, -width + 0.12, -0.065, 0);
  const panel = pp.build();
  pivot.add(panel);
  const ladder = ladderMesh();
  ladder.visible = false;
  pivot.add(ladder);
  const cp = new Parts();
  cp.limb('rope', [-width + 0.12, -0.07, 0], [-width + 0.12, -0.9, 0], 0.007, 0.007, false);
  cp.add('woodDark', new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), trs(-width + 0.12, -0.95, 0));
  const cord = cp.build();
  pivot.add(cord);
  return { pivot, panel, ladder, cord };
}

// High-tank pull-chain toilet against a wall at -Z (faces +Z).
export function toilet() {
  const p = new Parts();
  const c = () => M.porcelain();
  p.add(c, new THREE.CylinderGeometry(0.11, 0.14, 0.3, 12), trs(0, 0.15, 0.05));
  p.add(c, new THREE.CylinderGeometry(0.2, 0.13, 0.12, 14), trs(0, 0.36, 0.1, 0, 0, 0, 1, 1, 1.25));
  p.add(M.eye, new THREE.CylinderGeometry(0.15, 0.15, 0.01, 14), trs(0, 0.415, 0.1, 0, 0, 0, 1, 1, 1.2));
  p.add('woodDark', new THREE.TorusGeometry(0.16, 0.025, 6, 16), trs(0, 0.43, 0.1, Math.PI / 2, 0, 0, 1, 1.2, 1));
  p.box('woodDark', 0.42, 0.24, 0.16, 0, 1.95, -0.08);
  p.limb(M.iron, [0.14, 1.83, -0.06], [0.14, 0.42, -0.06], 0.018, 0.018, false);
  p.limb(M.iron, [-0.16, 1.9, 0.0], [-0.16, 1.35, 0.0], 0.004, 0.004, false);
  p.add('woodDark', new THREE.CylinderGeometry(0.018, 0.018, 0.09, 6), trs(-0.16, 1.3, 0));
  p.add(M.bloodDry, new THREE.CylinderGeometry(0.12, 0.12, 0.004, 12), trs(0, 0.405, 0.1, 0, 0, 0, 1, 1, 1.1));
  return p.build();
}

// Sleeping mat with a rolled blanket and a pillow lump, along Z.
export function bedroll(seed = 1) {
  const rng = makeRng(seed);
  const p = new Parts();
  const cloth = rng() < 0.5 ? M.linenDirty : 'cloth';
  p.box(cloth, 0.7, 0.06, 1.8, 0, 0.03, 0, 0, rng.range(-0.06, 0.06), 0);
  p.add(rng() < 0.5 ? 'clothRed' : M.linen, new THREE.CylinderGeometry(0.1, 0.1, 0.66, 10), trs(0, 0.1, 0.72, 0, 0, Math.PI / 2));
  p.sphere(M.linen, 0.18, 0.02, 0.09, -0.72, 1.3, 0.4, 0.8);
  if (rng() < 0.6) p.box('clothRed', 0.66, 0.02, 0.9, 0.03, 0.07, -0.05, 0, rng.range(-0.2, 0.2), 0);
  return p.build(false);
}

// Robe hanging from a hook at the origin (hangs down to ~1.6 below it).
export function robe(seed = 1) {
  const rng = makeRng(seed);
  const p = new Parts();
  const len = rng.range(1.35, 1.6);
  const pts = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    pts.push(new THREE.Vector2(0.06 + 0.2 * Math.pow(t, 0.55) + (t > 0.95 ? 0.02 : 0), -len * t));
  }
  p.add(M.robe, new THREE.LatheGeometry(pts, 12), trs(0, -0.12, 0, 0, 0, 0, 1, 1, 0.55));
  p.sphere(M.robe, 0.14, 0, -0.1, -0.04, 1, 1.2, 0.9);
  p.limb(M.iron, [0, 0.02, 0], [0, -0.06, 0], 0.006, 0.006, false);
  p.box('woodDark', 0.42, 0.02, 0.02, 0, -0.1, 0);
  return p.build();
}

// Stack of folded linens.
export function linenStack(n, seed = 1) {
  const rng = makeRng(seed);
  const p = new Parts();
  let y = 0;
  for (let k = 0; k < n; k++) {
    const t = rng.range(0.035, 0.06);
    p.box(rng() < 0.7 ? M.linen : rng() < 0.5 ? M.linenDirty : 'clothRed', rng.range(0.32, 0.4), t, rng.range(0.3, 0.36), rng.range(-0.02, 0.02), y + t / 2, 0, 0, rng.range(-0.08, 0.08), 0);
    y += t;
  }
  return p.build(false);
}

// Old suitcase lying flat or standing.
export function suitcase(seed = 1, standing = false) {
  const rng = makeRng(seed);
  const p = new Parts();
  const w = rng.range(0.45, 0.65);
  const h = rng.range(0.14, 0.2);
  const d = rng.range(0.3, 0.4);
  const col = [0x2b1a10, 0x3a2a1a, 0x1e2430, 0x4a2a1a][rng.int(0, 3)];
  const body = M.dress(col);
  if (standing) {
    p.box(body, w, d, h, 0, d / 2, 0);
    p.box(M.leather, 0.12, 0.03, 0.03, 0, d + 0.015, 0);
  } else {
    p.box(body, w, h, d, 0, h / 2, 0);
    p.box(M.leather, 0.12, 0.03, 0.03, 0, h / 2, d / 2 + 0.015);
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) p.box(M.brass, 0.04, 0.04, 0.01, x, h - 0.02, d / 2 + 0.005);
  }
  return p.build();
}

// Scattered straw for the attic nest (world-space rectangle, one merged mesh).
export function strawMat(w, d, n = 260, seed = 3) {
  const rng = makeRng(seed);
  const p = new Parts();
  for (let k = 0; k < n; k++) p.box(M.straw, rng.range(0.1, 0.28), 0.006, 0.008, rng.range(-w / 2, w / 2), 0.004 + rng.range(0, 0.02), rng.range(-d / 2, d / 2), 0, rng.range(0, Math.PI), 0);
  return p.build(false);
}

// ---------- Canvas textures ----------

// The horned figure (dark silhouette, pale eye glints), transparent background.
let _sil = null;
export function silhouetteTexture() {
  if (_sil) return _sil;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const x = c.getContext('2d');
  x.filter = 'blur(2.5px)';
  x.fillStyle = 'rgba(4,2,2,1)';
  // Robe/body: broad hunched shoulders tapering to the floor.
  x.beginPath();
  x.moveTo(128, 118);
  x.bezierCurveTo(60, 125, 44, 170, 40, 230);
  x.bezierCurveTo(36, 330, 58, 430, 70, 512);
  x.lineTo(186, 512);
  x.bezierCurveTo(198, 430, 220, 330, 216, 230);
  x.bezierCurveTo(212, 170, 196, 125, 128, 118);
  x.fill();
  // Long arms hanging past the knees, spindly fingers.
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(128 + s * 78, 160);
    x.quadraticCurveTo(128 + s * 100, 300, 128 + s * 92, 420);
    x.lineTo(128 + s * 80, 420);
    x.quadraticCurveTo(128 + s * 84, 300, 128 + s * 62, 180);
    x.fill();
    for (let f = 0; f < 4; f++) {
      x.beginPath();
      x.moveTo(128 + s * (82 + f * 3), 418);
      x.lineTo(128 + s * (78 + f * 5), 462 + f * 4);
      x.lineWidth = 3;
      x.strokeStyle = 'rgba(4,2,2,1)';
      x.stroke();
    }
  }
  // Head, tilted, and great ram horns sweeping up, out and curling down.
  x.beginPath();
  x.ellipse(130, 104, 24, 32, 0.15, 0, Math.PI * 2);
  x.fill();
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(130 + s * 26, 100);
    x.bezierCurveTo(130 + s * 70, -18, 130 + s * 150, 10, 130 + s * 122, 104);
    x.bezierCurveTo(130 + s * 118, 118, 130 + s * 108, 116, 130 + s * 110, 100);
    x.bezierCurveTo(130 + s * 124, 44, 130 + s * 74, 22, 130 + s * 12, 84);
    x.fill();
  }
  x.filter = 'none';
  // Eyes: two small pinpricks of light.
  for (const s of [-1, 1]) {
    const g = x.createRadialGradient(130 + s * 11, 104, 0, 130 + s * 11, 104, 9);
    g.addColorStop(0, 'rgba(255,190,150,1)');
    g.addColorStop(0.35, 'rgba(230,40,20,0.9)');
    g.addColorStop(1, 'rgba(120,0,0,0)');
    x.fillStyle = g;
    x.fillRect(130 + s * 11 - 10, 94, 20, 20);
  }
  _sil = new THREE.CanvasTexture(c);
  _sil.colorSpace = THREE.SRGBColorSpace;
  return _sil;
}

// Hundreds of tally marks scratched into plaster (transparent background).
export function tallyTexture(count = 340) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const x = c.getContext('2d');
  const rng = makeRng(99);
  x.strokeStyle = 'rgba(205,195,170,0.85)';
  x.lineCap = 'round';
  let n = 0;
  for (let row = 0; row < 14 && n < count; row++) {
    for (let g = 0; g < 12 && n < count; g++) {
      const ox = 12 + g * 41 + rng.range(-3, 3);
      const oy = 14 + row * 26 + rng.range(-2, 2);
      const k = Math.min(5, count - n);
      for (let t = 0; t < Math.min(4, k); t++) {
        x.lineWidth = rng.range(1.2, 2.2);
        x.beginPath();
        x.moveTo(ox + t * 7, oy);
        x.lineTo(ox + t * 7 + rng.range(-2, 2), oy + 19);
        x.stroke();
      }
      if (k === 5) {
        x.beginPath();
        x.moveTo(ox - 3, oy + 15);
        x.lineTo(ox + 26, oy + 3);
        x.stroke();
      }
      n += k;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft vertical gradient for fake light shafts (additive).
let _shaft = null;
export function shaftTexture() {
  if (_shaft) return _shaft;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 128);
  const h = x.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)');
  h.addColorStop(0.3, 'rgba(0,0,0,0)');
  h.addColorStop(0.7, 'rgba(0,0,0,0)');
  h.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = h;
  x.fillRect(0, 0, 64, 128);
  _shaft = new THREE.CanvasTexture(c);
  return _shaft;
}
