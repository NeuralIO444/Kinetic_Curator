# STAGING REPORT — #2150: Type is never a solo asset

**Branch:** `type-exclusivity/2150` (local only, not pushed)
**Base:** origin/main `75c54e42` (PR #2155)
**Lane:** Matt's review lane (changes what the stage can look like). Coordinator publishes; Matt merges.

## What was built

Glyphs leave the DEAL, not the catalogue — enforcement at the deal surfaces only, exactly per the survey spec (`kc-2150-survey/SPEC.md`) amended by Matt's six classification rulings (2026-11-12).

**The glyph set (47 ids):**
- the `typ_*` caps/digits pack (36) — now poem-only: `LETTER_STAMP_IDS` joined `POEM_ONLY_STAMP_IDS` in `poets/placement.js`;
- the solo text stamps (3): `stamp_letter_02`, `stamp_num_04`, `stamp_num_05` — bare font characters with no drawn body (named once as `SOLO_TEXT_STAMP_IDS` in `assets-stamp-radial.js`, alongside the four kind sub-lists for all 17 `<text>` stamps);
- the pixel letter-anatomy emblems (8): `pxg_stem/bowl/arch/fork/serif/counter/ligature/flag` (Q4; exported as `PIXEL_LETTER_ANATOMY_IDS` from the pack's own `LETTERS` set).

**Kept dealable, per the rulings:** bare symbols `stamp_glyph_01–06` + `stamp_arrow_01` (Q1 — boot default untouched), badged letters/numbers `stamp_letter_01/03`, `stamp_num_01/02/03` (Q2), word labels `stamp_label_01/02` (Q3), all other `pxg_*`.

**Enforcement points** (each is the surface's existing exclusion list, grown by the same motion as slices #1982–#2008):
- `state/rollPool.mjs` `NEVER_DEALT` — covers the KINETIC roll/sweep, chapter walk, Canon baseline deals, and KINETIC-birth pool assemblies (all consume `dealableRecords`);
- `data/chapters.js` `CHAPTER_UNDEALT` — chapter decks (the Swiss chapter CARD keeps its letters, Q6 — card data untouched);
- `curator/dice.js` `KANA_IDS` — the dice/miner cast chokepoint;
- `panels/assetPoolLogic.mjs` local set — the pool panel offers no glyph tiles;
- `data/voiceDeck.js` wardrobe draw + `curator/fieldReview.mjs` review pool — letters arrive via the grown union; the two non-FIELD glyph subsets added beside it;
- `data/voices.js` — glyph ids removed in place from the four stub costumes that held them (stratified, rails, layers, abacus). Abacus keeps `stamp_glyph_01` (Q1) and `stamp_num_01` (Q2). No downstream filtering (`isShapeSetActive` is an exact-set identity);
- `panels/WetLab.jsx` `legalBodies` — glyph ids excluded via a `GLYPH_BODY_IDS` set built from the three sources. The assembler stays a faithful executor: banked creatures keep recorded bodies (history).
- DISH LIFE inherits glyph-free deals; no edit (spec row 9).

**Q5 — the fluid keeps its letters.** Nothing in `gl/liveResolve.mjs` was touched. The resolver's own placeable filter is a local set that does NOT include the new glyphs (verified: it never imported the placement union), so a no-marks stage's fluid fallback pool is still the layer's whole resolver pool — letters included. The `dishFluidRender` pin (fluid wearing `typ_3` / `stamp_num_02`) and `liveResolve.dishFluid` pass **unchanged**. The fluid's *dealt* marks are glyph-free only because deals are — no glyph filter was added anywhere in the fluid path.

**Replay safety (acceptance 3).** The resolver, the catalogue, and `ASSETS` order are byte-identical to base (no edits in `gl/`, `engine/`, or `data/assets/index.js`). `gl/replayGate` and `gl/performanceCreatures` pass **unchanged** — recorded takes replay bit-for-bit.

**New pin:** `src/curator/typeExclusivity.selfcheck.mjs` (registered in `app/selfcheck.manifest`) — the property over every surface: set integrity (the four text sub-lists partition exactly the 17 `<text>` stamps; solo = svg starts with `<text`, badged = body drawn first; anatomy set = the pack's letter-tagged records), FIELD supply intact (`stampIdForChar`, union membership), containment on panel/chapters/dealable/SHAPE_SETS/VOICE_DECK/WetLab-shape, the kept set still dealable, the Swiss card's Q6 shape, and multi-seed deal loops (25 seeds × 200 casts + 200 mixed pools + 200 look pools, zero glyphs).

## Measured deltas (all verified against pristine main, not assumed)

| Measure | Before | After | Delta explained by |
|---|---|---|---|
| Poem-only union | 648 | 684 | +36 letters exactly |
| Pool panel records | 313 | 266 | −47 glyph set exactly |
| Swiss chapter deck | 61 | 25 | −36 (whole typ_ pack) |
| Grunge chapter deck | 39 | 36 | −3 (exactly the solo text stamps) |
| Now deck / dealable library | 312 | 265 | −47 (whole glyph set) |
| VOICE_DECK voices differing | — | 17 of 72 | 4 tiles lost only glyphs; 13 family wardrobes re-drew over the narrowed pool; **no voice wears a glyph** (full per-voice diff taken) |
| rollKits golden sequence | hash `555329…` | hash `e6d146…` | 11 of 28 pools differ: 10 held glyphs, 1 is the shared-stream remap after one; sizes 4–6 unchanged; 0 glyphs dealt |
| Coverage breadth (distinct, seed 0x1504) | 311 | 263 | ≈ the removed set (by-seed band 262–266) |
| Coverage never-tray (dealable) | 36 | 44 | 17 marginal assets flipped out of the tray, 9 flipped in — stream churn, not starvation (pre-stratification audit: 86) |

## Re-pins (every pin changed, each with an in-file cause comment)

- `poets/fieldLatin`, `poets/fieldPlate`, `poets/fieldKanji`, `poets/fieldKana` — union size +36; panel records 313 → 266. **fieldKana also inverts one assertion**: "typ_A keeps its existing panel treatment" → typ_A no longer reaches the panel — the behavior that pin protected is the behavior the ruling removes; flagged here as the one meaning-flip.
- `panels/assetPool` — the suite's own exclusion mirror grows by the glyph set (its standing re-pin ritual).
- `data/chapters` — swiss 61 → 25, grunge 39 → 36, now 312 → 265, dealable library 312 → 265; card-membership check gains the Q6 carve-out for the Swiss card only (its marks now asserted NOT in the deck, per the ruling).
- `state/rollPool` — the `letterforms` family leaves the roll-reachability census (the whole family was the typ_ pack; same terms as `riso` in #2008).
- `state/stubMix` — shape-set sizes: stratified 8 → 5, rails 8 → 7, layers 8 → 6, abacus 8 → 5 (glyph losses table; no backfill — see Deviations).
- `state/rollKits` — golden hash re-based (verification above).
- `data/canon/*` (canon, voiceStyle, canonMotion, canonSettings) — VOICE_DECK hash `ca7db0…` → `556e0e…` (identical new hash in all three deck suites), chapter-deck hash `cdb7d5…` → `44abd0…`.
- `curator/coverage` — breadth floor 285 → 260 (re-audited by seed); never-tray ceiling 40 → 48 (measured 36 → 44); **trio-overlap band ±0.05pp → ±0.34pp — see Deviations, flagged for ratification.**

**Spec-listed suites that needed NO re-pin** (verified green unchanged): census, miner, censusReadout, dice, diceCrowns, diceLanding, chapterWalk, chapterNarrow, chapterNarrowWiring, chapterMemory, poolCitizenship, enabledAssetsRoundTrip, dishFluidRender, liveResolve.dishFluid, wetLab, cultivate, strandBank, fieldReview ×4, placement, the FIELD batteries, rayGunWear, itemDistort, assetDescriptor. The e2e grep sweep (AGENTS.md surface rule) found no spec expecting a leaving glyph on a dealt stage; the only glyph ids in `app/e2e/` are Q1 symbols in a seeded stage (unaffected).

## Deviations & flags for the coordinator / QA

1. **Coverage trio band (the one judgment call).** The T2 guard's trio-overlap band was widened ±0.05pp → ±0.34pp following the file's own re-baseline ritual and its stated rule (≈2× worst observed delta), with the full measurement recorded in-file: never-tray and tray-reach hold the exact direction on all 8 seeds × both fixtures; flat holds the trio direction everywhere; the opinionated head exceeds unordered on 2 seeds (+0.121pp, +0.169pp) — the arithmetic of a smaller candidate universe (unordered overlap itself rose ~1.5% → 2.0–2.5%). Prior band changes in this file were coordinator calls (2026-10-31); this one is **flagged for ratification or reversal** — reverting it leaves exactly the opinionated trio-overlap assertions on seeds 0x1508/0x1509 red, with the measurement attached.
2. **Four tiles wear fewer shapes** (stratified 5, rails 7, layers 6, abacus 5 of 8): the ruling says costumes *lose* glyph marks; no backfill was invented. If Matt wants the wardrobes topped up with non-glyph shapes, that's a small follow-up in `data/voices.js`.
3. WetLab line ~246 (parent-picker predicate) reads the stage's `enabledAssets`, not the catalogue — checked, not a glyph path; untouched per spec row 8 scope.
4. `app/package-lock.json` picked up a one-line npm-install artifact during setup; reverted — not part of this build.

## Verification

- `npm run lint` — 0 errors (11 warnings, pre-existing).
- `npm run format:check` — clean (3 of this build's files formatted with prettier --write during the pass; re-checked clean at the end).
- `npm run build` — green (the devTabs dynamic-import warning is pre-existing).
- Decisive suites — all green: typeExclusivity (new), replayGate, performanceCreatures, dice, diceCrowns, diceLanding, rollPool, rollKits, stubMix, chapters, chapterWalk/Narrow/NarrowWiring, chapterMemory, voiceDeck, assetPool, poolCitizenship, fieldLatin, fieldPlate, fieldKana, fieldKanji, placement, fieldBattery, rayGunWear, census, miner, censusReadout, coverage, fieldReview, dishFluidRender, liveResolve.dishFluid, wetLab, cultivate, strandBank.
- Dice-family suites run ×3 each — stable (dice, diceCrowns, diceLanding, typeExclusivity).
- Full manifest sweep (continue-on-error, 675 lines): first pass 664 pass / 11 fail. Of the 11: 8 were this build's re-pin surface (coverage, stubMix, fieldKanji, rollKits, canon ×4) — all re-pinned above and re-verified green individually; 3 are the known sandbox trio (swarmWasm, rollSafety, accum) — **proven base-identical**: all three FAIL identically on a pristine origin/main worktree (swarmWasm: wasm --verify reproducibility; accum: sandbox abort; rollSafety: same verdict). CI's browser job is authoritative for those.
- FIELD no-starvation: placement/fieldKana/fieldLatin/fieldPlate/rayGunWear/fieldBattery all green; the new pin asserts `stampIdForChar('A'/'7')` and union membership directly.
