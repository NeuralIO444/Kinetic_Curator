# STAGING REPORT — #1606 Strata Q Phase 0 (paper)

**Issue (verbatim):** "Strata Q Phase 0 — rulings on paper: DS amendment,
editor patterns, stop-table law (DEFERRED)"
**Branch:** `feat/1606-strata-phase0-paper` on origin/main `9bd87c4c`.
Docs only — no app code, no package.json, no prettier run on docs.
Local only — no push, no PR (coordinator publishes). This file replaces
the report that was at the worktree root (#1841's); that report remains
in git history. The "(DEFERRED)" in the issue title is stale — the lane
was un-deferred 2026-10-30; this phase ran on that word.

## What landed where

| Issue item | File | Where |
|---|---|---|
| 1. DS amendment (BUILD detent law, D1/D2) | `docs/DESIGN_SYSTEM.md` | New "BUILD detent amendment" block in §2 (after the one-of-each rule) + one amendment bullet at the end of §2.1. Existing doctrine untouched elsewhere; the off-detent mark is named in §2.1 (lit mode wears a dot). |
| 2a. Editor-pattern reconciliation | `docs/research/strata-quantized/plan.md` | New "Phase 0 paper" section → "Editor patterns — one vocabulary": **section editor** (CHIAROSCURO, over-canvas) vs **value editor** (one param; inline click-to-type seat + #1202 docked seat). The amendment's third popover shape is retired on paper. |
| 2b. Stop-table law | `plan.md` | Same section → "Stop-table law", 7 numbered rules: authored never derived · default is always a stop (M4 2.5 / 1.05 / 0.78 cited) · taper-space authoring · labels name effect strength · OFF per class (magnitude vs identity — saturate/chroma/lift/damping ruled: OFF = identity value, never range minimum) · bipolar sign answer (sign cell on the row; OFF = true 0) · counts/ATLAS flagging. Plus a display-honesty paragraph (exact readout + off-detent mark). |
| 2c. Exemptions list | `plan.md` | Same section → "Exemptions — named, closed list": dual ranges (SCALE/SCALE Y/ROTATE/ALPHA) · HUE dial (D7) · divergence-class precision params · position params as ONE class ruling (SUN X/Y + M4 plate centre; 2D pad in the editor is the sanctioned future form; replaces the sun-disc exemption) · macro jogs (#724) · enum-index params (spectrumMap class → render as selectors). |
| 2d / item 5. Field→channel note | `docs/research/strata-quantized/amendment.md` §2 (rewritten) + `plan.md` (Phase 0 paper record + Phase 3 bullet corrected) | Records Matt's 2026-10-16 ruling: #1204's home stands, the map stays in the CHIAROSCURO editor, NOT a MATH op, no bottom-stratum retarget; named apart from PATCH FIELD. The issue body's original premise (re-open #1204, move to MATH layer) is recorded as OVERRULED. |
| — (supporting corrections) | `amendment.md` header note + §3 correction note; `plan.md` status line | §3's double-click gesture, blind stop derivation, angle detents, and sun-disc exception are marked superseded (D2 / stop-table law / D7 / position class) so no later agent builds from them. Plan status line updated: D1–D8 ruled, lane un-deferred 2026-10-30, Phase 0 landed. |

## Premises verified against current main (all held — no stop-rule triggers)

- DS §2 states the one-of-each doctrine and §2.1 canonizes RangeRow with
  click-to-type + double-click reset — as the issue claims
  (`docs/DESIGN_SYSTEM.md` §2, §2.1).
- CHIAROSCURO section editor exists as described: over-canvas portal,
  no backdrop, Esc/click-away close, launched from a BUILD button
  (`app/src/panels/layout/ChiaroscuroSection.jsx`); it contains the sun
  controls, the HUE `DialEditor`, and the MapRow (line 193).
- Per-param value editor exists: `ValueButton.jsx` ("the ONE
  continuous-value control (#1202)") + `ValueDock.jsx` (docked to the
  panel edge, "NEVER covers the canvas").
- **PR #1632 is MERGED** (2026-10-16, "CHIAROSCURO collapses to a button
  (#1629)"), and `MapRow.jsx`'s header records the 2026-10-16 move into
  the CHIAROSCURO editor with #1204's home intact — item 5's ruling is
  already the shipped state; the paper now matches it.
- PATCH FIELD exists in the shipped stack with its own target pointer:
  `app/src/panels/build/LayerStack.jsx`, patch mode `field`, `patch.to`.
- Tapers exist as QA described: `AccumFamily.jsx` — `fadeTaper =
  getTaper('halfLife', …)` (accumulationFade), `glowTaper =
  getTaper('power', { exp: 2 })` (GLOW).
- M4 by-eye defaults: `STIPPLE_DOT_SCALE = 2.5`
  (`app/src/engine/stippleBody.mjs:104`), `PLATE_RADIUS = 1.05`
  (`plateBody.mjs:63`), `GLASS_BODY_ALPHA = 0.78` (`glassBody.mjs:39`),
  `PLATE_CENTER = (0.36, 0.30)`; params registered in PARAM_SPEC
  (`app/src/data/layout-modes.js:530–534`).
- `spectrumMap: { min: 0, max: 3, int: true }` (`layout-modes.js:442`) —
  enum index, as the exemptions claim. Dual ranges: 4 `DualEditor` sites
  in `LayoutSliders.jsx`. SUN X/Y ranges −500..1500 / −500..1200 in
  `SunControls.jsx`. Macro jogs: `MacroKnob.jsx` + `MathSection.jsx`
  present. QA report §8 treated as governing over the amendment
  throughout (FX 13 kinds / MATH 12 ops, double-click spent, etc.).

## Checks run

- `node src/components/helpModal.selfcheck.mjs` — **7/7 passed** (the
  only selfcheck asserting DESIGN_SYSTEM-adjacent text; it pins a §1.4
  reference in `panels.css`, untouched by this diff). No selfcheck or
  manifest entry reads `docs/research/strata-quantized/`.
- `npm run format:check` in `app/` — **clean** (exit 0, "All matched
  files use Prettier code style!"). First run failed with `prettier: not
  found` because the fresh worktree had no `node_modules`; after
  `npm install` (no tracked files changed by it) the check ran for real.

## Not done / notes for the coordinator

- No issue-title or label changes made from this branch — the
  "(DEFERRED)" in #1606's title is stale per the dispatch (lane
  un-deferred 2026-10-30); retitling is a coordinator/GitHub action,
  not paper.
- Nothing pushed, no PR opened — coordinator publishes.
