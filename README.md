# Kinetic Curator

A modern generative art engine and live visual performance tool built with React, Vite, and SVG. Inspired by the workflow of Joshua Davis and the generative algorithms of the demoscene, Kinetic Curator allows artists to build "curated chaos"—intricate, mathematically driven compositions that react to live audio and evolve autonomously.

![UI Overview](docs/ui_audit_1778535473448.webp)

**Current release: [0.9.0](CHANGELOG.md)** — Kernel v1 complete (K0–K5: index-stable RNG, instanced noise, sampler registry, scalar fields, particle bake, colour channel) + colour authoring, multi-layer compositing, organisms/bodies, asset ingest, studio offline farm, and staged-eval / SoA performance work.

## Core Philosophy: "Curated Chaos"

Kinetic Curator is not a blank canvas; it is a synthesis engine. You curate the parameters (the layout grid, the SVG assets, the color palettes) and let the random seed drive the chaos. By combining algorithmic layout modes (Fibonacci, CA, Perlin Flow, Stratified, …) with live microphone input and dynamic seed mutation, the tool functions like a generative synthesizer.

## Reproducibility

**Full project JSON** (OUTPUT → ↓ PROJECT) is the reproducible unit: seed, palette, layout, enabled assets, weight overrides, quality, layers.

### Kernel v1 (0.9+)

- Placement identity is **index-stable**: scale / rotation / alpha / asset / color for index `i` do not reshuffle when count or density changes.
- Density skips and attributes use isolated RNG **channels** (`engine/kernel/rng.js`: `dens` / `geo` / `attr` / `asset` / `color` / `noise` / `dyn`).
- Noise displacement uses **`createNoise(seed)`** instances (no global perm table).
- Layout modes are **samplers** (`getSampler`); optional mode **`stratified`** for even coverage.
- **K3** scalar fields (CA density sampling), **K4** particle bake (deterministic swarm stills), **K5** colour assignment channel — all shipped.
- Golden CI fixture version: **`kernel.v1`**. Seeds from **0.8 and earlier will not match** pixel-for-pixel under 0.9 — re-curate favorites if needed.

### Still true

- Quality caps still clamp how many placements draw (per layer); prefer saving **project JSON** over seed alone.
- Audio, LFO life, and Evolve are **live-only** and are not part of deterministic stills.
- **RENDER FINAL** (UNCAPPED off) matches the live preview; UNCAPPED may densify then restore live caps.
- **ACCUM** stills export the **pixel trail buffer**. Offline true-resolution trails: `studio.py render --accum`.

## Features

- **Live SVG engine** — React + SVG nodes across layout modes (Fibonacci, Grid, CA, Orbit, Flow, Swarm, Stratified, …).
- **Multi-layer compositing** — add / reorder / show-hide layers; per-layer blend + opacity; active layer drives LAYOUT / ASSETS / DAVIS edits.
- **Audio reactivity** — mic or file drives scale, opacity, and evolve-on-beat.
- **Davis mode** — time/beat Evolve, morph transitions, phrase clocks, continuous LFO life.
- **Hits setlist** — ordered favorites, 1–9 recall, Enter advances, morph layout A→B.
- **Weights** — per-asset H/M/L + category bulk mix before weighted pick.
- **Colour authoring** — full palette reveal, slot edit / locks, `paletteShift`, user palette library (save / switch / import-export), harmony schemes + shuffle.
- **Organisms / bodies** — moth-style hype organisms, bilateral wings, drop→petal ladders, flap-phase behaviour, material defs.
- **Asset ingest** — paste / drop SVG into overlay; sanitised user assets; duplicate → project overlay.
- **Export**
  - SNAP / **RENDER FINAL** (optional UNCAPPED)
  - **BATCH ×N** — sequential seeds → PNG + JSON sidecar (max 48 in-browser)
  - **ACCUM** trails (LAYOUT toggle) + CLEAR ACCUM
  - WebM record · project import/export · autosave
- **Studio (offline)** — headless render farm (`studio/`): Node kernel → SVG → resvg → PNG/MP4; true-res ACCUM; batch editions; Curator CLIP taste model (rank / more-like-this); generative asset expansion (gated); geometry blend + asset audit.
- **Perf** — quality caps, gloss LOD, enabled-only symbol sheet, stable placement keys, SoA placement fill, staged eval + dirty-flag cache (geometry skipped on pure life/modulation frames).

## Technology Stack

- **Framework:** React 19 + Vite 8
- **State:** Zustand slices + `useApp` dispatch facade + typed event bus
- **Engine:** Pure kernel (`engine/kernel/*`: rng, noise, sample, field, color, bake) + `buildPlacements` + staged eval cache
- **Styling:** CSS custom properties (dark creative-tool UI)
- **Export:** Canvas API + MediaRecorder; offline via `studio/` (resvg + ffmpeg)
- **CI:** ESLint, `npm run selfcheck` (golden placement SHA + kernel / field / color / bake / harmony / organisms / stagedEval / perf checks), Playwright smoke

## Installation & Setup (local)

```bash
git clone https://github.com/NeuralIO444/Kinetic_Curator.git
cd Kinetic_Curator/app
npm install
npm run dev
```

Open **http://localhost:5173**.

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run selfcheck` | Placement determinism + golden hash + kernel / field / color / bake / organisms / staged-eval / perf checks |
| `npm run test:e2e` | Playwright smoke (needs build + browsers) |
| `npm run preflight` | lint → selfcheck → build → e2e |

### Offline studio

```bash
# requires resvg + ffmpeg on PATH
python3 studio/studio.py render my.project.json -o out.png --res 7680x4320 --sidecar
python3 studio/studio.py video my.project.json -o out.mp4 --res 2
```

See [studio/README.md](studio/README.md) for batch, ACCUM, Curator, and generative-asset commands.

## Public deployment

### Option A — GitHub Pages

1. Repo → **Settings → Pages** → Source: **GitHub Actions**.
2. Push to `main` (or run **Deploy to GitHub Pages** under Actions).
3. Site: **https://neuralio444.github.io/Kinetic_Curator/**

### Option B — Vercel

Import the repo; `vercel.json` builds `app/` with `VITE_BASE=/`.

### Option C — Netlify

- Build: `cd app && npm ci && VITE_BASE=/ npm run build`
- Publish: `app/dist`

## Architecture & Further Reading

- [Architecture](docs/architecture.md)
- [Kernel v1 plan](docs/KERNEL_V1_PLAN.md) (incl. v2 SoA / staged-eval addendum)
- [Backend v2 plan](docs/BACKEND_V2_PLAN.md) (studio render farm, Curator, geometry, genassets)
- [Next phase — kernel & backend](docs/NEXT_PHASE.md) (swarm SoA, studio harden, live survivability)
- [Known limitations / buglist](docs/BUGLIST.md)
- [Changelog](CHANGELOG.md)
- [Kinetic Manifesto](docs/manifesto.md)
- [Shipped next-gen map](NEXT_ISSUES.md)

## Hotkeys

- `Space` — Pause / Resume
- `S` — PNG Snapshot
- `F` — Favorite current seed/config
- `E` — Toggle Evolve
- `N` — New seed
- `G` — Toggle fullscreen
- `Cmd+Z` / `Cmd+Shift+Z` — Undo / Redo
- `?` — Hotkey overlay
- `1–9` — Recall setlist slot when the hits tray is focused
- `Enter` / arrows — Advance setlist when tray focused

## License

MIT License. See `LICENSE` for details.
