import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lite, inBeam, dist2 } from './common.js';

// Harmless ambient life: rats that bolt from the light, moths around lamps,
// flies over the dead, crows on the field posts. None of it touches gameplay;
// each group only animates while the player is near.
//
//   rats(L, [[x, z], ...]);              // floor spots
//   moths(L, [[x, y, z], ...]);          // light positions
//   flies(L, [[x, y, z], ...]);          // swarm centres
//   crows(L, [{ pos: [x, y, z], yaw }]); // perches

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = {};

// Merge primitives into one position/normal geometry.
const bake = (parts) => {
  for (const p of parts) p.deleteAttribute('uv');
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
};

// Level culling owns obj.visible, so critters hide their meshes instead.
const show = (obj, v) => obj.children.forEach((m) => (m.visible = v));

// ---------- Rats ----------
let RAT = null;
function ratGeo() {
  if (RAT) return RAT;
  const body = new THREE.SphereGeometry(0.05, 10, 7);
  body.scale(0.9, 0.75, 1.9);
  body.translate(0, 0.045, 0);
  const head = new THREE.ConeGeometry(0.034, 0.09, 8);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0.05, 0.12);
  const ears = [-1, 1].map((s) => {
    const e = new THREE.SphereGeometry(0.014, 6, 4);
    e.scale(1, 1, 0.4);
    e.translate(0.022 * s, 0.078, 0.095);
    return e;
  });
  const tail = new THREE.CylinderGeometry(0.004, 0.009, 0.2, 5);
  tail.rotateX(Math.PI / 2 - 0.12);
  tail.translate(0, 0.03, -0.18);
  RAT = { body: bake([body, head, ...ears, tail]) };
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.SphereGeometry(0.006, 5, 4);
    e.translate(0.017 * s, 0.062, 0.128);
    return e;
  });
  RAT.eyes = bake(eyes);
  return RAT;
}

let RAT_MATS = null;
const ratMats = () =>
  (RAT_MATS ??= {
    fur: new THREE.MeshStandardMaterial({ name: 'ambience:rat', color: 0x2c2520, roughness: 0.9 }),
    // Eye shine in the flashlight.
    eye: new THREE.MeshStandardMaterial({ name: 'ambience:ratEye', color: 0x100404, emissive: 0x5a1a10, emissiveIntensity: 0.8 }),
  });

// spots: [[x, z] | [x, y, z], ...]. A rat sniffs at its spot, bolts for the
// nearest wall when the player comes close or lights it, vanishes into it and
// comes back later when nobody is looking.
export function rats(L, spots) {
  const game = L.game;
  const G = ratGeo();
  const M = ratMats();
  const list = (lite(game) ? spots.slice(0, Math.ceil(spots.length / 2)) : spots).map((s) => {
    const x = s[0];
    const z = s.length === 3 ? s[2] : s[1];
    const y = s.length === 3 ? s[1] : L.floorAt(x, z);
    const obj = new THREE.Group();
    obj.add(new THREE.Mesh(G.body, M.fur), new THREE.Mesh(G.eyes, M.eye));
    obj.position.set(x, y, z);
    obj.rotation.y = L.rng() * Math.PI * 2;
    obj.name = 'ambience:rat';
    L.mesh(obj, { cast: false });
    return { obj, home: new THREE.Vector3(x, y, z), state: 'idle', t: 0, next: 1 + Math.random() * 4, runLeft: 0, yaw: obj.rotation.y };
  });
  L.onUpdate((dt, t, g) => {
    for (const r of list) {
      const o = r.obj;
      if (r.state === 'gone') {
        r.t -= dt;
        // Back at home once the player has moved off and isn't looking.
        if (r.t <= 0 && dist2(g, r.home) > 64 && !inBeam(g, r.home, 0.8, 30)) {
          r.state = 'idle';
          o.position.copy(r.home);
          show(o, true);
        }
        continue;
      }
      const d2 = dist2(g, o.position);
      if (d2 > 400) continue;
      if (r.state === 'idle') {
        r.next -= dt;
        // Sniff: small head-bob and turns.
        o.rotation.y = r.yaw + Math.sin(t * 1.7 + r.home.x) * 0.25;
        o.position.y = r.home.y + Math.abs(Math.sin(t * 9 + r.home.z)) * 0.004;
        if (r.next <= 0) {
          r.next = 4 + Math.random() * 9;
          if (d2 < 100 && Math.random() < 0.5) g.audio.play('ratSqueak', { pos: o.position, gain: 0.8 });
          r.yaw += (Math.random() - 0.5) * 1.6;
        }
        if (d2 < 3.5 * 3.5 || (d2 < 81 && inBeam(g, o.position, 0.96))) {
          // Bolt directly away from the player, into the first wall in the way.
          _dir.set(o.position.x - g.player.position.x, 0, o.position.z - g.player.position.z).normalize();
          _dir.applyAxisAngle(_v.set(0, 1, 0), (Math.random() - 0.5) * 1.2);
          _v.copy(o.position).y += 0.08;
          const hit = L.physics.raycast(_v, _dir, 3, null, _ray);
          r.runLeft = hit ? Math.max(0.3, hit.dist - 0.05) : 2.2;
          r.yaw = Math.atan2(_dir.x, _dir.z);
          r.state = 'run';
          g.audio.play('skitter', { pos: o.position });
          if (Math.random() < 0.6) g.audio.play('ratSqueak', { pos: o.position });
        }
      } else if (r.state === 'run') {
        const step = Math.min(r.runLeft, 3.6 * dt);
        o.rotation.y = r.yaw;
        o.position.x += Math.sin(r.yaw) * step;
        o.position.z += Math.cos(r.yaw) * step;
        o.position.y = r.home.y + Math.abs(Math.sin(t * 30)) * 0.012;
        r.runLeft -= step;
        if (r.runLeft <= 0) {
          r.state = 'gone';
          r.t = 20 + Math.random() * 30;
          show(o, false);
        }
      }
    }
  });
  return list;
}

// ---------- Moths ----------
// lights: [[x, y, z], ...]; a few moths loop erratically around each.
export function moths(L, lights, { perLight = 3 } = {}) {
  const game = L.game;
  const per = lite(game) ? Math.max(1, perLight - 1) : perLight;
  const n = lights.length * per;
  if (!n) return null;
  const wing = new THREE.PlaneGeometry(0.035, 0.022);
  wing.translate(0.0175, 0, 0);
  const geo = mergeGeometries([wing, wing.clone().rotateY(Math.PI)], false);
  const mat = new THREE.MeshBasicMaterial({ name: 'ambience:moth', color: 0x6a6050, side: THREE.DoubleSide, fog: true });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  inst.name = 'ambience:moths';
  inst.frustumCulled = false;
  inst.userData.noCull = true;
  const ms = [];
  lights.forEach((c) => {
    for (let i = 0; i < per; i++) {
      ms.push({ c: new THREE.Vector3(...c), a: L.rng() * 10, r: L.rng.range(0.15, 0.4), sp: L.rng.range(1.5, 3) });
    }
  });
  L.mesh(inst, { cast: false });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  L.onUpdate((dt, t, g) => {
    let any = false;
    ms.forEach((mo, i) => {
      if (dist2(g, mo.c) > 225) {
        m4.makeScale(0, 0, 0);
        inst.setMatrixAt(i, m4);
        return;
      }
      any = true;
      const a = t * mo.sp + mo.a;
      _v.set(
        mo.c.x + Math.sin(a) * mo.r + Math.sin(a * 3.7) * 0.05,
        mo.c.y + Math.sin(a * 1.3 + 1) * 0.12 + Math.sin(a * 5.1) * 0.03,
        mo.c.z + Math.cos(a * 0.9) * mo.r + Math.cos(a * 4.3) * 0.05,
      );
      e.set(Math.sin(a * 2) * 0.4, a + Math.PI / 2, Math.sin(t * 40 + mo.a) * 0.9);
      q.setFromEuler(e);
      // Flap: squash across the wings.
      s.set(0.4 + 0.6 * Math.abs(Math.sin(t * 38 + mo.a)), 1, 1);
      m4.compose(_v, q, s);
      inst.setMatrixAt(i, m4);
    });
    inst.visible = any;
    inst.instanceMatrix.needsUpdate = true;
  });
  return inst;
}

// ---------- Flies ----------
// spots: [[x, y, z], ...]; a small buzzing swarm over each, with a quiet loop.
export function flies(L, spots, { perSpot = 14, gain = 0.6 } = {}) {
  const game = L.game;
  const per = lite(game) ? Math.ceil(perSpot / 2) : perSpot;
  const n = spots.length * per;
  if (!n) return null;
  const pos = new Float32Array(n * 3);
  const fs = [];
  spots.forEach((c) => {
    const cv = new THREE.Vector3(...c);
    for (let i = 0; i < per; i++) fs.push({ c: cv, a: L.rng() * 50, r: L.rng.range(0.1, 0.45), sp: L.rng.range(2, 5), h: L.rng.range(0.05, 0.5) });
    L.loopSound('flyBuzz', cv, { radius: 6, gain });
  });
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  const mat = new THREE.PointsMaterial({ name: 'ambience:flies', color: 0x0c0806, size: 0.014, sizeAttenuation: true, fog: true });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'ambience:flies';
  pts.frustumCulled = false;
  pts.userData.noCull = true;
  L.mesh(pts, { cast: false });
  L.onUpdate((dt, t, g) => {
    let any = false;
    fs.forEach((f, i) => {
      if (dist2(g, f.c) > 144) {
        pos[i * 3 + 1] = -1e4;
        return;
      }
      any = true;
      const a = t * f.sp + f.a;
      pos[i * 3] = f.c.x + Math.sin(a) * f.r + Math.sin(a * 4.1) * 0.06;
      pos[i * 3 + 1] = f.c.y + f.h + Math.sin(a * 1.7) * 0.12 + Math.sin(a * 6.3) * 0.03;
      pos[i * 3 + 2] = f.c.z + Math.cos(a * 1.2) * f.r + Math.cos(a * 3.3) * 0.06;
    });
    pts.visible = any;
    if (any) attr.needsUpdate = true;
  });
  return pts;
}

// ---------- Crows ----------
let CROW = null;
function crowGeo() {
  if (CROW) return CROW;
  const body = new THREE.SphereGeometry(0.09, 10, 7);
  body.scale(0.8, 0.85, 1.6);
  body.rotateX(-0.35);
  body.translate(0, 0.12, 0);
  const head = new THREE.SphereGeometry(0.055, 8, 6);
  head.translate(0, 0.22, 0.12);
  const beak = new THREE.ConeGeometry(0.018, 0.08, 6);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.21, 0.2);
  const tail = new THREE.BoxGeometry(0.08, 0.01, 0.14);
  tail.rotateX(0.5);
  tail.translate(0, 0.06, -0.18);
  const legs = [-1, 1].map((s) => {
    const l = new THREE.CylinderGeometry(0.005, 0.005, 0.06, 4);
    l.translate(0.03 * s, 0.03, 0.01);
    return l;
  });
  // One wing, root at the origin, spreading along +X.
  const wing = new THREE.BoxGeometry(0.28, 0.008, 0.14);
  wing.translate(0.14, 0, 0);
  CROW = { body: bake([body, head, beak, tail, ...legs]), wing: bake([wing]) };
  return CROW;
}

// perches: [{ pos: [x, y, z], yaw }]. A crow turns its head and caws now and
// then; if the player walks up it flaps off over the trees and returns much later.
export function crows(L, perches, { enabled = () => true } = {}) {
  const G = crowGeo();
  const mat = new THREE.MeshStandardMaterial({ name: 'ambience:crow', color: 0x0c0c10, roughness: 0.55, metalness: 0.1 });
  const list = perches.map((p) => {
    const obj = new THREE.Group();
    const body = new THREE.Mesh(G.body, mat);
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Mesh(G.wing, mat);
      w.position.set(0.05 * s, 0.16, -0.02);
      w.scale.x = s;
      w.rotation.z = s * -1.35; // folded
      obj.add(w);
      return w;
    });
    obj.add(body);
    obj.position.set(...p.pos);
    obj.rotation.y = p.yaw ?? L.rng() * Math.PI * 2;
    obj.name = 'ambience:crow';
    L.mesh(obj);
    return { obj, body, wings, home: new THREE.Vector3(...p.pos), yaw: obj.rotation.y, state: 'perch', next: 3 + Math.random() * 10, vel: new THREE.Vector3(), t: 0 };
  });
  L.onUpdate((dt, t, g) => {
    const on = enabled(g);
    for (const c of list) {
      const o = c.obj;
      if (c.state === 'gone') {
        c.t -= dt;
        if (c.t <= 0 && on && dist2(g, c.home) > 30 * 30) {
          c.state = 'perch';
          o.position.copy(c.home);
          o.rotation.set(0, c.yaw, 0);
          c.wings.forEach((w, i) => (w.rotation.z = (i ? 1 : -1) * -1.35));
          o.visible = true;
        }
        continue;
      }
      if (c.state === 'perch') {
        const d2 = dist2(g, o.position);
        c.next -= dt;
        // Head turns: whole bird twitches its facing.
        if (c.next <= 0) {
          c.next = 6 + Math.random() * 14;
          c.yaw += (Math.random() - 0.5) * 1.2;
          if (d2 < 40 * 40 && Math.random() < 0.6) g.audio.play('crowCaw', { pos: o.position });
        }
        o.rotation.y += (c.yaw - o.rotation.y) * Math.min(1, dt * 8);
        // Leaves when told to (nightfall) at a random moment, or when the player comes close.
        if ((!on && Math.random() < dt * 0.1) || d2 < 7 * 7 || (d2 < 18 * 18 && inBeam(g, o.position, 0.97, 18))) {
          c.state = 'fly';
          c.t = 0;
          const away = _v.set(o.position.x - g.player.position.x, 0, o.position.z - g.player.position.z).normalize();
          c.vel.set(away.x * 5, 3.2, away.z * 5);
          o.rotation.y = Math.atan2(away.x, away.z);
          g.audio.play('wingFlap', { pos: o.position });
          if (Math.random() < 0.8) setTimeout(() => g.audio.play('crowCaw', { pos: o.position }), 250);
        }
      } else if (c.state === 'fly') {
        c.t += dt;
        c.vel.y = Math.max(0.6, c.vel.y - dt * 1.2);
        o.position.addScaledVector(c.vel, dt);
        o.rotation.x = -0.25;
        const flap = Math.sin(c.t * 22) * 0.9;
        c.wings.forEach((w, i) => (w.rotation.z = (i ? 1 : -1) * flap));
        if (c.t > 9) {
          c.state = 'gone';
          c.t = 60 + Math.random() * 60;
          o.visible = false;
        }
      }
    }
  });
  return list;
}
