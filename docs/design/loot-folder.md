# Loot folder (#1479): research and build plan

**Status:** plan, 2026-10-14. Slice 1 (the pure scan) built; the rest not started. Written from a read-only pass over `app/` and `src-tauri/`; the five claims the plan stands on (premises 1 to 5 below) were re-checked against the code by hand. Matt orders every slice; nothing here is assigned.

## Premises in the issue that are wrong or missing

1. **PNG/JPG cannot become `user:` assets today.** The `user:` pool is SVG-only: `ingestSvg` rejects any `<image>` (`src/assets/ingest.js:179,191`, "Embedded raster images aren't supported"), the file inputs accept `.svg` only (`src/panels/AssetPoolPanel.jsx:115,121`), and the size cap is 48 KB. Region mattes are detected by rasterising the SVG (`src/assets/regionRaster.js`). There is no raster asset type anywhere in the engine.
2. **The pool holds 32 assets.** `OVERLAY_CAP = 32` (`src/assets/overlay.js:5`). A loot folder of hundreds of images cannot "be assets" without redesigning that cap.
3. **There is no Look format, library or importer in the code.** `kc-look/1` exists only in the gated draft `docs/DLC_PRESET_TYPES.md`; no file under `src/` mentions it. As specced a Look is `{mode, layoutParams, paletteId, seed?}` and references no assets, so "a Look that uses missing loot" has nothing to refer to today.
4. **There is no audio library.** STIMULI has one `audioSource` and one stashed `audioLastFile`, both blob URLs (`src/state/slices/audioSlice.js`). A picker lists nothing.
5. **`isDesktop()` is probably wrong under Tauri 1.8 (inferred).** `mindApple.js:10`, `stageWindow.js:9` and `tasteLedger.js:141` test `window.__TAURI_INTERNALS__ || window.__TAURI__`. `__TAURI_INTERNALS__` is a Tauri v2 global; `__TAURI__` exists in v1 only with `withGlobalTauri`, which `tauri.conf.json` does not set. The shell is Tauri 1.8.3. If this is wrong, STAGE and MIND already misreport; confirm on the Mac before relying on it.

## What exists and is reusable

| Area | What exists | Reusable? |
|---|---|---|
| Import path | `<input>` in `AssetPoolPanel.jsx` -> `Events.ASSETS_INGEST` -> `INGEST_ASSET` -> `globalSlice.ingestAsset` -> `overlay.js ingestIntoOverlay` -> `ingest.js ingestSvg` | Yes: call it with a `loot` source |
| Trust boundary | `sanitizeOverlay` whitelists fields; `ingestSvg` checks size, hostile markup, nesting, allowed tags, no remote href | Yes. Note it **strips** unknown fields, so path/hash cannot ride on the asset |
| Region mattes | `queueRegionDetect` is called from `ingestAsset`; DOM canvas, async | Yes, automatic |
| Reject with reason | one `ingestError` string; `{error, hint}` per rejection; the bundle importer builds a "Skipped, unreadable" summary (`state/bundle.js`) | Pattern only: no ingest log exists |
| Palettes | `paletteLibrarySlice`, key `kc:user-palettes:v1`, `sanitizePalette`, `importUserPalettes` dedupes by id | Yes; bytes are cheap, so path references work |
| Audio | file input -> `URL.createObjectURL` -> `Events.AUDIO_SOURCE {type:'file'}`; sidecar #618 picked manually | Partly: read bytes, make a blob, emit the same event; match sidecar by stem |
| Provenance | none | New per-device index |
| Missing | `customAssets` embed full SVG in the project, so a project never loses bytes; the nearest message pattern is `missingPaletteMessage` (`pipelineNotices.mjs`) | Reuse the message pattern |
| Tauri | `fs.all` with scope including `**`; so `readDir`, `readBinaryFile`, `stat` already work on any path. **No `dialog` capability** in the allowlist or `Cargo.toml` | Folder picker needs the dialog feature; see Security |
| Settings | app prefs live in `kc:*` localStorage keys; `bundle.js` classifies each as in-bundle or `BUNDLE_LEFT_OUT`, and `bundleKeys.selfcheck` fails on an unclassified key | Add the loot key to `BUNDLE_LEFT_OUT` |
| PIPELINE | `StageBlock.jsx` shows `desktop only` text instead of a dead button; DS: JSX strings lowercase, casing in CSS | Reuse |

## Proposed design

**Scope decision.** Do not stretch the 32-slot pool or invent raster assets inside this issue. v1 is **SVG images, palettes and audio**. PNG/JPG are listed in the log as `skipped: raster not supported` until a raster path is ordered.

**Per-device index** in `kc:loot:v1` (never in a project, bundle or share URL; add to `BUNDLE_LEFT_OUT`):

```
{ v:1, root:"/Users/.../Loot",
  items:{ "<hash16>": { id:"user:loot_<slug>_<hash6>", kind:"image|audio|palette",
          rel:"images/a/b.svg", size, mtimeMs, hash:"<sha256>", state:"ok|missing", seenAt } },
  log:[ { rel, kind, outcome:"added|dup|skipped|missing|changed", reason } ] }   // capped 200
```

- **Identity is the content hash**, not the path: a rename keeps the item and updates `rel`; a copy dedupes.
- **Provenance lives in this index only.** Do not add `path` or `hash` to `sanitizeOverlay`: they would travel in project files and share links and leak the machine's username.
- **MISSING is `state:'missing'`.** The asset stays usable (its SVG is embedded in the project); the row and pool tile say "source missing: images/x.svg". Nothing is deleted.

**Modules (new).** `src/loot/lootScan.mjs` (pure planner over a fake filesystem), `lootClassify.mjs` (pure: subfolder + extension -> kind; case-insensitive, POSIX rel paths, ignores dotfiles, `.icloud` stubs and conflict names), `lootIndex.mjs` (pure reducers, load/save in try/catch), `lootNative.js` (thin lazy `invoke`, `{ok:false, reason}` on web), `panels/pipeline/LootRow.jsx` + `lootCopy.mjs`, and `src-tauri/src/loot.rs` (`loot_scan`, `loot_hash`, `loot_read`).

**Scan.** Rust canonicalises the root and walks only `images/`, `audio/`, `palettes/`, `looks/`; does not follow symlinks (a path that leaves the root is `skipped: outside folder`); returns `{rel,size,mtimeMs}`. JS diffs against the index and hashes only new or size/mtime-changed files (streamed in Rust, never in the webview). Files are applied one at a time; a throw becomes a log row and the loop continues. A file whose mtime is under 2 s old is `still changing`. An unreadable root marks nothing missing ("folder not reachable").

**Call chain (images).** "point at folder..." -> native folder dialog -> root saved -> `loot_scan` -> `planScan` -> per new SVG `loot_read` -> `emit(ASSETS_INGEST, {svg, hint, source:'loot'})` -> `ingestIntoOverlay` -> `queueRegionDetect` -> asset in the pool (disabled until enabled). Not LIVE until this chain is driven in the running desktop app.

**Security.** `fs.all` with scope `**` and `csp: null` is already a standing grant: any script injection can read the disk. A loot folder does not widen it. Keep the Rust commands root-bound (canonicalise, reject `..` and symlink escape, cap a read at 64 MB). Tightening the fs scope to `$APPDATA` plus the loot root is a separate PR and a separate decision.

## Build slices (one PR each)

| # | PR | Acceptance | Visible |
|---|---|---|---|
| 1 | Pure scan/classify/dedupe/missing | fake FS: rename keeps id, copy dedupes, removal -> missing, `.icloud`/conflict/dotfiles skipped, 5,000 entries under 200 ms, case collision flagged, non-UTF-8 name becomes a log row | no |
| 2 | Index store + log + copy | hostile stored JSON sanitises; log capped; `bundleKeys` stays green; root never in `buildProjectPayload` | no |
| 3 | Rust commands | `cargo test`: symlink escape skipped, known hash vector, 64 MB cap, unreadable dir errors not panics | no |
| 4 | Desktop detect fix + JS wrapper | stubbed globals unit test; verified once by hand on the Mac | no |
| 5 | LootRow: pick + scan + log, nothing ingested | web: disabled with `desktop only`; desktop: path and counts | **yes** |
| 6 | Images -> `user:` (SVG) | good SVG lands with regions; hostile, over-48 KB and `<image>` land as log rows; the 33rd reports "overlay full" | **yes** |
| 7 | Palettes | bad JSON logged; duplicate id merges | **yes** |
| 8 | Audio list in STIMULI | chain proof: audio plays; unmatched sidecar noted | **yes** |
| 9 | Missing honesty | delete a file, Rescan: item `missing`, asset still plays | **yes** |
| 10 | Looks | blocked on the `kc-look/1` types PR | n/a |

## Decisions (Matt, 2026-10-14)

All six questions answered; recorded on #1479.

1. **Raster:** SVG only for now. PNG/JPG (and GIF/WebP) are recognised and logged "raster not supported yet", never dropped silently.
2. **The 32-asset cap:** index every loot item; the first 32 land in the pool, the rest are marked "pool full" until a slot frees. No engine change.
3. **Looks:** **the whole DLC Look phase is pulled forward** (`kc-look/1` types, the pack loader, the Library, 16 Look slots; see `docs/DLC_PRESET_TYPES.md` phases 1 to 3). This re-orders it out of the deferred pile. Build order: loot images, audio and palettes first (slices 1 to 9); then the Look phase as its own PRs; then `looks/` in the loot folder (slice 10). Until then a Look file is recognised and logged "looks not supported yet".
4. **Provenance:** per-device index only; path and hash never ride in a project or share link.
5. **Distribution:** direct download, no sandbox, so no security-scoped bookmarks. The folder access stays behind one small module so a bookmark layer could slot in.
6. **Desktop check:** Matt will confirm on the Mac whether STAGE and MIND report correctly. The `isDesktop` fix is its own PR (slice 4) with a stubbed-globals unit test, and the loot row stays disabled-with-reason until he has confirmed it once.

One PR at a time, each stopped for review.

### Notes from building slice 1

- A name like `wing 2.svg` or `wing copy.svg` is the artist's own and is **not** skipped; a Finder duplicate carries identical bytes, so the content hash already dedupes it. Only an explicit sync-conflict marker ("conflicted copy") is skipped, and logged.
- An entry with no usable path is logged ("unsafe or unreadable name"), never lost.
- A file modified in the last 2 s is skipped this scan ("still changing") and picked up on the next.
- "Missing" is only decided for a folder that could be listed, and only once every hash is in, so a rename is never reported as a disappearance.

## What would make this fail in practice

1. **Asset model mismatch:** the folder promises PNG/JPG and hundreds of items; the pool takes small SVGs and 32. Contained by slices 1 and 2 being independent of the pool, a log that says exactly why each file was skipped, and Q1/Q2 decided before slice 6.
2. **Desktop detection and IPC unproven:** the row could show disabled on the real app, or the dialog could throw. Contained by slice 4 being its own PR with a manual Mac check, slice 5 ingesting nothing, and nothing being called LIVE until the chain is run in the app.
3. **Scan stalls or lies:** huge files, an unmounted volume, iCloud placeholders, a file mid-copy. Contained by streaming and capped reads in Rust, the 2-second settle rule, and "folder not reachable" changing nothing.
