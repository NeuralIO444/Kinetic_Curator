# STAGING REPORT — #2501: truncation and overflow across the bottom bar, DEV tabs, asset rows and DEV tables

Branch `feat/2501-truncation-overflow` off origin/main `62b98f15`. Head of the UX-eight line
(#2501–#2508). Built fully auto under Matt's standing queue instruction (2026-11-28: "Continue on
queue fully auto. Ask me questions") — and per the lane's sequencing hold, this PR is **not**
merged by the lane: the UX eight are feel/visual changes, and whether they merge under full-auto
or stay in Matt's review lane is Ember's question to Matt with this finished PR in hand.

Issue #2501 (verbatim title: "Stress UX: truncation and overflow across the bottom bar, DEV tabs,
asset rows and DEV tables") bundles seven findings from Ember's 2026-11-24 live stress session
(B1, B3, B7, B8, B20, B21, B26). It has no comments; the body is the whole spec. No earlier PR
references the issue — nothing had shipped for it. Each finding was re-measured on this tree
before any fix (the issue's own instruction: "verify against the target tree before building"),
with Playwright probes against the built app at the stress width (1904px) and below.

## Verdicts per finding — measured, not assumed

- **B1 (bottom bar overflow) — CONFIRMED, fixed.** At fresh boot the bar fits at 1904px, but its
  content floor is ~1400px: at a 1280px window the pre-fix bar's right edge (REC/TAKE/RUN) sat at
  1401px — off-window, silently cut (body overflow-x is hidden); at 1100px, 1408px. Any wider
  state (recording pill, take strip, notices) overflows at wider windows too — the stress
  session's 1904px observation. Fix (CSS only, `layout.css`): the bar keeps its fixed 38px grid
  row; `.master-left` now takes only what the transport leaves (`flex: 1 1 auto; min-width: 0;
  overflow: hidden`), `.master-right` never shrinks, controls never shrink, the LOIS pill
  (`flex: 0 1 168px`, floor 100px — its ticker slot already scrolls/ellipsizes) and the status
  pills give first, the tape stage-name ellipsizes, and below 1500px the meter labels hide
  (values stay; every meter's full read is on its title). Post-fix probe: transport inside the
  window and bar scrollWidth == clientWidth at both 1280 and 1100.
- **B3 (DEV tab labels truncated) — CONFIRMED, fixed.** At the default layout, "SHADER LAB"
  measured 53px of label in a 46px slot and "PERSONA TUNE" 64px in 46px — ellipsized; narrower
  panels truncate more. Fix (`ux-polish.css`, scoped): `.panel-dev .panel-tab { flex: 0 0 auto }`
  — DEV tabs take their label's width and the row scrolls (its container already allowed
  overflow-x). The Shell's own tab strip keeps the equal-share squeeze. Post-fix: all 13 labels
  read in full.
- **B7 (ASSETS category row runs off) — DOES NOT REPRODUCE on this tree; contract pinned, no
  code change.** `.cat-filter` has wrapped since #1943 (2026-11-03, before the stress session).
  Probe at the stress width: chips wrap to 2 rows, scrollWidth == clientWidth (697px panel);
  `.cat-weight` and `.pool-facets` wrap too. The stress observation may have caught a transient
  layout state, but on the target tree the row conforms. Rather than invent a fix, the new suite
  locks the wrap contract (source pin on the CSS + a browser pin) so a regression would fail CI.
  This remainder is stated plainly here and in the PR body for Matt's call.
- **B8 (KEEPS SHELF labels truncated, no tooltip) — CONFIRMED in substance, fixed.** Labels do
  ellipsize (by design) and the label span carried a `title` — but the slot is a `<button>` whose
  own tooltip was the swap hint ("aim a swap at this slot"), so most hover targets on the slot
  never named the keep. Fix (`ShelfView.jsx`): the slot's title now leads with the keep's label
  (`<label> — aim a swap at this slot` / `<label> — on the deck — this slot refuses swaps`, the
  pinned refusal phrase preserved verbatim), and the collection row element carries
  `title={row.label}` as well. Browser pin crowns a keep via the bridge, deals it onto the stage,
  and reads both tooltips.
- **B20 (MIND/CENSUS tables overflow) — CONFIRMED by mechanism, fixed.** Both panels set their
  cells `whiteSpace: nowrap`; a table whose min-content exceeds the panel clips at the panel's
  right edge (`.panel-tab-content` is overflow-x hidden) with no scroll. (At fresh boot the
  tables happen to fit; the stress session's populated tables did not.) Fix: every table in
  `MindPanel.jsx` (4) and `CensusPanel.jsx` (4) now sits in a `.dev-table-scroll` box
  (`overflow-x: auto`, `panels.css`). The browser pin widens a MIND table with an unbreakable
  180-char cell and proves the excess scrolls inside the box while the panel itself does not
  overflow.
- **B21 (PERSONA TUNE band labels) — CONFIRMED, fixed.** The identical footnote "band: solo
  length · step cap · agree / disagree / lay-out odds · heat · answers first — unruled (null),
  set by the band phase" rendered under **every** seat section — 7 copies measured. It is a
  constant, not per-seat data. Fix (`PersonaTunePanel.jsx`): the footnote stands once, after the
  seats, alongside the relations note; both texts preserved verbatim. Seats remain distinguished
  by their role headers, as before.
- **B26 (footer build line) — CONFIRMED, fixed.** Measured: 9px, color rgba(232,232,224,0.32)
  (--dimmer) on rgb(22,22,27) — ≈2:1 contrast. Fix (`App.jsx` + `layout.css`): the build line
  gets `.footer-build` (--dim, 10px) and the hash — the only build identifier — is wrapped in
  `.footer-hash` (--ink, 700). The line's text content is unchanged ("KINETIC_CURATOR v… ·
  kernel.v2 · build <hash>"), so the footer-reading e2e specs are untouched.

## Files

- `app/src/styles/layout.css` — B1 master-bar compression + B26 footer build/hash styles.
- `app/src/styles/ux-polish.css` — B3 DEV tab sizing (scoped to `.panel-dev`).
- `app/src/styles/panels.css` — B20 `.dev-table-scroll`.
- `app/src/App.jsx` — B26 footer markup (classes + hash span; text unchanged).
- `app/src/panels/ShelfView.jsx` — B8 slot/row tooltips.
- `app/src/panels/MindPanel.jsx`, `app/src/panels/CensusPanel.jsx` — B20 table wrappers
  (Prettier re-indentation inside the wrapped blocks accounts for most of the diff lines).
- `app/src/panels/PersonaTunePanel.jsx` — B21 footnote hoisted to one instance.
- `app/src/styles/truncationOverflow.selfcheck.mjs` — **new pin suite** (17 checks: 9 source,
  8 browser), registered in `app/selfcheck.manifest`.

## Verification

- New suite: **17/17 pass** on this tree (browser section included). On a pristine checkout of
  origin/main it fails at the first B1 source pin; the browser measurements it asserts were
  independently captured on the pre-fix tree by probe (transport at 1401px on a 1280px window,
  SHADER LAB/PERSONA TUNE labels truncated, 7 band footnotes, footer at 0.32 alpha).
- Neighbour suites for every touched file re-run green: loisTicker, shelfView, devSwitches,
  frameLockRemoval, modMatrixDepth, colorTribes, dishLifeChip, panelGraph, mindPresence,
  storyLive, helpCopy, radii, selects, casingInCss. e2e grep: no spec asserts the old surfaces
  (footer specs read `.footer-bar` text, which is unchanged; dev-switches.spec does not touch
  the footnote).
- Lint: 0 errors (11 warnings, the standing set). format:check: clean (Prettier applied to the
  two table panels after the scripted wrapper pass).
- Full manifest sweep: see the PR body for the final tally (run at publish time).

## What was NOT done

- No layout, colour-token, or content changes beyond the seven findings. The Lois ticker's
  scroll-by-design (#1588) is untouched. B7 got a contract pin, not a fix — it does not
  reproduce. A15's remaining slice, the other UX items (#2502–#2508), and everything downstream
  are untouched.
