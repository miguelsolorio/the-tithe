import { ITEM_INFO } from '../systems/inventory.js';

// DOM HUD: health, ammo, crosshair, prompt, key items, subtitles, notices, screens.

const $ = (s) => document.querySelector(s);

const ICONS = {
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4M9 9l2 3-2 2M14 8l-1 4 2 3"/>',
  knife: '<path d="M4 20l6-6M10 14l8-10c1 3 0 7-4 10l-3 1z"/><path d="M3 21l2-2"/>',
  fuse: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M8 7h8M8 17h8M12 9v6"/>',
  revolver: '<path d="M3 9h14l2-2h2v4h-5l-1 2h-4l-1 3-3 5H4l2-6-3-1z"/><circle cx="12" cy="11" r="1.5"/>',
  crowbar: '<path d="M5 21L18 5c1-1 3-1 3 1 0 1-1 1-2 1"/><path d="M5 21l-2-1"/>',
  valve: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6M12 14v6M4 12h6M14 12h6"/>',
  shotgun: '<path d="M2 11h14l1-1h5v2H10l-2 3H5l-1 3H2l1-4z"/><path d="M12 12v2"/>',
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('#hud');
    this.healthEl = $('#health');
    this.healthBar = $('#health .bar i');
    this.ammoLabel = $('#ammo .label');
    this.ammoCount = $('#ammo .count');
    this.promptEl = $('#prompt');
    this.subEl = $('#subtitle');
    this.noticeEl = $('#notice');
    this.itemsEl = $('#items');
    this.fpsEl = $('#fps');
    this.crosshair = $('#crosshair');
    this.queue = [];
    this.subTimer = 0;
    this.noticeTimer = 0;
    this.lastPrompt = undefined;
    this.shownItems = [];
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  setHealth(frac) {
    this.healthBar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.healthEl.classList.toggle('low', frac < 0.3);
  }

  setWeapon() {}

  setAmmo(a) {
    if (!a) {
      this.ammoLabel.textContent = '';
      this.ammoCount.innerHTML = '';
      return;
    }
    this.ammoLabel.textContent = a.label;
    this.ammoCount.innerHTML = a.reserve === null || a.reserve === undefined ? `${a.mag}` : `${a.mag} <small>/ ${a.reserve}</small>`;
  }

  setItems(items) {
    const html = items
      .filter((id) => ICONS[id])
      .map((id) => {
        const isNew = !this.shownItems.includes(id);
        return `<div class="item${isNew ? ' new' : ''}" title="${ITEM_INFO[id]?.label || id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg></div>`;
      })
      .join('');
    this.itemsEl.innerHTML = html;
    this.shownItems = [...items];
  }

  setPrompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.promptEl.innerHTML = text ? `<kbd>E</kbd>${escapeHtml(text)}` : '';
  }

  // Subtitle line; queued so scripted lines don't overwrite each other.
  say(text, seconds = 3, { interrupt = false } = {}) {
    if (interrupt) {
      this.queue.length = 0;
      this.subTimer = 0;
    }
    if (this.queue.length && this.queue[this.queue.length - 1].text === text) return;
    if (this.subTimer > 0 && this.current === text) {
      this.subTimer = Math.max(this.subTimer, seconds);
      return;
    }
    this.queue.push({ text, seconds });
  }

  notice(title, sub = '', seconds = 4) {
    this.noticeEl.innerHTML = `${escapeHtml(title)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
    this.noticeEl.classList.add('show');
    this.noticeTimer = seconds;
  }

  hitMarker() {
    this.crosshair.classList.add('hit');
    clearTimeout(this._hm);
    this._hm = setTimeout(() => this.crosshair.classList.remove('hit'), 90);
  }

  clearMessages() {
    this.queue.length = 0;
    this.subTimer = 0;
    this.subEl.classList.remove('show');
    this.noticeEl.classList.remove('show');
    this.noticeTimer = 0;
  }

  update(dt) {
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) {
        this.subEl.classList.remove('show');
        this.current = null;
      }
    } else if (this.queue.length) {
      const q = this.queue.shift();
      this.current = q.text;
      this.subEl.textContent = q.text;
      this.subEl.classList.add('show');
      this.subTimer = q.seconds;
    }
    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.noticeEl.classList.remove('show');
    }
  }

  screen(name) {
    for (const id of ['title', 'pause', 'dead', 'end']) $(`#screen-${id}`).classList.toggle('hidden', id !== name);
  }

  // Boss health bar: boss('The Mother Below', 0.8); boss(null) hides it.
  boss(name, frac = 1) {
    const el = $('#boss');
    if (!name) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.querySelector('.name').textContent = name;
    el.querySelector('.bar i').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  fps(text) {
    this.fpsEl.classList.remove('hidden');
    this.fpsEl.textContent = text;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
