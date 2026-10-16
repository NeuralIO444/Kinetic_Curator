# STAGING REPORT — #1629 CHIAROSCURO collapses to a button

Branch `ember/1629-chiaroscuro-button` in `~/workspace/kc-1629-build`.
(Note: the original staging report file did not survive the publish
rebase onto main — the report commit was dropped, per lane practice.
The stage summary below is the on-record account from PR #1632's body;
the amendment section is new.)

## Stage 1 — the button (commit 0020bf0b, PR #1632)

The CHIAROSCURO section row in BUILD §④ Appearance — title span, live
sun+hue summary, EDIT cell — replaced by one button labelled
CHIAROSCURO launching the existing floating editor, wiring unchanged
(same anchor ref, toggle, `aria-expanded`, `aria-haspopup="dialog"`).
The editor portal was untouched. Dead row CSS deleted; one help
sentence (layout-sun) reworded to name the button. Parity: seeded
reference renders of all 6 parity-corpus scenes sha256-identical;
`panels/layout/chiaroscuro` selfcheck green with a new #1629 pin
(exactly one dialog launcher; row/summary/EDIT gone). Live drive: the
section holds exactly one button, 37px high; the editor opens over the
canvas and Esc closes it.

## Amendment — map row in, editor enlarged (2026-10-16)

Matt's direction, same day, from the live §④ screenshot: the map row's
buttons (field → channel → AMOUNT) move into the CHIAROSCURO editor,
and the editor gets larger. One new commit on the PR branch; the
coordinator verifies and pushes.

### What moved

- **The map control** (`panels/layout/MapRow.jsx`) no longer renders
  in BUILD §④ Appearance — `BuildPanel.jsx` drops both the render and
  the import. `ChiaroscuroSection` now renders `<MapRow>` inside the
  floating editor, below the sun family and the HUE ROTATE dial, fed
  the same `layoutParams` / `lockedParams` the section already
  receives. Pure relocation: same component, same state, same events
  (`LAYOUT_PARAM` / `LAYOUT_LOCK`), same stored keys
  (`fieldMapField` / `fieldMapChannel` / `fieldMapAmount`).
- **The editor's size.** `canvasAnchor` now returns
  `shelfAnchor(wrap.getBoundingClientRect())` — the K5 expanded
  shelf's own anchor imported from `panels/shelfView.mjs`, not a
  second mechanism: the canvas wrap's rect minus a 16px inset on
  every side, with an explicit height (the old 560px right-anchored
  cap and the `maxHeight` form are gone). No backdrop, no aria-modal,
  canvas stays live, Esc/click-away close unchanged.
- **Home comments/copy, surgically:** the §④ comment in BuildPanel
  now reads "the sun + hue + the field→channel map" for the editor;
  the section header's tenant list gains the map and its
  "deliberately NOT here" line loses it; MapRow's header states the
  new home. The #1204 doctrine is restated in both places: an
  Appearance-family scene control, NOT a MATH op, now inside
  Appearance's own editor. helpCopy checked: `layout-map` names no
  location (nothing to update); `layout-sun` remains true verbatim.

### Parity

No render code touched — chrome only. `gl/parity/parity.selfcheck`
passes (OK, 6 cases: corpus validity, reference determinism, and
self-parity over the full corpus), so seeded renders are unchanged.

### Suites

- `panels/layout/chiaroscuro.selfcheck` — **9/9**. The #1629 launcher
  pin and all prior pins stand; the emitted-events pin now also scans
  MapRow's source (same expected set — a strengthening, not a
  weakening). Two new pins: the map renders inside the editor and not
  in the §④ row (with #1204 still riding the control), and the editor
  sizing uses the shelfAnchor form (no `EDITOR_W`, no `maxHeight`,
  explicit `height` in the portal style).
- `data/chiaroscuro.selfcheck` — OK. `engine/fieldMap.selfcheck` —
  ok. `panels/shelfView.selfcheck` — PASS (11 groups; the anchor's
  home module, now also imported by the section).
- `npm run build` — green. eslint on all touched files — clean.
- No solo manifest sweep, per the amendment's instructions; the
  neighbours above are the ones this surface touches.

### Design calls flagged

1. **Group label.** Inside the editor the map group is labelled by
   MapRow's own built-in "map" label (the same `davis-label` grammar
   as the section-rendered "sun" and "hue rotate" labels, and the one
   carrying the `layout-map` help tooltip) rather than a new
   section-rendered label — the control arrived self-labelled, and
   keeping it intact is the purest form of the relocation.
2. **Content width cap.** The panel grew; the groups did not. Body
   children are capped at `max-width: 560px` (the old editor's
   width) in CSS, so sun sliders and the map tile row keep their
   designed measure instead of stretching the full canvas width; the
   panel head still spans the full width (title left, close right,
   like the shelf overlay's head). The map group also gets a 4px top
   margin so its separation totals the same 10px the hue group has.
3. **AMOUNT keeps the panel value dock.** Per the relocation rule,
   MapRow is byte-for-byte the control it was — its AMOUNT button
   still summons the panel value dock, which renders in the BUILD
   column (outside the floating editor). Touching the dock therefore
   dismisses the floating editor via click-away while the dock stays
   open — the app's existing one-editor-at-a-time handoff (the
   CHIAROSCURO button already closes the dock when it opens). Left as
   the shipped grammar and flagged here rather than redesigned; if
   Matt wants AMOUNT inline inside the editor (the SunControls
   RangeRow pattern), that is a small follow-up, not a relocation.

## Amendment 2 — responsive content-sized editor (2026-10-16)

Matt's word, after seeing the enlarged editor live: "can you just do
a responsive window so it is only the essential size?" Amendment 1's
sizing — the panel forced to the full canvas-minus-inset rect — is
replaced the same day. One new commit on the PR branch; the
coordinator verifies and pushes (the feat commit only; this report
stays local, as before).

### What changed

- **The panel sizes to its content.** The portal no longer styles an
  explicit width/height; `.chiaro-editor` gains `width: max-content`,
  so the window hugs its control groups at their natural measure,
  plus the head and the body's padding. Sun group, hue group, map
  group — nothing else sets the size.
- **`shelfAnchor` shrinks to placement + bound.** `canvasAnchor`
  still runs it (same mechanism, not a second one): its top/left
  anchors the window at the wrap rect minus the 16px inset, and its
  width/height now arrive at the portal as `maxWidth`/`maxHeight` —
  caps, not dimensions. The panel may never exceed the wrap rect
  minus the inset in either dimension.
- **Past the bound, the body scrolls.** If the content ever exceeded
  the height cap (a narrow canvas), the body — already
  `overflow-y: auto` — scrolls internally; it gains `min-height: 0`
  so the flex column can actually shrink to the cap instead of the
  panel overflowing the canvas. No backdrop, no aria-modal,
  Esc/click-away, canvas live: all unchanged.

### The sizing law now in force

Content-sized, canvas-bounded: the window takes the size its groups
need, anchored top-left at the wrap rect minus the 16px inset, never
larger than that rect in either dimension, internally scrolling past
the height bound. The chiaroscuro selfcheck's sizing pin states this
law (shelfAnchor supplies placement + maxWidth/maxHeight; no forced
`width: pos.width` / `height: pos.height`; `width: max-content` and
the body's internal scroll pinned in the CSS) in place of the
amendment-1 shelf-size pin — the pin was rewritten, not deleted.

### Content-cap call

**The 560px group cap STAYS** (`.chiaro-editor-body > *`). With the
panel content-sized, the widest group IS the panel's width, so the
cap is now what gives "the essential size" a definite value: the
groups keep the measure they were designed at (the pre-amendment
editor's width), and no flex row negotiates a wider max-content
against the panel. Removing it would make the window's width an
accident of flex layout rather than a designed measure. Panel width
in practice: the widest group at 560px plus body padding — the sun
controls' designed width, nothing more.

### Suites

- `panels/layout/chiaroscuro.selfcheck` — **9/9**. All prior pins
  stand; the sizing pin is rewritten to the content-sized law above.
- `data/chiaroscuro.selfcheck` — OK.
- `gl/parity/parity.selfcheck` — **OK (6 cases)**; no render code
  touched, seeded renders unchanged.
- `npm run build` — green. eslint on the touched JS files — clean.
- Neighbours from the amendment-1 run stand (shelfAnchor itself is
  untouched; `panels/shelfView` and `engine/fieldMap` unaffected).

## Amendment 3 — map row keeps its single-row form (2026-10-16)

**Cause.** Amendment 2 made the editor `width: max-content`. The
map's tile matrices (`.te-matrix`) are auto-fill grids whose column
count follows their width; sized by max-content they collapsed, and
in the live app the map reflowed into two vertical tile columns with
the AMOUNT dock stretched beside them as a tall empty box — an
un-ordered shape change against the relocation contract ("same
component, same form").

**Fix (CSS only, scoped to the editor).** In `panels.css`, under
`.chiaro-editor` only: `.map-tiles` is pinned `flex-wrap: nowrap`;
the matrices render as a single non-wrapping flex row at natural
width (`flex: 0 0 auto`) instead of the auto-fill grid; the tiles
keep their designed measure (`flex: 0 0 auto; min-width: 52px`).
The panel's width is again the widest group's natural width, the
map renders on one line exactly as it did in §④ and in the wide
editor, and the AMOUNT dock sits at the row's right at the row's
height. The sun toggle, hue group, canvas bound (shelfAnchor
maxWidth/maxHeight), internal scroll, and Esc/click-away are
untouched; §④ and every other `.te-matrix` are untouched.

### Suites

- `panels/layout/chiaroscuro.selfcheck` — **10/10**. All prior pins
  stand; a new amendment-3 pin holds the no-wrap law for the map
  group inside the editor in source.
- `data/chiaroscuro.selfcheck` — OK.
- `gl/parity/parity.selfcheck` — **OK (6 cases)**; no render code
  touched, seeded renders unchanged.
- `npm run build` — green. eslint on the touched files — clean
  (panels.css sits outside the eslint config; the selfcheck is in it).
