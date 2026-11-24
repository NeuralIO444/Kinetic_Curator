# Staging report — #2481 (A3, the watchdog)

**Issue:** "Stress 2026-11-24 A3: Watchdog PERF PAUSED is hard to resume and
re-trips at contradictory fps readings" (Matt's rulings of 2026-11-24 are in the
issue comments and are the spec implemented here).
**Branch:** `feat/2481-watchdog-resume-law`, built on origin/main `f260b748`.
**Status:** built and verified locally by the builder; not pushed, not merged.
The eventual PR is meant to close its issue (2481). This is the first item of
the debug/telemetry line Matt ordered worked full-auto on 2026-11-24; the
coordinator publishes.

One-writer files (`app/src/gl/liveLoop.mjs`, `liveResolve.mjs`, `particles.js`)
were not touched. No trip threshold was retuned.

---

## 1. Verification before building — mechanism findings

The repro was automation-observed on the hosted build. Against this tree, each
part of the issue's account was established from the code (and, for the Space
question, from a live headless probe of the pre-change build). The premise
reproduces, with one sub-account corrected (F4).

**Where the watchdog lives.** Store slice `app/src/state/slices/globalSlice.js`
(`tripWatchdog` sets `running=false` + `lastWatchdogReason`; `setRunning` is the
resume path). Governor hook `app/src/hooks/usePerformanceGovernor.js` (the trip
sites). Pill `app/src/components/TapeCounter.jsx` (state 2, PERF PAUSED). Event
log `app/src/gl/governorEventLog.mjs`, rendered by
`app/src/panels/GovernorXrayPanel.jsx` (EventRow).

**What it trips on.** Three perf paths, all in the governor hook:
fps-critical (effective fps = min(rAF fps, GPU-implied fps) < 10 sustained
800 ms, ladder-gated), fps-stalled (no completed frame for ≥ 2000 ms),
fps-crawl (loop time advancing < 25% of wall time across a 4 s window;
constants in `app/src/hooks/governorCuts.js`). Two correctness trips exist
outside the hook: `liveLoop` 'accum-nan' and ErrorBoundary 'render-error'.

**F1 — why resume re-tripped instantly (the "RUN click failed / re-paused
within seconds" mechanism).** The stall/crawl poll explicitly restarts its
measurements on resume (`stallWasStoppedRef`: "a stop restarts the frame-stall
clock … resume is never punished for the silence it chose"). The fps-critical
effect has no such protection: its sustain window (`criticalSinceRef`) is never
restarted on resume and can mature *during* the stop, so the first effect pass
after a manual resume re-trips immediately when the loop is still slow. The
crawl path likewise re-trips about one window (~4 s) after resume because the
loop is still slow — matching the session's "re-paused within seconds". There
is no separate RUN defect in the tree: the click resumed (the #264 path,
`applyAction` SET_RUNNING true), and the stop returned at once via this
mechanism. The stress session's own numbers support this reading: its headless
loop ran at eff 1.3–1.5 fps, far under the critical line, so any resume was
re-tripped by design-of-the-bug within a frame or a crawl window.

**F2 — why the log printed "2fps < 0" (the threshold that looked broken).**
The stall and crawl trip sites wrote event records carrying
`fps: { at: effectiveGovernorFps(...), threshold: 0 }` — a threshold of 0 by
construction, because neither carve-out compares fps at all (crawl compares a
loop-rate ratio; stall compares frame silence). EventRow renders every fps
record as `{at}fps < {threshold}`, producing "2fps < 0". The `at` value (≈2)
was the GPU-implied fps, **not** the measurement acted on — the actual reading
lived only in the event `detail` string, which the row never rendered.
**The trip comparisons themselves are not broken** — nothing ever compared
fps < 0. The defect is in the log record and its rendering, and in the pill,
which showed no measurement at all (and never showed `lastWatchdogReason`).

**F3 — the pill showed a display number, not the watchdog's reading.** The pill
face was a bare "PERF PAUSED"; its tooltip said "tripped (see GOVERNOR X-RAY)".
Nothing on the stopped surface said what the watchdog measured.

**F4 — Space with focus on a panel button: the issue's account is corrected.**
Pre-change probe (Playwright-core + bundled chromium, swiftshader, route
interception serving the built app on a fake host; a natural watchdog trip
occurred under load): Space pressed with focus on a real panel `BUTTON`
(TeaMatrix cell) **did** resume, and toggled both ways — the shared bubble-phase
handler in `App.jsx` (`useHotkeys`) reaches fine from a panel button, and the
button's native Space activation does not consume the keydown. So in the stress
session, Space's failure is explained by F1: the press resumed and the stop
returned within a frame — indistinguishable from "Space does nothing" at
automation sampling rates. One genuine gap did exist: the shared handler stands
down when focus is in an INPUT / SELECT / TEXTAREA / contentEditable (e.g. the
value-dock slider) — a broader exclusion than ruling 2's text-field exception —
and the resume guarantee depended on that shared toggle's focus rules rather
than on the stop itself. Ruling 2 is therefore implemented as a dedicated
capture-phase path (§2), not left to the shared handler.

---

## 2. What changed, per ruling

**New pure law module `app/src/state/watchdogLaw.mjs`** — the whole law in one
testable place:

- `WATCHDOG_RESUME_GRACE_MS = 5000` — **the grace constant: 5 s**, one named
  constant; every consumer imports it.
- `watchdogGraceDeadline(now)` / `inWatchdogGrace(until, now)` — grace
  arithmetic; a timestamp exactly at the deadline is already expired.
- `isTextEntryTarget(target)` — INPUT, TEXTAREA, SELECT, contentEditable
  (mirrors the exclusion set the shared hotkey handler already uses; buttons
  are deliberately NOT text entry — F4).
- `shouldSpaceResume({ key, repeat, modifiers…, running, watchdogReason,
  target })` — an unmodified, non-repeat Space press claims the resume only
  while a watchdog stop is actually up and focus is not in a text field.
- Reading builders `fpsWatchdogReading` / `crawlWatchdogReading` /
  `stalledWatchdogReading` / `faultWatchdogReading` — each carries the
  measurement the watchdog acted on plus short (pill) and long (tooltip/log)
  text. The crawl text names the loop-rate ratio and never claims an fps
  figure; the stall text names the silence bound.

**Ruling 1 — grace period.** `globalSlice.js`: new session-only state
`lastWatchdogReading` and `watchdogGraceUntil`. `tripWatchdog(reason, reading)`
stores the reading it acted on. `setRunning`'s resume branch — the one path
every manual resume takes (RUN pill, Space via `useHotkeys` or the new hook,
#264) — clears the reading and arms `watchdogGraceUntil = now + 5000` whenever
it clears a watchdog stop. Pause, plain resume, and the cut-6 resume arm no
grace (pinned in tests). Governor hook: while grace is live, the fps-critical
effect holds its sustain window at null (the earliest possible re-trip is grace
end + its own sustain window — the window cannot mature during grace), and the
stall/crawl poll treats grace like the stopped branch (at grace end it arms the
same restart the resume path uses, so the stall bound and crawl window start
fresh). **Grace gates only the three perf trip paths in the governor hook.**
The correctness trips (accum-nan, render-error) call `tripWatchdog` directly
and are not gated — a NaN loop should not wait out a grace window; they also do
not re-fire spuriously, which is the defect class F1 belongs to. The slice's
one `Date.now()` (arming the deadline) is recorded in
`app/eslint-rules/determinism-allowlist.mjs` with its reason: session-only
interaction timing, never serialized, stamped, or read by the sim;
`determinism.selfcheck` passes ("allowlist exact").

**Ruling 2 — Space is a global resume while PERF PAUSED.** New hook
`app/src/hooks/useWatchdogSpaceResume.js`, mounted in `App.jsx` next to
`usePerformanceGovernor()`. Capture-phase window keydown: when
`shouldSpaceResume` claims the press, it `preventDefault()`s +
`stopPropagation()`s (the shared toggle never sees the press — exactly one
resume, no double-toggle) and resumes through the exact #264 path
(`applyAction({ type: A.SET_RUNNING, payload: true })`), so the stop clears,
the restore is logged, and grace arms. When it does not claim the press (text
field focus, modified key, auto-repeat, no watchdog stop up), it does nothing
and the event flows on untouched — typing, button activation, and plain
pause/resume behavior are unchanged.

**Ruling 3 — pill and log show the watchdog's own measurement.**
`TapeCounter.jsx` pill state 2 subscribes `lastWatchdogReading`: the face reads
`PERF PAUSED · {short reading}` (e.g. "PERF PAUSED · frame stalled",
"PERF PAUSED · 3fps", "PERF PAUSED · loop crawling") and the tooltip leads with
the long reading ("Watchdog tripped: no completed frame for 2.0s — …").
Governor trip sites pass their readings into `tripWatchdog` and into the event
records.

**Broken-comparison repair (the "<0"), before/after.** This is the one
threshold-adjacent change, and it is in the record/rendering, not in any trip
comparison (per F2, no comparison was ever broken and no trip threshold
moved):

- *Before:* stall/crawl event records carried `fps: { at: <GPU-implied fps>,
  threshold: 0 }`; the X-RAY row rendered "2fps < 0" — an fps figure the
  watchdog never acted on, against a threshold that does not exist.
- *After:* stall/crawl records carry no `fps` field at all — the event
  `detail` IS the measurement ("no completed frame for 2000ms (frame stall)" /
  "loop time crawling — loop advanced 300ms in 4000ms wall"). EventRow renders
  the fps pair only when `threshold > 0`; otherwise the slot renders the detail
  (ellipsis + full text in the title attribute). Genuine fps-critical records
  keep the pair with their real threshold (10). Event key set unchanged
  (`governorEventLog.selfcheck` pins it exactly and passes).

**Tests.** New `app/src/state/watchdogLaw.selfcheck.mjs` (grace arithmetic
incl. the deadline boundary; the Space-routing matrix — button focus resumes,
text fields stand down, no stop / modified / repeat all stand down; formatter
honesty — crawl text never claims fps, stall text names its bound; source pins
that the hook, slice, governor, pill, and App wiring stay in place), registered
in `app/selfcheck.manifest` after the watchdog line. Extended
`app/src/state/watchdog.selfcheck.mjs`: a perf trip stores its reading verbatim
and a fault trip synthesizes its own; resume of a watchdog stop arms grace
within [before+5000, after+5000] and clears the reading; pause, plain resume,
and the cut-6 resume arm no grace.

**Surface/literal sweep:** the pill face gained a suffix — `app/e2e/` specs
match the pill by the substring `/PERF PAUSED/i`, which still matches; greps
over all selfchecks and `app/e2e/` for the pill text, the removed
`threshold: 0` record shape, and every touched file's source-shape pins were
run, and every suite so found was run green (list in §3).

Files changed (11): `app/src/state/watchdogLaw.mjs` (new),
`app/src/state/watchdogLaw.selfcheck.mjs` (new),
`app/src/hooks/useWatchdogSpaceResume.js` (new),
`app/src/state/slices/globalSlice.js`, `app/src/hooks/usePerformanceGovernor.js`,
`app/src/components/TapeCounter.jsx`, `app/src/panels/GovernorXrayPanel.jsx`,
`app/src/App.jsx`, `app/src/state/watchdog.selfcheck.mjs`,
`app/selfcheck.manifest`, `app/eslint-rules/determinism-allowlist.mjs`.

---

## 3. Verification

- **Targeted suites (all green):** watchdogLaw (new), watchdog, governorEventLog,
  governorCuts, governorHostileScene, accumGuard, phase6, renderFault, plus
  every suite grep-matching a touched file (selfcheckRunner, the manifest and
  determinism suites, tapeCounter consumers, and the rest of the grep set).
- **Lint:** `npm run lint` — 0 errors, 11 warnings (the pre-existing baseline).
- **Format:** `npm run format:check` clean (new files prettier-formatted;
  scratch probes deleted).
- **Build:** `npm run build` green.
- **Full manifest sweep** (continue-on-error over every line of
  `app/selfcheck.manifest`; log kept as `sweep.log` in the worktree root):
  **820 PASS + 3 FAIL = 823 commands, each with exactly one runner verdict.**
  The first run was cut at 429 verdicts by a sandbox runtime restart and
  resumed from the next manifest command into the same log (marker line in the
  log); the tally counts runner verdict lines only, matched against the
  manifest — a suite's own "PASS:" output lines are not counted. The 3 failures
  are exactly the known sandbox-environmental set, identical on the base:
  `swarmWasm` (exit 1), `rollSafety` (exit 1), `accum` (abort, exit 134).
  Nothing in this change touches their code paths.
- **Live browser probes** (Playwright-core + bundled chromium, swiftshader,
  route interception on a fake host, production build via vite preview):
  - *Pre-change:* natural watchdog trip under load; Space with focus on a panel
    BUTTON resumed (see F4 — the correction to the issue's sub-account).
  - *Post-change:* a natural fps-stalled trip at ~6.5 s; the pill face read
    "PERF PAUSED · frame stalled" and its tooltip "Watchdog tripped: no
    completed frame for 2.0s…"; Space with a `BUTTON.te-cell` focused cleared
    the stop by the first sample (0.19 s); **no re-trip occurred inside the
    5 s grace**; the stop lawfully returned at ~10.07 s (grace end + a fresh
    2 s stall bound under a genuinely stalled swiftshader loop) — the grace
    law working end-to-end, not a permanent suppression.
