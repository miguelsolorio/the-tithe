import { Kit, TAU, v3, xf, cyl, lathe, torus, tube, chain } from './kit.js';
import { BRASS } from './industrial.js';

// Oil (hurricane) lanterns. Light offsets sit inside the emissive globe.

const TEAL = 0x3fb8b0;
const AMBER = 0xe08a2c;
const GLOBE_Y = 0.145;

// Lantern parts with the base at y = 0 (bail up).
function lanternParts(kit, glass, bailAngle = 0) {
  const F = 'metal';
  // fuel tank
  kit.add(F, lathe([[0, 0], [0.07, 0], [0.084, 0.01], [0.086, 0.035], [0.078, 0.052], [0.04, 0.064], [0, 0.066]], 12));
  kit.add(BRASS(), cyl(0.032, 0.036, 0.016, 10, true), xf([0, 0.072, 0]));
  kit.add(BRASS(), cyl(0.012, 0.012, 0.012, 5), xf([0.05, 0.06, 0], [0, 0, -0.5]));
  // globe (emissive glass)
  kit.add(glass, lathe([[0.034, 0.078], [0.046, 0.092], [0.058, 0.13], [0.058, 0.16], [0.047, 0.2], [0.032, 0.216]], 12));
  // guard wires following the globe
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const pts = [[0.05, 0.07], [0.066, 0.1], [0.07, 0.145], [0.066, 0.19], [0.05, 0.222]].map(([r, y]) => v3(Math.sin(a) * r, y, Math.cos(a) * r));
    kit.add(F, tube(pts, { segs: 6, radial: 3, radius: 0.0022 }));
  }
  for (const y of [0.1, 0.19]) kit.add(F, torus(0.066, 0.0022, 3, 16), xf([0, y, 0], [Math.PI / 2, 0, 0]));
  // side air tubes
  for (const sx of [-1, 1]) {
    const pts = [v3(sx * 0.082, 0.04, 0), v3(sx * 0.09, 0.12, 0), v3(sx * 0.088, 0.22, 0), v3(sx * 0.06, 0.25, 0), v3(sx * 0.03, 0.258, 0)];
    kit.add(F, tube(pts, { segs: 8, radial: 5, radius: 0.0065 }));
  }
  // chimney cap
  kit.add(F, lathe([[0.03, 0.214], [0.056, 0.224], [0.058, 0.232], [0.036, 0.25], [0.022, 0.262], [0.022, 0.275], [0, 0.278]], 12));
  kit.add(F, cyl(0.03, 0.03, 0.008, 8), xf([0, 0.285, 0]));
  // wire bail pivoting on the air tubes
  const pivot = xf([0, 0.24, 0], [bailAngle, 0, 0]);
  kit.add(F, torus(0.088, 0.0025, 3, 12, Math.PI), pivot);
  kit.add(F, torus(0.012, 0.003, 3, 8), pivot.clone().multiply(xf([0, 0.088 + 0.012, 0])));
}

function standing(glass, color) {
  const kit = new Kit();
  lanternParts(kit, glass, -1.1);
  const obj = kit.build();
  obj.userData.collider = 'none';
  obj.userData.lights = [{ offset: [0, GLOBE_Y, 0], color, intensity: 2.2, distance: 7, flicker: 0.08, kind: 'lantern' }];
  return obj;
}

export const lantern = () => standing('lanternTeal', TEAL);
export const lanternAmber = () => standing('lanternAmber', AMBER);

// Lantern on a chain; origin at the ceiling.
export function hangingLantern(opts = {}) {
  const drop = opts.drop ?? 0.8;
  const amber = opts.color === 'amber';
  const kit = new Kit();
  kit.add('metal', cyl(0.05, 0.05, 0.012, 10), xf([0, -0.006, 0]));
  kit.add('metal', torus(0.016, 0.004, 4, 10), xf([0, -0.03, 0]));
  const end = chain(kit, 'metal', [0, -0.042, 0], [0, -1, 0], Math.max(0.05, drop - 0.08), { R: 0.015, r: 0.0038 });
  const k2 = new Kit({ raw: true });
  lanternParts(k2, amber ? 'lanternAmber' : 'lanternTeal', 0);
  const baseY = end.y - 0.08 - 0.252;
  kit.addParts(k2.merged(), xf([0, baseY, 0]));
  const obj = kit.build();
  obj.userData.collider = 'none';
  obj.userData.mount = 'ceiling';
  obj.userData.lights = [{ offset: [0, baseY + GLOBE_Y, 0], color: amber ? AMBER : TEAL, intensity: 2.4, distance: 8, flicker: 0.08, kind: 'lantern' }];
  return obj;
}

