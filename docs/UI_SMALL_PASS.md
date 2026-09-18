# UI small pass — keep the instrument, harden the chrome

**Date:** 2026-09-18  
**Stance:** Love the current UI. Tiny updates only. Fast, hard, not “AI designed.”  
**Not this doc:** new panels, icon packs, dual MIX, dual live decks, Worker on rAF.

The board already has a face: PLAY tape + LAYERS bay + palette strip. TE / Game & Watch here means **fewer drawings, two difficulties, a clock you can read at arm’s length** — not a restyle.

---

## Current UI (what to keep)

| Surface | Keep |
|---|---|
| PLAY / MasterBar | Tape counter, budget knob, FPS/headroom. One readout. |
| LAYERS | Existing layer chrome. No second mixer. |
| Palette strip | Swatches + (incoming) duration control from #326. |
| Mode chips | Geometry switch today; voices later (#280 / #329) without a new shelf. |
| BUILD sliders | The ones that already exist. Cap new ones at the issue’s own budget (bio-drives: two). |

Do **not** restyle type, radius, or color system in this pass. “Doesn’t feel AI” means **stop adding generic icon rows and dual-purpose sliders**, not a skin.

---

## Small updates only

1. **Name collision — MIX**  
   #326 duration (0–8s) and #329 voice travel cannot share the word MIX. Palette control = **FADE** (or PAL). Voice travel keeps **MIX** if personas land. One line of copy. No new widget.

2. **Cap palette FADE at ~3s if 8s feels like a postcard**  
   Feel call on the Studio after #326. Not a new feature.

3. **KC-1 labels (#339)**  
   `Layer n` → `KC-n` in LAYERS only. Same type, same row height. Reversible.

4. **Ghost slots (#340 / #341)**  
   Empty KC-2…4 and FX-2…4 visible and dim. Tap arms. No extra chrome on the ghost.

5. **One TAPE FULL sentence (#342)**  
   PLAY says the room: `LEAN holds 1 track. Raise the ceiling or shed.` / `The board holds 4 tracks. Shed one.` Same string as the disabled Add. No second meter.

6. **PATCH row later (#343–#345)**  
   After labels + ghosts + tape. Default: OFF. Strength only when ≠ OFF. No Lucide placeholders — wait on #346 (Matt draws).

7. **Harden, don’t decorate**  
   - e2e that assumes `input[type=range].first()` (#326 already burned this).  
   - One `package.json` selfcheck line per PR; rebase last.  
   - Don’t nest worktrees.  
   - Shed / tape / chassis must agree on FULL (#350 P1).

---

## Open issues — UI vs not

### Touch chrome (small)

| Issue | UI work | This pass |
|---|---|---|
| **#339** KC-1 labels | Type in LAYERS | Yes — first paint after #326 |
| **#340** 4-track ghosts | Dim rows, tap to arm | Yes — after #339 |
| **#341** 4 FX ghosts | Same pattern | Yes — with #340 |
| **#342** TAPE FULL copy | PLAY + Add reason | Yes — strings already called |
| **#292** governor as instrument | Collapse three budget readouts | Only if leftover after #294–#297; don’t reopen landed work |
| **#278 / PR #326** palette FADE | Already in flight | Eyes only. Rename MIX→FADE when voice MIX exists |
| **#280 / #329** personas + MIX travel | Chips become voices | After #326; don’t ship a second MIX name |
| **#306** audio ballistics | Deepen existing audio sliders | No new surface |
| **#284** FLOW slider + Loop Capture | One slider + OUTPUT control | Already scoped tiny; eyes on smoke |
| **#287** METABOLISM + BREATH | Two sliders max | No biology tab |
| **#346** icons | Art | Matt only. No AI pack |

### Do not treat as UI

| Issue | Why |
|---|---|
| **#343–#345** MOD/FIELD/FEED | Kernel on #350; PATCH paint after ghosts |
| **#298** M3 costs | Machine time, not chrome |
| **#281 / #331** assets | Content, chips already exist |
| **#351** Worker ABI | Invisible. Never a button |

---

## Roadmap (paint order)

```
#326 lands (palette recolor + duration)
    → feel 0s / 2s / rapid on Studio
    → if 8s is dead, cap FADE
#339 labels
#340 + #341 ghosts
#342 one TAPE FULL sentence (PLAY + Add)
#298 when you have the machine
#343 PATCH OFF/MOD only
#344 FIELD
#345 FEED (curl, delay-1, field-then-push)
#346 icons when you draw them
#280/#329 voices — rename palette control first
```

No parallel “UI refresh” track.

---

## Comments on open issues?

**Not a comment on every issue.** That reads as noise and doesn’t change the queue.

**Do comment (short pointer) on:**

- **#339, #340, #341, #342** — one sentence: labels / ghosts / TAPE FULL copy locked; no new panel; wait #326.
- **#278 / PR #326** — already has the feel note (FADE vs voice MIX). Enough.
- **#343** — PATCH row only after ghosts; no icons until #346.
- **#346** — no placeholders.

**Do not comment UI essays on:** #298, #351, #281, #287 engine items.

A comment **does not** implement UI. It only stops the next agent from inventing a fifth panel. The work stays the issues above, in that order.

---

## Explicit non-goals

- Restyle / new type / “design system” pass
- Icon library
- Dual-deck palette mix
- Worker or eval ABI in the chrome
- Saving palette FADE seconds into the project JSON
