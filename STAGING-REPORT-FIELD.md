# STAGING REPORT — FIELD S1-placement (#1902 remainder) + S3 stamp path (#1904)

Branch: `feat/1902-field-placement-stamp` on origin/main c83dad2b. ONE report for both
slices; commit map at the end marks which commits close which slice's scope.
Review lane: coordinator publishes, Matt merges. Nothing pushed by the builder.

Green light: FIELD epic #1901, Matt's lane jump 2026-10-31 ("FIELD jumps the lane");
PR #1907 merged the decks + pick module. (The "Not green-lit" line in the #1902/#1904
issue bodies predates that ruling.)

## Premises verified against the actual tree (before any code)

1. **Decks shipped by #1907, shape as specced.** `app/src/poets/{greenleaf,teijo,rosselli,gibson}.js`:
   frozen arrays of `{ id, lines: [...], layout, density }`, lines authored in the REAL
   stamp charset (uppercase A–Z + digits; the #1907 fix uppercased them in place, words
   unchanged). Layouts present: greenleaf `grid|bands`, teijo `bands|single`,
   rosselli `square`, gibson `single|two` — exactly the spec table's recipes. Placement
   consumes them as they are; no deck edits.
2. **Charset law.** `ASSETS_LETTERS` (`app/src/data/assets/assets-letterforms.js`):
   36 `typ_*` stamps, A–Z + 0–9, Anton outlines baked in a 100×100 viewBox, cap height
   ~80 units. A space is a placement gap, never a stamp.
3. **Pick module.** `curator/fieldDirector.js` `choosePoet` returns
   `{ poetId, pieceId, lines, layout, density } | null`; `curator/fieldEval.js` is the
   pure step around it. `director.js` tick returns the trimmed
   `poet: { poetId, pieceId, layout } | null` — the piece is recoverable from
   `POETS[poetId]` by `pieceId`, so **no director.js change is needed** to arm a form.
4. **The stamp path seam.** The live caller of `buildPlacements`
   (`app/src/engine/buildPlacements.js`) is `gl/liveResolve.mjs` (one-writer — NOT
   touched). Per layer it builds `layoutParams = { ...DEFAULT_LAYOUT_PARAMS,
   ...(src.layoutParams || {}) }` from the store's params, and `validateLayoutParams` /
   `normalizeLayoutParams` (data/layout-modes.js) **pass unknown keys through
   untouched**. So an armed form riding `layoutParams.fieldForm` reaches
   buildPlacements with zero changes to liveResolve / liveLoop / particles.
   buildPlacements' own discipline (ephemeral, gated, parity-exact when off) is the
   pattern the wiring follows.
5. **Arming site.** `curateUnlocked` (state/slices/layoutSlice.js) already ticks the
   Director at its press (the tick whose `gains.kinWeight` sizes the candidate pool)
   and commits `layoutParams: landedParams` in the same store update — the kinetic
   book shuffle deal. The form is dealt there, held across voice passes (nothing
   else rewrites it), and re-dealt (or cleared by a silent deal) on the next
   Curator press. Placement randomness comes off the press's own seeded stream:
   `rngForIndex(seed, CH.curate, press + 0x30000, seedOffsets)` — the colour deal's
   `+ 0x20000` sub-deal pattern, no channel-registry change.
6. **Cost registry.** #1907 already registered `field/poet-choice` (tier 0, pick-time,
   append-only block): it covers the CHOICE only. The placement append inside
   buildPlacements is a new, separate cost — registered as `field/placement`
   (see build notes). Governor shed order untouched.

## The silence law — measured, and the boundary found (read this, Matt)

Spec law: "Silence is default. A poem appears only when the Director arms one."
What the shipped pick module actually does, measured by driving the real pick path
(`fieldEval` loop over all four scenarios × seeds, plus the Director with the live
singleton's constant `() => 0.5` field rng):

Measured by `curator/fieldSilence.selfcheck.mjs` (this branch, run 2026-11-01):

- Pick grid (intensity × slowDebt × 40 seeds), no rejection: **armed 600/600 —
  100.0%**. There is no arming gate to measure around; the rate is structural.
- Same grid immediately after a rejection (damp active): **armed 120/400 —
  30.0%**, exactly the damp's design rate. (Method note: the damp draw must be
  taken from a warmed stream — both seeded prngs in this repo deal first draws
  clustered near zero from small seeds, which fakes a 0% rate. Production
  streams are warm or hash-decorrelated; the suite measures like them.)
- evalLoop (the pick path as it ships), 300 steps per scenario: steadyCool
  **silence 0.0%**, steadyHot **silence 0.0%**, hotStreak **silence 0.0%**,
  withRejection **silence 14.7%** (armed 85.3%).
- Live-config Director (the app singleton: constant `() => 0.5` field rng,
  `rejected: false` on every tick — director.tick hardcodes it): **armed
  24/24 ticks**. In the live app today the rejection damp never engages via
  tick at all, so live arming is 100% of Director ticks.

Structural finding, stated plainly: `choosePoet` returns null ONLY on the
rejection-damp draw (`lastRejected && rng() < 0.7`) or an empty deck. There is no
arming gate — no probability or condition under which an ordinary pick deals
silence. Under this wiring the DISH obeys the law exactly (no stored form ⇒ zero
FIELD stamps, proven through buildPlacements; a silent deal clears the form), but
in practice almost every Curator press deals a form, so the performed reality is
"a poem on nearly every deal" rather than "silence unless dealt". Whether the deal
needs a silence gate (and at what rate) is a Director-design call — **Matt's, not
the builder's** (flagged in FIX-REPORT-1907.md the same way). This build wires the
path faithfully and reports the rate; it does not invent a gate.

## Design (as built)

- `poets/placement.js` — pure: piece + rng → frozen stamp list in unit dish space
  `{ assetId, ch, x, y, rotation, em }` (x/y = stamp centre, em = cap height as a
  fraction of dish height). Recipes by layout mode (grid / bands / single / two /
  square) under per-poet constraints; rotation 0 everywhere; every stamp inside
  the dish with margin; density scales spacing/module size monotonically per
  recipe. No Math.random, no clock — rng is the caller's seeded stream.
- `poets/fieldForm.js` — `fieldFormForDeal(decision, rng)`: tick decision
  ({poetId, pieceId} — piece re-read from POETS) → the `layoutParams.fieldForm`
  payload `{ poetId, pieceId, layout, stamps }`, or null for a silent deal.
  `sanitizeFieldForm(raw)`: the trust-boundary door for document data (mirrors
  sanitizeFieldMap's discipline) — unknown poet/layout, non-finite or
  out-of-dish stamps, unknown stamp ids, or >200 stamps ⇒ null.
- `engine/buildPlacements.js` — gated append: when the sanitized form is present,
  its stamps become items at exactly the placement positions (unit → px by
  canvasW/H; em → item scale by a named constant), coloured by the layer's own
  `assignColor` strategy, keyed `field-<poetId>-<pieceId>-<j>`. Appended after
  the fieldMap pass, before the overlap sort and material flag loop, so mirror /
  glass / materials treat them as ordinary marks of the layer. Pool-safe: on a
  pool hit the item array is copied before appending, never mutated. No form ⇒
  the code path is not entered and items are byte-identical (proven by measured
  before/after in the wiring suite, not asserted).
- `state/slices/layoutSlice.js` — `curateUnlocked` only: the press's Director
  tick result is kept whole; after the pick lands, the deal is computed and
  `fieldForm` is set on (silent deal: deleted from) the landed params, in the
  same store commit. No other action changes.
- `engine/kernel/costRegistry.mjs` — append-only `field/placement` entry.

## NOT done

Room bias (#1905) · whisper/overlay (#1906) · font-ingest bake · any live webfont
(font ruling on #1901) · a silence gate in choosePoet (Matt's call, above) · no
one-writer file touched (liveLoop / liveResolve / particles) · Governor shed
order unchanged · decks unchanged.

## Verification

New suites (all registered in `app/selfcheck.manifest`, all green):

- `poets/placement.selfcheck.mjs` — **1726 passed, 0 failed**: charset law over
  every deck line, determinism bit-for-bit, per-poet recipe invariants,
  density monotonicity.
- `poets/fieldStampPath.selfcheck.mjs` — all assertions passed: deal ==
  placement stamp-for-stamp; sanitize round-trip + every refusal case;
  **parity measured byte-identical** for no-form / undefined-form /
  garbage-form params; armed build appends exactly the stamps at the exact
  positions with the layer's own marks byte-identical; replay determinism;
  shared-cache pool safety (no duplication; baseline restored exactly after
  clearing).
- `curator/fieldSilence.selfcheck.mjs` — all assertions passed; the measured
  arming rates are in the silence section above.
- `state/fieldDeal.selfcheck.mjs` — 4 checks passed against the real store:
  a landed press deals a form onto the landed params; the deal replays from
  (seed, press #); the form is held across a voice pass; a no-op press deals
  nothing.

Touched-file families, each run standalone, exit 0: buildPlacements,
goldenPlacement, stagedEval, costRegistry, liveResolve, director,
directorRoom, queenDeniability, curate, census, fieldDirector, fieldEval,
travel, surge, parallaxDrift, markWeather, fieldMap, normalize,
useCanvasItems, kineticRoll, roundWiring, chapterNarrowWiring, voiceSlice.

Full manifest sweep — the honest account: this sandbox was under extreme
multi-lane contention during verification (load average 10–14; background
job duplication in the harness corrupted the first run's log and tally).
Three runs were made. Run 1 (475 PASS / 100 FAIL) is **disproven as
contention**: run 2 completed the full manifest at **PASS=563 FAIL=12
TOTAL=575**, and every suite family my change touches passes standalone.
The only FAIL lines surviving in any sweep log are the two documented
sandbox environmentals — `engine/kernel/bake/swarmWasm` (no cargo in the
sandbox) and `fx/rollSafety` (Chromium crash in the shared harness) — both
re-run standalone at handoff with the same disposition (swarmWasm exit 1;
rollSafety cannot finish in this harness). A third run with a unique log
(`~/workspace/field-sweep-FINAL-b7.log`) was still in flight at handoff.
The coordinator's publish sweep on a quiet box is the deciding run.

e2e: no UI surface changed, so no selector re-pins; the only FIELD grep
hits in `app/e2e/` are the unrelated pattern modes (FEED/MOD/FIELD) in
pattern-controls / pattern-track.

`npm run format:check` in app/: **clean** (full tree).

### Screenshots (~/workspace/kc-field-shots/, dist of this branch)

- `unarmed-scatter.png` — factory scene, no form: plain scatter untouched.
- `curate-deal-live.png` — after a genuine CURATOR press in the running app;
  the deal (Teijo t3, 24 stamps) was read back from the store in-page.
- `rosselli-r3-room.png` — **the form held in a live room**: Rosselli r3
  "DENSE LINE / EDGE TO EDGE" as a green edge-to-edge block among the
  room's marks (count thinned to 60 for legibility; 70 nodes total).
- `rosselli-r3-isolated.png` — the same form alone on the dish (count 0).
- `rosselli-r3-square-armed.png`, `gibson-w3-two-armed.png`,
  `unarmed-after-form.png` — armed/removed states in the dense factory
  room; see the bake note below for why the letterforms are not yet
  visible in those particular frames.

**Bake-latency finding (headless artifact, diagnosed, not a wiring
defect):** the GL renderer skips instances whose (asset|tint|accent) cell
is not yet baked (renderer.mjs, Spine B #388: "new combos simply do not
draw until baked"). A dealt form introduces ~20 new combos; on this
starved sandbox (0.1–1.3 fps under load 10–14) the atlas bake took ~45 s
on a static scene and never caught up inside a playing dense scene —
hence the dense-room frames above show the form counted in the stage's
nodes but not yet drawn. With a static or sparse scene the same build
draws the form exactly as placed (the two Rosselli shots). On real
hardware the bake is the ordinary sub-second async raster every new
combo already goes through. **FIELD_EM_SCALE calibrated 12.5 → 20** from
the first dense-room frames (glyphs at scale ≈ 0.69 vanished among
ordinary 0.8–1.8 marks; at 20 they land at ≈ 0.83–1.10, the size of
ordinary marks — see the comment at the constant).

Screenshot provenance: frames are from `vite build` output of this
branch served on a fake host (the sandbox blocks localhost and its dev
server is too slow under load); driven through the app's own e2e hooks
(`__KC_EXPOSE_STORE`, `__KC_GOVERNOR_OFF`, `?boot=factory`). The footer
reads build e85331b6 — the git HEAD baked at build time; the dist also
carried the FIELD_EM_SCALE calibration, committed in the final commit
below. One environment fix was needed and is NOT in the tree:
`@tauri-apps/api` (a declared dependency) is missing from this sandbox's
shared node_modules and was installed `--no-save` into this worktree's
gitignored node_modules only, so the bundle could resolve it; it fails
identically on pristine main here.

## Commit map

- `eb929fd4` — **#1902 scope**: pure placement function
  (`poets/placement.js`) + its suite + manifest line + this report's
  premise/design record.
- `7a763559` — **#1904 scope**: `poets/fieldForm.js` (deal + sanitize),
  the buildPlacements stamp-path append, the layoutSlice deal,
  `field/placement` cost entry, three suites (fieldStampPath, fieldDeal,
  fieldSilence) + manifest lines.
- `e85331b6` — prettier pass on the slice files (formatting only).
- Final commit — FIELD_EM_SCALE calibration (12.5 → 20) + this completed
  report.
