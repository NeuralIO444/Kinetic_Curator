# Pipeline panel redesign — research + planning pass (2026-10-08)

## Design direction (Matt)

Capture-first reorder of the PipelinePanel (P05) with the KC-1 design system:

- **RENDER STILL** hero button first (renamed from RENDER FINAL / RENDER ACCUM).
- **RENDER MOVIE** second — WebM export with loop-seconds as an amber stepper value.
- Resolution as a 1X/2X/4X button matrix instead of a dropdown.
- **IMPORT / EXPORT** as two buttons sharing one JSON envelope file
  (project, hits, keeps/taste, palettes — the system routes each section).
- Read-only diagnostics + dev tools at the bottom, behind a DEV disclosure.
- Mockup: `docs/mockups/pipeline-panel-mockup.html`.

## 1. Inventory: everything the current panel does

**Capture**
- RENDER FINAL / RENDER ACCUM hero button — full-res final still at 1x/2x/4x
  (dropdown today); label flips with ACCUM state; failures surface as an error
  line, not silence.
- SNAP — quick still into the gallery, carrying seed offsets, layer stack, and
  recipe so it's restorable.
- REC WEBM — freeform start/stop recorder, 15fps WebM of the live canvas.
- CAPTURE LOOP — fixed-length take → seamless looping WebM with 1s tail→head
  dissolve; shows LEAD-IN / TAKE / DISSOLVE progress, cancellable.
- BATCH — renders N stills across advancing seeds (count input, default 8);
  pauses evolve/drift for the run; watchdog cancels mid-batch; each still lands
  in the gallery tagged BATCH n/N; refuses to start on a paused loop or with
  ACCUM on.
- HEVC box — RECORD HEVC VIDEO (60-frame .mov via Tauri media engine) +
  DUMP BATCH (60 PNGs pinned to E-cores); live progress bar. Desktop/Tauri only.

**Project / files (DataExportRow)**
- Project export / import — full project JSON (hotkey X); import has a confirm
  dialog (export-current-first / proceed / cancel), dirty tracking
  ("Export is behind the live piece"), recent-files list.
- Palette export / import — palette-library-only JSON exchange.
- HITS export — favorites + keeps + project envelope → `studio/hits_bridge.py`,
  the MLX training feed.
- Bundle export / import — **already the one-file idea**: project, palettes,
  voices, favorites, keeps, taste, biology policy, canvas presets in one JSON;
  import replaces with confirm.
- Taste import / clear — loads studio-produced taste.json; plus
  experimental-taste toggle (#762).
- Status lines: taste status, Lois boldness, retrain nudge, loaded-file name.

**RecipeRow**
- Copy share-link for the current scene; paste box accepting recipe text or a
  recipe link → APPLY restores the exact scene.

**Setup**
- SetupBlock — canvas preset picker (built-in + saved "Mine"), custom W/H with
  lock/swap, capture timestep, save/rename/delete wall presets, LED wall
  (cabinets × pixels, writes native raster).
- DisplayBlock — FXAA and weave output toggles.
- StageBlock — stage mode, display refresh rate, match-display raster, stage
  mapping, test pattern, blackout, Syphon server (desktop only).

**Diagnostics / dev**
- One status message line; snapshot gallery (clear with confirm, per-snap
  recipe copy-to-clipboard, empty-state hint).
- Dev trio, Tauri-only: TEST NATIVE DISK I/O, Metal init/step (device stats,
  dispatch ms), curator ANE eval (frame score + latency).

## 2. Gap analysis vs the mockup

**Covered** — RENDER STILL hero + 1X/2X/4X matrix (pure restyle of the same
store state); RENDER MOVIE + loop-seconds amber value (LoopCaptureBlock); SNAP,
BATCH + count, PRINT, HEVC, EXPORT/IMPORT, canvas step, FXAA, weave, stage
raster, log, gallery thumbs, DEV disclosure.

**Partially covered** — ACCUM chip is correctly read-only (BUILD owns that
toggle). "Stage raster 1440×900" read-only is fine, but StageBlock's live
controls need a home below.

**Dropped — needs decisions**
- REC WEBM freeform toggle has no home; the mockup's RENDER MOVIE is the
  fixed-length loop only. Two different tools — merge or keep both?
- HITS export: the bundle has **no hits part** (parts are project, palettes,
  voices, favorites, keeps, taste, biology, canvas presets). Matt's call
  (2026-10-08): add a readable `hits` section to the one file — no separate
  HITS file. The MLX training feed keeps its input.
- Taste import: a raw taste.json fails the bundle's kind check, so IMPORT must
  sniff file kind (bundle vs project vs taste.json vs palettes vs hits) and
  route to the existing parsers. The studio taste path (#1173) depends on this.
- Palette import *merges* while bundle import *replaces* — different semantics
  worth preserving.
- Recipe link copy/paste flow (text sharing, not files) has no home; gallery's
  per-snap recipe copy only covers snapshots.
- SetupBlock extras: wall preset save/rename/delete, LED cabinet config —
  configure-rarely, demote don't drop.
- StageBlock live controls: blackout and test pattern are performance tools;
  keep them reachable even demoted.
- E-core PNG dump: the mockup shows one HEVC button; the stills-dump path
  needs a second action.
- Hints with no home: "Export is behind the live piece" dirty tracking, recent
  files, taste/Lois status lines, batch's refusal reason (why it won't start).
- Hotkey X must stay wired to the new EXPORT.

## 3. Risks

- The bundle is already the one-file design — EXPORT/IMPORT can literally be
  the bundle buttons renamed. Real work is only: add a `hits` part (bundle
  version bump; old bundles still parse since parts are optional) and make
  IMPORT sniff file kind and route to the existing parsers.
- State ownership is safe if untouched: `accumOn` derives from `layoutParams`
  (BUILD owns it — chip stays read-only); `rendering` is store-backed so the
  App hotkey map can debounce N/E mid-render — every block must keep reading
  the shared flag, no local copies.
- `batchProgress` + `cancelBatchRef` must stay in PipelinePanel — the
  watchdog-trip effect outside the children flips them. Don't let the reorder
  push them into BatchEditionBlock.
- Three movie paths exist (REC WEBM toggle, loop-capture WebM, Tauri HEVC).
  Collapsing to "render movie" is right, but don't strand the quick-toggle or
  the desktop HEVC quality path.
- Print desk: **CUT** per Matt (2026-10-08) — see #1213. It drops out of the
  demoted-block audit entirely.
- Dev trio is Tauri-only; the DEV disclosure is the right home, but keep
  Metal/ANE reachable — the ANE eval feeds the #762 proof work.

## 4. Build order

1. Restyle-only reorder: CAPTURE → EXPORT → PROJECT → SETUP → DIAGNOSTICS;
   resolution dropdown → matrix; RENDER STILL hero first. No state changes.
2. RENDER MOVIE: promote loop capture beside the hero, loop-seconds as amber
   popup; Matt's call on the REC WEBM toggle (merge vs keep).
3. One-file envelope: add `hits` to bundle parts (version bump), kind-sniffing
   IMPORT, EXPORT = bundle; keep hotkey X.
4. Taste path: verify raw taste.json imports through the sniffing IMPORT; keep
   experimental toggle + status lines, demoted.
5. Demote-but-preserve pass: wall presets + LED, stage (blackout/test
   pattern/Syphon), E-core dump as second HEVC action, recipe link row,
   dirty-tracking + recent-files hints, batch refusal reason.
6. DEV disclosure: Metal / ANE / native-I/O behind it, still one tap away.
