# Kernel opportunities — research pass (2026-10-09)

## Framing (Matt)

Read-only audit of the KC-1 engine kernel (`app/src/engine/kernel/`, 44 files),
plus the hot paths it feeds into `app/src/gl/liveResolve.mjs`. Nothing was
changed — this is the idea list for future builds.

Three lenses decide what "better" means here:

- **Determinism law** — seeded RNG discipline everywhere in the kernel; same
  seed → same output. The byte-identical rule: any new parameter or behavior
  change at its neutral/default setting must produce output identical to today.
  Ideas that would change existing output are marked as versioned/opt-in only.
- **iPad roadmap** — perf budgets target iPad-class GPUs. Per-frame
  allocations, redundant recomputation, and anything scaling badly with
  instance count matter more than they used to.
- **Petri-dish contract (#1183)** — the kernel should move toward modules that
  declare `id`/`family`/`reads`/`writes`/`costTier` and compose through shared
  world channels (point sets, vector fields, scalar fields, ground tile
  function, features) instead of hardcoded wiring. Samplers already have a
  registry; KINEME drivers have a registry; fields/weather/features do not.

The 23 ideas are ranked by impact. Sizes are S/M/L.

## 1. FEED delay recomputes optical flow every frame (M)

**What/where** — `tracks/feedDelay.js` + `tracks/feedOps.js`:
`delay.field(trackId)` calls `lumaToFlow()` on every frame, allocating a fresh
`Float32Array(w·h·2)` (~1MB at 1080p×0.25 scale) per active FEED patch.

**Why it matters** — iPad perf. This is per-frame, per-patch allocation churn
on one of the hottest paths; GC pressure scales with canvas size.

**Approach** — cache the flow per delay slot with a dirty flag set in
`push()`; recompute only when new luma actually lands.

**Acceptance** — frame-for-frame identical flow output vs today at the same
seed (byte-identical default); no per-frame `Float32Array` allocation on the
FEED path.

**Relates to** — #1183 (FEED is a dish channel), #1199 (field→channel mapping),
#1200 (density attractors).

## 2. Sampler registry declares no contract metadata (M)

**What/where** — `sample/registry.js`: `registerSampler(id, fn)` declares no
`costTier`/`reads`/`writes`/input-output types.

**Why it matters** — the dish contract (§2) requires every module to declare
these at registration. Without them the governor can't reason about samplers
and the UI can't list them as tiles without panel-code edits.

**Approach** — upgrade to
`registerSampler({id, family, reads, writes, costTier, fn})`; migrate existing
samplers; UI reads from the registry.

**Acceptance** — every registered sampler declares family, reads, writes,
costTier; a new sampler becomes a UI tile with zero panel changes.

**Relates to** — #1183 (required by dish contract §2), #1194/#1195/#1196/#1197
(future samplers ride this), #1203 (dish roster UI), #1204 (forward-compat).

## 3. Fields have no registry at all (M)

**What/where** — `field/index.js`, `field/scent.js`,
`sample/quadtreeSignal.js`: fields are free functions (`makeNoiseField`,
`combineFields`, scent, quadtree interestingness) with no registry.

**Why it matters** — dish spec §5 explicitly wants field/weather/feature
registries in the sampler-registry shape so new modules become UI tiles with
zero panel changes. Today adding a field means editing call sites.

**Approach** — build `field/registry.js` mirroring `sample/registry.js`;
register noise/scent/quadtree fields; UI renders from the registry.

**Acceptance** — a new field module is usable in the instrument with no panel
code edit.

**Relates to** — #1183 (required by dish contract §5), #1199
(field→channel mapping), #1203.

## 4. Neighbor-search radius is 35% of the canvas (S to verify / M if changed)

**What/where** — `tracks/trackGraph.js`: `FIELD_RADIUS = 0.35` operates in
normalized 0..1 space (confirmed by `trackGraph.field.selfcheck.mjs`: "0.12 <
FIELD_RADIUS"). At 35% of canvas, the counting-sort spatial hash in
`fieldHash.js` degrades to near-all-pairs O(M·N) per frame in
`liveResolve.mjs:744`.

**Why it matters** — iPad perf. If the radius is meant to be local, this is a
units bug burning CPU every frame; if it's intentionally global, the hash is
theater and a direct loop is clearer.

**Approach** — verify intent first. **Changing the radius changes output — a
versioned behavior change, never a silent fix.** If changed, bump the behavior
version and golden fixtures together.

**Acceptance** — intent recorded; either a local radius with a working hash or
an explicit global radius with the hash replaced by a direct loop.

**Relates to** — #1199, #1200, #1227 (BUILD TE touched these paths).

## 5. Checked-in WASM is unverified (S)

**What/where** — `bake/swarmWasm.mjs` + `kernel/wasm/swarm_bake.wasm`: CI
consumes the checked-in wasm "as-is" — nothing verifies it matches
`rust/swarm-bake/src/lib.rs`, so a stale or hand-rebuilt wasm ships silently.

**Why it matters** — determinism law. A wasm that drifts from its Rust source
is an invisible behavior change with no audit trail.

**Approach** — have `scripts/build-swarm-wasm.sh` emit a source hash into the
artifact; assert it in `swarmWasm.selfcheck.mjs`.

**Acceptance** — CI fails if the checked-in wasm doesn't match the Rust
source; rebuilding updates the hash in one command.

**Relates to** — #1185 (stills fidelity).

## 6. applyField/applyFeed copies every point on the no-op path (S)

**What/where** — `tracks/trackGraph.js`: `applyField`/`applyFeed` return
`targetPts.map(q => ({...q}))` — a full N-object spread copy — even when the
patch mode is off or the source list is empty; called per-frame from
`liveResolve.mjs`.

**Why it matters** — iPad perf. Pure allocation churn on a per-frame path for
the overwhelmingly common no-op case.

**Approach** — return the input unchanged on the no-op path (document that the
no-op path returns the same reference).

**Acceptance** — byte-identical output; no allocation when the patch is off.

**Relates to** — #1199, #1227.

## 7. Bake reintroduces a fixed accent bug (S)

**What/where** — `bake/index.js` `bakeSwarmItems()`: uses
`swatches.indexOf(item.color)` per item — O(items·swatches) per still, and it
reintroduces the duplicate-hex accent bug that `kernel/color/index.js`
explicitly fixed for the live path ("indexOf silently returns the first match
and every duplicate gets the same wrong accent").

**Why it matters** — stills-vs-live parity (#1185). The bake path disagrees
with the live path on duplicate hexes — exactly the class of bug #1185 tracks.

**Approach** — reuse the slot-based accent derivation from
`kernel/color/index.js` instead of `indexOf`.

**Acceptance** — bake accents match live accents on palettes with duplicate
hexes; still-vs-live accent parity on the #1185 fixture set.

**Relates to** — #1185.

## 8. Unregistered RNG channels silently lock to offset 0 (S)

**What/where** — `rng.js`: `STRING_CHANNEL_GROUPS` requires manual
registration of every named channel, or it silently locks to offset 0 (the
old 'field'/'ca' identical-streams bug class, documented in the file).

**Why it matters** — determinism law. A silently-locked channel means two
streams that were supposed to be independent draw identically — invisible
correlation in the output.

**Verification (2026-10-09)** — #1226's branch
(`feat/1193-poisson-disc`) DOES register `poisson: 'spatial'` at `rng.js:116`,
so the Poisson case is covered once that PR merges. The general hazard stands.

**Approach** — add a selfcheck that fails when a string channel is hashed but
unregistered in `STRING_CHANNEL_GROUPS`.

**Acceptance** — any future unregistered channel fails CI loudly instead of
silently correlating streams.

**Relates to** — #1193 / PR #1226, #1194/#1195/#1196/#1197 (each adds a
channel).

## 9. Kernel imports from gl/ (S)

**What/where** — `field/scent.js` imports `registerCostTier` from
`gl/costTiers.mjs` — a kernel→gl dependency. The kernel is supposed to be
pure and worker-safe. (Same smell: `bake/swarmWasm.mjs` imports
`data/layout-modes.js` — verify it's side-effect-free.)

**Why it matters** — architecture. A kernel that imports the renderer can't
move to a worker, can't be unit-tested without the GL stack, and inverts the
dependency the dish contract assumes.

**Approach** — invert it: a kernel-local cost registry that `gl/` reads.

**Acceptance** — no kernel file imports from `gl/`; kernel selfchecks run
with zero GL imports.

**Relates to** — #1183 (costTier declarations live in the kernel under the
dish contract).

## 10. Trig differs ~1 ulp between x64 and arm64 (L)

**What/where** — `bake/index.js` header documents it: `Math.sin/cos/atan2`
differ ~1 ulp between x64 and arm64, and over 120 chaotic bake steps that
becomes a visibly different swarm. A bake is only reproducible "on a given
machine" — which matters if studio renders ever distribute over mixed hardware
(Mac Studio vs arm64 iPad).

**Why it matters** — determinism law, iPad roadmap. Cross-machine
reproducibility is the whole point of the bake path.

**Approach** — deterministic trig (polynomial/table) on the bake path.

**Caveat — do not skip** — this changes bits vs today. **Opt-in or
versioned-kernel change only; never default-on under the byte-identical law.**

**Acceptance** — with the opt-in enabled, identical bake output on x64 and
arm64 for the fixture seeds; default path byte-identical to today.

**Relates to** — #1185.

## 11. Samplers return anonymous points — no dish addressability (L)

**What/where** — samplers are per-point callbacks returning anonymous
`{x, y, t}` — no named point sets, no `id`/`family`/`source` per entity.
The dish contract §1b requires every placed entity to carry identity so
modules can target queried sets ("every shape emitted by one pattern", "every
mark in the dish").

**Why it matters** — #1183's "for each asset" addressability. Without
identity at placement, no module can address "the shapes from pattern X" —
the whole cross-module composition story collapses.

**Approach** — add a dish context object the placement orchestrator fills once
at placement (precomputed selections, never per-frame queries, per the
contract's perf rule).

**Acceptance** — a module can query "all entities with source=pattern-X" from
the placement-time context; no per-frame entity searches.

**Relates to** — #1183 (required by dish contract §1b), #1206 (hierarchy
instances carry identity — natural partner), #1195/#1196/#1197.

## 12. Growth uses cells.shift() — O(n) per aged cell (S)

**What/where** — `sample/growth.js` `ageOut()`: `cells.shift()` is O(n) per
aged-out cell on a 2048-cell array during heavy growth.

**Why it matters** — iPad perf. Linear-time dequeue on a hot array is the
textbook fix.

**Approach** — use a head index instead of `shift()`.

**Acceptance** — byte-identical growth output; `ageOut` O(1) amortized.

**Relates to** — #1197 (space-colonization growth builds on this sampler).

## 13. Five inconsistent cache disciplines (S)

**What/where** — `WeakMap` (`_caFieldByGrid`) vs size-capped `Map`+`.clear()`
(`_voronoiCentres`, `_lsysCache`, `_growthCache`) vs FIFO-ish delete
(`_quadCache`) — five ad-hoc eviction policies across the kernel.

**Why it matters** — hygiene + iPad perf. Inconsistent caches mean
inconsistent memory behavior; the FIFO-ish one can grow while the clear() ones
nuke hot entries.

**Approach** — unify behind one `makeSmallCache(n)` helper with a documented
eviction policy.

**Acceptance** — one cache helper, all kernel caches through it, same hit
behavior as today on the fixture set.

**Relates to** — #1183 (cache discipline is part of module `costTier`
honesty).

## 14. FEED rasterize allocates then copies per frame (M)

**What/where** — `tracks/feedLive.js`: `rasterize()` allocates a
`Float32Array` per `pushSource` per frame per track, then `push()` copies it
into the delay slot — one allocation AND one copy per frame.

**Why it matters** — iPad perf. Both the allocation and the copy are avoidable.

**Approach** — double-buffer the delay slots: rasterize into the back buffer,
swap on `commit()`.

**Acceptance** — byte-identical FEED output; no per-frame allocation or copy
on the rasterize path.

**Relates to** — #1183, #1199, #1200.

## 15. Unknown sampler mode silently falls back to 'random' (S)

**What/where** — `sample/registry.js` `getSampler()`: unknown mode silently
falls back to `'random'`.

**Why it matters** — honest signals. Corrupt project data (a typo'd mode in a
saved recipe) silently re-randomizes a composition instead of telling the
artist something is wrong.

**Approach** — emit a diagnostic on fallback (console + patch diagnostics).

**Acceptance** — loading a recipe with an unknown sampler mode surfaces a
visible diagnostic; fallback behavior otherwise unchanged.

## 16. Patch diagnostics Map never pruned (S)

**What/where** — `tracks/patchDiag.mjs`: module-level `samples` Map keyed by
layerId is never pruned — grows unboundedly across layer add/remove cycles.

**Why it matters** — slow memory leak in long sessions. A performance
instrument that runs for hours can't grow a Map forever.

**Approach** — bound it (LRU or cap + evict-oldest).

**Acceptance** — bounded memory on the add/remove-layer torture fixture.

## 17. KERNEL_VERSION is a manual string (S)

**What/where** — `version.js`: `KERNEL_VERSION` is a manual string — nothing
enforces a bump when behavior changes. The file's own comment worries about
footer/fixture drift.

**Why it matters** — determinism law. Golden fixtures are meaningless if the
version they pin can drift silently.

**Approach** — add a selfcheck that fails if golden fixtures move without a
version bump.

**Acceptance** — any behavior-changing commit that moves fixtures without
bumping `KERNEL_VERSION` fails CI.

## 18. Hottest per-frame path has no selfchecks (S)

**What/where** — `feedOps.js`/`fieldHash.js`/`feedDelay.js` have no selfchecks
(only `feedLive` does) — the hottest per-frame CPU path (`lumaToFlow`,
`buildPointHash`, delay-1 semantics) is unpinned.

**Why it matters** — ideas #1, #4, #6, #14 all touch this path. Without pinned
behavior, those perf fixes can't prove they're byte-identical.

**Approach** — pin `lumaToFlow` output, `buildPointHash` neighbor sets, and
delay-1 semantics in selfchecks before any perf work lands.

**Acceptance** — new selfchecks in the manifest covering the three modules;
ideas #1/#4/#6/#14 prove no-op via these fixtures.

**Relates to** — #1, #4, #6, #14 (prerequisite).

## 19. CA field box blur allocates array-of-arrays (S)

**What/where** — `field/index.js` `makeCaField`: box blur allocates a full
array-of-arrays grid per pass.

**Why it matters** — minor; placement-time, not per-frame. Still, it's the
easy win.

**Approach** — `Float32Array` ping-pong instead.

**Acceptance** — identical CA fields; no array-of-arrays allocation.

## 20. Per-point RNG allocation in samplers (S)

**What/where** — `sample/registry.js` (`ca`, `voronoi`) and `field/index.js`
(`sampleFieldPoint`): per-point `rngForIndex()` allocates an `mkRng` object
per placement.

**Why it matters** — placement-time allocation churn; hoisting is trivial.

**Approach** — hoist to a per-call scratch stream.

**Acceptance** — identical placement output; no per-point `mkRng`
allocation.

**Relates to** — #1194/#1195/#1196/#1197.

## 21. FIELD/FEED resolve path allocates ~5×(M+N) small objects per frame (M)

**What/where** — `gl/liveResolve.mjs` FIELD/FEED path (kernel-owned
allocation behavior): per frame it does `toNorm` maps ×2, `applyField` map
with per-point closures in `forNeighbors`, then an item map — ~5×(M+N)
small-object allocations per frame, plus the O(M·N) neighbor loop from #4.

**Why it matters** — iPad perf. This is the single most allocation-dense
per-frame path in the live loop.

**Approach** — a numeric/pooled variant of the FIELD/FEED path if iPad
budgets bite; prove parity against the current path via fixtures.

**Acceptance** — pooled variant produces identical output on the fixture
scenes; allocation count on the path drops by an order of magnitude.

**Relates to** — #4 (the O(M·N) loop), #1183, #1199, #1200, #1227.

## 22. Growth draws depend on audio history (S)

**What/where** — `sample/growth.js`: `cellsPerTick` varies with
`audioEnergy`, changing sequential-stream draw counts, so the aggregate at
(seed, tick) depends on audio history. Documented as intentional — stills
(audioEnergy=null) stay deterministic — but a live-grown form can never be
reproduced in a still.

**Why it matters** — stills-vs-live parity (#1185). The gap is intentional,
but it should be pinned, not just documented.

**Approach** — keep as-is; pin the null-audio reproducibility explicitly in
`growth.selfcheck.mjs`.

**Acceptance** — selfcheck asserts identical growth output at (seed, tick)
with `audioEnergy=null` across runs.

**Relates to** — #1185, #1144 (audio-gating discipline), #1197.

## 23. Dead code: fieldInvariants() and resetQuadtreeSignal() (S)

**What/where** — `fieldInvariants()` in `tracks/feedOps.js` has zero
references anywhere (including selfchecks); `resetQuadtreeSignal()` likewise
has no callers.

**Why it matters** — hygiene. Dead code rots into misleading documentation;
`fieldInvariants()` was presumably built for the feed diagnostics.

**Approach** — remove, or wire `fieldInvariants()` into the feed
diagnostics it was presumably built for.

**Acceptance** — no zero-caller exports in the kernel, or they're wired to
their intended consumer.

## Healthy findings (confirmed by the audit)

- No `Math.random`/`Date.now` leaks in the deterministic paths (only
  `patchDiag.mjs` diagnostics and the `readSmoothedBands` throttle cache, both
  correctly outside the seed discipline).
- All 23 on-disk kernel selfchecks are registered in `selfcheck.manifest` —
  no orphans.

## Suggested build order

1. **Dish-contract prerequisites** — #2, #3, #11. Doing them first makes
   every later module cheaper to add; they're required by #1183's spec.
2. **Pin before you optimize** — #18 (selfchecks on the hot path), #8
   (channel registration), #17 (version enforcement). These are the proving
   ground for the perf work.
3. **iPad perf** — #1, #4, #6, #14, #21. Biggest frame-time wins; #4 needs an
   intent decision first (units bug vs intentional).
4. **Stills parity** — #7, #10, #22 feed #1185 directly.
5. **Hygiene** — #5, #9, #12, #13, #15, #16, #19, #20, #23. Small, safe,
   do-anytime.
