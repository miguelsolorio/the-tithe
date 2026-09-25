import { makeRng } from '../core/rng.js';
import { dressLevel } from '../world/ambience/index.js';
import { makeRows, ROOMS, DOORS, plugCorners } from './cistern/layout.js';
import { CisternFX, fogCull, fallGuard } from './cistern/fx.js';
import { buildTunnels } from './cistern/tunnels.js';
import { buildRooms } from './cistern/rooms.js';
import { buildPool } from './cistern/pool.js';
import { buildSluice } from './cistern/sluice.js';
import { buildOssuary } from './cistern/ossuary.js';
import { buildStory } from './cistern/story.js';

// Level 5: the cistern tunnels under the flooded basement, where the cult
// keeps the water still. Vaulted brick tunnels with walkways beside teal
// channels (lampreys wait in them), a pump room, a collapsed flooded stretch,
// the baptism pool where the valve wheel lies, the sluice gate it opens, and
// the ossuary crawlspace that turns to flesh on the way into the caves.
// During the escape the whole place floods (variant 'flood').

export default {
  id: 'cistern',
  name: 'Cistern tunnels',
  subtitle: 'Keep the water still',
  zone: 'drowned',
  variant: (game) => (game.flags.has('escape') ? 'flood' : 'normal'),
  prepare(game) {
    for (const item of ['phone', 'knife', 'revolver', 'crowbar']) game.inventory.addItem(item, { silent: true });
    game.inventory.addAmmo('revolver', 14);
    for (const f of ['stairs.cut', 'power.on', 'took:fuse', 'grate.open']) game.setFlag(f);
  },
  build(L, game) {
    const flood = game.flags.has('escape');
    const rng = makeRng(4242);
    L.env({
      fog: { color: flood ? 0x0a1414 : 0x050b0b, density: flood ? 0.075 : 0.066 },
      ambient: { sky: 0x2c4a46, ground: 0x050707, intensity: 0.34 },
      grade: { color: 0x60c8c0, amount: 0.45 },
      exposure: 1.1,
      music: flood ? 'escape' : 'undertow',
    });
    const rows = makeRows();
    const P = L.plan({ origin: [0, 0], rows, rooms: ROOMS, doors: DOORS });
    plugCorners(L, rows);
    const fx = new CisternFX(L);
    buildTunnels(L, fx, rng);
    const rooms = buildRooms(L, fx, rng, game);
    buildPool(L, fx, rng, game, { flood });
    buildSluice(L, fx, game, { flood });
    buildOssuary(L, fx, rng, game);
    buildStory(L, fx, rng, game, { flood, rooms });
    // Webs where the vaults spring and across the crawlspace, bones and rubble
    // underfoot, rats on the walkways, flies on the hanging meat, a cold mist
    // lying on the water and dust in the torch beam.
    dressLevel(L, P, {
      webs: { vaults: true, ceil: 0.8, floor: 0.35, spiders: 0.3, size: [0.7, 1.4] },
      clutter: {
        o: [['bones', 10], ['rags', 2]],
        S: [['rags', 2], ['bones', 2]],
        D: [['bones', 4], ['rags', 2]],
        B: [['bones', 3]],
        a: [['stubs', 6], ['bones', 3]],
      },
      rats: flood ? null : { rooms: 'SDB', n: 3 },
      moths: ['lantern'],
      flies: flood ? [] : [[49.6, 2.5, 20.8]],
      mist: !flood && { color: 0x1e4a4f, opacity: 0.34, count: 38, radius: 12, size: [2.5, 5], height: [0.05, 0.7], drift: [0.06, 0.03] },
      motes: { color: 0x9ab8b0 },
    });
    fogCull(L, 27);
    fallGuard(L);

    // Down the ladder from the basement grate; back up the same way.
    L.spawn('fromBasement', [13.35, 0, 33.5], -Math.PI / 2);
    L.spawn('start', [13.35, 0, 33.5], -Math.PI / 2);
    L.exit({ pos: [12.55, 1.35, 33.5], radius: 1.8, prompt: 'Climb up', to: 'basement', spawn: 'fromCistern' });
    // Back out of the flesh caves, at the far end of the crawlspace.
    L.spawn('fromCaves', [34.0, 0, 50.0], Math.PI / 2);
  },
};
