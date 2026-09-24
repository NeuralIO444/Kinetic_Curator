# KINETICS / LIFE — design & protection brief

Scope: autonomous ambient animation — life drift, life LFO, per-agent oscillators,
audio ballistics, bio-drives. Read-only audit 2026-09-22; all line refs read, not guessed.
Umbrella glossary: `docs/KINETICS.md`. Embargo (`docs/EMBARGO.md`) stands: no sine→fBm
swap until the Night Migration play is signed off — this brief protects the swap's landing.

## 1. Contract — testable invariants

- **L1 drift clamps** — `applyLifeDrift` output: jitter ∈ [0,200], displacement ∈ [0,250],
  noiseSpeed ∈ [0.1,3], exactly the `PARAM_SPEC` ranges (`layout-modes.js:139,144,145`);
  jitter/displacement are `Math.round` integers, noiseSpeed is 2-dp (`liveResolve.mjs:55,58,61`).
- **L2 purity** — drift output = f(layer's own base params, own locks, `loopTimeMs`) only;
  no store writes, no wall-clock, no `Math.random` (firewall §2 tripwires:
  `firewall.selfcheck.mjs:181-209`).
- **L3 locked params untouched** — `locked.jitter/displacement/noiseSpeed` skip the write
  (`liveResolve.mjs:54,57,60`); locked value frame-identical before/after any event.
- **L4 swap-boundary parity** — all-layer rendered values byte-identical across a focus
  click (`liveResolve.mjs:34-39`, asserted `liveResolve.selfcheck.mjs:256-296` incl. warped coords).
- **L5 #431 continuity** — phase is continuous in `loopTimeMs` (rate 0.0005/ms); no 80 ms /
  12.5 Hz stepping, no cross-layer lockstep geoSig invalidation (`liveResolve.mjs:41-49`).
- **L6 pause ≡ stills** — `slowRender`/`batchPaused`/`lifeDrift ≤ 0.01` ⇒ drift output is the
  raw authored base (`liveResolve.mjs:52,240`; asserted `liveResolve.selfcheck.mjs:298-318`) —
  this is the stills/golden-hash parity invariant.
- **L7 per-layer independence** — each layer drifts from its own base/depth/lock; two layers
  never share channel state; weather (shared `worldNoise`) survives focus swap, reseeds only
  on genuine seed change (`liveResolve.mjs:197-209`, `liveResolve.selfcheck.mjs:320-356`).
- **L8 ballistics envelope** — silence ⇒ scaleMul=1, alphaBoost=0, glow=0 *exactly*
  (`audioBallistics.mjs:36,113`; asserted `spineC.selfcheck.mjs:79-99`,
  `audioBallistics.selfcheck.mjs:42-60`); kick attacks ≤ 25 ms, releases ≤ 5000 ms
  (`sanitizeBallistics`, `audioBallistics.mjs:45-53`); outputs finite and bounded:
  scaleMul ≤ ~1.5, alphaBoost ≤ 18·depth, glow ∈ [0,1] (`liveLoop.mjs:409-431`).
- **L9 bio-drive state bounds** — `energy ∈ [0,1]`, clamped every step
  (`particles.js:905-908`); metabolism 0 ⇒ energy frozen at exactly 1 (`particles.js:301`,
  `bioDrives.selfcheck.mjs:69-77`); breath scale swing ≤ ±50% (`particles.js:1032-1033`).
- **L10 life-clock coherence** — `loopTimeMs` (CLOCK spine A), `loopLifeT` (spine C GL loop,
  `liveLoop.mjs:88,389`), and ballistics state advance together and roll back together on a
  rejected frame (#421, `liveLoop.mjs:768-779`); drift reads clock #1, LFO reads clock #2 —
  both must never jump or pause alone.
- **L11 determinism under seed** — same (seed, seedOffsets, loopTimeMs, locks, base) ⇒
  byte-identical drift output across two resolver instances (this is the fBm-swap's
  determinism clause *today*, trivially true for closed-form sines — it must stay true).
- **L12 morphSig excludes LIFE** — drift values never trigger a chip morph
  (`liveResolve.mjs:334-338`: mode/behave/palette/assets only).

## 2. Inventory (file:line)

**Life drift** — `applyLifeDrift`, `liveResolve.mjs:50-63`; doc `:30-49`.
- `t = loopTimeMs * 0.0005` (:53); three fixed sines: jitter `sin(t·0.7)` amp `12·depth`
  (:55, period ≈ 18 s — Matt's metronome verdict), displacement `sin(t·0.45+1.2)` amp `18·depth`
  (:58), noiseSpeed `sin(t·0.3+0.5)` amp `0.25·depth` (:61, `toFixed(2)`).
- Depth = `lp.lifeDrift ?? 0.35`, off ≤ 0.01 (:51-52). Caller gate: `!slowRender &&
  !batchPaused`, per-layer locks — top-level for active, `snap.lockedParams` for the rest
  (:240-245).

**Life LFO** — owned by the GL loop: `loopLifeT` (`liveLoop.mjs:88`), advanced :389,
3 incommensurate sines 0.55@0.73 + 0.30@1.19 + 0.15@0.29 (:416-421, spec'd
`spineC.selfcheck.mjs:133-136`), breath targets :423-424, critically damped ω≈8 :427-429.
Applied per-instance in the contract transform :557-582 — **global depth**: `lifeDrift` at
:406 is the *active layer's* slider, applied to instances of *all* layers (:566-576
per-agent phase from `seedOffset`).

**Per-agent oscillators** — `particles.js`: phase advance `+0.004·noiseSpeed·dtFrames`
(:1020); breath swell `×(1 + breath·0.5·ENERGY[i]·sin)` (:1033); flap frame `u` (:1039);
wing-flap amplitude for bilateral (:1180) and radial fans (:1206); `seedOffset` rides items
(:1134,:1173).

**Audio ballistics** — pure module `gl/audioBallistics.mjs` (defaults :28-33, EPSILON :36,
attack/release follower :82-98, sanitize :45-53, process :109-121). Wired in
`liveLoop.mjs`: state :87, raw-band gate on `audioEnabled` :392-401, scaleMul/alphaBoost
:409-414, glow :431, effectiveScale/Alpha :433-440, reset on GL restart :143, rollback
:771-778.

**Bio-drives (#287)** — plan `docs/BIO_DRIVES_PLAN.md` (SWELL §1.6, sequencing §3.1);
engine `particles.js`: energy/drive SoA :145-151, init 1 :301, drain+clamp :901-908,
hunger :818, vigor :937, inheritance at breed :593-597, breath×energy :1033;
`engine/bioDrives.selfcheck.mjs` covers all 10 mechanisms (inert-at-0, drain, chemotaxis,
leak quantization, breath mean-on-base :198-221, capacity growth).

**Existing selfchecks covering LIFE** — `gl/spineC.selfcheck.mjs` (heading/ballistics/LFO
formula), `gl/audioBallistics.selfcheck.mjs`, `engine/bioDrives.selfcheck.mjs`,
`state/firewall.selfcheck.mjs` §2 (drift never in state), `gl/liveResolve.selfcheck.mjs`
(#425 swap/locks/pause/weather; #419 morph), `gl/spineF.selfcheck.mjs` (:189 warp vs
stills with `lifeDrift:0` pinned). **No selfcheck exercises `liveLoop.mjs` itself** — LFO
wiring, #421 rollback, breath-transform stage are formula-copies only.

## 3. Failure modes

| Failure | Canvas symptom | Detected today? |
|---|---|---|
| Drift discontinuity (phase/clock jump, swap mishandled) | one-frame pop in scatter/warp | swap: `liveResolve.selfcheck:256`; stepping: #431 — **runtime: NOT DETECTED** |
| Math.round micro-step (jitter/displacement cross an integer) | all points of one layer jump ≤~0.5 px *together*, ~every 0.7-1 s | NOT DETECTED (residual of #431 — within-layer still lockstep) |
| Clamp saturation (drift pinned at 0/200) | layer reads frozen; "drift on" slider does nothing | NOT DETECTED |
| Locked-param violation | locked slider visibly breathes | detected: `liveResolve.selfcheck:284-285` (jitter lock only, one layer) |
| Per-layer desync / cross-layer leak | background layer's breath amplitude follows the focused layer's LIFE slider (LFO depth is top-level, `liveLoop:406,557-582`) | NOT DETECTED (no per-layer LFO test) |
| One layer's life clicking on focus swap | breathing jumps to other layer on click | drift level: #425 asserted; LFO/breath level: NOT DETECTED |
| Ballistics NaN on silence / audio loss / bad voice params | NaN scale → magenta or invisible cast | guarded: `audioBallistics.mjs:113` (non-finite raw → 0), sanitize clamps; exact-zero asserted |
| Life clocks desync (#421 rollback bug) | LFO jumps a beat while drift holds (or vice versa) after pause/bake/restore | NOT DETECTED (rollback untested; liveLoop-only code) |
| `displacement` drift crosses 0 | warp pass (`liveResolve:287` gate) toggles off/on + geoSig miss → visible amplitude pop | NOT DETECTED |
| `noiseSpeed` drift churns geoSig | placement geometry rebuilds several ×/min (2-dp value in `geoParams`, `buildPlacements.js:123,129`) + baseline `nt` shifts (`placement.js:109`) — main-thread fBm cost, micro-repositions | NOT DETECTED (perf symptom only) |
| Metronome drift (18 s exact repeat) | mechanical, "not weather" | Matt's feel verdict 2026-09-22; fBm swap proposed, embargo-gated |
| ENERGY out of [0,1] | breath amplitude wrong sign/huge; hunger sign flips | guarded in-engine (`particles.js:908`) + `bioDrives.selfcheck:69-85` |

## 4. Blast radius

**Downstream — who READS what drift mutates (CRITICAL):**
- `lp.jitter` → `buildPlacements` geoParams (`buildPlacements.js:114`) → `geoSig`
  (:129) → staged-eval cache invalidation → `computeGeometrySoA` position sampling.
  Every integer crossing = full geometry recompute for that layer. Downstream of that:
  itemMorph plan targets (planned once per click — `itemMorph.mjs:18-23` explicitly names
  life drift as the moving-target source), FEED/MOD hops on the moved coords.
- `lp.displacement` → **two consumers**: (a) placement baseline fBm
  (`placement.js:106-138`, inside geoSig), (b) live warp amplitude + pass gate
  (`liveResolve.mjs:287,317-320`). Crossing 0 toggles a whole render pass. ⇒
  **LIFE→FIELDS seam**: a LIFE param drives FIELDS' noise output scale.
- `lp.noiseSpeed` → **four consumers**: warp phase rate (`liveResolve.mjs:303`, #432
  accumulator), placement baseline `nt` (`placement.js:109` — inside geoSig), swarm flow-field
  time rate (`particles.js:704`), and *per-agent breath/flap phase rate* (`particles.js:1020`)
  — drift modulates LIFE's own oscillator speed through a FIELDS-ish param.
- Ballistics outputs → `effectiveScale/Alpha` are cache-safe *by design* (stage C always
  runs, `buildPlacements.js:134-136`); `glow` → wrapper box-shadow + ACCUM envelope
  (`liveLoop.mjs:799-803,850-854`).
- ENERGY → breath amplitude (`particles.js:1033`), hunger/vigor forces (:818,:937).
- LFO breath → mutates every `contract.instances` scaleX/scaleY/rotation
  (`liveLoop.mjs:557-582`) — **the last LIFE stage before `packInstanceData`
  (`renderer.mjs:254`, array order = draw order)**.

**Upstream — what LIFE consumes:** CLOCK dt clock (`loopTimeMs`/`dtSec`, `liveLoop.mjs:754-760`),
GL-loop `loopLifeT` (:389), audio bands+beatPulse gated by `audioEnabled` (:392-399),
`lockedParams` + per-layer snapshots + `focusSwap`/`slowRender`/`batchPaused` gates, seed →
`seedOffset` per-agent phase, `phraseWrapGen` → `resetPhase()` (`liveResolve.mjs:139-142`).

**Peers (seams with the other five + renderer):**
- CLOCK: two LIFE clocks (L10) — drift=loopTimeMs, LFO=loopLifeT; rollback #421 is the seam.
- FIELDS: shared `worldNoise` (spine F, `liveResolve.mjs:196-209`) — drift does *not* use it
  yet; the fBm swap makes LIFE a consumer of FIELDS' instance. Warp/baseline coupling above.
- DYNAMICS: bio-drives integrate inside `particles.js` (spring/integrator file); breath
  springs live in `liveLoop` (:427-429).
- TRACKS: MOD/FEED/FIELD patches run *after* drift on the resolved items
  (`liveResolve.mjs:353-381`) — knobs read drift-mutated positions/velocities.
- TRANSITIONS: `morphSig` excludes LIFE (L12); morph blend output vs raw handoff is #444.
- Renderer: breath transform stage writes instance scale/rotation directly; no LIFE value
  is validated finite before `packInstanceData`.

**⚠ One-writer files:** LIFE lives *entirely* inside all three one-writer files —
`liveLoop.mjs` (LFO, ballistics wiring, breath transform), `liveResolve.mjs` (drift),
`particles.js` (oscillators, bio-drives). Every extraction/swap step below touches one of
them ⇒ single-owner staging, no two concurrent PRs (AGENTS.md).

## 5. Guardrails

Each: invariant → (a) selfcheck → (b) runtime hook on EXISTING infra → (c) runbook entry.

**G1 drift range + type integrity** — L1. (a) new `engine/lifeDrift.selfcheck.mjs`
post-extraction, or extend `liveResolve.selfcheck.mjs`: sweep `loopTimeMs` 0…10 min ×
depth {0, 0.35, 1} × bases at both clamp ends; assert int/2-dp types, clamp bounds, NaN-free.
(b) cheap finite-check in the resolve path: non-finite drift value ⇒
`renderFault.noteExternalFault('life drift: non-finite')` (same call as bake faults,
`liveLoop.mjs:709`) — pill only on repeat, per `RENDER_FAULT_FAILS`. (c) runbook: "drift
out of range → check depth/base + PARAM_SPEC sync comment (`layout-modes.js:134`)." **cheap**

**G2 swap/pause byte-parity (the #425 gate, kept forever)** — L4/L6/L7. (a)
`liveResolve.selfcheck.mjs:256-356` must stay green through *every* LIFE change (already
asserts per-layer byte-identity, warp coord identity, pause≡base, weather hold).
(b) none needed — it is a pure-function gate. (c) runbook: any LIFE PR lists this file
first in QA. **cheap**

**G3 continuity / step-size assertion (the sine→fBm swap's main net)** — L5.
(a) in the new drift selfcheck: sample the channel at 60 Hz dt for 60 s; assert
`max|Δparam/frame|` ≤ analytic bound (jitter ≤ 12·depth·0.7·0.0005 ≈ 0.0042/frame ⇒ any
frame-step > 1 unit is a regression) and that *consecutive-frame* jumps never exceed the
rounding quantum + 1; explicitly fails an fBm scaled 10× or fed wall-clock.
(b) runtime: debug strip (`gl/debug/debugStrip.mjs`, bit-exact float readback) publishes
max|Δjitter| per second to the existing debug overlay when `gl/debug` flags are on — no new
subsystem. (c) runbook: "one-frame jump in any LIFE channel → G3 first." **cheap/med**

**G4 anti-periodicity / spectral sanity (would catch "fBm" that is still a metronome)** —
the swap's acceptance criterion. (a) drift selfcheck: (i) *no-repeat* — output at t and
t+P must differ for every candidate P ∈ {2…40 s} over a 10-min window ⇒ the CURRENT sine
code FAILS this by design (document as `KNOWN_MECHANICAL`, the exact defect being fixed);
after the swap the assertion flips to required-green; (ii) band check — zero-crossing rate
and RMS of the channel within [0.5×, 2×] of the sine's (kills DC drift and white-noise
regression). (b) governorEventLog **cannot** take LIFE events — `recordGovernorEvent`
throws for any type ≠ shed/restore or unknown `cutKind` (`governorEventLog.mjs:69-74`) —
so the only honest reuse is recording the `slowRender` shed/restore that pauses LIFE
(valid cutKind, step 6): runbook reads the log to correlate "life froze" with a governor
pause. (c) runbook: spectrum/period table per seed. **med**

**G5 per-layer independence + determinism (seeded-channel contract)** — L7/L11. (a)
extend the #425 test: two layers, different seeds/depths — resolve twice with identical
inputs on two fresh resolvers ⇒ deepEqual per frame (same seed → same channel; a stray
`Math.random` in the swap fails instantly); plus keep focus-swap byte-identity. (b) cheap
dev-only double-resolve assert behind existing `gl/debug` flags. (c) runbook. **cheap**

**G6 LFO-stage coverage (LIFE's actual #444-class hole)** — L10 + per-layer breath. The
LFO/ballistics/rollback code in `liveLoop.mjs` has *no* executable spec — only formula
copies in `spineC.selfcheck`. (a) extract the pure pieces (step 2/3 of §6) and move
`spineC.selfcheck:74-166` onto the real imports; add: rejected-frame rollback equality
(loopLifeT/ballistics/breath state after rollback ≡ before — replays #421 logic against the
real function); add a *scoping* test once Matt decides (open Q1) — today: assert the
documented behavior (active-layer depth applies to all layers) so a future fix is a
conscious test change, not an accident. (b) runtime: none — pure math, selfcheck suffices.
(c) runbook: "breath amplitude wrong on background layer → G6 scoping test." **cheap/med**

**G7 ballistics NaN / silence contract** — L8. Already strongly covered
(`audioBallistics.selfcheck`, `spineC:79-99`). Add one integration-shaped case to the
audioBallistics selfcheck: audio disabled mid-hold (`audioEnabled false` ⇒ raw zeros,
`liveLoop:392-399`) with a primed follower ⇒ outputs exact identity within release window,
all finite. (b) `flagPass` `nan` view (`flagPass.mjs:55-60`, magenta pixels) is the
existing visual triage if NaN ever reaches the frame. (c) runbook: "magenta → flagPass nan →
feed backward through effectiveScale." **cheap**

**G8 placement-churn & clamp-saturation telemetry** — L5 perf residual + frozen-drift.
(a) drift selfcheck: instrument `buildPlacements` cache over a 10-min drift sweep, assert
geoSig invalidations ≤ N/min (pins today's cadence; a wrong-scale fBm multiplying churn 10×
fails); assert the channel spends < X% of a sweep pinned at a clamp (saturation detector).
(b) reuse the governor X-ray/event log only for the honest slowRender correlation (G4b);
churn itself stays selfcheck-only. (c) runbook: "jitter slider feels stuck / frame dips
periodically → G8." **med**

**#444 verdict for LIFE.** #444's class = *two producers present the same frame across a
handoff, and nobody asserts last-frame ≡ next-frame (here: order).* LIFE does not reorder
items, so #444's literal z-fight cannot originate in LIFE — but the class bites LIFE twice,
and **neither is currently asserted**: (1) the **handoff into the morph completion frame**
(`liveResolve.mjs:407-413`) presents raw resolver order *including freshly drift-mutated
values* — LIFE's contract there is "the drift value embedded in the last blend frame equals
the raw frame's drift value at the same clock," which holds only because morphSig excludes
drift (L12) and both frames derive from the same `loopTimeMs` — **that derivation is exactly
what G2+G5 assert and what a fBm swap could break** (e.g. channel state accumulated per
resolver call instead of a pure function of clock ⇒ blend frame and raw frame read different
channels ⇒ the LIFE equivalent of a one-frame flip, as a value pop). (2) the **stills/live
handoff** (`slowRender` on ⇒ drift off): asserted today (`liveResolve.selfcheck:310-317`) —
keep it as the standing guardrail. So: G5's same-inputs-twice-equality is LIFE's direct
#444-shaped guard, G3 is its step-size guard, and G6 closes the one LIFE stage with *no*
equality assertion at all (liveLoop's LFO/rollback).

## 6. Extraction plan — toward `KINETICS.md:127-130` (thin liveResolve pipeline)

Ordered; each step behavior-preserving, hash/parity-safe, one PR, one writer.

1. **Extract `applyLifeDrift` → `engine/kernel/life/drift.mjs`** (pure, math untouched;
   `liveResolve.mjs` imports it). Gate: `npm run selfcheck` — `liveResolve.selfcheck` #425
   bytes unchanged; firewall §2 unchanged; golden hashes untouched (drift never reaches the
   stills path — L6 gate preserved verbatim). ⚠ **one-writer: liveResolve.mjs**.
   Adds G1/G3/G5/G8 home: new `drift.selfcheck.mjs`.
2. **Extract the LFO formula + breath targets → `life/lfo.mjs`**; `spineC.selfcheck:130-166`
   imports it instead of restating literals. Still two call sites in liveLoop (targets
   :423-424, per-agent :566-573) — same code, one source. ⚠ **one-writer: liveLoop.mjs**.
3. **Extract the ballistics→(scaleMul, alphaBoost, glow) mapping** (liveLoop:409-414,431)
   → `life/ballisticsMap.mjs`; move spineC §2 onto it; audioBallistics.mjs itself stays
   (it is already clean CLOCK-adjacent infrastructure). ⚠ **one-writer: liveLoop.mjs**
   (bundle with step 2 if serial).
4. **Extract per-agent oscillators' shared phase math** (particles.js:1020,1033,1039,1180)
   → `life/oscillators.mjs` — pure helpers only, integration loop keeps writing SoA columns.
   ⚠ **one-writer: particles.js** — separate PR, never concurrent with DYNAMICS work.
5. **Introduce the `LIFE.ambient` arrow**: `read CLOCK → LIFE.ambient → FIELDS.worldNoise → …`
   — liveResolve/liveLoop call one module that returns { per-layer param deltas, breath
   targets, ballistics outputs }. Pure re-plumbing: golden hashes, SNAP, parity corpus, still
   byte-stability all unchanged (all gates carried). ⚠ touches **both** one-writer files ⇒
   two serial PRs (resolve side, loop side), review-agent gated.
6. **(Embargo-gated, post Night Migration sign-off)** sine→fBm time channels *inside* the
   already-extracted `drift.mjs`, consuming the existing per-project `worldNoise`
   (KINETICS.md proposal 2 — zero new noise machinery). This is the first
   behavior-changing PR: G3/G4/G5 green first, `KNOWN_MECHANICAL` periodicity assertion
   flipped to required, §5 QA pasted to the review agent. Never bundled with steps 1-5.

## 7. Open questions for Matt (decision-shaped)

1. **LFO breath depth scope** — today one `lifeDrift` (active layer) scales *every* layer's
   breath (`liveLoop:406,557-582`); drift itself is per-layer since #425. Options:
   (a) keep global; (b) read each layer's own `lifeDrift` from its snapshot — **rec** (b),
   completes #425's model. Ordering: decide now (docs), implement post-extraction (G6 test
   flips with it).
2. **Extraction vs swap order** — (a) swap sines in place first (smaller diff); (b)
   extract mechanical steps 1-5 first, swap last — **rec (b)**; the swap then lands in a
   one-file module with all guardrails runnable. Swap itself waits for the Night Migration
   sign-off either way.
3. **`noiseSpeed` drift's four jobs** — drift currently modulates warp rate, *placement
   baseline* (geoSig churn, `placement.js:109`), swarm flow-field rate, and flap/breath rate
   with one 2-dp value. Options: (a) as-is; (b) when the swap lands, scope drift's
   noiseSpeed to the warp accumulator only — **rec (b)**: kills the geoSig churn (G8) and
   stops LIFE secretly retiming DYNAMICS/oscillators.
4. **Rounding under drift** — `Math.round` makes all points of a layer micro-pop together
   at every integer crossing (L5's residual). Options: (a) keep integers (visual parity
   with today); (b) float jitter/displacement *while drifting*, round only on pause/still —
   **rec (a) for now** (b is a feel change; revisit with the fBm swap play).
5. **Runtime severity for a bad LIFE value** — (a) non-finite reaching the contract trips
   the RENDER FAULT pill (hold frame, existing noteExternalFault path); (b) drift-level
   anomaly only logs (throttled) + debug strip, pill reserved for pixels actually at risk —
   **rec (b)**, with (a) already automatic once NaN reaches `packInstanceData` via the
   frame catch.
