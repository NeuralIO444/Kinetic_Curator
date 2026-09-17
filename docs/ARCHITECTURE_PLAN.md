# Kinetic_Curator — Architecture Plan

*September 17, 2026. Planning only — no code, no PR.*

This is the build order for the three decisions you just made:

1. **Cut the SVG live canvas, go fully WebGL.** One instrument, no more studio-first/live-canvas split.
2. **Teenage Engineering philosophy.** Deliberate limitations, creativity inside constraints. Not Houdini, not After Effects.
3. **Panel consolidation.** 7 panels are too many. New features earn their surface or live inside existing ones.

Each phase below says what it means in plain language, what changes for you, what you approve, the risks, and how we know it's done. Phases are ordered by dependency; independent tracks are marked so they can run in parallel.

---

## Phase 0 — The rules of the game (approve first, ~1 day)

**What it means:** Before any building, we write down the laws so every future decision is consistent. This is mostly documents, not code.

**Scope:**
- **Feature gate, made real.** Every PR gets a required "Loop" section: which part of *perform → capture → learn → guide* does this serve, in one sentence. No answer, no merge. Plus a `docs/DECISIONS.md` log — one entry per merged feature: what we built, what we considered and rejected, which loop stage it serves. Append-only, plain language.
- **Panel budget rule.** The tab strip is capped at 4 tabs. A new tab requires retiring an old one. New features go into an existing tab's section or a modal — never a new tab by default.
- **Governor cost-tier contract (spec).** Every effect/pass declares its cost up front (details in Phase 3). Written as a spec doc first.
- **Taste v1 file format (spec).** What `taste.json` contains and how versions work (details in Phase 4). Spec first.

**What changes for you:** Nothing in the app. But every build after this follows these rules, and you can point at them when something feels like scope creep.

**What you approve:** The four rules above — especially the loop gate wording and the 4-tab cap.

**Risks:** Almost none. It's writing.

**Done when:** The four docs exist on main and the PR template has the Loop section.

---

## Phase 1 — The live WebGL loop (the big one; Track A)

**What it means:** Today the app you play is drawn with SVG (the browser's vector graphics), while stills and exports render on the GPU with WebGL. Every new effect lands on the GPU side and the live canvas never sees it — that's the split we're ending. This phase makes the live canvas itself run on WebGL, so what you play is what renders. One instrument.

**How it goes (strangler-fig — the SVG stays alive until the WebGL loop proves itself):**

- **1a. Loop behind a flag.** The existing WebGL renderer (which already draws stills) gets a live mode: redraw every frame from the same scene contract the SVG reads. SVG stays the default. Done = the flag build holds 60fps and matches the SVG within the 10% pixel bar on the golden test set.
- **1b. Interactions move over.** Evolve, morph, phrase clock, beat pulse — these already flow through the store into the scene contract, so the loop mostly just reads them. The known gap: text runs (the glyph atlas exists but text isn't composited in the GL renderer yet). Wire that here.
- **1c. Snapshot/record switch.** Today snapshots serialize the SVG. Switch capture to GPU readback (the export-still path already exists). Your `s` hotkey and recordings keep working, now from the real pixels.
- **1d. Custom assets become textures.** Your saved projects keep their custom SVGs exactly as today (the preservation work stays — the *source of truth* doesn't change). At load time the app bakes each SVG into a GPU texture. Same artwork, new plumbing.
- **1e. Cut the SVG.** Delete the SVG render tree and the legacy hooks (the old accumulation buffer, the SVG item builder). The scene contract remains the single interface everything talks through.

**What changes for you:** During 1a–1d, nothing visible — the app should look and feel identical (that's the point of the parity bar). After 1e, the live canvas finally shows ACCUM trails, TUNNEL/PRISM, and every GPU effect live. The "try it in studio.py" era ends.

**What you approve:** The flag flip in 1a (you play it, you tell us if it feels right), and the final cut in 1e.

**Risks:**
- *Perf.* The SVG path is cheap for simple scenes; the GL loop must hold 60fps on your Mac Studio at the BALANCED tier. If it doesn't, we tune before cutting — the flag lets us do that safely.
- *Text.* The one known missing piece in the GL renderer. Bounded work, flagged explicitly.
- *Recording.* Video capture moves to readback; verify a recorded clip end-to-end before 1e, not after.
- *Rollback story:* at every sub-phase the SVG path still exists behind the flag. If the GL loop misbehaves, the flag flips back in one commit. After 1e there is no rollback — that's why 1a–1d have parity gates.

**Done when:** Flag build matches SVG within 10% pixels on goldens, holds 60fps, text renders, snapshots/recordings work from readback, all 7 panels' controls drive the GL loop, then SVG code is deleted and CI is green.

---

## Phase 2 — Panel consolidation (Track B, can run alongside Phase 1)

**What it means:** The 7 tabs become 4, organized around what you're actually doing — not around code modules. Today's tabs: CANVAS, LAYOUT, LAYERS, ASSETS, STIMULI, GHOST STATION, OUTPUT. The Shell already supports this (panels are registry data; the secondary zone is a tab strip).

**Proposed information architecture:**

| New tab | Merges | What lives there |
|---|---|---|
| **PLAY** | Ghost Station + Stimuli | Perform: EVOLVE chips, morph, phrase clock, audio-reactive, ACCUM gestures (FREEZE/CLEAR/SWELL), shimmer guidance. The instrument surface. |
| **BUILD** | Layout + Layers | Compose: layout params, presets, layer stack, blend modes, mattes. Layers *are* layout — they never deserved a separate tab. |
| **ASSETS** | (unchanged, demoted) | Becomes a drawer/modal like the Asset Studio already is — not a tab. You open it, grab an asset, close it. |
| **OUTPUT** | (unchanged) | Capture: stills, print, batch, recordings. |

CANVAS stays as the primary zone — it just becomes the WebGL viewport after Phase 1.

**Why this shape:** It mirrors the loop — PLAY (perform/guide), BUILD (perform), OUTPUT (capture). LEARN (taste) is mostly invisible by design; its visible parts (shimmer, why-copy, the taste readout) live in PLAY, because guidance belongs where you perform.

**TE aesthetic rules for the new tabs:**
- One enum beats six sliders (already the house creed — enforce it in review).
- ACCUM's TUNNEL/PRISM/FLOW sliders: keep, but they live in PLAY as *performance* controls, not in a technical ghetto. If a control is only touched once per session, it belongs in a collapsed "deeper" section.
- The ShedBadge (governor indicator) graduates from stopgap to a proper **constraint readout** in PLAY: current tier, what's shed, why. Limitations shown honestly are a TE feature, not an error message.

**What changes for you:** Fewer tabs, less hunting. Ghost Station and Stimuli stop being two places. The asset pool stops pretending it's a workspace.

**What you approve:** The 4-tab map above — especially whether PLAY absorbing Stimuli feels right to your hands.

**Risks:** Muscle memory. You've learned 7 tabs; the reorder will feel wrong for a week. Mitigation: keep hotkeys stable, keep every control reachable (nothing deleted, only moved).

**Done when:** 4 tabs (+ asset drawer), all existing controls present and working, no new tabs added, CI green.

---

## Phase 3 — The governor as product (Track C; needs Phase 1 for real GPU timings)

**What it means:** The Showrunner governor already exists (shed ladder, per-tier budgets, asset cost scores). This phase turns it from a safety net into the enforcer of the TE philosophy: limitations you can see and trust.

**Scope:**
- **Cost-tier contract.** Every effect and pass declares, at registration: `tier` (0 = structural, never shed: compositing; 1 = shed first: ACCUM, bloom extras, flow feedback, echoes; 2 = quality scalers: turbulence octaves; 3 = cosmetic), plus memory and time estimates. The shed ladder reads this registry instead of hard-coded knowledge. New ACCUM Phase B passes slot in: flow feedback = tier 1, echoes = tier 1 *with* the memory gate (the ≥2K tap cap), audio modulation = effectively free (it's scalar math per frame — never shed, it's the cheapest thing in the chain).
- **Per-stage patrol with teeth.** The FPS meter already accepts `reportStage(name, ms)`. Wire the real GPU stages (kernel, accum, composite, fx) into it; when a stage blows its budget, the ladder sheds in documented order. No more guessing which effect choked the frame.
- **Visible constraints.** The constraint readout in PLAY (Phase 2) shows: current tier, what got shed, auto-recovery when headroom returns. The silent-cull trap stays dead — the UI never shows an effect as active while the governor has it shed.

**What changes for you:** When the instrument gets heavy, it tells you what it dropped and why, in plain language — and it drops the right things in the right order instead of stuttering.

**What you approve:** The shed order (pixels → quality → ACCUM → assets → counts → motion → stop). Tell us if that priority feels wrong for performance.

**Risks:** Mis-declared costs (an effect claims tier 2, behaves like tier 0). Mitigation: the patrol measures reality and the selfchecks assert declared vs. measured on the golden set.

**Done when:** Every effect declares a tier, the ladder reads the registry, stage timings are real, the readout is honest, CI green.

---

## Phase 4 — Taste as first-class (Track C; independent of Phase 1, can start now)

**What it means:** The MLX curator learns your taste from renders you keep. Today that's a pipeline; this phase makes *taste itself* a durable, inspectable object instead of a hidden artifact.

**Scope:**
- **`taste.json`, versioned.** Contains: embedding model id + dims, the trained probe weights, a manifest of the training renders (hashes, not images), label counts, timestamps. `curator.py inspect` prints it in human terms ("leans warm, dense, high-chroma palettes"). Exportable — your taste can move machines with you.
- **Two ledgers, enforced by architecture.** Two separate logs: `performed.jsonl` (controls you touched live, with context — including whether shimmer was visible) and `kept.jsonl` (favorites/HITS — the only training labels). The train command accepts *only* the kept ledger as labels; there is deliberately no flag for feeding it performed data. Shimmer session logs append to performed. This is the structural guarantee behind "learn from kept, never from clicks" — it's not a policy doc, it's the shape of the code.
- **`scores.json` flow, versioned.** Studio writes `scores/{version}` (`{candidateId: percentile}`); the app loads it at session start (the whisper prototype already does this). Schema gets a version field on day one.
- **v1 → v2 migration story.** Embedding models change (it already happened once: 768 → 1152 dims). Rule: the index carries its dims + model id; a mismatch refuses with a clear message ("taste index is v1/768-dim, model is v2/1152-dim — re-embed required"), never silently mixes. Migration = re-embed + re-train; old files are archived, not deleted, so v1 stays reproducible.

**What changes for you:** You can look at your taste, back it up, and trust that the machine isn't learning from misclicks. When the model upgrades, the app tells you plainly what to re-run instead of quietly degrading.

**What you approve:** The two-ledger rule as a hard guarantee (it's the soul of the shimmer design), and the `curator.py inspect` output format — it should read like your eye, not a spreadsheet.

**Risks:** Ledger discipline depends on every favorite/HIT path writing to the kept ledger — audit the paths (hotkey `f`, FAVORITE button, HITS export) so labels can't leak in or out silently.

**Done when:** `taste.json` v1 exists with inspect/export, both ledgers flow correctly, scores schema versioned, a dims-mismatch is demonstrated to refuse cleanly, docs updated.

---

## Phase 5 — SVG removal (Track A, after Phase 1)

**What it means:** The actual cut. The legacy SVG render tree, the old 2D accumulation buffer, the SVG item builders — deleted. The scene contract stays; it's the interface the WebGL loop already speaks.

**Scope:** Delete `CanvasPanel`'s SVG tree (`Layer.jsx`, `AssetSpriteSheet`, `MaterialSheet`, `FxFilterDefs` live usage), `useCanvasItems`, `useCanvasLife`, `useAccumulationBuffer`, and the SVG serialize path in `useMediaExport`. Keep: project save format (custom SVGs preserved as asset sources), the parity harness (now compares GL-then vs GL-now for regression).

**What changes for you:** Nothing visible — that's the entire point. The app should be indistinguishable from the day before, except everything on screen is now the real GPU output.

**What you approve:** The cut itself. We'll show you the before/after parity report; you say go.

**Risks:** Dead references (something imports a deleted hook). Mitigation: lint + full selfcheck + e2e before merge; the parity harness stays as the regression net.

**Done when:** No SVG render code remains in the live path, saves still round-trip custom assets, CI green, and the repo's docs no longer describe two live recipes.

---

## Dependency map

```
Phase 0 (rules) ─┬─► Phase 1a–1e (WebGL live) ──► Phase 5 (SVG cut)
                 ├─► Phase 2 (panels) ──► (lands best after 1c; independent code)
                 ├─► Phase 3 (governor) ──► (needs 1 for real GPU timings)
                 └─► Phase 4 (taste) ──► (fully independent; can start now)
```

**Suggested build order:** Phase 0 → Phase 4 + Phase 1a in parallel → Phase 2 → Phase 1b–1e → Phase 3 → Phase 5.

## Standing decisions (don't re-litigate)

- Pixel parity bar stays: <10% diff is a pass ("art, not rocket science").
- The scene contract is the interface; the renderer behind it is replaceable.
- Saved projects keep custom SVGs as canonical asset sources forever — baking to textures is a load-time detail.
- New languages/toolchains still need your explicit word (unchanged).
- Docs PRs (#231, #233, #236) remain unmerged until you say so — they're reference for these phases.
