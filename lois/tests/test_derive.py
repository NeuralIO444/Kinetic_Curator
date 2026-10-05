"""Honest-feed checks. No Textual, no terminal. #956."""

from __future__ import annotations

import unittest

from lois.derive import AWAY_MS, BURN_MS, derive
from lois.journal import load
from lois.faces import frames_between
from lois.play import format_rows, scan, seed_in_name
from pathlib import Path
import tempfile


def ev(*items):
    return list(items)


class DeriveTests(unittest.TestCase):
    def test_empty_is_away(self):
        r = derive([], 0)
        self.assertEqual(r.state, "AWAY")
        self.assertIn("out of the room", r.sentence)

    def test_curate_is_lean_and_cites_rolls(self):
        r = derive(ev({"t": 0, "type": "curate"}, {"t": 10, "type": "roll"}), 20)
        self.assertEqual(r.state, "LEAN")
        self.assertIn("2 rolls", r.sentence)

    def test_fast_favorite_is_gold_with_the_seconds(self):
        r = derive(
            ev({"t": 0, "type": "seed", "seed": 1842}, {"t": 9000, "type": "favorite", "seed": 1842, "paletteId": "mustard", "msSinceSeed": 9000}),
            9000,
        )
        self.assertEqual(r.state, "GOLD")
        self.assertIn("9 seconds", r.sentence)
        self.assertIn("conviction", r.sentence)
        self.assertEqual(r.keep.seed, 1842)

    def test_slow_favorite_is_nod_not_gold(self):
        r = derive(
            ev({"t": 0, "type": "favorite", "seed": 3, "paletteId": "ink", "msSinceSeed": 40000}),
            1000,
        )
        self.assertEqual(r.state, "NOD")
        self.assertNotIn("conviction", r.sentence)
        self.assertIn("40 seconds", r.sentence)

    def test_legacy_favorite_does_not_invent_timing(self):
        r = derive(ev({"t": 0, "type": "favorite", "seed": 3, "paletteId": "ink"}), 1000)
        self.assertEqual(r.state, "NOD")
        self.assertIn("unknown", r.sentence)

    def test_export_is_gold(self):
        r = derive(ev({"t": 0, "type": "export", "seed": 9, "paletteId": "cream"}), 1000)
        self.assertEqual(r.state, "GOLD")
        self.assertIn("Exported", r.sentence)
        self.assertIn("took it with you", r.sentence)

    def test_recall_is_gold(self):
        r = derive(ev({"t": 0, "type": "recall", "seed": 9}), 1000)
        self.assertEqual(r.state, "GOLD")
        self.assertIn("came back", r.sentence)

    def test_param_is_calc_then_drops(self):
        events = ev({"t": 0, "type": "curate"}, {"t": 1000, "type": "param"})
        self.assertEqual(derive(events, 1500).state, "CALC")
        self.assertEqual(derive(events, 1000 + 1500 + 1).state, "LEAN")

    def test_stuck_rolls_cite_the_count(self):
        events = [{"t": i * 10, "type": "roll", "seed": i} for i in range(14)]
        r = derive(events, 200)
        self.assertEqual(r.state, "STUCK")
        self.assertIn("14 rolls, 0 keeps", r.sentence)
        self.assertNotIn("cautious", r.sentence.lower())



    def test_lean_curate_fixture_file(self):
        journal = load(Path(__file__).resolve().parents[1] / "fixtures" / "lean-curate.json")
        now = max(int(e["t"]) for e in journal["events"])
        r = derive(journal["events"], now)
        self.assertEqual(r.state, "LEAN")
        self.assertIn("2 rolls", r.sentence)
        self.assertIn("sizing the wall", r.sentence)
        self.assertIsNone(r.keep)

    def test_stuck_fixture_file(self):
        journal = load(Path(__file__).resolve().parents[1] / "fixtures" / "stuck-fourteen-rolls.json")
        now = max(int(e["t"]) for e in journal["events"])
        r = derive(journal["events"], now)
        self.assertEqual(r.state, "STUCK")
        self.assertIn("14 rolls, 0 keeps", r.sentence)
        self.assertIsNone(r.keep)

    def test_undo_burst_is_stuck_not_red_judgment(self):
        events = [{"t": 0, "type": "undo"}, {"t": 100, "type": "undo"}, {"t": 200, "type": "undo"}]
        r = derive(events, 300)
        self.assertEqual(r.state, "STUCK")
        self.assertIn("3 undos", r.sentence)

    def test_fault_is_kill_and_keeps_the_chip(self):
        events = ev(
            {"t": 0, "type": "favorite", "seed": 5, "paletteId": "ink", "msSinceSeed": 40000},
            {"t": 2000, "type": "fault"},
        )
        r = derive(events, 2500)
        self.assertEqual(r.state, "KILL")
        self.assertEqual(r.keep.seed, 5)
        self.assertIn("chip", r.sentence)

    def test_dwell_is_vibe_without_praise(self):
        r = derive(ev({"t": 0, "type": "dwell", "ms": 11000, "seed": 42}), 0)
        self.assertEqual(r.state, "VIBE")
        self.assertIn("11 seconds", r.sentence)
        self.assertNotIn("good", r.sentence.lower())

    def test_burn_and_away_cite_the_timer(self):
        events = ev({"t": 0, "type": "activity"})
        self.assertEqual(derive(events, AWAY_MS).state, "AWAY")
        self.assertIn("5 minutes", derive(events, AWAY_MS).sentence)
        self.assertEqual(derive(events, BURN_MS).state, "BURN")
        self.assertIn("15 minutes", derive(events, BURN_MS).sentence)

    def test_return_beat_cites_absence(self):
        r = derive(ev({"t": 0, "type": "activity"}), 1000, returned_after_ms=16 * 60 * 1000)
        self.assertEqual(r.state, "LEAN")
        self.assertIn("16 minutes", r.sentence)
        self.assertIn("chip", r.sentence)

    def test_kill_transition_is_three_jam_frames(self):
        frames = frames_between("LEAN", "KILL")
        self.assertEqual(len(frames), 3)
        self.assertIn("&", frames[0])

    def test_calc_transition(self):
        self.assertEqual(len(frames_between("LEAN", "CALC")), 3)

    def test_no_idle_loop_frames_when_state_holds(self):
        self.assertEqual(frames_between("GOLD", "GOLD"), ())


class PlayTests(unittest.TestCase):
    def test_recognition_does_not_rank(self):
        events = [
            {"t": 0, "type": "favorite", "seed": 1842},
            {"t": 1, "type": "export", "seed": 99},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "seed-1842.png").write_bytes(b"x")
            (root / "plate_99.webp").write_bytes(b"x")
            (root / "untitled.png").write_bytes(b"x")
            rows = scan(root, events)
        marks = {r["file"]: r["mark"] for r in rows}
        self.assertEqual(marks["seed-1842.png"], "KEPT")
        self.assertEqual(marks["plate_99.webp"], "EXPORTED")
        self.assertEqual(marks["untitled.png"], "")
        text = format_rows(rows)
        self.assertIn("does not rank", text)
        self.assertIsNone(seed_in_name("untitled"))


if __name__ == "__main__":
    unittest.main()
