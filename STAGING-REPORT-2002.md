# STAGING REPORT — #2002: FIELD stamps slice 3 (Latin lowercase/punct + Whittier serif + ornaments)

Branch `feat/stamps-slice3-latin`, base `1eed1a1b` (origin/main). Builder staging
record — the coordinator publishes; no push, no PR from this worktree.

## What shipped

Three new poem-only stamp packs (+99 stamps; catalogue 602 → **701**), the
gate/door/deal law that governs them, one deck's sentence face, and the
containment growth on every surface slices 1–2 were excluded on:

- **Anton lowercase + punctuation** (43): a–z and the issue's declared
  punctuation set, baked on the caps pack's own 'H' reference.
- **The serif face** (52): A–Z + a–z in **PT Serif Bold**, Whittier-only,
  dealt when the Director calls the face (`face: 'serif'` on the decision
  and the form, on the `script` marker's pattern).
- **Ornaments** (4): § ¶ † ‡, break-only — a standalone plate-break stamp
  between a poem's lines, carried by a `break: <ornament id>` marker.
- **Greenleaf's sentence face**: every Greenleaf piece gains `caseLines`
  (the same words in sentence case with terminal periods), dealt on the
  Director's `case: true` call — parallel to Teijo's `nativeLines`.

## The stop gate — Anton's lowercase is GENUINE (build proceeded)

Per the brief, before any build: fetched Anton the way the letterform
pipeline carries it (`/tmp/Anton-Regular.ttf`, google/fonts
`ofl/anton/Anton-Regular.ttf`, md5 `da0af4e9427ac8ddcac1a4eb0fb06f69`) and
probed `charToGlyph` for a–z against A–Z with opentype.js:

- **0** lowercase letters map to .notdef; **0** map to their uppercase
  glyph index; **0** have an outline byte-identical to the cap's.
- True lowercase metrics @FS1000: x-height letters sit at h≈732–748
  (a c e m n o r s u v w x z) against cap height ≈859–875; ascenders
  (b d f h k l t) at cap height; descenders (g p q y) extend below;
  'i' carries its tittle (h=923), 'j' descends (h=1050).
- Every lowercase glyph index is distinct (a=366 … z=1348) with its own
  glyph name and advance width.

Anton is not a caps-only face wearing a lowercase cmap — the lowercase is
drawn. The fork did not trigger; no face was substituted.

## Font choices

- **Lowercase + punctuation — Anton** (the standing display face, per the
  issue). Pinned fetch: google/fonts raw `ofl/anton/Anton-Regular.ttf`
  (md5 above). All **17** declared punctuation glyphs probe-verified
  present with real ink (. , ; : ! ? ' ' " " - – — & … ( )) — **no trims**.
- **Serif — PT Serif Bold** (ParaType, OFL 1.1). Chosen for the issue's
  criterion: a contrasting serif with normal proportions against Anton's
  condensed sans — a book face for the book poet (Whittier's verse is
  19th-century nature poetry; a text serif is her shelf). Bold because
  stamps are tiles: the weight stands on stage beside Anton and
  rasterizes robustly at stamp sizes. Static TTF (no variable-font
  instance ambiguity at bake time). Pinned fetch: Google Fonts v19 TTF
  `https://fonts.gstatic.com/s/ptserif/v19/EJRSQgYoZZY2vCFuvAnt65qV.ttf`,
  md5 `e056c2b088f12c8110cd05611e9f1b63`. All 52 letters probe-verified.
- **Ornaments — baked from PT Serif Bold** (the book face's own printer's
  furniture). Covered: § (section mark — named in the issue), ¶ (pilcrow),
  † (dagger), ‡ (double dagger) = 4 stamps, inside the 3–6 band.
  Per-glyph causes for what is NOT in:
  - **Fleuron (❦/❧/☙) and asterism (⁂): absent from BOTH bake fonts**
    (PT Serif and Anton) — dropped, not fetched from a third face.
  - **Long dash (—): not duplicated.** It already ships as the
    face-shared punctuation stamp `typ_p_emdash`; a second stamp id for
    the same glyph would make the char-keyed resolver ambiguous.
  - Bullet (•) is covered by the font but is list furniture, not a
    plate-break mark — left out on curation.
- **Regen proof (twice, two fetches):** both fonts re-fetched
  independently — identical md5s — and all three generators re-run from
  the second fetches: all three packs **byte-identical** to the first bake.

## File by file

**Generators (new)** — `scripts/gen-latin.mjs`, `scripts/gen-serif.mjs`,
`scripts/gen-ornaments.mjs`: the gen-kana/gen-kanji pattern exactly (pinned
font path argument, 'H'-reference scale, glyph-presence throw, one property
per line so a regen is prettier-clean). Font files never committed.

**Packs (new)** — `app/src/data/assets/assets-latin.js` (ASSETS_LATIN, 43),
`assets-serif.js` (ASSETS_SERIF, 52), `assets-ornaments.js`
(ASSETS_ORNAMENTS, 4). Ids: `typ_l_<letter>`, `typ_p_<slug>`,
`typ_s_<char>` (case preserved), `typ_o_<slug>`. Every entry carries its
`glyph`, tags, and path data only (never `<text>`).

**`app/src/poets/placement.js`** — the sets and resolvers
(LOWER/PUNCT/LATIN/SERIF/ORNAMENT_STAMP_IDS + per-class resolvers);
`stampIdForGlyph` grows (lowercase, punctuation, ornaments resolve in the
base face; **serif ids never resolve there**); `POEM_ONLY_STAMP_IDS` = the
one poem-only union (native 289 + 99 = 388) — `NATIVE_STAMP_IDS` itself did
NOT grow (the native face is unchanged law). Widths: latin + ornament ink
measured into GLYPH_W by glyph; serif widths in their own table
(`serifGlyphWidthEm`); `stampWidthEm(assetId, ch)` picks the ruler by id.
`placePiece` gains `face: 'serif'` — a serif placement resolves letters to
the serif pack (digits, punctuation and ornaments stay the shared stamps)
and measures with the serif ruler. Base-face placement is byte-identical:
the placement census still reads **560,366** and every shipped deal
replays bit-for-bit (fieldBattery's determinism check).

**`app/src/poets/fieldForm.js`** — gate, deal and door extended (below).
Stamp classification factored into per-class predicates (id in set AND
glyph matched to id — the standing pairing law).

**`app/src/poets/greenleaf.js`** — `caseLines` added to all 4 pieces
(additive data; `lines` untouched, so every census that deals the shipped
decks is unmoved). Voice fit: Greenleaf's pieces are complete sentences —
sentence case is literally his orthography; Gibson's deck is "sparse, hard
edges" by design and stays caps. The pick also closes a reachability gap:
the serif deal reads the same deck data, so a serif+case deal deals the
serif LOWERCASE stamps from a real deck (no dead half-face).

**`app/src/data/assets/index.js`** — the three packs join the catalogue
after the kanji pack, on the citizen's road (never authored content).

**Containment (the set extended where it already lives, never a new
list):**
- `app/src/panels/assetPoolLogic.mjs` — POEM_ONLY_IDS += the 3 packs.
- `app/src/gl/liveResolve.mjs` — POEM_ONLY_IDS += the 3 packs.
- `app/src/data/chapters.js` — CHAPTER_UNDEALT += the 3 packs.
- `app/src/state/rollPool.mjs` — NEVER_DEALT += the 3 packs.
- `app/src/curator/dice.js` — the cast chokepoint's filtered set += the 3
  packs (dice tray + miner; the stills pool is fed through the same
  surfaces).
- `app/src/data/voiceDeck.js` — the wardrobe draw now reads
  `POEM_ONLY_STAMP_IDS` from placement.js (the #2000 mechanism, grown set).
- `studio/render.mjs` — the still renderer's KANA_IDS += the 3 packs
  (found by the sweep — see Verification; this is the brief's "studio
  render" surface, at repo root, not under app/).
- `app/src/data/assetStyle.js` — TAG_SYNONYMS gains raw homes only:
  'lowercase' + 'serif' under `letter`; 'punct' + 'ornament' under
  `glyph`. The canonical vocabulary stays 32 terms.

**New suite** — `app/src/poets/fieldLatin.selfcheck.mjs`, registered in
`app/selfcheck.manifest` after fieldKanji: packs = declared sets both
directions, real-ink raster census for all 99 stamps under the pinned
raster config (loadSystemFonts: false — and the suite also passes with
`FONTCONFIG_FILE=/dev/null`), resolver law, the deck, every deal path,
the gate's face law + break-only law, the door's face/break law,
containment (panel 313, chapters, roll, dice census, wardrobes),
catalogue arithmetic 602 + (26 + 17 + 52 + 4) = 701.

## The law as built

**Faces.** A form carries ONE letter face. Base (absent marker): Anton —
caps, digits, lowercase and punctuation freely mixed (the charset grew;
lowercase/punct stamps are honest in any base form, glyph-matched). Serif
(`face: 'serif'` on decision + form): serif letter stamps honest ONLY
inside a declared serif form; base letter stamps (caps AND lowercase)
refused inside one; digits + punctuation are face-shared (the base stamps
serve, unduplicated). A serif form is **Whittier-only** — the deal honours
`face: 'serif'` only for greenleaf; the door refuses a serif form under
any other poet. Face + script never compose (the door refuses both
markers together; the poet law keeps them apart anyway).

**Calls degrade the way the script call taught.** A call the deck/poet
cannot honour deals the plain form, markerless: serif under Teijo → base
deal; `case` on a deck with no caseLines → caps deal; `plateBreak` on a
'single'-layout piece (whose recipe joins its lines into one baseline),
on a native deal, or naming a non-ornament id → no break. The deal never
produces a form the door would refuse.

**Breaks.** `decision.plateBreak` names an ornament **by id**; the deal
inserts its glyph as its own line between the piece's first line and the
rest, and the form carries `break: <id>`. Gate law: an ornament stamp
passes in a Latin-face context (base or serif — never the native context)
only **alone on its baseline row** (rows are exact in placement: a shared
y is a shared line); sharing a row with a letter — or another ornament —
is a charset refusal. Door law: the marker must name a real ornament,
must agree with the stamps (undeclared ornament stamps, a marker naming
another ornament, or a marker standing without stamps all refuse), and is
refused on a native form. The #1932 threshold now counts LETTERS — a
break stamp is furniture, not a letter of the poem.

**Gate measurements.** Fit/overlap are judged with `stampWidthEm` — a
serif stamp measures with the serif ruler; every other stamp with the
base ruler it has always used, so pre-slice forms judge identically.
**Non-regression:** pre-slice documents sanitize byte-identically (the new
markers appear only when present in the data; all fifteen decisive suites
including poemRow/fieldDeal/fieldStampPath pass unchanged in behaviour).

## Translations (where the tree differed from the brief's leads)

- **Director wiring is decision-level, as the issue frames it** ("a
  `face` marker carried through the deal decision and the document
  door"; breaks are "a minimal form-level call"). `choosePoet` /
  `fieldEval` are untouched: the issue names no room-context signal for
  face/case/break (unlike slice 1's japaneseContext), and inventing one
  would move seeded eval streams the containment law holds bit-identical.
  The deals are the real deal path (`fieldDealReport`, the function the
  store's poem deal consumes) and the suite proves every set through it.
- **The sentence-face call is `decision.case === true`** (the deck data is
  `caseLines`, parallel to `nativeLines`).
- **`plateBreak` names the ornament by id**, not by glyph char — ids are
  unambiguous at the door (the marker stores the id too).
- **Regen / FONTCONFIG proofs are build-process proofs, recorded above**:
  suites cannot fetch fonts (CI has no font files and no network
  guarantee); the in-suite census runs under the pinned-raster config
  (loadSystemFonts: false), and fieldLatin was additionally run green
  with `FONTCONFIG_FILE=/dev/null`.

## Re-pins (each with its cause; nothing else moved)

1. `fieldKana.selfcheck` — `stampIdForGlyph('!')` was pinned null; '!'
   now has a stamp (`typ_p_bang`). The unmapped-glyph case moved to '€'
   (no pack carries it); `lineMapsToStamps('HELLO!')` likewise re-pinned
   (maps now; 'HELLO€' refuses). Catalogue sum extended by the packs.
2. `fieldKanji.selfcheck` — catalogue sum extended by the packs.
3. `chapters.selfcheck` — library 602 → **701**, message updated.
4. `regionBake.selfcheck` — the catalogue equality extended by the packs
   (the per-asset no-mattes assertion now covers all poem-only packs).
5. `assetPool.selfcheck` — the excluded-set construction extended by the
   packs (same RE-PIN idiom as its #1998 note; meaning unchanged).
6. `fieldBattery.selfcheck` — the charset-stillborn fixture line
   'snow! falls' is now a lawful poem line (lowercase + '!' have stamps),
   so the gate rightly passes it; the fixture now uses 'snow€ falls'.

**No golden was re-pinned.** goldenPlacement's all-era hash
`e892d112b20d92b6…` is unchanged; the all-era first-render hash
`a52e3bd7…` is unchanged (see the studio-render fix below — it passes
WITHOUT a re-pin, the strongest containment evidence in this build).

## Two real defects found by verification (both fixed in this branch)

1. **Serif resolver dropped ornaments.** The first serif placement chain
   (serif → punct → base) had no ornament fallthrough, so a plate-break
   line inside a serif deal placed `assetId: null` and the gate refused
   the deal. Found by a pre-suite deal probe; fixed in placement.js —
   ornaments are face-shared furniture and resolve in both Latin faces.
2. **The studio renderer leaked the packs (containment breach).**
   `studio/render.mjs` carried its own poem-only exclusion (slices 1–2's
   packs only). The full sweep failed `allEraGolden` on this branch
   while it passed on clean base — the all-era first render had gained
   the new stamps as placeable marks. Fixed by extending that set with
   the three packs; the suite now passes with the standing hash
   (`701 assets, 21183 svg bytes` — the render is byte-identical to
   base's). Every suite importing studio/render.mjs (22 incl.
   allEraGolden) was re-run after the fix: all green.

## Verification

- **Decisive suites by file — all PASS:** fieldLatin (new), fieldKana,
  fieldKanji, fieldStampPath, poemRow (16), fieldDeal (5), placement
  (**560,366** assertions — the census is bit-identical), goldenPlacement
  (hash `e892d112b20d92b6…` unchanged), voiceDeck, assetStyle (701 assets,
  32 tags), chapters, assetPool, regionBake, allEraGolden, fieldBattery
  (determinism: shipped-deck deals replay byte-identical).
- **Full manifest sweep: 605/609 pass.** The 4 failures:
  swarmWasm, rollSafety, accum — each **proven base-identical** on a
  clean 1eed1a1b worktree (own `npm ci`): swarmWasm exit 1 both trees;
  rollSafety dies with `page.evaluate: Target crashed` in headless
  Chromium after the same 5 [ok] blocks on both trees; accum aborts
  (exit 134, same native stack) on both trees. The 4th, allEraGolden,
  was the real breach above — fixed, and the render-touching suites
  re-verified (see defect 2). Sandbox Chromium/Wasm environment only;
  CI's selfcheck-browser job is authoritative for those three.
- **format:check green; lint 0 errors** (11 warnings, all pre-existing,
  none in touched files). `git diff` on assetStyle.js shows prettier's
  wrap confined to the two edited TAG_SYNONYMS entries.
- **e2e grep:** all of `app/e2e/` grepped for catalogue counts (602/701/
  313 — no pins), poem surfaces (no spec references them), and the words
  this slice gives new meaning ('serif', 'lowercase', 'ornament', the
  ornament glyphs — no collisions; '§' appears only as comment shorthand
  in two specs, 'ornament' elsewhere names creature genes / sigil
  drawing in disjoint namespaces). **No e2e re-pins.**

## Live-QA script

1. Open the app, open the ASSETS panel: records still **313** — no
   lowercase, serif, or ornament tiles anywhere.
2. Serif Whittier deal (a Director decision with `face: 'serif'` on a
   greenleaf piece — the deal path is `fieldDealReport`; the suite's
   serif deals are the pinned evidence): the poem stands in PT Serif —
   normal-proportioned bracketed serifs against the Anton caps the stage
   usually speaks in; with `case: true` as well, she reads in sentence
   case with her periods, all in the serif face.
3. Mixed-case deal (`case: true`, greenleaf): "The snow lies quiet / on
   the hill." — capital T, lowercase body, terminal period, all Anton,
   lowercase at true x-height beside the caps.
4. Plate break (`plateBreak: 'typ_o_sect'` on g2): a lone § stands on
   its own row between the two lines; move it onto a line's row in a
   hand-edited document and the door refuses the form whole.
5. Roll dice / KINETIC / chapter decks / stills export: no lowercase,
   serif, or ornament glyph ever surfaces as an ordinary mark (the
   all-era still renders byte-identically to before the slice).

## Not done / not touched

- No push, no PR (the coordinator publishes).
- `choosePoet` / `fieldEval` untouched (decision-level calls — see
  Translations). No shipped deck `lines` edited anywhere.
- Slices 1–2 packs, the native face law, and the whisper register are
  untouched in behaviour; whisper composes with face and break (pinned
  in the new suite).

---

## Addendum — fix loop: the producer (QA should-fix, Matt's ruling 2026-11-06)

QA's should-fix stood: the serif face, the case deal, and the plate break
had working machinery but no live producer — no production code ever set
`face`/`case`/`plateBreak` on a deal decision, so on a live stage Whittier
could never appear in serif, no poem dealt in lowercase, and no break was
ever inserted. **Matt's ruling: the Director calls it from the room, like
the kana script.** This supersedes the "Director wiring is decision-level"
translation above: the affirming caller is now wired, on the `script:
'kana'` pattern exactly — contexts derived from the room in
`fieldEval.step`, affirmed in `choosePoet`, carried on the decision
through the Director's `dealPoet` projection (beside the script line) to
`fieldDealReport` and the door. Like script, the calls ride the poem-deal
path (KINETIC presses / the poem row); the CURATOR tick's poet summary
projects poet/piece/layout only, as it already did for script.

### The signals (each derived where japaneseContext is derived; no new draws)

The affirmation is context-derived, never RNG-drawn: the markers are
conditional spreads on the decision, so in a room that affirms nothing
the decision is key-for-key what it was before this loop, and every
seeded census and shipped-deck replay is unmoved (proof below).

- **`face: 'serif'` — the solo room.** Context: `soloContext` = the
  room's verdict is **DAVIS ALONE** (step resolves the verdict as the
  input's, else the room the session stands in — the read `dealPoet`
  already makes of the last tick). Gate: the pick is Greenleaf, mirroring
  script's Teijo gate. Why it fits: DAVIS ALONE is the room with one
  artist in it and nobody directing — the reading room. Whittier is the
  book poet; alone in the room, her poem stands in its book face, the
  print/heritage register.
- **`case: true` — the Bauhaus room.** Context: `bauhausContext` =
  `lookFamily === 'bauhaus'`, the same family read that derives
  `japaneseContext`. No poet gate: the deck is the authority (only
  Greenleaf carries `caseLines`; the call degrades to caps elsewhere,
  exactly as a script call on a deck with no native face deals Latin).
  Why it fits: the Bauhaus print culture wrote lowercase as a house
  style (the school's kleinschreibung) — the sentence face is that
  room's native register.
- **`plateBreak: 'typ_o_sect'` — the solo room, long-form.** Context:
  `soloContext` AND the picked piece carries 3+ lines. The ornament is
  named, not drawn: the section mark is the plate-break furniture the
  epic names, called by id. Why it fits: the solo room has space around
  the poem; a long-form piece gets the printer's pause between its
  lines. `fieldForm`'s standing degradation still applies (a 'single'
  layout or a native deal deals no break).

### Battery safety (provable, not hoped)

`roomBattery`'s cells all stand in 'swiss' rooms with verdicts AGREEMENT /
THE ROOM / FULL BURN / THE CLASH, and the eval scenarios likewise: neither
new context can fire there (no 'bauhaus' family, no DAVIS ALONE verdict),
so the battery's deals are byte-identical by construction — and the suite
confirms it, green with **no re-pin**. The same holds for fieldSilence,
fieldEval, fieldLiveDeal, fieldDirector and fieldKana fixtures (swiss /
japanese / grunge rooms, no solo verdicts): all green, none re-pinned.
**This loop contains zero re-pins.**

### Live-path pins (fieldLatin, new closing section)

The slice's decision-level pins stand; the fix adds the producer's, all
through the entries the store uses:

- `choosePoet` under each context (scripted draws — pool, then piece):
  serif affirmed for Greenleaf in the solo context only; case affirmed in
  the Bauhaus context; the break affirmed on Teijo's 3-line t1 in the
  solo context; a context-free pick carries none of the three keys.
- `step` deriving the contexts from the room (verdict named, verdict
  stood-in, family named), and the deck-authority degradation at the step
  level (a Bauhaus Teijo deal carries `case` and deals her caps lines).
- A **real Director's `dealPoet`** — layoutSlice's `landPoem` entry —
  with the room set the production way (ticks naming the look's family;
  for the solo room, the honest feed as it stands when the room IS
  DAVIS ALONE: LOIS away with the generator rolling unattended). Pinned:
  a serif form dealt by the live path in the solo room (form carries
  `face`, serif stamps, door round-trip); a plate-break form dealt there
  (marker, one ornament alone on its row, door round-trip); a case form
  dealt in a Bauhaus room (lowercase stamps, no face); and in an ordinary
  swiss room the same entry deals the plain deal, key for key as before.

### Verification (fix loop)

- Decisive suites by file — all PASS: fieldLatin (with the new section),
  fieldKana, fieldKanji, fieldStampPath, poemRow, fieldDeal, fieldBattery
  (no re-pin), fieldDirector, fieldEval, fieldSilence, fieldLiveDeal,
  director, directorDebt, chapters, assetPool, voiceDeck, assetStyle,
  regionBake, allEraGolden ("701 assets, 21183 svg bytes" — the render
  still byte-identical), placement (**560,366** — bit-identical),
  goldenPlacement (hash `e892d112b20d92b6…` unchanged; **no golden
  re-pinned**). Panel still **313**; catalogue still **701**.
- Full manifest sweep: **606/609** — the only failures are the three
  sandbox-environment suites (swarmWasm, rollSafety, accum) already
  proven base-identical on clean 1eed1a1b in the record above; no new
  failure. (The build's 605/609 counted allEraGolden, the real breach
  since fixed; it passes now.)
- format:check green; lint 0 errors (11 warnings, all pre-existing).
- Diff: 4 files, +166/−0 — `fieldDirector.js` (contexts + affirmations),
  `fieldEval.js` (context derivation), `director.js` (dealPoet
  projection), `fieldLatin.selfcheck.mjs` (the producer pins).

### QA nit 1 — precision

The "format:check green" claims in this report refer to the project's
own scope — `prettier --check .` run in `app/` — which is clean. Files
outside `app/` (the generators at repo root, `studio/render.mjs`) sit
outside that scope and are not prettier-clean, on base exactly as on
this branch; that is the established pattern, not a regression.

### Live-QA script (updated)

1. ASSETS panel: still **313** records; no new tiles.
2. Stand the instrument in a **DAVIS ALONE** room (LOIS away — leave the
   generator running unattended five minutes — with a swiss look
   standing) and re-deal the poem from the poem row: when the deal lands
   on Whittier, she stands in **PT Serif** on stage, live — and a
   long-form Teijo piece dealt in that room carries a lone **§** on its
   own row between its lines.
3. In a **Bauhaus** room, re-deal: a Greenleaf deal reads in sentence
   case with its periods, in Anton.
4. In an ordinary swiss room, deals are the plain deals they always were.
