# STAGING REPORT — #1574 Q2 amendment: the traveler budget (LOCAL ONLY — no push, no PR)

Branch: `ember/1574-travel-core` (local only — not pushed, no PR)
Base of this amendment: `9d6fb42c` (#1574 P1 — travel kinemes transport core)
(This file replaces the P1 staging report in the branch's report slot;
P1's report remains in git history at `9d6fb42c`.)

## The ruling implemented

Q2 RULED (Matt, 2026-10-20, on #1574): traveler budget is
**governor-selected within a device-class cap** — the governor picks the
scene's travel amount, bounded by a hard per-device-class cap; the author
sets the ceiling, not the amount. P1 was built without the mechanism
under the Q2 carve-out; this amendment is the follow-on mechanism, and
nothing else (no Q4 per-stratum leashes, no P3 surge, no #1356 work).

## What shipped, in plain language

A FLOW scene still *requests* travel for every placed mark — that request
is the authored ceiling, and it is exactly what the Directors motion-group
controls already express (transport / leash / flow, plus how many marks
the scene deals). The governor now *selects* the effective travel amount:
how many marks actually travel.

```
travelers = min(marks the scene dealt, the device-class cap)
```

Marks are selected by instance index, ascending (index 0 first) — the
index is the identity the travel store already keys its per-mark state
by, so the selection is stable across placement rebuilds. A mark beyond
the selection never travels: no sim state is created for it, and if the
budget shrinks under a live scene (a class change) its state is dropped
and it presents exactly at home — the 'still' parity position, not a
roam frozen mid-stride.

There is **no new panel control and no new surface**: the budget is
governor-selected, so nothing edits it. The Directors motion group is
byte-for-byte as P1 shipped it. There are **no new layoutParams keys**
(see Pins below).

## Files touched

- `app/src/data/quality.js` — `TRAVEL_BUDGETS` { desktop, ipad } and the
  `travelBudgetForDevice(ipadClass)` accessor, in the house pattern
  beside `REGION_BUDGETS` / `FRAME_BUDGETS` (device class is the same
  `ipadClass` boolean the other budgets read).
- `app/src/engine/kineme.js` — `selectTravelers({ requested, ipadClass })`
  (the selection), `TRAVEL_COST_REFERENCE_MARKS`, the budget's cost
  registration (`travel/budget`, tier 0), and `applyTransport`'s use of
  it: the selection is computed once per scene per resolve beside the
  store lookup, excess state is pruned there, and the step loop skips
  non-travelers. `ctx.travel` gains the optional `ipadClass` field.
- `app/src/engine/buildPlacements.js` — passes `travel.ipadClass` through
  to the transport pass (comment updated; nothing else).
- `app/src/gl/liveResolve.mjs` — the travel base gains
  `ipadClass: input.travelIpadClass === true`.
- `app/src/gl/liveLoop.mjs` — stamps `travelIpadClass:
  isIpadClassDevice()` on the resolver input, beside `travelShed`, using
  the same device sniff the region budget uses.
- `app/src/gl/performanceFile.mjs` — `travelIpadClass` added to
  `MACHINE_KEYS` (it describes the recording machine, not the artist's
  intent — the file's own doctrine).
- `app/src/engine/travel.selfcheck.mjs` — new section **I** (29 checks;
  suite total 50 → 79). No manifest change: the suite was already
  registered by P1, and no new suite was added.

## Selection inputs — and why each is recorded state (#1367)

`selectTravelers` is a pure function of exactly two inputs:

1. **requested** — the scene's placed-mark count. Census/geometry state:
   the recipe's layout params deal it, a take's input log carries those
   params, and `applyTransport` reads it as `soa.n`.
2. **ipadClass** — the recording machine's device class. It rides the
   resolver input as `travelIpadClass`, so the input log records it like
   every resolver input; liveLoop stamps it from the device. It is a
   MACHINE key (performanceFile doctrine: detail is per machine).

Nothing else is consulted: **no wall-clock time, no live performance
readings, no Math.random**. The live-pressure mechanism remains the
governor's cut 1.6 shed in `hooks/governorCuts.js`, whose behaviour is
untouched by this amendment. Proof is in the suite (section I): the
selection returns deep-identical results over 100 repeated calls, and
two fresh iPad-class runs of an 800-mark FLOW scene land on identical
frame hashes for every one of 90 frames.

**Absent input = P1.** A take recorded before Q2 carries no
`travelIpadClass`; the resolver reads absent as the desktop class, whose
cap is the full placement cap — so pre-Q2 takes replay with every mark
travelling, exactly as recorded. The suite pins this: a run with no
`ipadClass` on the travel input is bit-identical to the desktop run.

## Cap values, with derivations

`TRAVEL_BUDGETS` (each entry `{ maxTravelers, timeMs }`; timeMs is the
entry's cost equivalence — see below):

- **desktop: 800 travelers, timeMs 0.39 — derived directly from the
  measured number.** 800 is the placement count cap at which P1 measured
  FLOW travel (0.387 ms sandbox; declared `travel/flow` timeMs 0.39 in
  the kernel cost registry). A desktop scene at its maximum authored
  count therefore costs exactly the declared travel cost, the selection
  never trims a desktop scene, and desktop behaviour is bit-identical
  to P1 (suite sections A–G unchanged and green, trajectory hash
  `8b46bbc0cb58d3d6` identical before and after this amendment).
- **ipad: 500 travelers, timeMs 0.24375 — BUILDER CALL, flagged.** No
  iPad-class travel measurement exists yet; the Q2 ruling itself
  records the iPad cap as pending the device bench. The tightness ratio
  is `FRAME_BUDGETS`' iPad/desktop render-cap ratio, 5.0 / 8.0 — the
  frame-cost budget, the nearest budget in kind to travel's per-frame
  CPU cost — applied to the desktop cap: 800 × 5/8 = 500. Its timeMs is
  not an iPad measurement: it is 500 marks at the declared desktop
  per-mark cost (0.39 / 800), i.e. the allowance expressed in cost
  terms. **Re-derive from a measured iPad number when the bench
  lands; do not tune by eye.**

Cost-terms bound, by construction and asserted in the suite:
`estimatedMs = travelers × (declared travel/flow timeMs / 800)` and
`estimatedMs ≤ the class's budgetMs` for both classes, at any request.

## Builder calls (all of them)

1. **iPad cap = 500** via the FRAME_BUDGETS 5/8 ratio — flagged above;
   no iPad measurement exists on this branch.
2. **Selection order = instance index, ascending.** The store already
   keys state by index; any deterministic order satisfies the contract,
   and this one needs no new state and survives rebuilds.
3. **Selection cost declared as timeMs 0** for `travel/budget` — the
   honest figure at the registry's ms scale: the selection measured
   **119–245 ns/call** across suite runs in this sandbox (suite
   re-measures and prints it on every run). The cost the budget actually
   controls is `travel/flow`'s declared 0.39 ms, unchanged.
4. **A non-traveler's state is dropped, not settled**, when the budget
   shrinks under it: the budget is a scene property, not a pressure
   event — the mark was never selected in this configuration, so it
   presents at home exactly. (The cut 1.6 shed keeps its own settle
   behaviour, untouched.)

## Cost

- Selection: scalar arithmetic, **once per scene per resolve** — never
  per mark per frame. Measured **119–245 ns/call** (median over 20,000
  calls per run, sandbox node; suite section I). The only per-mark work
  it adds is one integer comparison in `applyTransport`'s existing step
  loop, plus a state-prune that runs only when the budget actually trims.
- Declared at registration per the house pattern: `travel/budget`,
  **tier 0** (structural, like `travel/flow` — no GPU pass, sheds by the
  governor's travel rung), `timeMs: 0` (builder call 3 above).
  `costTiers` suite green.
- The pass itself re-measured with the budget active (suite G):
  `applyTransport` at the 800-mark cap, one locked step + present —
  median-of-medians **0.390 / 0.407 / 0.434 ms** across three
  post-amendment suite runs (declared 0.39; my pre-amendment baseline
  run measured 0.384 ms, inside P1's recorded 0.383–0.389 band — the
  spread is sandbox load, the suite's own gate is the 2.0 ms class
  allowance, and the figure stays sandbox-indicative as with every CPU
  number in the registry).

## Pins / fixtures — no re-records, no new keys

- **New layoutParams keys: NONE.** The authored keys are P1's unchanged
  three (`transport`, `transportLeash`, `transportFlow`). Census pins,
  key-universe counts and PARAM_SPEC are untouched; the census suite is
  green unmodified.
- The one new input is a **resolver input**, not a layoutParam:
  `travelIpadClass` (boolean, machine key), plus its plumbing fields
  (`travel.ipadClass` in buildPlacements, `travel.ipadClass` in
  `ctx.travel`). Pre-Q2 takes don't carry it and read it as desktop.
- The three pin suites already failed on this branch before this
  amendment (P1's additive keys predate their fixtures). I measured
  their actuals **before and after** my change; they are identical —
  the amendment moves no pin:
  - `engine/wingWarp`: unstripped actual **`41d885e1`** before and after
    (expected REST pin `dc0897fb`).
  - `gl/replayGate`: fails at the same first checkpoint (the gate's
    `firstMismatchFrame` actual **0**) before and after.
  - `gl/creatureGate`: fails at the same first checkpoint (actual **0**)
    before and after.
  Since no layoutParams keys were added, there is nothing to strip; the
  before/after-identical actuals are the strip-proof equivalent for
  this amendment, and the stronger in-suite proof is section I's
  absent-class run, bit-identical to the desktop (P1) run. **No fixture
  was re-recorded.**

## Selfcheck results (my runs, exact)

- `app/src/engine/travel.selfcheck.mjs`: **79 checks passed** (P1's 50
  unchanged + 29 new in section I: budget table + derivations, selection
  bounds in count and cost terms, purity ×100, selection cost, live
  iPad-class subset travel with non-travelers bit-exact at home, fresh-run
  replay determinism under the budget, desktop = P1, absent class =
  desktop bit-for-bit, budget shrink).
- Affected existing suites, run individually, all green:
  governorCuts, governorCreatureShed (7 checks), governorHostileScene
  (16 cuts, 71 passes), costTiers, census, liveResolve.determinism,
  liveResolve, buildPlacements, kineme, performanceFile,
  parity/deviceBudgets, spawn.
- `npm run build`: **green**.
- ESLint on every touched file: **clean**.
- Full manifest sweep: `npm run selfcheck` ran the first 81 manifest
  lines green (76 suites, including the travel suite) and stopped at
  line 82, `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` —
  **`cargo not found on PATH`**, the same pre-existing environmental
  failure P1 recorded (no Rust/WASM file is touched by this amendment).
  The remaining 408 manifest suites (lines 83–end) were then run
  individually, stdin detached per suite: **404 passed, 4 failed**.
  Total across the manifest: **480 of 485 suites green**; the 5 failures
  are the swarmWasm environment failure, the three pre-existing pin
  gates below, and one bulk-only failure:
  - `gl/replayGate`, `gl/creatureGate`, `engine/wingWarp` — the pin
    gates, failing exactly as they did at `9d6fb42c` (identical actuals,
    see Pins above).
  - `gl/clock.inventory` — failed inside both bulk sweep runs, and
    passes standalone every time (5 consecutive runs, 9/9, including
    immediately after its manifest neighbours). Reported as observed,
    not explained away: nothing in this amendment touches a clock, a
    wall-clock read, or a file that suite inventories, and its
    standalone result is green. (An earlier bulk run of mine also
    silently skipped 2 suites through a shared-stdin bug in my own
    sweep script; those counts were discarded and the range re-run
    with stdin detached — the numbers above are the corrected run.)

## Not built (by design)

- **Q4 per-stratum leashes** (#1575 amendment) — not this slice; the
  scene leash is exactly as P1 built it.
- **P3 surge** (#1576) — untouched; no trigger work of any kind.
- **PATH transport (P2)** — not built; the downstream measured PATH
  figure (0.662 ms) is not on this branch and no cap here anticipates
  it. When PATH lands it declares its own cost and the same budget
  arithmetic reads it — no mechanism change needed.
- **An iPad-measured cap** — impossible on this branch by the ruling's
  own record (device bench pending); the iPad cap is the flagged
  builder call above.
- The resolver snapshot still does not serialize travel state (a P1
  property, unchanged): mid-session takes resume travel from a fresh
  store, as they did at `9d6fb42c`.
