// PLACEHOLDER level (replaced by the full build). A single room so teleport works.
export default {
  id: 'upstairs',
  name: 'Upstairs and attic',
  zone: 'cult',
  build(L) {
    L.env({ fog: { color: 0x050404, density: 0.05 }, ambient: { sky: 0x403830, ground: 0x100808, intensity: 0.6 }, grade: { color: 0x5a4a30, amount: 0.35 }, music: 'liturgy' });
    L.plan({
      origin: [-6, -6],
      rows: ['aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa'],
      rooms: { a: { style: 'plain' } },
    });
    L.light({ pos: [0, 2.5, 0], color: 0xe08a2c, intensity: 2, distance: 10, flicker: 0.3, kind: 'candle' });
    L.spawn('start', [0, 0, 4], 0);
  },
};
