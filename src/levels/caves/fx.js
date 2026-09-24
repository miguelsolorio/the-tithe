import * as THREE from 'three';
import { getMaterial } from '../../world/materials.js';

// The walls breathe: level-owned copies of the flesh materials whose
// vertices swell with the shared heartbeat and whose tissue glows faintly on
// each beat. Swapped onto the built meshes the first time the level is
// entered (the shared palette materials are never mutated).

function breathing(base, amp, glow) {
  const m = base.clone();
  const u = { uPulse: { value: 0 }, uTime: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPulse = u.uPulse;
    sh.uniforms.uTime = u.uTime;
    sh.vertexShader = 'uniform float uPulse;\nuniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float cvBr = sin(position.x * 1.7 + position.z * 1.3 + position.y * 0.9 + uTime * 0.9) * 0.5 + 0.5;
      transformed += objectNormal * (uPulse * 0.03 + cvBr * 0.018) * ${amp.toFixed(3)};`,
    );
    sh.fragmentShader = 'uniform float uPulse;\n' + sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.16, 0.12) * (${glow.toFixed(3)} * (0.25 + uPulse));`,
    );
  };
  m.customProgramCacheKey = () => `caves-breath-${amp}-${glow}`;
  return { m, u };
}

export function installBreathing(L) {
  const swaps = new Map();
  const mats = [];
  for (const [name, amp, glow] of [['flesh', 1, 0.09], ['fleshDark', 0.6, 0.06], ['membrane', 1, 0.08]]) {
    const b = breathing(getMaterial(name), amp, glow);
    swaps.set(getMaterial(name), b.m);
    mats.push(b);
  }
  let done = false;
  L.onEnter(() => {
    if (done) return;
    done = true;
    L.level.group.traverse((o) => {
      if (o.isMesh && swaps.has(o.material)) o.material = swaps.get(o.material);
    });
  });
  L.onUpdate((dt, t, g) => {
    const p = g.lights.pulse || 0;
    for (const b of mats) {
      b.u.uPulse.value = p;
      b.u.uTime.value = t;
    }
  });
  L.onDispose(() => mats.forEach((b) => b.m.dispose()));
}

// Pods swell on each heartbeat.
export function pulsePods(L, pods) {
  L.onUpdate((dt, t, g) => {
    const p = g.lights.pulse || 0;
    for (const o of pods) {
      const body = o.userData.pulse;
      if (!body || !body.visible) continue;
      const w = 1 + 0.045 * p + 0.012 * Math.sin(t * 0.9 + o.position.x);
      body.scale.set(w, 1 + 0.03 * p, w);
    }
  });
}

// Flood: the heart is dying, the tissue light stutters and drops out.
export function stutterLights(L) {
  const srcs = L.level.lightSources.filter((s) => s.kind === 'flesh');
  for (const s of srcs) s._base = s.intensity;
  let tick = 0;
  L.onUpdate((dt, t) => {
    tick -= dt;
    if (tick > 0) return;
    tick = 0.06 + Math.random() * 0.08;
    for (const s of srcs) {
      const drop = Math.random() < 0.12;
      const beat = Math.max(0, Math.sin(t * 7.3 + s.pos.x * 0.7)) ** 3;
      s.intensity = drop ? s._base * 0.05 : s._base * (0.35 + 0.9 * beat + Math.random() * 0.25);
    }
  });
}

// Everything past ~34 m is lost in the fog; stop drawing it (the level is a
// closed cave, so this removes most draw calls that frustum culling keeps).
export function fogCull(L, reach = 34) {
  let items = null;
  let tick = 0;
  const cam = new THREE.Vector3();
  L.onUpdate((dt, t, g) => {
    tick -= dt;
    if (tick > 0) return;
    tick = 0.15;
    if (!items) {
      items = [];
      const box = new THREE.Box3();
      const sph = new THREE.Sphere();
      for (const o of L.level.group.children) {
        if (o.userData.noCull || L.level.waters.some((w) => w.mesh === o)) continue;
        if (L.level.enemies.some((e) => e.root === o)) continue;
        box.setFromObject(o);
        if (box.isEmpty()) continue;
        box.getBoundingSphere(sph);
        items.push({ o, c: sph.center.clone(), r: sph.radius });
      }
    }
    cam.copy(g.camera.position);
    for (const it of items) it.o.visible = it.c.distanceTo(cam) - it.r < reach;
  });
}
