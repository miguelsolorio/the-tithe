// DOM overlay: stat bars, ward counter, prompts, dialogue, notices, notes and screens.

const $ = (sel) => document.querySelector(sel);

export class HUD {
  constructor(relicTotal) {
    this.root = $('#hud');
    this.stats = {};
    for (const el of document.querySelectorAll('.stat')) {
      this.stats[el.dataset.stat] = { el, bar: el.querySelector('i') };
    }
    this.relicIcons = $('#relic-icons');
    for (let i = 0; i < relicTotal; i++) this.relicIcons.appendChild(document.createElement('i'));
    this.promptEl = $('#prompt');
    this.noticeEl = $('#notice');
    this.dialogueEl = $('#dialogue');
    this.speakerEl = this.dialogueEl.querySelector('.speaker');
    this.textEl = this.dialogueEl.querySelector('.text');
    this.noteEl = $('#note');
    this.fpsEl = $('#fps');

    this.queue = [];
    this.current = null;
    this.noticeTimer = 0;
    this.noteTimer = 0;
    this.promptText = '';
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  screen(name) {
    for (const id of ['title', 'pause', 'dead', 'win']) {
      document.getElementById(`screen-${id}`).classList.toggle('hidden', id !== name);
    }
  }

  setStats(s) {
    for (const [k, v] of Object.entries(s)) {
      const st = this.stats[k];
      if (!st) continue;
      st.bar.style.transform = `scaleX(${Math.max(0, v) / 100})`;
      st.el.classList.toggle('low', v < 22);
    }
  }

  setRelics(n) {
    [...this.relicIcons.children].forEach((el, i) => el.classList.toggle('got', i < n));
  }

  setPrompt(text) {
    if (text === this.promptText) return;
    this.promptText = text;
    if (text) this.promptEl.innerHTML = `<kbd>E</kbd>${text}`;
    this.promptEl.classList.toggle('show', !!text);
  }

  notice(text, duration = 3.5, red = false) {
    this.noticeEl.textContent = text;
    this.noticeEl.classList.toggle('red', red);
    this.noticeEl.classList.add('show');
    this.noticeTimer = duration;
  }

  // Queue a line of dialogue. Lines play one after another.
  say(speaker, text, duration) {
    this.queue.push({ speaker, text, duration: duration ?? 2.2 + text.length * 0.045 });
    if (!this.current) this._next();
  }

  get talking() {
    return !!this.current;
  }

  skip() {
    if (this.current) this._next();
  }

  clearDialogue() {
    this.queue.length = 0;
    this.current = null;
    this.dialogueEl.classList.remove('show');
  }

  _next() {
    this.current = this.queue.shift() || null;
    if (!this.current) {
      this.dialogueEl.classList.remove('show');
      return;
    }
    this.speakerEl.textContent = this.current.speaker || '';
    this.textEl.textContent = this.current.text;
    this.dialogueEl.classList.add('show');
  }

  note(title, text, duration = 9) {
    this.noteEl.querySelector('.note-title').textContent = title;
    this.noteEl.querySelector('.note-text').textContent = text;
    this.noteEl.classList.add('show');
    this.noteTimer = duration;
  }

  setFPS(text) {
    this.fpsEl.textContent = text;
  }

  update(dt) {
    if (this.current) {
      this.current.duration -= dt;
      if (this.current.duration <= 0) this._next();
    }
    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.noticeEl.classList.remove('show');
    }
    if (this.noteTimer > 0) {
      this.noteTimer -= dt;
      if (this.noteTimer <= 0) this.noteEl.classList.remove('show');
    }
  }
}
