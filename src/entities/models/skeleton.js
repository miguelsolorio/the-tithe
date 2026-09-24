import * as THREE from 'three';
import { pivot } from './common.js';
import { ik2, PI, TAU, lerp, smooth, sat } from './rig.js';

// Humanoid pivot hierarchy + biped gait shared by the acolyte, drowned,
// skinless and sister. Model faces +Z, left side is +X. Limb bones rest
// along -Y; feet point along +Z.

export function humanoidDims(o = {}) {
  const d = {
    thigh: 0.45, shin: 0.43, ankleH: 0.07, hipW: 0.1, hipDrop: 0.05,
    spineY: 0.08, chestY: 0.2, neckY: 0.25, neckZ: 0, headY: 0.1,
    clavX: 0.03, clavY: 0.18, clavZ: 0, shoulderX: 0.16, upperArm: 0.29, forearm: 0.26,
    ...o,
  };
  d.leg = d.thigh + d.shin;
  d.hipY = d.hipDrop + d.ankleH + d.leg * 0.985;
  return d;
}

export function buildHumanoid(root, d) {
  const H = { d };
  H.body = pivot(root, 0, 0, 0, 'body');
  H.hips = pivot(H.body, 0, d.hipY, 0, 'hips');
  H.spine = pivot(H.hips, 0, d.spineY, 0, 'spine');
  H.chest = pivot(H.spine, 0, d.chestY, 0, 'chest');
  H.neck = pivot(H.chest, 0, d.neckY, d.neckZ, 'neck');
  H.head = pivot(H.neck, 0, d.headY, 0, 'head');
  H.clav = [], H.arm = [], H.fore = [], H.hand = [], H.thigh = [], H.shin = [], H.foot = [];
  for (let s = 0; s < 2; s++) {
    const x = s === 0 ? 1 : -1;
    const c = pivot(H.chest, x * d.clavX, d.clavY, d.clavZ, `clav${s}`);
    const a = pivot(c, x * d.shoulderX, 0, 0, `arm${s}`);
    const f = pivot(a, 0, -d.upperArm, 0, `fore${s}`);
    const h = pivot(f, 0, -d.forearm, 0, `hand${s}`);
    const t = pivot(H.hips, x * d.hipW, -d.hipDrop, 0, `thigh${s}`);
    t.rotation.order = 'ZXY';
    const k = pivot(t, 0, -d.thigh, 0, `shin${s}`);
    const ft = pivot(k, 0, -d.shin, 0, `foot${s}`);
    H.clav.push(c); H.arm.push(a); H.fore.push(f); H.hand.push(h);
    H.thigh.push(t); H.shin.push(k); H.foot.push(ft);
  }
  return H;
}

const SIDE = ['L', 'R'];

// Rig channels: body/hips with position, spine chain, arms (FK) and virtual
// foot targets footL/footR = ankle position in body space (+ rot.x = foot
// pitch relative to the ground).
export function rigHumanoid(rig, H) {
  rig.add('body', H.body, true);
  rig.add('hips', H.hips, true);
  rig.add('spine', H.spine);
  rig.add('chest', H.chest);
  rig.add('neck', H.neck);
  rig.add('head', H.head);
  for (let s = 0; s < 2; s++) {
    rig.add('clav' + SIDE[s], H.clav[s]);
    rig.add('arm' + SIDE[s], H.arm[s]);
    rig.add('fore' + SIDE[s], H.fore[s]);
    rig.add('hand' + SIDE[s], H.hand[s]);
    H['footT' + SIDE[s]] = rig.addVirtual('foot' + SIDE[s]);
  }
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ik = [0, 0];

// Solve both legs toward their virtual targets (call after rig.apply()).
export function solveLegs(H) {
  const d = H.d;
  _q.copy(H.hips.quaternion).invert();
  for (let s = 0; s < 2; s++) {
    const tgt = H['footT' + SIDE[s]];
    _v.copy(tgt.position).sub(H.hips.position).applyQuaternion(_q).sub(H.thigh[s].position);
    const roll = Math.atan2(_v.x, Math.max(-_v.y, 0.15));
    const dn = _v.x * Math.sin(roll) - _v.y * Math.cos(roll);
    ik2(d.thigh, d.shin, _v.z, -dn, 1, _ik);
    H.thigh[s].rotation.set(_ik[0], 0, roll);
    H.shin[s].rotation.set(_ik[1], 0, 0);
    H.foot[s].rotation.set(tgt.rotation.x - (_ik[0] + _ik[1]) - H.hips.rotation.x, 0, -roll * 0.7);
  }
}

// Foot trajectory for gait phase p: stance [0, duty) slides back linearly
// (planted), swing returns forward with lift. Writes out = [z, lift, pitch].
export function footCycle(p, duty, stride, lift, out) {
  p -= Math.floor(p);
  const half = stride * duty * 0.5;
  if (p < duty) {
    const u = p / duty;
    out[0] = half - 2 * half * u;
    out[1] = 0;
    out[2] = u < 0.15 ? lerp(-0.25, 0, u / 0.15) : u > 0.7 ? lerp(0, 0.5, (u - 0.7) / 0.3) : 0;
  } else {
    const u = (p - duty) / (1 - duty);
    const e = smooth(u);
    out[0] = -half + 2 * half * e;
    out[1] = lift * Math.sin(PI * u) * (u < 0.5 ? 1 : 1 - 0.3 * (u - 0.5));
    out[2] = u < 0.4 ? lerp(0.5, 0.2, u / 0.4) : lerp(0.2, -0.25, (u - 0.4) / 0.6);
  }
  return out;
}

const _f = [0, 0, 0];

// Writes a walk/run cycle into the rig. g = { phase, amt (0..1 blend-in),
// stride, duty, lift, bob, sway, twist, lean, armSwing, elbow, width, ankleH }.
// Returns the vertical hips offset used.
export function bipedGait(rig, H, g) {
  const d = H.d;
  const amt = g.amt ?? 1;
  const p = g.phase;
  let bob = 0;
  for (let s = 0; s < 2; s++) {
    const ps = p + s * 0.5;
    footCycle(ps, g.duty, g.stride, g.lift, _f);
    const x = (s === 0 ? 1 : -1) * (g.width ?? d.hipW);
    rig.p('foot' + SIDE[s], x, d.ankleH + _f[1] * amt, _f[0] * amt + (g.footZ ?? 0));
    rig.r('foot' + SIDE[s], _f[2] * amt);
  }
  // Hips: lowest just after contact, highest mid-stance (twice per cycle).
  const c2 = Math.cos(TAU * 2 * (p - g.duty * 0.5));
  bob = (g.bob ?? 0.03) * c2 * amt - (g.crouch ?? 0);
  const sway = (g.sway ?? 0.02) * Math.sin(TAU * (p - g.duty * 0.5)) * amt;
  rig.p('hips', sway, bob, 0);
  const tw = (g.twist ?? 0.12) * Math.sin(TAU * p) * amt;
  rig.r('hips', 0, tw * 0.5, -sway * 1.5);
  rig.r('spine', (g.lean ?? 0.05) * 0.5, -tw * 0.6, sway * 1.2);
  rig.r('chest', (g.lean ?? 0.05) * 0.5 + 0.02 * c2 * amt, -tw * 0.6, 0);
  const sw = (g.armSwing ?? 0.35) * amt;
  for (let s = 0; s < 2; s++) {
    const ph = Math.sin(TAU * (p + s * 0.5));
    const x = s === 0 ? 1 : -1;
    rig.r('arm' + SIDE[s], ph * sw + (g.armPitch ?? 0), 0, x * (g.armOut ?? 0.08));
    rig.r('fore' + SIDE[s], -(g.elbow ?? 0.25) - Math.max(0, ph) * sw * 0.6, 0, 0);
  }
  return bob;
}

// Standing foot targets.
export function stand(rig, H, spread = 1, zL = 0, zR = 0) {
  const d = H.d;
  rig.p('footL', d.hipW * spread, d.ankleH, zL);
  rig.p('footR', -d.hipW * spread, d.ankleH, zR);
}

// Keep an object's world orientation upright (candles, hanging cages),
// optionally with a sway tilt. Its parent's world matrix must be current.
const _qp = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _e = new THREE.Euler();
export function keepUpright(obj, root, swayX = 0, swayZ = 0) {
  obj.parent.updateWorldMatrix(true, false);
  obj.parent.getWorldQuaternion(_qp).invert();
  root.getWorldQuaternion(_qs);
  _e.set(swayX, 0, swayZ);
  obj.quaternion.copy(_qp.multiply(_qs).multiply(_q.setFromEuler(_e)));
}

// CPU skirt: vertices (hips space, per-instance geometry) follow the legs
// below the waist and are kept above the floor (pooling). Returns update().
export function skirtDeformer(H, geo, top, hem, floor = 0.015) {
  const d = H.d;
  const rest = Float32Array.from(geo.attributes.position.array);
  const K = [new THREE.Vector3(), new THREE.Vector3()], An = [new THREE.Vector3(), new THREE.Vector3()];
  const qa = new THREE.Quaternion(), m = new THREE.Matrix4();
  const span = top - hem;
  return function update() {
    for (let s = 0; s < 2; s++) {
      const th = H.thigh[s], sh = H.shin[s];
      K[s].set(0, -d.thigh, 0).applyQuaternion(th.quaternion);
      qa.copy(th.quaternion).multiply(sh.quaternion);
      An[s].set(0, -d.shin, 0).applyQuaternion(qa).add(K[s]);
      K[s].y += d.thigh;
      An[s].y += d.thigh + d.shin;
    }
    H.body.updateMatrix();
    H.hips.updateMatrix();
    m.multiplyMatrices(H.body.matrix, H.hips.matrix);
    const e = m.elements;
    const pos = geo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      let x = rest[i], y = rest[i + 1], z = rest[i + 2];
      const h = (top - y) / span;
      const infl = smooth(h / 0.35);
      const wL = Math.min(1, Math.max(0, 0.5 + x / 0.24));
      const kk = Math.min(1, Math.max(0, (h - 0.1) / 0.4)), ka = Math.min(1, Math.max(0, (h - 0.5) / 0.5));
      let ox = 0, oy = 0, oz = 0;
      for (let s = 0; s < 2; s++) {
        const w = (s === 0 ? wL : 1 - wL) * infl;
        const lx = lerp(K[s].x * kk, An[s].x, ka), ly = lerp(K[s].y * kk, An[s].y, ka), lz = lerp(K[s].z * kk, An[s].z, ka);
        const front = z > 0 ? (lz > 0 ? 1 : 0.35) : (lz < 0 ? 1 : 0.35);
        ox += lx * w; oy += ly * w * 0.8; oz += lz * w * front;
      }
      x += ox; y += oy; z += oz;
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      if (wy < floor) {
        const dd = floor - wy;
        x += e[1] * dd; y += e[5] * dd; z += e[9] * dd;
        const rl = Math.hypot(x, z) || 1;
        x += (x / rl) * dd * 0.6; z += (z / rl) * dd * 0.6;
      }
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
}

export { sat };
