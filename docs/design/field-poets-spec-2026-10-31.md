# FIELD — Poetic Type System (KC-1)

**Working name:** FIELD  
**Codename (internal only):** the poets’ table  
**Date:** 2026-10-31  
**Status:** Spec, not implemented  
**Feeds:** the existing Left4Dead Director at pick time  
**Assets:** existing `ASSETS_LETTERS` (`typ_*` stamps from Anton). No live shaping. No HarfBuzz in the loop.

## House rules (non-negotiable)

- Letters remain baked stamps. Placement is constrained geometry, not free scatter when a form is armed.
- Deterministic. Seeded RNG only. Replays match bit for bit.
- Director runs at pick / keep / seed / evolve only. Never per-frame.
- New per-frame costs (if any) register in `kernel/costRegistry.mjs`. The Governor may shed them.
- Queen stays invisible. Poets may appear as a quiet field or not at all; no named surface for the Queen.
- Silence is default. A poem appears only when the Director arms one.
- One drive, geometry decides. Body/motion still comes from existing systems. Type is a second field that can be placed, held, or shed.
- No type or text input method exists. Every poet is a pure, versioned deck of pre-authored short forms.

## The four poets

| Poet | Lean | Form bias | Layout recipe (existing stamps) | Hot room | Cool room |
|------|------|-----------|----------------------------------|----------|-----------|
| **John Greenleaf** (Whittier) | held, plain | short declarative, nature | strict grid or stratified bands, no rotation, even spacing | slightly wider spacing, still upright | tight, almost still |
| **Teijo Nakamura** | precise, seasonal | 5-7-5 or 3-line concrete | stratified bands or single-line modules, locked baseline | seasonal word swap from her deck, still aligned | held on one line |
| **Amelia Rosselli** | modular, visual | quadro / square blocks, dense short lines | square modules on a grid, letters packed edge-to-edge, no free rotation | denser packing, more modules | fewer modules, more space |
| **William Gibson** | sparse, high-contrast | short fragmented lines, hard edges | single-line or two-line modules, locked baseline, generous negative space | sharper cuts, more fragments | fewer lines, more air |

All four are readout-only decks. The Director, at pick time, chooses one poet + one piece + one layout mode from the room’s gains, seeded. No live input, no HarfBuzz, no free scatter when a form is armed.

Gibson’s deck lives next to the others (`poets/gibson.js`). Every line must map to existing `typ_*` assets; the selfcheck still fails if any character is missing.

## Kinetic book shuffle and Curator controls

The four writers present copy to the Trio via the **kinetic book shuffle**.

- The kinetic book is the same dealable deck machinery already used for Looks and Voices (64 looks × 64 voices under the KINETIC ceiling). The poets’ decks ride the same shuffle path.
- A tap or Curator roll deals a poet + a piece from that poet’s deck, seeded.
- **Curator buttons** (the existing LOOKS / VOICE / Curator cluster in the top bar) make the deal less random. The same taste head, keep ledger, and room gains that bias visual Looks and Voices also bias which poet and which form is dealt. Higher keep pressure or a cool room leans toward Greenleaf or Teijo held forms; high intensity or a hot room leans toward Rosselli or Gibson density.
- The copy **parallels Voices and Looks** for user-driven genre. The user already drives visual genre by choosing or evolving a Look and a Voice. FIELD adds a parallel genre lever: the same Curator controls that narrow the visual pool also narrow the poetic pool. Genre is one choice, applied to both the marks and the words.
- Silence remains default. No poem is armed until the kinetic book shuffle (or a Curator action) deals one. Existing free-scatter letter stamps continue to work when no form is armed.

This keeps the Director at pick time only, deterministic, and inside the existing Curator / Look / Voice control surface. No new input method. No new named Queen surface.

The existing 20 rooms already map Lois × Davis to gains. FIELD adds one more column the Director can read:

- Room temperature / intensity → poet selection weight and form density
- FULL BURN / high intensity → Rosselli or Gibson bias, or denser packing
- AGREEMENT / low intensity → Greenleaf or Teijo held forms
- DAVIS ALONE → quieter, fewer lines
- THE CLASH → mixed, but still constrained (no free scatter)

The Director publishes a room readout as it already does. The poets’ table is readout-only for the personas’ minds; nothing a mind answers comes back in. Placement is pure data handed to the existing stamp path.

## Deck format (pure data)

```js
// poets/greenleaf.js (example)
export const GREENLEAF = Object.freeze([
  { id: 'g1', lines: ['the snow / lies quiet', 'on the hill'], layout: 'grid', density: 0.4 },
  // ...
]);
```

Same shape for Teijo, Rosselli, and Gibson. Decks live next to `directorsMatrix.js`. Selfcheck verifies every line uses only characters that exist as `typ_*` assets.

## Slice order (one PR per slice)

1. **S1** — poet decks + pure placement function (lengths → stamp list with constraints). No stage.
2. **S2** — Director hook + kinetic book shuffle: at pick time, choose poet + piece + layout from the room’s gains and the Curator’s look/voice bias. Publish readout.
3. **S3** — wire placement into the existing stamp path so a field can appear on the dish (held, not free-scatter). Cost registry entry.
4. **S4** — room bias: intensity and room type lean the choice. Stillborn (unreadable) forms never spawn.
5. **S5** — optional quiet overlay / whisper channel (gated). Matt’s feel check.

## Acceptance (measurable)

- 100 seeded random rooms: poet + placement is deterministic and identical across Node and browser.
- No stillborn form ever spawns (every line maps to existing `typ_*` assets; layout stays readable under the chosen constraint).
- Replaying a recorded take gives identical stamp positions every frame.
- When the room is cool or Curator keep pressure is high, forms stay held and upright (Greenleaf / Teijo bias). When the room is hot, density or poet bias changes measurably (Rosselli / Gibson).
- Added frame cost is registered and within budget.
- Existing letter scatter still works when no poem is armed.

## What was NOT done (yet)

Live shaping, HarfBuzz, free rotation on armed forms, any named Queen surface, per-frame opinion timers, and any change to the persistence schema beyond the new poet genes / deck ids.

## Files this reuses or touches

- `app/src/data/assets/assets-letterforms.js` (read only)
- `app/src/curator/director.js` + `directorsMatrix.js` (read room, add poet choice at pick time)
- `app/src/engine/kernel/costRegistry.mjs` (new entry if placement is live)
- New: `app/src/poets/` (decks + pure placement)
- Voice deck Swiss / Bauhaus families stay as-is; FIELD is a second field, not a new voice costume.

This stays inside the existing house rules. The letters stop being pure scatter when a poet is armed; they form short, readable fields that the Director can bias the same way it already biases the visual room.
