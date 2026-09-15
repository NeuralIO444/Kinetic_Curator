# Kinetic Curator

A modern generative art engine and live visual performance tool built with React, Vite, and SVG. Inspired by the workflow of Joshua Davis and the generative algorithms of the demoscene, Kinetic Curator allows artists to build "curated chaos"—intricate, mathematically driven compositions that react to live audio and evolve autonomously.

![UI Overview](docs/ui_audit_1778535473448.webp)

**Current release: [0.8.0](CHANGELOG.md)** — pure placement pipeline, project JSON, RENDER / BATCH / ACCUM, setlist morph, CI golden fixture.

## Core Philosophy: "Curated Chaos"

Kinetic Curator is not a blank canvas; it is a synthesis engine. You curate the parameters (the layout grid, the SVG assets, the color palettes) and let the random seed drive the chaos. By combining algorithmic layout modes (Fibonacci, CA, Perlin Flow) with live microphone input and dynamic seed mutation, the tool functions like a generative synthesizer.

## Reproducibility

**Seed alone does not guarantee an identical PNG across quality presets.** Live quality caps change how many placements are drawn and therefore how the seeded PRNG is consumed.

- **Full project JSON** (OUTPUT → ↓ PROJECT) is the reproducible unit: seed, palette, layout, enabled assets, weight overrides, quality.
- Audio, LFO life, and Evolve are **live-only** and are not part of deterministic stills.
- **RENDER FINAL** (UNCAPPED off) matches the live preview; UNCAPPED may densify then restore live caps.
- **ACCUM** stills export the **pixel trail buffer** (live resolution, upscaled) — not a pure SVG DOM snapshot.

## Features

- **Live SVG engine** — React + SVG nodes across layout modes (Fibonacci, Grid, CA, Orbit, Flow, Swarm, …).
- **Audio reactivity** — mic or file drives scale, opacity, and evolve-on-beat.
- **Davis mode** — time/beat Evolve, morph transitions, phrase clocks, continuous LFO life.
- **Hits setlist** — ordered favorites, 1–9 recall, Enter advances, morph layout A→B.
- **Weights** — per-asset H/M/L + category bulk mix before weighted pick.
- **Export**
  - SNAP / **RENDER FINAL** (optional UNCAPPED)
  - **BATCH ×N** — sequential seeds → PNG + JSON sidecar
  - **ACCUM** trails (LAYOUT toggle) + CLEAR ACCUM
  - WebM record · project import/export · autosave
- **Perf** — quality caps, gloss LOD, enabled-only symbol sheet, stable placement keys.

## Technology Stack

- **Framework:** React 19 + Vite 8
- **State:** Zustand slices + `useApp` dispatch facade + typed event bus
- **Styling:** CSS custom properties (dark creative-tool UI)
- **Export:** Canvas API + MediaRecorder
- **CI:** ESLint, `npm run selfcheck` (golden placement SHA), Playwright smoke

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
| `npm run selfcheck` | Placement determinism + golden hash |
| `npm run test:e2e` | Playwright smoke (needs build + browsers) |

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
