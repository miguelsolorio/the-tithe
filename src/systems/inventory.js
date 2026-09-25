import { CONFIG } from '../config.js';

// Key items, weapons, consumables and ammo. Serialisable for checkpoints.
// Number keys: weapons hold fixed slots 1–3, consumables start at 4.

export const ITEM_INFO = {
  phone: { label: "Her phone" },
  knife: { label: 'Ritual knife', weapon: 'knife', slot: 1 },
  fuse: { label: 'Fuse' },
  revolver: { label: 'Revolver', weapon: 'revolver', slot: 2 },
  crowbar: { label: 'Crowbar' },
  valve: { label: 'Valve wheel' },
  shotgun: { label: 'Shotgun', weapon: 'shotgun', slot: 3 },
};

// Carried in stacks and used up with their number key.
export const CONSUMABLES = {
  bandage: { label: 'Bandage', slot: 4, max: CONFIG.bandageMax },
};

export class Inventory {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.items = [];
    this.weapons = [];
    this.consumables = { bandage: 0 };
    this.ammo = { revolver: 0, shotgun: 0 };
    this.mag = { revolver: 0, shotgun: 0 };
  }

  has(id) {
    return this.items.includes(id);
  }

  addItem(id, { silent = false } = {}) {
    if (this.items.includes(id)) return;
    this.items.push(id);
    this.game.analytics?.itemPickup(id);
    const info = ITEM_INFO[id];
    if (info?.weapon && !this.weapons.includes(info.weapon)) {
      this.weapons.push(info.weapon);
      if (info.weapon === 'revolver') this.mag.revolver = CONFIG.weapons.revolver.mag;
      if (info.weapon === 'shotgun') this.mag.shotgun = CONFIG.weapons.shotgun.mag;
      this.game.weapons.equip(info.weapon);
    }
    if (!silent) this.game.audio.play('keyItem');
    this.refreshHud();
    this.game.weapons.updateHud();
  }

  removeItem(id) {
    const i = this.items.indexOf(id);
    if (i >= 0) this.items.splice(i, 1);
    this.refreshHud();
  }

  addAmmo(kind, n) {
    this.ammo[kind] += n;
    this.game.weapons.updateHud();
  }

  count(id) {
    return this.consumables[id] || 0;
  }

  // False when already carrying the most you can.
  addConsumable(id, n = 1) {
    const max = CONSUMABLES[id].max;
    if (this.count(id) >= max) return false;
    this.consumables[id] = Math.min(max, this.count(id) + n);
    this.refreshHud();
    return true;
  }

  useConsumable(id) {
    const g = this.game;
    if (id !== 'bandage') return false;
    if (!this.count(id)) {
      g.hud.say('No bandages.', 1.5);
      return false;
    }
    if (g.player.health >= CONFIG.player.maxHealth) {
      g.hud.say("You're not hurt.", 1.5);
      return false;
    }
    this.consumables[id]--;
    g.player.heal(CONFIG.bandageHeal);
    g.audio.play('bandage');
    g.hud.say('You bind the wound.', 2);
    this.refreshHud();
    return true;
  }

  update() {
    const g = this.game;
    if (g.state !== 'playing' || g.player.dead || g.player.frozen) return;
    for (const [id, c] of Object.entries(CONSUMABLES)) if (g.input.wasPressed(`Digit${c.slot}`)) this.useConsumable(id);
  }

  refreshHud() {
    this.game.hud.setInventory(this);
  }

  snapshot() {
    return JSON.parse(JSON.stringify({ items: this.items, weapons: this.weapons, consumables: this.consumables, ammo: this.ammo, mag: this.mag }));
  }

  restore(s) {
    this.items = [...s.items];
    this.weapons = [...s.weapons];
    this.consumables = { bandage: 0, ...s.consumables };
    this.ammo = { ...s.ammo };
    this.mag = { ...s.mag };
    this.refreshHud();
  }
}
