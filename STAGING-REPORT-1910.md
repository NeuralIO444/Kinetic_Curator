# STAGING REPORT — #1910: ACCUM: TRAIL FADE off in LEAVE hands the fade to ACCUM FADE (#1894 follow-up)

Branch: `fix/1910-leave-trail-off-hands-fade` (base: origin/main 58f8784e)
Ruling: Matt, 2026-10-31 — "Change it — TRAIL FADE off in LEAVE hands the fade to ACCUM FADE."

## Premises verified against the tree (before any edit)

- **Change site.** The LEAVE branch of `keepFinal` in `app/src/gl/accum.mjs`
  (lines 418–424 on the base), with the #1894 comment block directly above
  (lines 412–417), inside the exported composition function
  `accumRecipeParams`. (The issue names the composition "composeAccumParams";
  no such symbol exists in the tree — `accumRecipeParams` is the composition
  function and the block matches the issue's description exactly. Naming
  gloss in the issue, not a false premise.)
- **Who passes leaveFade.** `app/src/gl/liveLoop.mjs:1160` passes
  `layoutParams.leaveFade` straight through (one-writer file — read only,
  no change needed or made). The panel control is `AccumFamily.jsx`
  (paramKey `leaveFade`).
- **What TRAIL FADE OFF delivers.** Quantized stops in
  `app/src/data/layout-modes.js:629`: `leaveFade: { stops: [0, 0.05, 0.1, 0.2] }`
  — the OFF stop is exactly 0. Premise holds.
- **ACCUM FADE input.** Callers pass `halfLifeToKeep(accumulationFade)`
  (liveLoop.mjs:1136), i.e. the recipe's `fade` input is the keep
  `0.5^(1/frames)`; recipe default `fade = 0.88` when a caller omits it.
- **Standing pins asserting leaveFade 0 → keep 1** (all re-pinned, cause
  named: ruling #1910, 2026-10-31):
  - `trailMode.selfcheck.mjs` — '#560 Leave holds the stamps…' (fade 0.5,
    leaveFade defaulted 0, keep 1); '#560 Leave fade is optional'
    (leaveFade 0, keep 1); the #1894 block's last case (fade 0.5,
    leaveFade 0, keep 1, "holds at exactly 1").
  - `accum.selfcheck.mjs` — spectral block: `{fade 0.5, leave, leaveFade 0}`
    keepVec `[1,1,1]` "LEAVE holds all channels"; #1894 block: same inputs,
    keep 1, "TRAIL FADE 0 holds exactly, whatever ACCUM FADE says".
- **Pins that must NOT move** (#1895 law, leaveFade > 0): trailMode
  leaveFade 0.2 → 0.88; fade 0.5 + leaveFade 0.2 → 0.8; keep12f + 0.2 →
  keep12f (the issue's acceptance case); keep34f + 0.05 → keep34f;
  keep12f + 0.05 → 0.95. accum keep12f + 0.2 → keep12f + keepVec.
- **No source-shape pins** on the keepFinal expression: grep of every
  selfcheck naming accum.mjs / LEAVE / leaveFade found assertions only in
  the two suites above (census + modeStops list the param name only;
  seam/guard/feed/inventory assert nothing about this composition).
  docs/ACCUM.md does not state the LEAVE fade law — nothing to update there.

## The change (accum.mjs only)

- `leaveFade = 0` (incl. omitted/NaN, which normalize to 0): keep = the
  ACCUM FADE keep alone.
- `leaveFade ≠ 0`: the #1895 expression runs byte-identically
  (`max(clamp01(1 − leaveFade), keep)`) — so every leaveFade > 0 case,
  and even out-of-range garbage, composes exactly as before.
- The #1894 comment block is rewritten to state the full law.
- RIBBON (0.96 floor) and COMET (0.72 cap) untouched, per the issue.

## Tests

_(filled in as the suites land)_

## Screenshots

_(before/after pair, LEAVE + TRAIL FADE off + ACCUM FADE MID —
~/workspace/kc-1910-shots/)_

## Verification

_(format:check + full sweep, runner's own line, at the end)_
