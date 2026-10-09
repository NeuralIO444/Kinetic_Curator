# After kernel — director, sway, debt, weather

Status: research. Do not build ahead of the kernel batch (#1232–#1253).
Design only. Feel numbers are a draft for Matt.

## The system, short

Davis makes the picture. Lois says if it is any good. The Queen never shows up. She only leans the table toward things you already kept.

That lean is the sway. She does not pick the winner. With fewer than eight keeps, or while the #762 gate is closed, she does nothing in the live instrument. If a meter for her exists, it is broken (DS rule 10).

Hot room when Lois burns and Davis is flowing. Quiet room when Lois nods and Davis blooms. Middle everywhere else. Three burns in a row and the room owes quiet. Nods pay that off. A stall with no keep still opens the room.

## What already shipped

- Queen M1–M5 in `app/src/curator/queenLean.mjs` (#1139, PR #1180).
- Magnitudes: M1 +0.06 rank bias, proximity ≥ 0.72, one top-3 swap, never demotes. M2 temperature 0.40–0.55. M3 palette mix +0.10 at beat confidence ≥ 0.62. M4 phrase arm ≤ 40ms, hold +8%. M5 reactivity 1.18 relaxing to 1.00. `MIN_KEEPS = 8`.
- Public sway stays neutral while `GATE_OPEN` is false.

Do not retune M1–M5 in this pass.

## Room table (draft)

Temperature is 0..1. Her M2 band is 0.40–0.55. A room may ask hotter. She can only warm inside her band.

| Room | Temp | Davis | Lois | Queen lean |
|---|---|---|---|---|
| FULL BURN (burn × flow) | 0.70 | unleashed | wild | 0.2, backs off |
| AGREEMENT (nod × bloom) | 0.12 | settled | tight | 0.8, holds |
| THE CLASH (nod × rough) | 0.40 | working | shifting | 0.5 |
| DAVIS ALONE (away × any) | 0.55 | free | frozen | 0.3, his side |
| any other room | 0.35 | working | neutral | 0.5 |

Phase is the argument. No separate explore/refine tracker (#1144).

## Pacing debt

One runtime number. Not serialized. Not a fourth persona.

- Start 0. Cap 4.
- Each Lois BURN adds 1. At 3 or more, temp cap drops to 0.40 and Queen lean floors at 0.6, even in FULL BURN.
- Each Lois NOD subtracts 1, floor 0. At 0, Davis is allowed ugly again.
- STUCK with no keep still widens and bumps temp. Debt does not override a stall.

Left 4 Dead spends intensity, then owes relief. Without the debt the table can flatter all night or punish all night. Codename stays off the surface (#1145).

## Weather in the dish

A different weather from the Queen. The dish (#1183) is one world. Flow, scent, and density are fields in that world (#1199, #1233). Marks from one pattern can feel the same field. Scent is the small version already.

Stills and share links use the CPU field. GPU eval is live-only, opt-in, and not persisted (`docs/design/gpu-field-eval.md`). Scent deposits and diffuses; it is not a pure seed/x/y/t function and is not the first GPU port.

## Build order

1. Kernel batch, especially #1248, #1239, #1232, #1238, #1237.
2. Room table from this note, on #1145.
3. Pacing debt as a modifier on that table.
4. Field registry and field→channel, then weather-as-field. GPU last.
5. Three readings from the same keeps (#1173, #762). Her reading last.
