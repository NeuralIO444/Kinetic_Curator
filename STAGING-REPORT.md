# STAGING REPORT — #1800 ACCUM spectral fade (per-channel decay)

Builder staging record, branch `feat/1800-spectral-fade` (local only — not pushed, no PR; the coordinator publishes). This file replaces the report that was at the worktree root (#1578 Slice C's); that report remains in git history.
Issue: #1800 "ACCUM: spectral fade — per-channel decay (trails age in hue)". No comments on the issue; the body is the whole contract.

## What shipped (plain language)

Trails now age in colour, not just in brightness. The accumulation buffer's fade used to dim every colour channel at the same rate, so an old trail was just a dimmer copy of itself. Now each channel decays on its own clock — red slowest, green at the FADE slider's rate, blue fastest — so a trail's colour tells you its age at a glance: fresh light lands in the frame's own colours, then cools through amber into deep ember red before black. Same single fade pass, no new controls, no new rendering cost: the FADE slider still means exactly what it meant (green decays at precisely the dialed rate).

Measured on the real GPU (fixed test scene: a cream mover sweeping right at FADE 0.94, sampled head / mid-tail / oldest tip, 0–255):

| sample | before (scalar) | after (spectral) |
|---|---|---|
| head (fresh) | 255, 245, 214 | 255, 245, 214 — identical |
| mid-tail | 70, 67, 58 | 97, 67, 35 |
| tip (oldest) | 23, 22, 19 (neutral gray) | 43, 22, 7 (ember) |

Green is byte-identical at every age — the slider's rate is untouched; red lingers, blue dies first, the tail warms. Stills: `docs/review/1800/before-scalar.png`, `docs/review/1800/after-spectral.png` (rendered through the repo's own GPU probe harness; "before" rendered from main's code, "after" from this branch).

## How (specifics)

- `app/src/gl/accum.mjs`
  - New `SPECTRAL_HALF_LIFE = [1.35, 1.0, 0.72]` (recipe constant v1, per the issue) and `spectralKeep(keep, ratios)`: since the FADE keep is `0.5^(1/H)` for half-life H frames (docs/ACCUM.md), channel c's keep is `keep^(1/ratio_c)`. G (ratio 1) is returned as the input itself — bit-exact. keep 0 → all-0, keep 1 → all-1, non-finite → 0 (the #763 safe direction). Unit ratios return `[k, k, k]` bit-exactly.
  - `accumRecipeParams` derives `keepVec: spectralKeep(finalKeep)` in exactly one place, next to the scalar `keep` (which stays: the LEAVE gate and both modulators speak it).
  - `FADE_FS`: `u_keep` is now `vec3`. The mix line itself is untouched — GLSL's component-wise `mix` does the per-channel work, so the wet variant `FADE_WET_FS` (built by string replacement on `FADE_FS`) inherits the change with its replacement anchors intact.
  - JS mirror (`mirrorAccumStep`): the fade applies `p.keepVec` per channel in both the plain and the feedback-transform paths. Fade-to-paper (#287) composes unchanged — the mix was already per-channel; trails now warm as they fall toward paper.
  - `applyAudioEnvelope`: the gesture still computes the scalar keep, then re-derives `keepVec` from it — the issue's "scale the vec3 uniformly, preserving the spread ratios," realized exactly (the ratios live in half-life space; re-derivation preserves them through the clamps, where per-channel addition would distort them).
  - Both fade uniform uploads (dry + wet) now `uniform3f`. Zero new passes, zero new targets; the fade pass's declared cost tier is unchanged (tier 1, same numbers).
- `app/src/gl/spectrumWarp.mjs` — `applySpectrumWarp` blends `keep`; it now re-derives `keepVec` from the blended keep (same law as the envelope), so a warp can never leave the channels on pre-blend clocks.
- `app/src/gl/debug/sweepEffects.mjs` — the debug sweep's own declaration of the fade pass: `u_keep` kind `float` → `vec3`, uploaded as the equal-component triple (the sweep drives the shader's legacy shape; the spectral derivation lives in the recipe).
- `docs/ACCUM.md` — the fade/decay step now records the spectral law.
- Selfchecks: `app/src/gl/accum.selfcheck.mjs` gains a derivation suite (literal pins: `spectralKeep(0.88) = [0.9096536227, 0.88, 0.8373221891]`; the half-life identity — at keep 0.5, red halves after exactly 1.35 frames, blue after 0.72) and a unit-spread suite proving spread-0 reproduces the legacy hand math `[0.8, 0.4, 0.2]` bit-for-bit. Four existing expectations were **deliberately re-pinned** to the spectral math, each marked in place: fade-only hand math, #287 paper `want` (+ a new r > g > b "warms as it falls" pin), #287 black-ground (renamed — the no-tint property survives, scalar equality doesn't), prism fringe landings, flow fade factors. `spectrumWarp.selfcheck.mjs` gains the keepVec-follows-the-blend pin. No manifest change was needed — every touched suite was already manifest-wired.

## Deliberately NOT built

- **No performer-facing spread amount / no new panel or contract field** — the issue fixes the spread as a recipe constant v1 and defers an amount to a later slice. The "feature off" state exists as the unit-ratios limit of the derivation (pinned bit-exact in the selfcheck) rather than as a runtime gate, matching the scope as written.
- **ACCUM_VERSION stays 2** — it has no consumers outside this module and its selfcheck; the buffer format didn't change, only the fade law's parameters.
- **ACCUM_VISION §2.7's luminance→hue grade pass** — superseded by this slice per the issue (the true mechanism replaces the cheat); the doc's "true version" (dedicated age texture) is #1805's territory, untouched.
- **Nothing for #1801–#1808** — no hooks added beyond keeping the params/modulator pattern consistent for them to build on.

## Verification

- `app/src/gl/accum.selfcheck.mjs`: **OK — all 51 cases pass** (solo run, 3 GB heap), including the 2 new #1800 suites and the #309 e2e probes (velocity smear, resDiv resample). Sandbox caveat: with the default 2 GB heap the suite OOM-aborts during the 512px prism probe — **identically on unmodified main** (verified: main aborts after 40 cases, this branch after 42 = main + the 2 new suites), so it is an environment limit, not a regression; run solo at a raised heap it completes clean.
- Neighbour suites (all PASS): accumGuard, accum.inventory, accum.seam, canvasSizes, wetFeed, audioBallistics, trailMode, spectrumWarp, costTiers, clock.evolve-accum.
- `npm run build` in app/: passes.
- Prettier: all touched files formatted with the repo's pinned prettier.
- Visual evidence: before/after stills + numeric samples above (`docs/review/1800/`).
- **Full manifest sweep (525 manifest entries): 523 pass, 2 fail — both failures are pre-existing sandbox-environment failures, base-identical on unmodified main:** `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` (no cargo toolchain in this sandbox) and `src/fx/rollSafety.selfcheck.mjs` (verified failing with exit 1 on unmodified main in `kc-main-check` as well). CI is authoritative for both; neither touches the accum path.
