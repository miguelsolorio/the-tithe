import * as THREE from 'three';
import { StaticBatcher } from './batcher.js';
import { getMaterial, getDecalMaterial } from './materials.js';
import { makeProp, knockOver } from './props/index.js';
import { Water } from './water.js';
import { buildPlan } from './plan.js';
import { Trigger } from '../engine/level.js';
import { NavGrid } from '../engine/nav.js';
import { makeRng } from '../core/rng.js';

// Authoring API handed to every level module's build(L, game). Coordinates
// are world metres; arrays [x, y, z] are accepted wherever a point is needed.
// See docs/level-api.md for the full reference.

const FACE_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const v3 = (a) => (a && a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

export class LevelBuilder {
  constructor(game, level) {
    this.game = game;
    this.level = level;
    this.group = level.group;
    this.physics = level.physics;
    this.batcher = new StaticBatcher();
    this.rng = makeRng(hashString(level.id));
    this._navBounds = null;
  }

  // ---------- Environment ----------
  // { fog: { color, density }, ambient: { sky, ground, intensity }, grade: { color, amount },
  //   music, musicLevel / sfxLevel (0..1 bed / world-sound volume), exposure, background, sun: { color, intensity, dir: [x,y,z] } }
  env(cfg) {
    Object.assign(this.level.env, cfg);
  }

  mat(name) {
    return getMaterial(name);
  }

  flag(name) {
    return this.game.flags.has(name);
  }

  setFlag(name) {
    this.game.setFlag(name);
  }

  // ---------- Static geometry ----------
  // Axis-aligned box from min to max, with collision by default.
  // opts: { collide = true, walkable = true, solid = true, surface, visible = true,
  //         worldUV = true, cast = true, shootable, seeThrough, navIgnore }
  box(min, max, material, opts = {}) {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const mat = typeof material === 'string' ? getMaterial(material) : material;
    if (opts.visible !== false && mat) {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this.batcher.add(g, mat, { worldUV: opts.worldUV !== false, cast: opts.cast !== false, vOffset: opts.vOffset ?? 0 });
    }
    if (opts.collide === false) return null;
    return this.collider(min, max, { surface: mat?.userData?.surface, ...opts });
  }

  // Collider only (invisible walls, blockers).
  collider(min, max, opts = {}) {
    return this.physics.add({
      type: 'box',
      min: { x: Math.min(min[0], max[0]), y: Math.min(min[1], max[1]), z: Math.min(min[2], max[2]) },
      max: { x: Math.max(min[0], max[0]), y: Math.max(min[1], max[1]), z: Math.max(min[2], max[2]) },
      walkable: opts.walkable ?? true,
      solid: opts.solid ?? true,
      surface: opts.surface,
      shootable: opts.shootable ?? true,
      seeThrough: opts.seeThrough ?? false,
      navIgnore: opts.navIgnore ?? false,
      tag: opts.tag,
    });
  }

  // Vertical cylinder (pillars, trunks). opts as box().
  cylinder(x, z, r, y0, y1, material, opts = {}) {
    const mat = typeof material === 'string' ? getMaterial(material) : material;
    if (opts.visible !== false && mat) {
      const g = new THREE.CylinderGeometry(opts.rTop ?? r, r, y1 - y0, opts.segments ?? 12);
      g.translate(x, (y0 + y1) / 2, z);
      this.batcher.add(g, mat, { worldUV: opts.worldUV ?? true });
    }
    if (opts.collide === false) return null;
    return this.physics.add({ type: 'cyl', x, z, r, y0, y1, surface: mat?.userData?.surface, walkable: opts.walkable ?? false });
  }

  // Sloped floor: top rises from min.y to max.y along axis (dir 1: toward +axis).
  ramp(min, max, axis = 'z', dir = 1, material = 'stone', opts = {}) {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const mat = typeof material === 'string' ? getMaterial(material) : material;
    if (opts.visible !== false) {
      const len = axis === 'x' ? x1 - x0 : z1 - z0;
      const rise = y1 - y0;
      const g = new THREE.PlaneGeometry(axis === 'x' ? Math.hypot(len, rise) : x1 - x0, axis === 'z' ? Math.hypot(len, rise) : z1 - z0);
      g.rotateX(-Math.PI / 2);
      const ang = Math.atan2(rise, len) * dir;
      if (axis === 'x') g.rotateZ(ang);
      else g.rotateX(-ang);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this.batcher.add(g, mat);
      // Skirt under the slope so the side isn't see-through.
      if (opts.skirt !== false && rise > 0.05) this.box([x0, y0 - 0.3, z0], [x1, y0, z1], mat, { collide: false });
    }
    return this.physics.add({
      type: 'ramp',
      min: { x: x0, y: y0, z: z0 },
      max: { x: x1, y: y1, z: z1 },
      axis,
      dir,
      surface: mat?.userData?.surface,
      walkable: true,
    });
  }

  // Straight staircase. Steps climb from fromY to toY while moving toward `dir`
  // ('n' = -z, 's' = +z, 'e' = +x, 'w' = -x) across the rectangle [x0,z0]-[x1,z1].
  stairs({ x0, z0, x1, z1, fromY, toY, dir, material = 'woodDark', riser = 'woodDark', stepH = 0.2 }) {
    const rise = toY - fromY;
    const n = Math.max(1, Math.round(Math.abs(rise) / stepH));
    const h = rise / n;
    const alongX = dir === 'e' || dir === 'w';
    const len = alongX ? x1 - x0 : z1 - z0;
    const run = len / n;
    for (let i = 0; i < n; i++) {
      // Step i occupies the i-th slice from the start edge, top at fromY + h*(i+1) (going up) or fromY + h*i (going down).
      const top = rise >= 0 ? fromY + h * (i + 1) : fromY + h * (i + 1);
      const a = i * run;
      const b = (i + 1) * run;
      let sx0, sx1, sz0, sz1;
      if (dir === 'e') [sx0, sx1, sz0, sz1] = [x0 + a, x0 + b, z0, z1];
      else if (dir === 'w') [sx0, sx1, sz0, sz1] = [x1 - b, x1 - a, z0, z1];
      else if (dir === 's') [sx0, sx1, sz0, sz1] = [x0, x1, z0 + a, z0 + b];
      else [sx0, sx1, sz0, sz1] = [x0, x1, z1 - b, z1 - a];
      const bottom = Math.min(fromY, toY) - 0.3;
      this.box([sx0, top - 0.06, sz0], [sx1, top, sz1], material, { surface: 'wood' });
      this.box([sx0, bottom, sz0], [sx1, top - 0.06, sz1], riser, { collide: false });
      this.collider([sx0, bottom, sz0], [sx1, top, sz1], { surface: getMaterial(material).userData.surface });
    }
  }

  // Rooms / corridors from an ASCII plan (see plan.js).
  plan(spec) {
    return buildPlan(this, spec);
  }

  // ---------- Meshes and props ----------
  // Add an arbitrary Object3D. opts: { static (merge into batches), collider: 'box' | 'none' | [{min,max}] (local) }
  mesh(obj, opts = {}) {
    obj.updateMatrixWorld(true);
    const colliders = this._objectColliders(obj, opts.collider ?? 'none', opts);
    if (opts.static) this.batcher.addObject(obj);
    else {
      obj.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = m.castShadow || opts.cast !== false;
          m.receiveShadow = true;
        }
      });
      this.group.add(obj);
    }
    return { object: obj, colliders };
  }

  // Place a prop from the registry. opts: { y, rotY, face: 'n'|'s'|'e'|'w', scale, fallen: 'side'|'back'|'front',
  //   seed, dynamic, collider override, lights: false to drop its lights, buzz (bulb hum loop), flicker override }
  prop(name, x, z, opts = {}) {
    let obj = makeProp(name, { seed: opts.seed ?? this.rng.int(1, 1e6), ...opts.args });
    if (opts.fallen) obj = knockOver(obj, opts.fallen);
    const y = opts.y ?? this.floorAt(x, z);
    obj.position.set(x, y, z);
    obj.rotation.y = opts.rotY ?? FACE_ROT[opts.face ?? 's'];
    if (opts.scale) obj.scale.setScalar(opts.scale);
    obj.updateMatrixWorld(true);

    const ud = obj.userData || {};
    const lights = opts.lights === false ? [] : ud.lights || [];
    const flickerBulb = lights.some((l) => (l.kind === 'bulb' && (opts.flicker ?? l.flicker) > 0) || opts.flicker > 0);
    const dynamic = opts.dynamic || ud.dynamic || flickerBulb;
    const colliders = this._objectColliders(obj, opts.collider ?? ud.collider ?? 'box', opts);

    // Emissive meshes that should follow their light's flicker get their own material copy.
    const emissiveMeshes = [];
    if (flickerBulb) {
      obj.traverse((m) => {
        if (m.isMesh && m.material && m.material.emissiveIntensity > 0 && m.material.emissive && m.material.emissive.getHex() !== 0) {
          m.material = m.material.clone();
          m.userData.baseEmissive = m.material.emissiveIntensity;
          emissiveMeshes.push(m);
        }
      });
    }
    const sources = [];
    for (const l of lights) {
      const pos = obj.localToWorld(new THREE.Vector3(...l.offset));
      const src = this.light({
        pos,
        color: l.color,
        intensity: l.intensity,
        distance: l.distance,
        flicker: opts.flicker ?? l.flicker,
        kind: l.kind,
      });
      if (emissiveMeshes.length) {
        src.onFlicker = (f) => {
          for (const m of emissiveMeshes) m.material.emissiveIntensity = m.userData.baseEmissive * f;
        };
      }
      sources.push(src);
      if (opts.buzz && l.kind === 'bulb') this.loopSound('bulbBuzz', pos, { radius: 9, gain: 0.5 });
      if (opts.crackle && l.kind === 'candle') this.loopSound('candle', pos, { radius: 5, gain: 0.5 });
    }
    if (dynamic) {
      obj.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = m.castShadow !== false;
          m.receiveShadow = true;
        }
      });
      this.group.add(obj);
    } else {
      this.batcher.addObject(obj);
    }
    obj.userData.colliders = colliders;
    obj.userData.sources = sources;
    return obj;
  }

  _objectColliders(obj, spec, opts = {}) {
    if (!spec || spec === 'none') return [];
    const surface = opts.surface;
    if (spec === 'box') {
      const b = new THREE.Box3().setFromObject(obj);
      if (b.isEmpty()) return [];
      return [this.collider([b.min.x, b.min.y, b.min.z], [b.max.x, b.max.y, b.max.z], { surface, walkable: opts.walkable ?? false, seeThrough: opts.seeThrough })];
    }
    const out = [];
    for (const c of spec) {
      const b = new THREE.Box3(new THREE.Vector3(...c.min), new THREE.Vector3(...c.max)).applyMatrix4(obj.matrixWorld);
      out.push(this.collider([b.min.x, b.min.y, b.min.z], [b.max.x, b.max.y, b.max.z], { surface, walkable: opts.walkable ?? false, seeThrough: opts.seeThrough }));
    }
    return out;
  }

  // Flat decal: kind = 'bloodSplat' | 'bloodSmear' | 'bloodDrip' | 'sigil' | 'sigilGlow' | 'grime' | 'handprint' | 'footprints'.
  // face = which way the decal faces: 'up' (floor), 'down' (ceiling), 'n' | 's' | 'e' | 'w' (walls).
  decal(kind, pos, { face = 'up', size = 1, rot = null } = {}) {
    const [w, h] = Array.isArray(size) ? size : [size, size];
    const g = new THREE.PlaneGeometry(w, h);
    const r = rot ?? this.rng.range(0, Math.PI * 2);
    const off = 0.012;
    const p = v3(pos);
    if (face === 'up') {
      g.rotateZ(r);
      g.rotateX(-Math.PI / 2);
      p.y += off;
    } else if (face === 'down') {
      g.rotateZ(r);
      g.rotateX(Math.PI / 2);
      p.y -= off;
    } else {
      if (rot !== null) g.rotateZ(rot);
      g.rotateY(FACE_ROT[face]);
      const n = { s: [0, 0, 1], n: [0, 0, -1], e: [1, 0, 0], w: [-1, 0, 0] }[face];
      p.x += n[0] * off;
      p.z += n[2] * off;
    }
    g.translate(p.x, p.y, p.z);
    this.batcher.add(g, getDecalMaterial(kind), { worldUV: false, cast: false });
  }

  // ---------- Lights ----------
  // Pool light source. kind: 'candle' | 'bulb' | 'flesh' | 'lantern' | 'screen'.
  light({ pos, color = 0xe08a2c, intensity = 1.2, distance = 6, flicker = 0, kind = 'candle', priority = 1, getPos = null, enabled = true }) {
    const src = { pos: pos ? v3(pos) : new THREE.Vector3(), getPos, color, intensity, distance, flicker, kind, priority, enabled };
    this.level.lightSources.push(src);
    // Added at runtime to the live level (drops, scripted lights): register now.
    if (this.level.active) this.game.lights.add(src);
    return src;
  }

  // ---------- Gameplay ----------
  spawn(name, pos, yaw = 0) {
    this.level.spawns[name] = { pos: v3(pos), yaw };
  }

  // Interactable: { pos, radius = 1.8, prompt: string | (game) => string, onUse(game, it), enabled?: (game) => bool, id }
  interact(spec) {
    const it = { radius: 1.8, ...spec, pos: v3(spec.pos), alive: true };
    this.level.interactables.push(it);
    return it;
  }

  // Trigger volume: { min, max } or { pos, radius }, with { once, onEnter, onExit, onStay, enabled, id }.
  trigger(spec) {
    const t = new Trigger(spec);
    this.level.triggers.push(t);
    return t;
  }

  // Walking into the volume moves the player to another level.
  // { min, max } | { pos, radius }, { to, spawn, requires?: (game) => true | string, prompt? }
  // With prompt, it becomes an interactable (E) instead of an auto trigger.
  exit(spec) {
    const go = (game) => {
      const ok = spec.requires ? spec.requires(game) : true;
      if (ok !== true) {
        if (typeof ok === 'string') game.hud.say(ok, 3);
        return false;
      }
      game.levels.goTo(spec.to, spec.spawn);
      return true;
    };
    if (spec.prompt) {
      const pos = spec.pos ?? [(spec.min[0] + spec.max[0]) / 2, (spec.min[1] + spec.max[1]) / 2 + 1, (spec.min[2] + spec.max[2]) / 2];
      return this.interact({ pos, radius: spec.radius ?? 2, prompt: spec.prompt, enabled: spec.enabled, onUse: (game) => go(game) });
    }
    return this.trigger({ ...spec, onEnter: (game, tr) => go(game), once: false, onStay: (game, dt, tr) => {
      // Retry while standing inside (e.g. after the requirement becomes true).
      tr._retry = (tr._retry ?? 0) - dt;
      if (tr._retry <= 0 && (!spec.requires || spec.requires(game) === true)) {
        tr._retry = 1;
        if (!game.levels.transitioning) go(game);
      }
    } });
  }

  // Pickup: { id, kind: 'ammo' | 'shells' | 'bandage' | 'item', item?, amount?, pos, rotY }
  pickup(spec) {
    return this.game.pickups.create(this, spec);
  }

  // Enemy: type = 'acolyte' | 'hound' | 'drowned' | 'lamprey' | 'skinless' | 'wallMaw' | 'mother'.
  // opts: { id, yaw, idle: 'stand' | 'pray' | 'wander' | 'patrol' | 'dormant' | 'seated', patrol: [[x,z],...], wakeRadius, ... }
  enemy(type, pos, opts = {}) {
    const spec = { type, pos: v3(pos), ...opts };
    if (spec.id && this.game.flags.has(`killed:${spec.id}`)) return null;
    this.level.enemySpecs.push(spec);
    return spec;
  }

  // Water surface + wading zone. { min: [x0, z0], max: [x1, z1], y, color: 'teal'|'deep'|'red'|'black'|hex, opacity, flow }
  water(spec) {
    const w = new Water({ x0: spec.min[0], z0: spec.min[1], x1: spec.max[0], z1: spec.max[1], y: spec.y, color: spec.color, opacity: spec.opacity, flow: spec.flow });
    this.group.add(w.mesh);
    this.level.waters.push(w);
    return w;
  }

  // Random positional one-shots: name from the audio engine ('drip', 'squelch', ...).
  sound(name, pos, { interval = [3, 8], radius = 20, gain = 1 } = {}) {
    this.level.emitters.push({ name, pos: v3(pos), interval, radius, gain, timer: interval[0] + Math.random() * (interval[1] - interval[0]) });
  }

  // Continuous positional loop, started while the level is active and the player within radius.
  loopSound(name, pos, { radius = 15, gain = 1 } = {}) {
    const spec = { name, pos: v3(pos), radius, gain, handle: null };
    this.level.loopSpecs.push(spec);
    return spec;
  }

  onUpdate(fn) {
    this.level.updaters.push(fn);
  }

  onEnter(fn) {
    this.level.enterHooks.push(fn);
  }

  onExit(fn) {
    this.level.exitHooks.push(fn);
  }

  onDispose(fn) {
    this.level.disposables.push(fn);
  }

  floorAt(x, z, maxY = 50) {
    const g = this.physics.groundAt(x, z, maxY);
    return g.y === -Infinity ? 0 : g.y;
  }

  // Restrict the nav grid to a rectangle (default: bounds of all colliders).
  navBounds(minX, minZ, maxX, maxZ) {
    this._navBounds = { minX, minZ, maxX, maxZ };
  }

  // ---------- Doors ----------
  // Hinged door leaf in an opening. { x, z, y, axis: 'x' (door spans along x) | 'z', width, height,
  //   material, locked?: (game) => false | string, onOpen?(game), open: false, id, hinge: -1 | 1, prompt }
  door(spec) {
    const { x, z, axis = 'x', width = 1, height = 2.15, material = 'woodDark', hinge = -1, id } = spec;
    const y = spec.y ?? this.floorAt(x, z);
    const pivot = new THREE.Group();
    const w = width - 0.06;
    const leaf = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, height - 0.03, 0.05), getMaterial(material));
    panel.position.set((w / 2) * -hinge, height / 2, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    leaf.add(panel);
    // Recessed panels and a knob so the door reads as a door.
    for (const py of [0.55, 1.45]) {
      for (const side of [1, -1]) {
        const inset = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.6, 0.012), getMaterial('wood'));
        inset.position.set((w / 2) * -hinge, py, 0.028 * side);
        leaf.add(inset);
      }
    }
    for (const side of [1, -1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), getMaterial('metal'));
      knob.position.set((w - 0.08) * -hinge, 1.0, 0.06 * side);
      leaf.add(knob);
    }
    pivot.add(leaf);
    const hx = axis === 'x' ? x + (width / 2) * hinge : x;
    const hz = axis === 'z' ? z + (width / 2) * hinge : z;
    pivot.position.set(hx, y, hz);
    // The panel runs along the pivot's local x (away from the hinge). Doors
    // spanning z turn by -90° so it lies in the opening, not inside the wall.
    const base = axis === 'x' ? 0 : -Math.PI / 2;
    pivot.rotation.y = base;
    this.group.add(pivot);
    // Where the free edge ends up for a given swing angle.
    const freeEdge = (ang) => {
      const a = base + ang;
      return { x: hx + Math.cos(a) * -hinge * width, z: hz - Math.sin(a) * -hinge * width };
    };

    const half = width / 2;
    const col = axis === 'x'
      ? this.collider([x - half, y, z - 0.06], [x + half, y + height, z + 0.06], { walkable: false, surface: 'wood' })
      : this.collider([x - 0.06, y, z - half], [x + 0.06, y + height, z + half], { walkable: false, surface: 'wood' });
    const door = { pivot, collider: col, open: false, angle: 0, target: 0, id, spec };
    const level = this.level;
    const openDoor = (game, fromPos) => {
      if (door.open) return;
      door.open = true;
      col.enabled = false;
      level.markNavDirty();
      // Swing away from whoever opened it.
      let sgn = 1;
      if (fromPos) {
        const a = freeEdge(1.7);
        const b = freeEdge(-1.7);
        sgn = Math.hypot(a.x - fromPos.x, a.z - fromPos.z) >= Math.hypot(b.x - fromPos.x, b.z - fromPos.z) ? 1 : -1;
      }
      door.target = 1.7 * sgn;
      game.audio.play('doorOpen', { pos: new THREE.Vector3(x, y + 1, z) });
      if (id) game.setFlag(`door:${id}`);
      spec.onOpen?.(game);
    };
    door.openDoor = openDoor;
    const it = this.interact({
      pos: [x, y + 1.1, z],
      radius: 1.9,
      id,
      ignore: [col],
      prompt: (game) => {
        if (door.open) return null;
        return spec.prompt || 'Open';
      },
      enabled: () => !door.open,
      onUse: (game) => {
        const lock = spec.locked ? spec.locked(game) : false;
        if (lock) {
          game.audio.play('doorLocked', { pos: new THREE.Vector3(x, y + 1, z) });
          game.hud.say(typeof lock === 'string' ? lock : 'Locked.', 3);
          return;
        }
        openDoor(game, game.player.position);
      },
    });
    door.interactable = it;
    this.onUpdate((dt) => {
      if (door.angle !== door.target) {
        const d = door.target - door.angle;
        door.angle += Math.sign(d) * Math.min(Math.abs(d), dt * 2.6);
        pivot.rotation.y = base + door.angle;
      }
    });
    if (spec.open || (id && this.game.flags.has(`door:${id}`))) {
      door.open = true;
      col.enabled = false;
      door.angle = door.target = 1.6 * (spec.openSign ?? 1);
      pivot.rotation.y = base + door.angle;
    }
    return door;
  }

  // ---------- Special volumes ----------
  // Low passage: the player crouches automatically inside (eye = fraction of standing height).
  crawl({ min, max, eye = 0.55 }) {
    return this.trigger({
      min,
      max,
      onEnter: (g) => {
        g.player.crouchZone = true;
        g.player.eyeScaleTarget = eye;
      },
      onExit: (g) => {
        g.player.crouchZone = false;
        g.player.eyeScaleTarget = 1;
      },
    });
  }

  // Something bullets and blades can hurt that isn't an enemy (a flesh door, a
  // chain). { pos, r, health, only: ['shotgun'] (weapons that work), onHit(game, dmg, weapon),
  //   onDestroy(game), resist: 'message when an ineffective weapon hits' }
  damageable(spec) {
    const d = {
      center: v3(spec.pos),
      r: spec.r ?? 0.8,
      health: spec.health ?? 100,
      dead: false,
      takeDamage: (amount, point, dir, weapon) => {
        if (d.dead) return;
        const g = this.game;
        g.particles.impact(point || d.center, null, spec.blood || 'blood', 10);
        if (spec.only && !spec.only.includes(weapon)) {
          if (spec.resist && g.time - (d._msg ?? -9) > 3) {
            d._msg = g.time;
            g.hud.say(spec.resist, 2.5);
          }
          return;
        }
        d.health -= amount;
        spec.onHit?.(g, amount, weapon);
        if (d.health <= 0) {
          d.dead = true;
          spec.onDestroy?.(g);
        }
      },
    };
    (this.level.damageables ||= []).push(d);
    return d;
  }

  // Ladder or hatch between two points in the same level: E fades and moves you.
  // { bottom: [x,y,z], top: [x,y,z], yawTop, yawBottom, promptUp, promptDown, requires?: (game) => true | string }
  ladder(spec) {
    const go = async (g, to, yaw) => {
      const ok = spec.requires ? spec.requires(g) : true;
      if (ok !== true) {
        if (typeof ok === 'string') g.hud.say(ok, 3);
        return;
      }
      g.player.frozen = true;
      g.audio.play('creak', { gain: 0.6 });
      g.fx.fadeTo(1, 4);
      await new Promise((r) => setTimeout(r, 300));
      g.player.teleport(v3(to), yaw);
      g.fx.fadeTo(0, 3);
      g.player.frozen = false;
    };
    const top = v3(spec.top);
    const bottom = v3(spec.bottom);
    this.interact({ pos: bottom.clone().add(new THREE.Vector3(0, 1.3, 0)), radius: 1.8, prompt: spec.promptUp || 'Climb up', noLOS: true, onUse: (g) => go(g, spec.top, spec.yawTop ?? 0) });
    this.interact({ pos: top.clone().add(new THREE.Vector3(0, 0.3, 0)), radius: 1.8, prompt: spec.promptDown || 'Climb down', noLOS: true, onUse: (g) => go(g, spec.bottom, spec.yawBottom ?? 0) });
  }

  // Rising flood water for the escape. { min: [x0, z0], max: [x1, z1], from, to, seconds, color }
  // Starts rising when you enter the level; if it passes your head you drown.
  flood({ min, max, from, to, seconds = 120, color = 'murky' }) {
    const w = this.water({ min, max, y: from, color, opacity: 0.82 });
    let t = 0;
    this.onEnter((g) => {
      t = 0;
      w.setLevel(from);
      g.audio.play('flood');
    });
    this.onUpdate((dt) => {
      t += dt;
      w.setLevel(from + (to - from) * Math.min(1, t / seconds));
    });
    return w;
  }

  // ---------- Finish ----------
  finish() {
    const level = this.level;
    this.batcher.build(this.group);
    // Nav grid over the collider bounds.
    let b = this._navBounds;
    if (!b) {
      b = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
      for (const c of this.physics.colliders) {
        if (c.type === 'height') continue;
        const cb = c._b;
        b.minX = Math.min(b.minX, cb.x0);
        b.minZ = Math.min(b.minZ, cb.z0);
        b.maxX = Math.max(b.maxX, cb.x1);
        b.maxZ = Math.max(b.maxZ, cb.z1);
      }
      if (b.minX === Infinity) b = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
    }
    // 0.25 m cells with a 0.25 m clearance so 1 m framed doorways (≈0.82 m
    // clear) always contain walkable cell centres. Levels without enemies skip it.
    if (level.enemySpecs.length || level.def.nav) level.nav = new NavGrid(this.physics, b, { cell: 0.25, radius: 0.25 });
    return level;
  }
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
