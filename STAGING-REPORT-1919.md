# STAGING REPORT — #1919: Governor vs watchdog race (ladder-first)

Branch: `fix/1919-governor-ladder-first` (worktree `~/workspace/kc-1919-build`, off origin/main e2295b82).
Local commit only — not pushed, no PR. Review lane: Matt merges.

## What changed, mapped to the ruling

**Clause 1 — while the ladder has eligible rungs, the fps-critical watchdog must not trip.**
- `app/src/hooks/governorCuts.js`: new pure gate `watchdogMayTrip(s, { effFps, shedFps })`. It consults the ladder's own eligibility oracle (`nextGovernorCut` on the caller's snapshot): a rung remaining inside the ladder's shed region → the watchdog waits; ladder exhausted → armed.
- `app/src/hooks/usePerformanceGovernor.js`: the ladder snapshot the ladder effect applies from is now built once (`ladderQuery`, memoized) and shared with the gate, so the gate and the ladder can never disagree about whether a rung remains. In the critical effect, when the gate says wait, `criticalSinceRef` is held at null and the effect returns — the 800 ms window therefore measures from exhaustion, per the ruling's "remains < 10 sustained for the existing 800 ms window" once exhausted. No separate grace timer exists anywhere; the ladder's own sustain (1600 ms) + cooldown (8000 ms) cadence governs how fast rungs land while the watchdog waits.
- One deliberate edge, inside the ruling's word "eligible": a GOV TUNE shed floor tuned *below* the current rate takes the ladder out of play at that rate (its effect will not fire there), so the gate releases even with rungs standing. Pinned in the selfcheck.

**Clause 2 — once exhausted + effFps < 10 sustained 800 ms, the trip is exactly as today.**
- The trip block itself (`tripWatchdog('fps-critical')`, event record, console line, latch/manual-resume) is byte-unchanged; only the gate was inserted ahead of its timer.

**Clause 3 — untouched callers and mechanisms.**
- `'accum-nan'` (liveLoop.mjs) and `'render-error'` (ErrorBoundary.jsx): not touched; their suites re-run green (accumGuard, watchdog store suite).
- Tier-1 (perfTier1) effect: untouched. Store contract (`tripWatchdog`, `setRunning`, the two-state write in globalSlice): untouched. Pill/readout rendering: untouched. Ladder order, thresholds, cooldown, restore table: untouched.

**Amendment — the frozen-frame carve-out (third hard trip, not ladder-gated).**
- Reason: the full ladder walk is ~16 cuts at the ladder's cadence (hostile-scene suite), so pure exhaustion can take minutes; a genuinely frozen frame is a hang, not a perf problem, and must not wait.
- `governorCuts.js`: `FRAME_STALL_MS = 2000` and the pure predicate `frameStalled(lastFrameAt, now)`. The bound is sized off the living floor: at 1 fps a frame lands every 1000 ms and the patrol syncs at ~4 Hz, so the widest observed gap in a living scene is ~1.3 s — 2000 ms clears it (a single long hitch or shader-compile pause never trips) while a true hang stops in about two seconds.
- `usePerformanceGovernor.js`: a heartbeat + poll inside the hook. The heartbeat keys on frame *completion* as the code already tracks it: the live loop times every completed frame into the patrol (`reportStage 'gpuFrame'`), and the meter's drain reads 0 for a window with no sample — so a store sync with `gpuFrame > 0` is a completed-frame heartbeat, recorded in `lastFrameAtRef`. A 250 ms timer poll (timers, not rAF — it stays awake when the frame stream is not) reads fresh store state and trips `tripWatchdog('fps-stalled')` with its own event-log record when the heartbeat is silent past the bound.
- Guards, all following house precedent: GL context not `'ok'` → hold (#263: no frame *can* complete during a rebake); performer-paused / cut-6-frozen / already stopped → the stage is not supposed to complete frames, and the bound restarts from resume so a resume always gets a full bound; never-yet-drawn (no heartbeat observed) → disarmed (that is the rate path's problem, not a hang).
- **Judgment call to flag:** hidden-tab time never counts toward the bound (a `visibilitychange` return refreshes the heartbeat baseline, and a poll that wakes while hidden refreshes it too). A backgrounded tab completes no frames by platform design — the same reasoning as the #263 context-restore hold — so its silence is the browser parking the page, not a hang. One-line reversible if Matt disagrees.
- A throttled-but-alive scene (frames completing at 1–9 fps) keeps its heartbeat fresh and never trips the carve-out: ladder territory, as ruled.

**Boot-path verification (explicit, as the issue requires).**
- Traced and pinned in the selfcheck: the store's fresh state (quality `'balanced'`, renderScale 1, nothing shed, `slowRender` false — globalSlice defaults) always holds rungs in every sensor combination (GPU-bound or not, FXAA on or off), because the quality rung and, behind it, asset-thinning and the cut-6 freeze are standing on any fresh ladder — so the gate holds from the first frame and a starved first 800 ms cannot trip. The carve-out is separately disarmed until the first frame completes. No separate grace mechanism was needed or added. (The four boot combinations plus a lowest-tier variant are assertions in `governorCuts.selfcheck`, #1919 gate section.)

## Before / after, in plain terms

Before: if the frame rate fell off a cliff, the instrument paused itself after less than a second — before the governor had shed a single thing — and stayed paused until you pressed RUN, even after the rate recovered. After: the same cliff now makes the instrument shed first — pixels, weather, creatures, quality, and so on, one step at a time at its usual pace — and it only pauses when there is nothing left to shed and the rate is still on the floor. One exception, added by the amendment: if the picture truly freezes (no new frame at all for two seconds), it stops right away, because a frozen frame is a hang, not a slowdown. Error stops (poisoned trails, render errors) still stop instantly, exactly as before.

## Suites run (each directly by file, after the last code change)

| Suite | Verdict |
|---|---|
| `src/hooks/governorCuts.selfcheck.mjs` | all sections pass, incl. new `[selfcheck] governorCuts (#1919 ladder-first gate): walk + boot + tuned-floor cases passed` and `[selfcheck] governorCuts (#1919 frozen-frame carve-out): both directions pinned` |
| `src/hooks/governorCreatureShed.selfcheck.mjs` | `ok (#1694 S2 — 7 checks)` |
| `src/hooks/governorHostileScene.selfcheck.mjs` | `OK — 16 cuts, 86 passes in shed order, tier 0 intact` |
| `src/gl/governorEventLog.selfcheck.mjs` | `OK — shed/restore with cause, ring bounded, export valid, X-ray matches registry` |
| `src/state/watchdog.selfcheck.mjs` | `OK (#264 manual resume)` |
| `src/gl/phase6.selfcheck.mjs` | `OK — governor retuned, SVG retired, #103 cliffs re-tested` |
| `src/gl/clock.inventory.selfcheck.mjs` | pass (node:test, no failures) |
| `src/gl/spectrumWarp.selfcheck.mjs` | `ok — 90 checks` (its source pins on usePerformanceGovernor.js intact) |
| `src/gl/costTiers.selfcheck.mjs` | `OK — declarations valid, coverage complete, bands hold` |
| `src/gl/accumGuard.selfcheck.mjs` | `OK — torture peak 1.7, 4 poison fields refused` (the accum-nan caller) |
| `src/gl/accumFeed.selfcheck.mjs` | `OK (15 cases)` (~71 s in this sandbox) |
| `src/engine/emberDrive.selfcheck.mjs` | pass (node:test, no failures) |
| `src/engine/markWeather.selfcheck.mjs` | `ok — 46 checks passed (#1627 S1)` |
| `src/engine/travel.selfcheck.mjs` | pass (exit 0) |

Lint/format: `npx eslint` on all touched files — 0 errors, 0 warnings (the initial exhaustive-deps warning on the shared snapshot was resolved structurally with `useMemo`). `npm run format:check` — clean. `npm ci` was run in the worktree for the pinned toolchain. No dev-server boot was run; the change is effect-timing inside one hook plus a pure module, and CI owns the browser suites.

## Re-pins (no assertion weakened or deleted)

1. `governorCuts.selfcheck.mjs` — new #1919 sections *replace* the pre-#1919 contract stated in governorCuts.js's docstring ("the watchdog is a separate, faster mechanism"); the sections say so in their header comment, with the cause: Matt ruling 2026-11-01, #1919 ladder-first, plus the carve-out amendment.
2. `src/gl/phase6.selfcheck.mjs` — assertion message re-pinned, same assertion: `'exhausted ladder returns null (watchdog is separate)'` → `'…(only then is the watchdog armed — #1919 ladder-first, Matt ruling 2026-11-01; was: "watchdog is separate")'`.
3. `src/hooks/governorHostileScene.selfcheck.mjs` — header comment gloss updated the same way (`hold; the watchdog is separate` → `hold — only then is the watchdog armed: #1919 ladder-first`). The pinned 16-cut sequence itself is unchanged and still passes.
4. `governorCuts.js` docstrings that stated the old race (`nextGovernorCut` return note, ladder-exhausted tail comment, cut-7 header line, and the hook's header) now state the ladder-first law; no code semantics in the module changed apart from the two added pure exports.

## Small print

- The shared snapshot reads `layoutParams?.count` where the ladder effect previously read `layoutParams.count` inline; identical in every reachable state (the effect's own dependency list already dereferences `layoutParams.count`), and it removes a would-be crash in an unreachable one.
- The stall poll's event record carries `fps.threshold: 0` — the stall criterion is silence, not a rate; the `fps.at` field carries the last measured effective rate for context.
- Files changed: `app/src/hooks/usePerformanceGovernor.js`, `app/src/hooks/governorCuts.js`, `app/src/hooks/governorCuts.selfcheck.mjs`, `app/src/hooks/governorHostileScene.selfcheck.mjs` (comment), `app/src/gl/phase6.selfcheck.mjs` (assertion message), this report.
