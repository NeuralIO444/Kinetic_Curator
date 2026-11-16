# One force seam — fields move the assets, nothing else is drawn (spec)

Status: **spec for Matt's yes.** Nothing here is built. Rulings in: Matt 2026-11-16 ("Everything is manipulation of assets on stage. Assets, type, creatures, beasts, game of life and ferrofluid are one system. Right now it looks like two competing ideas."). Answers 2026-11-16: the ferrofluid's own clump layer is **removed**; two forces on one asset **compose in a fixed order**; the ferrofluid **pools and drifts** plain marks; **one dial per force**.

## The problem (verified on main, 3af7f72)

- **Culture (DISH LIFE)** reaches the stage's real marks (#2234: alpha and scale ease down, dead cells vanish) and, through the coupling dial, scale, breath, patterns and backgrounds.
- **Ferrofluid** reaches the stage two ways that do not touch the dealt marks: a GPU field-body channel (`engine/dishFluidChannel.mjs`) that **seats its own small assets** where density runs high (pool vocabulary, no wear of the frame's marks), and the **bone pull** (`engine/dishFluidPull.mjs`, #2190) that bends creature and beast joints toward magnets.
- So the fluid's most visible effect is a second set of things on the stage, and its effect on the stage's real assets is limited to bones. That reads as two ideas. It breaks the rule Matt already ruled twice (2026-11-08 fluid, #2152 life): an underneath system is **seen only through what it moves**.

## The rule

**Fields are never drawn. Only the stage's assets move.** Every force is an invisible published field plus a read-side consumer that writes ephemeral per-asset deltas. Marks, type glyphs, creature bones and beast bars are all "assets on the stage" and take the same deltas.

## The seam

One ordered list of consumers, each a pure function of (published field state, its dial, the asset). Per-asset delta = `{ alpha, scale, dx, dy, dRot }`, applied to the frame's ephemeral arrays, never edited in place.

| Order | Force      | Field                      | Moves                                        | Dial         |
| ----- | ---------- | -------------------------- | -------------------------------------------- | ------------ |
| 1     | Culture    | `level`/`activity` (96×54) | alpha, scale (fade, die)                     | LIFE (#2234) |
| 2     | Ferrofluid | density + magnets          | position (pool, drift), bone rotation/offset | PULL         |

- **Fixed order.** Culture sets presence first (a dead mark has nothing left to drag); the fluid then moves what is left. Same order every frame and every replay.
- **Composition, not winner-takes-all.** Alpha/scale multiply; offsets and rotations add after culture has scaled. This answers #2178's open question 3 for the bones and marks alike.
- **Same laws as every coupling consumer:** dial 0 = byte-identical frames; governor shed (CULTURE HELD) folds the culture to 0; a fluid shed step folds the pull to 0; stateless, pure of recorded state, so takes replay and stills equal live; skip pinned and off-canvas marks.
- **One dial per force.** LIFE and PULL stay separate, each 0 by default. No master dial.

## What the ferrofluid does to a plain mark

**Pool and drift.** A mark sitting in field density above the matter floor (`MATTER_DENSITY_FLOOR`) slides toward the nearest magnet along the field, bunching up where density is high and spiking at the magnet. Strength scales with local density and PULL, capped so a mark never leaves its canvas. Creatures and beasts take the same law through the existing bone pull; type glyphs take the plain-mark law.

## Slices (each one PR, Matt merges)

1. **Mark drift.** `applyFluidDrift` beside `applyCultureLife` in the post-placement pass. PULL dial reaches marks. Selfcheck: dial 0 byte-identical, pure of published field, composition order, shed to 0, replay identical.
2. **Retire the clump body.** The field-body channel stops seating its own assets; the invisible kernel, magnets, culture birth coupling and bone pull stay. Selfchecks that pinned the body are retired by name, with the reason. Needs Matt's eyes first: slice 1 must read as fluid on the real marks before the clumps go.
3. **Type and beasts onto the seam.** Glyphs take mark drift; confirm beast bars and creature bones compose with culture fade in the fixed order.
4. **Docs.** As-built notes in `dish-life-on-assets.md` and this file; `ROADMAP_V1.md` pointer.

DISH LIFE slices 2 (born marks) and 3 (cycle-roll ease) in `dish-life-on-assets.md` are unchanged and independent.

## What this does NOT overwrite in the open issues

- **#2178** (ferro as a force): channel 2 (bone pull) and the GPU field-body channel shipped in #2190. Channel 1's _fragment_ grain and channel 3's finer grid stay queued and are untouched. This spec retires only the ferrofluid's **own clump consumer** of the body channel (slice 2), and only after mark drift reads as fluid.
- **#2180 / #2181** (WebGL program): the field-body channel stays as the general capability for other field systems. Only the ferrofluid stops being a consumer that draws its own assets. Matt's earlier Option B read (thousands of small assets) is the thing this ruling replaces for the ferrofluid, so it is flagged here for his eye, not decided silently.
- **#2186 / #2187** (K1/K2 kernels): unchanged. The seam reads published fields through the display-field path, so it works unchanged when the kernels go GPU-resident.
- **#2152** (DISH LIFE on the assets): slices 2 and 3 are unchanged; the LIFE consumer is order 1 in this seam.

## Not in this spec

No new kernel, no fluid surface, no new dials. #2178's fragment body (breaking marks into region pieces) stays queued; this spec only removes the _separate_ body, it does not add tearing.

## To verify at build, not assumed

- Whether the GPU field body is flag-gated in release builds or always on (Matt sees it live; the flag state decides slice 2's blast radius).
- The cost of reading density per mark on the CPU post-pass against the step budget.
- That a mark's drift is invisible to the hashed resolver output (ephemeral SoA only), as the culture fade is.

## Acceptance

- Dial 0 and field-absent stages are byte-identical to today.
- With FERROFLUID on and a magnet placed, the stage's own marks visibly gather toward it; no second set of shapes appears.
- Culture fade and fluid drift act on the same mark in the fixed order, and a take replays bit-for-bit.
