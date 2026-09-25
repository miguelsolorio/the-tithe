import * as THREE from 'three';
import { inBeam, dist2 } from '../../world/ambience/common.js';

// Wolves you never quite see: howls from the treeline that come more often
// and closer as night falls, and pairs of eyes low in the dark that go out
// the moment the flashlight finds them or you walk toward them.
// getDark() -> 0 (dusk) .. 1 (night).

const PAIRS = 4;

export function buildWolves(L, { heightAt, getDark }) {
  // ---------- Howls ----------
  let wait = 25;
  const at = new THREE.Vector3();
  L.onUpdate((dt, t, g) => {
    const d = getDark();
    if (d < 0.15) return;
    wait -= dt;
    if (wait > 0) return;
    wait = THREE.MathUtils.lerp(46, 18, d) * (0.7 + Math.random() * 0.6);
    // The panner can't carry 90 m, so place the voice on the same bearing a
    // few tens of metres out; closer (and louder) the darker it gets.
    const a = Math.random() * Math.PI * 2;
    const r = THREE.MathUtils.lerp(36, 22, d);
    const p = g.player.position;
    at.set(p.x + Math.cos(a) * r, p.y + 3, p.z + Math.sin(a) * r);
    g.audio.play('howl', { pos: at, gain: 5 + d * 3 });
  });

  // ---------- Eyes ----------
  const pos = new Float32Array(PAIRS * 2 * 3);
  const col = new Float32Array(PAIRS * 2 * 3);
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3);
  const aCol = new THREE.BufferAttribute(col, 3);
  aPos.setUsage(THREE.DynamicDrawUsage);
  aCol.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('color', aCol);
  const mat = new THREE.PointsMaterial({
    name: 'field:eyes',
    size: 0.2,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // Cut through the night fog: they're meant to be seen from afar.
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'field:eyes';
  pts.frustumCulled = false;
  L.group.add(pts);

  const tint = new THREE.Color(0xc8b050);
  const pairs = Array.from({ length: PAIRS }, (_, i) => ({ state: 'off', t: 4 + i * 5 + Math.random() * 6, a: 0, c: new THREE.Vector3(), side: new THREE.Vector3(), pace: 0, blink: 0 }));
  const fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const place = (e, g) => {
    // Off to one side of where the player is looking, 26-48 m away, low to the ground.
    g.player.forward(fwd);
    const look = Math.atan2(fwd.z, fwd.x);
    const off = (0.5 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1);
    const a = look + off;
    const r = 26 + Math.random() * 22;
    const p = g.player.position;
    const x = THREE.MathUtils.clamp(p.x + Math.cos(a) * r, -86, 86);
    const z = THREE.MathUtils.clamp(p.z + Math.sin(a) * r, -86, 86);
    e.c.set(x, heightAt(x, z) + 0.55 + Math.random() * 0.2, z);
    e.side.set(-Math.sin(a), 0, Math.cos(a));
    e.pace = (Math.random() - 0.5) * 0.8;
  };

  L.onUpdate((dt, t, g) => {
    const d = getDark();
    let any = false;
    pairs.forEach((e, i) => {
      e.t -= dt;
      if (e.state === 'off') {
        e.a = Math.max(0, e.a - dt * 6);
        if (e.t <= 0 && d > 0.5) {
          place(e, g);
          e.state = 'on';
          e.t = 4 + Math.random() * 8;
          e.blink = 1 + Math.random() * 2;
        }
      } else {
        e.a = Math.min(1, e.a + dt * 0.8);
        e.c.addScaledVector(e.side, e.pace * dt);
        e.blink -= dt;
        if (e.blink < -0.12) e.blink = 1.5 + Math.random() * 3;
        tmp.subVectors(g.player.position, e.c).setY(0);
        const near = dist2(g, e.c) < 18 * 18;
        const approaching = g.player.velocity && g.player.velocity.lengthSq() > 1 && tmp.normalize().dot(g.player.velocity) < -0.6 * g.player.velocity.length();
        if (e.t <= 0 || d < 0.45 || near || approaching || inBeam(g, e.c, 0.985, 60)) {
          e.state = 'off';
          e.a = 0;
          e.t = 6 + Math.random() * 12;
          if (near || approaching) g.audio.play('skitter', { pos: e.c, gain: 1.5 });
        }
      }
      const k = e.state === 'on' && e.blink > 0 ? e.a : 0;
      any = any || k > 0;
      for (let s = 0; s < 2; s++) {
        const j = (i * 2 + s) * 3;
        const w = s ? 0.11 : -0.11;
        pos[j] = e.c.x + e.side.x * w;
        pos[j + 1] = e.c.y;
        pos[j + 2] = e.c.z + e.side.z * w;
        col[j] = tint.r * k;
        col[j + 1] = tint.g * k;
        col[j + 2] = tint.b * k;
      }
    });
    pts.visible = any;
    if (any) {
      aPos.needsUpdate = true;
      aCol.needsUpdate = true;
    }
  });
}
