# STAGING REPORT — #1813 wet-look display pass (local only, not pushed)

Builder staging record, branch `feat/1813-wet-look` in `~/workspace/kc-1813-build`, stacked on `feat/1812-edge-darkening` (ca320bd8, PR #1873) as assigned — not pushed, no PR; the coordinator verifies, rebases onto main, and publishes. This file replaces the report that was at the worktree root (#1812's); that report remains in git history.

Issue (verbatim): **"WET: wet-look display pass — saturation, luminance skew, sheen"**

## Premise check (done before any code)

- The wet-frame service (`gl/wetFrame.mjs`) publishes the packed wet mask + wetAmount per frame and owns the named regime thresholds (`WET_REGIMES`: damp 0.05 / wet 0.35 / soaked 0.8); its header names #1813 as the display consumer that reads regimes. ✔
- No wet-look pass exists on the composed tree (grep for wet-look/wetLook: empty). ✔
- The presentation seam is as the issue describes: ACCUM presents through `presentUpscaled` — manual-bilinear upscale into a 16F scratch, then RESOLVE_FS (ACES + dither). A linear pre-resolve pass slots exactly between them. ✔
- The frame the pass reads already carries #1812's edge darkening (applied inside `packPigmentDeposited` in `vortex.mjs`, composited into the pair by the ACCUM step). Per the coordinator's binding note and the issue's Relations clause, the pass applies **no** rim/edge term of its own — the selfcheck pins the shader free of any edge term, so the two darkenings cannot double up. ✔
- The fade's ground (`u_bg`) is the frame background parsed by #287's hex rule from `bgCss`; the pass takes the same value by the same rule. ✔

## What shipped, in plain language

Where the stage is wet, it now *looks* wet. A new fullscreen pass runs over the presented picture just before the final colour finish, only while the wet field is live, and only inside the wet areas: colours deepen and saturate, darks sink darker while bright highlights stay put (on light paper the whole sheet darkens instead, and nothing ever gets brighter), and the brightest wet spots pick up a faint sheen. Dry areas are not touched — not approximately, but bit-for-bit. When the wet field is off, the pass does not run at all and the picture is exactly what it was before this change. Nothing new to operate: the pass follows the WETNESS the performer already controls.

## How

- **`app/src/gl/wetLook.mjs`** (new) — the pass as one module: the recipe constants (`WET_LOOK`: saturation 0.35, skew 0.45, paperSkew 0.60, sheen 0.30, sheenPow 6, groundSplit 0.5), the regime ramp (0 at damp, full at soaked, smoothstep between), the ground parse (the fade target's rule), a pure JS mirror (`shadeWetPixel`), and the GLSL (`WET_LOOK_FS`) transcribed from the mirror formula-for-formula. The shader's below-damp path writes the sampled texel straight through (no unpremultiply round-trip) — that is what makes dry pixels bit-exact.
- **`app/src/gl/renderer.mjs`** — the pass joins `RENDERER_PROGRAMS` as `wetlook` (cost auto-registers as `renderer/wetlook`, tier 0, 0.3 ms author's estimate in the upscale class, notes say unmeasured — the sweep harness measures it through the same table). The live renderer takes a per-frame `setWetLook(state)` (the setResolveOptions discipline), uploads the served mask pack into its own LINEAR texture, and `presentUpscaled` runs the pass from the upscale scratch into the ping-pong partner before resolving. Disarmed → the input target presents untouched. Mask texture freed in `dispose()`.
- **`app/src/gl/liveLoop.mjs`** — beside `setResolveOptions`, the loop arms the pass from the field the service just served (the same `wetStep`/`wetMask`/`wetAmount` the recipe consumed), with thresholds from `WET_REGIMES` and the ground from `bgCss`. No new layout params (the replay-divergence trap is pinned shut in the selfcheck).
- **`app/selfcheck.manifest`** — one line: `wetLook.selfcheck.mjs`.
- **`docs/WET_ENGINE.md`** — the standing status paragraph, matching the #1810–#1812 entries.
- **`docs/review/1813/`** — review evidence in the #1812 pattern: README, probe.json, three A/B stills (dark ground / light paper / monochrome, rendered from the mirror through the resolve's ACES curve).

## One re-pin, with cause

`composite.selfcheck.mjs` pinned the renderer program table at six keys. The renderer genuinely gains a seventh program through the audited table (the table is the contract: every renderer program is audit-registered there), so the pin now reads seven keys with `#1813` cited in the comment. The companion pin — every declared uniform is in its upload list — passes on the new program unmodified.

## Verification (sandbox; CI is authoritative for the browser suites)

Baselines were taken on the clean stacked base before editing.

| Suite | Base | This build |
|---|---|---|
| wetLook (new) | — | **16/16** |
| accum (solo, 3 GB heap) | OK (83 cases) | **OK (83 cases)** |
| composite | OK (15 cases) | **OK (15 cases)** |
| wetFrame / vortex / pigmentKM | 15 / 34 / 7 | 15 / 34 / 7 |
| accum.seam / accumFeed / accumGuard / accumInput / accum.inventory | — | 7/7 · OK (15) · OK · OK (7) · 6/6 |
| wetFeed / resolve / resolveTap / uniformLocations | — | 9 · OK · OK · OK |
| grainFinish / liveLoopSwell / clock.freeze | — | 4 · OK · 6/6 |
| liveResolve.determinism / presentOrientation | — | ok · ok |
| costTiers | — | OK (renderer/wetlook covered) |
| `npm run build` | exit 0 | exit 0 |
| eslint + prettier on touched files | — | clean (selfcheck file prettier-formatted, suite re-passed 16/16) |

Notes on two sandbox artefacts, both chased down rather than waved at:
- The baseline accum run's wrapper reported exit 2 while the suite's own log read "OK (83 cases)"; the changed-tree run exits 0 with the identical 83-case verdict. Treated as a teardown artefact of the baseline invocation, not a regression signal.
- A first battery run of composite "failed" with a Playwright target-closed error — that was my own 120 s timeout killing its browser section. Run solo with a proper window it passes at base (15) and on this build (15).
- The brief's caveat that `npm run build` fails in this sandbox (@tauri-apps/api) did **not** reproduce here: with a fresh `npm install` the base builds green, and so does this build — so no build failure needed a base-identical defence.

**Acceptance wash** (probe.json; synthetic scenes, two soaked stamps, 16,797 wet px): dark ground — wet luma −19%, saturation +23%, dry Δ = 0, only brightening is the sheen on highlights (max +0.044); light paper — wet luma −26% (darkens more, per the issue's inversion), saturation +30%, max brightening **exactly 0**; monochrome — saturation stays 0, luma −11%, dry Δ = 0. The selfcheck asserts the same directions as region statistics plus the hard laws (dry identity, below-damp identity, paper never-brightens across a 343-pixel × 4-wetness sweep, HDR brights hold exactly).

## Decisions flagged for the next slice / coordinator

1. **The pass consumes the field where the field is served** — the ACCUM presentation. It does not birth the field on its own (no wet look with ACCUM off): stepping the sim for display alone is a consumer-set decision for the #1814 family, recorded in `docs/review/1813/README.md`.
2. **Paper's "brightens never" is a clamp, not a curve property** — the selfcheck's first sweep caught the saturation term lifting a dark saturated pixel's dominant channel ~0.03·f on paper; a per-channel `min(c, cIn)` on light grounds makes the law hold by construction.
3. **The regime ramp tops out at soaked, not wet** — damp starts the effect, soaked completes it, so deep pools read wetter than damp edges.
4. **Exports**: the pass is a pure function of (frame, field, ground) with no clock or state, so #1815's warm-up stills can run the identical math and match live — but this slice wires the live presentation only; the still path is #1815's to wire, exactly as the wetFrame header already records.
5. **Cost figure is an estimate**: 0.3 ms declared for `renderer/wetlook` in the upscale class with the note saying so; the device-harness sweep (which reads `RENDERER_PROGRAMS`) is where the real number replaces it.
