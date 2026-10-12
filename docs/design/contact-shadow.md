# Contact shadow: design (#1183, effect 2)

**Status: approved by Matt, 2026-10-12, with the answers recorded below. Not built yet.** Every choice changes the look, so the build is still Matt's to review.
**Roadmap:** [`ROADMAP_PETRI_DISH.md`](../ROADMAP_PETRI_DISH.md), #1183's order of effects (Matt, 2026-10-11): colour lean
(#1370, shipped), then **the soft contact shadow** and the tile-edge nudge (#1395), then palette lock.
**Builds on:** [`dish-strata-sketch.md`](dish-strata-sketch.md).

## What it is, in one line

Each mark casts a soft shadow onto what lies beneath it, so the marks read as **resting on the ground**, not floating
over it.

## How it works (plain version)

Colour lean and EDGE are maths on each mark. A shadow has to be **drawn**, so this one lives in the renderer:

1. Draw the layer's marks as a silhouette, at half size, nudged a little in the light's direction.
2. Blur it sideways, then up and down. With step 1 these are three cheap half-size passes (the sketch's "about 3").
3. Lay the soft silhouette over what is already on the canvas in the palette's darkest colour, **then** draw the marks on top as usual.

It goes in one place: `renderer.mjs` `compositeLayerTo`, the step that puts a content layer onto the frame. It works
inside FX/MATH wraps too, because they use the same step. No change to placement, the dish, or the one-writer files
beyond passing the knob through.

## Things that come for free

- **Stills equal live.** Shipped stills are a readback of the same WebGL renderer (`gl/exportStill.mjs`), so the still
  gets the identical shadow. The SVG renderer (`studio/render.mjs`) is a dev-only parity reference (#192).
- **Off is exact.** At 0 the passes do not run, so the frame is pixel-identical to today.
- **Replay.** The knob is a layer parameter like GROUND and EDGE, so it is already in the performance file and the
  determinism harness.

## Decisions (Matt, 2026-10-12)

1. **Direction:** follow the CHIAROSCURO sun when it is on; with no sun, straight down, centred under the mark.
2. **Control:** one SHADOW knob per content layer, default 0, next to GROUND and EDGE. Softness and offset tuned once by eye.
3. **Falls on:** everything below the layer in the stack.
4. **Needs ground:** yes, inert with its reason when there is no PATTERN below.
5. **Colour: the active palette's darkest swatch** (lowest luminance). The shadow is that colour, laid over what is
   beneath at the strength the knob sets. *(Changed from the recommendation, which was a multiply-darken.)*
6. **Governor:** cost tier 2, shed after the tier-1 extras, as one piece.

## The questions as proposed (kept for the record)

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | Which way does the shadow fall? | **Follow the CHIAROSCURO sun (#594) when it is on. When it is off, fall straight down, centred under the mark** (a contact halo, no offset). | One light, never two. With no sun there is no light direction to invent, so the shadow sits directly under the mark. |
| 2 | What controls it? | **One knob per content layer, SHADOW, default 0**, next to GROUND and EDGE. It sets how dark the shadow is. Softness and offset are fixed constants that you tune by eye once, at review. | Matches GROUND and EDGE. One knob is a TE limit; a softness knob can come later if you miss it. |
| 3 | What does it fall on? | **Everything below the layer in the stack**: the pattern and any lower content layers. | Stack order is depth (strata). A shadow that skipped a lower layer would read as a cut-out. |
| 4 | Does it need a pattern below? | **Yes, like GROUND and EDGE**: inert, with its reason, when there is no ground. | It is the *contact* shadow of the dish: marks resting on ground. A general drop shadow on any background is a different feature (FX), not this one. |
| 5 | What colour is it? | **A darkening of whatever is beneath** (multiply), not grey or black paint. | The ground's hue survives in the shadow, the way a real shadow on a coloured floor looks. No colour parameter. |
| 6 | What does a slow machine do? | **Cost tier 2** ("quality scaler"): the governor sheds it after the tier-1 ACCUM/bloom extras, as one piece. | It is part of the look, so it is not shed first. Decision 7 already says detail is per machine. |

## Cost

- Three half-resolution passes plus one full-resolution lay-down per **shadowed** layer. Declared as
  `gl/contact-shadow` (tier 2). Measured on software GL (2026-10-12, worst case sun + matte, half-size passes run at
  full size): 12x the median effect, recorded as 3.6 ms against the committed median. Heavier than the first guess
  (0.3 ms); a hardware re-bless will give the real number.
- Memory: one extra half-size buffer pair (≈ 8 MB at 1080p, RGBA16F).
- Zero cost at 0, and zero cost on layers with no ground.

## Risks, and how the build handles them

- **ACCUM trails.** If a shadowed layer feeds the ACCUM feedback loop, the shadow could darken the trails a little more
  each frame. The build tests a shadowed scene with ACCUM on, and if it compounds, the shadow is drawn into the frame
  after the feedback step instead of into it.
- **SVG parity reference.** The dev-only SVG reference has no shadow. Parity tests run with SHADOW at 0, and a selfcheck
  pins that 0 is pixel-identical. No SVG filter is added for a dev tool.
- **iPad.** Half-resolution passes are what the iPad budget can carry. The governor tier covers the rest. Real-device
  numbers wait on #1312 like everything else.
- **Glass marks** (#1129) are translucent, so their silhouette is lighter and they cast a lighter shadow. That is
  correct and needs no special case.

## What the build PR will contain

- The three passes in the renderer, behind the knob, and the cost-tier declaration.
- `shadow` added to the layer's layout params (`groundShadow: 0`, spec 0..1) and to the scene contract.
- The SHADOW knob in BUILD next to GROUND and EDGE, inert with its reason when there is no ground.
- Selfchecks: 0 is pixel-identical; no ground means no passes; the shadow is the palette's darkest swatch and lands
  only under the mark's footprint; still equals live; ACCUM does not compound it; the cost tier is declared.
- One PR, `Refs #1183`. Palette lock is the next, separate step.

## Not in this design

- Per-mark height (higher marks casting longer shadows). It could ride the z-tiers later.
- Shadows from FX or MATH layers, and shadows cast *up* onto layers above.
- Palette lock.
