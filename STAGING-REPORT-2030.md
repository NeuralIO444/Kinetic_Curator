# STAGING REPORT — Lineage Tree (issue 2030)

Branch `feat/lineage-tree-2030`, base current main `9e635c6e`. Local commits only — no push, no PR.
Parent line: creatures (of 1848); split from the Genome Timeline work (1870, shipped).

## Scope vs spec, point by point

1. **Ancestry summary, written at birth — DONE.** `breedCreature` (engine/creatureBreed.js) now builds the
   child's `ancestry` from its three parents before the child record is assembled, through the same
   sanitize door as the rest of the record. The store's breed action calls that engine function directly,
   so every breeding path writes it. Founders and pre-existing records carry no summary.
2. **The door learns the summary — DONE.** `sanitizeCreatureRecord` (engine/creatureAssembler.js)
   validates the summary's shape recursively (see below); any violation refuses the whole record, the
   same posture as every other field. Persistence round-trips byte-identical — serialize and load both
   pass records through the one door, so snapshots carry the summary with no extra work.
3. **Size law — DONE, no truncation.** Growth is pinned by suite: a five-generation chain measures
   exactly 3, 6, 9, 12, 15 entries. One named bound exists, `MAX_ANCESTRY_ENTRIES = 384`, and it is a
   door validation ceiling, not a cut: a document past it refuses whole-record, so no line ever silently
   ends. Nothing is truncated anywhere in this slice.
4. **The tree surface — DONE.** WetLab, on the selected creature, sibling posture to the Timeline: a
   `tree` chip beside the `genome` chip in the records list; the panel mounts below the Timeline and
   follows the record in the bank. Nodes per ancestor grouped by depth (this creature / parents /
   grandparents / depth n), each showing id + derived generation; clicking a node shows its deltas.
   Read-only — no editing from the tree. Ancestry is discrete fact and renders TE (ids, generations,
   plain-word gene classes), per KC-1 DS.
5. **Founder-walk question — DECIDED: leave the walk as-is** (reasoning below).
6. **Out of scope honoured:** no Timeline changes, no new gene families, no breeding-law changes, no
   stage-side work; the family-resemblance shimmer is untouched.

Spec wording refinement: the acceptance text says "both parents summarized" — breeding in this codebase
is a triad (three parents, per the breeding law). All three parents are summarized; behaviour follows
the breeding law, not the wording.

## The summary's exact shape

A new optional field on bred records only:

```
ancestry: [ { id, genes, parents }, … ]
```

- Flat, breadth-ordered list. The head is the child's three parents, in `lineage.parents` order
  (the door checks this deep-equal; a reordered head refuses).
- `genes` — the ancestor's full genome as it stood at the child's birth: one entry per gene,
  `{family, id, value, source}` — the record's own gene shape, nothing else. No rigs, no geometry
  beyond gene values.
- `parents` — that ancestor's own three parent ids, or `[]` for a founder.
- Deeper ancestors are merged in from the parents' own summaries, deduplicated by id — so a birth adds
  at most three NEW entries, however deep the line already runs. Breeding a line back into its own
  ancestor retains that ancestor once (suite-pinned: 7 entries where the parts sum to 12).

**Generations are derived, never stored.** The tree model (components/lineageTree.model.mjs) derives a
generation number per node from the retained graph alone. Where a line runs into ancestors bred before
summaries existed, those ancestors appear as stubs (an id, no genes, generation honestly unknown), and
their descendants' generations read unknown too — the model poisons rather than estimates.

**Frozen at birth.** The summary is deep-copied from the parents at the child's birth, inside
`breedCreature`, with the reasoning stated in a comment at that spot. A parent edited afterwards does
not rewrite a child's retained ancestors; a hand edit to a record never rewrites its own summary. Both
directions are suite-pinned.

**Door law** (all refusals are whole-record): ancestry present without lineage refuses; the list must
hold 3..384 entries; ids unique, well-formed, and never the record's own id; each entry's genes are
1..64, no duplicate family.id per entry, values validated per gene exactly as a live genome's are
(look/voice must resolve, drives in range, points cleaned); each entry's parent list is empty or three
distinct well-formed ids, none its own; the entries must form a DAG (ancestry only points backwards).

## Deltas

`nodeDeltas(record, nodeId)` classifies every gene of a retained node against its retained parents,
from the gene's own source: **inherited** (from the named parent, value compared against the retained
parent — matches is reported), **crossed** (all three parents' retained values listed), **mutated**
(joined to the record's own `lineage.mutations` entry where the node is the record itself; skeleton
genes join the single FORM.skeleton linkage entry), **hand** (a `hand:` source — including edits made
to an ancestor before it bred, visible in its retained genes), **born** (assembly/dealt sources: a
founder's whole genome). The selected creature's own post-birth hand edits show as `hand` on its own
deltas, derived from its current genome's sources against its retained parents — nothing is invented;
where a parent was not retained, the delta names the parent and says its genes were not kept.

## Founder-walk decision

`skeletonFounder`'s walk (which stops at a `hand:donor:` skeleton gene) is **left unchanged**. It feeds
the pool's kin read, which drives the stage's family-resemblance shimmer — extending it would change
stage-visible behaviour, outside this slice's fence, and the walk fails safe: a hand-edited skeleton
simply reads as its own founder. The tree never consults that walk. It reads the retained summary, so
an ancestor whose skeleton gene carries a `hand:donor:` source shows that gene as a hand edit in its
deltas, and the line continues through the entry's own parent ids regardless of gene sources. The tree
invents no founder: every node comes from the record's own data.

## Gait and cost honesty

Both are **absent, as explicit nulls**. `nodeDeltas` returns `shifts: { gait: null, cost: null }`, and
the suite pins that on the creature and on an ancestor. Reasoning: the Jansen solver evaluates linkage
measure sets, and no measure set rides a creature record — measures live on beast tiles, and beasts are
not creature records, so the solver has nothing honest to evaluate on this surface. Likewise no cost
registry prices these records. The spec's gait clause is therefore satisfied by absence, and the tree
estimates nothing.

## Files

- `app/src/engine/creatureBreed.js` — ancestry built at birth in `breedCreature` (frozen-at-birth
  comment at the spot).
- `app/src/engine/creatureAssembler.js` — door validation (`sanitizeAncestry`, `sanitizeSummaryGene`),
  `MAX_ANCESTRY_ENTRIES = 384` export.
- `app/src/components/lineageTree.model.mjs` — NEW. Pure model: `lineageTree` (nodes/edges/generations
  derived from the record alone), `nodeDeltas` (per-gene classification + the null shifts).
- `app/src/components/LineageTree.jsx` — NEW. The WetLab surface (testids `lineage-tree`,
  `lineage-node`, `lineage-deltas`).
- `app/src/panels/WetLab.jsx` — `tree` chip (testid `record-tree`) beside `genome`; panel mount.
- `app/src/components/lineageTree.selfcheck.mjs` — NEW suite; registered in `app/selfcheck.manifest`
  directly after the Genome Timeline suite.
- `app/src/engine/creatureAssembler.selfcheck.mjs` — the ONLY neighbour-suite edit: three lines in the
  stage-reader census allowlist with a cause comment, the same pattern the Timeline slice used.

## Verification

- New suite: **12 checks, green 10×** — birth (three parents summarized, recursively), founder honesty,
  linear growth + dedupe, frozen-at-birth both directions, pre-summary records (stubs, generation
  unknown), hand-computed deltas incl. the skeleton linkage join and a reroll, hand edits on an ancestor
  and on the creature itself, ten door-refusal shapes, byte-identical persistence round-trip, null
  shifts.
- Neighbours, unedited and green: genomeTimeline 18, creatureAssembler 11, creatureBreed 10,
  creatureInjection 13, creatureKin 6, creatureMoods 5, creatureRig 10, creatureRole ok,
  creatureBreeding (curator) OK, wetLab ok, beastSettings 7, assetAttach ok, foldInCensus 11.
- Source-shape sweep: grepped all selfchecks for pins naming every touched file — the census allowlist
  above was the only hit; e2e specs reference only the unchanged `wet-lab` testid.
- Full manifest sweep (continue-on-error): **620/623**. The three failures are the standing
  sandbox-environment set — swarmWasm, rollSafety, accum — unchanged from base; golden and census
  suites all pass inside the sweep.
- `npm run format:check` clean (prettier applied to the four new/touched files that needed it);
  `npm run lint` 0 errors — the 11 warnings are all in pre-existing files, none in this slice's.
