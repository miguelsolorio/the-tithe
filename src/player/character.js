import * as THREE from 'three';

// A low-poly humanoid with pivot joints for procedural animation.
// Faces +Z. Feet at y = 0.

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function part(parent, geo, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function buildHumanoid(opts = {}) {
  const o = {
    jacket: 0x5b1f1a,
    pants: 0x1f2328,
    skin: 0xc4a088,
    hair: 0x1a120c,
    boots: 0x121212,
    height: 1,
    width: 1,
    castShadow: true,
    flashlight: false,
    beanie: null,
    backpack: null,
    material: null, // override every material (for ghosts)
    ...opts,
  };
  const mat = (c) => o.material || new THREE.MeshLambertMaterial({ color: c });
  const jacket = mat(o.jacket);
  const pants = mat(o.pants);
  const skin = mat(o.skin);
  const hair = mat(o.hair);
  const boots = mat(o.boots);

  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  body.scale.set(o.width, o.height, o.width);
  const hips = joint(body, 0, 0.95, 0);
  const spine = joint(hips, 0, 0.02, 0);
  part(spine, box(0.46, 0.62, 0.27), jacket, 0, 0.32, 0, o.castShadow);
  part(spine, box(0.42, 0.14, 0.25), pants, 0, -0.02, 0, o.castShadow);
  const neck = joint(spine, 0, 0.66, 0);
  part(neck, box(0.1, 0.1, 0.1), skin, 0, 0.03, 0, o.castShadow);
  const head = joint(neck, 0, 0.1, 0);
  const headMesh = part(head, new THREE.SphereGeometry(0.135, 10, 8), skin, 0, 0.12, 0.01, o.castShadow);
  headMesh.scale.set(0.92, 1.12, 1);
  part(head, new THREE.SphereGeometry(0.142, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.14, -0.012, o.castShadow);
  if (o.beanie) {
    part(head, new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(o.beanie), 0, 0.16, 0, o.castShadow);
  }
  if (o.backpack) {
    part(spine, box(0.36, 0.46, 0.18), mat(o.backpack), 0, 0.34, -0.22, o.castShadow);
  }

  const limb = (side) => {
    const shoulder = joint(spine, side * 0.3, 0.58, 0);
    part(shoulder, box(0.13, 0.34, 0.13), jacket, 0, -0.16, 0, o.castShadow);
    const elbow = joint(shoulder, 0, -0.32, 0);
    part(elbow, box(0.11, 0.3, 0.11), jacket, 0, -0.14, 0, o.castShadow);
    const hand = joint(elbow, 0, -0.3, 0);
    part(hand, box(0.09, 0.1, 0.09), skin, 0, -0.03, 0, o.castShadow);
    const hip = joint(hips, side * 0.12, 0, 0);
    part(hip, box(0.17, 0.46, 0.17), pants, 0, -0.23, 0, o.castShadow);
    const knee = joint(hip, 0, -0.46, 0);
    part(knee, box(0.15, 0.44, 0.15), pants, 0, -0.21, 0, o.castShadow);
    part(knee, box(0.16, 0.1, 0.26), boots, 0, -0.44, 0.04, o.castShadow);
    return { shoulder, elbow, hand, hip, knee };
  };
  // Facing +Z, the character's right side is -X.
  const L = limb(1);
  const R = limb(-1);

  let flashTip = null;
  if (o.flashlight) {
    const torch = new THREE.Group();
    torch.position.set(0, -0.06, 0.02);
    R.hand.add(torch);
    const torchMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    part(torch, new THREE.CylinderGeometry(0.028, 0.028, 0.2, 8), torchMat, 0, -0.06, 0, false);
    part(torch, new THREE.CylinderGeometry(0.045, 0.032, 0.07, 8), torchMat, 0, -0.18, 0, false);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.4) })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.216;
    torch.add(lens);
    flashTip = joint(torch, 0, -0.23, 0);
    torch.userData.lens = lens;
    root.userData.torch = torch;
  }

  return { root, body, hips, spine, neck, head, L, R, flashTip, phase: 0 };
}

// Walk/run cycle. speed is in m/s, dir is +1 forward / -1 backward.
export function animateWalk(rig, dt, speed, dir = 1, opts = {}) {
  const stride = speed > 4.5 ? 1.45 : 1.1;
  rig.phase += (speed / stride) * Math.PI * dt * dir;
  const s = Math.min(1, speed / 3) * (speed > 4.5 ? 1.25 : 1);
  const sw = Math.sin(rig.phase);
  const k = 1 - Math.exp(-dt * 14);

  const set = (obj, target) => (obj.rotation.x += (target - obj.rotation.x) * k);
  set(rig.L.hip, -sw * 0.55 * s);
  set(rig.R.hip, sw * 0.55 * s);
  set(rig.L.knee, Math.max(0, sw) * 0.9 * s + 0.05);
  set(rig.R.knee, Math.max(0, -sw) * 0.9 * s + 0.05);
  set(rig.L.shoulder, sw * 0.5 * s);
  if (!opts.aimRight) {
    set(rig.R.shoulder, -sw * 0.5 * s);
    set(rig.R.elbow, -0.2 - s * 0.3);
  }
  set(rig.L.elbow, -0.15 - s * 0.35);
  set(rig.spine, speed > 4.5 ? 0.18 : 0.04 * s);

  const bob = Math.abs(Math.cos(rig.phase)) * 0.045 * s;
  rig.hips.position.y = 0.95 + bob - s * 0.02;
  if (speed < 0.2) {
    // Breathing
    const t = performance.now() * 0.001;
    rig.spine.scale.y = 1 + Math.sin(t * 1.8) * 0.008;
  }
}

// Points the right arm (holding the light) along a pitch, relative to the body.
export function aimRightArm(rig, pitch, dt) {
  const k = 1 - Math.exp(-dt * 18);
  const target = -Math.PI / 2 + 0.12 - pitch;
  rig.R.shoulder.rotation.x += (target - rig.R.shoulder.rotation.x) * k;
  rig.R.shoulder.rotation.z += (0.12 - rig.R.shoulder.rotation.z) * k;
  rig.R.elbow.rotation.x += (-0.1 - rig.R.elbow.rotation.x) * k;
}
