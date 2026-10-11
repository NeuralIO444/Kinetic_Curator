# Phase 3 plan: wet lab and hierarchy (#1355, #1206)

**Status:** approved by Matt, 2026-10-11, with the answers recorded below. Step 1 is invisible; every later step is
something Matt will see or touch and is his to review.
**Roadmap:** [`ROADMAP_PETRI_DISH.md`](../ROADMAP_PETRI_DISH.md), Phase 3.
**Exit:** a pinned spore becomes a creature when both conditions hold, and not otherwise, replayably.

## What exists today (measured, 2026-10-11)

| Piece | State |
|---|---|
| `hierarchy.js` (parent to child transforms, #1206) | **Does not exist.** Every mark is independent; nothing can be built from parts. |
| Anchors on assets (where a wing attaches to a body) | **None.** No asset declares connection points or local bounds. |
| Pins | **None.** The closest thing is the canvas attractor (a pointer position the swarm chases), which is momentary and not stored. |
| The "TE four" (4 bodies, 4 limbs, 4 hands) | **Not defined.** There are asset packs and two flap "bodies" for the hype voice, but no body/limb/hand set. |
| Dish pressure (stress signal 3) | Reads 0. It is defined around pinned heads, so it waits for pins. That is why TIGHTEN is unreachable today. |
| Recording | Ready. Anything that becomes a resolver input is captured by performance files automatically. |

So Phase 3 starts closer to zero than Phase 1 did. The good news is the same as before: the rules are pure and
testable, and the recording spine already exists.

## Steps (one PR each)

| # | Step | Visible? |
|---|---|---|
| 1 | **`hierarchy.js` core.** `computeWorldTransform(parent, local)`, the expansion pass that turns a parts recipe into the same flat item list the renderer already draws, and the guardrails (a global item budget and a depth cap, so a bad recipe terminates instead of hanging). Not called by anything yet. | No |
| 2 | **Pins as data.** A pin is `{ id, x, y, layer }` in the document (one by default, up to 4), passed to the frame-builder, so it is recorded in performances for free. Dish pressure is computed around pins (neighbours within a radius), which brings the third stress signal alive and makes TIGHTEN reachable. | The pin tool in the asset panel, click and Shift+click on the canvas, and the spore mark |
| 3 | **The formation rule** (pure): a spore becomes a creature only when attraction at the pin AND density around it both clear a threshold, each modulated by the current band. Logged as `hierarchy-form`. | No |
| 4 | **The first creature: the moth.** A body, two wings at its anchors, and scales scattered on the wings (Poisson-disc, in wing-local space), assembled by step 1 at the pin when step 3 says so. | Yes, the main event |
| 5 | **Limb count over a life.** Base types stay inside the TE four. | Yes |

## Decisions (Matt, 2026-10-11)

1. **Placing a pin:** arm a pin tool in the asset panel (the bio wet lab), then click the canvas.
2. **A pin is visible before it forms:** a small, quiet spore mark, so you can see what is placed and remove it.
3. **One pin by default; up to four for power users.** A plain click places the pin, or moves it if one exists.
   **Shift+click adds** another, up to 4 (the TE four). Shift is the usual "add to selection" modifier; Option usually
   means duplicate.
4. **A pilot of three parts first** (one body, one limb, one hand). The full twelve of the TE four are chosen after
   the system is proven.
5. **The first creature is the moth** (#1206): the body is the body, the **wing** is the limb, and the **scales**
   scattered on the wings are the hands. Three parts, each with attachment points.
6. **Attraction is a field value at the pin** (noise or scent). The dish decides: a pin in a fertile patch forms, a
   pin in a barren patch waits. Nothing is needed from the pointer, and it replays exactly.

## Risks

- **Asset anchors are authoring, not code.** The creature only looks right if each part declares where it joins. A
  pilot with two or three hand-authored parts proves the system before anyone anchors a whole pack.
- **Budgets.** A creature multiplies marks. The expansion factor is computed before placement and the base count is
  divided down (the mirror precedent), so the caps cannot overflow.
- **Thresholds are guesses.** The roadmap leaves the numbers open on purpose. Step 3 ships starting values as named
  constants and the stress telemetry (Phase 2) is what tunes them.
