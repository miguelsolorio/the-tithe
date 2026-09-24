// Shared Web Audio building blocks, bound to an AudioEngine instance. Ported
// from prototypes/audio-sets.html (nb -> noiseBuffer, imp -> impulse,
// cv -> distortionCurve, out -> H.out, env -> H.env, etc.) and the HRTF/voice
// counting approach from git show dc8b10c:src/systems/audio.js (_out).
//
// createHelpers(engine) returns `H`, a bag of functions closed over
// engine.ctx that every recipe file (sfx-depths, sfx-weapons, sfx-world,
// music, loops) takes as its first argument. H.out() is the one place that
// knows about HRTF panning, the reverb send and the concurrent-voice cap, so
// individual recipes stay simple.

export const rnd = (a, b) => a + (b - a) * Math.random();

// Vowel formants (F1, F2, F3) for chant, screams and sobs.
export const V = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  e: [400, 1600, 2700],
  u: [325, 700, 2530],
  i: [270, 2140, 2950],
};

// Hard cap on simultaneous one-shot voices so a sound storm can't tank the
// mixer or exhaust node count; new voices beyond this are silently dropped.
export const MAX_VOICES = 40;

export function noiseBuffer(ctx, brown, seconds) {
  const n = Math.max(1, (ctx.sampleRate * seconds) | 0);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return b;
}

export function impulse(ctx, seconds, decay) {
  const n = Math.max(1, (ctx.sampleRate * seconds) | 0);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}

export function distortionCurve(k) {
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = i / 512 - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

// Builds the fixed bus graph on the engine instance:
//   sfxBus, musicBus  -> comp -> underwaterFilter -> master -> (listener)
//   reverb -> reverbReturn -> comp                  (per-voice sends join here)
// setZone() automates reverbReturn.gain; setUnderwater() automates the filter.
export function buildBuses(engine, ctx) {
  engine.master = ctx.createGain();
  engine.master.gain.value = engine._volume;

  engine.underwaterFilter = ctx.createBiquadFilter();
  engine.underwaterFilter.type = 'lowpass';
  engine.underwaterFilter.frequency.value = 22000;
  engine.underwaterFilter.Q.value = 0.4;
  engine.underwaterFilter.connect(engine.master);

  // Gentle limiter so stacked stingers/booms don't clip.
  engine.comp = ctx.createDynamicsCompressor();
  engine.comp.threshold.value = -16;
  engine.comp.ratio.value = 8;
  engine.comp.connect(engine.underwaterFilter);

  engine.sfxBus = ctx.createGain();
  engine.sfxBus.gain.value = 1;
  engine.sfxBus.connect(engine.comp);

  engine.musicBus = ctx.createGain();
  engine.musicBus.gain.value = 0.55;
  engine.musicBus.connect(engine.comp);

  engine.reverb = ctx.createConvolver();
  engine.reverb.buffer = impulse(ctx, 3.8, 2.4);
  engine.reverbReturn = ctx.createGain();
  engine.reverbReturn.gain.value = 0.4;
  engine.reverb.connect(engine.reverbReturn);
  engine.reverbReturn.connect(engine.comp);

  engine.white = noiseBuffer(ctx, false, 3);
  engine.brown = noiseBuffer(ctx, true, 6);
  engine.distortCurve = distortionCurve(40);
}

export function createHelpers(engine) {
  const ctx = engine.ctx;
  const now = () => ctx.currentTime;

  const O = (type, f) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    return o;
  };
  const F = (type, f, q = 1) => {
    const x = ctx.createBiquadFilter();
    x.type = type;
    x.frequency.value = f;
    x.Q.value = q;
    return x;
  };
  const G = (v = 1) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const N = (buffer) => {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    return s;
  };
  const Dz = () => {
    const w = ctx.createWaveShaper();
    w.curve = engine.distortCurve;
    return w;
  };
  const chain = (...nodes) => {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  };
  const play = (src, t, dur) => {
    src.start(t);
    src.stop(t + Math.max(0.02, dur));
  };

  const env = (p, t, attack, peak, release, hold = 0) => {
    const v = Math.max(peak, 0.0002);
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(v, t + Math.max(0.001, attack));
    p.setValueAtTime(v, t + attack + hold);
    p.exponentialRampToValueAtTime(0.0001, t + attack + hold + Math.max(0.001, release));
  };

  const lfo = (rate, depth, param, type = 'sine') => {
    const o = O(type, rate);
    const g = G(depth);
    o.connect(g);
    g.connect(param);
    o.start();
    return o;
  };

  // Three parallel formant bandpasses; returns the filters so vowel() can morph them.
  const formant = (src, dest, v) => {
    const t = now();
    return v.map((f, i) => {
      const b = F('bandpass', f, [8, 10, 12][i]);
      b.frequency.setValueAtTime(f, t);
      src.connect(b);
      const g = G([1, 0.55, 0.3][i] * 3);
      b.connect(g);
      g.connect(dest);
      return b;
    });
  };
  const vowel = (filters, v, t) => filters.forEach((b, i) => b.frequency.linearRampToValueAtTime(v[i], t));

  // Filtered noise burst with an envelope; returns the filter for extra automation.
  const nz = (dest, buffer, type, f, q, t, attack, peak, release, hold = 0) => {
    const n = N(buffer);
    const x = F(type, f, q);
    const e = G(0);
    chain(n, x, e, dest);
    env(e.gain, t, attack, peak, release, hold);
    n.start(t, Math.random());
    n.stop(t + attack + hold + release + 0.05);
    return x;
  };

  // Oscillator with an envelope and optional exponential glide to f2.
  const tone = (dest, type, f, t, attack, peak, release, hold = 0, f2, glide) => {
    const s = O(type, f);
    const e = G(0);
    chain(s, e, dest);
    if (f2) {
      s.frequency.setValueAtTime(f, t);
      s.frequency.exponentialRampToValueAtTime(f2, t + (glide || attack + hold + release));
    }
    env(e.gain, t, attack, peak, release, hold);
    play(s, t, attack + hold + release + 0.05);
    return s;
  };

  // Output for a one-shot: optional HRTF panner, dry to `dest`, wet to the
  // shared reverb, self-disconnects after `life`s. Enforces the voice cap.
  const out = (dest, wet, gain, life = 10, pos = null) => {
    if (engine._voiceCount >= MAX_VOICES) return G(0);
    engine._voiceCount++;
    const g = G(gain);
    let head = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2;
      p.rolloffFactor = 1.1;
      p.maxDistance = 60;
      p.positionX.value = pos.x;
      p.positionY.value = pos.y || 0;
      p.positionZ.value = pos.z;
      g.connect(p);
      head = p;
    }
    head.connect(dest);
    const send = G(wet);
    head.connect(send);
    send.connect(engine.reverb);
    setTimeout(() => {
      try { g.disconnect(); } catch {}
      try { head.disconnect(); } catch {}
      try { send.disconnect(); } catch {}
      engine._voiceCount = Math.max(0, engine._voiceCount - 1);
    }, (life + 4.5) * 1000);
    return g;
  };

  return {
    ctx, now, O, F, G, N, Dz, chain, play, env, lfo, formant, vowel, nz, tone, out,
    white: engine.white, brown: engine.brown, V, rnd, engine,
  };
}
