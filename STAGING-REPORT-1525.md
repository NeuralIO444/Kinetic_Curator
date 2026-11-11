# STAGING REPORT — #1525 MegaMind S1: local model link

**Branch:** `megamind-s1` · **Base:** main `60ecd901` · **Status:** staged locally only — NOT pushed, no PR (coordinator publishes after QA).

Issue (verbatim title): "MegaMind S1 (DEFERRED): local model link — connect, detect, Settings + House recommendation"
Design: `docs/research/megamind-local-model-plan-2026-10-14.md` + `docs/research/megamind-ollama-surface-audit-2026-10-14.md` (both read in full; the issue body and every comment were read before coding).

Rulings implemented (Matt, 2026-11-10, recorded on the issue):

1. **Placement** — the connect/detect surface is a new **DEV PANEL** tab (`megamind`), not user Settings. User Settings is a later move.
2. **Endpoints** — Ollama only. No OpenAI-compatible generalisation anywhere (pinned by the selfcheck).
3. **Tauri-only in practice** — built in the web app (the Tauri bundle is this code); no hosted-web support promise; error copy names the browser gates honestly, Safari included.
4. **Ordering** — a connected Ollama is the measured capability source for later stages; disconnect (or a dead model) clears the registry and MegaMind is on rules again, silently. **S1 wires NO persona calls** — detection and registry only.
5. **House text** — the recommendation publishes as **qwen3-vl:8b-instruct** (lighter line qwen3-vl:4b-instruct), held in ONE canonical source in code (`HOUSE_TEXT`) and written character-for-character into README, wiki and docs; the selfcheck fails on drift.

## What was built, file by file

**New files**

- `app/src/curator/megamindLink.mjs` — the pure core (no fetch/storage/clock of its own). Endpoint normalisation; model names taken verbatim from Ollama, never constructed; cloud is a name shape (`…:cloud` / `…-cloud` suffix), never a recommendation. `fetchTags` (`GET /api/tags`), `fetchShow` (`POST /api/show` — capabilities verbatim, context found by scanning `model_info` keys for `*.context_length`, thinking reported honestly as controllable/unreported), `preloadModel` with the House pins (`keep_alive "30m"`, `num_ctx` 16384), and ONE timed warm probe in the real LOIS verdict format (flat schema via Ollama `format`, `think:false` only when show reports thinking controllable, `num_predict` 150, temperature 0). Probe grading: parses as a kc-voice/1 LOIS verdict via the existing `validateReply('lois', …)`, no `<think>` leak, no CJK drift. Tier is the measurement: **A ≤3 s clean / B ≤8 s clean / C otherwise** (unclean is always C). Error copy for every gate: Ollama not running, origin not allowed (with the exact `OLLAMA_ORIGINS=` line and the per-OS restart step), browser prompt denied, Safari unsupported, model gone (with the `ollama pull …` line), http, no-models, bad endpoint.
- `app/src/curator/megamindLive.js` — the live driver: fetch, localStorage (`kc:megamind:link`), the wall clock, and the bus. Creation reads back only the saved endpoint+model for the form — **nothing is probed on page load or driver creation** (pinned). Connect runs the handshake (tags → show → preload → probe); detection re-runs on every model change; a saved model missing from tags fails `model-gone` (never a silent swap); unreachable-vs-origin is disambiguated by an opaque no-cors probe; the Safari gate is exempt inside the desktop shell (`isTauriRuntime` — the supported surface); a failed re-detect keeps the prior record/model named. On a completed detection the record is published to the capability registry and announced as `MEGAMIND_LINK` telemetry; disconnect clears storage + registry and emits `{connected:false}`.
- `app/src/composition/capabilityRegistry.mjs` — the plan's one genuinely new piece. `checkCapabilityRecord` validates fail-closed; `setCapabilities` / `getCapabilities` / `capabilityEnabled` / `subscribeCapabilities`; `CAPABILITY_CONSUMERS` + `consumerEnabled` with "slowest acceptable tier" semantics (e.g. `lois.vision` needs tier B + the vision badge; `search.semantic` needs an `embeddings` badge no S1 record earns). Per the 2026-10-15 hook note, the XGBoost **narration surfaces** are enumerated as consumers (Davis reason prose, drift/retrain narration, recap narration) so they enable by capability — the heads themselves get NO registry entry and no capability ever switches a head (pinned).
- `app/src/panels/MegaMindPanel.jsx` — the dev-panel surface: endpoint + model pick, Connect / Disconnect / Re-detect, status (model, tier, badges — vision, cloud — context, probe time), the honest gate copy, and the House recommendation rendered from the canonical `HOUSE_TEXT`.
- `app/src/curator/megamindLink.selfcheck.mjs` — **19 checks, all passing.** Fixtures mirror real Ollama `/api/tags` and `/api/show` shapes for the Studio shelf as dispatched (gemma4:31b: capabilities [completion, tools, vision, thinking], `gemma4.context_length` 262144; qwen2.5-coder: [completion, tools], `qwen2.context_length` 32768, thinking unreported; cloud-tagged names badged cloud). Also pins: handshake order, tier boundaries, no-load-time probing, disconnect semantics, House-text identity across code/README/wiki/docs, and the S1 scope lines (no persona wiring, no OpenAI-compatible path).
- `docs/MEGAMIND.md` — the docs home for the link: how it works, the gates and their copy, the registry, and the House recommendation (identical text).

**Edited files**

- `app/src/composition/eventBus.js` — new `MEGAMIND_LINK: 'megamind:link'` event (telemetry payload only; the registry record is the data).
- `app/src/composition/eventRegistry.js` — `MEGAMIND_LINK` registered (handler: null, telemetry; the catalogue now holds 175 events and its suite passes).
- `app/src/panels/devTabs.mjs` — lazy `MegaMindPanel` import + the `megamind` tab (appended last, per the tab-order comment).
- `app/src/composition/devPanel.selfcheck.mjs` — the expected tab list gains `megamind`.
- `app/src/state/bundle.js` — `kc:megamind:link` registered in `BUNDLE_LEFT_OUT` with its reason (this machine's loopback endpoint + chosen model name; the receiving machine connects and detects its own; never project content). Found by the full sweep — see Verification.
- `app/eslint-rules/determinism-allowlist.mjs` — megamindLive's two injectable clock seams (`performance.now` ×1, `Date.now` ×1) allowlisted with reasons: the probe timer IS a wall-clock network measurement and the record's measured-at stamp; neither feeds the sim or a take.
- `app/selfcheck.manifest` — `megamindLink.selfcheck.mjs` added (the runner sweeps it).
- `README.md`, `docs/wiki-home.md` — the House recommendation, character-for-character identical to `HOUSE_TEXT` in code and to `docs/MEGAMIND.md` (the suite pins all four surfaces).

## Verification (this tree, sandbox)

- **New suite:** `megamindLink.selfcheck` — **19/19 checks passed**.
- **Neighbouring suites, all passing:** eventRegistry (175 events), devPanel, eventBus, busChain, mind (15), mindFace (7), mindApple (6), mindPresence (18), mindConduct (24), mindConduct.apple (6), trioLive (23), runSelfcheck, determinism allowlist + its selfcheck, bundleKeys (5/5, after the fix below), bundle (19/19).
- **Full sweep:** a per-suite sweep of every command in `app/selfcheck.manifest` (655 commands) finished **650 passed, 4 skipped by sweep design, 1 failed** — and the one failure was S1's own: `bundleKeys.selfcheck` caught the new `kc:megamind:link` storage key with no bundle decision. Fixed in this branch (the `BUNDLE_LEFT_OUT` entry above); bundleKeys now passes 5/5 and the bundle suite 19/19. The 4 skips are the known base-identical sandbox suites, excluded by the sweep itself (`swarmWasm`, `rollSafety`, `accum`, `clock.evolve-accum` — browser/WASM sections that skip without Playwright chromium); `npm run selfcheck` likewise stops at `swarmWasm`. Not an S1 regression.
- **ESLint:** clean on all touched files. **`npm run build`:** succeeds (only the pre-existing chunk-size / Tauri dynamic-import warnings). **`npm run format:check` in `app/`:** green ("All matched files use Prettier code style!"). Note: root `README.md` / `docs/wiki-home.md` are outside `format:check`'s scope and were edited surgically — running prettier over them churns unrelated lines.
- **Dev-panel note:** production bundles exclude the DEV panel entirely (`import.meta.env.DEV` gate), so no MegaMind chunk appears in `dist` — by design, same as every dev tab.
- **Not verifiable from the sandbox:** a live handshake against Matt's Studio Ollama (no Ollama server here). Detection is proven against injected-fetch fixtures mirroring the real response shapes; the on-device connect on the Studio is the coordinator/Matt verification step after publish.

## Left out, and why

- **Tauri CSP allowance — deliberately NOT changed.** The bundled app's `connect-src` (#1707, pinned by `app/src/assets/tauriCsp.selfcheck.mjs`, which forbids any http(s) connect except ipc/asset localhost) currently blocks a loopback fetch to Ollama inside the desktop shell. That is a security surface and a separate decision; the S1 code is identical either way. A follow-up needs exactly one allowance — `http://127.0.0.1:11434` in `connect-src` — plus updating that pin with its justification.
- **No persona wiring** (S2's scope): MegaMind still runs on rules; S1 publishes capability data only.
- **No OpenAI-compatible endpoints, no loot surface** (#1479 stays parked), no hosted-web support promise — per the rulings above.
