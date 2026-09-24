import * as THREE from 'three';

// Picks the interactable the player is looking at (or standing next to) and
// shows its prompt; E uses it.

const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _pt = new THREE.Vector3();

export class Interaction {
  constructor(game) {
    this.game = game;
    this.focus = null;
  }

  update() {
    const g = this.game;
    const level = g.levels.current;
    if (!level || g.player.dead || g.player.frozen || g.state !== 'playing') {
      this.focus = null;
      g.hud.setPrompt(null);
      return;
    }
    const eye = g.camera.position;
    g.camera.getWorldDirection(_fwd);
    let best = null;
    let bestScore = -Infinity;
    for (const it of level.interactables) {
      if (!it.alive) continue;
      if (it.enabled && !it.enabled(g)) continue;
      _to.subVectors(it.pos, eye);
      const d = _to.length();
      if (d > it.radius + 0.4) continue;
      _to.divideScalar(d || 1);
      const dot = _to.dot(_fwd);
      // Close things count even at the edge of view; far ones need to be looked at.
      const need = d < 0.9 ? -0.2 : d < 1.6 ? 0.55 : 0.8;
      if (dot < need) continue;
      if (!it.noLOS && d > 0.6) {
        // Aim a little short of the target so things resting on or in a prop still count.
        _pt.copy(it.pos).addScaledVector(_to, -Math.min(0.3, d * 0.3));
        if (!level.physics.lineOfSight(eye, _pt, (c) => c.solid && !c.seeThrough && !(it.ignore && it.ignore.includes(c)))) continue;
      }
      const score = dot * 2 - d * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.focus = best;
    const text = best ? (typeof best.prompt === 'function' ? best.prompt(g) : best.prompt) : null;
    g.hud.setPrompt(text || null);
    if (best && text && g.input.wasPressed('KeyE')) best.onUse(g, best);
  }
}
