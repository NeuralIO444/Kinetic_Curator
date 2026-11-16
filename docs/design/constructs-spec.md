# Constructs: new design shapes composed from simple shapes

**Status:** spec only — nothing in this page is built. Drafted 2026-11-15 from issue #2108. The issue's provenance
was a read-only review of `main` at `554fa00` (2026-11-11); every claim below about existing code was verified
against the current tree (`main` at `0750d9a6`) and carries its file:line from that tree. Where this page and the
code disagree, the code wins and this page is the bug.
**Matt's ask (2026-11-11):** "I want the assets to be able to have new design shapes built from the simple shapes."
**Ruled:** §6 — one style per construct (Matt, 2026-11-11, on the issue). The six questions §7 used to carry
were ruled by Matt on 2026-11-15; §7 is now the rulings record, and this spec is build-ready as written.

## 1. What a construct is

A **construct** is a new static design shape composed of **two to four primitives** — existing simple assets —
joined at their ATTACH points and baked to **one atlas tile**. On stage it is an ordinary pool asset: placed,
weighted, soloed, pinned and recorded by the same code as any other tile, so the renderer's per-instance cost is
exactly one tile — one atlas cell (`app/src/gl/atlas.mjs:1-16`; the live bake path is `app/src/gl/liveAtlas.mjs`).

A construct has no head, no limbs, no drives, no rig and no motion of its own. The H and L roles an attach point
can carry are creature grammar (`app/src/engine/assetAttach.js:8-11`); a construct reads plain points only —
where shapes join, nothing more.

How it differs from the two assembled things that already exist:

| | Construct | Creature record (#1849) | Strandbeest (#1863) |
|---|---|---|---|
| Made of | 2–4 primitives, all drawn | ONE body asset; its points become a head and limbs | A linkage: 13 bar measurements and a crank |
| The tile draws | The whole composition | The body alone, at 0.55 of the box — the rest is invisible bones | Bar/joint stamps, re-solved every frame |
| On stage it is | One instance | Many instances: parts are dealt from the stage onto the bones at contract time | A walking body whose geometry *is* its motion |
| Carries | Style, primitives, join points, seed | A genome (FORM / LOOK / VOICE / MATERIAL / DRIVE), drive slots, lineage | Measure genes under the breeding merge law |
| Motion | None of its own | Davis deals the parts, Lois's gait moves them | The crank; if the crank stops, the beast stands |

The creature side of the table: the record kind is `kc-assembled/1`
(`app/src/engine/creatureAssembler.js:31`), `assembleCreature` splits one asset's points into head / limbs /
joints (`app/src/engine/creatureAssembler.js:114-124`), the tile svg wraps only the body at `TILE_BODY_SCALE`
0.55 (`app/src/engine/creatureRig.js:39`, `app/src/engine/creatureRig.js:74-77`) because the bones' parts are
dealt at contract time (`app/src/engine/creatureRig.js:10-14`, expanded at `app/src/gl/sceneContract.js:769`).
The beast's side is the Strandbeest epic spec's §1 (`docs/design/strandbeest-epic-spec-2026-10-29.md`): remove a
beast's body and no motion remains. A construct is the opposite pole — all body, no motion.

**What it reuses:** ATTACH points and their door (`app/src/engine/assetAttach.js`), the seeded channel machinery
(`app/src/engine/kernel/rng.js`), the pool-tile overlay pattern (`creatureTile`,
`app/src/engine/creatureAssembler.js:770`), the atlas bake (`app/src/gl/atlas.mjs`), and the ingest cost score
(`app/src/assets/ingest.js:277`).

**A construct can be a creature's body** (Matt's ruling, 2026-11-15 — §7). A construct tile is an ordinary pool
asset, and the creature assembler takes a basic shape as its body input — so a construct enters creature space
whole: `assembleCreature` reads the construct tile's asset and its ATTACH points exactly as it reads any other
body asset's (`app/src/engine/creatureAssembler.js:114-124`). Nothing in the construct record changes to allow
this; it falls out of the tile being a pool asset like any other.

## 2. How much of the assembler is creature-specific

Read for this section: `app/src/engine/creatureAssembler.js` (822 lines), `app/src/engine/creatureRig.js`,
`app/src/engine/assetAttach.js`, `app/src/engine/creatureTileId.js`. The split:

**Call as-is** — these know nothing about creatures:

| Piece | Where | Why it is neutral |
|---|---|---|
| `sanitizeAttachPoints`, `MAX_ATTACH` = 4, `ATTACH_BOX` = 100 | `assetAttach.js:13-14`, `assetAttach.js:23-40` | Points belong to the asset; a role is optional data on a point, and a construct simply never reads one |
| The shape-derived points | `engine/autoAttach.js`, named at `assetAttach.js:44-46` | Worked out from the shape; the artist's edits win — true for any consumer |
| `hashU01` and the string channels | `kernel/rng.js:244`; string channels at `kernel/rng.js:67-71` | The kernel's seeded-draw machinery, shared by every system |
| `assetCostScore`, `COST_WARNING_THRESHOLD` = 600 | `assets/ingest.js:277-284` | The price of a drawing, whoever drew it |
| The atlas bake | `gl/atlas.mjs:1-16` | It bakes any pool asset's svg into a cell; a construct tile is a pool asset |

**Needs a seam** — new sibling code under the same discipline, never a branch in the creature path:

- **The assembly function.** `assembleCreature` (`creatureAssembler.js:114`) interleaves the generic steps —
  sanitize the points, build the assembly key, deal from the seed, write the record — with creature semantics:
  the H/L/plain split (`creatureAssembler.js:118-124`), the genome birth block, the drive slots. A construct
  assembler is a sibling function sharing the small pieces above; `assembleCreature` gains no flag and no branch.
- **The tile composer.** `creatureTileSvg` (`creatureRig.js:74-77`) wraps ONE body svg at 0.55 scale — the
  scale exists to leave the bones room to reach (`creatureRig.js:39-45`). A construct has no bones: its composer
  wraps N primitive svgs, each transformed to its join, under the same `<g transform>` discipline. New function,
  same shape.
- **The tile id.** `creatureTileId` is `user:cr-<8 hex>` with a matching door regex (`creatureTileId.js:5-7`) —
  creature-shaped on purpose, so the deal filter can recognise a creature tile by id. Constructs take their own
  id shape and their own door test, so every consumer tells them apart deliberately, never by accident.
- **The record door.** `sanitizeCreatureRecord` (`creatureAssembler.js:396`) is the pattern — a dishonest record
  is refused whole, never half-loaded (`creatureAssembler.js:18-20`) — but the function itself cross-checks a
  genome and a lineage. A construct door is its own, smaller function written to the same rule.

**Must not be touched:**

- The genome and its doors: `GENE_FAMILIES` (`creatureAssembler.js:33`), the genome / lineage / ancestry
  sanitizers and the agreement checks that re-derive breeding's arithmetic at load. Saved projects carry bred
  records held to those checks; a construct has no genome and no business near them.
- The rig and the contract seam: `buildRig`, `poseRig`, `dealPart` (`creatureRig.js:90`, `creatureRig.js:312`,
  `creatureRig.js:352`) and `expandCreatureInstances` as called from `gl/sceneContract.js:769` — the one seam
  every render path shares.
- The Strand Bank catalogues on the assembler (`keptWarningHolds`, `sanitizeCultivation` in
  `creatureAssembler.js`): their warning vocabulary is creature skeletons (`skeleton:no-head`). A construct
  warning catalogue, if §5's cost warning is adopted, is its own list.
- The birth constants a saved record is held to — `CREATURE_ASSEMBLY_KIND`, `MAX_CREATURE_RECORDS`, the drive
  ranges (`creatureAssembler.js:31-47`).

## 3. Per-style construction rules

Each Canon style supplies the grammar, taken from its own `assets.note` in `app/src/data/canon/styles.js` — the
note is the asset-side reading of the style, the text `STYLE_RULES` sorts assets by (`styles.js:14-15`;
`STYLE_RULES` lives in `app/src/data/assetStyle.js`). The grammar is read off the note, never invented per build.

**The rule shape.** A construction rule for a style is four things:

| Slot | Meaning |
|---|---|
| Vocabulary | The primitives the note names. Closed: nothing outside it may enter a construct of that style — this is §6's ruling made mechanical |
| Joins | Primitives meet at ATTACH points inside the 0..100 box (`assetAttach.js:7`, `assetAttach.js:14`): each primitive is placed so one of its own points sits on a join point of the composition |
| Count | Two to four primitives (§1). The box discipline agrees: one asset carries at most `MAX_ATTACH` = 4 points (`assetAttach.js:13`) |
| Variation | What the deal may choose: which primitives, at which of their points, in what arrangement — bounded by the style's character |

**Three styles, worked:**

- **Bauhaus** (`styles.js:86`): note — "primary geometry: circle / square / triangle / wedge". Vocabulary:
  { circle, square, triangle, wedge }. A closed geometric vocabulary; a bauhaus construct reads as construction —
  primitives abutting and stacking at their points, nothing scattered, nothing organic admitted.
- **Memphis** (`styles.js:198`): note — "confetti, squiggle, zigzag, star". Vocabulary: { confetti, squiggle,
  zigzag, star }. The note names no container shape and no edge: a memphis construct is an *arrangement* — its
  joins are placements in the box, held by composition rather than by shared edges.
- **Japanese** (`styles.js:100`): note — "ma and asymmetry: sprig, branch, petal, the single ring". Vocabulary:
  { sprig, branch, petal, ring }. A sprig is not a geometric primitive — which settles what "primitive" means in
  this spec: **the style's named simple shapes**, whatever the note names. Character: asymmetry and held empty
  space; a japanese construct may leave most of its box empty, and the emptiness is part of the shape.

**The families slot.** These vocabularies are what would fill `assets.families` — "the asset families the style
claims outright (the slot authored material joins by — #1854)" (`styles.js:14-15`). The state of the tree,
exactly: `families` is `[]` for ten of the eleven styles; the one exception is marks, which claims its own
chapter family (`styles.js:213`, `families: ['marks']`). This build writes the other lists (Matt's ruling,
2026-11-15 — §7): the vocabularies above land as data in `app/src/data/canon/styles.js` as part of the
constructs build; filling the families lists is not left to #1854.

## 4. Determinism

The assembler's rule, which this spec adopts whole: the assembly is pure and deterministic — no clock, no
`Math.random`; the same seed + asset + points assemble the identical record, byte for byte
(`creatureAssembler.js:13-17`).

For constructs: **same seed + style + primitives + join points ⇒ the same record and the same tile, byte for
byte.** The deal key mirrors `assemblyKey` (`creatureAssembler.js:95` — the asset id and its points,
stringified): the construct key is the style id, the ordered primitive ids, and their join points.

The channel: the assembler's deals ride the registered `hierarchy` string channel
(`creatureAssembler.js:14-15`, drawn at `creatureAssembler.js:97-98` via `hashU01`,
`kernel/rng.js:244`). Constructs take their **own channel name** — proposed `construct` — for the kernel's own
reason: channels are isolated streams (`kernel/rng.js:19-25`), string channels are hashed to stable uint32s so
the isolation is real (`kernel/rng.js:67-71`), and a construct deal must never re-key a creature deal that
shares the seed.

The tile is a pure function of the record: composing its svg is string work in the `creatureTileSvg` manner
(`creatureRig.js:74-77`), so baking the same record twice yields the same tile, and a take that names the tile
replays the shape exactly.

## 5. Where it appears

**Ruled (Matt, 2026-11-15 — §7): a construct lives in the project document, and its tile is derived into the
pool** — the creature precedent. The record sits behind a door, the way creature records are kept
(`sanitizeCreatureRecords`, `creatureAssembler.js:711`; saved and loaded at
`state/projectDocument.js:204-205`, `state/projectDocument.js:337`, `state/projectDocument.js:402`), so the
composition — which primitives, joined where — survives and can be re-dealt, edited and re-baked. From the
record, the `creatureTile` pattern derives the pool overlay entry (`creatureAssembler.js:724-732`,
`creatureAssembler.js:770`): the tile is what renders. Two representations to keep honest — the door must
refuse a record whose tile cannot be drawn, the assembler's own rule: no tile without a drawable body
(`creatureAssembler.js:770-772`). The rejected shapes, for the record: pool-only would lose the composition the
moment the tile was drawn — the tile svg would be the only truth — and document-only is not placeable: a
record alone renders nothing, so it collapses into this shape the moment the stage is involved.

**How a construct arrives: the system deal** (Matt's ruling, 2026-11-15 — §7). This build ships the deal
alone: constructs are dealt from the seed, inside the style's §3 grammar, arriving the way creatures do. A
WetLab hand-composition surface — the artist picking primitives and join points by hand — is a possible
successor build, taken only if the dealt constructs earn it; it is not part of this build, and no surface for
it is specified here.

**On stage, a construct is dealt like any other tile** (Matt's ruling, 2026-11-15 — §7): wherever its style is
in play, a construct may be dealt as part of that style's material — it can appear uninvited, with no artist
placement required. This is deliberately not the creature-tile rule, under which nothing reaches the stage the
artist did not choose.

**Cap: 64 constructs per project** (Matt's ruling, 2026-11-15 — §7) — the creature bank's discipline:
`MAX_CREATURE_RECORDS` = 64 records per project, the oldest dropping off (`creatureAssembler.js:35`, applied
at `creatureAssembler.js:721`). The construct bank takes the same number and the same drop-oldest behaviour.

**Cost of the bake** (not an option — the declaration the bake owes). A construct's drawing
is measurable before it is baked: `assetCostScore` counts subpaths × (1 + group depth / 8)
(`assets/ingest.js:277-282`), and the house warning line is `COST_WARNING_THRESHOLD` = 600 (`ingest.js:284`) —
the same line the Strand Bank holds kept warnings to (`creatureAssembler.js:24`). The bake declares its score
when the tile is banked; over the line is a shown warning, never a silent bake. On stage the cost stays one
atlas cell, and unlike a creature tile a construct adds no contract-time instances (contrast
`gl/sceneContract.js:769`). If the bake is ever registered as a kernel step, it also declares a tier in the
cost-tier registry (`engine/kernel/costRegistry.mjs:2-6`).

## 6. Mixing styles — ruled

**Matt's ruling (2026-11-11, on issue #2108): one style per construct.** Each construct takes its primitives
and its construction grammar from a single Canon style.

The manifesto's three-systems mix happens **on the stage, between constructs** — a bauhaus construct and a
memphis construct may stand side by side; neither may borrow the other's vocabulary.

The mechanical consequence: a construct record carries exactly one style id; its door refuses any primitive
outside that style's §3 vocabulary; and the record shape has no second-style field, so the ruling cannot be
half-kept by data.

## 7. Rulings — Matt, 2026-11-15

Asked one at a time, in this order; all six ruled by Matt on 2026-11-15. Nothing in this spec is left open:
§§1–6 are buildable as written.

**Q1. Where does a construct live? — A: in the project document, its tile derived into the pool.**
The composition survives and can be re-dealt and edited; it costs a new record door and a cap (§5).

**Q2. Who composes a construct? — C: both, dealt first.**
The system deal ships alone in this build; the WetLab hand-composition surface is a second build, taken only
if the dealt constructs earn it (§5).

**Q3. May the stage deal a construct on its own? — B: dealt like an ordinary tile wherever its style is in play.**
Constructs can appear uninvited, as part of a style's material (§5).

**Q4. May a construct serve as a creature's body? — A: yes.**
A construct is an asset, and the assembler takes any basic shape — so constructs enter creature space whole (§1).

**Q5. How many constructs may a project keep? — A: 64, the creature bank's cap.**
One discipline for everything the WetLab banks (§5).

**Q6. Does the constructs build write the styles' `assets.families` lists? — A: in this build.**
The grammar lands as data with the assembler, and the families slot stops being empty (§3).
