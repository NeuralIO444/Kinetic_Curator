# STAGING REPORT — #1547 Materials M1: glass

**Branch:** `ember/1547-glass` (worktree `~/workspace/kc-1547-build`), based on origin/main `a2f7923c`.
**Status:** staging complete, committed locally. No push, no PR (publish is the coordinator's step).
**Recovery note:** the original builder died in a daemon restart with this build uncommitted in the tree. This finisher audited the recovered diff against the issue contract, kept its design, added the missing test coverage, and ran the full verification. Kept-vs-changed is itemized below.

## What shipped

`material: 'glass'` on a stratum now renders its wing/body marks translucent in GL, riding the #1129 machinery, with the material param as the switch:

- **`app/src/engine/glassBody.mjs` (new)** — the material switch (`isGlassMaterial`) and `GLASS_BODY_ALPHA = 0.78`: the fraction of its rolled alpha a glass-material body keeps. A flat material constant (not a per-instance roll), declared cost tier 0 (one multiply per placed instance at build time; the sort and shader terms it engages are the existing #1129 tiers at their own sites).
- **`app/src/engine/buildPlacements.js`** — `material: 'glass'` ORs into the existing glass flag next to the #1129 bool: every placed item gets `it.glass`, its alpha is multiplied by `GLASS_BODY_ALPHA` at placement time (so the census, the reference stills and the scene contract all see the one body), and `sortGlassInstances` orders the set back-to-front. The bool path is untouched — its translucency stays the voice's own alpha range. Item alpha is re-derived from the SoA on every build before this block, so the multiply cannot compound across pooled frames (suite-pinned).
- **`app/src/gl/sceneContract.js`** — the glass flag now rides onto contract instances when set (the deform spread precedent). Before M1 the flag died at this seam: buildPlacements set it on items and no contract instance carried it, so `v_glass` was 0 on every contract render and the #1129 lighting was unreachable from the contract path. Absent (the common case), the instance shape — and therefore the contract hash — is exactly the pre-M1 shape. `warnUnsupportedMaterials` no longer discloses `'glass'`; plate/wash/stipple stay disclosed until M2 (#1548) / M3 (#1549).
- **`app/src/curator/censusReport.mjs`** — the material fixture note rewritten to reality (glass live in GL since #1547; plate/wash/stipple still warning-only).
- **`docs/QUALITY.md`** — the #168 disclosure narrowed to match.

## Recon map (verified in code, not from the research pool)

- `layoutParams.material` — per-stratum string param in `src/data/layout-modes.js` (default `'plate'`, type-only clamp, deliberately no vocabulary clamp since #1416 because legacy docs carry retired values). Before M1 its only live reader was `sceneContract.warnUnsupportedMaterials`.
- Real glass machinery, all #1129: the `glass` bool param + `sortGlassInstances` back-to-front z-tier sort (PR1, `src/engine/glassSort.mjs`); the shader terms selected per-instance by `a_glass`/`v_glass` — soft bevel (`src/gl/glassBevel.mjs`), caustic, striation in `src/gl/shaders.mjs`; the live packer reads `it.glass` into the a_glass slot (`src/gl/renderer.mjs` packInstanceData, byte offset 80 / float 20).
- The pool's inventions do not exist and were not built on: no `brewAccent`, no `geometryHash`, no `'woven'` consumer anywhere in the tree (grep-verified).
- Retired semantics (`git show c300a988:app/src/engine/materials.js`, deleted in `8391a043`): the SVG catalog was flat / plate (radial gradient) / wash (linear gradient) / stipple (pattern) — **there was no glass in the retired vocabulary**. Glass is a GL-era material whose meaning is CHIAROSCURO's in-shader lighting (bevel normals from alpha; "author flat, grow at runtime, light last"): a translucent body lit by the soft-bevel/caustic/striation terms. M1 restores the *param*, with glass's GL-native meaning; plate/wash/stipple keep their historical gradient meanings for M2/M3.

## Kept vs changed on the recovered diff

**Kept intact (the recovered design was right):** the glassBody module and its constant; the buildPlacements switch + placement-time alpha; the contract carry with the deform precedent; the warning narrowing; the census note and dead-pin re-pin; the QUALITY.md edit. The placement-time alpha (rather than a shader-only alpha) is what lets one body serve the census, the SVG reference stills and the contract alike — and it is what makes the parity law provable per item.

**Changed / added by the finisher:**
1. **A test suite the recovered work lacked.** The contract glass carry shipped untested (sceneContract's 15 cases never exercise it). Added `app/src/engine/glassBody.selfcheck.mjs` (7 cases, registered in `app/selfcheck.manifest`): the switch, exact attenuation + sort order on the census fixture, plate≡flat parity, bool-alpha parity, no compounding, the contract carry and its absence for non-glass, the narrowed warning.
2. **The evidence probe** (kept outside the repo at `~/workspace/kc-1547-evidence/`): placement- and pixel-level measurement, numbers below.
3. Nothing in the recovered product code was altered.

## Parity evidence

- `glassBody.selfcheck` parity cases: on the census fixture (fibonacci, 48 items), **plate placements are per-item identical to flat** (alpha/x/y, unflagged); **bool-glass alphas are bit-identical to flat** (the material never touches the bool path); repeat glass builds are identical (no compounding).
- Census suite green with `material` re-pinned from dead to moving; the rest of the census pins untouched.
- Render goldens: `goldenPlacement` OK; bake parity suites in the manifest sweep (below). The only contract-shape change is additive and conditional (`glass: true` only on instances of glass-flagged items) — non-glass contracts are byte-identical in shape, pinned by the new suite.
- **`npm run build` green.**

## The glass delta (measured)

Census fixture Look (mode fibonacci, count 60, hydra palette, census seed/cast), `flat` vs `glass`, via the census's own `place()` and the miner's still pipeline (`composeStillSvg` + resvg), probe at `~/workspace/kc-1547-evidence/glass-probe.mjs` / `glass-probe-pixels.mjs`:

- Placements: 48/48 items glass-flagged; **every item's alpha is exactly flat × 0.78**; mean item alpha 69.99 → 54.59 (ratio 0.7800); z-tier order back-to-front engaged; geometry untouched.
- Composed still (400px stats raster): **mean alpha 0.1151 → 0.0909 (−21.0%)**; ink coverage identical 0.2069 (glass changes light, not shape); **mean luminance 0.1224 → 0.1117 (−0.0107)** against the dark hydra ground.
- Contract: a glass stratum's contract instances all carry `glass: true`; a plate stratum's contract has no `glass` key anywhere.

## Verification runs

- Targeted: census OK · sceneContract OK (15 cases) · glassBody OK (7 cases) · glassBevel 8/8 · glassCaustic · glassStriation · glassSort 7/7 · goldenPlacement OK · build green.
- Full manifest sweep, per-suite tally (the sandbox never offered a quiet window — four lanes were sweeping in parallel — so the sweep ran under contention with a 600s per-suite cap, and every starvation-shaped failure got a solo re-run before any conclusion; tallies at `~/workspace/kc-1547-evidence/sweep-branch.txt` / `sweep-base.txt` + `sweep-base-part2.txt`, solos in `solo-reruns.txt`):
  - **Branch: 403/407.** Failures: `swarmWasm` (cargo not found), `accum` (V8 OOM abort), `rollSafety` (600s timeout under contention), `phase6` (600s timeout under contention).
  - **Base (pristine a2f7923c, scratch worktree): 401/406.** Failures: the same four, plus `vortex`.
  - **Solo re-runs:** branch `rollSafety` **PASS** (7 checks) · branch `phase6` **PASS** (3m56s wall / 14s CPU — a timer-bound suite, which is why load starves it) · base `vortex` **PASS** in 0.48s (19 checks — its base-sweep failure was pure starvation; it passed outright on the branch).
  - Net: the only failures on either tree are the two known base-identical sandbox limits (`swarmWasm`, `accum`), plus contention timeouts that pass solo and fail identically on the pristine base. **No failure is attributable to this change.**
- Not runnable in this sandbox (noted, not fought): the Playwright e2e harness and the live app — CI is the e2e measure, and this PR goes through the localhost review lane with before/after stills before merge. `scripts/checkSemanticGoldens.mjs` compares committed embeddings only (produced on Matt's Mac Studio); nothing to re-run here.

## Judgment calls (flagged)

1. **`GLASS_BODY_ALPHA = 0.78` is a material judgment, kept from the recovered build.** It centres the band the dark-glass voice authors by hand (alpha 70–100). It's one named constant in one module — Matt's eye at review can move exactly one number.
2. **The contract carry also repairs the bool path in contract renders.** Bool-glass items now carry the flag into contract instances too (previously dropped for every path), so studio/contract renders of bool-glass layouts will show the #1129 lighting the live tab already shows — the #168 "live and studio agree" direction. It is additive-only and no golden moved; flagged because its blast radius is one step wider than the material switch itself.
3. **Census dead-pin coordination:** this branch's re-pin drops `material` only. The `wobbleFreq` pin is #1551's lane (its fixture fix is staging in parallel); the two pins touch the same assert and reconcile at publish rebase.
4. **No `glass` key is written for non-glass items** (vs writing `glass: false`): chosen to keep non-glass contract hashes byte-identical — the parity law outranks schema tidiness.
