# FX Layer Plan: Dither

*Planning only — parked under the scope freeze (2026-09-18). No implementation, no branch, no PR.*
*Reference inspiration: [DitherTone Pro](https://www.doronsupply.com/product/dithertone-pro) (Doron Supply, Photoshop UXP plugin).*
*Status: filed for Matt's later review. Does not ship until he commissions it.*

## What DitherTone Pro does (and why it's interesting here)

DitherTone Pro is a Photoshop plugin that re-renders artwork through mathematical dithering algorithms — 40+ of them (ordered Bayer matrices, halftone screens, error-diffusion styles). It crushes the image into a limited palette (up to 64 colors sampled from the image, or curated retro/pastel palettes) and rebuilds tones from dot/pattern density. Modes include Mono, Tonal, Indexed Color, and RGB. It also animates the dither across video frames (index animation / batch render) and handles print concerns (DPI-based scaling, halftone angles, color-separated output).

Why it matters for this instrument:

- It is a **texture system with a retro-print soul** — the same lo-fi register as our existing `grain`, `scanlines`, and `posterize` FX, but it does something none of them do: it *reduces and reorders* color rather than just adding noise or banding on top.
- It photographs well: dithered stills from the capture path would read instantly as "print aesthetic" — screenprint, zine, riso. That's a capture/export identity, not just a live gimmick.
- The animated-index idea is the Oxman answer: a *living* pattern, not a stamp. A static dither is a filter; a slowly cycling dither matrix on top of ACCUM trails is an organism.

Deliberate non-goals (TE constraints): we are not shipping 40+ algorithms, palette import tools, DPI scaling, or print separations. Those are design-tool concerns. The instrument gets a small, opinionated set — four to six patterns, one color discipline — because constraints are the aesthetic.

## Proposed layer: `dither`

### What the performer sees (plain language)

Turn it on and the image goes poster-print: smooth gradients break into visible dot or weave patterns, flat areas take on a fine woven texture, and colors flatten into a tight, punchy set — like a gig poster or an old game screen. At low strength it's a subtle film-print grain over the render; cranked, it's full risograph. If animation is on, the pattern breathes — dots shimmer and crawl slowly, so the dither feels alive on top of moving trails rather than stamped over a frozen frame.

### Where it sits in the FX chain

FX effects chain top-down per the frozen rule in `docs/GL_CONTRACT.md` (#185): the first effect reads the layer source, each later effect reads the previous effect's output. Dither belongs **late in the stack** — after `grain`/`scanlines`, after the GLOW/ACCUM composite:

- **After GLOW** is the point. Dithering the glow's bloom is what makes it read as print: the soft mip-bloom/stipple/chromatic glow gets re-cut into dots. Put dither before glow and the bloom would smear the pattern back into mush.
- **After grain/scanlines**: dither quantizes the noise too, which is the film-print look (grain becomes dot clusters instead of a separate overlay).
- On the **ACCUM path**: dither applies to the presented frame (post-`presentUpscaled`), at output resolution — never inside the half-res feedback pair (#309), or the pattern would inherit the feedback's softness and crawl with the resampling.

### Proposed controls

All live inside the existing FX layer panel for the layer (no new panels — the panel consolidation direction holds). Defaults aim for "tasteful at first touch."

| Control | Type | Range | Default | Notes |
|---|---|---|---|---|
| `pattern` | cycle | Bayer 2 / Bayer 4 / Bayer 8 / Halftone dots / Weave / Diffusion-lite | Bayer 4 | Curated six. Bayer 4 is the honest middle: visible but not chunky. Halftone dots nod to the print-desk path (#209). |
| `bitDepth` | slider | 1–8 | 4 | Colors per channel: 2^N. 1 = brutal two-tone poster; 8 = off-ish. |
| `strength` | slider | 0–1 | 0.6 | Mix between source and dithered. 0 = bypass (cheap no-op like audio silence is a no-op). |
| `animate` | toggle + `speed` slider | speed 0–1 | on, 0.25 | Cycles/scrolls the threshold matrix over time. Slow default — a crawl, not a flicker. |
| `colorMode` | cycle | Mono / Indexed / RGB | Indexed | Indexed = palette-quantized like DitherTone's core trick; Mono = luminance-only (pairs beautifully with high GLOW); RGB = per-channel dither, most faithful. |

Parameter discipline (from the TE cuts in #319): no per-parameter dice, no global blend dropdown interplay beyond the layer's own opacity. Five controls is the ceiling; anything more gets cut or demoted at review.

### Cost tier estimate

**Cheap tier.** One fullscreen fragment pass over the composited frame, one small static threshold texture (8×8 Bayer fits in a 64-texel LUT; halftone needs a tileable dot cell). No feedback, no extra FBO pair beyond the standard FX wrap cost (one FBO pair + one pass per wrap, per `docs/FX_LAYERS.md`). `animate` adds a time uniform — no extra cost. Bit-depth crush is ALU-cheap. The measured cost-tier harness (`src/gl/costTiers.selfcheck.mjs`) would confirm at implementation time; expected to land in the lowest declared band, well under the governor's attention.

### Interaction with GLOW / ACCUM (known design points)

- **GLOW (0–0.25 range, #317):** dither quantizes the bloom tail. At low glow the stipple/chromatic texture survives dithering as fine dot structure; at high glow the bloom flattens into larger dot fields. The two are complementary, not competing — glow is the light, dither is the paper.
- **ACCUM trails (#318, #238):** trails accumulate in the half-res feedback pair; dither reads the presented frame. Animated dither over long trails will shimmer along the trail direction — this is the effect's signature moment and also its biggest taste risk (see open questions). With `animate` off, trails dither statically and read as screenprint.
- **Audio ballistics (#320):** `strength` is a candidate for future audio modulation (hits push the dither harder), but that wiring is explicitly out of scope for the plan — noted here so it isn't invented later without Matt's word.
- **Determinism:** like all FX output, excluded from the determinism contract (pattern math is exact, but renderer/precision variance across GPUs is expected — same stance as `grain`/`displace`).

### Which part of the loop it serves

**Perform** (primary): a live performance texture — the riso/poster register is a stage look, and the animated pattern is a temporal system (Oxman's "alive in time"). **Capture** (secondary): dithered stills from the export path are the print-aesthetic identity — screenprint-style keeps from a live set. It does not serve learn or guide; it needs neither.

## Open questions for Matt's eyes

These are taste calls — the plan deliberately doesn't answer them:

1. **Pattern character:** is Bayer 4's weave the right default, or does Halftone dots feel more like the instrument? (DitherTone's own demo leads with a 6-color halftone.)
2. **Animation feel:** does the slow matrix crawl read as alive, or as a distracting shimmer on trails? This is the make-or-break visual judgment — a static stamp would violate the Oxman pillar, but a flickery one violates taste.
3. **Strength default:** 0.6 is a guess. The right default is "noticeable but not a costume."
4. **Mono vs Indexed default:** Mono + high GLOW is the dramatic look; Indexed is the honest DitherTone translation. Matt's eye decides.
5. **Does it earn its surface?** It adds five controls to an FX layer — under the freeze, every control must be missed by a performer to survive. If grain + posterize already cover the register, this gets cut.

## Scope-freeze status

**Parked. Planning only.** No code, no branch, no issue filed, no PR. When (if) Matt commissions it, the implementation order would be: GLSL pass in `app/src/gl/effects/` first (the shipped recipe), panel controls from `FX_EFFECT_DEFS`, then the `costTiers` declaration and a selfcheck mirroring the audioBallistics/dither probe pattern. It stays out of the repo until he says go.
