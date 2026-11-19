---
persona: governor
file: rulings
source: docs/design/persona-kernel-spec.md §4 (the Governor; Q2 pattern); docs/characters/governor.md (OPEN items are Matt's); #2383
checked: 2026-11-19
---

# David Bowie — rulings

## Matt's rulings touching this persona

- **The real date stands:** 8 January 1947 (Capricorn), following the Q2 pattern — the 1977
  "whimsical" date and the "not a real person" line are retired (spec §4).
- **Band seat (§3b):** the bandleader — counts in, calls endings, cuts a solo the room can't afford.
- **Open questions on file (not rulings):** his character file leaves four items OPEN for Matt —
  whether he is ever named in the UI, a face or mark, a line when he sheds or restores, and
  whether he signs the loot folder's cost report. The design position in the file is instruments
  only, no face, no line.

## Standing laws that touch every persona

- **Callsign law (P3, #2383):** surfaces show callsigns only. Real names live in the records and in
  this Archive as lineage — never on a surface, never in a line the audience reads.
- **Tuning law (spec §3c):** no persona number lives in code. Every knob sits in the one tuning
  table (`personas/tuning.json`, `kc-persona-tuning/1`); tuning changes how much, never what is allowed.
- **Archive law (spec §3, Q7):** the Archive is text only. No images of real works ship; reference
  plates stay in Matt's local Loot folder, read on-device only, never bundled.
