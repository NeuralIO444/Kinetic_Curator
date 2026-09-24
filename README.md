# Kinetic Curator

**KC-1** — a generative art instrument for live visual performance. React + Vite + one WebGL2 pipeline. What plays is what renders.

Live: [neuralio444.github.io/Kinetic_Curator](https://neuralio444.github.io/Kinetic_Curator/)

![KC-1 — a terrarium, not a DAW](docs/kc1-og.jpg)

*A terrarium, not a DAW.* You curate plates, palettes, and voices. The seed and the wind do the rest.

**Release on `main` (2026-09-23):** **[0.9.0](CHANGELOG.md)** kernel + the live GPU instrument. Engine spines A–G merged, governor R1–R4 landed, Night Migration 30/60 sign-off recorded ([docs/EMBARGO.md](docs/EMBARGO.md) — Stage 1 unfrozen). Roadmap: [docs/ROADMAP_V1.md](docs/ROADMAP_V1.md). See [Now](#now-on-main).

## Now on main

The picture has mass and the flock keeps its own clock (dt loop, heading spring, shared wind). What plays is what renders, at one readout.

**Connected and live**

- One WebGL2 loop for canvas and stills (`app/src/gl/liveLoop.mjs`); SVG emitter is a dev-only parity reference.
- Kernel v1 — index-stable placements, channel RNG, sampler registry, K3–K5. SoA swarm with reference-parity goldens.
- Engine spines A–G: dt clock, atlas-cell skip, heading spring + ballistics + life, live mask tint, mode-chip dissolve + slider springs, shared noise + curl wind, bufferSubData.
- PATCH on the track: OFF / MOD / FIELD / FEED with per-mode strength sliders, stable-id targets, and an inline live readout under each patched row (#506 / #507).
- Math matrix, phases 1–2: MOD steering (source motion retunes target weights) and one shared scent field across layers (#509).
- Voice + preset MIX (stepped color, smooth palette, no rebake) with morph-ease arrival; flagship voices + curated road (motion factors #515–#519 filed).
- Flagship voices, 4 content-track cap, track patch round-trip + cap on load, H/M/L asset locker, FADE on the palette bar.
- ACCUM trails, GPU FX (chain compiler + template effects + cost tiers + measured costs), showrunner shed ladder behind one tape readout (budget knob, named stages, FX-stack weight).
- Behave profiles + bio-drives (drives, scent, mold, graze, leak, swell) on one integrator. Audio ballistics shape mic input and the GL loop.
- DAVIS panel (GHOST STATION): Evolve, morph, phrase clock, LFO life, sub-seed streams, BEHAVE readout.

**Not done (do not advertise as shipped)**

- Evolve seed-jitter glide, editable BEHAVE weights (#471 / #479).
- EF rack: fixed finishing chain per FX layer (EF-4 grain-exclusive), post-accum seam, new kinds (#520).
- Shareable recipe URLs, MIDI/OSC build, mobile pass, live-output path (roadmap Stages 2–3).
- Matt-only: icons (#346), M3 calibration (#298), iPhone pass (#270).

**Embargo:** lifted 2026-09-23 (Night Migration sign-off). Stage 1 unfrozen; deferred pile still waits. Plan: [docs/EMBARGO.md](docs/EMBARGO.md). Agents: [AGENTS.md](AGENTS.md) + [docs/ROADMAP_V1.md](docs/ROADMAP_V1.md).

## Philosophy

Not a blank canvas. You assign palettes and instruct placement DNA. *We are not painting; we are breeding variations in a terrarium.* Ghost Station (`E` Evolve) mutates; you snapshot (`S`) and favorite (`F`).

## Reproducibility

**Full project JSON** (OUTPUT → ↓ PROJECT) is the unit: seed, palette, layout, assets, weights, quality, layers.

- Index `i` keeps scale / rotation / alpha / asset / color when count changes.
- RNG channels: `dens` / `geo` / `attr` / `asset` / `color` / `noise` / `dyn`.
- `createNoise(seed)` — no global perm table.
- Golden fixture: **`kernel.v1`**. 0.8 seeds will not match pixel-for-pixel.
- Audio, LFO life, Evolve are **live-only**. Still hashes ignore them.
- RENDER FINAL matches the live preview (UNCAPPED off). ACCUM stills export the trail buffer.

## Features

- **Live instrument** — Fibonacci, Grid, CA, Orbit, Flow, Swarm, Stratified, … same GPU as exports.
- **Stills** — GPU readback 1×–8K PNG + JSON sidecar.
- **Parity** — `npm run selfcheck`; under 10% pixel vs the SVG reference is a pass.
- **FX** — rgbSplit, displace, tear, grain, scanlines, posterize, invert, solarize, edge (+ template effects, no runner change per effect). Chain compiler + cost tiers + measured costs.
- **ACCUM** — phosphor trails, bloom / halation / stipple. FREEZE / CLEAR. Silence is a no-op.
- **Governor** — one tape readout (budget knob, named shed stages, FX-stack weight). The ladder sheds pixels before visible things, FX never culled.
- **Tracks** — KC-1…KC-4 + FX slots (tap-to-arm ghosts); patch links with live readouts; stable-id targets.
- **Audio** — mic or file → scale, opacity, evolve-on-beat, ballistics-shaped envelopes.
- **Davis** — Evolve, morph, phrase clock, LFO life, BEHAVE readout.
- **Hits** — 1–9 recall, Enter advances.
- **Colour** — slot edit / locks, library, harmony + shuffle, FADE.
- **Organisms** — moth / petal bodies, flap, breath, named behave profiles, bio-drives (hunger, scent, mold, graze, leak).
- **Assets** — drop SVG, tags, H/M/L, DUP. Lab / species editor is deferred.
- **Studio farm** — `studio/studio.py` stills, ACCUM, batch, ffmpeg video, gated Curator CLIP.

## Stack

React 19 · Vite 8 · Zustand + `useApp` · `engine/kernel/*` · `app/src/gl/*` · CSS variables · Playwright + `selfcheck`.

## Install

```bash
git clone https://github.com/NeuralIO444/Kinetic_Curator.git
cd Kinetic_Curator/app
npm install
npm run dev
```

http://localhost:5173

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite |
| `npm run build` | Production |
| `npm run lint` | ESLint |
| `npm run selfcheck` | Golden hash + kernel / GL / governor |
| `npm run test:e2e` | Playwright |
| `npm run preflight` | lint → selfcheck → build → e2e |

```bash
python3 studio/studio.py render my.project.json -o out.png --res 7680x4320 --sidecar
python3 studio/studio.py render my.project.json -o trails.png --accum --steps 24
python3 studio/studio.py batch my.project.json -o editions/ --count 500 --start-seed 0 --res 2
python3 studio/studio.py video my.project.json -o out.mp4 --fps 30 --duration 4 --res 1920x1080
```

Needs `ffmpeg` for video and `cd app && npx playwright install chromium` for GPU farm paths.

## Deploy

Pages is already on **GitHub Actions** → [live site](https://neuralio444.github.io/Kinetic_Curator/). Vercel: `vercel.json` builds `app/` with `VITE_BASE=/`. Netlify: `cd app && npm ci && VITE_BASE=/ npm run build` → `app/dist`.

## Docs

- [Engine plan](docs/ENGINE_PLAN.md) — spine A–G, do not redo shipped MIX/MOD
- [Embargo](docs/EMBARGO.md) · [Two planes](docs/TWO_PLANES.md) · [Tempo](docs/TEMPO_AND_CHIPS.md)
- [GL contract](docs/GL_CONTRACT.md) · [ACCUM](docs/ACCUM.md) · [Showrunner](docs/SHOWRUNNER.md)
- [Organic motion](docs/ORGANIC_MOTION.md) · [Noise](docs/NOISE_AND_LAYERS.md) · [Tracks](docs/KC1_LAYERS.md)
- [Manifesto](docs/MANIFESTO.md) · [Changelog](CHANGELOG.md) · [Buglist](docs/BUGLIST.md)

## Hotkeys

`Space` pause · `S` snap · `F` favorite · `E` Evolve · `N` new seed · `G` fullscreen · `Cmd+Z` undo · `?` overlay · `1–9` hits · `Enter` advance setlist

## License

MIT. See `LICENSE`.
