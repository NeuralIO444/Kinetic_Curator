# One force seam — fields move the assets, nothing else is drawn (spec)

Status: **spec for Matt's yes.** Nothing here is built. Rulings in: Matt 2026-11-16 ("Everything is manipulation of assets on stage. Assets, type, creatures, beasts, game of life and ferrofluid are one system. Right now it looks like two competing ideas."). Answers 2026-11-16: the ferrofluid's own clump layer is **removed**; two forces on one asset **compose in a fixed order**; the ferrofluid **pools and drifts** plain marks; **one dial per force**. Later 2026-11-16: "one system" **replaces Option B** (the dense body of small assets) for the ferrofluid, and its dense look comes from **duplicates of real marks**.

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

## Density: duplicates of real marks

Where the field is dense, **copies of the stage's own dealt marks** bunch up (the same assignment and cap as LIFE's born marks in #2152: nearest dealt mark, capped item count, extra items on the top layer, nothing edited in place). Never a separate shape vocabulary. Pool-less stages simply get drift with no copies.

## Slices (each one PR, Matt merges)

1. **Mark drift and duplicates.** Drift first, duplicates as a follow-on step of the same slice if the cap and cost allow. `applyFluidDrift` beside `applyCultureLife` in the post-placement pass. PULL dial reaches marks. Selfcheck: dial 0 byte-identical, pure of published field, composition order, shed to 0, replay identical.
2. **Retire the clump body.** The field-body channel stops seating its own assets; the invisible kernel, magnets, culture birth coupling and bone pull stay. Selfchecks that pinned the body are retired by name, with the reason. Needs Matt's eyes first: slice 1 must read as fluid on the real marks before the clumps go.
3. **Type and beasts onto the seam.** Glyphs take mark drift; confirm beast bars and creature bones compose with culture fade in the fixed order.
4. **Docs.** As-built notes in `dish-life-on-assets.md` and this file; `ROADMAP_V1.md` pointer.

DISH LIFE slices 2 (born marks) and 3 (cycle-roll ease) in `dish-life-on-assets.md` are unchanged and independent.

## What this does NOT overwrite in the open issues

- **#2178** (ferro as a force): channel 2 (bone pull) and the GPU field-body channel shipped in #2190. Channel 1's _fragment_ grain and channel 3's finer grid stay queued and are untouched. This spec retires only the ferrofluid's **own clump consumer** of the body channel (slice 2), and only after mark drift reads as fluid.
- **#2180 / #2181** (WebGL program): the field-body channel stays as the general capability for other field systems. Only the ferrofluid stops being a consumer that draws its own assets. Matt ruled 2026-11-16 that one-system replaces his earlier Option B read (thousands of small assets) for the ferrofluid.
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

## Unification: one kind of thing on stage (Matt, 2026-11-16 evening)

Seen live on build bef708a, Matt ruled: "I don't want those clumps. I want the clumps, game of life and assets dealt to stage to all have same intrinsic properties." Then, pointing at a clean phyllotaxis stage: "the second image should be the start point. Then the kineme breaks up the assets, creatures. And then the small pieces start to be affected by ferrofluid, using graphic design principles."

### The arc: clean → broken up → flowing → whole again

1. **Clean start.** The dealt stage, whole: assets, creatures, type as dealt.
2. **The field breaks things up.** Assets stay whole until the fluid reaches them. Where the field is strong, the kineme's region break-up (Phase 4: a part's regions scatter while its bone carries it) tears the asset or creature into its own pieces.
3. **The pieces flow.** The ferrofluid leans and gathers the pieces, not copies. **Pieces replace the fluid's copies** (#2247's fluid copies retire when pieces land).
4. **Whole again.** When the field leaves, the pieces drift back and reassemble, so the stage can always return to the clean start.

The field drives it: a calm field is a clean stage.

### Same intrinsic properties

- **Same look, same motion, same forces, same record.** Anything on stage is a dealt asset, a piece of one, or a copy of one: same assets, palette, Look, size law and finish; same kineme motion; same LIFE fade, fluid lean and governor; an ordinary stage item (recorded in takes, mirrored, counted in the budget).
- **The clumps are retired.** The ferrofluid publishes no field-body descriptor; the renderer seats nothing of its own. The channel (`engine/dishFluidChannel.mjs`) stays as the #2180 capability for other field systems.
- **Life's own cells are retired.** Life's idle visual mode and its specks go; Life shows only by fading, killing and birthing copies of dealt marks. Idle does nothing special: the culture keeps running underneath.
- **Copies (Life births only) are real marks.** They are spawned inside placement, so kineme motion, mirror, materials, LIFE, lean and the budget apply exactly as to dealt marks. One copy rule (the nearest dealt mark), cap **256**.

### Hierarchy and balance

- **Dealt > pieces and copies > forces.** Whole dealt assets lead (biggest, brightest); pieces and copies are always smaller and quieter; forces are seen only through them.
- **Share rule.** Copies' total ink never exceeds **half** the dealt marks' ink, whatever the fields do.
- **Copies shed first.** Under load the governor thins copies before it touches dealt marks or effects.

### Graphic design principles, judged and played (all four)

| Principle                      | Played by | What it moves                                                                        |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------ |
| Rhythm and repetition          | **QUEEN** | Pieces pulse and flow on the beat in readable patterns (spirals, streams), not noise |
| Contrast                       | **DAVIS** | Breaks more and pulls harder when the frame reads plain                              |
| Negative space and balance     | **LOIS**  | Pulls back when the frame is crowded or lopsided; keeps breathing room               |
| Hierarchy, and the whole frame | **TASTE** | Judges: scores each principle and names the one that fails                           |

When TASTE finds a principle failing, it **hands it to that principle's owner**, who takes **one small, capped step** on its dial next phrase: at most once per phrase (8 bars, or ~8 s without a beat).

### Order (each one PR, Matt merges)

1. Retire the clumps, and record this design (this PR).
2. Field-driven break-up: pieces of assets and creatures flow with the fluid and reassemble when it leaves (#2178 channel 1). The fluid's copies retire. Re-ordered 2026-11-16: waits for the constructs build and the library cut (`docs/design/constructs-spec.md` §8), so pieces come from constructs.
3. Life births as copies of real marks inside placement; cap 256; share rule; copies shed first (#2152 slice 2, re-cut).
4. Retire Life's own cell drawing (visual mode) and specks.
5. TASTE scores the four principles.
6. QUEEN, DAVIS and LOIS take their small steps on TASTE's hand-off.
