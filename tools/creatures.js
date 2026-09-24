import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildCreature, CREATURE_TYPES } from '../src/entities/models/index.js';

// Creature test bench: one creature per slot, flashlight on the camera,
// per-state buttons, hit sphere overlay. window.T exposes a small API for
// scripted screenshots (T.pose('hound', 'run', 0.4), T.cam(30, 10, 4)).

window.__errors = [];
addEventListener('error', (e) => window.__errors.push(String(e.message)));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030202);
scene.fog = new THREE.FogExp2(0x030202, 0.018);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 300);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0x39404f, 0x160b0b, 0.3);
const work = new THREE.DirectionalLight(0xfff4e8, 0);
work.position.set(4, 9, 7);
const workFill = new THREE.HemisphereLight(0xbfc4cc, 0x3a3030, 0);
const flashlight = new THREE.SpotLight(0xfff0dc, 16, 50, 0.42, 0.5, 2);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(2048, 2048);
flashlight.shadow.bias = -0.0004;
flashlight.shadow.normalBias = 0.02;
scene.add(hemi, work, workFill, flashlight, flashlight.target);

// Floor with a 25 cm grid to judge foot sliding.
function gridTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#17120f';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '40,30,24' : '8,6,5'},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = '#2a211b';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(300, 300);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.92 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Slot layout (x, y, z) per creature.
const SLOTS = {
  acolyte: [0, 0, 0], hound: [5, 0, 0], drowned: [10, 0, 0], lamprey: [15, 0, 0],
  skinless: [20, 0, 0], sister: [25, 0, 0], wallMaw: [30, 1.35, 0], mother: [48, 0, -4],
};
const WATER = { drowned: 0.9, lamprey: 0.5, mother: 0.02 };
const DURATION_KEY = { attack: 'attack', notice: 'notice', hurt: 'hurt', dead: 'death', scream: 'scream' };
const MOVING = new Set(['walk', 'run', 'crawl']);

// Set dressing: flesh wall for the maw, pool + sigil + anchors for the boss, chair for the drowned.
const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a0a0e, roughness: 0.5 });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), wallMat);
wall.position.set(SLOTS.wallMaw[0], 2, 0);
wall.receiveShadow = true;
scene.add(wall);
const pool = new THREE.Mesh(new THREE.CircleGeometry(6.5, 64), new THREE.MeshStandardMaterial({ color: 0x010101, roughness: 0.05, metalness: 0.2 }));
pool.rotation.x = -Math.PI / 2;
pool.position.set(SLOTS.mother[0], 0.01, SLOTS.mother[2]);
scene.add(pool);
const sigil = new THREE.Mesh(new THREE.RingGeometry(6.6, 6.9, 64), new THREE.MeshStandardMaterial({ color: 0x3a0505, emissive: 0xff1a0a, emissiveIntensity: 1.2 }));
sigil.rotation.x = -Math.PI / 2;
sigil.position.set(SLOTS.mother[0], 0.015, SLOTS.mother[2]);
scene.add(sigil);
const chair = new THREE.Group();
{
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.44), wood);
  seat.position.set(0, 0.425, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.04), wood);
  back.position.set(0, 0.72, -0.21);
  chair.add(seat, back);
  for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), wood);
    leg.position.set(x, 0.21, z);
    chair.add(leg);
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.8), wood);
  table.position.set(0, 0.74, 0.72);
  chair.add(table);
  chair.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  chair.position.set(...SLOTS.drowned);
  chair.visible = false;
  scene.add(chair);
}
const water = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ color: 0x0e2a2e, roughness: 0.1, transparent: true, opacity: 0.88 }));
water.rotation.x = -Math.PI / 2;
water.visible = false;
scene.add(water);

// Creatures.
const entries = {};
let sister = null;

function spawn(type) {
  const opts = type === 'mother' ? {} : {};
  const c = buildCreature(type, opts);
  const [x, y, z] = SLOTS[type];
  c.root.position.set(x, y, z);
  scene.add(c.root);
  const e = entries[type] = {
    type, c, state: c.states?.[0] ?? 'idle', stateTime: 0, home: new THREE.Vector3(x, y, z),
    lights: [], hitMeshes: [],
  };
  for (const l of c.lights) {
    const pl = new THREE.PointLight(l.color, l.intensity, l.distance, 2);
    scene.add(pl);
    e.lights.push({ def: l, pl, seed: Math.random() * 100 });
  }
  for (const h of c.hitSpheres) {
    const col = { head: 0xffff00, weak: 0xff00ff, body: 0x00ff66, limb: 0x33aaff }[h.part] ?? 0xffffff;
    const m = new THREE.Mesh(new THREE.SphereGeometry(h.r, 12, 8), new THREE.MeshBasicMaterial({ color: col, wireframe: true, depthTest: false, transparent: true, opacity: 0.6 }));
    m.renderOrder = 999;
    m.visible = false;
    scene.add(m);
    e.hitMeshes.push({ h, m });
  }
  if (type === 'mother') {
    for (const a of c.anchors ?? []) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 8, 16), new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.7, metalness: 0.5 }));
      ring.position.copy(a).applyMatrix4(c.root.matrixWorld.compose(c.root.position, c.root.quaternion, c.root.scale));
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), ring.material);
      post.position.copy(ring.position).add(new THREE.Vector3(0, 0, -0.4));
      scene.add(ring, post);
    }
    if (c.sisterSlot) {
      sister = buildCreature('sister');
      c.sisterSlot.add(sister.root);
    }
  }
  return e;
}

function despawn(type) {
  const e = entries[type];
  if (!e) return;
  scene.remove(e.c.root);
  for (const l of e.lights) scene.remove(l.pl);
  for (const { m } of e.hitMeshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  if (type === 'mother' && sister) { sister.dispose(); sister = null; }
  e.c.dispose();
  delete entries[type];
}

for (const type of CREATURE_TYPES) spawn(type);

// UI.
const $ = (id) => document.getElementById(id);
let focus = 'acolyte';
let t = 0;
let tscale = 1;
const opts = { speed: 1.4, hits: false, move: false, loop: true };

function setState(type, state) {
  const e = entries[type];
  e.state = state;
  e.stateTime = 0;
  if (MOVING.has(state) && !opts.move) e.c.root.position.copy(e.home);
  if (!MOVING.has(state)) e.c.root.position.copy(e.home);
  chair.visible = entries.drowned?.state === 'seated';
  buildStateButtons();
}

function durationOf(e) {
  const k = DURATION_KEY[e.state] ?? e.state;
  return e.c.timings[k]?.duration;
}

function buildCreatureButtons() {
  const box = $('creatures');
  box.innerHTML = '';
  for (const type of CREATURE_TYPES) {
    const b = document.createElement('button');
    b.textContent = type;
    b.className = type === focus ? 'on' : '';
    b.onclick = () => { focusOn(type); };
    box.appendChild(b);
  }
}

function buildStateButtons() {
  const box = $('states');
  box.innerHTML = '';
  const e = entries[focus];
  for (const st of e.c.states ?? ['idle']) {
    const b = document.createElement('button');
    b.textContent = st;
    b.className = st === e.state ? 'on' : '';
    b.onclick = () => setState(focus, st);
    box.appendChild(b);
  }
}

function focusOn(type, az = 35, el = 12, dist = null) {
  focus = type;
  const e = entries[type];
  const h = e.c.height;
  const d = dist ?? (type === 'mother' ? 17 : type === 'wallMaw' ? 3.2 : Math.max(2.6, h * 2.1));
  const ty = type === 'mother' ? 4 : type === 'wallMaw' ? e.home.y : h * 0.5;
  controls.target.set(e.home.x, ty, e.home.z);
  const a = THREE.MathUtils.degToRad(az), b = THREE.MathUtils.degToRad(el);
  camera.position.set(e.home.x + Math.sin(a) * Math.cos(b) * d, ty + Math.sin(b) * d, e.home.z + Math.cos(a) * Math.cos(b) * d);
  controls.update();
  water.position.set(e.home.x, WATER[type] ?? 0.5, e.home.z);
  water.visible = $('water').checked && WATER[type] !== undefined;
  buildCreatureButtons();
  buildStateButtons();
}

$('speed').oninput = (ev) => { opts.speed = +ev.target.value; $('speedv').textContent = opts.speed.toFixed(1); };
$('tscale').oninput = (ev) => { tscale = +ev.target.value; $('tscalev').textContent = tscale; };
$('hits').onchange = (ev) => { opts.hits = ev.target.checked; };
$('move').onchange = (ev) => { opts.move = ev.target.checked; for (const e of Object.values(entries)) e.c.root.position.copy(e.home); };
$('loop').onchange = (ev) => { opts.loop = ev.target.checked; };
$('work').onchange = (ev) => { work.intensity = ev.target.checked ? 2.2 : 0; workFill.intensity = ev.target.checked ? 0.9 : 0; };
$('water').onchange = () => focusOn(focus, ...camAngles());
$('flash').onclick = () => entries[focus].c.flash(1);
$('rebuild').onclick = () => { const st = entries[focus].state; despawn(focus); spawn(focus); setState(focus, st); };

function camAngles() {
  const v = camera.position.clone().sub(controls.target);
  const d = v.length();
  return [THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z)), THREE.MathUtils.radToDeg(Math.asin(v.y / d)), d];
}

// Simulation step for one creature.
function step(e, dt) {
  e.stateTime += dt;
  const dur = durationOf(e);
  if (dur && e.stateTime > dur + (e.state === 'dead' ? 1.5 : 0.6) && opts.loop && e.state !== 'rise' && e.state !== 'stand') e.stateTime = 0;
  const moving = MOVING.has(e.state) || (e.type === 'lamprey' && e.state === 'crawl');
  const speed = moving ? opts.speed : 0;
  if (moving && opts.move) {
    const r = e.c.root;
    r.position.z += speed * dt;
    if (r.position.z > e.home.z + 4) r.position.z = e.home.z - 4;
  }
  const s = { state: e.state, stateTime: e.stateTime, speed };
  if (e.state === 'attack') s.attackT = Math.min(1, e.stateTime / e.c.timings.attack.duration);
  e.c.animate(dt, t, s);
  if (e.type === 'mother' && sister) sister.animate(dt, t, { state: 'caged', stateTime: t, speed: 0 });
}

const _v = new THREE.Vector3();
function updateOverlays() {
  for (const e of Object.values(entries)) {
    for (const l of e.lights) {
      _v.copy(l.def.offset);
      l.def.node.localToWorld(_v);
      l.pl.position.copy(_v);
      const f = l.def.flicker ?? 0;
      const n = Math.sin(t * 23 + l.seed) * 0.5 + Math.sin(t * 37.3 + l.seed * 2) * 0.3 + Math.sin(t * 7.1) * 0.2;
      l.pl.intensity = l.def.intensity * (1 - f * 0.35 + f * 0.35 * n);
    }
    for (const { h, m } of e.hitMeshes) {
      m.visible = opts.hits;
      if (!opts.hits) continue;
      m.position.copy(h.offset);
      h.node.localToWorld(m.position);
    }
  }
}

function stats() {
  const e = entries[focus];
  let meshes = 0, tris = 0;
  e.c.root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (sister && o === sister.root) return;
    meshes++;
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += o.isInstancedMesh ? n * o.count : n;
  });
  const extra = e.type === 'mother' && e.c.lastLashSide ? `\nlastLashSide ${e.c.lastLashSide}` : '';
  $('stats').textContent = `${focus}  state ${e.state} ${e.stateTime.toFixed(2)}s\nmeshes ${meshes}  tris ${Math.round(tris)}\nframe calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}${extra}`;
}

const clock = new THREE.Clock();
let statT = 0;
function renderNow() {
  controls.update();
  flashlight.position.copy(camera.position).add(_v.set(0.25, -0.2, 0).applyQuaternion(camera.quaternion));
  flashlight.target.position.copy(controls.target);
  renderer.render(scene, camera);
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()) * tscale;
  t += dt;
  for (const e of Object.values(entries)) step(e, dt);
  updateOverlays();
  renderNow();
  statT += dt;
  if (statT > 0.25 || tscale === 0) { statT = 0; stats(); }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Scripted API for screenshots.
window.T = {
  entries, scene, camera, controls, renderer,
  focus: (type, az, el, dist) => focusOn(type, az, el, dist),
  cam: (az, el, dist, ty) => {
    const e = entries[focus];
    if (ty !== undefined) controls.target.y = ty;
    const a = THREE.MathUtils.degToRad(az), b = THREE.MathUtils.degToRad(el);
    const tg = controls.target;
    camera.position.set(tg.x + Math.sin(a) * Math.cos(b) * dist, tg.y + Math.sin(b) * dist, tg.z + Math.cos(a) * Math.cos(b) * dist);
    controls.update();
    renderNow();
    return e.type;
  },
  // Fast-forward a state to `time` seconds, then freeze (tscale 0).
  pose: (type, state, time = 0, speed) => {
    if (speed !== undefined) opts.speed = speed;
    setState(type, state);
    const e = entries[type];
    tscale = 1;
    let left = time;
    while (left > 1e-6) { const d = Math.min(1 / 60, left); t += d; step(e, d); left -= d; }
    tscale = 0;
    updateOverlays();
    stats();
    renderNow();
    return e.stateTime;
  },
  play: (s = 1) => { tscale = s; },
  state: (type, st) => setState(type, st),
  set: (k, v) => { opts[k] = v; if (k === 'hits') $('hits').checked = v; },
  work: (on) => { $('work').checked = on; $('work').onchange({ target: { checked: on } }); },
  stats: () => $('stats').textContent,
  ui: (on) => { $('ui').style.display = on ? '' : 'none'; },
};

const q = new URLSearchParams(location.search);
if (q.get('work')) window.T.work(true);
focusOn(q.get('c') ?? 'acolyte');
if (q.get('s')) setState(focus, q.get('s'));
frame();
