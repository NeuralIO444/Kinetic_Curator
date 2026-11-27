# STAGING REPORT — #1871 Strand Bank (creatures, of #1848)

Branch `feat/strand-bank-1871`, base main `c91ab10a`. Local commits only — no push, no PR.
Feel-gate slice: the surface is the assembler's posture; it goes through Matt's review lane.

## Scope vs spec, point by point

1. **The bank becomes how the assembler works.** The WetLab ASSEMBLE block is rebuilt around strands:
   a body row (the opened shape, strand `asset:<id>`), a role-set row (AUTO chip = the existing
   `autoAssetAttach` action; the artist's own set shown as the in-use strand when one exists), Look and
   Voice `<select>` detents ("dealt from the seed" is the empty pick), a warnings list, and the assemble
   press — whose label reads "assemble — keep N warning(s)" while warnings are showing. The attach
   editor above it, the BREED section, BeastSettings, the records list, and the Genome Timeline /
   Lineage Tree mounts are untouched. The beast builder keeps its current controls (ruling 2).
2. **Strand catalogue (pure model).** `app/src/components/strandBank.model.mjs` — the Timeline/Tree
   family pattern: advisory derivations only; the engine and the door stay the law.
   - Asset strands: `asset:<assetId>` for every pool asset (the FORM genes' own source grammar).
   - Role-set strands: `points:auto:<assetId>` (points = the sanitized AUTO set) and
     `points:own:<assetId>` (only when the artist holds an entry in `assetAttach`; sanitized through the
     attach door). The ACTIVE set is own-when-edited else auto — the existing `assetAttach` state
     remains the single source of truth; the bank keeps no parallel state.
   - Gene strands: `look:<presetId>` for every COMPOSITION_PRESETS entry, `voice:<voiceId>` for every
     VOICE_DECK entry — the exact sources the engine writes for named picks.
   - **DRIVE and MATERIAL are strandless, and the model exports that judgement with reasons**
     (`strandlessFamilies()`): a drive is a continuous gain (legal range 0.25–2) born at the wild norm —
     posing it as a named discrete ingredient would be the mush the bank removes (KC-1 DS: a continuous
     quantity does not render as a discrete choice); drives live by breeding blends and Timeline hand
     mutation. MATERIAL has no legal value space at all (the null stub — the same finding as the
     Timeline's mutate refusal).
3. **Compatibility warnings, in the open.** Derived by the model from the picked body + role set only
   (gene picks never warn — see the catalogue below). Each warning is inspectable data —
   `{id, kind, what, why, cost}` — rendered as what / why / the registry's numbers. Warnings never
   block; the only refusals remain the door's own.
4. **Keep-knowingly recording.** New record field `kept`: data-only entries `{id, kind, cost}` (later
   surfaces render their own words, as with gene sources). Full law below.
5. **Detent discipline.** No range input exists in the assembler surface — there were none in WetLab
   before this change and none were added; every bank control is a chip or a `<select>`. Pinned by a
   source-shape check in the suite over WetLab.jsx and the bank model.

## Survey findings (each traced to the code that defines it)

- **Cost registry.** `app/src/assets/ingest.js`: `assetCostScore(svg) = Math.round(count × (1 + depth/8))`
  where the count is drawable elements (`countSubpaths`) and depth is `<g>` nesting; 
  `COST_WARNING_THRESHOLD = 600`; ingest stamps a non-blocking `costWarning` flag over the line
  ("the operator deserves to know it may cost frames"). `app/src/assets/cost.js`'s `getAssetCost(asset)`
  (an ingested finite `costScore` wins, else computed from the svg) is what `gl/liveResolve` ranks by.
  **The registry prices assets, not records or genes** — nothing anywhere prices a creature record
  (the #2030 work pinned the same gap: lineage deltas carry `cost: null`). So the bank's cost warning
  is the registry's own asset-level overrun applied to the body pick — built to what exists, no broader
  claim. Measured on current main: no library asset scores over the line (max 55 of 753), so in
  practice the warning fires for heavy imports, which is exactly the population ingest's flag exists for.
- **Conflict catalogue — what the code already defines, and nothing else.**
  - *Cost overrun* (above): the one priced conflict in the codebase.
  - *Skeleton vs the shape's points*: `engine/creatureRig.js`'s `buildRig(record)` — head bone iff
    `record.head`; one limb chain per L point; **null iff zero bones**, in which case the tile reaches
    the stage as a bare body mark. Assembling with an all-plain or empty role set produced exactly this
    silently before the bank (org_blob_01's AUTO set is all plain points — a headless, limbless
    creature was the quiet default outcome). The bank derives `skeleton:no-head` (no H point) and
    `skeleton:no-limbs` (no L points) from the picked points, computed the way buildRig reads them.
  - *No value-vs-value gene incompatibility exists at assembly*: the Look and Voice decks are
    independent by law (a named pick is validated against its own deck only; the door's only cross-gene
    law is agreement with the record's own fields). The bank invents none — Look/Voice picks never warn.
- **Role-set naming.** A shape's points exist in exactly two named forms today: the AUTO set
  (`engine/autoAttach.js`'s `autoAttachPoints(svg)`) and the artist's own set (the `assetAttach`
  state entry, where an explicitly EMPTY list is a different fact from no entry). The strand ids name
  those two forms; nothing new was coined.
- **Mutation controls.** None exist in the assembler today (mutation lives in breeding, at the seeded
  ~1-in-8 law, `MUTATION_RATE` in `engine/creatureBreed.js`). The bank adds no mutation control; the
  detent rule is satisfied by the surface it does add (chips + selects only).

## The kept-warning record shape

```json
"kept": [
  { "id": "cost:<bodyId>", "kind": "cost", "cost": { "score": 700, "threshold": 600 } },
  { "id": "skeleton:no-head", "kind": "skeleton", "cost": null },
  { "id": "skeleton:no-limbs", "kind": "skeleton", "cost": null }
]
```

- Written only by `assembleCreature` (new optional `kept` param; the store's `assembleCreature` action
  passes the bank's picks through as an optional third argument — the existing two-argument call, used
  by an e2e spec, is unchanged in behaviour). Breeding never writes it; children never inherit it.
- **The door** (`sanitizeCreatureRecord`) validates it with the ancestry discipline: closed vocabulary
  (unknown kind or id refuses), bounded (`MAX_KEPT_WARNINGS = 8`, a named constant), no duplicates,
  and every entry cross-checked against the record's own facts via the exported `keptWarningHolds` —
  a cost entry must name the record's own body and carry a score genuinely over the registry's line at
  the registry's threshold; a skeleton entry must match the genome it rides (no-head ⇔ head is null;
  no-limbs ⇔ limbs empty). A bred record carrying kept warnings refuses — it was never assembled, a
  lie by shape, same as ancestry-without-lineage. Empty or absent → the field is absent, so a
  warning-free record is byte-identical in shape to every pre-bank record.
- **Honest limit, stated plainly:** the score itself cannot be re-derived at the door — a record
  carries no SVG, and import bodies' scores live in the overlay. The door holds the claim's shape, its
  internal consistency, and the over-the-line fact; the number's provenance is the assembling surface.
- **Hand edits** (`handEditRecord`): after an edit, kept entries are re-held against the edited
  record — an edit that resolves a warned condition (a skeleton replace granting a head, a body
  replace off the expensive shape) retires that warning; the resolving act is itself recorded in the
  edited gene's `hand:` source, so nothing vanishes silently. Untouched entries ride on.
- **Identity:** `kept` is not an ingredient of the record id (pinned in the suite) — it records the
  performer's act, not the creature.
- Persistence round-trips it byte-identical through `serializeProject`; a literal pre-bank record
  (produced by main `c91ab10a`'s own assembler, embedded in the suite) opens and re-saves
  byte-identical.

## Continuous controls

None survived and none were added. The assembler surface after this change contains chips and
`<select>` detents only; DRIVE — the one continuous family the assembler touches — stays dealt, for
the DS reason stated in the catalogue. Nothing required a continuous-control justification.

## Files

- `app/src/components/strandBank.model.mjs` (new) — catalogue + warning derivation + kept projection.
- `app/src/components/strandBank.selfcheck.mjs` (new) — 47 checks; registered in
  `app/selfcheck.manifest` after the lineageTree line.
- `app/src/engine/creatureAssembler.js` — `kept` on `assembleCreature`; `MAX_KEPT_WARNINGS`,
  `keptWarningHolds`, `sanitizeKeptWarnings`; the door validates `kept`; imports
  `COST_WARNING_THRESHOLD` from `assets/ingest.js` (a leaf module — no import cycle).
- `app/src/engine/creatureBreed.js` — `handEditRecord` re-holds kept warnings after an edit.
- `app/src/state/slices/globalSlice.js` — the assemble action passes picks through (optional 3rd arg).
- `app/src/panels/WetLab.jsx` — the ASSEMBLE block rebuilt as the strand bank; record rows show a
  `⚠ kept N` marker (`data-testid="record-kept"`). `data-testid="assemble"` and
  `data-testid="assemble-title"` kept.
- `app/src/engine/creatureAssembler.selfcheck.mjs` — census allowlist +2 (the model and its suite),
  with the #1871 cause comment — the one neighbour-suite edit, the sanctioned pattern from #1870/#2030.

## Verification

- New suite: **47 checks, green 10× in a row.**
- Neighbours unedited and green: creatureAssembler 11 (incl. the stage-reader census), creatureBreed
  10, genomeTimeline 18, lineageTree 18, creatureInjection 13, creatureKin 6, creatureMoods 5,
  creatureRig 10, creatureRole ok, wetLab ok, assetAttach ok, beastSettings 7, foldInCensus 11.
- e2e: the only WetLab-touching specs use `wet-lab`, `assemble-beast`, and the two-argument store
  assemble — all unchanged.
- Full manifest sweep (continue-on-error over `app/selfcheck.manifest`, 617 suites passing): the only
  failures are the three standing sandbox failures — swarmWasm (no cargo/rustc in the sandbox),
  rollSafety (sandbox Chromium/GL), accum (native abort) — base-identical, CI authoritative. Four GL
  suites (accumFeed, composite, canvasSizes, patternRender) failed inside the sweep run under load
  (my own parallel lint runs against the loop's 120 s timeout); re-run solo on this tree they all pass
  at full counts (15 / 15 / 62 incl. browser / 22), so the failure set is the standing set, unchanged.
- `format:check`: clean tree-wide (after `prettier --write` on the two files it first flagged).
- `npm run build`: green — the rebuilt panel compiles into the production bundle.
- Lint: 0 errors; no warnings in any touched file (the 11 standing warnings are in untouched files).
