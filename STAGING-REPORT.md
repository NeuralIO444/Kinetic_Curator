# STAGING REPORT — Keeps K1 (#1589): tiers + migration

**Branch:** `ember/1589-keeps-tiers` on `origin/main` f6cb8a15 · **LOCAL ONLY** — no push, no PR.
**Stack position:** stage 1 of 4 (K2 #1590 fill, K3 #1591 disk, K4 #1592 readouts build on this branch in later dispatches; none of their scope is here).

## What K1 delivers

- **Two-tier store.** The keep record lives once, in the Collection (`kc:keeps:v1`, now **uncapped**). The Stage is an ordered list of keep ids (`kc:keeps-stage:v1`) — membership, not a copy. A keep's tier is **derived** from stage membership, never stored on the record.
- **The silent eviction is dead.** `readKeeps` no longer slices to `KEEPS_MAX` (constant removed); `importShelf` no longer caps keeps. The E3 tray refusal copy (`SHELF_FULL_COPY`, "shelf full — free one first") is removed from the tray, the gate, and the store.
- **Crown routing for ALL crowns** (spec §4): stage has room → the keep takes a slot (appended; menu order = arrival order, stamped `stagedCount`/`lastStagedAt`). Stage full → the keep lands in the Collection and the surface speaks `on the shelf — swap it in` (store `shelfNotice`; the tray predicts the same landing via `crownGate` over the stage's records, so the line and the routing can never disagree).
- **Migration.** First read with no `kc:keeps-stage:v1` key derives the stage once and persists it; from then on the stored list is law (sanitized on read: strings only, deduped, must name real keeps, budget repaired oldest-first). A stored `[]` is respected — migration never re-runs.
- **Hand-swap + promote in-app.** `ShelfView` (mounted in `AssetPoolPanel`): stage strip of 16 slots with aim-a-slot, search (label/family/palette/origin/mode/seed/corner) + kept/staged/never sorts, collection rows with swap-in / stage-it / load, counts line, soft-bound note. Actions `SWAP_STAGE_SLOT` / `STAGE_KEEP` ride the bus like every store door.
- **Shelf history staging area for K2.** `kc:keeps-history:v1` (cap 1,000) records crown + swap events in the spec §5 flat shapes. The key is deliberately **left out of project bundles** (`BUNDLE_LEFT_OUT` with a reason, per the bundleKeys suite's law): history is this machine's diary, not project data.
- **The favorites rider speaks.** The favorites cap still trims (favorites are setlist copies, not keeps), but the trim now lands in `shelfNotice` ("favorites full — the oldest favorite was let go") instead of vanishing silently.

## Design decisions (the judgement calls, on the record)

1. **The stage budget is 16 slot-cost units, not 16 keeps.** Hand keep = 1, mined keep = 2 — the E3 accounting folded into the stage, per the ruling note's "folds into the stage budget." Scarcity lives on the stage; the Collection is unbounded. Migration consequence: newest-first admission under the budget; for an all-hand shelf this is exactly "the 16 most recently kept," matching the issue's acceptance wording.
2. **Swaps may not overfill the budget** (`that swap overfills the stage`). The stage list is persisted as-is, and the read-path sanitizer trims oldest-first to validity — so a swap that broke the budget would be silently undone on the next reload. Refusing out loud at swap time is the honest version of the same law.
3. **The performing Look is pinned** (audit S1). `performingKeepId` (session-only state) is set when a recall/morph resolves to a keep — directly by id, or via its seed+keptAt/timestamp twin for favorites. `swapSlots` refuses to swap the pinned slot out: `that look is on the deck — swap another slot`.
4. **Swap stamps:** `lastStagedAt` on BOTH records (both changed stage relationship), `stagedCount` only on the incoming keep (spec §3.6). First staging via a crown stamps the same way.
5. **Collection soft bound (400) is a named constant only in K1** (`COLLECTION_SOFT_BOUND`). Keeps land past it; nothing triggers. It becomes a loot `preferences.json` value in K2 and an export trigger in K3 — the issue contract puts the preference itself in K2, so K1 names it and the shelf view reports the crossing honestly.
6. **`crownGate` is a predictor now, not a gate.** It takes the stage's records and answers whether a crown takes a slot; a not-ok answer stops nothing. The tray and the store read the same arithmetic (`stageFits`/`routeCrown` in `shelf.mjs`).

## Migration evidence (shelf.selfcheck, real record shapes)

- **200-record fixture** (hand + mined + legacy no-provenance + ISO timestamps, i.e. a store at the old cap): migration is **lossless — all 200 ids and record content intact**; stage derived once, persisted, and **swap-stable across reloads** (a post-migration swap survives a re-read; the derivation never re-runs).
- **Crowns past 200:** with 200 keeps already stored, further crowns all land (collection), each speaks the line, the existing 200-prefix is byte-intact, and history records the landing tier. Queen centroid input only grows.
- **Mined crown at 15/16 stage slots:** lands in the Collection with the line — the tray refusal is dead for mined crowns too, not just hand crowns.
- **Import of 250 keeps:** lands whole (250/250); the stage re-derives against the imported collection.
- **End-to-end in candidateTray.selfcheck:** mined crown through `KEEP_ADD` takes a stage slot at cost 2 with provenance on the record AND the ledger line; at a full stage the same crown lands in the Collection (stage list deep-equal untouched, oldest keep standing, ledger +1, `shelfNotice` = the line).

## Files

- NEW `app/src/curator/shelf.mjs` — tiers, budget, routing, migration derivation, stage sanitizer, swap law, §5 history shapes, shelf view rows. Pure (no store/DOM/clock).
- NEW `app/src/curator/shelf.selfcheck.mjs` — registered in `app/selfcheck.manifest`.
- NEW `app/src/panels/ShelfView.jsx` (+ CSS in `app/src/styles/panels.css`), mounted in `AssetPoolPanel.jsx`.
- `app/src/state/slices/davisSlice.js` — stage key + read/migrate, crown routing in `addKeep`/`addFavorite`, swap/stage actions, speaking favorites trim, performing pin, whole-collection import; `sanitizeFavorite` carries `stagedCount`/`lastStagedAt` when real.
- `app/src/curator/candidateTray.mjs` — gate reframed as stage predictor; refusal copy deleted.
- `app/src/panels/davis/CandidateTray.jsx` — crown always emits; predicts the landing and speaks the shelf line.
- `app/src/state/actions.js` / `applyAction.js` — `SWAP_STAGE_SLOT`, `STAGE_KEEP`.
- `app/src/state/bundle.js` — stage key joins the keeps bundle part; history key left out with a reason.
- Suites updated to the K1 contract: `candidateTray.selfcheck` (refusal block → collection-landing block), `variants.selfcheck` (crown gate over stage records), `bundleParts.selfcheck` (import: favorites cap, keeps whole), `clock.inventory.selfcheck` (#1589 justification added to the davisSlice wall-clock allow-list — the shelf stamps are the keptAt metadata class; the suite's own extension point, #1390 precedent).

## Verification

- `npm run build` — green.
- Suites run and green: shelf, candidateTray, variants, favorites, bundle, bundleParts, bundleKeys, bundleFile, census, censusReadout, coverage, tasteLedger, clock.inventory, plus every other store-importing suite (busChain, curate, hitBands, loisActivity, refineColor, audioRoutes, evolveProgress, feels, regionAssignment, assetAttach, mathRandomGuard, audioSidecar, clock.evolve, kineme, routesStartEmpty, midi, patternRoll, audioRig, euclid, hitsClear, recipeStack, watchdog, writePathHonesty).
- Full manifest sweep (431 command lines, run sequentially in this sandbox, no concurrent sweeps): **428 pass, 3 fail** — and all 3 failures are the known sandbox base-identical signatures, none touching keeps/shelf code: `swarmWasm` (build-wasm.sh cannot run — no cargo in the sandbox), `accum` (V8 OOM), `rollSafety` (headless-Chromium page closed mid-render in the GL parity driver). `vortex` and `livingMotion`, the other known sandbox intermittents, passed this run.

## Deliberately NOT here (later stack stages)

- **K2 #1590:** the Kinetic fill (trio + sway table, FULL WEIRD), `preferences.json` (incl. the soft bound becoming a setting), the fill's history verbs.
- **K3 #1591:** disk export of the Collection to the loot folder, disk as a third location, export-on-bound-crossing.
- **K4 #1592:** census readouts over the tiers (the `shelfRows` view model is the seam; no readout surfaces built here).

No push, no PR, no merge — local staging per the stack rule. Publish is the coordinator's call when K1's turn comes.
