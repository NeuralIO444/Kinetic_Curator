# STAGING REPORT — issue 2485 (A7): DIRECTORS EVOLVE runs for minutes with GEN 0 / SEEN 0

Branch `feat/2485-directors-evolve-stall`, base `f35792b6` (current origin/main;
the session build `f260b74` is an ancestor, and the only commit between it and
the base that touches any evolve-path file is the A3 watchdog change — the
evolve machinery itself is byte-identical to the session build).

## Reproduction verdict: REPRODUCED — shape (c)

Generations advance only under a precondition the session lacked, and the
stall is silent. It is not shape (a) (the generator works whenever its source
delivers — controls below) and not shape (b) (the readout is honest: `evolveSeen`
is written only inside `withEvolveStats`, which is called only from
`triggerEvolve` — SEEN 0 proves the generator was never invoked once).

Reproduction drove the REAL store and the REAL driver machinery (the exact
`loopIntervalTick` / `euclidHit` / `routeBeat` code App.jsx and usePhraseLoop
run), in the session's own configuration — A1's earlier flurry had left
evolveTarget=ALL and evolveSource=BEAT (its click list ends "…PALETTE + ALL +
source BEAT"), phrase ON with clock EUCLID at length 32:

- **P1 — the stall.** EVOLVE on, source=beat, audio off, dial metro off. Five
  simulated minutes of loop time with the phrase's EUCLID driver running
  verbatim: the phrase advanced (beat 0 → 23, 11 wraps — the session watched
  14/32 → 29/32, the same signature) while GEN stayed 0 and SEEN stayed 0.
  Nothing anywhere in the state or the surface says why.
- **P2 — control, time source.** Source=time driven exactly as App.jsx's
  interval effect drives it, loop clock flowing: 15 generations in 30
  simulated seconds, on the 2 s cadence, SEEN tracking 1:1.
- **P3 — control, beat source with beats.** Ten beats delivered through
  `routeBeat` + `triggerEvolve` (App.jsx `onBeat` verbatim): 10 generations.
- **P4 — stall shape 2.** Source=time with the loop clock held (loop stopped /
  not presenting): five wall minutes, GEN 0 / SEEN 0 — the same silent readout.
- **P5 — stall shape 3.** Source=beat with the beat route set to PHRASE:
  `routeBeat` returns `fireEvolve: false` on every attack while the phrase
  still answers — EVOLVE runs and can never fire, again silently.

## Root cause

EVOLVE has exactly two fire paths, and both are conditional:

1. **TIME** — an App.jsx rAF effect, installed only while
   `evolveMode && source==='time' && !slowRender && !batchPaused`, firing
   `TRIGGER_EVOLVE` when `loopIntervalTick` crosses the interval on the GL
   loop clock. A held loop clock (loop stopped) means the interval never
   elapses; a governor hold (`slowRender` / `batchPaused`) uninstalls the
   driver entirely.
2. **BEAT** — App.jsx `onBeat` → `routeBeat` → `triggerEvolve`, gated by
   `!slowRender && !batchPaused` and `route !== 'phrase'`, and fed only by
   mic attacks or the BEAT dial's metro pulse. No attack arriving (audio off
   and metro off, or audio on in a silent room) means no fire, ever.

The session sat in path 2 with no beat input arriving: the source had been
left on BEAT, the phrase kept advancing on its own loop-time EUCLID clock
(which needs neither beats nor audio), and EVOLVE waited for attacks that
never came. The defect is the silence: in every starved configuration the
EVOLVE button shows STOP and `EvolveProgress` shows GEN 0 / SEEN 0 / S/GEN —
indistinguishable from a healthy run about to fire. A minutes-long stall
with zero explanation is the failure; the generator itself is sound.

## The fix

The surface now names the wait. No generator, driver, gate, or routing
behaviour changes — a beat-less BEAT run still waits for beats (that is
what SOURCE=BEAT means); it just says so.

- **`app/src/data/evolveProgress.js`** — new pure helper
  `evolveWaitReason(facts)`: given the store's own facts (mode, source,
  beat route, audio on/off, dial metro, governor/batch holds, loop running,
  live gen), returns the performer's reason or null. Hard holds — governor
  freeze, batch export, PHRASE route, no beat input, stopped loop — are
  named at any gen (a mid-run input loss speaks too); the soft wait
  ("waiting for a beat") shows only before the first generation lands.
- **`app/src/panels/davis/EvolveProgress.jsx`** — subscribes to those facts
  and renders the reason as one dim line under the cells, only while EVOLVE
  runs and a reason exists. When the run can fire, the readout is
  byte-identical to before.
- **`app/src/styles/panels.css`** — `.davis-progress-wait`: full-width,
  dim, under the four cells. Nothing else in the panel moves.
- **`app/src/data/evolveProgress.selfcheck.mjs`** — extended (section D):
  the helper's full truth table; the session configuration end-to-end
  through the real store and beat arbiter (stall names itself → audio on →
  soft wait → beats land → quiet → input dies mid-run → named again →
  PHRASE route named → time source on a stopped loop named → governor hold
  outranks the source); and a shape pin that the panel renders the helper.

A/B: the extended suite is red on the base tree (the helper does not exist
there) and green here; the machinery-level reproduction numbers (P1–P4) are
identical before and after the fix, as they must be — the fix changes what
the surface says, not what the generator does.

## What the performer sees (for lane routing)

One new line of small dim text inside the existing EVOLVE progress readout,
visible only while EVOLVE is running and starved or waiting (e.g. "no beat
input — audio off, metro off", "waiting for a beat", "held — governor froze
the loop", "loop stopped — RUN to evolve"). Nothing else changes: no layout
shift beyond that line appearing inside the readout box, no new controls,
no change to any sound, motion, or generation behaviour. When EVOLVE can
fire, the panel is exactly as it was.

## Verification

- Extended suite: `evolveProgress.selfcheck: OK` (sections A–D).
- Targeted neighbours, all pass: beatArbiter, davisState, usePhraseLoop,
  watchdog, watchdogLaw.
- `npm run lint`: 0 errors (11 warnings — the pre-existing baseline on this
  base, unchanged).
- `npm run format:check`: clean.
- `npm run build`: green (local vite 8.3.5; the worktree needed a fresh
  `npm install` first — the sandbox's cached impostor vite 8.0.12 otherwise
  serves the build; the install's package-lock churn was reverted, this
  change touches no dependencies).
- Full manifest sweep (continue-on-error, verdict lines counted from the
  sweep log only): **829 PASS / 3 FAIL of 832**. The three failures are the
  known sandbox-environmental set — swarmWasm (exit 1), rollSafety
  (exit 1), accum (exit 134) — each A/B-proven: with this change stashed,
  all three fail on the pristine base with identical exit codes. Nothing in the sweep is
  attributable to this branch (which touches a data helper, one panel
  component, and one CSS rule).

## Deliberately not done

- **No fallback from BEAT to TIME** (or any silent source substitution):
  SOURCE=BEAT is a deliberate performer choice — "fire on a mic attack" —
  and evolving on a timer instead would change the instrument's meaning,
  not repair it. The honest repair is the named wait.
- **No change to the gates themselves** (`slowRender` / `batchPaused`
  holds, the arbiter's route law, the loop-clock cadence): each is a
  standing, deliberate law (#107 §4/§5, #808). They stay; they are now
  visible on the surface they stall.
- **One-writer files untouched**: `liveLoop.mjs`, `liveResolve.mjs`,
  `particles.js` were read for the audit (the loop clock's semantics) and
  not modified; no seam in them is indicted — the time driver's clock
  behaviour is by design (#808).

## QA fix round (2026-11-25)

QA verdict: NOT CLEAN on one SHOULD-FIX, everything else verified —
diagnosis (shape (c), independently reproduced), no behaviour change,
byte-identical readout when the run can fire, copy accuracy, pin honesty,
scope. The gap QA's own gate enumeration found: **beat source + metro-only
input + stopped loop**. The dial metro is gated on the loop running
(metroRunning), so in that state no beat can ever arrive — yet the helper
showed the soft wait at gen 0 and nothing at gen > 0 (QA demonstrated on
the real store: metro run at GEN 3, show stopped, reason null). Fixed in
this round: the beat branch names the stopped loop at any gen when the
metro is the only possible input and the loop is stopped; section D gains
the truth-table rows (including the asymmetry pin — mic input fires while
stopped, so an audio-fed beat source on a stopped loop is NOT named) and
a store-level step (metro lands generations → stop → named → RUN →
quiet). QA's routing opinion, recorded: full-auto lane once this fix
landed — the wait line is factual blocker text in the same class as the
telemetry line's status-honesty surfaces, and the shape that would belong
to the review lane (changing what EVOLVE does) is what this fix refuses.
