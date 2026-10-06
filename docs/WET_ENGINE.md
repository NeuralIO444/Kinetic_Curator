# WET ENGINE — a standalone wetness service (research + phases)

**Status:** research, not yet built. Phases A–C below are the proposed path.
**Scope:** decouple the wetness (2D) engine from ACCUM so it becomes an
independent service other systems can subscribe to — layer interaction, FX,
exports — with ACCUM demoted from *owner* to *one consumer among several*.

Written up 2026-10-06 from the #1068 drill and the grain bug (#1069), which is
the cautionary tale this document is built around: a capability that exists on
one render path and silently does nothing on the others is worse than no
capability at all.

---

## 1. What the wetness engine is today

`app/src/gl/vortex.mjs` — a **CPU-side 64×64 simulation**, no GL dependency:

- `noteWetFrame(slot, { wetness, freeze, seed, width, height, instances, behave, motion })`
  steps the sim and returns `{ wetStep, wetGain, wetAmount, wetVel, wetMask }`.
- Content instances stamp the wet mask (paint landed) and shed vortons;
  `emitFromInstances` (`vortex.mjs:157`) emits per moving mark, sorted by
  `layer|key` so the result is **order-deterministic**.
- The sim is **seeded** (`mkRng`) and reset only on seed/size change
  (`vortex.mjs:558`), so the same inputs give the same mask every time.

What it costs: it already calls `registerCostTier`, and the governor can shed
it (`perfTier1`) before the picture degrades — the repo's no-FX-cuts doctrine.

## 2. The only two things that tie it to ACCUM

| Coupling | Where | What it is |
|---|---|---|
| **The gate** | `app/src/gl/liveLoop.mjs:718` — `const wet = (accumulation && !perfTier1) ? noteWetFrame(...) : { wetStep: 0, wetMask: null, … }` | the sim only *runs* when ACCUM is on and hasn't been shed |
| **The single consumer** | `app/src/gl/accum.mjs:134,177-180` → feed shaders `u_wetVel` / `u_wetMask` (`accum.mjs:509-534`) | results are read only by the ACCUM feedback program |

Everything else is already clean:

- **Dependency direction is right.** `vortex.mjs` imports only `costTiers`,
  `velocitySmear`, `prng` — zero `accum` imports. Engine → consumer, not the
  reverse.
- **Headless-testable.** CPU sim, seeded, order-deterministic → assertable in a
  node selfcheck with no GL.
- **Cost-metered.** `registerCostTier` is already wired.

So the coupling is two lines of *policy*, not architecture. That is what makes
this rescope cheap.

## 3. Known gaps this rescope must close

1. **Exports never see wet.** No `noteWetFrame` / `wetMask` reference exists in
   `renderer.mjs` or the still paths, and `renderAccumSequence` calls
   `accumRecipeParams` **without** the wet params. Wet is live-only today.
2. **The history dies with the toggle.** `wetSlot.vortex = null` fires when ACCUM
   turns off (`liveLoop.mjs:1092`), so the field's memory is owned by a switch.
3. **Freeze is borrowed.** `freeze = accumFrozen || !running || slowRender` —
   wet's clock is derived from ACCUM's controls, not its own policy.
4. **`perfTier1` kills it outright** rather than degrading it.

## 4. The rescope: a wet-frame service

```
                    ┌─ ACCUM feed          (today's consumer, now optional)
wet-frame service ──┼─ composite mask      (WET layer interaction — new)
  (owns wetSlot,    ├─ FX template uniform (effects that read the field — new)
   steps per frame) └─ exports             (deterministic warm-up — new)
```

- **Gate becomes need-based:** `accum || anyWetRow || anyWetEffect` — the
  service runs if *anything* reads it, and never for nothing.
- **ACCUM becomes a reader.** It passes `wetMask`/`wetVel` into the feed shader
  exactly as it does now; nothing about the trails changes.
- **Ownership moves with the gate.** The vortex survives ACCUM toggling;
  its lifetime is the session's, not a checkbox's.

### Acceptance (Phase A, no visible change)

A before/after selfcheck over fixed inputs (seed, size, instance list) must
produce byte-identical `wetMask`/`wetVel` — the refactor is proven by
*identical output*, not by inspection.

## 5. The four decisions (the real work)

1. **Clock.** One transport, one answer: wet follows `running`, FREEZE holds it
   too. Two clocks would desync the wet feel from the trails it's supposed to
   agree with.
2. **Governor.** At `perfTier1`, **degrade** (skip advection, keep static
   stamping) instead of killing it. A WET row must never silently stop being
   wet — the #1069 rule, generalized: *if a mode is selectable, it must either
   work or say why it can't.*
3. **Exports — the hard one.** Because the sim is seeded and order-deterministic,
   `renderScene` / `renderFrameOffscreen` can run a **fixed warm-up of K steps**
   over the same instances and be byte-reproducible. Pick K, document it,
   selfcheck it. This must ship *with* the first consumer, not after (same three
   call sites as #1069).
4. **Parity.** GL-only: the SVG reference cannot express an advected,
   time-varying mask. Because WET is **opt-in per row**, the default parity
   sweep stays green; the documented fallback is "mask absent → static blend",
   the same shape as the `plus-lighter → screen` substitution.

## 6. Phases

| Phase | Content | Acceptance |
|---|---|---|
| **A — decouple** (pure refactor) | Extract gate + ownership into a wet-frame service; still consumed only by ACCUM | byte-identical `wetMask`/`wetVel` for fixed inputs; full selfcheck green; no visual change |
| **B — consumer #2** | Composite reads the mask for rows in a WET interaction mode; FIELD can shape the stamping (`samplePattern`, `app/src/pattern/field.js:112`) | selfcheck per behaviour: mask present → blend varies spatially; mask absent → static blend byte-exact |
| **C — exports + parity** | Deterministic K-step warm-up in `renderScene`/`renderFrameOffscreen`; document the SVG fallback; cost tier for the new sampling | screen vs PNG parity selfcheck; parity harness green with WET off |

Phases A and C are well-scoped single-fix PRs. B is the feature. **C ships with
B, not after it.**

## 7. Other systems that could be built the same way

The pattern that made this rescope tractable is worth naming, because at least
five other subsystems in the tree fit it:

**Checklist — what qualifies a system for standalone-engine treatment**

1. deterministic core (seeded, order-stable) → headless selfcheck;
2. CPU-side or otherwise testable without a GL context;
3. already cost-metered (`registerCostTier`) → degradable, never silently dead;
4. opt-in consumers → default parity/selfcheck stays green;
5. an export rule written down before the first consumer ships.

**Candidates, ranked:**

| Engine | Today | What it would serve if standalone |
|---|---|---|
| **MOD bus** — `app/src/gl/audioBallistics.mjs` (#306) + `MATH_MOD_SOURCES` (`none/rms/flux/beatPulse`) | envelope shaping is shared, but *subscription* is not: `applyMathMod` runs only for `layer.type === 'math'` (`renderer.mjs:745`) | any parameter anywhere: FX knobs, layer opacity, WET amount, palette mix. The wet interaction of Phase B wants exactly this (audio swelling the merge), and today content rows have no mod slot at all. Highest leverage of the five. |
| **FIELD service** — `app/src/pattern/field.js` (#1039, #1061) | `samplePattern(name, x, y, p)`: a pure, period-1 spatial sampler, already stateless and headless | the *shape* input for any mask: wet stamping (B), layer interaction regions, FX masks, PATTERN tracks. Pairing it with the wet engine turns the field from "a pattern a track draws" into "structure other systems can read". |
| **FLOW** — `app/src/gl/flowField.mjs` | 32×32 project-seed curl, consumed by the ACCUM recipe (`rp.flowField`) | advect the wet field and any layer drift through the *same* curl, so trails, wet and drifting layers all move coherently. Another ACCUM-owned field with the same ownership problem as wet. |
| **CLOCK** — `app/src/gl/beatClock.mjs` (#950) | the BEAT master clock, already exposed as a control | BEAT-quantized transitions elsewhere — #1042 (PATTERN motion) explicitly wants BEAT-quantized shuffle and should share this clock rather than grow a second one. |
| **MIX** — `app/src/gl/paletteMix.mjs` (#278) | VJ MIX crossfade state machine, driving palette transitions | layer-level colour interaction (a WET row whose blend *colour* crossfades on the same state machine). |

**SMEAR** (`velocitySmear.mjs`, #309) already passes the checklist — it is
shared by the renderer and lives on the objects — and is the working example of
what the others should look like.

## 8. Non-goals

- No change to what ACCUM looks like; its trails keep reading the same mask.
- No new panel. WET-as-interaction (Phase B) is a row-level control, and its
  gate is visible, never a mode that silently does nothing.
- No SVG parity claim for time-varying masks — documented divergence, not
  emulation.

## Provenance

- Assembled during the #1068 drill (FX editor sizing, merged 2026-10-06).
- The failure mode this document is designed against: **#1069** — grain renders
  only on the ACCUM path because `fxFinishChains` is discarded at
  `liveLoop.mjs:1098-1100` and in `renderFrameOffscreen` / `renderScene`.
- Related: #1048/#1066 (FX folds before MATH) fixed the *order* of the fold;
  this document is about giving the fold another *input*.
