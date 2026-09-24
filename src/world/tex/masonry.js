import { TAU, makeRng, rgb, smoothstep, fbm, grain, worley, hash01, branchPaths, strokePaths, maskCtx, readBytes, softBlurBytes, stampSegment, Surf, surfTextures } from './core.js';

// Brick, stone, concrete, metals and glass for the basement and cisterns.

// Old red-brown brick in running bond: 20 courses x 6 bricks per 1.5 m tile.
export function genBrick(seed) {
  const w = 512;
  const h = 512;
  const s = new Surf(w, h);
  const courses = 20;
  const per = 6;
  const ch = h / courses;
  const bw = w / per;
  const mh = 1.7; // mortar half-width in px
  const edgeN = fbm(w, h, { fx: 32, octaves: 3, seed: seed + 1 });
  const surf = fbm(w, h, { fx: 16, octaves: 4, seed: seed + 2 });
  const low = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 3 });
  const effl = fbm(w, h, { fx: 4, octaves: 5, seed: seed + 4 });
  const damp = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 5 });
  const mortN = fbm(w, h, { fx: 48, octaves: 2, seed: seed + 6 });
  const px = grain(w, h, seed + 7);
  const palette = ['#4a2e24', '#3e2620', '#55322a', '#4a342c', '#2e1e1a', '#5a3a2c', '#463028'].map(rgb);
  const mortar = rgb('#4d4840');
  const salt = rgb('#8e8a80');
  for (let y = 0; y < h; y++) {
    const course = (y / ch) | 0;
    const ly = y - course * ch + 0.5;
    const off = (course & 1) * bw * 0.5;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let bx = x + 0.5 + off;
      if (bx >= w) bx -= w;
      const bi = (bx / bw) | 0;
      const lx = bx - bi * bw;
      const id = course * per + (bi % per);
      const hv = hash01(id, seed);
      const col = palette[(hash01(id, seed + 1) * palette.length) | 0];
      const e = Math.min(lx, bw - lx, ly, ch - ly) - mh + (edgeN[i] - 0.5) * 3.2;
      const bm = smoothstep(-0.6, 0.6, e);
      const pillow = smoothstep(0, 5, e);
      // Brick face: per-brick tone, a darker burnt end on some, mottling
      const burnt = hv > 0.75 ? smoothstep(0.4, 1, (hv > 0.87 ? lx : bw - lx) / bw) * 0.35 : 0;
      const pit = px[i] > 0.985 ? 0.6 : 0;
      let v = (0.8 + hv * 0.35) * (0.84 + surf[i] * 0.3) * (0.9 + low[i] * 0.2) * (1 - burnt) * (1 - pit * 0.5);
      let r = col[0] * v;
      let g = col[1] * v;
      let b = col[2] * v;
      const mv = 0.75 + mortN[i] * 0.45;
      r += (mortar[0] * mv - r) * (1 - bm);
      g += (mortar[1] * mv - g) * (1 - bm);
      b += (mortar[2] * mv - b) * (1 - bm);
      // Efflorescence: white salt crust, heaviest on the mortar and brick edges
      const ef = smoothstep(0.68, 0.9, effl[i] + (1 - bm) * 0.1 + (1 - pillow) * 0.05) * (0.25 + 0.75 * px[i] * mortN[i]);
      r += (salt[0] - r) * ef * 0.6;
      g += (salt[1] - g) * ef * 0.6;
      b += (salt[2] - b) * ef * 0.6;
      // Damp patches: darker and glossier
      const dp = smoothstep(0.55, 0.8, damp[i]) * (1 - ef);
      const dk = 1 - dp * 0.35;
      s.set(i, r * dk, g * dk, b * dk);
      s.hgt[i] = bm * (0.55 + pillow * 0.45 + surf[i] * 0.22 - pit * 0.3) + (1 - bm) * (0.12 + mortN[i] * 0.18) + ef * 0.05;
      s.rgh[i] = 0.88 + (1 - bm) * 0.06 - dp * 0.35 + ef * 0.05 + (surf[i] - 0.5) * 0.06;
    }
  }
  return surfTextures(s, { normal: 3.2 });
}

// Irregular block courses for stone walls. Per pixel: edge distance in px
// (negative inside joints) and block id.
function blockLayout(w, h, rng, seed, { rows = 4, minW = 90, maxW = 210, joint = 2.6, wobble = 5 } = {}) {
  const heights = [];
  let tot = 0;
  for (let r = 0; r < rows; r++) {
    const v = 0.7 + rng() * 0.6;
    heights.push(v);
    tot += v;
  }
  const rowY = [0];
  for (let r = 0; r < rows; r++) rowY.push(rowY[r] + (heights[r] / tot) * h);
  const rowX = [];
  for (let r = 0; r < rows; r++) {
    const xs = [];
    let x = rng() * maxW;
    const x0 = x;
    while (x < x0 + w - minW * 0.8) {
      xs.push(x % w);
      x += minW + rng() * (maxW - minW);
    }
    rowX.push(xs.sort((a, b) => a - b));
  }
  const nx = fbm(w, h, { fx: 6, octaves: 3, seed: seed + 50 });
  const ny = fbm(w, h, { fx: 6, octaves: 3, seed: seed + 51 });
  const edge = new Float32Array(w * h);
  const id = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let py = y + 0.5 + (ny[i] - 0.5) * wobble;
      py = ((py % h) + h) % h;
      let r = 0;
      while (r < rows - 1 && py >= rowY[r + 1]) r++;
      const dy = Math.min(py - rowY[r], rowY[r + 1] - py);
      let pxx = x + 0.5 + (nx[i] - 0.5) * wobble;
      pxx = ((pxx % w) + w) % w;
      const xs = rowX[r];
      let k = 0;
      while (k < xs.length && xs[k] <= pxx) k++;
      const left = k === 0 ? xs[xs.length - 1] - w : xs[k - 1];
      const right = k === xs.length ? xs[0] + w : xs[k];
      const dx = Math.min(pxx - left, right - pxx);
      edge[i] = Math.min(dx, dy) - joint;
      id[i] = r * 64 + (k === 0 ? xs.length : k);
    }
  }
  return { edge, id };
}

function stoneSurf(seed, wet) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const { edge, id } = blockLayout(w, h, rng, seed);
  const rough1 = fbm(w, h, { fx: 8, octaves: 5, seed: seed + 1 });
  const facet = fbm(w, h, { fx: 6, octaves: 4, kind: 'ridge', seed: seed + 2 });
  const low = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 3 });
  const mortN = fbm(w, h, { fx: 32, octaves: 3, seed: seed + 4 });
  const algae = fbm(w, h, { fx: 4, octaves: 5, seed: seed + 5 });
  const streak = fbm(w, h, { fx: 48, fy: 3, octaves: 3, seed: seed + 6 });
  const px = grain(w, h, seed + 7);
  const stone = wet ? rgb('#303634') : rgb('#4f4b45');
  const warmS = wet ? rgb('#2e302a') : rgb('#57503f');
  const mortar = wet ? rgb('#2a302c') : rgb('#5d574c');
  const teal = rgb('#1e4a4f');
  const slime = rgb('#16302c');
  for (let i = 0; i < w * h; i++) {
    const e = edge[i];
    const hv = hash01(id[i], seed);
    const bm = smoothstep(-0.8, 0.8, e);
    const pillow = smoothstep(0, 14, e);
    const tone = 0.78 + hv * 0.35;
    const warm = hash01(id[i], seed + 1) * 0.6;
    const v = tone * (0.8 + rough1[i] * 0.3) * (0.9 + low[i] * 0.2) * (0.96 + px[i] * 0.08) * (0.92 + facet[i] * 0.12);
    let r = (stone[0] + (warmS[0] - stone[0]) * warm) * v;
    let g = (stone[1] + (warmS[1] - stone[1]) * warm) * v;
    let b = (stone[2] + (warmS[2] - stone[2]) * warm) * v;
    const mv = 0.7 + mortN[i] * 0.5;
    r += (mortar[0] * mv - r) * (1 - bm);
    g += (mortar[1] * mv - g) * (1 - bm);
    b += (mortar[2] * mv - b) * (1 - bm);
    let rough = 0.86 + (rough1[i] - 0.5) * 0.1 + (1 - bm) * 0.06;
    let hh = bm * (0.5 + pillow * 0.6 + rough1[i] * 0.35 + facet[i] * 0.25) + (1 - bm) * (0.1 + mortN[i] * 0.2);
    if (wet) {
      // Teal algae in the joints and in patches, slime running down
      const jn = 1 - smoothstep(-1, 6, e);
      const al = Math.min(1, smoothstep(0.5, 0.75, algae[i]) * 0.8 + jn * smoothstep(0.3, 0.6, algae[i]));
      const sl = smoothstep(0.6, 0.85, streak[i]) * smoothstep(0.35, 0.6, algae[i]) * 0.6;
      const av = 0.6 + mortN[i] * 0.6;
      r += (teal[0] * av - r) * al * 0.8;
      g += (teal[1] * av - g) * al * 0.8;
      b += (teal[2] * av - b) * al * 0.8;
      r += (slime[0] - r) * sl;
      g += (slime[1] - g) * sl;
      b += (slime[2] - b) * sl;
      rough = 0.22 + (rough1[i] - 0.5) * 0.12 + al * 0.18 + (1 - bm) * 0.1 - sl * 0.08;
      hh += al * 0.12;
    }
    s.set(i, r, g, b);
    s.hgt[i] = hh;
    s.rgh[i] = rough;
  }
  return surfTextures(s, { normal: 3.4 });
}

export const genStone = (seed) => stoneSurf(seed, false);
export const genStoneWet = (seed) => stoneSurf(seed, true);

// Board-formed concrete (3 m tile): stains, cracks, rust streaks and water lines.
export function genConcrete(seed) {
  const w = 1024;
  const h = 1024;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const ppm = w / 3;
  const roots = [];
  for (let k = 0; k < 4; k++) roots.push({ x: rng() * w, y: rng() * h, angle: rng() * TAU, width: 1.6 + rng() * 1.2, length: 300 + rng() * 400 });
  const paths = branchPaths(rng, roots, { w, h, step: 4, wiggle: 0.5, branch: 0.035, spread: [0.5, 1.1], taper: 0.995, minWidth: 0.5, maxDepth: 3 });
  const cctx = maskCtx(w, h);
  strokePaths(cctx, paths, '#f00');
  const crack = readBytes(cctx);
  // Soft stain along the cracks
  const crackSoft = softBlurBytes(crack, 0, w, h, 10);

  // Rust streaks running down from a few bolts / rebar ends
  const rust = new Float32Array(w * h);
  for (let k = 0; k < 4; k++) {
    const x0 = rng() * w;
    const y0 = rng() * h;
    const len = (0.3 + rng() * 0.8) * ppm;
    let x = x0;
    for (let y = y0; y < y0 + len; y += 2) {
      const t = (y - y0) / len;
      x += (rng() - 0.5) * 0.8;
      stampSegment(rust, w, h, x, y, x, y + 2, (3 + rng() * 5) * (1 - t * 0.6), (1 - t) * (0.6 + rng() * 0.4));
    }
  }
  // Water lines (m above the floor)
  const lines = [0.35 + rng() * 0.2, 0.9 + rng() * 0.3, 1.45 + rng() * 0.2].map((m) => h - m * ppm);
  const low = fbm(w, h, { fx: 3, octaves: 5, seed: seed + 1 });
  const mid = fbm(w, h, { fx: 12, octaves: 3, seed: seed + 2 });
  const lineN = fbm(w, h, { fx: 16, fy: 2, octaves: 3, seed: seed + 3 });
  const streak = fbm(w, h, { fx: 48, fy: 4, octaves: 2, seed: seed + 4 });
  const cells = worley(512, 512, { cx: 48, seed: seed + 5 });
  const px = grain(w, h, seed + 6);
  const base = rgb('#4f4d48');
  const deposit = rgb('#77705f');
  const waterDark = rgb('#3a3c36');
  const rustC = rgb('#5a3218');
  const board = 16;
  const bh = h / board;
  const lineMin = Math.min(...lines) - 12;
  const lineMax = Math.max(...lines) + 70;
  for (let y = 0; y < h; y++) {
    const nearLine = y > lineMin && y < lineMax;
    const bi = (y / bh) | 0;
    const ly = y - bi * bh + 0.5;
    const seam = 1 - smoothstep(0.5, 2.5, Math.min(ly, bh - ly));
    const btone = 0.95 + hash01(bi, seed) * 0.1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const j = ((y & 511) << 9) | (x & 511);
      // Tide lines: thin deposit with a stain just below each line
      let tl = 0;
      let below = 0;
      const wob = (lineN[i] - 0.5) * 14;
      for (let k = 0; nearLine && k < 3; k++) {
        const d = y - lines[k] + wob;
        if (d > -4 && d < 3) tl = Math.max(tl, 1 - Math.abs(d + 0.5) / 3.5);
        if (d >= 0 && d < 60) below = Math.max(below, (1 - d / 60) * 0.8);
      }
      const mix0 = lines[0] - wob > y && lines[2] - wob < y ? 0.12 : 0;
      const pit = cells.f1[j] < 0.22 && hash01(cells.id[j], seed) < 0.18 ? 1 - cells.f1[j] / 0.22 : 0;
      const agg = px[i] > 0.975 ? 0.25 : px[i] < 0.02 ? -0.25 : 0;
      let v = btone * (0.8 + low[i] * 0.3) * (0.93 + mid[i] * 0.14) * (1 + agg * 0.4) * (1 - seam * 0.2) * (1 - pit * 0.55);
      let r = base[0] * v;
      let g = base[1] * v;
      let b = base[2] * v;
      const wd = Math.min(1, below * 0.6 + mix0 + smoothstep(0.7, 0.9, streak[i]) * 0.15);
      r += (waterDark[0] * v - r) * wd;
      g += (waterDark[1] * v - g) * wd;
      b += (waterDark[2] * v - b) * wd;
      r += (deposit[0] - r) * tl * 0.7;
      g += (deposit[1] - g) * tl * 0.7;
      b += (deposit[2] - b) * tl * 0.7;
      const rs = rust[i] * (0.6 + streak[i] * 0.6);
      r += (rustC[0] - r) * rs;
      g += (rustC[1] - g) * rs;
      b += (rustC[2] - b) * rs;
      const ck = crack[i * 4] / 255;
      const cs = Math.min(1, crackSoft[i] * 4);
      const dk = (1 - ck * 0.75) * (1 - cs * 0.25);
      s.set(i, r * dk, g * dk, b * dk);
      s.hgt[i] = low[i] * 1.2 + mid[i] * 0.3 + px[i] * 0.04 - seam * 0.25 - pit * 0.6 - ck * 0.7 + tl * 0.05;
      s.rgh[i] = 0.88 + (mid[i] - 0.5) * 0.08 - wd * 0.12 + rs * 0.04 + ck * 0.08;
    }
  }
  return surfTextures(s, { normal: 2.4 });
}

// Dark scratched iron. Roughness in G, metalness in B.
export function genMetal(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  s.met = new Float32Array(w * h);
  const scratch = new Float32Array(w * h);
  const dir = rng() * Math.PI;
  for (let k = 0; k < 420; k++) {
    const x = rng() * w;
    const y = rng() * h;
    const a = rng() < 0.7 ? dir + (rng() - 0.5) * 0.5 : rng() * TAU;
    const len = 6 + rng() * 70;
    stampSegment(scratch, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.3 + rng() * 0.45, 0.3 + rng() * 0.7);
  }
  const blot = fbm(w, h, { fx: 4, octaves: 5, seed: seed + 1 });
  const oxide = fbm(w, h, { fx: 6, octaves: 4, seed: seed + 2 });
  const hammer = fbm(w, h, { fx: 8, octaves: 3, seed: seed + 3 });
  const pits = worley(w, h, { cx: 40, seed: seed + 4 });
  const px = grain(w, h, seed + 5);
  const steel = rgb('#55585a');
  const dark = rgb('#1c1b1a');
  const rustC = rgb('#4a2616');
  for (let i = 0; i < w * h; i++) {
    const ox = smoothstep(0.5, 0.78, oxide[i]);
    const pt = pits.f1[i] < 0.2 && hash01(pits.id[i], seed) < 0.3 ? 1 - pits.f1[i] / 0.2 : 0;
    const rs = pt * smoothstep(0.4, 0.7, oxide[i]);
    const v = (0.8 + blot[i] * 0.35) * (0.95 + px[i] * 0.1);
    let r = steel[0] * v;
    let g = steel[1] * v;
    let b = steel[2] * v;
    r += (dark[0] - r) * ox * 0.85;
    g += (dark[1] - g) * ox * 0.85;
    b += (dark[2] - b) * ox * 0.85;
    const sc = scratch[i];
    r += (0.62 - r) * sc * 0.5;
    g += (0.63 - g) * sc * 0.5;
    b += (0.64 - b) * sc * 0.5;
    r += (rustC[0] - r) * rs;
    g += (rustC[1] - g) * rs;
    b += (rustC[2] - b) * rs;
    const dk = 1 - pt * 0.4;
    s.set(i, r * dk, g * dk, b * dk);
    s.hgt[i] = hammer[i] * 0.5 + blot[i] * 0.2 - sc * 0.15 - pt * 0.5;
    s.rgh[i] = 0.42 + blot[i] * 0.16 + ox * 0.3 - sc * 0.2 + rs * 0.3;
    s.met[i] = 0.85 - ox * 0.55 + sc * 0.1 - rs * 0.8;
  }
  return surfTextures(s, { normal: 1.4 });
}

// Heavy flaking rust over pitted iron; flakes lift at their edges.
export function genRust(seed) {
  const w = 512;
  const h = 512;
  const s = new Surf(w, h);
  s.met = new Float32Array(w * h);
  const flakes = worley(w, h, { cx: 14, seed: seed + 1 });
  const small = fbm(w, h, { fx: 16, octaves: 2, kind: 'ridge', seed: seed + 2 });
  const tone = fbm(w, h, { fx: 5, octaves: 5, seed: seed + 3 });
  const orange = fbm(w, h, { fx: 10, octaves: 4, seed: seed + 4 });
  const pitN = fbm(w, h, { fx: 32, octaves: 3, kind: 'turb', seed: seed + 5 });
  const paint = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 6 });
  const px = grain(w, h, seed + 7);
  const dark = rgb('#26140c');
  const mid = rgb('#4e2812');
  const orangeC = rgb('#7a4018');
  const metal = rgb('#2e2c2a');
  const paintC = rgb('#1f2622');
  for (let i = 0; i < w * h; i++) {
    const cid = flakes.id[i];
    const hv = hash01(cid, seed);
    const gone = hv < 0.22; // flaked off: pitted metal below
    const edge = flakes.f2[i] - flakes.f1[i];
    const crack = 1 - smoothstep(0.02, 0.07, edge);
    const lift = smoothstep(0.35, 0.02, edge) * (0.5 + hv); // edges curl up
    const scrack = smoothstep(0.9, 0.97, small[i]);
    let r;
    let g;
    let b;
    let rough;
    let met;
    let hh;
    if (gone) {
      const pv = (0.7 + pitN[i] * 0.5) * (0.9 + px[i] * 0.2);
      r = metal[0] * pv + mid[0] * pitN[i] * 0.4;
      g = metal[1] * pv + mid[1] * pitN[i] * 0.4;
      b = metal[2] * pv + mid[2] * pitN[i] * 0.4;
      rough = 0.55 + pitN[i] * 0.3;
      met = 0.55 - pitN[i] * 0.4;
      hh = -0.4 - pitN[i] * 0.5;
    } else {
      const t = tone[i];
      r = dark[0] + (mid[0] - dark[0]) * t;
      g = dark[1] + (mid[1] - dark[1]) * t;
      b = dark[2] + (mid[2] - dark[2]) * t;
      const o = smoothstep(0.5, 0.85, orange[i]) * (0.5 + hv * 0.5);
      r += (orangeC[0] - r) * o;
      g += (orangeC[1] - g) * o;
      b += (orangeC[2] - b) * o;
      const pv = 0.85 + px[i] * 0.3;
      r *= pv;
      g *= pv;
      b *= pv;
      // Old paint hanging on in places
      const pn = smoothstep(0.66, 0.7, paint[i]) * (1 - crack);
      r += (paintC[0] - r) * pn;
      g += (paintC[1] - g) * pn;
      b += (paintC[2] - b) * pn;
      rough = 0.9 - pn * 0.3;
      met = 0.05;
      hh = 0.2 + lift * 0.5 + pitN[i] * 0.25 + pn * 0.1 - scrack * 0.15;
    }
    const dk = 1 - crack * 0.7;
    s.set(i, r * dk, g * dk, b * dk);
    s.hgt[i] = hh - crack * 0.3;
    s.rgh[i] = rough;
    s.met[i] = met;
  }
  return surfTextures(s, { normal: 3 });
}

// Dark old glass: wavy, smudged and dusty in patches, a few scratches.
export function genGlass(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const scratch = new Float32Array(w * h);
  for (let k = 0; k < 40; k++) {
    const x = rng() * w;
    const y = rng() * h;
    const a = rng() * TAU;
    const len = 10 + rng() * 90;
    stampSegment(scratch, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.3, 0.3 + rng() * 0.5);
  }
  const smudge = fbm(w, h, { fx: 4, octaves: 5, seed: seed + 1 });
  const streak = fbm(w, h, { fx: 40, fy: 3, octaves: 3, seed: seed + 2 });
  const wave = fbm(w, h, { fx: 2, fy: 6, octaves: 3, seed: seed + 3 });
  const dust = fbm(w, h, { fx: 64, octaves: 2, seed: seed + 4 });
  const base = rgb('#0c1214');
  const grime = rgb('#3a352c');
  for (let i = 0; i < w * h; i++) {
    const g0 = Math.min(1, smoothstep(0.45, 0.8, smudge[i]) * (0.6 + dust[i] * 0.5) + smoothstep(0.65, 0.9, streak[i]) * 0.35);
    const sc = scratch[i];
    const r = base[0] + (grime[0] - base[0]) * g0 * 0.7 + sc * 0.08;
    const g = base[1] + (grime[1] - base[1]) * g0 * 0.7 + sc * 0.08;
    const b = base[2] + (grime[2] - base[2]) * g0 * 0.7 + sc * 0.08;
    s.set(i, r, g, b);
    s.hgt[i] = wave[i] * 2.5 + g0 * 0.08 - sc * 0.05;
    s.rgh[i] = 0.06 + g0 * 0.6 + sc * 0.25;
  }
  return surfTextures(s, { normal: 0.8 });
}

