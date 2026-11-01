# FIELD Eval Loop (pure functional core)

**Date:** 2026-10-31  
**Status:** Implemented on `feat/director-field-headroom-2026-10-31`  
**Lives:** `app/src/curator/fieldEval.js` + `fieldEval.selfcheck.mjs`

## Purpose

Offline, deterministic evaluation of the Director / FIELD pure core. Measures poet bias, slow-debt forcing, and thrash without touching the live loop.

## Pure step

```js
step(state, input, rng) → { nextState, decision }
```

- `state`: intensity, slowDebtHistory, lastPoet, lastRejected, room
- `input`: intensity, verdict, genreLean, rejected
- `decision`: poet + piece or null (silence)
- Seeded RNG only. Same inputs → same outputs.

## Eval loop

```js
evalLoop(seed, steps, scenarioName) → summary
```

Scenarios: `steadyCool`, `steadyHot`, `hotStreak`, `withRejection`.

Summary includes coolBias, hotBias, silenceRate, thrash proxy, finalDebt.

## Assertions (selfcheck)

- Cool scenario: coolBias > 0.6, hotBias < 0.3
- Hot scenario: hotBias > 0.5
- Hot streak forces debt ≥ 3
- Same seed → identical summary
- step is pure

## Rules preserved

- Pick-time only. Never in the live loop.
- Deterministic. Seeded RNG only.
- No inventing candidates.
- Silence default.
- Cost remains tier 0 (pure CPU at pick time).

## Next

Wire the same pure `step` into the live Director's pick path when the stamp path is ready. The eval loop stays offline for tuning and regression.
