"""lois — terminal companion. Side-quest, not the instrument. #956."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .derive import derive
from .journal import demo_events, load
from .play import format_rows, scan


def _print_reading(events, now, returned_after_ms=None) -> None:
    reading = derive(events, now, returned_after_ms=returned_after_ms)
    from .faces import face_for

    print(face_for(reading.state))
    print(reading.state)
    print(reading.sentence)
    keep = reading.keep
    if keep is None:
        print("last keep   —")
    else:
        print(f"last keep   seed {keep.seed}   {keep.palette_id or '—'}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="lois", description="LOIS — affective mirror of the session.")
    sub = parser.add_subparsers(dest="cmd")

    watch = sub.add_parser("watch", help="Tail a journal. Reading is the latest event, not a replay.")
    watch.add_argument("journal", type=Path)

    demo = sub.add_parser("demo", help="Play the scripted session.")
    demo.add_argument("--pace", type=float, default=2000.0)

    play = sub.add_parser("play", help="Mark frames already kept or exported. Does not rank.")
    play.add_argument("folder", type=Path)
    play.add_argument("--journal", type=Path, required=True)

    once = sub.add_parser("read", help="Print the four rows for a journal at its last event. No TUI.")
    once.add_argument("journal", type=Path)

    args = parser.parse_args(argv)

    if args.cmd == "play":
        journal = load(args.journal)
        print(format_rows(scan(args.folder, journal["events"])))
        return 0

    if args.cmd == "read":
        journal = load(args.journal)
        events = journal["events"]
        now = max((int(e.get("t", 0)) for e in events), default=0)
        _print_reading(events, now, journal.get("returnedAfterMs"))
        return 0

    if args.cmd == "demo":
        from .tui import LoisApp

        LoisApp(demo_events(), pace=args.pace).run()
        return 0

    if args.cmd == "watch":
        from .tui import LoisApp

        LoisApp(journal=args.journal, live=True).run()
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
