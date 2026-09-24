import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DEPTHS_PROPS } from '../src/world/props/depths.js';
import { ITEMS } from '../src/world/props/items.js';

// Test bench for the depths props + items: labelled grid, collider boxes,
// light offsets, dynamic-part sliders and a first-person viewmodel mode.

const CEIL = 3.2;
const params = new URLSearchParams(location.hash.slice(1));

// ---------- renderer / scene ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none' });
document.body.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040405);
scene.fog = new THREE.FogExp2(0x040405, 0.02);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.02, 200);
camera.position.set(-6, 5, 12);
scene.add(camera);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(4, 0.8, 0);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0x8aa0b0, 0x2a2018, 0.5);
scene.add(hemi);
const flash = new THREE.SpotLight(0xfff0dc, 40, 40, 0.5, 0.5, 1.6);
flash.position.set(0.12, -0.08, 0);
flash.target.position.set(0, 0, -1);
flash.castShadow = true;
flash.shadow.mapSize.set(1024, 1024);
flash.shadow.bias = -0.0005;
flash.shadow.camera.near = 0.05;
camera.add(flash);
camera.add(flash.target);

const floorMat = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.95 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const backdropMat = new THREE.MeshStandardMaterial({ color: 0x242220, roughness: 0.95, side: THREE.DoubleSide });

// ---------- helpers ----------

const lineMat = new THREE.LineBasicMaterial({ color: 0x33ff77 });
const aabbMat = new THREE.LineBasicMaterial({ color: 0xffcc33 });
function boxLines(min, max, m) {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size.map((s) => Math.max(s, 0.002)))), m);
  l.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return l;
}

function tris(obj) {
  let t = 0;
  obj.traverse((o) => {
    if (o.isMesh && o.geometry) t += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
  });
  return Math.round(t);
}

function meshes(obj) {
  let n = 0;
  obj.traverse((o) => o.isMesh && n++);
  return n;
}

// ---------- display config ----------

const DISPLAY = {
  pipe: { y: 0.6 },
  pipeElbow: { y: 0.3 },
  valveSocket: { y: 1.2, wall: true },
  chainAnchor: { y: 1.7, wall: true },
  skullWall: { wall: true },
  ladder: { wall: true },
  hangingLantern: { ceiling: true },
  chainHanging: { ceiling: true },
  meatHook: { ceiling: true, opts: { meat: true } },
  hangingCage: { ceiling: true, opts: { drop: 0.5 } },
  tendril: { ceiling: true },
  cocoon: { ceiling: true, opts: { drop: 0.3 } },
  boiler: { opts: { ceiling: CEIL } },
  pumpMachine: { opts: { ceiling: CEIL } },
  vein: { opts: { from: [-1.1, 1.9, 0], to: [1.1, 1.6, 0], sag: 0.5 } },
  grate: { opts: { pit: 0.6 } },
};

const ITEM_DISPLAY = {
  knife: { y: 0.12 },
  revolver: { y: 0.12 },
  shotgun: { y: 0.18 },
};

const entries = [];
const dynamic = [];

function addEntry(name, obj, x, z, cfg, section) {
  obj.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj);
  const holder = new THREE.Group();
  holder.position.set(x, cfg.ceiling ? CEIL : cfg.y ?? 0, z);
  holder.add(obj);
  // collider display (local to the prop)
  const col = obj.userData.collider;
  const colGroup = new THREE.Group();
  if (Array.isArray(col)) col.forEach((b) => colGroup.add(boxLines(b.min, b.max, lineMat)));
  else if (col !== 'none') colGroup.add(boxLines(bb.min.toArray(), bb.max.toArray(), aabbMat));
  obj.add(colGroup);
  // light offsets
  const lightGroup = new THREE.Group();
  const real = [];
  for (const L of obj.userData.lights ?? []) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: L.color, wireframe: true }));
    m.position.fromArray(L.offset);
    lightGroup.add(m);
    const pl = new THREE.PointLight(L.color, L.intensity * 3, L.distance, 1.5);
    pl.position.fromArray(L.offset);
    pl.userData.base = L.intensity * 3;
    pl.userData.flicker = L.flicker;
    real.push(pl);
    obj.add(pl);
  }
  obj.add(lightGroup);
  // backdrops
  if (cfg.wall) {
    const w = Math.max(1.2, bb.max.x - bb.min.x + 0.8);
    const h = Math.max(1.6, bb.max.y - bb.min.y + 0.8);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backdropMat);
    wall.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2 + (cfg.y ? 0 : 0.4 - 0.4), -0.003);
    wall.receiveShadow = true;
    holder.add(wall);
  }
  if (cfg.ceiling) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), backdropMat);
    c.rotation.x = Math.PI / 2;
    c.position.y = 0.002;
    holder.add(c);
  }
  obj.traverse((o) => {
    if (o.isMesh && !o.material.transparent) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const t = tris(obj);
  const div = document.createElement('div');
  div.className = 'lbl';
  div.innerHTML = `${name} <small>${t} tris · ${meshes(obj)} mesh</small>`;
  const label = new CSS2DObject(div);
  const top = cfg.ceiling ? 0.25 : Math.max(bb.max.y, 0.1) + 0.25;
  label.position.set((bb.min.x + bb.max.x) / 2, top, (bb.min.z + bb.max.z) / 2);
  holder.add(label);
  scene.add(holder);
  const e = { name, obj, holder, bb, colGroup, lightGroup, real, label, tris: t, section };
  entries.push(e);
  if (obj.userData.dynamic || obj.userData.pulse) dynamic.push(e);
  return e;
}

// ---------- build the grid ----------

function layout(names, build, cfgs, startZ, rowWidth, gap, section) {
  let x = 0;
  let z = startZ;
  let rowDepth = 0;
  for (const name of names) {
    const cfg = cfgs[name] ?? {};
    let obj;
    try {
      obj = build(name, cfg.opts ?? {});
    } catch (err) {
      console.error(`[props-depths] ${name} failed`, err);
      continue;
    }
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj);
    const w = Math.max(bb.max.x - bb.min.x, 0.1);
    const d = Math.max(bb.max.z - bb.min.z, 0.1);
    if (x + w > rowWidth && x > 0) {
      x = 0;
      z += rowDepth + gap;
      rowDepth = 0;
    }
    addEntry(name, obj, x - bb.min.x, z - bb.min.z, cfg, section);
    x += w + gap;
    rowDepth = Math.max(rowDepth, d);
  }
  return z + rowDepth;
}

const depthNames = Object.keys(DEPTHS_PROPS);
const endZ = layout(depthNames, (n, o) => DEPTHS_PROPS[n](o), DISPLAY, 0, 22, 1.2, 'depths');

const itemNames = Object.keys(ITEMS).filter((n) => n !== 'fpArm');
const itemsZ = endZ + 2;
let armEnd = itemsZ;
if (itemNames.length) {
  armEnd = layout(itemNames, (n, o) => ITEMS[n](o), ITEM_DISPLAY, itemsZ, 4, 0.3, 'items');
}
if (ITEMS.fpArm) {
  const variants = [
    ['fpArm right grip', { side: 'right', pose: 'grip' }],
    ['fpArm right pistol', { side: 'right', pose: 'grip', hold: 'pistol' }],
    ['fpArm right rifle', { side: 'right', pose: 'grip', hold: 'rifle' }],
    ['fpArm right open', { side: 'right', pose: 'open' }],
    ['fpArm left grip', { side: 'left', pose: 'grip' }],
    ['fpArm left open', { side: 'left', pose: 'open' }],
  ];
  let x = 0;
  for (const [label, o] of variants) {
    const obj = ITEMS.fpArm(o);
    addEntry(label, obj, x, armEnd + 1.2, { y: 0.45 }, 'items');
    x += 0.7;
  }
  // weapon + arms composed in the weapon frame (as the viewmodel uses them)
  for (const w of ['knife', 'revolver', 'shotgun']) {
    if (!ITEMS[w]) continue;
    const g = new THREE.Group();
    const weapon = ITEMS[w]();
    g.add(weapon, ITEMS.fpArm({ side: 'right', pose: 'grip', hold: weapon.userData.hold }));
    if (weapon.userData.support) weapon.userData.support.add(ITEMS.fpArm({ side: 'left', pose: 'open', hold: 'support' }));
    addEntry(`vm ${w}`, g, x, armEnd + 1.2, { y: 0.7 }, 'items');
    x += 1.4;
  }
}

// ---------- UI ----------

const ui = document.getElementById('ui');
ui.innerHTML = `
  <b>The Tithe · depths props + items</b>
  <h3>View</h3>
  <label>focus <select id="focus"><option value="">(overview)</option></select></label>
  <label><input type="checkbox" id="cols" checked> colliders</label>
  <label><input type="checkbox" id="lmarks" checked> light offsets</label>
  <label><input type="checkbox" id="lreal" checked> preview lights</label>
  <label><input type="checkbox" id="labels" checked> labels</label>
  <label>ambient <input type="range" id="amb" min="0" max="2" step="0.01" value="0.5"></label>
  <label>flashlight <input type="range" id="flash" min="0" max="150" step="1" value="40"></label>
  <h3>Dynamic parts</h3>
  <label>open t <input type="range" id="dyn" min="0" max="1" step="0.01" value="0"></label>
  <label><input type="checkbox" id="auto"> animate</label>
  <h3>Viewmodel</h3>
  <label><input type="checkbox" id="vm"> first-person viewmodel</label>
  <label>weapon <select id="weapon"><option>knife</option><option>revolver</option><option>shotgun</option></select></label>
  <label>anim <input type="range" id="vmt" min="0" max="1" step="0.01" value="0"></label>
  <div id="stats"></div>`;

const $ = (id) => document.getElementById(id);
for (const e of entries) {
  const o = document.createElement('option');
  o.value = e.name;
  o.textContent = e.name;
  $('focus').appendChild(o);
}
$('stats').textContent = `${entries.length} props · ${entries.reduce((s, e) => s + e.tris, 0)} tris`;

function focus(name, yaw = 0.5, pitch = 0.3, distMul = 1) {
  const e = entries.find((x) => x.name === name);
  if (!e) {
    controls.target.set(9, 0.8, endZ / 2);
    camera.position.set(-4, 9, endZ + 10);
    return;
  }
  const box = new THREE.Box3();
  e.obj.traverse((o) => {
    if (o.isMesh && o.parent !== e.lightGroup) box.expandByObject(o);
  });
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  const d = Math.max(r * 2.1, 0.25) * distMul;
  controls.target.copy(c);
  camera.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
  camera.near = Math.max(0.005, d / 200);
  camera.updateProjectionMatrix();
}

$('focus').onchange = (ev) => focus(ev.target.value);
$('cols').onchange = (ev) => entries.forEach((e) => (e.colGroup.visible = ev.target.checked));
$('lmarks').onchange = (ev) => entries.forEach((e) => (e.lightGroup.visible = ev.target.checked));
$('lreal').onchange = (ev) => entries.forEach((e) => e.real.forEach((l) => (l.visible = ev.target.checked)));
$('labels').onchange = (ev) => entries.forEach((e) => (e.label.visible = ev.target.checked));
$('amb').oninput = (ev) => (hemi.intensity = +ev.target.value);
$('flash').oninput = (ev) => (flash.intensity = +ev.target.value);
addEventListener('keydown', (ev) => {
  if (ev.key === 'f' || ev.key === 'F') flash.visible = !flash.visible;
});

function setDynamic(t) {
  for (const e of dynamic) {
    const u = e.obj.userData;
    if (u.bars) u.bars.rotation.x = -t * 1.8;
    if (u.gate) u.gate.position.y = t * (u.travel ?? 2.6);
    if (u.setOpen) u.setOpen(t);
    if (u.slot) u.slot.rotation.z = t * Math.PI * 2;
    if (u.crane) u.crane.rotation.z = t * 1.25;
    if (u.cylinder) u.cylinder.rotation.z = t * Math.PI * 2;
    if (u.hammer) u.hammer.rotation.x = t * 0.6;
    if (u.barrels) u.barrels.rotation.x = -t * 0.55;
  }
}
$('dyn').oninput = (ev) => setDynamic(+ev.target.value);

// ---------- viewmodel ----------

const vmRoot = new THREE.Group();
vmRoot.position.set(0.35, -0.3, -0.5);
// viewmodel fill light (games usually light the viewmodel separately)
const vmLight = new THREE.PointLight(0xfff0e0, 0.35, 2, 1.5);
vmLight.position.set(-0.1, 0.25, 0.2);
vmRoot.add(vmLight);
let vmWeapon = null;
function buildViewmodel(kind) {
  vmRoot.clear();
  vmRoot.add(vmLight);
  vmWeapon = null;
  if (!ITEMS[kind] || !ITEMS.fpArm) return;
  const w = ITEMS[kind]();
  const hold = w.userData.hold ?? 'knife';
  const right = ITEMS.fpArm({ side: 'right', pose: 'grip', hold });
  vmRoot.add(w, right);
  if (w.userData.support) {
    w.userData.support.add(ITEMS.fpArm({ side: 'left', pose: 'open', hold: 'support' }));
  }
  vmRoot.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  vmWeapon = w;
}

const fp = { yaw: 0, pitch: 0, pos: new THREE.Vector3() };
let vmOn = false;
function setViewmodel(on) {
  vmOn = on;
  controls.enabled = !on;
  if (on) {
    buildViewmodel($('weapon').value);
    camera.add(vmRoot);
    camera.near = 0.02;
    camera.fov = 70;
    camera.updateProjectionMatrix();
    const e = entries.find((x) => x.name === 'sluiceGate') ?? entries[0];
    fp.pos.set(e.holder.position.x + 0.2, 1.6, e.holder.position.z + 4.5);
    fp.yaw = 0;
    fp.pitch = -0.05;
  } else {
    camera.remove(vmRoot);
    camera.fov = 60;
    camera.updateProjectionMatrix();
    focus($('focus').value);
  }
}
$('vm').onchange = (ev) => setViewmodel(ev.target.checked);
$('weapon').onchange = () => vmOn && buildViewmodel($('weapon').value);
$('vmt').oninput = (ev) => {
  if (!vmWeapon) return;
  const t = +ev.target.value;
  const u = vmWeapon.userData;
  if (u.crane) u.crane.rotation.z = t * 1.25;
  if (u.hammer) u.hammer.rotation.x = t * 0.6;
  if (u.barrels) u.barrels.rotation.x = -t * 0.55;
};
let drag = null;
renderer.domElement.addEventListener('pointerdown', (ev) => (drag = [ev.clientX, ev.clientY]));
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (ev) => {
  if (!vmOn || !drag) return;
  fp.yaw -= (ev.clientX - drag[0]) * 0.004;
  fp.pitch = Math.max(-1.4, Math.min(1.4, fp.pitch - (ev.clientY - drag[1]) * 0.004));
  drag = [ev.clientX, ev.clientY];
});

// ---------- loop ----------

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime();
  if ($('auto').checked) {
    const v = 0.5 - 0.5 * Math.cos(t * 0.8);
    $('dyn').value = v;
    setDynamic(v);
  }
  for (const e of dynamic) if (e.obj.userData.pulse) e.obj.userData.pulse.scale.setScalar(1 + 0.03 * Math.sin(t * 2.2));
  for (const e of entries) {
    for (const l of e.real) l.intensity = l.userData.base * (1 - l.userData.flicker * (0.5 + 0.5 * Math.sin(t * (l.userData.flicker > 0.15 ? 1.8 : 13) + e.tris)));
  }
  if (vmOn) {
    camera.position.copy(fp.pos);
    camera.rotation.set(fp.pitch, fp.yaw, 0, 'YXZ');
    vmRoot.position.y = -0.3 + Math.sin(t * 1.6) * 0.004;
  } else controls.update();
  if (sheet) renderSheet();
  else {
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// ---------- start ----------

if (params.get('vm')) {
  $('vm').checked = true;
  if (params.get('weapon')) $('weapon').value = params.get('weapon');
  setViewmodel(true);
  if (params.get('t')) $('vmt').value = params.get('t');
  $('vmt').oninput({ target: $('vmt') });
} else {
  focus(params.get('focus') ?? '', +(params.get('yaw') ?? 0.5), +(params.get('pitch') ?? 0.3), +(params.get('dist') ?? 1));
  if (params.get('focus')) $('focus').value = params.get('focus');
}
if (params.get('dyn')) {
  $('dyn').value = params.get('dyn');
  setDynamic(+params.get('dyn'));
}
if (params.get('nolabels')) {
  $('labels').checked = false;
  entries.forEach((e) => (e.label.visible = false));
}
if (params.get('nocols')) {
  $('cols').checked = false;
  entries.forEach((e) => (e.colGroup.visible = false));
}
if (params.get('ui') === '0') ui.style.display = 'none';
if (params.get('amb')) {
  hemi.intensity = +params.get('amb');
  $('amb').value = params.get('amb');
}
if (params.get('flash')) {
  flash.intensity = +params.get('flash');
  $('flash').value = params.get('flash');
}
if (params.get('nolights')) {
  $('lreal').checked = false;
  entries.forEach((e) => e.real.forEach((l) => (l.visible = false)));
}

// Review helpers: solo one prop under a key light.
const key = new THREE.DirectionalLight(0xfff4e8, 0);
key.position.set(3, 5, 4);
scene.add(key);
scene.add(key.target);
function solo(name, yaw = 0.6, pitch = 0.3, dist = 1, keyI = 2.5) {
  entries.forEach((e) => {
    e.holder.visible = !name || e.name === name;
    e.label.visible = false;
  });
  const e = entries.find((x) => x.name === name);
  if (e) {
    key.target.position.copy(e.holder.position);
    key.position.copy(e.holder.position).add(new THREE.Vector3(Math.sin(yaw + 0.8) * 4, 5, Math.cos(yaw + 0.8) * 4));
  }
  key.intensity = keyI;
  focus(name, yaw, pitch, dist);
}
// Contact sheet: render several props solo, one per viewport cell.
const sheetCam = new THREE.PerspectiveCamera(40, 1, 0.005, 100);
let sheet = null;
function setSheet(list, cols = 3, yaw = 0.6, pitch = 0.25, dist = 1) {
  sheet = list ? { list: list.map((x) => (typeof x === 'string' ? { name: x } : x)), cols, yaw, pitch, dist } : null;
  labelRenderer.domElement.style.display = sheet ? 'none' : '';
  ui.style.display = sheet ? 'none' : '';
}
function renderSheet() {
  const W = innerWidth;
  const H = innerHeight;
  const { list, cols } = sheet;
  const rows = Math.ceil(list.length / cols);
  const cw = W / cols;
  const ch = H / rows;
  renderer.setScissorTest(true);
  renderer.setClearColor(0x0a0a0b);
  list.forEach((it, i) => {
    const e = entries.find((x) => x.name === it.name);
    const cx = (i % cols) * cw;
    const cy = H - (Math.floor(i / cols) + 1) * ch;
    renderer.setViewport(cx + 1, cy + 1, cw - 2, ch - 2);
    renderer.setScissor(cx + 1, cy + 1, cw - 2, ch - 2);
    if (!e) {
      renderer.clear();
      return;
    }
    entries.forEach((x) => (x.holder.visible = x === e));
    const box = new THREE.Box3();
    e.obj.traverse((o) => {
      if (o.isMesh && o.parent !== e.lightGroup) box.expandByObject(o);
    });
    const c = box.getCenter(new THREE.Vector3());
    if (it.target) c.add(new THREE.Vector3(...it.target));
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const yaw = it.yaw ?? sheet.yaw;
    const pitch = it.pitch ?? sheet.pitch;
    const d = (r / Math.sin((sheetCam.fov * Math.PI) / 360)) * 0.95 * (it.dist ?? sheet.dist);
    sheetCam.aspect = cw / ch;
    sheetCam.near = Math.max(0.002, d / 300);
    sheetCam.fov = it.fov ?? 40;
    if (it.eye) {
      // explicit camera relative to the prop origin (e.g. the first-person eye)
      const o = e.holder.position;
      sheetCam.position.set(o.x + it.eye[0], o.y + it.eye[1], o.z + it.eye[2]);
      c.set(o.x + it.look[0], o.y + it.look[1], o.z + it.look[2]);
      sheetCam.near = 0.01;
    } else sheetCam.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
    sheetCam.lookAt(c);
    sheetCam.updateProjectionMatrix();
    key.target.position.copy(c);
    key.position.copy(c).add(new THREE.Vector3(Math.sin(yaw + 0.9) * 5, 6, Math.cos(yaw + 0.9) * 5));
    renderer.render(scene, sheetCam);
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
}
function renderNow() {
  if (sheet) renderSheet();
  else {
    if (vmOn) {
      camera.position.copy(fp.pos);
      camera.rotation.set(fp.pitch, fp.yaw, 0, 'YXZ');
    } else controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
}
// Review sheet from code or the URL hash (#sheet=name:yaw:pitch:dist,...&cols=3&hemi=1.6&key=5).
function review(list, cols = 3, hemiI = 1.6, keyI = 5, dyn) {
  entries.forEach((e) => {
    e.colGroup.visible = false;
    e.lightGroup.visible = false;
  });
  hemi.intensity = hemiI;
  key.intensity = keyI;
  flash.visible = false;
  if (dyn !== undefined) setDynamic(dyn);
  setSheet(list, cols);
  renderNow();
  return 'ok';
}
function reviewHash(hash) {
  const p = new URLSearchParams(hash);
  const list = p.get('sheet').split(',').map((it) => {
    const [name, yaw, pitch, dist] = it.split(':');
    return { name, yaw: yaw ? +yaw : undefined, pitch: pitch ? +pitch : undefined, dist: dist ? +dist : undefined };
  });
  return review(list, +(p.get('cols') ?? 3), +(p.get('hemi') ?? 1.6), +(p.get('key') ?? 5), p.get('dyn') ? +p.get('dyn') : undefined);
}
addEventListener('hashchange', () => {
  if (location.hash.includes('sheet=')) reviewHash(location.hash.slice(1));
});
if (params.get('sheet')) setTimeout(() => reviewHash(location.hash.slice(1)), 0);
window.__t = { THREE, scene, camera, controls, entries, focus, solo, key, setDynamic, fp, vmRoot, setViewmodel, renderer, hemi, flash, setSheet, renderNow, review, reviewHash, labelsOff: () => entries.forEach((e) => (e.label.visible = false)) };
frame();
