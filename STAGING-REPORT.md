# STAGING REPORT — #1811: two-compartment pigment with Kubelka-Munk mixing (local only, not pushed)

Builder staging record, branch `feat/1811-pigment` in `~/workspace/kc-1811-build`, based on `origin/feat/1810-128-grid` (PR #1844, in CI) as assigned — not pushed, no PR; the coordinator verifies, rebases after #1844 merges, and publishes. This file replaces the report that was at the worktree root (#1810's); that report remains in git history.

Issue (verbatim): **"WET: two-compartment pigment with Kubelka-Munk mixing"**

## Premise verdict: HOLDS — built

Verified against the code and history with my own eyes before building. The field had **no pigment at all**: `vortex.mjs` carried omega, psi, vx, vy, wet + vortons, and its header deferred this exact work ("pigment mixing itself is slice 5 and is not in this module"). The tree's only "Kubelka" was a comment in `accum.mjs` naming what its wet composite colour average is **not** ("cheap pigment mix. Not Kubelka-Munk") — a display-side blend of the over pass, not a field representation; the other "pigment" in the tree (`dishPigment.mjs`, census/bioDrives) is creature colour, a different system. #1809's review README stages the compartments for this issue ("the compartments will live in this service's field"). No recorded decision contradicts the issue. The premise holds, so the slice was built as specified.

## What shipped (plain language)

The wet field now carries colour. Every cell holds two pigment compartments: **suspended** pigment, which rides the water and can lift back off the paper when rewetted, and **deposited** pigment, which has settled into the paper and never moves sideways again. When two colours meet — in a stamp or in a settled cell — they mix by **Kubelka-Munk**, the paint physics the issue names: blue and yellow make a living green, not the grey a plain average gives, and dark mixtures darken the way real paint does. The issue's named mixture test passes in the colour module, in the field itself, and is visible in a still rendered from the field's own data. ACCUM is the first reader, exactly as the issue assigns: its fade now dims the buffer's light by the **deposited layer's KM-computed reflectance** (not a Beer-Lambert fudge), while the dish's physics never touches pigment — grip stays water; the deposited pack doubles as the backstage stain read. A scene with no coloured marks has no pigment at all and steps **byte-identically** to the pre-pigment field: both standing goldens hold unre-pinned.

## The mixture test (acceptance, by name)

Blue (0.10, 0.25, 0.85) + yellow (0.95, 0.80, 0.10) at equal concentration, from `docs/review/1811/probe.json`:

|                          | R     | G         | B     |
| ------------------------ | ----- | --------- | ----- |
| Kubelka-Munk (this code) | 0.165 | **0.560** | 0.253 |
| naive RGB average        | 0.525 | 0.525     | 0.475 |

`pigmentKM.selfcheck` check 3 asserts the green band (g > r + 0.25, g > b + 0.2, saturation ≥ 3× the naive mix's) — **a density-averaging or lerp implementation fails it by construction**, which is the discriminating case the build rules demand. In the field, two stamped wash discs settle to a deposited pack whose overlap samples **(0.161, 0.518, 0.251)** — green — between blue-only (0.102, 0.247, 0.863) and yellow-only (0.988, 0.800, 0.098); the still in `docs/review/1811/` is rendered from those pack bytes. Subtractive darkening is pinned too (blue + red lands darker than either input), as is concentration steering (25/75 and 75/25 land on either side of the 50/50 green).

## The measured cost gate

Identical scripted sessions, pigment absent vs pigment live, sandbox node (this VM, shared with the second builder — indicative, not device claims; raw batches in `docs/review/1811/probe-cost.json`):

| Session                                    | Median of batch medians (two runs) |
| ------------------------------------------ | ---------------------------------- |
| Pigment absent (the #1810 path, untouched) | 2.12 / 2.52 ms per step            |
| Pigment live (~58 % of cells occupied)     | 6.93 / 6.28 ms per step            |

The registration follows the #1810 convention — the sim's worst case is the registered figure: **`gl/vortex` timeMs 2.7 → 6.6**, provenance in the notes. Memory re-registered at **1,376,256 B** with the full ledger written out (7 grid planes + 3 pigment RGBA arrays + vorton ring and scratch); note the old formula undercounted even the pre-#1811 state (it omitted the wet plane pair and the scratch) — the correction is called out in the registration comment and the selfcheck pin. The compartments proper are the issue's own figure: 2 × 128² × 16 B = 0.5 MB (the third array is the advection scratch). Per-step pigment work is bounded by the occupied region's bounding box, and pigment-free sessions run the pre-pigment path untouched — they pay nothing. Device confirmation stays with the #1695 harness, as #1810 already recorded.

## Field character (pinned sessions, measured — all in `docs/review/1811/`)

- **Conservation**: one 2.0 stamp, no flow, 600 steps → total 2.0 → 2.0000004 (drift 0.00002 %); suspended empties into the deposit. Transfer computes both moves from start values and applies them together — per-cell conservation is by construction, the number is the float residue.
- **Deposited never moves**: centroid drift **0.005 cells** over 600 steps of hard stirring 650 px away. There is no advection path for the deposited array at all; the residue is lift-and-resettle at the deposit's own edge.
- **Suspended rides the flow**: a burst in an established vortex displaces **12.76 cells** in 40 steps vs 0.011 unstirred — the A/B is a selfcheck case.
- **Lift**: a settled deposit rewetted hard for 120 frames loses **52 %** of its mass back into suspension (lift ∝ wetness² × (1 − stain resistance)).
- **Determinism**: identical tinted sessions hash-identical compartments (`hashPigment`); freeze holds pigment; the degraded shed path stamps and keeps settling pigment, publishing the same pack shape.

## Files (staged by name)

- `app/src/gl/pigmentKM.mjs` — **new.** Pure Kubelka-Munk: 8-band spectra derived deterministically from sRGB (per-band-normalized R/G/B basis, so white/greys reconstruct exactly), single-pigment K/S inversion, finite-layer mixture reflectance over a paper backing, and per-pigment ρ/ω/γ from the same derivation via pinned heuristics; cached per colour with an allocation-free hot path.
- `app/src/gl/pigmentKM.selfcheck.mjs` — **new, manifest-wired.** 7 checks incl. the mixture test by name and the anti-lerp discriminating assertions.
- `app/src/gl/vortex.mjs` — the two compartments + scratch; `stampPigment` (ADD; a stamp onto another colour stores the KM mixture's colour); MovePigment (semi-Lagrangian, occupied-box bounded, early-out when pigment/flow absent); `transferPigment` exported for the degraded path; `emitFromInstances` stamps a mark's `rgb`/`tint`; `noteWetFrame` publishes `pigStep`/`pigDep`; `hashPigment`, `packPigmentDeposited`; cost registration re-based (above); header's Curtis sentence updated (the live-only paragraph stays — #1815 owns retiring it).
- `app/src/gl/vortex.selfcheck.mjs` — 8 new cases (absent-identity, stamping forms, field mixture green, conservation, deposited-stationary/suspended-advects A/B, lift, freeze + determinism, pack semantics) + the cost pin re-based on the new measurement with the cause written in the case. **No golden re-pinned.**
- `app/src/gl/wetFrame.mjs` — service contract documents `pigStep`/`pigDep`; the shed/absent shapes carry them; the degraded path runs the transfer and publishes the pack.
- `app/src/gl/wetFrame.selfcheck.mjs` — 2 new cases (service publication incl. byte-equality with the direct path; degraded stamping + settling). The Phase A byte-identity golden case is untouched and green.
- `app/src/gl/accum.mjs` — `FADE_PIG_FS` (exported): the wet fade string-derived with one added term, `rgb *= deposited KM reflectance`, exactly as the other wet variants derive; recipe params carry `pigStep`/`pigDep` with the wet gate discipline; mirror term identical; the pigment pack gets a linear texture beside the wet pair; `ACCUM_PROGRAMS` and the cost list are unchanged (wet variants were never in them).
- `app/src/gl/wetFeed.selfcheck.mjs` — 2 new cases (variant gating/source shape; mirror absorption vs a no-pig control, bare-paper pack byte-exact no-op).
- `app/src/gl/liveLoop.mjs` — two keys (`pigStep`, `pigDep`) passed from the wet frame result into the recipe params at the existing call — the issue's consumer wiring, nothing else.
- `app/selfcheck.manifest` — one line: `node src/gl/pigmentKM.selfcheck.mjs` (after the vortex line). package.json untouched.
- `docs/WET_ENGINE.md` — surgical status note (pigment paragraph in the header block, house style).
- `docs/review/1811/` — README (premise, design, mixture tables, character, cost, simplifications, hand-offs) + `probe.json` + `probe-cost.json` + `still-deposited-reflectance.png` (rendered from the pack bytes).
- `STAGING-REPORT.md` — this file.

## Verification (final bytes)

- **pigmentKM.selfcheck: 7 checks passed** — the new suite, incl. the mixture test by name.
- **vortex.selfcheck: 28 checks passed** (20 standing + 8 new). Both standing goldens hold **unre-pinned**: hashVelocity 2493009798 and every wet character case pass on the changed tree — the pigment-absent path is the pre-pigment code path, not a re-tuned one.
- **wetFrame.selfcheck: 13 checks passed** (11 + 2 new); the Phase A final-frame golden (3108730517) and the byte-identity case are untouched and green.
- **wetFeed.selfcheck: 9 checks passed** (7 + 2 new).
- **accum.selfcheck: OK (67 cases)** — solo, `NODE_OPTIONS=--max-old-space-size=3072`, run on the final bytes (this tree's base count; no ACCUM golden moved — the pigment fade variant is additive and gated off unless the field publishes pigment).
- **Neighbours green**: costTiers, accum.inventory, accum.seam, accumGuard, debug (105 cases).
- **Gates: replayGate ✔ (exit 0), creatureGate ✔ (exit 0), refreshFixtureCheckpoints ✔.**
- **Full manifest sweep: 531 commands — 528 passed, 3 failed, all three triaged:**
  - `swarmWasm` — needs the Rust toolchain this sandbox lacks; environmental, recorded identically on the #1810 sweep of the base stack; CI authoritative.
  - `rollSafety` — fails inside the headless-GL parity driver (`glDriver renderViaGL` ← candidate ← rollSafety:231); the suite imports fx/data/state only and never reaches the wet sim. **Solo re-run fails identically** (same stack, same empty driver log) — it is the sandbox GL environment, not load; CI authoritative.
  - `accum` in-sweep — default-heap OOM, the FATAL heap signature in its sweep log; solo at 3 GB green (above). Documented in-sweep behaviour on this stack.
  - Note: `trailStats.selfcheck` does not exist on this base — it landed on main via #1807 after this WET stack forked; the trail suites that do exist here (dishTrails, trailGrid, trailMode) all pass. The coordinator's rebase onto main composes it; nothing in this slice touches trail statistics.
- `npm run build` green; `npm run lint`: 0 errors (11 warnings — the base's count; none in touched files); `prettier --check .` green on the whole tree.
- One process note: this sandbox restarted mid-verification and ate the first sweep's bookkeeping (213/214 recorded at that point, incl. the same swarmWasm failure); the tally above is from a single complete re-run kept outside `/tmp`. The worktree itself was untouched by the restart (verified by `git status`).

## Decisions worth the coordinator's eye

1. **Water stamping left as-is (ADD + clamp), though the issue's asymmetry line says "water blends MAX."** The issue's own acceptance (4) requires a pigment-free field's wet outputs byte-identical to the pre-pigment service — changing the water blend rewrites every wet golden and the mass character #1809/#1810 pinned, in a slice whose subject is pigment. The asymmetry the slice _does_ implement is the load-bearing half: pigment blends ADD (and mixes by KM), which no existing behaviour had. If Matt wants water-MAX as its own change, it belongs in a slice that owns the re-pins.
2. **A cell holds one colour — the mixture's — not a per-pigment concentration vector.** Storing concentrations per pigment per cell is unbounded state; the compartment instead stores the mixture's colour + total density, and every reported colour derives from that by the same KM law (a mixture's stored colour re-derives constants spectrally identical to the blend's — the round-trip is pinned). Named in the evidence README as the slice's Curtis-lite simplification, alongside linear resampling under advection. #1812/#1813 read deposited density and reflectance, both served exactly.
3. **Registration carries the pigment-live worst case for all sessions.** The governor's model has one number per effect; a pigment-free session is governed as if pigment were live (6.6 ms). That is the #1810 filled-cap convention applied consistently, and the notes in the registration carry both figures so the trade is visible.
4. **Warm-up export acceptance is pinned at field level only.** #1815 has not landed; identical-session compartment hashes are the half this slice can prove. The export-level half and the vortex header's live-only paragraph are #1815's, per its text.
5. **`liveLoop.mjs` is a one-writer file (repo AGENTS.md) and the second builder is live in another worktree.** My edit there is the two-key pass-through the issue's consumer wiring requires, at the existing wet call; no other live-loop behaviour is touched. Flagging because the coordinator sequences the publishes.

## For the later WET slices (staged remainder)

- **#1812** (edge darkening) builds on the deposited layer: `pigD` density + its gradient are in the field, and the pack's alpha is the same density at publication. The accrued-darkening channel is that slice's to add.
- **#1813** (wet-look) consumes deposited reflectance — the pack's rgb is computed for exactly this and currently also feeds ACCUM's absorption.
- **#1815** (warm-up exports) inherits field-level determinism (`hashPigment` over identical sessions) and owns the export path + the live-only header.
- Dish backstage: the frame result now carries the deposit pack where backstage field views read; no dish code changed and none should — the issue's exclusion is deliberate (grip is water, not colour).
