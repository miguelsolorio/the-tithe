import * as THREE from 'three';
import { put, note, bake, Kit, candleRing } from './util.js';
import { Y, SPOT } from './layout.js';

// The pump room: raised above the flood on a brick plinth, with a dead sump
// pump and, in the corner, a rusted iron grate over the shaft down to the
// cistern tunnels. The cult ringed it with candles and a warning.

const OPEN_ANGLE = -1.95;

export function pumpRoom(L, game, water, { flood }) {
  const y = Y.P;
  const { x0, z0, x1, z1 } = SPOT.shaft;
  const gx = (x0 + x1) / 2;
  const gz = (z0 + z1) / 2;
  const has = (f) => game.flags.has(f);

  // Shaft lining below the floor, rungs down one side.
  const t = 0.08;
  for (const [a, b] of [
    [[x0, Y.o - 0.3, z0], [x1, y, z0 + t]],
    [[x0, Y.o - 0.3, z1 - t], [x1, y, z1]],
    [[x0, Y.o - 0.3, z0 + t], [x0 + t, y, z1 - t]],
    [[x1 - t, Y.o - 0.3, z0 + t], [x1, y, z1 - t]],
  ]) L.box(a, b, 'brick', { walkable: true });
  put(L, 'ladder', gx, z1 - t, { y: Y.o, face: 'n', args: { height: y - Y.o - 0.1 } });
  L.loopSound('waterFlow', [gx, Y.o + 0.5, gz], { radius: 9, gain: flood ? 0 : 0.7 });

  // The grate. A walkable plate covers the hole until it's open.
  const grate = put(L, 'grate', gx, gz, { y, face: 'n' });
  const bars = grate?.userData.bars;
  const cover = L.collider([x0, y - 0.2, z0], [x1, y + 0.02, z1], { walkable: true, surface: 'metal' });
  const open = flood || has('grate.open');
  if (bars && open) bars.rotation.x = OPEN_ANGLE;
  if (open && !flood) cover.enabled = false;

  let anim = -1;
  L.interact({
    pos: [gx, y + 0.3, gz],
    radius: 2.1,
    prompt: (g) => (g.inventory.has('crowbar') ? 'Pry open the grate' : 'Examine the grate'),
    enabled: (g) => !g.flags.has('grate.open') && !flood,
    onUse: (g) => {
      if (!g.inventory.has('crowbar')) {
        g.hud.say('Rusted shut. You need something to pry it with.', 3.5);
        return;
      }
      g.setFlag('grate.open');
      g.audio.play('grate', { pos: new THREE.Vector3(gx, y + 0.2, gz) });
      g.player.shake = Math.max(g.player.shake, 0.25);
      g.player.lookAt(new THREE.Vector3(gx, y - 0.6, gz), 1.4, 3);
      anim = 0;
      setTimeout(() => g.levels.current === L.level && g.hud.say('The grate screams up off its seat. Cold air breathes out of the shaft, and far below, water moves.', 4), 900);
    },
  });
  L.onUpdate((dt) => {
    if (anim < 0 || !bars) return;
    anim = Math.min(1, anim + dt * 0.8);
    const e = anim < 0.25 ? anim * anim * 2 * 0.25 : 1 - (1 - anim) ** 3;
    bars.rotation.x = OPEN_ANGLE * Math.min(1, e + (anim < 0.25 ? Math.sin(anim * 90) * 0.01 : 0));
    if (anim >= 1) {
      anim = -1;
      cover.enabled = false;
      L.level.markNavDirty();
    }
  });

  if (!flood) {
    L.exit({ pos: [gx, y + 0.3, gz], radius: 2.1, prompt: 'Climb down', to: 'cistern', spawn: 'fromBasement', enabled: (g) => g.flags.has('grate.open') && !anim_(anim) });
    // Stepping into the open shaft drops you straight down to the cistern.
    L.exit({ min: [x0, Y.o - 0.5, z0], max: [x1, Y.o + 2.5, z1], to: 'cistern', spawn: 'fromBasement' });
  } else {
    boilingShaft(L, gx, gz, water);
  }

  // Warning ring: candles on the floor around the grate, the Mother's sigil above it.
  const flames = candleRing(L, gx, y, gz, { r: 1.05, n: 10, litChance: flood ? 0.25 : 0.6, seed: 7 });
  if (flames.length) L.light({ pos: [gx - 0.3, y + 0.45, gz - 0.3], color: 0xe08a2c, intensity: 1.0, distance: 4.5, flicker: 0.5, kind: 'candle' });
  L.decal('sigil', [gx - 0.2, y + 1.5, 15.89], { face: 'n', size: 1.7 });
  L.decal('grime', [gx - 1.2, y, gz - 0.6], { face: 'up', size: 1.6 });
  L.decal('footprints', [-1.2, y, 12.4], { face: 'up', size: [0.6, 2.8], rot: 0.55 });
  note(L, [x0 - 0.12, y + 0.08, gz + 0.15], [
    'A tin tag wired to the grate: NOTHING GOES DOWN. NOTHING COMES UP.',
    'Scratched into the rust underneath, in a child’s capitals: SOMEONE IS CRYING DOWN THERE.',
  ], { prompt: 'Read the tag', rotY: 0.2 });

  // The dead pump and its plumbing.
  put(L, 'pumpMachine', -5.35, 13.0, { face: 'e', args: { ceiling: 3.45 - y } });
  put(L, 'pipe', -2.9, 15.78, { y: y + 1.6, args: { length: 5.6, radius: 0.07 } });
  put(L, 'pipe', -5.78, 12.2, { y: y + 2.2, rotY: Math.PI / 2, args: { length: 3.6, radius: 0.05 } });
  put(L, 'workbench', 0.6, 10.5, { face: 's' });
  put(L, 'lantern', 1.25, 10.45, { y: y + 0.9 });
  L.pickup({ id: 'b_bandage_pump', kind: 'bandage', pos: [-0.1, y + 0.92, 10.55] });
  put(L, 'crateStack', -5.0, 10.85, { rotY: 0.15, args: { count: 4 } });
  put(L, 'barrelRusted', 1.5, 15.5, { rotY: 0.4 });
  put(L, 'barrelRusted', -5.4, 15.35, { args: { open: true } });
  put(L, 'chainHanging', -2.2, 15.1, { y: 3.45, args: { length: 1.7, heavy: true } });
  put(L, 'bulb', -2.4, 12.6, { y: 3.45, args: { drop: 0.5, on: false } });

  const k = new Kit(121);
  // Brass plate on the pump plinth, a coil of rope, rags.
  k.box('brass', 0.3, 0.18, 0.01, -4.92, y + 0.12, 13.0, 0, Math.PI / 2, 0);
  k.torus('rope', 0.18, 0.03, -3.6, y + 0.03, 15.3, Math.PI / 2, 0, 0, 5, 18);
  k.torus('rope', 0.14, 0.03, -3.58, y + 0.08, 15.32, Math.PI / 2, 0, 0.2, 5, 16);
  bake(L, k);

  L.sound('drip', [-2, 3.3, 13], { interval: [3, 7], radius: 10 });
  L.sound('creak', [gx, y, gz], { interval: [20, 45], radius: 12, gain: 0.4 });
}

const anim_ = (a) => a >= 0;

// Flood: the cistern is coming up the shaft.
function boilingShaft(L, gx, gz, water) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xcfe8e2, transparent: true, opacity: 0.45, roughness: 0.2, depthWrite: false });
  const boil = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  boil.renderOrder = 2;
  L.group.add(boil);
  L.onUpdate((dt, t) => {
    boil.position.set(gx, water.y - 0.02, gz);
    const s = 1 + 0.12 * Math.sin(t * 13) + 0.06 * Math.sin(t * 29);
    boil.scale.set(s, 0.18 + 0.08 * Math.sin(t * 9), s);
    mat.opacity = 0.35 + 0.12 * Math.sin(t * 17);
  });
  L.onDispose(() => mat.dispose());
  L.loopSound('floodRush', [gx, 1, gz], { radius: 16, gain: 1 });
}
