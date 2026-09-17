# WebGL Phase 6 — Retire SVG renderer, retune governor (#192)

Date: 2026-09-17. Validates against #103's cliffs.

## What changed

### Governor retune: resolution sheds before effects

The Showrunner's old cut ladder led with FX shedding (cuts 1–2: simplify
turbulence, then bypass all but the first FX layer). On the GPU that ladder
buys nothing — FX compositing is one extra FBO pair + one filter pass per
wrap, 10–50x headroom — and it caused the **silent-cull trap**: an FX layer
shown in the UI while its wrap was culled.

New cut order (`app/src/hooks/governorCuts.js`, pure and unit-tested):

1. **Dynamic resolution scaling** — `renderScale` 1 → 0.75 → 0.5 → 0.33
2. Quality tier step: HIGH → BALANCED → PERF
3. mirror/gloss/ACCUM shed (`perfTier1`, independent lower FPS floor)
4. Cost-aware asset thinning
5. Render-only count clamp below the PERF floor
6. Motion freeze (`slowRender`)
7. Watchdog hard stop (manual resume)

Every cut is a render-only overlay, never serialized, auto-clears on
recovery (except the watchdog). The old `fxShedLevel` mechanism is fully
removed: store field, governor cuts, CanvasPanel FX fold, fxFilters
`shedLevel` plumbing, and the `studio/render.mjs` export-path stub.

### maxFxLayers retired as a budget

All live tiers (`high`/`balanced`/`performance`) now carry
`maxFxLayers: Infinity`, same as `FINAL_CAPS`. FX layers are never culled in
normal operation. `buildSceneContract` still *reports* any shed wrap as
`contract.shed.fxLayerIds` (additive — `GL_CONTRACT_VERSION` stays 1, and
`assertSceneContract` now requires the field), so a future cap can never go
silent again. The selfcheck proves it: 6 FX layers at `performance` → 6
wraps, empty shed; a forced `maxFxLayers: 1` → 1 wrap + 5 reported ids.

### Honest shed indicator (minimal, #177 owns the full design)

`ShedBadge` in the app footer (`App.jsx`) reads governor state via
`shedSummary()` and shows `⚠ shed · res 50% · …` whenever anything is cut
(resolution scale, mirror/gloss/ACCUM, asset thinning, count clamp, motion
freeze, watchdog). Auto-clears on recovery. This is the stopgap the issue
asked for; #177 designs the real indicator.

### SVG renderer retired from the shipped bundle

- `studio/render.mjs`'s `renderSvg()` stays in-repo as the **dev-only parity
  reference** (`app/src/gl/parity/reference.mjs` imports it). Nothing in the
  vite production import graph reaches it — enforced by a static
  import-graph walk in `gl/phase6.selfcheck.mjs` (111 modules from
  `main.jsx`, zero paths to `studio/render.mjs`).
- The user-facing SVG export is gone: `studio.py svg` subcommand,
  `cmd_svg`, and `build_svg` removed. Shipped output is raster-only
  (`studio.py render` → GPU readback PNG, `render --accum` for trails).
- `resolveLayers()` in `studio/render.mjs` is shared plumbing (the GL path
  resolves layers before building the scene contract) — it is not SVG
  rendering and stays in normal use.

## #103 cliffs — re-tested on the GL backend

#103 (advisory QA @ `1d4502c`) found: live FPS dies in the SVG/React
compositor, not in `computePlacements`; project JSON was under-sanitized and
could white-screen the canvas. The parse-side sanitization it asked for
landed 2026-09-16 (`normalizeLayoutParams`: count clamp, enum allow-list,
finite `[lo,hi]` ranges, `__proto__` guard). Phase 6 re-tests the cliffs
through the GL backend end-to-end
(`parseProject → resolveLayers → buildSceneContract`, plus a headless-Chromium
`renderViaGL` hostile render):

| #103 cliff | GL backend verdict |
|---|---|
| Hostile import `{ scale: [null,null], alpha: null, count: 1e12, mode: "__proto__" }` | **Pass.** Parses; count clamps to tier caps; scale/alpha fall back to defaults; mode falls back to the default sampler (never `__proto__`). Renders 400×280 px through WebGL with no throw. |
| `seed: "not-a-number"` | **Pass (honest).** Rejected at parse with `Invalid seed` — no silent zeroing, no white-screen. |
| 200-layer `layers` array | **Pass with a documented gap.** All 200 resolve; total instances stay bounded by per-layer caps (200-layer contract builds in 36 ms). The suggested hard layer-count cap (8–16) was never implemented at parse — pre-existing, unchanged; recommend a follow-up. |
| Density stress (8 layers × count 8000) | **Pass.** Contract builds in 12 ms; 4864 instances (clamped by `high` caps). Kernel math was never the cliff; the GL path inherits that. |
| FX culling under density | **Pass.** No `maxFxLayers`-style culling exists anymore; shed is reported, not silent. |
| ACCUM serializing SVG every frame | **N/A on GL.** ACCUM is a GPU feedback loop (#190); there is no SVG serialization in the GL path at all. The legacy live React canvas still has this shape — out of scope (live canvas is still SVG). |
| P0 placement rebuilds every frame / CanvasPanel memo on audio | **N/A on GL** — these are live-React-canvas cliffs. The GL pipeline is render-per-frame with no React reconciliation. A GL live loop would inherit none of them; building it is a separate work order (see follow-ups). |

**Bottom line:** every #103 cliff that touches the render/export path is
resolved or inapplicable on the GL backend. The remaining cliffs live in the
legacy interactive SVG canvas, which Phase 6 deliberately does not touch.

## Follow-ups

- **#177** — full shed-indicator UI design; the footer `ShedBadge` is the
  stopgap. Coordinate before changing the badge's surface.
- **#168** — quality-bar rewrite lands after this (per #192's Related).
- **Live GL canvas** — the interactive app still renders via React/SVG. A
  live WebGL loop (rAF, audio reactivity, life/evolve/swarm on GPU) is a
  separate work order; parity + the governor retune here are its
  prerequisites.
- **Layer-count hard cap** — #103 suggested capping `layers.length` at
  parse (8–16); still open. The GL path stays bounded by per-layer caps
  regardless.
- **`docs/QUALITY.md`** may still describe the old tier tables — check on
  the #168 pass.
