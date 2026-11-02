# STAGING REPORT — #1919 Option B: the loop-time crawl trip (PR #1920 follow-up)

Branch: `fix/1919-governor-ladder-first` (worktree `~/workspace/kc-1919-build`), on top of 5bbe3742 (the ladder-first build + QA fix, see STAGING-REPORT-1919.md).
Local commit only — not pushed. The coordinator verifies, QA-reviews, and pushes; auto-merge is armed on PR #1920 and fires when CI goes green. Review lane: Matt merges (via the armed auto-merge, per his 2026-11-01 AFK word).

## Why this exists

PR #1920's e2e-smoke failed deterministically on CI (12 tests, same 9 files, three attempts). The coordinator's A/B probe (diagnosis: `goals/kinetic-curator-generative-art-instrument/hidden_files/pr1920-e2e-diagnosis-2026-11-01.md`, "Mechanism PINNED") proved the cause: the ladder-first gate holds the fps-critical watchdog for the full ladder walk (~70–95 s under load), so the loop runs-and-crawls at effFps 3–5 — the main thread saturates (clicks/evaluates hang past the 60 s test timeout) and loop time crawls (dt clamped at 50 ms/frame, so a 2 s bar takes ≥13 s of wall). The fps-stalled carve-out never fires because frames keep completing inside its 2 s bound; PERF PAUSED never occurs. Matt ruled **Option B** (issue #1919, comment 6570259959, 2026-11-01 22:00 PT): a loop-time crawl trip, sibling to the fps-stalled carve-out.

## What changed, mapped to the ruling

**The trip.** When presented frames advance loop time too slowly relative to wall time over a sustained window, the watchdog trips — reason `'fps-crawl'`, its own event-log record ('watchdog hard stop — loop time crawling', detail carries the measured percentage), through the untouched `tripWatchdog` path → the standard PERF PAUSED state. Like the other carve-outs it is NOT gated by the ladder (invariant 3 of the ruling).

**Where the signal comes from (no one-writer file touched).** `loopTimeMs` lives in liveLoop.mjs's closure and never enters the store, but the crawl quantity is fully determined by the presented-frame cadence: every presented frame books `clamp(rawDt, 8, 50)` ms of loop time (liveLoop.mjs:1293–1295). The fps meter's module-level rAF delta ring (`useFpsMeter.js` — the same honest distribution the GOV TUNE histogram reads, because the FPS average lies) carries that cadence on the shared main thread, and the meter is mounted unconditionally beside the governor (App.jsx:377–378). The governor replays the loop's exact clamp arithmetic over the ring. No liveLoop.mjs / liveResolve.mjs / particles.js edit was needed or made.

- `app/src/hooks/governorCuts.js` (pure): `measureLoopRate(deltas)` walks the ring newest→oldest, accumulating wall = Σδ and loop = Σ clamp(δ, 8, 50), until it holds both the window and the frame floor; a delta ≥ `FRAME_STALL_MS` ends the measurable episode (that silence is the stall trip's jurisdiction — in the live wiring its trip latches first — and the rate is judged on the completing stream since it). `loopTimeCrawling(deltas)` is the boolean. A stream that can't fill the window measures null — no verdict, never a trip. Constants, all named and pinned: `CRAWL_WINDOW_MS = 4000`, `CRAWL_MIN_FRAMES = 8`, `CRAWL_MAX_LOOP_RATIO = 0.25` (the ruled sketch's numbers), `LOOP_DT_MIN_MS = 8` / `LOOP_DT_MAX_MS = 50` (the loop's own clamp, cited to its tick).
- `app/src/hooks/usePerformanceGovernor.js`: the crawl judgement rides the existing 250 ms carve-out poll, immediately after the stall check (the stall trip's block is byte-preserved, restructured from a negative guard to a positive block with a return so the crawl judgement can follow it). Guards are the stall poll's own ladder, unchanged: governor armed; GL context-down arms the resume-restart (the 5bbe3742 QA-fix path — the restart-consume branch now also clears the delta ring, so a window never spans a restore); hidden tab never judged; paused / cut-6-frozen / already-stopped arms the restart; disarmed until the first presented frame (the same null heartbeat that disarms the stall).
- `app/src/hooks/useFpsMeter.js`: one additive export, `clearFrameDeltas()`. The wiring clears the ring at the two episode restarts — the poll's stopped→running consume, and the `visibilitychange` return (the one delta spanning a hidden span is the browser parking the page, not the stage crawling; the stall poll restarts its heartbeat at the same moment, precedent followed). The GOV TUNE histogram simply starts refilling.

**The never-fires invariant (ruling invariant 1), by arithmetic, pinned in the suite.** At 41 fps the raw delta is 1000/41 ≈ 24.39 ms — under the 50 ms clamp ceiling — so every frame books its full delta, the loop sum is identical to the wall sum, and the measured ratio is exactly 1. This holds anywhere at or above 20 fps, jitter included (any sub-clamp delta books whole). Matt's incident conditions (rAF 41 fps, GPU-bound) are therefore silent by construction; the ladder governs there untouched. The shed band is likewise untouched: an even 10 fps books 0.5 of wall; an even 5 fps books exactly the 0.25 threshold (the trip needs strictly below); ~4 fps books 0.2 and trips; the probe's 2.7 fps books ~0.135 and trips. Trip latency inside a fresh crawl ≈ the 4 s window fill — seconds, well inside a 60 s timeout (invariant 2).

**Untouched, per the ruling and the first build's contract:** the ladder and its gate (`watchdogMayTrip`), the fps-critical effect, the stall carve-out's criterion and bound, tier-1, the store contract (`tripWatchdog` / `setRunning`), `'accum-nan'` and `'render-error'`, the pill/readout. No spec file was modified; no assertion anywhere was deleted or weakened (the e2e failure is answered in the governor, exactly as the diagnosis prescribed — the specs' frozen contract now occurs again because the trip produces it).

## Suites run (each directly by file, after the last code change)

| Suite | Verdict |
|---|---|
| `src/hooks/governorCuts.selfcheck.mjs` | all sections pass, incl. new `[selfcheck] governorCuts (#1919 crawl carve-out, Option B): healthy + crawl + episode cases pinned` |
| `src/hooks/governorHostileScene.selfcheck.mjs` | `OK — 16 cuts, 86 passes in shed order, tier 0 intact` |
| `src/hooks/governorCreatureShed.selfcheck.mjs` | `ok (#1694 S2 — 7 checks)` |
| `src/gl/governorEventLog.selfcheck.mjs` | `OK — shed/restore with cause, ring bounded, export valid, X-ray matches registry` |
| `src/state/watchdog.selfcheck.mjs` | `OK (#107 §4 two-tier watchdog)` + `OK (#264 manual resume)` |
| `src/gl/accumGuard.selfcheck.mjs` | `OK — torture peak 1.7, 4 poison fields refused` (the accum-nan caller, untouched) |
| `src/gl/phase6.selfcheck.mjs` | pass (exit 0) |
| `src/gl/clock.inventory.selfcheck.mjs` | pass (exit 0) |
| `src/gl/costTiers.selfcheck.mjs` | pass (exit 0) |
| `src/gl/spectrumWarp.selfcheck.mjs` | pass (exit 0; its source pins on usePerformanceGovernor.js intact) |
| `src/gl/accumFeed.selfcheck.mjs` | pass (exit 0) |
| `src/engine/emberDrive.selfcheck.mjs` | pass (exit 0) |
| `src/engine/markWeather.selfcheck.mjs` | pass (exit 0) |
| `src/engine/travel.selfcheck.mjs` | pass (exit 0) |
| `src/hooks/fpsMath.selfcheck.mjs` | pass (exit 0) |

Lint/format: `npm run lint` — exit 0, 0 errors, 11 warnings, all pre-existing in unrelated files (the branch's recorded QA baseline; eslint on the four touched files is silent). `npm run format:check` — clean app-wide (one prettier reformat of the new selfcheck section was applied and the suite re-run green after it).

## e2e proof (production build `npm run build`, sandbox, the 9 previously-failing files)

Controlled A/B, identical rig, identical file set, `--workers=6`, back-to-back:

| Build | Result |
|---|---|
| Base 5bbe3742 (no crawl trip), in `kc-1920-review` | 30 passed / **12 failed** |
| This build (with crawl trip), in `kc-1919-build` | 34 passed / **8 failed** — a strict subset of the base failures |

Per file (6 workers): pattern-controls PASS both · slider-tones PASS both · patch-diag-interval base FAIL → **PASS** · voice-personas base FAIL → **PASS** · fx-editor-size FAIL both · fx-row-opens-editor FAIL both · room-codec FAIL both · routes-matrix FAIL both · topbar-expand FAIL both (6 tests on base, 4 on this build).

The 8 remaining failures are base-identical sandbox failures: this VM (SwiftShader, shared, 6 workers) starves timing-sensitive UI tests regardless of the governor — a sampled topbar error context shows no PERF PAUSED at failure at all, just a 4 s predicate timeout on a starved UI thread. Under gentler load the picture matches the coordinator's earlier observations: at `--workers=2` this build passes fx-editor-size and fx-row-opens-editor outright (topbar-expand remains sandbox-flaky at either worker count on both builds). **Stated plainly: the acceptance's local minimum (pattern-controls + fx-editor-size + topbar-expand green at 6 workers) is met for pattern-controls, and for fx-editor-size at 2 workers, but topbar-expand does not go green in this sandbox on ANY build — the local rig cannot adjudicate it.** The environment where the failure was diagnosed, and where this fix must prove out, is CI on the Mac runner; the push → CI → armed-auto-merge loop is the adjudicator. If CI's crawl proves milder than this sandbox's, the one-line sensitivity knob is `CRAWL_MAX_LOOP_RATIO` in governorCuts.js.

## Before / after, in plain terms

Before this change: on a machine too weak to run the scene, the instrument neither shed fast enough to recover nor paused — it crawled at a few frames a second, its musical clock running at a fraction of real time, until the shed ladder finished its minutes-long walk. After: the same crawl is recognised for what it is — frames completing but time barely advancing — and the instrument pauses itself within seconds, the same honest PERF PAUSED state as any other watchdog stop, leaving the ladder-first law exactly as ruled everywhere the machine is merely struggling (at a healthy 41 fps this trip is silent by arithmetic, not by tuning).

## Small print

- The crawl record's `fps.threshold` is 0, mirroring the stall record: the criterion is a loop-time ratio, not a rate; the measured ratio rides in `detail`, and `fps.at` carries the last measured effective rate for context.
- The predicate's window can exceed 4000 ms of wall on sparse streams (it walks until it also holds 8 frames) — "sustained" is satisfied a fortiori there, and the event detail reports the actual measured span.
- Files changed: `app/src/hooks/governorCuts.js`, `app/src/hooks/usePerformanceGovernor.js`, `app/src/hooks/useFpsMeter.js`, `app/src/hooks/governorCuts.selfcheck.mjs`, this report. The coordinator's diagnosis file was updated with a matching build section (it lives outside the repo, in the goal's hidden_files).
