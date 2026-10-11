# The dish as source of truth: architecture sketch (#1183, dish spine step 5)

**Status: proposal. Not approved, nothing built.** #1183 asks for Matt's approval of this sketch before any slice
ships, and every slice changes the look, so each one is Matt's to review.
**Roadmap:** [`ROADMAP_PETRI_DISH.md`](../ROADMAP_PETRI_DISH.md) Phase 1, step 5 of [`dish-spine-plan.md`](dish-spine-plan.md).

## The idea in one paragraph

Today a PATTERN layer is painted as a texture, FX and MATH are post passes, and each layer is folded over the last
by a blend mode. The marks never see any of it. "One Petri Dish" means every layer is a stratum of one world the
marks live in: PATTERN is the ground they rest on, FX is the weather they move through, MATH is the force and tone
they obey. This sketch covers the first, smallest step: **the marks know what ground is beneath them.**

## What already exists (and is not connected)

| Piece | Where | State |
|---|---|---|
| The dish (points, fields, ground, features, tone) | `engine/kernel/dish.js` | Built. A container with a selection index. |
| Marks fill the dish, and lean toward `dish.ground` | `engine/buildPlacements.js` (`dish`, `lean` params) | Built. `lean = 0` is byte-identical to today. |
| The colour of the ground at a point | `pattern/engine.js` `groundColorAt(grid, X, Y)` | Built. One pure function, the same one the renderer paints with. |
| Mixing a mark's colour toward the ground | `engine/kernel/color` `applyLean` | Built. |
| **Anything that passes a dish to the live frame** | `gl/liveResolve.mjs` | **Missing.** No caller supplies a dish, so none of the above runs live. |

So step 5 is mostly a connection, not an invention. The honest label for the current state is "looks wired, is not".

## Proposed slice 1: marks lean toward the ground beneath them

1. **The resolver owns one dish per document.** Created with the resolver, refilled when the layer stack or seed
   changes. `liveResolve.mjs` (a one-writer file) takes one call site; the logic lives in a new module.
2. **A PATTERN layer supplies the ground.** Its tile grid becomes `dish.ground(x, y)` through `groundColorAt`.
3. **Each content layer passes the dish and its lean amount** to `buildPlacements`.
4. **A knob, default 0.** With the knob at 0, or with no pattern layer, the frame is byte-identical to today. The
   determinism harness and the performance file cover it automatically: the knob is a resolver input like any other.
5. **Stills match live.** The still path (`studio/render.mjs`) gets the same call, so an exported still equals the
   live frame for pattern scenes (an acceptance item on #1183).

## Decisions needed from Matt

1. **Which pattern is "the ground" when there are several?**
   - A. The nearest PATTERN layer *below* the marks in the stack (recommended: stack order becomes depth, which is
     what "strata" means).
   - B. Always the bottom-most pattern.
   - C. All patterns below, blended.
2. **Where does the lean knob live, and is it per layer?**
   - A. One slider per content layer in BUILD, named for what it does (recommended; a layer can sit lightly or
     sink in).
   - B. One global amount for the whole dish.
3. **A drifting pattern moves the ground under a still mark. Should the mark's colour follow?**
   - A. Yes, re-read the ground every frame (recommended). The lookup is a pure function, about 0.05 ms at 800
     marks, no GPU readback. The mark visibly belongs to the ground it is on.
   - B. No, read it once when the mark is placed. Cheaper, but a drifting pattern slides out from under a colour
     that no longer matches it.
   - Note: the existing code fills the dish "once per placement, never per frame". Option A changes that comment
     for the colour lookup only; positions are still placed once.
4. **Is "lean toward the tile colour" the right first effect?** #1183's planning pass ranked four: (a) colour lean,
   (d) palette lock, (b) a soft contact shadow, (c) a nudge from tile edges. This sketch does (a) only.

## After slice 1 (not designed here)

- FX as weather: grain, haze and tear become fields the marks can feel, not a finishing filter.
- MATH as force and tone.
- The dish roster replacing the LAYERS mixer (#1203): a visible redesign that needs a mockup first.

## What this does not change

- No blend-mode change. Interaction, not a different way of mixing images.
- The governor's shed tiers still apply; anything that costs frame time gets a tier.
- Nothing ships without the knob defaulting to "off".
