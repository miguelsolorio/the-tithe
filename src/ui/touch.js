// On-screen controls for phones and tablets. Left half: a floating stick
// (push to the rim to sprint). Right half: drag to look. Buttons for attack
// (drag it to aim while firing), use, reload, flashlight and pause; tap a
// weapon in the item row to equip it. Everything feeds core/input.js.

const $ = (s) => document.querySelector(s);

const STICK_RADIUS = 56;
const SPRINT_AT = 0.92;
// Touch drags cover fewer pixels than mouse moves for the same turn.
const LOOK_GAIN = 2;

export function isTouchDevice(params) {
  if (params.has('touch')) return true;
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.el = $('#touch');
    this.rotateEl = $('#rotate');
    this.stickEl = $('#touch .stick');
    this.knobEl = $('#touch .stick i');
    this.useEl = $('#touch [data-act="use"]');
    this.stickId = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.lookId = null;
    this.last = new Map();

    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', (e) => this.up(e));
    // Stop iOS from scrolling, zooming or showing callouts under the thumbs.
    for (const ev of ['touchstart', 'touchmove', 'touchend']) this.el.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    // Tap the interaction prompt, or a weapon in the item row.
    $('#prompt').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.tap('KeyE');
    });
    $('#items').addEventListener('pointerdown', (e) => {
      const id = e.target.closest('.item')?.dataset.id;
      if (id && game.state === 'playing') game.weapons.equip(id);
    });

    // The game is played sideways: turning to portrait pauses.
    matchMedia('(orientation: portrait)').addEventListener('change', (e) => {
      if (e.matches) game.pause();
    });
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    this.rotateEl.classList.toggle('hidden', !on);
    if (!on) this.release();
  }

  release() {
    this.stickId = this.lookId = null;
    this.last.clear();
    this.input.stick.f = this.input.stick.r = 0;
    this.input.hold('ShiftLeft', false);
    this.input.mouseDown = false;
    this.stickEl.classList.remove('active');
    this.stickEl.style.left = this.stickEl.style.top = '';
    for (const b of this.el.querySelectorAll('.pressed')) b.classList.remove('pressed');
  }

  down(e) {
    e.preventDefault();
    const btn = e.target.closest('[data-act]');
    this.last.set(e.pointerId, { x: e.clientX, y: e.clientY, act: btn?.dataset.act || null });
    if (btn) {
      btn.classList.add('pressed');
      this.press(btn.dataset.act);
      return;
    }
    if (e.clientX < innerWidth * 0.45 && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.stickEl.classList.add('active');
      this.setStick(0, 0);
    } else if (this.lookId === null) this.lookId = e.pointerId;
  }

  move(e) {
    const prev = this.last.get(e.pointerId);
    if (!prev) return;
    e.preventDefault();
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    if (e.pointerId === this.stickId) this.setStick(e.clientX - this.stickOrigin.x, e.clientY - this.stickOrigin.y);
    // Look with a free thumb, or by sliding off the attack button.
    else if (e.pointerId === this.lookId || prev.act === 'attack') this.input.look(dx * LOOK_GAIN, dy * LOOK_GAIN);
  }

  up(e) {
    const prev = this.last.get(e.pointerId);
    this.last.delete(e.pointerId);
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stickEl.classList.remove('active');
      this.stickEl.style.left = this.stickEl.style.top = '';
      this.setStick(0, 0);
    }
    if (e.pointerId === this.lookId) this.lookId = null;
    if (prev?.act) {
      this.el.querySelector(`[data-act="${prev.act}"]`)?.classList.remove('pressed');
      if (prev.act === 'attack') this.input.mouseDown = false;
    }
  }

  setStick(x, y) {
    const len = Math.hypot(x, y);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.knobEl.style.transform = `translate(${x * k}px, ${y * k}px)`;
    const mag = Math.min(1, len / STICK_RADIUS);
    // Small dead zone, then full range.
    const a = mag < 0.15 ? 0 : (mag - 0.15) / 0.85;
    const s = len ? a / len : 0;
    this.input.stick.r = x * s;
    this.input.stick.f = -y * s;
    const sprint = mag >= SPRINT_AT && -y > Math.abs(x) * 0.5;
    this.input.hold('ShiftLeft', sprint);
    this.stickEl.classList.toggle('sprint', sprint);
  }

  press(act) {
    const input = this.input;
    if (act === 'attack') {
      input.mouseDown = true;
      input.mousePressed = true;
    } else if (act === 'use') input.tap('KeyE');
    else if (act === 'reload') input.tap('KeyR');
    else if (act === 'light') input.tap('KeyF');
    else if (act === 'pause') this.game.pause();
  }

  // Light up the use button while there's something to use.
  update() {
    this.useEl.classList.toggle('ready', !!this.game.interaction.focus && !!this.game.hud.lastPrompt);
  }
}
