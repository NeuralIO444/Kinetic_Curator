#!/usr/bin/env python3
"""mlx_run.py — one-command MLX curator pipeline (docs/MLX_CURATOR_RUNBOOK.md).

Phase 1 (prove the loop):
    python3 studio/mlx_run.py --phase 1 --pool pool --count 200 [--hits hits.json]

Phase 2 (taste.json -> the app, #762):
    python3 studio/mlx_run.py --phase 2 --pool pool --recipes pool-recipes \\
        --hits hits.json --base base.project.json

Every step is resumable: outputs that already exist are skipped unless
--force is given. --dry-run prints the commands without running them.
Run from anywhere; paths resolve under the repo root.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent  # repo root: studio/curator.py, studio/studio.py ...

AUC_RE = re.compile(r"held-out ROC-AUC\s+([0-9.]+)")
FID_RE = re.compile(r"head fidelity\s+([0-9.]+)")


class Pipe:
    def __init__(self, dry_run=False, force=False):
        self.dry_run = dry_run
        self.force = force
        self.report = {"steps": {}, "ok": True}

    def run(self, name, cmd, cwd=ROOT):
        """Run a step; skip it when its sentinel output already exists."""
        print(f"\n== {name} ==")
        print("   $", " ".join(str(c) for c in cmd))
        if self.dry_run:
            self.report["steps"][name] = "dry-run"
            return ""
        try:
            out = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
        except FileNotFoundError as e:
            return self._fail(name, f"command not found: {e}")
        print(out.stdout[-2000:] if out.stdout else "")
        if out.returncode != 0:
            print(out.stderr[-2000:] if out.stderr else "", file=sys.stderr)
            return self._fail(name, f"exit {out.returncode}")
        self.report["steps"][name] = "ok"
        return out.stdout

    def _fail(self, name, why):
        print(f"!! step failed: {name}: {why}", file=sys.stderr)
        self.report["steps"][name] = f"FAILED: {why}"
        self.report["ok"] = False
        return None

    def need_human(self, msg):
        print(f"\n!! needs you: {msg}", file=sys.stderr)
        if not self.dry_run:
            self.report["ok"] = False


def pngs(d):
    return sorted(Path(d).glob("*.png")) if Path(d).is_dir() else []


def phase1(p, args):
    pool = Path(args.pool)
    base = Path(args.base)
    if not base.exists():
        p.need_human(
            f"Phase 1 needs a starting project: in the app, Pipeline \u2192 \u2193 PROJECT, "
            f"save it as {args.base} in the repo root, then re-run.")
        if not p.dry_run:
            return
        print("   (dry-run: continuing to show the remaining steps)")
    # 1. render the pool
    if not p.force and pngs(pool):
        print(f"\n== batch ==\n   pool/ has {len(pngs(pool))} PNGs — skipping (use --force to re-render)")
        p.report["steps"]["batch"] = "skipped"
    else:
        out = p.run("batch", [sys.executable, "studio/studio.py", "batch", str(base),
                              "-o", str(pool), "--count", str(args.count)])
        if out is None:
            return
    # 2. embed
    index = pool / "curator-index.npz"
    if not p.force and index.exists():
        print(f"\n== embed ==\n   {index} exists — skipping")
        p.report["steps"]["embed"] = "skipped"
    else:
        if p.run("embed", [sys.executable, "studio/curator.py", "embed", str(pool)]) is None:
            return
    # 3. labels — the one human step, bootstrapped from HITS when possible
    labels = Path("labels.json")
    if not p.force and labels.exists():
        print(f"\n== labels ==\n   labels.json exists — skipping")
        p.report["steps"]["labels"] = "skipped"
    elif args.hits and Path(args.hits).exists():
        if p.run("labels-from-hits",
                 [sys.executable, "studio/hits_bridge.py", "build",
                  "--hits", args.hits, "--pool", str(pool), "--out", "labels.json"]) is None:
            return
    else:
        p.need_human(
            "no labels.json and no --hits given. Either:\n"
            "  a) keep with \u2605/F in the app, Pipeline \u2192 \u2193 HITS, then re-run with --hits hits.json, or\n"
            "  b) label by hand: python3 studio/curator.py label --index pool/curator-index.npz --out labels.json\n"
            "     (aim for 20+ likes and 20+ passes)")
        if not p.dry_run:
            return
        print("   (dry-run: continuing to show the remaining steps)")
    # 4. train
    out = p.run("train", [sys.executable, "studio/curator.py", "train",
                          "--index", str(index), "--labels", "labels.json",
                          "--out", "taste.npz"])
    if out is None:
        return
    m = AUC_RE.search(out)
    auc = float(m.group(1)) if m else None
    p.report["auc"] = auc
    print(f"   ROC-AUC {auc}  ({'better than chance' if auc and auc > 0.6 else 'needs more labels'})")
    # 5. rank a fresh batch
    pool2 = Path("pool2")
    if not p.force and pngs(pool2):
        p.report["steps"]["rank-batch"] = "skipped"
    else:
        if p.run("rank-batch", [sys.executable, "studio/studio.py", "batch", str(base),
                                "-o", str(pool2), "--count", str(args.count),
                                "--start-seed", "10000"]) is None:
            return
    index2 = pool2 / "curator-index.npz"
    if not (p.force or not index2.exists()):
        p.report["steps"]["rank-embed"] = "skipped"
    elif p.run("rank-embed", [sys.executable, "studio/curator.py", "embed", str(pool2)]) is None:
        return
    out = p.run("rank", [sys.executable, "studio/curator.py", "rank",
                         "--index", str(index2), "--model", "taste.npz", "-k", "20"])
    if out is None:
        return
    p.need_human("look at the top 20 above — did it find keepers? If yes, Phase 1 is done.")


def phase2(p, args):
    if not args.hits or not Path(args.hits).exists():
        p.need_human("Phase 2 needs your keeps: in the app keep with \u2605/F, "
                     "then Pipeline \u2192 \u2193 HITS to save hits.json, and re-run with --hits hits.json")
        if not p.dry_run:
            return
        print("   (dry-run: continuing to show the remaining steps)")
    recipes = Path(args.recipes)
    pool = Path(args.pool)
    # 1. varied pool, same dice CURATE uses
    if not p.force and recipes.is_dir() and any(recipes.iterdir()):
        print(f"\n== recipes ==\n   {recipes}/ exists — skipping")
        p.report["steps"]["recipes"] = "skipped"
    else:
        if p.run("recipes", ["node", "studio/pool_recipes.mjs", args.base,
                             "--count", str(args.count), "--seed", "1",
                             "--out", str(recipes)]) is None:
            return
    # 2. render the pool (resumable)
    if p.run("render-pool", [sys.executable, "studio/hits_bridge.py", "pool",
                             "--recipes", str(recipes), "--pool", str(pool)]) is None:
        return
    # 3. labels + features from your keeps
    if p.run("labels", [sys.executable, "studio/hits_bridge.py", "build",
                        "--hits", args.hits, "--pool", str(pool),
                        "--out", "labels.json"]) is None:
        return
    # 4. embed
    index = pool / "curator-index.npz"
    if not (p.force or not index.exists()):
        p.report["steps"]["embed"] = "skipped"
    elif p.run("embed", [sys.executable, "studio/curator.py", "embed", str(pool)]) is None:
        return
    # 5. train -> taste.json (probe + distilled head)
    out = p.run("train", [sys.executable, "studio/curator.py", "train",
                          "--index", str(index), "--labels", "labels.json",
                          "--features", "features.json", "--out", "taste.json"])
    if out is None:
        return
    m1, m2 = AUC_RE.search(out), FID_RE.search(out)
    p.report["auc"] = float(m1.group(1)) if m1 else None
    p.report["fidelity"] = float(m2.group(1)) if m2 else None
    # 6. read it in words
    p.run("inspect", [sys.executable, "studio/curator.py", "inspect", "taste.json"])
    p.need_human("does the inspect output sound like you? If yes: app \u2192 Pipeline \u2192 IN \u2192 "
                 "IMPORT TASTE \u2192 taste.json, and the curator bar reads \u201ccurated pick \u00b7 mlx\u201d.")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--phase", type=int, choices=[1, 2], required=True)
    ap.add_argument("--pool", default="pool")
    ap.add_argument("--count", type=int, default=200)
    ap.add_argument("--hits", default=None, help="hits.json from the app (Pipeline -> HITS)")
    ap.add_argument("--recipes", default="pool-recipes", help="phase 2 recipe dir")
    ap.add_argument("--base", default="base.project.json", help="starting project JSON (app -> Pipeline -> PROJECT)")
    ap.add_argument("--force", action="store_true", help="redo steps whose outputs exist")
    ap.add_argument("--dry-run", action="store_true", help="print commands without running")
    args = ap.parse_args()

    p = Pipe(dry_run=args.dry_run, force=args.force)
    print(f"mlx pipeline — phase {args.phase}")
    (phase1 if args.phase == 1 else phase2)(p, args)

    with open(ROOT / "mlx-report.json", "w") as f:
        json.dump(p.report, f, indent=1)
    print(f"\nreport -> mlx-report.json   ok={p.report['ok']}")
    sys.exit(0 if p.report["ok"] else 2)


if __name__ == "__main__":
    main()
