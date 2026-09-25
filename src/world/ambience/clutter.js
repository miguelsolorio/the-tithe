import * as THREE from 'three';
import { getMaterial } from '../materials.js';

// Small floor debris so rooms don't read as swept clean: loose pages, fallen
// plaster, broken glass and bottles, rags, small bones, candle stubs, dropped
// books. Everything is static, has no collider and merges into the batcher.
//
//   scatter(L, box, 'paper', 12, { edge: 0.8 });
// box: { x0, z0, x1, z1, y } (a plan rect) or [[x0, y, z0], [x1, y1, z1]].
// edge: keep pieces within this many metres of a wall (0 = anywhere).

const TAU = Math.PI * 2;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function put(L, geo, mat, x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  L.batcher.add(geo.clone().applyMatrix4(_m), getMaterial(mat), { worldUV: false, cast: false });
}

const G = {};
const geo = (k, make) => (G[k] ??= make());

// One piece of each kind at (x, y, z), y = floor.
const KINDS = {
  paper(L, r, x, y, z) {
    const g = geo('paper', () => new THREE.BoxGeometry(0.21, 0.002, 0.28));
    put(L, g, 'paper', x, y + 0.003 + r() * 0.004, z, (r() - 0.5) * 0.12, r() * TAU, (r() - 0.5) * 0.12);
  },
  books(L, r, x, y, z) {
    const g = geo('book', () => new THREE.BoxGeometry(0.16, 0.035, 0.23));
    const open = r() < 0.3;
    put(L, g, r() < 0.3 ? 'clothRed' : r() < 0.5 ? 'cloth' : 'woodDark', x, y + 0.018, z, 0, r() * TAU, open ? 0.12 : 0);
  },
  plaster(L, r, x, y, z) {
    const g = geo('plaster', () => new THREE.DodecahedronGeometry(0.06, 0));
    const s = 0.4 + r() * 1.1;
    put(L, g, 'plaster', x, y + 0.02 * s, z, r() * TAU, r() * TAU, r() * TAU, s, s * 0.45, s * (0.7 + r() * 0.6));
    if (r() < 0.25) {
      const lath = geo('lath', () => new THREE.BoxGeometry(0.6, 0.012, 0.035));
      put(L, lath, 'woodRotten', x + (r() - 0.5) * 0.3, y + 0.01, z + (r() - 0.5) * 0.3, 0, r() * TAU, (r() - 0.5) * 0.1, 0.5 + r());
    }
  },
  glass(L, r, x, y, z) {
    if (r() < 0.4) {
      const b = geo('bottle', () => {
        const pts = [[0, 0], [0.034, 0], [0.036, 0.16], [0.014, 0.21], [0.012, 0.26], [0, 0.26]].map(([a, b]) => new THREE.Vector2(a, b));
        return new THREE.LatheGeometry(pts, 8).translate(0, -0.13, 0);
      });
      put(L, b, 'glass', x, y + 0.035, z, 0, r() * TAU, Math.PI / 2);
    } else {
      const s = geo('shard', () => new THREE.TetrahedronGeometry(0.035, 0));
      put(L, s, 'glass', x, y + 0.004, z, r() * TAU, r() * TAU, r() * TAU, 1 + r(), 0.12, 0.6 + r());
    }
  },
  rags(L, r, x, y, z) {
    const g = geo('rag', () => {
      const p = new THREE.PlaneGeometry(0.5, 0.4, 5, 4);
      const a = p.attributes.position;
      for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(a.getX(i) * 13 + a.getY(i) * 7) * 0.025 + 0.03);
      p.rotateX(-Math.PI / 2);
      p.computeVertexNormals();
      return p;
    });
    put(L, g, r() < 0.25 ? 'clothRed' : 'cloth', x, y, z, 0, r() * TAU, 0, 0.6 + r() * 0.6, 1, 0.6 + r() * 0.6);
  },
  bones(L, r, x, y, z) {
    const g = geo('bone', () => {
      const shaft = new THREE.CylinderGeometry(0.012, 0.014, 0.22, 5);
      shaft.rotateZ(Math.PI / 2);
      return shaft;
    });
    put(L, g, 'bone', x, y + 0.013, z, 0, r() * TAU, 0, 0.5 + r() * 0.9);
  },
  stubs(L, r, x, y, z) {
    const g = geo('stub', () => new THREE.CylinderGeometry(0.022, 0.026, 0.06, 7).translate(0, 0.03, 0));
    put(L, g, 'bone', x, y, z, r() < 0.3 ? Math.PI / 2 : 0, r() * TAU, 0, 1, 0.5 + r() * 1.5, 1);
  },
};

export const CLUTTER_KINDS = Object.keys(KINDS);

export function scatter(L, box, kind, n, { edge = 0 } = {}) {
  const r = L.rng;
  const b = Array.isArray(box) ? { x0: box[0][0], z0: box[0][2], x1: box[1][0], z1: box[1][2], y: box[0][1] } : box;
  const pad = 0.2;
  const x0 = b.x0 + pad;
  const x1 = b.x1 - pad;
  const z0 = b.z0 + pad;
  const z1 = b.z1 - pad;
  if (x1 <= x0 || z1 <= z0) return;
  const fn = KINDS[kind];
  for (let i = 0; i < n; i++) {
    let x = r.range(x0, x1);
    let z = r.range(z0, z1);
    if (edge > 0) {
      // Snap to within `edge` of the nearest wall.
      const side = r.int(0, 3);
      if (side === 0) x = x0 + r() * edge;
      else if (side === 1) x = x1 - r() * edge;
      else if (side === 2) z = z0 + r() * edge;
      else z = z1 - r() * edge;
    }
    const y = b.y ?? L.floorAt(x, z);
    // Clusters: a few pieces around each point.
    const k = kind === 'paper' || kind === 'plaster' || kind === 'glass' ? r.int(1, 3) : 1;
    for (let j = 0; j < k; j++) fn(L, r, x + (r() - 0.5) * 0.35 * j, y, z + (r() - 0.5) * 0.35 * j);
  }
}
