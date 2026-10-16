# STAGING REPORT — #1585 Materials M4 (all four bodies)

Branch `ember/1585-material-params` on main `fd58ba5c`. Local commits only — no push, no PR.
Issue contract read in full: body + the 2026-10-15 scope-extension comment (6199247976) — one build, all four bodies, no M5.

## What was built, per body

Each body's scalar tunables are now per-Look layout parameters. The authored tables
(STIPPLE_DOTS, WASH_STOPS, PLATE_STOPS) stay authored data in their leaves — the knobs
scale/spread them, never replace them. Every consumer resolves params through a leaf
resolver (`glassAlphaFrom`, `plateGeoFrom`, `washParamsFrom`, `stippleDotScaleFrom`)
that falls back to the shipped constant on absent/non-finite input.

- **Glass** — `glassAlpha`. Spent where M1 spent the constant: buildPlacements multiplies
  each glass-material item's alpha by the resolved value. (`layoutParams.glass` bool path
  untouched — its translucency is still the voice's own alpha range.)
- **Plate** — `plateRadius`, `plateCenterX`, `plateCenterY`. The ramp JS, the GLSL chunk
  (geometry now arrives as a `vec3 geo` parameter; the stops stay inlined authored data)
  and the SVG gradient def all read the resolved geometry.
- **Wash** — `washStrength`, `washSpread`. Strength scales the ramp's travel toward ink;
  spread stretches the height over which it runs (JS: sample the table at
  clamp01(ly/spread); GLSL identical; SVG: the gradient *vector* stretches, y2 = spread —
  see "deliberately left out / changed" for why not stop offsets).
- **Stipple** — `stippleDotScale`. Scales the authored dots' radii in the JS screen, the
  GLSL screen + coverage form, and the SVG pattern def.

**Plate centre representation (the one judgement call):** two scalar params
(`plateCenterX`, `plateCenterY`), NOT a {x, y} point object. Rationale: PARAM_SPEC's
currency is the scalar — every key is clamped, validated, door-tested and censused as a
scalar; the one structured precedent (`scale: {x, y}`) carries *ranges*, not points, and
needs bespoke normalize/validate/migration machinery everywhere it goes. Two clamped
scalars give the centre full per-axis control, census rows, and write-path honesty with
zero new machinery. Recorded here rather than silently invented, per the brief.

## Plumbing (how a knob reaches a pixel)

layoutParams → buildPlacements stamps `it.matParams` ([4] in the body's own reading)
**only when a knob moved off its shipped default** (cleared unconditionally first —
pooled items never inherit) → sceneContract carries `mat` only when stamped (contract
hash parity for every unmoved Look) → packInstanceData writes a new per-instance
attribute `a_matP` (vec4, appended after the body code: stride 25 → **29 floats**,
the M2 append pattern — every earlier offset unchanged) and fills the leaves' shipped
defaults when `mat` is absent → QUAD_VS passes `v_matP` → QUAD_FS body branches read
their components. Still baker: miner's composeStillSvg keys symbols by the param
signature and passes params to the three def generators. One extra fix on the way:
the spectrum uniform `u_specN` divided by the old stride — now /29.

## Param keys, ranges, defaults

| key | range (PARAM_SPEC) | default | default is |
|---|---|---|---|
| glassAlpha | 0 … 1 | 0.78 | GLASS_BODY_ALPHA |
| plateRadius | 0.2 … 2 | 1.05 | PLATE_RADIUS |
| plateCenterX | 0 … 1 | 0.36 | PLATE_CENTER.x |
| plateCenterY | 0 … 1 | 0.30 | PLATE_CENTER.y |
| washStrength | 0 … 1 | 1 | full authored ramp |
| washSpread | 0.25 … 4 | 1 | full glyph height |
| stippleDotScale | 0.5 … 5 | 2.5 | STIPPLE_DOT_SCALE (Matt's tune) |

Defaults are imported into DEFAULT_LAYOUT_PARAMS from the leaf constants — one source
of truth, pinned by the new suite.

## UI

`src/panels/layout/MaterialSliders.jsx`, mounted in BUILD's Appearance section under
the finish knobs (no new panel): seven TE value buttons with slider editors, each
gated on the stratum's material (visible-but-inert with the reason under any other
material — the #272 growth-knob pattern). **Interpretation flagged:** there is no
material *picker* in BUILD today (material is voice-set since #268), so "beside the
material picker" is honoured as "with the appearance controls, gated per material" —
no picker was invented for this issue.

## Pixel-identity evidence at defaults (the acceptance gate)

Seeded fixture (census BASE: count 60, fibonacci, hydra palette, cast = census CAST),
composed stills rasterized at 500px wide, run identically on main fd58ba5c (scratch
worktree kc-1585-parity) and on this branch — placement fingerprint / composed-SVG
sha256 / raster sha256 **identical for every material**:

| fixture | items | placement fp | svg | raster |
|---|---|---|---|---|
| flat | 48 | 4378efe6df286c78 | 9fbce4894ca8676b | aeb68e69631dfe1b |
| plate | 48 | 0ab6a8a579497a2a | c6857a0d853658d9 | 531bde75f5ec606b |
| wash | 48 | 6d891e2f49fd0e7a | 0e53bce4d14095df | 5ca79b729713df47 |
| stipple | 48 | f211fbd0479f0da4 | aa9354353092aef5 | 24dd058033d63966 |
| glass | 48 | 40ef2e9c01d61f3d | 3b2c11a3244fa233 | 78c0dbfaaef9ae4d |
| glass bool (plate mat.) | 48 | 949ee4517f6cc365 | 2dfc520d0d974f6f | 87e4b29fa8a748e6 |

In-suite pin, same claim at unit level: a Look that sets the knobs to exactly the
shipped constants composes a byte-identical still to a Look with the knobs absent
(all four bodies — materialParams suite). GL side: at defaults the packer writes the
same values the old shader had inlined (0.36/0.30/1.05, 1/1, 2.5) into the attribute,
and the parameterized GLSL reduces to the same expressions (÷1.0 / ×1.0 are exact);
offsets 0–24 of the pack are byte-identical code paths.

## Per-knob pixel diffs (each knob moved alone, mid-range, 500px still)

| knob | moved to | differing px (of 175,000) |
|---|---|---|
| glassAlpha | 0.4 | 34,955 |
| plateRadius | 0.6 | 32,702 |
| plateCenterX | 0.65 | 32,181 |
| plateCenterY | 0.6 | 32,286 |
| washStrength | 0.5 | 31,881 |
| washSpread | 2 | 31,880 |
| stippleDotScale | 4 | 32,115 |

## Census-alive evidence

No re-pins needed anywhere: the dead set stays exactly `[kinemeBrushWobble]`, the
not-headless and dish-matrix sets are unchanged. The seven new rows all read **moves**:
glassAlpha via the place driver (placement delta 48 items — the alpha multiply is a
placement fact); the other six via a NEW census driver, **matstill**, which sweeps the
knob through the composed still and pixel-compares (deltas 32,082–32,728 px) — the
honest context for render-level bodies, in the census's own idiom (cf. the growth and
grazeprobe special-case drivers). The write-path door census covers all seven keys
automatically (it iterates PARAM_SPEC).

## Suites run

- glassBody 8 cases OK · plateBody 15 OK · washBody 13 OK · stippleBody 13 OK
  (re-pinned where the change is real: 29-float stride, GLSL geometry-as-parameter;
  every re-pin is a surface the issue itself moves).
- materialParams (NEW, registered in app/selfcheck.manifest): 6 cases OK.
- census: OK — no pinned set changed.
- Neighbours, each verified by its own exit code: light, atlas.skip, cellKinemePlayback,
  regionPlayback, regionLines, regionAssignment, buildPlacements, miner, sceneContract,
  exportStill, dice, coverage, censusReadout, canvasSizes — all OK.
- **Stride re-pins in neighbouring suites** (the pack grew 25 → 29 floats; these suites
  hard-code the stride exactly as they did for the #1548 append, and were re-pinned the
  same way — values only, assertions unchanged in spirit): sceneContract (2×25=50 →
  2×29=58, second-instance indices 25/26 → 29/30), atlas.skip (25 → 29), glassBevel
  (75 → 87, flag indices 45/70 → 49/78), dishDeform (50 → 58), regionPlayback and
  regionLines (all expansion lengths and inter-instance offsets × 25 → × 29).
- **casingInCss caught a real violation in the new UI** — the gate reason built its
  material name with `.toUpperCase()`; repo law keeps casing in CSS classes, never JS
  case calls. Fixed with a literal name table; suite green.
- **Full manifest sweep** (every suite run individually, failures collected):
  419 pass / 10 fail. Of the 10: 7 were the stride re-pins + casing above (fixed and
  re-verified green individually); the remaining three are base-identical sandbox
  failures, each verified by my own run on main fd58ba5c (scratch worktree): swarmWasm
  fails identically ("cargo not found" — no Rust toolchain in the sandbox); accum
  aborts with V8 OOM (exit 134) on main exactly as on this branch; rollSafety does not
  complete in this sandbox on EITHER tree (1500 s solo timeout on both — its headless
  GL rolls stall under software rendering; on main it blocked even earlier). CI's
  runners are the authority for those three.
- `npm run build`: green. ESLint on all touched files: clean.

## Deliberately left out / changed, and why

- **Wash spread is NOT stop-offset scaling.** First implementation scaled the SVG
  stops' offsets; measured result: spread 2 rasterized *identically* to default
  (the last stop clamps at 100%). The def now stretches the gradient vector
  (y2 = spread), which is exactly the JS/GLSL semantics. Caught by measurement,
  not by eye — the suite now pins it.
- **No dice randomization for the new knobs.** RANDOMIZABLE_KEYS is an explicit
  editorial list; PARAM_SPEC registration gives the write path, validation and
  census their honesty (and morph/clamp machinery reads the spec generically).
  Whether the dice should *deal* material tunings is a taste call for Matt, not
  a plumbing fact — the knobs are settable, lockable and saved like every param.
- **No material picker added** (see UI note above).
- The deferred strata-quantized stop-table law (default-is-always-a-stop) is
  respected by construction: every shipped constant is its param's default.
