# Agent contract — Kinetic Curator

Read this before writing code. The product spec for the current engine push is [`docs/ENGINE_PLAN.md`](docs/ENGINE_PLAN.md). That file wins if this one and a chat prompt disagree.

**Embargo:** [`docs/EMBARGO.md`](docs/EMBARGO.md) — no new features until spine C is merged and Matt has played the body. Deferred labs are not tickets.

**Physics & Animation Mandate:** [`docs/ALWAYS_ALIVE.md`](docs/ALWAYS_ALIVE.md) — The "Always Alive" Protocol.

Long-range layers (do not implement out of order): [`docs/path/README.md`](docs/path/README.md).

## Roles

| Who | Does | Does not |
|-----|------|----------|
| **Coding agent** | One spine letter per PR. CI green. Selfcheck honest. | Merge. Invent the next letter. Re-derive shipped work. |
| **Review agent (Grok)** | Read the PR against ENGINE_PLAN + this file. Flag collisions, stamps, missing tests. | Rewrite the patch in-chat as a second implementation. |
| **Matt** | Play it. Eyes on feel, FEED (#374), icons (#346), M3 costs (#298). Merge word. | |

Do not run two coding agents on the live loop at once. `liveLoop.mjs` / `liveResolve.mjs` / `particles.js` stay one-writer files for any concurrent work, spine or not — the "through B" clause is moot now (spine is through F).

## Before you open a branch

1. `git pull origin main`.
2. Read ENGINE_PLAN §0 (**already shipped — do not redo**).
3. **Spines A–F (#387–#392) are closed, and #341 (FX 4-cap) landed as PR #412 — there is no open spine letter and no lowest-open coding item waiting.** What's open: Matt-only feel (#374, #346, #298), parked (#221, #228), and product lanes (#248 panel consolidation, #270 mobile, #344/#345 leftovers). The #248 coding plan is [`docs/PANEL_CONSOLIDATION_PLAN.md`](docs/PANEL_CONSOLIDATION_PLAN.md) — read its open-questions section first; those need Matt's nod, not a guess. If what you're about to touch isn't assigned to you, stop.
4. One letter per PR. Do not bundle A with D. (Note: C–F did not go through this — see below.)
5. Read the issue body AND every comment on the issue before writing code. Comments carry acceptance criteria, edge cases, and recorded decisions — build them in, don't rediscover them.

## Already shipped (do not re-implement)

- MOD live + `patchStrength` nullish — PR #382 / issue #343 closed
- MIX color/count stepper (~6 stops/sec) — PR #381
- Preset chips through voice MIX; `count` is `int` — PR #379
- FIELD live pull — PR #373
- FEED live hop — PR #370 (visual sign-off is #374, Matt only)
- Flagship voices + MIX driver — #280
- Audio ballistics module — #306 (now on the visible life path — spine C wired it into the GL loop clock)
- Bio-drives on the integrator — #287
- 4 content-track cap — #340

If your prompt says "wire MOD" or "stop MIX from freezing every frame," the work is done. Move on.

## Spine (ENGINE_PLAN §3) — all closed as of 2026-09-21

```text
A  dt clock                         ← merged #405, closed #387
B  skip missing atlas cell          ← merged #406, closed #388
C  heading spring + ballistics + life  ← closed #389 (PR #407 opened, closed unmerged — landed as a direct push to main instead)
D  live mask tint (stills baker unchanged)  ← closed #390 (no PR — direct push)
E  mode-chip pixel dissolve + slider springs  ← closed #391 (no PR — direct push)
F  shared noise + curl wind + organism vx  ← closed #392 (no PR — direct push)
G  bufferSubData — piggyback on B or D, not its own epic  ← landed #408 (bundled with the D blend fix), 2026-09-22
```

C–F were reviewed only after landing, in one batch (`docs/SPINE_REVIEW_C_F.md`), not via the per-letter PR + review-agent gate this file describes. That review pass turned up one live-canvas regression from D: `app/src/gl/renderer.mjs:435` skipped every non-`normal`-blend layer item because the isolated-item cell lookup lacked the `cells[it.asset]` fallback that the normal-blend path (`packInstanceData`) has. **Fixed by #408 (merged 2026-09-22)** — the isolated path now goes through `packInstanceData`, batched per consecutive same-blend run. No longer a blocker; see `docs/SURFACES.md` for the record.

Tape lane (#342 PR #383) merged 2026-09-21. **#341** (FX 4-cap) landed as PR #412 and the issue is closed — do not take it.

**Parked pending spine E sign-off:** tempo clock, slave bus, SYSTEMS/VOICES/PRESETS split. Spec: [`docs/TEMPO_AND_CHIPS.md`](docs/TEMPO_AND_CHIPS.md) + [`docs/ROOM_REVIEW.md`](docs/ROOM_REVIEW.md) + [`docs/path/04-set-spine.md`](docs/path/04-set-spine.md). Spine E is code-merged, but this doc doesn't record Matt's play-it sign-off — treat as still parked until he says otherwise.

**Authoring freeze:** no new showcase / persona / bio-drive chips on the performance deck. Extra costumes are DLC/drawer. Bio-drive *engine* stays in core. See [`docs/path/06-library.md`](docs/path/06-library.md).

**No labs until C is felt:** chip editor, species dish, UV scroll, HarfBuzz, synbio chrome — [`docs/CHIP_LAB.md`](docs/CHIP_LAB.md), [`docs/ASSET_LAB.md`](docs/ASSET_LAB.md), [`docs/SYNTHETIC_BIOLOGY.md`](docs/SYNTHETIC_BIOLOGY.md).

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
