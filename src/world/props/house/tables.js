import { Kit, TAU, finish, candleLight, centroid, legProfile, addCandle, addOpenBook, addPlate, addGoblet, addKnife, addDrip } from './kit.js';

const FLAT = -Math.PI / 2;

// Small side table: drawer, turned legs, under-shelf.
export function table(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const W = 0.55;
  const D = 0.48;
  const H = 0.72;
  const w = 'woodDark';
  const lx = W / 2 - 0.05;
  const lz = D / 2 - 0.05;
  k.box(w, W, 0.03, D, 0, H - 0.015, 0);
  k.box(w, W - 0.03, 0.012, D - 0.03, 0, H - 0.036, 0);
  k.span(w, -lx, H - 0.12, lz - 0.02, lx, H - 0.042, lz);
  k.span(w, -lx, H - 0.12, -lz, lx, H - 0.042, -lz + 0.02);
  k.span(w, -lx, H - 0.12, -lz, -lx + 0.02, H - 0.042, lz);
  k.span(w, lx - 0.02, H - 0.12, -lz, lx, H - 0.042, lz);
  k.box(w, 0.3, 0.06, 0.012, 0, H - 0.081, lz + 0.006);
  k.sphere('brass', 0.011, 0, H - 0.081, lz + 0.018, 1, 1, 1, 6, 4);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(w, 0.044, 0.1, 0.044, sx * lx, H - 0.09, sz * lz);
      k.lathe(w, legProfile(H - 0.14, 0.024), sx * lx, 0, sz * lz, 7);
    }
  }
  k.box(w, W - 0.06, 0.02, D - 0.06, 0, 0.17, 0);
  return finish(k, 'table', {}, true);
}

// Round pedestal table on three splayed feet.
export function roundTable(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const R = opts.r ?? 0.5;
  const H = 0.76;
  const w = 'woodDark';
  k.cyl(w, R, R, 0.035, 0, H - 0.0175, 0, 0, 0, 0, 28);
  k.cyl(w, R - 0.025, R - 0.035, 0.02, 0, H - 0.045, 0, 0, 0, 0, 28);
  k.cyl(w, R * 0.72, R * 0.72, 0.07, 0, H - 0.09, 0, 0, 0, 0, 18);
  k.lathe(w, [[0, 0.1], [0.085, 0.1], [0.1, 0.14], [0.06, 0.2], [0.075, 0.3], [0.1, 0.4], [0.07, 0.5], [0.05, 0.58], [0.075, 0.63], [0.075, H - 0.12], [0, H - 0.12]], 0, 0, 0, 10);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    k.tube(w, [[c * 0.05, 0.22, s * 0.05], [c * 0.2, 0.13, s * 0.2], [c * 0.34, 0.045, s * 0.34], [c * 0.4, 0.03, s * 0.4]], (t) => 0.036 - 0.014 * t, 6, 5);
    k.sphere(w, 0.03, c * 0.4, 0.03, s * 0.4, 1, 1, 1, 6, 4);
  }
  return finish(k, 'roundTable', {}, true);
}

// 3.2 m dining table under a stained cloth. opts.rotten lays a rotted feast.
export function diningTable(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const L = 3.2;
  const W = 1.05;
  const H = 0.78;
  const w = 'woodDark';
  for (const x of [-L / 2 + 0.12, 0, L / 2 - 0.12]) {
    for (const z of [-W / 2 + 0.1, W / 2 - 0.1]) {
      k.lathe(w, legProfile(0.62, 0.042), x, 0, z, 6);
      k.box(w, 0.075, 0.12, 0.075, x, 0.68, z);
    }
  }
  k.span(w, -L / 2 + 0.1, 0.64, -W / 2 + 0.08, L / 2 - 0.1, 0.74, W / 2 - 0.08);
  k.box(w, L, 0.04, W, 0, H - 0.02, 0);

  // Tablecloth: top sheet and a ragged drop on every side.
  const cy = H + 0.003;
  const cl = L + 0.08;
  const cw = W + 0.08;
  k.box('linen', cl, 0.006, cw, 0, cy, 0);
  const hang = (len, n, place) => {
    const seg = len / n;
    for (let i = 0; i < n; i++) place(-len / 2 + seg * (i + 0.5), seg + 0.015, rng.range(0.2, 0.34), rng.range(-0.003, 0.003));
  };
  for (const sz of [-1, 1]) hang(cl, 10, (u, s, h, j) => k.box('linen', s, h, 0.006, u, cy - h / 2, sz * (cw / 2 + 0.003 + j)));
  for (const sx of [-1, 1]) hang(cw, 3, (u, s, h, j) => k.box('linen', 0.006, h, s, sx * (cl / 2 + 0.003 + j), cy - h / 2, u));

  const top = cy + 0.003;
  for (let i = 0; i < 8; i++) k.stain('decal:grime', rng.range(0.05, 0.16), rng.range(0.04, 0.12), rng.range(-1.45, 1.45), top + 0.0004, rng.range(-0.42, 0.42));
  for (let i = 0; i < 5; i++) k.stain('decal:bloodSmear', rng.range(0.06, 0.2), rng.range(0.05, 0.14), rng.range(-1.35, 1.35), top + 0.0008, rng.range(-0.38, 0.38));
  for (let i = 0; i < 2; i++) k.dripV('decal:bloodDrip', rng.range(0.08, 0.16), rng.range(0.12, 0.22), rng.range(-1.3, 1.3), cy, cw / 2 + 0.011);

  if (opts.rotten) {
    const seats = [];
    for (const x of [-1.05, 0, 1.05]) for (const sz of [-1, 1]) seats.push([x, sz * 0.33, sz]);
    seats.push([-1.42, 0, 0], [1.42, 0, 0]);
    for (const [x, z, sz] of seats) {
      addPlate(k, 0.12, x, top, z);
      const n = rng.int(0, 2);
      for (let i = 0; i < n; i++) {
        k.sphere(rng() < 0.6 ? 'fleshDark' : 'flesh', rng.range(0.025, 0.045), x + rng.range(-0.05, 0.05), top + 0.016, z + rng.range(-0.05, 0.05), 1, 0.55, 1.25, 6, 4, 0, rng() * TAU, 0);
      }
      if (rng() < 0.45) k.rod('bone', [x - 0.06, top + 0.02, z - 0.02], [x + 0.07, top + 0.024, z + 0.03], 0.007, 0.006, 5);
      if (!n) k.stain('decal:grime', 0.06, 0.05, x, top + 0.009, z);
      const gx = sz ? x + 0.17 : x;
      const gz = sz ? z - sz * 0.13 : z + 0.17;
      if (rng() < 0.3) {
        addGoblet(k, gx, top + 0.036, gz, 'brass', 0.16, Math.PI / 2, rng() * TAU);
        k.stain('decal:bloodSmear', 0.11, 0.06, gx, top + 0.0012, gz + 0.04);
      } else {
        addGoblet(k, gx, top, gz);
      }
      const ca = sz ? 0 : Math.PI / 2;
      k.push(x, top + 0.0015, z, 0, ca, 0);
      k.box('nickel', 0.012, 0.003, 0.17, -0.155, 0, 0, 0, rng.range(-0.12, 0.12), 0);
      k.box('nickel', 0.014, 0.003, 0.18, 0.155, 0, 0, 0, rng.range(-0.12, 0.12), 0);
      k.pop();
    }
    // Carcass on a platter, ribs arching out of it.
    addPlate(k, 0.26, 0, top, 0, 'nickel');
    k.sphere('fleshDark', 0.2, 0, top + 0.03, 0, 1, 0.34, 0.55, 10, 6);
    k.sphere('flesh', 0.08, -0.14, top + 0.04, 0.02, 1, 0.6, 0.8, 6, 4);
    for (let i = 0; i < 6; i++) k.torus('bone', 0.095 - Math.abs(i - 2.5) * 0.01, 0.0055, -0.11 + i * 0.045, top + 0.035, 0, 0, Math.PI / 2, 0, 3, 8, Math.PI);
    k.stain('decal:bloodSmear', 0.3, 0.2, 0.05, top + 0.0016, 0.05);
    // Two unlit candlesticks.
    for (const sx of [-1, 1]) {
      k.lathe('brass', [[0, 0], [0.05, 0], [0.045, 0.012], [0.014, 0.03], [0.012, 0.18], [0.026, 0.2], [0.022, 0.215], [0, 0.215]], sx * 0.62, top, 0, 8);
      k.push(sx * 0.62, top + 0.215, 0);
      addCandle(k, { h: rng.range(0.07, 0.16), r: 0.013, lit: false, drips: 2, seg: 6 });
      k.pop();
    }
  }
  return finish(k, 'diningTable', {}, true);
}

// Writing desk: two drawer pedestals, papers, inkwell and quill, open book.
export function desk(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = 1.3;
  const D = 0.68;
  const H = 0.78;
  const w = 'woodDark';
  const fz = D / 2 - 0.03;
  k.box(w, W, 0.035, D, 0, H - 0.0175, 0);
  k.box('felt', W - 0.22, 0.002, D - 0.2, 0, H + 0.001, 0.03);
  k.box(w, W - 0.04, 0.05, 0.02, 0, H + 0.025, -D / 2 + 0.03);
  for (const sx of [-1, 1]) k.box(w, 0.02, 0.05, 0.12, sx * (W / 2 - 0.03), H + 0.025, -D / 2 + 0.08);
  for (const sx of [-1, 1]) {
    const cx = sx * 0.43;
    k.span(w, cx - 0.2, 0.05, -D / 2 + 0.02, cx + 0.2, H - 0.035, fz);
    k.span(w, cx - 0.21, 0, -D / 2 + 0.01, cx + 0.21, 0.05, fz + 0.01);
    let y = 0.07;
    for (const dh of [0.26, 0.2, 0.16]) {
      k.box(w, 0.36, dh - 0.02, 0.02, cx, y + dh / 2, fz + 0.01);
      k.box('brass', 0.075, 0.012, 0.012, cx, y + dh / 2 + 0.01, fz + 0.026);
      k.box('black', 0.008, 0.016, 0.004, cx, y + dh / 2 - 0.025, fz + 0.021);
      y += dh;
    }
  }
  k.box(w, 0.44, 0.065, 0.02, 0, H - 0.07, fz + 0.01);
  k.sphere('brass', 0.01, 0, H - 0.07, fz + 0.022, 1, 1, 1, 6, 4);
  k.span(w, -0.23, 0.3, -D / 2 + 0.02, 0.23, H - 0.035, -D / 2 + 0.04);

  // Clutter on the writing surface.
  const top = H + 0.002;
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    k.plane('paper', 0.21, 0.297, rng.range(-0.05, 0.4), top + 0.0008 + i * 0.0007, rng.range(-0.08, 0.14), FLAT, 0, rng.range(-0.6, 0.6));
  }
  k.stain('decal:bloodSmear', 0.07, 0.05, rng.range(0.1, 0.3), top + 0.008, rng.range(0, 0.1));
  k.push(-0.34, top, 0.04, 0, rng.range(-0.2, 0.2), 0);
  addOpenBook(k, { w: 0.34, d: 0.24 });
  k.pop();
  // Inkwell with a quill.
  const ix = 0.45;
  const iz = -0.2;
  k.lathe('glass', [[0, 0], [0.032, 0], [0.034, 0.03], [0.02, 0.042], [0.012, 0.05], [0, 0.05]], ix, top, iz, 8);
  k.cyl('ink', 0.011, 0.011, 0.004, ix, top + 0.049, iz, 0, 0, 0, 6);
  k.rod('linen', [ix, top + 0.03, iz], [ix - 0.05, top + 0.2, iz + 0.07], 0.0022, 0.0012, 4);
  k.sphere('linen', 0.012, ix - 0.035, top + 0.15, iz + 0.05, 0.7, 5.5, 0.2, 6, 4, 0.39, 0, 0.29);
  k.stain('ink', 0.05, 0.03, ix - 0.08, top + 0.0012, iz + 0.07);
  // Candle stub on a dish.
  k.push(-0.52, top, -0.22);
  k.lathe('brass', [[0, 0], [0.06, 0], [0.062, 0.012], [0.056, 0.012], [0, 0.006]], 0, 0, 0, 10);
  k.push(0, 0.006, 0);
  addCandle(k, { h: 0.05, r: 0.022, lit: false, drips: 3 });
  k.pop();
  k.pop();
  return finish(k, 'desk', {}, true);
}

// Crude plank table set for a rite: skull bowl, knives, candles, open book.
export function ritualTable(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = 1.3;
  const D = 0.64;
  const H = 0.8;
  const pd = D / 3;
  for (let i = 0; i < 3; i++) k.box(i === 1 ? 'woodRotten' : 'woodDark', W, 0.04, pd - 0.006, 0, H - 0.02, -D / 2 + pd * (i + 0.5));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.box('woodDark', 0.06, H - 0.04, 0.06, sx * (W / 2 - 0.08), (H - 0.04) / 2, sz * (D / 2 - 0.07));
    k.box('woodDark', 0.04, 0.05, D - 0.14, sx * (W / 2 - 0.08), 0.16, 0);
  }
  k.box('woodDark', W - 0.16, 0.05, 0.04, 0, 0.16, 0);

  // Red runner hanging over both ends.
  const top = H;
  k.box('clothRed', W + 0.02, 0.004, 0.34, 0, top + 0.002, 0);
  for (const sx of [-1, 1]) k.box('clothRed', 0.004, 0.24, 0.34, sx * (W / 2 + 0.012), top - 0.116, 0);
  const t = top + 0.0045;
  for (let i = 0; i < 5; i++) k.stain('decal:bloodSmear', rng.range(0.05, 0.14), rng.range(0.04, 0.1), rng.range(-0.55, 0.55), t, rng.range(-0.25, 0.25));
  for (let i = 0; i < 3; i++) k.stain('decal:bloodSplat', rng.range(0.03, 0.07), rng.range(0.03, 0.07), rng.range(-0.6, 0.6), t + 0.0004, rng.range(-0.28, 0.28));
  k.dripV('decal:bloodDrip', 0.1, 0.18, rng.range(-0.4, 0.4), top - 0.001, D / 2 + 0.0015);

  // Skull-cap bowl holding blood.
  k.push(0, t, -0.03);
  k.torus('brass', 0.045, 0.008, 0, 0.008, 0, Math.PI / 2, 0, 0, 4, 12);
  k.lathe('bone', [[0, 0.006], [0.04, 0.01], [0.07, 0.035], [0.084, 0.075], [0.079, 0.08], [0.066, 0.042], [0.036, 0.02], [0, 0.017]], 0, 0, 0, 12);
  k.cyl('blood', 0.07, 0.07, 0.002, 0, 0.066, 0, 0, 0, 0, 12);
  addDrip(k, 'blood', 0.082, 0.078, 0.01, 0.05, 0.004, [0.004, 0]);
  k.pop();
  // Knives around the bowl.
  addKnife(k, 0.19, 0.18, t, 0.12, -0.5);
  addKnife(k, 0.15, -0.2, t, 0.14, Math.PI + 0.4, 'bone');
  k.stain('decal:bloodSmear', 0.06, 0.02, 0.28, t + 0.006, 0.06);
  if (rng() < 0.6) addKnife(k, 0.24, 0.42, t, -0.05, 0.2);
  // Open book and a few finger bones.
  k.push(-0.42, t, 0.06, 0, 0.3, 0);
  addOpenBook(k, { w: 0.28, d: 0.2, cover: 'clothRed', lines: 6 });
  k.pop();
  for (let i = 0; i < 4; i++) {
    const bx = rng.range(-0.15, 0.2);
    const bz = rng.range(0.12, 0.24);
    const a = rng() * TAU;
    k.rod('bone', [bx, t + 0.006, bz], [bx + Math.cos(a) * 0.04, t + 0.006, bz + Math.sin(a) * 0.04], 0.005, 0.004, 4);
  }
  // Candles along the back.
  const flames = [];
  const spots = [[-0.5, -0.18], [-0.3, -0.24], [0.28, -0.22], [0.5, -0.16], [0.56, 0.12]];
  for (const [x, z] of spots) {
    k.push(x + rng.range(-0.03, 0.03), t, z + rng.range(-0.03, 0.03));
    const f = addCandle(k, { h: rng.range(0.08, 0.3), r: rng.range(0.022, 0.034), wax: rng() < 0.4 ? 'waxRed' : 'wax', drips: 3 });
    k.stain('wax', 0.05, 0.045, 0, 0.001, 0);
    k.pop();
    if (f) flames.push(f);
  }
  const c = centroid(flames);
  return finish(k, 'ritualTable', { lights: [candleLight([c[0], +(c[1] + 0.04).toFixed(3), c[2]], { intensity: 1.6, distance: 5.5 })] }, true);
}
