#!/usr/bin/env python3
"""Print desk post: run the #172 ffmpeg allow-list on a still.

Farm twin of the in-app print desk (app/src/fx/printPost.js). The desk's
sidecar (`*.post.json`) carries the exact ffmpeg filtergraph for the
operator's chip stack; this script applies it with real ffmpeg, or the
operator can pass the chips as flags directly.

Allow-list (anything else is a later issue):
    --gblur SIGMA        gblur=sigma=SIGMA
    --unsharp AMOUNT     unsharp=5:5:AMOUNT
    --noise ALLS         noise=alls=ALLS:allf=t
    --vignette ANGLE     vignette=angle=ANGLE        (radians; desk maps 0..1 → 0..PI/2)
    --eq B,C,S           eq=brightness=B:contrast=C:saturation=S
    --chromashift PX     chromashift=cbh=PX:crh=-PX  (desk: red moves left, blue right)

Usage:
    python3 studio/print_post.py source.png --gblur 2 --noise 25 -o preview.png
    python3 studio/print_post.py source.png --from-sidecar desk.post.json -o preview.png
    # --sidecar also writes preview.post.json documenting the stack
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

FFMPEG_TIMEOUT_S = 300

# The allow-list. Each entry maps the CLI flag to the ffmpeg filter segment.
# No free-form filtergraph is ever accepted from the operator.
ALLOW = ("gblur", "unsharp", "noise", "vignette", "eq", "chromashift")


def which_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        sys.exit("ffmpeg not found on PATH — install it (brew install ffmpeg / apt install ffmpeg)")
    return exe


def build_filtergraph(a) -> str:
    parts = []
    if a.gblur is not None:
        parts.append(f"gblur=sigma={a.gblur}")
    if a.unsharp is not None:
        parts.append(f"unsharp=5:5:{a.unsharp}")
    if a.noise is not None:
        parts.append(f"noise=alls={a.noise}:allf=t")
    if a.vignette is not None:
        parts.append(f"vignette=angle={a.vignette}")
    if a.eq is not None:
        b, c, s = a.eq
        parts.append(f"eq=brightness={b}:contrast={c}:saturation={s}")
    if a.chromashift is not None:
        px = a.chromashift
        parts.append(f"chromashift=cbh={px}:crh={-px}")
    return ",".join(parts)


def load_sidecar_stack(path: Path):
    """Read a desk sidecar's post.stack back into flag values. Fail closed."""
    doc = json.loads(path.read_text())
    stack = (doc.get("post") or {}).get("stack") or []
    vals = {}
    for entry in stack:
        chip = entry.get("chip")
        amount = float(entry.get("amount", 0))
        if chip == "BLUR":
            vals["gblur"] = amount
        elif chip == "SHARP":
            vals["unsharp"] = amount
        elif chip == "GRAIN":
            vals["noise"] = amount
        elif chip == "VIGNETTE":
            import math
            vals["vignette"] = amount * math.pi / 2
        elif chip == "GRADE":
            b = round(0.08 * amount, 4)
            c = round(1 + 0.25 * amount, 4)
            s = round(1 + 0.35 * amount, 4)
            vals["eq"] = (b, c, s)
        elif chip == "SPLIT":
            vals["chromashift"] = amount
        else:
            sys.exit(f"sidecar stack has unknown chip {chip!r} — not on the allow-list")
    return vals


def validate_filtergraph(fg: str) -> str:
    """Refuse any filtergraph containing a filter outside the allow-list."""
    for seg in fg.split(","):
        name = seg.split("=")[0].strip()
        if name not in ALLOW:
            sys.exit(f"refusing filter {name!r}: not on the #172 allow-list {ALLOW}")
    return fg


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="print_post", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", help="source still PNG (e.g. from studio.py render)")
    p.add_argument("-o", "--out", required=True, help="preview PNG output")
    p.add_argument("--sidecar", action="store_true",
                   help="also write <out>.post.json documenting the stack")
    p.add_argument("--from-sidecar", default=None, metavar="DESK.POST.JSON",
                   help="reproduce a desk sidecar's post.stack with real ffmpeg")
    p.add_argument("--gblur", type=float, default=None, metavar="SIGMA")
    p.add_argument("--unsharp", type=float, default=None, metavar="AMOUNT")
    p.add_argument("--noise", type=float, default=None, metavar="ALLS")
    p.add_argument("--vignette", type=float, default=None, metavar="ANGLE")
    p.add_argument("--eq", default=None, metavar="B,C,S",
                   help="brightness,contrast,saturation triple")
    p.add_argument("--chromashift", type=float, default=None, metavar="PX")
    a = p.parse_args(argv)

    src = Path(a.source)
    if not src.is_file():
        sys.exit(f"source not found: {src}")
    out = Path(a.out)

    if a.from_sidecar:
        vals = load_sidecar_stack(Path(a.from_sidecar))
        for k, v in vals.items():
            setattr(a, k, v)

    eq_triple = None
    if a.eq is not None and not isinstance(a.eq, tuple):
        try:
            b, c, s = (float(x) for x in str(a.eq).split(","))
        except ValueError:
            sys.exit("--eq needs B,C,S (e.g. --eq 0.02,1.0625,1.0875)")
        eq_triple = (b, c, s)
    elif isinstance(a.eq, tuple):
        eq_triple = a.eq
    a.eq = eq_triple

    fg = validate_filtergraph(build_filtergraph(a))
    if not fg:
        sys.exit("empty stack: nothing to apply (all chips off / no flags)")

    which_ffmpeg()
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-i", str(src), "-vf", fg, str(out)],
        check=True, timeout=FFMPEG_TIMEOUT_S,
    )

    if a.sidecar:
        doc = {
            "_render": {"source": str(src), "renderer": "studio/print_post.py (real ffmpeg)"},
            "post": {
                "ffmpeg_filtergraph": fg,
                "allow_list": list(ALLOW),
            },
        }
        out.with_suffix(".post.json").write_text(json.dumps(doc, indent=2) + "\n")
        print(out.with_suffix(".post.json"))
    print(out)


if __name__ == "__main__":
    main()
