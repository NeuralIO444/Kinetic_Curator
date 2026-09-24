# Surfaces — wired vs looks wired

*Against `main` 2026-09-22 (`de32a50`). Spines A–F (#387–#392) are merged and closed — this file previously described their pre-merge gaps; that table has been folded into "Live" below. For agents who will not read a novel.*

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
| Flagship voice chips + preset chips | MIX lerp (#280, #379). Enums take `to` for any `t>0` since E (`mixVoiceState`/`lerpParamValue`) — the old t=0.5 snap is gone |
| Palette MIX | `paletteMix.mjs` GPU hold + dissolve |
| MIX freeze mitigation | #381 steps color/count ~6/s. Atlas-hold hitch fixed by #388 B (skip missing cell instead of holding/throwing) |
| Audio ballistics on the visible life path | `audioBallistics.mjs` #306, wired into `liveLoop.mjs`'s GL clock by #389 C. Silence-is-zero preserved |
| Bio-drives | `particles.js` #287 |
| ACCUM + velocity smear | GPU ping-pong; smear on live quads only while ACCUM on |
| Governor tape readout / shed ladder / preflight | shipped, incl. PR #383 / #342 (merged 2026-09-21) |
| `createNoise` + `fBm3D` + `curl2` | `noise.js`. `curl2` now the default wind for flock/murmuration/mold (#392 F); `noise3D → angle` kept as `point` mode for scatter/HYPE |
| dt clock | `liveLoop` passes real `dtSec` end to end; `Date.now()` no longer drives sim/noise time (#387 A) |
| Instance upload (spine G) | `renderer.mjs` `bufferSubData` into a grown-once instance buffer (20-float stride), landed #408 (2026-09-22) |
| `motionSmoothing` | live — scales the heading-spring lambda (#389 C) |
| Life breath | GL-loop-owned LFO, per-agent phase offset via `seedOffset`, not a 30 Hz React sine (#389 C) |
| Palette tokens mid-MIX, **all blend modes** | live shader tint via asset-id mask atlas (#390 D). The non-normal-blend gap D left was fixed by #408 — see "Regression found in review" below |
| Stub chips (grid, fibo, …), voice/preset mode & behave, sliders | route through the `paletteMix` state machine — picture wipe, not a cut (#391 E). Float particle counts fade in/out instead of popping |
| Two swarm tracks, one project seed | share one `createNoise` instance, offset by `seedOffsets.noise` (#392 F) |

## Regression found in post-landing review — fixed by #408

| Surface | What happened | Status |
|---------|-------|-------|
| Non-`normal` layer blend modes (multiply/screen/…) on the **live** canvas | `renderLayerInstances`'s isolated-item path looked up `cells[\`${asset}\|${tint}\|${accent}\`]` with no fallback. The live atlas (#390 D) only ever has single-asset keys (`comboKey = asset`) — `packInstanceData`, the normal-blend batch path, already falls back with `\|\| cells[it.asset]`; this path did not. Every non-normal-blend item was silently skipped, every frame, live-only (stills/offline bake still keyed by full combo, unaffected). | **Fixed** by #408 (merged 2026-09-22): the isolated path now goes through `packInstanceData`, batched per consecutive same-blend run. |

## Other lane (not the spine)

| # | Status |
|---|--------|
| #341 | FX 4-cap, dimmed unreached-for slots — **merged as PR #412, issue closed** (2026-09-22). |
| #344 / #345 | Engine is in. Issues stay open for product leftovers + #374 eyes |
| #346 #298 | Matt draws / Matt's machine |
| #248 | TE 7→4 panels — product surface |
| #270 | Real iPhone |
| #221 #228 | Parked. Stay parked |
