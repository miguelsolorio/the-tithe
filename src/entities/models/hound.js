import * as THREE from 'three';
import {
  mesh, pivot, hit, instMats, cached, normState, progress, colorLerp, COL,
  sweep, blob, prof, merge, xf, mirrorX, spike,
  Rig, Animator, ik2, clamp, lerp, smooth, ramp, easeOut, easeIn, wobble, fbm3, PI, TAU,
} from './common.js';

// Horned hound: skinless dog, glossy muscle and white tendons, ribs showing,
// curled ram horns, lipless jaws. Extra state 'sniff' (idle variant).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MUS = 0x8e1820, MUS_D = 0x3e060b, TEN = 0xd8c6ae, BONE = 0xd8ccb0, GUM = 0x6a1219;

// Muscle colour with a little mottling, optional tendon tint.
const mcol = (k = 0.45, base = MUS) => (o, t, a, p) => colorLerp(o, base, MUS_D, clamp(0.45 + fbm3(p.x * 11, p.y * 11, p.z * 11, 2, 3) * 1.4, 0, 1) * k);
const solidC = (c) => (o) => o.set(c);

// Leg dimensions (hind: femur, tibia, metatarsus; front: humerus, forearm, metacarpus).
const HL = [0.28, 0.3, 0.18], FL = [0.2, 0.28, 0.12];

function pawGeo() {
  const parts = [blob({ r: 1, sx: 0.03, sy: 0.022, sz: 0.04, ws: 10, hs: 7, color: mcol(0.6, 0x7a1a1e), fn: (p) => { p.z += 0.02; p.y -= 0.012; } })];
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.014, z = 0.045 + (i === 1 || i === 2 ? 0.012 : 0);
    parts.push(blob({ r: 0.012, ws: 6, hs: 5, color: solidC(0x7a2024), fn: (p) => { p.x += x; p.y -= 0.02; p.z += z; } }));
    parts.push(xf(spike({ len: 0.028, r: 0.006, curve: 0.5, dir: [0, -0.3, 1], bend: [0, -1, 0], radial: 4, seg: 3, color: solidC(0x120a08) }), [x, -0.022, z + 0.008]));
  }
  return merge(parts);
}

// Upper leg segment with a muscle belly and a pale tendon strip.
function limbGeo(len, r0, r1, belly, back = 1.3, tendon = true) {
  const parts = [sweep({
    points: [V(0, 0.04, 0), V(0, -len * 0.5, 0.004), V(0, -len - 0.01, 0)], seg: 8, radial: 10,
    radius: (t) => { const r = lerp(r0, r1, t) + belly * Math.sin(PI * clamp(t * 1.4, 0, 1)); return [r * 0.85, r]; },
    shape: (t, a) => (Math.sin(a) < 0 ? back : 1),
    color: (o, t, a, p) => { mcol(0.5)(o, t, a, p); if (t > 0.78) colorLerp(o, o.getHex(), TEN, smooth((t - 0.78) / 0.2) * 0.8); },
    tile: 0.12,
  })];
  if (tendon) {
    parts.push(sweep({ points: [V(0.006, -len * 0.35, -r0 * 0.9), V(0.004, -len * 0.7, -r1 * 1.3), V(0, -len, -r1 * 0.6)], seg: 6, radial: 5, radius: 0.0065, color: solidC(TEN), tile: 0.1 }));
  }
  return merge(parts);
}

function lowerGeo(len, r) {
  return merge([
    sweep({ points: [V(0, 0.02, 0), V(0, -len, 0)], seg: 4, radial: 7, radius: (t) => r * (1 - 0.25 * t), color: (o, t, a) => colorLerp(o, TEN, 0x9a4a42, Math.sin(a) > 0.3 ? 0.4 : 0), tile: 0.1 }),
    sweep({ points: [V(0, 0.0, -r * 0.8), V(0, -len * 0.9, -r * 0.7)], seg: 3, radial: 4, radius: r * 0.35, color: solidC(0xece0cc), tile: 0.1 }),
  ]);
}

function hornGeo() {
  const pts = [V(0.04, 0.07, -0.005), V(0.085, 0.14, -0.075), V(0.14, 0.125, -0.18), V(0.175, 0.025, -0.215), V(0.195, -0.075, -0.15), V(0.205, -0.1, -0.045), V(0.2, -0.045, 0.03)];
  return sweep({
    points: pts, seg: 30, radial: 9, radius: (t) => 0.044 * (1 - t * 0.78) + 0.002, hint: V(1, 0, 0),
    shape: (t, a) => 1 + 0.12 * Math.cos(a * 3),
    color: (o, t) => colorLerp(o, 0x2e261e, 0xb4a488, smooth(t * 1.3)), tile: 0.06, capRound: 0.2,
  });
}

function headGeo() {
  const eyes = [V(0.046, 0.028, 0.055), V(-0.046, 0.028, 0.055)];
  const cran = blob({
    r: 1, sx: 0.07, sy: 0.066, sz: 0.085, ws: 16, hs: 12, noise: 0.05, freq: 6,
    color: (o, dy, a, p) => { mcol(0.5)(o, 0, 0, p); if (dy > 0.55) colorLerp(o, o.getHex(), BONE, smooth((dy - 0.55) / 0.3) * 0.7); },
    fn: (p) => { p.y += 0.02; for (const e of eyes) { const d = p.distanceTo(e); if (d < 0.03) p.lerp(e, (1 - d / 0.03) * 0.5); } },
  });
  const snout = sweep({
    points: [V(0, 0.01, 0.04), V(0, -0.004, 0.16), V(0, -0.018, 0.27)], seg: 10, radial: 12, hint: V(0, 1, 0),
    radius: prof([[0, 0.05, 0.05], [0.5, 0.037, 0.036], [1, 0.028, 0.026]]),
    shape: (t, a) => (Math.sin(a) < -0.2 ? 0.7 : 1),
    color: (o, t, a, p) => {
      mcol(0.4, 0x9a2228)(o, t, a, p);
      if (Math.sin(a) > 0.5) colorLerp(o, o.getHex(), BONE, 0.75 * smooth((t - 0.1) / 0.3));
      if (Math.sin(a) < -0.3) colorLerp(o, o.getHex(), GUM, 0.7);
      if (t > 0.93) o.set(0x140606);
    },
    capRound: 0.5, tile: 0.1,
  });
  // Neck muscle cords reaching into the cheeks.
  const cheek = [1, -1].map((x) => sweep({ points: [V(x * 0.05, -0.02, -0.02), V(x * 0.045, -0.035, 0.06), V(x * 0.035, -0.03, 0.12)], seg: 6, radial: 6, radius: (t) => 0.022 * (1 - t * 0.6), color: mcol(0.3, 0xa0262c), tile: 0.1 }));
  return merge([cran, snout, ...cheek]);
}

function teethRow(side, zs, lens, y, dirY) {
  const parts = [];
  zs.forEach((z, i) => {
    const len = lens[i];
    const g = spike({ len, r: len * 0.28, curve: 0.25, dir: [0, dirY, 0.25], bend: [0, 0, -1], radial: 5, seg: 3, color: (o) => o.set(i === lens.length - 1 ? 0xd8cca8 : 0xcfc09a) });
    parts.push(xf(g, [side * lerp(0.028, 0.02, i / zs.length), y, z]));
  });
  return parts;
}

function jawGeo() {
  const jaw = sweep({
    points: [V(0, 0, -0.02), V(0, -0.012, 0.12), V(0, -0.005, 0.235)], seg: 10, radial: 10, hint: V(0, 1, 0),
    radius: prof([[0, 0.045, 0.028], [0.5, 0.032, 0.022], [1, 0.022, 0.016]]),
    color: (o, t, a, p) => { mcol(0.4)(o, t, a, p); if (Math.sin(a) > 0.3) colorLerp(o, o.getHex(), GUM, 0.7); if (Math.sin(a) < -0.5) colorLerp(o, o.getHex(), BONE, 0.5); },
    capRound: 0.5, tile: 0.1,
  });
  return jaw;
}

function assets() {
  return cached('hound', () => {
    const A = {};
    // Hindquarters (pelvis space, origin = hip joints).
    A.pelvis = merge([
      sweep({
        points: [V(0, 0.02, -0.15), V(0, 0.04, -0.05), V(0, 0.03, 0.1), V(0, 0.06, 0.24), V(0, 0.07, 0.34)], seg: 14, radial: 16, hint: V(0, 1, 0),
        radius: prof([[0, 0.05, 0.05], [0.18, 0.1, 0.1], [0.45, 0.115, 0.115], [0.75, 0.09, 0.085], [1, 0.08, 0.075]]),
        shape: (t, a) => 1 + 0.08 * Math.max(0, Math.sin(a)) * Math.sin(Math.cos(a) * 8),
        color: mcol(0.55), tile: 0.12,
      }),
      ...[0, 1, 2, 3, 4].map((i) => blob({ r: 0.02, sx: 0.8, sy: 0.9, sz: 1.2, ws: 6, hs: 5, color: solidC(BONE), fn: (p) => { p.y += 0.12 + (i === 0 ? 0 : 0.005); p.z += 0.3 - i * 0.075; } })),
    ]);
    // Ribcage / chest (thorax space).
    const chest = sweep({
      points: [V(0, 0.05, -0.42), V(0, -0.02, -0.25), V(0, -0.06, -0.02), V(0, -0.05, 0.15), V(0, -0.02, 0.27), V(0, 0.0, 0.33)], seg: 20, radial: 18, hint: V(0, 1, 0),
      radius: prof([[0, 0.08, 0.085], [0.18, 0.11, 0.15], [0.45, 0.128, 0.19], [0.7, 0.125, 0.185], [0.88, 0.1, 0.13], [1, 0.06, 0.07]]),
      color: (o, t, a, p) => { colorLerp(o, 0x5a0a10, 0x2a0306, clamp(0.5 + fbm3(p.x * 14, p.y * 14, p.z * 14, 2, 8), 0, 1)); if (Math.sin(a) > 0.55) mcol(0.4)(o, t, a, p); },
      tile: 0.12,
    });
    const ribs = [];
    for (let i = 0; i < 9; i++) {
      const z = -0.26 + i * 0.058;
      const rl = 0.12 + 0.012 * Math.sin((i / 8) * PI), rv = 0.16 + 0.035 * Math.sin((i / 8) * PI);
      const cy = -0.045;
      for (const side of [1, -1]) {
        const pts = [];
        const top = 1.0 - (i % 3) * 0.12;
        for (let k = 0; k <= 6; k++) {
          const b = lerp(top, -1.15, k / 6);
          pts.push(V(side * rl * Math.cos(b) * 1.015, cy + rv * Math.sin(b) * 1.01, z - 0.05 * (k / 6) - 0.01));
        }
        const rc = (o, t) => colorLerp(o, 0x6a1218, i % 2 ? 0xc9b595 : 0xb8a282, smooth(t / 0.2) * (1 - 0.6 * smooth((t - 0.8) / 0.2)));
        ribs.push(sweep({ points: pts, seg: 10, radial: 5, radius: (t) => 0.0068 * (1 - 0.3 * t), color: rc, tile: 0.1 }));
      }
    }
    const shoulders = [1, -1].map((x) => blob({ r: 1, sx: 0.045, sy: 0.12, sz: 0.085, ws: 10, hs: 8, color: mcol(0.45), fn: (p) => { p.x += x * 0.1; p.y -= 0.03; p.z += 0.14; } }));
    const spines = [0, 1, 2, 3, 4, 5].map((i) => blob({ r: 0.016, sx: 0.55, sy: 1.2, sz: 1.1, ws: 6, hs: 5, color: (o, dy) => colorLerp(o, 0x7a2a26, 0xc8b490, smooth(dy)), fn: (p) => { p.y += 0.128 + 0.03 * Math.sin((i / 5) * PI); p.z += 0.2 - i * 0.1; } }));
    A.chest = merge([chest, ...ribs, ...shoulders, ...spines]);
    // Neck (neck space), from the chest up/forward to the head.
    A.neck = merge([
      sweep({ points: [V(0, -0.06, -0.1), V(0, 0.05, 0.06), V(0, 0.16, 0.18)], seg: 10, radial: 12, hint: V(0, 0, 1), radius: prof([[0, 0.1, 0.12], [0.6, 0.07, 0.075], [1, 0.058, 0.06]]), color: mcol(0.5), tile: 0.12 }),
      ...[1, -1].map((x) => sweep({ points: [V(x * 0.07, -0.08, -0.02), V(x * 0.06, 0.04, 0.1), V(x * 0.04, 0.14, 0.21)], seg: 8, radial: 6, radius: (t) => 0.022 * (1 - 0.3 * t), color: mcol(0.2, 0xa8282e), tile: 0.1 })),
      sweep({ points: [V(0, -0.1, 0.0), V(0, -0.03, 0.1), V(0, 0.05, 0.17)], seg: 8, radial: 6, radius: 0.014, color: (o, t) => colorLerp(o, 0xc8a898, 0x8a3a38, Math.sin(t * 50) > 0.2 ? 0.2 : 0.7), tile: 0.1 }),
    ]);
    A.head = headGeo();
    A.jaw = jawGeo();
    A.teethU = merge([
      ...teethRow(1, [0.09, 0.12, 0.15, 0.18, 0.21, 0.235], [0.014, 0.016, 0.018, 0.02, 0.018, 0.048], -0.03, -1),
      ...teethRow(-1, [0.09, 0.12, 0.15, 0.18, 0.21, 0.235], [0.014, 0.016, 0.018, 0.02, 0.018, 0.048], -0.03, -1),
    ]);
    A.teethL = merge([
      ...teethRow(1, [0.07, 0.1, 0.13, 0.16, 0.19, 0.215], [0.012, 0.014, 0.016, 0.017, 0.016, 0.04], 0.012, 1),
      ...teethRow(-1, [0.07, 0.1, 0.13, 0.16, 0.19, 0.215], [0.012, 0.014, 0.016, 0.017, 0.016, 0.04], 0.012, 1),
    ]);
    A.eyes = merge([1, -1].map((x) => blob({
      r: 0.015, ws: 12, hs: 10,
      color: (o, dy, a) => { const d = Math.hypot(a, dy); o.set(d < 0.2 ? 0x080302 : d < 0.55 ? 0x8a6a18 : 0xd6c8a0); if (d > 1.0) colorLerp(o, 0xd6c8a0, 0x8a2226, 0.6); },
      fn: (p) => { p.applyAxisAngle(V(0, 1, 0), x * 0.85); p.add(V(x * 0.046, 0.028, 0.055)); },
    })));
    const hornL = hornGeo();
    A.horns = merge([hornL, mirrorX(hornL)]);
    A.thigh = limbGeo(HL[0], 0.07, 0.035, 0.03, 1.4);
    A.tibia = limbGeo(HL[1], 0.04, 0.018, 0.02, 1.6);
    A.meta = lowerGeo(HL[2], 0.016);
    A.humerus = limbGeo(FL[0], 0.055, 0.03, 0.02, 1.5);
    A.fore = limbGeo(FL[1], 0.03, 0.017, 0.008, 1.1);
    A.metaF = lowerGeo(FL[2], 0.015);
    A.paw = pawGeo();
    A.tail = [0, 1, 2].map((i) => {
      const r0 = 0.024 - i * 0.006, r1 = r0 - 0.006;
      return merge([
        sweep({ points: [V(0, 0, 0.01), V(0, 0, -0.15)], seg: 5, radial: 7, radius: (t) => lerp(r0, r1, t), color: mcol(0.5), tile: 0.1 }),
        ...[0, 1, 2].map((k) => blob({ r: r0 * 0.7, ws: 6, hs: 4, color: solidC(BONE), fn: (p) => { p.y += r0 * 0.75; p.z -= 0.03 + k * 0.045; } })),
      ]);
    });
    return A;
  });
}

const TIMINGS = {
  attack: { duration: 0.6, hit: 0.3 },
  notice: { duration: 0.8 },
  hurt: { duration: 0.35 },
  death: { duration: 1.3 },
};

// Neutral paw positions (body space) and gait phase offsets [HL, HR, FL, FR].
const NEUTRAL = [V(0.085, 0.035, -0.5), V(-0.085, 0.035, -0.5), V(0.1, 0.035, 0.33), V(-0.1, 0.035, 0.33)];
const WALK_OFF = [0, 0.5, 0.25, 0.75];
const GALLOP_OFF = [0, 0.1, 0.6, 0.5];
const LEGS = ['pawHL', 'pawHR', 'pawFL', 'pawFR'];

const walkStride = (v) => clamp(0.6 + v * 0.4, 0.7, 1.6);
const runStride = (v) => clamp(1.3 + v * 0.2, 1.8, 3.4);

export function buildHound() {
  const A = assets();
  const M = instMats();
  const flesh = M.get('flesh'), teeth = M.get('teeth'), horn = M.get('horn'), eye = M.get('eye');
  const root = new THREE.Group();
  root.name = 'hound';
  const body = pivot(root, 0, 0, 0, 'body');
  const spine = pivot(body, 0, 0.74, -0.15, 'spine');
  const hingeP = pivot(spine, 0, 0, 0, 'hingeP');
  const hingeT = pivot(spine, 0, 0, 0, 'hingeT');
  const pelvis = pivot(hingeP, 0, -0.02, -0.3, 'pelvis');
  const thorax = pivot(hingeT, 0, -0.02, 0.3, 'thorax');
  const neck = pivot(thorax, 0, 0.1, 0.28, 'neck');
  const head = pivot(neck, 0, 0.19, 0.2, 'head');
  const jaw = pivot(head, 0, -0.035, 0.02, 'jaw');
  mesh(A.pelvis, flesh, pelvis);
  mesh(A.chest, flesh, thorax);
  mesh(A.neck, flesh, neck);
  mesh(A.head, flesh, head);
  mesh(A.teethU, teeth, head);
  mesh(A.eyes, eye, head);
  mesh(A.horns, horn, head);
  mesh(A.jaw, flesh, jaw);
  mesh(A.teethL, teeth, jaw);

  const legs = [];
  for (let i = 0; i < 4; i++) {
    const front = i >= 2, side = i % 2 === 0 ? 1 : -1;
    const L = front ? FL : HL;
    const up = front ? pivot(thorax, side * 0.1, -0.1, 0.14) : pivot(pelvis, side * 0.085, -0.02, 0);
    const mid = pivot(up, 0, -L[0], 0), low = pivot(mid, 0, -L[1], 0), paw = pivot(low, 0, -L[2], 0);
    mesh(front ? A.humerus : A.thigh, flesh, up);
    mesh(front ? A.fore : A.tibia, flesh, mid);
    mesh(front ? A.metaF : A.meta, flesh, low);
    mesh(A.paw, flesh, paw);
    legs.push({ up, mid, low, paw, L, front, hinge: front ? hingeT : hingeP, bend: front ? -1 : 1, tilt: front ? 0.15 : 0.28 });
  }
  const tail = [];
  let tp = pelvis;
  for (let i = 0; i < 3; i++) {
    tp = pivot(tp, 0, i === 0 ? 0.05 : 0, i === 0 ? -0.14 : -0.15, 'tail' + i);
    mesh(A.tail[i], flesh, tp);
    tail.push(tp);
  }

  const rig = new Rig();
  rig.add('body', body, true);
  rig.add('spine', spine, true);
  rig.add('hingeP', hingeP);
  rig.add('hingeT', hingeT);
  rig.add('neck', neck);
  rig.add('head', head);
  rig.add('jaw', jaw);
  tail.forEach((n, i) => rig.add('tail' + i, n));
  const targets = LEGS.map((n) => rig.addVirtual(n));
  rig.finalize();
  const anim = new Animator(rig, { attack: 0.08, hurt: 0.06, notice: 0.1, dead: 0.1, run: 0.25 });
  let phase = 0, t = 0;
  const seed = Math.random() * 50;

  // Paw cycle: stance slides back (planted), swing lifts and folds.
  function paw(r, i, p, duty, stride, lift, fold, amt) {
    p -= Math.floor(p);
    const half = stride * duty * 0.5;
    const n = NEUTRAL[i];
    let z, y = 0, pitch = 0, tilt = 0;
    if (p < duty) {
      const u = p / duty;
      z = half - 2 * half * u;
      pitch = u > 0.6 ? (u - 0.6) * 1.5 : 0;
    } else {
      const u = (p - duty) / (1 - duty);
      z = -half + 2 * half * smooth(u);
      y = lift * Math.sin(PI * u);
      pitch = fold * Math.sin(PI * Math.min(1, u * 1.3));
      tilt = (i >= 2 ? -1.1 : 0.7) * fold * Math.sin(PI * u);
    }
    r.p(LEGS[i], n.x, n.y + y * amt, n.z + z * amt);
    r.r(LEGS[i], pitch * amt, tilt * amt, 0);
  }

  function standPaws(r, spread = 1, dz = 0) {
    for (let i = 0; i < 4; i++) r.p(LEGS[i], NEUTRAL[i].x * spread, NEUTRAL[i].y, NEUTRAL[i].z + (i >= 2 ? dz : -dz * 0.3));
  }

  function tailPose(r, base, sway) {
    r.r('tail0', base, sway, 0);
    r.r('tail1', base * 0.4, sway * 1.4, 0);
    r.r('tail2', base * 0.3, sway * 1.8, 0);
  }

  const POSES = {
    idle(r) {
      const br = Math.sin(t * 5.5);
      standPaws(r);
      r.p('spine', 0, 0.004 * br - 0.02, 0);
      r.r('spine', 0.04, 0, 0);
      r.r('hingeT', 0.015 * br, 0, 0);
      r.r('neck', 0.3 + 0.06 * wobble(t * 0.4, seed), 0.25 * wobble(t * 0.25, seed + 1), 0);
      r.r('head', 0.05, 0, 0.1 * wobble(t * 0.3, seed + 2));
      r.r('jaw', 0.12 + 0.1 * Math.max(0, wobble(t * 1.5, seed + 3)));
      tailPose(r, -0.7, 0.15 * wobble(t * 0.6, seed + 4));
    },
    sniff(r) {
      standPaws(r, 1.05, 0.04);
      const sn = Math.max(0, Math.sin(t * 16)) * (wobble(t * 0.7, seed + 5) > 0 ? 1 : 0);
      r.p('spine', 0, -0.05, 0);
      r.r('spine', 0.12, 0, 0);
      r.r('neck', 0.95, 0.35 * wobble(t * 0.35, seed + 6), 0);
      r.r('head', 0.35 + 0.05 * sn, 0.2 * wobble(t * 0.8, seed + 7), 0);
      r.r('jaw', 0.03 + 0.05 * sn);
      tailPose(r, -0.5, 0.25 * Math.sin(t * 2));
    },
    walk(r, s) {
      const amt = smooth(s.speed / 0.3);
      const stride = walkStride(s.speed);
      for (let i = 0; i < 4; i++) paw(r, i, phase + WALK_OFF[i], 0.62, stride, 0.07, 0.6, amt);
      const c2 = Math.cos(TAU * 2 * phase);
      r.p('spine', 0, 0.012 * c2 * amt - 0.01, 0);
      r.r('spine', 0.03, 0.04 * Math.sin(TAU * phase) * amt, 0.03 * Math.sin(TAU * phase) * amt);
      r.r('neck', 0.3 - 0.03 * c2, -0.05 * Math.sin(TAU * phase), 0);
      r.r('head', 0.05, 0, 0);
      r.r('jaw', 0.15);
      tailPose(r, -0.6, 0.2 * Math.sin(TAU * phase));
    },
    run(r, s) {
      const amt = smooth(s.speed / 0.5);
      const stride = runStride(s.speed);
      for (let i = 0; i < 4; i++) paw(r, i, phase + GALLOP_OFF[i], 0.3, stride, i >= 2 ? 0.2 : 0.17, 1.2, amt);
      const flex = 0.2 * Math.cos(TAU * (phase - 0.95)) * amt;
      r.p('spine', 0, (0.045 * Math.cos(TAU * (phase - 0.75)) - 0.04) * amt, 0);
      r.r('spine', 0.05 * Math.sin(TAU * (phase - 0.2)) * amt, 0, 0);
      r.r('hingeP', -flex, 0, 0);
      r.r('hingeT', flex * 0.7, 0, 0);
      r.r('neck', 0.05 - 0.12 * Math.sin(TAU * (phase - 0.2)) * amt, 0, 0);
      r.r('head', 0.25, 0, 0);
      r.r('jaw', 0.35 + 0.15 * Math.sin(TAU * phase));
      tailPose(r, 0.15 + 0.2 * Math.sin(TAU * phase), 0.1 * Math.sin(TAU * phase));
    },
    notice(r, s) {
      const st = s.stateTime;
      const a = easeOut(st / 0.15), b = ramp(0.15, 0.55, st);
      standPaws(r, 1.1, 0.05 * b);
      r.p('spine', 0, -0.09 * b, -0.04 * b);
      r.r('spine', 0.05 * b, 0, 0);
      r.r('hingeP', -0.08 * b, 0, 0);
      r.r('neck', lerp(0.3, -0.15, a) + 0.3 * b, 0, 0);
      r.r('head', 0.1 * b, 0, 0);
      r.r('jaw', 0.1 + 0.45 * b + 0.05 * Math.sin(t * 30) * b);
      tailPose(r, lerp(-0.6, 0.3, a), 0);
    },
    attack(r, s) {
      const tt = progress(s, TIMINGS.attack.duration) * TIMINGS.attack.duration;
      const crouch = smooth(tt / 0.12) * (1 - smooth((tt - 0.12) / 0.08));
      const lunge = easeOut((tt - 0.1) / 0.18) * (1 - smooth((tt - 0.36) / 0.24));
      const open = smooth((tt - 0.08) / 0.14) * (1 - easeIn((tt - 0.24) / 0.06));
      standPaws(r, 1.08, 0);
      for (const i of [2, 3]) r.pa(LEGS[i], 0, 0.14 * lunge * (1 - lunge * 0.4), 0.28 * lunge);
      for (const i of [0, 1]) r.pa(LEGS[i], 0, 0, 0.08 * lunge);
      r.p('spine', 0, -0.1 * crouch + 0.06 * lunge, 0.32 * lunge - 0.05 * crouch);
      r.r('spine', 0.1 * crouch - 0.12 * lunge, 0, 0);
      r.r('hingeP', -0.12 * crouch + 0.08 * lunge, 0, 0);
      r.r('neck', 0.35 * crouch - 0.2 * lunge + 0.2, 0, 0);
      r.r('head', 0.1 - 0.35 * open, 0, 0);
      r.r('jaw', 0.05 + 0.85 * open);
      tailPose(r, 0.2 * lunge - 0.3, 0);
    },
    hurt(r, s) {
      POSES.idle(r);
      const k = Math.sin(PI * clamp(s.stateTime / 0.35, 0, 1));
      r.pa('spine', 0.05 * k, -0.04 * k, -0.05 * k);
      r.ra('spine', -0.1 * k, 0.2 * k, 0.12 * k);
      r.ra('neck', -0.5 * k, 0.3 * k, 0);
      r.ra('jaw', 0.5 * k);
    },
    dead(r, s) {
      const st = s.stateTime;
      const buckle = smooth(st / 0.35), roll = easeIn((st - 0.2) / 0.6), settle = smooth((st - 0.8) / 0.5);
      const bounce = Math.sin(PI * clamp((st - 0.8) / 0.25, 0, 1)) * 0.05;
      r.p('body', 0.72 * roll, 0.17 * roll + bounce, 0);
      r.r('body', 0, 0, (PI / 2) * roll - bounce);
      r.p('spine', 0, -0.22 * buckle * (1 - roll), 0);
      for (let i = 0; i < 4; i++) {
        const n = NEUTRAL[i];
        const stretch = settle * (i >= 2 ? 0.12 : -0.1);
        r.p(LEGS[i], n.x * (1 + 0.6 * roll), n.y + 0.05 * roll * (i % 2 ? 1 : 0.5), n.z + stretch);
        r.r(LEGS[i], 0.3 * roll, 0, 0);
      }
      r.r('hingeP', -0.1 * settle, 0, 0);
      r.r('hingeT', 0.05 * settle, 0, 0);
      r.r('neck', lerp(0.6 * buckle, 0.1, roll), 0, 0);
      r.r('head', 0.2 * (1 - roll), 0, -0.15 * settle);
      r.r('jaw', 0.25 + 0.2 * settle);
      tailPose(r, -0.3, 0.2 * settle);
    },
  };

  const _h = new THREE.Vector3();
  const _mP = new THREE.Matrix4(), _mT = new THREE.Matrix4();
  const _ik = [0, 0];
  function solveLegs() {
    spine.updateMatrix(); hingeP.updateMatrix(); hingeT.updateMatrix(); pelvis.updateMatrix(); thorax.updateMatrix();
    _mP.multiplyMatrices(spine.matrix, hingeP.matrix).multiply(pelvis.matrix).invert();
    _mT.multiplyMatrices(spine.matrix, hingeT.matrix).multiply(thorax.matrix).invert();
    for (let i = 0; i < 4; i++) {
      const L = legs[i], tg = targets[i];
      const tilt = L.tilt + tg.rotation.y;
      const l3 = L.L[2];
      _h.set(tg.position.x, tg.position.y + l3 * Math.cos(tilt), tg.position.z - l3 * Math.sin(tilt));
      _h.applyMatrix4(L.front ? _mT : _mP).sub(L.up.position);
      ik2(L.L[0], L.L[1], _h.z, _h.y, L.bend, _ik);
      L.up.rotation.set(_ik[0], 0, 0);
      L.mid.rotation.set(_ik[1], 0, 0);
      const rho = spine.rotation.x + L.hinge.rotation.x;
      L.low.rotation.set(-tilt - rho - _ik[0] - _ik[1], 0, 0);
      L.paw.rotation.set(tg.rotation.x + tilt, 0, 0);
    }
  }

  function animate(dt, time, sIn) {
    const s = normState(sIn);
    t = time;
    if (s.state === 'walk') phase += (dt * s.speed) / walkStride(s.speed);
    else if (s.state === 'run') phase += (dt * s.speed) / runStride(s.speed);
    anim.update(dt, s, (r, st) => (POSES[st.state] || POSES.idle)(r, st));
    solveLegs();
    M.step(dt);
  }

  return {
    root, height: 0.9, radius: 0.4,
    hitSpheres: [
      hit(head, 0, 0.0, 0.1, 0.13, 'head'),
      hit(neck, 0, 0.05, 0.06, 0.11, 'body'),
      hit(thorax, 0, -0.04, 0.02, 0.2, 'body'),
      hit(pelvis, 0, 0.03, 0.08, 0.16, 'body'),
      hit(legs[2].mid, 0, -0.12, 0, 0.07, 'limb'),
      hit(legs[3].mid, 0, -0.12, 0, 0.07, 'limb'),
      hit(legs[0].up, 0, -0.12, 0, 0.09, 'limb'),
      hit(legs[1].up, 0, -0.12, 0, 0.09, 'limb'),
    ],
    lights: [],
    timings: TIMINGS,
    states: ['idle', 'sniff', 'walk', 'run', 'notice', 'attack', 'hurt', 'dead'],
    nodes: { head, jaw },
    animate,
    flash: (v) => M.flash(v),
    dispose() { M.dispose(); },
  };
}
