# Building and Running: Web & macOS Desktop

Kinetic Curator is built as a **dual-target application**:
1. **Web Build**: Runs in any modern browser (Chrome, Safari, Firefox) using pure WebGL2 instanced rendering. Automatically deployed to GitHub Pages on every push to `main`.
2. **macOS Desktop Build (Tauri)**: Wraps the application in a native Apple Silicon shell with hardware-accelerated Metal compute shaders, Apple Neural Engine (ANE) Core ML curation, native AVAssetWriter video export, and Grand Central Dispatch E-core sequence streaming.

---

## 1. Prerequisites & Environment Setup

### System Requirements
- **macOS**: macOS 13+ (Ventura, Sonoma, Sequoia) running on Apple Silicon (M1/M2/M3/M4).
- **Node.js**: v22+ (tested with Node v22–v25) and `npm`.
- **Rust Toolchain**: Rust stable (`aarch64-apple-darwin`).
- **Xcode Command Line Tools**: `xcode-select --install`.

### Ensuring Cargo is in your Terminal PATH
If you see the error:
```text
Error failed to get cargo metadata: No such file or directory (os error 2)
```
Your terminal shell simply needs Rust's `cargo` path added to your environment:

```bash
# Add cargo to current session
export PATH="$HOME/.cargo/bin:$PATH"

# Or persist permanently in ~/.zshrc:
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## 2. Web Build Workflow

The web build serves as the primary cross-platform target and live GitHub Pages demo.

### Running the Web Dev Server
```bash
# From repository root:
npm run dev

# Or directly in the app directory:
npm run dev --prefix app
```
Opens instantly at `http://localhost:5173/`. Changes in React, shaders, or store slices hot-reload in real-time.

### Building for Production
```bash
npm run build
```
This runs Vite to produce minified production assets in `app/dist/`.

### Automated GitHub Pages Deployment
Every push to the `main` branch triggers the GitHub Actions workflow at `.github/workflows/deploy-pages.yml`:
1. Checks out repository and runs `npm ci` in `app/`.
2. Builds the web bundle with `VITE_BASE=/Kinetic_Curator/`.
3. Deploys live to:  
   **[https://neuralio444.github.io/Kinetic_Curator/](https://neuralio444.github.io/Kinetic_Curator/)**

---

## 3. macOS Desktop Build Workflow (Tauri)

The desktop build provides full access to Apple Silicon hardware acceleration.

### Running Live Native Dev Mode
```bash
npm run tauri dev
```
*(or `npx tauri dev`)*

This starts the Vite dev server and opens a native macOS desktop window with full IPC hooks into Metal, Core ML, and AVFoundation.

### Building the Standalone `.app` and `.dmg`
```bash
npm run tauri build
```
Once the release build finishes, the native binaries are generated at:
- **Application Bundle**:  
  `src-tauri/target/release/bundle/macos/Kinetic_Curator.app`
- **Installer Disk Image**:  
  `src-tauri/target/release/bundle/dmg/Kinetic_Curator_0.9.0_aarch64.dmg`

#### Launching the Compiled App
You can open the app directly from your terminal:
```bash
open "src-tauri/target/release/bundle/macos/Kinetic_Curator.app"
```
Or drag `Kinetic_Curator.app` into `/Applications`.

---

## 4. How to Use Native Apple Silicon Features in the UI

Open the **`PIPELINE`** panel (tag `P05`) in the UI to access the native hardware controls:

### 1. Metal Zero-Copy (UMA)
- **Status Indicator**: Displays whether the Metal context is `● ACTIVE` or `○ STANDBY`.
- **Hardware Metadata**: Shows the GPU device name, UMA status (`YES (Coherent)`), accumulation buffer pointer, and particle buffer pointer.
- **Controls**:
  - `⚡ INIT METAL UMA`: Allocates unified memory buffers (`MTLResourceStorageModeShared`) and initializes MSL compute pipelines.
  - `⚡ DISPATCH METAL PASS`: Executes GPU compute passes (`boids_compute` & `accum_compute`) directly on Apple Silicon.

### 2. ANE Curation Engine (Core ML)
- **Status Indicator**: Shows `● ANE ACTIVE` when inference runs on the Neural Engine.
- **Tally Light (MasterBar)**:
  - High confidence ($\ge 85\%$): Neon Green `[ * ]`
  - Medium confidence ($50\text{--}84\%$): Amber `[ · ]`
  - Low confidence ($< 50\%$): Dim Gray `[ ]`
- **Controls**:
  - `⚡ EVALUATE FRAME ON ANE`: Passes candidate frames from Metal to Core ML via zero-copy `CVPixelBufferRef` in $1.35\ \mu\text{s}$, returning curation confidence without stalling the live loop.

### 3. Apple Media Engine & E-Cores
- **Status Indicator**: Shows `● STREAMING` with a dynamic progress bar during active batch exports.
- **Controls**:
  - `⚡ RECORD HEVC VIDEO`: Uses `AVAssetWriter` for hardware-accelerated HEVC (`hvc1`) or ProRes 4444 (`ap4h`) export.
  - `⚡ DUMP BATCH (E-CORES)`: Streams PNG/TIFF frame sequences directly to disk pinned to Efficiency Cores via `QOS_CLASS_BACKGROUND`, leaving Performance Cores 100% free for 60Hz generative rendering.

---

## 5. Verification & Testing

### Running Rust & Native Benchmarks
```bash
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
```
Runs the full 14-test suite covering Metal memory profiling, visual parity with WebGL math, Core ML ANE latency, and E-core QoS isolation.

### Running Frontend Verification Suites
```bash
# Code quality & typecheck
npm run lint --prefix app

# Engine golden test suite (80+ headless selfchecks)
npm run selfcheck --prefix app
```

---

## 6. Guidelines for Future Contributors

To maintain universal parity across both the Web and Desktop builds:

1. **Never Make Tauri Imports Hard-Fatal in the Web Build**:
   Use optional or dynamic imports with silent fallbacks:
   ```javascript
   let invoke = null;
   try {
     const tauri = await import('@tauri-apps/api/tauri');
     invoke = tauri.invoke;
   } catch {
     // Web browser fallback
   }
   ```
2. **Keep the State Store Unified**:
   Store slices (`globalSlice.js`, `voiceSlice.js`, etc.) must remain the single source of truth for both WebGL2 and Metal renderers.
3. **Always Run Pre-Flight Checks**:
   Before submitting code, ensure both `npm run selfcheck --prefix app` and `cargo test --manifest-path src-tauri/Cargo.toml` are green.
