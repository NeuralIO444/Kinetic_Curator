# STAGING REPORT — #1694 slice S3: controls fold-in (LOCAL ONLY — no push, no PR)

Branch `ember/1694-s3-controls-fold-in`, base = S2 tip `e8fa9792`. This is the last
slice of the creature repipe. It implements Q3 as ruled: **the creature count becomes
a BUILD param; the DIRECTORS stepper retires.** (This file replaces S2's staging
report at the worktree root; S2's remains in git history at `e8fa9792`.)

## What was built

1. **The count's new home.** `creatures` joins the BUILD layout-param family in
   `app/src/data/layout-modes.js`:
   - `DEFAULT_LAYOUT_PARAMS.creatures = 0` (the pre-fold-in store default — an
     untouched stage spawns nothing).
   - `PARAM_SPEC.creatures = { min: 0, max: 4, int: true }` — the bounds are
     `sanitizeCount`'s bounds (`curator/spawn.js`, `MAX_CREATURES`), so the trust
     boundary and the spawn sanitizer clamp to the same 0..4.
   - Deliberately **not** in `RANDOMIZABLE_KEYS` / `MORPHABLE_KEYS`: the dice,
     Evolve and morphs never write the count. It is quantized hand input only.
2. **The surface.** BUILD §3 Motion & Behavior's hype/moth block gains a **CREATURES**
   ValueButton (SliderEditor 0..4, step 1, `Math.round` on write) at the top of the
   stack, written through the block's existing `set()` → `Events.LAYOUT_PARAM
   {key:'creatures'}` door. Not mode-gated — the stepper never was. The block is
   renamed to what it is: file `CreatureSliders.jsx` → **`HypeSliders.jsx`**
   (component `HypeSliders`, subheader "hype / moth", the 🦋 gone). BODY / flap /
   TIGHT / breath / wind / METABOLISM did not move.
3. **The old home retired end-to-end.** Store field `creatureCount` + `setCreatureCount`
   (`state/slices/globalSlice.js`), the `creature:count` bus event
   (`composition/eventBus.js`, `eventRegistry.js`, `wireEventBus.js`), the
   `SET_CREATURE_COUNT` action (`state/actions.js`, `state/applyAction.js`), and the
   DavisPanel header stepper (chips 0–4, `data-testid creatures-N`). `PanelHeader` in
   DIRECTORS is self-closing again — the header returns to its pre-#1355 height.
4. **Resolver contract unchanged in shape.** `gl/liveLoop.mjs` still stamps
   `creatureCount` on the resolver input every frame; the source is now
   `layoutParams.creatures` (the same spring-damped params object every slider
   rides; `| 0` keeps the stamp the integer the spawn channel has always read),
   still net of the S2 `creatureShed` overlay. Spawn machinery untouched.
5. **Governor.** `hooks/usePerformanceGovernor.js` derives its `creatureCount`
   from the existing `layoutParams` selection (`layoutParams?.creatures ?? 0`).
   The assembled governor state's shape is unchanged, so `governorCuts` cut 1.5
   (count sheds first) and its restore table are untouched, byte for byte.
6. **Autosave watch.** `state/projectWatch.mjs` drops `'creatureCount'` from
   `PROJECT_STATE_KEYS` — the count rides `layoutParams`, already watched
   wholesale. (The suite derives the list from `serializeProject`'s source both
   ways; it agrees.)
7. **Mind snapshot readout** (`App.jsx`) reads `st.layoutParams?.creatures ?? 0`.

## Storage shape + document migration

- **New shape:** the count lives only in `layoutParams.creatures` — in the store,
  in layer snapshots, and in saved documents (serialized inside `layoutParams`
  like every other param). `serializeProject` writes **no** top-level field.
  `PROJECT_VERSION` stays 1.
- **Old shape:** pre-S3 documents carry a top-level `creatureCount` (written only
  when > 0) and no `creatures` key anywhere.
- **Migration** (`landLegacyCreatureCount` in `state/projectDocument.js`, called by
  BOTH parse branches — legacy/versionless and v1): if the raw doc has a top-level
  `creatureCount`, its `sanitizeCount` value lands in `layoutParams.creatures` —
  root and per-snapshot. Rules: an explicit `creatures` key in a raw params object
  always wins (it is the new home); a snapshot whose raw params lack the key takes
  the legacy value; a snapshot with no params of its own (which `normalizeSnapshots`
  fills from the raw root) takes the landed root value. Post-migration documents
  are parse fixed points (verified). Hostile legacy values clamp through the old
  sanitizer (99 → 4, `'lots'` → 0).

## The §3 pin event — STOPPED before any re-record, as instructed

Adding `creatures` to the hashed layout params moved the whole-output pins, by
exactly the weather-slice mechanism: `liveResolve.mjs` merges input params over
`DEFAULT_LAYOUT_PARAMS` and embeds the merged params object in each layer result,
which the frame hash walks. **No pin was re-recorded. No fixture was touched.**

**Strip proof** (scripts kept at `~/workspace/scratch-1694-s3/strip-proof.mjs` and
`strip-wingwarp.mjs` — they delete the `creatures` key from the shared
`DEFAULT_LAYOUT_PARAMS` object before the resolver is created, then replay):

- creatureGate fixture (`gl/fixtures/creatureRepipe.kcperf`, unmodified): stripped →
  **ok: true, 901 frames, 16/16 checkpoints, firstMismatch null**.
- replayGate fixture (`gl/fixtures/replayGate.kcperf`, unmodified): stripped →
  **ok: true, 3601 frames, 61/61 checkpoints, firstMismatch null**.
- wingWarp suite with the key stripped → **fully green**, BENT_RESOLVER golden
  `9f0043e7` restored.

So with the one key removed, this branch's frames are byte-identical to S2's.
The divergence is the key, and only the key.

**Pins awaiting Matt's re-record ruling (exact list — these three suites fail ONLY
on the new key):**

| Suite | Unstripped failure |
|---|---|
| `src/gl/creatureGate.selfcheck.mjs` | first checkpoint divergence (frame 0) on the unmodified pre-repipe fixture |
| `src/gl/replayGate.selfcheck.mjs` | first checkpoint divergence (frame 0) |
| `src/engine/wingWarp.selfcheck.mjs` | BENT_RESOLVER golden: expected `9f0043e7`, got `dc0897fb` |

Note on the gate: the brief expected the gate could not move because its fixture's
inputs carry the count as a stamped field. Empirically it moves for the same reason
replayGate does — the hash covers the resolver's output, and the output embeds the
defaults-merged `layoutParams`, which gains the key regardless of the input. The
fixture file itself is untouched and never re-recorded by me; if Matt rules
re-record (the weather precedent, `63da9b44`), the coordinator records the new
checkpoints from the pre-S3 code path exactly as S1's Step 0 did, preserving the
fixture's provenance property.

## Census suite (new)

`app/src/panels/layout/foldInCensus.selfcheck.mjs`, registered in
`app/selfcheck.manifest` after `unlockTree`. 11 checks, all green: the param's
home + bounds ≡ `sanitizeCount`; machine key lists exclude it; the old home is
gone (store field/setter behaviourally absent, event/registry/wiring/action
source-absent); DIRECTORS carries no creature control and no `header-tools`;
BUILD's block sets the count 0..4 through the shared door, ungated, in §3; every
pre-slice param still reachable; `setLayoutParam` clamps like the stepper did;
the migration (root + both snapshot shapes, explicit-wins, hostile clamps,
fixed point, round-trip); and the claim's boundary — `?debug=skeleton`
(CanvasPanel, `isSkeletonDebug()` gate) and `?debug=stress` (App,
`DEBUG_STRESS` gate) named as dev surfaces outside the claim, Wet Lab pinned
count-free.

## Suite re-points (in-slice, stated per §3 item 4 / wiring-pin class)

- `curator/spawn.selfcheck.mjs` §7 — stamp regex re-pointed to the new source;
  the DIRECTORS-row pins replaced by retirement pins + the BUILD home pin; the
  save pin replaced by the migration mechanism (both parse branches call
  `landLegacyCreatureCount`; no `doc.creatureCount =` write remains).
- `composition/busChain.selfcheck.mjs` — the count now writes through
  `LAYOUT_PARAM {key:'creatures'}`. Found on the way: `SET_LAYOUT_PARAM` is a
  coalesced per-frame action (`dispatchPipe` HIGH_FREQ), so the checks emit →
  `await tick()` → assert, the suite's own flush idiom; the hostile `'lots'`
  write is asserted after a flush, so the refusal is genuinely exercised.
- `state/projectDocument.fuzz.selfcheck.mjs` — was passing **vacuously**: its
  count assertions were guarded by `'creatureCount' in good`, never true once
  serialize stopped writing the field. Re-pointed to set the count via
  `layoutParams` and assert `doc.layoutParams.creatures` unconditionally
  (exempting the `layoutParams`-is-the-bad-field case, where the count
  legitimately goes with its own field).
- `state/poolCitizenship.selfcheck.mjs` §3 — store setups/assertions via
  `layoutParams.creatures`; added pins: the doc carries the count inside
  `layoutParams` and has no top-level field. Its resolver-input stamps
  (`creatureCount: 4` on inputs) are the stamped contract and are unchanged.
- `state/projectWatch.selfcheck.mjs` — behaviour fixture: `creatureCount`
  entries removed; the `layoutParams` change case now changes `creatures`,
  which is the real-world wake case.
- `panels/layout/unlockTree.selfcheck.mjs` + `components/motionGlyph.selfcheck.mjs`
  — slider-file lists / source path follow the rename (pure wiring pins).

Untouched and green unmodified: `governorCreatureShed`, `governorCuts`,
`performanceCreatures`, `creatureCost`, `spawnState`, `census`,
`projectDocument.selfcheck`, `unlockTree` (catalogue + gates unchanged — the
count is not a gated param).

## Proofs

- Baseline before edits: 16/16 relevant suites green on the untouched base.
- After the build: every suite above green except the three §3 pins listed.
- Lint: **0 errors / 11 warnings** (exact baseline).
- Production build: green.
- Full manifest sweep: **483 run / 479 PASS / 4 FAIL**. The four failures are
  exactly the sanctioned set: `rollSafety` (standing sandbox exception,
  base-identical) and the three §3 pins above (`creatureGate`, `replayGate`,
  `wingWarp`) — failing only on the new key, per the strip proof. `swarmWasm`
  excluded by the sweep script per the standing method (sandbox, base-identical).
- `creatureGate` fixture: untouched (no fixture path appears in the diff).

## Deviations and flags

1. **§3 stop taken on creatureGate as well as replayGate/wingWarp** (see the pin
   section above for the mechanism and the strip proof). Nothing re-recorded.
2. **Count changes are now undoable.** Writes go through `setLayoutParam`,
   which pushes undo history like every layout param; the retired stepper wrote
   a plain store field and was not undoable. This is the generic BUILD-param
   behaviour Q3's ruling implies ("joins the BUILD param family"), flagged
   rather than special-cased away.
3. **Keeps now carry the count.** `captureFavorite` copies `layoutParams`
   wholesale and never carried the count before; post-S3 keeps carry it inside
   the layout, automatically. Pre-S3 keeps load with count 0 (no key → default).
   No code change was needed or made.
4. **Spring glide.** `liveLoop`'s slider springs damp every numeric param,
   `creatures` included (the int `count` already behaves this way); the stamp
   truncates with `| 0`, so a 0→4 change steps creatures in as the glide
   crosses integers — the same fade-in class as `count`-driven items. Takes
   record the stamped per-frame count, so replay stays exact.
5. **Historical docs left alone.** `docs/research/strata-quantized/qa-report.md`
   still names `CreatureSliders.jsx` — it is a dated audit record, not wiring.
6. Robots / L-system growths: not staged (no stage path exists; out of scope,
   untouched).
