"""Journal load / save. The handoff from the instrument, when one exists.

The app does not write this file (#956 does not touch instrument code).
A session can drop a journal here; `lois demo` writes a scripted one.
"""

from __future__ import annotations

import json
from pathlib import Path

VERSION = 1


def load(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("journal must be an object")
    events = data.get("events") or []
    if not isinstance(events, list):
        raise ValueError("journal.events must be a list")
    return {
        "version": data.get("version", VERSION),
        "events": events,
        "returnedAfterMs": data.get("returnedAfterMs"),
    }


def save(path: Path, events: list[dict], returned_after_ms: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": VERSION, "events": events}
    if returned_after_ms is not None:
        payload["returnedAfterMs"] = returned_after_ms
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def demo_events() -> list[dict]:
    """A scripted session. Times are ms from t=0. Every state has a real cause."""
    return [
        {"t": 0, "type": "curate"},
        {"t": 400, "type": "roll", "seed": 1842},
        {"t": 900, "type": "param"},
        {"t": 2800, "type": "dwell", "ms": 11000, "seed": 1842},
        {"t": 3000, "type": "seed", "seed": 1842},
        {"t": 3200, "type": "return_seed", "seed": 1842},
        {"t": 5000, "type": "favorite", "seed": 1842, "paletteId": "mustard", "msSinceSeed": 9000},
        {"t": 9000, "type": "export", "seed": 1842, "paletteId": "mustard"},
        {"t": 12000, "type": "undo"},
        {"t": 12500, "type": "undo"},
        {"t": 13000, "type": "undo"},
        {"t": 16000, "type": "roll", "seed": 7},
        {"t": 16500, "type": "roll", "seed": 8},
        {"t": 17000, "type": "roll", "seed": 9},
        {"t": 17500, "type": "roll", "seed": 10},
        {"t": 18000, "type": "roll", "seed": 11},
        {"t": 18500, "type": "roll", "seed": 12},
        {"t": 19000, "type": "roll", "seed": 13},
        {"t": 19500, "type": "roll", "seed": 14},
        {"t": 22000, "type": "fault"},
        {"t": 30000, "type": "activity"},
    ]
