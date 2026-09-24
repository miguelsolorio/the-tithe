import { TAU, makeRng, rgb, smoothstep, fbm, grain, blur, softBlur, maskCtx, readChannel, stampSegment, stampDisc, Surf, surfTextures } from './core.js';
import { blobPoints, fillPoly, drawHand } from './wallpaper.js';

// Decal textures: RGBA colour with transparent edges (clamped, fills the
// 0..1 UV square), optional normal / emissive maps and a scalar roughness.
// +V (canvas top) is "up" on walls; footprints walk toward +V.

const THIN = rgb('#5c080a');
const THICK = rgb('#1c0204');
const DRIED = rgb('#440a0a');

function finish(s, { normal = 1.5, roughness = 0.4, aspect = 1, emissive = null, emissiveIntensity } = {}) {
  s.rgh = null;
  const t = surfTextures(s, { normal, repeat: false });
  return { map: t.map, normalMap: t.normalMap ?? null, emissiveMap: t.emissiveMap ?? null, roughness, aspect, emissive, emissiveIntensity };
}

// Blood colour from thickness 0..1 (thin films are redder, pools near black).
function bloodAt(s, i, cover, thick, extraDark = 0) {
  const t = Math.min(1, Math.max(0, thick));
  const k = 1 - extraDark;
  s.set(i, (THIN[0] + (THICK[0] - THIN[0]) * t) * k, (THIN[1] + (THICK[1] - THIN[1]) * t) * k, (THIN[2] + (THICK[2] - THIN[2]) * t) * k, cover);
}

export function genBloodSplat(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const c = w / 2;
  const ctx = maskCtx(w, h);
  ctx.fillStyle = '#fff';
  fillPoly(ctx, blobPoints(rng, c, c, w * 0.15, w * 0.14, 0.1, 96));
  for (let k = 0; k < 7; k++) {
    const a = rng() * TAU;
    const d = w * (0.05 + rng() * 0.08);
    fillPoly(ctx, blobPoints(rng, c + Math.cos(a) * d, c + Math.sin(a) * d, w * (0.04 + rng() * 0.05), w * (0.04 + rng() * 0.04), 0.15, 48));
  }
  // Radiating spikes
  for (let k = 0; k < 26; k++) {
    const a = rng() * TAU;
    const r0 = w * 0.1;
    const r1 = w * (0.2 + rng() * 0.2);
    const hw = w * (0.008 + rng() * 0.018);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a + Math.PI / 2) * hw + Math.cos(a) * r0, c + Math.sin(a + Math.PI / 2) * hw + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.lineTo(c - Math.cos(a + Math.PI / 2) * hw + Math.cos(a) * r0, c - Math.sin(a + Math.PI / 2) * hw + Math.sin(a) * r0);
    ctx.fill();
    // Droplet at the spike tip
    if (rng() < 0.6) {
      ctx.beginPath();
      ctx.ellipse(c + Math.cos(a) * (r1 + 6), c + Math.sin(a) * (r1 + 6), hw * 1.4 + 1.5, hw + 1, a, 0, TAU);
      ctx.fill();
    }
  }
  // Satellite droplets elongated away from the centre, and fine spray
  for (let k = 0; k < 70; k++) {
    const a = rng() * TAU;
    const d = w * (0.2 + rng() * 0.26);
    const r = 1.2 + rng() * rng() * 6;
    ctx.beginPath();
    ctx.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, r * (1.3 + rng() * 0.8), r, a, 0, TAU);
    ctx.fill();
  }
  for (let k = 0; k < 220; k++) {
    const a = rng() * TAU;
    const d = w * (0.18 + rng() * 0.29);
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 0.5 + rng() * 1.1, 0, TAU);
    ctx.fill();
  }
  const mask = readChannel(ctx, 0);
  const thick = blur(mask, w, h, 5, 2);
  const n = fbm(w, h, { fx: 8, octaves: 3, seed: seed + 1 });
  for (let i = 0; i < w * h; i++) {
    const m = mask[i];
    const th = thick[i];
    const rim = m * smoothstep(0.75, 0.35, th) * 0.35;
    bloodAt(s, i, m * (0.86 + n[i] * 0.12), Math.pow(th, 0.6) * (0.8 + n[i] * 0.3), rim);
    s.hgt[i] = th * 1.2 + m * 0.3 + rim * 0.3;
  }
  return finish(s, { normal: 2.2, roughness: 0.26 });
}

export function genBloodSmear(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const streak = fbm(w, h, { fx: 2, fy: 48, octaves: 3, seed: seed + 1 });
  const edge = fbm(w, h, { fx: 16, octaves: 3, seed: seed + 2 });
  const breakup = fbm(w, h, { fx: 6, octaves: 3, seed: seed + 3 });
  const ph = rng() * TAU;
  const u0 = 0.08;
  const u1 = 0.93;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = x / w;
      const t = (u - u0) / (u1 - u0);
      let cover = 0;
      let thick = 0;
      if (t > -0.1 && t < 1) {
        const vc = 0.5 + 0.05 * Math.sin(u * 5 + ph) + 0.02 * Math.sin(u * 13 + ph * 2);
        const hw = 0.17 * (1 - 0.55 * Math.max(0, t)) * (0.85 + edge[i] * 0.3);
        const d = Math.abs(v - vc);
        const inside = 1 - smoothstep(hw * 0.8, hw, d);
        const tt = Math.max(0, t);
        const fade = 1 - 0.75 * Math.pow(tt, 1.4);
        const st = smoothstep(0.3, 0.62, streak[i]);
        const tail = smoothstep(0.1, 0.45, breakup[i] + 0.55 - tt * 0.6);
        cover = inside * (0.3 + 0.7 * st) * fade * tail * smoothstep(-0.1, 0.03, t);
        // The pressure blob where the smear starts
        const bx = (u - (u0 + 0.06)) / 0.11;
        const by = (v - vc) / 0.15;
        const blob = 1 - smoothstep(0.75, 1.0, Math.sqrt(bx * bx + by * by) * (0.9 + edge[i] * 0.2));
        cover = Math.max(cover, blob * 0.95);
        thick = cover * (0.4 + 0.6 * (1 - tt)) * (0.6 + st * 0.4);
      }
      bloodAt(s, i, cover * 0.94, thick);
      s.hgt[i] = thick * 0.6 + cover * 0.2;
    }
  }
  return finish(s, { normal: 1.6, roughness: 0.34 });
}

export function genBloodDrip(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const cover = new Float32Array(w * h);
  const thick = new Float32Array(w * h);
  const band = fbm(w, h, { fx: 6, fy: 2, octaves: 4, seed: seed + 1 });
  const topN = fbm(w, h, { fx: 24, fy: 2, octaves: 2, seed: seed + 2 });
  // Top band with an irregular lower edge; the very top stays transparent.
  for (let y = 0; y < 110; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const bottom = 30 + band[x] * 60;
      const topEdge = 6 + topN[x] * 10;
      const side = smoothstep(4, 24, x) * smoothstep(4, 24, w - x);
      const c = smoothstep(topEdge, topEdge + 5, y) * (1 - smoothstep(bottom - 4, bottom, y)) * side;
      cover[i] = c;
      thick[i] = c * 0.7;
    }
  }
  // Drips of varying length ending in a bead
  for (let k = 0; k < 20; k++) {
    const x0 = 24 + rng() * (w - 48);
    const startY = 30 + band[Math.floor(x0)] * 60 - 6;
    const len = 40 + Math.pow(rng(), 1.6) * (h - startY - 40);
    const wd = 2 + rng() * 4.5;
    let x = x0;
    for (let y = startY; y < startY + len; y += 2) {
      const t = (y - startY) / len;
      const r = wd * (1 - t * 0.35);
      x += (rng() - 0.5) * 0.5;
      stampSegment(cover, w, h, x, y, x, y + 2, r, 0.95);
      stampSegment(thick, w, h, x, y, x, y + 2, r, 0.45 + t * 0.35, 1);
    }
    const by = Math.min(h - 12, startY + len);
    stampDisc(cover, w, h, x, by, wd * 1.25, 0.95);
    stampDisc(thick, w, h, x, by, wd * 1.25, 1, 1);
  }
  // Thin trickles
  for (let k = 0; k < 12; k++) {
    const x0 = 20 + rng() * (w - 40);
    const y0 = 40 + band[Math.floor(x0)] * 50;
    const len = 20 + rng() * 180;
    stampSegment(cover, w, h, x0, y0, x0 + (rng() - 0.5) * 4, y0 + len, 0.6 + rng() * 0.6, 0.8);
  }
  for (let i = 0; i < w * h; i++) {
    bloodAt(s, i, cover[i] * 0.93, thick[i]);
    s.hgt[i] = thick[i];
  }
  return finish(s, { normal: 2.4, roughness: 0.3 });
}

// Hand-drawn wobbly ring.
function ring(c, cx, cy, r, wd, rng, wob = 0.006) {
  const ph = rng() * TAU;
  const ph2 = rng() * TAU;
  c.lineWidth = wd;
  c.beginPath();
  for (let k = 0; k <= 240; k++) {
    const a = (k / 240) * TAU;
    const rr = r * (1 + wob * Math.sin(a * 3 + ph) + wob * 0.6 * Math.sin(a * 7 + ph2));
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (k === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
}

// Rune-like glyph from strokes, in a box of height gh centred on (0, 0).
function glyph(c, gh, rng) {
  const hw = gh * 0.3;
  c.beginPath();
  if (rng() < 0.85) {
    c.moveTo(0, -gh / 2);
    c.lineTo(0, gh / 2);
  }
  const n = 1 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const y = (rng() - 0.5) * gh * 0.8;
    const dir = rng() < 0.5 ? -1 : 1;
    const kind = rng();
    if (kind < 0.5) {
      c.moveTo(0, y);
      c.lineTo(dir * hw, y - gh * (0.15 + rng() * 0.25));
    } else if (kind < 0.75) {
      c.moveTo(-hw, y);
      c.lineTo(hw, y + (rng() - 0.5) * gh * 0.4);
    } else {
      c.moveTo(0, y);
      c.lineTo(dir * hw, y + gh * 0.2);
      c.lineTo(0, y + gh * 0.4);
    }
  }
  c.stroke();
  if (rng() < 0.3) {
    c.beginPath();
    c.arc((rng() - 0.5) * hw, -gh * 0.5 - 4, 3, 0, TAU);
    c.fill();
  }
}

// Tapered stroke along a cubic bezier (stamped discs).
function taper(c, p, w0, w1, steps = 80) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6];
    const y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7];
    c.beginPath();
    c.arc(x, y, (w0 + (w1 - w0) * t) * 0.5, 0, TAU);
    c.fill();
  }
}

// Occult circle: rings, runes, an inscribed downward triangle and a horned
// eye in the centre (no pentagram). Painted white into a mask canvas.
let sigilCache = null;
const sigilTaken = new Set();
function sigilMask(who) {
  if (!sigilCache) {
    sigilCache = drawSigilMask();
    sigilTaken.clear();
  }
  const m = sigilCache;
  sigilTaken.add(who);
  if (sigilTaken.size >= 2) sigilCache = null;
  return m;
}

function drawSigilMask() {
  const S = 1024;
  const rng = makeRng(666);
  const ctx = maskCtx(S, S);
  const c = S / 2;
  const R = S * 0.45;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ring(ctx, c, c, R, 12, rng);
  ring(ctx, c, c, R * 0.885, 6, rng);
  ring(ctx, c, c, R * 0.63, 9, rng);
  ring(ctx, c, c, R * 0.585, 4, rng);
  // Runes in the outer band
  const count = 20;
  ctx.lineWidth = 5;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * TAU + 0.08;
    const rr = R * 0.943;
    ctx.save();
    ctx.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    ctx.rotate(a + Math.PI / 2);
    glyph(ctx, R * 0.075, rng);
    ctx.restore();
  }
  // Middle band: radial ticks and four small circled marks
  ctx.lineWidth = 4;
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * TAU;
    const long = k % 3 === 0;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * R * 0.87, c + Math.sin(a) * R * 0.87);
    ctx.lineTo(c + Math.cos(a) * R * (long ? 0.8 : 0.84), c + Math.sin(a) * R * (long ? 0.8 : 0.84));
    ctx.stroke();
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k / 4) * TAU;
    const x = c + Math.cos(a) * R * 0.72;
    const y = c + Math.sin(a) * R * 0.72;
    ctx.lineWidth = 5;
    ring(ctx, x, y, R * 0.07, 5, rng, 0.02);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.lineWidth = 4;
    glyph(ctx, R * 0.08, rng);
    ctx.restore();
  }
  // Downward triangle inscribed in the inner ring
  ctx.lineWidth = 7;
  ctx.beginPath();
  for (let k = 0; k <= 3; k++) {
    const a = Math.PI / 2 + (k / 3) * TAU;
    const x = c + Math.cos(a) * R * 0.585;
    const y = c + Math.sin(a) * R * 0.585;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Horned eye: head circle, almond eye, ram horns curling back in
  const hy = c + R * 0.06;
  ring(ctx, c, hy, R * 0.13, 8, rng, 0.01);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(c - R * 0.085, hy);
  ctx.quadraticCurveTo(c, hy - R * 0.08, c + R * 0.085, hy);
  ctx.quadraticCurveTo(c, hy + R * 0.08, c - R * 0.085, hy);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(c, hy, R * 0.018, R * 0.034, 0, 0, TAU);
  ctx.fill();
  for (const sd of [-1, 1]) {
    taper(ctx, [c + sd * R * 0.08, hy - R * 0.1, c + sd * R * 0.36, hy - R * 0.12, c + sd * R * 0.44, hy - R * 0.5, c + sd * R * 0.2, hy - R * 0.46], 20, 5);
    taper(ctx, [c + sd * R * 0.2, hy - R * 0.46, c + sd * R * 0.1, hy - R * 0.44, c + sd * R * 0.12, hy - R * 0.34, c + sd * R * 0.19, hy - R * 0.36], 5, 2.5, 30);
  }
  // Spine down to the triangle's tip, ending in a small circle
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(c, hy + R * 0.13);
  ctx.lineTo(c, c + R * 0.5);
  ctx.stroke();
  ring(ctx, c, c + R * 0.53, R * 0.03, 4, rng, 0.02);
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(c + sd * R * 0.26, hy + R * 0.05, 5, 0, TAU);
    ctx.fill();
  }
  const hard = readChannel(ctx, 0);
  // Splatter flicked off the brush
  for (let k = 0; k < 160; k++) {
    const a = rng() * TAU;
    const d = R * (0.1 + rng() * 0.95);
    stampDisc(hard, S, S, c + Math.cos(a) * d, c + Math.sin(a) * d, 0.8 + rng() * rng() * 4, 0.9);
  }
  return { S, hard, soft: softBlur(hard, S, S, 12) };
}

function sigilSurf(seed, glow) {
  const { S, hard, soft } = sigilMask(glow ? 'glow' : 'plain');
  const s = new Surf(S, S);
  const brush = fbm(S, S, { fx: 12, fy: 48, octaves: 3, seed: seed + 1 });
  const px = grain(S, S, seed + 2, 1);
  const glowC = rgb('#3a0806');
  for (let i = 0; i < S * S; i++) {
    const m = hard[i];
    // Dry-brush breakup of the paint
    const paint = m * (0.6 + 0.4 * smoothstep(0.25, 0.6, brush[i])) * (0.9 + px[i] * 0.1);
    if (glow) {
      const halo = soft[i];
      const a = Math.max(paint * 0.97, Math.min(0.55, halo * 0.9));
      const e = Math.min(1, paint * 1.1 + halo * 0.5);
      s.set(i, glowC[0], glowC[1], glowC[2], a);
      s.setEmissive(i, e, e, e);
    } else {
      const th = paint * (0.5 + soft[i]);
      s.set(i, DRIED[0] * (1 - th * 0.35), DRIED[1] * (1 - th * 0.35), DRIED[2] * (1 - th * 0.35), Math.min(1, paint * 1.05));
    }
    s.hgt[i] = paint * 0.6 + soft[i] * 0.3;
  }
  return finish(s, glow ? { normal: 0, roughness: 0.5, emissive: 0xff1a0a, emissiveIntensity: 2.6 } : { normal: 1.2, roughness: 0.55 });
}

export const genSigil = (seed) => sigilSurf(seed, false);
export const genSigilGlow = (seed) => sigilSurf(seed, true);

export function genGrime(seed) {
  const w = 512;
  const h = 512;
  const s = new Surf(w, h);
  const blob = fbm(w, h, { fx: 3, octaves: 5, seed: seed + 1 });
  const mott = fbm(w, h, { fx: 12, octaves: 3, seed: seed + 2 });
  const px = grain(w, h, seed + 3, 1);
  const col = rgb('#161009');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = (x + 0.5) / w - 0.5;
      const dy = (y + 0.5) / h - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) / 0.48 + (blob[i] - 0.5) * 0.7;
      const a = (1 - smoothstep(0.25, 0.95, r)) * (0.45 + 0.55 * smoothstep(0.2, 0.7, mott[i])) * 0.85;
      const v = 0.75 + mott[i] * 0.4 + (px[i] - 0.5) * 0.2;
      s.set(i, col[0] * v, col[1] * v, col[2] * v, a);
    }
  }
  return finish(s, { normal: 0, roughness: 0.95 });
}

export function genHandprint(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const ctx = maskCtx(w, h);
  drawHand(ctx, w, h, w * 0.5, h * 0.44, w * 0.2, rng, { channel: '#fff', smear: 0.35, wrap: false });
  const mask = readChannel(ctx, 0);
  const thick = blur(mask, w, h, 3, 1);
  const skin = fbm(w, h, { fx: 48, octaves: 2, seed: seed + 1 });
  const blot = fbm(w, h, { fx: 6, octaves: 3, seed: seed + 2 });
  for (let i = 0; i < w * h; i++) {
    const m = mask[i];
    const tr = smoothstep(0.25, 0.55, skin[i] * 0.7 + blot[i] * 0.5);
    bloodAt(s, i, m * (0.45 + 0.5 * tr), thick[i] * (0.4 + 0.6 * blot[i]));
    s.hgt[i] = m * tr * 0.3 + thick[i] * 0.3;
  }
  return finish(s, { normal: 1.2, roughness: 0.42 });
}

// Four bare bloody footprints walking toward +V, fading as the blood runs
// out. Authored for a 1:4 plane (e.g. 0.5 x 2 m).
export function genFootprints(seed) {
  const w = 256;
  const h = 1024;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const ctx = maskCtx(w, h);
  const L = 118;
  const print = (cx, cy, right, fade, rot) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale((right ? 1 : -1) * L, L);
    ctx.fillStyle = `rgba(255,255,255,${fade})`;
    const e = (x, y, rx, ry, a = 0) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, a, 0, TAU);
      ctx.fill();
    };
    e(0.01, 0.3, 0.13, 0.16); // heel
    e(0.08, 0.04, 0.075, 0.2, -0.08); // outer arch
    e(0.02, -0.17, 0.17, 0.1, -0.15); // ball
    e(-0.1, -0.37, 0.068, 0.075); // big toe (medial side)
    e(0.02, -0.405, 0.045, 0.05);
    e(0.1, -0.375, 0.04, 0.045);
    e(0.165, -0.325, 0.035, 0.04);
    e(0.215, -0.265, 0.03, 0.035);
    ctx.restore();
  };
  for (let k = 0; k < 4; k++) {
    const right = k % 2 === 1;
    const cy = h - (k + 0.5) * (h / 4) + (rng() - 0.5) * 20;
    const cx = w * (right ? 0.64 : 0.36) + (rng() - 0.5) * 10;
    print(cx, cy, right, 1 - k * 0.17, (rng() - 0.5) * 0.18 + (right ? 0.05 : -0.05));
  }
  const mask = readChannel(ctx, 0);
  const skin = fbm(w, h, { fx: 12, fy: 48, octaves: 3, seed: seed + 1 });
  const thick = blur(mask, w, h, 2, 1);
  for (let i = 0; i < w * h; i++) {
    const m = mask[i];
    const tr = smoothstep(0.2, 0.55, skin[i]);
    bloodAt(s, i, m * (0.5 + 0.45 * tr), thick[i] * 0.8);
    s.hgt[i] = m * tr * 0.3;
  }
  return finish(s, { normal: 1.2, roughness: 0.48, aspect: w / h });
}

// Extra: a large glossy pool for floors.
export function genBloodPool(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const ctx = maskCtx(w, h);
  ctx.fillStyle = '#fff';
  fillPoly(ctx, blobPoints(rng, w / 2, h / 2, w * 0.3, w * 0.27, 0.04, 128));
  for (let k = 0; k < 6; k++) {
    const a = rng() * TAU;
    const d = w * (0.22 + rng() * 0.12);
    fillPoly(ctx, blobPoints(rng, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, w * (0.05 + rng() * 0.07), w * (0.05 + rng() * 0.06), 0.05, 48));
  }
  for (let k = 0; k < 30; k++) {
    const a = rng() * TAU;
    const d = w * (0.38 + rng() * 0.08);
    ctx.beginPath();
    ctx.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 1 + rng() * 4, 0, TAU);
    ctx.fill();
  }
  const mask = readChannel(ctx, 0);
  const depth = blur(mask, w, h, 9, 2);
  for (let i = 0; i < w * h; i++) {
    const m = mask[i];
    const d = depth[i];
    bloodAt(s, i, m * 0.97, 0.35 + d * 0.9);
    s.hgt[i] = smoothstep(0.1, 0.6, d) * 1.2 * m;
  }
  return finish(s, { normal: 2.6, roughness: 0.12 });
}

// Extra: four claw gouges torn through a wall surface.
export function genClaws(seed) {
  const w = 512;
  const h = 512;
  const rng = makeRng(seed);
  const s = new Surf(w, h);
  const gouge = new Float32Array(w * h);
  const rim = new Float32Array(w * h);
  const a = -1.05 + (rng() - 0.5) * 0.2;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  for (let k = 0; k < 4; k++) {
    const off = (k - 1.5) * w * 0.085;
    const x0 = w * 0.3 + off * Math.sin(a) * -1 + (rng() - 0.5) * 8;
    const y0 = h * 0.22 + off * Math.cos(a) * -1;
    const len = w * (0.5 + rng() * 0.12) - Math.abs(k - 1.5) * 20;
    const bow = (rng() - 0.5) * 30;
    let px = x0;
    let py = y0;
    for (let t = 0; t <= 1; t += 0.01) {
      const x = x0 + dx * len * t + Math.sin(Math.PI * t) * bow * dy;
      const y = y0 + dy * len * t - Math.sin(Math.PI * t) * bow * dx;
      const r = 1 + Math.sin(Math.PI * Math.min(1, t * 1.3)) * (4.5 + k % 2);
      stampSegment(gouge, w, h, px, py, x, y, r, 1, 1);
      stampSegment(rim, w, h, px, py, x, y, r + 4, 1, 1);
      px = x;
      py = y;
    }
  }
  const n = fbm(w, h, { fx: 24, octaves: 2, seed: seed + 1 });
  const dark = rgb('#0e0b09');
  const torn = rgb('#6a5e4c');
  const blood = rgb('#2a0406');
  for (let i = 0; i < w * h; i++) {
    const g = gouge[i];
    const r = Math.max(0, rim[i] - g);
    const bl = smoothstep(0.55, 0.8, n[i]) * g;
    let cr = torn[0] + (dark[0] - torn[0]) * g;
    let cg = torn[1] + (dark[1] - torn[1]) * g;
    let cb = torn[2] + (dark[2] - torn[2]) * g;
    cr += (blood[0] - cr) * bl;
    cg += (blood[1] - cg) * bl;
    cb += (blood[2] - cb) * bl;
    const alpha = Math.min(1, g * 1.4 + r * 0.45 * (0.6 + n[i] * 0.6));
    s.set(i, cr, cg, cb, alpha);
    s.hgt[i] = -g * 1.4 + r * 0.25;
  }
  return finish(s, { normal: 3, roughness: 0.85 });
}
