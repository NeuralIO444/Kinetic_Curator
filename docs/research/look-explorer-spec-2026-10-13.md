# KC-1 — The Look Explorer: mining the instrument's unvisited territory

**Status:** Scope spec, ordered by Matt 2026-10-13. Committed to gh as a docs PR (Matt merges). No code is built by this document. Implementation issues filed on Matt's word 2026-10-13: E1a #1504 · E1b #1505 · E2 #1506 · E3 #1507 · E4 #1508 (§8's E1 is filed as E1a+E1b per §12's census expansion). Open question Q1 — repair the dice funnel itself — deliberately NOT filed: Matt's call, on E1a's evidence.
**Parents:** the tasteful dice (`app/src/curator/dice.js`, research/tasteful-dice-2026-10-07.md) · the Curator (#375 line) · recipe features #719 · the keep ledger (#1140 record contract) · adjacent research: `docs/research/dlc-discovery-look-awareness-2026-10-12.md`.
**Trigger:** Matt, 2026-10-13 — "I keep seeing the same thing over and over again. I know we have other assets, but it never gets used. I feel like the random dice isn't fully working." Audit below: he is right, measurably.

---

## §0 Evidence — the dice audit (2026-10-13, origin/main @ 289ed4de)

Method: the repo's own `rollDice` + interim persona scorer (`createPersonaScorer`, id `persona-v1`), real 294-asset library, seeded RNG, Davis silent (wildness 0.5), no crowns. 300 rolls per Davis state for funnel breadth; 600 rolls for the category cut.

- **The library is 294 assets. The dealer is innocent:** 292 of 294 appear among dealt candidates. Casts are dealt from the full pool by role + affinity, and the dealing is broad.
- **The tray is the funnel.** A roll deals 8–16 candidates; the scorer shortlists 3. Across 600 rolls only ~208 assets ever reach the tray. **86 assets never appear once:**

| category | reach the tray | in library |
|---|---|---|
| radial | **0** | 26 |
| crystalline | **0** | 12 |
| Haeckel pack (hae-*) | ~0 | 12 |
| floral | 2 | 15 |
| biosynthetic | 2 | 12 |
| organic | 15 | 20 |
| geometric | 75 | 91 |
| stamps | 42 | 46 |
| linework / dots / fragments / scanlines | all | all |

- **Mechanism:** `persona-v1` awards up to 0.7 of its 1.0 for role coverage (a lead = weight heavy / density solid; texture = density sparse / category dots; accent = linework or glyph/letter/emblem tags), ≤0.3 for category coherence + shared tags, 0.1 for cast size 3–4. A cast whose assets don't complete the role trio is structurally capped below any full-coverage cast, so whole families — radial, crystalline, Haeckel, most florals and biosynthetics — cannot win a top-3 slot no matter how they're dealt. The top 15 assets take ~21% of all finalist slots.
- **The frozen axes.** A crown changes exactly two things: layout (MODE_LOAD) and cast (DICE_CAST). **Palette never changes** — deliberately: `taste.js` excludes palette features because "Palette is NOT randomized by the Curator." The parameter weather doesn't roll with the dice either (CURATE re-rolls its 18 keys as a separate act, on the current cast/layout/palette). So the two axes that most define what a look *feels* like — color story and motion character — stay fixed while marks rotate among the scorer's ~200 favorites. Sameness is the designed outcome of the current composition of parts, each of which is individually honest.
- **Layouts are not the problem:** finalists span all ~15 modes roughly evenly.

Conclusion: nothing here is a bug in the dice. The dice does its documented job. The instrument simply has no organ whose job is *coverage* — going to the territory the taste funnel filters out. This spec builds that organ.

## §1 Thesis

**The explorer mines; the dice performs.** The dice stays what it is — a performance-time proposer whose taste funnel is a feature on stage. The explorer is the offline counterpart: it samples the instrument's *whole* composition space with **no scorer between sampling and rendering**, renders the samples as stills through the bake path, measures how *different* each result is from what Matt already keeps and from its siblings, and returns the far country as candidate Looks. Judgment moves from metadata (what the scorer guesses about assets) to renders (what a composition actually looks like) — and the final judgment stays where the doctrine puts it: Matt crowns, the ledger learns.

This is the governor thesis applied to discovery: the Mac Studio does the heavy thinking offline (thousands of bakes), the live instrument receives cheap artifacts (candidate Looks in the existing keep-record shape). Nothing in the live render path changes.

## §2 Substrate — what already exists (do not rebuild)

- **The dealer** (`curator/dice.js`): `dealCast` deals role-structured casts from the full pool; reused by the sampler with the funnel bypassed — candidates render *before* any scoring.
- **Recipe features** (`curator/recipeFeatures.js`, #719, FEATURES_VERSION 3): one pure function naming a composition's choices (categorical buckets + `recipeNumerics`, the continuous keys normalized 0–1), computed identically for keeps and passes so both sides of the ledger agree. This is the distance substrate — novelty is measured in this space first.
- **Render profiles** (`curator/renderProfiles.js`): 10 persona profiles (Davis, Karl Benjamin, Casey Reas, Ernst Haeckel + six), each a palette + generation biases + forces, all honest subsets of the real parameter ranges. These are the explorer's *prospecting corners* — biased subspaces with a named author.
- **The bake path** (kernel/bake; the studio pass pipeline already renders headless stills — `render.mjs --emit-normalized`): stills equal live by law, so a mined still is an honest promise of the live look.
- **The keep record** (#1140 contract): `{ seed, seedOffsets, timestamp, context, config: { layout, palette: {id}, assets } }`. A crowned mined candidate lands in exactly this shape (plus provenance, §5) — the trainer and the sequencer never learn a second dialect.
- **Palettes** (`data/palettes.js`): the full catalog becomes a sampled axis for mining — the axis the Curator deliberately never rolls becomes the explorer's home ground. (Mining a palette ≠ randomizing it live; §7 honesty law covers the distinction.)
- **Favorites surfaces** (`FavoritesTray.jsx`, `panels/davis/FavoritesList.jsx`, docs/FAVORITES_SEQUENCER.md): where kept looks already live and get sequenced.

## §3 The mining loop

1. **Sample.** Stratified draws across the axes, seeded and reproducible:
   - *Layout:* uniform across all modes (the dice's one healthy axis — keep it).
   - *Cast:* dealt by `dealCast` directly — no shortlist — with a **coverage quota**: every category gets dealt its share, including the tray-invisible families (radial, crystalline, Haeckel, floral, biosynthetic). Quotas are how the invisible third is guaranteed passage, not hoped for.
   - *Palette:* uniform across the catalog, plus persona-profile palettes at their corners.
   - *Parameter weather:* `randomizeKey` across the randomizable keys (seeded stream, CURATE's own precedent), widened where `renderProfiles` biases define a persona's corner.
   - *Strata / FX / dish:* composition axes sampled at the same stride — stratum roster shapes, FX selection, and (once the petri lane closes) the dish knobs; the queued formation×knob dish sweep is this sampler's dish module, not a separate tool.
2. **Bake.** Each sample renders a still through the bake path at a fixed step count. A sample that cannot bake is discarded and logged — never repaired into existence.
3. **Measure.** Each render gets (a) its recipe-feature vector, (b) cheap render statistics (ink coverage, palette-histogram in the render's own palette, luminance spread). Novelty score = distance in feature space **from the keeps corpus** (what Matt already has) — the primary axis — with pairwise distance inside the batch as the secondary axis.
4. **Select.** Farthest-point selection over the batch: pick the candidate most distant from the keeps, then iteratively the candidate most distant from everything already picked. Output is a *spread*, not a ranking — the tray shows territory, not a leaderboard.
5. **Present.** A candidate tray (surface: open question Q2) showing stills, each tagged with its provenance (which corner/axis produced it, in plain words: "radial cast · hydra palette · Reas corner").
6. **Crown or pass.** Crowning writes the standard keep record. Passing is also recorded (§6) — a pass on a *rendered* candidate is the highest-quality negative signal the taste model has ever been offered; today its passes are metadata guesses.

## §4 The voices

The trio's job changes venue, not nature:

- **Davis** prospects: his render profile defines one corner; his wildness state (the existing `wildnessForDavis`) sets the sampler's spread for a run — UGLY runs go wider, FLOW runs stay near the keeps.
- **LOIS** judges *renders*: mined finalists get the persona verdicts against the still, not the metadata. His scorer keeps its job at the performance dice; at the explorer he is a critic with eyes.
- **The Queen** sways as ever — toward kept taste — now over candidates that include territory her ledger has never seen. Her sway lines don't change; her evidence does.
- Persona profiles beyond the trio (Benjamin, Reas, Haeckel, …) are prospecting corners in rotation: a run can be "tonight we mine the Haeckel corner against palettes he's never worn."

## §5 Provenance and the record

- Every mined candidate carries `provenance: { source: 'explorer', run: <runId>, corner: <profileId|'wilderness'>, axes: {...} }` alongside the standard keep shape. Provenance is telemetry-honest: mined ≠ rolled ≠ hand-built, forever distinguishable in the ledger.
- A run is a seeded artifact: `(runSeed, samplerConfig)` reproduces the batch exactly (determinism law, same as bakes and takes).
- Nothing auto-saves. The explorer proposes into the tray; only a crown writes a keep. The 16-Look scarcity is untouched — the explorer increases the *quality of what competes* for the slots, never the slots.

## §6 Coverage — sameness becomes a metric

The audit in §0 becomes a standing selfcheck (the **coverage report**):

- Tray coverage: over N seeded rolls, % of the library reaching the tray, per category, with a floor alarm (any category at 0 across the run is a reported fact, not a vibe).
- Keeps coverage: the same cut over the keep ledger — which categories/palettes/layouts Matt's *kept* world actually spans.
- Explorer yield: % of mined finalists crowned or passed, by corner — which prospectors find gold, which find gravel.

Reported per run, trended across runs. The point is not to gamify variety; it's that "I keep seeing the same thing" should never again be discoverable only by feel.

## §7 Laws (inherited, binding)

- **Determinism:** seeded streams everywhere; a candidate is a pure function of (seed, config). No `Math.random` in the sampler (CURATE's seeded-stream precedent, #518).
- **Stills equal live:** mining renders only through the bake path. No explorer-only rendering tricks — a mined look that can't happen live is a lie and is discarded at the bake step.
- **Taste learns from kept renders only:** unchanged. Mined candidates are *not* training data until crowned; passes on mined renders may be recorded as passes (they are judgments on renders, the ledger's own standard).
- **Honest signals:** provenance always shown; the tray never presents a mined candidate as a dice roll or a hand-built look. Palette honesty: mining samples palettes offline — the live Curator still never randomizes palette; the two facts coexist because the surfaces are labeled.
- **Offline weight, live lightness:** mining runs are batch jobs (overnight-scale budgets are a feature — §8 Q3), never in the render loop, never on the iPad's budget. The live instrument receives only crowned artifacts.
- **One-writer / one-PR-per-stage:** as the repo's standing rules; each stage below is its own issue and PR in Matt's review lane.

## §8 Stages

**Stage E1 — Coverage report (evidence first).** Codify §0 as a selfcheck + a small report surface (dev-panel or CLI output): tray coverage and keeps coverage, per category/palette/layout, reproducing tonight's numbers on demand.
*Acceptance:* the report reproduces the audit (86 never-tray assets ± sampling noise; radial/crystalline at 0) · runs headless in the manifest · no behavior change anywhere.

**Stage E2 — The miner (headless).** Sampler (stratified, quota'd, seeded) + bake batch + feature/render statistics + farthest-point selection. Output: a run folder — stills + candidate records in keep shape + the run's coverage/yield report. No UI yet.
*Acceptance:* a seeded run of agreed size returns its batch reproducibly · finalists include tray-invisible categories by construction (quota proof in the report) · every finalist's still is a bake (parity spot-checks: re-render 3 finalists live, stills match) · pairwise spread of finalists exceeds the dice tray's spread on the same axes by a measured margin.

**Stage E3 — The candidate tray.** Mined finalists presented for crowning (surface per Q2); crown → keep ledger in the standard record + provenance; pass → recorded pass. Dice tray and explorer tray remain honestly labeled as different sources.
*Acceptance:* crown a mined radial/Haeckel look end-to-end and recall it from Favorites identically to a hand-built keep · pass records land in the ledger with provenance · nothing about the performance dice changes.

**Stage E4 — Persona prospecting + judging.** Render-profile corners in the sampler rotation; Davis wildness steering run spread; LOIS verdicts on mined renders wired to the pass/keep ledger.
*Acceptance:* a "Haeckel corner" run's finalists are provably profile-biased (feature-space centroid inside the profile's ranges) · LOIS passes on renders appear in the ledger · Queen sway surfaces unchanged in form, new in evidence.

## §9 Non-goals

Training or retuning the MLX taste head (the explorer feeds the existing ledger; what learns from it is the existing roadmap's business) · repairing the dice funnel (Q1 — a separate decision; the explorer routes around the funnel, it does not move it) · auto-crowning or auto-saving anything · a preset library (candidates are compositions in the keep shape, not a new content type) · any live-path rendering cost · a new panel by default (Q2).

## §10 Risks

- **Bake throughput** bounds run size: measure in E2 before promising overnight batch counts (the studio pipeline's stills rate is the budget's denominator).
- **Feature distance ≠ perceived novelty.** Recipe features name choices, not looks; render statistics help, but the sieve is a sieve — Matt's crown is the actual instrument. If finalists measure distant and look samey, the *statistics* are what get extended, never the claims.
- **Combinatorial theater:** a sampler that produces a million distant-but-dead candidates has built a warehouse with better lighting. Yield (§6) is the guard metric; a corner with zero crowns across runs gets retired, not widened.
- **Scope gravity toward the dice:** every conversation about the explorer will try to become a conversation about fixing the scorer. The funnel may well deserve repair — as its own issue, with its own evidence (E1 supplies it), not as scope smuggled into E2–E4.

## §11 Open questions for Matt

1. **Repair the funnel too?** The scorer's role-coverage cap structurally excludes whole families from the performance tray. Options: leave the dice as-is (funnel = stage taste; explorer = coverage organ) — *recommended for now, E1's report keeps the evidence current*; or file a separate scorer-repair issue (e.g., category-coverage term in `persona-v1`'s successor) on its own evidence.
2. **Surface:** mined candidates in an extended dice tray, or their own curation view beside Favorites? (Recommendation: their own view — different provenance, different rhythm: the dice is performance-tempo, mining is morning-after curation.)
3. **Run budget:** candidates per run and cadence — a nightly batch of a few hundred bakes, or on-demand runs you trigger? (Recommendation: on-demand first, nightly once yield proves out; bake throughput measured in E2 sets the number.)
4. **Novelty target:** distance from your *keeps* (recommended primary), distance from the *tray's habits*, or both shown as two axes on the tray?
5. **Passes on mined renders:** record them in the ledger as training signal (recommended — they're your realest negatives), or discard silently to keep the ledger purely hand-earned?

## §12 The reachability program (added 2026-10-13 — Matt: "test the reachability of everything in the instrument")

The dice is one door. Every door gets audited, in two families — **reachability** (can it be reached at all?) and **presentation** (when reached, is it shown honestly and well?). Each audit is a seeded, headless measurement in the §0 style; findings file as their own evidence, never as vibes.

### Reachability

- **RA1 — Dice tray coverage.** §0/§6; codified in E1.
- **RA2 — Every random door, distribution honesty.** CURATE's `randomizeUnlocked` over many seeded rolls: each of the 18 randomizable keys' rolled distribution vs its declared range (a key that never reaches its top quartile is a soft funnel). Evolve/morph: a morph between two keeps traverses the full span between their values. REFINE mutate: stays inside its locked spread (already selfchecked — the census confirms, doesn't rebuild).
- **RA3 — The parameter census.** ~88 PARAM_SPEC keys; only 18 are ever rolled by any path. The rest are hand-only **by design** (behave* steering weights, modifiers, composition — "never randomized/morphed" is doctrine in `layout-modes.js`, not neglect). The census tests the hand path: every key, set min→max through the same param pipeline the UI writes through, must produce its claimed effect (recipe-feature / render delta). A key that moves nothing is a **dead knob**. The queued dish formation×knob sweep is this census's dish neighborhood; RA3 generalizes it to the whole instrument.
- **RA4 — Manual reachability census.** Every asset selectable in the ASSETS panel, every palette applicable, every layout mode loadable, every stratum type and FX module enable-able — a store-level sweep applying each through the same actions the UI dispatches (the census), with e2e spot-checks at the surface (a sample per pack/mode).
- **RA5 — Render reachability.** Every asset bakes to a non-blank still (ink coverage > 0) in at least one standard layout: *dealt ≠ drawn* — an asset with broken path data or a missing matte sits in the library and is invisible in the only way that matters. Same census for palettes (each produces a measurably distinct still; two identical palettes means one is unwired) and layout modes (distinct arrangement signatures).
- **RA6 — Persistence reachability.** Keep → save → reload → recall round-trip per axis, on the #1140 record (incl. seedOffsets). A look that recalls differently was never really reached.

### Presentation

- **PA1 — Tray distinctness. MEASURED 2026-10-13: PASSES.** Across 600 seeded trios: mean pairwise cast overlap 1.7%; a pair sharing ≥50% of a cast in 0.3% of trios; all-three-same-layout in 0.3%. The tray's choice is real choice — inside its borders. Codified as a standing check so it stays true.
- **PA2 — Tray honesty + stills.** Finalists labeled by source (the existing "curator untrained · dice roll" honesty; explorer provenance per §5), and every finalist's tray still actually renders (depends on RA5 — no blank finalists).
- **PA3 — Crown integrity.** The crowned finalist, applied to a fresh state, reproduces the tray still exactly (bake equality). No bait-and-switch between preview and stage.
- **PA4 — Stillness presentation.** Under reduced motion, presented stills remain representative of the look — the stillness law applied to the tray, not just the stage.
- **PA5 — Panel browsability.** A human can actually browse the ASSETS panel to every pack (tiles, categories, the STILL/DUP affordances of #1128). RA4's human-side twin; e2e sample per pack.

**Sequencing:** RA2/RA3/RA5/RA6 and PA1–PA3 fold into E1 — the evidence stage grows from a coverage report into the **reachability census**. RA4/PA5 ride E3 (the surface stage). None of it delays E2's miner.

## Lois pass

- The dice isn't broken; it's *obedient* — it shows the boss what the boss's last heuristic already liked. That's not a dice, it's a mirror with a shuffle animation.
- A third of the art in the building has never been on stage. Radial: zero. Haeckel — the man's own north star — zero. You don't have a variety problem, you have a *casting director* problem.
- Mine renders, not metadata. A score computed from tags is an opinion about a spreadsheet; a still is the thing itself.
- Scarcity stays: sixteen slots, a thousand suitors. The explorer's job is to make the suitors worth rejecting.
