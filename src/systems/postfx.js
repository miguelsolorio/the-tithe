import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp } from '../core/utils.js';

// Runs after tone mapping: zone colour grade (amber -> teal -> crimson),
// film grain, vignette, chromatic aberration, damage tint, low-health pulse
// and fades. Ported from dc8b10c and extended.
const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.07 },
    uVignette: { value: 1.0 },
    uAberration: { value: 0.0015 },
    uDamage: { value: 0 },
    uDesat: { value: 0.2 },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color(0, 0, 0) },
    uPulse: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmount: { value: 0 },
    uShadowTint: { value: new THREE.Color(0, 0, 0) },
    uDistort: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uAberration, uDamage, uDesat, uFade, uPulse, uTintAmount, uDistort;
    uniform vec3 uTint, uShadowTint, uFadeColor;
    uniform vec2 uRes;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      uv.x += sin(uv.y * 14.0 + uTime * 2.1) * 0.004 * uDistort;
      uv.y += cos(uv.x * 11.0 + uTime * 1.7) * 0.003 * uDistort;
      vec2 dir = uv - 0.5;
      float dist = length(dir);
      float ab = uAberration * (0.5 + dist * 2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;

      // Zone grade: pull toward the zone colour, lift the shadows into it.
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), uDesat);
      vec3 graded = mix(col, l * uTint * 1.6, 0.55) + uShadowTint * (1.0 - smoothstep(0.0, 0.25, l)) * 0.06;
      col = mix(col, graded, uTintAmount);

      float n = rand(uv * uRes * 0.5 + fract(uTime * 7.13) * 91.0);
      col += (n - 0.5) * uGrain;

      col = mix(col, vec3(0.32, 0.0, 0.01), uDamage * (0.25 + 0.75 * smoothstep(0.1, 0.7, dist)));
      float vig = smoothstep(0.95, 0.2, dist * (uVignette + uPulse * 0.25));
      col *= vig;
      col = mix(col, uFadeColor, uFade);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera, weaponScene, weaponCamera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    if (weaponScene) {
      // First-person weapon drawn on top with its own depth so it never clips into walls.
      const wp = new RenderPass(weaponScene, weaponCamera);
      wp.clear = false;
      wp.clearDepth = true;
      this.composer.addPass(wp);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.4, 1.15);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.horror = new ShaderPass(HorrorShader);
    this.composer.addPass(this.horror);

    this.damage = 0;
    this.fade = 1;
    this.fadeTarget = 1;
    this.fadeSpeed = 1.5;
    this.pulse = 0;
    this.distort = 0;
    this.tint = new THREE.Color(1, 1, 1);
    this.tintTarget = new THREE.Color(1, 1, 1);
    this.tintAmount = 0;
    this.tintAmountTarget = 0;
    this.shake = 0;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.floor(w / 2), Math.floor(h / 2));
    this.horror.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  }

  hit(amount) {
    this.damage = Math.min(1, this.damage + amount);
  }

  // Zone grade colour and strength; eases over ~2 s.
  setGrade(color, amount) {
    this.tintTarget.set(color);
    this.tintAmountTarget = amount;
  }

  fadeTo(target, speed = 1.5, color = 0x000000) {
    this.fadeTarget = target;
    this.fadeSpeed = speed;
    this.horror.uniforms.uFadeColor.value.set(color);
  }

  update(dt, t, { health01 = 1 } = {}) {
    const u = this.horror.uniforms;
    this.damage = Math.max(0, this.damage - dt * 0.8);
    const df = this.fadeTarget - this.fade;
    this.fade += Math.sign(df) * Math.min(Math.abs(df), dt * this.fadeSpeed);
    const low = clamp((0.35 - health01) / 0.35, 0, 1);
    this.pulse = Math.max(0, Math.sin(t * (3 + low * 4))) * low;
    const k = Math.min(1, dt * 0.8);
    this.tint.lerp(this.tintTarget, k);
    this.tintAmount += (this.tintAmountTarget - this.tintAmount) * k;

    u.uTime.value = t;
    u.uGrain.value = 0.075 + low * 0.04;
    u.uDamage.value = Math.min(1, this.damage + low * 0.25);
    u.uAberration.value = 0.0015 + this.damage * 0.006 + low * 0.002;
    u.uVignette.value = 1.0 + low * 0.2;
    u.uPulse.value = this.pulse;
    u.uFade.value = this.fade;
    u.uTint.value.copy(this.tint);
    u.uShadowTint.value.copy(this.tint);
    u.uTintAmount.value = this.tintAmount;
    u.uDistort.value = this.distort;
  }

  render() {
    this.composer.render();
  }
}
