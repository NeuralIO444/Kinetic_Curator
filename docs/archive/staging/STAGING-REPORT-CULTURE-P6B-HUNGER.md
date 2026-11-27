# CULTURE Phase 6B follow-up — DAVIS leans the hunger gene ±15 % at cast

Matt's ruling, 2026-11-25: DAVIS leans the hunger gene ±15 % at cast (this was open question 1(b) in
`STAGING-REPORT-CULTURE-P6B.md`, which recommended it). One constant and one new argument; behind the `cultureDish`
gate; zero live-stage change.

## What changed

- `app/src/engine/cultureLab.mjs`: `CULTURE_DAVIS_HUNGER_LEAN` 0 → **0.15**. Each cast citizen's hunger gene is
  native (2) × (1 + u · 0.15), u uniform in [−1, 1] from the gene's own draw (index 16 on the `culture-recipe`
  channel, after the sixteen temperament dials), clamped to the gene bounds [0, 4]. No other dial's draw moved (asserted).
  `davisWrite(plan, seed, candidate, hungerLean = CULTURE_DAVIS_HUNGER_LEAN)` takes the lean as a defaulted argument so
  the tests can prove lean 0.
- Breeding blends the gene (already built, unchanged). LOIS reads only the sixteen temperament dials (unchanged; now
  asserted to ignore the gene at 0, 1, 2, 3.7 and 4).
- Nothing else in the engine moved. One-writer files untouched.

## Re-pins (LOUD — a changed law)

| Suite                                          | Was                                                                                 | Now                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cultureBreed g7                                | "the cast carries the native gene" (== 2)                                           | every cast gene within 2 × [0.85, 1.15]; not all native; lean pinned 0.15                                                                                                                                                                                                                                                                                                   |
| cultureBreed g7, "native hunger reproduces 6A" | asserted on the default cast                                                        | now asserted at **lean 0** (`atLeanZero`: every gene reset to the native 2), pins unchanged (unfed 3213499357 / 1364707529; fed 774063707 / 1179149084 at the step before first growth). New: unfed bodies are 6A's at lean 0.15 too (no food, gene never read); fed bodies at lean 0.15 are **not** 6A's                                                                   |
| cultureEcology g3                              | hunger gene == `CULTURE_HUNGER_PULL` and the desire pull weighed by it              | gene within ±15 % of it; the pull is the citizen's own gene                                                                                                                                                                                                                                                                                                                 |
| cultureBeast g8, room off                      | citizens hash 2760788251, 2284435313, 4286813388, 3374000142, 3500107867, 193247732 | 434725841, 2907873094, 2333414505, 2003383088, 1180817175, 1897956750. Swarm and gait hashes unchanged (no morsel, gene never read). The six 6B values are still asserted, at lean 0                                                                                                                                                                                        |
| cultureBeast g8, room on (high, 128 bpm)       | world 3778793516, 2137699268, 896174862, 1577957186; swarm and gait = 6A's          | those six-B values and the 6A swarm/gait pins kept, asserted at **lean 0**. New leaned pins: world 2186576465, 3819731255, 351445135, 3880720211; swarm 3511416458, 2732997930, 2439431368, 3448273385; gait unchanged (2446235502 ×2, 1298961053 ×2)                                                                                                                       |
| cultureLab                                     | none                                                                                | new group 4b: lean pinned 0.15; gene == clamp(native × (1 + 0.15u)) with u from draw 16, both directions, span > 12 %; lean 0 = native exactly with every other dial and the phase bit-identical; draw 16 is none of the 16 dials' draws; an over-wide lean (5) stays in [0, 4] and the clamp binds. Group 5 gains: LOIS's praise is identical for gene 0 / 1 / 2 / 3.7 / 4 |

No tolerance was loosened anywhere; every pin is an exact equality. Lean 0 reproducing 6A/6B bit for bit is proven by the
retained 6B pins, asserted on `atLeanZero` worlds (the lean-0 sweep below also reproduces 6B's behaviour table exactly).

## Mutations (each isolated, reverted)

| Mutation                                                  | Result                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| lean 0.15 → 0.2                                           | cultureLab, cultureBreed, cultureBeast fail                                                                         |
| lean draw shares another dial's index (`HUNGER_DRAW = 3`) | cultureLab, cultureBreed, cultureBeast fail                                                                         |
| no clamp                                                  | cultureLab fails (the over-wide lean case); the default lean's range is inside [0, 4], so only that test can see it |
| LOIS reads hunger (hunger term in `recipeDistance`)       | cultureLab (praise formula), cultureBreed, cultureBeast fail                                                        |

## Behaviour (the gated world, full take sheet, 20 seeds × 120 s)

Ruled lean 0.15, with the lean-0 run alongside (lean 0 reproduces the 6B table row for row).

| Room         | Lean | Births | Deaths: soil / starved / preyed | Peak living (one dish) | Alive at 120 s |
| ------------ | ---- | ------ | ------------------------------- | ---------------------- | -------------- |
| none         | 0.15 | 0      | 0 / 89 / 41                     | 7                      | 0              |
| none         | 0    | 0      | 0 / 89 / 41                     | 7                      | 0              |
| low, 40 bpm  | 0.15 | 11     | 0 / 28 / 31                     | 8                      | 82             |
| low, 40 bpm  | 0    | 6      | 0 / 26 / 35                     | 8                      | 75             |
| mid, 120 bpm | 0.15 | 146    | 0 / 5 / 19                      | 19                     | 252            |
| mid, 120 bpm | 0    | 138    | 2 / 6 / 13                      | 16                     | 247            |

Hunger spread (gene, summed over 20 seeds):

| Room | Cast (130)                           | Cast survivors                              | Babies alive                                |
| ---- | ------------------------------------ | ------------------------------------------- | ------------------------------------------- |
| none | mean 2.011, sd 0.171, 1.700 .. 2.294 | none survive                                | none born                                   |
| low  | same cast                            | n 75, mean 2.024, sd 0.168, 1.700 .. 2.294  | n 7, mean 2.032, sd 0.129, 1.811 .. 2.138   |
| mid  | same cast                            | n 118, mean 2.013, sd 0.171, 1.700 .. 2.294 | n 134, mean 2.011, sd 0.110, 1.756 .. 2.259 |

Reading: the lean does not change the ecology's shape. Unfed, nobody eats, so nobody lives past the starvation and
predation clocks (same 89 / 41). Fed, births and deaths move by seed-level noise (low 6 → 11, mid 138 → 146). Survivors
are not selected on hunger yet: survivor means sit within 0.015 of the cast mean, which is expected, since there is no
heredity pressure beyond blending. The babies' sd is smaller than the cast's (0.110 vs 0.171), because breeding blends two
parents' genes toward their mean. One seed-level cast of 130 includes no clamp case (range 1.70 .. 2.30 inside [0, 4]).

## Verification

- Every culture suite, kernel/rng, cultureRoomLive, useCultureWorld, culture host and parity suites, kinemeCulture,
  dishCultureCells, beast and gait suites: 37 / 37 pass. (cultureBreed, cultureBeast, cultureEcology, cultureLab edited.)
- Lint 0 errors (11 pre-existing warnings, untouched files). `format:check` clean. Build green.
- **Gate-off A/B** against a detached worktree at origin/main `12d4520`: 28 of 28 layout modes resolve through a fresh
  `createLiveResolver` × 60 frames, all-modes digest `a9f8e39c9fb7e18d315f75406de97af718dbba1ec303e40c9ab3828a0680fb58`
  and every per-mode digest identical on both; `serializeProject` (cultureDish false) sha256
  `b7ab67ba98dfbca496a3ae488b5fe34a2cb50f51e6a913d7fa42334b849df421` identical on both. (The probe is a throwaway
  script, not committed; the digests are the proof.)
- A full 825-suite manifest sweep was not run (time); every culture suite was.
