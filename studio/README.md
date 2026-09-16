# studio — headless render farm

Backend A of [`docs/BACKEND_V2_PLAN.md`](../docs/BACKEND_V2_PLAN.md) §3.A ([#74](https://github.com/NeuralIO444/Kinetic_Curator/issues/74)).
Renders project JSON to PNG/MP4 offline, no browser.

```
project.json → node render.mjs (the app's real JS kernel) → SVG → resvg → PNG → ffmpeg → MP4
```

`render.mjs` imports `app/src/engine/buildPlacements.js` directly. **No geometry
math is reimplemented here or in Python** — that is the rule in §2.1, and the
golden-hash fixture (`app/src/engine/goldenPlacement.selfcheck.mjs`) depends on it.

## Install

```sh
brew install resvg ffmpeg     # native binaries; the CLI does the rasterising/encoding
```

Python is stdlib-only, so `python3 studio/studio.py …` works as-is. `uv run`
also works if you prefer a pinned interpreter:

```sh
cd studio && uv run studio.py --help
```

## Getting a project JSON

In the app: **OUTPUT → save project**. Or pull the browser's autosave out of
devtools with `localStorage.getItem('kc:project:v1')`. Legacy `{seed, palette,
layout}` exports are accepted too (`parseProject` normalises them).

## Commands

All commands take `--res` (either `WxH` in pixels or a scale factor of the
1000×700 canvas), `--seed`, `--uncapped` (FINAL_CAPS density instead of the
project's quality caps), `--background` (`#rrggbb` or `none`) and `--jobs`.

```sh
# one still at 8K
python3 studio/studio.py render my.project.json -o out.png --res 7680x4320 --sidecar

# ACCUM trail still (not a movie)
python3 studio/studio.py render my.project.json -o trails.png --accum --steps 24

# vector out, no raster step
python3 studio/studio.py svg my.project.json -o out.svg

# 500 editions, one PNG + one JSON sidecar each
python3 studio/studio.py batch my.project.json -o editions/ --count 500 --start-seed 0 --res 2

# fixed-timestep frame sequence → MP4
python3 studio/studio.py video my.project.json -o out.mp4 \
    --fps 30 --duration 4 --res 1920x1080 \
    --ramp displacement=0:120 --ramp jitter=0:90
```

`video --accum` and `batch --accum` exit non-zero. ACCUM is a still stack.
Video is `--motion`. Live WEBM in the tab does not record the ACCUM buffer.

`render.mjs` is usable on its own if you only want the SVG:

```sh
node studio/render.mjs my.project.json --out out.svg --seed 42 --uncapped
```

### Video motion

There is no time axis in the kernel — `computePlacements` is a pure function of
the project. Motion therefore comes from two deterministic sources:

- the **breath** transform (a verbatim copy of `useCanvasLife`'s two-line LFO),
  driven by `frame / fps`. Off when `lifeDrift` is 0. It is very subtle on its own.
- `--ramp <layoutParam>=<from>:<to>`, repeatable, interpolated linearly across
  the clip and applied to every layer. Scalar params only.

Every frame is a pure function of `(project, frame)`, so a re-render is
bit-identical — that's the point of doing video here instead of screen-capturing
the live canvas.

## Aspect ratio

The canvas is 1000×700 (10:7). A `--res` with a different ratio (e.g. 7680×4320)
letterboxes with `preserveAspectRatio="xMidYMid meet"`; the background rect is
deliberately oversized so it fills the bars. Use a scale factor (`--res 4`) to
keep the canvas ratio exactly.

## Fidelity vs. the browser

Verified against the live app (same project, both rendered at 1000×700): identical
layer count, identical item count, identical per-colour item histogram, ~0.4%
difference in painted-pixel coverage and 0.018 L1 distance on the RGB histogram.

Known, intentional differences:

| | Browser | Here |
|---|---|---|
| `--ink` / `--accent` | CSS custom properties | baked into a deduped `<symbol>` per (asset, ink, accent) — resvg has no `var()` |
| `filter: hue-rotate()` | CSS filter | `<feColorMatrix type="hueRotate">` |
| `mix-blend-mode: plus-lighter` | supported | mapped to `screen`; SVG2/resvg has no `plus-lighter` |
| `font-family: ui-monospace` | SF Mono | `--monospace` flag, default **Menlo** (resvg's own default is Courier New) |
| rasteriser | Canvas2D | resvg — antialiasing differs at shape edges |

## Not covered

- **`swarm` / `hype` modes.** Those are a live particle sim (`useSwarmTick`,
  driven by `Date.now()`), not a placement function; there is nothing
  deterministic to re-derive offline. Such layers fall back to
  `buildPlacements`, which is *not* what the browser draws for them.
- **ACCUM movies / batch trails.** `render --accum` restacks N SVG frames into
  one still. `video` and `batch` refuse `--accum` (#137). Live WEBM does not
  sample the tab buffer.
- **Audio / beat / evolve modulation** — live-only state, absent from the
  project document by design.

## Check

```sh
node studio/selfcheck.mjs      # asserts the emitter agrees with the kernel
cd app && npm run selfcheck    # golden hash — must stay green, unchanged
```
