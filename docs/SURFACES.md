# Surfaces — wired vs looks wired

*Against `main` 2026-09-22 (`44a519b`). Spines A–F (#387–#392) are merged and closed — this file previously described their pre-merge gaps; that table has been folded into "Live" below. For agents who will not read a novel.*

Full plan: [ENGINE_PLAN.md](ENGINE_PLAN.md). Agent contract: [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md).

If a control exists in the UI or a function exists in the tree, it is **not** automatically live. This is the map.

## Live (do not rebuild)

| Surface | Where it actually runs |
|---------|------------------------|
| KC-1…KC-4 content tracks, 4-cap | `layersSlice.js` #340 |
| PATCH row OFF / MOD / FIELD / FEED | `liveResolve.mjs` — all three flavors call the engine |
| MOD | #382 `applyMod` + `motionMetrics`. Organism `vx/vy` now real (#392 F `_organismItems`) |
| FIELD | #373 same-frame pull, hop-capped 4px |
| FEED | #370 delay-1 hop. Eyes: #374 |
| Flagship voice chips + preset chips | MIX lerp (#280, #379). Enums still snap at t=0.5 (mode/behave/assets — unchanged by E, which only covers stub chips + sliders) |
| Palette MIX | `paletteMix.mjs` GPU hold + dissolve |
| MIX freeze mitigation | #381 steps color/count ~6/s. Atlas-hold hitch fixed by #388 B (skip missing cell instead of holding/throwing) |
| Audio ballistics on the visible life path | `audioBallistics.mjs` #306, wired into `liveLoop.mjs`'s GL clock by #389 C. Silence-is-zero preserved |
| Bio-drives | `particles.js` #287 |
| ACCUM + velocity smear | GPU ping-pong; smear on live quads only while ACCUM on |
| Governor tape readout / shed ladder / preflight | shipped, incl. PR #383 / #342 (merged 2026-09-21) |
| `createNoise` + `fBm3D` + `curl2` | `noise.js`. `curl2` now the default wind for flock/murmuration/mold (#392 F); `noise3D → angle` kept as `point` mode for scatter/HYPE |
| dt clock | `liveLoop` passes real `dtSec` end to end; `Date.now()` no longer drives sim/noise time (#387 A) |
| `motionSmoothing` | live — scales the heading-spring lambda (#389 C) |
| Life breath | GL-loop-owned LFO, per-agent phase offset via `seedOffset`, not a 30 Hz React sine (#389 C) |
| Palette tokens mid-MIX, **normal-blend items** | live shader tint via asset-id mask atlas (#390 D). See regression note below for non-normal blends |
| Stub chips (grid, fibo, …), voice/preset mode & behave, sliders | route through the `paletteMix` state machine — picture wipe, not a cut (#391 E). Float particle counts fade in/out instead of popping |
| Two swarm tracks, one project seed | share one `createNoise` instance, offset by `seedOffsets.noise` (#392 F) |

## Known regression (found in review, unverified against the running canvas)

| Surface | Truth | Where |
|---------|-------|-------|
| Non-`normal` layer blend modes (multiply/screen/…) on the **live** canvas | `renderLayerInstances`'s isolated-item path looks up `cells[\`${asset}\|${tint}\|${accent}\`]` with no fallback. The live atlas (#390 D) only ever has single-asset keys (`comboKey = asset`) — `packInstanceData`, the normal-blend batch path, already falls back with `\|\| cells[it.asset]`; this path does not. Every non-normal-blend item is silently skipped, every frame, live-only (stills/offline bake still keyed by full combo, unaffected). | `app/src/gl/renderer.mjs:435` |

## Other lane (not the spine)

| # | Status |
|---|--------|
| #341 | FX 4-cap, dimmed unreached-for slots — unblocked now that tape preflight (#342) is merged. Open. |
| #344 / #345 | Engine is in. Issues stay open for product leftovers + #374 eyes |
| #346 #298 | Matt draws / Matt's machine |
| #248 | TE 7→4 panels — product surface |
| #270 | Real iPhone |
| #221 #228 | Parked. Stay parked |
