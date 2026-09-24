import * as THREE from 'three';
import { makeProp, PROP_NAMES } from '../../world/props/index.js';
import { getMaterial } from '../../world/materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The sluice gate that holds back the ossuary run, its valve socket (the
// wheel waits at the baptism pool), and the barred gate between the west
// tunnel and the junction that can only be unchained from the pool side.

const GATE_Z = 38.0;
const RAISE = 1.95;
const SOCKET = new THREE.Vector3(21.3, 1.25, 36.9);
const ease = (t) => t * t * (3 - 2 * t);

// A plain wheel if the item model is missing.
function wheelModel() {
  if (PROP_NAMES.includes('valveWheel')) return makeProp('valveWheel');
  const g = new THREE.Group();
  const m = getMaterial('rust');
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 6, 20).rotateX(Math.PI / 2), m));
  for (let k = 0; k < 4; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.025), m);
    s.rotation.y = (k * Math.PI) / 4;
    g.add(s);
  }
  return g;
}

export function buildSluice(L, fx, game, { flood }) {
  const has = (f) => game.flags.has(f);
  let open = flood || has('sluice.open');
  let fitted = open || has('valve.fitted');

  // ---- The gate, with stone packing either side of its posts.
  const gate = L.prop('sluiceGate', 24, GATE_Z, { face: 'n', args: { w: 2.4, h: 2.3, wetLine: 1.3 } });
  const ud = gate.userData;
  const gateCol = ud.colliders?.[ud.gateColliderIndex ?? 3] || null;
  const panel = ud.gate || null;
  for (const [x0, x1] of [
    [22.0, 22.32],
    [25.68, 26.0],
  ])
    L.box([x0, 0, GATE_Z - 0.34], [x1, 3.1, GATE_Z + 0.34], 'stoneWet');
  // Held-back water behind it.
  const held = L.water({ min: [22.1, GATE_Z + 0.4], max: [25.9, 45], y: open ? -0.12 : 0.9, color: 'teal', opacity: 0.85 });
  // Surge that floods the junction floor when it opens.
  const surge = L.water({ min: [20.1, 29.1], max: [27.9, GATE_Z], y: -0.08, color: 0x2b5553, opacity: 0.72 });
  surge.mesh.visible = false;
  surge.mesh.userData.noCull = true;

  const setOpen = () => {
    if (panel) panel.position.y = RAISE;
    if (gateCol) gateCol.enabled = false;
    held.setLevel(-0.12);
  };

  // ---- Valve socket on the junction wall.
  const socket = L.prop('valveSocket', SOCKET.x, SOCKET.z, { y: SOCKET.y, face: 'n' });
  const slot = socket.userData.slot || socket;
  let wheel = null;
  const fitWheel = () => {
    wheel = wheelModel();
    wheel.rotation.x = Math.PI / 2;
    slot.add(wheel);
  };
  if (fitted) fitWheel();
  if (open) setOpen();

  let busy = false;
  const it = L.interact({
    pos: [SOCKET.x, SOCKET.y, SOCKET.z - 0.3],
    radius: 1.7,
    ignore: socket.userData.colliders,
    prompt: (g) => {
      if (open || busy) return null;
      if (fitted) return 'Turn the valve';
      return g.inventory.has('valve') ? 'Fit the valve wheel' : 'Examine the valve';
    },
    onUse: (g) => {
      if (open || busy) return;
      if (!fitted) {
        if (!g.inventory.has('valve')) {
          g.hud.say('The valve wheel is missing.', 3);
          setTimeout(() => g.levels.current === L.level && g.hud.say('Only a bare square spindle juts out of the housing.', 3), 1600);
          return;
        }
        g.inventory.removeItem('valve');
        g.setFlag('valve.fitted');
        fitted = true;
        fitWheel();
        wheel.position.z = 0.12;
        slideT = 0;
        g.audio.play('fuse', { pos: SOCKET.clone(), gain: 0.9 });
        g.hud.say('The wheel seats on the spindle with a clank.', 3);
        return;
      }
      // Turn it: the wheel spins, then the gate grinds up and the water comes out.
      busy = true;
      turnT = 0;
      g.audio.play('valve', { pos: SOCKET.clone() });
      g.hud.say('The wheel fights you, then gives.', 3);
    },
  });

  let slideT = -1;
  let turnT = -1;
  let raiseT = -1;
  let gush = null;
  L.onUpdate((dt, t, g) => {
    if (slideT >= 0 && wheel) {
      slideT = Math.min(1, slideT + dt * 3);
      wheel.position.z = 0.12 * (1 - ease(slideT));
      if (slideT >= 1) slideT = -1;
    }
    if (turnT >= 0) {
      turnT += dt;
      slot.rotation.z = -ease(Math.min(1, turnT / 2.8)) * Math.PI * 5;
      if (turnT >= 2.4 && raiseT < 0) {
        raiseT = 0;
        open = true;
        it.alive = false;
        g.setFlag('sluice.open');
        g.audio.play('creak', { pos: new THREE.Vector3(24, 2.5, GATE_Z), gain: 1 });
        g.audio.play('grate', { pos: new THREE.Vector3(24, 1.5, GATE_Z), gain: 0.8 });
        g.player.shake = Math.max(g.player.shake, 0.35);
        gush = startGush(L, fx, g);
      }
      if (turnT >= 2.8) turnT = -1;
    }
    if (raiseT >= 0) {
      raiseT += dt;
      const k = ease(Math.min(1, raiseT / 4.5));
      if (panel) panel.position.y = RAISE * k;
      // The held water drops as it pours out under the rising edge.
      held.setLevel(0.9 - 1.02 * ease(Math.min(1, raiseT / 5.5)));
      const s = raiseT < 1.3 ? ease(raiseT / 1.3) : Math.max(0, 1 - (raiseT - 1.3) / 6);
      surge.mesh.visible = s > 0.01;
      surge.setLevel(-0.08 + 0.2 * s);
      if (raiseT > 1.6 && gateCol?.enabled) {
        gateCol.enabled = false;
        L.level.markNavDirty();
      }
      if (raiseT >= 8) {
        raiseT = -1;
        busy = false;
        surge.mesh.visible = false;
        g.hud.say('The run beyond is open. It smells of old bone.', 3.5);
      }
    }
    gush?.update(dt, g);
  });

  // The gate itself explains what it is.
  L.interact({
    pos: [24, 1.3, GATE_Z - 0.35],
    radius: 1.8,
    ignore: ud.colliders,
    enabled: () => !open,
    prompt: 'Sluice gate',
    onUse: (g) => g.hud.say('Rusted iron, taller than you. Water presses on the far side; you can hear it pushing.', 4),
  });

  shortcutGate(L, game);
}

// Water bursting out under the gate: a torrent sheet, spray and a roar.
function startGush(L, fx, g) {
  const mat = fx.streamMat.clone();
  mat.map = fx.streak.clone();
  mat.map.needsUpdate = true;
  mat.opacity = 0;
  const geo = new THREE.PlaneGeometry(2.4, 3.2, 1, 6);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setY(i, 0.04 + Math.max(0, z + 0.3) * 0.2);
  }
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(24, 0, GATE_Z - 1.2);
  mesh.renderOrder = 2;
  L.group.add(mesh);
  const loop = g.audio.loop('waterFlow', { pos: new THREE.Vector3(24, 0.5, GATE_Z - 1), gain: 1 });
  g.audio.play('waterRise', { pos: new THREE.Vector3(24, 0.5, GATE_Z - 1) });
  g.audio.play('splash', { pos: new THREE.Vector3(24, 0.3, GATE_Z - 1) });
  let t = 0;
  let spray = 0;
  let done = false;
  return {
    update(dt, game) {
      if (done) return;
      t += dt;
      mat.opacity = Math.min(0.7, t * 0.8) * Math.max(0, 1 - Math.max(0, t - 4.5) / 3.5);
      mat.map.offset.y = (t * 2.2) % 1;
      spray -= dt;
      if (spray <= 0 && t < 6) {
        spray = 0.07;
        const x = 22.9 + Math.random() * 2.2;
        game.particles.impact(new THREE.Vector3(x, 0.15, GATE_Z - 0.3), { x: 0, y: 0.6, z: -1 }, 'splash', 3);
      }
      if (t > 8) {
        done = true;
        loop?.stop(1.5);
        mesh.removeFromParent();
        geo.dispose();
        mat.map.dispose();
        mat.dispose();
      }
    },
  };
}

// Double barred gate across the west tunnel mouth, chained on the tunnel side.
function shortcutGate(L, game) {
  const z = 29;
  const open = game.flags.has('cistern.shortcut');
  const rust = getMaterial('rust');
  const leaves = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side < 0 ? 22.1 : 25.9, 0, z);
    const w = 1.88;
    const dir = side < 0 ? 1 : -1;
    const parts = [];
    const add = (geo, x, y) => parts.push(geo.translate(x * dir, y, 0));
    for (let k = 0; k <= 11; k++) add(new THREE.CylinderGeometry(0.018, 0.018, 2.85, 6), 0.06 + (k * (w - 0.1)) / 11, 1.45);
    for (const y of [0.12, 1.2, 2.82]) add(new THREE.BoxGeometry(w, 0.07, 0.035), w / 2, y);
    add(new THREE.BoxGeometry(0.06, 2.9, 0.05), 0.03, 1.45);
    add(new THREE.BoxGeometry(0.06, 2.9, 0.05), w - 0.03, 1.45);
    for (let k = 0; k <= 11; k++) add(new THREE.ConeGeometry(0.03, 0.1, 5), 0.06 + (k * (w - 0.1)) / 11, 2.92);
    const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed()), false), rust);
    mesh.castShadow = true;
    pivot.add(mesh);
    L.group.add(pivot);
    leaves.push({ pivot, side });
  }
  // The chain and lock on the north side, where the leaves meet.
  const links = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const g = new THREE.TorusGeometry(0.03, 0.008, 4, 8);
    g.rotateX(a);
    if (k % 2) g.rotateY(Math.PI / 2);
    g.translate(24 + Math.cos(a) * 0.1, 1.2 + Math.sin(a * 2) * 0.03, z - 0.06 + Math.sin(a) * 0.05);
    links.push(g.toNonIndexed());
  }
  const lockG = new THREE.BoxGeometry(0.08, 0.1, 0.04).translate(24.02, 1.06, z - 0.12).toNonIndexed();
  const chain = new THREE.Mesh(mergeGeometries([...links, lockG], false), rust);
  chain.userData.noCull = true;
  L.group.add(chain);
  const col = L.collider([22.1, 0, z - 0.07], [25.9, 2.95, z + 0.07], { walkable: false, seeThrough: true, shootable: false });
  const setOpen = (k) => {
    leaves[0].pivot.rotation.y = 1.75 * k;
    leaves[1].pivot.rotation.y = -1.75 * k;
  };
  if (open) {
    setOpen(1);
    chain.visible = false;
    col.enabled = false;
    return;
  }
  let t = -1;
  const north = (g) => g.player.position.z < z;
  L.interact({
    pos: [24, 1.2, z + 0.1],
    radius: 1.8,
    ignore: [col],
    enabled: (g) => t < 0 && !north(g),
    prompt: 'Examine the gate',
    onUse: (g) => {
      g.audio.play('chains', { pos: new THREE.Vector3(24, 1.2, z), gain: 0.5 });
      g.hud.say('Chained shut from the other side. The tunnel beyond runs north, toward the sound of still water.', 4);
    },
  });
  const it = L.interact({
    pos: [24, 1.2, z - 0.1],
    radius: 1.8,
    ignore: [col],
    enabled: (g) => t < 0 && north(g),
    prompt: 'Unchain the gate',
    onUse: (g) => {
      it.alive = false;
      t = 0;
      g.setFlag('cistern.shortcut');
      g.audio.play('chains', { pos: new THREE.Vector3(24, 1.2, z) });
      setTimeout(() => g.audio.play('creak', { pos: new THREE.Vector3(24, 1.2, z) }), 500);
      g.hud.say('The chain slithers loose. The way back to the junction is open.', 3);
    },
  });
  L.onUpdate((dt) => {
    if (t < 0 || t > 2.2) return;
    t += dt;
    if (t > 0.3) chain.visible = false;
    if (t > 0.5) {
      setOpen(ease(Math.min(1, (t - 0.5) / 1.4)));
      if (col.enabled) {
        col.enabled = false;
        L.level.markNavDirty();
      }
    }
  });
}
