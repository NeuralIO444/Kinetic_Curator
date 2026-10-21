# #1720 staging report — picker targets, bank layer, key legend

Branch `ember/1720-picker-banks-legend`, staged locally (not pushed, no PR — the coordinator publishes). Everything below was run and verified in this worktree. This file replaces the previous stage's report at the worktree root; that report remains in git history.

## What was built, per work item

**1. Picker targets.** The target registry (`app/src/midi/targets.mjs`) gains one trigger target per palette (37, ids `palette.<id>`, labels `PAL <name>`), one per flagship voice (4, `voice.<id>`), twelve user-voice slot targets (`voice.my.1` … `voice.my.12`), and the bank switch (below) — 54 new targets, 69 in total. A palette key fires the same `PALETTE_SET_ID` event the palette strip emits; a voice key fires the same `VOICE_LOAD` the voice tiles emit, so a key press and a tap are the same act.

User voices have runtime ids (`uv-…`), so they cannot be registry entries. A slot target resolves at press time: it loads the Nth voice on the performer's own shelf (the hand-made list, in shelf order — earned finds are not on that shelf). An empty slot fires nothing.

**2. Bank layer.** New pure module `app/src/midi/banks.mjs`. A bank is `{ name, map }` — a named set of bindings, each map sanitized by the existing `sanitizeMidiMap`. One new target, `bank.next` (label `BANK NEXT`), flips the active bank, wrapping at the end. The store (`state/slices/midiSlice.js`) holds `midiBanks` + `midiActiveBank` and keeps `midiMap` as a mirror of the active bank's map, maintained in the same `set()` as every edit — so the engine, the monitor, learn, and the exporters keep reading the one field they already read, and switching banks changes what a key does because the mirror changes. Learn binds into the active bank. Bank actions: switch (panel chooser), cycle (the target), add (lands on the new bank), remove active (never the last), rename (empty/duplicate names refused).

**3. Key legend.** In the DAVIS → MIDI section (`panels/davis/MidiSection.jsx`), under a new bank bar (native select + rename/add/delete): the active bank's bindings **by key**, in the order a hand meets them (channel, notes before CCs, then number — `legendEntries` in banks.mjs). It re-renders from the active bank, so it follows every switch, whether the switch came from a key or the chooser. A user-voice slot reads as the name of the voice it will actually load; while its shelf slot is empty it shows the slot name, dimmed. No legend renders when the active bank has no bindings.

## Where banks live in the project doc

Same trust boundary as `midiMap`, in `state/projectDocument.js`:

- **Write** (`serializeProject`): a project that never left the single MAIN bank exports *exactly* as before — a `midiMap` field, only when something is mapped, no new keys. A project using banks writes `midiBanks` (the full list) and, only when the active bank is not the first, `midiActiveBank`. The autosave path (full-state serialize) and the export-bundle path (PipelinePanel → DataExportRow → `buildProjectPayload`) both carry the fields; `midiBanks`/`midiActiveBank` were added to the autosave watch list (`state/projectWatch.mjs`), which the projectWatch selfcheck derives and enforces.
- **Read** (`parseProject`, both branches, via one `midiDocFields` helper): a legacy doc's `midiMap` becomes the single MAIN bank; when both shapes are present the bank list wins. The normalized doc carries `midiBanks`, `midiActiveBank`, and `midiMap` = the active bank's map. `applyProject` (globalSlice) installs all three together.
- **Sanitizer rules** (`sanitizeMidiBanks`): at most 8 banks; names trimmed, whitespace-collapsed, capped at 24 chars; empty names take a positional name (`MAIN`, `BANK 2`, …); duplicate names are dropped whole (first wins); junk entries skipped; every map passes `sanitizeMidiMap`. Sanitizing is a fixed point — the project-document fuzz suite (400 mutated docs) passes with banks in the field set.

## MAX_BINDINGS: 64 → 128

The old cap (64) predates pickers: the registry held 15 targets. It now holds **69** — 15 original (6 actions/holds + 3 feels + 5 slider CCs + evolve interval) + 37 palettes + 4 flagship voices + 12 user-voice slots + 1 bank switch. One binding per target means a single bank can legitimately hold 69 bindings; a cap below that would silently drop learned bindings at save time. 128 covers the whole registry in one bank with headroom for registry growth. The cap is per bank (it lives in `sanitizeMidiMap`); the bank count is capped separately at 8. A selfcheck binds all 69 targets into one map and asserts every one survives the sanitizer.

## Design-system citations

- **Rule 2 (discrete → TE):** the legend is a countable signal — flat rows, key digits, target labels; no breath, no shimmer.
- **Rule 3 (honest signals):** the legend reads the live active-bank map, nothing cached; a filled voice slot shows the real voice name it will load.
- **Rule 4 (silence is default):** no legend at all when the active bank binds nothing; an empty slot key loads nothing and says so by dimming, not by dressing up.
- **Rule 8 (deadpan copy) + §5 casing:** section copy stays terse (`bank`, `keys · <NAME>`); palette and voice names render as authored (proper names).

## Verification

- `npm run build` — green.
- `src/midi/midi.selfcheck.mjs` — green, extended: registry counts (69; every palette/flagship/slot present), the all-targets-in-one-bank cap test, dispatch of a palette pick, a flagship pick, slot resolution (earned voices skipped, empty slot silent), BANK NEXT dispatch, picker learn claims, bank round-trip through serialize/parse (incl. banks-win-over-legacy and the legacy byte-shape), and the store's bank actions end to end (bind per bank, switch changes the mirror, cycle wraps, rename/remove rules, banked applyProject).
- `src/midi/banks.selfcheck.mjs` — **new suite**, registered in `app/selfcheck.manifest`: name rules, the sanitizer battery (duplicates, junk, positional naming, 8-bank cap, hostile maps, fixed point), active-index clamping, pure bank edits, legend ordering/labels.
- Project-doc family — green: `projectDocument.selfcheck`, `projectDocument.fuzz.selfcheck` (fixed point holds with the new fields), `projectWatch.selfcheck` (watch list derivation passes with the two new keys), `bundleParts.selfcheck`.
- Gates, because the change reaches the project document: `replayGate`, `creatureGate`, `wingWarp` selfchecks — all green, **unmoved**. No fixture was re-recorded, no golden re-pinned, no assertion weakened; `git diff` touches no fixture or golden file.
- Full manifest sweep (each command run individually, ~494 commands): everything green except the standing sandbox baseline (swarmWasm exit 1; rollSafety / composite / accum / patternRender in the 124 timeout class — all pre-adjudicated on main, none touched by this change). One real catch along the way: the sweep flagged `styles/selects` — the bank chooser's CSS restyled a `<select>`, which the one-dropdown-style rule (#1033) forbids. The rule is now layout-only (flex/min-width) and the suite passes; the chooser takes the house dropdown style like every other select in the app.

## Decisions taken inside the issue's text (flagged, not hidden)

- **Voice set = 4 flagships + 12 user slots**, per FM1_REPORT §7's VOICE bank ("4 flagship voices, then up to 12 user voices") — the evidence the issue cites. The flagships are retired from the DAVIS tiles picker (#717); these targets don't reopen that surface — a flagship loads through MIDI exactly as it does when an old project names one. Earned voices are not slot targets: they are not on the performer's shelf the slots index.
- **User palettes are not targets.** The registry enumerates the 37 shipped palettes, matching the issue's "43-plus targets" evidence. A palette saved at runtime has a runtime id, like a user voice; slot targets for palettes would be a follow-up if Matt wants them.
- **One cycling switch target**, as the issue words it ("one bank-switch target flips the active bank") — not §7's four dedicated bank-select keys. The issue's own note stands: the FM-1 arrival-day results can still change the key layout.
- **The switch key is an ordinary binding** — it flips the bank only while its own bank is active, so the working setup is BANK NEXT bound in every bank (§7's layout already assumes bank keys are "the same in every bank"). The panel's bank chooser always works regardless.
- **The active bank is saved** (when it isn't the first) so a set reopens on the bank it was saved in.
