# DYNAMICS — deep design brief (Kinetics umbrella: forces & springs)

Scope: response physics — the swarm integrator + every force in `particles.js`, plus every
spring (heading, breath, sliders, ballistics-as-follower). Read-only analysis; all `file:line`
refs verified by reading the line. Embargo stands: protection of existing systems only.

## 1. Contract

**Responsibility:** evolve particle/organism state (x, y, vx, vy, rotation, scale, alpha, u)
one step per frame from forces; smooth every user/audio param change through springs. Inputs:
`layoutParams` (post-LIFE-drift, post-spring), `seed/seedOffsets`, `loopTimeMs`, `dtSec`,
`attractor` (pointer), shared world `noise` (spine F). Outputs: `getItems()` — the item list
(array order = what TRANSITIONS plans from and the renderer draws) — plus per-item `vx/vy`
for TRACKS/MOD.

**Testable invariants (each named so it can be asserted):**

1. **Finite state** — for every live `i`: `x, y, vx, vy, ax, ay, rotation, scale, alpha, u`
   are all `Number.isFinite`. NaN cannot pass the speed clamp (`if (speed > maxSpeed)` is
   false for NaN, so it does *not* bound NaN — `particles.js:985-989`).
2. **Speed clamp** — after integration, `hypot(vx,vy) ≤ MAX_SPEED_CLOUD (8.0)` cloud /
   `MAX_SPEED_MOTH (1.65)` organism (`particles.js:62-63, 986-989`). Position step per frame
   ≤ `maxSpeed · dtFrames` with `dtFrames ≤ 3` (50 ms clamp, `liveLoop.mjs:758`) → ≤ 24 px.
3. **Spring dt-stability** — every spring is closed-form exponential damping
   `Δ·(1 − e^(−λ·dt))` with `dt ∈ [0.008, 0.05]`: step factor ∈ (0,1) ⇒ monotone, no
   overshoot, stable at any clamp value. Applies to: heading (`particles.js:1008`),
   breath (`liveLoop.mjs:427-429`, λ=8), sliders (`liveLoop.mjs:354`, λ=14·scale).
4. **Heading rate bound** — organism turn ≤ `MAX_TURN_DEG_PER_SEC (600) · dtSec` per step
   (`particles.js:61, 1010-1012`), spring or not.
5. **Damping stability** — `dampDt = pow(damp, dtFrames)` with `damping ∈ [0.80, 0.99]`
   (PARAM_SPEC `layout-modes.js:152`), organism floor `≥ 0.97` (`particles.js:698`);
   damping can only remove energy — combined with the speed clamp, velocity is bounded.
6. **Determinism** — same `seed + params + step count + loopTimeMs` ⇒ bit-identical state;
   no `Math.random`/`Date.now` in `particles.js` (verified: only doc mentions at :408/:613/:702).
7. **Contact conservation & boundedness** — bounce conserves momentum; coincident discs
   never NaN; population ≤ `breedCap`; visit order fixed (see §2).
8. **Order stability** — `getItems()` order is a pure function of particle index (and the
   documented `overlap=false` scale-sort + mirror stamp, `liveResolve.mjs:181-185`), never of
   a live float that can cross mid-frame.
9. **Bake parity** — any JS-only force must be listed in `wasmBakeEligible`
   (`swarmWasm.mjs:121-128`), so offline bakes can't silently diverge from live.

## 2. Inventory (piece → file:line → selfcheck)

**Integrator core (`app/src/engine/particles.js`, ONE-WRITER)**
- SoA state + grow path — `:86-204`; spawn (load-bearing rng draw order) — `:264-309`.
- Force pass — `:754-945`: point wind `noise3D→angle` `:778-790` (y at **:790**), curl wind
  `noise.curl2` `:766-776` (gate/dispatch `:709-722`), curiosity wobble y at **:923**
  (`:918-924`), orbit `behave.js:78-86` at `:793-797`, pointer attractor/gravity wells
  `:798-807` (`ATTRACTOR_GAIN=8` `:58`), boids sep/ali/coh `:809-886`, hunger-modulated
  cohesion `:818-819`, bio-drives energy/drive `:898-925`, scent chemotaxis `:928-932`,
  fatigue vigor `:933-942`.
- Contact pass `#167` — `:415-541` (invoked `:951-968`; restitution/repel clamped `:954-955`);
  breed `:551-605`; freelist `die`.
- Integration — damping `:976`, v/p step `:978-994`, speed clamp `:985-989`, **heading spring
  (spine C)** `:1004-1013` (λ = `profile.lambda || (scatter?16:10)` × `motionSmoothing`),
  phase/breath scale `:1020, 1032-1035`, walls/wrap `:1044-1068`, spine follow `:1050-1063`
  (`followDt` `:1057`), scent deposit/step `:1081-1092`, leak write-back `:1099-1106`.
- Output — `getItems` `:1109-1140` (vx/vy `:1132`), `_organismItems` `:1142-1227`
  (wing flap `:1180`, radial fan `:1196-1223`); `adoptPositions` (#427) `:226-233`.

**Springs outside particles**
- Slider springs `smoothedLayoutParams` — cache `liveLoop.mjs:92`, step `:350-386`
  (factor `:354`, settle snap `:362`), focus-swap wipe `:345-348`; **#441 open** (see §4).
- Breath scale/rotation springs (spine C) — LFO `:417-424`, damp `:426-429`, applied to
  instances `:544-582`; per-agent phase `:566-576`.
- Audio ballistics follower — `audioBallistics.mjs`, stepped `liveLoop.mjs:401`
  (silence-is-zero contract).
- dt clock (spine A) — `liveLoop.mjs:749-760`, clamp `[8,50]ms` `:758`, reject-path rollback
  #421/#434 `:762-779, 783-797`.

**Forces fed from other systems**
- Attractor source — `CanvasPanel.jsx:34` `viewRef` → `:38`; coords built in
  `useCanvasViewport.js:53-59` (`(x−pan)/zoom`, divides by `rect.width`).
- Shared weather — resolver-owned `worldNoise` `liveResolve.mjs:196-209`, injected
  `:274-275`; `curl2` defined `noise.js:135, :166`.
- Scent/feeding — `kernel/field/scent.js` (field), deposit in `particles.js:1081-1092`.
- Behave profiles — `organisms/behave.js:8-71` (weights only; integrator stays in particles).
- WASM bake gate — `swarmWasm.mjs:121-128`; engine pick `bake/index.js:98-122`.

**Existing selfchecks covering DYNAMICS**
- `particles.selfcheck.mjs` — reference-engine behaviour lock, 5 cases `:72-78`, finite
  assert only in the wind-heavy block `:100` + regrow `:124`; population/empty/resetPhase.
- `contacts.selfcheck.mjs` — 16 scenarios: momentum/KE `:55-71`, coincident-not-NaN
  `:202-214`, full-update determinism `:216-251`, bake purity `:253-272`, golden-placement
  isolation `:274-304`, param allow-list `:306-330`, moth smoke `:332-353`.
- `spineC.selfcheck.mjs` — heading λ ordering `:14-72`, ballistics `:74-128`, LFO `:130-166`.
- `spineE.selfcheck.mjs` — paletteMix machine, float count… **header claims sliders
  (`:4`) but no slider-spring assertion exists** → gap.
- `spineF.selfcheck.mjs` — curl divergence `:47-71`, shared noise `:73-105`, organism vx
  `:107-135`, MOD coupling, warp, bands.
- `swarmWasm.selfcheck.mjs` — bit-identical noise `:45-62`, short-bake fidelity `:72-80`,
  determinism `:82-93`, **scope gates hype/contacts/attractor/empty/breath `:118-132`**,
  exact JS fallback `:134-163`.
- `bioDrives.selfcheck.mjs` (10 props), `behave.selfcheck.mjs` (roster/orbit/mold-exclusive
  chemotaxis), `scent.selfcheck.mjs`, `organisms.selfcheck.mjs`, `audioBallistics.selfcheck.mjs`,
  `qaRegression.selfcheck.mjs` (breed survives next update `:188-203`), `liveResolve.selfcheck.mjs`
  (mid-morph finite `:374`), `sceneContract.selfcheck.mjs` (finite instances `:136-150`),
  `goldenPlacement.selfcheck.mjs` (golden hash `:23`), `parity.selfcheck.mjs`, `velocitySmear.selfcheck.mjs`.

## 3. Failure modes

| # | Failure | Canvas symptom | Detected today? |
|---|---------|----------------|-----------------|
| F1 | NaN/Inf in x/y/v (e.g. force divides, `attractor` NaN, `d=Inf→dx/d=NaN` at `particles.js:803`) | whole swarm vanishes (quads off-screen) or canvas **freezes with RENDER FAULT** (`assertSceneContract` throws at `sceneContract.js:344-345`, → `renderFault.noteFrameFailure` `liveLoop.mjs:914`, pill after 3) | **Indirectly** — fault freezes the canvas; reason says "instance must be finite", never "physics". No per-frame physics tripwire. |
| F2 | Velocity explosion (damping gate bypassed / force × 1/m with tiny mass, mass floor 0.4 `particles.js:274`) | streaking/teleporting swarm | **NOT DETECTED** — speed clamp bounds it, but no selfcheck asserts `≤ maxSpeed`. |
| F3 | Spring oscillation/overshoot at odd dt (λ applied per *frame* instead of `dtSec`) | slider/heading jitter, breathing flutter at 30/120 fps | **NOT DETECTED** — no odd-dt selfcheck; spineE has no slider-spring assert at all. |
| F4 | Attractor NaN (`useCanvasViewport.js:56-58` divides by `rect.width` — 0-size element → ±Infinity/NaN) | F1 symptom, pointer-only (live path; attractor is wasm-gated out of bakes) | **NOT DETECTED** at source; only downstream F1 freeze. |
| F5 | Contact force stack-up (deep overlap; repel ∝ overlap, applied per pair per pass `:504-509`) | clumps vibrate/boil in place | Partial — determinism/coincident checks only; no jitter-energy bound. |
| F6 | wasm/JS divergence: new JS force not added to `wasmBakeEligible` (`swarmWasm.mjs:121-128`) | SNAP/video bake layout ≠ live canvas; stills stale | **NOT DETECTED** — selfcheck pins the 5 *existing* reasons; a 6th feature needs a human. |
| F7 | Silent force dropout (renamed gate: curl dispatch `:709-722`, `if (attractor && gravityWells>0 && attractMul>0)` `:798`, `drivesOn`/`chemOn`) | wind/pointer/behaves do nothing; swarm drifts dead | **Partially** — reference lock (`particles.selfcheck`) catches divergences *it exercises*; **no case takes the curl branch** (default behave `cruise` → point wind), so curl-force dropout is uncovered. |
| F8 | Item-order flip (#444 class): `overlap=false` scale-sort on a *live* float (`liveResolve.mjs:181`, scales breathe per-agent at `particles.js:1033`) | stacking/z-fight flip between two frames | **NOT DETECTED** — no order-stability assertion anywhere. |
| F9 | Slider spring advances on rejected frames (#441) | resume-after-pause pops params ahead of where the eye left them | **NOT DETECTED** — open issue, unassigned (verified on GitHub 2026-09-22). |

## 4. Blast radius

**Downstream (what my output breaks)**
- **TRANSITIONS**: `planMorph`/`blendItems` pair *my* `getItems()` lists (`itemMorph.mjs:52-78,
  134-161`); unstable integrator ⇒ morph targets are garbage; unstable **order** ⇒ pairing and
  draw order flip (F8). `matchItems` also drives #427 adopt-on-enter (`liveResolve.mjs:132-136`).
- **Renderer**: array order = draw order — `packInstanceData` never re-sorts
  (`renderer.mjs:254-284`), instance buffer order is contract order (`sceneContract.js`
  built `liveLoop.mjs:537-542`).
- **FIELDS/TRACKS**: warp reads item x/y (`liveResolve.mjs:317-326`); FIELD/FEED/MOD read
  positions and my `vx/vy` (`:345, 360, 365, 369`) — NaN or a frozen sim propagates into
  every track knob.
- **Governor**: a NaN that throws in `buildFrame` counts as a *render* fault, not a physics
  fault — sheds/watchdog (`governorEventLog.mjs:30-38`) mis-attribute the cause.

**Upstream (what I consume)**
- CLOCK: `dtSec`/`loopTimeMs` (`liveLoop.mjs:754-760` → `liveResolve.mjs:157-158`).
- LIFE: `applyLifeDrift` mutates `displacement/noiseSpeed/jitter` (`liveResolve.mjs:50-63`)
  before I read them; ballistics feed scale/alpha multipliers (`liveLoop.mjs:409-414`).
- TRACKS: slider springs feed me smoothed params (`liveLoop.mjs:355-381`).
- FIELDS: injected shared `noise` + `noiseDomainOffset` (`liveResolve.mjs:274-275`).
- Pointer: `viewRef.attractor` (`CanvasPanel.jsx:34,38`).

**Peers / seams (per system)** — CLOCK: every spring & the integrator read `dtSec`
(headings `:1008`, damping `:976`, sliders `:354`, breath `:427`); all closed-form, safe
inside the 8–50 ms clamp, but *any* new spring must use `dtSec`, not a frame count.
LIFE: drift params enter forces pre-step; breath scale is computed in my integrator
(`:1032-1035`) but *applied* in liveLoop (`:552-581`). FIELDS: curl/point wind is my force
driven by FIELDS' noise. TRACKS: MOD reads my vx/vy; FEED's 4 px hop then perturbs my
positions next frame (feedback loop — both sides must stay bounded). TRANSITIONS: my order
+ values are its from/to lists.

**⚠ ONE-WRITER files I touch:** `particles.js`, `liveLoop.mjs`, `liveResolve.mjs`.
#441's fix and every runtime guardrail below land in those files → **single-owner staging,
one PR each, no concurrent coding agent** (AGENTS.md rule). Extraction steps in §6 that
touch them are flagged.

## 5. Guardrails

**G1 — Finite-state invariant (invariant #1).** *cheap*
- (a) selfcheck: extend `particles.selfcheck.mjs` with a finite sweep over all 5 CASES + a
  NaN/Inf-attractor case (pins F4).
- (b) runtime (existing infra only): a one-branch latch in `swarmItems`
  (`liveResolve.mjs`, ONE-WRITER) — `throw new Error('dynamics: non-finite particle state')`
  on the first bad live item. It rides the tick catch → `renderFault.noteFrameFailure` →
  RENDER FAULT pill **with a physics-labelled reason** (`renderFault.mjs:40-83`). No new
  subsystem; `assertSceneContract` stays the backstop. Optionally latch a counter for the
  `governorXray` tape (existing readout, `governorXray.mjs`).
- (c) runbook: *"canvas freezes + RENDER FAULT saying 'must be finite' or 'dynamics:
  non-finite' → check attractor (`useCanvasViewport.js:56` rect.width), then the last force
  edit, then param normalization (`layout-modes.js`)."*
- **NaN tripwire placement strategy:** sample once per *emitted item* in `swarmItems` (after
  physics, before sort/mirror) — O(n) on top of an already O(n) map, ~1 branch; *not* inside
  the O(n·neighbours) force loop. Emit-path coverage catches force, contact, spring, and
  attractor NaN with one hook. Keep it a **throw, not a clamp** — clamping hides the bug and
  corrupts golden hashes.

**G2 — Speed-clamp assert (invariant #2).** *cheap*
- (a) `particles.selfcheck`: after the wrap-stress + attractor runs, assert
  `hypot(vx,vy) ≤ maxSpeed·(1+1e-12)` for all live i. (b) no runtime needed (G1 + contract
  backstop). (c) runbook: *"swarm streaks/teleports → check speed clamp `:986` and dt clamp
  `liveLoop.mjs:758`."*

**G3 — Spring dt-stability (invariant #3/#4).** *cheap*
- (a) `spineC.selfcheck`: heading step at dt 8/16.7/50 ms converges monotonically, never
  overshoots, and respects the 600°/s bound. **New** `spineE.selfcheck` block: slider
  `1-exp(-14λdt)` ramp at all three dts settles to target with no oscillation (closes the
  header-claims-but-no-assert gap). (b) runtime: none — pure `dtSec` functions; any edit is
  in one-writer `liveLoop.mjs` (stage alone). (c) runbook: *"sliders/heading jitter only at
  30 or 120 fps → the spring is integrating per-frame, find the missing `dtSec`."*

**G4 — Damping bounds (invariant #5).** *cheap*
- (a) `particles.selfcheck`: free-flight with `wind:0` decays speed monotonically at
  dtFrames 0.5/1/3; organism floor ≥0.97 holds. (c) runbook: *"swarm 'heats up' over a long
  take → damping gate (`:698`) or a force now injected after the damping multiply."*

**G5 — Determinism (invariant #6).** *already covered* (contacts #12/#13, swarmWasm
determinism, bake purity). Guardrail = don't weaken these to land feel work (AGENTS.md).

**G6 — Attractor input sanitization (F4).** *cheap*
- (a) new `particles.selfcheck` case: `attractor {x:NaN}` / `{x:Infinity}` must not poison
  state — today it *will* (expected-red documents the gap; the fix is a finite gate at
  `particles.js:798` or `useCanvasViewport.js:58`). Both files are non-one-writer /
  hooks respectively; still stage as its own PR. (b) runtime: covered by G1. (c) runbook:
  *"swarm dies only when the pointer is over the canvas → attractor coords."*

**G7 — Contact stack-up (invariant #7).** *covered* for conservation/NaN/determinism;
add (*cheap*) a resting-clump energy assertion: 50 steps of an overlapping cluster with
`repel>0` must not gain kinetic energy without approach velocity.

**G8 — wasm/JS bake-parity gate (invariant #9).** *medium*
- (a) `swarmWasm.selfcheck`: add a *feature-list* comment-block asserting each JS-only force
  (organism, contacts, attractor, breath, …) maps to a `reason` — so adding force #6 without
  gating fails selfcheck with a message, not a bake mismatch. (b) no runtime hook exists that
  compares bake-vs-live (parity harness compares candidate vs SVG reference only) — do not
  invent one. (c) runbook: *"SNAP/still swarm differs from live → `wasmBakeEligible`
  (`swarmWasm.mjs:121-128`) missing the new force; `KC_SWARM_WASM=0` to confirm."*

**G9 — Force-dropout lock (F7).** *cheap* — add curl-path cases to `particles.selfcheck`
(`behave:'flock'` and `mode:'murmuration'`, wind≠0) so the reference lock finally exercises
`curl2`, plus one "wind:0 vs wind:3 trajectories differ" assertion for point wind. Runbook:
*"pointer/wind does nothing → check the dispatch gates `:709-722, :798` first."*

**G10 — Order stability (invariant #8).** *cheap selfcheck, med fix* — see verdict below.

**#444 verdict for DYNAMICS:** yes, the guardrail family catches this class — **if the
assertion is about ORDER, which none currently is.** DYNAMICS' equivalent of #444's contract
is *"array order out of `getItems()` is a deterministic function of particle index"*; the
renderer will never re-sort (`renderer.mjs:254`), so any producer-side reorder is a
one-frame stacking flip. Today `getItems()` is index-ordered (stable), **but**
`liveResolve.mjs:181` re-sorts by *live* scale whenever `overlap:false`, and scales breathe
per-agent (`particles.js:1033`) → two near-equal scales can cross and swap draw order in one
frame — an #444-shaped z-fight with no detector. Guardrail: extend `liveResolve.selfcheck`
with a 60-frame breath-on, `overlap:false` run asserting presented order never permutes
between consecutive frames (cheap; may be **red today** — that's the finding, not a defect to
quietly skip). Fixes that change sort/order semantics are one-writer (`liveResolve.mjs`) and
must wait for Matt's assignment (#444 itself is TRANSITIONS' side of the same seam).

## 6. Extraction plan (toward `docs/KINETICS.md` thin-resolver target)

Order matters; every step is behaviour-preserving (golden hash + SNAP + parity byte-stable),
one PR, one writer. **[1W] = touches a one-writer file — single-owner staged, never two
agents.**

1. **Docs-only:** land this brief; tick no code. (safe)
2. **Selfcheck-only additions** (G2/G3/G4/G7/G9/G10 assertions): no production code, hash
   pins unaffected; if G10 comes out red, stop and report — do not "fix" order to pass it.
3. **G6 attractor finite gate** — `particles.js` **[1W]**: gate at `:798`; `particles.selfcheck`
   reference lock unaffected (reference only ever got finite attractors in its cases).
4. **G1 runtime latch** — `liveResolve.mjs` **[1W]**: throw-label only; no value changes ⇒
   golden/placement hashes untouched; QA = force a NaN via G6's test hook, expect the pill.
5. **G8 feature-list gate** — `swarmWasm.selfcheck` + comment in `swarmWasm.mjs` (not
   one-writer): parity asserts must stay byte-identical (`swarmWasm.selfcheck` already proves
   JS fallback exactness `:134-163`).
6. **#441 fix** (Matt's nod first — issue says triage before fixing) — `liveLoop.mjs` **[1W]**:
   snapshot `smoothedLayoutParams` inside `rollBackLifeClocks()` (`liveLoop.mjs:773-779`) or
   move the spring step after the reject gates; QA = pause mid-ease, resume continues from
   where it visibly was; running feel must be unchanged (spine E bar).
7. **DYNAMICS extraction to the pipeline** (`… → DYNAMICS.step → items`): move the
   `smoothedLayoutParams` spring + breath springs + ballistics step out of `buildFrame` into
   an imported module with its own selfcheck; `liveLoop.mjs` **[1W]** keeps only the call.
   Golden: stills/SNAP unaffected (they never run the live springs — slowRender/batch paths);
   live-only behaviour compared by `spineC`/`spineE` selfchecks pre/post.
8. **`particles.js` stays put** — it already *is* the extracted module (own directory, own
   selfchecks). The only resolver-side DYNAMICS code is `swarmItems` (`liveResolve.mjs:97-187`);
   extracting that is the last step and lands **[1W]** with the #444 fix decision, because it
   owns the sort/stamp/mirror order contract (§5 G10).
9. Final state = KINETICS' pipeline arrow: `read CLOCK → … → DYNAMICS.step → TRANSITIONS.morph
   → items`, each arrow an import with a selfcheck.

## 7. Open questions for Matt

1. **#441 triage** — fix or close-with-note? *Options:* (a) snapshot-cache rollback (mechanical,
   same as #434), (b) move spring step after reject gates, (c) triage, find it harmless, close.
   *Rec:* (a) if the pause-pop is reproducible; (c) is explicitly valid per the issue text.
   Touches one-writer `liveLoop.mjs`.
2. **Order contract** — is `overlap:false`'s scale-sort intended as *live* (breathing) order,
   or should it be a stable quantized-scale-then-index sort? *Options:* live-as-is (accept
   rare z-fights), stable tiebreak only, quantize the sort key. *Rec:* stable tiebreak now
   (protection), quantize later if the eyes see flicker — and assign it next to #444, since
   both are "order = draw order" seams.
3. **NaN policy** — throw-and-freeze (G1 as proposed, honest fault, canvas stops) vs
   clamp-and-continue (canvas keeps moving, state silently repaired)? *Rec:* throw — matches
   the CREED/fault-pill design; a clamped swarm would look fine and hide the bug.
4. **wasm parity scope** — do future forces (organism/contacts class) get implemented in wasm,
   or is the JS fallback the permanent rule? *Rec:* permanent JS fallback + the G8 feature
   gate; wasm stays the cloud-only fast path.
5. **Guardrail landing** — §6 steps 2–5 are embargo-legal *protection* work, but they touch
   one-writer files. *Options:* land selfchecks-only (step 2) now, hold 3–4 until Night
   Migration sign-off, or waive for guardrails. *Rec:* step 2 now; 3–4 queued single-owner.
