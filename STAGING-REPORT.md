# STAGING REPORT — #2482 (A4): GOV TUNE recover threshold stuck at 120

Branch `feat/2482-govtune-recover-clamp`, base origin/main c5ea53bf (includes the A3 watchdog resume law, PR #2513). Built to the rulings recorded on the issue (Matt, 2026-11-24): (1) clamp recover to what the screen can actually reach; (2) clamp visibly, with a note like "screen max 60"; plus the coordinator's logged assumption that recover sits above shed with a minimum gap, enforced by the same clamp; the typing failure is a plain bug to fix as part of this.

## 1. Premise verification (against this tree, before building)

**The trap is real — confirmed.** `governorRecoverFps` could be set to 120 (the setters in `globalSlice.js` capped at an absolute 120), and the governor's recovery test is `effFps >= recoverFps` where `effFps = min(rAF fps, GPU-implied fps)` (`usePerformanceGovernor.js`). The rAF rate is vsync-bound, so on a 60 Hz display effective fps can never reach 120: once any ladder cut fired, the restore table's `healthy` never turned true and cuts could never auto-clear for the rest of the session — while the panel's own footnote claimed the trap "can't be reintroduced from this panel."

**The typing failure is real — mechanism identified, and it is not a dead field.** `ThresholdRow` was a controlled input bound straight to the store value, writing **every keystroke** through the clamping setter. `setGovernorRecoverFps` floors at `shedFps + 1`; with shed at 20 (the stress session's value), typing "25" went: keystroke `2` → clamped to 21 and written back into the field; keystroke `5` appended to the rewritten field → "215" → capped to 120. Typing "60" walked the same path to 120. The field "stayed 120" because per-keystroke clamping destroys the first digit of any value below shed+1 and appends the rest to the clamp output. (Shed "20" took in the session because shed's own floor is 1 and its ceiling was recover−1 = 119 — no interference.)

**Writers — the setter is the single clamp point.** Only two callers reach the threshold setters: the GOV TUNE panel and the agent-UI bridge channels (`uiRegistry.mjs`, `dev.govtune-shed` / `dev.govtune-recover`). No presets, Look deals, or persona paths write the pair. Clamping inside the setters therefore covers every writer by construction.

**Correction to the brief's framing — there is no persisted trap.** The pair is session-only by design (#259): never serialized, no localStorage key, defaults 28/30 at every load (verified by grepping every reference to both keys across `app/src` and `app/e2e`). So no out-of-range value survives a reload. The load-shaped hole that *does* exist is in-session: a value written **before the fps meter's first refresh measurement lands** is bound only by the absolute 120 cap. The build closes that hole with a reconcile (§2) instead of a persistence migration, and this report records the correction rather than building the migration the brief imagined.

## 2. What was built

- **`app/src/hooks/fpsMath.mjs` — `estimateRefreshFps(deltas)`.** The measuring stick, in the meter's existing pure core ("the arithmetic is fpsMath's; the tick owns the rhythm"). rAF deltas are integer multiples of the refresh interval — load can only stretch them, never shrink them below it — so the cadence is the window's 10th-percentile delta, floored to whole fps (jitter can only understate). Returns null under 30 usable samples: no measurement, no invented number.
- **`useFpsMeter.js`** publishes the estimate at its existing ~4 Hz report tick. **`globalSlice.setDisplayMaxFps`** keeps the session's best (raise-only: a loaded window reads low because frames stretched, not because the screen slowed). New store field `displayMaxFps: null`, session-only, documented beside the pair.
- **`app/src/state/governorThresholds.mjs` — the pair's law, one pure module.** `clampShedFps` / `clampRecoverFps` / `reconcileThresholdPair` / `clampNoteFor`, with named constants (absolute domain 1–120, minimum gap 1 — the existing #259 gap, named, not re-tuned). Both slice setters are now thin shells over it, so the panel, the bridge, and the reconcile can never disagree. The garbage-input contract is preserved exactly (0 / '' / NaN keep the current value).
- **The screen ceiling binds last in `clampRecoverFps`**, so recover can never exceed the measured max even while the pair is degenerate; shed additionally respects the screen ceiling, keeping each setter independently lawful.
- **`usePerformanceGovernor.js` — the reconcile.** When a measurement lands or rises, the governor re-derives the stored pair under it (`reconcileGovernorThresholds` in the slice): a pre-measurement 120 is pulled to the measured max and shed is pulled under it. A no-op once the pair is lawful.
- **`GovernorTunePanel.jsx` — the field, fixed and honest.** `ThresholdRow` now edits a **local draft** and commits on blur/Enter (Escape reverts; a cleared field reverts rather than committing 0) — the codebase's own RangeRow click-to-type pattern. The commit runs the same law module the setter uses, so when a value is clamped the field lands on the clamped value with the note beside it in the panel's amber: `screen max 59`, `must stay above shed`, `must stay below recover`. The footnote under the rows now tells the whole true story, and the header says values commit on Enter/click-away.
- **Selfchecks.** New `app/src/state/governorThresholds.selfcheck.mjs` (registered in `app/selfcheck.manifest`) pins the law at three levels: the pure clamps + note strings, the **real slice setters** driven headlessly (pre-measurement 120 settable → measurement lands → reconcile corrects → 120 unrepresentable; the untypeable 25 now takes; raise-only measurement), and the panel's source contract (draft state, blur commit, note import, and the absence of the old write-through). `fpsMath.selfcheck.mjs` gains the estimator pins: clean 60/120/144 cadences, load-stretched windows still reading cadence, a saturated window honestly reading its presented rate, too-little-evidence reading null, and the floor's conservative side (a mathematically perfect 60.00 Hz reads 59 — an understated max stays reachable; an overstated one would reopen the trap).

One-writer files untouched: `liveLoop.mjs`, `liveResolve.mjs`, `particles.js` are not in the diff.

## 3. Design decisions

- **Measure, don't hard-code.** No platform API exposes the refresh rate to this app (the stage-display descriptors already record `refreshRateHz: null` honestly for Tauri), so the ceiling is measured from the running loop's own delta stream — the same stream the governor already trusts for its crawl measurement. On a 120 Hz screen the clamp is 120; the absolute cap only binds before the first measurement (~a second).
- **Session-best (raise-only) measurement.** A downward revision would let a heavy scene ratchet the performer's recover down mid-session; load cannot fake a *shorter* delta than the refresh interval, so the highest clean estimate is the truthful one. Documented limitation: dragging the window to a slower display mid-session keeps the faster ceiling until reload, when it re-measures.
- **The estimator floors.** "Screen max 59" on a 60 Hz panel (seen in the live probe below) is the floor working as designed: the clamped value must stay *reachable*, and 59 is; 61 might not be.
- **Gap stays 1.** The coordinator's assumption said "a minimum gap"; the #259 law's gap is exactly 1 (strictly apart), with SUSTAIN/COOLDOWN damping flap on top. Naming it (`GOVERNOR_MIN_GAP_FPS`) without re-tuning it keeps this slice inside the ruling.
- **Draft-commit changes how typing feels, deliberately.** Spinner steps and keystrokes now land on commit (Enter/blur) instead of per-keystroke — that write-through *was* the bug, and draft-commit is the house pattern (RangeRow). Committed values are still live on the governor's next tick, and the panel header now says so accurately.

## 4. Live probe (preview build, headless Chromium + swiftshader, route interception)

The panel was driven through the real DOM (DEV > GOV TUNE), values read back through the shipped `window.__KC_UI__` bridge:

- On load in the contended headless environment the meter's first estimate read ~20 (software rendering saturates the main thread), and the reconcile pulled the shipped 28/30 pair to 19/20 on its own; as lighter windows arrived the session-best estimate rose to 59 — the ratchet working as designed.
- **Recover ← 120:** typed text showed "120" during typing (the draft), committed to **59** with the row reading **"screen max 59"**; bridge state confirmed recover 59.
- **Shed ← 6** took exactly; **recover ← 10** took exactly (field and store) — typed values land, the stress session's core failure is gone.
- **Recover ← 5 with shed 6:** floored to **7** with the row reading **"must stay above shed"**.

## 5. Verification

- Targeted suites: `governorThresholds` (new), `fpsMath`, `watchdog`, `governorCuts` — green. Every suite that names a touched file (18 more, incl. `uiRegistry`, `labelCase`, `governorHostileScene`, `renderFault`, `tapeBudget`) — green. `determinism`, `liveResolve.determinism`, `phase6`, `governorEventLog` — green.
- Lint: 0 errors (11 warnings, the pre-existing baseline). Format:check: clean (prettier applied to the two files that needed it). Build: green.
- Full manifest sweep: **823 PASS + 3 FAIL = 826** — every manifest command holds exactly one runner verdict (sweep.log in the worktree root; 5 further "PASS:" lines in the log are suites' own output, identified and not counted). The 3 failures are exactly the known sandbox-environmental set, untouched by this diff: swarmWasm (exit 1), rollSafety (exit 1), accum (abort 134). The first sweep run was OOM-killed by the sandbox at 748 verdicts and resumed from the next un-verdicted command into the same log (marker lines present); the seam reconciles exactly (748 + 78 = 826, no duplicates, no gaps).

## 6. Before / after

| | Before | After |
|---|---|---|
| Type "25" into recover (shed 20) | Field rewrites mid-typing, lands on 120 | Draft shows "25", commits to 25 |
| Set recover to 120 on a 60 Hz screen | Stored; cuts can never auto-clear all session | Clamps to the measured max with a "screen max N" note |
| Recover written before the meter measures | Bound only by the 120 cap, traps the session | The measurement itself reconciles it down when it lands |
| Panel footnote's promise | Claimed the trap couldn't return; it could | True by construction, and says both laws |
