"""Bracket-box faces and one-shot transitions. Animate, then hold. #956.

CRIT is parked behind #954 — the evisceration (VIBE → CRIT) is not in the
roster. Red is reserved for rupture (KILL). GOLD is mustard on ink: a
terminal cannot do foil.
"""

from __future__ import annotations

# Fixed-width bracket faces. The box is the creature.
FACES = {
    "AWAY": "[ ・ _ ・ ]",
    "LEAN": "[ ￣ ー ￣ ]",
    "VIBE": "[ ￣ ▽ ￣ ]",
    "NOD": "[ ¬ ‿ ¬ ]",
    "CALC": "[ ▀ _ ▀ ]",
    "KILL": "[ ━ _ ━ ]",
    "GOLD": "[ ✦ _ ✦ ]",
    "BURN": "[ ░ ▒ ▓ ]",
    "STUCK": "[ ￣ ＿ ￣ ]",
}

# Field guide — his voice, true triggers. CRIT is absent on purpose.
GUIDE = (
    ("AWAY", "No pointer, no key, for 5 minutes. He's out of the room."),
    ("LEAN", "You opened a curation surface. He's sizing the wall."),
    ("VIBE", "You lingered, or came back to the same seed. He does not call it good."),
    ("NOD", "You favorited it. Deliberate. That took courage."),
    ("CALC", "You moved a variable. He runs the math, then drops the squint."),
    ("STUCK", "Rolls without a keep, or an undo burst. Nothing is landing. Not a verdict on the picture."),
    ("KILL", "A fault, a confirmed clear, a layer removed. The chip still has the recipe."),
    ("GOLD", "A fast favorite, an export, or a later recall. Never 'the app decided this is great.'"),
    ("BURN", "Gone 15 minutes. The smoke is presentation. The timer is the fact."),
)

# Transition frames, then the destination face is held. No idle loop.
TRANSITIONS = {
    ("LEAN", "CALC"): ("[ ◯ _ ◯ ]", "[ ◒ _ ◒ ]", "[ ▬ _ ▬ ]"),
    ("CALC", "GOLD"): ("[ + _ + ]", "[ ✛ _ ✛ ]", "[ ✦ _ ✦ ]"),
    # The jam: three frames, then KILL holds. The mechanism choked.
    ("*", "KILL"): ("[ & _ % ]", "[ # _ @ ]", "[ § _ ¶ ]"),
}

FRAME_MS = 70  # ~14 fps, transition only


def face_for(state: str) -> str:
    return FACES.get(state, FACES["LEAN"])


def frames_between(prev: str | None, nxt: str) -> tuple[str, ...]:
    """In-between frames, not including the held destination face."""
    if not prev or prev == nxt:
        return ()
    specific = TRANSITIONS.get((prev, nxt))
    if specific:
        return specific
    if nxt == "KILL":
        return TRANSITIONS[("*", "KILL")]
    return ()
