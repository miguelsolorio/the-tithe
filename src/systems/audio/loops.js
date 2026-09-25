// Continuous positional loops (loop()). Each builder returns a handle from
// makeLoopHandle: { setPos(p), setGain(g, fade), stop(fade) }; stop() clears
// every timer and stops every node, per the public loop() contract.
import { chant, drip } from './sfx-depths.js';
import { phoneBuzz } from './sfx-weapons.js';

export function makeLoopHandle(engine, H, pos, gain) {
  const ctx = H.ctx;
  const bus = H.G(gain);
  let panner = null;
  let head = bus;
  if (pos) {
    panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2;
    panner.rolloffFactor = 1.1;
    panner.maxDistance = 60;
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y || 0;
    panner.positionZ.value = pos.z;
    bus.connect(panner);
    head = panner;
  }
  head.connect(pos ? engine.worldBus : engine.sfxBus);
  const send = H.G(0.3);
  head.connect(send);
  send.connect(pos ? engine.worldSend : engine.reverb);
  const nodes = [];
  const timers = [];
  let stopped = false;
  return {
    bus,
    add(...ns) { nodes.push(...ns); },
    every(ms, fn) { const id = setInterval(() => !stopped && fn(), ms); timers.push(id); return id; },
    later(ms, fn) { const id = setTimeout(() => !stopped && fn(), ms); timers.push(id); return id; },
    setPos(p) {
      if (!panner || stopped) return;
      panner.positionX.value = p.x;
      panner.positionY.value = p.y || 0;
      panner.positionZ.value = p.z;
    },
    setGain(g, fade = 0.3) {
      if (stopped) return;
      bus.gain.setTargetAtTime(g, ctx.currentTime, Math.max(0.01, fade / 3));
    },
    stop(fade = 0.5) {
      if (stopped) return;
      stopped = true;
      timers.forEach((id) => { clearInterval(id); clearTimeout(id); });
      const t = ctx.currentTime;
      bus.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3));
      setTimeout(() => {
        nodes.forEach((n) => { try { n.stop(); } catch {} });
        try { bus.disconnect(); } catch {}
        if (panner) try { panner.disconnect(); } catch {}
        try { send.disconnect(); } catch {}
      }, fade * 1000 + 100);
    },
  };
}

// Endless flicker buzz: gated 120 Hz through a bandpass, random cut-outs + clicks.
function bulbBuzz(engine, H, pos, gain) {
  const L = makeLoopHandle(engine, H, pos, gain);
  const s = H.O('sawtooth', 120);
  const bp = H.F('bandpass', 240, 2);
  const e = H.G(0.45);
  H.chain(s, bp, e, L.bus);
  s.start();
  L.add(s);
  L.every(180, () => {
    if (Math.random() < 0.2) {
      const on = e.gain.value > 0.1;
      e.gain.setTargetAtTime(on ? 0 : 0.45, H.now(), 0.004);
      H.nz(L.bus, H.white, 'highpass', 3000, 1, H.now(), 0.0005, 0.2, 0.01);
    }
  });
  return L;
}

function candle(engine, H, pos, gain) {
  const L = makeLoopHandle(engine, H, pos, gain);
  const tick = () => {
    H.nz(L.bus, H.white, 'bandpass', H.rnd(1800, 4000), 3, H.now(), 0.001, H.rnd(0.05, 0.15), H.rnd(0.02, 0.05));
    L.later(H.rnd(60, 220), tick);
  };
  tick();
  return L;
}

// Acolyte chant voices re-triggered back to back.
function chantLoop(engine, H, pos, gain) {
  const L = makeLoopHandle(engine, H, pos, gain);
  const go = () => {
    chant(H, L.bus, null, 1);
    L.later(3300, go);
  };
  go();
  return L;
}

function waterFlow(engine, H, pos, gain) {
  const L = makeLoopHandle(engine, H, pos, gain);
  const n = H.N(H.brown);
  const bp = H.F('bandpass', 500, 0.8);
  const g = H.G(0.6);
  H.chain(n, bp, g, L.bus);
  n.start();
  L.add(n, H.lfo(0.15, 150, bp.frequency), H.lfo(0.2, 0.08, g.gain));
  return L;
}

function dripping(engine, H, pos, gain) {
  const L = makeLoopHandle(engine, H, pos, gain);
  const go = () => {
    drip(H, L.bus, null, 1);
    L.later(H.rnd(500, 2500), go);
  };
  L.later(H.rnd(200, 1200), go);
  return L;
}

function fleshBreath(engine, H, pos, gain) {
  const L = makeLoopHandle(engine, H, pos, gain);
  const n = H.N(H.brown);
  const bp = H.F('bandpass', 450, 1.3);
  const g = H.G(0.22);
  H.chain(n, bp, g, L.bus);
  n.start();
  L.add(n, H.lfo(0.25, 0.18, g.gain), H.lfo(0.25, 200, bp.frequency));
  return L;
}

function mawBreath(engine, H, pos, gain) {
  const L = makeLoopHandle(engine, H, pos, gain);
  const n = H.N(H.brown);
  const bp = H.F('bandpass', 280, 1.8);
  const g = H.G(0.28);
  H.chain(n, bp, g, L.bus);
  n.start();
  L.add(n, H.lfo(0.12, 0.22, g.gain), H.lfo(0.12, 120, bp.frequency));
  return L;
}

// The phoneBuzz one-shot pattern, repeated every ~2.5 s.
function phoneRing(engine, H, pos, gain) {
  const L = makeLoopHandle(engine, H, pos, gain);
  const go = () => {
    phoneBuzz(H, L.bus, null, 1);
    L.later(2500, go);
  };
  go();
  return L;
}

function floodRush(engine, H, pos, gain) {
  const L = makeLoopHandle(engine, H, pos, gain);
  const n = H.N(H.brown);
  const bp = H.F('bandpass', 400, 0.6);
  const g = H.G(0.8);
  H.chain(n, bp, g, L.bus);
  n.start();
  L.add(n, H.lfo(0.2, 200, bp.frequency));
  return L;
}

export const LOOPS = {
  bulbBuzz, candle, chantLoop, waterFlow, dripping, fleshBreath, mawBreath, phoneRing, floodRush,
};
