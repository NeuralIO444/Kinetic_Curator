# STAGING REPORT — #1810: 128-grid sim, fewer solver iterations (local only, not pushed)

Builder staging record, branch `feat/1810-128-grid` in `~/workspace/kc-1810-build`, based on `origin/feat/1809-wet-frame` (PR #1842, in CI) as assigned — not pushed, no PR; the coordinator verifies, rebases after #1842 merges, and publishes. This file replaces the report that was at the worktree root (#1809 slice A's); that report remains in git history.

Issue (verbatim): **"WET: 128-grid sim, fewer solver iterations (measured cost gate)"**

## Premise verdict: HOLDS — built

Verified against the code with my own eyes before building: `VORTEX_GRID` was 64, `VORTEX_JACOBI` 30, `VORTEX_MAX` 2048, and the `gl/vortex` cost registration carried `timeMs: 0.5` under the module header's own admission — "the selfcheck budget, not a measured fact." No part of the sim already ran at 128; no recorded decision contradicts the move. Slice A's staging report named this slice's exact gates (real measurement of the field step, re-registration of the cost entry, the wetFrame golden re-pin) — all three are discharged below.

## What shipped (plain language)

The wet field — the water under the trails — now simulates on a 128×128 grid instead of 64×64, with 20 solver iterations instead of 30, and room for 4096 vortons instead of 2048. The water's *character* is unchanged, proven rather than asserted: on identical scripted input the total wetness the paper holds is the same within ~5%, the vorticity the flow carries is the same within ~18%, and the differences that do exist (broader drift a third weaker, sharp peaks a third stronger, the same water sitting in a quarter of the area) each have a named physical cause, written down in the evidence and pinned in a new selfcheck case so a future silent change fails loudly. The cost entry the governor reads is no longer an admitted guess: it carries a measured step cost (2.7 ms) with its provenance, replacing the placeholder 0.5.

## The measured cost gate (the acceptance)

Identical scripted sessions measured against the untouched base and the changed tree (probe preserved in `docs/review/1810/probe-grid64.json` / `probe-grid128.json`); median of 5 batches × 60 steps. **Sandbox numbers** — this VM, shared with the second builder lane throughout; indicative, not device claims.

| Load | 64 / 30 / 2048 | 128 / 20 / 4096 | Ratio |
| --- | --- | --- | --- |
| Scripted steady state (fed while timing) | 1.009 ms/step | 2.662 ms/step | 2.64× |
| Vorton cap filled and held | 1.075 ms/step (held 2046) | 2.719 ms/step (held 4094) | 2.53× |

The issue's cost model predicted ≈2.7× and its fallback order (iterations → cap → resolution) triggers only if the measurement *breaks* the budgeted envelope. The measurement lands **under** the prediction, so **no fallback step was applied** — iterations stay at the issue's 20, the cap at its named starting point 4096 (0.25 vortons/cell, inside the band the 64-grid tuning lived in). The registration's `timeMs` is now the measured filled-cap figure (2.7), `memoryBytes` recomputed by the registration's own formula at the new constants (393,216). What remains open, named honestly: the **#1695 device-harness measurement on Mac Studio + iPad-class hardware** cannot run from this sandbox and stays the later hardware gate (same class as #1719); the registration notes say so in the code.

## Field character — the conversions, explicit

Same scripted sessions, both grids (S0 = 120 frames, instances only, 720 vortons — saturates neither cap; S1 = 240 frames + ambient):

- **Total wet mass conserved**: Σwet 103.278 → 108.544 (S0, +5.1%); 144.140 → 148.234 (S1, +2.8%). A stamp deposits the same mass at any grid.
- **Per-cell mask means and threshold coverage drop ~4× BY RESOLUTION** (wetMean 0.0352 → 0.0090; coverage ≥0.05 0.212 → 0.050 in S1): the same water concentrated in ¼ the area — the 64-grid bilinear smear the issue names as the defect being fixed. Point semantics untouched: stamp amounts, clamp, dry factor, regime thresholds (damp 0.05 / wet 0.35 / soaked 0.8) are point values.
- **Velocity redistributes, finer**: mean speed −34% (S0) / −35% (S1) — 20 damped-Jacobi iterations transport low-frequency modes less far on a finer grid, the trade the issue's research names; p95 −16/−19%; max speed +36%; area-normalized ∫|ω| +16/+18% (near-vorton gradients now resolve instead of smearing).
- All of it is pinned as a character case in `vortex.selfcheck` against the recorded 64-grid reference, bands ≈1.5× the measured deviation with reasons in the case.

## Files (staged by name)

- `app/src/gl/vortex.mjs` — constants 128 / 20 / 4096 with the ruling + cap derivation in comments; cost registration re-based on the measurement (timeMs 2.7, memoryBytes at the new constants, provenance in notes); one stale comment ("64×64 field") corrected.
- `app/src/gl/vortex.selfcheck.mjs` — golden re-pinned (3932816161 → **2493009798**), Jacobi pin 30 → 20, grid/cap pins added; budget case re-based on the measurement (prints the gate, loose fail bound 6 ms); cost case pins the measured registration exactly; mask-advection case de-hardcoded from 64 to `state.n`; **new** field-character case (above).
- `app/src/gl/wetFrame.selfcheck.mjs` — final-frame golden re-pinned (2550213434 → **3108730517**, the re-pin slice A's report assigns to this issue); two degraded-service cases that hardcoded 64-grid cells now compute the cell from `stampWet`'s own mapping (same intent, any grid).
- `docs/WET_ENGINE.md` — surgical status note (resolution line in the header; the body still describes the pre-#1810 state, dated as such — slice A's convention).
- `docs/review/1810/` — README (premise, cost gate, character tables, re-pin ledger) + the probe JSONs + field stills: direct data renders of the same seeded 240-frame session at both grids (grayscale mask, false-colour speed). The live-look A/B is Matt's review-lane item per the issue's acceptance; the stills are the field data underneath it.
- `STAGING-REPORT.md` — this file.

No manifest change: no new selfcheck suite was added (the character case lives in the existing vortex suite).

## Verification (final bytes)

- **vortex.selfcheck: 20 checks passed** (19 + the new character case) — run twice, identical (the issue's byte-determinism acceptance; two runs of every probe session also hash-identical at both grids).
- **wetFrame.selfcheck: 11 checks passed** (twice); **wetFeed.selfcheck: 7 passed, unmodified**; **costTiers green**.
- **accum.selfcheck: OK (67 cases)** — solo, `NODE_OPTIONS=--max-old-space-size=3072` (this tree's base count; the suite passes unmodified — no ACCUM golden moved: the finer field changes no ACCUM pin, because the suite's wet cases pin the feed contract, not the field's bytes).
- **Gates: replayGate ✔ (exit 0), creatureGate ✔ (exit 0), refreshFixtureCheckpoints ✔.**
- **Full manifest sweep: 528 commands — 523 passed, 5 failed, all five triaged:**
  - `swarmWasm` — needs the Rust toolchain this sandbox lacks; environmental, CI authoritative.
  - `rollSafety` — sandbox-environmental pair member (imports fx/data/state only; never reaches the sim); CI authoritative.
  - `accum` in-sweep — default-heap OOM in its own log; solo at 3 GB green (above).
  - `livingMotion` — wall-clock floor vs its 2 ms budget, straddling the line with machine load on **both** trees (base branch: fail at 2.39 ms, passes on other runs; this branch: fail at 2.08/2.83/3.33 ms, pass at 15 checks on a quieter run). Base-identical load flake; both results reported; CI authoritative.
  - `grainFinish` in-sweep — headless-browser "framebuffer incomplete" under GPU contention (renderer.mjs untouched by this slice); **solo re-run: 4 checks passed**.
- `npm run build` green; `prettier --check .` green on the whole tree; `npm run lint`: 0 errors (11 warnings, none in touched files — same count as the base).

## Decisions worth the coordinator's eye

1. **Sandbox measurement, device gate deferred — deliberately.** The issue asks for the #1695 device harness on real hardware; that cannot run from this sandbox, and inventing device numbers would be fabrication. Following the slice-A report's own framing (its sandbox numbers "recorded as sandbox numbers only") and the house convention for CPU cost registrations (sandbox medians with provenance in the notes — cf. spectrumWarp, the #1694 creature costs), the registration now carries the honest sandbox measurement and names the device verification as pending in its notes. If the coordinator wants the PR held until a device run exists, the code change stands ready either way — but note the queue's hardware items (#1719) are Matt's-Mac runs.
2. **No fallback applied.** The trigger is a measurement breaking the envelope the issue budgeted (≈2.7×); the measurement came in under it (2.53–2.64×). Dropping iterations to 16 anyway would have traded field character for cost nobody measured a need for.
3. **The character bands are judgment, stated.** The selfcheck's equivalence bands (≈1.5× measured deviation) are wide enough to absorb the iteration trade the issue sanctions and narrow enough to catch a future halving/doubling of the field. The numbers and reasons are in the case and the evidence README for review.

## For the later WET slices (staged remainder)

- #1811 (pigment compartments) inherits the 128 grid as-is — "the compartments adopt whatever grid exists when they land."
- #1813 (wet look) reads the same regime thresholds; point semantics unchanged, so its contract is untouched.
- #1815 still owns removing the `vortex.mjs` live-only header (slice A left it; this slice leaves it too — exports still don't step the sim).
- The device-harness cost confirmation (#1695) joins the hardware-gated list alongside #1719.
