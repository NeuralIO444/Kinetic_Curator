# STAGING REPORT — #2158: energy read by fullness (persona-interface program #2461, slice 1)

**Branch:** `feat/2158-energy-fullness` on origin/main `214d3763` · **Lane:** review (feel) — Matt merges.

## What changed and why

The ruling of record (Matt, 2026-11-12, on the source issue 2069, quoted verbatim in the build issue):
the energy level stops being a plain mean of loudness — a track reads **low** when the sound is *sparse*
(few bands active, lots of space) even when its notes are clear and present; fullness decides. The
diagnosis it answers (the reach diagnosis on the source issue 2075, live session 2026-11-12): the energy
read never reached LOW in real play — quiet, sparse tracks sat at mid — so the LOW preset table was
unreachable and could not be tuned by ear.

**Files (2):**

- `app/src/gl/audioEvents.mjs` — the detector's energy classification now runs on a **fullness** read.
  Per frame, each band contributes its *presence*, `sqrt(level)`: a quiet band still counts, a loud band
  saturates, so a few clear notes cannot stand in for a full spectrum. The presence mean is smoothed with
  the same EMA and driven through the unchanged hysteresis state machine. The gates moved to fullness
  units at **sqrt of the retired loudness gates** (0.12 → 0.35, 0.40 → 0.63), so on a uniform,
  full-spectrum signal the read crosses at the same loudness it always did — only sparse material moves,
  down to low. The plain loudness mean is **gone from the energy path**; it survives only as the silence
  lane's quiet test, which was never the energy read and is byte-unchanged in behaviour.
- `app/src/gl/audioEvents.selfcheck.mjs` — three new tests pin the ruling (below). No existing test was
  changed; the pre-existing flat-feed energy test passes untouched, because flat signals are the
  degenerate case where fullness and loudness agree in order.

**Untouched, per the issue's scope:** the preset tables and their values, every other gate (engagement
tier, route caps, phrase ledger), the onset/tempo/silence/input lanes, and the one-writer files
(`liveLoop.mjs`, `liveResolve.mjs`, `particles.js` — none approached). Option B (lowering the low
threshold) was declined by the ruling and is not implemented.

## The new tests (each quotes its law)

1. *A sparse track with clear notes reads low, though its loudness mean is mid* — two bands carry clear
   notes (mids 0.55, edge 0.40), the rest at floor; the fixture first asserts its loudness mean (0.157)
   exceeds the retired 0.12 low gate, proving it is the ruling's exact case, then asserts the read is
   `low` and stays low.
2. *A bass-heavy track never reads low — the 2026-11-10 misread stays dead* — a loud bass-heavy shape
   (sub 0.95 / bass 0.90 / mud 0.55) and the quiet bass-heavy shape of the 2026-11-10 session (loudness
   mean ~0.30) both settle at `mid` after warm-up and never fall back to low.
3. *When a sparse track fills up, the read climbs* — sparse for 2 s, then the same material over a broad
   moderate bed: `low → mid`; and a loud full-spectrum shape still reads `high`.

## Verification

- **Targeted suites:** `audioEvents.selfcheck` **12/12** (9 pre-existing + 3 new); `audioBus.selfcheck`
  **3/3** unchanged (it drives the real detector over the bus).
- **Lint:** 0 errors (11 warnings, all pre-existing, none in the touched files). **Format:** clean
  (`prettier --write` applied to the one new selfcheck file, then `format:check` green; suite re-run
  after formatting, still 12/12). **Build:** green.
- **Full manifest sweep** (continue-on-error, log at `sweep-2158.log` in the worktree root):
  **812 PASS / 3 FAIL over 815 real suites, 0 missing.** The 3 failures are the standing
  sandbox-environmental set — swarmWasm FAIL(1), rollSafety FAIL(1), accum FAIL(134) — **A/B-confirmed
  against pristine origin/main** (git archive of `origin/main`, same node_modules): all three fail on
  base too (exits 1 / 1 / 1), and none of the three imports `audioEvents`.
- **Mechanism probe** (scratch, pre-pinning): sparse mean-0.157 shape → `["low"]`; bass-heavy loud →
  settles `mid`; bass-heavy quiet (mean 0.304) → settles `mid`; full loud → `high`; sparse→broad →
  `low → mid`; jitter at the high gate → zero energy events (no flicker).

## Notes for QA

- The detector's only consumer is `audioLive.js`; the bus payload shape (`{ level: 'low'|'mid'|'high' }`)
  is unchanged, so `mindConduct`'s preset tables consume the corrected read with no code change — which
  is the point of the slice: the LOW table becomes reachable in normal play.
- The sweep wrapper was killed by the sandbox three times (SIGTERM/OOM); the sweep was completed in
  chunks with per-suite PASS/FAIL lines appended to the same log, and the tally above was computed by
  matching every manifest command against the log (0 missing), not by trusting running counters.
