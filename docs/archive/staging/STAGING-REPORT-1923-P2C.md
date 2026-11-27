# STAGING REPORT — #1923 DISH LIFE Phase 2, slice C: the pattern modes (TIDES et al.)

Branch `feat/dish-life-pattern-modes-1923`, base main `4132dc6a`. Local only — no push, no PR.
The parent issue stays open: CONTENT backgrounds, the Phase 3 closed loop and Phase 4 controls remain.

## What this slice does, in plain language

The dish-life coupling gets its third family of readers: the pattern layers. Slices A and B bent
individual marks (scale, breath). A pattern layer has no marks — it is one generated texture — so
this slice bends the texture's own knobs, using two statistics of the culture field, read through
the same seam (`dishLifeCouple.mjs`), off the same dial, under the same governor shed:

- **How busy the whole dish is** (mean activity) turns the pattern's own motion up or down.
  A lively dish makes a quilt's tiles breathe-turn wider, a glyph field's pulse deeper, a
  picture's marks pulse deeper — up to one-and-a-half times the dealt motion at full dial.
  A dead dish slows that motion to half. At a half-busy dish, nothing changes at all.
  The motion is never invented: a pattern dealt still (DRIFT 0) stays still at any dial.
- **How alive each patch of the dish is** (level, region by region) lifts or drops each TIDES
  cell's readout. A cell over a living colony reads up to a quarter-step higher — enough to tip a
  borderline cell into the next state up; a cell over dead ground reads a quarter-step lower.
  This is the readout doing what the parent issue said it should: cells light with colony activity.

Three of the seven modes take no bend at all — FIELD, REWRITE and BLOCKS — because none of them
has a knob that can be bent honestly (survey below). They render exactly as dealt at any dial.

## Per-mode survey — existing parameters and the honest-axis verdict

Every mode consumes the same stored block (`sanitizePattern`): seed, density, mix, grout, hero,
drift, drop, kin, movers. What each one *means* differs per mode:

| Mode | What its parameters do | Honest field axis? | Law |
| --- | --- | --- | --- |
| QUILT | density = grid; mix = motif entropy; grout = gap (0–0.08); hero = hero-motif share; **drift = rotation breath** (±15° over 10 s, an amplitude about rest); kin/movers = element accents | **Yes — drift** | effective drift = dealt × factor(mean activity) |
| GLYPH | density/mix as QUILT; **drift = scale pulse** (depth 0.2 over 6 s, an amplitude about 1) | **Yes — drift** | same factor |
| PICTURE | density = cells; mix = mark entropy; **drift = the same scale pulse** on the sampled marks (it rides GLYPH's rail) | **Yes — drift** | same factor |
| TIDES | density = cells; mix = noise frequency (0.07–0.26); drift = τ, the evolution clock (τ = drift × t) | **Yes — the cell value itself** | each cell's value += shift(level under the cell) |
| FIELD | density = tile size; mix = pool weights; drift = **pan rate** (0.25 tiles/s over absolute loop time) | **No** | — |
| REWRITE | density = cells; mix = spawn weight / head count, **baked into the growth plan** at assign; drift = **integer growth-step clock** | **No** | — |
| BLOCKS | density = cells; mix = merge appetite, **baked into the dealt partition** | **No** | — |

Why the three refusals are refusals, not omissions:

- **FIELD (pattern mode).** Its only continuous knob is the pan *rate*: offset = drift × 0.25 × t.
  Bending a rate at time t moves the whole texture by (factor − 1) × drift × 0.25 × t tiles in one
  step — at t = 60 s and drift 0.5, a factor wobble of ±0.5 teleports the texture ~4 tiles, and the
  statistic changes every generation. Its per-tile parameters are structural integers drawn from
  the seeded rng (repeat counts, sequences) — there is no amplitude anywhere to scale. Mix and
  density re-deal the assignment outright. (This FIELD is the pattern texture; slice B's "FIELD
  glyph breathing" is about FIELD-*scene* marks and is untouched.)
- **REWRITE.** A discrete growth (its own header calls it the TE side of the family). Everything
  continuous is baked into the memoized trajectory at assign time from seed + density + mix; drift
  selects *which integer growth step* is showing, so a bias would make the growth jump steps as
  activity wobbles. There is no live continuous parameter left to bias.
- **BLOCKS.** A deal is a still — drift has no clock in this mode at all (the editor disables it),
  and the partition is baked at assign. Any field influence would mean re-dealing the partition:
  a different picture, not a bias of this one.

Also rejected on the way: TIDES' drift (τ is a *rate* over absolute time — the FIELD teleport in
noise-phase clothing), and QUILT's grout/hero and GLYPH's mix (assignment-side knobs: biasing them
re-deals the picture discretely rather than bending it).

## The two laws (constants in `dishLifeCouple.mjs`, beside slices A/B's)

- **Drift factor** — `culturePatternDriftFactor(activity, coupling)` =
  `1 + coupling × (activity − 0.5) × 2 × PATTERN_DRIFT_SWELL`, `PATTERN_DRIFT_SWELL = 0.5`, so the
  factor lives in **[0.5, 1.5]**. It multiplies the *dealt* drift on the resolved block only; the
  result clamps to drift's [0, 1] domain. Centred: mean activity 0.5 ⇒ factor exactly 1 ⇒ the dealt
  drift, at any dial. Direction: activity (where the culture *moves*) drives motion — the slice-B
  doctrine. Amplitude-not-rate is the slice-B defence again: QUILT's angle and GLYPH/PICTURE's pulse
  are deviations about an anchor (rest angle, scale 1); scaling the deviation keeps the anchor and
  the zero-crossings, so nothing teleports.
- **TIDES shift** — `cultureTidesShift(level, coupling)` =
  `coupling × (level − 0.5) × 2 × TIDES_LEVEL_SWELL`, `TIDES_LEVEL_SWELL = 0.25`, shift in
  **[−0.25, +0.25]**. Added to the cell's dealt value before state/size derivation (states are
  thirds, so the full shift is three quarters of a band). Centred: level 0.5 ⇒ shift exactly 0.
  Direction: level (where the culture *is*) drives a magnitude/readout axis — the slice-A doctrine.

The statistic for the drift factor is the dish-wide mean activity (`fieldMean`); the statistic for
TIDES is regional — each cell reads the level at its own centre from a snapshot grid
(`fieldLevelGrid` + `cultureLevelAt`, nearest cell, the sampler's discipline).

**Why a snapshot, not the sampler slices A/B use.** Marks are placed *during* the resolve, so they
sample the publication the frame they are handed it. Pattern textures are drawn by the renderer
*after* the resolve returns — and the field stage applies (steps the culture, mutating the
holder's arrays in place) at the bottom of that same resolve. A sampler handed to the renderer
would read the *next* generation, breaking the one-frame-behind contract and the one-publication
coherence with slices A/B. So the resolver snapshots the level grid at the coupling read — the one
deliberate copy on the seam's read side (96 × 54 floats, only while the dial is up and a TIDES
layer is resolving), gen-stamped, plain data. It rides the resolved block (`patternCulture`),
through the scene contract, to the renderer's frame call.

**Where the bias lands.** The drift fold rewrites the *resolved block's* pattern copy
(`{...layer.pattern, drift}`) in `liveResolve` — the exact shape of the #1110 audio-route fold
(`patternAudio`), which already biases resolved pattern params per frame without ever touching
the stored block. TIDES' pattern object is never rewritten; its descriptor rides beside it, enters
`patternKey` (generation + dial bucket, TIDES-and-coupled only — every other key byte-identical),
and reaches the raster as a per-cell bias callback into `tidesCells`. A coupled DRIFT-0 TIDES is
no longer a still: it re-rasters each frame under its generation key instead of serving the
drawn-once cache. The #1183 ground sampler (`tidesCellAt`) is *not* biased — marks leaning on a
TIDES ground keep reading the dealt readout; the ground channel is a different consumer family and
not this slice's to bend.

## The four-part admission test, per part

1. **Seeded / replayable.** Both biases are pure functions of (published field, dial, dealt
   parameters, loop time) — the statistics are pure reads of the published arrays; no wall-clock,
   no new state, no rng. The suite's replay case resolves the same coupled stream on two fresh
   resolvers bit-identically, and the TIDES descriptor is proven against a shadow stage fed the
   same resolved layers: the snapshot on the block equals the publication, frame for frame.
2. **Governor-sheddable.** Pattern layers resolve in the same resolver pass, *after* the coupling
   read that builds `cultureScale` — the pattern bias exists only under that one object, so the
   shed fold is literally shared with slices A/B (no second shed path exists). Suite: shed 2
   (CULTURE HELD) restores the plain resolve *and* the plain TIDES texture exactly, all frames;
   shed 1 still acts.
3. **Lock-respecting.** Pattern parameters **cannot be locked in the current instrument** —
   evidence: `lockedParams` reaches only KC-track `layoutParams` (liveResolve's buildPlacements
   path); `patternTrack.js` and the pattern modules define no lock channel, and pattern layers are
   structurally excluded from the culture's seed (the stage's content-layer filter drops
   `isPattern` entries), so a pattern can never be consumed or moved by the culture either. The
   lock-equivalent behaviour that does exist is pinned: the bias writes only the ephemeral
   resolved block (the dealt object is never mutated — the suite resolves against `Object.freeze`d
   patterns), at dial 0 the block carries the performer's very object by reference, and dropping
   the dial restores the dealt values exactly. A pattern-only scene grows no culture at all
   (nothing seedable → nothing published → nothing to read), pinned.
4. **Log-accountable.** No new recorded state: the acting inputs are the ones slice A already
   stamps — `dishField` (which carries the shed) + `dishFieldCoupling`, written together by
   liveLoop whenever the family runs with the dial up; the dealt pattern rides the layer state in
   the stream; loop time is the stream's clock. The snapshot is derived per frame and never
   stored. The suite's snapshot/restore case (JSON round-trip mid-coupling, restore into a fresh
   resolver) continues bit-identically, textures included.

## Suite — `dishLifePatterns.selfcheck.mjs` (new, 19 cases, in the manifest)

Seam laws exact (factor and shift: centred, bounded, linear in the dial, junk-safe) · `fieldMean`
exact on a hand holder, null-gated, pure · the snapshot is a copy (the live arrays step on without
moving it) · `cultureLevelAt` nearest-cell, neutral outside · TIDES bias enters before state/size
derivation (uniform lift/drop moves the state census both ways; zero bias = dealt readout) ·
descriptor renders: neutral field and coupling-0 descriptor are byte-identical to the dealt frame;
alive/dead extremes differ both ways · `patternKey` grows the culture component only for a coupled
TIDES · resolver: dial-0 and publication-alone runs are hash- and texture-identical to plain, every
mode, 12 frames · the drift fold is *exact* at the first published frame — generation 0's activity
is 0 by the core's own publish law, so the factor is exactly ½ and QUILT/GLYPH/PICTURE read
drift = dealt × ½ — then tracks the culture inside its bounds · TIDES descriptor gen is one frame
behind and its render equals the shadow stage's snapshot render, still and drifting alike · a
coupled DRIFT-0 TIDES re-renders as the culture evolves while the plain one never does ·
FIELD/REWRITE/BLOCKS reference-identical at full dial, 12 frames · shed equivalence · frozen
stored patterns · pattern-only scene · composition (marks + all eight pattern layers in one scene:
A moves marks, B's presence never changes a pattern block, C's presence never changes a mark) ·
snapshot/restore · replay. Run 10×: 10/10.

Neighbouring suites at their counts: dishLifeCoupling 18/18 · dishLifeBreathing 20/20 ·
dishLifeField 11/11 · patternRender 22/22 (one re-pin, below) · patternTrack 17/17 · tides 12/12 ·
blocks 12/12 · picture 14/14 · rewrite 10/10 · elements 10/10 · quilt 24/24 · patternEditor 6/6 ·
sceneContract 15/15 · dishGround ok · liveResolve + determinism + dishLife variants ok ·
goldenPlacement OK (hash unmoved) · census OK.

## New-assumption sweep

| Pin / surface | Where | Verdict |
| --- | --- | --- |
| Source-shape pin on the renderer's frame call | `patternRender.selfcheck.mjs` | **Re-pinned**: the call gained the culture argument; the pin now matches the full new argument list, layout-blind via the suite's own `flat`/`fre` discipline (#1684) so Prettier's wrapping can't false-trip it. Same strength — the whole call is still pinned. |
| `patternKey` exact-equality pins | blocks / elements / patternRender suites | Clear: the culture component spreads only for a coupled TIDES, so every pre-slice key is byte-identical; all three suites pass unedited. |
| `tidesCells` / `rasterTides` signatures | tides suite, dishGround (#1183) | Clear: the bias parameter is optional and defaults to the dealt readout; `tidesCellAt` (the ground) never passes it. Both suites pass unedited. |
| Texture-hash / still-cache pins (DRIFT-0 = drawn once) | patternRender / rasterFast suites | Clear for every uncoupled frame — the still path is entered exactly as before when no descriptor rides; a coupled TIDES deliberately leaves it (its key carries the generation). Suites pass unedited. |
| e2e pattern specs (pattern-tides/blocks/picture/rewrite/controls/track) | `e2e/` | Clear: they pin *stored* pattern values and panel behaviour; the slice never writes the store and the dial defaults to 0, so the app under e2e is the pre-slice app. No e2e edits. |
| Golden hash + placement census | goldenPlacement / census suites | Unmoved at dial 0 — both pass unedited. |
| Dice/time-driven suites touched | dishLifePatterns (new) | Run 10×, 10/10. The resolver harness is deterministic; no other dice-driven suite's surface changed. |

## Files

- `app/src/engine/dishLifeCouple.mjs` — the seam grows slice C: `PATTERN_DRIFT_SWELL`,
  `PATTERN_NEUTRAL_ACTIVITY`, `TIDES_LEVEL_SWELL`, `TIDES_NEUTRAL_LEVEL`,
  `culturePatternDriftFactor`, `fieldMean`, `fieldLevelGrid`, `cultureLevelAt`, `cultureTidesShift`.
- `app/src/gl/liveResolve.mjs` — the pattern branch folds DRIFT (QUILT/GLYPH/PICTURE) and attaches
  the TIDES descriptor, both gated on the one `cultureScale` object; lazy per-frame statistics.
- `app/src/gl/sceneContract.js` — the descriptor rides the pattern contract layer (conditional
  spread; uncoupled contracts byte-identical).
- `app/src/gl/renderer.mjs` — the frame call passes the block's descriptor (absent = dealt frame).
- `app/src/pattern/patternSource.js` — `frame` / `patternPixels` / `patternBytesGL` / `patternKey`
  take the optional descriptor; the TIDES bias is built here; a coupled still TIDES re-rasters.
- `app/src/pattern/tides.js` — `tidesCells` / `rasterTides` take an optional per-cell bias.
- `app/src/engine/dishLifePatterns.selfcheck.mjs` — new suite (19 cases).
- `app/selfcheck.manifest` — one line for the new suite.
- `app/src/pattern/patternRender.selfcheck.mjs` — the one re-pin above.

## Verification

- **New suite:** `dishLifePatterns` 19/19, run 10× — 10/10.
- **Full manifest sweep** (continue-on-error over `app/selfcheck.manifest`, 618 commands incl. the
  new suite): **614 pass / 4 fail as run**. Three of the failures are the standing
  sandbox-environment set, each proven base-identical from a same-location detached worktree at
  base `4132dc6a` (`~/workspace/kc-base-proof`, removed after the proof):
  - `swarmWasm` — exit 1 on both trees: the sandbox has no cargo/rustc to build the wasm.
  - `rollSafety` — exit 1 on both trees: identical progress prefix, dies at the sandbox Chromium
    launch (`ERR_INSUFFICIENT_RESOURCES` / SIGTRAP class), before any assertion about the code.
  - `accum` — native abort (exit 134) on both trees after **69 [ok] lines, byte-identical**
    between base and branch.
  CI is authoritative for all three.
  - The fourth, `usePhraseLoop`, is a **sweep-load flake, not a failure of the code**: it is a
    timing-gate suite (the #458 METRO freeze gate) and the sweep ran while this builder's own
    parallel verification (npm install, a full-tree Prettier pass, extra suite batches) shared the
    machine. Standalone it passes at base and on this branch — 6/6 runs on the final tree. Nothing
    in this slice touches phrases, hooks, or the metro/audio clocks.
- **format:check** clean (prettier `--write` on the three files it flagged, then re-verified;
  the patternRender re-pin was made layout-blind after Prettier wrapped the renderer call).
- **lint:** 0 errors (11 warnings, all pre-existing in UI files this slice never touched).
- Golden hash and placement census unmoved at dial 0 (their suites pass unedited, above).
