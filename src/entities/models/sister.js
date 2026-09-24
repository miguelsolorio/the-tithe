import * as THREE from 'three';
import {
  mesh, cached, normState, colorLerp, instMats,
  sweep, blob, prof, merge, mirrorX,
  Rig, Animator, clamp, lerp, smooth, easeOut, wobble, fbm3, PI, TAU,
} from './common.js';
import { humanoidDims, buildHumanoid, rigHumanoid, solveLegs, bipedGait, skirtDeformer } from './skeleton.js';

// The sister: young woman, pale and thin, dark messy hair, dirty grey-white
// shift dress, bare feet. Human and vulnerable. No hit spheres.
// States: 'caged' (fetal, lying on her side; root = cage floor centre),
// 'stand' (gets up over timings.stand.duration), 'idle' (hugging herself,
// trembling), 'walk', 'run', 'cower'.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D = humanoidDims({
  thigh: 0.42, shin: 0.4, ankleH: 0.065, hipW: 0.085, hipDrop: 0.045, spineY: 0.07, chestY: 0.19,
  neckY: 0.21, headY: 0.09, clavX: 0.025, clavY: 0.165, shoulderX: 0.13, upperArm: 0.27, forearm: 0.24,
});
const SKIN = 0xc8b4a6, SKIN_D = 0x8e7e7e, DRESS = 0x9d978b, DRESS_D = 0x4e4a42, HAIR = 0x16110e;

const skinCol = (o, t, a, p) => colorLerp(o, SKIN, SKIN_D, clamp(0.3 + fbm3(p.x * 7, p.y * 7, p.z * 7, 3, 31) * 1.2, 0, 1) * 0.45);
const dressCol = (o, t, a, p) => colorLerp(o, DRESS, DRESS_D, clamp(0.35 + fbm3(p.x * 5, p.y * 5, p.z * 5, 3, 7) * 1.3 + t * 0.35, 0, 1));
const gauss = (x, y, sx, sy) => Math.exp(-((x / sx) ** 2 + (y / sy) ** 2));

function headGeo() {
  return blob({
    r: 1, sx: 0.074, sy: 0.096, sz: 0.088, ws: 24, hs: 18,
    fn: (p, d) => {
      if (d.y < -0.15) p.x *= 1 - 0.34 * smooth((-d.y - 0.15) / 0.65);
      if (d.z > 0) {
        const f = d.z;
        p.z += 0.016 * gauss(d.x, d.y + 0.12, 0.09, 0.2) * f;
        p.z += 0.006 * gauss(d.x, d.y - 0.26, 0.5, 0.08) * f;
        p.z -= 0.008 * (gauss(d.x - 0.32, d.y - 0.13, 0.14, 0.09) + gauss(d.x + 0.32, d.y - 0.13, 0.14, 0.09));
        p.x += 0.006 * Math.sign(d.x) * gauss(Math.abs(d.x) - 0.55, d.y + 0.05, 0.15, 0.15);
        p.z += 0.004 * gauss(d.x, d.y + 0.43, 0.2, 0.05) * f;
        if (d.y < -0.55) p.z += 0.01 * f;
      }
      p.y += 0.1; p.z += 0.015;
    },
    color: (o, dy, a, p) => {
      skinCol(o, 0, 0, p);
      const dx = Math.sin(a), f = Math.cos(a);
      if (f > 0.5) {
        const sock = gauss(Math.abs(dx) - 0.32, dy - 0.12, 0.2, 0.12);
        if (sock > 0.2) colorLerp(o, o.getHex(), 0x7a6670, sock * 0.6);
        const lip = gauss(dx, dy + 0.43, 0.22, 0.05);
        if (lip > 0.3) colorLerp(o, o.getHex(), 0x9a6c6a, lip * 0.7);
      }
    },
    tile: 0.12,
  });
}

function hairGeo() {
  const parts = [];
  const c = V(0, 0.115, 0.012);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 56; i++) {
    const az = (i / 56) * TAU + (rnd() - 0.5) * 0.2;
    const front = Math.cos(az);
    if (front > 0.72 && rnd() > 0.25) continue;
    const pol = 0.12 + rnd() * 0.45;
    const dir = V(Math.sin(az) * Math.sin(pol), Math.cos(pol), Math.cos(az) * Math.sin(pol));
    const s = c.clone().addScaledVector(dir, 0.092);
    const out = V(Math.sin(az), 0, Math.cos(az));
    const len = front > 0.6 ? 0.2 + rnd() * 0.12 : 0.26 + rnd() * 0.16;
    const mid = c.clone().addScaledVector(out, 0.098 + rnd() * 0.012).setY(c.y + 0.0);
    const low = mid.clone().addScaledVector(out, 0.03 + rnd() * 0.02).setY(c.y - len * 0.6);
    if (front > 0.4 && rnd() > 0.12) {
      // Part around the face.
      const sx = Math.sign(Math.sin(az)) || 1;
      mid.set(sx * (0.08 + rnd() * 0.015), c.y + 0.01, 0.06);
      low.set(sx * (0.085 + rnd() * 0.02), c.y - len * 0.6, 0.035);
    } else if (front > 0.6) {
      mid.z = Math.max(mid.z, 0.115);
      low.z = Math.max(low.z, 0.12);
    }
    const end = low.clone().addScaledVector(out, 0.02).setY(c.y - len);
    end.x += (rnd() - 0.5) * 0.06;
    end.z += (rnd() - 0.5) * 0.04;
    const w = 0.007 + rnd() * 0.009;
    parts.push(sweep({ points: [s, mid, low, end], seg: 9, radial: 3, radius: (t) => [w * (1 - 0.6 * t), 0.003], hint: out, color: (o, t) => colorLerp(o, HAIR, 0x2a2018, t * 0.7), tile: 0.06, capStart: false }));
  }
  parts.push(blob({ r: 1, sx: 0.084, sy: 0.1, sz: 0.094, ws: 14, hs: 10, noise: 0.06, freq: 9, color: (o) => o.set(HAIR), fn: (p) => { p.add(c); p.z -= 0.008; if (p.y < 0.12) p.y = 0.12 + (p.y - 0.12) * 0.25; if (p.z > 0.05 && p.y < 0.17) p.z = 0.05 + (p.z - 0.05) * 0.2; } }));
  return merge(parts);
}

function handGeo() {
  const parts = [blob({ r: 1, sx: 0.016, sy: 0.042, sz: 0.034, ws: 8, hs: 6, color: skinCol, fn: (p) => { p.y -= 0.04; } })];
  for (let i = 0; i < 4; i++) {
    const z = -0.024 + i * 0.016, len = [0.065, 0.078, 0.074, 0.06][i];
    parts.push(sweep({ points: [V(0, -0.075, z), V(0.004, -0.075 - len * 0.55, z * 1.05), V(0.012, -0.075 - len, z * 1.08)], seg: 5, radial: 5, radius: (t) => 0.0068 - t * 0.0015, color: skinCol, tile: 0.1, capRound: 0.8 }));
  }
  parts.push(sweep({ points: [V(0.01, -0.025, 0.028), V(0.022, -0.055, 0.036), V(0.028, -0.078, 0.03)], seg: 4, radial: 5, radius: 0.0072, color: skinCol, tile: 0.1, capRound: 0.8 }));
  return merge(parts);
}

function footGeo() {
  const parts = [sweep({ points: [V(0, -0.02, -0.045), V(0, -0.035, 0.05), V(0, -0.052, 0.15)], seg: 8, radial: 9, hint: V(0, 1, 0), radius: prof([[0, 0.028, 0.03], [0.45, 0.034, 0.024], [1, 0.03, 0.012]]), shape: (t, a) => (Math.sin(a) < 0 ? 0.72 : 1), color: (o, t, a, p) => (Math.sin(a) < -0.3 ? o.set(0x4a3a30) : skinCol(o, t, a, p)), capRound: 0.8, tile: 0.1 })];
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.011;
    parts.push(blob({ r: 0.007 + (i === 0 ? 0.002 : 0), ws: 6, hs: 4, color: skinCol, fn: (p) => { p.x += -x; p.y -= 0.052; p.z += 0.155 - Math.abs(i - 0.5) * 0.004; } }));
  }
  return merge(parts);
}

function assets() {
  return cached('sister', () => {
    const A = {};
    A.skirtTop = 0.07;
    A.skirtHem = -(D.hipY - 0.4);
    const skirt = sweep({
      points: [V(0, A.skirtTop, 0), V(0, A.skirtHem, 0)], seg: 12, radial: 26, capStart: false, capEnd: false,
      radius: prof([[0, 0.13, 0.1], [0.22, 0.165, 0.13], [1, 0.22, 0.19]]),
      shape: (t, a) => 1 + (0.01 + 0.05 * t) * Math.sin(a * 6 + 0.8 + t * 1.5),
      color: dressCol, tile: 0.2,
    });
    const pos = skirt.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), k = smooth((A.skirtHem + 0.08 - y) / 0.08);
      if (k > 0) pos.setY(i, y + k * 0.035 * fbm3(pos.getX(i) * 16, 0, pos.getZ(i) * 16, 2, 5));
    }
    skirt.computeVertexNormals();
    A.skirt = skirt;
    A.dressTop = sweep({
      points: [V(0, -0.22, 0), V(0, 0.0, 0.01), V(0, 0.17, 0.0), V(0, 0.2, 0.0)], seg: 12, radial: 22, capStart: false, capEnd: false,
      radius: prof([[0, 0.125, 0.095], [0.45, 0.13, 0.1], [0.82, 0.16, 0.085], [1, 0.1, 0.07]]),
      shape: (t, a) => 1 + 0.015 * Math.sin(a * 5 + t * 4), color: dressCol, tile: 0.2,
    });
    A.sleeve = sweep({ points: [V(0, 0.03, 0), V(0, -0.1, 0)], seg: 3, radial: 12, radius: prof([[0, 0.046], [1, 0.05]]), capStart: false, capEnd: false, color: dressCol, tile: 0.2 });
    A.chestSkin = sweep({ points: [V(0, 0.1, 0.0), V(0, 0.25, 0.01)], seg: 4, radial: 14, radius: prof([[0, 0.12, 0.085], [0.5, 0.11, 0.07], [1, 0.05, 0.045]]), color: skinCol, tile: 0.15 });
    A.neck = sweep({ points: [V(0, -0.02, 0), V(0, 0.11, 0.015)], seg: 4, radial: 12, radius: [0.042, 0.04], color: skinCol, tile: 0.15 });
    A.head = headGeo();
    A.hair = hairGeo();
    A.eyes = merge([1, -1].map((x) => blob({ r: 0.0115, ws: 10, hs: 8, color: (o, dy, a) => { const d = Math.hypot(a, dy); o.set(d < 0.18 ? 0x060403 : d < 0.42 ? 0x3a2a1c : 0xd8d0c4); }, fn: (p) => { p.applyAxisAngle(V(0, 1, 0), x * 0.12); p.add(V(x * 0.03, 0.113, 0.089)); } })));
    const limb = (len, r0, r1, bulge = 0) => sweep({ points: [V(0, 0.03, 0), V(0, -len - 0.01, 0)], seg: 6, radial: 10, radius: (t) => lerp(r0, r1, t) + bulge * Math.sin(PI * clamp(t * 1.3, 0, 1)), color: skinCol, tile: 0.15 });
    A.upperArm = limb(D.upperArm, 0.034, 0.027, 0.004);
    A.forearm = limb(D.forearm, 0.028, 0.02, 0.004);
    A.thigh = limb(D.thigh, 0.066, 0.045, 0.006);
    A.shin = limb(D.shin, 0.046, 0.027, 0.01);
    A.hand = handGeo();
    A.handL = mirrorX(A.hand);
    A.foot = footGeo();
    return A;
  });
}

const TIMINGS = {
  stand: { duration: 1.5 },
  notice: { duration: 0.5 },
  hurt: { duration: 0.4 },
  attack: { duration: 1, hit: 0.5 },
  death: { duration: 1.5 },
};
const walkStride = (v) => clamp(0.7 + v * 0.4, 0.8, 1.8);
const runStride = (v) => clamp(1.0 + v * 0.3, 1.5, 3.0);

export function buildSister() {
  const A = assets();
  const M = instMats();
  const skin = M.get('skin'), cloth = M.get('cloth'), hair = M.get('hair'), eye = M.get('eye');
  const root = new THREE.Group();
  root.name = 'sister';
  const H = buildHumanoid(root, D);
  const skirtGeo = A.skirt.clone();
  skirtGeo.boundingSphere = new THREE.Sphere(V(0, -0.2, 0), 1.0);
  mesh(skirtGeo, cloth, H.hips);
  mesh(A.dressTop, cloth, H.chest);
  mesh(A.chestSkin, skin, H.chest);
  mesh(A.neck, skin, H.neck);
  mesh(A.head, skin, H.head);
  mesh(A.hair, hair, H.head);
  mesh(A.eyes, eye, H.head);
  for (let s = 0; s < 2; s++) {
    mesh(A.upperArm, skin, H.arm[s]);
    mesh(A.sleeve, cloth, H.arm[s]);
    mesh(A.forearm, skin, H.fore[s]);
    mesh(s === 0 ? A.handL : A.hand, skin, H.hand[s]);
    mesh(A.thigh, skin, H.thigh[s], { cast: false });
    mesh(A.shin, skin, H.shin[s]);
    mesh(A.foot, skin, H.foot[s]);
  }
  const deformSkirt = skirtDeformer(H, skirtGeo, A.skirtTop, A.skirtHem);

  const rig = new Rig();
  rigHumanoid(rig, H);
  rig.finalize();
  const anim = new Animator(rig, { stand: 0.05, caged: 0.5, cower: 0.35, run: 0.25 });
  let phase = 0, t = 0;
  const seed = Math.random() * 50;

  // kl legs, kt torso, kh head: 0 = standing, 1 = fetal. ks = rolled on side.
  function curl(r, kl, kt, kh, ks = 0) {
    r.p('footL', 0.09 - 0.02 * kl, D.ankleH, -0.03 * kl);
    r.p('footR', -0.09 + 0.02 * kl, D.ankleH, -0.03 * kl);
    r.r('footL', 0.5 * kl);
    r.r('footR', 0.5 * kl);
    r.p('hips', 0, -(D.hipY - 0.3) * kl, -0.1 * kl);
    r.r('hips', 0.55 * kl, 0, 0);
    r.p('body', 0.25 * ks, 0.2 * ks, -0.16 * ks);
    r.r('body', 0, 0, (PI / 2) * ks);
    r.r('spine', lerp(0.05, 0.75, kt), 0, 0);
    r.r('chest', lerp(0.08, 0.5, kt), 0, 0);
    r.r('neck', lerp(0.22, 0.55, kh), 0, 0);
    r.r('head', lerp(0.12, 0.45, kh), 0, 0);
    r.r('clavL', 0, 0, -0.08 * (1 - kt));
    r.r('clavR', 0, 0, 0.08 * (1 - kt));
    // Arms: hugging herself (standing) -> hugging the knees (fetal).
    r.r('armL', lerp(-0.35, -1.25, kt), lerp(-1.25, 0, kt), lerp(0.12, 0.1, kt));
    r.r('armR', lerp(-0.3, -1.2, kt), lerp(1.25, 0, kt), lerp(-0.12, -0.1, kt));
    r.r('foreL', lerp(-1.95, -1.5, kt), 0, 0);
    r.r('foreR', lerp(-1.9, -1.5, kt), 0, 0);
    r.r('handL', 0.2, 0, 0);
    r.r('handR', 0.2, 0, 0);
  }

  const tremble = (k) => Math.sin(t * 38 + seed) * 0.012 * k + Math.sin(t * 29 + seed * 2) * 0.008 * k;

  const POSES = {
    caged(r) {
      curl(r, 1, 1, 1, 1);
      r.ra('chest', 0.02 * Math.sin(t * 1.4) + tremble(0.6), 0, 0);
      r.ra('neck', tremble(0.5), 0, 0);
    },
    stand(r, s) {
      const st = s.stateTime;
      const ks = 1 - smooth(st / 0.55), kl = 1 - smooth((st - 0.35) / 0.9), kt = 1 - smooth((st - 0.45) / 0.85), kh = 1 - smooth((st - 1.0) / 0.5);
      curl(r, kl, kt, kh, ks);
    },
    idle(r) {
      curl(r, 0, 0, 0);
      const sw = Math.sin(t * 0.6);
      r.pa('hips', 0.015 * sw, -0.005, 0);
      r.ra('spine', tremble(1), 0, -0.02 * sw);
      r.ra('chest', 0.015 * Math.sin(t * 2.2) + tremble(1), 0, 0);
      r.ra('neck', tremble(1), 0.2 * wobble(t * 0.3, seed), 0);
      r.ra('armL', tremble(1.5), 0, 0);
      r.ra('armR', -tremble(1.5), 0, 0);
    },
    walk(r, s) {
      const run = s.state === 'run';
      bipedGait(r, H, {
        phase, amt: smooth(s.speed / 0.35), stride: run ? runStride(s.speed) : walkStride(s.speed),
        duty: run ? 0.38 : 0.6, lift: run ? 0.17 : 0.08, bob: run ? 0.04 : 0.02, sway: 0.02, twist: 0.08,
        lean: run ? 0.2 : 0.06, armSwing: run ? 0.65 : 0.12, elbow: run ? 1.3 : 1.4, width: 0.08,
      });
      r.r('neck', run ? -0.05 : 0.2, 0, 0);
      r.r('head', run ? 0 : 0.1, 0, 0);
      if (!run) {
        const sw = Math.sin(TAU * phase) * 0.08;
        r.r('armL', -0.45 + sw, 0.25, -0.3);
        r.r('armR', -0.4 - sw, -0.25, 0.3);
        r.r('foreL', -1.8, 0, 0);
        r.r('foreR', -1.75, 0, 0);
      }
    },
    cower(r) {
      r.p('footL', 0.12, D.ankleH, 0.06);
      r.p('footR', -0.12, D.ankleH, 0.02);
      r.p('hips', 0, -(D.hipY - 0.42), -0.12);
      r.r('hips', 0.3, 0, 0);
      r.r('spine', 0.55 + tremble(2), 0, 0);
      r.r('chest', 0.4, 0, 0);
      r.r('neck', 0.6 + tremble(2), 0, 0);
      r.r('head', 0.3, 0, 0);
      r.r('armL', -2.5 + tremble(3), 0, 0.35);
      r.r('armR', -2.45 - tremble(3), 0, -0.35);
      r.r('foreL', -1.95, 0, 0);
      r.r('foreR', -1.9, 0, 0);
    },
  };
  POSES.run = POSES.walk;
  POSES.hurt = POSES.cower;
  POSES.dead = POSES.caged;

  function animate(dt, time, sIn) {
    const s = normState(sIn);
    t = time;
    if (s.state === 'walk') phase += (dt * s.speed) / walkStride(s.speed);
    else if (s.state === 'run') phase += (dt * s.speed) / runStride(s.speed);
    anim.update(dt, s, (r, st) => (POSES[st.state] || POSES.idle)(r, st));
    solveLegs(H);
    deformSkirt();
    M.step(dt);
  }

  return {
    root, height: 1.65, radius: 0.28,
    hitSpheres: [],
    lights: [],
    timings: TIMINGS,
    states: ['caged', 'stand', 'idle', 'walk', 'run', 'cower'],
    nodes: { head: H.head, hands: H.hand },
    animate,
    flash: (v) => M.flash(v),
    dispose() { skirtGeo.dispose(); M.dispose(); },
  };
}
