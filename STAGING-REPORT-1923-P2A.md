# STAGING REPORT — #1923 DISH LIFE Phase 2, slice A: the coupling's first consumer (SCALE)

Branch `feat/dish-life-coupling-scale-1923` on base main `aee71006`. Built, not pushed, no PR.
Issue title (verbatim): "DISH LIFE: a Game-of-Life culture phase over the petri dish".

## What was built

The invisible FIELD culture Phase 1 built (PR #1995) now has its first reader. A new pure seam
module, `app/src/engine/dishLifeCouple.mjs`, samples the field stage's published `level`/`activity`
arrays at a mark's canvas position (nearest cell, read-only), and the live placement path folds each
non-form mark's scale by the sampled level and the coupling dial: alive territory swells, dead
territory shrinks, a mid field is neutral. The seam is deliberately consumer-shaped — `fieldSampler`
returns `{level, activity}` per position, not a scale factor — so the later Phase 2 slices (FIELD
glyph breathing, pattern modes incl. TIDES, CONTENT backgrounds) read the same seam this slice built.

**Two stamp slots, not a swap.** The loop's one culture slot (`input.dishLife`) is owned by the
quiet/idle stamp; replacing it would have killed the ruled always-on quiet layer. Field stamps
therefore flow on a new input key, `input.dishField`, with the dial value beside it
(`input.dishFieldCoupling`), and the resolver holds a **second, draw-less stage instance**
(`dishFieldStage`) fed only by `mode:'field'` stamps on that slot (mode-guarded: anything else
recorded there reads as no stamp, so the field stage can never draw, dissolve or speck). The field
stage applies before the visual culture, so it seeds from the scene as dealt; the coupling reads its
publication one frame behind — the same contract as the existing kineme culture read.

**Producer.** `liveLoop` stamps the field (`dishLifeField.fieldStamp`, the Phase 1 pure clock) only
while the family is on AND the dial is above 0 — Matt's ruled on-switch. At dial 0 the loop emits
neither key, so the recorded input stream keeps its exact pre-Phase-2 shape.

## Control surface, as left

- **Store:** `dishLifeCoupling: 0` + `setDishLifeCoupling` in `globalSlice.js`, beside
  `dishLifeStrength`, same class: runtime-only, never serialized into projects/bundles/takes' shared
  state; junk input reads as 0 (the off direction). The dial **starts at 0** and Matt raises it.
- **UI:** a second bare RangeRow slider inside the existing DISH LIFE chip (footer, after the
  redo pair), shown while the family is on, next to the strength dial: 0–100%, step 5, default 0,
  aria label "Dish life coupling", help topic `dish-life-coupling` (added to `helpCopy.js`).
  It is a strength slider in the codebase's existing control idiom — **no chip, no toggle**, per the
  ruling. Raising it above 0 is the on-switch.
- **Persistence:** the chip preference (`kc.dishLife.v1`) extends to `{on, strength, coupling}`;
  preferences stored before this slice carry no coupling key and read as 0.

## Constants (one place: `engine/dishLifeCouple.mjs`, DISH LIFE constants style)

| Constant | Value | Meaning |
|---|---|---|
| `COUPLING_MAX` | 1 | the dial's range top |
| `SCALE_NEUTRAL_LEVEL` | 0.5 | the level that leaves scale unchanged |
| `SCALE_SWELL` | 0.4 | max fractional scale change at full dial at an extreme level → factors in [0.6, 1.4] |
| `SHED_HOLD` | 2 | the governor's CULTURE HELD depth at which coupling reads as 0 |

Factor law: `1 + coupling × (level − 0.5) × 2 × SCALE_SWELL` — exactly 1 at dial 0 or mid level.

## Exclusions (each structural, each pinned)

- **Poem/plate form items** — built by buildPlacements' form branch, never pass through the SoA the
  fold reads. Pinned at the seam: with a uniformly alive or dead field the marks move and every form
  item's scale/position is bit-identical to the uncoupled build.
- **HELD / still-pinned marks** (`assetStill` pins) — skipped by the fold (bedrock law, admission 3).
  Pinned in the applier tests.
- **Terrain/bedrock** — never seeded (Phase 1) and never an item to fold.
- **Swarm-stratum items** — the resolver passes the fold only to the asset path, never to
  `swarmItems`; organisms are not marks (Phase 1's swarm-contact law keeps the culture out of the
  swarm entirely).
- **Pattern/FX layers (QUILT/GLYPH/FIELD/TIDES strata)** — they never reach buildPlacements; their
  culture coupling is their own later slices, reading this same seam.
- **Marks outside the canvas** — no cell to read; untouched.

One honest interaction, stated rather than hidden: a *new field cycle* seeds from the stage as
presented — with the dial up, that includes the previous cycle's modulated scales in the coverage
radius, exactly as Phase 1 seeded the visual culture from the presented scene. Within a cycle the
culture evolves purely by its own engine; the culture still never writes any system's state, and
Phase 3's closed loop (periodic re-seed, ruled IN) is a later slice's explicit design, not something
this slice smuggles in.

## The four-part admission test — evidence (suite `src/engine/dishLifeCoupling.selfcheck.mjs`, 18 cases)

1. **Seeded/replayable** — the fold is a pure function of (published arrays, dial, item). Pinned:
   same coupled input stream on two fresh resolvers → bit-identical frame hashes; the same SoA
   folded twice → identical output; sampling checksum-proven read-only over the holder arrays.
2. **Governor-sheddable** — `effectiveCoupling` folds the dial to 0 at shed ≥ `SHED_HOLD` (the
   stamp's own shed rides every frame). Pinned at resolver level: shed 2 + dial 1 ⇒ frame hashes
   equal the plain run exactly; shed 1 (trickle) still acts.
3. **Lock-respecting** — still pins skipped (applier pin); bedrock never seeded (Phase 1) and never
   folded; HELD items reach the fold only as still pins, which is the skip.
4. **Log-accountable** — no new state anywhere: the dial and the shed ride the recorded input stream
   on every frame they act (`dishField` stamp + `dishFieldCoupling`), which is the take's input
   log — the same authority every other culture fact answers to (KC-1 DS rule 10). Nothing about
   the coupling exists outside that stream and the runtime-only store dial.

Further pins: coupling-0 / publication-alone / dial-without-field byte-identity vs the plain
resolver (30-frame hash streams); modulation acts from frame 2 (frame 1 has nothing published yet),
bounded in [0.6, 1.4], both directions present at the seed generation, and the up/down mix turns as
the culture evolves; dropping the stamp restores the exact plain frames the next frame; a second
cycle's re-seed keeps driving; a mid-coupling snapshot (new optional `dishField` key, same terms as
Phase 1's) restores and continues bit-identically, malformed field state refused by the validator,
pre-Phase-2 snapshots still validate; works while interacting — the field stamps ride the normal
frame stream throughout (there is no idle gate anywhere in this path; idle ≥8s still governs only
the visual culture).

## Verification (all run by the coordinator-side builder, this worktree)

- New suite: **18/18**. Neighbouring suites: `liveResolve.dishLife` ok · `dishLifeStage` ok ·
  `dishLifeField` 11/11 · `dishLifeChip` 8/8 (one re-pin: the preference read shape gained
  `coupling` — cause recorded in the test) · `resolverSnapshot` ok (13 scenarios) · `helpCopy` OK ·
  `census` OK · `goldenPlacement` OK, golden hash `e892d112…` unmoved.
- **Coupling-0 default state moves nothing on main's standing fixtures**: golden hash unchanged;
  census suite green; the suite's 30-frame hash identity covers the resolver end-to-end. (The
  560,366 placement-census figure from the #2006 slices came from a slice-local probe harness, not
  a repo script; its repo-resident gates are the census + golden suites above, both green.)
- **Full manifest sweep** (continue-on-error over `app/selfcheck.manifest`, 616 lines):
  **613 pass / 3 fail** — `swarmWasm`, `rollSafety`, `accum`. All three proven **base-identical**:
  re-run in a fresh detached worktree at `aee71006` (with `npm install`), each fails with the same
  signature — swarmWasm: the checked-in kernel wasm does not reproduce from rust sources in this
  sandbox; rollSafety: same error at the same line (202) inside its browser-driven chaos-rolls
  case; accum: native abort at the identical stack after the identical 69 [ok] checks (sandbox
  Chromium/GL environment). CI's browser job is authoritative for all three.
- `npm run format:check` clean (one file prettier-written: the new suite). `npm run lint`:
  0 errors; 11 warnings, all pre-existing in untouched files.

## New-assumption sweep (standing rule)

| Grep | Result |
|---|---|
| selfchecks referencing `buildPlacements(` / `resolveLayers(` / final scale | Every caller passes no `cultureScale` key → the gate is off and output is bit-identical; the full sweep confirms (613 green incl. all placement/kineme/review suites). |
| Suites building placements with a live field present | None existed — the field stage was unreachable from the loop before this slice (Phase 1's flagged deviation). The new suite is the first to build with one. |
| Snapshot-shape pins (`snapshotState`/`checkResolverSnapshot` users: resolverSnapshot, spawnState, retroCapture, performanceFile, review suites…) | The `dishField` key is additive-optional on Phase 1's exact terms; all green in the sweep. |
| Chip/store preference pins | `dishLifeChip.selfcheck` deep-equalled the old `{on, strength}` pref shape → re-pinned with cause (the preference gained `coupling`); helpCopy gained one topic (its suite checks uniqueness/shape, green). |
| e2e specs | `grep -rn "dish" e2e/` — zero hits before and after; no e2e surface touched. |
| Word/value gaining new meaning | `dishField` / `dishFieldCoupling` are new names, coined here; no pre-existing literal collides (grep over src: only this slice's files). |

## Files

New: `app/src/engine/dishLifeCouple.mjs` (the seam + fold), `app/src/engine/dishLifeCoupling.selfcheck.mjs`.
Touched: `app/src/engine/buildPlacements.js` (one gated fold call), `app/src/gl/liveResolve.mjs`
(second stage, coupling read, snapshot/restore/validate), `app/src/gl/liveLoop.mjs` (field-stamp
producer), `app/src/state/slices/globalSlice.js` (the dial), `app/src/components/DishLifeChip.jsx`
+ `dishLifeChip.model.mjs` + its selfcheck (the slider + preference), `app/src/data/helpCopy.js`,
`app/selfcheck.manifest` (+1 line). The pure engine (`dishLife.mjs`), the stage, the field clock
and the Generations rules are **untouched**.
