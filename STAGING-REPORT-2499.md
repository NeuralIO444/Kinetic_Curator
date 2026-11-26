# STAGING REPORT — #2499 (Stress 2026-11-24 A22)

**Issue (verbatim title):** "Stress 2026-11-24 A22: SHELF fill receipt and KEEPS SHELF list contain the same keep three times"
**Filed observation:** the last fill receipt's slots 4, 5, 6 are all "stratified · persona-davis · seed 4140623821"; the same keep also appears three times in the KEEPS SHELF collection list.
**Branch:** feat/2499-a22, base d605f92a. Local commits only — no push, no PR.

## Verdict: shape (c) — lawful duplicates; the defect is presentation

The store holds **three real records**, not one keep rendered thrice and not one act banked three times. Each record is a separate deliberate keep act on the same plate, with its own id and its own kept instant. Both surfaces render the store faithfully — what they fail to do is show the one field that tells the three keeps apart: **the kept moment**. The list demoted it to a calendar date; the receipt omitted it entirely. That indistinguishability is the fixable defect, and it is what this build fixes.

### Why not (a) — no write-path dedupe

- A keep's identity in every law in the codebase is its **record id** (minted fresh per act via `genId()`): stage membership, swaps, export, the ledger all key on id. Content (seed + config) is the *plate*, not the keep — `performingIdFor` even matches a favorite to its implied-keep twin by "same seed, same keptAt, different ids", i.e. the code already treats same-plate records as distinct records of one plate.
- Every keep door emits **exactly one record per act**: the F (favorite + implied keep) and J (keep) hotkeys in App.jsx, the dice crown (`useDiceRoll`), the CandidateTray crown (which additionally guards re-crowning the same card: `if (verdicts[card.key]) return`), the MIDI pad door. No loop, effect, or batch path banks multiples.
- The crown append is unconditional **by design** (K1 foundation law, `crownIntoShelf` / shelf.mjs header: a crown is never refused and never evicts; NOTHING IS EVER SILENTLY LOST). Merging a repeat keep at the write path would silently destroy the record of a separate deliberate act and contradict that law. Whether repeating a keep *should* merge is a design question for Matt — it is not an established semantic the code anywhere states, so this build does not invent it.
- Nothing retroactive follows: already-banked same-plate keeps stay as they are (they are distinct acts' records). They become distinguishable the moment this ships, because `keptAt` was always on the record.

### Why not (b) — no surface double-renders

- The deal (`dealFill`) dedupes by id (`dealtIds` guard in `take()`), and the receipt renders the fill history record's slots 1:1 — one keep id can never occupy two slots.
- The list renders `shelfRows` over the collection array 1:1. Three rows = three records.

## Mechanism — reproduced through the real store path

Probe (throwaway, since removed): booted the real store headlessly, captured the filed plate the way the J key builds it (`captureFavorite` over live state: seed 4140623821, mode stratified, palette persona-davis), pressed keep three times, added two filler keeps, then `fillStage()`. Measured:

- **Store:** 5 keeps total; **3 records** carry seed 4140623821 — **3 distinct ids, 3 distinct keptAt** (one per act).
- **Receipt:** all 5 keeps dealt; the filed label appears in **3 consecutive slots**, backed by the 3 distinct keep ids.
- **List:** **3 rows** for the plate; identity + caption **byte-identical** on the pre-fix format (`stratified · persona-davis | seed …3821 · kept 11/24/2026 · staged ×2`, ×3) — the filed symptom, reproduced exactly.

## The fix (presentation only — no store, deal, or record changes)

- `app/src/panels/shelfView.mjs`: new `keptCaption(keptAt)` — the kept segment now carries **date + time of day** (`kept 11/24/2026 6:14:03 PM`); `rowMeta` uses it. A stamp-less keep still reads `kept (legacy)` — absent stays absent.
- `app/src/panels/ShelfDevPanel.jsx`: the fill receipt's keep cell appends the same kept moment (` · kept …`, via a `keptOf` helper beside the existing `labelOf`), in the timestamp form the panel already prints for its own records.
- Noted, **not** fixed (outside the issue's named surfaces): the stage strip's cells (`stageCells`) show mode · palette only, so two same-plate keeps on stage are likewise indistinguishable there. Matt's call whether to extend the same treatment.

## Pin

`app/src/curator/shelfSamePlate.selfcheck.mjs` (manifest-registered after shelfFill). Five groups: store law (3 acts → 3 records / 3 ids / 3 instants, counts in the messages), deal law (each id dealt at most once; the 3 same-label slots are 3 distinct ids), list distinction (the 3 rendered rows pairwise distinct), receipt distinction (the 3 receipt cells pairwise distinct + the panel source wires the kept moment in), legacy honesty (`kept (legacy)` preserved).

**Discrimination (demonstrated in a scratch worktree at pristine base d605f92a, node_modules installed, pin only, then removed):** the store and deal groups PASS on base — the store was never broken — and the pin then FAILS for the filed reason, verbatim:

> AssertionError: distinct rendered rows for the three same-plate keeps: **1 of 3** — rows: `stratified · persona-davis | seed …3821 · kept 11/24/2026 · staged ×2` (×3 identical)

On this branch: **PASS**, all five groups.

## Verification

- Pin: PASS (above). Neighbours, all PASS: shelfView, shelf, shelfFill, shelfCensus, shelfDisk, shelfDiskRun, callsignSweep, chiaroscuro (source-pins an import from the touched module), uiRegistry.
- `npm run format:check`: clean. `npm run lint`: 0 errors, 11 warnings — identical count on pristine base (pre-existing react-hooks warnings in untouched files). `npm run build`: ✓ built in 4.01s.
- One-writer files untouched (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js`). No production store/deal code changed — two presentation files, one pin, one manifest line.
- `npm install` was run in app/ first (the worktree shipped without node_modules); the resulting one-line package-lock churn was reverted as install noise.

## Lane recommendation

**Review lane.** The store/deal verdict is evidence, but the fix changes performer-visible text: every shelf row's kept caption gains a time of day, and the receipt cell grows a kept-moment suffix. Small and honest, but it is a visible change to a surface Matt reads — his eyes, his merge. Review this: open P02 → KEEPS SHELF, keep the same plate twice, and confirm the two rows now read as two acts (different kept times); DEV → SHELF after a fill shows the same distinction in the receipt.
