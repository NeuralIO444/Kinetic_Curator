# Plenum Engine

*The render engine. Every frame begins as void; the engine fills nothing with picture.*

## Principle

The simulation is the negative; the frame is the print. Between them, every
pass earns its place: sweep the dead code, resolve honestly, hold the atlas
steady, finish with grain, light last. Dither is the final thing that touches
pixels — after grain, after everything. The void is where every frame begins;
the plenum is where it arrives, 60 times a second, and the nothing never shows.

## The five phases (in order)

1. **Sweep** — dead-code removal (#550): placement.js, color.js, textRuns,
   motionEnergy. Remove before earning back; the pipes get cleaned before new
   water flows.
2. **Resolve** — ACES-approx + dither in the final pass (#532). Highlights
   roll off like film instead of clipping; gradients grain instead of
   posterize. The fidelity floor everything else stands on.
3. **Hold** — atlas stability, resolved per #561's decision (stepping restored
   for atlas-affecting keys, or keep drawing on existing combos while new ones
   bake). No jitter, no held frames — the MIX never rebakes visibly mid-blend.
   **The rule:** a param that can change which assets get placed (`ATLAS_AFFECTING_PARAMS`, `data/layout-modes.js`) may lerp per frame only while the placed-asset set stays constant across the blend — new atlas-affecting params must step or hold-then-bake; `gl/atlasKeyGuard.selfcheck.mjs` enforces it.
4. **Finish** — EF rack + post-accum grain seam (#520). Fixed finishing chain
   per FX layer, grain-family locked to the final step, grain over the
   finished frame.
5. **Light** — Chiaroscuro phases 1–2 (#594): one sun + bevel normals. Light
   models the finished picture; speculars arrive already under the tonemap's
   care.

## Deliberately not

Sub-range instance uploads (#533 — measure-first; it may close itself as
not-worth-it), Chiaroscuro phases 4–5 (frame strips, parallax — that's
Plenum v2), new blend modes, a second resolve path. One engine, one resolve,
one dither.

## Recipes

**Clean resolve** — Night Migration + bloom cores + sun low. Sweep the sun
across the plate; highlights roll off, edges catch and release, nothing clips.

**Still blend** — MURM → SWARM, MIX 10s. Watch the mids: the atlas holds, the
blend stays smooth, the nothing never shows.

**Grain over everything** — any voice + EF-4 grain + long LEAVE fade. Trails
decay into grain; grain sits over the finished frame; dither last.

**Glitch minimalism** — KUROKAWA SCAN + EF rack: tear (light), scanlines,
rgbSplit (subtle, live-shimmered), grain. Ordered chaos: sparse field, hard
scan rows, one signal color. Dither last.

**Ink nebula** — INK NEBULA + long LEAVE fade + grain over everything. Flow
plumes collide, leak pigment across the cast, trails decay into the dark.
Dither last.

**Dirty and vibey** — DIRTY SIGNAL + EF rack: displace (low), rgbSplit,
heavy grain. Scorched highlights, halation on the mids, everything a little
melted. Dither last.

## Build record

Tracked per-phase in open issues (plan order). Rules that hold across all of
it: one fix per PR; dither is the last thing that touches pixels — a
resolve-pass selfcheck asserts the dither/resolve is the terminal pass and
nothing draws after it; new GPU load declares cost tiers; selfcheck per
behavior; `Closes #N` lines; Matt merges.
