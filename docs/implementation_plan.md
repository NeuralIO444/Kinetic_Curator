# Bundle 10 — Production Hardening & Motion Engine

This bundle focuses on architecting the application for production scale. We will eliminate UI performance bottlenecks caused by the React Context API, introduce fluid motion to the generative assets, and restructure the codebase for long-term maintainability.

## 1. Performance Refactor: The Zustand Migration
Currently, the entire application state is wrapped in `AppContext.jsx`. Because the WebAudio engine updates the `beatPulse` and `audioBands` at 60 frames per second, **every panel in the UI is constantly re-rendering**, even if they aren't using the audio data. This is a classic React Context performance trap.

- **The Plan:** We will replace `AppContext.jsx` and `reducer.js` with **Zustand** (`npm install zustand`). 
- Zustand allows components to selectively subscribe *only* to the exact piece of state they need. `CanvasPanel` will subscribe to layout changes, but `AssetPoolPanel` will ignore audio pulses completely. This will make the UI incredibly fast and eliminate lag during heavy audio playback.

## 2. The Fluid Motion Engine (Addressing "Static Windows")
To give the artwork continuous, fluid motion (similar to the aesthetic of Mario Carrillo) without rewriting the entire rendering engine in WebGL, we will implement a hardware-accelerated CSS transition layer.

- **The Plan:** We will add a `transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)` style to all rendered `<g>` and `<use>` SVG nodes in `CanvasPanel.jsx`.
- When the `▶ EVOLVE` engine changes the layout, or the `beatPulse` scales the assets, they will no longer "snap" instantly to their new positions. Instead, they will smoothly glide, rotate, and scale across the screen, creating a mesmerizing, continuous kaleidoscopic motion.
- We will add a **"Motion Smoothing"** toggle in the Davis Panel so you can switch between the classic "snappy" generative feel and the new fluid motion.

## 3. Architecture & Code Cleanup
- **Splitting the Monolith:** The current `reducer.js` is nearly 300 lines long. As we migrate to Zustand, we will split the state logic into domain-specific slices (e.g., `createLayoutSlice.js`, `createAudioSlice.js`, `createDavisSlice.js`) for a cleaner, production-ready codebase.
- **Auto-Snapshot Hardening:** We will add a 2-second debounce limit to the Auto-Snapshot feature. Currently, if you set the Evolve interval to 200ms, the browser will attempt to download 5 images a second and likely crash. The debounce will ensure stability.
- **WebAudio Auditing:** We will ensure that when you switch microphones in the Stimulus panel, the old `AudioContext` is properly suspended and garbage collected to prevent memory leaks over long sessions.

## Open Questions / Feedback Required

> [!NOTE]  
> Are you comfortable migrating the state manager from pure React Context to **Zustand**? It is an industry-standard, lightweight library (1.1kb) that solves exactly the 60fps rendering bottleneck we are facing.

> [!TIP]
> The CSS transition approach will add beautiful, smooth motion to the current SVG engine. If, in the future, you want to push this to 100,000+ particles with melting liquid GLSL shaders (like Joshua Davis's `voiding` filter), that would require a "Bundle 11" to entirely replace the SVG engine with a WebGL canvas (Pixi.js). Does the CSS motion sound like the right next step?
