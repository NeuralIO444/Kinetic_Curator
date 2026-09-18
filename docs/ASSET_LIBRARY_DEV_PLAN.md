# Asset Library Development Plan

PLAN ONLY — no code, no branches. Repo: NeuralIO444/Kinetic_Curator @ main (c86eb33), surveyed 2026-09-17.

---

## 1. Current state map

### The Assets tab (AssetPoolPanel, P02)

- **Canon pool:** 137 read-only assets, baked into the app. Toggle on/off per asset, category filter chips, text search, ALL ON / ALL OFF, grid/list views, per-asset weight (H/M/L = pick-probability ×4/×2/×1), solo (alt-click), duplicate-to-overlay.
- **User overlay:** up to 32 assets (`user:` prefix), clearly badged. Import via file upload, drag-drop, or paste-SVG. Per-asset: edit in studio, rename, swap SVG, delete. Canon is never touched.
- **Asset Studio (motif kit modal):** compose from primitives (ellipse, rect, hex, star, dot, ring, parametric n-gon 3–8 sides) with drag / rotate / non-uniform scale, ink-or-accent token paint, 20-step undo. Explicitly "Not Illustrator."

### Sections: populated vs empty

| Category | Assets | State |
|---|---|---|
| geometric | 34 | populated |
| linework | 25 | populated |
| organic | 20 | populated |
| stamps | 18 | populated |
| floral | 15 | populated |
| radial | 14 | populated |
| dots | 11 | populated |
| crystalline | 0 | **EMPTY** |
| biosynthetic | 0 | **EMPTY** |
| fragments | 0 | **EMPTY** (default bucket for user imports) |
| scanlines | 0 | **EMPTY** |

The four experimental categories exist as filter chips but contain zero canon assets — these are the empty sections Matt sees. `fragments` doubles as the default category for pasted/imported SVGs, so it will fill organically with user content.

### How assets get in today

1. **Canon:** hand-authored SVG strings in `app/src/data/assets/*.js`. Shipped with the bundle.
2. **Studio:** motif-kit composition → saved to user overlay.
3. **Import:** SVG file / drop / paste → `ingestSvg` sanitizes (allowlist tags, no scripts, ≤48KB, ≤24 group depth, hostile-markup rejection) → user overlay. `lineargradient`/`radialgradient`/`stop` are already on the allowlist, but no canon asset uses them and the studio can't author them.

### How assets reach the screen

Each enabled asset is rasterized per palette combo (ink/accent substitution via string replace of `var(--ink)` / `var(--accent)`) through a browser `Image` → 2D canvas → `ImageData` → packed into a resolution-independent WebGL texture atlas (`bakeLiveAtlas`). Assets are palette-responsive *only* if they use the token paint contract — fixed hex colors bake as-is and ignore palette switches.

### The asset cost model (what the governor sees)

- **Cost score:** `subpaths × (1 + groupDepth/8)`, computed once at ingest (canon scored lazily). Static per asset, never per frame. Non-blocking warning above 600.
- **Governor cut 4 (assetThin):** drops the top 25% highest-cost enabled assets, render-only, auto-restores. This is why complex assets are safe to add — the governor sheds them first on weak machines.
- **Weights:** H/M/L biases pick probability; it does not change cost.

Implication for the plan: hand-drawn single-path marks are *cheap* (low subpath count). Gradients cost nothing extra at the score level — they're fill complexity, not node complexity. The library can grow in these directions without governor risk.

---

## 2. Proposed style families

Each family ships as a small authored set (10–16 assets), token-painted, cost-budgeted. Families map onto the empty experimental categories — no new categories.

### F1. Hand-drawn marks → fills `fragments` + `linework`
**What:** wobble strokes, hatch clusters, scribble ellipses, arrow doodles, cross-hatch patches. The human hand against the machine grid — the most Davis move on this list.
**Authoring:** procedurally generated with seeded jitter (a "wobble" pass over the existing linework/primitive geometry), curated by eye. Later: a freehand draw tool in the Studio (see §3).
**Bake:** single paths, trivially cheap. Fits the pipeline unchanged.

### F2. Token gradients ("fades") → fills `crystalline`
**What:** ink→accent and ink→transparent linear/radial fades on shard/prism geometry. Depth without nodes.
**Authoring:** authored SVG with `stop-color="var(--ink)"` / `var(--accent)` — the existing string-substitution palette bake already handles this; no pipeline change. Studio gains a two-stop gradient paint option (ink→accent, ink→clear).
**Bake:** gradients rasterize fine through the `Image`→canvas path. Cost score unaffected (fills don't add subpaths).

### F3. Print textures → fills `scanlines`
**What:** halftone dot grids, registration crosses, misregistration ghosts, riso grain bars, crop-mark corners. The analog-print layer of the TE aesthetic.
**Authoring:** procedural (grids with seeded dropout), hand-tuned.
**Bake:** unchanged. Mostly `light` weight, sparse density — texture, not subject.

### F4. Biosynthetic marks → fills `biosynthetic`
**What:** circuit-vein hybrids: traces that branch like mycelium, pad-ring nodes, data-flow dashes. Neither clean tech nor pure organic — the in-between the category name promises.
**Authoring:** procedural branching generator + curated selection.
**Bake:** moderate subpath counts; keep under the 600 warning threshold. Good citizens of assetThin (they're the first to shed, which is honest — they're detail, not structure).

### F5 (later). Glyph fragments
**What:** single-letterforms, numerals, punctuation at display sizes — type as texture. (Matt is a typography-adjacent motion designer; this shelf will get used.)
**Authoring:** hand-picked glyphs converted to paths, curated. Deferred — it needs a licensing/clean-room pass on the source font, and it's the easiest family to bloat. Cap at 12.

---

## 3. The build-up workflow: sketch → asset

The simplest honest path, no kitchen sink. Three doors, in order of Matt's likely use:

**Door 1 — Draw it in the Studio (new).** A freehand pen in the AssetStudioModal: pointer draws a path, light smoothing + optional wobble, stroke becomes a token-painted asset in the overlay. This is the TE move — the instrument teaches the hand, the hand feeds the instrument. Matt sketches; the sketch is in the pool in 30 seconds.

**Door 2 — Paste SVG (exists, document it).** Illustrator/Figma → copy → paste into the pool. Already works; what's missing is guidance: a help topic with the 3 rules (keep it under ~600 cost, use ink/accent tokens if you want palette response, flatten text to paths). Five lines of help copy, not a feature.

**Door 3 — Promote to canon (curated, gated).** Overlay assets Matt loves get promoted into the canon library by the author (Matt), keeping the token contract and cost budget. Canon stays authored — this is the anti-stock-art-bin gate: nothing enters canon by bulk import.

Explicitly **out:** auto-tracing PNGs/jpegs, AI generation inside the app, marketplace/download packs. All three turn the library into a stock bin and violate the deliberate-limitation creed.

---

## 4. Empty sections: fill vs cut

**Fill, don't cut.** The four experimental names are good — they promise aesthetics the current canon doesn't deliver, and F1–F4 map onto them exactly:

- `crystalline` ← F2 token-gradient shards
- `biosynthetic` ← F4 circuit-mycelium marks
- `scanlines` ← F3 print textures
- `fragments` ← F1 hand-drawn marks + the existing user-import default bucket

No new categories. If a fifth family (glyphs) ships, it goes in `stamps` — that's what stamps are.

---

## 5. Phasing

**Phase A — Fill the empties (first, unblocks the complaint).**
Author F1–F4 as canon sets (~48 assets total), token-painted, cost-checked. Zero pipeline changes. The four dead chips come alive.

**Phase B — Gradients in the Studio.**
Two-stop token gradient paint (ink→accent, ink→clear) in the motif kit. Small, contained, makes F2 reproducible by the user.

**Phase C — Freehand pen (the build-up workflow).**
Pointer-draw path tool in the Studio with smoothing + wobble. This is the feature Matt will actually feel — sketch-to-pool in 30 seconds.

**Phase D — Help + promotion path.**
Help copy for the paste-SVG rules; a "promote to canon" flow (even if it's just documented manual curation at first). Closes the loop on Door 2/3.

**Phase E (later, optional) — Glyph fragments + persona tie-in.**
F5 capped at 12; each of the three mode personas (Swarm/Hype/Murmuration) gets a curated asset subset drawn from the filled library — the voices get their own shelves.

Dependencies: B needs nothing from A (can parallel); C is independent; D is copy; E wants A done.

---

## 6. Guardrails — keeping it an instrument, not a stock bin

1. **Canon is authored and capped.** ~200 total. A new family needs a named voice and a TE justification, not a mood board.
2. **Token-paint contract is mandatory for canon.** Every canon asset responds to palette switches. Fixed-color art lives in the user overlay, clearly labeled as non-responsive.
3. **Cost budget per asset.** The 600-point ingest warning becomes a canon rule: anything over budget must earn it (and assetThin will shed it first — that's the honest deal).
4. **No bulk ingest into canon.** Bulk goes to the user overlay (capped at 32). Scarcity is the feature.
5. **Categories are closed.** Eleven is enough. New styles fill existing shelves; they don't get new shelves.
