# STAGING REPORT — Phase 2 S8: the glitch (render-side corruption, bones stay true)

Branch `ember/skeleton-s8` on base `d8009ee9` (the S1 publish tip). LOCAL ONLY — no push, no PR.
Contract: Matt's Phase 2 brief + `skeleton-creature-plan-2026-10-16.md` (S8 slice text, addendum ruling 3)
+ `docs/design/creatures-spec.md`. S2–S7 are staging concurrently; this slice is built against S1's
committed interfaces only, and its integration points with the earlier passes are marked below.
(Note: this file overwrites the S1 staging report carried in the base tree; S1's report is preserved in
the KC goal's hidden_files and in `~/workspace/kc-s1-build`.)

## What shipped

- **`app/src/engine/glitch.js`** (new) — the data creature's corruption, as pure render-side rules.
  - `corruptionAmount(band)` — ruling 3 as a function: at or below the Tighten bar (0.72, the same bar
    S5's pose mapping uses) there is **no** corruption — Normal and Relax are both truth — and above it
    the amount grows quadratically to 1 at band 1. A missing/non-finite band corrupts nothing.
  - `glitchFrame({seed, creatureId, frameIndex, band, seedOffsets})` → the frame's corruption params
    (`amount`, `seam`, `split`), or **null** at amount 0. Every draw is `hashU01` on a new registered
    `'glitch'` kernel channel (rides the SPATIAL seed-offset group, like `'skeleton'`), index-keyed by a
    hash of (creatureId, frame, part) — no sequential stream, no clock, no unseeded chance.
  - `applyGlitch(items, frame, gf)` — the four operators over one creature's finished item stream:
    **strip slip** (horizontal strips in creature-local space, per-strip seeded slip along local X, with a
    per-strip gate draw so corruption grows in density as well as magnitude), **mirror-seam drift** (items
    left of the seam shift −seam, right +seam, by geometry not by name), **channel split** (material stamps
    — body + wings, not the halo (its colour is the ground's) and not the scales (noise at that size) —
    grow red-only/blue-only ghost copies at ±split, 0.6 alpha), **hatch sorting** (the creature's fine
    marks trade slots in the draw order via seeded swaps, count graded by amount; zero swaps = the
    untouched order). Pure: input never mutated; a null/zero frame returns the input array itself.
  - `glitchItemsHash(items)` — the parity currency: FNV-1a over canonical item fields, quantised to
    1e-4 (the skeletonHash discipline).
- **Wiring** (`engine/creature.js`, one gated hunk + one import): each pin's finished items are collected
  per-pin and, when `glitchFrame` returns a frame, passed through `applyGlitch` with the creature's root
  frame (pin + hover + ground offsets, hover rotation). The band arrives as **`input.dishGlitch[i]`** —
  a per-pin band scalar in the `dishTraits`/`dishLimbs` shape. **Nothing supplies it today** (see
  integration points), so in production every frame takes the null path and the moth is byte-identical.
  The skeleton build above it is untouched and upstream: corruption cannot reach the bones.
- **Cost registration** (`engine/kernel/costRegistry.mjs`, APPEND-ONLY marked block at the end of the
  file — the only edit to that file): `creature:glitch`, tier 0, 0 bytes, 0 ms, with the reasoning in the
  block comment (below, design calls).
- **Selfcheck** (`engine/glitch.selfcheck.mjs`, registered in `app/selfcheck.manifest` right after
  skeleton's): band mapping, frame determinism + channel group, operator re-derivation (the two wings
  share a strip, so their offset difference is exactly 2×seam — the slip cancels; local Y never moves;
  ghost colours/offsets/alpha exact), goldens, builder wiring, truth invariance, cost print.
- **`kernel/rng.js`**: one registry line — the `'glitch'` string channel → `'spatial'` group (the #1238
  registry requires it for any observed channel).

## Truth-invariance proofs (all asserted in the suite, not sampled)

- **Zero corruption is the uncorrupted path**: a builder fed `dishGlitch: [0.5]` (Normal) or `[undefined]`
  emits items `deepEqual` to the no-glitch builder's, all 26, through the real builder path.
- **Relax restores byte-exactly**: a builder that spent its growth at band 1 and then relaxed to 0.2 emits,
  on its final frame, items `deepEqual` to the never-glitched builder's — corruption leaves no residue in
  the items or in builder state.
- **The bone hash is corruption-invariant**: with `wantSkeletons` on, a fully corrupted builder's
  `lastSkeletons()[0].hash` equals the clean builder's — and still equals S1's golden **`7944cd55`**.
- **Determinism**: two builders fed the same take corrupt identically (hash-equal); the corrupted fixture
  is pinned — hand-fixture corrupt hash **`0e30fa40`**, clean **`77d42dc3`**, builder moth at full Tighten
  **`c50e37b2`** — and the hash moves when the frame index moves.

## Cost evidence (sandbox numbers, indicative only)

The corruption has no GPU pass of its own; its cost is resolver CPU plus item count (+2 ghost stamps per
material item, ≤ 12 per creature at full corruption — a fully corrupted 4-creature stage stays far under
the 2000-item global cap). Measured on this sandbox (shared, loaded — treat as orders of magnitude):

- Builder level (my suite's print, 4 creatures, hind pairs in): clean append **0.868 ms/frame**,
  glitch@Tighten **1.553 ms/frame** — the corruption transform itself is the difference, ≈ +0.7 ms of
  sandbox CPU at the 4-creature cap, worst case.
- Resolver level (resolverProbe's own child pattern, 4 creatures, 300-mark layer): clean mean
  **4.151 ms**, glitch@Tighten mean **4.163 ms** — the delta is inside this sandbox's run-to-run noise
  (p95 13.8 vs 12.8 ms, same story).
- `resolverProbe.selfcheck` itself passes (0 creatures 2.37 ms, 4 creatures 2.86 ms mean on this box).

The authoritative bar — the 2.0 ms GPU/frame @1080p iPad-class creature budget — is measured by the
#1622-lineage harness on real hardware at publish time, as with every slice; nothing here registers a GPU
pass for that harness to time, which is itself the S8 cost claim: **cheapest type in the system**, as the
plan predicted.

## Integration points for the stack (marked, per the brief)

1. **Band source (S5)**: `input.dishGlitch` is supplied by nothing today. S5 owns the band reader
   (hysteresis in one place, #1636); when it lands, the liveLoop input assembly feeds this field per pin
   (and, like `dishTraits`, it must be recorded with the take so replays corrupt identically — the
   resolveTap already taps frame inputs generically). The frame index the corruption keys on is the
   builder's per-creature age (frames since formed) — replay-exact today; if S5 adds a resolver frame
   counter to the input, `glitchFrame`'s key swaps to it in one place.
2. **Skinning (S2)**: the operators act on whole stamps because stamps are the render atoms today. When
   the mesh warp lands, the same params (per-strip slip field, seam, split — all computed in glitch.js)
   can drive per-vertex slip in the skinning path instead; no signature change needed.
3. **Composite (S4)**: hatch sorting keys on the house scatter-path convention (`marks#` in the item
   key). S4's engraving marks join the set by carrying that segment; a shader composite may alternatively
   take `seam`/`split` as per-type uniforms — the values are computed here either way.
4. **Type routing (S6/S7 and the type system)**: there is no creature-type selector yet — the moth is the
   only body. `dishGlitch` is deliberately a *band* field, not a type field: when type routing lands, a
   glitch-typed pin is simply one whose items route through `applyGlitch` with its band; moths, robots
   and growths never see the field. Matrix rain stays rejected: this is a body whose material corrupts,
   not a field effect.

## Design calls (flagged)

- **Normal band = zero corruption.** "Tighten corrupts, Relax restores" leaves the middle unstated; I
  read Normal as truth (corruption is a Tighten symptom, and S5's poses likewise only leave rest past
  the bars). The quadratic ramp means a hair past 0.72 corrupts almost nothing (asserted: order untouched,
  sub-pixel slips).
- **Tier 0 registration.** The registry's coverage gate requires every non-tier-0 declaration to appear
  in the FX measured-costs sweep; corruption is not an FX shader pass and cannot be measured by that
  sweep honestly. Tier 0 ("structural, never shed") fits the semantics — the corruption IS the type's
  band response, not an optional pass the governor sheds — and is the gate's own exempt category. If the
  coordinator prefers a tier-3 declaration with a measuredCosts path, that is a publish-time call; the
  declaration's notes state the reasoning in the registry itself.
- **Ghosts skip halos and marks.** The halo's colour is the ground/tile colour — channel-isolating it
  would fringe the background's colour, not the creature's material. Marks at 0.26 scale: a ±7 px split
  on a 9-unit diamond reads as scatter, not split; they still slip, drift and re-sort.
- **Frame index = builder age.** See integration point 1: a real frame counter does not exist in the
  resolver input yet, and `liveLoop.mjs` is a one-writer file other staging lanes are touching.

## Parity

Every pre-existing creature surface passes: `creature.selfcheck` (goldens), `skeleton.selfcheck`,
`performanceCreatures` (replay), `resolverProbe`, `mathRandomGuard` (15 allowlisted files, 25 sites —
unchanged; glitch.js adds no banned token, and its own suite re-scans it in the guard's pattern),
`kernel/rng` (#1238 — registered channels), `gl/costTiers` (the registry gate, with the S8 block live).

## Full manifest sweep (449 suites) — with base-identity proofs

Ran the full `app/selfcheck.manifest` (449 commands), per-suite, continue-past-failure:
**428 PASS, 21 non-pass**. Every non-pass was then re-run solo on this tree, and — where it
still failed — on a pristine `d8009ee9` checkout. All 21 are sandbox-environment effects, none
is a code effect of this slice. Context that matters: four-plus staging lanes (S2–S8) swept
simultaneously on one box, load average 10–19 for ~2 hours, one VM restart mid-sweep; the
sandbox's headless Chromium died under that load for every lane, and wall-clock budget
assertions flipped both ways on both trees. CI is authoritative for all of these.

**Base-identical failures (fail the same way on pristine `d8009ee9`):**

- `kernel/bake/swarmWasm` FAIL (1 s) — rc=1 on both trees, output byte-identical modulo tree
  path (cargo absent in this sandbox; S1's known exception).
- `fx/rollSafety` TIMEOUT (301 s) — rc=124 on both trees; logs identical modulo PID/path: pure
  helpers + 300 seeded rolls pass, then the browser dies
  (`page.evaluate: Target page, context or browser has been closed` at `glDriver.evaluateChunked`)
  and the process hangs to the cap. S1's known non-completion.
- `gl/accum` TIMEOUT (497 s in sweep) — solo on both trees: **V8 heap OOM abort, rc=134**,
  `FATAL ERROR: Ineffective mark-compacts near heap limit` on both. S1's known exception.
- `gl/debug/debug` FAIL (42 s) — `page.goto: Timeout 30000ms exceeded` on the local debug
  page. At base: passed once (95 cases, 31 s), failed once with the identical TimeoutError.
- `gl/composite` TIMEOUT — solo rc=124 on both trees; all pure checks pass on both, then the
  same browser death at `evaluateChunked`.
- `gl/canvasSizes` TIMEOUT — solo rc=124 on both trees; identical
  `canvasSizes.selfcheck FAILED: page.evaluate: Target page…` line in both logs.
- `gl/phase6` TIMEOUT — solo rc=124 on both trees, browser-death signature.
- `pattern/patternRender` TIMEOUT — solo rc=124 on both trees; **16 `[ok]` checks pass, then
  the identical browser death**, in both logs.
- `gl/vortex` FAIL (2 s) — a wall-clock budget assertion (`step … ms exceeds the loose
  budget`, fail above 2 ms). Solo: **fails on pristine base** (4.107 ms; rc=1 twice),
  **passes on this tree** (19 checks).
- `gl/livingMotion` FAIL (7 s) — the same kind of assertion (`the floor costs … ms a frame
  at 800 marks (budget 2 ms)`). Alternating solo runs: base fails at 4.37 ms and 4.71 ms,
  this tree fails at 4.42 ms and passes once — a load coin-flip, same magnitude both trees,
  in a code path this slice does not touch.

**Sweep-only timeouts that pass solo on this tree** (all strangled by the shared load; several
also pass solo at base, noted where run): `gl/regionPlayback` (527 s solo), `gl/exportStill`
(540 s), `assets/regionBake` (passes; base passes in 335 s — a ~5-minute CPU bake that writes
no output until done), `curator/miner` (160 s), `curator/prospecting` (240 s),
`curator/variants` (263 s; base 320 s), `pattern/rasterFast` (235 s; base 140 s),
`pattern/elements` (139 s; base 102 s), `gl/grainFinish` (148 s; base 165 s),
`gl/resolverProbe` (passes solo), `loot/lootScan` (passes solo).

Nothing in the non-pass set imports, or is imported by, the creature/glitch path except
`resolverProbe` (passes solo) and the creature family suites — which all pass in the sweep
itself: `engine/glitch`, `engine/skeleton`, `engine/creature`, `gl/performanceCreatures`,
`gl/costTiers`, `kernel/rng`, `mathRandomGuard` all PASS under full load.

## Verification

- `node src/engine/glitch.selfcheck.mjs` — OK (band mapping, frame determinism, operators, goldens,
  builder wiring, truth invariance, guard) + cost print above.
- Family: skeleton, creature, kernel/rng, mathRandomGuard, gl/costTiers, performanceCreatures,
  resolverProbe — OK.
- `npm run build` — green (after the worktree's standard `npm install`; the first attempt failed on the
  missing local install — `@tauri-apps/api` unresolved via a sibling worktree's modules — an environment
  artifact of the fresh worktree, not of this change). ESLint — 0 errors on every touched file.
- UI freeze honoured: no panel, no readout, no surface change of any kind.
