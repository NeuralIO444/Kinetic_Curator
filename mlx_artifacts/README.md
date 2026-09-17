# mlx_artifacts/ — committed MLX products

This directory holds the **committed, machine-generated artifacts** of the
MLX harness intelligence work (backend hardening 6/6). Everything here is
produced on the Mac Studio (MLX = Apple Silicon only) by
`studio/harness_intel.py`, following `docs/MLX_HARNESS_RUNBOOK.md`.

| Artifact | Schema | What it is |
|---|---|---|
| `golden_embeddings.json` | `kc-golden-embeddings/1` | Per-effect SigLIP embeddings of the harness golden renders. CI's `check_semantic_goldens` asserts the current renders still cosine-match these. |
| `current_embeddings.json` | `kc-golden-embeddings/1` | Fresh embeddings of the current harness renders, committed alongside a deliberate golden refresh. Compared against `golden_embeddings.json` in CI. |
| `cost_model.json` | `kc-cost-model/1` | Ridge-regression weights over static shader-source features (`kc-feat/1`), trained on measured GPU costs. CI's `predict_cost_tier` scores every effect from source alone and fails on prediction-vs-declared mismatch. |

**Rules (non-negotiable):**

- **Never commit fake embeddings or hand-written weights.** These files are
  measurement products; CI trusts them. A placeholder silently blesses the
  wrong goldens.
- **Never hand-edit the vectors.** Regenerate with the runbook commands.
- **Re-embed on model change.** The embeddings carry their model id + dims
  (`mlx-community/siglip-so400m-patch14-384`, 1152d); the CI check refuses
  to mix models, loudly.
- **Re-train on feature change.** The cost model carries its feature
  extractor version (`kc-feat/1`); CI refuses a model trained on a
  different feature set, loudly.

**Until these files exist** (Matt hasn't run the runbook yet), both CI
checks LOUD-SKIP: exit 0 with an unmissable banner pointing at the runbook.
A skip is never a failure — the gates arm themselves the day the artifacts
land.
