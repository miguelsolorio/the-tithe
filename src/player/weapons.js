import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { damp } from '../core/utils.js';
import { makeProp, PROP_NAMES } from '../world/props/index.js';

// Knife, revolver and shotgun: first-person view models (drawn in their own
// scene on top of the world), firing, reloading and hit detection.

const ORDER = ['knife', 'revolver', 'shotgun'];
const HOLD = {
  // Where the weapon's grip sits in front of the camera, and its resting rotation.
  knife: { pos: [0.25, -0.25, -0.44], rot: [0.2, 0.3, -0.3] },
  revolver: { pos: [0.19, -0.2, -0.42], rot: [0.04, 0.09, 0] },
  shotgun: { pos: [0.15, -0.21, -0.36], rot: [0.05, 0.06, 0] },
};

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Weapons {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0x8a8070, 0x151010, 0.9);
    this.scene.add(this.hemi);
    this.key = new THREE.PointLight(0xfff1d6, 0, 3, 1.5);
    this.key.position.set(0.3, 0.25, 0.1);
    this.scene.add(this.key);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 4, 1.5);
    this.scene.add(this.flashLight);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.models = {};
    this.current = null;
    this.state = 'idle';
    this.timer = 0;
    this.cooldown = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.kick = 0;
    this.lower = 1;
    this.lowerTarget = 1;
    this.pending = null;
    this.flashMesh = makeFlashMesh();
    this.flashMesh.visible = false;
    this.scene.add(this.flashMesh);
    this.flashTime = 0;
    this.poolFlash = null;
  }

  reset() {
    this.current = null;
    this.game.hud.setWeapon(null);
    this.state = 'idle';
    this.timer = 0;
    this.cooldown = 0;
    this.lower = 1;
    this.lowerTarget = 1;
    this.pending = null;
    for (const m of Object.values(this.models)) m.visible = false;
  }

  model(name) {
    if (this.models[name]) return this.models[name];
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    let weapon;
    if (PROP_NAMES.includes(name)) weapon = makeProp(name);
    else weapon = placeholder(name);
    inner.add(weapon);
    if (PROP_NAMES.includes('fpArm')) {
      // The right hand grips at the weapon origin; the shotgun's fore-end gets the left hand.
      const hold = weapon.userData?.hold || (name === 'knife' ? 'knife' : name === 'shotgun' ? 'rifle' : 'pistol');
      inner.add(makeProp('fpArm', { side: 'right', pose: 'grip', hold }));
      if (weapon.userData?.support) weapon.userData.support.add(makeProp('fpArm', { side: 'left', pose: 'open', hold: 'support' }));
    }
    weapon.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = false;
        m.frustumCulled = false;
      }
    });
    g.userData.weapon = weapon;
    g.userData.inner = inner;
    g.userData.muzzle = weapon.userData?.muzzle || null;
    g.visible = false;
    this.root.add(g);
    this.models[name] = g;
    return g;
  }

  get inv() {
    return this.game.inventory;
  }

  has(name) {
    return this.inv.weapons.includes(name);
  }

  equip(name, instant = false) {
    if (!this.has(name) || this.current === name) return;
    if (this.state === 'reload') this.state = 'idle';
    if (!this.current || instant) {
      this._show(name);
      this.lower = instant ? 0 : 1;
      this.lowerTarget = 0;
      return;
    }
    this.pending = name;
    this.lowerTarget = 1;
    this.state = 'switch';
    this.game.audio.play('weaponSwitch', { gain: 0.6 });
  }

  _show(name) {
    for (const [k, m] of Object.entries(this.models)) m.visible = k === name;
    this.model(name).visible = true;
    this.current = name;
    this.state = 'idle';
    this.game.hud.setWeapon(name);
    this.updateHud();
  }

  updateHud() {
    const n = this.current;
    if (!n) this.game.hud.setAmmo(null);
    else if (n === 'knife') this.game.hud.setAmmo({ label: 'Knife', mag: '∞', reserve: null });
    else this.game.hud.setAmmo({ label: n === 'revolver' ? 'Revolver' : 'Shotgun', mag: this.inv.mag[n], reserve: this.inv.ammo[n] });
  }

  update(dt) {
    const g = this.game;
    const input = g.input;
    const p = g.player;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const canAct = g.state === 'playing' && !p.dead && !p.frozen;

    if (canAct) {
      if (input.wasPressed('Digit1')) this.equip('knife');
      if (input.wasPressed('Digit2')) this.equip('revolver');
      if (input.wasPressed('Digit3')) this.equip('shotgun');
      if (input.wasPressed('KeyR')) this.reload();
      if (input.mouseDown && this.current && this.state === 'idle' && this.cooldown <= 0) this.attack();
    }

    // Switch: lower, swap, raise.
    if (this.state === 'switch' && this.lower > 0.98 && this.pending) {
      this._show(this.pending);
      this.pending = null;
      this.lowerTarget = 0;
      this.state = 'idle';
    }
    this.lower += (this.lowerTarget - this.lower) * damp(12, dt);

    // Timed actions.
    if (this.state === 'attack' || this.state === 'reload') {
      this.timer += dt;
      if (this.state === 'attack' && this.current === 'knife' && !this._knifeHit && this.timer >= CONFIG.weapons.knife.hitDelay) {
        this._knifeHit = true;
        this.knifeHit();
      }
      const dur = this.state === 'reload' ? CONFIG.weapons[this.current].reload : this.current === 'knife' ? 0.45 : 0.25;
      if (this.timer >= dur) {
        if (this.state === 'reload') this.finishReload();
        this.state = 'idle';
      }
    }

    this.kick = Math.max(0, this.kick - dt * 6);
    this.flashTime -= dt;
    this.flashMesh.visible = this.flashTime > 0;
    this.flashLight.intensity = this.flashTime > 0 ? 6 : 0;
    if (this.poolFlash && this.flashTime <= 0) {
      g.lights.remove(this.poolFlash);
      this.poolFlash = null;
    }

    this.animate(dt);
  }

  animate(dt) {
    const g = this.game;
    const p = g.player;
    const name = this.current;
    this.camera.aspect = g.camera.aspect;
    this.camera.updateProjectionMatrix();
    // Fill light standing in for the flashlight spill on your own hands.
    this.key.intensity = p.flashOn ? 5 : 1.2;
    if (!name) return;
    const m = this.model(name);
    const inner = m.userData.inner;
    const hold = HOLD[name];
    // Sway lags behind mouse look; bob follows the player's steps.
    const look = p.lookDelta || { x: 0, y: 0 };
    this.swayX += (Math.max(-0.05, Math.min(0.05, -look.x * 0.0004)) - this.swayX) * damp(6, dt);
    this.swayY += (Math.max(-0.05, Math.min(0.05, look.y * 0.0004)) - this.swayY) * damp(6, dt);
    const bob = p.bobAmt;
    const bx = Math.cos(p.bob) * 0.012 * bob;
    const by = Math.abs(Math.sin(p.bob)) * 0.014 * bob;
    const breathe = Math.sin(g.time * 1.6) * 0.004;
    // Pull the weapon toward centre in narrow windows so it stays on screen.
    const ax = Math.min(1, this.camera.aspect / 1.5);
    m.position.set(hold.pos[0] * ax + bx + this.swayX, hold.pos[1] - by + breathe - this.lower * 0.45 + this.swayY, hold.pos[2] + this.kick * 0.08);
    m.rotation.set(hold.rot[0] + this.kick * 0.35 - this.lower * 0.6, hold.rot[1], hold.rot[2]);
    inner.position.set(0, 0, 0);
    inner.rotation.set(0, 0, 0);

    const t = this.timer;
    if (this.state === 'attack' && name === 'knife') {
      // Slash from upper right to lower left with a forward thrust.
      const k = Math.min(1, t / 0.45);
      const s = Math.sin(Math.min(1, k * 1.6) * Math.PI);
      inner.rotation.set(-0.4 * s, 0.5 * s, 1.2 * s - 0.6 * k * (1 - k) * 4);
      inner.position.set(-0.22 * s, 0.06 * s, -0.12 * s);
    } else if (this.state === 'reload') {
      const dur = CONFIG.weapons[name].reload;
      const k = t / dur;
      const tilt = Math.sin(Math.min(1, k * 1.15) * Math.PI);
      // Open (first 25%), load, close (last 20%).
      const open = Math.min(1, k / 0.25) * Math.min(1, (1 - k) / 0.2);
      inner.rotation.set(0.45 * tilt, 0.15 * tilt, name === 'revolver' ? 0.7 * tilt : 0.25 * tilt);
      inner.position.set(-0.06 * tilt, -0.05 * tilt, 0.02 * tilt);
      const wd = m.userData.weapon.userData || {};
      if (name === 'revolver') {
        if (wd.crane) wd.crane.rotation.z = 1.75 * open;
        if (wd.cylinder && open > 0.9) wd.cylinder.rotation.z += dt * 10;
      }
      if (name === 'shotgun' && wd.barrels) wd.barrels.rotation.x = -0.55 * open;
    }
    // Revolver hammer re-cocks after each shot.
    const wd = m.userData.weapon.userData || {};
    if (name === 'revolver' && wd.hammer) wd.hammer.rotation.x = this.cooldown > 0.12 ? 0 : 0.5;
    // Muzzle flash follows the muzzle.
    if (this.flashMesh.visible && m.userData.muzzle) {
      m.userData.muzzle.getWorldPosition(this.flashMesh.position);
      this.flashLight.position.copy(this.flashMesh.position);
    }
  }

  attack() {
    const name = this.current;
    const inv = this.inv;
    if (name === 'knife') {
      this.state = 'attack';
      this.timer = 0;
      this._knifeHit = false;
      this.cooldown = CONFIG.weapons.knife.cooldown;
      this.game.audio.play('knifeSwing');
      return;
    }
    if (inv.mag[name] <= 0) {
      if (inv.ammo[name] > 0) this.reload();
      else {
        this.game.audio.play('dryFire');
        this.cooldown = 0.35;
        this.game.hud.say('Out of ammo.', 1.5);
      }
      return;
    }
    inv.mag[name]--;
    // Advance the cylinder one chamber.
    const cyl = this.models[name]?.userData.weapon.userData?.cylinder;
    if (name === 'revolver' && cyl) cyl.rotation.z += Math.PI / 3;
    const W = CONFIG.weapons[name];
    this.cooldown = W.cooldown;
    this.state = 'attack';
    this.timer = 0;
    this.kick = 1;
    this.flashTime = 0.06;
    this.game.player.pitch += name === 'shotgun' ? 0.035 : 0.018;
    const g = this.game;
    // Light up the room for a frame.
    if (!this.poolFlash) this.poolFlash = g.lights.add({ pos: g.camera.position.clone(), color: 0xffb060, intensity: 5, distance: 14, kind: 'flash', priority: 100 });
    else this.poolFlash.pos.copy(g.camera.position);
    const deep = g.player.water.depth > 0.6 || g.player.underwater;
    if (name === 'revolver') g.audio.play('revolver');
    else g.audio.play(deep ? 'boom' : 'shotgun');
    g.events.emit('gunshot', g.camera.position.clone());
    const pellets = name === 'shotgun' ? W.pellets : 1;
    const hits = new Map();
    for (let i = 0; i < pellets; i++) {
      const dir = this.aimDir(W.spread);
      const hit = this.trace(g.camera.position, dir, W.range, name);
      if (hit && hit.target) {
        const prev = hits.get(hit.target) || { dmg: 0, hit };
        prev.dmg += W.damage * (hit.mult ?? 1);
        hits.set(hit.target, prev);
      }
    }
    for (const [target, { dmg, hit }] of hits) target.takeDamage(dmg, hit.point, dir0(g), name);
    if (hits.size) g.hud.hitMarker();
    this.updateHud();
  }

  aimDir(spread) {
    const d = this.game.camera.getWorldDirection(new THREE.Vector3());
    if (spread > 0) {
      d.x += (Math.random() - 0.5) * 2 * spread;
      d.y += (Math.random() - 0.5) * 2 * spread;
      d.z += (Math.random() - 0.5) * 2 * spread;
      d.normalize();
    }
    return d;
  }

  // Nearest of: a damageable target (enemy hit sphere) or a wall.
  trace(origin, dir, range, kind = 'revolver') {
    const g = this.game;
    const level = g.levels.current;
    const wall = level.physics.raycast(origin, dir, range, null, {});
    const wallDist = wall ? wall.dist : range;
    const t = g.enemies.raycast(origin, dir, wallDist);
    if (t) return t;
    if (wall) {
      g.particles.impact(wall.point, wall.normal, 'dust');
      // Props take their own bullet holes (they move); walls get a world decal.
      if (!g.props.hit(wall.collider, wall.point, wall.normal, dir, kind)) {
        g.decals.bulletHole(wall.point, wall.normal);
        if (Math.random() < 0.35) g.audio.play('ricochet', { pos: new THREE.Vector3(wall.point.x, wall.point.y, wall.point.z), gain: 0.5 });
      }
      return { point: wall.point, target: null };
    }
    return null;
  }

  knifeHit() {
    const g = this.game;
    const W = CONFIG.weapons.knife;
    const origin = g.camera.position;
    const dir = g.camera.getWorldDirection(new THREE.Vector3());
    let hit = g.enemies.raycast(origin, dir, W.range);
    if (!hit) hit = g.enemies.sweep(origin, dir, W.range, 0.75);
    if (hit) {
      const wall = g.levels.current.physics.raycast(origin, dir, hit.dist ?? W.range, null, {});
      if (!wall || wall.dist >= (hit.dist ?? 0) - 0.1) {
        hit.target.takeDamage(W.damage * Math.min(1.5, hit.mult ?? 1), hit.point, dir, 'knife');
        g.audio.play('knifeHit', { pos: hit.point });
        g.hud.hitMarker();
        return;
      }
    }
    const wall = g.levels.current.physics.raycast(origin, dir, W.range, null, {});
    if (wall) {
      const pos = new THREE.Vector3(wall.point.x, wall.point.y, wall.point.z);
      if (g.props.hit(wall.collider, wall.point, wall.normal, dir, 'knife')) g.audio.play('propHit', { pos, gain: 0.8 });
      else g.audio.play('knifeWall', { pos });
      g.particles.impact(wall.point, wall.normal, 'dust', 4);
    }
  }

  reload() {
    const n = this.current;
    if (!n || n === 'knife' || this.state !== 'idle') return;
    const inv = this.inv;
    const W = CONFIG.weapons[n];
    if (inv.mag[n] >= W.mag || inv.ammo[n] <= 0) return;
    this.state = 'reload';
    this.timer = 0;
    this.game.audio.play(n === 'revolver' ? 'revolverReload' : 'shotgunReload');
  }

  finishReload() {
    const n = this.current;
    const inv = this.inv;
    const W = CONFIG.weapons[n];
    const need = W.mag - inv.mag[n];
    const take = Math.min(need, inv.ammo[n]);
    inv.mag[n] += take;
    inv.ammo[n] -= take;
    const w = this.models[n]?.userData.weapon;
    if (w?.userData?.barrels) w.userData.barrels.rotation.x = 0;
    this.updateHud();
  }

  render(renderer) {
    // Drawn by PostFX as a second pass.
  }
}

function dir0(g) {
  return g.camera.getWorldDirection(new THREE.Vector3());
}

function makeFlashMesh() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,240,200,1)');
  grd.addColorStop(0.3, 'rgba(255,170,60,0.8)');
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  m.scale.setScalar(0.18);
  return m;
}

// Stand-in view models until the item props exist.
function placeholder(name) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.4, metalness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.7 });
  if (name === 'knife') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.2), metal);
    blade.position.z = -0.13;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8).rotateX(Math.PI / 2), wood);
    g.add(blade, handle);
  } else {
    const len = name === 'shotgun' ? 0.7 : 0.22;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 10).rotateX(Math.PI / 2), metal);
    barrel.position.set(0, 0.05, -len / 2);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), wood);
    grip.rotation.x = -0.3;
    g.add(barrel, grip);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.05, -len);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
  }
  return g;
}

export { ORDER as WEAPON_ORDER };
