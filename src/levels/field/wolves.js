import * as THREE from 'three';
import { inBeam, dist2 } from '../../world/ambience/common.js';

// Wolves you never quite see: howls from the treeline that come more often
// and closer as night falls, and pairs of eyes low in the dark that go out
// the moment the flashlight finds them or you walk toward them.
// One of them isn't a wolf. After dark its eyes sit higher than the rest,
// and when your light swings near them they rise above head height, go out,
// and something walks off on two legs. A few times a night it stands at the
// edge of your beam for an instant.
// getDark() -> 0 (dusk) .. 1 (night).

const PAIRS = 4;
const TALL_AFTER = 0.7;

// The thing that stands up: a tall, thin, wet-dark figure with a long skull,
// arms down to its knees and legs that bend the wrong way. Faces +Z.
function buildStander() {
  const g = new THREE.Group();
  g.name = 'field:stander';
  // Out of the fog, so it stands as a black shape against the haze instead of melting into it.
  const mat = new THREE.MeshStandardMaterial({ name: 'field:stander', color: 0x15161a, roughness: 0.5, fog: false });
  const part = (geo, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    g.add(m);
    return m;
  };
  const limb = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 6);
  part(new THREE.CapsuleGeometry(0.15, 0.78, 4, 8), 0, 1.62, 0.04, 0.12);
  part(limb(0.06, 0.22), 0, 2.12, 0.1, 0.5);
  const head = part(new THREE.CapsuleGeometry(0.1, 0.16, 4, 8), 0, 2.3, 0.2, 1.25);
  part(new THREE.ConeGeometry(0.065, 0.32, 6), 0, 2.27, 0.42, Math.PI / 2 + 0.25);
  for (const s of [1, -1]) {
    part(new THREE.ConeGeometry(0.04, 0.16, 4), s * 0.07, 2.44, 0.12, -0.4, -s * 0.3);
    // Legs: thigh forward, shin back, a long foot.
    part(limb(0.065, 0.42), s * 0.12, 1.02, 0.12, -0.45);
    part(limb(0.045, 0.46), s * 0.12, 0.55, 0.06, 0.55);
    part(limb(0.035, 0.24), s * 0.12, 0.12, 0.12, 1.3);
    // Arms hanging to the knees, fingers longer than they should be.
    part(limb(0.045, 0.48), s * 0.22, 1.6, 0.06, 0.12, s * 0.12);
    part(limb(0.035, 0.5), s * 0.26, 1.02, 0.14, -0.15, s * 0.05);
    for (let f = 0; f < 3; f++) part(limb(0.012, 0.2), s * (0.25 + f * 0.02), 0.62, 0.2 + (f - 1) * 0.025, -0.2);
  }
  head.castShadow = false;
  g.visible = false;
  return g;
}

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
  const pairs = Array.from({ length: PAIRS }, (_, i) => ({ state: 'off', t: 4 + i * 5 + Math.random() * 6, a: 0, c: new THREE.Vector3(), side: new THREE.Vector3(), pace: 0, blink: 0, tall: i === 0, rise: -1, base: 0 }));
  const fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const away = new THREE.Vector3();

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
    // The tall one's eyes sit at a standing height once it's properly dark.
    const tall = e.tall && getDark() > TALL_AFTER;
    e.c.set(x, heightAt(x, z) + (tall ? 1.45 + Math.random() * 0.3 : 0.55 + Math.random() * 0.2), z);
    e.base = e.c.y;
    e.rise = -1;
    e.side.set(-Math.sin(a), 0, Math.cos(a));
    e.pace = tall ? 0 : (Math.random() - 0.5) * 0.8;
  };

  // It rises to above your head height, goes out, and walks off on two legs.
  const standUp = (e, g, dt) => {
    e.rise += dt;
    e.c.y = e.base + 1.0 * THREE.MathUtils.smoothstep(e.rise, 0, 0.9);
    if (e.rise < 1.15) return false;
    away.subVectors(e.c, g.player.position).setY(0).normalize();
    g.audio.play('bipedSteps', { pos: tmp.copy(e.c).addScaledVector(away, 3), gain: 7 });
    return true;
  };

  // ---------- The figure at the edge of the beam ----------
  const stander = buildStander();
  L.group.add(stander);
  let standWait = 45 + Math.random() * 30;
  let standShown = 0;
  let standT = 0;
  const standAt = (g) => {
    const p = g.player;
    if (!p.flashOn) return false;
    p.forward(fwd);
    const look = Math.atan2(fwd.x, fwd.z);
    const a = look + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.08);
    const r = 9 + Math.random() * 3.5;
    const x = THREE.MathUtils.clamp(p.position.x + Math.sin(a) * r, -86, 86);
    const z = THREE.MathUtils.clamp(p.position.z + Math.cos(a) * r, -86, 86);
    stander.position.set(x, heightAt(x, z), z);
    stander.rotation.y = Math.atan2(p.position.x - x, p.position.z - z);
    return true;
  };

  L.onUpdate((dt, t, g) => {
    const d = getDark();
    let any = false;
    // There for an instant, then gone, and you hear it.
    if (stander.visible) {
      standT -= dt;
      if (standT <= 0) {
        stander.visible = false;
        g.audio.play('wolfGrowl', { pos: stander.position, gain: 3 });
        away.subVectors(stander.position, g.player.position).setY(0).normalize();
        g.audio.play('bipedSteps', { pos: tmp.copy(stander.position).addScaledVector(away, 2.5), gain: 3.5 });
      }
    } else if (d > TALL_AFTER && standShown < 3 && g.state === 'playing') {
      standWait -= dt;
      if (standWait <= 0) {
        standWait = 80 + Math.random() * 60;
        if (standAt(g)) {
          standShown++;
          stander.visible = true;
          standT = 0.16;
          g.fx.scare(0.35);
        } else standWait = 4;
      }
    }
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
        // The tall one: your light coming near makes it stand the rest of the way up.
        if (e.tall && e.rise < 0 && e.base > heightAt(e.c.x, e.c.z) + 1 && inBeam(g, e.c, 0.955, 60)) {
          e.rise = 0;
          e.blink = 9;
          g.audio.play('wolfGrowl', { pos: e.c, gain: 6 });
        }
        if (e.rise >= 0) {
          if (standUp(e, g, dt)) {
            e.state = 'off';
            e.a = 0;
            e.t = 10 + Math.random() * 14;
          }
        }
        tmp.subVectors(g.player.position, e.c).setY(0);
        const near = dist2(g, e.c) < 18 * 18;
        const approaching = g.player.velocity && g.player.velocity.lengthSq() > 1 && tmp.normalize().dot(g.player.velocity) < -0.6 * g.player.velocity.length();
        if (e.state === 'on' && e.rise < 0 && (e.t <= 0 || d < 0.45 || near || approaching || inBeam(g, e.c, 0.985, 60))) {
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
