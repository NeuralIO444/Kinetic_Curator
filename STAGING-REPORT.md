# STAGING REPORT — #1588 LOIS verdict line → footer ticker

**Branch:** `ember/1588-lois-ticker` on main `19b60b9c` · **Local only** — no push, no PR.
**Contract:** issue #1588 (body; it has no comments). Presentation only — no data changes.

## What shipped

- **Top bar (CuratorBar.jsx):** the verdict sentence no longer renders there — the trailing
  `.lois-verdict` span, its `loisLine` const, and the `getLoisVerdict` import are gone
  (`getLoisVerdictParts` stays for the CUR detent). The crown readout is untouched, and the pick
  record stays in the Curator button's tooltip exactly as today: `curatorHint` in curate.js still
  reads `getLoisVerdict()` itself and was not modified (a selfcheck scan pins this).
- **Footer slot (LoisPill.jsx):** the kaomoji face is removed from the chip. In its place — the
  chip's left segment — LOIS's current line renders as a ticker when she has one. Her state label
  (LOIS · VIBE/NOD/BURN/AWAY) stays, with the existing #1462 mind takeover of the code (weight ≥ 0.5)
  and the pill's title composition unchanged. The line is read on the pill's existing draw cadence
  (events + store + 500 ms poll) via the new module — no new timers, no new state machinery.
- **New pure module (components/loisTicker.mjs):** `tickerLine()` (the line source = loisRank's
  last verdict, the exact string the top bar showed; `''` until LOIS has actually picked — then the
  slot shows the state label alone, per contract) and `tickerMotion()` (the render decision).
- **CSS:** `.lois-face` and `.lois-verdict` rules deleted (both orphaned — grep-verified across
  JSX/CSS/e2e/qa). New `.lois-ticker` rules + `lois-ticker-run` keyframes in layout.css.
  The chip itself stays at its fixed 168 px; the ticker window flexes into the face's segment.

## Overflow / loop mechanics

- The pill measures honestly before animating anything: a hidden, absolutely-positioned twin of
  the line (same font, `white-space: nowrap`) reports the text's natural width, the slot reports its
  own `clientWidth`, and a ResizeObserver on both re-measures when either moves (window resizes,
  late font swaps). Until both widths are known the decision is **static** — nothing animates on a
  guess.
- **Scrolls only on overflow** (`textWidth > slotWidth`). The run travels from `translateX =
  -textWidth` (fully left of the slot — it enters at the left edge) to `translateX = slotWidth`
  (fully right of it — it leaves at the right edge): **left to right**, Matt's direction, literal,
  looping via `animation-iteration-count: infinite`. Endpoints and duration are computed in the
  pure module and handed to CSS as `--tk-from` / `--tk-to` custom properties + an inline
  `animationDuration`, so **speed is a constant 30 px/s** whatever the line's length (duration =
  distance ÷ speed). A line that fits sits still, unanimated, at rest position.
- A changed line restarts its run cleanly (the run span is keyed by the line).

## Reduced-motion behaviour (KC-1 DS rule 7 — stillness is first-class)

- The component reads `(prefers-reduced-motion: reduce)` via matchMedia with a live `change`
  listener, and passes it into the decision: reduced ⇒ **static**, and the decision doesn't even
  describe travel (duration 0). Static + overflowing renders ellipsized (`text-overflow: ellipsis`
  in the slot), per the contract.
- Backstop in CSS independent of the JS read: `@media (prefers-reduced-motion: reduce)` sets
  `.lois-ticker-run { animation: none !important; }` — the animation cannot run under reduced
  motion even if a future edit breaks the JS branch.

## Decisions flagged (deliberate readings of the contract)

1. **No voice gate in the footer.** The top bar showed the line only while the voice was LOIS.
   The ticker carries `getLoisVerdict()` whenever a verdict exists. A verdict can only exist
   because LOIS ranked a pick (rankLois is her ranker), so the line is hers by construction;
   hiding it the moment the voice switches would contradict "the ticker carries the real last
   LOIS line." The tooltip record keeps its own behaviour, untouched.
2. **The #1462 mind face-blend in this pill retired with the face.** The blended overlay
   (mind-honest / mind-over kaomoji spans) was a face over the face; acceptance says no kaomoji
   anywhere in the slot, so it went. The mind layer still surfaces in the pill through the code
   takeover and the title's mind line, and DirectorsDuel's blended faces are untouched.
   `useMindFaces()` + `loisLook(mind.id)` remain in the pill (the mindFace suite pins both).
3. **Window width is the chip's remainder (~66 px), not the face's exact 78 px.** The face's
   fixed reservation died with the face; the ticker flexes into what the 168 px chip leaves after
   LOIS · code take their fixed shares, measured live. Consequence, honestly: at 10 px type,
   nearly every current verdict line overflows ~66 px and scrolls. The fits-sits-still branch is
   real (it is unit-pinned) and engages for short lines; widening the chip is a one-line CSS
   change if Matt wants more of the line visible at rest.
4. **Interim tenant only.** No peephole/codec machinery was pre-built; the ticker is a contained
   module + one component block, cheap for §09 to supersede.

## Verification (own runs, this worktree)

- **New suite** `src/components/loisTicker.selfcheck.mjs` — **6/6 passed**, registered in
  `app/selfcheck.manifest`. Covers: seeded-pick parity (the ticker line === the ranked verdict
  === `getLoisVerdict()`; cleared ⇒ `''`), overflow gate (fit/exact-fit static, +1 px scrolls),
  left-to-right geometry + constant-speed durations, reduced-motion static, unmeasured static,
  and wiring scans (no `lois-verdict` / no verdict read in CuratorBar; no kaomoji in the pill;
  the ticker reads `tickerLine()`; curate.js still reads the verdict for the tooltip).
- **Neighbours, all exit 0:** loisRank · loisFace (4) · loisActivity · mindFace (7) ·
  mindApple (5) · loisLines (8) · expandLabel (5) · swayMark (9) · retiredEmoji · coldOpen (7) ·
  invite (5) · curatePalette · taxonomy · rollGuard (8).
- **ESLint** on all touched/created files: clean. **`npm run build`: green** (built in 14.19 s).
- **Not run, deliberately:** the full selfcheck manifest sweep (per staging instructions — the
  sandbox is shared tonight; the coordinator runs the sweep solo at publish) and the Playwright
  e2e suite (the sandbox cannot run it; CI is authoritative). Grep confirms no e2e/qa spec
  references the removed elements (`.lois-verdict`, `.lois-face`, the pill's face spans).
