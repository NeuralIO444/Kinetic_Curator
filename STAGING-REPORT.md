# STAGING REPORT — #1635 (stress telemetry) + #1636 (band hysteresis)

Branch `ember/1635-1636-band-telemetry`, staged locally (not pushed, no PR — the coordinator
publishes). This file replaces the previous stage's report at the worktree root; that report
remains in git history.

- `972e1206` — #1635: take summaries backstage + the frame-cost measurement
- `fe783076` — #1636: the issue's done-when cases recorded as selfchecks

## First, the honest headline

Most of both issues' scope was **already on main** before this build, landed by the Phase 2/3
creature work (#1354, #1375, #1658): the per-frame stress record inside takes, the session
occupancy counters, the `?debug=stress` readout, and the hysteresis mechanism itself. This build
did **not** re-implement any of that. It delivered the pieces that were genuinely missing:

- #1635: a backstage reader for a recorded session's stress (the summary the edges get tuned
  from), and the issue's kill-criteria frame-cost measurement, which had never been run.
- #1636: the issue's two done-when cases in the exact form it specifies them, plus the
  kill-criteria latency guard. The mechanism needed no change — the cases pass against it
  as shipped, and no behaviour code was touched.

## #1635 — what landed (commit 1)

Already on main (verified, not rebuilt): while a performance is recorded, every stress-tracker
update is logged into the take's `stress` section — the three signals as run-lengths plus each
band change, in that record's existing shape — and `expandStressRecord` reads it back as one
`{ frame, stress, band }` per frame. Live, the session state carries `occupancy` (frames per
band) and `crossings`, proven to sum to the session's frame count
(`stressLive.selfcheck` §7, `stressRecord.selfcheck` §2/§5), and the dev-only
`?debug=stress` readout shows them.

New in this commit:

- **`summarizeStressRecord`** (`app/src/curator/stressRecord.js`): occupancy per band and
  crossings tallied *from the per-frame readback* (so a summary can never disagree with the
  frames it summarises), plus whether the record verifies against its own signals.
  Proven in `stressRecord.selfcheck` §6, including the sum-to-frame-count assertion and a
  forged record summarising as not-ok.
- **`verifyPerformance` CLI** now prints the summary for any take carrying a stress record —
  occupancy per band with percentages, crossings and crossings per minute (the issue's own
  summary fields) — and carries it in `--json`. Covered by a new case in
  `scripts/verifyPerformance.selfcheck.mjs` (good take with a stress record; forged stress
  record reported as DOES NOT VERIFY; take without one unchanged).
- **`scripts/measureStressTelemetry.mjs`**: the kill-criteria bench (see below).

### The event-log record shape used

A take's stress section, exactly as it already existed — no new log, no new event core:
`{ version, initial: { smoothed, band }, runs: [[frame, activity, dish, taste, n]…],
bands: [[frame, band]…], occupancy: { relax, normal, tighten } }`. The per-frame stress + band
view is the readback of that record (`expandStressRecord`), and the new summary is tallied
from the readback.

**Deviation from the brief, flagged plainly:** the brief pointed at `governorEventLog` as
"the event log". That log is the *governor's* flight recorder — shed/restore records only,
validated to those two types and a fixed cut-kind list, in a 128-entry ring. Per-frame stress
cannot be written in its shape without changing its contract, would evict the entire shed
history in about two seconds of frames, and would merge two systems the codebase deliberately
keeps apart (stress.js decision 2: instrument load is the governor's domain and is *not* a
stress input; decision 1: the take's recorded log is the stress authority). The session's event
log for stress is the performance record, which is where this telemetry already lives — so the
work went there. If Matt actually wants stress in the governor log, that is a different,
smaller conversation; nothing here blocks it.

### Frame-cost measurement (the kill-criteria check)

`node scripts/measureStressTelemetry.mjs` — 120,000 frames per path, median of 3 reps,
Node on this machine (the #1622 lineage: real code paths, warmup discarded):

| path | cost |
|---|---|
| A. band reader alone (`tracker.update`) | 0.335 µs/frame |
| B. A + take logging (`recorder.update`) | 0.385 µs/frame |
| C. live session step as shipped (`initStress`, incl. occupancy/crossings) | 0.142 µs/frame |
| D. per-frame readback of a 10-minute take | 29.4 ms one-off (36,000 updates — not a per-frame cost) |

The logging's marginal cost is **B − A = 0.050 µs/frame**, about 0.0003% of a 60 fps frame —
three orders of magnitude under the "measurable" bar the bench states up front (≥1% of a
frame). **Verdict: the kill criteria do not bite. The per-frame record stands; the thinning
fallback (band-changes + strided samples) was NOT applied and no scope change was needed.**
Caveat, as the bench itself prints: these are Node numbers that size the margin, not iPad
Safari timings — the margin is the verdict.

### What stays open on #1635 (not code)

The issue's remaining done-when items need real sessions, not a builder: **≥5 real sessions
logged and summarised, then the 0.28 / 0.72 edges re-set from that evidence or kept with it.**
This build ships the summariser those sessions will be read with; it does not close the issue.
Housekeeping note: `verifyPerformance` reports a bad stress record but its exit code stays the
frame replay's verdict (its documented contract) — hardening that is a decision for the
evidence-phase PR, not taken here.

## #1636 — what landed (commit 2)

The mechanism was already where the issue demands it: **one place** — `createStressTracker`
in `app/src/curator/stress.js` — with the state living in the reader, so the band sequence is a
pure function of the stress sequence (replay already proves this in `stressRecord.selfcheck`).
No consumer has a local debounce; the creature's posture imports the reader's band and says so
in its own header. Commit 2 adds the evidence, as `stress.selfcheck` §7:

- **(a) Seeded slow sweep** (LCG seed 1636, 0→1→0 over 4,000 frames, ±0.002 jitter): exactly
  one transition per crossing — four in all, in order (Normal, Tighten, Normal, Relax;
  measured at frames 607 / 1486 / 2607 / 3488 with the reader as shipped) — and re-running the
  sweep reproduces the sequence exactly. Also asserted with smoothing isolated.
- **(b) Parked ±0.01 probe**: 1,200 frames oscillating ±0.01 around each edge, from both
  adjacent bands, reader as shipped and smoothing isolated — zero band changes in all
  eight probes; the band holds for the duration.
- **(c) Kill-criteria guard**: a crash step into TIGHTEN from a settled 0.5 / 0.6 / 0.7 arrives
  on the **same frame** with the dead-band as without it (frames 4 / 3 / 1 respectively).

**Dead-band width: `HYSTERESIS_GAP = 0.04`** — ±0.02 around each edge. Reasoning: twice the
probe's ±0.01 swing, so parked noise cannot cross it; the two dead-bands (0.26–0.30 and
0.70–0.74) keep 0.40 of clear water between them and can never interact; and the only cost is
that the smoothed value must clear an edge by 0.02 before the band follows — case (c) measures
that cost on genuine transitions at zero frames, so the band does not lag the show and the
issue's kill criteria (shrink the width / go time-based) are not triggered.

### The fence

Hysteresis was specified as behaviour-changing, so the gates ran before and after commit 2:
`replayGate`, `creatureGate`, and the `wingWarp` probe **pass identically on both sides**
(and matched the clean-main baseline before commit 1). No pin moved, nothing was re-recorded
or re-pinned — unsurprising in hindsight, since commit 2 changes no behaviour code, but the
runs were made and the verdicts recorded rather than assumed.

## Suite verdicts

Baseline (clean `2c4870e1`): replayGate, creatureGate, wingWarp, stress, stressLive,
stressRecord, governorEventLog, verifyPerformance CLI — **all PASS**.

Commit 1 (`972e1206`): `npm run build` PASS; stress, stressLive, stressRecord,
governorEventLog, verifyPerformance CLI selfchecks PASS; replayGate / creatureGate /
wingWarp PASS.

Commit 2 (`fe783076`): `npm run build` PASS; stress selfcheck (incl. new §7) PASS; stressLive,
stressRecord, governorEventLog, verifyPerformance CLI PASS; replayGate / creatureGate /
wingWarp PASS — identical to before the commit.

Not run: the full manifest sweep (the coordinator's tally covers it); nothing outside the
band/governor/event-log families was touched by either commit.
