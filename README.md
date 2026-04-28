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
- `KineticCuratorUI/app.jsx` - main app component and state management
- `KineticCuratorUI/ui-canvas.jsx` - live canvas preview with composition logic
- `KineticCuratorUI/ui-controls.jsx` - layout parameter controls and preset selector
- `KineticCuratorUI/ui-pool.jsx` - asset library and category filters
- `KineticCuratorUI/audio-input.jsx` - Web Audio API microphone input
- `KineticCuratorUI/styles.css` - UI styling

## Composition Presets (7 Total)

### Classic Presets (Joshua Davis style)
- **PRAYSTATION** - dense bloom of glyphs and color bursts
- **DRIP FIELD** - linework + drops with wild spread
- **EYE ARCHIPELAGO** - radial anchors with clustered organic glyphs
- **KNOT GRID** - tight grid clusters with offset traps

### Rendah Mag Integration (Artist-Inspired)
- **FUJIMOTO PRISM** - kinetic laser scan aesthetic (Shohei Fujimoto)
- **MEINESZ BLOOM** - bio-synthetic growth with flowing color (Lisa Meinesz)
- **HALFTIME GLITCH** - fragmented bass aesthetic with split tones (Rendah Mag DNB)

Each preset includes tuned parameters for count, scale, rotation, density, and palette shift strategy.

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

### Input Stimuli
- **Webcam** - brightness-based stimulus from live video feed
- **Audio** (optional) - FFT beat detection and frequency analysis via Web Audio API
- Blend ratio configurable via `audioWeight` parameter

### Layout Control
- Composition preset selector with artist attribution
- Real-time parameter adjustment: count, scale, rotation, jitter, density
- Recoloring modes: static, band, zone, split
- Layout modes: fibonacci, swarm, radial, grid

### Output
- Real-time canvas preview in browser
- PDF snapshot export from Processing (`s` key)
- Seed-based reproducibility for compositions

## Controls

### Processing
- Press `s` to save a high-resolution PDF snapshot of the current frame.

### Browser UI
- Adjust parameters in the right panel
- Toggle preset buttons to apply full composition
- Enable 🎙️ audio button to activate microphone stimulus
- Search and filter assets by category
- Toggle asset visibility to customize the composition

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
