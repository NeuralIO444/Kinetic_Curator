#!/usr/bin/env python3
"""studio/hits_bridge.py — favourites ("HITS" export) -> curator.py labels.json (issue #91).

    app "↓ HITS" export -> hits_bridge.py build -> labels.json -> curator.py train

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
    python3 studio/hits_bridge.py build --hits hits.json --pool pool/ --out labels.json
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


def scan_pool(pool: Path) -> dict[str, int]:
    out = {}
    for png in sorted(pool.glob("*.png")):
        sidecar = png.with_suffix(".json")
        if not sidecar.exists():
            continue
        out[png.name] = int(json.loads(sidecar.read_text())["seed"])
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
    base.setdefault("version", 1)
    out_path.write_text(json.dumps(base, indent=2))


def render_hit(project_path: Path, pool: Path, seed: int, res: str) -> None:
    out = pool / f"hit-{seed:08x}.png"
    subprocess.run(
        [sys.executable, str(STUDIO_PY), "render", str(project_path),
         "-o", str(out), "--seed", str(seed), "--res", res, "--sidecar"],
        check=True,
    )


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
    pos = sum(labels.values())
    print(f"{a.out}: {len(labels)} labels ({pos} likes / {len(labels) - pos} passes) from pool {pool}")
    if pos < len(hit_seeds):
        print(f"warning: only {pos}/{len(hit_seeds)} favourited seeds ended up labelled "
              "(duplicate seeds, or a render failed)", file=sys.stderr)


def cmd_selfcheck(_a=None) -> None:
    sidecars = {"000-a.png": 1, "001-b.png": 2, "002-c.png": 3}
    assert build_labels({2}, sidecars) == {"000-a.png": 0, "001-b.png": 1, "002-c.png": 0}
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
    print("hits_bridge selfcheck OK")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="hits_bridge", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("build", help="hits export + rendered pool -> labels.json")
    sp.add_argument("--hits", required=True, help="JSON from the app's ↓ HITS export")
    sp.add_argument("--pool", required=True, help="studio.py batch output dir (PNG + JSON sidecars)")
    sp.add_argument("--out", default="labels.json")
    sp.add_argument("--res", default="1", help="resolution for any on-demand hit renders")
    sp.set_defaults(func=cmd_build)

    sub.add_parser("selfcheck", help="pure-logic checks, no rendering, no model") \
        .set_defaults(func=cmd_selfcheck)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
