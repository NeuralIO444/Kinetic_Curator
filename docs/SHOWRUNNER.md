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
| 1 | FX simplify | Turbulence octaves → 1, grain off | Auto |
| 2 | FX bypass | Keep first visible FX layer only | Auto |
| 3 | Quality step | HIGH → BALANCED → PERF | Auto |
| 4 | Mirror/gloss/ACCUM shed | Existing `perfTier1` (FPS < 16, 2s) | Auto |
| 5 | Asset thinning | Drop highest-`costScore` assets first (25%) | Auto |
| 5b | Count clamp | Existing render-only `perfClampOverride` | Auto |
| 6 | Freeze motion | `slowRender`: Evolve/LFO/ACCUM/swarm paused | Auto |
| 7 | Hard stop | Existing watchdog trip — manual resume | Manual |

Cuts 1–2 are **live since #180**: FX layers (`type: 'fx'`) exist and the
governor spends ladder steps on them — simplify, then bypass.

## Budgets (§7)

Each quality tier carries per-subsystem ceilings in `data/quality.js`:

| Subsystem | PERF | BALANCED | HIGH |
|---|---:|---:|---:|
| Placements | 180 | 420 | 800 |
| Particles | 100 | 200 | 350 |
| Active FX layers | 1 | 2 | 3 |
| Filter primitives / FX layer | 4 | 6 | 8 |
| Assets / layer | 24 | 48 | 96 |
| Turbulence octaves | 1 | 2 | 3 |

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
- Governor state (`fxShedLevel`, `assetThin`, `frameLock`, `perfTier1`,
  `slowRender`, `perfClampOverride`, `stageTimings`) never serializes into
  project JSON; neither does `costScore` (deterministic from `svg`).
- Enforced by `src/state/showrunner.selfcheck.mjs` in `npm run selfcheck`.

## Extension points for the FX system (#152) — implemented in #180

The FX layer system (`docs/FX_LAYERS.md`) wires up every cut:

- `fxShedLevel` is read in `CanvasPanel.jsx`'s FX fold: `1` → octaves=1 /
  grain off (in `compileFxPrimitives`), `2` → only the first visible FX
  layer (bottom-up) still applies.
- Per-tier budgets from `getQualityCaps()`: `maxFxLayers` skips FX layers
  beyond the allowance; `turbulenceOctaves` hard-clamps noise detail;
  `maxFilterPrimitives` warns once per session instead of dropping —
  primitive count correlates weakly with real GPU cost, so the binding
  degradation is the shed ladder, not prim counting.
- The studio/export path runs at `shedLevel: 0` (the Showrunner never runs
  offline) but honors `maxFxLayers`; uncapped final renders get
  `FINAL_CAPS` (`maxFxLayers: Infinity`) — full FX, per the proxy/final
  invariant.
