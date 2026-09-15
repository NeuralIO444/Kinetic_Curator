# Kinetic Curator

A modern generative art engine and live visual performance tool built with React, Vite, and SVG. Inspired by the workflow of Joshua Davis and the generative algorithms of the demoscene, Kinetic Curator allows artists to build "curated chaos"—intricate, mathematically driven compositions that react to live audio and evolve autonomously.

![UI Overview](docs/ui_audit_1778535473448.webp)

## Core Philosophy: "Curated Chaos"

Kinetic Curator is not a blank canvas; it is a synthesis engine. You curate the parameters (the layout grid, the SVG assets, the color palettes) and let the random seed drive the chaos. By combining algorithmic layout modes (Fibonacci, CA, Perlin Flow) with live microphone input and dynamic seed mutation, the tool functions like a generative synthesizer.

## Features

- **Live SVG Rendering Engine:** Harnesses React to instantly re-render thousands of SVG nodes across multiple generative layout algorithms (Fibonacci, Grid, Cellular Automata, Orbit, Flow, etc.).
- **Audio Reactivity:** Built-in Web Audio API support. Route live microphone data or load MP3/WAV files to drive the scale, density, and count of the generative elements via transient (beat) detection.
- **Generative Autopilot (Davis Mode):** Time- or beat-based Evolve with optional **morphing** parameter transitions, continuous LFO life, and phrase/loop clocks.
- **Export Pipeline:** High-resolution PNG snapshots (up to 8K) and WebM recording from the live SVG canvas.
- **Save & Recall State:** Favorites for seed + layout + palette; PNG snapshots include JSON sidecars.

## Technology Stack

- **Framework:** React 19 + Vite 8
- **State:** Zustand
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

### Option A — GitHub Pages (already wired)

1. Open the repo on GitHub → **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the **Deploy to GitHub Pages** workflow manually under Actions).
4. After the workflow succeeds, the site is at:

   **https://neuralio444.github.io/Kinetic_Curator/**

(Exact URL uses your GitHub username/org casing.)

The workflow lives in `.github/workflows/deploy-pages.yml` and builds `app/` with `base: /Kinetic_Curator/`.

### Option B — Vercel (root URL, great for custom domains)

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import this repo.
2. Framework preset can be **Other**; `vercel.json` already sets:
   - build: `cd app && npm ci && VITE_BASE=/ npm run build`
   - output: `app/dist`
3. Deploy. You’ll get a URL like `https://kinetic-curator.vercel.app`.

Mic/audio works on HTTPS (required by browsers for `getUserMedia`).

### Option C — Netlify

- Build command: `cd app && npm ci && VITE_BASE=/ npm run build`
- Publish directory: `app/dist`

## Architecture & Further Reading

- [Architecture Document](docs/architecture.md)
- [Kinetic Manifesto](docs/manifesto.md)

## Hotkeys

- `Space` — Pause / Resume
- `S` — PNG Snapshot
- `F` — Favorite current seed/config
- `E` — Toggle Evolve
- `N` — New seed
- `G` — Toggle fullscreen
- `Cmd+Z` / `Cmd+Shift+Z` — Undo / Redo
- `?` — Hotkey overlay

## License

MIT License. See `LICENSE` for details.
