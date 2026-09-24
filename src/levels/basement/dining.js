import * as THREE from 'three';
import { put, note, bake, Kit, addCandle, junk, scum, solid } from './util.js';
import { place } from './west.js';
import { Y, SPOT } from './layout.js';

// The drowned dining room: a long table set for a feast stands on a sunken
// dais with its top just clear of the water. A drowned host sits at the head
// under a candle chandelier; the crowbar lies in front of it. Taking it
// wakes the host, and two more guests rise from the water around the table.

const TOP = 0.786; // table top (dining table on the dais at y = 0)

export function diningRoom(L, game, fl, { flood }) {
  const { x0, x1, z } = SPOT.table;
  const [hx, , hz] = SPOT.host;
  // Dais under the table and chairs (the rest of the room is waist-deep).
  L.box([16.3, Y.D, z - 1.95], [26.5, 0, z + 1.95], 'stone');

  // Two long tables end to end, laid with a rotten feast.
  put(L, 'diningTable', 19.9, z, { collider: 'none', args: { rotten: true } });
  put(L, 'diningTable', 23.1, z, { collider: 'none', args: { rotten: true }, seed: 77 });
  L.collider([x0 - 0.04, 0, z - 0.57], [x1 - 0.08, 0.8, z + 0.57], { walkable: false });

  // Guests' chairs, pushed about; the one nearest the host is gone.
  const xs = [18.9, 20.1, 21.3, 22.5, 23.7];
  for (const [i, x] of xs.entries()) {
    const j = (i * 37) % 7;
    if (!(i === 1)) put(L, 'chair', x + (j - 3) * 0.03, z - 0.95 - (j % 3) * 0.08, { rotY: (j - 3) * 0.06 });
    if (i !== 4) put(L, 'chair', x - (j - 3) * 0.02, z + 0.95 + (j % 2) * 0.1, { rotY: Math.PI + (3 - j) * 0.05 });
  }
  put(L, 'chair', 20.2, z + 2.3, { fallen: 'back', rotY: 2.4 });
  // The host's chair (no collider: the host sits in it) and the empty foot.
  put(L, 'chair', hx, hz, { face: 'w', collider: 'none' });
  put(L, 'chair', x0 - 0.62, z, { face: 'e' });

  // Candles: a chandelier over the table, a candelabra in the middle and
  // two tall iron ones flanking the host.
  put(L, 'chandelier', 21.5, z, { y: 3.95, args: { drop: 1.9, r: 0.78, candles: 12 }, lights: false });
  const chand = L.light({ pos: [21.5, 1.95, z], color: 0xe08a2c, intensity: flood ? 1.6 : 2.7, distance: 11, flicker: flood ? 0.8 : 0.35, kind: 'candle', priority: 2.5 });
  L.loopSound('candle', [21.5, 1.9, z], { radius: 7, gain: 0.5 });
  const cands = [put(L, 'candelabra', 21.5, z, { y: TOP }), put(L, 'candelabra', 26.1, z - 1.05, { args: { tall: true } }), put(L, 'candelabra', 26.1, z + 1.05, { args: { tall: true }, seed: 5 })];
  const candSources = cands.flatMap((c) => c?.userData.sources || []);
  // The head of the table is the brightest place in the room: it draws the eye.
  for (const s of candSources.slice(1)) {
    s.priority = 2.2;
    s.intensity = 1.8;
    s.distance = 6.5;
  }

  feast(L, x0, x1, z, hx);
  // Crowbar in front of the host, like a place setting.
  if (!flood) {
    L.pickup({
      id: 'crowbar',
      kind: 'item',
      item: 'crowbar',
      pos: [x1 - 0.42, TOP + 0.005, z - 0.12],
      rotY: 0.25,
      prompt: 'Take the crowbar',
      message: 'Cold, heavy iron. It was laid out for someone, like a knife and fork.',
      onTake: (g) => wakeTheTable(L, g, floatSet, chand, candSources),
    });
  }
  note(L, [x0 + 0.25, TOP + 0.06, z + 0.18], ['A place card at the foot of the table, the ink run with water: FOR THE ONE WHO COMES DOWN.'], { prompt: 'Read the place card', rotY: Math.PI / 2 });

  // The Mother's sigil behind the host; portraits and dead sconces above the waterline.
  L.decal('sigil', [27.885, 1.7, z], { face: 'w', size: 2.3 });
  L.decal('bloodDrip', [27.885, 1.2, z - 0.7], { face: 'w', size: [0.6, 1.1] });
  put(L, 'painting', 17.6, -7.89, { y: 1.35, face: 's', args: { w: 0.8, h: 1.0 } });
  put(L, 'painting', 24.4, -7.89, { y: 1.4, face: 's', args: { w: 0.9, h: 1.15, tilt: 0.06 } });
  put(L, 'painting', 21.0, 3.89, { y: 1.35, face: 'n', args: { w: 1.2, h: 0.9 } });
  for (const [x, zz, face] of [[15.5, -7.89, 's'], [21, -7.89, 's'], [26.5, -7.89, 's'], [16.5, 3.89, 'n'], [25.5, 3.89, 'n']]) {
    put(L, 'sconce', x, zz, { y: 1.75, face, args: { lit: false } });
  }
  // Waterline grime on all four walls.
  const k = new Kit(81);
  for (const zz of [-7.895, 3.895]) k.box('murky', 16, 0.2, 0.004, 21, 0.78, zz);
  for (const xx of [14.105, 27.895]) k.box('murky', 0.004, 0.2, 12, xx, 0.78, -2);
  bake(L, k);

  // Floating tealights around the dais.
  const floatSet = floatingCandles(L, fl, !flood);
  scum(L, 16.2, 1.8, 83);
  scum(L, 25.8, -6.1, 84);
  fl.add(place(L, junk('planks', 85), 15.8, -6.4, 0.9), { off: 0.02 });

  L.sound('gurgle', [21, 0.6, -5], { interval: [16, 34], radius: 16, gain: 0.55 });
  L.sound('gurgle', [20, 0.6, 1.5], { interval: [20, 40], radius: 16, gain: 0.45 });
  for (const [x, zz] of [[15.5, -6], [26, 2.5], [21, -2]]) L.sound('drip', [x, 3.2, zz], { interval: [3, 8], radius: 12 });
}

// Extra dressing on the table: weed hanging into the water, bottles of the
// 1911, eels on a plate near the host, a bowl of dark water at the foot.
function feast(L, x0, x1, z, hx) {
  const k = new Kit(91);
  const r = k.rng;
  const weed = solid(0x1a2418, { roughness: 0.35 });
  const eel = solid(0x14161a, { roughness: 0.2, metalness: 0.2 });
  for (let i = 0; i < 16; i++) {
    const x = x0 + 0.2 + r() * (x1 - x0 - 0.4);
    const s = r() < 0.5 ? -1 : 1;
    const ez = z + s * 0.565;
    const len = r.range(0.25, 0.5);
    k.tube(weed, [[x, TOP + 0.004, ez - s * 0.08], [x + r.range(-0.04, 0.04), TOP + 0.01, ez + s * 0.01], [x + r.range(-0.06, 0.06), TOP - len * 0.5, ez + s * 0.03], [x + r.range(-0.08, 0.08), TOP - len, ez + s * r.range(0.02, 0.08)]], (t) => 0.012 * (1 - t * 0.6), 6, 4);
  }
  // Bottles near the head of the table, one on its side.
  for (const [bx, bz, lie] of [[x1 - 0.95, z + 0.36, 0], [x1 - 1.3, z - 0.4, 0], [x1 - 2.2, z + 0.25, 1]]) {
    const prof = [[0, 0], [0.036, 0.002], [0.036, 0.2], [0.014, 0.26], [0.012, 0.31], [0, 0.31]];
    if (lie) k.lathe('glass', prof, bx, TOP + 0.036, bz, 8, 0, 0.6, Math.PI / 2);
    else {
      k.lathe('glass', prof, bx, TOP, bz, 8);
      k.cyl('waxRed', 0.015, 0.015, 0.04, bx, TOP + 0.3, bz, 0, 0, 0, 6);
    }
  }
  // Eels coiled on a plate.
  k.lathe('ceramic', [[0, 0], [0.1, 0], [0.16, 0.012], [0.18, 0.02], [0, 0.008]], x1 - 0.9, TOP, z - 0.18, 14);
  for (let e = 0; e < 3; e++) {
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const a = i * 0.9 + e * 2;
      const rr = 0.13 - i * 0.012;
      pts.push([x1 - 0.9 + Math.cos(a) * rr, TOP + 0.03 + e * 0.02 + i * 0.002, z - 0.18 + Math.sin(a) * rr]);
    }
    k.tube(eel, pts, (t) => 0.018 * (1 - t * 0.7), 16, 6);
  }
  // Bowl of dark water at the foot: the place set for whoever comes down.
  k.lathe('ceramic', [[0, 0], [0.05, 0], [0.09, 0.04], [0.1, 0.07], [0.095, 0.072], [0.085, 0.045], [0, 0.03]], x0 + 0.3, TOP, z - 0.12, 14);
  k.cyl('water', 0.086, 0.086, 0.004, x0 + 0.3, TOP + 0.058, z - 0.12, 0, 0, 0, 14);
  bake(L, k);
}

// Tealights on little wooden rafts floating on the water.
function floatingCandles(L, fl, lit) {
  const groups = [];
  const spots = [
    [15.6, -4.4], [16.4, 0.9], [17.8, -5.0], [18.6, 1.4], [20.3, -5.5], [21.2, 1.9], [22.4, -4.7],
    [23.5, 1.0], [24.8, -5.2], [25.9, 1.6], [26.9, -4.2], [27.1, 0.4], [15.2, -1.2], [19.5, -6.6],
  ];
  const all = [];
  for (let gi = 0; gi < 2; gi++) {
    const k = new Kit(101 + gi);
    const g = new THREE.Group();
    for (let i = gi; i < spots.length; i += 2) {
      const [x, z] = spots[i];
      k.push(x, 0, z, 0, k.rng() * 3, 0);
      k.cyl('woodRotten', 0.07, 0.075, 0.025, 0, 0, 0, 0, 0, 0, 8);
      k.push(0, 0.012, 0);
      const f = addCandle(k, { h: k.rng.range(0.03, 0.07), r: 0.028, lit, drips: 2, seg: 6 });
      k.pop();
      k.pop();
      if (f) all.push(f);
    }
    const built = k.build('floatingCandles');
    for (const m of [...built.children]) g.add(m);
    L.mesh(g, { static: false, collider: 'none' });
    fl.add(g, { off: 0.005, amp: 0.008, speed: 0.7 + gi * 0.3, tilt: 0 });
    groups.push(g);
  }
  let src = null;
  if (all.length) {
    const c = all.reduce((a, p) => [a[0] + p[0] / all.length, 0, a[2] + p[2] / all.length], [0, 0, 0]);
    src = L.light({ pos: [c[0], 0.9, c[2]], color: 0xe08a2c, intensity: 1.0, distance: 8, flicker: 0.5, kind: 'candle', priority: 1.2 });
  }
  return { groups, src };
}

// Taking the crowbar: the candles on the water gutter out, the chandelier
// shudders, and the table wakes (the host and the guests have wakeFlag).
function wakeTheTable(L, g, floatSet, chand, candSources) {
  const t0 = L.level.time;
  g.audio.play('stinger', { gain: 0.8 });
  g.player.shake = Math.max(g.player.shake, 0.35);
  setTimeout(() => g.levels.current === L.level && g.hud.say('At the head of the table, the host lifts its head.', 3.5), 600);
  chand.flicker = 0.95;
  for (const s of candSources) s.flicker = 0.9;
  let done = false;
  L.onUpdate(() => {
    if (done) return;
    const t = L.level.time - t0;
    // Floating candles die one group at a time.
    for (const [i, gr] of floatSet.groups.entries()) {
      if (t > 0.8 + i * 1.1) {
        gr.traverse((m) => {
          if (m.isMesh && m.material?.name === 'candleFlame') m.visible = false;
        });
      }
    }
    if (floatSet.src) floatSet.src.intensity = Math.max(0, 1.0 * (1 - (t - 0.8) / 1.6));
    if (t > 3.5) {
      chand.flicker = 0.55;
      for (const s of candSources) s.flicker = 0.5;
      done = true;
    }
  });
}
