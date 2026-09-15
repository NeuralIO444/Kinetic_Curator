# Kinetic Curator — next generation spec

Target, in the artist's words: **realtime performance is the core; pause, then
render high-res.** This is the Joshua Davis workflow, and it is worth being
explicit that it is *not* an offline film pipeline. Everything below is
subordinate to keeping the live instrument fast.

## What this spec deliberately drops

Earlier exploration pointed at deterministic 24fps UHD motion rendering —
subframe motion blur, offline frame sequences, a time refactor to make every
frame a pure function of `t`. **Dropped.** It serves a workflow (rendered film
output) that isn't the one wanted. Grain and film-stock emulation are dropped
with it, traded for realtime blending quality.

Consequence worth knowing: the existing `useVideoRecorder` is a realtime
screen capture (`canvas.captureStream` + `MediaRecorder`, 15fps, WebM). It is
a preview/documentation tool, not a mastering path, and nothing here changes
that. If film-quality *motion* output ever becomes the goal, the time refactor
returns as a prerequisite.

---

## Architecture: proxy / final

The single organising idea. It already half-exists and is not currently named.

**Live is a proxy.** `data/quality.js` caps composition to protect
interactivity: PERF allows 180 shapes and disables mirror entirely; BALANCED
allows 420; HIGH allows 800. These are soft ceilings for interactive
performance — the file says so.

**Render has no interactivity to protect.** At render time the caps exist for
no reason. Lifting them is the real content of "uprez" — more pixels is the
lesser half.

    LIVE   —  capped count · mirror maybe off · 60fps · the instrument
    RENDER —  uncapped     · mirror on        · seconds · the artefact

This is the proxy/final split from film post, with a final that takes seconds
rather than a farm.

---

## A. Render pipeline  *(build first)*

### Already working — do not rebuild
- `STOP` freezes motion (`running` gates `useCanvasLife`, `useContinuousLife`,
  `useSwarmTick`).
- `exportSnapshot` rasterizes the **live SVG node** at 1×/2×/4× —
  1920×1080 / 3840×2160 / 7680×4320. This is a true re-render from vectors,
  not an upscale of screen pixels.
- Snapshot records carry seed, resolution, timestamp, full layout config and
  palette id, plus (as of the last commit) a jpeg thumbnail.

### Missing
1. **Render does not lift quality caps.** A 4× export of a PERF session is an
   8K image of a 180-shape composition. All pixels, no density.
2. **The flow is not presented as a flow.** Resolution is a `<select>` buried
   in the OUTPUT panel; `S` fires instantly. Nothing says "you are now making
   a final."

### Spec
New action `renderFinal({ resolution, uncapped })`:

1. Snapshot current state (seed, layoutParams, paletteId, enabledAssets).
2. If `uncapped`, recompute placements with caps lifted — `maxCount` and
   `maxParticles` raised, `allowMirror` forced true.
3. Rasterize at `resolution` via the existing `exportSnapshot`.
4. Restore live state.

UI: a RENDER block in OUTPUT — resolution selector, an UNCAPPED toggle, one
primary button. Distinct from the existing instant `S` snapshot, which stays
as the quick-grab.

### ⚠ Open decision — blocks implementation

Placements are seeded. Changing count does not add detail to an existing
composition, it **consumes the RNG stream differently and produces a different
image**. So:

- **(a) Render matches preview.** Caps stay. Uprez is pixels only. What you
  performed is exactly what you get. Predictable; wastes the headroom.
- **(b) Render goes fuller.** Caps lift. Same seed, denser composition —
  but it is not the frame you were looking at when you hit pause.

Recommendation: **(b), with (a) available as a toggle** — the UNCAPPED switch
above, defaulting off so the safe behaviour is the default and the powerful one
is opt-in. But this is an artistic call, not a technical one, and it is the one
thing here that cannot be decided from the code.

### Risks to verify, not assume
- Browser canvas limits at 7680×4320 with 800 shapes + mirror. Safari caps
  canvas area more aggressively than Chrome. Test before shipping 4×.
- `exportSnapshot` is async via `img.onload`; a long render needs progress
  feedback or it reads as a hang.

---

## B. Blend modes  *(build second — cheapest large gain)*

Every shape currently composites `normal`. Alpha is the only compositing
control. Overlapping shapes at 40–100% alpha read as flat stacked stickers;
`screen` / `plus-lighter` on the same stack is the glowing accumulation that
reads as the V0ID / KOHI work.

- **State:** `blendMode: 'normal'` in `layoutParams` (layout defaults in
  `data/layout-modes.js`, beside `overlap` / `mirror`).
- **UI:** select in LAYOUT's toggle row — Normal, Screen, Multiply, Overlay,
  Difference, Plus Lighter, Soft Light.
- **Render:** add `mixBlendMode` to the existing per-item inline `style` in
  `CanvasPanel` — the same object already setting `--ink` / `--accent`.
- **Export:** inline styles serialize with the node, so exports inherit it free.
- **Verify:** SVG blend modes may need `isolation: isolate` on the parent `<g>`
  to composite against siblings rather than the page backdrop. Confirm
  empirically.
- **Later:** vary blend mode per-item by index, the way `colorForPlacement`
  already varies colour.

HashLips ships the same mode list (canvas `globalCompositeOperation`), which is
independent confirmation this is the standard lever in layered generative work.

---

## C. Gradient shading  *(build third)*

The depth in KOHI's spirals is radial-gradient shading. Note how Davis gets it:
his own course teaches drawing shapes in Illustrator to build an asset bank,
then finishing in Photoshop or Illustrator. **The shading is authored into the
assets or added in post — not computed by the engine.**

Two routes:

- **(c1) Author it.** Add gradients to the 137 source SVGs. Highest fidelity,
  matches Davis exactly, enormous manual effort, not parametric.
- **(c2) Compute it.** Per-item, emit a second `<use>` with a radial gradient
  (edge → lightened centre), composited `soft-light` over the flat fill.
  Parametric, one-time cost, reuses B's rendering pass.

Recommendation: **c2**, exposed as `SHADING: FLAT / GLOSS` in the same LAYOUT
row as blend mode. Revisit c1 for hero assets only if c2 falls short.

---

## D. Weighted asset selection  *(small, high impact)*

Found while reading HashLips' rarity system. `useCanvasItems` currently does:

    const asset = activeAssets[i % activeAssets.length];

Pure round-robin. Not weighted, not random. With 135 assets enabled every
shape appears an equal number of times in a fixed cycle — which is a large part
of why dense compositions read as evenly-distributed confetti rather than
having dominant forms and rare accents.

- **Spec:** optional `weight` on each asset (default 1); seeded weighted pick
  from the enabled pool instead of `i %`.
- **Later:** a per-category weight slider in ASSETS, so "mostly geometric with
  occasional floral" becomes a control rather than a curation chore.

This is the highest look-per-line-of-code item in the document.

---

## E. Accumulation  *(defer — own project)*

HYPE's `BitmapCanvas` is a persistent bitmap painted every frame and never
cleared; shapes build up over time. It is where much of the density and
painterliness in Davis's work comes from, and it is free long-exposure motion
blur.

Kinetic Curator structurally cannot do this: React re-renders the SVG
declaratively, so each frame replaces the last.

**Conflict with the render pipeline, and the reason to defer:** accumulated
history lives only in the pixel buffer, not the SVG DOM. Pause and export at 4×
and the built-up history is gone — you get the current frame's shapes, sharp
and alone. Resolving it means either accumulating at export resolution
continuously (a persistent 7680×4320 RGBA buffer — 132 MB), or replaying the
last N frames at high res on export (which reintroduces the deterministic-time
refactor).

Defer until B and C are in and their effect on the look is known.

---

## F. Batch edition render  *(optional)*

From HashLips' `growEditionSizeTo`. Given A exists, a still is one frame, so
batch is a loop: render N seeds to disk at chosen resolution, with the JSON
sidecars already produced. Useful for a print series. Straightforward once A
lands; worthless before it.

---

## Build order

    A (render pipeline)      — unblocks everything, needs the open decision
    B (blend modes)          — cheapest large visual gain
    D (weighted assets)      — smallest change, disproportionate effect
    C (gradient shading)     — builds on B's render pass
    F (batch)                — trivial once A exists
    E (accumulation)         — own project, conflicts with A, decide later

Hue-rotate (a global `filter: hue-rotate()` on the root SVG, one state field
and one line) is deliberately omitted from the ordering: it is a 20-minute job
that can land any time B is being touched.
