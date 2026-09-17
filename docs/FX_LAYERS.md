# FX Layers

Adjustment-layer-style SVG filter effects for the layer stack. Implements #180 (which implements #152).

## Layer model

- `type: 'fx'` vs `type: 'content'` on the layer object. Layers without a
  `type` (pre-#180 documents) are treated as content.
- An FX layer holds an **ordered `effects` array**, not a content snapshot:
  `[{ kind: 'rgbSplit', params: { dx: 3 } }, …]`. It has no seed, palette,
  layoutParams, or enabledAssets — there is nothing for the snapshot
  machinery to capture, so `setActiveLayer` ignores FX targets and FX layers
  are never the content-active layer. The Layers panel edits their effect
  stack via the ephemeral `selectedFxLayerId` (never serialized).
- FX layers participate in add / remove / reorder / show-hide / solo /
  duplicate exactly like content layers. Hidden FX layers are skipped at
  resolve time — no filter cost. Blend modes don't apply to FX layers
  (wrapping a filtered group in a blend is unpredictable); opacity does.

## Render wiring

Two recipes, one chaining rule (effect stacks execute top-down: the first
effect reads the layer source, each later effect reads the previous effect's
output — #185, frozen as data in `docs/GL_CONTRACT.md`):

- **Live app** (React/SVG canvas): folds the stack bottom-up; each applied FX
  layer wraps the accumulator in `<g filter="url(#fx-{layerId})">`, compiled
  from `FX_EFFECT_DEFS` by `app/src/fx/fxFilters.js` (`CanvasPanel.jsx` →
  `buildLayerStack()`; one `<filter>` per active FX layer rendered by
  `FxFilterDefs` into `<defs>`).
- **Finals / exports** (WebGL2): the same `effects` arrays compile to GLSL
  passes (`app/src/gl/effects/`) — one FBO pair + one filter pass per wrap.
  The GPU recipe is the shipped one.
- **Legacy SVG studio emitter** (`studio/render.mjs`): the string version of
  the same fold, now a **dev-only parity reference** (#192) — the parity
  harness diffs the GPU candidate against it; it is never imported by the
  shipped bundle.

## Filter compiler (`app/src/fx/fxFilters.js`)

One `<filter>` per FX layer, primitives in effect order. Effects **chain
top-down**: the first effect reads `SourceGraphic`, each later effect reads
the previous effect's output, so the stack compounds like an adjustment-layer
chain. `FX_EFFECT_DEFS`
is the single source of truth for the compiler, the panel UI, and this doc.

| Effect | Recipe | Primitives |
|---|---|---|
| `rgbSplit {dx}` | `feColorMatrix` isolates R/G/B → `feOffset` shifts R by +dx, B by −dx → two `feBlend mode="screen"` recombines (lossless per-channel) | 7 |
| `displace {scale, seed}` | `feTurbulence type="fractalNoise"` → `feDisplacementMap` | 2 |
| `tear {bands, amount}` | stretched `feTurbulence` (high Y frequency, near-zero X) → `feComponentTransfer` flattens the Y channel to exactly 0.5 via `feFuncG` → `feDisplacementMap` with `scale = amount × 4` — strictly horizontal shear | 3 |
| `grain {amount}` | `feTurbulence` → `feColorMatrix` (noise → alpha, RGB zeroed) → `feComposite operator="in"` against `SourceAlpha` (grain masked to artwork — no filter-region box on transparent areas) → `feComposite operator="over"` | 4 |
| `blur {radius}` | `feGaussianBlur stdDeviation={radius}` on the source. One primitive — cheapest effect in the stack. WebGL honesty contract (#225): the shader's tap loop caps at 64, so wide radii subdivide into up to 4 (H,V) pass pairs at σ/√n — the full gaussian is always delivered, never a truncated kernel; past the 4-pair ceiling the radius clamps to the honest max for the render width (max 40 is fully delivered at the live loop's full render scale, width 1000) | 1 |
| `scanlines {density, amount}` | anisotropic `feTurbulence` (near-zero X frequency, high Y) → `feColorMatrix` (noise → alpha, RGB zeroed) → `feComposite operator="in"` against `SourceAlpha` → `feComposite operator="over"` — CRT banding, alpha-masked like grain | 4 |
| `posterize {levels}` | `feComponentTransfer` with `feFuncR/G/B type="discrete"` (alpha channel untouched) | 1 |
| `invert` | `feComponentTransfer` with `feFuncR/G/B type="linear" slope="-1"` — full channel flip, no params | 1 |
| `solarize` | `feComponentTransfer` with `feFuncR/G/B type="table"` folding mids bright (`0 0.5 1 0.5 0`) | 1 |
| `edge` | `feConvolveMatrix` 3×3 edge kernel, `preserveAlpha="true"` so transparent areas stay clean | 1 |

Hard rules:

- **Unknown effect kinds fail closed** — skipped at sanitize time and again
  at compile time. A bad effect never blanks the canvas.
- **Filter region is clamped to the viewport** (`0% / 100%`). Unbounded
  filter regions are a silent frame-rate killer; this is a clamp, not a
  tier. Displacement pushing pixels outside the region gets clipped —
  known tradeoff, documented here.
- **`dx` accepts live modulation**: the compiler adds `ctx.dxMod`
  (wired to the audio `beatPulse` in CanvasPanel) for shimmer.

## Showrunner integration

> #192 (WebGL Phase 6) retired the Showrunner's FX cut ladder and the
> per-tier `maxFxLayers` budgets. FX layers are never culled or simplified
> in normal operation — the old silent-cull trap (an FX layer shown in the
> UI while its wrap was shed) is dead. What remains:
>
> - **Budgets:** `turbulenceOctaves` hard-clamps noise detail;
>   `maxFilterPrimitives` is a **warning, not a drop**: primitive count
>   correlates weakly with real GPU cost (a 7-prim channel split is cheaper
>   than one big turbulence+displacement at 4K), so exceeding it logs once
>   per session.
> - The governor's primary shed is now **dynamic resolution scaling**
>   (`renderScale` 1 → 0.75 → 0.5 → 0.33); see `docs/SHOWRUNNER.md` and
>   `src/hooks/governorCuts.js`. If it ever sheds, the ShedBadge in the app
>   footer says so (full indicator design lands in #177).
> - `buildSceneContract` still *reports* any FX wrap it drops as
>   `shed.fxLayerIds` — a future cap can never go silent again.

## Performance

On the GL backend, stacking FX layers costs one extra FBO pair + one
filter pass per wrap — GPU headroom is 10–50x the old SVG filter path, so
the governor no longer touches FX. On the legacy live SVG canvas each
filter still re-rasterizes its wrapped subtree every frame while content
animates; the resolution shed protects that path.

## Determinism

**FX output is excluded from the determinism contract** (like audio/LFO).
`feTurbulence` implementations differ between browsers and resvg, so the
exact grain/displace/tear pattern varies subtly across renderers. Effect
*structure* (which effects, in which order, with which params) is
deterministic and round-trips exactly through project JSON.

## Export audit (resvg, via `studio/render.mjs`)

> Historical record — tested 2026-09-16, when the SVG studio emitter was the
> export recipe. Since #192 the shipped export recipe is the GPU FX chain;
> this table covers the legacy SVG recipe only and is kept as the audit
> trail.

Tested 2026-09-16 with `@resvg/resvg-js`: a project with all ten effects
was rendered to SVG via the studio path and rasterized at 1000×700, plus
isolated per-effect variants diffed against a no-FX baseline.

| Effect | resvg result |
|---|---|
| `rgbSplit` | ✅ survives — chromatic fringing on edges, mean abs diff 5.98 vs baseline |
| `displace` | ✅ survives — warped edges, mean abs diff 10.87 |
| `tear` | ✅ survives — horizontal band shear, strictly x-only, mean abs diff 14.12 |
| `grain` | ✅ survives — film grain over source, alpha-masked to the artwork (2026-09-16 fix: earlier build painted grain across the whole filter region, visible as a box on transparent backgrounds) |
| `blur` | ✅ survives — soft edges, 6040 px changed vs baseline |
| `scanlines` | ✅ survives — horizontal banding over artwork, alpha-masked (no filter-region box) |
| `posterize` | ✅ survives — stepped tones, alpha untouched |
| `invert` | ✅ survives — full channel flip |
| `solarize` | ✅ survives — folded tonal curve |
| `edge` | ✅ survives — edge outlines, alpha preserved (no halo on transparent areas) |

No silent mismatches: every primitive used (`feTurbulence`,
`feDisplacementMap`, `feColorMatrix`, `feOffset`, `feBlend mode="screen"`,
`feComposite operator="over"`/`operator="in"`, `feGaussianBlur`,
`feComponentTransfer`/`feFuncG`/`feFuncR/G/B discrete`) is
supported by resvg. `feBlend screen` is used instead of SVG2
`plus-lighter` (already a documented resvg gap — see BUGLIST). Unknown
effect kinds and hidden FX layers are correctly absent from export.
