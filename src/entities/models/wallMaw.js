import * as THREE from 'three';
import {
  mesh, hit, light, instMats, mat, cached, normState, colorLerp, prep,
  sweep, blob, merge, xf, spike, flip, glowEyes,
  clamp, lerp, smooth, easeOut, easeIn, damp, wobble, fbm3, PI, TAU,
} from './common.js';

// Wall maw: a clam-like pair of lipped jaws ringed with long teeth, on a
// thick fleshy stalk that hides inside the wall. Origin = wall surface,
// +Z points out into the corridor. States: 'dormant' (closed, breathing),
// 'lunge' (stalk shoots ~1.7 m out, jaws snap shut at timings.lunge.hit),
// 'retract', 'hurt', 'dead' (limp, sagging open). 'idle'/'notice'/'attack'
// map to dormant/dormant+twitch/lunge. 'kill' reaches for s.reach (root
// space, your eyes) and closes the jaws around it.
// It breathes: s.breath (0 out .. 1 in) swells the flesh around the hole and
// parts the jaws on strings of spit; s.glow lights the throat red.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RX = 0.46, RZ = 0.42, HINGE = -0.28, REACH = 1.7;
const RINGS = 24, RAD = 20;

const fleshCol = (base, dark, k = 0.6) => (o, t, a, p) => colorLerp(o, base, dark, clamp(0.4 + fbm3(p.x * 7, p.y * 7, p.z * 7, 3, 5) * 1.3, 0, 1) * k);

// Jaw half-shell (upper: sign 1, lower: -1) in hinge space.
function jawGeo(sign) {
  const ry = sign > 0 ? 0.26 : 0.2;
  const shell = (s, flipIt, col) => {
    const g = prep(new THREE.SphereGeometry(1, 22, 8, 0, TAU, sign > 0 ? 0 : PI / 2, PI / 2), col);
    const pos = g.attributes.position, d = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i);
      const n = 1 + 0.06 * fbm3(d.x * 3, d.y * 3, d.z * 3, 2, 11) * s;
      pos.setXYZ(i, d.x * RX * s * n, d.y * ry * s * n, d.z * RZ * s * n - HINGE);
    }
    g.computeVertexNormals();
    return flipIt ? flip(g) : g;
  };
  const outer = shell(1, false, fleshCol(0x6a1016, 0x2a0508, 0.8));
  const inner = shell(0.93, true, (o) => o.set(0x2a0406));
  const rimPts = [...Array(41)].map((_, i) => { const a = (i / 40) * TAU; return V(Math.cos(a) * RX, 0, Math.sin(a) * RZ - HINGE); });
  const lip = sweep({ points: rimPts, seg: 40, radial: 8, radius: [0.055, 0.05], capStart: false, capEnd: false, hint: V(0, sign, 0), bumps: { amp: 0.15, freq: 12, seed: sign + 3 }, color: fleshCol(0x9a4442, 0x5a1a1c, 0.7), tile: 0.1 });
  return merge([outer, inner, lip]);
}

function teethGeo(sign) {
  const parts = [];
  const n = 17;
  for (let i = 0; i < n; i++) {
    const a = lerp(0.12, PI - 0.12, i / (n - 1)) + (sign < 0 ? 0.08 : 0);
    const x = Math.cos(a) * RX * 0.9, z = Math.sin(a) * RZ * 0.9 - HINGE;
    const len = (0.13 + 0.07 * Math.sin(a)) * (0.85 + 0.3 * ((i * 7) % 5) / 5);
    const dir = V(-Math.cos(a) * 0.45, -sign, -Math.sin(a) * 0.45).normalize();
    parts.push(xf(spike({ len, r: 0.022, curve: 0.2, dir: [dir.x, dir.y, dir.z], bend: [-Math.cos(a), 0, -Math.sin(a)], radial: 6, seg: 3, color: (o, t) => colorLerp(o, 0x8a6a50, 0xd8ccb0, smooth(t * 3)), tip: 0.1 }), [x, sign * 0.02, z]));
  }
  // Second, shorter row further in.
  for (let i = 0; i < 12; i++) {
    const a = lerp(0.3, PI - 0.3, i / 11);
    const x = Math.cos(a) * RX * 0.75, z = Math.sin(a) * RZ * 0.75 - HINGE;
    const dir = V(-Math.cos(a) * 0.6, -sign, -Math.sin(a) * 0.6).normalize();
    parts.push(xf(spike({ len: 0.08, r: 0.015, dir: [dir.x, dir.y, dir.z], radial: 5, seg: 2, color: (o) => o.set(0xc8b898), tip: 0.15 }), [x, sign * 0.03, z]));
  }
  return merge(parts);
}

function collarGeo() {
  const pts = [...Array(33)].map((_, i) => { const a = (i / 32) * TAU; return V(Math.cos(a) * 0.62, Math.sin(a) * 0.58, 0.02); });
  const ring = sweep({ points: pts, seg: 48, radial: 12, radius: [0.2, 0.14], hint: V(0, 0, 1), capStart: false, capEnd: false, bumps: { amp: 0.2, freq: 5, seed: 21 }, color: fleshCol(0x5a0a10, 0x220305, 0.8), tile: 0.15 });
  const veins = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    const p = [];
    for (let k = 0; k <= 4; k++) {
      const r = 0.75 + k * 0.22;
      const aa = a + 0.18 * Math.sin(k * 1.7 + i);
      p.push(V(Math.cos(aa) * r, Math.sin(aa) * r, 0.012));
    }
    veins.push(sweep({ points: p, seg: 12, radial: 5, radius: (t) => 0.035 * (1 - 0.8 * t), color: fleshCol(0x3a0610, 0x1a0206, 0.5), tile: 0.1, capStart: false }));
  }
  const hole = blob({ r: 1, sx: 0.5, sy: 0.46, sz: 0.1, ws: 16, hs: 6, color: (o) => o.set(0x050101), fn: (p) => { p.z -= 0.12; } });
  return merge([ring, ...veins, hole]);
}

// A swollen ring of wall flesh around the collar that rises with each breath.
function bulgeGeo() {
  const pts = [...Array(33)].map((_, i) => { const a = (i / 32) * TAU; return V(Math.cos(a) * 0.92, Math.sin(a) * 0.85, -0.16); });
  return sweep({ points: pts, seg: 48, radial: 12, radius: [0.34, 0.24], hint: V(0, 0, 1), capStart: false, capEnd: false, bumps: { amp: 0.35, freq: 9, seed: 33 }, color: fleshCol(0x3a080c, 0x140204, 0.9), tile: 0.2 });
}

// Strings of spit between the jaws (front arc, jaw space angles).
const SPIT = [1.12, 1.42, 1.72, 2.02];

function assets() {
  return cached('wallMaw', () => ({
    upper: jawGeo(1), lower: jawGeo(-1), teethU: teethGeo(1), teethL: teethGeo(-1), collar: collarGeo(), bulge: bulgeGeo(),
    strand: new THREE.CylinderGeometry(1, 1, 1, 5, 1, true),
    throat: blob({ r: 1, sx: 0.3, sy: 0.18, sz: 0.1, ws: 12, hs: 6, color: (o) => o.set(0x000000), fn: (p) => { p.z -= 0.2; } }),
  }));
}

const TIMINGS = {
  lunge: { duration: 1.2, hit: 0.35 },
  attack: { duration: 1.2, hit: 0.35 },
  retract: { duration: 0.8 },
  notice: { duration: 0.6 },
  hurt: { duration: 0.4 },
  death: { duration: 1.5 },
};

export function buildWallMaw() {
  const A = assets();
  const M = instMats();
  const flesh = M.get('flesh'), teeth = M.get('teeth');
  const root = new THREE.Group();
  root.name = 'wallMaw';
  const collar = mesh(A.collar, flesh, root);
  const bulge = mesh(A.bulge, flesh, root);
  const head = new THREE.Group();
  head.name = 'mouth';
  root.add(head);
  const jawU = new THREE.Group(), jawL = new THREE.Group();
  jawU.position.z = HINGE; jawL.position.z = HINGE;
  head.add(jawU, jawL);
  mesh(A.upper, flesh, jawU);
  mesh(A.teethU, teeth, jawU);
  mesh(A.lower, flesh, jawL);
  mesh(A.teethL, teeth, jawL);
  mesh(A.throat, mat('dark'), head, { cast: false });
  const stalkMid = new THREE.Object3D();
  root.add(stalkMid);
  // The light in its throat: an additive glow plus a real red light (lights[0]).
  const glow = glowEyes(head, [V(0, -0.02, -0.075)], { r: 0.045, color: 0xff2a10 });
  const spitMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c4, roughness: 0.12, transparent: true, opacity: 0, depthWrite: false });
  const strands = SPIT.map(() => { const m = new THREE.Mesh(A.strand, spitMat); m.castShadow = false; head.add(m); return m; });

  // Per-instance stalk: swept each frame from inside the wall to the head.
  const count = RINGS * (RAD + 1);
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const nor = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const col = new Float32Array(count * 3), uv = new Float32Array(count * 2), idx = [];
  const c = new THREE.Color();
  for (let k = 0; k < RINGS; k++) {
    for (let j = 0; j <= RAD; j++) {
      const i = k * (RAD + 1) + j, a = (j / RAD) * TAU;
      colorLerp(c, 0x6a0e14, 0x2a0406, clamp(0.4 + fbm3(k * 0.4, Math.cos(a) * 2, Math.sin(a) * 2, 3, 9) * 1.4, 0, 1) * 0.8);
      col.set([c.r, c.g, c.b], i * 3);
      uv.set([(j / RAD) * 4, k * 0.4], i * 2);
      if (k < RINGS - 1 && j < RAD) { const b = i + RAD + 1; idx.push(i, i + 1, b + 1, i, b + 1, b); }
    }
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(V(0, 0, 0.6), 2.0);
  mesh(geo, flesh, root);

  const P = { ext: 0, open: 0, droop: 0, shake: 0, pulse: 1, kx: 0, ky: 0, kill: 0 };
  const T = { ...P };
  let t = 0, first = true;
  const seed = Math.random() * 50;

  function targets(s) {
    const st = s.stateTime;
    const br = s.breath ?? 0.5 + 0.5 * Math.sin(t * 1.1);
    Object.assign(T, { ext: 0, open: 0.05 + 0.12 * br, droop: 0, shake: 0, pulse: 0.98 + 0.06 * br, kx: 0, ky: 0, kill: 0 });
    switch (s.state) {
      case 'kill': {
        // Out of the wall to just short of your face, gaping, then shut on you.
        const R = s.reach;
        T.kill = 1;
        T.ext = R ? clamp(R.z - 0.14 - 0.72, 0, 3.0) : REACH;
        T.kx = R ? R.x : 0;
        T.ky = R ? R.y - 0.05 : 0;
        T.open = st < 0.5 ? 1 : 0.04;
        T.shake = st > 0.5 ? 0.5 * (1 - smooth((st - 0.5) / 0.6)) : 0.12;
        T.pulse = 1.05;
        break;
      }
      case 'notice':
        T.open = 0.15 + 0.1 * Math.sin(st * 20); T.shake = 0.3;
        break;
      case 'lunge': case 'attack': {
        const h = TIMINGS.lunge.hit;
        T.ext = REACH * easeOut((st - 0.04) / (h - 0.1));
        T.open = st < h - 0.06 ? smooth(st / 0.12) : 1 - easeIn((st - (h - 0.06)) / 0.06);
        if (st > h + 0.05) T.open = 0.06 + 0.06 * Math.max(0, Math.sin(st * 14));
        T.shake = st > h ? 0.4 * (1 - smooth((st - h) / 0.5)) : 0;
        break;
      }
      case 'retract':
        T.ext = 0; T.open = 0.05;
        break;
      case 'hurt': {
        const k = Math.sin(PI * clamp(st / 0.4, 0, 1));
        T.ext = P.ext * 0.8; T.open = 0.45 * k; T.shake = k;
        break;
      }
      case 'dead':
        T.ext = P.ext; T.open = 0.75 * smooth(st / 1.2); T.droop = smooth(st / 1.4); T.pulse = 1;
        break;
    }
  }

  const b0 = new THREE.Vector3(), b1 = new THREE.Vector3(), b2 = new THREE.Vector3(), b3 = new THREE.Vector3();
  const q = new THREE.Vector3(), f = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();

  const qs = new THREE.Vector3(), qe = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  // Jaw space -> head space for a point on a jaw rim (the jaws only pitch).
  function rim(jawObj, a, y, out) {
    const z = Math.sin(a) * RZ * 0.82 - HINGE, x = Math.cos(a) * RX * 0.66, th = jawObj.rotation.x;
    return out.set(x, y * Math.cos(th) - z * Math.sin(th), HINGE + y * Math.sin(th) + z * Math.cos(th));
  }
  function updateSpit() {
    const o = P.open;
    spitMat.opacity = 0.75 * smooth((o - 0.04) / 0.05) * (1 - smooth((o - 0.35) / 0.1));
    strands.forEach((m, i) => {
      m.visible = spitMat.opacity > 0.01;
      if (!m.visible) return;
      rim(jawU, SPIT[i], -0.01, qs);
      rim(jawL, SPIT[i] + 0.06, 0.01, qe);
      m.position.addVectors(qs, qe).multiplyScalar(0.5);
      m.position.y -= 0.012;
      const len = qs.distanceTo(qe);
      m.quaternion.setFromUnitVectors(Y, qe.sub(qs).normalize());
      const w = 0.0085 - (i % 2) * 0.0025;
      m.scale.set(w, len, w);
    });
  }

  function update() {
    const e = P.ext;
    const sag = (0.12 * (e / REACH) ** 2 + 0.35 * P.droop * (0.3 + e / REACH)) * (1 - P.kill);
    const sh = P.shake * 0.05;
    head.position.set(sh * wobble(t * 30, seed) + P.kx, -sag + sh * wobble(t * 27, seed + 1) + P.ky, 0.14 + e);
    head.rotation.set(0.25 * P.droop + 0.15 * (e / REACH) ** 2 * 0, 0.05 * wobble(t * 0.4, seed + 2) * (1 - P.droop), 0.1 * P.droop);
    head.scale.setScalar(P.pulse);
    const o = P.open;
    jawU.rotation.x = -0.55 * o * (1 - 0.6 * P.droop);
    jawL.rotation.x = 0.5 * o * (1 + 0.5 * P.droop);
    // Stalk: cubic Bezier from inside the wall to the back of the head.
    fwd.set(0, 0, 1).applyEuler(head.rotation);
    b0.set(0, 0, -1.4);
    b1.set(0, 0, -0.4);
    b3.copy(head.position).addScaledVector(fwd, HINGE + 0.05);
    b2.copy(b3).addScaledVector(fwd, -Math.max(0.3, e * 0.4));
    const pa = pos.array, na = nor.array;
    for (let k = 0; k < RINGS; k++) {
      const u = k / (RINGS - 1), w = 1 - u;
      q.set(0, 0, 0).addScaledVector(b0, w * w * w).addScaledVector(b1, 3 * w * w * u).addScaledVector(b2, 3 * w * u * u).addScaledVector(b3, u * u * u);
      f.set(0, 0, 0).addScaledVector(b0, -3 * w * w).addScaledVector(b1, 3 * w * w - 6 * w * u).addScaledVector(b2, 6 * w * u - 3 * u * u).addScaledVector(b3, 3 * u * u).normalize();
      up.set(0, 1, 0);
      side.crossVectors(up, f).normalize();
      up.crossVectors(f, side);
      if (k === 12) stalkMid.position.copy(q);
      const rip = 1 + 0.07 * Math.sin(u * 18 - t * (P.ext > 0.2 ? 9 : 2)) * (1 - P.droop);
      const r = lerp(0.4, 0.33, u) * rip;
      for (let j = 0; j <= RAD; j++) {
        const a = (j / RAD) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const lump = 1 + 0.06 * Math.sin(a * 3 + u * 7);
        const i = (k * (RAD + 1) + j) * 3;
        tmp.copy(side).multiplyScalar(ca).addScaledVector(up, sa);
        pa[i] = q.x + tmp.x * r * lump; pa[i + 1] = q.y + tmp.y * r * lump; pa[i + 2] = q.z + tmp.z * r * lump;
        na[i] = tmp.x; na[i + 1] = tmp.y; na[i + 2] = tmp.z;
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  function animate(dt, time, sIn) {
    const s = normState(sIn);
    s.breath = sIn?.breath;
    s.reach = sIn?.reach;
    t = time;
    targets(s);
    // The wall breathes with it.
    const br = s.state === 'dead' ? 0 : P.pulse - 0.98;
    bulge.scale.set(1 + 0.5 * br, 1 + 0.5 * br, 0.5 + 10 * br);
    collar.scale.set(1 + 0.3 * br, 1 + 0.3 * br, 1 + 3 * br);
    glow.set(s.state === 'dead' ? 0 : sIn?.glow ?? 0.3);
    const fast = s.state === 'lunge' || s.state === 'attack' || s.state === 'hurt' || s.state === 'kill';
    const k = first ? 1 : damp(fast ? 30 : s.state === 'retract' ? 4.5 : 6, dt);
    first = false;
    for (const key in P) P[key] += (T[key] - P[key]) * (key === 'open' && fast ? damp(40, dt) : k);
    update();
    updateSpit();
    M.step(dt);
  }

  return {
    root, height: 0.9, radius: 0.46,
    hitSpheres: [
      hit(head, 0, 0, 0.05, 0.42, 'head'),
      hit(head, 0, 0, -0.45, 0.33, 'body'),
      hit(stalkMid, 0, 0, 0, 0.36, 'body'),
    ],
    // The throat light; WallMaw drives its intensity with the breath and the strike.
    lights: [light(head, 0, 0, 0.05, 0xff3018, 0.6, 3.2, 0)],
    timings: TIMINGS,
    states: ['dormant', 'notice', 'lunge', 'retract', 'hurt', 'dead', 'kill'],
    nodes: { mouth: head, jaws: [jawU, jawL] },
    animate,
    flash: (v) => M.flash(v),
    dispose() { geo.dispose(); M.dispose(); glow.dispose(); spitMat.dispose(); },
  };
}
