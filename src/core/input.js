// Keyboard + mouse with pointer lock. Falls back to click-drag look when the
// browser refuses the lock (e.g. right after the user pressed Esc). Touch
// controls (ui/touch.js) feed the same state through hold(), tap(), look()
// and the analogue stick.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mousePressed = false;
    this.locked = false;
    this.dragging = false;
    this.onLockChange = null;
    this.enabled = true;
    // Virtual keys held by on-screen buttons, and the touch stick (-1..1).
    this.held = new Set();
    this.stick = { f: 0, r: 0 };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.held.clear();
      this.stick.f = this.stick.r = 0;
      this.mouseDown = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
      if (!this.locked) this.dragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      this.dragging = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {});
  }

  requestLock() {
    if (!this.canvas.requestPointerLock || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      // Click-drag look keeps working without the lock.
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) {
    return this.enabled && (this.down.has(code) || this.held.has(code));
  }

  // Touch: hold or release a virtual key, tap one for a single frame, add look.
  hold(code, on) {
    if (on) this.held.add(code);
    else this.held.delete(code);
  }

  tap(code) {
    this.pressed.add(code);
  }

  look(dx, dy) {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  wasPressed(code) {
    return this.enabled && this.pressed.has(code);
  }

  axis() {
    const f = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    const r = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    if (!this.enabled || (f === 0 && r === 0)) return { f: this.enabled ? this.stick.f : 0, r: this.enabled ? this.stick.r : 0 };
    return { f, r };
  }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
  }
}
