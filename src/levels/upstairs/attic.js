import * as THREE from 'three';
import { getMaterial } from '../../world/materials.js';
import { makeProp, PROP_NAMES } from '../../world/props/index.js';
import { ATTIC as A, HALL_HOLE, OFF, Parts, M, topOf } from './common.js';
import { bedroll, strawMat, suitcase, shaftTexture } from './fixtures.js';
import { doll } from './meshes.js';

// The attic: a long gabled roof space over the house (built off to the side in
// XZ). Rafters, dust sheets, a crowd of dress forms, crawl-height eaves, the
// acolytes' nest at the far end under a boarded window, and the fuse.

const yR = A.y + A.ridge;
const yE = A.y + A.eave;
const SLOPE = Math.atan2(A.ridge - A.eave, A.z);
const SLEN = Math.hypot(A.ridge - A.eave, A.z);

// Quad with its front face toward `want`.
function quad(p, want) {
  const g = new THREE.BufferGeometry();
  const [a, b, c, d] = p.map((q) => new THREE.Vector3(...q));
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const tri = n.dot(new THREE.Vector3(...want)) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap((q) => [q.x, q.y, q.z]), 3));
  g.computeVertexNormals();
  return g;
}

export function buildAttic(U) {
  const { L } = U;
  const { x0, x1, z, y } = A;
  const hx0 = HALL_HOLE.x0 + OFF[0];
  const hx1 = HALL_HOLE.x1 + OFF[0];
  const hz0 = HALL_HOLE.z0 + OFF[2];
  const hz1 = HALL_HOLE.z1 + OFF[2];
  // Floor with the hatch hole.
  const f = 'floorboards';
  L.box([x0, y - 0.3, -z], [hx0, y, z], f);
  L.box([hx1, y - 0.3, -z], [x1, y, z], f);
  L.box([hx0, y - 0.3, -z], [hx1, y, hz0], f);
  L.box([hx0, y - 0.3, hz1], [hx1, y, z], f);
  // Roof slopes (undersides), knee boards, ridge, rafters, ties and posts.
  L.batcher.add(quad([[x0, yE, -z], [x1, yE, -z], [x1, yR, 0], [x0, yR, 0]], [0, -1, 1]), getMaterial('woodDark'));
  L.batcher.add(quad([[x0, yE, z], [x1, yE, z], [x1, yR, 0], [x0, yR, 0]], [0, -1, -1]), getMaterial('woodDark'));
  L.box([x0, y, -z - 0.1], [x1, yE, -z], 'woodRotten', { collide: false });
  L.box([x0, y, z], [x1, yE, z + 0.1], 'woodRotten', { collide: false });
  L.box([x0, yR - 0.26, -0.1], [x1, yR - 0.02, 0.1], 'woodDark', { collide: false });
  const beams = new Parts();
  for (let x = x0 + 0.45; x < x1 - 0.2; x += 0.9) {
    for (const s of [-1, 1]) {
      const n = new THREE.Vector3(0, -A.z, s * -(A.ridge - A.eave)).normalize().multiplyScalar(-0.09);
      beams.box('woodDark', 0.08, 0.16, SLEN, x, (yE + yR) / 2 - Math.abs(n.y), s * (A.z / 2) - s * Math.abs(n.z), s < 0 ? -SLOPE : SLOPE, 0, 0);
    }
  }
  const tieY = y + 2.26;
  const tieZ = (A.ridge - 2.3) / ((A.ridge - A.eave) / A.z);
  for (let x = x0 + 1.35; x < x1; x += 2.7) {
    beams.box('woodDark', 0.1, 0.14, tieZ * 2, x, tieY, 0);
    beams.box('woodDark', 0.12, yR - tieY - 0.2, 0.12, x, (tieY + yR) / 2 - 0.1, 0);
  }
  U.place(beams.build(), 0, 0, 0);
  // Gable ends; the east one has the boarded window.
  const gable = (x, dir, hole) => {
    const s = new THREE.Shape([new THREE.Vector2(-z, y), new THREE.Vector2(z, y), new THREE.Vector2(z, yE), new THREE.Vector2(0, yR), new THREE.Vector2(-z, yE)]);
    if (hole) s.holes.push(new THREE.Path([new THREE.Vector2(-0.6, y + 1.15), new THREE.Vector2(0.6, y + 1.15), new THREE.Vector2(0.6, y + 2.15), new THREE.Vector2(-0.6, y + 2.15)]));
    const g = new THREE.ShapeGeometry(s).rotateY(dir * Math.PI / 2).translate(x, 0, 0);
    L.batcher.add(g, getMaterial('woodRotten'));
    L.collider([x - (dir > 0 ? 0.3 : 0), y - 0.3, -z], [x + (dir > 0 ? 0 : 0.3), yR + 0.5, z], { walkable: false });
  };
  gable(x0, 1, false);
  gable(x1, -1, true);
  // Headroom: standing is blocked under the low slopes, everything under the eaves.
  for (const s of [-1, 1]) {
    // 1.45 m stops anyone standing (and keeps enemies' nav out of the eaves),
    // 0.8 m stops a crouching player. Bullets and sight lines pass through.
    const o = { walkable: false, shootable: false, seeThrough: true };
    L.collider([x0, y + 1.45, s < 0 ? -z : 3.2], [x1, yR, s < 0 ? -3.2 : z], o);
    L.collider([x0, y + 0.8, s < 0 ? -z : 4.7], [x1, yR, s < 0 ? -4.7 : z], o);
    L.crawl({ min: [x0, y - 0.4, s < 0 ? -4.9 : 2.55], max: [x1, y + 2.2, s < 0 ? -2.55 : 4.9], eye: 0.5 });
  }

  moonWindow(U);
  furnish(U);
  return nest(U);
}

// Boards across the gable window, a cold sky behind, shafts of moonlight.
function moonWindow(U) {
  const { L } = U;
  const wx = A.x1;
  const wy = A.y + 1.65;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), M.moonSky());
  sky.position.set(wx + 0.25, wy, 0);
  sky.rotation.y = -Math.PI / 2;
  L.group.add(sky);
  const bp = new Parts();
  for (const [dy, rz] of [[-0.42, 0.04], [-0.1, -0.06], [0.2, 0.03], [0.44, -0.02]]) bp.box('woodRotten', 0.04, 0.16, 1.45, wx - 0.03, wy + dy, 0, rz, 0, 0);
  bp.box('woodRotten', 0.04, 0.16, 1.5, wx - 0.05, wy, 0, 0.75, 0, 0);
  U.place(bp.build(), 0, 0, 0);
  L.light({ pos: [wx - 1.1, wy, 0], color: 0x8fa8c8, intensity: 1.7, distance: 10, flicker: 0.03, kind: 'lantern' });
  const sm = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0x6f86a8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (const [dz, len] of [[-0.3, 3.3], [0.15, 3.6], [0.4, 3.0]]) {
    for (const cross of [0, Math.PI / 2]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, len), sm);
      const dir = new THREE.Vector3(-2.6, -(wy - A.y) + 0.1, dz * 0.6).normalize();
      m.position.set(wx - 0.05, wy + 0.1, dz).addScaledVector(dir, len / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      m.rotateY(cross);
      m.renderOrder = 4;
      L.group.add(m);
    }
  }
}

function furnish(U) {
  const { L } = U;
  const y = A.y;
  // By the hatch.
  U.prop('trunk', 40.75, -2.0, { face: 'e' });
  U.prop('sheetCovered', 40.8, 2.2, { face: 'e', args: { shape: 'tall' } });
  U.prop('boxes', 41.3, -2.75, { face: 'e' });
  if (PROP_NAMES.includes('painting')) {
    for (const [zz, s] of [[0.9, 31], [1.35, 32]]) {
      const pg = new THREE.Group();
      const p = makeProp('painting', { seed: s, w: 0.7, h: 0.9 });
      p.position.y = 0.47;
      p.rotation.x = -0.22;
      pg.add(p);
      U.place(pg, A.x0 + 0.2, y, zz, Math.PI / 2);
    }
  }
  // A crowd of dress forms, all turned toward the hatch.
  for (const [x, zz, r] of [[46.6, 0.3, -1.4], [47.2, -1.6, -1.7], [47.9, 1.0, -1.5], [48.6, -0.5, -1.6], [49.4, 1.8, -1.3], [49.9, -1.9, -1.75]]) U.prop('mannequin', x, zz, { rotY: r });
  U.prop('sheetCovered', 46.1, -2.55, { face: 's', args: { shape: 'sofa' } });
  U.prop('sheetCovered', 50.6, 2.5, { face: 'n', args: { shape: 'table' } });
  U.prop('sheetCovered', 53.7, 2.55, { face: 'n', args: { shape: 'piano' } });
  U.prop('sheetCovered', 54.3, -2.5, { face: 's', args: { shape: 'chair' } });
  U.prop('trunk', 44.9, 2.7, { face: 'n' });
  U.prop('trunk', 55.6, -2.65, { face: 's', rotY: 0.2 });
  U.prop('boxes', 45.3, -2.75, { face: 's' });
  U.prop('clock', 49.6, -2.85, { fallen: 'side' });
  const cr = U.prop('crate', 52.6, 2.75, { rotY: 0.3 });
  if (cr) U.prop('crate', 52.65, 2.72, { y: topOf(cr), rotY: 0.9, args: { size: 0.5 } });
  U.prop('chair', 44.3, -2.6, { rotY: 2.3 });
  // Junk under the eaves.
  let s = 40;
  for (const [x, zz, st] of [[41.8, -4.2, 0], [43.2, -5.0, 1], [48.1, -5.1, 0], [53.4, 4.9, 1], [45.7, 5.0, 0], [55.0, -5.0, 0]]) U.place(suitcase(s++, !!st), x, y, zz, L.rng.range(-0.5, 0.5));
  U.prop('boxes', 47.2, 5.1, { face: 'n' });
  U.prop('boxes', 58.0, -5.1, { face: 's' });
  U.prop('crate', 44.0, 4.95, { rotY: 0.4 });
  const dd = doll(12);
  dd.group.add(dd.head);
  dd.head.position.y = dd.neck;
  dd.group.rotation.set(Math.PI / 2, 0, 0.3);
  const wrap = new THREE.Group();
  wrap.add(dd.group);
  dd.group.position.y = 0.06;
  U.place(wrap, 51.1, y, -4.3, 1.1);
  L.pickup({ id: 'u_bandage_attic', kind: 'bandage', pos: [50.3, y + 0.02, -4.05] });
  // Someone crawled in here to hide and never came out.
  U.prop('bonesPile', 57.6, 4.25, { args: { r: 0.35 } });
  U.prop('skull', 57.1, 4.1, { rotY: 2.2 });
  const bl = new Parts();
  bl.box('cloth', 0.9, 0.04, 0.6, 57.8, y + 0.02, 4.3, 0, 0.4, 0);
  U.place(bl.build(), 0, 0, 0);
  for (const [x, zz, sz] of [[45, 0, 3.5], [50, 1, 4], [55, -1, 3.5], [48, -4, 2.5], [53, 4, 2.5]]) U.floorDecal('grime', x, zz, sz, null, y);
  U.floorDecal('footprints', 45.6, 0.1, [0.55, 2.6], -Math.PI / 2, y);
  U.floorDecal('footprints', 52.5, -0.4, [0.55, 2.6], -Math.PI / 2 + 0.1, y);
  L.sound('creak', [50, y + 2.2, 0], { interval: [9, 22], radius: 18, gain: 0.7 });
  L.sound('creak', [58, y + 1.5, 3.5], { interval: [14, 30], radius: 14, gain: 0.5 });
}

// The acolytes' nest round the offering crate that holds the fuse.
// Returns { fuseTop, sheet } for the ambush.
function nest(U) {
  const { L } = U;
  const y = A.y;
  for (const [x, zz, r, sd] of [[56.9, -1.9, 0.3, 1], [57.2, 2.0, -0.2, 2], [58.8, -2.4, 1.25, 3], [59.0, 2.5, -1.1, 4], [61.0, -2.1, 0.1, 5]]) U.place(bedroll(sd), x, y, zz, r);
  U.place(strawMat(5.2, 5.6), 58.8, y, 0, 0);
  const crate = U.prop('crate', 60.3, 0, { rotY: 0.15 });
  const fuseTop = crate ? topOf(crate) : y + 0.55;
  for (const [x, zz] of [[59.55, -0.55], [59.5, 0.6], [61.0, -0.7], [61.05, 0.75], [60.3, 1.05]]) U.prop('candle', x, zz, { args: { lit: true, h: 0.06 + Math.abs(zz) * 0.05 }, lights: false });
  U.prop('candleCluster', 59.3, -1.1, { lights: false });
  const nestLight = L.light({ pos: [59.6, y + 0.5, 0.2], color: 0xe08a2c, intensity: 1.2, distance: 5.5, flicker: 0.55, kind: 'candle' });
  U.prop('bonesPile', 61.2, 1.7, { args: { r: 0.3 } });
  U.prop('skull', 59.2, 0.95, { rotY: 0.4 });
  U.prop('bloodBucket', 58.3, 0.7);
  for (const zz of [-1.9, 1.9]) U.prop('antlerSkull', A.x1 - 0.02, zz, { y: y + 1.45, face: 'w' });
  U.floorDecal('sigil', 60.3, 0, 2.2, 0, y);
  U.floorDecal('bloodSplat', 58.2, -0.6, 1.1, null, y);
  U.note([57.9, y + 0.07, 0.25], ['They sleep up here, under the eaves, in their robes and masks.', 'The blankets are still warm.'], 'Touch the bedding', { paper: false, radius: 1.8 });
  // One dust sheet near the dress forms has someone kneeling under it.
  const sheet = U.prop('sheetCovered', 51.9, -1.95, { face: 'e', dynamic: true, collider: 'none', args: { shape: 'armchair' } });
  const sheetCol = L.collider([51.45, y, -2.4], [52.35, y + 1.05, -1.5], { walkable: false });
  let heap = null;
  if (PROP_NAMES.includes('sheetCovered')) {
    heap = makeProp('sheetCovered', { seed: 5, shape: 'table' });
    heap.scale.set(0.9, 0.14, 0.85);
    heap.position.set(52.2, y, -1.7);
    heap.rotation.y = 0.6;
    heap.visible = false;
    L.group.add(heap);
  }
  return { fuseTop, sheet, sheetCol, heap, nestLight };
}
