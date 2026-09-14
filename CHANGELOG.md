# Changelog

## 0.7.0 — 2026-09-13

### UX
- **Right-column tabs** — Layout / Assets / Stimulus / Davis / Output; last tab persisted in localStorage (#13).
- **First-run “Play Me” overlay** — enables audio + Evolve on first visit (#12).
- **Floating Favorites / Hits tray** — always-visible strip; click to recall, ↻ or Shift+click to evolve from hit; number keys 1–9 when tray focused (#8).

### Chore
- Removed legacy `KineticCuratorUI/`, `KineticCuratorSketch/`, `design_handoff*`, empty p5 project stub (#6).
- Architecture docs aligned with Zustand slices + composition root + event bus.
- Package version bumped; basic CI (lint + build).

## 0.6.0 — 2026-09-13

- Event-bus panel communication; Layout / Davis / Stimulus emit-only subcomponents.
- Composition root (PanelRegistry + Shell + dispatchPipe).
- Placement modes split; Canvas hooks extracted.
- Morph evolve, phrase loop, tooltips on RangeRow.
