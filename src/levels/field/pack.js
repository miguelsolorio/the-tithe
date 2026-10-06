import * as THREE from 'three';

// The pack (dusk field). Walk out toward the edge of the field and the wolves
// stop hiding: a growl in the trees ahead, then two of them (three once it's
// dark) break from the treeline off to either side, where you only catch them
// out of the corner of your eye. They bite until you turn back toward the
// cabin, then lope back to the treeline, stand there watching you go and melt
// into the trees. Go out again and they come again, quicker. The wolves are
// entities/types.js Wolf.
// ctx = { heightAt, getDark, walls } (walls: the invisible boundary, which
// only the wolves can cross).

const B = 88; // the invisible boundary (field.js)
const EDGE = 81; // they come once you're this far out (box distance from the centre; the car is at 81)
const SAFE = 72; // and let you go once you're back inside this
const LEASH = 64; // one that has chased you this far in turns back anyway
const WARN = 1.1; // seconds from the growl to the wolves breaking cover (halved after the first time)
const SEEN = Math.cos(THREE.MathUtils.degToRad(55)); // inside this cone of your view they'd pop in

const cheb = (x, z) => Math.max(Math.abs(x), Math.abs(z));
const KNEE = new THREE.Vector3(0, 0.5, 0);

export function buildPack(L, { heightAt, getDark, walls }) {
  const wolves = [];
  let phase = 'calm';
  let warnT = 0;
  let cool = 0;
  let visits = 0;
  let toldOff = false;
  const fwd = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  // The outward normal and the along-wall axis of the side of the field you're nearest.
  const sideOf = (p) => {
    const onX = Math.abs(p.x) > Math.abs(p.z);
    const n = onX ? new THREE.Vector3(Math.sign(p.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(p.z));
    const t = new THREE.Vector3(-n.z, 0, n.x);
    return { n, t, along: p.x * t.x + p.z * t.z };
  };
  const at = (side, out, u, y = 0) => {
    const v = side.n.clone().multiplyScalar(out).addScaledVector(side.t, THREE.MathUtils.clamp(u, -B - 8, B + 8));
    v.y = heightAt(v.x, v.z) + y;
    return v;
  };

  // Where they break cover: in the trees just past the wall, 8-22 m from you,
  // with a clear run in, and out of your view (or behind trunks) if possible.
  const spots = (g, count) => {
    const p = g.player.position;
    const cam = g.player.camera.position;
    const side = sideOf(p);
    g.player.forward(fwd).setY(0).normalize();
    const ph = L.physics;
    const list = [];
    for (let u = -20; u <= 20; u += 2.5) {
      for (const out of [B + 4, B + 7]) {
        const pos = at(side, out, side.along + u + (Math.random() - 0.5) * 1.5);
        const d = Math.hypot(pos.x - p.x, pos.z - p.z);
        if (d < 8 || d > 22) continue;
        const entry = at(side, B - 1.5, THREE.MathUtils.clamp(side.along + u * 0.6, -B + 2, B - 2));
        if (!ph.lineOfSight(a.copy(pos).add(KNEE), b.copy(entry).add(KNEE))) continue;
        a.subVectors(pos, cam).setY(0).normalize();
        const seen = a.dot(fwd) > SEEN && ph.lineOfSight(cam, b.copy(pos).add(KNEE));
        list.push({ pos, entry, u, d, score: (seen ? 100 : 0) + Math.abs(d - 13) });
      }
    }
    list.sort((x, y) => x.score - y.score);
    const picked = [];
    for (let i = 0; i < count; i++) {
      // Alternate sides of you, a few metres apart.
      const want = i === 0 ? 0 : -Math.sign(picked[0].u) || 1;
      const ok = (c) => !picked.includes(c) && picked.every((q) => q.pos.distanceTo(c.pos) > 5);
      const c = list.find((c) => ok(c) && (!want || Math.sign(c.u) === want)) || list.find(ok);
      if (c) picked.push(c);
    }
    return picked;
  };

  const release = (g) => {
    for (const s of spots(g, getDark() < 0.5 ? 2 : 3)) {
      const w = g.enemies.create(L.level, { type: 'wolf', pos: s.pos, yaw: Math.atan2(s.entry.x - s.pos.x, s.entry.z - s.pos.z), passThrough: walls });
      if (!w) continue;
      w.emerge(s.entry);
      wolves.push(w);
    }
    if (wolves.length) g.enemies.spotted(wolves[0], true);
  };

  // Back to the treeline straight out from where it is, a few seconds' stare, then into the woods.
  const recall = (w) => {
    const side = sideOf(w.pos);
    w.retreat(at(side, B + 1.5, side.along), 3 + Math.random() * 2.5, at(side, B + 12, side.along + (Math.random() - 0.5) * 8));
  };

  L.onUpdate((dt, t, g) => {
    // The ones that made it back to the trees are gone; the dead stay where they fell.
    for (let i = wolves.length - 1; i >= 0; i--) {
      const w = wolves[i];
      if (w.gone) {
        const list = L.level.enemies;
        const k = list.indexOf(w);
        if (k >= 0) list.splice(k, 1);
        w.dispose();
      }
      if (w.gone || w.dead) wolves.splice(i, 1);
    }
    cool -= dt;
    const pl = g.player;
    if (pl.dead || g.state !== 'playing') return;
    const p = pl.position;
    const c = cheb(p.x, p.z);

    if (phase === 'calm') {
      if (c <= EDGE) return;
      // Still loping off: they turn around.
      if (wolves.length) {
        for (const w of wolves) if (w.state === 'retreat' || w.state === 'watch') w.setState('chase');
        phase = 'out';
      } else if (cool <= 0) {
        phase = 'warn';
        warnT = visits ? WARN * 0.5 : WARN;
        const side = sideOf(p);
        g.audio.play('wolfGrowl', { pos: at(side, B + 5, side.along, 0.5), gain: 4 });
        g.audio.play('skitter', { pos: at(side, B + 3, side.along + 4, 0.3), gain: 2 });
      }
    } else if (phase === 'warn') {
      warnT -= dt;
      // Turned back in time.
      if (c < EDGE - 3) {
        phase = 'calm';
        cool = 2;
      } else if (warnT <= 0) {
        release(g);
        visits++;
        phase = wolves.length ? 'out' : 'calm';
      }
    } else if (phase === 'out') {
      if (!wolves.length) {
        phase = 'calm';
        cool = 6;
      } else if (c < SAFE) {
        // Back toward the cabin: they let you go.
        for (const w of wolves) recall(w);
        phase = 'calm';
        cool = 2;
        if (!toldOff) {
          toldOff = true;
          g.hud.say('They stop at the treeline and watch you go.', 4);
        }
      } else {
        for (const w of wolves) if (['chase', 'attack', 'search', 'idle'].includes(w.state) && cheb(w.pos.x, w.pos.z) < LEASH) recall(w);
      }
    }
  });
}
