import * as THREE from 'three';
import {
  mesh, pivot, hit, light, instMats, mat, cached, normState, progress, colorLerp,
  sweep, blob, prof, merge, xf, mirrorX, spike, prep, glowEyes,
  Rig, Animator, ik3, clamp, lerp, smooth, ramp, easeOut, easeIn, bump, wobble, fbm3, damp, PI, TAU,
} from './common.js';
import { humanoidDims, buildHumanoid, rigHumanoid, solveLegs, bipedGait, stand, keepUpright, footCycle } from './skeleton.js';

// Acolyte: hooded cultist in a long blood-red robe, bleached deer skull
// mask with antlers, ritual knife (right hand) and a lit candle (left hand).
// Extra state: 'pray' (kneeling, head bowed, candle held up).
//
// The crawler: the first time one hunts you it turns its back, folds over
// backward into a bridge (spine cracking) and comes at you on hands and feet,
// head upside down, candle in its teeth. Its states: 'turn' (the fold),
// 'crawlIdle', 'crawl', 'crawlAttack', 'crawlHurt', 'crawlDead', 'crawlKill'.
// Arms are long for a person, which reads as wrong upright and lets the
// hands reach the floor in the bridge.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D = humanoidDims({ upperArm: 0.36, forearm: 0.33 });
const ROBE = 0x3d0a0f, ROBE_DARK = 0x100305, SKIN = 0xb9a896, WAX = 0xd8caa6;

// Pale bony fist (right hand; left is mirrored). Grip axis along Z at GRIP.
const GRIP = V(0, -0.085, 0.005);
function fistGeo() {
  const skin = (o) => o.set(SKIN);
  const parts = [];
  parts.push(sweep({ points: [V(0, 0.09, 0), V(0, 0.0, 0)], seg: 3, radial: 8, radius: [0.026, 0.03], capStart: false, color: skin, tile: 0.2 }));
  parts.push(blob({ r: 1, sx: 0.022, sy: 0.05, sz: 0.042, ws: 10, hs: 8, color: skin, fn: (p) => { p.y -= 0.045; p.x -= 0.003; } }));
  for (let i = 0; i < 4; i++) {
    const z = -0.03 + i * 0.02, len = i === 1 || i === 2 ? 1 : 0.9;
    const pts = [V(-0.004, -0.085, z), V(0.004, -0.115 * len, z), V(0.028, -0.118 * len, z), V(0.032, -0.09, z)];
    parts.push(sweep({ points: pts, seg: 6, radial: 6, radius: (t) => 0.0095 - t * 0.002, color: skin, tile: 0.1 }));
  }
  parts.push(sweep({ points: [V(0.012, -0.03, 0.035), V(0.03, -0.06, 0.042), V(0.036, -0.082, 0.03)], seg: 5, radial: 6, radius: 0.01, color: skin, tile: 0.1 }));
  return merge(parts);
}

function skullGeo() {
  const bone = (o) => o.set(0xd8ccb0);
  const sockets = [V(0.068, 0.118, 0.135), V(-0.068, 0.118, 0.135)];
  const cran = blob({
    r: 0.088, sx: 1, sy: 0.88, sz: 1.05, ws: 20, hs: 14, noise: 0.04, freq: 5,
    fn: (p) => {
      p.add(V(0, 0.11, 0.08));
      for (const s of sockets) {
        const d = p.distanceTo(s);
        if (d < 0.04) p.lerp(s, (1 - d / 0.04) * 0.55);
      }
    },
    color: (o, dy, a, p) => {
      let k = 1;
      for (const s of sockets) k = Math.min(k, smooth((p.distanceTo(s) - 0.012) / 0.02));
      colorLerp(o, 0x0a0605, 0xdcd0b4, k);
    },
  });
  const snout = sweep({
    points: [V(0, 0.105, 0.12), V(0, 0.08, 0.23), V(0, 0.035, 0.34)], seg: 10, radial: 12, hint: V(0, 1, 0),
    radius: prof([[0, 0.058, 0.06], [0.45, 0.04, 0.045], [1, 0.022, 0.024]]),
    shape: (t, a) => 1 - 0.18 * Math.max(0, -Math.sin(a)) * t,
    capRound: 0.6,
    color: (o, t, a) => {
      const nasal = t > 0.55 && Math.sin(a) > 0.6 ? smooth((t - 0.55) / 0.15) : 0;
      const tip = smooth((t - 0.93) / 0.07);
      colorLerp(o, 0xd8ccb0, 0x0a0605, Math.max(nasal * 0.9, tip));
    },
  });
  const parts = [cran, snout];
  for (let i = 0; i < 5; i++) {
    for (const x of [-1, 1]) {
      const z = 0.15 + i * 0.03;
      parts.push(spike({ len: 0.018, r: 0.006, dir: [0, -1, 0.1], radial: 4, seg: 2, color: bone }));
      xf(parts[parts.length - 1], [x * (0.034 - i * 0.003), 0.1 - i * 0.012 - 0.03, z]);
    }
  }
  return merge(parts);
}

// One antler (left side), main beam curving up/out/back with four tines.
function antlerGeo() {
  const col = (o, t) => colorLerp(o, 0x6e5e48, 0xe2d8c2, smooth(t * 1.4));
  const beamPts = [V(0.045, 0.17, 0.08), V(0.095, 0.25, 0.05), V(0.18, 0.33, -0.01), V(0.26, 0.42, -0.01), V(0.3, 0.52, 0.04), V(0.29, 0.6, 0.1)];
  const beam = new THREE.CatmullRomCurve3(beamPts, false, 'centripetal');
  const parts = [sweep({ curve: beam, seg: 18, radial: 8, radius: (t) => 0.021 * (1 - t * 0.62) * (t < 0.05 ? 1.25 : 1), bumps: { amp: 0.12, freq: 40 }, color: col, tile: 0.08, capRound: 0.5 })];
  const tines = [[0.12, [0.1, 0.45, 1], 0.14, 0.013], [0.42, [0.15, 1, 0.55], 0.17, 0.012], [0.66, [0.35, 1, 0.3], 0.13, 0.01], [0.85, [0.1, 0.8, 0.9], 0.09, 0.008]];
  for (const [t, dir, len, r] of tines) {
    const g = spike({ len, r, curve: 0.25, dir, bend: [0, 1, 0], radial: 6, seg: 5, color: (o) => o.set(0xd6cbb2), tip: 0.05 });
    const p = beam.getPointAt(t);
    parts.push(xf(g, [p.x, p.y, p.z]));
  }
  return merge(parts);
}

function knifeGeo() {
  const blade = sweep({
    points: [V(0, 0, 0.06), V(0, 0.004, 0.16), V(0, 0.02, 0.28), V(0, 0.045, 0.33)], seg: 12, radial: 6, hint: V(0, 1, 0),
    radius: (t) => [0.0035 * (1 - t * 0.6), 0.017 * (1 - t) ** 0.7 + 0.001], capStart: true, capEnd: false,
    color: (o, t, a) => colorLerp(o, 0xb0a89c, 0x2a0508, smooth((t - 0.35) / 0.5) * 0.85 * (Math.sin(a) < 0 ? 1 : 0.6)),
  });
  const guard = sweep({ points: [V(-0.035, 0, 0.055), V(0.035, 0, 0.055)], seg: 4, radial: 6, radius: 0.007, color: (o) => o.set(0x4a3a2a), hint: V(0, 0, 1) });
  return { blade: merge([blade, guard]), handle: handleGeo() };
}

function handleGeo() {
  const h = sweep({ points: [V(0, 0, -0.07), V(0, 0, 0.05)], seg: 6, radial: 8, radius: (t) => 0.0125 + 0.002 * Math.sin(t * 18), bumps: { amp: 0.1, freq: 60 }, color: (o) => o.set(0xcfc2a2), tile: 0.1, capRound: 0.8 });
  const pom = blob({ r: 0.017, ws: 8, hs: 6, color: (o) => o.set(0xcfc2a2), fn: (p) => { p.z -= 0.075; } });
  return merge([h, pom]);
}

function candleGeo() {
  const col = (o) => o.set(WAX);
  const parts = [sweep({ points: [V(0, -0.075, 0), V(0, 0.1, 0)], seg: 6, radial: 12, radius: (t) => 0.029 * (t > 0.92 ? 0.93 : 1), bumps: { amp: 0.06, freq: 30 }, color: col, capRound: 0.05 })];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.37 + 0.4, len = 0.03 + (i % 3) * 0.025;
    const x = Math.sin(a) * 0.028, z = Math.cos(a) * 0.028;
    parts.push(sweep({ points: [V(x, 0.1, z), V(x * 1.08, 0.1 - len * 0.5, z * 1.08), V(x * 1.02, 0.1 - len, z * 1.02)], seg: 4, radial: 5, radius: (t) => 0.007 * (1 - t * 0.4), color: col, tile: 0.1 }));
  }
  parts.push(sweep({ points: [V(0, 0.095, 0), V(0.002, 0.118, 0)], seg: 2, radial: 4, radius: 0.0018, color: (o) => o.set(0x100806) }));
  return merge(parts);
}

function flameGeo() {
  return sweep({ points: [V(0, 0, 0), V(0, 0.05, 0)], seg: 8, radial: 8, radius: prof([[0, 0.003], [0.25, 0.0095], [0.6, 0.007], [1, 0.0005]]), capRound: 0.3, color: (o) => o.set(0xffffff) });
}

function assets() {
  return cached('acolyte', () => {
    const A = {};
    // Skirt in hips space: waist to hem, with folds and a ragged hem.
    A.top = 0.1;
    A.hem = -(D.hipY - 0.04);
    const skirt = sweep({
      points: [V(0, A.top, 0), V(0, A.hem, 0)], seg: 14, radial: 30, capStart: false, capEnd: false,
      radius: prof([[0, 0.175, 0.14], [0.12, 0.205, 0.165], [0.5, 0.25, 0.225], [1, 0.34, 0.31]]),
      shape: (t, a) => 1 + (0.012 + 0.06 * t) * (0.6 * Math.sin(a * 7 + 1.3) + 0.4 * Math.sin(a * 13 + 0.7 + t * 2)),
      color: (o, t, a) => colorLerp(o, ROBE, ROBE_DARK, smooth((t - 0.45) / 0.55) * 0.85 + 0.1 * Math.sin(a * 7)),
      tile: 0.22,
    });
    const pos = skirt.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = smooth((A.hem + 0.12 - y) / 0.12);
      if (k > 0) pos.setY(i, y + k * 0.05 * fbm3(pos.getX(i) * 14, 0, pos.getZ(i) * 14, 2, 5));
    }
    skirt.computeVertexNormals();
    A.skirt = skirt;
    A.belt = sweep({ points: [V(0, 0.06, 0), V(0, 0.09, 0)], seg: 1, radial: 24, radius: [0.19, 0.155], capStart: false, capEnd: false, bumps: { amp: 0.05, freq: 40 }, color: (o) => o.set(0x241810) });
    // Torso robe (chest space).
    A.torso = sweep({
      points: [V(0, -0.34, 0), V(0, -0.05, 0.012), V(0, 0.2, 0.0), V(0, 0.29, 0.02)], seg: 14, radial: 22,
      radius: prof([[0, 0.172, 0.135], [0.3, 0.172, 0.128], [0.55, 0.19, 0.138], [0.8, 0.222, 0.13], [0.9, 0.17, 0.11], [1, 0.075, 0.075]]),
      shape: (t, a) => 1 + 0.02 * Math.sin(a * 5 + t * 6) * (1 - t),
      capStart: false, color: (o, t) => colorLerp(o, ROBE, 0x2a070a, smooth(t)), tile: 0.22,
    });
    // Hood (head space): partial sphere shell open at the front.
    const gap = 1.75;
    const hood = prep(new THREE.SphereGeometry(1, 22, 14, PI / 2 + gap / 2, TAU - gap, 0, 2.35), (o) => o.set(ROBE));
    const hp = hood.attributes.position;
    const d = new THREE.Vector3();
    for (let i = 0; i < hp.count; i++) {
      d.fromBufferAttribute(hp, i);
      const th = Math.acos(clamp(d.y, -1, 1));
      const r = 0.158 * (1 + 0.5 * smooth((th - 1.35) / 1.0));
      const p = d.clone().multiplyScalar(r);
      p.y *= 1.12;
      if (d.z < 0 && d.y > 0) { p.z -= 0.05 * d.y * -d.z; p.y += 0.03 * d.y * -d.z; }
      p.y -= 0.1 * smooth((th - 1.5) / 0.85);
      p.y += 0.085;
      p.z -= 0.012;
      p.x *= 1 + 0.06 * Math.sin(th * 9 + Math.atan2(d.x, d.z) * 3) * smooth((th - 1.2) / 0.8);
      hp.setXYZ(i, p.x, p.y, p.z);
    }
    hood.computeVertexNormals();
    A.hood = hood;
    // Darkness inside the hood behind the mask.
    A.voidGeo = blob({ r: 0.125, sx: 1, sy: 1.1, sz: 0.9, ws: 12, hs: 8, color: (o) => o.set(0x000000), fn: (p) => { p.y += 0.07; p.z -= 0.0; } });
    A.skull = skullGeo();
    const antL = antlerGeo();
    A.antlers = merge([antL, mirrorX(antL.clone())]);
    // Sleeves: upper (arm space) and bell-shaped lower (forearm space).
    const sleeveCol = (o, t, a) => colorLerp(o, ROBE, ROBE_DARK, 0.25 + 0.2 * Math.sin(a * 3));
    A.sleeveU = sweep({ points: [V(0, 0.05, 0), V(0, -D.upperArm - 0.01, 0)], seg: 5, radial: 14, radius: prof([[0, 0.078], [1, 0.084]]), shape: (t, a) => 1 + 0.05 * Math.sin(a * 5 + t * 3), capStart: false, capEnd: false, color: sleeveCol });
    A.sleeveL = sweep({ points: [V(0, 0.03, 0), V(0, -D.forearm * 0.54, 0.005), V(0, -D.forearm + 0.025, 0.012)], seg: 7, radial: 18, radius: prof([[0, 0.083], [0.6, 0.09], [1, 0.108]]), shape: (t, a) => 1 + 0.07 * t * Math.sin(a * 6 + 1), capStart: false, capEnd: false, color: sleeveCol });
    A.fistR = fistGeo();
    A.fistL = mirrorX(A.fistR);
    const k = knifeGeo();
    A.blade = k.blade;
    A.handle = k.handle;
    A.candle = candleGeo();
    A.flame = flameGeo();
    const skin = (o) => o.set(SKIN);
    A.foot = sweep({ points: [V(0, -0.02, -0.05), V(0, -0.035, 0.06), V(0, -0.05, 0.19)], seg: 8, radial: 10, hint: V(0, 1, 0), radius: prof([[0, 0.035, 0.035], [0.4, 0.042, 0.03], [1, 0.03, 0.016]]), shape: (t, a) => (Math.sin(a) < 0 ? 0.75 : 1), color: skin, capRound: 0.8 });
    A.shin = sweep({ points: [V(0, -0.1, 0), V(0, -0.44, 0)], seg: 4, radial: 8, radius: prof([[0, 0.05], [1, 0.033]]), color: skin });
    return A;
  });
}

const TIMINGS = {
  attack: { duration: 1.2, hit: 0.6 },
  // Long enough for the crawler's fold (the 'turn' pose).
  notice: { duration: 1.2 },
  hurt: { duration: 0.45 },
  death: { duration: 1.6 },
};

// lerp(idle -> wind -> strike -> idle) for attack channels.
const seq = (i, w, s, a, b, c) => lerp(lerp(lerp(i, w, a), s, b), i, c);

// Crawler bridge, in body space before the half turn (so "toward you" is -Z):
// pelvis up, back arched over, head hanging upside down with the face tipped
// up at you and the antlers reaching forward just off the floor like
// mandibles, wrists planted ahead of the shoulders, feet behind.
const BRIDGE = { hy: -0.21, hipsX: -1.0, spineX: -0.6, chestX: -0.55, neckX: -0.55, headX: 0.15 };
const HAND_AT = [V(0.36, 0.1, -0.66), V(-0.36, 0.1, -0.66)];
const FOOT_AT = [V(0.17, D.ankleH, 0.36), V(-0.17, D.ankleH, 0.36)];
// Spine cracks during the fold, in seconds; matches CRACKS in sfx-depths.js.
const CRACKS = [0, 0.22, 0.4, 0.55, 0.66, 0.75, 0.82];
const CRAWL_STATES = new Set(['turn', 'crawlIdle', 'crawl', 'crawlAttack', 'crawlHurt', 'crawlDead', 'crawlKill']);
// Candle grip in the corner of the skull's jaw (head space), off to one
// side so it lights the face without hiding it.
const MOUTH = V(0.075, 0.04, 0.24);

export function buildAcolyte() {
  const A = assets();
  const M = instMats();
  const root = new THREE.Group();
  root.name = 'acolyte';
  const H = buildHumanoid(root, D);
  // The crawler turns its back on you before it bends over backward, so the
  // whole body hangs off a pivot that can spin half a turn.
  const flip = pivot(root, 0, 0, 0, 'flip');
  flip.add(H.body);
  const cloth = M.get('cloth'), bone = M.get('bone'), horn = M.get('horn'), skin = M.get('skin');

  // Per-instance skirt, deformed each frame by the legs.
  const skirtGeo = A.skirt.clone();
  const rest = Float32Array.from(skirtGeo.attributes.position.array);
  skirtGeo.boundingSphere = new THREE.Sphere(V(0, -0.45, 0), 1.3);
  mesh(skirtGeo, cloth, H.hips);
  mesh(A.belt, cloth, H.hips);
  mesh(A.torso, cloth, H.chest);
  mesh(A.hood, cloth, H.head);
  mesh(A.voidGeo, mat('dark'), H.head, { cast: false });
  mesh(A.skull, bone, H.head);
  mesh(A.antlers, horn, H.head);
  for (let s = 0; s < 2; s++) {
    mesh(A.sleeveU, cloth, H.arm[s]);
    mesh(A.sleeveL, cloth, H.fore[s]);
    mesh(A.foot, skin, H.foot[s]);
    mesh(A.shin, skin, H.shin[s], { cast: false });
  }
  mesh(A.fistL, skin, H.hand[0]);
  mesh(A.fistR, skin, H.hand[1]);
  const knife = pivot(H.hand[1], GRIP.x, GRIP.y, GRIP.z, 'knife');
  mesh(A.blade, mat('blade'), knife);
  mesh(A.handle, bone, knife);
  const candle = pivot(H.hand[0], GRIP.x, GRIP.y, GRIP.z, 'candle');
  mesh(A.candle, mat('wax'), candle);
  const flame = pivot(candle, 0, 0.116, 0, 'flame');
  mesh(A.flame, mat('flame'), flame, { cast: false, receive: false });

  // Embers deep in the skull's sockets.
  const eyes = glowEyes(H.head, [V(0.064, 0.118, 0.146), V(-0.064, 0.118, 0.146)], { r: 0.01 });

  const rig = new Rig();
  rigHumanoid(rig, H);
  rig.add('candle', candle, true);
  rig.add('flip', flip);
  rig.finalize();
  const anim = new Animator(rig, {
    hurt: 0.08, attack: 0.15, notice: 0.12, dead: 0.12, pray: 0.7, run: 0.3, kill: 0.1,
    turn: 0.12, crawlIdle: 0.3, crawl: 0.25, crawlAttack: 0.12, crawlHurt: 0.06, crawlDead: 0.1, crawlKill: 0.08,
  });
  let phase = 0;
  let crawlPhase = 0;
  let t = 0;
  let glow = 0;
  let twitch = 0;
  const seed = Math.random() * 100;

  // The candle moves between the left hand and the crawler's teeth.
  const candleRig = rig.nodes.find((n) => n.node === candle);
  function candleTo(mouth) {
    const parent = mouth ? H.head : H.hand[0];
    if (candle.parent === parent) return;
    parent.add(candle);
    candleRig.rp.copy(mouth ? MOUTH : GRIP);
  }

  // Crawler arms: poses set where the wrists go (body space) and how much the
  // IK owns the arms (plant, 0..1); plantHands() solves after the rig applies.
  let plant = 0;
  const handT = [V(0, 0, 0), V(0, 0, 0)];
  const _ta = new Float32Array(rig.size);
  const _ha = [V(0, 0, 0), V(0, 0, 0)];
  const _fc = [0, 0, 0];
  // Cross-fade two whole poses (k = 0 is a, 1 is b), wrists and IK weight included.
  function mix(r, a, b, k, s) {
    r.tgt.fill(0);
    plant = 0;
    a(r, s);
    _ta.set(r.tgt);
    const pa = plant;
    _ha[0].copy(handT[0]);
    _ha[1].copy(handT[1]);
    r.tgt.fill(0);
    plant = 0;
    b(r, s);
    for (let i = 0; i < _ta.length; i++) r.tgt[i] = _ta[i] + (r.tgt[i] - _ta[i]) * k;
    if (pa > 0) for (let i = 0; i < 2; i++) handT[i].lerpVectors(_ha[i], handT[i], k);
    plant = lerp(pa, plant, k);
  }

  // The upside-down bridge every crawler pose builds on.
  function bridge(r, breath = 1) {
    const br = Math.sin(t * 2.3) * breath;
    r.r('flip', 0, PI, 0);
    r.p('hips', 0, BRIDGE.hy + 0.012 * br, 0);
    r.r('hips', BRIDGE.hipsX, 0, 0);
    r.r('spine', BRIDGE.spineX + 0.02 * br, 0, 0);
    r.r('chest', BRIDGE.chestX + 0.03 * br, 0, 0);
    // The hanging head turns slowly to follow you, with sudden jerks.
    r.r('neck', BRIDGE.neckX, 0.3 * wobble(t * 0.35, seed + 11), 0.45 * twitch);
    r.r('head', BRIDGE.headX, 0, 0.3 * wobble(t * 0.5, seed + 12) + 0.35 * twitch);
    r.r('handL', 0.5, 0, 0);
    r.r('handR', 0.5, 0, 0);
    r.p('footL', FOOT_AT[0].x, FOOT_AT[0].y, FOOT_AT[0].z);
    r.p('footR', FOOT_AT[1].x, FOOT_AT[1].y, FOOT_AT[1].z);
    handT[0].copy(HAND_AT[0]);
    handT[1].copy(HAND_AT[1]);
    plant = 1;
  }

  // Flat on its back, limbs splayed.
  function collapsed(r) {
    r.r('flip', 0, PI, 0);
    r.p('hips', 0, -0.72, 0.05);
    r.r('hips', -1.35, 0, 0.1);
    r.r('spine', -0.15, 0, 0);
    r.r('chest', -0.1, 0.1, 0);
    r.r('neck', -0.2, 0.3, 0);
    r.r('head', -0.1, 0.5, 0.3);
    r.p('footL', 0.25, D.ankleH, 0.75);
    r.p('footR', -0.2, D.ankleH, 0.62);
    handT[0].set(0.7, 0.06, -0.45);
    handT[1].set(-0.65, 0.06, -0.6);
    plant = 1;
  }

  // Kill-cam: stands up with its back to you and its head bent all the way
  // back, so the upside-down skull hangs at your eye line; knife up behind it.
  function risen(r) {
    r.r('flip', 0, PI, 0);
    stand(r, H, 1.2, 0.05, -0.05);
    r.p('hips', 0, 0.02, 0.08);
    r.r('hips', -0.1, 0, 0);
    r.r('spine', -0.1, 0, 0);
    r.r('chest', -0.15, 0, 0);
    r.r('neck', -1.4, 0, 0);
    r.r('head', -0.9, 0, 0);
    r.r('armR', -2.6, 0.2, -0.3);
    r.r('foreR', -1.2, 0, 0);
    r.r('handR', 0.6, 0, 0);
    r.r('armL', -0.4, 0, 0.5);
    r.r('foreL', -0.6, 0, 0);
    plant = 0;
  }

  const _wt = V(0, 0, 0), _pole = V(0, 0, 0);
  const _fkQ = new THREE.Quaternion(), _ikQ = new THREE.Quaternion();
  function plantHands(w) {
    root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const arm = H.arm[i], fore = H.fore[i];
      _fkQ.copy(arm.quaternion);
      const fkX = fore.rotation.x;
      H.body.localToWorld(_wt.copy(handT[i]));
      // Elbows out and up, like a spider's knees.
      H.body.localToWorld(_pole.set(i ? -0.9 : 0.9, 1.3, -0.4));
      ik3(arm, fore, D.upperArm, D.forearm, _wt, _pole, 1);
      if (w < 1) {
        _ikQ.copy(arm.quaternion);
        arm.quaternion.slerpQuaternions(_fkQ, _ikQ, w);
        fore.rotation.x = lerp(fkX, fore.rotation.x, w);
      }
    }
  }

  const holdArms = (k = 1, sw = 0) => {
    rig.r('armL', -0.45 * k + sw, 0.12, 0.14);
    rig.r('foreL', -1.3 * k, 0, 0);
    rig.r('handL', 0.25 * k, 0, 0);
  };

  const POSES = {
    idle(r) {
      const br = Math.sin(t * 1.7);
      stand(r, H, 1.1, 0.03, -0.05);
      r.p('hips', 0, -0.012 + 0.004 * br, 0);
      r.r('spine', 0.06, 0, 0);
      r.r('chest', 0.05 + 0.015 * br, 0, 0);
      r.r('neck', 0.12 + 0.05 * wobble(t * 0.3, seed), 0.2 * wobble(t * 0.17, seed + 2), 0.12 * wobble(t * 0.23, seed + 3));
      r.r('head', 0.06, 0, 0.14 * wobble(t * 0.31, seed + 4));
      holdArms();
      r.r('armR', -0.1, 0, -0.1);
      r.r('foreR', -0.35, 0, 0);
      r.r('handR', -0.15, 0, 0);
    },
    walk(r, s) {
      const run = s.state === 'run';
      bipedGait(r, H, {
        phase, amt: smooth(s.speed / 0.35),
        stride: run ? clamp(1.1 + s.speed * 0.32, 1.6, 3.4) : clamp(0.8 + s.speed * 0.45, 0.9, 2.2),
        duty: run ? 0.4 : 0.62, lift: run ? 0.17 : 0.09, bob: run ? 0.04 : 0.022,
        lean: run ? 0.32 : 0.1, armSwing: run ? 0.65 : 0.28, elbow: run ? 1.0 : 0.3, width: 0.1, crouch: run ? 0.05 : 0,
      });
      holdArms(1, 0.06 * Math.sin(TAU * phase));
      r.r('neck', run ? -0.12 : 0.06, 0, 0);
      r.r('head', run ? -0.1 : 0.04, 0, 0);
    },
    notice(r, s) {
      const st = s.stateTime;
      POSES.idle(r);
      const a = easeOut(st / 0.18), b = ramp(0.15, 0.5, st);
      r.r('chest', 0.05 - 0.12 * a, 0, 0);
      r.r('neck', -0.08 * a, 0, 0.3 * b);
      r.r('head', -0.05 * a, 0, 0.32 * b);
      r.r('armR', -0.1 - 0.45 * b, 0.2 * b, -0.1);
      r.r('foreR', -0.35 - 0.8 * b, 0, 0);
      r.r('armL', -0.45 - 0.35 * b, 0.12, 0.14);
    },
    attack(r, s) {
      const tt = progress(s, TIMINGS.attack.duration) * TIMINGS.attack.duration;
      const a = smooth(tt / 0.46), b = easeIn((tt - 0.46) / 0.16), c = smooth((tt - 0.78) / 0.42);
      stand(r, H, 1.15, 0.14, -0.12);
      r.p('hips', 0, seq(0, 0.01, -0.07, a, b, c), seq(0, -0.03, 0.06, a, b, c));
      r.r('spine', seq(0.05, -0.1, 0.25, a, b, c), seq(0, -0.25, 0.2, a, b, c), 0);
      r.r('chest', seq(0.05, -0.15, 0.25, a, b, c), seq(0, -0.2, 0.2, a, b, c), 0);
      r.r('neck', seq(0.1, -0.1, 0.25, a, b, c), 0, 0);
      r.r('head', seq(0.05, 0.05, 0.1, a, b, c), 0, 0);
      r.r('armR', seq(-0.1, -2.75, -0.35, a, b, c), seq(0, 0.25, -0.35, a, b, c), seq(-0.1, -0.35, 0.3, a, b, c));
      r.r('foreR', seq(-0.35, -1.55, -0.15, a, b, c), 0, 0);
      r.r('handR', seq(-0.15, 0.7, -0.5, a, b, c), 0, 0);
      holdArms(1, seq(0, 0.3, -0.1, a, b, c));
    },
    hurt(r, s) {
      POSES.idle(r);
      const k = Math.sin(PI * clamp(s.stateTime / 0.45, 0, 1)) * (1 - 0.5 * clamp(s.stateTime / 0.45, 0, 1));
      r.ra('hips', 0, 0, 0);
      r.pa('hips', 0, -0.03 * k, -0.06 * k);
      r.ra('spine', -0.2 * k, 0, 0.1 * k);
      r.ra('chest', -0.25 * k, 0.15 * k, 0);
      r.ra('neck', -0.35 * k, 0, 0.2 * k);
      r.ra('armR', -0.3 * k, 0, -0.3 * k);
      r.ra('armL', 0.2 * k, 0, 0.2 * k);
    },
    dead(r, s) {
      const st = s.stateTime;
      const buckle = smooth(st / 0.45), fall = easeIn((st - 0.3) / 0.8), settle = smooth((st - 1.1) / 0.5);
      const bounce = Math.sin(PI * clamp((st - 1.1) / 0.3, 0, 1)) * 0.06;
      r.p('body', 0, 0.15 * fall + bounce * 0.5, 0.35 * fall);
      r.r('body', -PI / 2 * fall + bounce, 0, 0.1 * fall);
      const legBend = buckle * (1 - fall);
      r.p('hips', 0, -0.32 * legBend, 0.05 * legBend);
      r.p('footL', 0.1 + 0.08 * fall, D.ankleH + 0.06 * fall, 0.08 * legBend);
      r.p('footR', -0.1 - 0.12 * fall, D.ankleH + 0.14 * fall, 0.02 * legBend);
      r.r('footL', 0.9 * fall);
      r.r('footR', 1.1 * fall);
      r.r('spine', 0.35 * buckle * (1 - fall) + 0.05 * fall, 0, 0);
      r.r('chest', 0.3 * buckle * (1 - fall) - 0.05 * fall, 0, 0);
      r.r('neck', lerp(0.5 * buckle, -0.1, fall), 0.45 * settle, 0);
      r.r('head', 0.1, 0.35 * settle, 0.2 * settle);
      r.r('armL', lerp(-0.3 * buckle, -0.2, fall), 0, lerp(0.1, 1.25, fall));
      r.r('foreL', lerp(-0.5, -0.25, fall), 0, 0);
      r.r('armR', lerp(-0.1, 0.1, fall), 0, lerp(-0.1, -1.35, fall));
      r.r('foreR', lerp(-0.35, -0.5, fall), 0, 0);
      r.r('handR', -0.2, 0, 0);
      r.p('candle', 0, 0.06 * fall, 0);
    },
    // Kill-cam: looms in over you with the skull tipped and the knife up, then stabs.
    kill(r, s) {
      const st = s.stateTime;
      const lean = easeOut(st / 0.35);
      const twitch = 0.07 * Math.sin(st * 47) * (1 - smooth((st - 0.3) / 0.3));
      const strike = easeIn((st - 0.72) / 0.14);
      stand(r, H, 1.15, 0.14, -0.12);
      r.p('hips', 0, -0.03 * lean, 0.05 * lean);
      r.r('spine', 0.18 * lean + 0.12 * strike, 0, 0);
      r.r('chest', 0.2 * lean + 0.1 * strike, 0, 0);
      r.r('neck', 0.25 * lean + twitch, 0, 0.55 * lean);
      r.r('head', 0.1, 0, 0.35 * lean + twitch);
      r.r('armR', lerp(-2.75, -0.35, strike), lerp(0.25, -0.35, strike), lerp(-0.35, 0.3, strike));
      r.r('foreR', lerp(-1.55, -0.15, strike), 0, 0);
      r.r('handR', lerp(0.7, -0.5, strike), 0, 0);
      holdArms(1, 0.2);
    },
    pray(r) {
      const rock = Math.sin(t * 1.3);
      r.p('footL', 0.13, 0.055, -0.43);
      r.p('footR', -0.13, 0.055, -0.43);
      r.r('footL', 2.75);
      r.r('footR', 2.75);
      r.p('hips', 0, -0.5 + 0.01 * rock, -0.04);
      r.r('hips', 0.05, 0, 0);
      r.r('spine', 0.16 + 0.05 * rock, 0, 0);
      r.r('chest', 0.12 + 0.03 * rock, 0, 0);
      r.r('neck', 0.45, 0, 0.05);
      r.r('head', 0.35, 0, 0);
      r.r('armL', -2.0 - 0.05 * rock, 0.3, 0.1);
      r.r('foreL', -0.45, 0, 0);
      r.r('handL', 0.3, 0, 0);
      r.r('armR', -0.5, 0.3, 0.1);
      r.r('foreR', -2.05, 0, 0);
      r.r('handR', 0.2, 0, 0.3);
    },
  };
  POSES.run = POSES.walk;

  Object.assign(POSES, {
    // The fold: turns its back on you, then bends over backward a jolt per crack.
    turn(r, s) {
      const st = s.stateTime;
      let bend = 0;
      for (const c of CRACKS) bend += easeOut((st - c) / 0.07);
      bend /= CRACKS.length;
      mix(r, POSES.idle, POSES.crawlIdle, bend, s);
      r.r('flip', 0, PI * smooth(st / 0.22), 0);
      plant = smooth((st - 0.55) / 0.35);
    },
    crawlIdle(r) {
      bridge(r);
    },
    crawl(r, s) {
      const amt = smooth(s.speed / 0.3);
      const fast = clamp((s.speed - 1) / 2, 0, 1);
      const stride = lerp(0.45, 0.85, fast), duty = lerp(0.62, 0.45, fast);
      bridge(r, 0);
      // Lateral sequence, like an insect: left hand, right foot, right hand, left foot.
      for (let i = 0; i < 2; i++) {
        footCycle(crawlPhase + (i ? 0.5 : 0), duty, stride, 0.12, _fc);
        handT[i].set(HAND_AT[i].x, HAND_AT[i].y + _fc[1] * amt, HAND_AT[i].z - _fc[0] * amt);
        footCycle(crawlPhase + (i ? 0.25 : 0.75), duty, stride, 0.1, _fc);
        r.p(i ? 'footR' : 'footL', FOOT_AT[i].x, FOOT_AT[i].y + _fc[1] * amt, FOOT_AT[i].z - _fc[0] * amt);
      }
      const sw = Math.sin(TAU * crawlPhase);
      r.pa('hips', 0.02 * sw * amt, 0.025 * Math.cos(TAU * 2 * crawlPhase) * amt, 0);
      r.ra('hips', 0, 0, 0.06 * sw * amt);
      r.ra('chest', 0, 0.08 * Math.sin(TAU * crawlPhase + 1) * amt, 0);
    },
    // Surges at you; the knife hand leaves the floor and slashes up.
    crawlAttack(r, s) {
      const tt = s.stateTime;
      bridge(r, 0);
      const wind = smooth(tt / 0.45), strike = easeIn((tt - 0.45) / 0.15), back = smooth((tt - 0.8) / 0.4);
      const surge = (wind * 0.3 + strike * 0.7) * (1 - back);
      r.pa('hips', 0, 0.06 * surge, -0.2 * surge);
      r.ra('chest', -0.15 * surge, 0, 0);
      r.ra('neck', 0.2 * strike * (1 - back), 0, 0.4 * Math.sin(tt * 40) * wind * (1 - strike));
      handT[1].copy(HAND_AT[1]).lerp(_wt.set(-0.3, 0.75, -0.4), wind * (1 - strike));
      handT[1].lerp(_pole.set(-0.15, 0.95, -1.05), strike * (1 - back));
    },
    crawlHurt(r, s) {
      bridge(r);
      const k = Math.sin(PI * clamp(s.stateTime / 0.45, 0, 1));
      r.pa('hips', 0, 0.08 * k, 0.1 * k);
      r.ra('chest', 0.25 * k, 0.2 * k, 0);
      r.ra('neck', 0.4 * k, 0, 0.5 * k);
    },
    crawlDead(r, s) {
      const st = s.stateTime;
      const drop = easeIn(st / 0.45);
      const bounce = Math.sin(PI * clamp((st - 0.45) / 0.25, 0, 1)) * 0.04;
      mix(r, POSES.crawlIdle, collapsed, drop, s);
      r.pa('hips', 0, bounce, 0);
    },
    crawlKill(r, s) {
      const st = s.stateTime;
      mix(r, POSES.crawlIdle, risen, easeOut(st / 0.45), s);
      plant *= 1 - smooth(st / 0.3);
      const strike = easeIn((st - 0.72) / 0.14);
      r.ra('armR', -0.9 * strike, 0, 0);
      r.ra('foreR', 1.0 * strike, 0, 0);
      r.ra('neck', 0, 0, 0.3 * twitch);
    },
  });

  // Skirt: follow the legs below the waist, then keep it above the floor.
  const _k = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion();
  const legOff = [[V(0, 0, 0), V(0, 0, 0)], [V(0, 0, 0), V(0, 0, 0)]];
  const _m = new THREE.Matrix4();
  function deformSkirt() {
    for (let s = 0; s < 2; s++) {
      const th = H.thigh[s], sh = H.shin[s];
      _k.set(0, -D.thigh, 0).applyQuaternion(th.quaternion);
      _q.copy(th.quaternion).multiply(sh.quaternion);
      _a.set(0, -D.shin, 0).applyQuaternion(_q).add(_k);
      legOff[s][0].copy(_k).y += D.thigh;
      legOff[s][1].copy(_a).y += D.thigh + D.shin;
    }
    H.body.updateMatrix();
    H.hips.updateMatrix();
    _m.multiplyMatrices(H.body.matrix, H.hips.matrix);
    const e = _m.elements;
    const floor = 0.015;
    const pos = skirtGeo.attributes.position.array;
    const span = A.top - A.hem;
    for (let i = 0; i < pos.length; i += 3) {
      let x = rest[i], y = rest[i + 1], z = rest[i + 2];
      const h = (A.top - y) / span;
      const infl = smooth(h / 0.35);
      const wL = clamp(0.5 + x / 0.24, 0, 1);
      const kk = clamp((h - 0.1) / 0.4, 0, 1), ka = clamp((h - 0.5) / 0.5, 0, 1);
      let ox = 0, oy = 0, oz = 0;
      for (let s = 0; s < 2; s++) {
        const w = (s === 0 ? wL : 1 - wL) * infl;
        const K = legOff[s][0], An = legOff[s][1];
        const lx = lerp(K.x * kk, An.x, ka), ly = lerp(K.y * kk, An.y, ka), lz = lerp(K.z * kk, An.z, ka);
        const front = z > 0 ? (lz > 0 ? 1 : 0.35) : (lz < 0 ? 1 : 0.35);
        ox += lx * w; oy += ly * w * 0.8; oz += lz * w * front;
      }
      x += ox; y += oy; z += oz;
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      if (wy < floor) {
        const d = floor - wy;
        x += e[1] * d; y += e[5] * d; z += e[9] * d;
        const rl = Math.hypot(x, z) || 1;
        x += (x / rl) * d * 0.6; z += (z / rl) * d * 0.6;
      }
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
    }
    skirtGeo.attributes.position.needsUpdate = true;
    skirtGeo.computeVertexNormals();
  }

  function animate(dt, time, sIn) {
    const s = normState(sIn);
    t = time;
    const crawling = CRAWL_STATES.has(s.state);
    if (s.state === 'walk' || s.state === 'run') {
      const stride = s.state === 'run' ? clamp(1.1 + s.speed * 0.32, 1.6, 3.4) : clamp(0.8 + s.speed * 0.45, 0.9, 2.2);
      phase += (dt * s.speed) / stride;
    }
    if (s.state === 'crawl') crawlPhase += (dt * s.speed) / lerp(0.45, 0.85, clamp((s.speed - 1) / 2, 0, 1));
    // Head jerks: a new random offset every ~0.3 s, only some of the time.
    const h = wobble(Math.floor(t * 3.3) * 0.37, seed + 30);
    twitch += ((Math.abs(h) > 0.35 ? h : 0) - twitch) * damp(28, dt);
    candleTo(crawling && (s.state !== 'turn' || s.stateTime > 0.5));
    plant = 0;
    anim.update(dt, s, (r, st) => (POSES[st.state] || POSES.idle)(r, st));
    solveLegs(H);
    if (plant > 0.001) plantHands(Math.min(1, plant));
    deformSkirt();
    // Eyes: dark in prayer, faint embers otherwise, blazing once it hunts.
    let g = s.state === 'pray' ? 0 : crawling || s.state === 'notice' ? 1 : 0.15;
    if (s.state === 'turn') g = smooth((s.stateTime - 0.3) / 0.5) * 1.2;
    if (s.state === 'crawlKill' || s.state === 'kill') g = 1.5;
    const dead = s.state === 'dead' || s.state === 'crawlDead';
    if (dead) g = 0;
    glow += (g - glow) * damp(dead ? 1.5 : 8, dt);
    eyes.set(glow * (0.85 + 0.15 * wobble(t * 12, seed + 40)));
    // Candle stays upright and sways with motion; flame flickers.
    const moving = s.state === 'run' || s.state === 'crawl';
    const sway = 0.08 * wobble(t * 1.3, seed) + (moving ? -0.25 : s.state === 'walk' ? -0.08 : 0);
    keepUpright(candle, root, sway, 0.06 * wobble(t * 1.1, seed + 9));
    const f1 = wobble(t * 9, seed + 1), f2 = wobble(t * 13, seed + 5);
    flame.scale.set(1 + 0.12 * f1, 1 + 0.25 * f2 + (moving ? 0.3 : 0), 1 + 0.12 * f1);
    flame.rotation.set(0.12 * f2 - sway * 0.8, 0, 0.12 * f1);
    M.step(dt);
  }

  const hitSpheres = [
    hit(H.head, 0, 0.1, 0.1, 0.15, 'head'),
    hit(H.chest, 0, 0.05, 0.02, 0.22, 'body'),
    hit(H.spine, 0, 0.0, 0.0, 0.2, 'body'),
    hit(H.hips, 0, -0.3, 0.02, 0.24, 'limb'),
    hit(H.hips, 0, -0.68, 0.02, 0.26, 'limb'),
    hit(H.fore[0], 0, -0.12, 0, 0.1, 'limb'),
    hit(H.fore[1], 0, -0.12, 0, 0.1, 'limb'),
  ];

  return {
    root, height: 1.8, radius: 0.35,
    hitSpheres,
    // Kill-cam aim point, head space: the middle of the skull.
    focus: V(0, 0.12, 0.12),
    lights: [light(flame, 0, 0.02, 0, 0xe08a2c, 1.4, 5, 0.5)],
    timings: TIMINGS,
    states: ['idle', 'walk', 'run', 'notice', 'attack', 'hurt', 'dead', 'pray', 'kill', ...CRAWL_STATES],
    nodes: { head: H.head, knife, candle, flame },
    animate,
    flash: (v) => M.flash(v),
    dispose() { skirtGeo.dispose(); M.dispose(); eyes.dispose(); },
  };
}
