# STAGING REPORT — #1814 strata soak (WET Phase B)

**Issue (verbatim):** "WET: layer interaction — strata soak where the
field is wet (Phase B)"
**Branch:** `feat/1814-strata-soak` on origin/main `302f738a`.
Local only — no push, no PR (coordinator publishes). This file
replaces the report that was at the worktree root (#1876's); that
report remains in git history.

## Premise check

The issue's premise is TRUE against main as it stood: the wet field
(#1809–#1813, #1815, #1876) had exactly one wired consumer family
(ACCUM), CONTENT strata had no interaction mode, and the wet-frame
service's consumer gate was already generic — the soak could join as a
named consumer without renegotiating the service contract. #1814 has
zero comments; the body is the whole contract.

One sub-clause is a VACUOUS ANTECEDENT, flagged rather than improvised:
term (c)'s second half ("…and FIELD shapes the stamping via
`samplePattern` when the stratum's layout uses one"). Verified by grep:
`samplePattern`'s only consumer is the PATTERN tile engine
(`src/pattern/engine.js`); no content layout sampler calls it (layout
modes are fibonacci/grid/swarm/etc.). The stamping half of (c) IS
implemented and asserted (a WET stratum's marks stamp the field — the
consumer gate births the field for a soak-only scene; resting marks wet
their ground and deposit pigment). The shaping half has no antecedent
for content strata today; the binding point is the footprint stamp in
the live loop, named in `docs/WET_ENGINE.md`. If a pattern-driven
content layout lands later, that is where FIELD-shaping plugs in.

## What shipped (plain language)

A CONTENT stratum can now be put in **WET** interaction mode from its
BUILD row (a WET button beside the blend modes; default OFF). Where the
stage's wet field is actually wet, that stratum's picture changes the
way wet paper changes a wash: its colours are drunk by the ground —
tinted by whatever pigment is already deposited there, or by the bare
ground colour where none is — and its edges bleed a little along the
direction the water is moving. Where the field is dry, nothing changes
at all — the pixel values are byte-for-byte the dry ones. Turn the mode
off and the project is exactly what it was before this slice existed
(the flag doesn't even appear in the saved file while it's off). If the
machine sheds the field to hold frame rate (perfTier1), the stratum
falls back to its ordinary blend and its WET button dims in the row —
the issue's own shed answer, not a silent half-effect. It works live,
in stills, and in the warmed-up film exports equally, because all
three drink from the same served field.

## How, per file

- `app/src/gl/wetSoak.mjs` (new) — the soak recipe (`WET_SOAK`: smear
  spans/weights), the CPU mirror of the shader math, and
  `soakFieldState`, the one normaliser every render entry point uses.
  The velocity pack scale is a mirrored literal (32), pinned equal to
  vortex's constant by the suite — importing the sim from here would
  drag its cost-tier registration into the renderer's import chain
  (this actually broke costTiers coverage during the build; see
  Verification).
- `app/src/gl/shaders.mjs` — COMPOSITE_FS: the dry composite is computed
  first and untouched; an appended soak block rebuilds the composite
  from a velocity-smeared source (3 taps trailing the flow — the smear
  machinery, no new blur), multiplies the source colour by the
  absorption (pigment reflectance pack, else the ground), and mixes by
  the field's local wetness. f = 0 returns the dry pixel bit-exact. The
  matte factor is hoisted to a named variable and re-applied to the
  smeared source (pixel-identical refactor). No second rim/edge term —
  the #1813 binding direction holds.
- `app/src/gl/renderer.mjs` — composite program gains the soak uniforms
  (bound off + dummy textures when no soak → byte-identical);
  `registerCostTier('gl/wet-soak', tier 0, …)` — Phase C's "cost tier
  for the new sampling," never shed here (the shed is the service's);
  three 128² pack textures uploaded keyed on pack identity;
  `renderFrameInto`/`renderFrameOffscreen` (both)/`renderAccumSequence`
  all read the ONE unified `payload.wet` shape
  `{wetMask, wetVel, pigDep, wetAmount, display?}`.
- `app/src/gl/liveLoop.mjs` — the frame request names
  `consumers: {accum, soak}`; `degradedOk` stays false (the shed IS
  the soak's perfTier1 answer, per the issue's acceptance). The soak
  field rides the frame payload; captures MERGE the display state
  under `.display` instead of replacing the wet key, so stills soak
  too. The capture path still calls `wetGroundFromCss` exactly twice
  (standing pin).
- Flag plumbing (mirrors `feedsAccum`, #1806): `sceneContract.js`
  carries `wetSoak: true` on content layers only while on;
  `projectNormalize.js` keeps exactly-`true` on content only;
  `layersSlice.js` `toggleLayerWetSoak` (key deleted on toggle-off,
  no-op + no undo entry on pattern/FX/MATH; duplicates inherit);
  `actions.js` / `applyAction.js` / `eventBus.js` / `eventRegistry.js`
  / `wireEventBus.js` wire `LAYER_TOGGLE_WET_SOAK`.
- `app/src/panels/build/LayerStack.jsx` — the WET button in the
  expanded stratum row, content strata only, `wet-dim` class when on
  while perfTier1; `strataSummary.mjs` confesses `wet soak`;
  `panels.css` the dim rule (opacity 0.45, beside the feed-off rule).
- `app/src/gl/parity/glHarness.html` — the present probe forwards the
  wet payload (test harness only).
- `docs/WET_ENGINE.md` — status line + Phase B row marked landed; the
  strata-soak status paragraph incl. the vacuous-antecedent note.

## Measurements (evidence: docs/review/1814/)

- Mode on + no field = mode off, **byte-identical**; mode on + all-zero
  mask = byte-identical; dry half of a half-wet scene byte-exact vs
  mode-off on both render shells.
- Term (a): coverage-isolated pixels recover the pigment pack's
  reflectance (pack 64/128/192 → ratios within 0.035 of
  0.251/0.502/0.753 per channel; strongest pixel 251 → 63, ×0.251
  exactly). No pigment → absorption is the ground colour alone.
- Term (b): one isolated mark — dry edges [116, 283]; +flow
  [116, 289]; −flow [110, 283]. One-sided trailing smear; the leading
  edge never moves; the sign follows the velocity.
- Parity: candidate render vs chunked export with WET on —
  byte-identical. Warm-up export (K=90) soaks: flagged ≠ unflagged by
  > 50 px, two runs byte-identical.

## Verification (real counts, this tree, suites run solo)

- `wetSoak.selfcheck` — **31 checks passed** (new suite; wired into
  `app/selfcheck.manifest`).
- `wetFrame` 15 ✓ · `wetLook` 16 ✓ · `wetWarmup` 21 ✓ ·
  `sceneContract` 15 cases ✓ · `feedsAccumSurface` 12 cases ✓ ·
  `eventRegistry` ok (163 events) · `busChain` 14 ✓ · `costTiers` OK ·
  `uniformLocations` ok · `grainFinish` 4 ✓ · `accumFeed` 15 ✓ ·
  `accumGuard` OK · `accumInput` 7 ✓ · `projectDocument` OK ·
  `projectDocument.fuzz` ok (400 mutated documents).
- `npm run build` ✓ (built in 4.92s). `npm run format:check` ✓ — all
  files pass (prettier --write run on every touched code file before
  committing). ESLint on all touched files: clean.
- **accum — environmental, base-identical.** The suite dies silently
  (child SIGABRT) during section A in this sandbox. Control: the
  identical command (`NODE_OPTIONS=--max-old-space-size=3072`) on a
  pristine worktree at the base commit `302f738a` dies the same way.
  Not this slice; CI's selfcheck-browser job (pinned Chromium) is
  authoritative. The sandbox Playwright cache churn is the standing
  suspect (my `npx playwright install chromium` returned in ~2 s with
  no output — it did not actually install).
- **composite — OK (15 cases)** in a full batch run on this tree. The
  sandbox browser is flaky about it, though: a later solo run stalled
  at a 200 s cap mid-section-A (53 checks reached, no failures), and
  the pristine base's own section A reports 2 failures here — the
  pass stands, but CI remains the authoritative word for this suite.
- swarmWasm / rollSafety: not run — no cargo in the sandbox and no
  wasm/roll surface touched; per the dispatch these are
  environmental/base-identical.

Two findings from the build, both fixed and now pinned by the suite:

1. **Import-chain cost coverage.** wetSoak originally imported the
   velocity-pack constant from vortex.mjs; that dragged the sim's
   tier-1 registration into the renderer's import chain and costTiers
   failed (`gl/vortex` declared, unmeasured). Fixed by mirroring the
   constant (above); costTiers green.
2. **Key-order round-trip.** The duplicate-layer literal originally
   placed the wetSoak spread before `patch:` while projectNormalize
   assigns `[…, patch, feedsAccum, wetSoak]` — serialize→parse→apply→
   serialize was not byte-stable. Spread moved after `patch:`; the
   round-trip is asserted byte-stable in the suite.

## Golden re-pins (each with its cause)

1. `wetWarmup.selfcheck` source pin:
   `applyWetLookTo(payload, finished, wet)` →
   `applyWetLookTo(OT, finished, payload.wet.display)`. Cause: the
   unified `payload.wet` shape — the display state now nests under
   `.display` of the same key that carries the soak packs (three call
   sites read one shape). Behaviour unchanged; all 21 checks pass.
2. `parity/corpus.mjs`, `wet-warm-up` divergence: the gl text now
   names the strata soak alongside the warm-up render, and the entry
   is signed `'#1815, #1814'`. The id and the SVG text are unchanged —
   'mask absent → static blend' is the soak's shed behaviour too, the
   same already-signed divergence. No golden bytes changed anywhere;
   mode-off output is byte-identical by construction and by assertion.

## Boundaries & flags for the coordinator

- **#1841 (dish migration) untouched** — review lane. The soak adds a
  consumer name to the shared gate only; nothing in the dish path
  changed. If #1841 later wants a degraded (stamps-only) serve for the
  dish, the soak keeps its shed semantics per its own acceptance —
  the two consumers' flags are independent.
- **`attachVelocities` gate left ACCUM-only.** A soak-only scene
  stamps via footprints plus behave-driven vorton drift; extending
  instance-velocity plumbing to soak-only scenes risks plain-render
  byte-identity and was out of scope. Flagged, not hidden: the smear
  term reads the field's velocity (vortons), which is the field the
  issue's terms describe.
- **Cross-shell dry gap (pre-existing, not this slice).** The live
  shell (present probe) and the offline shell already differ on a
  bone-dry scene in this sandbox (max Δ223, mean Δ2.83 — live-shell
  resolve-option defaults). Parity for this slice is asserted within
  each shell, where it is byte-exact. Worth a look from whoever owns
  the live shell's resolve defaults; untouched here.
