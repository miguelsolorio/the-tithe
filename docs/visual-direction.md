# The Tithe — visual direction

## Overview

**The Tithe** (working title) is a first-person horror game.

Your sister has been missing for a year when her phone pings from a field. At dusk you enter a small cabin that turns out to be impossibly large inside. A cult drowned the lower house to keep a demon, the Mother Below, asleep, and her flesh has grown up through the cisterns ever since. Your sister is this year's tithe — caged inside the demon's ribs.

## Goal and ending

Descend through the house, kill the Mother Below, cut your sister free, and escape upward as the house floods, exiting into the field at dawn.

## Levels

Play order, each with its key item/weapon and theme:

1. **Field at dusk** — tutorial; light fades as you approach the cabin. No weapon yet.
2. **Ground floor** — knife. Hidden chapel behind the bookshelf; cult/demonic theme begins here.
3. **Upstairs / attic** — fuse, revolver. Still cult/demonic; flickering power, more of the cult's ritual space.
4. **Flooded basement** — crowbar. Transition into the drowned theme.
5. **Cistern tunnels** — valve wheel. Full drowned theme; wading through teal water.
6. **Flesh caves** — shotgun. Transition into the flesh theme; the house's demon-grown tissue.
7. **The heart** — boss fight against the Mother Below.

## Theme by depth

Three zones, each with its own lighting:

- **Cult / demonic** (upper floors) — amber candles, flickering bulbs, blood sigils, antler skulls. Warm, unstable light that gutters and buzzes.
- **Drowned** (basement, cistern) — teal water, lanterns, wading slows you down. Cold, dim, refracted light through water.
- **Flesh** (caves, the heart) — pulsing crimson, veins, ribs, pods. Light breathes with the walls, sourced from glowing organic tissue rather than fixtures.

## Palette

| Name | Hex | Use |
|---|---|---|
| Dusk | `#c8762a` | Field-at-dusk sky and rim light |
| Candle | `#e08a2c` | Candle flame and warm bulb light |
| Wallpaper | `#4a3f2a` | Ground floor / upstairs surfaces |
| Teal | `#1e4a4f` | Basement and cistern water, lantern glow |
| Deep water | `#0e2a2e` | Submerged/dark water areas |
| Meat | `#7a0f16` | Flesh cave walls, veins, pulsing light |
| Dried blood | `#3a060a` | Sigils, stains, shadow accents in flesh zone |
| Bone | `#d8ccb0` | Skulls, ossuary, bone props |

## Rooms

- **Blood chapel** — a hidden ritual room behind the bookshelf on the ground floor.
- **Master bedroom** — a horned figure appears in the mirror.
- **Drowned dining room** — a drowned figure sits at the head of a half-submerged table, lit by a candle chandelier.
- **Ossuary crawlspace** — a tight passage lined with skulls, shown first-person.
- **Baptism pool** — teal water that turns red as acolytes gather around it.
- **The womb** — a flesh chamber with glowing pods holding curled figures.

## Enemies

| Name | Where found | Behavior |
|---|---|---|
| Acolyte | Upper floors | Human cultist in an antler mask; carries a ritual knife and candle |
| Horned hound | Deeper levels | Skinless dog with ram horns; fast, runs you down |
| The drowned | Basement | Bloated, slow, rises from water |
| Lamprey | Cistern | Eel body dragging itself on human hands, circular toothed mouth; ambushes from water |
| Skinless | Flesh caves | Flayed humanoid; fast and screaming |
| Wall maw | Flesh caves | Toothed mouth in the wall; hazard that lunges as you pass |

## Boss

**The Mother Below** — horned, with long wet hair and glowing red eyes. Chained by the wrists, she rises from a black pool within a red sigil circle. Your sister is caged inside her open ribcage.

## Controls and UI

- **Movement:** WASD, mouse look, Shift to sprint
- **Actions:** F flashlight, E interact, LMB attack, R reload, 1–3 to switch weapons
- **HUD:** health bar, ammo counter, crosshair dot, interact prompt, key-item row

## Tech

Built with Three.js + Vite. All assets are procedural — no imported models, textures, or audio files.

The previous build (before the repo was reset) has reusable procedural systems at git commit `dc8b10c`:
- `src/world/lightPool.js` — light pooling for efficient point light management
- `src/systems/postfx.js` — post-processing effects
- `src/systems/audio.js` — procedural Web Audio helpers

These are candidates to port into the new build rather than rewrite from scratch.
