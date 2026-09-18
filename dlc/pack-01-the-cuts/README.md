# Pack 01 — The Cuts

The 13 presets removed from the live browser under issue #311 (preset curation:
25 → 12). Preserved here as data only, so they can return later as a DLC-style
module pack rather than living as clutter in the current instrument.

## What's inside

- `presets.json` — the 13 cut presets, extracted verbatim from
  `app/src/data/presets.js` on the main branch at the time of extraction.
  Each entry matches the `COMPOSITION_PRESETS` schema exactly
  (`id`, `name`, `group`, `desc`, `categories`, `paletteShift`, `params`),
  so a future loader can drop them back in without translation.

The cut presets:

- DRIP FIELD · HALFTIME GLITCH · EYE ARCHIPELAGO · MEINESZ BLOOM · KNOT GRID
- BITSHIFTER CHAOS · CA GROWTH · ORBIT OF INFLUENCE · FIRST CONTACT ON EUROPA
- CONAMARA CHAOS · KILN COLUMNS · VORTEX RWB · TIDEPOOL

Palettes with matching ids were intentionally **not** moved — palettes are
independent modules in `app/src/data/palettes.js` and stay in the app.

## The earn-back rule

Nothing here returns to the live browser unless one of these is true:

1. A performer reaches for it mid-set and it's missing, or
2. Matt's eyes miss it on the demo.

First in line for earn-back: **KILN COLUMNS**.

## Status

Data only. This directory is not imported, referenced, or wired into any app
code — verified by the fact that nothing outside `dlc/` points at it. Treat
it as a future module pack, not current UI.

See: https://github.com/NeuralIO444/Kinetic_Curator/issues/311
