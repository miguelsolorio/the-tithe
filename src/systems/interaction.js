// Things the player can use with E. Each item:
//   { pos: Vector3 | getPos(): Vector3, radius, prompt: string | () => string, action(), enabled?: () => bool }

export class Interaction {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.current = null;
  }

  add(item) {
    item.radius = item.radius ?? 2;
    this.items.push(item);
    return item;
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    if (this.current === item) this.current = null;
  }

  update() {
    const g = this.game;
    const p = g.player.position;
    let best = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (it.enabled && !it.enabled()) continue;
      const q = it.getPos ? it.getPos() : it.pos;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < it.radius && d < bestD && Math.abs(q.y - p.y) < 3) {
        best = it;
        bestD = d;
      }
    }
    this.current = best;
    const text = best ? (typeof best.prompt === 'function' ? best.prompt() : best.prompt) : '';
    g.hud.setPrompt(g.player.dead ? '' : text);

    if (g.input.wasPressed('KeyE')) {
      if (best) best.action();
      else if (g.hud.talking) g.hud.skip();
    }
  }
}
