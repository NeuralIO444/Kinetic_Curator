# Top bar legibility — scoping note (Matt, 2026-11-09)

## What it is
A legibility rework of the top bar, scoped from the top-bar UX research (`files/research/topbar-ux-map-2026-11-09.md`, probed at main `6d37f9b0`). Matt reviewed five suggestions from that research and picked the **top three, as one issue**: (1) the VOICE collision, (2) KIN's invisible rhythm, (3) chips where armed and live share one affordance.

**Scope law for the whole piece: readouts only.** The dealing machinery — the heat router, the decks, the arm/lock semantics — does not change. Every new label or mark below is a *readout derived from the same state the router already uses*, never a second implementation that could drift from it. The bar starts telling the truth about what it already does.

## KC-1 DS basis (by principle)
- A **discrete** fact — which pass fires next, whether a chip is armed, who the taster is — renders **TE**: a detent, a label, one red at most.
- A **continuous** signal — tap heat rising and decaying — renders **Davis**: breath, warmth, shimmer; no digits, no steps.
Each item below cites which side of that line its signals sit on.

---

## Item 1 — Kill the VOICE collision: the judge button is labeled by its job

### Today (research §4)
The VOI button (circle) does not roll anything. It opens the menu that chooses **which persona tastes the CURATOR candidates** — LOIS, an artist persona (Davis, Molnár, Mohr, Benjamin, Reas, Haeckel, Oxman, Stock, Anadol, Menkman…), or off. The micro-readout beside it is the active persona's id ("REAS" = Casey Reas). Off means no scorer: the pick is an honest dice roll. Meanwhile the KINETIC **voice pass** is a different thing wearing the same word: a *costume* — one of the 72 deck voices that sets motion + palette over the standing look. Judge and costume, one word, adjacent buttons.

### The rework
- The word **VOICE belongs to the costume deck only** after this change: the 72 voices, the KINETIC voice pass, and KIN's next-pass detent (Item 2). One word, one meaning, across the whole bar.
- The judge button is labeled by its job — **the taster**:
  - Standing button word: **TASTE**.
  - Readout beside it, as today, is the active taster's id: **TASTE · REAS**, **TASTE · LOIS**, **TASTE · DAVIS**, …
  - **Off state reads TASTE · DICE** — because off honestly means a uniform dice pick, and the label should say what actually picks.
  - Compact/rest states of the button may shorten the readout, but no state of this button may carry the word VOI or VOICE; the role word survives in the tooltip and aria-label at every width.
- The persona's full name and alias stay where they already live — the menu rows (Casey Reas — PROCESS FIELD). LOIS's row keeps its standing honest note ("Not a trained eye").

### Surfaces that use the ambiguous term (all of them move)
- The button's label and rest/compact states.
- The button's tooltip → names the job ("who tastes the CURATOR candidates").
- The button's aria-label → same wording as the tooltip.
- The popup menu's title/header → the taster's job, not "voice". (The menu's off row already says the honest thing — honest dice — and keeps it.)
- Any help/legend text that calls the judge a "voice".
- **Not a surface:** internal code identifiers (e.g. `voiceOptions` in `curator/taste.js`) are not user-facing; renaming code is out of scope except where a selfcheck pins a user-facing string.

### Acceptance
- With Reas active, a screenshot of the bar reads **TASTE · REAS**; with the taster off it reads **TASTE · DICE**.
- A grep over user-facing strings finds the judge named a "voice" nowhere; VOICE appears only for the costume deck, the voice pass, and its detent.
- Menu, tooltip, and aria-label all answer "who tastes?" in the same words.

---

## Item 2 — KIN confesses its rhythm: heat breathes (Davis), the next pass is named (TE)

### Today (research §2)
KINETIC runs a heat model (`panels/layout/kineticHeat.mjs`): taps within ~2 s continue one run; rapid taps (< 600 ms apart) add heat (+0.34 each); idle heat halves every 2 s. Cold tap = **LOOK** pass; warm tap = **VOICE** pass; further warm taps = **CURATOR** pass; a 3rd-or-later tap at heat ≥ 0.6 = **CHAOS** — **only at KOZ scope** (at OFF/WEAK/MED the same hammering keeps nudging). The button's width/glow is a rough heat meter, and while warm it shows a tiny label naming the pass the *last* tap ran. Nothing names the pass the *next* tap will fire — the performer has to memorize the rhythm.

### The rework
- **Heat → Davis.** The button breathes with heat: a continuous warmth/breath channel whose amplitude tracks heat and decays as heat halves. No digits, no steps. (The existing width/glow meter may be re-expressed as this breath; the continuous channel is what matters.)
- **Next pass → TE detent.** A small detent label names the pass the **next** tap will fire — one of **LOOK / VOICE / CUR / CHAOS**. The post-hoc "last pass" label retires; the landed pass is knowable from the stage and the take record.
- **Single-source law:** the detent is a pure readout of the router's own decision state (run ordinal, heat, scope — the same inputs `kineticHeat` routes on). It is never a parallel prediction that could disagree with the router.

### Detent states (derived from the router, in the same commit as any state change)
| State | Next tap fires | Detent reads |
|---|---|---|
| No live run (heat 0, run lapsed) | LOOK pass | **LOOK** |
| Run live, next tap is the 2nd | VOICE pass | **VOICE** |
| Run live, next tap is 3rd+, heat below the CHAOS line | CURATOR pass | **CUR** |
| Run live, next tap is 3rd+, heat at/over the CHAOS line, scope = KOZ | CHAOS | **CHAOS** |
| Same heat, scope below KOZ | CURATOR pass (CHAOS cannot fire) | **CUR** — never CHAOS |

### Transitions
- **Immediately after a tap lands**, the run state updates and the detent re-derives — so between taps it always names the upcoming pass (after tap 1 it already reads VOICE, before tap 2 lands).
- **Decay:** as idle heat halves (~every 2 s) the prediction steps down with it — CHAOS → CUR as heat falls under the line; when the run lapses entirely the detent returns to LOOK. The Davis breath decays on the same clock, so label and breath never disagree.
- **Scope change mid-run** (START pill moved while warm) re-derives the detent in the same commit — dropping below KOZ removes a CHAOS detent at once.
- The **K** key is the same tap and follows the same detent.

### Acceptance
- Scripted tap sequences against the live bar: at heat 0 the detent reads **LOOK**; after one tap, inside the run window, it reads **VOICE** *before* the second tap lands; after the second, **CUR**; hammering at KOZ raises a **CHAOS** detent pre-tap; the identical hammering at MED never shows CHAOS at any point in the sequence.
- For every tap in a scripted sequence, the pass that actually fires equals the detent that preceded it (the single-source probe).
- Idle ~4 s from warm: the detent has stepped back to **LOOK** and the breath has visibly decayed.

---

## Item 3 — Chips: armed ≠ live

### Today (research, "The two chip rows")
Mode chips (27 layouts, phyllo among them) and motion chips (STILL / DRIFT / RIVER / FLOCK / ORBIT / SCATTER / MOLD) share one affordance with two meanings. **Filled = live now** (the mode/motion actually resolving on stage). But a **tap arms** the chip — pins it as what the next roll of its axis must land — and changes nothing on stage. An armed chip and a live chip are not reliably distinguishable, so the one gesture every performer will misread is this one. Arms are global (one arm per row), bind every roll of their axis, and the lock pill's count silently includes them.

### The rework
- **Filled keeps its meaning: live now.** Unchanged.
- **Armed gets its own TE mark:** a small **corner detent** (a corner tick at one consistent corner of the chip, detent style, within the one-red budget) — a discrete boolean state rendered TE. No fill change, no breath: armed is a fact, not a vibe.
- The four states a chip can show, all honest:
  - plain — neither live nor armed;
  - filled — live now;
  - corner detent — armed for the next roll of its axis;
  - filled + corner detent — live now *and* pinned to land again on the next roll of its axis ("more like this" — arming the live chip is a standing gesture, and tapping it again disarms).
- Covers **both rows** (mode row and motion row) with the same mark language.
- **One detent per row at most** — arming a second chip in a row moves the detent, following the standing one-arm-per-row behaviour.

### The mark's life cycle (single-source: detent ⇔ arm present in roll-scope state)
- **Consumption:** when a roll that deals the chip's axis fires, the router consumes the arm per standing semantics and the detent clears **in the same commit**. If the armed chip is what lands, it becomes filled in that same frame — detent off, fill on; the landing frame never shows the landed chip as armed-and-not-live.
- **Survival:** a roll that does not deal the axis leaves the detent untouched — a motion detent survives a LOOK pass; a mode detent survives a VOICE pass. CHAOS deals both axes and clears both detents.
- The lock pill's aggregate count is unchanged behaviour — but the detents now show *what* the count includes. No pill change is scoped here.

### Acceptance
- Arm a motion chip while a different motion is live: a screenshot shows two visually distinct chips — one filled, one corner-detented — distinguishable at a glance, at bar scale.
- Fire the consuming roll: in the landing frame the detent is gone and, when the armed chip landed, the fill is on — no intermediate frame shows a stale detent.
- Arm motion, fire a LOOK pass: the motion detent is still standing afterwards.

---

## Non-goals (reviewed by Matt, not picked — do not build)
- The CURATOR button's readout (keeps/favourites counts; an explore/refine mode display). Suggestion 4 — not chosen.
- A legend for the START pill's reachable-count readout (312·69·72). Suggestion 5 — not chosen.
- The crown SwayMark: it **stays nameless by design** — not a control, no label, no tooltip. Untouched.
- The LOOKS button's square glyph semantics, BEAT, lock semantics, and the arm/disarm gestures themselves.
- **Any change to dealing or router semantics.** If a readout and the router ever disagree, the readout is the bug.

## Queue position
- Scoped 2026-11-09. Queues **behind the full-auto line** (the strata rebuild, 2038, is that line's last item) with the post-line backlog, alongside the Canon set.
- This is **feel work**: it builds only on Matt's word, and it goes through **his review lane — he merges, never auto-merge**.

## Evidence base
- `files/research/topbar-ux-map-2026-11-09.md` — the probed map this scope stands on (§2 heat model, §4 the judge, the chip-rows section).
