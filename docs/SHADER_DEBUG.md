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
| `sweep.mjs` | 2 — visual | Uniform-sweep engine: deterministic premultiplied test pattern, RGBA16F scan targets, RGBA8 bit-exact no-op target, per-effect sweep runner. Scans with the `nan`/`range` flag views + a direct FLOAT readback as ground truth (byte readback from float targets is `INVALID_OPERATION` in Chromium). `runAllSweeps(gl)` prints the loud `sweep tests skipped: no headless Chromium` skip when WebGL2 is unavailable. |
| `sweepEffects.mjs` | 2 — visual | Sweep tables for all 18 effects (5 template FX, 5 builtin FX, 8 ACCUM passes): contract cases (normal/zero/max/boundary — asserted, incl. bit-exact no-op proofs) and hostile cases (negative/extreme — characterized, never fail). |

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

## Uniform sweeps (backend hardening 1/6)

Beyond "does it compile", the harness now *runs* every effect across its
parameter space and checks the output pixels. `src/gl/debug/sweep.mjs` is
the sweep engine; `src/gl/debug/sweepEffects.mjs` holds the per-effect sweep
tables. 18 effects: the 5 template FX, the 5 builtin FX, and the 8 ACCUM
passes.

**Procedure.** Each case renders a deterministic 32×32 premultiplied test
pattern (seeded ramps + alpha ladder — the same bytes every run) through
the effect's checked builder into a RGBA16F target (float, so NaN/Inf and
>1 survive), then scans it two ways:

1. The existing magenta flag views (`flagPass.mjs`): the `nan` view paints
   every non-finite pixel magenta; the `range` view paints every
   out-of-[0,1] pixel magenta.
2. A direct FLOAT readback of the target as ground truth (Chromium queues
   `INVALID_OPERATION` for byte readback from float targets, so the bytes
   path can't be used here). This arbitrates the range view's one ambiguity:
   a legitimately-magenta in-range pixel passes that view through untouched.

The downsample pass renders quarter-resolution (32→8) into its own float
target, matching its production shape — rendering it full-size would read
out of bounds via `texelFetch`.

**Case policy.** Every effect sweeps normal, zero, maximum, and
boundary/minimum values, plus hostile negatives and extremes.

- *Contract* cases (in-spec values) **fail** on any non-finite pixel or any
  out-of-[0,1] pixel. HDR-by-design passes (echo, add) fail only on
  non-finite; their over-range output is logged, not failed.
- *Hostile* cases (below-minimum, negative, extreme) never fail: non-finite
  output is reported as `[HOSTILE-NaN]`, out-of-range as `[info]`, so the
  suite *characterizes* out-of-contract behavior instead of asserting on it.
  (Example it documents: posterize at `levels=1` divides by zero — the
  recipe never sends it, but the sweep proves what the shader does.)

**No-op rule.** Every parameter that means "off" must be a provably true
no-op: the effect renders the input into an RGBA8 target and the bytes must
match the input **bit-exactly** (IEEE `x+0==x`, `x*1==x` — no tolerance).
Effects whose off-state is structural (the recipe skips the pass, e.g.
accum-blur at sigma 0) get a documented `near: 1` budget instead of a false
zero claim, and effects with no amount parameter (solarize, edge, invert —
off means "removed from the chain") don't claim a shader-level zero proof.

**Running it.** `npm run selfcheck:sweep` runs just the sweeps;
`npm run selfcheck` runs them as the tail of the debug suite. Output lines:

- `[ok] sweep <effect> — N case(s), M no-op proof(s)` — all cases passed.
- `[FAIL] sweep <effect> — <case>: …` — a contract assertion failed.
- `[info] sweep … (beyond contract — logged, not failing)` — hostile/HDR
  out-of-range, characterized.
- `[HOSTILE-NaN] sweep … (beyond contract; see sanitization audit)` —
  hostile non-finite, characterized.

**No-Chromium behavior.** If headless Chromium (or WebGL2) is unavailable,
the sweep prints the loud skip
`SWEEP TESTS SKIPPED: no headless Chromium — uniform-sweep property tests
did not run` and exits successfully — CI stays green, but the skip is
impossible to miss in the log.

## Shader Lab panel

Dev-only tab (`src/panels/ShaderLabPanel.jsx`), toggle with the backtick key.
Runs the real modules against the Phase 1 shaders in the live browser:
compile check, uniform audit, flag-view thumbnails over a synthetic texture
(gradient + NaN block + overbright block), GPU timing, debug-strip table,
and the diagnostics log.
