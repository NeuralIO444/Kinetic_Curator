# STAGING REPORT — #1576 Travel kinemes P3 (SURGE: z-approach + parallax drift) (LOCAL ONLY — no push, no PR)

Branch: `ember/1576-travel-surge` (local only — not pushed, no PR)
Base: stage-2 branch tip `0c631d9e` (#1575 P2, committed locally)
(This file replaces stage 2's staging report at the worktree root; stage 2's remains in git history.)

## What was built, in plain language

Two quiet ways for a scene to move in depth, both behind amounts that
ship at **0 (off)**:

- **SURGE** — a z-approach. When a surge fires, every unpinned mark
  first **settles away** — it shrinks a touch, sinks a touch, softens —
  for about half a second (the anticipation; anime timing law, and a
  surge that starts at full speed is a bug by the issue's own words).
  Then it approaches: it grows to 1.55×, rises 26 px, and its alpha
  sharpens toward solid, holds the peak briefly, and eases home.
  The whole flight is 96 locked steps (1.6 s). z is a driver channel:
  a pure read (`surgeZRead`) folds z into scale / rise / alpha at
  placement time, exactly the way the kineme drivers fold breath and
  drift — placements are never rewritten, and the packer packs the
  folded values it always packs.
- **Parallax drift** — surge's quiet sibling. A slow, constant anchor
  drift: each mark slides +x at **2.5 px/s × amount × its zTier**.
  Ground (tier 0) never moves; tier 3 moves three times tier 1. Calm
  (even fully still-transport) scenes drift through space,
  foreground faster than ground. It is a pure function of the scene's
  banked step count — no per-mark state at all.

Both ride the **locked step clock** and resolver-owned stores exactly
as P1/P2 established (same seed + same input sequence = same frames,
bit for bit, proven in the suites). Both are **travel** to the
governor: the existing cut 1.6 now also arms on either amount, and
under its shed surge **dies** (envelope killed mid-flight, frame is
home, a held trigger cannot re-fire on restore) while parallax
**presents home with its clock frozen** (the PATH shed's law — resume
continues, never jumps). No rung moved; `governorCuts.js` is
untouched — only the hook's `travelActive` derivation gained the two
amounts.

The **surge amount** control lives where stage 1's ruling put it:
the **Directors motion group** in DavisPanel, beside a matching
parallax amount row. Both rows show in every transport mode (surge
and drift compose on still scenes too). No new panel, nothing in BUILD.

## ⚠ OPEN FORK — Q3, the surge trigger, is NOT built (awaiting Matt's ruling)

**Q3 has no ruling from Matt**: what fires a surge — the beat, the
Queen (unnamed, effect-only, as always), a manual perform control, or
all three with a pecking order — is undecided, and per the dispatch
**no trigger surface was chosen or built**: no beat wiring, no Queen
wiring, no perform button, no panel control that fires anything.

What exists is the machinery behind an **input signal**: the resolver
input field **`surgeTrigger`** (0..1 demand), threaded by liveResolve
into the surge pass like `travelShed` is threaded for P1. **Nothing
stamps it** — liveLoop is untouched — so it defaults to 0 and the
machinery is **inert in the live instrument**: amount up, no trigger,
no surge, forever (the suite pins this). The trigger law the
machinery implements (and Q3's surface will inherit): a rising edge
while idle fires **one** envelope at the demand's strength; a trigger
mid-flight is ignored; a held trigger fires once. Selfchecks drive
the machinery with synthetic trigger envelopes and prove
anticipation + the z read that way; the census exercises it the same
honest way (its surge fixture carries a synthetic trigger of 1).

Inherited open forks, still unruled, also not built (unchanged from
stages 1–2): **Q2** traveler budget, **Q4** per-stratum leash.

## The kill-criterion split (separability, structural)

The issue's kill criterion — surge reads as a cheap zoom gimmick →
parallax ships, surge comes out — is built as a file boundary:

- **Surge is `app/src/engine/surge.js`, entire.** It imports only the
  step constants from kineme.js (one-way); **kineme.js itself has a
  ZERO-LINE diff against the stage-2 base** (verified with
  `git diff 0c631d9e`), and `parallaxDrift.js` never imports surge.
- **Parallax is `app/src/engine/parallaxDrift.js`, entire**, with its
  own store, suite and cost registration.
- Each has its **own selfcheck suite** (`surge.selfcheck.mjs`,
  `parallaxDrift.selfcheck.mjs`), so the split is provable by suite:
  deleting surge's suite cannot touch parallax's.
- The removal surface for surge is exactly: `engine/surge.js`, its
  suite + manifest line, the surge pass in `buildPlacements.js`, the
  surge store + `surgeTrigger` thread in `liveResolve.mjs`, the
  `transportSurge` key, the surge RangeRow in DavisPanel, the surge
  term of the governor hook's `travelActive`, and the census surge
  fixture/driver. Nothing else knows surge exists.

## New recipe keys (named exactly — for the coordinator's strip-proof)

This stage adds exactly **two** new layoutParams keys:

- `transportSurge` — numeric, 0..1, default `0` (off — the parity gate)
- `transportParallax` — numeric, 0..1, default `0` (off — the parity gate)

Both ride defaults-merged layoutParams like P1/P2's keys, so the
resolver output echoes them and the recorded fixtures behind
`gl/replayGate`, `gl/creatureGate` and `engine/wingWarp` move again —
the same documented, strip-provable mechanism as stages 1–2, now with
these **two additional keys** to strip (`transportSurge`,
`transportParallax`). No pin or fixture was re-recorded in this stage.

## Files touched

Implementation:
- `app/src/engine/surge.js` — **NEW.** The whole surge machinery:
  `surgeEnvelope` (pure; anticipation dip → approach → held peak →
  eased release over `SURGE_STEPS` 96), `surgeZRead` (z → scaleMul /
  risePx / alphaLerp), the resolver-owned store
  (`createSurgeStore` / `pruneSurgeStore` / `surgeSceneSnapshot`),
  `applySurge` (step banking, trigger edge law, shed kill, the fold
  into scale/scaleY/y/alpha with a y undo), and the `travel/surge`
  cost-tier declaration (tier 0, measured — below).
- `app/src/engine/parallaxDrift.js` — **NEW.** The whole drift:
  `parallaxDriftOffset` (pure), its store, `applyParallaxDrift`
  (frozen-clock shed), and the `travel/parallax` declaration.
- `app/src/engine/buildPlacements.js` — two new ephemeral inputs
  (`surge`, `parallaxDrift`, never in geometrySignature) and the two
  passes after transport (drift, then surge), each gated on its own
  amount > 0 with the artist's pin (`stillMarks`) as the taming set;
  undos run in reverse. Nothing else in the pipeline moved.
- `app/src/gl/liveResolve.mjs` — owns one surge store + one parallax
  store per resolver (pruned with the document, like the travel
  store); both bases ride the already-measured high-water
  `travelFrameMs` and `input.travelShed`; the surge base also reads
  `input.surgeTrigger ?? 0` (inert — see Q3). slowRender frames get
  neither base (the travel precedent: a frozen frame travels nothing).
- `app/src/data/layout-modes.js` — the two keys: defaults (0),
  `PARAM_SPEC` bounds (0..1), comments. No enum, no normalize change.
- `app/src/hooks/usePerformanceGovernor.js` — `travelActive` gains
  `transportSurge > 0 || transportParallax > 0` (the rung, its order,
  its restore and its badge are P1's, unmoved).
- `app/src/panels/DavisPanel.jsx` — two RangeRows in the Directors
  motion group (`surge`, `parallax`), shown in every transport mode.
  No trigger control (Q3). No new panel.
- `app/src/curator/censusReport.mjs` — `place()` threads the two new
  ephemeral inputs; `surgeCtxFor()` / `parallaxCtxFor()` (fresh store,
  one frozen 100 ms frame; the surge ctx carries the synthetic
  trigger); KEY_FIXTURES for both keys (drivers `surge` / `pdrift`);
  `runFixture` cases for both drivers. Both keys measure as **MOVES**;
  the census dead-knob set is unchanged (`kinemeBrushWobble` only).

Tests:
- `app/src/engine/surge.selfcheck.mjs` — **NEW, 1385 checks:**
  envelope laws, anticipation measured step-by-step through the
  applier, the z read exact, live through buildPlacements (parity at
  amount 0 / store untouched, inert-by-default, determinism over 300
  uneven frames with a synthetic trigger pattern, the peak
  presentation per item, release home bit-exact, trigger edge law,
  shed kill + swallowed held trigger, artist pin), cost
  re-measurement, params.
- `app/src/engine/parallaxDrift.selfcheck.mjs` — **NEW, 270
  checks:** offset laws (exact proportionality to zTier / amount /
  time; zero at amount 0, t 0 and tier 0; constant velocity), live
  through buildPlacements (parity, per-tier drift exact against the
  banked step count, foreground-faster ordering tier by tier,
  determinism, step-chunking, shed freeze + resume-from-frozen, pin),
  cost re-measurement, params.
- `app/selfcheck.manifest` — two lines registering the new suites.
- No existing suite file was modified. In particular
  `travel.selfcheck.mjs` (P1+P2) is byte-unchanged and green.

## Feel / behaviour numbers (sandbox, this build)

Anticipation, measured by the surge suite stepping one mark through
a full envelope at amount 1, strength 1:

- z dips to **−0.220** (the declared `SURGE_ANTICIPATION_Z`), and z
  stays ≤ 0 for the first **29 locked steps (~0.48 s)** before
  crossing zero — the settle-away is a quarter of the flight's rise.
- In presentation the settle reads as scale dipping to **0.879×**
  (with the matching sink and softening) before the approach.
- No full-speed start: **|z| one step in < 0.03**, and every envelope
  joint is slope-continuous (the approach itself eases in-out,
  decelerating into the peak — held extremes).
- Peak: z exactly **+1** (steps 53–67 of 96); presented scale
  **1.55×**, rise **26 px**, alpha lerped **45%** of its headroom
  toward 100. After step 96 the frame is the still frame, bit for bit.

Parallax drift at amount 1 (exact, from the pure function): tier 1
**2.5 px/s**, tier 2 **5.0 px/s**, tier 3 **7.5 px/s**, tier 0
**0** — through the real placement path the suite verifies each
item's displacement equals the function of its own tier and the
banked step count to 1e-9.

Census Jell-O (unchanged scenes, no new amounts): bit-identical to
stage 2's table (flow 38/48 @ 26.47 px; orbit 30.12; spiral 27.75;
sweep 240.02; lissajous 123.75) — P1/P2 behaviour untouched.

## Cost (measured, not estimated)

Both siblings register at **tier 0** on the travel doctrine
(structural, no GPU pass, shed by the governor's own rung):

- `travel/surge` — declared `timeMs: 0.01`, the measured figure:
  `applySurge` at the 800-mark cap with the envelope live, median of
  7 runs × 200 calls = **0.010 ms** (the suite re-measures on every
  run; latest print 0.010 ms).
- `travel/parallax` — declared `timeMs: 0.006`, measured the same
  way = **0.006 ms** (latest print 0.006 ms).

Sandbox-indicative only; real hardware authoritative.

## Acceptance evidence

- **Surge + parallax behind params** — both amounts default 0; the
  passes, stores and panel rows are as above.
- **Anticipation present and measured** — the suite's step trace
  (above): dip depth, 29-step settle, presentation scale dip, gentle
  departure, held peak. **The issue's recorded-clip acceptance is
  review-lane QA for Matt at publish** — no clip is claimed here;
  this staging evidence is the measured anticipation + the
  machinery's live-path proof, per the dispatch.
- **The z→packer read proven** — `surgeZRead` pinned exactly, and the
  peak test verifies per item, through the real placement path, the
  scale / y / alpha values the packer receives.
- **Parallax live** — drift proportional to zTier, foreground faster
  than ground tier by tier, exactly zero at amount 0 (and the store
  untouched — parity).
- **Parity green when off** — both suites' parity sections (amount 0
  bit-identical, store never created), plus the untouched P1/P2
  travel suite green (685 checks) and the census Jell-O table
  bit-identical to stage 2.
- **`npm run build` green**; ESLint clean on every touched file.
- **No golden hash was weakened or re-pinned.** No pin enumerates
  these keys (both are numeric PARAM_SPEC keys — the census row count
  is computed from the spec, and it balances; the structural-key
  constant is untouched).

## Deviations from the issue, and why

1. **Where z is read.** The issue says "the packer reads z". In this
   codebase z is a driver channel (the dispatch's own words), and
   driver channels fold into the stage-C channels at placement time
   (breath/drift/pulse precedent) — the packer
   (`packInstanceData`) packs the folded scale/alpha/positions, it
   does not interpret driver state. So the read lives in
   `surgeZRead` + `applySurge`, proven at the item level (the exact
   values the packer packs). Giving z a contract field + stride slot
   instead would move the replayGate/creatureGate pins and the
   45-float stride for machinery whose trigger is not yet ruled —
   tendrils the kill criterion forbids. Recorded as the reading this
   build stands on.
2. **One envelope for the whole scene; no per-mark stagger.** The
   envelope fires scene-wide at the trigger's strength; marks differ
   only by the artist's pin (which holds them home). Stagger /
   subset choreography is part of the trigger's design space (Q3)
   and none was invented.
3. **Surge ignores the family anchor.** Heavy solids anchor against
   *roam* (anchor position); surge moves no anchor — it is a z event,
   and the whole cast approaches together. The artist's pin still
   tames (z stays 0). Recorded as a builder's call under Q3's open
   choreography space.
4. **Parallax direction and shape.** +x only, linear, **no wrap**:
   at full amount the top tier crosses a 1000 px canvas in ~2.2
   minutes; whether and how a drifted mark wraps is an
   edge-behaviour call with no ruling, so the machinery is the
   provable linear core and the wrap question is recorded here, not
   invented. The zTier factor is the **raw tier** (tier 0 = ground =
   exactly still — the issue's "proportional to zTier" read
   literally), not #796's normalized camera factor; #796's
   `parallax` param and `gl/parallax.mjs` are untouched and the two
   compose independently.
5. **Shed shapes differ per sibling, by their natures.** Surge has
   state and dies with it (FLOW's settle has no analogue for a
   1.6 s envelope — a half-surged hold would be a frozen pose, the
   dishonest frame P1's shed law forbids). Parallax is a pure
   function and takes PATH's shed law verbatim (home + frozen
   clock). Both present home under shed; neither jumps on restore
   beyond PATH's own accepted resume behaviour.

## Not built (by design)

- **Q3 trigger surface** — see the open fork. No beat wiring, no
  Queen wiring, no perform control, no `surgeTrigger` producer
  anywhere (liveLoop untouched).
- **Q2 traveler budget, Q4 per-stratum leash** — inherited forks.
- A parallax wrap, per-mark surge stagger, per-stratum surge/drift
  amounts — unruled surfaces, none invented.
- Swarm/organism items: both passes apply to the placement path
  (buildPlacements), where the travel contract puts them.

## Selfcheck results

- `app/src/engine/surge.selfcheck.mjs` (NEW): **1385 checks passed**
  (envelope, measured anticipation, z read, live path, cost, params).
- `app/src/engine/parallaxDrift.selfcheck.mjs` (NEW): **270 checks
  passed** (offset laws, live path, cost, params).
- `app/src/engine/travel.selfcheck.mjs` (P1+P2, unmodified): **685
  checks passed** — including its parity sections, on this tree.
- `app/src/curator/census.selfcheck.mjs`: **green** — both new keys
  measure as MOVES through their fixtures; the dead-knob set is
  unchanged; Jell-O table bit-identical to stage 2.
- Affected existing suites, run individually, all green:
  buildPlacements, kineme, governorCuts, governorCreatureShed,
  governorHostileScene, costTiers, censusReadout, liveResolve,
  liveResolve.determinism, goldenPlacement, livingMotion,
  materialParams, normalize, voices, firewall, rangeRow,
  governorEventLog, bundle / bundleKeys / bundleParts / bundleFile.
- `npm run build`: **green**. ESLint on every touched file: **clean**.
- Full manifest sweep, stated exactly: the manifest holds **487
  suites** (stage 2's 485 + this stage's 2). **Every suite was run
  individually: 480 passed, 7 failed.** Total: **480 of 487 suites
  green.** The 7 failures:
  - `gl/replayGate`, `gl/creatureGate`, `engine/wingWarp` — the three
    suites stages 1–2 document as failing on this stack's base for
    the key-echo reason (recorded fixtures predate the travel recipe
    keys; strip-proven by the coordinator in stage 1). Their failure
    shapes here are the same assertions ("no checkpoint diverges";
    "the resolver at rest is the pinned output"). This stage adds two
    more keys of the same kind (`transportSurge`,
    `transportParallax`), named above for the coordinator's separate
    strip-proof. No pin or fixture was re-recorded.
  - `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` — fails with
    **`cargo not found on PATH`** (no Rust toolchain in this
    sandbox) — environmental, identical on main.
  - `fx/rollSafety` — sandbox-environment: in this sweep it ground
    in software GL past the sweep driver's 600 s per-suite cap and
    was recorded failed on timeout; stage 2 recorded the same suite
    failing in this sandbox with the headless browser dying
    mid-suite ("Target page, context or browser has been closed").
    Failing identically-class on clean main per stages 1–2.
  - `gl/accum` — sandbox-environment: aborted at its browser stage
    in this sandbox; documented as failing identically on clean main.
  - `gl/resolverProbe` — a wall-clock perf probe (resolve-time
    budgets). It failed in this sweep at 8.056 ms vs its 5 ms
    four-creature mean budget under sweep load, and standalone on
    this tree at 5.04–5.69 ms. **The pristine stage-2 base fails it
    standalone in the same sandbox today too** (verified from a
    `git archive` export of `0c631d9e`: "four creatures add 3.245 ms
    (budget 3)") — the sandbox's current CPU cannot meet the probe's
    budgets with or without this stage's change, whose per-resolve
    additions are two small gated objects. Reported as
    sandbox-timing, not as a regression this stage introduced; the
    coordinator may wish to re-run it on real hardware.
  No other suite failed, and no suite was skipped: 480 + 7 = 487,
  every manifest suite accounted for above.

---

## Q4 amendment — per-stratum leashes (ruled by Matt, 2026-10-20; built on the rebased branch)

The ruling (issue #1575, comment 6303045169): the travel leash becomes
**per-stratum** — each CONTENT stratum is capped by its own leash. This
amendment is built on top of the coordinator's rebase, in which the Q2
traveler-budget amendment (#1574, `2c8661be`) now sits *under* P2 in
this branch's history.

### The premise, corrected by a fresh read

The P2 sections above call `transportLeash` "single scene-level". Read
fresh on the merged tree, the travel pass has always run **per scene**:
`buildPlacements` is called per stratum with that stratum's
defaults-merged layoutParams, `liveResolve` threads one shared store
with `sceneId = layer.id`, and each stratum's params live in its
snapshot (`captureSnapshot` in `state/slices/layersSlice.js`; the
active stratum's are the live params). A resolver-level probe run
*before* any edit confirmed two strata carrying different snapshot
leashes already capped independently (PATH orbit, leash 280 vs 45 →
max displacement 289 vs 55 px, symmetric under swap). So the leash
value's per-stratum home already existed. What Q4 builds is everything
that makes it a ruled mechanism rather than an emergent accident: the
guarantee pinned in the suite at both seams, the one sensor that still
read the leash scene-wide, the chip that now shows each stratum its own
leash, and this record (the kineme.js comment that called the scope
"exactly as open as P1 left it" is corrected).

### Mechanism (chosen) and alternatives rejected

- **Chosen:** the stratum's own `transportLeash`, riding its snapshot
  params, *is* the per-stratum leash. No new layoutParams keys, no new
  store, no change to the travel math. Consequences: the recorded pins
  cannot move (verified below); old takes replay identically by
  construction (their recorded snapshots carry their leashes exactly as
  they did before Q4); a stratum whose snapshot predates the key falls
  back through the existing defaults merge to the shipped default
  (112 px) — the pre-Q4 behavior for such strata, proven bit-for-bit in
  section Q.
- **Rejected — a new per-stratum key** (a second leash, or a
  stratum→leash map): duplicates the snapshot param system, creates two
  sources of truth for one physical value, and — as a new layoutParams
  key — moves the recorded pins for zero behavioral gain.
- **Rejected — the leash on the layer object** (`layers[]` structure):
  layers are structure, not recipe; the value would escape snapshots,
  history (whose field list mirrors `captureSnapshot`) and take
  recording, and would need new plumbing through all three to stay
  replay-honest.
- **Rejected — scene-global leash + per-stratum override:** keeps the
  scene-wide value the ruling abolished, and an "unset override" fights
  the defaults merge (an override key present in every stratum's params
  is just a second leash with worse naming).

### What was built

1. `app/src/engine/kineme.js` — comments only, no code lines changed.
   The PATH-present block now records the per-stratum ruling and the
   kept sub-calls (below) instead of the open fork; the `applyTransport`
   JSDoc states the leash is the calling stratum's own.
2. `app/src/hooks/usePerformanceGovernor.js` — the one scene-wide
   residue: `travelActive`, the travel rung's sensor, read only the
   **active** stratum's params, so a scene whose background stratum
   travels read as travel-inactive and cut 1.6 could never arm for it.
   The sensor now reads every stratum — the live params (active) plus
   each non-active stratum's snapshot params, the active id excluded
   because its snapshot entry is a stale copy the live params supersede
   — with the leash defaults-merged exactly as the resolver merges it.
   The rung, its order (suite section F re-proves it) and the shed
   overlay are unmoved; only the sensor's scope matches the mechanism.
3. `app/src/panels/build/LayerStack.jsx` — P2's minimal BUILD stratum
   chip is the natural vehicle: it gains the stratum's own leash as a
   **readout** in its title/aria-label ("This stratum's leash: Npx —
   each stratum carries its own"). No new control and no cluster:
   editing stays in the Directors motion group per the standing
   controls ruling — which, since Directors edits the active stratum's
   params, *is* per-stratum editing.
4. `app/src/engine/travel.selfcheck.mjs` — new **section Q** (27
   checks; suite total 741). Two strata threaded through one store,
   interleaved frame-by-frame, reproduce each stratum's solo run
   hash-for-hash (per-scene state, per-scene leash, no bleed). FLOW
   caps: leash 40 → max 44.9 px, leash 280 → 186.4 px. PATH orbit caps
   exact per stratum: 60.0 px at leash 60, 280.0 px at leash 280.
   Sweep: arc caps 50.0 px (leash 50) / 104.9 px (leash 200, the arc's
   own amplitude) while the lane runs free (>150 px |dx| under both).
   A zero-leash stratum creates no travel state and presents its still
   frame bit-for-bit while its neighbour roams. Then the whole thing
   again **through the real resolver** with snapshot-carried leashes:
   45.8 px (leash 45) vs 280.0 px (leash 280); a snapshot carrying no
   `transportLeash` at all resolves bit-identically to the explicit
   shipped default; a zero-leash snapshot stratum is its still frame
   while the active stratum roams. (One assertion was corrected during
   the build: the still reference must run the same frame count as the
   compared run, because the always-alive kineme drivers move items
   with loop time even when travel is off — homes are only comparable
   at the same final `loopTimeMs`. The section carries that note.)
   Suite header: the Q2 summary's letter corrected I→P to match the
   merged suite (the rebase renumbering the header had not caught up
   with); the verdict line now reads `#1575 P2 + Q4`.

### PATH sub-call dispositions (re-examined under per-stratum scope)

- **Centred/weave families (orbit/spiral/lissajous) capped radially —
  KEEP.** The cap is the family's geometry (offsets live in a disc
  around home), independent of whose leash it is. Per-stratum scope
  changes which *value* caps, never how; section Q proves the cap exact
  at two different strata's leashes inside one scene.
- **Sweep capped only on its arc (y), lane (x) free — KEEP.** The P2
  reason is scope-independent: the lane is the family's defining
  geometry, and a radial cap would plateau the wrap. Section Q proves
  the arc obeys each stratum's own leash while the lane crosses the
  canvas under both.

### Parity and pins

No layoutParams keys were added and no resolver/placement math
changed, so the recorded pins cannot move — and they didn't:
`engine/wingWarp` still fails with actual **`248580c4`**, bit-identical
to this stage's pre-Q4 recorded value, and `gl/replayGate` /
`gl/creatureGate` still fail on the same "no checkpoint diverges"
assertion. The three remain exactly the P1+P2 key-echo state the
publish re-record ruling covers; Q4 neither worsens nor re-records
them, and no strip proof is owed by Q4 (there is nothing of Q4's in
the pins to strip — the stages' own strip proofs stand as recorded).
Sections A–P pass unmodified (714 checks) inside the amended suite.

### Cost

The travel pass's code is byte-identical (the kineme.js changes are
comments), so its cost cannot change; the suite's standing
re-measurement confirms it on this run: FLOW declared 0.39 ms,
re-measured **0.396 ms** @800 marks; PATH declared 0.66 ms,
re-measured **0.647 ms** (sandbox node — in line with the staging
measurements). The governor sensor change is a few property reads per
governor evaluation over a handful of snapshots — no per-frame or
per-mark cost. The chip change is render-time string composition.

### Sweep

- `npm run build`: **green**. ESLint on the four touched files:
  **clean**.
- Full manifest sweep, stated exactly: the manifest holds 485 suites.
  The serial runner (`npm run selfcheck`) ran the first **76 green**
  and stopped at `swarmWasm` (#77), as in prior stages; **all 485
  suites were then run individually: 479 passed, 6 failed** — the same
  total and the same six as P2's own staging sweep, none of them new
  and none of them Q4's:
  - `engine/kernel/bake/swarmWasm` — `cargo not found on PATH`;
    **proven base-identical on clean main `6946f393` this session**
    (same message, exit 1).
  - `fx/rollSafety` — sandbox browser death ("Target page, context or
    browser has been closed"); **proven base-identical on clean main
    this session** (same signature).
  - `gl/accum` — sandbox environment death on both trees (heap OOM
    abort, exit 134 on clean main this session; the branch run aborted
    the same way); no assertion implicates travel code, and P2's
    report documents the same class on main.
  - `gl/replayGate`, `gl/creatureGate`, `engine/wingWarp` — the pin
    suites, failing on the documented P1+P2 key-echo assertions with
    shapes and the wingWarp actual identical to pre-Q4 (above);
    covered by the publish re-record ruling.
  No other suite failed and no suite was skipped: 485 individual runs,
  each accounted for in the run tally.

## Q3 amendment — the Queen stamps the surge trigger (ruled by Matt, 2026-10-20; built on the rebased branch)

The ruling (recorded on #1576, comment 6303858411): **the Queen calls
it** — the surge trigger is a taste call stamped by the curation layer.
Its three binding properties, and how the build honours each:

1. **She stamps, nobody else.** No performer control, no panel
   surface, no beat/audio wiring was added. The only producer of
   `input.surgeTrigger` in the app is the stamp below.
2. **Sway never renders (KC-1 DS rule 10).** The stamp is a number on
   the resolver input — data in the recorded input stream. No readout,
   no UI element, no log line names it; the Queen's identifier
   tripwires (`queenChannel` / `queenLean` deniability scans) pass
   unmodified, which required the stamp's comments outside `curator/`
   to describe the mechanic without naming her modules.
3. **Deterministic from recorded state.** The stamp is a pure function
   of the recorded keeps ledger (below). It rides into the resolver as
   a recorded input — the same doctrine as `travelIpadClass` — and the
   input log records every input key, so a take's log carries the
   stamp and a take that surged replays the surge exactly (suite
   section I proves the round-trip). No wall-clock, no live
   performance readings, no `Math.random` anywhere in the stamp path.

### Where the Queen's recorded state lives at resolve time

The **keeps ledger**: the store's `keeps` (davisSlice; persisted
`kc:keeps:v1`) — recorded curation state, the same ledger her whole
pull reads. The curation layer has no per-frame presence of its own
(the Director runs at pick time, never in the live loop), and none was
needed: liveLoop already reads the store fresh on every frame
(`getState()`), so the ledger is present at the exact seam where the
frame's input is built. The taste read over the ledger is the pull's
own machinery, reused, not re-derived: `pullKeeps` (pattern-layer
keeps do not teach her), `keptCentroid` / `proximity` (the kept-taste
anchor the pick-time consumers lean on), `MIN_KEEPS`, and M1's
nearness bar.

### Mechanism (chosen) and alternatives rejected

Chosen — a new sway mechanic in the M1–M8 family, in three layers:

- **`curator/queenLean.mjs` — M9, the surge call** (`surgeCallOpen` /
  `surgeCall`, the family's pure + gated pair). When a keep lands, she
  judges it against the centroid of the counted keeps **before** it:
  anchor not live (fewer than `MIN_KEEPS` priors, or no centroid) →
  no call; proximity below `M1_PROXIMITY` (0.72, her own nearness bar)
  → no call; otherwise the call's strength **is** the proximity
  (0.72..1) — her demand is graded by how near the keep lands.
- **`curator/director.js` — the hosts** (the `birthCentre` /
  `paceStep` / `leanDialSteps` pattern: module-level, never throws).
  `queenSurgeCall({ keeps })` does the ledger hygiene (pullKeeps,
  split newest vs priors). `nextSurgeStamp(seen, keeps)` is the frame
  seam's decision as a pure function of (seen, ledger), so the loop
  holds only a scalar: a counted growth evaluates the newest keep
  exactly once (**one pulse per keep**); the ledger found on the first
  frame is history and does not call; a shrink just resyncs.
- **`gl/liveLoop.mjs` — the stamp.** One closure scalar
  (`queenSeenKeeps`); on **presented frames only** (`!s.slowRender &&
  s.running`) it evaluates the seam against `s.keeps` and puts
  `surgeTrigger` on the input beside `travelIpadClass`. Presented-only
  matters: a paused/shed frame's resolver never sees a trigger (its
  surgeBase is null under slowRender), so consuming the call there
  would lose it — the keep stays pending and the call lands on the
  first presented frame. If several keeps land between presented
  frames, the newest is judged against all counted keeps before it.
- **`gl/liveResolve.mjs` — no code change.** P3's thread already reads
  `input.surgeTrigger ?? 0` into `surgeBase`; only its stale comment
  (and the matching stale comments in `surge.js` /
  `buildPlacements.js`) now describes the built mechanism.

Alternatives rejected:

- **A `*Live` holder module (the stressLive pattern)** — a second
  module holding Queen state, written by a store subscription and
  polled by the loop. Rejected: the ledger already lives in the store
  the loop reads every frame; a holder would duplicate recorded state
  and add a writer whose timing (subscription vs frame) the input log
  could not reproduce as cleanly. The seam evaluation at input-build
  time is a pure function of the ledger + one scalar — strictly less
  machinery.
- **Stamping inside liveResolve** — rejected on the replay law: the
  resolver is a pure function of its input and is driven directly by
  replays; a stamp computed there could not be recorded, so takes
  would diverge. The stamp is a live-loop act (like the device-class
  stamp), and the resolver stays untouched.
- **Firing from a Director tick** — the Director does tick on keep
  events, but its outputs reach picks and gains, never the frame
  stream; a path from tick to resolver input does not exist, and
  building one is the holder pattern above with worse timing.
- **A level instead of a pulse** (stamp = f(current ledger) every
  frame) — rejected: `applySurge` fires on a rising edge and swallows
  holds, so a permanent level would call exactly one surge per
  session and mask later keeps. The pulse-per-keep is the shape the
  machinery's own trigger law asks for.

### Parity and pins

- **Parity:** no recorded Queen state (empty ledger, below the floor,
  a far keep) → stamp 0 → frames bit-identical to the pre-Q3 build.
  Suite I drives 150 frames at trigger 0 from an empty ledger: every
  frame is the still frame, no envelope state is ever created. With a
  stamp, the envelope fires and releases home bit-exact.
- **No new layoutParams keys** (the trigger was already a resolver
  input by P3's design); no resolver math changed — the liveResolve
  diff is comment-only, so the strip-proof question does not arise.
- **Pins, measured this session before and after:** `wingWarp`
  actual **`dfb2915f`** before and after — unmoved (the inherited
  chain value; the expected `dc0897fb` is the pre-travel pin, covered
  by the publish re-record ruling). `replayGate` / `creatureGate`
  fail in the identical inherited shape (first-divergence assertions,
  actual 0) before and after. The travel suite passes **741** checks
  before and after; the surge suite grows **1385 → 1415** (sections
  G–J added; A–F unmodified).

### Cost

The stamp is curation-side scalar work at the frame-input seam — not
a resolver or GPU path — so, honestly, **no cost-tier registration**:
the surge pass's tier-0 declaration stands unchanged, and the stamp
adds nothing to any costed path (buildPlacements, the resolver, and
the governor sensor are untouched). Measured this session (suite J,
sandbox node, median of 200): the call computation **0.036 ms** at a
40-keep ledger, **once per keep landing** (a centroid + one proximity
over the ledger); the per-frame seam **0.0002 ms** (a memoised
pullKeeps length read + compare). Sandbox-indicative only.

### Sweep

- `npm run build`: **green** (final tree). ESLint on the eight touched
  files: **clean**.
- Full manifest sweep, stated exactly: the manifest holds 492 entries;
  **all 492 were run individually: 484 passed, 8 failed.** Of the 8:
  - `curator/queenChannel`, `curator/queenLean` — **this amendment's
    own deniability tripwires, caught by the sweep**: the first draft
    named her modules in comments/imports outside `curator/`, which
    rule 10 forbids. Fixed during the run (the mechanic's pins moved
    to its home suite — a new M9 block in `queenLean.selfcheck`, 24 →
    29 checks — and the surge suite now proves the read through the
    Director host); **both re-run green on the final tree** (13 and 29
    checks), as is `queenDeniability` (7). In the final tree the sweep
    therefore stands at **486 of 492**, the remaining 6 failures all
    inherited:
  - `gl/replayGate`, `gl/creatureGate`, `engine/wingWarp` — the pin
    suites in their inherited key-echo shape (above), covered by the
    publish re-record ruling.
  - `engine/kernel/bake/swarmWasm` — `cargo not found on PATH`, exit
    1; **proven base-identical on clean main `6946f393` this session**
    (same message, same exit).
  - `fx/rollSafety` — sandbox browser death (`page.evaluate: Target
    page, context or browser has been closed`, then a hang to the
    240 s timeout); **proven base-identical on clean main this
    session** (same signature, same hang).
  - `gl/accum` — sandbox heap-OOM abort, exit 134; **proven
    base-identical on clean main this session** (same abort). Q4's
    sweep on this chain documented the same death; no assertion
    implicates the stamp (the suite never reaches the travel code).
  No other suite failed and no suite was skipped: 492 individual runs,
  each accounted for in the run tally.
