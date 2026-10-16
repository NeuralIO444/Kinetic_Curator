# STAGING REPORT — #1604 margin fix (Davis panel fit)

Branch: `ember/1604-margin-fix` on `origin/main` 19b60b9c. Local staging only — no push, no PR.
One file changed: `app/src/styles/panels.css` (+16/−1). The e2e test and its 479 allowance are byte-untouched (`git diff` shows panels.css only).

## What was wrong

Matt's ruling: fix the margin, not the test. Measurement (below) found the panel's button rows sizing by the font's **intrinsic** line height: buttons take `line-height: normal` from the UA stylesheet, so `.big-btn` (10px) and `.chip-btn` (9px) heights followed whatever mono font the platform resolved. Everything else in the body already sizes by unitless multipliers (1.35/1.25/1.2), which are font-independent. The hunt's suspect list was partly wrong: the three section labels measure 13.8px but are *not* font-sensitive (line box 10.8 = 8px × 1.35, plus a 1px separator border and 2px padding-top) — they were left alone.

## The fix (all in the #1126 fit block at the end of the Davis rules in panels.css)

- `.panel-davis .big-btn { line-height: 1.1; }` — pins the intrinsic box. Locally height-neutral: the intrinsic box already measured 11px at 10px, buttons stay 23px.
- `.panel-davis .chip-btn { line-height: 1.1; }` — same pin at 9px (box 10px → 9.9px; the MIDI head row drops 0.11px).
- `.panel-davis .davis-body { padding: 2px 8px; }` (was 4px 8px) — −4px.
- `.panel-davis .davis-progress { padding: 2px 6px; }` (was 4px 6px) — −4px.
- `.panel-davis .davis-midi { padding: 2px 6px; gap: 2px; }` (was 4px 6px, gap 4px) — −6px on the perform row; the phrase-status box stretches to the MIDI box, so it follows. Gap 2px stays on the #1031 density scale.
- `.panel-davis .duel-verdict { padding: 2px 8px; }` (was 4px 8px) — −4px.
- `@media (max-height: 760px)`: `.panel-davis .duel-side { padding-top/bottom: 2px; }` (was 3px in that block) — −2px. Scoped to the short-viewport block so tall windows keep their current duel cards.

No content hidden, clipped, or cut. No font sizes changed. Description text wraps exactly as before (the duel block's height did not change under any font — see stress table). Quiet-state layout is unchanged in character: every row keeps its height except the three trimmed utility boxes.

Scope note: the rules sit on the shared Davis chrome classes, so the PLAY tab's copy of the same body/components gets the same pins and trims. The pins are height-neutral under current fonts; the padding trims are identical in character there, and that body has no fit test.

## Measurement — same script, before (pristine origin/main) and after

Technique reproduced from the #1604 hunt: `vite preview` + Playwright-core with system Chromium, `page.route` fulfilling a fake host (`kc.test`) from the local preview server. Boot `?boot=factory`, DIRECTORS tab, 1280×720. QUIET as booted; TALKING after 3 curator randomize clicks + `f` (verdict visible), 600ms settle. "Accounted" = body padding + each child's height + margins + flex gaps (the hunt's accounting; the browser clamps scrollHeight at clientHeight when content is shorter than the box, so accounted is the honest content number).

### TALKING — every `.davis-body` child (px)

| # | child | before | after | Δ |
|---|-------|--------|-------|---|
| 0 | section label "voices" | 10.80 | 10.80 | 0 |
| 1 | voice-row | 41.00 | 41.00 | 0 |
| 2 | davis-label-row ("generate" + load run) | 18.00 | 18.00 | 0 |
| 3 | davis-actions-3 (big-btns) | 23.00 | 23.00 | 0 — line-height pinned, height-neutral |
| 4 | davis-actions (sub-seed) | 17.00 | 17.00 | 0 |
| 5 | davis-progress | 22.80 | 18.80 | −4.00 padding |
| 6 | cand-tray (empty) | 0 | 0 | 0 |
| 7 | section label "perform" | 13.80 | 13.80 | 0 |
| 8 | davis-perform-row (phrase + midi) | 42.14 | 36.03 | −6.11 midi padding −4, midi gap −2, chip pin −0.11 |
| 9 | section label "trails" | 13.80 | 13.80 | 0 |
| 10 | davis-actions-4 (big-btns) | 23.00 | 23.00 | 0 — pinned |
| 11 | davis-actions-motion (big-btns, 2 rows) | 50.00 | 50.00 | 0 — pinned |
| 12 | section label "the room" | 13.80 | 13.80 | 0 |
| 13 | directors-duel | 135.03 | 129.03 | −6.00 verdict padding −4, side padding −2 |
| — | body padding (in total) | 8.00 | 4.00 | −4.00 |
| | **accounted content total** | **476.17** | **456.06** | **−20.11** |
| | client box (the test's 479) | 479 | 479 | — |
| | **headroom** | **2.83** | **22.94** | |

Detail rows, before → after: big-btn line-height `normal` → 11px (height 23 → 23); MIDI chip line-height `normal` → 9.9px (16 → 15.89); verdict 24.84 → 20.84; duel side 104.19 → 102.19; progress idle line unchanged (12.8).

### QUIET

Accounted content 446.64 → 432.53 (−14.11: body padding −4, progress −4, perform row −6.11; the duel sits on its 78px min-height and the verdict is absent, so those trims don't move the quiet total). Client 484, scroll 484 before and after — fits both ways.

### Font stress (TALKING, `--mono` swapped live, same page)

| mono stack | before | after |
|---|---|---|
| ui-monospace, "JetBrains Mono", Menlo (app default) | scroll 479 (content 476.17) | accounted 456.05, scroll 479 |
| "DejaVu Sans Mono" | scroll 479 | accounted 456.05, scroll 479 |
| "Liberation Mono" | scroll 479 | accounted 455.39, scroll 479 |
| "Noto Sans Mono" | **scroll 494** (content ≥ 494 — the fit fails) | accounted 458.39, scroll 479 |

Before: one locally installed mono font blew the fit out by ≥15px on its own. After: the whole spread across four mono families is ~3px (residual sub-pixel baseline excess in the mixed-size progress/phrase lines), and the duel block measures 129.03px under every font. The runner's SF Mono delta (+9 observed) is absorbed many times over.

**Honest caveat:** sandbox font metrics are not the CI runner's. These numbers support a **headroom** claim — 456px of content against the unchanged 479 box locally, ~459px under the worst local font — not a runner prediction. The runner's verdict is CI's, when the fix PR runs.

## What could not be trimmed, and why

- **Section labels (13.8px each):** already multiplier-pinned; the remaining height is the 1px separator border + 2px padding that visually divide the panel's sections. Removing them changes the panel's look for 3px total. Left alone.
- **Duel description wrap:** `.duel-desc` line count is set by text wrapping in a fixed-width column. It measured identical under all four font stacks, before and after. Pinning it would mean fixed heights on variable text — clipping risk, forbidden by the brief. Left alone; the headroom covers it.
- **Motion action row (50px):** two wrapped rows of buttons — layout, not slack. Left alone.
- **Body flex gap:** my first pass took the gap 2px → 1px (−13px). The repo's own `densityScale` selfcheck rejected it: gaps in Davis rules must sit on the 2/4/6/8/12/16/24 scale (#1031). That pass was discarded and replaced with the on-scale padding trims above, which bank more (−20.11 total) with every value on the scale.

## Verification

- `npm run build` — green (before and after).
- Selfchecks run (24, all pass): directorsMatrix, directorSense, directorTable, director, directorSway, directorRank, davisState, davisSigil, davisShift, candidateTray, loisLines, loisRank, loisJudge, loisFace, loisActivity, casingInCss, colorTribes, densityScale, helpModal, pinkDiscipline, rangeRow, labelCase, efRackTile, invite. (That's the DavisPanel/duel neighbourhood plus every suite that scans panels.css.)
- Full manifest sweep: **not run** — per orders, the coordinator runs it solo at publish.
- The e2e spec `app/e2e/directors-duel.spec.js` is untouched; sandbox Playwright is not authoritative for it anyway — CI is.
