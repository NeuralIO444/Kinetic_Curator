# Render quality

One kernel, one seed, 60 Hz. Live stays 1×. Print is a *still*.

## Still vs live

| | Live tab | Print |
|---|---|---|
| Size | 1000×700 | `--res` scale or WxH |
| Raster | Canvas2D | resvg |
| ACCUM | Pixel buffer in the tab | `studio.py render --accum` |
| WEBM | Tab only; not the ACCUM buffer | — |

## Print still (#170)

Supersample with the farm you already have, then box-filter down:

```sh
python3 studio/studio.py render project.json -o /tmp/hi.png --res 2 --sidecar
ffmpeg -y -i /tmp/hi.png -vf scale=1000:700:flags=box print.png
```

`--res 2` is 2000×1400 (2× the 1000×700 canvas). `print_still.sh` wraps that.

Do not SSAA the live canvas.

## Substitutions (sidecar)

`_render` on the sidecar JSON is the honest list. Known mappings:

- `plus-lighter` → `screen` (resvg)
- `var(--ink)` / `var(--accent)` → baked hex
- `ui-monospace` → `--monospace` (default Menlo)

If a filter cannot map, refuse or note it. Do not invent a second rasteriser.

## Not quality

New layout modes, extra CA rules, a second physics engine, 16-bit PNG (resvg is 8-bit).
