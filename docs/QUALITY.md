# Render quality

One kernel, one seed, 60 Hz. Live stays 1×. Print is a *still*. Live and
studio agree or refuse — a studio export that silently differs from the
live tab is a bug, and where the renderer can't match, it says so.

## The bar

- **One kernel, one seed, 60 Hz.** The live tab and every export share one
  deterministic kernel (`app/src/engine`) driven by the project seed. Same
  seed, same frame — anywhere.
- **FINAL export is off-store.** RENDER FINAL rasterizes the live
  composition in place; the old uncapped flip/restore mechanism (#107, #191)
  is deleted, not bypassed. Batch walks the seed and puts it back.
  Nothing else in the store is stashed or mutated.
- **Caps hold.** `getRenderCaps()` resolves one tier — live tier or
  `FINAL_CAPS` for `--uncapped` — and the recipe clamps to it
  (`resolveLayers` → `clampCount`, `maxParticles`). HIGH renders at its
  ceiling (800/650) even at print sizes, so density does not turn to mud.
- **Materials + blend honesty.** The GL backend handles the full CSS blend
  set; `plus-lighter` → `screen` matches the SVG reference substitution
  (#96) and is recorded, not hidden. Gradient materials
  (plate/wash/stipple) exist in the live tab only — the GL backend has no
  gradient shading — so studio stills warn on stderr when a project uses
  one (`warnUnsupportedMaterials`, #168) instead of silently rendering
  flat wings. The sidecar's `_render.normalized` keeps the authored value
  on record. (The resvg path is retired for finals; its honesty tables in
  FX_LAYERS.md and BUGLIST.md cover the legacy SVG recipe only.)
- **ACCUM is a still.** In-app RENDER ACCUM captures the trail buffer as
  one PNG; `studio.py render --accum` runs the shared GPU ACCUM recipe
  (`accumStill.mjs`, headless Chromium) and writes one PNG. If Chromium is
  missing it *refuses* (`RenderError`, exit 3) rather than rendering a
  different recipe. It is never a fake movie — video files come only from
  `studio.py video`, which renders real per-frame PNGs through the same
  recipe and assembles them with ffmpeg.
- **Personas stay few** (#166). No new CA rules, personas, or layout
  modes ride along with quality work.

## Print still (#170)

Supersample with the farm you already have, then box-filter down:

```sh
python3 studio/studio.py render project.json -o /tmp/hi.png --res 2 --sidecar
ffmpeg -y -i /tmp/hi.png -vf scale=1000:700:flags=box print.png
```

`--res 2` is 2000×1400 (2× the 1000×700 canvas). `print_still.sh` wraps that.
Since #191 the farm comes from GPU readback
(`app/src/gl/exportStill.mjs`) — a pure function of
(project, seed, size), no live store, no resvg.

Denser finals without touching the live composition:

```sh
python3 studio/studio.py render project.json -o final.png --res 4k --uncapped --sidecar
```

Do not SSAA the live canvas.

## Substitutions (sidecar)

`_render` on the sidecar JSON is the honest list — it describes the render
that *happened*, not the JSON that was requested:

- `plus-lighter` → `screen` (kept in the GL contract to match the SVG reference, #96)
- `var(--ink)` / `var(--accent)` → baked hex
- caps actually resolved, `uncapped` flag, renderer identity

If a value cannot be matched, the export refuses or notes it in the
sidecar. No second rasteriser is invented.

## Not quality

New layout modes, extra CA rules, a second physics engine, 16-bit PNG (the
export writer is 8-bit RGBA).
