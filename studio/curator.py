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
import json
import subprocess
import sys
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
    np.savez(Path(a.out), w=clf.coef_[0].astype("float32"),
             b=np.float32(clf.intercept_[0]), model=idx["model"], n=len(y),
             cv_acc=acc.mean(), cv_auc=auc.mean(), baseline=base.mean())
    print(f"{len(y)} labels ({int(y.sum())} likes / {int((1 - y).sum())} passes), "
          f"{folds}-fold CV")
    print(f"  held-out accuracy {acc.mean():.3f} +/- {acc.std():.3f}")
    print(f"  majority baseline {base.mean():.3f}")
    print(f"  held-out ROC-AUC  {auc.mean():.3f}   (0.5 = chance)")
    verdict = "BETTER THAN CHANCE" if auc.mean() > 0.6 else "NO BETTER THAN CHANCE"
    print(f"  -> {verdict}")
    print(Path(a.out))


def score_all(idx, model_path: Path):
    import numpy as np

    m = np.load(model_path, allow_pickle=False)
    if str(m["model"]) != idx["model"]:
        sys.exit(f"model trained on {m['model']}, index is {idx['model']}")
    return 1 / (1 + np.exp(-(idx["emb"] @ m["w"] + m["b"])))


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

    print("curator selfcheck OK")


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
    sp.add_argument("--out", default="taste.npz")
    sp.add_argument("--folds", type=int, default=5)
    sp.add_argument("-C", type=float, default=0.05, help="inverse L2 strength")
    sp.set_defaults(func=cmd_train)

    sp = sub.add_parser("rank", help="score the index, print a diversified top-K")
    sp.add_argument("--index", required=True)
    sp.add_argument("--model", default="taste.npz")
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
