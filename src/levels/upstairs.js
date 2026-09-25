import { makeCtx } from './upstairs/common.js';
import { HUSHED, hushUntilNear } from './proximityAudio.js';
import { buildPlan, ritualDoors, dressHall, dressLanding } from './upstairs/house.js';
import { buildHatch } from './upstairs/hatch.js';
import { bedroom, bathroom, nursery, sickroom } from './upstairs/rooms.js';
import { ritualRoom, storage, robingRoom, closetAndShrine } from './upstairs/rooms2.js';
import { buildAttic } from './upstairs/attic.js';
import { setupEvents } from './upstairs/events.js';
import { regionCulling, mergeDoor } from './upstairs/culling.js';
import { ATTIC } from './upstairs/common.js';
import { dressLevel, distantHowls } from '../world/ambience/index.js';

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
      ...HUSHED,
    });
    hushUntilNear(L);
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
    decay(L, P);
    regionCulling(L, U.cull);
  },
};

// Neglect: webs everywhere (thickest in the attic), papers and rags on the
// floors, rats, moths at the dying bulbs, flies on the dead man in the
// bedroom, dust in the torch beam and wolves heard through the walls.
function decay(L, P) {
  const A = ATTIC;
  const yR = A.y + A.ridge;
  const roofY = (z) => yR - ((A.ridge - A.eave) * Math.abs(z)) / A.z;
  const spans = [];
  // Sheets from the ridge down to the roof slope, and between the knee walls.
  for (let x = A.x0 + 1.5; x < A.x1 - 1; x += L.rng.range(1.8, 3.2)) {
    const s = L.rng() < 0.5 ? 1 : -1;
    const z = s * L.rng.range(1.5, 3);
    spans.push([[x, yR - 0.08, 0], [x + L.rng.range(0.3, 0.9), roofY(z) - 0.05, z]]);
  }
  dressLevel(L, P, {
    webs: { ceil: 0.85, floor: 0.4, spiders: 0.3 },
    spans,
    clutter: {
      H: [['paper', 4], ['plaster', 4]],
      M: [['glass', 3], ['rags', 2]],
      N: [['plaster', 3], ['rags', 2]],
      Q: [['paper', 8], ['rags', 3], ['glass', 2]],
      S: [['paper', 5], ['books', 4], ['plaster', 3]],
      W: [['rags', 4], ['stubs', 4]],
      R: [['stubs', 10, 1.4], ['bones', 3]],
      X: [['stubs', 6], ['bones', 4]],
      B: [['glass', 3]],
    },
    rats: { rooms: 'HSQN', n: 3, spots: [[A.x0 + 3, A.y, -A.z + 1.6], [A.x1 - 6, A.y, A.z - 1.4]] },
    moths: ['bulb'],
    flies: [[-16.4, 1.0, -6.1]],
    motes: { color: 0xd8ccb0 },
    // The attic's gable ends, low where the roof meets the floor, and up at the ridge.
    nooks: [
      [[A.x0 + 0.1, A.y + 0.01, -A.z + 0.3], [0, 0, 1], [1, 0, 0], 1, 1.1],
      [[A.x0 + 0.1, A.y + 0.01, A.z - 0.3], [0, 0, -1], [1, 0, 0], 1, 1.0],
      [[A.x1 - 0.1, A.y + 0.01, -A.z + 0.3], [0, 0, 1], [-1, 0, 0], 1, 1.2],
      [[A.x1 - 0.1, A.y + 0.01, A.z - 0.3], [0, 0, -1], [-1, 0, 0], 1, 0.9],
      [[A.x0 + 0.1, yR - 0.1, 0], [0, -0.5, 0.87], [1, 0, 0], -1, 1.1],
      [[A.x1 - 0.1, yR - 0.1, 0], [0, -0.5, -0.87], [-1, 0, 0], -1, 1.1],
    ],
  });
  distantHowls(L);
}
