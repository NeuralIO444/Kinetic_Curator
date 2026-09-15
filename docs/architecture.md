# Kinetic Curator: Architecture

Declarative React + SVG generative instrument. Live preview is primarily an `<svg>` tree; optional **accumulation** composites into a persistent canvas buffer.

## Composition root

```
App.jsx
  └─ wireEventBus(rawDispatch)     // once
  └─ useProjectAutosave()
  └─ Shell (composition/)
       ├─ primary zone  → CanvasPanel
       └─ secondary zone → tabbed Layout | Assets | Stimulus | Davis | Output
```

- **PanelRegistry** — panels are data (`id`, `title`, `icon`, `component`, `zone`).
- **Shell** — zero business logic; renders registry by zone. Secondary panels use tabs.
- **eventBus** — typed `emit` / `on`. Panels are emit-only.
- **wireEventBus** — translates domain events → store actions.
- **dispatchPipe** — single pipe with optional throttle + observers.

## State

**Zustand** store composed from slices (`state/slices/*`) + thin `store.js` composer.

Facade: `AppContext` + `useApp(selector)` provides selective subscriptions and a `dispatch(action)` that maps action types to slice mutators.

### Domains
1. **Layout** — `layoutParams` (mode, count, scale, rotate, alpha, blend, shading, hue, locks, **accumulation / accumulationFade**).
2. **Seeds / palette** — deterministic PRNG + palette id.
3. **Audio** — bands, beat pulse, gain, source (mic/file).
4. **Davis** — evolve, morph, phrase loop, favorites / setlist reorder / morph-to-favorite.
5. **Export** — snapshots, quality, recording, batch progress (UI-local).
6. **Assets** — enabled map + runtime weight overrides.
7. **Project** — serialize/parse/autosave (`state/projectDocument.js`).

History (`state/history.js`) tracks layout/palette changes for undo/redo; ignores high-frequency audio.

## Rendering pipeline

1. **`buildPlacements`** (`engine/buildPlacements.js`) — pure: caps → `computePlacements` → weighted assets → color → mirror. Emits stable `item.key`. Shared by live and final paths.
2. Live path: `useCanvasItems` wraps `buildPlacements` with audio/life scale & alpha.
3. SVG `<use>` of **enabled-only** symbol sprite sheet; optional gloss second pass (LOD: off under PERF or node count > 280); blend modes via `mixBlendMode`.
4. Optional spatial-hash swarm particles.
5. **RENDER FINAL** — deliberate still; optional UNCAPPED densifies live state briefly then restores.
6. **BATCH** — loop seeds, download PNG + JSON sidecar (`renderBatch`).
7. **ACCUM** (`useAccumulationBuffer`) — offscreen buffer: fade previous pixels, composite live SVG; display canvas; export reads the buffer when ACCUM is on.

## Reproducibility contract

Seed-only is **not** a bit-identical still across quality presets (count clamps change RNG consumption). **Full project JSON** is the unit of record. Audio / LFO / evolve are live-only. ACCUM history is **pixels**, not SVG DOM.

Golden CI fixture: fixed seed + layout → SHA-256 of canonical placement list (`src/engine/goldenPlacement.selfcheck.mjs`).

## UX surfaces

- **MasterBar** — FPS, nodes, quality, seed, undo, palette.
- **Favorites / setlist tray** — ordered hits (F to save, 1–9 / Enter, morph ↔, reorder).
- **First-run overlay** — Play Me enables audio + evolve.
- **Hotkey overlay** — `?`.
- **Asset weight badges** — H/M/L cycle + category bulk.
- **LAYOUT ACCUM** — trails + FADE slider + CLEAR ACCUM.

## Export

`useMediaExport` serializes SVG → Image → offscreen canvas for PNG / MediaRecorder WEBM. Accumulation path uses `exportAccumulationCanvas`. Project documents via OUTPUT → ↓ PROJECT.

## CI

- Lint + `npm run selfcheck` + production build.
- Playwright smoke: load app, switch tabs, toggle a layout control.
