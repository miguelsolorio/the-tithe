// New gameplay one-shots: environment, puzzles, enemies and the boss. Same
// style as sfx-weapons.js — short recipes built from H, several composed
// from sfx-depths.js primitives (scream, crack, gurgle, chomp, bell, ...).
import { flicker, crack, screech, stinger, squelch, thump, chomp, gurgle, scream, bell } from './sfx-depths.js';

export function fuse(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.6 * gain, 3, pos);
  H.tone(o, 'sine', 90, t, 0.003, 0.6, 0.15, 0, 50);
  H.tone(o, 'sawtooth', 60, t + 0.2, 0.4, 0.25, 0.3, 0, 220, 1.2);
  setTimeout(() => flicker(H, dest, pos, 0.5 * gain), 1400);
}

// Rusty friction squeal (pitch jitters like creak, but higher/metallic) then a gush.
export function valve(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.35, 0.6 * gain, 4, pos);
  const dur = 1.4;
  const s = H.O('sawtooth', 300);
  const bp = H.F('bandpass', 1600, 8);
  const e = H.G(0);
  H.chain(s, bp, e, o);
  for (let k = 0; k < dur / 0.04; k++) s.frequency.setValueAtTime(H.rnd(260, 340) + k * 6, t + k * 0.04);
  H.env(e.gain, t, 0.15, 0.8, 0.3, dur - 0.5);
  H.play(s, t, dur + 0.05);
  H.nz(o, H.white, 'bandpass', 700, 1, t + dur * 0.5, 0.2, 0.7, 0.8);
}

// Metal scrape then a small inharmonic clang (mini bell hit).
export function grate(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.35, 0.6 * gain, 3, pos);
  H.nz(o, H.white, 'bandpass', 1100, 6, t, 0.05, 0.7, 0.5);
  [1, 2.4, 3.8].forEach((r) => H.tone(o, 'sine', 500 * r, t + 0.5, 0.002, 0.5 / r, 0.5));
}

export function ropeCut(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.6 * gain, 2, pos);
  for (let i = 0; i < 5; i++) H.nz(o, H.white, 'highpass', H.rnd(900, 2200), 2, t + i * H.rnd(0.03, 0.09), 0.001, H.rnd(0.4, 0.8), H.rnd(0.02, 0.05));
}

export function waterRise(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.4, 0.5 * gain, 4, pos);
  const x = H.nz(o, H.brown, 'lowpass', 200, 1, t, 0.8, 0.8, 1.2);
  x.frequency.setValueAtTime(200, t);
  x.frequency.exponentialRampToValueAtTime(900, t + 1.8);
  for (let i = 0; i < 5; i++) H.nz(o, H.white, 'bandpass', H.rnd(600, 1600), 4, t + H.rnd(0.2, 1.6), 0.002, H.rnd(0.15, 0.3), 0.06);
}

// ~4 s deep rumble under a rushing water swell.
export function flood(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.5, 0.8 * gain, 6, pos);
  H.tone(o, 'sine', 38, t, 1, 1, 2, 1);
  const x = H.nz(o, H.brown, 'bandpass', 300, 0.8, t, 1.2, 1.2, 2, 0.8);
  x.frequency.setValueAtTime(200, t);
  x.frequency.linearRampToValueAtTime(600, t + 3.5);
}

export function collapse(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.4, 0.8 * gain, 4, pos);
  H.nz(o, H.brown, 'lowpass', 220, 1, t, 0.05, 1.2, 1.4);
  for (let i = 0; i < 5; i++) setTimeout(() => crack(H, dest, pos, H.rnd(0.4, 0.8) * gain), i * H.rnd(120, 260));
}

export function mirrorScare(H, dest, pos, gain = 1) {
  screech(H, dest, pos, gain);
  stinger(H, dest, pos, gain);
}

// Soft breathy formant sob: a-to-e vowel morph over a quiet voice + breath noise.
export function sisterSob(H, dest, pos, gain = 1) {
  const t = H.now();
  const dur = 1.6;
  const o = H.out(dest, 0.6, 0.3 * gain, dur + 3, pos);
  const e = H.G(0);
  e.connect(o);
  H.env(e.gain, t, 0.3, 1, 0.5, dur - 0.8);
  const m = H.G(1);
  const fs = H.formant(m, e, H.V.a);
  H.vowel(fs, H.V.e, t + dur * 0.6);
  const s = H.O('sine', 480);
  const vib = H.O('sine', 5);
  const vg = H.G(14);
  H.chain(vib, vg, s.frequency);
  s.connect(m);
  H.play(s, t, dur + 0.1);
  H.play(vib, t, dur + 0.1);
  H.nz(o, H.white, 'bandpass', 1400, 1, t, 0.2, 0.08, 0.5);
}

export function enemyDie(H, dest, pos, gain = 1) {
  squelch(H, dest, pos, gain);
  setTimeout(() => thump(H, dest, pos, 0.6 * gain), 120);
}

export function houndBite(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.5 * gain, 1, pos);
  H.nz(o, H.white, 'highpass', 2600, 2, t, 0.001, 0.6, 0.04);
  chomp(H, dest, pos, 0.8 * gain);
}

export function drownedRise(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.4, 0.6 * gain, 3, pos);
  const x = H.nz(o, H.brown, 'bandpass', 500, 1, t, 0.1, 1, 0.6);
  x.frequency.setValueAtTime(300, t);
  x.frequency.exponentialRampToValueAtTime(900, t + 0.5);
  setTimeout(() => gurgle(H, dest, pos, 0.7 * gain), 350);
}

export function mawLunge(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.5 * gain, 2, pos);
  const x = H.nz(o, H.brown, 'bandpass', 400, 2, t, 0.3, 0.8, 0.15);
  x.frequency.setValueAtTime(900, t);
  x.frequency.exponentialRampToValueAtTime(250, t + 0.3);
  setTimeout(() => chomp(H, dest, pos, gain), 380);
}

// ~2.5 s huge low distorted formant scream plus a sub-bass growl underneath.
export function bossRoar(H, dest, pos, gain = 1) {
  scream(H, dest, pos, 140, 0.9 * gain, 2.5, true);
  const t = H.now();
  const o = H.out(dest, 0.5, 0.6 * gain, 4, pos);
  H.tone(o, 'sine', 45, t, 0.2, 1, 2, 0.3, 28);
}

export function bossLash(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.6 * gain, 2, pos);
  const x = H.nz(o, H.brown, 'bandpass', 900, 1, t, 0.03, 1, 0.3);
  x.frequency.setValueAtTime(1400, t);
  x.frequency.exponentialRampToValueAtTime(300, t + 0.3);
  setTimeout(() => crack(H, dest, pos, gain), 260);
}

export function bossSpit(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.5 * gain, 2, pos);
  const x = H.nz(o, H.white, 'bandpass', 2200, 2, t, 0.005, 0.7, 0.2);
  x.frequency.setValueAtTime(3200, t);
  x.frequency.exponentialRampToValueAtTime(800, t + 0.18);
  H.nz(o, H.brown, 'lowpass', 1200, 4, t + 0.05, 0.01, 0.5, 0.15);
}

export function splat(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.7 * gain, 1, pos);
  const x = H.nz(o, H.brown, 'lowpass', 2200, 10, t, 0.004, 1, 0.14);
  x.frequency.setValueAtTime(2200, t);
  x.frequency.exponentialRampToValueAtTime(200, t + 0.14);
}

export function chains(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.5 * gain, 2, pos);
  for (let i = 0; i < 10; i++) H.nz(o, H.white, 'bandpass', H.rnd(1400, 3200), 6, t + i * H.rnd(0.06, 0.14), 0.001, H.rnd(0.2, 0.5), 0.05);
}

export function bossRise(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.4, 0.6 * gain, 3, pos);
  const x = H.nz(o, H.brown, 'bandpass', 400, 1, t, 0.3, 1.2, 0.8);
  x.frequency.setValueAtTime(250, t);
  x.frequency.exponentialRampToValueAtTime(700, t + 1);
  setTimeout(() => bossRoar(H, dest, pos, 0.8 * gain), 500);
}

export function bossHurt(H, dest, pos, gain = 1) {
  scream(H, dest, pos, 180, 0.7 * gain, 1, true);
}

// Long descending roar, a sub-bass drop, then a distant bell toll.
export function bossDeath(H, dest, pos, gain = 1) {
  const t = H.now();
  scream(H, dest, pos, 160, gain, 3.2, true);
  const o = H.out(dest, 0.6, 0.7 * gain, 6, pos);
  H.tone(o, 'sine', 60, t + 0.3, 0.3, 1, 3, 0.5, 18);
  setTimeout(() => bell(H, dest, pos, 0.5 * gain, 55), 3400);
}

// ---- Interactive props (src/systems/props.js) ----

// Wooden legs dragged a short way across boards.
export function propScrape(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.15, 0.35 * gain, 1.5, pos);
  const x = H.nz(o, H.white, 'bandpass', H.rnd(500, 800), 3, t, 0.03, 0.8, 0.12, 0.08);
  x.frequency.setValueAtTime(x.frequency.value, t);
  x.frequency.linearRampToValueAtTime(x.frequency.value * H.rnd(0.8, 1.3), t + 0.2);
  H.nz(o, H.brown, 'lowpass', 260, 1, t, 0.02, 0.5, 0.15, 0.05);
}

// A piece of furniture landing on its side: wood clatter over a floor thump.
export function propTopple(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.35, 0.7 * gain, 3, pos);
  H.nz(o, H.white, 'bandpass', 900, 2, t, 0.001, 0.8, 0.09);
  H.tone(o, 'sine', 180, t, 0.002, 0.5, 0.12, 0, 90);
  for (let i = 0; i < 3; i++) H.nz(o, H.white, 'bandpass', H.rnd(700, 1400), 4, t + 0.06 + i * H.rnd(0.04, 0.09), 0.001, H.rnd(0.2, 0.45), 0.05);
  thump(H, dest, pos, 0.7 * gain);
}

// Knife or bullet into solid wood.
export function propHit(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.55 * gain, 1.5, pos);
  H.nz(o, H.white, 'bandpass', 1200, 2.5, t, 0.001, 0.8, 0.06);
  H.tone(o, 'triangle', 240, t, 0.001, 0.6, 0.1, 0, 140);
  H.nz(o, H.brown, 'lowpass', 300, 1, t, 0.002, 0.5, 0.12);
}

// A book slapping the floorboards.
export function bookFall(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.45 * gain, 1.2, pos);
  H.nz(o, H.white, 'lowpass', H.rnd(1400, 2400), 1, t, 0.001, 0.9, 0.07);
  H.tone(o, 'sine', H.rnd(110, 150), t, 0.001, 0.5, 0.08, 0, 70);
}

// Tin can bouncing.
export function canFall(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.35 * gain, 1.2, pos);
  [1, 2.7, 4.1].forEach((r) => H.tone(o, 'sine', 620 * r, t, 0.001, 0.4 / r, 0.12));
  H.nz(o, H.white, 'highpass', 2500, 1, t, 0.001, 0.4, 0.03);
}

// Glass jar bursting on the floor.
export function glassBreak(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.55 * gain, 2, pos);
  H.nz(o, H.white, 'highpass', 3000, 0.8, t, 0.001, 0.9, 0.18);
  for (let i = 0; i < 7; i++) H.tone(o, 'sine', H.rnd(2500, 6000), t + H.rnd(0, 0.25), 0.001, H.rnd(0.08, 0.2), H.rnd(0.05, 0.15));
  H.nz(o, H.brown, 'lowpass', 400, 1, t, 0.002, 0.4, 0.1);
}

// Furniture giving way: splintering cracks, then the pieces clattering down.
export function propBreak(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.35, 0.8 * gain, 3, pos);
  H.nz(o, H.white, 'bandpass', 1800, 1.5, t, 0.001, 1, 0.12);
  H.tone(o, 'triangle', 200, t, 0.001, 0.6, 0.15, 0, 80);
  for (let i = 0; i < 6; i++) H.nz(o, H.white, 'bandpass', H.rnd(600, 1600), 3, t + 0.1 + i * H.rnd(0.04, 0.1), 0.001, H.rnd(0.25, 0.55), 0.06);
  thump(H, dest, pos, 0.5 * gain);
}

export const WORLD_SFX = {
  propScrape, propTopple, propHit, propBreak, bookFall, canFall, glassBreak,
  fuse, valve, grate, ropeCut, waterRise, flood, collapse, mirrorScare, sisterSob,
  enemyDie, houndBite, drownedRise, mawLunge, bossRoar, bossLash, bossSpit, splat,
  chains, bossRise, bossHurt, bossDeath,
};
