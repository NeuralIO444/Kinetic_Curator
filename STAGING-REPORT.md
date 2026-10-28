# STAGING REPORT — #1801 ACCUM highlight soft-ceiling (kill the bloom ratchet)

Builder staging record, branch `feat/1801-soft-ceiling` (local only — not pushed, no PR; the coordinator publishes). Base: origin/main @ 4bd7a115 (post-#1816 TIDES; #1800 not yet merged — see "Composition with #1800" below). This file replaces the report that was at the worktree root (#1578 Slice C's); that report remains in git history.
Issue: #1801 "ACCUM: highlight soft-ceiling in the loop (kill the bloom ratchet)". No comments on the issue; the body is the whole contract.

## What shipped (plain language)

Bright cores no longer flatten to white. The glow pass used to hard-clamp every colour channel at 1.0 on every frame, so over a long loud sequence each channel pinned at exactly 1.0 one after another and the core converged to flat, hueless white — the bloom ratchet. Now the add-back passes through a soft ceiling instead: anything at or below 1.0 is completely untouched (bit-identical to before), and above 1.0 a smooth shoulder bends the value toward a 2.5 ceiling it never reaches. Hot cores stay in HDR, keep their hue separation, and settle instead of pinning. No new passes, no new controls — the same glow pass, shaped.

Measured on the fixed test scene (amber block deposited for 12 steps, then black frames, FADE 0.95, optics 0.75; core pixel, linear float, run through each codebase's own JS mirror — main's for "before", this branch's for "after"):

| step | before (hard clamp) | after (soft ceiling) |
|---|---|---|
| 12 | 1.000 / 0.636 / 0.138 | 1.180 / 0.636 / 0.138 |
| 24 | 1.000 / 1.000 / 0.509 (r−b 0.491) | 1.357 / 1.312 / 0.510 (r−b 0.847) |
| 60 | **1.000 / 1.000 / 1.000 (r−b 0.000 — flat white)** | 1.357 / 1.313 / 1.282 (r−b 0.075) |
| 240 | 1.000 / 1.000 / 1.000 | 1.357 / 1.313 / 1.282 — settled, unchanged |

Before: the ratchet finishes the job by step 60 — every channel at the pin, hue separation exactly zero, forever. After: the core works in HDR while the content is fresh (r−b 0.85 at step 24) and settles at a hue-ordered fixed point under the ceiling instead of at the pin.

Stills: `docs/review/1801/before-clamp.png`, `docs/review/1801/after-ceiling.png` — the same fixed scene at step 24. One honest caveat: the repo's GPU probe harness reads the buffer back through an 8-bit clamp, which cannot express this difference (verified: probe samples are identical under both laws, because everything that differs sits above 1.0). The stills are therefore rendered from the JS mirror's float buffer — the same mirror the accum suite's GPU parity probes hold to ~3 LSB of the real GPU path — tonemapped as `(v / 2.5)^(1/2.2)` so the 2.5 headroom is the display range. Core/edge/skirt float samples are printed in the verification notes below.

## How (specifics)

- `app/src/gl/accum.mjs`
  - New recipe constants `HIGHLIGHT_KNEE = 1.0` / `HIGHLIGHT_CEILING = 2.5` and the shaping law `highlightSoftCeiling(x)`: identity for x ≤ knee (bit-exact — the acceptance's sub-knee guarantee), else `knee + span·t/(span + t)` with `t = x − knee`, `span = ceiling − knee`. Reinhard-family shoulder: slope exactly 1 at the knee (C1 join, no seam), monotone, bounded by the ceiling, closed-form invertible — the in-loop shapes the 2026-10-27 eval sanctioned (invertible shoulder; published phosphor pipelines pin the linear buffer at 2.5). ACES is untouched and still runs only at the resolve (#532); nothing accumulates through a filmic curve.
  - `GLOW_FS`: a `softCeil`/`softCeil3` GLSL pair with the constants **baked in from the JS constants at module load** (one source of truth; no new uniforms, so the createAccum uniform audit is untouched). The tail `min(lit, vec3(1.0))` is replaced by `softCeil3(lit)`. `GLOW_WET_FS` is string-built from `GLOW_FS` and inherits the ceiling through the shared tail — its replace anchors (the `vec3 lit = …` line and `uniform vec3 u_tint;`) are unchanged, and wet granulation still shapes before the ceiling, consistently with the dry pass.
  - JS mirror (`mirrorAccumStep`): the ceiling is applied **per glow tier** — shape after the bloom add, then shape again after the halation add — exactly matching the GPU's two sequential passes (bloom writes back, halation reads the shaped result). The pre-#1801 mirror summed both tiers and clamped once; that agreed with the GPU only because a hard clamp of a monotone sum is order-blind. A shoulder is not, so the tiers now shape in sequence (the difference is ~0.018 on a uniform white frame — measured, and pinned by a dedicated test that also proves it can distinguish the two compositions).
  - Module header recipe list gains step 7 documenting the ceiling.
- `docs/ACCUM.md` — recipe gains step 7 (highlight soft-ceiling), and the B1 SWELL paragraph records that the ratchet is now also bounded in-loop; SWELL remains the musical fader, no longer the only defence.
- Selfchecks: `app/src/gl/accum.selfcheck.mjs` gains 4 cases (49 → 53): the shaping law (bit-exact identity below the knee; hand values on the shoulder; monotonicity; ceiling asymptote; slope-1 at the knee; invertibility round-trip; hue-order preservation), the shader-baking pins (GLOW_FS/GLOW_WET_FS carry softCeil with numbers derived from the constants; the hard clamp is gone), the per-tier mirror composition test, and the 240-step ratchet acceptance test (mid-sequence r−b > 0.5; settled core > 1.2 on all channels, < 2.5, r−b > 0.04, one-more-step Δ < 0.005; optics-0 control never exceeds the deposit). No manifest change — the suite was already manifest-wired. No golden hashes exist in this suite, so there was nothing to re-pin.

## Deliberately NOT built

- **No new passes, targets, or uniforms** — the issue scopes this to one shaping function in the existing composite/bloom step. The glow target stays RGBA8 (its ≤ 1 glow samples are unchanged); the feedback buffer stays RGBA16F.
- **No panel control** — knee/ceiling are recipe constants v1, per the issue.
- **No change to the resolve** — ACES still runs once at resolve (#532); the eval's rejected option (accumulating through a filmic curve) stays rejected.
- **ACCUM_VERSION stays 2** — the buffer format didn't change, only the glow pass's shaping law.
- **Nothing for #1800, #1802–#1808** — no hooks added beyond the recipe-constant pattern they already build on.

## Composition with #1800 (coordinator note)

#1800 (PR #1824, branch `feat/1800-spectral-fade`) was still open when this slice was built, so this branch is based on pre-#1800 main. The two slices touch disjoint regions of `accum.mjs` — #1800's hunks are the fade (`FADE_FS` `u_keep` → vec3, `keepVec` derivation, mirror fade) and this slice's are the glow (`GLOW_FS` tail + softCeil, mirror glow, constants after `opticsDerived`) — so a rebase/merge composes textually except possibly the `accum.selfcheck.mjs` import list, where both slices add names to the same import block (trivial hand-merge). This slice deliberately adds **no fields** to `accumRecipeParams`' return object, avoiding #1800's `keepVec` restructuring entirely.

## Verification

- `app/src/gl/accum.selfcheck.mjs`: **OK — all 53 cases pass** (solo run, 3 GB heap), including the 4 new #1801 cases and the browser GPU↔mirror parity probes (mirror-vs-GPU parity holds under the new law — the probes compare the shaped mirror against the shaped GPU pass on optics-1 sequences). Run twice: once against the sandbox's shared module tree and once after a clean `npm ci` in this worktree — same verdict. Sandbox caveat (unchanged from main): at the default 2 GB heap the suite OOM-aborts during the large GPU probes; identical on unmodified main.
- Neighbour suites (all PASS): accumGuard (torture peak 1.7, 4 poison fields refused), wetFeed (7 checks), spectrumWarp (88 checks), accum.inventory, accum.seam, canvasSizes (58 cases), trailMode (29 cases), audioBallistics, costTiers, clock.evolve-accum.
- `npm run build` in app/: passes (after `npm ci` in this worktree — see setup note).
- Prettier: all touched files formatted with the repo's pinned prettier (no changes needed — written in format).
- Full manifest sweep (526 manifest commands, per-suite loop, 3 GB heap): **524 pass, 2 fail — both failures are the pre-existing sandbox-environment failures, verified base-identical on unmodified main in this session:** `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` (no cargo toolchain in this sandbox; exits 1 on main too) and `src/fx/rollSafety.selfcheck.mjs` (exits 1 on main too). Neither touches the accum path; CI is authoritative for both.
- Visual evidence: `docs/review/1801/before-clamp.png` / `after-ceiling.png` (see the readback caveat above). Float samples at step 24 (96×96 scene, block 32×32): before core 1.000/1.000/0.510, edge 1.000/1.000/0.433, skirt 1.000/0.718/0.275 — red and green pinned at the clamp across core and edge (the plateau). After core 1.356/1.293/0.511, edge 1.351/1.237/0.434, skirt 1.333/0.737/0.276 — HDR headroom with core→edge gradation and channel separation.

## Setup note

This worktree was created without a local `node_modules`; module resolution initially fell through to a shared tree elsewhere in the sandbox (selfchecks ran, but `npm run build` failed on an unrelated missing `@tauri-apps/api`). Fixed with `npm ci` in `app/` (lockfile-exact); build and the accum suite were then re-verified against the local install with the same results. The failure was environmental, not a code regression — flagged here so the coordinator doesn't chase it.
