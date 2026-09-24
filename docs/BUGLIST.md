# Known limitations & open bugs (0.9.x)

Living list of intentional limits and residual issues. Prefer filing GitHub issues for regressions.

## Intentional / by design

| Topic | Notes |
|-------|--------|
| **Seed ≠ bit-identical still** | Quality caps change placement count and PRNG consumption. Use **project JSON** for reproducibility. |
| **ACCUM live buffer size** | Live buffer is **1000×700**. In-app high-res export still upscales that snapshot. **True-res trails:** `studio.py render --accum --steps N --res 4`. |
| **ACCUM vs BATCH** | Batch walks seeds through the GPU stills path (`studio.py batch`); disabled while ACCUM is on — trails would bleed across seeds. |
| **Gloss LOD** | Second `<use>` skipped under PERF or when node count > 280. |
| **Batch downloads** | Browser must allow multiple downloads; max **48** editions per run. |
| **Audio / LFO / Evolve** | Live-only; not encoded in deterministic stills or project still fidelity. |
| **Quality caps are per layer** | Each layer clamps against the quality preset independently, so N layers can draw N x `maxCount`. Deliberate: `usePerformanceGovernor` already steps quality down on FPS drop, and a shared budget would thin every layer as you add more. Decided in #93. |
| **Evolve targets the active layer** | Evolve/morph act on whichever layer is selected, not the whole stack. The TARGET chips (seed/layout/palette/all) choose *what* jumps; the jump still writes the selected layer's state. |
| **Life audio is global, breath is layered** | Audio ballistics (`scaleMul`/`alphaBoost`/glow) are computed once per frame in the GL loop from the canvas meters plus the active layer's mod amounts, then applied to every layer. Breath is per-agent since spine C — phase from `seedOffset`, amplitude from each layer's own `breath` param × the agent's energy — and ambient drift (jitter/displacement/noiseSpeed) has been per-layer since #425. |
| **FX filters excluded from determinism** | `feTurbulence` differs between browsers (live canvas) and the GPU noise differs again (finals) — the exact grain/displace/tear pattern varies subtly across renderers. Effect structure (kinds, order, params) is deterministic and round-trips exactly. See `docs/FX_LAYERS.md`. |
| **FX filter region is the viewport** | Displacement pushing pixels outside the canvas is clipped. Unbounded filter regions are a silent frame-rate killer, so this is a clamp, not a tier. |

## Residual / watch

| Topic | Notes |
|-------|--------|
| **package-lock + Playwright** | CI uses `npm install` so `@playwright/test` can resolve without a fully regenerated lock after 0.8. Prefer regenerating lock when convenient. |
| **First-run overlay** | Smoke tests set `kc:first-run-seen`; real users see Play Me once. |
| **WEBM + ACCUM** | In-app REC/CAPTURE records the **live GL canvas** via `captureStream` — ACCUM trails included, what plays is what exports (e2e `accum-recording.spec` asserts the trail differential). The old SVG-sampling caveat is retired; `--accum` stills stay the trail-honest stills (#90). |
| **Machine-scoped selfcheck failures (#422)** | On at least one machine `gl/accum` (stipple gate Δ0.012) and `gl/debug` (gpuTimer/tapPoints `INVALID_ENUM`) fail and halt the `&&` chain in `npm run selfcheck`. All 77 other suites pass (full-disk sweep 2026-09-22). Open. |
| **Unwired selfcheck suites (#438)** | `evalContext`, `itemMorph`, `feedLive` sit on disk outside the `selfcheck` chain, so CI never runs them; all three pass when run directly. Open. |
| **Legacy folder stubs** | Empty or residual paths may remain on disk history; active app is **`app/`** only. |
| **Offline swarm needs a bake** | `studio/` replays swarm deterministically (#63). The live canvas keeps its RAF loop for pointer response, so the two agree only for the same seed and step count. |
| **`plus-lighter` in finals** | The GL backend maps `plus-lighter` → `screen` and records the substitution in the sidecar (#96). The old resvg path (which couldn't do it at all) is retired. |

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
- Overlay ingest + media manager (#113 / #123)
- Offline ACCUM at target resolution (#90)
- Spine A–G landed and reviewed (#387–#392); FX layer 4-cap (#341 / PR #412); tape lane (#342 / PR #383)
- Review sweep: dead `useCanvasLife` path (#418 / PR #429), plan-once itemMorph (#419 / PR #430), `hexToRgb` memo (#420 / PR #433), life-clock rollback on rejected frames (#421 / PR #434)
- Chip-stutter pair: continuous life-drift phase (#431 / PR #435), integrated warp phase (#432 / PR #436)

*Last updated: 2026-09-22 — bug sweep on `7d60c4b`: lint green, 77/79 selfchecks (the two failures are #422), 19/19 Playwright.*
