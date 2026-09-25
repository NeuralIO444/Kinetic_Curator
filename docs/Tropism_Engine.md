# Tropism Engine

*How the picture answers force. Usage report + build record for the algorithm collection: behave verbs, placement modes, Euclidean clock, FX passes, curator Markov. Plan order: verbs → placement → euclid → FX → curator.*

## What it is

Every item in this collection is one answer to one force — wind, hand, beat, seed. Behave rows answer motion, placement modes answer growth, the Euclidean clock answers time, FX passes answer light, Markov answers memory. No new panels; everything rides existing surfaces.

## Recipes

**Low tide** — MURM + lévy + AUDIO clock + FADE 8s. Start from Deep Water, set motion to lévy, arm the phrase in RESET. The field breathes for a bar, one arm of it relocates, the 8-second fade draws the path it took.

**Two rooms** — Night Migration + lorenz + METRO 90 + FLOW 0.4. The flock stops schooling and starts pacing between two poles; trails curl behind each crossing.

**Hand test** — Chrome Parade + flee + BEAT evolve armed. Sweep the cursor across the canvas; the parade parts around it and closes behind. One clap re-rolls the seed mid-part.

**Cone study** — fibonacci tile → phyllotaxis, `split`, FADE 4s from any voice. The same seed that made a disc now makes a cone; crossfade to feel the parastichy shift.

**Plate 49** — L-system + band + displacement 0 + SNAP. Roll seeds until a symmetric fork appears, snapshot the PNG; that frame is the print.

**Agar** — Voronoi scatter + zone + FIELD pull from a fib track at 0.16. The scatter finds the veins; the second track leans into them.

**Tile floor** — Truchet + mirror + CA wrap. Arm the phrase in CA mode; every wrap re-tiles the floor while the palette holds.

**Five in eight** — mold + Euclidean 5/8 + CYCLE + long LEAVE fade. The colony breathes through the misses and re-seeds on the fifth hit; the misses are the piece.

**Storm flag** — HYPE + displace warp 45 + Euclidean 3/4. The shapes hold on misses and tear on hits.

**Clean crossing** — MURM → SWARM, MIX 10s, grade on. Watch the mids: yesterday they went muddy at t=0.5; now they stay lit.

**Second press** — lock palette, CURATE three times. The first press surprises, the second develops, the third returns — that arc is the Markov talking.

## OKLCH — the one caveat worth writing down

The grade pass (#591) works in OKLCH because a hue rotation there keeps
perceptual lightness: measured over a full 360-degree walk, in-gamut colours
move by **0.000** in L, while the same walk in HSL drops up to **0.095** (about
24 eight-bit steps). That is the whole reason mids survive a cross-palette MIX.

**OKLCH hue is not perfectly uniform at high chroma.** Saturated blues and
purples shift a little as they rotate, and a saturated walk leaves the sRGB
gamut — the clamp then costs some lightness (measured worst case **0.065**, still
~6x better than HSL). This is the space behaving as designed, not a bug: do not
"fix" it by clamping chroma harder or by reaching for a different colour space.
If a specific hue matters more than the walk, grade it with chroma pulled back.

## Build record

Tracked per-PR-group in open issues (plan order). Rules that hold across all of it: one fix per PR; numbers glide, enums cut at t>0; seeded channels only, never wall-clock RNG on canvas state; new GPU load declares cost tiers; `Closes #N` lines; Matt merges.
