# STAGING REPORT — #1923 DISH LIFE Phase 2, slice D: CONTENT backgrounds

Branch `feat/dish-life-content-bkg-1923`, base main `21a144a2`. Local only — no push, no PR.
The parent issue stays open: the Phase 3 closed loop and Phase 4 controls remain.

## What this slice does, in plain language

The dish-life coupling gets its fourth and last named consumer family: the CONTENT backgrounds.
Slices A–C bent marks (scale, breath) and pattern textures (drift, TIDES cells). This one bends
the backdrop itself — the flat stage background everything else is drawn on.

- **How alive the whole dish is** (mean level) brightens or darkens the stage background.
  A lively dish lifts the room: the background mixes up to a quarter of the way toward white at
  full dial. A dead dish lets it fall a quarter toward black. At a half-alive dish — and at dial
  0 — the background is exactly the colour the palette dealt, byte for byte.

## What a CONTENT background actually is in this tree (the survey)

"CONTENT backgrounds" is Matt's Q5 shorthand; no module bears the name. The survey walked every
surface the phrase could denote, against the code:

| Candidate | What it is | Verdict |
| --- | --- | --- |
| **The stage background** (`bgCss` in `gl/liveLoop.mjs`) | The active palette's `bg` hex (a palette is 8 swatches + bg), or the WASH / INJECT tint events' lerped field colour while a colour event runs. Cleared into the frame by the renderer, begun from by ACCUM, derived from by the wet ground, recorded with the take. The lowest CONTENT layer composites over it (`layoutSlice`: "the bare canvas background"). | **This is the surface.** A field-sized rendering whose one continuous axis is its brightness. |
| The pattern ground (#1183) | A pattern layer below is the "ground" CONTENT layers rest on; rendered by the pattern layer itself — slice C's textures. Its sampling channel (`patternGround.at`, lean/nudge/snap/shadow) bends MARKS toward the ground, it renders nothing. | Not a background rendering. The rendered half is slice C, already coupled; the sampler half is mark-side and out of this family's shape. |
| FX grain / vignette | FX-stratum filter parameters (fxFilters). | Wrong stratum — the FX family's own surface, not CONTENT's. |
| ACCUM's `background` | The accumulation buffer's fade target — a consumer of `bgCss`, not a source. | Follows the fold automatically (below). |
| Dish weather / haze-as-air (#1183) | An FX haze read positionally by marks (air fade). | Mark-side, like the ground channel. |
| The palette bg under a 'white'/'transparent' canvasBg cycle | The performer's explicit backdrop override. | Not the scene's background — respected, never folded (below). |

So the consumer takes the global shape — the background analogue of slice C's dish-mean drift
bias, since a flat colour has no regions to read. (A regional shape would need a spatially-varying
background parameter; none exists on this surface — making one would invent a new background
feature, which this slice does not do.)

## The law (constants in `dishLifeCouple.mjs`, beside slices A–C's)

- **Shift** — `cultureBackgroundShift(meanLevel, coupling)` =
  `coupling × (meanLevel − 0.5) × 2 × BACKGROUND_SWELL`, `BG_NEUTRAL_LEVEL = 0.5`,
  `BACKGROUND_SWELL = 0.25`, shift in **[−0.25, +0.25]**. Centred: mean level 0.5 ⇒ shift exactly 0
  ⇒ the dealt background, at any dial. Direction: level (where the culture *is*) drives a
  magnitude axis — the slice-A / slice-C-TIDES doctrine; activity drives motion, and the
  background does not move.
- **Fold** — `cultureBackgroundHex(hex, shift)`: shift > 0 mixes each channel toward white by
  shift, shift < 0 toward black by −shift, linearly. A mix, not a gain — no channel can clip or
  overshoot, no hue is invented, and it is the same class of move the tint system already makes
  on this surface every WASH (a lerp between palette backgrounds). Shift 0 (or junk) returns the
  dealt string **untouched** — the centred frame is byte-identical by construction, and the suite
  pins that for every palette background in the library.

**Where the fold lands, and why.** The loop owns the background (the bgMode cycle, the tint
events, the palette); the resolver owns the publication. So the resolver makes the READ at its
one coupling read — `{ meanLevel, coupling }` off the same publication, under the same single
`cultureScale` gate, one frame behind — and publishes it on its last-frame channel
(`getLastCouplingBackground`, the established getLastDishWet / getLastSpawnDecisions pattern).
The loop folds after its resolve, when it computes `bgCss`. **No resolved output changes** — the
background is not a layer, and the channel is the slice's only resolver footprint. Everything
downstream of `bgCss` follows the one folded value: the renderer's clear colour, ACCUM's begin
and its fade-to-paper target, the wet ground, the recorded take. `clearAccum` folds by the same
law off the last published read, so a clear re-begins the buffer from the *shown* background
rather than a dealt-only truth the frames would drift away from over the fade.

**The performer's overrides stand.** The fold applies only on the palette path
(`bgMode === 'palette'`). White stays white and transparent stays clear at any dial — those are
explicit backdrop choices, not the scene's background. (The CanvasPanel DOM wrap behind the
canvas element still paints the dealt palette bg as page chrome; the GL canvas covers it in
normal layout and the frame of record — canvas, exports, takes — is the folded value.)

**The room does not fight.** The plate/quiet room is a *mark-side* suppression:
`buildPlacements` multiplies mark ink by `PLATE_ROOM_ALPHA` inside the zone; it never reads the
background (pinned at source level in the suite: the placement builder contains no background
channel, no `bgCss`). The fold moves the backdrop *uniformly*, so a room reads exactly as deep
as dealt — suppression is relative to the marks, not to the backdrop. Plate contrast against
the backdrop moves by at most the bounded mix, far inside what a palette swap or a WASH event
already does to the same surface.

## The four-part admission test, per part

1. **Seeded / replayable.** The read is a pure function of (published field, dial); the fold is a
   pure function of (dealt hex, read). No wall-clock, no new state, no rng. The suite resolves
   the same coupled stream on two fresh resolvers and gets identical read sequences and frame
   hashes, bit for bit; snapshot/restore mid-coupling (JSON round-trip) continues with identical
   reads and hashes. The snapshot's shape is unchanged by this slice (asserted well-formed).
2. **Governor-sheddable.** The read exists only under the one `cultureScale` object slices A–C
   share — at shed ≥ SHED_HOLD (CULTURE HELD) the effective coupling is 0, no read is published,
   the loop folds nothing, and the whole resolve is the plain resolve (suite, hashes). Shed 1
   still reads. No second shed path exists: the fold has no other gate.
3. **Lock-respecting.** The background has **no lock channel in the current instrument** —
   evidence: `lockedParams` reaches only `layoutParams`; the background is not a layout param
   (no `PARAM_SPEC` or default key names it — pinned in the suite), and no layer, HELD state or
   pin names it. The lock-equivalents that do exist are pinned: the performer's explicit
   white/transparent overrides are never folded (source-shape pins on both fold sites); HELD /
   still-pinned marks are untouched by construction (the fold moves no item — it is not in the
   placement path at all); bedrock/terrain are never seeded (Phase 1) and the fold reads only
   the published means. The seam law's whole input is (statistic, dial) and (hex, shift) —
   arity-pinned, so no lock or zone input can silently grow into it.
4. **Log-accountable.** No new recorded state: the acting inputs are the ones slice A already
   stamps — `dishField` (which carries the shed) + `dishFieldCoupling`, written together by
   liveLoop whenever the family runs with the dial up. The dealt background re-derives from the
   recorded palette + tint inputs exactly as it did before this slice, and the folded value is
   what the take records as its background. The read channel is derived per frame and never
   stored.

## Suite — `dishLifeBackgrounds.selfcheck.mjs` (new, 12 cases, in the manifest)

Seam laws exact (shift: centred, bounded, linear in the dial, junk-safe; hex fold: hand-computed
mixes, per-channel bounds, junk passthrough) · shift 0 returns the dealt string for **every
palette background in the library** · off shapes publish no read (no stamps / dial 0 / stamps
without the dial key) and leave the whole resolve hash-identical to plain · the read equals a
shadow stage's dish-mean level one frame behind, frame for frame over 14 frames · the read tracks
the evolving culture over 30 frames (≥3 distinct mean levels) and the folded background moves
with it, inside the swell · shed equivalence · composition (marks + QUILT + TIDES + background in
one scene: A folds marks, C folds the QUILT drift by its frame-1 ×½ law, D publishes the read —
and the read is identical in a marks-only scene, so the pattern family neither feeds nor moves
it) · replay bit-identity · snapshot/restore bit-identity · the lock survey pinned · wiring
source-shape pins (the liveLoopScope discipline — the loop needs DOM/GL and cannot run headless:
the fold sits on the palette path in `buildFrame` and in `clearAccum`, reading the published
channel; the resolver publishes the read with the frame facts) · room source-shape pins (the
placement builder contains no background channel). Run 10×: 10/10.

Neighbouring suites at their counts: dishLifeCoupling 18/18 · dishLifeBreathing 20/20 ·
dishLifePatterns 19/19 · dishLifeField 11/11 · dishLifeStage ok · liveResolve ok ·
liveResolve.dishLife ok · liveResolve.determinism ok · resolverSnapshot ok · dishGround ok ·
sceneContract 15/15 · liveLoopScope ok · wetLook 16 · wetWarmup 21 · patternRender 22/22 ·
goldenPlacement OK (hash unmoved) · census OK.

## New-assumption sweep

| Pin / surface | Where | Verdict |
| --- | --- | --- |
| `bgCss` references in other suites | wetLook / wetWarmup selfchecks | Clear: they pin `wetGroundFromCss` and the warm-up ferry against their own values; the fold changes only which value the loop deals at dial > 0, and both suites pass unedited. |
| Last-frame channel consumers (`getLastDishWet` etc.) | liveLoop, suites | Clear: the new channel is additive (a new export + a new module-level slot); no existing channel's shape or drain semantics changed. All resolver suites pass unedited. |
| Resolver output hashes under coupling | slices A–C suites | Clear: the read is a side channel; resolveLayers' returned blocks are untouched — A/B/C suites pass unedited at their counts, and this suite re-pins dial-0 / publication-alone hash identity end to end. |
| Snapshot shape pins (`checkResolverSnapshot` users: resolverSnapshot, spawnState, retroCapture, performanceFile, review suites) | `src/` | Clear: the snapshot gains no key; this suite asserts a mid-coupling snapshot stays well-formed, and the full sweep covers the rest. |
| Background / ground texture-hash pins | patternRender, dishGround, rasterFast suites | Clear: the pattern rasters and the ground sampler are untouched (slice C's surface, not this one's); both pass unedited. |
| e2e specs | `e2e/` | Clear: `grep bgCss / dishField e2e/` — the dial defaults to 0 and no e2e surface names the channel; the app under e2e at dial 0 is the pre-slice app. No e2e edits. |
| Golden hash + placement census | goldenPlacement / census suites | Unmoved at dial 0 — both pass unedited. |
| Dice/time-driven suites touched | dishLifeBackgrounds (new) | Run 10×, 10/10. The resolver harness is deterministic; no other dice-driven suite's surface changed. |
| Word/value gaining new meaning | `getLastCouplingBackground`, `cultureBackgroundShift/Hex`, `BG_NEUTRAL_LEVEL`, `BACKGROUND_SWELL` | New names, coined here; grep over `src/` shows no pre-existing literal collides. |

## Files

- `app/src/engine/dishLifeCouple.mjs` — the seam grows slice D: `BG_NEUTRAL_LEVEL`,
  `BACKGROUND_SWELL`, `cultureBackgroundShift`, `cultureBackgroundHex` (+ the `colorHex` import).
- `app/src/gl/liveResolve.mjs` — the coupling read computes the dish-mean level under the one
  `cultureScale` gate and publishes `{ meanLevel, coupling }` with the frame facts;
  `getLastCouplingBackground` exported. No resolved output changes.
- `app/src/gl/liveLoop.mjs` — the fold: after the resolve, on the palette path only, `bgCss` is
  folded by the seam law off the published read; `clearAccum` re-begins from the shown
  background by the same law.
- `app/src/engine/dishLifeBackgrounds.selfcheck.mjs` — new suite (12 cases).
- `app/selfcheck.manifest` — one line for the new suite.

## Verification

- **New suite:** `dishLifeBackgrounds` 12/12, run 10× — 10/10.
- **Full manifest sweep** (continue-on-error over `app/selfcheck.manifest`, 619 commands incl. the
  new suite): **616 pass / 3 fail**. The three failures are the standing sandbox-environment set,
  each proven base-identical by paired runs from a same-location detached worktree at base
  `21a144a2` (`~/workspace/kc-base-proof`, removed after the proof):
  - `swarmWasm` — exit 1 on both trees: `build-wasm: cargo not found on PATH` (the sandbox has no
    cargo/rustc to build the wasm).
  - `rollSafety` — exit 1 on both trees: identical stack (glDriver.mjs:133 → candidate.mjs:31 →
    rollSafety.selfcheck.mjs:231, the case at line 202), differing only in worktree path and PID —
    it dies in the sandbox's Chromium/GL driver before any assertion about this code.
  - `accum` — native abort (exit 134) on both trees after **69 [ok] lines, byte-identical**
    between base and branch.
  CI is authoritative for all three. (`usePhraseLoop`, slice C's sweep-load flake, passed in this
  sweep — it ran unloaded, sequentially.)
- **format:check** clean (prettier `--write` on the three files it flagged, then re-verified).
- **lint:** 0 errors (11 warnings, all pre-existing in UI files this slice never touched; no
  warning names a touched file).
- Golden hash and placement census unmoved at dial 0 (their suites pass unedited, above).
- An `npm install` artifact touched `app/package-lock.json` (a one-line `license` field npm
  added); reverted — the slice carries no dependency change.
