# KC-1 Architecture: Apple Silicon Native Optimization

> **Status**: Planning only. No implementation until Spine E is merged.
> See [EMBARGO.md](EMBARGO.md) — this document narrows scope, it does not create tickets.

This roadmap outlines the transition from the current browser-hosted WebGL2
architecture into a hyper-optimized, Apple Silicon-native environment. Each
phase has hard prerequisites; none may begin until those are met.

---

## Current Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 8 | Browser-hosted, no native wrapper |
| Rendering | Pure WebGL2 instanced quads | Custom shaders, VAO/VBO pipeline — no Three.js/Pixi |
| State | Zustand 5 | Sliced store with vanilla subscriptions |
| Offline bake | Rust → WASM (`swarm-bake`) | `wasm32-unknown-unknown`, headless swarm simulation |
| Taste model | Python MLX (`studio/curator.py`) | Apple Silicon MLX training + dataset ingestion |
| Autosave | `localStorage` (`kc:project:v1`) | Debounced, quarantine on parse failure |

---

## Phase 1: Tauri Native Shell

**Objective:** Escape browser memory constraints (~2 GB ceiling) while
preserving the existing TypeScript/React frontend stack.

**Implementation:**
- Wrap the frontend in a [Tauri](https://tauri.app/) webview — native macOS
  app with a web UI.
- Develop Swift/Objective-C++ plugins via Tauri's FFI layer so the UI can
  communicate lightweight state directly to native macOS Core frameworks.
- The existing Vite dev server remains the inner loop for UI iteration.

**Prerequisites:**
- Spine A–F complete and merged.
- Stable selfcheck baseline with no open golden-hash regressions.
- Pipeline panel (Output → Pipeline rename) settled.

**Does not include:** Metal shaders, ML inference, or any render pipeline
changes. Phase 1 is a shell swap only.

---

## Phase 2: Zero-Copy Render Pipeline (Metal & Shared Storage)

**Objective:** Eliminate CPU-to-GPU memory copying to support massive node
counts and 8K accumulation buffers.

**Implementation:**
- Replace Canvas 2D / WebGL2 render logic with custom Metal compute kernels
  (MSL). The instanced-quad pipeline (`renderer.mjs`) and accumulation
  feedback (`accum.mjs`) are the primary port targets.
- Allocate textures and vertex buffers with `MTLResourceStorageModeShared` to
  leverage Apple Silicon's unified memory — no `glBufferSubData` upload step.
- Route the final composited texture to an `MTKView` via the Core Video
  Texture Cache for zero-latency display handoff.

**Prerequisites:**
- Phase 1 stable (Tauri shell shipping).
- Metal shader port of the existing GLSL pipeline validated against the
  selfcheck golden hashes.
- `exportStill.mjs` and `studio/render.mjs` ported or bridged.

**Does not include:** Neural Engine work. Phase 2 is GPU-only.

---

## Phase 3: Neural Engine (ANE) Curation Offloading

**Objective:** Run the local taste model continuously without stealing
compute cycles from the generative visual loop.

**Implementation:**
- Compile the existing MLX evaluation model into a Core ML `.mlpackage`.
- Explicitly target the ANE:
  `MLModelConfiguration.computeUnits = .cpuAndNeuralEngine`.
- Pass candidate frames as `CVPixelBuffer` references directly from the
  Metal render pass into the Core ML model — no file serialization, no
  PNG round-trip.
- Feed the resulting confidence score back to the UI as
  `state.curatorConfidence` (consumed by the planned `TallyLight` component
  on the MasterBar).

**Prerequisites:**
- Phase 2 stable (Metal pipeline shipping).
- Taste model architecture frozen — no more MLX experiments in flight.
- `TallyLight` UI component merged (currently deferred until post-Spine C).

**Does not include:** Disk I/O or export work. Phase 3 is inference-only.

---

## Phase 4: Media Engine Sequence Streaming

**Objective:** Handle heavy disk I/O for batch exports without blocking the
UI or generative physics.

**Implementation:**
- Route Pipeline batch exports through Apple's Media Engine using
  `VideoToolbox` and `AVFoundation` for hardware-accelerated encode.
- Use Grand Central Dispatch (GCD) on system efficiency cores (E-cores)
  alongside `vImage` to execute multithreaded PNG/TIFF disk writes natively
  to the local file system.
- Replaces the current browser `MediaRecorder` + `canvas.toBlob()` export
  path (`SnapRecordRow`, `LoopCaptureBlock`, `BatchEditionBlock`).

**Prerequisites:**
- Phase 3 stable (ANE offloading shipping).
- Pipeline panel fully consolidated (Tasks 1A–1D from refactor queue).
- Export selfcheck hashes validated against the Metal pipeline output.

**Does not include:** New export formats or UI changes. Phase 4 is a
backend swap behind the existing Pipeline panel interface.

---

## Dependency Chain

```text
Spine A–F → Phase 1 (Tauri) → Phase 2 (Metal) → Phase 3 (ANE) → Phase 4 (Media Engine)
              ↑                    ↑                  ↑                ↑
         no render changes    GPU-only           inference-only    I/O-only
```

Each phase is independently shippable and independently revertible. No phase
modifies the project document format or the autosave contract.
