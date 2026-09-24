import * as THREE from 'three';
import { Entity } from './entity.js';
import { makeHiker, makeHermit, makeGirl } from './models.js';
import { damp, lerpAngle, yawTo, wrapAngle } from '../core/utils.js';
import { getHeight } from '../world/terrain.js';
import { rand, pick } from '../core/rng.js';

// ======================= LOST HIKER =======================
// Sits at the campfire. Hands over batteries once and gives hints.
export class Hiker extends Entity {
  constructor(game) {
    super(game, 'hiker');
    const seat = game.landmarks.hikerSeat;
    this.rig = makeHiker();
    this.group.add(this.rig.root);
    this.group.position.copy(seat.pos);
    this.group.position.y -= 0.42;
    this.group.rotation.y = seat.yaw;
    this.baseYaw = seat.yaw;
    this.talks = 0;
    this.gaveBatteries = false;
    this.gone = false;

    // His hat, left behind when he vanishes.
    this.hat = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshLambertMaterial({ color: 0x8b6a22 })
    );
    this.hat.position.copy(game.landmarks.hatSpot);
    this.hat.visible = false;
    game.scene.add(this.hat);

    this.item = game.interaction.add({
      getPos: () => this.group.position,
      radius: 2.8,
      prompt: () => (this.gone ? 'Examine the hat' : 'Talk to the hiker'),
      action: () => this.talk(),
    });
  }

  talk() {
    const hud = this.game.hud;
    const n = this.game.objectives.count;
    if (hud.talking) return hud.skip();
    if (this.gone) {
      hud.say('', 'His hat. Still warm. Drag marks lead away from the fire, into the dark.');
      return;
    }
    const S = 'The Hiker';
    this.talks++;
    if (!this.gaveBatteries) {
      this.gaveBatteries = true;
      hud.say(S, "You... you're real? Sit. Don't wander from the fire too long.");
      hud.say(S, 'Here, take these batteries. The dark is where they are.');
      setTimeout(() => {
        this.game.player.addBattery(100);
        this.game.audio.battery();
      }, 2500);
      hud.say(S, "The gate up north won't open. Not without the five wards.");
      hud.say(S, 'The cabin to the west. The graveyard east. The old well. The standing stones. And the hanging tree, dead center.');
      hud.say(S, 'Keep your light on the wolves. They hate it. But if you hear that shriek... put the light out and walk. Slowly.');
      return;
    }
    const lines = {
      0: ["Five wards. Follow the trails, they'll take you to them.", "Don't follow the girl in white. Or do. I followed her once, and here I am."],
      1: ['You found one. I felt the whole forest turn its head.', 'The tall one will come now. Keep checking behind you.'],
      2: ["Two... Something's hunting out there. It can see your light from very far away.", 'Wendigo, my grandfather called it. It hates fire.'],
      3: ["Please, stay a while. It's so quiet when you leave."],
      4: ['One more. Then run for the gate, and do not look back.'],
      5: ['Go. North. Go now, before it remembers you.'],
    };
    const opts = lines[Math.min(5, n)];
    hud.say(S, opts[(this.talks - 2) % opts.length]);
  }

  update(dt) {
    if (this.gone) return;
    const d = this.distToPlayer();
    const g = this.game;
    // Vanish once three wards are taken, while you're away from the fire.
    if (g.objectives.count >= 3 && d > 45) {
      this.gone = true;
      this.rig.root.visible = false;
      this.hat.visible = true;
      return;
    }
    // Idle sway and head tracking
    const t = g.time;
    this.rig.spine.rotation.z = Math.sin(t * 0.6) * 0.03;
    if (d < 9) {
      const p = g.player.position;
      const want = wrapAngle(yawTo(p.x - this.pos.x, p.z - this.pos.z) - this.group.rotation.y);
      const clamped = Math.max(-1.1, Math.min(1.1, want));
      this.rig.neck.rotation.y = lerpAngle(this.rig.neck.rotation.y, clamped, damp(4, dt));
      this.rig.head.rotation.x = -0.25;
    } else {
      this.rig.neck.rotation.y *= 1 - damp(2, dt);
      this.rig.head.rotation.x = 0.3; // staring into the fire
    }
  }
}

// ======================= HERMIT =======================
// Stands around the cabin. Every time you look away, he's somewhere else.
export class Hermit extends Entity {
  constructor(game) {
    super(game, 'hermit');
    this.rig = makeHermit();
    this.group.add(this.rig.root);
    this.spots = game.landmarks.hermitSpots;
    this.spotIndex = 0;
    this.placeAt(0);
    this.unseen = 0;
    this.moved = false;
    this.stung = true;
    this.talks = 0;
    this.lantern = game.lights.add({
      getPos: (out) => this.rig.lantern.getWorldPosition(out),
      color: 0xffa24a,
      intensity: 2.2,
      distance: 7,
      flicker: 0.6,
    });
    this.item = game.interaction.add({
      getPos: () => this.group.position,
      radius: 2.6,
      prompt: 'Speak to the old man',
      action: () => this.talk(),
    });
  }

  placeAt(i) {
    const s = this.spots[i];
    this.spotIndex = i;
    this.group.position.copy(s.pos);
    this.group.rotation.y = s.yaw;
  }

  talk() {
    const hud = this.game.hud;
    if (hud.talking) return hud.skip();
    const lines = [
      'You should not have come at night. Nobody comes at night. Nobody leaves at night.',
      "My ward is gone from the door. Take it, then. It doesn't keep me in any more.",
      'When the crows go quiet, run.',
      'The girl in white only wants to show you where it hurts.',
      "I've been standing here since... I can't remember a morning.",
    ];
    hud.say('The Old Man', lines[this.talks % lines.length]);
    this.talks++;
    this.unseen = 0;
  }

  update(dt) {
    const g = this.game;
    const d = this.distToPlayer();
    if (d > 70) return;
    const seen = this.isVisible(40);
    this.rig.head.rotation.y = Math.sin(g.time * 0.4) * 0.15;
    if (seen) {
      this.unseen = 0;
      this.facePlayer(dt, 2);
      if (this.moved && !this.stung) {
        this.stung = true;
        if (d < 22) {
          g.audio.sting(0.45);
          g.player.hitSanity(3);
        }
      }
    } else if (!g.hud.talking) {
      this.unseen += dt;
      if (this.unseen > 2.2 && d > 4 && d < 45) {
        // Pick a spot that's out of view and not right on top of the player.
        const p = g.player.position;
        const options = this.spots
          .map((s, i) => ({ s, i }))
          .filter(({ s, i }) => i !== this.spotIndex && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) > 4);
        if (options.length) {
          const choice = pick(options);
          this.placeAt(choice.i);
          this.facePlayer(1, 100);
          this.moved = true;
          this.stung = false;
          this.unseen = -rand(1, 4);
        }
      }
    }
  }
}

// ======================= LOST GIRL =======================
// Waits at the edge of your light, giggles, runs ahead toward a ward, and vanishes.
export class LostGirl extends Entity {
  constructor(game) {
    super(game, 'girl');
    this.major = true;
    this.height = 1.1;
    this.rig = makeGirl();
    this.group.add(this.rig.root);
    this.target = game.objectives.nearestRemaining(game.player.position);
    this.hops = 0;
    this.fade = 0;
    this.litTime = 0;
    const p = game.player.position;
    const tgt = this.target ? this.target.pos : new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector2(tgt.x - p.x, tgt.z - p.z).normalize();
    const start = this.findSpot(p.x + dir.x * 22, p.z + dir.y * 22);
    this.group.position.set(start.x, getHeight(start.x, start.z), start.z);
    this.next = null;
    this.setState('wait');
    this.giggleTimer = 1.5;
  }

  findSpot(x, z) {
    for (let i = 0; i < 12; i++) {
      const tx = x + rand(-3, 3);
      const tz = z + rand(-3, 3);
      if (!this.game.grid.overlaps(tx, tz, 0.5)) return { x: tx, z: tz };
    }
    return { x, z };
  }

  update(dt) {
    const g = this.game;
    const d = this.distToPlayer();
    const t = g.time;
    this.rig.material.opacity = 0.88 * (1 - this.fade);
    this.rig.head.rotation.z = Math.sin(t * 0.7) * 0.25; // head tilt

    if (d > 55 || this.age > 100) return this.remove();
    if (this.isLit(0.8)) this.litTime += dt;

    this.giggleTimer -= dt;
    if (this.giggleTimer <= 0 && this.state !== 'vanish') {
      this.giggleTimer = rand(5, 9);
      g.audio.giggle(this.center().clone());
    }

    switch (this.state) {
      case 'wait': {
        this.facePlayer(dt, 5);
        if (d < 6 && this.isVisible()) g.player.hitSanity(1.2 * dt);
        if (d < 8 || this.litTime > 1.4) {
          this.hops++;
          const tgt = this.target && !this.target.taken ? this.target.pos : g.player.position;
          const dx = tgt.x - this.pos.x;
          const dz = tgt.z - this.pos.z;
          const len = Math.hypot(dx, dz) || 1;
          if (this.hops > 3 || len < 10) {
            g.audio.giggle(this.center().clone());
            this.setState('vanish');
          } else {
            const step = Math.min(len - 4, rand(13, 18));
            this.next = this.findSpot(this.pos.x + (dx / len) * step, this.pos.z + (dz / len) * step);
            this.litTime = 0;
            this.setState('run');
          }
        }
        break;
      }
      case 'run': {
        const rem = this.moveTowards(this.next.x, this.next.z, 6.5, dt, { collide: false, turnRate: 14 });
        this.pos.y += Math.abs(Math.sin(t * 14)) * 0.05;
        this.rig.L.hip.rotation.x = Math.sin(t * 16) * 0.6;
        this.rig.R.hip.rotation.x = -Math.sin(t * 16) * 0.6;
        if (rem < 0.3) {
          this.rig.L.hip.rotation.x = this.rig.R.hip.rotation.x = 0;
          this.setState('wait');
        }
        break;
      }
      case 'vanish': {
        this.fade += dt / 1.2;
        this.pos.y += dt * 0.2;
        if (this.fade >= 1) this.remove();
        break;
      }
    }
  }
}
