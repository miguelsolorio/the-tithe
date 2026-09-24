import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { getHeight } from './terrain.js';
import { fogTexture, softSprite } from './textures.js';

export class Atmosphere {
  constructor(scene) {
    this.scene = scene;
    const fogColor = new THREE.Color(CONFIG.fog.color);
    scene.background = fogColor;
    scene.fog = new THREE.FogExp2(fogColor, CONFIG.fog.density);
    this.targetDensity = CONFIG.fog.density;

    this.hemi = new THREE.HemisphereLight(0x2c3d52, 0x0d0a08, 0.9);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8494b8, 0.45);
    this.moon.position.set(-60, 120, -40);
    scene.add(this.moon);

    // A pale moon that shows faintly through the canopy.
    this.moonSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softSprite('rgba(220,230,255,1)'),
        color: new THREE.Color(0.9, 0.95, 1.1),
        fog: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.55,
      })
    );
    this.moonSprite.scale.set(17, 17, 1);
    this.moonSprite.renderOrder = -1;
    scene.add(this.moonSprite);

    this._buildGroundFog();
    this._buildDust();
  }

  _buildGroundFog() {
    const tex = fogTexture();
    this.fogSprites = [];
    this.fogGroup = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: 0x3a4550,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      s.userData = {
        base: 0.12 + Math.random() * 0.14,
        drift: new THREE.Vector2((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4),
        lift: 0.4 + Math.random() * 1.2,
        fade: 0,
      };
      const sc = 9 + Math.random() * 9;
      s.scale.set(sc, sc * 0.45, 1);
      s.position.set(9999, 0, 9999);
      this.fogGroup.add(s);
      this.fogSprites.push(s);
    }
    this.scene.add(this.fogGroup);
  }

  // Dust motes that only show up inside the flashlight beam.
  _buildDust() {
    const count = 700;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * 18;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = Math.random() * 18;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustUniforms = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uLightPos: { value: new THREE.Vector3() },
      uLightDir: { value: new THREE.Vector3(0, 0, -1) },
      uCos: { value: Math.cos(CONFIG.flashlight.angle) },
      uOn: { value: 1 },
      uScale: { value: 300 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.dustUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec3 uCam; uniform vec3 uLightPos; uniform vec3 uLightDir;
        uniform float uCos; uniform float uOn; uniform float uScale;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p += vec3(sin(uTime * 0.21 + aSeed * 6.28) * 0.7,
                    uTime * 0.04 + sin(uTime * 0.33 + aSeed * 3.1) * 0.35,
                    cos(uTime * 0.17 + aSeed * 4.7) * 0.7);
          vec3 origin = uCam - vec3(9.0);
          p = origin + mod(p - origin, 18.0);
          vec3 L = p - uLightPos;
          float d = length(L);
          float c = dot(L / max(d, 0.001), uLightDir);
          float inCone = smoothstep(uCos, uCos + 0.05, c);
          vAlpha = inCone * uOn * (1.0 - smoothstep(3.0, 15.0, d)) * smoothstep(0.3, 1.2, d)
                   * (0.55 + 0.45 * sin(uTime * 1.7 + aSeed * 40.0));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.5 + aSeed) * uScale / max(-mv.z, 0.1) * 0.06;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          if (r > 0.5) discard;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.85), vAlpha * (1.0 - r * 2.0) * 0.8);
        }`,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  setRelicLevel(n) {
    this.targetDensity = CONFIG.fog.density + n * CONFIG.fog.perRelic;
  }

  update(dt, t, camera, flashlight) {
    const fog = this.scene.fog;
    fog.density += (this.targetDensity - fog.density) * Math.min(1, dt * 0.3);

    this.moonSprite.position.copy(camera.position).add(new THREE.Vector3(-26, 40, -34));

    // Recycle ground fog around the camera
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (const s of this.fogSprites) {
      const u = s.userData;
      s.position.x += u.drift.x * dt;
      s.position.z += u.drift.y * dt;
      const dx = s.position.x - cx;
      const dz = s.position.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > 46) {
        const a = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * 36;
        s.position.x = cx + Math.cos(a) * r;
        s.position.z = cz + Math.sin(a) * r;
        u.fade = 0;
      }
      s.position.y = getHeight(s.position.x, s.position.z) + u.lift;
      u.fade = Math.min(1, u.fade + dt * 0.25);
      // Thin out fog right at the camera so it doesn't smear the screen.
      const near = Math.min(1, Math.max(0, (d - 3) / 6));
      s.material.opacity = u.base * u.fade * near;
    }

    const du = this.dustUniforms;
    du.uTime.value = t;
    du.uCam.value.copy(camera.position);
    if (flashlight) {
      du.uLightPos.value.copy(flashlight.position);
      du.uLightDir.value.copy(flashlight.dir);
      du.uOn.value = flashlight.strength;
    }
  }
}
