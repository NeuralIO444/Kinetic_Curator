# Agent contract — Kinetic Curator

Read this before writing code. The product spec for the current engine push is [`docs/ENGINE_PLAN.md`](docs/ENGINE_PLAN.md). That file wins if this one and a chat prompt disagree.

Long-range layers (do not implement out of order): [`docs/path/README.md`](docs/path/README.md).

## Roles

| Who | Does | Does not |
|-----|------|----------|
| **Coding agent** | One spine letter per PR. CI green. Selfcheck honest. | Merge. Invent the next letter. Re-derive shipped work. |
| **Review agent (Grok)** | Read the PR against ENGINE_PLAN + this file. Flag collisions, stamps, missing tests. | Rewrite the patch in-chat as a second implementation. |
| **Matt** | Play it. Eyes on feel, FEED (#374), icons (#346), M3 costs (#298). Merge word. | |

Do not run two coding agents on the live loop at once. `liveLoop.mjs` / `liveResolve.mjs` / `particles.js` are one-writer files until the spine is through **B**.

## Before you open a branch

1. `git pull origin main`.
2. Read ENGINE_PLAN §0 (**already shipped — do not redo**).
3. Take the **lowest open spine issue** only (A before B before C…). If that issue is not assigned to you, stop.
4. One letter per PR. Do not bundle A with D.

## Already shipped (do not re-implement)

- MOD live + `patchStrength` nullish — PR #382 / issue #343 closed
- MIX color/count stepper (~6 stops/sec) — PR #381
- Preset chips through voice MIX; `count` is `int` — PR #379
- FIELD live pull — PR #373
- FEED live hop — PR #370 (visual sign-off is #374, Matt only)
- Flagship voices + MIX driver — #280
- Audio ballistics module — #306 (not yet on visible life path; that is spine C)
- Bio-drives on the integrator — #287
- 4 content-track cap — #340

If your prompt says "wire MOD" or "stop MIX from freezing every frame," the work is done. Move on.

## Spine (ENGINE_PLAN §3)

```text
A  dt clock                         ← current
B  skip missing atlas cell
C  heading spring + ballistics + life
D  live mask tint (stills baker unchanged)
E  mode-chip pixel dissolve + slider springs
F  shared noise + curl wind + organism vx
G  bufferSubData — piggyback on B or D, not its own epic
```

Parallel tape lane (#342 PR #383, #341 FX cap) is **not** yours unless the issue is assigned. Do not mix tape work into a spine PR.

**Parked until spine E:** tempo clock, slave bus, SYSTEMS/VOICES/PRESETS split. Spec: [`docs/TEMPO_AND_CHIPS.md`](docs/TEMPO_AND_CHIPS.md) + [`docs/ROOM_REVIEW.md`](docs/ROOM_REVIEW.md) + [`docs/path/04-set-spine.md`](docs/path/04-set-spine.md). Do not file or implement T0–T2 while #387 is open.

**Authoring freeze:** no new showcase / persona / bio-drive chips on the performance deck. Extra costumes are DLC/drawer. Bio-drive *engine* stays in core. See [`docs/path/06-library.md`](docs/path/06-library.md).

## PR rules

- Branch: `feat/spine-a-dt` (letter + short slug).
- Title: `feat(engine): spine A — dt clock` (letter in the title).
- Body: issue number, files touched, what you did **not** do, how to QA on the live canvas.
- `npm run selfcheck` green. Do not weaken a golden hash to land feel work. Spine A must hash-match at locked 60 Hz dt.
- Tick the matching checkbox in ENGINE_PLAN §6 in the same PR (docs hunk is fine).
- No new panel. No fifth track. No Perlin rewrite. No second particle system during a dissolve.

## QA the coding agent cannot skip

Feel is not a unit test. Before you ask for review, play it:

- Spine A: drop quality / watch FPS; flock speed must not change character.
- Spine B: slam a palette chip; canvas must keep presenting (no one-second hold).
- Spine C: a kick should shove then settle; silence is still a no-op.
- Spine D: palette change stays ~60; SNAP still matches the hex baker.
- Spine E: grid → swarm is a wipe, not a pop.
- Spine F: two swarm tracks, one seed, shared weather.

Then paste the PR to the review agent. Do not start letter N+1 until this PR is merged.
