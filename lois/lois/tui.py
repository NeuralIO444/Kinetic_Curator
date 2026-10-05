"""Four fixed rows. Face, code, evidence, last-keep chip. #956."""

from __future__ import annotations

from pathlib import Path

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import Footer, Label, Static

from .derive import Reading, derive
from .faces import FRAME_MS, GUIDE, face_for, frames_between
from .palette import CREAM, DIM, INK, MUSTARD, SIGNAL_RED


def chip_line(reading: Reading, now: int) -> str:
    keep = reading.keep
    if keep is None:
        return "last keep   —   no recipe on the chip"
    ago_ms = max(0, now - keep.ts)
    sec = ago_ms // 1000
    if sec < 60:
        ago = f"{sec}s ago"
    else:
        ago = f"{sec // 60}m ago"
    palette = keep.palette_id or "—"
    return f"last keep   seed {keep.seed}   {palette}   {ago}    c copies"


def recipe(reading: Reading) -> str:
    keep = reading.keep
    if keep is None:
        return ""
    return f"seed {keep.seed}  palette {keep.palette_id or '—'}"


class GuideScreen(ModalScreen):
    BINDINGS = [Binding("question_mark", "close", "Close"), Binding("escape", "close", "Close")]

    def compose(self) -> ComposeResult:
        lines = ["LOIS — field guide to the creature", ""]
        for code, line in GUIDE:
            from .faces import FACES

            lines.append(f"{FACES[code]}  {code:<6} {line}")
        lines.append("")
        lines.append("The face is the appraisal. The sentence is the evidence.")
        lines.append("CRIT is parked. He will not invent a taste.")
        yield Static("\n".join(lines), id="guide")

    def action_close(self) -> None:
        self.dismiss()


class LoisApp(App):
    """Affective mirror. Nothing reflows."""

    CSS = f"""
    Screen {{ background: {INK}; }}
    #rows {{ width: 100%; height: 100%; padding: 1 2; }}
    #face {{ height: 3; content-align: center middle; text-style: bold; color: {CREAM}; }}
    #code {{ height: 1; content-align: center middle; text-style: bold; color: {CREAM}; }}
    #sentence {{ height: 2; content-align: center middle; color: {CREAM}; }}
    #chip {{ height: 1; content-align: center middle; color: {MUSTARD}; }}
    #face.dim, #code.dim, #sentence.dim {{ color: {DIM}; }}
    #face.cream, #code.cream {{ color: {CREAM}; }}
    #face.mustard, #code.mustard {{ color: {MUSTARD}; }}
    #face.red, #code.red {{ color: {SIGNAL_RED}; }}
    GuideScreen {{ background: {INK}; }}
    #guide {{ color: {CREAM}; padding: 1 2; }}
    """

    BINDINGS = [
        Binding("question_mark", "guide", "Field guide"),
        Binding("c", "copy", "Copy chip"),
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self, events: list[dict] | None = None, *, journal: Path | None = None, returned_after_ms: int | None = None, pace: float = 1.0, live: bool = False):
        super().__init__()
        self.events = list(events or [])
        self.journal = journal
        self.returned_after_ms = returned_after_ms
        self.live = live
        self._mtime = None
        times = [int(e.get("t", 0)) for e in self.events if isinstance(e, dict)]
        self.start = min(times) if times else 0
        self.end = max(times) if times else 0
        self.now = self.end if live else self.start
        self.pace = pace  # demo only: journal-ms per real second
        self._state: str | None = None
        self._frames: list[str] = []
        self._frame_i = 0

    def compose(self) -> ComposeResult:
        with Vertical(id="rows"):
            yield Label("[ ・ _ ・ ]", id="face")
            yield Label("AWAY", id="code")
            yield Label("No session yet.", id="sentence")
            yield Label("last keep   —", id="chip")
        yield Footer()

    def on_mount(self) -> None:
        if self.live:
            self._reload()
            self.set_interval(0.5, self._reload)
            return
        self._paint(derive(self.events, self.now, returned_after_ms=self.returned_after_ms))
        if self.end > self.start:
            self.set_interval(0.25, self._tick)

    def _reload(self) -> None:
        from .journal import load

        if self.journal is None or not self.journal.exists():
            self._paint(derive([], 0))
            return
        mtime = self.journal.stat().st_mtime_ns
        if mtime == self._mtime and self.events:
            return
        self._mtime = mtime
        journal = load(self.journal)
        self.events = journal["events"]
        self.returned_after_ms = journal.get("returnedAfterMs")
        times = [int(e.get("t", 0)) for e in self.events if isinstance(e, dict)]
        self.now = max(times) if times else 0
        self._paint(derive(self.events, self.now, returned_after_ms=self.returned_after_ms))

    def _tick(self) -> None:
        if self.now >= self.end:
            return
        self.now = min(self.end, self.now + int(250 * self.pace))
        self._paint(derive(self.events, self.now, returned_after_ms=self.returned_after_ms))

    def _paint(self, reading: Reading) -> None:
        face = self.query_one("#face", Label)
        code = self.query_one("#code", Label)
        sentence = self.query_one("#sentence", Label)
        chip = self.query_one("#chip", Label)
        style = {
            "AWAY": "dim",
            "BURN": "dim",
            "NOD": "mustard",
            "GOLD": "mustard",
            "KILL": "red",
        }.get(reading.state, "cream")
        for widget in (face, code, sentence):
            widget.set_classes(style)
        code.update(reading.state)
        sentence.update(reading.sentence)
        chip.update(chip_line(reading, self.now))
        if reading.state != self._state:
            self._frames = list(frames_between(self._state, reading.state)) + [face_for(reading.state)]
            self._frame_i = 0
            self._state = reading.state
            self._step_frame()
        elif not self._frames:
            face.update(face_for(reading.state))

    def _step_frame(self) -> None:
        face = self.query_one("#face", Label)
        if self._frame_i >= len(self._frames):
            return
        face.update(self._frames[self._frame_i])
        self._frame_i += 1
        if self._frame_i < len(self._frames):
            self.set_timer(FRAME_MS / 1000, self._step_frame)

    def action_guide(self) -> None:
        self.push_screen(GuideScreen())

    def action_copy(self) -> None:
        reading = derive(self.events, self.now, returned_after_ms=self.returned_after_ms)
        text = recipe(reading)
        if not text:
            self.query_one("#chip", Label).update("last keep   —   nothing to copy")
            return
        self.copy_to_clipboard(text)
        self.query_one("#chip", Label).update(f"copied   {text}")
