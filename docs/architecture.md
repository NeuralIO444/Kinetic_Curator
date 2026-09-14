# Kinetic Curator: Architecture

Declarative React + SVG generative instrument. No canvas draw loop for live preview — assets are React nodes in an `<svg>` tree.

## Composition root

```
App.jsx
  └─ wireEventBus(rawDispatch)     // once
  └─ Shell (composition/)
       ├─ primary zone  → CanvasPanel
       └─ secondary zone → tabbed Layout | Assets | Stimulus | Davis | Output
```

- **PanelRegistry** — panels are data (`id`, `title`, `icon`, `component`, `zone`).
- **Shell** — zero business logic; renders registry by zone. Secondary panels use tabs (#13).
- **eventBus** — typed `emit` / `on`. Panels are emit-only.
- **wireEventBus** — translates domain events → store actions.
- **dispatchPipe** — single pipe with optional throttle + observers.

## State

**Zustand** store composed from slices (`state/slices/*`) + thin `store.js` composer.

Facade: `AppContext` + `useApp(selector)` provides selective subscriptions and a `dispatch(action)` that maps action types to slice mutators.

### Domains
1. **Layout** — `layoutParams` (mode, count, scale, rotate, alpha, turbulence, swarm forces, locks).
2. **Seeds / palette** — deterministic PRNG + palette id.
3. **Audio** — bands, beat pulse, gain, source (mic/file).
4. **Davis** — evolve, morph, phrase loop, favorites.
5. **Export** — snapshots, quality, recording.

History (`state/history.js`) tracks layout/palette changes for undo/redo; ignores high-frequency audio.

## Rendering pipeline

1. Placement engine (`engine/placement.js` + `placement/modes.js`) builds placements from seed + mode.
2. Audio injects into count/scale during render.
3. SVG `<use>` of symbol sprite sheet.
4. Optional spatial-hash swarm particles.

## UX surfaces

- **MasterBar** — FPS, nodes, quality, seed, undo, palette.
- **Favorites tray** — floating hits strip (F to save, click to recall).
- **First-run overlay** — Play Me enables audio + evolve.
- **Hotkey overlay** — `?`.

## Export

`useMediaExport` serializes live SVG → Image → offscreen canvas for PNG / MediaRecorder WEBM (throttled).
