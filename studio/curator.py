#!/usr/bin/env python3
"""studio/curator.py — the Curator (issue #75, docs/BACKEND_V2_PLAN.md §3.B).

Turns hit-hunting into search over the generative space:

    studio.py batch -> PNGs -> embed (SigLIP on Apple MLX) -> label -> train -> rank / similar

The taste model is a linear probe over frozen SigLIP embeddings trained on *this
operator's* likes vs passes. Deliberately not a generic aesthetic scorer.

Everything runs locally on the Mac Studio. Weights come from the normal HF cache
(~/.cache/huggingface).

The selection logic (`rank_indices`, `diversify`) is stdlib-only and covered by
`python3 studio/curator.py selfcheck`, which needs no model and no numpy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Apple MLX backend via the mlx-embeddings package (macOS / Apple Silicon only).
# SigLIP so400m/384 is the embedding model; --model takes a full HF repo id.
# Indexes embedded with the old torch/open_clip backend (model string
# "ViT-L-14-quickgelu/openai") are NOT comparable — re-run `embed` to rebuild
# the index under the new model. The model string stored in the .npz guards
# against silent mixing (see score_all).
DEFAULT_MODEL = "mlx-community/siglip-so400m-patch14-384"
# Legacy torch/open_clip flag, kept so old scripts still parse; ignored by the
# MLX backend (the model comes from --model alone).
DEFAULT_PRETRAINED = ""


# ── pure selection logic (stdlib only — this is what selfcheck covers) ────


def rank_indices(scores) -> list[int]:
    """Indices of `scores`, best first. Ties keep their original order."""
    return sorted(range(len(scores)), key=lambda i: (-scores[i], i))


def diversify(order: list[int], clusters, k: int) -> list[int]:
    """Spread a best-first `order` across clusters, round-robin.

    Take each cluster's best unpicked item in turn, visiting clusters in the
    order their best item appears. Once every cluster has contributed, go round
    again — so k > cluster count still fills up, and k < cluster count returns k
    distinct clusters rather than k neighbours of one frame.
    """
    buckets: dict = {}
    for i in order:
        buckets.setdefault(clusters[i], []).append(i)
    queues = list(buckets.values())  # dict preserves first-seen order
    out: list[int] = []
    while len(out) < k and queues:
        queues = [q for q in queues if q]
        for q in queues:
            if len(out) >= k:
                break
            out.append(q.pop(0))
    return out


def label_path(root: Path, p: Path) -> str:
    """Index/label key: path relative to the index root, POSIX-style."""
    return Path(p).resolve().relative_to(Path(root).resolve()).as_posix()



# ── taste v1 (#762): the shared term rule, words, compatibility — stdlib only ──

TASTE_KIND = "kc-taste"
TASTE_VERSION = 1
# Fidelity (Spearman of the distilled head vs the probe on the pool) below this
# means the head can't reproduce the taste from recipe features; the app then
# keeps curating with the persona scorer rather than act on a bad copy.
HEAD_MIN_FIDELITY = 0.3
TERM_SKIP = {"v", "cast", "castSize", "num"}
TERM_FIXTURE = HERE.parent / "app" / "src" / "curator" / "tasteTerms.fixture.json"


def feature_terms(features: dict) -> list[str]:
    """#762 — the ONE term rule (mirrored by app/src/curator/tasteHead.js).

    Scalars/booleans -> key=value (booleans lowercase), arrays -> one term per
    element, None and the keys v/cast/castSize/num skipped. Pinned by
    app/src/curator/tasteTerms.fixture.json, asserted by both selfchecks.
    """
    out = []
    for k, v in features.items():
        if k in TERM_SKIP or v is None:
            continue
        vals = v if isinstance(v, list) else [v]
        for x in vals:
            if x is None:
                continue
            out.append(f"{k}={'true' if x is True else 'false' if x is False else x}")
    return out


def spearman(a, b) -> float:
    """Rank correlation (average ranks for ties). 0.0 when undefined."""
    def ranks(xs):
        order = sorted(range(len(xs)), key=lambda i: xs[i])
        r = [0.0] * len(xs)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2
            i = j + 1
        return r
    if len(a) != len(b) or len(a) < 2:
        return 0.0
    ra, rb = ranks(list(a)), ranks(list(b))
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    va = sum((x - ma) ** 2 for x in ra) ** 0.5
    vb = sum((y - mb) ** 2 for y in rb) ** 0.5
    return cov / (va * vb) if va and vb else 0.0


_WORDS = {
    "bodies": "{v} crowds", "density": "{v} density", "scale": "{v} marks",
    "system": "{v} layouts", "symmetry": "{v} symmetry", "behave": "{v} motion",
    "blend": "{v} blend", "palette": "the {v} palette", "castCategories": "{v} marks",
    "paletteShift": "{v} colour shift",
}
_BOOL_WORDS = {"accum": ("trails on", "trails off"), "mirror": ("mirrored", "unmirrored"),
               "bleed": ("bleed on", "bleed off"), "overlap": ("overlap", "no overlap")}
_NUM_WORDS = {"count": "more marks", "particleCount": "more particles", "scaleMid": "bigger marks",
              "rotateSpread": "wilder rotation", "alphaMid": "more opaque marks", "jitter": "looser placement",
              "density": "denser fields", "zTiers": "more depth tiers", "noiseFreq": "finer noise",
              "noiseSpeed": "faster noise", "displacement": "more displacement", "swarmCohesion": "tighter swarms",
              "gravityWells": "stronger gravity", "damping": "more damping", "wind": "more wind",
              "flap": "more flap", "breath": "more breath", "lifeDrift": "more drift"}


def describe_term(term: str) -> str:
    """'bodies=sparse' -> 'sparse crowds'; 'accum=true' -> 'trails on'."""
    k, _, v = term.partition("=")
    if k in _BOOL_WORDS and v in ("true", "false"):
        return _BOOL_WORDS[k][0 if v == "true" else 1]
    return _WORDS.get(k, "{k} {v}").format(k=k, v=v)


def describe_head(head: dict, n: int = 5) -> str:
    """Human summary of a distilled head: what it leans toward and away from."""
    items = [(w, describe_term(t)) for t, w in (head.get("terms") or {}).items()]
    items += [(w, _NUM_WORDS.get(k, f"more {k}")) for k, w in (head.get("num") or {}).items()]
    items = [x for x in items if abs(x[0]) > 1e-9]
    if not items:
        return "no clear lean (the head learned nothing distinguishable)"
    pos = [d for w, d in sorted(items, key=lambda x: -x[0]) if w > 0][:n]
    neg = [d for w, d in sorted(items, key=lambda x: x[0]) if w < 0][:n]
    parts = []
    if pos:
        parts.append("leans " + ", ".join(pos))
    if neg:
        parts.append("avoids " + ", ".join(neg))
    return "; ".join(parts)


def check_compatible(model_meta: dict, index_model: str, index_dims: int) -> None:
    """DECISIONS Taste v1 migration rule: refuse, never silently mix dimensions."""
    m, d = model_meta.get("model"), model_meta.get("dims")
    if m != index_model or (d is not None and int(d) != int(index_dims)):
        sys.exit(f"taste was trained on {m}/{d}-dim, index is {index_model}/{index_dims}-dim"
                 " — re-embed required (curator.py embed), then retrain")


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ── index ────────────────────────────────────────────────────────────────


def index_path(folder: Path, given: str | None) -> Path:
    return Path(given) if given else Path(folder) / "curator-index.npz"


def load_index(path: Path):
    import numpy as np

    z = np.load(path, allow_pickle=False)
    return {"root": Path(str(z["root"])), "paths": [str(p) for p in z["paths"]],
            "emb": z["emb"], "model": str(z["model"])}


def mlx_embed_model(repo_id: str):
    """(model, processor) for image embedding — Apple MLX backend.

    All heavy imports happen here, never at module top level, so
    `curator.py selfcheck` stays stdlib-only.
    """
    from mlx_embeddings.utils import load

    try:
        model, processor = load(repo_id)
    except Exception as e:
        raise SystemExit(
            f"could not load {repo_id} via mlx-embeddings: {e}\n"
            "hint: pip install mlx-embeddings (Apple Silicon Mac only). "
            "Indexes built with the old torch/CLIP backend must be rebuilt: "
            "re-run `curator.py embed <folder>`."
        ) from e
    model.eval()
    return model, processor


def embed_images(paths, model_id, pretrained="", batch=32, log=print):
    """-> float32 (N, D), L2-normalised. Apple MLX backend (SigLIP)."""
    import numpy as np
    import mlx.core as mx
    from PIL import Image

    if pretrained:
        log(f"  note: --pretrained {pretrained!r} is ignored by the MLX backend "
            f"(the model comes from --model {model_id!r})")
    model, processor = mlx_embed_model(model_id)
    log(f"  {model_id} via mlx-embeddings, {len(paths)} images")
    chunks = []
    for s in range(0, len(paths), batch):
        batch_paths = paths[s:s + batch]
        # PNGs have an alpha channel; the SigLIP processor wants RGB.
        images = [Image.open(p).convert("RGB") for p in batch_paths]
        pixel_values = mx.array(processor(images=images, return_tensors="np")["pixel_values"])
        feats = model.get_image_features(pixel_values=pixel_values)
        mx.eval(feats)
        arr = np.asarray(feats, dtype=np.float32)
        arr /= np.linalg.norm(arr, axis=-1, keepdims=True)
        chunks.append(arr)
        log(f"  {min(s + batch, len(paths))}/{len(paths)}")
    return np.concatenate(chunks).astype("float32")


def cmd_embed(a) -> None:
    import numpy as np

    root = Path(a.folder).resolve()
    paths = sorted(p for p in root.rglob("*.png"))
    if not paths:
        sys.exit(f"no PNGs under {root}")
    out = index_path(root, a.index)
    emb = embed_images(paths, a.model, a.pretrained)
    # The model string is the HF repo id verbatim; score_all refuses to mix a
    # taste model trained on one embedding model with an index from another.
    np.savez(out, root=str(root), paths=np.array([label_path(root, p) for p in paths]),
             emb=emb, model=a.model)
    print(f"{out}  ({len(paths)} x {emb.shape[1]})")


# ── labelling ────────────────────────────────────────────────────────────


def cmd_label(a) -> None:
    """Flip through the index in Preview, one key each: y = like, n = pass."""
    idx = load_index(Path(a.index))
    out = Path(a.out)
    labels = json.loads(out.read_text()) if out.exists() else {}
    todo = [p for p in idx["paths"] if p not in labels][: a.limit]
    print(f"{len(labels)} already labelled, {len(todo)} to go. y=like n=pass s=skip q=quit")
    try:
        for i, rel in enumerate(todo, 1):
            full = idx["root"] / rel
            subprocess.run(["open", "-g", "-a", "Preview", str(full)], check=False)
            ans = input(f"[{i}/{len(todo)}] {rel} ? ").strip().lower()
            if ans.startswith("q"):
                break
            if ans.startswith("y"):
                labels[rel] = 1
            elif ans.startswith("n"):
                labels[rel] = 0
    finally:
        out.write_text(json.dumps(labels, indent=1, sort_keys=True))
        pos = sum(labels.values())
        print(f"\n{out}: {len(labels)} labels ({pos} likes / {len(labels) - pos} passes)")


def cmd_sheet(a) -> None:
    """Contact sheet(s) of the index — label many at a glance, by number."""
    from PIL import Image, ImageDraw

    idx = load_index(Path(a.index))
    paths, cols, cell = idx["paths"], a.cols, a.cell
    outdir = Path(a.out)
    outdir.mkdir(parents=True, exist_ok=True)
    per = cols * a.rows
    order = list(range(len(paths)))[a.start: a.start + (a.count or len(paths))]
    written = []
    for s in range(0, len(order), per):
        page = order[s:s + per]
        rows = -(-len(page) // cols)
        sheet = Image.new("RGB", (cols * cell, rows * (cell + 14)), "white")
        draw = ImageDraw.Draw(sheet)
        for n, i in enumerate(page):
            im = Image.open(idx["root"] / paths[i]).convert("RGB")
            im.thumbnail((cell, cell))
            x, y = (n % cols) * cell, (n // cols) * (cell + 14)
            sheet.paste(im, (x, y + 14))
            draw.text((x + 2, y + 2), str(i), fill="black")
        p = outdir / f"sheet-{s // per:02d}.png"
        sheet.save(p)
        written.append(p)
    print("\n".join(str(p) for p in written))
    print(f"{len(order)} tiles, numbers are index positions "
          f"(curator.py apply-sheet --index ... --likes 3,7,12)")


def cmd_apply_sheet(a) -> None:
    """Turn 'these index numbers are likes' into a label file."""
    idx = load_index(Path(a.index))
    out = Path(a.out)
    labels = json.loads(out.read_text()) if out.exists() else {}
    nums = lambda s: [int(x) for x in s.replace(",", " ").split()] if s else []
    seen = set(nums(a.likes)) | set(nums(a.passes))
    for i in nums(a.likes):
        labels[idx["paths"][i]] = 1
    for i in nums(a.passes):
        labels[idx["paths"][i]] = 0
    out.write_text(json.dumps(labels, indent=1, sort_keys=True))
    pos = sum(labels.values())
    print(f"{out}: +{len(seen)} -> {len(labels)} labels "
          f"({pos} likes / {len(labels) - pos} passes)")


# ── taste model ──────────────────────────────────────────────────────────


def cmd_train(a) -> None:
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.dummy import DummyClassifier

    idx = load_index(Path(a.index))
    labels = json.loads(Path(a.labels).read_text())
    pos = {p: i for i, p in enumerate(idx["paths"])}
    missing = [p for p in labels if p not in pos]
    if missing:
        sys.exit(f"{len(missing)} labelled paths are not in the index, e.g. {missing[0]}")
    keys = sorted(labels)
    X = idx["emb"][[pos[k] for k in keys]]
    y = np.array([int(labels[k]) for k in keys])
    if len(set(y.tolist())) < 2:
        sys.exit("need both likes and passes")

    # C is small on purpose: 768 dims, dozens of labels — the probe has to be
    # squeezed hard or it memorises the training set.
    clf = LogisticRegression(C=a.C, max_iter=2000, class_weight="balanced")
    folds = min(a.folds, int(np.bincount(y).min()))
    if folds < 2:
        sys.exit("need at least 2 examples of the minority class")
    cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=0)
    acc = cross_val_score(clf, X, y, cv=cv, scoring="accuracy")
    auc = cross_val_score(clf, X, y, cv=cv, scoring="roc_auc")
    # Baseline = always predict the majority class. Chance for a stratified
    # guess is 0.5 AUC; majority-class accuracy is the harder bar, so use it.
    base = cross_val_score(DummyClassifier(strategy="most_frequent"), X, y, cv=cv,
                           scoring="accuracy")

    clf.fit(X, y)
    out = Path(a.out)
    if out.suffix == ".npz":  # legacy format, still readable by rank/similar
        np.savez(out, w=clf.coef_[0].astype("float32"),
                 b=np.float32(clf.intercept_[0]), model=idx["model"], n=len(y),
                 cv_acc=acc.mean(), cv_auc=auc.mean(), baseline=base.mean())
    else:
        taste = build_taste(idx, keys, y, clf, cv={"acc": float(acc.mean()), "auc": float(auc.mean()),
                            "baseline": float(base.mean()), "folds": folds}, C=a.C,
                            features_path=Path(a.features) if a.features else None, alpha=a.head_alpha)
        out.write_text(json.dumps(taste, indent=1, sort_keys=True))
        h = taste.get("head")
        if h:
            print(f"  head fidelity {h['fidelity']:.3f} (Spearman vs probe on {h['fitOn']} pool renders)")
            print(f"  {describe_head(h)}")
    print(f"{len(y)} labels ({int(y.sum())} likes / {int((1 - y).sum())} passes), "
          f"{folds}-fold CV")
    print(f"  held-out accuracy {acc.mean():.3f} +/- {acc.std():.3f}")
    print(f"  majority baseline {base.mean():.3f}")
    print(f"  held-out ROC-AUC  {auc.mean():.3f}   (0.5 = chance)")
    verdict = "BETTER THAN CHANCE" if auc.mean() > 0.6 else "NO BETTER THAN CHANCE"
    print(f"  -> {verdict}")
    print(Path(a.out))


def fit_head(feature_rows: list[dict], target, alpha: float = 1.0) -> dict:
    """#762 — distil the probe into a linear head over recipe features.

    Ridge on one-hot feature_terms + the normalized `num` block, target = the
    probe's decision score per render. This is what the browser runs (it can't
    embed) and what `inspect` reads. fidelity = Spearman(head, probe).
    """
    import numpy as np

    vocab = sorted({t for f in feature_rows for t in feature_terms(f)})
    nums = sorted({k for f in feature_rows for k in (f.get("num") or {})})
    col = {t: i for i, t in enumerate(vocab)}
    X = np.zeros((len(feature_rows), len(vocab) + len(nums)))
    for r, f in enumerate(feature_rows):
        for t in feature_terms(f):
            X[r, col[t]] = 1.0
        for j, k in enumerate(nums):
            X[r, len(vocab) + j] = float((f.get("num") or {}).get(k, 0.0))
    y = np.asarray(target, dtype=float)
    xm, ym = X.mean(axis=0), y.mean()
    Xc = X - xm
    w = np.linalg.solve(Xc.T @ Xc + alpha * np.eye(X.shape[1]), Xc.T @ (y - ym))
    bias = float(ym - xm @ w)
    pred = X @ w + bias
    rnd = lambda v: round(float(v), 6)  # noqa: E731
    return {
        "terms": {t: rnd(w[i]) for i, t in enumerate(vocab)},
        "num": {k: rnd(w[len(vocab) + j]) for j, k in enumerate(nums)},
        "bias": rnd(bias),
        "alpha": alpha,
        "fidelity": round(spearman(pred.tolist(), y.tolist()), 4),
        "fitOn": len(feature_rows),
    }


def build_taste(idx, keys, y, clf, *, cv, C, features_path, alpha) -> dict:
    """Taste v1 (docs/DECISIONS.md): model + dims, probe, head, manifest, labels."""
    import numpy as np

    w = clf.coef_[0]
    taste = {
        "kind": TASTE_KIND, "version": TASTE_VERSION,
        "model": idx["model"], "dims": int(idx["emb"].shape[1]),
        "probe": {"weights": [round(float(x), 6) for x in w], "bias": round(float(clf.intercept_[0]), 6), "C": C},
        # Content hashes, never images: privacy, and it keeps the file small.
        "manifest": [{"png": k, "sha256": file_sha256(idx["root"] / k)} for k in keys
                     if (idx["root"] / k).exists()],
        "labels": {"likes": int(y.sum()), "passes": int(len(y) - y.sum())},
        "cv": cv,
        "trainedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if features_path:
        feats = json.loads(features_path.read_text())
        pos = {p: i for i, p in enumerate(idx["paths"])}
        names = [n for n in sorted(feats) if n in pos]
        if len(names) < 10:
            sys.exit(f"{features_path}: only {len(names)} pool renders have features — need 10+ "
                     "(render the pool with sidecars: hits_bridge.py pool / studio.py --sidecar)")
        versions = {feats[n].get("v") for n in names}
        if len(versions) != 1:
            sys.exit(f"{features_path}: mixed feature versions {sorted(versions, key=str)} — re-render the pool")
        scores = idx["emb"][[pos[n] for n in names]] @ w + clf.intercept_[0]
        taste["featuresVersion"] = versions.pop()
        taste["head"] = fit_head([feats[n] for n in names], np.asarray(scores).tolist(), alpha=alpha)
    return taste


def load_model(path: Path) -> dict:
    """Probe from taste.json (v1) or the legacy taste.npz."""
    import numpy as np

    if path.suffix == ".json":
        t = json.loads(path.read_text())
        if t.get("kind") != TASTE_KIND or t.get("version") != TASTE_VERSION:
            sys.exit(f"{path}: not a Taste v{TASTE_VERSION} file")
        return {"w": np.asarray(t["probe"]["weights"], dtype="float32"), "b": float(t["probe"]["bias"]),
                "model": t["model"], "dims": t["dims"]}
    m = np.load(path, allow_pickle=False)
    return {"w": m["w"], "b": float(m["b"]), "model": str(m["model"]), "dims": int(m["w"].shape[0])}


def score_all(idx, model_path: Path):
    import numpy as np

    m = load_model(model_path)
    check_compatible(m, idx["model"], idx["emb"].shape[1])
    return 1 / (1 + np.exp(-(idx["emb"] @ m["w"] + m["b"])))


def cmd_inspect(a) -> None:
    """#762 — a taste in human terms, not a weight dump."""
    t = json.loads(Path(a.taste).read_text())
    if t.get("kind") != TASTE_KIND:
        sys.exit(f"{a.taste}: not a taste file")
    lab = t.get("labels", {})
    print(f"taste v{t.get('version')} · {t.get('model')} ({t.get('dims')}-dim) · trained {t.get('trainedAt', '?')}")
    print(f"  learned from {lab.get('likes', 0)} keeps / {lab.get('passes', 0)} passes"
          f" · {len(t.get('manifest', []))} renders in the manifest")
    cv = t.get("cv") or {}
    if cv:
        print(f"  held-out ROC-AUC {cv.get('auc', 0):.3f} (0.5 = chance)")
    h = t.get("head")
    if not h:
        print("  no head — train with --features to give the app a live curator")
        return
    print(f"  {describe_head(h)}")
    print(f"  head fidelity {h.get('fidelity', 0):.3f} vs the probe on {h.get('fitOn', 0)} renders")
    if h.get("fidelity", 0) < HEAD_MIN_FIDELITY:
        print("  WARNING: the head can't reproduce this taste from recipe features —"
              " live curation will stay on the persona scorer")


def cmd_rank(a) -> None:
    import numpy as np

    idx = load_index(Path(a.index))
    scores = score_all(idx, Path(a.model))
    order = rank_indices(scores.tolist())
    if a.no_diversify:
        picked = order[: a.k]
    else:
        from sklearn.cluster import KMeans

        pool = order[: max(a.pool, a.k)]
        n_clusters = min(a.clusters, len(pool))
        km = KMeans(n_clusters=n_clusters, n_init=10, random_state=0)
        lab = km.fit_predict(idx["emb"][pool])
        clusters = {i: int(lab[n]) for n, i in enumerate(pool)}
        picked = diversify(pool, clusters, a.k)
    for rank, i in enumerate(picked, 1):
        print(f"{rank:3d}  {scores[i]:.4f}  {idx['paths'][i]}")
    if a.open:
        subprocess.run(["open"] + [str(idx["root"] / idx["paths"][i]) for i in picked],
                       check=False)


def cmd_similar(a) -> None:
    import numpy as np

    idx = load_index(Path(a.index))
    query = Path(a.image).resolve()
    try:
        rel = label_path(idx["root"], query)
        q = idx["emb"][idx["paths"].index(rel)]
    except (ValueError, KeyError):
        # The stored model string is the HF repo id verbatim (MLX backend).
        # An old torch/CLIP index ("ViT-L-14-quickgelu/openai") fails here with
        # a clear load error telling you to re-run `embed` — never silently.
        q = embed_images([query], idx["model"], log=lambda *_: None)[0]
    sims = idx["emb"] @ q
    for i in rank_indices(sims.tolist())[: a.k]:
        print(f"{sims[i]:.4f}  {idx['paths'][i]}")


# ── selfcheck (stdlib only, no model, no numpy) ──────────────────────────


def cmd_selfcheck(_a=None) -> None:
    # ranking order is exactly score order, ties stable
    assert rank_indices([0.1, 0.9, 0.5]) == [1, 2, 0]
    assert rank_indices([0.5, 0.5, 0.5]) == [0, 1, 2]
    assert rank_indices([]) == []

    # the whole point: the top of the list is 5 near-identical frames, and
    # diversify must not hand back 3 of them.
    order = rank_indices([0.99, 0.98, 0.97, 0.96, 0.95, 0.90, 0.80])
    clusters = {0: "a", 1: "a", 2: "a", 3: "a", 4: "a", 5: "b", 6: "c"}
    top = diversify(order, clusters, 3)
    assert top == [0, 5, 6], top
    assert len({clusters[i] for i in top}) == 3, "one pick per cluster"
    assert order[:3] == [0, 1, 2], "...whereas plain ranking gives 3 of cluster a"

    # k larger than the cluster count keeps going round, best-first within cluster
    assert diversify(order, clusters, 6) == [0, 5, 6, 1, 2, 3]
    # k larger than the pool returns the pool, no duplicates
    full = diversify(order, clusters, 99)
    assert sorted(full) == list(range(7)) and len(set(full)) == 7
    assert diversify([], {}, 5) == []
    # a single cluster degrades to plain ranking
    assert diversify(order, {i: "a" for i in range(7)}, 3) == [0, 1, 2]
    # cluster ids are visited by the rank of their best member, not by id value
    assert diversify([2, 0, 1], {0: 9, 1: 9, 2: 3}, 2) == [2, 0]

    # label keys are index-root-relative and stable
    assert label_path(Path("/a/b"), Path("/a/b/c/d.png")) == "c/d.png"

    # #762 — the term rule matches the fixture the browser also asserts
    for case in json.loads(TERM_FIXTURE.read_text())["cases"]:
        assert feature_terms(case["features"]) == case["terms"], (feature_terms(case["features"]), case["terms"])
    assert abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12
    assert abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12
    assert spearman([1, 1], [1, 1]) == 0.0
    assert describe_term("bodies=sparse") == "sparse crowds"
    assert describe_term("accum=false") == "trails off"
    words = describe_head({"terms": {"scale=large": 1.2, "blend=screen": -0.8}, "num": {"count": -0.3}})
    assert words == "leans large marks; avoids screen blend, more marks", words
    try:
        check_compatible({"model": "a", "dims": 768}, "a", 1152)
        raise AssertionError("dims mismatch must refuse")
    except SystemExit as e:
        assert "re-embed required" in str(e)

    # #762 — the numeric path end to end (needs numpy + scikit-learn, as train does)
    try:
        import numpy  # noqa: F401
        import sklearn  # noqa: F401
    except ImportError:
        print("  (skipped taste train/head check: numpy/scikit-learn not installed)")
    else:
        _selfcheck_taste_train()

    print("curator selfcheck OK")


def _selfcheck_taste_train() -> None:
    """Synthetic pool: large-scale renders are the keeps. No MLX, no images needed."""
    import tempfile
    import numpy as np

    rng = np.random.default_rng(0)
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        n, dims = 80, 16
        paths, feats, labels = [], {}, {}
        emb = rng.normal(size=(n, dims)).astype("float32")
        for i in range(n):
            name = f"recipe-{i:04d}.png"
            (root / name).write_bytes(bytes([i]))
            large = i % 2 == 0
            emb[i, 0] += 3.0 if large else -3.0  # the embedding "sees" size
            feats[name] = {"v": 2, "system": "grid", "scale": "large" if large else "small",
                           "accum": bool(i % 3), "num": {"count": round(float(rng.random()), 4)}}
            labels[name] = 1 if large else 0
            paths.append(name)
        np.savez(root / "idx.npz", root=str(root), paths=np.array(paths), emb=emb, model="m/test")
        (root / "labels.json").write_text(json.dumps(labels))
        (root / "features.json").write_text(json.dumps(feats))
        out = root / "taste.json"
        main(["train", "--index", str(root / "idx.npz"), "--labels", str(root / "labels.json"),
              "--features", str(root / "features.json"), "--out", str(out)])
        t = json.loads(out.read_text())
        assert t["kind"] == TASTE_KIND and t["version"] == TASTE_VERSION
        assert t["model"] == "m/test" and t["dims"] == dims and len(t["probe"]["weights"]) == dims
        assert t["labels"] == {"likes": 40, "passes": 40}
        assert len(t["manifest"]) == n and all(len(m["sha256"]) == 64 for m in t["manifest"])
        assert "png" in t["manifest"][0] and "image" not in json.dumps(t["manifest"][0]), "hashes, never images"
        assert t["featuresVersion"] == 2
        h = t["head"]
        assert h["terms"]["scale=large"] > 0 > h["terms"]["scale=small"], h["terms"]
        assert h["fidelity"] > 0.5, h["fidelity"]
        assert "large marks" in describe_head(h)
        # rank reads taste.json and refuses a mismatched index
        m = load_model(out)
        assert m["dims"] == dims
        try:
            check_compatible(m, "m/other", dims)
            raise AssertionError("model mismatch must refuse")
        except SystemExit:
            pass
    print("  taste train/head check OK")


# ── cli ──────────────────────────────────────────────────────────────────


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="curator", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("embed", help="SigLIP/MLX-embed every PNG under a folder -> .npz index")
    sp.add_argument("folder")
    sp.add_argument("--index", default=None, help="default <folder>/curator-index.npz")
    sp.add_argument("--model", default=DEFAULT_MODEL,
                    help="HF repo id for the MLX embedding model")
    sp.add_argument("--pretrained", default=DEFAULT_PRETRAINED,
                    help="legacy torch/open_clip flag, ignored by the MLX backend")
    sp.set_defaults(func=cmd_embed)

    sp = sub.add_parser("label", help="flip through the index in Preview, y/n")
    sp.add_argument("--index", required=True)
    sp.add_argument("--out", default="labels.json")
    sp.add_argument("--limit", type=int, default=200)
    sp.set_defaults(func=cmd_label)

    sp = sub.add_parser("sheet", help="numbered contact sheets — label many at a glance")
    sp.add_argument("--index", required=True)
    sp.add_argument("--out", required=True, help="output directory")
    sp.add_argument("--cols", type=int, default=5)
    sp.add_argument("--rows", type=int, default=5)
    sp.add_argument("--cell", type=int, default=256)
    sp.add_argument("--start", type=int, default=0)
    sp.add_argument("--count", type=int, default=0, help="0 = all")
    sp.set_defaults(func=cmd_sheet)

    sp = sub.add_parser("apply-sheet", help="index numbers off a contact sheet -> labels")
    sp.add_argument("--index", required=True)
    sp.add_argument("--out", default="labels.json")
    sp.add_argument("--likes", default="")
    sp.add_argument("--passes", default="")
    sp.set_defaults(func=cmd_apply_sheet)

    sp = sub.add_parser("train", help="linear probe on likes vs passes + held-out accuracy")
    sp.add_argument("--index", required=True)
    sp.add_argument("--labels", required=True)
    sp.add_argument("--out", default="taste.json", help="taste.json (Taste v1) — or *.npz for the legacy file")
    sp.add_argument("--features", default=None,
                    help="#762 features.json from hits_bridge build — distils the head the app runs")
    sp.add_argument("--head-alpha", type=float, default=1.0, help="ridge strength for the distilled head")
    sp.add_argument("--folds", type=int, default=5)
    sp.add_argument("-C", type=float, default=0.05, help="inverse L2 strength")
    sp.set_defaults(func=cmd_train)

    sp = sub.add_parser("inspect", help="#762: describe a taste.json in human terms")
    sp.add_argument("taste")
    sp.set_defaults(func=cmd_inspect)

    sp = sub.add_parser("rank", help="score the index, print a diversified top-K")
    sp.add_argument("--index", required=True)
    sp.add_argument("--model", default="taste.json", help="taste.json or legacy taste.npz")
    sp.add_argument("-k", type=int, default=20)
    sp.add_argument("--pool", type=int, default=200, help="candidates clustered for diversity")
    sp.add_argument("--clusters", type=int, default=20)
    sp.add_argument("--no-diversify", action="store_true")
    sp.add_argument("--open", action="store_true", help="open the shortlist in Preview")
    sp.set_defaults(func=cmd_rank)

    sp = sub.add_parser("similar", help="more like this — nearest neighbours in embedding space")
    sp.add_argument("image")
    sp.add_argument("--index", required=True)
    sp.add_argument("-k", type=int, default=10)
    sp.set_defaults(func=cmd_similar)

    sub.add_parser("selfcheck", help="assert the selection logic (no model needed)") \
        .set_defaults(func=cmd_selfcheck)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
