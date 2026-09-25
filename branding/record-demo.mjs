// Records the 45-second README demo (docs/demo/demo.mp4) from a
// running dev server with headless Chrome and ffmpeg. Stops short of the
// heart: the final boss never appears.
//
//   npm run dev                       (or the stable server: GAME_URL=http://localhost:5299)
//   npm run demo                      full video with sound (about six minutes)
//   npm run demo -- --silent          no audio pass
//   npm run demo -- --stills [names]  a few stills per segment to a temp folder, for retuning
//                                     (--dense: one every half second)
//   npm run demo -- --audio-only      time the real-time audio pass (frame cost, lag at each shot)
//
// Headless WebGL runs well below 30 fps, so the video is rendered offline: the
// page's animation loop is stopped and the game is stepped exactly 1/30 s per
// screenshot. Sound can't be stepped, so a second pass replays the same
// timeline in real time (rendering off), paced by the audio clock, and records
// the game's output. The replay matches the video: same fixed steps, seeded
// Math.random, and game timers (setTimeout) run on game time. Each segment's
// audio is cut against the audio clock (calibrated with a blip), so nothing
// drifts across the level loads.
//
// Each segment's `script` is a generator body: one `yield` is one frame. The
// helpers on `demo` (below, in the page) walk nav-grid paths with eased stick
// input, turn smoothly and stage fights. When levels change, retune SEGMENTS;
// `--stills` reports any script that ran out of time or got stuck.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, withBrowser } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const GAME = process.env.GAME_URL || 'http://localhost:5199';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
// Rendered larger and scaled down (the game has no antialiasing).
const SCALE = 1.5;
const PLAY_URL = 'miguelsolorio.github.io/the-tithe';

// Each segment: `seconds` long; `level` starts a fresh debug run there (god
// mode); `flags` are set first; `weapon` hands over every item and draws that
// one; `setup` runs once under black; `script` plays it out (see the helpers).
// `subtitles: false` hides the level's own lines where they'd be out of place.
const SEGMENTS = [
  {
    name: 'title',
    seconds: 2,
    setup: `await game.wait(1200);`,
  },
  {
    // One take: follow the ringing to her phone, open the cabin door, and walk
    // into the impossible house: down the hall to the barricaded stairs.
    name: 'field',
    level: 'field',
    seconds: 17.5,
    // The ground floor is built now, not when the door opens (a stall there
    // would hold up the real-time audio pass).
    setup: `game.place(-4.8, 15.2, 0, 0, 0.02); await demo.buildNav({ minX: -16, maxX: 12, minZ: -4, maxZ: 24 });
      game.levels.get('ground');`,
    script: `
      const phone = demo.find('phone');
      const door = demo.find('cabinFront');
      yield* demo.wait(0.3);
      yield* demo.face(phone.pos, 0.6, { pitch: -0.12 });
      yield* demo.walkTo(phone.pos, { stop: 1.05 });
      game.press('KeyF');
      yield* demo.face(phone.pos, 0.55, { rate: 6 });
      demo.use();
      yield* demo.wait(0.3);
      yield* demo.face([door.pos.x, 1.4, door.pos.z], 0.8, { rate: 3.5 });
      yield* demo.walkTo([door.pos.x + 0.2, door.pos.z + 1.5], { stop: 0.35 });
      yield* demo.face([door.pos.x, 1.3, door.pos.z], 0.35, { rate: 7 });
      demo.use();
      // The field's lines end at the door, so the house's own lines play inside.
      game.hud.clearMessages();
      // Through the door (the game fades) and into the ground floor.
      yield* demo.until(() => game.levels.current.id === 'ground' && !game.levels.transitioning);
      demo.nav = null;
      const ropes = [3, 1.1, -3.8];
      yield* demo.wait(0.3);
      yield* demo.walkTo([0.4, -1.9], { stop: 0.4 });
      yield* demo.face([-16, 1.5, -2.1], 1.1, { rate: 3 });
      yield* demo.face(ropes, 0.6, { rate: 3.5 });
      yield* demo.walkTo([3, -2.6], { stop: 0.3, look: ropes });
      yield* demo.face(ropes, 0.3, { rate: 6 });
      demo.use();
      demo.filler = true;
      yield* demo.face([3, 3.8, -9.5], 2.5, { rate: 1.6 });
    `,
  },
  {
    // The blood chapel behind the library: an acolyte comes out from the altar.
    name: 'chapel',
    level: 'ground',
    flags: ['chapel.open', 'chapel.lit'],
    weapon: 'revolver',
    seconds: 5.5,
    subtitles: false,
    setup: `game.player.flashOn = true; game.place(15.4, -5.5, 20.3, -5.5, -0.04);`,
    script: `
      const e = demo.spawnAt('acolyte', 20.5, -7.2);
      yield* demo.wait(0.5);
      yield* demo.track(e, 1.2, { rate: 3 });
      yield* demo.shoot(e);
      yield* demo.track(e, 0.6);
      yield* demo.shoot(e, { kill: true });
      demo.filler = true;
      yield* demo.wait(0.4);
      yield* demo.face([20.1, 1.1, -4.9], 1.5, { rate: 2 });
    `,
  },
  {
    // The drowned dining room: wade along the feast table toward the diner at its head.
    name: 'basement',
    level: 'basement',
    weapon: 'shotgun',
    seconds: 5,
    subtitles: false,
    setup: `game.player.flashOn = true; game.place(18.8, -4.3, 25.1, -2, -0.06, 0);`,
    script: `
      const diner = [25.1, 1.0, -2];
      demo.filler = true;
      yield* demo.wait(0.3);
      yield* demo.walkTo([21.6, -4.4], { stop: 0.3, look: diner });
      yield* demo.face(diner, 2, { rate: 2 });
    `,
  },
  {
    // The cistern: the circle of acolytes at the baptism pool turns on you.
    name: 'cistern',
    level: 'cistern',
    weapon: 'revolver',
    seconds: 5.5,
    setup: `game.player.flashOn = true; game.place(23, 18.5, 23, 12, -0.08);`,
    script: `
      yield* demo.wait(0.2);
      yield* demo.walkTo([22.8, 16.6], { speed: 0.55, stop: 0.3 });
      const a = demo.closest('acolyte');
      yield* demo.track(a, 0.8, { rate: 3 });
      yield* demo.shoot(a);
      yield* demo.track(a, 0.5);
      yield* demo.shoot(a, { kill: true });
      yield* demo.wait(0.2);
      const b = demo.closest('acolyte');
      yield* demo.track(b, 1.0, { rate: 3 });
      yield* demo.shoot(b, { kill: true });
      demo.filler = true;
      yield* demo.track(demo.closest('acolyte'), 2, { rate: 2 });
    `,
  },
  {
    // The flesh caves: the skinless waiting by the hunter's camp.
    name: 'caves',
    level: 'caves',
    weapon: 'shotgun',
    seconds: 6,
    setup: `game.player.flashOn = true; game.place(-13.2, 23, -24, 23, -0.05);`,
    script: `
      const e = demo.nearest('skinless', [-20.3, 23.3]);
      yield* demo.wait(0.2);
      yield* demo.walkTo([-18, 23.2], { speed: 0.5, stop: 0.3, look: () => demo.chest(e), until: () => demo.dist(e) < 4 });
      yield* demo.track(e, 0.6, { rate: 4 });
      yield* demo.shoot(e);
      yield* demo.track(e, 0.7);
      yield* demo.shoot(e, { kill: true });
      yield* demo.wait(0.4);
      demo.filler = true;
      yield* demo.walkTo([-20.5, 23.2], { speed: 0.4, stop: 0.3 });
    `,
  },
  {
    name: 'end',
    seconds: 3.5,
    card: true,
  },
];

// The final boss stays out of the video: no heart level, no Mother, no
// post-boss flags. Checked here and again every frame in the page.
const SPOILERS = /heart|mother|escape/i;
for (const s of SEGMENTS) {
  if (SPOILERS.test(JSON.stringify(s))) throw new Error(`segment "${s.name}" would spoil the final boss`);
}
const TOTAL = SEGMENTS.reduce((n, s) => n + s.seconds, 0);

// Runs in the page: the fade overlay, end card, game-time timers, seeded
// randomness, the movement helpers and the timeline itself.
function installDirector(segments, playUrl, fps) {
  const game = window.game;
  const DT = 1 / fps;
  const AsyncFunction = (async () => {}).constructor;
  const GeneratorFunction = function* () {}.constructor;
  const style = document.createElement('style');
  style.textContent = `
    #fps { display: none !important; }
    body { cursor: none; }
    #demo-fade { position: fixed; inset: 0; background: #000; z-index: 9998; pointer-events: none; }
    #demo-card { position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 28px; opacity: 0; pointer-events: none; background: #000; }
    #demo-card img { width: min(72vw, 900px); }
    #demo-card p { margin: 0; font: 22px/1.4 var(--serif); color: var(--bone); letter-spacing: 0.04em; }
    #demo-card p small { display: block; text-align: center; color: var(--muted); font-size: 17px; }`;
  document.head.append(style);
  const fade = Object.assign(document.createElement('div'), { id: 'demo-fade' });
  const card = Object.assign(document.createElement('div'), { id: 'demo-card' });
  card.innerHTML = `<img src="og.png" alt="" /><p>Play it free in your browser<small>${playUrl}</small></p>`;
  document.body.append(fade, card);

  // No tutorial hints in the trailer.
  const say = game.hud.say.bind(game.hud);
  game.hud.say = (text, ...rest) => (/WASD|Shift|Press F|thumb|stick/.test(text) ? undefined : say(text, ...rest));

  // Game timers on game time: setTimeout calls made while stepping fire after
  // that much stepped time, so the video and the audio replay see them at the
  // same moment. During level loads real timers run (the loads await them).
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const timers = new Map();
  let vnow = 0;
  let vid = 1e9;
  let virtual = false;
  window.setTimeout = (fn, ms = 0, ...args) => {
    if (!virtual) return realSetTimeout(fn, ms, ...args);
    const id = ++vid;
    timers.set(id, { at: vnow + Math.max(0, +ms || 0), fn, args });
    return id;
  };
  window.clearTimeout = (id) => (id > 1e9 ? timers.delete(id) : realClearTimeout(id));
  const advance = (ms) => {
    const end = vnow + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      timers.delete(next[0]);
      vnow = Math.max(vnow, next[1].at);
      try {
        next[1].fn(...next[1].args);
      } catch (e) {
        console.error(e);
      }
    }
    vnow = end;
  };
  // Pending game timers carry on in real time through a load.
  const releaseTimers = () => {
    for (const [id, t] of timers) realSetTimeout(t.fn, Math.max(0, t.at - vnow), ...t.args), timers.delete(id);
  };

  // Seeded random streams (mulberry32). The simulation draws from its own
  // stream, swapped in only while it steps, so rendering and the audio engine's
  // real-time callbacks (which differ between the passes) can't shift it.
  // Level builds and activations get a fresh stream each time.
  const rng = (str) => {
    let a = 0;
    for (const c of str) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 1) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const otherRandom = Math.random;
  let simRandom = rng('sim');
  // The audio engine draws randomness while synthesising (and skips it when
  // its voices are full, which depends on real time), so it uses the other
  // stream and can't shift the simulation's.
  for (let o = Object.getPrototypeOf(game.audio); o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const k of Object.getOwnPropertyNames(o)) {
      if (k === 'constructor' || typeof game.audio[k] !== 'function' || Object.hasOwn(game.audio, k)) continue;
      const f = game.audio[k].bind(game.audio);
      game.audio[k] = (...a) => {
        const prev = Math.random;
        Math.random = otherRandom;
        try {
          return f(...a);
        } finally {
          Math.random = prev;
        }
      };
    }
  }
  const levels = game.levels;
  for (const m of ['get', 'activate']) {
    const f = levels[m].bind(levels);
    levels[m] = (...a) => {
      const prev = Math.random;
      Math.random = rng(`${m}:${a[0]?.id ?? a[0]}`);
      try {
        return f(...a);
      } finally {
        Math.random = prev;
      }
    };
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const ease = (rate) => 1 - Math.exp(-rate * DT);
  // [x, z], [x, y, z] or {x, y, z}; y = null means eye height.
  const pt = (p) => (Array.isArray(p) ? { x: p[0], y: p.length > 2 ? p[1] : null, z: p[p.length - 1] } : p);
  const sway = (t) => [0.012 * Math.sin(t * 0.55) + 0.005 * Math.sin(t * 1.37 + 1), 0.007 * Math.sin(t * 0.8 + 2)];
  const CHEST = { hound: 0.55, lamprey: 0.35 };
  const chest = (e) => ({ x: e.pos.x, y: e.pos.y + (CHEST[e.type] ?? 1.25), z: e.pos.z });

  const segs = segments.map((s) => ({
    ...s,
    setup: s.setup ? new AsyncFunction('game', 'demo', s.setup) : null,
    script: s.script ? new GeneratorFunction('game', 'demo', s.script) : null,
  }));
  const FADE = 0.45;
  let i = -1;
  let local = 0;
  let cur = null;
  let it = null;

  const demo = {
    t: 0,
    throttle: 0,
    stick: 0,
    moveYaw: 0,
    shots: [],
    fired: [],
    lagNow: 0,
    // Set by a script before an open-ended last action (cutting it is fine).
    filler: false,
    nav: null,
    report: [],
    log(msg) {
      demo.report.push(`${cur?.name} ${local.toFixed(1)}s: ${msg}`);
    },

    // ---------- Scene helpers ----------
    find(id) {
      const found = game.levels.current.interactables.find((x) => x.id === id);
      if (!found) throw new Error(`no interactable "${id}" in ${game.levels.current.id}`);
      return found;
    },
    nearest(type, near) {
      const p = pt(near);
      let best = null;
      for (const e of game.levels.current.enemies) {
        if (e.dead || e.type !== type) continue;
        if (!best || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < Math.hypot(best.pos.x - p.x, best.pos.z - p.z)) best = e;
      }
      if (!best) throw new Error(`no ${type} near ${near} in ${game.levels.current.id}`);
      return best;
    },
    // The live enemy of `type` closest to the player (null if none).
    closest(type) {
      let best = null;
      for (const e of game.levels.current.enemies) if (!e.dead && e.type === type && (!best || demo.dist(e) < demo.dist(best))) best = e;
      if (!best) demo.log(`no live ${type} to target`);
      return best;
    },
    dist: (e) => (e ? Math.hypot(e.pos.x - game.player.position.x, e.pos.z - game.player.position.z) : Infinity),
    chest,
    // Spawns an enemy standing at x, z, facing the player.
    spawnAt(type, x, z) {
      const p = game.player.position;
      const g = game.levels.current.physics.groundAt(x, z, p.y + 1.5);
      const pos = p.clone().set(x, g.y > -Infinity ? g.y : p.y, z);
      return game.enemies.spawn(type, pos, { yaw: Math.atan2(p.x - x, p.z - z), idle: 'stand' });
    },
    // Levels without a nav grid (the open field) get one for the demo.
    async buildNav(bounds) {
      try {
        const { NavGrid } = await import('/src/engine/nav.js');
        demo.nav = new NavGrid(game.levels.current.physics, bounds);
      } catch (e) {
        console.warn('[demo] no nav grid, walking straight lines', e);
      }
    },
    route(goal) {
      const p = game.player.position;
      const nav = game.levels.current.nav || demo.nav;
      const path = nav?.findPath(p, { x: goal.x, y: p.y, z: goal.z }, 20000);
      return path?.length ? path.map((w) => ({ x: w.x, z: w.z })) : [{ x: goal.x, z: goal.z }];
    },
    use() {
      game.press('KeyE');
    },

    // ---------- Generators (yield = one frame) ----------
    *wait(seconds) {
      for (let t = 0; t < seconds; t += DT) yield;
    },
    *until(test, maxTime = 5) {
      for (let t = 0; !test(); t += DT) {
        if (t > maxTime) return demo.log('gave up waiting');
        yield;
      }
    },
    // Eases the view toward yaw/pitch; turning speed tops out like a person's.
    turn(yaw, pitch, rate = 4) {
      const p = game.player;
      const k = ease(rate);
      p.yaw += clamp(wrap(yaw - p.yaw) * k, -2.6 * DT, 2.6 * DT);
      if (pitch != null) p.pitch += (pitch - p.pitch) * k;
    },
    lookAngles(target, pitchDefault = -0.04) {
      const q = pt(target);
      const eye = game.camera.position;
      const yaw = Math.atan2(-(q.x - eye.x), -(q.z - eye.z));
      const pitch = q.y == null ? pitchDefault : Math.atan2(q.y - eye.y, Math.hypot(q.x - eye.x, q.z - eye.z));
      return [yaw, pitch];
    },
    *face(target, seconds = 0.6, { rate = 4, pitch = -0.04 } = {}) {
      for (let t = 0; t < seconds; t += DT) {
        const [y, p] = demo.lookAngles(target, pitch);
        demo.turn(y, p, rate);
        yield;
      }
    },
    // Keeps the view on a live enemy's chest.
    *track(e, seconds = 0.6, { rate = 5 } = {}) {
      for (let t = 0; t < seconds && e && !e.dead; t += DT) {
        const [y, p] = demo.lookAngles(chest(e));
        demo.turn(y, p, rate);
        yield;
      }
    },
    // One trigger pull; `kill` makes it the fatal shot, so fights end on cue.
    *shoot(e, { kill = false } = {}) {
      demo.shots.push({ seg: i, at: local, lag: demo.lagNow });
      game.input.mouseDown = true;
      game.input.mousePressed = true;
      yield;
      game.input.mouseDown = false;
      if (kill && e && !e.dead) e.takeDamage(9999, null, null, game.weapons.current);
      yield;
    },
    // Walks a nav-grid path to `target` with eased stick input: slows to turn,
    // eases in and out, and repaths (then gives up) if something blocks it.
    // `look` keeps the eyes on a point (or a function giving one) while
    // walking; `until` stops the walk early.
    *walkTo(target, { stop = 0.35, speed = 1, maxTime = 12, look = null, until = null } = {}) {
      const goal = pt(target);
      let path = demo.route(goal);
      const p = game.player.position;
      let last = p.clone();
      let checkT = 0;
      let repaths = 0;
      for (let t = 0; t < maxTime; t += DT) {
        const dFinal = Math.hypot(goal.x - p.x, goal.z - p.z);
        if (dFinal <= stop || until?.()) return;
        while (path.length > 1 && Math.hypot(path[0].x - p.x, path[0].z - p.z) < 0.7) path.shift();
        const w = path[0];
        // The body walks the path; the head faces along it, or toward `look`
        // (up to ~45° off, like glancing aside). In the last metre the bearing
        // swings about, so the head holds still (or settles on `look`).
        const near = dFinal < 1;
        demo.moveYaw = near ? Math.atan2(-(goal.x - p.x), -(goal.z - p.z)) : Math.atan2(-(w.x - p.x), -(w.z - p.z));
        if (look) {
          const [ly, lp] = demo.lookAngles(typeof look === 'function' ? look() : look);
          demo.turn(near ? ly : demo.moveYaw + clamp(wrap(ly - demo.moveYaw), -0.7, 0.7), lp, 3);
        } else if (!near) demo.turn(demo.moveYaw, -0.05, 3.2);
        // Slow down while the head is still coming round to the path.
        const err = near ? 0 : Math.max(0, Math.abs(wrap(demo.moveYaw - game.player.yaw)) - (look ? 0.75 : 0));
        demo.throttle = speed * clamp(1.1 - err / 0.9, 0, 1) * clamp(dFinal / 1.6, 0.35, 1);
        checkT += DT;
        if (checkT >= 0.6) {
          if (demo.stick > 0.3 && p.distanceTo(last) < 0.15) {
            if (++repaths > 2) {
              demo.log(`stuck walking to ${goal.x.toFixed(1)}, ${goal.z.toFixed(1)}`);
              return;
            }
            path = demo.route(goal);
          }
          last.copy(p);
          checkT = 0;
        }
        yield;
      }
      demo.log(`ran out of time walking to ${goal.x.toFixed(1)}, ${goal.z.toFixed(1)}`);
    },

    // ---------- Timeline ----------
    async begin(s) {
      virtual = false;
      releaseTimers();
      game.input.held.clear();
      game.input.mouseDown = false;
      game.input.stick.f = game.input.stick.r = 0;
      demo.throttle = demo.stick = 0;
      demo.filler = false;
      demo.nav = null;
      while (game.levels.transitioning) await game.wait(50);
      if (s.level) {
        await game.start({ level: s.level });
        if (s.flags) {
          for (const f of s.flags) game.setFlag(f);
          await game.teleport(s.level);
          while (game.levels.transitioning) await game.wait(50);
        }
        game.god(true);
        if (s.weapon) {
          game.give('all');
          // give() queues a switch per weapon; skip straight to this one.
          const w = game.weapons;
          w.pending = null;
          w.state = 'idle';
          w.current = null;
          w.equip(s.weapon, true);
        }
        // Clear the level's entry notice at once (no fade-out on the first frames).
        for (const el of [game.hud.noticeEl, game.hud.subEl]) el.style.transition = 'none';
        game.hud.clearMessages();
        void document.body.offsetHeight;
        for (const el of [game.hud.noticeEl, game.hud.subEl]) el.style.transition = '';
      }
      await s.setup?.(game, demo);
      // A cut is far quicker than walking between levels, so free the voice
      // slots the last level's sounds still hold (the engine caps at 40 and
      // holds each for seconds after it ends); otherwise shots get dropped.
      if (game.audio.ready) game.audio._voiceCount = 0;
      simRandom = rng(s.name);
      it = s.script ? s.script(game, demo) : null;
      virtual = true;
    },
    // Starts the next segment when the current one is over: true when a new
    // segment began, false when the timeline is done.
    async next() {
      if (cur && local < cur.seconds - 1e-6) return null;
      if (cur && it && !demo.filler) demo.log('script cut short (segment ended first)');
      i++;
      local = 0;
      cur = segs[i];
      if (!cur) return false;
      await demo.begin(cur);
      return true;
    },
    // One frame of the current segment: the simulation (on its own random
    // stream), then the render unless skipped.
    frame(skipRender) {
      Math.random = simRandom;
      try {
        demo.simulate();
      } finally {
        Math.random = otherRandom;
      }
      if (!skipRender) {
        if (game.state !== 'title' || game.levels.current) game.fx.render();
        else game.renderer.clear();
      }
      local += DT;
      demo.t += DT;
    },
    simulate() {
      advance(DT * 1000);
      demo.throttle = 0;
      if (it && it.next().done) it = null;
      // Stick input eases toward the throttle, like a thumb on a pad, and
      // points along moveYaw whichever way the head is turned.
      demo.stick += (demo.throttle - demo.stick) * ease(demo.throttle > demo.stick ? 4 : 6);
      if (demo.stick < 0.01) demo.stick = 0;
      const off = wrap(demo.moveYaw - game.player.yaw);
      game.input.stick.f = demo.stick * Math.cos(off);
      game.input.stick.r = -demo.stick * Math.sin(off);
      // A slight, slow drift of the head so the view is never locked still.
      const [sy0, sp0] = sway(demo.t);
      const [sy1, sp1] = sway(demo.t + DT);
      game.player.yaw += sy1 - sy0;
      game.player.pitch += sp1 - sp0;
      const edge = Math.min(local / FADE, (cur.seconds - local) / FADE);
      if (cur.card) {
        fade.style.opacity = 1;
        card.style.opacity = clamp(Math.min((local - 0.3) / 0.8, (cur.seconds - local) / 0.8), 0, 1);
        if (game.audio.ready) game.audio.setVolume(0.9 * Math.max(0, 1 - local / 2.5));
      } else fade.style.opacity = clamp(1 - edge, 0, 1);
      if (game.levels.current?.id === 'heart' || !document.querySelector('#boss').classList.contains('hidden')) {
        throw new Error('spoiler guard: the final boss is on screen');
      }
      if (cur.subtitles === false) game.hud.subEl.classList.remove('show');
      game.frame(DT, true);
      // Rendering would update world matrices; do it here so both passes match.
      game.scene.updateMatrixWorld();
    },
    // Where the player is (the two passes should agree at each segment's end).
    checkpoint: () => `${cur?.name} ${game.player.position.x.toFixed(2)},${game.player.position.z.toFixed(2)} yaw ${game.player.yaw.toFixed(2)}`,
    // Pass 1: one frame; returns the checkpoint, or false when the timeline is done.
    async step(skipRender = false) {
      if ((await demo.next()) === false) return false;
      demo.frame(skipRender);
      return demo.checkpoint();
    },

    // Real-time pass: plays the timeline, paced by the audio clock, recording
    // the game's audio. Returns the recording and each segment's start on the
    // audio clock, plus a calibration blip's time.
    async recordAudio() {
      // Nothing is drawn in this pass, so skip shader compiles on level entry
      // (they'd stall it).
      game.renderer.compile = () => {};
      const ctx = game.listener.context;
      await ctx.resume();
      const dest = ctx.createMediaStreamDestination();
      game.listener.getInput().connect(dest);
      const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(250);
      // The file's timing is anchored by a blip at a known audio-clock time.
      const blip = ctx.currentTime + 0.4;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.8;
      osc.frequency.value = 1000;
      osc.connect(g).connect(dest);
      osc.start(blip);
      osc.stop(blip + 0.05);
      await new Promise((r) => realSetTimeout(r, 900));
      const marks = [];
      const ends = [];
      let start = 0;
      let n = 0;
      let lag = { s: 0, where: '' };
      const cost = {};
      for (;;) {
        if (cur && local >= cur.seconds - 1e-6) ends.push(demo.checkpoint());
        const began = await demo.next();
        if (began === false) break;
        if (began) {
          start = ctx.currentTime;
          n = 0;
          marks.push({ name: cur.name, at: start, seconds: cur.seconds, voices: game.audio._voiceCount });
        }
        const due = ctx.currentTime - start;
        if (n * DT > due) {
          await new Promise((r) => realSetTimeout(r, 3));
          continue;
        }
        // Falling behind matters outside the fades (a level build under the
        // field's door fade stalls a frame, harmlessly).
        const inFade = local < FADE || local > cur.seconds - FADE;
        demo.lagNow = due - n * DT;
        if (!inFade && game.audio.ready && demo.lagNow > lag.s) lag = { s: demo.lagNow, where: `${cur.name} ${local.toFixed(1)}s` };
        const t0 = performance.now();
        demo.frame(true);
        const c = (cost[cur.name] ||= { ms: 0, frames: 0, max: 0 });
        const ms = performance.now() - t0;
        c.ms += ms;
        c.frames++;
        c.max = Math.max(c.max, ms);
        n++;
      }
      await new Promise((r) => ((rec.onstop = r), rec.stop()));
      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let s = '';
      for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
      return { audio: btoa(s), blip, marks, ends, lag, cost, shots: demo.shots, fired: demo.fired, report: demo.report };
    },
  };
  // Every shot the game actually fires (the sync check uses these).
  game.events.on('gunshot', () => demo.fired.push({ seg: i, at: local, voices: game.audio._voiceCount }));
  // The demo drives every frame itself.
  game.renderer.setAnimationLoop(null);
  game.lastFrame = Infinity;
  window.demo = demo;
}

async function openGame(cdp) {
  const { send, once } = cdp;
  try {
    await fetch(GAME);
  } catch {
    throw new Error(`no game server at ${GAME}: start one with \`npm run dev\` (or set GAME_URL)`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: `${GAME}/?debug` });
  await loaded;
  await evaluate(cdp, `new Promise((r) => { const w = () => (window.game ? r() : setTimeout(w, 50)); w(); })`);
  await evaluate(cdp, `game.ready.then(() => document.fonts.ready).then(() => 1)`);
  await evaluate(cdp, `(${installDirector})(${JSON.stringify(SEGMENTS)}, ${JSON.stringify(PLAY_URL)}, ${FPS})`);
}

function write(file, buf) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
}

const starts = [];
SEGMENTS.reduce((t, s) => (starts.push(t), t + s.seconds), 0);

// Pass 1: step and screenshot every frame (or only a few, for --stills).
async function renderFrames(cdp, dir, stills) {
  const { send } = cdp;
  await openGame(cdp);
  const frames = Math.round(TOTAL * FPS);
  const wanted = new Set();
  if (stills) {
    SEGMENTS.forEach((s, k) => {
      if (stills.length && !stills.includes(s.name)) return;
      const n = flag('--dense') ? Math.round(s.seconds * 2) : 3;
      const us = flag('--dense') ? Array.from({ length: n }, (_, j) => (j + 0.5) / n) : [0.15, 0.5, 0.85];
      for (const u of us) wanted.add(Math.round((starts[k] + s.seconds * u) * FPS));
    });
  }
  const ends = [];
  const t0 = Date.now();
  let prev = null;
  for (let f = 0; f < frames; f++) {
    const shoot = !stills || wanted.has(f);
    const cp = await evaluate(cdp, `demo.step(${!shoot})`);
    if (!cp) break;
    const now = cp.split(' ')[0];
    if (prev && prev.split(' ')[0] !== now) ends.push(prev);
    prev = cp;
    if (!shoot) continue;
    if (stills) console.log(`  ${(f / FPS).toFixed(1).padStart(5)} s  ${cp}`);
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    const name = stills ? `${String(f).padStart(4, '0')}-${now}.jpg` : `f${String(f).padStart(5, '0')}.jpg`;
    write(resolve(dir, name), Buffer.from(data, 'base64'));
    if (!stills && f % FPS === 0) process.stdout.write(`\rframes ${f}/${frames} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  ends.push(prev);
  if (!stills) process.stdout.write(`\rframes ${frames}/${frames}\n`);
  const fired = await evaluate(cdp, 'demo.fired');
  if (stills) for (const x of fired) console.log(`  fired ${SEGMENTS[x.seg].name} ${x.at.toFixed(2)}s`);
  for (const line of await evaluate(cdp, 'demo.report')) console.warn(`  note: ${line}`);
  return { ends, fired };
}

// Pass 2: the same timeline in real time, recording sound.
async function recordAudio(cdp) {
  await openGame(cdp);
  console.log(`recording audio (${TOTAL} s in real time)…`);
  return evaluate(cdp, 'demo.recordAudio()');
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const outIdx = args.indexOf('--out');
const OUT = resolve(ROOT, outIdx >= 0 ? args[outIdx + 1] : 'docs/demo/demo.mp4');
const WORK = resolve(tmpdir(), 'tithe-demo');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const chrome = { profile: 'tithe-demo-chrome', flags: ['--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist'] };

if (flag('--stills')) {
  const only = args.filter((a) => !a.startsWith('--'));
  await withBrowser((cdp) => renderFrames(cdp, WORK, only), chrome);
  console.log(`stills in ${WORK}`);
  process.exit(0);
}

// Timing of the real-time audio pass alone, for tuning (nothing is written).
if (flag('--audio-only')) {
  const rec = await withBrowser((cdp) => recordAudio(cdp), chrome);
  for (const [name, c] of Object.entries(rec.cost)) console.log(`  ${name.padEnd(9)} ${(c.ms / c.frames).toFixed(1)} ms/frame (max ${c.max.toFixed(0)} ms)`);
  for (const x of rec.shots) console.log(`  shot ${SEGMENTS[x.seg].name} ${x.at.toFixed(2)}s: ${Math.round(x.lag * 1000)} ms behind`);
  for (const x of rec.fired) console.log(`  fired ${SEGMENTS[x.seg].name} ${x.at.toFixed(2)}s (${x.voices} voices busy)`);
  for (const m of rec.marks) console.log(`  ${m.name} starts with ${m.voices} voices busy`);
  console.log(`  max lag ${rec.lag.s.toFixed(2)} s (${rec.lag.where})`);
  for (const line of rec.report) console.warn(`  note: ${line}`);
  process.exit(0);
}

const { ends: videoEnds, fired } = await withBrowser((cdp) => renderFrames(cdp, WORK, null), chrome);
const silent = flag('--silent');
let audioFilter = [];
if (!silent) {
  const rec = await withBrowser((cdp) => recordAudio(cdp), chrome);
  const webm = resolve(WORK, 'audio.webm');
  const wav = resolve(WORK, 'audio.wav');
  write(webm, Buffer.from(rec.audio, 'base64'));
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', webm, '-ar', '48000', wav]);
  // The calibration blip is the first sound in the file.
  const detect = spawnSync(FFMPEG, ['-hide_banner', '-t', '3', '-i', wav, '-af', 'silencedetect=n=-35dB:d=0.1', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const onsetMatch = /silence_end: ([\d.]+)/.exec(detect);
  if (!onsetMatch) throw new Error('calibration blip not found in the audio recording');
  const onset = +onsetMatch[1];
  if (rec.lag.s > 0.1) console.warn(`  note: the audio pass fell ${rec.lag.s.toFixed(2)} s behind real time (${rec.lag.where}); sound may lag there`);
  const key = (x) => `${SEGMENTS[x.seg].name} ${x.at.toFixed(2)}`;
  if (fired.map(key).join() !== rec.fired.map(key).join()) {
    console.warn(`  note: the passes fired different shots (video: ${fired.map(key).join(', ')}; audio: ${rec.fired.map(key).join(', ')})`);
  }
  rec.ends.forEach((e, k) => {
    const [name, a] = e.split(' ');
    const b = videoEnds[k]?.split(' ')[1];
    if (!b) return;
    const [ax, az] = a.split(',').map(Number);
    const [bx, bz] = b.split(',').map(Number);
    if (Math.hypot(ax - bx, az - bz) > 0.5) console.warn(`  note: ${name} ended ${Math.hypot(ax - bx, az - bz).toFixed(1)} m apart in the two passes`);
  });
  // Each segment's audio, cut from the recording by audio-clock time.
  const parts = rec.marks.map((m, k) => {
    const from = onset + (m.at - rec.blip);
    const f = Math.min(0.15, m.seconds / 4);
    return `[1:a]atrim=start=${from.toFixed(4)}:duration=${m.seconds},asetpts=PTS-STARTPTS,apad=whole_dur=${m.seconds},afade=t=in:d=${f},afade=t=out:st=${(m.seconds - f).toFixed(3)}:d=${f}[a${k}]`;
  });
  audioFilter = [
    '-i', wav,
    '-filter_complex', `${parts.join(';')};${rec.marks.map((_, k) => `[a${k}]`).join('')}concat=n=${rec.marks.length}:v=0:a=1,volume=0.8,alimiter=limit=0.89[aout]`,
    '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '128k',
  ];
}

mkdirSync(dirname(OUT), { recursive: true });
execFileSync(FFMPEG, [
  '-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', resolve(WORK, 'f%05d.jpg'),
  ...audioFilter,
  '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-r', String(FPS),
  '-t', String(TOTAL), '-movflags', '+faststart', OUT,
], { stdio: 'inherit' });

console.log(`wrote ${relative(ROOT, OUT)}`);
// The README plays a copy uploaded to GitHub (it won't play repo files inline).
console.log('README: drag the new video into a GitHub comment box and swap the user-attachments URL in the Demo section');
if (!silent) syncCheck(fired.map((x) => starts[x.seg] + x.at));

// Each scripted gunshot should be heard on the frame it fires: find the
// sharpest rise in loudness near it in the final file and report the offset.
function syncCheck(shots) {
  const RATE = 8000;
  const pcm = execFileSync(FFMPEG, ['-loglevel', 'error', '-i', OUT, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
  const WIN = RATE / 200; // 5 ms
  const energy = (i) => {
    let e = 0;
    for (let k = i; k < i + WIN && k < samples.length; k++) e += samples[k] * samples[k];
    return e / WIN;
  };
  // The first sharp rise to near the loudest point within 100 ms of each shot
  // (later rises are hits, screams, stingers).
  const offsets = shots.map((t) => {
    let peak = 0;
    for (let at = t - 0.1; at < t + 0.1; at += 0.005) peak = Math.max(peak, energy(Math.round(at * RATE)));
    for (let at = t - 0.1; at < t + 0.1; at += 0.005) {
      const i = Math.round(at * RATE);
      if (i < WIN * 8) continue;
      const before = (energy(i - WIN * 8) + energy(i - WIN * 4)) / 2 + 1e3;
      if (energy(i) > 0.5 * peak && energy(i) > 2.5 * before) return { t, ms: Math.round((at - t) * 1000) };
    }
    return null;
  }).filter(Boolean);
  if (!offsets.length) return;
  const sorted = offsets.map((o) => o.ms).sort((a, b) => a - b);
  console.log(`sync check: gunshots heard ${offsets.map((o) => `${o.t.toFixed(2)}s ${o.ms >= 0 ? '+' : ''}${o.ms}`).join(', ')} ms after their frames (median ${sorted[sorted.length >> 1]} ms)`);
}
