#!/usr/bin/env python3
"""Structured logging + run manifests (v2) + failure classification for studio.

Every studio.py run gets a run id. Progress is recorded twice:

- a friendly human line on the terminal (the same lines the old print()
  output produced), and
- a JSON-lines event stream on disk (``run-<id>.jsonl``) that a script can
  query — every event carries a timestamp, the run id, the event name, and
  the relevant numbers.

A batch or still run also writes a **run manifest v2** (``manifest.json`` in
the output dir, or ``<stem>.manifest.json`` next to a single still): a
machine-readable record of exactly what ran — run id, start/end time, git
sha of the code, the exact command and flags, content hashes of every input
(project JSON, audio sidecar), and per-edition results (seed, duration,
GPU/device, output file hash, sidecar path). ``studio.py verify`` replays a
manifest and proves byte-identical output.

Failure classes (the hardening-plan table, enforced in code):

- ``user-error``: bad input or environment. Fail fast; the message says how
  to fix it.
- ``degradable``: the render can continue without the feature (the Phase B
  precedent: a malformed audio sidecar). Warn loudly, render without it,
  record it in the manifest.
- ``transient``: a hiccup that may pass on its own (a render timeout in a
  batch). Retry once, then record and continue.
- ``bug``: anything else — an invariant violated, a renderer exit nobody
  classified. Fail loud, with the manifest entry and diagnostics attached.
  Never swallowed.
"""
from __future__ import annotations

import datetime as _dt
import errno
import hashlib
import json
import os
import platform
import secrets
import subprocess
import sys
from pathlib import Path

MANIFEST_VERSION = 2
HERE = Path(__file__).resolve().parent
REPO = HERE.parent


# ── failure taxonomy ──────────────────────────────────────────────────────

class StudioError(Exception):
    """A studio failure with a class and (for user errors) a fix.

    error_class is one of "user-error", "degradable", "transient", "bug".
    fix is a plain-language "how to fix it", required for user-error.
    """

    def __init__(self, message: str, error_class: str, fix: str | None = None):
        super().__init__(message)
        self.error_class = error_class
        self.fix = fix


class UserError(StudioError):
    """Bad input or environment. Fail fast; say how to fix it."""

    def __init__(self, message: str, fix: str):
        super().__init__(message, "user-error", fix)


class RenderError(StudioError):
    """One edition failed to render. Carries enough to write a sidecar.

    The error class is attached by classify_failure(); constructed bare it
    defaults to "bug" so an unclassified renderer failure always fails loud.
    """

    def __init__(self, message, *, returncode=None, stderr="", error_class="bug", fix=None):
        super().__init__(message, error_class, fix)
        self.returncode = returncode
        self.stderr = stderr


def classify_failure(exc: BaseException) -> tuple[str, str | None]:
    """Map an exception to (error_class, fix). The fix is for user-error only.

    Rules:
    - UserError (missing project, bad flags, missing Chromium, changed
      inputs at verify time): user-error, with how-to-fix.
    - subprocess.TimeoutExpired: transient — the GPU hiccup class. Retry
      once, then record and continue.
    - OSError ENOSPC (disk full): user-error. Other OSErrors: bug.
    - RenderError already carrying a class (e.g. returncode 3 from a
      missing Chromium, raised as user-error): keep it.
    - Everything else: bug. Fail loud, never swallowed.
    """
    if isinstance(exc, StudioError):
        return exc.error_class, exc.fix
    if isinstance(exc, subprocess.TimeoutExpired):
        return "transient", None
    if isinstance(exc, FileNotFoundError):
        return "user-error", f"missing file: {exc.filename or exc}. Check the path and try again."
    if isinstance(exc, OSError):
        if exc.errno == errno.ENOSPC:
            return "user-error", "the disk is full — free some space and re-run (a batch resumes with --force off)."
        return "bug", None
    if isinstance(exc, (json.JSONDecodeError, ValueError)):
        # ValueError inside the studio pipeline (not input parsing, which
        # raises UserError) is renderer-internal — fail loud as a bug.
        return "bug", None
    return "bug", None


def error_record(exc: BaseException, error_class: str, fix: str | None = None) -> dict:
    """The manifest/sidecar shape for a failure. stderr is tail-truncated."""
    return {
        "class": error_class,
        "message": str(exc),
        "fix": fix,
        "stderr_tail": (getattr(exc, "stderr", "") or "")[-2000:],
    }


# ── run ids, time ─────────────────────────────────────────────────────────

def new_run_id() -> str:
    """Sortable, unique-ish: 20260917-095647-a1b2c3."""
    stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{stamp}-{secrets.token_hex(3)}"


def utc_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


# ── structured logging ────────────────────────────────────────────────────

class RunLog:
    """JSON-lines event log + friendly terminal lines.

    The terminal output keeps the same shape as the old print() lines — a
    human sees no difference — while every event is also appended to the
    .jsonl file as {"ts", "run_id", "event", ...fields}.
    """

    def __init__(self, run_id: str, jsonl_path: Path | None = None):
        self.run_id = run_id
        self.jsonl_path = Path(jsonl_path) if jsonl_path else None
        self._fh = None
        if self.jsonl_path:
            self.jsonl_path.parent.mkdir(parents=True, exist_ok=True)
            self._fh = self.jsonl_path.open("a", encoding="utf-8")

    def emit(self, event: str, human: str | None = None,
             stream: str = "stdout", **fields) -> None:
        record = {"ts": utc_now_iso(), "run_id": self.run_id,
                  "event": event, **fields}
        if self._fh:
            self._fh.write(json.dumps(record, default=str) + "\n")
            self._fh.flush()
        if human:
            out = sys.stderr if stream == "stderr" else sys.stdout
            out.write(human + ("" if human.endswith("\n") else "\n"))
            out.flush()

    def close(self) -> None:
        if self._fh:
            self._fh.close()
            self._fh = None


# ── input pinning ─────────────────────────────────────────────────────────

def content_hash(path: Path) -> str:
    """sha256 of the file bytes. The replay contract pins inputs by this."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pin_input(path: Path | None) -> dict | None:
    """The manifest shape for one input file: path + content hash."""
    if path is None:
        return None
    p = Path(path)
    entry = {"path": str(p)}
    entry["sha256"] = content_hash(p) if p.is_file() else None
    return entry


def git_info() -> dict:
    """Which code ran. Best-effort: 'unknown' outside a git checkout."""
    info = {"sha": "unknown", "dirty": None}
    try:
        sha = subprocess.run(
            ["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=10)
        if sha.returncode == 0 and sha.stdout.strip():
            info["sha"] = sha.stdout.strip()
            dirty = subprocess.run(
                ["git", "-C", str(REPO), "status", "--porcelain"],
                capture_output=True, text=True, timeout=10)
            if dirty.returncode == 0:
                info["dirty"] = bool(dirty.stdout.strip())
    except (subprocess.SubprocessError, OSError):
        pass
    return info


def detect_device() -> dict:
    """What hardware rendered. Best-effort; never raises.

    Recorded per run so `verify` can warn honestly when the replay happens
    on a different GPU — pixel-level drift across GPUs/drivers is the known
    honest limitation of byte-identity.
    """
    info = {
        "os": platform.system(),
        "machine": platform.machine(),
        "cpu_count": os.cpu_count(),
        "gpu": "unknown",
    }
    try:
        if sys.platform == "darwin":
            proc = subprocess.run(
                ["system_profiler", "SPDisplaysDataType", "-detailLevel", "mini"],
                capture_output=True, text=True, timeout=30)
            for line in proc.stdout.splitlines():
                line = line.strip()
                if line.startswith("Chipset Model:"):
                    info["gpu"] = line.split(":", 1)[1].strip()
                    break
        elif sys.platform.startswith("linux"):
            nvidia = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True, text=True, timeout=10)
            if nvidia.returncode == 0 and nvidia.stdout.strip():
                info["gpu"] = nvidia.stdout.strip().splitlines()[0]
            else:
                lspci = subprocess.run(
                    ["lspci"], capture_output=True, text=True, timeout=10)
                for line in lspci.stdout.splitlines():
                    if "VGA" in line or "3D controller" in line:
                        info["gpu"] = line.split(":", 2)[-1].strip()
                        break
    except (subprocess.SubprocessError, OSError):
        pass
    return info


# ── audio sidecar pre-validation (the degradable class) ───────────────────
# Mirrors the loader rules in app/src/gl/audioEnvelope.mjs. The .mjs stays
# the authority at render time (it warns and no-ops); this pre-check lets
# studio classify the failure *before* the batch and record it in the
# manifest. A sidecar that passes here but warns there is still caught —
# the renderer is the final word.

def validate_audio_sidecar(path: Path) -> tuple[bool, str]:
    """(ok, note). ok=False means: warn loudly, render without audio, record
    it as degradable. Never raises for bad content — bad content is the
    expected case this exists for."""
    p = Path(path)
    if not p.is_file():
        return False, "not found"
    try:
        doc = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return False, f"not valid JSON ({exc})"
    frames = None
    if isinstance(doc, dict):
        frames = doc.get("frames")
        if frames is None and isinstance(doc.get("envelope"), list):
            frames = doc.get("envelope")  # legacy sketch alias
    elif isinstance(doc, list):
        frames = doc  # legacy bare array
    if not isinstance(frames, list) or not frames:
        return False, "has no frames[] (schema kc-audio-envelope/1)"
    good = 0
    for f in frames[:50]:
        if isinstance(f, dict):
            try:
                t = float(f.get("t"))
            except (TypeError, ValueError):
                continue
            if t >= 0:
                good += 1
    if not good:
        return False, "frames have no usable t values"
    return True, f"{len(frames)} frames"


# ── manifest v2 ───────────────────────────────────────────────────────────

def flags_to_json(a) -> dict:
    """argparse namespace → JSON-safe dict (drops func, stringifies Paths)."""
    out = {}
    for k, v in vars(a).items():
        if k == "func":
            continue
        out[k] = str(v) if isinstance(v, Path) else v
    return json.loads(json.dumps(out, default=str))


def start_manifest(*, run_id: str, kind: str, command: list[str],
                   flags: dict, inputs: dict, render: dict,
                   git: dict, device: dict) -> dict:
    """The manifest skeleton, written at run start; finish_manifest() seals it."""
    return {
        "manifest_version": MANIFEST_VERSION,
        "run_id": run_id,
        "kind": kind,                      # "batch" | "render" | "video"
        "started_at": utc_now_iso(),
        "ended_at": None,
        "git": git,                        # {"sha", "dirty"} — which code ran
        "command": list(command),          # exact argv, for copy-paste replay
        "flags": flags,                    # parsed flags, JSON-safe
        "inputs": inputs,                  # {"project": {path, sha256}, "audio": {...}|None}
        "render": render,                  # renderer + shared render params
        "device": device,                  # OS/CPU/GPU that rendered
        "editions": [],
        "run_status": "running",
        "run_error": None,
        "summary": {"ok": 0, "failed": 0, "skipped": 0},
    }


def edition_record(*, path: str, seed: int, input_hash: str, status: str,
                   duration_s: float, device: dict, git_sha: str,
                   output: dict | None, sidecar: str | None,
                   error: dict | None) -> dict:
    """One edition's manifest entry.

    Keeps the v1 resume keys ("hash", "png") so old batches resume cleanly;
    v2 adds input_hash, durations, output hashes, device, and classified
    errors.
    """
    png_name = output["file"] if output else None
    return {
        "path": path,
        "seed": int(seed) & 0xFFFFFFFF,
        "hash": input_hash,                # v1 resume key (input identity)
        "input_hash": input_hash,
        "status": status,                  # ok | failed | skipped
        "duration_s": round(duration_s, 3),
        "device": device.get("gpu", "unknown"),
        "git_sha": git_sha,
        "output": output,                  # {"file", "sha256"} | None
        "png": png_name,                   # v1 resume key
        "sidecar": sidecar,
        "error": error,                    # classified failure | None
    }


def finish_manifest(manifest: dict, *, run_status: str = "ok",
                    run_error: dict | None = None) -> dict:
    manifest["ended_at"] = utc_now_iso()
    manifest["run_status"] = run_status
    manifest["run_error"] = run_error
    summary = {"ok": 0, "failed": 0, "skipped": 0}
    for e in manifest["editions"]:
        summary[e["status"]] = summary.get(e["status"], 0) + 1
    manifest["summary"] = summary
    return manifest


def write_manifest(manifest: dict, path: Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return path


def read_manifest_v2(path: Path) -> dict:
    """Load a manifest for verify. Rejects anything that isn't v2 with a
    user-error that says how to fix it."""
    p = Path(path)
    if not p.is_file():
        raise UserError(
            f"manifest not found: {p}",
            "pass the manifest.json written by a current studio.py batch/render run.")
    try:
        doc = json.loads(p.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise UserError(
            f"manifest is not valid JSON: {p} ({exc})",
            "the file may be truncated — re-run the batch to regenerate it.")
    if doc.get("manifest_version") != MANIFEST_VERSION:
        raise UserError(
            f"{p} is not a run-manifest v2 (found version {doc.get('manifest_version')}).",
            "verify needs the per-edition output hashes only v2 records — "
            "re-render with the current studio.py to get one.")
    if doc.get("kind") not in ("batch", "render"):
        raise UserError(
            f"verify doesn't support {doc.get('kind')} manifests yet.",
            "re-render the PNGs with batch/render, or hash the video frames by hand.")
    return doc
