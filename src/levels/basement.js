import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ORIGIN, W, H, X, Z, Y, makeRows, ROOM_DEFS, DOORS, OPEN, WATER_Y, FLOOD_TO, FLOOD_SECONDS, SPOT } from './basement/layout.js';
import { Floaters, lookYaw, faceYaw } from './basement/util.js';
import { stairwell, hall, storage, laundry } from './basement/west.js';
import { boilerRoom, coalRoom, wineCellar } from './basement/service.js';
import { diningRoom } from './basement/dining.js';
import { pumpRoom } from './basement/pump.js';

// Level 4: the flooded basement. You come down the kitchen stairs into black
// water: the cult drowned the lower house to keep the Mother Below asleep.
// A vaulted hall leads to the pump room, where a rusted grate seals the shaft
// down to the cistern. The crowbar that opens it lies on the table of the
// drowned dining room, in front of the thing sitting at its head.
//
// Flood variant (the escape): you climb back up the shaft with your sister
// and the water rises from knee height to over your head in 100 s. The pump
// room is ~30 m from the stairs, straight up the hall.

export default {
  id: 'basement',
  name: 'Flooded basement',
  subtitle: 'The lower house is drowned',
  zone: 'drowned',
  variant: (game) => (game.flags.has('escape') ? 'flood' : 'normal'),
  prepare(game) {
    const inv = game.inventory;
    for (const it of ['phone', 'knife', 'revolver']) inv.addItem(it, { silent: true });
    inv.addAmmo('revolver', 12);
    for (const f of ['stairs.cut', 'power.on', 'took:fuse']) game.setFlag(f);
  },
  build(L, game) {
    const flood = game.flags.has('escape');
    L.env({
      fog: { color: 0x031010, density: flood ? 0.068 : 0.06 },
      ambient: { sky: 0x2a4a4a, ground: 0x050b0b, intensity: 0.32 },
      grade: { color: 0x60c8c0, amount: 0.4 },
      exposure: 1.05,
      music: flood ? 'escape' : 'undertow',
    });

    L.plan({ origin: ORIGIN, rows: makeRows(), rooms: ROOM_DEFS, doors: DOORS, open: OPEN });

    // One water surface over the whole level (the pump room sits above it).
    const fl = new Floaters(L);
    const water = flood
      ? L.flood({ min: [X(0), Z(0)], max: [X(W), Z(H)], from: WATER_Y, to: FLOOD_TO, seconds: FLOOD_SECONDS, color: 'teal' })
      : L.water({ min: [X(0), Z(0)], max: [X(W), 10], y: WATER_Y, color: 'teal', opacity: 0.88 });
    fl.water = water;

    // Steps up out of the water to the pump room door.
    L.stairs({ x0: -3, z0: 8.35, x1: -1, z1: 9.87, fromY: 0, toY: Y.P, dir: 's', material: 'stone', riser: 'stone' });

    stairwell(L);
    hall(L, fl);
    storage(L, fl);
    laundry(L, fl);
    boilerRoom(L, fl, water);
    coalRoom(L, fl);
    wineCellar(L, fl);
    diningRoom(L, game, fl, { flood });
    pumpRoom(L, game, water, { flood });

    // ---------- Spawns and exits ----------
    L.spawn('fromGround', SPOT.start, Math.PI);
    L.spawn('start', SPOT.start, Math.PI);
    L.spawn('fromCistern', SPOT.cistern, lookYaw(SPOT.cistern[0], SPOT.cistern[2], -2, 10));
    L.exit({ min: [-3, 2.1, -18], max: [-1, 5.6, -15.1], to: 'ground', spawn: 'fromBasement' });

    if (flood) floodEscape(L);
    else enemies(L);
    visibility(L);

    L.onEnter((g, spawn) => {
      if (g.flags.has('escape')) {
        g.hud.say('The cistern is coming up the shaft behind you. The stairs — get her up the stairs.', 4.5);
        return;
      }
      if (spawn === 'fromGround' && !g.flags.has('basement.seen')) {
        g.setFlag('basement.seen');
        setTimeout(() => g.levels.current?.id === 'basement' && g.hud.say('The stairs go down into black water. The whole lower house is drowned.', 4.5), 2500);
      }
    });
  },
};

function enemies(L) {
  const dormant = (id, pos, opts) => L.enemy('drowned', pos, { id, idle: 'dormant', ...opts });
  // Rises from the laundry as you wade past its door in the hall.
  dormant('b_laundry', [-6.4, Y.L, 4.4], { wakeRadius: 4.8, yaw: faceYaw(-6.4, 4.4, -4, 4.5) });
  // In the wine cellar aisle, on the way to the dining room.
  dormant('b_cellar', [8.6, Y.V, -2.4], { wakeRadius: 3.6, yaw: faceYaw(8.6, -2.4, 4, -2) });
  // The table wakes when the crowbar is taken.
  L.enemy('drowned', SPOT.host, { id: 'b_host', idle: 'seated', wakeFlag: 'took:crowbar', yaw: -Math.PI / 2 });
  dormant('b_guest1', [23.2, Y.D, -5.1], { wakeFlag: 'took:crowbar', yaw: 0 });
  dormant('b_guest2', [19.6, Y.D, 1.2], { wakeFlag: 'took:crowbar', yaw: Math.PI });
  // ...and one more in the cellar, between you and the way out.
  dormant('b_cellar2', [7.6, Y.V, -0.75], { wakeFlag: 'took:crowbar', yaw: Math.PI / 2 });
  // Teaser: something long moves in the coal room's chest-deep water.
  L.enemy('lamprey', [-17.6, Y.k, 7.9], { id: 'b_lamprey', idle: 'dormant', wakeRadius: 4, yaw: Math.PI });
}

// Escape: two drowned in the hall, every light guttering.
function floodEscape(L) {
  L.enemy('drowned', [-1.2, 0, 3.2], { id: 'b_flood1', idle: 'dormant', wakeRadius: 5, yaw: Math.PI });
  L.enemy('drowned', [-3.0, 0, -5.8], { id: 'b_flood2', idle: 'dormant', wakeRadius: 4, yaw: Math.PI });
  for (const s of L.level.lightSources) s.flicker = Math.max(s.flicker || 0, s.kind === 'bulb' ? 0.9 : 0.5);
  L.sound('collapse', [-2, 3, 0], { interval: [14, 26], radius: 40, gain: 0.5 });
  L.sound('waterRise', [-2, 1, 6], { interval: [9, 16], radius: 30, gain: 0.6 });
}

// Draw-call budget: creature models and dynamic props are many meshes each,
// and frustum culling alone draws everything behind the walls. Every 0.1 s
// hide dynamic objects and enemies that no wall-free line reaches from the
// camera (with a short hold-over), and drop shadows for dormant enemies.
// The fog hides everything past ~38 m, so the far plane comes in too.
function visibility(L) {
  const cam = new THREE.Vector3();
  const pt = new THREE.Vector3();
  const box = new THREE.Box3();
  const walls = (c) => c.solid && !c.seeThrough && c.type === 'box' && c.max.y - c.min.y > 2.0;
  const items = [];
  const zones = [];
  let ready = false;
  // Static batches are chunked in 14 m columns of x, which line up with the
  // wings here: -2 boiler/coal, -1 hall/storage/laundry/stairs/pump room,
  // 0 passage/cellar, 1 dining room. A column is only drawn from where it
  // can be seen at less than fog-saturated distance.
  const ZONE_RULE = { '-2': (x) => x < 4, '-1': (x) => x < 16, 0: (x) => x > -14, 1: (x) => x > -5 };
  let tick = 0;
  const seen = (ph, x, y, z, h, t, it, maxD = 36) => {
    const d = cam.distanceTo(pt.set(x, y, z));
    let ok = d < 3.5;
    if (!ok && d < maxD) {
      for (const f of [0.5, 1.0, 0.1]) {
        pt.set(x, y + (f - 0.5) * h, z);
        if (ph.lineOfSight(cam, pt, walls)) {
          ok = true;
          break;
        }
      }
    }
    if (ok) it._seenAt = t;
    return t - (it._seenAt ?? -9) < 0.5;
  };
  L.onEnter((g) => {
    g.camera.far = 38;
    g.camera.updateProjectionMatrix();
  });
  L.onExit((g) => {
    g.camera.far = CONFIG.camera.far;
    g.camera.updateProjectionMatrix();
  });
  L.onUpdate((dt, t, g) => {
    tick -= dt;
    if (tick > 0) return;
    tick = 0.1;
    const lv = L.level;
    const ph = lv.physics;
    if (!ready) {
      ready = true;
      const skip = new Set([...lv.enemies.map((e) => e.root), ...lv.waters.map((w) => w.mesh)]);
      for (const c of lv.group.children) {
        if (c.isMesh && c.matrixAutoUpdate === false) {
          const rule = ZONE_RULE[Math.floor(c.geometry.boundingSphere.center.x / 14)];
          if (rule) zones.push([c, rule]);
          continue;
        }
        if (skip.has(c)) continue;
        box.setFromObject(c);
        if (box.isEmpty()) continue;
        const ctr = box.getCenter(new THREE.Vector3());
        items.push({ o: c, off: ctr.sub(c.position), h: Math.min(2.5, Math.max(0.2, box.max.y - box.min.y)) });
      }
    }
    cam.copy(g.camera.position);
    for (const [m, rule] of zones) m.visible = rule(cam.x);
    for (const it of items) {
      const o = it.o;
      if (!o.parent) continue;
      o.visible = seen(ph, o.position.x + it.off.x, o.position.y + it.off.y, o.position.z + it.off.z, it.h, t, it);
    }
    for (const e of lv.enemies) {
      // Engine quirks: wake() leaves lastSeen at the origin and lostTimer has
      // been counting all the while it slept, so a risen drowned would wander
      // off or give up at once. Rising means it knows where you are.
      if (e.state === 'rise' || e.state === 'lunge') {
        e.lastSeen.copy(g.player.position);
        e.alerted = true;
        e.lostTimer = 0;
      }
      const h = e.model?.height ?? 1.6;
      e.root.visible = seen(ph, e.pos.x, e.pos.y + h * 0.5, e.pos.z, h, t, e, e.state === 'dormant' ? 16 : 23);
      const cast = e.state !== 'dormant' && e.state !== 'seated';
      if (e._cast !== cast) {
        e._cast = cast;
        e.root.traverse((m) => {
          if (!m.isMesh) return;
          m.userData.castDefault ??= m.castShadow;
          m.castShadow = cast && m.userData.castDefault;
        });
      }
    }
  });
}
