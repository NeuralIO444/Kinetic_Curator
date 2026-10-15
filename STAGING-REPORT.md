# STAGING REPORT — #1433 R2: per-region animation (region instances in the renderer, playback)

Branch `ember/1433-region-playback`, stacked on stage 1's tip `43e84d9e` (#1431 C-wire).
Local commits only — no push, no PR. Stage 3 (#1434) stacks on this branch.

## What shipped

A mark whose asset carries R1 region mattes now CAN render as a remainder
instance + one instance per region, each region an ordinary instance
carrying its own kineme id + phase in the same two instance floats
(18/19) the kineme system already uses. No new vertex attributes, no
second animation system, no shader change. Expansion is pack-time only:
placements and goldens never see regions (contract instances are
byte-identical with and without region state — pinned in the suite).

The lane is wired end to end (bake → contract → governor → pack → live
loop) and activates when assignment data exists. That data — family
defaults + the editor — is stage 3 (#1434) by the lane's own split, so
in production today nothing assigns region kinemes yet and every
contract is byte-identical to pre-R2. The acceptance below is proven
with a test-fixture assignment through the real contract builder, the
real bakers, and real WebGL2 renders.

## Commits (bottom → top)

1. `31990268` feat(assets): region cap 12 + tracked cap merge in regionPartition
2. `58e095cc` feat(data): regionKinemes — the assignment surface R2 consumes
3. `d21a15de` feat(gl): region cells in both atlas bakers
4. `0b30007e` feat(gl): region playback — contract regionAnim, pack expansion, governor wiring
5. `e2460217` test(gl): regionPlayback selfcheck + manifest; stage-1 atlas pin follows the joint bake
6. (this report)

## Design

### Bake / pack
- **Cap (ruling vs R1 data):** R1 baked at REGION_CAP 8 (the spec's
  then-recommendation). Matt's amended ruling (2026-10-14, on #1433)
  says bake tags up to 12 — so the cap is now 12 and the library was
  re-baked with the repo's own script (`npm run bake:regions`).
  Measured: 49 assets change region count (dot fields / rings /
  barcodes 8→12, dashes / hatches / radials 8→9–10, geo_burst_01 8→9);
  total 1,095 regions over 294 assets. 15 stamp (text) assets shift
  geometry only — the per-machine font drift `regionBake.selfcheck`
  already exempts; this bake ran on the Linux sandbox.
- **One cap implementation:** the cap merge moved to
  `app/src/assets/regionPartition.js` (`capRegionsTracked`, tracked so
  pixels can be assigned through merges). `regionBake.capRegions` is a
  wrapper on it; the suite pins tracked == bake, library-wide.
- **Partition:** both bakers re-run detection on the canonical raster
  and replay the tracked cap over the detector's idMap, matching kept
  regions to the committed records by id (records stay the authority).
  On the resvg path: every record matched, **0 drifted pixels**
  (pinned for flora + a 12-region dot field + geo_burst). The browser
  baker folds any canvas-vs-resvg drift into the nearest record by
  centroid, so pixels are never lost.
- **Region cells:** per regioned non-strip combo, the bakers emit a
  remainder cell (`<base>#rem`: whole mark minus region pixels) and one
  cell per region (`<base>#r:<regionId>`: its pixels only). Region +
  remainder bytes **sum back to the whole cell byte for byte** (pinned).
  Strip assets are excluded — their frames are whole-mark animation;
  cell kinemes own them.
- **Geometry (a contract reconciliation, flagged):** the issue says
  both "its own atlas cell (region bbox)" and "pivot at the region
  centroid". The quad shader's pivot is the instance origin and its
  quad is a rigid frame, so a bbox-exact quad pivots on the bbox
  centre, not the centroid. Shipped: the region cell holds the
  smallest **centroid-centred** rect containing the bbox (content
  masked outside the region), the instance origin sits exactly on the
  (bake-quantized) centroid, scale = mark scale × rect/199.5 per axis.
  Both clauses hold; the cost is the cell rect can exceed the bbox
  (≤ ~2× area worst case, ~1× for petal-like blobs).
- **Packing:** remainder/region cells flow into the same sqrt grid as
  the mains, which is sized on the TOTAL slot count. This matters:
  combo-rich scenes carry ~4 extra cells per main, and looser packing
  overflowed the 8192 texture ceiling of 8192-class GPUs (see the
  rollSafety note under Acceptance). Flora single-combo atlas:
  432×432 → 1296×1296 (1 main + 6 region cells in a 3×3 grid).
  Whole-library worst case ≈ 1,683 slots vs 294 mains — real scenes
  bake only their own combos, but the growth is real and belongs in
  the publish decision (see judgment calls).
- **Atlas demand:** region cells are baked only for assets the
  frame's contract actually expands. `bakeAtlas` takes a
  `regionAssets` demand set (null = every regioned combo, for direct
  callers/tests); the parity driver derives it from the contract's
  `regionAnim` (empty without region state, empty under the collapse
  shed — the pack reads no region cells in either case) and the live
  loop does the same, with the demand set riding both atlas cache
  keys. Unassigned scenes therefore keep the exact pre-R2 atlas —
  which is also what keeps the driver's per-scene atlas cache from
  retaining ~180 MB region atlases for scenes that never expand a
  mark (the second rollSafety failure, below).
- **Pack expansion** (`renderer.mjs`): when the frame carries region
  state and it isn't the collapse shed, a governed mark expands in
  place: remainder first (mark's transform + kineme + flags), then
  regions in record order. Region origin = the mark's affine applied
  to the centroid; a selected region carries its contract slot + phase
  `kinemePhase(assetId, regionId)`; an unselected/unassigned region
  inherits the mark's kineme + phase (parenting approximation —
  flagged). Fail-closed throughout: missing/incomplete region cells →
  the single quad draws.

### Contract + governor wiring
- `contract.regionAnim` (additive; version unchanged) is emitted
  **only when a scene has region assignments** — so every existing
  contract and hash is untouched in production today. Shape:
  `{ budget, shed?, assets: { [assetId]: { [regionId]: slot } } }`,
  slot 0 = assigned but not selected (renders merged, at rest).
  Region kinemes join the shared 16-slot table **after** instance
  kinemes; `assertSceneContract` validates the shape.
- **Selection is resolved in the contract builder**, where the budget
  lives: largest regions animate first, record order breaks ties
  (`regionKinemes.js selectAnimatedRegions`) — mechanical cost logic,
  no curation surface.
- **Budget:** `REGION_BUDGETS = { desktop: 12, ipad: 8 }` in
  `data/quality.js` (where the other budgets live). The live loop
  detects the device class (iPad UA / MacIntel+touch, the
  useMediaExport sniff) and passes `doc.regionBudget`; stills/exports
  pass none and get the tag cap (12), so their region playback is
  deterministic.
- **Shed ladder** (predicates in sceneContract.js, doc fields wired in
  liveLoop from the store's governor state): freeze on the tier-2 rung
  (`perfTier1 && quality === 'performance'` — the cell-kineme /
  spectrum rung) tightens the budget to 0: regions draw, at rest.
  Collapse needs the freeze rung PLUS a deeper cut (`assetThin` /
  `perfClamp` / `slowRender`): the pack then takes the **exact pre-R2
  single-quad path** — byte-identical packed output (pinned) and a
  byte-identical render (pinned on GPU). Reduced motion
  (`doc.reducedMotion`, read per frame in the loop) also tightens the
  budget to 0: regions hold rest.
- **Instance-budget honesty:** placements never see regions (the
  parenting law), so the resolver's placement caps can't count region
  instances pre-pack. What the governor does feel: the true GPU cost
  (its GPU-time signal), plus the budget/freeze/collapse rungs above,
  plus a declared cost tier (`gl/region-instances`, tier 0, in
  renderer.mjs). Flagged as a judgment call below.
- **Live loop:** `getPool` also builds `regionsPool` (canon + overlay
  records) and hands it to `bakeLiveAtlas`, which mirrors the offline
  region cells (same partition/geometry modules).

## Acceptance evidence (regionPlayback.selfcheck, in the manifest)

Fixture: `flora_flower_01` (4 petals + centre), assignment petals →
`rock`, centre → `pulse`, via `doc.regionKinemes` through the real
`buildSceneContract`.

- **Petals move independently (GPU):** petal-rect pixel diffs at
  t=0.6 vs rest: **119 / 110 / 64 / 119 px** (all > 0, not equal —
  hash phases); centre pulses on its own region (12 px). One full
  rock period wraps byte-identically; same state renders the same
  frame byte-identically.
- **Placements byte-identical:** contract instances deep-equal with
  and without region state (Node pin); expansion is pack-time only.
- **Rest parity: 0.646% of pixels** differ between the tiled rest
  frame (budget 0, all slots 0) and the single-quad render — bar is
  <10%. (Method: 400×280 WebGL2 render via the parity driver, flora
  at (500, 350) scale 2.5 on black; differing-pixel fraction over the
  whole frame.)
- **Shed collapse exact:** shed render byte-identical to the
  no-regionAnim render (GPU), and shed pack output byte-identical to
  the pre-R2 pack (Node).
- **Governor selection demonstrable:** budget 1 vs rest: **321 px**
  move vs **1,216 px** at budget 12; motion confined to the largest
  petal's rect, the other petals byte-still; mark alpha within 2% of
  rest (draws complete).
- **Bake tiling:** region + remainder cell bytes sum to the whole
  cell exactly (Node, per channel, per pixel).
- **rollSafety incident (found by the sweep, fixed, re-verified):**
  the first full sweep failed `fx/rollSafety` — a suite this lane
  doesn't touch — in two successive forms, both mine. (1) The
  after-rolls default scene's atlas packed 5616×8208, 16px past the
  8192 texture ceiling → GL_INVALID_VALUE at upload; fixed by the
  joint sqrt packing (6048×6048). (2) A later rolled scene
  (radial/persona-davis, 630 instances, 32 combos) fit the ceiling at
  6912×6480 but the ~179 MB region atlas (vs ~27 MB pre-R2) exhausted
  the headless GPU process after a dozen cached scenes →
  framebuffer-incomplete; fixed by atlas demand (above) — that scene
  has no assignments, so its atlas is the pre-R2 one. rollSafety then
  passed solo on this tree: **7 checks, ~9 min**, matching its
  base-tree solo pass.
- Full manifest sweep: **420 of 420 suites pass** (solo run, ~27
  min, exit 0) on the manifest minus the two known base-identical
  sandbox failures — `swarmWasm` ("cargo not found", verified
  identical on the stage-1 base tree) and `gl/accum` (V8 OOM,
  measured base-identical at stage 1). regionPlayback runs inside
  the sweep and passes there too.
- `npm run build`: green (after `npm install` completed this
  worktree's node_modules — it was missing the declared
  `@tauri-apps/api`; the base worktree builds without it because its
  install is complete; unrelated to this change).

## Judgment calls (flagged plainly)

1. **Cap 8 → 12 re-bake** follows the amended ruling's letter ("bake
   tags up to 12"). It rewrites R1's committed data; if Matt wants
   the cap applied only from R3 onward, reverting commit 1 restores
   R1's data and everything else still works (partition caps
   detection to the record count).
2. **Centroid-centred region cells** (above) trade atlas area for an
   exact centroid pivot. The spec's "atlas growth bounded by total
   region bbox area" becomes "bounded by region count" under slot
   packing — worst-case whole-library ≈ 1,683 slots (a hypothetical
   single whole-library atlas would exceed texture limits; no code
   path bakes one — scenes bake their own combos). If atlas memory
   on iPad bites, the follow-up is sub-slot shelf packing for region
   cells; not built here.
3. **regionAnim emission is assignment-gated.** On an iPad with no
   assignments, marks stay single-quad (identical frame — nothing is
   assigned to animate). Expansion exists to serve motion + the shed
   ladder; both are inert without assignments.
4. **Unselected regions inherit the mark's kineme** with the mark's
   phase, pivoting at their own centroid rather than the mark's
   origin (one kineme slot per instance — nested parent motion can't
   compose exactly in one instance). When R3 assigns a region its
   own kineme, that region is fully local and the remainder keeps
   the parent motion.
5. **Freeze = budget 0; collapse = one rung deeper** is my mapping of
   the issue's ladder onto the governor's existing cuts (there is no
   pre-existing "instance kinemes freeze" rung to sit between —
   instance kinemes freeze today via slowRender, which is one of the
   collapse triggers).
6. **Materials on regions:** region instances inherit the mark's
   glass/deform/material flags; the plate/wash ramps read `v_cell`
   (the region cell's frame), so a plate-bodied regioned mark ramps
   per region, not per mark. No test scene exercises materials ×
   regions; flagged, not hidden.
7. **Custom (user:) assets:** the live baker bakes their region
   cells from the pool, but the contract learns regions from the
   built-in catalogue only — custom-asset region playback arrives
   with R3's import auto-tagging (#1434). Built-ins are complete.
8. **Stage-1 pin updated:** `cellKinemePlayback`'s plain-atlas
   position assertions now pin what R2 leaves invariant — every main
   cell is one whole stride-aligned frame (absolute grid positions
   are R2's packing choice once region cells share the grid). Its
   GPU numbers are identical to stage 1's verified run:
   1086 / 894 / 360 / 307 / 1911 px, and frame 0 stays bit-identical.
9. **liveAtlas** is verified by mirror construction + the shared
   pure modules (partition/geometry are suite-pinned); its canvas
   detection path has no Node coverage (no DOM) — the GPU suite
   covers the resvg baker end to end.
10. **Region cells are baked on demand** (see Design): a scene whose
    contract expands no mark pays nothing for region cells, and the
    collapse shed bakes none. The cost: when assignments first appear
    (or the shed lifts), the atlas rebakes with the cells — the live
    loop's fail-closed pack draws single quads until the new atlas
    lands, so the transition is a brief single-quad frame, never a
    missing mark. An assignment-heavy scene with very many combos
    can still exceed texture limits; sub-slot packing (call 2) is
    the follow-up if that ever becomes real.

## Files touched per commit

1. `app/src/assets/regionPartition.js` (new), `app/src/assets/regionBake.mjs`,
   `app/src/data/assets/regions.generated.js` (re-baked),
   `docs/research/region-mattes-bake-report.md` (regenerated),
   `app/src/assets/regionBake.selfcheck.mjs` (cap pin + fixture)
2. `app/src/data/regionKinemes.js` (new)
3. `app/src/gl/atlas.mjs`, `app/src/gl/liveAtlas.mjs`,
   `app/src/assets/regionRaster.js` (export canonicalSvg),
   `app/src/gl/parity/glDriver.mjs` (geo passthrough)
4. `app/src/gl/sceneContract.js`, `app/src/gl/renderer.mjs`,
   `app/src/data/quality.js`, `app/src/gl/liveLoop.mjs`,
   `app/src/gl/parity/glDriver.mjs` (atlas demand + cache key)
5. `app/src/gl/regionPlayback.selfcheck.mjs` (new),
   `app/selfcheck.manifest`, `app/src/gl/cellKinemePlayback.selfcheck.mjs` (pin)

## Not built (by design)

- `regionKinemes` family defaults, the asset-tools editor, import
  auto-tagging — stage 3 (#1434).
- Waveform strips — stage 4 (#1435).
- No shader changes, no new vertex attributes, no UI.
