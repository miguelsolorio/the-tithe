import * as THREE from 'three';
import {
  mesh, hit, instMats, cached, normState, progress, colorLerp,
  sweep, blob, prof, merge, xf, mirrorX, spike,
  Rig, Animator, clamp, lerp, smooth, ramp, easeOut, easeIn, wobble, fbm3, PI, TAU,
} from './common.js';
import { humanoidDims, buildHumanoid, rigHumanoid, solveLegs, bipedGait, stand } from './skeleton.js';

// Skinless: flayed, emaciated humanoid. Striated muscle, white tendons,
// lipless teeth, lidless eyes. Hunched sprint with arms swept back.
// Extra state 'scream' (also used for 'notice'): head back, arms spread.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D = humanoidDims({ thigh: 0.47, shin: 0.45, upperArm: 0.31, forearm: 0.29, shoulderX: 0.15, chestY: 0.2 });
const MUS = 0x8e1820, MUS_D = 0x3e060b, TEN = 0xd8c6ae, BONE = 0xd8ccb0, GUM = 0x6a1219;

const mcol = (k = 0.5, base = MUS) => (o, t, a, p) => colorLerp(o, base, MUS_D, clamp(0.45 + fbm3(p.x * 11, p.y * 11, p.z * 11, 2, 3) * 1.4, 0, 1) * k);
const solidC = (c) => (o) => o.set(c);
// Tendon tint near the ends of a limb segment (t in 0..1).
const limbCol = (tTop, tBot) => (o, t, a, p) => {
  mcol(0.5)(o, t, a, p);
  const k = Math.max(smooth((tTop - t) / tTop), smooth((t - tBot) / (1 - tBot)));
  if (k > 0) colorLerp(o, o.getHex(), TEN, k * 0.85);
};

function limb(len, r0, r1, belly, back, tTop = 0.08, tBot = 0.8, front = 1) {
  return sweep({
    points: [V(0, 0.035, 0), V(0, -len * 0.5, 0.005), V(0, -len - 0.01, 0)], seg: 10, radial: 10,
    radius: (t) => { const r = lerp(r0, r1, t) + belly * Math.sin(PI * clamp(t * 1.3, 0, 1)); return [r * 0.88, r]; },
    shape: (t, a) => (Math.sin(a) < 0 ? back : front),
    color: limbCol(tTop, tBot), tile: 0.12,
  });
}

function cord(pts, r, color = TEN) {
  return sweep({ points: pts, seg: 6, radial: 5, radius: (t) => r * (1 - 0.3 * Math.abs(t - 0.5)), color: solidC(color), tile: 0.1 });
}

function handGeo() {
  const parts = [blob({ r: 1, sx: 0.02, sy: 0.05, sz: 0.042, ws: 8, hs: 6, color: mcol(0.4), fn: (p) => { p.y -= 0.045; } })];
  for (let i = 0; i < 4; i++) {
    const z = -0.03 + i * 0.02, len = [0.1, 0.12, 0.115, 0.09][i];
    const pts = [V(0, -0.08, z), V(0.004, -0.08 - len * 0.5, z * 1.1), V(0.016, -0.08 - len, z * 1.15)];
    parts.push(sweep({ points: pts, seg: 6, radial: 5, radius: (t) => 0.0075 - t * 0.002, color: (o, t) => colorLerp(o, 0x9a3a36, TEN, t), tile: 0.1 }));
    parts.push(xf(spike({ len: 0.035, r: 0.0055, curve: 0.4, dir: [0.2, -1, 0], bend: [1, 0, 0], radial: 4, seg: 3, color: solidC(0x1a0e0a) }), [0.016, -0.08 - len, z * 1.15]));
  }
  parts.push(sweep({ points: [V(0.012, -0.03, 0.035), V(0.028, -0.07, 0.045), V(0.034, -0.1, 0.04)], seg: 5, radial: 5, radius: 0.0075, color: mcol(0.3, 0x9a3a36), tile: 0.1 }));
  return merge(parts);
}

function footGeo() {
  const parts = [sweep({ points: [V(0, -0.02, -0.05), V(0, -0.04, 0.07), V(0, -0.055, 0.17)], seg: 8, radial: 9, hint: V(0, 1, 0), radius: prof([[0, 0.032, 0.032], [0.4, 0.036, 0.026], [1, 0.03, 0.012]]), shape: (t, a) => (Math.sin(a) < 0 ? 0.7 : 1), color: (o, t, a) => (Math.sin(a) > 0.3 ? o.set(TEN) : mcol(0.5)(o, t, a, V(t, a, 0))), capRound: 0.6, tile: 0.1 })];
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.013;
    parts.push(sweep({ points: [V(x, -0.055, 0.15), V(x * 1.1, -0.062, 0.2 - Math.abs(i - 1) * 0.008)], seg: 3, radial: 5, radius: 0.007, color: solidC(0x8a3a34), tile: 0.1 }));
  }
  return merge(parts);
}

function headGeo() {
  const sockets = [V(0.034, 0.1, 0.082), V(-0.034, 0.1, 0.082)];
  const cran = blob({
    r: 1, sx: 0.072, sy: 0.1, sz: 0.095, ws: 18, hs: 14, noise: 0.03, freq: 6,
    fn: (p) => {
      p.y += 0.09; p.z += 0.005;
      if (p.z > 0.03 && p.y < 0.07) p.z -= (0.07 - p.y) * 0.35; // narrow the lower face
      for (const s of sockets) { const d = p.distanceTo(s); if (d < 0.03) p.lerp(s, (1 - d / 0.03) * 0.6); }
    },
    color: (o, dy, a, p) => {
      mcol(0.5)(o, 0, 0, p);
      if (dy > 0.45) colorLerp(o, o.getHex(), BONE, smooth((dy - 0.45) / 0.3) * 0.8);
      for (const s of sockets) if (p.distanceTo(s) < 0.022) o.set(0x1a0305);
      if (Math.abs(p.x) < 0.012 && p.y > 0.06 && p.y < 0.085 && p.z > 0.07) o.set(0x0a0203);
    },
  });
  // Upper gum arc + masseters.
  const gum = sweep({ points: [-1.25, -0.6, 0, 0.6, 1.25].map((a) => V(Math.sin(a) * 0.04, 0.042, 0.052 + Math.cos(a) * 0.04)), seg: 10, radial: 6, radius: [0.011, 0.012], color: solidC(GUM), tile: 0.1 });
  const mass = [1, -1].map((x) => cord([V(x * 0.058, 0.08, 0.035), V(x * 0.06, 0.04, 0.03), V(x * 0.052, 0.005, 0.03)], 0.015, 0x9a2228));
  return merge([cran, gum, ...mass]);
}

function teethArc(y, cz, rad, dirY, lens) {
  const parts = [];
  const n = lens.length;
  for (let i = 0; i < n; i++) {
    const a = lerp(-1.2, 1.2, i / (n - 1));
    const len = lens[i];
    parts.push(xf(spike({ len, r: 0.0048, curve: 0.1, dir: [0, dirY, 0.08], radial: 5, seg: 2, color: solidC(i % 3 ? 0xd4c8a6 : 0xc8b890), tip: 0.25 }), [Math.sin(a) * rad, y, cz + Math.cos(a) * rad]));
  }
  return merge(parts);
}

function jawGeo() {
  const arc = [1.35, 0.8, 0, -0.8, -1.35].map((a) => V(Math.sin(a) * 0.05, -0.03 - Math.cos(a) * 0.012, 0.035 + Math.cos(a) * 0.05));
  arc[0].y += 0.03; arc[4].y += 0.03;
  return merge([
    sweep({ points: arc, seg: 12, radial: 7, radius: [0.013, 0.016], color: (o, t, a) => (Math.sin(a) > 0.4 ? o.set(GUM) : colorLerp(o, BONE, 0x7a1a1e, 0.4)), tile: 0.1 }),
    ...[1, -1].map((x) => cord([V(x * 0.05, 0.0, -0.005), V(x * 0.054, 0.04, 0.0)], 0.012, 0x9a2228)),
  ]);
}

function assets() {
  return cached('skinless', () => {
    const A = {};
    A.pelvis = merge([
      sweep({ points: [V(0, -0.13, 0.0), V(0, 0.0, 0.0), V(0, 0.12, 0.012)], seg: 8, radial: 14, radius: prof([[0, 0.12, 0.09], [0.4, 0.15, 0.105], [1, 0.125, 0.085]]), shape: (t, a) => (Math.sin(a) < -0.3 ? 1.12 : 1), color: mcol(0.5), tile: 0.12 }),
      ...[1, -1].map((x) => cord([V(x * 0.1, 0.1, 0.07), V(x * 0.05, -0.02, 0.1), V(x * 0.02, -0.1, 0.07)], 0.009, 0xc8b098)),
    ]);
    A.abdomen = merge([
      sweep({ points: [V(0, -0.07, 0), V(0, 0.1, 0.005), V(0, 0.24, 0.0)], seg: 8, radial: 14, radius: prof([[0, 0.12, 0.085], [0.5, 0.108, 0.075], [1, 0.13, 0.09]]), color: mcol(0.6, 0x7a1018), tile: 0.12 }),
      sweep({ points: [V(0, -0.05, 0.07), V(0, 0.08, 0.075), V(0, 0.21, 0.08)], seg: 12, radial: 8, hint: V(0, 0, 1), radius: [0.052, 0.016], shape: (t, a) => 1 + 0.25 * Math.abs(Math.sin(t * PI * 3)), color: (o, t, a, p) => { mcol(0.3, 0x9a2028)(o, t, a, p); if (Math.abs(p.x) < 0.006 || Math.sin(t * PI * 3) ** 2 < 0.06) o.set(0xc8b098); }, tile: 0.1 }),
    ]);
    const ribCol = (o, t, a, p) => { mcol(0.6, 0x6a0c14)(o, t, a, p); if (Math.abs(Math.cos(a)) > 0.55 && t < 0.62 && Math.sin(t * 46) > 0.35) o.set(0xc8b89a); };
    A.chest = merge([
      sweep({ points: [V(0, -0.14, 0), V(0, 0.05, 0.005), V(0, 0.19, -0.005), V(0, 0.26, 0.01)], seg: 14, radial: 18, radius: prof([[0, 0.13, 0.095], [0.45, 0.155, 0.112], [0.78, 0.17, 0.1], [1, 0.075, 0.065]]), color: ribCol, tile: 0.12 }),
      ...[1, -1].map((x) => blob({ r: 1, sx: 0.07, sy: 0.055, sz: 0.035, ws: 10, hs: 8, color: mcol(0.4), fn: (p) => { p.x += x * 0.07; p.y += 0.1; p.z += 0.085; } })),
      ...[1, -1].map((x) => cord([V(0, 0.2, 0.09), V(x * 0.08, 0.205, 0.07), V(x * 0.16, 0.19, 0.02)], 0.011, BONE)),
      ...[1, -1].map((x) => blob({ r: 1, sx: 0.06, sy: 0.05, sz: 0.06, ws: 8, hs: 6, color: mcol(0.4), fn: (p) => { p.x += x * 0.14; p.y += 0.17; p.z -= 0.01; } })),
      ...[1, -1].map((x) => blob({ r: 1, sx: 0.06, sy: 0.08, sz: 0.018, ws: 8, hs: 6, color: (o) => o.set(0xb8a488), fn: (p) => { p.x += x * 0.08; p.y += 0.1; p.z -= 0.1; } })),
      cord([V(0, -0.12, 0.1), V(0, 0.05, 0.115), V(0, 0.2, 0.095)], 0.012, 0xd0bca0),
    ]);
    A.neck = merge([
      sweep({ points: [V(0, -0.04, 0), V(0, 0.06, 0.01), V(0, 0.14, 0.02)], seg: 6, radial: 10, radius: [0.05, 0.048], color: mcol(0.5), tile: 0.12 }),
      ...[1, -1].map((x) => cord([V(x * 0.045, 0.14, -0.005), V(x * 0.03, 0.05, 0.04), V(x * 0.012, -0.04, 0.07)], 0.011, 0xc8a898)),
      sweep({ points: [V(0, -0.04, 0.05), V(0, 0.1, 0.06)], seg: 6, radial: 6, radius: 0.014, color: (o, t) => o.set(Math.sin(t * 50) > 0 ? 0xd8c8b8 : 0x9a5a58), tile: 0.1 }),
    ]);
    A.head = headGeo();
    A.teethU = teethArc(0.034, 0.052, 0.04, -1, [0.02, 0.018, 0.022, 0.024, 0.026, 0.024, 0.022, 0.018, 0.02]);
    A.jaw = jawGeo();
    A.teethL = teethArc(-0.024, 0.04, 0.043, 1, [0.016, 0.017, 0.02, 0.022, 0.022, 0.022, 0.02, 0.017, 0.016]);
    A.eyes = merge(['L', 'R'].map((s, i) => blob({
      r: 0.017, ws: 12, hs: 10,
      color: (o, dy, a) => { const d = Math.hypot(a, dy); o.set(d < 0.16 ? 0x050202 : d < 0.4 ? 0x3a4a3a : 0xe8e0d0); if (d > 0.9) colorLerp(o, 0xe8e0d0, 0xa02028, 0.7); },
      fn: (p) => { p.applyAxisAngle(V(0, 1, 0), (i ? -1 : 1) * 0.25); p.add(V((i ? -1 : 1) * 0.034, 0.1, 0.082)); },
    })));
    A.upperArm = merge([limb(D.upperArm, 0.04, 0.03, 0.012, 1.15), blob({ r: 1, sx: 0.05, sy: 0.07, sz: 0.052, ws: 8, hs: 6, color: mcol(0.45), fn: (p) => { p.y -= 0.03; } })]);
    A.forearm = merge([limb(D.forearm, 0.036, 0.021, 0.008, 1.05, 0.05, 0.72), cord([V(0.0, -0.12, 0.03), V(0.0, -0.28, 0.018)], 0.005)]);
    A.hand = handGeo();
    A.handL = mirrorX(A.hand);
    A.thigh = merge([limb(D.thigh, 0.07, 0.042, 0.018, 1.08, 0.05, 0.82), cord([V(0.02, -0.25, 0.05), V(0.0, -0.44, 0.045)], 0.009)]);
    A.shin = merge([
      limb(D.shin, 0.045, 0.024, 0.014, 1.35, 0.1, 0.85, 0.85),
      cord([V(0, -0.03, 0.035), V(0, -0.22, 0.04), V(0, -0.42, 0.028)], 0.011, BONE),
      cord([V(0, -0.2, -0.045), V(0, -0.44, -0.03)], 0.008),
    ]);
    A.foot = footGeo();
    return A;
  });
}

const TIMINGS = {
  attack: { duration: 0.9, hit: 0.45 },
  notice: { duration: 1.2 },
  scream: { duration: 1.2 },
  hurt: { duration: 0.35 },
  death: { duration: 1.4 },
};
const seq = (i, w, s, a, b, c) => lerp(lerp(lerp(i, w, a), s, b), i, c);
const walkStride = (v) => clamp(0.8 + v * 0.42, 0.9, 2.2);
const runStride = (v) => clamp(1.4 + v * 0.3, 1.8, 3.8);

export function buildSkinless() {
  const A = assets();
  const M = instMats();
  const flesh = M.get('flesh'), teeth = M.get('teeth'), eye = M.get('eye');
  const root = new THREE.Group();
  root.name = 'skinless';
  const H = buildHumanoid(root, D);
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.035, 0.012);
  H.head.add(jaw);
  mesh(A.pelvis, flesh, H.hips);
  mesh(A.abdomen, flesh, H.spine);
  mesh(A.chest, flesh, H.chest);
  mesh(A.neck, flesh, H.neck);
  mesh(A.head, flesh, H.head);
  mesh(A.teethU, teeth, H.head);
  mesh(A.eyes, eye, H.head);
  mesh(A.jaw, flesh, jaw);
  mesh(A.teethL, teeth, jaw);
  for (let s = 0; s < 2; s++) {
    mesh(A.upperArm, flesh, H.arm[s]);
    mesh(A.forearm, flesh, H.fore[s]);
    mesh(s === 0 ? A.handL : A.hand, flesh, H.hand[s]);
    mesh(A.thigh, flesh, H.thigh[s]);
    mesh(A.shin, flesh, H.shin[s]);
    mesh(A.foot, flesh, H.foot[s]);
  }

  const rig = new Rig();
  rigHumanoid(rig, H);
  rig.add('jaw', jaw);
  rig.finalize();
  const anim = new Animator(rig, { attack: 0.1, hurt: 0.06, scream: 0.12, notice: 0.12, dead: 0.1, run: 0.2 });
  let phase = 0, t = 0;
  const seed = Math.random() * 50;
  // Sudden head jerks.
  const jerk = (k) => Math.sign(wobble(t * 2.3, seed + k)) * Math.max(0, Math.abs(wobble(t * 2.3, seed + k)) - 0.55) * 1.6;

  const POSES = {
    idle(r) {
      const br = Math.sin(t * 3.2);
      stand(r, H, 1.2, 0.05, -0.06);
      r.p('hips', 0, -0.06 + 0.005 * br, -0.02);
      r.r('spine', 0.28, 0, 0);
      r.r('chest', 0.22 + 0.03 * br, 0, 0);
      r.r('neck', -0.25 + 0.2 * jerk(1), 0.3 * jerk(2), 0.25 * jerk(3));
      r.r('head', -0.1, 0, 0.3 * jerk(4));
      r.r('jaw', 0.12 + 0.08 * Math.max(0, wobble(t * 3, seed + 5)));
      for (let s = 0; s < 2; s++) {
        const x = s ? -1 : 1, n = s ? 'R' : 'L';
        r.r('arm' + n, -0.25 + 0.05 * br, 0, x * 0.12);
        r.r('fore' + n, -0.35, 0, 0);
        r.r('hand' + n, 0.1, 0, 0);
      }
    },
    walk(r, s) {
      bipedGait(r, H, { phase, amt: smooth(s.speed / 0.35), stride: walkStride(s.speed), duty: 0.6, lift: 0.1, bob: 0.03, lean: 0.4, armSwing: 0.35, elbow: 0.35, crouch: 0.07, width: 0.1 });
      r.ra('chest', 0.15, 0, 0);
      r.r('neck', -0.35 + 0.1 * jerk(1), 0.2 * jerk(2), 0);
      r.r('head', -0.15, 0, 0.2 * jerk(3));
      r.r('jaw', 0.2);
    },
    run(r, s) {
      bipedGait(r, H, { phase, amt: smooth(s.speed / 0.6), stride: runStride(s.speed), duty: 0.36, lift: 0.24, bob: 0.05, lean: 0.8, armSwing: 0.18, armPitch: 1.05, elbow: 0.15, crouch: 0.1, width: 0.09 });
      r.ra('armL', 0, 0, 0.12);
      r.ra('armR', 0, 0, -0.12);
      r.r('handL', 0.4, 0, 0);
      r.r('handR', 0.4, 0, 0);
      r.r('neck', -0.65, 0, 0);
      r.r('head', -0.3, 0, 0);
      r.r('jaw', 0.5 + 0.1 * Math.sin(TAU * phase * 2));
    },
    scream(r, s) {
      const st = s.stateTime;
      const a = easeOut(st / 0.25), rel = smooth((st - 0.95) / 0.25);
      const k = a * (1 - rel), tr = Math.sin(t * 47) * 0.04 * k;
      POSES.idle(r);
      stand(r, H, 1.35, 0.08, -0.1);
      r.p('hips', 0, -0.03, -0.03);
      r.r('spine', lerp(0.28, -0.05, k), 0, 0);
      r.r('chest', lerp(0.22, -0.3, k) + tr, 0, 0);
      r.r('neck', lerp(-0.25, -0.55, k) + tr, 0, tr);
      r.r('head', lerp(-0.1, -0.55, k), 0, 0);
      r.r('jaw', lerp(0.12, 0.8, k) + tr * 2);
      r.r('armL', lerp(-0.25, -0.35, k) + tr, 0, lerp(0.12, 1.35, k));
      r.r('armR', lerp(-0.25, -0.35, k) - tr, 0, lerp(-0.12, -1.35, k));
      r.r('foreL', lerp(-0.35, -0.3, k), 0, 0);
      r.r('foreR', lerp(-0.35, -0.3, k), 0, 0);
      r.r('handL', 0, 0, 0.3 * k);
      r.r('handR', 0, 0, -0.3 * k);
    },
    attack(r, s) {
      const tt = progress(s, TIMINGS.attack.duration) * TIMINGS.attack.duration;
      const a = smooth(tt / 0.33), b = easeIn((tt - 0.33) / 0.14), c = smooth((tt - 0.6) / 0.3);
      stand(r, H, 1.25, seq(0.05, 0.05, 0.2, a, b, c), -0.08);
      r.p('hips', 0, seq(-0.06, 0.0, -0.12, a, b, c), seq(-0.02, -0.05, 0.08, a, b, c));
      r.r('spine', seq(0.28, 0.05, 0.45, a, b, c), 0, 0);
      r.r('chest', seq(0.22, -0.2, 0.35, a, b, c), 0, 0);
      r.r('neck', seq(-0.25, -0.2, -0.55, a, b, c), 0, 0);
      r.r('head', -0.1, 0, 0);
      r.r('jaw', seq(0.12, 0.5, 0.7, a, b, c));
      for (let i = 0; i < 2; i++) {
        const x = i ? -1 : 1, n = i ? 'R' : 'L';
        r.r('arm' + n, seq(-0.25, -2.3, -0.55, a, b, c), x * seq(0, -0.3, 0.5, a, b, c), x * seq(0.12, 1.0, -0.45, a, b, c));
        r.r('fore' + n, seq(-0.35, -0.8, -0.15, a, b, c), 0, 0);
        r.r('hand' + n, seq(0.1, -0.5, 0.5, a, b, c), 0, 0);
      }
    },
    hurt(r, s) {
      POSES.idle(r);
      const k = Math.sin(PI * clamp(s.stateTime / 0.35, 0, 1));
      r.pa('hips', 0, -0.03 * k, -0.07 * k);
      r.ra('spine', -0.25 * k, 0.1 * k, 0);
      r.ra('chest', -0.2 * k, 0, 0.15 * k);
      r.ra('neck', -0.4 * k, 0, 0.3 * k);
      r.ra('jaw', 0.4 * k);
      r.ra('armL', -0.4 * k, 0, 0.4 * k);
      r.ra('armR', -0.3 * k, 0, -0.5 * k);
    },
    dead(r, s) {
      const st = s.stateTime;
      const buckle = smooth(st / 0.4), fall = easeIn((st - 0.3) / 0.7), settle = smooth((st - 1.0) / 0.4);
      const bounce = Math.sin(PI * clamp((st - 1.0) / 0.25, 0, 1)) * 0.05;
      const kneel = buckle * (1 - fall);
      r.p('body', 0, 0.14 * fall + bounce, -0.55 * fall);
      r.r('body', (PI / 2) * fall - bounce, 0, 0);
      r.p('hips', 0, -0.35 * kneel, 0.1 * kneel);
      r.p('footL', 0.12 + 0.1 * fall, D.ankleH - 0.08 * fall, -0.15 * kneel);
      r.p('footR', -0.12 - 0.05 * fall, D.ankleH - 0.08 * fall, -0.1 * kneel);
      r.r('footL', -1.2 * fall);
      r.r('footR', -1.0 * fall);
      r.r('spine', lerp(0.3, 0.05, fall), 0, 0);
      r.r('chest', lerp(0.3, 0.0, fall), 0, 0);
      r.r('neck', lerp(0.3, -0.3, fall), 0.6 * settle, 0);
      r.r('head', 0, 0.5 * settle, 0);
      r.r('jaw', 0.5 * settle + 0.2);
      r.r('armL', lerp(-0.4, -3.0, fall), 0, lerp(0.2, 0.35, fall));
      r.r('armR', lerp(-0.3, 0.2, fall), 0, lerp(-0.2, -1.0, fall));
      r.r('foreL', -0.4, 0, 0);
      r.r('foreR', -0.3, 0, 0);
    },
  };
  POSES.notice = POSES.scream;

  function animate(dt, time, sIn) {
    const s = normState(sIn);
    t = time;
    if (s.state === 'walk') phase += (dt * s.speed) / walkStride(s.speed);
    else if (s.state === 'run') phase += (dt * s.speed) / runStride(s.speed);
    anim.update(dt, s, (r, st) => (POSES[st.state] || POSES.idle)(r, st));
    solveLegs(H);
    M.step(dt);
  }

  return {
    root, height: 1.85, radius: 0.35,
    hitSpheres: [
      hit(H.head, 0, 0.09, 0.02, 0.12, 'head'),
      hit(H.chest, 0, 0.06, 0.02, 0.19, 'body'),
      hit(H.spine, 0, 0.08, 0.02, 0.15, 'body'),
      hit(H.hips, 0, 0, 0, 0.16, 'body'),
      hit(H.thigh[0], 0, -0.22, 0, 0.09, 'limb'),
      hit(H.thigh[1], 0, -0.22, 0, 0.09, 'limb'),
      hit(H.fore[0], 0, -0.14, 0, 0.07, 'limb'),
      hit(H.fore[1], 0, -0.14, 0, 0.07, 'limb'),
    ],
    lights: [],
    timings: TIMINGS,
    states: ['idle', 'walk', 'run', 'notice', 'scream', 'attack', 'hurt', 'dead'],
    nodes: { head: H.head, jaw, hands: H.hand },
    animate,
    flash: (v) => M.flash(v),
    dispose() { M.dispose(); },
  };
}
