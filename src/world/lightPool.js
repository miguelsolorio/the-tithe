import * as THREE from 'three';

// A fixed set of point lights that get handed to whichever light sources are
// nearest the player. Keeping the light count constant avoids shader recompiles
// and keeps per-pixel lighting cheap, while the whole forest can still have
// dozens of fires, candles and glowing things.

export class LightPool {
  constructor(scene, count = 4) {
    this.lights = [];
    this.sources = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      scene.add(l);
      this.lights.push(l);
    }
    this._tmp = new THREE.Vector3();
  }

  // src: { pos: Vector3 | getPos(): Vector3, color, intensity, distance, flicker (0..1), enabled }
  add(src) {
    src.enabled = src.enabled ?? true;
    src.flicker = src.flicker ?? 0;
    src.seed = Math.random() * 100;
    this.sources.push(src);
    return src;
  }

  remove(src) {
    const i = this.sources.indexOf(src);
    if (i >= 0) this.sources.splice(i, 1);
  }

  update(center, t) {
    const ranked = [];
    for (const s of this.sources) {
      if (!s.enabled || s.intensity <= 0) continue;
      const p = s.getPos ? s.getPos(this._tmp) : s.pos;
      const d = p.distanceToSquared(center);
      if (d < 75 * 75) ranked.push({ s, d, p: p.clone() });
    }
    ranked.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const r = ranked[i];
      if (!r) {
        l.intensity = 0;
        continue;
      }
      const s = r.s;
      const f = s.flicker
        ? 1 -
          s.flicker *
            (0.25 +
              0.25 * Math.sin(t * 13.1 + s.seed) * Math.sin(t * 7.3 + s.seed * 2) +
              0.15 * Math.sin(t * 29.7 + s.seed * 3))
        : 1;
      l.position.copy(r.p);
      l.color.set(s.color);
      l.distance = s.distance;
      l.intensity = s.intensity * f;
    }
  }
}
