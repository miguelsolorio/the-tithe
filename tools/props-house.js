import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { HOUSE_PROPS } from '../src/world/props/house.js';
import { getMaterial } from '../src/world/materials.js';

// Test page for the house props: every prop (plus key variants) on a dark
// floor, a flashlight on the camera, a small pool of point lights fed by the
// props' light entries, collider boxes and light offsets drawn as helpers.
// URL: ?focus=<name or index>&tip=1&helpers=0&labels=0

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const css = new CSS2DRenderer();
css.setSize(innerWidth, innerHeight);
Object.assign(css.domElement.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none' });
document.body.appendChild(css.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050404);
scene.fog = new THREE.FogExp2(0x050404, 0.04);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 200);
scene.add(camera);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Dim warm ambient and a flashlight that follows the camera.
const hemi = new THREE.HemisphereLight(0x6a5038, 0x120a06, 0.35);
scene.add(hemi);
const torch = new THREE.SpotLight(0xfff0dc, 40, 24, 0.48, 0.6, 1.6);
torch.castShadow = true;
torch.shadow.mapSize.set(1024, 1024);
torch.shadow.bias = -0.0004;
torch.position.set(0.15, -0.12, 0);
torch.target.position.set(0, 0, -1);
camera.add(torch, torch.target);

// Floor with world-scaled UVs, like the level builder.
const floorMat = getMaterial('floorboards');
const floorGeo = new THREE.PlaneGeometry(120, 120);
floorGeo.rotateX(-Math.PI / 2);
{
  const uv = floorGeo.attributes.uv;
  const p = floorGeo.attributes.position;
  const t = floorMat.userData.tile || 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / t, p.getZ(i) / t);
}
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.receiveShadow = true;
scene.add(floor);
const wallMat = getMaterial('wallpaper');
const ceilMat = getMaterial('plaster');

// Props and variants.
const VARIANTS = {
  diningTable: [{ rotten: true }],
  bookshelf: [{ tilted: true }, { empty: true }],
  bed: [{ bloody: true }],
  mirror: [{ wall: true }],
  fireplace: [{ lit: true }],
  floorLamp: [{ on: true }],
  candelabra: [{ tall: true }],
  bulb: [{ on: false }],
  bathtub: [{ filled: 'water' }, { filled: 'blood' }],
  boardedWindow: [{ glow: true }],
  wardrobe: [{ ajar: true }],
  sheetCovered: [{ shape: 'tall' }, { shape: 'sofa' }, { shape: 'chair' }],
  altar: [{ candles: true }],
};
const WALL = new Set(['sconce', 'antlerSkull', 'painting', 'fuseBox']);
const CEIL = new Set(['bulb', 'chandelier', 'hangingCage', 'noose']);
const OPENING = new Set(['window', 'boardedWindow', 'ropeBarricade']);
const entries = [];
for (const name of Object.keys(HOUSE_PROPS)) {
  entries.push({ name, opts: {} });
  for (const v of VARIANTS[name] ?? []) entries.push({ name, opts: v });
}
const kindOf = (e) => (WALL.has(e.name) || (e.name === 'mirror' && e.opts.wall) ? 'wall' : CEIL.has(e.name) ? 'ceil' : OPENING.has(e.name) ? 'opening' : 'floor');

const COLS = 9;
const CELL = 4.2;
const tipMode = params.get('tip') === '1';
const helperGroup = new THREE.Group();
scene.add(helperGroup);
const sources = [];
const tmpBox = new THREE.Box3();
const tmpV = new THREE.Vector3();

// Same tipping as knockOver() in src/world/props/index.js.
function tip(obj) {
  const wrap = new THREE.Group();
  wrap.add(obj);
  obj.rotation.z = -Math.PI / 2;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box.min.y;
  obj.position.x -= (box.min.x + box.max.x) / 2;
  obj.position.z -= (box.min.z + box.max.z) / 2;
  wrap.userData = { ...obj.userData, collider: 'box', lights: [] };
  return wrap;
}

function countTris(obj) {
  let t = 0;
  let m = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    m++;
    t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return [t, m];
}

entries.forEach((e, i) => {
  const kind = kindOf(e);
  const holder = new THREE.Group();
  holder.position.set(((i % COLS) - (COLS - 1) / 2) * CELL, 0, Math.floor(i / COLS) * CELL);
  scene.add(holder);
  let obj = HOUSE_PROPS[e.name]({ seed: 1, ...e.opts });
  const [tris, meshes] = countTris(obj);
  if (kind === 'wall') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.1), wallMat);
    wall.position.set(0, 1.5, -1.25);
    holder.add(wall);
    obj.position.set(0, e.name === 'fuseBox' ? 1.3 : 1.6, -1.2);
  } else if (kind === 'ceil') {
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 2.4), ceilMat);
    ceil.position.y = 3.05;
    holder.add(ceil);
    obj.position.y = 3.0;
  } else if (kind === 'opening') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3, 0.1), wallMat);
    wall.position.set(0, 1.5, -1.05);
    if (e.name === 'ropeBarricade') wall.visible = false;
    holder.add(wall);
    obj.position.z = -1.0;
  } else if (tipMode) {
    obj = tip(obj);
  }
  holder.add(obj);
  e.obj = obj;
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !o.material.transparent;
      o.receiveShadow = true;
    }
  });
  holder.updateMatrixWorld(true);

  // Collider boxes (green) and light offsets (spheres in the light colour).
  const col = obj.userData.collider;
  if (Array.isArray(col)) {
    for (const c of col) {
      const b = new THREE.Box3(new THREE.Vector3(...c.min), new THREE.Vector3(...c.max)).applyMatrix4(obj.matrixWorld);
      helperGroup.add(new THREE.Box3Helper(b, 0x40ff70));
    }
  } else if (col !== 'none') {
    helperGroup.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(obj), 0x40ff70));
  }
  for (const l of obj.userData.lights ?? []) {
    const p = obj.localToWorld(new THREE.Vector3(...l.offset));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: l.color }));
    dot.position.copy(p);
    helperGroup.add(dot);
    sources.push({ ...l, pos: p, seed: Math.random() * 100 });
  }

  // Label.
  tmpBox.setFromObject(obj);
  const div = document.createElement('div');
  div.className = 'lbl';
  const o = Object.keys(e.opts).length ? ' ' + JSON.stringify(e.opts).replace(/"/g, '') : '';
  const extra = [col === 'none' ? 'walk-through' : Array.isArray(col) ? `${col.length} box` : '', obj.userData.dynamic ? 'dynamic' : ''].filter(Boolean).join(' ');
  div.innerHTML = `${i} ${e.name}<b>${o}</b> · ${Math.round(tris)}▲ ${meshes}m${(obj.userData.lights ?? []).length ? ' · ' + obj.userData.lights.length + 'L' : ''}${extra ? ' · ' + extra : ''}`;
  const lab = new CSS2DObject(div);
  lab.position.set(holder.position.x, Math.max(tmpBox.max.y, 0.5) + 0.25, holder.position.z + 1.2);
  scene.add(lab);
  e.label = lab;
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = `${i} ${e.name}${o}`;
  $('focus').appendChild(opt);
});

// Light pool: like the engine, a few point lights go to the nearest sources.
const POOL = 8;
const pool = [];
for (let i = 0; i < POOL; i++) {
  const l = new THREE.PointLight(0xffffff, 0, 5, 1.6);
  scene.add(l);
  pool.push(l);
}

function focus(i) {
  const e = entries[i];
  if (!e) {
    controls.target.set(0, 0.8, CELL * 2.5);
    camera.position.set(0, 9, CELL * 2.5 + 16);
    return;
  }
  tmpBox.setFromObject(e.obj);
  const c = tmpBox.getCenter(new THREE.Vector3());
  const s = tmpBox.getSize(tmpV);
  const r = (Math.max(s.x, s.y, s.z) * 0.9 + 0.8) * (+params.get('zoom') || 1);
  controls.target.copy(c);
  camera.position.set(c.x + r * 0.35, c.y + r * 0.35, c.z + r * 1.15);
}

const f = params.get('focus');
const fi = f === null ? -1 : Number.isFinite(+f) ? +f : entries.findIndex((e) => e.name === f);
$('focus').value = fi >= 0 ? String(fi) : '';
focus(fi);
$('focus').onchange = (ev) => focus(ev.target.value === '' ? -1 : +ev.target.value);
const syncUI = () => {
  helperGroup.visible = $('helpers').checked;
  css.domElement.style.display = $('labels').checked ? '' : 'none';
  torch.visible = $('torch').checked;
};
if (params.get('helpers') === '0') $('helpers').checked = false;
if (params.get('labels') === '0') $('labels').checked = false;
if (params.get('torch') === '0') $('torch').checked = false;
if (params.get('amb')) $('amb').value = params.get('amb');
if (params.get('lmul')) $('lmul').value = params.get('lmul');
$('tip').checked = tipMode;
$('tip').onchange = () => {
  params.set('tip', $('tip').checked ? '1' : '0');
  location.search = params.toString();
};
for (const id of ['helpers', 'labels', 'torch']) $(id).onchange = syncUI;
syncUI();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  css.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  controls.update();
  hemi.intensity = 0.35 * +$('amb').value;
  const lm = +$('lmul').value;
  const ranked = sources.map((s) => [s, s.pos.distanceToSquared(controls.target)]).sort((a, b) => a[1] - b[1]);
  pool.forEach((l, i) => {
    const r = ranked[i];
    if (!r) {
      l.intensity = 0;
      return;
    }
    const s = r[0];
    const fl = 1 - s.flicker * (0.3 + 0.25 * Math.sin(t * 13.1 + s.seed) * Math.sin(t * 7.3 + s.seed * 2) + 0.15 * Math.sin(t * 29.7 + s.seed * 3));
    l.position.copy(s.pos);
    l.color.set(s.color);
    l.distance = s.distance;
    l.intensity = s.intensity * fl * lm;
  });
  renderer.render(scene, camera);
  css.render(scene, camera);
  const info = renderer.info.render;
  $('stats').textContent = `${entries.length} props · ${sources.length} light entries · ${info.calls} calls · ${Math.round(info.triangles / 1000)}k tris`;
});
window.__props = { entries, focus };
