# STAGING REPORT — #1587 CHIAROSCURO section (local staging build)

Branch `ember/1587-chiaroscuro` on origin/main `19b60b9c`. LOCAL ONLY — no push, no PR.
Date: 2026-10-15 (PT). Builder: staging subagent; coordinator verifies + publishes.

## What this is

BUILD gains a titled **CHIAROSCURO** section — one home for the scene-level
render engine. In the panel it is a compact row (plain TE label, a live
one-line summary, an EDIT button). The full control set lives in a large
floating editor **over the canvas**: no backdrop, the canvas stays live and
rendering underneath, no apply/confirm, Esc or click-away closes, no focus
trap. Every control emits its usual event the moment it moves, so a sun
slider changes the light live in the same gesture (the issue's "sun drag"
acceptance, read as the relocated controls' live behaviour — see Flags).

## Inventory — what moved (and only this)

| Control | Old home | New home |
|---|---|---|
| Sun ON/OFF + SUN X / SUN Y / HEIGHT / INTENSITY / AMBIENT / BEVEL / SPEC / POOL + sun colour | `panels/layout/SunRow.jsx`, hosted in BuildPanel §④ Appearance | The CHIAROSCURO floating editor (`SunControls.jsx` — git records it as a rename of SunRow.jsx) |
| HUE ROTATE (dial) + its life-drift lock | `panels/layout/AppearanceSliders.jsx` | The CHIAROSCURO floating editor (finish group) |

## Deliberately NOT moved (the boundary, documented per amendment 1)

| Control | Where it stays | Why |
|---|---|---|
| FXAA | Pipeline `panels/pipeline/DisplayBlock.jsx` | Amendment 1 (Matt, 2026-10-15): output/display render, not the Look. Verified untouched — `DISPLAY_FXAA` still emitted only there. |
| Material body knobs (M4) | Appearance `MaterialSliders.jsx` | The issue's boundary: materials keep their home. |
| Field→channel map | Appearance `MapRow.jsx` | Home ruled by #1204; not a render-engine control. |
| CROOKED / SQUASH / GROWTH RATE / BRANCHING | Appearance `AppearanceSliders.jsx` | Mark shape + organism behaviour, not scene light/finish. |
| Per-stratum controls, governor tuning | Their existing homes | Explicitly out of scope in the issue. |

## What provably did not change

- **Same store fields, same events, same defaults.** The section emits exactly
  `{ LIGHT_SET, LAYOUT_PARAM, LAYOUT_LOCK }` — the events its controls always
  emitted (asserted by the new selfcheck). Sun ranges/steps are copied
  verbatim from the old row; defaults come from `LIGHT_DEFAULT` itself.
  No engine, state, or scene-contract file is in the diff.
- **Seeded renders identical.** Deterministic reference-SVG renders of all
  six parity-corpus scenes were sha256-hashed before and after the change:
  byte-identical (single-basic 79620ef7…, multi-blend 7a34ad45…, fx-chain-2
  70b01a24…, fx-chain-3 9249c4a8…, fx-invert-wrap c909134d…, fx-stack-3
  cf97e597…; full hashes in the coordinator's run log).
- **Help copy followed the row:** `layout-sun` now names the CHIAROSCURO
  section as the sun's home; group stays `Build`. helpCopy + helpModal
  selfchecks green.

## Flags / decisions for the reviewer

1. **Editor controls are inline, not dock-popped.** The panel value dock
   never covers the canvas by design (its own header comment), so the
   floating editor cannot reuse it as-is. The editor instead renders the
   house slider (`RangeRow`, row form) inline — the strata-block editor
   pattern — inside a portal + `position:fixed` overlay anchored to the
   `.canvas-wrap` rect (the beat-menu / favorites-tray overlay grammar).
   The section closes the panel dock when it opens: one editor at a time.
   Phase 0 of the quantized lane (#1606) owns reconciling this pattern
   formally; this build followed the app's existing grammar.
2. **Inline rows surface two canonical RangeRow affordances** the dock's
   bare slider didn't show: click-to-type readout and double-click reset
   to the shipped defaults. Values, ranges, steps, and defaults are
   unchanged; this is the house slider behaving as itself (#1027).
3. **No 2D sun pad was invented.** Amendment 2 says the editor "gives the
   sun room for a 2D angle/elevation pad if the build wants one" — this
   build kept SUN X / SUN Y as sliders, per the coordinator's brief. The
   pad remains available as a follow-up if Matt wants it.
4. **Sun ON/OFF sits at the top of the editor** (the compact row reports
   state in its summary line instead of duplicating the switch).
5. Editor geometry re-anchors on window resize and on pointer-up (the
   column divider resizes the canvas without a resize event).

## Verification (run by the builder; coordinator re-runs at publish)

New suite: `src/panels/layout/chiaroscuro.selfcheck.mjs` — 6/6 (registered
in `app/selfcheck.manifest`; package.json untouched).

Suites run, all PASS: chiaroscuro (new) · helpCopy · helpModal · light ·
light.pool · lightAudio · census · censusReadout · buildPlacements ·
goldenPlacement · bake.parity · parity/diff · rangeRow · radii · selects ·
kineticHeat (manifest neighbour). Each was also run on the clean base
first — all passed there too, so there are no base-identical failures to
explain in this set.

`npm run build` green (twice; second run after a lint fix). ESLint clean on
every touched file (one `react-hooks/set-state-in-effect` error in the
first cut was fixed by re-anchoring from event callbacks, not suppressed).

NOT run, deliberately: the full 434-line manifest sweep (brief: the
sandbox is shared tonight; the coordinator runs it solo at publish) and
the Playwright e2e harness (the sandbox cannot run it; CI is
authoritative). The localhost visual pass belongs to the publish step's
review lane.
