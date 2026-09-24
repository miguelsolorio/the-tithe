import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANDMARKS } from '../config.js';
import { RNG } from '../core/rng.js';
import { yawTo } from '../core/utils.js';
import { getHeight } from './terrain.js';
import { deadTreeGeometry, effigyGeometry, MATERIALS } from './forest.js';
import { woodTexture, signTexture, softSprite } from './textures.js';

const wood = woodTexture();
const M = {
  stone: new THREE.MeshLambertMaterial({ color: 0x8a8a83, flatShading: true }),
  darkStone: new THREE.MeshLambertMaterial({ color: 0x5e5e5a, flatShading: true }),
  wood: new THREE.MeshLambertMaterial({ color: 0x7a624a, map: wood }),
  darkWood: new THREE.MeshLambertMaterial({ color: 0x4d3c2c, map: wood }),
  iron: new THREE.MeshLambertMaterial({ color: 0x3a3a3e }),
  cloth: new THREE.MeshLambertMaterial({ color: 0x5b664f, side: THREE.DoubleSide }),
  bone: new THREE.MeshLambertMaterial({ color: 0xcfc6b0 }),
  rope: new THREE.MeshLambertMaterial({ color: 0x7a6a50 }),
  black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
  dirt: new THREE.MeshLambertMaterial({ color: 0x4d3d2c, flatShading: true }),
  carPaint: new THREE.MeshLambertMaterial({ color: 0x55707c }),
  glass: new THREE.MeshLambertMaterial({ color: 0x0b0f12 }),
  flame: new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(4, 1.6, 0.4),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  ember: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.6, 0.35, 0.05) }),
  windowGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.8, 0.95, 0.35) }),
  hazard: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3, 1.2, 0.1) }),
  headlight: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.5, 1.4, 1.1) }),
  socketOff: new THREE.MeshLambertMaterial({ color: 0x1e2420 }),
  socketOn: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.2, 3, 1.5) }),
  ashRing: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.02, 0.02), side: THREE.DoubleSide }),
};

function add(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Rotates a landmark-local point into world space (matches group.rotation.y = rot).
function toWorld(L, rot, lx, lz) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: L.x + lx * c + lz * s, z: L.z - lx * s + lz * c };
}

function boxCollider(grid, L, rot, lx, lz, hw, hd) {
  const p = toWorld(L, rot, lx, lz);
  return grid.insert({ type: 'box', x: p.x, z: p.z, hw, hd, rot, kind: 'wall' });
}

function circleCollider(grid, L, rot, lx, lz, r, kind = 'prop') {
  const p = toWorld(L, rot, lx, lz);
  return grid.insert({ type: 'circle', x: p.x, z: p.z, r, kind });
}

function flameCone(parent, x, y, z, s = 1) {
  const f = add(parent, new THREE.ConeGeometry(0.06 * s, 0.22 * s, 5).translate(0, 0.11 * s, 0), M.flame, x, y, z, false);
  f.userData.flicker = Math.random() * 10;
  return f;
}

export function buildLandmarks(scene, grid, lightPool) {
  const rng = new RNG(4242);
  const flames = [];
  const swingers = [];
  const out = {
    relicSpots: [],
    batterySpots: [],
    safeZones: [],
    hermitSpots: [],
    hikerSeat: null,
    hatSpot: null,
    wellPos: null,
    campfirePos: null,
    gate: null,
    hazard: null,
  };

  // ======================= CAMPFIRE =======================
  {
    const L = LANDMARKS.campfire;
    const y = getHeight(L.x, L.z);
    const g = new THREE.Group();
    g.position.set(L.x, y, L.z);
    scene.add(g);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      add(g, new THREE.DodecahedronGeometry(0.17, 0), M.darkStone, Math.cos(a) * 0.72, 0.06, Math.sin(a) * 0.72);
    }
    for (let i = 0; i < 4; i++) {
      const log = add(g, new THREE.CylinderGeometry(0.07, 0.08, 1.1, 6), M.darkWood, 0, 0.2, 0);
      log.rotation.set(Math.PI / 2 - 0.5, (i / 4) * Math.PI * 2, 0, 'YXZ');
    }
    add(g, new THREE.CylinderGeometry(0.55, 0.6, 0.03, 12), M.ember, 0, 0.02, 0, false);
    for (let i = 0; i < 4; i++) {
      const f = add(
        g,
        new THREE.ConeGeometry(0.28 - i * 0.04, 1.0 - i * 0.12, 6).translate(0, 0.45, 0),
        M.flame,
        (rng.float() - 0.5) * 0.25,
        0.05,
        (rng.float() - 0.5) * 0.25,
        false
      );
      f.userData.flicker = i * 1.7;
      f.userData.big = true;
      flames.push(f);
    }
    lightPool.add({ pos: new THREE.Vector3(L.x, y + 0.9, L.z), color: 0xff7330, intensity: 16, distance: 24, flicker: 0.9 });

    // Seat logs
    const seats = [0.9, 2.6];
    seats.forEach((a, i) => {
      const r = 2.3;
      const lx = Math.cos(a) * r;
      const lz = Math.sin(a) * r;
      const log = add(g, new THREE.CylinderGeometry(0.22, 0.24, 1.9, 8), M.wood, lx, 0.2, lz);
      log.rotation.set(0, -a + Math.PI / 2, Math.PI / 2);
      circleCollider(grid, L, 0, lx + Math.sin(a) * 0.5, lz - Math.cos(a) * 0.5, 0.35);
      circleCollider(grid, L, 0, lx - Math.sin(a) * 0.5, lz + Math.cos(a) * 0.5, 0.35);
      if (i === 0) {
        out.hikerSeat = { pos: new THREE.Vector3(L.x + lx, y + 0.42, L.z + lz), yaw: yawTo(-lx, -lz) };
        out.hatSpot = new THREE.Vector3(L.x + lx * 0.95, y + 0.44, L.z + lz * 0.95);
      }
    });

    // Tent
    const tent = add(
      g,
      new THREE.CylinderGeometry(1.3, 1.3, 2.4, 3, 1, true).rotateX(-Math.PI / 2).translate(0, 0.65, 0),
      M.cloth,
      3.6,
      0,
      -2.6
    );
    tent.rotation.y = 0.4;
    circleCollider(grid, L, 0, 3.6, -2.6, 1.3);
    out.batterySpots.push(new THREE.Vector3(L.x + 2.4, y + 0.05, L.z - 1.4));

    out.safeZones.push({ x: L.x, z: L.z, r: 9 });
    out.campfirePos = new THREE.Vector3(L.x, y + 0.5, L.z);
  }

  // ======================= BROKEN-DOWN CAR + SIGN =======================
  {
    const S = LANDMARKS.spawn;
    const cx = S.x + 3.5;
    const cz = S.z + 8;
    const y = getHeight(cx, cz);
    const car = new THREE.Group();
    car.position.set(cx, y, cz);
    car.rotation.y = Math.PI + 0.12;
    scene.add(car);
    add(car, new THREE.BoxGeometry(1.8, 0.7, 4.3), M.carPaint, 0, 0.62, 0);
    add(car, new THREE.BoxGeometry(1.6, 0.62, 2.2), M.carPaint, 0, 1.28, -0.3);
    add(car, new THREE.BoxGeometry(1.62, 0.48, 2.0), M.glass, 0, 1.3, -0.3, false);
    for (const [wx, wz] of [
      [-0.9, 1.4],
      [0.9, 1.4],
      [-0.9, -1.4],
      [0.9, -1.4],
    ]) {
      add(car, new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12).rotateZ(Math.PI / 2), M.iron, wx, 0.36, wz);
    }
    add(car, new THREE.BoxGeometry(0.34, 0.14, 0.05), M.headlight, -0.6, 0.72, 2.16, false);
    const hz1 = add(car, new THREE.BoxGeometry(0.22, 0.12, 0.05), M.hazard, -0.7, 0.8, -2.16, false);
    const hz2 = add(car, new THREE.BoxGeometry(0.22, 0.12, 0.05), M.hazard, 0.7, 0.8, -2.16, false);
    const hzLight = lightPool.add({
      pos: new THREE.Vector3(cx, y + 1, cz + 2.6),
      color: 0xff8a1a,
      intensity: 5,
      distance: 12,
    });
    out.hazard = { meshes: [hz1, hz2], light: hzLight, base: 5 };
    grid.insert({ type: 'box', x: cx, z: cz, hw: 0.95, hd: 2.2, rot: car.rotation.y, kind: 'wall' });

    // Trail sign
    const sx = S.x - 2.2;
    const sz = S.z - 5;
    const sy = getHeight(sx, sz);
    const sign = new THREE.Group();
    sign.position.set(sx, sy, sz);
    sign.rotation.y = 0.25;
    scene.add(sign);
    add(sign, new THREE.BoxGeometry(0.12, 1.8, 0.12), M.darkWood, -0.8, 0.9, 0);
    add(sign, new THREE.BoxGeometry(0.12, 1.8, 0.12), M.darkWood, 0.8, 0.9, 0);
    const board = new THREE.MeshLambertMaterial({ map: signTexture(['HOLLOW PINES', 'TRAIL CLOSED']) });
    add(sign, new THREE.BoxGeometry(2, 1, 0.06), [M.darkWood, M.darkWood, M.darkWood, M.darkWood, board, M.darkWood], 0, 1.45, 0.05);
    circleCollider(grid, { x: sx, z: sz }, 0, 0, 0, 0.9);
  }

  // ======================= CABIN =======================
  {
    const L = LANDMARKS.cabin;
    const C = LANDMARKS.campfire;
    const rot = yawTo(C.x - L.x, C.z - L.z);
    const y = getHeight(L.x, L.z);
    const g = new THREE.Group();
    g.position.set(L.x, y, L.z);
    g.rotation.y = rot;
    scene.add(g);
    const W = 6;
    const D = 5;
    const H = 2.7;
    const T = 0.2;
    add(g, new THREE.BoxGeometry(W, 0.2, D), M.darkWood, 0, 0.1, 0);
    add(g, new THREE.BoxGeometry(W, H, T), M.wood, 0, H / 2, -D / 2); // back
    add(g, new THREE.BoxGeometry(T, H, D), M.wood, -W / 2, H / 2, 0); // left
    add(g, new THREE.BoxGeometry(T, H, D), M.wood, W / 2, H / 2, 0); // right
    const seg = W / 2 - 0.65;
    add(g, new THREE.BoxGeometry(seg, H, T), M.wood, -(0.65 + seg / 2), H / 2, D / 2);
    add(g, new THREE.BoxGeometry(seg, H, T), M.wood, 0.65 + seg / 2, H / 2, D / 2);
    add(g, new THREE.BoxGeometry(1.3, 0.55, T), M.wood, 0, H - 0.27, D / 2);
    // Door hanging open
    const door = add(g, new THREE.BoxGeometry(1.2, 2.1, 0.06).translate(0.6, 1.05, 0), M.darkWood, -0.62, 0.2, D / 2 + 0.05);
    door.rotation.y = -1.9;
    // Windows: dark on the sides, one faintly lit at the front
    add(g, new THREE.BoxGeometry(0.05, 0.7, 0.9), M.glass, -W / 2 - 0.11, 1.5, 0.4, false);
    add(g, new THREE.BoxGeometry(0.05, 0.7, 0.9), M.glass, W / 2 + 0.11, 1.5, -0.6, false);
    add(g, new THREE.BoxGeometry(0.9, 0.7, 0.05), M.windowGlow, 1.8, 1.5, D / 2 + 0.11, false);
    // Roof
    const run = D / 2 + 0.45;
    const pitch = 0.5;
    const roofLen = run / Math.cos(pitch);
    const rise = Math.tan(pitch) * run;
    const r1 = add(g, new THREE.BoxGeometry(W + 0.6, 0.12, roofLen), M.darkWood, 0, H + rise / 2, run / 2);
    r1.rotation.x = pitch;
    const r2 = add(g, new THREE.BoxGeometry(W + 0.6, 0.12, roofLen), M.darkWood, 0, H + rise / 2, -run / 2);
    r2.rotation.x = -pitch;
    // Gable ends (triangular prisms, apex up)
    const gr = run / 0.866;
    const gsy = rise / (1.5 * gr);
    for (const sx of [-W / 2, W / 2]) {
      const gable = add(g, new THREE.CylinderGeometry(gr, gr, 0.18, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), M.wood, sx, 0, 0);
      gable.scale.set(1, gsy, 1);
      gable.position.y = H + 0.5 * gr * gsy;
    }
    // Porch
    add(g, new THREE.BoxGeometry(W, 0.14, 1.6), M.darkWood, 0, 0.07, D / 2 + 0.8);
    for (const px of [-W / 2 + 0.15, W / 2 - 0.15]) add(g, new THREE.BoxGeometry(0.14, H, 0.14), M.darkWood, px, H / 2, D / 2 + 1.5);
    add(g, new THREE.BoxGeometry(W, 0.1, 1.8), M.darkWood, 0, H + 0.05, D / 2 + 0.85);
    // Rocking chair
    const chair = new THREE.Group();
    chair.position.set(-1.9, 0.14, D / 2 + 0.8);
    chair.rotation.y = 0.5;
    g.add(chair);
    add(chair, new THREE.BoxGeometry(0.5, 0.06, 0.5), M.wood, 0, 0.45, 0);
    add(chair, new THREE.BoxGeometry(0.5, 0.7, 0.06), M.wood, 0, 0.8, -0.24);
    add(chair, new THREE.TorusGeometry(0.4, 0.025, 4, 12, Math.PI * 0.6).rotateY(Math.PI / 2).rotateX(Math.PI / 2 + 0.95), M.wood, 0.22, 0.05, 0);
    add(chair, new THREE.TorusGeometry(0.4, 0.025, 4, 12, Math.PI * 0.6).rotateY(Math.PI / 2).rotateX(Math.PI / 2 + 0.95), M.wood, -0.22, 0.05, 0);
    out.rockingChair = chair;
    // Interior
    add(g, new THREE.BoxGeometry(1.4, 0.08, 0.8), M.wood, 0.4, 0.95, -D / 2 + 0.7);
    for (const [lx, lz] of [
      [-0.2, -D / 2 + 0.4],
      [1.0, -D / 2 + 0.4],
      [-0.2, -D / 2 + 1.0],
      [1.0, -D / 2 + 1.0],
    ])
      add(g, new THREE.BoxGeometry(0.07, 0.8, 0.07), M.wood, lx, 0.55, lz);
    add(g, new THREE.BoxGeometry(0.9, 0.5, 1.9), M.darkWood, -2.3, 0.45, -1.2); // cot
    const candle = add(g, new THREE.CylinderGeometry(0.03, 0.035, 0.14, 6), M.bone, 0.85, 1.06, -D / 2 + 0.55);
    flames.push(flameCone(g, 0.85, 1.13, -D / 2 + 0.55, 0.7));
    void candle;

    // Colliders
    boxCollider(grid, L, rot, 0, -D / 2, W / 2, T / 2 + 0.05);
    boxCollider(grid, L, rot, -W / 2, 0, T / 2 + 0.05, D / 2);
    boxCollider(grid, L, rot, W / 2, 0, T / 2 + 0.05, D / 2);
    boxCollider(grid, L, rot, -(0.65 + seg / 2), D / 2, seg / 2, T / 2 + 0.05);
    boxCollider(grid, L, rot, 0.65 + seg / 2, D / 2, seg / 2, T / 2 + 0.05);
    boxCollider(grid, L, rot, 0.4, -D / 2 + 0.7, 0.75, 0.45);
    boxCollider(grid, L, rot, -2.3, -1.2, 0.45, 0.95);

    const wp = (lx, lz, ly = 0) => {
      const p = toWorld(L, rot, lx, lz);
      return new THREE.Vector3(p.x, getHeight(p.x, p.z) + ly, p.z);
    };
    const winLight = wp(1.8, D / 2 - 0.6, 1.4);
    lightPool.add({ pos: winLight, color: 0xff9a40, intensity: 3.5, distance: 9, flicker: 0.8 });
    out.relicSpots.push({
      id: 'cabin',
      pos: wp(0.3, -D / 2 + 0.7, 1.2),
      note: {
        title: 'Scratched into the table',
        text: 'Day 12. The trees moved closer again last night. I nailed the ward above the door. It keeps HIM from coming inside. Not from watching.',
      },
    });
    out.batterySpots.push(wp(1.6, D / 2 + 0.9, 0.16));
    out.hermitSpots.push(
      { pos: wp(0.6, D / 2 + 1.15), yaw: rot },
      { pos: wp(W / 2 + 1.4, 0.5), yaw: rot + Math.PI / 2 },
      { pos: wp(-W / 2 - 1.2, -D / 2 - 1.2), yaw: rot - 0.8 },
      { pos: wp(3.8, D / 2 + 7), yaw: rot + Math.PI },
      { pos: wp(0, D / 2 - 0.6), yaw: rot },
      { pos: wp(-W / 2 - 1.0, 1.4), yaw: rot - Math.PI / 2 },
      { pos: wp(-5, D / 2 + 5), yaw: rot + 2.4 }
    );
  }

  // ======================= GRAVEYARD =======================
  {
    const L = LANDMARKS.graveyard;
    const T = LANDMARKS.hangingTree;
    const rot = yawTo(T.x - L.x, T.z - L.z);
    const y = getHeight(L.x, L.z);
    const g = new THREE.Group();
    g.position.set(L.x, y, L.z);
    g.rotation.y = rot;
    scene.add(g);
    const HW = 12;
    const HD = 9;
    const gap = 1.6;

    // Iron fence (merged)
    const fence = [];
    const postLine = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 0.5));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = x0 + (x1 - x0) * t;
        const pz = z0 + (z1 - z0) * t;
        const h = 1.3 + (i % 2) * 0.1;
        fence.push(new THREE.CylinderGeometry(0.022, 0.022, h, 4).translate(px, h / 2, pz));
        fence.push(new THREE.ConeGeometry(0.045, 0.14, 4).translate(px, h + 0.05, pz));
      }
      const a = Math.atan2(z1 - z0, x1 - x0);
      for (const ry of [0.35, 1.1]) {
        fence.push(new THREE.BoxGeometry(len, 0.035, 0.035).rotateY(-a).translate((x0 + x1) / 2, ry, (z0 + z1) / 2));
      }
    };
    postLine(-HW, -HD, HW, -HD);
    postLine(-HW, -HD, -HW, HD);
    postLine(HW, -HD, HW, HD);
    postLine(-HW, HD, -gap, HD);
    postLine(gap, HD, HW, HD);
    add(g, mergeGeometries(fence), M.iron);
    boxCollider(grid, L, rot, 0, -HD, HW, 0.12);
    boxCollider(grid, L, rot, -HW, 0, 0.12, HD);
    boxCollider(grid, L, rot, HW, 0, 0.12, HD);
    boxCollider(grid, L, rot, -(gap + (HW - gap) / 2), HD, (HW - gap) / 2, 0.12);
    boxCollider(grid, L, rot, gap + (HW - gap) / 2, HD, (HW - gap) / 2, 0.12);

    // Tombstones (merged)
    const stones = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const lx = -8.5 + col * 3.4 + rng.range(-0.4, 0.4);
        const lz = -6 + row * 3.4 + rng.range(-0.3, 0.3);
        if (Math.abs(lx) < 2 && row === 3) continue; // central aisle
        if (lx > 4 && lx < 8 && row === 1) continue; // open grave spot
        const tilt = rng.range(-0.18, 0.18);
        const kind = rng.int(0, 2);
        let geo;
        if (kind === 0) {
          geo = mergeGeometries([
            new THREE.BoxGeometry(0.62, 0.8, 0.14).translate(0, 0.4, 0),
            new THREE.CylinderGeometry(0.31, 0.31, 0.14, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.8, 0),
          ]);
        } else if (kind === 1) {
          geo = mergeGeometries([
            new THREE.BoxGeometry(0.14, 1.2, 0.12).translate(0, 0.6, 0),
            new THREE.BoxGeometry(0.6, 0.13, 0.12).translate(0, 0.85, 0),
          ]);
        } else {
          geo = new THREE.BoxGeometry(0.5, 0.55, 0.3).translate(0, 0.27, 0);
        }
        geo.rotateZ(tilt).rotateX(rng.range(-0.12, 0.12)).rotateY(rng.range(-0.15, 0.15)).translate(lx, 0, lz);
        stones.push(geo);
        circleCollider(grid, L, rot, lx, lz, 0.35, 'grave');
      }
    }
    const tombs = add(g, mergeGeometries(stones), M.stone);
    tombs.castShadow = true;

    // Open grave
    add(g, new THREE.BoxGeometry(1.0, 0.04, 2.1), M.black, 6, 0.02, -2.6, false);
    add(g, new THREE.DodecahedronGeometry(0.8, 0).scale(1.3, 0.45, 0.8), M.dirt, 7.6, 0.1, -2.6);
    const shovel = new THREE.Group();
    shovel.position.set(7.4, 0, -1.5);
    shovel.rotation.z = 0.25;
    g.add(shovel);
    add(shovel, new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5), M.darkWood, 0, 0.85, 0);
    add(shovel, new THREE.BoxGeometry(0.25, 0.3, 0.03), M.iron, 0, 0.1, 0);
    circleCollider(grid, L, rot, 7.6, -2.6, 0.9, 'grave');

    // Stone angel with hands over its face
    const angel = new THREE.Group();
    angel.position.set(0, 0, -7.2);
    g.add(angel);
    add(angel, new THREE.BoxGeometry(1.1, 0.8, 1.1), M.darkStone, 0, 0.4, 0);
    add(angel, new THREE.CylinderGeometry(0.2, 0.45, 1.5, 8), M.stone, 0, 1.55, 0);
    add(angel, new THREE.SphereGeometry(0.17, 8, 6), M.stone, 0, 2.45, 0.02);
    add(angel, new THREE.BoxGeometry(0.3, 0.14, 0.12), M.stone, 0, 2.43, 0.17);
    for (const s of [-1, 1]) {
      const wing = add(angel, new THREE.BoxGeometry(0.08, 1.3, 0.7), M.stone, s * 0.3, 2.0, -0.3);
      wing.rotation.set(0.3, s * 0.5, s * 0.25);
      const arm = add(angel, new THREE.BoxGeometry(0.1, 0.5, 0.1), M.stone, s * 0.14, 2.2, 0.15);
      arm.rotation.x = -0.8;
    }
    circleCollider(grid, L, rot, 0, -7.2, 0.75, 'grave');

    // A lone dead tree inside the fence
    const tree = deadTreeGeometry(new RNG(99));
    const tm = add(g, tree.geo, MATERIALS.deadBark, -8, -0.2, -5.5);
    tm.scale.setScalar(1.3);
    circleCollider(grid, L, rot, -8, -5.5, 0.45, 'tree');

    const wp = (lx, lz, ly = 0) => {
      const p = toWorld(L, rot, lx, lz);
      return new THREE.Vector3(p.x, getHeight(p.x, p.z) + ly, p.z);
    };
    out.relicSpots.push({
      id: 'graveyard',
      pos: wp(6, -2.6, 0.35),
      note: {
        title: 'Folded in a coffin nail',
        text: 'They buried the ones who stayed. The stones have no names, because the forest took the names too.',
      },
    });
    out.batterySpots.push(wp(-2.5, HD + 1.4, 0.05));
  }

  // ======================= WELL =======================
  {
    const L = LANDMARKS.well;
    const y = getHeight(L.x, L.z);
    const g = new THREE.Group();
    g.position.set(L.x, y, L.z);
    scene.add(g);
    const ringMat = M.stone.clone();
    ringMat.side = THREE.DoubleSide;
    add(g, new THREE.CylinderGeometry(1.25, 1.35, 0.95, 14, 1, true), ringMat, 0, 0.47, 0);
    add(g, new THREE.TorusGeometry(1.28, 0.13, 5, 14).rotateX(Math.PI / 2), M.stone, 0, 0.95, 0);
    add(g, new THREE.CircleGeometry(1.2, 14).rotateX(-Math.PI / 2), M.black, 0, 0.35, 0, false);
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.16, 2.5, 0.16), M.darkWood, s * 1.3, 1.25, 0);
    add(g, new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6).rotateZ(Math.PI / 2), M.darkWood, 0, 2.2, 0);
    add(
      g,
      new THREE.CylinderGeometry(1.0, 1.0, 3.0, 3, 1, false).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2),
      M.darkWood,
      0,
      2.75,
      0
    ).scale.set(1, 0.55, 1);
    add(g, new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4), M.rope, 0.25, 1.65, 0);
    add(g, new THREE.CylinderGeometry(0.14, 0.11, 0.22, 8), M.darkWood, 0.25, 1.05, 0);
    grid.insert({ type: 'circle', x: L.x, z: L.z, r: 1.5, kind: 'prop' });
    out.wellPos = new THREE.Vector3(L.x, y + 0.5, L.z);
    out.relicSpots.push({
      id: 'well',
      pos: new THREE.Vector3(L.x + 1.28, y + 1.18, L.z + 0.2),
      note: {
        title: 'Tied to the bucket rope',
        text: "Don't answer the voices in the well. They know your mother's voice. They learned it.",
      },
    });
    out.batterySpots.push(new THREE.Vector3(L.x - 2.2, getHeight(L.x - 2.2, L.z + 1.5) + 0.05, L.z + 1.5));
  }

  // ======================= STONE CIRCLE =======================
  {
    const L = LANDMARKS.stones;
    const y = getHeight(L.x, L.z);
    const g = new THREE.Group();
    g.position.set(L.x, y, L.z);
    scene.add(g);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const h = rng.range(2.2, 3.4) * (i === 4 ? 0.45 : 1);
      const lx = Math.cos(a) * 7;
      const lz = Math.sin(a) * 7;
      const s = add(g, new THREE.BoxGeometry(1.0, h, 0.6).translate(0, h / 2, 0), M.stone, lx, -0.2, lz);
      s.rotation.set(rng.range(-0.08, 0.08), -a + Math.PI / 2, rng.range(-0.1, 0.1));
      circleCollider(grid, L, 0, lx, lz, 0.65, 'stone');
    }
    add(g, new THREE.BoxGeometry(2.2, 0.85, 1.2), M.darkStone, 0, 0.42, 0);
    grid.insert({ type: 'box', x: L.x, z: L.z, hw: 1.1, hd: 0.6, rot: 0, kind: 'wall' });
    add(g, new THREE.RingGeometry(4.2, 4.5, 40).rotateX(-Math.PI / 2), M.ashRing, 0, 0.03, 0, false);
    for (let i = 0; i < 7; i++) {
      const onAltar = i < 3;
      const lx = onAltar ? -0.8 + i * 0.35 : Math.cos(i) * 3.2;
      const lz = onAltar ? 0.35 : Math.sin(i) * 3.2;
      const ly = onAltar ? 0.85 : getHeight(L.x + lx, L.z + lz) - y;
      add(g, new THREE.CylinderGeometry(0.035, 0.04, 0.2, 6), M.bone, lx, ly + 0.1, lz, false);
      flames.push(flameCone(g, lx, ly + 0.2, lz, 0.7));
    }
    lightPool.add({ pos: new THREE.Vector3(L.x, y + 1.2, L.z), color: 0xff3a22, intensity: 5, distance: 13, flicker: 0.7 });
    out.relicSpots.push({
      id: 'stones',
      pos: new THREE.Vector3(L.x + 0.4, y + 1.1, L.z),
      note: {
        title: 'Carved into the altar',
        text: 'Five wards were cut to seal the forest. Gather them and the north gate will remember how to open.',
      },
    });
    out.batterySpots.push(new THREE.Vector3(L.x + 8.5, getHeight(L.x + 8.5, L.z + 2) + 0.05, L.z + 2));
  }

  // ======================= HANGING TREE =======================
  {
    const L = LANDMARKS.hangingTree;
    const y = getHeight(L.x, L.z);
    const g = new THREE.Group();
    g.position.set(L.x, y, L.z);
    scene.add(g);
    const tree = deadTreeGeometry(new RNG(666));
    const scale = 2.1;
    const tm = add(g, tree.geo, MATERIALS.deadBark, 0, -0.4, 0);
    tm.scale.setScalar(scale);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const root = add(g, new THREE.CylinderGeometry(0.3, 0.06, 2.6, 5), MATERIALS.deadBark, Math.cos(a) * 1.0, 0.15, Math.sin(a) * 1.0);
      root.rotation.order = 'YXZ';
      root.rotation.set(0, -a, 0);
      root.rotateZ(1.25);
    }
    grid.insert({ type: 'circle', x: L.x, z: L.z, r: 0.9, kind: 'tree' });

    const effigy = effigyGeometry();
    const hangPoints = tree.perches
      .map((p) => p.clone().multiplyScalar(scale).add(new THREE.Vector3(0, -0.4, 0)))
      .filter((p) => p.y < 13 && p.y > 4);
    hangPoints.slice(0, 6).forEach((p, i) => {
      const pivot = new THREE.Group();
      pivot.position.copy(p);
      g.add(pivot);
      const len = Math.min(p.y - 1.4, rng.range(1.6, 3.2));
      add(pivot, new THREE.CylinderGeometry(0.012, 0.012, len, 4).translate(0, -len / 2, 0), M.rope, 0, 0, 0);
      if (i % 2 === 0) {
        const e = add(pivot, effigy, MATERIALS.twig, 0, -len - 0.2, 0);
        e.scale.setScalar(2.4);
      } else {
        add(pivot, new THREE.TorusGeometry(0.2, 0.02, 4, 10), M.rope, 0, -len - 0.18, 0);
      }
      swingers.push({ obj: pivot, phase: rng.range(0, 6), amp: rng.range(0.04, 0.1) });
    });
    // Bones in the roots
    add(g, new THREE.SphereGeometry(0.13, 7, 5).scale(1, 0.9, 1.15), M.bone, 1.6, 0.1, 0.7);
    for (let i = 0; i < 5; i++) {
      const b = add(g, new THREE.CylinderGeometry(0.025, 0.03, rng.range(0.3, 0.5), 5), M.bone, 1.2 + rng.range(-0.6, 0.6), 0.04, 1 + rng.range(-0.5, 0.5));
      b.rotation.set(Math.PI / 2, rng.range(0, 3), 0);
    }
    out.relicSpots.push({
      id: 'hangingTree',
      pos: new THREE.Vector3(L.x + 1.9, y + 0.45, L.z + 1.2),
      note: {
        title: 'Wrapped around a finger bone',
        text: "The tall man doesn't walk. He's simply closer every time you look away.",
      },
    });
  }

  // ======================= NORTH GATE =======================
  {
    const L = LANDMARKS.gate;
    const y = getHeight(L.x, L.z);
    const g = new THREE.Group();
    g.position.set(L.x, y, L.z);
    scene.add(g);
    for (const s of [-1, 1]) {
      add(g, new THREE.BoxGeometry(1.0, 3.8, 1.0), M.darkStone, s * 2.75, 1.9, 0);
      add(g, new THREE.BoxGeometry(1.25, 0.25, 1.25), M.stone, s * 2.75, 3.9, 0);
      circleCollider(grid, L, 0, s * 2.75, 0, 0.75, 'wall');
    }
    add(g, new THREE.BoxGeometry(6.5, 0.5, 0.6), M.darkStone, 0, 4.3, 0);
    const sockets = [];
    for (let i = 0; i < 5; i++) {
      sockets.push(add(g, new THREE.OctahedronGeometry(0.13, 0), M.socketOff, -1.2 + i * 0.6, 4.3, 0.33, false));
    }

    const makeDoor = (dir) => {
      const parts = [];
      const w = 2.2;
      for (let i = 0; i <= 7; i++) {
        const bx = (i / 7) * w * dir;
        parts.push(new THREE.CylinderGeometry(0.03, 0.03, 3.1, 4).translate(bx, 1.55, 0));
        parts.push(new THREE.ConeGeometry(0.06, 0.2, 4).translate(bx, 3.2, 0));
      }
      for (const by of [0.4, 1.6, 2.8]) parts.push(new THREE.BoxGeometry(w, 0.06, 0.05).translate((w / 2) * dir, by, 0));
      const pivot = new THREE.Group();
      pivot.position.set(-2.2 * dir, 0, 0);
      g.add(pivot);
      add(pivot, mergeGeometries(parts), M.iron);
      return pivot;
    };
    const left = makeDoor(1);
    const right = makeDoor(-1);

    // Fence running off into the boundary trees
    const fence = [];
    for (const s of [-1, 1]) {
      for (let x = 3.4; x < 18; x += 0.45) {
        fence.push(new THREE.CylinderGeometry(0.022, 0.022, 2.2, 4).translate(s * x, 1.1, 0));
      }
      fence.push(new THREE.BoxGeometry(14.6, 0.05, 0.05).translate(s * 10.7, 1.9, 0));
      fence.push(new THREE.BoxGeometry(14.6, 0.05, 0.05).translate(s * 10.7, 0.5, 0));
      grid.insert({ type: 'box', x: L.x + s * 10.7, z: L.z, hw: 7.3, hd: 0.15, rot: 0, kind: 'wall' });
    }
    add(g, mergeGeometries(fence), M.iron);
    const lock = grid.insert({ type: 'box', x: L.x, z: L.z, hw: 2.3, hd: 0.2, rot: 0, kind: 'wall', noOcclude: true });

    const dawnGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softSprite('rgba(200,220,255,1)'),
        color: new THREE.Color(1.4, 1.5, 1.8),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    dawnGlow.scale.set(16, 12, 1);
    dawnGlow.position.set(L.x, y + 3, L.z - 16);
    scene.add(dawnGlow);
    const dawnLight = lightPool.add({ pos: new THREE.Vector3(L.x, y + 3, L.z - 6), color: 0xbfd6ff, intensity: 0, distance: 30 });

    out.gate = {
      isOpen: false,
      openT: 0,
      setRelics(n) {
        sockets.forEach((s, i) => (s.material = i < n ? M.socketOn : M.socketOff));
      },
      open() {
        if (this.isOpen) return;
        this.isOpen = true;
        lock.disabled = true;
      },
      update(dt) {
        if (!this.isOpen || this.openT >= 1) return;
        this.openT = Math.min(1, this.openT + dt / 3.5);
        const e = 1 - Math.pow(1 - this.openT, 3);
        left.rotation.y = 1.35 * e;
        right.rotation.y = -1.35 * e;
        dawnGlow.material.opacity = e * 0.55;
        dawnLight.intensity = e * 14;
      },
      pos: new THREE.Vector3(L.x, y + 1, L.z),
    };
  }

  out.update = (dt, t) => {
    for (const f of flames) {
      const k = f.userData.flicker;
      const s = 0.85 + 0.2 * Math.sin(t * 11 + k) + 0.1 * Math.sin(t * 23 + k * 2);
      f.scale.set(1 + 0.08 * Math.sin(t * 17 + k), s, 1 + 0.08 * Math.cos(t * 15 + k));
      if (f.userData.big) f.rotation.y = t * 0.8 + k;
    }
    for (const s of swingers) {
      s.obj.rotation.z = Math.sin(t * 0.7 + s.phase) * s.amp;
      s.obj.rotation.x = Math.cos(t * 0.53 + s.phase) * s.amp * 0.6;
      s.obj.rotation.y = Math.sin(t * 0.2 + s.phase) * 0.4;
    }
    if (out.hazard) {
      const on = Math.sin(t * Math.PI * 1.6) > 0;
      out.hazard.meshes.forEach((m) => (m.visible = on));
      out.hazard.light.intensity = on ? out.hazard.base : 0.001;
    }
    if (out.rockingChair) {
      out.rockingChair.rotation.x = Math.sin(t * 1.3) * 0.12;
    }
    out.gate.update(dt);
  };

  return out;
}
