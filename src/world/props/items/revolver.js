import * as THREE from 'three';
import { solid } from '../../materials.js';
import { Kit, TAU, v3, xf, box, cyl, lathe, torus, tube, extrude, sideProfile, shapeFrom, invert } from '../depths/kit.js';
import { addCartridge } from './ammo.js';

// Old six-shot swing-out revolver. Weapon frame: origin at the grip centre,
// barrel toward -Z, up +Y. Moving parts:
//   hammer.rotation.x  +0.5 cocks        trigger.rotation.x  -0.3 pulls
//   crane.rotation.z   0..1.75 swings the cylinder out to the left
//   cylinder.rotation.z  += PI / 3 per shot (chambers index around the bore)

const CASE = () => solid(0x5e5a55, { roughness: 0.38, metalness: 0.6 });

const BORE_Y = 0.085;
const CYL_Y = 0.071;
const CYL_Z0 = -0.0795;
const CYL_Z1 = -0.0365;
const MUZZLE_Z = -0.226;
const PIVOT = [-0.011, 0.05];

function cylinderShape() {
  const s = new THREE.Shape();
  const NP = 60;
  for (let i = 0; i <= NP; i++) {
    const a = (i / NP) * TAU;
    const off = a - Math.PI / 2 - Math.PI / 6;
    const rel = ((off % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6;
    const r = 0.021 - 0.0024 * Math.max(0, 1 - (rel / 0.2) ** 2);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0.0057, 0, TAU, true);
    s.holes.push(h);
  }
  return s;
}

export function revolver() {
  const kit = new Kit();
  const M = 'metal';
  // frame (side profile) with the cylinder window cut out
  const frame = shapeFrom([
    [0.014, 0.093], [0.006, 0.1005], [-0.086, 0.1005], [-0.088, 0.066], [-0.082, 0.047], [-0.066, 0.045], [-0.036, 0.045],
    [-0.0322, 0.0442], [-0.002, -0.0554], [0.006, -0.0595], [0.03, -0.0515], [0.0342, -0.0436], [0.0002, 0.0548],
    [0.006, 0.066], [0.014, 0.076], [0.017, 0.086],
  ]);
  const win = new THREE.Path();
  win.moveTo(-0.0805, 0.0485);
  win.lineTo(-0.0355, 0.0485);
  win.lineTo(-0.0355, 0.0945);
  win.lineTo(-0.0805, 0.0945);
  win.closePath();
  frame.holes.push(win);
  kit.add(M, sideProfile(frame, 0.0236, 0.0012, 1, 4));
  // wooden grip panels
  const panel = shapeFrom([[-0.029, 0.042], [0.001, -0.051], [0.027, -0.0475], [0.031, -0.0406], [-0.0018, 0.0518]]);
  for (const sx of [-1, 1]) {
    kit.add('woodDark', sideProfile(panel, 0.002, 0.0022, 2, 4), xf([sx * 0.0152, 0, 0]));
    kit.add(CASE(), cyl(0.0032, 0.0032, 0.0012, 10), xf([sx * 0.0186, -0.002, 0.012], [0, 0, Math.PI / 2]));
    kit.add('black', box(0.0006, 0.0048, 0.0007), xf([sx * 0.0193, -0.002, 0.012], [0.6, 0, 0]));
    // side-plate screws
    for (const [y, z] of [[0.062, -0.02], [0.08, 0.004], [0.052, -0.004]]) {
      kit.add(CASE(), cyl(0.0022, 0.0022, 0.001, 8), xf([sx * 0.0122, y, z], [0, 0, Math.PI / 2]));
    }
  }
  // cylinder latch (left) and rear sight groove
  kit.add(CASE(), box(0.004, 0.007, 0.013), xf([-0.0138, 0.08, -0.028]));
  for (let i = 0; i < 3; i++) kit.add('black', box(0.0006, 0.0072, 0.0008), xf([-0.0159, 0.08, -0.033 + i * 0.004]));
  kit.add('black', box(0.0025, 0.0012, 0.016), xf([0, 0.1006, -0.004]));
  // barrel, shank, crown, bore, sight, ejector lug
  const rz = [Math.PI / 2, 0, 0];
  kit.add(M, cyl(0.0112, 0.0112, 0.012, 16), xf([0, BORE_Y, -0.092], rz));
  kit.add(M, cyl(0.0086, 0.0088, -0.098 - MUZZLE_Z, 16, true, 2), xf([0, BORE_Y, (-0.098 + MUZZLE_Z) / 2], rz));
  kit.add(M, lathe([[0.0086, 0], [0.0082, 0.0012], [0.0058, 0.0016]], 16), xf([0, BORE_Y, MUZZLE_Z], [-Math.PI / 2, 0, 0]));
  kit.add('black', invert(cyl(0.0058, 0.0058, 0.03, 12, true)), xf([0, BORE_Y, MUZZLE_Z + 0.015], rz));
  kit.add(M, box(0.0028, 0.0062, 0.013), xf([0, BORE_Y + 0.0112, MUZZLE_Z + 0.009]));
  kit.add(M, box(0.007, 0.0085, 0.009), xf([0, BORE_Y - 0.0118, -0.146]));
  // trigger guard
  kit.add(M, tube([v3(0, 0.046, -0.066), v3(0, 0.034, -0.0725), v3(0, 0.02, -0.068), v3(0, 0.012, -0.055), v3(0, 0.012, -0.04), v3(0, 0.018, -0.03), v3(0, 0.027, -0.0262)], { segs: 20, radial: 6, radius: 0.0032 }));
  // lanyard ring
  kit.add(CASE(), torus(0.0065, 0.0012, 4, 12), xf([0, -0.064, 0.02], [0, Math.PI / 2, 0]));
  const obj = kit.build();

  // hammer
  const hammer = new THREE.Group();
  hammer.name = 'hammer';
  hammer.position.set(0, 0.074, 0.0);
  const hk = new Kit();
  const hs = shapeFrom([
    [-0.007, 0.004], [-0.0085, 0.013], [-0.004, 0.0165], [0.006, 0.022], [0.014, 0.029], [0.024, 0.035], [0.029, 0.032],
    [0.021, 0.024], [0.012, 0.012], [0.008, -0.006], [0.0, -0.01], [-0.006, -0.006],
  ]);
  hk.add(CASE(), sideProfile(hs, 0.0056, 0.0008, 1, 4));
  hk.add(CASE(), cyl(0.0018, 0.0012, 0.004, 6), xf([0, 0.011, -0.01], rz));
  for (let i = 0; i < 4; i++) hk.add('black', box(0.0072, 0.0006, 0.0012), xf([0, 0.0272 + i * 0.0021, 0.0155 + i * 0.0026], [-0.7, 0, 0]));
  hk.build(hammer);
  obj.add(hammer);

  // trigger
  const trigger = new THREE.Group();
  trigger.name = 'trigger';
  trigger.position.set(0, 0.049, -0.047);
  const tk = new Kit();
  tk.add(CASE(), sideProfile(shapeFrom([[-0.003, 0.002], [0.002, 0.002], [0.004, -0.008], [0.0032, -0.018], [0.0072, -0.025], [0.0042, -0.0272], [-0.0008, -0.02], [-0.0022, -0.01]]), 0.0042, 0.0008, 1, 4));
  tk.build(trigger);
  obj.add(trigger);

  // crane (yoke) + cylinder, swinging out to the left
  const crane = new THREE.Group();
  crane.name = 'crane';
  crane.position.set(PIVOT[0], PIVOT[1], 0);
  const ck = new Kit();
  const ax = [-PIVOT[0], CYL_Y - PIVOT[1]];
  const armLen = Math.hypot(ax[0], ax[1]);
  ck.add(M, box(0.009, armLen + 0.008, 0.006), xf([ax[0] / 2, ax[1] / 2, CYL_Z0 - 0.0035], [0, 0, -Math.atan2(ax[0], ax[1])]));
  ck.add(M, cyl(0.0036, 0.0036, 0.028, 10), xf([0, 0, -0.074], rz));
  ck.build(crane);
  obj.add(crane);

  const cylinder = new THREE.Group();
  cylinder.name = 'cylinder';
  cylinder.position.set(ax[0], ax[1], 0);
  const yk = new Kit();
  const body = extrude(cylinderShape(), CYL_Z1 - CYL_Z0 - 0.002, 0.001, 1, 10);
  yk.add(M, body, xf([0, 0, CYL_Z0 + 0.001]));
  yk.add(M, cyl(0.0034, 0.0034, 0.054, 8), xf([0, 0, CYL_Z0 - 0.027], rz));
  yk.add(M, cyl(0.0049, 0.0049, 0.008, 12), xf([0, 0, CYL_Z0 - 0.057], rz));
  yk.add(M, cyl(0.009, 0.009, 0.0016, 12), xf([0, 0, CYL_Z1 - 0.0004], rz));
  yk.build(cylinder);
  // rounds, one mesh group each so spent/empty chambers can be hidden
  const rounds = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    const rk = new Kit();
    addCartridge(rk, xf([Math.cos(a) * 0.014, Math.sin(a) * 0.014, CYL_Z1 - 0.0002], [0, Math.PI, 0], [1, 1, 0.9]), 'lite');
    const round = rk.build();
    round.name = `round${k}`;
    cylinder.add(round);
    rounds.push(round);
  }
  crane.add(cylinder);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, BORE_Y, MUZZLE_Z - 0.002);
  obj.add(muzzle);

  Object.assign(obj.userData, {
    weapon: 'revolver',
    hold: 'pistol',
    hammer,
    trigger,
    crane,
    gate: crane,
    cylinder,
    rounds,
    muzzle,
    chamberStep: Math.PI / 3,
    craneOpen: 1.75,
    collider: 'none',
  });
  return obj;
}
