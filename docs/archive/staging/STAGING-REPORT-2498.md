# STAGING REPORT — #2498 (A21): 30FPS toggle has no visible effect on the fps readout

**Branch:** feat/2498-a21 · **Base:** d605f92a (current main) · **Builder verdict: DEAD CONTROL — fix STOPPED, decision spec for Matt below (§4).**

## 1. Verdict shape

**(i) The toggle sets a store field that nothing reads — a dead control.** It is not
(ii): there is no cap anywhere for the readout to misreport. It is not (iii): no loop
is capped, so no environment artifact is needed to explain the observation — on any
machine, at any refresh rate, pressing 30FPS changes nothing but the button's own
label. The filed hypothesis ("may gate only the UI life tick") was true in 2025-era
history and is the ghost the button still carries: the life tick it gated was deleted
in spine C, and the gate was never re-pointed at the GL loop that replaced it.

Two independent stop conditions fire, so no production code is changed by this slice:

- The only place a real 30 fps cap can live is the frame loop's `tick()` in
  `app/src/gl/liveLoop.mjs` — a one-writer file, off limits to this builder
  (brief charge 4). §4 names the exact edit for a designated-writer slice.
- A 30 fps presentation cap is a performance-feel change by definition
  (brief charge 2, stop branch). Whether KC-1 should have a working 30FPS
  show mode at all — or lose the button — is Matt's call.

This slice ships the evidence, the invariant pin, and the decision spec. No behaviour
changes anywhere.

## 2. Mechanism, with measurements

**The write path (intact, measured).** MasterBar.jsx:255 — the 30FPS button calls
`state.setFrameLock(!frameLock)`; globalSlice.js:930 — `setFrameLock: (on) => set({ frameLock: !!on })`;
globalSlice.js:420 — `frameLock: false` (session-only, never serialized).
Store probe on this tree (headless import of the real store): initial
`frameLock = false, fps = 60`; after `setFrameLock(true)`, `frameLock = true, fps = 60`;
diffing the whole state surface across a toggle, the moved-keys set is exactly
`["frameLock"]`. The toggle's total causal reach is its own field.

**The missing reader (census, measured).** Every production file under `app/src`
mentioning `frameLock`: `state/slices/globalSlice.js` (field + setter),
`components/MasterBar.jsx` (the button + its label), `agentUi/uiRegistry.mjs`
(a declaration: control `transport.frame-lock`, channel `setFrameLock`, description
"Locks the frame rate to 30 fps."). Nothing in `gl/`, `engine/`, `hooks/`, or anywhere
else reads it. There is also no cap machinery under any other name: no
`1000 / 30` gate, no frame-interval throttle, no skip-frame path in the tree
(`FRAME_LOCK_MS` exists nowhere). The Governor sheds quality; it does not cap rate.

**The history (how it died).** f5d401c7 (#182, showrunner) introduced `frameLock`
WITH its consumer: `useCanvasLife`'s React life tick, gated as
`if (!frameLock || now - lastTick >= FRAME_LOCK_MS) setLifeT(...)` — halving React
render work in the SVG era ("a locked 30fps reads smoother than a fluctuating 40–60 —
the Resolume lesson"). 9e093c48 (spine C, #389) rewrote `useCanvasLife` when the GL
liveLoop took over the clock: the tick became a 160 ms meter interval and the
frameLock gate was deleted with it. Toggle, field, setter, button copy ("gate the UI
life tick to a locked 30fps"), and the registry's promise all survived the consumer.

**The readout (honest, and structurally toggle-blind).** `useFpsMeter` (mounted in
App.jsx:565) runs its OWN rAF loop, counts its own callbacks over ≥250 ms windows,
and publishes `fpsFromCount(frames, elapsed)` (fpsMath.mjs) to `store.fps` ~4×/s;
MasterBar displays `Number(fps).toFixed(1)`. Measured arithmetic:
`fpsFromCount(15, 250) = 60.0`, `(30, 1000) = 30.0`, `(8, 250) = 32.0`. It is a pure
function of a count and a window (arity 2 — no store input exists). Two consequences:

1. The readout never could show this toggle: it measures the page's rAF cadence,
   not a gated tick. Even in the #182 era, gating `setLifeT` would not have moved
   it — the filed "fps still 60.0" observation would have reproduced then too.
2. Wiring a cap into the loop ALONE would still not move it: the meter's rAF keeps
   firing at vsync while the loop skips presents. A complete fix is two-part
   (§4): the loop gate AND a readout that counts presented frames.

**The loop today.** liveLoop.mjs `tick()` (line 1806) is rAF-driven with no rate
gate: every callback runs the full frame; dt is the real delta clamped to [8, 50] ms
(lines 1826–1832). The stress session's numbers (nodes 222, tape 1%, fps 60.0 on a
60 Hz hosted build) are exactly what this code produces with the toggle on or off.

**What the sandbox can and cannot prove.** Frame rates are not measurable here
(headless fps ~3.7, watchdog tripped — known harness state). They are also not
needed: the defect is a missing wire, proven by census + store probe + history,
not a rate measurement. CI and Matt's machine remain the deciding environments
for any future cap's actual frame pacing.

## 3. Pin

`app/src/state/frameLock.selfcheck.mjs` (manifest-registered after
`sessionOnly.selfcheck.mjs`), 4 groups:

- **A (store):** `setFrameLock` flips exactly `frameLock` and moves no other key
  (whole-surface diff, measured values in messages).
- **B (census):** the production files mentioning `frameLock` are exactly the
  writer set {globalSlice, MasterBar, uiRegistry}; the three one-writer loop
  files are named as non-consumers. Textual on purpose — wiring the cap, removing
  the toggle, or any new mention fails here and forces this verdict to be
  revisited in the same change.
- **C (readout):** `fpsFromCount` measured values + arity 2; `useFpsMeter.js`
  source contains no `frameLock`.
- **D (write path):** button and registry still drive the same setter — the
  deadness is "no reader", never a broken button.

**Base behaviour:** the pin PASSES on pristine base d605f92a — expected and itself
evidence: it pins the tree's true state, not a fix. **Teeth, demonstrated in a
scratch worktree (removed after):** appending a fake consumer
(`store.frameLock` read in `hooks/fpsMath.mjs`) makes group B fail with the
measured census in the message (`hooks/fpsMath.mjs` appears in the actual set);
removing it restores PASS.

## 4. Decision spec for Matt (the stopped fix)

**Question:** should 30FPS become a real 30 fps show mode, or should the button go?

- **Option 1 — wire it (designated-writer slice; recommended if the show mode is
  still wanted).** The original rationale is a real performance practice: a locked
  30 reads smoother than a fluctuating 40–60, and it halves presented-frame cost
  on weak GPUs. Two edits:
  1. `app/src/gl/liveLoop.mjs` (one-writer — the reason this slice stopped):
     add `let lastLockPresentAt = 0;` beside `let prevTime = 0;` (line 387), and
     in `tick()`, immediately after line 1827 (`if (prevTime === 0) prevTime = now;`)
     and before the dt computation at line 1828, insert the gate:
     `if (!stillRun && getState().frameLock && lastLockPresentAt !== 0 && now - lastLockPresentAt < 1000 / 30) return; lastLockPresentAt = now;`
     Why this shape is safe: it sits with the loop's other early-return holds
     (context-down, still-exhausted), which already skip presentation without
     side effects; `prevTime` is NOT advanced on a skipped tick, so the next
     presented frame's dt is the true elapsed ~33.3 ms — inside the standing
     [8, 50] ms clamp, so simulation time stays honest and motion runs at full
     speed, presented at 30 Hz (no slow-motion). `stillRun` is exempt because
     test stills are frame-count-exact. The A8 seam work keys on presented
     frames; a skipped tick presents nothing, consistent with the context hold.
  2. The readout must count presented frames, or the filed complaint persists
     with a working cap: have the loop report each presented frame through the
     existing `reportStage` channel (liveLoop already imports it from
     useFpsMeter for `gpuFrame`) or an equivalent counter the meter reads, and
     derive `store.fps` from presented frames. This half is NOT in a one-writer
     file (useFpsMeter.js / fpsMath.mjs) but belongs in the same slice — shipping
     (1) without (2) re-files this exact issue.
     Also in that slice: MasterBar's title copy and the uiRegistry description
     become true as written ("Locks the frame rate to 30 fps.") — no copy change
     needed; pin group B's census gains `gl/liveLoop.mjs` and group C is reworked
     to the presented-frame derivation, in the same PR.
- **Option 2 — remove the toggle.** Delete the button (MasterBar), the field +
  setter (globalSlice), and the registry control. Zero feel change; the bar
  stops promising a lock that doesn't exist. Pin groups B/D are reworked to
  "no production file mentions frameLock" in the same PR.
- **Option 3 — honest relabel only (not recommended).** Retitle the button to
  admit inertness. Leaves a dead control on the bar; the A7 discipline names
  states honestly, but a control that does nothing has no honest name worth
  its slot.

**Recommendation:** Option 1 if Matt still wants the 30 fps show mode for
performance (it was a deliberate show-mode feature in #182, killed by a
refactor, not by a ruling); otherwise Option 2. Either way the choice is a
feel/scope call, so it waits for his word. #2536 (never-pause/restage) is
unaffected: the Governor's shedding and the restage ladder neither use nor
replace a presentation cap.

## 5. Verification

- Pin: PASS (4 groups) on this tree and on pristine base (scratch worktree,
  since removed); teeth demo per §3.
- Neighbours (suites naming the files in this story): fpsMath PASS ·
  showrunner PASS · sessionOnly PASS (4 checks) · uiRegistry PASS
  (333 controls, manifest correspondence pinned).
- format:check — clean (pin file prettier-formatted). lint — 0 errors
  (11 warnings pre-existing elsewhere; the new file is eslint-clean alone).
  build — ✓ 1046 modules, built in 5.60s.
- Full manifest sweep: 837 PASS / 3 FAIL over all 840 manifest commands. The
  3 failures are exactly the known sandbox-environmental set — swarmWasm
  (exit 1), rollSafety (exit 1), accum (abort) — A/B-proven identical on
  pristine main and untouched by this change; the new frameLock pin passed
  inside the sweep. (The sweep wrapper's process group was OOM-killed by
  the sandbox after the tally was written; the tally line is in the log.)
- No production file was modified; the only tree changes are the new pin,
  one manifest line, and this report.

## 6. Lane recommendation

**Auto lane (evidence + pin, zero behaviour change) for this slice** — it closes
the question the issue actually turns on (why nothing happens) with a pinned
verdict. The follow-up fix is **Matt's ruling first** (Option 1 vs 2 above);
Option 1 then goes to his review lane as a designated-writer slice (feel change),
Option 2 as an auto-lane removal once ruled.

## 7. Coordinator re-verification (2026-11-27, before the publish queue)

This slice was found already built (commit 20748c81, 2026-11-26) when the
A-line reached it; it was re-verified rather than rebuilt:

- **Premise re-checked against current main (cef57e92):** the production
  census is unchanged — `frameLock` is mentioned only by globalSlice.js
  (field + setter), MasterBar.jsx (button + label), uiRegistry.mjs
  (declaration), plus the showrunner selfcheck's fixture. No reader has
  appeared; the dead-control verdict stands on the current tree.
- **Pin re-run:** frameLock PASS (4 groups). Neighbours: fpsMath PASS ·
  showrunner PASS · sessionOnly PASS (4 checks) · uiRegistry PASS
  (333 controls). State-family manifest sweep: 82/82 PASS.
- **Lint/format:** eslint clean on the pin; prettier clean on the pin
  (the publish ritual's format:check runs in app/; this report was
  prettier-formatted to match its archive siblings).
- **Relocation:** the report moved from the repo root to
  docs/archive/staging/ per the archive convention that landed after
  this slice was built. The pin references the basename only, so no
  pin text changed.
- **Ruling on record:** Matt ruled Option 2 (remove the toggle) on the
  issue, 2026-11-26. The removal is staged as its own slice and, at its
  composition, retires this pin (superseded by
  frameLockRemoval.selfcheck.mjs). This evidence slice publishes first,
  in line order.
