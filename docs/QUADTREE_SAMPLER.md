# QUADTREE — adaptive scatter sampler spec

**Status:** SPEC ONLY. No build, no issues, no PRs. Written for Matt's approval — plain language, no code. Scope locked 2026-09-30 in #721; this doc does not re-scope it.

## Concept recap

A quadtree-based sampler: recursively subdivide the plate, scatter instance marks at the leaf cells, with density driven by subdivision depth. Detail goes where it's interesting — dense clusters track hot regions, calm areas stay sparse. Adaptive detail where it matters. It joins the sampler family (#673–#676: phyllotaxis, truchet, voronoi, l-system) as a **System** — how bodies are placed — alongside them in the SYSTEMS row. The concept surfaced from teamLab-people research (opheliagame's quadtree generative grid gist).

## What quadtree IS

Quadtree does not invent a new render feature. It answers the same question every sampler answers — "where is point i" — but hierarchically: it builds a tree over the plate, subdivides cells that score high on one "interesting" signal, then deals the instance marks out to the leaves, more marks per unit area where the tree ran deeper. The tree is a placement-time structure, rebuilt on a slow tick, not per frame.

**The one rule (from the issue, non-negotiable):** relax, never freeze. If audio drops out, the audio term fades to zero and the tree relaxes to field-only. The piece is never static because a driver quit — subtle motion and vibe always.

## Architecture

**Where it lives.** Three pieces, following the sampler family's established shape:

1. **The tree module** (`engine/kernel/sample/quadtree.js`, new) — pure quadtree: build, subdivide, leaf enumeration. No React, no audio imports. It takes an interestingness function and returns leaves. Same module-purity discipline as `growth.js` and the voronoi mask.
2. **The interestingness module** (same file or a sibling) — the audio term, the field term, and the blend. This is the only part that touches the Stimuli bus, and it touches it through one read: `readMeterBandLevels()`.
3. **The sampler function** — `registerSampler('quadtree', quadtree)` in `registry.js`, plus a `LAYOUT_MODES` entry (`{ id: 'quadtree', name: 'quadtree', glyph: 'quad' }`). It follows the lsystem/voronoi pattern exactly: build the structure once per key, cache it, read points off it per item.

**The sampler ABI contract.** Every sampler is `(ctx) => { x, y, t? }` with `ctx = { i, count, w, h, rng, jitter, seed, seedOffsets, ...params }`. Quadtree keeps this contract: per item `i`, it returns a point. The tree itself is built once per cache key and shared across items — the item's job is only to pick its leaf and jitter inside it.

**Plumbing.** Per-sampler params ride ctx the way `lsysDepth` does: defaults in `DEFAULT_LAYOUT_PARAMS`, ranges in `PARAM_SPEC`, threaded through `buildPlacements` into ctx. Three params: `quadAudio` (audio term weight), `quadField` (field term weight), `quadDepth` (max depth). The tree build also needs the audio snapshot and the noise-field seed — both folded into the cache key (below).

**Cache discipline.** The family rule: WeakMap for grid-keyed, small evicting Maps for seed-keyed (the voronoi/lsystem pattern — no unbounded growth, no cross-caller stomping). The quadtree cache is keyed by `(seed, spatial offset, quadDepth, quantized audio snapshot, field time bucket)`. Audio is live, so the snapshot is quantized to coarse steps (e.g., bands rounded to 2 decimals) — close enough that the tree doesn't rebuild on noise, stable enough that it doesn't shimmer.

## The interestingness signal

One signal per cell, blended from two terms. Both terms read 0..1. The blend is a straight weighted mix, normalized.

**Audio term — spectral geography.** Here is the constraint the issue didn't fully anticipate: **the Stimuli bus is global, not spatial.** `readMeterBandLevels()` returns seven band levels (`sub, bass, mud, mids, edge, pres, air`) for the whole mix — there is no per-region audio field to read. So the design maps spectrum onto space: a cell's audio hotness is the band energy at the cell's position on a **vertical spectral geography** — sub at the bottom, air at the top, the five bands spaced between. A kick-heavy passage makes the floor of the plate interesting; a bright passage makes the ceiling interesting. In prose: audio term of a cell = the band level whose spectral address is nearest the cell's normalized y, smoothed across neighboring bands so there are no hard seams. The global `rms` gates the whole term — near-silence reads as near-zero everywhere, which is what lets the relax behavior work.

**Field term — noise ridges.** The kernel already has `makeNoiseField(seed, { freq, octaves })`. The field term of a cell = the ridge measure of the noise field at the cell center: high where the field's gradient is steep (the ridges), low in the flats. Ridges, not peaks — ridges are the lines the eye follows, and subdividing along them draws the clusters into filaments instead of blobs. The field drifts slowly in z (the "always alive" part — the tree breathes even with no audio).

**The blend.** `interesting = (quadAudio × audioTerm + quadField × fieldTerm) / (quadAudio + quadField)`, with both knobs at 0 falling back to field-only at a floor weight (a zero signal subdivides nothing; the piece must never go flat). The knobs are 0..1, default 0.5/0.5 — the issue's acceptance is that the knobs "visibly shift the tree between audio-led and field-led."

## Subdivision

**Algorithm.** Start with the whole plate as the root cell. Score it. If the score clears the threshold and depth < maxDepth and the leaf budget isn't spent, split into four and recurse. Standard, greedy, top-down.

**Stopping criteria (all three must hold to keep splitting):**
- interestingness ≥ threshold (builder's call; ~0.35 as a starting point),
- depth < `quadDepth`,
- total leaves < leaf budget (~1024).

**Who owns the numbers.** The builder, inside the perf budget — stated here so it's a box, not a blank check:
- Tree build must complete in well under one frame's placement slice (placement already runs async/batched; the tree rides that).
- Worst case is bounded by construction: maxDepth 6 with the leaf budget caps the tree at ~1024 leaves regardless of the signal. A pathological signal (everything interesting) degrades to a uniform grid, not a hang — the leaf budget is the hard ceiling, same honesty as voronoi's attempt cap.
- Recommended defaults: maxDepth 5, threshold ~0.35, leaf budget 1024. (Matt's call on the default — open question 1.)

**Rebuild cadence.** The tree rebuilds on: seed/param change, and a slow tick (~4 Hz) while audio is live. Not per frame — the bands are already ballistics-shaped (attack/release in the feed), so a 4 Hz tree tracks musical change without shimmering. When audio is off, the tick idles: the field term still drifts, so the tree relaxes rather than snapping.

## Leaf scatter

**Density by depth.** The issue: "denser marks where subdivision runs deeper." Density, not count — a deep leaf is small, so it gets fewer marks in absolute terms but more per unit area. Allocation: each leaf's share of `count` is proportional to `2^depth × area(leaf)`. Worked example: a depth-3 leaf has 1/64 the area of the root but 8× the density weight, so it receives 1/8 the marks of a root-sized region — eight times denser per pixel. The total dealt is exactly `count`, never more — the tree distributes the governor's budget, it never inflates it.

**How an item finds its leaf.** Items are dealt round-robin across leaves in a seed-stable order (leaf index from `hashU01`, same channel discipline as the family's other hashed decisions). Inside its leaf, the item jitters by `ctx.rng` within the cell bounds — the family's standard jitter contract, so the JITTER knob keeps working.

**Seed determinism.** With audio off (or frozen), the same seed + params produce the identical tree and identical points — the tree build uses only `hashU01`/`rngForIndex` streams, never `Math.random`, never wall-clock. With audio live, the tree follows the music (non-deterministic by nature); the *field-only* tree is the deterministic backbone underneath.

## Dropout — relax, never freeze

Numerically, this is the whole behavior:

1. `readMeterBandLevels()` returns null (audio off / denied) or all bands read ~0 (silence).
2. The audio term doesn't snap — it's smoothed with a ~1.5s release toward zero. The tree's audio-driven subdivisions ease out over a few rebuild ticks; clusters thin rather than vanish.
3. At zero audio term, `interesting = fieldTerm` (the blend's zero-guard). The tree is now the field tree: ridges, drifting slowly, subtly alive.
4. No input source selected at all → same as silence: field-only from the start.

The design principle, stated once: **every term in the blend has a defined zero, and zero is always a living state.** There is no code path where "no signal" means "no tree."

## UI

Minimal — new features earn their surface. Three knobs, living where the other sampler params live (the layout/system section, beside `lsysDepth`-style params — **not** a new panel, not the Director):

| Knob | Range | Default | What it does |
|---|---|---|---|
| AUDIO | 0..1 | 0.5 | weight of the spectral-geography term |
| FIELD | 0..1 | 0.5 | weight of the noise-ridge term |
| DEPTH | 1..6 int | 5 | max subdivision depth |

**Readouts:** none in v1. No tree visualization, no leaf counts on the face — the tree's state is visible in the scatter itself, which is the honest readout. (A visible grid overlay is the explicitly-out follow-up issue; it becomes the tree's first client when it lands.)

## Perf

- **Instance cap:** the tree deals exactly `count` marks — the governor's existing currency (`maxCount` 800/tier, `MAX_ABSOLUTE_COUNT` 4096). The tree cannot inflate the budget; density-by-depth is a distribution.
- **Tree cost:** bounded by the leaf budget (~1024 leaves); a build is a few thousand cell evaluations of cheap arithmetic (band lookup + noise sample). Placement-time only, on the slow tick — never in the per-frame hot path.
- **Memory:** the tree is a flat leaf array (no pointer chasing), cached per key with the family's evicting-Map discipline.
- **Governor interaction:** none in v1 — explicitly out. The tree does not drive LOD or culling, and the governor does not know the tree exists. (Later phase, separate issue.)

## Freeze / stills

- **Freeze** holds the loop clock; the tree is a placement structure, so it holds with everything else. The slow tick pauses — no rebuilds while frozen.
- **Stills:** the baker evaluates with the audio term captured at bake time (the live snapshot, quantized like the cache key). Same seed + same bake moment = same still. Field-only when audio was off. One evaluator, two callers — the kineme rule.

## What quadtree is NOT

- Not a renderer. It places points; it doesn't draw cells, grids, or guides (that's the follow-up overlay issue).
- Not the governor. It doesn't cull, thin, or LOD anything — it spends the budget it's given.
- Not a fourth taxonomy noun. It's a **System** ("how bodies are placed"), writes `layoutParams.mode`, sits in the SYSTEMS row. Face copy follows the taxonomy bans (no "preset," no "vibe").
- Not a second audio path. It reads the Stimuli bus through `readMeterBandLevels()` — the same tap the meter reads — never a private analyser.

## Resolved decisions (locked 2026-09-30, from #721)

1. **One blended signal** — audio term + field term mixed by UI knobs into a single interestingness score.
2. **Relax, never freeze** — audio dropout fades the audio term to zero; tree relaxes to field-only.
3. **Scatter at the leaves** — density by depth; max depth and per-cell counts are the builder's call inside the sampler perf budget.
4. **Grid overlay is a separate issue** — quadtree grid is its first client, not this issue.
5. **Governor LOD/culling is a later phase** — explicitly out.
6. **No build until Matt greenlights** — this doc is the greenlight package.

## PR slices

Four stacked slices, eval-ready. Each: acceptance check first, watch it fail, smallest implementation, green, commit. Do not file until Matt says build.

**Slice 1 — quadtree core + selfcheck.**
Pure tree: build, subdivide-by-callback, leaf enumeration, cache. Interestingness is an injected function (a stub gradient in the selfcheck). No audio, no sampler registration.
*Acceptance:* selfcheck proves determinism (same seed → identical leaves), depth bound (no leaf deeper than maxDepth), leaf budget (pathological all-interesting signal → ≤1024 leaves, degrades to uniform grid), and cache-key separation (different seeds → different trees).

**Slice 2 — interestingness: audio + field + blend.**
The audio term (spectral geography over `readMeterBandLevels()`), the field term (noise ridges via `makeNoiseField`), the blend with the zero-guard, the ~1.5s audio release.
*Acceptance:* selfcheck proves null-audio → field-only tree; all-zero bands → relaxes to field-only (not empty, not frozen); blend extremes (AUDIO 1/FIELD 0 vs the reverse) produce visibly different trees from the same seed; the release is monotonic (no pops in the term's decay curve).

**Slice 3 — leaf scatter wiring.**
`registerSampler('quadtree', …)`, the `LAYOUT_MODES` entry, density-by-depth dealing, ctx params (`quadAudio/quadField/quadDepth`) through `DEFAULT_LAYOUT_PARAMS` → `PARAM_SPEC` → `buildPlacements`, taxonomy face-name check.
*Acceptance:* total marks dealt == `count` exactly (no budget inflation); same seed + params → bit-identical placements; deeper leaves measurably denser per unit area in the selfcheck; the mode appears in the SYSTEMS row and writes `layoutParams.mode`.

**Slice 4 — UI knobs.**
AUDIO / FIELD / DEPTH in the layout section beside the other sampler params. No readouts, no new panel.
*Acceptance:* knob drags re-tune the live tree (screenshot: AUDIO-led vs FIELD-led from the same seed); DEPTH 1 reads as a coarse grid, DEPTH 5+ as fine clustering; defaults 0.5/0.5/5.

## Open questions for Matt

Answer these and the spec is buildable. My recommendation is under each — your call stands.

1. **Max depth default: 5?**
   *Recommend: 5.* 4⁵ = 1024 potential leaves matches the leaf budget exactly; depth 6 quadruples the worst case for detail the eye can't resolve at placement scale.

2. **Should the tree visualize in-app during tuning?**
   *Recommend: no.* The scatter is the readout; a grid overlay is the explicitly-out follow-up issue and becomes the tree's first client. Keep v1's surface to the three knobs.

3. **Knob placement: layout section, or the Stimuli panel (since one term is audio)?**
   *Recommend: layout section, beside the other sampler params.* The knobs tune a System (placement), not the audio bus — the bus is only read, never configured here.

4. **Audio→space mapping: vertical spectral geography (sub at the bottom, air at the top), or something else?**
   *Recommend: vertical.* It reads like every spectrum analyzer ever made — bass pools at the floor, brilliance at the ceiling. Radial (bass at center) is the alternative; it photographs well but teaches the eye a new metaphor.

5. **Tree rebuild cadence: slow tick (~4 Hz) or on every placement rebuild?**
   *Recommend: slow tick + on param/seed change.* The bands are ballistics-shaped already; 4 Hz tracks musical change with no shimmer, and placement rebuilds stay cheap.

6. **Stills with audio live: bake with the captured audio snapshot, or always field-only?**
   *Recommend: captured snapshot.* The still should be faithful to the living piece at the bake moment; field-only stills would systematically under-represent audio-led work. Same seed + same bake = same still either way.
