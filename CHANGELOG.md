# Changelog

## 0.8.0 — 2026-09-15

### Engine / export
- Pure **`buildPlacements`** shared by live preview and final render (#32).
- **RENDER FINAL** with optional **UNCAPPED** density lift (#24).
- **Project document** v1 (seed, palette, layout, assets, weights, quality) + localStorage autosave (#33).
- Runtime **asset weight overrides** + category bulk mix UI (#34).

### Chore
- Removed legacy `KineticCuratorUI/`, `KineticCuratorSketch/`, `design_handoff*`, empty p5 stub (#6 / #38).
- Documented reproducibility contract in README + architecture.
- Closed shipped visual/UX issues that landed on main.

## 0.7.0 — 2026-09-13

### UX
- **Right-column tabs** — Layout / Assets / Stimulus / Davis / Output; last tab persisted (#13).
- **First-run “Play Me” overlay** (#12).
- **Floating Favorites / Hits tray** — 1–9 recall when focused (#8).

### Chore
- Architecture docs aligned with Zustand slices + composition root + event bus.
- Package version bumped; basic CI (lint + build).

## 0.6.0 — 2026-09-13

- Event-bus panel communication; Layout / Davis / Stimulus emit-only subcomponents.
- Composition root (PanelRegistry + Shell + dispatchPipe).
- Placement modes split; Canvas hooks extracted.
- Morph evolve, phrase loop, tooltips on RangeRow.
