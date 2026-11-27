# STAGING REPORT — #1858 BOOK S5: per-chapter learning

Issue title (verbatim): **"BOOK S5: per-chapter learning — the Queen's taste histogram, LOIS's decaying grudge"**
Branch: `feat/1858-book-s5-learning` on origin/main c83dad2b (Book S1–S4 merged: #1893/#1896/#1899/#1908/#1909).
Scope built here (per coordinator dispatch): scope items **1, 3, and the tally half of 4**, plus item 5's
standing law (fidelity untouched). D5/D6 are UNRULED — see "Where D5/D6 sit" below.

## Premises verified against the actual tree (2026-11-01, before any code)

1. **Trainer** — `studio/curator.py` exists (1234 lines) and owns the taste file: `build_taste()` assembles
   kc-taste v1 (`kind: kc-taste`, `version: 1`, probe + distilled head + optional `lois` section via
   `attach_lois`). It had NO ledger input: ledger rows reach training as labels via
   `studio/hits_bridge.py ledgers` (mlx_run.py phase 1). hits_bridge's `is_ledger_row` ignores the `notch`
   field whole (the S4 comment predicted exactly this). → The histogram builder lives in curator.py beside
   the taste-v1 machinery, reads ledgers through hits_bridge's own reader (lazy import), and attaches as a
   new optional section, following the `attach_lois` pattern. `train` gains `--ledgers <dir>`.
2. **Chapter attribution source** — `captureFavorite` (davisSlice) is the ONE capture for all three doors
   (App.jsx:481 favorite / :488 keep / :495 pass — X passes carry the stamp too). While a narrowing stands
   it stamps `notch: { chapter, level, keyword, anchor }` (chapterNarrow.notchContextFor); `ledgerRow`
   (tasteLedger.js) carries it into keeps.jsonl AND passes.jsonl. Rows with no stamp carry **no chapter
   evidence** and are excluded from the histogram — attribution is never inferred from the recipe.
3. **The walk** — `state/chapterWalk.mjs`: `chapterWeights(visits)` (novelty: unvisited 3, visited 1/n) and
   `dealLanding(rng, { fromId, visits })`; sole live caller is layoutSlice `scopedChapterLook`. Its header
   already reserves this exact slot ("no taste, no keeps histogram (the Queen's per-chapter sway is S5)").
4. **Her legal bounds** — `curator/queenLean.mjs`: `M1_BIAS = 0.06` (never negative — she never demotes),
   `MIN_KEEPS = 8` (identity below). **Deniability is an import graph** (queenDeniability.selfcheck):
   only queenChannel.js / queenLean.mjs / director.js may import the hidden modules; tasteHead.js and the
   other visible consumers must not contain her identifiers; state/ files must not carry sway*/queen*/
   lean_* object keys; surfaces (.jsx, components/panels/hooks/styles/data) must not contain /queen/i.
   → This build defines its own named constants in the new module and **cross-pins them by value** against
   queenLean's in the selfcheck — the loisCut/LOIS_CUT_GATES precedent. Nothing imports queenLean.
5. **Trust boundary** — `curator/tasteHead.js validateTaste` is the single door (tasteStore import AND
   stored-read re-validation, bundleFile/bundleParts). Optional-section precedents: `lois` (bad → refuse),
   `queen` (bad → **drop the section, never refuse** — #1140's recorded reasoning). The chapter extension
   follows the queen pattern: it is her memory; a garbled one means no lean, never a broken taste file.
   Fidelity law (`HEAD_MIN_FIDELITY = 0.3`, headUsable) is not touched; the histogram is data with its own
   validation + counted-keeps floor, not a head, and does not inherit the head gate (flagged for review).
6. **The grudge's feedstock** — the round record (roundTable) carries `cut { reason, gate, value, limit,
   before, after }`; `before.lookId` is the killed look, `round.chapterId` its chapter. The feed hook that
   exists today is `loisActivity.noteCut()` (flag only, no genre), called post-commit in layoutSlice
   `kineticVoicePass` — the tally wires at the same site, with the round's cut data captured in the updater.
   "Genre" = the Book's own keyword layer: chapterNarrow.genreTable(chapter) + lookKeywords(look) — the
   killed look's first declared keyword that honestly narrows its chapter; no keyword → chapter grain.
7. **Backstage home** — globalSlice mirrors `tasteStatus`/`loisStatus` strings (refreshed at init /
   setTasteExperimental / importTaste / clearTaste); `panels/pipeline/DataExportRow.jsx` renders them.
   The book-memory line follows that pattern exactly (`bookStatus`); the grudge line renders beside the
   lois line from the tally singleton.
8. **Manifest** — app/selfcheck.manifest (one line per suite; the runner fails on unlisted suites).
   Python: curator.py `selfcheck` is stdlib-first (numpy/sklearn sections skip when absent); Python 3.12
   in the sandbox, numpy present.

## Design (as built — filled in per commit)

### The extension (trainer → file), key `chapters`, additive + versioned

```json
"chapters": {
  "version": 1,
  "memory": { "kind": "recency", "halfLifeDays": 14.0 },
  "totals": { "keeps": 41, "passes": 37 },
  "byChapter": { "engraving": { "keeps": 12.5, "passes": 3.25 } },
  "byNotch":   { "engraving": { "0": {"keeps": 9.0, "passes": 2.0}, "1": {...} } }
}
```

- Only stamped rows count; only chapters/levels with rows appear. `totals` are RAW row counts (the floor
  reads them); `byChapter`/`byNotch` are recency-weighted sums (canon ⇒ weight 1 ⇒ sums = counts).
- Validation (validateTaste, queen-pattern): version must be 1; memory kind ∈ {recency, canon};
  half-life finite > 0 when recency; totals non-negative integers; chapter keys ⊆ the Book's nine;
  notch levels ⊆ {0,1,2}; all weights finite ≥ 0; **consistency teeth**: per-axis sums of byChapter ≤
  totals, byNotch sums ≤ byChapter per chapter. Any failure → the section is dropped, the file still runs.

### Walk consumption (chapterWalk + chapterMemory)

- `chapterLeanBiases(extension)` (curator/chapterMemory.mjs): null below the floor (totals.keeps < 8) or
  with no observations; else per chapter `bias = CAP × shrunkRate`, CAP = 0.06, rate shrunk toward the
  global rate by a prior of 4 pseudo-observations. Biases are ≥ 0 by construction (she never demotes) and
  ≤ CAP (saturation is arithmetic, not a clamp after the fact).
- `chapterWeights(visits, lean)` / `dealLanding(rng, { fromId, visits, lean })`: weight = novelty + lean.
  Default (no lean) is byte-identical to S2. Novelty dominance is structural: max visited weight
  1 + 0.06 < min unvisited weight 3 — taste can never wall off the book.
- Wiring: layoutSlice `scopedChapterLook` reads `getTaste()?.chapters` per landing (nothing is stored in
  state; no store key carries the term).

### LOIS's grudge tally (curator/loisGrudge.mjs — tally half of scope 4)

- Pure tally core + singleton (loisActivity's shape, own injectable clock): `noteCut({chapterId, lookId})`
  derives the genre from the killed look; entries keyed chapter+genre (genre null = chapter grain).
- The record never rewrites: cuts are timestamped lists; an overrule appends a reset marker — effective
  cuts are those after the last reset ("resets entirely", the record stays honest).
- Permaban (visible backstage as character): effective cuts ≥ `GRUDGE_PERMABAN_MIN_CUTS` (5) AND share of
  all effective cuts ≥ `GRUDGE_PERMABAN_SHARE` (0.5). **These two numbers are builder machinery, not a
  ruling** — no number exists in the issue or the shipped code; flagged for Matt's feel check.
- Overrule: `noteKeep({chapterId, lookId})` — a keep whose look's genre is currently permabanned resets
  that genre (interpretation stated plainly: the ban is the grudge's standing state; a keep in the banned
  genre is the performer voting it down with the strongest signal. Wired at both keep doors in davisSlice —
  addFavorite and addKeep — beside the ledger append; passes never call it).
- Backstage: `grudgeSummary(snapshot)` rendered in DataExportRow under the lois line.

## Where D5/D6 sit (UNRULED — nothing in this build cites them as decided)

- **D5 (the Queen's memory: recency vs canon)** — built as ONE declared parameter, not two structures:
  trainer constant `HISTOGRAM_RECENCY_HALF_LIFE_DAYS` in curator.py (standing placeholder value **14.0
  days — NOT a ruling**), CLI-overridable (`--memory-half-life-days`, `--memory canon`), recorded in every
  emitted file (`memory.kind` + `memory.halfLifeDays`), and stated on both backstage surfaces (inspect +
  the app's book line: "which memory the Queen is playing from" is data, per the issue's KC-1 DS note).
  Canon is the same machinery at half-life = None. The ruling changes a default value only → **no stop
  was needed**; the exact decision for Matt is recorded at the end of this report.
- **D6 (the grudge's decay half-life)** — machinery built, application OFF: `decayedWeight(timestamps,
  at, halfLifeMs)` is a pure function, and `snapshot({ halfLifeMs })` judges the permaban on decayed
  weights when given one — both proven by tests with a test half-life (one day, explicitly not a ruling).
  The standing constant `GRUDGE_DECAY_HALF_LIFE_MS = null` (null = no decay applied) is what the live
  snapshot reads, and the suite pins that a standing snapshot never ages a cut. The ruling changes a
  constant only → **no stop was needed**. (The absorption acceptance pair belongs to D5's side: the
  trap with the canon fixture, re-entry with the recency fixture at its declared 14-day half-life, the
  horizon — 6 half-lives, era weight ≤ 1/32 — asserted on the extension itself, never a magic number.)

## Verification (run on the final tree, 2026-11-01)

- **New suites**: `chapterMemory.selfcheck` ok (boundary drop-on-bad ×9 malformed shapes, cap/floor
  cross-pins vs queenLean by value, trainer CHAPTER_IDS mirror pin, walk direction sim, absorption
  pair: canon grunge 39.6% of long-run landings ≥ 35% trap bound; recency grunge 18.0% < 30% and
  engraving out-lands it; horizon ≤ 1/32 asserted on the extension). `loisGrudge.selfcheck` ok
  (tally by genre incl. chapter grain, permaban floor+share, overrule reset with record preserved,
  decay machinery with a test half-life, standing snapshot never ages a cut).
- **Targeted suites** (every suite naming a touched file, run directly): 12/12 ok — queenDeniability
  (the hidden-sway law holds: no new imports of the hidden modules, no /queen/i on surfaces,
  no sway*/queen*/lean_* keys in state), chapterWalk, tasteHead, chapterNarrow, chapterNarrowWiring,
  roundWiring, loisCut, loisActivity, tasteLedger, favorites, bundleParts, bundleFile. **Zero re-pins**:
  the no-lean/no-extension paths are byte-identical to S2/S4 behaviour by construction.
- **Python**: `python3 studio/curator.py selfcheck` → "chapter memory check OK" / "curator selfcheck OK"
  (the numpy/sklearn taste-train section skips in this sandbox by design; its --ledgers assertions run
  where sklearn exists). `py_compile` ok.
- **Format**: `npm run format:check` in app/ → "All matched files use Prettier code style!" (the two
  new suites needed one --write pass; re-verified green after).
- **e2e grep**: no spec references the new surfaces; the one spec on the neighbouring surface
  (`e2e/taste-experimental.spec.js`) locates only `.taste-status`, untouched by the two added lines.
- **Full manifest sweep** (continue-on-error loop over `app/selfcheck.manifest`, 566 suites), final
  line verbatim: `SWEEP DONE total=566 pass=563 fail=3`. The three failures, each proven environmental:
  - `engine/kernel/bake/swarmWasm` — log: "build-wasm: cargo not found on PATH" (no Rust in sandbox).
  - `fx/rollSafety` — pure sections all [ok], then the shared-harness Chromium crash (known sandbox
    environmental; CI's selfcheck-browser job is authoritative).
  - `gl/accum` — native abort under in-sweep memory load; standalone re-run with
    `NODE_OPTIONS=--max-old-space-size=3072` exits 0. This build touches no gl code.
  (The first sweep attempt was lost when the sandbox wiped /tmp mid-run; the sweep was re-run whole
  with logging outside /tmp — the numbers above are from the completed run.)

## Files touched

**New**
- `app/src/curator/chapterMemory.mjs` — extension validation, lean derivation, backstage line.
- `app/src/curator/chapterMemory.fixture.json` — the shared trainer↔runtime fixture (literal weights).
- `app/src/curator/chapterMemory.selfcheck.mjs` — boundary, bounds, walk direction, absorption pair.
- `app/src/curator/loisGrudge.mjs` — the grudge tally (+ `decayedWeight`, `grudgeSummary`).
- `app/src/curator/loisGrudge.selfcheck.mjs` — tally, permaban, overrule reset, decay-off law.
- `STAGING-REPORT-1858.md` — this report.

**Edited**
- `studio/curator.py` — `build_chapter_memory` + `--ledgers` / `--memory` / `--memory-half-life-days`,
  inspect line, selfcheck section ("chapter memory check OK").
- `studio/mlx_run.py` — phase 2 forwards `--ledgers` so the trained taste.json carries the extension.
- `app/src/curator/tasteHead.js` — validateTaste carries a validated `chapters` section (drop-on-bad).
- `app/src/state/chapterWalk.mjs` — `chapterWeights(visits, lean)` / `dealLanding(…, lean)`, cap clamped
  at the point of application; no-lean shape byte-identical to S2.
- `app/src/state/slices/layoutSlice.js` — landing reads the lean fresh from the imported taste; the
  round's spent cut also feeds the grudge tally (post-commit, beside `loisActivity.noteCut()`).
- `app/src/state/slices/davisSlice.js` — both keep doors note the keep to the grudge (overrule check).
- `app/src/state/slices/globalSlice.js` — `bookStatus` refreshed at the four taste sites.
- `app/src/panels/pipeline/DataExportRow.jsx` — book-memory line + grudge line under the lois line.
- `app/selfcheck.manifest` — the two new suites registered.

**Explicitly NOT touched** — the one-writer files (`gl/liveLoop.mjs`, `gl/liveResolve.mjs`,
`particles.js`); the fidelity law and every head gate; the Queen's hidden modules and their bounds
(cross-pinned by value only); the ledger row format (the S4 stamp is consumed, never amended).

## Decisions for Matt (one at a time — nothing here blocks the machinery)

- **D5 — the Queen's memory.** Options: **recency** (a declared half-life; the season she plays from is
  the current one; the standing placeholder is 14.0 days) vs **canon** (all-time; a dead era's lean
  never fades — the absorption trap is proven real in the suite: ~40% of long-run landings in the dead
  era after novelty spends). Recommendation: **recency**, with the half-life itself as the feel knob.
- **D6 — the grudge's decay half-life.** Options: a half-life in ms (the ban softens as cuts age) vs
  **null** (standing: no decay — a ban stands until a keep overrules it). Recommendation: rule it after
  living with the tally a while; the overrule already gives the performer the release valve.
- **Feel-check flags (not decisions the build needed):** the permaban thresholds (5 cuts / 0.5 share)
  are builder machinery values; the histogram is gated on its own counted-keeps floor, not on head
  fidelity (it is data, not a head — the 0.3 fidelity law is untouched and still gates the heads).
