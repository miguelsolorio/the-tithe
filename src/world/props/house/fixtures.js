import * as THREE from 'three';
import { Kit, TAU, finish, aabb, addPlate, addJar, addDrip, loftGeo, superRing } from './kit.js';

// Cast-iron kitchen range with a kettle; the stovepipe elbows into the wall
// behind it (at the back of the footprint).
export function stove(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const iron = 'metal';
  const W = 1.0;
  const D = 0.62;
  const zf = D / 2 - 0.04;
  const zb = -D / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.lathe('iron', [[0, 0], [0.035, 0], [0.03, 0.03], [0.022, 0.08], [0.03, 0.13], [0, 0.13]], sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.08), 7);
  }
  k.span(iron, -W / 2, 0.12, zb, W / 2, 0.76, zf);
  k.span(iron, -W / 2 - 0.02, 0.76, zb, W / 2 + 0.02, 0.8, zf + 0.03);
  k.span('nickel', -W / 2 - 0.02, 0.765, zf + 0.03, W / 2 + 0.02, 0.795, zf + 0.036);
  for (const x of [-0.3, 0.02]) {
    for (const z of [-0.13, 0.12]) {
      k.cyl(iron, 0.1, 0.1, 0.01, x, 0.805, z, 0, 0, 0, 16);
      k.box('black', 0.05, 0.003, 0.012, x, 0.8105, z);
    }
  }
  k.span('nickel', 0.22, 0.8, -0.2, 0.47, 0.83, 0.2);
  k.box('iron', 0.06, 0.012, 0.03, 0.345, 0.838, 0.1);
  for (let i = 0; i < 3; i++) k.stain('rust', rng.range(0.03, 0.08), rng.range(0.02, 0.06), rng.range(-0.45, 0.2), 0.8005, rng.range(-0.25, 0.25), 0.45);
  // Back splash and a warming shelf; the pipe rises at the back left.
  k.span(iron, -W / 2, 0.8, zb, W / 2, 1.0, zb + 0.06);
  k.span('rust', -0.14, 1.22, zb, W / 2, 1.25, zb + 0.22);
  for (const x of [-0.1, W / 2 - 0.04]) k.rod('iron', [x, 1.0, zb + 0.04], [x, 1.22, zb + 0.18], 0.01, 0.01, 5);
  const px = -0.33;
  const pz = zb + 0.1;
  k.cyl('rust', 0.07, 0.07, 0.95, px, 1.285, pz, 0, 0, 0, 12);
  k.cyl('rust', 0.078, 0.078, 0.04, px, 0.84, pz, 0, 0, 0, 12);
  k.sphere('rust', 0.072, px, 1.76, pz, 1, 1, 1, 12, 6);
  k.cyl('rust', 0.07, 0.07, 0.1, px, 1.76, zb + 0.05, Math.PI / 2, 0, 0, 12);
  k.cyl('iron', 0.1, 0.1, 0.008, px, 1.76, zb + 0.004, Math.PI / 2, 0, 0, 14);
  // Front: firebox door, oven door, ash drawer.
  const fz = zf + 0.01;
  k.span(iron, -0.46, 0.44, zf, -0.12, 0.7, fz);
  for (let i = 0; i < 3; i++) k.box('black', 0.2, 0.012, 0.004, -0.29, 0.62 - i * 0.03, fz + 0.001);
  k.box('nickel', 0.12, 0.016, 0.02, -0.29, 0.5, fz + 0.012);
  k.span(iron, -0.46, 0.2, zf, -0.12, 0.38, fz);
  k.box('nickel', 0.1, 0.014, 0.018, -0.29, 0.29, fz + 0.01);
  k.span(iron, -0.06, 0.28, zf, 0.46, 0.7, fz);
  k.span(iron, -0.02, 0.32, fz, 0.42, 0.66, fz + 0.008);
  k.box('nickel', 0.4, 0.02, 0.022, 0.2, 0.68, fz + 0.03);
  for (const x of [0.02, 0.38]) k.box('nickel', 0.014, 0.02, 0.03, x, 0.68, fz + 0.016);
  k.cyl('nickel', 0.045, 0.045, 0.01, 0.2, 0.52, fz + 0.012, Math.PI / 2, 0, 0, 14);
  k.cyl('ivory', 0.037, 0.037, 0.004, 0.2, 0.52, fz + 0.018, Math.PI / 2, 0, 0, 14);
  k.box('ink', 0.004, 0.03, 0.002, 0.205, 0.53, fz + 0.021, 0, 0, -0.6);
  // Kettle on a front burner.
  const kx = -0.3;
  const kz = 0.12;
  k.lathe('iron', [[0, 0], [0.09, 0], [0.105, 0.05], [0.1, 0.1], [0.06, 0.14], [0.03, 0.15], [0.03, 0.16], [0, 0.16]], kx, 0.81, kz, 12);
  k.tube('iron', [[kx + 0.08, 0.86, kz], [kx + 0.14, 0.9, kz], [kx + 0.17, 0.95, kz]], (t) => 0.018 - 0.01 * t, 5, 6);
  k.torus('iron', 0.07, 0.007, kx, 0.955, kz, 0, Math.PI / 2, 0, 4, 12, Math.PI);
  return finish(k, 'stove', {}, true);
}

// Two-metre kitchen counter: painted cabinets, butcher-block top, a deep
// ceramic basin with a hand pump, a cleaver in a chopping board.
export function counter(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const L = 2.0;
  const D = 0.62;
  const H = 0.92;
  const body = 'paint';
  const zf = D / 2 - 0.03;
  const zb = -D / 2;
  const s0 = 0.25;
  const s1 = 0.95;
  const by = 0.66;
  k.span('black', -L / 2 + 0.02, 0, zb + 0.02, L / 2 - 0.02, 0.09, zf - 0.06);
  k.span(body, -L / 2, 0.09, zb, s0, H - 0.04, zf);
  k.span(body, s0, 0.09, zb, s1, by, zf);
  k.span(body, s1, 0.09, zb, L / 2, H - 0.04, zf);
  const tt = 0.04;
  k.span('woodDark', -L / 2 - 0.01, H - tt, zb, s0, H, D / 2);
  k.span('woodDark', s1, H - tt, zb, L / 2 + 0.01, H, D / 2);
  k.span('woodDark', s0, H - tt, zb, s1, H, zb + 0.1);
  // Farmhouse basin with an exposed apron front.
  k.span('ceramic', s0 + 0.01, by, zb + 0.1, s1 - 0.01, by + 0.025, zf + 0.03);
  k.span('ceramic', s0 + 0.01, by, zf, s1 - 0.01, H - 0.005, zf + 0.03);
  k.span('ceramic', s0 + 0.01, by, zb + 0.1, s1 - 0.01, H - 0.005, zb + 0.125);
  k.span('ceramic', s0 + 0.01, by, zb + 0.1, s0 + 0.035, H - 0.005, zf + 0.03);
  k.span('ceramic', s1 - 0.035, by, zb + 0.1, s1 - 0.01, H - 0.005, zf + 0.03);
  const scx = (s0 + s1) / 2;
  k.cyl('black', 0.03, 0.03, 0.003, scx, by + 0.0265, 0.06, 0, 0, 0, 10);
  k.stain('decal:grime', 0.2, 0.15, scx, by + 0.0262, 0.05, 0.4);
  k.stain('rust', 0.03, 0.12, scx - 0.02, by + 0.027, -0.05, 0.3);
  k.stainV('decal:grime', 0.25, 0.08, scx, 0.8, zf + 0.0305, 0, 0.4);
  // Hand pump behind the basin.
  const px = scx;
  const pz = zb + 0.055;
  k.cyl('iron', 0.06, 0.06, 0.02, px, H + 0.01, pz, 0, 0, 0, 10);
  k.cyl('iron', 0.04, 0.045, 0.3, px, H + 0.17, pz, 0, 0, 0, 10);
  k.cyl('iron', 0.05, 0.05, 0.03, px, H + 0.33, pz, 0, 0, 0, 10);
  k.rod('iron', [px, H + 0.22, pz + 0.03], [px, H + 0.17, pz + 0.19], 0.016, 0.013, 7);
  k.rod('iron', [px, H + 0.36, pz], [px + 0.25, H + 0.47, pz], 0.011, 0.009, 5);
  k.sphere('iron', 0.018, px + 0.25, H + 0.47, pz, 1, 1, 1, 6, 4);
  // Cabinet doors and drawers.
  const door = (x0, x1, y0, y1) => {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    k.box(body, x1 - x0 - 0.01, y1 - y0 - 0.01, 0.02, cx, cy, zf + 0.01);
    k.box(body, x1 - x0 - 0.09, y1 - y0 - 0.09, 0.01, cx, cy, zf + 0.025);
    return [cx, cy];
  };
  for (const [x0, x1] of [[-0.98, -0.38], [-0.37, 0.24]]) {
    const [cx] = door(x0, x1, 0.12, 0.7);
    k.sphere('brass', 0.013, cx + (x1 - x0) * 0.35, 0.62, zf + 0.034, 1, 1, 1, 6, 4);
    k.box(body, x1 - x0 - 0.01, 0.13, 0.02, cx, 0.8, zf + 0.01);
    k.box('brass', 0.08, 0.012, 0.014, cx, 0.8, zf + 0.027);
  }
  for (const [x0, x1] of [[s0, (s0 + s1) / 2], [(s0 + s1) / 2, s1]]) {
    const [cx] = door(x0, x1, 0.12, by - 0.02);
    k.sphere('brass', 0.013, cx, by - 0.08, zf + 0.034, 1, 1, 1, 6, 4);
  }
  // Clutter: chopping board with a cleaver, stacked plates, a jar, a rag.
  const top = H;
  const bx = rng.range(-0.55, -0.25);
  k.box('wood', 0.42, 0.03, 0.27, bx, top + 0.015, 0.02, 0, rng.range(-0.15, 0.15), 0);
  k.push(bx + 0.05, top + 0.03, 0.03, 0, rng.range(-0.4, 0.4), rng.range(-0.15, 0.15));
  k.box('nickel', 0.17, 0.09, 0.003, 0, 0.03, 0);
  k.cyl('woodDark', 0.014, 0.016, 0.12, 0.14, 0.06, 0, 0, 0, Math.PI / 2 - 0.2, 6);
  k.pop();
  k.stain('decal:bloodSmear', 0.12, 0.08, bx, top + 0.031, 0.03, 0.45);
  k.stain('decal:bloodSplat', 0.1, 0.07, bx + 0.15, top + 0.0005, 0.2, 0.45);
  for (let i = 0; i < 3; i++) addPlate(k, 0.11, -0.85, top + i * 0.012, -0.12);
  addJar(k, 0.05, 0.16, 'murky', -0.05, top, -0.2);
  k.sphere('cloth', 0.08, rng.range(-0.85, -0.7), top + 0.012, 0.17, 1.4, 0.25, 1, 7, 4);
  return finish(k, 'counter', {}, true);
}

// Clawfoot bathtub along X. opts.filled: 'water' | 'blood'.
export function bathtub(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const A = 0.85;
  const B = 0.38;
  const N = 30;
  const ring = (s, y) => superRing(A * s, B * s, y, N, 2.6);
  k.geo('enamel', loftGeo([ring(0.84, 0.16), ring(0.9, 0.2), ring(0.96, 0.34), ring(0.995, 0.5), ring(1.0, 0.6), ring(1.022, 0.615), ring(1.025, 0.64)], { capStart: true }));
  k.geo('ceramic', loftGeo([ring(1.025, 0.64), ring(0.975, 0.64)]));
  const inner = [[0.8, 0.2], [0.88, 0.26], [0.93, 0.4], [0.955, 0.55], [0.965, 0.62], [0.975, 0.64]];
  k.geo('ceramic', loftGeo(inner.map(([s, y]) => ring(s, y)), { inward: true, capStart: true }));
  // Claw feet.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * 0.58;
      const z = sz * 0.2;
      k.lathe('gilt', [[0, 0.03], [0.04, 0.045], [0.046, 0.07], [0.03, 0.1], [0.028, 0.15], [0.042, 0.19], [0, 0.19]], x, 0, z, 6);
      k.sphere('gilt', 0.033, x, 0.033, z, 1, 1, 1, 6, 4);
      for (let t = 0; t < 3; t++) {
        const a = Math.atan2(sz, sx) + (t - 1) * 0.7;
        k.sphere('gilt', 0.013, x + Math.cos(a) * 0.036, 0.012, z + Math.sin(a) * 0.036, 1.7, 0.8, 1, 5, 3, 0, -a, 0);
      }
    }
  }
  // Taps and spout at the -X end.
  const fx = -A + 0.05;
  k.cyl('nickel', 0.012, 0.014, 0.1, fx, 0.69, 0, 0, 0, 0, 8);
  k.tube('nickel', [[fx, 0.735, 0], [fx + 0.05, 0.775, 0], [fx + 0.12, 0.745, 0], [fx + 0.13, 0.7, 0]], 0.012, 8, 6);
  for (const sz of [-1, 1]) {
    k.cyl('nickel', 0.01, 0.01, 0.06, fx, 0.67, sz * 0.09, 0, 0, 0, 6);
    k.box('nickel', 0.05, 0.01, 0.01, fx, 0.705, sz * 0.09);
    k.box('nickel', 0.01, 0.01, 0.05, fx, 0.705, sz * 0.09);
  }
  k.cyl('black', 0.022, 0.022, 0.003, -A * 0.6, 0.202, 0, 0, 0, 0, 10);
  k.stain('rust', 0.035, 0.18, -A * 0.72, 0.2035, 0.02, 0.3);
  if (opts.filled) {
    const blood = opts.filled === 'blood';
    const fy = 0.52;
    k.geo(blood ? 'blood' : 'water', loftGeo([ring(0.95, fy)], { capEnd: true }));
    if (blood) {
      for (let i = 0; i < 5; i++) {
        const t = rng.range(0.1, 0.9) * TAU;
        const top = ring(1.03, 0.635)[Math.floor((t / TAU) * N) % N];
        const len = rng.range(0.12, 0.3);
        const bot = ring(0.99, 0.64 - len)[Math.floor((t / TAU) * N) % N];
        addDrip(k, 'blood', top[0], top[1], top[2], len, 0.007, [bot[0] - top[0], bot[2] - top[2]]);
      }
      k.stain('decal:bloodSmear', 0.12, 0.05, rng.range(-0.3, 0.3), 0.6405, B * 1.0, 0.5);
      for (let i = 0; i < 3; i++) k.stain('decal:bloodSplat', rng.range(0.1, 0.25), rng.range(0.08, 0.2), rng.range(-0.6, 0.6), 0.001, rng.range(0.4, 0.55), 0.45);
    } else {
      k.stain('decal:grime', 0.4, 0.2, rng.range(-0.2, 0.2), fy + 0.001, 0, 0.5);
    }
  }
  return finish(k, 'bathtub', { collider: [aabb([-0.87, 0, -0.39], [0.87, 0.79, 0.39])] }, true);
}

// Pedestal wash basin with taps.
export function sink(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const a = 0.28;
  const b = 0.2;
  const ring = (s, y) => superRing(a * s, b * s, y, 26, 3);
  k.lathe('ceramic', [[0, 0], [0.13, 0], [0.13, 0.015], [0.1, 0.05], [0.07, 0.18], [0.058, 0.45], [0.065, 0.6], [0.11, 0.69], [0, 0.69]], 0, 0, -0.02, 12);
  k.geo('ceramic', loftGeo([ring(0.55, 0.68), ring(0.85, 0.74), ring(0.98, 0.81), ring(1.0, 0.85)], { capStart: true }));
  k.geo('ceramic', loftGeo([ring(1.0, 0.85), ring(0.9, 0.85)]));
  k.geo('ceramic', loftGeo([ring(0.45, 0.76), ring(0.7, 0.785), ring(0.85, 0.83), ring(0.9, 0.85)], { inward: true, capStart: true }));
  k.span('ceramic', -a, 0.845, -b - 0.03, a, 0.9, -b + 0.05);
  for (const sx of [-1, 1]) {
    k.cyl('nickel', 0.012, 0.014, 0.05, sx * 0.13, 0.925, -b + 0.01, 0, 0, 0, 8);
    k.box('nickel', 0.06, 0.012, 0.012, sx * 0.13, 0.955, -b + 0.01);
    k.box('nickel', 0.012, 0.012, 0.06, sx * 0.13, 0.955, -b + 0.01);
  }
  k.tube('nickel', [[0, 0.9, -b + 0.01], [0, 0.96, -b + 0.03], [0, 0.95, -b + 0.1], [0, 0.91, -b + 0.12]], 0.011, 8, 6);
  k.cyl('black', 0.018, 0.018, 0.003, 0, 0.7615, 0, 0, 0, 0, 10);
  k.stain('rust', 0.02, 0.08, 0.005, 0.762, -0.05, 0.3);
  k.stain('decal:grime', 0.14, 0.1, rng.range(-0.05, 0.05), 0.7625, 0, 0.4);
  return finish(k, 'sink', {}, true);
}

// Wall-mounted fuse panel, door hanging open, one fuse missing.
// userData.slot: where the fuse goes (cartridge axis along local X).
// userData.lever: main switch pivot; rotation.x = leverOff (down) / leverOn (up).
// userData.door: the door pivot.
export function fuseBox(opts = {}) {
  const seed = opts.seed ?? 1;
  const k = new Kit(seed);
  const rng = k.rng;
  const W = 0.36;
  const H = 0.5;
  const D = 0.12;
  const hw = W / 2;
  const hh = H / 2;
  const m = 'metal';
  k.span(m, -hw, -hh, 0, hw, hh, 0.012);
  k.span(m, -hw, hh - 0.012, 0, hw, hh, D);
  k.span(m, -hw, -hh, 0, hw, -hh + 0.012, D);
  k.span(m, -hw, -hh, 0, -hw + 0.012, hh, D);
  k.span(m, hw - 0.012, -hh, 0, hw, hh, D);
  k.span('iron', -hw + 0.03, -hh + 0.03, 0.012, hw - 0.03, hh - 0.03, 0.03);
  const empty = opts.empty ?? rng.int(0, 3);
  const sockets = [[-0.075, 0.11], [0.075, 0.11], [-0.075, -0.05], [0.075, -0.05]];
  let slotPos = null;
  sockets.forEach(([x, y], i) => {
    k.box('ceramic', 0.11, 0.05, 0.025, x, y, 0.042);
    for (const sx of [-1, 1]) k.box('brass', 0.012, 0.03, 0.02, x + sx * 0.04, y, 0.062);
    if (i === empty) {
      slotPos = [x, y, 0.066];
    } else {
      k.cyl('ceramic', 0.011, 0.011, 0.07, x, y, 0.066, 0, 0, Math.PI / 2, 10);
      for (const sx of [-1, 1]) k.cyl('brass', 0.012, 0.012, 0.012, x + sx * 0.04, y, 0.066, 0, 0, Math.PI / 2, 10);
    }
  });
  // Main terminal block and wiring up through a conduit.
  k.box('ceramic', 0.22, 0.05, 0.025, 0, -0.16, 0.042);
  for (const x of [-0.07, 0, 0.07]) k.cyl('brass', 0.008, 0.008, 0.012, x, -0.16, 0.06, Math.PI / 2, 0, 0, 6);
  for (const x of [-0.05, 0.05]) k.tube('black', [[x, 0.14, 0.04], [x * 0.6, 0.2, 0.05], [x * 0.3, hh, 0.05]], 0.004, 6, 4);
  k.cyl(m, 0.022, 0.022, 0.3, 0, hh + 0.15, 0.05, 0, 0, 0, 8);
  k.box(m, 0.07, 0.03, 0.05, 0, hh + 0.012, 0.05);
  k.stainV('rust', 0.05, 0.09, rng.range(-0.1, 0.1), -hh + 0.08, 0.0305, 0, 0.4);
  // Switch mount on the right side.
  k.box(m, 0.03, 0.09, 0.07, hw + 0.015, 0.02, 0.05);
  const g = finish(k, 'fuseBox', { collider: 'none', dynamic: true });

  const slot = new THREE.Object3D();
  slot.name = 'fuseBox:slot';
  slot.position.set(...slotPos);
  g.add(slot);

  const dk = new Kit(seed + 7);
  dk.span(m, 0, -hh, 0, W, hh, 0.012);
  dk.box('nickel', 0.02, 0.07, 0.016, W - 0.03, 0, 0.018);
  dk.box('paper', 0.16, 0.11, 0.002, W / 2, 0.1, -0.002);
  for (let i = 0; i < 4; i++) dk.box('ink', 0.1 - i * 0.015, 0.006, 0.001, W / 2, 0.13 - i * 0.018, -0.0035);
  dk.stainV('decal:bloodSmear', 0.04, 0.05, W - 0.05, -0.05, 0.0125, 0, 0.45);
  const door = dk.build('fuseBox:door');
  door.position.set(-hw, 0, D);
  door.rotation.y = -1.9;
  g.add(door);

  const lk = new Kit(seed + 9);
  lk.cyl('iron', 0.016, 0.016, 0.05, 0, 0, 0, 0, 0, Math.PI / 2, 8);
  lk.rod('nickel', [0, 0, 0], [0, 0, 0.13], 0.007, 0.006, 6);
  lk.sphere('black', 0.018, 0, 0, 0.14, 1, 1, 1.2, 8, 6);
  const lever = lk.build('fuseBox:lever');
  lever.position.set(hw + 0.045, 0.02, 0.07);
  lever.rotation.x = 0.6;
  g.add(lever);

  Object.assign(g.userData, { slot, lever, door, leverOff: 0.6, leverOn: -0.6 });
  return g;
}

// Casing, sill and apron around a window opening. Origin on the floor at the
// wall surface, window centred on X, everything sticks out along +Z.
function casing(k, W, H, sill, m) {
  const x0 = -W / 2;
  const x1 = W / 2;
  const y0 = sill;
  const y1 = sill + H;
  const cw = 0.09;
  k.span(m, x0 - cw, y0 - 0.02, 0, x0, y1 + 0.02, 0.03);
  k.span(m, x1, y0 - 0.02, 0, x1 + cw, y1 + 0.02, 0.03);
  k.span(m, x0 - cw - 0.02, y1 + 0.02, 0, x1 + cw + 0.02, y1 + 0.14, 0.035);
  k.span(m, x0 - cw - 0.03, y1 + 0.14, 0, x1 + cw + 0.03, y1 + 0.165, 0.05);
  k.span(m, x0 - cw - 0.03, y0 - 0.035, 0, x1 + cw + 0.03, y0, 0.1);
  k.span(m, x0 - cw + 0.01, y0 - 0.12, 0, x1 + cw - 0.01, y0 - 0.035, 0.022);
  // Dark reveal just inside the casing.
  k.span('black', x0, y0, 0.001, x0 + 0.012, y1, 0.02);
  k.span('black', x1 - 0.012, y0, 0.001, x1, y1, 0.02);
  k.span('black', x0, y1 - 0.012, 0.001, x1, y1, 0.02);
}

// Window with planks nailed across. opts.glow puts faint dusk light behind.
// Origin on the floor at the wall surface (no wall hole needed).
export function boardedWindow(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = opts.w ?? 0.9;
  const H = opts.h ?? 1.35;
  const sill = opts.sill ?? 0.85;
  casing(k, W, H, sill, 'woodRotten');
  k.span(opts.glow ? 'dusk' : 'black', -W / 2, sill, 0.001, W / 2, sill + H, 0.003);
  // What's left of the sash behind the boards.
  const m = 'woodRotten';
  k.span(m, -0.015, sill, 0.004, 0.015, sill + H, 0.02);
  k.span(m, -W / 2, sill + H / 2 - 0.02, 0.004, W / 2, sill + H / 2 + 0.02, 0.02);
  for (const y of [sill + H * 0.25, sill + H * 0.75]) k.span(m, -W / 2, y - 0.01, 0.006, W / 2, y + 0.01, 0.016);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Shape();
    const cx = (rng() < 0.5 ? -1 : 1) * W * 0.25;
    const cy = sill + H * (rng() < 0.5 ? 0.25 : 0.75);
    s.moveTo(0, 0);
    s.lineTo(rng.range(0.06, 0.16), 0);
    s.lineTo(rng.range(0, 0.05), rng.range(0.08, 0.2));
    k.geo('glass', new THREE.ShapeGeometry(s), cx + rng.range(-0.15, 0.1), cy + rng.range(-0.1, 0.05), 0.012, 0, 0, rng() * TAU);
  }
  const n = rng.int(5, 7);
  for (let i = 0; i < n; i++) {
    const y = sill + 0.12 + (i * (H - 0.22)) / (n - 1) + rng.range(-0.04, 0.04);
    const a = rng() < 0.35 ? rng.range(-0.3, 0.3) : rng.range(-0.06, 0.06);
    const len = W + rng.range(0.22, 0.34);
    const bw = rng.range(0.1, 0.17);
    const z = 0.045 + i * 0.004;
    k.box(rng() < 0.5 ? 'woodRotten' : 'wood', len, bw, 0.022, rng.range(-0.03, 0.03), y, z, 0, 0, a);
    for (const s of [-1, 1]) {
      const nx = s * (len / 2 - 0.05);
      k.cyl('metal', 0.006, 0.006, 0.006, nx * Math.cos(a), y + nx * Math.sin(a), z + 0.013, Math.PI / 2, 0, 0, 5);
    }
  }
  const lights = opts.glow ? [{ offset: [0, +(sill + H / 2).toFixed(3), 0.35], color: 0xc8762a, intensity: 0.6, distance: 3.5, flicker: 0, kind: 'window' }] : [];
  return finish(k, 'boardedWindow', { collider: 'none', lights });
}

// Pleated curtain panel hanging from y1 to y0 across [x0, x1] (two-sided).
function curtainGeo(rng, x0, x1, y0, y1, z, pleats) {
  const cols = pleats * 4;
  const rows = 6;
  const hem = [];
  for (let i = 0; i <= cols; i++) hem.push(rng.range(0, 0.05) + (rng() < 0.15 ? rng.range(0.05, 0.2) : 0));
  const pos = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const x = x0 + (x1 - x0) * u;
      const y = y1 - (y1 - y0) * v + (j === rows ? hem[i] : 0) * v;
      const depth = 0.02 + 0.035 * v;
      pos.push(x, y, z + depth * Math.sin(u * pleats * TAU));
    }
  }
  const front = [];
  const back = [];
  const w = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * w + i;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      front.push(a, c, b, b, c, d);
      back.push(a, b, c, b, d, c);
    }
  }
  const mk = (idx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  return [mk(front), mk(back)];
}

// Dark sash window with heavy curtains. Origin on the floor at the wall
// surface (no wall hole needed); opts.curtains = false leaves them off.
export function sashWindow(opts = {}) {
  const k = new Kit(opts.seed ?? 1);
  const rng = k.rng;
  const W = opts.w ?? 0.9;
  const H = opts.h ?? 1.35;
  const sill = opts.sill ?? 0.85;
  const m = 'wood';
  casing(k, W, H, sill, m);
  k.span('black', -W / 2, sill, 0.001, W / 2, sill + H, 0.002);
  const sash = (yA, yB, z) => {
    k.span(m, -W / 2, yA, z, W / 2, yA + 0.05, z + 0.03);
    k.span(m, -W / 2, yB - 0.04, z, W / 2, yB, z + 0.03);
    k.span(m, -W / 2, yA, z, -W / 2 + 0.045, yB, z + 0.03);
    k.span(m, W / 2 - 0.045, yA, z, W / 2, yB, z + 0.03);
    k.span(m, -0.01, yA, z + 0.006, 0.01, yB, z + 0.024);
    k.span(m, -W / 2, (yA + yB) / 2 - 0.01, z + 0.006, W / 2, (yA + yB) / 2 + 0.01, z + 0.024);
    k.span('glass', -W / 2 + 0.04, yA + 0.04, z + 0.013, W / 2 - 0.04, yB - 0.04, z + 0.016);
  };
  const ym = sill + H / 2;
  sash(ym - 0.02, sill + H, 0.004);
  sash(sill, ym + 0.02, 0.036);
  if (opts.curtains !== false) {
    const ry = sill + H + 0.24;
    const rx = W / 2 + 0.32;
    k.rod('brass', [-rx, ry, 0.13], [rx, ry, 0.13], 0.012, 0.012, 8);
    for (const sx of [-1, 1]) {
      k.sphere('brass', 0.025, sx * rx, ry, 0.13, 1, 1, 1, 8, 6);
      k.box('brass', 0.02, 0.03, 0.13, sx * (rx - 0.06), ry, 0.065);
    }
    const cm = opts.fabric ?? (rng() < 0.6 ? 'clothRed' : 'cloth');
    for (const sx of [-1, 1]) {
      const xa = sx > 0 ? W / 2 - 0.12 : -rx + 0.02;
      const xb = sx > 0 ? rx - 0.02 : -W / 2 + 0.12;
      for (const g of curtainGeo(rng, xa, xb, 0.02, ry - 0.01, 0.11, 5)) k.geo(cm, g);
    }
  }
  return finish(k, 'window', { collider: 'none' });
}
