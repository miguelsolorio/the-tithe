import * as THREE from 'three';
import { CONFIG, LANDMARKS } from '../config.js';
import { rand } from '../core/rng.js';
import { damp, wrapAngle } from '../core/utils.js';
import { getHeight, pathSamples } from '../world/terrain.js';
import { pointOnScreen } from './entity.js';
import { Hiker, Hermit, LostGirl } from './npcs.js';
import { CrowFlock, Owl, WolfPack, Deer } from './animals.js';
import { Wraith, WeepingWoman, ShadowFigure } from './ghosts.js';
import { Stalker, Wendigo } from './monsters.js';

const _v = new THREE.Vector3();
const TAU = Math.PI * 2;

function weightedPick(list) {
  const total = list.reduce((s, e) => s + e.w, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const e of list) {
    r -= e.w;
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

// Owns every creature, decides when and where encounters happen, schedules
// ambient scares and drives the tension audio (heartbeat, dread, static).
export class Director {
  constructor(game) {
    this.game = game;
    this.entities = [];
    this.spawnTimer = 30;
    this.ambientTimer = 8;
    this.hallucTimer = 10;
    this.wendigoTimer = Infinity;
    this.wellTimer = 3;
    this.girlCount = 0;
    this.steps = null;
    this.heart = 0;
  }

  init() {
    const g = this.game;
    this.hiker = this.add(new Hiker(g));
    this.hermit = this.add(new Hermit(g));
    for (const perch of g.forest.perches) this.add(new CrowFlock(g, perch));
    for (const spot of g.forest.owlSpots) this.add(new Owl(g, spot));
    this.stalker = this.add(new Stalker(g));
  }

  add(e) {
    this.entities.push(e);
    return e;
  }

  active(type) {
    return this.entities.filter((e) => e.alive && e.type === type);
  }

  majorCount() {
    return this.entities.filter((e) => e.alive && e.major).length;
  }

  nearFire(x, z, pad = 6) {
    const C = LANDMARKS.campfire;
    return Math.hypot(x - C.x, z - C.z) < CONFIG.safeRadius + pad;
  }

  // A random point in a ring around the player, clear of trunks and (optionally) out of view.
  findSpawn(minD, maxD, { offscreen = true, behind = false, ahead = false } = {}) {
    const g = this.game;
    const p = g.player.position;
    const yaw = g.camRig.yaw;
    for (let i = 0; i < 40; i++) {
      const a = behind ? yaw + Math.PI + rand(-1.1, 1.1) : ahead ? yaw + rand(-0.45, 0.45) : rand(0, TAU);
      const r = rand(minD, maxD);
      const x = p.x + Math.sin(a) * r;
      const z = p.z + Math.cos(a) * r;
      if (Math.hypot(x, z) > CONFIG.world.radius - 3) continue;
      if (g.grid.overlaps(x, z, 0.7)) continue;
      if (this.nearFire(x, z)) continue;
      const y = getHeight(x, z);
      if (offscreen && pointOnScreen(_v.set(x, y + 1.2, z), 1.6)) continue;
      return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  // A trail point ahead of the player.
  findPathSpawn(minD, maxD) {
    const g = this.game;
    const p = g.player.position;
    const f = g.camRig.flatForward;
    const options = pathSamples.filter((s) => {
      const dx = s.x - p.x;
      const dz = s.z - p.z;
      const d = Math.hypot(dx, dz);
      return d > minD && d < maxD && (dx * f.x + dz * f.z) / d > 0.75 && !this.nearFire(s.x, s.z);
    });
    if (!options.length) return null;
    const s = options[Math.floor(Math.random() * options.length)];
    return new THREE.Vector3(s.x, getHeight(s.x, s.z), s.z);
  }

  spawn(type) {
    const g = this.game;
    let pos = null;
    let e = null;
    switch (type) {
      case 'wolves':
        if ((pos = this.findSpawn(26, 34))) e = new WolfPack(g, pos);
        break;
      case 'deer':
        if ((pos = this.findSpawn(27, 34, { offscreen: false, ahead: true }))) e = new Deer(g, pos);
        break;
      case 'wraith':
        if ((pos = this.findSpawn(20, 30))) e = new Wraith(g, pos);
        break;
      case 'weeper':
        if ((pos = this.findPathSpawn(24, 36) || this.findSpawn(26, 34, { offscreen: false, ahead: true })))
          e = new WeepingWoman(g, pos);
        break;
      case 'girl':
        e = new LostGirl(g);
        this.girlCount++;
        break;
      case 'wendigo':
        if ((pos = this.findSpawn(38, 50))) e = new Wendigo(g, pos);
        break;
      case 'shadow': {
        const p = g.player.position;
        const a = g.camRig.yaw + (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 0.8);
        const r = rand(9, 15);
        const x = p.x + Math.sin(a) * r;
        const z = p.z + Math.cos(a) * r;
        if (!g.grid.overlaps(x, z, 0.5)) e = new ShadowFigure(g, new THREE.Vector3(x, getHeight(x, z), z));
        break;
      }
      case 'stalker':
        this.stalker.activate();
        this.stalker.teleport();
        return this.stalker;
    }
    if (e) this.add(e);
    return e;
  }

  update(dt) {
    const g = this.game;
    const pl = g.player;
    for (const e of this.entities) if (e.alive) e.tick(dt);
    this.entities = this.entities.filter((e) => e.alive);
    this.updateTension(dt);
    if (pl.dead) return;

    const relics = g.objectives.count;
    const t = g.time;
    if (!this.stalker.active && (relics >= 1 || t > 300)) this.stalker.activate();

    if (!pl.inSafe) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = rand(18, 30) * (1 - relics * 0.07);
        this.trySpawn();
      }
    }

    if (relics >= 2 && this.active('wendigo').length === 0) {
      this.wendigoTimer -= dt;
      if (this.wendigoTimer <= 0 && !pl.inSafe) {
        this.wendigoTimer = this.spawn('wendigo') ? rand(90, 150) - relics * 10 : 5;
      }
    }

    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = rand(7, 16);
      this.ambient();
    }

    if (pl.stats.sanity < 40) {
      this.hallucTimer -= dt;
      if (this.hallucTimer <= 0) {
        this.hallucTimer = rand(6, 14) * (0.4 + pl.stats.sanity / 40);
        this.spawn('shadow');
      }
    }

    const well = g.landmarks.wellPos;
    if (Math.hypot(pl.position.x - well.x, pl.position.z - well.z) < 9) {
      this.wellTimer -= dt;
      if (this.wellTimer <= 0) {
        this.wellTimer = rand(3, 6);
        g.audio.whisper(well, 1.4);
      }
    }

    this.updateSteps(dt);
  }

  trySpawn() {
    const t = this.game.time;
    const relics = this.game.objectives.count;
    if (this.majorCount() >= 2) return;
    const table = [
      { type: 'deer', w: 2.4, ok: t > 20 },
      { type: 'wolves', w: 2.2, ok: t > 70 },
      { type: 'wraith', w: 1.8 + relics * 0.4, ok: t > 45 },
      { type: 'weeper', w: 1.4 + relics * 0.35, ok: t > 100 },
      { type: 'girl', w: 1.6, ok: t > 60 && relics < CONFIG.relicCount && this.girlCount < 4 },
    ].filter((e) => e.ok && this.active(e.type).length === 0);
    const choice = weightedPick(table);
    if (choice) this.spawn(choice.type);
  }

  ambient() {
    const g = this.game;
    const p = g.player.position;
    const yaw = g.camRig.yaw;
    const relics = g.objectives.count;
    const sanity = g.player.stats.sanity;
    const behind = (r) =>
      new THREE.Vector3(p.x - Math.sin(yaw) * r + rand(-2, 2), p.y + 0.3, p.z - Math.cos(yaw) * r + rand(-2, 2));
    const around = (r) => {
      const a = rand(0, TAU);
      return new THREE.Vector3(p.x + Math.cos(a) * r, p.y + 2, p.z + Math.sin(a) * r);
    };
    const events = [
      { w: 3, f: () => g.audio.twig(behind(rand(5, 10))) },
      { w: 2, f: () => g.audio.creak(around(rand(10, 25))) },
      { w: 1.5, f: () => g.audio.gust() },
      { w: this.active('wolves').length ? 0 : 1, f: () => g.audio.howl(around(rand(70, 110)), 0.6) },
      { w: 1, f: () => g.audio.caw(around(rand(30, 60)), 2) },
      { w: relics >= 1 ? 0.7 : 0, f: () => g.audio.scream(around(rand(60, 100)), 0.5) },
      { w: sanity < 65 ? 2 : 0, f: () => g.audio.whisper(around(rand(2, 5)), 0.9) },
      { w: relics >= 1 ? 1 : 0, f: () => this.startSteps() },
      { w: 0.5, f: () => g.audio.boom(0.35) },
    ];
    weightedPick(events)?.f();
  }

  // Footsteps that stop the moment you turn around.
  startSteps() {
    if (this.steps) return;
    this.steps = { n: 0, timer: 0.3, yaw0: this.game.camRig.yaw };
  }

  updateSteps(dt) {
    const s = this.steps;
    if (!s) return;
    const g = this.game;
    if (Math.abs(wrapAngle(g.camRig.yaw - s.yaw0)) > 1.4) {
      this.steps = null;
      return;
    }
    s.timer -= dt;
    if (s.timer <= 0) {
      s.timer = 0.55;
      const p = g.player.position;
      const yaw = g.camRig.yaw;
      g.audio.footstepAt(new THREE.Vector3(p.x - Math.sin(yaw) * 4, p.y + 0.2, p.z - Math.cos(yaw) * 4));
      if (++s.n >= 6) this.steps = null;
    }
  }

  updateTension(dt) {
    const g = this.game;
    const pl = g.player;
    let heart = 0;
    let dread = 0;
    for (const w of this.active('wendigo')) {
      const d = w.distToPlayer();
      if (w.state === 'chase' || w.state === 'recoil') {
        heart = Math.max(heart, 1 - d / 40);
        dread = Math.max(dread, 1 - d / 50);
      } else dread = Math.max(dread, 0.5 * (1 - d / 60));
    }
    for (const pack of this.active('wolves')) {
      const n = pack.nearest();
      heart = Math.max(heart, 0.6 * (1 - n / 20));
      dread = Math.max(dread, 0.5 * (1 - n / 30));
    }
    for (const w of this.active('wraith')) dread = Math.max(dread, 0.6 * (1 - w.distToPlayer() / 20));
    dread = Math.max(dread, this.stalker.staticLevel);
    heart = Math.max(heart, ((40 - pl.stats.sanity) / 40) * 0.7, pl.dead ? 0 : 0);
    heart = Math.max(0, Math.min(1, heart));
    dread = Math.max(0, Math.min(1, dread));

    this.heart += (heart - this.heart) * damp(2, dt);
    g.audio.heart.intensity = this.heart;
    g.audio.dread += (dread - g.audio.dread) * damp(1.5, dt);
    g.audio.staticLevel = this.stalker.staticLevel;
    g.audio.breathing = pl.exhausted;
    g.fx.staticLevel = this.stalker.staticLevel * 0.6;
  }

  onRelic(n) {
    const g = this.game;
    g.audio.boom(0.6);
    this.spawnTimer = Math.min(this.spawnTimer, 10);
    const later = (fn, ms) => setTimeout(fn, ms);
    if (n === 1) {
      this.stalker.activate();
      later(() => g.hud.notice('The trees seem to lean closer.', 4), 9000);
    } else if (n === 2) {
      this.wendigoTimer = 25;
      later(() => {
        const p = g.player.position;
        g.audio.shriek(new THREE.Vector3(p.x + 80, p.y + 5, p.z - 60), 0.8);
        g.hud.notice('A shriek, far off. Something has started hunting.', 4, true);
      }, 9000);
    } else if (n === 3) {
      later(() => g.hud.notice('He is closer now. Always closer.', 4, true), 9000);
    } else if (n === 4) {
      later(() => g.hud.notice('The whispers know your name.', 4), 9000);
    }
  }
}
