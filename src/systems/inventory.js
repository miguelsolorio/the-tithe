import { CONFIG } from '../config.js';

// Key items, weapons and ammo. Serialisable for checkpoints.

export const ITEM_INFO = {
  phone: { label: "Her phone" },
  knife: { label: 'Ritual knife', weapon: 'knife' },
  fuse: { label: 'Fuse' },
  revolver: { label: 'Revolver', weapon: 'revolver' },
  crowbar: { label: 'Crowbar' },
  valve: { label: 'Valve wheel' },
  shotgun: { label: 'Shotgun', weapon: 'shotgun' },
};

export class Inventory {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.items = [];
    this.weapons = [];
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
    this.game.hud.setItems(this.items);
    this.game.weapons.updateHud();
  }

  removeItem(id) {
    const i = this.items.indexOf(id);
    if (i >= 0) this.items.splice(i, 1);
    this.game.hud.setItems(this.items);
  }

  addAmmo(kind, n) {
    this.ammo[kind] += n;
    this.game.weapons.updateHud();
  }

  snapshot() {
    return JSON.parse(JSON.stringify({ items: this.items, weapons: this.weapons, ammo: this.ammo, mag: this.mag }));
  }

  restore(s) {
    this.items = [...s.items];
    this.weapons = [...s.weapons];
    this.ammo = { ...s.ammo };
    this.mag = { ...s.mag };
    this.game.hud.setItems(this.items);
  }
}
