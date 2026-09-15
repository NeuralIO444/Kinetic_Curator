# Known limitations & open bugs (0.9.x)

Living list of intentional limits and residual issues. Prefer filing GitHub issues for regressions.

## Intentional / by design

| Topic | Notes |
|-------|--------|
| **Seed ≠ bit-identical still** | Quality caps change placement count and PRNG consumption. Use **project JSON** for reproducibility. |
| **ACCUM buffer size** | Live buffer is **1000×700**. High-res export **upscales** that snapshot; it does not accumulate at 4×/8× continuously. |
| **ACCUM vs BATCH** | Batch is per-seed SVG path; disabled while ACCUM is on (continuous time ≠ edition index). |
| **Gloss LOD** | Second `<use>` skipped under PERF or when node count > 280. |
| **Batch downloads** | Browser must allow multiple downloads; max **48** editions per run. |
| **Audio / LFO / Evolve** | Live-only; not encoded in deterministic stills or project still fidelity. |
| **Quality caps are per layer** | Each layer clamps against the quality preset independently, so N layers can draw N x `maxCount`. Deliberate: `usePerformanceGovernor` already steps quality down on FPS drop, and a shared budget would thin every layer as you add more. Decided in #93. |
| **Evolve targets the active layer** | Evolve/morph act on whichever layer is selected, not the whole stack. |
| **Life/breath is global** | Audio reactivity and the breath LFO are computed once for the canvas from the active layer's params, then applied to every layer. |

## Residual / watch

| Topic | Notes |
|-------|--------|
| **package-lock + Playwright** | CI uses `npm install` so `@playwright/test` can resolve without a fully regenerated lock after 0.8. Prefer regenerating lock when convenient. |
| **First-run overlay** | Smoke tests set `kc:first-run-seen`; real users see Play Me once. |
| **WEBM + ACCUM** | Recorder still samples the **SVG** path, not the accumulation canvas — trails may not appear in video until a follow-up. |
| **Legacy folder stubs** | Empty or residual paths may remain on disk history; active app is **`app/`** only. |
| **`app/public/particles.*`** | An untracked WASM particle experiment predating the current app, referenced nowhere. Now git-ignored so it can never reach a Pages deploy; left on disk rather than deleted. See #95. |
| **Offline swarm needs a bake** | `studio/` replays swarm deterministically (#63). The live canvas keeps its RAF loop for pointer response, so the two agree only for the same seed and step count. |
| **`plus-lighter` offline** | resvg has no `plus-lighter`; `studio/` falls back to `screen`, which is not additive. See #96. |

## Fixed in 0.8.0 (reference)

- Pure `buildPlacements` shared live/final (#32)
- RENDER FINAL + UNCAPPED (#24)
- Project JSON + autosave (#33)
- Weight / category mix (#34)
- Setlist + morph-to-favorite (#35)
- Stable keys, symbol budget, gloss LOD (#36)
- Batch edition (#29)
- Accumulation trails (#28)
- CI selfcheck + golden hash + Playwright smoke (#37)
- Legacy UI/sketch/handoff cleanup (#38)

## Fixed in 0.9.x (reference)

- Multi-layer compositing, CI green + never-run e2e, dead mouse attractor (#89)
- Kernel K3 scalar fields (#62), K4 particle bake (#63), K5 colour channel (#64)
- Colour: paletteShift in UI (#54), project round-trip (#53), user library (#55), harmony (#56)
- Studio tier: render farm (#74), Curator (#75), geometry blend (#76), gated generation (#77)

*Last updated: 2026-09-15*
