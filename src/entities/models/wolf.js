import * as THREE from 'three';
import {
  cached, colorLerp, sweep, blob, prof, merge, xf, mirrorX, spike, clamp, lerp, smooth, noise3, PI,
} from './common.js';
import { buildQuadruped, teethRow } from './hound.js';

// Field wolf: big, lean and grey, shaggy and matted, with a dark saddle, a
// pale throat and legs, a heavy ruff, ears that pin back when it hunts and
// gold eyes that throw your flashlight back. The hound's rig and gaits
// (hound.js buildQuadruped), so the two move alike; the field's pack AI is
// in entities/types.js (Wolf) and levels/field/pack.js.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Fur tones before the 'fur' texture darkens them by about half.
const SADDLE = 0x2e2a26, FLANK = 0x5c554d, PALE = 0x8a8276, MUZZLE = 0x504a43, LEG = 0x746c62;
const NOSE = 0x0b0908, LIP = 0x1a1210, GUM = 0x3a1a1c;

// Upper body: dark saddle on top, grey-brown flanks, pale belly, with a
// little mottling. sin(a) > 0 is up for sweeps hinted along +Y.
function coat(o, t, a, p, { saddle = SADDLE, flank = FLANK, belly = PALE } = {}) {
  const s = Math.sin(a);
  const n = noise3(p.x * 18, p.y * 18, p.z * 18, 5);
  if (s > 0) colorLerp(o, flank, saddle, smooth((s - 0.25 + (n - 0.5) * 0.5) / 0.6));
  else colorLerp(o, flank, belly, smooth((-s - 0.2 + (n - 0.5) * 0.4) / 0.5));
  return o.multiplyScalar(0.85 + 0.3 * noise3(p.x * 60, p.y * 60, p.z * 60, 6));
}
const coatC = (opts) => (o, t, a, p) => coat(o, t, a, p, opts);
const solidC = (c) => (o) => o.set(c);

// Ragged silhouette: tufts sticking out of the outline (k = how shaggy).
const shag = (k, ft = 26, seed = 0) => (t, a) => 1 + k * Math.max(0, noise3(t * ft, Math.cos(a) * 2.4, Math.sin(a) * 2.4, seed) - 0.3);

// A tuft of fur: a flat curved spike at pos, pointing along dir.
function tuft(len, r, dir, pos, col, bend = [0, -1, 0]) {
  return xf(spike({ len, r, curve: 0.35, dir, bend, radial: 4, seg: 3, color: typeof col === 'function' ? col : solidC(col), tip: 0.12 }), pos);
}

function earGeo() {
  // Base at the origin, standing up (+Y), cupped toward +Z; dark outside, pale inside.
  return sweep({
    points: [V(0, -0.01, 0), V(0, 0.045, 0.004), V(0, 0.092, 0.012)], seg: 6, radial: 8, hint: V(0, 0, 1),
    radius: (t) => [0.034 * (1 - t) + 0.002, 0.014 * (1 - t) + 0.002],
    shape: (t, a) => (Math.sin(a) > 0.2 ? 0.35 : 1),
    color: (o, t, a) => (Math.sin(a) > 0.2 ? o.set(t < 0.7 ? 0x8a7666 : 0x3a302a) : o.set(t > 0.75 ? 0x1c1714 : 0x4a3e34)),
    capRound: 0.2, tile: 0.1,
  });
}

function headGeo() {
  const eyes = [V(0.044, 0.03, 0.058), V(-0.044, 0.03, 0.058)];
  const cran = blob({
    r: 1, sx: 0.08, sy: 0.064, sz: 0.085, ws: 18, hs: 12, noise: 0.06, freq: 9, seed: 3,
    color: (o, dy, a, p) => {
      colorLerp(o, FLANK, SADDLE, smooth((dy - 0.1) / 0.6));
      if (dy < -0.1) colorLerp(o, o.getHex(), PALE, smooth((-dy - 0.1) / 0.4));
      // Pale brows and a dark mask around the eyes.
      for (const e of eyes) { const d = p.distanceTo(e); if (d < 0.035) colorLerp(o, o.getHex(), 0x1e1814, 1 - d / 0.035); }
      o.multiplyScalar(0.85 + 0.3 * noise3(p.x * 70, p.y * 70, p.z * 70, 8));
    },
    fn: (p) => { p.y += 0.02; for (const e of eyes) { const d = p.distanceTo(e); if (d < 0.03) p.lerp(e, (1 - d / 0.03) * 0.45); } },
  });
  // Long muzzle with a stop at the brow; flat underneath where the lips run.
  const snout = sweep({
    points: [V(0, 0.022, 0.02), V(0, 0.002, 0.15), V(0, -0.01, 0.255)], seg: 12, radial: 12, hint: V(0, 1, 0),
    radius: prof([[0, 0.062, 0.058], [0.45, 0.042, 0.038], [1, 0.03, 0.026]]),
    shape: (t, a) => (Math.sin(a) < -0.2 ? 0.78 : 1),
    color: (o, t, a, p) => {
      const s = Math.sin(a);
      o.set(s > 0.4 ? MUZZLE : s > -0.25 ? PALE : PALE);
      if (s < -0.15 && s > -0.75) colorLerp(o, o.getHex(), LIP, smooth((0.35 - Math.abs(s + 0.45)) / 0.2));
      if (t > 0.88) colorLerp(o, o.getHex(), NOSE, smooth((t - 0.88) / 0.07));
      o.multiplyScalar(0.85 + 0.3 * noise3(p.x * 80, p.y * 80, p.z * 80, 9));
    },
    capRound: 0.55, tile: 0.1,
  });
  const nose = blob({ r: 1, sx: 0.021, sy: 0.016, sz: 0.015, ws: 10, hs: 8, color: solidC(NOSE), fn: (p) => { p.y += 0.008; p.z += 0.262; } });
  // Cheek ruff sweeping back and out below the ears.
  const cheeks = [];
  for (const x of [1, -1]) {
    for (let i = 0; i < 6; i++) {
      const y = -0.035 + i * 0.012, z = -0.01 - i * 0.008;
      cheeks.push(tuft(0.04 + 0.01 * (i % 2), 0.014, [x * 0.8, -0.25, -0.75], [x * 0.066, y, z], i < 3 ? PALE : FLANK));
    }
  }
  return merge([cran, snout, nose, ...cheeks]);
}

function jawGeo() {
  const jaw = sweep({
    points: [V(0, 0, -0.02), V(0, -0.012, 0.12), V(0, -0.006, 0.23)], seg: 10, radial: 10, hint: V(0, 1, 0),
    radius: prof([[0, 0.048, 0.028], [0.5, 0.034, 0.022], [1, 0.024, 0.016]]),
    color: (o, t, a) => { const s = Math.sin(a); o.set(s > 0.35 ? GUM : s > -0.1 ? LIP : PALE); },
    capRound: 0.5, tile: 0.1,
  });
  // A beard of pale fur under the chin.
  const beard = [0, 1, 2, 3].map((i) => tuft(0.04, 0.014, [0, -0.6, -0.8], [(i - 1.5) * 0.012, -0.022, 0.02 + i * 0.025], PALE, [0, 0, -1]));
  return merge([jaw, ...beard]);
}

function eyesGeo() {
  return merge([1, -1].map((x) => blob({
    r: 0.014, ws: 12, hs: 10,
    // Gold iris around a big black pupil, almost no white.
    color: (o, dy, a) => { const d = Math.hypot(a, dy); o.set(d < 0.28 ? 0x050302 : d < 0.75 ? 0xc89a2a : 0x2a1a0e); },
    fn: (p) => { p.applyAxisAngle(V(0, 1, 0), x * 0.7); p.add(V(x * 0.044, 0.03, 0.058)); },
  })));
}

// Leg segment: a furred upper limb or a lean lower one, paler down the front.
function legGeo(len, r0, r1, { belly = 0, fur = 0.1, back = 1.2, col = LEG, dark = FLANK } = {}) {
  const ragged = shag(fur, 18, 4);
  return sweep({
    points: [V(0, 0.04, 0), V(0, -len * 0.5, 0.004), V(0, -len - 0.01, 0)], seg: 8, radial: 10,
    radius: (t) => { const r = lerp(r0, r1, t) + belly * Math.sin(PI * clamp(t * 1.4, 0, 1)); return [r * 0.85, r]; },
    shape: (t, a) => (Math.sin(a) < 0 ? back : 1) * ragged(t, a),
    color: (o, t, a, p) => { colorLerp(o, col, dark, smooth((0.5 - t) / 0.5) * 0.8); o.multiplyScalar(0.85 + 0.3 * noise3(p.x * 50, p.y * 50, p.z * 50, 7)); },
    tile: 0.1,
  });
}

function pawGeo() {
  const parts = [blob({ r: 1, sx: 0.034, sy: 0.024, sz: 0.044, ws: 10, hs: 7, color: (o, dy) => o.set(dy < -0.4 ? 0x1a1614 : LEG), fn: (p) => { p.z += 0.02; p.y -= 0.012; } })];
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.016, z = 0.05 + (i === 1 || i === 2 ? 0.012 : 0);
    parts.push(blob({ r: 0.013, ws: 6, hs: 5, color: solidC(0x7a6c5c), fn: (p) => { p.x += x; p.y -= 0.02; p.z += z; } }));
    parts.push(xf(spike({ len: 0.022, r: 0.005, curve: 0.5, dir: [0, -0.5, 1], bend: [0, -1, 0], radial: 4, seg: 3, color: solidC(0x141010) }), [x, -0.024, z + 0.008]));
  }
  return merge(parts);
}

// Hackles: tufts along the back, bases at y = 0 so scaling Y stands them up.
function hackles(n, z0, dz, len) {
  return merge(Array.from({ length: n }, (_, i) => {
    const k = Math.sin(((i + 0.5) / n) * PI);
    return tuft(len * (0.6 + 0.4 * k), 0.02 + 0.01 * k, [(i % 2 ? 0.15 : -0.15), 1, -0.9], [0, 0, z0 - i * dz], i % 3 ? SADDLE : 0x2a241f, [0, 0, -1]);
  }));
}

function assets() {
  return cached('wolf', () => {
    const A = {};
    // Hindquarters (pelvis space, origin = hip joints): lean, tucked belly.
    A.pelvis = merge([
      sweep({
        points: [V(0, 0.03, -0.17), V(0, 0.05, -0.06), V(0, 0.05, 0.1), V(0, 0.06, 0.24), V(0, 0.07, 0.36)], seg: 16, radial: 16, hint: V(0, 1, 0),
        radius: prof([[0, 0.05, 0.05], [0.18, 0.105, 0.11], [0.45, 0.11, 0.12], [0.75, 0.085, 0.095], [1, 0.08, 0.09]]),
        shape: (t, a) => (Math.sin(a) < -0.3 && t > 0.55 ? 0.82 : 1) * shag(0.14, 30, 1)(t, a),
        color: coatC(), tile: 0.1,
      }),
      // Shaggy breeches at the back of the thighs.
      ...[1, -1].flatMap((x) => [0, 1, 2].map((i) => tuft(0.07, 0.022, [x * 0.3, -0.7, -0.6], [x * 0.085, -0.05 - i * 0.03, -0.1 + i * 0.02], FLANK))),
    ]);
    // Deep, narrow chest (thorax space), shoulders and a ragged belly fringe.
    const chest = sweep({
      points: [V(0, 0.06, -0.42), V(0, 0.0, -0.25), V(0, -0.05, -0.02), V(0, -0.05, 0.15), V(0, -0.02, 0.27), V(0, 0.0, 0.34)], seg: 22, radial: 18, hint: V(0, 1, 0),
      radius: prof([[0, 0.085, 0.09], [0.18, 0.11, 0.14], [0.45, 0.125, 0.19], [0.7, 0.12, 0.19], [0.88, 0.11, 0.15], [1, 0.08, 0.1]]),
      shape: shag(0.16, 34, 2),
      color: coatC(), tile: 0.1,
    });
    const fringe = [];
    for (let i = 0; i < 6; i++) {
      for (const x of [1, -1]) fringe.push(tuft(0.035 + 0.012 * ((i * 7) % 3), 0.018, [x * 0.4, -1, -0.7], [x * 0.06, -0.205 + 0.04 * (i / 5), 0.16 - i * 0.07], FLANK, [0, 0, -1]));
    }
    A.chest = merge([chest, ...fringe]);
    // Thick neck and ruff (neck space).
    // A ragged fringe of the ruff hanging under the throat.
    const ruff = [];
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 0.022;
      ruff.push(tuft(0.05 + 0.02 * noise3(i * 1.7, 0.3, 0.5, 14), 0.016, [x * 4, -1, -0.45], [x, -0.1 + Math.abs(x) * 0.6, -0.02 + 0.03 * (i % 2)], PALE, [0, 0, -1]));
    }
    A.neck = merge([
      sweep({
        points: [V(0, -0.07, -0.12), V(0, 0.05, 0.05), V(0, 0.16, 0.17)], seg: 10, radial: 14, hint: V(0, 0, 1),
        radius: prof([[0, 0.12, 0.15], [0.6, 0.092, 0.105], [1, 0.068, 0.074]]),
        shape: shag(0.26, 22, 3),
        // Hinted along +Z here, so sin(a) > 0 is the throat.
        color: (o, t, a, p) => coat(o, t, a + PI, p), tile: 0.1,
      }),
      ...ruff,
    ]);
    A.head = headGeo();
    A.jaw = jawGeo();
    A.teethU = merge([
      ...teethRow(1, [0.09, 0.12, 0.15, 0.18, 0.21, 0.24], [0.012, 0.013, 0.014, 0.016, 0.014, 0.038], -0.03, -1),
      ...teethRow(-1, [0.09, 0.12, 0.15, 0.18, 0.21, 0.24], [0.012, 0.013, 0.014, 0.016, 0.014, 0.038], -0.03, -1),
    ]);
    A.teethL = merge([
      ...teethRow(1, [0.07, 0.1, 0.13, 0.16, 0.19, 0.22], [0.011, 0.012, 0.013, 0.014, 0.013, 0.032], 0.012, 1),
      ...teethRow(-1, [0.07, 0.1, 0.13, 0.16, 0.19, 0.22], [0.011, 0.012, 0.013, 0.014, 0.013, 0.032], 0.012, 1),
    ]);
    A.eyes = eyesGeo();
    A.earL = earGeo();
    A.earR = mirrorX(A.earL);
    A.thigh = legGeo(0.28, 0.08, 0.036, { belly: 0.03, fur: 0.18, back: 1.4, col: FLANK, dark: SADDLE });
    A.tibia = legGeo(0.3, 0.04, 0.019, { belly: 0.012, fur: 0.12, back: 1.5 });
    A.meta = legGeo(0.18, 0.018, 0.015, { fur: 0, back: 1.2 });
    A.humerus = legGeo(0.2, 0.05, 0.03, { belly: 0.016, fur: 0.16, back: 1.4, col: FLANK, dark: SADDLE });
    A.fore = legGeo(0.28, 0.03, 0.019, { belly: 0.006, fur: 0.1, back: 1.3 });
    A.metaF = legGeo(0.12, 0.017, 0.015, { fur: 0, back: 1.1 });
    A.paw = pawGeo();
    // Bushy tail, darkest at the tip.
    A.tail = [0, 1, 2].map((i) => {
      const r0 = [0.035, 0.058, 0.062][i], r1 = [0.058, 0.062, 0.016][i];
      return sweep({
        points: [V(0, 0, 0.02), V(0, 0, i === 2 ? -0.2 : -0.16)], seg: 6, radial: 10, hint: V(0, 1, 0),
        radius: (t) => lerp(r0, r1, i === 2 ? t * t : t),
        shape: shag(0.3, 18, 10 + i),
        color: (o, t, a, p) => { coat(o, t, a, p, { belly: FLANK }); if (i === 2) colorLerp(o, o.getHex(), 0x15110e, smooth((t - 0.35) / 0.5)); },
        tile: 0.1, capRound: i === 2 ? 0.6 : 0.35,
      });
    });
    A.spinesT = hackles(7, 0.3, 0.075, 0.1);
    A.spinesP = hackles(4, 0.32, 0.07, 0.07);
    return A;
  });
}

export function buildWolf() {
  return buildQuadruped(assets(), { name: 'wolf', skin: 'fur', hackles: 'fur', ears: { x: 0.046, y: 0.072, z: -0.028 }, eyeColor: 0xe0b040, killGlow: 0.55 });
}
