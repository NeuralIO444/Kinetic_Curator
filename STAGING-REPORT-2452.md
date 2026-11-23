# STAGING REPORT — #2452 KINETIC heat (hitting K a lot changes more, not less)

Branch `feat/2452-kinetic-heat` on origin/main `dfbd9c6d` (Phase 3B merge, PR #2463).
Builder staging record — QA verifies against the tree, not this file.

## 1. The mechanism, verified on current main before building

Read from the tree at dfbd9c6d (not from the diagnosis):

- `app/src/panels/layout/kineticHeat.mjs` — the constants stood exactly as the issue's diagnosis
  states: TAP_MS 600, PER_TAP 0.34, HALF_LIFE 2000, CHAOS_HEAT 0.6. The router
  `routeKineticTapHeat(run, now, { chaos })` took the scope gate as an option; `nextKineticLayer`
  delegates to it (#2050 single-source detent).
- `app/src/panels/layout/KineticButton.jsx` — the only gate caller: `scopeChaos =
  scopeDecks(s.startupMode).chaos`, passed to both the router and the detent. The button publishes
  the tap's post-route heat via `publishShownHeat(r.heat)` BEFORE dispatching the pass.
- `app/src/state/kineticScope.mjs` — DECKS carried `chaos: false` at off/weak/med, `true` only at
  koz. Every other consumer of `scopeDecks()` reads `.looks` / `.voices` / `.pool` / `.launch`
  (verified by grep: layoutSlice, chapterWalk, creatureAdapter, useProjectAutosave, startupBoot) —
  the button was the sole `.chaos` reader.
- `app/src/state/kineticSweep.mjs` — `curatorPass(state, curator, rng, pick)`: candidates built with
  `mutateKey(k, lp[k], rng, NUDGE_SPREAD)` at the flat 0.08; index 0 is the standing piece (the keep).
- `app/src/state/slices/layoutSlice.js` — `kineticCuratorPass` called `curatorPass` with no heat.
  The honest heat channel already exists: `shownHeat()` (kineticHeat.mjs), the holder the button
  publishes to and davisSlice already reads in a store action for the keep bands (#1124).
- **The discovery the diagnosis did not carry:** `curator/refineMutate.js` `mutateKey` runs every
  spread through `clampSpread`, capped at `MAX_SPREAD = 0.2` — Matt's #1144 lock, set so a single
  mutation can never be a "jump" by phase.js's own definition (pinned by refineMutate.selfcheck).
  Any sweep-side spread above 0.2 is silently trimmed to 0.2 by the door.

## 2. The saved partial diff — audit outcome (hunk by hunk)

The Nov 22 partial (503 lines) was applied only after this audit; none of it was trusted on sight.

| File | Verdict |
|---|---|
| `app/package-lock.json` | DISCARDED — a `license: MIT` line from a local install; pure churn. |
| `kineticHeat.mjs` | KEPT — constants 1000 / 3500 / 0.5, gate retired from the router, comments honest. |
| `KineticButton.jsx` | KEPT — gate wiring removed; detent still derived from the router itself. |
| `layoutSlice.js` | KEPT — `curatorPass(..., { heat: shownHeat() })`; the same holder davisSlice reads. |
| `kineticSweep.mjs` | KEPT with one REWRITE — the spread machinery (below) is right; the hot constant is not (see §3). |
| `kineticSweep.selfcheck.mjs` | KEPT with the hot pin rewritten — incl. its necessary `.every((k) => nudgeFits(k))` fix (with the new two-arg `nudgeFits`, a bare `.every(nudgeFits)` would pass the array index as the spread). |
| `kineticHeat.selfcheck.mjs` | KEPT its additions (constants pin, decay re-pin, the 900 ms human-pace hammer test); COMPLETED by this build — the partial never re-pinned the #2050 detent section, which still asserted the retired gate (see §4). |

What the partial missed entirely, added by this build: the gate field's retirement in
`kineticScope.mjs`, the `kineticScope.selfcheck` re-pins, and the `topbarLegibility.selfcheck`
source-shape re-pins (it regex-pins the exact `{ chaos: scopeChaos }` call shapes).

## 3. The one deviation from the issue's recommended constants — flagged for Matt

The issue recommends the nudge spread scale "base 0.08 up to ~0.30 at full heat". **The build lands
the hot end at 0.20, not 0.30.** Reason, from §1: the mutation door trims every mutation to its
locked MAX_SPREAD of 0.2, so a 0.30 sweep cap would be an ask the door silently cuts — the cap the
curator weighs against and the selfcheck audits must state the true delivered number. 0.20 is still
2.5× the calm spread. Raising the door's own cap is a separate ruling (it defines what counts as a
"jump" in the refine phase); this PR does not touch it. `NUDGE_SPREAD_HOT = 0.2`, pinned in
kineticSweep.selfcheck with the reason quoted.

## 4. What was built

- **Heat constants** (kineticHeat.mjs): TAP_MS 600→1000, PER_TAP 0.34→0.5, HALF_LIFE 2000→3500.
  CHAOS_HEAT stays 0.6. A human-pace hammer (900 ms gaps — dead under the old window) now sweeps
  look → voice → chaos.
- **Breakthrough at every scope**: the router takes no scope gate; a 3rd+ tap at/above the CHAOS
  line breaks into the full re-roll wherever the START pill stands. The `chaos` field is removed
  from kineticScope's DECKS — the scope still sizes the decks (looks/voices/pool/launch untouched).
  The button drops its `scopeChaos` read; the detent derives from the router exactly as before
  (#2050 stands), so at full heat it honestly reads CHAOS at every scope.
- **Curator escalation** (kineticSweep.mjs): `nudgeSpreadForHeat(heat)` scales the nudge spread
  linearly, 0.08 calm → 0.20 at heat 1, threaded through `nudgeFits` / `nudgeWithinCap` /
  `nudgeableKeys` (all defaulting to the calm spread, so every other caller is unchanged). At the
  wider spread the coarse keys (zTiers, damping) lawfully join the nudgeable set — their smallest
  move fits the cap there; pinned in the suite.
- **No keep at/above the line**: `curatorPass` takes `{ heat }`; at heat ≥ KINETIC_CHAOS_HEAT a
  weighed keep is re-weighed among the nudged candidates alone, and a weighed nudge that rounds to
  no move falls through to the first candidate that moves. Nothing nudgeable is still a pass (there
  is nothing lawful to move). The store action reads the run's heat from `shownHeat()` — the button
  publishes the tap's post-route heat before dispatching, so the pass reads its own tap's heat.
  (Audited edge: the roll guard's immediate re-fire of the pass reads the standing published heat,
  which the cooling tick decays by <3% per 150 ms at the new half-life — an at-the-line re-fire
  could read a hair under the line. Accepted: the guard re-deals a dead frame, it is not a press.)
- Standing laws kept: sweep order unchanged; router pure and wall-clock-free; detent derives from
  the router; auto-repeat still ignored (useHotkeys untouched); replay/take behaviour unchanged.

## 5. Re-pins — each with the law that changed it

- `kineticHeat.selfcheck`: constants pinned at the new values (Matt's law, quoted in the suite);
  the `decayHeat(0.8, 10000) < 0.05` assertion re-derived from the 3500 ms half-life (0.8 ×
  0.5^(10000/3500) ≈ 0.11 — the old bound was a 2000 ms artifact); the #2050 grid drops its scope
  axis (the router takes no gate); the two "below KOZ → CUR, never CHAOS" detent assertions are now
  "→ CHAOS wherever the pill stands"; the pegged-run decay assertion at +1500 ms is now CHAOS
  (heat ≈ 0.74, still over the line — heat surviving a human pause is the point of the change),
  with a just-over-the-line run (0.68) keeping the step-down-to-CUR proof at the same instant.
- `kineticSweep.selfcheck`: "the cap is 3 × 8%" → "the CALM cap is 3 × 8%"; new §8 pins the
  heat-scaled spread, the no-keep law at heat 1 and at exactly the CHAOS line, and that hot nudges
  really break the calm cap while staying inside the hot one. The coarse-keys comment now reads
  "at the calm spread".
- `kineticScope.selfcheck`: the `[false, false, false, true]` chaos map is replaced by a pin that
  no deck carries a chaos gate; §3's "below KOZ: the curator holds" case is retired with the gate —
  the hammer table is now asserted once, for every scope; the closing line updated.
- `topbarLegibility.selfcheck`: three source-shape regexes lose the retired gate argument
  (`routeKineticTapHeat(run, now)`, `nextKineticLayer(runSnap, nowMs)`, the button's tap call).
  The single-source law they protect is unchanged.
- No other suite file was modified. No assertion was weakened: every re-pin asserts the NEW law at
  full strength (the breakthrough is asserted at every scope; the no-keep law is asserted over
  hundreds of seeded judges).

## 6. Verification

- Targeted suites, first pass: kineticHeat, kineticSweep, kineticScope, topbarLegibility,
  hitBands, startupChaos, refineMutate, expandLabel — 8/8 green.
- Dice discipline (the nudge/re-roll path rolls dice): **kineticSweep 20/20 runs, kineticScope
  20/20 runs**, kineticHeat 5/5 (deterministic arithmetic). Inside each sweep-suite run, §8 adds
  40 keep-demanding + 100 at-the-line + 200 hot-cap seeded trials; §2 adds 300 uniform-judge
  passes. No intermittent failure observed.
- `npm run lint`: 0 errors (11 warnings, all pre-existing, none in touched files).
- `npm run format:check`: clean (one file — kineticHeat.selfcheck — took a prettier pass; suite
  re-run green after).
- `npm run build`: green.
- **Full manifest sweep: 807 PASS / 3 FAIL over 810 real suites** (log: `sweep-2452.log` in this
  worktree). The 3 failures are the standing sandbox-environmental set with identical exit codes —
  swarmWasm (1), rollSafety (1), accum (134) — the same three, same codes, as the Phase 3B sweep
  on this branch's base lineage; none of the three suites is touched by or adjacent to this diff.
- One-writer files (liveLoop.mjs, liveResolve.mjs, particles.js): untouched.
- Not staged by the builder: a screenshot of the hot detent. The change is timing/feel; the
  coordinator's review lane presents visual evidence with the PR.
