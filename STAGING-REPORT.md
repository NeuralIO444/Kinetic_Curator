# STAGING REPORT — #1356: the finishing look pass, both creature families (LOCAL ONLY — no push, no PR)

Branch `ember/1356-finishing-look-pass`, base = origin/main `6946f393` (chain-independent
stage, per ruling). This file replaces the S3 staging report at the worktree root; S3's
remains in git history on main. Date: 2026-10-20.

## Bottom line

- **Shipped (presentation layer only):** the engraving finish gains its second body-space
  line family — the longitudinal **SEAMS** the creature-system plan names (§1.3: lines of
  constant "along" are seams), in `app/src/engine/engraveBody.mjs`, JS mirror and GLSL in
  lockstep. The moth body goes from contour-only line work to a contour × seam crosshatch.
  No resolver output moves: packed per-instance data is unchanged, no key was added
  anywhere, and all three pin suites pass unmodified.
- **The both-family layered part art is a FORK, not shipped — with the mechanism proven,
  not asserted.** Resolver items embed the full asset record (`item.asset` — the SVG
  string and the baked regions), and the replay/creature gates hash the whole resolver
  output. Any part-art change therefore rehashes every recorded take that draws the part,
  and re-recording a pin needs Matt's ruling (the S3 precedent). The designed art was
  built, verified against both guardrails (attach points and governor cost scores
  bit-identical), rendered as previews, and then reverted. Forks F1/F2 below specify it
  exactly; one ruling lands both.
- **Honest placement against "very layered":** the shipped build closes the engraving
  half of the finishing pass — the body finish is now two line families, still not the
  Haeckel density of the reference plates. The layered wings/fan/dish bodies exist as
  designed, guardrail-verified, previewed art in fork F1 (+F2 for the dish). This report
  does not claim the "not Davis moths yet" gap is closed; it stages its closing behind
  one pin ruling, with the eye evidence attached.

## What was built, per family

### Field-formed moth line — SHIPPED: engraving seams

- `engraveBody.mjs`: the field now tracks the signed lateral distance (`bestLat`) of the
  closest spine point alongside the arc position it already tracked. Two seams at fixed
  lateral offsets `ENGRAVE_SEAM_OFFSETS = [5.5, 11]` (asset units) are drawn at
  `ENGRAVE_SEAM_REL = 0.55` of the contour strength, sharing the contour line width and
  the same end fade: `lineAll = max(line, seam * 0.55)`. Because the seams are level sets
  of the spine's lateral frame, they bend with the spine exactly as the contours do
  (proven on a bent path in the new suite).
- JS mirror (`engraveFactorAt`) and the GLSL chunk (`ENGRAVE_GLSL`, inlined into the
  shared quad shader) carry the same constants — parity asserted in the new suite, the
  S4 pattern. The caller gate is unchanged: only engraved instances enter the branch,
  and exactly one item per moth is engraved (the true body stamp, not its halo).
- On-spine probes are the S4 field exactly (contour centre dark, between contours
  untouched — no seam reaches the spine), and the S4 packed-data golden `59289882`
  stands: `engraving.selfcheck` passes untouched, golden included.

### Dish family — no shipped visual change, and the reason is evidence, not omission

- The dish discs' interior detail cannot render today: `dishCreature.js` stamps every
  body/limb item with `accent === colour`, and within-asset detail marks read the accent
  slot — with the two slots equal, detail is invisible no matter what art the disc
  carries. Proof on the bench: the dish rendered with fork F1's enriched disc art but
  without the accent split was **pixel-identical** to the before render.
- The shipped build therefore changes nothing on the dish path, and pins the contract
  instead: the new suite asserts `accent === colour` on real dish items, so fork F2's
  PR must change that contract deliberately, in the open.
- The dish's finishing layer is fully designed and previewed under forks F1+F2
  (`renders/fork-dish.png`): concentric strata rings + pore ticks on the disc, visible
  only once the accent split lands.

### Both families — the fork guardrails, pinned in a new suite

`app/src/engine/finishingLook.selfcheck.mjs` (new; registered in `app/selfcheck.manifest`,
append-only) covers:

1. **F1 guardrails at pre-pass values** — for the seven part assets both families are
   skinned from (`org_pod_02` moth body, `org_leaf_02` wing, `org_petal_02` /
   `org_petal_01` / `org_pod_01` fan, `geo_chev_01` chevron ornament, `org_blob_01` dish
   disc): the auto-attach points (anatomy) and the governor cost score
   (`assets/ingest.js assetCostScore`, the `assetThin` ranking input in
   `gl/liveResolve.mjs`) are pinned to their pre-pass values. The fork's designed art
   was measured passing both before it was reverted (the suite passes on today's art;
   the fork PR re-runs it against the new art).
2. **The seam behaviour** above, including GLSL/JS constant parity.
3. **F2's dish contract** (`accent === colour`), as described.

## Files touched

| File | Change |
|---|---|
| `app/src/engine/engraveBody.mjs` | Seam line family (JS + GLSL), header note. |
| `app/src/engine/finishingLook.selfcheck.mjs` | New suite (above). |
| `app/selfcheck.manifest` | One appended line registering the new suite. The `package.json` selfcheck script untouched. |
| `renders/` | Paired-render evidence (below). |
| `STAGING-REPORT.md` | This report. |

(Code + manifest diff vs base: 37 insertions / 4 deletions.) Nothing else: no asset
SVGs, no region bakes, no fixtures, no panels, no resolver or builder code, no new
recipe/layout keys (no `DEFAULT_LAYOUT_PARAMS` or normalize lines — there is nothing
for a strip proof to strip; the pins never moved).

## Budget (allowance: 2.0 ms GPU/frame @1080p iPad-class, creature-system plan)

Method, stated plainly: this sandbox has no iPad-class GPU, so the budget is judged the
repo's own way — the cost registry declarations against the allowance, plus the shape
of the change — and the sandbox CPU numbers are labelled as such.

- **No new cost surface.** The shipped change adds no draw pass, no item, no packed
  float, and no CPU work: `engraveDataFor` packing is byte-identical (the S4 golden
  stands), and its bench is 0.0118 ms/frame for 4 creatures standalone (0.0385 under
  3-way parallel sweep load; sandbox node, print-only, the suite's own bench). The seam
  term is a handful of extra ALU ops inside the existing `engraveShade` branch, which
  runs only on engraved fragments — one body item per moth.
- **Registry verdict (`creatureCost`, in the sweep):** declarations `creature/moth`
  1.18 ms (59% of the 2.0 ms allowance) and `creature/dish` 0.05 ms (3%), combined
  conservative 1.23 ms — all "ok", declarations honest and in band on re-measurement.
  (The suite's sandbox re-measure of the moth family read 3.404 ms under parallel
  sweep load; the suite judges that in band — a shared sandbox CPU is not the device,
  and the declarations are sandbox-labelled in the registry. The shipped change adds
  no resolver or packing work for that number to grow from.)
- **Resolver probe (standalone, no parallel load):** PASS — 0 creatures 0.61 ms;
  4 creatures 1.99 ms mean, p95 3.34 ms; heap growth 0.09 / 0.28 MB. (In the parallel
  sweep it tripped its 5 ms budget at 5.171 ms mean — the brief's load-sensitivity
  warning, verbatim; the standalone run is the verdict.)

## Verification

- `npm run build`: **green** (vite, built in 4.90 s at the final tree state).
- **Pins (the acceptance core): all green, unmodified.** `gl/replayGate` PASS
  (3601 frames, 61/61 checkpoints), `gl/creatureGate` PASS (901 frames, 16/16
  checkpoints), `engine/wingWarp` PASS (bent golden intact). The influences are
  replay-identical because the resolver's outputs are: presentation only, decisions
  unchanged (creatures-spec §2 — no clock/random reads added anywhere; the seam field
  is a pure function of the posed skeleton, and the determinism guard pattern is
  unchanged).
- **#1188 deniability guard: green untouched.** `queenDeniability` PASS (7 checks);
  `queenChannel` PASS (13), `queenLean` PASS (24). Nothing of the Queen is rendered or
  named by this build.
- **Creature/replay families:** `creature`, `dishCreature`, `skeleton`, `creaturePose`,
  `featherFan`, `glitch`, `robot`, `lsystem`, `creatureCost`, `costTiers`,
  `performanceCreatures`, `governorCreatureShed`, `poolCitizenship` (14 checks),
  `engraving`, `finishingLook` — all PASS. Pin-still, governor shed order (count
  first), and the hand-only `creatures` BUILD param are untouched code paths and their
  suites pass unmodified.
- **Full manifest sweep:** all 485 manifest suites on this branch (484 from base + the
  1 new suite) run individually, 3-way parallel with a 240 s per-suite cap:
  **478 PASS / 7 FAIL** raw. Every failure classified:
  - `engine/kernel/bake/swarmWasm` — FAIL: `build-wasm: cargo not found on PATH`.
    Base-identical sandbox failure, as briefed; no Rust/wasm file touched.
  - `fx/rollSafety` — hit the 240 s cap in its browser stage after its pure-helper
    checks passed. Baseline failure on clean main in this sandbox (browser
    signature), as briefed; no fx code touched.
  - `gl/accum` — hit the 240 s cap in the parallel sweep; standalone re-run with the
    repo runner's own heap setting (`--max-old-space-size=4096`) **PASS** (49 cases).
    A first standalone attempt under the default 2 GB heap died OOM after every
    mirror/probe check it reached had passed — the brief's baseline behaviour for
    this suite ("sandbox timeout… also passes on favourable variance"); no gl code
    touched.
  - `gl/composite` — hit the 240 s cap under parallel load; standalone re-run
    **PASS** (15 cases, 171 s). Parallel-load artifact, not a build failure.
  - `gl/canvasSizes` — same shape; standalone **PASS** (58 cases, 110 s).
  - `pattern/patternRender` — same shape; standalone **PASS** (19 checks, 138 s).
  - `gl/resolverProbe` — load-sensitive timing assertion under parallel load
    (5.171 ms vs the 5 ms budget); standalone **PASS** (numbers in Budget above).
  Net after classification: **483 PASS / 2 FAIL**, and the 2 failures are the brief's
  baseline sandbox set — `swarmWasm` (missing cargo) and `fx/rollSafety` (browser
  signature) — each base-identical and in code this build does not touch.
  `gl/accum`, the brief's other baseline-named suite, passes standalone here on
  favourable variance, exactly as the brief says it can.

## Paired-render evidence (`renders/`)

Harness: a scratch node harness driving the repo's real builders
(`createCreatureBuilder({ skinning: true })` and `createDishCreatureBuilder`), seed 77,
the Haeckel teal/orange/slate palette; warp meshes drawn as per-triangle affine-clipped
asset copies; the engraving panel samples the real `engraveFactorAt` field on a body
quad. Sheets were rendered by headless Chromium via `page.setContent` (no localhost
navigation — the sandbox blocks it, and the live app's watchdog would need the Space
resume dance; the harness path was used instead, per the brief's fallback). The `.svg`
files beside the `.png`s are the harness's vector source for each sheet. The harness
itself was scratch and is not committed; the sheets are its direct output.

| Pair | Files | What it shows |
|---|---|---|
| Moth, shipped finish | `before-engrave.png` → `after-engrave.png` (+ `.svg`) | The shipped delta: the body engraving field, contour-only → contour × seam crosshatch. |
| Moth, full creature | `before-moth.png` / `before-moth-zoom.png` (main) vs `fork-moth.png` / `fork-moth-zoom.png` (fork F1 preview) | Main's moth today vs the fork's layered art: wing cross-vein lattice, denser fan, crest marks on the body. The shipped seam finish rides the body item under the wings and is shown at field level in the engraving pair. |
| Dish | `before-dish.png` / `before-dish-zoom.png` (main = shipped; no dish code or asset changed, so the shipped after is this frame) vs `fork-dish.png` / `fork-dish-zoom.png` (fork F1+F2 preview) | Main's smooth discs vs the fork's strata-ringed discs — visible only with F2's accent split, which the preview simulates with the palette cream as the detail slot. |

## Forks

### F1 — part-pool art enrichment, both families (needs a pin re-record ruling)

The finishing layer the plans specify — layered marks inside the parts themselves —
designed as **element-count-neutral** art: new detail appended as subpaths of the
assets' existing elements (no new elements, so no silhouette, matte, or element-count
change). Per part: cross-vein lattice in the wing leaf (`org_leaf_02`); vein/strata
marks in the fan feather, leaf, and plate (`org_petal_02`, `org_petal_01`, `org_pod_01`);
inner chevron echo (`geo_chev_01`); crest + segment marks on the moth body
(`org_pod_02`); concentric strata rings + pore ticks on the dish disc (`org_blob_01`).
Region mattes re-bake from the same SVGs.

- **Guardrails verified on the designed art before reverting:** every part's
  auto-attach points bit-identical to the pre-pass table, and every part's
  `assetCostScore` identical (5/2/2/1/2/1/1 in the asset order above) — anatomy and
  the governor's thinning ranking provably unmoved. Both tables are pinned in
  `finishingLook.selfcheck.mjs`.
- **Why it cannot ship in this build:** bisecting `replayGate` on this branch showed
  the gates hash the whole resolver output **including the embedded full asset
  record** (`item.asset`, SVG + baked regions). Element-neutral, attach-invariant,
  cost-invariant art still moved `replayGate` at frame 0. Landing F1 rehashes
  `replayGate` and `creatureGate` (and the `wingWarp` resolver golden) for every
  take drawing these parts. Under the standing rule — never re-record a pin without
  a ruling — F1 stopped here instead.
- **The ruling that lands it:** a re-record ruling on the S3 precedent (inputs
  byte-identical; the re-recorded diff is checkpoints/hashes only, deep-diffed and
  reported). F1 + F2 should land as **one** PR under that one ruling, with the
  guardrail suite re-run against the new art and the fork previews above replaced by
  true before/after pairs for Matt's eye.

### F2 — the dish accent split (same ruling; F1's dish half is invisible without it)

`dishCreature.js` stamps dish body/limb items with `accent: col` where `color: col` —
the detail slot equals the fill slot, so within-asset detail can never show on a disc
(evidence: F1 art without the split rendered pixel-identical to before). The fork:
dish discs carry a **distinct accent** (the preview uses the palette cream, `#f5ead2`,
as the detail slot — the exact slot value is part of the fork PR's eye pass). This
changes resolver item fields, so it rehashes the same takes and rides F1's ruling.
The shipped build pins today's contract (`accent === colour`) in the new suite so the
change is deliberate when it comes.

## Exceptions and deviations

- No pin moved; no golden weakened; no fixture touched; no key added — nothing to
  strip-prove.
- The brief's baseline sandbox set reproduces as classified in the sweep section:
  `fx/rollSafety` and `swarmWasm` (missing cargo) fail base-identically; `gl/accum`
  is sandbox-fragile under load and passes standalone with the runner's heap
  setting. None is in a file this build touches.
- Live-app screenshots were not used for the evidence pairs (sandbox localhost
  block + watchdog); the builder-harness sheets above were used instead, as the
  brief allows, with the method stated.
- Robots and L-system growths have no stage path (verified in the repipe planning)
  and are untouched; "both families" is the moth line + the dish family, as
  re-scoped.
