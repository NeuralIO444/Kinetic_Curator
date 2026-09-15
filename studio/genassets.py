#!/usr/bin/env python3
"""studio/genassets.py — generative asset expansion (issue #77, plan §3.D).

    generate -> vectorize -> normalize -> GATE -> asset objects

The gate is the point. #77 says plainly that the 137 hand-authored assets are
the project's identity and that an ungated firehose dilutes it, so nothing
reaches the pool without passing a curator score and a geometry sanity check.

    cd studio && uv sync --extra gen
    python3 studio/genassets.py generate --count 12 -o /tmp/cand
    python3 studio/genassets.py vectorize /tmp/cand -o /tmp/cand/assets.json
    python3 studio/genassets.py gate /tmp/cand/assets.json --index ... --model ...
    python3 studio/genassets.py selfcheck

Model weights come from the normal HF cache, never the repo.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VIEWBOX = 100  # every authored asset is drawn on a 100x100 viewBox

# Flat, high-contrast silhouettes vectorize; photographs do not.
DEFAULT_PROMPT = (
    "a single flat black silhouette shape on a pure white background, "
    "bold geometric abstract form, vector logo mark, no text, no gradient, "
    "no shading, high contrast, centered"
)
NEGATIVE = "photo, 3d, gradient, shadow, texture, text, watermark, multiple objects, frame"


# ---------------------------------------------------------------- geometry --

def path_bounds(d: str) -> tuple[float, float, float, float] | None:
    """Crude bounds from the numbers in a path — enough to judge emptiness."""
    nums = [float(n) for n in re.findall(r"-?\d+\.?\d*(?:e-?\d+)?", d)]
    if len(nums) < 4:
        return None
    xs, ys = nums[0::2], nums[1::2]
    if not xs or not ys:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def svg_bounds(svg: str):
    """Bounds across every path in the fragment, in its own units."""
    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    boxes = [b for b in (path_bounds(d) for d in paths) if b]
    if not boxes:
        return None
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def looks_usable(svg: str) -> tuple[bool, str]:
    """Reject degenerate vectorizations before a human ever sees them.

    Checks are unit-agnostic on purpose: vtracer emits paths in the source
    image's pixel space (512x512), so comparing raw numbers against the
    100x100 viewBox would reject everything. Size is judged after
    normalization; here we judge structure and aspect.
    """
    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    if not paths:
        return False, "no path data"
    if len(paths) > 40:
        return False, f"{len(paths)} subpaths — tracing noise, not a shape"
    b = svg_bounds(svg)
    if b is None:
        return False, "unparseable path"
    w, h = b[2] - b[0], b[3] - b[1]
    if w <= 0 or h <= 0:
        return False, "degenerate bounds"
    ratio = max(w, h) / min(w, h)
    if ratio > 12:
        return False, f"extreme aspect ratio {ratio:.0f}:1 — a sliver, not a shape"
    return True, "ok"


def normalize_to_viewbox(svg: str, margin: float = 4.0) -> str:
    """Fit traced geometry into the library's 100x100 viewBox.

    vtracer works in source pixels; every authored asset is drawn on 100x100.
    Without this the shapes render far outside the canvas cell. Done with a
    wrapping transform rather than rewriting path data — same result, and no
    chance of corrupting the curve commands.
    """
    b = svg_bounds(svg)
    if b is None:
        return svg
    w, h = b[2] - b[0], b[3] - b[1]
    if w <= 0 or h <= 0:
        return svg
    span = VIEWBOX - margin * 2
    scale = span / max(w, h)
    tx = margin + (span - w * scale) / 2 - b[0] * scale
    ty = margin + (span - h * scale) / 2 - b[1] * scale
    return (f'<g transform="translate({tx:.3f},{ty:.3f}) scale({scale:.5f})">'
            f"{svg}</g>")


def to_asset_svg(svg: str) -> str:
    """Strip the tracer's palette and adopt the project's colour contract."""
    body = re.sub(r"<\?xml[^>]*\?>", "", svg)
    body = re.sub(r"</?svg[^>]*>", "", body)
    body = re.sub(r'\sfill="(?!none)[^"]*"', ' fill="var(--ink)"', body)
    body = re.sub(r'\sstroke="(?!none)[^"]*"', ' stroke="var(--ink)"', body)
    if "fill=" not in body:
        body = body.replace("<path", '<path fill="var(--ink)"', 1)
    return body.strip()


# ---------------------------------------------------------------- commands --

def cmd_generate(a) -> None:
    import torch
    from diffusers import AutoPipelineForText2Image

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"  {a.model} on {device}")
    pipe = AutoPipelineForText2Image.from_pretrained(
        a.model, torch_dtype=torch.float16 if device == "mps" else torch.float32,
    ).to(device)
    pipe.set_progress_bar_config(disable=True)

    for i in range(a.count):
        g = torch.Generator(device="cpu").manual_seed(a.seed + i)
        img = pipe(
            prompt=a.prompt, negative_prompt=NEGATIVE,
            num_inference_steps=a.steps, guidance_scale=a.guidance,
            height=512, width=512, generator=g,
        ).images[0]
        p = out / f"cand-{i:03d}.png"
        img.save(p)
        print(f"  {i + 1}/{a.count} {p.name}")
    print(out)


def cmd_vectorize(a) -> None:
    import vtracer

    folder = Path(a.folder)
    pngs = sorted(folder.glob("*.png"))
    if not pngs:
        sys.exit(f"no PNGs in {folder}")

    assets, rejected = [], []
    for p in pngs:
        svg_path = p.with_suffix(".svg")
        vtracer.convert_image_to_svg_py(
            str(p), str(svg_path), colormode="binary",
            filter_speckle=a.speckle, path_precision=2,
        )
        raw = svg_path.read_text()
        ok, why = looks_usable(raw)
        if not ok:
            rejected.append((p.name, why))
            continue
        assets.append({
            "id": f"gen_{p.stem.replace('-', '_')}",
            "category": "generated",
            "tags": ["generated"],
            "weight": "medium",
            "generated": True,
            # keep the source render so the gate can score the actual image
            # instead of guessing the filename back out of the id
            "source": p.name,
            "svg": normalize_to_viewbox(to_asset_svg(raw)),
        })

    Path(a.out).write_text(json.dumps(assets, indent=1))
    print(f"  kept {len(assets)} / {len(pngs)}")
    for name, why in rejected:
        print(f"  !! {name}: {why}")
    print(a.out)


def cmd_gate(a) -> None:
    """Score candidates with the #75 taste model. Nothing enters unscored."""
    import numpy as np

    assets = json.loads(Path(a.assets).read_text())
    if not assets:
        sys.exit("no candidates to gate")

    if not a.model or not a.index:
        sys.exit(
            "REFUSED: --model and --index are required.\n"
            "Generated assets must pass the curator gate (#75) before entering "
            "the pool; see issue #77. Train one with:\n"
            "  python3 studio/curator.py train --index ... --labels ...",
        )

    sys.path.insert(0, str(HERE))
    from curator import embed_images  # noqa: E402  (optional dep)

    root = Path(a.assets).parent
    pairs = [(x, root / x["source"]) for x in assets if x.get("source")]
    pairs = [(x, p) for x, p in pairs if p.exists()]
    if not pairs:
        sys.exit(
            "could not locate candidate PNGs next to the asset JSON "
            "(assets need a `source` field written by `vectorize`)",
        )
    assets = [x for x, _ in pairs]
    pngs = [str(p) for _, p in pairs]

    emb = embed_images(pngs, a.clip_model, a.pretrained, log=lambda *_: None)
    m = np.load(a.model, allow_pickle=True)
    w, b = m["w"], float(m["b"])
    scores = emb @ w + b

    keep = [x for x, s in zip(assets, scores) if s >= a.threshold]
    print(f"  scored {len(assets)}, kept {len(keep)} at threshold {a.threshold}")
    for x, s in zip(assets, scores):
        print(f"  {s:+.4f} {'KEEP' if s >= a.threshold else 'drop'} {x['id']}")
    Path(a.out).write_text(json.dumps(keep, indent=1))
    print(a.out)


def cmd_selfcheck(_a) -> None:
    # Geometry gate — the part that must work without any model download.
    ok, _ = looks_usable('<svg><path d="M10 10 L90 10 L90 90 L10 90 Z"/></svg>')
    assert ok, "a full-size square should pass"

    bad, why = looks_usable("<svg></svg>")
    assert not bad and "no path" in why, why

    sliver, why = looks_usable('<svg><path d="M0 0 L500 0 L500 2 L0 2 Z"/></svg>')
    assert not sliver and "aspect" in why, why

    # a big traced shape in SOURCE pixels must pass — size is judged after
    # normalization, not against raw pixel numbers (this was a real bug)
    big, why = looks_usable('<svg><path d="M0 0 L512 0 L512 512 L0 512 Z"/></svg>')
    assert big, f"512px traced shape should pass, got: {why}"

    # normalization actually lands inside the viewBox
    norm = normalize_to_viewbox('<path d="M0 0 L512 0 L512 512 L0 512 Z"/>')
    assert norm.startswith("<g transform="), norm[:40]
    import re as _re
    sc = float(_re.search(r"scale\(([\d.]+)\)", norm).group(1))
    assert 0 < sc * 512 <= VIEWBOX, f"normalized span {sc * 512} must fit {VIEWBOX}"

    noisy = "<svg>" + '<path d="M10 10 L90 10 L90 90 Z"/>' * 41 + "</svg>"
    bad2, why = looks_usable(noisy)
    assert not bad2 and "subpaths" in why, why

    # colour contract
    out = to_asset_svg('<svg xmlns="x"><path d="M0 0 L1 1" fill="#123456"/></svg>')
    assert 'fill="var(--ink)"' in out and "#123456" not in out, out
    assert "<svg" not in out, "asset svg must be a fragment, not a document"
    # fill="none" means "outline only" in the authored library — it must
    # survive, not be repainted into a solid shape
    kept = to_asset_svg('<svg><path d="M0 0" fill="none" stroke="#abc"/></svg>')
    assert 'fill="none"' in kept, kept

    # a stroked-only path still gets a fill so it is visible
    stroked = to_asset_svg('<svg><path d="M0 0 L1 1" stroke="#abcdef"/></svg>')
    assert 'stroke="var(--ink)"' in stroked, stroked

    print("genassets.selfcheck: OK")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="genassets", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate", help="diffusion -> candidate PNGs")
    g.add_argument("--count", type=int, default=8)
    g.add_argument("--seed", type=int, default=0)
    g.add_argument("--steps", type=int, default=4)
    g.add_argument("--guidance", type=float, default=0.0)
    g.add_argument("--prompt", default=DEFAULT_PROMPT)
    g.add_argument("--model", default="stabilityai/sd-turbo")
    g.add_argument("-o", "--out", required=True)
    g.set_defaults(fn=cmd_generate)

    v = sub.add_parser("vectorize", help="PNGs -> asset JSON (with geometry gate)")
    v.add_argument("folder")
    v.add_argument("-o", "--out", required=True)
    v.add_argument("--speckle", type=int, default=8)
    v.set_defaults(fn=cmd_vectorize)

    t = sub.add_parser("gate", help="score candidates with the #75 taste model")
    t.add_argument("assets")
    t.add_argument("--index")
    t.add_argument("--model")
    t.add_argument("--clip-model", default="ViT-L-14-quickgelu")
    t.add_argument("--pretrained", default="openai")
    t.add_argument("--threshold", type=float, default=0.0)
    t.add_argument("-o", "--out", default="gated-assets.json")
    t.set_defaults(fn=cmd_gate)

    s = sub.add_parser("selfcheck", help="no model needed")
    s.set_defaults(fn=cmd_selfcheck)

    a = ap.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
