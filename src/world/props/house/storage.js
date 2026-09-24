import * as THREE from 'three';
import { Kit, finish, centerFloor, aabb, addCandle, addSkull, addJar, addBookFlat, bookMat } from './kit.js';

// One shelf row of books, stacks and the odd ornament between x0 and x1.
// lever = { x, t } reserves a slot for the secret-switch book.
function fillRow(k, x0, x1, y, clear, zf, lever) {
  const rng = k.rng;
  let x = x0;
  let prevUpright = false;
  while (x < x1 - 0.03) {
    const r = rng();
    let wd;
    let kind;
    if (r < 0.07 && prevUpright) {
      kind = 'lean';
      wd = rng.range(0.07, 0.13);
    } else if (r < 0.14) {
      kind = 'stack';
      wd = rng.range(0.19, 0.27);
    } else if (r < 0.17 && clear > 0.2) {
      kind = 'ornament';
      wd = 0.16;
    } else {
      kind = 'book';
      wd = rng.range(0.03, 0.075);
    }
    if (x + wd > x1) {
      if (kind === 'book') break;
      kind = 'book';
      wd = Math.min(0.05, x1 - x);
      if (wd < 0.025) break;
    }
    if (lever && x < lever.x + lever.t && x + wd > lever.x - 0.002) {
      x = lever.x + lever.t + 0.003;
      prevUpright = true;
      continue;
    }
    const m = bookMat(rng.int(0, 7));
    if (kind === 'lean') {
      // Book leaning left against its neighbour across a gap.
      const t = rng.range(0.025, 0.04);
      const h = Math.min(clear - 0.04, rng.range(0.2, 0.3));
      const d = rng.range(0.16, 0.22);
      const a = Math.asin(Math.min(0.85, Math.max(0.08, (wd - t) / h)));
      const cx = x + (h / 2) * Math.sin(a) + (t / 2) * Math.cos(a);
      const cy = y + (t / 2) * Math.sin(a) + (h / 2) * Math.cos(a);
      k.box(m, t, h, d, cx, cy, zf - d / 2, 0, 0, a);
      prevUpright = false;
    } else if (kind === 'stack') {
      let sy = y;
      const n = rng.int(2, 5);
      for (let i = 0; i < n && sy < y + clear - 0.08; i++) {
        const t = rng.range(0.028, 0.05);
        const bw = wd - rng.range(0.005, 0.035);
        const bd = rng.range(0.15, 0.22);
        k.box(bookMat(rng.int(0, 7)), bw, t, bd, x + wd / 2 + rng.range(-0.008, 0.008), sy + t / 2, zf - bd / 2 - rng.range(0, 0.015), 0, rng.range(-0.06, 0.06), 0);
        sy += t;
      }
      wd += 0.01;
      prevUpright = false;
    } else if (kind === 'ornament') {
      k.push(x + wd / 2, y, zf - 0.11, 0, rng.range(-0.4, 0.4), 0);
      const o = rng();
      if (o < 0.45) addSkull(k, { s: 0.85 });
      else if (o < 0.8) addJar(k, 0.045, rng.range(0.1, 0.15), rng() < 0.5 ? 'murky' : 'jarRed');
      else addCandle(k, { h: rng.range(0.05, 0.12), r: 0.025, lit: false });
      k.pop();
      prevUpright = false;
    } else {
      const t = wd;
      const h = Math.min(clear - 0.025, rng.range(0.2, 0.33));
      const d = rng.range(0.16, 0.24);
      const z = zf - rng.range(0, 0.02);
      k.box(m, t, h, d, x + t / 2, y + h / 2, z - d / 2);
      if (rng() < 0.2) {
        k.box('gilt', t + 0.002, 0.007, 0.004, x + t / 2, y + h * 0.14, z + 0.001);
        k.box('gilt', t + 0.002, 0.007, 0.004, x + t / 2, y + h * 0.86, z + 0.001);
      }
      wd += rng.range(0, 0.003);
      prevUpright = true;
    }
    x += wd;
  }
}

// 2.3 x 1.5 x 0.4 m bookshelf. opts.empty strips it; opts.tilted adds the
// protruding secret-switch book (userData.lever, pivot at its bottom front
// edge: rotation.x > 0 tips the top out) and marks the shelf dynamic.
export function bookshelf(opts = {}) {
  const seed = opts.seed ?? 1;
  const k = new Kit(seed);
  const rng = k.rng;
  const W = 1.5;
  const H = 2.3;
  const D = 0.4;
  const w = 'woodDark';
  const hw = W / 2;
  const zb = -D / 2;
  const zf = D / 2 - 0.03;
  k.span(w, -hw + 0.02, 0, zb, -hw + 0.06, H - 0.06, zf);
  k.span(w, hw - 0.06, 0, zb, hw - 0.02, H - 0.06, zf);
  k.span(w, -hw + 0.06, 0.1, zb, hw - 0.06, H - 0.1, zb + 0.02);
  k.span(w, -hw + 0.01, 0, zb, hw - 0.01, 0.1, zf + 0.012);
  k.span(w, -hw + 0.02, H - 0.1, zb, hw - 0.02, H - 0.06, zf);
  k.span(w, -hw, H - 0.06, zb, hw, H, D / 2);
  for (const sx of [-1, 1]) k.span(w, sx > 0 ? hw - 0.075 : -hw + 0.02, 0.1, zf, sx > 0 ? hw - 0.02 : -hw + 0.075, H - 0.06, zf + 0.012);
  const tops = [0.1, 0.52, 0.94, 1.36, 1.78];
  for (const y of tops.slice(1)) {
    k.span(w, -hw + 0.06, y - 0.03, zb + 0.02, hw - 0.06, y, zf);
    k.span(w, -hw + 0.06, y - 0.045, zf - 0.005, hw - 0.06, y, zf + 0.008);
  }
  const lever = opts.tilted ? { row: 3, x: 0.2, t: 0.056, h: 0.3, d: 0.22 } : null;
  if (!opts.empty) {
    tops.forEach((y, i) => {
      const ceil = i < tops.length - 1 ? tops[i + 1] - 0.045 : H - 0.1;
      fillRow(k, -hw + 0.065, hw - 0.065, y, ceil - y, zf - 0.006, lever && lever.row === i ? lever : null);
    });
  } else {
    // Cleared out: dust rings and a few fallen books.
    for (const y of tops) k.stain('decal:grime', 0.5, 0.12, rng.range(-0.25, 0.25), y + 0.001, -0.02, 0.3);
    const n = rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      addBookFlat(k, rng.range(0.14, 0.2), rng.range(0.025, 0.05), rng.range(0.18, 0.24), bookMat(rng.int(0, 7)), rng.range(-0.5, 0.5), rng.pick(tops), rng.range(-0.06, 0.02), rng.range(-0.7, 0.7));
    }
  }
  const g = finish(k, 'bookshelf');
  if (lever) {
    const lk = new Kit(seed + 101);
    lk.box(bookMat(0), lever.t, lever.h, lever.d, 0, lever.h / 2, -lever.d / 2);
    for (const f of [0.12, 0.88]) lk.box('gilt', lever.t + 0.002, 0.008, 0.004, 0, lever.h * f, 0.001);
    lk.box('gilt', lever.t - 0.012, 0.05, 0.003, 0, lever.h * 0.55, 0.001);
    const book = lk.build('bookshelf:lever');
    book.position.set(lever.x + lever.t / 2, tops[lever.row], zf + 0.02);
    book.rotation.x = 0.2;
    g.add(book);
    g.userData.lever = book;
    g.userData.dynamic = true;
  }
  return centerFloor(g);
}

// Drawer front; pull > 0 slides it out showing its box and a dark opening.
function drawer(k, x0, x1, y0, y1, fz, pull, knobs = true) {
  const w = 'woodDark';
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const dw = x1 - x0;
  const dh = y1 - y0;
  k.box(w, dw, dh, 0.02, cx, cy, fz + 0.01 + pull);
  if (knobs) {
    const kx = dw > 0.6 ? [-dw * 0.28, dw * 0.28] : [0];
    for (const dx of kx) k.sphere('brass', 0.013, cx + dx, cy, fz + 0.024 + pull, 1, 1, 0.8, 6, 4);
  }
  if (pull > 0) {
    k.box('black', dw - 0.01, dh - 0.01, 0.002, cx, cy, fz + 0.001);
    for (const sx of [-1, 1]) k.box(w, 0.012, dh - 0.03, pull + 0.02, cx + sx * (dw / 2 - 0.02), cy - 0.01, fz + pull / 2 - 0.01);
    k.box(w, dw - 0.04, 0.01, pull + 0.02, cx, y0 + 0.012, fz + pull / 2 - 0.01);
  }
}

// Chest of drawers with one drawer pulled out and a few things on top.
export function dresser(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = 1.2;
  const D = 0.5;
  const H = 0.92;
  const w = 'woodDark';
  const fz = D / 2 - 0.03;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(w, 0.1, 0.09, 0.1, sx * (W / 2 - 0.07), 0.045, sz * (D / 2 - 0.07));
  k.span(w, -W / 2 + 0.02, 0.09, -D / 2 + 0.01, W / 2 - 0.02, 0.13, fz + 0.012);
  k.span(w, -W / 2 + 0.03, 0.13, -D / 2 + 0.02, W / 2 - 0.03, H - 0.035, fz);
  k.box(w, W, 0.035, D, 0, H - 0.0175, 0);
  const open = rng.int(0, 4);
  let i = 0;
  const rows = [[0.15, 0.37], [0.39, 0.61], [0.63, 0.86]];
  rows.forEach(([y0, y1], r) => {
    const cols = r === 2 ? [[-0.55, -0.005], [0.005, 0.55]] : [[-0.55, 0.55]];
    for (const [x0, x1] of cols) {
      const pull = i === open ? rng.range(0.12, 0.2) : 0;
      drawer(k, x0, x1, y0, y1, fz, pull);
      if (pull) {
        // Cloth spilling over the drawer lip.
        k.sphere(rng() < 0.5 ? 'linen' : 'clothRed', 0.1, (x0 + x1) / 2 + rng.range(-0.15, 0.15), y1 - 0.02, fz + pull * 0.5, 1.6, 0.35, 0.9, 7, 5);
        k.box('linen', 0.12, 0.16, 0.006, (x0 + x1) / 2 + rng.range(-0.2, 0.2), y1 - 0.1, fz + pull + 0.024, 0.08, 0, rng.range(-0.2, 0.2));
      }
      i++;
    }
  });
  // On top: doily, photo frame, candle stub.
  const top = H;
  k.cyl('paper', 0.13, 0.13, 0.002, -0.25, top + 0.001, 0, 0, 0, 0, 14);
  k.push(-0.25, top, -0.08, 0, rng.range(-0.3, 0.3), 0);
  k.box('gilt', 0.16, 0.2, 0.015, 0, 0.098, 0, -0.18, 0, 0);
  k.box('black', 0.12, 0.155, 0.004, 0, 0.1, 0.009, -0.18, 0, 0);
  k.box('woodDark', 0.03, 0.12, 0.012, 0, 0.055, -0.05, 0.4, 0, 0);
  k.pop();
  k.push(0.32, top, 0.02);
  k.lathe('brass', [[0, 0], [0.06, 0], [0.062, 0.012], [0.056, 0.012], [0, 0.006]], 0, 0, 0, 10);
  k.push(0, 0.006, 0);
  addCandle(k, { h: rng.range(0.04, 0.12), r: 0.024, lit: false, drips: 4 });
  k.pop();
  k.pop();
  k.stain('decal:grime', 0.3, 0.12, 0.1, top + 0.0005, 0.05, 0.4);
  return finish(k, 'dresser', {}, true);
}

// Bedside table: drawer, open shelf, a book or candle stub.
export function nightstand(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = 0.46;
  const D = 0.4;
  const H = 0.64;
  const w = 'woodDark';
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.box(w, 0.035, H - 0.025, 0.035, sx * (W / 2 - 0.03), (H - 0.025) / 2, sz * (D / 2 - 0.03));
  }
  k.box(w, W + 0.02, 0.025, D + 0.02, 0, H - 0.0125, 0);
  k.span(w, -W / 2 + 0.02, 0.45, -D / 2 + 0.02, W / 2 - 0.02, H - 0.025, D / 2 - 0.03);
  drawer(k, -W / 2 + 0.05, W / 2 - 0.05, 0.47, H - 0.04, D / 2 - 0.03, 0);
  k.box(w, W - 0.03, 0.02, D - 0.03, 0, 0.12, 0);
  if (rng() < 0.6) addBookFlat(k, 0.15, 0.04, 0.21, bookMat(rng.int(0, 7)), 0, 0.13, 0, rng.range(-0.3, 0.3));
  if (rng() < 0.5) {
    k.push(0.1, H, 0.05);
    k.lathe('brass', [[0, 0], [0.055, 0], [0.057, 0.011], [0.051, 0.011], [0, 0.006]], 0, 0, 0, 10);
    k.push(0, 0.006, 0);
    addCandle(k, { h: rng.range(0.04, 0.1), r: 0.022, lit: false, drips: 3 });
    k.pop();
    k.pop();
  } else {
    addBookFlat(k, 0.14, 0.045, 0.2, 'leather', -0.04, H, 0.02, rng.range(-0.4, 0.4));
  }
  k.stain('decal:grime', 0.12, 0.08, rng.range(-0.1, 0.1), H + 0.0005, rng.range(-0.08, 0.08));
  return finish(k, 'nightstand', {}, true);
}

// Tall two-door wardrobe. opts.ajar opens the right door onto dark clothes.
export function wardrobe(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = 1.2;
  const D = 0.6;
  const w = 'woodDark';
  const fz = D / 2 - 0.07;
  const bz = -D / 2;
  const hw = W / 2;
  k.span(w, -hw + 0.02, 0, bz + 0.02, hw - 0.02, 0.1, fz + 0.03);
  k.span(w, -hw + 0.03, 0.1, bz, -hw + 0.06, 2.0, fz);
  k.span(w, hw - 0.06, 0.1, bz, hw - 0.03, 2.0, fz);
  k.span(w, -hw + 0.06, 0.1, bz, hw - 0.06, 2.0, bz + 0.02);
  k.span('black', -hw + 0.06, 0.14, bz + 0.02, hw - 0.06, 1.96, bz + 0.022);
  k.span(w, -hw + 0.06, 0.1, bz + 0.02, hw - 0.06, 0.14, fz);
  k.span(w, -hw + 0.06, 1.96, bz + 0.02, hw - 0.06, 2.0, fz);
  k.span(w, -hw + 0.03, 0.1, fz, -hw + 0.08, 2.0, fz + 0.02);
  k.span(w, hw - 0.08, 0.1, fz, hw - 0.03, 2.0, fz + 0.02);
  k.span(w, -hw + 0.03, 0.1, fz, hw - 0.03, 0.16, fz + 0.02);
  k.span(w, -hw + 0.03, 1.94, fz, hw - 0.03, 2.0, fz + 0.02);
  k.span(w, -hw, 2.0, bz, hw, 2.07, D / 2);
  k.span(w, -hw + 0.025, 2.07, bz, hw - 0.025, 2.1, D / 2 - 0.02);
  k.span(w, -hw, 2.1, bz, hw, 2.15, D / 2);
  const ajar = opts.ajar ? rng.range(0.35, 0.6) : 0;
  const dw = 0.518;
  const dh = 1.78;
  for (const sx of [-1, 1]) {
    const dir = -sx;
    k.push(sx * 0.52, 0.16, fz + 0.02, 0, sx > 0 ? ajar : 0, 0);
    k.box(w, dw, dh, 0.025, (dir * dw) / 2, dh / 2, 0.0125);
    k.box(w, dw - 0.12, 0.95, 0.012, (dir * dw) / 2, 1.18, 0.031);
    k.box(w, dw - 0.12, 0.55, 0.012, (dir * dw) / 2, 0.4, 0.031);
    k.sphere('brass', 0.014, dir * (dw - 0.05), 0.95, 0.04, 1, 1, 1, 6, 4);
    k.box('black', 0.008, 0.02, 0.004, dir * (dw - 0.05), 0.89, 0.026);
    k.pop();
  }
  if (ajar) {
    // Rail and a couple of hanging garments inside.
    k.rod('brass', [-hw + 0.06, 1.82, -0.03], [hw - 0.06, 1.82, -0.03], 0.01, 0.01, 6);
    for (const x of [0.12, 0.34]) {
      k.lathe('cloth', [[0, -1.05], [0.19, -1.05], [0.17, -0.4], [0.15, -0.06], [0.03, 0]], x, 1.8, -0.03, 10, 0, Math.PI / 2 + rng.range(-0.2, 0.2), 0, 1, 1, 0.35);
    }
  }
  return finish(k, 'wardrobe', {}, true);
}

// Rough storage shelving with jars, cans, bottles and boxes.
export function shelf(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = 1.2;
  const D = 0.4;
  const H = 1.85;
  const w = 'wood';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(w, 0.045, H, 0.045, sx * (W / 2 - 0.0225), H / 2, sz * (D / 2 - 0.0225));
  const levels = [0.1, 0.52, 0.94, 1.36, 1.8];
  for (const y of levels) k.box(w, W, 0.025, D, 0, y, 0);
  const bl = Math.hypot(W - 0.06, 0.84);
  const ba = Math.atan2(0.84, W - 0.06);
  k.box(w, bl, 0.06, 0.012, 0, 0.73, -D / 2 - 0.006, 0, 0, ba);
  k.box(w, bl, 0.06, 0.012, 0, 0.73, -D / 2 - 0.006, 0, 0, -ba);
  levels.forEach((y, i) => {
    const top = y + 0.0125;
    const maxH = i === levels.length - 1 ? 0.04 : 0.3;
    let x = -W / 2 + 0.07;
    const x1 = W / 2 - 0.05;
    while (x < x1 - 0.06) {
      const r = rng();
      if (r < 0.18) {
        x += rng.range(0.06, 0.2);
      } else if (r < 0.52 && maxH > 0.1 && x + 0.12 < x1) {
        const jr = rng.range(0.035, 0.06);
        addJar(k, jr, rng.range(0.1, 0.2), rng.pick(['murky', 'jarRed', 'glass']), x + jr, top, rng.range(-0.08, 0.08));
        x += jr * 2 + 0.02;
      } else if (r < 0.75 && x + 0.15 < x1) {
        const bw = Math.min(x1 - x, rng.range(0.15, 0.3));
        const bh = Math.min(maxH + 0.1, rng.range(0.1, 0.25));
        k.box('card', bw, bh, rng.range(0.2, 0.3), x + bw / 2, top + bh / 2, rng.range(-0.04, 0.04), 0, rng.range(-0.1, 0.1), 0);
        x += bw + 0.02;
      } else if (r < 0.9 && maxH > 0.1 && x + 0.1 < x1) {
        const n = Math.min(rng.int(1, 3), Math.floor((x1 - x) / 0.081));
        for (let j = 0; j < n; j++) k.cyl('rust', 0.038, 0.038, 0.11, x + 0.038 + j * 0.081, top + 0.055, rng.range(-0.08, 0.1), 0, 0, 0, 8);
        x += n * 0.081 + 0.02;
      } else if (maxH > 0.1 && x + 0.07 < x1) {
        k.lathe('glass', [[0, 0], [0.03, 0], [0.03, 0.16], [0.012, 0.2], [0.011, 0.25], [0, 0.25]], x + 0.03, top, rng.range(-0.05, 0.08), 8);
        x += 0.08;
      } else {
        x += 0.1;
      }
    }
    k.stain('decal:grime', 0.4, 0.13, rng.range(-0.3, 0.3), top + 0.0005, 0, 0.3);
  });
  return finish(k, 'shelf', {}, true);
}

// Nailed plank crate. opts.size sets the width.
export function crate(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const s = opts.size ?? rng.range(0.55, 0.7);
  const h = s * rng.range(0.8, 1.0);
  const m = rng() < 0.3 ? 'woodRotten' : 'wood';
  const t = 0.02;
  const hs = s / 2;
  const n = 3;
  const ph = (h - 0.02) / n;
  for (let i = 0; i < n; i++) {
    const y = 0.01 + ph * (i + 0.5);
    const pm = rng() < 0.15 ? 'woodRotten' : m;
    k.box(pm, s, ph - 0.008, t, 0, y, hs - t / 2);
    k.box(pm, s, ph - 0.008, t, 0, y, -hs + t / 2);
    k.box(pm, t, ph - 0.008, s - 2 * t, hs - t / 2, y, 0);
    k.box(pm, t, ph - 0.008, s - 2 * t, -hs + t / 2, y, 0);
  }
  k.box('black', s - 2 * t, 0.004, s - 2 * t, 0, h - 0.03, 0);
  k.box(m, s - 2 * t, 0.015, s - 2 * t, 0, 0.0075, 0);
  const missing = rng() < 0.35 ? rng.int(0, 3) : -1;
  for (let i = 0; i < 4; i++) {
    if (i === missing) continue;
    const pw = s / 4;
    k.box(m, s, 0.02, pw - 0.008, rng.range(-0.004, 0.004), h + 0.01, -hs + pw * (i + 0.5));
  }
  const bl = Math.hypot(s - 0.12, h - 0.12);
  const ba = Math.atan2(h - 0.12, s - 0.12);
  for (const sz of [-1, 1]) {
    const z = sz * (hs + 0.01);
    k.box(m, 0.06, h, 0.02, -hs + 0.03, h / 2, z);
    k.box(m, 0.06, h, 0.02, hs - 0.03, h / 2, z);
    k.box(m, s - 0.12, 0.06, 0.02, 0, 0.03, z);
    k.box(m, s - 0.12, 0.06, 0.02, 0, h - 0.03, z);
    k.box(m, bl, 0.05, 0.018, 0, h / 2, z, 0, 0, sz * ba);
  }
  return finish(k, 'crate', {}, true);
}

// Domed travel trunk with iron bands, lock and side handles.
export function trunk(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = 0.9;
  const D = 0.5;
  const BH = 0.4;
  const body = rng() < 0.5 ? 'leather' : 'woodDark';
  const band = 'rust';
  const R = D / 2;
  const y0 = 0.02;
  k.box(body, W, BH, D, 0, y0 + BH / 2, 0);
  for (const sz of [-1, 1]) k.box('woodDark', W - 0.04, 0.02, 0.05, 0, 0.01, sz * (D / 2 - 0.04));
  k.geo(body, new THREE.CylinderGeometry(R, R, W, 14, 1, false, 0, Math.PI), 0, y0 + BH, 0, 0, 0, Math.PI / 2, 0.5, 1, 1);
  for (const x of [-0.28, 0.28]) {
    for (const sz of [-1, 1]) k.box(band, 0.045, BH, 0.006, x, y0 + BH / 2, sz * (D / 2 + 0.003));
    k.geo(band, new THREE.CylinderGeometry(R + 0.005, R + 0.005, 0.045, 14, 1, true, 0, Math.PI), x, y0 + BH, 0, 0, 0, Math.PI / 2, 0.5 + 0.005 / R, 1, 1);
  }
  for (const sz of [-1, 1]) k.box(band, W + 0.01, 0.03, 0.008, 0, y0 + BH - 0.015, sz * (D / 2 + 0.004));
  for (const sx of [-1, 1]) {
    k.box(band, 0.008, 0.03, D + 0.01, sx * (W / 2 + 0.004), y0 + BH - 0.015, 0);
    for (const sz of [-1, 1]) {
      k.box('brass', 0.05, 0.05, 0.05, sx * (W / 2 - 0.02), y0 + 0.025, sz * (D / 2 - 0.02));
      k.box('brass', 0.05, 0.05, 0.05, sx * (W / 2 - 0.02), y0 + BH - 0.025, sz * (D / 2 - 0.02));
    }
    k.box('leather', 0.015, 0.03, 0.14, sx * (W / 2 + 0.012), y0 + BH - 0.1, 0);
    k.box('brass', 0.012, 0.04, 0.03, sx * (W / 2 + 0.006), y0 + BH - 0.1, -0.075);
    k.box('brass', 0.012, 0.04, 0.03, sx * (W / 2 + 0.006), y0 + BH - 0.1, 0.075);
  }
  k.box('brass', 0.075, 0.09, 0.012, 0, y0 + BH - 0.05, D / 2 + 0.006);
  k.box('black', 0.01, 0.022, 0.004, 0, y0 + BH - 0.06, D / 2 + 0.013);
  k.box('brass', 0.04, 0.07, 0.01, 0, y0 + BH + 0.02, D / 2 - 0.004, -0.5, 0, 0);
  k.stainV('decal:grime', 0.2, 0.08, rng.range(-0.2, 0.2), 0.1, D / 2 + 0.001, 0, 0.4);
  return finish(k, 'trunk', {}, true);
}

// Stacked cardboard boxes (one collider box per carton).
export function boxes(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const colliders = [];
  const carton = (w, h, d, x, y, z, ry, open) => {
    k.push(x, y, z, 0, ry, 0);
    if (!open) {
      k.box('card', w, h, d, 0, h / 2, 0);
      k.box('tape', 0.05, 0.003, d + 0.004, 0, h + 0.0005, 0);
      k.box('tape', 0.05, 0.08, 0.003, 0, h - 0.04, d / 2 + 0.0005);
    } else {
      const t = 0.006;
      k.box('card', w, 0.01, d, 0, 0.005, 0);
      k.box('card', w, h, t, 0, h / 2, d / 2 - t / 2);
      k.box('card', w, h, t, 0, h / 2, -d / 2 + t / 2);
      k.box('card', t, h, d - 2 * t, w / 2 - t / 2, h / 2, 0);
      k.box('card', t, h, d - 2 * t, -w / 2 + t / 2, h / 2, 0);
      k.box('black', w - 2 * t, 0.004, d - 2 * t, 0, h * 0.55, 0);
      const fl = [[0, d / 2, 1, 0], [0, -d / 2, -1, 0], [w / 2, 0, 0, -1], [-w / 2, 0, 0, 1]];
      for (const [fx, fz, ax, az] of fl) {
        const len = (ax ? d : w) / 2 - 0.01;
        const a = rng.range(0.25, 0.8);
        k.push(fx, h, fz, ax * a, 0, az * a);
        k.box('card', ax ? w - 0.01 : 0.004, len, ax ? 0.004 : d - 0.01, 0, len / 2, 0);
        k.pop();
      }
    }
    k.pop();
    const c = Math.abs(Math.cos(ry));
    const s = Math.abs(Math.sin(ry));
    const ex = (w * c + d * s) / 2;
    const ez = (w * s + d * c) / 2;
    colliders.push(aabb([x - ex, y, z - ez], [x + ex, y + h, z + ez]));
  };
  const base = [];
  let x = 0;
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.4, 0.58);
    base.push({ w, h: rng.range(0.32, 0.45), d: rng.range(0.36, 0.5), x: x + w / 2, z: rng.range(-0.06, 0.06), ry: rng.range(-0.08, 0.08) });
    x += w + rng.range(0.005, 0.03);
  }
  const off = -x / 2;
  for (const b of base) {
    b.x += off;
    carton(b.w, b.h, b.d, b.x, 0, b.z, b.ry, false);
  }
  const nt = rng.int(1, n - 1);
  for (let i = 0; i < nt; i++) {
    const b = base[i + (rng() < 0.5 ? 0 : n - 1 - nt)];
    const w = Math.min(b.w - 0.04, rng.range(0.3, 0.5));
    const d = Math.min(b.d - 0.02, rng.range(0.28, 0.42));
    const h = rng.range(0.22, 0.36);
    carton(w, h, d, b.x + rng.range(-0.04, 0.04), b.h, b.z + rng.range(-0.04, 0.04), rng.range(-0.3, 0.3), i === nt - 1 && rng() < 0.6);
  }
  return finish(k, 'boxes', { collider: colliders }, true);
}

