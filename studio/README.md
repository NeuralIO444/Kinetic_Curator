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

# vector out, no raster step
python3 studio/studio.py svg my.project.json -o out.svg

# 500 editions, one PNG + one JSON sidecar each
python3 studio/studio.py batch my.project.json -o editions/ --count 500 --start-seed 0 --res 2

# fixed-timestep frame sequence → MP4
python3 studio/studio.py video my.project.json -o out.mp4 \
    --fps 30 --duration 4 --res 1920x1080 \
    --ramp displacement=0:120 --ramp jitter=0:90
```

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
- **ACCUM** (`layoutParams.accumulation`). It's a pixel feedback buffer over
  successive live frames, not SVG. Rendering it offline at full resolution is
  the next thing this harness unlocks, but it isn't built.
- **Audio / beat / evolve modulation** — live-only state, absent from the
  project document by design.

## Check

```sh
node studio/selfcheck.mjs      # asserts the emitter agrees with the kernel
cd app && npm run selfcheck    # golden hash — must stay green, unchanged
```

## Curator: favourites → a real taste model (#91)

`curator.py` (issue #75) trains a linear probe on CLIP embeddings of *this
operator's* likes vs passes. Until now every label set fed to it was
synthetic — the model had never seen anyone's actual favourites. This closes
that loop: the app's favourited seeds ("HITS", `F` key, #35) become a
`curator.py` label set without hand-editing JSON.

**A favourite is just a seed + a layout/palette config.** The bridge
(`studio/hits_bridge.py`) takes the app's `↓ HITS` export, treats favourited
seeds as likes, and treats every other seed already rendered in a
`studio.py batch` pool as a pass. A favourite whose seed isn't in the pool
yet gets rendered on demand with `studio.py render`.

```sh
# 1. In the app: tweak a look, press F on the ones you like, then OUTPUT → ↓ HITS
#    (downloads kinetic-curator-hits.json)

# 2. Render the "passes" pool from the same base project (↓ PROJECT export,
#    or reuse the project embedded in the HITS export — see hits.json.project)
python3 studio/studio.py batch base.project.json -o pool/ --count 200

# 3. Bridge favourites -> labels.json (renders any favourite seed missing from pool/)
python3 studio/hits_bridge.py build --hits kinetic-curator-hits.json --pool pool/ --out labels.json

# 4. Embed + train, same as any curator.py label set
python3 studio/curator.py embed pool/
python3 studio/curator.py train --index pool/curator-index.npz --labels labels.json

# 5. Use the trained taste model
python3 studio/curator.py rank --index pool/curator-index.npz --model taste.npz
```

`studio/hits_bridge.py selfcheck` checks the seed-matching logic against a
fake pool — stdlib only, no model, no rendering.

### Honest result: no real favourites exist yet

Nobody has used the `↓ HITS` button in production — `favorites: []` is still
the app's only shipped state for it, and no export or label file exists
anywhere in this repo. **The numbers below are demonstrations of the
pipeline working, not a measurement of anyone's taste.**

Ran the full path end to end with a stand-in `hits.json` (9 arbitrarily
chosen seeds, no real visual criterion — see
`studio/hits_bridge.py`'s docstring example) against a 40-seed pool, all one
composition (`praystation` / `fibonacci`, seed-only variation):

```
41 labels (9 likes / 32 passes), 5-fold CV
  held-out accuracy 0.589 +/- 0.072
  majority baseline 0.781
  held-out ROC-AUC  0.448   (0.5 = chance)
  -> NO BETTER THAN CHANCE
```

That's the honest outcome for an arbitrary split with no real preference
signal behind it, and it matches the pattern from issue #75's original
near-impossible test (0.521 acc / chance on one composition).

### Answering the open question: does CLIP see *this* generator's compositions?

Repeated the #75 positive control cheaply (40 + 40 renders, ~15s to embed on
Apple Silicon MPS) to separate two hypotheses: "CLIP can't tell same-generator
frames apart at all" vs "CLIP separates gross style but not composition."

| Label set | N | held-out acc | baseline | AUC | verdict |
|---|---|---|---|---|---|
| Same composition, seed only (synthetic likes above) | 41 | 0.589 | 0.781 | 0.448 | NO BETTER THAN CHANCE |
| Two distinct render sets (`praystation`/fibonacci vs `dystopia`/grid, 20 each) | 40 | 1.000 | 0.500 | 1.000 | BETTER THAN CHANCE |

This reproduces #75's finding at 1/10th the sample size: CLIP embeddings
separate **gross style/palette/layout-mode changes** trivially, but there is
still no evidence CLIP (or this linear probe) can tell apart frames from the
*same* composition and palette differing only by seed. A real operator's
favourites will mostly be same-composition variations, so — until tested on
real labels — treat "beats baseline" as a live open question, not a given.
Alternate embeddings or hand-built compositional features (issue's own
suggestion) remain untried.

### What's still missing for the acceptance criteria

- **Trained on ≥50 real labels: not done.** No favourites have been
  collected from real use. The `↓ HITS` button and `hits_bridge.py` are the
  missing infrastructure issue #91 asked for; running them on a real
  session's favourites is the next step, not something this change can
  fabricate.
- **"How many labels before it beats baseline?"** — unanswered; needs real
  labels to answer honestly, per the honesty requirement in #91.
