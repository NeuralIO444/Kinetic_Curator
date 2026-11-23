# STAGING REPORT — CULTURE Phase 0: the gate and the empty dish

Branch `feat/culture-phase0-gate`, based on origin/main `23967160`. Coordinator's staging record, written by the builder. The parent issue (1183) stays open; this PR is the CULTURE foundation's first slice under it and carries no closing reference for any issue.

## What shipped

1. **The dish-mode gate** (`cultureDish`), following the codebase's existing gate discipline (the #2108 CONSTRUCTS gate) file for file:
   - store field defaulting to `false` + setter (`state/slices/globalSlice.js`);
   - the project document writes the field **only while on** (`state/projectDocument.js` serialize), reads it back in both parse branches (absent = off), and classes it `scene` in `DOC_FIELD_CLASS` (it describes the world the scene runs in, so it travels with the scene and with recipe links);
   - a loaded document stands the gate up or down in the store (`state/sceneApply.js`);
   - the autosave watch list and the recipe scene-block list both carry the key (`state/projectWatch.mjs`, `state/recipeSceneKeys.js`) — each is guarded by a suite that derives it from `DOC_FIELD_CLASS`, so the field cannot be silently dropped from a save or a link.
2. **The dish world container** (`app/src/engine/cultureWorld.mjs`, new): one world state object —
   - the shared grid: `STAGE_COLS × STAGE_ROWS` imported from `dishLifeStage.mjs`, the Life stage grid (spec §5.2: Life is the soil this world grows in), all cells dead at birth;
   - an empty body table allocated at `CULTURE_BODY_CAP = 2048`, the contacts ceiling already on main (K3 cap ladder step 2, `data/quality.js`); count 0 — capacity is a ceiling, not a population;
   - a **fixed-timestep scheduler**: `advanceCultureWorld(world, dtS)` accumulates fed frame time and runs only whole 120 Hz steps (`CULTURE_STEP_S = 1/120`, two substeps per 60 Hz frame), carrying the remainder. One call runs at most 240 steps; whole steps past the bound are counted in `droppedSteps`, never silently swallowed, and the accumulator keeps only the fractional remainder afterwards;
   - a canonical world hash (FNV-1a over stamp, seed, step count, the carried remainder's exact bits, dropped count, grid, and the body table's living prefix);
   - a standing-world registration (`standingCultureWorld()`), null unless the shell registers one.
3. **The shell seam** (`app/src/hooks/useCultureWorld.js`, new; one import + one call in `App.jsx`): while the gate is on, the shell creates one world (seeded from the store; a seed change rebuilds it empty — the Lab casts fresh each take, spec §4) and feeds it accumulated rAF time. Gate off: the effect returns before creating anything — no world, no rAF, no cost.
4. **simLaw honesty**: the world steps on CPU in JS and stamps itself in the codebase's vocabulary — backend `js.cultureWorld.v1`, law `js-exact` (the `engine/kernel/simBackends.js` terms). No GPU claim anywhere. The stamp lives in the world module in Phase 0; when a later phase wires the world into the resolver, it rides the take header through the `OPTIONAL_SIM_KERNELS` pattern (the contacts precedent), so JS-era take headers stay byte-for-byte. That deferral is deliberate and recorded here rather than implied.

## What was NOT done

- No edits to the one-writer files (`app/src/gl/liveLoop.mjs`, `liveResolve.mjs`, `particles.js`) — no seam in them was needed; the gate wires at the app shell and the world is not connected to the resolver yet.
- No behaviour, visual, or feel change to anything that exists; nothing renders in either gate state. No new panel or control surface (the gate is carried by the document and the store setter; a performer-facing switch is a later phase's call). No new particle system. No bodies, solver, or soil simulation — a step advances the world's clock only.

## Verification (composed tree, this branch)

- **New suite** `node src/engine/cultureWorld.selfcheck.mjs`: **5 groups green** — empty-world shape; simLaw honesty; scheduler law (60 × 1/60 s = exactly 120 steps, remainder exactly 0; 216,000 × 1/60 s = exactly 432,000 steps, remainder exactly 0 — no drift; a 10 s feed runs the 240-step bound and counts 960 dropped); determinism (a 600-chunk irregular feed, 1–50 ms chunks from a seeded stream, produces a bit-identical remainder and identical hash across two runs; one extra step or a different seed changes the hash); gate-off parity (gate-off and field-absent documents serialize **byte-identically** — JSON string equality — an on document adds exactly the one field and round-trips; store defaults off; no standing world).
- **Targeted neighbours, all green**: projectDocument, projectDocument.fields (43 classed, 23 emitted), sceneApply, constructGate, projectWatch, projectDocument.fuzz, simBackends, dishLifeStage, plus (after the fix below) recipeUrls, recipeUrls.v3, recipes.
- **Lint**: 0 errors (11 warnings, all pre-existing, none in touched files). **format:check**: clean. **Build**: green.
- **Full manifest sweep** (continue-on-error over `app/selfcheck.manifest`, 803 commands): run in two parts after the sandbox OOM-killed the first loop at suite ~340 (`src/gl/composite.selfcheck.mjs`, which passes standalone: 15 cases OK). Logs: `sweep-culture-p0.log` (lines 1–339) and `sweep-culture-p0-part2.log` (lines 340–803), both in this worktree root. **As run: 799 PASS / 4 FAIL.**
  - `src/state/recipeUrls.v3.selfcheck.mjs` — **MINE, fixed.** The new `scene`-classed key was missing from the recipe scene-block list; the suite exists to catch exactly that. Fix: `'cultureDish'` added to `SCENE_BLOCK_KEYS` in `src/state/recipeSceneKeys.js`. Re-run green standalone, with recipeUrls and recipes green beside it. Effective final state: **800 PASS / 3 FAIL**.
  - `src/engine/kernel/bake/swarmWasm.selfcheck.mjs` — **environmental.** A/B against a pristine detached worktree at origin/main (23967160): fails identically (exit 1 — `build-wasm.sh --verify` cannot reproduce the checked-in wasm without the Rust toolchain in this sandbox).
  - `src/fx/rollSafety.selfcheck.mjs` — **environmental.** A/B: fails identically on pristine base (exit 1).
  - `src/gl/accum.selfcheck.mjs` — **environmental.** A/B: aborts identically on pristine base (exit 134, the sandbox WebGL path), the same signature as on this branch.

## Flags / stop moments

- No stop was needed: the one-writer files were never in the seam's path.
- One design call worth the coordinator's eye: `cultureDish` is classed `scene` (not `rig`) in `DOC_FIELD_CLASS`, so recipe links carry the gate — a shared scene opens with the same world mode it was saved in. The alternative (rig, like the canvas `stageMode`) would make the gate a per-performer preference; the dish mode is a property of the piece's world, so scene was chosen. Recorded here so the choice is visible, not buried.
- A live-canvas screenshot is not owed for this slice in the usual sense: nothing renders differently in either gate state, by design. The QA surface is the parity evidence above.
