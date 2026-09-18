# Changelog

## Unreleased — one WebGL instrument (2026-09-17)

The SVG split is gone: the live canvas renders through the same WebGL2 GPU
pipeline as the exported stills — one instrument, no preview/final mismatch.
The old SVG emitter survives in-repo only as the dev-only parity reference,
excluded from the shipped bundle (enforced by `gl/phase6.selfcheck.mjs`).
Parity is still proven by a headless selfcheck on fixed seeds (Matt's bar:
under 10% pixel difference is a pass — this is art, not rocket science).

- **Live WebGL loop (#224)** — the visible canvas renders through the same GPU pipeline as stills (`app/src/gl/liveLoop.mjs`): real GPU pixels for PNG captures, same scene contract the export path consumes.

- **Phase 0** — GL scene contract (`docs/GL_CONTRACT.md`) + parity harness, wired into `npm run selfcheck`.
- **Phase 1** — texture-atlas asset rendering on WebGL2.
- **JS↔GL bridge** — `app/src/gl/bridge/` ships JS state into GL textures.
- **Shader debug harness** — dev-only GLSL tooling (compile diagnostics, flag pass, tap points, printf strip, GPU timer); Shader Lab panel lazy-loads behind `import.meta.env.DEV`.
- **Effect-authoring template** + shared GLSL chunk library — one effect = one fragment shader + one param descriptor.
- **Phase 2** — GPU FX library: rgbSplit, displace, tear, grain, blur, scanlines, posterize, invert, solarize, edge as GLSL passes.
- **Phase 3** — layer compositing + mattes on the GPU.
- **Phase 4** — GPU accumulation (ping-pong textures) + bloom / halation / blur-over-time optics.
- **Glow system, no gaussian blur (#308)** — the instrument's gaussian blur is gone: ACCUM optics now run mip-chain bloom + stipple diffusion + a slight chromatic RGB offset. The FX roster's Blur entry is dead on the GPU path until #310 cuts it from the UI.
- **Phase 5** — finals via GPU readback (`app/src/gl/exportStill.mjs`): 1×–8K PNG + JSON sidecar, off-store — the old flip-then-restore mechanism is deleted. resvg retired from finals; the SVG emitter is now a dev-only parity reference.
- **Phase 6** — SVG renderer removed from the shipped bundle; governor retuned (resolution sheds before effects — see `docs/SHOWRUNNER.md`); `maxFxLayers` budgets retired; shed states are always reported, never silent.
- **Quality pillars (#168)** — one kernel, one seed; finals off-store; caps hold; substitutions recorded in the sidecar.
- **Moth bodies remainder (#109)** — second blend ladder + u-driven paint.
- **Organism contacts (#167)** — radius, repel, bounce, swap, breed through one integrator (no second physics engine).
- **Overlay QA (#134)** — ingest/overlay selfchecks wired into the normal selfcheck command.
- **VORTEX RWB preset (#178)** — kaleidoscopic red/white/blue ribbons (fibonacci + soft blobs + displacement; see `docs/VORTEX_RWB.md`).
- **KILN COLUMNS preset (#179)** — lathe-like organic stacks on a dusty matte palette (see `docs/KILN_COLUMNS.md`).

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
