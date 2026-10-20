# STAGING REPORT — #1574 Travel kinemes P1 (transport core) (LOCAL ONLY — no push, no PR)

Branch: `ember/1574-travel-core` (local only — not pushed, no PR)
Base: origin/main `6946f393`
(This file replaces S3's staging report at the worktree root; S3's remains in git history.)

## What was built, in plain language

Marks can now leave home and roam. Each placed mark gets a small physics
state (offset + velocity) that lives in a store owned by the resolver, so
it survives the placement rebuilds that happen every edit. When a scene's
transport is set to **flow**, marks are carried by the curl of the shared
noise field — the same field the rhythm layer reads — and held by a
**leash**: inside the leash radius there is no pull home at all; outside
it a slightly underdamped spring pulls the mark back, and it overshoots
on return (the anime follow-through). The sim runs on the spine-A clock
at a locked 1/60 step, accumulated from frame time; the field's time is
the step count. Same seed + same step count = same positions, bit for
bit — replay/takeHash exactness is proven, not hoped for.

With transport **still** (the default, and what every pre-#1574 document
opens as) or a leash of 0, the sim never runs and the frame is
bit-identical to today's pipeline. The parity gate is a selfcheck, not a
claim.

Controls live where Matt ruled they live (2026-10-14): the **Directors
panel's motion group**, beside the DIRECTOR pattern selector — a
still/flow choice (TE buttons) plus leash (px) and flow (%) on the house
slider. Nothing was added to BUILD; no new panel exists. The keys
themselves are ordinary recipe data (`transport`, `transportLeash`,
`transportFlow` in layoutParams): saved, crowned, replayed, censused.

Under load the governor sheds travel at a new rung, **cut 1.6**:
velocities zero, marks settle home, and the frame degrades to exactly
today's still behaviour — ahead of the quality-tier step and ahead of
the motion freeze. See the governor section for the full order and the
one hard constraint that shaped its position.

## ⚠ OPEN FORK — Q2, the traveler budget, is NOT built (awaiting Matt's ruling)

The issue is explicit: the traveler budget — governor-selected within a
device-class cap (the #1433 pattern) vs strictly author-assigned — has
**no ruling from Matt**, and the budget mechanism must not be built
until it is ruled. This stage builds the entire transport core and **no
budget mechanism of any kind**: no traveler count cap, no governor
selection of travelers, no author assignment surface. In P1 every placed
mark in a FLOW scene travels. When Q2 is ruled, the budget slots into
the sim's state store (states are already per-instance and keyed) and,
if governor-selected, into the governor ladder beside cut 1.6 — neither
needs the core reopened.

## Files touched

Implementation:
- `app/src/engine/kineme.js` — the transport core, as a new section of
  the kineme family: `TRANSPORT_MODES`, `TRAVEL_STEP_SEC` (1/60),
  `createTravelStore` / `pruneTravelStore` / `travelSceneSnapshot`,
  `applyTransport` (fixed-step accumulator, FLOW curl steering, leash
  spring, damping, shed settle), and the `travel/flow` cost-tier
  declaration (tier 0, measured timeMs — see Cost).
- `app/src/engine/buildPlacements.js` — the transport pass, beside
  `applyRhythm`: a new ephemeral `travel` input ({ store, sceneId,
  frameMs, shed }); the pass runs last (home = the presented placement)
  and is gated on `transport === 'flow' && transportLeash > 0`, so the
  off paths never call the sim. Undo runs in reverse of application,
  like every other applier.
- `app/src/data/layout-modes.js` — recipe data: defaults
  (`transport: 'still'`, `transportLeash: 112` px, `transportFlow: 0.8`),
  `PARAM_SPEC` bounds (leash 0..400, flow 0..1), the `transport` enum
  (absent/unknown → 'still', so old documents open exactly as saved).
- `app/src/gl/liveResolve.mjs` — owns one travel store per resolver;
  measures the frame's spine-A delta once per resolve (high-water:
  rolled-back frames credit nothing, frozen frames advance the mark so
  a thaw never lump-credits); prunes scenes with the document; stamps
  `travelShed` from the input into the pass.
- `app/src/gl/liveLoop.mjs` — stamps `travelShed` on the resolver input
  (a take records the shed a frame ran with, so a shed frame replays
  shed — the creature-shed precedent).
- `app/src/hooks/governorCuts.js` — cut 1.6 (see below), its restore
  entry, and the badge line (`travel held`).
- `app/src/hooks/usePerformanceGovernor.js` — wires the rung: reads
  `travelShed` + derives `travelActive` from the scene's params, applies
  and restores the cut. Also guards its two generic event-log record
  sites (see Deviations).
- `app/src/state/slices/globalSlice.js` — the `travelShed` overlay +
  setter (creatureShed class: render-only, never serialized; reset on
  project apply).
- `app/src/panels/DavisPanel.jsx` — the Directors motion-group controls
  (see above). Deadpan lowercase copy; mode renders TE, leash/flow are
  digits on `RangeRow`, the one house slider.
- `app/src/curator/censusReport.mjs` — honest census fixtures for the
  three new keys via a `travel` driver (fresh store, one frozen 100 ms
  frame = 6 locked steps, mirroring liveResolve's context the way the
  kineme replica mirrors livingMotion).

Tests:
- `app/src/engine/travel.selfcheck.mjs` — NEW suite, 50 checks (below).
- `app/selfcheck.manifest` — one line registering it.
- `app/src/hooks/governorCuts.selfcheck.mjs` — the restore-table order
  pin gains `'travel'` between `'creatureCount'` and `'quality'` (the
  table grew by the new rung; nothing else in the pin changed).
- `app/src/curator/census.selfcheck.mjs` — the key-universe count
  21 → 22 structural keys (the transport enum is the new structural
  key; the count is computed from PARAM_SPEC/RANGE_SPEC sizes plus
  this constant).

## Governor order after this change

Existing rungs were **not moved** — in particular cut 1.5 (creature
count, Matt's population-first ruling on #1694) stands exactly where
it was. Travel was inserted after it:

```
cut 0    edge AA off (FXAA, GPU-bound only)
cut 1    dynamic resolution 1 → 0.75 → 0.5 → 0.33 (GPU-bound only)
cut 1.5  creature count — population sheds FIRST among content cuts
cut 1.6  TRAVEL — velocities zero, marks settle home      ← NEW (#1574)
cut 2    quality tier high → balanced → performance
cut 3    mirror/gloss/ACCUM (independent perfTier1 mechanism)
cut 4    cost-aware asset thinning
cut 5    render-only count clamp
cut 6    motion freeze (slowRender)
cut 7    watchdog hard stop (separate mechanism, manual resume)
```

The rung is opt-in per caller (`travelActive === true`: transport is
'flow' and leash > 0, not already shed); callers that predate it see
the pre-#1574 ladder exactly. It restores whole on recovery
(`travel back — marks roam again`), in table order. This satisfies the
issue's shed intent (travel sheds ahead of quality and ahead of the
motion freeze) without touching the later hard ruling that the
population sheds first among content cuts.

## Feel / behaviour numbers (sandbox bench, this build)

FLOW at the defaults (leash 112 px, flow 0.8, ~198 marks, 1000×700),
steady state over the last 10 s of a 20 s run:

- roam distance from home: **p50 90.3 px, p90 114.0 px, max 116.6 px**
  (max overshoot past the leash: +4.6 px)
- spike reference (#1573, transient window): p50 73.4 / p90 112.7 at the
  same leash — the production distribution is the same animal at steady
  state (the spike's window was ~3.4 s of outward travel).
- Two tunings were measured, not guessed: (1) the field's time rate —
  at the spike's 0.12/s, marks parked at shell equilibria (outward curl
  cancelling the spring) for 62% of roam time; at 0.5/s the outer shell
  holds 27% and radii spread through the interior; the spike masked the
  same trap with its phase machine's ≤3 s re-picks, which P1's pure
  FLOW does not have. (2) the leash spring — at the spike's 0.85 Hz the
  return overshoot measured 4.8 px on an 88 px excursion (the steer ease
  damps it); at 1.3 Hz / ζ 0.30 a mark released at r=200 crosses to
  r=75.5 and settles inside at rest.

## Cost (measured, not estimated)

`travel/flow` is registered in the kernel cost registry at **tier 0**
(structural — no GPU pass, shader or FBO; marks ride the structural
item pass; it sheds by the governor's own rung, never the effect
ladder — the creature-citizen doctrine, which is also why tier 0 is
the honest tier: the costTiers gate's measured-costs sweep times FX
shader passes, and tier 0 is exempt from it by contract).

Declared `timeMs: 0.39` is the **measured resolver-CPU** figure from
this sandbox: `applyTransport` at the 800-mark cap, one locked step +
present, median of 7 runs × 200 calls = **0.383–0.389 ms** (the suite
re-measures on every run and prints it; latest suite run: 0.389 ms).
Sandbox-indicative only; real hardware authoritative, as with every
CPU figure in the registry. First implementation (the spike's 3-octave
fBm curl) measured 0.93 ms; sampling the curl from the shared
single-level noise field brought it to ~0.39 ms.

## Acceptance evidence

- **Parity suite green** — travel.selfcheck A: 'still' (with leash/flow
  set, and with a travel input handed in) and leash-0 are bit-identical
  to the no-travel pipeline; the sim store is never touched while off.
- **Fixed-step determinism green** — travel.selfcheck B: two fresh
  stores over 300 uneven frames hash identically every frame
  (trajectory hash `8b46bbc0cb58d3d6`); 50 ms slices == 100 ms slices ==
  60 fps frames at equal step counts; reseed restarts the scene's roam.
- **FLOW live through the real placement path** — travel.selfcheck C:
  buildPlacements with a travel input roams every mark (mean 75.9 px
  from home in the suite's scene), max displacement stays leashed, and
  the state survives a placement rebuild.
- **Leash law** — travel.selfcheck D: no home force inside L (bit-exact
  rest); spring return overshoots and settles.
- **Shed settle** — travel.selfcheck E: after the shed, items are
  bit-identical to the still scene; velocities zero, offsets home.
- **`npm run build` green.**
- **Suites** (counts in the results section below): the new travel
  suite (50 checks), buildPlacements, kineme, the governor family
  (governorCuts, governorCreatureShed, governorHostileScene),
  costTiers, liveResolve determinism, goldenPlacement, the bundle
  family, census, and the full manifest sweep — one environmental
  exception, documented below.
- No golden hash was weakened or re-pinned anywhere in this stage.

## Deviations from the issue, and why

1. **Governor position.** The issue body says "travel first"; the
   dispatch for this stage hard-constrains cut 1.5 (creature count) to
   stay first among content cuts per Matt's later #1694 ruling. Travel
   therefore sits at cut 1.6 — first among the *remaining* content
   behaviour, ahead of the quality tier and the motion freeze, exactly
   as the dispatch orders. Recorded here so the difference between the
   issue text and the built order is on the record, not silent.
2. **Event-log guard.** Found while wiring the rung:
   `gl/governorEventLog.mjs`'s `SHED_STEPS` knows neither
   'creatureCount' (cut 1.5, already on main) nor 'travel', and
   `recordGovernorEvent` **throws** on an unknown kind — verified in
   node on unmodified main code: recording a creature shed throws
   inside the governor effect. (On main this is latent: it fires only
   when a creature shed/restore is recorded.) Rather than grow the
   log's ladder map and its X-ray in this stage, the hook's two generic
   record sites now skip kinds the log doesn't know (`recordCutEvent`).
   The shed, the badge and the restore all still happen; only the
   flight-recorder entry is skipped for those two kinds. Extending
   `SHED_STEPS` + the governor X-ray to cover 1.5/1.6 is a follow-up
   worth filing.
3. **Census pins updated for the new keys** (governorCuts restore-order
   pin, census key-universe count) — these pins enumerate the ladder /
   key universe, so a new rung/key must appear in them; no measured
   finding, golden hash or behaviour pin changed.
4. **No new `kc:` storage keys.** The stage's state is an in-memory
   resolver store + a zustand overlay (the creatureShed pattern);
   nothing is written to localStorage, so the bundle key registry
   needed no new entry (bundleKeys suite green on the unmodified
   registry).

## Not built (by design)

- **Q2 traveler budget** — see the open fork above.
- **PATH (P2) and SURGE (P3)** — later stages; no hooks for them were
  built beyond the mode enum's room to grow.
- Swarm/organism items: transport applies to the placement path
  (buildPlacements), where the issue's contract puts it; the particle
  swarm path is untouched.
- Stills/exports carry no travel (home positions) — the kineme
  precedent: living motion is a live-path behaviour, and a still is the
  placed picture.

## Selfcheck results

- `app/src/engine/travel.selfcheck.mjs` (NEW): **50 checks passed** —
  parity, determinism (trajectory hash `8b46bbc0cb58d3d6`), live FLOW,
  leash law, shed settle, governor order, cost, params.
- Affected existing suites, run individually, all green:
  buildPlacements, kineme, governorCuts, governorCreatureShed,
  governorHostileScene, costTiers, liveResolve.determinism,
  goldenPlacement, bundle / bundleKeys / bundleParts, rangeRow,
  governorEventLog, census (in the sweep below).
- `npm run build`: **green**.
- ESLint on every touched file: **clean**.
- Full manifest sweep: `npm run selfcheck` ran the first 81 suites
  green (including the new travel suite) and stopped at
  `src/engine/kernel/bake/swarmWasm.selfcheck.mjs`, which fails with
  **`cargo not found on PATH`** — it verifies the checked-in WASM
  kernels reproduce from Rust sources, and this sandbox has no Rust
  toolchain. Environmental and pre-existing (no Rust/WASM file is
  touched by this stage; the suite's own manifest-hash checks pass
  before the cargo call). Every remaining suite was then run
  individually past that point: **403 passed, 0 failed**. Total:
  **484 of 485 manifest suites green; the one failure is the
  cargo-missing environment, not this change.**
