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

- **Re-pins** (each carries its cause in the assertion comment: Matt
  ruling 2026-10-31, #1910):
  - `trailMode.selfcheck.mjs` ×3 — '#560 Leave holds the stamps…' keep
    1 → 0.5 (leaveFade defaulted 0, fade 0.5); '#560 Leave fade is
    optional' keep 1 → 0.88 (default fade alone); the #1894 block's
    TRAIL FADE 0 case keep 1 → 0.5.
  - `accum.selfcheck.mjs` ×2 — the spectral block's LEAVE keepVec
    [1,1,1] → spectralKeep(0.5); the #1894 block's 'TRAIL FADE 0 holds
    exactly' keep 1 → 0.5.
  - Every leaveFade > 0 pin is unchanged and passing (incl. the
    acceptance case keep12f + leaveFade 0.2 → keep12f, both suites).
- **New measured battery** (`accum.selfcheck.mjs`, block 'LEAVE with
  TRAIL FADE off: ACCUM FADE governs alone (#1910)'):
  - leaveFade 0 + ACCUM FADE 12f → keep = 0.5^(1/12) exactly; + 5.4f →
    0.5^(1/5.4) exactly; keepVec follows the handed-over keep.
  - Both fades off (fade keep 0, leaveFade 0) → keep 0, pinned by name:
    ACCUM FADE governs alone and says no hold; no fall-out to the old 1.
- **Suite results on this tree:** accum **85 cases OK** (84 + the new
  block); trailMode **7 tests, 7 pass, 0 fail**.

## Screenshots — ~/workspace/kc-1910-shots/

Identical panel state in both, driven through the real UI (BUILD panel):
trail **LEAVE**, **TRAIL FADE OFF**, **ACCUM FADE MID (5.4f)**; shots at
~6 s and ~12 s after the settings landed.

- `before-main-58f8784e-t12.png` (footer: build 58f8784e = current main)
  — the stage is a wall-to-wall saturated smear: every mark ever drawn
  is still on the buffer (keep 1.0), chromatic ghosts stacked hundreds
  deep. The immortal accumulation Matt hit.
- `after-1910-branch-t12.png` (footer: build f0a98c55 = this branch) —
  discrete marks with short decaying wakes; the background reads
  between shapes. ACCUM FADE 5.4f visibly governs.
- t06 pair tells the same story earlier in the accumulation.

Honest labels: the two runs booted different stages (before: petri-bloom;
after: moire) — the boot deal is not seed-locked between runs, so this is
not a pixel A/B of one stage. The panel state is identical, and the
difference shown is the keep law itself (1.0 vs 0.5^(1/5.4)): either
stage smears solid at keep 1 and decays at the handed-over keep.
PERF PAUSED shows in both frames (the headless watchdog re-trips under
SwiftShader); stages are fully drawn in both.

## Verification

- `npm run format:check` in app/: clean (exit 0).
- Full manifest sweep, continue-on-error (the repo runner stops at the
  first failure by design; this is the coordinator method so counts
  compare across slices). The sweep's own final line, verbatim:
  **`SWEEP-RESULT lines=557 PASS=554 FAIL=3`** — per-suite record in
  `~/workspace/kc1910-sweep-results.txt`. The 3 failures, each proven
  environmental / base-identical on pristine 58f8784e:
  - `swarmWasm` — "build-wasm: cargo not found on PATH", identical
    standalone on branch and base (no cargo in the sandbox).
  - `fx/rollSafety` — "page.evaluate: Target crashed", identical
    standalone on branch and base (exit 1 both; Chromium dies in the
    shared harness).
  - `gl/accum` in-sweep only (under-load heap abort) — standalone on
    this final tree: **OK (85 cases)**.
  The kineticSweep flake (#1822) did not fire. CI remains authoritative
  for all three.
- No acceptance check weakened or deleted; the only changed assertions
  are the five re-pins above, each with its cause named.
