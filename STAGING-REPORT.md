# STAGING REPORT — #1854 BOOK S1b: the Marks pool (coordinator's copy)

Branch `feat/1854-book-s1b-marks`, stacked on `feat/1853-book-s1-chapters` @ a5b2d4a8 (S1). Local only —
publishes after S1 merges; the coordinator rebases and publishes. Issue title (verbatim): "BOOK S1b: author
the Marks chapter pool (primitive marks, glyphs, stamps)". D1 is ruled (Matt, 2026-10-31: "Author Marks
first") and recorded on this issue; D2–D6 were not needed and were not touched.

## STATUS: STOPPED at a scope decision — the pool is built; two calls sit above the builder

Everything the issue scopes as content is authored and verified (below). The build stops on ONE decision
the issue's own text creates, plus one coordinator band call the suite itself reserves. Neither is a defect
in the work; both are exactly the "don't rule it yourself" class. Details under THE STOP.

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

## Verification

Full manifest sweep, continue-on-failure over all **549** manifest commands (the stock runner stops at the
first failure): **546 pass / 3 fail** — and the 3 are exactly the calls documented above, plus one flake:

1. `voiceDeck.selfcheck` §4 — **decision 1** (THE STOP).
2. `coverage.selfcheck` seed 0x1505 — **decision 2** (coordinator band call; passes on the S1 base,
   measured exceedance +0.022 pp with reach and never-tray improved on all 8 seeds).
3. `cellKinemePlayback.selfcheck` — **flake**: failed in the sweep with "output.wasm is stale (pre-#1917)"
   (a wasm artifact stamp; this build touches no rust/kernel/bake input — the diff is data-only) and
   PASSES on isolated re-run on this tree (node contract OK, GPU OK) and on the S1 base. Noted, not
   chased — same family as the kineticSweep flake (#1822), which passed in this sweep.

Environmental, as on S1: the stock `npm run selfcheck` halts at `swarmWasm` (build-wasm.sh --verify cannot
reproduce the kernel wasm without cargo, absent in the sandbox; S1 proved it base-identical on pristine
origin/main — and the same suite passed inside the continue-loop run above). Sandbox `npm run build` is
broken identically on pristine main (@tauri-apps/api) — CI is authoritative. accum passed inside the sweep;
a solo confirmation re-run hung in the sandbox browser layer (0% CPU for ~9 min, killed, orphan browsers
cleaned) — the sweep verdict stands and CI owns the browser sections.

Targeted suites green on this tree: chapters, assetStyle, styleLooks (all 69 looks render headless),
palettes, census, censusReadout, rollPool, regionAssignment, engraving (the issue's
"engraving-finish-compatible" premise — the marks ride the same category/style axes the finish reads),
poolCitizenship. Prettier: all touched code + selfcheck files clean (the sandbox's `npm run format:check`
can't find its prettier binary — same broken shared install as S1; `npx prettier` verifies the touched
files directly; CI is authoritative).

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
