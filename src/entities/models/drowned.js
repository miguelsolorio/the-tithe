import * as THREE from 'three';
import {
  mesh, pivot, hit, instMats, cached, normState, progress, colorLerp,
  sweep, blob, prof, merge, xf, mirrorX,
  Rig, Animator, clamp, lerp, smooth, ramp, easeOut, easeIn, wobble, fbm3, PI, TAU,
} from './common.js';
import { humanoidDims, buildHumanoid, rigHumanoid, solveLegs, bipedGait, stand } from './skeleton.js';

// The drowned: bloated waterlogged corpse, pale blue-grey-green skin with
// livid patches, wet hair hanging over the face, milky eyes, torn clothes.
// Extra states: 'dormant' (curled low, < 0.9 m), 'rise' (stands up over
// timings.rise.duration), 'seated' (on a 0.45 m chair, head bowed).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D = humanoidDims({ thigh: 0.47, shin: 0.46, upperArm: 0.31, forearm: 0.28, hipW: 0.12, shoulderX: 0.19, chestY: 0.22, neckY: 0.27, clavY: 0.19 });
const SKIN = 0x7e9288, LIVID = 0x565268, DARKSKIN = 0x3a4246, CLOTH = 0x5e5c55, PANTS = 0x26261f;

// Pale skin with livid (purple-grey) mottling.
const skinCol = (k = 0.55) => (o, t, a, p) => {
  const n = fbm3(p.x * 6, p.y * 6, p.z * 6, 3, 17);
  colorLerp(o, SKIN, LIVID, clamp(n * 1.6 + 0.2, 0, 1) * k);
};
const solidC = (c) => (o) => o.set(c);

// Remove triangles where noise is high (tears/holes) and below a ragged hem.
function tear(geo, thresh, freq, seed, hemY = -Infinity, hemAmp = 0) {
  const pos = geo.attributes.position, idx = geo.index.array, keep = [];
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, idx[i + k]));
    c.multiplyScalar(1 / 3);
    const n = fbm3(c.x * freq, c.y * freq, c.z * freq, 3, seed);
    const hem = hemY + hemAmp * fbm3(c.x * 9, 0, c.z * 9, 2, seed + 3);
    if (n < thresh && c.y > hem) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  geo.setIndex(keep);
  return geo;
}

function limb(len, r0, r1, bulge, lumps, color = skinCol()) {
  return sweep({
    points: [V(0, 0.04, 0), V(0, -len * 0.5, 0.008), V(0, -len - 0.01, 0)], seg: 9, radial: 12,
    radius: (t) => lerp(r0, r1, t) + bulge * Math.sin(PI * clamp(t * 1.15, 0, 1)),
    bumps: { amp: lumps, freq: 9, seed: 5 }, color, tile: 0.15,
  });
}

function handGeo() {
  const col = (o, t, a, p) => colorLerp(o, SKIN, DARKSKIN, smooth((-p.y - 0.06) / 0.08) * 0.8);
  const parts = [blob({ r: 1, sx: 0.028, sy: 0.055, sz: 0.05, ws: 10, hs: 8, noise: 0.08, freq: 5, color: col, fn: (p) => { p.y -= 0.05; } })];
  for (let i = 0; i < 4; i++) {
    const z = -0.033 + i * 0.022;
    parts.push(sweep({ points: [V(0, -0.09, z), V(0.006, -0.13, z * 1.05), V(0.018, -0.16 + Math.abs(i - 1.5) * 0.01, z * 1.05)], seg: 5, radial: 6, radius: (t) => 0.012 - t * 0.002, color: col, tile: 0.1, capRound: 0.8 }));
  }
  parts.push(sweep({ points: [V(0.015, -0.035, 0.04), V(0.03, -0.075, 0.05), V(0.036, -0.1, 0.04)], seg: 4, radial: 6, radius: 0.012, color: col, tile: 0.1 }));
  return merge(parts);
}

function footGeo() {
  return sweep({ points: [V(0, -0.02, -0.055), V(0, -0.035, 0.07), V(0, -0.05, 0.2)], seg: 8, radial: 10, hint: V(0, 1, 0), radius: prof([[0, 0.042, 0.04], [0.4, 0.05, 0.036], [1, 0.042, 0.02]]), shape: (t, a) => (Math.sin(a) < 0 ? 0.75 : 1), bumps: { amp: 0.08, freq: 20 }, color: (o, t, a, p) => colorLerp(o, SKIN, DARKSKIN, 0.3 + 0.5 * t), capRound: 0.8, tile: 0.12 });
}

// Head (head space): bloated, sagging jowls, sunken milky-eyed sockets.
function headGeo() {
  const eyes = [V(0.042, 0.115, 0.108), V(-0.042, 0.115, 0.108)];
  return blob({
    r: 1, sx: 0.112, sy: 0.13, sz: 0.118, ws: 20, hs: 16, noise: 0.06, freq: 4, seed: 3,
    fn: (p, d) => {
      p.x *= 1 + 0.22 * smooth(-d.y * 1.5) * (d.z > -0.3 ? 1 : 0.5);
      if (d.z > 0.6 && Math.abs(d.x) < 0.2 && d.y > -0.2 && d.y < 0.25) p.z += 0.018 * (1 - Math.abs(d.x) / 0.2);
      p.y += 0.11; p.z += 0.02;
      if (p.y < 0.04) p.y = 0.04 + (p.y - 0.04) * 0.4;
      for (const e of eyes) { const dd = p.distanceTo(e); if (dd < 0.035) p.lerp(e, (1 - dd / 0.035) * 0.45); }
    },
    color: (o, dy, a, p) => {
      skinCol(0.5)(o, 0, 0, p);
      for (const e of eyes) { const dd = p.distanceTo(e); if (dd < 0.04) colorLerp(o, o.getHex(), 0x3a3448, (1 - dd / 0.04) * 0.9); }
      if (p.y < 0.055 && p.z > 0.06 && Math.abs(p.x) < 0.045) colorLerp(o, o.getHex(), 0x100a0c, 0.85);
    },
  });
}

function jawGeo() {
  return blob({
    r: 1, sx: 0.085, sy: 0.055, sz: 0.09, ws: 14, hs: 10, noise: 0.08, freq: 5, seed: 9,
    fn: (p) => { p.y -= 0.035; p.z += 0.045; },
    color: (o, dy, a, p) => { skinCol(0.6)(o, 0, 0, p); if (dy > 0.4 && p.z > 0.02) o.set(0x140a0c); },
  });
}

// Wet hair clumps: from the scalp, over the face and down the back.
function hairGeo() {
  const parts = [];
  const c = V(0, 0.12, 0.02);
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 52; i++) {
    const az = (i / 52) * TAU + (rnd() - 0.5) * 0.25;
    const front = Math.cos(az);
    const pol = 0.1 + rnd() * 0.55;
    const dir = V(Math.sin(az) * Math.sin(pol), Math.cos(pol), Math.cos(az) * Math.sin(pol));
    const s = c.clone().addScaledVector(dir, 0.112);
    const out = V(Math.sin(az), 0, Math.cos(az));
    const len = front > 0.3 ? 0.26 + rnd() * 0.14 : 0.3 + rnd() * 0.25;
    const rMid = 0.122 + rnd() * 0.008;
    const mid = c.clone().addScaledVector(out, rMid).setY(c.y - 0.01);
    if (front > 0.3) mid.z = Math.max(mid.z, 0.13 + rnd() * 0.01);
    const low = mid.clone().addScaledVector(out, front > 0.3 ? 0.0 : 0.01).setY(c.y - len * 0.55);
    if (front > 0.3) low.z = Math.max(low.z, 0.15);
    const end = low.clone().setY(c.y - len);
    end.x += (rnd() - 0.5) * 0.05;
    const pts = [s, c.clone().addScaledVector(dir, 0.118).addScaledVector(out, 0.012).setY(s.y - 0.02), mid, low, end];
    const w = 0.006 + rnd() * 0.009;
    parts.push(sweep({ points: pts, seg: 10, radial: 3, radius: (t) => [w * (1 - 0.7 * t), 0.0028], hint: out, color: (o, t) => colorLerp(o, 0x070706, 0x121310, t), tile: 0.06, capStart: false }));
  }
  parts.push(blob({ r: 1, sx: 0.126, sy: 0.14, sz: 0.132, ws: 16, hs: 10, noise: 0.04, freq: 8, color: solidC(0x0a0b09), fn: (p) => { p.add(c); p.y -= 0.005; p.z -= 0.004; if (p.y < 0.13) p.y = 0.13 + (p.y - 0.13) * 0.3; } }));
  return merge(parts);
}

function assets() {
  return cached('drowned', () => {
    const A = {};
    A.pelvis = sweep({ points: [V(0, -0.15, 0), V(0, 0.0, 0.01), V(0, 0.13, 0.02)], seg: 8, radial: 16, radius: prof([[0, 0.17, 0.14], [0.5, 0.2, 0.17], [1, 0.21, 0.19]]), bumps: { amp: 0.05, freq: 6 }, color: skinCol(), tile: 0.15 });
    A.belly = sweep({ points: [V(0, -0.07, 0.01), V(0, 0.1, 0.07), V(0, 0.27, 0.02)], seg: 10, radial: 18, radius: prof([[0, 0.205, 0.19], [0.45, 0.235, 0.22], [1, 0.21, 0.16]]), bumps: { amp: 0.06, freq: 5, seed: 2 }, color: skinCol(0.7), tile: 0.15 });
    A.chest = sweep({ points: [V(0, -0.12, 0.02), V(0, 0.08, 0.02), V(0, 0.2, 0.0), V(0, 0.29, 0.02)], seg: 12, radial: 18, radius: prof([[0, 0.21, 0.16], [0.5, 0.22, 0.15], [0.78, 0.235, 0.13], [1, 0.08, 0.08]]), bumps: { amp: 0.05, freq: 6, seed: 4 }, color: skinCol(), tile: 0.15 });
    A.neck = sweep({ points: [V(0, -0.03, 0), V(0, 0.13, 0.03)], seg: 4, radial: 12, radius: [0.075, 0.07], bumps: { amp: 0.06, freq: 8 }, color: skinCol(), tile: 0.15 });
    A.head = headGeo();
    A.jaw = jawGeo();
    A.hair = hairGeo();
    A.eyes = merge([1, -1].map((x) => blob({ r: 0.021, ws: 10, hs: 8, color: (o, dy, a) => { const d = Math.hypot(a, dy); o.set(d < 0.35 ? 0xb8c4c4 : 0xd8dcd4); }, fn: (p) => { p.applyAxisAngle(V(0, 1, 0), x * 0.35); p.add(V(x * 0.042, 0.115, 0.1)); } })));
    // Torn shirt: chest and belly pieces, slightly larger than the body.
    const shirtCol = (o, t, a, p) => colorLerp(o, CLOTH, 0x1a1c1a, clamp(0.5 + fbm3(p.x * 8, p.y * 8, p.z * 8, 2, 7), 0, 1) * 0.6);
    A.shirtTop = tear(sweep({ points: [V(0, -0.13, 0.02), V(0, 0.08, 0.02), V(0, 0.2, 0.0), V(0, 0.27, 0.02)], seg: 20, radial: 32, radius: prof([[0, 0.222, 0.172], [0.5, 0.232, 0.162], [0.78, 0.247, 0.142], [1, 0.1, 0.095]]), bumps: { amp: 0.05, freq: 6, seed: 4 }, capStart: false, capEnd: false, color: shirtCol, tile: 0.2 }), 0.42, 7, 11);
    A.shirtBot = tear(sweep({ points: [V(0, -0.1, 0.01), V(0, 0.1, 0.075), V(0, 0.28, 0.02)], seg: 16, radial: 32, radius: prof([[0, 0.22, 0.2], [0.45, 0.25, 0.235], [1, 0.225, 0.172]]), bumps: { amp: 0.06, freq: 5, seed: 2 }, capStart: false, capEnd: false, color: shirtCol, tile: 0.2 }), 0.38, 6, 13, 0.02, 0.14);
    A.sleeve = tear(limb(D.upperArm * 0.6, 0.075, 0.072, 0.01, 0.05, shirtCol), 0.3, 9, 17, -D.upperArm * 0.6 + 0.02, 0.06);
    A.upperArm = limb(D.upperArm, 0.065, 0.055, 0.02, 0.1);
    A.forearm = limb(D.forearm, 0.056, 0.042, 0.012, 0.1);
    A.hand = handGeo();
    A.handL = mirrorX(A.hand);
    A.thigh = limb(D.thigh, 0.095, 0.065, 0.02, 0.08);
    A.pants = tear(limb(D.thigh, 0.108, 0.078, 0.022, 0.06, (o, t, a, p) => colorLerp(o, PANTS, 0x121210, clamp(0.5 + fbm3(p.x * 9, p.y * 9, p.z * 9, 2, 3), 0, 1) * 0.5)), 0.38, 8, 19, -D.thigh + 0.03, 0.1);
    A.shin = limb(D.shin, 0.068, 0.048, 0.015, 0.1, (o, t, a, p) => { skinCol(0.6)(o, t, a, p); colorLerp(o, o.getHex(), DARKSKIN, smooth(t) * 0.4); });
    A.foot = footGeo();
    return A;
  });
}

const TIMINGS = {
  attack: { duration: 1.5, hit: 0.78 },
  notice: { duration: 1.2 },
  hurt: { duration: 0.5 },
  death: { duration: 1.8 },
  rise: { duration: 2.0 },
};
const seq = (i, w, s, a, b, c) => lerp(lerp(lerp(i, w, a), s, b), i, c);
const walkStride = (v) => clamp(0.5 + v * 0.5, 0.6, 1.4);
const runStride = (v) => clamp(0.7 + v * 0.45, 1.0, 2.2);

export function buildDrowned() {
  const A = assets();
  const M = instMats();
  const skin = M.get('skinWet'), cloth = M.get('clothWet'), hair = M.get('hair'), eye = M.get('eye');
  const root = new THREE.Group();
  root.name = 'drowned';
  const H = buildHumanoid(root, D);
  const jaw = pivot(H.head, 0, 0.045, 0.035, 'jaw');
  mesh(A.pelvis, skin, H.hips);
  mesh(A.belly, skin, H.spine);
  mesh(A.shirtBot, cloth, H.spine);
  mesh(A.chest, skin, H.chest);
  mesh(A.shirtTop, cloth, H.chest);
  mesh(A.neck, skin, H.neck);
  mesh(A.head, skin, H.head);
  mesh(A.hair, hair, H.head);
  mesh(A.eyes, eye, H.head);
  mesh(A.jaw, skin, jaw);
  for (let s = 0; s < 2; s++) {
    mesh(A.upperArm, skin, H.arm[s]);
    mesh(A.sleeve, cloth, H.arm[s]);
    mesh(A.forearm, skin, H.fore[s]);
    mesh(s === 0 ? A.handL : A.hand, skin, H.hand[s]);
    mesh(A.thigh, skin, H.thigh[s], { cast: false });
    mesh(A.pants, cloth, H.thigh[s]);
    mesh(A.shin, skin, H.shin[s]);
    mesh(A.foot, skin, H.foot[s]);
  }

  const rig = new Rig();
  rigHumanoid(rig, H);
  rig.add('jaw', jaw);
  rig.finalize();
  const anim = new Animator(rig, { attack: 0.2, hurt: 0.1, dead: 0.15, rise: 0.05, dormant: 0.6, seated: 0.8, notice: 0.3 });
  let phase = 0, t = 0;
  const seed = Math.random() * 50;

  // Curl between standing (0) and the dormant crouch (1): legs, torso, head.
  function curl(r, kl, kt, kh) {
    const dz = 0.12 * kl;
    r.p('footL', D.hipW * 1.15, D.ankleH, dz);
    r.p('footR', -D.hipW * 1.15, D.ankleH, dz - 0.02 * kl);
    r.p('hips', 0, -(D.hipY - 0.33) * kl, -0.14 * kl);
    r.r('hips', 0.25 * kl, 0, 0);
    r.r('spine', lerp(0.1, 0.8, kt), 0, 0);
    r.r('chest', lerp(0.15, 0.7, kt), 0, 0);
    r.r('neck', lerp(0.3, 0.65, kh), 0, lerp(0.25, 0.1, kh));
    r.r('head', lerp(0.1, 0.35, kh), 0, 0.2 * (1 - kh));
    for (let s = 0; s < 2; s++) {
      const x = s ? -1 : 1, n = s ? 'R' : 'L';
      r.r('arm' + n, lerp(0.05, -1.5, kt), 0, x * lerp(0.15, 0.2, kt));
      r.r('fore' + n, lerp(-0.15, -2.1, kt), 0, 0);
      r.r('hand' + n, lerp(0.1, 0.3, kt), 0, 0);
    }
  }

  const POSES = {
    idle(r) {
      curl(r, 0, 0, 0);
      const sw = Math.sin(t * 0.7);
      r.pa('hips', 0.03 * sw, -0.02, 0);
      r.ra('spine', 0, 0, -0.04 * sw);
      r.ra('neck', 0.08 * wobble(t * 0.2, seed), 0.15 * wobble(t * 0.15, seed + 1), 0.1 * sw);
      r.ra('armL', 0.05 * Math.sin(t * 0.7 + 0.5), 0, 0);
      r.ra('armR', 0.05 * Math.sin(t * 0.7 + 1.5), 0, 0);
      r.r('jaw', 0.15 + 0.05 * wobble(t * 0.5, seed + 2));
    },
    dormant(r) {
      curl(r, 1, 1, 1);
      r.ra('chest', 0.02 * Math.sin(t * 0.4), 0, 0);
    },
    rise(r, s) {
      const st = s.stateTime;
      const kl = 1 - smooth(st / 1.1), kt = 1 - smooth((st - 0.5) / 1.1), kh = 1 - easeIn((st - 1.35) / 0.55);
      curl(r, kl, kt, kh);
      r.r('jaw', 0.15 + 0.3 * smooth((st - 1.6) / 0.3));
    },
    seated(r) {
      const br = Math.sin(t * 0.5);
      r.p('footL', 0.15, D.ankleH, 0.44);
      r.p('footR', -0.15, D.ankleH, 0.46);
      r.p('hips', 0, 0.57 - D.hipY, -0.07);
      r.r('hips', -0.08, 0, 0);
      r.r('spine', 0.28, 0, 0.03);
      r.r('chest', 0.28 + 0.01 * br, 0, 0);
      r.r('neck', 0.65, 0, 0.12);
      r.r('head', 0.35, 0, 0.1);
      r.r('armL', -0.95, 0, 0.12);
      r.r('armR', -0.9, 0, -0.12);
      r.r('foreL', -0.55, 0, 0);
      r.r('foreR', -0.6, 0, 0);
      r.r('handL', 0.3, 0, 0);
      r.r('handR', 0.3, 0, 0);
      r.r('jaw', 0.25);
    },
    walk(r, s) {
      const run = s.state === 'run';
      bipedGait(r, H, {
        phase, amt: smooth(s.speed / 0.3), stride: run ? runStride(s.speed) : walkStride(s.speed),
        duty: run ? 0.52 : 0.66, lift: run ? 0.12 : 0.07, bob: 0.03, sway: run ? 0.05 : 0.07, twist: 0.15,
        lean: run ? 0.3 : 0.15, armSwing: 0.12, elbow: 0.1, width: 0.13, crouch: 0.03,
      });
      // Drag the right foot.
      const i = r.map.get('footR') + 3;
      r.tgt[i + 1] = D.ankleH + (r.tgt[i + 1] - D.ankleH) * 0.35;
      r.tgt[i - 3] *= 0.3;
      const lol = Math.sin(TAU * phase);
      r.r('neck', 0.3, 0.1 * lol, 0.2 + 0.1 * lol);
      r.r('head', 0.1, 0, 0.15);
      r.r('jaw', 0.2);
      if (run) {
        r.r('armL', -1.0 + 0.1 * lol, 0, 0.15);
        r.r('armR', -1.1 - 0.1 * lol, 0, -0.15);
        r.r('foreL', -0.3, 0, 0);
        r.r('foreR', -0.25, 0, 0);
      }
    },
    notice(r, s) {
      POSES.idle(r);
      const k = smooth(s.stateTime / 0.8);
      r.r('neck', lerp(0.3, -0.05, k), 0, lerp(0.25, 0.05, k));
      r.r('head', lerp(0.1, -0.1, k), 0, 0);
      r.r('jaw', lerp(0.15, 0.55, k));
      r.ra('armL', -0.45 * k, 0, 0);
      r.ra('armR', -0.4 * k, 0, 0);
      r.ra('chest', -0.1 * k, 0, 0);
    },
    attack(r, s) {
      const tt = progress(s, TIMINGS.attack.duration) * TIMINGS.attack.duration;
      const a = smooth(tt / 0.62), b = easeIn((tt - 0.6) / 0.2), c = smooth((tt - 1.0) / 0.5);
      curl(r, 0, 0, 0);
      stand(r, H, 1.3, 0.12, -0.08);
      r.p('hips', 0, seq(-0.02, 0.02, -0.14, a, b, c), seq(0, -0.05, 0.1, a, b, c));
      r.r('spine', seq(0.1, -0.12, 0.45, a, b, c), 0, 0);
      r.r('chest', seq(0.15, -0.22, 0.4, a, b, c), 0, 0);
      r.r('neck', seq(0.3, -0.15, 0.3, a, b, c), 0, 0);
      r.r('jaw', seq(0.15, 0.6, 0.3, a, b, c));
      for (let i = 0; i < 2; i++) {
        const x = i ? -1 : 1, n = i ? 'R' : 'L';
        r.r('arm' + n, seq(0.05, -2.8, -0.45, a, b, c), 0, x * seq(0.15, -0.28, -0.15, a, b, c));
        r.r('fore' + n, seq(-0.15, -0.45, -0.15, a, b, c), 0, 0);
        r.r('hand' + n, seq(0.1, 0.2, 0.2, a, b, c), 0, x * 0.3 * a * (1 - c));
      }
    },
    hurt(r, s) {
      POSES.idle(r);
      const k = Math.sin(PI * clamp(s.stateTime / 0.5, 0, 1));
      r.pa('hips', 0, -0.03 * k, -0.08 * k);
      r.ra('spine', -0.15 * k, 0.15 * k, 0);
      r.ra('chest', -0.15 * k, 0, 0.1 * k);
      r.ra('neck', -0.35 * k, 0, 0.3 * k);
      r.ra('armL', -0.3 * k, 0, 0.3 * k);
      r.ra('armR', -0.2 * k, 0, -0.35 * k);
    },
    dead(r, s) {
      const st = s.stateTime;
      const buckle = smooth(st / 0.6), fall = easeIn((st - 0.45) / 0.85), settle = smooth((st - 1.3) / 0.5);
      const bounce = Math.sin(PI * clamp((st - 1.3) / 0.3, 0, 1)) * 0.06;
      const kneel = buckle * (1 - fall);
      curl(r, 0.6 * kneel, 0.4 * kneel, 0.6 * buckle);
      r.p('body', 0, 0.2 * fall + bounce * 0.5, 0.45 * fall);
      r.r('body', -PI / 2 * fall + bounce, 0, 0.12 * fall);
      r.pa('footL', 0.1 * fall, 0.04 * fall, 0);
      r.pa('footR', -0.14 * fall, 0.1 * fall, 0);
      r.r('footL', 0.9 * fall);
      r.r('footR', 1.1 * fall);
      r.r('neck', lerp(0.5 * buckle, -0.1, fall), 0.5 * settle, 0);
      r.r('head', 0.1, 0.4 * settle, 0.2 * settle);
      r.r('jaw', 0.2 + 0.35 * settle);
      r.r('armL', lerp(-0.4 * buckle, -0.3, fall), 0, lerp(0.15, 1.2, fall));
      r.r('armR', lerp(-0.3 * buckle, 0.1, fall), 0, lerp(-0.15, -1.1, fall));
      r.r('foreL', -0.3, 0, 0);
      r.r('foreR', -0.5, 0, 0);
    },
  };
  POSES.run = POSES.walk;

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
    root, height: 1.9, radius: 0.4,
    hitSpheres: [
      hit(H.head, 0, 0.11, 0.03, 0.15, 'head'),
      hit(H.chest, 0, 0.06, 0.02, 0.25, 'body'),
      hit(H.spine, 0, 0.1, 0.05, 0.25, 'body'),
      hit(H.hips, 0, -0.02, 0.01, 0.22, 'body'),
      hit(H.fore[0], 0, -0.14, 0, 0.09, 'limb'),
      hit(H.fore[1], 0, -0.14, 0, 0.09, 'limb'),
      hit(H.thigh[0], 0, -0.22, 0, 0.12, 'limb'),
      hit(H.thigh[1], 0, -0.22, 0, 0.12, 'limb'),
    ],
    lights: [],
    timings: TIMINGS,
    states: ['idle', 'walk', 'run', 'notice', 'attack', 'hurt', 'dead', 'dormant', 'rise', 'seated'],
    nodes: { head: H.head, jaw, hands: H.hand },
    animate,
    flash: (v) => M.flash(v),
    dispose() { M.dispose(); },
  };
}
