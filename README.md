# Kinetic Curator

A generative art engine and live visual performance tool built with React, Vite, and WebGL2. Inspired by the workflow of Joshua Davis and the generative algorithms of the demoscene, Kinetic Curator allows artists to build "curated chaos"—intricate, mathematically driven compositions that react to live audio and evolve autonomously. The live tab is a fast React/SVG preview instrument; finals, editions, and trail stills render through a WebGL2 GPU pipeline with a pixel-parity harness proving the two agree.

![Vortex RWB preset render](docs/vortex-rwb-final.png)

**Current release: [0.9.0](CHANGELOG.md)** — kernel v1 + colour authoring, multi-layer compositing, organisms, asset ingest, and the studio farm. Since 0.9.0 the export spine went GPU: WebGL2 renderer, GPU FX library, GPU accumulation, and 4K/8K stills via GPU readback (see [CHANGELOG unreleased](CHANGELOG.md)).

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

- **Live preview instrument** — React + SVG canvas across layout modes (Fibonacci, Grid, CA, Orbit, Flow, Swarm, Stratified, …). Fast to play; finals render on the GPU.
- **WebGL2 export engine** — the shipped stills path: scene → GPU textures → 4K/8K PNG via readback. The SVG emitter survives in-repo only as the dev parity reference.
- **Pixel parity** — a headless harness diffs the GPU render against the SVG reference on fixed seeds, wired into `npm run selfcheck`.
- **GPU FX library** — 10 effects (rgbSplit, displace, tear, grain, blur, scanlines, posterize, invert, solarize, edge) as GLSL passes, chained per FX layer.
- **GPU accumulation** — HYPE-style trail buffer on GPU ping-pong textures with bloom, halation, and blur-over-time optics.
- **Showrunner governor** — sheds load in a defined order (resolution scaling first, then quality, asset thinning, count clamp, motion freeze). Shed states are reported, never silent.
- **Render quality pillars** — one kernel, one seed; finals render off-store with no live-state mutation; caps hold; substitutions are recorded in the sidecar, never hidden.
- **Multi-layer compositing** — add / reorder / show-hide layers; per-layer blend + opacity; active layer drives LAYOUT / ASSETS / DAVIS edits.
- **Audio reactivity** — mic or file drives scale, opacity, and evolve-on-beat.
- **Davis mode** — time/beat Evolve, morph transitions, phrase clocks, continuous LFO life.
- **Hits setlist** — ordered favorites, 1–9 recall, Enter advances, morph layout A→B.
- **Weights** — per-asset H/M/L + category bulk mix before weighted pick.
- **Colour authoring** — full palette reveal, slot edit / locks, `paletteShift`, user palette library (save / switch / import-export), harmony schemes + shuffle.
- **Organisms / bodies** — moth-style hype organisms, bilateral wings, drop→petal ladders, flap-phase behaviour, material defs.
- **Asset ingest** — paste / drop SVG into overlay; sanitised user assets; duplicate → project overlay.
- **Presets** — shipped looks including KILN COLUMNS (lathe-like organic stacks on dusty matte) and VORTEX RWB (kaleidoscopic red/white/blue ribbons), plus the classic set.
- **Export**
  - SNAP / **RENDER FINAL** (matches the live preview; denser UNCAPPED finals come from the GPU export path)
  - **BATCH ×N** — sequential seeds → PNG + JSON sidecar (max 48 in-browser; big runs go through `studio.py batch`)
  - **ACCUM** trails (LAYOUT toggle) + CLEAR ACCUM
  - WebM record · project import/export · autosave
- **Studio (offline)** — headless render farm (`studio/`): WebGL2 GPU readback stills at any resolution (1×–8K) + PNG sidecar; true-res ACCUM trails; batch editions; video (per-frame GPU renders → ffmpeg MP4); Curator CLIP taste model (rank / more-like-this); generative asset expansion (gated); geometry blend + asset audit.
- **Perf** — quality caps, gloss LOD, enabled-only symbol sheet, stable placement keys, SoA placement fill, staged eval + dirty-flag cache (geometry skipped on pure life/modulation frames).

## Technology Stack

- **Framework:** React 19 + Vite 8
- **State:** Zustand slices + `useApp` dispatch facade + typed event bus
- **Engine:** Pure kernel (`engine/kernel/*`: rng, noise, sample, field, color, bake) + `buildPlacements` + staged eval cache
- **Live render:** React/SVG canvas (fast preview instrument)
- **Finals render:** WebGL2 GPU pipeline (`app/src/gl/*`: texture-atlas assets, GLSL FX, layer compositing, GPU accumulation + bloom, GPU-readback stills) with a dev-only SVG parity reference
- **Styling:** CSS custom properties (dark creative-tool UI)
- **Export:** GPU readback → PNG + JSON sidecar; offline farm via `studio/` (headless Chromium + WebGL2); video via ffmpeg
- **CI:** ESLint, `npm run selfcheck` (golden placement SHA + kernel / field / color / bake / harmony / organisms / stagedEval / perf / GL parity / shader / governor checks), Playwright smoke

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

Stills and editions render on the GPU (headless Chromium + WebGL2) — same
pipeline the app uses for finals, at any resolution up to 8K. If Chromium is
missing the commands refuse rather than rendering a different recipe.

```bash
# one still at 8K (+ JSON sidecar)
python3 studio/studio.py render my.project.json -o out.png --res 7680x4320 --sidecar

# ACCUM trail still (not a movie)
python3 studio/studio.py render my.project.json -o trails.png --accum --steps 24

# 500 editions, one PNG + one JSON sidecar each
python3 studio/studio.py batch my.project.json -o editions/ --count 500 --start-seed 0 --res 2

# fixed-timestep frame sequence → MP4 (needs ffmpeg)
python3 studio/studio.py video my.project.json -o out.mp4 --fps 30 --duration 4 --res 1920x1080
```

Needs: `ffmpeg` on PATH for video, and `cd app && npx playwright install chromium` for the GPU render paths.

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
- [GL scene contract](docs/GL_CONTRACT.md) — the exact interface the WebGL2 backend consumes
- [WebGL Phase 6](docs/WEBGL_PHASE6.md) — SVG retirement + governor retune notes
- [Shader debug harness](docs/SHADER_DEBUG.md) — dev-only GLSL tooling
- [FX layers](docs/FX_LAYERS.md) — the 10-effect stack, SVG live recipe + GPU export recipe
- [ACCUM on GPU](docs/ACCUM.md) — the trail recipe (bloom / halation / blur-over-time)
- [Showrunner](docs/SHOWRUNNER.md) — the realtime performance governor
- [Render quality](docs/QUALITY.md) — the quality pillars: one kernel, one seed, honest exports
- [KILN COLUMNS](docs/KILN_COLUMNS.md) / [VORTEX RWB](docs/VORTEX_RWB.md) — shipped preset notes
- [Kernel v1 plan](docs/KERNEL_V1_PLAN.md) (historical — kernel v1 shipped in 0.9.0)
- [Backend v2 plan](docs/BACKEND_V2_PLAN.md) (historical — the studio farm shipped)
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
