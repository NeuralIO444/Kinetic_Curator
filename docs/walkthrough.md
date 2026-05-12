# Bundle 0 — Foundation Refactor · Walkthrough

## What Changed

Migrated Kinetic Curator's browser UI from a **monolithic in-browser Babel setup** (6 large `.jsx` files attached to `window`) to a **Vite + ES modules** architecture with centralized state management.

### Before → After

| Aspect | Before | After |
|--------|--------|-------|
| Build | In-browser Babel (~300KB parser) | Vite (build in 362ms) |
| Modules | `window.ASSETS_PART1 = …` | `export const ASSETS_PART1 = …` |
| State | 30+ `useState` calls in `App` | Single `useReducer` + React Context |
| Props | 20+ props drilled to panels | `useApp()` hook from any component |
| Presets | Duplicated in 2 files | Single source in `data/presets.js` |
| Categories | 7 of 11 listed | All 11 (core + experimental) |
| Hotkeys | Stale closure bug (B1) | `useHotkeys` with refs — always current |
| CSS | 1 file, 825 lines | 6 files, each ≤161 lines |
| Largest file | `app.jsx` at 594 lines | `presets.js` at 195 lines (data) |

### File Structure (34 new files)

```
app/src/
├── main.jsx              (14 lines — entry point)
├── App.jsx               (73 lines — layout shell)
├── data/
│   ├── presets.js         (195 lines — 13 presets, grouped)
│   ├── palettes.js        (46 lines)
│   ├── categories.js      (14 lines — all 11 categories)
│   ├── layout-modes.js    (36 lines)
│   └── assets/
│       ├── index.js
│       ├── assets-organic-geo.js
│       ├── assets-line-floral.js
│       └── assets-stamp-radial.js
├── engine/
│   ├── prng.js            (11 lines)
│   ├── placement.js       (151 lines — all 11 layout modes)
│   ├── color.js           (52 lines)
│   └── ca-engine.js       (84 lines)
├── state/
│   ├── actions.js         (52 action types)
│   ├── reducer.js         (163 lines)
│   └── AppContext.jsx     (32 lines)
├── hooks/
│   ├── useCollapse.js     (9 lines)
│   └── useHotkeys.js      (25 lines)
├── components/
│   ├── MasterBar.jsx      (60 lines)
│   ├── PanelHeader.jsx    (26 lines)
│   └── RangeRow.jsx       (34 lines)
├── panels/
│   ├── CanvasPanel.jsx    (90 lines)
│   ├── AssetPoolPanel.jsx (90 lines)
│   ├── LayoutPanel.jsx    (99 lines)
│   ├── OutputPanel.jsx    (70 lines)
│   ├── StimulusPanel.jsx  (59 lines)
│   └── DavisPanel.jsx     (78 lines)
└── styles/
    ├── tokens.css         (36 lines)
    ├── layout.css         (102 lines)
    ├── panels.css         (161 lines)
    ├── controls.css       (37 lines)
    ├── canvas.css         (28 lines)
    └── pool.css           (73 lines)
```

## Bugs Fixed

| Bug | Fix |
|-----|-----|
| **B1** — Stale closure in hotkey handler | `useHotkeys` hook stores keyMap in a ref, updated every render — handlers always see current state |
| **B3** — Duplicated `COMPOSITION_PRESETS` | Single source in `data/presets.js`, imported by both canvas and layout panels |
| **B4** — Missing experimental categories | `data/categories.js` exports all 11: 7 core + 4 experimental |
| **B5** — Density slider max was 100 | Changed to `max={120}` in LayoutPanel |
| **B8** — Dead code in downloadSVG | Not carried over to new codebase |

## Verification

- ✅ `npm run build` — 362ms, 0 errors, 47 modules, ~270KB JS (gzip: 78KB)
- ✅ `npm run dev` — Vite serves at localhost:5173
- ✅ All 13 presets render grouped by category
- ✅ All 137 assets load, all 11 category filter chips visible
- ✅ Canvas renders fibonacci layout with palette colors
- ✅ Layout sliders, mode tiles, and toggles all functional
- ✅ Output panel shows snapshot/export buttons
- ✅ Stimulus + Davis panels collapse/expand correctly

![Verified UI rendering](file:///Users/mattciaglia/.gemini/antigravity/brain/dc608ad4-f544-4b76-863b-3a06c6510287/.system_generated/click_feedback/click_feedback_1778537891938.png)

## What's Next

The original `KineticCuratorUI/` directory is preserved — no files were deleted. The new `app/` directory is the Vite-based replacement. Once verified, the old directory can be archived.

**Next bundles available:**
- **Bundle 2** — Undo & History (Cmd+Z)
- **Bundle 3** — Parameter Exploration (pin/lock)

---

# Bundle 1 — Stability & Hotkeys · Walkthrough

## What Changed

Added protective infrastructure (error boundary, audio lifecycle) and a user-facing hotkey cheat sheet.

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `components/ErrorBoundary.jsx` | 36 | Catches render crashes in CanvasPanel, shows recovery UI |
| `components/HotkeyOverlay.jsx` | 44 | Press `?` for keyboard shortcut reference card |
| `hooks/useAudioInput.js` | 94 | Web Audio API analysis with proper rAF lifecycle (fixes B7) |

### Wiring Changes

| File | Change |
|------|--------|
| `App.jsx` | Wraps `<CanvasPanel>` in `<ErrorBoundary>`, adds `<HotkeyOverlay>`, wires `useAudioInput` to dispatch |
| `styles/panels.css` | Added error boundary + hotkey overlay styles |

## Bugs Fixed

| Bug | Fix |
|-----|-----|
| **B7** — Extra rAF after teardown | `useAudioInput` checks `runningRef` BEFORE scheduling next frame + cancels on cleanup |
| **B9** — `dangerouslySetInnerHTML` crash | `<ErrorBoundary>` catches render errors, shows retry UI instead of white screen |

## New Feature

| Feature | Description |
|---------|-------------|
| **U21** — Hotkey cheat sheet | Press `?` to toggle a modal overlay listing all keyboard shortcuts |

## Verification

- ✅ `npm run build` — 115ms, 50 modules, 0 errors
- ✅ Canvas renders correctly on fibonacci, grid, radial, orbit modes
- ✅ Audio input wired to stimulus meters via dispatch
- ✅ S key creates snapshots (verified: 2 snapshots appeared in Output panel)
- ✅ Preset switching works across all 4 groups

---

# Bundle 2 — Undo & History · Walkthrough

## What Changed

Added a 20-step undo/redo stack, visual depth indicators, and double-click-to-reset on sliders.

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `state/history.js` | 82 | Wraps any reducer with undo/redo. Skips high-frequency actions (FPS, audio). Clears redo on new action. |

### Modified Files

| File | Change |
|------|--------|
| `state/AppContext.jsx` | Swapped `useReducer` → `useHistory`, exposes `history` via context |
| `App.jsx` | Added `Cmd+Z` / `Cmd+Shift+Z` hotkey handlers |
| `components/MasterBar.jsx` | Added ↶/↷ undo/redo buttons with depth counters |
| `components/RangeRow.jsx` | Double-click slider or label to reset to preset default (U7) |
| `components/HotkeyOverlay.jsx` | Added ⌘Z / ⌘⇧Z to shortcut list |
| `panels/LayoutPanel.jsx` | Passes `defaultValue`/`defaultLow`/`defaultHigh` to all sliders |
| `styles/layout.css` | Added `.undo-group` and `.undo-btn` styles |

## Features Added

| Feature | Description |
|---------|-------------|
| **Undo** | ⌘Z or click ↶ button. 20-step linear history. |
| **Redo** | ⌘⇧Z or click ↷ button. Clears on new action. |
| **Depth indicator** | ↶ button shows count (e.g., "↶ 3") when stack has entries |
| **Double-click reset** | Double-click any slider label or thumb to reset to preset default (U7) |
| **Skip ephemeral** | FPS, audio stimulus, beat pulse changes don't pollute undo stack |

## Verification

- ✅ `npm run build` — 116ms, 51 modules, 0 errors
- ✅ Undo button shows depth counter (verified: ↶ 1 → ↶ 2 on preset changes)
- ✅ Clicking ↶ reverts to previous preset (DRIP FIELD → PRAYSTATION)
- ✅ Redo button appears after undo (↷ 1)
- ✅ Buttons disabled (dimmed) when stack is empty

---

# Bundle 3 — Parameter Exploration · Walkthrough

## What Changed

Added robust parameter exploration controls: locking specific parameters, randomizing individual parameters, global randomization of unlocked parameters, and click-to-type precision editing.

### Modified Files

| File | Change |
|------|--------|
| `state/actions.js` | Added `TOGGLE_PARAM_LOCK`, `RANDOMIZE_PARAM`, `RANDOMIZE_UNLOCKED` actions |
| `state/reducer.js` | Added `lockedParams` to initial state; added randomization helper logic |
| `components/RangeRow.jsx` | Full rewrite: added lock 🔒 icon, dice 🎲 button, and `range-edit` input on click |
| `panels/LayoutPanel.jsx` | Wired new `RangeRow` props; added "RANDOMIZE UNLOCKED" bar; added badge indicators |
| `styles/controls.css` | Added CSS for locks, dice, editable readouts, and badges |

## Features Added

| Feature | Description |
|---------|-------------|
| **Parameter Locks** | Click 🔓 to lock a parameter (🔒). Prevents changes from presets, randomization, or evolve mode. |
| **Dice Randomize** | Click 🎲 next to any slider to instantly randomize just that parameter. |
| **Global Randomize** | "🎲 RANDOMIZE UNLOCKED" button reshuffles all parameters that aren't locked. |
| **Click-to-Type** | Click any numerical readout to type an exact value. Supports `Escape` to cancel and `Enter` to commit. |
| **Status Badges** | Layout panel header shows `🔒 X` when parameters are locked, and `⚡ X drifted` when current settings differ from the base preset. |

## Verification

- ✅ `npm run build` — 111ms, 51 modules, 0 errors
- ✅ Lock button state persists and prevents slider changes.
- ✅ "Randomize Unlocked" correctly ignores locked parameters.
- ✅ Click-to-type input properly commits values on Enter/Blur and respects min/max boundaries.
- ✅ All features verified visually in browser via QA subagent.

---

# Bundle 4 — Preset & Layout Polish · Walkthrough

## What Changed

Focused on progressive disclosure and visual hierarchy to make the UI less overwhelming and easier to navigate on load.

### Modified Files

| File | Change |
|------|--------|
| `panels/AssetPoolPanel.jsx` | Set `useCollapse(false)` so it's closed by default |
| `panels/OutputPanel.jsx` | Set `useCollapse(false)` so it's closed by default |
| `panels/StimulusPanel.jsx` | Confirmed closed by default |
| `panels/DavisPanel.jsx` | Confirmed closed by default |
| `panels/LayoutPanel.jsx` | Added CSS classes for preset groups |
| `styles/panels.css` | Added `preset-groups`, `preset-group`, `preset-group-label` with top borders |
| `panels/CanvasPanel.jsx` | Added `canvasHeight` state and pointer event drag-resize handlers |
| `styles/canvas.css` | Removed fixed pixel heights; added `.canvas-resize-handle` styles |

## Features Added

| Feature | Description |
|---------|-------------|
| **Progressive Disclosure** | On load, only the main Canvas (P01) and Layout (P04) panels are open. All others are collapsed. |
| **Preset Separators** | Preset categories (Classic, Rendah, CA, Davis) now have distinct top-borders and grouped labels. |
| **Canvas Resizing** | Grab the faint handle at the bottom of the canvas to freely drag and scale the preview area up and down. |

## Verification

- ✅ `npm run build` — 116ms, 51 modules, 0 errors
- ✅ Browser subagent confirmed P02, P05, P06, and P07 are collapsed by default.
- ✅ Browser subagent confirmed preset groups have top separator lines.
- ✅ Browser subagent successfully dragged the canvas bottom handle and verified height increased.
- ✅ Video recording attached below showing UI interactions.

![Bundle 4 Testing](/Users/mattciaglia/.gemini/antigravity/brain/dc608ad4-f544-4b76-863b-3a06c6510287/bundle_4_test_1778540803371.webp)

---

# Bundle 5 — Canvas & Preview · Walkthrough

## What Changed

Transformed the canvas preview from a static image into a fully interactive workspace with pan, zoom, and fullscreen capabilities.

### Modified Files

| File | Change |
|------|--------|
| `state/actions.js` & `state/reducer.js` | Added `TOGGLE_FULLSCREEN` action and `isFullscreen` state |
| `App.jsx` | Mapped `F` to Fullscreen, `Shift+F` to Add Favorite. Added `.app-fullscreen` class to root wrapper |
| `styles/layout.css` | Added `.app-fullscreen` logic to expand center column and hide all others |
| `panels/CanvasPanel.jsx` | Added local `zoom`/`pan` states and pointer event handlers. Added `bgMode` state and header toggle button |
| `styles/canvas.css` | Added checkerboard pattern for transparent bg, hover-only `.canvas-corner` labels, and `.evolve-active` pulsing border |

## Features Added

| Feature | Description |
|---------|-------------|
| **Fullscreen Mode** | Press `F` to hide all UI panels except the Canvas, turning the app into a clean preview display. Press `F` again to exit. |
| **Pan & Zoom** | Scroll over the canvas to zoom in/out. Click and drag on the background to pan around the artwork. Added a `RESET VIEW` button to quickly snap back to center. |
| **Background Toggle** | A new `BG:` button in the canvas header cycles through 3 modes: `PALETTE` (default solid), `TRANSPARENT` (checkerboard), and `WHITE`. |
| **Evolve Pulse** | When Davis/Evolve mode is active (toggled via `E`), the canvas wrap now gains a pulsing green glowing border to clearly indicate that auto-generation is running. |

## Verification

- ✅ `npm run build` — 271ms, 51 modules, 0 errors
- ✅ Browser subagent verified `F` toggles fullscreen and hides peripheral panels.
- ✅ Browser subagent verified `E` toggles the green pulsing Evolve border.
- ✅ Browser subagent verified the `BG:` button properly cycles background styles (palette → transparent → white).
- ✅ Video recording attached below showing the UI interactions.

![Bundle 5 Testing](/Users/mattciaglia/.gemini/antigravity/brain/dc608ad4-f544-4b76-863b-3a06c6510287/bundle_5_test_1778541712654.webp)

---

# Bundle 6 — Audio & Stimulus · Walkthrough

## What Changed

The audio engine was completely overhauled. We moved from flat meters to a rich, scrolling waveform visualizer and added robust controls for routing and sourcing audio (both microphones and files).

### Modified Files

| File | Change |
|------|--------|
| `state/actions.js` & `state/reducer.js` | Added `audioGain`, `audioSource`, and `audioMonitor` states. |
| `hooks/useAudioInput.js` | Refactored to rebuild the audio graph dynamically based on `source` (Device vs File). Added a `GainNode` and optional routing to `ctx.destination` based on the `monitor` flag. |
| `panels/StimulusPanel.jsx` | Removed flat meters. Added an audio `<select>` dropdown, `<input type="file">`, a gain slider, and a Monitor toggle button. |
| `components/WaveformMeter.jsx` | [NEW] A `<canvas>` based visualizer that maintains a rolling history of the audio bands and renders a scrolling multi-colored graph. |
| `styles/panels.css` | Added `.beat-flash` animation to briefly flash the waveform border green on beat detection. |

## Features Added

| Feature | Description |
|---------|-------------|
| **Device Selection** | Choose any available microphone from a dropdown list to drive the audio reactivity. |
| **File Playback** | Use the "Choose File" button to upload an MP3 or WAV file directly into the engine. |
| **Gain Control** | A slider below the file input lets you boost or cut the audio signal (from 0.0x to 5.0x) before it reaches the visualizer. |
| **Audio Monitoring** | The `MON OFF/ON` toggle determines whether the audio signal is routed to your speakers. By default, it is OFF to prevent microphone feedback, but can easily be enabled for files. |
| **Scrolling Waveform** | The old flat bars were replaced with a real-time, scrolling history graph tracking Bass (pink), Mid (yellow), Treble (blue), and RMS (green fill). |
| **Beat Flash** | The waveform container flashes a bright green border whenever a sharp volume spike (beat) is detected. |

## Verification

- ✅ `npm run build` — 120ms, 52 modules, 0 errors
- ✅ Browser subagent successfully expanded the Stimulus panel and verified the presence of the Device dropdown, File upload, Gain slider, Monitor toggle, and the new Waveform canvas.
- ✅ Video recording attached below showing UI interactions.

![Bundle 6 Testing](/Users/mattciaglia/.gemini/antigravity/brain/dc608ad4-f544-4b76-863b-3a06c6510287/bundle_6_test_1778542526950.webp)

---

# Bundle 7 — Video Output & Export Polish · Walkthrough

## What Changed

The Output panel was upgraded from a static history log into a functional export engine. The application can now render high-resolution PNG snapshots and capture live WEBM video streams directly from the generative SVG canvas.

### Modified Files

| File | Change |
|------|--------|
| `state/actions.js` & `state/reducer.js` | Added `exportResolution` and `isRecording` states. |
| `state/AppContext.jsx` & `panels/CanvasPanel.jsx` | Created a global `svgRef` and attached it to the live canvas for export access. |
| `hooks/useMediaExport.js` | [NEW] Custom engine handling `requestAnimationFrame` SVG serialization, offscreen canvas drawing, and `MediaRecorder` logic. |
| `panels/OutputPanel.jsx` | Replaced dummy buttons with functional 1x/2x/4x snapshot scaling dropdown and a WEBM Record toggle. |
| `components/MasterBar.jsx` | Added dynamic pulsing `🔴 REC WEBM` badge that appears in the top navigation during active recording sessions. |

## Features Added

| Feature | Description |
|---------|-------------|
| **Resolution Scaling** | Select between 1x (1080p), 2x (4K), and 4x (8K) snapshot resolutions. The SVG is mathematically upscaled before rendering to PNG to ensure crisp, lossless exports. |
| **Video Recording** | Click "RECORD WEBM" to begin capturing the live generative canvas. The app serializes the vector graphics to an offscreen canvas at 30 FPS and streams it directly into a `.webm` video file. |
| **Visual Indicators** | Both the Output panel and the Master Bar prominently display a red pulsing indicator when recording is active, ensuring you never accidentally leave it running. |

## Verification

- ✅ `npm run build` — 121ms, 53 modules, 0 errors.
- ✅ Browser subagent successfully expanded the Output panel, verified the resolution dropdown, and toggled the Record button.
- ✅ Verified the pulsing `REC WEBM` indicator appeared globally in the Master Bar.
- ✅ Verified the `MediaRecorder` finalized the WEBM blob and triggered a download upon stopping.
- ✅ Video recording attached below showing the UI interactions.

![Bundle 7 Testing](/Users/mattciaglia/.gemini/antigravity/brain/dc608ad4-f544-4b76-863b-3a06c6510287/bundle_7_test_1778543166905.webp)

---

# Bundle 8 — Davis/Evolve Panel Finalization · Walkthrough

## What Changed

The `DAVIS MODE` panel has been upgraded from a visual placeholder to a fully-fledged "Generative Autopilot". The engine can now systematically evolve the artwork over time or in sync with incoming audio beats, offering granular control over what changes.

### Modified Files

| File | Change |
|------|--------|
| `state/actions.js` & `state/reducer.js` | Introduced `evolveTarget`, `autoSnapshot`, and `lastEvolveTs`. Created the `TRIGGER_EVOLVE` logic that handles randomization based on the target. |
| `App.jsx` | Implemented a `setInterval` loop to handle time-based evolution, hooked the audio engine's `onBeat` callback to trigger beat-based evolution, and added a `useEffect` to capture auto-snapshots. |
| `panels/DavisPanel.jsx` | Revamped the UI to include the Target dropdown, Auto-Snap toggle, and greyed-out MIDI/OSC placeholders. |

## Features Added

| Feature | Description |
|---------|-------------|
| **Auto-Evolve Engine** | The application can now run autonomously, changing the generative state automatically based on the `INTERVAL` slider (time-based) or loud transient audio spikes (beat-based). |
| **Target Selection** | A new dropdown allows you to restrict the autopilot. Choose to only randomize the Seed, the Layout (excluding locked parameters), the Color Palette, or All Parameters simultaneously. |
| **Auto-Snap** | When enabled, the engine will automatically capture and save a high-resolution snapshot right as the evolution triggers, letting you passively collect variations. |
| **Hardware Placeholders** | Added visual placeholders for `MIDI` and `OSC` sources to represent future controller integrations. |

## Verification

- ✅ `npm run build` — 126ms, 53 modules, 0 errors.
- ✅ Browser subagent successfully expanded the Davis panel, started the engine, and verified that the Seed changed automatically after 2 seconds.
- ✅ Video recording attached below showing the UI interactions.

![Bundle 8 Testing](/Users/mattciaglia/.gemini/antigravity/brain/dc608ad4-f544-4b76-863b-3a06c6510287/bundle_8_test_1778543777107.webp)

---

# Bundle 9 — Cleanup, Polish & Final Documentation · Walkthrough

## What Changed

For the final bundle, the focus shifted from code to communication. The legacy Processing-era documentation was completely rewritten to reflect the modern Vite + React architecture.

### Modified Files

| File | Change |
|------|--------|
| `README.md` | Entirely rewritten. Now includes the modern tech stack, the "curated chaos" philosophy, hotkey references, and installation instructions for the React app. |
| `docs/architecture.md` | [NEW] Explains the underlying rendering pipeline, the deterministic math, the Context API state tree, and the video/snapshot export engine. |
| `docs/manifesto.md` | [NEW] Explores the aesthetic philosophy behind the tool, explaining *why* we built a generative autopilot and *how* it differs from traditional digital canvases. |

## Conclusion

The **Kinetic Curator** has successfully completed its transformation from a static MVP to a production-grade generative art synthesizer. It boasts a custom React-SVG engine, Web Audio API reactivity, Cellular Automata rendering, an autonomous autopilot, and a robust 8K snapshot & `.webm` video recording pipeline—all wrapped in a highly responsive, aesthetically premium dark mode UI.
