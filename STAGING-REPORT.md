# STAGING REPORT — #1802 narrowed: recorder capture of ACCUM_GESTURE

**Coordinator's staging record.** The builder was killed mid-work by a runtime restart (2026-10-28 ~15:56 PT) after writing the full implementation but before formatting one file, writing this report, or committing. Per the lost-commit rule, the coordinator audited the working tree line by line, completed the missing steps, re-ran every verification himself, and commits it. This file replaces the report that was at the worktree root (#1800's, carried in via main; it remains in git history).

Issue: #1802, narrowed by Matt's ruling 2026-10-28 — the shipped gestures (Davis row, hold-FREEZE, #268 swell, MIDI) are untouched; the only scope is the recording bit.

## Step 1 verdict (the builder's probe, recorded in gestureRecord.mjs's header)

Capture was genuinely MISSING. The take recorder's taps see resolver inputs and outputs only; the gestures act on the loop beside the resolver, so a recorded freeze left zero trace in the take: four gestures fired mid-take, the finished take held none of them, and playback ran the take's frames under the live loop's state. Proven by probe on 2026-10-28 before any wiring.

## What shipped

- `app/src/gl/gestureRecord.mjs` (new) — the take's `gestures` section, shaped like the route section (#1483 precedent): a recorder fed from the bus (payload + meta), and a fail-closed shape check + `frozenAt()` for playback. The recorder ignores emissions stamped `cause: 'playback'` (a take never records its own playback), dedupes no-change freezes, caps at 2000 entries.
- `app/src/components/PerformanceButton.jsx` — a `gestures` take section beside routes/mind/spectrum: subscribes to `Events.ACCUM_GESTURE` during the take; the take's starting frozen state is read from the loop itself (the one truth — the bus carries changes, not state).
- `app/src/gl/liveLoop.mjs` — one read-only accessor, `getAccumFrozen()`. The setter remains the only way the state moves.
- `app/src/gl/playback.mjs` — a take carrying the section re-fires its gestures on the bus at their frames, through the SAME path a live press takes (CanvasPanel's subscriber, the loop methods, the Davis button mirror — no parallel implementation). The take's freeze state is asserted at load and re-asserted at any seek landing (a seek skips the frames whose events would have set it; momentaries before the landing frame are gone with them). Takes without the section play exactly as before.
- `app/src/gl/gestureRecord.selfcheck.mjs` (new, manifest-wired) — 10 checks: record shape, playback-cause exclusion, freeze dedupe, fail-closed validation, frozenAt folding, record→replay round trip.
- `app/selfcheck.manifest` — +1 line.

## Deliberately NOT built / NOT touched

- No gesture behaviour change: DavisPanel surface, hold semantics, #268 swell, MIDI path — zero diff.
- No contract fields in sceneContract.js, no step-path `frozen` flag in accum.mjs — out of scope under the narrowing ruling.

## Coordinator verification (run on this tree, 2026-10-28)

- gestureRecord.selfcheck: **10 checks passed** (re-run after the coordinator's prettier pass on the one unformatted file — the builder's only missed step besides this report).
- playback.selfcheck OK · routeRecord.selfcheck OK · midi.selfcheck OK.
- `npm run build`: green.
- Diff audited by hand: 4 modified files (+66/−2) + 2 new files; every hunk serves the narrowed scope.
