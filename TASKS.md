# The Tithe: tasks

Legend: `[ ]` to do · `[~]` in progress · `[x]` done

## Done: lock the visual and audio direction

- [x] Visual and audio direction docs, audio audition page, project memory

## Build: playable game, field to dawn

### Milestone 1: basic setup
- [x] Vite + Three.js project, `.claude/launch.json` (port 5199; `the-tithe-stable` on 5299 without hot reload)
- [x] Engine core: input, physics (boxes, cylinders, ramps, heightfields, stairs, raycasts), nav grid + A*, level manager with checkpoints and variants
- [x] Level builder: ASCII room plans (house / brick / stone / flesh styles), doors, props, decals, water, triggers, exits, ladders, crawlspaces, flood, static batching
- [x] First-person controller: WASD, mouse look, sprint, flashlight, head bob, wading, drowning
- [x] HUD (health, ammo, crosshair, prompt, key items, boss bar) and title / pause / death / ending screens
- [x] Post-processing (grain, vignette, damage tint, zone grading) and light pool (ported from dc8b10c)
- [x] Weapons framework (knife, revolver, shotgun, reload, ammo, hit detection), pickups, inventory
- [x] Enemy AI base (idle, notice, chase, attack, hurt, die) + acolyte, hound, drowned, lamprey, skinless, wall maw behaviours
- [x] Debug mode (`?debug`): FPS, teleport, spawn, give, god, kill, play-test helpers
- [x] Audio engine: port every recipe and loop from `prototypes/audio-sets.html` (subagent, Sonnet; relaunched after an output-limit failure)
- [x] Procedural textures and material palette: colour, normal and roughness maps for 30 materials and 10 decals, ~1.5 s, prewarmed on the title screen (subagent, Opus)
- [x] Creature models and procedural animation: acolyte, hound, drowned, lamprey, skinless, wall maw, the Mother Below, the sister (subagent, Opus)
- [x] Props: 52 house furniture and cult props (subagent, Opus)
- [x] Props: 38 depths props, 14 key items / pickups / weapons / first-person arms (subagent, Opus)
- [x] Commit milestones 1–2 (`156a4dd`)

### Milestone 2: field and ground floor playable
- [x] Field at dusk: sky darkens with time and as you near the cabin, the sister's phone rings in the grass, the door opens by itself
- [x] Abandoned, falling-apart cabin with candlelight inside, surrounded by trees and branches (subagent, Opus; requested mid-build; `1c71258`)
- [x] Ground floor: 40 × 25 m interior behind a 6 × 5 m cabin; knife in a blood chapel behind the library bookshelf; rope barricade on the stairs; secret study panel; fuse box and powered basement door
- [x] Knife combat, acolytes, pickups, knocked-over furniture, blood, flickering bulbs
- [x] Play-through with final textures, props, models and audio (chapel, knife fight, ropes, stairs, death and retry)

### Milestone 3: upstairs and basement
- [~] Upstairs and attic: fuse, revolver, mirror scare, flickering power (subagent, Opus)
- [~] Flooded basement: wading, the drowned, drowned dining room, crowbar, grate (subagent, Opus)
- [ ] Integrate, play through, commit

### Milestone 4: cistern and caves
- [~] Cistern tunnels: lampreys, hounds, baptism pool, valve wheel, sluice, ossuary crawlspace (subagent, Opus)
- [~] Flesh caves: skinless, wall maws, the womb, shotgun, sphincter door (subagent, Opus)
- [ ] Integrate, play through, commit

### Milestone 5: boss and ending
- [~] The heart: the Mother Below (lash, spit, summon, slam), heartbeat tied to her health (subagent, Opus)
- [x] Sister follower, flood variants of the house, dawn field ending
- [ ] Full escape run, commit

### Milestone 6: polish
- [ ] Balance and performance pass, full playthrough with no console errors
- [ ] README with controls, debug commands and defaults
