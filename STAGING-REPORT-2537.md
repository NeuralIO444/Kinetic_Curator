# #2537 — pausedRecallPresent pin intermittency: diagnosis + fix

## The two CI data points

1. PR #2534, first CI run (head 1c25e489, pre-fix-round-2): held group —
   "the held frame is still scene B" (grid distance ≥ 5). Diagnosed at the
   time as the watchdog trip's tier-1 shed firing a still; fix round 2
   (pause entry adopts the scene) landed in PR #2534.
2. PR #2535, first CI run (tree = main incl. fix round 2): recall group —
   `AssertionError` at pausedRecallPresent.selfcheck.mjs:329: "still reads
   closer to B than A (dA 125.4, dB 3.6) — the stale frame survived". The
   still presented after a recall read as the pre-recall scene.
   (PR #2534's re-run between them passed selfcheck-browser, 36m24s.)
   QA's local runs also saw the held group fail once on the count
   assertion ("presented count moved while settling", settled at 8, next
   read 9).

## Local tally before the fix (pristine tree, this sandbox)

Six attempts of `node src/gl/pausedRecallPresent.selfcheck.mjs`:

- Runs 1, 3, 4, 6: PASS (18 groups).
- Run 2: aborted environmentally (Playwright browser closed during the
  boot wait under memory contention) — not a pin verdict.
- Run 5: FAIL in the boot/B phase — `waitScene('light')` timed out with
  the presented grid at mean luminance 167.6 vs the pin's 170 threshold
  (a scene-read threshold sensitivity in this sandbox's renderer; neither
  of the two CI assertions).

Neither CI assertion reproduced locally in 6 attempts. Per the issue's
rules, that is a finding, not a dead end: the mechanism below is proven
by construction and by a forced, instrumented reproduction.

## The mechanism (named, with the code path)

**A late atlas-bake landing presents the standing scene once inside the
hold, and the pin's read protocol mistook that present for the recall's
still (recall group) or for a seam leak (held group). The seam is not
defective; the pin's sampling was.**

The chain, all in `app/src/gl/liveLoop.mjs` unless noted:

1. A scene transition that changes the resolved asset set (the pin's
   seed change does) starts an asynchronous atlas bake
   (`startStaticBuild` → `bakeLiveAtlas`). While it is in flight,
   presents continue on last-good cells (Spine B, liveLoop.mjs ~1513).
   The bake is sequential SVG rasterisation; under SwiftShader/CI load
   it can still be in flight many seconds after the new scene is already
   presenting and after the watchdog trip + settle.
2. When the bake lands, it flips the module-level `atlasKey`. `atlasKey`
   is a field of the paused seam's scene signature (`sceneSignature`,
   liveLoop.mjs ~1797), so the next paused tick sees a signature change
   and presents exactly one still — of the *standing* scene, with its
   now-completed atlas. This is the seam working as designed: a completed
   atlas is a real change to the presented frame, and the pin's own
   header already budgets "at most one more when its atlas bake lands".
3. The pin's held group baselined the presented count with
   `settledCount()` and then assumed no further present could occur; a
   landing after the baseline moved the count → "presented count moved
   while settling" (QA's local failure).
4. The pin's recall group took the FIRST present after the recall act
   (`waitCount(nHold + 1)` + a single grid read) as the recall's still.
   A pre-recall bake landing in the settle→recall gap is exactly such a
   present, and its pixels are the pre-recall scene → "still reads
   closer to B than A (dA 125.4, dB 3.6)" (CI run 3). dB ≈ 3.6 is the
   signature of a genuine scene-B frame, not a blend or a stale buffer.

Why the seam cannot produce a stale still (the alternative hypothesis,
eliminated): `tick()` is synchronous and `recallFavorite` is a single
atomic zustand `set` (state/slices/davisSlice.js), so a store write can
only land *between* ticks, and every post-recall tick builds its frame
from the post-recall store and samples its signature from that same
store (`sceneSignature(getState(), frame)`) in the same tick that
presents it. No frame built from pre-recall state can be presented after
the recall. The only pre-recall pixels that can appear after the settle
baseline are the bake-landing still of the standing scene, presented by
a tick that ran before the recall write.

### Forced reproduction (instrumented, temporary — all reverted)

liveLoop was temporarily instrumented (a present log recording each
present's signature diff, plus a gate holding the bake's landing until
the test released it):

- Unfixed pin, bake released inside the hold: the present log shows the
  landing present with the store identity unchanged (scene B's seed and
  palette) and the *sole* signature change being the trailing field —
  `atlasKey`. The held group then failed deterministically:
  "presented count moved while settling" (count 10 → 11 across the
  baseline). The log also confirms fix round 2's adoption: no shed still
  (no perfTier1 diff) appears anywhere in the hold.
- Fixed pin, identical forced landing (released at hold entry; landing
  confirmed: presented count 12 → 13 during the hold with the store
  still holding scene B): **all 18 groups PASS** — the landing is
  absorbed by the re-baselined hold, and the recall still converges.

## The fix (pin-side only; `app/src/gl/pausedRecallPresent.selfcheck.mjs`)

No production code changes. `liveLoop.mjs` is byte-identical to main —
fix round 2's adoption, the #823 wrapper, the Spine-B rollback and the
present-site string all stand untouched (the pin's own section-A source
pins still pass as part of every run below).

The pin's read protocol now matches how it already reads running scenes
(`waitScene` polls for the expected scene):

- **Hold baseline (`stableHold`)**: a baseline is trusted only once the
  settled count also stands across a 700 ms soak re-read. A bake landing
  in between re-baselines the reference to the landed still and
  re-settles — but only while the store still holds the expected scene
  (a store move throws: that is a real change, not a landing). A count
  that never stands exhausts 4 attempts and fails, so a still-per-tick
  defect still fails the pin.
- **Recall group**: the count baseline (`nPre`) is re-taken immediately
  before the recall act, so a pre-recall landing never spends the
  recall's present budget; the still is read by *convergence* — poll the
  presented grid until a post-baseline frame reads closer to A than B
  (the group's own criterion), bounded at 120 s.
- **Post-act settle (`boundedSettle`)**: after an act, the presented
  count must settle AND stand across a 700 ms soak re-read, with the
  total presents since the act baseline within budget (asserted at
  every step). A bake landing during the soak re-enters the settle
  loop; the store must hold the expected scene throughout. This
  replaced the old "two settled counts must be equal" drift pair —
  the first fixed-file batch exposed the same race one level down
  (a recall-bake landing fell between two back-to-back `settledCount()`
  calls: "presented count drifted 90 → 91 with no change"), and the
  soak-standing protocol is strictly stronger than the pair it
  replaced: the count must stand, not merely agree twice in a row.
- **Bounded group**: the ≤ 2 budget (the scene still + at most its bake)
  is now measured from `nPre` via `boundedSettle`.
- **Resize group**: polls for the first post-baseline frame at the new
  presented size instead of the first +1 present (same race class).
- **ACCUM variant**: same treatment — `stableHold` baseline for the
  frozen hold, `nPre2` re-taken before the recall, reseed read by
  convergence on the group's own criteria (moved off the frozen hold,
  toward the recalled scene), budget measured from `nPre2`.

Nothing the pin asserts was weakened: a recall while held must still
present the recalled scene (convergence requires a post-act frame that
reads as the recalled scene, with the stop standing and the store
holding the hit); an unchanged scene must still present nothing (the
hold asserts a stable count and a still-B frame, with a bounded number
of re-baselines each proven to be a landing, not a store change).

## Proof after the fix

- Forced-landing A/B (above): unfixed FAIL / fixed PASS under the
  identical placed landing.
- Fixed pin (final file), 13 sequential attempts on this tree:
  **10 full-run PASSes (all 18 groups each)**; 2 failures, both in
  the boot/running phase before any paused group ran — the
  pre-existing `waitScene` luminance-threshold sensitivity of this
  sandbox's renderer (light scene last-read 166.3 vs the 170
  threshold; dark scene "never presented"). That threshold family
  was also seen on the pristine tree before the fix (167.6), has
  never failed on CI, and was deliberately left untouched: loosening
  it would weaken an assertion. 1 further attempt was killed
  mid-run by the sandbox's long-job limit (not a pin verdict).
  No run of the final file failed any paused-group assertion.
- Full history of the fix, for the record: an intermediate version
  of the fixed file ran 3 times — 1 PASS, 1 FAIL on the old drift
  pair ("presented count drifted 90 → 91 with no change" — the race
  `boundedSettle` was then written to close), 1 FAIL on the same
  boot-phase `waitScene` threshold (162.6).
- Neighbour suites: clock.freeze PASS, accumFreezeClear PASS
  (10 groups), accum.seam PASS.
- `npm run format:check`: clean (the edited pin was Prettier-formatted).
- `npm run lint`: 0 errors (11 warnings, the standing count).
- `npm run build`: exercised inside every pin run (the pin always
  builds); all runs above built green.
- Full manifest sweep: not run (the change is confined to one
  selfcheck file; its neighbours and its own source-pin section ran).
  CI's selfcheck-browser is the authoritative full-suite runner.

## What CI should show when the PR runs

selfcheck-browser green on the pausedRecallPresent suite across
repeated runs: the two historical failure shapes are both the
bake-landing race, and the pin's protocol no longer has a read that can
meet it — hold baselines are soak-verified, act baselines are taken
immediately before the act, and scene reads converge instead of
sampling the first present. If a REAL seam defect ever appears (a still
per tick, a recall that never presents the recalled scene, a store move
during a hold), the pin still fails: stability attempts exhaust, the
convergence poll times out, and the bounded budget still binds.

## Round 2 — QA finding F1, plus F2, Note 2, and an F3 the proof batch found

QA Review of round 1 (915b19f7) passed scope, assertion strength,
budget binding, threshold integrity and helper honesty — but its
independent runs went 1 FAIL / 2 PASS, on a case the round-1 protocol
does not govern:

- **F1 (blocking).** The held group's assertion "the held frame is
  still scene B" (`dist(gHold.grid, hold.ref) >= 5`) fired once in
  QA's 3 runs. Mechanism (QA's read, confirmed in the code):
  `hold.ref` was seeded from `gB.grid` — the `waitScene` sample of
  scene B taken while the scene was still RUNNING/animating. The
  standing still after the trip is a different animation instant,
  whose 8×8 grid can sit ≥ 5 from the running sample with no bake
  landing and no count move — nothing for `stableHold` to re-baseline
  against. The assertion compared two legitimately different frames
  of the same scene.
- **F1 fix (QA's suggested direction).** `stableHold` no longer takes
  a caller-supplied reference. It returns `ref` = the standing
  attempt's first settled paused frame — the standing still itself —
  and `grid` = that attempt's soak re-read. The held group now asserts
  the property it exists to pin: **the hold does not drift from the
  standing still**, at the same < 5 threshold. Both call sites updated
  (the ACCUM variant's call consumes only the count; its behaviour is
  unchanged). No other assertion was touched: the recall must still
  present the recalled scene, an unchanged scene must still present
  nothing beyond budget, the ≤ 2 budget still binds, and `waitScene`'s
  ~170 luminance threshold is untouched.
- **F2.** Every grid-distance assertion message now carries the actual
  measured distance(s): the held group (new message), the RUN group
  (dA/dB added), and both reseed-group asserts. The scene-B, recall-
  still and frozen-hold messages already carried theirs.
- **QA Note 2.** The held group's
  `assert.equal(gHold.n, nHold, 'presented count moved while settling')`
  was vacuous — both sides came from the same `stableHold` return —
  and is removed. Count-standing is genuinely enforced inside
  `stableHold`/`boundedSettle`, which throw when a count never stands.
- **F3 (found by round 2's own first proof batch, attempt 4).** The
  ACCUM variant's FREEZE group compared the frozen buffer absolutely
  (< 8) against `gB2`, the running `waitScene` sample — but the buffer
  kept accumulating between that first light read and the freeze
  landing, and the assertion fired at d 9.7 with nothing defective:
  the F1 disease one group over. Fix, same pattern: the group now
  reads B2's identity relatively (the frozen buffer is closer to `gB2`
  than to `gAacc` — the pin's standing scene-identity criterion) and
  asserts the hold against its own first frozen frame across a 700 ms
  soak, at the group's original < 8 threshold. The proof batch was
  restarted from zero on the fixed file.

### Round-2 proof (final pin file; `liveLoop.mjs` still byte-identical to main)

- Batch A (pre-F3 file): 3 PASS (286 s, 358 s, 310 s); attempt 4 FAIL
  = F3 above (147 s, 14 groups in); attempt 5 stopped when the batch
  was pulled to fix F3.
- Batch B (final file): reached **7 PASS in 11 attempts** (passes
  274 s, 300 s, 206 s, 369 s, 382 s, 303 s, 348 s; the 4 failures all
  `waitScene` threshold family — light 163.0 at scene B, light 159.1
  and 167.0 at scene B2, dark 101.0 at scene A under ACCUM) when a
  sandbox service restart wiped `/tmp` and the batch's logs with it.
  The tallies above were observed live in polling before the restart;
  the batch was restarted with durable logs rather than resting the
  proof on unlogged numbers.
- Batch C (final file, durable logs): **10 full-run PASSes (18 groups
  each) in 14 attempts.** Pass durations 136–319 s. The 4 failures are
  all the pre-existing `waitScene` threshold family in running-phase
  reads, none in any paused group: attempt 5, the scene-A boot read
  ("scene A never presented", 5 groups in, 309 s); attempts 6, 8, 12,
  the B2 light read at last luminance 164.9 / 152.6 / 116.7 vs the 170
  threshold (14 groups in — the entire main paused section already
  green in each). The threshold was left untouched, as in round 1.
  Across all three batches, no run of the round-2 protocol failed any
  paused-group assertion.
- Duration honesty (CI budget): the passes are slow under sandbox
  contention — batch B ran alongside another builder's manifest sweeps
  at 206–386 s per pass; batch C at 136–319 s; failures are inflated
  by `waitScene`'s 180 s timeout (up to 476 s). Every attempt
  terminated with a verdict; nothing hung. CI's selfcheck-browser
  should budget minutes for this suite.
- `npm run format:check`: clean. `npm run lint`: 0 errors (11
  warnings, the standing count). The diff remains the pin file only.
