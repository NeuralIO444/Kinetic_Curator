# STAGING REPORT — A11: MEGAMIND telemetry narration discarded (#2489)

Branch: `feat/2489-megamind-telemetry-fallback` · Base: `738e10b2` (origin/main, incl. A3/A4)
Status: built, verified locally, NOT pushed — coordinator publishes in line order.
(This file replaces the A4 slice's report, which the squash merge carried onto main.)

## The discard mechanism, as proven against this tree

The path: MegaMindPanel "narrate telemetry" → `createSurfacesDriver.narrateTelemetry()`
(megamindSurfacesLive.js) → `ask('devpanel.narration', buildNarrationRequest('telemetry', facts),
validate)` → `askSurfaceText` (Ollama, json mode) → `parseSurfaceReply` → `validateNarration`
(megamindSurfaces.mjs). Two failed validations and `ask` threw; the panel showed only the red
"discarded / unavailable" line and `telemetryLine` stayed empty.

Three findings, in order of weight:

1. **Telemetry was judged against numbers it never saw (proven, deterministic).**
   `narrateTelemetry` built the prompt from `telemetryFacts()` and then validated with a validator
   closure that called `telemetryFacts()` AGAIN — a second snapshot, taken after the model reply
   returned. The tally is fed by live bus traffic (`mind:decision` / `mind:reply`), so on a live
   instrument the numbers move while the model thinks (in the stress session the operator had just
   run pacing + crown asks through the same session). A reply quoting exactly the numbers in its
   prompt could fail grounding against the fresher snapshot — and the re-ask reuses the SAME
   prompt while validation re-reads the tally again, so the failure repeats: "failed twice" with a
   compliant model. Proven with a scripted probe (fake Ollama quoting the shown mean latency
   verbatim; one in-flight reply moving the mean): discarded twice pre-fix, stands on attempt 1
   post-fix. Census never had this defect (it captures its facts once); crown and pacing have no
   grounding check at all — which is why the crown draft worked through the same connection.
   The checker's substring matching usually masks this; it bites when the quoted number's digits
   do not appear inside any fresher fact value.

2. **The grounding demand is the strictest in the register, and stays.** Narration must quote a
   fact value verbatim (or a 0..1 share as a whole percent). A paraphrase, a derived number
   (a percent of counts), or the latency rendered as "0.54 s" all fail. That is the standing law
   ("grounding is mechanical, not a vibe") and this build does not loosen it — the fallback is
   the answer to a discard, not a weaker gate.

3. **A discard destroyed the evidence.** The old `ask` threw both replies away unrecorded — no
   log, no view field — so after the stress session nobody could say whether the model failed
   shape or grounding. That diagnostic gap is what the ruling's event-log half closes.

## What changed (to Matt's 2026-11-24 ruling)

- **Root cause:** `narrateTelemetry` now captures ONE facts snapshot and is shown and judged
  against it, via a shared `narrate()` helper (census already snapshotted once; it now uses the
  same helper).
- **Fallback narration:** new pure `buildFallbackNarration(facts)` in megamindSurfaces.mjs —
  deterministically composes a line from the very facts the model was shown ("Machine-written
  from the live counters (the model's narration was discarded): persona decisions 33 ·
  answered by the linked model 22 · …"). Every number is a fact verbatim, so it cannot be
  ungrounded; the machine-written label is in the line's own text, so any surface rendering it
  carries the label. The driver sets `telemetryLine`/`censusLine` to it (with a
  `…MachineWritten` view flag) instead of leaving the panel silent. A model that is DOWN is not
  a discard: that error still surfaces honestly, no fallback, nothing logged.
- **Discard log:** new pure module `megamindDiscardLog.mjs` (the governorEventLog idiom —
  bounded in-memory ring, 32 entries, replies bounded to 500 chars, session-only, never
  serialized). `ask()` gained an `onDiscard` hook and marks its double-discard error
  (`err.discarded`); the narration path records each discarded reply with its surface
  (`narration.telemetry` / `narration.census`), the check it failed, and the facts it was judged
  against. To name the failed check, `validateNarration` now sits on a staged internal check
  (`checkNarration`) and a new export `narrationDiscardReason(raw, facts)` reports
  `{ stage: 'shape' | 'grounding', detail }` — same accept/reject set as before.
  Ordering in the log is a module-local sequence number, not a clock read (the determinism lint
  law bars `Date.now` in a pure module; a caller may pass `at` and it is kept as given).
- **Panel:** MegaMindPanel renders the discard log's last 4 entries under the surfaces section
  ("replies the checker threw out, kept for diagnosis; they are never shown as narration").
  The discarded text reaches only this log — never the narration line (pinned by test).

## Scope flag (coordinator/QA call)

The ruling names **telemetry** narration. Census narration shares the same consumer
(`devpanel.narration`), validator, prompt builder, and panel fate, so the fallback + log were
wired for it through the same helper rather than leaving the identical silent-panel defect live
on the adjacent button. It is a small, separable hunk (the `narrate('census', …)` call) if QA
wants it cut.

## Overlap flag (parallel A5, #2483)

None found. This change touches megamindSurfaces.mjs, megamindSurfacesLive.js,
megamindDiscardLog.mjs (new), MegaMindPanel.jsx, one manifest line, and one new selfcheck —
no governor/budget-ceiling files, and none of the one-writer files (liveLoop.mjs,
liveResolve.mjs, particles.js are untouched).

## Verification

- New suite `src/curator/megamindSurfaces.selfcheck.mjs` (added to app/selfcheck.manifest):
  8 checks — fallback composition (label, grounding, no invented numbers), staged discard
  reasons agreeing with the validator, log ring bounds, and live-driver tests with fixture
  fetches: ungrounded×2 → labeled fallback stands + both replies logged + discarded text absent
  from the narration; shape×2 → fallback + log names shape; the snapshot-law scenario (the
  pre-fix probe) → the model's own line stands; model down → honest error, no fallback, nothing
  logged; census fallback under its own surface name.
- Neighbouring suites re-run green: megamindVoice (17), megamindRecap (12), mind (16),
  panelGraph, devPanel, callsignSweep (20), directorRoom (7), megamindVision (16),
  megamindEmbed (184/184), megamindLink (21).
- `npm run lint`: 0 errors (11 warnings, the pre-existing baseline). One lint error found and
  fixed during the build: the determinism rule barred `Date.now` in the new log module —
  resolved by sequence-number ordering (see above), no allowlist change.
- `npm run format:check`: clean (prettier applied to the three files that needed it; the
  surfaces and voice suites were re-run green after formatting).
- `npm run build`: green.
- Full manifest sweep: **827 verdicts — 818 first-run PASS + 9 FAIL, every failure A/B-settled
  as environmental** (log: sweep.log in this worktree's root). The run was cut twice by the
  sandbox (a runtime restart at 331 verdicts, an OOM kill at 480) and resumed into the same log;
  the seams reconcile exactly by manifest position (331 + 149 + 347 = 827, no duplicates, no
  gaps). The 9 first-run failures: swarmWasm (exit 1), rollSafety (exit 1), accum (abort, −6) —
  the known sandbox set; composite and vortex, which PASS at full count on individual re-run
  (contention artifacts of the OOM-pressure window, settled PASS); and four wall-clock budget
  suites — retroCapture, wetWarmup, livingMotion, resolverProbe — each failing identically on
  pristine origin/main under this sandbox's shared-CPU load (e.g. resolverProbe: resolver mean
  6.341 ms vs budget 5 on main, 7.646 ms here; wetWarmup flips both ways, passing once on main
  and failing there at 2105.6 ms vs its 2000 ms ceiling). No failure touches this diff; the
  A/B detail is appended to sweep.log.

## Fix round 2 (coordinator, 2026-11-25, post-publish): pause entry adopts the scene

PR #2534's CI selfcheck-browser run failed the pin's "an unchanged scene presents
nothing while held" group ("the held frame is still scene B", grid distance >= 5);
locally the same group intermittently failed as "presented count moved while
settling" (exactly one late present). Diagnosis, each step measured:

- The base probe (the pin's browser section run against pristine main 17a5014f,
  source pins disabled in the probe copy only) PASSED the held group 3/3 in runs
  that reached it, then failed at the recall step exactly as designed — so the
  extra present is seam-caused, not a pre-existing trip artifact.
- Mechanism: the watchdog trip's own tier shed flips `perfTier1`, a field inside
  sceneSignature. The last running present recorded the pre-shed signature, so
  the seam's first paused tick saw a "change" and presented one still of the
  shed scene — on a real GPU that frame reads >= 5 grid units from the pre-shed
  sample (CI), and under sandbox load the delayed still landed after the pin's
  settle window (count +1).
- Fix (liveLoop.mjs only): pause entry ADOPTS the scene — a `prevTickPaused`
  edge detector re-baselines `lastPresentedSig` on the first paused tick
  without presenting. Writes at or before the stop belong to the running loop's
  last frame; only writes DURING the hold present a still. The signature's
  field set is unchanged (QA's enumeration intact); all source pins hold
  verbatim.
- Verification at the fix: format clean, lint 0 errors, pin 2/3 full passes in
  the loaded sandbox with the third failing at the same count assertion (a
  mid-flight running frame landing after the trip is indistinguishable from a
  seam still in that sample; base shows the same sample noise class — one of
  four base runs died at boot sampling). CI re-run is the deciding vote.
