# STAGING REPORT — #1434 R3: region kineme assignment (family defaults + artist override)

**Branch:** `ember/1434-region-assignment` (stacked on stage-2 tip `0138c70f`)
**Base:** stage 2 (#1433 R2 playback) — coordinator-verified.
**Status:** LOCAL COMMITS ONLY. No push, no PR. Publish on Matt's word, one PR at a time.

## What this stage is

Stage 2 built the playback: the renderer animates regions named in a
`regionKinemes` assignment map. Almost nothing fed that map — only a
project doc's per-asset overrides. R3 fills it:

1. **Family defaults at bake.** Every library asset's regions now carry a
   `regionKinemes` assignment in the baked `regions.generated.js`,
   computed deterministically from region geometry + category.
2. **Artist override.** The RegionPicker (the matte sheet where slots
   are already authored) gains a per-region MOTION editor. Edits ride the
   project document as `doc.regionKinemes`, win per-region over the
   defaults, survive save/load, and are never clobbered by a re-bake.
3. **Imports auto-tagged on arrival** (Matt's ruling): loot/custom
   imports run the same pipeline as the bake — regions capped at 12,
   family defaults applied — in the store's ingest actions, so a custom
   `user:` asset is first-class immediately. This closes the gap stage 2
   flagged: the scene contract now resolves region data for custom
   assets from the document's `customAssets`.

## The family table, as implemented (`data/regionDefaults.js`)

| family (category) | rule |
|---|---|
| `floral` | the centre region → `pulse`; every other region → `rock` (the osc kineme — the sway) |
| `radial` | every region → `pulse` |
| `linework` | every region → `bob` |
| everything else (organic, geometric, dots, stamps, crystalline, biosynthetic, fragments, scanlines) | no default — regions render still |

- **Centre** = the region whose centroid is nearest the area-weighted
  centroid of all the asset's regions (ties: record order). A
  one-region flower's only region is its centre → `pulse`.
- **Phase:** stage 2 already phases each region by its (asset, region)
  hash (`regionKinemePhase`), so same-kineme neighbours are not in
  lockstep; the assignment map itself stays `{regionId: kinemeId}`.
- **Strip assets are excluded** even inside a named family — the
  authored cell sequence owns their motion (stage 1).
- The defaults are pure functions of the geometry: re-running the bake
  reproduces them exactly, and the bake's geometry output is unchanged
  from stage 2 (the regenerated file differs only in header comments +
  the new per-record `regionKinemes` lines).

## Measured bake evidence

- **294 regions assigned across 74 assets**: floral 15 assets / 53
  regions, radial 26 / 150, linework 33 / 91. Every region of every
  named-family asset is assigned; no other asset carries the key.
- `flora_flower_01`: centre (`ff2d95`) → `pulse`, its 4 petals → `rock`
  — exactly the map stage 2's playback suite used as its ASSIGN fixture.
- `regionBake.selfcheck` passes against the regenerated artefacts
  (294 assets, 1,095 regions), extended to pin that baked assignments
  survive the runtime sanitizer unchanged.
- Families with NO library assets exercising them: none of the three
  named families is empty (15/26/33 assets). The families NOT in the
  table have assets (e.g. geometric 40+) and deliberately get nothing.

## The override, end to end

- **Store:** `regionKinemes` state + `setRegionKineme(assetId, regionId,
  value)` — value is a kineme id, `'still'` (stored as a tombstone
  `null`: deliberately still, beats the default), or `'default'`
  (clears the override). Empty maps prune themselves.
- **Resolver** (`regionKinemes.js`, extended): the doc map merges OVER
  the record's baked defaults per region; a tombstone deletes that
  region from the merged map; if every region is tombstoned the asset
  resolves to no assignment — which is exactly the pre-R3 still state,
  now reachable only by an artist's deliberate act.
- **Document:** `serializeProject` writes `doc.regionKinemes` (omitted
  when empty — old exports byte-identical); both `parseProject` branches
  sanitize it back (tombstones preserved); `projectWatch` watches the
  field; `applyProject` restores it; the export payload threads it.
- **Events:** `ASSETS_REGION_KINEME` (`assets:regionKineme`), registered
  + wired like `ASSETS_REGION_SLOT` → `SET_ASSET_REGION_KINEME` →
  `setRegionKineme`.
- **Editor:** RegionPicker's new REGION MOTION section lists each
  region with its effective kineme and a select: `default · <kineme>`,
  `still`, or any kineme (rock/pulse/bob/spin/blink).
- **Honest feed:** the edit is recorded by `loisActivity` as a tweak
  under the key `'regionKineme'` — the LAYOUT_PARAM class (artist
  action, undo-burst collision check included), sharing the existing
  recorder rather than a parallel one.

## Imports auto-tagged

- `tagImportedRegions(asset, detected)` = normalize → cap at 12
  (`capRegionsTracked`, stage 2's cap) → family defaults. Wired into
  `ingestAsset`, `replaceCustomAsset`'s detection callback,
  `setAssetRegions` (manual re-detect re-tags; doc overrides are a
  separate map and survive), and `duplicateAsset` (a copy inherits the
  source's tagged record, or detects its own).
- `sanitizeOverlay` carries `regionKinemes` across the trust boundary,
  re-validated against the record's own regions — an auto-tagged record
  round-trips intact; unknown regions/kinemes are dropped.
- The contract change is small and additive: `buildSceneContract`
  reads `doc.customAssets` once and hands the matching record to the
  resolver; `liveLoop` passes the store's `regionKinemes` +
  `customAssets` into the contract doc. Scenes without region data
  build exactly as before (stage 2's parity pins hold — below).

## Verification

**New suite** `src/data/regionAssignment.selfcheck.mjs` (registered in
`app/selfcheck.manifest`): the family table as functions of synthetic
geometry (centre rule, tie-breaks, strip exclusion); the baked library
deep-equal to the table asset-by-asset; override precedence incl.
tombstones and a simulated re-bake; the doc sanitizer + serialize/parse
round trip; the store actions + `applyProject`; the import path (a
15-region linework detection caps at 12, all `bob`; the overlay
boundary keeps it, cleans a hostile variant); and the contract raising
`regionAnim` from defaults alone for a library asset AND for a custom
`user:` asset whose record rides the doc.

**Neighbours, all green:** regionPlayback (GPU numbers IDENTICAL to
stage 2's verified run — rest parity 0.646%, petals 119/110/64/119,
centre 12, budget-1 321px vs full 1,216px), cellKinemePlayback,
regionBake, overlay, regionMattes, ingest, census, censusReadout,
projectWatch, bundleParts, projectDocument fuzz, lootIngest, lootRun,
eventRegistry (162 events), loisActivity, kinemes.

**Stage-2 pin updates (honest re-pins, in regionPlayback.selfcheck):**
flora's no-doc resolution is now the baked defaults — which equal the
suite's ASSIGN fixture, so every playback pin stands unchanged. The
pre-R2 "bare" state (no regionAnim, plain atlas, single quad) is now
the artist-cleared state, reached by tombstoning all five flora
regions; the petals-only wrap fixture tombstones the centre so its
baked pulse can't break the 2.4s wrap pin. No assertion was weakened;
two pins were ADDED (defaults alone raise regionAnim; defaults never
move placements).

**`npm run build`: green** (after `npm install` completed this fresh
worktree's `node_modules` — the same missing-`@tauri-apps/api` state
stage 2 documented; no lockfile change).

**Full manifest sweep: 419 pass / 1 fail of the 420 commands run**
(the manifest holds 423; swarmWasm, accum, and rollSafety were run and
are accounted separately below — so the full accounting is 419 green +
the four suites discussed here). The one in-sweep failure and
rollSafety share a shape — designed weight meeting sandbox/harness
ceilings — but they are NOT the same failure, and neither is an
assertion failure. Both get their evidence below; the coordinator
should read them before publishing.

**phase6 (in-sweep failure) — the parity driver's atlas transport.**
The suite's hostile-doc re-test renders a scene built from a poisoned
doc whose enabled set is effectively the whole library.
`glDriver.buildRenderPayload` ships the atlas to the page as ONE
base64 string; V8 refuses strings over ~512M chars
(`ERR_STRING_TOO_LONG` at `b64(atlas.pixels)`). Stage 2's
whole-library atlas already measured ~511M chars of base64 — about 5%
of headroom — because region demand was doc-only and therefore zero in
that scene. With baked defaults, the same scene demands the region
cells too (~368 extra cells), and the string crosses the limit.
Verified: the stage-2 tree passes phase6 solo in this VM (exit 0);
this tree fails solo at the same line, before any assertion runs.
The live instrument never builds a whole-library scene (rolls and the
default scene use curated subsets), and for realistic scenes the
region demand grows the atlas ~35% per dimension from the 6,048² the
FX default scene measured at stage 2 — far inside the 8,192 texture
ceiling. Fixing the harness means chunking the payload transport or
scoping the hostile scene's enabled set: a test-harness change, not an
R3 behaviour change, and not one this stage makes unilaterally. It is
flagged here as a follow-up call for the coordinator.

**rollSafety — read this before the sweep line.** On this branch the
suite does not complete in the sandbox: in the full sweep it exited 1
after its 36-roll section, and solo it was SIGKILLed (exit 137) inside
the final guard section — in both cases AFTER every executed assertion
passed, with numbers identical to stage 2's run (36-roll section:
"2 of 34 unguarded rolls are dim-on-dark", all [ok]). No assertion
failure was printed in either attempt; the process dies, it does not
fail. Control run, same VM, same hour: the stage-2 tree's rollSafety
passes solo end-to-end (exit 0; guard section: "40 rolls, 14 dead as
dealt, 0 still dead after the guard"). The difference is weight, and
it is the feature working as ruled: rolled scenes now carry region
atlases for the 74 defaulted assets (stage 2's demand mechanism,
unchanged), and this sandbox has 8 GB — the suite's node process alone
peaked ~3.4 GB RSS in the sweep, before its Chromium children. CI on
the Mac runner is the authoritative run for this suite (same class as
the Playwright e2e the sandbox cannot run); the two standing
base-identical sandbox failures (swarmWasm "cargo not found", accum
V8 OOM) are unchanged. Flagging plainly: if the coordinator wants
rollSafety green IN THIS SANDBOX before publish, that is a
suite-harness memory question (scene-at-a-time browser recycling),
not an R3 behaviour change — R3 does not touch the governor budgets or
stage 2's shed ladder, per the brief. (Provenance note: the first
sweep's log was lost when the sandbox VM restarted mid-run — it had
reached 284+ passes with only these same failures showing. The numbers
above are from the complete re-run, logged at
`~/workspace/sweep-1434/sweep2.log` outside the repo; the solo control
logs sit beside it.)

## Judgment calls (flagged plainly)

1. **Centre rule** = nearest the centre of ink. The issue says
   "centre region pulses" without defining centre geometrically; this
   is the deterministic reading, and on flora_flower_01 it picks the
   true centre. A colour-keyed rule (the odd colour out) would be
   bake-magic; geometry is honest.
2. **Radial = ALL pulse.** The issue's "radial pulses" read plainly.
   An alternating pulse/rock radial is a design variant — Matt's call
   if he wants it; the table is one function.
3. **The override lives in the project doc, not on the asset record.**
   The issue says "bakes never clobber artist assignments". If edits
   were written into the record, the next bake would either clobber
   them or need a merge; keeping them in the doc makes the precedence
   structural (doc over record at resolve time) and keeps a re-bake a
   pure function. Consequence: an artist's per-region edit travels
   with the PROJECT, like region slots do — the same asset in a
   different project starts from the family defaults. That matches how
   slots already behave.
4. **Tombstones for "still".** A cleared assignment must be
   distinguishable from "never edited", or the default would silently
   resurrect it. `null` in the doc map is that distinction, and it
   survives save/load (pinned).
5. **The honest-feed record** is a tweak under the shared recorder
   (key `'regionKineme'`) rather than a new event class — the issue
   asks for LAYOUT_PARAM-class, and a parallel recorder would fork
   the undo-burst collision logic for nothing.
6. **Duplicates re-tag too.** A duplicated custom asset is an arrival;
   it inherits the source's tagged record when present, else detects.
   One extra branch in `duplicateAsset`, pinned by the overlay path.
7. **Assignment-change undo**: edits flow through the store action
   like other asset edits; no dedicated undo entry was added (region
   slot edits don't have one either — same class, same treatment).
8. **phase6 / rollSafety were NOT "fixed" in this stage.** Both are
   harness ceilings that the defaults' designed weight crosses (see
   Verification). The alternatives were weakening the hostile test,
   capping demand the governor never asked for, or redesigning the
   parity transport — all worse than an honest flag. If the
   coordinator rules the harness work in-scope for the lane, it is a
   small follow-up: chunk `buildRenderPayload`'s atlas transport (or
   scope the hostile scene), and recycle the browser per scene in
   rollSafety's guard section.

## What did NOT ship

- **No new families.** crystalline/biosynthetic/etc. get no defaults —
  the issue's table names three families; widening it is Matt's call.
- **No governor changes** — budgets, shed ladder, and stage 2's demand
  mechanism untouched, per the brief.
- **No liveAtlas canvas-path coverage** — stage 2's flagged gap stands
  (the Node suites cover the contract/pack/renderer path; the
  canvas-detection path still has no Node coverage).
- **R4 (#1435)** is untouched — strips for waveforms/lines remain the
  next stage.
