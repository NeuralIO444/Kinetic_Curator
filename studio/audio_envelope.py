#!/usr/bin/env python3
"""
audio_envelope.py — offline audio envelope sidecar generator for ACCUM Phase B1.

Reads a music file and writes a `kc-audio-envelope/1` JSON sidecar that
`studio.py render --accum --audio <file>` consumes (stdlib json only —
studio.py gains no new dependency).

Install (Mac Studio)::
    brew install ffmpeg            # mp3/m4a decode fallback for audioread
    cd studio && pip install -e ".[audio]"

Usage::
    python3 studio/audio_envelope.py track.mp3 -o track.audio.json [--hop 512] [--sr 22050]

Analysis (librosa 1.0.0, pure-Python arm64 wheels):
  sr=22050 mono, n_fft=2048, hop_length=512 -> ~43.07 fps envelope grid.
  Per frame: rms (loudness), flux (spectral-flux transient novelty),
  tempo + beat frames (classical flux+autocorrelation+DP beat tracking).
  beat_phase 0..1 is derived between consecutive beats: a continuous
  "where in the beat" signal beats a binary flag for driving visuals.

Upgrade path: essentia (2.1b6+ now ships macosx_15_0_arm64 wheels, cp314-only
for now) can replace librosa's beat_track later and additionally fill
`downbeats` (librosa does not do downbeats). The sidecar schema already
reserves the field. See docs/ACCUM.md "Audio envelope sidecar".
"""

from __future__ import annotations

import argparse
import json
import math
import sys

SCHEMA = "kc-audio-envelope/1"


def build_envelope(*, source, sr, hop_length, duration, tempo_bpm, times, rms, flux, beats):
    """Assemble the sidecar dict from plain Python/numpy-convertible sequences.

    Pure (no librosa): normalises flux 0..1 by its peak, derives beat_phase
    0..1 between consecutive beat frames, and returns the serialisable dict.
    """
    times = [float(t) for t in times]
    rms = [min(1.0, max(0.0, float(v))) for v in rms]
    flux_raw = [max(0.0, float(v)) for v in flux]
    peak = max(flux_raw) if flux_raw else 0.0
    flux = [v / peak if peak > 0 else 0.0 for v in flux_raw]
    beats = sorted(float(b) for b in beats if math.isfinite(b) and b >= 0)

    frames = []
    for i, t in enumerate(times):
        phase = 0.0
        if beats:
            # Index of the beat interval containing t (0 before the first beat).
            lo, hi, idx = 0, len(beats) - 1, -1
            while lo <= hi:
                mid = (lo + hi) // 2
                if beats[mid] <= t:
                    idx, lo = mid, mid + 1
                else:
                    hi = mid - 1
            if idx >= 0 and idx + 1 < len(beats):
                span = beats[idx + 1] - beats[idx]
                phase = (t - beats[idx]) / span if span > 0 else 0.0
            elif idx == len(beats) - 1 and len(beats) >= 2:
                span = beats[-1] - beats[-2]
                phase = min(1.0, (t - beats[-1]) / span) if span > 0 else 0.0
            phase = min(1.0, max(0.0, phase))
        frames.append({
            "t": round(t, 4),
            "rms": round(rms[i] if i < len(rms) else 0.0, 4),
            "flux": round(flux[i] if i < len(flux) else 0.0, 4),
            "beat_phase": round(phase, 4),
        })

    return {
        "schema": SCHEMA,
        "source": source,
        "sr": sr,
        "hop_length": hop_length,
        "fps": round(sr / hop_length, 4),
        "duration": round(duration, 3),
        "tempo_bpm": round(tempo_bpm, 2),
        "frames": frames,
        "beats": [round(b, 3) for b in beats],
        "downbeats": [],  # reserved: librosa has no downbeat tracker; essentia does
    }


def analyze(src, *, sr=22050, hop=512):
    """Run librosa and return (duration, tempo_bpm, times, rms, flux, beats)."""
    try:
        import librosa
    except ImportError:
        sys.exit("librosa is required: pip install -e \".[audio]\" (in studio/)")
    y, _ = librosa.load(src, sr=sr, mono=True)
    duration = len(y) / sr
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    flux = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop)
    beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
    times = librosa.frames_to_time(
        range(len(rms)), sr=sr, hop_length=hop
    )
    tempo_bpm = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
    return duration, tempo_bpm, list(times), list(rms), list(flux), list(beats)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Write a kc-audio-envelope/1 sidecar for --accum --audio.")
    ap.add_argument("src", help="audio file (wav/aiff/flac natively; mp3/m4a via ffmpeg)")
    ap.add_argument("-o", "--out", required=True, help="output JSON path")
    ap.add_argument("--sr", type=int, default=22050)
    ap.add_argument("--hop", type=int, default=512)
    args = ap.parse_args(argv)

    duration, tempo_bpm, times, rms, flux, beats = analyze(args.src, sr=args.sr, hop=args.hop)
    env = build_envelope(
        source=args.src, sr=args.sr, hop_length=args.hop, duration=duration,
        tempo_bpm=tempo_bpm, times=times, rms=rms, flux=flux, beats=beats,
    )
    with open(args.out, "w") as f:
        json.dump(env, f)
    print(f"wrote {args.out}: {len(env['frames'])} frames, {len(env['beats'])} beats, {env['tempo_bpm']} bpm")


if __name__ == "__main__":
    main()
