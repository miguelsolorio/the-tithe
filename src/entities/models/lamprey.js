import * as THREE from 'three';
import {
  mesh, hit, instMats, cached, normState, progress, colorLerp,
  sweep, blob, prof, merge, xf, mirrorX, spike, flip,
  ik3, clamp, lerp, smooth, ramp, easeOut, easeIn, damp, wobble, fbm3, PI, TAU,
} from './common.js';

// Lamprey: 2.8 m eel whose body is re-swept every frame along an undulating
// spine (14 joint nodes), a round sucker mouth ringed with rows of teeth,
// and three pairs of pale human arms that plant and pull.
// Extra states: 'crawl' (walk/run map to it), 'lunge' (timings.lunge),
// 'dormant' (flat on the floor, top < 0.35 m).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const N = 14, RINGS = 44, RAD = 18, LEN = 2.8, HEAD_Z = 1.2;
const DORSAL = 0x1c2b2d, BELLY = 0xb3aa98, ARM = 0xbdb2a4, ARM_D = 0x6e6660;
const ARM_JOINTS = [2, 4, 6];
const L1 = 0.27, L2 = 0.25;

// Body radius profile along u (0 = head, 1 = tail tip): [side, vertical].
const RPROF = prof([[0, 0.125, 0.115], [0.06, 0.16, 0.14], [0.3, 0.17, 0.145], [0.6, 0.13, 0.11], [0.85, 0.065, 0.06], [1, 0.012, 0.012]]);
const FIN = (u) => smooth((u - 0.4) / 0.2) * (1 - smooth((u - 0.92) / 0.08));

function armColor(o, t, a, p) {
  colorLerp(o, ARM, ARM_D, clamp(0.35 + fbm3(p.x * 9, p.y * 9, p.z * 9, 2, 13) * 1.2, 0, 1) * 0.6);
}

function handGeo() {
  // Splayed hand, fingers along -Y (they get laid flat by the IK).
  const parts = [blob({ r: 1, sx: 0.045, sy: 0.05, sz: 0.018, ws: 10, hs: 6, color: armColor, fn: (p) => { p.y -= 0.045; } })];
  for (let i = 0; i < 4; i++) {
    const x = -0.03 + i * 0.02, len = [0.075, 0.09, 0.085, 0.068][i];
    const spread = (i - 1.5) * 0.012;
    parts.push(sweep({ points: [V(x, -0.085, 0), V(x + spread, -0.085 - len * 0.5, 0.008), V(x + spread * 1.6, -0.085 - len, -0.004)], seg: 5, radial: 5, radius: (t) => 0.0085 - t * 0.0025, color: (o, t, a, p) => { armColor(o, t, a, p); if (t > 0.85) o.set(0x2a2420); }, tile: 0.1, capRound: 0.8 }));
  }
  parts.push(sweep({ points: [V(0.04, -0.03, 0.005), V(0.065, -0.06, 0.01), V(0.08, -0.085, 0.0)], seg: 4, radial: 5, radius: 0.009, color: armColor, tile: 0.1 }));
  return merge(parts);
}

// Oral disc facing +Z: fleshy rim, funnel with concentric rows of teeth.
function mouthGeo() {
  const funnel = flip(sweep({
    points: [V(0, 0, 0.06), V(0, 0, 0.0), V(0, 0, -0.06)], seg: 8, radial: 24, capStart: false, capEnd: true,
    radius: prof([[0, 0.15], [0.35, 0.1], [1, 0.02]]),
    color: (o, t) => colorLerp(o, 0x7a2a2c, 0x0a0304, smooth((t - 0.3) / 0.6)), tile: 0.08,
  }));
  const rimG = sweep({ points: [...Array(29)].map((_, i) => V(Math.cos((i / 28) * TAU) * 0.15, Math.sin((i / 28) * TAU) * 0.15, 0.06)), seg: 28, radial: 8, radius: [0.03, 0.026], capStart: false, capEnd: false, color: (o, t, a) => colorLerp(o, 0x8a6a64, 0x5a3434, 0.5 + 0.5 * Math.sin(t * 40)), tile: 0.1 });
  return merge([funnel, rimG]);
}

function teethGeo() {
  const parts = [];
  const rows = [[0.13, 22, 0.022, 0.045], [0.105, 18, 0.02, 0.03], [0.078, 14, 0.017, 0.012], [0.05, 10, 0.014, -0.01]];
  for (const [r, n, len, z] of rows) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r * 10;
      const inward = V(-Math.cos(a), -Math.sin(a), 0.9).normalize();
      const g = spike({ len, r: len * 0.3, dir: [inward.x, inward.y, inward.z], radial: 5, seg: 2, color: (o) => o.set(0xd2c6a4), tip: 0.2 });
      parts.push(xf(g, [Math.cos(a) * r, Math.sin(a) * r, z]));
    }
  }
  return merge(parts);
}

function assets() {
  return cached('lamprey', () => {
    const A = {};
    const limb = (len, r0, r1) => sweep({ points: [V(0, 0.03, 0), V(0, -len * 0.5, 0.006), V(0, -len - 0.01, 0)], seg: 7, radial: 9, radius: (t) => lerp(r0, r1, t) + 0.008 * Math.sin(PI * clamp(t * 1.3, 0, 1)), color: armColor, tile: 0.12 });
    A.upper = limb(L1, 0.042, 0.034);
    A.fore = limb(L2, 0.036, 0.026);
    A.hand = handGeo();
    A.handL = mirrorX(A.hand);
    A.mouth = mouthGeo();
    A.teeth = teethGeo();
    A.eyes = merge([1, -1].map((x) => blob({ r: 0.018, ws: 8, hs: 6, color: (o, dy, a) => o.set(Math.abs(a) < 0.5 && Math.abs(dy) < 0.4 ? 0x0a0808 : 0x3a4040), fn: (p) => { p.applyAxisAngle(V(0, 1, 0), x * PI / 2); p.add(V(x * 0.135, 0.07, -0.08)); } })));
    // Static per-vertex data for the swept body: colours and UVs.
    const count = RINGS * (RAD + 1);
    const col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    const c = new THREE.Color();
    for (let k = 0; k < RINGS; k++) {
      const u = k / (RINGS - 1);
      for (let j = 0; j <= RAD; j++) {
        const a = (j / RAD) * TAU;
        const s = Math.sin(a);
        const n = fbm3(u * 18, Math.cos(a) * 2, s * 2, 3, 29);
        colorLerp(c, DORSAL, BELLY, smooth((-s - 0.1) / 0.5));
        if (s > -0.2) colorLerp(c, c.getHex(), 0x0c1416, clamp(n * 1.5 + 0.3, 0, 1) * 0.6);
        // Seven gill pores behind the head on each side.
        const g = (u - 0.07) / 0.012;
        if (u > 0.07 && u < 0.16 && Math.abs(Math.cos(a)) > 0.9 && Math.abs(s) < 0.2 && Math.round(g) % 2 === 0) c.set(0x050606);
        const i = k * (RAD + 1) + j;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        uv[i * 2] = (j / RAD) * 3;
        uv[i * 2 + 1] = (u * LEN) / 0.3;
      }
    }
    const idx = [];
    for (let k = 0; k < RINGS - 1; k++) {
      for (let j = 0; j < RAD; j++) {
        const a = k * (RAD + 1) + j, b = (k + 1) * (RAD + 1) + j;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    A.bodyCol = col;
    A.bodyUV = uv;
    A.bodyIdx = idx;
    return A;
  });
}

const TIMINGS = {
  attack: { duration: 0.8, hit: 0.4 },
  lunge: { duration: 1.0, hit: 0.45 },
  notice: { duration: 0.8 },
  hurt: { duration: 0.4 },
  death: { duration: 1.5 },
};
const armStride = (v) => clamp(0.35 + v * 0.2, 0.4, 1.0);
const KEYS = ['rear', 'amp', 'flare', 'extend', 'flat', 'roll', 'pitch', 'crawl', 'reach', 'fold', 'splay'];

export function buildLamprey() {
  const A = assets();
  const M = instMats();
  const eel = M.get('eel'), skin = M.get('skin'), teeth = M.get('teeth'), flesh = M.get('flesh');
  const root = new THREE.Group();
  root.name = 'lamprey';
  const body = new THREE.Group();
  root.add(body);

  // Per-instance swept body (positions/normals rewritten every frame).
  const count = RINGS * (RAD + 1);
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const nor = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('uv', new THREE.BufferAttribute(A.bodyUV, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(A.bodyCol, 3));
  geo.setIndex(A.bodyIdx);
  geo.boundingSphere = new THREE.Sphere(V(0, 0.3, -0.2), 2.5);
  mesh(geo, eel, body);

  const joints = [...Array(N)].map((_, i) => { const j = new THREE.Object3D(); j.name = 'spine' + i; body.add(j); return j; });
  const head = new THREE.Group();
  head.name = 'head';
  body.add(head);
  const mouth = new THREE.Group();
  mouth.position.z = 0.02;
  head.add(mouth);
  mesh(A.mouth, flesh, mouth);
  mesh(A.teeth, teeth, mouth);
  mesh(A.eyes, M.get('eye'), head);

  const arms = [];
  ARM_JOINTS.forEach((ji, k) => {
    for (const side of [1, -1]) {
      const sh = new THREE.Group();
      sh.position.set(side * 0.13, -0.03, 0);
      joints[ji].add(sh);
      const up = new THREE.Group(), fo = new THREE.Group(), ha = new THREE.Group();
      sh.add(up); fo.position.y = -L1; up.add(fo); ha.position.y = -L2; fo.add(ha);
      mesh(A.upper, skin, up);
      mesh(A.fore, skin, fo);
      mesh(side > 0 ? A.handL : A.hand, skin, ha);
      arms.push({ ji, side, up, fo, ha, off: k * 0.31 + (side > 0 ? 0 : 0.5) });
    }
  });

  const P = { rear: 0.08, amp: 0.25, flare: 0.15, extend: 0, flat: 0, roll: 0, pitch: 0, crawl: 0, reach: 0, fold: 0, splay: 0 };
  const T = { ...P };
  let wave = 0, armPhase = 0, t = 0, first = true;
  const seed = Math.random() * 50;

  function targets(s) {
    const st = s.stateTime;
    Object.assign(T, { rear: 0.08, amp: 0.25, flare: 0.15 + 0.08 * Math.sin(t * 2.1), extend: 0, flat: 0, roll: 0, pitch: 0.1 * wobble(t * 0.4, seed), crawl: 0, reach: 0, fold: 0, splay: 0 });
    switch (s.state) {
      case 'walk': case 'run': case 'crawl':
        Object.assign(T, { rear: 0.12, amp: 0.85, crawl: smooth(s.speed / 0.3), pitch: 0.05 });
        break;
      case 'notice':
        Object.assign(T, { rear: 0.45, flare: 0.65, amp: 0.35, pitch: -0.25 });
        break;
      case 'lunge': case 'attack': {
        const big = s.state === 'lunge';
        const d = TIMINGS[s.state].duration, h = TIMINGS[s.state].hit;
        const tt = progress(s, d) * d;
        const coil = smooth(tt / (h * 0.55)) * (1 - smooth((tt - h * 0.55) / (h * 0.25)));
        const burst = easeOut((tt - h * 0.55) / (h * 0.45)) * (1 - smooth((tt - h - 0.1) / (d - h - 0.1)));
        Object.assign(T, {
          extend: -0.25 * coil + (big ? 1.05 : 0.5) * burst, rear: 0.05 + (big ? 0.5 : 0.28) * burst - 0.05 * coil,
          flare: 0.05 + 0.95 * burst, amp: 0.3 + 0.4 * coil, reach: burst, pitch: -0.25 * burst + 0.2 * coil,
        });
        break;
      }
      case 'hurt': {
        const k = Math.sin(PI * clamp(st / 0.4, 0, 1));
        Object.assign(T, { amp: 0.4 + 1.3 * k, flare: 0.3 + 0.6 * k, rear: 0.1 + 0.12 * k, roll: 0.3 * k });
        break;
      }
      case 'dead': {
        const k = smooth(st / 1.5);
        Object.assign(T, { amp: 1.2 * (1 - k), flare: 0.75, rear: 0, flat: k, roll: 0.55 * k, splay: k, pitch: 0.15 * k });
        break;
      }
      case 'dormant':
        Object.assign(T, { amp: 0.06, flare: 0.0, rear: 0, flat: 1, fold: 1, pitch: 0.1 });
        break;
    }
  }

  const jp = [...Array(N)].map(() => new THREE.Vector3());
  const Q = [...Array(RINGS)].map(() => new THREE.Vector3());
  const F = [...Array(RINGS)].map(() => new THREE.Vector3());
  const up = new THREE.Vector3(), side = new THREE.Vector3(), tmp = new THREE.Vector3(), m4 = new THREE.Matrix4();

  function buildSpine() {
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), s = u * LEN;
      const r = RPROF(u);
      const lift = P.rear * (1 - smooth(u / 0.45)) ** 1.5 * (1 - P.flat * 0.8);
      const ext = P.extend * (1 - smooth(u / 0.6));
      const amp = (0.03 + 0.24 * u * u) * P.amp;
      jp[i].set(amp * Math.sin(TAU * (s / 1.4 - wave)), r[1] * (1 - 0.35 * P.flat) + lift, HEAD_Z - s + ext);
    }
    for (let k = 0; k < RINGS; k++) {
      const f = (k / (RINGS - 1)) * (N - 1);
      const i = Math.min(N - 2, Math.floor(f)), x = f - i;
      const p0 = jp[Math.max(0, i - 1)], p1 = jp[i], p2 = jp[i + 1], p3 = jp[Math.min(N - 1, i + 2)];
      const x2 = x * x, x3 = x2 * x;
      Q[k].set(0, 0, 0)
        .addScaledVector(p0, -0.5 * x3 + x2 - 0.5 * x)
        .addScaledVector(p1, 1.5 * x3 - 2.5 * x2 + 1)
        .addScaledVector(p2, -1.5 * x3 + 2 * x2 + 0.5 * x)
        .addScaledVector(p3, 0.5 * x3 - 0.5 * x2);
    }
    for (let k = 0; k < RINGS; k++) F[k].subVectors(Q[Math.max(0, k - 1)], Q[Math.min(RINGS - 1, k + 1)]).normalize();
  }

  // Frame at ring k: side (left), up, fwd -> writes into side/up.
  function frame(k) {
    const f = F[k];
    const roll = P.roll + 0.15 * P.amp * Math.sin(TAU * ((k / RINGS) * 2 - wave)) * (k / RINGS);
    up.set(-Math.sin(roll), Math.cos(roll), 0);
    side.crossVectors(up, f).normalize();
    up.crossVectors(f, side);
  }

  function sweepBody() {
    const pa = pos.array, na = nor.array;
    for (let k = 0; k < RINGS; k++) {
      const u = k / (RINGS - 1);
      frame(k);
      const r = RPROF(u);
      const rx = r[0], rz = r[1] * (1 - 0.35 * P.flat);
      const fin = FIN(u) * 0.5;
      for (let j = 0; j <= RAD; j++) {
        const a = (j / RAD) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const vz = rz * (sa < 0 ? 0.85 : 1 + fin * sa ** 12);
        const i = (k * (RAD + 1) + j) * 3;
        pa[i] = Q[k].x + side.x * rx * ca + up.x * vz * sa;
        pa[i + 1] = Q[k].y + side.y * rx * ca + up.y * vz * sa;
        pa[i + 2] = Q[k].z + side.z * rx * ca + up.z * vz * sa;
        tmp.copy(side).multiplyScalar(ca / rx).addScaledVector(up, sa / vz).normalize();
        na[i] = tmp.x; na[i + 1] = tmp.y; na[i + 2] = tmp.z;
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  function placeJoints() {
    for (let i = 0; i < N; i++) {
      const k = Math.round((i / (N - 1)) * (RINGS - 1));
      frame(k);
      joints[i].position.copy(jp[i]);
      m4.makeBasis(side, up, F[k]);
      joints[i].quaternion.setFromRotationMatrix(m4);
    }
    frame(0);
    head.position.copy(Q[0]);
    m4.makeBasis(side, up, F[0]);
    head.quaternion.setFromRotationMatrix(m4);
    head.rotateX(P.pitch);
    const fl = P.flare;
    mouth.scale.set(lerp(0.55, 1.3, fl), lerp(0.55, 1.3, fl), lerp(0.75, 1.1, fl));
  }

  const tgt = new THREE.Vector3(), pole = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), e = new THREE.Euler();
  function solveArms() {
    root.updateMatrixWorld(true);
    body.getWorldQuaternion(qb);
    for (const a of arms) {
      const J = jp[a.ji];
      let p = armPhase + a.off;
      p -= Math.floor(p);
      const half = armStride(3) * 0.3 * 0.5 * P.crawl;
      let z = 0, lift = 0;
      if (p < 0.6) z = half - (2 * half * p) / 0.6;
      else { const u = (p - 0.6) / 0.4; z = -half + 2 * half * smooth(u); lift = 0.12 * Math.sin(PI * u) * P.crawl; }
      tgt.set(J.x + a.side * 0.34, 0.04 + lift, J.z + 0.1 + z);
      tgt.lerp(tmp.set(J.x + a.side * 0.2, 0.04, J.z - 0.22), P.fold);
      tgt.lerp(tmp.set(J.x + a.side * 0.3, 0.22, J.z + 0.5), P.reach);
      tgt.lerp(tmp.set(J.x + a.side * 0.5, 0.04, J.z + 0.05), P.splay);
      body.localToWorld(tgt);
      pole.set(J.x + a.side * 0.5, J.y + 0.4, J.z - 0.3);
      body.localToWorld(pole);
      ik3(a.up, a.fo, L1, L2, tgt, pole, 1);
      // Hand flat on the ground, fingers forward/out.
      a.fo.updateWorldMatrix(true, false);
      a.fo.getWorldQuaternion(qa).invert();
      e.set(-PI / 2 + 0.25 * lift / 0.12, a.side * 0.35, 0, 'YXZ');
      a.ha.quaternion.copy(qa.multiply(qb.clone().multiply(new THREE.Quaternion().setFromEuler(e))));
    }
  }

  function animate(dt, time, sIn) {
    const s = normState(sIn);
    t = time;
    targets(s);
    const fast = s.state === 'lunge' || s.state === 'attack' || s.state === 'hurt';
    const k = first ? 1 : damp(fast ? 18 : 5, dt);
    first = false;
    for (const key of KEYS) P[key] += (T[key] - P[key]) * k;
    const moving = s.state === 'walk' || s.state === 'run' || s.state === 'crawl';
    wave += dt * (moving ? s.speed / (1.4 * 0.7) : s.state === 'dormant' ? 0.05 : s.state === 'hurt' ? 2.5 : 0.25);
    if (moving) armPhase += (dt * s.speed) / armStride(s.speed);
    buildSpine();
    sweepBody();
    placeJoints();
    solveArms();
    M.step(dt);
  }

  return {
    root, height: 0.5, radius: 0.45,
    hitSpheres: [
      hit(joints[0], 0, 0, 0.05, 0.2, 'head'),
      hit(joints[3], 0, 0, 0, 0.19, 'body'),
      hit(joints[6], 0, 0, 0, 0.17, 'body'),
      hit(joints[9], 0, 0, 0, 0.13, 'body'),
      hit(joints[12], 0, 0, 0, 0.08, 'limb'),
      hit(arms[0].fo, 0, -0.1, 0, 0.07, 'limb'),
      hit(arms[1].fo, 0, -0.1, 0, 0.07, 'limb'),
    ],
    lights: [],
    timings: TIMINGS,
    states: ['idle', 'crawl', 'notice', 'attack', 'lunge', 'hurt', 'dead', 'dormant'],
    nodes: { head, mouth, joints },
    animate,
    flash: (v) => M.flash(v),
    dispose() { geo.dispose(); M.dispose(); },
  };
}
