# KC-1 engine plan — connect what exists

*Reviewed against `main` at `f2e0fa3` (2026-09-19). Plan, not a patch.*

Companions (do not fork them): [ORGANIC_MOTION.md](ORGANIC_MOTION.md), [NOISE_AND_LAYERS.md](NOISE_AND_LAYERS.md), [KC1_LAYERS.md](KC1_LAYERS.md), [SHOWRUNNER.md](SHOWRUNNER.md).

The instrument is not missing features. It is missing a **spine** that those features share. Several agents shipped complete-looking systems that talk past each other. This note is the one build order so the next agent does not re-solve a problem that already landed today.

Standing bars: no new panel, no fifth track, no second physics world, no Perlin rewrite. Oxman gate — *does it grow, or does it stamp?*

## 0. What another agent already shipped today — do not redo

Same calendar day as this note. Treat these as **landed**. Re-opening them is waste.

| PR | Issue | What it actually did |
|----|-------|----------------------|
| [#382](https://github.com/NeuralIO444/Kinetic_Curator/pull/382) | #343 **closed** | **MOD is live.** `liveResolve` calls `applyMod`. `getItems()` exposes `vx/vy` for swarm. `patchStrength()` is nullish (strength `0` is off, not 0.16). |
| [#381](https://github.com/NeuralIO444/Kinetic_Curator/pull/381) | mix hitch | **Voice MIX no longer rebakes every frame.** `resolveLiveRenderState` steps color/count to ~6 stops/sec. Physics/breath still 60. Explicitly names the fuller fix (stale atlas + skip missing cell) as follow-up. |
| [#379](https://github.com/NeuralIO444/Kinetic_Curator/pull/379) | presets | **Preset chips use the same MIX as voice chips.** `count` / `particleCount` marked `int: true` so `new Array(count)` cannot throw mid-blend. |
| [#373](https://github.com/NeuralIO444/Kinetic_Curator/pull/373) | part of #344 | FIELD live same-frame pull. |
| [#370](https://github.com/NeuralIO444/Kinetic_Curator/pull/370) | part of #345 | FEED live hop + amount slider. Visual sign-off still open as #374. |
| [#329](https://github.com/NeuralIO444/Kinetic_Curator/pull/329) | #280 closed | Flagship voices + MIX driver (clock bug already fixed). |
| [#320](https://github.com/NeuralIO444/Kinetic_Curator/pull/320) | #306 closed | `audioBallistics.mjs` exists. Still ACCUM-path first. |
| [#333](https://github.com/NeuralIO444/Kinetic_Curator/pull/333) | #287 closed | Bio-drives on the integrator. |
| [#340](https://github.com/NeuralIO444/Kinetic_Curator/issues/340) closed | | 4 content-track cap. |
| docs #380 / #384 | | ORGANIC_MOTION + NOISE_AND_LAYERS written. Plans only. |

Stale sentences in older notes:

- [NOISE_AND_LAYERS.md](NOISE_AND_LAYERS.md) §0 said MOD was not on the live path. **Wrong as of #382.**
- [ORGANIC_MOTION.md](ORGANIC_MOTION.md) §2.5 still asks to drop mid-morph integer rounding. **Partially done:** counts are int-bounded so they do not crash; they still *pop* because they round every MIX stop. The atlas-hold hitch is **mitigated** by #381, not removed.

## 1. Diagnosis in one page

Cool pieces, four different clocks, one frozen picture when color moves.

```text
chips / presets  →  voiceMix (lerp numbers, snap enums @ 0.5, step color)
                     ↓
layoutParams     →  liveResolve  →  ParticleSystem.update(Date.now())
                     ↓                 implicit dt = 1, noise3D wind, 10°/frame
                     ↓
                  buildFrame     →  comboKey = asset|ink|accent
                     ↓                 bake sequential SVG → HOLD FRAME if aKey changed
                     ↓
                  drawInstances  →  bufferData(DYNAMIC) every flush
                                     throw if cell missing
```

What that feels like on stage: grid→swarm is a cut (stub chips still hard-set mode). Flagship / preset MIX eases numbers then **swaps the sampler at t=0.5**. Palette MIX is the only true two-deck dissolve. Flock weight changes with FPS. Two swarm tracks do not share weather. Clicking a chip still waits on an atlas bake for new hex.

## 2. Open issues — what they mean for this plan

Open on `main` when this was written:

| # | Title | Engine plan |
|---|--------|-------------|
| **#383 PR / #342** | TAPE FULL pre-flight | Let it land. Do not invent a second tape. |
| **#341** | 4 FX slot cap | Tape hygiene. After #342. Not the motion spine. |
| **#344** | FIELD coupling | Engine contract + live pull exist. Leave open until Matt's eyes / remaining product bits. **Do not re-implement applyField.** |
| **#345 / #374** | FEED + visual sign-off | Live hop shipped. #374 is a review flag, not a rewrite. |
| **#346** | Icons | Matt draws. Not engine. |
| **#298** | M3 cost-model calibration | Needs Matt's machine. Do not guess tiers. |
| **#248** | TE 7→4 panels | Product surface. Do not block the spine. |
| **#270** | Mobile / retina | Separate. |
| **#221 / #228** | Gallery / MIDI | Parked. Stay parked. |

`NEXT_PHASE.md` is superseded (2026-09-17) and still points at Kernel v2 EvalContext / studio harden. Those are **not** why chips jump. Do not reopen #108 step 6 to fix feel.

Known follow-ups already named in shipped code, **not filed as issues** — all five were absorbed by the spine; verified done 2026-09-22:

- MOD from hype/organism tracks is inert (`vx/vy` not on `_organismItems`). **Done, spine F** — `_organismItems()` carries real `vx/vy`.
- Renderer throws on missing atlas cell (#381 commit message). **Done, spine B / #406** — skip missing cell; never hold or throw.
- `motionSmoothing` is never read. **Done, spine C** — scales the heading-spring λ.
- `curl2` is unused. **Done, spine F** — default wind for flock / murmuration / mold.
- Ballistics not on `useCanvasLife` visible scale/alpha. **Done, spine C** — ballistics run on the GL loop clock; `useCanvasLife` itself was then **deleted by #418 (2026-09-22)** as a dead pathway.

## 3. The spine (build this, in this order)

One engine, four layers. Each PR must leave `selfcheck` green and not invent a panel.

### Spine A — Clock  (`liveLoop` → `liveResolve` → `particles`)

The substrate everything else sits on.

- Pass `dtSec` from `performance.now()` in the loop. Clamp ~8–50 ms.
- Convert damp / turn / flap / bounce / scent / energy to per-second at 60 Hz reference (`Math.pow(damp, 60)` …).
- Stop `Date.now()` as sim / noise time. Loop time only.
- Selfcheck: locked 60 Hz dt hashes match today's implicit step.

Until this lands, heading springs, curl wind, and life LFOs still change feel when the governor sheds.

**Do not** start a fixed-timestep accumulator in the same PR. That is a later refinement shared with `studio.py video`.

Touches: `liveLoop.mjs`, `liveResolve.mjs`, `particles.js`.
File the work against [ORGANIC_MOTION.md](ORGANIC_MOTION.md) §2.1 — that section is still accurate.

### Spine B — Present during bake  (`renderer` + `liveLoop`)

#381 reduced how often color moves. The hitch remains whenever `aKey` changes.

1. Missing `cells[comboKey]`: **skip the instance**, do not throw, do not `return null` from `buildFrame`.
2. Keep simulating and presenting the last good frame **and** any instances whose cells exist.
3. Incremental bake (missing keys only) is the second PR, not the first.

This is the follow-up #381 already pointed at. Do not replace #381's stepper until skip-missing ships — both can coexist; stepper becomes unnecessary for color after Spine D.

Touches: `renderer.mjs` `instanceData`, `liveLoop.mjs` `buildFrame` / `startStaticBuild`.

### Spine C — Heading + visible ballistics

- Critically damped heading instead of snap / 10°-per-frame. Wire the dead `motionSmoothing` knob as lambda scale.
- Run `processBallistics` on the life path (`scaleMul` / `alphaBoost` / glow) with loop dt. Keep ACCUM silence-is-zero.
- Layered life LFO from the GL loop, not `setLifeT` at 30 Hz. Per-agent phase from existing `seedOffset`.

Touches: `particles.js` rotation block, `useCanvasLife.js`, `audioBallistics.mjs`, `layoutSlice.js`.
[ORGANIC_MOTION.md](ORGANIC_MOTION.md) §2.2–2.4 still accurate.

### Spine D — Color without a bake  (shader tint, live only)

Atlas cell today is `(asset, ink, accent)` baked hex. `QUAD_FS` only multiplies opacity.

- Bake each **asset once** as an ink/accent **mask** (R/G coverage).
- Instance attribs carry ink + accent RGB. Palette / MIX lerp those floats.
- Stills / studio keep the colored baker so golden hashes do not move in this PR.
- Delete the need to step hex in `resolveLiveRenderState` for color.

Do **not** do this before Spine B (you still need skip-missing for new assets).
Do **not** rewrite offline `atlas.mjs` in the same PR.

Touches: `liveAtlas.mjs`, `QUAD_VS` / `QUAD_FS`, `instanceData` stride, `voices.js` color path.

### Spine E — Dissolve the cast, spring the knobs

Two different gestures. Do not implement them as one lerp.

| Gesture | Mechanism | Status |
|---------|-----------|--------|
| Palette chip | GPU hold + `mixWithHold` | **Shipped** (#278) |
| Flagship voice / preset | Single-state lerp + enum snap @ 0.5 + #381 stops | **Shipped, still a cut on mode** |
| Stub mode chip (grid, fibo, …) | Hard store write | **Still a cut** |
| Slider | Instant store write | **Still a cut** |

Next:

1. Stub chips and mode enums ride the **paletteMix state machine** (hold pixels of A, live B). Same `mixEase`, same retarget rule. Duration = MIX slider or voice `blendSeconds`.
2. Do **not** simulate two swarms for 10 s. Hold A's framebuffer.
3. Sliders: `current → target` exp damp on the loop clock. Float count; fade spawn/death. Round only when the gesture ends.
4. Stop snapping `mode` / `behave` / assets at t=0.5 once the wipe exists.

#379 already routed presets into MIX — extend that machine, do not add `applyPreset` 2.0.

### Spine F — One weather  (noise + patches)

[NOISE_AND_LAYERS.md](NOISE_AND_LAYERS.md) still holds except the MOD row.

1. One `createNoise(projectSeed)` owned by the resolver. Tracks offset domain via `seedOffsets.noise`.
2. Default flock / murmuration / mold wind = existing `curl2`. Keep `noise3D → angle` as `point` for scatter / HYPE.
3. Live placement `nt` as an offset pass in `liveResolve`, not a geometry-cache bust.
4. MOD from organism tracks: put `vx/vy` on `_organismItems` (named follow-up in #382).
5. FEED-from-curl for sparse weather voices only after Matt signs #374.

Do **not** add a noise layer type. Do **not** rewrite Simplex as Perlin.

### Spine G — Hygiene when touching the instance path

Only while already in `instanceData` / `drawInstances` (B or D):

- Reuse one `Float32Array`, `bufferSubData` into a capped VBO.
- Fold per-item non-normal blends up to the layer. Scratch-per-item is the real instancing killer.

Not its own epic. See the bufferSubData / instancing notes in the working session; they are not worth a freeze-the-loop PR.

## 4. Suggested PR sequence (agents read this first)

```text
A  dt clock                          ← start here; everything else lies if FPS moves
B  skip missing atlas cell           ← unblocks chips during bake
C  heading spring + ballistics+life  ← feel, no new surface
D  live mask tint                    ← color MIX at 60; stills baker unchanged
E  mode-chip pixel dissolve          ← grid→swarm is a wipe; sliders spring
F  shared noise + curl wind          ← tracks share weather; needs A's clock
G  pack/subdata                      ← piggyback on B or D
```

Parallel, **other lane** (do not mix into A–F):

- Merge / review **PR #383** (#342 tape pre-flight).
- #341 FX cap after tape.
- #374 FEED eyes (Matt).
- #298 M3 numbers (Matt's machine).
- #346 icons (Matt draws).

First two engine PRs: **A + B**. That is a flock that keeps its weight at 30 fps and a chip click that does not freeze the picture. No new look, no new seed break if A hashes at locked dt.

## 5. Killed / parked (agents: do not file these)

- A motion tab, easing graph, or second MIX slider.
- Fifth content track or a "noise layer" type.
- Perlin rewrite; node-graph patch bay.
- Dual live particle systems during a dissolve.
- Fullscreen motion blur / fullscreen color grade as the tint system.
- Persistent-mapped buffers, compute particles, WASM for feel.
- Replacing #381's stepper *before* B+D.
- Re-wiring MOD / FIELD / FEED from scratch.
- Reopening Kernel v2 EvalContext (#108.6) or studio FastAPI to fix animation.
- MIDI, gallery, Asset Studio as blockers for the spine.

## 6. Acceptance for "the engine is solid"

> **Annotation (2026-09-22, Matt-approved):** every box below is **code-verified** — selfcheck green (except the two GPU-dependent suites that fail pre-spine-A; see the `SPINE_REVIEW_C_F.md` errata) and QA exercised on the dev canvas. The ears/eyes-only feel rows — 30/60 flock character, wipe-not-pop, two-track shared weather, `motionSmoothing` audible — **still await Matt's play-it sign-off**, which `EMBARGO.md` records as not yet given. A tick here means "verified as far as a coding agent can verify," not Matt's sign-off.

- [x] 30 fps and 60 fps flocks match speed / turn / damping (A).
- [x] Tab-switch does not jump the noise field (A).
- [x] Palette or voice chip never returns `buildFrame === null` for a full second (B).
- [x] Audio hit shoves then settles; silence still no-ops (C).
- [x] Palette change at 60 with zero `startStaticBuild` for color (D).
- [x] SNAP / studio hashes unchanged across D (stills baker still hex).
- [x] Grid → swarm is a picture wipe, not a sampler pop (E).
- [x] Two swarm tracks, one project seed, share weather; offset is domain, not a second universe (F).
- [x] MOD from a HYPE track moves knobs (organism vx).
- [x] `motionSmoothing` is audible on stage.
- [x] No new panel. Tape / governor model unchanged unless smear becomes a pass.

## 7. File map (ownership)

| File | Owns |
|------|------|
| `gl/liveLoop.mjs` | Clock, bake policy, paletteMix hold, present-during-bake |
| `gl/liveResolve.mjs` | dt forward, shared noise, live warp offset, patches |
| `engine/particles.js` | dt integrate, heading, curl vs point, organism vx |
| `engine/noise.js` | Already has curl2 / fBm — use it |
| `gl/liveAtlas.mjs` | Live mask bake (D). Keep hex baker for stills |
| `gl/atlas.mjs` | Offline / parity — do not flip in the live tint PR |
| `gl/shaders.mjs` QUAD_* | Instance tint |
| `gl/renderer.mjs` | Skip missing cell, pooled upload |
| `gl/paletteMix.mjs` | State machine to reuse for mode chips |
| `data/voices.js` | Stop stepping hex after D; stop enum snap after E |
| `hooks/useCanvasLife.js` | **deleted by #418 (2026-09-22)** — was "meters only after C"; life/ballistics are loop-owned now |
| `gl/audioBallistics.mjs` | Already the follower |
| `state/slices/layoutSlice.js` | `motionSmoothing` becomes live |
| `state/slices/layersSlice.js` | Caps / patch rows — no new type |

## 8. How to work this without two agents colliding

1. Read this file and the "already shipped" table before opening a branch.
2. One spine letter per PR. Do not bundle A with D.
3. If a live issue is **open but the code path exists** (#344, #345), add tests or product polish — do not re-derive `applyField` / `applyFeed`.
4. After merge, tick the matching acceptance box here in the same PR (docs-only hunk is fine).
5. Matt's eyes issues (#374, #346, #298) are not agent-closeable.
