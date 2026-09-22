# Decisions

Append-only. One entry per merged feature or standing rule: what it is, why, which Loop leg it serves. Don't rewrite an existing entry to reflect a later change — append a new one and let the trail show the history. Exception: a phase explicitly told to tick a box in an existing entry (e.g. PANEL_CONSOLIDATION_PLAN.md Phase 11) may edit that one checkbox in place.

---

## 4-tab cap

**What:** The secondary panel tab strip (`panelsByZone('secondary')` in `app/src/composition/PanelRegistry.js`) is capped at 4 tabs. CANVAS (the primary zone) doesn't count against the cap. A new tab requires retiring one — the registry does not grow without a trade.

**Why:** Constraints are the aesthetic (the manifesto's own phrase). A tab strip that grows without bound is the UI equivalent of feature creep; capping it forces every new surface to justify displacing something, not just adding.

**Exception, named explicitly:** [`docs/PANEL_CONSOLIDATION_PLAN.md`](PANEL_CONSOLIDATION_PLAN.md) (issue #248) drains DAVIS and STIMULI into a new PLAY tab across several phases while PLAY and the old tabs briefly coexist — the tab strip legitimately holds more than 4 tabs mid-sequence. That's an **end-state** rule, not a per-PR rule: don't bounce an in-flight consolidation PR for temporarily exceeding 4, only for landing above 4 at the end of the sequence (Phase 11 is where it returns to exactly 4: BUILD, PLAY, OUTPUT + the ASSETS drawer).

**Loop leg:** guide (it's a standing constraint on every future feature, not a feature itself).

---

## Governor cost-tier contract

**What:** Every GPU effect or pass declares its cost tier at registration, next to its own definition — never in a separate hard-coded list. Four tiers:

- **0 — structural, never shed:** compositing, present plumbing, the effectively-free audio modulation (scalar math per frame).
- **1 — shed first:** ACCUM passes, bloom extras, flow feedback, echoes. The governor's `perfTier1` mechanism covers exactly this set (`tier1ShedIds()`).
- **2 — quality scalers:** turbulence octaves, blur radii — expensive, but not shed-first.
- **3 — cosmetic:** cheap color ops (invert, posterize, scanlines, ...).

A declaration is `{ tier, memoryBytes, timeMs, notes }`, optionally `memoryGate: { minWidth, maxTaps }` for effects that need one (e.g. echoes: width ≥ 2048px caps taps at 3). The governor's shed ladder (`app/src/hooks/governorCuts.js`) reads this registry instead of hard-coded per-effect knowledge; `gl/debug/measureCosts.mjs` measures real GPU cost, and `gl/costTiers.selfcheck.mjs` fails CI when a declaration doesn't match the measurement.

**Where it actually lives — this is a summary, not the spec.** The full contract, including field semantics and the memory/time estimate conventions, is the doc comment at the top of `app/src/gl/costTiers.mjs`. Read that file, not this entry, if you're registering a new effect's tier.

**Status:** already fully shipped (ARCHITECTURE_PLAN.md Phase 3, "backend hardening 3/6"). This entry exists so it's discoverable from the decisions trail, not because it's new.

**Loop leg:** guide (it's the mechanism the shed ladder uses to decide what to protect during perform).

---

## Taste v1 file format (spec only — not yet implemented)

**What:** `curator/taste.js` today is an interim heuristic scorer — it measures 15 real visual features from a candidate's params and scores them against a persona's hand-distilled Loves/Avoids (`personaTastes.js`). It is not the MLX embedding-based taste system `docs/ARCHITECTURE_PLAN.md` Phase 4 describes, which hasn't shipped (`docs/MLX_HARNESS_RUNBOOK.md` hasn't been run on the Mac Studio yet). This entry specs the file format that system will use, so the format is settled before the training/inference code is written — the interim scorer keeps running exactly as-is until that lands.

**`taste.json`, versioned:**
- Embedding model id + dimension count (e.g. `1152`; the dims changed once already, 768 → 1152, which is why the version field exists).
- Trained probe weights.
- A manifest of the training renders — content hashes, never images (privacy, and it keeps the file small).
- Label counts and timestamps.
- `curator.py inspect` prints it in human terms ("leans warm, dense, high-chroma palettes"), not a raw weight dump. Exportable — taste moves machines with the file.

**Two ledgers, enforced by architecture, not policy:**
- `performed.jsonl` — every control touched live, with context (including whether shimmer was visible at the time). Never used as training labels.
- `kept.jsonl` — favorites/HITS only. The **only** thing the train command accepts as labels; there is deliberately no flag to feed it performed data. This is the structural guarantee behind "the taste model learns from your keeps only, never clicks" (the manifesto's own line) — it's the shape of the code, not a comment asking a future author to be careful.

**`scores.json`, versioned:** Studio writes `scores/{version}` as `{candidateId: percentile}`; the app loads it at session start. Schema carries a version field from day one — no un-versioned v0 to migrate away from later.

**v1 → v2 migration rule:** the index carries its own dims + model id. A mismatch **refuses with a clear message** ("taste index is v1/768-dim, model is v2/1152-dim — re-embed required") — it never silently mixes dimensions. Migration is re-embed + re-train; old files are archived, not deleted, so a v1 result stays reproducible after a v2 upgrade.

**Not built here:** none of the above is implemented by this entry. This is Phase 0 of `docs/PANEL_CONSOLIDATION_PLAN.md` writing the spec down per issue #248's instructions — implementation is `docs/ARCHITECTURE_PLAN.md` Phase 4, tracked separately, needs the Mac Studio MLX runbook to have actually run first.

**Loop leg:** learn (this is the format the curator's learning-from-kept-renders pipeline will persist to disk).
