import { TAU, makeRng, rgb, smoothstep, fbm, grain, worley, hash01, sample, branchPaths, strokePaths, maskCtx, readBytes, softBlurBytes, upsample, Surf, surfTextures } from './core.js';

// Flesh caves: wet meat with branching veins, darker tissue, membrane, bone
// and the glowing pods.

// Vein network painted with wrap-around. Returns { crisp: RGBA bytes with
// surface veins in r, halo: soft bulge around them, deep: blurred deeper veins }.
function veinMask(w, h, rng, { roots = 8, width = 8, length = 700, deep = 6, deepWidth = 7, step = 5, branch = 0.05, depth = 4, fromTop = false } = {}) {
  const mk = (n, wd, len) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        x: rng() * w,
        y: fromTop ? rng() * h * 0.1 : rng() * h,
        angle: fromTop ? Math.PI / 2 + (rng() - 0.5) * 0.6 : rng() * TAU,
        width: wd * (0.6 + rng() * 0.6),
        length: len * (0.6 + rng() * 0.6),
      });
    }
    return out;
  };
  const opts = { w, h, step, wiggle: 0.32, branch, spread: [0.35, 1.0], taper: 0.994, minWidth: 0.6, maxDepth: depth, childScale: 0.62, lenScale: 0.72, curl: 0.03 };
  const surface = branchPaths(rng, mk(roots, width, length), opts);
  const deepP = branchPaths(rng, mk(deep, deepWidth, length * 0.8), opts);
  const ctx = maskCtx(w, h);
  ctx.globalCompositeOperation = 'lighten';
  strokePaths(ctx, surface, '#f00');
  strokePaths(ctx, surface, '#0f0', 1.8, 1);
  strokePaths(ctx, deepP, '#00f', 1.2);
  const crisp = readBytes(ctx);
  const k = w / 512;
  return { crisp, halo: softBlurBytes(crisp, 1, w, h, 3 * k), deep: softBlurBytes(crisp, 2, w, h, 3 * k) };
}

function fleshSurf(seed, dark) {
  const w = dark ? 512 : 1024;
  const h = w;
  const k = w / 1024; // feature scale vs the 1024 px version
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const vein = veinMask(w, h, rng, { roots: dark ? 12 : 8, width: 9 * k + 1, length: 700 * k, deep: dark ? 8 : 6, deepWidth: 8 * k + 1, step: 5 * k + 1, branch: 0.05 });
  const lump = fbm(w, h, { fx: 4, octaves: 4, kind: 'turb', seed: seed + 1 });
  const fold = fbm(w, h, { fx: 5, octaves: 4, kind: 'ridge', seed: seed + 2 });
  const bruise = fbm(w, h, { fx: 3, octaves: 4, seed: seed + 3 });
  // Muscle fibres and fat marbling: streaky fields sampled along a warped
  // flow at 512 px, then upsampled.
  const wx = fbm(512, 512, { fx: 2, octaves: 3, seed: seed + 4 });
  const wy = fbm(512, 512, { fx: 2, octaves: 3, seed: seed + 5 });
  const fibSrc = fbm(512, 512, { fx: 6, fy: 96, octaves: 3, seed: seed + 6 });
  const fatSrc = fbm(512, 512, { fx: 3, fy: 20, octaves: 4, seed: seed + 7 });
  let fib = new Float32Array(512 * 512);
  let fatF = new Float32Array(512 * 512);
  for (let y = 0, i = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++, i++) {
      const fx = x + (wx[i] - 0.5) * 90;
      const fy = y + (wy[i] - 0.5) * 90;
      fib[i] = sample(fibSrc, 512, 512, fx, fy);
      fatF[i] = sample(fatSrc, 512, 512, fx * 0.7 + 100, fy * 0.7);
    }
  }
  if (w > 512) {
    fib = upsample(fib, 512, 512, w / 512, h / 512);
    fatF = upsample(fatF, 512, 512, w / 512, h / 512);
  }
  const pore = grain(w, h, seed + 8, 1);
  const meat = dark ? rgb('#3a060a') : rgb('#7a0f16');
  const hi = dark ? rgb('#5a1016') : rgb('#a0282a');
  const deepC = dark ? rgb('#12020a') : rgb('#3a0612');
  const veinC = dark ? rgb('#140106') : rgb('#2a030a');
  const deepVein = rgb('#2c0616');
  const fat = dark ? rgb('#5a3a2c') : rgb('#9a7458');
  const purple = rgb('#3c0c28');
  const i255 = 1 / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const fb = fib[i];
      const ft = fatF[i];
      const vr = vein.crisp[i * 4] * i255;
      const vg = vein.halo[i];
      const vb = vein.deep[i];
      const lp = lump[i];
      const crease = smoothstep(0.12, 0.0, lp) * 0.8 + smoothstep(0.85, 1.0, fold[i]) * 0.6;
      const body = smoothstep(0.05, 0.7, lp);
      // Base: dark in the creases, pinker and lighter on the swellings
      let r = deepC[0] + (meat[0] - deepC[0]) * body;
      let g = deepC[1] + (meat[1] - deepC[1]) * body;
      let b = deepC[2] + (meat[2] - deepC[2]) * body;
      const top = smoothstep(0.55, 0.95, lp) * 0.55;
      r += (hi[0] - r) * top;
      g += (hi[1] - g) * top;
      b += (hi[2] - b) * top;
      const fv = 0.85 + fb * 0.3;
      r *= fv;
      g *= fv;
      b *= fv;
      // Fatty streaks
      const fa = smoothstep(0.7, 0.8, ft) * (dark ? 0.35 : 0.8) * (1 - crease);
      r += (fat[0] * (0.8 + fb * 0.3) - r) * fa;
      g += (fat[1] * (0.8 + fb * 0.3) - g) * fa;
      b += (fat[2] * (0.8 + fb * 0.3) - b) * fa;
      // Bruising and deep veins seen through the tissue
      const br = smoothstep(0.6, 0.85, bruise[i]) * 0.45;
      r += (purple[0] - r) * br;
      g += (purple[1] - g) * br;
      b += (purple[2] - b) * br;
      r += (deepVein[0] - r) * vb * 0.55;
      g += (deepVein[1] - g) * vb * 0.55;
      b += (deepVein[2] - b) * vb * 0.55;
      // Surface veins with a dark halo
      const halo = vg * 0.3;
      r *= 1 - halo;
      g *= 1 - halo;
      b *= 1 - halo * 0.6;
      r += (veinC[0] - r) * vr * 0.9;
      g += (veinC[1] - g) * vr * 0.9;
      b += (veinC[2] - b) * vr * 0.9;
      const ck = 1 - crease * 0.6;
      s.set(i, r * ck, g * ck, b * ck);
      s.hgt[i] = lp * 2.2 - crease * 0.7 + fb * 0.25 + vg * 0.7 + vr * 0.25 + fa * 0.12 + pore[i] * 0.06;
      s.rgh[i] = 0.34 + top * 0.1 - crease * 0.14 + fa * 0.12 - vr * 0.04 + (pore[i] - 0.5) * 0.08;
    }
  }
  return surfTextures(s, { normal: dark ? 3.2 : 3.6 });
}

export const genFlesh = (seed) => fleshSurf(seed, false);
export const genFleshDark = (seed) => fleshSurf(seed, true);

// Stretched pink-red membrane with veins and capillaries (1.5 m tile).
export function genMembrane(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const vein = veinMask(w, h, rng, { roots: 10, width: 3.5, length: 380, deep: 4, deepWidth: 4, step: 3, branch: 0.05, depth: 3 });
  const wrinkle = fbm(w, h, { fx: 3, fy: 40, octaves: 3, kind: 'ridge', seed: seed + 1 });
  const thin = fbm(w, h, { fx: 4, octaves: 4, seed: seed + 2 });
  const sag = fbm(w, h, { fx: 2, octaves: 3, seed: seed + 3 });
  const cap = fbm(w, h, { fx: 14, octaves: 3, kind: 'ridge', seed: seed + 4 });
  const px = grain(w, h, seed + 5);
  const base = rgb('#8a2a2a');
  const thinC = rgb('#b0524a');
  const thick = rgb('#5a1218');
  const veinC = rgb('#3a0616');
  const i255 = 1 / 255;
  for (let i = 0; i < w * h; i++) {
    const t = smoothstep(0.3, 0.8, thin[i]);
    let r = thick[0] + (base[0] - thick[0]) * (0.4 + 0.6 * t);
    let g = thick[1] + (base[1] - thick[1]) * (0.4 + 0.6 * t);
    let b = thick[2] + (base[2] - thick[2]) * (0.4 + 0.6 * t);
    const tl = smoothstep(0.7, 0.95, thin[i]) * 0.5;
    r += (thinC[0] - r) * tl;
    g += (thinC[1] - g) * tl;
    b += (thinC[2] - b) * tl;
    const wr = wrinkle[i];
    const v = (0.82 + wr * 0.22) * (0.96 + px[i] * 0.08);
    r *= v;
    g *= v;
    b *= v;
    const cp = smoothstep(0.88, 0.97, cap[i]) * 0.35;
    const vr = vein.crisp[i * 4] * i255;
    const vg = vein.halo[i];
    const vb = vein.deep[i];
    const vv = Math.max(vr * 0.9, cp, vb * 0.4);
    r += (veinC[0] - r) * vv;
    g += (veinC[1] - g) * vv;
    b += (veinC[2] - b) * vv;
    s.set(i, r * (1 - vg * 0.15), g * (1 - vg * 0.2), b * (1 - vg * 0.1));
    s.hgt[i] = sag[i] * 1.4 + wr * 0.35 + vg * 0.5 + vr * 0.2 + cp * 0.1;
    s.rgh[i] = 0.3 - tl * 0.08 + (1 - wr) * 0.04 + vr * 0.02;
  }
  return surfTextures(s, { normal: 2.6 });
}

// Porous bone with striations, cracks and brown staining.
export function genBone(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const roots = [];
  for (let k = 0; k < 5; k++) roots.push({ x: rng() * w, y: rng() * h, angle: rng() * TAU, width: 1.1 + rng() * 0.8, length: 120 + rng() * 200 });
  const paths = branchPaths(rng, roots, { w, h, step: 2.5, wiggle: 0.45, branch: 0.05, spread: [0.5, 1.1], taper: 0.99, minWidth: 0.5, maxDepth: 3 });
  const ctx = maskCtx(w, h);
  strokePaths(ctx, paths, '#f00');
  const crack = readBytes(ctx);
  const pores = worley(w, h, { cx: 56, seed: seed + 1 });
  const stria = fbm(w, h, { fx: 96, fy: 6, octaves: 2, seed: seed + 2 });
  const stain = fbm(w, h, { fx: 4, octaves: 5, seed: seed + 3 });
  const low = fbm(w, h, { fx: 3, octaves: 3, seed: seed + 4 });
  const px = grain(w, h, seed + 5, 1);
  const base = rgb('#c9bda0');
  const brown = rgb('#6e5a3e');
  const dark = rgb('#3a2e20');
  for (let i = 0; i < w * h; i++) {
    const pd = pores.f1[i];
    const pore = pd < 0.2 && hash01(pores.id[i], seed) < 0.55 ? smoothstep(0.2, 0.06, pd) : 0;
    const v = (0.86 + low[i] * 0.16) * (0.94 + stria[i] * 0.1) * (0.97 + px[i] * 0.06);
    let r = base[0] * v;
    let g = base[1] * v;
    let b = base[2] * v;
    const st = smoothstep(0.45, 0.85, stain[i]) * 0.6;
    r += (brown[0] - r) * st;
    g += (brown[1] - g) * st;
    b += (brown[2] - b) * st;
    const ck = crack[i * 4] / 255;
    const dd = Math.max(pore * 0.8, ck * 0.9);
    r += (dark[0] - r) * dd;
    g += (dark[1] - g) * dd;
    b += (dark[2] - b) * dd;
    s.set(i, r, g, b);
    s.hgt[i] = low[i] * 0.8 + stria[i] * 0.2 + px[i] * 0.08 - pore * 0.35 - ck * 0.5;
    s.rgh[i] = 0.58 + st * 0.12 + pore * 0.2 + ck * 0.2 + (px[i] - 0.5) * 0.06;
  }
  return surfTextures(s, { normal: 2.2 });
}

// Crimson pod skin: veins run pole to pole; the emissive map glows between them.
export function genPodGlow(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const vein = veinMask(w, h, rng, { roots: 14, width: 5, length: 520, deep: 8, deepWidth: 5, step: 4, branch: 0.04, depth: 3, fromTop: true });
  const glow = fbm(w, h, { fx: 4, octaves: 4, seed: seed + 1 });
  const hot = worley(w, h, { cx: 7, seed: seed + 2 });
  const lump = fbm(w, h, { fx: 6, octaves: 3, kind: 'turb', seed: seed + 3 });
  const px = grain(w, h, seed + 4, 1);
  const skin = rgb('#4a0610');
  const veinC = rgb('#12020a');
  const i255 = 1 / 255;
  for (let i = 0; i < w * h; i++) {
    const vr = vein.crisp[i * 4] * i255;
    const vg = vein.halo[i];
    const vb = vein.deep[i];
    const v = (0.75 + lump[i] * 0.35) * (0.95 + px[i] * 0.1);
    let r = skin[0] * v;
    let g = skin[1] * v;
    let b = skin[2] * v;
    const vv = Math.max(vr, vb * 0.5);
    r += (veinC[0] - r) * vv;
    g += (veinC[1] - g) * vv;
    b += (veinC[2] - b) * vv;
    s.set(i, r, g, b);
    // Glow brightest in thin spots between the veins
    const spot = smoothstep(0.55, 0.0, hot.f1[i]);
    const e = (0.3 + 0.5 * glow[i] + 0.45 * spot) * (1 - vr * 0.95) * (1 - vg * 0.55) * (1 - vb * 0.5) * (0.8 + lump[i] * 0.3);
    s.setEmissive(i, Math.min(1, e), Math.min(1, e * 0.85), Math.min(1, e * 0.85));
    s.hgt[i] = lump[i] * 1.2 + vg * 0.8 + vr * 0.3 + px[i] * 0.05;
    s.rgh[i] = 0.3 + (1 - lump[i]) * 0.08;
  }
  return surfTextures(s, { normal: 3 });
}
