"""Play, if it ships: recognition, not a ranking. #956.

Point him at a folder. He marks frames whose seed is already kept or
exported. He does not rank the rest — that waits on #954.
"""

from __future__ import annotations

import re
from pathlib import Path

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}
SEED_RE = re.compile(r"(?:^seed[-_ ]|\bseed[-_ ])?(\d+)$", re.IGNORECASE)


def seeds_from_journal(events: list[dict]) -> tuple[set[str], set[str]]:
    kept: set[str] = set()
    exported: set[str] = set()
    for ev in events:
        if not isinstance(ev, dict):
            continue
        seed = ev.get("seed")
        if seed is None:
            continue
        key = str(seed)
        if ev.get("type") == "favorite":
            kept.add(key)
        elif ev.get("type") == "export":
            exported.add(key)
    return kept, exported


def seed_in_name(name: str) -> str | None:
    """A seed token, or a stem that is only digits. `plate_99` is not a seed."""
    if name.isdigit():
        return name
    m = re.fullmatch(r"seed[-_ ](\d+)", name, re.IGNORECASE)
    return m.group(1) if m else None


def scan(folder: Path, events: list[dict]) -> list[dict]:
    kept, exported = seeds_from_journal(events)
    rows = []
    if not folder.is_dir():
        raise FileNotFoundError(folder)
    for path in sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXT):
        seed = seed_in_name(path.stem)
        mark = ""
        if seed and seed in exported:
            mark = "EXPORTED"
        elif seed and seed in kept:
            mark = "KEPT"
        rows.append({"file": path.name, "seed": seed, "mark": mark})
    return rows


def format_rows(rows: list[dict]) -> str:
    if not rows:
        return "No frames in that folder. Nothing to recognize."
    lines = ["file                          seed     mark", "—" * 48]
    for row in rows:
        mark = row["mark"] or "·"
        seed = row["seed"] or "—"
        lines.append(f"{row['file'][:28]:<28}  {seed:<7}  {mark}")
    recognized = sum(1 for r in rows if r["mark"])
    lines.append(f"{recognized} recognized, {len(rows) - recognized} unmarked. He does not rank the unmarked.")
    return "\n".join(lines)
