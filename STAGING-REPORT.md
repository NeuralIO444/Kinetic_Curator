# STAGING REPORT — #1853 BOOK S1: chapter registry — derive design-history chapters from movement groups

**Branch:** `feat/1853-book-s1-chapters` in worktree `~/workspace/kc-1853-build`, based on `origin/main` 4378b336. (This file replaces the previous lane's report, per the staging ritual.) Not pushed, no PR — coordinator publishes. **Review posture: backend/data lane — the registry changes nothing the performer sees; Matt merges on the coordinator's tech check.**

## What shipped

One new module + its selfcheck + one manifest line. Nothing else.

- **`app/src/data/chapters.js`** — the chapter registry, derived the way `data/assetStyle.js` derives style: a frozen table over what the library already declares, zero edits to authored records, pure functions, no RNG (decks are a function of the library — the replay law's precondition for S2's seeded landing).
  - `CHAPTERS` — the 9 chapters in the D1 spine order, each carrying `id`, `name`, `position`, `prev`/`next` neighbours (attached from the order itself), its `lookGroups`, `assetStyles`, `assetFamilies`, `voiceStyles`, and its `card` (`{ paletteId, marks }` — data only; rendering is S2's work).
  - Read API in the assetStyle shape: `chapterById`, `nextChapter` / `prevChapter` (null at the ends — the walk terminates, never cycles), `chapterForLookGroup`, `chapterForStyle`, `chapterLooks` / `chapterVoices` / `chapterAssets` / `chapterDeck` (all take injectable data params with library defaults), `dealableAssetRecords`, and `deckReport()` — the backstage honesty read.
  - Membership is derivation, never borrowing: looks by group ∈ `lookGroups` over `COMPOSITION_PRESETS`; voices whose declared `styles` meet `voiceStyles` over `VOICE_DECK`; assets whose derived style ∈ `assetStyles` or derived family ∈ `assetFamilies` over the dealable records. The creature citizen is excluded from every deck (`CHAPTER_UNDEALT`, pinned identical to `rollPool`'s `NEVER_DEALT` by the selfcheck). The palette `era` strings are never read — the module does not import `palettes.js` at all; card palette ids are declared data for S2 to resolve.
- **`app/src/data/chapters.selfcheck.mjs`** — registered in `app/selfcheck.manifest` after `voiceDeck.selfcheck`. Proves: spine order + neighbour round-trip (forward walk visits all 9 exactly once, backward mirrors, ends null); pinned deck counts per chapter; union of chapters = the 294 dealable assets with the citizen in no deck and Now = 64 looks / 64 voices / 294 assets; the taxonomy pin (**DIAGONAL GRID reads in Swiss, not Bauhaus**); deck-discipline derivation (below); card validity (palette exists and — for movement chapters — is paired by one of the chapter's own looks; card marks are members of the chapter's own deck); purity (same library in, same deck out); source hygiene (no `.era` read, no palettes import, no one-writer files).
- **`app/selfcheck.manifest`** — +1 line.

## The spine, and what each chapter holds today (measured)

| position | chapter | lookGroups | deck (looks / voices / assets) |
|---|---|---|---|
| 0 | Marks | — | **0 / 0 / 0 — reports short on every axis** |
| 1 | Engraving | engraved | 4 / 11 / 20 |
| 2 | Bauhaus | bauhaus | 4 / 8 / 16 |
| 3 | Swiss | swiss | 5 / 11 / 61 |
| 4 | Op Art | op | 4 / 11 / 14 |
| 5 | Japan | japanese | 5 / 11 / 25 |
| 6 | Memphis | memphis | 4 / 14 / 25 |
| 7 | Grunge | grunge | 5 / 8 / 39 |
| 8 | Now | all 14 groups | 64 / 64 / 294 |

Now's lists are built from the source tables (`PRESET_GROUPS`, `STYLES`) at module load, so the sum chapter cannot drift from the library it sums.

## Design choices (each one Matt-overruleable)

1. **Marks derives nothing today — on purpose.** D1 ruled the book opens at Marks, and #1854 (S1b) is the issue that authors its pool "as a coherent visual language, not assembled from leftovers" — its own premise is that Marks "has no pool at all today." So S1 does not raid the glyph/stamp/letterform families to fake a deck; the chapter exists first in the spine with empty derivation axes, an unfilled card (`paletteId: null`, `marks: []` — the slot #1854's ochre/bone/carbon palettes will fill), and `deckReport()` naming it short on looks, voices and assets. The `assetFamilies` axis is the documented join point: when #1854's records declare their family/style, this derivation reads them with no change to the code below the table.
2. **The deck floor is the library's own floor.** `CHAPTER_DECK_MINIMUM = { looks: 4, voices: 8, assets: 14 }` — exactly the smallest counts among the seven movement chapters that exist today (Bauhaus/Grunge voices = 8; Op Art assets = 14; four chapters sit at 4 looks). Not a round number and not padded: a chapter smaller than the smallest deck the instrument already deals as a movement is not yet landable. The selfcheck asserts a movement chapter sits exactly on each axis minimum, so if the floor ever stops being the observed floor, the check says so.
3. **Card palettes are paired, not picked.** Each movement chapter's card palette is one its own looks already pair with (Engraving → `persona-haeckel`, Bauhaus → `solar-max`, Swiss → `transit` — DIAGONAL GRID's own pairing, Japan → `sepia-plate`, Op Art → `hydra`, Memphis → `neon-brood`, Grunge → `dirty`); the selfcheck enforces the pairing so a card can never drift off its chapter's authored sky. Now's card is `praystation` (the factory opener's palette — Davis's home chapter wears the instrument's own colours) with pixel-glyph marks: the one chapter whose signature is the instrument itself.
4. **Chapter ids are movement nouns, group ids stay as they are.** `engraving` (group `engraved`), `japan` (group `japanese`), `op-art` (group `op`) — the mapping lives in the table, which is the registry's whole job; no authored group was renamed to fit.
5. **The undealt exclusion is declared in the registry and policed, not imported.** `state/rollPool.mjs` is the deal-time owner of `NEVER_DEALT`; a data module importing state would invert the layering `rollPool` itself observes (it imports `data/assetStyle`). So `chapters.js` declares `CHAPTER_UNDEALT` with the reason in the header, and the selfcheck — which may cross layers — asserts the two are identical.

**D2–D6:** none required. The registry needs no cut shape (D2), no CURATOR behaviour (D3), no settle trigger (D4), no Queen memory (D5), and no cost gate (D6) — it deals nothing and gates nothing. **Premise check:** every premise in the issue verified true against this tree before building (no era/chapter field anywhere; 7 movement groups in `styleLooks.js`; 10 derived styles; 295 authored records + citizen = 294 dealable via `rollPool.dealableRecords`; DIAGONAL GRID in `swiss`). No premise stop.

## Lois pass (the 9 rules, applied to the chapter table — the only design surface S1 has)

- **The nanosecond:** Nine chapters, one word each — Marks, Engraving, Bauhaus, Swiss, Op Art, Japan, Memphis, Grunge, Now. A child reads the spine in one breath and knows where they are in the book. Pass.
- **Creativity solves problems:** The problem was mush — every deal from everywhere. The spine is a decision, not a sort: design history as the order of battle, and the taxonomy in code (Swiss is Swiss, DIAGONAL GRID stays home) over any tidier story. Pass.
- **Defeat habit:** Every registry on earth backfills the empty slot so the chart looks finished. This one prints Marks at 0/0/0 and calls it honest. The habit broken is cosmetics. Pass.
- **Cautious or creative:** Opening the book on an empty chapter is the creative choice — and it only works because the emptiness is admitted in writing (the deck report) instead of padded with glyph leftovers. The moment someone "fixes" Marks by borrowing, kill it.
- **Assume smart:** No wizard, no explainer surface, no new panel. The registry is silent until S2; the backstage report assumes the reader can handle a shortfall list. Pass.
- **No trends:** "AI personas playing a game" is the trend; a card catalogue with neighbours and a floor is a position. The word *genre* appears nowhere in the module — chapters and styles are the vocabulary, the rest is plumbing. Pass.
- **Discovered, not created:** The chapters were already in the library — in the group names the looks were filed under. S1 discovers them and writes down the order; it manufactures nothing but Marks' empty chair. Pass.
- **Work is worship / True to self:** The registry does the unglamorous derivation work once so every later slice (landing, round, narrowing) reads instead of re-deriving — and the order is Matt's ruling (D1), not the machine's convenience. Pass.
- **Kill list:** Kill any future slice that lets a thin chapter borrow a neighbour's pool silently. Kill any card whose palette isn't paired by the chapter's own looks. Kill "genre" on any performer surface.

## Verification

- `chapters.selfcheck` — green (see the suite; every acceptance bullet in #1853 is an assertion).
- Zero diffs to the 295 authored asset records and to look/voice/palette data files: `git status` shows exactly three paths — `app/src/data/chapters.js` (new), `app/src/data/chapters.selfcheck.mjs` (new), `app/selfcheck.manifest` (+1 line).
- Touched-file pin sweep: no other selfcheck references the new module (grep); no control surface exists in this build, and `grep chapter e2e/` is empty — the e2e selector sweep has nothing to re-pin.
- Full manifest sweep: **all 547 commands accounted for — 545 pass, 2 environmental failures** (below). The official runner passed everything up to `swarmWasm`; the remainder ran in tracked segments (464 pass in place, `chapters.selfcheck` among them), with the two segment failures adjudicated individually.
- `gl/accum` — heap-aborted under segment load; solo with `NODE_OPTIONS=--max-old-space-size=3072`: **OK (83 cases)**.
- `swarmWasm` — exit 1 on this tree and on pristine `origin/main` with the identical error; no `cargo` on PATH in the sandbox. Environmental, base-identical.
- `fx/rollSafety` — on this tree and on pristine `origin/main` alike: 5 checks pass, then the sandbox GL/browser dies at the identical stack (`gl/parity/glDriver.mjs` renderViaGL ← `rollSafety.selfcheck.mjs:231`). Environmental, base-identical; CI's browser job is authoritative.
- `kineticSweep` passed in the segments — the ~1.5% flake (#1822) did not fire.
- `npm run format:check` — clean (run as `npx prettier --check .`, the script's exact command; the worktree has no local `node_modules/.bin`). `npx eslint` on both new files: 0 errors.
- `npm run build`: the sandbox fails identically on pristine main (checked in the untouched reference checkout) and on this tree — `@tauri-apps/api` unresolvable from the shared sandbox install; the failing import is in `useCuratorIPC.js`, untouched by this build, and `chapters.js` is not in the app import graph. CI's `lint-build-selfcheck` (which installs dependencies) is authoritative.
