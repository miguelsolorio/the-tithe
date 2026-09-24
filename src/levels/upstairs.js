import { makeCtx } from './upstairs/common.js';
import { buildPlan, ritualDoors, dressHall, dressLanding } from './upstairs/house.js';
import { buildHatch } from './upstairs/hatch.js';
import { bedroom, bathroom, nursery, sickroom } from './upstairs/rooms.js';
import { ritualRoom, storage, robingRoom, closetAndShrine } from './upstairs/rooms2.js';
import { buildAttic } from './upstairs/attic.js';
import { setupEvents } from './upstairs/events.js';
import { regionCulling, mergeDoor } from './upstairs/culling.js';

// Level 3: upstairs and the attic. The top of the grand stairs opens onto a
// long hallway where the bulbs are dying. Behind double doors the cult prays
// in its ritual room; the master bedroom holds a dead man, a mirror and the
// revolver; taking the revolver brings someone down from the attic. Up the
// hatch ladder, in the acolytes' nest under the eaves, is the fuse that powers
// the basement door downstairs. Taking it springs an ambush.

export default {
  id: 'upstairs',
  name: 'Upstairs and attic',
  subtitle: 'The power is failing',
  zone: 'cult',
  prepare(game) {
    game.inventory.addItem('phone', { silent: true });
    game.inventory.addItem('knife', { silent: true });
    game.setFlag('stairs.cut');
  },
  build(L, game) {
    L.env({
      fog: { color: 0x080504, density: 0.07 },
      ambient: { sky: 0x362a22, ground: 0x0c0706, intensity: 0.3 },
      grade: { color: 0xffa860, amount: 0.35 },
      exposure: 1.05,
      music: 'liturgy',
    });
    const P = buildPlan(L);
    const U = makeCtx(L, game, P);

    // Arrive at the top of the grand stairs, facing the ritual room doors; a
    // few steps down behind you lead back to the ground floor.
    L.spawn('fromGround', [0.25, 0, 1.0], 0);
    L.spawn('start', [0.25, 0, 1.0], 0);
    L.exit({ min: [-1.25, -3.2, 5.2], max: [1.75, 0.6, 9.2], to: 'ground', spawn: 'fromUpstairs' });

    let events = null;
    for (const d of [...ritualDoors(U), ...Object.values(P.doors)]) mergeDoor(d);
    const bulbs = dressHall(U);
    dressLanding(U);
    const hatch = buildHatch(U);
    bedroom(U, (g) => events?.onRevolver(g));
    bathroom(U);
    nursery(U);
    sickroom(U);
    ritualRoom(U);
    storage(U);
    robingRoom(U);
    closetAndShrine(U);
    const attic = buildAttic(U);
    events = setupEvents(U, { bulbs, hatch, attic });
    regionCulling(L, U.cull);
  },
};
