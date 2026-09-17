# macOS audio envelope plan — ACCUM Phase B `--audio` sidecar

**Date:** 2026-09-17 · **Machine target:** Mac Studio (Apple Silicon) · **Purpose:** pick the current, non-crufty stack for generating the beat/RMS envelope sidecar that `studio.py --audio` consumes.

## Recommendation (TL;DR)

**Offline envelope generator: librosa 1.0.0 (pure Python, pip-installable on arm64 today).** Beat/RMS/flux extraction for a 4-minute track runs in seconds on a Mac Studio. Essentia is the documented upgrade path if librosa's beat tracking ever feels too loose. Everything below is verified against PyPI / Apple docs as of 2026-09-17.

## What I checked (current versions, 2026-09-17)

| Library | Version | arm64 macOS install | Verdict |
|---|---|---|---|
| **librosa** | **1.0.0** (released 2026-08-11) | ✅ `pip install librosa` — pure Python + numpy/scipy/numba/soundfile, all with arm64 wheels | **Use this** |
| **essentia** | 2.1b6.dev1438 (dev) | ✅ **Now ships `macosx_15_0_arm64` wheels** (new — the arm64 wheel PR finally landed). Caveat: macOS wheel is **cp314-only**; other Pythons must build from source | Upgrade path, not day one |
| **aubio** | 0.4.9 | ❌ PyPI ships **sdist only** — `pip install aubio` compiles from source on macOS. `brew install aubio` gets you the CLI tools easily, but not the Python bindings | Skip for now; CLI is a handy cross-check |
| **madmom** | 0.15-era | ❌ Cython build + ffmpeg wrangling on arm64; unmaintained-feeling | Skip — overkill and painful |
| **AudioKit** | 5.7.2 (there is **no v6**) | Swift-only, Xcode/SPM | Irrelevant to the Python pipeline |
| **Apple SoundAnalysis** | current | Native, but **classification only** (~300 sound classes) — it does not do beat/onset/tempo | Not for this job |
| **Apple AVAudioEngine + Accelerate/vDSP** | current | The native real-time stack (tap → raw PCM → vDSP FFT/RMS) | The right answer **for live later**, not for offline now |

Key corrections to common assumptions:
- Apple has **no first-party beat tracker**. SoundAnalysis classifies ("this is a drum"), it doesn't find the pulse. The current native pattern is `AVAudioEngine.installTap` + Accelerate (see e.g. `spfk-tempo`, a 2026 Swift package doing multi-band spectral flux + autocorellation on vDSP) — but that's for building a macOS app, not a Python sidecar generator.
- Beat-tracking SOTA in 2026 is neural (transformer models), but for *driving a feedback amount* classical DSP (spectral flux + autocorrelation tempogram + dynamic-programming beat tracking) is the right weight class. librosa's `beat_track` is exactly that lineage.
- aubio is lightweight and lovely, but sdist-only on PyPI makes it the wrong default for a "not very technical" one-command install.

## Offline pipeline (the immediate need)

**Script home:** `studio/audio_envelope.py` — new file, behind a new optional extra so `studio.py` itself stays stdlib-only (repo convention).

**Install (Mac Studio):**
```bash
brew install ffmpeg                      # mp3/m4a decode fallback for audioread
cd studio && pip install -e ".[audio]"
```
```toml
# pyproject.toml — new extra
audio = ["librosa>=1.0", "soundfile>=0.13", "numpy>=2"]
```
(`soundfile` reads wav/aiff/flac natively with arm64 wheels; anything else falls through to `audioread` → ffmpeg.)

**Analysis parameters:**
- `sr=22050` mono (librosa default; halves the work vs 44.1k, beat accuracy unaffected)
- `n_fft=2048`, `hop_length=512` → envelope frame rate **22050/512 ≈ 43.07 fps**
- Per frame: **rms** (`librosa.feature.rms`), **flux** (`librosa.onset.onset_strength`, spectral-flux novelty), **tempo** + **beat frames** (`librosa.beat.beat_track`)
- Derive **beat phase** 0→1 between consecutive beat frames (more useful for modulation than an impulse train — you can swell *on the one*); also keep raw beat times.

**CLI shape:**
```bash
python3 studio/audio_envelope.py track.mp3 -o track.audio.json [--hop 512] [--sr 22050]
```

**Sketch** (`studio/audio_envelope.py`):
```python
import json, sys
import numpy as np, librosa

def main(src, dst, sr=22050, hop=512):
    y, _ = librosa.load(src, sr=sr, mono=True)
    rms  = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    flux = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop)
    beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    # beat phase 0..1 between beats, flux normalized 0..1
    ...
    json.dump({...envelope...}, open(dst, "w"))

# studio.py --audio: stdlib json.load only, resample envelope to render
# frame times by linear interp. studio.py gains NO new dependency.
```

## Sidecar schema (proposed — for the Phase B builder to adopt)

`studio.py --audio track.audio.json` needs exactly this contract; everything else is informational.

```json
{
  "schema": "kc-audio-envelope/1",
  "source": "track.mp3",
  "sr": 22050, "hop_length": 512, "fps": 43.066,
  "duration": 237.4,
  "tempo_bpm": 128.04,
  "frames": [
    {"t": 0.0, "rms": 0.12, "flux": 0.05, "beat_phase": 0.0}
  ],
  "beats": [0.47, 0.94, 1.41],
  "downbeats": []
}
```

- `frames`: fixed-rate grid, `t` in seconds. `rms` 0..~1 (peak-normalized), `flux` 0..1 (normalized onset strength), `beat_phase` 0..1 within the beat interval (0 before first beat).
- `beats`: absolute beat times in seconds (from `beat_track`; empty if confidence is low).
- `downbeats`: reserved, empty for now (librosa doesn't do downbeats; essentia/madmom do — future).
- `studio.py` resamples by linear interpolation onto its own frame times; missing/malformed sidecar → envelope of zeros (real no-op, matching the repo's off-defaults rule).

Why not the tentative `{t, rms, beat}` flat array: `beat_phase` subsumes a beat flag and gives the renderer a continuous "where in the bar" signal; `flux` (transient novelty) is distinct from `rms` (loudness) and drives different gestures (hits vs swells).

## Live performance input (later, not now)

Two viable paths when Phase B goes live (post-#224):
1. **Python, fastest to prototype:** `sounddevice` (PortAudio, arm64 wheels on PyPI) callback → ring buffer → same numpy/librosa feature math per 512-sample hop. No new native code; ~12 ms hop latency at 22050. Recommended first.
2. **Native, if a real macOS app ever ships:** `AVAudioEngine.installTap` → Accelerate/vDSP for RMS/FFT, Swift beat logic (or port the flux+autocorrelation from the generator). More work, lower latency, App Store-shaped.

Avoid PyObjC bridges to AVAudioEngine — fragile, and unnecessary while the pipeline is Python.

## Avoid list

- `pip install aubio` on macOS (sdist-only; compile friction) — `brew install aubio` CLI only as a cross-check tool.
- madmom (install pain, unmaintained trajectory, overkill).
- AudioKit (Swift-only; no v6 exists; wrong layer for this pipeline).
- SoundAnalysis for tempo/beat (it classifies sounds, doesn't track rhythm).
- AUGraph / legacy AudioToolbox C APIs (long deprecated).
- Neural beat trackers (Beat-This!-class) — SOTA accuracy, but a heavyweight model to aim a feedback slider; revisit only if classical tracking audibly misses.
- Putting librosa into `studio.py`'s core deps — it belongs in an `audio` extra; the sidecar keeps the render path stdlib-only.

## Open questions for Matt / the Phase B builder

1. Schema above vs the builder's in-progress `{t, rms, beat}` sketch — adopt `beat_phase` + `flux`?
2. MP3/M4A sources are fine via ffmpeg, but should the generator *require* lossless for beat accuracy? (Practical answer: no, 320k MP3 tracks fine.)
3. Downbeats: worth pulling in essentia later for `downbeats`, or is beat phase enough for the visuals?
