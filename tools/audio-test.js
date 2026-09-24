// Manual + automated test harness for src/systems/audio.js. Builds a button
// for every one-shot, loop, zone and control, and exposes
// window.runAudioSelfTest() to exercise the whole API in one pass.
import * as THREE from 'three';
import { AudioEngine } from '../src/systems/audio.js';

const ONE_SHOTS = [
  // sfx-depths.js
  'bell', 'chant', 'acolyteScream', 'revolver', 'ignite', 'flicker', 'drip', 'splash',
  'gurgle', 'lamprey', 'boom', 'squelch', 'crack', 'skinlessScream', 'chomp', 'snarl',
  'braam', 'screech', 'rush', 'creak', 'stinger', 'heart', 'thump', 'staticBurst',
  // sfx-weapons.js
  'knifeSwing', 'knifeHit', 'knifeWall', 'shotgun', 'dryFire', 'revolverReload',
  'shotgunReload', 'weaponSwitch', 'bulletHit', 'ricochet', 'pickup', 'ammo', 'keyItem',
  'bandage', 'hurt', 'death', 'phoneBuzz', 'doorOpen', 'doorLocked', 'doorSlam', 'bookshelf',
  // sfx-world.js
  'fuse', 'valve', 'grate', 'ropeCut', 'waterRise', 'flood', 'collapse', 'mirrorScare',
  'sisterSob', 'enemyDie', 'houndBite', 'drownedRise', 'mawLunge', 'bossRoar', 'bossLash',
  'bossSpit', 'splat', 'chains', 'bossRise', 'bossHurt', 'bossDeath',
];
const LOOP_NAMES = ['bulbBuzz', 'candle', 'chantLoop', 'waterFlow', 'dripping', 'fleshBreath', 'mawBreath', 'phoneRing', 'floodRush'];
const ZONES = ['field', 'liturgy', 'undertow', 'viscera', 'boss', 'escape', 'dawn', null];
const SURFACES = ['grass', 'wood', 'stone', 'dirt', 'water', 'flesh', 'metal'];

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
const listener = new THREE.AudioListener();
camera.add(listener);

const audio = new AudioEngine();
let started = false;

const logEl = document.getElementById('log');
function log(msg, cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// Catch anything that slips past the engine's own try/catch, e.g. a bug in a
// setTimeout-scheduled tail of a composite sound.
window.addEventListener('error', (e) => log(`window error: ${e.message}`, 'err'));
window.addEventListener('unhandledrejection', (e) => log(`unhandled rejection: ${e.reason}`, 'err'));

function ensureStarted() {
  if (started) return;
  started = true;
  audio.init(listener);
  audio.setVolume(document.getElementById('vol').value / 100);
  document.getElementById('status').textContent = 'audio ready';
  log('audio.init() called');
}

document.getElementById('start').addEventListener('click', ensureStarted);
document.body.addEventListener('click', ensureStarted, { once: true });
document.getElementById('vol').addEventListener('input', (e) => audio.setVolume(e.target.value / 100));
document.getElementById('dread').addEventListener('input', (e) => audio.setDread(e.target.value / 100));
document.getElementById('bosshp').addEventListener('input', (e) => audio.setBossHealth(e.target.value / 100));

let underwater = false;
const uwBtn = document.getElementById('underwater');
uwBtn.addEventListener('click', () => {
  underwater = !underwater;
  audio.setUnderwater(underwater);
  uwBtn.textContent = `Underwater: ${underwater ? 'on' : 'off'}`;
  uwBtn.classList.toggle('on', underwater);
});

function makeButton(container, label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => {
    ensureStarted();
    try { onClick(); } catch (e) { log(`${label} threw: ${e.message}`, 'err'); }
  });
  container.appendChild(b);
  return b;
}

const zonesEl = document.getElementById('zones');
ZONES.forEach((z) => makeButton(zonesEl, z || 'none', () => { audio.setZone(z); log(`setZone(${z})`); }));

const oneEl = document.getElementById('oneshots');
ONE_SHOTS.forEach((name) => makeButton(oneEl, name, () => { audio.play(name); log(`play('${name}')`); }));

const footEl = document.getElementById('footsteps');
SURFACES.forEach((s) => makeButton(footEl, s, () => { audio.footstep(s); log(`footstep('${s}')`); }));

const posEl = document.getElementById('posTest');
const POS = { left: { x: -8, y: 0, z: 0 }, right: { x: 8, y: 0, z: 0 }, behind: { x: 0, y: 0, z: 8 } };
Object.entries(POS).forEach(([label, pos]) => makeButton(posEl, label, () => { audio.play('drip', { pos }); log(`play('drip', pos=${label})`); }));

const loopsEl = document.getElementById('loops');
const activeLoops = new Map();
LOOP_NAMES.forEach((name) => {
  const b = makeButton(loopsEl, name, () => {
    if (activeLoops.has(name)) {
      activeLoops.get(name).stop();
      activeLoops.delete(name);
      b.classList.remove('on');
      log(`loop('${name}').stop()`);
    } else {
      activeLoops.set(name, audio.loop(name));
      b.classList.add('on');
      log(`loop('${name}') started`);
    }
  });
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Exercises every name/zone/control programmatically; returns { ok, errors, warnings }.
window.runAudioSelfTest = async function runAudioSelfTest() {
  ensureStarted();
  const errors = [];
  const warnings = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...a) => { errors.push(a.join(' ')); origError(...a); };
  console.warn = (...a) => { warnings.push(a.join(' ')); origWarn(...a); };
  try {
    for (const name of ONE_SHOTS) {
      audio.play(name);
      audio.play(name, { pos: { x: 3, y: 1, z: -2 }, gain: 0.5 });
    }
    for (const s of SURFACES) audio.footstep(s, { intensity: 0.8 });
    for (const z of ZONES) {
      audio.setZone(z, 0.1);
      await wait(20);
    }
    for (const name of LOOP_NAMES) {
      const h = audio.loop(name, { pos: { x: 1, y: 0, z: 1 } });
      h.setGain(0.5, 0.05);
      h.setPos({ x: 2, y: 0, z: 2 });
      await wait(20);
      h.stop(0.05);
    }
    for (let v = 0; v <= 1; v += 0.25) audio.setDread(v);
    await wait(20);
    audio.setDread(0);
    for (let v = 0; v <= 1; v += 0.25) audio.setBossHealth(v);
    audio.setUnderwater(true);
    audio.setUnderwater(false);
    for (let i = 0; i < 5; i++) audio.update(0.016, { health01: 0.1 });
    audio.play('doesNotExist');
    audio.loop('doesNotExist');
    audio.footstep('doesNotExist');
  } catch (e) {
    errors.push(`threw: ${e.message}`);
  }
  await wait(400);
  console.error = origError;
  console.warn = origWarn;
  const result = { ok: errors.length === 0, errors, warnings };
  log(`self-test: ${result.ok ? 'PASS' : 'FAIL'} (${errors.length} errors, ${warnings.length} warnings)`, result.ok ? 'ok' : 'err');
  return result;
};

document.getElementById('selftest').addEventListener('click', () => window.runAudioSelfTest());
