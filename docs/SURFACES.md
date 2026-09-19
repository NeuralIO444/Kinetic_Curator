# Surfaces — wired vs looks wired

*Against `main` 2026-09-19 (`18bd49f` + later docs). For agents who will not read a novel.*

Full plan: [ENGINE_PLAN.md](ENGINE_PLAN.md). Agent contract: [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md).

If a control exists in the UI or a function exists in the tree, it is **not** automatically live. This is the map.

## Live (do not rebuild)

| Surface | Where it actually runs |
|---------|------------------------|
| KC-1…KC-4 content tracks, 4-cap | `layersSlice.js` #340 |
| PATCH row OFF / MOD / FIELD / FEED | `liveResolve.mjs` — all three flavors call the engine |
| MOD | #382 `applyMod` + `motionMetrics`. Swarm `vx/vy` yes. HYPE/organism source **inert** (no vx on `_organismItems`) |
| FIELD | #373 same-frame pull, hop-capped 4px |
| FEED | #370 delay-1 hop. Eyes: #374 |
| Flagship voice chips + preset chips | MIX lerp (#280, #379). Enums still snap at t=0.5 |
| Palette MIX | `paletteMix.mjs` GPU hold + dissolve |
| MIX freeze mitigation | #381 steps color/count ~6/s. Hitch remains on new comboKey |
| Audio ballistics **module** | `audioBallistics.mjs` #306 — ACCUM path. Not `useCanvasLife` scale/alpha |
| Bio-drives | `particles.js` #287 |
| ACCUM + velocity smear | GPU ping-pong; smear on live quads only while ACCUM on |
| Governor tape readout / shed ladder | shipped. Preflight is PR #383 / #342 |
| `createNoise` + `fBm3D` + `curl2` | `noise.js`. curl2 **unused** by the swarm |

## Looks live, is not (spine work)

| Surface | Truth | Issue |
|---------|-------|-------|
| Flock speed at 30 vs 60 fps | implicit dt=1, `Date.now()` into noise | #387 A |
| Atlas during palette/voice change | missing cell **throws**; `buildFrame` returns null | #388 B |
| `motionSmoothing` | default true, **never read** | #389 C |
| Audio shove on the moths | raw pulse into life; ballistics not on that path | #389 C |
| Life breath | one sine, React 30 Hz `lifeT` | #389 C |
| Palette tokens mid-MIX | hex baked into atlas (`asset\|ink\|accent`) | #390 D |
| Stub chips (grid, fibo, …) | hard `mode=` write | #391 E |
| Voice MIX `mode` / `behave` / assets | cut at t=0.5 | #391 E |
| Sliders | instant store write | #391 E |
| Two swarm tracks, one weather | each `createNoise` | #392 F |
| Mode `flow` | `sin`, not a noise field | #392 F (don't lie-rename) |
| Placement displacement `nt` | frozen seed slice | #392 F |
| MOD from HYPE | inert | #392 F |

## Other lane (not the spine)

| # | Status |
|---|--------|
| #342 / PR #383 | Tape preflight — let that PR finish |
| #341 | FX 4-cap — after tape |
| #344 / #345 | Engine is in. Issues stay open for product leftovers + #374 eyes |
| #346 #298 | Matt draws / Matt's machine |
| #248 | TE 7→4 panels — product surface |
| #270 | Real iPhone |
| #221 #228 | Parked. Stay parked |

## One-writer files until B merges

`app/src/gl/liveLoop.mjs`, `app/src/gl/liveResolve.mjs`, `app/src/engine/particles.js`.

Implement **#387 only** until it is merged.
