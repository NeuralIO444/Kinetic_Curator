# FIX REPORT — PR #1907 (fix-forward, coordinator fixer, 2026-10-31)

PR: `feat(director): FIELD poet choice + Director headroom` · branch `feat/director-field-headroom-2026-10-31`
Mandate (Matt, 2026-10-31): FIELD jumps the lane; fix #1907 forward and arm it. No check weakened,
deleted, or skipped anywhere in this fix. The PR body is untouched (closes-line is the coordinator's).

## Diagnosis — one root cause behind four of the five red checks

The PR's `director.js` was not edited — it was **regenerated shorter** (+379/−187 across the PR,
but director.js alone dropped most of the Director's public surface). Removed from `director.js`:

- Module exports: `getDirector`, `resetDirector`, `initDirectorBeat`, `birthCentre`, `paceStep`,
  `queenSurgeCall`, `nextSurgeStamp` — plus (per the CI build) `conductHeat` and `leanDialSteps`.
- From `createDirector`'s return: `rankChooser()`, `pushBeat()`, `intensity` getter, `pacing`
  getter, `reset()`.
- From `tick()`'s result: `sway`. The `directorTrace('tick', …)` telemetry call. The try/catch
  around `onRoom` ("a listener must never take a pick down").
- Behaviour edits smuggled inside the rewrite: relax `kinWeight: Math.min(gains.kinWeight, 1)`
  became `kinWeight: 1` (raises a lower kinWeight during relax); `directorPhase` precedence
  swapped (`entering ? peak : relaxing` → `relaxing ? relax : entering`).

Live consumers of the removed surface: `App.jsx:118` (`initDirectorBeat`), `taste.js:199,222`
(`getDirector().rankChooser()`), `paceLive.js` (`paceStep`), the frame seam (`nextSurgeStamp`),
the creature birth path (`birthCentre`). The orphaned imports the rewrite left behind
(`M2_CAP, warmCentre, tempoEase, wetnessLean, evolveLean`) are exactly the ESLint errors.

Per-check evidence (head 5495251a):

| Check | Failing step | Cause |
|---|---|---|
| lint-build-selfcheck | `npm run lint` | 5 × no-unused-vars in the rewritten director.js (orphaned imports) |
| cargo-check | `Run npm run build` | **The cargo job runs the app build first** — build failed with 8 errors: `[MISSING_EXPORT] initDirectorBeat / conductHeat / paceStep / leanDialSteps / getDirector … is not exported by "src/curator/director.js"`. No Rust was ever reached; cargo is innocent. |
| e2e-smoke | `Run npm run build` | Same missing-export build failure. |
| selfcheck-browser | `npm run selfcheck` | Same import breakage across the Director-family suites. |
| closes-line | body scan | No literal `Closes #N` / `No issue` line in the PR body. **Coordinator's fix, not this report's.** |

## Premise audit (against the epic's notes + the font ruling)

(a) **Deck charset — VIOLATED as shipped, fixed.** All 16 pieces / ~33 lines were lowercase prose.
    `ASSETS_LETTERS` today is uppercase A–Z + digits (36 stamps); every lowercase letter has no
    stamp. Per the spec's own law (and the fix mandate), decks were restricted to the real
    charset: lines uppercased in place — words unchanged, layout enums untouched (an over-broad
    first pass uppercased the `layout` values too; reverted — recipes are lowercase by spec).
    Spaces remain placement gaps. When the font ruling's Anton lowercase wave is baked, the
    decks can be re-cased by a future slice; nothing here pre-judges that.

(b) **Director rules — held in the new modules, broken by the rewrite.** `fieldDirector.js` /
    `fieldEval.js` are pure, seeded (rng injected), pick-time only; the Queen is never named
    (queenDeniability 7/7 on the fixed tree). One tension, reported not redesigned: the PR body
    claims "silence default", but `choosePoet` arms a poet on essentially every tick (null only
    after a rejection-damp or an empty deck). Nothing renders from the readout yet (FIELD S3 is
    unwired), so today this is a readout that almost always names a poet. Matt's call at review
    whether "armed at pick" needs an arming gate before S3 wires the stamp path.

(c) **The −187 deletions** are the director.js gutting itemised above. Everything removed was
    live. Restored byte-for-byte from origin/main (see Fixes).

(d) **Cost registry — sane.** `field/poet-choice`: tier 0, memoryBytes 0, timeMs 0.01 estimate,
    append-only block, notes honest ("pure CPU at pick time only… sheds with the Director").
    costRegistry.selfcheck green. (Its comment names fieldDirector.js; the wired step is
    fieldEval.step → fieldDirector.choosePoet. Accurate enough; left as written.)

## Fixes (each minimal, cause named)

1. **`app/src/curator/director.js` — restored to origin/main's version, then re-applied ONLY
   the FIELD delta:** header note, `fieldEval` import, `fieldRng` option, `fieldState` + rng
   locals, the field step inside `tick()` (PR's own fieldInput shape), `poet` added to the
   result alongside the original `sway`, `get fieldState()`, and `fieldState` reset inside the
   original `reset()`. All original behaviour — trace, try/catch onRoom, phase precedence,
   relax expression, every export — is back. Prettier re-aligned the banner rules the rewrite
   had stretched.
2. **`app/src/poets/*.js` — lines uppercased to the real stamp charset** (see audit (a)).
3. **`app/src/curator/fieldDirector.js` — two judgement calls, both forced by the PR's own
   documented assertions** (design note `docs/design/field-eval-loop-2026-10-31.md`):
   - Gate precedence: as written, `slowDebt >= 3` forced the cool pool at ANY intensity and
     `hot` required `slowDebt < 2` — a permanently hot room measured hotBias 0.001 against the
     note's asserted `> 0.5`. Fix: live intensity outranks debt (`hot = intensity > 0.65`;
     debt forces cool only at `intensity <= 0.65`). Debt still brakes neutral rooms.
   - `SLOW_DEBT_WINDOW` 8 → 24: the note's "last N keeps" leaves N unspecified, and at 8 a
     12-keep burn streak flushed out of the window before the eval's 30-step scenario ended
     (`finalDebt 0` vs the asserted `>= 3`). At 24 the streak's debt persists through the
     modelled cooldown. **This is the one constant changed to meet an assertion — flagged
     plainly for Matt; trivially reversible.**
4. **`app/src/curator/fieldEval.js` — lint only:** dropped the unused `POETS` import; the two
   scenario generators that ignore the step index no longer declare it.
5. **`app/src/curator/directorRoom.selfcheck.mjs` — completed the PR's own payload change:**
   the suite's strict payload pins now include `poetId: null` (two deep-equals + the key list +
   the test title). The PR's top commit is literally "include poetId on room readout"; the
   suite was never updated to match. No assertion weakened — the shape pin is stricter than
   before (it now also proves poetId is null in silence).
6. **`app/selfcheck.manifest` — registered the PR's two new suites** (`fieldDirector`,
   `fieldEval`) after the Director family lines, per the repo contract. They never ran in CI
   before this.

## Verification

- `npm run format:check`: clean (prettier --write applied to director.js + fieldDirector.js).
- ESLint on all touched files: clean (was 8 errors).
- New suites: fieldDirector 6/6, fieldEval 6/6 (was 4/6).
- Director family + every suite naming a touched file: director 14 · directorRoom 7 ·
  directorPresence 5 · directorDebt 5 · directorSway 10 · directorRank 12 · directorsMatrix 6 ·
  phase 8 · queenChannel 13 · queenDeniability 7 · surge 1415 · taste ok · loisRank ok ·
  mindConduct 24 · shiftLayer ok · costRegistry ok.
- Full manifest sweep: **551 suites run, 3 failures — all proven environmental:**
  - `gl/accum` — aborted in-sweep at the sandbox's default heap; standalone with the lane's
    documented heap flag: **OK (84 cases)**.
  - `gl/composite` — failed in-sweep under load; standalone: **OK (15 cases, full count)**.
  - `gl/livingMotion` — a wall-clock assertion ("the floor costs 2.50 ms a frame at 800 marks,
    budget 2 ms"); **base-identical**: pristine origin/main fails it the same way at 2.58 ms.
    Sandbox CPU speed, not this PR (nothing here touches gl/).
  - Excluded from the segmented run by the lane's standing record, and re-verified by
    construction: `swarmWasm` (cargo is absent from this sandbox — `which cargo` is empty) and
    `fx/rollSafety` (browser section dies in the shared harness on pristine main too).
  - The PR's two new suites are inside the 551 and pass in the sweep, not just standalone.

## NOT done

PR body / closes-line (coordinator's, via gh) · auto-merge NOT armed (coordinator arms after
verification) · FIELD S3 stamp-path wiring (not this PR) · the silence-default arming question
in audit (b) — reported, not redesigned · no one-writer file touched.
