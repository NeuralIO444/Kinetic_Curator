# STAGING REPORT — #2383 Persona Kernel P3: Callsign sweep (no real names on any surface)

Branch `kc-2383-callsign-sweep`, based on origin/main `db701fe8`. One PR, not merged by the builder
(this changes user-visible surfaces → Matt's review lane): **PR #2410 — https://github.com/NeuralIO444/Kinetic_Curator/pull/2410**

Spec: `docs/design/persona-kernel-spec.md` ruling R6 — surfaces use callsigns only. Callsigns:
LOIS → **COVER** (tile `cover`), DAVIS → **OVERLAP** (tile `overlap`), CARSON → **BLAST**,
GREIMAN → **HYBRID**, ASHWORTH → **SWISS GRIT**. Queen and Governor are never named on surfaces.
Code identifiers and comments keep the real lineage names — this sweep changes what surfaces SAY,
not what the app does. No logic changes: every rename below is a display string, or a data value
renamed consistently at every producer/consumer/comparison site so behaviour is identical.

## Surfaces changed (file + old string → callsign)

### The kernel records' surface slots (projected by curator/doctrines.mjs into the DIRECTORS doctrine readout)
- `app/src/personas/carson.mjs` — doctrine `name: 'CARSON'` → `'BLAST'`; doctrine title `CARSON — arms hot: …` → `BLAST — arms hot: …`
- `app/src/personas/ashworth.mjs` — doctrine `name: 'ASHWORTH'` → `'SWISS GRIT'`; title `ASHWORTH — arms process-first: …` → `SWISS GRIT — arms process-first: …`
- `app/src/personas/greiman.mjs` — doctrine `name: 'GREIMAN'` → `'HYBRID'` (slot not yet projected; P5 reads the same slot)

### THE ROOM (DIRECTORS panel)
- `app/src/panels/directors/RoomCodec.jsx` — tile name `lois` → `cover`; tile name `davis` → `overlap`; transcript who-label renders the callsign at the render seam (`lois`→`cover`, `davis`→`overlap`) — the record's persona id and the CSS class are unchanged
- `app/src/panels/directors/RoomFaces.jsx` — presence label lookup `'LOIS'/'DAVIS'` → `'COVER'/'OVERLAP'`; the face aria-label `Davis, …` / `Davis, resting` → `OVERLAP, …`
- `app/src/curator/mindPresenceLive.js` — presence `LABELS`: `lois: 'LOIS'` → `'COVER'`, `davis: 'DAVIS'` → `'OVERLAP'` (queen stays `'III'`)

### DIRECTORS copy — the verdict rename
- The room verdict `DAVIS ALONE` is itself a surface string (it renders in THE ROOM transcript tail, lowercased, via `curator/roomFeed.js`). Renamed to `OVERLAP ALONE` at every site so behaviour is identical: `app/src/curator/directorsMatrix.js` (5 rooms), `docs/research/directors-copy-matrix-2026-10-07.md` (the pinned source document, same 5 verdict lines — the matrix selfcheck compares module vs document character-for-character), `app/src/curator/fieldDirector.js` (transition table), `app/src/curator/fieldEval.js` (`soloContext` comparison), `app/src/curator/megamindVoice.mjs` (the prompt's verdict vocabulary list only). ROOM_VERDICTS derives from the matrix, so it follows. Saved takes carry verdicts as recorded data; an old take's stored `DAVIS ALONE` no longer matches ROOM_VERDICTS and reads as no-verdict (null) — the same fail-closed path as any unknown verdict string. Comments mentioning the old name were left (lineage).

### Top bar / curator voice
- `app/src/curator/taste.js` — `LOIS_VOICE` `alias`/`title: 'LOIS'` → `'COVER'`; the lois head's `personaName: 'LOIS'` → `'COVER'` (feeds the "persona pick:" hint)
- `app/src/curator/curate.js` — hint line `heuristic pick: LOIS · …` → `heuristic pick: COVER · …`
- `app/src/panels/layout/CuratorBar.jsx` — the TASTE readout mapped at the render seam: standing taster id `lois` → `cover`, `davis` → `overlap` (button micro-readout + aria-label). The expanded label already used the alias (callsign). `tasterReadout` itself is unchanged.

### Stage furniture
- `app/src/components/LoisPill.jsx` — pill word `LOIS` → `COVER`; tooltip `LOIS · …` → `COVER · …`
- `app/src/components/DavisSigil.jsx` — aria-label `Davis, …` / `Davis, resting` → `OVERLAP, …`
- `app/src/components/TakeStrip.jsx` — recap who-label `'DAVIS '/'LOIS '` → `'OVERLAP '/'COVER '`
- `app/src/components/PoemRow.jsx` — ray-gun chip + tooltip name the armed treatment by callsign via a display map at the seam (`carson`→`blast`, `greiman`→`hybrid`, `grit`→`swiss grit`, `shot`→`shot`); the mode id on the form record is data and unchanged

### Take recap copy (curator/megamindRecap.mjs — rendered fact phrases only)
- STATE_PHRASE: `LOIS called a keep` / `LOIS burned the show` / `LOIS cut` → `COVER …`; `Davis called a bloom` / `Davis called the room stuck` → `OVERLAP …`
- `the room spoke N times in the take (Davis X · LOIS Y)` → `(OVERLAP X · COVER Y)`
- `Davis moved the room: …` → `OVERLAP moved the room: …`; `Davis's proposed moves were dropped …` → `OVERLAP's proposed moves …`
- NOT changed in this file: the model prompts (below RECAP_SYSTEM) and the facts' `forms` matching arrays — internal machinery, see "Not changed" below.

### Panels and copy data
- `app/src/panels/MindPanel.jsx` — `LOIS brakes him` → `COVER brakes him`; `LOIS judges the …` → `COVER judges the …`; story rows `LOIS → DAVIS` / `DAVIS → LOIS` → `COVER → OVERLAP` / `OVERLAP → COVER`; beats headers `as DAVIS reads it` / `as LOIS reads it` → `as OVERLAP reads it` / `as COVER reads it`; beats-table persona cell renders the callsign (data id unchanged)
- `app/src/panels/MegaMindPanel.jsx` — button `write Davis's reason` → `write OVERLAP's reason`; prose `LOIS's vision` → `COVER's vision`
- `app/src/panels/davis/CandidateTray.jsx` — `judge stills — LOIS vision` → `COVER vision`; `LOIS vision pre-judgement (E5)` / `LOIS vision (E4)` → `COVER vision …`
- `app/src/panels/layout/unlockTree.mjs` — section titles `DAVIS — THE LADDER` → `OVERLAP — THE LADDER`, `DAVIS — HIS SETTINGS` → `OVERLAP — HIS SETTINGS`; node lines `Davis makes no route edits at tier 1.` and `Davis sets the material.` → `OVERLAP …`
- `app/src/panels/layout/UnlockTreeSection.jsx` — presence-row lookup updated to the new label (`'OVERLAP'`)
- `app/src/panels/stimulus/ModMatrix.jsx` — route tooltip `Davis made this route. Touch it and it is yours.` → `OVERLAP made this route. …`
- `app/src/panels/WetLab.jsx` — empty-kit line `Davis deals from the stage as it is` → `OVERLAP deals from the stage as it is`
- `app/src/data/helpCopy.js` — `Keeps feed the Lois boldness probe` → `COVER boldness probe`; `Davis deals a creature's parts by fit` → `OVERLAP deals …`
- `app/index.html` — meta description `inspired by Joshua Davis and the HYPE framework` → `inspired by OVERLAP and the HYPE framework`

## Real names found on/near surfaces and NOT changed — and why

1. **OPEN QUESTION — `app/src/curator/lore.json` (the Mind panel's lore facts).** Lore facts render verbatim in the Mind panel (`MindPanel.jsx` renders `b.loreFact`), and entries name George Lois (×2), "Lois's" (×3) and "Davis's ancestor" (×1). But lore.json is an offline-curated provenance artifact (`studio/curate-lore.py`, machine-verified; `loreBank.js`: "validation is admission, not translation") — its facts are sourced claims about real people, the R10 backstory material. Rewriting a curated artifact's facts is not a sweep decision, so I did NOT touch it and the new selfcheck excludes it. **Needs Matt's ruling:** re-curate those entries in callsign terms, or accept lore as a provenance surface where real names stand.
2. **OPEN QUESTION — the DIRECTORS matrix's signed spoken line.** Room 3, davis's line: *"He found his one in my compost pile. You're welcome, George."* — authored dialogue in Matt's signed-off copy matrix (the doc + module pair). Re-pointing it rewrites a character's line and breaks the doc↔module pin unless the signed document changes too. NOT changed; the new selfcheck carries it as a single exact-match allowlist entry (asserted to still match exactly once) and this report flags it. **Needs Matt's ruling.**
3. **Model prompts** (`curator/megamindVoice.mjs`, `curator/megamindSurfaces.mjs`, the recap prompts in `megamindRecap.mjs`): "You are LOIS, the critic…" / "You are Davis…" are instructions to the local model, never rendered. The P0 lane left their wording deliberately; prompt wording steers model behaviour, so changing it is a behaviour change, out of scope here. (The one exception above: the verdict vocabulary list inside megamindVoice, renamed only so the prompt describes the verdict that now exists.)
4. **The recap facts' `forms` arrays** (`megamindRecap.mjs`): internal matching data the narration grounds against (including the persona-name forms the prompted model writes). Not display; renaming them would change grounding behaviour.
5. **Lineage data fields that never render:** persona records' `identity` slots (name/born/knownFor — the kernel's lineage home, per spec §3); Canon records' `figures`/`identity`/`basis` prose (`data/canon/baselines.js`, `data/canon/styles.js` — the standing display policy documented in those files: figures are never rendered; the records' display labels already read in callsigns); `data/palettes.js` `era` (no UI consumer reads it); `curator/renderProfiles.js` `name: 'Joshua Davis'` (a code-side profile record; its `label` — the rendered field — already reads OVERLAP).
6. **The Governor word in DEV panels** (`panels/GovernorXrayPanel.jsx` "GOVERNOR X-RAY", `GovernorTunePanel`): "Governor" here is the performance governor mechanism's own name (`usePerformanceGovernor`, `statsGovernor`), not a real person's name and not the kernel record's surface name. R6's "Governor never named" is about the persona; the mechanism predates the kernel and renaming it is a wider change than this sweep. Left, flagged here for visibility.
7. **`lois-render-v1`** in CandidateTray's bake line: a lowercase renderer/version id, not a name display. Left.
8. **Comments and identifiers everywhere** (file names, `LoisPill`, `getLoisVerdict`, CSS classes like `.lois-word`, data ids `'lois'`/`'davis'`): lineage by the issue's own rule — surfaces only.

## The banned-name selfcheck — `app/src/personas/callsignSweep.selfcheck.mjs` (new, 14 checks)

- **Scans:** every `.jsx` under `app/src`, every `.js`/`.mjs` under `components/`, `panels/`, `hooks/`, `data/` (minus the two Canon record artifacts), a named list of copy-bearing modules (`curator/mindPresenceLive.js`, `curator/directorsMatrix.js`, `curator/roomFeed.js`, `curator/doctrines.mjs`, `curator/taste.js`, `curator/curate.js`, `composition/capabilityRegistry.mjs`, `curator/shelfFill.mjs` — the last two added by the QA fix below), and `app/index.html`. Comments are stripped first with a string-aware stripper, so lineage in comments never bites but comment markers inside a string stay copy and are scanned.
- **Banned forms:** the seven full names in any case; the bare surnames (Lois, Davis, Carson, Greiman, Ashworth, Turner, Bowie) in Title or UPPER case as whole words; `George`/`GEORGE` as a whole word (the attested form of address); and (round 2) a surname's lowercase possessive (`lois's`, `davis's`, …) — an apostrophe-s can never be part of an identifier, so it is copy wherever it survives the comment strip. Lowercase ids, class names, and camelCase identifiers never match — they are code, not copy.
- **Runtime pins:** DOCTRINES names are BLAST / SWISS GRIT and no doctrine title carries a banned name; the records' doctrine slots carry the callsigns; every DIRECTORS verdict is name-free and the solo verdict is `OVERLAP ALONE`; the recap's rendered phrases are pinned by name (its file interleaves prompts + matching data, so it is pinned, not scanned); the Canon records' display fields (baseline labels, style names) are name-free.
- **Exclusions (each documented in the suite header):** selfcheck files; `lore.json` (open question 1); model prompts; the recap file as a whole (pinned instead); the Canon record artifacts (display fields pinned); the `era:` field line in `data/palettes.js`; exactly ONE allowlisted string — the signed matrix line (open question 2), asserted to still match verbatim exactly once so the exception cannot silently grow.
- **Validator-bites tests (A1–A4):** synthetic strings prove display forms bite, code forms pass, comments pass, and the data-field exclusion is narrow.
- Added as one line to `app/selfcheck.manifest` after `personaTuning`.

## Re-pins made (specs that asserted the old strings)

- `app/e2e/room-codec.spec.js` — tile names `lois`→`cover`, `davis`→`overlap`.
- `app/e2e/topbar-expand.spec.js` — TASTE readout/aria-label `davis`→`overlap`, `lois`→`cover`; voice menu item `taste: lois`→`taste: cover`.
- `app/src/curator/loisRank.selfcheck.mjs` — hint pins `heuristic pick: LOIS ·` → `COVER ·`.
- `app/src/curator/megamindRecap.selfcheck.mjs` — spoken-summary pins `Davis 3`/`LOIS 2`/`Davis 2` → `OVERLAP 3`/`COVER 2`/`OVERLAP 2`. (Its model-line fixtures still quote "Davis called a bloom…" — those simulate model output grounded against the unchanged `forms` data, not app copy.)
- `app/src/curator/directorsMatrix.selfcheck.mjs`, `app/src/curator/directorRoom.selfcheck.mjs` — verdict fixtures `DAVIS ALONE` → `OVERLAP ALONE`, including re-sorting the two sorted-list expectations.
- `app/src/poets/fieldLatin.selfcheck.mjs`, `app/src/poets/fieldPlate.selfcheck.mjs` — verdict fixtures → `OVERLAP ALONE`.
- `app/src/panels/layout/unlockTree.selfcheck.mjs` — `/Davis sets the material/` → `/OVERLAP sets the material/`.
- `app/src/curator/directorTable.selfcheck.mjs`, `app/src/curator/davisState.selfcheck.mjs` — test names/messages mentioning the old verdict → `OVERLAP ALONE`.

## Verification

- **Selfcheck sweep** (continue-on-error manifest loop, 762 suites incl. the new one): **755 pass / 7 fail** in the sweep. The 7, each A/B-verified against a fresh detached worktree at unmodified origin/main `db701fe8`:
  - `swarmWasm`, `accum`, `rollSafety` — **fail identically on clean main** (cargo missing; V8 OOM abort, same signature; Playwright in this sandbox). Environmental, pre-existing.
  - `accumInput`, `vortex`, `wetWarmup`, `livingMotion` — pass standalone on clean main AND pass standalone on this branch (accumInput 7 cases, vortex 39/39, wetWarmup 21/21, livingMotion 18/18). Their sweep failures were load flakes from the long parallel sweep on this 1.5-CPU box, not code.
  - Net: every suite that can run in this sandbox is green on this branch; the only red is the three known environmental suites, red on main too.
- **Lint:** `npm run lint` — 0 errors (11 pre-existing warnings in untouched files).
- **Format:** `npm run format:check` — all files pass Prettier.
- **Build:** `npm run build` — green (one pre-existing dynamic-import warning).
- **New suite:** `callsignSweep.selfcheck` — 16 checks passed (12 at first publish; the QA fix below added A5 + B4, round 2 added A6 + B5).
- **Screenshots** (production build + vite preview, Playwright bundled chromium): `surface-proofs/directors-desktop.png`, `surface-proofs/directors-phone.png`, `surface-proofs/room-desktop.png`, `surface-proofs/room-phone.png` — committed with this change and referenced in the PR. They show the DOCTRINE row reading BLAST / SWISS GRIT, THE ROOM tiles reading `cover` / `overlap`, and the footer pill reading `COVER · VIBE`.

## QA fix (post-review, same PR)

Independent QA verified behaviour discipline and disclosure as PASS but returned one finding with
three parts, plus a body-count error. All fixed on this branch:

1. **Three rendered strings the sweep missed** — each chased by QA to a render site, none in the
   guard's original scan scope:
   - `app/src/composition/capabilityRegistry.mjs` — the consumer note "Davis reason prose,
     narrating the taste head's splits…" → "OVERLAP reason prose…" and "LOIS judges renders
     occasionally (E4 #1508)…" → "COVER judges renders occasionally…" (both render via
     `MegaMindPanel.jsx`'s capability-registry table, `{c.note}`).
   - `app/src/curator/shelfFill.mjs` — the fill note "…consensus deals in Davis's novelty order"
     → "…in OVERLAP's novelty order" (renders via `ShelfDevPanel.jsx`'s last-fill notes).
   Display notes only; no logic changed.
2. **The guard couldn't see them.** `callsignSweep`'s scope missed `composition/` and curator
   producers like `shelfFill.mjs` — QA plant-verified that appending "George Lois approves" to
   `capabilityRegistry.mjs` still passed 12/12. Fix: both files join the suite's named
   copy-bearing module list (the suite's existing pattern), with a header note on why the rest of
   `composition/` stays unscanned (its other note strings are code-side documentation with no
   rendering consumer). New check **B4** asserts both files are in the scan scope and that a
   planted banned name in either file's real content fails the scan.
3. **The comment stripper was string-unaware.** The old line-based stripper cut everything after
   `//` even inside a string literal, so a display string like "verdict // Davis approves" evaded
   the scan (QA plant-verified). The stripper is now a string-aware scanner (quote/template/regex
   state, expression-position heuristics, template-interpolation nesting). New check **A5** pins
   it: `//` and `/* */` inside string/template literals stay copy and bite; real comments still
   strip. First run of the new stripper exposed a regression of its own — JSX self-closing `/>`
   and closing-tag `</` slashes were misread as regex starts, desyncing the strip and leaking
   three JSX block comments into the scan — fixed by tightening the expression-position rule
   (no `}`/`<`/`>` in the opener set, `=>` and postfix handled, `<`-before-slash guard) and pinned
   by a regression assertion inside A5. With that, B1 is green across the whole tree again.
4. **PR body count.** The body said "eight selfchecks" were re-pinned; the true count is nine
   (davisState, directorRoom, directorTable, directorsMatrix, loisRank, megamindRecap, unlockTree,
   fieldLatin, fieldPlate — the list in "Re-pins made" above). Body corrected; it also now reads
   14 checks for the new suite, matching the two checks this fix added.

**Evidence:** `callsignSweep.selfcheck` 14/14 (incl. B1 full-tree scan, B4 plants, A5 stripper
pins); affected suites green — megamindRecap 12/12, personaKernel 10/10, personaTuning 11/11,
doctrines 10/10; `npm run lint` 0 errors (11 pre-existing warnings); `npm run format:check`
clean; `npm run build` green. The two open questions below are untouched, as instructed.

### QA fix round 2 (re-verification residual)

QA re-verification closed all four round-1 findings but caught one residual of the same class:

1. **One more rendered string.** `app/src/curator/shelfFill.mjs` carried a second fill note —
   "lois's choice: dealt unjudged keeps — no gate margins on file for them" — rendered by the
   same ShelfDevPanel last-fill readout as the round-1 string. It survived because the guard
   banned surnames only in Title/UPPER display form, and the lowercase possessive is neither.
   QA plant-verified the gap: appending the string to `shelfFill.mjs` left the suite green at
   14/14. The string was undisclosed in the PR body and in round 1 of this report. Fixed:
   re-pointed to "COVER's choice: …" with the rest of the wording byte-identical; display only,
   no logic changed.
2. **The guard now bites the possessive class, scoped so code stays green.** A surname's
   lowercase possessive (`lois's`, `davis's`, … — straight or curly apostrophe) can never be
   part of an identifier, class name or data id, so the suite scans for it in the same
   comment-stripped text as the other banned forms (new `possessiveIn`, folded into B1's scan).
   The A2 lowercase exemption is untouched: ids, class names and camelCase still pass, and
   callsign possessives ("COVER's choice") are the correct form and never bite. New checks:
   **A6** (possessives bite in copy incl. the curly-apostrophe form; callsign possessives, A2
   code forms and comment possessives pass) and **B5** (a planted "lois's choice" in
   `shelfFill.mjs` and "davis's pick" in `capabilityRegistry.mjs` each fail against the files'
   real content, and both unmodified files are possessive-clean). Suite is now 16 checks.
3. **Re-grep of the class.** String literals across the tree were searched for every lowercase
   possessive surname and for bare lowercase surnames in display contexts in the named
   copy-bearing files. No other rendered instance exists: every remaining hit is a code id or
   key (persona ids like `'lois'`/`'davis'`, map keys, `id: 'lois.vision'`, `rule === 'lois'`)
   — the A2 class, left as code. Title-case possessives elsewhere are all in comments
   (lineage, stripped before the scan) except one string in `composition/eventRegistry.js`,
   which round 1's documented exclusion already covers (code-side documentation, no rendering
   consumer) — left, per that exclusion.

**Evidence (round 2):** `callsignSweep.selfcheck` 16/16 on the fixed tree; on-disk plant test —
appending `"lois's choice: planted"` to `shelfFill.mjs` fails the suite, restoring the file
returns 16/16; affected suites green — shelfFill PASS, shelfDisk PASS, megamindRecap 12/12,
personaKernel 10/10, personaTuning 11/11, doctrines 10/10; `npm run lint` 0 errors;
`npm run format:check` clean; `npm run build` green. The two open questions below are still
untouched, as instructed.

### QA fix round 3 (final sweep — the bare-lowercase class, closed exhaustively)

Round 2's re-grep covered possessives and the named files, but the class had one more shape:
a bare lowercase surname standing as a word in rendered copy, in files the guard never named.
QA flagged `curator/loisGrudge.mjs` — `grudgeSummary()`'s three lines ("lois grudge · none —
…") render in `DataExportRow.jsx`'s Pipeline readout. This round fixes that file, closes the
class with a scoped guard extension, and re-greps the whole tree exhaustively.

1. **The flagged file.** `grudgeSummary()`'s three branches now read "COVER grudge · …"
   (wording otherwise byte-identical; display only, no logic changed). `loisGrudge.mjs` joins
   the guard's named scan set (EXTRA_FILES) with its render path annotated.
2. **Four more rendered instances the exhaustive pass found** — same class, each chased to a
   render site:
   - `curator/tasteHead.js` — `loisSummary()`'s two lines ("lois · not trained — …", "lois ·
     N favorites / …") render as the store's `loisStatus` in the same DataExportRow readout
     → "COVER · …". Its import-validation error prefix ("lois: …") also renders, via
     DataExportRow's `Taste: {error}` message, on a malformed taste file → renamed by
     function, "boldness head: …" (the head is the boldness probe; the taste file's `lois`
     section key itself is data and stays).
   - `data/helpCopy.js` — the help title "davis · role deal" (hover titles + the ? overlay;
     its `text` was already swept in round 1) → "overlap · role deal", the lowercase
     callsign register the ROOM tiles use. The entry id `davis-role-deal` stays (data).
   - `state/slices/davisSlice.js` — the trio-deal summary that lands in `shelfNotice`
     (ShelfView's notice band): "… · 3 lois · …" → "… · 3 cover · …". The `dealtByRule.lois`
     count key is data and stays.
   - `curator/megamindSurfacesLive.js` — the thrown error "no Davis citation stands (…)"
     renders in MegaMindPanel's `{sv.error}` line ("discarded / unavailable — reason: …")
     → "no OVERLAP citation stands (…)".
3. **The guard now bites the class, scoped so code stays green.** New rule (`lowercaseWordIn`,
   checks A7/B6/B7): string literals only, and only inside a named set of copy-producer files
   (LITERAL_PRODUCER_FILES — loisGrudge, tasteHead, megamindSurfacesLive, davisSlice,
   helpCopy — each annotated with its render path). Inside a literal, a surname bites only
   standing as a prose word: a literal that is id-shaped overall is data outright, and a
   surname fused into a token (neighbouring word char or `- . / :` — "davis-role-deal",
   "lois.vision", "narration.davisReason") stays data. That is the A2 hard case — persona ids
   as keys/values — and A7 pins both directions. B6 holds every literal of the five files to
   all case classes; B7 plant-proves the bite in three of them against their real content;
   C6 pins the rendered producers' actual outputs (grudgeSummary's three branches built from
   the real book, loisSummary's two) — every output starts with the callsign and carries no
   banned form in any class. Suite is now 20 checks.
4. **The exhaustive closing pass.** Every string literal in `app/src` was extracted from
   comment-stripped source (plus a JSON walk) and tested for the seven surnames in every case
   form. (Census note, corrected at QA re-verification: an earlier draft of this section
   quoted hit totals from the extraction pass that QA could not reproduce with independent
   counts — the totals are removed; the classification below is what QA verified, bucket by
   bucket, and its rendered outcome — the 9 fixed + 7 exceptions — reconciles exactly.)
   Production-file hits classified:
   - **Id-shaped literals** — persona ids (`'lois'`, `'davis'`, `'carson'`…), CSS class
     fragments, event/key strings (`'lois.vision'`, `'narration.davisReason'`). Data (A2).
   - **Prose literals**: CSS class-name strings (not text) · persona-record lineage
     slots + record prose (records are lineage; their surface projections are pinned in
     C1/C2/C4) · internal keys/seed strings (creatureRig, davisShift) · headless
     tooling report lines (miner/prospecting/coverageReport — script output, no app surface
     consumes the text; CensusPanel renders censusReadout's reshaped data, which carries no
     names) · model prompts (never rendered — the standing exclusion) · eventRegistry
     note strings (round 1's documented exclusion — code-side documentation, no rendering
     consumer) · renderProfiles config records (name/rationale/gaps — no render consumer;
     CuratorBar passes the profile as data) · Canon-record lineage prose (figures/basis;
     display fields pinned in C5) · megamindRecap literals (two model prompts + one
     already-callsign rendered line; its fact-matching `forms` values are single-token data,
     and its rendered phrases are pinned in C4) ·
     1 palettes `era:` field (dropped, no consumer) · 1 GLSL shader source · 1 bundle
     LEFT_OUT storage-key documentation string (bundle metadata, never displayed) ·
     **9 rendered — the 9 strings fixed in items 1–2 above** · **7 rendered exceptions, NOT
     touched**: lore.json's 6 fact strings and the signed "You're welcome, George." (the two
     open questions below).

**Evidence (round 3):** `callsignSweep.selfcheck` 20/20 on the fixed tree; on-disk plant
test — appending `'lois grudge · planted'` to `loisGrudge.mjs` fails the suite at B6 naming
the file and token, restoring the file returns 20/20; affected suites green — loisGrudge ok,
tasteHead OK, helpCopy OK, shelfFill/shelfDisk/shelf/shelfCensus PASS, shelfView PASS (11
groups), shelfPersist ok, megamindRecap 12/12, megamindVoice 17/17, megamindLink 21/21,
doctrines 10/10, personaKernel 10/10, personaTuning 11/11, pipelineNotices PASS, bundleFile
5/5, directorRoom 7/7, directorTable 6/6, directorsMatrix 6/6; `npm run lint` 0 errors (11
pre-existing warnings); `npm run format:check` clean; `npm run build` green. The two open
questions below are still untouched, as instructed.

### CI fix round 4 (the pins CI caught — one selfcheck, two e2e specs)

CI on bfd82b69 (run 44490097705) failed all three test jobs; every failure was a stale pin on
a string the sweep deliberately renamed — the app strings are correct as swept, the pins moved:

1. **`queenChannel.selfcheck.mjs` (killed both selfcheck jobs).** Round 3 renamed tasteHead's
   import-validation error prefix to `boldness head: …` (rendered copy, via DataExportRow's
   `Taste: {error}` line); the suite still pinned the refusal with `assert.match(r.error,
   /lois/)`, and CI's actual text is `'boldness head: has no head — train with --features'`.
   Re-pinned to `/boldness head/` with a comment naming it as tasteHead's rendered error label
   so the next sweep finds the pin. The check's intent is unchanged (a bad lois *section* —
   the data key — still refuses); the lois-section assertions around it are untouched.
2. **`e2e/raygun-wear.spec.js` (desktop + phone).** Chip text `'ray gun · carson'` →
   `'ray gun · blast'` and `'ray gun · grit'` → `'ray gun · swiss grit'` (PoemRow's
   MODE_CALLSIGNS; the record modes stay `carson`/`grit` data). CI evidence: expected
   "ray gun · carson", received "ray gun · blast".
3. **`e2e/treatment-bus.spec.js`.** The cycle loop used each record mode for both the record
   poll (data — unchanged) and the chip text; it now iterates `[mode, label]` pairs —
   carson→blast, greiman→hybrid, grit→swiss grit, shot→shot — polling the mode id and
   asserting the callsign label.
4. **`e2e/voice-personas.spec.js` — NOT a pin; no change.** Its stub-tile MIX test failed its
   first attempt at `mixBar.toBeHidden()` (the crossfade didn't commit inside 15 s) and
   **passed on retry in the same CI run** — Playwright's own summary files it as flaky, not
   failed. No swept string is involved: the test asserts `/grid/i` (a mode name) and MixBar
   renders only the mix target name; the stall is the known Mac-runner sampler-starvation
   signature. Left exactly as it was.
5. **Full e2e grep:** every `carson|greiman|ashworth|lois|davis` hit in `e2e/` was chased —
   the remaining hits are `.panel-davis`/`.davis-*`/`.codec-lois` CSS selectors and generic
   text ('EVOLVE idle', 'MIDI off', the director section labels), not rendered persona names.
   Left alone, deliberately.

**Evidence (round 4):** full manifest sweep on the fixed tree — **759 pass / 3 fail of 762
suites** (the round-1 sweep-load flakes — accumInput, vortex, wetWarmup, livingMotion — all
pass in-sweep this time). The 3 failures were A/B-run standalone in a fresh detached worktree
at origin/main (db701fe8): swarmWasm, rollSafety and accum **fail identically on unmodified
main** with matching signatures (swarmWasm: the sandbox `build-wasm.sh --verify` toolchain
failure; rollSafety: crash to the Node banner; accum: V8 abort after the same [ok] prefix,
identical frame `0x19f0c41` on both trees) — sandbox-environmental, not sweep-caused; neither
tree reaches a verdict line for these three, and CI's own selfcheck jobs are the authority.
`queenChannel.selfcheck` 13/13 after the re-pin; `npm run lint` 0 errors (11 pre-existing
warnings); `npm run format:check` clean; `npm run build` green. The e2e re-pins are from CI
log evidence + the specs' own text — CI is the authority for them (sandbox e2e metrics differ
from the Mac runner). The two open questions below are still untouched.

## Open questions stopped on

1. lore.json's rendered facts naming George Lois / Lois / Davis (item 1 above) — needs Matt's ruling; not rewritten.
2. The signed matrix line "You're welcome, George." (item 2 above) — needs Matt's ruling; allowlisted, not rewritten.
