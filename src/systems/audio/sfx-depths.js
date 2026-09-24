// Ported 1:1 from prototypes/audio-sets.html's Liturgy/Undertow/Viscera/Dread
// recipes. Every function takes (H, dest, pos, gain, ...) where H is the
// helpers bag from core.js, dest is the bus to render into (sfxBus, a music
// bed bus or a loop bus) and pos is {x,y,z} or null for non-positional.

export function bell(H, dest, pos, gain = 1, f = 73.42) {
  const t = H.now();
  const o = H.out(dest, 0.6, 0.5 * gain, 12, pos);
  [
    [0.5, 1, 7], [1, 0.8, 6], [1.19, 0.5, 4], [1.56, 0.35, 3.5],
    [2, 0.4, 3], [2.51, 0.25, 2.2], [3.01, 0.2, 1.8], [4.1, 0.12, 1.2],
  ].forEach(([r, a, dc]) => H.tone(o, 'sine', f * r * 2, t, 0.004, a * 0.3, dc));
}

export function chant(H, dest, pos, gain = 1, base = 98, dur = 3.4) {
  const t = H.now();
  const o = H.out(dest, 0.7, 0.5 * gain, dur + 6, pos);
  const e = H.G(0);
  e.connect(o);
  H.env(e.gain, t, 0.4, 1, 1, dur - 1.4);
  const m = H.G(1);
  const fs = H.formant(m, e, H.V.o);
  'oaouao'.split('').forEach((v, i) => H.vowel(fs, H.V[v], t + 0.3 + (i * dur) / 6));
  [1, 1.004, 1.5, 0.5, 0.998].forEach((r, i) => {
    const s = H.O('sawtooth', base * r);
    const vib = H.O('sine', 5 + i * 0.3);
    const vg = H.G(base * r * 0.012);
    H.chain(vib, vg, s.frequency);
    s.connect(m);
    H.play(s, t, dur + 0.2);
    H.play(vib, t, dur + 0.2);
  });
}

// Shared by acolyteScream (480 Hz, clean) and skinlessScream (720 Hz, distorted).
export function scream(H, dest, pos, f, gain, dur, distort) {
  const t = H.now();
  const o = H.out(dest, 0.45, gain, dur + 6, pos);
  const e = H.G(0);
  e.connect(o);
  H.env(e.gain, t, 0.04, 1, dur * 0.55, dur * 0.3);
  const m = H.G(1);
  const z = H.Dz();
  m.connect(z);
  const fs = H.formant(distort ? z : m, e, H.V.a);
  H.vowel(fs, H.V.i, t + dur * 0.6);
  [1, 1.013, 0.991, 1.49].forEach((r) => {
    const s = H.O('sawtooth', f * r * 0.8);
    s.frequency.setValueAtTime(f * r * 0.8, t);
    s.frequency.exponentialRampToValueAtTime(f * r * 1.18, t + 0.14);
    s.frequency.exponentialRampToValueAtTime(f * r * 0.55, t + dur);
    const vib = H.O('sine', H.rnd(6, 8));
    const vg = H.G(f * 0.035);
    H.chain(vib, vg, s.frequency);
    s.connect(m);
    H.play(s, t, dur + 0.1);
    H.play(vib, t, dur + 0.1);
  });
  H.nz(o, H.white, 'highpass', 2500, 0.7, t, 0.03, 0.15, dur * 0.8);
}

// Shared by revolver (chapel reverb send varies by zone) and other gunshots.
export function shot(H, dest, pos, gain, wet, lp, tail) {
  const t = H.now();
  const o = H.out(dest, wet, gain, tail + 4, pos);
  H.nz(o, H.white, 'lowpass', lp, 0.7, t, 0.001, 1, tail);
  H.tone(o, 'sine', 150, t, 0.002, 1.2, 0.28, 0, 36, 0.2);
  H.nz(o, H.white, 'highpass', 3000, 0.7, t, 0.0005, 0.6, 0.03);
}

export function ignite(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.6, 0.6 * gain, 10, pos);
  const x = H.nz(o, H.white, 'bandpass', 200, 2, t, 0.7, 0.6, 0.6, 0.2);
  x.frequency.setValueAtTime(200, t);
  x.frequency.exponentialRampToValueAtTime(3200, t + 1.1);
  H.nz(o, H.brown, 'lowpass', 140, 1, t, 0.3, 1.2, 1.4, 0.4);
  for (let i = 0; i < 14; i++) H.nz(o, H.white, 'highpass', 2500, 1, t + 0.4 + Math.random() * 1.4, 0.001, H.rnd(0.1, 0.4), 0.02);
}

export function drip(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.85, 0.35 * gain, 4, pos);
  const f = H.rnd(900, 1900);
  H.tone(o, 'sine', f, t, 0.002, 1, 0.12, 0, f * 0.45, 0.06);
}

export function splash(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.35, 0.7 * gain, 4, pos);
  for (let i = 0; i < 4; i++) {
    const s = t + i * H.rnd(0.18, 0.28);
    const x = H.nz(o, H.brown, 'bandpass', 800, 1.2, s, 0.03, H.rnd(0.6, 1), 0.35);
    x.frequency.setValueAtTime(H.rnd(900, 1300), s);
    x.frequency.exponentialRampToValueAtTime(300, s + 0.35);
    H.nz(o, H.white, 'bandpass', H.rnd(2500, 4000), 2, s + 0.02, 0.01, 0.12, 0.2);
  }
}

export function gurgle(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.5, 0.8 * gain, 6, pos);
  const dur = 1.8;
  const x = H.nz(o, H.brown, 'bandpass', 400, 7, t, 0.2, 1.4, 0.6, dur - 0.8);
  for (let k = 0; k < dur / 0.05; k++) x.frequency.setValueAtTime(H.rnd(180, 750), t + k * 0.05);
  const s = H.O('sawtooth', 72);
  const am = H.G(0.5);
  const e = H.G(0);
  const lp = H.F('lowpass', 500);
  const q = H.O('square', 9);
  const qg = H.G(0.5);
  H.chain(q, qg, am.gain);
  H.chain(s, am, lp, e, o);
  H.env(e.gain, t, 0.2, 0.5, 0.6, dur - 0.8);
  s.frequency.setValueAtTime(72, t);
  s.frequency.linearRampToValueAtTime(55, t + dur);
  H.play(s, t, dur + 0.1);
  H.play(q, t, dur + 0.1);
}

export function lamprey(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.5, 0.35 * gain, 5, pos);
  const dur = 1.1;
  const c = H.O('sawtooth', 1500);
  const m = H.O('sine', 310);
  const mg = H.G(700);
  const bp = H.F('bandpass', 2200, 2.5);
  const e = H.G(0);
  const tr = H.O('square', 28);
  const tg = H.G(0.4);
  const am = H.G(0.6);
  H.chain(m, mg, c.frequency);
  H.chain(tr, tg, am.gain);
  H.chain(c, bp, am, e, o);
  c.frequency.setValueAtTime(1500, t);
  c.frequency.exponentialRampToValueAtTime(650, t + dur);
  H.env(e.gain, t, 0.02, 1, 0.5, dur - 0.5);
  [c, m, tr].forEach((s) => H.play(s, t, dur + 0.1));
}

// The submerged/muffled shotgun.
export function boom(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.9, gain, 12, pos);
  H.nz(o, H.brown, 'lowpass', 260, 1, t, 0.004, 1.6, 1.3);
  H.tone(o, 'sine', 90, t, 0.003, 1.2, 0.9, 0, 24, 0.6);
  H.nz(o, H.white, 'lowpass', 900, 1, t + 0.02, 0.01, 0.3, 0.25);
}

export function heart(H, dest, pos, gain = 1, t = H.now()) {
  const o = H.out(dest, 0.15, gain, 3, pos);
  H.tone(o, 'sine', 62, t, 0.006, 1, 0.2, 0, 30, 0.14);
  H.tone(o, 'sine', 55, t + 0.28, 0.006, 0.65, 0.24, 0, 28, 0.16);
}

export function squelch(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.7 * gain, 3, pos);
  const x = H.nz(o, H.brown, 'lowpass', 2600, 14, t, 0.01, 1.4, 0.35);
  x.frequency.setValueAtTime(2600, t);
  x.frequency.exponentialRampToValueAtTime(180, t + 0.3);
  H.tone(o, 'sine', 200, t, 0.01, 0.5, 0.25, 0, 60, 0.25);
  for (let i = 0; i < 5; i++) H.nz(o, H.white, 'bandpass', H.rnd(800, 2400), 6, t + H.rnd(0, 0.3), 0.002, H.rnd(0.2, 0.5), 0.03);
}

export function crack(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.35, 0.9 * gain, 3, pos);
  for (let i = 0; i < 6; i++) H.nz(o, H.white, 'highpass', H.rnd(1200, 2600), 1, t + H.rnd(0, 0.16), 0.0008, H.rnd(0.5, 1), H.rnd(0.01, 0.03));
  H.tone(o, 'sine', 110, t, 0.002, 0.7, 0.12, 0, 50);
}

export function chomp(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.4, gain, 3, pos);
  H.nz(o, H.brown, 'lowpass', 600, 4, t, 0.15, 0.8, 0.05);
  H.tone(o, 'sine', 95, t + 0.18, 0.002, 1.3, 0.25, 0, 38, 0.2);
  H.nz(o, H.white, 'highpass', 2000, 1, t + 0.18, 0.001, 0.8, 0.05);
  setTimeout(() => squelch(H, dest, pos, 0.4 * gain), 260);
}

export function snarl(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.35, 0.7 * gain, 3, pos);
  const dur = 1.3;
  const s = H.O('sawtooth', 80);
  const am = H.G(0.5);
  const q = H.O('square', 32);
  const qg = H.G(0.5);
  const lp = H.F('lowpass', 900, 2);
  const bp = H.F('bandpass', 420, 3);
  const e = H.G(0);
  H.chain(q, qg, am.gain);
  H.chain(s, am, lp, e, o);
  lp.connect(bp);
  bp.connect(e);
  s.frequency.setValueAtTime(70, t);
  s.frequency.linearRampToValueAtTime(130, t + 0.5);
  s.frequency.linearRampToValueAtTime(90, t + dur);
  H.env(e.gain, t, 0.08, 1, 0.4, dur - 0.5);
  H.play(s, t, dur + 0.1);
  H.play(q, t, dur + 0.1);
  H.nz(o, H.brown, 'bandpass', 900, 1, t, 0.1, 0.5, 0.4, dur - 0.5);
}

export function flicker(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.5 * gain, 3, pos);
  const dur = 1.8;
  const s = H.O('sawtooth', 120);
  const bp = H.F('bandpass', 240, 2);
  const e = H.G(0);
  H.chain(s, bp, e, o);
  let on = false;
  e.gain.setValueAtTime(0, t);
  for (let k = 0; k < dur / 0.04; k++) {
    const v = Math.random() < 0.55;
    if (v !== on) {
      on = v;
      e.gain.setValueAtTime(v ? 0.6 : 0, t + k * 0.04);
      H.nz(o, H.white, 'highpass', 3000, 1, t + k * 0.04, 0.0005, 0.25, 0.01);
    }
  }
  e.gain.setValueAtTime(0, t + dur);
  H.play(s, t, dur + 0.05);
}

export function staticBurst(H, dest, pos, gain = 1, dur = 0.6) {
  const t = H.now();
  const o = H.out(dest, 0.15, 0.35 * gain, dur + 3, pos);
  const x = H.F('bandpass', H.rnd(1500, 3200), 0.6);
  const e = H.G(0);
  const n = H.N(H.white);
  H.chain(n, x, e, o);
  e.gain.setValueAtTime(0, t);
  for (let k = 0; k < dur / 0.025; k++) e.gain.setValueAtTime(Math.random() < 0.7 ? H.rnd(0.4, 1) : 0, t + k * 0.025);
  e.gain.setValueAtTime(0, t + dur);
  H.play(n, t, dur + 0.05);
  H.tone(o, 'sine', H.rnd(900, 1400), t, 0.01, 0.06, 0.05, dur - 0.06);
}

export function braam(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.6, 0.6 * gain, 10, pos);
  const z = H.Dz();
  const lp = H.F('lowpass', 200, 4);
  const e = H.G(0);
  H.chain(z, lp, e, o);
  lp.frequency.setValueAtTime(200, t);
  lp.frequency.exponentialRampToValueAtTime(1800, t + 0.5);
  lp.frequency.exponentialRampToValueAtTime(300, t + 3);
  H.env(e.gain, t, 0.12, 1, 1.6, 1.2);
  [43.65, 43.9, 87.3, 51.9, 103.8].forEach((f) => {
    const s = H.O('sawtooth', f);
    s.connect(z);
    H.play(s, t, 3.2);
  });
}

export function screech(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.6, 0.28 * gain, 4, pos);
  const bp = H.F('bandpass', 2400, 1.4);
  const e = H.G(0);
  H.chain(bp, e, o);
  H.env(e.gain, t, 0.03, 1, 0.9, 0.7);
  [1760, 1790, 1865].forEach((f) => {
    const s = H.O('sawtooth', f);
    s.frequency.setValueAtTime(f, t);
    s.frequency.linearRampToValueAtTime(f * 1.06, t + 1.4);
    const vib = H.O('sine', 9);
    const vg = H.G(28);
    H.chain(vib, vg, s.frequency);
    s.connect(bp);
    H.play(s, t, 1.8);
    H.play(vib, t, 1.8);
  });
  H.nz(o, H.white, 'bandpass', 3200, 3, t, 0.03, 0.15, 0.9, 0.7);
}

export function rush(H, dest, pos, gain = 1) {
  let t = H.now();
  for (let i = 0; i < 10; i++) {
    heart(H, dest, pos, (0.4 + i * 0.07) * gain, t);
    t += Math.max(0.34, 0.95 - i * 0.07);
  }
}

// Stick-slip friction: a sawtooth whose pitch jitters every 30 ms, ending in a thunk.
export function creak(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.35, 0.7 * gain, 4, pos);
  const dur = 1.7;
  const s = H.O('sawtooth', 110);
  const b1 = H.F('bandpass', 700, 4);
  const b2 = H.F('bandpass', 1500, 6);
  const e = H.G(0);
  s.connect(b1);
  s.connect(b2);
  b1.connect(e);
  b2.connect(e);
  e.connect(o);
  for (let k = 0; k < dur / 0.03; k++) s.frequency.setValueAtTime(H.rnd(70, 95) + k * 1.4, t + k * 0.03);
  H.env(e.gain, t, 0.1, 1, 0.3, dur - 0.4);
  H.play(s, t, dur + 0.05);
  setTimeout(() => H.tone(o, 'sine', 80, H.now(), 0.003, 0.8 * gain, 0.3, 0, 45), dur * 1000);
}

export function stinger(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.6, 0.8 * gain, 10, pos);
  const hp = H.F('highpass', 1800);
  const e = H.G(0);
  const n = H.N(H.white);
  H.chain(n, hp, e, o);
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(0.7, t + 1.4);
  e.gain.setValueAtTime(0, t + 1.41);
  H.play(n, t, 1.5);
  setTimeout(() => {
    braam(H, dest, pos, 0.5 * gain);
    screech(H, dest, pos, gain);
  }, 1400);
}

export function thump(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.5, 0.5 * gain, 3, pos);
  H.tone(o, 'sine', 70, t, 0.004, 1, 1.2, 0, 52, 0.4);
  H.nz(o, H.brown, 'lowpass', 180, 1, t, 0.004, 0.6, 0.6);
}

// Public play() names -> recipes above.
export const DEPTHS_SFX = {
  bell,
  chant,
  acolyteScream: (H, dest, pos, gain = 1) => scream(H, dest, pos, 480, 0.3 * gain, 1.2, false),
  revolver: (H, dest, pos, gain = 1) => shot(H, dest, pos, 0.8 * gain, H.engine.zone === 'liturgy' ? 0.9 : 0.5, 5000, 0.35),
  ignite,
  flicker,
  drip,
  splash,
  gurgle,
  lamprey,
  boom,
  squelch,
  crack,
  skinlessScream: (H, dest, pos, gain = 1) => scream(H, dest, pos, 720, 0.3 * gain, 1.4, true),
  chomp,
  snarl,
  braam,
  screech,
  rush,
  creak,
  stinger,
  heart,
  thump,
  staticBurst,
};
