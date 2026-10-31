# #1894 — ACCUM: LEAVE takes the longer fade (ACCUM FADE works in LEAVE)

**Matt's ruling (2026-10-31), implemented verbatim:** in LEAVE mode the
effective keep is `max(1 − trailFade, 0.5^(1 / accumFadeFrames))` — the
longer fade wins. ACCUM FADE units untouched (half-life frames; default
5.4; stops [1, 3, 5.4, 20]); non-LEAVE modes byte-unchanged.

## Premises verified before building

- The #560 LEAVE override was exactly where the audit said:
  `accumRecipeParams` in `app/src/gl/accum.mjs` set LEAVE's `keepFinal` to
  `clamp01(1 − leaveFade)`, ignoring the ACCUM FADE keep entirely.
- The recipe's `fade` input IS the ACCUM FADE keep: `liveLoop.mjs` passes
  `fade: halfLifeToKeep(accumulationFade …)` (with the #268 swell envelope
  applied to the frame count first), so composing against the recipe's
  clamped `keep` is composing against `0.5^(1/accumFadeFrames)`.
- The composition point is entirely in `accum.mjs` — **no one-writer file
  touched** (liveLoop.mjs / liveResolve.mjs / particles.js untouched;
  liveLoop only supplies params, as before). `applyAudioEnvelope` and the
  spectrum warp modulate the composed scalar downstream; neither
  re-composes it per mode.

## The change (one expression, `app/src/gl/accum.mjs`)

```js
const keepFinal = held
  ? Math.max(Math.min(1, Math.max(0, 1 - (Number(leaveFade) || 0))), keep)
  : … // ribbon / comet / plain branches untouched
```

`keepVec` still derives from `keepFinal` in the one place (#1800), so the
spectral channels follow the winning fade automatically. A comment at the
site names the ruling and the date.

## Measurements — real renderer + recipe, before vs after

Method: the audit's probe approach (headless Chromium, real
`createLiveRenderer` + `ensureAccum` + `accumRecipeParams` + `accum.step`;
one disc stamped, then empty steps; disc-centre peak read back through the
ACES resolve per step). Readback adds the audit's documented ~+0.02
shoulder bias toward 1, so fitted ratios sit above the raw keep, ordering
exact; the param keep is exact. Probe scripts preserved in
`~/workspace/kc-1894-shots/probes/` (they ran from /tmp, which a VM
restart wiped mid-verification; the scripts and all numbers here are
reproduced verbatim in that folder).

| Case | Param keep BEFORE | Param keep AFTER | Measured/step BEFORE | Measured/step AFTER |
|---|---|---|---|---|
| A · Matt's exact state (LEAVE, trail 0.05, ACCUM FADE 12f, echoes 2) | 0.9500 | 0.9500 | 0.9654 | 0.9654 |
| B · LEAVE, trail 0.20, ACCUM FADE 12f | 0.8000 | **0.9439** | 0.8558 | **0.9597** |
| C · LEAVE, trail 0.05, ACCUM FADE 34f | 0.9500 | **0.9798** | 0.9654 | **0.9894** |
| D · LEAVE, trail 0, ACCUM FADE fastest (1f) | 1.0000 | 1.0000 | 1.0000 (flat 144 ×12) | 1.0000 (flat 144 ×12) |
| E · non-LEAVE control, plain fade 12f | 0.9439 | 0.9439 | 0.9589 | 0.9589 |

Reading the acceptance bullets against this table, honestly:

- **Case B is the acceptance case in discriminating form.** The issue's
  bullet pairs TRAIL FADE 0.05 with ACCUM FADE 12f — but at those values
  the trail fade is itself the longer fade (keep 0.95 ≈ 13.5-frame
  half-life vs the 12-frame ACCUM FADE), so the ruled max() keeps 0.95 and
  Case A is byte-identical peaks before/after (142,141,138,134,…). With
  TRAIL FADE 0.20 (keep 0.8, ~3.1f half-life) against the same ACCUM FADE
  12f, the composition is decisive: before, the mark decays on the trail
  curve (param 0.8000, gone by step ~20); after, it decays on the
  **12-frame half-life** (param 0.9439, measured/step 0.9597 — matching
  the non-LEAVE 12f control's 0.9589 within readback noise). Case C shows
  the other direction of the same law: dial ACCUM FADE to 34f and it wins
  over trail 0.05.
- **Case D:** ACCUM FADE at its fastest + TRAIL FADE 0 → hold stays
  exactly 1.0000, peaks flat — the max() never shortens a hold. ✓
- **Case E + A:** non-LEAVE renders and Matt's exact state are unchanged
  (identical param keeps, identical peak sequences). No golden re-records
  anywhere in the sweep; no e2e spec drives LEAVE (no LEAVE/leaveFade
  selectors exist in e2e/), so no golden legitimately covers this change.

Visual proof (case B state, steps 0/5/10/20/40 montaged):
`~/workspace/kc-1894-shots/before-leave-trail020-fade12-strip.png` (marks
nearly gone by step 20) and
`~/workspace/kc-1894-shots/after-leave-trail020-fade12-strip.png` (marks
readable at 20, still present at 40).

## Selfchecks

- **New assertions:** `trailMode.selfcheck` gains '#1894 LEAVE takes the
  longer fade' (ACCUM wins at 12f vs trail 0.2; ACCUM wins dialed to 34f
  vs trail 0.05; trail wins at Matt's values; fastest-ACCUM + trail 0
  holds exactly 1). `accum.selfcheck` gains 'LEAVE composes the longer
  fade (#1894)' including the keepVec derivation from the composed keep.
  accum suite: **OK (84 cases)** — 83 baseline + 1 new.
- **Re-pin (one, cause named in the assertion's comment):**
  `trailMode.selfcheck` '#560 Leave fade is optional' —
  `accumRecipeParams({ leave: true, leaveFade: 0.2 }).keep` was 0.8, now
  **0.88**: the call leaves `fade` at its 0.88 default, and under the
  ruling that ACCUM FADE keep is the longer fade, so it wins. The comment
  at the assertion reads "Matt ruling 2026-10-31, #1894". The original
  intent (trail fade drives the keep when it is the longer fade) is kept
  as an explicit case with `fade: 0.5` → 0.8. No check was weakened or
  deleted; the other #560 pins (hold at trail 0, non-LEAVE ignoring
  leaveFade, tunnel/prism/flow fades, ribbon/comet) pass unchanged.
- Suites run individually and green: trailMode (7/7), accum (84),
  accum.seam, accumGuard, accumFeed, accumInput (7), modeStops.
- `npm run format:check` — clean.
- Full manifest sweep: **551 of 551 suites pass** (the manifest run to
  its final line, `trailStats`, zero FAILED; kineticSweep passed — the
  #1822 flake did not fire; accumInput passed inside the sweep on the
  re-run). Two suites were carved out of the sweep and proven
  environmental, base-identical on pristine origin/main:
  `swarmWasm` (fails identically on both trees — `cargo` not on PATH in
  this sandbox) and `fx/rollSafety` (the sandbox browser target crashes
  mid-probe on pristine main — `page.evaluate: Target crashed` — and on
  this tree the same way; no assertion is reached in either). One
  mid-verification VM restart wiped the first sweep attempt's /tmp logs;
  the sweep was re-run end-to-end afterwards with logs kept in
  `~/workspace/kc-1894-shots/sweep-full.log`. CI remains authoritative
  for the two carved-out suites.

## Files

- `app/src/gl/accum.mjs` — the composed keep (+ ruling comment).
- `app/src/gl/accum.selfcheck.mjs` — LEAVE composition block.
- `app/src/gl/trailMode.selfcheck.mjs` — composition test + the one
  re-pin above.

NOT done: no panel/shelf change (the ACCUM FADE row now simply works in
LEAVE; signalling/greying was the other ruling option and was not chosen),
no units change, no change to ribbon/comet/plain composition, no
one-writer file edits.
