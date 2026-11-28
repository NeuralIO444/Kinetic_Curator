# STAGING REPORT — #2551: XGBoost ordering for the stage K deal's creature and construct strata (T2 pattern)

Branch `feat/2551-k-deal-ordering` off origin/main `a29fe851` (the #2545 merge; the stage K deal
itself landed as PR #2558). Built and published under Matt's A/K-push ownership grant
(2026-11-27: "You own the repo. Lets go!") — merge on QA-clean + all-green CI.

## What this implements (issue #2551, verbatim design)

The T2 pattern — the taste tree head ordering candidates within the layout strata of a dice
roll — extended to the stage KINETIC deal's two strata. A tree head per stratum scores the dealt
creature and construct candidates over their own descriptors and orders WITHIN each stratum
only: it never overrides the strata, the mix, or the deal's ruled shape, and it never filters a
candidate out of the deal. A2 earn-in discipline applies in full.

## The honest headline: the gate ships CLOSED

No K-deal head exists yet, and none is fabricated here:

- The stage K deal landed on 2026-11-27 (PR #2558). Matt's keep/cut calls on dealt
  creatures/constructs — the label pipeline the issue names as training data — have had no time
  to accrue, and no taste file carries a `kdeal` section. The earn-in gate additionally requires
  ≥200 labeled rows (below), so no head could lawfully earn in today even if one were trained.
- What ships is the complete rails: the feature universes, the artifact section and its trust
  boundary, the earn-in gate, the scorer contract, and the deal wiring — with the gate closed,
  the deal is byte-identical to the deal that shipped in #2544 (pinned, group 7 of the new
  suite). When a head is trained offline and imported in a taste file, ordering begins only if
  that head earned in. An honest gate-closed landing, per the lane brief, beats a fabricated
  model.

## What was built, file by file in plain terms

- **`app/src/curator/kDealFeatures.mjs` (new)** — the K-deal feature universes, one per stratum,
  declared and versioned (`KDEAL_FEATURES_VERSION = 1`) exactly as `treeFeatureNames` binds the
  recipe universe and `decisionFeatures.mjs` binds the persona one. Creature descriptors: the
  body / Look / Voice / material bindings, skeleton part counts and reach, the four DRIVE genes,
  the cultivation cost read. Construct descriptors: the Canon style, part and vocabulary counts,
  attach-hierarchy depth, rotation and scale spread, composition span and scatter. The extractors
  are the ONE definition both sides of the train/walk boundary use — the offline trainer binds
  its columns to `creatureFeatureNames()` / `constructFeatureNames()` and encodes rows through
  these same functions.
- **`app/src/curator/tasteHead.js`** — the optional `kdeal` section of the taste artifact:
  `{ creature, construct }` entries of `{ version, kind, head, labeledRows, heldOut, trainedAt,
  featuresVersion }`, heads validated by the same tree validator against their stratum's own
  universe. The section follows the personas/voice neutralization law: an unreadable section is
  dropped and the taste stands (additive learning over a working instrument); an absent section
  validates to exactly the taste object that always existed. Earn-in (`kDealHeadEarnedIn`) is the
  one earn-in law restated for this section: **≥200 labeled rows AND held-out Spearman ≥ 0.3**
  (`HEAD_MIN_FIDELITY`); no experimental switch — a below-gate head never orders.
  `makeKDealScorer` / `makeKDealScorers` are the diceScorer-shaped factories (`{ id, score,
  meta }`), returning null per stratum / null whole below the gate.
- **`app/src/state/stageKineticDeal.mjs`** — `resolveStageDeal` takes an optional `orderScorers`.
  With a stratum's scorer present, the landed hand is re-ranked within that stratum: every
  candidate scored, its record stamped with the T2 trio (`xgbScore`, `tasteVersion`, `headKind`
  — the stamp rides the record into the take's birth log; the banks' sanitize doors drop it at
  banking, as they drop every non-record field), ties falling to deal order. Two conservatisms,
  deliberate: creature tiles are still BUILT in deal order (a tile derives from the kin standing
  when its creature lands — only the landed order changes), and constructs are assembled in deal
  order then banked in landed order (assemble-then-bank in deal order is the identical bank
  sequence the interleaved loop ran). With no scorers the function returns the identical value
  it returned before this change.
- **`app/src/state/slices/layoutSlice.js`** — `landStageDeal` builds the scorers per press from
  the loaded taste (`makeKDealScorers(getTaste())`, the useDiceRoll pattern) and hands them in;
  the wrapper's existing fail-closed try covers the whole path.
- **`app/src/curator/kDealOrder.selfcheck.mjs` (new, in the manifest)** — 9 groups: the
  universes and extractor honesty; validation and its bounds (unknown stratum, kind/key
  mismatch, stale universe version, out-of-band held-out, foreign features, over-deep trees —
  each neutralizes the section whole, the taste standing); the earn-in gate at both edges (199
  rows / 0.29 fail; 200 / 0.30 pass, per stratum independently); the scorer contract; the
  byte-identical unordered deal (no scorers AND below-bar scorers); the ordered deal (same
  candidates, same tiles, same bank set — order and stamps follow the head, ties keep deal
  order); and the store path (an imported taste with earned-in fixture heads orders the LOOK
  pass's standing births and stamps them).
- **`app/src/engine/creatureAssembler.selfcheck.mjs`** — one census line: the new suite joins
  the stage-side reader census's allowed list, with the same "a test, not a stage reader"
  note its siblings carry. (The census caught the new file on its first run — the re-pin is
  the census working as designed.)

## What was NOT built, deliberately

- **No trainer, no artifact.** Training is offline (studio/) against Matt's keep/cut labels;
  the corpus does not exist yet (see the headline). When it accrues, the trainer binds to the
  universes declared here and stamps `featuresVersion: 1` — that is a future slice, not a gap
  in this one. The issue's acceptance list is app-side (scorer contract, validation bounds,
  gate behavior, stamps), and all of it is pinned.
- **No citation/explain for K-deal scores.** T3's citable reasons are worded in recipe
  vocabulary; the acceptance for this slice asks for the head kind and score on the records,
  which the stamps carry. A scorer without `explain` is a shape the dice already honor.
- **No census/readout surface.** Nothing in the acceptance asks for one; the stamps on the
  birth log are the standing record of which head ordered which deal.

## Verification

- New suite: 9/9 groups pass. Neighbour suites run firsthand before the sweep: stageKineticDeal
  (10), tasteHead, dice, diceCrowns, personaAdapters (19), queenTiming, voice, census,
  creatureAssembler (11, after the census re-pin), constructAssembler (9), coverage,
  chapterMemory, treeReader, sessionOnly, dealEngines (21) — all green.
- Lint: 0 errors (11 warnings, all pre-existing in untouched files). format:check: clean.
- Full manifest sweep + CI: recorded in the PR body (this report is written before the sweep;
  the PR body carries the final tallies, per the lane's standing practice).
