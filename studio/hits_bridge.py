#!/usr/bin/env python3
"""studio/hits_bridge.py — favourites ("HITS" feed) -> curator.py labels.json (issue #91).

    app EXPORT (the bundle carries the hits feed) -> hits_bridge.py build -> labels.json -> curator.py train
    app keeps.jsonl + passes.jsonl (#1173)       -> hits_bridge.py ledgers -> labels.json -> curator.py train

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


# ── #1173 keep/pass ledgers (the app's keeps.jsonl / passes.jsonl) ──────────

LEDGER_FILES = {"keeps": "keeps.jsonl", "passes": "passes.jsonl"}


def is_ledger_row(o) -> bool:
    """Same schema the app asserts (app/src/curator/tasteLedger.js isLedgerRow)."""
    if not isinstance(o, dict):
        return False
    seed = o.get("seed")
    if not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed <= 0xFFFFFFFF:
        return False
    r = o.get("recipe")
    if not isinstance(r, dict) or "layoutParams" not in r or "paletteId" not in r:
        return False
    if r["layoutParams"] is not None and not isinstance(r["layoutParams"], dict):
        return False
    if r["paletteId"] is not None and not isinstance(r["paletteId"], str):
        return False
    if not isinstance(o.get("timestamp"), str) or not o["timestamp"]:
        return False
    if "keepContext" not in o or (o["keepContext"] is not None and not isinstance(o["keepContext"], dict)):
        return False
    if "projectRef" not in o or (o["projectRef"] is not None and not isinstance(o["projectRef"], str)):
        return False
    return True


def parse_ledger(text: str, name: str = "ledger", warn=None) -> list[dict]:
    """JSONL -> rows. A corrupt or off-schema line is skipped WITH a warning
    (file + line number), never silently dropped. Blank lines are not lines."""
    warn = warn or (lambda m: print(m, file=sys.stderr))
    rows = []
    for n, line in enumerate(text.split("\n"), 1):
        if not line.strip():
            continue
        try:
            o = json.loads(line)
        except ValueError:
            warn(f"warning: {name} line {n}: not JSON — skipped")
            continue
        if not is_ledger_row(o):
            warn(f"warning: {name} line {n}: not a ledger row — skipped")
            continue
        rows.append(o)
    return rows


def ledger_seed_labels(keeps: list[dict], passes: list[dict]) -> dict[int, int]:
    """seed -> 1 (kept) / 0 (passed). Two-ledger rule: keeps are positives,
    passes negatives, nothing else is a label. A seed both kept and passed
    takes its LATEST act (ISO timestamps sort); a tie goes to the keep."""
    latest: dict[int, tuple[str, int]] = {}
    for label, rows in ((0, passes), (1, keeps)):
        for r in rows:
            s = r["seed"] & 0xFFFFFFFF
            prev = latest.get(s)
            if prev is None or r["timestamp"] > prev[0] or (r["timestamp"] == prev[0] and label == 1):
                latest[s] = (r["timestamp"], label)
    return {s: lab for s, (_, lab) in latest.items()}


def build_labels_from_ledgers(seed_labels: dict[int, int], pool_sidecars: dict[str, int]) -> dict[str, int]:
    """{png: 0/1}. Ledger seeds take their ledger label; every other pool render
    stays a pass (#91's rule — the varied passes #1205 asks for)."""
    return {name: int(seed_labels.get(seed & 0xFFFFFFFF, 0)) for name, seed in pool_sidecars.items()}


def ledger_row_to_hit(row: dict) -> dict:
    """A ledger row in write_hit_project's hit shape (absent stays absent)."""
    r = row["recipe"]
    hit = {"seed": row["seed"]}
    if r.get("layoutParams"):
        hit["layoutParams"] = r["layoutParams"]
    if r.get("paletteId"):
        hit["paletteId"] = r["paletteId"]
    if isinstance(r.get("seedOffsets"), dict):
        hit["seedOffsets"] = r["seedOffsets"]
    if isinstance(r.get("assets"), list) and r["assets"]:
        hit["assets"] = r["assets"]
    return hit


def read_ledgers(d: Path) -> tuple[list[dict], list[dict]]:
    """Both ledgers from a dir; a missing file is an empty ledger."""
    out = []
    for kind in ("keeps", "passes"):
        f = Path(d) / LEDGER_FILES[kind]
        out.append(parse_ledger(f.read_text(encoding="utf-8"), f.name) if f.exists() else [])
    return out[0], out[1]


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
    # #1173 — the keep/pass ledgers
    row = lambda seed, ts="2026-10-13T00:00:00Z": {"seed": seed, "recipe": {"layoutParams": None, "paletteId": None},
                                                  "timestamp": ts, "keepContext": None, "projectRef": None}
    warned = []
    text = "\n".join([json.dumps(row(1)), "{bad", "", json.dumps({"seed": 2}), json.dumps(row(3)), ""])
    assert [r["seed"] for r in parse_ledger(text, "k", warned.append)] == [1, 3]
    assert len(warned) == 2 and "line 2" in warned[0] and "line 4" in warned[1], "corrupt lines warn, never silent"
    assert not is_ledger_row({**row(1), "seed": True}) and not is_ledger_row({**row(1), "seed": -1})
    assert ledger_seed_labels([row(1)], [row(2)]) == {1: 1, 2: 0}, "keeps positive, passes negative"
    assert ledger_seed_labels([row(5, "2026-10-01")], [row(5, "2026-10-02")]) == {5: 0}, "latest act wins"
    assert ledger_seed_labels([row(5, "2026-10-03")], [row(5, "2026-10-02")]) == {5: 1}
    assert ledger_seed_labels([row(5)], [row(5)]) == {5: 1}, "a tie goes to the keep"
    assert build_labels_from_ledgers({2: 1, 3: 0}, sidecars) == {"000-a.png": 0, "001-b.png": 1, "002-c.png": 0}
    full = {"seed": 9, "recipe": {"layoutParams": {"mode": "grid"}, "paletteId": "bone",
                                  "seedOffsets": {"spatial": 1}, "assets": ["x"]}}
    assert ledger_row_to_hit(full) == {"seed": 9, "layoutParams": {"mode": "grid"}, "paletteId": "bone",
                                       "seedOffsets": {"spatial": 1}, "assets": ["x"]}
    assert ledger_row_to_hit(row(4)) == {"seed": 4}, "absent stays absent"
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
        # #1173 — read_ledgers: a missing file is an empty ledger
        led = Path(d) / "led"
        led.mkdir()
        (led / "keeps.jsonl").write_text(json.dumps(row(1)) + "\n")
        assert [r["seed"] for r in read_ledgers(led)[0]] == [1] and read_ledgers(led)[1] == []
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



def cmd_ledgers(a) -> None:
    """#1173 — keeps.jsonl + passes.jsonl -> labels.json (+ features.json).

    No HITS export: the app appends a line per keep (F/J/★) and per pass (X).
    Any labelled seed not in the pool is rendered from its own recipe on the
    base project, so every keep AND every pass is in the training set.
    """
    keeps, passes = read_ledgers(Path(a.ledgers))
    if not keeps:
        sys.exit(f"{a.ledgers}: no keeps in {LEDGER_FILES['keeps']} — keep some plates (F/J) and save ↓ LEDGERS")
    seed_labels = ledger_seed_labels(keeps, passes)
    row_by_seed: dict[int, dict] = {}
    for r in keeps + passes:  # keep rows win for the render recipe
        row_by_seed.setdefault(r["seed"] & 0xFFFFFFFF, r)

    pool = Path(a.pool)
    pool.mkdir(parents=True, exist_ok=True)
    sidecars = scan_pool(pool)
    todo = missing_hit_seeds(set(seed_labels), sidecars)
    if todo:
        if not a.base or not Path(a.base).exists():
            sys.exit(f"{len(todo)} ledger seed(s) are not in the pool and no --base project to render them on")
        base = {"project": json.loads(Path(a.base).read_text())}
        print(f"rendering {len(todo)} ledger seed(s) not already in the pool...")
        tmp_project = pool / "_ledger-render.project.json"
        for seed in todo:
            write_hit_project(base, ledger_row_to_hit(row_by_seed[seed]), tmp_project)
            render_hit(tmp_project, pool, seed, a.res)
        tmp_project.unlink(missing_ok=True)
        sidecars = scan_pool(pool)

    labels = build_labels_from_ledgers(seed_labels, sidecars)
    Path(a.out).write_text(json.dumps(labels, indent=1, sort_keys=True))
    feats = scan_features(pool)
    features = {name: feats[name] for name in labels if name in feats}
    features_out = Path(a.features_out) if a.features_out else Path(a.out).with_name("features.json")
    features_out.write_text(json.dumps(features, indent=1, sort_keys=True))
    kept = sum(1 for v in seed_labels.values() if v == 1)
    pos = sum(labels.values())
    print(f"{a.out}: {len(labels)} labels ({pos} keeps / {len(labels) - pos} passes) — "
          f"ledgers: {kept} kept, {len(seed_labels) - kept} passed, rest of pool {len(labels) - len(seed_labels)}")
    if pos < kept:
        print(f"warning: only {pos}/{kept} kept seeds ended up labelled (a render failed?)", file=sys.stderr)



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

    sp = sub.add_parser("ledgers", help="#1173: the app's keeps.jsonl/passes.jsonl -> labels.json")
    sp.add_argument("--ledgers", required=True, help="dir holding keeps.jsonl and passes.jsonl (app: Pipeline -> ↓ LEDGERS)")
    sp.add_argument("--pool", required=True, help="studio.py batch output dir (PNG + JSON sidecars)")
    sp.add_argument("--base", default=None, help="base project JSON to render ledger seeds missing from the pool")
    sp.add_argument("--out", default="labels.json")
    sp.add_argument("--features-out", default=None)
    sp.add_argument("--res", default="1")
    sp.set_defaults(func=cmd_ledgers)

    sub.add_parser("selfcheck", help="pure-logic checks, no rendering, no model") \
        .set_defaults(func=cmd_selfcheck)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
