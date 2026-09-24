import * as THREE from 'three';
import { CONFIG, LANDMARKS } from '../config.js';
import { RNG } from '../core/rng.js';
import { getHeight, pathSamples } from '../world/terrain.js';
import { softSprite } from '../world/textures.js';

const wardMat = new THREE.MeshLambertMaterial({ color: 0xd8d2bc, emissive: 0x5dff8e, emissiveIntensity: 1.4, flatShading: true });
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 1.1) });
const battMat = new THREE.MeshLambertMaterial({ color: 0x1b1d1f });
const battTop = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.75, 0.3) });
const glowTex = softSprite('rgba(255,255,255,1)', 64);

function makeWard() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), wardMat);
  core.scale.set(0.8, 1.4, 0.8);
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 5, 24), ringMat);
  g.add(ring);
  const ring2 = ring.clone();
  ring2.rotation.y = Math.PI / 2;
  g.add(ring2);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color: 0x7dffa8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  glow.scale.setScalar(1.2);
  g.add(glow);
  g.userData = { core, ring, ring2 };
  return g;
}

function makeBattery() {
  const g = new THREE.Group();
  for (const dx of [-0.045, 0.045]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.13, 8), battMat);
    b.rotation.z = Math.PI / 2;
    b.position.set(0, 0.035, dx);
    g.add(b);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 8), battTop);
    tip.rotation.z = Math.PI / 2;
    tip.position.set(0.075, 0.035, dx);
    g.add(tip);
  }
  const glint = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  glint.scale.setScalar(0.5);
  glint.position.y = 0.08;
  g.add(glint);
  g.userData.glint = glint;
  return g;
}

export class Objectives {
  constructor(game) {
    this.game = game;
    this.total = CONFIG.relicCount;
    this.count = 0;
    this.relics = [];
    this.batteries = [];
    this.won = false;

    for (const spot of game.landmarks.relicSpots) {
      const mesh = makeWard();
      mesh.position.copy(spot.pos);
      game.scene.add(mesh);
      const light = game.lights.add({ pos: spot.pos.clone(), color: 0x8dffb0, intensity: 3, distance: 7, flicker: 0.15 });
      const relic = { ...spot, mesh, light, taken: false, phase: Math.random() * 6 };
      relic.item = game.interaction.add({
        pos: spot.pos,
        radius: 2.2,
        prompt: 'Take the ward',
        action: () => this.collect(relic),
      });
      this.relics.push(relic);
    }

    // Batteries: a few at landmarks plus some scattered along the trails.
    const spots = [...game.landmarks.batterySpots];
    const rng = new RNG(CONFIG.seed + 99);
    const trail = pathSamples.filter((p) =>
      Object.values(LANDMARKS).every((l) => Math.hypot(p.x - l.x, p.z - l.z) > l.r + 8)
    );
    for (let i = 0; i < 9 && trail.length; i++) {
      const p = trail[Math.floor(((i + rng.float() * 0.6) / 9) * trail.length) % trail.length];
      const side = rng.chance(0.5) ? 1 : -1;
      const x = p.x - p.dz * 1.5 * side;
      const z = p.z + p.dx * 1.5 * side;
      spots.push(new THREE.Vector3(x, getHeight(x, z) + 0.02, z));
    }
    for (const pos of spots) {
      const mesh = makeBattery();
      mesh.position.copy(pos);
      mesh.rotation.y = rng.range(0, Math.PI * 2);
      game.scene.add(mesh);
      const b = { mesh, pos, taken: false };
      b.item = game.interaction.add({
        pos,
        radius: 1.8,
        prompt: 'Take batteries',
        action: () => this.takeBattery(b),
      });
      this.batteries.push(b);
    }
  }

  takeBattery(b) {
    const g = this.game;
    b.taken = true;
    g.scene.remove(b.mesh);
    g.interaction.remove(b.item);
    g.player.addBattery(CONFIG.stats.batteryPickup);
    g.audio.battery();
    g.hud.notice('Batteries. The light steadies.', 2.2);
  }

  collect(relic) {
    const g = this.game;
    if (relic.taken) return;
    relic.taken = true;
    g.scene.remove(relic.mesh);
    g.lights.remove(relic.light);
    g.interaction.remove(relic.item);
    this.count++;
    g.audio.pickup();
    g.hud.note(relic.note.title, relic.note.text);
    g.hud.setRelics(this.count);
    g.landmarks.gate.setRelics(this.count);
    g.atmosphere.setRelicLevel(this.count);
    g.director.onRelic(this.count);
    if (this.count >= this.total) {
      g.landmarks.gate.open();
      g.audio.gateCreak(g.landmarks.gate.pos);
      setTimeout(() => g.hud.notice('Far to the north, iron groans open.', 5), 2500);
    }
  }

  nearestRemaining(from) {
    let best = null;
    let bd = Infinity;
    for (const r of this.relics) {
      if (r.taken) continue;
      const d = Math.hypot(r.pos.x - from.x, r.pos.z - from.z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  update(dt, t) {
    for (const r of this.relics) {
      if (r.taken) continue;
      const u = r.mesh.userData;
      r.mesh.position.y = r.pos.y + Math.sin(t * 1.6 + r.phase) * 0.06;
      u.core.rotation.y = t * 0.8;
      u.ring.rotation.x = t * 0.9;
      u.ring2.rotation.z = t * 0.7;
    }
    for (const b of this.batteries) {
      if (b.taken) continue;
      b.mesh.userData.glint.material.opacity = 0.18 + 0.18 * Math.max(0, Math.sin(t * 2.2 + b.pos.x));
    }
    const p = this.game.player.position;
    if (!this.won && this.game.landmarks.gate.isOpen && p.z < LANDMARKS.gate.z - 6 && Math.abs(p.x) < 4) {
      this.won = true;
      this.game.onWin();
    }
  }
}
