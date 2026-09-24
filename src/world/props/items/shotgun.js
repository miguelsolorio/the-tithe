import * as THREE from 'three';
import { solid } from '../../materials.js';
import { Kit, v3, xf, box, cyl, sphere, lathe, tube, sideProfile, shapeFrom, invert, deform } from '../depths/kit.js';
import { addShell } from './ammo.js';

// Double-barrel break-action coach gun with exposed hammers, ~1.0 m long.
// Weapon frame: origin at the rear grip (wrist of the stock), barrels toward
// -Z, up +Y. Moving parts:
//   barrels.rotation.x  0..-0.55 breaks the gun open (pivot on the hinge pin)
//   hammers[i].rotation.x  +0.55 cocks      lever.rotation.y  -0.5 opens the top lever

const CASE = () => solid(0x6a655e, { roughness: 0.36, metalness: 0.6 });
const BRASS_BEAD = () => solid(0xc8a050, { roughness: 0.3, metalness: 0.7 });

// all layout values are relative to the grip centre
const OY = 0.033;
const OZ = 0.04;
const P = (z, y) => [z - OZ, y - OY];
const BORE_Y = 0.062 - OY;
const BORE_X = 0.0115;
const BREECH_Z = -0.085 - OZ;
const MUZZLE_Z = -0.67 - OZ;
const HINGE = [0, 0.035 - OY, -0.158 - OZ];

export function shotgun() {
  const kit = new Kit();
  const M = 'metal';
  // stock: English-style with a slight semi-pistol grip, tapered in width
  const stock = shapeFrom([
    P(-0.02, 0.07), P(0.06, 0.056), P(0.12, 0.052), P(0.33, 0.045), P(0.345, -0.095), P(0.2, -0.055), P(0.11, -0.026),
    P(0.085, -0.02), P(0.06, -0.004), P(0.035, 0.01), P(0.0, 0.022), P(-0.03, 0.03),
  ]);
  const sg = sideProfile(stock, 0.028, 0.006, 2, 4);
  deform(sg, (v) => {
    const z = v.z + OZ;
    const w = z < 0.1 ? 0.84 + (z / 0.1) * 0.08 : 0.92 + ((z - 0.1) / 0.25) * 0.14;
    v.x *= w;
  }, false);
  sg.computeVertexNormals();
  kit.add('woodDark', sg);
  // butt plate, grip cap
  const bp = shapeFrom([P(0.3265, 0.046), P(0.3325, 0.046), P(0.3475, -0.097), P(0.3415, -0.097)]);
  kit.add(M, sideProfile(bp, 0.036, 0.002, 1, 2));
  kit.add(M, cyl(0.011, 0.011, 0.003, 12), xf([0, -0.022 - OY + 0.001, 0.085 - OZ], [0.35, 0, 0], [1.2, 1, 0.9]));
  // action body + action bar under the breech + side locks
  const act = shapeFrom([
    P(-0.085, 0.078), P(-0.025, 0.074), P(-0.02, 0.07), P(-0.03, 0.03), P(-0.085, 0.026), P(-0.15, 0.024), P(-0.166, 0.034),
    P(-0.162, 0.046), P(-0.15, 0.05), P(-0.085, 0.05),
  ]);
  kit.add(CASE(), sideProfile(act, 0.038, 0.0025, 1, 4));
  for (const sx of [-1, 1]) {
    const lock = shapeFrom([P(-0.086, 0.068), P(-0.04, 0.066), P(0.005, 0.06), P(0.012, 0.045), P(-0.01, 0.034), P(-0.086, 0.03)]);
    kit.add(CASE(), sideProfile(lock, 0.003, 0.001, 1, 2), xf([sx * 0.0205, 0, 0]));
    for (const [z, y] of [[-0.06, 0.04], [-0.02, 0.05]]) kit.add(M, cyl(0.0026, 0.0026, 0.0012, 8), xf([sx * 0.0228, y - OY, z - OZ], [0, 0, Math.PI / 2]));
  }
  // top tang
  kit.add(CASE(), box(0.012, 0.004, 0.07), xf([0, 0.07 - OY, -0.035 - OZ], [0.1, 0, 0]));
  // hinge pin
  kit.add(M, cyl(0.007, 0.007, 0.04, 12), xf(HINGE, [0, 0, Math.PI / 2]));
  // trigger plate, guard and two triggers
  kit.add(M, tube([v3(0, 0.027 - OY, -0.085 - OZ), v3(0, 0.0 - OY, -0.08 - OZ), v3(0, -0.012 - OY, -0.05 - OZ), v3(0, -0.006 - OY, -0.015 - OZ), v3(0, 0.012 - OY, 0.004 - OZ)], { segs: 20, radial: 6, radius: 0.0034, sx: 1, sy: 1 }));
  for (const [z, s] of [[-0.058, 1], [-0.038, 0.95]]) {
    kit.add(CASE(), tube([v3(0, 0.028 - OY, z - OZ), v3(0, 0.014 - OY, z - 0.002 - OZ), v3(0, 0.002 - OY, z + 0.004 * s - OZ)], { segs: 6, radial: 5, radius: 0.0025, sx: 0.7, sy: 1.6 }));
  }
  const obj = kit.build();

  // hammers on the lock plates
  const hammers = [];
  for (const sx of [-1, 1]) {
    const h = new THREE.Group();
    h.name = sx < 0 ? 'hammerL' : 'hammerR';
    h.position.set(sx * 0.0225, 0.058 - OY, -0.03 - OZ);
    const hk = new Kit();
    const hs = shapeFrom([[-0.006, -0.004], [-0.012, 0.014], [-0.03, 0.028], [-0.04, 0.024], [-0.038, 0.018], [-0.024, 0.016], [-0.006, 0.006], [0.004, 0.024], [0.016, 0.036], [0.021, 0.033], [0.012, 0.018], [0.006, -0.006]]);
    hk.add(CASE(), sideProfile(hs, 0.005, 0.001, 1, 3));
    for (let i = 0; i < 3; i++) hk.add('black', box(0.0072, 0.0006, 0.0012), xf([0, 0.029 + i * 0.002, 0.01 + i * 0.0025], [-0.7, 0, 0]));
    hk.add(M, cyl(0.004, 0.004, 0.003, 10), xf([sx * 0.002, 0, 0], [0, 0, Math.PI / 2]));
    hk.build(h);
    obj.add(h);
    hammers.push(h);
  }

  // top lever (swings right to open)
  const lever = new THREE.Group();
  lever.name = 'lever';
  lever.position.set(0, 0.074 - OY, -0.06 - OZ);
  const lk = new Kit();
  lk.add(CASE(), box(0.008, 0.005, 0.042), xf([0.004, 0.001, 0.018], [0, 0.18, 0]));
  lk.add(CASE(), cyl(0.006, 0.006, 0.005, 10), xf([0, 0.001, 0]));
  lk.build(lever);
  obj.add(lever);

  // barrels + forend: pivot on the hinge pin
  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(...HINGE);
  const bk = new Kit();
  const H = (x, y, z) => [x - HINGE[0], y - HINGE[1], z - HINGE[2]];
  const blen = BREECH_Z - MUZZLE_Z;
  const rz = [Math.PI / 2, 0, 0];
  for (const sx of [-1, 1]) {
    const c = H(sx * BORE_X, BORE_Y, (BREECH_Z + MUZZLE_Z) / 2);
    bk.add(M, cyl(0.0105, 0.0122, blen, 18, true, 3), xf(c, [-Math.PI / 2, 0, 0]));
    // bores seen from both ends
    bk.add('black', invert(cyl(0.0092, 0.0092, 0.05, 12, true)), xf(H(sx * BORE_X, BORE_Y, MUZZLE_Z + 0.025), rz));
    bk.add(M, lathe([[0.0105, 0], [0.0098, 0.001], [0.0093, 0.0012]], 18), xf(H(sx * BORE_X, BORE_Y, MUZZLE_Z), [-Math.PI / 2, 0, 0]));
    bk.add(M, lathe([[0.0122, 0], [0.0116, 0.0012], [0.0093, 0.0014]], 18), xf(H(sx * BORE_X, BORE_Y, BREECH_Z), [Math.PI / 2, 0, 0]));
  }
  // ribs, lumps, bead
  bk.add(M, box(0.009, 0.004, blen - 0.01), xf(H(0, BORE_Y + 0.0105, (BREECH_Z + MUZZLE_Z) / 2)));
  bk.add(M, box(0.008, 0.005, blen - 0.2), xf(H(0, BORE_Y - 0.0102, (BREECH_Z + MUZZLE_Z) / 2 - 0.09)));
  bk.add(BRASS_BEAD(), sphere(0.0022, 8, 6), xf(H(0, BORE_Y + 0.0138, MUZZLE_Z + 0.012)));
  bk.add(CASE(), box(0.03, 0.02, 0.07), xf(H(0, BORE_Y - 0.018, BREECH_Z - 0.035)));
  bk.add(CASE(), box(0.036, 0.024, 0.003), xf(H(0, BORE_Y, BREECH_Z - 0.0015)));
  // forend with its iron
  const fe = shapeFrom([[-0.192, 0.022], [-0.4, 0.024], [-0.412, 0.03], [-0.408, 0.05], [-0.192, 0.05], [-0.186, 0.036]]);
  const fg = sideProfile(fe, 0.02, 0.006, 2, 3);
  fg.translate(0, -OY, -OZ);
  bk.add('woodDark', fg, xf([-HINGE[0], -HINGE[1], -HINGE[2]]));
  bk.add(CASE(), box(0.03, 0.02, 0.028), xf(H(0, 0.038 - OY, -0.19 - OZ)));
  bk.build(barrels);
  // shells in the chambers (hide/show for the reload)
  const shells = [];
  for (const sx of [-1, 1]) {
    const sk = new Kit();
    addShell(sk, xf(H(sx * BORE_X, BORE_Y, BREECH_Z + 0.0008), [0, Math.PI, 0]), 'lite');
    const s = sk.build();
    s.name = sx < 0 ? 'shellL' : 'shellR';
    barrels.add(s);
    shells.push(s);
  }
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(...H(0, BORE_Y, MUZZLE_Z - 0.003));
  const muzzles = [-1, 1].map((sx) => {
    const m = new THREE.Object3D();
    m.position.set(...H(sx * BORE_X, BORE_Y, MUZZLE_Z - 0.003));
    barrels.add(m);
    return m;
  });
  barrels.add(muzzle);
  // left-hand support point under the forend (fpArm side 'left', pose 'open', hold 'support')
  const support = new THREE.Object3D();
  support.name = 'support';
  support.position.set(...H(0, 0.036 - OY, -0.3 - OZ));
  barrels.add(support);
  obj.add(barrels);

  Object.assign(obj.userData, {
    weapon: 'shotgun',
    hold: 'rifle',
    barrels,
    hammers,
    lever,
    shells,
    muzzle,
    muzzles,
    support,
    breakOpen: -0.55,
    collider: 'none',
  });
  return obj;
}

