// Every sound in the game is synthesized with the Web Audio API. Positional
// sounds go through HRTF PannerNodes; THREE.AudioListener (on the camera)
// keeps the listener's position and orientation in sync.

const rnd = (a, b) => a + (b - a) * Math.random();

export class AudioEngine {
  constructor() {
    this.ready = false;
    this.heart = { intensity: 0, timer: 0 };
    this.staticLevel = 0;
    this.dread = 0;
    this.breathTimer = 0;
    this.fireTimer = 0;
  }

  init(listener) {
    if (this.ready) {
      this.ctx.resume();
      return;
    }
    this.listener = listener;
    const ctx = (this.ctx = listener.context);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(listener.getInput());

    // Gentle limiter so stacked stingers don't clip.
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.comp.connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.comp);
    this.ui = ctx.createGain();
    this.ui.connect(this.comp);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.8, 2.2);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.7;
    this.reverb.connect(this.reverbOut);
    this.reverbOut.connect(this.comp);

    this.white = this._noiseBuffer('white', 3);
    this.brown = this._noiseBuffer('brown', 5);
    this.distortCurve = this._curve(40);

    this.ready = true;
    ctx.resume();
    this._startAmbience();
  }

  // ---------- Building blocks ----------
  _noiseBuffer(kind, seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _curve(k) {
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return c;
  }

  // Output node for a one-shot. pos = world position (or null for 2D), wet = reverb send.
  _out(pos, dur, wet = 0.35, gain = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let head = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.maxDistance = 250;
      p.rolloffFactor = 1.0;
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
      g.connect(p);
      p.connect(this.sfx);
      head = p;
    } else {
      g.connect(this.sfx);
    }
    const send = ctx.createGain();
    send.gain.value = wet;
    head.connect(send);
    send.connect(this.reverb);
    setTimeout(() => {
      g.disconnect();
      head.disconnect();
      send.disconnect();
    }, (dur + 4.5) * 1000);
    return g;
  }

  _env(param, t0, attack, peak, release, hold = 0) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    param.setValueAtTime(Math.max(peak, 0.0002), t0 + attack + hold);
    param.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  _noise(buffer = this.white, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    return s;
  }

  _osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  _filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  get now() {
    return this.ctx.currentTime;
  }

  // ---------- Ambience ----------
  _startAmbience() {
    const ctx = this.ctx;
    const t = this.now;

    // Low drone
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneGain.gain.linearRampToValueAtTime(0.05, t + 6);
    const lp = this._filter('lowpass', 170, 3);
    lp.connect(droneGain);
    droneGain.connect(this.comp);
    for (const f of [43.65, 43.9, 65.4, 87.1]) {
      const o = this._osc('sawtooth', f);
      o.connect(lp);
      o.start();
    }
    const lfo = this._osc('sine', 0.045);
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 70;
    lfo.connect(lfoAmt);
    lfoAmt.connect(lp.frequency);
    lfo.start();

    // Wind through the trees
    const wind = this._noise(this.brown, true);
    const bp = this._filter('bandpass', 380, 0.6);
    const windGain = ctx.createGain();
    windGain.gain.value = 0.09;
    wind.connect(bp);
    bp.connect(windGain);
    windGain.connect(this.comp);
    wind.start();
    const wl = this._osc('sine', 0.07);
    const wlAmt = ctx.createGain();
    wlAmt.gain.value = 220;
    wl.connect(wlAmt);
    wlAmt.connect(bp.frequency);
    wl.start();
    const wl2 = this._osc('sine', 0.11);
    const wl2Amt = ctx.createGain();
    wl2Amt.gain.value = 0.05;
    wl2.connect(wl2Amt);
    wl2Amt.connect(windGain.gain);
    wl2.start();
    this.windGain = windGain;

    // High air hiss
    const hiss = this._noise(this.white, true);
    const hp = this._filter('highpass', 6000, 0.5);
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.006;
    hiss.connect(hp);
    hp.connect(hissGain);
    hissGain.connect(this.comp);
    hiss.start();

    // Dread layer: beating high tones that swell when something is near.
    this.dreadGain = ctx.createGain();
    this.dreadGain.gain.value = 0;
    const dlp = this._filter('lowpass', 2400, 0.5);
    this.dreadGain.connect(dlp);
    dlp.connect(this.comp);
    for (const f of [932.3, 987.8, 1396.9]) {
      const o = this._osc('sine', f);
      o.connect(this.dreadGain);
      o.start();
    }
    const dsub = this._osc('triangle', 58.3);
    dsub.connect(this.dreadGain);
    dsub.start();

    // Static (the Stalker)
    const st = this._noise(this.white, true);
    const sbp = this._filter('bandpass', 2600, 0.4);
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0;
    st.connect(sbp);
    sbp.connect(this.staticGain);
    this.staticGain.connect(this.comp);
    st.start();

    // Campfire crackle bed (positional; placed later)
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0.35;
    this.firePanner = ctx.createPanner();
    this.firePanner.panningModel = 'HRTF';
    this.firePanner.refDistance = 3;
    this.firePanner.rolloffFactor = 1.3;
    const fireNoise = this._noise(this.brown, true);
    const fbp = this._filter('bandpass', 700, 0.8);
    fireNoise.connect(fbp);
    fbp.connect(this.fireGain);
    this.fireGain.connect(this.firePanner);
    this.firePanner.connect(this.sfx);
    fireNoise.start();
  }

  setFirePosition(p) {
    if (!this.ready) return;
    this.firePos = p.clone();
    this.firePanner.positionX.value = p.x;
    this.firePanner.positionY.value = p.y;
    this.firePanner.positionZ.value = p.z;
  }

  gust() {
    if (!this.ready) return;
    const g = this.windGain.gain;
    const t = this.now;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.22, t + 2);
    g.linearRampToValueAtTime(0.09, t + 6);
  }

  // Called every frame
  update(dt, listenerPos) {
    if (!this.ready) return;
    const t = this.now;
    this.dreadGain.gain.setTargetAtTime(this.dread * 0.018, t, 0.4);
    this.staticGain.gain.setTargetAtTime(this.staticLevel * 0.2, t, 0.05);

    // Heartbeat
    const h = this.heart;
    if (h.intensity > 0.05) {
      h.timer -= dt;
      if (h.timer <= 0) {
        h.timer = 1.15 - h.intensity * 0.72;
        this._thump(t, 0.35 * h.intensity);
        this._thump(t + 0.2, 0.22 * h.intensity);
      }
    }

    // Fire pops when near
    if (this.firePos && listenerPos && listenerPos.distanceTo(this.firePos) < 30) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = rnd(0.05, 0.4);
        this._pop(this.firePos);
      }
    }

    if (this.breathing) {
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathTimer = 0.85;
        this._breath();
      }
    }
  }

  _thump(t, gain) {
    const o = this._osc('sine', 62);
    o.frequency.setValueAtTime(62, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.18);
    const g = this.ctx.createGain();
    this._env(g.gain, t, 0.01, gain, 0.22);
    o.connect(g);
    g.connect(this.ui);
    o.start(t);
    o.stop(t + 0.3);
  }

  _pop(pos) {
    const t = this.now;
    const s = this._noise();
    const hp = this._filter('bandpass', rnd(1500, 4000), 2);
    const out = this._out(pos, 0.1, 0.1);
    this._env(out.gain, t, 0.002, rnd(0.08, 0.3), 0.04);
    s.connect(hp);
    hp.connect(out);
    s.start(t, rnd(0, 2), 0.08);
  }

  _breath() {
    const t = this.now;
    const s = this._noise();
    const bp = this._filter('bandpass', 1100, 0.9);
    const g = this.ctx.createGain();
    this._env(g.gain, t, 0.15, 0.05, 0.4);
    s.connect(bp);
    bp.connect(g);
    g.connect(this.ui);
    s.start(t, rnd(0, 2), 0.7);
  }

  // ---------- Player sounds ----------
  footstep(intensity = 0.6) {
    if (!this.ready) return;
    const t = this.now;
    const s = this._noise();
    const bp = this._filter('bandpass', rnd(320, 560), 0.9);
    const g = this.ctx.createGain();
    this._env(g.gain, t, 0.004, 0.32 * intensity, 0.13);
    s.connect(bp);
    bp.connect(g);
    g.connect(this.ui);
    s.start(t, rnd(0, 2.5), 0.25);
    // Leaf crunch
    const s2 = this._noise();
    const hp = this._filter('highpass', 2600, 0.7);
    const g2 = this.ctx.createGain();
    this._env(g2.gain, t + 0.01, 0.003, 0.06 * intensity, 0.09);
    s2.connect(hp);
    hp.connect(g2);
    g2.connect(this.ui);
    s2.start(t + 0.01, rnd(0, 2.5), 0.15);
  }

  // A footstep that isn't yours.
  footstepAt(pos, intensity = 1) {
    if (!this.ready) return;
    const t = this.now;
    const s = this._noise();
    const bp = this._filter('bandpass', rnd(280, 480), 0.9);
    const out = this._out(pos, 0.3, 0.3, 1.6);
    this._env(out.gain, t, 0.004, 0.4 * intensity, 0.14);
    s.connect(bp);
    bp.connect(out);
    s.start(t, rnd(0, 2.5), 0.25);
  }

  click() {
    if (!this.ready) return;
    const t = this.now;
    const o = this._osc('square', 1800);
    const g = this.ctx.createGain();
    this._env(g.gain, t, 0.001, 0.05, 0.02);
    o.connect(g);
    g.connect(this.ui);
    o.start(t);
    o.stop(t + 0.05);
  }

  hurt() {
    if (!this.ready) return;
    const t = this.now;
    const s = this._noise(this.brown);
    const lp = this._filter('lowpass', 380, 1);
    const g = this.ctx.createGain();
    this._env(g.gain, t, 0.005, 0.9, 0.35);
    s.connect(lp);
    lp.connect(g);
    g.connect(this.ui);
    s.start(t, 0, 0.5);
    this.snarl(null, 0.5);
  }

  pickup() {
    if (!this.ready) return;
    const t = this.now;
    [440, 523.3, 659.3, 415.3].forEach((f, i) => {
      const o = this._osc('sine', f);
      const out = this._out(null, 3, 0.8, 1);
      this._env(out.gain, t + i * 0.16, 0.02, 0.09, 1.8);
      o.connect(out);
      o.start(t + i * 0.16);
      o.stop(t + i * 0.16 + 2.2);
    });
  }

  battery() {
    if (!this.ready) return;
    const t = this.now;
    [0, 0.07].forEach((d) => {
      const o = this._osc('square', 900);
      const g = this.ctx.createGain();
      this._env(g.gain, t + d, 0.001, 0.04, 0.03);
      o.connect(g);
      g.connect(this.ui);
      o.start(t + d);
      o.stop(t + d + 0.06);
    });
  }

  // ---------- Stingers ----------
  sting(gain = 1) {
    if (!this.ready) return;
    const t = this.now;
    const lp = this._filter('lowpass', 5000, 0.7);
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 1.8);
    const out = this._out(null, 3, 0.6);
    this._env(out.gain, t, 0.01, 0.28 * gain, 2.4);
    lp.connect(out);
    for (const f of [110, 116.5, 155.6, 233.1, 246.9, 369.9]) {
      const o = this._osc('sawtooth', f * rnd(0.995, 1.005));
      o.connect(lp);
      o.start(t);
      o.stop(t + 2.6);
    }
    // Noise hit + sub
    const s = this._noise();
    const g = this.ctx.createGain();
    this._env(g.gain, t, 0.002, 0.35 * gain, 0.3);
    s.connect(g);
    g.connect(this.ui);
    s.start(t, 0, 0.4);
    this.boom(0.6 * gain);
  }

  staticBurst(gain = 1) {
    if (!this.ready) return;
    const t = this.now;
    const s = this._noise();
    const bp = this._filter('bandpass', 3000, 0.3);
    const g = this.ctx.createGain();
    this._env(g.gain, t, 0.005, 0.35 * gain, 0.45);
    s.connect(bp);
    bp.connect(g);
    g.connect(this.ui);
    s.start(t, rnd(0, 2), 0.6);
  }

  boom(gain = 0.5) {
    if (!this.ready) return;
    const t = this.now;
    const o = this._osc('sine', 48);
    o.frequency.setValueAtTime(48, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 2.5);
    const g = this.ctx.createGain();
    this._env(g.gain, t, 0.02, 0.6 * gain, 2.8);
    o.connect(g);
    g.connect(this.ui);
    o.start(t);
    o.stop(t + 3.2);
  }

  // ---------- Creatures and the forest ----------
  caw(pos, count = 2) {
    if (!this.ready) return;
    const t0 = this.now;
    for (let i = 0; i < count; i++) {
      const t = t0 + i * rnd(0.32, 0.5);
      const o = this._osc('sawtooth', 1050);
      o.frequency.setValueAtTime(rnd(950, 1150), t);
      o.frequency.exponentialRampToValueAtTime(rnd(560, 700), t + 0.26);
      const am = this._osc('square', 55);
      const amG = this.ctx.createGain();
      amG.gain.value = 0.5;
      const carrier = this.ctx.createGain();
      carrier.gain.value = 0.5;
      am.connect(amG);
      amG.connect(carrier.gain);
      const bp = this._filter('bandpass', 1300, 3);
      const out = this._out(pos, 0.6, 0.5, 1.2);
      this._env(out.gain, t, 0.01, 0.35, 0.25);
      o.connect(carrier);
      carrier.connect(bp);
      bp.connect(out);
      o.start(t);
      am.start(t);
      o.stop(t + 0.35);
      am.stop(t + 0.35);
    }
  }

  flutter(pos) {
    if (!this.ready) return;
    const t0 = this.now;
    for (let i = 0; i < 14; i++) {
      const t = t0 + i * rnd(0.04, 0.09);
      const s = this._noise();
      const bp = this._filter('bandpass', rnd(300, 700), 1.2);
      const out = this._out(pos, 0.2, 0.2);
      this._env(out.gain, t, 0.005, rnd(0.1, 0.25), 0.06);
      s.connect(bp);
      bp.connect(out);
      s.start(t, rnd(0, 2), 0.1);
    }
  }

  howl(pos, gain = 1) {
    if (!this.ready) return;
    const t = this.now + rnd(0, 0.4);
    for (const detune of [1, 1.012, 0.74]) {
      const o = this._osc('triangle', 380 * detune);
      const f = o.frequency;
      f.setValueAtTime(360 * detune, t);
      f.linearRampToValueAtTime(610 * detune, t + 0.7);
      f.linearRampToValueAtTime(570 * detune, t + 2.2);
      f.linearRampToValueAtTime(330 * detune, t + 3.4);
      const vib = this._osc('sine', 5.2);
      const vibG = this.ctx.createGain();
      vibG.gain.value = 9 * detune;
      vib.connect(vibG);
      vibG.connect(f);
      const lp = this._filter('lowpass', 1500, 0.7);
      const out = this._out(pos, 4, 0.8, gain);
      this._env(out.gain, t, 0.5, detune < 1 ? 0.06 : 0.14, 1.4, 1.6);
      o.connect(lp);
      lp.connect(out);
      o.start(t);
      vib.start(t);
      o.stop(t + 3.8);
      vib.stop(t + 3.8);
    }
  }

  growl(pos, gain = 1) {
    if (!this.ready) return;
    const t = this.now;
    const o = this._osc('sawtooth', rnd(60, 78));
    const s = this._noise(this.brown);
    const am = this._osc('sine', 26);
    const amG = this.ctx.createGain();
    amG.gain.value = 0.6;
    const mix = this.ctx.createGain();
    mix.gain.value = 0.5;
    am.connect(amG);
    amG.connect(mix.gain);
    const lp = this._filter('lowpass', 480, 2);
    const out = this._out(pos, 1.6, 0.2, gain);
    this._env(out.gain, t, 0.15, 0.4, 0.6, 0.6);
    o.connect(mix);
    s.connect(mix);
    mix.connect(lp);
    lp.connect(out);
    o.start(t);
    s.start(t, rnd(0, 3), 1.5);
    am.start(t);
    o.stop(t + 1.5);
    am.stop(t + 1.5);
  }

  snarl(pos, gain = 1) {
    if (!this.ready) return;
    const t = this.now;
    const o = this._osc('sawtooth', 190);
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.35);
    const s = this._noise();
    const bp = this._filter('bandpass', 900, 1.2);
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.distortCurve;
    const out = this._out(pos, 0.6, 0.2, gain);
    this._env(out.gain, t, 0.01, 0.4, 0.35);
    o.connect(ws);
    s.connect(bp);
    bp.connect(ws);
    ws.connect(out);
    o.start(t);
    s.start(t, rnd(0, 2), 0.5);
    o.stop(t + 0.5);
  }

  whimper(pos) {
    if (!this.ready) return;
    const t = this.now;
    const o = this._osc('triangle', 900);
    o.frequency.setValueAtTime(1100, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.4);
    const out = this._out(pos, 0.6, 0.3, 1);
    this._env(out.gain, t, 0.02, 0.1, 0.35);
    o.connect(out);
    o.start(t);
    o.stop(t + 0.5);
  }

  hoot(pos) {
    if (!this.ready) return;
    const t0 = this.now;
    [0, 0.9, 1.25].forEach((d, i) => {
      const t = t0 + d;
      const o = this._osc('sine', i === 0 ? 410 : 380);
      o.frequency.setValueAtTime(i === 0 ? 410 : 385, t);
      o.frequency.linearRampToValueAtTime(i === 0 ? 360 : 340, t + 0.3);
      const out = this._out(pos, 0.5, 0.7, 1);
      this._env(out.gain, t, 0.06, 0.16, 0.25, 0.1);
      o.connect(out);
      o.start(t);
      o.stop(t + 0.5);
    });
  }

  twig(pos) {
    if (!this.ready) return;
    const t0 = this.now;
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * rnd(0.05, 0.12);
      const s = this._noise();
      const hp = this._filter('highpass', 1800, 1);
      const out = this._out(pos, 0.1, 0.4, 1.4);
      this._env(out.gain, t, 0.001, 0.5, 0.03);
      s.connect(hp);
      hp.connect(out);
      s.start(t, rnd(0, 2), 0.05);
    }
  }

  crack(pos) {
    if (!this.ready) return;
    const t0 = this.now;
    for (let i = 0; i < 6; i++) {
      const t = t0 + i * rnd(0.05, 0.13);
      const o = this._osc('square', rnd(90, 180));
      const s = this._noise();
      const bp = this._filter('bandpass', rnd(900, 2000), 3);
      const out = this._out(pos, 0.1, 0.3, 1.2);
      this._env(out.gain, t, 0.001, 0.4, 0.04);
      o.connect(out);
      s.connect(bp);
      bp.connect(out);
      o.start(t);
      o.stop(t + 0.05);
      s.start(t, rnd(0, 2), 0.05);
    }
  }

  creak(pos) {
    if (!this.ready) return;
    const t = this.now;
    const o = this._osc('sawtooth', rnd(60, 90));
    o.frequency.setValueAtTime(o.frequency.value, t);
    o.frequency.linearRampToValueAtTime(o.frequency.value * rnd(1.3, 1.8), t + 1.4);
    const bp = this._filter('bandpass', rnd(500, 900), 8);
    const out = this._out(pos, 2, 0.6, 1);
    this._env(out.gain, t, 0.2, 0.25, 0.8, 0.6);
    o.connect(bp);
    bp.connect(out);
    o.start(t);
    o.stop(t + 1.8);
  }

  whisper(pos, gain = 1) {
    if (!this.ready) return;
    const t = this.now;
    const dur = rnd(1.4, 2.4);
    const s = this._noise();
    const out = this._out(pos, dur, 0.7, gain);
    this._env(out.gain, t, 0.3, 0.5, 0.6, dur - 0.9);
    for (const [f, q] of [
      [rnd(500, 900), 6],
      [rnd(1200, 2200), 8],
      [rnd(2500, 3200), 10],
    ]) {
      const bp = this._filter('bandpass', f, q);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      // Syllables
      for (let k = t; k < t + dur; k += rnd(0.07, 0.16)) g.gain.setValueAtTime(Math.random() < 0.3 ? 0 : rnd(0.2, 1), k);
      bp.frequency.setValueAtTime(f, t);
      bp.frequency.linearRampToValueAtTime(f * rnd(0.8, 1.2), t + dur);
      s.connect(bp);
      bp.connect(g);
      g.connect(out);
    }
    s.start(t, rnd(0, 1), dur + 0.2);
  }

  giggle(pos) {
    if (!this.ready) return;
    const t0 = this.now;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.12;
      const f = 1150 - i * 55 + rnd(-40, 40);
      const o = this._osc('triangle', f);
      o.frequency.setValueAtTime(f * 1.08, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.09);
      const out = this._out(pos, 0.2, 0.9, 1);
      this._env(out.gain, t, 0.01, 0.13, 0.08);
      o.connect(out);
      o.start(t);
      o.stop(t + 0.14);
    }
  }

  // Looping weeping; returns a handle with move() and stop().
  weep(pos) {
    if (!this.ready) return { stop() {}, move() {} };
    const ctx = this.ctx;
    const t = this.now;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.refDistance = 3;
    p.rolloffFactor = 1.1;
    const setPos = (q) => {
      p.positionX.value = q.x;
      p.positionY.value = q.y + 1.5;
      p.positionZ.value = q.z;
    };
    setPos(pos);
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(1, t + 1);
    master.connect(p);
    p.connect(this.sfx);
    const send = ctx.createGain();
    send.gain.value = 0.7;
    p.connect(send);
    send.connect(this.reverb);

    const voice = this._osc('sine', 520);
    const vib = this._osc('sine', 6);
    const vibG = ctx.createGain();
    vibG.gain.value = 22;
    vib.connect(vibG);
    vibG.connect(voice.frequency);
    const vg = ctx.createGain();
    vg.gain.value = 0;
    voice.connect(vg);
    vg.connect(master);
    const breath = this._noise(this.white, true);
    const bbp = this._filter('bandpass', 1500, 1);
    const bg = ctx.createGain();
    bg.gain.value = 0;
    breath.connect(bbp);
    bbp.connect(bg);
    bg.connect(master);
    // Pre-schedule ~40 s of sobs
    for (let k = t + 0.5; k < t + 40; k += rnd(1.1, 2.4)) {
      const f0 = rnd(480, 620);
      voice.frequency.setValueAtTime(f0, k);
      voice.frequency.exponentialRampToValueAtTime(f0 * 0.72, k + 0.6);
      vg.gain.setValueAtTime(0.0001, k);
      vg.gain.exponentialRampToValueAtTime(0.09, k + 0.08);
      vg.gain.exponentialRampToValueAtTime(0.0001, k + 0.65);
      bg.gain.setValueAtTime(0.0001, k + 0.62);
      bg.gain.exponentialRampToValueAtTime(0.05, k + 0.7);
      bg.gain.exponentialRampToValueAtTime(0.0001, k + 1.0);
    }
    voice.start(t);
    vib.start(t);
    breath.start(t);
    let stopped = false;
    return {
      move: setPos,
      stop: () => {
        if (stopped) return;
        stopped = true;
        const n = this.now;
        master.gain.cancelScheduledValues(n);
        master.gain.setValueAtTime(master.gain.value, n);
        master.gain.linearRampToValueAtTime(0, n + 0.15);
        setTimeout(() => {
          voice.stop();
          vib.stop();
          breath.stop();
          master.disconnect();
          p.disconnect();
          send.disconnect();
        }, 400);
      },
    };
  }

  scream(pos, gain = 1) {
    if (!this.ready) return;
    const t = this.now;
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.distortCurve;
    const bp = this._filter('bandpass', 1500, 0.9);
    const out = this._out(pos, 1.6, 0.8, gain);
    this._env(out.gain, t, 0.02, 0.4, 1.1, 0.2);
    ws.connect(bp);
    bp.connect(out);
    for (const m of [1, 1.5, 2.02]) {
      const o = this._osc('sawtooth', 700 * m);
      o.frequency.setValueAtTime(650 * m, t);
      o.frequency.exponentialRampToValueAtTime(1350 * m, t + 0.14);
      o.frequency.exponentialRampToValueAtTime(880 * m, t + 1.2);
      const vib = this._osc('sine', 9);
      const vg = this.ctx.createGain();
      vg.gain.value = 30 * m;
      vib.connect(vg);
      vg.connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.value = 0.3 / m;
      o.connect(g);
      g.connect(ws);
      o.start(t);
      vib.start(t);
      o.stop(t + 1.4);
      vib.stop(t + 1.4);
    }
  }

  shriek(pos, gain = 1) {
    if (!this.ready) return;
    const t = this.now;
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.distortCurve;
    const bp = this._filter('bandpass', 1700, 0.7);
    const out = this._out(pos, 2, 0.8, gain);
    this._env(out.gain, t, 0.03, 0.5, 1.2, 0.3);
    ws.connect(bp);
    bp.connect(out);
    for (let i = 0; i < 4; i++) {
      const f = rnd(300, 900);
      const o = this._osc('sawtooth', f);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * rnd(1.4, 2.2), t + 0.3);
      o.frequency.exponentialRampToValueAtTime(f * rnd(0.5, 0.8), t + 1.5);
      const g = this.ctx.createGain();
      g.gain.value = 0.2;
      o.connect(g);
      g.connect(ws);
      o.start(t);
      o.stop(t + 1.6);
    }
    const s = this._noise();
    const g = this.ctx.createGain();
    g.gain.value = 0.25;
    s.connect(g);
    g.connect(ws);
    s.start(t, 0, 1.4);
  }

  moan(pos, gain = 1) {
    if (!this.ready) return;
    const t = this.now;
    const o = this._osc('sine', 220);
    o.frequency.setValueAtTime(260, t);
    o.frequency.linearRampToValueAtTime(170, t + 2);
    const o2 = this._osc('sine', 331);
    o2.frequency.setValueAtTime(390, t);
    o2.frequency.linearRampToValueAtTime(250, t + 2);
    const out = this._out(pos, 2.4, 0.9, gain);
    this._env(out.gain, t, 0.4, 0.12, 1.2, 0.5);
    o.connect(out);
    o2.connect(out);
    o.start(t);
    o2.start(t);
    o.stop(t + 2.3);
    o2.stop(t + 2.3);
  }

  gateCreak(pos) {
    if (!this.ready) return;
    this.creak(pos);
    setTimeout(() => this.creak(pos), 600);
    setTimeout(() => this.creak(pos), 1500);
  }
}
