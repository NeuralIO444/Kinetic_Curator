# Phase 4 plan: influences (#1356, #1145, #1173)

**Status:** draft for Matt, 2026-10-13. Nothing here is decided until Matt answers the questions at the end.
**Roadmap:** [`ROADMAP_PETRI_DISH.md`](../ROADMAP_PETRI_DISH.md), Phase 4.
**Exit:** the same recorded session produces the same influences on replay. The deniability guard (#1188) stays green:
nothing of the Queen is rendered or named.

## What exists today (measured, 2026-10-13)

| Piece | State |
|---|---|
| The stress **band** (RELAX / NORMAL / TIGHTEN) | Computed and recorded in a take. **One consumer:** the formation rule's thresholds. Davis, LOIS and the Queen read nothing from it. |
| The **room** (LOIS state x Davis state, 20 rows) | Built (`directorsMatrix.js`), read-only. The Director scheduler (#1145) reads it and applies each room's gain row (`directorTable.js`) at pick time. Not logged as an event. |
| **Davis** (five states from the honest feed) | Built. His effect today is Curator candidate count and temperature through the room's gain row. He shifts nothing on a creature. |
| **LOIS** (NOD / VIBE / BURN / AWAY) | Built. His `lois_weight` blends his rank against Davis's pick. He does not tighten or loosen anything of a creature. |
| **Queen** (sway M1 to M5) | Built and gated open at 8 keeps: rank bias, temperature warming, palette drift, beat-sway, lean-in. Unsurfaced, one unnamed mark. Her inputs are keeps, not creatures. |
| **Parametric shifts** (Davis: scale, attachment angle, material bias) | **Do not exist for creatures.** Refine mutates Curator candidates (`refineMutate.js`), not a moth. |
| **Base types offered at a pinned head** | **There is one creature type** (the moth). Nothing is offered, so there is no order to bias. |
| Events `davis-shift`, `matrix-room` | Not logged. (`hierarchy-form` is.) |
| Dish pressure and taste pressure | Feed the stress value. They do not feed the room's Davis / LOIS states. |

So Phase 4 is smaller than the roadmap reads on one side (the persona machinery exists) and larger on the other
(creatures have no parameters for a persona to shift, and no second base type for the Queen to order).

## Steps (one PR each, proposed)

| # | Step | Visible? |
|---|---|---|
| 1 | **A moth has parameters.** The wing spread, wing size, body size and wing colour of a moth become a small recorded set, born with the moth at formation, replayable. Defaults are exactly today's moth. Not shifted by anyone yet. | No |
| 2 | **Davis shifts them** (`davis-shift`): small bounded shifts inside the moth, range width following the band and the room. Logged. | Yes: moths differ |
| 3 | **LOIS tightens or loosens** Davis's ranges by room, and ranks Curator suggestions by room. | Slightly |
| 4 | **The room reads the dish** (`matrix-room`): dish pressure and taste pressure feed the existing Davis and LOIS states, rooms unchanged. Logged. | Persona lines change |
| 5 | **The Queen warms** Davis's defaults toward the last N keeps (an in-session ring buffer), unsurfaced, behind the 8-keep gate. | Subtly |
| 6 | **Base types** (only if Matt wants them now): a second to fourth creature, and the Queen's order at a pinned head. | Yes |

## Decisions needed (Matt)

1. What may Davis shift on a moth? (shape only / shape and colour / more)
2. Do shifts happen once, at birth, or can a living moth be shifted again?
3. Build base types 2 to 4 now (step 6) or leave the Queen's ordering for later?
4. N for the Queen's recent-keeps buffer.
5. What the band does to the *size* of a shift: RELAX wider, TIGHTEN narrower (roadmap table), by how much.
