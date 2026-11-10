# Unified style database — research + audit (2026-11-09)

**Commissioned by Matt, 2026-11-09.** Read-only audit. Probed against CURRENT MAIN in a fresh detached worktree (`origin/main` @ `6d37f9b0` — main had advanced past `1e4fdad8` during the morning when PR #2042, the Riso Look, merged; this audit describes the tree including that merge). No code was changed.

**The question:** Matt wants ONE unified database of looks and styles that everything references — Looks, Voices, and the taste system — with style entries anchored to actual art history (op art, Warhol, named artists/movements), tied into the Nash Book (the design-history "Book" of chapters), so combinations stay specific instead of mushy. **Naming (Matt, 2026-11-09): the target unified database is called the Canon.** Scope extensions (same day): the Canon is also meant to cover the BUILD menu's layouts, flocking, and animation as first-class citizens (section 7), and to work with the core API buses so the trio (LOIS/Davis/TE) can see what is happening in it (section 8). This audit establishes what exists today. It feeds the Studio Assistant spec (`studio-assistant-spec-2026-11-09.md`).

---

## Plain-language summary — what exists, in everyday words

KC-1 does **not** have one style database today. It has **several well-kept lists that agree with each other by convention**, plus one genuinely shared backbone:

- **The closest thing to a shared backbone is the asset style table** (`data/assetStyle.js`). It holds the controlled list of design languages (Swiss, Bauhaus, Japanese, Op Art, Memphis, grunge, engraved, and a few more) and works out which style every picture-asset in the library belongs to. Looks and Voices both *name* these styles in their records, so when a Japanese look is dealt, it pulls Japanese-flavoured assets and a Japanese family voice. That pairing system is real and it works.
- **Looks live in two files that are stitched together**: hand-authored presets (`data/presets.js`, 34) plus the movement "style looks" (`data/styleLooks.js`, 36) — 70 looks total, in 16 picker groups. Only 36 of the 70 belong to an art-history movement group; the rest are internal families (Showcase, Bio-Drives, a magazine-inspired pack, and so on).
- **Voices live in two layers too**: the original voice definitions (`data/voices.js` — 4 flagships + 15 mode tiles) carry **no style information at all**; a second file (`data/voiceDeck.js`) wraps them into the 72-voice dealable deck and *adds* the style labels from the side. The style knowledge about a voice exists only in the wrapper.
- **Taste lives somewhere else entirely.** What the system has "learned" about Matt's taste is stored per-machine in the browser (`kc:taste:v1`), as a trained scoring head over recipe numbers (density, mode, palette name…) — it contains **no style, genre, or artist entries at all**. A separate hand-written file (`curator/personaTastes.js`) holds 10 artist taste profiles (Joshua Davis, Vera Molnár, Ernst Haeckel…) — real art history, but kept in code only, deliberately never shown on screen, and sourced from persona files that live *outside* the app entirely.
- **The Nash Book is real and is the most art-history-anchored thing in the app**: 9 chapters that are literally design eras (Marks → Engraving → Bauhaus → Swiss → Op Art → Japan → Memphis → Grunge → Now). But the Book holds no style records of its own — each chapter is a set of *pointers* ("my looks are the ones in the Swiss group, my voices are the ones labelled swiss") and the actual looks/voices are looked up from the other lists at deal time. Flipping the book (a cold KINETIC tap) lands you in a chapter and deals only from that chapter's slice of the other catalogues. Voices and taste do **not** read the Book back — the only feedback is a backstage "grudge" note recording which chapter a cut look came from.
- **The word "genre" exists in the code in exactly two narrow senses**, neither of which is a shared genre record: (1) the FIELD poem gate — only swiss/bauhaus/japanese look families may hold a poem; (2) the Book's narrowing funnel, which derives a "genre" on the fly from a look's own keywords inside a chapter.
- **Layouts, flocking, and animation each have their own small libraries, in their own files, with their own conventions** — and none of them knows what a "style" is. Layouts (the BUILD menu's 27 arrangement modes) live in `data/layout-modes.js`; flocking behaviours (9 named behaviours) live in an engine file; animation is split across *five* separate vocabularies in five places (motion chips, whole-mark kinemes, inside-the-mark cell kinemes, field-motion patterns, audio-response curves). A look *uses* these things by naming them inside its settings — but the libraries themselves carry no style, genre, or art-history labels, so nothing can ask "which animations belong to Op Art?"
- **The app's internal message bus is real and busy** — one typed event bus carrying layout changes, audio detections, the clock's beats, and every persona decision — but the trio doesn't *watch* it. The personas are handed a snapshot of the situation each bar and answer from that; their decisions are then announced onto the bus and recorded into the take. No look, voice, or style record says what it listens to — records are passive; only code subscribes.

**Bottom line:** the *pairing* layer Matt imagines (one style name meaning the same thing to looks, voices, and assets) already exists and is the system's spine. What does not exist is a single *record* per style — a place where "Op Art" is one entry carrying its looks, voices, palettes, layouts, behaviours, animations, and art-history identity together — and taste has no connection to style names at all. **That target state is the Canon.**

---

## 1. Where do Looks live?

**Two source files, one stitched catalogue.**

- `app/src/data/styleLooks.js` — the movement looks. `STYLE_LOOK_GROUPS` (lines 15–26): 8 groups — `japanese, grunge, swiss, bauhaus, op, memphis, engraved, marks`. `STYLE_LOOKS` (line 28): 36 records. Header (lines 1–13) states the design: "seven 2-D design languages as first-class Look groups… Each look names the asset categories AND the S3 styles it pairs with."
- `app/src/data/presets.js` — `PRESET_GROUPS` (line 4) spreads `STYLE_LOOK_GROUPS` into its own 16 groups (adding `firstlight, showcase, classic, rendah, ca, davis, bio, riso`); `COMPOSITION_PRESETS` (line 16) is the authored presets with `...STYLE_LOOKS` spread in at line 989. Probed count on current main: **70 looks, 16 groups, 36 of them in style groups**.
- **Record shape** (probed field census over all 70): `id, name, group, desc, categories[], styles[], paletteShift, paletteId, params{…}, trailEmber, assetIds`. The style-relevant fields are `group` (one movement/internal family), `styles[]` (assetStyle style ids it pairs with), `categories[]` (asset categories), and `paletteId` (a paired palette, by id string). There is **no artist, movement, era, or genre field** beyond `group` + `styles[]`.
- **Consumers** (all read the one stitched `COMPOSITION_PRESETS`, none keep a private look list):
  - KINETIC dealer / scope decks: `app/src/state/kineticScope.mjs` (imports presets + styleLooks + voiceDeck; builds the OFF/WEAK/MED/KOZ decks; excludes the picker-only `riso-field` by id), `app/src/state/slices/layoutSlice.js` (look pass), `app/src/state/chapterWalk.mjs` (chapter ∩ scope decks).
  - The Book: `app/src/data/chapters.js` `chapterLooks()` filters presets by `group`.
  - Picker UI: `app/src/panels/layout/CuratorBar.jsx:15,74` renders `getPresetsByGroup()` (presets.js:1057).
  - Creature assembler/dice: `app/src/engine/creatureAssembler.js`, `creatureBreed.js` (read the catalogue; the assembler's LOOK genes reference look ids).
  - Resolution/render: `app/src/engine/buildPlacements.js`, `app/src/gl/liveResolve.mjs`.
  - Persistence: a dealt look persists as `layoutParams.composition` (the look id) inside layout state — takes/snapshots/ledger recipes carry the id + full params, never a style record (`app/src/curator/tasteLedger.js` `ledgerRow`: recipe = `{ layoutParams, paletteId, … }`).
- Id aliasing is centralised in `app/src/data/taxonomy.js` (`LOOK_ALIASES`, `resolveLookId`) — the one place old look ids map to canonical ones.

## 2. Where do Voices live?

**Two layers again — definitions with no style knowledge, and a deck that adds it from the side.**

- `app/src/data/voices.js` — the voice definitions. `FLAGSHIP_VOICES` (line 63, 4: swarm, hype, murmuration, dark-glass), `STUB_VOICES` (line 329, 15 mode tiles), `MOTION_MODES` (line 459). A voice is a complete state (header, lines 9–16): `params` (full layout params), `palette {bg, ink, swatches[8]}`, `fx {…}`, `assets`. **This file contains no `styles` field anywhere** — a voice definition knows nothing about genre or movement.
- `app/src/data/voiceDeck.js` — the dealable deck, `VOICE_DECK` (line 959): **72 records** = 4 flagships + 15 promoted stubs + 53 family variants (header, lines 1–17). Record shape (lines 955–958): `{ id, kind, def, categories, styles, accumulation, costTier }` — the `styles[]` pairing is attached here, via sidecar tables in this file (`FLAGSHIP_META`, the `PROMOTED` table, `FAMILY_PAIRING` at line 237, and the per-family `VARIANTS` tables), **not** in the voice definitions themselves. The 53 family variants are organised by the same 8 style families as the style looks.
- **Consumers:** the KINETIC voice pass and scope decks (`kineticScope.mjs`, `layoutSlice.js`), the Book (`chapterVoices()` matches deck records whose `styles` meet the chapter's `voiceStyles`), the creature assembler/breeder, WetLab (`app/src/panels/WetLab.jsx`), genome/strand models. The performer's voice *shelf* UI (`app/src/panels/layout/VoicesShelf.jsx`) works from the store's voice slice / earned-voices state rather than the deck directly.
- **Other voice-shaped citizens:**
  - FIELD poets: `app/src/poets/{greenleaf, teijo, rosselli, gibson}.js`, registered in `app/src/poets/fieldForm.js` — four poet records that write the FIELD poems; separate from the deck.
  - The Mind personas: `app/src/curator/mindContract.js:13` — `PERSONAS = ['davis', 'lois', 'queen']` (the consulted minds; rules in `mindRules.js`, live drivers in `trioLive.js` / `mindConduct.js`).
  - The poem gate's family set: `app/src/curator/fieldDirector.js:27` — `TYPE_NATIVE_FAMILIES = {swiss, bauhaus, japanese}`.
- **Genre/style knowledge in voices today:** only the deck's `styles[]` labels (asset-style ids) and the family grouping of the variants. No voice record carries an artist, movement name, era, or any description of *what its style is* — the flagship sidecar even pairs one voice with two styles at once (e.g. swarm → `['memphis', 'japanese']`).

## 3. Where does taste live?

**Three separate places, none of them style-aware.**

- **The trained taste head** — `app/src/curator/tasteHead.js`: a small linear model (`score = bias + Σ weights[term] + Σ num[k]·x[k]`, header lines 4–6) over *recipe features*. Terms are flattened from a dealt recipe's features (`featureTerms`, line 52; the shared rule is fixtured in `curator/tasteTerms.fixture.json`: terms look like `system=fibonacci`, `palette=chiaroscuro`, `accum=true`). The model is trained off-app (`studio/curator.py` + MLX runbook) and loaded per machine: `app/src/curator/tasteStore.js` holds it in localStorage under `kc:taste:v1`, explicitly "never in project files". **Its vocabulary is modes, palettes, and numbers — there is no style, genre, look-group, or artist term in it.**
- **The interim persona scorer** — `app/src/curator/taste.js` scores candidates by 19 numeric visual features (density, size, rotation spread…) against `app/src/curator/personaTastes.js`: **10 artist profiles** (`davis` = Joshua Davis, `molnar` = Vera Molnár, `mohr`, `benjamin` = Karl Benjamin, `reas`, `haeckel`, `oxman`, `stock`, `anadol`, `menkman`), each a sparse weight vector over the 19 features plus a rationale. Header of personaTastes.js states: source of truth is the persona `.md` files in `~/workspace/your_files/personas/` (**outside the repo**), hand-distilled; and a display policy — *real artist names are kept in code only; the UI shows aliases* (e.g. Davis → "OVERLAP").
- **The keeps/passes ledgers** — `app/src/curator/tasteLedger.js`: append-only JSONL of deliberate keeps (F / star / J / crowned dice) and passes (X), each row a full recipe (`layoutParams`, `paletteId`, assets, seed, keep-context). Labels for training; "nothing in the app reads these back to steer rendering".
- **Creature genome** — `app/src/engine/creatureAssembler.js:33`: `GENE_FAMILIES = ['FORM', 'LOOK', 'VOICE', 'MATERIAL', 'DRIVE']`; LOOK/VOICE genes carry catalogue ids, so creatures inherit look/voice *identity* — but a gene is an id reference, not style knowledge.

## 4. One database, or several parallel ones?

**Several parallel stores, joined by a shared vocabulary of style-id strings — not by a shared record.**

The stores that hold look/style/voice/taste knowledge today:

| # | Store | What it holds | Who reads it |
|---|-------|---------------|--------------|
| 1 | `data/assetStyle.js` — `STYLES` (11 ids, line 238), `STYLE_RULES` (line 257), `FAMILIES` (12, line 195) | The controlled style vocabulary + every asset's derived style/family | Looks' and voices' pairing fields, chapters, the roll |
| 2 | `data/styleLooks.js` — `STYLE_LOOK_GROUPS` + `STYLE_LOOKS` | 36 movement looks | Stitched into presets |
| 3 | `data/presets.js` — `COMPOSITION_PRESETS` + `PRESET_GROUPS` | All 70 looks | Dealer, picker, chapters, assembler, resolver |
| 4 | `data/voices.js` | Voice definitions (no style fields) | voiceDeck, MIX, voice slice |
| 5 | `data/voiceDeck.js` — `VOICE_DECK` + sidecar tables | 72 dealable voices + their style labels | Voice pass, chapters, assembler |
| 6 | `data/palettes.js` (577 lines) | Palettes, each with a free-text `era` flavour string | Everywhere colour is dealt; paired to looks/voices by id |
| 7 | `data/chapters.js` | The Book: 9 chapters as pointer sets | Walk, dealer, narrowing, card UI |
| 8 | `curator/personaTastes.js` | 10 artist taste profiles (code-only names) | Interim taste scorer |
| 9 | `curator/tasteHead.js` + `tasteStore.js` | Trained taste model, per-machine localStorage | Curate chain |
| 10 | `curator/tasteLedger.js` | Keeps/passes recipe records | Training pipeline only |

**Overlaps and duplication, concretely:**

- The **same style vocabulary is declared four times as separate literals**: `STYLES` in assetStyle.js (11 ids: the 8 movements + `techno, pixel, organic`), `STYLE_LOOK_GROUPS` in styleLooks.js (8), the keys of `FAMILY_PAIRING` in voiceDeck.js (8), and each chapter's `lookGroups/voiceStyles/assetStyles` lists in chapters.js. They agree because selfchecks pin them and authors keep them in sync — chapters.js imports `STYLES` from assetStyle.js for its "Now" chapter, but styleLooks.js and voiceDeck.js do **not** import the vocabulary; they restate it.
- **A style's knowledge is scattered across all four declarations**: what "swiss" *is* lives partly in assetStyle's rules (which assets are swiss), partly in the swiss looks' recipes, partly in `FAMILY_PAIRING.swiss` (which categories its voices wear), and partly in the Swiss chapter's pointer lists. No file can answer "show me the Swiss style" whole.
- **Voices bypass their own definitions for style**: voices.js records carry no style field; the deck's sidecars are the only place a voice's style exists. Anything reading voices.js directly (MIX, shape sets) sees no style at all.
- **Palettes are a parallel axis joined by string ids**: a look names its paired palette (`paletteId`), a voice carries its own resolved palette object, a chapter card names a palette id. Palette `era` strings (palettes.js lines 1–2: "Each: { id, name, era, … }") are flavour text — chapters.js's header (lines 17–18) states outright that it never reads them.
- **Taste bypasses the style system completely**: neither taste store contains a style id, a look group, or a chapter id. A keep records the full recipe; the trained head scores recipe features. Nothing anywhere records "Matt keeps Op Art" as a fact about Op Art.
- The one genuinely canonical join: **look/voice/asset pairing fields all name assetStyle `STYLES` ids**, and chapters derive from the same ids — this is the spine a unified database would be built around, and it is a *vocabulary*, not a database of records.

## 5. The Nash Book

- **What it is in code:** `app/src/data/chapters.js` (the registry, #1853 "BOOK S1") + `app/src/state/chapterWalk.mjs` (the flip/landing walk) + `app/src/state/chapterNarrow.mjs` (the CURATOR narrowing funnel, BOOK S4) + `app/src/panels/layout/ChapterCard.jsx` (the landing card). The name "Nash" appears nowhere in `app/src` — the code calls it **the Book**; the name survives in the slice reports (STAGING-REPORT-1855/1856/1857: Book S2 landing, Nash Book S3 the round, S4 CURATOR narrows).
- **What a "page" (chapter) holds:** exactly `{ id, name, lookGroups[], assetStyles[], assetFamilies[], voiceStyles[], card { paletteId, marks[3] } }` plus derived spine position/neighbours (chapters.js SPINE, lines 67–165). It holds **pointers, not content**: decks are derived at call time — `chapterLooks()` (looks whose `group` ∈ lookGroups), `chapterVoices()` (deck voices whose `styles` meet voiceStyles), `chapterAssets()` (assets whose derived style/family matches). A chapter whose derived deck falls below `CHAPTER_DECK_MINIMUM` ({looks 4, voices 8, assets 14}) reports itself in `deckReport()` rather than borrowing.
- **Flipping/selecting vs the live look:** a cold KINETIC tap walks the spine (novelty-weighted by session visits) and lands in a chapter (`layoutSlice.js:60` imports `dealLanding, chapterScopeDeck, effectiveChapterScope` from chapterWalk); the look and voice passes then deal **inside landed chapter ∩ scope deck**, re-dealing at a wider scope with a visible confession when the intersection is empty. The standing chapter shows as a card (name, three glyph marks in the chapter palette) and in the START pill readout (`CuratorBar.jsx:22–23, 81–85, 413`). CHAOS and the launch opener clear the standing chapter. Chapter state is **session-only** — not in project files, not in undo snapshots (per STAGING-REPORT-1855).
- **The narrowing funnel** (`chapterNarrow.mjs`, header): once a round settles in a chapter, CURATOR narrows *chapter → genre → artist-flavoured hand*, one notch per press — where "genre" is **derived on the fly** from the anchor look's declared `categories`/`styles` keywords inside the chapter ("the Heilbrunn shape the issue names: eras are the spine, movements and artists are keywords inside them"). Nothing is stored; the table is recomputed from look records.
- **Who else reads the Book:** `curator/chapterMemory.mjs` and `curator/loisGrudge.mjs` (a backstage record of which chapter/genre a LOIS cut look belonged to), and the keeps ledger stamps notch context on keeps made while narrowing stands. **Voices as a system do not read the Book; taste does not read the Book.** The Book reads the catalogues; nothing reads back except memory/grudge bookkeeping.

## 6. Art-history anchoring today

**More exists than the "mushy" worry suggests — but it is anchoring by *name and grouping*, not by record.**

- **Fully anchored:** the Book's spine is design history outright (Marks → Engraving → Bauhaus → Swiss → Op Art → Japan → Memphis → Grunge → Now, chapters.js lines 4–6, "the spine is D1's ruling"). The 8 style groups are real movements/design languages (36 of 70 looks). The asset `STYLES` list (11) is the same vocabulary plus `techno/pixel/organic`. The 53 deck family variants are organised by those same families. `personaTastes.js` anchors taste to 10 real artists by name — in code only, by deliberate IP policy (UI shows aliases).
- **Partially anchored:** authored preset groups include `rendah` (a real magazine's world and its featured artists — the pack header in presets.js describes "six one-click looks translating the magazine's world and its featured artists"), `davis` (a persona's name as a group), and `riso` (a real print process). Many authored look *names/descriptions* reference real artists and works in prose (`desc` fields), but prose is not data — nothing can compute over it.
- **Not anchored:** the remaining preset groups (`firstlight, showcase, classic, ca, bio`) are internal families; the flagship/stub voices (swarm, hype, murmuration, dark-glass + 15 mode tiles) are internal instrument names; FIELD poets are literary names in their own silo; palette `era` strings ("Dreamless · 2001", "Aqueous folklore") are flavour, unread as data.
- **The one explicit genre datum in the whole app** is `TYPE_NATIVE_FAMILIES = {swiss, bauhaus, japanese}` (fieldDirector.js:27) — three movement ids, hard-coded as a set, used only to gate poems. There is no genre field on any look, voice, palette, or taste record.

---

## 7. Layouts, flocking, animation — the BUILD side (scope extension)

Matt's extension: the Canon is also meant to cover the BUILD menu's **layouts**, plus **flocking** and **animation** — one database of established animations and looks, referencing graphic-design and layout-animation traditions; animation as a first-class citizen.

### 7a. Layouts — where the BUILD menu's arrangements live

- `app/src/data/layout-modes.js` — header line 1: "Layout mode definitions — single source of truth". `LAYOUT_MODES` (line 14): **27 modes** as `{ id, name, glyph }` records — random, grid, fibonacci, phyllotaxis, radial, truchet, swarm, noise, hype, stratified, flow, brush, layers, rails, ca, voronoi, l-system, dla, eden, orbit, abacus, poisson, gaussian, circlepack, colonize, voronoi-cells, streamline, murmuration. Several are named for real layout/mathematical traditions (phyllotaxis, Voronoi, L-system, DLA, Poisson-disc), but the record carries nothing beyond id/name/glyph — no tradition, family, or style field.
- The BUILD panel itself is **not a separate preset store**: it edits the standing `layoutParams` (the picked Look's recipe, live) through `PARAM_SPEC` (layout-modes.js line 396: per-parameter min/max), `PARAM_STOPS` (line 589: detent stops), and `DEFAULT_LAYOUT_PARAMS` (line 102). UI consumers: `app/src/panels/build/LayerStack.jsx`, `app/src/panels/layout/LayoutSliders.jsx`; validation consumers: `data/voices.js`, `state/paramUtils.js`, `curator/recipeFeatures.js` (taste features read the same spec). A "layout" as a named, reusable thing exists only as the *mode* plus the numeric params — the named unit a performer picks is the Look, whose `params.mode` names a layout mode by string.
- Other layout-adjacent vocabularies in the same file, all plain string lists: `SYMMETRY_MODES` (line 59), `CONTACT_MODES` (line 96: none/bounce/swap/stick/die/breed), `PALETTE_SHIFTS`, `BLEND_MODES` — and, significantly, layout-modes.js **imports vocabularies from five other modules** to assemble the full parameter space (behave ids, ballistics curves, trail modes, kineme patterns/transport/path families, fieldmap fields/curves — lines 3–11). It is the parameter system's Grand Central, not a style store.

### 7b. Flocking — where behaviour definitions live

- `app/src/engine/organisms/behave.js` — `BEHAVE_IDS` (line 6): **9 named behaviours** — cruise, flock, orbit, scatter, mold, levy, lorenz, seek, flee — with the `BEHAVE` table (line 8) holding each behaviour's steering implementation/constants (Lévy-flight and Lorenz-attractor parameters are named constants in the same file, lines 173–226). These are *engine* definitions, not data records: a behaviour is code + tuned constants, with no descriptor record (no name/desc/style fields beyond the id).
- Flocking *strength* is not part of the behaviour record — it is numeric layout params (`swarmCohesion` etc. in `DEFAULT_LAYOUT_PARAMS` / `PARAM_SPEC` / `PARAM_STOPS`, layout-modes.js lines 182/440/604), carried inside look and voice recipes. Which modes are live-flocking at all is a layout-modes predicate (`isLiveSwarmMode`, line 51: swarm/hype/murmuration run on the swarm engine).

### 7c. Animation / motion — where named, reusable animation lives

Animation is **five separate vocabularies in five modules**, each with its own record shape:

1. **Motion chips** — `data/voices.js` `MOTION_MODES` (line 459): 7 records `{ id, name, vibe, params { behave, lifeDrift, noiseSpeed, wind, flap, breath } }` (still, drift, river, flock, orbit, scatter, mold). Housed, notably, *inside the voice catalogue file* — the one animation library that lives with another system's data.
2. **Whole-mark kinemes** — `data/kinemes.js` `KINEMES` (6: spin, rock, pulse, blink, bob, bend) as `{ id, kind, period, amp }`; motion attaches to **assets** (`assetKineme` maps asset ids → kineme ids, per the header), never to looks.
3. **Cell kinemes** (inside-the-mark motion) — `data/cellKinemes.js` `CELL_KINEMES` (6: dial-sweep, wave-scroll, chevron-chase, spec-chase, line-boil, wave-roll) as `{ id, cells, period, costCells }`, with its own asset map `ASSET_CELL_KINEME`.
4. **Field-motion patterns** — `app/src/engine/kineme.js`: `KINEME_PATTERNS` (line 39: DRIFT, SWELL, THUMP, ORGANIC, CADENCE), per-instance pattern definitions (breath, drift, pulse, brush-wobble, palette-breath…), `TRANSPORT_MODES` (line 705: still/flow/path) and `PATH_FAMILIES` (line 708: orbit, spiral, sweep, lissajous).
5. **Audio-response (ballistics) curves** — `app/src/gl/audioBallistics.mjs` `BALLISTICS_CURVES`, surfaced as `AUDIO_RESPONSE_IDS` (layout-modes.js line 375); plus `TRAIL_MODES` in `app/src/gl/trailMode.mjs`. Springs (e.g. the heading spring) exist as engine code in the live loop, not as named records anywhere.

Consumers are the render/resolve path (`gl/liveResolve.mjs`, `engine/buildPlacements.js`), the store's asset-kineme map, and recipe validation — the same param system the looks flow through.

### 7d. Do layouts/flocking/animation share a store, ids, or metadata with the Look/style catalogue?

**No shared store, no shared metadata — the only join is by value, inside recipes.**

- None of the layout, behave, kineme, motion, pattern, or ballistics records carries a `styles`, `group`, `categories`, or `paletteId` field, and none imports assetStyle or the look catalogue. A layout mode, a behaviour, and a kineme cannot be asked which style or chapter they belong to.
- The join runs one way, by string value: a Look's `params` name a layout `mode`, a `behave`, and numbers; a voice names a motion chip (voiceDeck builds deck defs via `...motion(motionId)`, voiceDeck.js:899); assets name kinemes. Ids are unique *within* each vocabulary but the namespaces collide casually across them (`flock`, `orbit`, `drift`, `pulse` each exist in two or three vocabularies with different meanings) because nothing coordinates them.
- The single structural exception: `MOTION_MODES` physically lives in `data/voices.js`, and layout-modes.js imports `COMPOSITION_PRESETS` to derive `COMPOSITION_IDS` (line 380) for validation — the param system knows look ids exist; it knows nothing about their styles.
- Consequence for the Canon: of the things Matt wants in one database, animation is today the *least* record-like — behaviours are code, patterns are engine tables, and the five vocabularies have never been one library.

## 8. The core API buses and the trio (scope extension)

Matt's extension: the Canon is also meant to work with the core API buses so the trio (LOIS/Davis/TE) can see what is happening in it.

### 8a. The core buses today

- **One typed event bus**: `app/src/composition/eventBus.js` — `on/off/emit` over a listener map; the `Events` table (line 125) names every channel. 92 modules import it. Event families include `davis:*` (evolve/morph/phrase/favourite), `layout:*` (param/preset/lock/curate), `assets:*` (toggle/solo/tags/kits/region…), `export:*`, `queue:*`, `kinetic:tap`, `audio:*`, `mind:*`, `clock:*`.
- **The envelope** (eventBus.js lines 28–60, #1457/#1458): an emit may carry `{ cause }`, and every listener then also receives meta `{ seq, event, cause, loopMs, bar, beat, phase, bpm }` — the musical stamp is supplied by the clock driver. So bus traffic *can* say who caused a change and where in the bar it landed.
- **Detection drivers publish decisions, not streams**: `app/src/composition/audioLive.js` (#1459) publishes `audio:input / onset {strength, band} / tempo {bpm, confidence} / energy {level} / silenceStart / silenceEnd`; `app/src/composition/clockLive.js` (#1458) publishes `clock:beat {bar, beat, bpm}` / `clock:bar` and installs the stamp provider. Both headers state the law: *"The bus carries decisions, not frames"* — continuous signals (band levels, clock phase) are read directly from buffers/the clock by whoever needs them, never bussed.
- **The Mind's own channels** (eventBus.js lines 284–289): `mind:decision` (once a bar per persona: `{persona, bar, backend, seed, invented, reply}`), `mind:request`, `mind:status`, `mind:req` / `mind:reply` (model round-trips), `mind:route` (what became of Davis's route proposals: applied with delta, or dropped with reason). Publishers: the Mind live drivers (`curator/mindLive.js`, `trioLive.js`); subscribers: the store/routes (applying requests), the dev panel (status), and the take recorder.
- **Bus records exist only inside takes**: `app/src/curator/mindRecord.js` — a take records every persona decision verbatim (`[frame, persona, bar, backend, seed, invented, request, reply, traits?]`) plus a conduct log; on replay the rows are re-published and **no backend is asked again**. There is no general bus log that any other system reads back.

### 8b. What can the trio/personas see when they score/order?

- **Not the bus.** No persona subscribes to the event bus to observe state. Instead, each bar the system *hands* the persona a built context: `app/src/curator/mindContext.js` assembles the snapshot — including the audio "show" block (`showOf`, line 81: energy, bpm, confidence, onsets, silent, routes, owned, marks) and trail/buffer statistics when available — from the store's current state, and `curator/mindRules.js` / the Apple backend answer from that context under `mindContract.js`'s reply shapes.
- The same is true of taste/curate scoring: candidates' params are passed to the scorer directly (`curate.js` → `taste.js` `extractFeatures`), not discovered from bus traffic.
- What the trio *emits* is fully visible and recorded (8a): decisions announced as `mind:decision`, outcomes as `mind:route`, all of it written into the take. The visibility is **one-directional**: the stage and the record can see the trio; the trio sees only the snapshot it is handed.

### 8c. Does any look/style/voice record carry a bus binding?

**No.** A field search across `data/presets.js`, `data/styleLooks.js`, `data/voices.js`, and `data/voiceDeck.js` finds no bus, listen, subscribe, or event field on any record (the only hit is an unrelated spread of motion params in voiceDeck). Records are passive data: code subscribes on their behalf (panels emit `layout:preset` when a look is picked; the dealer emits after dealing), but a look cannot declare "I listen to onsets" or "announce me on the bar" — any such behaviour would have to be hand-wired in a driver, per case, outside the record.

---

## GAP — what separates this from the Canon

Target (the Canon): one unified, art-history-anchored database — styles, looks, layouts, flocking, and animation as first-class records — read by Looks + Voices + taste + the Book, visible to the trio through the core buses, where a style is a specific, weighted, combinable thing.

1. **There is no style record.** A style today is a string (`'swiss'`) repeated across four files; no single entry carries a style's looks, voices, palettes, and identity together. → *A unified database needs one record per style that the other stores reference instead of restating.*
2. **The style vocabulary is restated, not imported.** assetStyle, styleLooks, voiceDeck, and chapters each declare the movement list separately, kept in sync by selfchecks and authorship. → *One canonical declaration, imported everywhere, is the precondition for everything else reading "the same database".*
3. **Voice definitions carry no style.** voices.js has no style field; style exists only in the deck's sidecar wrapper, so any consumer of the definitions themselves is style-blind. → *Style has to live on (or be derivable for) the voice itself, not only its deck wrapper.*
4. **Taste has no style dimension at all.** The trained head, the interim scorer, and the keeps ledgers all speak recipes and numbers; "Matt favours Op Art" is not representable, and keeps cannot be aggregated by style, genre, or chapter. → *Taste needs style/chapter identity stamped onto what it already records.*
5. **The Book is read-only pointers with no read-back.** Chapters derive decks from the catalogues, but voices and taste never consult the Book, and a chapter carries no settings of its own (no palette of its own beyond a card, no motion/feel data). → *For the Book to be the shared reference Matt describes, a chapter/style entry needs to carry settings the systems can actually apply, not only membership pointers.*
6. **"Genre" is two unrelated mechanisms, neither stored.** The poem gate's hard-coded family set and the narrowing funnel's on-the-fly keyword derivation share a word and nothing else; there is no genre layer between movement and look that a combination could weight. → *Weighted combinations (treatment × genre) need a stored genre/style layer both sides can name.*
7. **Art-history anchoring stops at names.** Movements anchor groups and chapters, and artists anchor taste profiles (code-only, aliases on surface) — but no record states what a style *is* in the system's own terms (marks, palette behaviour, density, motion), and prose `desc`/`era` strings are unreadable as data. → *Baselines a machine can weigh and mix have to be expressed as settings, per Matt's own precondition in the Studio Assistant spec.*
8. **Combination today is pairing, not weighting.** The system's only way to combine is coherence filtering (a look pulls assets/voices sharing its style ids); there is no representation of "style A at strength x over treatment B" anywhere in a look, voice, take, or snapshot. → *A weighted mix needs somewhere to live in the dealt record itself.*
9. **Layouts, flocking, and animation are outside the style system entirely.** Layout modes, behave behaviours, and the five animation vocabularies carry no style/group metadata, share no store with the look catalogue, and collide on ids across vocabularies (`flock`, `orbit`, `drift`, `pulse` mean different things in different files); behaviours are engine code, not records. → *For the Canon to cover them as first-class citizens, each needs to be a record the style layer can name — today they can only be named by recipes, one value at a time.*
10. **The trio cannot see into a database that isn't there — and today it can't even see the bus.** Personas receive a hand-built context snapshot each bar; they do not subscribe to bus state, and no look/style/voice record declares any bus relationship, so there is no channel by which a Canon entry could announce itself or be observed in place. → *Canon records that the trio can see would need both a readable store and a declared bus surface; today only the take's decision log is readable after the fact.*
11. **Animation traditions are named in prose and mode names, not in data.** Phyllotaxis, Voronoi, L-systems, DLA, lissajous paths and the Lorenz attractor are real layout/animation traditions already in the building — as engine modes with two-word records (`{id, name, glyph}` at best). → *The raw material for art-/science-history anchoring on the motion side exists; it is the record-keeping that doesn't.*
