# STAGING REPORT — #1803 ACCUM palette-driven halation (the glow takes the look's colours)

Builder staging record, branch `feat/1803-palette-halation` (local only — not pushed, no PR; the coordinator publishes). This file replaces the report that was at the worktree root (#1800's, which landed with PR #1824); that report remains in git history.
Issue: #1803 "ACCUM: palette-driven halation — the glow takes the look's colours". No comments on the issue; the body is the whole contract.

## Premise check (the #1802 lesson, applied first)

Before building, the codebase and git history were searched for the contracted behaviour already existing or a recorded decision contradicting the issue. Findings: `halationTint` was exactly what the issue says — a hardcoded constant `[1.0, 0.6, 0.35]` in `opticsDerived` (per #169), consumed by the GPU glow pass (`addGlow(..., p.halationTint)`) and the JS mirror. Nothing palette-driven fed it; no prior PR/issue ruled on a palette tint (halation history is #169's constant, #226's kernel parity, #250's sigma subdivision — none about the tint source). The premise holds; the build proceeded.

## What shipped (plain language)

The wide warm glow around bright cores (halation) used to wear the same stock amber tint on every look. It now takes the active palette's colours: the tint is derived from the palette — its bright colours' weighted average hue, muted (a bleed is never a neon), with its total energy pinned to the old constant's so GLOW is exactly as strong as before, only its colour belongs to the look. A teal look halates cool, an amber look halates warm, and a monochrome or single-colour palette keeps the classic warm constant — it is the documented fallback, bit-identical, so every existing render without palette input is unchanged. No new passes, targets, uniforms, or controls: the tint already travelled to the shader as a uniform; only its source changed. The tint is derived, never typed — it appears in no panel and no project field.

Measured (fixed scene: white block, mirror, halation tier isolated, optics 0.25): halo red-minus-blue on a saturated teal palette **negative (cool)**, on an amber palette **positive (warm)**, on the constant the warmest of the three; total halation energy for both derived tints within ±5% of the constant-tint baseline (the derivation pins the tint channel-sum to the constant's 1.95 exactly; the probe confirms the end-to-end number). Derived tints for the two test palettes: teal `[0.473, 0.748, 0.730]`, amber `[0.809, 0.663, 0.479]` — no channel reaches 1.0 (never neon). A GPU probe case additionally proves the GPU halo takes the palette hue with GPU↔mirror parity at 6 LSB. Stills: `docs/review/1803/before-constant.png` (warm halo) vs `docs/review/1803/after-palette.png` (teal halo) — same white-core scene, 24 steps, optics 0.75, rendered through the JS mirror (the parity-proven twin; the #1801 8-bit-readback caveat applies to GPU captures, the mirror is float-exact).

## How (specifics)

- `app/src/gl/accum.mjs`
  - `HALATION_TINT_FALLBACK = [1.0, 0.6, 0.35]` (frozen, exported) — #169's constant, demoted to the fallback. `opticsDerived` now hands out a copy of it (its standalone contract is unchanged).
  - `halationTintForPalette(palette)` (exported, pure): luminance-weighted centroid of the swatches (Rec601 weights — the same luma GLOW_FS reads), a chroma-spread gate (`HALATION_CHROMA_EPS = 0.02`: luminance-weighted RMS chroma distance from the centroid; a single colour and a monochrome ramp both sit at ~0 and fall back), desaturation toward the centroid's own grey (`HALATION_SATURATION_KEPT = 0.5`), then an energy pin scaling the channel sum to the fallback's 1.95. Garbage in (null / empty / unparseable / all-black) falls back, never throws, never emits a non-finite channel.
  - `accumRecipeParams` gains a `palette` input (the active palette's swatch hex list, or null) and derives `halationTint` from it in exactly one place, after the optics spread. No palette → the fallback, bit-identical.
  - `applyAudioEnvelope` re-carries `halationTint: p.halationTint` after its optics recompute — the tint is palette state, not optics state (the keepVec law from #1800, one field over). Silence remains a field-for-field identity.
  - Module header: step 6 notes the tint source. No shader change — the tint already arrived as the `u_tint` uniform; recipe cost tier unchanged (no new pass, no new per-frame cost; the derivation runs where params are built).
- `app/src/gl/spectrumWarp.mjs` — `applySpectrumWarp` re-carries the tint after its optics recompute, same law as the envelope.
- Callers (the palette actually rides the calls):
  - `app/src/gl/liveLoop.mjs` — `accumParams.palette = activePalette.swatches` (the palette the frame renders with; per-frame, so a palette change re-derives on the next frame).
  - `app/src/gl/renderer.mjs` — `renderAccumSequence` accepts `palette` and forwards it to `accumRecipeParams`.
  - `app/src/gl/parity/glDriver.mjs` + `app/src/gl/parity/glHarness.html` — `palette` forwarded through the still-render payload.
  - `app/src/gl/accumStill.mjs` — passes the project's first-layer palette swatches (the same palette its background resolves from).
  - `app/src/gl/parity/accumProbe.html` — the probe page forwards `p.palette` so selfchecks can drive palette scenes on the GPU.
- `app/src/gl/accum.selfcheck.mjs` — +3 cases: the derivation law (fallback bit-identity, garbage/monochrome/single-colour fallbacks, teal-cool/amber-warm, energy pin, audio carry), a mirror probe (halo hue ordering + total halation energy within ±5% of baseline at optics 0.25, halation tier isolated), and a GPU probe (parity at 6 LSB + halo hue swing vs the constant). The probe helpers (`runProbe`/`mirrorSeq`) learned a `palette` argument. No manifest change — the suite was already wired.
- `app/src/gl/spectrumWarp.selfcheck.mjs` — +2 checks: the warp carries a palette-derived tint through its optics recompute.
- `docs/ACCUM.md` — step 6 records the derivation + fallback; the light-feel bullet now reads "the bleed takes the look's colours".
- `docs/review/1803/before-constant.png`, `docs/review/1803/after-palette.png` — visual evidence.

## Deliberately NOT built

- No contract field, no panel, no readout: the issue's honesty rule — the tint is derived, never typed. (`accum.seam`'s signature pin still passes: `palette` carries none of its banned words.)
- No change to `opticsDerived`'s other fields, the bloom tier (its tint stays neutral `[1,1,1]`), the wet glow variant (it reads the same `p.halationTint` through `addGlow`), or fade-to-paper (#287): on paper grounds the derived tint is used as-is, per the issue.
- Voices/looks declaring accumulation needed no data change: they inherit the derived tint with their palette, as the issue's scope states.
- #1801 composition: PR #1825 was still open at build time; its GLOW_FS soft-ceiling and mirror rework touch the glow tail only. This slice changes what `p.halationTint` *is*, never how the add-back is shaped — the ceiling still applies after the tinted add-back, the recipe's existing order. Zero textual overlap with the #1801 diff (verified by diffing the branch: it touches none of this slice's lines).

## Verification verdicts

- **accum.selfcheck: OK — 54 cases** (solo run, 3 GB heap), including the 3 new #1803 cases and all GPU↔mirror parity probes. (51 on main + 3 new.)
- **spectrumWarp.selfcheck: ok — 90 checks** (88 + the 2 new tint-carry checks).
- **Neighbour suites: all PASS** — accumGuard, accum.inventory, accum.seam, wetFeed, canvasSizes (58), trailMode, audioBallistics, costTiers, clock.evolve-accum.
- **Full manifest sweep: 524 of 526 commands pass.** Run per-suite (the stock runner is fail-fast) in two passes. The only failures are `swarmWasm` (no cargo toolchain in this sandbox) and `rollSafety` — both **verified base-identical on unmodified main** (exit 1 each, run firsthand in a clean main worktree); CI is authoritative for those two. Three suites needed a second look and all cleared: `accum` hit the sweep harness's 600 s per-suite timeout at 51/54 cases with zero assertion failures under load, then passed in-sweep in pass B (and solo, 54/54, twice); `livingMotion` failed a wall-clock perf-budget assertion (2.32 ms vs 2 ms) measured under full sweep load and passes solo (exit 0); `exportStill` hit a framebuffer-incomplete under concurrent browser load and passes solo (all checks passed).
- **`npm run build` in app/: passes.** Prettier applied to all touched code files (repo-pinned, `--check` clean). `docs/ACCUM.md` was edited in house style only — it fails `prettier --check` on unmodified main too (pre-existing drift), so it was deliberately not reformatted.
