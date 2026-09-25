import { Webs } from './webs.js';
import { scatter } from './clutter.js';
import { groundMist, dustMotes } from './mist.js';
import { rats, moths, flies } from './critters.js';

export { Webs, scatter, groundMist, dustMotes, rats, moths, flies };
export { crows } from './critters.js';

// One call at the end of a level's build() to make it feel lived-in (and
// died-in). Everything is optional:
//   dressLevel(L, P, {
//     webs: { skip: 'CG', ceil: 0.7 },            // Webs.fromPlan options, or false
//     clutter: { K: ['paper', 6], D: [['glass', 4], ['rags', 2]] },  // per room key
//     rats: { rooms: 'KDs', n: 3 },               // spots along walls of these rooms
//     moths: ['bulb', 'lantern'],                 // light kinds that get moths
//     flies: [[x, y, z], ...],
//     mist: { color, opacity, ... } | false,
//     motes: { color, ... } | false,
//   })
// Run it last so the level's own seeded layout isn't shifted.
export function dressLevel(L, P, cfg = {}) {
  const out = {};
  if (cfg.webs !== false) {
    const W = new Webs(L, cfg.webs?.spiders !== undefined ? { spiders: cfg.webs.spiders } : {});
    if (P) W.fromPlan(P, cfg.webs || {});
    for (const [a, b] of cfg.spans || []) W.span(a, b);
    for (const c of cfg.corners || []) W.corner(...c);
    for (const n of cfg.nooks || []) W.nook(...n);
    W.flush();
    out.webs = W;
  }
  for (const [key, list] of Object.entries(cfg.clutter || {})) {
    const items = typeof list[0] === 'string' ? [list] : list;
    for (const q of P.rects[key] || []) {
      const room = P.rooms[key];
      const area = (q.x1 - q.x0) * (q.z1 - q.z0);
      for (const [kind, n, edge = 0.9] of items) scatter(L, { ...q, y: room.y + Math.min(0, room.stairs?.rise ?? 0) }, kind, Math.max(1, Math.round((n * area) / 20)), { edge });
    }
  }
  if (cfg.rats) {
    const spots = [];
    const keys = cfg.rats.rooms;
    const cand = Object.entries(P.rects).filter(([k]) => keys.includes(k) && !P.rooms[k]?.stairs);
    for (let i = 0; i < (cfg.rats.n ?? 3) && cand.length; i++) {
      const [k, list] = cand[L.rng.int(0, cand.length - 1)];
      const q = L.rng.pick(list);
      const alongX = L.rng() < 0.5;
      const x = alongX ? L.rng.range(q.x0 + 0.5, q.x1 - 0.5) : L.rng() < 0.5 ? q.x0 + 0.3 : q.x1 - 0.3;
      const z = alongX ? (L.rng() < 0.5 ? q.z0 + 0.3 : q.z1 - 0.3) : L.rng.range(q.z0 + 0.5, q.z1 - 0.5);
      spots.push([x, P.rooms[k].y, z]);
    }
    out.rats = rats(L, spots.concat(cfg.rats.spots || []));
  }
  if (cfg.moths) {
    const kinds = cfg.moths;
    const seen = [];
    for (const s of L.level.lightSources) {
      if (!kinds.includes(s.kind) || s.getPos) continue;
      if (seen.some((p) => p.distanceToSquared(s.pos) < 4)) continue;
      seen.push(s.pos);
    }
    out.moths = moths(L, seen.map((p) => [p.x, p.y, p.z]));
  }
  if (cfg.flies?.length) out.flies = flies(L, cfg.flies);
  if (cfg.mist) out.mist = groundMist(L, cfg.mist);
  if (cfg.motes) out.motes = dustMotes(L, cfg.motes);
  return out;
}

// Wolves heard now and then through the walls (house levels). Routed to the
// music bus so a hushed world bus doesn't bury them.
export function distantHowls(L, every = [55, 120]) {
  let wait = every[0] * 0.5 + Math.random() * every[0];
  L.onUpdate((dt, t, g) => {
    wait -= dt;
    if (wait > 0) return;
    wait = every[0] + Math.random() * (every[1] - every[0]);
    g.audio.play('howlDistant', { music: true, gain: 1.6 });
  });
}
