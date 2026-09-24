import * as THREE from 'three';
import { CONFIG, LANDMARKS } from './config.js';
import { Input } from './core/input.js';
import { SpatialGrid } from './core/spatialGrid.js';
import { buildTerrain, getHeight } from './world/terrain.js';
import { buildForest } from './world/forest.js';
import { buildLandmarks } from './world/landmarks.js';
import { Atmosphere } from './world/atmosphere.js';
import { LightPool } from './world/lightPool.js';
import { Player } from './player/player.js';
import { CameraRig } from './player/cameraRig.js';
import { HUD } from './ui/hud.js';
import { AudioEngine } from './systems/audio.js';
import { PostFX } from './systems/postfx.js';
import { Interaction } from './systems/interaction.js';
import { Objectives } from './systems/objectives.js';
import { Director } from './entities/director.js';
import { updateFrustum } from './entities/entity.js';

const DEATH_TEXT = {
  wolves: 'The wolves eat well tonight.',
  wendigo: 'It was hungry. It is always hungry.',
  stalker: 'He was always right behind you.',
  sanity: 'You stopped being afraid. Then you stopped being anything at all. The forest has a new voice now.',
};

const $ = (s) => document.querySelector(s);

class Game {
  constructor() {
    this.debug = new URLSearchParams(location.search).has('debug');
    this.state = 'title';
    this.time = 0; // time spent playing
    this.realTime = 0;
    this.god = false;
    this.timer = new THREE.Timer();
    this.timer.connect(document);

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.info.autoReset = false;
    $('#app').appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    const c = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, innerWidth / innerHeight, c.near, c.far);
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);
    this.scene.add(this.camera);

    // World
    this.grid = new SpatialGrid(4);
    this.lights = new LightPool(this.scene, 4);
    buildTerrain(this.scene);
    this.forest = buildForest(this.scene, this.grid);
    this.landmarks = buildLandmarks(this.scene, this.grid, this.lights);
    this.atmosphere = new Atmosphere(this.scene);

    // Systems
    this.input = new Input(renderer.domElement);
    this.hud = new HUD(CONFIG.relicCount);
    this.audio = new AudioEngine();
    this.fx = new PostFX(renderer, this.scene, this.camera);
    this.camRig = new CameraRig(this.camera, this.grid);
    this.interaction = new Interaction(this);
    this.player = new Player(this);
    this.objectives = new Objectives(this);
    this.director = new Director(this);
    this.director.init();

    this.frames = 0;
    this.fpsTime = 0;
    this.pausedAt = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindUI();
    if (this.debug) this.exposeDebug();
    renderer.setAnimationLoop(() => this.frame());
  }

  bindUI() {
    $('#btn-start').addEventListener('click', () => this.start());
    $('#btn-resume').addEventListener('click', () => this.resume());
    for (const id of ['#btn-restart', '#btn-retry', '#btn-again']) {
      $(id).addEventListener('click', () => location.reload());
    }
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused' && performance.now() - this.pausedAt > 400) this.resume();
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
    });
  }

  start() {
    this.audio.init(this.listener);
    this.audio.setFirePosition(this.landmarks.campfirePos);
    this.input.requestLock();
    this.hud.screen(null);
    this.hud.show();
    this.hud.setRelics(0);
    this.state = 'playing';
    this.camRig.yaw = Math.PI;
    this.camRig.pitch = -0.2;
    this.fx.fade = 1;
    this.fx.fadeTarget = 0;
    this.hud.say('', "The engine won't turn over. No signal on your phone.", 3.5);
    this.hud.say('', 'Through the trees ahead: the orange flicker of a campfire.', 4);
    setTimeout(() => this.state === 'playing' && this.hud.notice('Find the fire.', 3), 8000);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = performance.now();
    this.input.releaseLock();
    this.hud.screen('pause');
    this.audio.ctx?.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.screen(null);
    this.audio.ctx?.resume();
    this.input.requestLock();
  }

  onPlayerDeath(cause) {
    this.state = 'dead';
    this.hud.clearDialogue();
    this.hud.setPrompt('');
    this.audio.sting(1);
    this.camRig.shake(0.8);
    setTimeout(() => (this.fx.fadeTarget = 0.85), 900);
    setTimeout(() => {
      this.input.releaseLock();
      $('#death-text').textContent = DEATH_TEXT[cause] || 'Something dragged you into the dark.';
      this.hud.hide();
      this.hud.screen('dead');
    }, 2200);
  }

  onWin() {
    this.state = 'won';
    this.hud.clearDialogue();
    this.hud.setPrompt('');
    // One last look: he's standing at the gate behind you.
    const st = this.director.stalker;
    const G = LANDMARKS.gate;
    st.group.position.set(G.x, getHeight(G.x, G.z), G.z + 1.5);
    st.group.rotation.y = Math.PI;
    st.group.visible = true;
    st.active = false;
    this.fx.fadeTarget = 1;
    this.audio.boom(0.8);
    const mins = Math.floor(this.time / 60);
    const secs = Math.floor(this.time % 60)
      .toString()
      .padStart(2, '0');
    setTimeout(() => {
      this.input.releaseLock();
      $('#win-text').textContent = `You walk through the gate and the trees fall silent behind you. The sky is turning grey. You survived ${mins}:${secs} in Hollow Pines. But when you finally look back, a tall shape is standing in the gateway, watching you go.`;
      this.hud.hide();
      this.hud.screen('win');
    }, 3500);
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

  frame(fixedDt, render = true) {
    this.renderer.info.reset();
    this.timer.update();
    const dt = fixedDt ?? Math.min(this.timer.getDelta(), 0.05);
    this.realTime += dt;
    const pl = this.player;

    if (this.state === 'playing') {
      this.time += dt;
      this.camRig.handleInput(this.input, dt);
      pl.update(dt);
      this.camRig.update(dt, pl.position);
      pl.updateLight(dt);
      updateFrustum(this.camera);
      this.interaction.update();
      this.objectives.update(dt, this.time);
      this.director.update(dt);
    } else if (this.state === 'title') {
      this.camRig.cinematic(this.realTime, pl.position);
      this.camRig.aimPoint.set(pl.position.x - 3, pl.position.y + 0.6, pl.position.z - 22);
      pl.idlePose(dt);
      pl.updateLight(dt);
      updateFrustum(this.camera);
    } else if (this.state === 'dead') {
      this.camRig.update(dt, pl.position);
      pl.updateLight(dt);
      updateFrustum(this.camera);
      this.director.update(dt);
    } else if (this.state === 'won') {
      this.camRig.update(dt, pl.position);
      pl.updateLight(dt);
    }

    this.lights.update(pl.position, this.realTime);
    this.landmarks.update(dt, this.realTime);
    this.atmosphere.update(dt, this.realTime, this.camera, {
      position: pl.spot.position,
      dir: pl.lightDir,
      strength: pl.strength,
    });
    this.audio.update(dt, this.camera.position);
    this.fx.update(dt, this.realTime, { sanity: pl.stats.sanity, heart: this.director.heart });
    this.hud.update(dt);
    this.hud.setStats(pl.stats);
    if (render) this.fx.render();
    this.input.endFrame();

    if (this.debug) {
      this.frames++;
      this.fpsTime += dt;
      if (this.fpsTime > 0.5) {
        const info = this.renderer.info.render;
        this.hud.setFPS(`${Math.round(this.frames / this.fpsTime)} fps · ${info.calls} calls · ${this.director.entities.length} ents`);
        this.frames = 0;
        this.fpsTime = 0;
      }
    }
  }

  // ---------- Debug helpers (?debug) ----------
  exposeDebug() {
    window.game = this;
  }

  teleport(name, dx = 0, dz = 8) {
    const L = LANDMARKS[name];
    const x = L.x + dx;
    const z = L.z + dz;
    this.player.position.set(x, getHeight(x, z), z);
  }

  spawn(type) {
    return this.director.spawn(type);
  }

  setStat(name, v) {
    this.player.stats[name] = v;
  }

  giveRelics(n = 1) {
    this.objectives.relics
      .filter((r) => !r.taken)
      .slice(0, n)
      .forEach((r) => this.objectives.collect(r));
  }

  // Run the simulation forward without waiting for animation frames (testing).
  advance(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) this.frame(step, t + step >= seconds);
  }

  look(yaw, pitch = -0.08) {
    this.camRig.yaw = yaw;
    this.camRig.pitch = pitch;
  }
}

new Game();
