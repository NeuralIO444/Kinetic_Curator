#!/usr/bin/env python3
# AUDIT (read-only) — fit per-presented-frame decay from the app-probe bursts.
# For every pixel: find bright runs (a mark sitting there), take the moment
# the mark leaves, and fit the brightness ratio per rAF frame over the
# following samples while the pixel stays in the mid-range and is not
# re-covered. Aggregate = median ratio across hundreds of independent
# vacated pixels. The off-control must read ~0 (method sensitivity check).
import json
import math
import statistics
import sys
from pathlib import Path

from PIL import Image

import os

SHOTS = Path(os.environ.get("KC_SHOTS", Path.home() / "workspace" / "kc-accum-audit2-shots"))


def load_series(state):
    meta = json.loads((SHOTS / f"app-{state}-meta.json").read_text())
    frames = []
    for m in meta["meta"]:
        if m.get("gap"):
            continue
        img = Image.open(SHOTS / f"app-{state}-{m['i']:02d}.png").convert("RGB")
        frames.append((m["raf"], img))
    return meta, frames


def luminance_series(frames):
    """Return (rafs, per-pixel list of luminance lists) on a subsampled grid."""
    w, h = frames[0][1].size
    step = 2
    xs = list(range(0, w, step))
    ys = list(range(0, h, step))
    rafs = [r for r, _ in frames]
    series = [[0.0] * len(frames) for _ in range(len(xs) * len(ys))]
    for k, (_, img) in enumerate(frames):
        px = img.load()
        idx = 0
        for y in ys:
            for x in xs:
                r, g, b = px[x, y]
                series[idx][k] = 0.2126 * r + 0.7152 * g + 0.0722 * b
                idx += 1
    return rafs, series


def fit_state(state, bright=165.0, hi=165.0, lo=28.0):
    meta, frames = load_series(state)
    rafs, series = luminance_series(frames)
    ratios = []
    post1 = []  # brightness fraction remaining ONE sample after vacating
    events = 0
    for s in series:
        k = 0
        n = len(s)
        while k < n:
            if s[k] > bright:
                # bright run: advance to its end (the vacating moment)
                j = k
                while j + 1 < n and s[j + 1] > bright * 0.82:
                    j += 1
                if j + 1 < n and s[j] > 0:
                    post1.append(s[j + 1] / s[j])
                # collect decay samples after j
                prev_v, prev_r = None, None
                m = j + 1
                while m < n:
                    v = s[m]
                    if v > hi:  # re-covered by another mark
                        break
                    if v < lo:  # reached the floor; one last ratio then stop
                        if prev_v is not None and prev_v > lo and rafs[m] > prev_r:
                            ratios.append((v / prev_v) ** (1.0 / (rafs[m] - prev_r)))
                        break
                    if prev_v is not None and rafs[m] > prev_r:
                        if v > prev_v * 1.06:  # brightened again: not a clean decay
                            break
                        ratios.append((v / prev_v) ** (1.0 / (rafs[m] - prev_r)))
                    prev_v, prev_r = v, rafs[m]
                    m += 1
                events += 1
                k = j + 1
            else:
                k += 1
    ratios = [r for r in ratios if 0.0 <= r <= 1.3]
    post1_med = round(statistics.median(post1), 4) if post1 else None
    if not ratios:
        return {"state": state, "events": events, "ratios": 0, "median_frac_remaining_1_sample_after_vacate": post1_med}
    ratios.sort()
    q = lambda p: ratios[min(len(ratios) - 1, int(p * len(ratios)))]
    med = statistics.median(ratios)
    hl = math.log(0.5) / math.log(med) if 0 < med < 1 else float("inf")
    return {
        "state": state,
        "events": events,
        "ratios": len(ratios),
        "median_frac_remaining_1_sample_after_vacate": post1_med,
        "median_keep_per_frame": round(med, 4),
        "p25": round(q(0.25), 4),
        "p75": round(q(0.75), 4),
        "implied_half_life_frames": round(hl, 1) if hl != float("inf") else "inf",
    }


if __name__ == "__main__":
    for state in sys.argv[1:]:
        print(json.dumps(fit_state(state)))
