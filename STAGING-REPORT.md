# STAGING REPORT — #1805 ACCUM true age buffer (independent trail ages as data)

Builder staging record, branch `feat/1805-age-buffer` (local only — not pushed, no PR; the coordinator verifies and publishes). This file replaces the report that was at the worktree root (#1803's, which landed with PR #1827); that report remains in git history.
Issue: #1805 "ACCUM: true age buffer — independent trail ages as data". No comments on the issue; the body is the whole contract. Base: origin/main 446f090d (includes #1800/#1801/#1803; #1804 was still in flight when this build started — composition notes below).

## Premise check (standing stop-rule) — PASSED, with one refinement

- **No age buffer exists.** Searched the tree and history: the only "age" in `accum.mjs` was prose (the vision quote in §2.7's own text); `pingpong.mjs` (the bridge pair) stores no per-pixel age and no age texture exists anywhere. ACCUM_VISION §2.7 contracts exactly this field twice: "a dedicated age texture sampled and updated alongside the color feedback — age carried through the tunnel transform, reset where new content lands" and the acceptance's "the true version — an age-texture." Nothing on main contradicts it.
- **Refinement — the §2.7 supersession does not reach this issue.** #1800's spectral fade superseded §2.7's *fade-time* age-texture (the age→colour LUT worn by the fade). #1805's acceptance explicitly demands the version that is "not a brightness clock — independent data," which is the other half of §2.7. No conflict; the build implements the data field, not the LUT.
- **The acceptance's format example is honoured in spirit, adapted in fact.** The issue suggests "a second channel or an attached texture." The colour pair is bridge-owned (`pingpong.mjs`) and single-attachment, so the age field is a twin pass with its own R16F ping-pong at pair resolution — same resolution, same lifetime, no change to the shared bridge. Why a ping-pong and not one target: a pass may not sample the target it writes (the WebGL feedback rule); two targets are the minimum honest shape. The issue's memory bound ("≤ the pair's own size") holds per target with 8× headroom (2 B/px vs the pair's 16 B/px); the field total is 1/4 of pair bytes.

## What shipped

**The age field (`app/src/gl/accum.mjs`).** `ageBuffer: true` on the recipe params (sanitizer `sanitizeAccumAgeBuffer`, strict-true like every module boundary) plus `dt` — seconds of show time the step spans (params-sanitized: non-finite → 1/60, clamped [0, 1]). One new shader, `AGE_FS`, one program with three modes, dispatched twice per requested step:
- After the fade (mode 0): a pixel's age advances by `dt` while its faded light still differs from the ground by more than `AGE_LIGHT_FLOOR` (1/255 luminance — difference-from-ground, so paper-ground looks age and die correctly, the #1801 black-anchor lesson applied to data); dead light's age is void (−1). Ages are sampled through the fade's own tunnel transform, so they ride TUNNEL like the light; the LEAVE hold path advances ages unsampled (its light is held still). The FEED pass does not advect ages (v1 limit, in the docs).
- After the over (mode 1): where the incoming frame covered (alpha > 0), age resets to 0 — newest light wins, so overlapped trails keep independent ages (the acceptance's overlap case, tested both sides).
- `begin()` voids the field (mode 2) when allocated: CLEAR is the only erase, and a begun buffer holds no light.

Allocation is request-only and lazy (`ensureAge` on the first requesting step); `resize` frees, `dispose` frees. An unrequested recipe allocates nothing and renders **byte-identically** (proven by still comparison below). The JS mirror is the float64 twin: `createAgeState` + age blocks inside `mirrorAccumStep` (aging after the fade block, reset after the over block, same throw-loud discipline as the echo ring when requested without a state).

**Cost registration.** `ACCUM_PROGRAMS.age` at tier 1 (the ACCUM family shed) with its memory/time declaration, a sweep entry (`accum/age`, 6 cases, `hdr` because the output is data — void −1, unbounded seconds), and a committed measurement row in `measuredCosts.mjs`. Measurement honesty: a full `npm run measure-costs` in this sandbox regenerates SwiftShader numbers ~50× the reference rig's for EVERY effect, so the file was not re-blessed wholesale; the age pass measured 15.3 ms/draw on the sandbox rig against fade's 16.1 and echo's 16.8 under the identical wall protocol, and the row is committed at the family's 0.3 floor those passes hold on the reference rig, with the basis written in the file (the #560 LEAVE precedent). A reference-rig re-bless supersedes the row.

**Surfaces (all request-only).**
- Scene contract: `accum.ageBuffer: true`, key omitted unless requested (hash stability — the squash/cellShed additive precedent).
- Stills: `renderAccumSequence` returns `age` when requested; `accumStill --age-out <path>` writes the false-colour age map (dt = the sequence's own frame interval). `studio.py` untouched — its subprocess inherits the CLI.
- Backstage: `?debug=age` mounts `AgeReadout` (the StressReadout pattern): the live loop requests the buffer only under that flag (its `dt` is the loop's clamped step), and the readout paints the phosphor ramp — fresh gold → amber → deep ember, void ink — with the oldest living age and lit fraction. `ageFalseColour` is shared by the still and the readout so the two views can never drift.
- Parity harnesses: `accumProbe.html` returns the age field + an `ageAllocated` flag; `glHarness`/`glDriver` forward `ageBuffer`/`dt` and return the field as Float32 data.

## What was deliberately NOT built

- No consumer logic on ages: no age-driven colour, retention, culling, or governor signal. The issue contracts the data and one inspectable view; behaviour on top is future slices.
- No FEED advection of ages, no glow-landing reset (bloom starts aging the step after it appears) — both stated as v1 limits in `docs/ACCUM.md`.
- No panel, no preset field, no new selfcheck suite file (the accum suite grew in place; it was already in the manifest).

## Verification

- `accum.selfcheck`: **67/67** (was 58; +7 node, +2 browser, 3 deliberate re-pins marked in place: program keys 8→9 in two cases, pass-source keys). New cases: params/dt sanitization, contract additivity, the 1/8 memory bound, mirror accuracy (age == elapsed show time to 1e-9 over 20 steps; void after death; unrequested field untouched; loud throw without state), overlap independence (15dt vs 5dt), false-colour endpoints, GPU↔mirror parity over 48 steps (worst Δ within one frame; void agreement at every pixel), unrequested → zero allocation. One mid-run failure at ~49 cases in a backgrounded run under parallel load did not reproduce on the clean solo re-run (full 67 green) — reported as observed, both runs noted.
- Neighbours green: costTiers (with the tier-1 set re-pinned for `accum/age`), debug sweep 105 (the age entry swept, 6 cases), spectrumWarp 90, accumGuard, accum.inventory, accum.seam, wetFeed 7, trailMode, canvasSizes 58, liveLoopSwell, glDriver, clock.evolve-accum.
- `npm run build` green. Prettier (repo-pinned) applied to every touched code file; `docs/ACCUM.md` edited surgically (it is prettier-drifted on main — not reformatted).
- Full manifest sweep (run continues-past-failures in this sandbox): **523 PASS / 3 FAIL**. The two sandbox-known failures are base-identical and untouched by this slice: swarmWasm (needs the cargo toolchain this sandbox lacks) and rollSafety (SwiftShader framebuffer-incomplete; the suite has zero dependency on anything this slice touched) — CI authoritative for those two only. The third failure was THIS slice's, caught by the sweep: `mlxExport` requires every shader-source key to carry a hand-declared tier in `src/gl/mlx/declaredCostTiers.json` — the `accum-age` entry (tier 1, family rationale) was added and the suite re-run green (26 effects).

## Evidence (docs/review/1805/)

- `murmuration-trails.png` + `murmuration-age.png` — a 48-step murmuration still at FADE 0.92 with `--age-out`: the age map reads fresh gold where the flock currently writes, amber/ember where trails cool, ink where light died. The scene fills the frame with marks, so much of the field legitimately holds young light.
- The same still rendered without `--age-out` is **byte-identical** (`cmp` clean) — the unrequested path is untouched.
- Caveat (the standing one): GPU readback in the harness is 8-bit-clamped; the age field itself crosses as float (probe/readAge), so the age map is float data rendered through `ageFalseColour`, not a screenshot of a texture.

## Composition with #1804 (slit-scan echoes)

Disjoint by construction: #1804 owns ECHO_FS/scan params/`AccumFamily.jsx`/contract scan keys; #1805 owns AGE_FS/age params/contract `ageBuffer`. Shared files are touched at adjacent, non-overlapping insertions (`accumRecipeParams` fields, `sceneContract` accum block, `accum.selfcheck` imports/cases, probe payload). Whichever lands second should rebase cleanly; the composed tree's accum suite is the check.
