import * as THREE from 'three';
import { HUSHED, hushUntilNear } from './proximityAudio.js';
import { getMaterial, getDecalMaterial, solid } from '../world/materials.js';
import { makeProp, PROP_NAMES } from '../world/props/index.js';

// Level 2: the ground floor. The cabin is impossibly large inside: a foyer, a
// long hallway, a double-height stair hall, parlor, dining room, kitchen,
// study and library. The knife waits in a blood chapel hidden behind a
// library bookshelf; it cuts the rope barricade on the stairs. Later the fuse
// from the attic powers the basement door in the kitchen.

const W = 41;
const H = 23;
const ORIGIN = [-19.5, -13];

// Cell rectangles (inclusive) per room key.
const ROOMS = [
  ['c', 0, 2, 1, 2], // basement stair landing
  ['b', 0, 3, 1, 8], // basement stairs (down to the south)
  ['e', 0, 9, 1, 10], // basement stair bottom
  ['K', 2, 1, 9, 9], // kitchen
  ['D', 10, 1, 17, 9], // dining room
  ['G', 18, 1, 25, 9], // stair hall
  ['u', 21, 3, 23, 8], // grand stairs (up to the north)
  ['v', 21, 1, 23, 2], // top landing
  ['L', 26, 1, 32, 9], // library
  ['C', 33, 3, 40, 11], // hidden blood chapel
  ['H', 2, 10, 32, 11], // hallway
  ['P', 2, 12, 15, 21], // parlor
  ['F', 16, 12, 23, 20], // foyer
  ['S', 24, 12, 30, 20], // study
  ['s', 31, 14, 32, 16], // hidden stash behind the study wall
];

function makeRows() {
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  for (const [k, i0, j0, i1, j1] of ROOMS) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j][i] = k;
  return g.map((r) => r.join(''));
}

// Height of the top of a placed prop (for things set on tables).
const _box = new THREE.Box3();
const topOf = (obj) => _box.setFromObject(obj).max.y;

// World position of a cell centre.
const cx = (i) => ORIGIN[0] + i + 0.5;
const cz = (j) => ORIGIN[1] + j + 0.5;

export default {
  id: 'ground',
  name: 'Ground floor',
  subtitle: 'It is bigger inside',
  zone: 'cult',
  variant: (game) => (game.flags.has('escape') ? 'flood' : 'normal'),
  prepare(game) {
    game.inventory.addItem('phone', { silent: true });
  },
  build(L, game) {
    const flood = game.flags.has('escape');
    const has = (f) => game.flags.has(f);
    L.env({
      fog: { color: 0x0a0605, density: 0.075 },
      ambient: { sky: 0x3a2c22, ground: 0x0c0706, intensity: 0.32 },
      grade: { color: 0xffa860, amount: 0.35 },
      exposure: 1.05,
      music: flood ? 'escape' : 'liturgy',
      ...(flood ? {} : HUSHED),
    });

    const powerLocked = (g) => (g.flags.has('power.on') ? false : 'An electric lock, dead. A sticker reads BASEMENT CIRCUIT. The fuse box is on this wall.');
    const P = L.plan({
      origin: ORIGIN,
      rows: makeRows(),
      rooms: {
        K: { floor: 'tile', wall: 'wallpaperTorn', wainscot: true },
        D: { wall: 'wallpaper', wainscot: true },
        G: { wall: 'wallpaper', wainscot: true, h: 6.4 },
        u: { stairs: { dir: 'n', rise: 3.2 }, h: 3.2, stairMat: 'woodDark', riserMat: 'wainscot' },
        v: { y: 3.2, h: 3.2 },
        L: { wall: 'wallpaper', h: 3.4 },
        C: { style: 'stone', floor: 'stone', wall: 'stone', ceil: 'stone', h: 3.3, vault: true, vaultWidth: 8 },
        H: { wall: 'wallpaper', wainscot: true },
        P: { wall: 'wallpaperTorn', wainscot: true },
        F: { wall: 'wallpaper', wainscot: true, h: 3.4 },
        S: { wall: 'wallpaper' },
        s: { wall: 'plaster', floor: 'floorboards', ceil: 'plaster', h: 2.4, trim: false },
        c: { style: 'brick', floor: 'concrete', h: 3.1 },
        b: { style: 'brick', stairs: { dir: 's', rise: -2.8 }, h: 3.1, stairMat: 'stone', riserMat: 'stone' },
        e: { style: 'brick', y: -2.8, h: 3.0 },
      },
      open: ['Gu', 'Gv', 'uv', 'cb', 'be'],
      doors: [
        { at: [19, 20], side: 's', leaf: true, id: 'frontDoor', h: 2.3, locked: (g) => (g.flags.has('escape') ? false : 'It won’t open. The wood has swollen tight, or something is holding it.'), onOpen: (g) => g.levels.goTo('field', 'fromHouse') },
        { at: [16, 15], side: 'w', len: 2, h: 2.5 },
        { at: [23, 16], side: 'e', leaf: true, id: 'g_study' },
        { at: [18, 12], side: 'n', len: 4, h: 2.7 },
        { at: [19, 10], side: 'n', len: 6, h: 3.0 },
        { at: [13, 10], side: 'n', leaf: true, id: 'g_dining' },
        { at: [5, 10], side: 'n', leaf: true, id: 'g_kitchen', open: true },
        { at: [9, 5], side: 'e', leaf: true, id: 'g_kitchenDining', material: 'woodDark' },
        { at: [29, 10], side: 'n', leaf: true, id: 'g_library' },
        { at: [8, 11], side: 's', len: 2, h: 2.4 },
        { at: [27, 11], side: 's', leaf: true, id: 'g_study2' },
        { at: [2, 2], side: 'w', leaf: true, id: 'basementDoor', material: 'woodRotten', locked: powerLocked, prompt: 'Open the basement door' },
        { at: [32, 7], side: 'e', frame: false },
        { at: [30, 15], side: 'e', frame: false },
      ],
    });

    // Solid block under the stair landing.
    L.box([1.5, 0, -12], [4.5, 3.2, -10], 'wainscot', { walkable: false });
    // Stair side rails.
    for (const x of [1.55, 4.45]) {
      const g = new THREE.BoxGeometry(0.06, 0.06, 6.4).rotateX(Math.atan2(3.2, 6)).translate(x, 2.55, -7);
      L.batcher.add(g, getMaterial('woodDark'));
      for (let k = 0; k <= 6; k++) L.box([x - 0.03, 0.2 + k * 0.53, -4.2 - k - 0.03], [x + 0.03, 1.2 + k * 0.53, -4.2 - k + 0.03], 'woodDark', { collide: false });
    }

    // ---------- Spawns and exits ----------
    L.spawn('fromField', [0, 0, 7], 0);
    L.spawn('start', [0, 0, 7], 0);
    L.spawn('fromUpstairs', [3, 0, -3.4], Math.PI);
    L.spawn('fromBasement', [-18.5, -2.8, -3.7], 0);
    L.exit({ min: [1.5, 2.8, -12], max: [4.5, 5.5, -10.7], to: 'upstairs', spawn: 'fromGround' });
    L.exit({ min: [-19.5, -3.3, -2.6], max: [-17.5, -1.5, -2.0], to: 'basement', spawn: 'fromGround' });

    furnish(L, game, P);
    blood(L);
    stairsBarricade(L, game);
    secretBookshelf(L, game);
    secretPanel(L, game);
    const altarTop = chapel(L, game);
    fuseBox(L, game);
    notes(L, altarTop);
    pickups(L);
    enemies(L, game);
    if (!flood) hushUntilNear(L);

    // The front door slams behind you the first time.
    L.onEnter((g, spawn) => {
      if (spawn === 'fromField' && !g.flags.has('ground.slam')) {
        g.setFlag('ground.slam');
        g.audio.play('doorSlam', { pos: new THREE.Vector3(0, 1.2, 8) });
        g.player.shake = 0.6;
        g.hud.say('The door slams shut behind you.', 3);
        setTimeout(() => g.levels.current?.id === 'ground' && g.hud.say('This hall can’t fit inside the cabin you saw from the field. It goes on and on.', 5), 3200);
      }
      if (g.flags.has('escape')) g.hud.say('The front door. Get her out.', 4);
    });

    // Ambient life of the house.
    L.sound('creak', [8, 3, -8], { interval: [18, 40], radius: 30 });
    L.sound('creak', [-10, 3, 4], { interval: [20, 45], radius: 30 });
    L.sound('bell', [2.5, 6, -8], { interval: [35, 70], radius: 60, gain: 0.35 });
    L.sound('drip', [-18.5, -2, -4], { interval: [2, 5], radius: 10 });
    if (flood) floodHouse(L, game);
  },
};

// ---------- Rooms ----------
function furnish(L, game, P) {
  const lamp = (x, z, y, drop = 0.6, flicker = 0.3, buzz = true) => L.prop('bulb', x, z, { y, args: { drop, on: true }, flicker, buzz, collider: 'none' });

  // Foyer: chandelier, coat rack, a side table, rugs, a fallen chair.
  L.prop('chandelier', 0.5, 3.5, { y: 3.4, args: { drop: 1.1 }, collider: 'none', flicker: 0.4 });
  L.prop('rug', 0.5, 3.5, { collider: 'none' });
  L.prop('coatRack', -2.9, 7.3, { fallen: 'side', rotY: 0.4 });
  const ft = L.prop('table', 4.0, 5.5, { face: 'w' });
  L.prop('candle', 4.0, 5.5, { y: topOf(ft) });
  L.prop('clock', 4.1, 0.2, { face: 'w' });
  L.prop('painting', 4.39, 2.3, { y: 1.5, face: 'w', args: { w: 0.8, h: 1.0 } });
  L.prop('chair', -1.8, 1.0, { fallen: 'back', rotY: 2.2 });
  L.prop('mirror', -3.39, 6.0, { y: 1.3, face: 'e', args: { wall: true } });

  // Hallway: flickering bulbs, paintings, clutter.
  lamp(-12, -2, 3.1, 0.5, 0.35);
  lamp(-3, -2, 3.1, 0.5, 0.6);
  lamp(9, -2, 3.1, 0.5, 0.25);
  const ht = L.prop('table', -7, -2.5, { face: 's' });
  L.prop('candle', -7.1, -2.5, { y: topOf(ht) });
  L.prop('chair', -14.5, -1.6, { fallen: 'side', rotY: 1.1 });
  L.prop('painting', -9.5, -2.89, { y: 1.7, face: 's', args: { w: 0.7, h: 0.9 } });
  L.prop('painting', 6.2, -2.89, { y: 1.7, face: 's', args: { w: 1.0, h: 0.7 } });
  L.prop('boxes', 12.4, -1.6, { face: 'w' });
  L.prop('sheetCovered', -16.6, -2.1, { face: 'e' });

  // Stair hall: a high chandelier, an antler skull over the landing.
  L.prop('chandelier', 2.5, -6.5, { y: 6.4, args: { drop: 2.4 }, collider: 'none', flicker: 0.35 });
  L.prop('antlerSkull', 3, -11.89, { y: 5.0, face: 's' });
  L.prop('candleCluster', -0.6, -10.8, {});
  L.prop('candleCluster', 5.6, -4.2, {});
  L.prop('sheetCovered', 5.5, -10.5, { face: 'w' });
  L.prop('piano', -0.9, -7.5, { face: 'e' });

  // Dining room: long table, chairs (one overturned), a candelabra.
  const dt = L.prop('diningTable', -5.5, -7.3, { face: 'e', args: { rotten: true } });
  for (let k = 0; k < 4; k++) {
    const z = -9.1 + k * 1.1;
    L.prop('chair', -6.7, z, { face: 'e' });
    if (k !== 2) L.prop('chair', -4.3, z, { face: 'w' });
  }
  L.prop('chair', -3.5, -6.1, { fallen: 'side', rotY: -1.2 });
  L.prop('candelabra', -5.5, -7.3, { y: topOf(dt), flicker: 0.5 });
  L.prop('chair', -5.5, -9.5, { face: 's' });
  L.prop('dresser', -9.1, -5, { face: 'e' });
  L.prop('painting', -9.39, -8.5, { y: 1.7, face: 'e', args: { w: 1.1, h: 1.4 } });

  // Kitchen: counter, stove, shelves, table, a flickering bulb.
  L.prop('counter', -12.5, -11.55, { face: 's' });
  L.prop('stove', -15.4, -11.5, { face: 's' });
  L.prop('shelf', -10.0, -9.5, { face: 'w' });
  L.prop('table', -13.5, -6.5, { face: 's' });
  L.prop('chair', -12.6, -6.2, { fallen: 'side', rotY: 0.6 });
  L.prop('barrel', -16.9, -4, {});
  L.prop('crate', -16.8, -5.2, { rotY: 0.3 });
  lamp(-13.5, -7.5, 3.1, 0.7, 0.85);

  // Basement stairwell: teal light from below.
  L.prop('lantern', -18.2, -3.4, { y: -2.8 });
  L.light({ pos: [-18.5, -1.6, -3.5], color: 0x3fb8b0, intensity: 0.8, distance: 6, flicker: 0.1, kind: 'lantern' });

  // Parlor: fireplace, furniture knocked about.
  L.prop('fireplace', -17.3, 4, { face: 'e', args: { lit: true } });
  L.prop('sofa', -12.5, 4, { face: 'w' });
  L.prop('armchair', -14.8, 1.5, { face: 'e', rotY: Math.PI / 2 + 0.5 });
  L.prop('armchair', -14.5, 6.8, { fallen: 'back', rotY: 1.9 });
  L.prop('roundTable', -14.2, 4, { fallen: 'side', rotY: 0.7 });
  L.prop('rug', -14, 4, { collider: 'none' });
  L.prop('piano', -6.0, -0.35, { face: 's' });
  L.prop('bookshelf', -10, 8.6, { face: 'n' });
  L.prop('bookshelf', -4.1, 5.5, { face: 'w', fallen: 'front' });
  L.prop('mannequin', -16.6, 8.3, { face: 'n' });
  L.prop('painting', -17.39, 1.2, { y: 1.8, face: 'e', args: { w: 0.8, h: 1.0 } });
  L.prop('candle', -17.1, 5.6, { y: 1.2 });

  // Study: desk, chair, shelves, the loose panel on the east wall.
  const sd = L.prop('desk', 8, 1.2, { face: 's' });
  L.prop('chair', 8, 2.1, { face: 'n' });
  L.prop('candle', 8.6, 0.9, { y: topOf(sd) });
  L.prop('bookshelf', 5.0, 4.5, { face: 'e' });
  L.prop('bookshelf', 5.0, 6.3, { face: 'e' });
  L.prop('trunk', 10.6, 7.3, { face: 'n' });
  L.prop('painting', 11.39, 4.5, { y: 1.6, face: 'w', args: { w: 0.6, h: 0.8 } });

  // Library: shelves on every wall (the east one hides the chapel).
  for (const x of [7.4, 9.1, 10.8, 12.5]) L.prop('bookshelf', x, -11.7, { face: 's' });
  for (const z of [-10.5, -3.9]) L.prop('bookshelf', 13.2, z, { face: 'w' });
  L.prop('bookshelf', 6.9, -8.5, { face: 'e' });
  L.prop('bookshelf', 9.8, -6.5, { fallen: 'side', rotY: 0.35 });
  const ld = L.prop('desk', 8.2, -4.4, { face: 'n' });
  L.prop('armchair', 11, -8.8, { face: 'w' });
  L.prop('lectern', 7.6, -10.2, { face: 'e' });
  L.prop('candle', 8.6, -4.6, { y: topOf(ld) });
}

function blood(L) {
  // A drag trail from the foyer into the parlor.
  L.decal('bloodSmear', [-1.2, 0, 5.2], { face: 'up', size: [1.1, 2.2], rot: 0.9 });
  L.decal('bloodSmear', [-2.8, 0, 3.6], { face: 'up', size: [1.1, 2.2], rot: 1.2 });
  L.decal('bloodSmear', [-5.2, 0, 3.1], { face: 'up', size: [1.1, 2.2], rot: 1.5 });
  L.decal('bloodSplat', [-8.8, 0, 2.6], { face: 'up', size: 1.6 });
  L.decal('footprints', [0.2, 0, 1.5], { face: 'up', size: [0.6, 2.6], rot: 0.05 });
  L.decal('footprints', [2, 0, -2], { face: 'up', size: [0.6, 3], rot: Math.PI / 2 });
  // Hallway walls.
  L.decal('handprint', [-8.4, 1.3, -1.11], { face: 'n', size: 0.35 });
  L.decal('handprint', [-8.0, 1.1, -1.11], { face: 'n', size: 0.35 });
  L.decal('bloodDrip', [4.2, 2.2, -2.89], { face: 's', size: [1.2, 1.6] });
  L.decal('bloodSplat', [-3, 0, -2.2], { face: 'up', size: 1.2 });
  // Kitchen floor and dining cloth.
  L.decal('bloodSplat', [-13.4, 0, -8.2], { face: 'up', size: 2.2 });
  L.decal('bloodSmear', [-12.2, 0, -9.6], { face: 'up', size: [1, 2], rot: 0.4 });
  L.decal('grime', [-4, 0, 6], { face: 'up', size: 3 });
  L.decal('grime', [7, 0, -9], { face: 'up', size: 3 });
  L.decal('sigil', [2.5, 0, -1.2], { face: 'up', size: 2.2 });
  L.decal('bloodDrip', [-17.39, 2.2, 7], { face: 'e', size: [1, 1.5] });
}

// Ropes and sinew across the foot of the stairs; the knife cuts them.
function stairsBarricade(L, game) {
  if (game.flags.has('stairs.cut')) return;
  const col = L.collider([1.5, 0, -4.2], [4.5, 3.2, -3.9], { walkable: false, seeThrough: true });
  const objs = [];
  if (PROP_NAMES.includes('ropeBarricade')) {
    for (const x of [2.25, 3.75]) {
      const o = L.prop('ropeBarricade', x, -4.05, { dynamic: true, collider: 'none', face: 's', scale: 1.05 });
      objs.push(o);
    }
  } else {
    const g = new THREE.Group();
    const rope = getMaterial('rope');
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.4, 5), rope);
      m.rotation.z = Math.PI / 2 + (k % 2 ? 0.35 : -0.35);
      m.position.set(3, 0.3 + k * 0.25, -4.05);
      g.add(m);
    }
    L.group.add(g);
    objs.push(g);
  }
  const it = L.interact({
    pos: [3, 1.2, -3.8],
    radius: 2,
    ignore: [col],
    prompt: (g) => (g.inventory.has('knife') ? 'Cut the ropes' : 'Examine the ropes'),
    onUse: (g) => {
      if (!g.inventory.has('knife')) {
        g.hud.say('Rope, cloth and something like sinew, knotted across the stairs. You need a blade.', 4);
        return;
      }
      g.audio.play('ropeCut', { pos: new THREE.Vector3(3, 1.2, -4) });
      if (g.weapons.current !== 'knife') g.weapons.equip('knife');
      for (const o of objs) o.visible = false;
      col.enabled = false;
      it.alive = false;
      g.setFlag('stairs.cut');
      L.level.markNavDirty();
      g.hud.say('The last knot parts. The stairs climb into the dark.', 3.5);
    },
  });
}

// One book sticks out; pulling it slides the shelf aside (hidden passage).
function secretBookshelf(L, game) {
  const open = game.flags.has('chapel.open');
  const shelf = L.prop('bookshelf', 13.2, -5.5, { face: 'w', dynamic: true, args: { tilted: true } });
  const cols = shelf.userData.colliders;
  const slide = 1.65;
  const move = (dz) => {
    shelf.position.z += dz;
    for (const c of cols) {
      c.min.z += dz;
      c.max.z += dz;
      L.physics.update(c);
    }
  };
  if (open) {
    move(-slide);
    return;
  }
  let t = -1;
  const it = L.interact({
    pos: [13.0, 1.55, -5.5],
    radius: 1.8,
    ignore: cols,
    prompt: 'Pull the protruding book',
    onUse: (g) => {
      it.alive = false;
      g.setFlag('chapel.open');
      g.audio.play('bookshelf', { pos: new THREE.Vector3(13, 1.2, -5.5) });
      g.hud.say('Something clicks inside the wall. The shelf grinds aside.', 3);
      t = 0;
    },
  });
  L.onUpdate((dt) => {
    if (t < 0) return;
    const step = Math.min(dt * 0.9, slide - t);
    if (step <= 0) {
      t = -1;
      L.level.markNavDirty();
      return;
    }
    t += step;
    move(-step);
  });
  // A draft moves the candle flames near it: a hint.
  L.sound('creak', [13, 1.2, -5.5], { interval: [25, 50], radius: 12, gain: 0.5 });
}

// Wallpapered panel in the study that swings into a hidden stash.
function secretPanel(L, game) {
  const open = game.flags.has('stash.open');
  const pivot = new THREE.Group();
  pivot.position.set(11.45, 0, 2.0);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.0), getMaterial('wallpaper'));
  panel.position.set(0, 1.1, 0.5);
  panel.castShadow = panel.receiveShadow = true;
  pivot.add(panel);
  L.group.add(pivot);
  if (open) {
    pivot.rotation.y = -1.5;
    return;
  }
  const col = L.collider([11.35, 0, 2], [11.6, 2.25, 3], { walkable: false });
  let t = -1;
  const it = L.interact({
    pos: [11.3, 1.3, 2.5],
    radius: 1.7,
    ignore: [col],
    prompt: 'The wallpaper here is loose. Push the panel',
    onUse: (g) => {
      it.alive = false;
      col.enabled = false;
      g.setFlag('stash.open');
      g.audio.play('creak', { pos: new THREE.Vector3(11.5, 1.2, 2.5) });
      L.level.markNavDirty();
      t = 0;
    },
  });
  L.onUpdate((dt) => {
    if (t < 0 || t > 1) return;
    t = Math.min(1, t + dt * 1.2);
    pivot.rotation.y = -1.5 * t * t * (3 - 2 * t);
    if (t >= 1) t = 2;
  });
}

// The hidden blood chapel: pews, altar, antler skulls, a sigil that ignites.
function chapel(L, game) {
  const lit = game.flags.has('chapel.lit');
  // Altar at the east end, facing the entrance.
  const altar = L.prop('altar', 20.3, -5.5, { face: 'w' });
  const altarTop = topOf(altar);
  for (const [x, z] of [[15.6, -8.1], [17.4, -8.1], [15.6, -2.9], [17.4, -2.9]]) L.prop('pew', x, z, { face: 'e' });
  L.prop('antlerSkull', 21.39, -5.5, { y: 2.2, face: 'w' });
  L.prop('antlerSkull', 17, -9.89, { y: 2.3, face: 's' });
  L.prop('antlerSkull', 17, -1.11, { y: 2.3, face: 'n' });
  L.prop('candleCluster', 20.6, -7.4, {});
  L.prop('candleCluster', 20.6, -3.6, {});
  L.prop('candleCluster', 14.3, -9.4, {});
  L.prop('candleCluster', 14.3, -1.6, {});
  L.prop('bonesPile', 19.8, -8.9, {});
  L.prop('skull', 20.9, -2.2, {});
  L.decal('bloodDrip', [21.39, 1.9, -6.8], { face: 'w', size: [1.2, 1.8] });
  L.decal('bloodDrip', [21.39, 1.9, -4.2], { face: 'w', size: [1, 1.6] });
  L.decal('bloodSmear', [19.4, 0, -5.5], { face: 'up', size: [1.2, 2.4], rot: Math.PI / 2 });
  L.decal('sigil', [17.8, 0, -5.5], { face: 'up', size: 3.2 });
  // The glowing sigil, dark until you step inside.
  const glowMat = getDecalMaterial('sigilGlow').clone();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), glowMat);
  glow.position.set(17.8, 0.02, -5.5);
  glow.renderOrder = 3;
  L.group.add(glow);
  const base = glowMat.emissiveIntensity || 2.5;
  let ignite = lit ? 1 : 0;
  glowMat.opacity = ignite;
  glowMat.emissiveIntensity = base * ignite;
  // The candle clusters carry their own lights; the sigil adds a red glow once lit.
  const sources = [L.light({ pos: [17.8, 0.4, -5.5], color: 0xff2a10, intensity: 1.1, distance: 5, flicker: 0.2 })];
  for (const s of sources) s.enabled = lit;
  L.trigger({
    min: [14.2, -1, -10],
    max: [21.5, 4, -1],
    once: true,
    onEnter: (g) => {
      if (g.flags.has('chapel.lit')) return;
      g.setFlag('chapel.lit');
      g.audio.play('ignite', { pos: new THREE.Vector3(17.8, 0.5, -5.5) });
      setTimeout(() => g.audio.play('chant', { pos: new THREE.Vector3(20, 1.5, -5.5), gain: 0.3 }), 900);
      for (const s of sources) s.enabled = true;
      ignite = 0.001;
      g.hud.say('The candles light themselves. The sigil on the floor starts to glow.', 4);
    },
  });
  L.onUpdate((dt) => {
    if (ignite > 0 && ignite < 1) {
      ignite = Math.min(1, ignite + dt * 0.6);
      glowMat.opacity = ignite;
      glowMat.emissiveIntensity = base * ignite;
    }
    if (ignite >= 1) glowMat.emissiveIntensity = base * (0.8 + 0.2 * Math.sin(L.level.time * 2.3));
  });
  // The knife on the altar. Taking it brings someone in behind you.
  L.pickup({
    id: 'knife',
    kind: 'item',
    item: 'knife',
    pos: [20.2, altarTop + 0.01, -5.5],
    rotY: Math.PI / 2,
    prompt: 'Take the ritual knife',
    message: 'The handle is warm, as if someone just set it down. (Left click to attack.)',
    onTake: (g) => {
      setTimeout(() => {
        if (g.levels.current?.id !== 'ground') return;
        g.audio.play('creak', { pos: new THREE.Vector3(13, 1.2, -5.5) });
        const e = g.enemies.create(L.level, { type: 'acolyte', id: 'g_ac_chapel', pos: new THREE.Vector3(12.2, 0, -5.5), yaw: Math.PI / 2, idle: 'stand' });
        e?.alert(g.player.position);
      }, 2200);
    },
  });
  return altarTop;
}

function fuseBox(L, game) {
  const powered = game.flags.has('power.on');
  const box = L.prop('fuseBox', -17.4, -8.2, { y: 1.25, face: 'e', dynamic: true, collider: 'none' });
  const slot = box.userData.slot;
  const placeFuse = () => {
    if (!PROP_NAMES.includes('fuse')) return;
    const f = makeProp('fuse');
    if (slot) slot.add(f);
    else {
      f.position.set(-17.3, 1.4, -8.2);
      L.group.add(f);
    }
  };
  const leverOn = () => {
    if (box.userData.lever) box.userData.lever.rotation.x = box.userData.leverOn ?? -0.6;
  };
  if (powered) {
    placeFuse();
    leverOn();
    return;
  }
  const it = L.interact({
    pos: [-17.2, 1.4, -8.2],
    radius: 1.8,
    prompt: (g) => (g.inventory.has('fuse') ? 'Insert the fuse' : 'Fuse box'),
    onUse: (g) => {
      if (!g.inventory.has('fuse')) {
        g.hud.say('A fuse box. One socket is empty, labelled BASEMENT in someone’s neat hand.', 4);
        return;
      }
      it.alive = false;
      g.inventory.removeItem('fuse');
      placeFuse();
      leverOn();
      g.setFlag('power.on');
      g.audio.play('fuse', { pos: new THREE.Vector3(-17.3, 1.4, -8.2) });
      g.hud.say('The lights surge. Somewhere below, a lock thunks open.', 4);
      // Every bulb in the house flares, then settles to a sick flicker.
      for (const s of L.level.lightSources) if (s.kind === 'bulb') {
        s.intensity *= 1.6;
        s.flicker = Math.min(1, s.flicker + 0.3);
      }
    },
  });
}

function notes(L, altarTop = 1.0) {
  const note = (pos, lines, prompt = 'Read the note') => {
    const it = L.interact({
      pos,
      radius: 1.6,
      prompt,
      onUse: (g) => {
        for (const [i, l] of lines.entries()) g.hud.say(l, 4 + i * 0.3);
      },
    });
    if (PROP_NAMES.includes('note')) {
      const n = L.prop('note', pos[0], pos[2], { y: pos[1] - 0.06, rotY: Math.random() * 3, collider: 'none' });
      n.userData.interact = it;
    }
  };
  note([8.3, 0.84, 1.1], ['A ledger. Each year, one name. Each name, crossed out in brown ink.', 'The last page: the tithe keeps the water still and the house whole.'], 'Read the ledger');
  note([-5.2, 0.86, -8.4], ['Twelve chairs. Eleven plates. The twelfth place setting is a bowl of dark water.'], 'Look at the table');
  note([20.1, altarTop + 0.02, -4.9], ['Your sister’s name, written across the altar in blood that is still wet.'], 'Look at the altar');
  note([-10, 0.9, -9.5], ['Scrawled on the pantry shelf: DON’T GO DOWN WHEN THE LIGHTS COME ON.'], 'Read the scrawl');
}

function pickups(L) {
  L.pickup({ id: 'g_bandage_study', kind: 'bandage', pos: [10.6, 0.62, 7.3] });
  L.pickup({ id: 'g_bandage_kitchen', kind: 'bandage', pos: [-12.0, 0.95, -11.5] });
  L.pickup({ id: 'g_ammo_stash', kind: 'ammo', amount: 6, pos: [12.5, 0.02, 1.6] });
  L.pickup({ id: 'g_bandage_stash', kind: 'bandage', pos: [12.8, 0.02, 3.2] });
  L.pickup({ id: 'g_ammo_parlor', kind: 'ammo', amount: 4, pos: [-6.2, 0.02, 7.6] });
  L.pickup({ id: 'g_ammo_hall', kind: 'ammo', amount: 3, pos: [5.4, 0.02, -10.4] });
  // The stash: a cot, a lantern, someone hid here once.
  L.prop('crate', 12.5, 3.6, { rotY: 0.2 });
  L.prop('candle', 12.5, 3.6, { y: 0.5 });
}

function enemies(L, game) {
  const f = (x) => game.flags.has(x);
  // Praying at the head of the dining table.
  L.enemy('acolyte', [-5.5, 0, -10.6], { id: 'g_ac_dining', yaw: 0, idle: 'pray' });
  // Once you have the knife, one walks the parlor.
  const lateSpawns = [
    { flag: 'took:knife', spec: { type: 'acolyte', id: 'g_ac_parlor', pos: new THREE.Vector3(-10, 0, 3), idle: 'wander', wanderRadius: 4 } },
    { flag: 'took:fuse', spec: { type: 'acolyte', id: 'g_ac_ret1', pos: new THREE.Vector3(-8, 0, -2), idle: 'patrol', patrol: [[-15, -2], [10, -2]] } },
    { flag: 'took:fuse', spec: { type: 'acolyte', id: 'g_ac_ret2', pos: new THREE.Vector3(-13, 0, -9), idle: 'wander', wanderRadius: 3, drop: { kind: 'ammo', amount: 4 } } },
    { flag: 'took:fuse', spec: { type: 'hound', id: 'g_hound_ret', pos: new THREE.Vector3(1, 0, 4), idle: 'sniff' } },
  ];
  const spawned = new Set();
  const check = (g) => {
    if (g.flags.has('escape')) return;
    for (const s of lateSpawns) {
      if (spawned.has(s.spec.id) || !g.flags.has(s.flag) || g.flags.has(`killed:${s.spec.id}`)) continue;
      spawned.add(s.spec.id);
      g.enemies.create(L.level, { ...s.spec, pos: s.spec.pos.clone() });
    }
  };
  L.onEnter(check);
  let tick = 0;
  L.onUpdate((dt, t, g) => {
    tick -= dt;
    if (tick > 0) return;
    tick = 3;
    // Only appear out of sight.
    const p = g.player.position;
    for (const s of lateSpawns) if (!spawned.has(s.spec.id) && p.distanceTo(s.spec.pos) < 9) return;
    check(g);
  });
}

// During the escape the flood is coming up from the basement.
function floodHouse(L, game) {
  // Starts knee-deep at the bottom of the basement stairs (y -2.8) and reaches
  // the ground floor about a minute later.
  const water = L.water({ min: [-19.5, -13], max: [21.5, 10], y: -2.4, color: 'murky', opacity: 0.8 });
  let t = 0;
  L.onEnter((g) => {
    t = 0;
    g.audio.play('flood');
  });
  L.onUpdate((dt) => {
    t += dt;
    water.setLevel(Math.min(1.6, -2.4 + t * 0.038));
  });
  L.loopSound('floodRush', [-18.5, -1, -4], { radius: 30, gain: 1 });
}
