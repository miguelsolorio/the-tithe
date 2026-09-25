// The Tithe: procedural Web Audio engine. Every sound is synthesized; there
// are no audio files or external URLs. Recipes are ported from
// prototypes/audio-sets.html (see docs/audio-direction.md for the mix plan)
// and split across src/systems/audio/*.js. Everything here is a no-op before
// init() and never throws, so game code can call it unconditionally.
import { buildBuses, createHelpers } from './audio/core.js';
import { DEPTHS_SFX, heart } from './audio/sfx-depths.js';
import { WEAPONS_SFX, FOOTSTEPS } from './audio/sfx-weapons.js';
import { WORLD_SFX } from './audio/sfx-world.js';
import { AMBIENT_SFX } from './audio/sfx-ambient.js';
import { MUSIC, createBed, strings } from './audio/music.js';
import { LOOPS } from './audio/loops.js';

const SFX = { ...DEPTHS_SFX, ...WEAPONS_SFX, ...WORLD_SFX, ...AMBIENT_SFX };

// Reverb return level per zone (dry field -> big chapel -> long wet cistern
// -> shorter wet caves), crossfaded alongside the bed on setZone().
const ZONE_REVERB = {
  field: 0.15, liturgy: 0.85, undertow: 0.65, viscera: 0.35,
  boss: 0.8, escape: 0.3, dawn: 0.25,
};

// Positional sounds the player causes; these stay at full level on the sfxBus
// rather than following setWorldLevel.
const PLAYER_SFX = new Set(['ricochet', 'knifeHit', 'knifeWall', 'bulletHit', 'doorOpen', 'doorLocked']);

const DUMMY_LOOP = { setPos() {}, setGain() {}, stop() {} };

export class AudioEngine {
  constructor() {
    this.ready = false;
    this.zone = null;
    this._volume = 0.9;
    this._voiceCount = 0;
    this._warned = new Set();
    this._heartT = 0;
    this._bossBpm = 58;
    this._bed = null;
    this._bedLevel = 1;
    this._worldLevel = 1;
    this._dread = null;
    this._dreadStopTimer = null;
  }

  // listener: THREE.AudioListener on the camera. Safe to call again (resumes).
  init(listener) {
    if (this.ready) {
      this.ctx.resume();
      return;
    }
    this.listener = listener;
    const ctx = listener.context;
    this.ctx = ctx;
    buildBuses(this, ctx);
    this.worldBus.gain.value = this.worldSend.gain.value = this._worldLevel;
    this.master.connect(listener.getInput());
    this.H = createHelpers(this);
    this.ready = true;
    ctx.resume();
  }

  setVolume(v01) {
    this._volume = v01;
    if (!this.ready || this._paused) return;
    this.master.gain.setTargetAtTime(v01, this.ctx.currentTime, 0.05);
  }

  // Silences everything while the game is paused. Beds and loops keep
  // running on their timers, so this fades the master rather than suspending
  // the context, which would bunch every scheduled note on resume.
  setPaused(paused) {
    this._paused = paused;
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(paused ? 0 : this._volume, this.ctx.currentTime, 0.1);
  }

  _warnOnce(key) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`[audio] unknown sound: "${key}"`);
  }

  // pos: {x,y,z} for an HRTF one-shot, omit for non-positional (UI/global).
  // music: route to the music bus (bed-level ambience that a hushed world
  // bus shouldn't bury, e.g. wolves heard through the house walls).
  play(name, { pos, gain = 1, music = false } = {}) {
    if (!this.ready) return;
    const fn = SFX[name];
    if (!fn) { this._warnOnce(name); return; }
    const dest = music ? this.musicBus : pos && !PLAYER_SFX.has(name) ? this.worldBus : this.sfxBus;
    try { fn(this.H, dest, pos || null, gain); }
    catch (e) { console.error(`[audio] play('${name}') failed:`, e); }
  }

  // Returns { setPos(p), setGain(g, fade), stop(fade) }; a harmless dummy if not ready.
  loop(name, { pos, gain = 1 } = {}) {
    if (!this.ready) return DUMMY_LOOP;
    const fn = LOOPS[name];
    if (!fn) { this._warnOnce(name); return DUMMY_LOOP; }
    try { return fn(this, this.H, pos || null, gain); }
    catch (e) { console.error(`[audio] loop('${name}') failed:`, e); return DUMMY_LOOP; }
  }

  footstep(surface, { intensity = 1, pos } = {}) {
    if (!this.ready) return;
    const fn = FOOTSTEPS[surface];
    if (!fn) { this._warnOnce(`footstep:${surface}`); return; }
    try { fn(this.H, this.sfxBus, pos || null, intensity); }
    catch (e) { console.error(`[audio] footstep('${surface}') failed:`, e); }
  }

  // Crossfades the active music bed over `fade`s and slides the shared
  // reverb return to match the zone's space. Same zone again is a no-op.
  setZone(name, fade = 3) {
    if (!this.ready || name === this.zone) return;
    const t = this.ctx.currentTime;
    const tc = Math.max(0.05, fade / 3);
    const old = this._bed;
    this.zone = name;
    if (old) {
      old.bus.gain.setTargetAtTime(0, t, tc);
      setTimeout(() => old.kill(), fade * 1000 + 300);
    }
    this.reverbReturn.gain.setTargetAtTime(name == null ? 0.3 : (ZONE_REVERB[name] ?? 0.4), t, tc);
    if (name == null) { this._bed = null; return; }
    const build = MUSIC[name];
    if (!build) { this._warnOnce(`zone:${name}`); this._bed = null; return; }
    try {
      const L = createBed(this, this.H);
      build(this.H, L, this);
      L.bus.gain.setTargetAtTime(this._bedLevel, t, tc);
      this._bed = L;
    } catch (e) {
      console.error(`[audio] setZone('${name}') failed:`, e);
      this._bed = null;
    }
  }

  // Scales the active zone bed (0..1), e.g. to swell it as enemies get close.
  // Levels that don't drive it get 1 back on every level change.
  setZoneLevel(v01, tc = 0.5) {
    if (Math.abs(v01 - this._bedLevel) < 0.005) return;
    this._bedLevel = v01;
    if (this.ready && this._bed) this._bed.bus.gain.setTargetAtTime(v01, this.ctx.currentTime, tc);
  }

  // Scales positional world sounds (0..1); reset like setZoneLevel.
  setWorldLevel(v01, tc = 0.5) {
    if (Math.abs(v01 - this._worldLevel) < 0.005) return;
    this._worldLevel = v01;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.worldBus.gain.setTargetAtTime(v01, t, tc);
    this.worldSend.gain.setTargetAtTime(v01, t, tc);
  }

  // Called every frame with a smoothed 0..1 value; cheap when already settled.
  setDread(v01) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (v01 > 0.001) {
      if (this._dreadStopTimer) { clearTimeout(this._dreadStopTimer); this._dreadStopTimer = null; }
      if (!this._dread) {
        try {
          const L = createBed(this, this.H);
          strings(this.H, L);
          this._dread = L;
        } catch (e) { console.error('[audio] setDread failed:', e); return; }
      }
      this._dread.bus.gain.setTargetAtTime(v01, t, 0.4);
    } else if (this._dread && !this._dreadStopTimer) {
      this._dread.bus.gain.setTargetAtTime(0, t, 1.0);
      const d = this._dread;
      this._dreadStopTimer = setTimeout(() => {
        d.kill();
        if (this._dread === d) this._dread = null;
        this._dreadStopTimer = null;
      }, 3200);
    }
  }

  // 58 bpm at full health, rising to ~150 bpm near death; read by the boss bed's
  // self-rescheduling heartbeat, so the change lands within a beat.
  setBossHealth(frac01) {
    if (!this.ready) return;
    const f = Math.max(0, Math.min(1, frac01));
    this._bossBpm = 58 + (150 - 58) * (1 - f);
  }

  setUnderwater(bool) {
    if (!this.ready) return;
    this.underwaterFilter.frequency.setTargetAtTime(bool ? 700 : 22000, this.ctx.currentTime, 0.15);
  }

  // Per-frame: low-health heartbeat (never stacking, timer-gated) plus the
  // voice cap lives in H.out() so any one-shot storm is capped there.
  update(dt, { health01 = 1 } = {}) {
    if (!this.ready) return;
    try {
      if (health01 < 0.3) {
        this._heartT -= dt;
        if (this._heartT <= 0) {
          const hp = Math.max(0.05, Math.min(0.3, health01));
          this._heartT = 0.45 + ((hp - 0.05) / 0.25) * 0.55;
          heart(this.H, this.sfxBus, null, 0.8);
        }
      } else {
        this._heartT = 0;
      }
    } catch (e) { console.error('[audio] update failed:', e); }
  }
}
