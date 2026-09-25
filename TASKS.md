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
- [x] Upstairs and attic: fuse, revolver, mirror scare, flickering power, hidden shrine, attic ambush (subagent, Opus)
- [x] Flooded basement: wading, the drowned, drowned dining room, crowbar, grate, flood-escape variant (subagent, Opus)
- [x] Integrate, play through, commit (`8acf2ea`)
- Pacing: one agent at a time from here to stay inside the 5-hour usage window

### Milestone 4: cistern and caves
- [x] Cistern tunnels: lampreys, hounds, baptism pool, valve wheel, sluice, ossuary crawlspace, flood variant (subagent, Opus; `5c1b3f7`)
- [x] Flesh caves: skinless, wall maws, the womb, shotgun, sphincter door, flood variant (subagent, Opus; `c3ac5d5`)
- [x] Integrate, load-test, commit

### Milestone 5: boss and ending
- [x] The heart: the Mother Below (lash, slam, spit, summon, three phases), heartbeat tied to her health, cut your sister free (subagent, Opus; `f8d554e`)
- [x] Sister follower, flood variants of the house, dawn field ending
- [x] Full escape run heart → caves → cistern → basement → ground → dawn field (QA pass, scripted playthrough: sister follows, flood rises, exits work, end screen shown)

### HUD
- [x] Health bar bottom centre, weapon and ammo centred above it (`2bca63e`)
- [x] Equipped weapon slot highlighted in the item row (candle border and glow, raised; other slots dimmed)

### Milestone 6: polish
- [x] Full playthrough with no console errors (QA pass: field → ground → upstairs → basement → cistern → caves → heart → escape → dawn ending, title/pause/death/end screens); no bugs found in src/**
- [x] Performance: every level measured by its builder (≈60–260 draw calls in view, warm builds under 800 ms, far plane follows the fog, far enemies sleep); balance: 8–14 revolver rounds and 2–3 bandages per level, knife-only is always possible, the boss takes double knife damage
- [x] README with controls, debug commands and defaults
- [x] Doors: fixed doors in east/west walls rendering inside the wall; real doors on every regular doorway (`5d672a0`)
- [x] Field start: real forest ring with the cabin's trees, a realistic car (`a83e8a2`)

### Branding
- [x] Five icon + social image directions; picked **Sigil** (blood-red seal, IM Fell English type), the other four removed
- [x] Wired in: SVG favicon + `favicon.ico`, apple-touch-icon, manifest icons (with maskable), `og:` / `twitter:` tags in `index.html` (source `branding/sigil.html`, `node branding/render.mjs`)
- [x] README: hero image, play link, six in-game screenshots (`node branding/render.mjs shots`)

### Audio tweaks
- [x] House interior (ground floor + upstairs): liturgy bed at 22% and world sounds (creaks, chants, enemies) at 35%; both swell to 50% as you near a live enemy (3–12 m), easing back down after (`src/levels/proximityAudio.js`). Chant gains lowered (chapel 0.6→0.3, upstairs loop 0.35→0.2)
- [x] Chanting only near the praying room: chant loops use linear falloff to silence at 7 m (`loops.js`), acolyte chant 0.55→0.3, upstairs chant loop radius 15→7 / gain 0.2→0.12. Liturgy bed drops its steady chant and 9 s bell for a soft bell every 20–40 s plus an occasional creak/thump/low bell every 25–50 s. Music bus 0.55→0.4; house world sounds 25% quiet / 40% near, swelling only within 2–7 m of an enemy
- [x] Liturgy music (drone + choir) hushed to 4% in the house and only swells (to 40%) within 7 m of an enemy; the soft bell and the occasional creak/thump play outside the bed so they're still heard

### Mobile
- [x] Touch controls (`src/ui/touch.js`): floating stick with sprint at the rim, drag to look, attack (drag to aim), use, reload, flashlight, pause; tap the prompt to use and a weapon slot to equip; `?touch` forces them on
- [x] Mobile shell: no zoom or callouts, safe-area insets, fullscreen + landscape lock on Begin (where supported), audio unlocked inside the tap, pause when hidden or turned upright, "turn sideways" overlay
- [x] Menus fit a sideways phone (scrollable screens, compact sizes, pause menu side by side); touch control lists and tutorial lines; HUD hidden behind menus on touch
- [x] Phones render at 1× pixel ratio with a 512 px flashlight shadow
- [ ] Play-test on a real iPhone and Android phone (so far tested only in emulated iPhone 13 portrait and landscape)

### Interactive environment
- [x] Pushable furniture: walking into chairs, crates, barrels and trunks shoves them (they spin when pushed off-centre, scrape, knock into each other); sprinting into a chair or crate, or a hard knife or bullet hit, tips it over with a thud that enemies hear. Enemies shove props too. Nav rebuilds when a prop comes to rest
- [x] Shelves spill: stabbing or shooting a bookshelf knocks books out (knife 2–4, revolver 1–3, shotgun pellets 0–2 each), leaving gaps; they tumble and settle flat on the floor. Storage shelves drop jars (which shatter), boxes and cans
- [x] No draw-call cost at rest: interactive props stay in the static batch, and touching one collapses its vertex range and swaps in the live object (`src/systems/props.js`, `hideRange` in `src/world/batcher.js`, part tags via `Kit.tag`)
- [x] Wear: knife hits leave gouges (and the odd split along the grain), bullets leave splintered holes. The marks are projected decals clipped to the prop's surface and stay on it when it moves (one draw call per damaged prop, `src/systems/propDamage.js`). Each hit sprays splinters and flicks off wood chips, which get bigger as the prop wears down. At `hp` a chair gives way into `chairBroken`, and everything else bursts into planks (`hp`/`breaksInto` in `interactive.js`)

### Analytics
- [x] Google Analytics tag (`G-PDB3DT24E5`) in `index.html`
- [x] Gameplay events (`src/systems/analytics.js`): `game_start`, `level_enter` (with `level_index` for how far players get), `milestone` (story flags, once per run), `enemy_killed` (type, weapon), `item_pickup`, `player_death` (cause), `checkpoint_retry`, `boss_defeated`, `game_complete`, `game_quit`. Dev and `?debug` runs log `[analytics]` to the console instead of sending
- [ ] Register `level_id`, `level_index`, `enemy_type`, `weapon`, `milestone`, `cause`, `item_id` as custom dimensions in GA Admin
