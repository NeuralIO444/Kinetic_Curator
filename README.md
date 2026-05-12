# Kinetic Curator

A generative art engine for the browser, designed primarily for producing **vector SVG output** for print, plotter, and further design work. Run the simulation, let parameters mutate, lock the ones you like, fine-tune the rest, and export a clean `.svg`. There's also a **LIVE mode** for audio/webcam-reactive performance — same engine, different surface.

Built with React 19, Zustand, PIXI.js, Tone.js, GSAP, and an AssemblyScript-compiled WASM kernel for the hot particle math.

![UI Overview](docs/ui_audit_1778535473448.webp)

## Quick start

Double-click **`run.command`** in Finder. The first run installs dependencies and compiles the WASM kernel; subsequent runs are instant. Your browser opens at `http://localhost:5173`.

To shut down, double-click **`stop.command`** (or press `Ctrl-C` in the terminal window that `run.command` opened).

From a terminal:

```bash
./run.command     # install + compile WASM if needed, then start dev server
./stop.command    # kill anything listening on port 5173
```

If `run.command` is blocked by macOS Gatekeeper, run it once from Terminal with `bash run.command` to grant trust.

## Manual setup

```bash
cd app
npm install        # install deps
npm run asbuild    # build assembly/particles.ts → public/particles.wasm
npm run dev        # vite dev server
npm run build      # production build (runs asbuild first)
npm test           # vitest engine tests
```

## The studio workflow

The default mode is **STUDIO** — optimized for making vector outputs:

1. **▶ MOTION** in the masthead makes the system feel alive — particles swarm, echo trails appear.
2. **▶ AUTO-EVOLVE** ticks layout parameters every 2.5s so you see variations stream by.
3. Mark a param with the **K** button (next to its 🔒 in the LAYOUT panel) to opt it *into* AUTO-EVOLVE. If no Ks are set, AUTO-EVOLVE shuffles everything that isn't locked. As soon as you mark even one K, AUTO-EVOLVE tightens to *only* the K-flagged params — the rest stay where you set them.
4. When you see a composition you like, press **■ STOP** (or `Space`) to **freeze** everything — evolve halts, particles stop, the tick rAF pauses. Tweak any slider freely without it being overwritten.
5. Click **↕ FIT** in the canvas header for a bigger canvas, or drag the cyan grip at the bottom to resize manually.
6. Click **↓ SVG (VECTOR)** in the OUTPUT panel to download the current frame as a `.svg` file. Open it in Illustrator / Inkscape / a pen plotter, edit further, print.

The same Run / Freeze loop drives **LIVE** mode for performance work, just with audio + webcam + WebM recording surfaced. Flip via the `○ STUDIO / ◉ LIVE` button in the masthead.

## What it does

Kinetic Curator is a synthesis engine for static and motion compositions. You don't paint — you parameterise. Twelve placement algorithms (grid, fibonacci, radial, swarm, flow, layers, rails, cellular automata, orbit, abacus, …) project the active SVG asset library onto the canvas. Effects compose on top: blends, echo, trails, particles in three motion modes, click-targeted blast, recursive WebGL feedback, color harmony rotations. Layers freeze and stack compositions for collage workflows. Audio and webcam can drive evolution.

**📖 New here? Start with [docs/HELP.md](docs/HELP.md) — the complete feature walkthrough, recipe book, and troubleshooting guide.**

## Feature matrix

| Area | Capability |
|---|---|
| **Modes** | STUDIO (default, SVG-output focus) · LIVE (audio/webcam reactive performance) — toggle in masthead |
| **Placement** | 12 algorithms; per-parameter 🔒 lock, K kinetic flag, 🎲 dice; preset library; mode tiles |
| **Renderers** | SVG (default, canonical for vector export) + WebGL (PIXI.js, lazy-loaded preview) |
| **Effects** | Blends · Echo · Trails · Particles + motion (flow/swarm/orbit) · Blast (alt-click) · Recursive feedback (WebGL) · Color harmony |
| **Layers** | Stamp current composition into a stacked layer; edit any layer in place; per-layer opacity & blend mode; reorder + rename |
| **Reactivity (LIVE mode)** | Live mic + audio file via Tone.js (bass/mid/treble + beat detection); webcam motion energy; alt-click blast |
| **Auto-Evolve** | Time / beat / motion driven autopilot. Per-param **K** flags scope which params get randomized |
| **Keyframes (LIVE mode)** | ▶ PLAY KEYFRAMES tweens between favorites |
| **Export** | **↓ SVG (vector)** · ↓ PNG snapshot (up to 8K) · WebM recording (LIVE mode) · Full-state JSON preset import/export |
| **Pause** | Space / ■ STOP truly freezes — evolve halts, motion stops, sliders editable without overwrite |
| **Perf** | PIXI sprite batching · WASM particle kernel · Vendor code-splitting · `P` perf mode caps heavy effects |

## Hotkeys

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `S` | PNG snapshot |
| `F` | Favorite current state |
| `E` | Toggle evolve mode |
| `N` | New random seed |
| `P` | Toggle perf mode (caps particles, disables echo/trails) |
| `f` | Toggle fullscreen |
| `Cmd/Ctrl-Z` | Undo |
| `Cmd/Ctrl-Shift-Z` | Redo |
| `?` | Toggle hotkey overlay |
| `Alt-click` | Trigger blast at cursor (when Blast effect is enabled) |
| Mouse wheel | Zoom canvas |
| Click + drag | Pan canvas |

## Architecture

- **Entry:** [app/src/App.jsx](app/src/App.jsx) — composes the panels and runs the global rAF loops (FPS monitor, keyframe playback, evolve).
- **State:** Single Zustand store split into slices — audio, layout, global, davis, export, effect, layer, webcam ([app/src/state/store.js](app/src/state/store.js)). Actions in [actions.js](app/src/state/actions.js) route through a thin dispatch switch in [AppContext.jsx](app/src/state/AppContext.jsx).
- **Engine (pure, no React):**
  - [placement.js](app/src/engine/placement.js) — layout math for every mode
  - [color.js](app/src/engine/color.js) — palette selection + HSL harmony rotations
  - [effects.js](app/src/engine/effects.js) — the effect pipeline; particles use WASM when available
  - [compose.js](app/src/engine/compose.js) — single source of truth that turns a state snapshot into renderable items (used by live canvas + every frozen layer + keyframe interpolator)
  - [interpolate.js](app/src/engine/interpolate.js) — keyframe tweening between favorites
  - [pixi-renderer.js](app/src/engine/pixi-renderer.js) — PIXI v8 renderer with sprite pooling, layer Container map, RenderTexture feedback ping-pong, shared circle texture for batched particles
  - [wasm-particles.js](app/src/engine/wasm-particles.js) — WASM kernel loader + JS fallback
  - [assembly/particles.ts](app/assembly/particles.ts) — AssemblyScript source for the particle compute kernel
- **Panels:** P01 Canvas · P02 Asset Pool · P04 Layout · P05 Output · P06 Stimulus · P07 Davis / Effects · P08 Layers ([app/src/panels/](app/src/panels/))
- **Hooks:** audio analysis ([useAudioInput.js](app/src/hooks/useAudioInput.js)) · webcam motion ([useWebcam.js](app/src/hooks/useWebcam.js)) · video recording ([useMediaExport.js](app/src/hooks/useMediaExport.js))

For the design philosophy see [docs/manifesto.md](docs/manifesto.md). For the build roadmap and what each item shipped, [docs/enhancement_roadmap.md](docs/enhancement_roadmap.md).

## Tests

```bash
npm test
```

30 unit tests covering color (hue rotation, harmony, placement coloring, SVG var substitution), placement (count, determinism, bounds), interpolate (lerp, midpoint switching), and effects (particle determinism, blast radius, echo). ~150ms.

## License

MIT — see [LICENSE](LICENSE).
