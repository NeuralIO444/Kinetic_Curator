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
if str(HERE) not in sys.path:
    # runlog.py lives next to studio.py; this keeps `import runlog` working
    # whether studio.py runs as a script, via uv, or as a console entry point.
    sys.path.insert(0, str(HERE))
import runlog  # noqa: E402
from runlog import (  # noqa: E402
    MANIFEST_VERSION,
    RenderError,  # re-exported: defined in runlog.py, classified there
    RunLog,
    UserError,
    classify_failure,
    content_hash,
    detect_device,
    edition_record,
    error_record,
    finish_manifest,
    flags_to_json,
    git_info,
    new_run_id,
    pin_input,
    read_manifest_v2,
    start_manifest,
    validate_audio_sidecar,
    write_manifest,
)
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


def safe_jobs(requested: int, size: tuple[int, int], log: RunLog | None = None) -> int:
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
            msg = (f"[studio] --jobs {jobs} -> {by_mem}: {size[0]}x{size[1]} needs "
                   f"~{per_job / 1e6:.0f}MB per job, keeping within half of "
                   f"{mem / 1e9:.0f}GB RAM")
            if log is not None:
                log.emit("jobs_clamped", human=f"  {msg}", stream="stderr",
                         requested=jobs, clamped=by_mem,
                         width=size[0], height=size[1])
            else:
                print(f"  {msg}", file=sys.stderr)
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


# RenderError and UserError live in runlog.py (imported above); the failure
# classes are documented and classified there.


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
        raise UserError(
            f"project not found: {project}",
            "in the app: OUTPUT → save project, then pass that file path.",
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
            "refusing: the shared GPU recipe needs headless Chromium",
            returncode=3, stderr=err.strip()[-2000:],
            error_class="user-error",
            fix="cd app && npx playwright install chromium, then re-run",
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


def run_with_retry(fn, log: RunLog | None, label: str):
    """Run fn(); on a transient failure, retry once, then raise.

    The failure-classification table: transient = retry once, then the
    caller records it (batch) or fails loud (single render). Every other
    class raises immediately.
    """
    last = None
    for attempt_no in (1, 2):
        try:
            return fn()
        except BaseException as exc:
            error_class, _fix = classify_failure(exc)
            last = exc
            if error_class == "transient" and attempt_no == 1:
                if log is not None:
                    log.emit(
                        "retry", stream="stderr",
                        human=f"  [studio] {label}: transient failure, retrying once",
                        label=label, error=str(exc)[:300])
                continue
            raise
    raise last  # pragma: no cover - the loop always returns or raises


def resolve_audio_input(audio_arg, log: RunLog | None) -> tuple[Path | None, dict | None]:
    """Validate --audio up front so a bad sidecar is classified *before* the
    render, not discovered mid-batch.

    Returns (path-or-None, manifest input entry). A missing or malformed
    sidecar is degradable: warn loudly, render without audio, record it.
    This is the Python-side mirror of the Phase B precedent — the .mjs
    loader stays the authority at render time and still warns + no-ops.
    """
    if not audio_arg:
        return None, None
    audio = Path(audio_arg)
    entry = pin_input(audio)
    if not audio.is_file():
        msg = f"[studio] --audio not found: {audio} — rendering without audio"
        if log is not None:
            log.emit("audio_degraded", human=f"  {msg}", stream="stderr",
                     path=str(audio), reason="not found")
        else:
            print(f"  {msg}", file=sys.stderr)
        entry["status"] = "degradable: not found"
        return None, entry
    ok, note = validate_audio_sidecar(audio)
    entry["status"] = "ok" if ok else f"degradable: {note}"
    if not ok:
        msg = (f"[studio] --audio sidecar unusable ({note}) — "
               f"rendering without audio")
        if log is not None:
            log.emit("audio_degraded", human=f"  {msg}", stream="stderr",
                     path=str(audio), reason=note)
        else:
            print(f"  {msg}", file=sys.stderr)
        return None, entry
    return audio, entry


def require_project(project_arg) -> Path:
    """Fail fast on a missing project, with how to fix it (user-error)."""
    project = Path(project_arg)
    if not project.is_file():
        raise UserError(
            f"project not found: {project}",
            "in the app: OUTPUT → save project, then pass that file path.")
    return project


def manifest_paths_for(out: Path) -> tuple[Path, Path]:
    """Where a single still's manifest + JSONL log live: next to the PNG."""
    stem = out.with_suffix("")  # keep e.g. "trails" from "trails.png"
    return stem.with_name(stem.name + ".manifest.json"), \
        stem.with_name(stem.name + ".run.jsonl")


def cmd_render(a) -> None:
    size = parse_res(a.res)
    out = Path(a.out)
    run_id = new_run_id()
    manifest_path, jsonl_path = manifest_paths_for(out)
    log = RunLog(run_id, jsonl_path)
    git, device = git_info(), detect_device()
    project = require_project(a.project)
    inputs = {"project": pin_input(project), "audio": None}

    if getattr(a, "accum", False):
        cmd_accum(a, size, out, log=log, run_id=run_id, git=git,
                  device=device, inputs=inputs)
        return

    log.emit("run_start",
             human=f"[studio] run {run_id}: still {size[0]}x{size[1]} → {out}",
             kind="render", size=list(size), seed=a.seed,
             uncapped=bool(a.uncapped))
    manifest = start_manifest(
        run_id=run_id, kind="render", command=sys.argv,
        flags=flags_to_json(a), inputs=inputs,
        render={"kind": "render", "renderer": "gpu-readback",
                "size": list(size), "uncapped": bool(a.uncapped),
                "background": a.background, "accum": None},
        git=git, device=device)

    import time as _time
    t0 = _time.monotonic()
    error = None
    try:
        # #191: FINAL stills come from the GPU readback path (exportStill.mjs).
        # The render.mjs + resvg stills path is retired for final output.
        run_with_retry(
            lambda: render_gpu(project, out, size, seed=a.seed,
                               uncapped=a.uncapped, background=a.background),
            log, label="render")
    except BaseException as exc:
        error_class, fix = classify_failure(exc)
        error = error_record(exc, error_class, fix)
        raise
    finally:
        duration_s = _time.monotonic() - t0
        output = ({"file": out.name, "sha256": content_hash(out)}
                  if out.is_file() else None)
        sidecar_path = None
        if a.sidecar and error is None:
            out.with_suffix(".json").write_text(
                json.dumps(sidecar(project, a.seed, size, a.uncapped), indent=2))
            sidecar_path = out.with_suffix(".json").name
        manifest["editions"].append(edition_record(
            path=out.stem, seed=a.seed or 0,
            input_hash=edition_hash(project, a.seed or 0, size, a.uncapped,
                                    normalized_project(project)),
            status="ok" if error is None else "failed",
            duration_s=duration_s, device=device, git_sha=git["sha"],
            output=output, sidecar=sidecar_path, error=error))
        write_manifest(finish_manifest(
            manifest, run_status="ok" if error is None else "aborted",
            run_error=error), manifest_path)
        log.emit("run_end", ok=error is None,
                 human=(f"[studio] run {run_id}: done in {duration_s:.1f}s"
                        if error is None else
                        f"[studio] run {run_id}: FAILED ({error['class']})"))
        log.close()

    print(out)


def build_accum_cmd(a, size, out: Path, project: Path, audio: Path | None) -> list[str]:
    """The shared ACCUM node invocation, factored so `verify` can replay it."""
    steps = max(2, int(a.steps))
    fade = project_fade(project, a.fade)
    optics = project_optics(project, a.optics)
    tunnel = project_tunnel(project, a.tunnel)
    prism = project_prism(project, a.prism)
    flow = clamp_accum01(a.flow) if a.flow is not None else 0.0
    echoes = max(0, min(4, int(a.echoes))) if a.echoes is not None else 0
    cmd = [
        "node", str(ACCUM_STILL_MJS), str(project),
        "--out", str(out),
        "--steps", str(steps),
        "--fade", repr(fade),
        "--optics", repr(optics),
        "--tunnel", repr(tunnel),
        "--prism", repr(prism),
        "--flow", repr(flow),
        "--echoes", str(echoes),
        "--res", f"{size[0]}x{size[1]}",
    ]
    if audio is not None:
        cmd += ["--audio", str(audio)]
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
    return cmd, {"steps": steps, "fade": fade, "optics": optics,
                 "tunnel": tunnel, "prism": prism, "flow": flow,
                 "echoes": echoes, "motion": a.motion,
                 "ramps": list(a.ramp or [])}


def run_accum_cmd(cmd: list[str], project: Path) -> None:
    """Execute the ACCUM node command. Raises a classified RenderError."""
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=RENDER_TIMEOUT_S)
    except subprocess.TimeoutExpired as exc:
        # transient: the caller retries once, then records it.
        raise RenderError(
            f"accumStill.mjs exceeded {RENDER_TIMEOUT_S}s for {project}",
            error_class="transient") from exc
    err = proc.stderr.decode("utf-8", "replace") if proc.stderr else ""
    if err:
        sys.stderr.write(err)
        sys.stderr.flush()
    if proc.returncode == 3:
        raise RenderError(
            "refusing --accum: the shared GPU recipe needs headless Chromium",
            returncode=3, stderr=err.strip()[-2000:],
            error_class="user-error",
            fix="cd app && npx playwright install chromium, then re-run",
        )
    if proc.returncode != 0:
        raise RenderError(
            f"accumStill.mjs exited {proc.returncode} for {project}",
            returncode=proc.returncode,
            stderr=err.strip()[-2000:],
        )


def cmd_accum(a, size, out: Path, *, log: RunLog | None = None,
              run_id: str | None = None, git: dict | None = None,
              device: dict | None = None, inputs: dict | None = None) -> None:
    """Trail still via the SHARED ACCUM recipe (#190, #169).

    The feedback loop (fade, blur-over-time, bloom, halation) lives in
    app/src/gl/accum.mjs and runs on the GPU in headless Chromium. studio.py
    must not reimplement it: per #169's rule the export shares the recipe or
    refuses. The old ffmpeg colorchannelmixer composite was a second recipe
    and is gone.
    """
    project = require_project(a.project)
    run_id = run_id or new_run_id()
    log = log or RunLog(run_id)
    git = git or git_info()
    device = device or detect_device()
    inputs = inputs if inputs is not None else {"project": pin_input(project),
                                                "audio": None}
    manifest_path, _ = manifest_paths_for(out)

    audio, audio_entry = resolve_audio_input(getattr(a, "audio", None), log)
    inputs["audio"] = audio_entry

    cmd, accum_params = build_accum_cmd(a, size, out, project, audio)
    log.emit("run_start",
             human=f"[studio] run {run_id}: accum still {size[0]}x{size[1]} → {out}",
             kind="render", renderer="accum", size=list(size), seed=a.seed,
             steps=accum_params["steps"])
    manifest = start_manifest(
        run_id=run_id, kind="render", command=sys.argv,
        flags=flags_to_json(a), inputs=inputs,
        render={"kind": "render", "renderer": "accum",
                "size": list(size), "uncapped": bool(a.uncapped),
                "background": a.background, "accum": accum_params},
        git=git, device=device)

    import time as _time
    t0 = _time.monotonic()
    error = None
    try:
        run_with_retry(lambda: run_accum_cmd(cmd, project), log,
                       label="accum render")
    except BaseException as exc:
        error_class, fix = classify_failure(exc)
        error = error_record(exc, error_class, fix)
        raise
    finally:
        duration_s = _time.monotonic() - t0
        output = ({"file": out.name, "sha256": content_hash(out)}
                  if out.is_file() else None)
        sidecar_path = None
        if a.sidecar and error is None:
            out.with_suffix(".json").write_text(json.dumps(sidecar(
                project, a.seed, size, a.uncapped,
                extra={"accum": True, **accum_params,
                       "renderer": "app/src/gl (WebGL2) shared ACCUM recipe"},
            ), indent=2))
            sidecar_path = out.with_suffix(".json").name
        manifest["editions"].append(edition_record(
            path=out.stem, seed=a.seed or 0,
            input_hash=edition_hash(project, a.seed or 0, size, a.uncapped,
                                    normalized_project(project)),
            status="ok" if error is None else "failed",
            duration_s=duration_s, device=device, git_sha=git["sha"],
            output=output, sidecar=sidecar_path, error=error))
        write_manifest(finish_manifest(
            manifest, run_status="ok" if error is None else "aborted",
            run_error=error), manifest_path)
        log.emit("run_end", ok=error is None,
                 human=(f"[studio] run {run_id}: done in {duration_s:.1f}s"
                        if error is None else
                        f"[studio] run {run_id}: FAILED ({error['class']})"))
        log.close()

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
    project = require_project(a.project)
    seeds = [(a.start_seed + i) & 0xFFFFFFFF for i in range(a.count)]
    width = len(str(a.count))

    run_id = new_run_id()
    log = RunLog(run_id, outdir / f"run-{run_id}.jsonl")
    git, device = git_info(), detect_device()
    jobs = safe_jobs(a.jobs, size, log)
    # Once for the whole batch: normalization is a function of the project.
    normalized = normalized_project(project)
    inputs = {"project": pin_input(project), "audio": None}

    log.emit("run_start",
             human=(f"[studio] run {run_id}: batch {len(seeds)} editions, "
                    f"{size[0]}x{size[1]} → {outdir}"),
             kind="batch", count=len(seeds), size=list(size), jobs=jobs,
             uncapped=bool(a.uncapped))
    manifest = start_manifest(
        run_id=run_id, kind="batch", command=sys.argv,
        flags=flags_to_json(a), inputs=inputs,
        render={"kind": "batch", "renderer": "gpu-readback",
                "size": list(size), "uncapped": bool(a.uncapped),
                "background": a.background, "accum": None},
        git=git, device=device)

    manifest_path = outdir / "manifest.json"
    prior = {} if a.force else read_manifest(manifest_path)

    if not seeds:
        # Degenerate but legal: an empty batch still gets its manifest.
        write_manifest(finish_manifest(manifest), manifest_path)
        log.emit("run_end", ok=True,
                 human=f"[studio] run {run_id}: 0 editions")
        log.close()
        print(outdir)
        return

    import time as _time

    def attempt(i, seed):
        """Render one edition (with one retry on transient failure).

        Returns an edition manifest record. A user-error is re-raised so
        the caller can fail the whole batch fast; everything else is
        recorded per edition and the batch continues (#106).
        """
        t0 = _time.monotonic()
        stem = under(outdir, f"{i:0{width}d}-{seed:08x}")
        digest = edition_hash(project, seed, size, a.uncapped, normalized)

        # Resume: skip only when the PNG is still on disk AND was produced
        # from these exact inputs. A half-finished batch is the common case
        # for 4K work, and re-rendering 400 good frames to get the last 100
        # is the expensive kind of correct.
        if not a.force:
            was = prior.get(stem.name)
            if (was and was.get("status") == "ok" and was.get("hash") == digest
                    and stem.with_suffix(".png").is_file()):
                log.emit("edition_done", edition=stem.name, status="skipped",
                         seed=int(seed) & 0xFFFFFFFF)
                prev_out = was.get("output")
                return edition_record(
                    path=stem.name, seed=seed, input_hash=digest,
                    status="skipped", duration_s=0.0, device=device,
                    git_sha=was.get("git_sha", git["sha"]),
                    output=prev_out, sidecar=stem.with_suffix(".json").name,
                    error=None)

        png = stem.with_suffix(".png")
        error = None
        try:
            # #191: each edition renders through the shared GPU path — same
            # path per seed, no live store, no resvg.
            run_with_retry(
                lambda: render_gpu(project, png, size, seed=seed,
                                   uncapped=a.uncapped,
                                   background=a.background),
                log, label=stem.name)
        except BaseException as exc:
            error_class, fix = classify_failure(exc)
            if error_class == "user-error":
                # Fail fast: a bad environment or bad input fails every
                # edition the same way. Say how to fix it, stop the batch.
                raise
            # A batch is a long unattended job. Losing 499 good editions
            # because one seed hit a bad code path is the worst outcome, so
            # record the failure in the sidecar and keep going (#106).
            error = error_record(exc, error_class, fix)
            doc = {
                "ok": False,
                "seed": int(seed) & 0xFFFFFFFF,
                "error": error,
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
            if png.exists():
                png.unlink()
        else:
            doc = sidecar(project, seed, size, a.uncapped,
                          normalized=normalized)
            doc["ok"] = True
            doc["hash"] = digest
            stem.with_suffix(".json").write_text(json.dumps(doc, indent=2))

        duration_s = _time.monotonic() - t0
        output = ({"file": png.name, "sha256": content_hash(png)}
                  if png.is_file() else None)
        status = "ok" if error is None else "failed"
        log.emit("edition_done" if error is None else "edition_failed",
                 edition=stem.name, status=status,
                 seed=int(seed) & 0xFFFFFFFF, duration_s=round(duration_s, 3),
                 error_class=error["class"] if error else None)
        return edition_record(
            path=stem.name, seed=seed, input_hash=digest, status=status,
            duration_s=duration_s, device=device, git_sha=git["sha"],
            output=output, sidecar=stem.with_suffix(".json").name,
            error=error)

    done = 0
    failed = []
    skipped = 0
    editions = []
    run_error = None

    def collect(rec):
        editions.append(rec)
        return rec

    try:
        # Preflight: the first edition runs in the main thread. A user-error
        # (missing Chromium, bad project) aborts the batch before the pool
        # starts — fail fast, say how to fix it.
        first = attempt(0, seeds[0])
        collect(first)
        done = 1
        if first["status"] == "skipped":
            skipped = 1
        elif first["status"] == "failed":
            failed.append(first["path"])
        if done % 25 == 0 or done == len(seeds):
            log.emit("progress",
                     human=(f"  {done}/{len(seeds)}"
                            + (f" ({skipped} skipped)" if skipped else "")
                            + (f" ({len(failed)} failed)" if failed else "")),
                     done=done, total=len(seeds), skipped=skipped,
                     failed=len(failed))
        with ThreadPoolExecutor(max_workers=jobs) as pool:
            for rec in pool.map(attempt, range(1, len(seeds)), seeds[1:]):
                collect(rec)
                done += 1
                if rec["status"] == "failed":
                    failed.append(rec["path"])
                if rec["status"] == "skipped":
                    skipped += 1
                if done % 25 == 0 or done == len(seeds):
                    log.emit("progress",
                             human=(f"  {done}/{len(seeds)}"
                                    + (f" ({skipped} skipped)" if skipped else "")
                                    + (f" ({len(failed)} failed)" if failed else "")),
                             done=done, total=len(seeds), skipped=skipped,
                             failed=len(failed))
    except UserError as exc:
        # Fail fast, with the fix, after writing what we have to the manifest.
        run_error = error_record(exc, "user-error", exc.fix)
        log.emit("run_aborted", stream="stderr",
                 human=(f"  [studio] batch aborted: {exc}\n"
                        f"  fix: {exc.fix}"),
                 error=str(exc)[:500])
    finally:
        manifest["editions"] = sorted(editions, key=lambda e: e["path"])
        write_manifest(finish_manifest(
            manifest,
            run_status="aborted" if run_error else "ok",
            run_error=run_error), manifest_path)
        log.emit("run_end", ok=run_error is None,
                 human=(f"[studio] run {run_id}: {done} editions, "
                        f"{len(failed)} failed"
                        if run_error is None else
                        f"[studio] run {run_id}: aborted (user-error)"))
        log.close()

    if run_error:
        print(f"studio: {run_error['message']}\nfix: {run_error['fix']}",
              file=sys.stderr)
        sys.exit(2)

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
    project = require_project(a.project)
    frames_n = max(1, round(a.duration * a.fps))
    keep = Path(a.frames) if a.frames else None
    tmp = Path(tempfile.mkdtemp(prefix="kc-frames-")) if keep is None else keep
    tmp.mkdir(parents=True, exist_ok=True)

    run_id = new_run_id()
    log = RunLog(run_id, tmp / f"run-{run_id}.jsonl")
    git, device = git_info(), detect_device()
    jobs = safe_jobs(a.jobs, size, log)
    inputs = {"project": pin_input(project), "audio": None}
    log.emit("run_start",
             human=(f"[studio] run {run_id}: video {frames_n} frames, "
                    f"{size[0]}x{size[1]} → {a.out}"),
             kind="video", frames=frames_n, size=list(size), jobs=jobs,
             fps=a.fps, duration=a.duration)
    manifest = start_manifest(
        run_id=run_id, kind="video", command=sys.argv,
        flags=flags_to_json(a), inputs=inputs,
        render={"kind": "video", "renderer": "gpu-readback",
                "size": list(size), "uncapped": bool(a.uncapped),
                "background": a.background, "accum": None,
                "fps": a.fps, "duration": a.duration, "crf": a.crf},
        git=git, device=device)

    import time as _time
    t0 = _time.monotonic()
    error = None
    try:
        def one(i):
            t = i / a.fps
            # #191: frames come from the GPU readback path (same recipe as
            # stills); ffmpeg still assembles the clip — file-delivery post only.
            run_with_retry(
                lambda: render_gpu(project, under(tmp, f"f{i:06d}.png"),
                                   size, seed=a.seed,
                                   uncapped=a.uncapped,
                                   background=a.background, time=t,
                                   progress=i / max(1, frames_n - 1),
                                   ramps=a.ramp, motion=a.motion),
                log, label=f"frame {i}")

        with ThreadPoolExecutor(max_workers=jobs) as pool:
            for i, _ in enumerate(pool.map(one, range(frames_n)), 1):
                if i % 10 == 0 or i == frames_n:
                    log.emit("progress", human=f"  frame {i}/{frames_n}",
                             frame=i, frames=frames_n)

        which("ffmpeg")
        subprocess.run([
            "ffmpeg", "-y", "-framerate", str(a.fps), "-i", str(tmp / "f%06d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(a.crf),
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", str(a.out),
        ], check=True, timeout=FFMPEG_TIMEOUT_S)
    except BaseException as exc:
        error_class, fix = classify_failure(exc)
        error = error_record(exc, error_class, fix)
        raise
    finally:
        duration_s = _time.monotonic() - t0
        out = Path(a.out)
        manifest["editions"].append(edition_record(
            path="video", seed=a.seed or 0, input_hash="n/a",
            status="ok" if error is None else "failed",
            duration_s=duration_s, device=device, git_sha=git["sha"],
            output=({"file": out.name, "sha256": content_hash(out)}
                    if out.is_file() else None),
            sidecar=None, error=error))
        write_manifest(finish_manifest(
            manifest, run_status="ok" if error is None else "aborted",
            run_error=error), tmp / "manifest.json")
        log.emit("run_end", ok=error is None,
                 human=(f"[studio] run {run_id}: done in {duration_s:.1f}s"
                        if error is None else
                        f"[studio] run {run_id}: FAILED ({error['class']})"))
        log.close()

    if keep is None:
        shutil.rmtree(tmp, ignore_errors=True)
    print(a.out)


def cmd_verify(a) -> None:
    """Re-render from a run manifest v2 and compare output hashes.

    Proves byte-identical output: same project + same seed + same code =
    same PNG, demonstrated by re-running rather than asserted. The honest
    limitation, documented in docs/RUN_MANIFEST.md: different GPUs/drivers
    can legitimately differ by a pixel or two (that is what the parity
    tolerance is for), and audio-reactive renders are only deterministic
    given the recorded envelope — which is why the manifest pins the audio
    sidecar's hash.
    """
    doc = read_manifest_v2(a.manifest)
    manifest_path = Path(a.manifest)
    run_id = new_run_id()
    log = RunLog(run_id, manifest_path.parent / f"verify-{run_id}.jsonl")
    device = detect_device()
    log.emit("verify_start", kind=doc["kind"],
             human=(f"[studio] verify {run_id}: replaying {doc['run_id']} "
                    f"({doc['kind']}, {len(doc['editions'])} editions)"))

    # ── pin the inputs: replay proves nothing if they changed ──
    inputs = doc.get("inputs") or {}
    proj_in = inputs.get("project") or {}
    project_arg = a.project or proj_in.get("path")
    project = Path(project_arg) if project_arg else None
    if project is None or not project.is_file():
        raise UserError(
            f"verify: project file not found: {project_arg}",
            "restore the original project file, or pass --project with a "
            "copy — its content hash must match the manifest's pinned hash.")
    if proj_in.get("sha256") and content_hash(project) != proj_in["sha256"]:
        raise UserError(
            f"verify: project {project} changed since run {doc['run_id']} "
            f"(content hash differs from the manifest).",
            "replay can only prove determinism from the exact inputs — "
            "restore the original file, or pass --project with a copy whose "
            "hash matches.")
    log.emit("input_pinned", human=f"  project pinned: {project.name}",
             path=str(project), sha256=proj_in.get("sha256"))

    audio = None
    audio_in = inputs.get("audio") or {}
    if audio_in.get("path"):
        ap = Path(audio_in["path"])
        status = audio_in.get("status") or "ok"
        if status == "ok":
            if not ap.is_file() or (audio_in.get("sha256") and
                                    content_hash(ap) != audio_in["sha256"]):
                raise UserError(
                    f"verify: audio sidecar {ap} changed or is missing since "
                    f"run {doc['run_id']}.",
                    "audio-reactive renders are only deterministic given the "
                    "recorded envelope — restore the sidecar whose hash the "
                    "manifest pins.")
            audio = ap
            log.emit("input_pinned", human=f"  audio sidecar pinned: {ap.name}",
                     path=str(ap), sha256=audio_in.get("sha256"))
        else:
            # The original run degraded (warned, rendered without audio).
            # Reproduce the degradation so the replay is comparable.
            ok, note = validate_audio_sidecar(ap)
            if ok:
                log.emit("warn", stream="stderr",
                         human=(f"  [studio] WARNING: the original run rendered "
                                f"WITHOUT audio ({status}), but {ap.name} now "
                                f"validates — the replay includes audio and "
                                f"may legitimately differ."),
                         path=str(ap))
                audio = ap
            else:
                log.emit("audio_degraded",
                         human=(f"  [studio] replaying the original run's "
                                f"degradation: no audio ({status})"),
                         path=str(ap))

    # ── honest device note ──
    orig_gpu = (doc.get("device") or {}).get("gpu", "unknown")
    if orig_gpu != device.get("gpu"):
        log.emit("warn", stream="stderr",
                 human=(f"  [studio] WARNING: original run used "
                        f"'{orig_gpu}', this machine reports "
                        f"'{device.get('gpu')}' — pixel-level drift across "
                        f"GPUs/drivers is expected; the parity tolerance "
                        f"(docs/RUN_MANIFEST.md) is the right comparison."),
                 original_gpu=orig_gpu, current_gpu=device.get("gpu"))
    orig_sha = (doc.get("git") or {}).get("sha", "unknown")
    cur_sha = git_info().get("sha", "unknown")
    if orig_sha != cur_sha:
        log.emit("warn", stream="stderr",
                 human=(f"  [studio] WARNING: original run was code {orig_sha}, "
                        f"this replay is {cur_sha} — byte-identity is proven "
                        f"against current code, not the original."),
                 original_sha=orig_sha, current_sha=cur_sha)

    render = doc.get("render") or {}
    size = tuple(render.get("size") or [1000, 700])
    uncapped = bool(render.get("uncapped"))
    background = render.get("background")
    renderer = render.get("renderer", "gpu-readback")
    normalized = normalized_project(project)

    tmp = Path(tempfile.mkdtemp(prefix="kc-verify-"))
    results = []
    mismatched = []
    import time as _time
    try:
        for e in doc["editions"]:
            if e.get("status") != "ok":
                results.append({"path": e["path"], "status": "not-replayed",
                                "reason": f"original status was {e.get('status')}"})
                log.emit("verify_edition", edition=e["path"],
                         status="not-replayed")
                continue
            seed = e.get("seed", 0)
            t0 = _time.monotonic()
            try:
                if renderer == "accum":
                    # Replay the recorded ACCUM recipe exactly.
                    ns = dict(vars(a))
                    ap_ = render.get("accum") or {}
                    ns.update({
                        "project": str(project), "seed": seed,
                        "uncapped": uncapped, "background": background,
                        "steps": ap_.get("steps", 24),
                        "fade": ap_.get("fade"), "optics": ap_.get("optics"),
                        "tunnel": ap_.get("tunnel"),
                        "prism": ap_.get("prism"),
                        "flow": ap_.get("flow"), "echoes": ap_.get("echoes"),
                        "motion": ap_.get("motion", "auto"),
                        "ramp": ap_.get("ramps", []),
                        "audio": str(audio) if audio else None,
                        "sidecar": False,
                    })
                    fake = argparse.Namespace(**ns)
                    cmd, _params = build_accum_cmd(fake, size,
                                                   tmp / f"{e['path']}.png",
                                                   project, audio)
                    run_with_retry(lambda: run_accum_cmd(cmd, project), log,
                                   label=f"verify {e['path']}")
                else:
                    run_with_retry(
                        lambda: render_gpu(project, tmp / f"{e['path']}.png",
                                           size, seed=seed, uncapped=uncapped,
                                           background=background),
                        log, label=f"verify {e['path']}")
            except BaseException as exc:
                error_class, fix = classify_failure(exc)
                results.append({"path": e["path"], "status": "replay-failed",
                                "error": error_record(exc, error_class, fix)})
                log.emit("verify_edition", edition=e["path"],
                         status="replay-failed", error_class=error_class,
                         human=f"  {e['path']}.png: REPLAY FAILED ({error_class})",
                         stream="stderr")
                continue
            duration_s = _time.monotonic() - t0
            got = content_hash(tmp / f"{e['path']}.png")
            want = (e.get("output") or {}).get("sha256")
            match = want is not None and got == want
            results.append({"path": e["path"], "status": "match" if match else "mismatch",
                            "expected_sha256": want, "actual_sha256": got,
                            "duration_s": round(duration_s, 3)})
            if not match:
                mismatched.append(e["path"])
            log.emit("verify_edition", edition=e["path"],
                     status="match" if match else "mismatch",
                     human=(f"  {e['path']}.png: "
                            f"{'match' if match else 'MISMATCH'}"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    report_path = manifest_path.with_name(
        manifest_path.stem + ".verify.json")
    report = {
        "verify_run_id": run_id,
        "manifest": str(manifest_path),
        "original_run_id": doc["run_id"],
        "original_git_sha": orig_sha,
        "replay_git_sha": cur_sha,
        "original_device": doc.get("device"),
        "replay_device": device,
        "editions": results,
        "matched": sum(1 for r in results if r["status"] == "match"),
        "mismatched": mismatched,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n",
                           encoding="utf-8")
    log.emit("verify_end", matched=report["matched"],
             mismatched=len(mismatched),
             human=(f"[studio] verify {run_id}: {report['matched']}/"
                    f"{len(results)} editions byte-identical "
                    f"(report: {report_path.name})"))
    log.close()

    print(report_path)
    if mismatched:
        print(f"  {len(mismatched)} edition(s) differ from the manifest:",
              file=sys.stderr)
        for name in mismatched[:20]:
            print(f"    {name}", file=sys.stderr)
        print("  Byte-identity failed. If the GPU or driver differs from the "
              "original run, pixel-level drift is the expected cause — see "
              "docs/RUN_MANIFEST.md.", file=sys.stderr)
        sys.exit(1)



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
    sp.add_argument("--flow", type=float, default=None,
                    help="ACCUM flow-advected feedback 0..1 (Phase B2: trails curl like smoke; 0 = off)")
    sp.add_argument("--echoes", type=int, default=None,
                    help="ACCUM echo taps 0..4 (Phase B3: discrete afterimages; capped at >=2K widths)")
    sp.add_argument("--audio", default=None,
                    help="audio envelope JSON for --accum (Phase B1: kc-audio-envelope/1 sidecar; modulates keep/optics/tunnel/prism)")
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

    sp = sub.add_parser("verify", help="re-render from a run manifest v2 and prove byte-identical output")
    sp.add_argument("manifest", help="manifest.json written by a batch/render run")
    sp.add_argument("--project", default=None,
                    help="override the recorded project path (content hash must still match the manifest)")
    sp.set_defaults(func=cmd_verify)

    a = p.parse_args(argv)
    try:
        a.func(a)
    except UserError as exc:
        # Fail fast, with the fix. user-error is the only class that
        # carries how-to-fix guidance, and it always does.
        print(f"studio: {exc}", file=sys.stderr)
        if exc.fix:
            print(f"fix: {exc.fix}", file=sys.stderr)
        sys.exit(2)
    except RenderError as exc:
        # Single-shot commands still fail fast and quietly - a traceback here
        # would bury the actual render.mjs error that was already printed to
        # stderr. cmd_batch handles its own failures per edition instead.
        # The classified failure (and its fix, for user-error) is already in
        # the run manifest; surface the class here too.
        error_class, fix = classify_failure(exc)
        print(f"studio [{error_class}]: {exc}", file=sys.stderr)
        if fix:
            print(f"fix: {fix}", file=sys.stderr)
        sys.exit(exc.returncode or 1)


if __name__ == "__main__":
    main()
