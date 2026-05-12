# Kinetic Curator: Architecture

The Kinetic Curator app abandons the typical "Processing/p5.js HTML5 Canvas" paradigm in favor of a strictly declarative React/SVG pipeline. 

By representing thousands of graphical assets as React nodes within an `<svg>` tree, we gain access to React's vast ecosystem of hooks, context management, and declarative state without needing a custom draw loop (unless we are recording video).

## The State Tree (`state/store.js`)

The application uses **Zustand** for high-performance state management. This replaced the previous React Context architecture to eliminate the "60fps bottleneck."

### Performance Optimization (Selectors)
To ensure the UI remains responsive during high-frequency audio updates (60fps), components use **selective subscriptions**. Instead of subscribing to the entire state, panels only listen to the specific keys they need (e.g., `layoutParams`). This prevents unnecessary re-renders in heavy panels like the Asset Pool or Output settings.

### Key Domains
1. **Layout Parameters:** `count`, `scale`, `rotate`, `alpha`, `mode`. These form the "DNA" of the current composition.
2. **Generative Seeds:** `seed`, `paletteId`. A specific combination of layout parameters, a seed, and a palette will **always** yield the exact same composition.
3. **Audio Reactivity:** `audioBands`, `beatPulse`. Updated at 60fps via the Web Audio API.
4. **Davis Mode (Autopilot):** `evolveMode`, `evolveTarget`, `evolveSource`.

### History Tracking
A custom `history` slice in the Zustand store manages a 20-step undo/redo stack for all layout and palette changes, while ignoring high-frequency audio data. This provides full `Cmd+Z` / `Cmd+Shift+Z` capability across the session.

## The Rendering Pipeline

The visual output is generated in `panels/CanvasPanel.jsx`.

1. **Asset Pool Mapping:**
   Based on the layout `mode` (e.g., Grid, Fibonacci, Orbit), an array of objects is generated. Each object represents a "Placement" containing coordinates (`x`, `y`), scaling (`s`), rotation (`r`), and an assigned `assetId` and color.
2. **Deterministic Math:**
   The `seed` is passed into a pseudo-random number generator (PRNG). This ensures that calling `random()` for the 45th asset on seed `0x1A4` always returns the same coordinate.
3. **Audio Injection:**
   The `beatPulse` (a decaying float from `1.0` to `0.0`) and `audioBands` (live frequency data) are mapped onto the `count` and `scale` parameters *during the render phase*, allowing the static layout math to breathe and pulse with the music.
4. **SVG DOM:**
   The generated array is `.map()`'d directly into `<g>` and `<use>` SVG tags. React handles the diffing and DOM updates incredibly fast.

## The Export Engine (`hooks/useMediaExport.js`)

Because the artwork is rendered natively as SVG nodes in the DOM, we can't just use `canvas.toDataURL()`.

### PNG Snapshots
1. We serialize the live `<svg>` DOM node to a raw XML string using `XMLSerializer`.
2. We embed this XML string into a base64 Data URI.
3. We create a native `Image` object and load the Data URI.
4. Once loaded, we draw the Image onto a temporary offscreen `<canvas>` at the target resolution (1x, 2x, 4x) and extract a `Blob` for download.

### WEBM Video Recording
1. We create an offscreen `<canvas>` and acquire a `MediaRecorder` via `canvas.captureStream(30)`.
2. We launch a dedicated `requestAnimationFrame` loop running at 30 FPS.
3. Every frame, we repeat the SVG serialization process, load it into an `Image`, and draw it to the canvas. The `MediaRecorder` encodes this dynamically changing canvas into a VP9 `.webm` video stream.
