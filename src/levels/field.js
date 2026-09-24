import * as THREE from 'three';
import { fbm2, makeRng } from '../core/rng.js';
import { clamp, smoothstep } from '../core/utils.js';
import { getMaterial, solid } from '../world/materials.js';
import { buildCabinExterior } from './field/cabin.js';
import { buildNature } from './field/nature.js';

// Level 1: the field at dusk (tutorial). The sky darkens in real time and as
// you approach the small cabin. Her phone rings in the grass; taking it opens
// the cabin door. After the flood escape the same field is rebuilt at dawn.

const CABIN = { x: 0, z: 0, w: 6, d: 5, h: 2.6 };
const DOOR_Z = CABIN.z + CABIN.d / 2;
const PHONE = [-7.5, 11];
const START = [16, 78];

function heightAt(x, z) {
  let h = (fbm2(x * 0.018, z * 0.018, 4, 3) - 0.5) * 7 + (fbm2(x * 0.06, z * 0.06, 2, 9) - 0.5) * 0.8;
  // Flatten around the cabin and along the track.
  const dc = Math.hypot(x - CABIN.x, z - CABIN.z);
  const flat = smoothstep(9, 22, dc);
  const track = trackDist(x, z);
  const tf = smoothstep(1.5, 6, track);
  return h * flat * (0.35 + 0.65 * tf);
}

// Distance to the dirt track (a gentle curve from the road to the porch).
function trackX(z) {
  return 16 * smoothstep(4, 80, z) + Math.sin(z * 0.06) * 2.5 * smoothstep(8, 40, z);
}
function trackDist(x, z) {
  if (z < 4) return Math.hypot(x - trackX(4), z - 4) + 99 * (z < 2 ? 1 : 0);
  return Math.abs(x - trackX(z));
}

export default {
  id: 'field',
  name: 'The field',
  subtitle: 'Dusk',
  zone: 'field',
  variant: (game) => (game.flags.has('escape') ? 'dawn' : 'dusk'),
  build(L, game) {
    const dawn = game.flags.has('escape');
    const rng = makeRng(7);

    L.env({
      fog: { color: dawn ? 0xb89a88 : 0x7a4a30, density: 0.012 },
      ambient: dawn ? { sky: 0xd8c0b0, ground: 0x3a3028, intensity: 1.2 } : { sky: 0xc08050, ground: 0x2a1a10, intensity: 1.0 },
      sun: dawn ? { color: 0xffd0a0, intensity: 1.0, dir: [-60, 12, -30] } : { color: 0xff9a50, intensity: 1.6, dir: [60, 10, -40] },
      grade: { color: dawn ? 0xffe0c0 : 0xffb070, amount: 0.25 },
      exposure: 1.0,
      music: dawn ? 'dawn' : 'field',
    });

    // ---------- Terrain ----------
    const size = 260;
    const seg = 170;
    const tg = new THREE.PlaneGeometry(size, size, seg, seg);
    tg.rotateX(-Math.PI / 2);
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setY(i, heightAt(tp.getX(i), tp.getZ(i)));
    tg.computeVertexNormals();
    L.batcher.add(tg, getMaterial('grass'));
    L.physics.add({ type: 'height', min: { x: -size / 2, z: -size / 2 }, max: { x: size / 2, z: size / 2 }, fn: heightAt, surface: 'grass' });

    // Dirt track: a ribbon laid on the terrain.
    const pts = [];
    for (let z = 4; z <= 110; z += 1.5) pts.push([trackX(z), z]);
    const rib = new THREE.BufferGeometry();
    const pos = [];
    const idx = [];
    pts.forEach(([x, z], i) => {
      const w = 1.3 + Math.sin(i * 0.7) * 0.15;
      pos.push(x - w, heightAt(x - w, z) + 0.04, z, x + w, heightAt(x + w, z) + 0.04, z);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    rib.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rib.setIndex(idx);
    rib.computeVertexNormals();
    L.batcher.add(rib, getMaterial('dirt'), { cast: false });

    // Invisible boundary.
    const B = 88;
    for (const [a, b] of [
      [[-B, -5, -B - 1], [B, 20, -B]],
      [[-B, -5, B], [B, 20, B + 1]],
      [[-B - 1, -5, -B], [-B, 20, B]],
      [[B, -5, -B], [B + 1, 20, B]],
    ])
      L.collider(a, b, { walkable: false });
    L.trigger({
      min: [-B, -10, -B],
      max: [B, 30, B],
      onExit: () => {},
      onStay: (g, dt, tr) => {
        const p = g.player.position;
        if (Math.max(Math.abs(p.x), Math.abs(p.z)) > B - 6) {
          tr._t = (tr._t ?? 0) - dt;
          if (tr._t <= 0) {
            tr._t = 6;
            g.hud.say(dawn ? 'Away from the house. Keep going.' : 'Her phone pinged near the cabin.', 2.5);
          }
        }
      },
    });

    // ---------- Sky ----------
    const sky = makeSky(dawn);
    L.group.add(sky.mesh);

    // ---------- Grass ----------
    const grass = makeGrass(rng, heightAt);
    L.group.add(grass.mesh);

    // ---------- Tree line and dead trees ----------
    L.group.add(makeTreeLine(rng, heightAt));

    // ---------- Cabin (small on the outside) and the woods around it ----------
    buildCabinExterior(L, { ...CABIN, base: 0.42, dawn, heightAt });
    buildNature(L, { heightAt, cabin: CABIN, trackDist, dawn });

    if (!dawn) {
      // Your car at the end of the track.
      car(L, START[0] + 3.2, START[1] + 3, heightAt);
      L.spawn('start', [START[0], heightAt(START[0], START[1]), START[1]], Math.atan2(START[0] - CABIN.x, START[1] - CABIN.z) - 0.1);
      buildDusk(L, game, sky, grass);
    } else {
      L.spawn('fromHouse', [CABIN.x + 0.3, 0.3, DOOR_Z + 2.4], 0);
      L.spawn('start', [CABIN.x + 0.3, 0.3, DOOR_Z + 2.4], 0);
      buildDawn(L, game, sky, grass);
    }
  },
  prepare() {},
};

// ---------- Dusk: tutorial, darkening, phone, door ----------
function buildDusk(L, game, sky, grass) {
  let elapsed = 0;
  let dark = 0;
  let hinted = { move: false, sprint: false, light: false };
  const sun = game.sun;
  const cabinPos = new THREE.Vector3(CABIN.x, 1.2, CABIN.z);

  L.onEnter((g) => {
    g.hud.say('Her phone pinged from this field. A year to the day since she disappeared.', 5);
    setTimeout(() => g.state === 'playing' && g.levels.current?.id === 'field' && g.hud.say('WASD to walk, mouse to look. Follow the ringing.', 5), 5500);
  });

  // Phone in the grass: rings until taken.
  const phonePos = new THREE.Vector3(PHONE[0], heightAt(PHONE[0], PHONE[1]) + 0.02, PHONE[1]);
  let ring = null;
  if (!game.inventory.has('phone')) {
    ring = L.loopSound('phoneRing', phonePos, { radius: 60, gain: 1.4 });
    L.pickup({
      id: 'phone',
      kind: 'item',
      item: 'phone',
      pos: phonePos,
      rotY: 0.6,
      prompt: 'Pick up her phone',
      onTake: (g) => {
        ring.radius = -1;
        ring.handle?.stop(0.2);
        ring.handle = null;
        g.hud.say('Her phone. Forty-one missed calls, all of them yours.', 4.5);
        g.hud.say('The last photo is of this cabin’s front door. Taken from the inside.', 5);
        g.setFlag('field.phone');
        setTimeout(() => {
          g.audio.play('creak', { pos: new THREE.Vector3(CABIN.x, 1.2, DOOR_Z) });
          g.hud.say('Behind you, the cabin door creaks open.', 4);
        }, 4200);
      },
    });
  }

  L.onUpdate((dt, t, g) => {
    elapsed += dt;
    const p = g.player.position;
    const dist = Math.hypot(p.x - CABIN.x, p.z - CABIN.z);
    // Darkness from time and from getting close to the cabin.
    const target = clamp(Math.max(elapsed / 170, 1 - (dist - 10) / 62), 0, 1);
    dark += (Math.max(target, dark) - dark) * Math.min(1, dt * 0.5);
    sky.setDark(dark, t);
    grass.material.userData.shader && (grass.material.userData.shader.uniforms.uTime.value = t);
    // Light and air follow the sky.
    const d = dark;
    sun.intensity = 2.6 * (1 - d) * (1 - d);
    sun.color.setRGB(1, 0.55 - d * 0.2, 0.3 - d * 0.2);
    g.hemi.intensity = 1.7 * (1 - d) + 0.22;
    g.hemi.color.setRGB(0.75 - d * 0.55, 0.5 - d * 0.36, 0.33 - d * 0.18);
    g.scene.fog.color.setRGB(0.48 * (1 - d) + 0.03, 0.29 * (1 - d) + 0.03, 0.19 * (1 - d) + 0.05);
    g.scene.background.copy(g.scene.fog.color);
    g.scene.fog.density = 0.012 + d * 0.03;
    g.renderer.toneMappingExposure = 1.0 - d * 0.15;
    g.fx.setGrade(d < 0.5 ? 0xffb070 : 0x8aa0c0, 0.25);

    if (!hinted.sprint && elapsed > 14) {
      hinted.sprint = true;
      g.hud.say('Hold Shift to run.', 3);
    }
    if (!hinted.light && d > 0.55 && !g.player.flashOn) {
      hinted.light = true;
      g.hud.say('It’s getting dark. Press F for your flashlight.', 4);
    }
  });

  // The door: shut until you have the phone, then it opens by itself.
  const door = L.door({ x: CABIN.x, z: DOOR_Z, y: 0.42, axis: 'x', width: 1.0, height: 2.05, material: 'woodRotten', hinge: 1, id: 'cabinFront',
    locked: (g) => (g.inventory.has('phone') ? false : 'It won’t budge. Somewhere nearby, a phone is ringing.'),
    prompt: 'Open' });
  let opened = false;
  L.onUpdate((dt, t, g) => {
    if (!opened && g.flags.has('field.phone') && g.levels.current?.id === 'field') {
      opened = true;
      setTimeout(() => {
        if (!door.open) {
          door.open = true;
          door.collider.enabled = false;
          door.target = -1.7;
        }
      }, 4200);
    }
  });
  // Step through the doorway: the house is much bigger inside.
  L.exit({ min: [CABIN.x - 0.5, -1, DOOR_Z - 1.2], max: [CABIN.x + 0.5, 4, DOOR_Z - 0.3], to: 'ground', spawn: 'fromField', requires: (g) => g.inventory.has('phone') && door.open });
  // Candlelight in the window.
  L.light({ pos: [CABIN.x + 1.6, 1.6, CABIN.z + 1.4], color: 0xe08a2c, intensity: 0.8, distance: 5, flicker: 0.5 });
}

// ---------- Dawn: the ending walk ----------
function buildDawn(L, game, sky, grass) {
  sky.setDawn();
  L.onEnter((g) => {
    g.hud.say('Outside. The sky is turning grey and gold.', 4);
    g.audio.play('bell', { gain: 0.3 });
    g.sister?.placeBehindPlayer?.();
  });
  L.onUpdate((dt, t, g) => {
    grass.material.userData.shader && (grass.material.userData.shader.uniforms.uTime.value = t);
    sky.update?.(t);
  });
  // The door is gone; the cabin is just a cabin.
  L.box([CABIN.x - 0.5, 0.42, DOOR_Z - 0.06], [CABIN.x + 0.5, 2.5, DOOR_Z + 0.04], 'woodDark');
  L.trigger({
    pos: [CABIN.x + 4, 0, DOOR_Z + 20],
    radius: 9,
    once: true,
    onEnter: (g) => {
      g.hud.say('You don’t look back.', 3);
      g.finish();
    },
  });
  L.trigger({
    min: [-80, -10, DOOR_Z + 26],
    max: [80, 30, 90],
    once: true,
    onEnter: (g) => g.finish(),
  });
}

// ---------- Pieces ----------
function makeSky(dawn) {
  const uniforms = {
    uDark: { value: 0 },
    uDawn: { value: dawn ? 1 : 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uDark, uDawn, uTime;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        float h = vDir.y;
        // Dusk palette -> night palette.
        vec3 horizonDusk = vec3(0.78, 0.46, 0.16);
        vec3 zenithDusk = vec3(0.16, 0.12, 0.22);
        vec3 horizonNight = vec3(0.05, 0.04, 0.07);
        vec3 zenithNight = vec3(0.01, 0.012, 0.03);
        vec3 horizonDawn = vec3(0.92, 0.66, 0.48);
        vec3 zenithDawn = vec3(0.36, 0.46, 0.62);
        vec3 hz = mix(mix(horizonDusk, horizonNight, uDark), horizonDawn, uDawn);
        vec3 zn = mix(mix(zenithDusk, zenithNight, uDark), zenithDawn, uDawn);
        float t = smoothstep(-0.05, 0.55, h);
        vec3 col = mix(hz, zn, t);
        // Sun low in the west (dusk) or east (dawn).
        vec3 sunDir = normalize(mix(vec3(0.82, 0.12 - uDark * 0.25, -0.55), vec3(-0.85, 0.08, -0.45), uDawn));
        float s = max(dot(vDir, sunDir), 0.0);
        vec3 sunCol = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.78, 0.5), uDawn);
        col += sunCol * pow(s, 8.0) * 0.55 * (1.0 - uDark * 0.9);
        col += sunCol * smoothstep(0.9975, 0.999, s) * 2.0 * (1.0 - uDark);
        // Stars fade in with the dark.
        vec3 sp = floor(vDir * 380.0);
        float star = step(0.9985, hash(sp)) * smoothstep(0.05, 0.4, h);
        col += vec3(star) * uDark * (0.6 + 0.4 * sin(uTime * 3.0 + hash(sp) * 40.0)) * (1.0 - uDawn);
        // Ground haze below the horizon.
        col = mix(col, hz * 0.6, smoothstep(0.0, -0.2, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.onBeforeRender = (r, s, cam) => mesh.position.copy(cam.position);
  return {
    mesh,
    setDark(d, t) {
      uniforms.uDark.value = d;
      uniforms.uTime.value = t;
    },
    setDawn() {
      uniforms.uDawn.value = 1;
      uniforms.uDark.value = 0;
    },
    update(t) {
      uniforms.uTime.value = t;
    },
  };
}

function makeGrass(rng, heightAt) {
  // One clump = 6 tapered blades.
  const blades = 6;
  const pos = [];
  const col = [];
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rng() * 0.8;
    const r = 0.06 + rng() * 0.1;
    const h = 0.3 + rng() * 0.4;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const lean = 0.1 + rng() * 0.15;
    const w = 0.014;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    pos.push(x - px, 0, z - pz, x + px, 0, z + pz, x + Math.cos(a) * lean, h, z + Math.sin(a) * lean);
    col.push(0.11, 0.1, 0.05, 0.11, 0.1, 0.05, 0.55, 0.45, 0.24);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    mat.userData.shader = shader;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 wp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sway = sin(uTime * 1.6 + wp0.x * 0.31 + wp0.z * 0.23) * 0.6 + sin(uTime * 3.7 + wp0.x * 1.3) * 0.25;
      transformed.x += sway * position.y * 0.22;
      transformed.z += sway * position.y * 0.1;`,
    );
    // Normals up so the whole clump lights like the ground.
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
  };
  const count = 16000;
  const mesh = new THREE.InstancedMesh(g, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < count * 3 && n < count; i++) {
    const x = (rng() - 0.5) * 150;
    const z = (rng() - 0.5) * 150 + 20;
    if (Math.abs(x - CABIN.x) < 5.5 && z > CABIN.z - 4 && z < DOOR_Z + 3) continue;
    if (trackDist(x, z) < 1.4 && z > 3) continue;
    // Patchy: thicker in noise hollows.
    if (fbm2(x * 0.05, z * 0.05, 3, 21) < 0.38) continue;
    p.set(x, heightAt(x, z), z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    const sc = 0.7 + rng() * 0.6;
    s.set(sc, sc * (0.7 + rng() * 0.7), sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return { mesh, material: mat };
}

function makeTreeLine(rng, heightAt) {
  const group = new THREE.Group();
  const cone = new THREE.ConeGeometry(2.6, 11, 7).translate(0, 7.5, 0);
  const trunk = new THREE.CylinderGeometry(0.3, 0.45, 3, 6).translate(0, 1.5, 0);
  const count = 260;
  const cm = new THREE.InstancedMesh(cone, solid(0x0c100c, { roughness: 1 }), count);
  const tm = new THREE.InstancedMesh(trunk, solid(0x1a120c, { roughness: 1 }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = 96 + rng() * 26;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    p.set(x, heightAt(Math.max(-129, Math.min(129, x)), Math.max(-129, Math.min(129, z))) - 0.5, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6);
    const sc = 0.8 + rng() * 0.9;
    s.set(sc, sc * (0.8 + rng() * 0.5), sc);
    m.compose(p, q, s);
    cm.setMatrixAt(i, m);
    tm.setMatrixAt(i, m);
  }
  group.add(cm, tm);
  return group;
}

function car(L, x, z, heightAt) {
  const y = heightAt(x, z);
  const paint = solid(0x3a1416, { roughness: 0.45, metalness: 0.5 });
  const dark = solid(0x0a0a0c, { roughness: 0.3, metalness: 0.3 });
  const rot = 0.25;
  const g = new THREE.Group();
  const add = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(1.8, 0.62, 4.4), paint).position.set(0, 0.62, 0);
  add(new THREE.BoxGeometry(1.6, 0.55, 2.1), dark).position.set(0, 1.2, -0.2);
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = add(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14).rotateZ(Math.PI / 2), dark);
    w.position.set(wx, 0.34, wz);
  }
  const door = add(new THREE.BoxGeometry(0.06, 0.9, 1.1), paint);
  door.position.set(-1.2, 0.9, -0.1);
  door.rotation.y = -0.9;
  for (const s of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.3, 0.12, 0.05), solid(0xfff0c0, { emissive: 0xffe0a0, emissiveIntensity: 0.4 })).position.set(s, 0.72, -2.21);
  g.position.set(x, y, z);
  g.rotation.y = rot;
  L.mesh(g, { static: true, collider: [{ min: [-0.95, 0, -2.25], max: [0.95, 1.5, 2.25] }] });
}

