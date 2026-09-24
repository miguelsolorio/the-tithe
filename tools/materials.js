import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getMaterial, getDecalMaterial, MATERIAL_NAMES, DECAL_KINDS, prewarmMaterials } from '../src/world/materials.js';
import { generateSurface, generateDecal, clearTextureCaches } from '../src/world/textures.js';

// Material test bench. URL params:
//   view = grid | room | decals | flat     (default grid)
//   mat  = material name (flat view, room view with room=mat)
//   room = house | brick | stone | flesh | plain | mat
//   lights = both | flash | point            exposure = number
const params = new URLSearchParams(location.search);
const view = params.get('view') || 'grid';
const matName = params.get('mat') || 'wallpaper';
const roomKind = params.get('room') || 'house';
let lightMode = params.get('lights') || 'both';
const exposure = parseFloat(params.get('exposure') || '1');

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050404);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

// ---------- Generate everything and time it ----------
const t0 = performance.now();
const timings = prewarmMaterials(MATERIAL_NAMES, DECAL_KINDS);
const genTotal = performance.now() - t0;

// Upload every texture once so the first frames don't hitch (and time it).
const t1 = performance.now();
const seen = new Set();
const allMats = [...MATERIAL_NAMES.map(getMaterial), ...DECAL_KINDS.map(getDecalMaterial)];
for (const m of allMats) {
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
    const t = m[k];
    if (t && !seen.has(t)) {
      seen.add(t);
      renderer.initTexture(t);
    }
  }
}
const uploadTotal = performance.now() - t1;
let texBytes = 0;
for (const t of seen) texBytes += (t.image.data?.byteLength ?? 0) * 1.33;

// ?bench=N: regenerate everything N more times from cold noise caches and keep
// the fastest time per material (the first run above also pays for JIT warm-up).
const benchRuns = parseInt(params.get('bench') || '0', 10);
const best = new Map();
let benchTotal = 0;
if (benchRuns > 0) {
  const totals = [];
  for (let r = 0; r < benchRuns; r++) {
    clearTextureCaches();
    let tot = 0;
    for (const { name } of timings) {
      const tb = performance.now();
      if (name.startsWith('decal:')) generateDecal(name.slice(6));
      else generateSurface(name);
      const ms = performance.now() - tb;
      tot += ms;
      best.set(name, Math.min(best.get(name) ?? Infinity, ms));
    }
    totals.push(tot);
  }
  benchTotal = Math.min(...totals);
  for (const t of timings) t.best = best.get(t.name);
}
for (const { name, ms, best: b } of timings) console.info(`[materials] ${name.padEnd(20)} ${ms.toFixed(1).padStart(7)} ms${b !== undefined ? `  (best of ${benchRuns}: ${b.toFixed(1)} ms)` : ''}`);
if (benchRuns > 0) console.info(`[materials] bench: best full pass ${benchTotal.toFixed(0)} ms, sum of per-material bests ${[...best.values()].reduce((a, b) => a + b, 0).toFixed(0)} ms`);
console.info(`[materials] generation total ${genTotal.toFixed(0)} ms, GPU upload ${uploadTotal.toFixed(0)} ms, ${seen.size} textures, ~${(texBytes / 1048576).toFixed(0)} MB with mips`);

// ---------- Panel ----------
const panel = document.getElementById('panel');
if (params.get('panel') === '0') panel.classList.add('min');
const nav = document.getElementById('nav');
const link = (label, q) => `<a href="?${new URLSearchParams(q)}">${label}</a>`;
nav.innerHTML = [
  link('grid', { view: 'grid' }),
  link('room', { view: 'room', room: roomKind, mat: matName }),
  link('decals', { view: 'decals' }),
  link('flat', { view: 'flat', mat: matName }),
].join('') + `<br><select id="sel">${[...MATERIAL_NAMES, ...DECAL_KINDS.map((k) => 'decal:' + k)].map((n) => `<option ${n === matName ? 'selected' : ''}>${n}</option>`).join('')}</select>
  <select id="room">${['house', 'brick', 'stone', 'flesh', 'plain', 'mat'].map((n) => `<option ${n === roomKind ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
document.getElementById('sel').onchange = (e) => {
  const q = new URLSearchParams(location.search);
  q.set('mat', e.target.value);
  if (view === 'room') q.set('room', 'mat');
  location.search = q;
};
document.getElementById('room').onchange = (e) => {
  const q = new URLSearchParams(location.search);
  q.set('view', 'room');
  q.set('room', e.target.value);
  location.search = q;
};
const rows = timings.map(({ name, ms, best: b }) => `<tr class="${ms > 60 ? 'slow' : ''}"><td>${name}</td><td class="ms">${ms.toFixed(1)}</td>${b !== undefined ? `<td class="ms">${b.toFixed(1)}</td>` : ''}</tr>`).join('');
document.getElementById('times').innerHTML = `<table><tr><td>generation</td><td class="ms">${genTotal.toFixed(0)} ms</td>${benchRuns ? `<td class="ms">${benchTotal.toFixed(0)}</td>` : ''}</tr>
  <tr><td>gpu upload</td><td class="ms">${uploadTotal.toFixed(0)} ms</td></tr>
  <tr><td>textures</td><td class="ms">${seen.size} (~${(texBytes / 1048576).toFixed(0)} MB)</td></tr>${rows}</table>`;

// ---------- Lights ----------
const hemi = new THREE.HemisphereLight(0x39424f, 0x140e0a, 0.35);
scene.add(hemi);
const point = new THREE.PointLight(0xffa860, 18, 0, 2);
point.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc080 })));
scene.add(point);
const flash = new THREE.SpotLight(0xfff0dc, 60, 30, 0.42, 0.5, 2);
scene.add(flash, flash.target);
function applyLights() {
  point.visible = lightMode !== 'flash';
  flash.visible = lightMode !== 'point';
}
applyLights();

// ---------- Helpers ----------
const labels = [];
function label(text, pos) {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.textContent = text;
  document.getElementById('labels').appendChild(el);
  labels.push({ el, pos: pos.clone() });
}

// Same projection as the level batcher: u/v = world coord / tile.
function projectUVs(geo, tile, yOff = 0) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const x = p.getX(i);
    const y = p.getY(i) + yOff;
    const z = p.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile);
    else if (ax >= az) uv.setXY(i, (z / tile) * Math.sign(n.getX(i) || 1), y / tile);
    else uv.setXY(i, (-x / tile) * Math.sign(n.getZ(i) || 1), y / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

function worldBox(min, max, mat, yOff = 0) {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  projectUVs(g, mat.userData.tile || 1, yOff);
  const m = new THREE.Mesh(g, mat);
  scene.add(m);
  return m;
}

// ---------- Views ----------
let animateLight = (t) => point.position.set(Math.cos(t * 0.4) * 6, 2.2, Math.sin(t * 0.4) * 3 + 1);

if (view === 'grid') {
  const cols = 8;
  const gap = 2.8;
  MATERIAL_NAMES.forEach((name, i) => {
    const mat = getMaterial(name);
    const tile = mat.userData.tile || 1;
    const cx = (i % cols) * gap - ((cols - 1) * gap) / 2;
    const cz = Math.floor(i / cols) * gap - 4;
    // Cube with world-scale UVs (wallpaper sampled mid-wall)
    const yOff = name.startsWith('wallpaper') ? 1.2 : 0;
    const cube = new THREE.BoxGeometry(1, 1, 1);
    projectUVs(cube, tile, yOff + 0.5);
    const m1 = new THREE.Mesh(cube, mat);
    m1.position.set(cx - 0.62, 0.5, cz);
    m1.rotation.y = 0.5;
    scene.add(m1);
    // Sphere with UVs scaled to real size (integer repeats around)
    const sph = new THREE.SphereGeometry(0.5, 64, 32);
    const uv = sph.attributes.uv;
    const ku = Math.max(1, Math.round((Math.PI * 1.0) / tile));
    const kv = (Math.PI * 0.5) / tile;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * ku, uv.getY(k) * kv + yOff / tile);
    const m2 = new THREE.Mesh(sph, mat);
    m2.position.set(cx + 0.62, 0.5, cz);
    scene.add(m2);
    label(name, new THREE.Vector3(cx, -0.05, cz + 0.75));
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.001;
  scene.add(floor);
  camera.position.set(0, 7.5, 13);
  controls.target.set(0, 0, 2);
  animateLight = (t) => point.position.set(Math.cos(t * 0.35) * 10, 2.4, Math.sin(t * 0.35) * 6 + 2);
} else if (view === 'room') {
  const presets = {
    house: { floor: 'floorboards', wall: 'wallpaper', ceil: 'plaster', wainscot: true },
    brick: { floor: 'concrete', wall: 'brick', ceil: 'brick' },
    stone: { floor: 'stoneWet', wall: 'stoneWet', ceil: 'stone' },
    flesh: { floor: 'fleshDark', wall: 'flesh', ceil: 'flesh' },
    plain: { floor: 'concrete', wall: 'concrete', ceil: 'concrete' },
    mat: { floor: matName, wall: matName, ceil: matName },
  };
  const p = presets[roomKind] || presets.mat;
  const W = 8;
  const H = 3.1;
  const D = 8;
  const t = 0.2;
  const M = (n) => getMaterial(n);
  worldBox([-W / 2, -t, -D / 2], [W / 2, 0, D / 2], M(p.floor));
  worldBox([-W / 2, H, -D / 2], [W / 2, H + t, D / 2], M(p.ceil));
  const walls = [
    [[-W / 2, 0, -D / 2 - t], [W / 2, H, -D / 2]],
    [[-W / 2, 0, D / 2], [W / 2, H, D / 2 + t]],
    [[-W / 2 - t, 0, -D / 2], [-W / 2, H, D / 2]],
    [[W / 2, 0, -D / 2], [W / 2 + t, H, D / 2]],
  ];
  for (const [a, b] of walls) worldBox(a, b, M(p.wall));
  if (p.wainscot) {
    // Baseboard + wainscot band + rail on the north and west walls, like plan.js
    worldBox([-W / 2, 0, -D / 2], [W / 2, 0.14, -D / 2 + 0.025], M('woodDark'));
    worldBox([-W / 2, 0.14, -D / 2], [W / 2, 1.0, -D / 2 + 0.015], M('wainscot'));
    worldBox([-W / 2, 0.98, -D / 2], [W / 2, 1.04, -D / 2 + 0.03], M('woodDark'));
    worldBox([-W / 2, 0, -D / 2], [-W / 2 + 0.025, 0.14, D / 2], M('woodDark'));
    // Torn wallpaper patch on the east wall to compare
    worldBox([W / 2 - 0.01, 0, -D / 2], [W / 2, H, 0], M('wallpaperTorn'));
  }
  camera.position.set(1.2, 1.6, 3.2);
  controls.target.set(-0.8, 1.3, -1.5);
  animateLight = (tt) => point.position.set(Math.cos(tt * 0.5) * 2.5, 2.2, Math.sin(tt * 0.5) * 2.5);
  point.intensity = 6;
  hemi.intensity = 0.12;
} else if (view === 'decals') {
  const wallMat = getMaterial(params.get('wall') || 'plaster');
  worldBox([-6, 0, -0.2], [6, 3.2, 0], wallMat);
  worldBox([-6, -0.2, 0], [6, 0, 5], getMaterial(params.get('floor') || 'floorboards'));
  const onWall = ['bloodSplat', 'bloodSmear', 'bloodDrip', 'sigil', 'sigilGlow', 'grime', 'handprint', 'claws'];
  onWall.forEach((kind, i) => {
    const m = getDecalMaterial(kind);
    const x = -5.2 + i * 1.48;
    const size = kind === 'sigil' || kind === 'sigilGlow' ? 1.3 : 1.1;
    const g = new THREE.PlaneGeometry(size * m.userData.aspect, size);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, 1.75, 0.012);
    scene.add(mesh);
    label(kind, new THREE.Vector3(x, 1.0, 0.1));
  });
  const onFloor = ['footprints', 'bloodPool', 'bloodSplat', 'sigilGlow', 'grime'];
  onFloor.forEach((kind, i) => {
    const m = getDecalMaterial(kind);
    const x = -4 + i * 2;
    const size = kind === 'footprints' ? 2.2 : 1.6;
    const g = new THREE.PlaneGeometry(size * m.userData.aspect, size);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, 0.012, 2.4);
    scene.add(mesh);
    label(kind, new THREE.Vector3(x, 0, 3.6));
  });
  camera.position.set(0, 2.4, 6.5);
  controls.target.set(0, 1.2, 0.5);
  animateLight = (tt) => point.position.set(Math.cos(tt * 0.5) * 5, 2.0, 1.2 + Math.sin(tt * 0.5) * 1);
  point.intensity = 10;
} else if (view === 'flat') {
  // 2D pixel view of one map tiled 2x2 (seam check). map = map | normalMap |
  // roughnessMap | metalnessMap | emissiveMap; scale, x, y pan/zoom.
  const isDecal = matName.startsWith('decal:');
  const mat = isDecal ? getDecalMaterial(matName.slice(6)) : getMaterial(matName);
  const key = params.get('map') || 'map';
  const tex = mat[key] || mat.map;
  const { data, width: w, height: h } = tex.image;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d');
  const img = sctx.createImageData(w, h);
  const ch = data.length / (w * h);
  const chan = key === 'roughnessMap' ? 1 : key === 'metalnessMap' ? 2 : -1;
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    if (chan >= 0) {
      const v = data[i * ch + chan];
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    } else {
      img.data[k] = data[i * ch];
      img.data[k + 1] = data[i * ch + 1];
      img.data[k + 2] = data[i * ch + 2];
      img.data[k + 3] = ch === 4 ? data[i * ch + 3] : 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  canvas.style.display = 'none';
  const view2d = document.createElement('canvas');
  view2d.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  document.body.insertBefore(view2d, canvas);
  const tiles = isDecal ? 1 : 2;
  const draw = () => {
    view2d.width = innerWidth * devicePixelRatio;
    view2d.height = innerHeight * devicePixelRatio;
    const c = view2d.getContext('2d');
    c.fillStyle = isDecal ? '#777' : '#000';
    c.fillRect(0, 0, view2d.width, view2d.height);
    const fit = Math.min(view2d.width / (w * tiles), view2d.height / (h * tiles));
    const sc = parseFloat(params.get('scale') || fit);
    const ox = parseFloat(params.get('x') || 0);
    const oy = parseFloat(params.get('y') || 0);
    c.imageSmoothingQuality = 'high';
    for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) c.drawImage(src, (tx * w - ox) * sc, (ty * h - oy) * sc, w * sc, h * sc);
  };
  draw();
  addEventListener('resize', draw);
  document.getElementById('hint').textContent = `${matName} ${key} ${w}x${h} (2x2)  params: map, scale, x, y`;
}

// ---------- Loop ----------
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

addEventListener('keydown', (e) => {
  if (e.key === 'l' || e.key === 'L') {
    lightMode = lightMode === 'both' ? 'flash' : lightMode === 'flash' ? 'point' : 'both';
    applyLights();
  }
  if (e.key === 'h' || e.key === 'H') panel.classList.toggle('min');
});

const timer = new THREE.Timer();
const fwd = new THREE.Vector3();
const off = new THREE.Vector3();
const tmp = new THREE.Vector3();
function frame() {
  timer.update();
  const t = params.has('t') ? parseFloat(params.get('t')) : timer.getElapsed();
  controls.update();
  animateLight(t);
  // Hand-held flashlight: slightly right/below the eye, aimed forward.
  camera.getWorldDirection(fwd);
  off.set(0.25, -0.2, 0).applyQuaternion(camera.quaternion);
  flash.position.copy(camera.position).add(off);
  flash.target.position.copy(camera.position).addScaledVector(fwd, 5);
  renderer.render(scene, camera);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  for (const l of labels) {
    tmp.copy(l.pos).project(camera);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    l.el.style.display = vis ? '' : 'none';
    if (vis) l.el.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`;
    if (vis) l.el.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
  }
  requestAnimationFrame(frame);
}
frame();
