"""Derive one LOIS state from an honest journal. No aesthetic judgment.

Mirrors the tunables in app/src/curator/loisActivity.js. Does not import the
app. CRIT stays parked (#954). STUCK is the honest 'nothing is landing'
signal the telemetry audit refused to dress up as a critique.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Same numbers as loisActivity.js — the TUI does not invent a second clock.
AWAY_MS = 5 * 60 * 1000
BURN_MS = 15 * 60 * 1000
VIBE_DWELL_MS = 8000
ROLL_KEEP_WINDOW_MS = 5 * 60 * 1000
UNDO_BURST_WINDOW_MS = 10 * 1000

# Surfaces only. "Within seconds" — the issue's worked example is 9s.
GOLD_WITHIN_MS = 12_000
CALC_HOLD_MS = 1500
KILL_HOLD_MS = 8000
NOD_HOLD_MS = 8000
GOLD_HOLD_MS = 8000
STUCK_ROLLS = 8
UNDO_BURST = 3

RUPTURE = frozenset({"fault", "clear", "layer_remove"})
CLOSES_LOOK = frozenset({"activity", "roll", "curate", "favorite", "export", "recall", "param", "undo", "fault", "clear", "layer_remove"})


@dataclass
class Keep:
    ts: int
    seed: str | int | None
    palette_id: str | None
    ms_since_seed: int | None = None
    kind: str = "favorite"  # favorite | export | recall


@dataclass
class Reading:
    state: str
    sentence: str
    keep: Keep | None
    idle_ms: int
    evidence: dict = field(default_factory=dict)


def _count_since(times: list[int], window: int, now: int) -> int:
    n = 0
    for ts in reversed(times):
        if now - ts > window:
            break
        n += 1
    return n


def _ago(ms: int) -> str:
    if ms < 0:
        ms = 0
    if ms < 1000:
        return f"{ms} ms"
    sec = ms // 1000
    if sec < 60:
        return f"{sec} second" if sec == 1 else f"{sec} seconds"
    minutes = sec // 60
    return f"{minutes} minute" if minutes == 1 else f"{minutes} minutes"


def _seed(value) -> str:
    if value is None:
        return "—"
    return str(value)


def _ordered(events: list[dict], now: int) -> list[tuple[int, dict]]:
    rows = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        ts = int(ev.get("t", ev.get("ts", 0)))
        if ts > now:
            continue
        rows.append((ts, ev))
    rows.sort(key=lambda row: row[0])
    return rows


def fold(events: list[dict], now: int) -> dict:
    """Fold a timestamped event list into the counters the states read.

    Events are sorted first, so an out-of-order journal still counts.
    A dwell or a return closes when a later action lands. Leftover flags
    are not a current look.
    """
    last_activity = None
    rolls: list[int] = []
    keeps: list[int] = []
    undos: list[int] = []
    last_param = None
    last_rupture = None  # (ts, type)
    last_favorite: Keep | None = None
    last_export: Keep | None = None
    last_recall: Keep | None = None
    dwell_ms = 0
    dwell_seed = None
    dwell_open = False
    returned = False
    curate_at = None
    seed_set_at = None
    current_seed = None

    for ts, ev in _ordered(events, now):
        kind = ev.get("type")
        if kind in CLOSES_LOOK:
            last_activity = ts
            dwell_open = False
            dwell_ms = 0
            returned = False
        if kind == "activity":
            pass
        elif kind in ("roll", "curate"):
            rolls.append(ts)
            if kind == "curate":
                curate_at = ts
        elif kind == "favorite":
            keeps.append(ts)
            mss = ev.get("msSinceSeed")
            if mss is None and seed_set_at is not None:
                mss = ts - seed_set_at
            last_favorite = Keep(ts, ev.get("seed", current_seed), ev.get("paletteId"), mss, "favorite")
        elif kind == "export":
            last_export = Keep(ts, ev.get("seed", current_seed), ev.get("paletteId"), None, "export")
        elif kind == "recall":
            last_recall = Keep(ts, ev.get("seed", current_seed), ev.get("paletteId"), None, "recall")
        elif kind == "param":
            last_param = ts
        elif kind == "undo":
            undos.append(ts)
        elif kind in RUPTURE:
            last_rupture = (ts, kind)
        elif kind == "dwell":
            dwell_ms = int(ev.get("ms") or 0)
            dwell_seed = ev.get("seed", current_seed)
            dwell_open = True
            returned = False
        elif kind == "seed":
            new_seed = ev.get("seed")
            if current_seed is not None and new_seed == current_seed:
                returned = True
                dwell_seed = new_seed
            else:
                returned = False
                dwell_open = False
                dwell_ms = 0
            current_seed = new_seed
            seed_set_at = ts
        elif kind == "return_seed":
            returned = True
            dwell_seed = ev.get("seed", current_seed)
            dwell_open = False
            dwell_ms = 0

    idle = now - last_activity if last_activity is not None else now
    # An explicit idle stamp wins — tests and a paused journal can say the truth.
    for ev in events:
        if isinstance(ev, dict) and ev.get("type") == "idle" and int(ev.get("t", 0)) <= now:
            idle = int(ev.get("ms") or 0)

    if not dwell_open:
        dwell_ms = 0
    chip_opts = [k for k in (last_favorite, last_export) if k is not None]
    chip = max(chip_opts, key=lambda k: k.ts) if chip_opts else None
    return {
        "idle_ms": idle,
        "rolls": _count_since(rolls, ROLL_KEEP_WINDOW_MS, now),
        "keeps": _count_since(keeps, ROLL_KEEP_WINDOW_MS, now),
        "undos": _count_since(undos, UNDO_BURST_WINDOW_MS, now),
        "last_param": last_param,
        "last_rupture": last_rupture,
        "last_favorite": last_favorite,
        "last_export": last_export,
        "last_recall": last_recall,
        "dwell_ms": dwell_ms,
        "dwell_seed": dwell_seed,
        "returned": returned,
        "curate_at": curate_at,
        "chip": chip,
        "has_activity": last_activity is not None,
    }


def _gold_sentence(fav: Keep | None, exp: Keep | None, rec: Keep | None, now: int) -> tuple[str, Keep] | None:
    """Ranked honest triggers. Never 'the app decided this is great.'"""
    candidates: list[tuple[int, str, Keep]] = []
    if exp is not None and now - exp.ts <= GOLD_HOLD_MS:
        candidates.append((exp.ts, f"Exported seed {_seed(exp.seed)}. You took it with you.", exp))
    if rec is not None and now - rec.ts <= GOLD_HOLD_MS:
        candidates.append((rec.ts, f"Recalled seed {_seed(rec.seed)}. You came back to it.", rec))
    if fav is not None and fav.ms_since_seed is not None and fav.ms_since_seed <= GOLD_WITHIN_MS:
        if now - fav.ts <= GOLD_HOLD_MS:
            sec = max(1, fav.ms_since_seed // 1000)
            word = "second" if sec == 1 else "seconds"
            candidates.append(
                (
                    fav.ts,
                    f"Favorited {sec} {word} after the render. That's conviction.",
                    fav,
                )
            )
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0], reverse=True)
    return candidates[0][1], candidates[0][2]


def derive(events: list[dict], now: int, *, returned_after_ms: int | None = None) -> Reading:
    f = fold(events, now)
    chip: Keep | None = f["chip"]
    idle = f["idle_ms"]

    def done(state: str, sentence: str, evidence: dict | None = None) -> Reading:
        return Reading(state, sentence, chip, idle, evidence or {})

    # Absence overrides. Do not notify, do not starve him.
    if f["has_activity"] and idle >= BURN_MS:
        return done("BURN", f"You've been gone {_ago(idle)}. He's at the window.")
    if f["has_activity"] and idle >= AWAY_MS:
        return done("AWAY", f"You've been gone {_ago(idle)}. He's out of the room.")

    rupture = f["last_rupture"]
    if rupture and now - rupture[0] <= KILL_HOLD_MS:
        kind = {"fault": "Render fault", "clear": "Confirmed clear", "layer_remove": "Layer removed"}[rupture[1]]
        if chip is None:
            return done("KILL", f"{kind}. The idea is dead.")
        return done("KILL", f"{kind}. The idea is dead. The chip still has the recipe.")

    gold = _gold_sentence(f["last_favorite"], f["last_export"], f["last_recall"], now)
    if gold:
        return done("GOLD", gold[0])

    fav: Keep | None = f["last_favorite"]
    if fav and now - fav.ts <= NOD_HOLD_MS:
        if fav.ms_since_seed is None:
            timing = "The date on that keep is unknown, so no conviction timing."
        else:
            timing = f"That was {_ago(fav.ms_since_seed)} after the render."
        return done("NOD", f"Favorited seed {_seed(fav.seed)}. {timing}")

    if f["rolls"] >= STUCK_ROLLS and f["keeps"] == 0:
        return done("STUCK", f"{f['rolls']} rolls, 0 keeps. Move one knob.")
    if f["undos"] >= UNDO_BURST:
        return done("STUCK", f"{f['undos']} undos in 10 seconds. Nothing is landing.")

    if f["last_param"] is not None and now - f["last_param"] <= CALC_HOLD_MS:
        return done("CALC", f"Param moved {_ago(now - f['last_param'])} ago. He's running the math.")

    if f["dwell_ms"] >= VIBE_DWELL_MS:
        return done(
            "VIBE",
            f"On seed {_seed(f['dwell_seed'])} for {_ago(f['dwell_ms'])}. No action yet.",
        )
    if f["returned"]:
        return done("VIBE", f"Back on seed {_seed(f['dwell_seed'])}. Looking, not acting.")

    # Return beat only if nothing stronger matched. Face is presence, not AWAY.
    if returned_after_ms and returned_after_ms >= AWAY_MS:
        if chip is None:
            return done("LEAN", f"You were gone {_ago(returned_after_ms)}. No keep on the chip.")
        return done("LEAN", f"You were gone {_ago(returned_after_ms)}. The chip still has the last keep.")

    if f["curate_at"] is not None:
        return done("LEAN", f"Curation surface. {f['rolls']} rolls this window. He's sizing the wall.")

    if not f["has_activity"]:
        return done("AWAY", "No session on the journal. He's out of the room.")

    return done("LEAN", f"Present. {f['rolls']} rolls, {f['keeps']} keeps this window.")
