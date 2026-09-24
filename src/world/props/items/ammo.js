import { solid } from '../../materials.js';
import { Kit, TAU, xf, box, cyl, lathe } from '../depths/kit.js';

// Ammunition: loose rounds, shells and their boxes. The round builders are
// also used by the revolver cylinder and the shotgun chambers.

export const BRASS = () => solid(0xb08d3a, { roughness: 0.32, metalness: 0.6 });
export const PRIMER = () => solid(0xc9a45c, { roughness: 0.3, metalness: 0.6 });
export const LEAD = () => solid(0x6c6c70, { roughness: 0.55, metalness: 0.3 });
export const HULL = () => solid(0x7e1812, { roughness: 0.55 });
const CARD = () => solid(0x6e5537, { roughness: 0.92 });
const CARD_IN = () => solid(0x4a3824, { roughness: 0.95 });
const LABEL_RED = () => solid(0x7a1a14, { roughness: 0.8 });

// Revolver round along +Z (rim at z = 0, bullet tip at z ~0.047).
export function addCartridge(kit, m, lod = 'full') {
  const seg = lod === 'full' ? 12 : lod === 'box' ? 6 : 8;
  const k = new Kit({ raw: true });
  if (lod === 'box') {
    // only the top shows: case mouth + bullet
    k.add(BRASS(), cyl(0.0058, 0.0058, 0.012, seg, true), xf([0, 0, 0.0244], [Math.PI / 2, 0, 0]));
    k.add(LEAD(), lathe([[0.0055, 0], [0.0048, 0.009], [0.0025, 0.0148], [0, 0.0166]], seg), xf([0, 0, 0.0304], [Math.PI / 2, 0, 0]));
    kit.addParts(k.merged(), m);
    return;
  }
  k.add(BRASS(), cyl(0.0066, 0.0066, 0.0014, seg), xf([0, 0, 0.0007], [Math.PI / 2, 0, 0]));
  k.add(BRASS(), cyl(0.0057, 0.0058, 0.029, seg, true), xf([0, 0, 0.0014 + 0.0145], [Math.PI / 2, 0, 0]));
  k.add(PRIMER(), cyl(0.0021, 0.0021, 0.0004, 8), xf([0, 0, -0.0001], [Math.PI / 2, 0, 0]));
  const bullet = [[0.0055, 0], [0.0055, 0.004], [0.0048, 0.009], [0.0033, 0.0135], [0.0012, 0.0162], [0, 0.0166]];
  k.add(LEAD(), lathe(bullet, seg), xf([0, 0, 0.0304], [Math.PI / 2, 0, 0]));
  kit.addParts(k.merged(), m);
}

// Shotgun shell along +Z (brass base at z = 0, crimp at z ~0.066).
export function addShell(kit, m, lod = 'full') {
  const seg = lod === 'full' ? 14 : 10;
  const k = new Kit({ raw: true });
  const rx = [Math.PI / 2, 0, 0];
  k.add(BRASS(), cyl(0.0113, 0.0113, 0.0014, seg), xf([0, 0, 0.0007], rx));
  k.add(BRASS(), cyl(0.0108, 0.0108, 0.014, seg, true), xf([0, 0, 0.0084], rx));
  k.add(PRIMER(), cyl(0.0026, 0.0026, 0.0005, 8), xf([0, 0, -0.0001], rx));
  k.add(HULL(), cyl(0.0104, 0.0104, 0.05, seg, true), xf([0, 0, 0.0154 + 0.025], rx));
  // folded crimp: shallow cone with dark fold lines
  k.add(HULL(), lathe([[0.0104, 0], [0.0098, 0.0012], [0.0, 0.0022]], seg), xf([0, 0, 0.0654], rx));
  if (lod === 'full') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      k.add('black', box(0.0006, 0.0004, 0.0092), xf([Math.cos(a) * 0.0048, Math.sin(a) * 0.0048, 0.0667], [0, 0, a + Math.PI / 2]).multiply(xf([0, 0, 0], [0.1, 0, 0])));
    }
  }
  kit.addParts(k.merged(), m);
}

// Single revolver round lying on its side (axis along X).
export function cartridge() {
  const kit = new Kit();
  addCartridge(kit, xf([-0.0235, 0.0066, 0], [0, Math.PI / 2, 0]));
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// Single shotgun shell lying on its side (axis along X).
export function shell() {
  const kit = new Kit();
  addShell(kit, xf([-0.034, 0.0113, 0], [0, Math.PI / 2, 0]));
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// Open box with a hinged lid and flap, x/z footprint w x d, height h.
function cardBox(kit, w, h, d, lidAngle) {
  const t = 0.0015;
  kit.add(CARD(), box(w, t, d), xf([0, t / 2, 0]));
  for (const s of [-1, 1]) {
    kit.add(CARD(), box(w, h, t), xf([0, h / 2, s * (d / 2 - t / 2)]));
    kit.add(CARD(), box(t, h, d - 2 * t), xf([s * (w / 2 - t / 2), h / 2, 0]));
  }
  kit.add(CARD_IN(), box(w - 2 * t, 0.001, d - 2 * t), xf([0, t + 0.0005, 0]));
  // lid hinged on the back edge
  const lid = xf([0, h, -d / 2], [-lidAngle, 0, 0]);
  const lk = new Kit({ raw: true });
  lk.add(CARD(), box(w + 0.002, t, d + 0.002), xf([0, 0, d / 2]));
  lk.add(CARD(), box(w + 0.002, 0.012, t), xf([0, -0.006, d + 0.001]));
  lk.add(LABEL_RED(), box(w * 0.8, 0.0004, d * 0.35), xf([0, t / 2 + 0.0002, d * 0.5]));
  lk.add('paper', box(w * 0.5, 0.0005, d * 0.18), xf([0, t / 2 + 0.0004, d * 0.5]));
  kit.addParts(lk.merged(), lid);
}

// Small cardboard box of revolver cartridges, lid open, a few loose rounds.
export function ammoBox() {
  const kit = new Kit();
  const w = 0.078;
  const d = 0.058;
  const h = 0.028;
  cardBox(kit, w, h, d, 1.9);
  // rounds standing bullet-up in a 5 x 4 grid, two gone
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i === 4 && j === 0) || (i === 3 && j === 0)) continue;
      const x = -w / 2 + 0.008 + i * 0.0152;
      const z = -d / 2 + 0.0085 + j * 0.0138;
      addCartridge(kit, xf([x, 0.0015 + 0.001, z], [-Math.PI / 2, 0, 0]), 'box');
    }
  }
  // loose rounds
  addCartridge(kit, xf([0.07, 0.0066, 0.01], [0, 2.1, 0]), 'full');
  addCartridge(kit, xf([0.058, 0.0066, 0.045], [0, 0.4, 0]), 'full');
  addCartridge(kit, xf([-0.02, 0.0066, 0.06], [0, -1.2, 0]), 'full');
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

// A few red shotgun shells and their small box.
export function shells() {
  const kit = new Kit();
  const w = 0.07;
  const d = 0.048;
  const h = 0.05;
  cardBox(kit, w, h, d, 1.7);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      if (i === 2 && j === 1) continue;
      addShell(kit, xf([-w / 2 + 0.012 + i * 0.023, 0.002, -d / 2 + 0.012 + j * 0.023], [-Math.PI / 2, 0, 0]), 'lite');
    }
  }
  addShell(kit, xf([0.06, 0.0113, 0.03], [0, 2.6, 0]));
  addShell(kit, xf([0.02, 0.0113, 0.06], [0, 0.3, 0]));
  addShell(kit, xf([-0.065, 0.0113, 0.02], [0, -1.9, 0]));
  const obj = kit.build();
  obj.userData.collider = 'none';
  return obj;
}

