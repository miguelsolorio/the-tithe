// Ambient creature one-shots: wolves in the treeline, crows, rats in the
// walls. Same (H, dest, pos, gain) signature as the other recipe files.

// One wolf: a throaty sine+saw voice that rises, holds with a slow vibrato and
// sags away. `lp` darkens it (distance, walls).
function howlVoice(H, o, t, f0, dur, lp = 1600) {
  const s = H.O('sawtooth', f0);
  const sine = H.O('sine', f0);
  const vib = H.O('sine', H.rnd(4.5, 6));
  const vd = H.G(0);
  const f = H.F('lowpass', lp, 0.7);
  const sawG = H.G(0.18);
  const e = H.G(0);
  vib.connect(vd);
  vd.connect(s.frequency);
  vd.connect(sine.frequency);
  H.chain(s, f, sawG, e);
  sine.connect(e);
  e.connect(o);
  for (const x of [s.frequency, sine.frequency]) {
    x.setValueAtTime(f0 * 0.68, t);
    x.exponentialRampToValueAtTime(f0, t + 0.55);
    x.linearRampToValueAtTime(f0 * 1.05, t + dur * 0.62);
    x.exponentialRampToValueAtTime(f0 * 0.52, t + dur);
  }
  vd.gain.setValueAtTime(0, t);
  vd.gain.linearRampToValueAtTime(f0 * 0.014, t + dur * 0.5);
  H.env(e.gain, t, 0.4, 0.9, 0.9, Math.max(0.2, dur - 1.3));
  for (const n of [s, sine, vib]) H.play(n, t, dur + 0.1);
}

// A wolf, sometimes answered by one or two more a beat later.
export function howl(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.7, 0.35 * gain, 9, pos);
  const n = Math.random() < 0.45 ? 1 : Math.random() < 0.6 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    howlVoice(H, o, t + (i ? H.rnd(0.6, 1.8) * i : 0), H.rnd(360, 470) * (i ? H.rnd(0.9, 1.15) : 1), H.rnd(2.6, 3.8));
  }
}

// Heard through the walls of the house: one wolf, low-passed, non-positional.
export function howlDistant(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.9, 0.18 * gain, 8, pos);
  howlVoice(H, o, t, H.rnd(340, 420), H.rnd(3, 4), 520);
}

// Two or three rasping caws with a falling pitch.
export function crowCaw(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.35, 0.3 * gain, 3, pos);
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const t0 = t + i * H.rnd(0.32, 0.45);
    const d = H.rnd(0.18, 0.26);
    const s = H.O('sawtooth', H.rnd(620, 760));
    const dz = H.Dz();
    const bp = H.F('bandpass', 1250, 2.5);
    const e = H.G(0);
    H.chain(s, dz, bp, e, o);
    s.frequency.setValueAtTime(s.frequency.value, t0);
    s.frequency.exponentialRampToValueAtTime(420, t0 + d);
    H.env(e.gain, t0, 0.015, 0.6, d * 0.7, d * 0.2);
    H.play(s, t0, d + 0.05);
    H.nz(o, H.white, 'bandpass', 1700, 3, t0, 0.01, 0.35, d);
  }
}

// Wing beats of a bird lifting off.
export function wingFlap(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.2, 0.55 * gain, 2, pos);
  let dt = 0.07;
  for (let i = 0, tt = t; i < 9; i++, tt += dt, dt *= 1.12) H.nz(o, H.white, 'lowpass', 900 - i * 40, 0.8, tt, 0.01, 0.8 - i * 0.07, 0.06);
}

// A couple of short high chirps.
export function ratSqueak(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.25, 0.18 * gain, 1.5, pos);
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const t0 = t + i * H.rnd(0.09, 0.16);
    H.tone(o, 'sine', H.rnd(3000, 3600), t0, 0.005, 0.7, 0.06, 0.02, H.rnd(3900, 4600), 0.07);
  }
}

// Claws on boards: a quick run of tiny ticks.
export function skitter(H, dest, pos, gain = 1) {
  const t = H.now();
  const o = H.out(dest, 0.3, 0.4 * gain, 1.5, pos);
  const n = 10 + Math.floor(Math.random() * 10);
  let tt = t;
  for (let i = 0; i < n; i++) {
    H.nz(o, H.white, 'highpass', H.rnd(2200, 4200), 1.5, tt, 0.001, H.rnd(0.3, 0.8), H.rnd(0.006, 0.014));
    tt += H.rnd(0.025, 0.055);
  }
}

export const AMBIENT_SFX = { howl, howlDistant, crowCaw, wingFlap, ratSqueak, skitter };
