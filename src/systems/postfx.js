import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp } from '../core/utils.js';

// Runs after tone mapping: grain, vignette, chromatic aberration, static,
// sanity distortion, damage tint and fade-to-black.
const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.07 },
    uVignette: { value: 1.0 },
    uAberration: { value: 0.0015 },
    uStatic: { value: 0 },
    uDistort: { value: 0 },
    uDamage: { value: 0 },
    uDesat: { value: 0.35 },
    uFade: { value: 0 },
    uPulse: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uAberration, uStatic, uDistort, uDamage, uDesat, uFade, uPulse;
    uniform vec2 uRes;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      uv.x += sin(uv.y * 16.0 + uTime * 2.1) * 0.004 * uDistort;
      uv.y += cos(uv.x * 12.0 + uTime * 1.6) * 0.003 * uDistort;
      float band = step(1.0 - uStatic * 0.08, rand(vec2(floor(uv.y * 90.0), floor(uTime * 20.0))));
      uv.x += (rand(vec2(uTime, floor(uv.y * 200.0))) - 0.5) * 0.06 * uStatic * band;

      vec2 dir = uv - 0.5;
      float dist = length(dir);
      float ab = uAberration * (0.5 + dist * 2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;

      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l) * vec3(0.93, 1.0, 1.06), uDesat);

      float n = rand(uv * uRes * 0.5 + fract(uTime * 7.13) * 91.0);
      col = mix(col, vec3(n * 0.8), uStatic * 0.4);
      col += (n - 0.5) * uGrain;

      col = mix(col, vec3(0.3, 0.0, 0.0), uDamage * smoothstep(0.15, 0.75, dist));
      float vig = smoothstep(0.9, 0.22, dist * (uVignette + uPulse * 0.18));
      col *= vig;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.horror = new ShaderPass(HorrorShader);
    this.composer.addPass(this.horror);

    this.damage = 0;
    this.staticLevel = 0; // continuous (Stalker)
    this.staticBurst = 0; // decaying spikes (jump scares)
    this.fade = 0;
    this.fadeTarget = 0;
    this.pulse = 0;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.horror.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  }

  hit(amount) {
    this.damage = Math.min(1, this.damage + amount);
  }

  burst(amount = 1) {
    this.staticBurst = Math.max(this.staticBurst, amount);
  }

  update(dt, t, { sanity = 100, heart = 0 } = {}) {
    const u = this.horror.uniforms;
    const s = clamp(sanity / 100, 0, 1);
    this.damage = Math.max(0, this.damage - dt * 0.9);
    this.staticBurst = Math.max(0, this.staticBurst - dt * 2.2);
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 1.5);
    this.pulse = Math.max(0, Math.sin(t * (3 + heart * 5)) * heart);

    const stat = Math.min(1, this.staticLevel + this.staticBurst);
    u.uTime.value = t;
    u.uDistort.value = 1 - clamp((s - 0.1) / 0.45, 0, 1);
    u.uDesat.value = 0.3 + (1 - s) * 0.45;
    u.uAberration.value = 0.0015 + (1 - s) * 0.007 + stat * 0.012;
    u.uStatic.value = stat;
    u.uGrain.value = 0.065 + (1 - s) * 0.06 + stat * 0.1;
    u.uDamage.value = this.damage;
    u.uVignette.value = 1.0 + (1 - s) * 0.25;
    u.uPulse.value = this.pulse;
    u.uFade.value = this.fade;
  }

  render() {
    this.composer.render();
  }
}
