import { makeRows, doors, OPEN, ROOMS, ORIGIN, makeCeil } from './caves/layout.js';
import { makeDress, dressOssuary, dressTunnel, dressGallery, dressHall } from './caves/dress.js';
import { dressVeins, dressGauntlet, dressPool, dressWomb, dressReturn } from './caves/dress2.js';
import { scheduler, spawnsAndExits, sphincter, maws, enemies, pickups, hunter, returnMembrane, beats } from './caves/play.js';
import { installBreathing, pulsePods, stutterLights, fogCull } from './caves/fx.js';
import { dressLevel } from '../world/ambience/index.js';

// Level 6: the flesh caves. Past the ossuary crawlspace the stone turns to
// meat: the Mother Below has grown up through the cisterns. A rib gallery
// leads to the sphincter that seals the heart; the way on is west through
// vein-webbed tunnels, a gauntlet of wall maws and a pool of blood to the
// womb, where a dead hunter still holds a shotgun. Taking it wakes the womb
// and tears open a way back. During the escape the caves flood.

export default {
  id: 'caves',
  name: 'Flesh caves',
  subtitle: 'It grew up through the cisterns',
  zone: 'flesh',
  variant: (game) => (game.flags.has('escape') ? 'flood' : 'normal'),
  prepare(game) {
    const inv = game.inventory;
    for (const item of ['phone', 'knife', 'revolver', 'crowbar']) inv.addItem(item, { silent: true });
    inv.addAmmo('revolver', 14);
    for (const f of ['stairs.cut', 'power.on', 'took:fuse', 'grate.open', 'took:valve', 'sluice.open']) game.setFlag(f);
  },
  build(L, game) {
    const flood = game.flags.has('escape');
    L.env({
      fog: { color: 0x1a0305, density: flood ? 0.075 : 0.068 },
      ambient: { sky: 0x6a1a18, ground: 0x1c0505, intensity: 0.42 },
      grade: { color: 0xff4040, amount: 0.45 },
      exposure: 1.1,
      music: flood ? 'escape' : 'viscera',
    });
    const rows = makeRows();
    const P = L.plan({ origin: ORIGIN, rows, rooms: ROOMS, doors: doors(), open: OPEN });
    const ceil = makeCeil(P, rows);
    const after = scheduler(L);

    // Dressing.
    const D = makeDress(L, ceil);
    dressOssuary(L, D);
    dressTunnel(L, D);
    dressGallery(L, D);
    dressHall(L, D);
    dressVeins(L, D);
    dressGauntlet(L, D);
    dressPool(L, D, flood);
    const pods = dressWomb(L, D, game);
    dressReturn(L, D);
    D.finish();

    // Gameplay.
    spawnsAndExits(L, flood);
    sphincter(L, game, flood, after);
    maws(L, after);
    enemies(L, game, flood, after);
    pickups(L);
    const tear = returnMembrane(L, game);
    hunter(L, game, after, pods, tear);
    beats(L, flood);

    // The living tissue.
    installBreathing(L);
    pulsePods(L, pods);
    // Webs only in the stone ossuary and crawl; bones underfoot in the flesh,
    // flies over the dead and the pods, a low crimson haze.
    dressLevel(L, P, {
      webs: { only: 'Ac', vaults: true, ceil: 0.8, floor: 0.4, spiders: 0.35 },
      clutter: {
        A: [['bones', 6], ['rags', 1]],
        c: [['bones', 6]],
        T: [['bones', 4]],
        t: [['bones', 3]],
        V: [['bones', 3]],
        G: [['bones', 3], ['rags', 1]],
      },
      flies: flood ? [] : [[11.95, 0.5, -1.6], [-25.3, 0.7, 23.3], ...pods.slice(0, 4).map((o) => [o.position.x, o.position.y + 1.2, o.position.z])],
      mist: !flood && { color: 0x3a060a, opacity: 0.4, count: 34, radius: 11, size: [2.5, 5], height: [0.05, 0.6], drift: [0.03, 0.05] },
      motes: { color: 0xc89080, base: 0.05 },
    });
    fogCull(L);
    if (flood) {
      L.flood({ min: [ORIGIN[0], ORIGIN[1]], max: [ORIGIN[0] + 51, ORIGIN[1] + 58], from: -0.3, to: 2.35, seconds: 110, color: 0x1c0306 });
      L.loopSound('floodRush', [14.5, 1, -17], { radius: 30, gain: 1 });
      L.loopSound('floodRush', [14.5, 1, 0], { radius: 26, gain: 0.8 });
      stutterLights(L);
    }
  },
};
