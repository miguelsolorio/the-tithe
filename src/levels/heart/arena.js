import * as THREE from 'three';
import { fbm2 } from '../../core/rng.js';
import { smoothstep } from '../../core/utils.js';
import { getMaterial, getDecalMaterial } from '../../world/materials.js';
import { makeProp } from '../../world/props/index.js';

// The heart: a round cavern of breathing flesh (radius 16 m, dome ~15 m) with
// a black pool in the middle, a glowing sigil around it, rib arches overhead,
// a short tunnel to the south (+Z) back to the torn sphincter, and a mass of
// flesh behind the Mother (north) that closes the ring behind her.

export const R_WALL = 16;
export const R_POOL = 5;
export const R_BARRIER = 5.3;
export const WATER_Y = -0.35;
export const BACK_ANGLE = 1.92; // |angle from +Z| beyond this is the mound behind her
export const TUNNEL = { z0: 14.6, z1: 28.4, halfW: 2.1 };

const TAU = Math.PI * 2;
const PROFILE = [[16.4, -0.3], [16.25, 1.5], [16.05, 4], [15.7, 6.5], [14.8, 9], [13, 11.3], [10, 13.2], [6, 14.3], [2.5, 14.8], [0.01, 14.9]];

function indexGrid(nu, nv, skip = null) {
  const idx = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      if (skip && skip(i, j)) continue;
      const a = i * (nv + 1) + j;
      const b = (i + 1) * (nv + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return idx;
}

function geoFrom(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Flip triangles so normals point toward `toward(x, y, z)` (a function returning a target point).
function faceToward(g, toward) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  let score = 0;
  const t = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 7) {
    toward(p.getX(i), p.getY(i), p.getZ(i), t);
    score += (t.x - p.getX(i)) * n.getX(i) + (t.y - p.getY(i)) * n.getY(i) + (t.z - p.getZ(i)) * n.getZ(i);
  }
  if (score < 0) {
    const ix = g.index.array;
    for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
    g.computeVertexNormals();
  }
  return g;
}

// Polar patch on the floor: rings r0..r1, angles a0..a1 (angle 0 = +Z, pi/2 = +X).
function polarPatch(r0, r1, a0, a1, nr, na, height) {
  const pos = [];
  const uv = [];
  for (let i = 0; i <= nr; i++) {
    const r = r0 + ((r1 - r0) * i) / nr;
    for (let j = 0; j <= na; j++) {
      const a = a0 + ((a1 - a0) * j) / na;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      pos.push(x, height(x, z, r, a), z);
      uv.push(x / 2.5, z / 2.5);
    }
  }
  return faceToward(geoFrom(pos, uv, indexGrid(nr, na)), (x, y, z, t) => t.set(x, y + 5, z));
}

// Flesh that swells with the shared heartbeat (lights.pulse).
export function pulsingMaterial(name, amp, side = THREE.FrontSide) {
  const m = getMaterial(name).clone();
  m.side = side;
  const uniform = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPulse = uniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPulse;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * uPulse * ${amp.toFixed(3)} * (0.6 + 0.4 * sin(position.y * 0.9 + position.x * 0.3));`);
  };
  m.customProgramCacheKey = () => `heartPulse${amp}${side}`;
  m.userData.pulse = uniform;
  return m;
}

export function buildArena(L, game) {
  const out = { pulses: [] };
  const fleshDark = getMaterial('fleshDark');

  // ---------- Floor ----------
  const floorH = (x, z, r) => (r < 7.8 ? 0 : (fbm2(x * 0.45, z * 0.45, 3, 11) - 0.5) * 0.16 * smoothstep(7.8, 9.5, r) - 0.02);
  L.batcher.add(polarPatch(R_BARRIER - 0.05, 16.6, 0, TAU, 20, 128, floorH), fleshDark, { worldUV: false, cast: false });
  const tf = new THREE.PlaneGeometry(TUNNEL.halfW * 2 + 0.4, TUNNEL.z1 - 16.2, 6, 20).rotateX(-Math.PI / 2).translate(0, -0.02, (TUNNEL.z1 + 16.2) / 2);
  L.batcher.add(tf, fleshDark, { cast: false });
  L.physics.add({ type: 'height', min: { x: -17.5, z: -17.5 }, max: { x: 17.5, z: TUNNEL.z1 + 0.5 }, fn: (x, z) => (x * x + z * z < R_POOL * R_POOL ? -3 : 0), surface: 'flesh' });

  // ---------- Walls and dome (one breathing shell with a hole for the tunnel) ----------
  const NA = 200;
  const NV = 40;
  const prof = new THREE.CatmullRomCurve3(PROFILE.map(([r, y]) => new THREE.Vector3(r, y, 0)));
  const pts = prof.getSpacedPoints(NV);
  const wpos = [];
  const wuv = [];
  const len = prof.getLength();
  for (let j = 0; j <= NA; j++) {
    const a = (j / NA) * TAU;
    const sa = Math.sin(a);
    const ca = Math.cos(a);
    for (let k = 0; k <= NV; k++) {
      const p = pts[k];
      const n = fbm2(a * 9 + p.y * 0.12, p.y * 0.55, 4, 7);
      const fold = Math.sin(a * 46 + fbm2(a * 3, p.y * 0.2, 2, 3) * 9) * 0.12;
      const low = p.y < 5 ? 1 : 0.5;
      const r = Math.max(0.01, p.x + (n - 0.42) * 1.4 * low + fold + (p.y < 3 ? Math.max(0, n - 0.3) * 0.6 : 0));
      const y = p.y + (k === NV ? 0 : (fbm2(a * 7, p.y * 0.4, 2, 9) - 0.5) * 0.5 * (k === 0 ? 0 : 1));
      wpos.push(sa * r, y, ca * r);
      wuv.push((a * R_WALL) / 2.5, ((k / NV) * len) / 2.5);
    }
  }
  const hole = (j, k) => {
    const a = ((j + 0.5) / NA) * TAU;
    const y = (pts[k].y + pts[k + 1].y) / 2;
    const x = Math.sin(a) * R_WALL;
    if (Math.cos(a) < 0.8 || y > 4.4) return false;
    const hw = y < 1.4 ? 2.3 : 2.3 * Math.sqrt(Math.max(0, 1 - ((y - 1.4) / 2.9) ** 2));
    return Math.abs(x) < hw;
  };
  const wallGeo = faceToward(geoFrom(wpos, wuv, indexGrid(NA, NV, hole)), (x, y, z, t) => t.set(0, Math.min(y, 6), 0));
  const wallMat = pulsingMaterial('flesh', 0.09);
  out.pulses.push(wallMat.userData.pulse);
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.receiveShadow = true;
  L.group.add(wall);
  // Collision ring (cylinders just outside the wall surface), open at the tunnel.
  for (let i = 0; i < 76; i++) {
    const a = (i / 76) * TAU;
    const x = Math.sin(a) * 17.05;
    const z = Math.cos(a) * 17.05;
    if (z > 0 && Math.abs(x) < 2.9) continue;
    L.physics.add({ type: 'cyl', x, z, r: 1.15, y0: -1, y1: 9, walkable: false, surface: 'flesh' });
  }

  // ---------- Tunnel to the sphincter ----------
  const TA = 36;
  const TL = 30;
  const tpos = [];
  const tuv = [];
  for (let i = 0; i <= TL; i++) {
    const z = TUNNEL.z0 + ((TUNNEL.z1 - TUNNEL.z0) * i) / TL;
    const s = 1 + 0.65 * smoothstep(16.4, TUNNEL.z0, z) + 0.1 * smoothstep(26.5, TUNNEL.z1, z);
    for (let j = 0; j <= TA; j++) {
      const t = (j / TA) * TAU;
      const n = fbm2(t * 2 + z * 0.1, z * 0.45, 3, 21);
      const k = s * (1 + (n - 0.5) * 0.3);
      tpos.push(Math.cos(t) * 2.15 * k, 1.35 + Math.sin(t) * 2.35 * k, z);
      tuv.push((t * 2.2) / 2.5, z / 2.5);
    }
  }
  const tunMat = pulsingMaterial('flesh', 0.06, THREE.DoubleSide);
  out.pulses.push(tunMat.userData.pulse);
  const tube = new THREE.Mesh(faceToward(geoFrom(tpos, tuv, indexGrid(TL, TA)), (x, y, z, t) => t.set(0, 1.35, z)), tunMat);
  tube.receiveShadow = true;
  L.group.add(tube);
  const hw = TUNNEL.halfW - 0.4;
  L.collider([hw, -1, 15.3], [hw + 1.2, 4.5, TUNNEL.z1 + 0.6], { walkable: false, surface: 'flesh' });
  L.collider([-hw - 1.2, -1, 15.3], [-hw, 4.5, TUNNEL.z1 + 0.6], { walkable: false, surface: 'flesh' });
  L.collider([-3, -1, TUNNEL.z1 - 0.2], [3, 4.5, TUNNEL.z1 + 0.8], { walkable: false, surface: 'flesh' });
  // The torn sphincter you came through, a black throat beyond it.
  const sph = makeProp('sphincterDoor', { diameter: 3.3, open: 1, seed: 7 });
  sph.position.set(0, 0, TUNNEL.z1 - 1.2);
  sph.rotation.y = Math.PI;
  L.mesh(sph, { static: true });
  const back = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  back.position.set(0, 1.5, TUNNEL.z1 - 0.3);
  back.rotation.y = Math.PI;
  L.group.add(back);

  // ---------- Pool: basin, lip, barrier, sigil ----------
  const basin = new THREE.LatheGeometry([[0, -3.2], [2.5, -3], [4.1, -1.9], [4.7, -0.7], [4.95, -0.1], [5.15, 0.12], [5.35, 0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 72);
  const basinMat = getMaterial('fleshDark').clone();
  basinMat.side = THREE.DoubleSide;
  L.group.add(new THREE.Mesh(basin, basinMat));
  const lip = new THREE.TorusGeometry(5.17, 0.2, 8, 120).rotateX(Math.PI / 2);
  const lp = lip.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i);
    const z = lp.getZ(i);
    const k = 1 + (fbm2(x * 0.9, z * 0.9, 3, 5) - 0.5) * 0.9;
    const r = Math.hypot(x, z);
    const d = r - 5.17;
    lp.setXYZ(i, (x / r) * (5.17 + d * k), Math.max(-0.1, lp.getY(i) * k) + 0.06, (z / r) * (5.17 + d * k));
  }
  lip.computeVertexNormals();
  L.batcher.add(lip, getMaterial('flesh'), { worldUV: true });
  const knobs = [];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU + (i % 3) * 0.02;
    const s = 0.14 + (i % 4) * 0.035;
    knobs.push(new THREE.SphereGeometry(s, 7, 5).scale(1, 0.75, 1.3).rotateY(a).translate(Math.sin(a) * 5.2, 0.16, Math.cos(a) * 5.2));
  }
  for (const k of knobs) L.batcher.add(k, getMaterial('bone'), { worldUV: true });
  L.physics.add({ type: 'cyl', x: 0, z: 0, r: R_BARRIER, y0: -3, y1: 1.2, walkable: false, shootable: false, seeThrough: true, navIgnore: false });
  const sigilMat = getDecalMaterial('sigilGlow').clone();
  sigilMat.userData.base = sigilMat.emissiveIntensity || 2.6;
  const sig = new THREE.Mesh(new THREE.RingGeometry(R_BARRIER, 7.4, 128, 1).rotateX(-Math.PI / 2), sigilMat);
  sig.position.y = 0.025;
  sig.renderOrder = 2;
  L.group.add(sig);
  out.sigilMat = sigilMat;
  out.sigilLights = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * TAU + 0.3;
    return L.light({ pos: [Math.sin(a) * 6.3, 0.45, Math.cos(a) * 6.3], color: 0xff1a0a, intensity: 1.5, distance: 6.5, flicker: 0.2, kind: 'flesh' });
  });
  out.water = L.water({ min: [-17.5, -17.5], max: [17.5, TUNNEL.z1 + 0.5], y: WATER_Y, color: 'black', opacity: 0.95 });

  // ---------- The mass behind her (closes the north of the ring) ----------
  const inside = (a) => Math.min(a - BACK_ANGLE, TAU - BACK_ANGLE - a);
  const moundH = (x, z, r, a) => {
    const k = smoothstep(0, 0.14, inside(a));
    return -0.05 + k * (2.6 + 1.6 * smoothstep(5.3, 11, r) + (fbm2(x * 0.35, z * 0.35, 4, 17) - 0.4) * 2.4);
  };
  L.batcher.add(polarPatch(R_BARRIER - 0.1, 16.7, BACK_ANGLE - 0.05, TAU - BACK_ANGLE + 0.05, 22, 60, moundH), getMaterial('flesh'), { worldUV: true });
  for (const sgn of [1, -1]) {
    const a = sgn * (BACK_ANGLE - 0.02);
    for (let r = 5.9; r < 16.2; r += 1.05) L.physics.add({ type: 'cyl', x: Math.sin(a) * r, z: Math.cos(a) * r, r: 0.72, y0: -1, y1: 3.5, walkable: false, surface: 'flesh' });
    for (const r of [6.6, 9.4, 12.5, 14.8]) L.prop('boneSpike', Math.sin(a + sgn * 0.06) * r, Math.cos(a + sgn * 0.06) * r, { y: 0, rotY: a, collider: 'none', args: { height: 1.4 + (r % 3) * 0.5 } });
  }

  // ---------- Ribs overhead, a spine along the dome ----------
  const spine = [];
  for (const [z, h] of [[-8.5, 10.5], [-3.2, 11.8], [2.4, 11.8], [7.8, 10.6]]) {
    const half = Math.sqrt(15.3 * 15.3 - z * z);
    L.prop('rib', 0, z, { y: -0.05, args: { span: half * 2, height: h, seed: Math.round(z * 10) } });
    spine.push(new THREE.Vector3(0, h + 0.1, z + 0.3));
  }
  spine.unshift(new THREE.Vector3(0, 12.1, -10.8));
  spine.push(new THREE.Vector3(0, 12.0, 10.6));
  const sp = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spine), 60, 0.45, 8);
  const spp = sp.attributes.position;
  for (let i = 0; i < spp.count; i++) spp.setY(i, spp.getY(i) + Math.max(0, Math.sin(spp.getZ(i) * 3.3)) * 0.25);
  sp.computeVertexNormals();
  L.batcher.add(sp, getMaterial('bone'), { worldUV: true });

  // ---------- Chain anchors high on the east and west walls ----------
  out.anchorsWorld = [];
  for (const sgn of [1, -1]) {
    const a = sgn * 1.62;
    const x = Math.sin(a) * 13.75;
    const z = Math.cos(a) * 13.75;
    const obj = makeProp('chainAnchor', { seed: sgn > 0 ? 3 : 5 });
    obj.position.set(x, 10.3, z);
    obj.rotation.set(0.62, Math.atan2(-x, -z), 0, 'YXZ');
    obj.scale.setScalar(2.2);
    L.mesh(obj, { static: true });
    const w = new THREE.Vector3(x, 10.3, z);
    if (obj.userData.attach) obj.userData.attach.getWorldPosition(w);
    out.anchorsWorld.push(w);
  }

  // ---------- Cover: bone mounds around the ring ----------
  out.cover = [];
  for (const [a, r] of [[0.62, 10.4], [-0.62, 10.4], [1.28, 11.2], [-1.28, 11.2], [0, 11.8]]) {
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const m = new THREE.SphereGeometry(1.15, 14, 8, 0, TAU, 0, Math.PI / 2);
    const mp = m.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const k = 1 + (fbm2(mp.getX(i) * 1.6 + x, mp.getZ(i) * 1.6 + z, 3, 23) - 0.5) * 0.7;
      mp.setXYZ(i, mp.getX(i) * k + x, mp.getY(i) * 1.05 * k, mp.getZ(i) * k + z);
    }
    m.computeVertexNormals();
    L.batcher.add(m, getMaterial('fleshDark'), { worldUV: true });
    L.prop('boneSpike', x + 0.25, z - 0.2, { y: 0.4, rotY: a, collider: 'none', args: { height: 1.7 } });
    L.prop('bonesPile', x - 0.5, z + 0.35, { y: 0.35, collider: 'none', args: { radius: 0.5 } });
    L.physics.add({ type: 'cyl', x, z, r: 1.05, y0: -0.5, y1: 1.55, walkable: false, surface: 'flesh' });
    out.cover.push([x, z]);
  }
  return out;
}
