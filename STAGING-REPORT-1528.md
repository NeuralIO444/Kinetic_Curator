# STAGING REPORT — #1528 MegaMind follow-on: embeddings slot

**Branch:** `megamind-embeddings` (local only — coordinator publishes) · **Base:** main `e257d8ab`
**Issue:** "MegaMind follow-on (DEFERRED): embeddings slot — semantic search + miner semantic novelty axis" — un-deferred by Matt's 2026-11-11 order to finish all MegaMind issues; S1 has landed, so the issue's un-defer conditions were met. The body's "DEFERRED — do not build" header is superseded by that order.

## What was built

The embeddings slot, in the S2/S3 pattern — an optional **second model slot** in the MEGAMIND tab's Settings machinery, served by the **same single Ollama origin** (`http://127.0.0.1:11434`; the CSP is untouched; no new network surface):

- **`app/src/curator/megamindEmbed.mjs`** (pure core) — the slot record law, the probe, the cache law, the embed texts, the vector math.
  - **Probe, never assume:** the record is *measured* by a real `/api/embed` call — one timed text probe (its vector's dimension is the measurement), then one image probe of a 1×1 still. `imageEmbed` is true only when the image probe answers in the text probe's own dimensions. A model's name and its show data claim nothing either way.
  - **Capability honesty:** the record is fail-closed validated and projected into the capability registry's own shape; `semanticEnabled` is graded by the registry's own `consumerEnabled` over the pre-existing `search.semantic` consumer. The registry singleton is never written by the slot (S1's link record is untouched).
  - **Cache integrity:** vectors keyed `model::txt:<sha256 of the exact embed text>` / `model::img:<the still's own sha256>`, capped at 512 with oldest-first eviction, validated on read (a dimension-lying entry is dropped with a warning, never served).
  - **Embed texts** are deterministic compositions: a keep's caption (when present) + layout mode + palette + cast members' asset metadata; an asset's id/category/tags. A variant id reads at its lead parent when the caller translates it (the miner does).
  - **Vector math:** `semanticDistance` = (1 − cosine)/2 in 0..1 beside `featureDistance`; `blendNovelty(f, s) = f + SEMANTIC_NOVELTY_WEIGHT × s` with `SEMANTIC_NOVELTY_WEIGHT = 0.5` — a null semantic component returns the feature novelty untouched.
- **`app/src/curator/megamindEmbedLive.js`** (live driver, megamindLive idiom) — owns fetch/storage/hashing/clock; probes nothing on creation; every call answers a deliberate press. Cache-first batched embedding (32/call), semantic search over shelf keeps + library, "more like this keep", still embedding (only when the record measured it), and the run-tool export (`embeddings.json`: the current slot model's vectors by bare text hash, with texts beside them for audit). New storage keys `kc:megamind:embed-slot:v1` and `kc:megamind:embeddings:v1`, both `BUNDLE_LEFT_OUT` in `src/state/bundle.js` with per-machine reasons, like the link key.
- **The MEGAMIND tab** (`MegaMindPanel.jsx`) — an **Embeddings** section under the S3 sections: Connect slot / model picker / Re-probe / Disconnect, the measured status line (model · dims · text probe ms · stills measured or text-only · cache count), a search box ranking keeps and library by meaning distance with per-keep "more like this", and the export press. The registry table's `search.semantic` row now reads the slot's own record. With no slot measured, the section says so and nothing else changes.
- **The miner axis** (`miner.mjs`, additive in the E4/E5 pattern) — `runMiner` accepts `embeddings = { model, vectorsByTextHash }`. Texts resolve to vectors by SHA-256 over the same embed texts the slot embeds (variant ids at lead parents, as features do). Selection gains the semantic novelty component only where both sides carry a vector; finalists record their pick-time axis components; resolved candidates carry `{ model, dims, vector }` in the run data. The report gains a `semantic` block only when a cache was handed in — **a plain run's report, run id, and selection are byte-identical to E2** (an offered run's id gains `-emb`, the `-varNN` precedent). `formatMinerReport` prints a **SEMANTIC AXIS** section: both spreads side by side and a per-finalist feature · semantic table.
- **The run tool** (`scripts/exploreRun.mjs`) — `--embeddings <embeddings.json>` hands the export to `runMiner`; `candidates.json` carries each resolved vector under its model.

## The capability story — what is unmeasured

Nothing about any real model is claimed. The House model (`qwen3-vl:8b-instruct`) is a vision-language instruct model; this build never asserts it can embed — on a machine with only the House model installed, the slot probe measures whatever Ollama answers (a refusal measures "not-embedding", in plain words) and everything degrades silently: no search surface, no semantic axis, the miner exactly as today. Whether a *real* embedding model's neighbours agree with human judgment is **not** established by the selfcheck: the suite's acceptance fixture uses recorded hand-placed vectors as a stand-in (stated in its header), with the human-judged ordering written as data.

**Matt's on-device check (the real-model acceptance):**
1. Pull any embedding model, e.g. `ollama pull nomic-embed-text` (an example only — the slot takes whatever is installed).
2. `npm run tauri dev` → DEV → MEGAMIND → **Embeddings** section → Connect slot → pick the embedding model → it probes (dims + probe ms + stills verdict appear).
3. Type a search ("spiky") → keeps and library rank by meaning; try "more like this" on a keep. Judge the neighbours — that judgment *is* the issue's acceptance.
4. Optional: "export embeddings for the run tool", then `node scripts/exploreRun.mjs --embeddings <path>` → REPORT.md shows the SEMANTIC AXIS section with both axes side by side.

## Hard-law compliance

- **Local is not cloud:** one Ollama origin; a `:cloud` pointer is refused before any fetch (suite-proven, zero calls); CSP untouched; no new dependency.
- **Heads law:** `FEATURES_VERSION`, `taste.json`, every head and training path untouched — grep-verified in the diff (no head file appears). Miner novelty and head features remain separate consumers.
- **Miner determinism:** suite-proven identity — embeddings `null`, an empty cache, and a cache of unrelated texts all select the *identical* finalists as the plain run; the aligned-cache run is deterministic across two runs.
- **Stills clause:** image embedding only on a measured `imageEmbed`; a text-only slot returns null for stills without even attempting a call (suite-proven).
- **Panel-graph law:** `panelGraph.selfcheck` green — 636 modules walked (634 on main + exactly the two new modules); no Node-only module reachable.
- **Determinism allowlist:** two entries added for `megamindEmbedLive.js` (performance.now ×1, Date.now ×1 — the injectable seams), enforced by lint both ways.

## Verification (all run on this tree)

| Check | Result |
|---|---|
| `megamindEmbed.selfcheck` (new, in `app/selfcheck.manifest`) | **152/152** — slot states (absent / present-not-embedding / embedding-ready / cloud-refused), probe measurement, cache keying + invalidation + corruption, acceptance fixture (judged top-2 exact + cluster coherence), driver flows, miner blend unit proof, miner identity ×4, dual-axis report shape |
| `miner.selfcheck` | OK — determinism exact (default run untouched) |
| `prospecting.selfcheck` | OK |
| `variants.selfcheck` | PASS |
| `panelGraph.selfcheck` | OK — 636 modules |
| `bundleKeys.selfcheck` | 5 passed |
| `megamindLink` / `megamindVoice` / `megamindVision` | 21 / 17 / 16 passed |
| `census.selfcheck`, `coverage.selfcheck`, `surge.selfcheck` | OK / OK / 1415 passed |
| `npm run lint` | 0 errors (11 warnings, all pre-existing, none in touched files) |
| `npm run format:check` | clean |
| `npm run build` | **752 modules** — main at `e257d8ab` measured 752 in a detached worktree today; production-count delta **0** (the panel chain's growth shows in the dev panel graph, 634 → 636) |

Consumer sweep: everything importing `miner.mjs` / reading keep data was grepped (`censusReport`, `prospecting`, the four `composeStillSvg` engine suites' import path, coverage, surge) — the suites above cover the readers; no data shape changed for any existing consumer (all miner additions are opt-in keys present only on an embeddings run). No dice-driven suite is touched by this change (selection is pure/seeded; the FIELD dice suites are untouched), so the 15–25× re-run rule does not apply; the new suite's seven full miner runs are deterministic and were run repeatedly across the verification passes.

## Ruled out of scope (with reasons)

- **Embeddings as head features** — forbidden by the issue's own heads law; a future declared features-version bump + Studio retrain is the only door.
- **Replacing or re-weighting the feature distance** — the issue names it primary and deterministic; the semantic component is additive under a named constant.
- **Any cloud embedding API / second origin** — local-is-not-cloud; refused by construction.
- **Auto-probing on load or panel mount** — the link's law: measurement is a user act.
- **Embedding stills through a text-only model** — the stills clause; never faked.
- **A registry-singleton write from the slot** — would clobber S1's persona record; the slot grades its own record through the registry's pure law instead.
