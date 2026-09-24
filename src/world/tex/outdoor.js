import { TAU, makeRng, rgb, smoothstep, fbm, grain, worley, hash01, makeCanvas, stampSegment, Surf, surfTextures } from './core.js';

// Field at dusk: dry grass over dirt, and the packed dirt path.

// Dry field ground (3 m tile, 1024 px). Blades are painted on a transparent
// canvas: RGB is the blade colour, alpha its coverage over the dirt.
export function genGrass(seed) {
  const w = 1024;
  const h = 1024;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const density = fbm(512, 512, { fx: 6, octaves: 4, seed: seed + 1 });
  const flow = fbm(512, 512, { fx: 3, octaves: 3, seed: seed + 2 });
  const green = fbm(512, 512, { fx: 5, octaves: 3, seed: seed + 3 });

  // Three passes from the bottom up: dark dead thatch, olive, dry straw on top.
  const passes = [
    { n: 7000, cols: ['#2a2414', '#332b18', '#231d10', '#3a3019'], len: [14, 40], wd: [1.2, 2.2] },
    { n: 5000, cols: ['#3d3f1f', '#4a4824', '#353a1c', '#524d2a'], len: [16, 50], wd: [1.1, 1.9] },
    { n: 6000, cols: ['#6a5d38', '#7a6a40', '#5e5433', '#86754a', '#71633c'], len: [18, 60], wd: [1.0, 1.8] },
  ];
  const ctx = makeCanvas(w, h).getContext('2d'); // GPU-backed: thousands of strokes, one readback
  ctx.lineCap = 'round';
  for (let p = 0; p < passes.length; p++) {
    const pass = passes[p];
    const buckets = pass.cols.map(() => []);
    for (let k = 0; k < pass.n; k++) {
      const x = rng() * w;
      const y = rng() * h;
      const j = (((y / 2) | 0) << 9) | ((x / 2) | 0);
      if (rng() > 0.25 + density[j] * 0.9) continue;
      if (p === 1 && rng() > green[j] * 1.4) continue;
      const a = flow[j] * TAU * 2 + (rng() - 0.5) * 1.6;
      const len = pass.len[0] + rng() * (pass.len[1] - pass.len[0]);
      const bend = (rng() - 0.5) * len * 0.5;
      const ex = x + Math.cos(a) * len;
      const ey = y + Math.sin(a) * len;
      const cx = (x + ex) / 2 - Math.sin(a) * bend;
      const cy = (y + ey) / 2 + Math.cos(a) * bend;
      const wd = pass.wd[0] + rng() * (pass.wd[1] - pass.wd[0]);
      buckets[(rng() * pass.cols.length) | 0].push([x, y, cx, cy, ex, ey, wd]);
    }
    // Width buckets inside each colour keep stroke calls few.
    pass.cols.forEach((col, ci) => {
      const byW = new Map();
      for (const b of buckets[ci]) {
        const key = Math.round(b[6] * 2) / 2;
        let path = byW.get(key);
        if (!path) byW.set(key, (path = new Path2D()));
        const [x, y, cx, cy, ex, ey] = b;
        // Add wrapped copies for blades that cross an edge.
        const m = 70;
        const oxs = x < m ? [0, w] : x > w - m ? [0, -w] : [0];
        const oys = y < m ? [0, h] : y > h - m ? [0, -h] : [0];
        for (const ox of oxs) {
          for (const oy of oys) {
            path.moveTo(x + ox, y + oy);
            path.quadraticCurveTo(cx + ox, cy + oy, ex + ox, ey + oy);
          }
        }
      }
      ctx.strokeStyle = col;
      for (const [wd, path] of byW) {
        ctx.lineWidth = wd;
        ctx.stroke(path);
      }
    });
  }
  const blades = ctx.getImageData(0, 0, w, h).data;

  const dirtN = fbm(w, h, { fx: 6, octaves: 4, seed: seed + 4 });
  const px = grain(w, h, seed + 5);
  const dirt = rgb('#32271c');
  const i255 = 1 / 255;
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    const a = blades[k + 3] * i255;
    const dv = (0.75 + dirtN[i] * 0.45) * (0.9 + px[i] * 0.2);
    const ao = 1 - a * 0.35; // dirt is shaded under the thatch
    let r = dirt[0] * dv * ao;
    let g = dirt[1] * dv * ao;
    let b = dirt[2] * dv * ao;
    const br = blades[k] * i255;
    const bg = blades[k + 1] * i255;
    const bb = blades[k + 2] * i255;
    r += (br - r) * a;
    g += (bg - g) * a;
    b += (bb - b) * a;
    const lum = br * 0.3 + bg * 0.6 + bb * 0.1;
    s.set(i, r, g, b);
    s.hgt[i] = a * (0.35 + lum * 1.6) + (1 - a) * dirtN[i] * 0.3;
    s.rgh[i] = 0.92 - a * 0.06 + (px[i] - 0.5) * 0.06;
  }
  return surfTextures(s, { normal: 2.2 });
}

// Packed dirt path with embedded pebbles and dry cracks (3 m tile).
export function genDirt(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const peb = worley(w, h, { cx: 36, seed: seed + 1 });
  const crackC = worley(w, h, { cx: 7, seed: seed + 2 });
  const low = fbm(w, h, { fx: 3, octaves: 5, seed: seed + 3 });
  const mid = fbm(w, h, { fx: 12, octaves: 3, seed: seed + 4 });
  const crackMask = fbm(w, h, { fx: 3, octaves: 3, seed: seed + 5 });
  const px = grain(w, h, seed + 6);
  const straw = new Float32Array(w * h);
  for (let k = 0; k < 120; k++) {
    const x = rng() * w;
    const y = rng() * h;
    const a = rng() * TAU;
    const len = 4 + rng() * 12;
    stampSegment(straw, w, h, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.5, 0.5 + rng() * 0.5);
  }
  const dirt = rgb('#3d2f22');
  const packed = rgb('#2e241b');
  const stones = ['#4d4a44', '#4a3d2e', '#5c4d36', '#3a3632', '#55504a'].map(rgb);
  const strawC = rgb('#6a5d38');
  for (let i = 0; i < w * h; i++) {
    const pk = smoothstep(0.4, 0.7, low[i]);
    const v = (0.82 + mid[i] * 0.3) * (0.92 + px[i] * 0.16);
    let r = (dirt[0] + (packed[0] - dirt[0]) * pk) * v;
    let g = (dirt[1] + (packed[1] - dirt[1]) * pk) * v;
    let b = (dirt[2] + (packed[2] - dirt[2]) * pk) * v;
    let hh = low[i] * 0.8 + mid[i] * 0.4 + px[i] * 0.12;
    let rough = 0.95 - pk * 0.06;
    // Pebbles: domes with a dark contact rim
    const hv = hash01(peb.id[i], seed);
    const rad = 0.22 + hash01(peb.id[i], seed + 1) * 0.2;
    const d = peb.f1[i];
    if (hv < 0.32 && d < rad + 0.08) {
      const inside = d < rad;
      if (inside) {
        const dome = Math.sqrt(1 - (d / rad) * (d / rad));
        const col = stones[(hash01(peb.id[i], seed + 2) * stones.length) | 0];
        const sv = (0.75 + dome * 0.35) * (0.9 + px[i] * 0.2);
        r = col[0] * sv;
        g = col[1] * sv;
        b = col[2] * sv;
        hh += dome * 1.2;
        rough = 0.72;
      } else {
        const rim = 1 - (d - rad) / 0.08;
        r *= 1 - rim * 0.4;
        g *= 1 - rim * 0.4;
        b *= 1 - rim * 0.4;
      }
    }
    // Dry cracks in patches
    const cm = smoothstep(0.55, 0.7, crackMask[i]);
    const ce = crackC.f2[i] - crackC.f1[i];
    const ck = cm * (1 - smoothstep(0.015, 0.05, ce));
    const st = straw[i];
    r += (strawC[0] - r) * st * 0.8;
    g += (strawC[1] - g) * st * 0.8;
    b += (strawC[2] - b) * st * 0.8;
    const dk = 1 - ck * 0.7;
    s.set(i, r * dk, g * dk, b * dk);
    s.hgt[i] = hh - ck * 0.6 + st * 0.1;
    s.rgh[i] = rough;
  }
  return surfTextures(s, { normal: 2.4 });
}
