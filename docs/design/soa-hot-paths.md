# DESIGN (deferred) — Struct-of-arrays hot paths

## Goal

Replace per-frame small-object churn with pooled typed arrays,
end to end: placement → liveResolve → render. The kernel research
found ~5×(M+N) small-object allocations per frame on the FIELD/FEED
path alone (`gl/liveResolve.mjs`), plus per-point closures and
per-frame `Float32Array` allocations in the feed delay slots. This
design makes flat columns the kernel's native data model.

## Why later (deferred)

The dish core's named point sets (`points.marks`, `points.seeds`, …)
are the natural SoA columns. Building SoA before the dish lands means
writing the data model twice — once against today's ad-hoc structures,
once against the dish. It also needs two open questions resolved
first: the neighbor-radius question (kernel research idea #4 —
`FIELD_RADIUS = 0.35` in normalized space degrades the spatial hash to
near-all-pairs; the SoA neighbor loop is where that code lives, so the
radius semantics must be decided before the loop is rewritten), and
the cache-discipline unification (idea #13 — one `makeSmallCache(n)`
helper becomes the pool implementation).

## Proposed architecture

New home: `app/src/engine/kernel/soa/`.

- `pointSet.js` — `createPointSet(capacity)` returns
  `{ x: Float32Array, y: Float32Array, vx, vy, slot: Uint16Array,
  energy: Float32Array, id: Uint32Array, family: Uint8Array,
  source: Uint16Array, count: number }`.
  The `id`/`family`/`source` columns are the dish §1b addressability
  requirement — identity as columns is free at placement, exactly as
  the spec's cost note demands.
- `pools.js` — `acquirePointSet(family, minCapacity)` /
  `releasePointSet(set)`. One unified pool (absorbs idea #13's five
  cache disciplines). Acquire contract: columns are either zeroed or
  fully overwritten by the writer before read — documented invariant,
  asserted in debug builds.
- Migration in slices, one hot path per PR:
  1. `trackGraph.applyField`/`applyField` no-op path (idea #6) becomes
     a column-count check returning the input set untouched.
  2. `liveResolve.mjs` FIELD/FEED path: replace the `toNorm` maps ×2,
     per-point closures in `forNeighbors`, and item map with column
     loops over the point sets.
  3. Feed delay slots (`feedDelay.js`, `feedLive.js` rasterize):
     double-buffered column pairs instead of allocate-then-copy
     (absorbs idea #14).
  4. Placement orchestrator writes columns directly; sampler ctx gains
     an optional column-writing mode while keeping the `{x, y}` return
     for legacy samplers.
- Boundary adapters: `toObjects()` / `fromObjects()` at module
  boundaries during migration, deleted when the last object-path
  caller converts. No permanent dual data model.

## Dependency on the dish core

The dish `points` sets ARE the SoA buffers. Module `reads`/`writes`
declarations become column reads/writes, which means the governor can
see data flow statically and the worker/GPU designs below get their
transfer/upload lists for free. The dish's "written once at placement,
read per frame" rule (§1) is the SoA lifetime contract.

## Effort

L. Touches the hottest code in the repo; must be sliced per path
(one PR per slice) or review becomes impossible.

## Risks

- **Byte-identical law (primary risk).** SoA reorders loops; float
  summation order changes bits. Mitigation: per-path golden fixtures
  captured BEFORE the slice lands, compared after. Any path that
  cannot be made bit-identical gets a versioned behavior flag —
  never a silent change.
- **Determinism.** Pooled buffers reused across frames are a
  nondeterminism source if a writer reads a column it didn't fully
  write. The acquire contract (zeroed-or-overwritten) plus debug
  assertions are load-bearing, not nice-to-have.
- **Half-migration.** The `toObjects()` adapters must have a kill
  list; each slice PR deletes the adapters for the paths it
  converts.

## Unlocked after it

Worker transferables (no repack), GPU upload without staging copies,
WASM boundary with zero-copy columns, replay snapshots as raw buffer
dumps, and a measured 2–5× CPU headroom on iPad-class hardware —
which is what makes the heavier dish slices (weather-as-fields,
contact shadows) affordable.
