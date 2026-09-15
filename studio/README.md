# studio — headless render farm

Backend A of [`docs/BACKEND_V2_PLAN.md`](../docs/BACKEND_V2_PLAN.md) §3.A ([#74](https://github.com/NeuralIO444/Kinetic_Curator/issues/74)).
Renders project JSON to PNG/MP4 offline (headless Chromium — no visible browser, no tab).

```
project.json → app/src/gl/exportStill.mjs (WebGL2, headless Chromium) → PNG → ffmpeg → MP4
```

The stills path is the **same GPU pipeline** the app uses for finals:
project → `resolveLayers` → `buildSceneContract` → offscreen WebGL2 render →
readback. **No geometry math is reimplemented here or in Python** — that is
the rule in §2.1, and the golden-hash fixture
(`app/src/engine/goldenPlacement.selfcheck.mjs`) depends on it. Since #191
(#192), resvg is retired from finals: the SVG emitter (`studio/render.mjs`)
stays in-repo only as the dev-only parity reference the GPU harness diffs
against, and its `resolveLayers()` remains the shared layer plumbing the GL
path uses.

## Install

```sh
brew install ffmpeg            # video assembly only
cd app && npx playwright install chromium   # the GPU render paths run headless Chromium
```

If Chromium is missing, `render`/`batch`/`video` **refuse** (non-zero exit)
rather than rendering a different recipe.

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

# 500 editions, one PNG + one JSON sidecar each
python3 studio/studio.py batch my.project.json -o editions/ --count 500 --start-seed 0 --res 2

# re-render a manifest and prove byte-identical output
python3 studio/studio.py verify editions/manifest.json

# fixed-timestep frame sequence → MP4
python3 studio/studio.py video my.project.json -o out.mp4 \
    --fps 30 --duration 4 --res 1920x1080 \
    --ramp displacement=0:120 --ramp jitter=0:90
```

`video --accum` and `batch --accum` exit non-zero. ACCUM is a still stack.
Video is `--motion`. Live WEBM in the tab does not record the ACCUM buffer.

> `studio/render.mjs` is **not** an export path anymore. `node
> studio/render.mjs my.project.json --out out.svg` emits the dev-only SVG
> parity reference (#192) — for diffing against the GPU candidate, not for
> shipped output. Shipped output is raster-only via the GPU readback path.

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

## Run manifests, structured logging, verify

Every `batch`/`render`/`video` run writes a **run manifest v2**
(`manifest.json` in the batch outdir, `<stem>.manifest.json` next to a
still): run id, start/end time, git sha of the code, the exact command and
flags, SHA-256 content hashes of every input (project JSON, audio sidecar),
and per-edition results (seed, duration, GPU, output file hash, sidecar
path). Progress is logged twice — the terminal lines look the same as
before, and a `run-<id>.jsonl` event stream on disk carries every event as
parseable JSON.

Failures are classified, and the class decides the behavior:

- **user-error** (bad project, missing Chromium): fail fast, with how to fix it.
- **degradable** (malformed `--audio` sidecar): warn loudly, render without
  audio, record it in the manifest.
- **transient** (a render timeout): retry once, then record and continue.
- **bug** (anything else): fail loud, with diagnostics. Never swallowed.

`studio.py verify <manifest>` re-renders every edition and compares output
hashes — byte-identical output, proven by re-running. Honest limitations
are documented in [`docs/RUN_MANIFEST.md`](../docs/RUN_MANIFEST.md):
different GPUs/drivers can differ by a pixel or two (that's what the parity
tolerance is for), and audio-reactive renders are deterministic only given
the recorded envelope, which the manifest pins by hash.

## Aspect ratio

The canvas is 1000×700 (10:7). A `--res` with a different ratio (e.g. 7680×4320)
letterboxes with `preserveAspectRatio="xMidYMid meet"`; the background rect is
deliberately oversized so it fills the bars. Use a scale factor (`--res 4`) to
keep the canvas ratio exactly.

## Fidelity vs. the live tab

The GPU export and the live preview share one kernel and one scene contract;
the parity harness (`app/src/gl/parity/`, wired into `npm run selfcheck`)
diffs them on fixed seeds. Known, intentional differences:

| | Live tab | GPU export |
|---|---|---|
| Gradient materials (plate / wash / stipple) | rendered | **not rendered** — the GL backend has no gradient shading; studio stills warn on stderr when a project uses one, and the sidecar keeps the authored value on record (#168) |
| `mix-blend-mode: plus-lighter` | supported | mapped to `screen` (matches the SVG reference substitution; recorded in the sidecar, #96) |
| FX grain / displace / tear | `feTurbulence` | GPU noise — same structure, subtly different pattern (excluded from the determinism contract, like audio/LFO) |
| rasteriser | Canvas2D/SVG | WebGL2 — antialiasing differs at shape edges |

## Not covered

- **Swarm without a bake.** `swarm` / `hype` layers replay deterministically
  when the project carries a particle bake (`bakeSwarmItems`, #63); an
  unbaked swarm layer has nothing deterministic to re-derive and falls back
  to `buildPlacements`.
- **ACCUM movies / batch trails.** `render --accum` restacks N GPU frames into
  one still. `video` and `batch` refuse `--accum` (#137). Live WEBM does not
  sample the tab buffer.
- **Audio / beat / evolve modulation** — live-only state, absent from the
  project document by design.

## Check

```sh
node studio/selfcheck.mjs      # asserts the parity reference agrees with the kernel
python3 studio/run_manifest_selfcheck.py   # manifest schema, input hashing, failure classes,
                                           # log format; plus a real batch → verify GPU round trip
                                           # when headless Chromium is present
cd app && npm run selfcheck    # golden hash + GL parity — must stay green, unchanged
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
