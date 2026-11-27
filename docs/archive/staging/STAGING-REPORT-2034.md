# STAGING REPORT — #2034 WetLab Big Lab (Direction B)

Branch `feat/wetlab-big-lab-2034`, base = main `dcd4132e`. Built in this worktree only; not pushed, no PR.
Issue title (verbatim): "WetLab Big Lab — bigger window, centered creature stage, icon tool rail (Direction B)".
The issue has no comments. Design source: the issue body + the approved mockup v2 research
(`goals/kinetic-curator-generative-art-instrument/files/research/wetlab-ui-research-2026-11-07.md`).

## What was built, mapped to the issue's acceptance list

- **Shell** — the 620px popup is now a drawer-class sheet, **1180px** wide (96vw cap, 90vh) on the dimmed
  stage (`DrawerOverlay`-class dimensions). Header: bank-count chip left (`4 / 64`), **title centered**
  (`WET LAB` + the asset id under it), ESC right.
- **Icon tool rail** — 60px, left inside edge. Modes on top: **ASSEMBLE / BREED / GENOME / LINEAGE**;
  divider; then the tools **POINT / HEAD / LIMB / AUTO / CLEAR**. Geometric line icons (inline SVG,
  `currentColor`), one-word caps labels, the active mode/tool in the one red. The rail holds tools only —
  no parts palette anywhere in the room.
- **Center column** — shape/attach card on top (the ruled tap editor at 256px: tap cycles
  plain → H → L → gone, exactly the engine's `clickAttach` law, unchanged), **shape-fits row** beneath it
  (BODY/LIMB/HEAD/TEXTURE/ACCENT bars), then the **CREATURE STAGE**: the selected record big and
  dead-center, dealt part thumbnails riding its bones, centered caption (`CR-DC27FC69 · GEN 02 · MA ·
  albers`), with the record's CULTIVATE chip and remove ✕ on the card.
- **Creature stage = the shared component** — the stage renders #1872's `CreatureMiniature.jsx` scaled up
  (size 232). No second creature stage was built; `wetLab.selfcheck` pins the import.
- **Bottom BANK rail** — portrait tiles centered as a group: body thumbnail, id under, GEN chip in the
  corner, kept-warning glyph when a record carries one, selected tile outlined in the one red, and the
  `+ BEAST` tile at the end (it carries the standing `assemble-beast` testid, so beast assembly starts
  from the rail). Clicking a tile puts that record on the stage.
- **Right panel (~380px)** — holds the active mode:
  - ASSEMBLE: the strand bank as four cards (BODY prints the asset id + its `asset:` provenance once;
    POINTS prints the in-use strand id once; LOOK / VOICE cards carry their selects), the warnings in a
    red-bordered **banner** (facts, never blocking — the assemble button reads `ASSEMBLE — KEEP N WARNINGS`
    when warnings stand), full-width assemble button, then the BEAST section (`<BeastSettings />` verbatim,
    signature rows, per-beast cultivate).
  - BREED: three portrait slots (body art for creature/shape picks, kit name for kit picks, `+` when
    empty) with the standing parent/look/voice selects under them, the `3 SOURCES` · `MUTATION 1/8`
    chips, tag/kit filter selects (labels unchanged), a dashed child card that receives the bred child's
    lineage block, full-width breed button.
  - GENOME: gene **tiles grouped by family, each tile printing its value on its face**; the readout bar
    below carries mutate/replace. Explainer paragraph gone.
  - LINEAGE: a **drawn pedigree** — generation rows oldest-on-top, self at the bottom ("this creature"),
    body thumbnails + GEN chips on the tiles, founder stubs as ghost outlines ("not retained"), connector
    lines drawn between the rows (measured SVG overlay), state chips (`LINE COMPLETE` / `FOUNDER · GEN 01`
    / `STUBS N`) with the full sentence on hover, and the selected node's deltas **grouped by source**.
- **Every current job survives** — attach editing, strand assembly, triad breeding, Timeline
  inspect/mutate/replace, Lineage Tree, part preview (it follows the stage's record; the kit chips still
  re-deal it), records management (bank tile selects, stage ✕ removes), beast assembly + settings, and the
  #1872 CULTIVATE step: `record-cultivate` / `creature-cultivate` / `cultivate-run` / `beast-cultivate`
  testids all in place and exercised by the cultivate selfcheck + the drive below.
- **Surface only** — the diff touches `WetLab.jsx`, `GenomeTimeline.jsx`, `LineageTree.jsx`,
  `CreatureCultivate.jsx`, one selfcheck, one e2e spec. No engine, model, door, store, or persistence
  file changed; records stay byte-identical citizens.

## Text audit (the issue's text rule)

Standing instruction prose — rendered text whose job is to explain the room, not report a fact —
counted in the four files before and after:

| Where | Before | After |
| --- | --- | --- |
| WetLab attach help paragraph | 1 element (≤32 words, two variants) | 0 — the teaching survives as hover help on the stage (`title=`) |
| WetLab strand-bank intro paragraph | 1 (62 words) | 0 — the cards print the facts themselves |
| WetLab breed intro paragraph | 1 (30 words) | 0 |
| WetLab footer line | 1 (21 words) | 0 |
| Genome Timeline explainer | 1 (30 words) | 0 |
| Lineage Tree state prose | 4 variants (19–23 words each) | 0 — state chips; full sentence on hover |
| CreatureCultivate prose lines | 3 (18/15/12 words) | 0 — short labels; explanation on hover |
| **Total** | **12 elements, ≈300 words standing** | **0 standing prose elements** |

What remains on the wall is facts from the record and ≤4-word labels. State-driven text (warnings,
refusals, banked/bred notes) is untouched — it reports what just happened; it is not standing prose.

Named duplications, gone:
- **Genome Timeline** printed the selected gene's source twice (words + raw `source asset:…`). The
  readout now prints the source once, in words; the raw source string rides the tile's hover — moved,
  not deleted (KC-1 DS rule 2). Pinned in `wetLab.selfcheck`.
- **Lineage Tree** repeated `assembly · shape org_blob_01` on every gene line (4× in one delta list).
  Deltas are now grouped under one source head per source; crossed genes keep their parents on the line
  (each parent's value differs per gene — that is fact, not duplication).
- **Strand Bank** stated the body asset id three times in one row. The BODY card now prints it once,
  plus its `asset:<id>` provenance once.

## Verification

- **Family selfchecks** (final tree): wetLab, strandBank, cultivate, genomeTimeline, lineageTree,
  beastSettings, assetAttach, creatureAssembler, casingInCss — all pass. Dice-adjacent family
  (wetLab/strandBank/cultivate/genomeTimeline/lineageTree/beastSettings) run **10× each: 60/60 pass**.
- **`wetLab.selfcheck` gained a #2034 section** (same suite, already in the manifest): sheet width 1180,
  rail/stage/bank testids present, the shared-miniature import pinned, the named prose blocks and the
  genome duplication provably absent, lineage grouping present.
- **e2e**: `wetlab-descriptors.spec.js` + `beast-assemble.spec.js` — **4/4 pass** (desktop + phone each).
  One honest re-pin: the breed flow now clicks the rail's BREED mode first (the panel swaps; slots,
  labels, and assertions unchanged). No other e2e or selfcheck pins needed re-pinning — a grep of all of
  `e2e/` and the selfchecks for the old selectors/layout found no other hits.
- **Build/lint/format**: `npm run build` clean; `npm run format:check` — all files pass; `npm run lint` —
  0 errors (11 warnings, all pre-existing in files this build did not touch; none in the touched files).
- **Full manifest sweep (this tree)**: **631 pass / 3 fail** of 634 manifest entries. The 3 failures are
  `swarmWasm`, `rollSafety`, `accum` — the standing sandbox-environment suites, each failing identically
  on pristine main (accum's failure signature is byte-identical in both runs: a node OOM in this sandbox
  after the same passing checks — environment, not code; CI is authoritative for all three).
- **Baseline (pristine main, same sandbox)**: 309 suites run before the tree changed; failures were
  exactly the three standing sandbox-environment suites — `swarmWasm`, `rollSafety`, `accum`. Every
  suite that reads a changed file (strandBank, cultivate, genomeTimeline, lineageTree, beastSettings,
  casingInCss, foldInCensus) passed on the pristine tree.
- **Live drive** (built app, Playwright, seeded bank of 3 + a bred gen-02 child, 0 page errors):
  cleared the blob's points, tapped one point on, promoted it with the rail's HEAD tool — the stage shows
  `1/4 · H 1`, the no-limbs warning stands live in the ASSEMBLE banner, and the button reads
  `ASSEMBLE — KEEP 1 WARNING`. Screenshots in this worktree:
  - `biglab-desktop.png` (1500×950 — ASSEMBLE, live warning in frame, creature stage fully visible)
  - `biglab-lineage.png` (1500×950 — LINEAGE pedigree + grouped deltas)
  - `biglab-phone.png` (390×844 — rail + attach + fits + stage + bank; panel wraps below, no sideways scroll)

## Flagged questions / judgment calls (not guessed silently)

1. **HEAD / LIMB rail-tool semantics are not specified** in the issue or the mockup (only their names and
   place). Interpretation built: each tool press composes the ruled tap gesture — POINT adds a plain
   point at the next AUTO spot; HEAD taps the topmost plain point (→ H, demoting any other H by the
   engine's law); LIMB taps a point until it stands at L. Shape taps remain the primary gesture and reset
   the standing tool to POINT. If Matt wants different tool behavior, this is the one place to rule.
2. **The shape-fits hint** (descriptor-derived guidance, e.g. "fits as a limb — long and thin") moved to
   hover-only on the fits row: it is guidance, not a record fact. The fits numbers themselves stay.
3. **BREED slots keep the standing `<select>` pickers** under the portraits (the research floated
   tap-to-place from the bank rail as an alternative). Selects preserve the kit/shape source kinds a
   tile grid cannot express, and the e2e contract; flagged here as a deliberate reading, not an oversight.

## Honest limits

- The sandbox sweep cannot clear the three standing environment suites (browser/WASM sections);
  CI is authoritative for them.
- On short windows (<~950px tall) the center column scrolls inside the sheet — the stage is fully in
  frame at 950px and above (see the desktop screenshot).
- Screenshots are staged from a seeded session (the e2e's seed), not from Matt's own project.
