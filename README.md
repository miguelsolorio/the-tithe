# Hollow Pines

A third-person horror game set in a dark forest, built with Three.js and Vite. Every model, texture and sound is generated in code; there are no asset files.

```bash
npm install
npm run dev
```

## How to play

Your car has died at the edge of the forest. Find the five wards (at the cabin, the graveyard, the well, the standing stones and the hanging tree) to open the gate in the north, then walk through it.

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint |
| Mouse | Look and aim the flashlight (click to lock the pointer; drag also works) |
| F | Flashlight on/off |
| E | Talk, pick up, skip dialogue |
| Esc | Pause |

- **Health** goes down when wolves or the wendigo hit you.
- **Sanity** drains in the dark, near ghosts and while you look at the Stalker. It comes back at the campfire.
- **Battery** drains while the light is on. Batteries are scattered along the trails.
- **Stamina** runs down while you sprint.

**What's in the forest:**
- **People:** the Hiker at the campfire, the Hermit at the cabin, and a lost girl in white.
- **Animals:** crows, owls, wolf packs, and a deer that is wrong.
- **Ghosts:** wraiths and the Weeping Woman.
- **Monsters:** the Stalker, and a wendigo that hunts by light and sound.

## Development

Add `?debug` to the URL to show an FPS counter and expose `window.game` in the console:

```js
game.teleport('graveyard'); // any key of LANDMARKS in src/config.js
game.spawn('wendigo'); // wolves, deer, wraith, weeper, girl, wendigo, shadow, stalker
game.giveRelics(5);
game.setStat('sanity', 20);
game.god = true;
game.advance(10); // run the simulation forward 10 s
```

All tunables live in `src/config.js`. `src/entities/director.js` decides when and where encounters happen.
