# Showrunner — the realtime performance governor

Showrunner is Kinetic Curator's performance authority: a governor that keeps
the instrument responsive during live play by measuring load and shedding work
**in a defined order**. Its core rule:

> A stalled instrument is failure; a simpler live frame is not.

It extends the existing performance machinery (`usePerformanceGovernor`, the
watchdog) rather than replacing it.

## The cut list

Order is the contract. One step per sustain (1.6s) + cooldown (8s) cycle:

| # | Cut | What it does | Recovery |
|---|-----|--------------|----------|
| 1 | Resolution scaling | `renderScale` 1 → 0.75 → 0.5 → 0.33 | Auto |
| 2 | Quality step | HIGH → BALANCED → PERF | Auto |
| 3 | Mirror/gloss/ACCUM shed | Existing `perfTier1` (FPS < 16, 2s) | Auto |
| 4 | Asset thinning | Drop highest-`costScore` assets first (25%) | Auto |
| 5 | Count clamp | Existing render-only `perfClampOverride` | Auto |
| 6 | Freeze motion | `slowRender`: Evolve/LFO/ACCUM/swarm paused | Auto |
| 7 | Hard stop | Existing watchdog trip — manual resume | Manual |

Pixels drop before anything visible is cut. (#192 / WebGL Phase 6 retired the
old FX-simplify / FX-bypass cuts 1–2: on the GPU, FX compositing is one extra
FBO pair + one filter pass per wrap — 10–50x headroom — and culling FX caused
the **silent-cull trap**: an FX layer shown in the UI while its wrap was
dropped. Contract: `src/hooks/governorCuts.js`, pure and unit-tested.)

## Budgets (§7)

Each quality tier carries per-subsystem ceilings in `data/quality.js`:

| Subsystem | PERF | BALANCED | HIGH |
|---|---:|---:|---:|
| Placements | 180 | 420 | 800 |
| Particles | 100 | 200 | 350 |
| Active FX layers | ∞ | ∞ | ∞ |
| Filter primitives / FX layer | warning only | warning only | warning only |
| Assets / layer | 24 | 48 | 96 |
| Turbulence octaves | 1 | 2 | 3 |

`maxFxLayers` is retired as a budget (#192) — every tier carries `Infinity`;
FX layers are never culled in normal operation. `maxFilterPrimitives`
**warns** once per session instead of dropping: primitive count correlates
weakly with real GPU cost (a 7-prim channel split is cheaper than one big
turbulence+displacement at 4K), so the binding degradation is the cut ladder
above, not prim counting.

Filter regions clamp to the viewport (`MAX_FILTER_REGION = 1.0`) — a clamp,
not a tier; it applies at every quality level.

## The patrol (§4)

`useFpsMeter` is the Showrunner's eyes: besides FPS (~4Hz store sync), any
pipeline stage can call `reportStage('kernel', ms)`; samples aggregate as
rolling averages and sync at the same 4Hz cadence. The patrol stays cheap —
sampling, never per-frame store writes. The kernel stage is instrumented at
the `useCanvasItems` boundary (the engine itself is frozen). The governor
currently acts on FPS only; `stageTimings.__frame` (`{avg, worst}`) is the
signal future stages will read.

## Asset cost (§6)

`assetCostScore = subpaths × (1 + groupDepth/8)` — computed once at ingest,
never per frame. Canon assets score lazily via `getAssetCost()`. The sprite
sheet renders cheap-first; ingest warns (never blocks) above
`COST_WARNING_THRESHOLD = 600`.

## Frame-lock show mode

The **30FPS** toggle in the MasterBar is a *user choice*, not a degradation:
it gates the life tick — the dominant per-frame re-render driver — to a
locked ~30Hz. A locked 30fps reads smoother than a fluctuating 40–60 and
roughly halves React render work. Never auto-cleared, never serialized.

## The hard invariant

Showrunner degrades only the **live proxy**:

- `RENDER FINAL · UNCAPPED` bypasses every cut via `FINAL_CAPS`
  (`getRenderCaps(q, true)` is tier-independent).
- Governor state (`renderScale`, `assetThin`, `frameLock`, `perfTier1`,
  `slowRender`, `perfClampOverride`, `stageTimings`) never serializes into
  project JSON; neither does `costScore` (deterministic from `svg`).
  (#192: `fxShedLevel` retired — the FX cut ladder is gone.)
- Enforced by `src/state/showrunner.selfcheck.mjs` in `npm run selfcheck`.

## Extension points for the FX system (#152) — implemented in #180

The FX layer system (`docs/FX_LAYERS.md`) wires up every cut:

> #192 (WebGL Phase 6) retired the FX cut ladder and the per-tier
> `maxFxLayers` budgets. FX layers are never culled or simplified — the
> governor sheds resolution (`renderScale`) before anything visible is cut.
> See `src/hooks/governorCuts.js` for the cut order contract.
>
> - Per-tier budgets from `getQualityCaps()`: `turbulenceOctaves`
>   hard-clamps noise detail; `maxFilterPrimitives` warns once per session
>   instead of dropping — primitive count correlates weakly with real GPU
>   cost, so the binding degradation is the shed ladder, not prim counting.
> - `buildSceneContract` reports any shed FX wrap as `shed.fxLayerIds`
>   (empty in normal operation) — the silent-cull trap cannot return.
