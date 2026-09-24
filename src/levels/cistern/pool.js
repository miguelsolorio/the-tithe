import * as THREE from 'three';
import { Soup, M, rubble, wallLantern, blob } from './geo.js';
import { paint } from './fx.js';
import { R, POOL, ALCOVES } from './layout.js';
import { PROP_NAMES, makeProp } from '../../world/props/index.js';
import { solid } from '../../world/materials.js';

// The baptism pool: a domed chamber with an octagonal pool, candles on the
// rim and a plinth in the water holding the valve wheel. Walking in starts
// the rite: three acolytes step out of the alcoves, gather and chant while
// the water turns red, then turn on you.

const CX = POOL.x;
const CZ = POOL.z;
const C8 = Math.cos(Math.PI / 8);
// Octagon rings (apothems, flat sides facing the axes) and their heights.
const CURB_OUT = 4.6;
const CURB_IN = 4.2;
const CURB_Y = 0.2;
const STEPS = [
  [4.2, 3.7, -0.25],
  [3.7, 3.2, -0.5],
  [3.2, 2.7, -0.75],
];
const BOTTOM = -1.0;
export const POOL_WATER = -0.12;
const PLINTH_TOP = 0.86;

const d8 = (x, z) => {
  const ax = Math.abs(x - CX);
  const az = Math.abs(z - CZ);
  return Math.max(ax, az, (ax + az) / Math.SQRT2);
};

function floorAt(x, z) {
  const d = d8(x, z);
  if (d > CURB_OUT) return 0;
  if (d > CURB_IN) return CURB_Y;
  for (const [, inner, y] of STEPS) if (d > inner) return y;
  return BOTTOM;
}

// Octagon vertices at apothem ap (vertex k at angle PI/8 + k PI/4).
const oct = (ap, y) => {
  const r = ap / C8;
  return Array.from({ length: 8 }, (_, k) => {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    return [CX + Math.cos(a) * r, y, CZ + Math.sin(a) * r];
  });
};

function ring(soup, apOut, apIn, y) {
  const o = oct(apOut, y);
  const i = oct(apIn, y);
  for (let k = 0; k < 8; k++) soup.quad(o[k], o[(k + 1) % 8], i[(k + 1) % 8], i[k], [0, 1, 0]);
}

function band(soup, ap, y0, y1, inward) {
  const a = oct(ap, y0);
  const b = oct(ap, y1);
  for (let k = 0; k < 8; k++) {
    const m = (k + 0.5) * (Math.PI / 4) + Math.PI / 8;
    const n = inward ? [-Math.cos(m), 0, -Math.sin(m)] : [Math.cos(m), 0, Math.sin(m)];
    soup.quad(a[k], a[(k + 1) % 8], b[(k + 1) % 8], b[k], n);
  }
}

export function buildPool(L, fx, rng, game, { flood }) {
  const r = R.pool;
  // ---- Floor: ring around the pool, curb, steps down; one heightfield collider.
  L.physics.add({ type: 'height', min: { x: r.x0, z: r.z0 }, max: { x: r.x1, z: r.z1 }, fn: floorAt, surface: 'stone' });
  const floor = new Soup();
  const half = (r.x1 - r.x0) / 2;
  // Project each octagon vertex out to the square; fill the gaps (quads, and corner pentagons).
  const ov = oct(CURB_OUT, 0);
  const proj = ov.map(([x, , z]) => {
    const dx = x - CX;
    const dz = z - CZ;
    const s = half / Math.max(Math.abs(dx), Math.abs(dz));
    return [CX + dx * s, 0, CZ + dz * s];
  });
  const corner = (k) => {
    const a = Math.PI / 8 + (k + 0.5) * (Math.PI / 4);
    return [CX + Math.sign(Math.round(Math.cos(a) * 100)) * half, 0, CZ + Math.sign(Math.round(Math.sin(a) * 100)) * half];
  };
  for (let k = 0; k < 8; k++) {
    const k1 = (k + 1) % 8;
    const diag = k % 2 === 0; // sides 0, 2, 4, 6 face the diagonals
    if (diag) {
      const c = corner(k);
      floor.quad(ov[k], proj[k], c, ov[k1], [0, 1, 0]);
      floor.tri(ov[k1], c, proj[k1], [0, 1, 0]);
    } else floor.quad(ov[k], proj[k], proj[k1], ov[k1], [0, 1, 0]);
  }
  floor.flush(L, 'stoneWet');
  const stone = new Soup();
  ring(stone, CURB_OUT, CURB_IN, CURB_Y);
  band(stone, CURB_OUT, 0, CURB_Y, false);
  band(stone, CURB_IN, STEPS[0][2], CURB_Y, true);
  for (let s = 0; s < STEPS.length; s++) {
    const [o, i, y] = STEPS[s];
    ring(stone, o, i, y);
    band(stone, i, s + 1 < STEPS.length ? STEPS[s + 1][2] : BOTTOM, y, true);
  }
  stone.flush(L, 'stone');
  // Plinth in the middle of the pool.
  L.cylinder(CX, CZ, 0.42, BOTTOM, PLINTH_TOP - 0.1, 'stone', { segments: 8 });
  L.cylinder(CX, CZ, 0.52, PLINTH_TOP - 0.1, PLINTH_TOP, 'stone', { segments: 8, collide: false });
  L.cylinder(CX, CZ, 0.55, BOTTOM, BOTTOM + 0.2, 'stone', { segments: 8, collide: false });
  const water = L.water({ min: [CX - CURB_IN, CZ - CURB_IN], max: [CX + CURB_IN, CZ + CURB_IN], y: POOL_WATER, color: 'teal', opacity: 0.8 });

  dome(L, r);
  const candles = rim(L);
  shrine(L, rng);
  alcoveDressing(L, rng);
  // Chamber lights by the east door, a cage over the water.
  wallLantern(L, 31.9, 8.6, 'w', { y: 2.9 });
  wallLantern(L, 31.9, 15.4, 'w', { y: 2.9 });
  L.prop('hangingCage', CX + 0.4, CZ - 0.3, { y: 8.9, args: { drop: 4.2 }, collider: 'none' });
  L.decal('sigil', [18.2, 0, 17.4], { face: 'up', size: 2.2 });
  L.decal('sigil', [28.6, 0, 6.4], { face: 'up', size: 1.8 });
  L.decal('bloodSmear', [18.3, 0, 4.9], { face: 'up', size: [0.8, 2.6], rot: 0.5 });
  L.decal('bloodSmear', [15.9, 0, 9.4], { face: 'up', size: [0.8, 2.4], rot: 1.2 });
  L.decal('grime', [29.5, 0, 12], { face: 'up', size: 3 });
  L.decal('grime', [23, 0, 19.3], { face: 'up', size: 3 });
  L.sound('chains', [CX, 5.5, CZ], { interval: [16, 34], radius: 26, gain: 0.35 });
  L.sound('drip', [20, 5, 9], { interval: [2, 5], radius: 16 });
  L.sound('drip', [26, 5, 15], { interval: [3, 7], radius: 16 });

  const red = L.light({ pos: [CX, 0.55, CZ], color: 0xff2414, intensity: 0, distance: 11, flicker: 0.12, kind: 'candle', enabled: false });
  const state = { water, red, candles, redT: 0 };
  const ritualDone = game.flags.has('cistern.ritual');
  if (ritualDone || flood) setRed(state, 1);
  valve(L, game);
  if (!flood) ritual(L, game, state, ritualDone);
  // Glow of the pool once the water has turned.
  L.onUpdate((dt) => {
    if (state.redT <= 0) return;
    const k = Math.min(1, state.redT);
    red.intensity = 2.6 * k;
    water.material.emissive.setRGB(0.07 * k, 0.006 * k, 0.004 * k);
  });
  return state;
}

function setRed(state, k) {
  state.red.enabled = true;
  state.redT = k;
  state.water.material.color.set(0x5a0a0e);
  state.water.tintTo('red', 0.1);
}

// Sail vault: a flattened sphere cut by the four walls.
function dome(L, r) {
  const half = (r.x1 - r.x0) / 2;
  const Rd = half * Math.SQRT2;
  const ys = 4.8;
  const k = 0.33;
  const hAt = (x, z) => ys + k * Math.sqrt(Math.max(0, Rd * Rd - (x - CX) ** 2 - (z - CZ) ** 2));
  const g = new THREE.PlaneGeometry(half * 2, half * 2, 26, 26);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + CX;
    const z = p.getZ(i) + CZ;
    p.setXYZ(i, x, hAt(x, z), z);
  }
  g.computeVertexNormals();
  L.batcher.add(g, M('brick'), { cast: false });
  // Ribs: the two diagonals and the two axes, following the dome.
  const lines = [
    [[-1, -1], [1, 1]],
    [[-1, 1], [1, -1]],
    [[-1, 0], [1, 0]],
    [[0, -1], [0, 1]],
  ];
  for (const [a, b] of lines) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = CX + (a[0] + (b[0] - a[0]) * t) * half * 0.985;
      const z = CZ + (a[1] + (b[1] - a[1]) * t) * half * 0.985;
      pts.push(new THREE.Vector3(x, hAt(x, z) - 0.08, z));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.17, 6, false);
    L.batcher.add(tube, M('stone'), { cast: false });
  }
  // Boss at the crown.
  const boss = new THREE.CylinderGeometry(0.5, 0.36, 0.3, 8);
  boss.translate(CX, hAt(CX, CZ) - 0.12, CZ);
  L.batcher.add(boss, M('stone'));
}

// Candles all round the curb (a few carry real light).
function rim(L) {
  const out = [];
  const pts = oct((CURB_OUT + CURB_IN) / 2, CURB_Y);
  for (let k = 0; k < 8; k++) {
    const [x, y, z] = pts[k];
    if (k % 2 === 0) {
      const c = L.prop('candleCluster', x, z, { y, args: { count: 5 }, crackle: k === 0 });
      for (const s of c.userData.sources || []) {
        s.intensity *= 1.6;
        s.distance = Math.max(s.distance, 7.5);
      }
      out.push(...(c.userData.sources || []));
    } else L.prop('candle', x, z, { y, lights: false, args: { h: 0.18 } });
    // Candles between the corners too.
    const [x2, , z2] = pts[(k + 1) % 8];
    L.prop('candle', (x + x2) / 2, (z + z2) / 2, { y, lights: false, args: { h: 0.12 } });
  }
  return out;
}

// The Mother Below, as the cult imagines her: horned skull, long wet hair, red eyes.
function shrine(L, rng) {
  const a = ALCOVES.n2;
  const altar = L.prop('altar', a.x, 1.57, { face: 's', scale: 0.85 });
  const at = new THREE.Box3().setFromObject(altar).max.y;
  const sy = 1.75;
  const sk = 1.5;
  L.prop('antlerSkull', a.x, 1.1, { y: sy, face: 's', scale: sk });
  const eye = solid(0xff2010, { emissive: 0xff1000, emissiveIntensity: 4 });
  for (const dx of [-0.045, 0.045]) {
    const e = new THREE.SphereGeometry(0.026, 8, 6);
    e.translate(a.x + dx * sk, sy + 0.045 * sk, 1.1 + 0.125 * sk + 0.012);
    L.batcher.add(e, eye, { worldUV: false });
  }
  const hair = solid(0x0b0907, { roughness: 0.28 });
  for (let i = 0; i < 26; i++) {
    const x0 = a.x + rng.range(-0.2, 0.2);
    const pts = [];
    const len = rng.range(0.5, 0.95);
    for (let j = 0; j <= 6; j++) {
      const t = j / 6;
      pts.push(new THREE.Vector3(x0 + Math.sin(t * 3 + i) * 0.05 * t + (x0 - a.x) * t * 0.6, sy - 0.05 - t * len, 1.2 + t * 0.1 + rng.range(-0.02, 0.02)));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, rng.range(0.006, 0.014), 3, false);
    L.batcher.add(g, hair, { worldUV: false, cast: false });
  }
  L.prop('candelabra', a.x - 0.5, 1.75, { y: at, flicker: 0.4 });
  L.prop('candleCluster', a.x + 0.5, a.z + 0.4, { args: { count: 4 }, lights: false });
  L.prop('skull', a.x + 0.4, 1.8, { y: at, rotY: -0.3 });
  L.decal('bloodDrip', [a.x, 1.25, 1.11], { face: 's', size: [1.3, 1.5] });
  paint(L, 'WHAT IS GIVEN TO THE WATER\nIS GIVEN TO HER', [a.x, 3.55, 3.12], 's', { width: 3.6, height: 0.9, size: 86, seed: 44 });
}

function alcoveDressing(L, rng) {
  // Offerings in the south-west alcove; the others wait empty and dark.
  const w2 = ALCOVES.w2;
  L.prop('skullPile', w2.x - 0.3, w2.z, { args: { count: 14 } });
  L.prop('bonesPile', w2.x + 0.2, w2.z + 0.5, { args: { radius: 0.5, count: 12, skulls: 2 } });
  L.prop('candleCluster', w2.x + 0.5, w2.z - 0.5, { args: { count: 4 }, lights: false });
  for (const key of ['n1', 'n3', 'w1']) {
    const a = ALCOVES[key];
    L.prop('candle', a.x + (a.out[1] ? 0.6 : 0.3), a.z + (a.out[0] ? 0.6 : 0.3), { lights: false, args: { lit: false, h: 0.08 } });
    L.decal('grime', [a.x, 0, a.z], { face: 'up', size: 1.6 });
  }
  rubble(L, rng, { x: 14.8, z: 3.8, r: 0.4, n: 4, h: 0.12, bricks: 3 });
  blob(L, 31.4, 0.05, 20.4, 0.4, { mat: 'fleshDark', squash: [1, 0.3, 1], seed: 3 });
}

// The valve wheel waiting on the plinth.
function valve(L, game) {
  const pos = [CX, PLINTH_TOP + 0.005, CZ];
  const pk = L.pickup({
    id: 'valve',
    kind: 'item',
    item: 'valve',
    pos,
    rotY: 0.3,
    prompt: 'Take the valve wheel',
    message: 'A heavy iron valve wheel. There was an empty spindle by the sluice gate.',
  });
  // The pickup system looks for a prop named after the item; the model is 'valveWheel'.
  if (pk && !PROP_NAMES.includes('valve') && PROP_NAMES.includes('valveWheel')) {
    for (const c of pk.object.children) c.visible = false;
    pk.object.add(makeProp('valveWheel'));
  }
  return pk;
}

// ---------- The rite ----------
const RITE = [
  { id: 'c_ac_pool1', alcove: 'n1', ring: [20.4, 6.9] },
  { id: 'c_ac_pool2', alcove: 'n3', ring: [25.7, 6.9] },
  { id: 'c_ac_pool3', alcove: 'w1', ring: [17.6, 10.6] },
];

function ritual(L, game, state, done) {
  const lvl = L.level;
  const center = new THREE.Vector3(CX, 0, CZ);
  if (done) {
    // Survivors of an earlier rite still keep the pool.
    for (const a of RITE) {
      if (game.flags.has(`killed:${a.id}`)) continue;
      L.enemy('acolyte', [a.ring[0], 0, a.ring[1]], { id: a.id, idle: 'wander', wanderRadius: 3, yaw: Math.atan2(CX - a.ring[0], CZ - a.ring[1]) });
    }
    return;
  }
  let phase = 'wait';
  let t = 0;
  let tc = 0;
  let cult = [];
  const noSee = () => false;
  const turn = (g) => {
    if (phase === 'turned') return;
    phase = 'turned';
    let first = true;
    for (const c of cult) {
      const e = c.e;
      delete e.perceive;
      delete e.hears;
      if (e.dead) continue;
      e.idleMode = 'wander';
      if (e.state === 'pray' || e.state === 'idle') e.alert(g.player.position);
      if (first) g.audio.play('acolyteScream', { pos: e.eye().clone() });
      first = false;
      g.enemies.spotted(e, true);
    }
    g.hud.say('The chanting stops. They turn, all at once, toward you.', 3.5);
  };
  L.trigger({
    min: [15.6, -1.5, 4.2],
    max: [30.4, 4, 19.8],
    once: true,
    onEnter: (g) => {
      if (g.flags.has('cistern.ritual') || g.flags.has('escape')) return;
      g.setFlag('cistern.ritual');
      phase = 'gather';
      t = 0;
      // The candles gutter; when they steady, the alcoves are no longer empty.
      for (const s of state.candles) s._base = s._base ?? s.intensity;
      g.audio.play('stinger', { gain: 0.6 });
      for (const a of RITE) {
        if (g.flags.has(`killed:${a.id}`)) continue;
        const al = ALCOVES[a.alcove];
        const pos = new THREE.Vector3(al.x - al.out[0] * 0.35, 0, al.z - al.out[1] * 0.35);
        const e = g.enemies.create(lvl, { type: 'acolyte', id: a.id, pos, yaw: Math.atan2(al.out[0], al.out[1]), idle: 'patrol', patrol: [a.ring] });
        if (!e) continue;
        e.perceive = noSee;
        e.hears = noSee;
        cult.push({ e, ring: a.ring, arrived: false });
      }
      setTimeout(() => lvl.active && phase !== 'turned' && g.audio.play('chant', { pos: new THREE.Vector3(CX, 1.5, CZ - 3), gain: 0.8 }), 1200);
      g.hud.say('Water laps in the dark. Someone is humming beneath it.', 3.5);
    },
  });
  L.onUpdate((dt, time, g) => {
    if (phase === 'wait' || phase === 'turned') return;
    t += dt;
    tc += dt;
    // Candles gutter as they appear.
    if (tc < 3) {
      for (const s of state.candles) {
        const k = tc < 0.5 ? 1 - tc * 1.7 : tc < 1.4 ? 0.15 : Math.min(1, 0.15 + (tc - 1.4) * 0.9);
        s.intensity = (s._base ?? 1.5) * Math.max(0.15, k);
      }
    }
    // Anyone hurt, or you close in on them: the rite is over.
    for (const c of cult) {
      const e = c.e;
      if (e.dead || e.health < e.maxHealth || !['idle', 'pray'].includes(e.state)) return turn(g);
      if (e.distToPlayer() < 1.6) return turn(g);
      if (!c.arrived && Math.hypot(e.pos.x - c.ring[0], e.pos.z - c.ring[1]) < 0.75) {
        c.arrived = true;
        e.idleMode = 'stand';
        e.setState('pray');
        e.yaw = Math.atan2(CX - e.pos.x, CZ - e.pos.z);
      }
      if (c.arrived && e.state === 'pray') e.yaw += (Math.atan2(CX - e.pos.x, CZ - e.pos.z) - e.yaw) * Math.min(1, dt * 3);
    }
    if (phase === 'gather' && (cult.every((c) => c.arrived) || t > 9)) {
      phase = 'tint';
      t = 0;
      for (const c of cult) {
        if (c.arrived) continue;
        c.arrived = true;
        c.e.idleMode = 'stand';
        c.e.setState('pray');
      }
      state.water.tintTo('red', 6);
      state.red.enabled = true;
      g.audio.play('chant', { pos: center.clone().setY(1.5), gain: 1 });
      g.audio.play('heart', { gain: 0.7 });
      g.hud.say('The water in the pool is turning red.', 3);
    }
    if (phase === 'tint') {
      state.redT = Math.min(1, t / 6);
      if (t > 3 && t - dt <= 3) g.audio.play('chant', { pos: center.clone().setY(1.5), gain: 0.9 });
      if (t >= 6.5) turn(g);
    }
  });
  L.onExit(() => {
    // Leaving mid-rite (or dying) ends it; a rebuilt level restores the aftermath from flags.
    if (phase === 'gather' || phase === 'tint') turn(L.game);
  });
}
