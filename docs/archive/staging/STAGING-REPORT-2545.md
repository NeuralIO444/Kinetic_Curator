# STAGING REPORT — #2545: remove the dead 30FPS toggle (A21 follow-up, Matt ruled)

**Branch:** feat/2545-framelock-removal · **Base:** c18d1a2a (current main, stage KINETIC #2558) · **Verdict: REMOVED CLEAN — the toggle, its store field and setter, and its registry entry are out; nothing referenced them.**

## 1. The ruling

Matt ruled on the A21 issue (#2498, 2026-11-26): the 30FPS toggle is a dead
control — remove it clean, no replacement. The A21 evidence slice (PR #2552)
proved the toggle writes `frameLock`, a store field no production code has
read since its consumer (the `useCanvasLife` life-tick gate) was deleted in
spine C (#389). This slice executes the ruling.

## 2. Census, re-derived on current main (c18d1a2a)

The earlier staging composition (785c23f8) was prepared against an older
base; every number below was re-measured on this tree before any edit.

Production files naming `frameLock` / `setFrameLock` / `transport.frame-lock`
before the removal — exactly the A21 writer set, unchanged by the six merges
since:

- `app/src/state/slices/globalSlice.js` — the field (`frameLock: false`,
  line 420), its setter (`setFrameLock`, line 930), and one comment mention
  ("machine-specific, like frameLock", line 395).
- `app/src/components/MasterBar.jsx` — the toggle button (lines 253–260),
  the store subscription (`frameLock: s.frameLock`, `setFrameLock:
  s.setFrameLock`), and the destructure default.
- `app/src/agentUi/uiRegistry.mjs` — the registry entry
  `transport.frame-lock` (label "30FPS", channel `setFrameLock`, reads
  `frameLock`), lines 440–444.

Non-production mentions, each handled or consciously left:

- `app/src/state/frameLock.selfcheck.mjs` — the A21 evidence pin; retired
  by this slice (superseded by the removal pin, §4).
- `app/src/state/showrunner.selfcheck.mjs` — a serialization fixture listed
  `frameLock` among live-only keys that must never reach a project doc;
  the fixture stops enumerating the dead key.
- `app/e2e/agent-stress.baseline.json` — the committed baseline enumerated
  `"transport.frame-lock": "pass"`; the entry is removed (the runner fails
  a run when a baseline id is missing from the manifest, so a stale entry
  would read as a break forever).
- Docs (`docs/kinetics/clock.md`, `docs/SHOWRUNNER.md`,
  `docs/ORGANIC_MOTION.md`, the archived #2498 report) and one comment in
  `BudgetKnob.jsx` ("modeled on the 30FPS frame-lock") mention the toggle
  historically. Left as-is: they are history and design provenance, not
  surface, and the removal pin's census covers production source only.

Registry count, measured live on this tree before the edit:
`UI_CONTROLS.length === 333`.

## 3. What was removed

- `MasterBar.jsx`: the 30FPS button, its two subscription lines, its
  destructure default. The fps meter and the RUN/STOP button beside it are
  untouched (the performer's own pause is a different mechanism — the
  RUN_SET bus event — per the issue's scope item 4).
- `globalSlice.js`: the `frameLock` field with its doc comment, the
  `setFrameLock` setter, and the comment mention (now "like
  displayMaxFps", the surviving session-only field the sentence lists).
- `uiRegistry.mjs`: the `transport.frame-lock` control entry.
- `showrunner.selfcheck.mjs`: the fixture's `frameLock` key and its
  leak-check list entry.
- `agent-stress.baseline.json`: the `transport.frame-lock` line.
- `frameLock.selfcheck.mjs` deleted; its manifest line removed.

Nothing else. No replacement control, per the ruling.

## 4. The pin that holds it

New: `app/src/state/frameLockRemoval.selfcheck.mjs` (manifest line added
after showrunner's), 3,014 checks on this tree:

- the live store holds no `frameLock` key and no `setFrameLock` action;
- no production source under `src/` names the field, the setter, or the
  registry id (selfchecks excluded — naming the dead thing is their job),
  and neither MasterBar nor the registry carries the `30FPS` label;
- the registry resolves no `transport.frame-lock` control;
- the agent-stress baseline no longer enumerates the control;
- the surroundings stand: governor defaults (`governorShedFps` 28,
  `governorRecoverFps` 30, `displayMaxFps` null), the loop boots running,
  and MasterBar still renders the fps meter and drives RUN/STOP via
  RUN_SET.

Discrimination, measured: the same pin run against a pristine checkout of
base c18d1a2a exits 1 — `AssertionError: store must not hold a frameLock
field`. On the removal tree it passes in full.

Post-removal census, measured: zero production references to `frameLock`,
`setFrameLock`, or `transport.frame-lock` under `src/` or `e2e/`; the only
file naming them is the removal pin itself. Registry count re-measured
live after the edit: **332 controls** (333 − 1, as the issue predicted),
and `uiRegistry.selfcheck` passes at 332.

## 5. Verification

- `npm run lint`: 0 errors (11 warnings, all pre-existing in untouched
  files — the same family every A-series lane records on base).
- `npm run format:check`: clean.
- `npm run build`: green.
- Targeted suites on the removal tree: `frameLockRemoval` (3,014 checks),
  `showrunner` OK, `uiRegistry` OK at 332.
- Full manifest sweep (849 commands, continue-on-error, resumable across
  one sandbox reboot): **846 pass / 3 fail**, every failure classified from
  its own log, none an assertion against this diff —
  `kernel/bake/swarmWasm` (its log: "build-wasm: cargo not found on PATH";
  cargo is absent from the sandbox; CI's cargo-check is the authority),
  `fx/rollSafety` (300 s cap reached inside its GL section; standalone
  re-run: every logic group passes, then the sandbox Chromium target
  crashed in glDriver under memory pressure — the standing sandbox
  signature), `gl/accum` (V8 heap OOM after 69 green groups; standalone
  re-run with heap headroom on the quiet box passes in full, 87 cases).
- QA Review: CLEAN (independent reviewer, firsthand: scope exact at 9
  files, production census zero for all three identifiers, registry 332
  live, pin discrimination reproduced, showrunner green). One
  non-blocking nit — the BudgetKnob.jsx header comment still says
  "modeled on the 30FPS frame-lock" — already disclosed in §2 as
  consciously-left provenance.
- Source-shape sweep (per the standing rule): every selfcheck naming a
  touched file (`MasterBar.jsx`, `globalSlice.js`, `uiRegistry.mjs`) is in
  the manifest and covered by the full sweep.
