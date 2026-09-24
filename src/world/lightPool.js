import * as THREE from 'three';

// A fixed set of point lights handed to whichever light sources are nearest
// the player. Keeping the light count constant avoids shader recompiles and
// keeps per-pixel lighting cheap, while a level can still have dozens of
// candles, bulbs and glowing pods. (Ported from dc8b10c.)
//
// Source: { pos: Vector3 | getPos(out): Vector3, color, intensity, distance,
//   flicker (0..1), kind ('candle' | 'bulb' | 'flesh' | 'lantern' | 'screen' | 'flash'),
//   enabled, onFlicker?(f) (sync an emissive mesh to the flicker) }
// 'bulb' flickers as hard on/off cuts, 'flesh' as a slow heartbeat pulse,
// everything else as a candle-like wobble.

export class LightPool {
  constructor(scene, count = 6) {
    this.lights = [];
    this.sources = [];
    this.pulse = 0; // 0..1 heartbeat phase shared by flesh lights
    // Sources use artist units (candle ~1.2, bulb ~2); this converts them to
    // the renderer's physical intensities.
    this.scale = 4.5;
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.7);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this._tmp = new THREE.Vector3();
    this._ranked = [];
  }

  add(src) {
    src.enabled = src.enabled ?? true;
    src.flicker = src.flicker ?? 0;
    src.seed = src.seed ?? Math.random() * 100;
    src.kind = src.kind ?? 'candle';
    src._level = 1;
    src._cut = 0;
    this.sources.push(src);
    return src;
  }

  remove(src) {
    const i = this.sources.indexOf(src);
    if (i >= 0) this.sources.splice(i, 1);
  }

  clear() {
    this.sources.length = 0;
    for (const l of this.lights) l.intensity = 0;
  }

  // Current flicker multiplier for a source (also used to drive emissive meshes).
  level(s, t, dt) {
    if (!s.flicker) return 1;
    if (s.kind === 'bulb') {
      // Mostly on, with bursts of hard cuts.
      s._cut -= dt;
      if (s._cut <= 0) {
        const burst = Math.random() < s.flicker * 0.08;
        s._cut = burst ? 0.04 + Math.random() * 0.12 : 0.05 + Math.random() * 0.3;
        s._level = burst || Math.random() < s.flicker * 0.15 ? Math.random() * 0.15 : 0.85 + Math.random() * 0.15;
      }
      return s._level;
    }
    if (s.kind === 'flesh') return 0.55 + 0.45 * this.pulse * (0.6 + 0.4 * Math.sin(t * 0.7 + s.seed));
    return (
      1 -
      s.flicker *
        (0.25 +
          0.25 * Math.sin(t * 13.1 + s.seed) * Math.sin(t * 7.3 + s.seed * 2) +
          0.15 * Math.sin(t * 29.7 + s.seed * 3))
    );
  }

  update(center, t, dt) {
    const ranked = this._ranked;
    ranked.length = 0;
    for (const s of this.sources) {
      const f = this.level(s, t, dt);
      s.current = f;
      if (s.onFlicker) s.onFlicker(f);
      if (!s.enabled || s.intensity <= 0) continue;
      const p = s.getPos ? s.getPos(this._tmp) : s.pos;
      const d = p.distanceToSquared(center);
      const reach = s.distance + 12;
      if (d < reach * reach) ranked.push({ s, d: d / (s.priority || 1), x: p.x, y: p.y, z: p.z });
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
      l.position.set(r.x, r.y, r.z);
      l.color.set(s.color);
      l.distance = s.distance;
      l.intensity = s.intensity * s.current * this.scale;
    }
  }
}
