# Staging report — #1635 bench port + stale comment fix

Branch: `ember/1635-bench-port` (off origin/main @ 7a7e0a58) · Lane: backend/tooling, zero performer-facing change.
Builder staging only — not pushed, no PR. The coordinator verifies and publishes.

## What changed (2 files)

1. **`app/scripts/measureStressTelemetry.mjs`** (new, 135 lines formatted) — the frame-cost bench for
   issue #1635's kill criterion: "If the logging costs measurable frame time on the iPad budget … the
   per-frame record thins to band-changes + a stress sample at a stated stride."
2. **`app/src/curator/StressReadout.jsx`** — header comment only (details below). No code changed.

## Provenance of the bench

- Ported from the local-only branch `ember/1635-1636-band-telemetry`, commit `972e1206`
  (2026-10-22, worktree `~/workspace/kc-1635-build`), where it existed at the same path,
  standalone — no manifest entry, no npm script. Placement and standalone shape mirrored.
- **Not ported** (per the coordinator's audit): the same commit's `summarizeStressRecord` and the
  verifyPerformance CLI stress summary — main's PR #1758 evidence machinery supersedes them.
- **API adaptation: none needed.** The bench calls `createStressTracker` (stress.js),
  `createStressRecorder` / `expandStressRecord` (stressRecord.js), and `initStress` /
  `getStressState` (stressLive.js). Every called signature is unchanged since the branch;
  `initStress`'s `getDish` remains optional (omitted → dish pressure 0), and the live step's
  #1753 verdicts input tolerates its absence (`passShare` → null → base taste pressure).
  The bench's built-in accounting assertion (frames == occupancy sum over 120 000 driven frames)
  passes against main's code, which proves the fit empirically.
- **One normalization:** the file was run through the repo's prettier. `app/scripts/` is inside
  CI's `format:check` adopted set (.prettierignore, #1684) and main's sibling scripts are clean,
  so the Oct-22 layout would fail the gate. The change is layout-only (line reflow + prettier's
  redundant parentheses); every string literal and expression is unchanged, and the bench was
  re-run after formatting with the same verdict.

## The measurement on main (the kill-criteria answer)

`node app/scripts/measureStressTelemetry.mjs` — 120 000 frames/path, median of 3 reps, Node on
this sandbox VM (the bench's own honesty note applies: Node numbers order the work and size the
margin; the verdict rests on the margin, not the third digit):

| Path | µs/frame |
| --- | --- |
| A. band reader alone (tracker.update) | 0.156 – 0.162 |
| B. A + take logging (recorder.update) | 0.462 – 0.532 |
| C. live session step as shipped (initStress) | 0.141 – 0.256 |
| D. per-frame readback of a 10-min take | 19.5 – 21.6 ms one-off (not per-frame) |
| **Marginal logging cost (B − A)** | **0.300 – 0.377 µs/frame** |

Bar stated by the bench: 1% of a 60 fps frame = 167 µs. The marginal cost is ~0.002% of a frame —
three orders under the bar. (The branch originally measured 0.050 µs/frame on the author's Mac;
different hardware, same conclusion.)

**VERDICT (the bench's own line): not measurable frame time — the per-frame record stands; the
kill-criteria thinning (band-changes + strided samples) is NOT triggered.** No scope change to
record on #1635.

## The comment fix

`StressReadout.jsx` header said: "Nothing reads the band yet (Phase 4)." False since Skeleton S5:
creature posture and formation read `getStressState().band`, and `liveLoop.mjs` stamps band +
smoothed onto every frame's resolver input. The line now says exactly that. Comment text only.

Pre-edit pin check: no selfcheck matches the stale text or reads `StressReadout.jsx` source; the
two suites that mention the readout (`stressLive.selfcheck.mjs`, `foldInCensus.selfcheck.mjs`)
pin the App.jsx mount line `{DEBUG_STRESS && <StressReadout />}`, which is untouched. Both re-run
green below.

## Verification (all run in this worktree, against this tree)

- Bench: runs clean, verdict above (run twice — before and after prettier normalization).
- Stress family, by file: `stress` ok · `stressLive` ok · `stressRecord` ok ·
  `stressEvidence` ok · `stressSynthetic` ok.
- `foldInCensus.selfcheck`: 11 checks passed (incl. "dev surfaces stay dev surfaces").
- `npm run lint` in `app/`: exit 0 (0 errors; 11 warnings, all pre-existing in other files —
  `eslint` on the two touched files is clean).
- `npm run format:check` in `app/`: "All matched files use Prettier code style!"
- `git diff --stat origin/main`: only the bench (new) + the one comment, plus this report.

## What this does NOT do

- Does not close #1635: the ≥5-real-sessions evidence phase and Matt's keep-or-retune decision on
  the 0.28 / 0.72 edges remain open, exactly as the audit's REMAINDER section states.
- No changes to stress.js / stressRecord.js / stressLive.js, no manifest or package.json edits,
  no new selfcheck suite (the bench is a measurement script, as it was on the branch).
