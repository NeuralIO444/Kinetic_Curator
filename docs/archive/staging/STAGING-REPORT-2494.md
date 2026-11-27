# A16 (#2494) staging report — ASSETS ALL ON silently does nothing when the filter matches 0 assets

## Verdict

**The filed hypothesis is half right: ALL ON does apply to the filtered set — deliberately,
symmetrically, and documented — but on an empty filtered set the press is still silent. The
semantic stands; the silence is fixed.** When a narrowing filter (search text, a facet or a
role chip) matches 0 assets, the pool's empty line now names the consequence for the bulk
controls: "nothing matches — shown on/off have nothing to act on — remove a filter above".
Un-narrowed, the line is the pre-fix line byte for byte. No behaviour changes beyond the
defect's own correction: the bulk write itself is untouched.

## Mechanism (verified against this tree, base c587a618)

The code path, all in `app/src/panels/AssetPoolPanel.jsx` unless noted:

- `narrowed` (line 130) = a search text is present OR any facet/role chip is active
  (`chips.some((c) => c.kind === 'facet' || c.kind === 'role')`). The category chip alone
  does not narrow the panel's bulk funnel — and does not need to: the store's own
  `toggleAllAssets` (state/slices/globalSlice.js) is scoped to the category view, so the
  whole system acts on the viewed set at every level.
- `allOnOff(on)` (line 147–148) is the ONE handler behind both buttons:
  narrowed → `emit(Events.ASSETS_BULK, { ids: order, enabled: on })` where `order` is the
  shown ids; un-narrowed → `emit(Events.ASSETS_TOGGLE_ALL, on)`. The button labels switch
  together with the scope: "shown on"/"shown off" when narrowed, "all on"/"all off"
  otherwise — the label always names the true scope.
- The wire funnel (`composition/wireEventBus.js`) maps ASSETS_BULK {ids, enabled} to
  `SET_ASSETS_ENABLED` → `setAssetsEnabled(ids, on)`, which iterates the id set: an empty
  list is a true no-op. Nothing downstream announces that the set was empty.
- The semantic is established, not accidental: (1) ON and OFF share the handler — perfect
  symmetry; (2) the agent-UI registry documents it for both controls ("Enables every asset
  (in the narrowed filter, the panel enables exactly the shown set)" — uiRegistry.mjs,
  assets.all-on / assets.all-off); (3) the panel's other bulk controls follow the same
  idiom — the category-weight row acts on the named category with a title saying so, the
  inspector's BulkBar acts on the named selection. Both the narrowed funnel and the
  "shown on/off" labels arrived with the pool inspector itself (#1943, PR #1954), which
  is an ancestor of the stress build f260b74 — the session's "ALL ON" is the registry
  name; on screen, narrowed, the button already read "shown on".

So the fix branch is the charge's first: keep the semantic, fix the silence.

## Reproduction (store/logic level, through the press's own funnel)

Reproduced at the store/logic level rather than in the built app: the defect lives in the
panel's emit/feedback logic, not in rendering, and the panel's 266-tile grid under
SwiftShader makes the browser path the slowest way to prove a state fact. The repro drove
the exact code the press drives (filterRecords → shown ids → setAssetsEnabled):

- Real catalogue: 266 pool records over 1155 library assets.
- Cross-facet filters whose intersection is empty on the real data exist — e.g.
  subject:leaf × script:letter → shown 0, narrowed true (also subject:organism ×
  script:digit → 0; a no-match search text → 0).
- Store put in the session's shape (exactly 6 enabled): `setAssetsEnabled([], true)` —
  the press's funnel with the empty shown set — leaves the enabled count at **6**. The
  filed "header stayed 6/1155 active", reproduced exactly.
- Contrast, as filed: a non-empty narrowed press enables exactly the shown set
  (form:dot × mood:print × script:glyph → 1 shown → 1 enabled), and the un-narrowed
  toggle-all lights all 1155.

## The fix (3 files + pin + manifest line)

1. **`app/src/panels/assetPoolLogic.mjs`** — new pure helper `poolEmptyNote({ narrowed })`
   (the panel renders; this decides, per the module's standing contract). Narrowed →
   "nothing matches — shown on/off have nothing to act on — remove a filter above";
   otherwise → the pre-fix line, byte for byte.
2. **`app/src/panels/AssetPoolPanel.jsx`** — import `poolEmptyNote`; the pool-empty line
   renders `{poolEmptyNote({ narrowed })}` instead of the hard-coded literal. One line of
   JSX, one import entry. No new surface, no layout change, no other copy touched.
3. **`app/src/panels/assetPoolEmptyBulk.selfcheck.mjs`** (new, manifest-registered) — the pin.

Why the line and not a disabled button: the A7/#2485 discipline — one honest line naming
the state, in the place the user is already looking. The empty line is what the filed
report itself quoted ("list '0/1155 NOTHING MATCHES'"); it now names the consequence for
the controls as well as the list. The buttons stay pressable and truthful.

## Pin — assetPoolEmptyBulk.selfcheck.mjs, discrimination A/B-proven

- **On pristine base** (scratch worktree at c587a618, pin copied in alone): **FAIL, exit 1**,
  first assertion: "AssetPoolPanel must import poolEmptyNote from assetPoolLogic — without
  it the empty line cannot name the bulk consequence". The failure is the filed reason:
  on base, no part of the panel can name the consequence.
- **On the fixed tree: PASS** — `assetPoolEmptyBulk.selfcheck: ok`. Sections:
  - *source*: the panel imports and renders `poolEmptyNote({ narrowed })`; the bare literal
    is gone from the panel; the bulk semantic and its symmetry are pinned standing (same
    allOnOff line, both buttons on the one handler, the narrowed formula unchanged).
  - *note*: the narrowed line is exact and names the controls + the empty act; the
    un-narrowed/default lines equal the pre-fix line byte for byte.
  - *state*: the filed state on real data with measured counts in the messages — the
    leaf×letter filter matches exactly 0 of 266; exactly 6 enabled survives the press's
    funnel at 6; a partial narrowed press enables exactly the shown set; un-narrowed
    ALL ON enables all 1155.

## Verification

- Pin: PASS (above). Neighbour `assetPool.selfcheck`: PASS.
- Every suite that reads the touched files (grep for AssetPoolPanel / assetPoolLogic
  across selfchecks): casingInCss, dishPins, ra4, typeExclusivity, constructCatalogue,
  assetAttach, loisLines, wetLabDeal, fieldKana, fieldKanji, fieldLatin, fieldPlate,
  rayGunBitmap, rayGunWear — **all PASS**. uiRegistry (333 controls): PASS — no control
  changed, no registry edit needed or made.
- format:check on the three changed source files: clean. Lint on the same: 0 errors.
- Build: green (`npm run build`, exit 0, built in 3.85s) — after `npm install` in this
  worktree; before that, the build fell back to a sibling worktree's node_modules and
  failed resolving `@tauri-apps/api/event` from useCuratorIPC.js, a file this slice does
  not touch (environmental: this worktree had no node_modules of its own). The install's
  one-line lockfile churn (a "license" field) was reverted; the commit carries no
  lockfile change.
- Full manifest sweep: see the sweep tally appended below at commit time.
- One-writer files untouched: `app/src/gl/liveLoop.mjs`, `liveResolve.mjs`,
  `app/src/engine/particles.js` — none in the diff.

## Follow-up noted, not built (per the charge)

The non-empty filtered press: does the UI say how many it turned on? It does — the header
subtitle (`N/1155 active`) moves by exactly the delta, the pool-shown counter shows the
shown count the label promised ("shown on"), and the tiles light. A partial-filter press
is distinguishable from a global one by label, counter, and header. No gap; nothing filed.

One observation for the record, not a defect: with only a category chip picked, the
buttons read "all on"/"all off" and the store scopes the toggle to that category view —
the label and the scope agree, but a performer who reads "all" as "the whole library"
would be surprised on the USER tab (where ALL ON lights only their own assets, by the
store's deliberate rule). The copy question is Matt's if he ever wants it; this slice
does not touch it.

## Lane routing note

Review lane. The only performer-visible change is the defect's own correction: in the
one state the issue files (a narrowing filter matching 0), the pool's empty line gains
the clause "shown on/off have nothing to act on". Every other state renders byte-identical
copy, and no press changes its effect anywhere. No new surface, no layout change.

## Sweep tally

Full manifest sweep on the fixed tree (839 suites): **834 PASS / 5 FAIL**. Every failure
classified by A/B or standalone tiebreaker — none is this slice's:

- `swarmWasm` (exit 1) and `rollSafety` (exit 1): re-run on pristine base c587a618 and on
  the fixed tree in the same window — **exit 1 on both, base-identical** (the standing
  sandbox environmental set).
- `accum`: the standing environmental set (abort/killed on pristine main, A/B-proven in
  prior lanes); not re-run standalone because its in-sweep signature matched the record.
- `accumFreezeClear` and `pausedRecallPresent`: failed only inside the sweep (which ran
  839 suites back-to-back and was itself OOM-killed at the tail). Standalone on the fixed
  tree, both **PASS** — accumFreezeClear ok (10 groups), pausedRecallPresent ok
  (18 groups). Load failures, settled by the standalone tiebreaker.
- The new pin, `assetPoolEmptyBulk`, is one of the 834 passes.

## Publish composition note (coordinator, 2026-11-27)

- Composed onto origin/main 2ea36431 by cherry-pick of the staged commit b075cd34 —
  zero conflicts. The report was relocated from the repo root to docs/archive/staging/
  per the current convention.
- The sweep tally and source line numbers in the body above are from the builder's base
  (c587a618). On the composed tree: the new pin plus all 16 suites that read the touched
  files PASS, uiRegistry PASS (333 controls), lint 0 errors, format:check clean,
  production build green. The full manifest sweep was NOT re-run on the composed tree.
- QA Review (independent pass on the composed diff): CLEAN. The reviewer re-proved
  discrimination against current origin/main — the pin alone on pristine 2ea36431 FAILS
  with the filed assertion and PASSES on the composed tree — and independently measured
  the 266-record / 1155-asset figures and the filter counts. Minor non-blocking notes:
  state-level pinning covers the ON behaviour (OFF symmetry rests on the source pins;
  acceptable — the filed defect is ALL ON), and the narrowed formula is pinned verbatim
  at source level rather than behaviourally for every chip kind.
