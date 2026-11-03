# STAGING REPORT — #1932: FIELD: the poem as stage material

Branch `feat/1932-poem-stage-material`, local commits only (coordinator publishes).
Contract: issue #1932 body + the 2026-11-03 expansion comment (6609003994) folding in
Matt's clarification — the stage letters FORM the poem; silence is the default and the
poem is earned; type in the deal is genre-gated. Built in the order the spec lists.

## What was built, per spec point

### 1. Genre gate for type eligibility
- `app/src/curator/fieldDirector.js`: **`TYPE_NATIVE_FAMILIES = { swiss, bauhaus, japanese }`**
  — the ONE named constant set, with the #1932 ruling in its comment (Swiss/Bauhaus
  lettering genres; japanese for the kanji contexts; everything else — grunge, op,
  memphis, engraved, marks, and the core looks whose groups live outside the style
  families — is not type-native). Plus `isTypeNativeFamily(family)`.
- `choosePoet` gains `typeEligible` (default **false** — silence is the default; a
  caller must affirm eligibility). The gate is checked before temperature and before
  rejection-damping: a non-eligible room returns null, full stop.
- `app/src/curator/fieldEval.js`: `step` computes eligibility from `input.lookFamily`
  and passes it in. The offline SCENARIOS now stand in a type-native room
  (`lookFamily: 'swiss'`) — they measure temperature behaviour; the gate is measured
  in fieldSilence.
- `app/src/curator/director.js`: `tick({ ..., lookFamily })` and
  `dealPoet({ ..., lookFamily })`. The Director remembers the last family named at
  pick time (`lastLookFamily`); unnamed calls read the remembered room; `reset()`
  forgets it (no room named = silence).
- `app/src/state/slices/layoutSlice.js`: `lookFamilyOf(compositionId)` reads a look's
  family from COMPOSITION_PRESETS (its styleLooks `group`). The CURATOR press's tick
  hears the CURRENT dealt look's family (the look standing as the press begins);
  `landPoem` names the family of the params the poem will stand with (the press's
  landed look). Both reads are "the look dealt at the moment the FIELD decision is
  made" — the Director's existing pick-time discipline.
- Standing behaviour deliberately untouched: rejection-damping (70% silence after a
  reject, measured 30.0% armed), HOLD / KEEP / re-deal, the poem row, poets own
  words+form only, `fieldForm` payload shape unchanged (no migration), baked `typ_*`
  stamps only.

### 2. Silence gate + threshold
- `app/src/poets/fieldForm.js`: **`FIELD_POEM_MIN_STAMPS = 12`**. Derivation, measured
  with `placePiece` itself over the shipped decks (every piece × densities
  {0, .25, .5, .8, 1} × aspects {0.6, 1, 10/7, 16/9, 2.6}; the count is structural —
  one stamp per non-space glyph — and did not move): **every real piece places
  15–35 stamps**; the smallest is Gibson w2 ('CHROME' / 'AND THE CUT') at 15, the
  largest Teijo t2 at 35. The gate sits at 12 — under every complete poem in the
  decks, over any fragment (the longest single word in any deck is 9 letters).
- `fieldFormForDeal` returns null under the threshold: the dealt piece does not
  materialize, and every landing path already treats a null form as silence
  (clears the standing form). The derivation is pinned in-suite
  (fieldStampPath: gate ≤ smallest placed piece, gate > longest word, a fragment
  piece places under the gate).

### 3. The poem lives on the dish as stamps; the plate is retired
- `app/src/engine/buildPlacements.js`: the #1904 stamp block is RESTORED (it was
  lifted out by #1928): `sanitizeFieldForm` + `FIELD_EM_SCALE = 20` (original
  calibration comment kept, plus a #1932 note: #1928 grew placement's em to true
  cap heights ~0.054–0.092, so forms now land at item scale ≈ 1.1–1.8 — still the
  ordinary-mark band; a live-stage recalibration read is Matt's feel gate). Stamps
  become items at exactly the placed positions, coloured by the layer's own
  strategy, at the top of the layer's alpha range, appended copy-on-pool-hit as
  before. They join BEFORE the overlap sort and the material flag loop, so mirror,
  glass and materials treat them as ordinary marks; the SoA weather above them
  (lean/snap/air) does not move them — a held form is not loose marks, exactly the
  pre-#1928 law.
- `app/src/gl/sceneContract.js`: the `plate` key IIFE removed — the poem is in
  `instances` now; poem-less contracts are byte-what-they-were.
- `app/src/gl/renderer.mjs`: the plate composite removed entire — mask texture
  cache, `overlayPlate`, the `framePlate` read, the readback `plate` option, the
  present-path overlay call, the program's disposal and the base export.
- `app/src/gl/shaders.mjs`: `PLATE_FS` removed.
- **Retired with cause: `app/src/poets/typePlate.mjs` and
  `app/src/poets/typePlate.selfcheck.mjs` are deleted, and the suite's line is
  removed from `app/selfcheck.manifest`.** Cause: #1932 supersedes #1928's plate as
  the poem's home (Matt, 2026-11-03: the plate made KC-1 read as a background
  maker). Its assertions were NOT silently dropped:
  - The **spacing floor** — the guarantee that was real — is re-asserted against
    placement itself in `poets/placement.selfcheck.mjs` (re-homed blocks: measured
    glyph metrics; ink boxes never overlap within a word or across lines and never
    leave the dish, over **1,920 placements** = every piece × densities {0,.4,.8,1}
    × aspects {0.6,1,10/7,16/9,2.6} × 6 seeds; the strict-grid word-break rule).
    The full placement suite now runs 560,366 assertions, 0 failed.
  - The plate-only guarantees (backing geometry, WCAG plate colours, mask painter,
    contract `plate` key, renderer overlay order) retired WITH the presentation
    they described — they have no object under the new law.

### Weather / legibility note (spec point 3's honesty clause)
v1 default stands: the letters live in the layer like assets. Measured: mirror
reflects the form with the layer (item count doubles exactly — fieldStampPath);
the layer's material flags reach the stamps (they join before the material loop);
ACCUM/FX finish now touch the poem because the poem is in the frame — that is the
issue's intent ("what plays is what renders" is now trivially true: there is one
render). The SPACING floor is a placement property and is intact (above). What no
suite can measure is poem-vs-ground contrast under finish FX — that is the issue's
own acceptance gate (Matt's eyes), not quietly exempted here: the stamps take the
layer's colour strategy at the top of its alpha range, and no exemption was built.

## Measured silence/armed rates under the gate (fieldSilence, printed by the suite)
- Pick grid, eligible, no rejection: **armed 600/600 (100.0%)** — temperature alone
  still never silences (the #1904 pin, re-pinned with the gate named as its condition).
- Pick grid, no eligibility affirmed: **armed 0/600 (0.0%)**.
- Step grid, hot room (intensity 0.9): **grunge armed 0/200, japanese armed 200/200**.
- Pick grid after rejection (eligible): armed 120/400 (30.0%) — the damp, unchanged.
- evalLoop scenarios (type-native rooms): silence 0.0% steady/hot/streak, 14.7%
  withRejection — unchanged from #1904's prints, as designed.
- Live-config Director: **no room named → armed 0/24 ticks; swiss room → 24/24**.
- Real store (poemRow): across look/curator/chaos presses, a poem stands **iff**
  the landed look's family is type-native (biconditional asserted per press);
  (fieldDeal): a CURATOR press in the default classic room lands no form.

## Every re-pin, with its cause
- `fieldDirector.selfcheck` — temperature assertions now pass `typeEligible: true`
  (cause: the pick requires affirmed eligibility, #1932); new gate assertions added
  (silence at any temperature un-affirmed; the ruled set membership). 11 passed.
- `fieldSilence.selfcheck` — rewritten around the gate its header always said was
  Matt's call (cause: #1932 rules and builds it). Plate assertions replaced by the
  dish assertion (armed ⇒ every stamp on the dish). Rates above.
- `fieldLiveDeal.selfcheck` — all drives name `lookFamily: 'swiss'` (cause: a tick
  must name its room now); the "arms on every tick" pin now reads "in a type-native
  room"; new block: the same bands in a grunge room deal silence on every tick.
  Deal spreads unchanged (cool pieces 8, neutral 16, hot 8; greenleaf reachable). 9 checks.
- `fieldDeal.selfcheck` — fixture room stands in swiss 'raster' (cause: the press's
  room must be type-native for a form to deal); new block: the same press in
  'praystation' lands no form. 5 checks.
- `poemRow.selfcheck` — fixture room stands in swiss 'raster' (cause: the default
  room is silent by design now); ruling 1 asserted in gated form (voice: varying
  poems as before; look/curator/chaos: the biconditional above); the HOLD-under-undo
  block's "dealt is not undefined" pin replaced by "a form or silence, and a form
  passes its own door" (cause: a look pass may now honestly land silence). 13 checks.
- `kineticSweep.selfcheck` — its HOLD block stands the room in swiss 'raster'
  before re-dealing a poem to hold (cause: re-deals land only in type-native
  rooms; the default room is silent). No assertion weakened.
- `fieldStampPath.selfcheck` — the #1928 re-pin REVERTED to S3's law (cause: #1932
  restores the stamp path), plus the threshold pins. All assertions pass.
- `placement.selfcheck` — spacing-floor blocks re-homed from the retired typePlate
  suite (cause above). 560,366 assertions.
- `composite.selfcheck` — renderer program keys: 8 → 7, 'plate' removed (cause:
  the plate program retired with the plate).
- `fieldEval.selfcheck` — NOT re-pinned: passes unchanged (scenarios carry the
  family in fieldEval.js itself).

## Verification (all by file, from app/)
- FIELD family: fieldDirector ✓, fieldEval ✓, fieldSilence ✓, fieldLiveDeal ✓,
  fieldDeal ✓, fieldStampPath ✓, placement ✓, poemRow ✓.
- Touched-module sweep: 105 suites selected by import/surface greps over every
  module touched (director, fieldDirector/Eval, fieldForm, buildPlacements,
  sceneContract, renderer, shaders, layoutSlice/store surfaces). 101 passed in the
  loop; the 4 loop failures were adjudicated standalone: glassBody OK (8 cases —
  loop abort under parallel npm-install load), accum OK (85 cases — same abort),
  composite OK (15 cases, after its re-pin), kineticSweep OK (after its re-pin).
  Plus lootWrite ✓ and directorPresence ✓ (Director consumers outside the grep set).
- `npm run format:check` clean (prettier applied to 4 touched files);
  `npm run lint` 0 errors (11 warnings, all pre-existing in untouched files);
  `npm run build` ✓.
- e2e: grepped ALL of app/e2e/ for plate/poem/field selectors — **no hits exist**;
  nothing to re-pin.
- The full 571-suite sweep was NOT run (per instructions — the coordinator runs
  it at publish). app/package-lock.json churn from the verification `npm install`
  was reverted; it is not part of this change.

## Not built / not touched
- No stress/creature/gl code beyond what the FIELD path already imports.
- The SLOW_DEBT_WINDOW flag and the choosePoet temperature pools are untouched.
- DISH LIFE (#1923), #1905/#1906: untouched, as ordered.
