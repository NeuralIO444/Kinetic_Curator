# KC-1 engine plan — generation 2

*Rewritten 2026-10-03 against `main` at `3717876`. Successor to the 2026-09-19 spine note. Plan, not a patch.*

Gen-1 is closed. Do not rebuild it. This note is the build order so the next agent does not re-solve a problem that already landed.

Companions, do not fork them: [ORGANIC_MOTION.md](ORGANIC_MOTION.md), [NOISE_AND_LAYERS.md](NOISE_AND_LAYERS.md), [KINETICS.md](KINETICS.md), [KINEME.md](KINEME.md), [TRAILS_EMITTERS_REPORT.md](TRAILS_EMITTERS_REPORT.md).

`KINEME.md` is stale. It still says no build is authorized and that revert PR #782 is open. Both are wrong as of 2026-09-30. Read this file first.

Standing bars: no new panel, no fifth track, no second physics world, no Perlin rewrite. Oxman gate — *does it grow, or does it stamp?* One PR, one writer, `selfcheck` green. Pixel proof is on the default in-thread loop, not `?worker=1`.

## 0. Already shipped — do not redo

| What | Landed | Do not |
|---|---|---|
| Spines A–G (clock, skip-missing, heading + ballistics, mask tint, mode wipe + slider springs, shared curl weather, pooled upload) | #405, #406, direct pushes; acceptance ticked 2026-09-22 | Reopen a spine letter. Re-derive `applyMod` / `applyField` / `applyFeed`. |
| Night Migration 30/60 feel | Embargo lifted 2026-09-23, recorded in [EMBARGO.md](EMBARGO.md) | Treat a merged spine as unsigned. Also do not retune that picture without a new feel call. |
| MOD live, MIX stepper, preset MIX | #382, #381, #379 | Re-open. |
| Frame strips in the asset system | Reverted #782 (2026-09-30) | Put `sub` rigs, `__fN` cells, or an ANIM badge back on assets. |
| KINEME Build A | **#784 merged 2026-09-30.** `data/kinemes.js`: spin, rock, pulse, blink, bob. `QUAD_VS` reads a uniform table. Instance floats 18 and 19 carry kineme id and per-copy phase. `kinemeRate` 0–4, anchored. Tier 0. Measured on the default loop (RATE 0 and no-kineme are 0 changed pixels). | A second library, a `kineme.mjs` evaluator, or “spare” floats. Those floats are spent. |
| Freeze holds the loop clock | #842 | A second freeze path for motion. |

Build C (cell strips: needle, waveform) and the DAVIS picker / RATE surface were explicitly out of #784. They are not this generation. See parked.

## 1. What gen-1 did not fix

- **LIFE drift is a metronome.** `applyLifeDrift` is three fixed sines (0.7 / 0.45 / 0.3). Breath and flap are fine. This was not the Night Migration gate. It is a feel retune, and it waits on an explicit call.
- **FLOW does not share weather.** ACCUM advects through its own seedless GPU noise. Spine F’s `worldNoise` never reaches the trail. Two weathers, one picture. This is a wiring fix, not the Stage 3 GPU field.
- **Ink does not stay.** ACCUM fade is live. Stroboscopic LEAVE is #560, still open. The issue title also names RIBBON, COMET, and live ECHOES. Those are not one PR.
- **Music does not spawn.** Onset moves knobs. It does not emit. Breed already inherits. A burst is not a spawn call — it moves count, the governor, and placement hashes.
- **Brush “trail” is not this trail.** #893 / #894 (open 2026-10-03) are placement stamp jitter. Not ACCUM.

## 2. Lanes

No letter chain. H, J, and a modulation matrix do not sit on each other. Gen-1’s order was real because later letters lied without the clock. This work does not.

### Lane 1 — Engine feel, only on a new call

**LIFE drift.** Replace the three sines with seeded fBm time on the existing `worldNoise`. Pure function, called from `liveResolve.mjs` and `studio/render.mjs`. Same project seed, same domain offset as spine F. No new noise type. Do not extract `liveResolve` in this PR. The KINETICS orchestrator split stays a proposal.

Gate: Matt says the drift is wrong. Until that sentence exists, this lane does not open. Acceptance is a recorded Night Migration A/B, not “does not repeat in 18 s.” fBm on a short domain still loops.

**FLOW wire, separate PR, not gated on the feel call.** Point the ACCUM advect sample at `worldNoise`, or stop calling it curl. Do not bundle with LEAVE. Do not build the Stage 3 scent / curl texture in this PR. Agents stay CPU.

### Lane 2 — Trails, one mode

**LEAVE only (#560).** Stamp on the existing ACCUM composite. CLEAR is the only erase. Fade path unchanged.

Name the shed in the cost registry. Kineme got tier 0 because it is a shader uniform. Ink that does not die is not tier 0.

Out of scope, written in the PR body: RIBBON, COMET, live ECHOES, hierarchical emission, brush emitters (#894 wobble). Those stay on #560 until LEAVE is signed.

### Lane 3 — not this generation

| Item | Why it waits |
|---|---|
| #790 modulation matrix | DAVIS / stimuli lane. Extending TRACKS there. Do not re-derive `applyMod`. |
| KINEME Build C | Stepped-cell question in KINEME.md §6 is unanswered. Needs new instance data. Floats 18–19 are taken. |
| Event bursts | After LEAVE is signed. Spawn is a pure function of project seed and loop time. Silence emits nothing. PR pins a golden for silence and for one seeded onset. |
| #722 behave ease | Spine E erratum: steering eases over ~1 s, no second dissolve. Not a generation. |
| Favorites sequencer (#895) | Product surface. Docs may scope it. Not an engine PR. |
| Fixed-timestep accumulator | Deferred in spine A. Still shared with studio video. |
| GPU scent field, shared curl texture, transform feedback, WebGPU | Roadmap Stage 3 / Beyond. After the FLOW wire, not instead of it. |

## 3. First PR

Whichever of the two open lanes you want played.

- Drift, if you call the metronome wrong.
- Else LEAVE.
- Else the FLOW wire, if two weathers on one picture is the bug you want gone.

Not a third kineme.

## 4. Acceptance

Code-verified is not a play-it. Same rule as the 2026-09-22 annotation on the spine note.

- Drift A/B recorded, or the lane stayed shut.
- FLOW sample and swarm wind share a seed, or the UI stops saying curl.
- LEAVE holds ink until CLEAR. Fade path unchanged. Shed is named.
- No new panel. Four content tracks. Freeze still holds the loop clock (#842).
- Brush stamp jitter did not land inside the LEAVE PR.

## 5. Docs the next agent will misread

Annotate, do not rewrite history:

- This file supersedes the “start at spine A” paragraph in the 2026-09-19 note.
- [KINEME.md](KINEME.md): #782 and #784 merged; Build A is done; floats 18–19 are spent; §6 stepped-cell question still open.
- [EMBARGO.md](EMBARGO.md) in-flight table is historical. The 2026-09-23 lift is the status.
