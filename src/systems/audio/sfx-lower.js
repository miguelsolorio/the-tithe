// Encounter sounds for the creatures below the ground floor: the drowned,
// the hanging lamprey, the mimic skinless, the breathing wall maw, the
// Mother's lullaby, the field's wolves and the wolf that stands up. Same (H, dest, pos, gain)
// signature as sfx-depths.js; a few take one extra argument (a duration),
// passed through audio.play(name, { arg }).
import { scream, crack, snarl, jawSnap } from './sfx-depths.js';

// Seconds from now until t, so H.out() keeps a delayed voice alive long enough.
const wait = (H, t) => Math.max(0, t - H.now());

// A lowpass in front of a bus: a voice heard through water, cloth or flesh.
function muffle(H, dest, f, life) {
  const x = H.F('lowpass', f, 0.8);
  x.connect(dest);
  setTimeout(() => { try { x.disconnect(); } catch {} }, (life + 5) * 1000);
  return x;
}

function bubbles(H, dest, pos, gain, t, n = 10, span = 0.8) {
  const o = H.out(dest, 0.4, gain, span + 3 + wait(H, t), pos);
  for (let i = 0; i < n; i++) {
    const s = t + Math.random() * span;
    const f = H.rnd(260, 820);
    H.tone(o, 'sine', f, s, 0.004, H.rnd(0.3, 0.7), 0.05, 0, f * H.rnd(1.6, 2.4), 0.05);
  }
}

function splashAt(H, dest, pos, gain, t) {
  const o = H.out(dest, 0.45, gain, 4 + wait(H, t), pos);
  H.nz(o, H.brown, 'lowpass', 900, 1, t, 0.01, 1.2, 0.5);
  const x = H.nz(o, H.white, 'bandpass', 2400, 0.8, t, 0.005, 0.7, 0.7);
  x.frequency.setValueAtTime(3200, t);
  x.frequency.exponentialRampToValueAtTime(900, t + 0.7);
  bubbles(H, dest, pos, 0.4 * gain, t + 0.1, 8, 0.6);
}

// Water running out of a slack mouth.
function pour(H, dest, pos, gain, t, dur) {
  const o = H.out(dest, 0.35, gain, dur + 3 + wait(H, t), pos);
  const n = H.N(H.white);
  const bp = H.F('bandpass', 1500, 1.2);
  const am = H.G(0.6);
  const q = H.O('sine', 11);
  const qg = H.G(0.4);
  const e = H.G(0);
  H.chain(q, qg, am.gain);
  H.chain(n, bp, am, e, o);
  H.env(e.gain, t, 0.08, 0.7, 0.3, Math.max(0, dur - 0.38));
  n.start(t, Math.random());
  n.stop(t + dur + 0.1);
  H.play(q, t, dur + 0.1);
  bubbles(H, dest, pos, 0.25 * gain, t, Math.round(dur * 10), dur);
}

function breath(H, dest, pos, gain, t, dur, inhale = true, f = 700) {
  const o = H.out(dest, 0.3, gain, dur + 3 + wait(H, t), pos);
  const n = H.N(H.white);
  const x = H.F('bandpass', f, 1.4);
  const e = H.G(0);
  H.chain(n, x, e, o);
  x.frequency.setValueAtTime(inhale ? f * 0.8 : f * 1.3, t);
  x.frequency.linearRampToValueAtTime(inhale ? f * 1.5 : f * 0.7, t + dur);
  H.env(e.gain, t, dur * 0.6, 0.8, dur * 0.4);
  n.start(t, Math.random());
  n.stop(t + dur + 0.05);
}

function thud(H, o, t, g = 1, f = 80) {
  H.tone(o, 'sine', f, t, 0.003, g, 0.16, 0, f * 0.55, 0.12);
  H.nz(o, H.brown, 'lowpass', 400, 1, t, 0.002, g * 0.6, 0.08);
}

function slap(H, o, t, g = 1) {
  H.nz(o, H.white, 'bandpass', H.rnd(1100, 1700), 1.2, t, 0.001, g * 0.8, 0.045);
  H.nz(o, H.brown, 'lowpass', 350, 1, t, 0.002, g * 0.5, 0.06);
}

function squelchAt(H, dest, pos, gain, t) {
  const o = H.out(dest, 0.3, 0.7 * gain, 3 + wait(H, t), pos);
  const x = H.nz(o, H.brown, 'lowpass', 2600, 14, t, 0.01, 1.4, 0.35);
  x.frequency.setValueAtTime(2600, t);
  x.frequency.exponentialRampToValueAtTime(180, t + 0.3);
  H.tone(o, 'sine', 200, t, 0.01, 0.5, 0.25, 0, 60, 0.25);
  for (let i = 0; i < 5; i++) H.nz(o, H.white, 'bandpass', H.rnd(800, 2400), 6, t + H.rnd(0, 0.3), 0.002, H.rnd(0.2, 0.5), 0.03);
}

function bite(H, dest, pos, gain, t) {
  const o = H.out(dest, 0.3, gain, 2 + wait(H, t), pos);
  H.nz(o, H.white, 'highpass', 2200, 1, t, 0.001, 0.9, 0.05);
  H.tone(o, 'sine', 95, t, 0.002, 1.2, 0.2, 0, 40, 0.18);
  squelchAt(H, dest, pos, 0.5 * gain, t + 0.02);
}

// One gagging retch: a distorted 'a' cut short.
function gag(H, dest, pos, gain, t) {
  const o = H.out(dest, 0.3, gain, 2 + wait(H, t), pos);
  const e = H.G(0);
  e.connect(o);
  H.env(e.gain, t, 0.01, 1, 0.1);
  const z = H.Dz();
  const m = H.G(1);
  m.connect(z);
  const fs = H.formant(z, e, H.V.a);
  fs.forEach((b, i) => b.frequency.setValueAtTime(H.V.a[i], t));
  const s = H.O('sawtooth', H.rnd(135, 165));
  s.connect(m);
  H.play(s, t, 0.14);
  H.nz(o, H.brown, 'bandpass', 600, 2, t, 0.01, 0.6, 0.1);
}

// The lamprey's shriek: a metallic FM screech with a fast flutter.
function shriek(H, dest, pos, gain, t, dur = 1.1) {
  const o = H.out(dest, 0.5, 0.4 * gain, dur + 4 + wait(H, t), pos);
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

function whoosh(H, o, t, dur = 0.25) {
  const w = H.nz(o, H.white, 'bandpass', 2000, 1.5, t, dur * 0.8, 0.6, 0.04);
  w.frequency.setValueAtTime(2600, t);
  w.frequency.exponentialRampToValueAtTime(500, t + dur);
}

// One syllable of a woman's voice: a breathy onset, then a vowel glide at a
// pitch glide. `breathy` swaps the voice for pure noise (a whisper).
function syllable(H, dest, pos, gain, t, dur, v1, v2, f1, f2, breathy = false) {
  const o = H.out(dest, 0.6, gain, dur + 5 + wait(H, t), pos);
  const e = H.G(0);
  e.connect(o);
  H.env(e.gain, t, 0.05, 1, dur * 0.4, dur * 0.45);
  const m = H.G(1);
  const fs = H.formant(m, e, H.V[v1]);
  fs.forEach((b, i) => b.frequency.setValueAtTime(H.V[v1][i], t));
  H.vowel(fs, H.V[v2], t + dur);
  const n = H.N(H.white);
  const ng = H.G(breathy ? 1.4 : 0.35);
  H.chain(n, ng, m);
  n.start(t, Math.random());
  n.stop(t + dur + 0.05);
  if (!breathy) {
    const s = H.O('sawtooth', f1);
    s.frequency.setValueAtTime(f1, t);
    s.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const vib = H.O('sine', 6);
    const vg = H.G(f1 * 0.02);
    H.chain(vib, vg, s.frequency);
    s.connect(m);
    H.play(s, t, dur + 0.05);
    H.play(vib, t, dur + 0.05);
  }
  H.nz(o, H.white, 'bandpass', 1800, 1, t, 0.04, breathy ? 0.35 : 0.2, 0.08);
}

// A sung line: [[freq, seconds], ...] through a vowel, with a detuned twin.
// Returns the end time.
export function sing(H, dest, pos, gain, t, notes, { v = 'u', detune = 1.012, vib = 5, wet = 0.6 } = {}) {
  const total = notes.reduce((a, n) => a + n[1], 0);
  const o = H.out(dest, wet, gain, total + 6 + wait(H, t), pos);
  const e = H.G(0);
  e.connect(o);
  const m = H.G(1);
  const fs = H.formant(m, e, H.V[v]);
  fs.forEach((b, i) => b.frequency.setValueAtTime(H.V[v][i], t));
  const vs = [H.O('sawtooth', notes[0][0]), H.O('sawtooth', notes[0][0] * detune)];
  const lfo = H.O('sine', vib);
  const lg = H.G(notes[0][0] * 0.012);
  lfo.connect(lg);
  let s = t;
  e.gain.setValueAtTime(0, t);
  for (const [f, d] of notes) {
    vs.forEach((o2, i) => o2.frequency.setTargetAtTime(f * (i ? detune : 1), s, 0.03));
    e.gain.linearRampToValueAtTime(0.9, s + 0.08);
    e.gain.linearRampToValueAtTime(0.55, s + d - 0.04);
    s += d;
  }
  e.gain.linearRampToValueAtTime(0, s + 0.5);
  vs.forEach((o2) => {
    lg.connect(o2.frequency);
    o2.connect(m);
    H.play(o2, t, total + 0.6);
  });
  H.play(lfo, t, total + 0.6);
  return s;
}

function grassStep(H, o, t, g = 1) {
  const x = H.nz(o, H.white, 'bandpass', 3200, 0.9, t, 0.03, g * 0.4, 0.14);
  x.frequency.setValueAtTime(2400, t);
  x.frequency.linearRampToValueAtTime(4200, t + 0.15);
  thud(H, o, t + 0.02, g * 0.7, 70);
}

// ---------- the drowned ----------

// Rising out of the water: a splash, water pouring out of its mouth, then a
// scream gargling through the water in its throat.
export function drownedWake(H, dest, pos, gain = 1) {
  const t = H.now();
  splashAt(H, dest, pos, 0.9 * gain, t);
  pour(H, dest, pos, 0.6 * gain, t + 0.45, 1.0);
  scream(H, muffle(H, dest, 1500, 9), pos, 420, 0.7 * gain, 1.35, true, t + 1.35, 17);
  bubbles(H, dest, pos, 0.5 * gain, t + 1.4, 14, 1.2);
}

// Coughing up water between the jerks of its rise.
export function drownedCough(H, dest, pos, gain = 1) {
  const t = H.now();
  const n = Math.random() < 0.5 ? 2 : 3;
  for (let i = 0; i < n; i++) gag(H, dest, pos, 0.5 * gain, t + i * H.rnd(0.16, 0.24));
  pour(H, dest, pos, 0.4 * gain, t + 0.1, 0.45);
}

// Wading: a heavy slosh.
export function wadeStep(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.6 * gain, 2, pos);
  const x = H.nz(o, H.brown, 'bandpass', 500, 1.2, t, 0.05, 1, 0.25);
  x.frequency.setValueAtTime(700, t);
  x.frequency.exponentialRampToValueAtTime(260, t + 0.3);
  H.nz(o, H.white, 'bandpass', H.rnd(1300, 1900), 1.4, t + 0.03, 0.03, 0.3, 0.18);
}

// Kill-cam: its gargled scream in your face.
export function drownedKill(H, dest, pos, gain = 1) {
  const t = H.now();
  scream(H, muffle(H, dest, 1100, 8), pos, 380, 1.0 * gain, 1.4, true, t, 15);
  pour(H, dest, pos, 0.5 * gain, t + 0.05, 0.8);
}

// Pulled under: everything goes thick and low, bubbles stream past.
export function drownedUnder(H, dest, pos, gain = 1) {
  const t = H.now();
  splashAt(H, dest, pos, 0.8 * gain, t);
  bubbles(H, dest, pos, 0.9 * gain, t + 0.05, 30, 1.6);
  const o = H.out(dest, 0.5, 0.7 * gain, 4, pos);
  H.nz(o, H.brown, 'lowpass', 160, 1, t, 0.2, 1, 1.4, 0.4);
}

// ---------- the hanging lamprey ----------

// A hand landing on the ceiling overhead: a dull clank of pipe and a palm slap.
export function ceilingKnock(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.5, 0.6 * gain, 2, pos);
  const k = H.rnd(0.9, 1.15);
  [180, 410, 655].forEach((f, j) => H.tone(o, 'sine', f * k, t, 0.002, [0.5, 0.28, 0.16][j], 0.35 - j * 0.08));
  thud(H, o, t, 0.5, 120);
  slap(H, o, t + 0.01, 0.6);
}

// Ambush: it lets go of the ceiling. A rush of air, a wet landing, the shriek.
export function lampreyDrop(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.7 * gain, 3, pos);
  whoosh(H, o, t, 0.28);
  squelchAt(H, dest, pos, 1.1 * gain, t + 0.28);
  splashAt(H, dest, pos, 0.5 * gain, t + 0.3);
  shriek(H, dest, pos, 1.2 * gain, t + 0.32, 1.0);
}

// Kill-cam: drops in front of your face, shrieking.
export function lampreyKill(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.7 * gain, 3, pos);
  whoosh(H, o, t, 0.22);
  shriek(H, dest, pos, 1.4 * gain, t + 0.2, 1.3);
  squelchAt(H, dest, pos, 0.8 * gain, t + 0.6);
}

// ---------- the mimic ----------

// "Help me", in your sister's voice, from somewhere in the dark.
export function mimicCall(H, dest, pos, gain = 1) {
  const t = H.now();
  const k = H.rnd(0.94, 1.06);
  syllable(H, dest, pos, 0.5 * gain, t, 0.42, 'e', 'e', 350 * k, 300 * k);
  if (Math.random() < 0.7) syllable(H, dest, pos, 0.45 * gain, t + 0.48, 0.6, 'i', 'i', 330 * k, 360 * k);
}

// Spotting you: one more call, then the voice drops an octave into a scream.
export function mimicBreak(H, dest, pos, gain = 1) {
  const t = H.now();
  syllable(H, dest, pos, 0.55 * gain, t, 0.42, 'e', 'e', 370, 310);
  syllable(H, dest, pos, 0.55 * gain, t + 0.48, 0.5, 'i', 'u', 340, 170);
  scream(H, dest, pos, 300, 0.6 * gain, 1.4, true, t + 0.95);
}

// Kill-cam: a whispered "help me" an inch from your face, then its own scream.
export function mimicKill(H, dest, pos, gain = 1) {
  const t = H.now();
  syllable(H, dest, pos, 0.9 * gain, t, 0.32, 'e', 'e', 0, 0, true);
  syllable(H, dest, pos, 0.8 * gain, t + 0.38, 0.4, 'i', 'i', 0, 0, true);
  scream(H, dest, pos, 290, 0.7 * gain, 1.5, true, t + 0.85, 11);
  scream(H, dest, pos, 610, 0.3 * gain, 1.3, false, t + 0.9);
}

// Wet bare feet on meat.
export function fleshStep(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.55 * gain, 1.5, pos);
  slap(H, o, t, 1);
  H.nz(o, H.brown, 'lowpass', 900, 6, t + 0.02, 0.005, 0.4, 0.07);
}

// ---------- the breathing wall maw ----------

// One breath in (arg: seconds), deep in a throat the size of a doorway.
export function mawInhale(H, dest, pos, gain = 1, dur = 0.8) {
  breath(H, dest, pos, 0.9 * gain, H.now(), dur, true, 380);
}

export function mawExhale(H, dest, pos, gain = 1, dur = 0.7) {
  const t = H.now();
  breath(H, dest, pos, 0.9 * gain, t, dur, false, 320);
  const o = H.out(dest, 0.3, 0.25 * gain, dur + 2, pos);
  H.tone(o, 'sawtooth', 52, t, dur * 0.4, 0.3, dur * 0.6);
}

// The tell: a sharp breath just before it strikes.
export function mawGasp(H, dest, pos, gain = 1) {
  breath(H, dest, pos, 1.4 * gain, H.now(), 0.2, true, 1200);
}

export function mawBite(H, dest, pos, gain = 1) {
  bite(H, dest, pos, 1.2 * gain, H.now());
}

// Kill-cam: a gasp as it gapes in your face, the jaws closing, teeth through bone,
// then a long wet breath out.
export function mawKill(H, dest, pos, gain = 1) {
  const t = H.now();
  breath(H, dest, pos, 1.1 * gain, t, 0.45, true, 900);
  bite(H, dest, pos, 1.4 * gain, t + 0.5);
  crack(H, dest, pos, 1.0 * gain, t + 0.55);
  crack(H, dest, pos, 0.8 * gain, t + 0.67);
  breath(H, dest, pos, 1.0 * gain, t + 0.95, 1.1, false, 300);
}

// ---------- the Mother's lullaby ----------

// Slow and a little out of tune, low in her chest, with a thin ghost of it
// two octaves up. One pass is about 5.4 s.
export const LULLABY = [[110, 0.5], [131, 0.5], [123, 0.5], [110, 0.5], [98, 0.5], [110, 0.5], [82.4, 0.9], [87.3, 0.45], [98, 0.45], [92.5, 0.55]];
export function lullaby(H, dest, pos, gain = 1, t = H.now()) {
  const end = sing(H, dest, pos, 0.55 * gain, t, LULLABY, { v: 'u', detune: 1.018, vib: 4.5 });
  sing(H, dest, pos, 0.06 * gain, t, LULLABY.map(([f, d]) => [f * 4.02, d]), { v: 'i', detune: 1.01, vib: 6 });
  return end;
}

// Her hand closing around you.
export function motherGrab(H, dest, pos, gain = 1) {
  const t = H.now();
  squelchAt(H, dest, pos, 1.0 * gain, t);
  crack(H, dest, pos, 0.7 * gain, t + 0.1);
  const o = H.out(dest, 0.4, 0.6 * gain, 3, pos);
  thud(H, o, t, 1, 60);
}

// ---------- the wolf that stands up ----------

export function wolfGrowl(H, dest, pos, gain = 1) {
  snarl(H, dest, pos, 0.8 * gain, H.now());
}

// A wolf on you: a snarl that runs into snapping, worrying bites.
export function wolfKill(H, dest, pos, gain = 1) {
  const t = H.now();
  snarl(H, dest, pos, 1.1 * gain, t);
  jawSnap(H, dest, pos, 1.2 * gain, t + 0.5);
  snarl(H, dest, pos, 0.8 * gain, t + 0.65);
  jawSnap(H, dest, pos, gain, t + 0.95);
}

// Six heavy steps through the grass, on two legs, walking away.
export function bipedSteps(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.5, 0.9 * gain, 6, pos);
  for (let i = 0; i < 6; i++) grassStep(H, o, t + i * 0.52, (i % 2 ? 0.8 : 1) * (1 - i * 0.1));
}

// Public play() names -> recipes above.
export const LOWER_SFX = {
  drownedWake,
  drownedCough,
  wadeStep,
  drownedKill,
  drownedUnder,
  ceilingKnock,
  lampreyDrop,
  lampreyKill,
  mimicCall,
  mimicBreak,
  mimicKill,
  fleshStep,
  mawInhale,
  mawExhale,
  mawGasp,
  mawBite,
  mawKill,
  motherGrab,
  wolfGrowl,
  wolfKill,
  bipedSteps,
};
