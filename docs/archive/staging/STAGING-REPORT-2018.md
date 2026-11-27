# STAGING REPORT — #2018 plate presence fix

Branch `fix/plate-presence-2018`, base origin/main `8e85f860` (the clean plate as
merged, PR #2009). Local commit only — no push, no PR (the coordinator publishes;
PR #2019's files are disjoint, no rebase done here).

The four levers from the plate-presence audit
(`goals/kinetic-curator-generative-art-instrument/files/research/plate-presence-audit-2026-11-06.md`),
built as one bundle. All changes are plate-gated: with no plate standing, the built
item list is byte-identical to the pre-#2005 pipeline.

## Lever 1 — suppress by footprint, room after mirroring

`app/src/engine/buildPlacements.js`. The room's constants are unchanged —
`PLATE_ROOM_ALPHA = 0.15`, `PLATE_ZONE_PAD_EM = 0.75` (Matt's #2005 feel gate; the
audit ranked changing them symptom-level/mis-aimed). What changed is the test and
the timing:

- The FIELD block now only MEASURES the zone (the shipped formula: the form's ink
  bbox breathed out by the pad) and remembers it as `plateRoom = { zone, keys }`.
- The room is APPLIED at the end of the build, on the final list in final
  coordinates — after the overlap sort, `mirrorItems`, and the glass sort:
  - Suppression test is each mark's ink FOOTPRINT — centre ± 50·scale (the scene
    contract's central cell box, `scaleY ?? scale`) — entering any zone, instead
    of the mark's centre alone.
  - Zones = the plate's zone plus its reflections under the layer's mirror
    state, so a reflection is quieted in the zone it lands in and a mirrored
    plate has a room of its own. A mark is multiplied by `PLATE_ROOM_ALPHA`
    at most once, however many zones its ink enters.
  - Plate items (originals and `-mx`/`-my` copies, matched by key) are never
    suppressed. Suppression reads only the built list, so the preservation law
    stands: remove the plate and every mark restores exactly; held/kept marks
    were never in the list and are never the plate's business.

## Lever 2 — plate ink contrast rule

`app/src/engine/buildPlacements.js`. While a plate stands, all its stamps deal in
ONE palette swatch: the one most distant from the colours the layer's marks
actually wear (the dealt colours on the built mark list, field map applied).
Distance is measured in the palette's own RGB space (`hexToRgb255`), as a
frequency-weighted sum: a swatch's score is its squared distance to the marks'
colours summed over EVERY mark; the highest score wins, ties keep the earliest
swatch; the accent follows by the kernel's `ACCENT_OFFSET` (3). Design note: a
bare maximin over the distinct worn colours degenerates on a real dense stage —
the marks wear the whole palette, every score collapses to 0, and the rule
silently deals slot 0. The summed form is the same "most distant" rule made
collective: a colour the room wears often pulls its score down in proportion.
The pick is a pure function of the dealt state — no RNG draws (the form's stream
discipline is untouched), replay reproduces it bit-for-bit. Fallbacks: no
swatches, or no marks standing → the per-stamp `assignColor` every other form
uses. On the dense fixture below the rule deals `#e8e3d5` (the pale paper swatch,
against the teal-heavy room), accent `#27565a`.

## Lever 3 — plate draws last within its own layer

Same end-of-build block: a stable partition moves the plate's items (originals
and mirror copies) after every mark of the layer, in built order, into a fresh
array (the pooled list is never reordered in place). Only when a plate stands.
The citizenship boundary holds: layers above still composite over the plate, FX
still acts on it — only the within-layer order changes.

## Lever 4 — grid-recipe em floor

`app/src/poets/placement.js`: new named constant `PLATE_EM_FLOOR = 0.045`,
grid recipe only, plates only. When the shipped measure fit would clamp a grid
plate below the floor, the measure yields in two steps: (a) refit against the
optical margins' own box — if the floor fits there, the deal takes it; (b) else
the rows re-break at the floor (new `wrapGridRows`: greedy, breaks prefer spaces
and eat them, hard cell break inside an over-long word) and the final fit runs —
the dish's height may still pull a deal a hair under the floor, because the edge
is sovereign and the measure is not. No new RNG draws (the module-origin draw
count is unchanged; the suite's plate-vs-plain draw-count pins pass). Bands,
two-piece and single recipes are untouched.

Em readings through the real deal path (`fieldDealReport`, `mkRng(42)`, aspect
10/7), against the audit's table:

| piece | recipe | before | after |
|---|---|---|---|
| g1 | grid | 0.0290 | **0.045** (rows re-break 2 → 3, 25 stamps) |
| g3 | grid | 0.0374 | **0.045** (measure yields, still 2 rows) |
| g2 | bands | 0.0677 | 0.0677 (unchanged) |
| g4 | bands | 0.0721 | 0.0721 (unchanged) |

## The dense fixture (the audit's complaint, answered)

New sections in `app/src/poets/fieldPlate.selfcheck.mjs` stand a g1 plate on the
audit's drive-density parameters — count 450 (the geometry stage deals **401**
marks, as in the audit's B build), scale [0.4, 1.6], alpha [40, 100], density 92,
mode grid, canvas 1000×700, seed `0x1a4f`, the first three authored assets, a
six-swatch palette — and MEASURE the zone the audit's way: a CPU composite of
the built list in draw order (Resvg ink rasters, premultiplied source-over,
area-weighted per pixel):

- Zone effective opacity, no plate: **0.9181**
- Same build, pre-#2018 centre-only room (simulated): 0.4481
- Same build, footprint room (shipped here): **0.3022** (0.33× of unroomed)

(The sparse seam fixture this replaces as evidence composited 0.004–0.026 — the
audit's "6–40× clearer than a real dense layer".) Per-item, against the plain
build by key, with zero mismatches: centre-in 84 suppressed, **lean-in 64
suppressed** (the audit's dominant leak, previously at full alpha), fully-out
253 untouched. Mirror case (count 200, mirror 'x'): zero mismatches against
either zone; **36 marks are suppressed by the mirrored plate's room alone**;
the plate and its reflection (50 items) form the tail of the list. The suite
also pins the ink rule against its own restatement of it, full-build replay
byte-identity, the lone-mark and no-swatch fallbacks, and the em table above.

## Non-plate identity

- `census.selfcheck` — placement census **560,366 / 0** unmoved.
- `goldenPlacement.selfcheck` — golden hash `e892d112b20d92b6…` unmoved.
- `fieldBattery.selfcheck` — replay byte-identical.
- Full manifest sweep: **613 pass / 3 fail** of 616. The 3 failures are the
  known sandbox-environment failures on this base, proven base-identical in the
  slice-1 lane: `swarmWasm` (no cargo), `rollSafety` (Chromium crash), `accum`
  (V8 OOM). None touches the plate machinery.
- `npm run format:check` clean (prettier reflowed `buildPlacements.js` —
  formatting only, suites re-run after). `npm run lint`: 0 errors; the 11
  warnings are pre-existing React-hooks warnings in untouched UI files.
- e2e grep: no spec under `app/e2e/` mentions "plate" at all; the change gives
  no selector, word, or enum new meaning.

## Re-pin account

No re-pins outside the plate suite's own expectations. Inside
`fieldPlate.selfcheck.mjs`, three caused amendments, each the lever's own
definition:

1. The measure assertion (`ink ≤ PLATE_MEASURE·aspect`) gained the grid-yield
   escape: a grid plate at/over the floor may use up to the margins' box —
   lever 4 widening the measure is the ruled behaviour (first tripped by g1
   at aspect 16/9, seed 1).
2. The seam fixtures' room predicate changed from centre-in to the footprint
   test (lever 1's definition); the fixtures now also count the lean-in
   population the old predicate was blind to.
3. The cross-deck em sweep gained a height-bound escape for grid plates: a
   deal the dish's height binds may sit under the floor (the edge is
   sovereign — see lever 4).

## Files

- `app/src/poets/placement.js` — `PLATE_EM_FLOOR`, `wrapGridRows`, the grid fit.
- `app/src/engine/buildPlacements.js` — footprint/post-mirror room, plate-last
  partition, contrast ink (`ACCENT_OFFSET`, `hexToRgb255` imports).
- `app/src/poets/fieldPlate.selfcheck.mjs` — the dense fixture, composite,
  mirror room, ink rule, em table.
- `STAGING-REPORT-2018.md` — this report.
