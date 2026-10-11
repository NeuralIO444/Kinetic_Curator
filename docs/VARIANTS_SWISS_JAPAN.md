# KC-1 Layout Variants — Swiss / Japan Spec

**Status:** Draft for exploration. No build authorized (kernel FULL STOP holds).
**Date:** 2026-10-11
**Author:** Ember, from Matt's direction

## 1. The idea in one paragraph

A **variant** is a named discipline applied on top of any of the 14 layout modes — not a new mode, not a new button. Swiss and Japan are the first two: aesthetic systems (grid rigor / negative-space breathing) expressed as parameter overlays plus selection rules. The user long-presses a mode tile, picks a variant, and the stage re-composes under that discipline. Variants never touch the kernel's samplers; they only set existing layout params (phase 1) and, later, drive a fairer asset-dealing pass (phase 2).

## 2. Why variants, not modes or presets

- **Modes** are geometry engines (grid, fibonacci, rails…). 14 is enough; new ones must be earned.
- **Looks** (presets) are full scenes: mode + params + palette + seed. A Swiss *look* would freeze one mode — Matt asked for Swiss *across* modes.
- **Variants** are the missing middle: one aesthetic discipline × every mode. 14 modes × 2 variants = 28 compositions from two definitions.

This also answers the "same assets in a yucky way" problem at the right layer: half of it is placement discipline (phase 1, data-only), half is selection fairness (phase 2, small engine change). Both are specified here.

## 3. Interaction — zero new buttons

- **Long-press (500ms) a mode tile** → variant sheet: SWISS / JAPAN / NONE.
- Tiles with variants carry a **small dot** — an indicator, not a button.
- Applying a variant = **one undoable overlay** on `layoutParams`. The mode doesn't change; the discipline does.
- Long-press → NONE (or re-tapping the active tile) clears it.
- The active variant shows in the LAYOUT panel subtitle next to the mode name.
- Touch-native: long-press is a first-class iPad gesture. No hover, no modifier keys, no new chrome in the default view. Passes the earn-back rule — no new surface.

## 4. Variant record format (`kc-variant/1`)

Data only. Lives next to presets/palettes; versioned like `kc-recipe/1`.

```json
{
  "format": "kc-variant/1",
  "id": "swiss",
  "name": "SWISS",
  "principle": "Grid rigor. Whitespace is structural. Nothing is decorative.",
  "overlays": {
    "grid":  { "jitter": 4, "density": 55, "overlap": false, "rotate": [0, 0], "scale": [0.7, 1.3], "alpha": [85, 100], "mirror": false, "zTiers": 2 },
    "random": { "jitter": 8, "density": 50, "overlap": false, "rotate": [0, 0], "scale": [0.7, 1.2], "alpha": [85, 100], "mirror": false, "zTiers": 2 }
  },
  "palette": "swiss-grid",
  "selection": { "deal": "without-replacement", "varietyCap": true, "neighborRule": true }
}
```

Rules:
- Overlay keys must exist in `PARAM_SPEC`/`RANGE_SPEC` — unknown keys are ignored (fail closed, same as style sanitize).
- Values clamp to spec ranges; out-of-range → clamp, never throw.
- `palette` is a *recommendation*, not applied — palettes are scene-level. The companion Look applies it.
- `selection` declares phase-2 behavior; phase 1 ignores it.

## 5. Swiss overlay table (phase 1 — all data-only)

Principle: the grid is the composition. Tight jitter, no rotation, no overlap, restrained scale, flat opaque color, low z-depth. Whitespace comes from *restraint*, not emptiness.

| Mode | jitter | density | rotate | overlap | scale | alpha | mirror | zTiers | notes |
|---|---|---|---|---|---|---|---|---|---|
| random | 8 | 50 | [0,0] | off | [0.7,1.2] | [85,100] | off | 2 | scattered but disciplined |
| grid | 4 | 55 | [0,0] | off | [0.7,1.3] | [85,100] | off | 2 | the home turf |
| fibonacci | 6 | 55 | [0,0] | off | [0.6,1.1] | [85,100] | off | 2 | spiral, squared |
| radial | 8 | 50 | [0,0] | off | [0.7,1.2] | [85,100] | off | 2 | burst, aligned |
| swarm boids | — | 45 | [0,0] | off | [0.7,1.1] | [85,100] | off | 2 | cohesion high, alignment max — a tight flock, not a cloud |
| noise warp | 10 | 50 | [0,0] | off | [0.7,1.2] | [85,100] | off | 2 | displacement ≤ 40 — warp, don't melt |
| moth·hype | 8 | 50 | [0,0] | off | [0.7,1.2] | [85,100] | off | 2 | hype, typeset |
| stratified | 6 | 55 | [0,0] | off | [0.7,1.3] | [85,100] | off | 3 | strata stay legible |
| flow | 8 | 50 | [0,0] | off | [0.7,1.2] | [85,100] | off | 2 | bands, combed |
| layers | 6 | 50 | [0,0] | off | [0.7,1.2] | [85,100] | off | 3 | flat planes |
| rails | 4 | 55 | [0,0] | off | [0.7,1.3] | [85,100] | off | 2 | columns, true |
| cellular | 6 | 50 | [0,0] | off | [0.7,1.2] | [85,100] | off | 2 | growth, pruned |
| orbit | 8 | 50 | [0,0] | off | [0.7,1.2] | [85,100] | off | 2 | orbits, registered |
| abacus | 4 | 55 | [0,0] | off | [0.7,1.3] | [85,100] | off | 2 | beads, counted |

Swiss-wide: `bleed: false`, `displacement: 0` (except noise warp ≤ 40), `count` untouched (mode default), `lifeDrift: 0`.

## 6. Japan overlay table (phase 1 — all data-only)

Principle: **ma** — negative space is the composition. Few elements, each breathing. **Wabi-sabi** — asymmetry and slight imperfection over mechanical perfection. Low density, gentle jitter, small organic rotation, airy alpha.

| Mode | jitter | density | rotate | overlap | scale | alpha | mirror | zTiers | notes |
|---|---|---|---|---|---|---|---|---|---|
| random | 35 | 25 | [-18,18] | off | [0.6,1.6] | [50,85] | off | 2 | stones in a garden |
| grid | 30 | 22 | [-14,14] | off | [0.6,1.5] | [50,85] | off | 2 | sparse grid, breathing |
| fibonacci | 28 | 28 | [-18,18] | off | [0.6,1.6] | [50,85] | off | 2 | spiral, weathered |
| radial | 32 | 25 | [-18,18] | off | [0.6,1.5] | [50,85] | off | 2 | ink burst, fading |
| swarm boids | — | 25 | [-14,14] | off | [0.6,1.4] | [50,85] | off | 2 | cohesion low — birds, not a flock |
| noise warp | 40 | 25 | [-18,18] | off | [0.6,1.6] | [50,85] | off | 2 | displacement 20–60 — wind through grass |
| moth·hype | 30 | 25 | [-18,18] | off | [0.6,1.5] | [50,85] | off | 2 | one moth, honored |
| stratified | 28 | 25 | [-14,14] | off | [0.6,1.5] | [50,85] | off | 3 | sediment, quiet |
| flow | 32 | 22 | [-14,14] | off | [0.6,1.5] | [50,85] | off | 2 | water lines |
| layers | 28 | 25 | [-14,14] | off | [0.6,1.5] | [50,85] | off | 3 | washi sheets |
| rails | 26 | 25 | [-14,14] | off | [0.6,1.5] | [50,85] | off | 2 | bamboo, spaced |
| cellular | 30 | 22 | [-18,18] | off | [0.6,1.5] | [50,85] | off | 2 | moss growth |
| orbit | 32 | 25 | [-18,18] | off | [0.6,1.5] | [50,85] | off | 2 | moons, distant |
| abacus | 28 | 25 | [-14,14] | off | [0.6,1.5] | [50,85] | off | 2 | beads, half-counted |

Japan-wide: `bleed: false`, `displacement: 0` (except noise warp 20–60), `count` biased low (variant may scale count × 0.6), `lifeDrift: 0.05` (barely breathing — stillness is the point).

## 7. Selection discipline (phase 2 — small engine change)

The current mechanic — one independent weighted draw per placement — mathematically favors repeats and clumps. Variants declare the fix; the engine implements it once, for all variants:

1. **Deal without replacement.** Weighted-shuffle the active pool, deal placements in order, reshuffle on exhaustion. A repeat can only happen after every asset has appeared once. Seeded through the existing `dyn` channel — determinism preserved.
2. **Variety cap.** Max instances of one asset per frame = `ceil(count / poolSize) + 1`. No single asset can dominate a composition.
3. **Neighbor rule.** Never place the same asset on two consecutive placements (index-adjacent in deal order). Kills the "twins touching" ugliness with one comparison.

All three are variant-agnostic engine behavior once built — but the *variant spec* is what demands them, and Swiss/Japan are the acceptance tests: if a Swiss grid still shows triple repeats, the deal is broken.

Out of scope for phase 2: spatial (not just sequential) neighbor checks, per-asset frequency targets. Keep it small.

## 8. New params needed (phase 2, flagged honestly)

Phase-1 overlays only set params that exist today. Two gaps the spec admits:

- **`margin` (0–200 px, default 0).** Keep placements off the canvas edges. Swiss *needs* this — edge discipline is half of Swiss design. Without it, Swiss is "tight but edge-bleeding."
- **`rotateSnap` (bool, default false).** Snap rotation to 90° increments. Swiss uses it for the rare allowed turn; Japan never does. (Phase 1 approximates with `rotate: [0,0]`.)

Both are additive, clamped by `PARAM_SPEC`, undoable, serializable — the standard param contract.

## 9. Companion palettes & Looks (data-only, can ship anytime)

Variants recommend; Looks apply. Two catalog palettes to author in `app/src/data/palettes.js`:

- **`swiss-grid`** — paper white `#f4f4f2`, ink black `#111111`, Swiss red `#e30613`, gray `#8a8a8a`. Catalog ink: `#111111`.
- **`wabi`** — washi `#f2efe6`, sumi ink `#1a1a1a`, indigo `#4a5a6a`, clay `#a26769`, moss `#7a8a6a`. Catalog ink: `#1a1a1a`.

And two Look groups in the PresetBrowser (`swiss`, `japan`) pairing each variant with its palette across 3–4 signature modes — the on-ramp for users who don't long-press.

## 10. How variants compose with Styles (DLC)

Clean separation, no overlap:
- **Variant** = geometry discipline (where things go, how they're chosen).
- **Style** = surface treatment (FX chain + blend + opacity on a layer).

A Swiss grid with Chiaroscuro Glass is a coherent sentence. Neither system knows about the other; the project JSON carries both. This is also why Styles stayed strict-scope — the split was the right call.

## 11. Acceptance

- Long-press any mode tile → SWISS / JAPAN / NONE sheet. No new buttons in default view.
- Swiss grid at a glance: aligned, flat, no repeats, breathing margins (once `margin` lands).
- Japan random at a glance: sparse, airy, asymmetric, imperfect — no twins touching.
- Applying/clearing a variant is one undo step; project JSON round-trips it.
- `npm run selfcheck` covers: overlay clamp/fail-closed, variant serialization, deal determinism (phase 2).

## 12. Voice marks in submenus (2026-10-11, Matt)

When a submenu is open (variant sheet, Look slot picker, Voice slot picker, library browsers) and a Voice has a live suggestion, that Voice's mark appears trailing the suggested item — an annotation, not a button.

- **Marks:** LOIS (pill glyph), Davis (kaleidoscope face), QUEEN (👸🏽 — still unnamed, no tooltip, per the 2026-10-09 amendment; her mark appearing is her sway made visible without naming her).
- **Honest signals only** (LOIS rule): a mark renders iff the voice actually holds a live suggestion for that item. No suggestion = no mark. Silence is default.
- **Consensus reads instantly:** multiple voices may mark the same item — marks stack trailing, up to all loaded voices.
- **Color discipline** (KC-1 DS): LOIS red (structure), Davis amber (taste), Queen quiet ink.
- Marks are `pointer-events: none` — they never intercept taps; the row behaves exactly as before.
- Out of scope: marks in main canvas chrome (pill/icon territory).

## 13. Open questions for Matt

1. Long-press timing/discoverability — is the dot enough, or do you want a first-run hint?
2. Should variants also shift the *active palette* (breaking the "palette is scene-level" rule), or stay geometry-only with companion Looks?
3. Phase-2 priority: deal-without-replacement before or after the DLC lane?
