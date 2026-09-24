import * as THREE from 'three';
import { CONFIG, LANDMARKS } from '../config.js';
import { clamp, damp, lerpAngle } from '../core/utils.js';
import { getHeight } from '../world/terrain.js';
import { buildHumanoid, animateWalk, aimRightArm } from './character.js';

const _v = new THREE.Vector3();
const _wish = new THREE.Vector3();

function makeBeam() {
  const f = CONFIG.flashlight;
  const len = 16;
  const geo = new THREE.ConeGeometry(Math.tan(f.angle) * len * 0.85, len, 28, 1, true)
    .translate(0, -len / 2, 0)
    .rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.06 }, uColor: { value: new THREE.Color(1, 0.94, 0.8) } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying float vT; varying float vF;
      void main() {
        vT = 1.0 - uv.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vec3 v = normalize(cameraPosition - wp.xyz);
        vF = abs(dot(n, v));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; uniform vec3 uColor;
      varying float vT; varying float vF;
      void main() {
        float a = vF * pow(1.0 - vT, 1.8) * smoothstep(0.0, 0.05, vT) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 2;
  return m;
}

export class Player {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.rig = buildHumanoid({
      flashlight: true,
      jacket: 0x6e2219,
      pants: 0x3a4048,
      backpack: 0x3b4233,
      castShadow: false,
    });
    scene.add(this.rig.root);
    this.position = this.rig.root.position;
    this.velocity = new THREE.Vector3();
    this.bodyYaw = Math.PI;

    const f = CONFIG.flashlight;
    this.spot = new THREE.SpotLight(f.color, f.intensity, f.distance, f.angle, f.penumbra, f.decay);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.3;
    this.spot.shadow.camera.far = f.distance;
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.normalBias = 0.03;
    scene.add(this.spot, this.spot.target);

    this.fill = new THREE.PointLight(0xb4c2d6, 0.6, 9, 1.3);
    scene.add(this.fill);

    this.beam = makeBeam();
    scene.add(this.beam);

    this.lightDir = new THREE.Vector3(0, 0, -1);
    this.reset();
  }

  reset() {
    const S = LANDMARKS.spawn;
    this.position.set(S.x, getHeight(S.x, S.z), S.z);
    this.velocity.set(0, 0, 0);
    this.bodyYaw = Math.PI;
    this.rig.root.rotation.y = Math.PI;
    this.stats = { health: 100, sanity: 100, battery: 100, stamina: 100 };
    this.flashOn = true;
    this.exhausted = false;
    this.sprinting = false;
    this.speed = 0;
    this.noise = 0;
    this.strength = 1;
    this.flickerBoost = 0;
    this.dropout = 0;
    this.lastDamage = -99;
    this.dead = false;
    this.inSafe = false;
    this.batteryWarned = false;
    this.boundaryMsgAt = -99;
    this.stepIndex = 0;
  }

  get lightActive() {
    return this.flashOn && this.stats.battery > 0;
  }

  // Is a world point inside the flashlight beam, in range, and not behind a trunk?
  isPointLit(p) {
    if (this.strength < 0.35) return false;
    const f = CONFIG.flashlight;
    const d = _v.subVectors(p, this.spot.position).length();
    if (d > f.distance * 0.75 || d < 0.2) return false;
    _v.divideScalar(d);
    if (_v.dot(this.lightDir) < Math.cos(f.angle * 1.05)) return false;
    return !this.game.grid.segmentBlocked(this.spot.position.x, this.spot.position.z, p.x, p.z, 0.3, 0.9);
  }

  update(dt) {
    const g = this.game;
    const input = g.input;
    const cam = g.camRig;
    const C = CONFIG.player;

    if (this.dead) {
      this.velocity.multiplyScalar(0.9);
      return;
    }

    if (input.wasPressed('KeyF')) {
      this.flashOn = !this.flashOn;
      g.audio.click();
    }

    // ---- Movement ----
    const { f, r } = input.axis();
    _wish.set(0, 0, 0).addScaledVector(cam.flatForward, f).addScaledVector(cam.right, r);
    const moving = _wish.lengthSq() > 0;
    if (moving) _wish.normalize();
    const wantsSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.sprinting = wantsSprint && moving && !this.exhausted && f >= 0;
    let speed = this.sprinting ? C.sprintSpeed : C.walkSpeed;
    if (f < 0) speed *= 0.7;
    if (this.stats.health < 25) speed *= 0.85;
    _wish.multiplyScalar(moving ? speed : 0);
    const k = damp(C.accel, dt);
    this.velocity.x += (_wish.x - this.velocity.x) * k;
    this.velocity.z += (_wish.z - this.velocity.z) * k;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    g.grid.resolve(this.position, C.radius);

    // Boundary (the gate corridor opens once the gate does)
    const rd = Math.hypot(this.position.x, this.position.z);
    const inCorridor = g.landmarks.gate.isOpen && Math.abs(this.position.x) < 3.2 && this.position.z < -165;
    if (rd > CONFIG.world.radius && !inCorridor) {
      this.position.x *= CONFIG.world.radius / rd;
      this.position.z *= CONFIG.world.radius / rd;
      if (g.time - this.boundaryMsgAt > 10) {
        this.boundaryMsgAt = g.time;
        g.hud.notice('The trees close ranks. The forest will not let you leave.');
      }
    }
    this.position.y = getHeight(this.position.x, this.position.z);
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    // Body faces where the camera looks; the light points where you aim.
    this.bodyYaw = lerpAngle(this.bodyYaw, cam.yaw, damp(9, dt));
    this.rig.root.rotation.y = this.bodyYaw;
    const along = this.velocity.x * cam.flatForward.x + this.velocity.z * cam.flatForward.z;
    animateWalk(this.rig, dt, this.speed, along < -0.3 ? -1 : 1, { aimRight: true });
    aimRightArm(this.rig, cam.pitch + 0.06, dt);

    // Footsteps on each half stride
    const step = Math.floor(this.rig.phase / Math.PI);
    if (step !== this.stepIndex) {
      this.stepIndex = step;
      if (this.speed > 0.6) g.audio.footstep(this.sprinting ? 1 : 0.6);
    }

    this.updateStats(dt);
  }

  // Standing still with the light raised (title screen).
  idlePose(dt) {
    this.rig.root.rotation.y = this.bodyYaw;
    animateWalk(this.rig, dt, 0, 1, { aimRight: true });
    aimRightArm(this.rig, -0.1, dt);
  }

  updateStats(dt) {
    const g = this.game;
    const s = this.stats;
    const C = CONFIG.stats;

    if (this.sprinting) {
      s.stamina -= C.staminaDrain * dt;
      if (s.stamina <= 0) {
        s.stamina = 0;
        this.exhausted = true;
      }
    } else {
      s.stamina += C.staminaRegen * dt * (this.speed < 0.3 ? 1.4 : 1);
      if (this.exhausted && s.stamina > 35) this.exhausted = false;
    }

    if (this.flashOn && s.battery > 0) {
      s.battery -= C.batteryDrain * dt;
      if (s.battery <= 0) {
        s.battery = 0;
        g.hud.notice('Your flashlight dies.', 3, true);
        g.audio.click();
      }
    }
    if (s.battery > 0 && s.battery < 20 && !this.batteryWarned) {
      this.batteryWarned = true;
      g.hud.notice('The batteries are almost dead.');
    }
    if (s.battery > 30) this.batteryWarned = false;

    this.inSafe = g.landmarks.safeZones.some(
      (z) => Math.hypot(this.position.x - z.x, this.position.z - z.z) < z.r
    );
    const relics = g.objectives.count;
    if (this.inSafe) {
      s.sanity += C.sanitySafeRegen * dt;
    } else if (!this.lightActive) {
      s.sanity -= C.sanityDarkDrain * (1 + relics * 0.12) * dt;
    } else {
      s.sanity += C.sanityLightRegen * dt;
    }
    if (g.time - this.lastDamage > 8) s.health += C.healthRegen * dt * (this.inSafe ? 5 : 1);

    s.health = clamp(s.health, 0, 100);
    s.sanity = clamp(s.sanity, 0, 100);
    s.stamina = clamp(s.stamina, 0, 100);
    s.battery = clamp(s.battery, 0, 100);

    this.noise = this.sprinting ? 1 : this.speed > 0.6 ? 0.35 : 0.05;
    if (s.sanity <= 0) this.kill('sanity');
  }

  updateLight(dt) {
    const g = this.game;
    const f = CONFIG.flashlight;
    const t = g.time;
    // decay = 0 with a distance cutoff: even light along the beam, so things
    // right in front of the lens don't blow out to white.
    this.rig.flashTip.getWorldPosition(this.beam.position);
    this.spot.position.copy(this.beam.position);
    this.spot.target.position.copy(g.camRig.aimPoint);
    this.lightDir.subVectors(this.spot.target.position, this.spot.position).normalize();

    let flick = 1;
    const bat = this.stats.battery;
    if (bat < 20) {
      const k = 1 - bat / 20;
      flick *= 1 - k * 0.45 * (0.5 + 0.5 * Math.sin(t * 37) * Math.sin(t * 11.3));
      if (Math.random() < k * 0.03) this.dropout = 0.06 + Math.random() * 0.15;
    }
    if (this.flickerBoost > 0) {
      flick *= 0.55 + 0.45 * Math.abs(Math.sin(t * 41 + Math.sin(t * 9) * 3));
      if (Math.random() < this.flickerBoost * 0.05) this.dropout = 0.05 + Math.random() * 0.2;
      this.flickerBoost = Math.max(0, this.flickerBoost - dt * 2);
    }
    if (this.dropout > 0) {
      this.dropout -= dt;
      flick *= 0.04;
    }
    const target = this.lightActive ? flick : 0;
    this.strength += (target - this.strength) * damp(30, dt);

    this.spot.intensity = f.intensity * this.strength;
    // Bounce light from the beam, placed behind the shoulder so you can see yourself.
    this.fill.position.set(this.position.x, this.position.y + 2.1, this.position.z).addScaledVector(g.camRig.flatForward, -1.3);
    this.fill.intensity = 0.5 + 2.2 * this.strength;

    this.beam.lookAt(this.spot.target.position);
    this.beam.material.uniforms.uOpacity.value = 0.07 * this.strength;
    const lens = this.rig.root.userData.torch.userData.lens;
    lens.material.color.setRGB(0.1 + 3 * this.strength, 0.1 + 2.8 * this.strength, 0.1 + 2.4 * this.strength);
  }

  addBattery(amount) {
    this.stats.battery = Math.min(100, this.stats.battery + amount);
  }

  damage(amount, cause) {
    if (this.dead) return;
    const g = this.game;
    this.stats.health -= amount;
    this.lastDamage = g.time;
    g.fx.hit(Math.min(1, amount / 30));
    g.camRig.shake(0.5 + amount / 60);
    g.audio.hurt();
    if (this.stats.health <= 0) {
      this.stats.health = 0;
      this.kill(cause);
    }
  }

  hitSanity(amount) {
    if (this.dead) return;
    this.stats.sanity = Math.max(0, this.stats.sanity - amount);
    if (this.stats.sanity <= 0) this.kill('sanity');
  }

  kill(cause) {
    if (this.dead || this.game.god) return;
    this.dead = true;
    this.game.onPlayerDeath(cause);
  }
}
