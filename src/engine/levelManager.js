import * as THREE from 'three';
import { Level } from './level.js';
import { LevelBuilder } from '../world/builder.js';

// Builds, caches and switches levels; applies each level's environment;
// saves a checkpoint (flags, inventory, health) every time a level is entered.

const SAVE_KEY = 'the-tithe-checkpoint-v1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// setTimeout rather than rAF so transitions also finish in a hidden tab.
const nextFrame = () => new Promise((r) => setTimeout(r, 20));

export class LevelManager {
  constructor(game, defs) {
    this.game = game;
    this.defs = defs;
    this.byId = Object.fromEntries(defs.map((d) => [d.id, d]));
    this.cache = new Map();
    this.current = null;
    this.transitioning = false;
    this.checkpoint = null;
    this.visited = new Set();
  }

  resolve(idOrIndex) {
    if (typeof idOrIndex === 'number') return this.defs[idOrIndex - 1]?.id;
    if (this.byId[idOrIndex]) return idOrIndex;
    const s = String(idOrIndex).toLowerCase();
    return this.defs.find((d) => d.name.toLowerCase().includes(s) || d.id.toLowerCase().startsWith(s))?.id;
  }

  build(id) {
    const def = this.byId[id];
    const level = new Level(this.game, def);
    const L = new LevelBuilder(this.game, level);
    const t0 = performance.now();
    def.build(L, this.game);
    L.finish();
    level.builder = L;
    this.game.enemies.spawnFromSpecs(level);
    if (this.game.debug) console.info(`[levels] built ${id} in ${(performance.now() - t0).toFixed(0)} ms (${level.physics.colliders.length} colliders)`);
    return level;
  }

  // Levels can have variants (e.g. the field at dusk vs dawn, the house during
  // the flood); each variant is cached separately.
  cacheKey(id) {
    const def = this.byId[id];
    return def.variant ? `${id}:${def.variant(this.game)}` : id;
  }

  get(id) {
    const key = this.cacheKey(id);
    let level = this.cache.get(key);
    if (!level) {
      // Drop stale variants of the same level.
      for (const [k, l] of this.cache) {
        if (k.split(':')[0] === id && l !== this.current) {
          l.dispose();
          this.cache.delete(k);
        }
      }
      level = this.build(id);
      this.cache.set(key, level);
    }
    return level;
  }

  builderFor(level) {
    return level.builder;
  }

  deactivate() {
    const level = this.current;
    if (!level) return;
    this.game.sister?.remove();
    for (const h of level.exitHooks) h(this.game);
    for (const spec of level.loopSpecs) {
      spec.handle?.stop(0.3);
      spec.handle = null;
    }
    this.game.scene.remove(level.group);
    this.game.lights.clear();
    level.active = false;
    this.current = null;
  }

  activate(level, spawnName) {
    const g = this.game;
    this.deactivate();
    this.current = level;
    level.active = true;
    g.scene.add(level.group);
    for (const s of level.lightSources) g.lights.add(s);
    for (const e of level.enemies) for (const s of e.sources) g.lights.add(s);
    this.applyEnv(level.env);
    const sp = level.spawns[spawnName] || level.spawns.start || Object.values(level.spawns)[0];
    if (!sp) console.warn(`[levels] ${level.id} has no spawn "${spawnName}"`);
    g.player.teleport(sp ? sp.pos : new THREE.Vector3(), sp ? sp.yaw : 0);
    g.particles.clear();
    g.decals.clear();
    g.hud.boss(null);
    for (const h of level.enterHooks) h(g, spawnName);
  }

  applyEnv(env) {
    const g = this.game;
    const fog = env.fog || { color: 0x000000, density: 0.06 };
    g.scene.fog.color.set(fog.color);
    g.scene.fog.density = fog.density;
    g.scene.background.set(env.background ?? fog.color);
    const a = env.ambient || { sky: 0x302830, ground: 0x100808, intensity: 0.4 };
    g.hemi.color.set(a.sky);
    g.hemi.groundColor.set(a.ground);
    g.hemi.intensity = a.intensity;
    const sun = env.sun;
    g.sun.intensity = sun ? sun.intensity : 0;
    if (sun) {
      g.sun.color.set(sun.color);
      g.sun.position.set(...(sun.dir || [30, 20, -40]));
    }
    g.renderer.toneMappingExposure = env.exposure ?? 1.0;
    const grade = env.grade || { color: 0xffffff, amount: 0 };
    g.fx.setGrade(grade.color, grade.amount);
    g.weapons.hemi.color.set(a.sky);
    g.weapons.hemi.intensity = 0.5 + a.intensity * 0.6;
    if (env.music !== undefined) g.audio.setZone(env.music);
  }

  // Fade out, switch level, fade in. Saves a checkpoint on arrival.
  async goTo(idOrIndex, spawn = 'start', { checkpoint = true, fadeOut = 0.45 } = {}) {
    const id = this.resolve(idOrIndex);
    if (!id) {
      console.warn(`[levels] unknown level ${idOrIndex}`);
      return;
    }
    if (this.transitioning) return;
    const g = this.game;
    this.transitioning = true;
    g.player.frozen = true;
    if (this.current) {
      g.fx.fadeTo(1, 1 / fadeOut);
      await wait(fadeOut * 1000 + 50);
    } else g.fx.fade = 1;
    const showLoading = !this.cache.has(this.cacheKey(id));
    if (showLoading) {
      document.querySelector('#loading').classList.remove('hidden');
      await nextFrame();
      await nextFrame();
    }
    let level;
    try {
      level = this.get(id);
    } catch (e) {
      console.error(`[levels] failed to build ${id}`, e);
      document.querySelector('#loading').classList.add('hidden');
      this.transitioning = false;
      g.player.frozen = false;
      g.fx.fadeTo(0, 2);
      return;
    }
    document.querySelector('#loading').classList.add('hidden');
    this.activate(level, spawn);
    // Compile shaders for the new level while the screen is black.
    g.renderer.compile(g.scene, g.camera);
    if (checkpoint) this.saveCheckpoint(id, spawn);
    const first = !this.visited.has(id);
    this.visited.add(id);
    await wait(120);
    g.fx.fadeTo(0, 1.4);
    g.player.frozen = false;
    this.transitioning = false;
    if (first && level.def.title !== false) g.hud.notice(level.def.name, level.def.subtitle || '', 4);
    g.events.emit('levelEnter', id, spawn);
  }

  saveCheckpoint(id, spawn) {
    const g = this.game;
    this.checkpoint = {
      level: id,
      spawn,
      flags: [...g.flags],
      inventory: g.inventory.snapshot(),
      health: Math.max(g.player.health, 50),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.checkpoint, visited: [...this.visited] }));
    } catch {
      // Private mode etc.: checkpoints still work for this session.
    }
  }

  static loadSaved() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }

  static clearSaved() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
  }

  disposeAll() {
    this.deactivate();
    for (const level of this.cache.values()) level.dispose();
    this.cache.clear();
  }

  async restartFromCheckpoint(cp = this.checkpoint) {
    const g = this.game;
    if (!cp) return;
    this.disposeAll();
    g.flags = new Set(cp.flags);
    g.inventory.restore(cp.inventory);
    g.player.reset();
    g.player.health = cp.health ?? 100;
    g.hud.setHealth(g.player.health / 100);
    g.weapons.reset();
    const w = g.inventory.weapons;
    const pick = ['shotgun', 'revolver', 'knife'].find((n) => w.includes(n) && (n === 'knife' || g.inventory.mag[n] + g.inventory.ammo[n] > 0)) || w[0];
    if (pick) g.weapons.equip(pick, true);
    else g.weapons.updateHud();
    this.checkpoint = cp;
    await this.goTo(cp.level, cp.spawn, { checkpoint: false, fadeOut: 0.01 });
  }

  update(dt, t) {
    const level = this.current;
    if (!level) return;
    level.update(dt, t);
    // Positional loops start/stop by distance.
    const p = this.game.player.position;
    for (const spec of level.loopSpecs) {
      const d = p.distanceTo(spec.pos);
      if (!spec.handle && d < spec.radius) spec.handle = this.game.audio.loop(spec.name, { pos: spec.pos, gain: spec.gain });
      else if (spec.handle && d > spec.radius + 3) {
        spec.handle.stop(0.8);
        spec.handle = null;
      }
    }
  }
}
