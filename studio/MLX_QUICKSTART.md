# MLX Quickstart — 3 commands

On the **Mac Studio**, from the repo root:

```bash
# 1. one-time setup (~15 min + a 2 GB model download)
bash studio/mlx_setup.sh

# 2. run the pipeline (resumable; re-run any time)
#    base.project.json = any project exported from the app (Pipeline → ↓ PROJECT)
python3 studio/mlx_run.py --phase 1 --pool pool --count 200 --hits hits.json

# 3. check the gates
python3 studio/mlx_verify.py
```

What each does:

- **mlx_setup.sh** — installs `.[curator]`, prefetches the SigLIP weights, runs the selfcheck.
- **mlx_run.py** — orchestrates the runbook: render pool → embed → labels → train → rank.
  Skips steps whose outputs exist (`--force` to redo, `--dry-run` to preview).
  Labels bootstrap from your HITS export (`--hits hits.json`); without it, it tells you
  the two manual options instead of guessing.
- **mlx_verify.py** — the simplified test: selfcheck, index exists, ≥20 likes/passes,
  taste artifact exists, ROC-AUC > 0.6, head fidelity ≥ 0.3. PASS/FAIL per gate.

Phase 2 (taste.json → the app, #762):

```bash
python3 studio/mlx_run.py --phase 2 --pool pool --recipes pool-recipes \
    --hits hits.json --base base.project.json
python3 studio/mlx_verify.py --taste taste.json
# then: app → Pipeline → IN → IMPORT TASTE → taste.json
```

The human parts that stay human: labeling (unless HITS covers it) and the final
eyeball verdict on the top 20. Everything else is scripted.

Full detail lives in `docs/MLX_CURATOR_RUNBOOK.md`; the four MLX docs overlap
heavily and are slated for a merge (see `docs/REMAINING_REVIEW.md`).
