import * as THREE from 'three';
import { blob, M } from './geo.js';
import { R } from './layout.js';

// The ossuary crawlspace: a low passage walled with skulls where you have to
// crawl, bones crunching under your knees. Near the end the stone gives way to
// meat and veins, opening into a flesh pocket and the throat to the caves.

// Crouch volumes (a little longer than the low ceiling at both ends).
const CRAWL = [
  { x0: 22.9, x1: 25.1, z0: 44.0, z1: 51.0 },
  { x0: 24.9, x1: 32.9, z0: 48.9, z1: 51.1 },
];

export function buildOssuary(L, fx, rng, game) {
  skullWalls(L);
  bones(L, rng);
  fleshCreep(L, rng);
  pocket(L, rng);
  crawlLogic(L);
  L.exit({ min: [36.9, -0.5, 49.0], max: [38.0, 2.5, 51.0], to: 'caves', spawn: 'fromCistern', requires: (g) => (g.flags.has('escape') ? 'Not back in there. Not with her.' : true) });
}

function skullWalls(L) {
  const H = 1.2;
  const wall = (x, z, face, seed, width = 2) => L.prop('skullWall', x, z, { face, seed, args: { width, height: H, seed } });
  // South leg.
  for (const z of [46, 48, 50]) wall(23.1, z, 'e', 11 + z);
  for (const z of [46, 48]) wall(24.9, z, 'w', 31 + z);
  // East leg and the corner.
  for (const x of [24, 26, 28]) wall(x, 50.9, 'n', 51 + x);
  for (const x of [26, 28]) wall(x, 49.1, 's', 71 + x);
  wall(29.6, 50.9, 'n', 97, 1.2);
  wall(29.6, 49.1, 's', 98, 1.2);
  // The ceiling: rough slabs, with bones jammed between them.
  for (const r of [R.crawlA, R.crawlB]) L.decal('grime', [(r.x0 + r.x1) / 2, 1.24, (r.z0 + r.z1) / 2], { face: 'down', size: [r.x1 - r.x0, r.z1 - r.z0] });
}

function bones(L, rng) {
  const spots = [
    [23.9, 45.6],
    [24.2, 47.3],
    [23.8, 48.9],
    [24.3, 50.2],
    [26.4, 50.1],
    [28.1, 49.8],
    [29.8, 50.2],
  ];
  for (const [i, [x, z]] of spots.entries()) L.prop('bonesPile', x, z, { rotY: rng() * 6, args: { radius: 0.45, count: 9 + (i % 3) * 3, skulls: 1 + (i % 2) } });
  L.prop('skullPile', 23.6, 50.5, { args: { count: 12 } });
  // Candle stubs pressed into the bone, one still burning.
  L.prop('candle', 23.5, 47.2, { lights: false, args: { h: 0.05, lit: false } });
  L.prop('candle', 24.55, 49.35, { args: { h: 0.07 }, flicker: 0.5 });
  L.prop('candle', 27.3, 49.4, { lights: false, args: { h: 0.06 } });
  L.decal('bloodSmear', [24, 0, 46.8], { face: 'up', size: [0.7, 2.4], rot: 0 });
  L.decal('bloodSmear', [27, 0, 50], { face: 'up', size: [0.7, 2.2], rot: Math.PI / 2 });
  L.decal('handprint', [23.35, 0.7, 48.9], { face: 'e', size: 0.28 });
}

// Past the bend the walls sicken: flesh swells out between the skulls.
function fleshCreep(L, rng) {
  for (let i = 0; i < 26; i++) {
    const x = 28.4 + Math.pow(rng(), 0.6) * 3.6;
    const k = (x - 28.4) / 3.6;
    const side = rng() < 0.5 ? 49.3 : 50.7;
    const up = rng();
    if (up < 0.25) blob(L, x, 1.2, rng.range(49.4, 50.6), rng.range(0.2, 0.35) * (0.6 + k), { squash: [1.3, 0.35, 1], seed: i, rot: rng() * 6 });
    else if (up < 0.45) blob(L, x, 0.02, side + (side < 50 ? 0.15 : -0.15), rng.range(0.2, 0.4) * (0.5 + k), { mat: 'fleshDark', squash: [1.4, 0.2, 1], seed: i + 40 });
    else blob(L, x, rng.range(0.2, 1.0), side, rng.range(0.18, 0.34) * (0.6 + k * 0.8), { squash: [1, 1, 0.55], seed: i + 80, rot: rng() * 6 });
  }
  // Veins crawling along the walls toward the pocket.
  for (const [z, y0, y1] of [
    [49.32, 0.9, 0.5],
    [50.68, 0.4, 1.0],
    [49.32, 0.25, 0.7],
  ]) {
    L.prop('vein', 30.1, z, { y: 0, rotY: 0, args: { from: [-1.8, y0, 0], to: [1.9, y1, 0], radius: 0.035, sag: 0.08, branches: 1, seed: Math.round(z * 10 + y0 * 7) }, collider: 'none' });
  }
  const g = new THREE.BoxGeometry(1.2, 0.02, 1.7);
  g.translate(31.4, 0.005, 50);
  L.batcher.add(g, M('fleshDark'), { cast: false });
}

function pocket(L, rng) {
  const p = R.pocket;
  L.prop('sac', 33.0, 48.12, { y: 0.9, face: 's', args: { mount: 'wall', count: 6 }, collider: 'none' });
  L.prop('sac', 35.2, 51.85, { y: 0.4, face: 'n', args: { mount: 'wall', count: 5 }, collider: 'none' });
  L.prop('eggCluster', 35.1, 48.8, { args: { count: 7 }, collider: 'none' });
  L.prop('tendril', 34.0, 50.4, { y: 2.3, args: { length: 1.0 }, collider: 'none' });
  L.prop('tendril', 36.9, 49.6, { y: 2.05, args: { length: 1.2 }, collider: 'none' });
  L.prop('vein', 34, 50, { y: 0, args: { from: [-1.6, 1.9, -1.7], to: [1.8, 1.7, 1.6], radius: 0.06, sag: 0.3 }, collider: 'none' });
  L.prop('bonesPile', 33.2, 51.1, { args: { radius: 0.5, count: 8, skulls: 1 } });
  L.decal('bloodPool', [34.3, 0.03, 49.6], { face: 'up', size: 1.6 });
  for (let i = 0; i < 5; i++) blob(L, p.x0 + 0.4 + rng() * 3.2, 0.03, rng() < 0.5 ? 48.5 : 51.5, rng.range(0.25, 0.45), { mat: 'fleshDark', squash: [1.3, 0.3, 1], seed: 200 + i });
  // Something breathing further in.
  L.light({ pos: [37.4, 1.0, 50], color: 0xff3a24, intensity: 1.4, distance: 5, kind: 'flesh' });
  L.loopSound('fleshBreath', [37.5, 1, 50], { radius: 10, gain: 0.7 });
  L.sound('squelch', [37, 1, 50], { interval: [6, 14], radius: 12, gain: 0.6 });
}

// Crouch inside the crawl volumes; bones crack as you move.
function crawlLogic(L) {
  let inside = false;
  let told = false;
  let dist = 0;
  let next = 1.2;
  const last = new THREE.Vector3();
  const contains = (p) => p.y > -1 && p.y < 2 && CRAWL.some((b) => p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1);
  L.onUpdate((dt, t, g) => {
    const p = g.player.position;
    const now = contains(p);
    if (now !== inside) {
      inside = now;
      g.player.crouchZone = now;
      g.player.eyeScaleTarget = now ? 0.55 : 1;
      last.copy(p);
      if (now && !told && !g.flags.has('escape')) {
        told = true;
        g.hud.say('Skulls, hundreds of them, set into the walls like brick. You have to crawl.', 4);
      }
    }
    if (!inside) return;
    dist += Math.hypot(p.x - last.x, p.z - last.z);
    last.copy(p);
    if (dist > next) {
      dist = 0;
      next = 1.1 + Math.random() * 1.1;
      g.audio.play('crack', { pos: new THREE.Vector3(p.x, p.y + 0.1, p.z), gain: 0.55 });
    }
  });
  L.onExit((g) => {
    if (!inside) return;
    inside = false;
    g.player.crouchZone = false;
    g.player.eyeScaleTarget = 1;
  });
}
