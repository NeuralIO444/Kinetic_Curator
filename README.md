# Kinetic Curator

A modern generative art engine and live visual performance tool built with React, Vite, and SVG. Inspired by the workflow of Joshua Davis and the generative algorithms of the demoscene, Kinetic Curator allows artists to build "curated chaos"—intricate, mathematically driven compositions that react to live audio and evolve autonomously.

![UI Overview](docs/ui_audit_1778535473448.webp)

## Core Philosophy: "Curated Chaos"

Kinetic Curator is not a blank canvas; it is a synthesis engine. You curate the parameters (the layout grid, the SVG assets, the color palettes) and let the random seed drive the chaos. By combining algorithmic layout modes (Fibonacci, CA, Perlin Flow) with live microphone input and dynamic seed mutation, the tool functions like a generative synthesizer. 

## Features

- **Live SVG Rendering Engine:** Harnesses React to instantly re-render thousands of SVG nodes across multiple generative layout algorithms (Fibonacci, Grid, Cellular Automata, Orbit, Flow, etc.).
- **Audio Reactivity:** Built-in Web Audio API support. Route live microphone data or load MP3/WAV files to drive the scale, density, and count of the generative elements via transient (beat) detection.
- **Generative Autopilot (Davis Mode):** Set up a time-based or beat-based "Evolve" interval to automatically mutate the seed, layout parameters, or color palettes without touching the mouse.
- **Export Pipeline:** Capture the canvas as high-resolution (up to 8K) PNG snapshots, or stream the live SVG canvas into a 30fps `.webm` video recording directly from the browser.
- **Save & Recall State:** Favorite generative "hits" on the fly, saving their exact seed and parameter configurations to jump back to them later. All PNG snapshots include JSON sidecar data for reproducibility.

## Technology Stack

- **Framework:** React 18 + Vite
- **Styling:** Custom CSS Custom Properties (Dark Mode / Creative Tool UI)
- **State Management:** React Context API + Custom `useHistory` Hook (Undo/Redo)
- **Exporting:** Canvas API (`canvas.toBlob`), MediaRecorder API (`canvas.captureStream`)

## Installation & Setup

1. Make sure you have Node.js installed.
2. Clone this repository.
3. Navigate to the `app/` directory:
   ```bash
   cd app
   ```
4. Install the dependencies:
   ```bash
   npm install
   ```
5. Start the development server:
   ```bash
   npm run dev
   ```
6. Open your browser to `http://localhost:5173`.

## Architecture & Further Reading

For a deep dive into how the engine processes layout modes and how the state tree is structured, refer to the [Architecture Document](docs/architecture.md).

For the philosophical background and aesthetic inspirations behind the tool, read the [Kinetic Manifesto](docs/manifesto.md).

## Hotkeys

The tool is designed to be "played" like an instrument. Use the following hotkeys to control the engine:

- `Space` — Pause / Resume live painting (useful for freezing a frame)
- `S` — Capture a PNG Snapshot
- `F` — Save the current Seed to Favorites
- `E` — Toggle Auto-Evolve mode ON/OFF
- `N` — Generate a New Seed
- `Cmd+Z` — Undo parameter change
- `Cmd+Shift+Z` — Redo parameter change

## License

MIT License. See `LICENSE` for details.
