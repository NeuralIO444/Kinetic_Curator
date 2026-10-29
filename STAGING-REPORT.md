# STAGING REPORT — #1806 slice 1: selective accumulation, the renderer seam

Builder staging record, branch `feat/1806-selective-accum` (local only — not pushed, no PR; the coordinator verifies and publishes). This file replaces the report that was at the worktree root (#1802's); that report remains in git history.

Issue: #1806 "ACCUM: selective per-layer accumulation — chosen strata feed the buffer". No comments on the issue; the body is the whole contract, and its slicing is part of the spec: **(1) renderer seam → (2) recipe wiring → (3) BUILD flag + project JSON.** "Each slice is its own PR… No slice ships a half-wired flag."

**This build is slice 1, complete.** Slices 2 and 3 are NOT in this branch — they are the staged remainder, mapped at the bottom of this report.

## Premise check (standing stop-rule — applied before any code)

- **Not already built:** no `accumInput` / `feedsAccum` / selective-accum surface exists anywhere in app/src (grep, zero hits); no commit in history implements it.
- **No recorded decision contradicts it:** the strata fixed form (2 CONTENT + MATH + FX) is the contract's own layer model (`sceneContract.js`: layers typed `content` / `pattern` / `math` / `fx`); the pre-FX input the spec demands is the #520/#820 grain law generalized (finishes run after the buffer, never into it). docs/DECISIONS.md has no accum-feed ruling. The field-mod pointer ruling concerns MATH items' targets, not the buffer's input.
- **Composition with the in-flight shelf:** #1804 (PR #1828) and #1805 (PR #1829) touch `renderAccumSequence`'s option plumbing only; this slice touches `renderFrameInto` + a new entry point — textually and semantically disjoint.

## What shipped (plain language)

The renderer can now draw **only the strata you name** — the moth stratum without the background plate — as the frame the accumulation buffer would consume. It is a new rendering mode of the existing scene renderer, not a second renderer: the chosen strata draw through the exact same per-layer path as the full picture (same placements, blends, mattes), skipping everything else, over transparency, with no FX wrap applied — the buffer gets the strata's own light, never the finished picture. Nothing in the app calls it yet (that is slices 2 and 3, per the issue's own slicing); it ships proven by a new selfcheck that folds the partial renders back together and matches them against the full composite pixel for pixel.

Stills (the selfcheck's scene: two content strata under an invert FX stratum): `docs/review/1806/full-composite.png` (what the audience sees — inverted, light background) · `input-all-strata.png` (both strata's true colours, pre-FX — the buffer's would-be input) · `input-bg-only.png` · `input-top-only.png` (each stratum's light alone; their union is the all-strata input).

## How (specifics)

- `app/src/gl/renderer.mjs`
  - `isAccumFeedLayer(layer)` + `accumFeedLayers(contract, layerIds)` (exported, pure): the one definition of who can feed — content and pattern strata (a pattern composites like a content track, #1098); MATH/FX never feed. Selection resolves in compositeOrder; unknown and MATH/FX ids are ignored, never errors. Slices 2/3 build on this so the rule can't drift between recipe and panel.
  - `renderFrameInto` gains an `accumInput` option (`{ layerIds }`): computes the feeding id set once, clears transparent (an ACCUM input by definition), and skips every non-feeding layer whole in the composite loop — unselected strata leave no light; MATH/FX get no wrap, no fold, no finish chain. Selected strata draw through the untouched `compositeLayerTo` path. Option off (every production caller): the composite is byte-identical — the guard is a single Set lookup per layer on a null-checked path.
  - `createRenderer().renderAccumInput(payload, layerIds)`: the one-shot entry (renderScene's shape: own targets, resolve to bytes, GL-error checked). **No finish chains** — grain never enters a buffer input (#520/#820). Also forwards the base's `setResolveOptions` (the live renderer already forwards it) for data-space proof renders.
  - No new GL pass, target, or shader — so no new cost-tier registration: the seam reuses the composite's own programs and the caller's frame targets. Its per-frame cost lands with slice 2's wiring, bounded by the selected strata's placement counts (the issue's cost paragraph), and the shed rung the issue specifies (subset → composite fallback) is a slice-2 governor concern, recorded here so it isn't lost.
- `app/src/gl/parity/glHarness.html` — `__kcAccumInput` entry + a `rawResolve` payload flag on it and `__kcRender`: renders in data space (raw premultiplied clamp, no ACES/dither), presentation defaults always restored after. **Why:** the presentation resolve tonemaps in straight space — nonlinear in alpha — so presentation bytes cannot be folded or compared as light (measured during this build: a premultiplied fold of ACES-resolved renders misses by up to 56 LSB at overlapping faint marks, 0 at opaque pixels). The buffer consumes the 16F texture, never a resolved picture, so data space is the quantity the seam promises.
- `app/src/gl/parity/glDriver.mjs` — `renderAccumInputViaGL(contract, layerIds, opts)`; `renderViaGL` forwards `opts.rawResolve`. Both additive; every existing caller untouched.
- `app/src/gl/accumInput.selfcheck.mjs` (new, manifest-wired) — 7 cases. Node: the feed definition and selection resolution. Browser (the suite's two-strata + invert-FX scene, all renders data-space):
  - **subset = full render masked to the selected strata**: premultiplied fold over(subTop, over(subBg, background)) matches the no-FX full composite with zero channel values beyond ±3 LSB (measured worst 1.4); over(subTop, subBg) likewise reproduces the joint subset render. Because the subset draws the resolver's own instances, the fold matching is also the placement-parity proof: any placement/seed/count shift would break it.
  - **Attribution**: each subset holds light only where its own stratum marks; where one subset is empty the joint render equals the other within ±2 (the 16F→8-bit floor).
  - **Pre-FX**: naming the FX stratum in the selection changes nothing, byte for byte; the subset fold differs from the audience's inverted frame on >50% of pixels.
  - Empty and unknown-only selections render transparent black, byte for byte.
- `docs/ACCUM.md` — a "Selective accumulation (#1806) — slice 1" section (surgical, house style; the file's pre-existing prettier drift untouched).
- `app/selfcheck.manifest` — +1 line.

## Deliberately NOT built (the staged remainder, per the issue's slicing)

- **Slice 2 — recipe wiring:** `accum.step()` consuming the subset frame when any flag is off (all-on keeps today's composite path byte-identical), the live renderer's one-wrapper surfacing of the seam, mirror parity for the subset path, the governor shed rung (subset → composite under load, reported in the show block), and `accumStill` subset behaviour. Two slice-2 notes from this build: (a) the pattern-texture sweep in `renderFrameInto` currently runs on every render — when full and subset renders interleave per frame, an unselected pattern's texture would be freed and re-uploaded each frame; the sweep should be owned by the full render (correctness is unaffected — the texture re-creates on demand — so slice 1 left the pinned line untouched); (b) a selected stratum's matte still reads its source stratum's content even when the source doesn't feed — the stratum renders as it renders; slice 2 should confirm that is the wanted buffer semantics.
- **Slice 3 — surface:** the FEEDS ACCUM toggle on the stratum row in BUILD, the project-JSON field per stratum + migration (default on). Nothing here pre-empts its shape: the seam takes plain layer ids.

## Verification

- **accumInput.selfcheck: OK, 7 cases** — solo and inside the full sweep.
- **Full manifest sweep** (all 528 lines, run with a tolerant driver — the repo runner is fail-fast and stops at the first sandbox-env failure): **523 pass / 5 fail.**
  - `swarmWasm`, `rollSafety` — the documented sandbox-environment pair (no cargo in this sandbox); CI is authoritative for both.
  - `accum` — in-sweep failure was the documented default-heap OOM (V8 crash tail, spawn timeout under load); **solo with NODE_OPTIONS=--max-old-space-size=3072: OK, 58 cases.**
  - `livingMotion` — failed in-sweep and in one loaded solo run (exact-equality assertion); **quiet solo re-run: 15 checks passed.** Both results reported; the suite never exercises the seam and the default render path is untouched.
  - `exportStill` — failed in-sweep under load; **solo: all checks passed.**
- Neighbours, all green: composite (15 cases, solo + sweep), accum.seam, accum.inventory, accumGuard, sceneContract, glDriver, patternRender (its renderer source-shape pin intact — the pinned sweep line was deliberately not touched), grainFinish, spectrumMarks, fxFilters, fxUniforms, costTiers.
- Gate trio, all green in-sweep: replayGate, creatureGate, refreshFixtureCheckpoints.
- `npm run build`: green. Prettier: clean on every touched code file. docs/ACCUM.md edited surgically (its pre-existing drift untouched).
- Sandbox note: verification ran while a second builder lane shared the machine, and /tmp was wiped mid-run by the environment (the first sweep's logs went with it; the sweep was re-run in full with progress kept in the workspace). The worktree was never affected.
