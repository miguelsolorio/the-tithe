# Level API

How levels are built in The Tithe. Reference implementation: `src/levels/ground.js` (house rooms from an ASCII plan, doors, a secret bookshelf, pickups, enemies, scripted moments). `src/levels/field.js` shows outdoor terrain.

## Level module

```js
// src/levels/<id>.js
export default {
  id: 'basement',                 // used by exits, teleport and checkpoints
  name: 'Flooded basement',       // title card on first visit
  subtitle: '',                   // optional small line under the title
  zone: 'drowned',                // 'field' | 'cult' | 'drowned' | 'flesh'
  variant: (game) => (game.flags.has('escape') ? 'flood' : 'normal'), // optional: rebuilt when this changes
  prepare(game) {},               // optional: debug start (?level=<id>) gives what you'd have by now
  build(L, game) {},              // build everything with the builder L
};
```

Levels are built once and cached (per variant). Everything that must survive leaving and coming back or dying is a **flag** (`game.flags` Set, `game.setFlag(name)`): pickups set `took:<id>`, killed enemies with an id set `killed:<id>`, doors with an id set `door:<id>`. Build code reads flags so a rebuilt level matches the story so far. A checkpoint (flags + inventory + health) is saved each time a level is entered; death restarts there.

## Coordinates and scale

Metres, +Y up, -Z is "north". Player: 0.3 m radius, 1.75 m tall, eye 1.62 m, steps up anything ≤ 0.5 m, walks 3.1 m/s, sprints 5.4 m/s. Doors ~1 m wide, 2.2 m tall; ceilings 2.4–3.4 m. Each level has its own coordinate space (no need to line up with other levels). Keep walkable floors from overlapping in XZ inside one level (the nav grid is 2D); put an attic or a lower floor off to the side and connect it with `L.ladder` or an exit.

## Builder `L`

Environment
- `L.env({ fog: { color, density }, ambient: { sky, ground, intensity }, grade: { color, amount }, music, exposure })`. `music`: 'field' | 'liturgy' | 'undertow' | 'viscera' | 'boss' | 'escape' | 'dawn' | null. Grade colours by depth: cult amber `0xffa860`, drowned teal `0x60c8c0`, flesh crimson `0xff4040` (amount 0.3–0.5).

Geometry
- `L.plan({ origin: [x, z], cell: 1, y: 0, rows, rooms, doors, open })`: rooms and corridors from an ASCII plan (see `src/world/plan.js` header). Each char = one 1 m cell; `' '`/`'#'` solid; any other char is a room key. Walls appear on edges between different keys. Room options: `{ style: 'house' | 'brick' | 'stone' | 'flesh' | 'plain', floor, wall, ceil, h, y, wainscot, trim, vault, vaultWidth, noCeil, stairs: { dir: 'n'|'s'|'e'|'w', rise } }`. Doors cut openings: `{ at: [i, j], side: 'n'|'s'|'e'|'w', len, h, leaf, id, locked: (game) => false | 'message', prompt, onOpen, open, material, frame }`. `open: ['ab']` removes the wall between rooms a and b (a hall and its stairs). Returns `P` with `P.x(i)`, `P.z(j)` (cell centres), `P.at(i, j)`, `P.rect(key)`, `P.doors[id]`. Tip: build the rows from rectangles in code (see `makeRows` in ground.js) rather than typing them.
- `L.box(min, max, material, { collide, walkable, visible, worldUV })`, `L.collider(min, max, opts)`, `L.cylinder(x, z, r, y0, y1, material, opts)`, `L.ramp(min, max, axis, dir, material)`, `L.stairs({ x0, z0, x1, z1, fromY, toY, dir, material })`.
- `L.batcher.add(worldSpaceGeometry, material, { worldUV, cast })` for custom static geometry (merged per material).
- `L.mesh(obj, { static, collider: 'box' | 'none' | [{ min, max }] })` for custom objects; keep animated things non-static.
- `L.prop(name, x, z, { y, face: 'n'|'s'|'e'|'w' | rotY, scale, fallen: 'side'|'back'|'front', dynamic, flicker, buzz, collider, args })`: props from `src/world/props` (`PROP_NAMES` lists them; `args` go to the prop builder). Props face +Z by default (`face: 's'`). Wall props sit on the wall surface (walls are 0.2 m thick, centred on the cell edge, so a wall on the line x = 5 has its surface at x = 4.9 / 5.1). Returns the object (`userData.colliders`, `userData.lever`, `userData.slot`, ...).
- `L.decal(kind, pos, { face: 'up'|'down'|'n'|'s'|'e'|'w', size, rot })`: 'bloodSplat' | 'bloodSmear' | 'bloodDrip' | 'bloodPool' | 'sigil' | 'sigilGlow' | 'grime' | 'handprint' | 'footprints' | 'claws'.
- `L.water({ min: [x0, z0], max: [x1, z1], y, color: 'teal'|'deep'|'red'|'black'|'murky', opacity })` returns a Water (`setLevel(y)`, `tintTo(color, seconds)`). Standing in water slows the player by depth; above the eyes they drown.

Lights and sound
- `L.light({ pos, color, intensity, distance, flicker, kind })`. kind 'candle' (wobble), 'bulb' (hard cuts), 'flesh' (heartbeat pulse), 'lantern'. Never create THREE lights: a pool of 6 point lights follows the nearest sources. Intensity ~1–2.5, distance 4–10.
- `L.sound(name, pos, { interval: [min, max], radius, gain })` random one-shots; `L.loopSound(name, pos, { radius, gain })` continuous (e.g. 'dripping', 'waterFlow', 'bulbBuzz', 'fleshBreath', 'chantLoop'). Sound names are in `src/systems/audio.js`.

Gameplay
- `L.spawn(name, [x, y, z], yaw)`: yaw 0 looks toward -Z, π/2 toward -X.
- `L.exit({ min, max } | { pos, radius }, { to, spawn, requires?: (game) => true | 'message', prompt? })`: walk-in trigger (or an E interaction with `prompt`) that loads another level at a spawn. Keep arrival spawns outside exit volumes.
- `L.interact({ pos, radius, prompt: string | (game) => string, onUse(game, it), enabled?: (game) => bool, ignore: [colliders], noLOS })`. Set `it.alive = false` to remove it.
- `L.trigger({ min, max } | { pos, radius }, { once, onEnter(game), onExit(game), onStay(game, dt) })`.
- `L.pickup({ id, kind: 'ammo' | 'shells' | 'bandage' | 'item', item, amount, pos, rotY, prompt, message, onTake(game) })`. Key items: 'phone', 'knife', 'fuse', 'revolver', 'crowbar', 'valve', 'shotgun'. Every pickup needs a unique id.
- `L.enemy(type, [x, y, z], { id, yaw, idle: 'stand' | 'pray' | 'wander' | 'patrol' | 'sniff' | 'dormant' | 'seated', patrol: [[x, z], ...], wanderRadius, wakeRadius, wakeFlag, range, drop: { kind, amount } })`. Types: 'acolyte', 'hound', 'drowned' (dormant under water, rises), 'lamprey' (dormant in water, ambush lunge), 'skinless', 'wallMaw' (yaw = direction out of the wall; origin on the wall surface). Give every enemy a unique id. Runtime spawn: `game.enemies.create(L.level, { type, pos: Vector3, ... })`.
- `L.door({ x, z, y, axis, width, height, locked, id, onOpen })` for doors outside a plan.
- `L.crawl({ min, max, eye: 0.55 })`: low passage, the player crouches.
- `L.ladder({ bottom, top, yawTop, yawBottom, promptUp, promptDown, requires })`: fade-and-move between two points in the same level.
- `L.damageable({ pos, r, health, only: ['shotgun'], resist: 'message', onHit, onDestroy })`: shootable non-enemy (a flesh door).
- `L.flood({ min, max, from, to, seconds })`: rising water for the escape variant.
- `L.onUpdate((dt, t, game) => {})`, `L.onEnter((game, spawnName) => {})`, `L.onExit(fn)`.
- `L.floorAt(x, z)`, `L.rng` (seeded), `L.level` (the Level being built).

Game helpers usable from scripts: `game.hud.say(text, seconds)`, `game.hud.notice(title, sub)`, `game.hud.boss(name, frac)`, `game.audio.play(name, { pos })`, `game.player.lookAt(vec3, seconds)`, `game.player.frozen`, `game.player.shake`, `game.fx.fadeTo(v, speed, color)`, `game.inventory.has/addItem/removeItem`, `game.levels.goTo(id, spawn)`.

## Debug

`?debug` shows FPS/draw calls/position and exposes `window.game`: `teleport(level, spawn?)`, `spawn(type, dist?)`, `give(item | 'all' | 'ammo' | 'shells')`, `god()`, `kill()`, `flag(name)`, plus play-test helpers `place(x, z, lookX, lookZ, pitch)`, `press('KeyE')`, `wait(ms)`, `aimAt(vec3)`. `?debug&level=<id>` starts straight in a level (runs its `prepare`). The debug build keeps ticking when the tab is hidden.

## Budgets

Per level: build < 800 ms, < 250 draw calls in view, < 800k triangles, 10–25 light sources, 6–14 enemies. Revolver rounds 8–14 per level, shells 8–12 once the shotgun exists, 2–3 bandages. The knife never runs out, so a level must always be finishable with the knife alone.
