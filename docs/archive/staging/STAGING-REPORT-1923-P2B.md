# STAGING REPORT — #1923 DISH LIFE Phase 2, slice B: the coupling's second consumer (FIELD glyph breathing)

Branch `feat/dish-life-field-breathing-1923` on base main `3aa90613`. Built, not pushed, no PR.
Issue title (verbatim): "DISH LIFE: a Game-of-Life culture phase over the petri dish".
The parent issue stays open — pattern modes (TIDES et al.), CONTENT backgrounds, the Phase 3
re-seed loop and Phase 4 controls remain later slices of it.

## What was built

Slice A (PR #2024) gave the invisible FIELD culture its first reader: scale, driven by the field's
`level`. This slice adds the second reader on the **same seam, same dial, same shed fold**: the
field's **activity** under a glyph drives the **depth of the breath that glyph already has** — the
kineme breath driver (`evaluateKineme` in `app/src/engine/kineme.js`), the continuous scale
oscillation every living-motion scene already runs (KC-1 DS: continuous signals render Davis; the
breath is the instrument's Davis-side oscillation, ±9% of scale at `BREATH_DEPTH`, per-mark phase
from the mark's own seed hash). A glyph over a lively patch breathes deeper; over a dead patch,
shallower; over a mid patch, exactly its dealt breath.

**The channel existed; nothing new was invented.** The FIELD pattern mode itself is texture
micro-patterns with no glyphs and no breath (checked in `src/pattern/field.js` and
`patternModes.selfcheck.mjs`), and FIELD *poem* glyphs are FORM items — excluded by law, below.
The breath that FIELD-scene *marks* carry is the kineme driver's, reached through the placement
path. That is the parameter this slice modulates, through slice A's seam, as the brief directs.

**Wiring (three small changes, all gated on the seam object's presence):**

1. `engine/dishLifeCouple.mjs` — two constants and one pure factor beside slice A's (below).
2. `engine/kineme.js` — inside the breath block only: when `ctx.fieldBreath` carries a sampler,
   each mark's breath term is multiplied by `cultureBreathFactor(sampledActivity, coupling)`
   before it is added to `dScale`. No other driver reads the seam; absent the seam the term is
   the dealt term, number for number.
3. `gl/liveResolve.mjs` — `livingMotion` gains a trailing `fieldBreath` parameter, spread into
   the kineme ctx exactly like the quiet culture's `culture` field; the one placement-layer call
   site passes **`cultureScale` itself** — the identical object buildPlacements folds for scale.
   One shed-folded coupling therefore drives both consumers; neither can outlive the other. The
   floor's null gate ignores the new field (it is not a motion source: it never un-nulls a floor,
   it only deepens or shallows a breath the scene already has). The creature `livingMotion` calls
   pass no culture arguments and are untouched — the coupling reaches placement layers, exactly
   slice A's scope.

**Dial 0 ⇒ bit-identical absence.** The resolver only builds the seam object when the shed-folded
dial is above 0 AND a field is published; the producer only stamps while the dial is up. With the
dial at 0 the kineme ctx carries no `fieldBreath` key and the breath block runs its pre-slice
arithmetic unchanged. The slice-A byte-identity pins pass untouched, and this slice's suite pins
the same identities **with the living-motion floor live** (default amounts), which slice A's
harness no longer does (see the sweep table).

## The breath law, and why depth is the honest axis

`cultureBreathFactor(activity, coupling) = 1 + coupling × (clamp01(activity) − 0.5) × 2 × BREATH_SWELL`

| Constant | Value | Meaning |
|---|---|---|
| `BREATH_NEUTRAL_ACTIVITY` | 0.5 | the activity that leaves the breath unchanged (factor exactly 1 at any dial) |
| `BREATH_SWELL` | 0.6 | max fractional depth change at full dial at an extreme activity → depth factor in [0.40, 1.60] |

**Depth, not rate — defended.** The breath's rate is its phase law: an anchored function of the
instrument's loop time, `sin(TAU·(BREATH_HZ·t + uN)) − sin(TAU·uN)`, exactly 0 at driver time 0 so
the first frame is the placed picture. A per-mark *rate* modulation cannot be written as a pure
function of (loop time, published activity, phase): changing a rate mid-flight requires
integrating the rate history, which is new state — failing admission part 1 (seeded/replayable,
no silent state) — and any closed-form shortcut phase-jumps the moment the activity changes under
a glyph, snapping its scale. Depth modulation has neither problem: it scales the amplitude of the
existing oscillation, so the anchor at t = 0 stays exact (0 × factor = 0), zero-crossings never
move, and the modulation is a pure function of the current publication — when the culture moves,
the breath follows the same frame the publication does, which the suite pins through a real
stage's evolving field. The floor of the law matters too: at activity 0 and full dial the depth
factor is 0.40, a *shallower* breath, never silence — the living-motion floor's standing law is
that the canvas never sits still, and a dead patch of culture is not a dead patch of stage.

## Composition with slice A (scale)

The two consumers read **different fields of the same sample through different axes of the
build**: scale reads `level` and folds multiplicatively as the LAST SoA pass in buildPlacements
(`applyCultureScale`); breath reads `activity` and multiplies only the breath *term* inside the
additive `dScale` the kineme drivers fold earlier (`applyKinemeDrivers`). A coupled mark's final
scale is therefore `placed × (1 + dealtDeviation × breathFactor) × scaleFactor` — each factor
applied exactly once, on its own axis. The suite pins both identities per mark (composed ÷
breath-only = the scale factor exactly; the breath deviation scales by the breath factor exactly),
and pins that breath never reads level and scale never reads activity.

## Exclusions (each structural, each pinned)

- **Poem/plate FORM items** — built outside the SoA the kineme evaluates; the FIELD poem's glyphs
  are form items and stay excluded, as slice A pinned for scale. Pinned again here for breath:
  with the dial up the marks breathe deeper and every form item is bit-identical.
- **HELD / still-pinned marks** — `applyKinemeDrivers` skips still-pins for every driver, the
  modulated breath included. Pinned: all assets pinned ⇒ the build is the placed build, exactly.
- **Creature appends (moths/dish creatures)** — their `livingMotion` calls receive no seam, same
  as slice A's scope.
- **Marks outside the canvas** — no cell to read; they breathe their dealt breath.
- **Frozen (slowRender) frames** — the whole living-motion floor is null there by its standing
  gate, breath included; the scale fold's behaviour on such frames is slice A's, unchanged.

## The four-part admission test — evidence (suite `src/engine/dishLifeBreathing.selfcheck.mjs`, 20 cases)

1. **Seeded/replayable** — the modulation is a pure function of (published activity, dial, the
   glyph's own seed phase, loop time): no wall-clock reads anywhere in the path (the sampler reads
   the stage's holder arrays; the factor is arithmetic). Pinned: the same coupled input stream on
   two fresh resolvers → bit-identical frame hashes; mid-coupling snapshot/restore continues
   bit-identically; sampling checksum-proven read-only over the holder arrays.
2. **Governor-sheddable** — the breath reads the SAME shed-folded coupling object as scale
   (`effectiveCoupling` over the stamp's own shed — no second shed path exists). Pinned at
   resolver level with the floor live: shed 2 (CULTURE HELD) + dial 1 ⇒ frame hashes equal the
   plain run exactly — both consumers drop in the same frame; shed 1 (trickle) still acts.
3. **Lock-respecting** — still pins skipped inside the driver applier (pin above); form items
   structurally out of reach (pin above); bedrock never seeded (Phase 1) and never an item the
   kineme evaluates as a mark.
4. **Log-accountable** — no new state: the breath needs nothing recorded beyond what slice A
   already rides on the input stream (the `dishField` stamp + `dishFieldCoupling` on every frame
   they act). The kineme ctx is per-frame derived, never snapshotted; the snapshot that restores
   a mid-coupling take carries only slice A's existing `dishField` key (pinned: restore continues
   bit-identically with the breath live).

Further pins: the factor law at both extremes and the midpoint (exact); the deviation law through
buildPlacements at activity 0 and 1 (per-mark deviation × factor); anchor exactness at driver
time 0; phase preservation across a time sweep (ratios constant, signs unmoved); drift/wobble
terms bit-identical with the seam attached; drop-out restores the exact plain frames the frame
after the stamp stops; the consumer acts from the second frame (frame 0 has no publication yet).

## Verification

- New suite `dishLifeBreathing.selfcheck.mjs`: **20/20**, and 10/10 repeat runs (time-driven).
- Slice A's suite `dishLifeCoupling.selfcheck.mjs`: **18/18**, 10/10 repeats — one harness
  reconciliation, recorded in the sweep table below; every assertion kept at full strength.
- `kineme.selfcheck.mjs`: OK, 10/10 repeats. All dishLife/field neighbour suites green at their
  counts (dishLifeField 11/11 · dishLifeQuiet 5/5 · kinemeCulture 8/8 · dishLifeChip 8/8 ·
  liveResolve.dishLife ok · dishLife/dishLifeSeed/dishLifePhase/dishLifeRender/dishLifeStage/
  dishLifeSpike/dishLifeTouchDom ok).
- Golden + census at dial 0 (the shipped default): `goldenPlacement` green — golden hash
  `e892d112…` unmoved; `census` suites green in the sweep.
- **Full manifest sweep** (continue-on-error over `app/selfcheck.manifest`, 617 commands):
  **614 pass / 3 fail** — `swarmWasm`, `rollSafety`, `accum`. All three are sandbox-environment
  failures, each proven **base-identical** in a detached worktree at base `3aa90613` placed in the
  same environment as this build worktree (same ancestor `node_modules`; this worktree carries no
  local install): swarmWasm fails on the identical assertion at line 136 — `cargo` is not on PATH
  in this sandbox, so the checked-in kernel wasm cannot reproduce from rust sources; rollSafety
  fails at the identical line 202 through the identical GL-driver stack (its browser-driven
  chaos-rolls case, sandbox Chromium/GL); accum aborts natively (exit 134) after the identical
  69 [ok] checks on both trees with identical native stack frames (sandbox Chromium/GL). CI is
  authoritative for all three.
- `npm run format:check`: clean over the whole tree (run with the project's pinned prettier from
  a sibling base install against this tree; the one file prettier-written was the new suite).
  `npm run lint`: 0 errors; 11 warnings, all pre-existing in untouched files (the same count
  slice A recorded) — the five files this slice touched lint clean individually (0/0).

## New-assumption sweep (standing rule)

| Grep | Result |
|---|---|
| Selfchecks asserting scale bounds on coupled resolver output | **One hit — slice A's own suite.** Its resolver harness ran the DEFAULT layout (breath 0.3), so its "bounded by the factors" pin silently assumed scale was the only culture consumer. With breath now a second consumer on the same build, item ratios legitimately leave the pure scale band. Reconciled in place: the harness zeroes the living-motion amounts with a comment saying why — the suite pins the SCALE fold, and its pins stand at full strength; the byte-identity-under-live-breath pins moved to this slice's suite, which pins dial-0/publication-alone/dial-without-field identity with the floor live. |
| Consumers of the breath channel (`evaluateKineme` callers, kineme ctx builders) | buildPlacements + `kineme.selfcheck` only. Every other ctx lacks `fieldBreath` ⇒ the dealt term, number for number; kineme suite green 10/10. Census/renderFinal paths build their own ctxs without the seam — untouched. |
| Suites resolving with `dishField` stamps | dishLifeCoupling (reconciled, above), liveResolve.dishLife (no coupling key — the seam never forms; green), this slice's suite. No other resolver harness stamps the field slot. |
| FIELD-pattern breath/placement assumptions (selfchecks + e2e) | The FIELD pattern is texture-only (no glyphs, no breath parameter) — `patternModes` and FIELD-deal suites assert pattern deals, not breath; nothing to reconcile. e2e: zero `dishField` hits; the three e2e "breath" hits are a pinned control-name list (`roll-scope`), a UI comment (`slider-tones`) and a prose metaphor (`topbar-expand`) — none reads the breath channel. |
| The published frame-kineme read (`getLastFrameMotion` consumers) | `composition/motionLive.js` reads only `amounts` and `rhythm` off the ctx; the added `fieldBreath` key is inert there (same shape as the quiet culture's `culture` key, which already rides the ctx with a `sample` closure). |
| Word/value gaining new meaning | `fieldBreath` is a new key name, coined here; grep over src shows only this slice's files. `cultureBreathFactor`/`BREATH_*` likewise new, beside slice A's names in the seam module. |

## Files

New: `app/src/engine/dishLifeBreathing.selfcheck.mjs`, this report.
Touched: `app/src/engine/dishLifeCouple.mjs` (breath constants + `cultureBreathFactor` + header),
`app/src/engine/kineme.js` (the breath block reads the seam when handed it; one import),
`app/src/gl/liveResolve.mjs` (`livingMotion` trailing parameter + the one call site passes the
shared seam object; comment at the coupling read), `app/src/engine/dishLifeCoupling.selfcheck.mjs`
(harness isolation, comment-recorded), `app/selfcheck.manifest` (+1 line).
Untouched by design: the seam's sampler and slice A's fold, the store dial and chip (no new dial,
no chip, no toggle), the producer (`liveLoop`), the pure culture engine and stage, buildPlacements
itself (the breath rides the kineme ctx it already consumes), and every pattern-mode file.
