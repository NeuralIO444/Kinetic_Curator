# Sweep failure history — schema + guided fuzzing

**In plain language:** when the harness sweeps an effect's parameters and a
point fails — NaN pixels, out-of-range colors, a compile error — that failure
is written down as one line of JSON. Over time the log of "where it broke
before" teaches the *next* sweep where to look harder. The tests get smarter
the more they run, instead of spraying random values forever. (Backend-
hardening item 12.)

## The record — `kc-sweep-failure/1`

One JSON object per line (JSONL), so a 10k-failure log stays appendable and
grep-able. Written by `app/src/gl/mlx/exportSweepFailures.mjs`
(`failureFromSweep()`), which validates every field before writing — a bad
record throws naming the offending field instead of corrupting the log.

| Field | Meaning |
|---|---|
| `schema` | Always `kc-sweep-failure/1` |
| `effect` | Effect kind, e.g. `accum-echo` |
| `shader` | Shader name, e.g. `accum-echo` |
| `params` | Full parameter values at the failing point, e.g. `{ echoes: 4, echoWidth: 0.9 }` |
| `param_swept` | Which parameter was being swept (null for whole-shader failures like compile/link) |
| `check` | Which check caught it: `compile`, `link`, `uniform-audit`, `nan-scan`, `range`, `zero-noop`, `golden-diff` |
| `severity` | How bad: `crash`, `nan`, `out-of-range`, `zero-noop-fail`, `misrender` |
| `message` | One human sentence naming what went wrong |
| `harness_run_id`, `harness_commit`, `timestamp` | Which run, which code, when |

Example line:

```json
{"schema":"kc-sweep-failure/1","effect":"accum-echo","shader":"accum-echo","params":{"echoes":4,"echoWidth":0.9},"param_swept":"echoes","check":"nan-scan","severity":"nan","message":"NaN pixels at echoes=4, echoWidth=0.9 (flag view nan)","harness_run_id":"run-1","harness_commit":"abc123","timestamp":"2026-09-17T12:00:00.000Z"}
```

## How the biasing works — `app/src/gl/mlx/guidedFuzz.mjs`

Three small, pure functions the future sweep harness adopts (no harness
changes needed — they're already written, tested, and selfchecked):

1. **`parseFailureLog(text)`** — parses + validates the JSONL history.
2. **`biasOrder(failures)`** — ranks parameters by failure density: for each
   `(effect, param)` it counts failures and records the *hot region*
   (min..max of the failed values). Most-failed first.
3. **`suggestSamples({ min, max, count }, biasEntry)`** — the next sample
   values for one parameter. Deterministic. When a hot region exists, half
   the budget (rounded up) lands inside it (endpoints + midpoint); the rest
   spreads across the full range — coverage never collapses to the hot zone.
   Parameters with no history get the plain uniform spread.

The contract for the future sweep runner: call these three, spend the
suggested samples, and append new failures with `failureFromSweep()`. The
loop is active learning — each sweep's failures sharpen the next sweep's
aim — but it never stops covering the full range, so a new bug outside the
hot region is still found.

## Where the history lives

`mlx_data/sweep_failures.jsonl` — local to the machine that ran the sweep,
gitignored. It's training material, not a repo artifact: the repo commits
only the two MLX artifacts (`mlx_artifacts/golden_embeddings.json`,
`mlx_artifacts/cost_model.json`).
