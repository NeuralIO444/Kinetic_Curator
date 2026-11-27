# Staging report — flat-grid convergence flake family (2026-11-26)

Backend lane, test-only, zero behavior change. Companion to the PR that
hardens `bgWhiteScene.selfcheck.mjs`. This report also records why
`accumFreezeClear.selfcheck.mjs` was diagnosed but **not** changed.

## The evidence that opened the lane

- PR #2546 (docs-only; verified diff vs main `fed78912`: 106 files, all
  markdown, zero code) failed its `selfcheck-browser` job on attempt 1 at
  `bgWhiteScene`'s standing-scene read (presented count n:24, flat
  light-grey modal [199,197,190]) and on attempt 2 at
  `accumFreezeClear`'s scene read (n:25); attempt 3 passed. Attempt
  conclusions verified via the Actions attempts API.
- Main at the identical app code (`fed78912`) recorded a full CI success
  the same evening (run 45888737478). The failure follows the runner,
  not the code.
- PR #2540's re-run told the same story from the other side:
  `pausedRecallPresent` (already frame-budget hardened on that branch)
  passed all 18 groups while the job still failed at `bgWhiteScene`.

## Family scope (by grep, on current main `ab9b35cd`)

Only three suites read the presented grid (`__kcPresentedGrid`):
`pausedRecallPresent`, `bgWhiteScene`, `accumFreezeClear`. Only the
latter two used the still path (`__kcStill`) at all, and both carried
the same shape: an identical `forceFrames(count, budgetMs)` helper that
races a fixed count of stills against a wall clock, then a **single**
presented-grid read asserted against the flatness bar
(distinct >= 8, range >= 40). `trioLive`'s "reads flat" is about
spectrum bars in a data structure — unrelated.

## Diagnosis — bgWhiteScene: mechanism matches, hardened

The failing reads sample the grid at the earliest possible moment —
the presented count at failure (n:24) is roughly the forced still count.
Convergence is a function of presented frames (the resolver/bake
advances per present); under runner CPU contention the still race
expires early and the first presents still show the pre-scene flat
field, so a single early sample reads flat on a healthy app.

Fix, following the `pausedRecallPresent` pattern (PR #2540): every
presented-grid read in the suite is now a convergence wait budgeted in
presented frames — `waitForGrid` forces the gesture's seed frames, then
keeps forcing 6-frame batches and re-reading until the criterion holds,
the presented count advances `FRAME_BUDGET = 2400` past the wait's
baseline, or the count stops advancing for `HANG_MS = 120000` (hang
detector). Criteria, thresholds and assertions are unchanged
(`marksOnWhite` and the flatness bar verbatim); failure messages now
carry the last grid's measured values.

Pin strength: a truly blank frame is stable (the #2487 blank held
across a frozen buffer), so a blank spends the whole budget and still
fails. Verified by a negative-control harness over the wait logic:
healthy grid → returns; permanently flat grid with advancing count →
budget error with measured values; frozen count → hang error.

### Local verification (sandbox, chromium 1248 present, full counts)

Six consecutive passes, 11 groups each (browser section ran, never
skipped), durations 255–382 s under heavy sandbox CPU contention:

| run | where | duration | verdict |
|-----|-------|----------|---------|
| 1 | foreground | 334 s | ok (11 groups) |
| 2 | loop 1 | 382 s | ok (11 groups) |
| 3 | loop 1 | 331 s | ok (11 groups) |
| 4 | loop 2 | 255 s | ok (11 groups) |
| 5 | loop 2 | 357 s | ok (11 groups) |
| 6 | loop 2 | 262 s | ok (11 groups) |

Lint and `prettier --check` clean on the touched file. No other suite
references this file's contents (grep-verified), so no source-shape
pin can break.

## Diagnosis — accumFreezeClear: mechanism only partly matches; NOT changed

The CI failure (scene read, n:25) is the family mode above, and a
frame-budget wait was built for this suite the same way. Local
verification then exposed a **second, distinct failure mode** that
dominates in this sandbox and that no convergence wait can cure:

- Post-CLEAR reads (loop-2 runs 4 and 6): the checks before CLEAR all
  passed — scene healthy, governor shed absent, fault absent — then
  the reseeded held frame read **distinct 12 / range 32** and
  **distinct 7 / range 31**, *unchanged across the full 2400-frame
  budget*. While frozen, the held frame is static by design; the
  single-frame reseed of a dimmer scene sits permanently in the
  21–39 range band on the coarse 8x8 grid — above the defect's
  signature (distinct 1 / range 1) but below the bar (>= 40). The
  original single read fails these runs identically; the wait only
  makes the failure slower (986 s / 997 s).
- Scene read (loop-2 run 1): after 2400 presented frames the
  accumulating buffer still read distinct 7 / range 21 (3199 s run).
  An accumulated buffer's contrast is not monotonic in frames — a
  moving scene averages toward a wash — so "wait for more frames" is
  not a sound convergence model for this suite's buffer reads.

Full local tally for the hardened accumFreezeClear build (reverted in
the PR; numbers kept here for the record): 5 consecutive passes
(86–282 s, 10 groups), one run lost to a Node error banner under
extreme contention (1219 s, verdict unrecorded — loop piping bug),
then loop 2: PASS / FAIL / PASS / FAIL / PASS / FAIL as detailed
above (passes 94–401 s). The 6-consecutive bar was not met, and the
failure mode is not the one the wait treats.

**Disposition:** the frame-budget hardening for this suite is not
shipped. The suite's remaining marginality is a calibration question —
the bar was set against the author's sandbox (post-CLEAR reads of
distinct 28 / range 151) and this environment's reseed frames land
under it — and re-calibrating a threshold is a different change from
hardening a wait, with its own evidence burden. Recommended follow-up,
not attempted here: characterize the reseed frame's distinct/range
distribution across scenes on a CI-class runner, then decide whether
the pin should read a finer grid or assert against the defect's actual
signature with a re-derived bar.

## Sandbox notes

Both run loops were damaged by the environment, in the open: loop 1's
process group was SIGTERM'd at ~99 min (its last accumFreezeClear run
is the unrecorded-verdict one above), and loop 2 ran under severe CPU
throttling throughout (several runs > 900 s). Counts quoted are only
from runs whose verdict line and exit code were both captured.
