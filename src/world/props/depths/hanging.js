import * as THREE from 'three';
import { makeRng } from '../../../core/rng.js';
import { Kit, TAU, v3, xf, box, cyl, sphere, torus, tube, ico, chain, boltHead, deform, fbm3 } from './kit.js';
import { addSkull, addLongBone, addRib } from './bones.js';

// Chains, hooks and cages hung from the ceiling (origin at the attachment).

function ceilingEye(kit, r = 0.05) {
  kit.add('rust', cyl(r, r * 1.2, 0.02, 10), xf([0, -0.01, 0]));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    boltHead(kit, 'metal', [Math.cos(a) * r * 0.75, -0.02, Math.sin(a) * r * 0.75], 0.008, 0.006, [0, -1, 0]);
  }
  kit.add('rust', torus(r * 0.35, r * 0.1, 5, 12), xf([0, -0.02 - r * 0.35, 0]));
  return -0.02 - r * 0.7;
}

export function chainHanging(opts = {}) {
  const L = opts.length ?? 1.5;
  const heavy = opts.heavy ?? false;
  const kit = new Kit();
  const y = ceilingEye(kit, heavy ? 0.08 : 0.05);
  const s = heavy ? 1.6 : 1;
  chain(kit, 'rust', [0, y, 0], [0, -1, 0], Math.max(0.1, L + y), { R: 0.022 * s, r: 0.0065 * s });
  const obj = kit.build();
  obj.userData.collider = 'none';
  obj.userData.mount = 'ceiling';
  return obj;
}

// Butcher's hook on a chain; opts.meat hangs a slab of flesh on it.
export function meatHook(opts = {}) {
  const L = opts.length ?? 1.1;
  const kit = new Kit();
  const y = ceilingEye(kit);
  const end = chain(kit, 'rust', [0, y, 0], [0, -1, 0], Math.max(0.1, L - 0.3 + y), { R: 0.016, r: 0.005 });
  // swivel + hook
  const top = end.y - 0.01;
  kit.add('metal', torus(0.02, 0.005, 5, 10), xf([0, top - 0.012, 0], [0, Math.PI / 2, 0]));
  kit.add('metal', cyl(0.012, 0.012, 0.035, 8), xf([0, top - 0.045, 0]));
  const pts = [v3(0, top - 0.06, 0), v3(0, top - 0.16, 0)];
  const cx = 0.05;
  const cy = top - 0.2;
  for (let i = 1; i <= 8; i++) {
    const a = Math.PI + (i / 8) * (Math.PI + 0.9);
    pts.push(v3(cx + Math.cos(a) * 0.05, cy + Math.sin(a) * 0.05, 0));
  }
  kit.add('metal', tube(pts, { segs: 18, radial: 6, radius: (t) => 0.0095 * Math.min(1, (1 - t) * 3.5) + 0.0008 }));
  if (opts.meat) {
    const slab = sphere(0.16, 10, 8);
    deform(slab, (v) => {
      v.x *= 0.9;
      v.y *= 1.9;
      v.z *= 0.45;
      v.multiplyScalar(1 + fbm3(v.x * 8, v.y * 8, v.z * 8, 3, 3) * 0.35);
    });
    kit.add('flesh', slab, xf([cx + 0.02, cy - 0.32, 0], [0, 0, 0.1]));
    kit.add('bone', cyl(0.018, 0.02, 0.2, 7), xf([cx + 0.05, cy - 0.12, 0.02], [0, 0, 0.2]));
  }
  const obj = kit.build();
  obj.userData.collider = 'none';
  obj.userData.mount = 'ceiling';
  return obj;
}

// Gibbet cage with remains, hanging on a chain; opts.drop = chain length.
export function hangingCage(opts = {}) {
  const drop = opts.drop ?? 1.0;
  const rng = makeRng(opts.seed ?? 17);
  const kit = new Kit();
  const y = ceilingEye(kit, 0.07);
  const end = chain(kit, 'rust', [0, y, 0], [0, -1, 0], Math.max(0.1, drop + y), { R: 0.03, r: 0.008 });
  const R = 0.38;
  const H = 1.3;
  const dome = 0.2;
  const topY = end.y - 0.04;
  const ringY = topY - dome;
  const botY = ringY - H;
  // top eye and dome ribs
  kit.add('rust', torus(0.03, 0.008, 5, 10), xf([0, topY, 0], [0, Math.PI / 2, 0]));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      const r = Math.sin((t * Math.PI) / 2) * R;
      pts.push(v3(Math.cos(a) * r, topY - 0.02 - (1 - Math.cos((t * Math.PI) / 2)) * dome, Math.sin(a) * r));
    }
    kit.add('rust', tube(pts, { segs: 6, radial: 4, radius: 0.009, sx: 1.6, sy: 0.6 }));
  }
  // hoops and bars
  for (const hy of [ringY, ringY - H * 0.5, botY + 0.02]) kit.add('rust', torus(R, 0.012, 4, 20), xf([0, hy, 0], [Math.PI / 2, 0, 0], [1, 1, 1.6]));
  const nb = 14;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * TAU;
    const bend = rng.range(-0.02, 0.02);
    kit.add('rust', box(0.022, H, 0.007), xf([Math.cos(a) * (R + bend), ringY - H / 2, Math.sin(a) * (R + bend)], [0, -a + Math.PI / 2, 0]));
  }
  kit.add('rust', cyl(R, R, 0.012, 20, true), xf([0, botY, 0]));
  kit.add('rust', new THREE.CircleGeometry(R, 20), xf([0, botY + 0.006, 0], [-Math.PI / 2, 0, 0]));
  // padlocked door latch
  kit.add('metal', box(0.05, 0.08, 0.03), xf([0, ringY - H * 0.55, R + 0.02]));
  kit.add('metal', torus(0.018, 0.005, 4, 10, Math.PI), xf([0, ringY - H * 0.55 - 0.03, R + 0.05]));
  kit.add('rust', box(0.05, 0.05, 0.02), xf([0, ringY - H * 0.55 - 0.07, R + 0.05]));
  // remains slumped on the floor of the cage
  const fy = botY + 0.006;
  addSkull(kit, xf([0.1, fy + 0.06, -0.05], [0.5, 2.4, 0.3]), 'pile');
  addLongBone(kit, [-0.22, fy + 0.02, -0.15], [0.12, fy + 0.03, 0.2]);
  addLongBone(kit, [-0.25, fy + 0.03, 0.1], [0.15, fy + 0.6, -0.28]);
  addLongBone(kit, [0.05, fy + 0.02, 0.26], [0.3, fy + 0.02, -0.02]);
  for (let i = 0; i < 5; i++) addRib(kit, xf([-0.1 + i * 0.05, fy + 0.02 + i * 0.01, -0.1], [Math.PI / 2 - 0.2, 0.4 + i * 0.1, 0.3]));
  kit.add('cloth', sphere(0.14, 7, 4), xf([-0.12, fy + 0.03, 0.08], [0, 0, 0], [1.3, 0.25, 1]));
  const obj = kit.build();
  obj.userData.collider = [{ min: [-R - 0.03, botY, -R - 0.03], max: [R + 0.03, topY, R + 0.08] }];
  obj.userData.mount = 'ceiling';
  return obj;
}

// Huge iron ring bolted into rock; wall-mounted (origin on the wall, +Z out).
export function chainAnchor(opts = {}) {
  const rng = makeRng(opts.seed ?? 23);
  const kit = new Kit();
  // rough rock collar the plate is sunk into
  const rock = ico(0.36, 1);
  deform(rock, (v) => {
    v.z *= 0.35;
    v.multiplyScalar(1 + fbm3(v.x * 5, v.y * 5, v.z * 5, 3, rng.int(0, 99)) * 0.5);
  });
  kit.add('stoneWet', rock, xf([0, 0, 0.02]));
  kit.add('rust', box(0.34, 0.34, 0.05), xf([0, 0, 0.12], [0, 0, 0.08]));
  for (const [x, y] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
    const p = v3(x, y, 0).applyAxisAngle(v3(0, 0, 1), 0.08);
    kit.add('metal', cyl(0.032, 0.032, 0.03, 6), xf([p.x, p.y, 0.16], [Math.PI / 2, 0, 0]));
    kit.add('metal', sphere(0.022, 6, 3, 0, TAU, 0, Math.PI / 2), xf([p.x, p.y, 0.175], [Math.PI / 2, 0, 0]));
  }
  // eye boss + eye
  kit.add('rust', cyl(0.07, 0.085, 0.08, 12), xf([0, 0.02, 0.18], [Math.PI / 2, 0, 0]));
  kit.add('rust', torus(0.06, 0.026, 8, 14), xf([0, -0.02, 0.27], [0, Math.PI / 2, 0]));
  // the ring hangs through the eye
  const RR = 0.19;
  const rr = 0.032;
  const ringC = v3(0, -0.02 - 0.06 - RR + rr * 0.6, 0.29);
  kit.add('rust', torus(RR, rr, 8, 24), xf([ringC.x, ringC.y, ringC.z], [-0.25, 0, 0]));
  const attach = new THREE.Object3D();
  attach.name = 'attach';
  attach.position.set(0, ringC.y - RR * Math.cos(0.25), ringC.z + RR * Math.sin(0.25));
  if (opts.chain) chain(kit, 'rust', attach.position, [0, -1, 0.05], opts.chain, { R: 0.03, r: 0.009 });
  const obj = kit.build();
  obj.add(attach);
  obj.userData.attach = attach;
  obj.userData.mount = 'wall';
  obj.userData.collider = [{ min: [-0.3, -0.45, 0], max: [0.3, 0.3, 0.36] }];
  return obj;
}
