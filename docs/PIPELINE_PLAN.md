# Pipeline Plan

*Project setup and live output for the OUTPUT tab. The canvas gets a size;
the signal gets a stage.*

## Why

The Pipeline tab already thinks in sections — IN / PROCESS / OUT. But the
canvas is 1000×700 with no say in the matter, and the live signal has nowhere
to go. This plan adds two sections: SETUP (the canvas gets a size) and STAGE
(the signal gets a stage). Every VJ reference app — Resolume, TouchDesigner,
MadMapper, VDMX — separates composition/canvas size from physical output
routing. KC does the same.

## Sections (top to bottom)

1. **SETUP** (new) — canvas dimensions, presets, frame rate, color space.
2. **IN** — existing, untouched (recipe in, data import).
3. **PROCESS** — existing, untouched (render final, print desk).
4. **OUT** — existing, untouched (files: batch, snap, loop capture, gallery).
5. **STAGE** (new) — live output: fullscreen display, Syphon.

STAGE is deliberately not called OUTPUT — the panel is the output tab, and
the existing OUT section means files. STAGE is VJ language for the signal
leaving the building.

## SETUP contents

- **Preset picker**, grouped: VJ / Social / OOH templates / My Presets.
  HD 1920×1080 preselected.
- **W×H numeric fields** + aspect lock + orientation swap. Always visible,
  always editable.
- **Preset manager**: "Save current as preset" → My Presets, with rename and
  delete. Built-ins are locked.
- **Frame rate**: 24 / 25 / 30 / 50 / 60, default 60, plus "Sync to display"
  (canvas follows the display refresh, VDMX-style).
- **Color space**: sRGB (default) / Rec.709 / Display P3 (advanced).
- **GPU cost readout**: canvas × fps mapped onto the governor's cost tiers —
  the performer sees the price of 4K60 before paying it.
- **LED raster calculator**: cabinets W × cabinets H × cabinet pixels →
  computes the native raster and writes it into W×H. There is no standard LED
  resolution; the calculator matters more than any single preset.

### Preset lists

**VJ** — HD 1920×1080 (default) · 1280×720 fallback · UHD 3840×2160 ·
Ultrawide 2560×1080 · Ultrawide QHD 3440×1440 · Triple-HD stage 5760×1080
(3-projector canvas) · Portrait HD 1080×1920.

**Social** — Reel/Story/TikTok/Short 1080×1920 · IG Portrait 1080×1350 ·
IG Tall 1080×1440 · IG Square 1080×1080 · IG Landscape 1080×566 ·
YouTube HD 1920×1080.

**OOH templates** — every one source-labeled, none presented as universal:
Digital Bulletin 1400×400 (Lamar autoscale template) · DOOH Full HD
1920×1080 (JCDecaux digital network) · Digital Billboard 1260×720 (JCDecaux,
aspect-locked) · Times Square-class spectacular 10048×2368 (1535 Broadway,
example only).

## STAGE contents

- **Mode**: Preview only (default) / Fullscreen display / Syphon out.
- **Fullscreen display**: display selector (name, native raster, refresh rate)
  → "Match display" button → Fit / Fill / 1:1 mapping → blackout toggle →
  test pattern.
- **Syphon output**: server name, on/off. The Mac-standard VJ interop path —
  feeds Resolume, MadMapper, OBS from KC.
- **HDMI is a cable, not a toggle.** It never appears as an output option;
  the fullscreen display selector is the HDMI path.
- **NDI is parked** until a perf-tested case earns it a toggle.

## Defaults

1920×1080, 60 fps, sRGB, Preview only.

## Engine realities (read before building)

1. **Custom dimensions are engine work, not panel UI.** The canvas is
   1000×700 baked into the scene contract, atlas, accum buffers, and export
   paths. A dimensions UI that doesn't move the canvas is a lie — engine work
   and UI land together.
2. **Authored size vs. actual render size must both be visible.** The governor
   already scales resolution dynamically under load; if 4K is authored and
   1080p renders to hold 60fps, the performer sees both numbers.
3. **Color space needs a spike before design.** P3 Mac display vs. sRGB
   pipeline vs. the ACES resolve (#532) — don't lay out what can't be
   defined. Spike rides in Phase A.
4. **Define what fps controls.** Live cap vs. capture timestep are two
   different settings wearing one label. For OOH the file's fps matters;
   live, the display sets the rate.

## Build order

- **Phase A** — variable canvas through the engine (scene contract, atlas,
  accum, export paths) + SETUP section UI. Color-space spike first.
- **Phase B** — STAGE: fullscreen stage window (Tauri second window), display
  picker, blackout, test pattern.
- **Phase C** — STAGE: Syphon output.
- **Parked** — NDI, color management beyond the selector.

## Scope note

This stretches the scope lock: it is new surface, not polish. The call is
that the OUTPUT tab grows its proper setup rather than gaining a new
feature. Recorded here so it's a conscious decision, not drift.

## Build record

Tracked per-phase in open issues (A/B/C). Rules that hold across all of it:
one fix per PR; canvas/fps/color changes re-run affected selfchecks (atlas,
accum, export, governor tiers); no silent fallbacks — an unsupported display
or color path says so out loud; `Closes #N` lines; Matt merges.
