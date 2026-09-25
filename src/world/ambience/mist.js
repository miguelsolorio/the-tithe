import * as THREE from 'three';
import { lite } from './common.js';

// Low drifting mist and dust in the air, both kept in a box around the player
// so they cost the same in any level. The mist is soft camera-facing puffs
// hugging the floor; the dust only shows where the flashlight hits it. Both
// brighten inside the beam, fade near the camera and take the scene fog.
//
//   const mist = groundMist(L, { color: 0x1e4a4f, opacity: 0.3 });
//   mist.uniforms.uColor.value.set(...);   // retint at runtime
//   dustMotes(L, { color: 0xd8ccb0 });

const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 3.7) + 0.15 * vnoise(p * 4.3 - 1.3); }
`;

// Flashlight: position, direction and on/off, shared by both shaders.
const BEAM = /* glsl */ `
  uniform vec3 uLightPos;
  uniform vec3 uLightDir;
  uniform float uLightOn;
  float beamAt(vec3 w) {
    vec3 d = w - uLightPos;
    float dist = length(d);
    float c = dot(d / max(dist, 1e-3), uLightDir);
    return uLightOn * smoothstep(0.86, 0.975, c) * (1.0 - smoothstep(5.0, 18.0, dist));
  }
`;

function beamUniforms() {
  return { uLightPos: { value: new THREE.Vector3() }, uLightDir: { value: new THREE.Vector3(0, 0, -1) }, uLightOn: { value: 0 }, uTime: { value: 0 } };
}

function syncBeam(u, game, t) {
  const pl = game.player;
  u.uTime.value = t;
  u.uLightPos.value.copy(pl.camera.position);
  u.uLightDir.value.copy(pl.lightDir);
  u.uLightOn.value += ((pl.flashOn ? 1 : 0) - u.uLightOn.value) * 0.2;
}

// Scatter n points in a box around the player; a point that drifts out of
// the box wraps to the other side. place(i, x, z) sets its height.
class Wrapper {
  constructor(n, radius, rng) {
    this.n = n;
    this.r = radius;
    this.xz = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      this.xz[i * 2] = (rng() * 2 - 1) * radius;
      this.xz[i * 2 + 1] = (rng() * 2 - 1) * radius;
    }
  }

  // Drift every point; onWrap(i, worldX, worldZ) for each one that wrapped.
  step(px, pz, vx, vz, dt, onWrap) {
    const r = this.r;
    for (let i = 0; i < this.n; i++) {
      let x = this.xz[i * 2] + vx * dt;
      let z = this.xz[i * 2 + 1] + vz * dt;
      let wrapped = false;
      if (x > r) { x -= 2 * r; wrapped = true; } else if (x < -r) { x += 2 * r; wrapped = true; }
      if (z > r) { z -= 2 * r; wrapped = true; } else if (z < -r) { z += 2 * r; wrapped = true; }
      this.xz[i * 2] = x;
      this.xz[i * 2 + 1] = z;
      if (wrapped) onWrap(i, px + x, pz + z);
    }
  }
}

// Ground mist. opts: { color, opacity, count, radius, height: [min, max] above
// the floor, size: [min, max] puff width, drift: [vx, vz] m/s, beam: extra
// brightness in the flashlight, floorMin: lie on this height instead where the
// floor is lower (a water surface) }
export function groundMist(L, opts = {}) {
  const game = L.game;
  const { color = 0x8a96a0, opacity = 0.3, radius = 13, height = [0.05, 0.8], size = [2.6, 5.2], drift = [0.12, 0.05], beam = 1.4, floorMin = -Infinity } = opts;
  const n = Math.round((opts.count ?? 40) * (lite(game) ? 0.5 : 1));
  const rng = L.rng;
  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const off = new Float32Array(n * 3);
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = rng.range(size[0], size[1]);
    data[i * 4 + 1] = rng() * 100;
    data[i * 4 + 2] = rng.range(height[0], height[1]);
    data[i * 4 + 3] = rng.range(0.55, 1);
  }
  const aOff = new THREE.InstancedBufferAttribute(off, 3);
  aOff.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aOffset', aOff);
  geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4));
  geo.instanceCount = n;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, beamUniforms(), {
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    uBeam: { value: beam },
    uCenter: { value: new THREE.Vector3() },
    uRadius: { value: radius },
  }]);
  const mat = new THREE.ShaderMaterial({
    name: 'ambience:mist',
    uniforms,
    fog: true,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aOffset;
      attribute vec4 aData;
      uniform vec3 uCenter;
      uniform float uRadius;
      varying vec2 vUv;
      varying float vA;
      varying float vSeed;
      varying float vBeam;
      ${BEAM}
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vSeed = aData.y;
        vec4 mvPosition = viewMatrix * vec4(aOffset, 1.0);
        mvPosition.xy += position.xy * aData.x * vec2(1.0, 0.55);
        float d = -mvPosition.z;
        vec2 rel = aOffset.xz - uCenter.xz;
        float edge = 1.0 - smoothstep(uRadius * 0.6, uRadius * 0.95, max(abs(rel.x), abs(rel.y)));
        vA = aData.w * smoothstep(0.6, 2.8, d) * edge;
        vBeam = beamAt(aOffset);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uBeam;
      uniform float uTime;
      varying vec2 vUv;
      varying float vA;
      varying float vSeed;
      varying float vBeam;
      ${NOISE}
      #include <fog_pars_fragment>
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c * vec2(1.0, 1.25)) * 2.0;
        float a = 1.0 - smoothstep(0.15, 1.0, r);
        float n = fbm(vUv * 2.2 + vec2(uTime * 0.035, vSeed) + vec2(0.0, uTime * 0.01));
        a *= smoothstep(0.25, 0.75, n);
        a *= uOpacity * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * (1.0 + vBeam * uBeam), a * (1.0 + vBeam * 0.6));
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ambience:mist';
  mesh.frustumCulled = false;
  mesh.userData.noCull = true;
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  L.group.add(mesh);

  const wrap = new Wrapper(n, radius, rng);
  const last = new THREE.Vector3(NaN, 0, 0);
  const setY = (i, x, z) => {
    const py = game.player.position.y;
    const g = L.physics.groundAt(x, z, py + 1.2);
    const fy = Math.max(floorMin, g.y === -Infinity || py - g.y > 3 ? py : g.y);
    off[i * 3] = x;
    off[i * 3 + 1] = fy + data[i * 4 + 2];
    off[i * 3 + 2] = z;
  };
  const api = { mesh, uniforms, enabled: true };
  L.onUpdate((dt, t, g) => {
    mesh.visible = api.enabled;
    if (!api.enabled) return;
    const p = g.player.position;
    if (Number.isNaN(last.x) || last.distanceToSquared(p) > 400) {
      // First frame (or a teleport): scatter everything around the player.
      last.copy(p);
      for (let i = 0; i < n; i++) setY(i, p.x + wrap.xz[i * 2], p.z + wrap.xz[i * 2 + 1]);
    }
    // Keep offsets relative to the player: moving shifts them the other way.
    const mx = p.x - last.x;
    const mz = p.z - last.z;
    last.copy(p);
    for (let i = 0; i < n; i++) {
      wrap.xz[i * 2] -= mx;
      wrap.xz[i * 2 + 1] -= mz;
    }
    wrap.step(p.x, p.z, drift[0], drift[1], dt, setY);
    for (let i = 0; i < n; i++) {
      off[i * 3] = p.x + wrap.xz[i * 2];
      off[i * 3 + 2] = p.z + wrap.xz[i * 2 + 1];
    }
    // Re-probe the floor under puffs left on another storey (stairs, ladders).
    for (let i = 0; i < n; i++) {
      if (Math.abs(off[i * 3 + 1] - data[i * 4 + 2] - p.y) > 2.2) setY(i, off[i * 3], off[i * 3 + 2]);
    }
    aOff.needsUpdate = true;
    uniforms.uCenter.value.copy(p);
    syncBeam(uniforms, g, t);
  });
  return api;
}

// Dust motes around the camera, only really visible inside the flashlight
// beam (plus a faint base so candle-lit rooms have a little too).
// opts: { color, count, radius, size, base }
export function dustMotes(L, opts = {}) {
  const game = L.game;
  const { color = 0xd8ccb0, radius = 5, size = 0.028, base = 0.08 } = opts;
  const n = Math.round((opts.count ?? 380) * (lite(game) ? 0.5 : 1));
  const rng = L.rng;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rng.range(-radius, radius);
    pos[i * 3 + 1] = rng.range(-radius * 0.5, radius * 0.5);
    pos[i * 3 + 2] = rng.range(-radius, radius);
    seed[i] = rng() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = THREE.UniformsUtils.merge([beamUniforms(), {
    uColor: { value: new THREE.Color(color) },
    uCenter: { value: new THREE.Vector3() },
    uRadius: { value: radius },
    uSize: { value: size * (innerHeight / 2) },
    uBase: { value: base },
  }]);
  const mat = new THREE.ShaderMaterial({
    name: 'ambience:motes',
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform vec3 uCenter;
      uniform float uRadius;
      uniform float uSize;
      uniform float uBase;
      varying float vA;
      ${BEAM}
      uniform float uTime;
      void main() {
        // Wrap the static cloud into a box centred on the camera, drifting slowly.
        vec3 drift = vec3(sin(uTime * 0.13 + aSeed) * 0.4 + uTime * 0.03, sin(uTime * 0.21 + aSeed * 1.7) * 0.3 - uTime * 0.012, cos(uTime * 0.11 + aSeed * 0.7) * 0.4);
        vec3 box = vec3(uRadius, uRadius * 0.5, uRadius) * 2.0;
        vec3 w = uCenter + mod(position + drift - uCenter + box * 0.5, box) - box * 0.5;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        float d = -mvPosition.z;
        float b = beamAt(w);
        float edge = 1.0 - smoothstep(uRadius * 0.7, uRadius, length(w - uCenter));
        vA = (uBase + b * 1.6) * edge * smoothstep(0.15, 0.5, d) * (0.6 + 0.4 * sin(uTime * 1.3 + aSeed * 5.0));
        gl_PointSize = uSize / max(d, 0.1) * (0.6 + fract(aSeed) * 0.8);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'ambience:motes';
  pts.frustumCulled = false;
  pts.userData.noCull = true;
  pts.renderOrder = 3;
  L.group.add(pts);
  const api = { points: pts, uniforms, enabled: true };
  L.onUpdate((dt, t, g) => {
    pts.visible = api.enabled;
    if (!api.enabled) return;
    uniforms.uCenter.value.copy(g.player.camera.position);
    uniforms.uSize.value = size * (innerHeight / 2);
    syncBeam(uniforms, g, t);
  });
  return api;
}
