#!/usr/bin/env python3
"""Kinetic Curator studio CLI — headless render farm (issue #74 / #90)."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
RENDER_MJS = HERE / "render.mjs"
CANVAS_W, CANVAS_H = 1000, 700
DEFAULT_MONOSPACE = "Menlo"
DEFAULT_ACCUM_FADE = 0.88


def which(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(f"{name} not found on PATH (brew install {name})")
    return path


def parse_res(spec: str) -> tuple[int, int]:
    if "x" in spec.lower():
        w, _, h = spec.lower().partition("x")
        return int(w), int(h)
    mul = float(spec)
    return round(CANVAS_W * mul), round(CANVAS_H * mul)


def clamp_fade(fade) -> float:
    try:
        n = float(fade)
    except (TypeError, ValueError):
        return DEFAULT_ACCUM_FADE
    return max(0.0, min(0.99, n))


def project_fade(project: Path, override) -> float:
    if override is not None:
        return clamp_fade(override)
    try:
        doc = json.loads(project.read_text())
        return clamp_fade((doc.get("layoutParams") or {}).get("accumulationFade"))
    except Exception:
        return DEFAULT_ACCUM_FADE


def build_svg(project: Path, *, seed=None, time=0.0, progress=0.0,
              ramps=None, motion=None, uncapped=False, width=None, height=None,
              background=None) -> bytes:
    cmd = ["node", str(RENDER_MJS), str(project)]
    if seed is not None:
        cmd += ["--seed", str(seed)]
    if time:
        cmd += ["--time", repr(time)]
    if progress:
        cmd += ["--progress", repr(progress)]
    for r in ramps or []:
        cmd += ["--ramp", r]
    if motion:
        cmd += ["--motion", motion]
    if uncapped:
        cmd += ["--uncapped"]
    if width:
        cmd += ["--width", str(width), "--height", str(height)]
    if background:
        cmd += ["--background", background]
    proc = subprocess.run(cmd, check=True, capture_output=True)
    if proc.stderr:
        sys.stderr.write(proc.stderr.decode("utf-8", "replace"))
        sys.stderr.flush()
    return proc.stdout


def rasterize(svg: bytes, out_png: Path, monospace=DEFAULT_MONOSPACE) -> None:
    out_png.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["resvg", "--monospace-family", monospace, "--resources-dir", str(HERE),
         "--quiet", "-", str(out_png)],
        input=svg, check=True,
    )


def render_one(project: Path, out_png: Path, size: tuple[int, int], *,
               seed=None, uncapped=False, background=None, time=0.0,
               progress=0.0, ramps=None, motion=None, monospace=DEFAULT_MONOSPACE) -> None:
    svg = build_svg(project, seed=seed, time=time, progress=progress,
                    ramps=ramps, motion=motion, uncapped=uncapped, width=size[0],
                    height=size[1], background=background)
    rasterize(svg, out_png, monospace)


def sidecar(project: Path, seed, size, uncapped, extra=None) -> dict:
    doc = json.loads(project.read_text())
    if seed is not None:
        doc["seed"] = int(seed) & 0xFFFFFFFF
    doc["_render"] = {
        "width": size[0], "height": size[1],
        "uncapped": uncapped,
        "renderer": "studio/render.mjs + resvg",
        "source": str(project),
    }
    if extra:
        doc["_render"].update(extra)
    return doc


def composite_accum(frames: list[Path], out_png: Path, fade: float) -> None:
    """destination-in keep, then source-over — same law as useAccumulationBuffer."""
    ffmpeg = which("ffmpeg")
    keep = clamp_fade(fade)
    buf = frames[0]
    work = out_png.with_suffix(".accum-buf.png")
    shutil.copyfile(buf, work)
    for nxt in frames[1:]:
        tmp = out_png.with_suffix(".accum-next.png")
        subprocess.run([
            ffmpeg, "-y", "-i", str(work), "-i", str(nxt),
            "-filter_complex",
            f"[0:v]format=rgba,colorchannelmixer=aa={keep:.4f}[f];[f][1:v]overlay=format=auto",
            "-frames:v", "1", str(tmp),
        ], check=True, capture_output=True)
        work.replace if False else None
        shutil.move(tmp, work)
    shutil.move(work, out_png)


def cmd_render(a) -> None:
    size = parse_res(a.res)
    out = Path(a.out)
    if a.accum:
        cmd_accum(a, size, out)
        return
    render_one(Path(a.project), out, size, seed=a.seed, uncapped=a.uncapped,
               background=a.background, monospace=a.monospace)
    if a.sidecar:
        out.with_suffix(".json").write_text(
            json.dumps(sidecar(Path(a.project), a.seed, size, a.uncapped), indent=2))
    print(out)


def cmd_accum(a, size, out: Path) -> None:
    project = Path(a.project)
    steps = max(2, int(a.steps))
    fps = max(1, int(a.fps))
    fade = project_fade(project, a.fade)
    tmp = Path(tempfile.mkdtemp(prefix="kc-accum-"))
    frames = []
    try:
        for i in range(steps):
            png = tmp / f"f{i:04d}.png"
            render_one(project, png, size, seed=a.seed, uncapped=a.uncapped,
                       background=a.background, time=i / fps,
                       progress=i / max(1, steps - 1), ramps=a.ramp,
                       motion=a.motion, monospace=a.monospace)
            frames.append(png)
            if (i + 1) % 5 == 0 or i + 1 == steps:
                print(f"  accum frame {i + 1}/{steps}", flush=True)
        composite_accum(frames, out, fade)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if a.sidecar:
        out.with_suffix(".json").write_text(json.dumps(sidecar(
            project, a.seed, size, a.uncapped,
            extra={"accum": True, "steps": steps, "fade": fade, "fps": fps},
        ), indent=2))
    print(out)


def cmd_svg(a) -> None:
    svg = build_svg(Path(a.project), seed=a.seed, uncapped=a.uncapped,
                    background=a.background)
    Path(a.out).write_bytes(svg) if a.out else sys.stdout.buffer.write(svg)


def cmd_batch(a) -> None:
    size = parse_res(a.res)
    outdir = Path(a.out)
    outdir.mkdir(parents=True, exist_ok=True)
    project = Path(a.project)
    seeds = [(a.start_seed + i) & 0xFFFFFFFF for i in range(a.count)]
    width = len(str(a.count))

    def one(i_seed):
        i, seed = i_seed
        stem = outdir / f"{i:0{width}d}-{seed:08x}"
        render_one(project, stem.with_suffix(".png"), size, seed=seed,
                   uncapped=a.uncapped, background=a.background,
                   monospace=a.monospace)
        stem.with_suffix(".json").write_text(
            json.dumps(sidecar(project, seed, size, a.uncapped), indent=2))
        return stem

    done = 0
    with ThreadPoolExecutor(max_workers=a.jobs) as pool:
        for _ in pool.map(one, enumerate(seeds)):
            done += 1
            if done % 25 == 0 or done == len(seeds):
                print(f"  {done}/{len(seeds)}", flush=True)
    print(outdir)


def cmd_video(a) -> None:
    if a.motion == "list":
        subprocess.run(["node", str(RENDER_MJS), "--motion", "list"], check=True)
        return
    size = parse_res(a.res)
    project = Path(a.project)
    frames = max(1, round(a.duration * a.fps))
    keep = Path(a.frames) if a.frames else None
    tmp = Path(tempfile.mkdtemp(prefix="kc-frames-")) if keep is None else keep
    tmp.mkdir(parents=True, exist_ok=True)

    def one(i):
        t = i / a.fps
        render_one(project, tmp / f"f{i:06d}.png", size, seed=a.seed,
                   uncapped=a.uncapped, background=a.background, time=t,
                   progress=i / max(1, frames - 1), ramps=a.ramp,
                   motion=a.motion, monospace=a.monospace)

    with ThreadPoolExecutor(max_workers=a.jobs) as pool:
        for i, _ in enumerate(pool.map(one, range(frames)), 1):
            if i % 10 == 0 or i == frames:
                print(f"  frame {i}/{frames}", flush=True)

    which("ffmpeg")
    subprocess.run([
        "ffmpeg", "-y", "-framerate", str(a.fps), "-i", str(tmp / "f%06d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(a.crf),
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", str(a.out),
    ], check=True)
    if keep is None:
        shutil.rmtree(tmp, ignore_errors=True)
    print(a.out)


def main(argv=None) -> None:
    which("node")
    which("resvg")

    p = argparse.ArgumentParser(prog="studio", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("project", help="project JSON exported from the app")
        sp.add_argument("--res", default="1", help="WxH in px, or a scale factor of 1000x700 (default 1)")
        sp.add_argument("--seed", type=int, default=None, help="override the project's seed")
        sp.add_argument("--uncapped", action="store_true")
        sp.add_argument("--background", default=None)
        sp.add_argument("--monospace", default=DEFAULT_MONOSPACE)
        sp.add_argument("--jobs", type=int, default=os.cpu_count() or 4)

    sp = sub.add_parser("render", help="one project -> one PNG")
    common(sp)
    sp.add_argument("-o", "--out", required=True)
    sp.add_argument("--sidecar", action="store_true")
    sp.add_argument("--accum", action="store_true",
                    help="composite N frames with the live ACCUM fade law at target resolution (#90)")
    sp.add_argument("--steps", type=int, default=24, help="ACCUM frames (default 24)")
    sp.add_argument("--fps", type=int, default=30, help="ACCUM time base (default 30)")
    sp.add_argument("--fade", type=float, default=None,
                    help="ACCUM keep fraction; default project accumulationFade or 0.88")
    sp.add_argument("--ramp", action="append", default=[], help="layoutParam=from:to over the ACCUM steps")
    sp.add_argument("--motion", default="auto")
    sp.set_defaults(func=cmd_render)

    sp = sub.add_parser("svg", help="one project -> SVG")
    common(sp)
    sp.add_argument("-o", "--out", default=None)
    sp.set_defaults(func=cmd_svg)

    sp = sub.add_parser("batch", help="N seeds -> PNG + JSON sidecar each")
    common(sp)
    sp.add_argument("-o", "--out", required=True)
    sp.add_argument("--count", type=int, default=100)
    sp.add_argument("--start-seed", type=int, default=0)
    sp.set_defaults(func=cmd_batch)

    sp = sub.add_parser("video", help="fixed-timestep frame sequence -> MP4")
    common(sp)
    sp.add_argument("-o", "--out", required=True)
    sp.add_argument("--fps", type=int, default=30)
    sp.add_argument("--duration", type=float, default=4.0)
    sp.add_argument("--crf", type=int, default=16)
    sp.add_argument("--ramp", action="append", default=[])
    sp.add_argument("--motion", default="auto")
    sp.add_argument("--frames", default=None)
    sp.set_defaults(func=cmd_video)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
