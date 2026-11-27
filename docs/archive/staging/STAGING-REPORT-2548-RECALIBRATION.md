# Staging report — #2548: accumFreezeClear flatness-bar recalibration (2026-11-27)

Backend lane, test-only, zero behavior change. Recalibrates the
presented-frame flatness check in `accumFreezeClear.selfcheck.mjs` from
measured data, per the follow-up recommended in
`STAGING-REPORT-FLATGRID-HARDENING.md`: the suite's intermittent CI
failure was a calibration question, not the convergence/timing defect
its sibling suites carried.

## The two populations

The suite's pin: while ACCUM is effective and the node count is > 0,
the presented frame is never the flat background. Every read (scene,
hold, post-CLEAR reseed, thaw) was asserted against one bar at an 8x8
presented-grid read: distinct >= 8, range >= 40 — calibrated on the
original author's sandbox, where the post-CLEAR reseed read
distinct 28 / range 151 at 48 nodes.

Measured since, the reseed frame (a single frame of the current scene,
taken while the frozen hold resumes) is scene-dependent and often far
dimmer than the accumulated reads around it. The healthy floor kept
dropping as more scenes were sampled, which is what made the old bar
unfixable by re-derivation at 8x8 (see Decision).

## Characterization

Probe: a copy of the suite's own browser section (same built app, same
bridge gestures, same forced-frame budgets) that records the presented
grid at 8, 16 and 32 cells instead of asserting. 7 sessions in this
sandbox on the current tree, 3 FREEZE+CLEAR cycles each = 21 post-CLEAR
reads over 7 dealt scenes (46–698 nodes); within a scene the still path
is deterministic, so repeats agree to ±1–2 and the spread below is
scene spread, not read noise. Pre-CLEAR state was healthy in every
cycle (ACCUM effective, no governor shed, no fault, no frame errors).

Post-CLEAR reseed reads, sandbox probe (distinct / range):

| session (nodes) | 8x8                    | 16x16                     | 32x32                     |
| --------------- | ---------------------- | ------------------------- | ------------------------- |
| sb1 (512)       | 24/79, 24/79, 25/79    | 70/141, 66/141, 65/141    | 181/158, 183/158, 179/158 |
| sb2 (46)        | 24/114, 23/113, 23/113 | 75/167, 74/165, 72/164    | 225/172, 229/173, 224/173 |
| sb3 (219)       | 8/21, 8/21, 8/22       | 21/47, 21/47, 23/42       | 54/82, 53/83, 52/83       |
| sb4 (698)       | 8/21, 8/20, 8/19       | 19/36, 20/38, 21/39       | 55/64, 56/67, 55/67       |
| sb5 (199)       | 42/141, 44/142, 42/141 | 119/174, 119/170, 112/169 | 236/184, 232/184, 241/184 |
| sb6 (251)       | 9/24, 8/21, 8/22       | 27/49, 25/48, 25/50       | 66/91, 62/89, 66/89       |
| sb7 (304)       | 6/13, 6/14, 6/14       | 15/31, 13/32, 14/32       | 34/67, 33/67, 32/72       |

Post-CLEAR reads from other sources (8x8 only — the read as shipped):

| source                                 | distinct / range | notes                                       |
| -------------------------------------- | ---------------- | ------------------------------------------- |
| sandbox, hardening lane                | 12/32 and 7/31   | stable across a 2400-frame budget           |
| CI, PR #2549 run 45992109688 attempt 2 | 7/38             | 230 nodes; log read firsthand               |
| CI, PR #2546 run 45943338189 attempt 2 | 12/34            | the SCENE read of the same suite, same band |
| author's sandbox (calibration origin)  | 28/151           | 48 nodes, pre-#2548 A/B                     |

The five CI runs named in the issue's handoff (45991146181,
45888821409, 45863161180, 45862719647, 45778197645) were also mined:
their browser jobs failed at other suites or passed this one — no
further accumFreezeClear failure samples exist in them.

Floors across all four read points, fixed tree, sandbox probe:

| read       | n   | 8x8 floor | 16x16 floor | 32x32 floor |
| ---------- | --- | --------- | ----------- | ----------- |
| scene      | 7   | 8 / 23    | 24 / 43     | 66 / 64     |
| hold       | 21  | 8 / 22    | 22 / 41     | 53 / 64     |
| post-CLEAR | 21  | 6 / 13    | 13 / 31     | 32 / 64     |
| thaw       | 7   | 9 / 22    | 23 / 43     | 52 / 74     |

The post-CLEAR read is the weakest at every density, as designed: it is
the one-frame reseed, not an accumulation.

## Negative control — the defect through the same read path

The same probe run against the pre-fix tree (e4dd35f9, the parent of
the reseed fix) at 41 nodes, healthy pre-CLEAR state:

| read          | 8x8           | 16x16     | 32x32           |
| ------------- | ------------- | --------- | --------------- |
| scene         | 28/144        | 53/149    | 132/153         |
| hold          | 28–29/136–144 | 53–60/149 | 126–132/151–153 |
| post-CLEAR x3 | **1/1**       | **1/1**   | **1/1**         |
| thaw          | 28/136        | 58/149    | 125/151         |

A uniform frame is uniform at any sampling density: the defect
signature is distinct 1 / range 1 at 8, 16 and 32 cells alike, while
the scene around it reads healthy. The recalibrated bar (below)
rejects 1/1 on both metrics.

## Decision

Read the presented grid at **32 cells**; bar **distinct >= 12,
range >= 24**.

Margin arithmetic, against the global healthy floor (post-CLEAR,
32/64) and the defect signature (1/1):

- healthy side: 32 / 12 = 2.7x on distinct, 64 / 24 = 2.7x on range.
  A healthy frame would have to fall ~63% below every observed floor
  on both metrics at once to false-fail.
- defect side: the bar is 12x the defect's distinct and 24x its
  range. A flat frame cannot drift into passing.

Rejected alternatives:

- Re-derived bar at 8x8: the healthy floor is 6/13 and fell with
  nearly every newly sampled dim scene (range floor across sources:
  38 → 34 → 31 → 21 → 13). A bar under it (≈4/8) would sit only
  ~1.5x below the floor with the floor still moving — no stable
  margin exists at this density.
- 16x16: floor 13/31; a ≈6/15 bar gives ≈2.2x / 2.1x healthy
  margins — workable, strictly worse than 32x32 on both sides.
- 32x32 also matches the family's own precedent: bgWhiteScene reads
  the presented grid at 32 cells for the same distinct/range metrics.

## The change

`app/src/gl/accumFreezeClear.selfcheck.mjs` only, two hunks:
`__kcPresentedGrid(8)` → `__kcPresentedGrid(32)` in `gridStats`, and
the `notFlat` bar 8/40 → 12/24 with the calibration comment replaced by
the measured distribution and this issue's number. No assertion,
gesture, or group changed; no production code touched.

Noted, deliberately not changed: `bgWhiteScene.selfcheck.mjs` carries
its own copy of the old numbers (distinct >= 8, range >= 40 at its
32-cell read) under a comment naming them "the accumFreezeClear
flatness bar". Its reads are standing scenes on a white field — its
own measured healthy floor is distinct 29 / range 90 — so its bar
keeps its margins for its own defect (a pure-white blank at ~1/0).
After this change the comment's name is provenance, not a shared
constant; a one-line comment correction there is a separate cleanup,
out of this lane's scope.

## Local verification

Lint (`eslint`) and `prettier --check` clean on the touched file.

Recalibrated suite, sandbox (chromium 1248 present, browser section
ran every time — 10 groups, never skipped), final loop with per-run
logs and true exit codes:

| run | duration | verdict              |
| --- | -------- | -------------------- |
| 1   | 118 s    | ok (10 groups), rc 0 |
| 2   | 85 s     | ok (10 groups), rc 0 |
| 3   | 103 s    | ok (10 groups), rc 0 |
| 4   | 281 s    | ok (10 groups), rc 0 |
| 5   | 139 s    | ok (10 groups), rc 0 |
| 6   | 118 s    | ok (10 groups), rc 0 |

The road to that loop, recorded honestly: a first loop showed 5
verdict-line passes around one run that died under a Node error banner
whose text the loop's own piping discarded (verdict unrecoverable —
the same harness trap the hardening lane hit); a full-output
diagnostic run immediately after passed clean (91 s); a second loop
with per-run logs was interrupted by a sandbox restart after 1
confirmed pass (89 s, rc 0); the tally above is the third loop,
re-taken whole after the restart.
