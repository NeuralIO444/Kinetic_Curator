# STAGING REPORT — #1872 Simulate / Cultivate (creatures, of #1848)

Branch `feat/simulate-cultivate-1872`, base main `2693b758` (Strand Bank merged). Local commits only — no push, no PR.
Feel-gate slice: the miniature is a feel surface; it goes through Matt's review lane.

## Scope vs spec, point by point

1. **CULTIVATE is an invoked step on a selected creature record**, between assembling (#1849) and injecting
   (#1850) — a `cultivate` chip on each record row (and on each beast row) opens the panel; the panel's press
   is the invocation. Not an always-on panel: opening shows the sketch playing and any standing note; the
   reads are produced by the press and written onto the record.
2. **Three reads, presented together** (derivation: `app/src/components/cultivate.model.mjs` — the
   Timeline/Tree/Bank family pattern: advisory derivations only; the engine and the door stay the law):
   - **Body-language sketch** — an animated miniature playing live, rendered by the new reusable
     `app/src/components/CreatureMiniature.jsx`. For a creature record it renders the scene contract's own
     expansion (`expandCreatureInstances` — Davis deals the parts from the stage's pile, Lois's gait poses
     the bones) at time t, so the miniature cannot disagree with the stage; for a linkage body it draws the
     #1865 solver's own gait sweep (`poseLinkage`) — the formula is the preview. No second physics, no
     preview-only approximation. The component takes a subject (`record` | `linkage`) so the WetLab Big
     Lab's centered stage (#2034) reuses it unchanged.
   - **Cost estimate** — the cost registry's own accounting for the record's body (`assets/cost.js`'s
     `getAssetCost` against `COST_WARNING_THRESHOLD`), the same numbers the Strand Bank's warnings carry:
     an over-budget creature is known before the governor.
   - **Integrity read** — feasibility where a feasibility notion exists, plus the bank's gene conflicts.
     For a linkage body, the gate itself: `jansenSolver.evaluateGenome` over the sanitized measures
     (assembles across the full cycle, or a stillbirth), with the solver's Wang metrics when it lives. For
     a record, the one hard feasibility the record machinery already defines: its tile can be built
     (`creatureTile`) — the same fact bankCreature and the hand-edit path refuse on as 'nobody'. Gene
     conflicts are the Strand Bank warnings, re-derived from the record's own combination by the bank's own
     `assemblyWarnings` over the record's reconstructed ATTACH points — no new warning logic.
3. **A failed integrity read is a stillbirth, recorded honestly on the record** — full law below.
4. **Determinism** — a cultivate read on a given record is reproducible: the reads are pure functions of
   the record and its body asset; the sketch's play is seeded (the record's deal, the contract's phase),
   pinned by the suite at fixed t. The one non-derived stamp is the seed the cultivation was invoked
   under — provenance, in the codebase's own terms (below).
5. **The stage stays the real gate** — the store action writes the record alone: no tile is built,
   rebuilt or removed, nothing is enabled or placed (pinned at the store level, by reference). CULTIVATE
   never blocks injection of a valid record and never injects anything itself. No stage changes. Beasts'
   linkage feasibility is in scope (the panel + the read); the Strand Bank's beast posture is untouched.

## Survey findings (each traced to the code that defines it)

- **Cost registry** — as the #1871 survey found: the registry prices ASSETS, not records
  (`assets/ingest.js`'s `assetCostScore`, read through `assets/cost.js`'s `getAssetCost`; line at 600).
  The cultivate cost read is exactly that accounting applied to the record's body. A linkage has no asset
  drawing to price (its bars wear parts the stage deals), so a beast's cost read is honestly absent —
  stated in the panel, never estimated.
- **Feasibility notions that exist** — exactly two. The linkage gate (`evaluateGenome`: feasible across a
  360-step crank sweep, or `stillborn`), and tile-buildability for records (`creatureTile` returns null
  when the body cannot be drawn — the 'nobody' refusal at bank/edit time). A record that loses its body
  after banking (an import removed) is reachable only through the bank-following panel or the door, but the
  read and the recording are built at the engine level where the fact lives.
- **Beasts are tiles, not records** (`engine/beastTile.js`'s own header), and the overlay door
  (`assets/overlay.js`'s `sanitizeOverlay`) rebuilds a tile field-by-field — a cultivation note on a beast
  tile would not survive a save. So a beast's cultivate panel presents its reads live from its measures
  and writes nothing; the panel says so. Banked beasts are never stillborn at mint (the gate runs inside
  the deal); a stillborn set can only arrive by a hand-edited document, which the beast rows omit today
  (#1868's standing posture, unchanged) — the gate's verdict on such sets is pinned at the read level.
- **Provenance convention** — the codebase records acts by seeds, never clocks (creatures-spec §2:
  "Nothing reads a clock or a random source"; gene sources, `lineage.seed`, the assembler's seed-keyed
  identity). The note's "when" is therefore the project seed the cultivation was invoked under — the
  take's terms.

## The cultivation note

```json
"cultivated": {
  "seed": 42,
  "outcome": "viable",
  "cost": { "score": 55, "threshold": 600 },
  "warnings": [
    { "id": "skeleton:no-head", "kind": "skeleton", "cost": null },
    { "id": "skeleton:no-limbs", "kind": "skeleton", "cost": null }
  ]
}
```

- Written only by the CULTIVATE press, through `withCultivation` (the engine never writes a record its own
  door would not load — the assembler's rule for `kept`). Re-cultivating replaces the note: the latest
  cultivation stands. Breeding never inherits it (a child is born uncultivated); assembling never writes it.
- **The door** (`sanitizeCultivation`, in `engine/creatureAssembler.js`) validates it with `kept`'s
  discipline: closed vocabulary (`CULTIVATION_OUTCOMES` = viable | stillborn), bounded (the warnings list
  is the bank's, capped by the same named `MAX_KEPT_WARNINGS = 8`), and cross-checked wherever the record
  carries the evidence:
  - outcome and cost tell one story: **stillborn ⟺ cost is null** (the one stillbirth a record knows is
    an undrawable body, and an undrawable body has no registry price); a viable note's cost must stand at
    the registry's own threshold constant.
  - the warnings must be **exactly** the set the record's facts derive, in catalogue order: a cost entry
    exactly when the note's own score stands over the line (its numbers the note's own, its body the
    record's own), a skeleton entry exactly when the genome it rides carries the absence it names — every
    entry additionally held by the exported `keptWarningHolds`, the bank's own cross-check.
  - the seed is a uint32, held to shape.
- **Honest limits, stated plainly** (the `kept` precedent): the score's provenance is the cultivating
  surface's reading of the asset (a record carries no SVG, so the door holds the claim's shape and its
  over-the-line fact, not the number's origin), and drawability is likewise the surface's reading of the
  pool — the door holds the note's internal story (outcome, price and warnings in exact agreement), which
  is what makes a hand-forged note refuse unless it is at least a coherent cultivation of this record.
- **Bred records may carry the note** — unlike `kept` (an assembly claim a bred record would lie by
  carrying), cultivation is an act performed on the record as it stands, founder or child alike. The
  #1871 law is untouched: `kept` on a bred record still refuses (pinned).
- **Hand edits retire the note** (`handEditRecord`): a cultivation describes the creature exactly as it
  stood; any hand edit makes a different creature of it, so the note retires with the edit rather than
  riding along stale — or refusing the edit at the door when a resolved skeleton contradicts it. The
  edited gene's `hand:` source records the act that retired it; the performer cultivates again to read
  the edited animal.
- A record never cultivated carries no field: pre-1872 records (the suite embeds the literal
  main-`2693b758`-shape record the Strand Bank suite pins) open and re-save byte-identical.

## Files

- `app/src/components/cultivate.model.mjs` (new) — the three reads' derivation + the sketch frame
  derivation (`sketchInstancesAt` / `linkageSketchAt`) + the note's construction and read-back.
- `app/src/components/CreatureMiniature.jsx` (new) — the animated miniature, a reusable component
  (record subjects via the contract expansion, linkage subjects via the solver sweep) — #2034's stage
  inherits it.
- `app/src/components/CreatureCultivate.jsx` (new) — the panel: miniature, the three reads in TE, the
  press, the standing note; linkage mode presents a beast's live reads.
- `app/src/components/cultivate.selfcheck.mjs` (new) — 62 checks; registered in `app/selfcheck.manifest`
  after the strandBank line.
- `app/src/engine/creatureAssembler.js` — `CULTIVATION_OUTCOMES`, `sanitizeCultivation`, `withCultivation`;
  the door validates `cultivated` on both the assembled and bred return paths.
- `app/src/engine/creatureBreed.js` — `handEditRecord` retires a cultivation note on any edit.
- `app/src/state/slices/globalSlice.js` — the `cultivateCreature(recordId, note)` action (writes the
  record alone) + the session-only `creatureCultivateNote`.
- `app/src/panels/WetLab.jsx` — a `cultivate` chip per record row and per beast row, the
  `record-cultivated` marker, the two panel mounts (the record panel follows the record in the bank, like
  the Timeline and the Tree); the part preview's stage-pile computation hoisted to one `stageIds` the
  miniature shares; record rows now wrap instead of overflowing the sheet at phone width.
- `app/src/engine/creatureAssembler.selfcheck.mjs` — census allowlist +4 (the model, the panel, the
  miniature, the suite), with the #1872 cause comment — the sanctioned pattern from #1870/#2030/#1871.

## Verification

- New suite: **62 checks, green 5× in a row.** Coverage, by acceptance item: cost read equals the
  registry's own accounting (hand-computed 700 fixture, stamped-score and at-the-line boundaries);
  integrity read matches the linkage gate's verdict on an assembling set (the wild type) and a
  non-assembling one (k at its legal band edge), cross-checked against `evaluateGenome` and `isStillborn`
  directly; stillbirth recording (written, persists byte-identical through the store, door-valid; a
  15-case tamper battery refuses whole-record); sketch determinism (same record → identical frame at fixed
  t; the play moves between t; a boneless creature sketches as its still bare body; a stillborn body
  sketches nothing); no-injection (the pool and the switches untouched, by reference); legacy parity (the
  pre-1872 literal byte-identical; the note is the only difference on a cultivated record).
- Neighbours unedited and green: strandBank 47, creatureAssembler 11 (incl. the census), creatureBreed 10
  (green 5×), genomeTimeline 18, lineageTree 18, creatureInjection 13, creatureKin 6, creatureMoods 5,
  creatureRig 10, wetLab ok, beastReadout ok, beastSettings 7, assetAttach ok, foldInCensus 11.
- e2e: the only WetLab-touching specs (`beast-assemble`, `wetlab-descriptors`) use `wet-lab`, `beast-row`
  counts and the store's two-argument assemble — all unchanged; the additions are chips inside existing
  rows (row counts untouched) and new testids. The word `cultivate` appears nowhere in `e2e/`. The
  descriptors spec's phone-width no-overflow pin is why record rows wrap (above).
- Full manifest sweep (continue-on-error over `app/selfcheck.manifest`, 622 suites passing): the only
  failures are the three standing sandbox failures — swarmWasm (no cargo/rustc in the sandbox),
  rollSafety (sandbox Chromium/GL), accum (native abort) — base-identical to the #1871 sweep's failure
  set, CI authoritative.
- `format:check`: clean tree-wide (after `prettier --write` on the four new files it first flagged).
- `npm run build`: green — the panel and miniature compile into the production bundle.
- Lint: 0 errors; no warnings in any touched file (the 11 standing warnings are in untouched files).
