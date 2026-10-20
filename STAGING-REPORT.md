# STAGING REPORT — #1575 Travel kinemes P2 (PATH transports + assignment) (LOCAL ONLY — no push, no PR)

Branch: `ember/1575-travel-paths` (local only — not pushed, no PR)
Base: stage-1 branch tip `9d6fb42c` (#1574 P1, committed locally on `ember/1574-travel-core`)
(This file replaces stage 1's staging report at the worktree root; stage 1's remains in git history.)

## What was built, in plain language

Marks can now travel a **dealt path**, not just roam the noise field.
Where P1's FLOW is a little physics sim (each mark carries offset +
velocity in a store), PATH is a **pure function**: give it the sim time
(the same locked step count P1's clock already counts), the mark's seed
and the path params, and it returns where the mark's anchor is — no
per-mark state at all, so a replay lands on the same frame by
construction, not by discipline. Four families live behind the params:

- **orbit** — the mark turns around the dish centre (the canvas centre
  in placement coordinates), keeping its own radius, so the whole
  composition rotates instead of collapsing onto one shared ring.
- **spiral** — the same centre, but the radius breathes ±radius px on a
  slow sine while the angle drifts.
- **sweep** — a cross-canvas lane with wrap: the mark crosses the full
  width at its own home height, bowed into an arc, held at both ends
  (its progress is eased, never a linear glide), and wraps.
- **lissajous** — a two-sine weave around home, anchored: at t=0 the
  offset is exactly zero, like every kineme driver.

The anime timing law is in the shapes: arcs everywhere, an
**anticipation lean** against every departure (measured below), held
extremes (sinusoidal velocity falls to zero at the extremes), and a
departure ease so marks leave home slowly instead of snapping to full
speed.

**Assignment (Q1, Matt's ruling 2026-10-14) is family data**, a pure
table in `kineme.js` in the #1434 pattern: linework declares FLOW,
glyphs (stamps + glyph/letter/type-tagged assets) declare PATH, heavy
solids (weight `heavy` AND density `solid` — the org_blob class)
declare still, and unnamed families declare nothing and follow the
stratum's own word (which is exactly how P1 shipped, so P1 scenes are
untouched). Two parts bite behaviourally today: a heavy-solid mark
**anchors** — it stays home bit-exact inside FLOW and PATH scenes —
and the artist's existing per-asset pin (`assetStill`) tames any mark
home, as it already did for FLOW. The family's declared mode is also
what the new BUILD chip shows (below).

**Controls split (Matt's ruling, comment 2026-10-14) is honoured
exactly:** BUILD gets one minimal chip on each KC stratum block —
`travel <mode> · fam <family default>` — which selects the stratum on
first tap and cycles its mode (still → flow → path) on the next; no
amounts, no clusters in BUILD. Everything richer lives in the
**Directors motion group**, extended from P1's group: `path` joins the
mode row, and under it the family chips (orbit/spiral/sweep/
lissajous, TE) plus speed (%) and radius (px) on the house slider; the
leash row now shows for PATH as well as FLOW.

**The Jell-O metric is in the census output**: per scene (still, flow,
and the four path families on the census cast), how many marks travel
and their mean distance-from-home over a 90-frame window. Reported,
steering nothing — no consumer reads it. Measured sample below.

**Stretch-along-velocity**: fast FLOW/PATH marks elongate along their
travel direction through the deform channel (`a_def`). The shader
squashes along its axis and bulges across it, area-preserving, so the
stamped axis is the velocity's *perpendicular* — that is what
elongation along travel means in this channel. Capped at 0.3, nothing
stamped under 45 px/s, and buildPlacements never overwrites an item
that already carries its own deform (placement items carry none today;
the guard stands for any future producer). Verified end-to-end: a fast
lissajous scene's items reach the scene contract as `deform` triples.

Under the governor, PATH is travel: `travelActive` now includes
`transport === 'path'`, so cut 1.6 sheds it with FLOW. A shed PATH
frame presents home immediately and its step clock **freezes** (steps
do not advance), so a shed path resumes where it left instead of
jumping to where its clock would have been.

## ⚠ OPEN FORKS — not built, by the dispatch's explicit carve-out

- **Q4, leash scope (global vs per-stratum): NO ruling from Matt.**
  Nothing per-stratum was built: P1's single scene-level
  `transportLeash` stands exactly as it was. Two builder's calls were
  made *under* that open fork and are recorded here, not hidden:
  (1) the leash radially caps the centred/weave PATH families
  (orbit/spiral/lissajous), as it caps FLOW's roam; (2) sweep's lane is
  its defining geometry — a radial cap would plateau its wrap — so
  the leash caps only sweep's arc (its y offset). If Matt rules
  per-stratum leashes, both calls revisit with that ruling.
- **Q2, the traveler budget (inherited from #1574): still no ruling.**
  No budget mechanism of any kind was built in this stage either: in a
  FLOW/PATH scene every non-anchored, non-pinned mark travels.

## New recipe keys (named exactly — for the coordinator's strip-proof)

This stage adds exactly **three** new layoutParams keys, plus one new
value on an existing key:

- `transportPath` — enum, `orbit | spiral | sweep | lissajous`, default `'orbit'` (inert unless transport is 'path')
- `transportSpeed` — numeric, 0..2, default `1`
- `transportRadius` — numeric, 0..300 px, default `140`
- `transport` (existing P1 key) gains the value `'path'`

Like P1's three keys, these ride defaults-merged layoutParams, so the
resolver output echoes them and the recorded fixtures behind
`gl/replayGate`, `gl/creatureGate` and `engine/wingWarp` move again —
the same documented, strip-provable mechanism as stage 1, now with
these three additional keys to strip. No pin or fixture was re-recorded
in this stage.

## Files touched

Implementation:
- `app/src/engine/kineme.js` — `TRANSPORT_MODES` gains `'path'`;
  `PATH_FAMILIES`; the family-assignment table (`familyDefaultTransport`,
  `isFamilyAnchored`, `defaultTransportForCast`, `nextTransportMode`,
  `transportChipLabel`); the PATH core (`pathAnchor` — pure, with the
  timing-law shapes; `travelStretchAmount`, cap/floor constants);
  `applyTransport` extended: PATH present on the shared step clock
  (stateless — the store holds only steps/acc for the scene), leash
  cap, shed freeze, and the stretch scratch filled for FLOW and PATH;
  the `travel/path` cost-tier declaration (tier 0, measured — below).
- `app/src/engine/buildPlacements.js` — the transport gate takes
  'path'; the per-mark assignment (family anchor ∪ artist pin) rides
  the pass's still array; PATH params (path/speed/radius) and the
  deform scratch ride the travel input; items are stamped with the
  deform triple only while stretched (pool path sets/clears per call,
  fresh path stamps only when > 0 — resting items are field-for-field
  the pre-P2 items).
- `app/src/data/layout-modes.js` — the three new keys: defaults,
  `PARAM_SPEC` bounds (speed 0..2, radius 0..300), the `transportPath`
  enum (absent/unknown → 'orbit').
- `app/src/hooks/usePerformanceGovernor.js` — `travelActive` includes
  'path' (one line + comment; the rung itself is P1's, unmoved).
- `app/src/panels/DavisPanel.jsx` — the Directors motion group extended
  (mode row gains 'path' from the vocabulary; family chips + speed +
  radius rows under PATH; leash row shared). No new panel.
- `app/src/panels/build/LayerStack.jsx` — the minimal mode chip on KC
  stratum blocks (mode + family default from the stratum's snapshot
  cast; select-then-cycle). No control clusters.
- `app/src/curator/censusReport.mjs` — the Jell-O metric
  (`jelloMetric()` + a formatted census section); KEY_FIXTURES for
  `transportSpeed` / `transportRadius` (travel driver, lissajous ctx —
  both measure as MOVES); a STRUCT_FIXTURES row for `transportPath`.

Tests:
- `app/src/engine/travel.selfcheck.mjs` — extended, sections I–O
  (P1's A–H untouched except the H vocabulary pin, 'still'/'flow' →
  + 'path', which is this stage's own change): PATH pure-function
  laws (anchored deal, purity, orbit radius, spiral breathing, sweep
  wrap + lane band, held extremes, anticipation lean measured against
  lean-off), PATH through the pipeline (replay-exact over 300 uneven
  frames, stateless store, leash cap, sweep cross-canvas, speed 0 /
  radius 0 bit-identical to still, leash 0 parity + store untouched),
  PATH shed (home + frozen clock + resume), family assignment (table,
  cast default, chip cycle/label, heavy-solid anchor and artist pin
  through the pipeline), stretch (cap, floor, exact perpendicular
  axis, stamped-only-while-fast), PATH cost re-measurement, PATH
  params. **685 checks passed** (P1's 50-check suite grew; the count is
  the harness's own ok()+assert tally).
- `app/src/curator/census.selfcheck.mjs` — the key-universe constant
  22 → 23 structural keys (the `transportPath` enum is the new
  structural key — the same pin P1 updated for `transport`); a Jell-O
  assertion block (still travels nothing; every travel scene travels
  with a real mean; the formatted report carries the section).
- `app/selfcheck.manifest` — **unchanged**: no new suite file was
  added (P2 extends the existing travel suite, already registered).

## Feel / behaviour numbers (sandbox, this build)

Jell-O metric, census cast (48 placed marks), 90 frames at 60 fps:

| scene | travelling | mean distance-from-home |
|---|---|---|
| still | 0/48 | 0 px |
| flow (leash 200, flow 1) | 38/48 | 26.47 px |
| path/orbit (leash 300) | 38/48 | 30.12 px |
| path/spiral (leash 300) | 38/48 | 27.75 px |
| path/sweep (leash 300) | 38/48 | 240.02 px |
| path/lissajous (leash 300) | 38/48 | 123.75 px |

(38/48, not 48/48, is the assignment working: the cast's heavy-solid
and slow marks anchor or stay under the 1 px travel threshold — the
metric reports the cast as dealt, it does not grade it.)

PATH in the travel suite's own scene (120 marks, lissajous, leash
300): mean roam > 10 px with the leash as the hard max (suite
asserts both). Anticipation measured against the same function with
the lean switched off (suite-pinned bounds): sweep's departure dip
**> 3 px** against its travel direction, the weave's lean **> 1 px**
in its first half-second. Held extremes: the weave's speed falls
under 35% of its peak inside its cycle (suite-pinned bound).

## Cost (measured, not estimated)

`travel/path` is registered at **tier 0** on the same doctrine as
`travel/flow` (structural, no GPU pass, sheds by the governor's own
rung). Declared `timeMs: 0.66` is the measured resolver-CPU figure:
`applyTransport` in PATH mode (lissajous present + stretch
finite-difference) at the 800-mark cap, one locked step + present,
median of 7 runs × 200 calls = **0.662 ms** (the suite re-measures on
every run; latest print 0.662 ms). FLOW's declaration is unchanged
(re-measured 0.39 ms this run). Sandbox-indicative only.

## Acceptance evidence

- **Four path families behind params with Q1 defaults** — orbit /
  spiral / sweep / lissajous behind `transportPath` (+ speed/radius),
  family defaults per the Q1 table (`familyDefaultTransport`).
- **Parity suite green for still scenes** — travel.selfcheck A
  (P1's, unchanged) plus P2's own gates: PATH + leash 0 bit-identical
  with the store untouched; PATH speed 0 and radius 0 bit-identical
  to the still frame; still items carry no deform fields.
- **Jell-O metric in the census output** — `jelloMetric()` rows +
  the formatted "RA3 Jell-O metric" section; census suite pins it.
- **`npm run build` green**; ESLint clean on every touched file.
- **No golden hash was weakened or re-pinned.** The one pin updated is
  enumerative, not measured: the census key-universe constant
  (22 → 23 structural) — a new enum key must appear in it, exactly as
  P1's `transport` did.

## Deviations from the issue, and why

1. **Orbit's centre.** The issue names "orbit (dish center default)".
   Placement coordinates have no separate dish-centre value — the
   dish is the canvas — so orbit/spiral turn around the canvas
   centre, each mark keeping its own radius/phase. Recorded here as
   the reading the build stands on.
2. **Roam defaults are assignment, not a new default mode.** P1's
   parity law (a document with no transport word opens still, exactly
   as saved) forbids silently flipping existing scenes to a family
   mode, so the roam half of Q1 lands as (a) the family table itself,
   (b) the stratum chip's shown family default +
   `defaultTransportForCast`, and (c) the behavioural anchor half
   (heavy solids) which applies inside any live transport. The
   stratum's explicit recipe word remains the artist's — choosing
   'path' for a glyph-led stratum is one tap on the chip the ruling
   itself specified. Flagged plainly so Matt can rule otherwise.
3. **Sweep vs the leash.** See the Q4 fork above: the lane is not
   radially capped (its arc is), because a radial cap plateaus the
   wrap the family is defined by. Under the unresolved Q4 this is a
   builder's call, recorded, not a ruling.
4. **PATH shed freezes its clock** where FLOW's shed settles through
   the sim: a pure function has no velocity to settle, so the honest
   shed is home-now + a frozen clock (no jump on resume). The badge
   and rung are P1's, unchanged.

## Not built (by design)

- **Q4 per-stratum leashes** — see the open fork.
- **Q2 traveler budget** — see the open fork (inherited).
- **SURGE (P3, #1576)** — the next stage; no hooks built for it.
- A per-asset "force roam" override for anchored heavy solids: the
  issue's override word is *tames* (roam → still, which the existing
  pin does); forcing an anchored mark to roam has no ruled surface
  and none was invented.

## Selfcheck results

- `app/src/engine/travel.selfcheck.mjs` (extended): **685 checks
  passed** — P1's A–H (parity, determinism, live FLOW, leash law, shed
  settle, governor order, cost, params) plus P2's I–O (PATH pure
  function, PATH live, PATH shed, family assignment, stretch, PATH
  cost, PATH params).
- `app/src/curator/census.selfcheck.mjs`: **green**, including the new
  Jell-O assertions and the three new keys measuring as MOVES through
  their fixtures (the dead-knob set is unchanged: only
  `kinemeBrushWobble`).
- Affected existing suites, run individually, all green:
  buildPlacements, kineme, governorCuts, governorCreatureShed,
  governorHostileScene, costTiers, governorEventLog, censusReadout,
  normalize, goldenPlacement, liveResolve, liveResolve.determinism,
  livingMotion, materialParams, bundle / bundleKeys / bundleParts.
- `npm run build`: **green**. ESLint on every touched file: **clean**.
- Full manifest sweep, stated exactly: the manifest holds 485 suites.
  `npm run selfcheck` ran the first **76 suites green** and stopped at
  `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` (command 77), which
  fails with **`cargo not found on PATH`** — environmental, identical
  to stage 1 (no Rust/WASM file is touched by this stage). Every one
  of the remaining **408 suites was then run individually**: **403
  passed, 5 failed**. Total: **479 of 485 suites green**. The 5
  individual-run failures (+ swarmWasm = 6 non-green of 485):
  - `gl/replayGate`, `gl/creatureGate`, `engine/wingWarp` — the three
    suites stage 1's report documents as failing on this stack's base
    for the key-echo reason (P1's three recipe keys move the recorded
    checkpoint hashes / resolver pins; strip-proven by the coordinator
    in stage 1). Their failure shapes here are the same assertions
    ("no checkpoint diverges" at checkpoint 0; "the resolver at rest
    is the pinned output"). This stage adds three more keys of the
    same kind (`transportPath`, `transportSpeed`, `transportRadius`),
    named above for the coordinator's separate strip-proof. No pin or
    fixture was re-recorded.
  - `fx/rollSafety` — sandbox-environment: the headless browser dies
    mid-suite ("Target page, context or browser has been closed");
    documented as failing identically on clean main.
  - `gl/accum` — sandbox-environment: progresses through its [ok]
    checks and dies at its browser stage in this sandbox; documented
    as failing identically on clean main.
  No other suite failed, and no suite was skipped: 76 + 1 + 408 = 485,
  every manifest suite accounted for above.
