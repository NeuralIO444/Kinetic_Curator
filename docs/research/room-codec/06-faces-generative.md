# 06 — Faces: Two Generative Dither Systems

Status: design APPROVED 2026-10-14 (frozen mockup is the static proof). Matt's refinement locked same day: **color, animated, lightweight, fully generative — per state and vibe.**

## One pipeline, two sources (Matt: "different, but renders the same")
Each face = a live grayscale/color **source render** → one shared **dither stage** → the KC-1 palette discipline. The sources differ; the treatment unifies them.

## Davis — Bayer dot dither, in color
- Source: his kaleidoscope/rosette render, carrying his real colors.
- Dither: **ordered Bayer** into the palette ramp. (Error-diffusion/Floyd–Steinberg rejected: it shimmers frame-to-frame — breaks the stillness law and costs more.)
- Motion: the rosette slowly turns and breathes; state changes re-parameterize it (petal count, ring density, spin direction). The dither stays stable while the source moves.

## LOIS — glyph dither
- Source: her state face (typographic marks today; a shaded face construction in the build).
- Dither: cells shaded by **character weight** — sparse light glyphs in the lights, dense heavy glyphs in the darks; features (eye-slits, mouth) read as gaps and concentrations of type.
- Expression re-generates per state: eye angle, mouth, glyph set, tint (her red enters here, per color law — red = structure/verdict).

## Shared rules
- **Tier = resolution.** Low engagement: coarse matrix, chunky faces. High tier: finer matrix, more detail resolves. Detail is earned data, not a setting.
- **State = parameters.** Every (persona, state) pair has a face parameter set; state changes **animate** as transitions between sets, then settle to ambient breath.
- **Vibe modulation:** zodiac/moon/season (Mind law) bend contrast and warmth.
- **Perf:** two tiny fixed-size canvases; updates on state change + slow ambient motion only. iPad-class budget respected.
- **Reduced motion:** faces settle to a still dither; nothing animates.
- **No assets, no AI imagery, no network.** Apple Intelligence is text-only — it enriches lines, never faces.

## Open for iteration
- Are faces ever audio-reactive (micro-motion from the bands), or state-only? (See `08`.)
- Glyph set per LOIS state — how far the character vocabulary stretches before it stops reading as her.
