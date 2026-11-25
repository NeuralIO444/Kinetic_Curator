# STAGING REPORT — #2483 (A5): Budget ceiling changed FULL to SHOW with no user click

Coordinator's staging record. The builder for this slice ended without a
handoff and without committing (the lost-commit pattern); the work was
found complete in this worktree's working tree, and the coordinator
verified, formatted, committed, and publishes it. Everything below was
measured by the coordinator against this tree, not taken from a handoff.

## The defect, as proven against the base tree (738e10b2)

One store field, `quality`, was doing two jobs: it was the performer's
ceiling (what the BudgetKnob displays as the pressed choice) AND the
governor's live tier (written by the governor's quality shed, #264).
Every shed therefore moved the displayed ceiling — FULL became SHOW with
no click — contradicting the knob's own tooltip, which promises the
ceiling is the performer's choice.

## The fix, as built

- `qualityCeiling` (new store field): performer-only by construction.
  Its only writers are the SET_QUALITY dispatch (the knob and the
  agent-UI bridge funnel through it) and a rig load (the performer's own
  saved document). The governor never writes it.
- The governor keeps shedding the live tier (`quality`) underneath the
  ceiling, unchanged.
- BudgetKnob: the pressed button reads `qualityCeiling`; while a shed
  claim is active the knob shows a small "shedding" tag instead of
  moving the button.
- Persistence: a document saved mid-shed serializes the ceiling, never
  the shed live tier (projectDocument / projectWatch / useProjectPayload
  / DataExportRow / sceneApply / applyAction carry the field through).
- New suite `app/src/state/budgetCeiling.selfcheck.mjs` pins the split:
  the ceiling's writer set, the knob's pressed-state source, and the
  saved-document round-trip. Registered in `selfcheck.manifest`.
- `uiRegistry.mjs`: the budget control's description updated to the
  split behaviour.

This matches Matt's ruling on the issue: the ceiling is performer-only,
the governor works underneath it, and the ceiling shows his choice plus
a "shedding" indicator while the governor is active.

## Verification (coordinator's own runs, this tree)

- `budgetCeiling.selfcheck` PASS; `sceneApply.selfcheck` OK (extended
  for the round-trip).
- `npm run lint`: 0 errors, 11 warnings (the standing baseline; none in
  touched files).
- `npm run format:check`: clean after the coordinator ran prettier on
  the two flagged files (the new selfcheck and sceneApply's).
- `npm run build`: green.
- Full manifest sweep (827 entries, log `sweep-2483.log` in the
  worktree root; *.log is gitignored in this repo): 821 pass, 6 fail — swarmWasm (exit 1), rollSafety (1),
  accum (134), vortex (1), livingMotion (1), phase6 (1). Every one of
  these was A/B-proven to fail identically on pristine origin/main in a
  fresh detached worktree (proven during the A12 #2490 build's sweep
  accounting, same sandbox, same day); livingMotion is the documented
  wall-clock flake. No failure touches this slice's files.
- One-writer files (liveLoop.mjs, liveResolve.mjs, particles.js)
  untouched.
