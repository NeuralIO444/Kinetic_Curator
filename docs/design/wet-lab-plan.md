# Phase 3 plan: wet lab and hierarchy (#1355, #1206)

**Status:** proposal for Matt's approval. Step 1 is invisible and can start; everything after it is something Matt
will see or touch, so each has a question below.
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
| 2 | **Pins as data.** A pin is `{ id, x, y, layer }` in the document, passed to the frame-builder, so it is recorded in performances for free. Dish pressure is computed around pins (neighbours within a radius), which brings the third stress signal alive and makes TIGHTEN reachable. | The pin gesture and its mark |
| 3 | **The formation rule** (pure): a spore becomes a creature only when attraction at the pin AND density around it both clear a threshold, each modulated by the current band. Logged as `hierarchy-form`. | No |
| 4 | **The first creature.** A head, a body and limbs, assembled by step 1 from parts with anchors, at the pin, when step 3 says so. | Yes, the main event |
| 5 | **Limb count over a life.** Base types stay inside the TE four. | Yes |

## Decisions needed from Matt

1. **How do you place a pin?** The roadmap calls the asset panel "the bio wet lab".
   - A. Arm a pin tool in the asset panel, then click the canvas (recommended: the place is chosen where you see it).
   - B. Drag an asset from the asset panel onto the canvas; where you drop it is the pin.
   - C. A key held while clicking the canvas.
2. **Is a pin visible before it becomes a creature?** A spore mark, or nothing until it forms.
3. **How many pins at once?** One, a few (say 4, matching the TE four), or unlimited.
4. **What are the TE four?** Which assets are the 4 bodies, 4 limbs and 4 hands: chosen from the existing packs, or
   newly drawn. Each needs anchors (where things attach), which is authoring work per asset.
5. **The first creature.** #1206 proposes a moth (body, two wings at anchors, scales scattered on the wings). Use
   that as the pilot, or start with something simpler (a head, a body, two limbs)?
6. **What counts as "attraction at the pin"?** The pointer attractor, a field value (noise, scent), or both.

## Risks

- **Asset anchors are authoring, not code.** The creature only looks right if each part declares where it joins. A
  pilot with two or three hand-authored parts proves the system before anyone anchors a whole pack.
- **Budgets.** A creature multiplies marks. The expansion factor is computed before placement and the base count is
  divided down (the mirror precedent), so the caps cannot overflow.
- **Thresholds are guesses.** The roadmap leaves the numbers open on purpose. Step 3 ships starting values as named
  constants and the stress telemetry (Phase 2) is what tunes them.
