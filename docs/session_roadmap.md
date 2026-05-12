# Kinetic Curator — Session Roadmap

> 12 bundles · each ≈ 1 session · ordered by dependency
> **Code philosophy: modular, typed, no monoliths**

---

## Architecture Principles (Anti-Vibe Code)

Every bundle follows these rules:

```
├── src/
│   ├── main.jsx                  ← tiny entry point, just mounts <App>
│   ├── App.jsx                   ← layout shell only, delegates to contexts
│   ├── state/
│   │   ├── AppContext.jsx        ← single React context provider
│   │   ├── reducer.js            ← useReducer: all 30+ state vars → 1 dispatch
│   │   ├── actions.js            ← action creators (named, typed, testable)
│   │   └── history.js            ← undo/redo stack (wraps reducer)
│   ├── data/
│   │   ├── presets.js            ← SINGLE source of truth for all 13 presets
│   │   ├── palettes.js           ← palette definitions
│   │   ├── categories.js         ← core + experimental categories
│   │   ├── layout-modes.js       ← mode definitions + glyph data
│   │   └── assets/               ← split asset files (already split ✓)
│   ├── engine/
│   │   ├── prng.js               ← xorshift32 seeded PRNG (extracted)
│   │   ├── placement.js          ← layout placement logic (extracted from ui-canvas)
│   │   ├── color.js              ← palette shift + color-for-placement
│   │   ├── ca-engine.js          ← cellular automaton (already exists)
│   │   └── export.js             ← PNG/PDF/JSON export logic
│   ├── panels/
│   │   ├── CanvasPanel.jsx       ← P01 (preview only, no placement math)
│   │   ├── AssetPoolPanel.jsx    ← P02
│   │   ├── RouterPanel.jsx       ← P03
│   │   ├── LayoutPanel.jsx       ← P04
│   │   ├── OutputPanel.jsx       ← P05
│   │   ├── StimulusPanel.jsx     ← P06
│   │   └── DavisPanel.jsx        ← P07
│   ├── components/
│   │   ├── PanelHeader.jsx       ← shared panel chrome
│   │   ├── RangeRow.jsx          ← slider component (single + dual)
│   │   ├── Toggle.jsx
│   │   ├── Meter.jsx
│   │   ├── MasterBar.jsx
│   │   └── ModeGlyph.jsx
│   ├── hooks/
│   │   ├── useAudioInput.js      ← extracted from audio-input.jsx
│   │   ├── useWebcamInput.js     ← extracted from webcam-input.jsx
│   │   ├── useHotkeys.js         ← centralized hotkey manager
│   │   └── useCollapse.js        ← already exists, just move
│   └── styles/
│       ├── tokens.css            ← CSS custom properties only
│       ├── layout.css            ← grid, columns, responsive
│       ├── panels.css            ← panel chrome
│       ├── controls.css          ← sliders, toggles, buttons
│       ├── canvas.css            ← preview area
│       └── pool.css              ← asset grid/list
```

**Key rules:**
- No file > 200 lines
- No component takes > 8 props (use context)
- No `window.X = X` — use ES module `export`/`import`
- No duplicated data — single source in `data/`
- Every state change goes through `dispatch(action)` — enables undo

---

## Bundle 0 — Foundation Refactor

> **Goal:** Vite build + ES modules + state reducer. Zero new features — just restructure.

| Type | Item |
|------|------|
| 🏗️ Arch | Init Vite project, move all `.jsx` to `src/` with `import`/`export` |
| 🏗️ Arch | Replace `window.X` globals with ES module imports |
| 🏗️ Arch | Create `state/reducer.js` — consolidate all 30+ `useState` calls from `App` into one `useReducer` |
| 🏗️ Arch | Create `state/AppContext.jsx` — wrap app in provider, replace prop drilling |
| 🏗️ Arch | Extract `data/presets.js` — single source for `COMPOSITION_PRESETS` |
| 🏗️ Arch | Extract `data/categories.js` — include all 11 categories (core + experimental) |
| 🏗️ Arch | Split `styles.css` (825 lines) → 6 focused CSS files |
| 🐛 Fix | **B3** — Duplicated presets (solved by extraction) |
| 🐛 Fix | **B4** — Missing experimental categories (solved by extraction) |
| 🐛 Fix | **B8** — Dead code in `downloadSVG` (clean up during move) |

**Files created:** ~25 new files (all small)
**Files deleted:** 0 (keep originals until verified)
**Risk:** Medium — full restructure, but no logic changes

---

## Bundle 1 — Stability & Hotkeys

> **Goal:** Fix the critical bugs. Centralize hotkey management.

| Type | Item |
|------|------|
| 🐛 Fix | **B1** — Hotkey stale closure. Move to `hooks/useHotkeys.js` with refs for current state |
| 🐛 Fix | **B5** — Density slider max → 120 (one-line change in `RangeRow`) |
| 🐛 Fix | **B10** — Rename PDF button to "↓ CONFIG (PDF seed)" so label matches behavior |
| 🐛 Fix | **B7** — Guard `analyzeAudio` rAF scheduling with `runningRef` check |
| 🐛 Fix | **B9** — Wrap `CanvasPanel` in a React error boundary |
| 🎛️ UX | **U21** — Keyboard shortcut cheat sheet overlay (triggered by `?`) |

**Scope:** Small — mostly 1–5 line fixes + one new hook

---

## Bundle 2 — Undo & History

> **Goal:** Cmd+Z / Cmd+Shift+Z. This unlocks fearless experimentation.

| Type | Item |
|------|------|
| ✨ Feature | `state/history.js` — undo/redo wrapper around the reducer (20-step stack) |
| ✨ Feature | Cmd+Z = undo, Cmd+Shift+Z = redo (add to `useHotkeys`) |
| 🎛️ UX | **U7** — Double-click any slider to reset to preset default |
| 🎛️ UX | Visual indicator in master bar: "↶ 4" showing undo depth |

**Scope:** Medium — history wrapper is ~60 lines, rest is wiring

---

## Bundle 3 — Parameter Exploration

> **Goal:** Pin/lock params + per-param randomize. The exploration toolkit.

| Type | Item |
|------|------|
| ✨ Feature | **F1** — Lock icon (🔒/🔓) on every slider in P04. Locked params survive randomize/evolve |
| ✨ Feature | **F9** — 🎲 dice button per slider. Click = randomize just that param |
| ✨ Feature | Global "Randomize Unlocked" button in P04 header |
| 🎛️ UX | **U9** — Preset match indicator. Subtle dot/badge when current params ≠ preset defaults |
| 🎛️ UX | **U6** — Click-to-type on slider readout values |

**Scope:** Medium — lock state is a Set in reducer, UI is per-slider additions

---

## Bundle 4 — Preset & Layout Polish

> **Goal:** Make the 13 presets scannable. Clean up layout panels.

| Type | Item |
|------|------|
| 🎛️ UX | **U10** — Group preset buttons: Classic · Rendah · CA · Davis with section dividers |
| 🎛️ UX | **U1** — Progressive disclosure: default P02, P03, P05, P06 collapsed |
| 🎛️ UX | **U14** — Replace COMPACT/TALL with drag-resize handle on canvas bottom |
| 🎛️ UX | **U18** — Category chips show "enabled/total" count (e.g., "organic 12/18") |
| 🐛 Fix | **B5** — Density slider max → 120 (if not done in B1) |

**Scope:** Small — UI-only changes, no logic

---

## Bundle 5 — Canvas & Preview

> **Goal:** Make the canvas feel like a real art preview, not a debug view.

| Type | Item |
|------|------|
| ✨ Feature | **U15** — Fullscreen preview mode (`F` key). Hides all panels, shows canvas only |
| ✨ Feature | **U12** — Scroll-to-zoom + drag-to-pan on canvas |
| 🎛️ UX | **U11** — Canvas corner coordinates visible on hover only |
| 🎛️ UX | **U13** — Background toggle: palette bg / transparent (checkerboard) / white |
| 🎛️ UX | **U24** — Pulsing green border on canvas when EVOLVE is active |

**Scope:** Medium — zoom/pan is the most complex piece (~80 lines)

---

## Bundle 6 — Audio & Stimulus

> **Goal:** Make audio-reactive mode actually usable in different environments.

| Type | Item |
|------|------|
| ✨ Feature | **U20** — Master audio sensitivity/gain slider in P06 |
| ✨ Feature | **U21** — Audio input source selector (dropdown of available devices) |
| ✨ Feature | **F25** — Audio file input: accept MP3/WAV drag-drop as stimulus source |
| 🎛️ UX | **U19** — Bigger meters (12px+), beat meter flashes green on pulse |
| 🎛️ UX | **U22 partial** — Scrolling waveform mini-visualizer replacing flat meters |
| 🐛 Fix | **B6** — `switchToMicrophone()` actually switches (Processing side) |
| 🐛 Fix | **B2** — Guard `AudioRouter.pde` Minim import with conditional compile comment |

**Scope:** Medium — audio gain is simple, file input is moderate, waveform is ~60 lines

---

## Bundle 7 — Export & Output

> **Goal:** Export pipeline that works for print, web, and sharing.

| Type | Item |
|------|------|
| ✨ Feature | **F4** — Config import: "Load JSON" drag-drop zone in P05 → re-rolls full state |
| ✨ Feature | **F5** — URL-encoded state: seed + palette + composition in URL hash. Copy = share |
| ✨ Feature | **U26** — Export progress indicator (spinner/bar during rasterization) |
| ✨ Feature | **F19** — Print pre-flight: CMYK gamut warning, bleed indicator, DPI readout |
| 🎛️ UX | **U25** — Output panel defaults expanded |
| 🎛️ UX | **U27** — Delete individual snapshots + "clear all" button |

**Scope:** Medium-Large — config import is ~40 lines, URL encoding is ~30 lines, pre-flight is UI-only

---

## Bundle 8 — Davis Mode & Curation

> **Goal:** Level up the "let it run, save what hits" workflow.

| Type | Item |
|------|------|
| ✨ Feature | **F2** — Variation grid: 4-up / 9-up seed comparison view |
| ✨ Feature | **U23** — Side-by-side favorite comparison (select two, split view) |
| 🎛️ UX | **U22** — Favorite thumbnails: render a tiny SVG snapshot at save time |
| 🎛️ UX | **U24** — More dramatic EVOLVE indicator (pulsing canvas border) |
| ✨ Feature | **F22** — Batch export: run seeds 1–N, export all PNGs |

**Scope:** Large — variation grid is the biggest piece (~120 lines). Consider splitting across 2 sessions.

---

## Bundle 9 — Asset Pipeline

> **Goal:** User SVG upload + better asset browsing.

| Type | Item |
|------|------|
| ✨ Feature | **F6** — SVG drag-drop upload in P02. Parse viewBox, auto-detect category, add to live pool |
| ✨ Feature | **U16** — Large tooltip preview on asset hover (grid view) |
| ✨ Feature | **U17** — Multi-select assets (Shift+click range, Cmd+click toggle) |
| ✨ Feature | **F15** — Inline weight/density quick-edit (click to cycle) |
| 🎛️ UX | Asset upload validation: reject non-SVG, show parse errors |

**Scope:** Medium — drag-drop + SVG parsing is ~80 lines, rest is UI

---

## Bundle 10 — Live Performance

> **Goal:** Turn KC into a stage-ready tool.

| Type | Item |
|------|------|
| ✨ Feature | **F7** — WebMIDI input: map physical knobs → params via routing table |
| ✨ Feature | **F7b** — OSC bridge: WebSocket server on `localhost:9001` for TouchDesigner/Resolume |
| ✨ Feature | **F16** — Composition crossfader: interpolate between two presets |
| ✨ Feature | **F18** — Gallery/presentation mode (fullscreen + info overlay) |
| ✨ Feature | **F8** — Timelapse/animation export (capture evolve frames → WebM) |

**Scope:** Large — MIDI is ~100 lines, OSC bridge is ~60 lines, crossfader is ~50 lines

---

## Bundle 11 — Physics & Animation

> **Goal:** Bring HYPE-level behaviors to the browser.

| Type | Item |
|------|------|
| ✨ Feature | **F12** — Attractor/repulsor force fields (click to place, assets respond) |
| ✨ Feature | **F13** — `engine/oscillator.js` — sine/triangle/saw oscillation on any placement property |
| ✨ Feature | **F11** — Blend modes per z-tier (multiply, screen, overlay via SVG `mix-blend-mode`) |
| ✨ Feature | **F10** — Palette editor: HSL wheel + complementary/analogous auto-gen |
| 🎛️ UX | Visual force field indicators on canvas (subtle gradient circles) |

**Scope:** Large — attractor math is ~80 lines, oscillator is ~50 lines

---

## Bundle 12 — Polish & Responsive

> **Goal:** Final quality pass.

| Type | Item |
|------|------|
| 🎛️ UX | **U3** — Responsive breakpoints: 2-col at ≤1200px, 1-col at ≤768px |
| 🎛️ UX | **U28** — Replace footer with live data (render time, memory, activity) |
| 🎛️ UX | **U29** — Proportional font for labels, mono for data values only |
| 🎛️ UX | **U30** — Color accessibility: shape indicators alongside color |
| 🎛️ UX | **U31** — Consistent border style system |
| ✨ Feature | **F23** — Light theme / skin system for projector environments |
| ✨ Feature | **F17** — Networked jamming (WebRTC, stretch goal) |

**Scope:** Medium — responsive is ~40 lines CSS, rest is polish

---

## Session Map

```
 Bundle 0 ─── Foundation Refactor (REQUIRED FIRST)
    │
    ├── Bundle 1 ─── Stability & Hotkeys
    │      │
    │      └── Bundle 2 ─── Undo & History
    │             │
    │             └── Bundle 3 ─── Parameter Exploration
    │
    ├── Bundle 4 ─── Preset & Layout Polish
    │
    ├── Bundle 5 ─── Canvas & Preview
    │
    ├── Bundle 6 ─── Audio & Stimulus ──── Bundle 10 ─── Live Performance
    │
    ├── Bundle 7 ─── Export & Output
    │      │
    │      └── Bundle 8 ─── Davis Mode & Curation
    │
    ├── Bundle 9 ─── Asset Pipeline
    │
    ├── Bundle 11 ── Physics & Animation
    │
    └── Bundle 12 ── Polish & Responsive
```

> Bundles 1–12 can be done in any order after Bundle 0, **except** where arrows show dependencies (2 needs 1, 3 needs 2, 8 needs 7, 10 needs 6).

---

## Per-Bundle Code Rules

Every session must follow:

- [ ] No new file > 200 lines
- [ ] No component takes > 8 props — use context
- [ ] All state changes go through `dispatch(action)`
- [ ] New data → `data/` folder, new logic → `engine/`, new UI → `panels/` or `components/`
- [ ] Extract, don't inline — if you write a helper > 10 lines, it gets its own file
- [ ] Name actions: `VERB_NOUN` format (`SET_SEED`, `TOGGLE_ASSET`, `APPLY_PRESET`)
- [ ] CSS: use tokens from `tokens.css`, no magic hex values in components
