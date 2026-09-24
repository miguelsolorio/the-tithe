import * as THREE from 'three';
import { Kit, TAU, finish, candleLight, bulbLight, centroid, addCandle, addChain, addSkull, addDrip } from './kit.js';

const BULB = [[0, -0.1], [0.012, -0.098], [0.03, -0.076], [0.033, -0.05], [0.022, -0.02], [0.012, -0.005], [0.011, 0], [0, 0]];
const lift = (p, dy) => [p[0], +(p[1] + dy).toFixed(3), p[2]];

// Pillar candle on a brass chamberstick dish. opts.lit (default true), opts.h.
export function candle(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const lit = opts.lit !== false;
  const h = opts.h ?? rng.range(0.1, 0.22);
  const r = opts.r ?? rng.range(0.028, 0.04);
  const wax = opts.wax ?? (rng() < 0.25 ? 'waxRed' : 'wax');
  k.lathe('brass', [[0, 0], [0.075, 0], [0.08, 0.014], [0.074, 0.016], [0.05, 0.008], [0, 0.008]], 0, 0, 0, 12);
  k.torus('brass', 0.022, 0.005, 0.092, 0.028, 0, 0, 0, 0, 4, 10);
  k.stain(lit ? wax : 'waxOld', r * 1.7, r * 1.5, 0.01, 0.0092, 0.005, 0.3);
  k.push(0, 0.008, 0);
  const f = addCandle(k, { h, r, lit, wax, drips: rng.int(2, 5) });
  k.pop();
  return finish(k, 'candle', { collider: 'none', lights: f ? [candleLight(f)] : [] });
}

// Ritual cluster of 5-9 floor candles in a shared wax puddle.
export function candleCluster(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const n = opts.count ?? rng.int(5, 9);
  const R = 0.1 + n * 0.028;
  k.stain('wax', R * 0.95, R * 0.8, 0, 0.0015, 0, 0.35, 12);
  for (let i = 0; i < 3; i++) k.stain('waxOld', rng.range(0.05, 0.1), rng.range(0.04, 0.08), rng.range(-R, R) * 0.8, 0.0025, rng.range(-R, R) * 0.8, 0.4);
  const flames = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + rng.range(-0.3, 0.3);
    const d = Math.sqrt((i + 0.5) / n) * R * 0.85;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = rng.range(0.06, 0.34) * (1 - (d / R) * 0.55);
    const r = rng.range(0.024, 0.045);
    const wax = rng() < 0.3 ? 'waxRed' : 'wax';
    k.push(x, 0.002, z);
    const f = addCandle(k, { h: Math.max(0.05, h), r, lit: i === 0 || rng() > 0.12, wax, drips: rng.int(2, 4) });
    k.lathe(wax, [[0, 0], [r * 1.6, 0], [r * 1.2, 0.006], [0, 0.01]], 0, -0.002, 0, 8);
    k.pop();
    if (f) flames.push({ p: f, a });
  }
  const lights = [];
  if (flames.length <= 6) {
    lights.push(candleLight(lift(centroid(flames.map((f) => f.p)), 0.05), { intensity: 1.5, distance: 5.5 }));
  } else {
    const west = flames.filter((f) => f.p[0] < 0).map((f) => f.p);
    const east = flames.filter((f) => f.p[0] >= 0).map((f) => f.p);
    for (const group of [west, east]) if (group.length) lights.push(candleLight(lift(centroid(group), 0.05), { intensity: 1.1, distance: 5 }));
  }
  return finish(k, 'candleCluster', { collider: 'none', lights });
}

// Five-arm candelabra (tabletop); opts.tall makes a floor-standing iron one.
export function candelabra(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const tall = !!opts.tall;
  const lit = opts.lit !== false;
  const m = tall ? 'iron' : 'brass';
  const s = tall ? 1.35 : 1;
  const knot = tall ? 1.3 : 0.24;
  if (tall) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      k.tube(m, [[0, 0.2, 0], [c * 0.12, 0.1, sn * 0.12], [c * 0.24, 0.02, sn * 0.24], [c * 0.28, 0.015, sn * 0.28]], (t) => 0.016 - 0.005 * t, 6, 5);
      k.sphere(m, 0.02, c * 0.28, 0.02, sn * 0.28, 1, 1, 1, 5, 4);
    }
    k.lathe(m, [[0, 0.15], [0.035, 0.15], [0.02, 0.24], [0.013, 0.3], [0.012, knot - 0.3], [0.03, knot - 0.24], [0.012, knot - 0.18], [0.012, knot - 0.03], [0.026, knot], [0, knot]], 0, 0, 0, 8);
  } else {
    k.lathe(m, [[0, 0], [0.085, 0], [0.08, 0.015], [0.03, 0.04], [0.016, 0.06], [0.024, 0.1], [0.012, 0.14], [0.012, knot - 0.02], [0.022, knot], [0, knot]], 0, 0, 0, 10);
  }
  const cups = [[0, knot + 0.07 * s]];
  for (const sx of [-1, 1]) {
    for (const [dx, h] of [[0.1, 0.05], [0.2, 0.025]]) {
      const x = sx * dx * s;
      const top = knot + h * s;
      k.tube(m, [[sx * 0.01, knot - 0.005, 0], [x * 0.45, knot - 0.06 * s, 0], [x * 0.92, knot - 0.035 * s, 0], [x, top - 0.01, 0]], 0.0065 * s, 8, 4);
      cups.push([x, top]);
    }
  }
  k.cyl(m, 0.012 * s, 0.012 * s, 0.07 * s, 0, knot + 0.035 * s, 0, 0, 0, 0, 6);
  const flames = [];
  for (const [x, y] of cups) {
    k.lathe(m, [[0, 0], [0.03, 0.004], [0.03, 0.01], [0.012, 0.008], [0.012, 0.022], [0, 0.022]].map(([a, b]) => [a * s, b]), x, y, 0, 8);
    k.push(x, y + 0.022, 0);
    const f = addCandle(k, { h: rng.range(0.1, 0.22) * (tall ? 1.3 : 1), r: 0.011 * s, lit: lit && rng() > 0.1, drips: 2 });
    k.pop();
    if (f) flames.push(f);
  }
  const lights = flames.length ? [candleLight(lift(centroid(flames), 0.03), { intensity: 1.5, distance: 5.5, flicker: 0.45 })] : [];
  return finish(k, 'candelabra', { collider: tall ? undefined : 'none', lights }, tall);
}

// Iron wheel chandelier with candles, hung on chains. Origin at the ceiling;
// opts.drop = ceiling to wheel (default 1.1). opts.lit (default true).
export function chandelier(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const drop = opts.drop ?? 1.1;
  const lit = opts.lit !== false;
  const R = opts.r ?? 0.42;
  const ry = -drop;
  const jy = ry + Math.min(0.5, drop * 0.5);
  k.cyl('iron', 0.07, 0.07, 0.02, 0, -0.01, 0, 0, 0, 0, 12);
  k.torus('iron', 0.018, 0.005, 0, -0.035, 0, 0, 0, 0, 4, 8);
  addChain(k, [0, -0.05, 0], [0, jy + 0.02, 0], { m: 'iron', link: 0.1, tubular: 4 });
  k.torus('iron', 0.028, 0.006, 0, jy, 0, Math.PI / 2, 0, 0, 4, 10);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 6;
    addChain(k, [Math.cos(a) * 0.022, jy - 0.01, Math.sin(a) * 0.022], [Math.cos(a) * R, ry + 0.02, Math.sin(a) * R], { m: 'iron', link: 0.1, tubular: 4 });
  }
  k.torus('iron', R, 0.016, 0, ry, 0, Math.PI / 2, 0, 0, 5, 30);
  k.torus('iron', 0.12, 0.012, 0, ry, 0, Math.PI / 2, 0, 0, 4, 14);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    k.rod('iron', [Math.cos(a) * 0.12, ry, Math.sin(a) * 0.12], [Math.cos(a) * R, ry, Math.sin(a) * R], 0.009, 0.009, 5);
  }
  const n = opts.candles ?? 7;
  const flames = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.PI / n;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    k.lathe('iron', [[0, 0], [0.032, 0.004], [0.03, 0.01], [0.012, 0.008], [0.012, 0.025], [0, 0.025]], x, ry + 0.012, z, 6);
    k.push(x, ry + 0.037, z);
    const on = lit && rng() > 0.12;
    const f = addCandle(k, { h: rng.range(0.06, 0.2), r: rng.range(0.018, 0.026), lit: on, drips: 2, seg: 6 });
    k.pop();
    if (f) flames.push(f);
    const icicles = rng.int(1, 2);
    for (let j = 0; j < icicles; j++) {
      const len = rng.range(0.03, 0.12);
      k.cyl(on ? 'wax' : 'waxOld', 0.006, 0.001, len, x + rng.range(-0.025, 0.025), ry - 0.01 - len / 2, z + rng.range(-0.025, 0.025), 0, 0, 0, 4);
    }
  }
  const lights = flames.length ? [candleLight([0, +(ry + 0.16).toFixed(3), 0], { intensity: 2.2, distance: 7, flicker: 0.4 })] : [];
  return finish(k, 'chandelier', { collider: 'none', lights });
}

// Bare bulb on a cord. Origin at the ceiling; opts.drop (cord length,
// default 0.6), opts.on (default true), opts.flicker.
export function bulb(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const drop = opts.drop ?? 0.6;
  const on = opts.on !== false;
  k.cyl('ceramic', 0.045, 0.05, 0.018, 0, -0.009, 0, 0, 0, 0, 12);
  k.cyl('black', 0.0035, 0.0035, drop, 0, -drop / 2, 0, 0, 0, 0, 5);
  k.lathe('black', [[0, 0], [0.017, 0], [0.018, 0.045], [0.01, 0.056], [0.004, 0.062], [0, 0.062]], 0, -drop - 0.055, 0, 10);
  const by = -drop - 0.055;
  k.lathe(on ? 'bulbOn' : 'bulbOff', BULB, 0, by, 0, 10);
  const lights = on ? [bulbLight([0, +(by - 0.05).toFixed(3), 0], { flicker: opts.flicker ?? 0.1 })] : [];
  return finish(k, 'bulb', { collider: 'none', lights });
}

// Wall candle sconce. Origin on the wall at the backplate centre.
export function sconce(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const lit = opts.lit !== false;
  k.geo('brass', new THREE.CylinderGeometry(0.045, 0.05, 0.012, 14), 0, 0, 0.006, Math.PI / 2, 0, 0, 1, 1, 1.7);
  k.sphere('brass', 0.014, 0, -0.04, 0.014, 1, 1, 1, 6, 4);
  k.tube('brass', [[0, -0.04, 0.012], [0, -0.07, 0.07], [0, -0.03, 0.13], [0, 0.0, 0.15]], 0.007, 10, 5);
  k.lathe('brass', [[0, 0], [0.045, 0.006], [0.047, 0.014], [0.042, 0.014], [0.015, 0.01], [0.015, 0.03], [0, 0.03]], 0, 0, 0.15, 10);
  k.push(0, 0.03, 0.15);
  const f = addCandle(k, { h: opts.h ?? rng.range(0.08, 0.15), r: 0.02, lit, drips: 3 });
  k.pop();
  addDrip(k, lit ? 'wax' : 'waxOld', 0.043, 0.012, 0.16, rng.range(0.02, 0.05), 0.004);
  return finish(k, 'sconce', { collider: 'none', lights: f ? [candleLight(f, { distance: 4.5 })] : [] });
}

// Standard lamp with a cloth shade. opts.on lights the bulb and shade.
export function floorLamp(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const on = !!opts.on;
  k.lathe('brass', [[0, 0], [0.16, 0], [0.16, 0.012], [0.12, 0.03], [0.05, 0.05], [0.03, 0.07], [0, 0.07]], 0, 0, 0, 14);
  k.cyl('brass', 0.012, 0.012, 1.38, 0, 0.76, 0, 0, 0, 0, 6);
  for (const y of [0.5, 1.0]) k.sphere('brass', 0.02, 0, y, 0, 1, 0.8, 1, 8, 5);
  k.cyl('black', 0.018, 0.018, 0.05, 0, 1.47, 0, 0, 0, 0, 8);
  k.lathe(on ? 'bulbOn' : 'bulbOff', BULB, 0, 1.495, 0, 10, Math.PI, 0, 0);
  const shade = on ? 'shadeOn' : 'shade';
  const pts = [[0.25, 1.3], [0.245, 1.33], [0.135, 1.6], [0.125, 1.62]];
  k.lathe(shade, pts, 0, 0, 0, 16);
  k.lathe(shade, pts.slice().reverse().map(([r, y]) => [r - 0.004, y]), 0, 0, 0, 16);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    k.rod('brass', [0, 1.5, 0], [Math.cos(a) * 0.123, 1.615, Math.sin(a) * 0.123], 0.003, 0.003, 4);
  }
  return finish(k, 'floorLamp', { lights: on ? [bulbLight([0, 1.55, 0], { flicker: 0.05 })] : [] }, true);
}

const FIRE = [[0, 0], [0.05, 0.03], [0.06, 0.1], [0.04, 0.2], [0.015, 0.3], [0, 0.34]];

// Stone fireplace with a wooden mantel. The firebox opening faces +Z; the
// footprint includes the hearth. opts.lit adds burning logs and a light.
export function fireplace(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const lit = !!opts.lit;
  const st = opts.material ?? 'stone';
  const zb = -0.45;
  const zf = 0;
  const ox = 0.4;
  const oy = 0.75;
  for (const sx of [-1, 1]) {
    k.span(st, sx * ox, 0.05, zb, sx * 0.8, 1.1, zf);
    k.span(st, sx * (ox - 0.02), 0.05, zf - 0.02, sx * 0.82, 0.16, zf + 0.03);
    k.span(st, sx * (ox - 0.02), 0.95, zf - 0.02, sx * 0.82, 1.02, zf + 0.025);
  }
  k.span(st, -ox, oy, zb, ox, 1.1, zf);
  k.span(st, -0.1, oy - 0.03, zf - 0.01, 0.1, oy + 0.1, zf + 0.025);
  // Sooty brick firebox.
  k.span('brick', -ox, 0.05, zb, ox, oy, zb + 0.06);
  k.box('brick', 0.05, oy - 0.05, 0.42, -ox + 0.06, (oy + 0.05) / 2, zb + 0.24, 0, -0.25, 0);
  k.box('brick', 0.05, oy - 0.05, 0.42, ox - 0.06, (oy + 0.05) / 2, zb + 0.24, 0, 0.25, 0);
  k.span('black', -ox, oy - 0.01, zb + 0.06, ox, oy, zf - 0.005);
  k.stainV('decal:grime', 0.28, 0.1, 0, oy + 0.08, zf + 0.026, 0, 0.3);
  k.stainV('decal:grime', 0.3, 0.25, 0, 0.45, zb + 0.061, 0, 0.3);
  // Hearth and firebox floor.
  k.span(st, -0.86, 0, zf - 0.02, 0.86, 0.05, 0.44);
  k.span(st, -ox, 0, zb + 0.06, ox, 0.05, zf);
  // Mantel shelf, moulding, corbels.
  k.span('woodDark', -0.9, 1.1, zb, 0.9, 1.16, zf + 0.1);
  k.span('woodDark', -0.85, 1.07, zb, 0.85, 1.1, zf + 0.055);
  for (const sx of [-1, 1]) k.span('woodDark', sx * 0.68, 0.96, zf, sx * 0.75, 1.07, zf + 0.05);
  // Grate.
  for (let i = 0; i < 5; i++) k.box('iron', 0.012, 0.012, 0.28, -0.2 + i * 0.1, 0.13, -0.22);
  for (const z of [-0.09, -0.35]) {
    k.box('iron', 0.5, 0.015, 0.015, 0, 0.13, z);
    for (const sx of [-1, 1]) k.box('iron', 0.015, 0.09, 0.015, sx * 0.24, 0.09, z);
  }
  for (const y of [0.18, 0.23]) k.box('iron', 0.5, 0.012, 0.012, 0, y, -0.085);
  let lights = [];
  if (lit) {
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.5 + rng.range(-0.15, 0.15);
      k.cyl(i === 1 ? 'char' : 'woodDark', 0.045, 0.05, 0.5, 0, 0.19 + (i === 1 ? 0.06 : 0), -0.22, Math.PI / 2, a, 0, 8);
    }
    for (let i = 0; i < 16; i++) k.box('ember', rng.range(0.02, 0.05), 0.015, rng.range(0.02, 0.05), rng.range(-0.2, 0.2), rng.range(0.14, 0.2), rng.range(-0.34, -0.1), rng.range(-0.4, 0.4), rng() * TAU, 0);
    k.stain('ember', 0.2, 0.12, 0, 0.052, -0.22, 0.4);
    for (let i = 0; i < 6; i++) {
      const sc = rng.range(0.6, 1.1);
      k.lathe('candleFlame', FIRE.map(([a, b]) => [a * sc, b * sc]), rng.range(-0.16, 0.16), 0.2, rng.range(-0.3, -0.14), 6);
    }
    lights = [{ offset: [0, 0.42, -0.1], color: 0xff7a30, intensity: 2.6, distance: 7, flicker: 0.55, kind: 'candle' }];
  } else {
    k.lathe('ash', [[0, 0], [0.26, 0], [0.18, 0.025], [0.08, 0.04], [0, 0.045]], 0, 0.05, -0.22, 10, 0, 0, 0, 1, 1, 0.7);
    k.cyl('char', 0.04, 0.045, 0.34, 0.03, 0.14, -0.2, Math.PI / 2, 0.5, 0, 7);
    for (let i = 0; i < 3; i++) k.rod('bone', [rng.range(-0.15, 0.1), 0.085, rng.range(-0.3, -0.12)], [rng.range(-0.1, 0.15), 0.08, rng.range(-0.3, -0.12)], 0.008, 0.006, 5);
  }
  // On the mantel: two candlesticks and a skull.
  for (const sx of [-1, 1]) {
    const x = sx * 0.6;
    k.lathe('brass', [[0, 0], [0.045, 0], [0.04, 0.012], [0.012, 0.03], [0.011, 0.16], [0.024, 0.18], [0.02, 0.192], [0, 0.192]], x, 1.16, -0.2, 8);
    k.push(x, 1.352, -0.2);
    addCandle(k, { h: rng.range(0.06, 0.15), r: 0.012, lit: false, drips: 2 });
    k.pop();
  }
  k.push(rng.range(-0.2, 0.2), 1.16, -0.2, 0, rng.range(-0.5, 0.5), 0);
  addSkull(k, { jaw: false });
  k.pop();
  return finish(k, 'fireplace', { lights }, true);
}
