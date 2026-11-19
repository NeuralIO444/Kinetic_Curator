# STAGING REPORT — #2382 Persona Kernel P2: Persona tuning table — `kc-persona-tuning/1`

Branch `kc-2382-persona-tuning`, based on origin/main `1bc67ad9` (includes the merged P1 kernel, PR #2404). One PR, not merged by the builder: **PR #2406 — https://github.com/NeuralIO444/Kinetic_Curator/pull/2406**

## ⚠ OPEN QUESTION — flagged, not decided (needs Matt / P7)

**The band fields have no measured values anywhere in the repo.** The issue's table shape names per-persona band fields (solo length in phrases, step cap, agree/disagree/lay-out odds, heat, answer order), per-relation agreement biases, and band fields (trade rate, max horns per call, bandleader cut rule) — but the band itself is P7 (issue 2387), unbuilt, and no numbers for any of these exist in code, docs, or the epic (2379). Inventing values would have been deciding an open question silently, so:

- The table ships those fields as **`null` — explicitly unruled, not zero**. The validator requires odds to be either all-null or all-numbers summing to 1, relations null or in [-1, 1].
- The DEV panel lists unruled fields as text, **not editable**; `setTuningValue` refuses edits to null leaves ("the rig tunes ruled numbers only").
- Everything that *does* have a measured value today is in the table with that exact value (below), and behaviour is byte-identical (proof below).

P7 or Matt must rule the band numbers before anything reads them. Nothing in this PR reads a null field.

## What was built

- **`app/src/personas/tuning.json`** — the table, schema `kc-persona-tuning/1`. Per-persona sections for the seven band seats (lois, davis, queen, governor, carson, greiman, ashworth): the five band fields (all null, above) plus a `knobs` sub-object where the persona has live measured numbers today (lois, davis, queen only). `relations`: all 42 directed seat pairs (`"a->b"`, all null). `band`: `tradeRate`, `maxHornsPerCall`, `bandleaderCut` (all null).
- **`app/src/personas/tuning.mjs`** — loader + validator + the DEV live-edit rig. `TUNING_DEFAULTS` (the shipped table, deep-frozen), `personaTuning()` (the effective table: shipped defaults with session overrides applied, cached, deep-frozen), `tuningValue(path)`, `tuningDefault(path)`, `tuningOverrides()`, `setTuningValue(path, value)`, `resetTuning()`, `onTuningChange(fn)`. Validator tags: `prob` [0,1], `probPos` (0,1] for divisor leaves, `count` integer ≥ 0, `num` finite ≥ 0, `range` [lo,hi] with 0 ≤ lo < hi, `opener` {key ∈ scale|displace|colour, value prob}; an edit lands only if the whole effective table still validates. Overrides live in a memory-only Map: **never persisted, never written into a project, reload restores shipped defaults** (the module imports only `./tuning.json` — no store, no storage; pinned by the selfcheck).
- **`app/src/panels/PersonaTunePanel.jsx` + `personatune` DEV tab** (`src/panels/devTabs.mjs`, React.lazy like the other tabs) — "PERSONA TUNE". One row per numeric knob leaf (numbers, [lo,hi] ranges as two inputs, opener amounts), an edited marker (●), a Reset button, and the unruled band/relation fields shown as text. Seat headings use band roles from `TUNING_SEAT_ROLES` (ARRANGER · COVER, LEAD SOLOIST · OVERLAP, RHYTHM SECTION, BANDLEADER, HORN · BLAST/HYBRID/SWISS GRIT) — callsigns/roles only, per the deniability law.
- **`app/src/personas/personaTuning.selfcheck.mjs`** (10 checks, added to `app/selfcheck.manifest`): shipped table validates and is frozen; exact shape; today's measured values pinned literally; band fields null; module exports equal table values; the validator bites on 8 malformed tables; live-edit behaviour (below); refused edits change nothing; no-persistence pin.

## Every hard-coded site routed through the table

Exported constants are now **defined from `TUNING_DEFAULTS`**, so existing importers and source pins see identical values; live consumers read `personaTuning()` per call so a DEV edit lands without reload.

- **`curator/mindConduct.js`** — LOIS brake `BRAKE_AT` 0.5 / `BRAKE_MAX` 0.4; flat read `FLAT_BIAS_SWING` 0.5, `FLUX_HELD` 0.05, `NOISE_FLAT` 0.9, plus flatBias's happy-keep rate and full-strength roll count read live from `flatRead`; Davis `BACKOFF_REVERTS` 3, `BACKOFF_BARS` 32, `DAVIS_MAX_ROUTES` 3, `BOLD_BAND` 0.5, `SPECTRUM_OPENERS` {low/mid/high}.
- **`curator/loisCut.mjs`** — `LOIS_CUT_GATES` {glance 0.28, originality 0.22, boldness 0.30}; `judgeDeal` reads the gates from the table in force.
- **`curator/queenLean.mjs`** — `MIN_KEEPS` 8 and the M1–M8 magnitudes: M1 bias 0.06 / proximity 0.72; M2 t0 0.4 / slope 0.15 / cap 0.55 / floor 0.4; M3 drift 0.1; M4 arm 40 ms / hold 0.08; M5 gain peak 1.18; beat confidence 0.62; M6 keeps 3 / strength 0.35; M7 confidence 0.6 / step 3 / deadband 2 / range [60, 180]; M8 wet step 0.05 / wet deadband 0.02 / evolve range [200, 10000] / evolve step 250 / evolve deadband 100.
- **`curator/trioLive.js`** — the two `bias >= BRAKE_AT` comparisons now read `personaTuning().personas.lois.knobs.brake.at` live (the `BRAKE_AT` import is gone).
- **`curator/director.js`** — five sites read the Queen knobs live via `queenKnobs()`: `MIN_KEEPS` ×3, the M2 floor in `deriveSway`, the M8 evolve range in `leanDialSteps`, the M2 span in `conductHeat`.

Deliberately **not** in the table (structural law / content, not tuning): `PHRASE_BARS` 4 (the chart), `OWN_PHRASES` 8 (artist sovereignty), the one-cut law, Davis's `PRESETS` (repertoire = content), `TIER_OPS`, the 16-route table cap. The perf-governor frame budgets already have GOV TUNE as their live surface and are untouched; `chapterMemory`'s own `CHAPTER_MEMORY_MIN_KEEPS = 8` is a deliberate cross-pinned copy, left untouched.

## Byte-identical proof

Method: a probe (`persona-probe2.mjs`) that dumps canonical JSON of **every exported constant** of mindConduct / loisCut / queenLean / director, plus behaviour grids — davisRoute over 19 shows × 7 seeds × 5 heats, davisSpectrum over 9 shows × 7 seeds, flatBias and boldBand grids, createFlatness sequences (default + custom), judgeDeal over **every look of every chapter deck**, the Queen mechanics (M1–M9) over input grids, and the director sites (deriveSway, leanDialSteps, conductHeat, directorGains, nextDebt, presenceScale, pullKeeps, keptAnchor).

Result: run against a pristine detached checkout of the base (`1bc67ad9`) and against this branch — **127,088 bytes of canonical JSON, `diff` clean: IDENTICAL.** (An earlier probe run pre-format was also identical; the proof was re-run end-to-end on the final tree after a sandbox restart lost the first probe files, with the probe rebuilt to the same grids.)

## DEV live-edit — how it works, how it was verified

`setTuningValue(path, value)` validates the candidate effective table as a whole; on success it stores the override in the session Map, invalidates the cached effective table, and notifies `onTuningChange` listeners. Consumers that read through `personaTuning()` per call (judgeDeal, flatBias, the trioLive brake comparisons, the director's Queen sites) pick the edit up on their next call — no reload. The panel edits through the same function and re-renders from `personaTuning()`.

Verified in `personaTuning.selfcheck` D2/D3: raising `lois.knobs.brake.max` 0.4 → 1 changes the davisRoute pick on the same show/seed; setting the cut gates to 0 removes all cuts across every chapter deck; `resetTuning()` restores the shipped behaviour exactly; edits to unruled (null) leaves, unknown paths, and invalid values are refused and change nothing. The Queen cross-pin (exports == table values, a live m2.t0 edit, reset) lives in `queenLean.selfcheck` (30 checks), placed there because the deniability scan forbids other suites from naming her module.

## Verification (publish ritual, all in the worktree's `app/`)

- **Full selfcheck sweep** (continue-on-error manifest loop): **753 pass / 3 fail**. The 3 failures are the known sandbox-environmental ones, each **confirmed failing identically on the pristine base checkout** (`1bc67ad9`): `swarmWasm` ("build-wasm: cargo not found on PATH"), `accum` (V8 "JavaScript heap out of memory", exit 134), `rollSafety` (Playwright `page.evaluate: Target crashed`). New suite `personaTuning`: 10/10. Targeted suites all green, incl. personaKernel 10, mindConduct 30, loisCut 5, trioLive 37, director 25, queenLean 30, queenDeniability 7, casingInCss ok, devPanel 12 lazy tabs, panelGraph 734 modules.
- **`npm run lint`**: 0 errors, 11 warnings — all pre-existing, all in files this PR does not touch.
- **`npm run format:check`**: pass (all files Prettier-clean).
- **`npm run build`**: pass (only the pre-existing ineffective-dynamic-import warnings).
- Deniability/casing fixes the suites demanded during the build: the panel contains no forbidden identifier string anywhere (role labels only), and no `.toUpperCase()` in JSX (display case lives in `TUNING_SEAT_ROLES`, per the casing law). `HotkeyOverlay.jsx`'s prose tab list and `devPanel.selfcheck`'s tab list were extended with the new tab.
- `package-lock.json` churn from `npm install` was reverted; it is not part of this change.
