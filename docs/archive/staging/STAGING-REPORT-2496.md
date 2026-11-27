# STAGING REPORT — #2496 (A18): DEV UNITS MAKE is enabled in the hosted build but silently does nothing

Branch `feat/2496-a18`, base `d605f92a` (current main). Local commits only; no push, no PR.

**Publish record (added at publish-prep):** the fix was cherry-picked onto `cef57e92` as branch `feat/2496-units-make-publish` (single commit `f76f2878`, cherry-pick of `05b9fa9b`, zero conflicts); this report was relocated from the repo root to `docs/archive/staging/` per the archive convention. The body below is the original staging record from the build lane, unedited.

## Verdict shape: (e/b) — behaviour lawful by design, but silent and mislabelled

MAKE is not broken, and it is not native-only or dev-server-only. It never
had a server path to lose. The defect is the silence around a lawful
behaviour, plus two pieces of copy that describe the control wrongly —
the exact A7-class defect: an enabled control whose press answers with
nothing reads as a dead button.

## Mechanism evidence

- **What MAKE is.** `makeUnit({issue, name})` in `app/src/dev/unitMaker.mjs`
  is a pure function. It returns `{file, src}`: a suggested path
  (`src/<slug>.selfcheck.mjs`) and a failing-stub selfcheck template. It
  writes nothing, fetches nothing, and calls no native API — in any build.
  The module header states the design: "CI still runs the file you save."
  Saving the draft has always been the reader's move.
- **Git history confirms it was never otherwise.** Since the maker's
  introduction (af6304c6, 2026-10-02) it has been a local template
  generator; an early panel revision even carried a COPY button for the
  template (later dropped). No version ever POSTed or wrote a file.
- **Why the filed repro is silent.** `UnitsPanel` initialises its `made`
  state with `makeUnit({ issue: '722', name: 'behave ease' })` — the exact
  values in the filed repro, and the inputs' defaults. The template is
  therefore already on screen at mount. Pressing MAKE with untouched
  inputs recomputes a byte-identical template: no visible change, no
  confirmation, no error. Compounding it, the panel rendered only
  `made.src` — the draft's `file` (the one actionable output: the name to
  save it under) was computed and never shown anywhere.
- **The genuinely dev-server-only part is RUN, and it is absent hosted,
  not inert.** `/__kc/units` is served by `unitsDevPlugin`
  (`app/vite.units.mjs`, `apply: 'serve'`). In the hosted build the
  endpoint does not exist, and the panel gates its PR-list fetch on
  `import.meta.env.DEV`, so no RUN buttons render at all. That side
  already behaves lawfully.
- **The mislabelling.** The panel header said "This is the dev server
  only" — scoping the whole panel, MAKE included. The agent-UI registry
  entry `dev.units-run` said the control "makes a unit through the dev
  server." Both are untruthful for MAKE, which needs no server; a hosted
  user reasonably concludes the button is broken. (The registry's own
  note already recorded the session's A18 finding about the endpoint.)
- **Precedent for the fix's shape.** Neighbouring DEV panels render an
  outcome/state as one dim line (opacity 0.7–0.75 — BiologyPanel's
  `message`, CensusPanel's notes), and the A7 fix set the discipline: a
  pure helper returns the one honest line, the panel renders it dim, a
  selfcheck pins it. This fix follows that shape exactly. No neighbouring
  control disables itself in the hosted build, and disabling MAKE would
  be wrong anyway — it works there.

## Fix (silence only — what MAKE computes is unchanged)

1. `app/src/dev/unitMaker.mjs` — new pure helper `unitMadeLine(made)`:
   `drafted <file> — nothing was written; save the template under that
   name and CI runs the file you save`. Empty string for no draft.
2. `app/src/panels/UnitsPanel.jsx` —
   - MAKE now also raises a `pressed` flag; the made line renders only
     after a press, so even an unchanged template answers visibly.
   - `made.file` is rendered above the template: the draft's name is on
     screen at all times, not just after a press.
   - Header copy rescoped: "running them is dev server only. MAKE drafts
     a unit template in any build; you save the file yourself."
3. `app/src/agentUi/uiRegistry.mjs` — `dev.units-run` description
   corrected to "Runs the unit harness through the dev server, or drafts
   a unit template you save as a file." The entry's existing note (about
   the endpoint's absence in hosted builds) stays accurate and untouched.

One-writer files (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js`) are
not touched.

## Pin

`app/src/dev/unitMadeLine.selfcheck.mjs` (6 groups), registered in
`app/selfcheck.manifest` after `unitMaker.selfcheck.mjs`. It pins: the
helper exists and returns the exact honest line for the filed repro's
values; the line names each draft's own file; the line never claims a
write; the panel renders `made.file`, renders the line press-gated, and
drafts from the current inputs in the same handler; the header scopes
"dev server only" to running; the registry description stays truthful.
Assertion messages carry the measured values.

**Hosted condition:** the announcement path reads no environment flag —
MAKE is build-independent, so the same press handler produces the line
in dev, preview, hosted, and Tauri builds alike. The pin therefore pins
the hosted outcome by construction, not via a test-only flag the shipped
code doesn't read. The panel's only DEV-gated code (the PR-list fetch)
is untouched.

**Discrimination (demonstrated, scratch worktree removed after):** the
pin alone copied onto pristine base `d605f92a` fails **0/6** — every
group failing for its own filed reason (no `unitMadeLine` export, no
`{made.file}` render, the old whole-panel "dev server only" header, the
old registry text). On this branch it passes **6/6**.

## Verification

- Neighbours: `unitMaker.selfcheck` PASS · `uiRegistry.selfcheck` PASS
  (includes the manifest round-trip and per-control equality) ·
  `devPanel.selfcheck` PASS. Grep confirms no other suite reads the
  touched files' contents and no source-shape pin covers UnitsPanel.jsx.
- Bounded manifest sweep over the blast radius (every manifest suite
  under `src/dev`, `src/agentUi`, `src/composition`, `src/panels`,
  `qa/`): **57/57 PASS**.
- Full manifest sweep: attempted as a background run; the sandbox
  runtime restarted ~2 minutes in and the partial results (kept in /tmp)
  were lost. Not re-run in full — disclosed rather than claimed. The
  only shared-path change is one registry description string; its owning
  suite passes and a repo-wide grep shows no other consumer of the
  changed text.
- `npm run format:check`: the full run flagged only the new pin file;
  fixed with `prettier --write`; pin re-passed 6/6. Other touched files
  were already prettier-clean.
- `npm run lint`: 0 errors, 11 warnings — all pre-existing, none in the
  touched files (scoped eslint on the four touched files is clean).
- `npm run build`: green (only pre-existing INEFFECTIVE_DYNAMIC_IMPORT
  warnings). The worktree shipped without `node_modules`; `npm install`
  was run first per the brief, and the install's package-lock
  license-field noise was reverted — it is not part of this change.

## Lane recommendation

**Review lane.** The fix changes performer-visible panel behaviour and
copy (a line now answers MAKE; the header text changes; the draft's file
name appears). Nothing about what MAKE computes changes, but per the SOP
a visible-state change is Matt's to look at.

## Observation (not built — scope discipline)

The panel once had a COPY button for the template (present at
introduction, dropped in a later revision). Restoring it would pair
naturally with the new line, but it is a separate call, not part of the
filed defect, and was not built here.
