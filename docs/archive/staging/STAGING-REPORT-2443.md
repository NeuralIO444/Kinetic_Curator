# STAGING REPORT — #2443 gradient overlay (Gradient Map FX item)

Branch: `feat/2443-gradient-overlay` · Base: `e0a8ab77` (current main; rebased mid-build after #2295 landed)
Commits: `f6c1e1c4` (the item) + `f7defb97` (cost/canon/sweep fix-ups from the sweep)

## What shipped

**Gradient Map**, a pickable FX layer item in the EF-3 Tonal family: it re-colors the
composited stage by its own luminance through a five-stop gradient (black point, shadows,
midtones, highlights, white point) — the Photoshop gradient-map move, live on the GL stage.
One performer control: **Strength**, default 0.6. It only re-colors; it adds no assets and
touches no glyphs (type exclusivity intact). Pure function of frame + constants — no state,
no RNG — so still and live agree and takes replay identically.

## Coordinator decisions (flagged per the brief)

1. **Stops live in the Look's recipe** (per-Look constants, the #2252 knob home): a Look may
   carry `gradientMap: {…}` naming any subset of the five stops as hex; unnamed stops fall
   back per-stop to one default gradient. Chiaroscuro (deep ember), Neon Brood (verdigris)
   and Bio Plate Sepia (bone) author their own; every other Look uses the default. Stops are
   never document params — the scene contract resolves them from the standing Look and
   attaches them to the chain step, so a take records the exact stops it rendered with.
2. **It reads the composited stage below the FX stratum** — the FX chain's input, like every
   FX kind (#227) — not the content layer alone.
3. **Its own FX slot item** at its slot position in the FX pass; it does not replace or merge
   with LUT/grade items. Strength defaults to 0.6, a tasteful partial blend.

Default gradient (the issue's recipe): near-neutral warm endpoints (#16120e / #f6ead3),
saturated red midtones (#c73e1d), red → amber hue shift into the highlights (#e79a2e).
Spectral-law declaration (per-tone recolor — neither pigment mixing nor added light) is
written where the FX kinds declare themselves: `fx/gradientMap.mjs`, the catalog entry,
and the shader header.

Placement choices, following the tree's existing pattern (probed, no parallel system):
rack-pickable via the EF-3 rack + editor add-row, but **not** in the curated KINETIC menu
(FX_MENU_KINDS) — the dice never deal it, same posture as Grade. The SVG/print path carries
a documented approximation (16-point table transfer over premultiplied luminance, default
gradient when a document carries no resolved stops), same honesty pattern as Grade/Halo.

## Files

- `app/src/fx/gradientMap.mjs` (new) — the kind's law: stop resolution, hat-weight sampler,
  CPU reference (mirrors the GLSL formula).
- `app/src/fx/fxFilters.js` — catalog entry (strength only), EF-3 rack, SVG builder.
- `app/src/gl/effects/fxShaders.mjs` — GPU shader + descriptor (strength + 5 color stops) +
  cost registration (tier 3).
- `app/src/gl/sceneContract.js` — `withGradientStops(...)` on the fx branch (post-sanitize;
  no-op for chains without the item → byte-identical contracts elsewhere).
- `app/src/data/presets.js` — gradient recipes on the three Looks.
- `app/src/fx/efRackTile.mjs` (face GRM/gradient), `app/src/hooks/sceneCost.js` (cost id),
  `app/src/panels/build/blockStops.mjs` (strength dial stops — required by its exact-cover pin).
- `app/src/gl/debug/sweepEffects.mjs` — sweep entry (identity/max/hostile cases).
- `app/src/gl/effects/measuredCosts.mjs` — fx/gradientMap at the 0.3 floor (see below).
- `app/src/gl/mlx/declaredCostTiers.json` — gradientMap declared tier 3.
- `app/src/fx/gradientMap.selfcheck.mjs` (new, 9 groups) + `app/selfcheck.manifest`.
- Pins amended with cause comments: `gl/effects/fxShaders.selfcheck.mjs` (kind census +
  the descriptor-mirror's one declared exception — the five stop params),
  `fx/efRackTile.selfcheck.mjs` (one-control kinds), canon ×3 (hash re-pins, see below).

## Verification (all on the composed, rebased tree)

- New suite: 9 groups green — endpoints near-neutral, midtone saturation, hue shift,
  strength 0 = identity / 0.6 = exact blend / 1 = pure map, monotonic ramp (default +
  all three authored Looks), per-Look resolution, contract seam, both render paths.
- Targeted neighbours, all green: fxFilters (51), fxShaders (15), sceneContract (15),
  efRackTile (6/6), blockStops (10), sceneCost, costTiers, mlxExport (31 effects),
  canon ×3, debug (115 cases — incl. gradientMap compiles/audits clean and the
  strength-0 no-op proof on real GL).
- `npm run lint`: 0 errors (11 pre-existing warnings, none in touched files).
  `npm run format:check`: clean. `npm run build`: green.
- Full manifest sweep (continue-on-error): **794 PASS / 8 FAIL** of 802 recorded runs
  (797 unique lines) — full log: `sweep-2443.log` in this worktree's root
  (gitignored, kept with the staging tree; its addendum carries the failure verdicts).
  The 8 failures, each investigated to ground (details in the log's addendum):
  - swarmWasm, accum, rollSafety — sandbox-environmental, A/B-proven against pristine
    base (cargo missing; V8 heap OOM identical on base; WebGL ProgramLinkError
    "Too many attributes (gl_InstanceID)" on base). phase6 carries the same WebGL
    signature, also A/B-identical on base.
  - canon ×3, costTiers, mlxExport — caused by this change and FIXED (below); re-run green.

## Sweep findings fixed in the second commit

- **Canon hashes:** the recipe field moved the byte-identity pins. Per-record diff vs
  e0a8ab77 proved exactly 3 of 82 records differ, each gaining ONLY `gradientMap`;
  hashes re-pinned with #2443 cause comments (the #1838/#2150 discipline — the check
  is not weakened, it still pins every other byte).
- **Cost measurement:** `npm run measure-costs` was run; on this sandbox rig gradientMap
  read 26.9 ms/draw vs grade's 29.9 in the same run. The wholesale sandbox re-bless was
  NOT committed (it drops five reference-rig entries swiftshader can't measure and
  rescales everything to a throttled shared CPU); instead the single entry was committed
  at the file's 0.3 floor with the relative measurement written into its comment — the
  #1022/#560 hand-entry precedent. A reference-rig re-bless remains owed, as the comment says.
- **MLX declared tier:** gradientMap added to declaredCostTiers.json (tier 3).
- **Sweep hostile cases:** raw-value cases bypass the sanitizer by design, so they carry
  the five stop colours explicitly (caught by debug.selfcheck; fixed and green).

## Not done / not touched

- No new panel, no menu entry, no document schema change; no existing kind's behaviour
  changed. No merge (coordinator merges on QA-clean + green CI, per Matt's order).
- Live-canvas screenshot: owed from a desktop run — sandbox WebGL stills of the full app
  are the known swiftshader path (the debug sweep's GL proofs above ran headless fine,
  but the full-app screenshot is the coordinator's review-lane step).
- Housekeeping: the plain `STAGING-REPORT.md` at the repo root is the earlier #2151
  build's report (tracked on main); it is restored untouched in this branch, and this
  report follows the house convention of numbered staging reports.
