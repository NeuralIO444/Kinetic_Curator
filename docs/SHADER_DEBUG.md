# Shader Debug Harness (#193)

Shaders can't be stepped through in a debugger, so `src/gl/debug/` gives four
layers of visibility while writing them. **Dev-only** — the Shader Lab panel
is lazy-loaded behind `import.meta.env.DEV` and tree-shaken out of production
builds entirely.

Since the second pass (backend hardening 2/5), the harness is also a **CI
gate**: every shader the app ships compiles through the checked builders
*and* the checked uniform audit, in production startup code and in the
selfcheck suite. A bad shader fails the build (or startup) with its name on
the failure — never a silent black screen.

## Modules (`src/gl/debug/`)

| Module | Layer | What it does |
|---|---|---|
| `diagnostics.mjs` | 1 — compile-time | `compileShaderChecked` / `linkProgramChecked` / `buildProgramChecked` throw `ShaderCompileError` / `ProgramLinkError` naming the effect, file, and line (`#line` remapping; ANGLE rejects the filename-string form, so the file travels in the JS error). `auditUniforms` reports declared-but-never-set and set-but-not-declared uniforms. `auditProgramChecked` runs the audit as a gate: it throws `UniformAuditError` (naming the effect and file) when the shader declares a uniform nobody uploads. `checkGlError` turns silent GL failures into thrown `GlError`s with the enum name. All events land in `diagnosticsLog`. |
| `flagPass.mjs` | 2 — visual | `createFlagPass(gl).render(tex, view, w, h)` renders into the bound framebuffer. Views: `nan` (non-finite → magenta), `alpha` (alpha → red), `luminance` (heat ramp), `range` (out-of-[0,1] → magenta). Output row 0 == texture row 0. Its own program goes through the checked builders + audit. |
| `tapPoints.mjs` | 2 — visual | `createTapRecorder(gl).tap(name, w, h)` snapshots the bound read framebuffer — one tap per chain stage, so a bad stage is found by inspection. `tapToDataURL` makes thumbnails. |
| `debugStrip.mjs` | 3 — printf | `packStripValues` / `unpackStripPixels`: float32 bit patterns in RGBA8 — bit-exact for every finite float, NaN/Inf included. `writeStrip` / `readStrip` round-trip through a 1×N target; `formatStripTable` prints the table. |
| `gpuTimer.mjs` | 4 — perf | `createGpuTimer(gl)`: `EXT_disjoint_timer_query_webgl2` with CPU fallback. `begin` / `end` / `poll()` → `{ done, disjoint, timings }`. |

## Wiring — every shader goes through the gate

Anything that compiles a shader goes through `buildProgramChecked` (compile
+ link, failures name the effect, file, and line) **and**
`auditProgramChecked` (every uniform the shader declares must be uploaded;
`UniformAuditError` names the effect and file). The per-site program tables
are the single source of truth — production builds from them and the
selfcheck audits them, so they can't drift apart:

- `src/gl/renderer.mjs` — `RENDERER_PROGRAMS`: `quad`, `composite`,
  `resolve`, `copy`. Built + audited in `createRenderer`.
- `src/gl/bridge/bridge.mjs` — `compileProgram` (used by `registerProgram`):
  the builtin `effect` program and every Phase-2 template FX program
  (`fx/displace`, `fx/tear`, `fx/scanlines`, `fx/solarize`, `fx/edge`) are
  audited against their declared upload sets.
- `src/gl/accum.mjs` — `ACCUM_PROGRAMS`: all eight passes — `fade`, `feed`,
  `echo` (the echo passes), `copy`, `over`, `down`, `blur`, `add`. Built +
  audited in `createAccum`.
- `src/gl/debug/flagPass.mjs` — the flag-view program itself.

One deliberate tolerance: `auditProgramChecked` throws only on
*declared-but-never-set*. Upload names the shader doesn't declare (e.g. the
bridge's `u_res`, skipped via null location) are reported in the error/log
but don't throw — the typo class is still caught, because a misspelled
upload name leaves the real uniform in the never-set list.

## Selfchecks

`src/gl/debug/debug.selfcheck.mjs` (registered in `npm run selfcheck`) serves
`src/gl` over HTTP and runs `selfcheck.page.mjs` in headless Chromium —
the module cases plus one `coverage:` case per shipped program (renderer ×4,
ACCUM ×8, bridge builtin ×1, template FX ×5, flag pass ×1): each compiles
through the checked builders and audits against the same upload lists
production uses. Any failure names the effect, file, and line, and fails the
suite. (Skipped when the Playwright browser isn't installed, same as the
other GL selfchecks.)

The gate itself is also proven without a browser, in `npm run selfcheck`'s
Node tier:

- `src/gl/bridge/bridge.selfcheck.mjs` — mock-GL cases: a program whose
  shader declares an un-uploaded uniform throws `UniformAuditError` naming
  the program; the real builtin `effect` program passes the audit.
- `src/gl/accum.selfcheck.mjs` — `ACCUM_PROGRAMS` covers all eight passes
  and every uniform each ACCUM shader declares is in its upload list.
- `src/gl/composite.selfcheck.mjs` — same for `RENDERER_PROGRAMS`
  (vertex + fragment stages).
- `src/gl/effects/fxShaders.selfcheck.mjs` / `template.selfcheck.mjs` —
  mock-GL registration of the template effects already runs the static +
  runtime audits, now including the bridge-level checked audit.

## Shader Lab panel

Dev-only tab (`src/panels/ShaderLabPanel.jsx`), toggle with the backtick key.
Runs the real modules against the Phase 1 shaders in the live browser:
compile check, uniform audit, flag-view thumbnails over a synthetic texture
(gradient + NaN block + overbright block), GPU timing, debug-strip table,
and the diagnostics log.
