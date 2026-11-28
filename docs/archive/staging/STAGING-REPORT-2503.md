# STAGING REPORT — #2503: controls that arm instead of apply, and state changes with no visible feedback

**Branch:** feat/2503-arm-apply-feedback · **Base:** e2087a80 (current main, UX #2501) · **Verdict: BUILT — every filed item now answers on the surface; feedback visibility only, no behavior change underneath.**

Issue #2503 (verbatim title: "Stress UX: controls that arm instead of apply, and state changes with no visible feedback") bundles five findings from Ember's 2026-11-24 live stress session (B5, B6, B16, B24, B25). It has no comments; the body is the whole spec. No earlier PR references the issue. Built under Matt's full-auto grant as extended to the UX eight (2026-11-28: "Merge it — UX eight goes full-auto too").

This report was written by the completion lane: the build lane's two commits were on the branch but unpublished (no PR, no report) when that lane ended. Everything below was re-verified firsthand on this tree by the completion lane, including a fresh QA review (§4).

## 1. What was built, per finding

- **B5 (mode/motion chips arm a roll scope silently) — fixed.** `ModeStrip.jsx`: while any arm stands, the strip renders a plain-text readout beside the detent — `next roll: <mode> + <motion>` — naming the pending scope from the same store state the detent reads. It stands exactly while the arm stands. The arm semantics themselves are untouched: the chips still arm, the roll still applies.
- **B6 (palette strip: four chips, no scroll affordance, keys 1–4 silently remap) — fixed.** `PaletteStrip.jsx` + `paletteChipWindow.mjs`: the strip gains ‹ › browse keys that step a window over the full palette set (`clampChipWindowStart`, clamped to the same legal range as the #952 follow window), a position readout (`1–4 of 37`) whose title states that keys 1–4 pick from the visible four, and — while browsing sits off the active chip — the readout names the palette that is up (`· up: <name>`), so the strip never disagrees with the roll about what is on stage. The follow window wins the moment the active palette changes (see §4 for the return-visit case). Keys 1–4 still pick the visible four — that is the standing #357 law; what changed is that the remapping is no longer silent.
- **B16 (pressed state invisible to the accessibility tree) — fixed.** `StageBlock.jsx`: `aria-pressed` on the stage-mode buttons (PREVIEW/FULLSCREEN/SYPHON), the mapping buttons, and the test-pattern / blackout / syphon toggles. `BudgetKnob.jsx`: `aria-pressed` on the budget ceiling buttons (FULL/SHOW/LEAN seat).
- **B24 (STIMULI spectrum marks give no visible feedback) — fixed.** `SpectrumMarks.jsx`: the standing mapping's hint (`MAP_HINT[map]`) renders as visible text under the buttons and updates with the pick, so a mark change has feedback even while the amounts sit at 0 and nothing moves on the meter or the stage.
- **B25 (gating reasons live only in tooltips) — fixed.** The reason now renders as visible panel text at every seat: `RangeRow.jsx` (row, stack, and bare layouts — rendered as a sibling of the row, never inside it, so the disabled row's dimming cannot dim the reason), `ModeRow.jsx` (both the block and shelf seats), `ValueButton.jsx` (after the lock pip, on its own full-width line), and the STIMULI `ResponsePicker` in `ReactivityControls.jsx` ("Waiting for audio — <reason>", outside its dimmed box). Tooltips keep the full composed text; nothing was removed from them.

## 2. The pin

`app/src/components/feedbackVisibility.selfcheck.mjs` — 11 groups, registered in `app/selfcheck.manifest`. It pins, per finding: the arm readout's presence and text shape, the browse clamp's range law, the nav buttons and position readout, the `aria-pressed` seats, the spectrum hint render, and the visible-reason renders at every B25 seat including the filed gating groups (WEATHER/RIFT/DIVERGENCE) still passing their reasons in.

Discrimination, demonstrated by the QA review on a detached base worktree at e2087a80: with only the pin copied in it fails at import (`clampChipWindowStart` does not exist on base); with the pure helper also supplied it fails on the first filed-reason assertion (B5: "the readout element stands on the strip"). The pin fails on the pre-change tree for the filed reasons, not merely for a missing file.

## 3. What did not change

No files under `state/`, `engine/`, `composition/`, `hooks/`, or `gl/`. No store fields, no event flows (PaletteStrip's emits are byte-identical), no roll logic. The only new state is PaletteStrip's local browse window. This is a feedback-visibility slice, as filed.

## 4. QA

Two rounds. The build lane's QA round is commit 55682d42 (readout names the up-palette while browsing sits off it; ValueButton reason after the lock pip; response picker and bare RangeRow speak their reasons) — its changes are in the tree and verified, but no verdict from that round survives, so the completion lane ran a fresh QA review over the full branch diff against the issue and `docs/AGENT_SOP.md`: **CLEAN, no blocking findings.** Scope discipline, claim-vs-tree honesty (every commit-message claim verified in code), pin discrimination (§2), and the regression surface (43 naming suites run, all pass; e2e selectors checked against the DOM changes) all passed.

Two non-blocking NITs from that review:

1. **Stale browse revival** — the browse window was keyed to the palette it was stepped on, so if the roll left a palette and later returned to it (A→B→A), the old browse window revived instead of the follow window. **Fixed by the completion lane:** PaletteStrip now drops the stepped window outright when the active palette changes (render-phase adjustment on `palette.id`), so a returned-to palette re-follows. The `up:` readout already prevented any silent disagreement; this makes the follow law hold on return visits too. Pin and adjacent suites re-run green after the fix; eslint and prettier clean on the file.
2. **Transient package-lock sighting** — a `package-lock.json` hunk appeared in one QA snapshot and in the completion lane's own `npm install`; reverted both times. `git status` re-confirmed at commit time: only the intended files are staged.

One stale count, disclosed: commit 31c896c4's message says the pin has 10 groups; the QA round grew it to 11. The tree is the truth (§2).

## 5. Verification (completion lane, this tree)

- `npm run lint` — 0 errors (11 pre-existing warnings, none in touched files).
- `npm run format:check` — all files pass.
- Full manifest sweep — all 852 entries covered: 848 pass outright or on solo re-run; the four failures are each proven sandbox-environmental from their own logs, none touches this diff:
  - `swarmWasm` — `build-wasm: cargo not found on PATH`; the sandbox has no Rust toolchain (all three crate manifests match). CI has the toolchain.
  - `accum` — V8 heap OOM at the sandbox's default limit ("Ineffective mark-compacts near heap limit", exit 134); solo re-run with `--max-old-space-size=4096` passes in full (87 cases OK).
  - `rollSafety` — the headless Chromium page crashes at the first GL render candidate (`page.evaluate: Target crashed`, glDriver), with the sandbox OOM-killing a process in the group; **base-identical**: pristine e2087a80 in a detached worktree fails at the same site with the same signature. This diff touches no GL or roll code; CI is authoritative for the suite.
  - `debug` — recorded both FAIL and PASS: the build lane's sweep and the completion lane's resumed sweep ran concurrently for a stretch (duplicate records for ~80 entries; the completion lane's instance was killed once spotted). Solo re-run settles it: PASS (115 cases OK).
- e2e was not run in the sandbox; the exposed specs (`palette-controls-fit`, `topbar-expand`) were selector-checked by QA, and CI's e2e-smoke is the deciding check for them.
