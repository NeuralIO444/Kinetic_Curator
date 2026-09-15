# Changelog

## 0.8.0 — 2026-09-15

### Engine / export
- Pure **`buildPlacements`** shared by live preview and final render (#32).
- **RENDER FINAL** with optional **UNCAPPED** density lift (#24).
- **Project document** v1 (seed, palette, layout, assets, weights, quality) + localStorage autosave (#33).
- Runtime **asset weight overrides** + category bulk mix UI (#34).
- **Batch edition** — N sequential seeds → PNG + JSON sidecar (max 48) (#29).
- **Accumulation buffer** — HYPE-style trails; SNAP/RENDER capture the pixel buffer when ACCUM is on (#28).

### UX / performance
- **Hits setlist** — ordered tray, Enter advances, reorder, morph-to-favorite (#35).
- **Perf LOD** — stable placement keys, enabled-only SVG symbols, gloss skip under PERF / high node count (#36).

### CI / quality
- **`npm run selfcheck`** — determinism + **golden placement SHA** fixture (#37).
- **Playwright smoke** — load app, switch tabs, toggle layout param (#37).
- CI: lint → selfcheck → build → e2e smoke.

### Chore
- Removed legacy `KineticCuratorUI/`, `KineticCuratorSketch/` content targets, `design_handoff*` (#38).
- Reproducibility contract documented in README + architecture.
- Known limitations: [docs/BUGLIST.md](docs/BUGLIST.md).

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
