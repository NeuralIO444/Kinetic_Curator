# STAGING REPORT — Phase 2 S3: feather fans

Branch `ember/skeleton-s3` on base `d8009ee9` (S1 publish tip). LOCAL ONLY — no push, no PR.
Contract: the S3 brief + `skeleton-creature-plan-2026-10-16.md` §S3 + addendum; S1 report for the skeleton's terms.

## Recovered-build note

This slice was **recovered**: two previous S3 builders died in runtime restarts (a third restart
hit during this recovery, plus a `/tmp` wipe — see Verification). The recovered tree held the full
implementation uncommitted: new `engine/featherFan.js` + `featherFan.selfcheck.mjs`; modified
`engine/creature.js`, `engine/creature.selfcheck.mjs`, `engine/skeleton.selfcheck.mjs`,
`engine/kernel/costRegistry.mjs`, `app/selfcheck.manifest`. (The STAGING-REPORT.md in the tree was
S1's, carried by the base commits — there was no S3 draft; this report replaces it.)

Audit outcome: the implementation was sound and complete in design. I kept it, with **two fixes**:

1. **The fan counts were outside the plan's envelope, and the draft selfcheck's claim overstated
   them.** Measured off the real layouts, the recovered counts (fore 20 rooted, hind 16 rooted over
   3-bone chains) distribute fore 8/7/5 and hind 7/5/4 per bone — the tip bones under the brief's
   6-per-bone floor — while the selfcheck's comment claimed "between 6 and 20" and its assert only
   checked 2–20 via a length-proportion approximation. Fix: `FAN_COUNTS` raised (fore feather
   18→22, hind feather 14→20), and the selfcheck now counts roots per bone off the **actual layout**
   and asserts the brief's 6–20 envelope. Measured on the fixture moth: **fore 10/8/6, hind 9/7/6**
   per bone. 
2. **The right wing's fan was laid out twice per creature per frame** — once for the right wing,
   once again inside the left wing's mirror. `createFanScatter.layoutFor` now caches the right
   layout under its own anchor and shares it; outputs identical (the layout is pure), work halved.
   Effect on the resolver probe below.

Everything else in the recovered tree verified as claimed and was kept unchanged in substance.

## What shipped

- **`engine/featherFan.js`** (new) — the fan layout. The part pool is data: feather/plate/leaf/chevron
  naming existing build-time atlas assets (`org_petal_02` / `org_pod_01` / `org_petal_01` /
  `geo_chev_01`) with drawing constants — Davis procedural parts first, no runtime-built geometry, a
  hand-drawn SVG can replace a pool entry one-for-one later. `wingLocalChain()` expresses a skeleton
  chain in the wing's own local frame through the wing's anchor (the chain's root lands exactly on
  the wing's root attach offset, asserted to 1e-6). `fanPlacements()` grows parts along the chain:
  rooted parts distributed over the bones in proportion to bone length, root-short → tip-long
  (length profile 0.55 → 1.5), each part 2.3× its root spacing (root-to-tip overlap), angled to the
  segment's local direction with a seeded ±2° jitter and a 10° fan splay; one plate at the root, one
  leaf at the tip, feathers between; chevron ornaments pinned to the interior joints and tip.
  Layouts are pure functions of (seed, creatureId, chain) on the kernel `'skeleton'` RNG channel —
  the same stream the bones grow from — and hashable (`fanHash`, FNV-1a over 1e-4-quantised
  placements). `mirrorPlacements()` mirrors a layout across the wing axis (with the chevron's
  half-turn correction for its +x axis convention).
- **`engine/creature.js`** — the scatter is *gone*: `mothScatter` and the Poisson import deleted.
  The hierarchy's surface children are now the fan: one child per part kind per wing, counts from
  `FAN_COUNTS` (fore wing 26 parts, hind wing 24). Each wing's layout is computed once on the RIGHT
  chain and mirrored onto the left — the skeleton's mirror is bit-exact, so the left fan lies on the
  left bones exactly (the selfcheck proves the two routes agree to 1e-6). The skeleton is now built
  whenever a moth is formed (the fan is its always-on consumer, the one S1 anticipated);
  `lastSkeletons()` **publication stays gated on `input.wantSkeletons` exactly as S1 left it**.
  Halos now key on the surface-anchor *role* instead of the old mark asset id — plumage gets no halo,
  body and wings keep theirs. Fan colours: feather/plate/leaf take the wing's pairing; chevrons take
  the old scales' ink+vivid pairing so the joints read.
- **`engine/kernel/costRegistry.mjs`** — one append-only block at EOF under a marked header (the
  parallel-slice convention): `engine/creature-feather-fan`, tier 0, `timeMs: 0`, `memoryBytes: 0` —
  honest zeros: the fan adds no GPU pass, shader or FBO; its parts are instanced sprites inside the
  existing structural item pass. Validated by `gl/costTiers.selfcheck` (PASS).
- **Selfchecks** — `featherFan.selfcheck.mjs` (new, registered in `app/selfcheck.manifest` after
  skeleton.selfcheck): pool/count envelope measured off real layouts, chain-frame exactness,
  determinism + hash key sensitivity, fan rules (roots on the bones to 1e-5, root-short→tip-long,
  overlap, joint-pinned ornaments), mirror agreement, builder wiring (counts, stable keys, replay
  determinism), cost registration, determinism guard. `creature.selfcheck` and
  `skeleton.selfcheck` count assertions moved from the scatter formula to `FAN_COUNTS`-derived
  counts (justified below).

## Scatter → fan replacement evidence

- `grep` over `app/src`: no `mothScatter`, `marksPerWing`, `marksPerHind`, `markScale`,
  `markBounds` or `MOTH_PARTS.mark` references remain; `poissonPointSet` survives only in its own
  module's other consumers (colonize, voronoi) — untouched. `geo_diamond_01` (the old scale asset)
  no longer appears in any creature path.
- Drawn moth, one pair: **26 items → 58** (3 halos + body + 2 wings + 2×26 fan parts). Two pairs:
  **42 → 110**. At the 4-creature cap, worst case ≈ 440 items — well inside `HIER_GLOBAL_BUDGET`
  (2000), so the budget never truncates a fan in practice.
- The creature's replay contract holds: `performanceCreatures.selfcheck` (#1355/#1356 recorded-take
  replay) passes; `creature.selfcheck` proves same-input-same-moth and left-fan = right-fan mirrored
  in world space.

## Golden / count changes — justification

The only re-pinned expectations are **item counts derived from the plumage itself**
(`creature.selfcheck`'s `MOTH_MARKS` → `FAN_COUNTS`-derived totals; `skeleton.selfcheck`'s two
"26 items" assertions → the same formula, 50 → now 58 with the count fix). The cause is the slice
itself — the scatter (10 + 6 scales per wing) is replaced by the fan (26 + 24 parts per wing) —
documented here, not a weakening: every structural assertion around the counts (halos = 3/5,
mirror equality, key uniqueness, colour rules) is unchanged or strengthened. **S1's skeleton
goldens are untouched**: bone hashes `6f161576` (fixture) and `7944cd55` (builder moth) still
assert and pass — the skeleton the fan grows on is byte-identical to S1's.
Fan layout hashes (seed 77, creature `m0`, final counts): fore **`68ed368a`**, hind **`9951bbaa`**
— asserted deterministic across builds in the suite (not pinned as literals; the determinism +
key-sensitivity asserts are the contract).

## Cost evidence (sandbox numbers are indicative only — labelled as such)

- **GPU vs the 2.0 ms budget: zero added.** No pass, shader or FBO; plumage rides the existing
  item pass. The registry declaration says exactly that.
- **CPU, the fan's real cost.** Isolated micro-bench (this sandbox): skeleton build + both fan
  layouts + mirrors for 4 two-pair creatures = **2.04 ms per resolver frame** (~0.5 ms per
  creature) of pure arithmetic. End-to-end, `gl/resolverProbe` (4 formed creatures) in this
  sandbox: base `d8009ee9` measured **5.122 ms** and **10.908 ms** across runs — it *fails its own
  5 ms budget on the pristine base here*; the S3 tree measured **18.845 ms** in a peak-contention
  window before the layout-sharing fix and **5.762 ms** after it, in the same range the base
  swings through; one run SKIPped (child-process spawn timeout under load). The probe's own
  header calibrates it on Apple silicon (0.2 ms no-creature, +0.03–0.1 ms per creature); the
  sandbox inflates CPU timings by an order of magnitude and three sibling builders were sweeping
  concurrently (load average peaked ~15). Verdict: the fan's CPU cost is real but small, the
  probe's budget verdict belongs to CI's Mac runner, and no S3-specific regression is visible in
  paired measurement. The remaining probe exposure is item throughput: the resolver now walks
  2.6× the creature items — that is the plumage itself, the slice's purpose.
- The skeleton-always-built change (fan as consumer) is included in those numbers: there is no
  longer a zero-skeleton-cost mode for a *formed moth*, because the plumage needs the bones.
  Unformed pins still build nothing.

## Verification

- Family suites (run repeatedly, incl. after the final restart): `featherFan` OK ·
  `creature` ok · `skeleton` OK (S1 goldens intact) · `performanceCreatures` ok ·
  `hierarchy` ok · `mathRandomGuard` OK (15 files / 25 sites — unchanged; no new `Math.random`) ·
  `kernel/rng` OK · `gl/costTiers` PASS.
- **Full manifest sweep: all 448 commands run** (two passes; the stock runner stops at first
  failure, so a run-all collector was used). **424 suites passed clean in the sweep.** The other
  24 are all resolved, none caused by S3:
  - *Sanctioned sandbox exceptions (3):* `kernel/bake/swarmWasm` FAIL (cargo absent),
    `fx/rollSafety` non-completion (CI authoritative), `gl/accum` FAIL exit 137 (V8 heap OOM).
  - *Base-identical failures (6)* — same assertion on pristine `d8009ee9` in this sandbox:
    `gl/parity` ("should report GL parity result"), `gl/debug` (Playwright `page.goto` 30 s
    timeout), `gl/resolverProbe` / `gl/vortex` / `gl/livingMotion` / `loot/lootScan` (millisecond
    budget assertions the loaded sandbox CPU cannot meet on any tree — base numbers: probe
    5.1/10.9 ms vs 5 budget; vortex step 5.333 ms; livingMotion floor 2.24 vs 2 ms; lootScan
    235 ms vs 200 budget).
  - *Base-identical timeouts (6)* — rc=124 at a 300 s cap on the base tree too: `gl/composite`,
    `gl/canvasSizes`, `gl/exportStill`, `gl/phase6`, `assets/regionBake`, `pattern/patternRender`.
  - *Contention timeouts that pass standalone (9)* — PASS on the S3 tree in paired standalone
    reruns (base also PASS unless noted): `gl/cellKinemePlayback`, `curator/census`,
    `curator/miner`, `curator/prospecting`, `curator/variants`, `pattern/rasterFast`,
    `pattern/elements`, `gl/regionLines` (20 s; its import graph contains no S3-touched module),
    `gl/grainFinish` (45 s). During the sweep, three builders' sweeps plus a corpus bench ran
    concurrently; serial sweep caps (120–300 s) were simply outrun.
  - Honesty note: the sweep's raw result files were lost when a runtime restart wiped `/tmp`
    mid-verification; tallies and verdicts above were transcribed from live reads taken during
    the runs, and every exception was (re)proven by the paired standalone reruns, several of
    which ran after the restart.
- **Build:** `npm run build` GREEN (21.5 s) after a real `npm ci` in this worktree. (With the
  sandbox's borrowed node_modules the build fails resolving `@tauri-apps/api` — identically on
  pristine base; environmental, not S3.)
- **ESLint:** 0 errors on all six touched files.
- Determinism law: no `Math.random` / `Date.now` / `performance.now` in `featherFan.js` or
  `creature.js` (source-scan assert in the suite + grep). UI freeze honoured: no panel, no readout,
  no UI file touched — the only visible change is the moth's plumage itself.

## Flagged design calls

1. **Per-bone envelope is fixture-measured.** The 6–20 rule is asserted on the standard moth;
   distribution is length-proportional, so a differently-proportioned body asset shifts the split.
   The counts are named constants for Matt's review, as before.
2. **Budget truncation shape.** The old scatter returned exactly the `count` hierarchy asked for;
   the fan returns the layout, so under global-budget pressure a fan truncates by item order
   instead of thinning. Unreachable at the creature cap (≈440 of 2000 items); noted, not fixed.
3. **Skeleton build is now unconditional for formed moths** (was: only under `wantSkeletons`).
   This is S1's anticipated always-on consumer arriving; publication remains gated. The cost is
   measured above and is the fan's, not overhead.
4. **Chevron colour** inherits the retired scales' ink+vivid pairing while the other kinds take
   the wing's — a first-look call, named here for Matt's eye.

## Commits (branch `ember/skeleton-s3`, base `d8009ee9`)

- `344ac9bf` feat(creature): Phase 2 S3 — feather fan layout module (#1356)
- `64c86927` feat(creature): Phase 2 S3 — the moth wears fans, scatter removed (#1356)
- `5c4236f0` feat(creature): Phase 2 S3 — fan cost declaration, append-only registry block (#1356)
- `ec100d37` perf(creature): Phase 2 S3 — share the right fan layout across the wing pair (#1356)
- (this report)
