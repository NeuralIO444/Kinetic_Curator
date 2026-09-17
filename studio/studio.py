#!/usr/bin/env python3
"""Kinetic Curator studio CLI — headless render farm (issue #74 / #90)."""
from __future__ import annotations

import argparse
import hashlib
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
EXPORT_STILL_MJS = HERE / ".." / "app" / "src" / "gl" / "exportStill.mjs"
ACCUM_STILL_MJS = HERE / ".." / "app" / "src" / "gl" / "accumStill.mjs"
CANVAS_W, CANVAS_H = 1000, 700
DEFAULT_ACCUM_FADE = 0.88
DEFAULT_ACCUM_OPTICS = 0.0

# ── Resource ceilings (#106 item 2) ────────────────────────────────────────
# A render farm runs unattended on whatever a project file says. Without
# these, `--res 99999x99999` asks the GPU readback for a 40GB RGBA buffer and
# the machine swaps until something is killed, and a hung `node` blocks the
# batch forever with no output and no error.
MAX_DIM = 16384                   # PNG sanity, and 16384^2 is already 1GB RGBA
MAX_PIXELS = 64_000_000           # ~256MB RGBA per in-flight frame; 8K is 33MP
# Named still presets, shared with app/src/gl/exportStill.mjs (4k/8k).
RES_PRESETS = {"4k": (3840, 2688), "8k": (7680, 5376)}
RENDER_TIMEOUT_S = 300            # one node render; 4K swarm bakes are slow but finite
FFMPEG_TIMEOUT_S = 1800           # whole-clip encode
BYTES_PER_PIXEL_INFLIGHT = 8      # RGBA frame + PNG encode buffer, roughly
CHROMIUM_JOB_BYTES = 384 * 1024 * 1024  # one headless Chromium per in-flight job (#191)


def which(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(f"{name} not found on PATH (brew install {name})")
    return path


def parse_res(spec: str) -> tuple[int, int]:
    """WxH, a 4k/8k preset, or a scale factor, clamped to something a machine can actually hold."""
    key = str(spec).strip().lower()
    if key in RES_PRESETS:
        return RES_PRESETS[key]
    try:
        if "x" in key:
            w, _, h = key.partition("x")
            w, h = int(w), int(h)
        else:
            mul = float(key)
            w, h = round(CANVAS_W * mul), round(CANVAS_H * mul)
    except (TypeError, ValueError):
        sys.exit(f"bad --res {spec!r}: expected WxH, 4k, 8k, or a scale factor (e.g. 2)")

    if w < 1 or h < 1:
        sys.exit(f"bad --res {spec!r}: dimensions must be positive")
    if w > MAX_DIM or h > MAX_DIM:
        sys.exit(f"--res {w}x{h} exceeds the {MAX_DIM}px per-side limit")
    if w * h > MAX_PIXELS:
        sys.exit(
            f"--res {w}x{h} is {w * h / 1e6:.1f}MP, over the {MAX_PIXELS / 1e6:.0f}MP limit "
            f"(~{w * h * 4 / 1e9:.1f}GB per RGBA frame). Render in tiles or lower the resolution."
        )
    return w, h


def total_memory_bytes() -> int | None:
    """Physical RAM, or None if the platform will not say."""
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    except (ValueError, OSError, AttributeError):
        return None


def safe_jobs(requested: int, size: tuple[int, int]) -> int:
    """Clamp --jobs against cores and against memory (#106 item 2).

    Every in-flight job holds a full RGBA frame plus an encode buffer, and —
    since #191 — its own headless Chromium, so on unified-memory hardware a
    large --res with a large --jobs is how you wedge the machine. Cap at half
    of RAM; the renderer is not the only thing running.
    """
    jobs = max(1, int(requested or 1))
    jobs = min(jobs, (os.cpu_count() or 4) * 2)
    mem = total_memory_bytes()
    if mem:
        per_job = max(1, size[0] * size[1] * BYTES_PER_PIXEL_INFLIGHT + CHROMIUM_JOB_BYTES)
        by_mem = max(1, int((mem // 2) // per_job))
        if by_mem < jobs:
            print(
                f"  [studio] --jobs {jobs} -> {by_mem}: {size[0]}x{size[1]} needs "
                f"~{per_job / 1e6:.0f}MB per job, keeping within half of "
                f"{mem / 1e9:.0f}GB RAM",
                file=sys.stderr,
            )
            jobs = by_mem
    return jobs


def under(base: Path, *parts: str) -> Path:
    """Join and assert the result stays inside base (#106 item 3).

    Batch and video generate filenames in a loop. The components are
    integer-derived today, so this is a guard rather than a fix — but an
    output jail is only worth anything if it is asserted at the point of
    write, not assumed at the point of parsing.
    """
    root = base.resolve()
    target = root.joinpath(*parts).resolve()
    if root != target and root not in target.parents:
        sys.exit(f"refusing to write outside {root}: {target}")
    return target


def clamp_fade(fade) -> float:
    try:
        n = float(fade)
    except (TypeError, ValueError):
        return DEFAULT_ACCUM_FADE
    return max(0.0, min(0.99, n))


def clamp_optics(optics) -> float:
    try:
        n = float(optics)
    except (TypeError, ValueError):
        return DEFAULT_ACCUM_OPTICS
    return max(0.0, min(1.0, n))


def clamp_accum01(v, default=0.0) -> float:
    """Phase A feedback amounts (TUNNEL/PRISM): 0..1, off by default."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, n))


def project_fade(project: Path, override) -> float:
    if override is not None:
        return clamp_fade(override)
    try:
        doc = json.loads(project.read_text())
        return clamp_fade((doc.get("layoutParams") or {}).get("accumulationFade"))
    except Exception:
        return DEFAULT_ACCUM_FADE


def project_optics(project: Path, override) -> float:
    """The GLOW slider (layoutParams.accumulationOptics), or --optics."""
    if override is not None:
        return clamp_optics(override)
    try:
        doc = json.loads(project.read_text())
        return clamp_optics((doc.get("layoutParams") or {}).get("accumulationOptics"))
    except Exception:
        return DEFAULT_ACCUM_OPTICS


def project_tunnel(project: Path, override) -> float:
    """The TUNNEL slider (layoutParams.accumulationTunnel), or --tunnel."""
    if override is not None:
        return clamp_accum01(override)
    try:
        doc = json.loads(project.read_text())
        return clamp_accum01((doc.get("layoutParams") or {}).get("accumulationTunnel"))
    except Exception:
        return 0.0


def project_prism(project: Path, override) -> float:
    """The PRISM slider (layoutParams.accumulationPrism), or --prism."""
    if override is not None:
        return clamp_accum01(override)
    try:
        doc = json.loads(project.read_text())
        return clamp_accum01((doc.get("layoutParams") or {}).get("accumulationPrism"))
    except Exception:
        return 0.0


class RenderError(RuntimeError):
    """One edition failed to render. Carries enough to write a sidecar."""

    def __init__(self, message, *, returncode=None, stderr=""):
        super().__init__(message)
        self.returncode = returncode
        self.stderr = stderr


def render_gpu(project: Path, out_png: Path, size: tuple[int, int], *,
               seed=None, uncapped=False, background=None, time=0.0,
               progress=0.0, ramps=None, motion="none") -> None:
    """One still via the SHARED GPU recipe (#191).

    project → app/src/gl/exportStill.mjs → WebGL2 render at `size` →
    readPixels → PNG. A pure function of (project, seed, size): no live
    store, no SVG serialization, no resvg. Raises RenderError on failure
    (safe inside ThreadPoolExecutor workers: raises, never sys.exit).
    """
    if not project.is_file():
        sys.exit(
            f"project not found: {project}\n"
            "In the app: OUTPUT → save project, then pass that file path."
        )
    out_png.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["node", str(EXPORT_STILL_MJS), str(project),
           "--out", str(out_png), "--res", f"{size[0]}x{size[1]}"]
    if seed is not None:
        cmd += ["--seed", str(seed)]
    if uncapped:
        cmd += ["--uncapped"]
    if background:
        cmd += ["--background", background]
    if time:
        cmd += ["--time", repr(time)]
    if progress:
        cmd += ["--progress", repr(progress)]
    for r in ramps or []:
        cmd += ["--ramp", r]
    if motion:
        cmd += ["--motion", motion]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=RENDER_TIMEOUT_S)
    except subprocess.TimeoutExpired as exc:
        raise RenderError(
            f"exportStill.mjs exceeded {RENDER_TIMEOUT_S}s for {project}",
            returncode=None,
            stderr=(exc.stderr or b"").decode("utf-8", "replace").strip()[-2000:],
        ) from exc
    err = proc.stderr.decode("utf-8", "replace") if proc.stderr else ""
    if err:
        sys.stderr.write(err)
        sys.stderr.flush()
    if proc.returncode == 3:
        # Headless Chromium missing: refuse rather than rendering a different
        # recipe. The guidance is already on stderr.
        raise RenderError(
            "refusing: the shared GPU recipe needs headless Chromium "
            "(cd app && npx playwright install chromium)",
            returncode=3, stderr=err.strip()[-2000:],
        )
    if proc.returncode != 0:
        raise RenderError(
            f"exportStill.mjs exited {proc.returncode} for {project}",
            returncode=proc.returncode,
            stderr=err.strip()[-2000:],
        )


def normalized_project(project: Path) -> dict | None:
    """What the kernel will actually use, after normalizeLayoutParams.

    A sidecar exists so an edition can be reproduced later, so it has to
    describe the render that happened rather than the JSON that was asked
    for. Those differ exactly when the project is out of bounds - which is
    when you most need to know (#106). Normalization depends only on the
    project, not the seed, so this runs once per batch rather than per
    edition; a failure here is not worth aborting a render over.
    """
    try:
        proc = subprocess.run(
            ["node", str(RENDER_MJS), str(project), "--emit-normalized"],
            capture_output=True, timeout=RENDER_TIMEOUT_S,
        )
        if proc.returncode != 0:
            return None
        return json.loads(proc.stdout.decode("utf-8"))
    except (subprocess.SubprocessError, OSError, ValueError):
        return None


def sidecar(project: Path, seed, size, uncapped, extra=None, normalized=None) -> dict:
    doc = json.loads(project.read_text())
    if seed is not None:
        doc["seed"] = int(seed) & 0xFFFFFFFF
    doc["_render"] = {
        "width": size[0], "height": size[1],
        "uncapped": uncapped,
        "renderer": "app/src/gl/exportStill.mjs (WebGL2 GPU readback)",
        "source": str(project),
    }
    if normalized is not None:
        # The top-level keys above are the project as authored; this is the
        # sanitized form the kernel ran on. Keep both - the difference is the
        # audit trail.
        doc["_render"]["normalized"] = normalized.get("layoutParams")
    if extra:
        doc["_render"].update(extra)
    return doc


def cmd_render(a) -> None:
    size = parse_res(a.res)
    out = Path(a.out)
    if getattr(a, "accum", False):
        cmd_accum(a, size, out)
        return
    # #191: FINAL stills come from the GPU readback path (exportStill.mjs).
    # The render.mjs + resvg stills path is retired for final output.
    render_gpu(Path(a.project), out, size, seed=a.seed, uncapped=a.uncapped,
               background=a.background)
    if a.sidecar:
        out.with_suffix(".json").write_text(
            json.dumps(sidecar(Path(a.project), a.seed, size, a.uncapped), indent=2))
    print(out)


def cmd_accum(a, size, out: Path) -> None:
    """Trail still via the SHARED ACCUM recipe (#190, #169).

    The feedback loop (fade, blur-over-time, bloom, halation) lives in
    app/src/gl/accum.mjs and runs on the GPU in headless Chromium. studio.py
    must not reimplement it: per #169's rule the export shares the recipe or
    refuses. The old ffmpeg colorchannelmixer composite was a second recipe
    and is gone.
    """
    project = Path(a.project)
    if not project.is_file():
        sys.exit(
            f"project not found: {project}\n"
            "In the app: OUTPUT → save project, then pass that file path."
        )
    steps = max(2, int(a.steps))
    fade = project_fade(project, a.fade)
    optics = project_optics(project, a.optics)
    tunnel = project_tunnel(project, a.tunnel)
    prism = project_prism(project, a.prism)
    cmd = [
        "node", str(ACCUM_STILL_MJS), str(project),
        "--out", str(out),
        "--steps", str(steps),
        "--fade", repr(fade),
        "--optics", repr(optics),
        "--tunnel", repr(tunnel),
        "--prism", repr(prism),
        "--res", f"{size[0]}x{size[1]}",
    ]
    if a.seed is not None:
        cmd += ["--seed", str(a.seed)]
    if a.uncapped:
        cmd += ["--uncapped"]
    if a.background:
        cmd += ["--background", a.background]
    for r in a.ramp or []:
        cmd += ["--ramp", r]
    if a.motion:
        cmd += ["--motion", a.motion]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=RENDER_TIMEOUT_S)
    except subprocess.TimeoutExpired as exc:
        raise RenderError(f"accumStill.mjs exceeded {RENDER_TIMEOUT_S}s for {project}") from exc
    err = proc.stderr.decode("utf-8", "replace") if proc.stderr else ""
    if err:
        sys.stderr.write(err)
        sys.stderr.flush()
    if proc.returncode == 3:
        # Headless Chromium missing: refuse --accum rather than rendering a
        # different recipe. The guidance is already on stderr.
        raise RenderError(
            "refusing --accum: the shared GPU recipe needs headless Chromium "
            "(cd app && npx playwright install chromium)",
            returncode=3, stderr=err.strip()[-2000:],
        )
    if proc.returncode != 0:
        raise RenderError(
            f"accumStill.mjs exited {proc.returncode} for {project}",
            returncode=proc.returncode,
            stderr=err.strip()[-2000:],
        )
    if a.sidecar:
        out.with_suffix(".json").write_text(json.dumps(sidecar(
            project, a.seed, size, a.uncapped,
            extra={"accum": True, "steps": steps, "fade": fade,
                   "optics": optics, "tunnel": tunnel, "prism": prism,
                   "renderer": "app/src/gl (WebGL2) shared ACCUM recipe"},
        ), indent=2))
    print(out)


def edition_hash(project: Path, seed, size, uncapped, normalized) -> str:
    """Identity of one edition's inputs (#106 item 5).

    Resume has to answer "is the PNG on disk still the right answer?", which
    is a question about inputs, not outputs. Hashing the NORMALIZED project
    rather than the file bytes means reformatting the JSON or editing a field
    the kernel clamps away does not invalidate a finished batch - but a change
    that actually alters the render does.
    """
    payload = json.dumps({
        "renderer": "gpu-readback",  # #191: a renderer change invalidates old manifests
        "normalized": normalized,
        "raw": None if normalized else json.loads(project.read_text()),
        "seed": int(seed) & 0xFFFFFFFF,
        "size": list(size),
        "uncapped": bool(uncapped),
    }, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def read_manifest(path: Path) -> dict:
    try:
        doc = json.loads(path.read_text())
        return {e["path"]: e for e in doc.get("editions", []) if "path" in e}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def cmd_batch(a) -> None:
    size = parse_res(a.res)
    outdir = Path(a.out)
    outdir.mkdir(parents=True, exist_ok=True)
    project = Path(a.project)
    seeds = [(a.start_seed + i) & 0xFFFFFFFF for i in range(a.count)]
    width = len(str(a.count))
    jobs = safe_jobs(a.jobs, size)
    # Once for the whole batch: normalization is a function of the project.
    normalized = normalized_project(project)

    manifest_path = outdir / "manifest.json"
    prior = {} if a.force else read_manifest(manifest_path)

    def one(i_seed):
        i, seed = i_seed
        stem = under(outdir, f"{i:0{width}d}-{seed:08x}")
        digest = edition_hash(project, seed, size, a.uncapped, normalized)

        # Resume: skip only when the PNG is still on disk AND was produced
        # from these exact inputs. A half-finished batch is the common case
        # for 4K work, and re-rendering 400 good frames to get the last 100 is
        # the expensive kind of correct.
        if not a.force:
            was = prior.get(stem.name)
            if (was and was.get("status") == "ok" and was.get("hash") == digest
                    and stem.with_suffix(".png").is_file()):
                return (stem, True, "skipped", digest)

        try:
            # #191: each edition renders through the shared GPU path — same
            # path per seed, no live store, no resvg.
            render_gpu(project, stem.with_suffix(".png"), size, seed=seed,
                       uncapped=a.uncapped, background=a.background)
        except (RenderError, subprocess.CalledProcessError, OSError, ValueError) as exc:
            # A batch is a long unattended job. Losing 499 good editions
            # because one seed hit a bad code path is the worst outcome, so
            # record the failure in the sidecar and keep going (#106).
            doc = {
                "ok": False,
                "seed": int(seed) & 0xFFFFFFFF,
                "error": str(exc),
                "stderr": getattr(exc, "stderr", "") or "",
                "_render": {
                    "width": size[0], "height": size[1],
                    "uncapped": a.uncapped,
                    "renderer": "app/src/gl/exportStill.mjs (WebGL2 GPU readback)",
                    "source": str(project),
                },
            }
            doc["hash"] = digest
            stem.with_suffix(".json").write_text(json.dumps(doc, indent=2))
            # Do not leave a truncated PNG behind to be mistaken for output.
            png = stem.with_suffix(".png")
            if png.exists():
                png.unlink()
            return (stem, False, "failed", digest)

        doc = sidecar(project, seed, size, a.uncapped, normalized=normalized)
        doc["ok"] = True
        doc["hash"] = digest
        stem.with_suffix(".json").write_text(json.dumps(doc, indent=2))
        return (stem, True, "ok", digest)

    done = 0
    failed = []
    skipped = 0
    editions = []
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        for stem, ok, status, digest in pool.map(one, enumerate(seeds)):
            done += 1
            if not ok:
                failed.append(stem.name)
            if status == "skipped":
                skipped += 1
            editions.append({
                "path": stem.name,
                "seed": int(stem.name.split("-")[-1], 16),
                "hash": digest,
                "status": "ok" if ok else "failed",
                "png": stem.with_suffix(".png").name if ok else None,
            })
            if done % 25 == 0 or done == len(seeds):
                print(f"  {done}/{len(seeds)}"
                      + (f" ({skipped} skipped)" if skipped else "")
                      + (f" ({len(failed)} failed)" if failed else ""), flush=True)

    manifest_path.write_text(json.dumps({
        "project": str(project),
        "kernelVersion": (normalized or {}).get("kernelVersion"),
        "size": list(size),
        "uncapped": bool(a.uncapped),
        "count": len(seeds),
        "ok": len(seeds) - len(failed),
        "failed": len(failed),
        "skipped": skipped,
        "editions": sorted(editions, key=lambda e: e["path"]),
    }, indent=2))

    print(outdir)
    if skipped:
        print(f"  {skipped} unchanged edition(s) reused; --force to re-render")
    if failed:
        # Report every failure, then exit non-zero so a wrapping script or CI
        # notices - but only after the rest of the batch has been written.
        print(f"  {len(failed)} of {len(seeds)} editions failed:", file=sys.stderr)
        for name in failed[:20]:
            print(f"    {name}.json", file=sys.stderr)
        if len(failed) > 20:
            print(f"    ... and {len(failed) - 20} more", file=sys.stderr)
        sys.exit(1)


def cmd_video(a) -> None:
    if a.motion == "list":
        subprocess.run(["node", str(RENDER_MJS), "--motion", "list"], check=True)
        return
    size = parse_res(a.res)
    project = Path(a.project)
    frames_n = max(1, round(a.duration * a.fps))
    keep = Path(a.frames) if a.frames else None
    tmp = Path(tempfile.mkdtemp(prefix="kc-frames-")) if keep is None else keep
    tmp.mkdir(parents=True, exist_ok=True)

    def one(i):
        t = i / a.fps
        # #191: frames come from the GPU readback path (same recipe as
        # stills); ffmpeg still assembles the clip — file-delivery post only.
        render_gpu(project, under(tmp, f"f{i:06d}.png"), size, seed=a.seed,
                   uncapped=a.uncapped, background=a.background, time=t,
                   progress=i / max(1, frames_n - 1), ramps=a.ramp,
                   motion=a.motion)

    with ThreadPoolExecutor(max_workers=safe_jobs(a.jobs, size)) as pool:
        for i, _ in enumerate(pool.map(one, range(frames_n)), 1):
            if i % 10 == 0 or i == frames_n:
                print(f"  frame {i}/{frames_n}", flush=True)

    which("ffmpeg")
    subprocess.run([
        "ffmpeg", "-y", "-framerate", str(a.fps), "-i", str(tmp / "f%06d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(a.crf),
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", str(a.out),
    ], check=True, timeout=FFMPEG_TIMEOUT_S)
    if keep is None:
        shutil.rmtree(tmp, ignore_errors=True)
    print(a.out)


def main(argv=None) -> None:
    which("node")

    p = argparse.ArgumentParser(prog="studio", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("project", help="project JSON exported from the app")
        sp.add_argument("--res", default="1", help="WxH in px, 4k/8k preset, or a scale factor of 1000x700 (default 1)")
        sp.add_argument("--seed", type=int, default=None)
        sp.add_argument("--uncapped", action="store_true")
        sp.add_argument("--background", default=None)
        sp.add_argument("--jobs", type=int, default=os.cpu_count() or 4)

    sp = sub.add_parser("render", help="one project -> one PNG")
    common(sp)
    sp.add_argument("-o", "--out", required=True)
    sp.add_argument("--sidecar", action="store_true")
    sp.add_argument("--accum", action="store_true")
    sp.add_argument("--steps", type=int, default=24)
    sp.add_argument("--fps", type=int, default=30)
    sp.add_argument("--fade", type=float, default=None)
    sp.add_argument("--optics", type=float, default=None,
                    help="ACCUM optics amount 0..1 (GLOW slider: bloom + halation + blur-over-time)")
    sp.add_argument("--tunnel", type=float, default=None,
                    help="ACCUM feedback amount 0..1 (TUNNEL slider: zoom + spin light-tunnels)")
    sp.add_argument("--prism", type=float, default=None,
                    help="ACCUM chromatic drift 0..1 (PRISM slider: trails split into rainbow fringes)")
    sp.add_argument("--ramp", action="append", default=[])
    sp.add_argument("--motion", default="auto")
    sp.set_defaults(func=cmd_render)

    sp = sub.add_parser("batch", help="N seeds -> PNG + JSON sidecar each")
    common(sp)
    sp.add_argument("-o", "--out", required=True)
    sp.add_argument("--count", type=int, default=100)
    sp.add_argument("--start-seed", type=int, default=0)
    sp.add_argument("--force", action="store_true",
                    help="re-render editions that manifest.json says are already done")
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
    try:
        a.func(a)
    except RenderError as exc:
        # Single-shot commands still fail fast and quietly - a traceback here
        # would bury the actual render.mjs error that was already printed to
        # stderr. cmd_batch handles its own failures per edition instead.
        print(f"studio: {exc}", file=sys.stderr)
        sys.exit(exc.returncode or 1)


if __name__ == "__main__":
    main()
