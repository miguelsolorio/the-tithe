import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makeProp, PROP_NAMES } from '../world/props/index.js';
import { ITEM_INFO } from '../systems/inventory.js';

// Ammo, bandages and key items lying in the world. Each has a stable id so a
// rebuilt level remembers what was already taken (flag `took:<id>`).

const MODEL = { ammo: 'ammoBox', shells: 'shells', bandage: 'bandage' };
// Key items whose prop has a different name.
const ITEM_MODEL = { valve: 'valveWheel' };
const LABEL = { ammo: 'revolver rounds', shells: 'shotgun shells', bandage: 'bandage' };

export class Pickups {
  constructor(game) {
    this.game = game;
  }

  // spec: { id, kind: 'ammo' | 'shells' | 'bandage' | 'item', item, amount, pos, rotY, onTake(game), glow = true }
  create(L, spec) {
    const g = this.game;
    if (!spec.id) console.warn('[pickups] pickup without id', spec);
    if (spec.id && g.flags.has(`took:${spec.id}`)) return null;
    const pos = Array.isArray(spec.pos) ? new THREE.Vector3(...spec.pos) : spec.pos.clone();
    const name = spec.kind === 'item' ? ITEM_MODEL[spec.item] || spec.item : MODEL[spec.kind];
    const obj = PROP_NAMES.includes(name) ? makeProp(name, spec.args || {}) : fallback(spec.kind);
    // Weapons are authored grip-at-origin pointing -Z; lay them on their side.
    if (spec.kind === 'item' && ['knife', 'revolver', 'shotgun', 'crowbar'].includes(spec.item)) {
      const wrap = new THREE.Group();
      obj.rotation.z = Math.PI / 2;
      wrap.add(obj);
      const b = new THREE.Box3().setFromObject(wrap);
      obj.position.y -= b.min.y;
      obj.position.x -= (b.min.x + b.max.x) / 2;
      obj.position.z -= (b.min.z + b.max.z) / 2;
      wrap.userData = obj.userData;
      L.group.add(wrap);
      wrap.position.copy(pos);
      wrap.rotation.y = spec.rotY ?? 0;
      return this._finish(L, spec, wrap, pos);
    }
    obj.position.copy(pos);
    obj.rotation.y = spec.rotY ?? Math.random() * Math.PI * 2;
    L.group.add(obj);
    return this._finish(L, spec, obj, pos);
  }

  _finish(L, spec, obj, pos) {
    const g = this.game;
    obj.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    // A faint glint so pickups can be found in the dark.
    let glint = null;
    if (spec.glow !== false) {
      glint = makeGlint(spec.kind === 'item' ? 0xffd9a0 : 0xd0c8b8);
      glint.position.copy(pos).add(new THREE.Vector3(0, 0.12, 0));
      L.group.add(glint);
    }
    const lightSources = [];
    for (const l of obj.userData?.lights || []) {
      lightSources.push(L.light({ pos: obj.localToWorld(new THREE.Vector3(...l.offset)), color: l.color, intensity: l.intensity, distance: l.distance, flicker: l.flicker, kind: l.kind }));
    }
    const it = L.interact({
      pos: pos.clone().add(new THREE.Vector3(0, 0.15, 0)),
      radius: 1.7,
      id: spec.id,
      prompt: (game) => this.prompt(spec, game),
      onUse: (game) => {
        if (!this.take(spec, game)) return;
        it.alive = false;
        obj.removeFromParent();
        glint?.removeFromParent();
        for (const s of lightSources) {
          s.enabled = false;
          game.lights.remove(s);
        }
      },
    });
    let t = Math.random() * 10;
    L.onUpdate((dt) => {
      if (!glint || !it.alive) return;
      t += dt;
      glint.material.opacity = 0.25 + 0.2 * Math.sin(t * 2.2);
    });
    return { object: obj, interactable: it };
  }

  prompt(spec, game) {
    if (spec.prompt) return spec.prompt;
    if (spec.kind === 'item') return `Take ${ITEM_INFO[spec.item]?.label?.toLowerCase() || spec.item}`;
    if (spec.kind === 'bandage') return game.player.health >= CONFIG.player.maxHealth ? 'Bandage (not hurt)' : 'Use bandage';
    return `Take ${LABEL[spec.kind]}`;
  }

  take(spec, game) {
    const inv = game.inventory;
    if (spec.kind === 'bandage') {
      if (game.player.health >= CONFIG.player.maxHealth) {
        game.hud.say("You're not hurt.", 1.5);
        return false;
      }
      game.player.heal(spec.amount ?? CONFIG.bandageHeal);
      game.audio.play('bandage');
      game.hud.say('You bind the wound.', 2);
    } else if (spec.kind === 'ammo') {
      inv.addAmmo('revolver', spec.amount ?? CONFIG.ammoPickup.revolver);
      game.audio.play('ammo');
      game.hud.say(`+${spec.amount ?? CONFIG.ammoPickup.revolver} revolver rounds`, 1.8);
    } else if (spec.kind === 'shells') {
      inv.addAmmo('shotgun', spec.amount ?? CONFIG.ammoPickup.shotgun);
      game.audio.play('ammo');
      game.hud.say(`+${spec.amount ?? CONFIG.ammoPickup.shotgun} shotgun shells`, 1.8);
    } else if (spec.kind === 'item') {
      inv.addItem(spec.item);
      if (spec.message) game.hud.say(spec.message, 4);
    }
    if (spec.id) game.setFlag(`took:${spec.id}`);
    spec.onTake?.(game);
    return true;
  }
}

function fallback(kind) {
  const colors = { ammo: 0x8a6a3a, shells: 0x8a1a1a, bandage: 0xd8d0c0, item: 0xc0a060 };
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: colors[kind] ?? 0xffffff, roughness: 0.8 }));
  m.position.y = 0.04;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

let glintTex = null;
function makeGlint(color) {
  if (!glintTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 64, 64);
    glintTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(0.45);
  return s;
}
