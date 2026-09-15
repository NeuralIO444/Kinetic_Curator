#!/usr/bin/env python3
"""Selfcheck for studio/geom.py (issue #76).

    cd studio && uv sync --extra geom
    python3 studio/geom_selfcheck.py

Proves the blend actually interpolates geometry rather than cross-fading or
quietly returning one endpoint — and that unsupported assets raise instead of
being approximated.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geom import (  # noqa: E402
    Unsupported, blend_subs, classify, load_assets, parse_asset, pair_subs, to_d,
)

assets = {a["id"]: a for a in load_assets()}
assert len(assets) > 100, f"expected the full library, got {len(assets)}"

A = parse_asset(assets["org_blob_01"]["svg"])
B = parse_asset(assets["geo_star5_01"]["svg"])
assert A and B, "both fixtures must parse to at least one subpath"

# --- endpoints are exact -----------------------------------------------------
at0 = blend_subs(A, B, 0.0)
at1 = blend_subs(A, B, 1.0)
# blend_subs rotates a closed ring to align start points, so compare the
# point SET (sorted), not index-wise order.
def pointset(a):
    return np.array(sorted(map(tuple, np.round(a, 6).tolist())))

assert np.allclose(pointset(at0[0][0]), pointset(A[0].pts), atol=1e-5), \
    "t=0 must reproduce shape A"
assert np.allclose(pointset(at1[0][0]), pointset(B[0].pts), atol=1e-5), \
    "t=1 must reproduce shape B"

# --- the middle is genuinely between, not a copy of either -------------------
mid = blend_subs(A, B, 0.5)[0][0]
d_a = float(np.abs(mid - at0[0][0]).mean())
d_b = float(np.abs(mid - at1[0][0]).mean())
assert d_a > 1e-3, "t=0.5 must differ from A"
assert d_b > 1e-3, "t=0.5 must differ from B"

# and it must lie *between* the endpoints, not wander off
span = float(np.abs(at1[0][0] - at0[0][0]).mean())
assert d_a < span and d_b < span, "midpoint should sit between the endpoints"

# --- monotonic: distance from A grows as t grows ------------------------------
dists = []
for t in (0.0, 0.25, 0.5, 0.75, 1.0):
    pts = blend_subs(A, B, t)[0][0]
    dists.append(float(np.abs(pts - at0[0][0]).mean()))
assert all(x < y for x, y in zip(dists, dists[1:])), f"blend must advance monotonically: {dists}"

# --- output is well-formed path data -----------------------------------------
d = to_d(mid, True)
assert d.startswith("M") and d.rstrip().endswith("Z"), f"closed subpath must be M..Z, got {d[:40]}"
assert "nan" not in d.lower(), "path data must not contain NaN"

# --- subpath pairing ----------------------------------------------------------
pairs = pair_subs(A, B)
assert len(pairs) == min(len(A), len(B)), "every shared subpath should be paired"

# --- unsupported raises, and does not silently approximate --------------------
try:
    parse_asset(assets["stamp_num_01"]["svg"])
except Unsupported as e:
    assert "text" in str(e).lower(), f"reason should name the cause, got: {e}"
else:
    raise AssertionError("a <text> asset must raise Unsupported, not blend")

# --- classify covers the library without crashing ----------------------------
kinds = {}
for a in assets.values():
    row = classify(a)
    key = row["shape"] if row["status"] == "ok" else row["status"]
    kinds[key] = kinds.get(key, 0) + 1
    # every non-ok row must explain itself rather than failing silently
    if row["status"] != "ok":
        assert row.get("reason"), f"{row['id']}: {row['status']} with no reason given"
assert kinds.get("malformed", 0) == 0, f"library should have no malformed assets: {kinds}"
assert kinds.get("single-path", 0) > 20, f"expected many single-path assets: {kinds}"

print("geom.selfcheck: OK", kinds)
