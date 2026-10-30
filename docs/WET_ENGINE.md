# WET ENGINE — a standalone wetness service (research + phases)

**Status:** Phase A landed 2026-10-28 (#1809 slice A — the wet-frame
service is `app/src/gl/wetFrame.mjs`, consumed by ACCUM through the live
loop; the gate/ownership below reads as the pre-service state it
replaced). Phase C landed with #1815 and Phase B with #1814 (see the
status notes below). **Resolution:**
#1810 (2026-10-28) moved the sim to a 128 grid / 20 Jacobi iterations /
4096 vorton cap with a measured cost registration — the "64×64" below is
the pre-#1810 state; measurements in `docs/review/1810/`.
**Pigment:** #1811 (2026-10-29) added the two pigment compartments to the
field — suspended + deposited, Kubelka-Munk mixing in
`app/src/gl/pigmentKM.mjs`, stepped inside the sim in Curtis order
(MoveWater → MovePigment → TransferPigment). ACCUM's fade absorbs buffer
light by the deposited layer's KM reflectance; the dish reads pigment as
stain in the backstage field view only and never consumes it. A field
with no coloured marks carries no pigment and steps byte-identically to
the pre-pigment sim. Measurements in `docs/review/1811/`.
**Edge darkening:** #1812 (2026-10-29) added the signature on the
deposit: an accrued field channel darkens a cell's displayed density by
`1 + accrued`, where the accrual grows by `K · |∇d|` (K = 1.35) scaled
by how much of the damp band (wetness 0.35 → 0.05, this doc's regime
thresholds) the cell's wetness fell through in a step. No state machine:
no wet/drying/dry enum, no persistence timer — previous wetness is read,
never stored as regime. Rewet cycles accrue again, capped at 2. The
accrual is state (exported, hashed, warm-up-deterministic), lives in the
deposited pack every reader already consumes, and accrues identically
under the degraded shed path. Measurements in `docs/review/1812/`.
**Wet look:** #1813 (2026-10-29) added the display half: a fullscreen
pass over the upscaled ACCUM presentation, in linear before the
resolve, remapping the presented frame by the field sample read
through this doc's regime thresholds (ramp damp → soaked) — saturation
rises, luminance skews darker (per ground class: the glossy skew on
dark grounds, a stronger never-brightening bend on paper), and a
highlight-gated sheen lifts the brightest wet pixels. It reads the
edge-darkened pack in the frame and adds no rim of its own. Strengths
are recipe constants in `app/src/gl/wetLook.mjs`; the pass is a pure
function of frame + field + ground so warm-up stills (#1815) match
live. Measurements in `docs/review/1813/`.
**Warm-up exports:** #1815 (2026-10-29) closed the stills gap: the
export paths rehearse the field before rendering — `gl/wetWarmup.mjs`
runs the wet-frame service for a fixed warm-up of K = 90 steps over
the project's instances at project-state positions/motion, and every
still call site consumes the served field: `renderScene` (the wet
recipe terms ride the payload, the #1813 wet-look pass runs over the
finished frame from the payload's display state), the `accumStill`
sequence (the field held across the sequence, freeze-hold semantics),
and `renderFrameOffscreen` (the capture frame's own served field,
assembled by liveLoop exactly as the tick arms `setWetLook`). Same
seed + instances + K → byte-identical field → byte-identical wet
contribution; the export readout names it — "wet: warm-up K=90".
WETNESS = 0 skips the warm-up entirely and exports byte-identically
to before. Pigment and its edge darkening are field state and warm up
with it (the pack is consumed as served, never re-applied). The SVG
fallback divergence is signed in the parity harness ("mask absent →
static blend", `parity/corpus.mjs` KNOWN_DIVERGENCES); the corpus
keeps WETNESS at 0, so the sweep is untouched. The warm-up's cost is
pinned: K steps at the 128-grid constants under a 2 s ceiling,
asserted with a timing log in `wetWarmup.selfcheck`.
**Dish migration:** #1841 (2026-10-29) landed slice B of #1809: the
dish is the service's second consumer. Its wet quantities — the pair
medium's curves, the grip verdicts behind bond formation, the
integrator's drag — read the field through the service's `sampleWet`
(the standing state at the pair's midpoint / at each body), and its
contacts stamp into the field through the frame request's `stamps`,
applied with the marks' own on the full and degraded paths alike.
The dish is the first `degradedOk` consumer: at the tier-1 shed the
field degrades to stamps-only service for it instead of dying, and
the served mode is published to the personas' show block as its shed
line (`gl/wetLive.mjs`). The bake runs the same contract through a
caller-injected service, stepped per bake step from the bodies (the
kernel imports no gl, so the driver takes the service by
injection). A driver with no service attached keeps the
knob-uniform medium bit for bit. Measurements in
`docs/review/1841/`.
**Footprint stamps + diffusion:** #1876 (2026-10-29) fixed the
grid-dots defect in the stamp/transport model: a mark now stamps water
+ pigment over the quad it draws (semi-axis 99.75 × instance scale,
plateau profile across the face), conserving the stamp's total load,
and the suspended compartment diffuses laterally inside MovePigment
(PIGMENT_DIFFUSE 0.002, pairwise-conservative) — gated to the worked
film (cells a stamp touched since the last step), so a wash forms at
rest while a wash that is only drying still strands its pigment per
the edge-darkening doctrine above. The deposited layer never moves
laterally; scale-less instances keep the pre-#1876 point splat
exactly. Stationary-mark centre/midpoint deposit ratio at the
51.4-unit pitch: ~43 → 1.28 (drifting control ~1.2). Measurements in
`docs/review/1876/`.
**Strata soak:** #1814 (2026-10-29) landed Phase B, the composite
consumer: a CONTENT stratum can be put in WET interaction mode (a
row-level toggle in BUILD beside the blend modes; the flag lives on
the document layer and rides the scene contract only while on, so
unflagged scenes hash and render exactly as before). Where the field
is wet, the stratum's composite is rebuilt soaked inside the one
composite program — its source smeared along the field's velocity and
pre-multiplied by the field's local absorption (the deposited KM
reflectance where pigment has landed, the ground colour alone where
none has) — and mixed in by the local wetness, `w = mix(w_dry,
w_soaked, fieldWetness)`; where the field is dry the pixel is the dry
composite, bit for bit. The live loop requests the field for soak
rows through the service's need-based gate (the service contract is
unchanged), so a soaking stratum's marks stamp and wet their own
ground even with ACCUM off. Warm-up exports soak identically (the
#1815 ferry's packs are the composite's packs). At perfTier1 the
service sheds: mask absent → static blend, and the row's WET
indicator dims in BUILD. The soak's sampling carries its own cost
registration (`gl/wet-soak`, tier 0 — the shed is the service's,
never a silent thinning). Recipe + CPU mirror in
`app/src/gl/wetSoak.mjs`; measurements in `docs/review/1814/`. One
clause of the Phase B text is conditional on a layout kind that does
not exist yet: no content stratum's layout uses the pattern FIELD
sampler today (`samplePattern`'s only consumer is the PATTERN tile
engine), so FIELD-shaped stamping has no antecedent to bind to — the
stamping itself ships (above); the shaping binds the day a content
layout adopts a FIELD pattern, at the stamp in `emitFromInstances`.
**Scope:** decouple the wetness (2D) engine from ACCUM so it becomes an
independent service other systems can subscribe to — layer interaction, FX,
exports — with ACCUM demoted from _owner_ to _one consumer among several_.

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

| Coupling                | Where                                                                                                                             | What it is                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **The gate**            | `app/src/gl/liveLoop.mjs:718` — `const wet = (accumulation && !perfTier1) ? noteWetFrame(...) : { wetStep: 0, wetMask: null, … }` | the sim only _runs_ when ACCUM is on and hasn't been shed |
| **The single consumer** | `app/src/gl/accum.mjs:134,177-180` → feed shaders `u_wetVel` / `u_wetMask` (`accum.mjs:509-534`)                                  | results are read only by the ACCUM feedback program       |

Everything else is already clean:

- **Dependency direction is right.** `vortex.mjs` imports only `costTiers`,
  `velocitySmear`, `prng` — zero `accum` imports. Engine → consumer, not the
  reverse.
- **Headless-testable.** CPU sim, seeded, order-deterministic → assertable in a
  node selfcheck with no GL.
- **Cost-metered.** `registerCostTier` is already wired.

So the coupling is two lines of _policy_, not architecture. That is what makes
this rescope cheap.

## 3. Known gaps this rescope must close

1. **Exports never see wet.** No `noteWetFrame` / `wetMask` reference exists in
   `renderer.mjs` or the still paths, and `renderAccumSequence` calls
   `accumRecipeParams` **without** the wet params. Wet is live-only today.
   **Closed by #1815** — the still paths now warm the field up
   deterministically (`gl/wetWarmup.mjs`) and consume it at all three
   call sites; see the Warm-up exports status note at the top.
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
  service runs if _anything_ reads it, and never for nothing.
- **ACCUM becomes a reader.** It passes `wetMask`/`wetVel` into the feed shader
  exactly as it does now; nothing about the trails changes.
- **Ownership moves with the gate.** The vortex survives ACCUM toggling;
  its lifetime is the session's, not a checkbox's.

### Acceptance (Phase A, no visible change)

A before/after selfcheck over fixed inputs (seed, size, instance list) must
produce byte-identical `wetMask`/`wetVel` — the refactor is proven by
_identical output_, not by inspection.

## 5. The four decisions (the real work)

1. **Clock.** One transport, one answer: wet follows `running`, FREEZE holds it
   too. Two clocks would desync the wet feel from the trails it's supposed to
   agree with.
2. **Governor.** At `perfTier1`, **degrade** (skip advection, keep static
   stamping) instead of killing it. A WET row must never silently stop being
   wet — the #1069 rule, generalized: _if a mode is selectable, it must either
   work or say why it can't._
3. **Exports — the hard one.** Because the sim is seeded and order-deterministic,
   `renderScene` / `renderFrameOffscreen` can run a **fixed warm-up of K steps**
   over the same instances and be byte-reproducible. Pick K, document it,
   selfcheck it. This must ship _with_ the first consumer, not after (same three
   call sites as #1069).
4. **Parity.** GL-only: the SVG reference cannot express an advected,
   time-varying mask. Because WET is **opt-in per row**, the default parity
   sweep stays green; the documented fallback is "mask absent → static blend",
   the same shape as the `plus-lighter → screen` substitution.

## 6. Phases

| Phase                            | Content                                                                                                                                     | Acceptance                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — decouple** (pure refactor) | Extract gate + ownership into a wet-frame service; still consumed only by ACCUM                                                             | byte-identical `wetMask`/`wetVel` for fixed inputs; full selfcheck green; no visual change — **landed (#1809 slice A, `app/src/gl/wetFrame.mjs` + `wetFrame.selfcheck`)** |
| **B — consumer #2**              | Composite reads the mask for rows in a WET interaction mode; FIELD can shape the stamping (`samplePattern`, `app/src/pattern/field.js:112`) | selfcheck per behaviour: mask present → blend varies spatially; mask absent → static blend byte-exact — **landed (#1814, `app/src/gl/wetSoak.mjs` + `wetSoak.selfcheck`; the FIELD-shaping clause's antecedent does not exist for content strata yet — see the Strata soak status note)** |
| **C — exports + parity**         | Deterministic K-step warm-up in `renderScene`/`renderFrameOffscreen`; document the SVG fallback; cost tier for the new sampling             | screen vs PNG parity selfcheck; parity harness green with WET off — **landed (#1815, `app/src/gl/wetWarmup.mjs` + `wetWarmup.selfcheck`; the `accumStill` sequence consumes the held field too)** |

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

| Engine                                                                                                 | Today                                                                                                                            | What it would serve if standalone                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MOD bus** — `app/src/gl/audioBallistics.mjs` (#306) + `MATH_MOD_SOURCES` (`none/rms/flux/beatPulse`) | envelope shaping is shared, but _subscription_ is not: `applyMathMod` runs only for `layer.type === 'math'` (`renderer.mjs:745`) | any parameter anywhere: FX knobs, layer opacity, WET amount, palette mix. The wet interaction of Phase B wants exactly this (audio swelling the merge), and today content rows have no mod slot at all. Highest leverage of the five. |
| **FIELD service** — `app/src/pattern/field.js` (#1039, #1061)                                          | `samplePattern(name, x, y, p)`: a pure, period-1 spatial sampler, already stateless and headless                                 | the _shape_ input for any mask: wet stamping (B), layer interaction regions, FX masks, PATTERN tracks. Pairing it with the wet engine turns the field from "a pattern a track draws" into "structure other systems can read".         |
| **FLOW** — `app/src/gl/flowField.mjs`                                                                  | 32×32 project-seed curl, consumed by the ACCUM recipe (`rp.flowField`)                                                           | advect the wet field and any layer drift through the _same_ curl, so trails, wet and drifting layers all move coherently. Another ACCUM-owned field with the same ownership problem as wet.                                           |
| **CLOCK** — `app/src/gl/beatClock.mjs` (#950)                                                          | the BEAT master clock, already exposed as a control                                                                              | BEAT-quantized transitions elsewhere — #1042 (PATTERN motion) explicitly wants BEAT-quantized shuffle and should share this clock rather than grow a second one.                                                                      |
| **MIX** — `app/src/gl/paletteMix.mjs` (#278)                                                           | VJ MIX crossfade state machine, driving palette transitions                                                                      | layer-level colour interaction (a WET row whose blend _colour_ crossfades on the same state machine).                                                                                                                                 |

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
- Related: #1048/#1066 (FX folds before MATH) fixed the _order_ of the fold;
  this document is about giving the fold another _input_.
