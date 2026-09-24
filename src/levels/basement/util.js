import * as THREE from 'three';
import { PROP_NAMES } from '../../world/props/index.js';
import { getMaterial, solid } from '../../world/materials.js';
import { Kit, finish, addCandle } from '../../world/props/house/kit.js';

// Small helpers shared by the basement builders.

const _box = new THREE.Box3();
export const topOf = (obj) => _box.setFromObject(obj).max.y;

// Place a registered prop; quietly skip it if its module hasn't landed yet
// (so a missing prop never shows up as a magenta box).
export function put(L, name, x, z, opts = {}) {
  if (!PROP_NAMES.includes(name)) return null;
  return L.prop(name, x, z, opts);
}

// Player yaw (0 looks toward -Z) from (x, z) toward (tx, tz).
export const lookYaw = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
// Model yaw (models face +Z) from (x, z) toward (tx, tz).
export const faceYaw = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

// A readable note: an E interaction that prints lines, with a paper prop.
export function note(L, pos, lines, { prompt = 'Read the note', rotY = 0.3, prop = true } = {}) {
  const it = L.interact({
    pos,
    radius: 1.7,
    prompt,
    onUse: (g) => {
      for (const [i, l] of lines.entries()) g.hud.say(l, 4.5 + i * 0.5);
    },
  });
  if (prop && PROP_NAMES.includes('note')) L.prop('note', pos[0], pos[2], { y: pos[1] - 0.06, rotY, collider: 'none' });
  return it;
}

// Add a Kit-built group as static level geometry.
export function bake(L, kit, colliders = 'none') {
  const obj = finish(kit, 'basement');
  L.mesh(obj, { static: true, collider: colliders });
  return obj;
}

export { Kit, addCandle };

// ---------- Floating debris ----------
// Objects that ride the water surface (and rise with the flood).
export class Floaters {
  constructor(L) {
    this.items = [];
    this.water = null;
    L.onUpdate((dt, t) => this.update(t));
  }

  add(obj, { off = 0, amp = 0.012, speed = 0.9, tilt = 0.05, drift = 0 } = {}) {
    obj.userData.float = { off, amp, speed, tilt, drift, ph: Math.random() * 10, rx: obj.rotation.x, rz: obj.rotation.z, ry: obj.rotation.y };
    this.items.push(obj);
    return obj;
  }

  update(t) {
    const y = this.water ? this.water.y : 0;
    for (const o of this.items) {
      const f = o.userData.float;
      const s = t * f.speed + f.ph;
      o.position.y = y + f.off + Math.sin(s) * f.amp;
      o.rotation.x = f.rx + Math.sin(s * 0.7) * f.tilt;
      o.rotation.z = f.rz + Math.sin(s * 0.9 + 1) * f.tilt;
      if (f.drift) o.rotation.y = f.ry + Math.sin(t * 0.05 + f.ph) * f.drift;
    }
  }
}

// Static scum and weed on the water (baked; stays behind if the water rises).
export function scum(L, x, z, seed = 1, y = 0.625) {
  const k = new Kit(seed);
  const r = k.rng;
  for (let i = 0; i < 5; i++) k.stain(r() < 0.5 ? 'murky' : 'ash', r.range(0.15, 0.45), r.range(0.1, 0.3), x + r.range(-0.4, 0.4), y + i * 0.0006, z + r.range(-0.4, 0.4));
  bake(L, k);
}

// A plank, a bottle, a crate: small floating junk built from boxes.
export function junk(kind, seed = 1) {
  const k = new Kit(seed);
  const r = k.rng;
  if (kind === 'plank') k.box('woodRotten', r.range(0.9, 1.6), 0.04, r.range(0.12, 0.2), 0, 0, 0);
  else if (kind === 'planks') {
    for (let i = 0; i < 3; i++) k.box('woodRotten', r.range(0.7, 1.3), 0.035, 0.14, r.range(-0.1, 0.1), 0.01 * i, i * 0.17 - 0.17, 0, r.range(-0.3, 0.3), 0);
  } else if (kind === 'bottle') {
    k.lathe('glass', [[0, 0], [0.034, 0.002], [0.034, 0.19], [0.014, 0.25], [0.012, 0.3], [0, 0.3]], 0, 0, 0, 8, 0, 0, Math.PI / 2 - 0.12);
  } else if (kind === 'cork') {
    k.cyl('card', 0.014, 0.012, 0.04, 0, 0, 0, Math.PI / 2, 0, 0, 6);
  } else if (kind === 'box') {
    k.box('card', 0.42, 0.26, 0.34, 0, 0, 0);
    k.box('card', 0.42, 0.02, 0.2, 0, 0.14, -0.14, -0.9, 0, 0);
  } else if (kind === 'crate') {
    k.box('wood', 0.55, 0.5, 0.55, 0, 0, 0);
    for (const s of [-1, 1]) k.box('woodDark', 0.58, 0.07, 0.07, 0, s * 0.2, 0.27);
  } else if (kind === 'scum') {
    for (let i = 0; i < 5; i++) k.stain(r() < 0.5 ? 'murky' : 'ash', r.range(0.15, 0.45), r.range(0.1, 0.3), r.range(-0.4, 0.4), 0.004, r.range(-0.4, 0.4));
  } else if (kind === 'chair' && PROP_NAMES.includes('chair')) {
    return null;
  }
  const g = finish(k, `junk:${kind}`);
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = kind !== 'scum';
  });
  return g;
}

// ---------- Procedural textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let streamTex = null;
function streamTexture() {
  if (streamTex) return streamTex;
  streamTex = canvasTex(32, 128, (x, w, h) => {
    x.fillStyle = '#6a9c98';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * 0.5;
      x.fillStyle = `rgba(${220 + Math.random() * 35},255,250,${a})`;
      x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 6 + Math.random() * 30);
    }
  });
  return streamTex;
}

let sheetTex = null;
// Hanging linen: off-white, greyer and stained toward the soaked hem.
export function sheetMaterial() {
  if (!sheetTex) {
    sheetTex = canvasTex(64, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#9c968a');
      g.addColorStop(0.55, '#8a8374');
      g.addColorStop(0.72, '#6c6452');
      g.addColorStop(0.76, '#3e3a2c');
      g.addColorStop(1, '#23251f');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 600; i++) {
        x.fillStyle = `rgba(${Math.random() < 0.5 ? '40,34,24' : '160,152,136'},${Math.random() * 0.12})`;
        x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 2 + Math.random() * 18);
      }
      // Wicked-up water stains.
      for (let i = 0; i < 8; i++) {
        x.fillStyle = 'rgba(58,52,36,0.25)';
        const sx = Math.random() * w;
        x.fillRect(sx, h * (0.45 + Math.random() * 0.25), 2 + Math.random() * 6, h);
      }
    });
    sheetTex.wrapS = sheetTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return new THREE.MeshStandardMaterial({ map: sheetTex, roughness: 0.95, side: THREE.DoubleSide });
}

// ---------- Pouring water ----------
// A stream falling from (x, top, z) into the water, with a foam ring.
export function waterStream(L, { x, z, top, r = 0.05, water }) {
  const tex = streamTexture().clone();
  tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ color: 0xbfe6e0, map: tex, transparent: true, opacity: 0.42, roughness: 0.05, metalness: 0.1, emissive: 0x1e4a4f, emissiveIntensity: 0.12, depthWrite: false });
  const geo = new THREE.CylinderGeometry(r * 0.7, r * 1.1, 1, 10, 1, true);
  geo.translate(0, -0.5, 0);
  const col = new THREE.Mesh(geo, mat);
  col.position.set(x, top, z);
  col.renderOrder = 2;
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xd8efe8, transparent: true, opacity: 0.35, roughness: 0.3, depthWrite: false });
  const foam = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.42, 20, 1).rotateX(-Math.PI / 2), foamMat);
  foam.renderOrder = 2;
  L.group.add(col, foam);
  L.onUpdate((dt, t) => {
    const wy = water ? water.y : 0;
    const len = Math.max(0.05, top - wy);
    col.scale.set(1, len, 1);
    col.visible = top > wy + 0.03;
    tex.repeat.set(1, len / 0.7);
    tex.offset.y -= dt * 2.6;
    foam.visible = col.visible;
    foam.position.set(x, wy + 0.012, z);
    const s = 0.85 + 0.15 * Math.sin(t * 11) + 0.05 * Math.sin(t * 23);
    foam.scale.set(s, 1, s);
    foamMat.opacity = 0.28 + 0.1 * Math.sin(t * 7);
  });
  L.onDispose(() => {
    tex.dispose();
    mat.dispose();
    foamMat.dispose();
  });
  L.loopSound('waterFlow', [x, top - 1, z], { radius: 11, gain: 0.8 });
  return col;
}

// Ring of ritual candles on the floor around (x, z); returns flame points.
export function candleRing(L, x, y, z, { r = 1.0, n = 9, litChance = 0.6, seed = 3 } = {}) {
  const k = new Kit(seed);
  const flames = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k.rng.range(-0.15, 0.15);
    const rr = r + k.rng.range(-0.08, 0.08);
    k.push(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr);
    k.stain('waxOld', 0.06, 0.05, 0, 0.003, 0);
    const f = addCandle(k, { h: k.rng.range(0.05, 0.2), r: k.rng.range(0.02, 0.032), lit: k.rng() < litChance, wax: k.rng() < 0.3 ? 'waxBlack' : 'wax', drips: 3 });
    k.pop();
    if (f) flames.push(f);
  }
  bake(L, k);
  return flames;
}

export const mat = (name) => getMaterial(name);
export { solid };
