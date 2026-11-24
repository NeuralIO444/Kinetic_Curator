# RECIPES_V3 — scene recipe audit + upgrade spec

Status: **shipped** (R0–R6, #2320–#2326). §5 is ruled; §3.5 notes below record where the build differs from this text. Audited at `da11434`; recipe sources unchanged at `a399ead` (2026-11-17).
Scope: the scene recipe — `kc-recipe/1|2` text (`state/recipes.js`), `kc-r/1|2` links (`state/recipeUrls.js`),
the layer-stack block (`state/recipeStack.js`), and its entry points (`RecipeRow`, `SnapshotGallery`,
`FavoritesTray`, `bootFromHash`). Not in scope: ACCUM frame params, variant recipes, construct records.

## 1. What the system promises

#307 / #534 say a recipe restores "the exact scene". That held when the scene was seed + palette + layout.
It stopped holding as the scene grew: light (#594), kineme (#781), world (#2104), creatures (#1849),
constructs (#2108), kits (#1944) all went into the project document and none went into the recipe.

## 2. Findings (most severe first)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | P0, data loss | **Pasting a recipe wipes the session.** Recipes apply through `applyProject`, which treats a missing field as "this doc has none." So title, canvas size, audio routes, world, light, kinemes, constructs, creature records, kits, MIDI banks and math macros are all reset. Undo history is cleared too (#639), so there is no way back. | Harness: a 1080×1920 scene titled "MY SET" with a standing world → after APPLY: title `""`, canvas 1000×700, audioRoutes null, world null. |
| F2 | P0, fidelity | **A recipe is not the scene.** It carries 4 fields (+ stack). The project doc carries about 20 render-affecting fields. Light, world, kinemes, region kinemes, still pins, attach points, asset options, creature/construct records, custom assets, weight overrides and canvas aspect are all missing. | `serializeProject` vs `recipeFieldsFromKept`. |
| F3 | P1, fidelity | **Enabled assets don't travel.** No recipe carries `enabledAssets` for the active track, and `applyProject` only sets it when the doc has it. So the receiver's own asset set gets used, and the same seed deals a different stage on another machine. | `globalSlice.applyProject` `if (doc.enabledAssets …)` |
| F4 | P1, drift | **Links mean different things as defaults change.** kc-r encodes layout as a *delta against today's `DEFAULT_LAYOUT_PARAMS`*. Any default change silently changes every old link. This has already happened 4 times and was patched one key at a time (`rotateSpin`, `kinemeBreath`, `kinemeDrift`, `kinemePaletteBreath`). Nothing stops a 5th. | `recipeUrls.js` #1127/#1128/#1151 special-case |
| F5 | P1, fidelity | **Text recipes drop palette overrides.** kc-recipe has no overrides line, and apply sets `paletteOverrides = null`, so a hand-tuned palette comes back as stock. | harness: no override line in encoded text |
| F6 | P2 | **Favorite links drop palette overrides.** `FavoritesTray.copyLink` doesn't pass `paletteOverrides`, unlike `RecipeRow` (needs a check of what favorites store). | `FavoritesTray.jsx:64` |
| F7 | P2 | **Recipes carry no build or engine stamp.** A recipe that renders differently can't be traced to the build that made it. | — |
| F8 | P2, test gap | **The e2e "exact scene" check only compares the footer seed.** No pixel or placement equivalence test, so F1–F5 all pass CI. | `e2e/recipe-roundtrip.spec.js` |
| F9 | P3 | **Stale error message.** Says "this build reads kc-r/1 only", but the build reads kc-r/2 as well. | `decodeRecipeUrl('kc-r/3.e30')` |
| F10 | P3 | **"Recipe" names 5 different things in the code:** scene recipe, ACCUM frame params, variant recipe, construct record, governor "price a recipe". Agents working issues will confuse them. | grep: 1,050 hits |

Fine as-is: fail-closed decoding, layout clamping through `normalizeLayoutParams` (hostile links can't push
counts past the hard ranges), prototype-key filtering, v1/v2 byte stability, and all 3 selfchecks passing.

**Root cause of F1–F5:** the recipe has its own field list, separate from the project document. Each new scene
field had to remember to join both, and none did. The fix is to derive the recipe from the document, with a
guard that fails CI when a field isn't classified.

## 3. Design

### 3.1 Scene vs rig — one classification, one guard
`projectDocument.js` exports `DOC_FIELD_CLASS`: every key `serializeProject` can write gets classed `scene` or
`rig`. A selfcheck serializes a maximally dressed state and fails if any key is unclassified. This is the guard
that would have caught all of F2.

Recommended classes:
- **scene** (rides a recipe, replaced on apply): seed, seedOffsets, paletteId, paletteOverrides, layoutParams,
  enabledAssets, assetWeightOverrides, customAssets, light, world, assetKineme, regionKinemes, assetStill,
  assetOptions, assetAttach, creatureRecords, constructRecords, shapeShelf, kitTriad, canvasW, canvasH,
  canvasPresetId, layers / activeLayerId / layerSnapshots.
- **rig** (never touched by a recipe): title, quality, autoQuality, paletteLocks, kits (library), audioRoutes,
  midiBanks / midiMap / midiActiveBank, mathMacros, canvasFps, stageMode, assetTags.

`sceneOf(state)` returns exactly the scene keys, already serialized through the existing sanitizers.

### 3.2 `applyScene` — merge, never load
A new store action, `applyScene(sceneDoc)`:
- Replaces scene keys only, using the same sanitizers `applyProject` uses (factor them out and share them; don't copy).
- Leaves rig keys alone.
- Pushes **one** undo entry ("Recipe applied") instead of clearing history. A recipe is an edit, not a new document.
- Emits `PROJECT_LOADED`, so the Trio resets its books as it does on load (#2095).

`RecipeRow` (both the text and link paths), `bootFromHash` and favorite recall all route through it. `applyProject`
stays for real document loads.

### 3.3 Defaults epochs (fixes F4 for good)
- `data/recipeDefaults/epoch-<n>.json`: a frozen copy of `DEFAULT_LAYOUT_PARAMS` per epoch. `LAYOUT_DEFAULTS_EPOCH`
  is the newest one.
- kc-r/3 writes `d: <epoch>`. Decode merges over **that epoch's** defaults, never the live ones.
- Selfcheck: hash(live `DEFAULT_LAYOUT_PARAMS`) must equal hash(latest epoch file). Changing a default without
  cutting a new epoch fails CI and names the key.
- v1/v2 links keep today's behaviour (merge over live defaults, plus the 4 legacy zeros). Their encoding defaults
  are unknowable, and that is acceptable.

### 3.4 Formats
- **kc-r/3**: `{ v:3, d, b, s, o?, p?, po?, l?, x?, k? }`. `b` is a short build id (F7). `x` is the scene block:
  every scene key outside seed, palette and layout, delta-vs-empty (absent = none, which matches `applyScene`'s
  absent = cleared). `k` is the stack as in v2.
  The payload is **deflate-raw then base64url** (`CompressionStream`, Node ≥ 18 and every target browser), under a
  `kc-r/3.` prefix. Boot decode becomes async, so `bootFromHash` awaits before the autosave path.
- **kc-recipe/3** text: v1 key lines for seed, palette, offsets and layout, plus `paletteOverrides:` and one JSON
  line per scene block (`light:`, `world:`, `kineme:` …), sorted. It stays hand-editable for the parts people
  actually edit.
- **Writers** emit v3 only. **Readers** accept 1, 2 and 3.
- **Custom assets**: embedded when the compressed `x.customAssets` is ≤ 8 KB. Above that they're dropped, and
  apply shows a badge ("2 custom assets not in link"), the same pattern as the palette fallback.
- **Length budget selfcheck**: the 3 kernel-replay golden scenes, fully dressed, must encode to ≤ 2,000 URL chars.

### 3.5 Fidelity proof (fixes F8)
- Optional `f` field: the placement hash of frame 0 (the kernel replayer already produces per-frame hashes). After apply,
  if the receiver's frame-0 hash differs, the boot notice says "Scene differs from sender's build". This is
  diagnostic only; it never blocks.
- E2E: dress a scene (light, world, kineme, construct, overrides, a non-default asset set) → copy link → open in
  a **fresh context** → compare the frame-0 placement hash and a downscaled canvas checksum.
- **As built (#2358):** the hash is not from the kernel replayer (it replays seed + events and never sees the store
  scene). It is `frameHash` over a fresh live resolver on the doc plus `buildSceneContract` (`state/recipeFidelity.js`).
  The e2e (`e2e/recipe-fidelity.spec.js`) asserts the hash and the dressed fields in a fresh context, and was shown to
  fail when each carried field is dropped. The canvas checksum is **not** asserted: the live loop is too uneven in
  headless GL for a pixel gate; it needs a still-render path.

## 4. Issues (hand-off: `queue:now` + model label)

| Slice | Label | Title | Done when |
|---|---|---|---|
| R0 | `model:haiku` | recipes: fix stale kc-r version error + favorite links carry palette overrides (F6, F9) | the error lists 1 and 2; favorite link round-trips `po`; selfcheck case added |
| R1 | `model:sonnet` | recipes: classify every project-doc field scene/rig + unclassified-key guard (§3.1) | `DOC_FIELD_CLASS`, `sceneOf`, selfcheck fails on an injected unclassified key |
| R2 | `model:sonnet` | recipes: `applyScene` — recipe apply replaces scene only, keeps rig, one undo step (F1, §3.2) | the harness in §2 F1 shows rig keys unchanged; undo restores the pre-paste scene; RecipeRow + boot + favorites routed |
| R3 | `model:sonnet` | recipes: layout defaults epochs + live-defaults hash guard (F4, §3.3) | epoch-1 frozen; changing a default without a new epoch fails selfcheck |
| R4 | `model:sonnet` | recipes: kc-r/3 + kc-recipe/3 carry the full scene, deflate, build stamp, custom-asset cap (F2, F3, F5, F7, §3.4) | v1/v2 fixtures still decode byte-identical; dressed round-trip equals `sceneOf`; length budget passes |
| R5 | `model:sonnet` | recipes: fidelity proof — frame-0 placement hash field + fresh-context e2e (F8, §3.5) | e2e fails on a deliberately dropped scene field |
| R6 | `model:haiku` | docs: glossary — "recipe" means the scene recipe; name the other four (F10) | TAXONOMY.md entry; no code renames |

Order: R0 → R1 → R2 (stops the data loss) → R3 → R4 → R5. R6 can go any time.
One PR per issue, with QA and an independent review; Matt merges.

## 5. Rulings (all taken as recommended)
1. **Audio routes: scene or rig?** Recommend **rig**. Routes belong to the performer's setup, and a shared scene
   shouldn't rewire their audio.
2. **Canvas on the recipe?** Recommend **size + preset ride; fps + stageMode don't**. Aspect changes the picture;
   fps doesn't.
3. **Custom assets in links?** Recommend **embed up to 8 KB compressed, badge above**.
4. **Apply = undoable edit (not a new document)?** Recommend **yes**. That's what makes F1 recoverable even if
   classification misses a key later.

Outcomes as built: (1) audio routes are **rig**; (2) canvas size + preset ride, fps and stageMode do not; (3) custom assets
embed up to 8 KB deflated, above that all are left out and apply says "N custom assets not in link" (a notice, not a
badge); (4) apply is one undoable edit (`applyScene`, `UNDO_KIND_SCENE`). A v3 recipe also **replaces** the scene
(omitted scene keys clear, never the cast or rig); v1/v2 still merge.
