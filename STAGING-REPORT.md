# STAGING REPORT — Phase 2 S1: skeleton, mirror, debug draw

Branch `ember/skeleton-s1` on `origin/main` `cb016db3`. LOCAL ONLY — no push, no PR.
Contract: Matt's S1 brief + `skeleton-creature-plan-2026-10-16.md` (findings, slice plan, the eight rulings).

## What shipped

- **`app/src/engine/skeleton.js`** (new) — the pure skeleton. `buildSkeleton({seed, creatureId, plan,
  attach, pose, seedOffsets})` → `{planId, headBone, bones, hash}`. Spine of 3–5 segments between the body's
  bottom point and the H point; wing chains (the moth plan: fore + hind, 3 bones each — shoulder→elbow→tip)
  built on the LEFT only, then mirrored by `mirrorBone` (pure coordinate negation — bit-exact by
  construction, not by epsilon). Bones carry everything the approved full-mesh-warp skinning (ruling 1)
  will bind to: rest-pose geometry (`localAngleDeg`, `length`), the unit direction, chain/segment indices,
  side, parent, and the H/L marker. Plans are data: any chain count grows (ruling 5, every marked L),
  hind chains follow the pair amount, a chainless plan is a spine alone. Randomness comes only from the
  kernel RNG keyed (seed, creatureId, partId) on a new registered `'skeleton'` string channel
  (`kernel/rng.js` — the #1238 registry requires it); pose comes from the caller; no clocks anywhere.
- **Wiring under the moth** (`engine/creature.js`, additive only): the builder builds each formed moth's
  skeleton from the SAME attach points and the SAME angles the recipe already computes (fore/hind spread,
  beat, pair amount — one shared `hindAmount` const now feeds both), places it with the root transform,
  and publishes per-frame via `lastSkeletons()` (the `lastWingBeat()` pattern). Drawn items are untouched.
  `gl/liveResolve.mjs` forwards the frame's skeletons next to `lastFrameMotion`; that is all the GL side
  knows.
- **Debug draw** (`panels/SkeletonOverlay.jsx` + `panels/skeletonDebug.js`, mounted in
  `panels/CanvasPanel.jsx`): an SVG overlay over the live canvas, mounted ONLY with `?debug=skeleton`
  (the `?debug=stress` culture) — zero cost, zero pixels with the flag off, no new panel or readout
  (UI freeze honoured). It reproduces the render mapping exactly (viewBox + `xMidYMid meet` = the canvas's
  `object-fit: contain`; the same zoom-about-centre + pan transform liveLoop applies). Spine amber,
  fore teal, hind violet, head joint ringed red with its H, chain roots dotted with their L. Known limit,
  documented in the file: the loop's breath sway is not applied, so under heavy BREATH the bones can sit a
  few px off the marks.
- **Selfcheck** (`engine/skeleton.selfcheck.mjs`, registered in `app/selfcheck.manifest` after
  creature.selfcheck): determinism (two builds deep-equal, same hash), seed/trait/creature sensitivity,
  mirror exactness (every right bone `deepEqual` to `mirrorBone(left)` + an independent atan2 re-derivation
  to 1e-9 + spine exactly on-axis), markers (fixture head bone ends exactly on the top point; L on all four
  chain roots; a `role:'H'` point beats the defaults), coincidence with the real moth (fore roots equal
  `pointToward` on `org_pod_02`'s actual attach points), plan generality (3 chains/side, hind off, spine
  only, empty attach), placement (`transformSkeleton` identity is exact), builder wiring (full grow-in
  publishes a finite 10-bone world skeleton AND the drawn moth is still exactly 26 items; unformed
  publishes nothing), and the determinism guard in mathRandomGuard's pattern (source scan of skeleton.js,
  comments stripped: no `Math.random` / `Date.now` / `performance.now`).

## Depth audit — FLATTEN (the brief's named risk, decided before building on it)

`HIER_MAX_DEPTH = 4` counts an item's ancestor chain (`hierarchy.js`, `resolveTransforms`).
Counted honestly, a nested bone hierarchy breaks it: a 5-segment spine is depth 5 by itself, and a
3-bone wing chain hanging off spine joint 3 reaches depth 6. **Decision: flatten.** The skeleton does
its own forward kinematics and emits creature-local world geometry; the hierarchy is not used to nest
bones at all, so no cap is approached and `hierarchy.js` / `HIER_MAX_DEPTH` are untouched. When later
slices hang parts on bones, each part parents to ONE bone item at depth ≤ 2. The kill criterion is NOT
triggered: the hierarchy can hold bones (parent × local-transform composition works); it just cannot
hold them nested at the brief's chain lengths — flattening is the brief's own named remedy.

## H/L data finding — roles do NOT exist in attach data (design call, per the brief's fallback)

Attach points are `{x, y}` only (`engine/assetAttach.js`, `MAX_ATTACH = 4`; `engine/autoAttach.js`
derives top/right/bottom/left extremes; `engine/svgAttach.js` re-derives author points positionally).
No role field exists anywhere. The skeleton therefore defines the expectation — a point MAY carry
`role: 'H' | 'L'`, and `resolveMarkers` honours it when present — with the brief's default when absent:
**first attach point = H, the rest = L candidates** (the moth plan roots its fore chains at the side
points and its hind chains at the side points nudged toward the hind points). A future Wet Lab marker
pass that writes roles into attach data plugs in with no skeleton change; the selfcheck proves a
bottom-placed `role:'H'` wins over the geometric default.

## Bone-hash evidence

FNV-1a over the canonical bone list (ids, parents, markers, coordinates quantized to 1e-4) → 8-hex,
the creature index-hash lineage. Measured on this branch:

- Fixture skeleton (seed 77, creature `m0`, symmetric 4-point fixture): **hash `6f161576`, 16 bones** —
  identical across repeated builds (asserted, not sampled).
- The builder's moth at full growth, world space (seed 77, pin 500,350): **hash `7944cd55`, 10 bones**
  (hind pair not grown in) — a second, independent full run reproduced `7944cd55` exactly.
- The hash moves when the seed, the creature id, or a pose trait moves (asserted in the suite).

"Same bone hash on both devices" reduces to this determinism: the builder is pure seeded arithmetic —
no clocks, no unseeded chance, no environment reads — so any two machines running the same inputs get
the same hash. (No second device was available in this sandbox; the property is proven by construction
and by the suite, and S5's byte-identical clip check is where device parity gets exercised end-to-end.)

## Budget note — CPU-only slice, nothing GPU to register

S1 registers **no** GPU cost: no pass, no shader, no draw. The skeleton is arithmetic inside the
existing creature build (microseconds per creature; the resolver probe with creatures stays in its
existing envelope). The approved 2.0 ms GPU/frame @1080p iPad-class budget and the `costRegistry`
declarations start binding at S2 (mesh warp), where the first GPU work lands — said explicitly here
rather than skipped, per the brief.

## Parity

The moth's rendered output is byte-identical: `creature.selfcheck` (its goldens), `performanceCreatures`
(the #1355/#1356 replay), `resolverProbe`, `motionMeterTap`, and `mathRandomGuard` (15 allowlisted
files, 25 sites — unchanged; skeleton.js adds no `Math.random`) all pass. Full manifest sweep: every
suite passes except three **proven base-identical sandbox exceptions**, each reproduced on a pristine
checkout of `origin/main` (`cb016db3`):

- `kernel/bake/swarmWasm` — identical assertion failure (its `build-wasm.sh --verify` needs cargo,
  absent in this sandbox); outputs differ only in the worktree path inside the message.
- `fx/rollSafety` — non-completion in this sandbox on both trees (S1: >600 s; pristine: still running
  at a 240 s cap). CI is authoritative for this suite.
- `gl/accum` — V8 heap OOM abort (exit 134, same native stack) on both trees.

Also found, pre-existing and NOT caused by S1: `docs/design/creatures-spec.md` §7 names
`gl/resolverInputParity.selfcheck.mjs`, which was retired with the opt-in render worker (#1447,
`99be6826`). The live parity surfaces are `resolverProbe` + `performanceCreatures`; the doc line is stale.

## Verification

- `node src/engine/skeleton.selfcheck.mjs` — OK.
- Family: creature, mathRandomGuard, kernel/rng, performanceCreatures, resolverProbe, motionMeterTap — OK.
- Full manifest (447 commands): all pass except the three base-identical exceptions above.
- `npm run build` — green. ESLint — 0 errors on every touched file.

## Surprises

- The attach data is even thinner than the plan assumed: not only no roles — `MAX_ATTACH = 4` means the
  moth plan's hind chain roots at the SIDE point nudged 18% toward the bottom point. If the Wet Lab ever
  allows more points, hind chains get true hind landmarks for free through `resolveMarkers`.
- The resolver publishes per-frame state with no subscription API, so the overlay polls at 100 ms —
  same compromise StressReadout already makes; fine for a dev ruler.
- `rng.selfcheck` (#1238) actively asserts that every string channel the runtime observes is
  registered — adding `'skeleton': 'spatial'` to `STRING_CHANNEL_GROUPS` was required, not optional.
