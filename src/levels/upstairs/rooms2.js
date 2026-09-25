import * as THREE from 'three';
import { getMaterial, getDecalMaterial } from '../../world/materials.js';
import { makeProp, PROP_NAMES } from '../../world/props/index.js';
import { Parts, M, topOf } from './common.js';
import { shroudBody } from './meshes.js';
import { robe, linenStack, suitcase } from './fixtures.js';

// The cult's ritual room, the storage room of the tithes' belongings, the
// robing room where the masks are made, and the linen closet whose back panel
// opens onto a crawlway and a hidden shrine.

export function ritualRoom(U) {
  const { L } = U;
  const r = U.rect('R');
  const cx = (r.x0 + r.x1) / 2;
  const cz = -7.4;
  const altar = U.prop('altar', cx, r.z0 + 0.1 + 0.6, { face: 's', args: { candles: true } });
  const top = altar ? topOf(altar) : 1.03;
  U.prop('antlerSkull', cx, r.z0 + 0.11, { y: 2.75, face: 's', scale: 1.4 });
  U.wallDecal('sigil', cx, 2.35, r.z0 + 0.105, 's', 2.6);
  for (const dx of [-0.9, 0.7]) U.wallDecal('bloodDrip', cx + dx, 1.6, r.z0 + 0.11, 's', [0.9, 1.6]);
  U.prop('skull', cx - 0.55, r.z0 + 0.6, { y: top, rotY: 0.3 });
  U.prop('skull', cx + 0.2, r.z0 + 0.45, { y: top, rotY: -0.4 });
  U.prop('bloodBucket', cx - 1.5, r.z0 + 0.55);
  U.prop('bloodBucket', cx + 1.7, r.z0 + 0.5);
  U.prop('bonesPile', r.x0 + 0.8, r.z0 + 0.8);
  U.prop('bonesPile', r.x1 - 0.8, r.z0 + 0.9);
  L.pickup({ id: 'u_ammo_altar', kind: 'ammo', amount: 4, pos: [cx + 0.55, top + 0.01, r.z0 + 0.6], prompt: 'Take the rounds from the offerings' });

  // Floor sigil that breathes, ringed by candles.
  U.floorDecal('sigil', cx, cz, 5.6, 0);
  const glowMat = getDecalMaterial('sigilGlow').clone();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6).rotateX(-Math.PI / 2), glowMat);
  glow.position.set(cx, 0.02, cz);
  glow.renderOrder = 3;
  L.group.add(glow);
  const base = glowMat.emissiveIntensity || 2.2;
  L.onUpdate((dt, t) => {
    glowMat.emissiveIntensity = base * (0.55 + 0.35 * Math.sin(t * 1.9) * Math.sin(t * 0.7));
    glowMat.opacity = 0.75;
  });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    U.prop('candleCluster', cx + Math.sin(a) * 3.0, cz + Math.cos(a) * 3.0, { lights: false, rotY: a });
  }
  L.light({ pos: [cx - 2.3, 0.6, cz], color: 0xe08a2c, intensity: 1.35, distance: 6.5, flicker: 0.5, kind: 'candle' });
  L.light({ pos: [cx + 2.3, 0.6, cz], color: 0xe08a2c, intensity: 1.35, distance: 6.5, flicker: 0.5, kind: 'candle' });
  L.light({ pos: [cx, 0.3, cz], color: 0xff2a10, intensity: 1.0, distance: 5, flicker: 0.2, kind: 'candle' });
  // Kneeling cushions round the circle.
  const kp = new Parts();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    kp.box('clothRed', 0.5, 0.08, 0.4, cx + Math.sin(a) * 2.2, 0.04, cz + Math.cos(a) * 2.2, 0, a, 0);
  }
  U.place(kp.build(), 0, 0, 0);

  // Nooses along the east side; one is occupied.
  const H = 3.8;
  for (const z of [-4.2, -6.4, -8.6, -10.8]) U.prop('noose', r.x1 - 1.4, z, { y: H, args: { drop: 1.1 } });
  const body = shroudBody();
  body.position.set(r.x1 - 1.4, H - 1.1, -6.4);
  L.group.add(body);
  body.traverse((m) => m.isMesh && (m.castShadow = true));
  U.cull.push([body, 17]);
  L.collider([r.x1 - 1.62, 0.9, -6.62], [r.x1 - 1.18, 2.7, -6.18], { walkable: false });
  L.onUpdate((dt, t) => {
    body.rotation.y = Math.sin(t * 0.23) * 0.5;
    body.rotation.z = Math.sin(t * 0.61) * 0.025;
  });
  // Cages on the west side, claw marks beneath them.
  for (const z of [-5.2, -9.6]) {
    U.prop('hangingCage', r.x0 + 2.0, z, { y: H, args: { drop: 0.9 } });
    U.floorDecal('claws', r.x0 + 2.0, z, 1.0);
    U.floorDecal('bloodSplat', r.x0 + 2.0, z + 0.3, 0.7);
  }
  for (const z of [-4.6, -10.2]) U.prop('antlerSkull', r.x0 + 0.11, z, { y: 2.4, face: 'e' });
  U.prop('antlerSkull', r.x1 - 0.11, -12.0, { y: 2.4, face: 'w' });
  U.prop('ritualTable', r.x0 + 0.45, cz, { face: 'e', lights: false });
  const lec = U.prop('lectern', cx - 3.6, r.z0 + 1.2, { face: 's' });
  U.note([cx - 3.6, lec ? topOf(lec) - 0.1 : 1.1, r.z0 + 1.2], ['A ledger of names, one for every year, each one struck through.', 'The newest line has no strike through it yet. It is your sister’s name.'], 'Read the ledger', { paper: false, noLOS: true, radius: 1.7 });
  // Blood.
  U.floorDecal('bloodPool', cx, r.z0 + 1.5, 1.8);
  for (const [z, rot] of [[-3.1, 0.05], [-4.8, -0.1]]) U.floorDecal('bloodSmear', cx + 0.2, z, [1.0, 2.2], rot);
  for (const [x, y] of [[r.x0 + 0.11, 1.2], [r.x0 + 0.11, 1.45]]) U.wallDecal('handprint', x, y, -7.0 + y, 'e', 0.34);
  U.wallDecal('bloodDrip', r.x1 - 0.11, 2.2, -3.4, 'w', [1.0, 1.6]);
  for (const [x, z] of [[-4.5, -3.5], [4.8, -12], [cx, cz + 4]]) U.floorDecal('grime', x, z, 3);
}

export function storage(U) {
  const { L } = U;
  const r = U.rect('S');
  U.prop('metalShelves', r.x0 + 0.3, 1.6, { face: 'e' });
  U.prop('shelf', r.x0 + 0.31, 3.7, { face: 'e' });
  U.prop('sheetCovered', r.x0 + 1.9, r.z1 - 0.5, { face: 'n', args: { shape: 'piano' } });
  U.prop('sheetCovered', r.x0 + 3.9, r.z1 - 0.45, { face: 'n', args: { shape: 'tall' } });
  U.prop('sheetCovered', r.x1 - 0.5, 3.9, { face: 'w', args: { shape: 'sofa' } });
  const c1 = U.prop('crate', r.x1 - 1.9, r.z1 - 0.45, { rotY: 0.2 });
  if (c1) U.prop('crate', r.x1 - 1.85, r.z1 - 0.45, { y: topOf(c1), rotY: 0.7, args: { size: 0.5 } });
  U.prop('trunk', r.x1 - 0.7, r.z1 - 0.4, { face: 'n' });
  U.prop('boxes', r.x1 - 0.45, 1.3, { face: 'w' });
  U.prop('mannequin', r.x0 + 0.45, r.z1 - 0.45, { face: 'n', rotY: 2.7 });
  U.prop('washtub', r.x0 + 1.25, 0.7);
  U.prop('chair', r.x0 + 2.6, 1.0, { fallen: 'back', rotY: 0.9 });
  // Rolled carpet.
  const rp = new Parts();
  rp.add('clothRed', new THREE.CylinderGeometry(0.16, 0.16, 2.2, 12), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(r.x0 + 1.35, 0.16, 2.9));
  U.place(rp.build(), 0, 0, 0);
  // The tithes' luggage: suitcases, and small shoes in pairs.
  const sx = r.x0 + 3.4;
  const sz = 4.0;
  let y = 0;
  for (let k = 0; k < 5; k++) {
    const s = suitcase(k + 3);
    U.place(s, sx + L.rng.range(-0.1, 0.1), y, sz + L.rng.range(-0.1, 0.1), L.rng.range(-0.3, 0.3));
    y += 0.17;
  }
  U.place(suitcase(11, true), sx + 0.9, 0, sz - 0.4, 0.4);
  U.place(suitcase(12, true), sx - 0.8, 0, sz + 0.6, 1.9);
  L.collider([sx - 0.45, 0, sz - 0.4], [sx + 0.45, y, sz + 0.4], { walkable: false });
  const sh = new Parts();
  for (let k = 0; k < 9; k++) {
    const x = sx + L.rng.range(-1.4, 1.4);
    const z = sz + L.rng.range(0.6, 1.9);
    const a = L.rng.range(0, 3);
    const c = [0x2b1a10, 0x5a1a1a, 0x1e2430][k % 3];
    for (const d of [-0.06, 0.06]) sh.box(M.dress(c), 0.07, 0.06, 0.17, x + Math.cos(a) * d, 0.03, z - Math.sin(a) * d, 0, a + L.rng.range(-0.3, 0.3), 0);
  }
  U.place(sh.build(), 0, 0, 0);
  U.note([sx + 0.15, y, sz], ['Luggage tags in a dozen different hands. Children’s names, mostly.', 'The oldest tag is dated eighty years ago. The newest is from last spring.'], 'Read the luggage tags', { size: [0.1, 0.06] });
  // Old portraits leaning against the walls.
  if (PROP_NAMES.includes('painting')) {
    for (const [x, z, ry, s] of [[r.x0 + 0.2, 5.2, Math.PI / 2, 3], [r.x0 + 0.24, 5.9, Math.PI / 2 + 0.1, 5], [r.x1 - 0.2, 5.6, -Math.PI / 2, 9]]) {
      const pg = new THREE.Group();
      const p = makeProp('painting', { seed: s, w: 0.8, h: 1.0 });
      p.position.y = 0.52;
      p.rotation.x = -0.2;
      pg.add(p);
      U.place(pg, x, 0, z, ry);
    }
  }
  U.floorDecal('grime', r.x0 + 3, 3, 4);
  U.floorDecal('footprints', r.x0 + 4.4, 0.9, [0.5, 1.8], 0.4);
}

export function robingRoom(U) {
  const { L } = U;
  const r = U.rect('W');
  // Robes on a rail along the east wall.
  const rail = new Parts();
  rail.limb(M.iron, [r.x1 - 0.3, 2.15, r.z0 + 0.8], [r.x1 - 0.3, 2.15, r.z1 - 0.8], 0.015, 0.015, false);
  for (const z of [r.z0 + 0.8, r.z1 - 0.8]) rail.limb(M.iron, [r.x1 - 0.1, 2.15, z], [r.x1 - 0.3, 2.15, z], 0.012, 0.012, false);
  U.place(rail.build(), 0, 0, 0);
  for (let k = 0; k < 5; k++) U.place(robe(k + 1), r.x1 - 0.3, 2.15, r.z0 + 1.3 + k * 0.85, Math.PI / 2);
  L.collider([r.x1 - 0.55, 0.4, r.z0 + 0.9], [r.x1 - 0.1, 2.1, r.z1 - 0.9], { walkable: false });
  // Antler masks drying on pegs.
  for (let k = 0; k < 4; k++) U.prop('antlerSkull', r.x0 + 0.11, r.z0 + 1.2 + k * 1.15, { y: 1.8, face: 'e' });
  U.note([r.x0 + 0.5, 1.2, r.z0 + 2.9], ['Masks drying on pegs: deer skulls bleached white, antlers still on.', 'A name is burned into the inside of each one. Under the names, a year, and the word FAITHFUL.'], 'Look at the masks', { paper: false, noLOS: true, radius: 1.8 });
  // The work bench: skulls, knives, a candle.
  const wb = U.prop('workbench', (r.x0 + r.x1) / 2 - 0.4, r.z1 - 0.1 - 0.37, { face: 'n' });
  const wt = wb ? topOf(wb) : 1.0;
  const bx = (r.x0 + r.x1) / 2 - 0.4;
  U.prop('skull', bx - 0.5, r.z1 - 0.45, { y: wt, rotY: 0.5 });
  U.prop('candle', bx + 0.6, r.z1 - 0.4, { y: wt, flicker: 0.5 });
  const kn = new Parts();
  for (let k = 0; k < 3; k++) {
    const x = bx - 0.1 + k * 0.14;
    kn.box(M.iron, 0.02, 0.005, 0.2, x, wt + 0.004, r.z1 - 0.62, 0, 0.2 * k, 0);
    kn.box('woodDark', 0.028, 0.02, 0.1, x - 0.02 * k, wt + 0.01, r.z1 - 0.48, 0, 0.2 * k, 0);
  }
  kn.limb('bone', [bx + 0.2, wt + 0.03, r.z1 - 0.35], [bx + 0.45, wt + 0.28, r.z1 - 0.3], 0.012);
  kn.limb('bone', [bx + 0.35, wt + 0.16, r.z1 - 0.33], [bx + 0.5, wt + 0.2, r.z1 - 0.2], 0.009);
  U.place(kn.build(), 0, 0, 0);
  U.prop('mannequin', r.x0 + 1.1, r.z1 - 0.6, { face: 'n', rotY: 2.8 });
  U.place(robe(9), r.x0 + 1.1, 1.72, r.z1 - 0.6, 2.8);
  U.prop('coatRack', r.x0 + 0.5, r.z0 + 0.5);
  U.prop('washtub', r.x1 - 1.1, r.z1 - 0.55);
  U.prop('bonesPile', r.x1 - 1.1, r.z1 - 0.55, { y: 0.12, args: { r: 0.28, count: 6 } });
  U.prop('bloodBucket', r.x1 - 2.1, r.z1 - 1.3);
  U.floorDecal('bloodSplat', r.x1 - 1.5, r.z1 - 1.2, 1.2);
  U.floorDecal('grime', (r.x0 + r.x1) / 2, 3, 3.5);
}

// Linen closet with the loose back panel, the crawlway and the shrine.
export function closetAndShrine(U) {
  const { L } = U;
  const c = U.rect('C');
  // Shelving along the west half of the closet.
  const sp = new Parts();
  for (const y of [0.35, 0.8, 1.25, 1.7, 2.15]) sp.box('woodDark', 0.5, 0.03, 2.7, c.x0 + 0.37, y, 1.5);
  for (const z of [0.18, 1.5, 2.82]) sp.box('woodDark', 0.5, 2.3, 0.04, c.x0 + 0.37, 1.15, z);
  U.place(sp.build(), 0, 0, 0);
  L.collider([c.x0 + 0.1, 0, 0.1], [c.x0 + 0.62, 2.3, 2.9], { walkable: false });
  let seed = 1;
  for (const y of [0.365, 0.815, 1.265, 1.715, 2.165]) for (const z of [0.6, 1.1, 1.95, 2.45]) if ((seed++ * 7) % 5) U.place(linenStack(3 + (seed % 4), seed), c.x0 + 0.37, y, z, 0);
  U.prop('bloodBucket', c.x1 - 0.28, 1.5, { rotY: 1 });

  // The back panel: plaster board with a little shelf, hinged on its west edge.
  const open = U.has('u.panel');
  const pivot = new THREE.Group();
  pivot.position.set(4.75, 0, 3.0);
  const pp = new Parts();
  pp.box('plaster', 1.0, 1.15, 0.05, 0.5, 0.575, 0);
  pp.box('woodDark', 0.94, 0.03, 0.26, 0.5, 0.62, -0.15);
  pivot.add(pp.build());
  const ls = linenStack(4, 42);
  ls.position.set(0.5, 0.635, -0.15);
  pivot.add(ls);
  L.group.add(pivot);
  U.cull.push([pivot, 12]);
  // Candlelight from beyond leaks round its edges.
  const leak = new THREE.Group();
  const lm = M.glow();
  for (const [w, h, x, y] of [[0.98, 0.012, 0.5, 1.152], [0.012, 1.14, 0.995, 0.575]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lm);
    m.position.set(4.75 + x, y, 2.97);
    m.rotation.y = Math.PI;
    leak.add(m);
  }
  L.group.add(leak);
  if (open) {
    pivot.rotation.y = -1.45;
    leak.visible = false;
  } else {
    const col = L.collider([4.75, 0, 2.95], [5.75, 1.15, 3.05], { walkable: false });
    let t = -1;
    const it = L.interact({
      pos: [5.25, 0.7, 2.9],
      radius: 1.5,
      ignore: [col],
      prompt: 'Push the loose back panel',
      onUse: (g) => {
        it.alive = false;
        col.enabled = false;
        leak.visible = false;
        g.setFlag('u.panel');
        g.audio.play('creak', { pos: new THREE.Vector3(5.25, 0.6, 3) });
        g.hud.say('The panel swings inward on a hidden hinge. A crawlway, and at the end of it, candlelight.', 4);
        L.level.markNavDirty();
        t = 0;
      },
    });
    L.onUpdate((dt) => {
      if (t < 0 || t > 1) return;
      t = Math.min(1, t + dt * 1.1);
      pivot.rotation.y = -1.45 * t * t * (3 - 2 * t);
      if (t >= 1) t = 2;
    });
  }
  // Reaches well into the shrine: standing, the lintel stops you at z 6.4, so
  // the volume must start past that or you can never crouch back out.
  L.crawl({ min: [4.75, -0.5, 2.25], max: [5.75, 2.0, 6.9], eye: 0.5 });
  // The crawlway: scratches, a stub of candle, someone's bones.
  U.prop('skull', 5.05, 4.6, { rotY: 1.2 });
  U.prop('candle', 5.5, 3.6, { args: { lit: false, h: 0.06 } });
  U.wallDecal('claws', 4.86, 0.6, 4.2, 'e', [0.7, 0.5]);
  U.floorDecal('grime', 5.25, 4.5, 1.2);

  // The shrine: every tithe's photograph, faces scratched out.
  const x = U.rect('X');
  const table = U.prop('ritualTable', (x.x0 + x.x1) / 2, x.z1 - 0.1 - 0.33, { face: 'n', lights: false });
  const tt = table ? topOf(table) : 1.0;
  for (let k = 0; k < 4; k++) U.prop('candle', x.x0 + 0.9 + k * 1.35 + (k > 1 ? 1.2 : 0), x.z1 - 0.35, { args: { lit: true, h: 0.08 + k * 0.04 }, lights: false });
  for (const dx of [-0.35, 0.4]) U.prop('candle', (x.x0 + x.x1) / 2 + dx, x.z1 - 0.3, { y: tt, args: { lit: true, h: 0.12 }, lights: false });
  U.prop('candleCluster', x.x0 + 0.5, x.z1 - 0.5, { lights: false });
  L.light({ pos: [(x.x0 + x.x1) / 2, 1.3, x.z1 - 0.8], color: 0xe08a2c, intensity: 1.2, distance: 5, flicker: 0.45, kind: 'candle' });
  let s = 20;
  for (const y of [1.25, 1.62, 1.98]) for (let k = 0; k < 9; k++) if (k !== 4) U.prop('painting', x.x0 + 0.6 + k * 0.6, x.z1 - 0.11, { y, face: 'n', args: { w: 0.24, h: 0.31, tilt: L.rng.range(-0.08, 0.08) }, seed: s++ });
  for (const wx of [x.x0 + 0.11, x.x1 - 0.11]) for (const y of [1.35, 1.8]) for (let k = 0; k < 4; k++) U.prop('painting', wx, x.z0 + 0.9 + k * 0.72, { y, face: wx < 5 ? 'e' : 'w', args: { w: 0.24, h: 0.31 }, seed: s++ });
  U.prop('painting', (x.x0 + x.x1) / 2, x.z1 - 0.1, { y: 1.62, face: 'n', args: { w: 0.4, h: 0.52 }, seed: 77 });
  U.note([(x.x0 + x.x1) / 2, tt, x.z1 - 0.3], ['Photographs, dozens of them, every face scratched away down to the paper.', 'Except the newest. Hers. They have not scratched her out. Not yet.'], 'Look at the photographs', { paper: false, noLOS: true, radius: 2.0 });
  L.pickup({ id: 'u_ammo_shrine', kind: 'ammo', amount: 5, pos: [(x.x0 + x.x1) / 2 - 0.4, tt + 0.01, x.z1 - 0.45] });
  L.pickup({ id: 'u_bandage_shrine', kind: 'bandage', pos: [x.x0 + 0.9, 0.02, x.z0 + 1.2] });
  U.prop('bonesPile', x.x1 - 0.7, x.z0 + 0.8, { args: { r: 0.3 } });
  U.floorDecal('sigil', (x.x0 + x.x1) / 2, (x.z0 + x.z1) / 2, 2.4, 0);
  U.floorDecal('grime', x.x0 + 2, x.z0 + 2, 2.5);
}
