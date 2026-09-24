# The Tithe — audio direction

## Approach

All audio is procedural Web Audio — no asset files. Music beds mirror the visual shift by depth (amber → teal → crimson) and crossfade over roughly 3 seconds on level transitions.

## Zone table

| Zone | Bed | Zone SFX |
|---|---|---|
| Field at dusk | Low drone + distant bell toll (Liturgy bell, far/quiet) | footsteps on grass, cabin door creak |
| Ground floor, upstairs | **Liturgy**: organ drone (D/A/G# cluster, tremolo), formant choir pad, bell every ~9 s, chant when acolytes near | bell toll, cult chant, acolyte scream, revolver (chapel reverb), sigil ignite, bulb flicker buzz (borrowed from Dead channel) |
| Basement, cistern | **Undertow**: lowpassed brown-noise waves, 41/55 Hz sub beating, whale groans, random drips | drip, wading splash, drowned gurgle, lamprey shriek, shotgun (muffled when submerged) |
| Flesh caves | **Viscera**: 58 bpm heartbeat, breathing bandpassed noise, wet 36.7 Hz saw pulse, random squelches | squelch, bone crack, skinless scream, wall maw chomp, hound snarl |
| Encounters (any zone) | **Dread strings** layer on top | braam on enemy spotted, violin screech on jump scare, heartbeat rush at low health, stinger, door creak |
| Boss (the heart) | Choir + heartbeat + submerged drone layered; heartbeat tempo rises as boss HP drops | — |

## Sound effects list

**Field at dusk**
- Footsteps on grass
- Cabin door creak

**Ground floor / upstairs (cult/demonic)**
- Bell toll
- Cult chant
- Acolyte scream
- Revolver (chapel reverb)
- Sigil ignite
- Bulb flicker buzz

**Basement / cistern (drowned)**
- Drip
- Wading splash
- Drowned gurgle
- Lamprey shriek
- Shotgun (muffled when submerged)

**Flesh caves**
- Squelch
- Bone crack
- Skinless scream
- Wall maw chomp
- Hound snarl

**Encounter layer (any zone)**
- Braam on enemy spotted
- Violin screech on jump scare
- Heartbeat rush at low health
- Stinger
- Door creak

## Synthesis notes

Recipes as implemented in `prototypes/audio-sets.html`. Everything runs through a compressor and a generated convolution reverb (3.8 s decaying noise impulse).

- **bell** — eight inharmonic sine partials (0.5x to 4.1x) with decays from 7 s down to 1.2 s
- **chant** — five detuned sawtooth voices (root, fifth, octave below) through three vowel formant bandpasses morphing o-a-o-u-a-o
- **scream** — four detuned sawtooths gliding up then down, through a formant filter morphing "a" to "i", plus a hiss layer; the skinless version adds wave-shaper distortion
- **shot** — lowpassed white-noise crack, sine thump dropping 150 to 36 Hz, and a high click; the chapel revolver uses a heavy reverb send
- **ignite** — bandpassed noise sweeping 200 to 3200 Hz, a brown-noise rumble, and scattered crackles
- **drip** — sine blip at 900–1900 Hz falling to about 45% pitch in 60 ms, mostly reverb
- **splash** — four brown-noise bursts through a falling bandpass, with white-noise spray
- **gurgle** — brown noise through a bandpass jumping between 180 and 750 Hz every 50 ms, plus a 72 to 55 Hz sawtooth chopped by a 9 Hz square
- **lamprey** — FM sawtooth (1500 to 650 Hz carrier, 310 Hz modulator) through a bandpass with a 28 Hz tremolo
- **boom** — the submerged shotgun: brown noise lowpassed at 260 Hz plus a sine dropping 90 to 24 Hz, long reverb
- **heart** — two sine thumps, 62 to 30 Hz then 55 to 28 Hz 280 ms later
- **squelch** — resonant lowpass (Q 14) sweeping 2600 to 180 Hz over brown noise, a sine dip 200 to 60 Hz, and wet clicks
- **crack** — six tiny highpassed noise clicks within 160 ms plus a short low thud
- **chomp** — brown-noise inhale, then a sine thud (95 to 38 Hz) with a click, then a squelch
- **snarl** — sawtooth sliding 70 to 130 to 90 Hz, chopped by a 32 Hz square, lowpass plus bandpass, with brown-noise breath
- **flicker** — 120 Hz sawtooth buzz (bandpass at 240 Hz) randomly gated every 40 ms with a click at each switch
- **braam** — five low detuned sawtooths (43.65–103.8 Hz) through distortion and a lowpass that opens to 1.8 kHz then closes
- **screech** — three dissonant sawtooths around 1.76–1.87 kHz with 9 Hz vibrato rising 6%, bandpassed, plus bow noise
- **rush** — ten heartbeats accelerating from 0.95 s to 0.34 s apart and getting louder
- **creak** — stick-slip friction: a sawtooth whose pitch jitters every 30 ms through two bandpasses, ending in a wooden thunk
- **stinger** — highpassed noise swelling for 1.4 s, cut into a braam and a screech
- **MUSIC.liturgy** — square and sine organ on a D/A/G# cluster with 4.6 Hz tremolo, a formant choir pad slowly changing vowels, a bell every 9 s, and a chant every 14 s
- **MUSIC.undertow** — brown-noise waves under a slowly swinging lowpass, 41/41.6/55 Hz sub sines beating, a whale-like groan every 8 s, and random drips
- **MUSIC.viscera** — 58 bpm heartbeat, bandpassed brown-noise breathing at 0.22 Hz, a 36.7 Hz sawtooth pulsing through a resonant lowpass, and random squelches
- **MUSIC.strings** — encounter bed: a dissonant cluster (C, C#, F#, G, B over a low C) of detuned sawtooths with slow swells, a Shepard-tone riser, and timpani thumps every 4.2 s; braam, screech, rush and stinger fire on events

## Boss mix rule

For the Mother Below fight, choir, heartbeat, and submerged drone layer together. Heartbeat tempo rises as the boss's HP drops, tightening tension toward the kill.

## Reference

The playable audition page for these sounds is `prototypes/audio-sets.html`.
