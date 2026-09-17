# MLX Harness runbook — Mac Studio

**What this is, in plain language:** your Mac Studio is the one machine that
can run Apple's MLX, so it's the brain that *analyzes* what the shader
harness produces. Two jobs, both running on the Mac Studio, both committed
back to the repo so CI stays deterministic:

1. **Semantic golden tests** — the harness renders test frames, MLX SigLIP
   (the same embedding pipeline as the curator) turns each one into a list
   of numbers, and CI later checks "does this still read as the same
   artwork" with plain math. Catches looks-wrong that pixel-diffing misses.
2. **Learned cost model** — the harness measures every shader's real GPU
   cost; a tiny regression model learns cost from shader source alone, and
   CI predicts a new shader's cost tier without any GPU. The governor's cost
   tiers stop being hand-declared.

**Success criterion:** `mlx_artifacts/golden_embeddings.json` and
`mlx_artifacts/cost_model.json` exist on main, and CI's two new checks stop
skipping and start passing (you'll see the loud skip banners disappear).

Everything below runs on the Mac Studio. Nothing here touches the web app,
and the harness code itself is never modified by these steps.

---

## 0. One-time setup

Same install as the curator — one extra covers both:

```bash
cd Kinetic_Curator/studio
pip install -e ".[curator]"     # mlx-embeddings + pillow + numpy + scikit-learn
```

First run downloads the SigLIP weights from Hugging Face (~2 GB, one time,
lives in `~/.cache/huggingface`) — the same model the curator uses
(`mlx-community/siglip-so400m-patch14-384`).

Sanity check (no model needed, runs anywhere):

```bash
cd Kinetic_Curator/app
node src/gl/mlx/mlxExport.selfcheck.mjs   # -> "mlxExport.selfcheck OK"
```

---

## 1. Export the harness data (runs anywhere — do it on the Mac Studio)

The harness produces three machine-readable exports. The writers live in
`app/src/gl/mlx/`; schemas are `kc-cost-measurement/1`,
`kc-sweep-failure/1`, and `kc-test-render-manifest/1`.

**a) Cost measurements** — run the harness sweep (Shader Lab → sweep, or the
headless sweep runner) with the GPU timer on. Each (shader, params) point is
written as one JSONL line by `exportCostMeasurements.mjs`:

```bash
# after the sweep writes its timings:
node -e "..."   # harness sweep runner calls fromTimerPoll() per point
# -> mlx_data/cost_measurements.jsonl   (one JSON object per line)
```

Keep this file around (it's the training data); committing it is optional —
the model is what CI needs. Put it in `mlx_data/` (gitignored).

**b) Failure history** — the sweep's failures are appended the same way by
`exportSweepFailures.mjs`:

```bash
# -> mlx_data/sweep_failures.jsonl
```

This is the raw material for guided fuzzing (the future sweep harness
biases toward previously-broken parameter regions — see
`app/src/gl/mlx/guidedFuzz.mjs`).

**c) Test renders + manifest** — the harness writes one PNG per
(effect, params) test frame; `exportTestRenders.mjs` writes the manifest
with a sha256 per PNG so the embed step can prove it saw the exact renders:

```bash
# -> mlx_data/test_renders/accum-echo.png ... + mlx_data/test_renders/manifest.json
```

---

## 2. Semantic goldens — embed the renders, commit the goldens

This reuses the curator's SigLIP embedding code path (same model, same
normalisation) — `studio/harness_intel.py` imports it, nothing is
duplicated.

```bash
cd Kinetic_Curator/studio
python3 harness_intel.py embed-renders \
  --png-dir ../mlx_data/test_renders \
  --manifest ../mlx_data/test_renders/manifest.json \
  --out ../mlx_artifacts/golden_embeddings.json
# -> mlx_artifacts/golden_embeddings.json  (22 effects x 1152d)
```

What lands in the artifact:

- `schema`: `kc-golden-embeddings/1`
- `model`: `{ id: "mlx-community/siglip-so400m-patch14-384", dims: 1152 }`
- `effects`: per effect — averaged embedding, cosine threshold (0.985), render count

**Then commit it** (this is the part CI needs):

```bash
cd Kinetic_Curator
git add mlx_artifacts/golden_embeddings.json
git commit -m "mlx: golden embeddings for semantic shader tests (kc-golden-embeddings/1)"
git push
```

From that commit on, CI's `check_semantic_goldens` stops loud-skipping and
starts asserting: every committed effect must still cosine-match its golden
at ≥ 0.985, or the PR fails *naming the effect*.

**Refreshing "current":** when the harness renders change deliberately (a
new golden you want to bless), re-render, re-run `embed-renders` with
`--out ../mlx_artifacts/current_embeddings.json`, eyeball the renders, then
copy current over golden and commit both. Never hand-edit the vectors.

**Re-embed rule (same as the curator's 768 → 1152 lesson):** the embeddings
carry their model id + dims. If the model ever changes, re-run
`embed-renders` from scratch — the CI check *refuses* to compare embeddings
from different models, loudly, rather than silently mixing them.

---

## 3. Learned cost model — train on measurements, commit the model

The features the model learns from are extracted by the repo's own Node
extractor — **always generate them fresh, never re-implement**:

```bash
cd Kinetic_Curator/app
node src/gl/mlx/extractFeatures.mjs --out /tmp/harness-features.json
# -> 22 effect feature vectors, kc-feat/1 (7 static features, documented in the module)
```

Then train (ridge regression, log median GPU ms per effect):

```bash
cd Kinetic_Curator/studio
python3 harness_intel.py train-cost-model \
  --features /tmp/harness-features.json \
  --measurements ../mlx_data/cost_measurements.jsonl \
  --out ../mlx_artifacts/cost_model.json
# prints in-sample agreement: predicted tier vs declared tier per effect
```

What lands in the artifact (`kc-cost-model/1`):

- `feature_extractor`: `kc-feat/1`, `feature_spec`: the 7 feature names
- `weights`, `intercept`, `feature_mean`, `feature_std` (plain JSON numbers)
- `tier_boundaries`: score thresholds mapping predicted cost → tier 0..3
- `trained_at`, `measurement_count`, `declared_tiers_schema`

**Reconcile mismatches before committing:** the trainer prints any effect
whose *measured* cost disagrees with its *declared* tier
(`app/src/gl/mlx/declaredCostTiers.json`). That's the signal, not an error:
either the declaration was wrong (update the JSON) or the shader got
heavier (re-measure). Commit when every line reads true.

```bash
cd Kinetic_Curator
git add mlx_artifacts/cost_model.json
git commit -m "mlx: learned cost model (kc-cost-model/1, N measurements)"
git push
```

From that commit on, CI's `predict_cost_tier` stops loud-skipping: it
re-extracts features from the current shader sources, scores them under the
committed weights (pure arithmetic — no GPU, no MLX), and fails the PR
naming any effect whose predicted tier disagrees with its declared tier.

**Re-train rule:** the model is tied to `kc-feat/1`. If the feature set ever
changes (a `kc-feat/2`), re-run both commands above — CI refuses a model
whose `feature_extractor` doesn't match the repo extractor, loudly.

---

## 4. What CI does with the artifacts (for reference)

| Check | Script | Needs artifacts? | Without them |
|---|---|---|---|
| Semantic goldens | `app/scripts/checkSemanticGoldens.mjs` | `golden_embeddings.json` + `current_embeddings.json` | Loud skip (exit 0, banner) |
| Cost-tier prediction | `app/scripts/predictCostTier.mjs` | `cost_model.json` | Loud skip (exit 0, banner) |

Both are wired into `npm run selfcheck`, which is what CI runs — no
workflow changes needed. A skip is never a failure, and the scripts never
invent embeddings or weights: missing artifacts skip, present-but-broken
artifacts fail loudly naming the problem.

## 5. Notes

- **Never commit fake embeddings or hand-written weights.** The artifacts
  are measurement products; CI trusts them. A placeholder would silently
  bless the wrong goldens.
- **`mlx_data/` is gitignored** — measurements, PNGs, and failure logs live
  there. Only `mlx_artifacts/*.json` (the two committed artifacts) go to
  the repo.
- **The harness is not refactored by any of this.** The exports are additive
  modules in `app/src/gl/mlx/` plus one additive export in `accum.mjs`
  (`ACCUM_PASS_SOURCES`); harness behavior is unchanged.
- Guided fuzzing (`guidedFuzz.mjs`) consumes `mlx_data/sweep_failures.jsonl`
  on the *next* sweep — failure history compounds: the tests get smarter
  the more they run.
