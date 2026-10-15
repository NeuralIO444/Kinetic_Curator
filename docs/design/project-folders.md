# Projects as folders (#1567): research and build plan

**Status:** plan, 2026-10-14. Nothing built. A read-only pass over the code (every claim re-read against `app/` and `src-tauri/`; items not read are marked). Matt orders every slice. The decisions are on #1567; this is the code reality they run into.

## The model (Matt, 2026-10-14)

A project is ONE folder, `KC1_Loot_<name>/`, and it is where the session lives (the Autodesk Maya model: create a project at the start, the session is saved in it).

```
KC1_Loot_<name>/
  project.kc.json                 manifest: { kind:'kc-project', v:1, projectId, name, createdAt }
  images/ audio/ palettes/ looks/ the loot, shared by every session, read in place
  sessions/<name>_01.kcproject    numbered saves of the composition
  takes/<session>/   exports/<session>/    named by the session that made them
  .kc/lock.json  .kc/recovery/    KC-1's own, hidden
```

Decided: the project lives in the folder; `_##` numbers **sessions** (autosave in place, "new session" freezes the current one and starts the next); nothing is ever copied; taste and the library are the **instrument's** (favorites, keeps, taste, ledgers, user palettes, user voices), the composition is the **project's**; Safari and Firefox work from browser storage plus a "save project folder" zip.

## Where the plan found the code disagreeing with the idea

1. **The title field does more than name exports.** `projectTitle` is stored in the project doc (`projectDocument.js:92`), restored by `applyProject` (`globalSlice.js:760`) and tags every ledger row (`davisSlice.js:432,469,479`). Folding it into the project name changes ledger provenance.
2. **"Autosave" is three keys.** `kc:pipeline:v1` is primary and `kc:pipeline:backup` the one-deep rotation (`projectDocument.js:365-396`); legacy `kc:project:v1` is a read fallback (`:414`); `kc:project:quarantine` is one slot.
3. **The backup is not a recovery point.** It rotates on every write, so within about a second of editing it holds the previous edit. Copying that pattern into a folder protects nothing.
4. **Startup chaos would overwrite a session.** `decideBoot` returns `restore-roll` whenever a doc exists and START is CHAOS (the default) (`startupBoot.mjs:22`). With folder autosave, opening `_03` would roll it and write the roll over `_03` within about 500 ms.
5. **Autosave already misses real edits, today.** The subscriber watches 12 fields (`useProjectAutosave.js:175-187`); `light`, `assetStill`, `assetAttach`, `creatureCount`, `mathMacros`, `paletteLocks`, the canvas spec, `projectTitle`, `seedOffsets`, `layerSnapshots` and `activeLayerId` are serialized but not watched, and there is no `pagehide` flush. They ride along on the next watched change; closing first loses them. **This is a bug in the app today, independent of this feature.**
6. **The project file cannot migrate.** `parseProject` accepts only `version === 1` (`projectDocument.js:76`).
7. **The loot half is read-only.** `loot.rs` has no write command.
8. **The index holds a machine path.** It must stay per-device (`kc:loot:v1`); "per-project index" cannot put the path in a project.

## Design

- **One interface, injected backends** (the loot folder's pattern): `projectFs` with `pickParent`, `pickProject`, `create`, `list`, `read`, `writeAtomic`, `rename`, `lock`. Backends: Tauri (a Rust `project_write`: temp file in the same directory, fsync, rename, root-bound by the existing `resolve()`), Chromium File System Access (handle in IndexedDB; `createWritable` commits on close), a **memory** backend with fault injection for selfchecks, and **none** (Safari/Firefox: browser storage as today).
- **Files:** the session file is the existing envelope `{version, savedAt, doc}` plus `{projectId, session, app}`, so `parseProject` and every sanitizer are reused. The manifest, not the folder name, is the project's identity (users rename folders in Finder and Chromium cannot rename directories). A file from a newer app is refused and left byte-identical.
- **Save loop** (`projectSaver.mjs`, pure, injected clock): the existing 500 ms debounce / 4 s max-wait with the field list widened; flush on `visibilitychange` and `pagehide`; atomic write; one recovery copy of what was opened plus a rolling `.prev` at most every 5 minutes; **a localStorage shadow keeps writing** as a crash buffer (and offers "recover newer unsaved work" on boot); a write failure sets `unsaved`, keeps the doc in memory, retries with backoff and never throws into the render path.
- **Lifecycle:** create (wizard: name, pick a parent, sanitise, create, write `_01`), autosave in place, new session (flush, `max+1`, write from current state), open (**restore, no startup roll**), rename (display name only), recent (a per-device list, classified per-machine).
- **Naming:** NFC; strip `/ \ : * ? " < > |` and control characters; trim dots and spaces; reject Windows reserved names; 64 characters; empty becomes `Untitled`; case-insensitive collision is reported, never silently suffixed; session numbers are `max+1`, never reusing gaps, `_99` goes to `_100`.
- **Migration:** on first launch with an existing autosave and no project open, the wizard offers "adopt your current work as `<name>_01`". The browser copy is left in place.
- **Share links and recipes** are pure codecs and stay as they are; a link applied while a project is open starts a new session (or asks), so it never silently overwrites one.

## Build slices (one PR each; the list is Matt's to order)

| # | PR | Visible |
|---|---|---|
| 0 | **Fix: widen the autosave trigger list and flush on `pagehide`.** An independent bug fix, worth doing first | no |
| 1 | `projectNaming.mjs`: sanitise, collisions, session parse and next | no |
| 2 | `projectFile.mjs`: envelope, manifest, version check, migration table, "newer than this app" refusal | no |
| 3 | the `projectFs` interface and the memory backend with fault injection | no |
| 4 | `projectSaver.mjs`: debounce, atomic, retry, shadow, recovery copy, failure injection | no |
| 5 | `projectSession.mjs`: create, open (no roll), new session, rename, recent, adopt, over the fake fs | no |
| 6 | boot wiring: `decideBoot` gains `projectOpen`; a share link opens as a new session | no |
| 7 | Rust `project_write` and `project_lock` plus the Tauri backend | no |
| 8 | the PIPELINE project row (create, open, new session, status), desktop | yes |
| 9 | the first-run wizard, adopt the browser autosave | yes |
| 10 | exports and takes land in `exports/<session>/`, `takes/<session>/` | yes |
| 11 | Chromium File System Access backend (handle in IndexedDB, permission re-prompt) | yes |
| 12 | the loot index rooted at the project | no |
| 13 | Safari/Firefox "save project folder" zip and a session-only open | yes |
| 14 | two-window lock (Web Locks plus a lock file), read-only second window | yes |
| 15 | retire the import/export rows and the title field | yes |

## What would lose someone's work, and how each is contained

| Risk | Containment |
|---|---|
| Startup chaos rolls the opened session and autosaves over it | open = restore with no roll; a recovery copy of the opened file; a selfcheck that opening writes nothing until the first edit |
| An edit to an unwatched field is lost on close | slice 0; flush on `pagehide`; the shadow |
| A half-written file (crash, unmount) | temp then fsync then rename (Rust) or swap-file commit (FSA); a leftover temp is ignored and reported; a parse failure moves the file aside and falls back to `.prev` or the recovery copy; never deletes |
| Permission lapses or the folder moves: edits silently go nowhere | `unsaved` is visible, retry with backoff, the shadow keeps writing, a one-click reconnect, never switches folder on its own |
| Two windows on one folder, last writer wins | Web Locks plus a lock file with a heartbeat; the second window is read-only |
| An older app "repairs" a newer file | refuse; leave it byte-identical; never quarantine-delete a folder file |
| A user palette missing on another machine, silently swapped | embed the palettes a session uses, or show the existing fallback message; never silent |
| Migration deletes the browser autosave | adopt copies; the browser copy stays |
| A session number reused overwrites an old session | `max+1` only; create refuses if the target exists |
| Windows path length, reserved names, case collisions | the naming rules, selfchecked |
| A loot file deleted while sessions reference it | assets are embedded in the document; the loot log says what is missing |

## Open questions for Matt (recommended defaults)

1. **Keep the localStorage shadow beside the folder** as a crash buffer? Recommended yes: it softens "no folder, no project" but is the only protection against a lapsed permission. (slice 4)
2. **Rename:** display name only, with "rename folder" a separate explicit action later (impossible on Chromium anyway)? Recommended yes. (slice 5)
3. **Embed the user palettes a session uses** so a project opens right on another machine? Recommended yes. (slice 2)
4. **`kc:biology:v1`** is the instrument's? Recommended yes.
5. **Opening a project always restores with no startup roll** (START: CHAOS applies only to a fresh scratch scene)? Recommended yes. (slice 6)
6. **A recovery copy of what was opened, plus a 5-minute `.prev`?** Recommended yes: it is a project file, not loot, so "nothing is copied" holds. (slice 4)
7. **A share link opened inside a project:** start a new session, or ask? Recommended: start a new session with a note. (slice 6)
