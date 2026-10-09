#!/usr/bin/env python3
"""studio/hits_bridge.py — favourites ("HITS" feed) -> curator.py labels.json (issue #91).

    app EXPORT (the bundle carries the hits feed) -> hits_bridge.py build -> labels.json -> curator.py train

Bridges the app's favourited seeds to curator.py's label format without hand-
editing JSON. Likes = favourited seeds. Passes = every other seed already
rendered in the same batch pool (issue #91: "passes can be drawn from other
seeds in a rendered batch").

A favourite whose seed isn't already in the pool gets rendered on demand via
`studio.py render`, using that favourite's own layoutParams/paletteId (falling
back to the pool's base project for anything it doesn't carry) — exactly the
"a favourite's seed can be rendered on demand" bridge the issue asks for.

Full workflow:

    studio.py batch base.project.json -o pool/ --count 200      # the "passes" pool
    python3 studio/hits_bridge.py build --hits export.json --pool pool/ --out labels.json
    (any app EXPORT file works — the hits feed rides in the bundle; legacy ↓ HITS files too)
    python3 studio/curator.py embed pool/
    python3 studio/curator.py train --index pool/curator-index.npz --labels labels.json
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STUDIO_PY = HERE / "studio.py"


# ── pure logic (stdlib only, covered by `selfcheck`) ───────────────────────


def build_labels(hit_seeds: set[int], pool_sidecars: dict[str, int]) -> dict[str, int]:
    """pool_sidecars: PNG filename -> seed rendered there. -> {filename: 0/1}."""
    return {name: int(seed in hit_seeds) for name, seed in pool_sidecars.items()}


def missing_hit_seeds(hit_seeds: set[int], pool_sidecars: dict[str, int]) -> list[int]:
    """Favourited seeds with no PNG in the pool yet, so they can be rendered."""
    have = set(pool_sidecars.values())
    return sorted(s for s in hit_seeds if s not in have)


# ── pool / rendering ─────────────────────────────────────────────────────


def build_bold(labels: dict[str, int], sidecars: dict[str, int], favorite_seeds: set[int]) -> dict[str, int]:
    """#954 — among keeps, 1 if that render's seed was favorited, else 0.

    Passes are omitted. Lois learns what turns a keeper into a favorite,
    not favorite-vs-pass (that's the taste probe's job).
    """
    out = {}
    for name, lab in labels.items():
        if int(lab) != 1 or name not in sidecars:
            continue
        out[name] = 1 if sidecars[name] in favorite_seeds else 0
    return out


def build_bold_from_keeps(keeps: list[dict], sidecars: dict[str, int]) -> dict[str, int]:
    """#996 — keeps: [{seed, favorite, ...}]. sidecars: filename -> seed.
    -> {filename: 1/0}. Favorites are a subset of keeps, so both classes
    appear when both actions have been used. Keeps with no pool render
    are skipped (cmd_bold renders the missing ones first).
    """
    seed_to_name: dict[int, str] = {}
    for name, seed in sidecars.items():
        seed_to_name.setdefault(int(seed) & 0xFFFFFFFF, name)
    out: dict[str, int] = {}
    for k in keeps:
        try:
            s = int(k["seed"]) & 0xFFFFFFFF
        except (KeyError, TypeError, ValueError):
            continue
        name = seed_to_name.get(s)
        if name is None:
            continue
        out[name] = 1 if k.get("favorite") else 0
    return out


def scan_pool(pool: Path) -> dict[str, int]:
    out = {}
    for png in sorted(pool.glob("*.png")):
        sidecar = png.with_suffix(".json")
        if not sidecar.exists():
            continue
        out[png.name] = int(json.loads(sidecar.read_text())["seed"])
    return out


def scan_features(pool: Path) -> dict[str, dict]:
    """#719 — png -> named recipe features, from each render's sidecar.

    studio.py writes them (`_render.features`) from app/src/curator/recipeFeatures.js
    via render.mjs, for pool and hit renders alike, so keeps and passes carry the
    same definition. Sidecars from before #719 have none: they are skipped (and
    counted by the caller) rather than given invented features.
    """
    out = {}
    for png in sorted(pool.glob("*.png")):
        sidecar = png.with_suffix(".json")
        if not sidecar.exists():
            continue
        feats = (json.loads(sidecar.read_text()).get("_render") or {}).get("features")
        if isinstance(feats, dict):
            out[png.name] = feats
    return out


def write_hit_project(hits_export: dict, hit: dict, out_path: Path) -> None:
    """One favourite -> a standalone project JSON studio.py can render."""
    base = dict(hits_export.get("project") or {})
    base["seed"] = int(hit["seed"]) & 0xFFFFFFFF
    if hit.get("layoutParams"):
        base["layoutParams"] = hit["layoutParams"]
    if hit.get("paletteId"):
        base["paletteId"] = hit["paletteId"]
    # #537 — the recipe is only reproducible with its stream offsets (#305).
    if isinstance(hit.get("seedOffsets"), dict):
        base["seedOffsets"] = hit["seedOffsets"]
    # #719 — a keep's cast (enabled asset ids). Legacy hits have none: keep the
    # project's own pool rather than invent one.
    if isinstance(hit.get("assets"), list) and hit["assets"]:
        base["enabledAssets"] = {str(a): True for a in hit["assets"]}
    base.setdefault("version", 1)
    out_path.write_text(json.dumps(base, indent=2))


def render_hit(project_path: Path, pool: Path, seed: int, res: str) -> None:
    out = pool / f"hit-{seed:08x}.png"
    subprocess.run(
        [sys.executable, str(STUDIO_PY), "render", str(project_path),
         "-o", str(out), "--seed", str(seed), "--res", res, "--sidecar"],
        check=True,
    )


def recipe_png(recipe: Path, pool: Path) -> Path:
    """#762 — pool file for one recipe: recipe-0007.project.json -> pool/recipe-0007.png."""
    return pool / (recipe.name.split(".")[0] + ".png")


def cmd_pool(a) -> None:
    """#762 — render a varied recipe pool (studio/pool_recipes.mjs) with sidecars.

    Each render goes through `studio.py render --sidecar`, so every sidecar carries
    the recipe features (#759) the taste head trains on. Already-rendered recipes are
    skipped, so an interrupted run resumes where it stopped.
    """
    recipes = sorted(Path(a.recipes).glob("*.project.json"))
    if not recipes:
        sys.exit(f"{a.recipes}: no *.project.json recipes (run studio/pool_recipes.mjs first)")
    pool = Path(a.pool)
    pool.mkdir(parents=True, exist_ok=True)
    todo = [r for r in recipes if not recipe_png(r, pool).exists()]
    print(f"{len(recipes)} recipes, {len(recipes) - len(todo)} already rendered, rendering {len(todo)}...")
    for n, r in enumerate(todo, 1):
        seed = int(json.loads(r.read_text()).get("seed", 0)) & 0xFFFFFFFF
        subprocess.run(
            [sys.executable, str(STUDIO_PY), "render", str(r), "-o", str(recipe_png(r, pool)),
             "--seed", str(seed), "--res", a.res, "--sidecar"],
            check=True,
        )
        if n % 10 == 0 or n == len(todo):
            print(f"  {n}/{len(todo)}")


# ── cli ──────────────────────────────────────────────────────────────────


def cmd_build(a) -> None:
    hits_export = json.loads(Path(a.hits).read_text())
    hits = hits_export.get("hits") or []
    if not hits:
        sys.exit(f"{a.hits}: no hits found (export ↓ HITS from the app first, or pass --demo data)")
    hit_by_seed = {int(h["seed"]) & 0xFFFFFFFF: h for h in hits}
    hit_seeds = set(hit_by_seed)

    pool = Path(a.pool)
    pool.mkdir(parents=True, exist_ok=True)
    sidecars = scan_pool(pool)

    todo = missing_hit_seeds(hit_seeds, sidecars)
    if todo:
        print(f"rendering {len(todo)} favourited seed(s) not already in the pool...")
        tmp_project = pool / "_hit-render.project.json"
        for seed in todo:
            write_hit_project(hits_export, hit_by_seed[seed], tmp_project)
            render_hit(tmp_project, pool, seed, a.res)
        tmp_project.unlink(missing_ok=True)
        sidecars = scan_pool(pool)

    labels = build_labels(hit_seeds, sidecars)
    Path(a.out).write_text(json.dumps(labels, indent=1, sort_keys=True))
    # #719 — the features ledger, keyed exactly like labels.json.
    feats = scan_features(pool)
    features = {name: feats[name] for name in labels if name in feats}
    features_out = Path(a.features_out) if a.features_out else Path(a.out).with_name("features.json")
    features_out.write_text(json.dumps(features, indent=1, sort_keys=True))
    missing = len(labels) - len(features)
    print(f"{features_out}: {len(features)} feature rows"
          + (f" ({missing} renders predate #719 — re-render them to get features)" if missing else ""))
    pos = sum(labels.values())
    print(f"{a.out}: {len(labels)} labels ({pos} likes / {len(labels) - pos} passes) from pool {pool}")
    if pos < len(hit_seeds):
        print(f"warning: only {pos}/{len(hit_seeds)} favourited seeds ended up labelled "
              "(duplicate seeds, or a render failed)", file=sys.stderr)


def cmd_selfcheck(_a=None) -> None:
    sidecars = {"000-a.png": 1, "001-b.png": 2, "002-c.png": 3}
    assert build_labels({2}, sidecars) == {"000-a.png": 0, "001-b.png": 1, "002-c.png": 0}
    likes = {"000-a.png": 1, "001-b.png": 1, "002-c.png": 0}
    assert build_bold(likes, sidecars, {1}) == {"000-a.png": 1, "001-b.png": 0}, "passes stay out"
    assert build_bold(likes, sidecars, set()) == {"000-a.png": 0, "001-b.png": 0}
    # #996 — favorites as a subset of keeps: both classes when both actions used
    keeps = [{"seed": 1, "favorite": True}, {"seed": 2, "favorite": False}, {"seed": 9, "favorite": False}]
    assert build_bold_from_keeps(keeps, sidecars) == {"000-a.png": 1, "001-b.png": 0}, "keeps without renders stay out"
    assert build_bold_from_keeps([], sidecars) == {}
    assert build_bold_from_keeps([{"seed": 2, "favorite": False}], sidecars) == {"001-b.png": 0}
    assert build_bold_from_keeps([{"nope": 1}], sidecars) == {}, "junk rows skipped, never throw"
    assert build_labels(set(), sidecars) == {"000-a.png": 0, "001-b.png": 0, "002-c.png": 0}
    assert missing_hit_seeds({2, 9}, sidecars) == [9]
    assert missing_hit_seeds(set(), sidecars) == []
    assert missing_hit_seeds({1, 2, 3}, sidecars) == []
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "p.json"
        offs = {"spatial": 1, "color": 2, "asset": 3, "noise": 4}
        write_hit_project({"project": {"seedOffsets": {"spatial": 9}}},
                          {"seed": 5, "seedOffsets": offs}, out)
        assert json.loads(out.read_text())["seedOffsets"] == offs, "hit offsets ride into the render project"
        write_hit_project({"project": {"seedOffsets": {"spatial": 9}}}, {"seed": 5}, out)
        assert json.loads(out.read_text())["seedOffsets"] == {"spatial": 9}, "legacy hit keeps the project's own"
        write_hit_project({"project": {"enabledAssets": {"a": True, "b": True}}},
                          {"seed": 5, "assets": ["xsh01", "xsh07"]}, out)
        assert json.loads(out.read_text())["enabledAssets"] == {"xsh01": True, "xsh07": True}, "hit cast rides into the render project"
        write_hit_project({"project": {"enabledAssets": {"a": True}}}, {"seed": 5}, out)
        assert json.loads(out.read_text())["enabledAssets"] == {"a": True}, "legacy hit keeps the project's cast"
        # #719 — features come from sidecars; pre-#719 sidecars are skipped, not invented
        pool = Path(d) / "pool"
        pool.mkdir()
        for name, side in (("a.png", {"seed": 1, "_render": {"features": {"v": 1, "system": "grid"}}}),
                           ("b.png", {"seed": 2, "_render": {}}),
                           ("c.png", None)):
            (pool / name).write_bytes(b"")
            if side is not None:
                (pool / name).with_suffix(".json").write_text(json.dumps(side))
        assert scan_features(pool) == {"a.png": {"v": 1, "system": "grid"}}, "features read from sidecars"
        # #762 — a recipe maps to its own pool png, stable across runs (resume)
        assert recipe_png(Path("r/recipe-0007.project.json"), Path("pool")) == Path("pool/recipe-0007.png")
    print("hits_bridge selfcheck OK")


def cmd_bold(a) -> None:
    hits_export = json.loads(Path(a.hits).read_text())
    keeps = hits_export.get("keeps") or []
    pool = Path(a.pool)
    pool.mkdir(parents=True, exist_ok=True)
    sidecars = scan_pool(pool)

    if keeps:
        # #996 — the export carries the keeps ledger: favorites as a subset
        # of keeps, so both classes appear when both actions were used.
        keep_by_seed: dict[int, dict] = {}
        for k in keeps:
            try:
                s = int(k["seed"]) & 0xFFFFFFFF
            except (KeyError, TypeError, ValueError):
                continue
            keep_by_seed.setdefault(s, k)
        todo = missing_hit_seeds(set(keep_by_seed), sidecars)
        if todo:
            print(f"rendering {len(todo)} kept seed(s) not already in the pool...")
            tmp_project = pool / "_keep-render.project.json"
            for seed in todo:
                write_hit_project(hits_export, keep_by_seed[seed], tmp_project)
                render_hit(tmp_project, pool, seed, a.res)
            tmp_project.unlink(missing_ok=True)
            sidecars = scan_pool(pool)
        bold = build_bold_from_keeps(keeps, sidecars)
        if not bold:
            sys.exit("no keeps matched the pool — bold.json would be empty")
        pos = sum(bold.values())
        if pos == 0 or pos == len(bold):
            sys.exit(
                f"Lois needs both sides: got {pos} favorites / {len(bold) - pos} kept-not-favorited. "
                "Keep some plates with K and favorite others with F, then export again."
            )
        Path(a.out).write_text(json.dumps(bold, indent=1, sort_keys=True))
        print(f"{a.out}: {len(bold)} keeps ({pos} favorites / {len(bold) - pos} kept-not-favorited)")
        return

    # Legacy path: exports from before #996 have no keeps ledger — every hit
    # was a favorite, so this can only ever produce one class.
    if not a.labels:
        sys.exit(f"{a.hits}: no keeps ledger — pass --labels labels.json for the legacy path, or re-export from the app")
    labels = json.loads(Path(a.labels).read_text())
    hits = hits_export.get("hits") or []
    favorite_seeds = {int(h["seed"]) & 0xFFFFFFFF for h in hits}
    bold = build_bold(labels, sidecars, favorite_seeds)
    if not bold:
        sys.exit("no keeps matched the pool — bold.json would be empty")
    pos = sum(bold.values())
    if pos == 0 or pos == len(bold):
        sys.exit(
            f"Lois needs both sides: got {pos} favorites / {len(bold) - pos} kept-not-favorited. "
            "This export predates keeps (issue #996) — keep some plates with K and favorite others with F, then export again."
        )
    Path(a.out).write_text(json.dumps(bold, indent=1, sort_keys=True))
    print(f"{a.out}: {len(bold)} keeps ({pos} favorites / {len(bold) - pos} kept-not-favorited)")



def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="hits_bridge", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("build", help="hits export + rendered pool -> labels.json")
    sp.add_argument("--hits", required=True, help="the app's EXPORT file (bundle) or a legacy ↓ HITS file")
    sp.add_argument("--pool", required=True, help="studio.py batch output dir (PNG + JSON sidecars)")
    sp.add_argument("--out", default="labels.json")
    sp.add_argument("--features-out", default=None,
                    help="named recipe features per labelled png (default: features.json next to --out)")
    sp.add_argument("--res", default="1", help="resolution for any on-demand hit renders")
    sp.set_defaults(func=cmd_build)

    sp = sub.add_parser("pool", help="#762: render studio/pool_recipes.mjs recipes into a pool (with sidecars)")
    sp.add_argument("--recipes", required=True, help="dir of *.project.json from pool_recipes.mjs")
    sp.add_argument("--pool", required=True, help="output dir for PNG + JSON sidecars")
    sp.add_argument("--res", default="1")
    sp.set_defaults(func=cmd_pool)

    sp = sub.add_parser("bold", help="#954 favorites-vs-keeps labels for the Lois probe")
    sp.add_argument("--labels", required=False, default=None, help="keep-vs-pass labels.json (1 = keep) — legacy path only")
    sp.add_argument("--hits", required=True, help="↓ HITS export — favorites, plus the keeps ledger (#996)")
    sp.add_argument("--pool", required=True, help="rendered pool (sidecars map png -> seed)")
    sp.add_argument("--res", default="1")
    sp.add_argument("--out", default="bold.json")
    sp.set_defaults(func=cmd_bold)

    sub.add_parser("selfcheck", help="pure-logic checks, no rendering, no model") \
        .set_defaults(func=cmd_selfcheck)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
