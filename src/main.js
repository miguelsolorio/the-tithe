import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { LightPool } from './world/lightPool.js';
import { Player } from './player/player.js';
import { Weapons } from './player/weapons.js';
import { PostFX } from './systems/postfx.js';
import { HUD } from './ui/hud.js';
import { Inventory } from './systems/inventory.js';
import { Interaction } from './systems/interaction.js';
import { Particles } from './systems/particles.js';
import { RuntimeDecals } from './systems/decals.js';
import { Pickups } from './entities/pickups.js';
import { EnemyManager } from './entities/enemyManager.js';
import { Sister } from './entities/sister.js';
import { creaturesReady } from './entities/enemy.js';
import { propsReady } from './world/props/index.js';
import * as Materials from './world/materials.js';
import { LevelManager } from './engine/levelManager.js';
import { LEVELS } from './levels/index.js';
import { installDebug, updateDebug } from './systems/debug.js';

// Audio, props and creature models load asynchronously so a broken module
// degrades gracefully (silence, placeholders, stand-ins) instead of a blank page.
const audioMods = import.meta.glob('./systems/audio.js');
class SilentAudio {
  init() {}
  setVolume() {}
  update() {}
  setZone() {}
  setDread() {}
  setBossHealth() {}
  setUnderwater() {}
  play() {}
  loop() {
    return { setPos() {}, setGain() {}, stop() {} };
  }
  footstep() {}
}
const audioReady = (async () => {
  try {
    const m = await audioMods['./systems/audio.js']?.();
    return m?.AudioEngine || SilentAudio;
  } catch (e) {
    console.warn('[audio] engine unavailable, running silent:', e.message);
    return SilentAudio;
  }
})();

const $ = (s) => document.querySelector(s);

const DEATH_TEXT = {
  acolyte: 'The acolytes lay you on the altar beside the others.',
  hound: 'The hound drags you down into the dark.',
  drowned: 'Cold hands hold you under until you stop struggling.',
  lamprey: 'It fastens on and does not let go.',
  skinless: 'It screams the whole time.',
  wallMaw: 'The walls were hungry.',
  mother: 'The Mother Below takes her tithe.',
  drowned_water: 'The water fills the house, and you with it.',
  default: 'Your sister waits a little longer.',
};

class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.debug = params.has('debug');
    this.params = params;
    this.state = 'title';
    this.time = 0;
    this.flags = new Set();
    this.godMode = false;
    this.settings = { sensitivity: 1, volume: 0.9 };
    this.events = new Events();
    this.stats = { kills: 0, deaths: 0, start: 0 };

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.info.autoReset = false;
    $('#app').appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.06);
    const c = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, innerWidth / innerHeight, c.near, c.far);
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);
    this.scene.add(this.camera);

    // Fixed global lights (never added/removed, so shaders don't recompile).
    this.hemi = new THREE.HemisphereLight(0x302830, 0x100808, 0.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffb070, 0);
    this.sun.position.set(30, 20, -40);
    this.scene.add(this.sun);
    this.lights = new LightPool(this.scene, 6);

    this.input = new Input(renderer.domElement);
    this.hud = new HUD(this);
    this.audio = new SilentAudio();
    this.ready = Promise.all([
      audioReady.then((Engine) => {
        this.audio = new Engine();
      }),
      propsReady,
      creaturesReady,
    ]);
    this.inventory = new Inventory(this);
    this.player = new Player(this);
    this.weapons = new Weapons(this);
    this.fx = new PostFX(renderer, this.scene, this.camera, this.weapons.scene, this.weapons.camera);
    this.interaction = new Interaction(this);
    this.particles = new Particles(this.scene);
    this.decals = new RuntimeDecals(this.scene);
    this.pickups = new Pickups(this);
    this.enemies = new EnemyManager(this);
    this.levels = new LevelManager(this, LEVELS);
    this.sister = new Sister(this);

    this.events.on('enemyKilled', () => this.stats.kills++);
    this.events.on('gunshot', (pos) => this.enemies.noise(pos, 24));

    this.lastFrame = performance.now();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindUI();
    if (this.debug) installDebug(this);
    if (LevelManager.loadSaved()) $('#btn-continue').classList.remove('hidden');
    this.ready.then(() => {
      this.prewarmTextures();
      setTimeout(() => this.showTitleScene(), 200);
    });
    renderer.setAnimationLoop(() => this.frame());
    // Debug: keep ticking when the page is hidden (rAF stops), so automated
    // play-testing in a background tab still works.
    if (this.debug) {
      setInterval(() => {
        // Catch up in fixed steps so game time keeps pace with real time.
        let behind = Math.min(0.25, (performance.now() - this.lastFrame) / 1000);
        if (behind < 0.06) return;
        while (behind > 0.05) {
          this.lastFrame = performance.now() - (behind - 0.05) * 1000;
          this.frame(0.05, behind > 0.1);
          behind -= 0.05;
        }
      }, 30);
    }
  }

  setFlag(name) {
    this.flags.add(name);
  }

  // The field at dusk behind the title: a slow drift down the track toward the cabin.
  showTitleScene() {
    if (this.state !== 'title' || this.levels.current) return;
    try {
      const level = this.levels.get('field');
      this.levels.activate(level, 'start');
      this.titleTime = 0;
      this.fx.fade = 1;
      this.fx.fadeTo(0, 0.4);
    } catch (e) {
      console.warn('[title] backdrop unavailable:', e.message);
    }
  }

  updateTitleScene(dt) {
    this.titleTime += dt;
    const k = (this.titleTime % 90) / 90;
    const p = this.player.position;
    p.set(17 - k * 9, 0, 64 - k * 36);
    const g = this.levels.current.physics.groundAt(p.x, p.z, 50);
    if (g.y > -Infinity) p.y = g.y;
    this.camera.position.set(p.x, p.y + 1.7 + Math.sin(this.titleTime * 0.4) * 0.08, p.z);
    this.camera.lookAt(0, 2.2, 0);
    this.camera.updateMatrixWorld();
    this.levels.update(dt, this.time);
    this.lights.update(this.camera.position, this.time, dt);
  }

  // Generate textures a few at a time while the title screen is up, so the
  // first level loads quickly.
  prewarmTextures() {
    // Generate, then upload to the GPU, so the first room doesn't hitch.
    const upload = (m) => {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[key]) this.renderer.initTexture(m[key]);
    };
    const jobs = [
      ...Materials.MATERIAL_NAMES.map((n) => () => upload(Materials.getMaterial(n))),
      ...(Materials.DECAL_KINDS || []).map((k) => () => upload(Materials.getDecalMaterial(k))),
    ];
    const step = () => {
      if (!jobs.length) return;
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 12) jobs.shift()();
      setTimeout(step, 16);
    };
    setTimeout(step, 300);
  }

  bindUI() {
    $('#btn-start').addEventListener('click', () => this.start());
    $('#btn-continue').addEventListener('click', () => this.continueSaved());
    $('#btn-resume').addEventListener('click', () => this.resume());
    $('#btn-checkpoint').addEventListener('click', () => this.retry());
    $('#btn-quit').addEventListener('click', () => this.quitToTitle());
    $('#btn-dead-quit').addEventListener('click', () => this.quitToTitle());
    $('#btn-retry').addEventListener('click', () => this.retry());
    $('#btn-again').addEventListener('click', () => {
      LevelManager.clearSaved();
      location.href = location.pathname + (this.debug ? '?debug' : '');
    });
    $('#sens').addEventListener('input', (e) => (this.settings.sensitivity = +e.target.value));
    $('#vol').addEventListener('input', (e) => {
      this.settings.volume = +e.target.value;
      this.audio.setVolume(this.settings.volume);
    });
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused' && performance.now() - this.pausedAt > 300) this.resume();
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
    });
  }

  resetRun() {
    this.flags = new Set();
    this.inventory.reset();
    this.player.reset();
    this.weapons.reset();
    this.hud.setHealth(1);
    this.hud.setItems([]);
    this.weapons.updateHud();
    this.hud.clearMessages();
    this.levels.disposeAll();
    this.levels.visited.clear();
    this.stats = { kills: 0, deaths: 0, start: this.time };
  }

  beginPlay() {
    this.audio.init(this.listener);
    this.audio.setVolume(this.settings.volume);
    this.input.requestLock();
    this.hud.screen(null);
    this.hud.show();
    this.state = 'playing';
  }

  // New game (or a debug start at ?level=<id>).
  async start({ level = this.params.get('level'), spawn } = {}) {
    await this.ready;
    this.resetRun();
    this.beginPlay();
    const id = level ? this.levels.resolve(level) : 'field';
    if (id && id !== 'field') {
      // Debug start: hand over what you'd have by this point.
      this.levels.byId[id].prepare?.(this);
    }
    await this.levels.goTo(id || 'field', spawn || 'start');
  }

  async continueSaved() {
    const cp = LevelManager.loadSaved();
    if (!cp) return this.start();
    await this.ready;
    this.resetRun();
    for (const v of cp.visited || []) this.levels.visited.add(v);
    this.beginPlay();
    await this.levels.restartFromCheckpoint(cp);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = performance.now();
    this.hud.screen('pause');
    this.input.releaseLock();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.screen(null);
    this.input.requestLock();
  }

  async retry() {
    this.hud.screen(null);
    this.hud.clearMessages();
    this.state = 'playing';
    this.input.requestLock();
    await this.levels.restartFromCheckpoint();
  }

  quitToTitle() {
    this.state = 'title';
    this.levels.disposeAll();
    this.audio.setZone(null);
    this.audio.setDread(0);
    this.hud.hide();
    this.hud.screen('title');
    if (LevelManager.loadSaved()) $('#btn-continue').classList.remove('hidden');
    this.input.releaseLock();
    this.flags = new Set();
    this.showTitleScene();
  }

  onPlayerDeath(cause) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.stats.deaths++;
    this.player.frozen = true;
    this.audio.play('death');
    this.audio.setDread(0);
    this.fx.fadeTo(1, 0.6);
    const text = DEATH_TEXT[cause === 'drowned' ? 'drowned_water' : cause] || DEATH_TEXT.default;
    setTimeout(() => {
      $('#death-text').textContent = text;
      this.hud.screen('dead');
      this.input.releaseLock();
    }, 1600);
  }

  // Called by the field (dawn) when you walk out with your sister.
  finish() {
    if (this.state === 'ending') return;
    this.state = 'ending';
    this.player.frozen = true;
    this.fx.fadeTo(1, 0.35, 0xf4e6d0);
    LevelManager.clearSaved();
    const mins = Math.max(1, Math.round((this.time - this.stats.start) / 60));
    setTimeout(() => {
      $('#end-text').textContent = 'The sun comes up over the field. Behind you the cabin is only a small cabin again, and the water has gone quiet. Your sister does not let go of your hand.';
      $('#end-stats').textContent = `${mins} min · ${this.stats.kills} killed · ${this.stats.deaths} deaths`;
      this.hud.hide();
      this.hud.screen('end');
      this.input.releaseLock();
      this.audio.setZone('dawn');
    }, 3200);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const pr = Math.min(devicePixelRatio, 1.25);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setSize(w, h, pr);
  }

  frame(fixedDt = null, skipRender = false) {
    const now = performance.now();
    const dt = fixedDt ?? Math.min((now - this.lastFrame) / 1000, 1 / 20);
    if (fixedDt === null) this.lastFrame = now;
    this.renderer.info.reset();
    const playing = this.state === 'playing' || this.state === 'dead' || this.state === 'ending';
    if (playing && this.levels.current) {
      this.time += dt;
      this.player.update(dt);
      this.weapons.update(dt);
      this.interaction.update();
      this.levels.update(dt, this.time);
      this.enemies.update(dt);
      this.sister.update(dt);
      this.particles.update(dt);
      this.lights.pulse = pulseAt(this.time);
      this.lights.update(this.camera.position, this.time, dt);
      this.audio.update(dt, { health01: this.player.health / CONFIG.player.maxHealth });
      this.hud.update(dt);
    } else if (this.state === 'title' && this.levels.current) {
      this.time += dt;
      this.updateTitleScene(dt);
    }
    this.input.endFrame();
    this.fx.update(dt, this.time, { health01: this.state === 'title' ? 1 : this.player.health / CONFIG.player.maxHealth });
    if (skipRender) return;
    if (this.state !== 'title' || this.levels.current) this.fx.render();
    else this.renderer.clear();
    if (this.debug) updateDebug(this, dt);
  }
}

// Shared heartbeat shape (0..1) for flesh lights: lub-dub at ~58 bpm.
function pulseAt(t) {
  const beat = (t * 58) / 60;
  const ph = beat - Math.floor(beat);
  return Math.max(Math.exp(-ph * 14), 0.7 * Math.exp(-Math.max(0, ph - 0.27) * 14) * (ph > 0.27 ? 1 : 0));
}

const game = new Game();
if (!game.debug) window.__tithe = game;
