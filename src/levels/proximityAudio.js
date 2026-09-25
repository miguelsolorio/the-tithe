// Inside the house the liturgy and the house's own sounds (creaks, chants,
// enemies) stay low and swell as you near anything alive, so the audio warns
// you first. Levels spread HUSHED into L.env() and call hushUntilNear(L).
export const MUSIC_QUIET = 0.22;
export const SFX_QUIET = 0.35;
// Level right next to an enemy; the swell tops out here, not at full.
const LOUD = 0.5;
export const HUSHED = { musicLevel: MUSIC_QUIET, sfxLevel: SFX_QUIET };

const NEAR = 3;
const FAR = 12;

export function hushUntilNear(L) {
  let level = 0;
  L.onEnter(() => { level = 0; });
  L.onUpdate((dt, t, g) => {
    const p = g.player.position;
    let best = Infinity;
    for (const e of g.enemies.list) {
      if (e.dead || Math.abs(e.pos.y - p.y) > 2.5) continue;
      best = Math.min(best, Math.hypot(e.pos.x - p.x, e.pos.z - p.z));
    }
    const k = Math.max(0, Math.min(1, (FAR - best) / (FAR - NEAR)));
    const target = k * k * (3 - 2 * k);
    // Swell reasonably quickly, ease back down slowly.
    level += (target - level) * Math.min(1, dt * (target > level ? 1.2 : 0.35));
    g.audio.setZoneLevel(MUSIC_QUIET + (LOUD - MUSIC_QUIET) * level, 0.2);
    g.audio.setWorldLevel(SFX_QUIET + (LOUD - SFX_QUIET) * level, 0.2);
  });
}
