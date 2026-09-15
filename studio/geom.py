#!/usr/bin/env python3
"""Kinetic Curator geometry CLI — asset audit + Illustrator-style blend (issue #76).

Backend C of docs/BACKEND_V2_PLAN.md §3.C.

    python3 studio/geom.py audit
    python3 studio/geom.py blend org_blob_01 geo_tri_03 --steps 6 -o blend.svg

Asset geometry only. This touches nothing the kernel computes (§2.1) — it reads
the authored `svg` strings out of app/src/data/assets and emits new ones.

Requires the `geom` extra:  cd studio && uv sync --extra geom
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from io import StringIO
from pathlib import Path
from xml.etree import ElementTree

import numpy as np
from svgpathtools import parse_path
from svgpathtools.svg_to_paths import ellipse2pathd, polygon2pathd, polyline2pathd, rect2pathd

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

# Assets are authored inside a 100x100 box (render.mjs ASSET_SIZE).
BOX = 100
# Presentation attributes a <g> passes down to its children.
INHERITED = ("fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
             "stroke-dasharray", "fill-rule", "opacity")
SHAPES = {"path", "circle", "ellipse", "rect", "line", "polygon", "polyline"}
# Standalone SVGs must open in any viewer; the app resolves these as CSS vars.
SWATCH = {"var(--ink)": "#111111", "var(--accent)": "#e0245e"}


class Unsupported(Exception):
    """The asset contains geometry this tool refuses to guess at."""


# ── reading the library ───────────────────────────────────────────────


def load_assets() -> list[dict]:
    """The asset library, straight from the app's own ES modules."""
    src = "import {ASSETS} from './app/src/data/assets/index.js';" \
          "process.stdout.write(JSON.stringify(ASSETS))"
    out = subprocess.run(["node", "--input-type=module", "-e", src],
                         cwd=REPO, check=True, capture_output=True)
    return json.loads(out.stdout)


# ── fragment -> subpaths ──────────────────────────────────────────────


@dataclass
class Sub:
    """One continuous subpath: sampled points, closedness, and its paint."""
    pts: np.ndarray          # (n, 2)
    closed: bool
    style: dict[str, str]


def _pathd(tag: str, at: dict) -> str:
    if tag == "path":
        return at["d"]
    if tag == "line":
        return f"M{at.get('x1', 0)} {at.get('y1', 0)} L{at.get('x2', 0)} {at.get('y2', 0)}"
    if tag in ("circle", "ellipse"):
        return ellipse2pathd(at)
    if tag == "rect":
        return rect2pathd(at)
    if tag == "polygon":
        return polygon2pathd(at)
    return polyline2pathd(at)


def _rotate(path, transform: str):
    m = re.fullmatch(r"\s*rotate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)\s*", transform)
    if not m:
        raise Unsupported(f'transform="{transform}" (only rotate(a cx cy) is handled)')
    deg, cx, cy = (float(v) for v in m.groups())
    return path.rotated(deg, origin=complex(cx, cy))


def resample(path, n: int, closed: bool) -> np.ndarray:
    """n points spaced by true arc length along `path`.

    svgpathtools' own `Path.point(t)` is arc-length-normalised *between*
    segments but not *within* a bezier, so points bunch up on tight curves and
    the morph twists. Dense-sample, then walk a cumulative chord table.
    """
    dense = np.array([path.point(u) for u in np.linspace(0.0, 1.0, 2048)])
    cum = np.concatenate([[0.0], np.cumsum(np.abs(np.diff(dense)))])
    if cum[-1] <= 0:                       # zero-length (a degenerate shape)
        return np.tile([dense[0].real, dense[0].imag], (n, 1))
    # closed rings: last sample == first, so don't emit it twice
    at = np.linspace(0.0, cum[-1], n, endpoint=not closed)
    return np.stack([np.interp(at, cum, dense.real), np.interp(at, cum, dense.imag)], axis=1)


def parse_asset(svg: str, samples: int = 128) -> list[Sub]:
    """Every drawable subpath in an asset fragment, in document order.

    Raises Unsupported for anything with no geometry to interpolate (<text>)
    or geometry this tool would have to guess at (non-rotate transforms).
    """
    root = ElementTree.fromstring(f"<svg>{svg}</svg>")
    subs: list[Sub] = []

    def walk(el, inherited: dict):
        style = {**inherited, **{k: v for k, v in el.attrib.items() if k in INHERITED}}
        tag = el.tag.rsplit("}", 1)[-1]
        if tag == "g":
            for child in el:
                walk(child, style)
            return
        if tag == "text":
            raise Unsupported("<text> — glyph outlines are a font, not path data")
        if tag not in SHAPES:
            raise Unsupported(f"<{tag}> is not a shape element")
        path = parse_path(_pathd(tag, el.attrib))
        if "transform" in el.attrib:
            path = _rotate(path, el.attrib["transform"])
        for piece in path.continuous_subpaths():
            if piece.length() <= 0:
                continue
            subs.append(Sub(resample(piece, samples, piece.isclosed()), piece.isclosed(), style))

    for child in root:
        walk(child, {})
    if not subs:
        raise Unsupported("no drawable geometry")
    return subs


# ── interpolation ─────────────────────────────────────────────────────


def _align(a: np.ndarray, b: np.ndarray, a_closed: bool, b_closed: bool) -> np.ndarray:
    """Re-index `b` so point i of `b` corresponds to point i of `a`.

    Two knobs: traversal direction, and (for a closed ring, whose start point
    is arbitrary) where the ring is cut. Without this the blend twists —
    the classic "morph turns inside out" failure.
    """
    n = len(a)
    rolls = range(n) if b_closed else [0]
    best, best_cost = b, np.inf
    for flipped in (b, b[::-1].copy()) if len(b) > 1 else (b,):
        for k in rolls:
            cand = np.roll(flipped, k, axis=0)
            cost = float(np.sum((a - cand) ** 2))
            if cost < best_cost:
                best, best_cost = cand, cost
    if a_closed and not b_closed:
        # b's cut is fixed, so cut a instead — done by the caller via a swap.
        pass
    return best


def pair_subs(a: list[Sub], b: list[Sub]) -> list[tuple[int, int]]:
    """Match A's subpaths to B's by centroid, brute-forcing small permutations."""
    from itertools import permutations
    n = len(a)
    ca = np.array([s.pts.mean(axis=0) for s in a])
    cb = np.array([s.pts.mean(axis=0) for s in b])
    if n > 7:   # ponytail: 7! = 5040; use scipy.optimize.linear_sum_assignment if assets grow
        return list(enumerate(range(n)))
    cost = np.sum((ca[:, None, :] - cb[None, :, :]) ** 2, axis=2)
    order = min(permutations(range(n)), key=lambda p: sum(cost[i, p[i]] for i in range(n)))
    return list(enumerate(order))


def _num(v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def lerp_style(sa: dict, sb: dict, t: float) -> dict:
    """Paint snaps at the midpoint (--ink/--accent are CSS vars, not lerpable);
    stroke-width is a number, so it actually interpolates."""
    out = dict(sa if t < 0.5 else sb)
    if "stroke-width" in sa and "stroke-width" in sb:
        wa, wb = _num(sa["stroke-width"], 1.0), _num(sb["stroke-width"], 1.0)
        out["stroke-width"] = f"{wa + (wb - wa) * t:.3f}".rstrip("0").rstrip(".")
    return out


def to_d(pts: np.ndarray, closed: bool) -> str:
    body = " ".join(f"{x:.2f} {y:.2f}" for x, y in pts)
    return f"M{body[:body.index(' ', body.index(' ') + 1)] if False else ''}" \
        .replace("M", "") + "M " + body + (" Z" if closed else "")


def blend_subs(a: list[Sub], b: list[Sub], t: float) -> list[tuple[np.ndarray, bool, dict]]:
    """Geometry of the blend at parameter t. Requires equal subpath counts."""
    out = []
    for ia, ib in pair_subs(a, b):
        sa, sb = a[ia], b[ib]
        # rotate whichever side is free to be re-cut; a closed ring is.
        if sb.closed or not sa.closed:
            pa, pb = sa.pts, _align(sa.pts, sb.pts, sa.closed, sb.closed)
        else:
            pb = sb.pts
            pa = _align(sb.pts, sa.pts, sb.closed, sa.closed)
        out.append((pa + (pb - pa) * t, sa.closed and sb.closed, lerp_style(sa.style, sb.style, t)))
    return out


def subs_to_svg(parts, *, concrete=False) -> str:
    """Blend geometry -> an asset-shaped SVG fragment."""
    frag = []
    for pts, closed, style in parts:
        d = "M " + " ".join(f"{x:.2f} {y:.2f}" for x, y in pts) + (" Z" if closed else "")
        style = dict(style)
        style.setdefault("fill", "none")
        if concrete:
            style = {k: SWATCH.get(v, v) for k, v in style.items()}
        attrs = " ".join(f'{k}="{v}"' for k, v in style.items())
        frag.append(f'<path d="{d}" {attrs}/>')
    return "".join(frag)


# ── audit ─────────────────────────────────────────────────────────────


def classify(asset: dict, samples: int = 64) -> dict:
    row = {"id": asset["id"], "category": asset.get("category", "?")}
    try:
        subs = parse_asset(asset["svg"], samples)
    except Unsupported as e:
        return {**row, "status": "unsupported", "reason": str(e), "subpaths": 0}
    except Exception as e:                       # malformed XML, bad `d`, ...
        return {**row, "status": "malformed", "reason": f"{type(e).__name__}: {e}", "subpaths": 0}
    closed = sum(s.closed for s in subs)
    return {
        **row,
        "status": "ok",
        "shape": "single-path" if len(subs) == 1 else "compound",
        "subpaths": len(subs),
        "closed": closed,
        "open": len(subs) - closed,
        "paint": "filled" if all(s.style.get("fill", "none") != "none" for s in subs)
                 else "stroked" if all(s.style.get("fill", "none") == "none" for s in subs)
                 else "mixed",
    }


def cmd_audit(a) -> None:
    rows = [classify(x) for x in load_assets()]
    bad = [r for r in rows if r["status"] != "ok"]
    single = [r for r in rows if r.get("shape") == "single-path"]
    compound = [r for r in rows if r.get("shape") == "compound"]

    if a.verbose or a.only:
        show = [r for r in rows if not a.only or r["status"] == a.only or r.get("shape") == a.only]
        for r in sorted(show, key=lambda r: (r["status"], r["id"])):
            if r["status"] == "ok":
                print(f'  {r["id"]:<22} {r["shape"]:<12} {r["subpaths"]:>3} subpath(s)  '
                      f'{r["closed"]}closed/{r["open"]}open  {r["paint"]}')
            else:
                print(f'  {r["id"]:<22} {r["status"].upper():<12} {r["reason"]}')
        print()

    print(f"{len(rows)} assets")
    print(f"  single-path  {len(single):>4}   blendable with anything else in this group")
    print(f"  compound     {len(compound):>4}   blendable with an asset of the same subpath count")
    print(f"  unsupported  {len([r for r in bad if r['status'] == 'unsupported']):>4}")
    print(f"  malformed    {len([r for r in bad if r['status'] == 'malformed']):>4}")
    hist = {}
    for r in rows:
        if r["status"] == "ok":
            hist.setdefault(r["subpaths"], []).append(r["id"])
    print("\nsubpath count -> how many assets (assets blend pairwise within a count):")
    for k in sorted(hist):
        print(f"  {k:>3}: {len(hist[k]):>3}")
    for r in bad:
        print(f"  !! {r['id']}: {r['status']} — {r['reason']}", file=sys.stderr)
    if a.json:
        Path(a.json).write_text(json.dumps(rows, indent=2))
        print(f"\nwrote {a.json}")


# ── blend ─────────────────────────────────────────────────────────────


def cmd_blend(a) -> None:
    by_id = {x["id"]: x for x in load_assets()}
    for i in (a.a, a.b):
        if i not in by_id:
            sys.exit(f"no such asset: {i} (try: python3 {Path(__file__).name} audit --verbose)")
    try:
        sa = parse_asset(by_id[a.a]["svg"], a.samples)
        sb = parse_asset(by_id[a.b]["svg"], a.samples)
    except Unsupported as e:
        sys.exit(f"UNSUPPORTED: {e}\nThis asset cannot be blended. Nothing was written.")

    if len(sa) != len(sb):
        sys.exit(
            f"UNSUPPORTED: {a.a} has {len(sa)} subpath(s), {a.b} has {len(sb)}.\n"
            "A blend between different subpath counts would have to invent or drop shapes.\n"
            f"Pick a pair with matching counts — `python3 {Path(__file__).name} audit --verbose` "
            "lists every asset's count. Nothing was written."
        )
    for i, (x, y) in enumerate(zip(sa, sb)):
        if x.closed != y.closed:
            print(f"[geom] WARNING: subpath {i} is "
                  f"{'closed' if x.closed else 'open'} in {a.a} but "
                  f"{'closed' if y.closed else 'open'} in {a.b}; the closed one gets cut open.",
                  file=sys.stderr)
        if (x.style.get("fill", "none") == "none") != (y.style.get("fill", "none") == "none"):
            print(f"[geom] WARNING: subpath {i} is filled on one side and stroked on the other; "
                  "paint snaps at t=0.5 rather than interpolating.", file=sys.stderr)

    steps = [i / (a.steps - 1) for i in range(a.steps)] if a.steps > 1 else [0.5]
    frames = [(t, subs_to_svg(blend_subs(sa, sb, t), concrete=True)) for t in steps]

    cells = "".join(
        f'<g transform="translate({i * BOX} 0)">'
        f'<rect width="{BOX}" height="{BOX}" fill="none" stroke="#ddd" stroke-width="0.5"/>'
        f"{frag}"
        f'<text x="2" y="97" font-size="5" fill="#999" font-family="monospace">t={t:.2f}</text>'
        f"</g>"
        for i, (t, frag) in enumerate(frames))
    Path(a.out).write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{len(frames) * BOX}" height="{BOX}" '
        f'viewBox="0 0 {len(frames) * BOX} {BOX}">'
        f"<!-- {a.a} -> {a.b}, {a.steps} steps. Curves are resampled to {a.samples}-point "
        f"polylines, so intermediates approximate the originals' beziers. -->"
        f'<rect width="100%" height="100%" fill="#fff"/>{cells}</svg>')
    print(a.out)

    if a.assets:
        out = [{"id": f"{a.a}__{a.b}__{i:02d}",
                "category": by_id[a.a].get("category"),
                "tags": ["blend", a.a, a.b],
                "weight": by_id[a.a].get("weight", "medium"),
                "svg": subs_to_svg(blend_subs(sa, sb, t))}
               for i, t in enumerate(steps)]
        Path(a.assets).write_text(json.dumps(out, indent=2))
        print(a.assets)


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="geom", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("audit", help="classify the whole asset library")
    sp.add_argument("--verbose", action="store_true", help="one line per asset")
    sp.add_argument("--only", default=None,
                    help="filter the listing: single-path | compound | unsupported | malformed")
    sp.add_argument("--json", default=None, help="also write the rows to this file")
    sp.set_defaults(func=cmd_audit)

    sp = sub.add_parser("blend", help="N geometry-interpolated steps between two assets")
    sp.add_argument("a", help="source asset id")
    sp.add_argument("b", help="target asset id")
    sp.add_argument("--steps", type=int, default=5, help="frames including both ends (default 5)")
    sp.add_argument("--samples", type=int, default=128, help="points per subpath (default 128)")
    sp.add_argument("-o", "--out", required=True, help="contact-sheet SVG")
    sp.add_argument("--assets", default=None,
                    help="also write [{id, svg}] for AssetSpriteSheet")
    sp.set_defaults(func=cmd_blend)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
