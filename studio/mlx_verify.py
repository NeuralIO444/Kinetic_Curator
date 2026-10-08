#!/usr/bin/env python3
"""mlx_verify.py — simplified MLX testing: one command, PASS/FAIL per gate.

    python3 studio/mlx_verify.py [--pool pool] [--taste taste.json]

Gates (from docs/MLX_CURATOR_RUNBOOK.md):
  1. curator selfcheck passes
  2. pool/curator-index.npz exists
  3. labels.json has >= 20 likes and >= 20 passes
  4. taste artifact exists; ROC-AUC > 0.6; head fidelity >= 0.3 (when a head is present)

Exit 0 when every gate passes, 1 otherwise.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

AUC_MIN = 0.6
FID_MIN = 0.3
LABELS_MIN = 20


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pool", default="pool")
    ap.add_argument("--taste", default="taste.json")
    args = ap.parse_args()

    fails = []

    def gate(name, ok, detail=""):
        print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))
        if not ok:
            fails.append(name)

    print("== mlx verify ==")
    r = subprocess.run([sys.executable, "studio/curator.py", "selfcheck"],
                       cwd=ROOT, capture_output=True, text=True)
    gate("curator selfcheck", r.returncode == 0, r.stdout.strip().splitlines()[-1] if r.stdout else "")

    index = ROOT / args.pool / "curator-index.npz"
    gate("embeddings index", index.exists(), str(index))

    labels_p = ROOT / "labels.json"
    likes = passes = 0
    if labels_p.exists():
        labels = json.loads(labels_p.read_text())
        likes = sum(1 for v in labels.values() if int(v) == 1)
        passes = sum(1 for v in labels.values() if int(v) == 0)
    gate("labels >= 20/20", likes >= LABELS_MIN and passes >= LABELS_MIN,
         f"{likes} likes / {passes} passes")

    taste_p = ROOT / args.taste
    auc = fid = None
    if taste_p.exists() and taste_p.suffix == ".json":
        t = json.loads(taste_p.read_text())
        auc = (t.get("cv") or {}).get("auc")
        fid = (t.get("head") or {}).get("fidelity")
        gate("taste.json exists", True, f"{t.get('labels', {})}")
    elif (ROOT / "taste.npz").exists():
        gate("taste.npz exists (phase 1)", True, "run --taste taste.json for phase 2 gates")
        taste_p = None
    else:
        gate("taste artifact exists", False, "run mlx_run.py first")
        taste_p = None

    if taste_p and taste_p.suffix == ".json":
        gate("ROC-AUC > 0.6", auc is not None and auc > AUC_MIN, f"{auc}")
        if fid is None:
            print("  SKIP  head fidelity — no distilled head (phase 1 probe only)")
        else:
            gate("head fidelity >= 0.3", fid >= FID_MIN, f"{fid}")

    print("VERIFY " + ("OK" if not fails else f"FAILED: {', '.join(fails)}"))
    sys.exit(0 if not fails else 1)


if __name__ == "__main__":
    main()
