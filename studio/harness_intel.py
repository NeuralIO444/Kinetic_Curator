#!/usr/bin/env python3
"""studio/harness_intel.py — MLX harness intelligence (backend hardening 6/6).

The Mac Studio half of the bridge. MLX runs ONLY on Apple Silicon, so every
command here is Mac-Studio-only; the harness-side export writers live in
app/src/gl/mlx/ (Node/browser-safe) and the CI checks in app/scripts/
(pure math). This script:

  1. embed-renders   — embed harness test-render PNGs with the SAME MLX
                       SigLIP pipeline the curator uses, and write
                       mlx_artifacts/golden_embeddings.json (or
                       current_embeddings.json for a fresh run).
  2. train-cost-model — train a tiny ridge regression from measured GPU
                       costs (harness export JSONL) + static shader features
                       (extracted by app/src/gl/mlx/extractFeatures.mjs —
                       never re-implemented here), and write
                       mlx_artifacts/cost_model.json (plain JSON weights,
                       evaluable in CI with pure arithmetic).

The embedding code path is REUSED from curator.py via import — nothing is
duplicated. See docs/MLX_HARNESS_RUNBOOK.md for the step-by-step runbook.

Install (Mac Studio):  pip install -e ".[curator]"
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

# The curator's SigLIP embedding path — imported, never duplicated.
# (Apple MLX backend; raises a clear install hint on non-Apple-Silicon.)
from curator import embed_images, DEFAULT_MODEL  # noqa: E402

GOLDEN_SCHEMA = "kc-golden-embeddings/1"
MODEL_SCHEMA = "kc-cost-model/1"
FEATURE_EXTRACTOR = "kc-feat/1"
DEFAULT_THRESHOLD = 0.985


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def cmd_embed_renders(a) -> None:
    png_dir = Path(a.png_dir).resolve()
    manifest_path = Path(a.manifest)
    manifest = json.loads(manifest_path.read_text())
    renders = manifest["renders"]

    # Order is deterministic: manifest order. Each PNG embeds to one vector.
    paths = [png_dir / r["png"] for r in renders]
    missing = [str(p) for p in paths if not p.is_file()]
    if missing:
        sys.exit(f"missing PNGs: {missing[:5]}{'...' if len(missing) > 5 else ''}")

    print(f"embedding {len(paths)} harness renders with {a.model} (MLX, Apple Silicon)...")
    emb = embed_images(paths, a.model, log=print)  # (N, D), float32, L2-normalised
    n, dims = emb.shape

    # One embedding per effect: the manifest may hold several params per
    # effect; average them (all L2-normalised first, then re-normalise) so
    # the golden is the effect's look, not one knob position.
    import numpy as np

    by_effect: dict[str, list[np.ndarray]] = {}
    for r, v in zip(renders, emb):
        by_effect.setdefault(r["effect"], []).append(v)
    effects = {}
    for effect, vecs in sorted(by_effect.items()):
        mean = np.stack(vecs).mean(axis=0)
        mean = mean / np.linalg.norm(mean)
        effects[effect] = {
            "embedding": [float(x) for x in mean],
            "threshold": float(a.threshold),
            "renders": len(vecs),
        }

    doc = {
        "schema": GOLDEN_SCHEMA,
        "model": {"id": a.model, "dims": int(dims)},
        "generated_at": _utcnow(),
        "harness_commit": manifest.get("harness_commit", "unknown"),
        "default_threshold": float(a.threshold),
        "effects": effects,
    }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"wrote {out} — {len(effects)} effects x {dims}d ({a.model})")
    print("NOTE: embeddings are tied to the model. If the model id or dims ever")
    print("change, re-run this command — the CI check refuses to mix models.")


def cmd_train_cost_model(a) -> None:
    """Ridge regression: static shader features -> log(median GPU ms)."""
    import numpy as np
    from sklearn.linear_model import Ridge

    feats_doc = json.loads(Path(a.features).read_text())
    if feats_doc.get("feature_extractor") != FEATURE_EXTRACTOR:
        sys.exit(
            f"features.json was built with {feats_doc.get('feature_extractor')}, "
            f"expected {FEATURE_EXTRACTOR} — regenerate with "
            "`node app/src/gl/mlx/extractFeatures.mjs --out features.json`"
        )
    feature_names: list[str] = feats_doc["feature_names"]
    features: dict[str, list[float]] = feats_doc["features"]

    # Group measurements by effect -> median ms (robust to timer outliers).
    per_effect: dict[str, list[float]] = {}
    n_meas = 0
    for line in Path(a.measurements).read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        per_effect.setdefault(r["effect_kind"], []).append(float(r["ms_mean"]))
        n_meas += 1
    if not per_effect:
        sys.exit("no measurements in the JSONL — run the harness sweep export first")

    kinds, X, y = [], [], []
    for kind, ms_list in sorted(per_effect.items()):
        if kind not in features:
            print(f"  warn: no static features for {kind!r} — skipped")
            continue
        kinds.append(kind)
        X.append(features[kind])
        y.append(float(np.log(np.median(ms_list))))
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    print(f"training on {len(kinds)} effects, {n_meas} measurements")

    # Standardise (mean/std stored in the artifact — CI applies the same).
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std == 0] = 1.0
    Xs = (X - mean) / std

    model = Ridge(alpha=float(a.alpha))
    model.fit(Xs, y)
    scores = model.predict(Xs)

    # Tier boundaries from the DECLARED tiers: median predicted score per
    # declared tier, boundaries at midpoints. An effect whose measured cost
    # doesn't fit its declared tier then shows up as a CI mismatch — that is
    # the signal: either the declaration is wrong or the shader got heavier.
    declared = json.loads(Path(a.declared).read_text())["effects"]
    tier_scores: dict[int, list[float]] = {}
    for kind, s in zip(kinds, scores):
        t = declared.get(kind, {}).get("tier")
        if t is None:
            print(f"  warn: {kind!r} has no declared tier — excluded from boundaries")
            continue
        tier_scores.setdefault(int(t), []).append(float(s))
    present = sorted(tier_scores)
    medians = {t: float(np.median(tier_scores[t])) for t in present}
    print("  median predicted score per declared tier:",
          {t: round(medians[t], 3) for t in present})
    bounds = []
    for i in range(3):
        lo, hi = i, i + 1
        if lo in medians and hi in medians:
            bounds.append((medians[lo] + medians[hi]) / 2)
        else:
            # Tier unpopulated by measurements — reuse the neighbouring gap.
            bounds.append(bounds[-1] if bounds else 0.0)
    bounds = [float(b) for b in bounds]
    print(f"  tier boundaries: {bounds}")

    doc = {
        "schema": MODEL_SCHEMA,
        "feature_extractor": FEATURE_EXTRACTOR,
        "feature_spec": feature_names,
        "model": "ridge",
        "alpha": float(a.alpha),
        "weights": [float(w) for w in model.coef_],
        "intercept": float(model.intercept_),
        "feature_mean": [float(v) for v in mean],
        "feature_std": [float(v) for v in std],
        "tier_boundaries": bounds,
        "trained_at": _utcnow(),
        "measurement_count": n_meas,
        "effects_trained": kinds,
        "declared_tiers_schema": "kc-declared-cost-tiers/1",
        "notes": (
            "Predicts log(median GPU ms) from static shader-source features; "
            "tier = score vs tier_boundaries. CI re-scores every effect from "
            "current sources and fails on prediction-vs-declared mismatch."
        ),
    }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"wrote {out}")

    # Report in-sample agreement so Matt sees what he's committing.
    agree = sum(
        1 for kind, s in zip(kinds, scores)
        if declared.get(kind, {}).get("tier") is not None
        and _tier_of(s, bounds) == int(declared[kind]["tier"])
    )
    print(f"in-sample: predicted tier matches declared tier for {agree}/{len(kinds)} effects")
    for kind, s in zip(kinds, scores):
        d = declared.get(kind, {}).get("tier")
        if d is not None and _tier_of(s, bounds) != int(d):
            print(f"  MISMATCH {kind}: measured like tier {_tier_of(s, bounds)}, declared tier {d} — reconcile before committing")


def _tier_of(score: float, bounds: list[float]) -> int:
    b01, b12, b23 = bounds
    if score < b01:
        return 0
    if score < b12:
        return 1
    if score < b23:
        return 2
    return 3


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="MLX harness intelligence — Mac Studio commands")
    sub = p.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("embed-renders", help="embed harness test-render PNGs -> golden/current embeddings JSON")
    e.add_argument("--png-dir", required=True, help="directory of harness test-render PNGs")
    e.add_argument("--manifest", required=True, help="test-render manifest JSON (from the harness export)")
    e.add_argument("--out", required=True, help="output path, e.g. mlx_artifacts/golden_embeddings.json")
    e.add_argument("--model", default=DEFAULT_MODEL, help="HF repo id (must match the committed model on refresh)")
    e.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD, help="cosine similarity threshold per effect")
    e.set_defaults(func=cmd_embed_renders)

    t = sub.add_parser("train-cost-model", help="train the cost model from measurements + static features")
    t.add_argument("--features", required=True, help="features.json from `node app/src/gl/mlx/extractFeatures.mjs --out features.json`")
    t.add_argument("--measurements", required=True, help="cost_measurements.jsonl from the harness sweep export")
    t.add_argument("--declared", default=str(REPO / "app/src/gl/mlx/declaredCostTiers.json"), help="declared tier table")
    t.add_argument("--out", required=True, help="output path, e.g. mlx_artifacts/cost_model.json")
    t.add_argument("--alpha", type=float, default=1.0, help="ridge regularisation strength")
    t.set_defaults(func=cmd_train_cost_model)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
