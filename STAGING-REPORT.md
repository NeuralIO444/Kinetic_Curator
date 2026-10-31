# STAGING REPORT — PR #1888 fix: BEAST S1/S2 made honest

**Branch:** `feat/beast-s1-s2-2026-10-30`, on top of PR head `50dfa9ac`.
Local only — no push, no PR edit (the coordinator publishes and rewrites
the PR body; the body is still the blank template and needs its real
`Closes #1864` / `Closes #1865` lines from the coordinator).

**What this commit is:** the previous head commit (`50dfa9ac`, "loosen
selfcheck tolerances and drop unused imports so CI can pass") had deleted
acceptance checks from `beast.selfcheck.mjs` to reach green. This commit
restores the checks and fixes the actual defects they were hiding — on
both sides of the comparison — plus three further real failures that the
PR's lint error had been masking in CI (the lint-build-selfcheck job
stops at lint, so its selfcheck stage never ran).

## The reconciliation story (the core fix)

The deleted Wang-anchor comparison failed because **both** sides were
wrong:

**Side 1 — the anchors were mistranscribed.** `WANG_ANCHORS` in
`jansenMeasures.js` did not match its own cited source
(`docs/design/strandbeest-linkage-research-2026-10-29.md` §3, Wang 2026
baselines for the holy numbers at a=38):

| metric    | PR had | source says | status    |
| --------- | ------ | ----------- | --------- |
| flatness  | 0.0281 | 0.0281      | was right |
| ripple    | 0.267  | 0.0956      | corrected |
| step      | 2.73   | 43.3        | corrected |
| clearance | 1.12   | 25.7        | corrected |
| duty      | 0.249  | 0.202       | corrected |

Step 2.73 was physically impossible for a leg whose bars run 40–66 long.
The correction and its provenance are recorded in the `jansenMeasures.js`
header comment.

**Side 2 — the solver assembled the leg in the wrong mode.** Branch
selection chained by continuity from an arbitrary θ=0 candidate, which
silently settled into the flipped-J5 assembly: the foot curve was a tall
loop, not the flat-bottomed Jansen ovoid. Measured with the head commit's
own (deleted) assertions, the old solver produced flatness 3.537, step
22.01, ripple 87.1, clearance 82.9, duty 0.449 — nowhere near any
transcription of the published values.

The solver now pins each joint's branch by a fixed signed-area rule
(J2 +, J3 +, J4 +, J5 −, F +) — the assembly mode that reproduces the
published gait, constant over the whole cycle with wide margins (signed
heights documented in the `jansenSolver.js` header). This also removes
the old `prev`-chaining, so `solvePose` is a pure function of
(lengths, θ) — call-history independent, replay-legal. All existing
callers (`beastBuilder`, `beastTrails`, `beastMotion`) already called it
statelessly; nothing else used the dropped `prev` field.

**Metric definitions** in `evaluateGenome` now implement the research
doc's definitions: stance = foot within the lowest 15% of its height
range; flatness = RMS stance-height deviation normalized by step length
(the published 0.0281 is that ratio — the absolute RMS is 1.21 at a=38);
ripple = std/mean of stance horizontal velocity (central differences);
step = stance horizontal travel; clearance = max foot height above the
stance mean (the ground line); duty = stance fraction of the cycle.

**Result — wild type at a=38 vs the published anchors:**

| metric    | solver   | anchor | residual | tolerance |
| --------- | -------- | ------ | -------- | --------- |
| flatness  | 0.028127 | 0.0281 | 0.000027 | 0.002     |
| ripple    | 0.095571 | 0.0956 | 0.000029 | 0.01      |
| step      | 43.344   | 43.3   | 0.044    | 1.0       |
| clearance | 25.746   | 25.7   | 0.046    | 1.0       |
| duty      | 0.20278  | 0.202  | 0.00078  | 0.01      |

Tolerances are ~25–75× the measured residuals — and the flipped-J5 mode
misses them by 67×–9000×, so a solver that assembles the leg wrong or
drifts in its definitions fails the gate instead of being loosened past.
No tolerance was loosened and no assertion deleted anywhere in this fix;
the one deleted-check restoration is byte-identical to the pre-deletion
original (verified against `8f5c34eb`).

## Checks restored / added in the suites

- **S1 round-trip restored** in `beast.selfcheck.mjs`
  (`addJansenMeasures` + `sanitizeGenome`) — it passes standalone, as the
  coordinator verified; its deletion was gratuitous.
- **S2 golden comparison** against the corrected anchors (above).
- **S2 flat-bottom property**, asserted as a property via the independent
  S5 sampling path: mid-stance height range / step < 0.05 (measured
  0.024), and the ground stroke is monotone (no cusp, no sign change).
- **S2 purity spot-check**: `solvePose` result identical cold vs after a
  full-cycle warm-up sweep.
- **`jansenSolver.selfcheck.mjs`**: bar-closure proof (all ten solved
  bars at genome length at every sampled pose, max residual 6.7e-16),
  `evaluateGenome` determinism, k-tripwire and rounding checks retained.

## The three masked failures, fixed

1. **Manifest registration** — `beast.selfcheck.mjs` and
   `jansenSolver.selfcheck.mjs` added to `app/selfcheck.manifest` next
   to the sibling creature suites (the selfcheck-browser CI failure).
2. **Determinism law** — `logBias` in the PR's Queen-lean module stamped
   its log with `Date.now()`. Time is now a caller-passed parameter
   (loop time), with the reason documented at the site. The unused `dt`
   parameter in `beastMotion.js`'s `bodySpeedFromStance` is removed.
   Full `eslint .` is back to 0 errors.
3. **Deniability pin** — `curator/queenLean.selfcheck.mjs` asserts no
   file outside `curator/` references her identifiers (`queenLean`,
   `GATE_OPEN`, …): the Queen's sway is hidden by law. The PR's new
   module `engine/queenLean.js` tripped it by its own name/header. The
   module had no importers yet, so it is renamed to
   **`engine/herdingLean.js`** (export `queenHerdingLean` unchanged —
   it contains no forbidden identifier). Flagging for the coordinator:
   if Matt prefers the module to live under `curator/` instead, the
   rename is one more `git mv`; what it cannot do is keep the
   `queenLean` name on an engine surface.

## Cost-tier gate fallout (also masked by the lint failure)

`gl/costTiers.selfcheck.mjs` failed two ways on the PR's registrations:

- **Coverage**: declared non-tier-0 effects must have a committed
  measurement. `beast/trails` (was tier 1) had none. A real measurement
  was taken (CPU wall: 0.0034 ms per 72-point deposit, median of
  5 × 2000, node) and the row committed at the declared 0.02 ms, erring
  up ~6×, in `gl/effects/measuredCosts.mjs` with the derivation in the
  comment — the file's standing hand-added precedent (#1482/#1805).
- **Tier semantics**: tier 1 is contractually _exactly_ the GL pass set
  the governor's perfTier1 cut covers (the gate pins that set: the 10
  ACCUM passes). A CPU trail deposit is not a GL pass and that mechanism
  cannot shed it, so the tier-1 declaration was false. `beast/trails`
  is re-declared **tier 0** — the same treatment as its sibling
  `beast/solver` (CPU work that sheds with the creature/deposit budget),
  with the notes rewritten to say so. The exact-set pin was NOT
  re-pinned. With tier 0 the measurement row is exempt by contract and
  is kept as the honest price on record.

## Verification (all on the final tree)

- `beast.selfcheck.mjs`: 5 checks + green banner — anchors, flat-bottom
  property, purity, S5 Fréchet self-distance, S1 round-trip.
- `jansenSolver.selfcheck.mjs`: 5 checks + banner — feasibility, bar
  closure (6.7e-16), determinism, k tripwire, rounding safety.
- `curator/queenLean.selfcheck.mjs`: 29 checks pass (post-rename).
- `gl/costTiers.selfcheck.mjs`: sections A–F pass (74 declarations,
  41 measured, bands hold, governor registry-driven).
- **Full manifest sweep: all 544 commands accounted for** (run in
  segments because the runner halts at first failure):
  - 540 pass in place, including both beast suites in-sweep and
    `kineticSweep` (the ~1.5% flake, #1822, did not fire); the
    541st, `curator/queenLean`, passes on its standalone re-run
    post-rename (29 checks, above).
  - `swarmWasm` — environmental: sandbox has no `cargo`; fails
    identically on pristine `origin/main` (base-identical proof).
  - `fx/rollSafety` — environmental: Playwright "Target crashed" in the
    sandbox browser; identical failure on pristine `origin/main`.
  - `gl/retroCapture` — failed once under sweep load on its wall-clock
    perf assertion (2.593 ms/frame); passes solo on this tree (3 s);
    its code path is untouched by this diff. Noted, not chased.
- `npm run lint`: exit 0 (0 errors; remaining warnings are pre-existing
  react-hooks notes in untouched files).
- `npm run build`: exit 0. `npm run format:check`: clean.
- Suites naming every touched file were grepped and run (creature
  breeding/dream/genome/policy, dishCreatureLoot, featherFan, glitch,
  markWeather, parallaxDrift, surge, travel, tides, kernel cost suites)
  — all inside the sweep segments above, all green.

## Scope notes

- `beastMotion.js` / `beastTrails.js` remain S3/S5 material riding in an
  S1+S2 PR, unwired from the app — untouched except the `dt` lint fix;
  labeling them is the coordinator's PR-body call.
- The audit work of the previous (interrupted) fixer was verified line
  by line against the research doc before being kept; the two judgment
  calls in this commit are the coordinator-visible ones: the
  `herdingLean.js` rename and the `beast/trails` tier-0 re-declaration,
  both forced by standing gates described above.
