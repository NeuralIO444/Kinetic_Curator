# STAGING REPORT — #1923 DISH LIFE Phase 3: the closed loop (periodic re-seed)

Branch `feat/dish-life-reseed-1923` on base main `736cbf7c`. Built, not pushed, no PR.
Issue title (verbatim): "DISH LIFE: a Game-of-Life culture phase over the petri dish".
The parent issue stays open after this slice: Phase 4 (governor & controls) remains.

## The ruling this builds

Matt's scoping ruling on the issue (2026-11-06): **the Phase 3 closed loop is IN, with periodic
re-seed from the stage — NOT light reinforcement.** The design doc's Phase 3 offered two shapes
(periodic re-seed, or light reinforcement write-back); the ruling took the first and ruled the
second out. Nothing in this slice blends, reinforces, or partially imprints: at a boundary the new
field is exactly what the seeding derivation produces from the stage as it then stands.

## Premise check — what already existed, and the one real defect

Phase 3 was scoped as if the re-seed did not exist. Probing the tree first (probes run against this
worktree's base, before any edit) showed the mechanism has been in the tree since Phase 1 (the
PR #1995 body says it outright: "continuous reduced-rate stepping inside a 12 s cycle, with a
gentle re-seed at each cycle boundary"): both culture clocks are cycle clocks, the stamp's
`wakeMs` is the cycle start, and the stage rebuilds its culture from the current scene whenever the
wake changes. The probes confirmed the live behaviour end to end (boundary field equals the
derivation, no early leak mid-cycle, shed landing, empty-stage unpublish). What did **not** exist:

1. **Any pin of the loop as a system** — multi-boundary tracking with a changing stage, the dial
   at 0, exclusions *at* a boundary, the shed/boundary interaction, restore *across* boundaries.
   The existing pins each covered one wake or one cycle with an unchanged scene.
2. **One real defect, found by the restore probe:** `dishLifeStage.restore()` rebuilt the culture
   with **no bedrock** (`build(..., null, ...)`), while the live path builds against the terrain
   derived from the stage's held/locked marks — and the snapshot never recorded the terrain at
   all. With terrain standing, a restored culture diverged from the live one **at the first
   stepped generation** (seed cells under locked ground alive in the restore, dead in the live
   build; the divergence then evolves). The no-terrain control matched exactly. This defect is
   pre-Phase-3 (it sits in the Phase 1 holder), but Phase 3's replay law — snapshot/restore
   mid-cycle and exactly at a boundary must continue bit-identically, with terrain standing at
   the boundary being the normal case — cannot be honoured until it is repaired, so the repair
   is this slice's one code change.

## The loop law (plain language)

- **When boundaries fall.** The field culture runs in cycles of `FIELD_CYCLE_GENS` = 48
  generations. On the loop clock at `FIELD_GPS` = 4 generations/sec, one cycle is 12 s; the
  stamp's `wakeMs` is the cycle's start and its `gen` the generation inside the cycle. The quiet
  culture rides the same cycle length at its own tempo (8 gens/s, a 6 s cycle). A boundary is
  simply a frame whose stamp carries a new `wakeMs` — there is no boundary event, no timer, and
  no new recorded state: the wake was already in the stamp stream.
- **What re-seeds.** On the first frame of a new cycle the stage discards the old culture and
  derives a new one from the stage **as it stands on that frame**, through the Phase 1 path —
  `seedFromMarks` over the frame's content-layer marks (terrain and tertiary specks excluded,
  pattern/FX layers never stage content), density-normalised into the same band, bedrock built
  from the frame's held/locked marks. It is the wake derivation, not a blend: nothing of the old
  culture carries over — no mixing weight, no reinforcement, no partial imprint.
- **Mid-cycle changes wait.** The seed marks are frozen at the cycle's first frame. A scene
  changed mid-cycle does not leak into the field (terrain excepted: the culture's bedrock tracks
  the current frame's terrain every frame, exactly as it did at wake — locks are bedrock
  continuously, not just at seeding). The new scene takes effect at the next boundary, whole.
- **The generation counter resets.** Each cycle's culture is a new culture object; `gen` counts
  inside the cycle (0…47) and the publication's `gen` follows it. Generation 0 of a new cycle is
  a different culture from generation 0 of the previous one whenever the stage changed — the
  wake, not the generation, names the cycle. (On slice C's TIDES key: this slice as first built
  changed nothing about generation semantics and re-flagged slice C's QA note — the key trusted
  gen as content identity within a wake — for the Phase 3 QA pass. That pass **falsified** the
  note's unreachability reading; the correction and the key fix are the follow-up section below,
  and they supersede the note as recorded in slice C's report.)
- **Shed interaction (the holder's existing discipline, now pinned).** The boundary **lands**
  under the governor's hold: at shed 2 (CULTURE HELD) the re-seed still happens — the stage
  rebuilds on the new wake and the publication shows the *new* seed at generation 0 — but no
  generation steps while the hold lasts. At shed 1 (CULTURE TRICKLE) the catch-up steps at most
  one generation per frame. On release the culture catches up toward the loop clock's target
  inside the **new** cycle (bounded per frame like any catch-up). The held cycle's remaining arc
  is skipped, never waited out or resumed — the clock, not the culture, owns the schedule.
- **Empty stage at a boundary.** If the boundary frame carries no seedable marks, the field
  unpublishes (no stale arrays retained) and re-wakes on the first later cycle whose stage
  carries marks, deriving from that stage.
- **A skipped cycle never exists.** If stamps jump over a whole cycle (a long frame, a replay
  seek), the stage rebuilds once from the landing frame's stage and steps toward the landing
  stamp's target, shed-bounded as usual. Deterministic, because the stamp stream is the whole
  input.

## The dial question — read, verified, and flagged

The brief for this slice directed that the re-seed must not depend on the coupling dial, and
instructed: verify against the design doc and the issue comments; where they say otherwise,
follow them and flag it. The comments say otherwise about the *mode's live production*: Matt's
2026-11-06 scoping ruling settled the open control question as "**coupling-above-zero is the
on-switch (no chip, starts at 0)**", and slice A built the producer on it (the live loop stamps
the field only while the dial is up). This slice therefore does **not** touch the producer.

What the loop law does guarantee — and the new suite pins at resolver level — is that the
**re-seed itself has no dial anywhere in it**: the stage holder never receives the dial (the
resolver feeds it stamps only; `dishFieldCoupling` is read solely by the consumers' fold). A
recorded stream carrying field stamps with the dial at 0 wakes, steps, publishes and re-seeds
at every boundary while every resolved frame stays byte-identical to the plain resolver. The
dial governs consumers; the culture's lifecycle — wake, step, re-seed — is stamp-driven alone.
If Matt later wants the field to run live at dial 0, that is a one-spot producer change (and a
Phase 4 controls conversation), not a change to anything built here.

## The one code change — the terrain rider

`app/src/engine/dishLifeStage.mjs` (the shared holder: field, quiet and visual modes alike):

- The stage now retains the terrain marks each build derived against (frozen copies, like the
  seed marks), refreshed whenever the standing culture's bedrock is refreshed.
- `snapshot()` emits them as an **optional `terrain` rider, present only while terrain stands**
  — snapshots on terrain-free stages are byte-identical in shape to today's, and pre-rider
  snapshots carry no key.
- `restore()` derives the bedrock from the snapshot's terrain (via the holder's own
  `bedrockOf`) and builds against it — the same derivation the live build used. A snapshot
  without the rider restores exactly as it always did (no bedrock): backward-compatible by
  construction, and pinned as such in the suite.
- `app/src/gl/liveResolve.mjs`: `checkDishLifeSnapshot` accepts the rider and refuses a
  non-array one, mirroring the quiet/field riders' terms.

No consumer (slices A–D), no seam, no clock, no core file is touched. The visual culture shares
the holder, so it gains the same restore fidelity; its behaviour otherwise is unchanged (the
whole dishLife family passes unedited, below).

**The rider's guarantee boundary (QA NIT 1, stated for the record — no code change).** Restore
is exact **iff bedrock was constant across the cycle up to the snapshot**. The rider records the
terrain standing at snapshot time, and restore rebuilds the whole cycle under that bedrock; the
live culture, by contrast, lives under bedrock that tracks the current frame's terrain every
frame. If terrain appears (or lifts) mid-cycle, the live culture evolved under a changing
bedrock while the restored one replays the cycle under the final one, and the two diverge. That
is pre-existing semantics — the live path itself applies bedrock per-frame — not a defect this
slice introduced or repairs; outside that boundary the rider restores the historical
no-bedrock behaviour only when no terrain stands at all.

## Follow-up (Phase 3 QA) — the TIDES key gains the wake

The Phase 3 QA pass ruled on the question carried since slice C: whether the coupled-TIDES
`patternKey` component — `'K', gen, dialBucket`, with no wake and no content — could name two
different frames the same. Slice C's report recorded the collision as **unreachable**. **That
record is corrected here: the reading was falsified.** QA demonstrated it end to end through the
one corner this slice's loop law makes sharp:

- Shed ≥ 2 (CULTURE HELD) through the last frame of a cycle, released exactly on the boundary
  frame, dial up, a still (DRIFT 0) coupled TIDES on stage. Held frames carry no descriptor
  (the coupling folds to 0; the key is the dealt key). The boundary frame's one-frame-behind
  read is the **old** cycle's generation-0 grid → key `K(0, bucket)`, and the old pixels upload.
  The next frame's read is the **new** cycle's generation-0 grid → the **same** key `K(0,
  bucket)` over a different grid (~29k of ~230k words) — and the renderer's upload gate
  (`renderer.mjs`: upload iff the key changed) skipped the upload. The stage showed the previous
  cycle's TIDES texture for about one generation interval, then self-healed as gen advanced.
  The resolver's output was never wrong; the texture was transiently stale.
- A second door, same shape: a cross-wake stamp jump/seek landing on the same published
  generation as the previous frame's read — one stale frame.

**What actually held in slice C's defence** — and it is worth naming precisely, because it is
the invariant the fix now completes rather than replaces: within a wake, the published
`(gen, level)` pair is atomic. The core writes `level` only inside `publish()`, which runs only
from `createCulture` (which sets gen) and `stepCulture` (which increments gen first); a
bedrock refresh (`setBedrock`) kills blocked cells in the state buffer but does not re-publish
level. So inside one wake, gen alone really did name the grid, and the per-layer previous-frame
gate meant only consecutive frames could ever collide. What the key lacked was anything naming
the wake — and generation restarts at 0 every cycle, which is this slice's own loop law.

**The fix (a follow-up commit on this branch).** The wake now rides the descriptor into the key:

- `dishLifeStage.mjs` — the stable `publishedField` exposes `wakeMs` beside `gen` (the stage's
  own wake, mirrored by the same `syncPublished`; null while nothing is published).
- `dishLifeCouple.mjs` — the slice-C snapshot `fieldLevelGrid` carries `wakeMs` through (a
  publication with no wake snapshots as −1).
- `patternSource.js` — `patternKey`'s K component is now `'K', wake, gen, dialBucket`, same
  format discipline otherwise. **Uncoupled keys are byte-identical to before** (the component
  exists only for a coupled TIDES); coupled keys change only by gaining the wake.
- `dishLifePatterns.selfcheck.mjs` — the coupled-key pin is re-pinned **with the cause recorded
  in the test**, and QA's exact corner is pinned as a regression at resolver level (held through
  the cycle end, released on the boundary frame, DRIFT 0 still TIDES: the second gen-0 frame's
  key differs from the first, so the upload gate fires). The pin lives in this suite because it
  owns the coupled keys — its harness already builds the resolver, the pattern layers and the
  keys; the reseed suite owns boundaries but has no pattern/key surface to pin against.

**Both doors close on the wake — traced, not asserted.** A stamp is a pure function of loop
time (`fieldStamp`: `wakeMs = cycle × cycleMs`), so any jump or seek crossing a cycle boundary
lands on a different `wakeMs` by construction. A jump landing *within* one cycle cannot produce
two consecutive descriptors sharing (wake, gen) over different grids: forward, the stamped
target gen only holds (no step — the publication, grid included, is untouched) or rises (gen
separates the keys); backward, the stage's seek-back rebuild leaves the publication at a gen
strictly below the pre-jump one, so the post-jump descriptor's gen differs from its
predecessor's. Restore lands under the guarantee boundary stated above: while bedrock is
constant across the cycle, a restored (wake, gen) names the same grid as the live one. No grid
hash is needed — the two doors were both cross-wake, and the wake is now in the key.
STAGING-REPORT-1923-P2C.md is left untouched: it stands as slice C's history, corrected here.

## Replay argument

The boundary stage is the resolver's resolved layers for the boundary frame — a pure function
of the recorded input stream — and the derivation is a pure function of those layers. The wake
that triggers the rebuild already rides the recorded stamp (`dishField` / `dishLife`), and the
dial rides beside it (`dishFieldCoupling`); snapshot/restore crosses boundaries through the
stage snapshot, whose marks are the cycle's frozen seed source and whose `gen` is inside-cycle,
so a restore re-derives the cycle it belongs to and steps to the recorded generation — now
including its terrain. No new stamp, key, or recorded state was needed anywhere; the suite
proves bit-identity across two boundaries from fresh resolvers, and restore-continuity from
cuts taken mid-cycle and on a boundary frame itself.

## Suite — `dishLifeReseed.selfcheck.mjs`, 15 cases, 10/10 repeat runs

Stage level: boundary field equals the independently computed derivation (gens 0–12) ·
boundary−1 is pure evolution of the old seed · no early re-seed across a full cycle ·
second boundary derives from the then-current stage and differs from the first · stamp jump
over a whole cycle · terrain + pattern-layer exclusions at a boundary, bedrock cells never
alive · boundary under shed 2/1/0 · empty stage at the boundary · the quiet holder's boundary
obeys the same law (its sampler reads the re-seeded culture) · two-boundary replay
bit-identical twice · restore mid-cycle and at the boundary with terrain standing ·
rider optionality / legacy restore semantics.
Resolver level: dial 0 across a boundary (frames plain, snapshot proves the loop ran and
re-seeded) · the boundary seed is the boundary stage's own marks (scene dealt from a new seed
at the boundary; the cycle-2 frozen marks equal a fresh run's marks for that scene) ·
two-boundary replay + restore from a mid-cycle cut and a boundary cut with consumers live ·
the validator takes the rider and refuses a malformed one.

## Verification

- New suite: **15/15, 10/10 consecutive runs** (plus 3/3 after the prettier pass).
- Neighbours, all **unedited**: dishLife · dishLifeSeed · dishLifePhase · dishLifeRender ·
  dishLifeStage · dishLifeQuiet · dishLifeField · dishLifeCoupling (18) · dishLifeBreathing (20) ·
  dishLifePatterns · dishLifeBackgrounds · kinemeCulture · dishLifeChip · liveResolve.dishLife ·
  resolverSnapshot · performanceDishLife · governorDishLife — all OK. Golden placement and the
  placement census pass unedited (the golden hash is unmoved; nothing about ordinary frames
  changed — the only code delta is snapshot/restore internals plus a validator rider).
- **Full manifest sweep** (continue-on-error, `app/selfcheck.manifest`, 625 commands incl. the
  new suite): **622 pass / 3 fail** — `swarmWasm`, `rollSafety`, `accum`. All three proven
  **base-identical** by paired runs from a same-location worktree under `~/workspace` at base
  `736cbf7c` (removed after): swarmWasm exit 1 on both, the identical `build-wasm.sh --verify`
  assertion at :136 (no rust toolchain in this sandbox); rollSafety exit 1 on both, the
  identical `page.evaluate: Target crashed` thrown at :202 (sandbox Chromium death);
  accum exit 134 (native abort) on both after the identical 69 [ok] lines, byte-identical
  (the only output differences are the pid and GC heap addresses in the crash dump).
- `npm run format:check` clean tree-wide (the new suite was prettier-written once).
  `npm run lint`: 0 errors; 11 warnings, all pre-existing in untouched files.
- **Follow-up commit verification.** `dishLifePatterns` — the one suite the fix touches — is
  **20/20 (19 cases + the QA-corner regression), 10/10 consecutive runs** (and 3/3 again after
  the prettier pass). Neighbours unedited unless noted, all OK: dishLifeCoupling 18/18 ·
  dishLifeBreathing 20/20 · dishLifeBackgrounds 12/12 · dishLifeReseed 15/15 · dishLifeField
  11/11 · dishLife · dishLifeSeed · dishLifePhase · dishLifeRender · dishLifeStage ·
  dishLifeQuiet · dishLifeChip 8/8 · liveResolve.dishLife · patternRender 22/22 ·
  patternTrack 17/17 · sceneContract 15/15 · goldenPlacement (hash unmoved) · census OK.
  **Full manifest sweep: 617 pass / 3 fail of 620 real commands** (625 manifest lines, 5 of
  them comments) — the same three sandbox-environment failures as the slice as first built
  (`swarmWasm`, `rollSafety`, `accum`, each already proven base-identical at this base); the
  failing set did not change, so no new paired proof was owed. format:check clean (the patterns
  suite was prettier-written once); lint 0 errors, the same 11 pre-existing warnings in
  untouched UI files.

## New-assumption sweep (standing rule)

| Grep | Result |
|---|---|
| `cycleGens` / `FIELD_CYCLE_GENS` pins in selfchecks | Only the dishLife family + `liveResolve.dishLife` reference them; all pass unedited. Cycle semantics are untouched by this slice. |
| `generation` reads in culture suites | dishLife family + `performanceDishLife` + `governorDishLife` — all pass unedited. |
| Review-loop suites (poemRow et al.) reading culture generation | `poemRow.selfcheck.mjs` carries no culture/generation/dishField reference at all — the review loop does not read the culture's generation. Clear. |
| Slice C pattern key (gen component) | Untouched: generation semantics are Phase 1's and unchanged. The slice-C QA note on the key is re-flagged in the loop law above for this slice's QA. |
| Snapshot-shape pins (`snap.field` / `snap.quiet` deepEquals, `checkResolverSnapshot` users) | Rider values only — no suite deep-equals a whole stage snapshot's key set; the new key is additive-optional on the quiet/field riders' exact terms. resolverSnapshot + all snapshot consumers pass unedited. |
| `terrain` references in selfchecks | Only the dishLife family (core/seed/stage/field) + the new suite. Clear. |
| e2e specs | `grep dishLife / dishField / terrain e2e/` — zero hits before and after; no e2e surface touched. |

## Files

New: `app/src/engine/dishLifeReseed.selfcheck.mjs`, this report.
Touched: `app/src/engine/dishLifeStage.mjs` (terrain retained per build, snapshot rider,
restore derivation), `app/src/gl/liveResolve.mjs` (the snapshot validator's rider check),
`app/selfcheck.manifest` (+1 line). The culture core (`dishLife.mjs`), the seed derivation, both
clocks (`dishLifeField`, `dishLifeQuiet`), the phase clock, the seam (`dishLifeCouple.mjs`), the
producer (`liveLoop`) and every Phase 2 consumer are **untouched**.

Follow-up commit (the TIDES key fix, above): `app/src/engine/dishLifeStage.mjs` (the publication
gains `wakeMs`), `app/src/engine/dishLifeCouple.mjs` (the level snapshot carries the wake),
`app/src/pattern/patternSource.js` (the key's K component gains the wake),
`app/src/engine/dishLifePatterns.selfcheck.mjs` (key re-pin with cause + the QA-corner
regression). The seam's laws and every consumer's behaviour are unchanged; only coupled-TIDES
cache keys move.
