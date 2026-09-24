import * as THREE from 'three';
import { solid } from '../../materials.js';
import { Kit, v3, xf, box, cyl, sphere, lathe, tube, ribbon } from '../depths/kit.js';
import { addSkull } from '../depths/bones.js';

// Ritual knife. Weapon frame: origin at the grip centre, blade toward -Z,
// spine up (+Y), edge down.

export const STEEL = () => solid(0x9a9ea2, { roughness: 0.28, metalness: 0.45 });
export const EDGE = () => solid(0xc4c8cb, { roughness: 0.18, metalness: 0.5 });
export const BRONZE = () => solid(0x7a5c30, { roughness: 0.4, metalness: 0.55 });
const LEATHER = () => solid(0x3b2417, { roughness: 0.82 });
const DRIED = () => solid(0x3a0608, { roughness: 0.5 });
const ETCH = () => solid(0x1c1d1f, { roughness: 0.5, metalness: 0.4 });

function interp(table, t) {
  for (let i = 1; i < table.length; i++) {
    if (t <= table[i][0]) {
      const [t0, v0] = table[i - 1];
      const [t1, v1] = table[i];
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return table[table.length - 1][1];
}

export function knife() {
  const kit = new Kit();
  const z0 = -0.062;
  const L = 0.2;
  const N = 24;
  const spineT = [[0, 0.012], [0.3, 0.016], [0.6, 0.023], [0.8, 0.028], [0.92, 0.03], [1, 0.028]];
  const edgeT = [[0, -0.02], [0.3, -0.019], [0.6, -0.012], [0.8, -0.001], [0.92, 0.013], [1, 0.028]];
  const at = (t) => {
    const z = z0 - L * t;
    const ys = interp(spineT, t);
    const ye = interp(edgeT, t);
    const w = 0.0045 * (1 - 0.65 * t) + 0.0004;
    const yg = ys - (ys - ye) * 0.38;
    return { z, ys, ye, w, yg };
  };
  const sl = [];
  const sr = [];
  const gl = [];
  const gr = [];
  const e = [];
  for (let i = 0; i <= N; i++) {
    const { z, ys, ye, w, yg } = at(i / N);
    sl.push(v3(-w / 2, ys, z));
    sr.push(v3(w / 2, ys, z));
    gl.push(v3(-w / 2, yg, z));
    gr.push(v3(w / 2, yg, z));
    e.push(v3(0, ye, z));
  }
  kit.add(STEEL(), ribbon(sl, sr));
  kit.add(STEEL(), ribbon(sr, gr));
  kit.add(EDGE(), ribbon(gr, e));
  kit.add(EDGE(), ribbon(e, gl));
  kit.add(STEEL(), ribbon(gl, sl));
  // etched fuller line and runes on both flats
  for (const sx of [-1, 1]) {
    const up = [];
    const lo = [];
    for (let i = 0; i <= 10; i++) {
      const t = 0.08 + (i / 10) * 0.5;
      const { z, ys, ye, w } = at(t);
      const y = ys - (ys - ye) * 0.18;
      up.push(v3(sx * (w / 2 + 0.00015), y + 0.0007, z));
      lo.push(v3(sx * (w / 2 + 0.00015), y - 0.0007, z));
    }
    kit.add(ETCH(), sx > 0 ? ribbon(up, lo) : ribbon(lo, up));
    for (let i = 0; i < 4; i++) {
      const t = 0.12 + i * 0.06;
      const { z, ys, ye, w } = at(t);
      kit.add(ETCH(), box(0.0003, 0.0045, 0.0011), xf([sx * (w / 2 + 0.0002), ys - (ys - ye) * 0.3, z], [(i % 2 ? 0.5 : -0.4) + i * 0.3, 0, 0]));
    }
    // dried blood along the edge
    const hi = [];
    const ed = [];
    for (let i = 0; i <= 12; i++) {
      const t = 0.32 + (i / 12) * 0.5;
      const { z, ye, w, yg } = at(t);
      const h = yg - ye;
      const n = v3(sx * h, -w / 2, 0).normalize().multiplyScalar(0.00025);
      const f = 0.25 + 0.35 * Math.abs(Math.sin(i * 1.7 + sx)) * Math.sin((i / 12) * Math.PI);
      hi.push(v3(sx * (w / 2) * f, ye + h * f, z).add(n));
      ed.push(v3(0, ye, z).add(n));
    }
    kit.add(DRIED(), sx > 0 ? ribbon(hi, ed) : ribbon(ed, hi));
  }
  // bronze guard with ball quillons
  kit.add(BRONZE(), box(0.016, 0.05, 0.009), xf([0, -0.004, -0.0605]));
  kit.add(BRONZE(), sphere(0.0068, 8, 6), xf([0, 0.022, -0.0605]));
  kit.add(BRONZE(), sphere(0.0072, 8, 6), xf([0, -0.03, -0.063]));
  kit.add(BRONZE(), cyl(0.0132, 0.0138, 0.006, 12), xf([0, 0, -0.054], [Math.PI / 2, 0, 0], [0.88, 1, 1.08]));
  // carved bone handle (oval section)
  const prof = [
    [0.0118, -0.052], [0.0125, -0.047], [0.0135, -0.04], [0.0126, -0.036], [0.0142, -0.031], [0.0155, -0.012],
    [0.0158, 0.004], [0.015, 0.02], [0.0138, 0.034], [0.0126, 0.039], [0.0138, 0.045], [0.013, 0.054], [0.0112, 0.057],
  ];
  kit.add('bone', lathe(prof, 14), xf([0, 0, 0], [Math.PI / 2, 0, 0], [0.86, 1, 1.08]));
  // leather wrap spiralling over the middle of the grip
  const wrap = [];
  const turns = 3.5;
  for (let i = 0; i <= 56; i++) {
    const t = i / 56;
    const z = -0.03 + t * 0.056;
    const r = interp(prof.map(([rr, y]) => [y, rr]), z) + 0.0009;
    const a = t * turns * Math.PI * 2;
    wrap.push(v3(Math.cos(a) * r * 0.86, Math.sin(a) * r * 1.08, z));
  }
  kit.add(LEATHER(), tube(wrap, { segs: 84, radial: 4, radius: 0.0042, sx: 0.28, sy: 1 }));
  for (const [x, z] of [[0.008, -0.03], [0.004, -0.028]]) {
    kit.add(LEATHER(), tube([v3(x, -0.013, z), v3(x + 0.004, -0.028, z + 0.004), v3(x + 0.006, -0.042, z + 0.012)], { segs: 6, radial: 4, radius: 0.0022, sx: 0.4 }));
  }
  // pommel cap and a small skull
  kit.add(BRONZE(), lathe([[0.0115, 0], [0.0128, 0.003], [0.012, 0.008], [0.007, 0.011], [0, 0.012]], 12), xf([0, 0, 0.056], [Math.PI / 2, 0, 0], [0.9, 1, 1.05]));
  addSkull(kit, xf([0, -0.0118, 0.064], [0, 0, 0], 0.16), 'full');
  const obj = kit.build();
  const tip = new THREE.Object3D();
  tip.name = 'tip';
  tip.position.set(0, 0.028, z0 - L);
  obj.add(tip);
  obj.userData.tip = tip;
  obj.userData.hold = 'knife';
  obj.userData.weapon = 'knife';
  obj.userData.collider = 'none';
  return obj;
}
