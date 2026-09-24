import * as THREE from 'three';
import { Mother } from '../entities/mother.js';
import { buildArena, TUNNEL } from './heart/arena.js';
import { setupFight } from './heart/fight.js';

// Level 7: the heart. Through the torn sphincter a short fleshy tunnel opens
// into a round cavern of breathing flesh under giant ribs. The Mother Below
// waits under the black pool in the middle; your sister is caged inside her
// ribs. Kill her, cut your sister free, then run as the pool floods the heart.

export default {
  id: 'heart',
  name: 'The heart',
  subtitle: 'The Mother Below',
  zone: 'flesh',
  variant: (game) => (game.flags.has('escape') ? 'escape' : game.flags.has('killed:mother') ? 'dead' : 'fight'),
  prepare(game) {
    const inv = game.inventory;
    for (const it of ['phone', 'knife', 'revolver', 'crowbar', 'shotgun']) inv.addItem(it, { silent: true });
    inv.addAmmo('revolver', 18);
    inv.addAmmo('shotgun', 10);
    for (const f of ['stairs.cut', 'power.on', 'took:fuse', 'grate.open', 'took:valve', 'sluice.open', 'sphincter.open']) game.setFlag(f);
  },
  build(L, game) {
    game.enemies.register('mother', Mother);
    const escape = game.flags.has('escape');
    L.env({
      fog: { color: 0x120405, density: 0.03 },
      ambient: { sky: 0x6a2224, ground: 0x1a0506, intensity: 0.62 },
      grade: { color: 0xff3030, amount: 0.5 },
      exposure: 1.12,
      music: escape ? 'escape' : 'viscera',
    });

    const A = buildArena(L, game);
    dress(L);
    supplies(L);

    L.spawn('fromCaves', [0, 0, TUNNEL.z1 - 5.2], 0);
    L.spawn('start', [0, 0, TUNNEL.z1 - 5.2], 0);
    // Always open: back to the caves (for supplies, or out with your sister).
    L.exit({ min: [-1.9, -0.5, TUNNEL.z1 - 2.2], max: [1.9, 3.5, TUNNEL.z1 + 0.5], to: 'caves', spawn: 'fromHeart' });

    setupFight(L, game, A);
  },
};

// Veins, tendrils, pods and wall sacs; the flesh lights breathe with the heartbeat.
function dress(L) {
  const TAU = Math.PI * 2;
  const onWall = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
  // Veins crawling over the walls.
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * TAU + 0.2;
    const a1 = a0 + 0.35;
    const y0 = 1.5 + (i % 3) * 1.6;
    L.prop('vein', 0, 0, { y: 0, rotY: 0, args: { from: onWall(a0, 15.4, y0), to: onWall(a1, 15.4, y0 + 2.2 - (i % 2) * 3), sag: 0.6, radius: 0.1 + (i % 3) * 0.03, seed: 60 + i } });
  }
  // Veins across the tunnel roof.
  for (let z = 17.5; z < TUNNEL.z1 - 2; z += 2.6) L.prop('vein', 0, 0, { y: 0, args: { from: [-1.7, 1.2, z], to: [1.7, 1.5, z + 0.8], sag: -1.6, radius: 0.08, seed: Math.round(z) } });
  // Tendrils hanging from the ribs.
  for (const [x, z, y, len] of [[-6, -3, 11.5, 3.2], [5.5, -3, 11.4, 2.4], [-3, 2.6, 11.7, 3.6], [8, 2.6, 10.5, 2.2], [-8.5, 7.9, 9.2, 2.8], [4, 7.9, 10.2, 3], [0.5, -8.3, 10.4, 2.6], [-9.5, -8.3, 8, 2]]) {
    L.prop('tendril', x, z, { y, collider: 'none', args: { length: len, extra: 3 } });
  }
  // Glowing pods near the walls (their lights pulse).
  for (const [a, r] of [[0.95, 14.2], [-0.95, 14.2], [1.62, 14.1], [-1.62, 14.1], [0.33, 14.6]]) {
    L.prop('pod', Math.sin(a) * r, Math.cos(a) * r, { rotY: a + Math.PI, args: { height: 1.3 } });
  }
  // Sacs on the tunnel walls.
  for (const [x, z] of [[1.55, 19.5], [-1.55, 23.5]]) L.prop('sac', x, z, { y: 1.6, rotY: x > 0 ? -Math.PI / 2 : Math.PI / 2, collider: 'none', args: { mount: 'wall' } });
  // A dim heart-glow high in the dome and one at the tunnel mouth.
  L.light({ pos: [0, 11, 2], color: 0xff2a20, intensity: 1.2, distance: 16, flicker: 0.2, kind: 'flesh' });
  L.light({ pos: [0, 2.8, 15.5], color: 0xff3a2a, intensity: 1.2, distance: 7, flicker: 0.2, kind: 'flesh' });
  // Blood and filth.
  for (const [x, z, s] of [[0.4, 20.5, 1.4], [-0.6, 17, 1.8], [3.5, 8.5, 2.2], [-5, 9, 1.6], [7.8, 3, 2]]) L.decal('bloodSmear', [x, 0, z], { face: 'up', size: [s * 0.6, s * 1.4] });
  for (const [x, z, s] of [[-7.2, 5.5, 2.4], [6.2, -2.2, 2], [-9, -1.5, 1.8]]) L.decal('bloodSplat', [x, 0, z], { face: 'up', size: s });
  // Breathing walls, drips, wet sounds.
  L.loopSound('fleshBreath', new THREE.Vector3(0, 4, 0), { radius: 45, gain: 0.7 });
  L.sound('squelch', [9, 2, -4], { interval: [5, 12], radius: 30 });
  L.sound('squelch', [-10, 2, 5], { interval: [6, 14], radius: 30 });
  L.sound('drip', [0, 6, 0], { interval: [2, 5], radius: 25 });
  L.sound('heart', [0, 0, 0], { interval: [1.8, 2.4], radius: 40, gain: 0.5 });
}

// Supply caches around the ring (shells 6, rounds 12, 3 bandages).
function supplies(L) {
  const at = (a, r) => [Math.sin(a) * r, 0.02, Math.cos(a) * r];
  L.pickup({ id: 'h_ammo_mouth', kind: 'ammo', amount: 6, pos: at(-0.2, 14.4) });
  L.pickup({ id: 'h_shells_west', kind: 'shells', amount: 3, pos: at(-1.45, 14.2) });
  L.pickup({ id: 'h_shells_east', kind: 'shells', amount: 3, pos: at(1.12, 12.6) });
  L.pickup({ id: 'h_ammo_east', kind: 'ammo', amount: 6, pos: at(1.75, 13.6) });
  L.pickup({ id: 'h_bandage_1', kind: 'bandage', pos: at(0.45, 14.5) });
  L.pickup({ id: 'h_bandage_2', kind: 'bandage', pos: at(-0.8, 12.9) });
  L.pickup({ id: 'h_bandage_3', kind: 'bandage', pos: at(-1.75, 13.4) });
}
