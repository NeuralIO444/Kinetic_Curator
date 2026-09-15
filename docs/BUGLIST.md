# Known limitations & open bugs (0.8.0)

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

## Residual / watch

| Topic | Notes |
|-------|--------|
| **package-lock + Playwright** | CI uses `npm install` so `@playwright/test` can resolve without a fully regenerated lock after 0.8. Prefer regenerating lock when convenient. |
| **First-run overlay** | Smoke tests set `kc:first-run-seen`; real users see Play Me once. |
| **WEBM + ACCUM** | Recorder still samples the **SVG** path, not the accumulation canvas — trails may not appear in video until a follow-up. |
| **Legacy folder stubs** | Empty or residual paths may remain on disk history; active app is **`app/`** only. |

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

*Last updated: 2026-09-15*
