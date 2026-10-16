# STAGING REPORT — #1538: Dish — the missing TEMPO and DENSITY rows

Branch `ember/1538-tempo-density` (base main fd58ba5c). Local commits only — no push, no PR.

## What was built

The petri spec §4 promised two dish inputs no stage (A1–C4) ever wired. Both are now wired through the same parameter pipeline every other dish input uses — no parallel path:

- **TEMPO = thermal energy.** A new layout param `dishTempo` (0..1, default 0) resolves in the integrator to a Brownian jitter amplitude: every body in the dish takes a small deterministic velocity kick each step. Hot dish never settles; cold dish stills.
- **DENSITY = crowding pressure.** The existing `density` layout param (10..100, default 78) now also drives the contact repel gain in the dish path: gain = density / 78. Its placement meaning is untouched — the param census still measures it there; it simply gains its §4 dish meaning beside it.

## How each knob reaches the sim (the write path)

Both knobs travel the exact path the panel already writes through:

1. **Panel** — `LayerStack.jsx`'s DISH block gains a TEMPO row beside BOUNCE/REPEL, writing `setParam('dishTempo', v)` → `emit(Events.LAYOUT_PARAM, { key, value })`, the same event every dish row uses. (DENSITY's row already exists — the Layout % — it needed no new UI, only its dish meaning.)
2. **Store / validation** — `dishTempo` is registered in `PARAM_SPEC` (`{ min: 0, max: 1 }`) and `DEFAULT_LAYOUT_PARAMS` (`dishTempo: 0`) in `data/layout-modes.js`, so normalize/clamp/store handling is the generic machinery, identical to `contactRepel`'s. `dishTempo` is also added to `mathMacros`' `EXCLUDED_KEYS` beside the other dish-law params (a macro must not sweep the dish's temperature every frame).
3. **Sim** — `particles.js` takes call sites only (the petri lane's one-writer pattern; the law lives in a leaf):
   - Once per step, inside the contacts gate beside the medium resolution: `thermal = dishThermalFor(layoutParams.dishTempo, deformStill)`.
   - At the per-system contact-pass call site: `repel: Math.max(0, contactRepel) * crowdingRepelGain(layoutParams.density)` — the cross-strata pass never carried repel (A1's scope), so the gain lives exactly where repel lives.
   - In the integration loop, after the damped velocity is computed and before the speed clamp: if `thermal.amp > 0`, two `hashU01(seed, CH.dyn, step*131071 + i + offset)` draws (offsets 1048573/1048583, clear of the init/breed/curiosity/levy keys on the channel) add a uniform ±amp kick per axis, scaled by `sqrt(dtFrames)` so the diffusion rate — not the kick size — is what a frame rate changes.

## The model, and why it's the dish's own idiom

New leaf `app/src/engine/dishThermal.mjs`, shaped exactly like `dishMedium.mjs` (the C1 module): pure curve functions of one clamped knob, an identity at the default end, a frozen identity export, junk/absent input reading as the identity, law in the leaf and call sites in the integrator.

- **TEMPO curve is linear** (amp = `THERMAL_JITTER_MAX` 1.0 px/step × tempo) — the knob's travel is the effect's travel, no hidden knee, the same form the medium's restitution map was praised for. The kick is Brownian in the strict sense: independent uniform draws per body/step/axis whose variance accumulates against the integrator's damping, holding a hot body at a steady thermal speed (a few px/step typical, under the cloud clamp of 8). Determinism is the spec's §7 law: draws are hashU01 on the dyn channel keyed by the integrator's own `_step` — no clock, no unseeded randomness — so a frame stays a pure function of (seed, params, steps) and the studio bake, which steps the same `update()`, agitates exactly as the live dish does.
- **Stillness (§7):** `dishThermalFor(tempo, still)` forces amp 0 under reduced-motion at any knob value — thermal reads the stillness law, not the tempo knob. Pinned by the selfcheck: reduced-motion TEMPO 1 integrates bit-identically to TEMPO 0.
- **DENSITY curve is a ratio around the shipped default** (`DENSITY_PIVOT = 78`, pinned in the selfcheck to `DEFAULT_LAYOUT_PARAMS.density` itself so the two can never drift): at 78 the gain is exactly 1; at 10 it is ≈0.128; at 100, ≈1.282. Linear across the whole travel — crowding pressure proportional to crowding.
- Both laws exist only where the dish does (inside the `contactRadius > 0` gate, like the medium), declare no governor tier, and shed nothing — they are contact law, not finishes, so a shed can never rewrite physics mid-performance or break bake parity.

## Defaults parity (the shipping gate) — measured

- **TEMPO:** default 0 → amp exactly 0 → the kick branch never executes; the cold path's arithmetic is the pre-#1538 arithmetic. Pinned two ways: the dishThermal selfcheck runs full updates (bounce and breed, 60 steps) with the rows absent vs `dishTempo: 0` + `density: 78` and asserts bit-identity on x/y/vx/vy; the census pins `tempo0IsIdentity` (TEMPO-0 fingerprint === row-absent fingerprint over 240 dish steps).
- **DENSITY:** at the default 78, gain is `78/78 === 1` exactly (IEEE-exact), and `repel * 1` is bit-identical to `repel`. The census pins `defaultIsIdentity` (density-at-default fingerprint === row-absent fingerprint). The dishThermal selfcheck pins the pivot to the actual layout default.
- Consequence: any document whose density sits at 78 and which predates the TEMPO row renders and bakes exactly as before. A document with a non-default density AND an active repel now presses proportionally to its density — that is the §4 reinterpretation itself, the bug being fixed, not a parity break. No golden hash moved: `particles.selfcheck` (golden bakes incl. the dish fixtures) passes unmodified, and no suite needed re-pinning.

## Census evidence (the judge) — before / after

The E1b census's own TEMPO/DENSITY dish-matrix block was extended in its idiom (packed colony, 24 bodies, 240 steps, settle-KE in the WETNESS row's shape) and its selfcheck assertions flipped from pinning the gap to pinning the build:

| Measurement | Before (main fd58ba5c) | After (this branch) |
|---|---|---|
| density 10 vs 100 dish fingerprint | **bit-identical** (`identicalInDish: true` — the bug) | **differ** (`identicalInDish: false`) |
| tempo key in PARAM_SPEC | **none** (`tempoKeyExists: false`) | **present** (`dishTempo`) |
| settle KE, TEMPO 0 vs 1 (240 steps) | n/a (no knob) | **0.1419 → 98.9315** (~700×; `hotterKeepsEnergy: true`, `movesDish: true`) |
| TEMPO 0 vs row absent | n/a | **bit-identical** (`tempo0IsIdentity: true`) |
| density at default vs row absent | n/a | **bit-identical** (`defaultIsIdentity: true`) |

Census classification: `dishTempo` classifies `dish-matrix` via a `KEY_FIXTURES` entry (driver 'dish'); the pinned dish-classed set in `census.selfcheck` gains `dishTempo`; the pinned dead set is unchanged (`kinemeBrushWobble` still its last member). The baseline census was run on the untouched worktree before any edit (exit 0, old assertions) and after (exit 0, new assertions) — the flip is measured, not assumed.

## Suites run (honest)

- NEW `dishThermal.selfcheck` — pass (unit curves, defaults parity bounce+breed, density 10≠100, settle-KE ordering, stillness identity, wiring pins). Registered in `app/selfcheck.manifest` after dishMedium; package.json untouched.
- `census.selfcheck` — pass (with the flipped assertions + new TEMPO row).
- Neighbour cluster, all pass: dishMedium, dishDensity, dishCoalesce, dishPigment, dishDeform, dishCurrents, dishTrails, dishEcology, particles (goldens intact), normalize, censusReadout.
- Full manifest sweep: **425 pass / 4 fail** of 429 manifest suites (finisher's sequential run — see the completion note below). All four fails are sandbox-environment, none on or near the dish surface: `swarmWasm` (no cargo in the sandbox — known base-identical), `accum` (V8 OOM abort — known base-identical), `vortex` (a wall-clock step-budget assertion that fails and passes intermittently on pristine main fd58ba5c too — finisher-verified on both trees; the suite does not touch the dish path), `rollSafety` (900 s sweep-timeout casualty — its slot ran while two orphaned pre-restart sweep runners were still competing for the box; **re-run truly solo afterwards: PASS, 7 checks, ~15 min uninterrupted**).
- `npm run build` — pass (✓ built in 5.16s; finisher re-ran: ✓ built in 14.96s).

## Finisher's completion note (2026-10-15 night)

The original builder was killed by a daemon restart mid-verification. The finisher found the tree exactly as described: all work **uncommitted** (7 modified files + 3 new files), this report present as a draft with only the sweep tally outstanding. Audit outcome: every diff was read against the issue contract and found faithful — no code fixes were needed; nothing was redone. The finisher independently re-ran: `dishThermal` (pass), `census` (pass — the flipped assertions and parity pins are the census evidence above), the full neighbour cluster (dishMedium, dishDensity, dishCoalesce, dishPigment, dishDeform, dishCurrents, dishTrails, dishEcology, particles with goldens intact, normalize, censusReadout — all pass), `npm run build` (pass), then the full manifest sweep for the tally above. One environmental find worth recording: the dead builder's two sweep scripts (`/tmp/sweep1538*`) had survived the restart as orphans and were still running — three sweeps sharing one box is what starved rollSafety and timed out canvasSizes in the earlier partial tallies. The finisher killed both orphans; canvasSizes then passed solo inside the final sweep. Main has since moved to 19b60b9c (M4 — does not touch the dish surface); this branch stays on fd58ba5c for the coordinator to rebase at publish.

## Files

- NEW `app/src/engine/dishThermal.mjs` — the §4 law leaf (both curves).
- NEW `app/src/engine/dishThermal.selfcheck.mjs` + manifest line.
- `app/src/engine/particles.js` — call sites only: import, thermal resolution at the dish gate, crowding gain on the repel argument, the gated kick in the integrator.
- `app/src/data/layout-modes.js` — `dishTempo` default + PARAM_SPEC entry.
- `app/src/panels/build/LayerStack.jsx` — the TEMPO row in the DISH block (existing rows only; no new panel).
- `app/src/curator/censusReport.mjs` — KEY_FIXTURES entry; the TEMPO/DENSITY block now measures the build + parity pins.
- `app/src/curator/census.selfcheck.mjs` — dish-classed set + flipped/new assertions.
- `app/src/curator/mathMacros.js` — `dishTempo` in EXCLUDED_KEYS with the dish-law group.

## Shared-file note for the coordinator

No files outside the dish/petri surface were touched. `liveResolve.mjs` / `liveLoop.mjs` untouched (the concurrent STIMULI lane is safe). `particles.js` is a one-writer file per repo AGENTS.md, but the changes are call sites only in the petri lane's own sanctioned pattern (identical in kind to the C1 medium's), and the concurrent builder's surface (STIMULI panel / motion tap) does not intersect them. Census files changed because the issue names the census as the judge; the flips are the deliverable's evidence, flagged here so the publish can be sequenced accordingly.
