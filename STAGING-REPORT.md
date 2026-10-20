# STAGING REPORT — #1694 slice S2: pool citizenship

Branch `ember/1694-s2-pool-citizenship` on S1 tip `11efdac8`. LOCAL COMMITS ONLY — nothing pushed, no PR, no GitHub writes.

## What was built

The creature families are now citizens of the asset pool: ONE pool entry, `creature`
(category `creature`), standing for both live families — the field-formed moths and the dish
creature — per Matt's rulings on #1694 (Q4: one entry, family as a tile option; Q1: pin-still =
the anchor holds, the animal keeps living; Q2: the creature count sheds FIRST). The count
control itself did not move (that is S3's Q3 work). Robots and L-system growths were not
staged (no stage path exists; out of scope per the brief).

**The citizen record** (`app/src/data/assets/index.js`) is appended to `ASSETS` after the
region bake, so `ASSETS_AUTHORED` — what the bake reads — never sees it and it carries no
regions. Its tile art is the moth body's own pod glyph (`org_pod_02`'s svg). It declares the
tile option `options: [{ key: 'family', choices: ['both','moth','dish'], default: 'both' }]`.
`'creature'` joined `ALL_CATEGORIES`, so the pool panel gets a CREATURE filter chip through
the existing generic chip code.

**The mechanism is generic, end to end — no creature branch in the panel, no creature case
in the store:**

- **Options mechanism (new, generic):** any asset record may declare `options`; the store's
  `cycleAssetOption(assetId, key)` walks the declared choices and REMOVES the key when the
  cycle lands back on the default (the codebase's written-only-when-set discipline, the
  assetKineme pattern); the pool panel renders one cycle chip per declared option for any
  record carrying them (`Events.ASSETS_OPTION_CYCLE` → eventBus/eventRegistry/wireEventBus →
  applyAction → store, wired exactly like the weight cycle; a `.tile-opt` style joins
  pool.css in the still chip's register). State lives in a new document map `assetOptions`,
  sanitized against the records' own declarations (`sanitizeAssetOptions` in
  projectNormalize.js: unknown assets, undeclared keys, out-of-choices values and
  default-valued entries are all dropped), serialized only when non-empty, added to the
  autosave watch list (`projectWatch.mjs` — caught by its suite, see below), and stamped on
  the resolver input by liveLoop beside `assetStill` — recorded in takes, replayed from
  takes (the take format diffs whole inputs; no whitelist to extend).
- **Enable:** the existing `enabledAssets` map. The resolver-side read lives in
  `app/src/curator/creatureCitizen.js`: `enabledAssets['creature'] === false` is the only
  "off" — absence reads ENABLED, because creatures predate the pool switch (the count alone
  governed them), so every pre-slice document, take and the gate fixture reads exactly as it
  behaved when recorded. In `spawnState.observe` the citizen-off folds into the count the
  spawn half sees (0), so the population and its homes clear exactly as dialing the count to
  0 does today, and the spawn half seeks no homes while off; the builders' appends are
  additionally gated in `liveResolve` (both families). The default document's map
  materializes `creature: true` (in `initialEnabledAssets`, shared by the layer snapshots),
  so the tile tells the truth at boot; soloing the citizen leaves it alone on, soloing a mark
  writes it off explicitly, toggle-all includes it — all through the existing generic
  actions, verified against the store in the new suite.
  - *Documented consequence (honest wart):* after loading a document/voice/cast/shape-union
    whose enabled map never mentions the citizen, the tile shows the citizen off while it
    remains enabled-by-absence at the resolver — the same silence the shape-mixer law
    already accepts for its pool. The first tile tap adopts the citizen into the document
    explicitly and the tile tells the truth from then on. Materializing the key inside
    `applyProject` was tried and REVERTED: it broke the deliberate #1062 law ("what the
    document lists IS the set", pinned by `enabledAssetsRoundTrip`), which outranks the
    cosmetic wart.
- **Family:** `creatureFamily(input)` gates the two appends in `liveResolve` — `moth`
  births no dish creature, `dish` births no moths, `both`/absent is exactly today. (A hosted
  pin is the dish creature's alone; moths grow on the other formed pins — the families
  partition by pin, which the new suite's partition check encodes.)
- **Solo:** no new state — `soloAsset` rewrites the map; see Enable.
- **Pin-still (Q1):** `hoverPose` (`app/src/engine/creature.js`) — the one function both
  families read — consults the floor ctx's `stillAssets` set (which `livingMotion` already
  builds from `input.assetStill`): with `'creature'` in the set, the drift terms (dx, dy,
  rot) are zeroed and the breath scale is untouched. The dish creature's head steers to its
  pin (pin + zero offsets) while its body, limbs and band reactions keep living.
  Byte-identical when `assetStill` is empty or lacks the citizen.
- **Resolver pool exclusion:** `liveResolve` excludes the citizen from the placeable pool BY
  ID at the single filter point, BEFORE `assetSig` is computed — so placements, the pool
  signature, transitions and the swarm are untouched, and **no pool-identity pin event
  occurs in the live path at all** (see the strip test below). By id, not category: a user
  duplicate of the citizen sanitizes (via the overlay field whitelist, which carries no
  `options`) into a plain placeable mark — correct, since citizenship belongs to the one
  canon entry. The builders keep receiving the full pool (their part lookups); the atlas
  only ever bakes demanded combos, so the citizen's svg in the loop's svg map is never
  demanded. The stills baker (`studio/render.mjs`) builds its own pool with the same filter
  shape and got the same exclusion — see "Sweep findings" below.

## The weight semantics (defined here, per the brief)

The citizen's pool weight is the existing `assetWeightOverrides['creature']`, read by
`spawnState` from the resolver input and passed to `chooseHomes` (curator/spawn.js) — the
spawn-side analogue of how `buildPlacements` reads the same map for marks:

- **absent / `'medium'`** (the citizen's native weight): the picker's ranking is literally
  the pre-citizenship code path — candidates ranked by squared distance to centre, ties in
  reading order. Byte-identical by construction.
- **`'heavy'`:** within each search stage, qualifying candidates rank by **fertility
  descending**, ties by the centrality order — the citizen claims the strongest ground
  first.
- **`'light'`:** **fertility ascending**, ties by centrality — the citizen takes the
  marginal qualifying ground first.

The bias only re-ranks candidates inside a stage: the qualification bars (fertility +
density, never relaxed), the stage widening, the separation gap, the retry throttle and
the already-standing homes are all untouched, and standing homes are never re-ranked — the
weight speaks only when a NEW home is chosen. Fertility is read through the picker's
`field` only on weighted searches (zero cost when untouched).

**§5 risk (iii) fallback — INVOKED for the dish host, stated plainly:** the weight does NOT
directly bias which formed pin hosts the dish creature. The host rule (first formed pin)
lives in the formation half and is unchanged; weight reaches the host only indirectly,
through the order homes were claimed in (pin order). Inventing a direct host bias would
have meant new machinery in the formation path for a second-order effect; per the plan this
is the defined fallback, not a failure.

## Cost — declarations, measurements, budget

**Registry shape (my call, per the brief):** ONE citizen in the pool, TWO declarations in
`app/src/engine/kernel/costRegistry.mjs` — `creature/moth` and `creature/dish` — appended
as a new marked block ("#1694 S2", the file's append-only convention; the existing tier-0
creature blocks for feather-fan / engraving / glitch are untouched). Declarations are
per-family because the families have different bodies and costs; pool identity stays the
one citizen. **Both are tier 0**, and that is forced by the gate, not chosen for
convenience: `gl/costTiers.selfcheck.mjs` §B requires every non-tier-0 declaration to carry
a committed entry in `gl/effects/measuredCosts.mjs`, which is GPU-sweep-generated
(hand-writing one is forbidden) — and neither family HAS a GPU pass to sweep (their items
ride the structural item pass). Tier 0 is also the file's standing creature doctrine: the
citizen sheds by the governor's count cut, never by the effect-pass ladder.

**Measurements** (the weather way — resolver probe, child process, 300-mark scene,
per-frame median of 600 warm frames, median of 7 runs, this sandbox, 2026-10-19):

| arm | delta vs empty stage |
|---|---|
| 4 moths (4 pins formed, unhosted, limbs 2) | **+1.18 ms** (runs 1.13–1.34) |
| 1 dish creature (1 hosted pin, pressure 1, limbs grown) | **+0.05 ms** (runs 0.02–0.08) |
| full stage (3 moths + dish creature) | +0.88 ms (consistency arm) |

Item counts verified per arm (moth 110 items ×4 = 440; dish creature 16 items). Declared
`timeMs`: moth **1.18**, dish **0.05** — the measured medians, sandbox-labelled in the
registry notes (the standing re-measurement proof is the new `creatureCost` suite).
**Budget:** the allowance got a code home — `CREATURE_FRAME_ALLOWANCE_MS = 2.0` exported
from `app/src/data/quality.js` beside FRAME_BUDGETS (until now the 2.0 ms figure existed
only as prose in that file's budget comment). `app/scripts/costBudgetReport.mjs` gained a
Creatures section reading the declarations from the registry (failing loud if a family
declaration is missing) and judging them by #1639's 80% rule:

| family | declared | share of 2.0 ms allowance | verdict |
|---|---|---|---|
| creature/moth | 1.18 ms | 59% | ok |
| creature/dish | 0.05 ms | 3% | ok |
| combined (conservative sum — the caps cannot co-occur under the 4-pin cap) | 1.23 ms | 62% | ok |

**No family is near the allowance; no near-bust to report** (near-bust would be ≥1.6 ms).
Sandbox CPU numbers — the 2026-10-13 Mac baseline for the same scene was far faster;
re-measure on device via #1578/#1639 before treating the absolute figures as device truth.

## Governor (Q2)

`hooks/governorCuts.js` gained cut **1.5** — kind `creatureCount` — after cut 0 (FXAA) and
the cut-1 pixel-trim steps and BEFORE cut 2 (quality) and every finish below it:
population before finishes; only edge AA and pixel trim precede it because they cost the
picture nothing. One creature per governor step, off a new store overlay `creatureShed`
(perfClampOverride class: render-only, never serialized — the project serializer picks
named fields and never reads it; `applyProject` resets it like `qualityShedFrom`).
`usePerformanceGovernor` subscribes count/shed/setter, passes them into `nextGovernorCut`
and the restore snapshot, applies `setCreatureShed(cut.creatureShed)` on the cut and
`setCreatureShed(0)` on restore. The restore table gained the matching entry between
renderScale and quality — `needsRestore = healthy && shed > 0` — restoring the whole
population in one pass (the table's convention). `liveLoop` stamps
`creatureCount: max(0, artistCount − creatureShed)` on the resolver input, so a take
records the count its frames actually ran with and a shed frame replays shed.
`shedSummary` gained the honest badge line (`creatures −N`). Every pre-existing ladder
walk is unchanged because the rung reads state fields that default to 0 when absent —
states that predate the citizen walk the historical ladder untouched (pinned in the new
suite).

## Byte-identity at rest + proofs

- **creatureGate: GREEN, unmodified, never re-recorded.** The Step-0 fixture (901 frames,
  recorded on pre-repipe code) replays identically with the full S2 implementation in
  place. The fixture's recorded inputs carry no citizen keys, so defaults (enabled, family
  both, unweighted, unstilled) reproduce S1's output exactly — the strongest form of the
  strip test.
- **Strip test, executable form** (in `poolCitizenship`): a creature-bearing scene (4
  formed pins, one hosted) resolved with citizen keys ABSENT vs with the citizen at
  explicit defaults (`creature: true`, `family: 'both'`) produces deep-equal items AND
  deep-equal spawn decisions. The all-era golden (below) is the same proof for the stills
  path: with the citizen correctly excluded, its pinned hash matches byte for byte.
  **No pin or golden embedding pool identity was re-recorded in this slice.**
- Citizen off → zero creature items and zero homes sought. Family partition: with a hosted
  pin + a formed pin, `both` = moth items + dish items exactly; each family alone produces
  only its own.

## New suites (all registered in `app/selfcheck.manifest`)

- `app/src/state/poolCitizenship.selfcheck.mjs` — 14 checks: pool shape; store semantics
  (toggle/solo/all, weight cycle, still, family cycle + sanitizer); document round-trip
  (family rides, shed doesn't, applyProject ends a shed claim); the strip test; citizen-off;
  family partition; weight semantics on `chooseHomes`; pin-still (anchor zeroed, breath
  scale exactly preserved).
- `app/src/engine/kernel/creatureCost.selfcheck.mjs` — declarations present/tier 0/
  positive; allowance verdicts printed (a bust fails); child-process re-measurement of both
  families asserted inside the declared sandbox band; budget-report wiring pinned.
- `app/src/hooks/governorCreatureShed.selfcheck.mjs` — 7 checks: the ruled rung order
  under forced pressure; the historical ladder for pre-citizen states; restore semantics;
  the badge; the store overlay's clamping.

## Pin / census / wiring updates in-slice (all flagged; no behaviour golden re-recorded)

1. `governorCuts.selfcheck.mjs` — the restore-table order census gains `'creatureCount'`
   in its ruled position (§3 item-4 class: the table's contents are the contract being
   extended).
2. `regionBake.selfcheck.mjs` §4 — the pool-contents census: `ASSETS.length` is now
   `ASSETS_AUTHORED.length + 1`, with the citizen asserted explicitly (last entry, no baked
   mattes); every authored-asset invariant in the section is unchanged (§3 item-4 class).
3. `spawn.selfcheck.mjs` — S1's wiring pin for the loop's count stamp re-pointed to the
   stamp's new text (`creatureCount: Math.max(0, (s.creatureCount | 0) − (s.creatureShed | 0))`);
   the behaviour it pins (the loop stamps the count the resolver runs with) is unchanged in
   kind — the stamp now nets the shed. Same class as S1's roomWidth pin re-point.

## Sweep findings (three real gaps the sweep caught, all fixed in-slice)

1. **`allEraGolden`** — the all-era golden renders the FULL catalog through the stills
   baker (`studio/render.mjs`), whose pool filter did not exclude the citizen, so the
   citizen was placed as a mark and the pinned first-render hash moved. The fix completes
   the slice's own semantics in the second resolver (same by-id exclusion at its single
   filter point); the golden then matches byte for byte — **the pin was NOT re-recorded**
   and the §3 STOP did not need to fire. Also noted there: the stills path has never baked
   creatures (no spawn channel) — that predates citizenship and is unchanged by it.
2. **`regionBake`** — the §4 census above.
3. **`projectWatch`** — `assetOptions` was saved but not on the autosave watch list, so a
   family toggle alone would not have woken the autosave. Added; suite green.

## Deviations from the brief's letter (each deliberate, each stated)

1. **Citizen record home:** the brief allowed canon or an overlay-side module ("your
   call"). The record lives in canon (`ASSETS`, appended post-bake) — the alternative
   would have forced special cases into `findAsset`, the sanitizer's known-id set, the
   serializer and the panel's pool merge; in canon, all of that machinery works untouched,
   which is the point of citizenship. One cost: the tile's Wet Lab "edit" button can store
   attach points under the citizen's id that no builder reads by that id — the generic
   tile's uniform behaviour for every asset (most marks' attach points are equally inert
   until a builder reads them); noted here rather than branched around in the panel.
2. **`wholeEnabledAssets` materialization reverted** (see Enable): #1062's set law
   outranks tile cosmetics on legacy documents; absence-means-enabled at the resolver
   carries the behaviour truth.
3. **Weight → dish host:** §5 (iii) fallback invoked (see the weight section).
4. **Cost declarations are tier 0** (see Cost): the §B measured-costs gate makes a higher
   tier impossible without a GPU pass to sweep; tier 0 is also the file's standing
   creature doctrine.

## Verification

- **Full manifest sweep** (the copied method; 483 commands, `swarmWasm` excluded by the
  method itself): 482 run — 477 PASS as recorded, 5 FAIL, each dispositioned:
  `allEraGolden`, `regionBake`, `projectWatch` were real S2 gaps, fixed in-slice and
  re-verified green standalone; `resolverProbe` failed under sweep contention on its
  3 ms timing bound (3.454 ms) and passes standalone (4 creatures 2.63 ms, delta inside
  the bound — verified twice); `rollSafety` is the standing sandbox exception (the headless
  browser died mid-suite — `Target page, context or browser has been closed` — in fx code
  this slice does not touch; proven base-identical on clean main). `swarmWasm` is the other
  standing exception, excluded by the sweep method. Final state: **every suite green except
  the two standing sandbox exceptions.**
- Headline suites re-run after all fixes: creatureGate, replayGate, costTiers,
  governorCuts, poolCitizenship, creatureCost, governorCreatureShed, allEraGolden,
  projectWatch — all PASS. Family suites (spawn, formation, limbs, davisShift, dishPins,
  dishPressure, creature, dishCreature, spawnState, resolverProbe, enabledAssetsRoundTrip,
  exportStill, projectDocument) green.
- Budget report: creature rows render from the registry (verified end-to-end against a
  synthetic dataset: moth 1.18 ms 59% ok · dish 0.05 ms 3% ok · combined 1.23 ms 62% ok).
- Lint: **0 errors / 11 warnings** — the exact baseline.
- Production build: green.
