# STAGING REPORT — #1812: edge darkening on drying (local only, not pushed)

Builder staging record, branch `feat/1812-edge-darkening` in `~/workspace/kc-1812-build`, based on `origin/main` at 3aafc29d (#1811 merged) as assigned — not pushed, no PR; the coordinator verifies and publishes. This file replaces the report that was at the worktree root (#1811's); that report remains in git history.

Issue (verbatim): **"WET: edge darkening on drying (the signature, no state machine)"**

## Premise verdict: HOLDS — built

Verified against the code before writing anything. #1809's service (`app/src/gl/wetFrame.mjs`) owns the shared field; #1811 (merged, PR #1845) added the two pigment compartments to `app/src/gl/vortex.mjs` — suspended + deposited, Kubelka-Munk — with the deposited reflectance computed in `packPigmentDeposited` and consumed by ACCUM's fade. **No edge darkening existed anywhere**: `pigment` greps hit only `pigmentKM` and the #1811 files; nothing in the tree multiplies displayed density by a gradient term, and no drying-history channel existed. Matt's standing ruling for this slice (edge darkening ONLY, no drying state machine, 2026-10-27) matches the issue body exactly; no conflict, nothing already shipped. The premise holds, so the slice was built as specified.

## What shipped (plain language)

A dried wash now gets its dark rim — watercolor's signature — and it gets it the honest way: the field remembers how much each cell has dried at its edges, and the deposit reads darker there. Concretely: one new channel on the field state, `pigEdge`, holding each cell's **accrued darkening**. While the sim steps, a cell whose wetness is *falling through the damp band* (wetness 0.35 → 0.05 — the same thresholds the wet service already names its regimes by) accrues darkening in proportion to how steep its deposit's edge is right there and how much of the band it fell through. The accrual lands in the deposited layer's own pack (`packPigmentDeposited` computes reflectance at *displayed* density = deposited × (1 + accrued)), so every reader of the deposit — ACCUM's fade today, the #1813 wet-look pass and the backstage stain read when they read the pack — sees the rim. There is **no wet/drying/dry state machine**: no enum, no timers; the step compares two wetness numbers, that is all. Rewet a dried rim and dry it again and it darkens a little more, capped so cycles can't cook it black. The amount is a pinned recipe constant (`EDGE_DARKEN_K = 1.35`), not a panel slider, per the issue. Pigment that never wets, or a field with no pigment at all, is byte-identical to the #1811 build: both standing goldens hold un-re-pinned.

## The acceptance wash (by name)

Scripted single wash: blue disc, radius 6 cells, stamped wet at 1.0, settled by direct transfer, dried by steps until the field's max wetness fell below 0.04 (401 steps). From `docs/review/1812/probe.json`:

| read          | deposited | accrued | displayed |
| ------------- | --------- | ------- | --------- |
| centre        | 0.991     | 0.008   | 0.999     |
| rim (E/W/N/S) | ≈0.99     | ≈0.60   | ≈1.59     |

Displayed edge-to-centre ratio **1.586** — inside the issue's ~1.5–2× expectation; the centre's displayed density moved 0.8% (unchanged within tolerance). The same wash **kept wet for 300 steps accrues exactly zero** across the whole field — the gate is the mechanism, not an assumption, and the gate's other faces (level-in-band, rising, falls that never enter the band) are unit-pinned through the exported accrual. Rim accrual over five dry cycles: 0.596 → 1.194 → 1.792 → **2.000 (the cap)** → 2.000. `still-edge-darkening.png` renders displayed density as darkness, deposited alone vs with the accrued rim: the ring is visible, the centre is the same grey. (The ratio is read on displayed density because the pack's alpha clamps at 1 and this wash sits at that clamp; the rim's packed reflectance also darkens measurably — the selfcheck asserts a ≥10 summed-byte luminance drop at the rim against the accrual-zeroed pack, centre bytes within 1–2.)

## The measured cost gate

A/B on the #1811 cost session (4 scripted marks/frame, tint on every mark, ~56% of cells pigment-occupied; sandbox node on a shared VM — indicative, raw batches in `docs/review/1812/probe-cost.json`):

| Build        | Median ms/step (two runs) |
| ------------ | ------------------------- |
| base (#1811) | 3.87 / 3.71               |
| this (#1812) | 4.32 / 3.85               |

The stage (one wetness snapshot copy per pigment-live step + the gradient accrual over the pigment box) adds ~+0.3 ms/step — **inside the registered 6.6 ms figure**, which stands: it was measured on a busier VM (medians 6.93 / 6.28), and re-registering downward on a quieter machine would understate the governor's worst case. Memory registration grows honestly by the two new planes: 1,376,256 → **1,507,328** bytes (`128×128×4×9 + 128×128×16×3 + 4096×16×2`), pinned in the vortex cost case. The pigment-absent path never snapshots and never accrues.

## Degraded parity

Under the perf shed the service replaces the sim step with an in-place dry (one fixed factor per frame). The degraded path calls the same accrual with the previous wetness reconstructed from that factor, so **deposits darken on schedule under the shed** exactly as on the full path — pinned by a new wetFrame case (degraded frames stamp, settle, then dry through the band; accrued max > 0.05 and the darkened pack is what degraded service publishes). Darkening is local arithmetic like transfer, so it belongs under the shed with transfer, not frozen with advection.

## Files staged (named, nothing else)

- `app/src/gl/vortex.mjs` — `pigEdge` + `_wetPrev` on the state; `accrueEdgeDarkening` + `hashEdgeDarkening` exported; the stage wired into `stepVortex` after TransferPigment; display density in `packPigmentDeposited`; the four pinned constants; cost registration (memory + notes).
- `app/src/gl/vortex.selfcheck.mjs` — 6 new #1812 cases (34 total); the cost case's memory formula re-pinned ×7 → ×9 planes with the cause written in its comment. No golden re-pinned.
- `app/src/gl/wetFrame.mjs` — the degraded path accrues after transfer (one guarded addition).
- `app/src/gl/wetFrame.selfcheck.mjs` — 2 new #1812 cases (15 total): the band is the service's band (constants equal `WET_REGIMES` thresholds); degraded accrual.
- `docs/WET_ENGINE.md` — an "Edge darkening" status paragraph in the header block's house style.
- `docs/review/1812/` — README.md (design + decisions), probe.json (acceptance wash), probe-cost.json (A/B), still-edge-darkening.png.
- `STAGING-REPORT.md` — this file.

## Verification (sandbox, this VM)

- Solo suites: **vortex 34/34** (28 standing + 6 new; `hashVelocity` golden 2493009798 and all #1811 goldens un-re-pinned) · **wetFrame 15/15** (13 + 2; the Phase A byte-golden holds) · pigmentKM 7 · wetFeed 9 · costTiers OK · accum.inventory / accum.seam / accumGuard OK · **accum 83 cases OK** solo at `NODE_OPTIONS=--max-old-space-size=3072`.
- Full manifest, run in two parts around the environmental suites (531 commands): lines 1–258 green (868 [ok] lines) and lines 260–end green (907 [ok] lines, runner exit 0). New params: none — nothing entered `DEFAULT_LAYOUT_PARAMS` (no new params exist; the amount is a module constant).
- Source-shape pins: grepped the selfchecks for assertions naming every touched file — only the vortex and wetFrame suites reference `vortex.mjs`/`wetFrame.mjs` (as imports); both ran green. The full sweep covers the rest.
- Lint: 0 errors (11 warnings, all pre-existing in untouched component files). Prettier: clean on all four touched code files (one `--write` pass on the selfcheck).
- **Sandbox-environmental, base-identical (CI authoritative):** `npm run build` fails on clean `origin/main` in this sandbox with the same root cause (`@tauri-apps/api` unresolvable in the shared node_modules) — verified by building a scratch worktree at 3aafc29d; swarmWasm stops on the missing cargo/wasm toolchain; rollSafety fails identically on the base checkout and here (exit 1 at the same line, headless-GL "framebuffer incomplete"). In the first combined sweep run, accum was SIGKILLed while two browser suites ran concurrently against the same VM; solo it passes (above) — resource contention, not a failure of the code.

## Decisions taken inside the issue's latitude (flagged for the coordinator)

1. **The stage lives in the deposited pack, not the #1813 wet-look pass.** The issue names the deposited layer as the effect's home ("display density d′ = d × (1 + k·|∇d|)"); #1813 doesn't exist yet. One home in the pack serves the fade today and #1813 later — a second application site in #1813 would be the #1069 trap (a capability on one render path only). #1813's builder should read the pack as-is; noted in the review README.
2. **Band-proportional accrual.** The fall's contribution scales with the share of the damp band traversed, so a completed dry accrues exactly the issue's `k·|∇d|`. An all-or-nothing trigger was rejected on the numbers: the full path dries at 0.998/step, crossing the 0.30-wide band over ~140 steps — a trigger armed inside the band would fire at an arbitrary depth and the total would depend on frame sampling. Proportional accrual is sampling-independent and makes the degraded path (single-factor frames) consistent by construction.
3. **The wetness snapshot is scratch, not state.** `_wetPrev` is overwritten every pigment-live step and never exported as history; only the accrued `pigEdge` persists — that *is* the drying history the issue asks the state to carry, and it rides the existing export surface (plain data on the state object; `dishWet` and the held-frame carve-out untouched). Warm-up determinism is pinned by hash (`hashEdgeDarkening`) + byte-equal packs across two identical sessions.

## Hand-offs

- #1813 (wet-look pass): read the deposit pack — darkening is already in it. Do not re-apply a gradient term.
- #1814 (strata soak at the dish): the dish's stain read now includes darkened rims; nothing to wire.
- Feel: K = 1.35 is the issue's pinned starting constant. If Matt's eye wants a stronger or weaker rim on real renders, it is a one-line constant change with the selfcheck pin updated beside it — flagged, not tuned here.
