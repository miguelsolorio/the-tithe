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
- [x] README demo video: 45 s of short hard-cut clips (phone, cabin door, foyer, dining room, library shelf, chapel, ritual room, bathroom, nursery, attic, laundry, drowned feast, cistern pool, rib gallery, womb), opening on the animated title card (`branding/sigil.html?kind=og&anim`) diving through the seal into the field and closing on it, no final boss (`npm run demo` → `docs/demo/demo.mp4`; the README embeds an uploaded copy that plays inline). Frames stepped offline; audio from a deterministic real-time replay cut per segment against the audio clock (sync check prints gunshot offsets). Movement walks nav-grid paths with eased stick input; `--stills` reports stuck or cut-short scripts

### Audio tweaks
- [x] House interior (ground floor + upstairs): liturgy bed at 22% and world sounds (creaks, chants, enemies) at 35%; both swell to 50% as you near a live enemy (3–12 m), easing back down after (`src/levels/proximityAudio.js`). Chant gains lowered (chapel 0.6→0.3, upstairs loop 0.35→0.2)
- [x] Chanting only near the praying room: chant loops use linear falloff to silence at 7 m (`loops.js`), acolyte chant 0.55→0.3, upstairs chant loop radius 15→7 / gain 0.2→0.12. Liturgy bed drops its steady chant and 9 s bell for a soft bell every 20–40 s plus an occasional creak/thump/low bell every 25–50 s. Music bus 0.55→0.4; house world sounds 25% quiet / 40% near, swelling only within 2–7 m of an enemy
- [x] Liturgy music (drone + choir) hushed to 4% in the house and only swells (to 40%) within 7 m of an enemy; the soft bell and the occasional creak/thump play outside the bed so they're still heard
- [x] Scarier encounters (`CREATURE_SFX` in `audio.js`): creature screams, whispers, attacks and footsteps skip the house hush and play at full level; creaks, chants and the liturgy stay hushed
  - Acolytes and hounds have audible footsteps (`cfg.steps`); acolytes whisper while they wander and hiss prayers while they hunt
  - Spotted up close or in view: screen jolt, shake and a screech sting (8 s cooldown); braam cooldown 22 s → 12 s
  - Fear: as something hunting you closes in (6 m → arm's length) the screen warps, colours split, the vignette tightens and a heartbeat speeds up
  - Getting hit kicks your view away from the attacker; acolyte hits play a wet stab
  - Kill-cam: dying to an acolyte or hound drags your view onto its face as it shrieks, then hard-cuts to black
  - Chapel ambush: a whisper behind you, then it screams in the doorway
- [x] Acolyte is now the crawler (bestiary A5): upright and praying until it hunts you, then it turns its back and folds over backward into a bridge as its spine cracks, and scuttles at you on long arms, head upside down, candle in its teeth, ember eyes, antlers reaching forward like mandibles. Kill-cam: it stands up with its back to you, its upside-down skull at your eye line
- [x] Hound is the ember hound (bestiary H1): ember eyes that flare when it spots you, bone spines that stand up along its back, a jaw that drops wider on notice, claws you hear skitter; notice is a skitter, snarl, roar and jaw snap
- [x] Kill-cam: your flashlight sputters out, so only the creature's own light is left
- [x] Audio mutes while the game's tab is hidden or its window isn't focused (the demo recorder forces it on)
- [x] Lower floors bestiary picks, each with loud encounter sounds and a kill-cam (`cfg.killCut`, `killLight`, `onKillCam`); new sounds in `src/systems/audio/sfx-lower.js`
  - Drowned (D1 eyeshine): milky eyes throw your flashlight back, even through its hair (`Enemy.eyeShine`); water runs from its slack jaw; it stands up in jerks, coughing up water; wading footsteps. Kill-cam: it grabs you and pulls you under (teal, muffled, bubbles)
  - Lamprey (L4 hanging): hangs from the ceiling over its lair on two runs of pipe, drips on you, and drops when you walk underneath; climbs back up when you get away and hunts hand over hand along the ceiling (knocks overhead), then drops again. Where there's no ceiling it lies in the water as before. Kill-cam: it hangs down in front of your face, mouth first
  - Skinless (S4 the mimic): calls for help in your sister's voice; spotted from afar it stands still in the dark and keeps calling until you come within 7 m or light it up, then the voice breaks into a scream as it charges. Wet footsteps, faint eyeshine. The Mother's summoned skinless skip the act. Kill-cam: whispers "help me" face to face, then screams
  - Wall maw (W1 breathing wall): the wall around it swells as it breathes, faster as you approach; a red light in its throat brightens on each breath in; spit between the jaws. Every strike (including the caves' rhythm bites) starts with a gasp and a flare of the throat light. Kill-cam: it gapes in your face, lit red from inside, and shuts
  - Mother (M3 the lullaby): hums a lullaby, head tilted, rocking the cage in her ribs; she stops humming a beat before every attack (0.8 / 0.7 / 0.55 s by phase). Kill-cam: her hand carries you up to her face while she hums
  - Wolves (F2 it stands up): after dark one pair of eyes sits at standing height and rises above your head when your light comes near, then something walks off on two legs; a few times a night a tall figure stands at the edge of your beam for an instant
- [x] Dying under water no longer leaves the sound muffled after a retry

### Mobile
- [x] Touch controls (`src/ui/touch.js`): floating stick with sprint at the rim, drag to look, attack (drag to aim), use, reload, flashlight, pause; tap the prompt to use and a weapon slot to equip; `?touch` forces them on
- [x] Mobile shell: no zoom or callouts, safe-area insets, fullscreen + landscape lock on Begin (where supported), audio unlocked inside the tap, pause when hidden or turned upright, "turn sideways" overlay
- [x] Menus fit a sideways phone (scrollable screens, compact sizes, pause menu side by side); touch control lists and tutorial lines; HUD hidden behind menus on touch
- [x] Phones render at 1× pixel ratio with a 512 px flashlight shadow
- [ ] Play-test on a real iPhone and Android phone (so far tested only in emulated iPhone 13 portrait and landscape)

### Inventory
- [x] Bandages are carried (up to 3, `CONFIG.bandageMax`) instead of used on pickup; press `4` (or tap the slot on touch) to heal 40. Refused at full health or with none left; saved in checkpoints
- [x] Item row split into three groups: weapons numbered 1–3 (fixed slots), consumables from 4 with a count, key items (phone, crowbar, fuse, valve) smaller and unnumbered

### Interactive environment
- [x] Pushable furniture: walking into chairs, crates, barrels and trunks shoves them (they spin when pushed off-centre, scrape, knock into each other); sprinting into a chair or crate, or a hard knife or bullet hit, tips it over with a thud that enemies hear. Enemies shove props too. Nav rebuilds when a prop comes to rest
- [x] Shelves spill: stabbing or shooting a bookshelf knocks books out (knife 2–4, revolver 1–3, shotgun pellets 0–2 each), leaving gaps; they tumble and settle flat on the floor. Storage shelves drop jars (which shatter), boxes and cans
- [x] No draw-call cost at rest: interactive props stay in the static batch, and touching one collapses its vertex range and swaps in the live object (`src/systems/props.js`, `hideRange` in `src/world/batcher.js`, part tags via `Kit.tag`)
- [x] Wear: knife hits leave gouges (and the odd split along the grain), bullets leave splintered holes. The marks are projected decals clipped to the prop's surface and stay on it when it moves (one draw call per damaged prop, `src/systems/propDamage.js`). Each hit sprays splinters and flicks off wood chips, which get bigger as the prop wears down. At `hp` a chair gives way into `chairBroken`, and everything else bursts into planks (`hp`/`breaksInto` in `interactive.js`)

### Analytics
- [x] Google Analytics tag (`G-PDB3DT24E5`) in `index.html`
- [x] Gameplay events (`src/systems/analytics.js`): `game_start`, `level_enter` (with `level_index` for how far players get), `milestone` (story flags, once per run), `enemy_killed` (type, weapon), `item_pickup`, `player_death` (cause), `checkpoint_retry`, `boss_defeated`, `game_complete`, `game_quit`. Dev and `?debug` runs log `[analytics]` to the console instead of sending
- [ ] Register `level_id`, `level_index`, `enemy_type`, `weapon`, `milestone`, `cause`, `item_id` as custom dimensions in GA Admin

### Atmosphere
- [x] Shared ambience kit (`src/world/ambience/`): ground mist and flashlight-lit dust motes, corner cobwebs with spiders, floor debris, rats, moths, flies, crows; `dressLevel()` applies it per level (≤ 3 extra draw calls in view), halved on phones
- [x] Field: wolves howling from the treeline and glowing eyes at night (`field/wolves.js`), crows, night mist; dawn mist
- [x] Every level dressed: webs in all house/basement/cistern rooms (thick in the attic), debris per room, extra boxes and sheet-covered furniture on the ground floor, rats, moths, flies on the dead, teal mist on the water, crimson haze in the caves and heart, wolves heard through the house walls
- [ ] Headphone listen-through: the howl, caw, rat and fly sounds were tuned without listening and may need a mix pass
