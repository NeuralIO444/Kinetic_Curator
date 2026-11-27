# STAGING REPORT — Genome Timeline (#1870)

Branch `feat/genome-timeline-1870`, base main `45cbd5d6`. Built against the design spec
(`genome-timeline-spec-2026-11-07.md`); Matt's five rulings are the law throughout. No push, no PR —
this branch is staged for the coordinator's QA pass and Matt's review lane (it is a UI surface).

## Scope as built vs the spec, point by point

1. **Timeline first, no Lineage Tree** — built exactly that. No tree surface, no ancestry rendering;
   a bred record's lineage is shown only as per-gene source text (parent / blend / mutation). The
   Tree's later slice (#2030) is untouched.
2. **Edits IN PLACE** — `handEditRecord` rewrites one gene of the banked record itself: same record id,
   same gene order, no child record, no generation bump, lineage untouched. The edited gene's `source`
   is rewritten to record the hand act (see the marker choice below). Pinned by the suite's
   in-place-identity check.
3. **Full action set** — inspect (readout), mutate, replace, all live in this slice.
4. **One node per gene** — the strip renders every gene on the record in record order, banded by
   family (FORM / LOOK / VOICE / MATERIAL / DRIVE in canonical order; any further families after, in
   first-appearance order). A birth record shows 11 nodes.
5. **Placement** — in the WetLab, attached to the selected creature: each record row gains a `genome`
   toggle; the strip opens under the records list for that record. The strip follows the record in the
   bank, so a hand edit that changes the record's body does not close its own surface.

**The surface** — `src/components/GenomeTimeline.jsx` + pure model `src/components/genomeTimeline.model.mjs`
(the dishLifeChip family pattern: model selfcheckable without the DOM). Nodes are selectable; the readout
shows the gene's value in human-readable form (shape by id, points as coordinates, decks by name, drives
as numbers, material stub as "none — no material yet"), its source in words plus the raw source string,
and the actions. KC-1 DS: discrete facts render TE — plain text, detents, no shimmer. WetLab conventions
followed (chip-btn controls, lowercase JSX with casing in style, session note with `role="status"`).

**One place the tree refined the spec's phrasing:** the spec says the surface attaches to "any record
carrying a genome (assembled creatures and beasts alike; Jansen measures are genes)". In the tree, beasts
are NOT creature records (`engine/beastTile.js`: "A beast is not a creature RECORD (no attach points, no
genome block, no breeding)") — their Jansen measures live in the separate dish genome
(`engine/creatureGenome.js`), not in a banked record, so there is no beast record for a WetLab strip to
attach to. The Timeline therefore covers banked kc-assembled/1 records, and the "measures as genes" case
is covered by the door's extra-gene law: any well-formed gene past the birth eleven (e.g. a MEASURE
family gene) appears in the strip in its own band. The suite pins this with a MEASURE-bearing record.

## The actions

- **Inspect** — the readout. No write.
- **Mutate** — lives in `engine/creatureBreed.js` as an application of that module's own mutation laws
  (not a second mutator elsewhere): a DRIVE gene re-rolls anywhere inside `DRIVE_RANGE` with breeding's
  reroll formula verbatim (r3 over the range off a seeded u01; a candidate equal to the current value is
  re-drawn, bounded at 8 draws, then refused); a discrete gene re-picks a DIFFERENT holder of its family's
  value space — the deck for LOOK/VOICE, the asset pool for the body — the way a breeding swap re-picks
  another parent's different value. Seeded from the record (record id + gene + project seed), so the
  same press on the same record repeats byte for byte. Source becomes `hand:mut`.
  Two deliberate refusals, never clamps: the **skeleton** (head/limbs/joints) — in the standing machinery
  it is ONE linkage group and there is no lawful single-gene mutation for it; it changes whole, by
  replace or by breeding — and **MATERIAL**, a stub with no legal value space yet.
- **Replace** — legal origins only, each validated in the engine: `deck` (LOOK/VOICE, value must resolve
  to the real deck), `pool` (FORM body, value must be an asset the pool holds), `asset` (a skeleton gene
  re-derived from the body shape's own ATTACH points, exactly as `assembleCreature` derives it), `donor`
  (the corresponding gene of another banked record; a record is never its own donor; a body taken from a
  donor must still be a pool shape). A whole stage is refused **by shape** — no origin kind names one.
  Source becomes `hand:look:<id>` / `hand:voice:<id>` / `hand:asset:<id>` / `hand:donor:<recordId>`.

## Laws

- **One door** — every write is whole-record through `sanitizeCreatureRecord`. Mirrored fields move with
  their genes (look/voice/body/head/limbs/joints; a bred record's drive slots move with its drive genes —
  an unbred record's slots keep their birth shape). The store action (`editCreatureGene` in
  `globalSlice.js`) additionally rebuilds the record's pool tile exactly as `bankCreature` builds it and
  refuses the whole edit if the edited creature cannot be drawn — record and tile never disagree. Any
  refusal changes nothing but the session note (`creatureGeneNote`).
- **Recorded acts / persistence** — edits ride the document as `creatureRecords` do: the suite pins a
  serialize round-trip byte for byte and the edited tile passing the overlay door (the load-time
  re-validation). Session notes are never saved, like the assemble/breed notes.
- **No format change** — the genome format is untouched. The only vocabulary change is the source marker
  (below) plus one `lineageAgrees` accounting rule.

## The source-marker choice

No existing source value fits a hand edit, and borrowing one would lie: `mut:<id>` obliges an exact
lineage mutation entry (and `skeletonFounder` walks `parent:`/`mut:` sources), `parent:` claims a
parentage, `asset:`/`look:`/`voice:` claim the birth deal. **Choice: extend the vocabulary minimally with
a `hand:` prefix** in the assembler's source grammar — `hand:mut`, `hand:look:<id>`, `hand:voice:<id>`,
`hand:asset:<id>`, `hand:donor:<recordId>` — the tail rides the grammar's existing character set, so the
door accepts exactly the five shapes the surface can write and refuses the rest. One consequential door
rule, in `lineageAgrees`: a `hand:` gene postdates the birth and owes no birth source; if the birth
recorded a mutation entry for that gene, the hand act supersedes it — the entry is accounted, not
orphaned (the no-orphan check still binds). A hand-edited drive gene still has to agree with its drive
slot. Evidence: the suite hand-mutates the very gene a birth mutation touched on a real bred child and
the door keeps the record whole; a bred record tampered to lie about a parent is still refused.

## Files

- `app/src/engine/creatureAssembler.js` — source grammar gains `hand:`; `lineageAgrees` hand accounting.
- `app/src/engine/creatureBreed.js` — `handMutateValue` + `handEditRecord` (the hand laws, beside the
  breeding laws they extend).
- `app/src/components/genomeTimeline.model.mjs` — NEW: strip model, readout derivation, offered actions.
- `app/src/components/GenomeTimeline.jsx` — NEW: the WetLab surface.
- `app/src/components/genomeTimeline.selfcheck.mjs` — NEW suite (15 checks), one manifest line added.
- `app/src/state/slices/globalSlice.js` — `creatureGeneNote` + the `editCreatureGene` store action.
- `app/src/panels/WetLab.jsx` — the per-record `genome` toggle + the strip mount.
- `app/src/engine/creatureAssembler.selfcheck.mjs` — ONE neighbour-suite edit: the stage-reader allowlist
  gains the three new Timeline files with a #1870 cause comment — the established per-slice pattern
  (#1850/#1851/#1852/#1946/#1947/#1949 precedents). No other neighbour suite edited; no golden or census
  file touched.

## Verification

- New suite: **15/15 checks, run 10×, all green.** Covers the acceptance list: strip order/bands
  incl. extra (MEASURE) genes; readout for assembled, bred and hand-edited genes; mutate legality +
  seeded repeatability + `hand:mut` marking; replace legality (deck/pool/points/donor accepted;
  whole-stage, illegal value, self-donor refused); in-place identity (same id, no child, lineage whole);
  the door refusing a tampered post-edit record; persistence round-trip + tile re-validation; the store
  action end to end (banked in place, refusal byte-identical).
- Neighbours, all green unedited: creatureAssembler 11, creatureBreed 10, creatureInjection 13,
  creatureRig 10, creatureKin 6, creatureMoods 5, creatureRole ok, wetLab ok, beastSettings 7,
  assetAttach ok, foldInCensus 11, audioRoutes OK, midi OK, enabledAssetsRoundTrip 6, fxaa OK,
  overlayRoundtrip OK, renderFault OK, watchdog OK.
- Full manifest sweep (continue-on-error): **619 pass / 3 fail** of 622. The 3 failures are the standing
  sandbox-environment set — swarmWasm, rollSafety, accum — unchanged from base, so no paired base proof
  is owed (CI is authoritative for those).
- `npm run format:check` clean (the three new files were prettier-formatted; no existing file needed
  formatting). `npm run lint`: 0 errors; the 11 warnings are all in pre-existing files, none in files
  this change touches. `npm run build` passes.
- e2e grep: specs reference only the unchanged `wet-lab` testid; no selector re-pins. New testids are
  additive (`record-genome`, `genome-timeline`, `genome-band`, `genome-node`, `gene-readout`,
  `gene-mutate`, `gene-replace-select`, `gene-replace`, `gene-note`).

## Not done (by design)

No Lineage Tree (#2030). No new gene families. No stage-side changes. No breeding changes (the breeder's
behaviour is untouched — the hand laws are new exports in its module). No helpCopy changes (the WetLab
uses literal titles, not the help-copy registry).
