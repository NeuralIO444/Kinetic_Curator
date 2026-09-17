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

Both the live app and the offline studio fold the stack bottom-up with the
same rule: content layers accumulate; each applied FX layer wraps the
accumulator in `<g filter="url(#fx-{layerId})">`, then stacking continues
above it.

- Live: `CanvasPanel.jsx` → `buildLayerStack()`; one `<filter>` per active
  FX layer rendered by `FxFilterDefs` into `<defs>`.
- Studio: `studio/render.mjs` — string version of the same fold, filters
  from `fxFilterStringForLayer()`.

## Filter compiler (`app/src/fx/fxFilters.js`)

One `<filter>` per FX layer, primitives in effect order. `FX_EFFECT_DEFS`
is the single source of truth for the compiler, the panel UI, and this doc.

| Effect | Recipe | Primitives |
|---|---|---|
| `rgbSplit {dx}` | `feColorMatrix` isolates R/G/B → `feOffset` shifts R by +dx, B by −dx → two `feBlend mode="screen"` recombines (lossless per-channel) | 7 |
| `displace {scale, seed}` | `feTurbulence type="fractalNoise"` → `feDisplacementMap` | 2 |
| `tear {bands, amount}` | stretched `feTurbulence` (high Y frequency, near-zero X) → `feComponentTransfer` flattens the Y channel to exactly 0.5 via `feFuncG` → `feDisplacementMap` with `scale = amount × 4` — strictly horizontal shear | 3 |
| `grain {amount}` | `feTurbulence` → `feColorMatrix` (noise → alpha, RGB zeroed) → `feComposite operator="in"` against `SourceAlpha` (grain masked to artwork — no filter-region box on transparent areas) → `feComposite operator="over"` | 4 |

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

The FX system is what the Showrunner's dormant FX cuts were waiting for
(see `docs/SHOWRUNNER.md`):

- **Cut 1 (simplify):** `shedLevel >= 1` forces all `feTurbulence`
  `numOctaves` to 1 and drops `grain` effects entirely.
- **Cut 2 (bypass):** only the first visible FX layer (bottom-up — the
  smallest wrapped subtree, cheapest to keep) still applies.
- **Budgets:** `turbulenceOctaves` hard-clamps noise detail;
  `maxFxLayers` skips FX layers beyond the tier's allowance (first N
  bottom-up). `maxFilterPrimitives` is a **warning, not a drop**: primitive
  count correlates weakly with real GPU cost (a 7-prim channel split is
  cheaper than one big turbulence+displacement at 4K), so exceeding it logs
  once per session. The binding degradation is the shed ladder.
- The studio/export path runs at `shedLevel: 0` — the Showrunner never runs
  offline — but honors `maxFxLayers`, so a balanced-quality still matches
  the live app. Uncapped final renders get `FINAL_CAPS`
  (`maxFxLayers: Infinity`): full FX, per the proxy/final invariant.

## Performance

Stacking FX layers is the steepest per-frame cost in the app: each filter
re-rasterizes its entire wrapped subtree every frame while content
animates. One FX layer with the default stack is fine on most hardware;
three or more with turbulence effects will push the governor into its FX
cuts on integrated GPUs. Prefer fewer, lower FX layers over many small
ones — a topmost FX layer re-rasterizes everything below it.

## Determinism

**FX output is excluded from the determinism contract** (like audio/LFO).
`feTurbulence` implementations differ between browsers and resvg, so the
exact grain/displace/tear pattern varies subtly across renderers. Effect
*structure* (which effects, in which order, with which params) is
deterministic and round-trips exactly through project JSON.

## Export audit (resvg, via `studio/render.mjs`)

Tested 2026-09-16 with `@resvg/resvg-js`: a project with all four effects
was rendered to SVG via the studio path and rasterized at 1000×700, plus
isolated per-effect variants diffed against a no-FX baseline.

| Effect | resvg result |
|---|---|
| `rgbSplit` | ✅ survives — chromatic fringing on edges, mean abs diff 5.98 vs baseline |
| `displace` | ✅ survives — warped edges, mean abs diff 10.87 |
| `tear` | ✅ survives — horizontal band shear, strictly x-only, mean abs diff 14.12 |
| `grain` | ✅ survives — film grain over source, alpha-masked to the artwork (2026-09-16 fix: earlier build painted grain across the whole filter region, visible as a box on transparent backgrounds) |

No silent mismatches: every primitive used (`feTurbulence`,
`feDisplacementMap`, `feColorMatrix`, `feOffset`, `feBlend mode="screen"`,
`feComposite operator="over"`, `feComponentTransfer`/`feFuncG`) is
supported by resvg. `feBlend screen` is used instead of SVG2
`plus-lighter` (already a documented resvg gap — see BUGLIST). Unknown
effect kinds and hidden FX layers are correctly absent from export.
