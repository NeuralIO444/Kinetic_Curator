# STAGING REPORT — issue 2490 (A12): DEV · NATIVE buttons fail in the browser with a raw Tauri IPC error

Branch `feat/2490-dev-native-plain-errors`, base `738e10b2` (origin/main; A3/A4 already on it).
Built ahead in parallel per Matt's 2026-11-24 direction; QA and merge happen later, serially, in line order. Not pushed, no PR opened.

## The ruling being built (Matt, 2026-11-24, recorded on the issue)

1. In the browser build, native-only controls stay visible but disabled, labelled "Native app only". No click ever produces a raw IPC string, and no control silently does nothing.
2. In the native app, a genuine native failure shows plain words in the panel (e.g. "ANE evaluation failed") with the raw error string going to the event log for diagnosis.

## The failure mechanism, as proven against this tree

1. **The block had no gate at all.** `app/src/panels/pipeline/NativeLabBlock.jsx` statically imported `invoke` from `@tauri-apps/api/tauri` and all six handlers (`write_batch_frame`, `metal_init`, `metal_step_boids` + `metal_step_accum`, `curator_evaluate_frame`, `start_media_engine_export`, `dump_image_batch`) called it unguarded. It is the only direct `invoke` consumer of these commands in `src`.
2. **The shared gate already existed and the block ignored it.** `src/platform/desktop.mjs` `isTauriRuntime()` is the app's one desktop check — loot (`lootNative.mjs`), the curator modules, `PersonaHeadsPanel` and `LootRow` all use it. So "one gate" meant adopting the existing gate, not inventing a new one.
3. **Raw error path.** In a browser, Tauri v1's invoke calls the missing `window.__TAURI_IPC__`; every handler's catch interpolated `err?.message || err` into `onMessage`, which is `PipelinePanel`'s status line, rendered by `LatestCapture`. The raw string in the panel is exactly the repro.

## Premise corrections

- **The two "silent" buttons are the same mechanism, not a second one.** TEST NATIVE DISK I/O and INIT METAL UMA take the identical unguarded path and do call `setMessage` with the same raw string — but that line renders in the ESSENTIALS block at the top of the panel, while DEV · NATIVE sits in a collapsed `<details>` at the very bottom. Nothing appears at or near the clicked control, and any later message overwrites it. "No visible result" = the failure surfaced remotely from the control.
- **The raw error cannot go to the governor event log.** That log (`src/gl/governorEventLog.mjs`, the X-RAY log) is contract-locked to governor shed/restore records and throws on any other type/kind. The build therefore gives the native lab a sibling diagnostic log of the same shape (bounded ring buffer, ISO timestamps, schema'd JSON export) inside `nativeLab.mjs`; raw strings are recorded there, keyed by Tauri command. If the coordinator would rather these records land in a different log surface, the recorder is one injected dep (`record`) in `createNativeLab`.
- The agent-UI registry cannot reach these buttons (its `pipeline.dev-native` entry is `stress: 'skip'` with no channel), so no bridge-side gating was needed; its stale note text was updated to describe the gated behaviour.

## What changed

- **`app/src/panels/pipeline/nativeLab.mjs` (new)** — the gated core, in `lootNative.mjs`'s injected-deps shape (nothing throws; the Tauri API is imported lazily, inside the call). Every method checks the shared `isTauriRuntime()` gate first: in a browser it returns `{ ok: false, unavailable: true }` **without calling invoke**. On a native failure it records the raw error in the diagnostic log and returns per-operation plain words (`NATIVE_PLAIN_FAILURES`: "Native disk write failed", "Metal init failed", "Metal pass failed", "ANE evaluation failed", "Media export failed", "E-core dump failed"). Exports `NATIVE_APP_ONLY_LABEL` ("Native app only"), the log API (`recordNativeError` / `getNativeErrors` / `clearNativeErrors` / `nativeErrorLogSize` / `exportNativeErrorLogJSON`, schema `kc-native-error-log/1`, cap 128).
- **`app/src/panels/pipeline/NativeLabBlock.jsx`** — handlers call the core; the static `invoke` import and all raw-error interpolations are gone. Success messages are byte-identical to before (verified: the 67-byte test payload and every colour literal in the file are unchanged). All six buttons now take `disabled={!desktop || busy}`; in a browser they also gain a " — Native app only" label suffix, a matching `title`, a `not-allowed` cursor, and a note line at the top of the block ("Native app only — these controls run in the desktop app; here they are shown disabled."). The media-progress listener now returns early outside the desktop shell (in the browser it previously attempted the listen and swallowed the failure). Desktop behaviour is otherwise unchanged.
- **`app/src/panels/pipeline/nativeLab.selfcheck.mjs` (new)** + one manifest line — 8 checks: browser gate (invoke spy never called, nothing logged), default factory in node, native failure split (plain words carry no IPC text; raw string logged verbatim per command), metal-pass second-command failure, success passthrough + command order, log boundedness/export shape, raw-text shaping, and a source contract on the block (shared gate imported, no static invoke import, no raw-error interpolation, all six buttons gate-disabled, label present).
- **`app/src/agentUi/uiRegistry.mjs`** — one note string on the existing `pipeline.dev-native` entry, updated from "fail with a raw IPC error" to the gated behaviour.

## Overlap flags for the coordinator

- **A5 (issue 2483)**: no shared files. This build touches nothing in the governor/budget area; A5's known surface (governor thresholds, GOV TUNE, bottom bar) does not intersect `panels/pipeline/` or the registry entry changed here.
- **Textual-conflict risk (small)**: `app/selfcheck.manifest` (+1 line after `pipelineNotices`) and the one note string in `uiRegistry.mjs` are the two files a parallel branch could plausibly also touch; both edits are single-line and localised.

## Verification

- Targeted: `nativeLab.selfcheck.mjs` 8/8 OK. Adjacent suites re-run green: `uiRegistry`, `lootNative`, `latestCapture`, `pipelineNotices`.
- `npm run lint`: 0 errors (11 warnings, all pre-existing, none in the touched files). `npm run format:check`: clean. `npm run build`: green (one pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` warning about `devTabs.mjs`, unrelated).
- **Full manifest sweep** (continue-on-error; log: `sweep-2490.log` in this worktree): **819 PASS + 8 FAIL = 827**, verdict sequence reconciled exactly against the manifest. The run was cut twice by sandbox restarts/OOM and resumed from the verified prefix both times (scripts: `sweep-2490.sh`, `sweep-2490-resume.sh`).
  - Known sandbox-environmental, identical on main: `swarmWasm`, `rollSafety`, `accum`.
  - `livingMotion` — the documented wall-clock flake, also present on main.
  - A/B'd against a fresh detached worktree at pristine origin/main (`738e10b2`): `retroCapture`, `vortex`, `phase6`, `resolverProbe` **fail identically on main** — none is caused by this change. `retroCapture`'s failure is a wall-clock assertion (ring cost 3.595 ms/frame) tripped under sweep load; none of the four touches this change's surface.
- One-writer files (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js`): untouched.
