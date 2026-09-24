// New gameplay one-shots: weapons, pickups, doors and player state. Same
// synthesis style as sfx-depths.js (short, punchy, built from H's helpers),
// reusing a few depths recipes (bell, creak, thump, braam, heart, splash)
// where the sound described is basically that recipe again.
import { bell, creak, thump, braam, heart, splash } from './sfx-depths.js';

export function knifeSwing(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.4 * gain, 2, pos);
  const x = H.nz(o, H.white, 'bandpass', 1800, 1.3, t, 0.02, 0.9, 0.16);
  x.frequency.setValueAtTime(2600, t);
  x.frequency.exponentialRampToValueAtTime(700, t + 0.18);
}

export function knifeHit(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.8 * gain, 2, pos);
  const x = H.nz(o, H.brown, 'lowpass', 2200, 12, t, 0.006, 1.1, 0.2);
  x.frequency.setValueAtTime(2200, t);
  x.frequency.exponentialRampToValueAtTime(200, t + 0.16);
  H.tone(o, 'sine', 160, t, 0.006, 0.4, 0.15, 0, 50);
  H.nz(o, H.white, 'highpass', 3500, 1, t, 0.001, 0.4, 0.02);
}

export function knifeWall(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.25, 0.5 * gain, 1, pos);
  H.nz(o, H.white, 'highpass', 2200, 2, t, 0.001, 0.5, 0.05);
  H.tone(o, 'sine', 130, t, 0.002, 0.3, 0.08, 0, 70);
}

// Bigger than revolver: wider crack and a deeper 120 -> 30 Hz thump.
export function shotgun(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.5, gain, 4, pos);
  H.nz(o, H.white, 'lowpass', 7000, 0.7, t, 0.001, 1.3, 0.4);
  H.tone(o, 'sine', 120, t, 0.002, 1.4, 0.4, 0, 30, 0.3);
  H.nz(o, H.brown, 'lowpass', 300, 1, t, 0.003, 1, 0.5);
  H.nz(o, H.white, 'highpass', 3000, 0.7, t, 0.0005, 0.7, 0.04);
}

export function dryFire(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.1, 0.5 * gain, 1, pos);
  H.nz(o, H.white, 'highpass', 2800, 3, t, 0.0005, 0.7, 0.03);
  H.tone(o, 'square', 900, t, 0.0005, 0.15, 0.02);
}

// ~1.6 s: cylinder swings out, six loading ticks, snaps shut.
export function revolverReload(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.15, 0.6 * gain, 3, pos);
  H.nz(o, H.white, 'bandpass', 1400, 3, t, 0.01, 0.5, 0.12);
  H.tone(o, 'square', 500, t + 0.02, 0.002, 0.2, 0.05);
  for (let i = 0; i < 6; i++) {
    const tt = t + 0.35 + i * 0.15;
    H.nz(o, H.white, 'highpass', 3200, 4, tt, 0.001, 0.35, 0.02);
    H.tone(o, 'square', 1100, tt, 0.0008, 0.12, 0.015);
  }
  const snapT = t + 1.4;
  H.nz(o, H.white, 'bandpass', 900, 2, snapT, 0.002, 0.7, 0.18);
  H.tone(o, 'sine', 180, snapT, 0.002, 0.5, 0.14, 0, 60);
}

// ~1.9 s: break open, two shells dropped in, snap shut.
export function shotgunReload(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.15, 0.6 * gain, 3, pos);
  H.nz(o, H.white, 'bandpass', 700, 2, t, 0.02, 0.6, 0.3);
  H.tone(o, 'sine', 90, t, 0.02, 0.3, 0.3);
  [0.7, 1.05].forEach((d) => {
    H.nz(o, H.white, 'highpass', 2400, 3, t + d, 0.002, 0.45, 0.06);
    H.tone(o, 'sine', 220, t + d, 0.002, 0.3, 0.08, 0, 90);
  });
  const snapT = t + 1.7;
  H.nz(o, H.white, 'bandpass', 800, 2, snapT, 0.002, 0.8, 0.2);
  H.tone(o, 'sine', 150, snapT, 0.002, 0.6, 0.16, 0, 50);
}

export function weaponSwitch(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.1, 0.4 * gain, 1, pos);
  H.nz(o, H.white, 'highpass', 2000, 2, t, 0.001, 0.4, 0.04);
  H.tone(o, 'square', 700, t + 0.08, 0.0008, 0.15, 0.03);
}

export function bulletHit(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.7 * gain, 2, pos);
  const x = H.nz(o, H.brown, 'lowpass', 2000, 10, t, 0.005, 1, 0.16);
  x.frequency.setValueAtTime(2000, t);
  x.frequency.exponentialRampToValueAtTime(150, t + 0.16);
  H.tone(o, 'sine', 140, t, 0.004, 0.4, 0.12, 0, 45);
}

export function ricochet(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.5, 0.5 * gain, 2, pos);
  const x = H.nz(o, H.white, 'bandpass', 1200, 4, t, 0.001, 0.7, 0.35);
  x.frequency.setValueAtTime(1200, t);
  x.frequency.exponentialRampToValueAtTime(4200, t + 0.3);
  [1900, 2850].forEach((f) => H.tone(o, 'sine', f, t + 0.01, 0.002, 0.25, 0.3));
}

export function pickup(H, dest, pos, gain = 1) {
  const t = H.now();
  [440, 587.3, 740].forEach((f, i) => {
    const o = H.out(dest, 0.5, 0.3 * gain, 2, pos);
    H.tone(o, 'sine', f, t + i * 0.07, 0.01, 0.5, 0.5);
  });
}

export function ammo(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.5 * gain, 1, pos);
  for (let i = 0; i < 8; i++) H.nz(o, H.white, 'bandpass', H.rnd(600, 2400), 3, t + i * H.rnd(0.02, 0.05), 0.001, H.rnd(0.2, 0.5), 0.03);
}

// Low distant bell plus a fading high shimmer.
export function keyItem(H, dest, pos, gain = 1) {
  const t = H.now();
  bell(H, dest, pos, 0.35 * gain, 55);
  const o = H.out(dest, 0.6, 0.25 * gain, 3, pos);
  [1760, 2637, 3520].forEach((f, i) => H.tone(o, 'sine', f, t + 0.1 + i * 0.05, 0.02, 0.2, 1.2));
}

export function bandage(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.25, 0.5 * gain, 2, pos);
  const x = H.nz(o, H.white, 'highpass', 800, 1.5, t, 0.01, 0.8, 0.4);
  x.frequency.setValueAtTime(800, t);
  x.frequency.exponentialRampToValueAtTime(3500, t + 0.35);
}

export function hurt(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.6 * gain, 2, pos);
  H.tone(o, 'sine', 90, t, 0.004, 0.6, 0.2, 0, 40);
  H.nz(o, H.white, 'bandpass', 1400, 1, t + 0.05, 0.02, 0.3, 0.3);
}

// Thud, a long braam, then a heartbeat that slows and stops.
export function death(H, dest, pos, gain = 1) {
  thump(H, dest, pos, gain);
  setTimeout(() => braam(H, dest, pos, 0.7 * gain), 300);
  let t = 400;
  let interval = 700;
  for (let i = 0; i < 5; i++) {
    setTimeout(() => heart(H, dest, pos, (0.5 - i * 0.08) * gain), t);
    t += interval;
    interval += 220;
  }
}

export function phoneBuzz(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.15, 0.5 * gain, 2, pos);
  [0, 0.28].forEach((d) => {
    const s = H.O('square', 165);
    const e = H.G(0);
    H.chain(s, e, o);
    H.env(e.gain, t + d, 0.01, 0.6, 0.15, 0.05);
    H.play(s, t + d, 0.25);
  });
  H.tone(o, 'sine', 1500, t + 0.65, 0.005, 0.15, 0.3, 0, 1900);
}

export function doorOpen(H, dest, pos, gain = 1) {
  creak(H, dest, pos, 0.8 * gain);
}

export function doorLocked(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.6 * gain, 2, pos);
  for (let i = 0; i < 5; i++) H.nz(o, H.white, 'bandpass', H.rnd(1200, 2600), 5, t + i * 0.06, 0.001, H.rnd(0.3, 0.6), 0.04);
  H.tone(o, 'sine', 140, t + 0.35, 0.004, 0.5, 0.2, 0, 60);
}

export function doorSlam(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.7, gain, 4, pos);
  H.nz(o, H.brown, 'lowpass', 300, 1, t, 0.002, 1.3, 0.4);
  H.tone(o, 'sine', 65, t, 0.003, 1, 0.5, 0, 32);
  H.nz(o, H.white, 'highpass', 1800, 1, t, 0.001, 0.5, 0.05);
}

// Heavy wooden scrape (a slower creak), then a thunk once it's clear.
export function bookshelf(H, dest, pos, gain = 1) {
  creak(H, dest, pos, 0.9 * gain);
  setTimeout(() => thump(H, dest, pos, 0.8 * gain), 1600);
}

export const WEAPONS_SFX = {
  knifeSwing, knifeHit, knifeWall, shotgun, dryFire, revolverReload, shotgunReload,
  weaponSwitch, bulletHit, ricochet, pickup, ammo, keyItem, bandage, hurt, death,
  phoneBuzz, doorOpen, doorLocked, doorSlam, bookshelf,
};

// footstep(surface, { intensity, pos })
function footTransient(H, dest, pos, intensity, f, q, hp, peak, release) {
  const t = H.now();
  const o = H.out(dest, 0.2, peak * intensity, 1, pos);
  H.nz(o, H.brown, 'bandpass', f, q, t, 0.002, 1, release);
  if (hp) H.nz(o, H.white, 'highpass', hp, 1, t, 0.001, 0.3 * intensity, release * 0.6);
}

export const FOOTSTEPS = {
  grass: (H, dest, pos, intensity = 1) => footTransient(H, dest, pos, intensity, 700, 1, 3200, 0.3, 0.09),
  wood: (H, dest, pos, intensity = 1) => footTransient(H, dest, pos, intensity, 350, 2, 2200, 0.35, 0.08),
  stone: (H, dest, pos, intensity = 1) => footTransient(H, dest, pos, intensity, 500, 1.5, 4000, 0.3, 0.06),
  dirt: (H, dest, pos, intensity = 1) => footTransient(H, dest, pos, intensity, 450, 0.8, 2600, 0.28, 0.1),
  metal: (H, dest, pos, intensity = 1) => footTransient(H, dest, pos, intensity, 1400, 4, 5000, 0.3, 0.12),
  flesh: (H, dest, pos, intensity = 1) => footTransient(H, dest, pos, intensity, 250, 2, null, 0.32, 0.1),
  water: (H, dest, pos, intensity = 1) => splash(H, dest, pos, 0.35 * intensity),
};
