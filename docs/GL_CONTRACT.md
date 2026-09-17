# GL Scene Contract (Phase 0, #186)

The exact data interface the WebGL backend consumes. This document is the
normative spec; `app/src/gl/sceneContract.js` is the implementation and
`app/src/gl/sceneContract.selfcheck.mjs` is the executable verification.

**Status:** v1. No GL rendering code exists yet — this phase defines the
contract and the parity harness only.

## Decisions baked in

- **WebGL2** target. The SVG renderer becomes a dev-only parity reference
  at visual parity; it is not shipped and has no export role (raster-only
  output: GPU readback at 4K/8K, upscale later).
- **60fps live first.** Phase order: 0 contracts → 1 assets → 2 FX →
  3 compositing → 4 ACCUM → 5 export → 6 governor.
- **#185's chaining spec is frozen as data.** Effect stacks execute
  top-down in array order: the first effect reads the layer source, each
  later effect reads the previous effect's output. Phase 2 changes only
  the compiler target (SVG primitives → GLSL), never the order.
- **Additive only.** The contract is satisfiable from existing store
  state with no schema changes. New needs land here as additive fields.

## Building a scene

```js
import { resolveLayers } from '<repo>/studio/render.mjs';
import { buildSceneContract } from 'app/src/gl/sceneContract.js';

const resolvedLayers = resolveLayers(projectDoc, { caps });
const scene = buildSceneContract({ doc: projectDoc, resolvedLayers, caps, accum });
```

`accum` is `{ enabled, fade, background }` (from `useAccumulationBuffer`
params) or `null`. The builder is pure and deterministic: same inputs →
byte-identical JSON (`serializeSceneContract`).

## Shape (v1)

```
{
  version: 1,                       // bump on breaking change; consumers reject unknown versions
  canvas: { w: 1000, h: 700 },
  seed: <uint32>,                   // top-level project seed (provenance)
  quality: 'balanced',              // render tier the contract was built under
  atlas: {
    assets: [ { id, w: 100, h: 100, uv: null } ]
    // Phase 1 fills `uv: [x, y, w, h]` when assets are baked to the texture
    // atlas. Phase 0 records referenced ids only. Source box is 100x100.
  },
  layers: [
    {
      id, name,
      type: 'content' | 'fx',
      visible: true,                // resolved layers are pre-filtered
      opacity: 0..1,                // layerOpacity
      blend: <blend mode>,          // layerBlendMode; 'normal' for fx layers
      matte: { sourceId, mode: 'alpha'|'luma', invert } | null,
                                    // #154 re-plan (#189): mask texture sampled
                                    // in the composite shader; null = no matte
      // content layers only:
      layout: { blendMode, hueRotate },
      // fx layers only:
      fx: [ { kind, params } ]      // sanitized, top-down execution order (#185)
    }
  ],
  compositeOrder: [<layerId>]       // bottom -> top; backend draws in this order
  fxWraps: [                        // precomputed buildLayerStack fold
    { fxLayerId, filterId: 'fx-<id>', opacity, contentLayerIds: [<ids below>] }
  ],
  instances: [                      // flat instanced-quad list; draw order = array order
    {
      asset,                        // atlas id
      layer,                        // owning content layer id
      x, y,                         // px in canvas space (1000x700)
      scaleX, scaleY,                // asset-box units; mirrored items negate scaleX
      rotation,                     // degrees, clockwise (SVG convention)
      tint: '#rrggbb',               // item ink  (was var(--ink))
      accent: '#rrggbb',             // item accent (was var(--accent))
      opacity: 0..1,                // item alpha / 100
      blend: <blend mode>,           // per-item blend from layoutParams.blendMode
      zTier, key                    // metadata; key is the kernel placement identity
    }
  ],
  textRuns: [],                     // reserved for the Phase 1 glyph atlas.
                                    // Text is currently baked into stamp assets.
  accum: null | { enabled, fade: 0..0.99, background: '#rrggbb' },
  provenance: { contractVersion, caps }
}
```

## Semantics the backend must preserve

1. **FX wrap fold.** An FX layer wraps *all content accumulated below it*
   (see `fxWraps`); layers above the topmost FX layer are never wrapped.
   A shed/inactive FX layer passes content through unwrapped (it simply
   produces no wrap entry). The wrap group's opacity is the FX layer's
   `layerOpacity`; the FX layer's own blend mode is ignored.
2. **Effect order.** `fx` arrays execute top-down, first effect reading
   the wrapped source. Unknown kinds never appear (builder sanitizes);
   `assertSceneContract` rejects hand-built scenes containing them.
3. **Instance order.** Within a layer, instances draw in array order.
   The backend must not re-sort (the kernel already ordered them).
4. **Blend modes.** `blend` strings are CSS blend keywords. The `plus-lighter`
   → `screen` substitution (#96) is a resvg limitation, not a contract
   change: the contract records the authored mode.
5. **Colors.** `tint`/`accent` are sRGB hex. The backend converts to linear
   on upload; the reference path bakes them into per-combination symbols.
6. **Filter output is outside the determinism contract** (as in
   `fxFilters.js`). FX scenes use the relaxed parity policy.
7. **Layer mattes** (#154 re-plan, #189). `layer.matte` is a mask texture,
   not an SVG mask: the backend renders the matte source layer's raw group
   content (instances over transparent, opacity baked in; the source's own
   blend mode and matte are ignored) into a mask target, then samples it in
   the composite shader. The layer's alpha is multiplied by the mask value —
   mask alpha for `mode: 'alpha'`, sRGB relative luminance
   (0.2126/0.7152/0.0722) for `mode: 'luma'` — optionally inverted. A matte
   whose source is missing, is not a content layer, or closes a cycle
   (self-matte, A↔B, longer loops) is ignored and the layer renders
   normally (fail closed). On FX layers the matte masks the wrap result at
   composite time. The SVG reference path has no matte implementation, so
   mattes are verified by exact shader-math probes, not SVG cross-checks.

## Parity harness

`app/src/gl/parity/`:

| File | Role |
|---|---|
| `corpus.mjs` | 6 fixed scenes (geometry baseline, multi-blend, 2-deep FX chain, 3-deep FX chain, invert wrap+opacity, 3-stack FX wraps), each with a diff policy |
| `reference.mjs` | Scene → SVG (`studio/render.mjs`) → RGBA via resvg |
| `candidate.mjs` | GL-side interface stub — throws until Phase 1 (#187) |
| `diff.mjs` | Pixel diff with documented tolerance policy |
| `run.mjs` | CLI: `node src/gl/parity/run.mjs [--candidate svg\|gl] [--scene id] [--width 400] [--json]` |

**Tolerance policy.** Default: per-channel tolerance 8/255, at most 0.1%
of pixels over tolerance. FX scenes: 24/255, 2% (turbulence-based effects
rasterize differently per backend by design). Every report echoes the
policy used, so a PASS is auditable.

**Modes.** `--candidate svg` renders reference-vs-reference: must PASS;
it proves the harness (corpus + renderer + diff) is sound and is the
only mode available in Phase 0. `--candidate gl` compares against the GL
backend once Phase 1 implements `renderCandidate`.

**Wiring.** `npm run parity` runs the full corpus. `npm run selfcheck`
includes the contract tests, the diff-engine tests, and harness integrity
(corpus validity, SVG determinism, resvg self-parity smoke, stub check).

## Versioning

- `GL_CONTRACT_VERSION` bumps on any breaking shape change.
- Additive fields do not bump the version.
- Phase 1 will fill `atlas[].uv` and `textRuns`; both are additive.

## What Phase 0 deliberately does NOT include

GLSL, WebGL context code, the texture atlas baker, the shader library,
FBO compositing, GPU ACCUM, GPU readback export. Those are Phases 1–5.
