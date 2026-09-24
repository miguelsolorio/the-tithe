import * as THREE from 'three';
import { PROP_NAMES } from '../../world/props/index.js';
import { BED } from './layout.js';

// Who lives down here, what was left behind, and the flood during the escape.

function note(L, pos, lines, prompt = 'Read the note') {
  const it = L.interact({
    pos,
    radius: 1.6,
    prompt,
    onUse: (g) => {
      lines.forEach((l, i) => setTimeout(() => g.levels.current === L.level && g.hud.say(l, 4.5), i * 4200));
    },
  });
  if (PROP_NAMES.includes('note')) L.prop('note', pos[0], pos[2], { y: pos[1] - 0.06, rotY: 0.7, collider: 'none' });
  return it;
}

export function buildStory(L, fx, rng, game, { flood, rooms }) {
  const bench = rooms.benchTop ?? 0.9;
  const crate = rooms.drainTop ?? 0.6;
  // ---- Notes: the tithe and the Mother Below.
  note(L, [46.4, bench + 0.06, 17.22], [
    'A pump log. The last entries are in a shaking hand.',
    'By order of the Deacon the pumps stay off. Moving water wakes Her. The cisterns are to be kept still.',
    'One is given at the pool each year, the tithe, so the Mother Below sleeps and the house stands. I held the lamp. God forgive me, I held the lamp.',
  ], 'Read the pump log');
  note(L, [48.9, crate + 0.06, 38.35], [
    'A page torn from a notebook, the ink run with damp.',
    'Followed the singing down the ladder. They carried the valve wheel off to the baptism pool so no one can open the sluice. Whatever is past it, they are afraid of it.',
    'The dogs found me. If you are reading this, do not let them hear you.',
  ]);

  // ---- Pickups.
  L.pickup({ id: 'c_ammo_pump', kind: 'ammo', amount: 5, pos: [45.3, bench + 0.005, 17.3] });
  L.pickup({ id: 'c_bandage_pump', kind: 'bandage', pos: [46.9, bench + 0.005, 17.35] });
  L.pickup({ id: 'c_ammo_drain', kind: 'ammo', amount: 4, pos: [48.45, crate + 0.005, 38.4] });
  L.pickup({ id: 'c_ammo_collapse', kind: 'ammo', amount: 5, pos: [43.35, 0.02, 14.35] });
  L.pickup({ id: 'c_bandage_sluice', kind: 'bandage', pos: [22.75, 0.02, 43.2] });

  // ---- Ambient life.
  L.sound('boom', [36, 6, 44], { interval: [45, 90], radius: 90, gain: 0.22 });
  L.sound('creak', [30, 4, 20], { interval: [25, 55], radius: 60, gain: 0.3 });
  L.sound('chains', [50, 4, 24], { interval: [25, 50], radius: 20, gain: 0.3 });
  L.sound('gurgle', [24, 0, 33], { interval: [18, 40], radius: 12, gain: 0.5 });

  if (flood) return floodVariant(L, fx, rng, game);

  // ---- Enemies.
  const lamprey = (id, x, y, z, yaw, wake = 5) => L.enemy('lamprey', [x, y, z], { id, yaw, idle: 'dormant', wakeRadius: wake });
  lamprey('c_lamprey1', 38.4, BED, 33.1, Math.PI, 5);
  lamprey('c_lamprey2', 37.9, -1.5, 12.7, Math.PI, 4.5);
  lamprey('c_lamprey3', 50.6, BED, 22.3, -Math.PI / 2, 5);
  lamprey('c_lamprey4', 23.2, BED, 24.0, Math.PI / 2, 5);
  // The pack, feeding in the drain alcove behind the junction.
  L.enemy('hound', [49.3, 0, 39.7], { id: 'c_hound1', yaw: 0.6, idle: 'sniff' });
  L.enemy('hound', [50.8, 0, 38.7], { id: 'c_hound2', yaw: -2.4, idle: 'sniff' });
  L.sound('snarl', [50, 0.6, 39.2], { interval: [9, 18], radius: 16, gain: 0.5 });

  L.onEnter((g, spawn) => {
    if ((spawn === 'fromBasement' || spawn === 'start') && !g.flags.has('cistern.arrived')) {
      g.setFlag('cistern.arrived');
      setTimeout(() => g.levels.current === L.level && g.hud.say('The ladder ends in cold, still air. Somewhere ahead, water moves when nothing moves it.', 4.5), 1800);
    }
  });
}

// The escape: the whole cistern floods. A short run from the ossuary to the ladder.
function floodVariant(L, fx, rng, game) {
  const water = L.flood({ min: [11.9, 0.5], max: [56.1, 52.1], from: -0.45, to: 2.3, seconds: 110, color: 0x1f3b39 });
  water.flow = [0.05, 0.09];
  L.loopSound('floodRush', [24, 0.5, 38], { radius: 40, gain: 1 });
  L.loopSound('floodRush', [24, 0.5, 46], { radius: 22, gain: 0.8 });
  L.loopSound('floodRush', [45, 0.5, 33], { radius: 30, gain: 0.7 });
  L.enemy('lamprey', [30.8, BED, 33.0], { id: 'c_lamprey_flood', yaw: -Math.PI / 2, idle: 'dormant', wakeRadius: 7 });
  const lanterns = L.level.lightSources.filter((s) => s.kind === 'lantern');
  for (const s of lanterns) {
    s.flicker = Math.max(s.flicker, 0.4);
    s._cut = 0;
  }
  let quake = 4;
  L.onUpdate((dt, t, g) => {
    // Lanterns gutter and cut out as the water rattles the old iron.
    for (const s of lanterns) {
      if (s._off > 0) {
        s._off -= dt;
        if (s._off <= 0) s.enabled = true;
      } else if (Math.random() < dt * 0.35) {
        s._off = 0.08 + Math.random() * 0.45;
        s.enabled = false;
      }
    }
    quake -= dt;
    if (quake <= 0) {
      quake = 6 + Math.random() * 7;
      const p = g.player.position;
      g.audio.play(Math.random() < 0.5 ? 'collapse' : 'boom', { pos: new THREE.Vector3(p.x + 8, 5, p.z - 6), gain: 0.5 });
      g.player.shake = Math.max(g.player.shake, 0.4);
      for (let i = 0; i < 6; i++) g.particles.impact(new THREE.Vector3(p.x + (Math.random() - 0.5) * 4, p.y + 2.4, p.z + (Math.random() - 0.5) * 4), { x: 0, y: -1, z: 0 }, 'dust', 4);
    }
  });
  L.onEnter((g) => {
    setTimeout(() => g.levels.current === L.level && g.hud.say('Water is pouring in through the bones. Get her to the ladder, back past the sluice.', 4.5), 1500);
  });
}
