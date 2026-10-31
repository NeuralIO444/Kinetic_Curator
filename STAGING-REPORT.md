# STAGING REPORT — #1854 BOOK S1b: the Marks pool (coordinator's copy)

Branch `feat/1854-book-s1b-marks`, stacked on `feat/1853-book-s1-chapters` @ a5b2d4a8 (S1). Local only —
publishes after S1 merges; the coordinator rebases and publishes. Issue title (verbatim): "BOOK S1b: author
the Marks chapter pool (primitive marks, glyphs, stamps)". D1 is ruled (Matt, 2026-10-31: "Author Marks
first") and recorded on this issue; D2–D6 were not needed and were not touched.

## STATUS: STOPPED at a scope decision — the pool is built; three calls sit above the builder

Everything the issue scopes as content is authored and verified (below). The build stops on ONE decision
the issue's own text creates, plus two coordinator calls the suites themselves reserve. None is a defect
in the work; all three are exactly the "don't rule it yourself" class. Details under THE STOP.

**Correction note (same builder, later commit):** the first version of this report carried a wrong sweep
tally (546/3) from a garbled run readout. The authoritative full-manifest result is **535 pass / 14 fail**,
and every one of the 14 is adjudicated below — 8 fixed in the correction commit (bake, refresh, content
fix, proven re-pins), 3 environmental/in-sweep casualties (accum since green standalone, 83/83), and the
3 decisions. The final-battery re-runs in Verification are the numbers to trust.

## What shipped

The first chapter now has a pool, and it's authored, not assembled — not one record is raided from the
glyph/stamp/letterform families (every Marks record's SVG is new, drawn for this chapter).

- **`app/src/data/assets/assets-marks.js` (new)** — 18 primitive marks in the library's own record format,
  prefix `mrk_`: two hands (a filled stencil and an outline), a tally bundle and a notch row, finger-dot
  clusters and an arc, a pigment pit, concentric rings with an ochre centre, a spiral, a tally cross, a
  zigzag band (water), a rayed sun, a tectiform, a divided quadrangle, a crescent, rain strokes, a barbed
  spear sign, and one beast. Categories ride the core vocabulary (stamps 6, linework 5, dots 3, geometric 3,
  radial 1); every tag is existing library vocabulary; every tier is declared (16× tier 1; rings + spiral
  tier 2 — costlier only in the honest sense: more geometry per mark). First-draft spiral didn't draw a
  spiral; it was redrawn until it did (see the contact sheet).
- **`app/src/data/assetStyle.js`** — one new family `marks` (prefix `mrk`) and one new style `marks`, joined
  by a single family rule placed ahead of the category fallbacks. Every record derives cleanly (assetStyle
  suite: 313 assets, 11 styles, every tag with a canonical home).
- **`app/src/data/assets/index.js`** — `ASSETS_MARKS` spread into `ASSETS_AUTHORED`. Library 295 → 313;
  no existing record was edited.
- **`app/src/data/palettes.js`** — the chapter's palettes, in the house record shape: **OCHRE WALL**
  (`ochre-wall`, cave-dark ground, bone ink, red/yellow ochre swatches) and **BONE DUST** (`bone-dust`, the
  same pigments on a light bone ground with carbon ink). Palette count 37 → 39.
- **`app/src/data/styleLooks.js`** — a `marks` look group and **5 looks** in the sibling record shape
  (FIRST WALL, TALLY KEEPER, HAND CAVE, DOT SONG, RAIN MARKS): sparse counts, low density, big quiet scale,
  slow near-still motion — the chapter barely moves, because marks were made to stay. No `multiply`
  anywhere; the styleLooks suite deals and renders every look headless (69/69 on canvas, Marks included).
- **`app/src/data/chapters.js`** — the join, and only the join: the Marks SPINE row declares
  `lookGroups/assetStyles/assetFamilies: ['marks']` and a filled card (`ochre-wall`; the hand, the rings,
  the beast). Nothing below the table changed — S1's derivation reads the pool exactly as designed.
  `voiceStyles` is still `[]` — see THE STOP.

Deck counts (chapters §3 + deckReport): **Marks looks 5** (floor 4 ✓), **assets 18** (floor 14 ✓),
**voices 0** (floor 8 — the stop below). Now (union): looks 69, voices 64, assets 312. Every other
chapter's counts unchanged.

## THE STOP — decision 1: the look group legally drags a voice family behind it

The issue scopes voices as: *"at most a minimal pairing via existing voice styles; a dedicated Marks voice
deck is a later call."* The tree disagrees with the premise that looks can land while voices wait:

- **`voiceDeck.selfcheck` §4 is a standing invariant:** for EVERY group in `STYLE_LOOK_GROUPS` there must be
  ≥6 voices in `VOICE_DECK` with `kind: 'family'` and `def.family === group.id` — "every S4 style group has
  its family." Registering the `marks` look group (required: chapters derive a chapter's looks BY GROUP, and
  the LOOKS menu lists by group) makes this suite fail with `Marks: at least six family voices`. Verified
  failing on this tree; the suite passes on the S1 base.
- **Borrowing is still dead** (and now doubly so): pairing existing styles was the raid-by-another-name —
  the only single styles reaching the floor are grunge (photocopy-era) or bauhaus (machine geometry) — and
  it wouldn't satisfy §4 anyway, which wants a family, not a pairing.
- **Exempting Marks in §4 would weaken an acceptance check to reach green.** Not done, per standing orders.

**The decision (Matt's, via coordinator): authorize authoring the Marks voice family in this slice** —
overriding the issue's "later call" — **or hold S1b's look group until the voice call is taken.** The
authorized fix is small and fully scoped (the family machinery is table-driven in `voiceDeck.js`):

1. `FAMILY_PAIRING.marks = ['stamps', 'linework', 'dots']` (14 marks assets in those categories; each
   family voice wears 8 same-style shapes by the seeded `familyPool`, satisfying §3's wear ≥ 4);
2. a `VARIANTS.marks` block of **8 rows** `[id, title, vibe, mode, motion, palette, count, acc, tier]` —
   8, not 6, because chapters' floor is 8 voices by style and family voices carry `styles: [family]`;
   modes/motions distinct within the family (§4's second clause); palettes ochre-wall / bone-dust;
3. `chapters.js`: Marks `voiceStyles: ['marks']` → chapter voices 8 = floor, deck report fully ok;
4. re-pins that follow mechanically: chapters §3 marks voices 0 → 8 and §6's Marks special-case retires to
   the generic ok branch; `voiceDeck` count 64 → 72 (45 → 53 family); `kineticScope` voice counts 64 → 72.

If authorized, this is a short follow-up build on this same branch; everything else here stands.

## Coordinator band call — decision 2: coverage guard, seed 0x1505

`coverage.selfcheck` (the #1546/#1547 ordering kill-criterion) fails on exactly one assertion: seed 0x1505,
flat ordering, `trio overlap must not exceed unordered` — measured **flat 1.173% vs unordered 1.151%**
(+0.022 pp). It passes on the S1 base. Full context, measured on this tree across the guard's 8 seeds:
never-tray IMPROVES under ordering on every seed (e.g. 0x1505: 34 → 30), tray reach improves on every seed
(279 → 283), and the Jaccard direction holds on 7 of 8 seeds. The library grew by 18 same-family assets —
the stream the guard measures is a different stream now. The suite's own comment reserves this call: *"That
band call is the staging report's, flagged for the coordinator, not silently re-baselined here."* So: not
re-baselined. Flagged, with the numbers, for the coordinator's call. (No content was tuned to chase the
seed — that would be fixing the test, not the product.)

## Coordinator call — decision 3: wetSoak's channel-2 precondition (a re-rolled draw)

`wetSoak.selfcheck` fails at its term-(a) absorption check: *"solid mark pixels present in channel 2"* —
the median-ratio helper needs >10 pixels with coverage > 0.97 and dry blue > 100, and this tree's render
has too few. Mechanism, proven: the scene is the parity corpus's `single-basic`
(`src/gl/parity/corpus.mjs:61` enables EVERY catalog asset; 36 items, seed 0xc0ffee, palette
praystation). The pool grew 295 → 313, so the seeded 36-item draw is a different draw; the blue-core
population is luck-of-that-draw. Everything else in the suite passes on this tree — dry-side byte
exactness, wet-side absorption, channels 0/1 ratios ≈ reflectance within tolerance — the physics is
verified; only the channel-2 population precondition starved. Attribution proof: in a scratch tree with
only ASSETS_MARKS removed (every other #1854 file in place), the suite passes (the one check that skipped
there was the warm-up *export* check — sandbox browser availability, unrelated). Base standalone: 31/31.
Options for the coordinator: pin the corpus scene's pool, give the soak test its own subset doc, or
re-baseline the precondition — all three touch shared test infrastructure used by accum/composite/
exportStill, so none is a builder's unilateral move. Nothing was tuned to chase it.

## Re-pins made (each with its cause; no check deleted or weakened)

1. `chapters.selfcheck` §3 — Marks {0,0,0} → {5,0,18}; Now {64,64,294} → {69,64,312}. Cause: this issue's
   pool landed; counts re-measured from the derivation.
2. `chapters.selfcheck` §4 — dealable library 294 → 312 (two assertions). Cause: 313 records − the citizen.
3. `chapters.selfcheck` §6 — Marks shortfalls `['looks','voices','assets']` → `['voices']`, ok stays false,
   cause written into the assertion. (Retires entirely if decision 1 is authorized — see above.)
4. `chapters.selfcheck` §7 — the Marks card special-case (null palette, empty marks) REMOVED; Marks now
   passes the generic card assertions every other chapter passes. A strengthening, not a re-pin.
5. `chapters.selfcheck` §9 — library size 295 → 313. Cause: 18 authored records added, none edited.
6. `styleLooks.selfcheck` — rack 64 → 69, style looks 31 → 36, groups 14 → 15, menu 64 → 69. Cause: the
   Marks group and its 5 looks.
7. `palettes.selfcheck` — catalog 37 → 39 and its roll-pool consequences (39; 41 with users; 40 deduped).
   Cause: ochre-wall + bone-dust. (`chipWindowStart(37, …)` calls are abstract-list arithmetic — untouched.)
8. `censusReadout.selfcheck` — radial category size 26 → 27 (real-artifact assertion only; the frozen
   fixture in the same file is synthetic and untouched). Cause: mrk_ring_01 joins radial.
9. `kineticScope.selfcheck` §2 — MED deck looks 64 → 69. The readout derives deck sizes from the library
   (WEAK's assets already float in the same assertion); MED mirrors the full look library, so the count is
   observed, not a cap. Voices stay 64 (they move only if decision 1 is authorized).
10. `wingWarp.selfcheck` — the two RESOLVER pins re-based (REST 4b47bdad → 0981f009; BENT a88fdc98 →
    a0e112d4), each with the dated note in the suite's own format. Proven before re-pinning, per the
    suite's #1794 protocol: with only ASSETS_MARKS removed (scratch tree), the old pins reproduce exactly
    and the builder pins never moved — the delta is catalog growth in the resolver's full-library output,
    no behaviour change.
11. `allEraGolden.selfcheck` — first-render hash re-pinned (da8cf4fa… → a52e3bd7…), the #702 precedent
    (catalog pack added → hash re-pinned with an inline note). Same scratch proof: without the marks, the
    old hash reproduces (295 assets).
12. `regionAssignment.selfcheck` — the baked-assignment census: perFamily {floral 15, radial 26 → 27,
    linework 31 → 36}, assignedRegions 292 → 309. Measured from the bake; every per-asset assertion
    (baked assignments == the family rule) already held for the six qualifying marks assets.
13. `regionLines.selfcheck` — the bend/bob census: bend 35 → 36, bob 54 → 66 (linework's assigned regions
    89 → 102; the spear's shaft region bends, and bend still appears nowhere outside linework).

## Fixes that are not re-pins

- **Region mattes baked** (`npm run bake:regions` — the step regionBake's own failure prescribes):
  `regions.generated.js` gains the 18 marks' mattes and nothing else (after the house prettier pass the
  diff is pure additions, 935 lines; existing assets' matte data verified value-identical), and the bake
  report updates (312 assets, 1189 regions, 309 kineme-assigned). Six marks assets qualify for
  family-default region kinemes — the marks are region citizens too, not just deck citizens.
- **chiaroscuro drift law** (content fix, not a check change): chiaroscuro is pinned as the
  slowest-drifting look in the instrument (noiseSpeed 0.1 = the floor). The Marks looks' first draft
  drifted slower (0.05–0.08) and broke the superlative; their noiseSpeed now sits at 0.1–0.12 — the quiet
  end of the legal range. lifeDrift and wind unchanged; the chapter still barely breathes.
- **Fixture checkpoint refresh** (the fixtures' own sanctioned protocol, per their PROVENANCE files —
  "never re-record just to make a red gate green"; this is the intentional-change shape with the control
  run): checkpoint-only refresh via `scripts/refreshFixtureCheckpoints.mjs --write` — replayGate
  a51ba1e4… → 9253b8bf… (61/61 checkpoint hashes, nonCheckpointDiffs [], deterministic), creatureRepipe
  b6effd90… → d17d2233… (16/16, []). Control: in the scratch tree (marks removed, everything else in
  place) both committed fixtures verify and reproduce byte-for-byte. Provenance entries appended to both
  PROVENANCE.md files in the house format.

## Verification

Full manifest sweep, continue-on-failure over all **549** manifest commands (the stock runner stops at the
first failure): **535 pass / 14 fail** (authoritative tally — see the correction note at the top). The 14,
each adjudicated against the S1 base in this sandbox:

- **Decisions (3):** `voiceDeck` §4 (decision 1), `coverage` seed 0x1505 (decision 2), `wetSoak`
  channel-2 precondition (decision 3) — all documented above.
- **Fixed in the correction commit (8):** `regionBake` (ran the prescribed bake), `replayGate` +
  `creatureGate` + `refreshFixtureCheckpoints` (sanctioned checkpoint refresh), `wingWarp` (resolver
  pins re-based with proof), `allEraGolden` (hash re-pinned with proof), `chiaroscuro` (content fix:
  Marks noiseSpeed raised to the legal floor), `kineticScope` (MED looks re-pin).
- **Environmental (2):** `swarmWasm` (build-wasm.sh --verify cannot reproduce the kernel wasm without
  cargo, absent in the sandbox; S1 proved it base-identical on pristine origin/main; the stock
  `npm run selfcheck` halts there) and `fx/rollSafety` (node sections pass standalone; its browser
  section wedges or throws inside the sandbox Chromium across repeated runs — the failure S1 documented
  as base-identical on pristine main). `accum` also died in the sweep without an assertion, in the same
  browser layer — but standalone on the final tree it is fully green (83/83 cases, no skipped sections),
  so it counts as an in-sweep casualty of the sandbox, not a failure of the tree. Sandbox
  `npm run build` is likewise broken identically on pristine main (@tauri-apps/api) — CI is
  authoritative for all of it.

Final battery — every previously-failing or blast-radius suite re-run on the corrected tree after the
last change: chapters ✓, assetStyle ✓, styleLooks ✓ (all 69 looks render headless), palettes ✓,
censusReadout ✓, kineticScope ✓, chiaroscuro ✓, wingWarp ✓, allEraGolden ✓, replayGate ✓, creatureGate
✓, refreshFixtureCheckpoints ✓, regionBake ✓ (312 assets, 1189 regions), regionMattes ✓,
regionAssignment ✓, regionPlayback ✓ (GPU OK), regionLines ✓, overlay ✓, accum ✓ (standalone, 83/83).
In the sweep and still green:
census, rollPool, engraving (the issue's "engraving-finish-compatible" premise — the marks ride the same
category/style axes the finish reads), poolCitizenship, cellKinemePlayback, kineticSweep. Still red, by
design, awaiting the calls above: voiceDeck §4, coverage, wetSoak. Prettier: all touched code + selfcheck
files clean, including the baked regions file (the sandbox's `npm run format:check` can't find its
prettier binary — same broken shared install as S1; `npx prettier` verifies the touched files directly;
CI is authoritative).

## Lois pass — the blunt version (9 rules)

1. **Creativity is a solution, not decoration.** Marks wasn't a missing theme, it was a broken promise —
   the book opened on an empty room. Now the room has walls, and things on them.
2. **Defeat the habit of expected form.** Expected form says: borrow the glyphs, rename them, ship. Killed.
   Every mark here was drawn for this chapter or not at all.
3. **The big idea in a nanosecond.** One look at the contact sheet: hands, tallies, a beast, ochre. You
   know where you are before language starts — which is the entire point of the chapter.
4. **Assume everyone is smart.** The deck report still says Marks is short on voices, and this report stops
   rather than papering over why. The audience — and Matt — can handle the truth.
5. **Caution is death.** Five looks, not forty. Eighteen marks, not a hundred. The first chapter should
   feel like scarcity, because it was. (Caution would also have exempted a selfcheck to go green. Also death.)
6. **Work is worship.** The spiral's first path didn't draw a spiral, so it was redrawn until it did. The
   pit was too round; it's less round now. Nobody would have filed a ticket. That's not the standard.
7. **Trends are the enemy.** No "cavecore" mood-board cosplay, no texture pack. Pigment, bone, carbon —
   the materials are the style.
8. **Don't create, discover.** The tally, the hand, the ring — nobody invented these. They were found,
   again, the way they were found the first time.
9. **True to yourself.** KINETIC deals these marks like citizens, Davis reads them like a chapter, and the
   book opens where a person would open it: at the beginning.

**Kill list:** the borrowed voice deck (grunge machines do not voice the first fire); the §4 exemption
(never weaken the check to pass it); padding the pool past what a wall can hold; "primitive" as a filter
effect over modern glyphs (that was the raid, wearing a costume); tuning content to a seeded statistic.

## Visual evidence

`~/workspace/kc-1854-shots/marks-contact-sheet.png` — all 18 marks, labelled, on both chapter palettes
(offline render of the authored SVGs — honest label: this is the content sheet, not an in-app capture; the
in-instrument proof is the styleLooks headless render, which deals all 5 Marks looks onto a canvas).
Coordinator: this is content, so the issue's acceptance is Matt's glance (review-lane sign-off on the pool);
the code half rides the backend lane as usual.

---

## FINISHER — the three decisions, resolved (2026-10-31)

The stop above is cleared: all three calls were taken, and this section is the record. Decisions 1 and 3 are
fully landed and green. Decision 2 is landed as authorized — and its measurement turned up one adjacent
delta the original summary missed, flagged at the end for the coordinator rather than silently absorbed.

### Decision 1 — the Marks voice family, authored (Matt's ruling, 2026-10-31)

Exactly the scoped fix the report laid out, nothing wider:

- **`voiceDeck.js`** — `FAMILY_PAIRING.marks = ['stamps', 'linework', 'dots']` (the 14 marks assets in
  those categories; each voice's seeded `familyPool` wears 8 of them), and a `VARIANTS.marks` block of
  **8 authored rows**. The register is the chapter's: pigment, bone, carbon; placed once and left alone —
  seven voices ride `still`/`drift` at sparse counts (36–96), and only the pit keeps an after-image:
  - **Ochre Hand** (poisson/still, ochre-wall, 44, light) — blown pigment: a hand held to the wall, sprayed
    around, left as a ghost. The stencil hand, performed.
  - **Tally Row** (stratified/still, bone-dust, 88, light) — notches in rows on bone: somebody counted
    something here, and meant it.
  - **Ring Dance** (radial/orbit, ochre-wall, 56, light) — rings around a centre, turning at the speed of
    a ceremony, which is barely. The family's one circling voice.
  - **Dot Chant** (grid/still, bone-dust, 96, light) — finger dots dabbed one breath apart: a chant you
    can count.
  - **Rain Line** (flow/drift, ochre-wall, 64, light) — falling strokes on a dark ground: weather,
    remembered indoors.
  - **Sun Sign** (circlepack/still, bone-dust, 48, light) — rayed suns packed shoulder to shoulder, none
    touching.
  - **Spear Sign** (random/drift, bone-dust, 36, light) — one barbed sign repeated along a border: this
    far, no further. The sparsest voice in the family.
  - **Pigment Pit** (gaussian/still, ochre-wall, 54, accum(12, 0.03), medium) — the grinding hollow: marks
    made here leave an after-image; the wall remembers. The family's one ACCUM voice (never 'light', per
    the deck's law).
  All eight mode/motion signatures are distinct (§4's second clause); all eight render headless in tier —
  measured peaks 27–65 marks, properly sparse against the light budget of 320. §4 passes with the family
  at 8 ≥ 6, no borrowing, no exemption.
- **`chapters.js`** — Marks `voiceStyles: ['marks']`; the row's comment and the module header now record
  the ruling instead of the deferral.
- **The deck, verified from `deckReport()`:** Marks **{looks 5, voices 8, assets 18}, ok = true,
  shortfalls []** — every chapter in the book now reports ok. Now reads voices 72.

Mechanical re-pins that followed (each cause named at the assertion):

1. `voiceDeck.selfcheck` — deck count 64 → 72; kinds family 45 → 53 (header + §1 + closing line).
2. `chapters.selfcheck` §3 — Marks voices 0 → 8; Now voices 64 → 72.
3. `chapters.selfcheck` §4 — "Now holds every voice" 64 → 72 (§4's stale "(294)" header comment → 312).
4. `chapters.selfcheck` §6 — the Marks shortfall special-case retires to the generic ok branch (a
   strengthening: Marks now passes the same assertions every other chapter passes); section comment and
   the file header updated to match.
5. `kineticScope.selfcheck` — MED/KOZ readout voices 64 → 72; `VOICE_DECK.length === 64` → 72; header
   "64/64" → "69/72".
6. `kineticScope.mjs` — the MED prose line: 64 looks / 64 voices → 69 / 72.
7. `kineticSweep.selfcheck` — two assertion MESSAGES ("one of the 64 looks/voices") de-pinned to "one of
   the dealt looks/voices"; the assertions themselves derive from the decks and are unchanged.

### Decision 2 — coverage band re-baselined (coordinator's call) — with one flag

Implemented as authorized: the trio-overlap direction in `coverage.selfcheck` now carries a named band,
`TRIO_JACCARD_BAND = 0.0005` (±0.05 pp), with the full measurement and the cause (pool growth 295 → 313,
#1854) written into the guard's comment block. Measured on this tree (the suite's own fixtures, 600 rolls,
8 seeds): the band absorbs exactly the two flat-fixture deltas — 0x1505: 1.173% vs 1.151% (+0.022 pp),
0x150a: 1.070% vs 1.056% (+0.015 pp) — and the opinionated head holds the exact direction on all 8 seeds.
Never-tray and tray reach keep the exact direction in the code, per the call. Nothing else in the suite
changed.

**THE FLAG:** with the Jaccard assertion no longer stopping the sweep at 0x1505, the loop now reaches a
second delta the original report's summary did not catch — **seed 0x1509, FLAT fixture: never-tray 32 vs
unordered 31 (+1)**. The report's premise "never-tray improves on every seed" holds for the opinionated
fixture (18–30 across seeds, all ≤ unordered) but not for flat on 0x1509. I did **not** extend the band to
never-tray: the coordinator's call named the Jaccard delta, and widening it is a ruling, not a re-pin.
`coverage.selfcheck` therefore still fails on exactly that one assertion; every other comparison in the
guard (all 8 seeds × both fixtures: banded Jaccard, reach improving or holding everywhere) passes, as the
scratch census and the suite's own run to 0x1509 both show. Coordinator: a ±1 never-tray band in the same
comment, or a named per-seed exception, closes it in one line — your call.

### Decision 3 — wetSoak has its own fixed scene (coordinator's call)

`wetSoak.selfcheck` no longer renders the parity corpus's `single-basic`. It builds its own scene in the
corpus doc's exact shape (seed 0xc0ffee, praystation, count 36, lifeDrift 0, one content layer) over a
frozen subset of eight big single-silhouette fills — geo_circle_01, geo_square_01, geo_square_03,
geo_tri_01, geo_diamond_01, geo_star4_01, org_leaf_01, org_petal_01 — so the solid cores the absorption
terms measure exist by construction, whatever the catalog grows into. The precondition numbers were NOT
tuned; the shared corpus was NOT pinned or touched (accum / composite / exportStill keep their scene, and
the suite's "corpus stays dry" check still pins it). Measured margin on the fixed scene: 579 solid-core
pixels (coverage > 0.97); qualifying pixels per channel R 566 / G 551 / B 73 against the helper's > 10
floor — blue, the starved channel, now sits 7× above the floor, fixed by construction. **wetSoak: 31/31
checks passed**, matching the pre-#1854 base standalone count, both term-(a) checks included.

### Finisher verification

- **Final battery, re-run after the last change:** chapters ✓ · voiceDeck ✓ (72 voices; 4 flagship, 15
  promoted, 53 family; all render in tier) · kineticScope ✓ · kineticSweep ✓ · assetStyle ✓ · styleLooks ✓
  (69/69 render) · palettes ✓ · censusReadout ✓ · chiaroscuro ✓ · wingWarp ✓ · allEraGolden ✓ ·
  regionAssignment ✓ · regionLines ✓ · overlay ✓ · wetSoak ✓ (31/31) · accum ✓ standalone (83/83 cases).
  The remaining battery names (regionBake, regionMattes, regionPlayback, replayGate, creatureGate,
  refreshFixtureCheckpoints) ran inside the full sweep below — all pass.
- **Full manifest sweep** (continue-on-failure over all 549 commands): **545 pass / 4 fail** — `swarmWasm`
  (no cargo in the sandbox; base-identical per S1) and `fx/rollSafety` (browser section wedges in sandbox
  Chromium; base-identical per S1) are the known environmental pair; `accum` aborted in-sweep without an
  assertion (the same sandbox casualty S1b recorded) and is **fully green standalone, 83/83**; `coverage`
  fails on the single flagged never-tray assertion above, by design, awaiting the coordinator's extended
  call.
- `npx prettier --check` clean on all nine touched code files. One-writer files untouched. D2–D6
  untouched — the voice authoring needed none of them.
