# Cost head (T4, #1578) — the Studio runbook

The governor cost head prices a recipe before its first frame. The runtime
evaluator (PR #1583) and the benchmark harness (PR #1622) are shipped; what
remains is one measured session on the Mac Studio, then the ship/kill
judgment. Both are automated — this page is the whole procedure.

## The one command

```sh
cd app
npm run cost:studio
```

That runs, in order, each stage failing loud and stopping the chain:

1. **build** — `npm run build` (labels from an unbuildable tree mean nothing).
2. **bench** — the full 26-recipe corpus through the real render path, with
   the four device probes (fill / instanced / blend / JS) at session start
   and end. Output: `app/cost-datasets/cost-dataset.json` (gitignored —
   labels are per-machine working data).
3. **gate** — the dataset is re-validated; the run refuses to continue if
   any recipe failed to measure, if the probes drifted >±50% (thermal/load
   drift), or if any row's timing cross-check flagged it suspect.
4. **train** — `studio/train_cost_head.py`: additivity gate first (if
   per-effect costs simply add, the verdict is ADDITIVE-KILL and nothing
   trains), then a quantile (τ=0.9) XGBoost fit on grouped splits, calibrated
   to ≥90% coverage. Output: `studio/cost-model.json` (+ `.report.json`).
5. **judge** — `src/gl/parity/costJudge.mjs`: governor replay of the
   held-out recipes × held-out devices through static tiers, a count-only
   baseline, a ridge baseline, and the head. Prints `VERDICT: SHIP`,
   `VERDICT: KILL`, or `VERDICT: ADDITIVE-KILL`; the command's exit code
   follows the verdict (0 / 1 / 3).

Record the verdict on #1578 either way — a kill is a result. If SHIP, the
prime call site is a separate, later PR; nothing in this chain wires the
head into the live instrument.

## Prerequisites (once)

- Node deps: `npm install` in `app/`.
- Chromium for Playwright: `npm run test:e2e:install`, **or** pass
  `--chromium /path/to/Chrome` to use an installed Chrome instead.
- Python 3 with XGBoost for the trainer: `pip install xgboost`
  (or `--python /path/to/python3` to pick the interpreter).

## Useful variations

```sh
npm run cost:studio -- --dataset-only        # labels only, no train/judge
npm run cost:studio -- --skip-build          # trust the current build
npm run cost:studio -- --reps 5 --frames 45  # deeper label runs
node src/gl/parity/costJudge.mjs --dataset app/cost-datasets/cost-dataset.json \
    --model studio/cost-model.json           # re-judge an existing pair
python3 studio/train_cost_head.py app/cost-datasets/cost-dataset.json \
    --out studio/cost-model.json --report studio/cost-model.report.json
```

Datasets from several machines can be judged together (the split holds out
recipes and devices): repeat `--dataset` on the judge, and pass several
dataset paths to the trainer.

## Honesty notes

- A dataset stamps its own environment (renderer string included). Labels
  measured under SwiftShader (any sandbox/CI run) validate the machinery
  only — the runner banners this every time, and a model trained on them
  must never ship.
- The trainer never trains past the additivity gate, never calibrates on
  test cells, and verifies its exported artifact reproduces the booster
  before writing it. The judge scores the head through the runtime's own
  evaluator — what is judged is what the instrument would do.
