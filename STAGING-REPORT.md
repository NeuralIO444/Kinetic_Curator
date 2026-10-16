# K3 staging report — the disk tier (#1591)

**Branch:** `ember/1591-keeps-disk` on `ember/1590-keeps-fill` (K2, tip 99b41ee3). LOCAL ONLY — no push, no PR.
**Stack position:** stage 3 of 4 (K2's report is the parent commit's version of this file). K4 #1592 (census readouts) is not here.
**Scope:** the disk/export stage only — overflow exports to the loot folder, the write verb, re-import on promotion, disk-aware consumers. Spec: `docs/research/keeps-machinery-spec-2026-10-14.md` §2.3/§5/§6/§10 + issue #1591 + audit S5.

## What shipped

**Overflow exports instead of deleting.** When the in-app collection stands past its soft bound
(the `shelf.collectionSoftBound` preference, 400 shipped), the longest-unstaged keeps export to the
loot folder as `looks/<keep-id>.json` — the keep record verbatim, plus its baked still when one
exists and `shelf.export.includeStills` is on. Export order: never-staged first (oldest kept
leads), then longest since last staged. Never exported: a staged keep, the performing keep, and a
keep staged within the current session ("never exported under the artist"). When fewer keeps are
exportable than the overflow, the shortfall is a named line, not a quiet reach into the protected
set. `shelf.export.onSoftBound: 'off'` disables exports (the overflow is still counted and shown).

**The write verb (K2's flagged gap, the part the issue contract puts in K3).** The loot backends
gained `write()`: native → a new Tauri command `loot_write` (base64 in, temp sibling + rename so a
crash never leaves a torn file; flat exactly-two-segment paths inside the four subfolders only;
symlink subfolders and symlink targets refused; 16 MB cap; registered in `main.rs`, with Rust unit
tests for round-trip / refusals / symlink cases); web → File System Access with a `readwrite`
handle, the same flat rule mirrored. The JS doors validate before invoking (gates, bytes, cap).

**The record has exactly one writable home.** An exported keep's record LEAVES the in-app store
and lives in its file; the store keeps a slim **stub** (listing fields only) in a persisted index
(`kc:keeps-disk:v1`, bound to the loot root; in `BUNDLE_LEFT_OUT` with its reason — machine-local
like the loot index). Disk records actually read this session are held in memory
(`shelfDiskRecords`) — performable, anchor-counted — rebuilt from the files on each scan.
Promoting a disk keep (stage-it, swap-in, or a fill that deals it) re-imports its record in the
same move; the file left behind becomes a **fossil**: the take-in marks it taken and never reads
it into a second record (a later re-export overwrites it whole). Tier stays derived — stage
membership from `keepStage`, location from where the record lives; no record gains a tier field.

**Nothing silently moves.** Every export and import is a shelf-history record (§5) with the
loot-relative path, plus a visible line: the shelf notice on export ("exported to the loot folder
— …" / a batch summary), "back from disk — …" on promotion. A failed write or a read-back that
doesn't verify stops the run with the reason on the shelf line and every un-moved keep still in
the collection (writes are verified by reading the file back before the record moves).

**The anchor names its partiality (audit S5).** Queen's anchor counts disk keeps at full weight
when their records are read. When the folder is away or a file is unread, the fill receipt and the
DEV → SHELF readout name the anchor partial with the unread count
("anchor: partial — N keeps on disk unread; the anchor leans on the rest at full weight"). Taste
training is untouched: it reads the crown/pass ledgers, which span all tiers by construction —
tier is not a training feature because the ledger never knew tiers.

**Surfaces.** ShelfView's collection is one merged listing (in-app · on-disk · folder-away ·
file-gone), searched and sorted by the same reading order; counts show "N on disk"; stub rows
(record not in hand) show their state and disable their actions with the reason. DEV → SHELF
gains a DISK section: tier counts, connected state, the anchor line, export prefs in force, and
the last five moves to/from disk. The loot row reads looks in on scan, folds missing verdicts in
(a file deleted outside the app marks its stub missing and the row says "on disk — file gone"),
and arms an export watch: a crown that crosses the bound exports without waiting for a rescan.

**§10 API.** `curator/shelf` gains `export()` (the pure planner). The fill/swap/stage law now
reads the whole shelf (in-app + disk records) through one merged list.

## Evidence (suites, all headless)

New suites (registered in `app/selfcheck.manifest`):
- `curator/shelfDisk.selfcheck` — export-prefs clamps named ('ask'→'export', folder→'looks',
  'off'), the file contract (round-trip exact for hand + mined shapes; still in/out),
  a no-absolute-path grep over serialized exports (`/Users/`, `/home/`, `/Volumes/`, `C:\`,
  `file://`), planner order + protections + shortfall line, the anchor account, the stub
  sanitizer (id/rel disagreement refused), merged rows in all four locations, ledger records
  (an absolute path in a move record is refused whole), `shelf.export()` identity, and the
  fill receipt's partial-anchor naming.
- `loot/shelfDiskRun.selfcheck` — the real store + glue over a fake folder, scenarios A–H:
  overflow exports longest-unstaged first with files deep-equal to the in-app records, history +
  notice + persisted index; protections (staged / performing / session-staged never move);
  stage-it re-imports with no duplicate and the fossil take-in stays a non-record; a fill deals
  the only keep from disk and imports it under the fill's ledger records (the fill's single undo
  snapshot carries the pre-fill disk tier); folder-away fill names the anchor partial; a deleted
  file marks missing; non-export files in looks/ are held with reasons; a failed write stops
  spoken with nothing moved.
- `loot/lootWrite.selfcheck` — native write (gates, validation before invoke, base64 payload
  exact, dead-IPC refusal) and web write (subfolder creation, flat rule, cap, foreign label
  refusal, byte-exact read-back).

One deliberate pin update: `loot/lootScan.selfcheck` — `looks/*.json` now classifies as a real
look file (K3 is when keeps' looks land); `.kclook` keeps the 'looks not supported yet' pin.

Neighbours run individually (all PASS): shelf, shelfFill, shelfPrefs, candidateTray, bundle,
bundleParts, bundleKeys, census, censusReadout, coverage, tasteLedger, clock.inventory,
devPanel, queenDeniability, favorites, undoLayers, undoSeedOffsets, and the full loot family
(lootScan, lootIndex, lootNative, lootWeb, lootCopy, lootRun, lootIngest, lootPalettes, lootAudio).
`npm run build` PASS.

Full manifest sweep (one sequential run, 436 suites): **433 pass / 3 fail** — the three known
sandbox-only signatures, all verified base-identical in prior stages (K1's sweep: 428/431, K2's:
430/433, same three): `swarmWasm` (the sandbox has no cargo), `clock.evolve-accum` (V8 OOM abort,
exit 134), `rollSafety` (does not complete in the sandbox — browser closes mid-render with no
assertion failing; CI passed it inside lint-build-selfcheck on #1617 and remains its authority).
All three new K3 suites pass inside the sweep; no new failures.

## Design calls flagged

1. **Records leave the store on export** (spec §2.2's "400 records in-app" + S5's partial anchor
   only make sense this way). The in-app collection the bound counts is `state.keeps`; disk
   records in memory are a read cache of the files, never persisted as records.
2. **The fossil rule.** Import never deletes the file. Deleting on import would make an undo of
   an importing fill unrecoverable; leaving it costs nothing — the take-in recognizes an in-app
   keep's file and never double-records it, and re-export overwrites it whole.
3. **`onSoftBound: 'ask'`** shipped as a placeholder value in K2's defaults document; K3's enum
   is `export | off`, and a stored `'ask'` clamps to `'export'` WITH a named line (never a silent
   behaviour change). The shipped defaults text now writes `'export'`. K2's own parser/pins are
   untouched (it ignores the export namespace).
4. **`includeSeeds`** (a K2 defaults-text key) is parsed and tolerated with no effect: under the
   verbatim law the record IS the record — its seed rides because it is part of the keep, not an
   attachment. Named in `shelfDisk.mjs` so the tolerance is a decision.
5. **Export prefs parse separately** (`parseShelfExportPrefs`) rather than widening K2's
   `parseShelfPrefs`: the two parsers share the document, never each other's keys, so K2's
   corrections and suite pins are undisturbed.
6. **A keep file deleted outside the app** keeps its stub (marked missing) and any record
   already read this session stays in hand — a promotion then becomes the only copy, which the
   import line speaks. Nothing is auto-deleted anywhere.
7. **The preferences.json write door — gap named again, narrowed.** K2 flagged that
   preferences.json could not be written (the loot backend had scan/hash/read only). The write
   verb now EXISTS and is used for `looks/` exports, but writing the shipped defaults document
   into a fresh loot folder on first setup is still NOT wired: it is one call site away, and the
   issue contract does not put it in K3. `loot/shelfPrefsLoad.mjs` says so in its header.
8. **Rust is uncompiled in the sandbox** (no cargo here): `loot_write` + `resolve_write` +
   `write_b64` and their unit tests are written to the existing loot.rs patterns, but their first
   compile is CI's cargo-check. The JS side is fully suite-verified.
9. **Stills are honestly zero today**: no keep record carries a baked still (the crown-time
   bake is spec opportunity O1, unbuilt), so exports today are the record alone; the
   includeStills path is forward-compatible and suite-pinned with a synthetic still field.

## Not in K3 (scope discipline)

No census readouts (K4 #1592). No changes to the stage budget, the fill's table, or FULL WEIRD
scoring — disk keeps enter the deal as records, unscored slots stay unscored. No preferences
defaults-document write (call 7). No `.kclook` support.
