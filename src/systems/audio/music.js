// Zone beds (setZone) and the Dread strings encounter layer (setDread).
// Each bed builder is MUSIC[name](H, L, engine): L = { bus, add, every,
// later } is the lifecycle harness from createBed(); engine carries mutable
// state a bed needs to read every beat (e.g. boss heartbeat tempo).
import { bell, chant, drip, heart, squelch } from './sfx-depths.js';

// Bed lifecycle: bus feeds engine.musicBus; setZone() fades bus.gain in/out
// and calls kill() once a fade-out finishes to stop every node and timer.
export function createBed(engine, H) {
  const bus = H.G(0);
  bus.connect(engine.musicBus);
  const nodes = [];
  const timers = [];
  let alive = true;
  return {
    bus,
    add(...ns) { nodes.push(...ns); },
    every(ms, fn) { timers.push(setInterval(() => alive && fn(), ms)); },
    later(ms, fn) { timers.push(setTimeout(() => alive && fn(), ms)); },
    kill() {
      alive = false;
      timers.forEach((id) => { clearInterval(id); clearTimeout(id); });
      nodes.forEach((n) => { try { n.stop(); } catch {} });
      try { bus.disconnect(); } catch {}
    },
  };
}

// ---------- shared pieces ----------
// Sawtooth choir through slowly morphing vowel formants (liturgy + boss).
function choirPad(H, L, bus, g = 0.14) {
  const ch = H.G(g);
  ch.connect(bus);
  L.add(H.lfo(0.07, g * 0.7, ch.gain));
  const m = H.G(1);
  const fs = H.formant(m, ch, H.V.a);
  [146.83, 174.61, 207.65, 147.7].forEach((f, i) => {
    const s = H.O('sawtooth', f);
    s.connect(m);
    s.start();
    L.add(s, H.lfo(5 + i * 0.4, f * 0.01, s.frequency));
  });
  L.every(4500, () => H.vowel(fs, H.V['aou'[(Math.random() * 3) | 0]], H.now() + 3.5));
}

// Brown-noise waves with a slowly swinging lowpass (undertow + boss).
function undertowWaves(H, L, bus) {
  const n = H.N(H.brown);
  const lp = H.F('lowpass', 350, 0.7);
  H.chain(n, lp, H.G(0.5), bus);
  L.add(H.lfo(0.09, 180, lp.frequency));
  n.start();
  L.add(n);
}

// 41/41.6/55 Hz beating subs (undertow + boss).
function undertowSubs(H, L, bus) {
  [41, 41.6, 55].forEach((f) => {
    const s = H.O('sine', f);
    H.chain(s, H.G(0.18), bus);
    s.start();
    L.add(s);
  });
}

// Self-rescheduling heartbeat: reads bpm() fresh each beat, so a tempo
// change (setBossHealth) takes effect on the very next beat.
function heartbeatLoop(H, L, bus, bpm, g = 0.9) {
  const beat = () => {
    heart(H, bus, null, g);
    L.later(60000 / bpm(), beat);
  };
  beat();
}

// ---------- beds ----------
export const MUSIC = {
  // Low drone + wind, with the Liturgy bell tolling far away.
  field(H, L) {
    const b = L.bus;
    const lp = H.F('lowpass', 170, 3);
    H.chain(lp, H.G(0.05), b);
    L.add(H.lfo(0.045, 70, lp.frequency));
    [43.65, 43.9, 65.4, 87.1].forEach((f) => {
      const s = H.O('sawtooth', f);
      s.connect(lp);
      s.start();
      L.add(s);
    });
    const wind = H.N(H.brown);
    const bp = H.F('bandpass', 380, 0.6);
    H.chain(wind, bp, H.G(0.09), b);
    wind.start();
    L.add(wind, H.lfo(0.07, 220, bp.frequency));
    const toll = () => {
      bell(H, b, null, 0.18, 73.42);
      L.later(H.rnd(12000, 18000), toll);
    };
    L.later(H.rnd(4000, 10000), toll);
  },

  liturgy(H, L) {
    const b = L.bus;
    const lp = H.F('lowpass', 1400);
    const tr = H.G(1);
    H.chain(tr, lp, b);
    L.add(H.lfo(4.6, 0.12, tr.gain));
    [[73.42, 0.05], [110, 0.03], [103.83, 0.025], [36.71, 0.06]].forEach(([f, g]) => {
      const s = H.O('square', f);
      const s2 = H.O('sine', f * 2);
      H.chain(s, H.G(g * 0.4), tr);
      H.chain(s2, H.G(g), tr);
      s.start();
      s2.start();
      L.add(s, s2);
    });
    choirPad(H, L, b);
    bell(H, b, null, 0.45, 73.42);
    L.every(9000, () => bell(H, b, null, 0.45, 73.42));
    L.later(5000, () => chant(H, b, null, 0.25));
    L.every(14000, () => chant(H, b, null, 0.25));
  },

  undertow(H, L) {
    const b = L.bus;
    undertowWaves(H, L, b);
    undertowSubs(H, L, b);
    const groan = () => {
      const t = H.now();
      const o = H.out(b, 0.8, 0.12, 7);
      const s = H.O('sine', H.rnd(160, 260));
      const e = H.G(0);
      H.chain(s, H.F('lowpass', 600), e, o);
      s.frequency.setValueAtTime(s.frequency.value, t);
      s.frequency.linearRampToValueAtTime(H.rnd(90, 300), t + 2.5);
      s.frequency.linearRampToValueAtTime(H.rnd(80, 200), t + 5);
      const vib = H.O('sine', 3);
      H.chain(vib, H.G(6), s.frequency);
      H.env(e.gain, t, 1.5, 1, 3, 1);
      H.play(s, t, 6);
      H.play(vib, t, 6);
    };
    groan();
    L.every(8000, groan);
    const dripLoop = () => {
      drip(H, b, null, H.rnd(0.1, 0.3));
      L.later(H.rnd(500, 2600), dripLoop);
    };
    dripLoop();
  },

  viscera(H, L) {
    const b = L.bus;
    heartbeatLoop(H, L, b, () => 58, 0.9);
    const n = H.N(H.brown);
    const bp = H.F('bandpass', 500, 1.2);
    const bg = H.G(0.25);
    H.chain(n, bp, bg, b);
    n.start();
    L.add(n, H.lfo(0.22, 0.24, bg.gain), H.lfo(0.22, 250, bp.frequency));
    const s = H.O('sawtooth', 36.7);
    const lp = H.F('lowpass', 160, 6);
    H.chain(s, lp, H.G(0.22), b);
    s.start();
    L.add(s, H.lfo(0.97, 90, lp.frequency));
    const sq = () => {
      squelch(H, b, null, 0.25);
      L.later(H.rnd(3000, 7000), sq);
    };
    L.later(2500, sq);
  },

  // Choir pad + heartbeat tied to boss HP, over undertow waves/subs.
  boss(H, L, engine) {
    const b = L.bus;
    choirPad(H, L, b, 0.16);
    undertowWaves(H, L, b);
    undertowSubs(H, L, b);
    heartbeatLoop(H, L, b, () => engine._bossBpm || 58, 1);
  },

  // Strings at full intensity + flood rumble + a fast fixed heartbeat.
  escape(H, L) {
    const b = L.bus;
    strings(H, L);
    const n = H.N(H.brown);
    const lp = H.F('lowpass', 220, 0.8);
    H.chain(n, lp, H.G(0.3), b);
    n.start();
    L.add(n);
    heartbeatLoop(H, L, b, () => 120, 0.8);
  },

  // Calm warm sine pad, gentle wind, occasional bird chirps.
  dawn(H, L) {
    const b = L.bus;
    const pad = H.G(0.1);
    pad.connect(b);
    L.add(H.lfo(0.05, 0.03, pad.gain));
    [130.81, 164.81, 196].forEach((f, i) => {
      const s = H.O('sine', f);
      s.connect(pad);
      s.start();
      L.add(s, H.lfo(3 + i, f * 0.004, s.frequency));
    });
    const wind = H.N(H.brown);
    const bp = H.F('bandpass', 500, 0.7);
    H.chain(wind, bp, H.G(0.04), b);
    wind.start();
    L.add(wind, H.lfo(0.06, 150, bp.frequency));
    const chirp = () => {
      const t = H.now();
      const o = H.out(b, 0.4, 0.15, 1);
      const f = H.rnd(2200, 3400);
      H.tone(o, 'sine', f, t, 0.005, 1, 0.08, 0, f * 1.3, 0.05);
      H.tone(o, 'sine', f * 0.9, t + 0.12, 0.005, 0.7, 0.08, 0, f * 1.1, 0.05);
      L.later(H.rnd(3000, 9000), chirp);
    };
    L.later(H.rnd(2000, 6000), chirp);
  },
};

// Dread encounter layer (setDread): dissonant cluster + Shepard riser +
// timpani thumps. Runs on its own bed, independent of the active zone.
export function strings(H, L) {
  const bus = L.bus;
  const lp = H.F('lowpass', 1600, 0.5);
  lp.connect(bus);
  [130.81, 138.59, 185, 196, 246.94, 65.41].forEach((f, i) => {
    const g = H.G(0.03);
    g.connect(lp);
    [-8, 8].forEach((dt) => {
      const s = H.O('sawtooth', f);
      s.detune.value = dt;
      s.connect(g);
      s.start();
      L.add(s, H.lfo(4.6 + i * 0.2 + dt * 0.01, 6, s.detune));
    });
    L.add(H.lfo(0.05 + i * 0.017, 0.026, g.gain));
  });
  const sh = H.G(0.06);
  sh.connect(bus);
  const T = 10;
  const layer = () => {
    const t = H.now();
    const s = H.O('sine', 55);
    const e = H.G(0);
    H.chain(s, e, sh);
    s.frequency.setValueAtTime(55, t);
    s.frequency.exponentialRampToValueAtTime(880, t + T * 4);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(1, t + T * 2);
    e.gain.linearRampToValueAtTime(0, t + T * 4);
    H.play(s, t, T * 4 + 0.1);
    L.add(s);
  };
  layer();
  L.every(T * 1000, layer);
  L.every(4200, () => {
    const o = H.out(bus, 0.5, 0.45, 3);
    H.tone(o, 'sine', 70, H.now(), 0.004, 1, 1.2, 0, 52, 0.4);
  });
}
