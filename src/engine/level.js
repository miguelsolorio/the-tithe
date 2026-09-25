import * as THREE from 'three';
import { Physics } from './physics.js';

// Runtime container for one built level: geometry root, collision world, nav
// grid, lights, interactables, triggers, water, spawns, enemies and hooks.
// Filled in by LevelBuilder (src/world/builder.js); activated/deactivated by
// the LevelManager.

export class Level {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.group = new THREE.Group();
    this.group.name = `level:${def.id}`;
    this.physics = new Physics();
    this.nav = null;
    this.navDirty = false;
    this.navTimer = 0;
    this.lightSources = [];
    this.interactables = [];
    this.triggers = [];
    this.waters = [];
    this.spawns = {};
    this.enemies = [];
    this.enemySpecs = [];
    this.updaters = [];
    this.emitters = [];
    this.loopSpecs = [];
    this.loops = [];
    this.enterHooks = [];
    this.exitHooks = [];
    this.disposables = [];
    // Interactive props (src/systems/props.js): placed entries, moving bodies, loose debris.
    this.props = [];
    this.propBodies = [];
    this.debris = [];
    this.env = {};
    this.active = false;
    this.time = 0;
  }

  // Water depth at a point for something whose feet are at feetY (0 if dry).
  waterAt(x, z, feetY) {
    let best = null;
    for (const w of this.waters) {
      if (!w.contains(x, z)) continue;
      if (!best || w.y > best.y) best = w;
    }
    if (!best) return { depth: 0, surface: -Infinity, water: null };
    return { depth: Math.max(0, best.y - feetY), surface: best.y, water: best };
  }

  markNavDirty() {
    this.navDirty = true;
    this.navTimer = 0.25;
  }

  update(dt, t) {
    this.time += dt;
    const game = this.game;
    const p = game.player.position;
    // Triggers
    for (const tr of this.triggers) {
      if (tr.done || (tr.enabled && !tr.enabled())) continue;
      const inside = tr.contains(p);
      if (inside && !tr.inside) {
        tr.inside = true;
        tr.onEnter?.(game, tr);
        if (tr.once) tr.done = true;
      } else if (!inside && tr.inside) {
        tr.inside = false;
        tr.onExit?.(game, tr);
      }
      if (inside && tr.onStay) tr.onStay(game, dt, tr);
    }
    // Ambient one-shot emitters
    for (const e of this.emitters) {
      e.timer -= dt;
      if (e.timer > 0) continue;
      e.timer = e.interval[0] + Math.random() * (e.interval[1] - e.interval[0]);
      if (e.radius && p.distanceTo(e.pos) > e.radius) continue;
      game.audio.play(e.name, { pos: e.pos, gain: e.gain });
    }
    for (const w of this.waters) w.update(dt, t);
    for (const u of this.updaters) u(dt, t, game);
    if (this.navDirty) {
      this.navTimer -= dt;
      if (this.navTimer <= 0 && this.nav) {
        this.nav.build();
        this.navDirty = false;
      }
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
      }
    });
    for (const w of this.waters) w.dispose();
    for (const d of this.disposables) d();
    for (const e of this.enemies) e.dispose?.();
  }
}

// Axis-aligned trigger volume or sphere.
export class Trigger {
  constructor(spec) {
    Object.assign(this, spec);
    this.inside = false;
    this.done = false;
    if (spec.min) {
      this.box = new THREE.Box3(new THREE.Vector3(...spec.min), new THREE.Vector3(...spec.max));
    } else {
      this.center = new THREE.Vector3(...spec.pos);
      this.radius = spec.radius ?? 1.5;
    }
  }

  contains(p) {
    if (this.box) {
      // Feet position; allow the head to be inside too.
      return p.x >= this.box.min.x && p.x <= this.box.max.x && p.z >= this.box.min.z && p.z <= this.box.max.z && p.y + 1.0 >= this.box.min.y && p.y <= this.box.max.y;
    }
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    return dx * dx + dz * dz <= this.radius * this.radius && Math.abs(p.y - this.center.y) < 2.5;
  }
}
