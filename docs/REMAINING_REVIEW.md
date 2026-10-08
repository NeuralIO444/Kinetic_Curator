# Remaining docs — overlap review

**Date:** 2026-10-07 · 101 docs remain after archiving 17 spent plans (`docs/archive/`).
One section per cluster: what's there, where they overlap, what contradicts code,
and a keep / merge / archive recommendation. Terse by design.

## Motion (6 docs, heavy overlap)

- `KINETICS.md` — the naming glossary (umbrella nouns for issues/PRs). **Keep** — it's the vocabulary contract.
- `MOTION_SYSTEMS.md` — inventory traced live with file:line + play script. **Keep** — the only grounded one.
- `ORGANIC_MOTION.md` — plan-not-patch diagnosis; companion to 4 other docs. **Merge** into MOTION_SYSTEMS or archive — its "plan" framing predates #287.
- `KINEME_SPEC.md` — "no code." **Archive** once #1151 (palette-breath) lands or dies; until then it's the only kineme spec.
- `NOISE_AND_LAYERS.md`, `kc-animation-research.md` — weather-on-tape research. **Keep** (research), but note ORGANIC_MOTION already summarizes them.
- `docs/kinetics/` (clock.md, fields.md) — subsystem notes. **Keep.**
- **Overlap:** four docs (KINETICS, KINEME_SPEC, ORGANIC_MOTION, MOTION_SYSTEMS) all answer "how things move." Recommendation: MOTION_SYSTEMS as the working inventory, KINETICS as vocabulary, archive the rest when their plans resolve.

## Personas (7 docs)

- `PERSONAE_TRIAD.md` — the unified report (merged PR #1135). **Keep** — canonical.
- `LOIS_PERSONA.md`, `LOIS_TELEMETRY.md`, `DAVIS.md` (P07 panel spec) — **Keep**; live references.
- `DAVIS_STIMULI_PLAN.md`, `PERSONA_DLC_ROADMAP.md` ("no code") — **Keep as ideas**, clearly labeled.
- `PERSONA_MLX_PIPELINE.md` — says "not committed to the repo" but lives here; overlaps TASTE_762_PLAN. **Merge** into the MLX cluster's single plan (below).
- **Overlap:** persona→MLX is described in both this cluster and MLX/taste. One should own it.

## MLX / taste (5 docs, one unbuilt run)

- `MLX_CURATOR_RUNBOOK.md`, `MLX_HARNESS_RUNBOOK.md`, `TASTE_762_PLAN.md` ("PLAN ONLY"), `MLX_OPPORTUNITIES.md` ("research only") — four docs circling the same unbuilt Mac Studio run (#762, blocked on hardware).
- **Recommendation:** keep the CURATOR runbook as the single procedure, **merge** HARNESS + TASTE_762 into it, **archive** OPPORTUNITIES or fold into one "future MLX" section. Four docs for zero runs is the worst ratio in the repo.

## Governor / perf (7 docs)

- `COST_TIERS.md` — live. **Keep.**
- `SHOWRUNNER.md` (doctrine), `GOVERNOR_LOG.md` (observability) — **Keep**; complementary, not overlapping.
- `GOVERNOR_TE_ROADMAP.md`, `PERF_ROADMAP.md` ("plan only — no code"), `DETENT_BUDGET_PLAN.md` ("no code") — three unbuilt perf plans. **Merge** into one perf backlog or archive; none has moved since September.
- `BENCHMARK_REPORT.md` — research with TE/Davis verdicts. **Keep** (research).

## Assets (9 docs)

- `ASSET_AUTHORING.md`, `ASSET_CHANNELS.md`, `PRESET_LIBRARY.md` (#220), `KILN_COLUMNS.md` (#179), `VORTEX_RWB.md` (#178) — **Keep**; live references.
- `ASSET_LIBRARY_DEV_PLAN.md` ("PLAN ONLY"), `ASSET_LIBRARY_EXPLORATIONS.md` (future directions) — overlap: both scope the library's future. **Merge** into one.
- `ASSET_LAB.md`, `CHIP_LAB.md`, `HARFBUZZ.md` — deferred. **Keep** as deferred, one line each; they're the deferred pile's inventory.
- `CROOKED_HAND.md` / `OPEN_HAND.md` — ideas (0 files in code) doubling as design doctrine. **Keep**; clearly label unbuilt.
- `CHIAROSCURO.md` — lighting principle, partially in code. **Keep.**

## Pipeline / output / FX (11 docs)

- `PIPELINE_PLAN.md`, `QUALITY.md`, `SHADER_DEBUG.md` (#193), `RUN_MANIFEST.md`, `FAILURE_HISTORY_SCHEMA.md` — **Keep**.
- `STAGE_3.md`, `STAGE_4.md` ("no code") — **Keep as ideas**, labeled.
- `MACOS_AUDIO_ENVELOPE_PLAN.md` — unbuilt sidecar. **Keep** (tied to #1144 beat work).
- `FX_LAYERS.md` — **Keep** (references the frozen #185 chaining rule).
- `FX_DITHER_PLAN.md` — "does not ship until Matt commissions it." **Keep**; correctly gated.
- `WET_ENGINE.md` — the slider works; the standalone service is the idea. **Keep**, header already scopes it.
- `ACCUM.md` (live), `ACCUM_CEILING_HARNESS.md` (#361) — **Keep**. `ACCUM_VISION.md` ("planning pass only") — **Merge** into ACCUM.md or archive when its phases resolve.

## Docs-meta / doctrine / UI (the rest)

- **Living doctrine — keep:** `MANIFESTO.md`, `PHILOSOPHY.md`, `ALWAYS_ALIVE.md`, `PLENUM.md`, `DESIGN_SYSTEM.md`, `TAXONOMY.md`, `PATTERN_SPEC.md`, `CONTACTS.md`, `AGENT_SOP.md`, `DECISIONS.md`, `ROADMAP_V1.md`, `BUILDING_AND_RUNNING.md`, `BUGLIST.md`.
- **UI/shell:** `DESIGN_SYSTEM_MIGRATION.md`, `SURFACES.md`, `UI_SMALL_PASS.md`, `UX_AUDIT_2026-10-03.md` — keep; `SHELL_BRAND.md` — borderline (mixed review-status, left in place); `TEMPO_AND_CHIPS.md` — parked pending spine-E sign-off, keep labeled; `MODULATION_LEDS.md` — deferred, keep.
- **Bio:** `BIO_DRIVES_PLAN.md` (header fixed 2026-10-07 — #287 built the core), `SYNTHETIC_BIOLOGY.md` (deferred vocabulary) — keep.
- **Ideas, clearly labeled — keep:** `FAVORITES_SEQUENCER.md` ("nothing is built"), `TWO_PLANES.md`, `Tropism_Engine.md`.
- **History — keep:** `EMBARGO.md` (lifted, record), `KC1_PHASES.md`, `GH_ISSUES_DRAFT.md`, `task.md`, `session_roadmap.md`, `wiki-home.md`, `TRAILS_EMITTERS_REPORT.md`, `BENCHMARK_REPORT.md`, `ROOM_REVIEW.md`, research reports.
- **Borderline (left in place, need Matt's call):**
  - `PANEL_CONSOLIDATION_PLAN.md` — phases 0–5 shipped, 6–12 disputed; AGENTS.md still points agents at its open questions. Do not archive until #248's end state is decided.
  - `GL_CONTRACT.md` — still the **normative live spec** for the WebGL backend ("Status: v1, live"). Not spent.
  - `SHELL_BRAND.md` — mixes shipped tracks with open review items.

## Contradictions with current code (found in this pass)

1. **`docs/architecture.md` is stale** — "Declarative React + SVG generative instrument. Live preview is primarily an `<svg>` tree." The SVG renderer was retired (WEBGL_PHASE6); WebGL2 is the backend and SVG survives only as a dev parity reference (`GL_CONTRACT.md`). Needs a rewrite or an archive header.
2. **`docs/KC1_ARCHITECTURE_ROADMAP.md` claims** "Phase 1–4 implemented and validated" (Tauri shell, Metal zero-copy, Core ML curation, AVFoundation streaming) — but current direction is a WebView-wrapped web app, and Syphon (#608) is an inert stub. Verify or re-scope.
3. **`docs/BIO_DRIVES_PLAN.md`** said "plan only — no code" — **fixed 2026-10-07**: #287 built the six mechanisms + symmetry fan; only the Haeckel body sections remain unbuilt.
4. **`docs/ROADMAP_V1.md`** and `AGENTS.md` both claim to be the ordering surface; AGENTS.md wins per its own precedence rule, but the duplication confuses agents. Pick one.
5. `docs/research/*.md` (2026-10-07) cited the archived `docs/KINEME.md` — links updated to `docs/archive/KINEME.md` in this pass.

## Net recommendation

- **Merge candidates (do now):** MLX runbooks → one procedure; asset-library DEV_PLAN + EXPLORATIONS → one; ACCUM_VISION → ACCUM.md.
- **Archive when resolved:** KINEME_SPEC.md (on #1151), ORGANIC_MOTION.md (subsumed by MOTION_SYSTEMS), GOVERNOR_TE_ROADMAP / PERF_ROADMAP / DETENT_BUDGET (if still untouched next review).
- **Fix:** `architecture.md` (stale SVG claim), `KC1_ARCHITECTURE_ROADMAP.md` (unverified native claims).
- **Leave for Matt:** `PANEL_CONSOLIDATION_PLAN.md` (#248 end state), `SHELL_BRAND.md` (review status), `GL_CONTRACT.md` (live — do not touch).
