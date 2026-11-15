# STAGING REPORT — #2119 Motion Core P7, step 1: the pinning selfcheck

**Branch:** `kc-2119-step1` · **Base:** `2f439c44` (current main, PR #2175 head) · **Behaviour change: NONE** — no production file is touched.

## The verified answer (Phase 0's question)

**A creature or beast part DOES receive its asset kineme and its region kinemes today.** It works by ordering, not by any creature-specific kineme code:

1. `buildSceneContract` expands creature rigs into ordinary instances **first** — `expandCreatureInstances` at `app/src/gl/sceneContract.js:717` (call site; the expansion itself is `app/src/engine/creatureRig.js:507`). Each part becomes an ordinary instance whose key is `<body key>#<bone id>` (`placePart`, `creatureRig.js:382` — beast bars and the beam ride the same function, `expandBeast` → `placePart`).
2. The kineme pass runs **after** expansion, over the already-expanded list (`sceneContract.js:751–778`): for each instance, `own = getAssetKineme(map[inst.asset])` (:760); a hit sets `inst.kineme = slot` (:776) and `inst.kinemePhase = kinemePhase(inst.seedOffset, inst.key)` (:777). So a part takes **its own asset's** kineme at **its own phase** — the phase hashes the part's full key (`C#l0.0`), never the body's key (`C`). An asset with no `assetKineme` entry gets neither field.
3. Region kinemes resolve per asset over the same expanded list (`sceneContract.js:784–850`) and are emitted as `contract.regionAnim = { budget, assets: { [assetId]: { [regionId]: slot } }, bend? }` — keyed by **asset**, slots into the same kineme table. A part carries its region kinemes by being an instance of that asset; the suite's solo-creature case proves the entry exists because of parts alone (no ordinary instance of the asset is on stage).

**Step 3 must preserve this ordering**: expansion before the kineme pass, parts as ordinary instances when the pass walks the list.

### Drift vs the spec's read (docs/design/figures-spec.md §1, read @ 58c7f11e)

The mechanism is exactly as the spec described; only line numbers moved, by the #2104 work that landed in between: expansion call ~715 → **717**; kineme pass ~750–775 → **751–778** (the pass IIFE opens at :751, `inst.kinemePhase` at :777); region resolution ~784+ → **784–850**. No claim in §1 was found wrong.

## What the suite pins

`app/src/gl/figurePartKineme.selfcheck.mjs` (7 cases, house `ok()` style, fixtures in the creatureKin/beastTile pattern — tiles built through the assembler's own door, contracts built directly):

1. **Part kineme (positive)** — solo creature whose body shape (`line_squiggle_03`) carries `assetKineme: pulse`: every part instance (key `C#<bone>`) wears that asset and carries the pulse slot; `contract.kinemes[slot-1]` deep-equals the pulse entry `{kind: pulse, period: 1.6, amp: 0.12}`.
2. **Part phase** — each part's `kinemePhase === kinemePhase(part.seedOffset, part.key)` exactly; all five bone phases distinct; the body instance itself carries neither field; no part rides the body key's phase.
3. **Negative pin** — a part whose asset has no `assetKineme` entry (entry names an off-stage asset instead) carries neither `kineme` nor `kinemePhase`, and the contract grows no kineme table.
4. **Region kinemes** — the squiggle's family-default assignment (`rm-000000-4-4 → bend`) appears as `regionAnim.assets['line_squiggle_03'] = { 'rm-000000-4-4': <slot> }` with the slot pointing at the bend table entry, `regionAnim.budget === REGION_TAG_CAP` (12), and the stroke-region bend subdivision pinned (`regionAnim.bend[…][…] === bendSlicesFor(record)`, 7 slices).
5. **Region negative** — `org_blob_01` has baked regions but no assignment: parts on stage, `contract.regionAnim === undefined`.
6. **Beast parts** — a real beast fixture (`beastTile(dealBeastMeasures(7, 0))`, the beastTile suite's own fixture) on a stage whose five shapes all carry `rock`: all 97 part instances (beam + 12 bars × 8 legs) carry the rock slot, each at its own-key phase.
7. **Determinism** — the same doc built twice serializes byte-identically (`serializeSceneContract`), and the creature contract passes `assertSceneContract`.

No `Date.now` / `performance.now` / `Math.random` anywhere in the suite; every phase derives from the seed hash.

## Files

| File | Change |
|---|---|
| `app/src/gl/figurePartKineme.selfcheck.mjs` | NEW — the pinning suite |
| `app/selfcheck.manifest` | +1 line registering the suite beside `sceneContract.selfcheck` (package.json untouched) |
| `app/src/engine/creatureAssembler.selfcheck.mjs` | Re-pin at full strength: the new suite added to that suite's stage-side-reader allowlist, with a #2119 comment in the list's own voice (a test that builds tiles through the assembler's door and reads contract output only — the precedent entries are risoFieldLook, creatureKin). The guard itself is unchanged and still sweeps the whole tree. |
| `STAGING-REPORT-2119-STEP1.md` | This report |

No production file was modified; `liveLoop.mjs`, `liveResolve.mjs`, `particles.js` untouched; every golden byte-identical (allEraGolden: 985 assets, 24296 svg bytes).

## Verification (publish ritual, all on the final tree)

- **New suite**: `figurePartKineme.selfcheck: OK (7 cases)`.
- **Decisive neighbours**: sceneContract OK (15 cases) · world OK · replayGate ok · creatureGate ok · allEraGolden ok (985 assets, 24296 svg bytes) · canon ok · response OK · composite — see below.
- **Source-shape pins**: grepped all selfchecks for the files touched. One hit with teeth: `creatureAssembler`'s reader allowlist (above) — re-pinned, suite green (11 checks). The other manifest-referencing suites (dishLinks, dishSpin, exposureModel, wetLook) all pass.
- **Full manifest sweep** (continue-on-error, 686 commands): **682 PASS, 4 FAIL**, all accounted for:
  - `swarmWasm`, `rollSafety`, `accum` — the known sandbox-environmental family; each fails identically on clean `2f439c44` (swarmWasm exit 1; rollSafety exit 137, sandbox kill; accum exit 134 SIGABRT — never reaches an assertion). CI arbitrates.
  - `creatureAssembler` — failed only because the new suite wasn't yet on its allowlist; re-pinned (above) and green on the final tree; green on clean base (exit 0), as expected — the failure named my file, not base behaviour.
  - `composite`, `wetWarmup`, `wetSoak` each failed once under parallel load with a headless-Chromium WebGL program-link error (`Too many attributes (gl_InstanceID)`) and **pass serially on this tree** (exit 0 ×3); composite also passes on clean base. Sandbox harness load, not the tree.
- `npm run lint`: **0 errors** (11 pre-existing warnings, none in the touched files).
- `npm run format:check`: **clean** (the new suite was prettier-formatted; re-ran green after formatting).
- `npm run build`: **green**.

**Visible-change verdict: NONE.** Test-only slice — nothing for Matt's eyes; backend lane.
