# KC-1 — Per-Region Animation: connect the mattes, wire the playback

**Status:** LOCAL DRAFT (2026-10-12, Matt's direction tonight: "get everything
connected and build"). Not filed. Issue drafts live at
`~/workspace/kc-issue-drafts/per-region-animation-issues-2026-10-12.md`.

## The want (Matt, 2026-10-12)

Every asset breaks apart automatically, cryptomatte-style: each element gets
its own ID and its own colour. Simple animations then apply **per element** —
leaves sway, petals pulse — while every element stays locked to the mark.
Lines and squiggles that read as waveforms should ripple like waveforms. And
over everything, the crooked hand: the hand-drawn irregularity KC-1 already
boils with.

## What already exists (verified on main, 2026-10-12)

- **Region mattes (#725, closed COMPLETED)** — `app/src/assets/regionMattes.js`:
  at ingest, each contiguous colour region of an asset gets a stable ID
  derived from its quantized colour + position (two same-colour blobs get
  distinct IDs). Slivers are absorbed into neighbours. Pure module, selfchecked.
- **Slot assignment** — `app/src/assets/overlay.js`: regions and their
  `regionSlots` (each region assigned a colour slot) cross the trust boundary,
  validated. **Scope limit: user-imported (`user:`) assets only.** No built-in
  catalog asset carries regions.
- **Cell kinemes (#781 Build C)** — `app/src/data/cellKinemes.js`: 4 kinemes
  (dial-sweep, wave-scroll, chevron-chase, spec-chase), 5 micro-HUD assets
  assigned, shed/freeze pin cell 0. **Defined and selfchecked — but no
  render-path consumer exists.** The UV window never moves live.
- **Instance kinemes (#781 Build A) — LIVE.** Five kinds (spin, osc, pulse,
  blink, bob) evaluated in the quad shader from a 16-slot table; per-instance
  kineme + phase ride instance floats 18/19. Patterns/drivers in
  `engine/kineme.js`, consumed by placements and the live resolver; audio can
  drive the kineme clock rate (#790).
- **The crooked hand — LIVE.** Boil (time snapped to a frame rate, 8 fps
  default, 6–12 exposed) + brush wobble are kineme driver parameters
  (`kinemeBoilFps`, `kinemeBrushWobble`), applied per instance.
- **Governor cost tiers** — `gl/kineme` is a registered tier; shed semantics
  for kinemes already exist (freeze motion / pin to cell 0).

## The gap (three unwired last miles)

1. Built-in library assets have **no mattes baked** — detection never ran
   over the catalog.
2. **No per-region playback**: the renderer draws one instance = one quad =
   one atlas cell. Regions are data nobody performs.
3. **No cell-kineme playback**: strip assets are authored, the window never
   moves.

## Design

### Parenting law (answers "locked to the main?")

Regions live in the asset's local space (normalized 0..1, as #725 already
stores them). The instance transform — position, scale, rotation, instance
kineme — applies to the whole mark and carries every region with it. Region
animation is a **local** offset inside that transform, the way a child layer
inherits its parent in After Effects. Regions never detach, never drift into
world space, never outlive their mark. Shed, freeze, and reduced-motion all
resolve regions to their rest pose, which is *exactly* today's render.

### R1 — Matte bake for the built-in library

- Run `detectRegions` over every catalog asset at build time; commit the
  result as data on the asset record (same shape the overlay boundary already
  validates: `regions`, `regionSlots`). Build-time, not load-time: the bake
  is deterministic, reviewable in a diff, and costs nothing at runtime.
- Default slot assignment: regions take slots in reading order (top-left
  first) from the asset's existing ink/accent palette. No new colours are
  invented; the slot system already exists.
- Region cap: **8 per asset** (atlas + instance budget, below). Sliver
  absorption already merges specks; assets that still exceed the cap keep
  their 8 largest regions and merge the rest into the nearest neighbour.
- Selfcheck pins: known assets get known region counts (the 4-petal
  `flora_flower` = 4 petal regions + centre where the drawing is
  disconnected; a solid line = 1).

### R2 — Per-region playback (the last mile)

- **Atlas**: at bake, each region becomes its own atlas cell — the region's
  bounding box with everything outside the region masked to alpha 0. This is
  the literal cryptomatte move: the region is separable because its pixels
  are isolated, not because we sample cleverly. (Rejected: sampling sub-rects
  of the shared cell — overlapping bounding boxes double-draw each other's
  pixels. A hack; not shipped.)
- **Instances**: one mark instance expands to R region-instances at pack
  time. Each region-instance is an *ordinary* instance — sub-rect cell, pivot
  at the region centroid, parent transform applied first — reusing the same
  two instance floats (kineme id + phase) per region. **No new vertex
  attributes, no second animation system.** The kineme table, the boil clock,
  and the wobble drivers all just work, per region.
- **Phase**: per-region phase derives from a seed hash of (asset id, region
  id) — copies and regions never move in lockstep (the `phaseFor` idea the
  KINEME handoff salvaged from #699).
- **Rest parity gate**: with all region kinemes at rest (or regions shed),
  the composited frame must reproduce today's single-quad render — measured
  on the default in-thread loop, inside the standing WebGL parity bar
  (<10% pixel difference; the tiling should land far under it).
- **Shed ladder**: region expansion is a governor cost. Shed order: region
  kinemes freeze → regions collapse back to the single original quad (the
  pre-R2 path, byte-for-byte) → instance kinemes freeze (existing). Region
  work sheds *before* the mark itself loses motion.
- **Reduced motion**: regions hold rest. Stillness is first-class (KC-1 DS).

### R3 — Assignment: defaults with an eye, overrides with a hand

- **Family defaults** (deterministic, from region geometry — no ML, no
  verdicts): outer regions of flora **sway** (osc, phase by angle around the
  centre); the centre region **pulses**; line-family regions **bob** gently
  under boil. A region with no default is still.
- Defaults are data on the asset record (`regionKinemes`), editable in the
  asset tools where imports already author their mattes — the artist's
  assignment always wins over the family default.
- Region tweaks are artist actions in the honest feed, like every other
  parameter (the A3 rule).

### C-wire — Cell-kineme playback (finish #781)

- `packInstanceData` consults the strip table for strip assets:
  `cellIndexAt(motionTime, …)` picks the cell, `cellUvWindow` rewrites the
  instance's UVs. Shed/freeze pin cell 0 — the canonical frame, pixel-
  identical to today's bake (the contract the data was written under).
- This is small and independent: it can ship before R2 and proves the
  "authored track" end to end on the five micro-HUD assets.

### R4 — Waveform lines (follow-on, honestly scoped)

A squiggle is **one** region — region animation cannot ripple it. Two honest
mechanisms, in order of preference:

1. **Boiled strips (uses C-wire)**: author waveform lines as short cell
   strips — the same line redrawn phase-shifted. The ripple *is* the boil:
   hand-drawn, crooked, native to the instrument's language. Authoring cost
   per asset; zero new engine.
2. **Shader stroke-warp (parked)**: displace along the line's local x by a
   travelling sine in the quad shader. Cheaper to author, but it bends
   everything in the quad — including things that are not strokes — and
   invents a second deformation language. Parked unless strips prove too
   slow to author.

**Shipped (#1435, per Matt's 2026-10-15 ruling amending this section).**
Both tracks landed. The strips: `line_squiggle_01` (line-boil, 7 frames)
and `line_squiggle_02` (wave-roll, 8 frames) roll through the C-wire —
frame 0 is the asset's own svg verbatim (bit-identical to the pre-R4
bake), each later frame translated along the stroke by exactly one step,
frames × step = the wavelength so the loop wraps seamlessly; shed pins
cell 0. The bend: the ruling's simple programmatic motion shipped
*without* the parked warp — a stroke-shaped region (bbox long axis
≥ 28 units, ink fill ≤ 30% of its bbox) assigned the `bend` kineme
subdivides at pack time into 3–8 slices along its length, ordinary
region instances over sub-windows of the region's own cell with the
kineme phase stepped 1/N per slice, so the existing osc evaluation
articulates the stroke and the wave travels along it. Stroke-aware by
construction: R1's partition means a region's cell holds only that
region's ink, so only the stroke subdivides — a non-stroke sharing the
mark renders whole. Line-family defaults: stroke regions bend, the rest
keep R3's bob. The quad-wide shader stroke-warp stays parked.

## Budgets (iPad bar applies)

- Region expansion multiplies instance count by the average regions per
  mark (≤8 cap; flora/line families measure 1–6). The governor sees the true
  count — region instances are instances for cost purposes, no discount.
- Atlas growth is bounded by total region bbox area; the R1 bake reports it
  per asset, and the cap keeps the worst case linear.

## Laws (carried from the petri spec — same instrument)

- Determinism: seed-hash phases only; no `Math.random`, no `Date.now` in
  any region or cell path. Bakes reproduce bit-for-bit.
- Rest = today: every stage's off/rest state reproduces the current render.
  A Look saved before this build opens identical after it.
- One writer: region expansion happens at pack time in the renderer path
  only; placements and goldens never see regions.
- Honest signals: no UI may imply per-element motion that isn't happening
  (the A3 "idle" rule, generalized).

## Open decisions (Matt's, one at a time when the lane reaches them)

1. Region cap: 8 (recommended) vs 12 — atlas/instance headroom vs finer
   break-apart on compound assets.
2. Family defaults: ship ON for flora/line (recommended — the want was
   "leaves move") vs defaults present but zero until assigned.
3. Imported assets: family defaults apply to user imports too, or imports
   stay still until hand-assigned (recommendation: apply — same language).

---

## Lois pass

**The nanosecond (3).** A flower whose petals breathe reads in one glance.
A flower that sits there while a panel explains regions reads never. This
spec passes only if the motion is visible at thumbnail size, in the first
second. Hold it to that.

**Defeat habit (2).** Every motion-graphics tool on earth animates the
layer. Animating the *petal* — automatically, on assets the artist already
has — breaks the habit that a mark is one dead stamp. Good. That is the
idea. Protect it.

**Cautious or creative (5).** The hedge is hiding in the defaults. "Family
defaults, artist can override" is a committee sentence. Lois: ship the
defaults ON and proud, or don't ship them. A sway nobody sees until they
find a settings page is caution wearing a lab coat. (Spec recommends ON —
decision 2. Keep it ON.)

**Discovered, not created (8).** The mattes were *found* in the art — #725
detects what the drawing already contains instead of asking the artist to
build rigs. That is discovery. The moment someone proposes hand-rigging
petals per asset, kill it: the whole point is the machine finds the parts
and the artist's eye assigns the motion.

**No trends (7).** Cryptomatte is a film-VFX word and this spec uses it —
fine, it's a mechanism, not a look. The trend to kill: "generative wiggle
on everything." Boil + sway on flora and lines is a language. The same
wobble smeared over type, HUD, and marks alike is a filter. Keep it where
it belongs.

**Assume smart (4).** No wizard, no "animate me!" button, no per-region
timeline. Defaults + one editable field. Passes.

**True to self (9).** This is Matt's eye mechanized: he *sees* the petal as
a separate thing. The spec amplifies that. The atlas-masking choice —
isolate the pixels honestly instead of sampling tricks — is his "proper
engineering" rule doing quiet work.

**Kill list.**
- Sub-rect sampling of shared cells (double-draw hack) — killed in R2.
- A second per-region animation system beside kinemes — killed; regions
  ride the existing floats and table.
- Shader stroke-warp for lines in v1 — parked in R4; boiled strips first. **(Amended 2026-10-15 by Matt's R4 ruling on #1435: simple programmatic bend/along-length motion for lines is IN scope for R4 — stroke-aware and simple, not the quad-wide warp; waveform lines roll via boiled strips.)**
- Any UI badge announcing "regions detected" — the motion is the message.
