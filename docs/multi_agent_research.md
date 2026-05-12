# Kinetic Curator — Multi-Agent Research Report

> **5 parallel research tracks**, synthesized into actionable feature ideas, bug reports, and UX/UI suggestions.

---

## Research Tracks

| # | Agent | Focus | Sources |
|---|-------|-------|---------|
| 🎨 | **Davis / HYPE** | Joshua Davis workflow, HYPE framework capabilities | HYPE GitHub, Davis talks/articles, fxhash projects |
| 🌐 | **Gen Art Platforms** | fxhash, Art Blocks, Hydra, p5.js editor, TouchDesigner | Platform docs, feature pages |
| 🎛️ | **Creative UX** | Parameter control patterns, panel layouts, dark UI, undo systems | UX research articles, DAW patterns |
| 🔊 | **Rendah / DNB** | Audio-reactive art, glitch aesthetics, Fujimoto/Meinesz references | Artist sites, glitch tools, audio-viz tools |
| 🖥️ | **Live UI Audit** | First-run experience, panel usability, visual hierarchy | Direct browser testing |

---

## Part 1 · Feature Ideas

### 🔥 High-Impact Features (from platform + workflow research)

| # | Feature | Inspiration | Why it matters |
|---|---------|-------------|----------------|
| F1 | **Parameter Locking ("Pin")** | fxhash params, Figma constraints | Let users lock specific params (e.g., palette, count) while randomizing everything else. This is the #1 missing exploration tool — Davis's "let it run" workflow fundamentally depends on randomizing *some* things while holding *others* constant. Currently all-or-nothing. |
| F2 | **Variation Grid (N-up compare)** | Art Blocks "long form", Midjourney grid | Generate 4–9 seed variants simultaneously in a tiled preview. Users pick favorites from the grid rather than watching one seed at a time. Massively accelerates curation. |
| F3 | **Branching History Tree** | Photoshop history, git branches | Every seed/config change creates a node. Users can branch, explore, and return. Current favorites system is linear — a tree would let users explore "what-if" paths without losing their way back. |
| F4 | **Config Import / Re-roll** | fxhash iteration tokens, Processing `loadJSONObject` | Sidecar JSON export already works. Add a "Load Config" drag-drop zone to re-roll any exported state. Enables seed sharing between users. ~90% of the plumbing exists. |
| F5 | **URL-encoded State (Shareable Links)** | Hydra video synth URL encoding | Encode `seed + palette + composition + mode` into the URL hash. Copy-paste a URL = share a specific generative piece. Hydra does this brilliantly — your code *is* the URL. |
| F6 | **SVG Upload / Drag-Drop** | Custom asset ingestion | The `uploads/` dir exists but has no UI. Add drag-drop to P02 that parses incoming SVGs, extracts viewBox, and adds them to the live pool with auto-categorization. |
| F7 | **MIDI / OSC Input Bridge** | TouchDesigner, Ableton Link, Hydra MIDI | Implement WebMIDI API for physical controller input (knobs → params). The footer already references `localhost:9001` for OSC — implement a WebSocket relay. This turns KC into a live performance tool. |
| F8 | **Timelapse / Animation Export** | Davis studio practice, fxhash "features" | Record N frames of evolution as a WebM/GIF. The EVOLVE mode already sequences through seeds — adding frame capture creates shareable process videos. |

### 🟡 Medium-Impact Features

| # | Feature | Inspiration | Details |
|---|---------|-------------|---------|
| F9 | **Per-Parameter Randomize Button** | DAW "randomize" per knob | Tiny 🎲 icon next to each slider in P04. Click = randomize just that param. Shift+click = lock it from global randomize. |
| F10 | **Palette Editor + Generator** | Coolors.co, Adobe Color | In-app palette creation: HSL wheel, complementary/analogous auto-generation, import from image. Currently limited to 5 hardcoded palettes. |
| F11 | **Blend Modes for Layers** | HYPE `HBlendMode`, Photoshop | HYPE framework offers `multiply`, `screen`, `overlay`, `difference` blend modes. Add blend mode selector per z-tier for richer compositing. |
| F12 | **Attractor / Repulsor Fields** | HYPE `HAttractor`, TouchDesigner force fields | Place invisible attractor/repulsor points that pull/push asset placements. HYPE's `HAttractor` is one of its most powerful features and KC has no equivalent. |
| F13 | **Spring / Oscillation Behaviors** | HYPE `HOscillator`, `HSpring` | Add micro-animations: assets gently oscillate in position, scale, or rotation over time. Turns the static preview into a living composition. |
| F14 | **Waveform Visualizer in P06** | DAW waveform views, Hydra audio FFT | Replace the flat stimulus meters with a scrolling waveform/spectrogram. Much richer feedback for audio-reactive work. |
| F15 | **Asset Weight/Density Quick-Edit** | Inline editing pattern | Click on an asset's weight/density in the list view to cycle through `light/medium/heavy` or `sparse/medium/dense` without opening a separate editor. |
| F16 | **Composition Blending** | DJ crossfader metaphor | Crossfade between two presets. Slider goes from Preset A → Preset B, interpolating all parameters. Natural for the music/performance context. |
| F17 | **Networked Jamming** | Hydra WebRTC, Figma multiplayer | Multiple users view/edit the same composition in real-time. One person controls palette, another controls layout. Collaborative performance tool. |

### 🟢 Nice-to-Have Features

| # | Feature | Details |
|---|---------|---------|
| F18 | **Gallery Mode** | Full-screen presentation view with seed/palette info hidden. For exhibitions and installations. |
| F19 | **Print Pre-flight Panel** | Show CMYK gamut warnings, bleed guides, DPI calculator. The 7200×10800 export is print-oriented but has no pre-flight guidance. |
| F20 | **Custom Layout Mode Editor** | Let users define new layout modes via a simple visual language (place points, define rules). |
| F21 | **Keyboard Shortcut Cheat Sheet** | Overlay triggered by `?` showing all available hotkeys. |
| F22 | **Batch Export** | Export N seeds at once with the current config. Run through seeds 1–100, export all PNGs. |
| F23 | **Theme/Skin System** | Multiple UI themes beyond the current lo-fi terminal aesthetic. Light mode for projector environments. |
| F24 | **Tag-Based Smart Pools** | Auto-curated sub-pools like "all crystalline + heavy weight" that preset composers can reference by name. |
| F25 | **Audio File Input** | Accept an MP3/WAV file as stimulus instead of only live mic. Enables offline audio-reactive work. |

---

## Part 2 · Bugs & Issues Discovered

### From Code Analysis + Live Audit

| # | Severity | Area | Issue |
|---|----------|------|-------|
| B1 | 🔴 **Critical** | [app.jsx hotkeys](file:///Users/mattciaglia/Documents/GitHub/Kinetic_Curator/KineticCuratorUI/app.jsx#L463-L474) | **Stale closure in hotkey handler.** `addSnapshot` and `favoriteCurrent` are recreated every render but the `useEffect` has no dependency array. Pressing `s` captures the *initial* seed/state, not the current one. Fix: wrap in `useCallback` with proper deps, or use refs. |
| B2 | 🔴 **Critical** | [AudioRouter.pde](file:///Users/mattciaglia/Documents/GitHub/Kinetic_Curator/KineticCuratorSketch/AudioRouter.pde#L4) | **Unconditional `import ddf.minim.*`** causes Processing to fail to compile if Minim library isn't installed, even when `enableAudio = false`. The import is at the file level, not guarded. |
| B3 | 🟡 **Medium** | [ui-canvas.jsx + ui-controls.jsx](file:///Users/mattciaglia/Documents/GitHub/Kinetic_Curator/KineticCuratorUI/ui-canvas.jsx#L15-L81) | **Duplicated `COMPOSITION_PRESETS`** array in two files (455 lines + 466 lines). Edits to one don't propagate. A preset added to controls but not canvas would silently fall through to defaults. |
| B4 | 🟡 **Medium** | [assets.js](file:///Users/mattciaglia/Documents/GitHub/Kinetic_Curator/KineticCuratorUI/assets.js#L7) | **Missing experimental categories** in `ASSET_CATEGORIES` array. Only 7 core categories listed; `crystalline`, `biosynthetic`, `fragments`, `scanlines` are missing. Filter chips won't show them if assets are added. |
| B5 | 🟡 **Medium** | [ui-controls.jsx presets](file:///Users/mattciaglia/Documents/GitHub/Kinetic_Curator/KineticCuratorUI/ui-controls.jsx#L109) | **Density values exceed slider max.** Fujimoto Prism (105) and Halftime Glitch (112) have `density` > 100, but the slider max is 100. User can select a preset but then can't return to the same value if they adjust the slider. |
| B6 | 🟡 **Medium** | [AudioRouter.pde switchToMicrophone](file:///Users/mattciaglia/Documents/GitHub/Kinetic_Curator/KineticCuratorSketch/AudioRouter.pde#L96-L101) | **`switchToMicrophone()` doesn't actually switch.** It calls `getLineIn()` again instead of switching to mic input. |
| B7 | 🟡 **Medium** | [audio-input.jsx](file:///Users/mattciaglia/Documents/GitHub/Kinetic_Curator/KineticCuratorUI/audio-input.jsx#L88-L141) | **Extra rAF frame after teardown.** `analyzeAudio` schedules via `requestAnimationFrame` before checking `runningRef`, so one extra analysis frame can fire after the component unmounts. |
| B8 | 🟢 **Low** | [ui-shell.jsx downloadSVG](file:///Users/mattciaglia/Documents/GitHub/Kinetic_Curator/KineticCuratorUI/ui-shell.jsx#L13-L16) | **Dead code.** `downloadSVG` builds `svg` string (line 14) that's never used. Only `inlined` is used for the download. |
| B9 | 🟢 **Low** | [ui-canvas.jsx](file:///Users/mattciaglia/Documents/GitHub/Kinetic_Curator/KineticCuratorUI/ui-canvas.jsx#L441) | **`dangerouslySetInnerHTML` in SVG `<g>`.** Malformed asset SVG can break the entire canvas render tree silently. No sanitization or error boundary. |
| B10 | 🟢 **Low** | PDF export | **PDF export is a stub.** Emits JSON sidecar only, no actual PDF. The UI button says "↓ PDF" which is misleading. |

---

## Part 3 · UX/UI Suggestions

### 🏗️ Layout & Information Architecture

| # | Issue | Suggestion | Rationale |
|---|-------|------------|-----------|
| U1 | **Information overload on first load** | Add a **progressive disclosure** system: start with P01 (canvas) + P04 (layout) expanded, everything else collapsed. Current state opens 5+ panels simultaneously. | Creative UX research shows tools with >6 visible parameter groups overwhelm new users. DAWs default to a minimal view. |
| U2 | **No clear "start here" path** | Add an **onboarding overlay** or empty-state in the canvas that says "Pick a preset to begin →" with an arrow pointing to P04. | First-time users see a busy grid of panels with no indication of workflow order. |
| U3 | **Three-column layout is rigid** | Add **responsive breakpoints**: 2-column at ≤1200px, single-column stack at ≤768px. Currently the layout is fixed and overflows on smaller screens. | `overflow: hidden` on body means content is permanently lost on narrower viewports. |
| U4 | **Panel order doesn't match workflow** | Reorder columns: **Col A** = Canvas + Layout (creation), **Col B** = Asset Pool + Stimulus (sources), **Col C** = Router + Davis + Output (routing/export). Currently stimulus and davis-mode are in Col A under the canvas, making it very tall. | Group by workflow phase rather than arbitrary column assignment. |
| U5 | **No panel docking/undocking** | Allow panels to be **dragged between columns** or **popped out** into floating windows. Power users want custom layouts. | Every professional creative tool (Photoshop, Blender, DAWs) allows panel rearrangement. |

### 🎛️ Parameter Controls

| # | Issue | Suggestion | Rationale |
|---|-------|------------|-----------|
| U6 | **Sliders have no number input** | Add **click-to-type** on slider values. Currently the only way to set an exact value is dragging. | DAWs always allow direct number entry on any parameter. Crucial for precision. |
| U7 | **No reset-to-default** | Add **double-click to reset** on any slider (or a "⟲" icon). Currently there's no way to return to a preset's default for a single parameter. | Standard pattern in every creative tool — Figma, Photoshop, Logic Pro all support this. |
| U8 | **No parameter undo** | `Cmd+Z` should undo the last parameter change. Currently there's no undo at all. | Without undo, users are afraid to experiment. This is the single biggest UX gap. |
| U9 | **Preset buttons don't indicate current values** | Show a **subtle highlight or badge** when the current parameters exactly match a preset vs. when they've been modified from a preset. | Users lose track of whether they're "on" a preset or in a modified state. |
| U10 | **13 preset buttons are hard to scan** | Group presets into **categories with dividers**: Classic (4), Rendah (3), CA (2), Davis-lineage (4). Add a subtle label above each group. | The flat row of 13 buttons with no grouping is cognitively expensive to scan. |

### 🖼️ Canvas & Preview

| # | Issue | Suggestion | Rationale |
|---|-------|------------|-----------|
| U11 | **Canvas corner labels are noisy** | Make corner coordinates **visible only on hover** or when a "guides" toggle is on. The `[0,0]` / `[1000,700]` labels are always visible and add visual clutter to the art preview. | The preview should feel like looking at art, not looking at debug info. |
| U12 | **No zoom/pan on canvas** | Add **scroll-to-zoom** and **click-drag-to-pan** on the canvas preview. Currently it's a fixed viewport. | Users need to inspect detail areas without exporting. Standard in all visual tools. |
| U13 | **No canvas background toggle** | Let users toggle between the palette bg, transparent (checkerboard), and white. Useful for previewing art on different surfaces. | Standard in any image editor. Especially important for print work. |
| U14 | **COMPACT/TALL toggle is confusing** | Replace with a simple **drag-handle resize** on the canvas panel bottom edge. Users expect to resize by dragging, not clicking a toggle. | Direct manipulation > mode switches for spatial controls. |
| U15 | **No fullscreen preview** | Add a **fullscreen / presentation mode** (`F` key or button) that hides all panels and shows only the canvas. Essential for installations and client presentations. | Every art tool has this. The Davis workflow includes showing pieces at exhibitions. |

### 📦 Asset Pool (P02)

| # | Issue | Suggestion | Rationale |
|---|-------|------------|-----------|
| U16 | **No asset preview on hover** | Add a **larger tooltip preview** when hovering over a tile in grid view. The 64×64 tile previews are tiny. | Users need to see asset detail without switching to list view. |
| U17 | **No multi-select** | Allow **Shift+click** to select a range, **Cmd+click** to toggle multiple assets, then "enable/disable selected". Currently every toggle is one-at-a-time. | With 50+ assets, individual toggling is tedious. |
| U18 | **Category chip design** | Show the **active count** within each category chip (e.g., "organic 12/18" = 12 enabled of 18 total). Currently only shows total count. | Helps users understand pool coverage at a glance. |

### 🎵 Stimulus & Audio (P06)

| # | Issue | Suggestion | Rationale |
|---|-------|------------|-----------|
| U19 | **Meters are small and hard to read** | Make the **beat meter pulse with color** (flash green on beat) and increase meter height to at least 12px. Currently 8px bars are barely visible. | Audio feedback needs to be visceral and immediate. Musicians expect meters they can read at a glance. |
| U20 | **No audio gain control** | Add a **master audio sensitivity** slider. Different microphones and environments have wildly different levels. Currently the beat threshold is hardcoded. | Without gain, a quiet environment produces no stimulus and a loud one maxes out constantly. |
| U21 | **No audio source selector** | Allow users to **pick which audio input** (mic, line-in, system audio) if multiple are available. Currently just uses the default. | Musicians often route audio from a DAW via loopback. |

### ⚡ Davis Mode (P07)

| # | Issue | Suggestion | Rationale |
|---|-------|------------|-----------|
| U22 | **Favorites have no visual preview** | Add a **tiny thumbnail** (or at minimum the palette swatches) next to each favorite entry. Currently it's just hex seeds and timestamps. | Users can't remember what `a17e9b21` looked like. Visual memory is everything in curation. |
| U23 | **No favorite comparison** | Add a **side-by-side mode**: select two favorites and compare them in a split view. | Davis's workflow is fundamentally about comparison — "which is better?" needs to be frictionless. |
| U24 | **EVOLVE indicator is subtle** | Make the evolve state **more dramatic**: pulse the canvas border green when evolving, or add a subtle animated overlay indicator. | Users should always know at a glance whether the seed is auto-changing. Easy to forget evolve is on. |

### 📤 Output (P05)

| # | Issue | Suggestion | Rationale |
|---|-------|------------|-----------|
| U25 | **Default collapsed is wrong** | Output should **default expanded**. Export is a primary action, not a secondary one. Hiding it behind a collapsed panel adds friction to the core Davis workflow of "save what hits." | The `s` hotkey bypasses the panel, but new users won't know that. |
| U26 | **No export progress indicator** | The 7200×10800 export takes significant time. Add a **progress bar or spinner** during rasterization. Currently the user gets no feedback. | Users will click the button multiple times thinking it didn't work. |
| U27 | **Snapshot history has no delete/clear** | Add **individual delete** and **clear all** buttons on the snapshot strip. Currently snapshots accumulate forever. | Session hygiene. |

### 🎨 Visual Design

| # | Issue | Suggestion | Rationale |
|---|-------|------------|-----------|
| U28 | **Footer is wasted space** | Replace the static footer text with **live useful info**: actual render time, memory usage, active asset count with categories, or recent activity log. The current text is decorative. | 24px of screen real estate permanently occupied by "awaiting OSC bridge :: localhost:9001" — which isn't even implemented. |
| U29 | **Monospace everywhere is dense** | Use monospace for **data/values only**. Switch labels, descriptions, and panel subtitles to a **proportional sans-serif** (Inter, System UI). | The mono aesthetic is great for the terminal vibe but reduces readability for natural-language text. Best-in-class tools (VS Code, iTerm) use proportional fonts for UI chrome and mono for code/data. |
| U30 | **No color accessibility** | The `#00ff88` live dot and `#ff2d6f` accent may be indistinguishable for colorblind users. Add **shape indicators** alongside color (e.g., filled circle = live, hollow = idle — which you already do ✓). | ~8% of male users have some color vision deficiency. |
| U31 | **Panel borders are inconsistent** | Some panels have `1px solid` borders, others have `1px dashed`. The dashed borders on hint text and snapshot strips add visual noise. | Pick one border style system and apply it consistently. |

---

## Part 4 · Missing HYPE Features

Based on the HYPE Processing framework analysis, these HYPE capabilities have **no equivalent** in Kinetic Curator:

| HYPE Feature | What it does | KC Status |
|--------------|-------------|-----------|
| **`HDrawablePool.onCreate()` callback** | Per-object creation hook — set unique properties per asset at spawn time | ❌ No per-asset spawn customization |
| **`HAttractor` / `HRepeller`** | Gravity-like fields that pull/push drawables | ❌ No force fields |
| **`HOscillator`** | Animates any property (x, y, scale, rotation, alpha) with sine/triangle/saw waves | ❌ Static placements only |
| **`HSpring`** | Physics spring attached between two drawables | ❌ No physics |
| **`HSwarm`** | Boids-like swarm behavior with separation, alignment, cohesion | ⚠️ Basic swarm layout exists but no emergent behavior |
| **`HBlendMode`** | Per-drawable blend mode (multiply, screen, overlay, etc.) | ❌ No blend modes |
| **`HTimer` / `HCallback`** | Event-driven triggers (on timer, on collision, on proximity) | ⚠️ Evolve timer exists but no general event system |
| **`HColorField`** | Position-dependent color gradient (color changes based on x,y) | ⚠️ `band` palette shift is similar but limited |
| **`HPixelColorist`** | Sample colors from an image and apply to drawables | ❌ No image-to-palette |
| **`HTween`** | Animated transitions between states | ❌ All changes are instantaneous |

---

## Part 5 · Competitive Landscape Summary

| Tool | Key Differentiator | What KC Should Steal |
|------|-------------------|---------------------|
| **fxhash** | Param-based exploration with viewer control | Exposable params with lock/unlock, URL-encoded state |
| **Art Blocks** | Long-form generative (1000 outputs per algorithm) | Batch seed exploration, variation grid |
| **Hydra** | URL = state, live coding, WebRTC jam | URL sharing, networked collaboration |
| **p5.js Editor** | Browser IDE with console + quick preview | Console/debug panel for asset/seed diagnostics |
| **TouchDesigner** | OSC/MIDI, node-based routing, real-time | WebMIDI, OSC bridge, visual routing graph |
| **Cables.gl** | Visual node patching in browser, WebGL | Node-based parameter routing (for advanced mode) |

---

## Part 6 · Prioritized Action Items

### Tier 1 — Fix Now (bugs affecting daily use)
1. **B1** — Fix hotkey stale closure
2. **B3** — Single-source `COMPOSITION_PRESETS`
3. **U8** — Implement basic Cmd+Z undo (even just 20-step linear)
4. **B5** — Fix density slider max to 120

### Tier 2 — Next Sprint (highest-impact features + UX)
5. **F1** — Parameter locking (pin/unlock per slider)
6. **F4** — Config import (load JSON)
7. **F5** — URL-encoded state sharing
8. **U1** — Progressive disclosure (default collapsed panels)
9. **U6** — Click-to-type on slider values
10. **U15** — Fullscreen preview mode

### Tier 3 — Polish Sprint (UX quality-of-life)
11. **U10** — Group preset buttons by category
12. **U11** — Canvas corner labels on hover only
13. **U22** — Thumbnail previews in favorites
14. **U20** — Audio gain/sensitivity slider
15. **U25** — Output panel default expanded
16. **U28** — Replace footer with live data

### Tier 4 — Feature Expansion
17. **F2** — Variation grid (4-up/9-up compare)
18. **F7** — WebMIDI input
19. **F8** — Timelapse/animation export
20. **F10** — Palette editor
21. **F12** — Attractor/repulsor force fields
22. **F13** — Oscillation behaviors (living compositions)

---

> **Key insight from the research:** The single most impactful architectural decision would be implementing **parameter locking + variation grid**. Together, these two features transform KC from "watch one seed at a time" to "systematically explore the parameter space while holding specific variables constant" — which is exactly what makes fxhash and Art Blocks powerful for artists. Davis's own workflow in his studio is fundamentally about this: lock the palette, let the layout evolve, save the hits.
