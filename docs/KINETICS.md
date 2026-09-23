# KINETICS — the animation-systems glossary

**Umbrella name: Kinetics** (Matt's pick, 2026-09-22). Six subsystem nouns — use them
verbatim in issue titles, PR titles, and chat whenever referring to animation work, so
"the jitter thing" becomes "LIFE drift" and everyone means the same file.

Docs-only: this file changes no code. Line refs verified against `778dafa`; they drift —
files are the durable handle.

## Quick reference

| System | Means | Primary files |
|---|---|---|
| **CLOCK** | what time it is — every other system reads it | `liveLoop.mjs`, `audioBallistics.mjs`, `phraseTick`, `beatArbiter`, `useBeatDecay` |
| **LIFE** | autonomous ambient animation (runs with zero input) | `liveLoop` LFO, `liveResolve:50-63` drift, `particles` oscillators, `bioDrives` |
| **DYNAMICS** | forces & springs — response physics | `particles.js`, springs in `liveLoop`, `contacts`, `behave` |
| **FIELDS** | spatial structure motion reads | `noise.js`, `liveResolve` warp, `kernel/field/`, `placement.js` |
| **TRACKS** | self-feedback patches — motion driving its own look | `trackGraph.js`, `feedLive.js` |
| **TRANSITIONS** | event tweens — animation that only fires on events | `itemMorph.mjs`, `paletteMix.mjs`, `useVoiceMixDriver` |

Neighbor, not core: **TRAILS** (the ACCUM render buffer — fade/echo/glow/FLOW) and the
**GOVERNOR** (cost-tier sheds + watchdog freeze — the *anti*-animation systems).

## CLOCK — what time it is

- dt clock (spine A): clamped per-frame delta → `loopTimeMs`; keeps motion character
  stable at any FPS.
- Loop-life clock (spine C): `loopLifeT`, owned by the GL loop.
- Audio clock: beat pulse → attack/release envelope; `useBeatDecay`; `phraseTick`
  (phrase loop); `beatArbiter` (beat boundaries).
- Evolve timer: TIME / BEAT / PHRASE sources → discrete re-seed events.

Character: infrastructure. The only feel decision in here is the dt clamp.

## LIFE — autonomous ambient animation

The "it's alive with nobody touching it" layer.

- **Life LFO** — 3 incommensurate sines (0.55@0.73 + 0.30@1.19 + 0.15@0.29, spec'd in
  `spineC.selfcheck:134`), wired on the GL loop clock (`liveLoop:416`). Quasi-periodic
  rhythm — designed, acceptable for breath-class motion.
- **Life drift** — `applyLifeDrift` (`liveResolve:50-63`): jitter, displacement,
  noiseSpeed each get `base + sin(t·k + φ) × mag × depth`. **Three single fixed-frequency
  sines** (0.7 / 0.45 / 0.3) — jitter loops ~18 s, perfectly repeating. This is the
  known weak point: it reads as a metronome, not weather. (Matt's 2026-09-22 feel call;
  fBm-time-channel replacement proposed, embargo-gated — see below.)
- **Per-agent oscillators** — breath swell `particles:1033`, wing flap `:1039/:1180`:
  `sin(phase·TAU + seedOffset[i])`, amplitude × `ENERGY[i]`. Per-agent phase + energy
  makes these read organic-ish; sine is fine — a rhythm is intended.
- **Audio ballistics** — `audioBallistics.mjs` attack/release follower → scale/alpha/
  glow (spine C wiring). A shaped response, not a formula.
- **Bio-drives (#287, `docs/BIO_DRIVES_PLAN.md`)** — energy/metabolism state integrated
  on the particle integrator; gates behavior + breath amplitude.

Character: mixed. Ballistics, bio-drives, per-agent oscillators are healthy.
**Drift is the one simple-formula offender** (its audit: the whole param space has no
organic driver besides these three sines — params otherwise only move via user events
or springs).

## DYNAMICS — forces & springs

Response physics: state evolves, nothing is scripted.

- Swarm integrator (`particles.js`): force accumulation → velocity → position, damping.
- Forces: WIND, **curl wind** via `noise.curl2` (spine F — shared weather across tracks),
  graze, contacts avoidance (`engine/contacts`), behave set (`organisms/behave`),
  scent-follow, pointer attractor/gravity wells (`CanvasPanel:34`).
- Springs: heading spring + breath scale/rotation springs (spine C, damped),
  slider springs (`smoothedLayoutParams`, spine E — every slider move rides these).

Character: correct tools — springs and integrators are dynamics, not formulas.

## FIELDS — spatial structure motion reads

The genuinely organic machinery (seeded simplex 3D + fBm, Kernel K1 #59):

- **Displacement warp** — `worldNoise.fBm3D(x, y, t, 3)` evolving in time
  (`liveResolve:317-320`; phase accumulated per #436). `worldNoise` is per-project
  (`liveResolve:69`).
- **Placement noise** — fBm displacement of every placed point (`placement.js:137-138`).
- **Scent / FIELD density** — diffusion + advection in `kernel/field/`.
- **Curl** (`noise.curl2`) — the spatial derivative feeding DYNAMICS wind.
- **FLOW** (#284, `accumulationFlow`) re-advects the ACCUM trail buffer as it decays,
  but through a *separate* static seedless GPU value-noise field (`accum.mjs:320-329`,
  "curl-ish" per its own comment) — it does **not** read this module. (UI copy calls
  it "curl-advects"; treat that as shorthand, not lineage.)

Character: organic — noise over *space*. The gap called out for LIFE is noise over *time*.

## TRACKS — self-feedback patches

Motion measuring itself and feeding back — no oscillators, no external clock:

- **MOD** — `applyMod` (`trackGraph:129`): own `motionMetrics` (agitation/speed) →
  glow/fade/displace knobs.
- **FEED** — gentle positional hops capped at 4 px + displace knob
  (`liveResolve:19,370`), delay buffers (`feedDelay`, `feedOps`).
- **FIELD** track — `applyField` (`trackGraph:144`): inverse-square point forces between
  tracks within a radius.

Character: self-organizing. ("Look follows motion" — feedback, not formula.)

## TRANSITIONS — event tweens

Animation that fires only on an event, then settles:

- **itemMorph** — plan-once pairing, per-item position/scale/rotation/alpha/color tween
  with `mixEase` (`engine/kernel/itemMorph.mjs`, #419): mode/behave/palette/asset chips,
  morphEvolve, favorites.
  - ⚠ **Landing seam = #444** — blend output is asset-group order, the completion frame
    flips to raw resolver order in one frame (draw order = array order) → quick z-fight
    at the very end of every chip change. Fix = re-emit in `toItems` order; awaiting
    Matt's assignment.
- **Voice MIX** — layout-param crossfade to t=1 (`useVoiceMixDriver`, `mixVoiceState`).
- **Palette mix + pixel dissolve** (spine E, `paletteMix.mjs`): cut/start/mix state
  machine; ordered pixel dissolve when bake-ready, cross-dissolve fallback during the
  atlas-bake-wait window (`liveLoop`).
- **Preset steppers** (#381, ~6 stops/sec) and float-count spawn/death fade (spine E).

Character: easing by design — periodicity here is intentional, not the drift problem.

## Conventions (how we refer to these going forward)

1. **Prefix rule** — animation issues/PRs open their title with the system:
   `LIFE: drift reads mechanical — swap sines for fBm time channels`,
   `TRANSITIONS: landing frame re-orders items (#444)`.
2. **`liveResolve.mjs` is the frame orchestrator** (and a one-writer file). It currently
   also *contains* LIFE's drift, FIELDS' noise instance, TRACKS' knob application, and
   the TRANSITIONS state machine.
3. **Extraction target** (proposal, not yet ordered): resolve thins to a pipeline —
   `read CLOCK → LIFE.ambient → FIELDS.worldNoise → TRACKS.knobs → TRANSITIONS.morph → items` —
   each arrow an import with its own selfcheck. Extraction PRs are behavior-preserving:
   golden hashes + parity byte-identical, one PR, one writer.

## Proposed work (awaiting Matt's ordering — not tickets yet)

1. Extract LIFE + TRANSITIONS out of `liveResolve` → thin orchestrator.
2. LIFE drift: three fixed sines → seeded fBm time channels (per-project `worldNoise`
   already exists; zero new noise machinery). Feel fix — gated on the Night Migration
   30/60 play per `EMBARGO.md`.
3. #444 (TRANSITIONS seam) — fixed by PR #464 (2026-09-23); kept for history.

## Design briefs

One per system — contract & testable invariants, inventory (file:line + existing
selfchecks), failure modes, blast radius (downstream / upstream / peers), guardrail
specs, extraction plan, open questions: [`docs/kinetics/`](docs/kinetics/)
(`clock.md`, `life.md`, `dynamics.md`, `fields.md`, `tracks.md`, `transitions.md`).
(Brief-internal cites to *this* file's line numbers for §Conventions may be off by a
few lines — captured before the FLOW correction; sections are the durable handle.)

## Guardrails — decided (Matt, 2026-09-23): tiers A + B + C

- **A · Assertions** — the per-brief selfcheck proposals: order-at-landing,
  resolver-time monotonicity, hop ≤ 4 px, knob ranges, determinism goldens,
  freeze matrix, phase continuity, index identity, one-replan invariant,
  clock-domain table.
- **B · Runtime tripwires, existing infra only** — physics finite-throw → labeled
  renderFault pill, NaN harden at knob application sites, `diagnosticsLog.record`
  notes. `governorEventLog` is **not** a general log (it throws on non-shed types).
- **C · ORDER-CONTRACT tripwire** — in `buildSceneContract` (non-one-writer): flag
  any one-frame same-set item reorder via throttled `renderFault.noteExternalFault`.
  The generic z-fight diagnoser: covers the #444, #451, and #457 classes.

Findings from this design pass: **#450–#458** — all open, triage comments added
2026-09-23. (#444 fixed by #464, #441 by #462, #438 by #448, #422 split to #480
and closed — all 2026-09-23.)
