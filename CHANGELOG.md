# Changelog

## 0.9.0 — 2026-09-15

### Kernel v1 (sleeper math backend)

**Seed-driven looks change.** Project JSON still loads; re-favorite hits if a seed no longer matches your eye. There is **no** dual legacy RNG path.

- **K0** — Channel RNG (`dens` / `geo` / `attr` / `asset` / `color` / `noise` / `dyn`). Index-stable density skips and attributes; per-index geo streams; index-stable asset + color picks (#58).
- **K1** — Instanced Simplex/fBm via `createNoise(seed)` (no shared global perm table). Placement displacement + particle wind use isolated instances (#59).
- **K2** — Sampler registry (`getSampler` / `registerSampler`). All layout modes migrated; power sampler **`stratified`** (jittered stratum, seed-stable) (#60).
- Golden placement fixture retargeted to **`kernel.v1`** hash `e892d112…a9a2` (#58 / #61).

Plan: [docs/KERNEL_V1_PLAN.md](docs/KERNEL_V1_PLAN.md). Post-MVP: fields (#62), bake particles (#63), color channel (#64).

### Docs / CI
- README reproducibility updated for index-stable channels.
- Architecture documents kernel modules under `engine/kernel/`.
- `npm run selfcheck` includes rng + noise + sample checks.

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
