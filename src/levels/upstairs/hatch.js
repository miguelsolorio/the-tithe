import * as THREE from 'three';
import { getMaterial } from '../../world/materials.js';
import { HALL_HOLE, OFF, ATTIC, CEIL, LADDER_ANGLE, X } from './common.js';
import { hatchAssembly, ladderMesh } from './fixtures.js';

// The pull-down attic hatch at the east end of the hallway. Closed until the
// revolver is taken (someone up there is sitting on it); then it bangs open,
// the ladder unfolds and something climbs down. The attic side shows the same
// hole looking down into a sliver of hallway.

const HX = (HALL_HOLE.x0 + HALL_HOLE.x1) / 2;
const HZ = (HALL_HOLE.z0 + HALL_HOLE.z1) / 2;
export const LADDER_FOOT = [HALL_HOLE.x1 - CEIL / Math.tan(LADDER_ANGLE), 0, HZ];
export const HATCH_BOTTOM = [LADDER_FOOT[0] - 0.55, 0, HZ];
export const ATTIC_TOP = [HALL_HOLE.x1 + OFF[0] + 0.4, ATTIC.y, HZ + OFF[2]];

export function buildHatch(U) {
  const { L } = U;
  const { x0, x1, z0, z1 } = HALL_HOLE;
  // Hallway-end ceiling with the hole cut out.
  const ex0 = X(42);
  const ex1 = X(45);
  const c = 'plaster';
  L.box([ex0, CEIL, -2], [x0, CEIL + 0.3, 0], c, { walkable: false });
  L.box([x1, CEIL, -2], [ex1, CEIL + 0.3, 0], c, { walkable: false });
  L.box([x0, CEIL, -2], [x1, CEIL + 0.3, z0], c, { walkable: false });
  L.box([x0, CEIL, z1], [x1, CEIL + 0.3, 0], c, { walkable: false });
  // Trim around the opening.
  for (const [a, b] of [[[x0 - 0.06, z0 - 0.06], [x1 + 0.06, z0]], [[x0 - 0.06, z1], [x1 + 0.06, z1 + 0.06]], [[x0 - 0.06, z0], [x0, z1]], [[x1, z0], [x1 + 0.06, z1]]]) {
    L.box([a[0], CEIL - 0.03, a[1]], [b[0], CEIL, b[1]], 'woodDark', { collide: false });
  }
  // What you see looking up through the hole: dark boards and a rafter.
  const pk = 'woodRotten';
  const top = CEIL + 1.3;
  L.box([x0 - 0.3, top, z0 - 0.3], [x1 + 0.3, top + 0.1, z1 + 0.3], pk, { collide: false });
  L.box([x0 - 0.35, CEIL + 0.3, z0 - 0.35], [x0 - 0.3, top, z1 + 0.35], pk, { collide: false });
  L.box([x1 + 0.3, CEIL + 0.3, z0 - 0.35], [x1 + 0.35, top, z1 + 0.35], pk, { collide: false });
  L.box([x0 - 0.3, CEIL + 0.3, z0 - 0.35], [x1 + 0.3, top, z0 - 0.3], pk, { collide: false });
  L.box([x0 - 0.3, CEIL + 0.3, z1 + 0.3], [x1 + 0.3, top, z1 + 0.35], pk, { collide: false });
  L.box([x0 - 0.3, top - 0.35, HZ - 0.06], [x1 + 0.3, top - 0.2, HZ + 0.06], 'woodDark', { collide: false });

  // The hatch itself.
  const h = hatchAssembly(x1 - x0, z1 - z0 - 0.02);
  h.pivot.position.set(x1, CEIL, HZ);
  L.group.add(h.pivot);
  h.pivot.traverse((m) => {
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  const col = L.collider([LADDER_FOOT[0] - 0.05, 0, HZ - 0.3], [x1 - 0.3, 1.9, HZ + 0.3], { walkable: false, shootable: false, seeThrough: true });
  const state = { open: false, t: -1, pivot: h.pivot, ladder: h.ladder };
  const setOpen = (k, unfold) => {
    h.pivot.rotation.z = LADDER_ANGLE * k;
    h.ladder.visible = unfold > 0.01;
    h.ladder.scale.x = 0.3 + 0.7 * unfold;
    h.cord.visible = k < 0.05;
  };
  col.enabled = false;
  const open = () => {
    if (state.open) return;
    state.open = true;
    state.t = 0;
    col.enabled = true;
    L.level.markNavDirty();
  };
  if (U.has('took:revolver')) {
    state.open = true;
    col.enabled = true;
    setOpen(1, 1);
  } else setOpen(0, 0);
  L.onUpdate((dt) => {
    if (state.t < 0) return;
    state.t += dt;
    const t = state.t;
    // Swing down with a bounce, then the sections unfold to the floor.
    const s = Math.min(1, t / 0.45);
    const k = s < 1 ? s * s : 1 + Math.sin(Math.min(1, (t - 0.45) / 0.5) * Math.PI) * 0.06 * Math.max(0, 1 - (t - 0.45) / 0.5);
    const u = Math.max(0, Math.min(1, (t - 0.55) / 0.7));
    setOpen(k, 1 - (1 - u) * (1 - u));
    if (t > 1.4) state.t = -1;
  });

  // Climb between the hallway and the attic.
  L.ladder({
    bottom: HATCH_BOTTOM,
    top: ATTIC_TOP,
    yawTop: -Math.PI / 2,
    yawBottom: Math.PI / 2,
    promptUp: (g) => (state.open ? 'Climb into the attic' : 'Pull the hatch cord'),
    promptDown: 'Climb down the ladder',
    requires: (g) => {
      if (state.open) return true;
      g.audio.play('creak', { pos: new THREE.Vector3(HX, CEIL + 0.5, HZ) });
      g.player.shake = Math.max(g.player.shake, 0.15);
      return 'The cord pulls taut and stops. Something heavy is sitting on the hatch. It shifts its weight.';
    },
  });

  atticHole(U);
  return { state, open };
}

// Attic side: the hole in the floor, a rail round it, the ladder going down and
// a strip of lit hallway below (visual only).
function atticHole(U) {
  const { L } = U;
  const ox = OFF[0];
  const oz = OFF[2];
  const x0 = HALL_HOLE.x0 + ox;
  const x1 = HALL_HOLE.x1 + ox;
  const z0 = HALL_HOLE.z0 + oz;
  const z1 = HALL_HOLE.z1 + oz;
  const y = ATTIC.y;
  // Invisible blocker so nobody walks into the hole.
  L.collider([x0 - 0.05, 0, z0 - 0.05], [x1 + 0.05, y + 1.2, z1 + 0.05], { walkable: false, shootable: false, seeThrough: true, navIgnore: false });
  // Low rail on three sides.
  const post = (x, z) => L.box([x - 0.035, y, z - 0.035], [x + 0.035, y + 0.9, z + 0.035], 'woodDark', { collide: false });
  for (const [x, z] of [[x0 - 0.1, z0 - 0.1], [x0 - 0.1, z1 + 0.1], [x1, z0 - 0.1], [x1, z1 + 0.1]]) post(x, z);
  L.box([x0 - 0.1, y + 0.86, z0 - 0.13], [x1, y + 0.92, z0 - 0.07], 'woodDark', { collide: false });
  L.box([x0 - 0.1, y + 0.86, z1 + 0.07], [x1, y + 0.92, z1 + 0.13], 'woodDark', { collide: false });
  L.box([x0 - 0.13, y + 0.86, z0 - 0.1], [x0 - 0.07, y + 0.92, z1 + 0.1], 'woodDark', { collide: false });
  // The open ladder coming up through the hole.
  const pivot = new THREE.Group();
  pivot.position.set(x1, CEIL, (z0 + z1) / 2);
  pivot.rotation.z = LADDER_ANGLE;
  pivot.add(ladderMesh());
  const pp = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.045, z1 - z0 - 0.02).translate(-(x1 - x0) / 2, -0.024, 0), getMaterial('woodDark'));
  pivot.add(pp);
  pivot.updateMatrixWorld(true);
  L.mesh(pivot, { static: true });
  // A sliver of hallway below: floor, walls, a dim bulb glow.
  const fx0 = x0 - 1.3;
  const fx1 = x1 + 1.2;
  const nz = z0 - 0.6;
  const sz = z1 + 0.6;
  L.box([fx0, -0.3, nz], [fx1, 0, sz], 'floorboards', { collide: false });
  L.box([fx0, 0, nz - 0.1], [fx1, CEIL, nz], 'wallpaper', { collide: false });
  L.box([fx0, 0, sz], [fx1, CEIL, sz + 0.1], 'wallpaper', { collide: false });
  L.box([fx1, 0, nz], [fx1 + 0.1, CEIL, sz], 'wallpaper', { collide: false });
  L.box([fx0, 0, nz], [fx1, 1.0, nz + 0.015], 'wainscot', { collide: false });
  L.box([fx0, 0, sz - 0.015], [fx1, 1.0, sz], 'wainscot', { collide: false });
  L.light({ pos: [x0 - 0.2, 2.2, (z0 + z1) / 2], color: 0xffc880, intensity: 0.8, distance: 4.5, flicker: 0.5, kind: 'bulb' });
}
