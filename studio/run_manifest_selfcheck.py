#!/usr/bin/env python3
"""Selfcheck for studio/runlog.py + the studio.py manifest/verify wiring.

    python3 studio/run_manifest_selfcheck.py

Proves, without touching the GPU:
- the manifest v2 schema carries every field verify needs,
- inputs are pinned by content hash,
- the four failure classes classify as the table says,
- terminal lines stay human while the .jsonl underneath is parseable,
- a malformed audio sidecar validates as degradable (the Phase B precedent).

Then, if headless Chromium is available, it proves the real thing:
- a 2-edition batch writes a manifest v2,
- `studio.py verify` replays it and reports byte-identical hashes,
- a malformed --audio sidecar warns, renders anyway, and is recorded in
  the manifest as degradable.
"""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))

from runlog import (  # noqa: E402
    MANIFEST_VERSION,
    RenderError,
    RunLog,
    UserError,
    classify_failure,
    content_hash,
    detect_device,
    edition_record,
    error_record,
    finish_manifest,
    git_info,
    new_run_id,
    pin_input,
    read_manifest_v2,
    start_manifest,
    validate_audio_sidecar,
)

CASES = []


def case(fn):
    CASES.append(fn)
    return fn


@case
def manifest_schema():
    """The v2 schema carries every field verify() and traceability need."""
    git = {"sha": "abc1234", "dirty": False}
    device = {"os": "Linux", "machine": "x86_64", "cpu_count": 8,
              "gpu": "Test GPU"}
    m = start_manifest(
        run_id="20260917-000000-deadbe", kind="batch",
        command=["studio.py", "batch", "p.json", "-o", "out/", "--count", "2"],
        flags={"res": "100x70", "count": 2},
        inputs={"project": {"path": "p.json", "sha256": "00" * 32},
                "audio": None},
        render={"kind": "batch", "renderer": "gpu-readback",
                "size": [100, 70], "uncapped": False, "background": None,
                "accum": None},
        git=git, device=device)
    assert m["manifest_version"] == MANIFEST_VERSION == 2
    for key in ("run_id", "kind", "started_at", "git", "command", "flags",
                "inputs", "render", "device", "editions"):
        assert key in m, f"manifest missing {key}"
    e = edition_record(
        path="00-00000000", seed=0, input_hash="ab" * 8, status="ok",
        duration_s=1.234, device=device, git_sha="abc1234",
        output={"file": "00-00000000.png", "sha256": "cd" * 32},
        sidecar="00-00000000.json", error=None)
    for key in ("path", "seed", "hash", "input_hash", "status",
                "duration_s", "device", "git_sha", "output", "sidecar",
                "error"):
        assert key in e, f"edition missing {key}"
    assert e["hash"] == e["input_hash"], "v1 resume key must equal input_hash"
    m["editions"].append(e)
    m = finish_manifest(m)
    assert m["ended_at"] and m["run_status"] == "ok"
    assert m["summary"] == {"ok": 1, "failed": 0, "skipped": 0}
    assert git["sha"] and device["gpu"]


@case
def input_hash_pinning():
    """pin_input records the content hash; a one-byte change changes it."""
    with tempfile.TemporaryDirectory() as td:
        f = Path(td) / "project.json"
        f.write_text('{"seed": 1}')
        pinned = pin_input(f)
        assert pinned["sha256"] == hashlib.sha256(b'{"seed": 1}').hexdigest()
        assert pinned["sha256"] == content_hash(f)
        f.write_text('{"seed": 2}')
        assert pin_input(f)["sha256"] != pinned["sha256"], \
            "hash must pin content, not the path"
        missing = pin_input(Path(td) / "nope.json")
        assert missing["sha256"] is None


@case
def failure_classification():
    """The four classes classify exactly as the hardening table says."""
    # user-error: missing project, with how-to-fix guidance.
    cls, fix = classify_failure(UserError("project not found: x",
                                          "in the app: OUTPUT → save project"))
    assert cls == "user-error" and fix and "OUTPUT" in fix
    # user-error: missing Chromium (returncode 3) keeps its class + fix.
    cls, fix = classify_failure(RenderError("refusing: needs Chromium",
                                            returncode=3,
                                            error_class="user-error",
                                            fix="npx playwright install chromium"))
    assert cls == "user-error" and "playwright" in fix
    # transient: a render timeout — retry once, then record and continue.
    cls, fix = classify_failure(subprocess.TimeoutExpired("node", 300))
    assert cls == "transient" and fix is None
    # transient raised as RenderError keeps its class too.
    cls, _ = classify_failure(RenderError("timed out", error_class="transient"))
    assert cls == "transient"
    # degradable is assigned by the caller (audio), but the record shape
    # must carry the class through to the manifest.
    rec = error_record(ValueError("bad sidecar"), "degradable", None)
    assert rec["class"] == "degradable"
    # bug: unclassified renderer exit — fail loud, no fix invented.
    cls, fix = classify_failure(RenderError("exportStill.mjs exited 1",
                                            returncode=1,
                                            stderr="boom" * 1000))
    assert cls == "bug" and fix is None
    assert len(rec["message"]) > 0
    assert len(error_record(RuntimeError("x"), "bug")["stderr_tail"]) == 0
    long_err = RenderError("e", stderr="z" * 5000)
    assert len(error_record(long_err, "bug")["stderr_tail"]) == 2000, \
        "stderr is tail-truncated for the manifest"


@case
def audio_sidecar_validation():
    """Malformed audio sidecars are degradable, never fatal."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        ok, note = validate_audio_sidecar(td / "missing.json")
        assert not ok and note == "not found"
        bad = td / "bad.json"
        bad.write_text("{not json")
        ok, note = validate_audio_sidecar(bad)
        assert not ok and "JSON" in note
        empty = td / "empty.json"
        empty.write_text('{"schema": "kc-audio-envelope/1"}')
        ok, note = validate_audio_sidecar(empty)
        assert not ok and "frames" in note
        good = td / "good.json"
        good.write_text(json.dumps({
            "schema": "kc-audio-envelope/1",
            "frames": [{"t": 0.0, "rms": 0.5, "flux": 0.1,
                        "beat_phase": 0.0}],
            "beats": []}))
        ok, note = validate_audio_sidecar(good)
        assert ok and "1 frames" in note
        # legacy bare-array sketch is accepted, like the .mjs loader.
        legacy = td / "legacy.json"
        legacy.write_text('[{"t": 0, "rms": 0.2, "beat": 1}]')
        ok, _ = validate_audio_sidecar(legacy)
        assert ok


@case
def structured_log_format():
    """Terminal lines stay human; the .jsonl underneath is parseable."""
    with tempfile.TemporaryDirectory() as td:
        jp = Path(td) / "run.jsonl"
        run_id = new_run_id()
        assert run_id[:8].isdigit() and "-" in run_id
        log = RunLog(run_id, jp)
        log.emit("run_start", human="[studio] run x: batch 2 editions",
                 kind="batch", count=2)
        log.emit("edition_done", edition="00-00000000", status="ok",
                 seed=0, duration_s=1.5)
        log.close()
        events = [json.loads(line) for line in jp.read_text().splitlines()]
        assert [e["event"] for e in events] == ["run_start", "edition_done"]
        for e in events:
            assert e["run_id"] == run_id and "ts" in e
        assert events[1]["duration_s"] == 1.5


@case
def verify_rejects_non_v2():
    """verify refuses old/foreign manifests with how-to-fix guidance."""
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "manifest.json"
        p.write_text(json.dumps({"editions": []}))
        try:
            read_manifest_v2(p)
        except UserError as exc:
            assert "v2" in str(exc) and exc.fix and "re-render" in exc.fix
        else:
            raise AssertionError("non-v2 manifest must be rejected")
        try:
            read_manifest_v2(p.with_name("nope.json"))
        except UserError as exc:
            assert "not found" in str(exc) and exc.fix
        else:
            raise AssertionError("missing manifest must be rejected")


@case
def git_and_device_never_raise():
    """Best-effort environment probing must not break a run."""
    g = git_info()
    assert "sha" in g and "dirty" in g
    d = detect_device()
    assert "gpu" in d and "os" in d


# ── GPU round trip (skipped without headless Chromium) ────────────────────

FIXTURE_PROJECT = {
    "version": 1,
    "seed": 0x12345678,
    "paletteId": "praystation",
    "layoutParams": {"lifeDrift": 0},
    "enabledAssets": {},
    "quality": "balanced",
}


def chromium_available() -> bool:
    from pathlib import Path as _P
    cache = _P.home() / ".cache" / "ms-playwright"
    if not cache.is_dir():
        return False
    return any("chromium" in p.name for p in cache.iterdir())


def run_studio(*args) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(HERE / "studio.py"), *args],
        capture_output=True, text=True, timeout=600, cwd=str(REPO))


@case
def gpu_round_trip():
    """A real batch → manifest → verify round trip proves byte-identity."""
    if not chromium_available() or shutil.which("node") is None:
        print("  [skip] gpu_round_trip: no headless Chromium/node here")
        return
    with tempfile.TemporaryDirectory(prefix="kc-harden4-") as td:
        td = Path(td)
        proj = td / "fixture.project.json"
        proj.write_text(json.dumps(FIXTURE_PROJECT))
        outdir = td / "editions"

        r = run_studio("batch", str(proj), "-o", str(outdir),
                       "--count", "2", "--res", "100x70", "--jobs", "1")
        assert r.returncode == 0, f"batch failed:\n{r.stderr[-3000:]}"
        # terminal output still looks like the old print() lines
        assert "2/2" in r.stdout, r.stdout

        manifest_p = outdir / "manifest.json"
        assert manifest_p.is_file()
        doc = json.loads(manifest_p.read_text())
        assert doc["manifest_version"] == 2
        assert doc["run_status"] == "ok"
        assert doc["git"]["sha"] != "unknown"
        assert doc["inputs"]["project"]["sha256"] == content_hash(proj)
        assert doc["device"]["gpu"], "device must be recorded"
        assert len(doc["editions"]) == 2
        for e in doc["editions"]:
            assert e["status"] == "ok"
            assert e["output"] and len(e["output"]["sha256"]) == 64
            assert e["duration_s"] >= 0
            png = outdir / e["output"]["file"]
            assert png.is_file()
            assert content_hash(png) == e["output"]["sha256"]
        log_files = list(outdir.glob("run-*.jsonl"))
        assert log_files, "expected a JSONL event log in the outdir"
        events = [json.loads(l) for l in
                  log_files[0].read_text().splitlines()]
        assert events[0]["event"] == "run_start"
        assert events[-1]["event"] == "run_end"
        assert all(e["run_id"] == doc["run_id"] for e in events)

        v = run_studio("verify", str(manifest_p))
        assert v.returncode == 0, f"verify failed:\n{v.stdout}\n{v.stderr[-3000:]}"
        assert "byte-identical" in v.stdout, v.stdout
        report = json.loads(
            (manifest_p.with_name("manifest.verify.json")).read_text())
        assert report["matched"] == 2 and not report["mismatched"]


@case
def gpu_degraded_audio():
    """Malformed --audio warns, renders anyway, manifest says degradable."""
    if not chromium_available() or shutil.which("node") is None:
        print("  [skip] gpu_degraded_audio: no headless Chromium/node here")
        return
    with tempfile.TemporaryDirectory(prefix="kc-harden4-") as td:
        td = Path(td)
        proj = td / "fixture.project.json"
        proj.write_text(json.dumps(FIXTURE_PROJECT))
        bad_audio = td / "bad.audio.json"
        bad_audio.write_text("{not valid json")
        out = td / "trails.png"

        r = run_studio("render", str(proj), "-o", str(out),
                       "--res", "100x70", "--accum", "--steps", "4",
                       "--audio", str(bad_audio))
        assert r.returncode == 0, f"render failed:\n{r.stderr[-3000:]}"
        assert out.is_file(), "degraded render must still produce the PNG"
        assert "without audio" in r.stderr, \
            f"expected the loud warning on stderr:\n{r.stderr[-2000:]}"

        doc = json.loads((td / "trails.manifest.json").read_text())
        assert doc["manifest_version"] == 2
        audio_in = doc["inputs"]["audio"]
        assert audio_in["status"].startswith("degradable"), audio_in
        assert doc["editions"][0]["status"] == "ok"


def main() -> None:
    failures = 0
    for fn in CASES:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 — selfchecks fail loud
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
            import traceback
            traceback.print_exc()
        else:
            print(f"ok   {fn.__name__}")
    if failures:
        print(f"\n{failures} selfcheck(s) failed")
        sys.exit(1)
    print(f"\nall {len(CASES)} selfchecks passed")


if __name__ == "__main__":
    main()
