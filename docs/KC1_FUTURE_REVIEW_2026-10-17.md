# Review of KC-1-future.md — Ember, 2026-10-17

**Disposition: DEFERRED** (Matt's word, 2026-10-17). The doc parks as horizon
material beside MegaMind. The ratified roadmap (pinned issue #1647) stays the
plan of record. Source file: an external roadmap doc supplied by Matt on 2026-10-17 (its own
header: "main d970c3f, 2026-10-17").

## The headline problem: its "today" is this morning

The doc was drawn from main at `d970c3f` — S2's merge, Oct 17 09:30 PT. By the
time it arrived, main was `1b638001` and the map no longer matched the ground:

| Doc says | Reality (verified 2026-10-17) |
|---|---|
| M0 Unblock: #1629/#1630 land; rulings on #1573, MegaMind, #1460, #1483, #1597 (~1 wk) | **All done Oct 16.** #1632 merged (CHIAROSCURO), #1633 merged (unlock tree); all five rulings recorded on their issues. |
| M1 Close finished (~1 wk) | Near-done: #1461/#1465 closed, #1460 closed and its residue #1640 **shipped**, #1483 status recorded, #1578 automation staged complete. Open residue = hardware only: #1312 iPad run + Matt's one-command Studio run. |
| M3 Creature MVP: S3 feathers, S4 engraving, S5 poses + #1595–#1597 (4–6 wks) | **Fully merged.** PRs #1648–#1650 (dish D1–D3), #1656 (S3), #1657 (S4), #1658 (S5). The doc budgets 4–6 weeks for shipped work. |
| Cut from v1: robot, L-system, glitch (S6–S8) | **Opposite of the ratified Phase 2**, which locks all four types. S6 (robot) was mid-publish when the doc arrived; S7/S8 are staged. Its H1 "zoo — robot, L-system and glitch as rules files" is literally S6–S8's design. The doc's horizon lags the build order by a full phase. |

## Repo claims — checked against the tree (kc-s6-publish = current main)

- ✅ `studio/curator.py` + `app/src/curator/tasteHead.js`: real; the offline-train / app-walks pattern is as described.
- ✅ `rust/kc-fields`, `rust/kc-neighbor`, `rust/swarm-bake`: real.
- ✅ `lois/` exists (README + fixtures); `docs/NEXTGEN_SPEC.md` exists; `studio/audio_envelope.py` exists.
- ⚠️ **SigLIP goldens:** `app/scripts/checkSemanticGoldens.mjs` exists, but it is **not** wired into `.github/workflows/` or `app/selfcheck.manifest` — "CI checks renders against them" overstates it; it's a script, not a gate. `mlx_artifacts/` in-tree holds only a README — no embeddings or `cost_model.json` in the repo.
- ⚠️ **"Ridge cost model that predicts shader cost":** off. The cost head (#1578) is an **XGBoost quantile** model (τ≈0.9 on log-ms); ridge is one of the *baselines* the replay judge must beat, not the shipped model. No trained model ships until Matt's Studio run produces real labels.

## Where the doc independently lands on the existing plan (no action — confirmation)

- **M2 Determinism hardening = the audit pause, already ordered** after the S stack: the same 7 leaks named (createGrid, markovPick, quadtreeSignal, lifecycle Date.now, liveLoop swell, harmony/taste/renderProfiles RNG defaults), the same ESLint rule, the same uniform caching in renderer.mjs.
- **M4 Guardrails = P3 as ratified:** #1534 → CI replay gate (#1638), device budgets from the #1622 harness + costRegistry (#1639), determinism lint (#1637).
- **M5 splits:** liveLoop.mjs / renderer.mjs splits are already in the audit's break-up list.
- **M6 v1 RC** (thermal run, golden seeds, Tauri signing) is the doc's only genuinely new block — and it's a release-phase concern, correctly placed after everything above. Deferred with the rest.

## Woven into the current build order (the only changes)

Zero new scope; these name patterns for work already ordered:

1. **ECS + typed-array SoA** is the split pattern for `particles.js` in the audit pause (the audit already lists the 1,880-line class for break-up and flags its plain JS arrays as untyped). The doc's ECS section is the design note for that split.
2. **Frame graph** — formalising renderer.mjs's passes as declared nodes rides along with its audit split; helps budget registration.
3. **Prettier** — the audit's standards section already flags "no Prettier config"; M5 repeats it. Folded into the pause's standards items.
4. **FABRIK** — recorded as a technique *candidate* for #1634 (dish family), whose standing ruling is "markers choose where, dish pressure decides whether/how much a limb grows." FABRIK is a candidate for how a grown limb reaches its contact. Candidate, not commitment.

## Explicitly deferred (not woven)

- The v1 reframe itself, and its moth-only cut (contradicts the Phase 2 lock).
- All six new personas (Lumen, Ledger, Warden, Maestro, Crit, Atlas) — new additions under the freeze; Crit is parked behind #954 by the doc's own note.
- Photo mode, WebCodecs export, replay ghosts, MAP-Elites seed atlas, seed gallery.
- **Bayesian tuning of the 0.28/0.72 band edges** — the edges are settled law in `curator/stress.js` (#1636); retuning them is a ruling change, not a weave-in. FRIC_MAX is a feel constant under Matt's eye.
- GGPO duets, Warden/boids populations, wave-function collapse, Noita sand (seeding createGrid is audit leak #1; the sand substrate itself is future), roguelike runs, lineage legends, WebGPU/ONNX determinism programme (#1298 stays parked).

## Bottom line

A decent map of a country we've already crossed a third of. Its determinism
and guardrails chapters independently confirm the current order; its creature
chapters describe last week's work as next month's. Park it; the one thing in
it the current order didn't already have — a signed release candidate with a
thermal run and a golden seed gallery — is waiting at the end of Phase 3
either way.
