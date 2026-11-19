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

## The banned-name selfcheck — `app/src/personas/callsignSweep.selfcheck.mjs` (new, 12 checks)

- **Scans:** every `.jsx` under `app/src`, every `.js`/`.mjs` under `components/`, `panels/`, `hooks/`, `data/` (minus the two Canon record artifacts), a named list of copy-bearing curator modules (`mindPresenceLive.js`, `directorsMatrix.js`, `roomFeed.js`, `doctrines.mjs`, `taste.js`, `curate.js`), and `app/index.html`. Comments are stripped first (the queenDeniability pattern), so lineage in comments never bites.
- **Banned forms:** the seven full names in any case; the bare surnames (Lois, Davis, Carson, Greiman, Ashworth, Turner, Bowie) in Title or UPPER case as whole words; `George`/`GEORGE` as a whole word (the attested form of address). Lowercase ids, class names, and camelCase identifiers never match — they are code, not copy.
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
- **New suite:** `callsignSweep.selfcheck` — 12 checks passed, including in the full sweep.
- **Screenshots** (production build + vite preview, Playwright bundled chromium): `surface-proofs/directors-desktop.png`, `surface-proofs/directors-phone.png`, `surface-proofs/room-desktop.png`, `surface-proofs/room-phone.png` — committed with this change and referenced in the PR. They show the DOCTRINE row reading BLAST / SWISS GRIT, THE ROOM tiles reading `cover` / `overlap`, and the footer pill reading `COVER · VIBE`.

## Open questions stopped on

1. lore.json's rendered facts naming George Lois / Lois / Davis (item 1 above) — needs Matt's ruling; not rewritten.
2. The signed matrix line "You're welcome, George." (item 2 above) — needs Matt's ruling; allowlisted, not rewritten.
