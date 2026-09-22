# KC-1 panel consolidation plan — 7 panels to 4 (#248)

*Reviewed against `main` at `d62a769` (2026-09-22). Plan, not a patch.*

Companions: [`ARCHITECTURE_PLAN.md`](ARCHITECTURE_PLAN.md) Phase 2 (the source material — see §2.1, the referenced external plan file does not exist in this environment), [`ENGINE_PLAN.md`](ENGINE_PLAN.md) (structural/tonal model for this doc), [`SHELL_BRAND.md`](SHELL_BRAND.md), [`TWO_PLANES.md`](TWO_PLANES.md), [`EMBARGO.md`](EMBARGO.md), [`AGENTS.md`](../AGENTS.md).

Standing bars: 4 tabs at the end state, nothing deleted (moved only), no new controls invented, no matte UI (engine has `layer.matte` — no panel wires it, and this consolidation is not the PR that adds one), no Studio/Perform plane toggle (that is TWO_PLANES, explicitly later), no new icon glyphs (Matt draws icons, #346) beyond reusing what already exists.

---

## 0. What's already shipped — do not redo

| Thing | Where | What it means for this plan |
|---|---|---|
| Panel registry + Shell composition root | `app/src/composition/PanelRegistry.js`, `Shell.jsx` | Panels are data (`{id, title, icon, component, zone}`). Adding/removing/renaming a panel is a registry edit, not a Shell rewrite. `panelsByZone('secondary')` drives the tab strip; `zone: 'primary'` is CANVAS only today. |
| `BeatRouter` built for this move already | `app/src/panels/davis/BeatRouter.jsx` | Its own header comment: "Built as a standalone section so it ports cleanly into the consolidated PLAY panel." Literally already portable — move it, don't rewrite it. |
| Governor cost-tier contract | `app/src/gl/costTiers.mjs` (backend hardening 3/6, = ARCHITECTURE_PLAN Phase 3) | **Already fully shipped**, registry + selfcheck + measured-cost gate all exist. Phase 0's "governor cost-tier contract spec" doc requirement is a *write-up of code that already exists*, not new design. Do not re-derive the tier table — summarize `costTiers.mjs`'s own doc comment. |
| Governor shed readout, global | `app/src/components/TapeCounter.jsx` (rendered in `MasterBar.jsx`) | Its own header comment literally calls itself "a single PLAY readout." It already merges every shed signal (`shedSummary()`, `getGovernorEvents()`, tape-full, watchdog, render-fault) into one honest pill, visible on every tab today. The PLAY-panel governor readout phase (§3 Phase 10) is an **in-panel expansion** of this, not a rebuild — reuse `hooks/governorCuts.js` `shedSummary()` and `gl/governorEventLog.mjs` `getGovernorEvents()` directly. |
| The "honest shed" UI pattern | `app/src/panels/CanvasPanel.jsx` lines ~110–132 (`ACCUM` vs `ACCUM HELD` pill) | This is the exact pattern to replicate for TUNNEL/PRISM/FLOW and the ACCUM gestures once they land in PLAY: `accumOn` (the setting) vs `accumOn && !perfTier1` (the effective state) are already two different booleans in the store — the pattern exists, copy it. |
| Single source of truth for hover titles + `?` sheet | `app/src/data/helpCopy.js` (`HELP_TOPICS`, `helpText()`) + `helpCopy.selfcheck.mjs` | #158's mechanism is done. What's not done: several `group` labels still say `'Ghost Station'` / `'Stimuli'` / `'Layout'` / `'Layers'` / `'Assets'`, and several `text` strings say "Ghost Station" verbatim (e.g. "Not the Ghost bar"). That relabeling is the literal "#158 remainder" the issue names. |
| First-run tour, built portable on purpose | `app/src/data/tour.js`, `TourOverlay.jsx` (#222) | Header comment: "Pure data + helpers — no components, so the tour stays portable to the planned PLAY/BUILD/ASSETS/OUTPUT consolidation." `tab` fields are ids (`'layout'`, `'output'`, `null`), not hardcoded titles — cheap to repoint. Step 3's `body` text says "the DAVIS tab" in prose — that needs a copy edit, not a data-shape change. |
| Lazy full-screen modal pattern (drawer precedent) | `AssetPoolPanel.jsx` → `AssetStudioModal.jsx` (already lazy-loaded from inside the panel), `OutputPanel.jsx` → `PrintDeskModal.jsx` | The codebase already has the exact interaction the issue wants for ASSETS ("open it, grab an asset, close it") — it's just one level too shallow (still opened from inside a tab, not from persistent chrome). Reuse this lazy-import + local-state-toggle pattern for the ASSETS drawer trigger; do not invent a new overlay primitive. |
| `#341` FX 4-cap ghost-slot UX | `LayersPanel.jsx` (`fxGhosts`/`ghosts` arrays) | Shipped 2026-09-22 (`feat(layers): FX 4-cap ghost slots`). The BUILD-absorbs-LAYERS phase inherits this as-is — do not touch the ghost-slot math, just relocate the file's JSX. |
| **Phase 1 (ASSETS: tab → drawer)** | `PanelRegistry.js` (`assets` entry, `zone: 'drawer'`), `Shell.jsx`, `components/DrawerOverlay.jsx` | Shipped 2026-09-22, PR #415 (`feat(ui): ASSETS tab -> drawer (#248 Phase 1)`), landed after this plan doc was first written and never back-filled here until now. §3's Phase 1 section below is historical record of what was built, not a pending task — do not redo it. Phase 2 (BUILD absorbs LAYOUT) is the next open phase. |

---

## 1. Diagnosis in one page

Seven production tabs today (`PanelRegistry.js`): `canvas` (primary), `layout`, `layers`, `assets`, `stimulus`, `davis`, `output` (secondary), plus three dev-only panels (`shaderlab`, `xray`, `govtune` — untouched by this plan, they're `import.meta.env.DEV`-gated and not part of the 7→4 map).

What's actually inside each old panel, by file:

| Old panel | Files | Control clusters |
|---|---|---|
| **DAVIS** ("GHOST STATION") | `DavisPanel.jsx` + `davis/{EvolveControls,BeatRouter,MorphControls,PhraseControls}.jsx` | EVOLVE target chips (shimmer-scored) + SOURCE/INTERVAL; BeatRouter (conditional); MORPH EVOLVE + DURATION; PHRASE LOOP (CLOCK/BPM/LENGTH/MODE + progress bar); EVOLVE/STOP + FAVORITE + NEW SEED buttons; 4 sub-seed stream mutators + reset; ACCUM gestures FREEZE/CLEAR/SWELL (conditional on `layoutParams.accumulation`). `davis/FavoritesList.jsx` is **dead code** (superseded by `FavoritesTray.jsx`, per its own header comment) — do not resurrect it. |
| **STIMULI** | `StimulusPanel.jsx` + `stimulus/{SourceControls,ReactivityControls,MeterBlock,ModSlider}.jsx` | AUDIO toggle + collapsible SETUP (device/file select, monitor, gain); REACTIVITY (DEPTH/SCALE/ALPHA/LIFE mod sliders); ENVELOPE (ATTACK/DECAY/RESPONSE/SWELL ballistics, #306); waveform MeterBlock. |
| **LAYOUT** | `LayoutPanel.jsx` (32-line shell) + `layout/{ModeGrid,MixBar,ParamBlock,ToggleRow,CuratorBar}.jsx` | ModeGrid (flagship voice chips, stub mode grid, MY VOICES shelf, MixBar crossfade); CuratorBar (presets popup, persona-voice popup, Curator randomize button); ParamBlock (~20 sliders: COUNT/SCALE/ROTATE/ALPHA/JITTER/DENSITY/HUE, swarm physics, moth/hype params, SYMMETRY/BEHAVE chips); ToggleRow (BLEED/MIRROR/OVERLAP/ACCUM toggles + FADE/GLOW sliders + **TUNNEL/PRISM/FLOW sliders**, all ACCUM-gated). |
| **LAYERS** | `LayersPanel.jsx` (163 lines, not sub-split) | Layer stack rows (reorder/visible/solo/dup/remove), content+FX ghost slots (#341), blend-mode select, opacity slider, PATCH row (MOD/FIELD/FEED + strength), inline `FxEffectEditor` for FX layers. |
| **ASSETS** | `AssetPoolPanel.jsx` (already self-contained, already opens `AssetStudioModal` as a lazy modal) | Category filter chips, search, drag/drop/paste SVG ingest, asset tile grid (toggle/weight/solo/dup/edit/rename/swap/delete), NEW/IMPORT header buttons. |
| **OUTPUT** | `OutputPanel.jsx` + `output/*.jsx` | Unchanged per the issue — no phase needed for OUTPUT's internals. |

Sizing this for **cheapest-first** ordering:

- **ASSETS** is one already-modular file that already does its own lazy-modal trick internally — the smallest, lowest-risk move (a mount-point change, not a content rewrite).
- **LAYOUT** is already decomposed into 5 subcomponent files with a 32-line shell — a near-mechanical "rename and re-parent" job.
- **LAYERS** is one dense, non-decomposed 163-line file — moving it means folding its logic into BUILD as a second section, slightly more surface than LAYOUT but still one panel, one direction.
- **DAVIS + STIMULI → PLAY** is the largest and riskiest merge (2 panels, ~7 distinct control clusters, a brand-new governor-readout requirement, and the TUNNEL/PRISM/FLOW slice that has to come *out of* LAYOUT/BUILD's `ToggleRow`, creating the one real cross-panel dependency in this whole plan). It goes last, split into the most phases, in the order the issue's own PLAY bullet lists the clusters.

---

## 2. Open questions — flag, do not silently resolve

1. **The plan file the issue points at does not exist here.** `~/workspace/your_files/ui-simplify-plan/teenage-engineering-ui-plan.md` is outside this repo and was not present in this environment. This document was built from `docs/ARCHITECTURE_PLAN.md` Phase 2 (which independently describes the identical 4-tab map, so the two are very likely the same plan) plus a direct code inventory. **If the external file exists elsewhere and says something different in the details, reconcile before executing — do not assume this document silently supersedes it.**
2. **EMBARGO.md may still be in effect.** Updated 2026-09-22, it says spines A–F are merged but the embargo is "still standing" until Matt has played Night Migration at 30/60fps and that sign-off is recorded in the file — which it is not, as of this writing. The embargo's explicit "do not implement" list is about new *features* (labs, chip editors, showcase rows); panel consolidation is control *relocation*, and `ENGINE_PLAN.md` §2 separately says #248 "does not block the spine" — but neither document explicitly says panel-moving code is exempt from the embargo. **Phase 0 (pure docs) is unambiguously fine** — EMBARGO.md explicitly allows "docs that narrow scope." **Recommend getting Matt's explicit go-ahead before starting Phase 1** (the first panel-moving code PR) rather than inferring consent from ENGINE_PLAN's silence.
3. **TWO_PLANES (Studio/Perform) is a separate, later, bigger initiative that reuses this plan's output — it is not part of #248.** `docs/TWO_PLANES.md` and `docs/SHELL_BRAND.md` both describe #248's 4-tab map as raw material for a future Studio/Perform mode toggle ("Studio uses BUILD/ASSETS/OUTPUT; Perform is PLAY + STIMULI + tape"). TWO_PLANES.md itself says "Do not start this instead of #387" and is in EMBARGO's deferred pile. **No phase in this plan builds a plane toggle, a STUDIO label, or hides chips behind a plane.** If a future agent reads TWO_PLANES.md and concludes #248 should include plane work, that is a misread — flag it back to this doc.
4. **Tab `id` stability is a judgment call this plan makes explicitly, not implicitly.** `PANEL_REGISTRY` entry `id` feeds `localStorage['kc:active-panel-tab']` and `tour.js`'s `tab` field. This plan renames ids to match new tabs (`'play'`, `'build'`) rather than keeping legacy ids (`'davis'`, `'layout'`) under new titles. Rationale: the issue's acceptance bar is "hotkeys unchanged," not "tab ids unchanged," and stale ids (a tab titled BUILD with `id="layout"`) would be a worse trap for the next agent than a one-time localStorage reset (users just get dropped to the first tab once, same as any first install). **Flag this as worth a 30-second nod from Matt** since ARCHITECTURE_PLAN itself calls out "muscle memory" as the one named risk of this whole consolidation.
5. **Icon glyphs for `play`/`build`:** `SHELL_BRAND.md` is explicit — "Matt draws icons (#346). Agents do not invent a logo pack." The existing panels use plain Unicode glyphs (◆ ■ ▤ ◇ ▸ ◎ ⬇), not an icon pack, so this is lower-stakes than #346's PATCH/MOD/FIELD/FEED icon set — but to stay inside the rule, **this plan reuses an existing glyph from one of the merged panels** for PLAY (e.g. ◎ from GHOST STATION) and BUILD (e.g. ■ from LAYOUT) rather than picking a new symbol. Treat the exact glyph choice as cosmetic and Matt's call if he wants something else later.
6. **Where exactly the ACCUM on/off toggle and FADE/GLOW sliders live is this plan's inference, not the issue's explicit text.** The issue lists "TUNNEL / PRISM / FLOW performance sliders" and "ACCUM gestures (FREEZE/CLEAR/SWELL)" under PLAY, and "blend modes" under BUILD, but never says where the ACCUM on/off toggle itself or its FADE/GLOW decay-shaping sliders go. This plan keeps BLEED/MIRROR/OVERLAP/ACCUM (the toggle) + FADE/GLOW in BUILD's `ToggleRow` (they shape *what gets built*, are not audio/performance-reactive, and are not named as moving) and moves only TUNNEL/PRISM/FLOW (explicitly named, and functionally "performance" sliders — you ride them live) to PLAY. **This is a recommendation, not settled** — cheap to revisit later since it's one `ToggleRow.jsx` edit either way.
7. **"Mattes" in the issue's BUILD description ("blend modes, mattes") has no UI today.** `gl/sceneContract.js` accepts a `layer.matte` field (alpha/luma mask, #189) but no panel, no event, no store action ever sets it — it's engine-only. **This plan does not add a matte UI control.** Building one would be a genuinely new feature (embargo-relevant, see open question 2) and is out of scope for a consolidation whose acceptance bar is "nothing deleted... controls move" — there is no matte control to move.
8. **Mid-migration tab-count bulge is expected and is not a Phase-0-rule violation.** Because DAVIS/STIMULI drain into PLAY over 7 phases while PLAY exists alongside them, the secondary tab strip temporarily holds more than 4 tabs (e.g. BUILD, STIMULI, GHOST STATION, PLAY, OUTPUT mid-sequence). The 4-tab cap Phase 0 writes down is an **end-state** rule, not a per-PR rule — say so explicitly in the DECISIONS.md entry so a reviewer doesn't bounce an in-flight PR for temporarily having 5 tabs.

---

## 3. The phase order (build this, in this order)

Every phase: one PR, CI green (`npm run lint && npm run selfcheck && npm run build`, plus e2e where noted), no control's underlying event/state shape changes (only its JSX location and, where noted, its `helpCopy.js` `group` label) — this is a move, not a rewrite.

### Phase 0 — Rules of the game (docs only, no app code)

**What it means:** Write down the laws every later phase points at. Matches the issue's "Phase 0 rules" section exactly.

**Scope:**
- `.github/PULL_REQUEST_TEMPLATE.md` — add a required **Loop** section: which leg (*perform, capture, learn, guide*) this PR serves, one sentence. This is not a workflow file — it does not touch `.github/workflows/`, so it does not trip the issue's "no `.github/workflows` changes" acceptance bar.
- `docs/DECISIONS.md` — new file, append-only, one entry per merged feature (what/why/loop-leg). Seed it with three entries written in this PR:
  1. **4-tab cap** — the tab strip is capped at 4 (CANVAS is primary, not counted); a new tab requires retiring one; this consolidation's mid-flight bulge (§2.8 above) is an explicit, named exception to the cap, not a violation of it.
  2. **Governor cost-tier contract** — a short summary that *points at* `gl/costTiers.mjs` as the already-shipped source of truth (do not re-derive the tier table in prose).
  3. **Taste v1 spec** — this one is genuinely new writing (the MLX `taste.json`/ledger design in ARCHITECTURE_PLAN Phase 4 has not shipped — `curator/taste.js` today is an interim heuristic scorer, not the embedding-based taste system). Spec the file format only; do not implement it here.

**Touches:** `.github/PULL_REQUEST_TEMPLATE.md` (new), `docs/DECISIONS.md` (new).

**Do NOT:** touch `.github/workflows/*`. Touch any panel file. Invent the taste.json *implementation* — spec only.

**Acceptance:** Both files exist on `main`; `docs/DECISIONS.md` has exactly the 3 seed entries; PR template renders the Loop section when opening a PR against this repo.

---

### Phase 1 — ASSETS: tab → drawer — **SHIPPED, PR #415**

**What it means:** ASSETS stops being a tab and becomes a persistent-button-triggered overlay, exactly the "open it, grab an asset, close it" pattern the issue names — reusing the lazy-modal mechanism `AssetPoolPanel.jsx` already uses internally for `AssetStudioModal`.

**Scope:**
- `PanelRegistry.js`: change the `assets` entry's `zone` from `'secondary'` to `'drawer'` (new zone value; do not remove the entry, do not delete `AssetPoolPanel.jsx`).
- `Shell.jsx`: stop rendering `'drawer'`-zone entries in the tab strip (`panelsByZone('secondary')` already naturally excludes them once the zone changes — verify, don't assume). Add a small persistent trigger (button, outside `role="tablist"`, always visible regardless of active tab) that toggles a full-screen overlay hosting the drawer panel's component, lazy-imported the same way `OutputPanel.jsx` lazy-imports `PrintDeskModal`.
- `AssetPoolPanel.jsx`: no internal logic changes expected. If its root `<div className="panel panel-pool">` assumes it's mounted inside `.col-panels`, adjust only the wrapper/CSS needed for overlay presentation — do not touch its drag/drop/ingest/tile logic.
- `helpCopy.js`: relabel the one `group: 'Assets'` entry (`assets-import`) if its copy still implies a tab (it doesn't need to — check before editing).

**Touches:** `app/src/composition/PanelRegistry.js`, `app/src/composition/Shell.jsx`, `app/src/panels/AssetPoolPanel.jsx` (wrapper only), possibly a new small CSS block reusing `.hotkey-overlay`/modal styling already in the codebase.

**Do NOT:** rewrite `AssetStudioModal.jsx` or the ingest/tile logic. Add a second asset-browsing surface. Invent a slide-in animation system — a centered overlay (same visual language as `PrintDeskModal`) satisfies "drawer/modal" per the issue's own wording ("ASSETS-as-drawer" is the parenthetical the issue title itself uses interchangeably with "modal").

**Acceptance:** ASSETS is not in the tab strip. A visible, always-reachable control opens the asset pool as an overlay from any tab; closing it returns to whatever tab was active. Every control that existed in the old ASSETS tab (filter chips, search, ingest, tile actions, NEW/IMPORT) still works, unchanged. CI green.

---

### Phase 2 — BUILD: absorb LAYOUT

**What it means:** The `layout` tab becomes the `build` tab, carrying all of LAYOUT's content unchanged. Because `LayoutPanel.jsx` is already a thin shell composing `ModeGrid`/`CuratorBar`/`ParamBlock`/`ToggleRow`, this is close to a rename-and-re-parent, not a rewrite.

**Scope:**
- New `app/src/panels/BuildPanel.jsx`: copy `LayoutPanel.jsx`'s composition (same subcomponents, same store selectors), new title `BUILD`, new `id: 'build'` in the registry, new tag (pick any unused `P0x`).
- `PanelRegistry.js`: replace the `layout` entry with a `build` entry pointing at `BuildPanel.jsx`.
- `layout/*.jsx` subcomponents move to a `build/` directory (or stay in `layout/` and are imported cross-directory — pick whichever keeps the diff smaller; do not also rename the files' internal logic while moving them).
- `helpCopy.js`: relabel `group: 'Layout'` entries to `group: 'Build'`.
- `tour.js`: repoint the `tab: 'layout'` step to `tab: 'build'`.

**Touches:** `app/src/composition/PanelRegistry.js`, new `BuildPanel.jsx`, `app/src/panels/layout/*.jsx` (moved, not rewritten), `app/src/data/helpCopy.js` (group labels only), `app/src/data/tour.js` (tab id only).

**Do NOT:** touch LAYERS in this phase. Touch ToggleRow's TUNNEL/PRISM/FLOW sliders (that's Phase 9 — they still belong here until Phase 9 moves them). Rename any `LAYOUT_PARAM`/`LAYOUT_LOCK`/`LAYOUT_PRESET`/`LAYOUT_CURATE` event constants — those are engine-facing names, unrelated to the UI label, and renaming them fans out into files this plan doesn't need to touch.

**Acceptance:** A `BUILD` tab exists with every control LAYOUT had (voice chips, MY VOICES shelf, MixBar, presets popup, persona-voice popup, Curator button, every ParamBlock slider, SYMMETRY/BEHAVE chips, BLEED/MIRROR/OVERLAP/ACCUM + FADE/GLOW + TUNNEL/PRISM/FLOW). `layout` tab is gone. CI green.

---

### Phase 3 — BUILD: absorb LAYERS

**What it means:** `BuildPanel.jsx` grows a second section holding the layer stack; the `layers` tab disappears.

**Scope:**
- Fold `LayersPanel.jsx`'s body (layer rows, ghost slots, `FxEffectEditor`) into `BuildPanel.jsx` as a second `<section>` under its own sub-heading, or extract it first into `build/LayerStack.jsx` and mount that — whichever keeps `BuildPanel.jsx` readable; either is fine, this is purely organizational.
- `PanelRegistry.js`: remove the `layers` entry.
- Delete `LayersPanel.jsx` once its content is fully relocated (no dangling import should remain — grep before deleting).
- `helpCopy.js`: relabel `group: 'Layers'` → `group: 'Build'`.

**Touches:** `BuildPanel.jsx`, `app/src/panels/LayersPanel.jsx` (deleted after relocation), `app/src/composition/PanelRegistry.js`, `app/src/data/helpCopy.js`.

**Do NOT:** change the #341 ghost-slot math, the FX effect editor's param definitions, or the PATCH (MOD/FIELD/FEED) row logic — relocate the JSX verbatim.

**Acceptance:** BUILD has two visually distinct sections (layout params + layer stack) with every LAYERS control present (add layer/FX, reorder, visible/solo/dup/remove, blend mode, opacity, PATCH row, FX effect editor). `layers` tab is gone. Secondary tab strip is now `build`, `stimulus`, `davis`, `output` (4 — the mid-migration bulge from PLAY hasn't started yet). CI green.

---

### Phase 4 — PLAY: create the panel; move EVOLVE chips + shimmer + beat router

**What it means:** First PLAY content. `BeatRouter.jsx` already says it was built for exactly this move.

**Scope:**
- New `app/src/panels/PlayPanel.jsx`: new shell, `id: 'play'`, title `PLAY`, registered in `PanelRegistry.js` alongside the still-live `davis`/`stimulus` entries (expected temporary bulge, see §2.8).
- Move `davis/EvolveControls.jsx` and `davis/BeatRouter.jsx` (files unchanged internally) into `PlayPanel.jsx`'s render.
- `PlayPanel.jsx` needs its own `useApp` selector for `evolveMode, evolveSource, evolveTarget, evolveInterval, beatRoute, phraseEnabled, phraseClock, audioEnabled, audioBands` (the last four are read-only inputs to the `beatCollision` calc that `BeatRouter`'s visibility depends on — PhraseControls itself hasn't moved yet, that's fine, PLAY just reads the state early).
- Remove `EvolveControls`/`BeatRouter` rendering from `DavisPanel.jsx` (it keeps everything else for now).
- `helpCopy.js`: relabel the `davis-evolve*` ids' `group` to `'Play'`.

**Touches:** new `PlayPanel.jsx`, `PanelRegistry.js`, `DavisPanel.jsx` (trim), `davis/EvolveControls.jsx` + `davis/BeatRouter.jsx` (moved, not rewritten), `helpCopy.js`.

**Do NOT:** move MorphControls/PhraseControls yet. Touch the shimmer scoring logic (`shimmer/shimmer.js`) — it's consumed as-is by `EvolveControls`.

**Acceptance:** A `PLAY` tab exists showing the EVOLVE target chips (with shimmer highlighting when scores are present) and SOURCE/INTERVAL row; BeatRouter still appears exactly when both evolve-on-beat and phrase-on-audio are armed. GHOST STATION no longer shows these two sections. CI green.

---

### Phase 5 — PLAY: move MORPH EVOLVE + PHRASE LOOP

**What it means:** The issue's "morph, phrase clock" clause, as one phase — both are small, self-contained, bordered blocks with no cross-dependency beyond what Phase 4 already wired.

**Scope:** Move `davis/MorphControls.jsx` and `davis/PhraseControls.jsx` into `PlayPanel.jsx`; trim the corresponding render calls and now-unused state selectors from `DavisPanel.jsx`. `helpCopy.js`: relabel `davis-morph` group to `'Play'` (no phrase-specific help ids exist today to relabel — check before assuming).

**Touches:** `PlayPanel.jsx`, `DavisPanel.jsx`, `davis/MorphControls.jsx`, `davis/PhraseControls.jsx`, `helpCopy.js`.

**Do NOT:** touch `usePhraseLoop.js`/`useMorphEvolve.js` hooks (App-level, engine-facing, untouched by this whole plan).

**Acceptance:** PLAY shows MORPH EVOLVE (toggle + DURATION) and PHRASE LOOP (CLOCK/BPM/LENGTH/MODE + progress bar), byte-identical behavior to today. GHOST STATION no longer shows them. CI green.

---

### Phase 6 — PLAY: move transport buttons + sub-seed stream mutators

**What it means:** The EVOLVE/STOP, FAVORITE, NEW SEED big buttons and the 4 sub-seed stream chips (SPATIAL/COLOR/ASSET/NOISE + reset) — inline JSX in `DavisPanel.jsx`, not their own files.

**Scope:** Cut the `davis-actions` button row and the sub-seed-stream row (with `SUB_SEED_STREAMS` const and `saveFavorite` closure) out of `DavisPanel.jsx`, paste into `PlayPanel.jsx`. `helpCopy.js`: relabel `davis-favorite`, `davis-new-seed` groups to `'Play'`.

**Touches:** `PlayPanel.jsx`, `DavisPanel.jsx`, `helpCopy.js`.

**Do NOT:** touch `FavoritesTray.jsx` or resurrect `davis/FavoritesList.jsx` (dead file, stays dead — see §1 table).

**Acceptance:** PLAY has working EVOLVE/STOP, FAVORITE (writes to the tray, unchanged), NEW SEED, and all 4 sub-seed mutators + reset. `F`/`N`/`E` hotkeys still work (they're wired at the `App.jsx` level via `useHotkeys`, not inside the panel — verify they still fire, don't just assume because the panel moved). CI green.

---

### Phase 7 — PLAY: move ACCUM gestures (FREEZE / CLEAR / SWELL)

**What it means:** The conditional gesture row (`accumOn && (...)`) plus its local `accumFrozen` state.

**Scope:** Move the ACCUM-gesture block and its `useState` from `DavisPanel.jsx` into `PlayPanel.jsx`. This block only reads `layoutParams.accumulation` (now living in BUILD, moved there in Phase 2) — no ordering dependency on BUILD beyond BUILD already existing, which it does by now. `DavisPanel.jsx` should now be nearly empty — check what's left (should be nothing but the header/wrapper and possibly stale imports; do not delete the file yet, that's Phase 11).

**Touches:** `PlayPanel.jsx`, `DavisPanel.jsx`, `helpCopy.js` (`davis-clear` group → `'Play'`).

**Do NOT:** delete `DavisPanel.jsx` or remove it from `PanelRegistry.js` yet — leave it registered but empty; Phase 11 is the single cutover point for all the emptied panels at once, not each phase individually.

**Acceptance:** PLAY shows FREEZE/THAW, CLEAR, SWELL exactly when `layoutParams.accumulation` is on, wired to the same `Events.ACCUM_GESTURE` emissions `CanvasPanel.jsx` already listens for. GHOST STATION's tab is now effectively empty (still registered, still clickable, shows nothing but its header — expected, temporary). CI green.

---

### Phase 8 — PLAY: move audio-reactive controls (all of STIMULI)

**What it means:** One phase for the whole STIMULI panel — `StimulusPanel.jsx` is already a thin, cohesive 85-line shell (AUDIO toggle, collapsible SETUP, ReactivityControls, MeterBlock), matching the granularity the consolidation issue's own guidance names ("audio-reactive controls" as one cluster).

**Scope:** Move `StimulusPanel.jsx`'s body (AUDIO toggle + SETUP disclosure + `SourceControls` + `ReactivityControls` + `MeterBlock`) into `PlayPanel.jsx`. `useEffect` for `navigator.mediaDevices.enumerateDevices()` moves with it. Remove `stimulus` from `PanelRegistry.js`; do not delete `StimulusPanel.jsx` file yet (same reasoning as Phase 7 — batch the deletions in Phase 11). `helpCopy.js`: relabel every `group: 'Stimuli'` entry to `'Play'`.

**Touches:** `PlayPanel.jsx`, `StimulusPanel.jsx` (emptied, not deleted), `PanelRegistry.js` (remove `stimulus`), `app/src/panels/stimulus/*.jsx` (moved, not rewritten), `helpCopy.js`.

**Do NOT:** touch `audioBallistics.mjs` or the mic-permission hook (`useAudioInput.js`) — App-level, untouched.

**Acceptance:** PLAY has AUDIO on/off, SETUP (device/file/monitor/gain), REACTIVITY (DEPTH/SCALE/ALPHA/LIFE), ENVELOPE (ATTACK/DECAY/RESPONSE/SWELL), and the waveform meter — identical behavior to today's STIMULI. STIMULI tab is gone from the registry. Secondary tab strip is now `build`, `davis` (empty), `play`, `output`. CI green.

---

### Phase 9 — PLAY: move TUNNEL / PRISM / FLOW performance sliders out of BUILD

**What it means:** The one genuine cross-panel slice in this plan — these three sliders live in `build/ToggleRow.jsx` (post-Phase-2) and the issue explicitly wants them in PLAY as *performance* controls, separate from BUILD's BLEED/MIRROR/OVERLAP/ACCUM/FADE/GLOW (see §2.6 for the reasoning this plan uses to draw that line).

**Scope:** In `ToggleRow.jsx` (now living under BUILD), remove the TUNNEL/PRISM/FLOW `<label>` block (the `FEEDBACK` group) and its three range inputs. Add an equivalent block to `PlayPanel.jsx`, reading the same `layoutParams.accumulationTunnel/Prism/Flow` and emitting the same `Events.LAYOUT_PARAM` — no new event names. Gate its visibility on `layoutParams.accumulation` the same way it's gated today (this mirrors the ACCUM-gesture row's gating, already in PLAY from Phase 7 — keep them visually adjacent).

**Touches:** `build/ToggleRow.jsx` (or wherever Phase 2 landed it), `PlayPanel.jsx`.

**Do NOT:** move BLEED/MIRROR/OVERLAP/ACCUM or FADE/GLOW — those stay in BUILD per §2.6. If Matt's review disagrees with that split, it's a one-file fix either direction, flag it rather than re-litigating the whole phase.

**Acceptance:** TUNNEL/PRISM/FLOW sliders appear in PLAY, gated on ACCUM being on, and are gone from BUILD's toggle row. Dragging them still drives the live ACCUM feedback shader exactly as before (same store keys, same events). CI green.

---

### Phase 10 — PLAY: governor constraint readout + #104 honesty audit

**What it means:** The one genuinely new UI in this whole plan (everything else so far is relocation). Folds in #104 ("PLAY honesty: dead controls disabled/gone") as the issue instructs. Reuses shipped infrastructure — see §0's TapeCounter/CanvasPanel rows.

**Scope:**
- Add a readout section to `PlayPanel.jsx`: current governor tier/state (`shedSummary()` from `hooks/governorCuts.js`), the most recent shed's label and reason (`getGovernorEvents()` from `gl/governorEventLog.mjs`, same 1Hz-poll pattern `TapeCounter.jsx` already uses), and auto-recovery framing ("returns automatically on recovery," matching `CanvasPanel.jsx`'s existing ACCUM-HELD copy). This is an *expanded, in-panel* version of what `TapeCounter` already shows globally — do not duplicate its logic, import and reuse the same functions.
- Honesty audit: for every PLAY control whose effect can be governor-shed while its store value stays truthy — today that's ACCUM's gestures (Phase 7) and TUNNEL/PRISM/FLOW (Phase 9), both gated by `perfTier1` — add the same "setting vs. effective" distinction `CanvasPanel.jsx` already uses for its ACCUM/ACCUM-HELD pill (dim the control or append a "HELD" note when `layoutParams.accumulation && perfTier1`). Do not disable the control (the setting is still real and takes effect on recovery) — just stop it from *looking* active while shed.
- Sweep the rest of PLAY (everything moved in Phases 4–9) for any other control that can silently no-op — e.g. INTERVAL while `SOURCE=BEAT` already shows a disabled/dimmed state today (`EvolveControls.jsx`), confirm it survived the move unchanged rather than re-inventing it.

**Touches:** `PlayPanel.jsx`, possibly a small shared helper if the "setting vs effective" pattern is duplicated 2+ times (extract, don't copy-paste a third time).

**Do NOT:** build a new governor introspection API. Touch `hooks/usePerformanceGovernor.js`'s timing/cooldown logic — this phase only *reads* state it already publishes.

**Acceptance:** PLAY shows what's currently shed and why, in plain language, whenever `perfTier1` (or any other active shed signal) is true, and shows a quiet/clean state otherwise. No PLAY control shows as active while the governor has it shed — spot-check by forcing `perfTier1` in dev tools and confirming ACCUM gestures and TUNNEL/PRISM/FLOW visibly say "held," not silently doing nothing. CI green.

---

### Phase 11 — Cutover: retire GHOST STATION + STIMULI, enforce the 4-tab cap

**What it means:** The single phase where the registry finally reaches the issue's literal 4-tab (+ drawer) map. Low-content-risk (both old panels are empty shells by now), but real deletion risk (dangling imports) — treat it as its own phase rather than folding it into Phase 8 or 9.

**Scope:**
- `PanelRegistry.js`: remove the `davis` entry (it should already be `stimulus`-free from Phase 8).
- Delete `DavisPanel.jsx` and `StimulusPanel.jsx`. Grep the whole `app/src` tree for any remaining import of either before deleting — a stray reference (e.g. from a stale test fixture) is exactly the "dead reference" risk `ARCHITECTURE_PLAN.md` Phase 5 calls out for a similar cut.
- `davis/FavoritesList.jsx` stays (still dead, still unreferenced, not this plan's problem to resolve — note it again so nobody "helpfully" wires it back in during the grep pass).
- Confirm `panelsByZone('secondary')` now returns exactly `build`, `play`, `output` (3) — CANVAS is primary, ASSETS is the drawer, that's the issue's 4-panel map in full.
- Tick the new "4-tab cap" `docs/DECISIONS.md` entry from Phase 0 as satisfied (docs-only hunk in this same PR, matching ENGINE_PLAN's own convention of ticking acceptance boxes in the landing PR).

**Touches:** `PanelRegistry.js`, delete `DavisPanel.jsx`, delete `StimulusPanel.jsx`, `docs/DECISIONS.md` (tick).

**Do NOT:** delete `davis/`/`stimulus/` subcomponent files that were *moved* (they should already be relocated under `PlayPanel.jsx`'s ownership by now, e.g. renamed into a `play/` directory in whichever earlier phase did the move — if any phase left them in the old directory importing cross-tree into `PlayPanel.jsx`, this is the phase to finally relocate the files themselves, since it's now safe with nothing else pointing at the old directory).

**Acceptance:** Tab strip is exactly CANVAS (primary) + BUILD + PLAY + OUTPUT (secondary) + an ASSETS drawer trigger. No file in `app/src` imports `DavisPanel.jsx` or `StimulusPanel.jsx`. `npm run build` produces no dead-import warnings. CI green (lint + selfcheck + build + e2e).

---

### Phase 12 — Copy pass: help, tour, footer consistency (#158 remainder + #222 aim)

**What it means:** The issue's explicit checklist items. Most of the mechanical relabeling already happened per-phase (§ each phase's `helpCopy.js` line) — this is the final sweep for what's left: prose that says "Ghost Station"/"Stimuli" *inside* help text (not just the `group` field), the tour's step-3 body text, and e2e selector drift.

**Scope:**
- `helpCopy.js`: grep for the literal strings `Ghost Station`, `Stimuli`, `Layout`, `Layers` inside `text` fields (not just `id`/`group`) — e.g. `stimuli-depth`'s text says "Not the Ghost bar," `davis-audio`'s text says "Drives reactivity and the Ghost Station AUDIO / BEAT clocks." Update the words; do not change the `id`s (they're referenced by `helpText(id)` call sites scattered across panel files — an `id` rename is a much bigger, riskier diff than a `text` edit, and nothing requires it).
- `tour.js`: step 3's `body` says "the DAVIS tab" — update to "the PLAY tab." Confirm `tab: null` for that step is still correct (it doesn't navigate anywhere, it's a keyboard-shortcut instruction — should still be true).
- `HotkeyOverlay.jsx` / footer `?`/`⚙` buttons: no code change expected (they already read through `helpCopy.js`), just re-verify after the text sweep that the `?` sheet reads coherently grouped by PLAY/BUILD/ASSETS/OUTPUT/Master/Help.
- `app/e2e/smoke.spec.js`: it currently does `page.getByRole('tab', { name: /output/i })` and `/layout/i}` with `if (await x.count())` guards — the `/layout/i` lookup will now silently miss (guarded, so it won't fail, but it'll stop exercising the MIRROR-toggle assertion). Update it to target `/build/i` so the existing coverage isn't quietly lost.
- Check the other e2e specs (`voice-personas`, `recipe-roundtrip`, `loop-capture`, `print-desk`, `accum-recording`, `poisoned-project`) for any tab-name-dependent selectors the earlier grep (§ this repo's current state, done during planning) didn't find — re-run the same grep against `main` at merge time, not against this planning session's snapshot, in case another PR landed in between.

**Touches:** `app/src/data/helpCopy.js` (text only), `app/src/data/tour.js` (body copy), `app/e2e/smoke.spec.js`, spot-check of other `app/e2e/*.spec.js`.

**Do NOT:** rename any `helpCopy.js` `id` field. Touch `HELP_SHORTCUTS` (hotkey list — unaffected, hotkeys are unchanged per the issue's acceptance bar).

**Acceptance:** No panel-name string in `helpCopy.js` or `tour.js` refers to a retired tab. `?` overlay groups read PLAY/BUILD/ASSETS/OUTPUT/Master/Help. `npm run test:e2e` green with the updated selectors. This is the PR that closes #248, #104, and the #158/#222 remainder together — tick all three in the PR body.

---

## 4. Suggested PR sequence

```text
0   docs rules                          ← Loop section + DECISIONS.md; nothing else waits on code
1   assets → drawer                     ← cheapest, fully independent
2   build ← layout                      ← mechanical re-parent
3   build ← layers                      ← BUILD now final-shape
4   play: evolve chips + beat router    ← PLAY exists; expected tab-count bulge starts
5   play: morph + phrase
6   play: transport + sub-seed
7   play: accum gestures                ← needs BUILD's ACCUM toggle to exist (lands by phase 2)
8   play: audio-reactive (all stimuli)
9   play: tunnel/prism/flow ← build     ← the one cross-panel slice; needs phase 2 (ToggleRow lives in BUILD)
10  play: governor readout + #104       ← needs phases 7 & 9 (things to audit)
11  cutover: delete davis/stimulus      ← needs 4–10 fully landed (both panels empty)
12  copy pass: help/tour/e2e            ← last; sweeps whatever the above left inconsistent
```

Land strictly in this order, one merged PR before the next branch opens — same rule ENGINE_PLAN used ("do not start letter N+1 until this PR is merged"), because every phase edits `PanelRegistry.js` and most edit `helpCopy.js`; sequential landing avoids merge conflicts on those two shared files entirely rather than needing to resolve them.

---

## 5. Killed / parked (agents: do not file these against #248)

- A Studio/Perform plane toggle, a "STUDIO" label, or anything from `docs/TWO_PLANES.md` — later, separate, explicitly blocked on spine-E sign-off elsewhere.
- A matte UI control (`layer.matte` stays engine-only; "mattes" in the issue's BUILD bullet has nothing to move).
- New icon glyphs, a logo pack, or any `#346`-adjacent art direction — Matt draws icons.
- Renaming `DAVIS_*` / `ACCUM_*` / `LAYOUT_*` event-bus constants, store slice names, or CSS class roots (`panel-davis`, `panel-stimulus`, etc.) to match new panel names — cosmetic, high-fanout, not requested by the issue, and not needed for any acceptance bar here. If it happens, it's a separate follow-up PR someone opens on purpose, not a byproduct of this plan.
- The MIX/FADE/PAL naming-lock cleanup `docs/SHELL_BRAND.md` §2.4 flags — a real but separate issue, do not fold into a BUILD phase just because it touches the same file.
- Implementing the full `taste.json`/ledger system (ARCHITECTURE_PLAN Phase 4) — Phase 0 here only specs the format.
- Building the `docs/GOVERNOR_TE_ROADMAP.md` / per-effect cost calibration work (#298) — Matt's machine, not this plan's job; Phase 10 only *reads* the existing readout plumbing.
- Any dev-only panel (`shaderlab`, `xray`, `govtune`) — not part of the 7→4 map, untouched.
- A second asset-browsing surface, a slide-in animation framework, or any new overlay primitive beyond what `AssetStudioModal`/`PrintDeskModal` already established.

---

## 6. Acceptance for "the consolidation is done" (issue #248's own bar, operationalized)

- [ ] All 7 old panels' controls are reachable from PLAY / BUILD / ASSETS (drawer) / OUTPUT — cross-check every row in §1's control-cluster table against its new home.
- [ ] Hotkeys (`Space`, `S`, `F`, `G`, `E`, `N`, `?`, `⌘Z`, `⌘⇧Z`) fire identically post-consolidation (they're wired at `App.jsx`, unaffected by panel moves, but verify after Phase 6 specifically since `F`/`N`/`E` target controls that moved).
- [ ] Governor shed readout is honest inside PLAY: no PLAY control shows as active while the governor has actually shed its effect (Phase 10).
- [ ] `docs/DECISIONS.md` exists with the 4-tab-cap, cost-tier-contract, and taste-v1 entries (Phase 0), plus the cutover tick (Phase 11).
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` has the Loop section; every phase's PR uses it.
- [ ] `panelsByZone('secondary')` returns exactly `build`, `play`, `output`; ASSETS is a drawer, not a tab; CANVAS remains primary and untouched.
- [ ] `?` overlay and hover-title copy have no stray references to GHOST STATION / STIMULI / LAYOUT / LAYERS as tabs (Phase 12).
- [ ] First-run tour's 4 steps target PLAY/BUILD/OUTPUT correctly (Phase 12).
- [ ] `FavoritesList.jsx` is still dead and still unreferenced (nobody "fixed" it along the way).
- [ ] No `layer.matte` UI was added; no Studio/Perform toggle was added; no new icon glyphs were invented.
- [ ] CI green (`lint`, `selfcheck`, `build`, `test:e2e`) on every phase's PR individually, not just at the end.
- [ ] No `.github/workflows/*` file changed anywhere in the sequence.

---

## 7. File map (ownership)

| File | Owns | Touched by |
|---|---|---|
| `app/src/composition/PanelRegistry.js` | The 4-panel + drawer + 3-dev-panel data source | Every phase 1–3, 4, 8, 11 (sequential landing avoids conflicts) |
| `app/src/composition/Shell.jsx` | Tab strip rendering, drawer-zone trigger | Phase 1 only |
| `app/src/panels/PlayPanel.jsx` | New: EVOLVE, morph, phrase, transport, sub-seed, ACCUM gestures, TUNNEL/PRISM/FLOW, governor readout | Phases 4–10 |
| `app/src/panels/BuildPanel.jsx` | New: layout params/voices + layer stack | Phases 2, 3, 9 (removes 3 sliders) |
| `app/src/panels/AssetPoolPanel.jsx` | Unchanged internals; new mount point | Phase 1 |
| `app/src/panels/OutputPanel.jsx` + `output/*` | Unchanged, not in scope | none |
| `app/src/panels/DavisPanel.jsx`, `StimulusPanel.jsx` | Shrinking shells, then deleted | Phases 4–9 (drain), 11 (delete) |
| `app/src/data/helpCopy.js` | Hover titles + `?` sheet, single source of truth | Every phase touching a moved control's `group`; Phase 12 for stray `text` copy |
| `app/src/data/tour.js` | First-run tour targets | Phases 2, 12 |
| `app/e2e/smoke.spec.js` | Tab-name-dependent smoke assertions | Phase 12 |
| `docs/DECISIONS.md`, `.github/PULL_REQUEST_TEMPLATE.md` | Phase 0 rules | Phase 0 (create), Phase 11 (tick) |

---

## 8. How multiple agents avoid colliding on this

1. Land phases strictly in the §4 order, one merged PR before the next branch opens — this plan has two genuinely hot shared files (`PanelRegistry.js`, `helpCopy.js`) touched by nearly every phase; sequential landing turns that into a non-issue instead of a merge-conflict generator.
2. `PlayPanel.jsx` and `BuildPanel.jsx` are each owned by exactly one phase sequence (4–10 and 2–3/9 respectively) — do not run a PLAY phase and a BUILD phase concurrently on separate branches, because Phase 9 is the one place they touch the same file pair (`ToggleRow.jsx` in BUILD, `PlayPanel.jsx` in PLAY) in the same logical change.
3. Before opening a branch for any phase, `git pull origin main` and re-read this plan's §0 — if an earlier phase in the sequence didn't land the way this document assumed (e.g. Phase 2 put `ToggleRow.jsx` somewhere other than expected), adjust the later phase's "touches" list to match reality rather than the doc; the phase's acceptance bar is what's load-bearing, not the exact file path guessed here.
4. Phase 0's docs are read-only inputs to every later phase (the Loop section, the 4-tab-cap exception in §2.8) — do not edit `docs/DECISIONS.md`'s Phase-0 entries in a later phase except to tick the one cutover box Phase 11 names; append, don't rewrite.
5. If a phase discovers it needs to touch a file this plan didn't list (a real possibility — this was built from static reading, not from running the app), that's fine; keep the diff to that phase's stated control cluster and note the extra file in the PR body rather than silently expanding scope to "while I'm in here."

### Critical files for implementation
- `app/src/composition/PanelRegistry.js`
- `app/src/composition/Shell.jsx`
- `app/src/panels/DavisPanel.jsx` (and `app/src/panels/davis/*.jsx`)
- `app/src/panels/StimulusPanel.jsx` (and `app/src/panels/stimulus/*.jsx`)
- `app/src/panels/LayoutPanel.jsx` (and `app/src/panels/layout/*.jsx`)
- `app/src/panels/LayersPanel.jsx`
- `app/src/panels/AssetPoolPanel.jsx`
- `app/src/data/helpCopy.js`
- `app/src/data/tour.js`
