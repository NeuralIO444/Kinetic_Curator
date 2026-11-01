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

- (numbers filled in at verification — suite `curator/fieldSilence.selfcheck.mjs`
  prints them; this section is completed from its output, not asserted.)

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

## Verification (filled in at the end)

- (pending)

## Commit map

- (filled in at the end — which commits close #1902 scope, which close #1904)
