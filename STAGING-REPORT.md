# K2 staging report — the fill (#1590)

**Branch:** `ember/1590-keeps-fill` on `ember/1589-keeps-tiers` (K1, tip 00867ba9). LOCAL ONLY — no push, no PR.
**Stack position:** stage 2 of 4 (K1's report is the parent commit's version of this file). K3 #1591 (disk) and K4 #1592 (readouts) are not here.
**Scope:** the Kinetic fill + preferences.json only.

## What shipped

- `curator/shelfFill.mjs` (new) — the pure deal. Davis drafts a pool of 48 (stratified by cast family × origin, novelty-weighted: distance from the current stage); Lois gates on stored verdicts; the anchor tilts consensus; the sway table deals in order. Seeded (mulberry32), replays bit-exactly. No store, no IO, no wall clock.
- `curator/shelfPrefs.mjs` (new) — the preferences contract: shipped defaults (FULL WEIRD), parser with named clamps/corrections, the defaults document text (`DEFAULT_PREFERENCES_TEXT`) for first setup, conflict-copy recognition.
- `loot/shelfPrefsLoad.mjs` (new) — the loot read path: `preferences.json` at the loot root, read on launch + after every rescan (`LootRow`), applied via `setShelfPrefs`; edits land on the NEXT fill, never mid-fill.
- `curator/shelf.mjs` — `fill` history records (+ sanitizer: seed · table label · per-slot rule · undealt rules · notes; torn records drop whole) and the §10 API gains `shelf.fill()` / `shelf.history()`.
- `curator/loisJudge.mjs` — `sanitizeGateVerdict` + `gateMargin` (a passing verdict's smallest gate headroom — what Lois's-choice ranks by).
- `curator/director.js` — `keptAnchor(keeps)`: the fill's tilt reads the kept centroid through the Director, the pull's hosted door (design call 5).
- `curator/taste.js` — `featureProximity`: the shared feature-space cosine (novelty/distance geometry).
- `state/slices/davisSlice.js` — `fillStage` (seed = session seed mixed with the fill counter; stamps dealt keeps; one ledger record; persists all three keys) + `setShelfPrefs` + `gateVerdict` carried by `sanitizeFavorite`.
- `state/history.js` + `state/slices/layoutSlice.js` — `UNDO_KIND_SHELF`: a fill is exactly one undo step (S7); undo/redo restore keeps/stage/history and re-persist their keys.
- `state/actions.js` / `applyAction.js` — `FILL_STAGE`.
- `panels/davis/CandidateTray.jsx` — a mined crown now carries its run's Lois verdict onto the keep (`gateVerdict`), so the gate has verdicts to read.
- `panels/ShelfView.jsx` — the KINETIC control on the shelf ("deal a new stage") + the table in force; the counts line reads the soft bound from the preferences in force.
- `panels/ShelfDevPanel.jsx` (new) + `panels/devTabs.mjs` — DEV → SHELF: table in force, every named correction, the last fill's receipt from the ledger (per-slot rule, undealt rules named, receipt notes). The `devPanel.selfcheck` pin is extended with the #1590 justification (the census/taste precedent).
- Suites: `curator/shelfPrefs.selfcheck.mjs` + `curator/shelfFill.selfcheck.mjs` (new, registered in `app/selfcheck.manifest`).

## Behaviour evidence (measured, from the suites + a probe run)

- **FULL WEIRD distribution:** 60-keep fixture, full stage replaced → dealt exactly consensus 8 · neglected 3 · wild 2 · lois 2 · contrarian 1; stage cost exactly 16/16; pool drafted 48; no keep dealt twice; FULL WEIRD slot count = 8 rule-breaking slots of 16.
- **Rotation across fills (probe, 5 consecutive fills, evolving ledger):** every fill dealt the full 8+3+2+2+1; **49 of 60 distinct keeps reached the stage**; only 2 keeps were staged 3+ times — recency suppression + the neglect boost visibly rotate the deal instead of re-dealing the same faces.
- **Replay:** seed 7 twice from the same ledger state → identical stage, slot for slot and rule for rule; seed 8 → a different deal.
- **Suppression:** keeps staged in the last fill and 2 fills ago (window 2) barred from consensus; staged 3 fills ago eligible again; a keep swapped out 3× barred from consensus *even when a rigged scorer ranks it first* — and still dealt by **neglected** in the same fill (swap history feeds suppression, never the anchor). The chronic suppression is a named receipt line.
- **Dry pool:** with 8 of 10 keeps "recent", neglected/wild lift recency and the receipt names the lift.
- **The gate:** a keep carrying a stored `pass` verdict — rigged to be simultaneously the most neglected and the farthest outlier — appears in **no** slot from any rule; Lois's choice orders judged keeps by margin (0.35 dealt before 0.05).
- **Pin (S1):** the performing keep holds its exact slot (slot 6 of 16); 15 dealt around it; its cost counts toward the budget.
- **Budget:** 30 mined keeps (cost 2 each) → exactly 8 dealt, cost 16/16, the budget stop named in the receipt.
- **Degradation:** 5 keeps → 5 dealt, the four undealt rules NAMED; empty collection and all-gate-failed collection → stage untouched, receipt explains.
- **§7 door (the XGBoost/persona head):** a rigged scorer's top pick takes a consensus slot (scores ORDER); the same scorer ranking the margin-richest keep dead last cannot stop Lois's choice from dealing him; the table's 8 rule-breaking slots deal by their own rules whatever the scorer says. In the store, `fillStage` builds the scorer from the loaded head via `scoreLayout` + `headUsable` (either head kind); with no usable head, consensus falls back to anchor proximity.
- **Store end:** one `fillStage` → stage + stamps + ledger record + all three `kc:` keys persisted; undo stack grows by exactly 1; undo restores stage, stamps, and ledger; redo re-deals identically.

## Preferences clamp cases (measured)

- Missing / empty / unparseable / non-object file → shipped defaults (FULL WEIRD) + one named line ("shipped defaults in force").
- `consensus: 99` → 16 · `lois: -2` → 0 · `recencyWindow: -1` → 0 · `collectionSoftBound: 3` → 16 — every clamp named with its key.
- `consensus: "eight"` → that key's default, named; `recencyWindow: 2.6` → rounds to 3.
- A table summing to 20 → tail-trimmed to 16 (contrarian 5 → 1, named; consensus untouched). Spelling only `wild: 4` (sum 18) keeps wild 4 and trims contrarian 1 → 0 and lois 2 → 1, both named.
- Partial files: unspelled keys take the shipped defaults silently. Unknown keys (incl. K3's `shelf.export`) tolerated, never "corrected".
- `DEFAULT_PREFERENCES_TEXT` parses back to exactly the shipped defaults with zero corrections.
- `preferences (conflicted copy).json` is recognized by name so the loader ignores it — and names it.

## Design calls (flagged)

1. **The Lois gate runs on stored verdicts — the issue's kill-criterion fallback, taken deliberately.** The E4 bake is Node-side machinery (the Resvg rasterizer in `miner.mjs`); keep records carry no baked stats in the browser, so no honest fill-time `judgeRender` exists in-app today, and shipping a freezing fill is explicitly forbidden. The fill therefore gates on verdicts recorded at bake time: mined keeps crowned from a run now carry theirs (`gateVerdict`, sanitized on the record). A keep with no verdict is **unjudged, not failed** — dealable, and every receipt states the gate's evidence ("no stored verdicts on file" for hand/dice keeps today). The law "a gate failure never reaches the stage from any rule" is enforced wherever verdicts exist and is suite-proven. The follow-up that lights the gate up for the whole collection is a crown-time bake for hand keeps (the spec's opportunity O1) — not absorbed into K2 silently.
2. **preferences.json has no write door in this stack.** The loot backend exposes scan/hash/read only. K2 ships the parser, the read path, and the defaults document; a first setup *writing* the file awaits a write verb in the loot lane (K3's disk work is the natural home). Until then: no file → defaults in force, said out loud (shelf line + DEV → SHELF).
3. **The fill's button lives on the shelf.** Spec §3 says "pressing Kinetic with the shelf in focus" — the top-bar KINETIC is the storm generator (#942), a different act; the shelf carries its own KINETIC control, present exactly when the shelf is the surface in focus.
4. **Consensus draws from Davis's draft pool; the rule-breakers draw from the whole gate-passed collection.** The draft is Davis's proposal set (consensus is what the room agrees on); neglect is a collection property — the most-neglected keep may never be drafted, and the table's cure slots must still reach it. The receipt reports the pool size.
5. **The anchor is read through the Director (`keptAnchor`), not by importing the pull.** The `queenDeniability` suite (DS rule 10) allows only the hosted modules to touch the pull; the fill complies — and inherits the pull's own learning set (pattern-layer keeps do not teach the anchor). Novelty/distance geometry uses `featureProximity` from `taste.js`.
6. **The receipt speaks in the instrument's neutral voice** ("anchor: identity / none / live") — the deniability discipline holds on data surfaces too, not just in source.
7. **K1 behaviour otherwise untouched:** crowns/swaps still push no undo (only the fill does, per S7); the soft bound (now a real preference) still deletes nothing — crossing it is named in the dev panel as K3's export trigger, and K3 remains unbuilt.

## Suites

- New: shelfPrefs ✓ (11 blocks) · shelfFill ✓ (12 blocks).
- Neighbours run individually: shelf ✓ · candidateTray ✓ · census ✓ · tasteLedger ✓ · loisJudge ✓ · queenLean ✓ · tasteHead ✓ · curate ✓ · dice ✓ · curatePalette ✓ · undoLayers ✓ · undoSeedOffsets ✓ · devPanel ✓.
- `npm run build` ✓ (after `npm install` in this fresh worktree; the pre-install failure was an unresolved `@tauri-apps/api` import in untouched code resolving through a sibling worktree's modules).
- Full manifest sweep (433 suites): **430 pass.** The 3 exceptions are sandbox-environment failures, each verified base-identical on the untouched K1 branch: swarmWasm (no cargo on PATH), accum (V8 abort, exit 134 on base too), rollSafety (known headless-Chromium non-completion — it hangs rather than fails in this sandbox; CI judges it). One real failure surfaced and was fixed during the sweep: `queenDeniability` caught the fill importing the pull directly — the anchor now reads through the Director (design call 5); the suite passes 6/6 on the final code, and every suite in its neighbourhood passed in the same sweep.

## Next level

When this publishes, the fill is playable end-to-end on defaults alone. The two follow-ups that deepen it, in order: (1) the crown-time bake (O1), so hand keeps carry verdicts and Lois's gate + margins light up across the whole collection; (2) K3's export, which turns the now-real soft-bound preference into the disk release valve. The XGBoost door needs no further code — the first usable head (the #1173 retrain) starts ordering consensus the moment it loads.
