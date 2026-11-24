# Staging report — agent UI manifest + standing stress script (branch feat/2509-agent-ui-manifest)

Base: origin/main f260b748 (the hosted build's commit). Local only; nothing pushed, no PR opened — the coordinator publishes.

Note for the coordinator: the eventual PR for this branch is meant to close its issue (2509).

## What was built and where

| File | What it is |
| --- | --- |
| `app/src/agentUi/uiRegistry.mjs` | The registry (schema `kc-agent-ui/1`): every panel, every primary control, a plain-words description of what each does, its lawful action channel, the state reads that prove the action landed, and a stress mode (`walk` / `probe` / `skip`) with a reason wherever a control is not walked. Wherever the app keeps a control's options as a module export, the entry imports that export, never a copied literal; layout-param stops and ranges are pinned against the app's own `PARAM_STOPS` / `PARAM_SPEC` tables by the selfcheck (see the QA fix round). |
| `app/src/agentUi/uiBridge.mjs` | The action bridge. Installs `window.__KC_UI__` = `{ schema, manifest(), act(id, value, param), read(id, param), stage(), state(keys) }`. Imported once from `app/src/main.jsx` (one added line). The hook is always-on by design: the ruling on this work is that the manifest ships in the live build so an agent can read and drive the hosted build — the deliberate exception to the test-only store-exposure precedent. |
| `app/src/agentUi/uiRegistry.selfcheck.mjs` | The drift pin (see Verification). Registered with one added line in `app/selfcheck.manifest`. |
| `app/e2e/agent-stress.mjs` | The standing stress script (playwright-core, the repo's e2e family). Boots a build, reads the shipped manifest off `window.__KC_UI__`, walks every registered control across its range (both extremes for sliders and segments), records per-step stage reads (fps, node count, tape, watchdog state) and console errors, and writes JSON + markdown reports in the 2026-11-24 session's A/B shape. `--write-baseline` accepts a baseline; `--baseline` diffs against it and the run exits non-zero on new breaks only. A failed walk is retried once before it is recorded (spring-smoothed params settle slowly on a loaded machine). |
| `app/e2e/agent-stress.baseline.json` | The accepted baseline, written from a full run of this branch's build (see Stress evidence). |
| `app/.prettierignore` | One adoption block (`!src/agentUi/`) so the new files are format-checked, following the repo's born-formatted precedent. |

No one-writer file was touched (`app/src/gl/liveLoop.mjs`, `app/src/gl/liveResolve.mjs`, `app/src/gl/particles.js` are untouched; the only pre-existing files edited outside the new directories are `app/src/main.jsx`, +1 import line, plus the manifest and prettierignore lines above).

## Coverage — 333 controls, 14 panels

| Panel | Controls |
| --- | --- |
| Top bar | 22 |
| Bottom transport bar | 24 |
| P01 CANVAS | 3 |
| P02 ASSET POOL (grid) | 16 |
| P02 inspector (selection) | 11 |
| KEEPS SHELF | 6 |
| P03 BUILD | 97 |
| P04 PLAY | 18 |
| P05 PIPELINE | 24 |
| P06 STIMULI | 28 |
| P07 DIRECTORS | 36 |
| DEV tools | 25 |
| WetLab | 17 |
| Asset Studio | 6 |
| **Total** | **333** |

Generated families (per-asset tiles, per-layer strata controls, per-hit pills, per-route rows, kernel tiles, persona-tune leaves) get one registry entry each, marked as a family; the stress script derives a representative instance (first asset, first content layer, first preset) and walks that.

Run outcomes on the accepted baseline run: **193 pass, 89 probe, 50 skip, 1 fail** (the fail is environment-bound; see Stress evidence). 195 controls are registered as `walk`; one of them (`topbar.taste-voice`) resolves to a probe in the default profile because no representative instance exists there.

### Deliberate probe / skip calls (each is also recorded in the registry entry itself)

- **KINETIC routed tap (`topbar.kinetic`) — probe.** Its routing lives in component-local heat state (`panels/layout/kineticHeat.mjs`) over four store passes; a stateless bridge call cannot reproduce the route honestly, so no channel is registered rather than a fake one.
- **Stratum solo (`build.layer-solo`) — probe.** The channel is the panel's own, but a walk cannot observe it: the layers slice's content cap is 1 (a second KC track is refused, always), so the only content stratum is already solo by construction and both directions land on the same state.
- **Add stratum (`build.add-stratum`) — probe.** Adds are lawfully refused at the cap and by the tape pre-flight; a walk cannot tell a lawful refusal from a break.
- **Curate (`topbar.curate`) — walked, partially.** The bridge performs the two emits the control always makes; the conditional palette follow-up uses a helper that lives inside `CuratorBar.jsx` and is not exported, so it is not reproduced. Recorded in the entry.
- **WetLab and Asset Studio dialog families — probe / skip where dialog-local.** Their store arguments are performer-derived inside the dialog (attach picks, gene edits, part edits). The beast settings that are plain store values are walked and pass (`wetlab.beast-*`).
- **File-IO, download, clipboard and native-shell controls — skip.** Imports, exports, still/movie renders, REC, census load, the DEV·NATIVE tab: they leave the page or need the Tauri shell, so there is no in-page state change to verify.
- **MEGAMIND connect / ask / embed — probe.** They call a local model endpoint; a standing stress run must not make model calls.
- **STIMULI per-route rows — probe.** The payload is a table-edit function built from the live rows, not a plain value.
- **Destructive or performer-data controls — skip / probe.** Deletes, renames and clears of the performer's own lists and assets are catalogued but not churned by the standing script.
- **Readouts (`canvas.readouts`) — probe.** A readout changes no state; an agent reads it through the bridge's `stage()` / `state()`.

## How the bridge routes actions

`act()` performs exactly the state change the control itself performs, through the app's existing channels — there is no parallel write path:

- `bus` — emits on the app's own event bus (`composition/eventBus.js`) with the same payload the panel emits; the existing bus wiring funnels it into the same action/store path a click takes.
- `store` — calls the same Zustand store action the component calls.
- `apply` — dispatches through the app's `applyAction` funnel with the same action type and fields.
- `module` — calls the module's own exported setter (dev mode, persona tuning, biology policy reset, active taste persona, governor event log). The bridge's module table and the registry's module channels are pinned to each other by the selfcheck, in both directions.
- `recipe` — five named compositions of the channels above, using only the panels' own helpers (look-preset load, DAVIS favourite capture, audio-route add, poem doctrine, layer select).

`act()` snapshots the control's registered reads before and after and returns both, so a caller can see the change land. Reach and legibility only: no new authority, and nothing about persona internals beyond what the panels themselves show.

## Verification

- **Selfcheck (new):** `uiRegistry.selfcheck: OK — 333 controls, 14 panels, manifest correspondence + channels + reads + sources pinned`. It pins: the shipped manifest is the registry's JSON form (round-trip + per-control deep equality + counts); every bus event exists in the app's event table; every store action is a real function on the real store; every apply type is exported by the action module; every module channel's file and export exist and match the bridge's table (and vice versa); every read names a real state key; layout-param keys and beast-setting ranges match the app's own spec modules; every entry's cited source file exists and contains the channel literal it claims.
- **Lint:** `npm run lint` — 0 errors, 11 warnings, all pre-existing in files this work did not touch (ShelfView.jsx, DataExportRow.jsx, LootRow.jsx). No agentUi findings.
- **Format:** `npm run format:check` — "All matched files use Prettier code style!"
- **Build:** `npm run build` — green (the one dynamic-import warning about devTabs.mjs is pre-existing on main).
- **Suites naming touched files:** phase6 (walks the import graph from `main.jsx`) passes, both run directly and in the sweep; dishLinks, dishSpin, exposureModel, wetLook, wetSoak pass in the sweep.
- **Full selfcheck sweep** (continue-on-error over all 823 manifest commands; log in the worktree root as `sweep.log`, gitignored): **complete — 819 pass verdicts, 4 fail verdicts; every one of the 823 manifest commands has a verdict**, including the new suite (`PASS node src/agentUi/uiRegistry.selfcheck.mjs`). The first sweep process was OOM-killed by the sandbox at 518 verdicts; a resumed sweep ran the remaining commands to completion, and both halves are in the same log. The only failures:
  - Known sandbox-environmental failures, identical on pristine main per the standing record: `swarmWasm` (exit 1), `rollSafety` (exit 1), `accum` (exit 134).
  - `livingMotion` (exit 1) — a wall-clock budget assertion ("the floor costs X ms a frame at 800 marks, budget 2 ms"). A/B in a fresh detached worktree at origin/main f260b748: pristine main failed 1 of 3 runs (+2.09 ms) and passed others (+1.63 ms, +1.05 ms); this branch passed at +0.87 ms and failed at +2.78 ms on identical code. The measurement swings run to run on the sandbox's shared CPUs; it is a timing flake present on main, not an effect of this change (which touches no engine or resolve code).

## QA fix round (2026-11-24)

The QA Review agent returned FINDINGS (no blockers). Findings 1–6 are fixed in this round; QA's open question is answered at the end.

1. **`state()` overreach — fixed.** `window.__KC_UI__.state()` no longer dumps the whole store. It returns exactly the registered read surface: the union of every control's registered read paths plus the bridge's module reads (`STATE_READ_PATHS` in `uiBridge.mjs`, derived from the registry, so a new registered read extends it and nothing else can). Unregistered keys — including the ones QA named (`shelfDiskRoot`, `keeps`, `historyUndoStack`, `midiMap`) — are refused with `{ ok: false, error }`, the refusal shape `read()` uses. A registered path with no live value (e.g. `light.*` while the sun is off) serializes as null so the returned key set is stable. The selfcheck pins the allowlist against the registry in both directions, the no-arg key set, and the named refusals.
2. **Copied option/stop literals + unpinned drift — fixed.** `directors.motion` now imports `KINEME_PATTERNS` (`engine/kineme.js`) and `directors.doctrine` imports `DOCTRINE_IDS` (`curator/doctrines.mjs`). A sweep of the whole registry found 18 more option lists with module exports, now imported the same way: `SCOPE_CYCLE` (topbar.start-scope), `BEAT_PRESETS` (topbar.beat-preset), `SCHEME_IDS` (topbar.palette-shuffle), `FIELD_CYCLE_DETENTS` (transport.dish-cycle), `MIRROR_STATES` (build.mirror), `BLEND_MODES` (build.layer-blend), `WET_STOPS` (build.layer-opacity), `STRATUM_ROTATIONS` (build.layer-rotation), `LIGHT_SLOTS` (build.sun-colour), `FIELDMAP_FIELDS` / `FIELDMAP_CHANNELS` (build.map-field / build.map-channel), `ids(FEEL_PRESETS)` (stimuli.feel), `BALLISTICS_CURVES` (stimuli.response), `RECIPE_OFFSET_CHANNELS` (directors.mutate-stream), `TRANSPORT_MODES` / `PATH_FAMILIES` (directors.travel / directors.travel-path), `STAGE_MODES` (pipeline.stage-mode), `STAGE_MAPPINGS` (pipeline.stage-mapping). The remaining literals are enumerations that exist only inside the control's own source component, or panel-offered subsets of a module list (build.layout-mode's tiles are a subset of `LAYOUT_MODES`; build.trail offers three of `TRAIL_MODES`' five), noted on their entries. The selfcheck now also compares EVERY lpRow's stops against `PARAM_STOPS` and its range against `PARAM_SPEC`, with the documented exceptions pinned exactly rather than waived: riftShear's panel-literal stops (exiled from the table by design), the swarmCohesion / leaveFade editor spans (narrower than the load-trust spec, per the tables' own comments), and the accumScan / riftShear no-spec spans. Mutation proof (scratch mutations, both reverted, suite green again): build.count's stops changed to `[10, 120, 240, 900]` → selfcheck FAILS (`stops [10,120,240,900] != PARAM_STOPS.count [10,120,240,800]`); directors.motion re-literalized without CADENCE → selfcheck FAILS (`directors.motion options != KINEME_PATTERNS`).
3. **Sweep tally — corrected.** The Verification section above originally read "834 pass verdicts". The runner verdicts in `sweep.log` are 819 PASS + 4 FAIL = 823, exactly the manifest command count; 834 counted suites' own stdout lines beginning with "PASS". Corrected above and here.
4. **`light.*` read subkeys — pinned.** The selfcheck now checks every `light.<sub>` read against `LIGHT_DEFAULT` (`data/light.js`), the same way layoutParams and beastSettings subkeys are pinned, so a bogus nested read fails the suite. Mutation proof: `light.x` → `light.xNope` fails the selfcheck; reverted.
5. **Retry visibility — fixed.** `agent-stress.mjs` now records `passedOnRetry` on the result record (the JSON detail already carried it in prose) and the markdown report's B section lists the controls that passed only on retry, by name, so an intermittent pass cannot hide in the summary counts.
6. **Baseline provenance — relabeled.** `agent-stress.baseline.json` said `"build": "f260b748"` — the base commit the preview was built from while the branch work was still uncommitted. It now names `845b50c4`, the branch head the baseline content was captured against. This round changes no control behavior or values (a read-surface scoping and import-for-literal swaps, all value-identical), so the baseline content stands; no fresh acceptance run was needed.

**Coordinator's disposition of QA's open question:** the shipped manifest is read through the window hook on the hosted build, which is the served surface the issue's ruling specifies; no separate static JSON document is part of the deliverable.

## Stress evidence

All runs drove a local preview build of this branch through the sandbox path described below.

**Accepted baseline run** (clean build, `--write-baseline`):

```
summary: walked 195, passed 193, failed 1, probed 89, skipped 50; new breaks: 0
```

The one fail is `stimuli.audio`, environment-bound and proven so: the bridge actuation sets `audioEnabled: true` (its own after-read shows it), then the audio engine's microphone request is denied in sandbox Chromium (`audioDenied: true`) and the app reverts to false. The control and the bridge are correct — the 2026-11-24 session toggled AUDIO successfully in a real browser on the hosted build. The baseline carries the fail; if the control passes on a secure-context machine (Mac/CI, where localhost is a secure context), the diff treats fail→pass as an improvement, not a break. The baseline also carries one console signature, `Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED` — a page resource fetch refused by the sandbox proxy; environmental to the sandbox drive path.

**Seeded-break demonstration.** `app/src/state/applyAction.js` was temporarily seeded so the SET_LAYOUT_PARAM funnel ignored the key `count` (the panel and the bridge share that funnel, so the real control dies too). Rebuilt, re-served, full run against the accepted baseline:

```
summary: walked 195, passed 192, failed 2, probed 89, skipped 50; new breaks: 1
SCRIPT EXIT: 1
```

Report A-section excerpt:

```
## A — breaks

1. **build.count** — no-effect: read-back never changed (initial 320, landed [320,320,320]) (first attempt: …)
2. **stimuli.audio** — toggle produced no change (initial false) (first attempt: …)

Baseline diff (e2e/agent-stress.baseline.json): 1 new break(s).
- build.count: new failure (baseline: pass)
```

Exactly one new break — the seeded control. The seed was then reverted completely (`git checkout`; a grep for the seed marker returns 0 and the file is absent from git status).

**Final confirmation run** (post-revert clean build, `--baseline`):

```
summary: walked 195, passed 193, failed 1, probed 89, skipped 50; new breaks: 0
SCRIPT EXIT: 0
```

`build.count` passes again — the revert is proven live, not just in git.

### How sandbox verification differed from a normal run

- The sandbox's system Chromium refuses localhost navigation, so runs used Playwright-core from the app's own `node_modules` with its bundled Chromium, flags `--use-angle=swiftshader --enable-unsafe-swiftshader`, and route interception: the script navigates to a fake host (`--base-url http://kc.local/Kinetic_Curator/`) and fulfils from the local preview server (`--serve-from http://127.0.0.1:4173`). On a Mac or in CI the same script runs plainly against `--base-url` with none of those flags.
- SwiftShader on 1.5 shared CPUs renders at roughly 3–20 fps, so the governor sheds quality during long walks; end-of-run stage reads (e.g. `running: false, quality: performance`) are load artifacts of the sandbox, not restore failures — per-control verdicts are unaffected.
- The microphone denial behind the `stimuli.audio` fail (above) is likewise a sandbox property.

## Not verified, and why

- **The hosted build itself.** The hook was verified against a local preview build of this branch. The hosted deploy only carries this work once the PR lands, so a hosted run was not possible before merge; the first post-merge run of `app/e2e/agent-stress.mjs` against the hosted URL is the natural follow-up.
- **A CI/Mac run of the stress script.** Not available from the sandbox; the script is written to run there unchanged (configurable base URL, sandbox flags opt-in).
- **Nothing else outstanding.** The sweep caveat that applied mid-build (an OOM-interrupted first pass) is resolved above: full manifest coverage was achieved across the two sweep processes, and the failure set is exactly the four entries documented under Verification.
