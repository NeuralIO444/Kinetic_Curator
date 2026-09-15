# Kinetic Curator

A modern generative art engine and live visual performance tool built with React, Vite, and SVG. Inspired by the workflow of Joshua Davis and the generative algorithms of the demoscene, Kinetic Curator allows artists to build "curated chaos"—intricate, mathematically driven compositions that react to live audio and evolve autonomously.

![UI Overview](docs/ui_audit_1778535473448.webp)

## Core Philosophy: "Curated Chaos"

Kinetic Curator is not a blank canvas; it is a synthesis engine. You curate the parameters (the layout grid, the SVG assets, the color palettes) and let the random seed drive the chaos. By combining algorithmic layout modes (Fibonacci, CA, Perlin Flow) with live microphone input and dynamic seed mutation, the tool functions like a generative synthesizer.

## Reproducibility

**Seed alone does not guarantee an identical PNG across quality presets.** Live quality caps change how many placements are drawn and therefore how the seeded PRNG is consumed.

- **Full project JSON** (OUTPUT → ↓ PROJECT) is the reproducible unit: seed, palette, layout, enabled assets, weight overrides, quality.
- Audio, LFO life, and Evolve are **live-only** and are not part of deterministic stills.
- **RENDER FINAL** (UNCAPPED off) matches the live preview; UNCAPPED may densify then restore live caps.

## Features

- **Live SVG Rendering Engine:** React re-renders thousands of SVG nodes across generative layout modes (Fibonacci, Grid, CA, Orbit, Flow, etc.).
- **Audio Reactivity:** Web Audio (mic or file) drives scale, density, and motion via beat detection.
- **Davis Mode:** Time- or beat-based Evolve with optional morph transitions, continuous LFO life, and phrase clocks.
- **Export:** PNG snapshots (up to 8K), WebM recording, deliberate **RENDER FINAL**, project import/export.
- **Save & Recall:** Favorites tray, project autosave, weight mix controls.

## Technology Stack

- **Framework:** React 19 + Vite 8
- **State:** Zustand slices + `useApp` dispatch facade + typed event bus
- **Styling:** CSS custom properties (dark creative-tool UI)
- **Export:** Canvas API + MediaRecorder

## Installation & Setup (local)

```bash
git clone https://github.com/NeuralIO444/Kinetic_Curator.git
cd Kinetic_Curator/app
npm install
npm run dev
```

Open **http://localhost:5173**.

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

- [Architecture Document](docs/architecture.md)
- [Kinetic Manifesto](docs/manifesto.md)
- [Changelog](CHANGELOG.md)

## Hotkeys

- `Space` — Pause / Resume
- `S` — PNG Snapshot
- `F` — Favorite current seed/config
- `E` — Toggle Evolve
- `N` — New seed
- `G` — Toggle fullscreen
- `Cmd+Z` / `Cmd+Shift+Z` — Undo / Redo
- `?` — Hotkey overlay
- `1–9` — Recall favorites when the hits tray is focused

## License

MIT License. See `LICENSE` for details.
