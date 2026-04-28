# Kinetic Curator Sketch

A generative art engine inspired by Joshua Davis and the HYPE framework, featuring Rendah Mag aesthetic integration. Includes both a Processing native runtime and a browser-based React UI with real-time composition control.

## Structure

### Processing Runtime
- `KineticCuratorSketch/KineticCurator.pde` - main sketch and runtime control
- `KineticCuratorSketch/AssetPool.pde` - loads SVG assets from the `data` folder
- `KineticCuratorSketch/InputRouter.pde` - blends webcam and optional audio stimulus
- `KineticCuratorSketch/AudioRouter.pde` - FFT beat detection and frequency analysis (optional)
- `KineticCuratorSketch/LayoutManager.pde` - arranges assets using composition presets

### Browser UI
- `KineticCuratorUI/KineticCurator.html` - entry point
- `KineticCuratorUI/app.jsx` - main app, Davis-mode (auto-evolve, favorites, hotkeys), snapshot/sidecar export
- `KineticCuratorUI/ui-canvas.jsx` - live canvas preview, composition logic, CA mode, slow-render
- `KineticCuratorUI/ui-controls.jsx` - layout parameter controls, preset selector, input router
- `KineticCuratorUI/ui-pool.jsx` - asset library and category filters
- `KineticCuratorUI/ui-shell.jsx` - master bar, panel chrome, collapsible panel header
- `KineticCuratorUI/audio-input.jsx` - Web Audio API microphone input (RMS, bass/mid/treble, beat onset)
- `KineticCuratorUI/webcam-input.jsx` - getUserMedia webcam motion analysis
- `KineticCuratorUI/ca-engine.jsx` - cellular automaton + bitwise color mutations
- `KineticCuratorUI/styles.css` - UI styling

## Composition Presets (13 Total)

### Classic Presets (Joshua Davis style)
- **PRAYSTATION** - dense bloom of glyphs and color bursts
- **DRIP FIELD** - linework + drops with wild spread
- **EYE ARCHIPELAGO** - radial anchors with clustered organic glyphs
- **KNOT GRID** - tight grid clusters with offset traps

### Rendah Mag Integration (Artist-Inspired)
- **FUJIMOTO PRISM** - kinetic laser scan aesthetic (Shohei Fujimoto)
- **MEINESZ BLOOM** - bio-synthetic growth with flowing color (Lisa Meinesz)
- **HALFTIME GLITCH** - fragmented bass aesthetic with split tones (Rendah Mag DNB)

### Cellular Automaton Presets
- **BITSHIFTER CHAOS** - cellular automaton + bitwise color mutations, motion-driven
- **CA GROWTH** - life-like cellular automaton, emergent organic patterns

### Davis-Lineage Presets
- **ORBIT OF INFLUENCE** - 3 invisible planets (S/M/L), 50 painters orbit at varied speeds and brush sizes, painting trails around their orbit (Joshua Davis · fxhash · Proof of People · ZeroSpace NYC 2023)
- **GHOST RECOIL ABACUS TOTEM** - abacus rows (varied count + slide per row) with ghost-recoil duplicates trailing each bead; per-row z-tiering for the totem stack (Chuck Anderson × Joshua Davis, *Infinite Pressure* #80; audio Ben Lukas Boysen)
- **CONAMARA CHAOS** - flow-mode landscape, high jitter, banded palette — post-terrestrial moving landscape (Joshua Davis × macro-analog textures by Jana Stýblová × audio KØWCH)
- **FIRST CONTACT ON EUROPA** - dense orbital field, banded palette, crystalline + radial bias — Europa-scale exploration (Joshua Davis × Jana Stýblová × KØWCH)

Each preset includes tuned parameters for count, scale, rotation, density, and palette shift strategy.

## Layout Modes

`random`, `grid`, `fibonacci`, `radial`, `swarm·hype`, `flow`, `layers`, `rails`, `cellular` (CA), `orbit` (3 invisible planets, 50 painters), `abacus` (stacked bead rows with ghost-recoil duplicates).

## Export resolutions

The OUTPUT panel rasterizes the live SVG to any picked size. Built-in options:
`1080×1080`, `1920×1080`, `2160×2700`, `3000×3000`, **`7200×10800`** (300 DPI 24"×36" print — matches the high-res still deliverable used in pieces like *Infinite Pressure* and *Conamara Chaos*).
Filenames embed the export size for traceability.

## Asset Categories

### Core Categories (7)
`organic`, `radial`, `geometric`, `linework`, `dots`, `stamps`, `floral`

### Experimental Categories (Rendah Mag Aesthetic)
`crystalline`, `biosynthetic`, `fragments`, `scanlines`

See [ASSET_CATEGORIES.md](ASSET_CATEGORIES.md) for full documentation.

## Setup

### Processing Runtime
1. Open Processing 4 on macOS.
2. Create a sketch named `KineticCuratorSketch` and add the files from `KineticCuratorSketch/`.
3. Place your SVG files into the `data` folder next to the sketch.
4. Install the HYPE library inside Processing.
5. *(Optional)* Set `enableAudio = true` in `KineticCurator.pde` to enable audio stimulus.

### Browser UI
1. Serve the repository locally: `python3 -m http.server 8000` (from repo root)
2. Open `http://localhost:8000/KineticCuratorUI/KineticCurator.html` in a modern browser
3. Select assets, adjust parameters, and toggle audio input (requires microphone permission)

## Features

### Input Stimuli (live)
- **Webcam** - frame-to-frame brightness delta → motion energy (smoothed over 10 frames)
- **Audio** - Web Audio API: per-band RMS (bass / mid / treble), overall RMS energy, bass-spike beat detection
- Both feed `motionEnergy` + `beatPulse` into the layout (count multiplier and per-placement scale throb on beat)

### Layout Control
- 9 composition presets with artist attribution
- 9 layout modes including a Conway-style cellular automaton
- Per-parameter range sliders: count, scale, rotation, alpha, z-tier, jitter, density
- Recoloring modes: static, band, zone, split
- Bitwise color mutation in CA mode (XOR + rotate per cell)

### Davis Mode (P07)
The Davis-style "let it run, save what hits" workflow:
- **EVOLVE** — auto-bumps the seed on a timer (0.3–8s) or on each detected audio beat
- **SLOW** — contemplative ~2 fps render so you can watch
- **★ FAV** — capture the current `{seed, palette, layout}` without rendering an image; recall any favorite later with `↺`
- **Snapshot** — saves PNG plus a sidecar `*.json` containing `{seed, palette, layout, routes, enabledAssets, stimulus, evolve}`. Filenames embed palette/composition/seed so any frame can be re-rolled.

### Output
- Real-time SVG canvas preview in browser, every frame is reproducible from `seed + config`
- PNG export with sidecar JSON; PDF export emits JSON for offline render
- Snapshot history strip with seed + timestamp
- Processing runtime: PDF snapshot via `s` key

## Controls

### Processing
- Press `s` to save a high-resolution PDF snapshot of the current frame.

### Browser UI — hotkeys
- `s` — snapshot (PNG + sidecar JSON)
- `f` — favorite current seed (no image)
- `e` — toggle EVOLVE
- `space` — run / pause

### Browser UI — panels
- **P01 KINETIC_CURATOR** — canvas preview, COMPACT/TALL toggle, live `stim` and `EVOLVE` indicators
- **P02 ASSET_POOL** — filter, search, enable/disable visible, GRID/LIST view
- **P03 INPUT_ROUTER** — webcam.motion → params (count, scale, rotate, …) with per-route gain
- **P04 LAYOUT_MANAGER** — composition presets, mode tiles, transform sliders, toggles
- **P05 OUTPUT** — PNG / PDF / CONFIG.json export, snapshot history (default-collapsed)
- **P06 STIMULUS.in** — VIDEO/AUDIO toggles + live meters (motion, RMS, bass, mid, treble, beat)
- **P07 DAVIS_MODE** — EVOLVE / SLOW / source (TIME/BEAT) / interval / favorites list
- Every panel header is clickable to collapse / expand

## Notes

- The sketch uses `P3D` for GPU acceleration.
- The `AssetPool` scans `data` for `.svg` assets and falls back to placeholder geometry if none are found.
- Audio stimulus requires Minim library in Processing (optional).
- Browser audio requires HTTPS or localhost; desktop browsers may require permission.
- Presets can be extended by adding entries to `COMPOSITION_PRESETS` in `ui-controls.jsx` and `ui-canvas.jsx`.

## Git History

This repository merges the remote `NeuralIO444/Kinetic_Curator` history with local development, including:
- Joshua Davis-style composition presets (commit 8032178)
- Rendah Mag aesthetic integration with 3 new presets, expanded asset categories, and audio support (commit 357cbb2)
- Davis-mode, cellular-automaton mode, live audio/video stimulus pipeline, collapsible panel layout, snapshot sidecar JSON
