import * as THREE from 'three';
import { getMaterial, getDecalMaterial } from '../../world/materials.js';
import { Parts, M, CEIL, topOf } from './common.js';
import { corpseSeated, doll, paleHand, rockingChair, cradleMobile } from './meshes.js';
import { toilet, tallyTexture } from './fixtures.js';
import { mirrorScare } from './mirror.js';

// Master bedroom (mirror scare, the revolver), bathroom (tub of blood),
// nursery (dolls, cradle, rocking chair) and the sickroom where she was kept.

const local = (x0, z0, r, lx, lz) => [x0 + lx * Math.cos(r) + lz * Math.sin(r), z0 - lx * Math.sin(r) + lz * Math.cos(r)];

export function bedroom(U, onRevolver) {
  const { L } = U;
  const r = U.rect('M');
  const cx = (r.x0 + r.x1) / 2;
  U.prop('bed', cx, r.z0 + 0.1 + 1.03, { face: 's', args: { bloody: true } });
  const ns1 = U.prop('nightstand', cx - 1.05, r.z0 + 0.35, { face: 's' });
  U.prop('nightstand', cx + 1.05, r.z0 + 0.35, { face: 's' });
  if (ns1) U.prop('candle', cx - 1.1, r.z0 + 0.35, { y: topOf(ns1), args: { lit: false } });
  const lamp = U.prop('floorLamp', r.x1 - 0.55, r.z0 + 0.5, { args: { on: true }, flicker: 0.4 });
  U.prop('window', cx - 3.6, r.z0 + 0.1, { face: 's' });
  U.prop('wardrobe', r.x1 - 0.4, -8.2, { face: 'w', args: { ajar: true } });
  const dr = U.prop('dresser', r.x1 - 0.41, -4.6, { face: 'w' });
  if (dr) U.prop('candle', r.x1 - 0.4, -4.3, { y: topOf(dr), args: { lit: false } });
  U.prop('chair', r.x1 - 1.3, -3.1, { fallen: 'side', rotY: 2.1 });
  U.prop('rug', cx - 0.2, -6.6, { collider: 'none', args: { w: 2.4, d: 3.2, bloody: true } });
  U.prop('painting', r.x0 + 0.11, -10.1, { y: 1.8, face: 'e', args: { w: 1.0, h: 1.3 } });
  U.prop('painting', r.x0 + 3.2, r.z1 - 0.11, { y: 1.7, face: 'n', args: { w: 0.6, h: 0.8, tilt: -0.2 } });
  U.prop('painting', r.x1 - 0.11, -10.9, { y: 1.75, face: 'w', args: { w: 0.5, h: 0.65 } });

  // The standing mirror, and facing it, the man who sat down to watch it.
  const mx = r.x0 + 0.65;
  const mz = -6.8;
  const mRot = 1.25;
  const mirror = U.prop('mirror', mx, mz, { rotY: mRot, dynamic: true });
  const chairX = mx + Math.sin(mRot) * 2.3;
  const chairZ = mz + Math.cos(mRot) * 2.3;
  const cRot = mRot + Math.PI;
  U.prop('armchair', chairX, chairZ, { rotY: cRot, args: { fabric: 'clothRed' } });
  U.place(corpseSeated(), chairX, 0, chairZ, cRot);
  const [bx, bz] = local(chairX, chairZ, cRot, 0.25, -0.95);
  U.floorDecal('bloodSplat', bx, bz, 1.4);
  U.floorDecal('bloodPool', chairX, chairZ, 1.2);
  const [nx, nz] = local(chairX, chairZ, cRot, 0.05, 0.2);
  U.note([nx, 0.62, nz], ['A note in his left hand, the ink run with sweat:', '“It stands behind me when I look. It is always behind me. I will sit here and watch it until it goes.”'], 'Take the note from his hand', { noLOS: true, radius: 1.5 });
  const [gx, gz] = local(chairX, chairZ, cRot, -0.3, 0.75);
  L.pickup({
    id: 'revolver',
    kind: 'item',
    item: 'revolver',
    pos: [gx, 0.02, gz],
    rotY: cRot + 0.6,
    prompt: 'Take the revolver',
    message: 'Six rounds. Make them count. (Press 2, R to reload.)',
    onTake: (g) => onRevolver?.(g),
  });
  mirrorScare(U, mirror, { lamps: lamp?.userData.sources || [] });
  if (mirror) U.cull.push([mirror, 15]);

  // Drag marks from the bed to the door.
  for (const [x, z, rot] of [[cx + 0.4, -3.2, 0.2], [cx + 0.2, -5.1, 0.1], [cx, -7.2, -0.1], [cx - 0.1, -9.1, 0]]) U.floorDecal('bloodSmear', x, z, [0.8, 2.0], rot);
  U.wallDecal('handprint', r.x1 - 0.11, 1.35, -6.4, 'w', 0.33);
  U.floorDecal('grime', cx - 3, -3.5, 2.6);
  L.sound('creak', [cx, 2.5, -7], { interval: [20, 45], radius: 14, gain: 0.6 });
}

export function bathroom(U) {
  const { L } = U;
  const r = U.rect('B');
  // Tiles to shoulder height.
  const T = 1.35;
  const t = 'tile';
  L.box([r.x0 + 0.1, 0, r.z0 + 0.1], [r.x0 + 0.12, T, r.z1 - 0.1], t, { collide: false });
  L.box([r.x1 - 0.12, 0, r.z0 + 0.1], [r.x1 - 0.1, T, r.z1 - 0.1], t, { collide: false });
  L.box([r.x0 + 0.1, 0, r.z0 + 0.1], [r.x1 - 0.1, T, r.z0 + 0.12], t, { collide: false });
  L.box([r.x0 + 0.1, 0, r.z1 - 0.12], [18.66, T, r.z1 - 0.1], t, { collide: false });
  L.box([19.84, 0, r.z1 - 0.12], [r.x1 - 0.1, T, r.z1 - 0.1], t, { collide: false });
  for (const [a, b] of [[[r.x0 + 0.1, r.z0 + 0.1], [r.x1 - 0.1, r.z0 + 0.14]], [[r.x0 + 0.1, r.z0 + 0.1], [r.x0 + 0.14, r.z1 - 0.1]], [[r.x1 - 0.14, r.z0 + 0.1], [r.x1 - 0.1, r.z1 - 0.1]]]) {
    L.box([a[0], T, a[1]], [b[0], T + 0.05, b[1]], 'woodDark', { collide: false });
  }
  const tubX = (r.x0 + r.x1) / 2 + 0.4;
  const tubZ = r.z0 + 0.1 + 0.41;
  U.prop('bathtub', tubX, tubZ, { face: 's', args: { filled: 'blood' } });
  U.place(paleHand(), tubX - 0.35, 0.79, tubZ + 0.37, 0.15);
  U.place(toilet(), r.x0 + 0.3, 0, -3.5, Math.PI / 2);
  U.prop('sink', r.x1 - 0.31, -4.7, { face: 'w' });
  const glass = U.prop('mirror', r.x1 - 0.11, -4.7, { y: 1.62, face: 'w', dynamic: true, args: { wall: true } });
  if (glass?.userData.glass) glass.userData.glass.visible = false;
  U.wallDecal('claws', r.x1 - 0.105, 1.62, -4.7, 'w', [0.5, 0.7]);
  // Towel rail with a ruined towel.
  const tp = new Parts();
  tp.limb(M.brass, [21.0, 1.2, r.z1 - 0.16], [22.0, 1.2, r.z1 - 0.16], 0.012, 0.012, false);
  tp.box(M.linenDirty, 0.55, 0.62, 0.02, 21.4, 0.92, r.z1 - 0.15);
  tp.box(M.bloodDry, 0.3, 0.35, 0.022, 21.5, 0.85, r.z1 - 0.15);
  U.place(tp.build(), 0, 0, 0);
  U.prop('bulb', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, { y: CEIL, args: { drop: 0.5 }, flicker: 0.85, buzz: true, collider: 'none' });
  // Blood everywhere near the tub.
  for (const [x, y] of [[tubX - 0.6, 1.05], [tubX + 0.2, 1.2], [tubX + 0.5, 0.95]]) U.wallDecal('handprint', x, y, r.z0 + 0.125, 's', 0.3);
  U.wallDecal('bloodDrip', tubX, 1.25, r.z0 + 0.125, 's', [1.2, 1.1]);
  U.floorDecal('bloodPool', tubX - 0.4, tubZ + 0.75, 1.3);
  U.floorDecal('bloodSmear', 19.3, -4.4, [0.9, 2.2], 0.2);
  U.floorDecal('bloodSmear', 19.9, -6.2, [1.0, 1.6], -0.4);
  U.floorDecal('bloodSplat', tubX + 0.6, tubZ + 0.8, 1.2);
  U.floorDecal('bloodPool', r.x0 + 0.9, -3.6, 0.9);
  U.floorDecal('footprints', 19.2, -3.2, [0.5, 2.0], 0.1);
  U.floorDecal('grime', 20, -4.5, 3.2);
  // Smears and hands on the tiles.
  U.wallDecal('bloodSmear', r.x1 - 0.125, 0.9, -6.3, 'w', [0.7, 1.2]);
  U.wallDecal('handprint', r.x1 - 0.125, 1.1, -5.9, 'w', 0.3);
  U.wallDecal('bloodDrip', r.x0 + 0.125, 1.2, -5.2, 'e', [0.9, 1.3]);
  // Something small at the bottom of the tub.
  const pk = L.pickup({
    id: 'u_ammo_tub',
    kind: 'ammo',
    amount: 4,
    pos: [tubX + 0.35, 0.72, tubZ],
    prompt: 'Reach into the blood',
    onTake: (g) => g.hud.say('It is cold, and it is not water. At the bottom your fingers close on a small box.', 3.5),
  });
  if (pk?.object) pk.object.visible = false;
  L.sound('drip', [tubX, 0.8, tubZ], { interval: [3, 7], radius: 8, gain: 0.6 });
}

export function nursery(U) {
  const { L, game } = U;
  const r = U.rect('N');
  const cx = (r.x0 + r.x1) / 2;
  const cz = -6.6;
  U.prop('rug', cx, cz, { collider: 'none', args: { w: 2.3, d: 2.3 } });
  const cradle = U.prop('cradle', cx, cz, { dynamic: true });
  const mob = cradleMobile(1.1);
  mob.group.position.set(cx, CEIL, cz);
  L.group.add(mob.group);
  U.prop('bed', r.x0 + 0.66, r.z0 + 0.86, { face: 's', scale: 0.72 });
  const dr = U.prop('dresser', r.x1 - 0.41, -5.0, { face: 'w' });
  U.prop('window', cx, r.z0 + 0.1, { face: 's' });
  U.prop('trunk', r.x1 - 0.9, r.z1 - 0.32, { face: 'n', scale: 0.8 });
  U.prop('painting', r.x0 + 0.11, -4.2, { y: 1.6, face: 'e', args: { w: 0.45, h: 0.6, tilt: 0.25 } });
  const rc = rockingChair();
  const rcx = r.x1 - 1.0;
  const rcz = r.z0 + 0.9;
  rc.group.position.set(rcx, 0, rcz);
  rc.group.rotation.y = Math.atan2(cx - rcx, cz - rcz);
  L.mesh(rc.group, { collider: [{ min: [-0.3, 0, -0.45], max: [0.3, 1.1, 0.45] }] });
  U.cull.push([rc.group, 15], [mob.group, 15]);
  if (cradle) U.cull.push([cradle, 15]);

  // Dolls in a ring round the cradle, and two on the dresser.
  const dolls = [];
  const addDoll = (k, x, y, z, rotY) => {
    const d = doll(k);
    U.place(d.group, x, y, z, rotY);
    d.head.position.set(x, y + d.neck, z);
    d.head.rotation.order = 'YXZ';
    d.head.rotation.y = rotY;
    L.group.add(d.head);
    U.cull.push([d.head, 15]);
    dolls.push(d);
  };
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const x = cx + Math.sin(a) * 1.05;
    const z = cz + Math.cos(a) * 1.05;
    addDoll(k + 1, x, 0, z, Math.atan2(cx - x, cz - z));
  }
  if (dr) {
    addDoll(7, r.x1 - 0.4, topOf(dr), -5.3, -Math.PI / 2);
    addDoll(8, r.x1 - 0.4, topOf(dr), -4.75, -Math.PI / 2);
    U.prop('candle', r.x1 - 0.45, -4.4, { y: topOf(dr), flicker: 0.5 });
  }
  // Wooden blocks scattered on the rug.
  const bp = new Parts();
  for (let k = 0; k < 9; k++) bp.box(k % 3 ? 'wood' : 'clothRed', 0.07, 0.07, 0.07, cx + L.rng.range(-1.4, 1.4), 0.035, cz + L.rng.range(0.9, 1.8), 0, L.rng.range(0, 1.5), 0);
  U.place(bp.build(), 0, 0, 0);
  for (const [z, y] of [[-3.4, 0.62], [-3.7, 0.8], [-3.2, 0.95]]) U.wallDecal('handprint', r.x0 + 0.11, y, z, 'e', 0.17);
  U.wallDecal('sigil', r.x1 - 0.11, 0.85, -7.8, 'w', 0.6);
  U.wallDecal('bloodDrip', r.x1 - 0.11, 1.8, -8.6, 'w', [0.7, 1.1]);
  U.note([cx - 0.7, 0, cz + 1.25], ['A drawing in wax crayon: a small house sitting on black water.', 'In the water, a woman with horns and a crown of hands. In every window of the house, a small face.'], 'Look at the drawing', { size: [0.3, 0.22] });
  L.sound('creak', [rcx, 0.5, rcz], { interval: [4, 9], radius: 8, gain: 0.45 });

  // Everything in here moves when you aren't looking at it.
  let inside = false;
  let armed = false;
  let rockAmp = 0.05;
  const fwd = new THREE.Vector3();
  const to = new THREE.Vector3();
  const wp = new THREE.Vector3();
  L.trigger({ min: [r.x0, -1, r.z0], max: [r.x1, 4, r.z1], onEnter: () => (inside = true), onExit: () => (inside = false) });
  L.onUpdate((dt, t, g) => {
    const near = Math.abs(g.player.position.x - cx) < 14 && g.player.position.z < 4;
    if (!near) return;
    if (cradle) cradle.rotation.x = Math.sin(t * 1.3) * 0.06;
    mob.spin.rotation.y += dt * 0.25;
    rockAmp += ((inside ? 0.16 : 0.05) - rockAmp) * Math.min(1, dt * 0.5);
    rc.rock.rotation.x = Math.sin(t * 1.7) * rockAmp;
    if (!inside) return;
    g.camera.getWorldDirection(fwd);
    const eye = g.camera.position;
    for (const d of dolls) {
      d.head.getWorldPosition(wp);
      to.subVectors(wp, eye);
      const seen = fwd.dot(to.normalize()) > 0.55;
      if (seen) {
        armed = true;
        continue;
      }
      if (!armed) continue;
      // Turn to face the player (heads turn all the way round if they must).
      d.head.rotation.y = Math.atan2(eye.x - wp.x, eye.z - wp.z);
      d.head.rotation.x = -0.15;
    }
  });
}

export function sickroom(U) {
  const { L } = U;
  const r = U.rect('Q');
  const bx = r.x1 - 0.1 - 1.03;
  const bz = 3.3;
  U.prop('bed', bx, bz, { face: 'w', args: { bloody: true, blanket: 'cloth' } });
  // Rope restraints knotted to the bed frame.
  const rp = new Parts();
  for (const [dx, dz] of [[-0.9, -0.75], [-0.9, 0.75], [0.85, -0.75], [0.85, 0.75]]) {
    rp.limb('rope', [bx + dx, 0.55, bz + dz], [bx + dx * 1.02, 0.12, bz + dz * 1.06], 0.012, 0.012, false);
    rp.add('rope', new THREE.TorusGeometry(0.05, 0.012, 5, 10), new THREE.Matrix4().makeTranslation(bx + dx * 1.02, 0.1, bz + dz * 1.06));
  }
  // IV stand with an empty bag, her hair tie on the pillow.
  rp.limb(M.iron, [bx - 1.5, 0, bz - 1.2], [bx - 1.5, 1.9, bz - 1.2], 0.012, 0.012, false);
  rp.limb(M.iron, [bx - 1.62, 1.88, bz - 1.2], [bx - 1.38, 1.88, bz - 1.2], 0.008, 0.008, false);
  rp.box(M.linen, 0.1, 0.18, 0.04, bx - 1.62, 1.72, bz - 1.2);
  rp.add(M.dress(0x7a1a22), new THREE.TorusGeometry(0.025, 0.006, 5, 12), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(bx + 0.75, 0.62, bz - 0.2));
  U.place(rp.build(), 0, 0, 0);
  const ch = U.prop('chair', bx - 1.6, 1.3, { rotY: 2.2 });
  if (ch) {
    const cp = new Parts();
    cp.box('cloth', 0.36, 0.06, 0.3, 0, 0.5, 0, 0, 0.3, 0.05);
    cp.box(M.dress(0x2a3a50), 0.3, 0.05, 0.25, 0, 0.55, 0, 0, 0.5, 0);
    U.place(cp.build(), bx - 1.6, 0, 1.3);
  }
  U.prop('bloodBucket', r.x1 - 0.35, r.z0 + 0.4);
  U.prop('boardedWindow', r.x0 + 0.1, 3.0, { face: 'e' });
  // Tally marks scratched into the wall beside the bed.
  const tally = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshStandardMaterial({ map: tallyTexture(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
  tally.position.set(bx - 0.2, 1.25, r.z1 - 0.105);
  tally.rotation.y = Math.PI;
  L.group.add(tally);
  U.note([bx - 0.2, 1.1, r.z1 - 0.3], ['Tally marks, scratched in with a fingernail or a spoon. Hundreds of them. Almost a year.', 'Under them, small and careful: her initials.'], 'Look at the scratches', { paper: false, noLOS: true, radius: 1.8 });
  U.floorDecal('bloodSmear', bx - 1.2, 2.2, [0.8, 1.8], 1.2);
  U.floorDecal('grime', 10.5, 3, 3);
  U.wallDecal('claws', r.x1 - 0.11, 1.0, 1.4, 'w', [0.6, 0.5]);
}
