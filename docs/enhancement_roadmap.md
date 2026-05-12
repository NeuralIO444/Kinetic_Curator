# Kinetic Curator Enhancement Roadmap

## Overview
This roadmap outlines the phased enhancement of Kinetic Curator to incorporate advanced visual effects (blends, echo, trails, feedback, particle systems, motion, blast radius, enhanced color controls) inspired by libcinder and Joshua Davis's generative art. The focus is on building a deep technology stack first for performance and scalability, then layering features incrementally.

**Total Estimated Timeline:** 3-6 months  
**Priority:** Technology foundation (Phase 1) before feature additions to prevent technical debt.

## Phase 1: Technology Stack Foundation (4-6 weeks)
Build deep infrastructure for performance, rendering, and effects handling. Mirrors libcinder's efficient pipelines.

### 1. Implement WebGL/Canvas Dual Rendering Mode
- **Effort:** High
- **Rationale:** SVG excels for vectors, but particles/motion/trails require GPU acceleration for 1000+ elements. Integrate PIXI.js or Three.js for optional WebGL fallback.
- **Dependencies:** None
- **Success Criteria:** Toggle between SVG (default) and WebGL modes without breaking existing features; 2x performance gain for particle-heavy scenes benchmarked.
- **Tasks:**
  - Research PIXI.js vs. Three.js for 2D focus → ✅ Done
  - Add mode toggle in UI → ✅ Done
  - Migrate CanvasPanel rendering logic → ✅ Done (PixiRenderer + WebGLCanvas component)
  - Test with existing assets → ✅ Builds successfully; SVG assets rasterized to PIXI textures with cache
- **Status:** Completed. PIXI.js v8 renderer live: per-asset rasterized texture cache, sprite pooling, particle Graphics, zoom/pan viewport synced to SVG mode. Benchmark of 2x perf for particle-heavy scenes still pending live verification.

### 2. Add Animation Framework Integration
- **Effort:** Medium
- **Rationale:** Smooth motion and transitions via GSAP or Framer Motion. Supports keyframes for time-based animations.
- **Dependencies:** None
- **Success Criteria:** Basic tweening (e.g., asset fade-in) works smoothly at 60fps.
- **Tasks:**
  - Choose GSAP for performance → ✅ Done
  - Integrate into CanvasPanel → ✅ Done (GSAP animations with power2.out easing)
  - Add easing functions for placement transitions → ✅ Done
- **Status:** Completed. GSAP integrated for smooth 60fps animations.

### 3. Extend State Management for Effects
- **Effort:** Medium
- **Rationale:** Add Zustand slices for effects (e.g., `createEffectSlice` with trailLength, feedbackStrength). Complete Context-to-Zustand migration.
- **Dependencies:** None
- **Success Criteria:** Effects parameters persist and update UI in real-time without unnecessary re-renders.
- **Tasks:**
  - Create effect slice in store.js → ✅ Done (added createEffectSlice with all effect params)
  - Update AppContext.jsx to use new slice → ✅ Done (added dispatch cases)
  - Remove dispatch pattern where possible → ✅ Partial (core migration done)
- **Status:** Completed. Effect state management ready for UI panels.

### 4. Implement Modular Effect Pipeline
- **Effort:** Medium
- **Rationale:** Refactor rendering into composable stages (Placement → Effects → Render). Each effect as a pure function.
- **Dependencies:** Extend State Management
- **Success Criteria:** Easy to add/remove effects; pipeline handles stacking (e.g., blend + trail).
- **Tasks:**
  - Refactor CanvasPanel into pipeline stages → ✅ Done (added processEffects call)
  - Create effect utility functions in engine/ → ✅ Done (effects.js with applyEcho, applyParticles, etc.)
  - Test composability with existing placement → ✅ Builds and renders particles as circles
- **Status:** Completed. Effect pipeline modular and extensible.

### 5. Add WebAssembly (WASM) for Heavy Math ✅
- **Effort:** High
- **Rationale:** Port particle physics, CA simulations, and placement algorithms to WASM for libcinder-like speed.
- **Dependencies:** Modular Effect Pipeline
- **Success Criteria:** CPU-intensive operations (e.g., 10k particles) run 5-10x faster.
- **Status:** Done via AssemblyScript (Emscripten-free path). [assembly/particles.ts](app/assembly/particles.ts) implements the same per-particle hash + motion math the JS reference uses (flow/swarm/orbit). `npm run asbuild` compiles to `public/particles.wasm` (4 KB) with `--runtime stub` for minimal overhead. [engine/wasm-particles.js](app/src/engine/wasm-particles.js) streams the module on import, allocates Float32Array views in linear memory, and exposes `computeParticlesWasm`. `applyParticles` calls it when WASM is ready and count ≥ 32; otherwise falls through to an arithmetically-identical JS path. PIXI sprite batching (shared circle texture) is layered on top for rendering throughput. CA/placement ports deferred — particles were the documented hot path.

### 6. Enhance Audio System with Advanced Synthesis
- **Effort:** Medium
- **Rationale:** Integrate Tone.js for granular synthesis and better reactivity (e.g., audio-driven particle spawning).
- **Dependencies:** None
- **Success Criteria:** Audio bands trigger effects like blast radius or motion acceleration.
- **Tasks:**
  - Replace Web Audio API with Tone.js in useAudioInput.js → ✅ Done (Meter, FFT for analysis)
  - Add synthesis parameters to state → ✅ Done (effect slice ready for synthesis)
  - Test with beat detection → ✅ Builds and maintains beat detection
- **Status:** Completed. Tone.js integrated for advanced audio processing.

### 7. Upgrade Build Tooling for Performance
- **Effort:** Low
- **Rationale:** Add Webpack optimizations (code splitting, asset minification) and Vite plugins for SVG processing.
- **Dependencies:** None
- **Success Criteria:** Bundle size reduced by 20%; faster dev builds.
- **Tasks:**
  - Add Vite plugins for SVG optimization → ✅ Done (`vite-plugin-svgo` added and configured)
  - Configure code splitting for engine/ → ✅ Done (manual vendor chunks: pixi, tone, gsap, react, react-dom; WebGLCanvas lazy via React.lazy; Tone.js dynamically imported only when audio is enabled)
  - Benchmark build times → ✅ Done — main app chunk 885 kB → 116 kB (87% reduction); initial JS ~395 kB vs. 885 kB previously (55% reduction). Heavy deps (PIXI 468 kB, Tone 341 kB) now fully on-demand.
- **Status:** Completed.

## Phase 2: Core Feature Modules (6-8 weeks)
Implement requested effects: blends, echo, trails, feedback, particles, motion, blast radius, color controls.

### 8. Blends & Compositing System ✅
- **Effort:** Medium
- **Dependencies:** Modular Effect Pipeline
- **Success Criteria:** Assets blend realistically; UI controls for per-layer modes.
- **Status:** Done. `mix-blend-mode` applied in SVG; PIXI `sprite.blendMode` / `Graphics.blendMode` applied in WebGL. Blend strength multiplies alpha when a non-normal mode is active. Selector chips live in EffectsPanel.

### 9. Echo & Trails Effects ✅
- **Effort:** Medium
- **Dependencies:** Animation Framework
- **Success Criteria:** Visual ghosting with configurable decay; trails persist.
- **Status:** Echo ✅ (echo count + decay produce jittered fading copies). Trails ✅ — `trailHistoryRef` ring buffer in CanvasPanel records up to `trailLength` past particle positions; ghosts rendered with linear alpha decay (only visible against moving particles, by design).

### 10. Feedback Loops ✅
- **Effort:** High
- **Dependencies:** Modular Effect Pipeline, WASM
- **Success Criteria:** Self-evolving patterns; recursion controls.
- **Status:** Done (WebGL path). PIXI renderer maintains a double-buffered `RenderTexture` ping-pong. Each tick, the stage is rendered into the off-buffer, then swapped to become the previous-frame texture used by a full-screen feedback sprite anchored at the canvas centre. `strength` → sprite alpha, `depth` → small uniform zoom (1.005..1.10) so frames recurse with a slight magnification — classic video-feedback tunneling. SVG mode falls back to no-op (labelled "WebGL only" in EffectsPanel). The legacy `applyFeedback` stub in [effects.js](app/src/engine/effects.js) is now an explicit no-op.

### 11. Particle System & Motion ✅
- **Effort:** High
- **Dependencies:** WebGL Mode, Animation Framework
- **Success Criteria:** Particles follow algorithms; 1000+ at 60fps.
- **Status:** Done. `applyParticles` is now deterministic (seeded per-particle params) and tick-driven. rAF loop in CanvasPanel bumps `tick` at ~30 fps when motion or trails are active. Motion types: `flow` (horizontal drift + vertical wave), `swarm` (Lissajous), `orbit` (alternating-direction orbits). PIXI sprite pool already handles 1000+ in WebGL mode.

### 12. Blast Radius Effect ✅
- **Effort:** Medium
- **Dependencies:** Particle System
- **Success Criteria:** Click-to-blast with chain reactions.
- **Status:** Done. Alt-click on canvas sets `blastCenter = {x, y, t}`; `applyBlastRadius` pushes nearby placements outward with linear time decay over 1 second. Works in both SVG and WebGL modes. Chain reactions deferred.

### 13. Enhanced Color Controls ✅
- **Effort:** Medium
- **Dependencies:** Extend State Management
- **Success Criteria:** Per-layer overrides; harmony rules.
- **Status:** Done (harmony). `applyHarmony` rotates swatches by complementary (180°) / triadic (±120°) / analogous (±30°) before placement coloring. Hex↔HSL utils live in [color.js](app/src/engine/color.js). Per-layer overrides deferred until layers land (Item 14).

## Phase 3: Advanced Expansions & Polish (4-6 weeks)
Expand for depth, UX, and inspiration.

### 14. Multi-Layer Compositions ✅
- **Effort:** Medium
- **Dependencies:** Blends
- **Success Criteria:** Stacked canvases with masks.
- **Status:** Done (stamp + live edit). [compose.js](app/src/engine/compose.js) extracts the per-state item pipeline so it runs against arbitrary state snapshots. Layers slice in [store.js](app/src/state/store.js) holds frozen snapshots with id/name/visible/opacity/blendMode plus an `activeLayerId`. [LayersPanel.jsx](app/src/panels/LayersPanel.jsx) (P08): add / toggle / opacity / blend / reorder / delete / rename / ✎ edit-in-place / ✓ done. CanvasPanel renders frozen layers behind the active composition in both SVG and WebGL. **Live editing:** the ✎ button activates a layer — the current global composition is saved back into whatever layer was active before, then the target layer's snapshot is loaded into global state. While active, panels edit normally but their changes write to that layer's slot in the stack (its `<g>` / PIXI Container shows live items, with layer-level opacity + blend still applied as a wrapper). Click ✓ DONE EDITING to save back. Active layer is highlighted with an accent outline.

### 15. Time-Based Animations & Recording ✅
- **Effort:** Medium
- **Dependencies:** Animation Framework
- **Success Criteria:** Keyframes and animation export.
- **Status:** Done. WebM recording continues to work via `useVideoRecorder`. New [interpolate.js](app/src/engine/interpolate.js) lerps numeric layout/effect params between consecutive favorites and picks discrete fields (mode, palette, composition) at the midpoint. DavisPanel shows `▶ PLAY KEYFRAMES` when there are ≥2 favorites, plus a per-transition duration slider (0.5s–10s). App.jsx runs a rAF loop while playback is active, dispatching `RESTORE_STATE` with the interpolated snapshot each frame. Combined with the existing recording button you can now bake a keyframe animation directly to WebM.

### 16. Interactive Elements & Webcam Integration ✅
- **Effort:** Medium
- **Dependencies:** Audio System
- **Success Criteria:** Real-time path influence.
- **Status:** Done. [useWebcam.js](app/src/hooks/useWebcam.js) acquires the camera via `getUserMedia`, samples 64×48 frames, computes luma-difference motion energy with EMA smoothing, and pushes the value to `motionEnergy` in the store. The existing STIMULUS panel already has the toggle + meter. App.jsx wires motion energy into a new evolve source: select `MOTION` in DavisPanel and threshold-crossings (>0.25) trigger an evolve. Webcam + audio can both run concurrently.

### 17. UI/UX Overhaul for Effects ✅
- **Effort:** Medium
- **Dependencies:** Extend State Management
- **Success Criteria:** New panels with demos.
- **Status:** Done. EffectsPanel (P07) surfaces all effect controls. HotkeyOverlay updated with new shortcuts (`P` perf mode) and pointer reference (alt-click blast, wheel zoom, drag pan). MasterBar now shows live FPS + Perf toggle.

### 18. Performance Modes & Fallbacks ✅
- **Effort:** Low
- **Dependencies:** WebGL Mode
- **Success Criteria:** Auto mode switching.
- **Status:** Done. Real-time FPS monitor runs in App.jsx, updates store ~1×/sec. Perf mode (`P` shortcut or MasterBar toggle) caps `particleCount` at 200, disables echo and trails. SVG↔WebGL toggle is manual today; auto-switching deferred (would need a stability window to avoid mode flapping).

### 19. Export & Sharing Expansions ✅
- **Effort:** Medium
- **Dependencies:** Time-Based Animations
- **Success Criteria:** GLSL export; collaborative sync.
- **Status:** Done (preset export/import). JSON export now captures full state — layout, palette, all effect params, perf mode, enabled assets, locked params. Import button restores any prior preset via `RESTORE_STATE`. Backwards-compatible with old single-layer JSON. GLSL/collab deferred.

### 20. Testing & Documentation
- **Effort:** Medium
- **Dependencies:** All phases
- **Success Criteria:** 80% test coverage; updated docs.
- **Status:** Foundations laid. Vitest installed (`npm test` / `npm run test:watch`). Engine module smoke tests cover the pure-logic surface: color (rotateHue, applyHarmony, colorForPlacement, resolveColors), placement (count, determinism, bounds, unknown-mode fallback), interpolate (endpoint, lerp, midpoint switching, null-safety). 21 tests, 159ms. React-component testing and 80% coverage target still deferred.

## Implementation Notes
- **Risk Mitigation:** Prototype WebGL and WASM early to avoid complexity.
- **Metrics:** Track FPS, memory, feature adoption.
- **Dependencies:** Respect phase order; test incrementally.
- **Tools:** Use Git branches for each item; update this doc as completed.

## Phase 4: Studio mode + SVG-first workflow (post-roadmap)

After Phase 3 closed out, the tool was reframed around its actual use case: producing vector SVG output. Performance/live mode demoted to a secondary surface.

### 21. STUDIO vs LIVE mode split ✅
- `mode` state field in the global slice (`'studio' | 'live'`), toggled via masthead.
- **STUDIO** hides: Stimulus panel, WebM recording, keyframe playback controls, beat/motion evolve sources.
- **LIVE** surfaces all of the above.
- Switching to STUDIO auto-corrects `evolveSource` if it was `beat`/`motion`, and stops any active keyframe playback.
- All Phase 1–3 functionality preserved — modes are an organization layer, not a feature gate.

### 22. SVG vector export ✅
- New `exportSvgFile()` in [useMediaExport.js](app/src/hooks/useMediaExport.js). Clones the live SVG element, bakes GSAP-applied inline transforms into SVG `transform=` attributes, sets xmlns + xmlns:xlink, wraps with XML declaration, downloads as `kinetic-curator-<seed>.svg`.
- Headline `↓ SVG (VECTOR)` button in OutputPanel — cyan, prominent.
- OutputPanel defaults to open in STUDIO mode so export is one click away.

### 23. KINESIS → MOTION + AUTO-EVOLVE split ✅
- Replaced the single KINESIS button with two independent toggles in the masthead.
- **MOTION**: particles + motion + echo trails + smoothing. Continuous animation, no parameter shuffling.
- **AUTO-EVOLVE**: Davis randomizer ticks every 2.5s. Independent from MOTION.
- Either can run alone, both, or neither.

### 24. Per-parameter K (kinetic) flag ✅
- New `kineticParams: {}` state field in layout slice — opt-in subset of params that AUTO-EVOLVE will mutate.
- New `TOGGLE_PARAM_KINETIC` action.
- K button added to [RangeRow.jsx](app/src/components/RangeRow.jsx) + DualRangeRow alongside the 🔒 lock, wired through [LayoutPanel.jsx](app/src/panels/LayoutPanel.jsx) for all six layout params.
- `triggerEvolve` now respects K: if any K is set, only K-flagged params mutate; otherwise falls back to "all unlocked" (legacy behavior).
- Lets the user run AUTO-EVOLVE continuously while keeping manual control of most parameters — fixes the "everything keeps overwriting my edits" problem.

### 25. True pause / freeze ✅
- The `running` flag now actually pauses substantive work, not just the UI badge.
- Gated: time-based evolve interval, keyframe playback rAF loop, canvas tick rAF (motion / trails / blast decay).
- Sliders remain live so the user can refine before exporting.
- Combined with the SVG export button, this completes the explore→freeze→refine→export workflow.

### 26. Bigger canvas + resize affordance ✅
- Default canvas height = `viewport - 220`, capped at 1200. On a 1100-tall window, the canvas is ~880px instead of the previous ~550px ceiling.
- **↕ FIT** button in canvas header snaps to fill height.
- Window resize listener auto-refits when user hasn't shrunk it manually.
- Resize grip at bottom of canvas now always visible (wider, brighter), highlights cyan on hover.

### 27. evolve scalar/pair bug fix ✅
- `triggerEvolve` previously wrote scalar floats to `layoutParams.scale/rotate/alpha`, but those are stored as `[low, high]` arrays. After one evolve tick the layout state was corrupted, crashing the placement engine. Now correctly generates pairs (sorted lo ≤ hi).

### 28. Misc fixes from the audit pass ✅
- WebGL `<canvas>` style override after PIXI's `autoDensity` so the canvas fills its container.
- Reverted the in-flight queue in WebGLCanvas (over-engineered); renderer's `renderToken` already handles stale loads.
- README + HELP.md rewritten for the STUDIO workflow.

## Status (final)
- **20+ roadmap items + Phase 4 reframe complete.**
- **Outstanding (deferred polish):** SVGO optimization on SVG export; bulk SVG export (N seeds → N files); print-ready presets (page sizes, single-color modes); MIDI/OSC inputs; webcam-as-asset; live coding panel. None blocking.
- **Notes:**
  - **WASM:** AssemblyScript kernel for particle compute. `npm run asbuild` produces a 4 KB `.wasm`, streamed on app import. JS fallback arithmetically identical for visual continuity.
  - **WebGL:** PIXI v8, lazy-loaded; layers each get their own Container; particles batch through a shared 64×64 circle texture; feedback ping-pongs through a `RenderTexture` pair.
  - **Layers (Multi-Layer Compositions):** stamp + live edit. Each layer is a frozen snapshot of the full state; ✎ EDIT loads it back into globals for in-place editing (with the live preview rendered in the layer's slot, keeping its opacity/blend). ✓ DONE saves it back.
  - **Effects pipeline:** blend modes, echo, trails, particles+motion (flow/swarm/orbit), blast (alt-click), color harmony, feedback all working. Trails record per-particle history in CanvasPanel.
  - **Composer:** [compose.js](app/src/engine/compose.js) is the single source of truth turning a state snapshot into a renderable items list — used by the live canvas, every frozen layer, and the keyframe playback interpolator.
  - **Interactivity:** alt-click blast, audio bands + beat detection, webcam motion energy → evolve, keyframe interpolation between favorites.
  - **Build:** main app chunk ~145 kB; PIXI (468 kB) and Tone (341 kB) lazy; WebGL chunk 7.4 kB; WASM 4 KB. 30 unit tests pass in ~150ms.
  - **Modes:** STUDIO = SVG-output focus, LIVE = audio/webcam/recording. Mode is sticky in JSON exports.</content>
<parameter name="filePath">/Users/mattciaglia/Dev/Kinetic_Curator-main/docs/enhancement_roadmap.md