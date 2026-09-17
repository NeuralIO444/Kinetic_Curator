# Shader Debug Harness (#193)

Shaders can't be stepped through in a debugger, so `src/gl/debug/` gives four
layers of visibility while writing them. **Dev-only** — the Shader Lab panel
is lazy-loaded behind `import.meta.env.DEV` and tree-shaken out of production
builds entirely.

## Modules (`src/gl/debug/`)

| Module | Layer | What it does |
|---|---|---|
| `diagnostics.mjs` | 1 — compile-time | `compileShaderChecked` / `linkProgramChecked` / `buildProgramChecked` throw `ShaderCompileError` / `ProgramLinkError` naming the effect, file, and line (`#line` remapping; ANGLE rejects the filename-string form, so the file travels in the JS error). `auditUniforms` reports declared-but-never-set and set-but-not-declared uniforms. `checkGlError` turns silent GL failures into thrown `GlError`s with the enum name. All events land in `diagnosticsLog`. |
| `flagPass.mjs` | 2 — visual | `createFlagPass(gl).render(tex, view, w, h)` renders into the bound framebuffer. Views: `nan` (non-finite → magenta), `alpha` (alpha → red), `luminance` (heat ramp), `range` (out-of-[0,1] → magenta). Output row 0 == texture row 0. |
| `tapPoints.mjs` | 2 — visual | `createTapRecorder(gl).tap(name, w, h)` snapshots the bound read framebuffer — one tap per chain stage, so a bad stage is found by inspection. `tapToDataURL` makes thumbnails. |
| `debugStrip.mjs` | 3 — printf | `packStripValues` / `unpackStripPixels`: float32 bit patterns in RGBA8 — bit-exact for every finite float, NaN/Inf included. `writeStrip` / `readStrip` round-trip through a 1×N target; `formatStripTable` prints the table. |
| `gpuTimer.mjs` | 4 — perf | `createGpuTimer(gl)`: `EXT_disjoint_timer_query_webgl2` with CPU fallback. `begin` / `end` / `poll()` → `{ done, disjoint, timings }`. |

## Wiring

`src/gl/renderer.mjs` builds all five Phase 1 programs through
`buildProgramChecked`, so any future compile/link regression throws with the
program name, `shaders.mjs` source label, and line number.

## Selfchecks

`src/gl/debug/debug.selfcheck.mjs` (registered in `npm run selfcheck`) serves
`src/gl` over HTTP and runs `selfcheck.page.mjs` in headless Chromium —
17 cases covering all five modules.

## Shader Lab panel

Dev-only tab (`src/panels/ShaderLabPanel.jsx`), toggle with the backtick key.
Runs the real modules against the Phase 1 shaders in the live browser:
compile check, uniform audit, flag-view thumbnails over a synthetic texture
(gradient + NaN block + overbright block), GPU timing, debug-strip table,
and the diagnostics log.
