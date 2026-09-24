import * as THREE from 'three';
import { silhouetteTexture } from './fixtures.js';

// The mirror scare. The glass gets an overlay that ray-traces a flat horned
// silhouette standing behind the player, as the mirror would reflect it
// (correct parallax, clipped to the glass). It shows for ~0.6 s the first time
// the player looks into the mirror from close range; the room behind them is
// empty when they turn round.

const VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec3 uEye, uFig, uFigN, uFigR, uN;
  uniform vec2 uSize;
  uniform float uAlpha;
  varying vec3 vW;
  void main() {
    vec3 d = normalize(vW - uEye);
    vec3 r = reflect(d, uN);
    float den = dot(r, uFigN);
    vec4 s = vec4(0.0);
    if (abs(den) > 1e-4) {
      float t = dot(uFig - vW, uFigN) / den;
      vec3 h = vW + r * t - uFig;
      vec2 uv = vec2(dot(h, uFigR) / uSize.x + 0.5, h.y / uSize.y);
      if (t > 0.0 && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) s = texture2D(uTex, uv);
    }
    // For that moment the glass shows the lamplit room behind you, and the
    // thing standing in it: a black shape with a faint red rim and eyes.
    float up = clamp(0.5 + r.y, 0.0, 1.0);
    vec3 room = vec3(0.24, 0.13, 0.07) * (0.45 + 0.9 * up);
    float rim = smoothstep(0.04, 0.45, s.a) * (1.0 - smoothstep(0.55, 0.95, s.a));
    float eyes = max(0.0, s.r - s.g * 0.6) * 9.0;
    vec3 col = mix(room, vec3(0.008, 0.004, 0.004), s.a) + vec3(0.4, 0.05, 0.02) * rim + s.rgb * eyes;
    gl_FragColor = vec4(col, uAlpha * mix(0.6, 1.0, s.a));
  }`;

export function mirrorScare(U, mirror, { lamps = [] } = {}) {
  const { L, game } = U;
  const glass = mirror?.userData?.glass;
  if (!glass) return;
  // Old silvering: dark, glossy, catches the flashlight like a reflection.
  glass.material = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.12, metalness: 0.88 });
  const uni = {
    uTex: { value: silhouetteTexture() },
    uEye: { value: new THREE.Vector3() },
    uFig: { value: new THREE.Vector3() },
    uFigN: { value: new THREE.Vector3(0, 0, 1) },
    uFigR: { value: new THREE.Vector3(1, 0, 0) },
    uN: { value: new THREE.Vector3(0, 0, 1) },
    uSize: { value: new THREE.Vector2(1.3, 2.6) },
    uAlpha: { value: 0 },
  };
  const overlay = new THREE.Mesh(glass.geometry, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }));
  overlay.position.z = 0.002;
  overlay.renderOrder = 6;
  overlay.visible = false;
  overlay.frustumCulled = false;
  glass.add(overlay);

  const center = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const to = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let phase = U.has('u.mirror') ? 3 : 0;
  let look = 0;
  let t = 0;
  let after = 0;
  const saved = [];

  const start = (g) => {
    phase = 1;
    t = 0;
    g.setFlag('u.mirror');
    const eye = g.camera.position;
    // Stand it a step behind the player (as seen from the glass), a little
    // off one shoulder, facing the mirror.
    const away = tmp.set(eye.x - center.x, 0, eye.z - center.z).normalize();
    const right = new THREE.Vector3(-away.z, 0, away.x);
    const p = g.player.position;
    uni.uFig.value.set(p.x + away.x * 1.15 + right.x * 0.12, p.y, p.z + away.z * 1.15 + right.z * 0.12);
    uni.uFigN.value.copy(away).negate();
    uni.uFigR.value.copy(right);
    // Cheval mirrors tip back: reflect as if the glass leans, so the figure's
    // head and horns fill the upper oval rather than falling above it.
    uni.uN.value.copy(normal).setY(normal.y + 0.26).normalize();
    overlay.visible = true;
    g.audio.play('mirrorScare', { pos: center.clone() });
    g.player.shake = Math.max(g.player.shake, 0.85);
    // The lamp dies for the moment the thing is there.
    saved.length = 0;
    for (const s of lamps) {
      saved.push(s.enabled);
      s.enabled = false;
    }
  };

  // Debug: game.upstairsMirror(seconds) replays the scare and holds it.
  let hold = 0;
  if (game.debug) {
    game.upstairsMirror = (sec = 0) => {
      glass.getWorldPosition(center);
      glass.getWorldDirection(normal);
      hold = sec;
      start(game);
    };
  }

  L.onUpdate((dt, time, g) => {
    if (phase >= 3) return;
    const eye = g.camera.position;
    if (phase === 0) {
      glass.getWorldPosition(center);
      glass.getWorldDirection(normal);
      const d = eye.distanceTo(center);
      if (d > 2.6) {
        look = 0;
        return;
      }
      to.subVectors(center, eye).normalize();
      g.camera.getWorldDirection(fwd);
      const inFront = tmp.subVectors(eye, center).dot(normal) > 0.3;
      if (inFront && fwd.dot(to) > 0.94 && !g.player.frozen && !g.player.dead && g.state === 'playing') look += dt;
      else look = Math.max(0, look - dt * 2);
      if (look > 0.35) start(g);
      return;
    }
    if (phase === 1) {
      t += dt;
      uni.uEye.value.copy(eye);
      const tt = Math.max(0, t - hold);
      uni.uAlpha.value = t < 0.05 ? t / 0.05 : tt < 0.5 ? 1 : Math.max(0, 1 - (tt - 0.5) / 0.12);
      if (tt >= 0.62) {
        hold = 0;
        overlay.visible = false;
        uni.uAlpha.value = 0;
        lamps.forEach((s, i) => (s.enabled = saved[i] ?? true));
        phase = 2;
        after = 0;
      }
      return;
    }
    // Turned round: nothing there.
    after += dt;
    to.subVectors(center, eye).normalize();
    g.camera.getWorldDirection(fwd);
    if (fwd.dot(to) < -0.3 || after > 4) {
      phase = 3;
      g.hud.say(fwd.dot(to) < -0.3 ? 'Nothing. There is nothing behind you.' : 'You don’t want to turn around. You make yourself.', 3.5);
    }
  });
}
