# STAGING REPORT — #2544: Stage KINETIC deals creatures and construct recipes to the stage

Branch `stage-kinetic-deal` off origin/main `fed78912`. Local commits only — no push, no PR.
The coordinator publishes serially after the A-defect line. This is a feel change: Matt's review lane.
(This file replaces the A11 slice's report, which the squash merge carried onto main.)

## Matt's rulings this build implements (both 2026-11-26, recorded on issue #2544)

- **Landing: (a) it joins the roll.** A stage K press re-rolls the stage with creatures and construct
  recipes in the mix. The auto-apply landing (b) and the pick-strip landing (c) were declined, not
  deferred. There is no marked assumption left in this build — the landing is the ruled design.
- **Gate: always in the mix.** Every stage K roll can deal creatures and construct recipes. The new deal
  path is NOT gated behind the CONSTRUCTS chip or any other switch. The CONSTRUCTS chip keeps its
  existing pool-leading behaviour, byte-for-byte unchanged (this build never touches that path, and a pin
  proves the deal never reads the chip's flag).

## What was built, file by file in plain terms

- **`app/src/state/stageKineticDeal.mjs` (new)** — the pure core of the stage deal. Given the standing
  state, the press number and the pool the press is about to commit, it runs the wide-deal engines over
  the creature adapter and the construct adapter with the stage's own context (the deal library = the
  library plus the artist's imports, the SHAPE shelf, the artist's ATTACH map, the creature bank, the
  standing look/voice) and returns what landed — or `null` when nothing did, so the press commit is then
  exactly the press as it was. No store, no clock, no `Math.random`, and it never touches the press's own
  rng stream (the engines hash their own streams from seed + press number).
  - A dealt **creature** stands as a *stage birth* (the #2037 channel): its tile is built the bank's way
    and enabled over the pool the press dealt. It is not banked — banking stays the artist's keep,
    through the same door a born child's keep uses.
  - A dealt **construct recipe** is assembled and *banked* through the construct bank's own door
    (`bankConstructRecord` — its cap and drop-oldest law), and its tile is enabled over the pool. Banked
    construct tiles already ride the stage pool (`poolWithConstructs`), so a dealt construct is a pool
    citizen the roll can place. A recipe that is already banked banks nothing new; its tile still joins.
  - A creature already standing (banked, or stage-born from an earlier press) is never dealt twice.
- **`app/src/state/slices/layoutSlice.js`** — the store wrapper `landStageDeal`, landBirth's sibling,
  fail-closed the same way (any failure inside the deal leaves the press exactly as it would have been
  without one). It is wired into the two presses that deal a fresh pool — **`kineticLookPass`** (tap 1)
  and **`kineticRoll`** (CHAOS) — in the same commit as the pool, before the birth roll, so a birth in
  the same press reads the dealt creatures as already standing (kin, never a duplicate). Each dealt
  creature is noted to the standing take through birthRecord's tap with `via: 'deal'`, so a kept take
  banks it with the take's other births (`bankStageBirths` needed no change). New session counter
  `stageDealPress` (the deal stream's place, sibling of `kineticBirthPress`; advances on every
  pool-dealing press, landed or not; never serialized). The voice and curator passes are deliberately
  untouched — they own no pool axis, and the round's own redeal keeps its accounting.
- **`app/src/deal/kineticEngine.mjs`** — header only: the sentence that said the stage's KINETIC buttons
  do not run on the engine "until Matt orders a change" now records the order (#2544) and where the stage
  runs it. No code change.
- **`app/src/state/stageKineticDeal.selfcheck.mjs` (new)** + one line in `app/selfcheck.manifest` — the
  pins, 9 groups (below).
- **Re-pins (cause named in each, the repo's convention)** — the ruling changed what a roll's enabled set
  may contain and who may read the assemblers, so the suites that pinned the pre-deal world were
  re-pinned at full strength: the asset part keeps its exact law, and anything else enabled must be a
  dealt creature or construct tile, by id shape; the importer censuses name the new readers explicitly.
  - `app/src/state/rollPool.selfcheck.mjs` §7 (CHAOS rolls: asset pool known/mixed, citizen never dealt,
    reach census over assets only; dealt tiles must appear across 30 rolls).
  - `app/src/state/kineticSweep.selfcheck.mjs` §1 (LOOK pool coherence now reads the asset part).
  - `app/src/state/kineticRoll.selfcheck.mjs` §4 ("every enabled asset is a known id" now reads the
    asset part; the pool-never-empty law unchanged).
  - `app/e2e/asset-kits.spec.js` (kit-triad roll: the 3–6 count now reads the asset part).
  - `app/src/state/rollKits.selfcheck.mjs` (the same triad law in the store suite: "CHAOS rolls from
    the standing triad" now reads the asset part).
  - `app/src/state/chapterWalk.selfcheck.mjs` §6 ("the dealt pool belongs to the landed chapter" now
    reads the asset part; the chapter's look/voice/scope laws are untouched).
  - `app/src/engine/constructAssembler.selfcheck.mjs` §7 and `app/src/engine/creatureAssembler.selfcheck.mjs`
    (the importer censuses: both suites pin the exact named set of files that may read their assembler —
    "nothing on stage yet" was the #2327-era law. The stage deal and its suite are now named on both
    lists with the #2544 cause, plus the two re-pinned suites above on the construct list for their
    `isConstructTileId` import. The censuses still trip on anything unnamed.)

## The scope mapping (issue item 4 — deliberate, pinned)

- **Creatures take the stage's own scope** (`state.startupMode`): the creature adapter's ladder IS the
  stage's ladder (OFF → WEAK → MED → KOZ, ruling Q1 in `deal/creatureAdapter.mjs`), sanitized through the
  adapter, so an unknown stage scope falls to the adapter's default (`weak`) exactly as the WetLab's does.
- **Constructs take ANY at every stage scope**: the construct ladder names styles and the stage pill
  names widths — there is no honest width→style mapping, so the deal picks a style in play by its own
  seeded hash, as the ANY scope does in the WetLab. A stage scope id is never passed as a construct scope.

## The landing seam, exactly

The seam the brief asked me to find if the landing were not separable: it was separable, and cleanly.
The press commit already carries an enabled-assets map and two landing channels with the right laws —
stage births for unbanked creatures (#2037) and the construct bank for constructs (whose tiles the pool
composition already draws in). "Joins the roll" is exactly: *the dealt tiles are enabled in the same map
the press commits, in the same store update, as one undo step.* No new state channel, no liveLoop or
liveResolve change, no UI surface. The one judgement call inside the seam: dealt **constructs bank**
(where a dealt creature does not), because a construct has no unbanked stage channel — its record is the
only durable form its tile can be drawn from (constructs-spec §5: a project keeps construct records only,
tiles are drawn from them). The consequence is named under Open questions.

## Issue #2373's seam — verified state on this tree (its premise is stale)

#2373 ("constructs: stage mapper and gated liveResolve hook — #2327 slice 2", still OPEN) says the
remaining work is: plumb the switch from the store/liveLoop, the governor collapse rung, and the first
live proof. **All three are already on this tree:**

- Switch plumbing: `gl/liveLoop.mjs` stamps `input.constructPieces: true` when
  `s.constructLead === true && !s.constructCollapse`, and tracks `constructPiecesLive` frame-to-frame
  from `constructPiecesDealtTotal()`.
- The mapper + hook: `engine/constructStage.js` (`constructPieceItems`) is called from
  `gl/liveResolve.mjs` behind `input.constructPieces`, with the gait (#2329) and ferrofluid break-up
  (#2330) integrations.
- Governor collapse rung: `hooks/governorCuts.js` cut 6.5 (`constructCollapse`) with restore logic in
  `hooks/usePerformanceGovernor.js`.
- Live proofs: `engine/constructStage.selfcheck.mjs`, `engine/constructPieces.selfcheck.mjs`,
  `gl/liveResolve.constructCap.selfcheck.mjs`, `hooks/constructCollapse.selfcheck.mjs`, and the
  `liveResolve.gait*` suites all exercise the path.

So scope item 3 needed no new plumbing from this slice: a construct dealt by the new press lands as a
banked record, its tile rides the pool, and the existing pieces machinery applies to it exactly as it
applies to any construct on stage. **Recommendation: close #2373 with this evidence, or re-scope it to
the one real gap below.**

**The one real gap (out of scope here):** the resolver's `recordOf` resolves only the baked HOUSE
construct records (`HOUSE_CONSTRUCT_RECORDS` in `gl/liveResolve.mjs`). A banked artist construct —
including one this slice deals — draws as its flat tile even when pieces are on and a gait moves it.
At rest that is every construct's ruled behaviour anyway (Matt, 2026-11-18: a construct at rest stays
its tile), so nothing in this slice's landing depends on it. Closing the gap means stamping the banked
records (or a tile-id → record map) into the resolver input behind the pieces gate, the way the gaits
stamp is stamped — a resolver-input change with take-replay weight, for #2327's own lane.

## Verification

- `npm install` run in this worktree before any sweep (a lock-file one-line "license" diff from the
  local npm was reverted — install noise, not part of the change).
- `npm run lint` — 0 errors, 11 warnings (all pre-existing, none in touched files).
- `npm run format:check` — clean (prettier applied to the new selfcheck before the run).
- `npm run build` — green (17.4s; only the pre-existing ineffective-dynamic-import notices).
- New suite `stageKineticDeal.selfcheck` — **9/9 groups pass**, covering: the scope mapping; a press
  deals a viable hand of 6 creatures as stage births (tiles enabled, nothing banked); a press deals 6
  construct recipes of the style in play from the kept shapes only (banked, tiles enabled); no style in
  play → no construct candidates and no error (empty shelf, one shape below the floor, junk entries);
  the empty-hand law (no dealable creatures + nothing drawable → `null`, the press untouched — this is
  the "assets exactly as before" pin the gate ruling substituted for the old gated-off pin); never dealt
  twice; determinism (same state + press → identical deal); the store presses (LOOK pass and CHAOS roll
  land the deal in their own commit, counter advancing 1 → 2, measured 6 + 6 creatures and 6 + 6
  constructs across the two presses at seed 1234567); and the CONSTRUCTS chip never read by the deal.
- Targeted suites, all pass: dealEngines (21), creatureAdapter (13), constructAdapter (9),
  beastAdapter (9), shapeAdapter (9), constructGate (7), wetLabDeal (9), constructDeal (7),
  layersPlusPattern, refineMutate, and every re-pinned suite after its re-pin (rollPool, kineticSweep,
  kineticRoll, rollKits, chapterWalk, creatureAssembler, constructAssembler).
- Full manifest sweep: **841 suites, continue-on-error (three parallel chunks, resumable across two
  sandbox restarts): 814 PASS, 27 FAIL on first run — every failure classified, none attributable to
  this diff.**
  - 5 were pins whose premise the ruling superseded — the re-pins listed above (kineticRoll, rollKits,
    chapterWalk, creatureAssembler census, constructAssembler census) — all PASS on re-run.
  - 10 were contention artifacts of the parallel run (several agents share this sandbox's 1.5 CPUs):
    cultureWorld, creatureCost, megamindEmbed, lootScan, debug, wetWarmup, fluidSim, swarmSim,
    accumFreezeClear and wetSoak each PASS on a standalone or quiet re-run on this tree.
  - 12 fail identically on pristine base (kc-2541-build @ 262dcde5) under the same conditions — the
    sandbox's known browser/WebGL and wall-clock set: swarmWasm, rollSafety, patternRender, accum,
    accumFeed, retroCapture, canvasSizes, pausedRecallPresent, vortex, composite, bgWhiteScene,
    resolverProbe. (The A11 report on main records the same set failing the same way.) CI is the
    authority for these; the coordinator's publish-time CI run is the deciding vote.

## Out of scope found — follow-up suggestions (not filed, per instructions)

1. **#2373 close-or-rescope** (above): its three remaining items are on main; the live gap is banked
   constructs not expanding to pieces (`recordOf` is house-only in `gl/liveResolve.mjs`).
2. **Construct bank pressure from presses**: every pool-dealing press banks up to 6 dealt constructs;
   the bank's ruled cap is 64 with drop-oldest, so heavy K use will eventually cycle out the oldest
   banked constructs — including ones the artist banked by hand in the WetLab. The drop-oldest law is
   Matt's own ruling for the bank, and presses only ever append through that door, but if he wants
   press-dealt constructs to be distinguishable (or the bank to refuse press deals at cap the way the
   creature bank refuses), that is a small follow-up ruling + slice.
3. **Voice/curator presses deal nothing**: deliberate (they own no pool axis; the round's redeal keeps
   its accounting). If Matt wants creatures to be able to arrive on any K tap, the deal can be extended
   to the voice commit's redeal and the curator press the way births already ride them — a follow-up,
   not this slice.

## Open questions (with recommendations)

1. **Press-dealt constructs cycling the construct bank** (item 2 above). Recommendation: leave as built
   for the review — the bank's law is ruled, the WetLab remains the deliberate-keep surface, and Matt
   can see the behaviour in one session. Revisit only if the cycling surprises him.
2. **How many land per press**: the whole wide hand (up to 6 creatures + up to 6 constructs), the
   WetLab KIN hand size Matt ruled in 2026-11-16. If the stage feels crowded, the tune is one constant
   (`handSize` at the two press calls in `stageKineticDeal.mjs`) — recommendation: play it first.
