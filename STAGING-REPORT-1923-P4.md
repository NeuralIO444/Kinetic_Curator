# STAGING REPORT — #1923 DISH LIFE Phase 4: governor & controls (the final phase)

Branch `feat/dish-life-controls-1923` on base main `60129ffc`. Built, not pushed, no PR.
Issue title (verbatim): "DISH LIFE: a Game-of-Life culture phase over the petri dish".
This is the issue's final phase: with it, every phase of the Stage Coupling Revision has shipped.

## Scope — the design doc's Phase 4 list, item by item

| Doc item | Verdict |
|---|---|
| Coupling strength (slider or CC) | Already shipped (Phase 2 slice A: the `dishLifeCoupling` dial in the chip). Not rebuilt. |
| Explicit "Seed from stage" trigger | **Built** — a SEED button in the DISH LIFE chip (see "The trigger" below). |
| Optional re-seed interval | **Built** — a CYCLE detent button in the chip: 24 / 48 / 96 generations (see "The interval" below). The doc marks it optional; the survey found it rides the existing stamp derivation cleanly, so it is built. |
| Field mode ignores / softens the 8 s idle requirement | Already law since Phase 1 (Matt's amendment: idle-only scopes to the visual culture). **Verified on this tree, pinned in the new suite** — see "Idle law". |
| Visual culture keeps "any touch kills it" | Already law in the phase clock. **Verified, pinned** — same section. |
| UI / MIDI / OSC surface (existing control patterns) | UI built. **MIDI: surveyed, nothing built** — no chip control is on the MIDI registry (cause below). **OSC: no OSC surface exists in the tree** (the only "osc" in the codebase is the kineme oscillator kinds). |
| Birth / death / high-activity spikes into the event log (low priority) | **Deferred with cause** — the event bus carries no field events at all today; a spike channel would be a new event family with no consumer. The culture is already log-accountable the way the admission test means it: its stamps, its dial and its snapshots are all in the recorded stream. Revisit if a consumer for field events ever exists. |

**Family gating (Matt ruled 2026-11-07, recorded on the issue): kept as-is.** The field runs only
while the family is on AND the dial is above 0. The producer's on-switch is untouched; the trigger
changes nothing about gating — with the family off or the dial at 0 there is no field to seed, and
a press then has no field effect (the mechanism below makes that precise).

## The trigger — how a press reaches the culture

The chip's other controls reach the resolver as store state → live loop → stamp on the recorded
input. The press follows that exact path, in the only shape a momentary act can:

- **Store** (`globalSlice`): `dishLifeSeedPulse`, a counter; the chip's SEED button calls
  `pulseDishLifeSeed()`. Runtime only, never serialized, and deliberately NOT part of the chip's
  stored preference — a press is an act, not a setting.
- **Producer** (`liveLoop`): the loop consumes the pulse **every frame**, stamped or not, comparing
  against the last value it saw (the first frame adopts the store's value silently, so nothing
  fires on load). A press consumed on a frame that produces a field stamp (family on, dial up)
  rides that stamp as `seed: true`. A press consumed on any other frame is **spent** — it never
  fires late when the dial rises. That is the gating ruling expressed as a mechanism.
- **Stage** (`dishLifeStage`): a field stamp carrying `seed`, while a field culture stands in the
  same wake, forces the wake build on the press frame's scene. From there the ordinary machinery
  runs: bedrock from the frame's terrain, stepping toward the stamp's generation bounded by the
  stamped shed.

### The wake law is preserved — traced, not asserted

Phase 3's key proof rests on the stamp being a pure function of loop time
(`fieldStamp`: `wakeMs = cycle × cycleMs`). This phase does not touch `fieldStamp` or the cycle
clock at all. The press changes **which scene seeds the standing wake**, never the wake: the
publication's `wakeMs` before and after a press is the same number (pinned), so every Phase 3
argument — the boundary derivation, the seek doors, the TIDES key's wake component — reads exactly
as it did. A press IS a boundary in every other respect: it derives through `seedFromMarks` from
the press frame's stage, exclusions and bedrock identical.

- **Catch-up, not teleport.** The rebuilt culture steps toward the stamp's generation under the
  shed bound (4 / 1 / 0 per frame), the same discipline as a stamp jump over a skipped cycle. The
  press is an early boundary in seed, not in phase: the culture rejoins the cycle's generation.
- **Under CULTURE HELD (shed 2), the press LANDS**: the rebuild happens, no generation steps, the
  publication shows the new seed at generation 0 — the pinned boundary-under-hold law, verbatim.
  Trickle bounds the catch-up to one step; on release the culture catches up inside the same wake.
- **On an empty stage, the press unpublishes** (no seedable marks, or no content layer at all) —
  a boundary on an empty stage, verbatim. A returning scene re-wakes on its own cycle; the press
  is forgotten.
- **On the boundary frame itself, the press is absorbed**: the boundary's own build already derives
  from that frame's scene, so there is nothing extra to do (and the epoch below stays 0).
- **Before any field culture, or on another mode's stamp, the flag is inert** — the trigger seeds
  the field culture only; the quiet culture standing on a shared holder never re-seeds on it
  (pinned by lockstep comparison).

### The seed epoch — the one new piece of state, and why it exists

A press rebuilds the culture *inside* a wake. Phase 3's completion of the TIDES key rests on
"(wake, gen) names the grid" — true while one wake holds one seed. A press breaks that premise:
at 4 generations a second, the stamp's generation repeats across many frames, so a press can land
the new seed on a generation the old seed just published (press at stamp gen 3: the frame before
reads the wake seed's gen-3 grid; the press frame reads the press seed's gen-3 grid — same wake,
same gen, same dial). Without a discriminator, two consecutive coupled-TIDES frames would share a
key over different grids: precisely the stale-texture defect Phase 3 QA demonstrated across wakes,
reopened within one.

So each build carries a **seed epoch**: 0 for the wake's own seed, +1 per press inside the wake.
It rides the same path the wake rides — `publishedField.seedEpoch` (mirrored by the same
`syncPublished`), the seam's `fieldLevelGrid` snapshot, and the coupled-TIDES key, whose K
component is now `'K', wake, epoch, gen, dialBucket`. Discipline, mirroring Phase 3's:

- **Uncoupled keys are byte-identical** (the component exists only for a coupled TIDES); coupled
  keys change only by gaining the epoch. A grid carrying no epoch keys 0, identical to an explicit
  epoch 0 — every grid built before the trigger existed keys as it did at epoch 0.
- **Within a wake, (epoch, gen) names the grid**: the epoch increments on exactly the builds that
  replace the seed; the seek-back rebuild (same seed) and restore preserve it.
- **Snapshots**: the epoch rides as an **optional `seedEpoch` rider, present only while a press
  stands in the wake** (Phase 3 terrain-rider terms). The validator accepts a non-negative integer
  and refuses anything else; pre-Phase-4 snapshots carry no key and restore as epoch 0 — the
  historical restore, exactly.

## The interval — detents on a field the stamp already carried

`cycleGens` has ridden every field stamp since Phase 1, and the stage snapshot's `field` rider has
carried it since then too — the interval was always a recorded input; it simply had no control.
Phase 4 gives it one: the clock module owns a detent set (`FIELD_CYCLE_DETENTS` = 24 / 48 / 96,
`clampCycleGens` snaps junk and off-detent values to the default), the store holds
`dishLifeCycleGens`, the loop passes it to `fieldStamp`, and the chip's CYCLE button steps the
detents (a discrete choice renders TE — a stepping button, not a third slider). The default is 48,
so an untouched instrument stamps byte-identically to before, and existing takes (whose stamps
carry their own cycleGens) replay unchanged. Changing the detent mid-cycle moves the wake on the
next stamp — the derivation is self-describing per stamp — which is an ordinary wake change to
the stage: a re-seed on the new cycle's terms, recorded in the stream like any other. The quiet
culture's cycle is its own constant and is not touched.

The interval joins the chip's per-viewer preference as an optional key in the same rider sense:
a preference stored before Phase 4 carries no `cycleGens` and reads as 48 (the chip suite's pref
cases are re-pinned with the cause recorded, as Phase 2 did for `coupling`).

## MIDI — surveyed, nothing built (cause)

A registry exists: `app/src/midi/targets.mjs` (#617) is the one list the learn UI, the engine and
the sanitizer all read, and it exposes layout parameters (PARAM_SPEC sliders), ACCUM gestures,
feels, voice picks and the voice MIX fader. **No footer chip control is on it** — not this chip's
own strength and coupling dials (shipped Phases 1–2 unregistered), not any sibling chip's. The
brief's condition — expose the new controls the same way *if sibling chip controls are exposed* —
does not hold, so nothing is built here. Registering only the seed trigger while the chip's own
dials stay off the registry would be the incoherent half-measure; registering the whole chip is a
MIDI-surface decision beyond this phase's scope. Noted for whoever takes the chip to MIDI whole.

## Idle law — verified on this tree

- **FIELD is exempt**: `fieldStamp` has no touch or idle input in its signature — its output is a
  function of loop time, shed and cycle length only — and the producer stamps it on the dial alone,
  outside the phase clock's status. The new suite pins the derivation directly: touches landed on
  a phase clock do not move `fieldStamp`'s output.
- **The visual culture still dies on any touch**: the phase clock's `touch()` ends a running wake
  at once, from any ruled source — pinned since slice 3a (`dishLifePhase` suite, case B) and
  passing unedited.
- No gap found; the only new pin is the controls-level restatement above.

## Suite — `dishLifeControls.selfcheck.mjs`, 13 cases, 10/10 repeat runs

Stage level: press = early boundary (derivation equality, wake unmoved, catch-up to the cycle's
phase) · held press lands at generation 0, trickle bounds, release catches up in the same wake ·
empty-stage press unpublishes (both empty shapes) · boundary-frame press absorbed, second press
bumps the epoch again · first-frame press builds as a plain wake; a `seed` flag on a quiet stamp
is inert (lockstep snapshot equality). Epoch/snapshot: rider present only while a press stands ·
restore keeps the epoch and continues bit-identically · stripped rider restores as epoch 0 ·
validator terms (at resolver level: genuine validates; string / negative / fractional refused;
explicit 0 legal). Seek-back after a press rebuilds the press seed, epoch preserved. Key seam:
pre- and post-press grids at the same (wake, gen) separate by epoch in the coupled-TIDES key;
a bare holder snapshots as epoch 0. Interval: detents clamp, default unmoved, stamp derivation at
24 / 96, a stage re-seeds on a detent cycle's own boundary. Idle law as above.
Resolver level: a 45-frame stream with a press replays byte-identically on a fresh resolver; a
snapshot cut after the press restores and continues bit-identically with consumers live ·
dial 0 with a press: every frame plain against an identical no-field stream, while the snapshot
proves the press re-seeded the field from the press frame's re-dealt stage.

## Verification

- New suite: **13/13, 10/10 consecutive runs** (and again after the prettier pass).
- Neighbours, all **unedited**: dishLifeCoupling 18/18 · dishLifeBreathing 20/20 ·
  dishLifePatterns **20/20** (the key case gains the epoch assertions, re-pinned with cause in
  the test — same case count) · dishLifeBackgrounds 12/12 · dishLifeReseed 15/15 ·
  dishLifeField 11/11 · dishLifeChip **10 cases** (pref re-pin with cause + interval/stepper
  cases + the new wiring case) · dishLife · dishLifeSeed · dishLifePhase · dishLifeRender ·
  dishLifeStage · dishLifeQuiet · dishLifeSpike · liveResolve.dishLife · dishLifeTouchDom ·
  kinemeCulture · governorDishLife · governorCuts · performanceDishLife — all pass.
- Source-shape / reader suites for every touched file, all passing unedited: liveLoopScope ·
  liveLoopSwell · resolverSnapshot · patternRender 22/22 · patternTrack 17/17 · sceneContract
  15/15 · midi · helpModal · casingInCss · goldenPlacement (hash unmoved) · census OK.
- **Full manifest sweep** (continue-on-error over `app/selfcheck.manifest`, now 626 lines / 621
  real commands incl. the new suite): **616 pass / 5 fail under a 120 s per-command cap**. Two of
  the five are cap artifacts, proven by uncapped re-runs on this tree: `patternRender` (22 checks
  passed, ~3 m 28 s — browser-section waits) and `composite` (15 cases OK, ~3 m 24 s). The true
  failing set is the standing three — `swarmWasm`, `rollSafety`, `accum` — the sandbox-environment
  failures proven base-identical by paired runs in Phase 3 at this base's parent, in files this
  phase does not touch; effective tally **618 pass / 3 fail**.
- `npm run format:check` clean (two new/edited suites were prettier-written once).
  `npm run lint`: 0 errors; 11 warnings, all pre-existing in untouched files.
- e2e: `grep dish / dish-life in app/e2e/` — zero hits before and after; no e2e surface touched
  (the chip's new buttons carry no e2e selectors anywhere).

## Files

New: `app/src/engine/dishLifeControls.selfcheck.mjs`, this report.
Touched: `app/src/engine/dishLifeStage.mjs` (the press rebuild, the seed epoch, the snapshot
rider) · `app/src/engine/dishLifeField.mjs` (the detent set + clamp) ·
`app/src/engine/dishLifeCouple.mjs` (the level-grid snapshot carries the epoch) ·
`app/src/pattern/patternSource.js` (the key's K component gains the epoch) ·
`app/src/gl/liveResolve.mjs` (the snapshot validator's rider check) ·
`app/src/gl/liveLoop.mjs` (pulse consumption; the detent and the press ride the field stamp) ·
`app/src/state/slices/globalSlice.js` (the pulse counter, the interval field) ·
`app/src/components/DishLifeChip.jsx` (SEED + CYCLE buttons) ·
`app/src/components/dishLifeChip.model.mjs` (the pref's interval rider, the detent stepper) ·
`app/src/components/dishLifeChip.selfcheck.mjs` (re-pins + new cases) ·
`app/src/engine/dishLifePatterns.selfcheck.mjs` (key re-pin with cause) ·
`app/src/data/helpCopy.js` (the two controls' help entries) · `app/src/styles/layout.css`
(the buttons' chip-group spacing) · `app/selfcheck.manifest` (+1 line).
The culture core (`dishLife.mjs`), the seed derivation, both clocks' derivations
(`fieldStamp` / `quietStamp`), the phase clock, and every Phase 2 consumer's law are **untouched**.
