# Motion map (Motion Core P0, #2110)

Status: **DIAGNOSIS ONLY** (epic #2109). No behaviour changed. Read-only audit of `main` @ `2a1c7ba` (the issue was written
at `554fa00`; every file:line below was re-checked on this head). Paths are under `app/src/`. "LIVE" is used as the repo
defines it (`docs/ROADMAP_V1.md:78`): a proven call chain from the running instrument. One claim (question 2) was proven by
running a throwaway probe against the real scene contract (output below; the script is **not committed**); everything else is code
reading, and I say where.

Which strata take kineme at all is **#2103** (PR #2123, `docs/design/stage-strata-in-the-world.md`); it is cited here, not
re-derived.

## The map

Targets: x / y / rot / scale / alpha / uv / colour. "Shed" = what the repo's own ladder does to it.

| Source                                                                                                 | File                                                                                                                               | Moves what                                                                                 | Targets                                                                                   | Time base                                                                                                                     | Applied where                                                                                                          | Budget / shed                                                                                                                                                                                | Deterministic?                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **GPU kineme library** (spin, osc/`rock`, pulse, blink, bob; `bend` is an osc id)                      | `data/kinemes.js:15` (`KINEME_KINDS`), `:22-40` (`KINEMES`), `:64` (`KINEME_TABLE_MAX = 16`)                                       | the whole mark, in place                                                                   | rot (spin, osc), scale (pulse), alpha-as-visibility (blink), y (bob)                      | `kinemeTime` — anchored clock over loop time (`liveLoop.mjs:182`, `:1074-1077`); phase = seed hash (`kinemes.js:122`)         | `QUAD_VS` `shaders.mjs:155-172`; slot per instance `sceneContract.js:762-777`; uniform upload `renderer.mjs:1318-1324` | 16 slots/frame (`sceneContract.js:763`); cost tier 0 (`renderer.mjs:561`). **No shed rung found** for instance kinemes                                                                       | yes — no clock, no chance in the data module; time is injected                                     |
| **CPU kineme drivers** (breath, drift, pulse, palette-breath, brush-wobble)                            | `engine/kineme.js:323` (`KINEME_DRIVERS`), `:441` (`evaluateKineme`), `:600` (`applyKinemeDrivers`)                                | each mark's placement                                                                      | scale (breath, pulse), x/y (drift), colour (palette-breath slot shift), _wobble: nothing_ | `driverSec` — a **second** anchored clock (`liveResolve.mjs:427`, `:778`)                                                     | `buildPlacements.js:605`, on the SoA, before poem letters and creature expansion                                       | descriptive `costTier: 'cpu-cheap'` on each row (`kineme.js:332-368`), not in the registry; ctx built with `shedTier: 0` (`liveResolve.mjs:269`). Amount 0 = bit-identical (`kineme.js:435`) | yes — hashed noise, "no `Math.random` anywhere" (`kineme.js:60`)                                   |
| **Driver patterns** (`KINEME_PATTERNS`: DRIFT, SWELL, THUMP, ORGANIC, CADENCE)                         | `engine/kineme.js:39`, rhythm `:129` (`evaluateRhythm`), `:189` (`applyRhythm`)                                                    | DRIFT/SWELL/THUMP re-weight the three amounts; ORGANIC/CADENCE switch on a placement field | scale, rot, x/y (rhythm)                                                                  | `driverSec`; THUMP also reads the live beat envelope (`kineme.js:32`)                                                         | `buildPlacements.js:~600-606`, before the drivers                                                                      | shed tier ≥ 3 → identity (`kineme.js:190`)                                                                                                                                                   | yes                                                                                                |
| **Transport** (`TRANSPORT_MODES`: still, flow, path; `PATH_FAMILIES`: orbit, spiral, sweep, lissajous) | `engine/kineme.js:705`, `:708`, `:1186` (`applyTransport`)                                                                         | each mark's home                                                                           | x/y (+ a deform on travelling marks)                                                      | **accumulative**: per-frame deltas (`travelFrameMs`, `liveResolve.mjs:824`), state snapshotted for takes (`:2000`)            | `buildPlacements.js:~640-690`, last in the chain                                                                       | registered tiers `travel/flow`, `travel/path`, `travel/budget` (`kineme.js:1432`, `:1445`, `:1520`); default `transport: 'still'` (`layout-modes.js:232`)                                    | yes (a pure sim of the seed + deltas)                                                              |
| **Region kinemes**                                                                                     | `data/regionKinemes.js:30` (`REGION_TAG_CAP = 12`), stroke bend slices `:158-177`                                                  | tagged regions inside a mark                                                               | whatever the library kineme drives, per region (rot/scale/y/visibility)                   | `kinemeTime` (`renderer.mjs:1541`)                                                                                            | pack time: `renderer.mjs:705` (`expandRegionInstances`); slots join the 16-slot table (`sceneContract.js:~806-816`)    | budget 12 desktop / 8 iPad-class (`sceneContract.js:443-447`); freeze at tier-1 rung `:417`, collapse `:428`; cost `gl/region-instances` tier 0 (`renderer.mjs:586`)                         | yes                                                                                                |
| **Cell kinemes** (UV strips)                                                                           | `data/cellKinemes.js:6-14` (6 strips)                                                                                              | the picture _inside_ the mark                                                              | uv                                                                                        | `kinemeTime` (`renderer.mjs:1541`)                                                                                            | pack time `renderer.mjs:854-862`                                                                                       | shed pins cell 0 on the tier-2 rung (`sceneContract.js:405`, `:904`); cost `gl/cell-kineme` tier 0 (`renderer.mjs:572`)                                                                      | yes                                                                                                |
| **Moth**                                                                                               | `engine/creature.js` (`hoverPose` `:156`, `mothRecipe` `:200`) over `hierarchy.js`, `skeleton.js`, `wingWarp.mjs`, `featherFan.js` | a whole creature on a pin + its parts                                                      | x/y/rot/scale (hover), wing rot (beat), wing mesh vertices, feather instances             | **both**: hover reads `driverSec` (`creature.js:158`); growth/pairing are **resolver-frame counts** (`creature.js:46`, `:56`) | `liveResolve.mjs:754` builder, `:1836` append                                                                          | cost `creature/moth`, `engine/creature-feather-fan` (`kernel/costRegistry.mjs:198`, `:279`); shed by creature count                                                                          | yes — "no clock, no chance" (`creature.js:12`); builder state snapshotted (`liveResolve.mjs:2021`) |
| **Dish creature**                                                                                      | `engine/dishCreature.js` (XPBD discs, `createDishCreatureBuilder` `:410`)                                                          | disc positions and radii on the hosted pin                                                 | x/y/scale per disc                                                                        | **resolver-frame count** (`dishCreature.js:413`, "counted in frames")                                                         | `liveResolve.mjs:755`, `:1870`                                                                                         | no cost tier found in the file; not wrapped by the epic by design                                                                                                                            | yes (frame-counted; state snapshotted `liveResolve.mjs:1988`)                                      |
| **Assembled creature**                                                                                 | `engine/creatureRig.js` (`poseRig` `:217`, `LOIS_GAITS` `:197`), assembler `creatureAssembler.js`                                  | body + one instance per bone                                                               | x/y/rot of each part (rigid cut-out, forward kinematics)                                  | `kinemeTime` passed as `t` (`sceneContract.js:718`)                                                                           | contract time: `expandCreatureInstances` `creatureRig.js:507`, called `sceneContract.js:704-742` — every render path   | `frozen` → rest pose, `collapsed` → body alone (`sceneContract.js:719-720`); no cost tier of its own                                                                                         | yes — "pure, deterministic" (`creatureRig.js` header)                                              |
| **Beast**                                                                                              | `engine/beastRig.js` (`poseLinkage` `:95`), `beastRoam.js` (`roamAt`), `beastBuilder.js`, `beastTile.js`, trace `beastTrace.js`    | linkage bones (Jansen) + the body's travelling home                                        | x/y/rot per part; body x/y/heading                                                        | `kinemeTime` → crank phase = integral of crank rate (`beastRoam.js:9`, `creatureRig.js:421-423`)                              | contract time via `expandBeast` `creatureRig.js:415` (same seam as above)                                              | same `frozen` flag → `t = 0` (`creatureRig.js:421-423`)                                                                                                                                      | yes                                                                                                |
| **Posture**                                                                                            | `engine/creaturePose.js`                                                                                                           | a creature's pose from the room's band                                                     | x/y/rot/scale (pose), a slow sway                                                         | **frame index** (`creaturePose.js:15`)                                                                                        | inside the moth and dish builders (`creature.js`, `dishCreature.js`)                                                   | none found                                                                                                                                                                                   | yes — pure of (band, stress, frame)                                                                |
| **PATTERN-track kinemes** (not on the issue's list)                                                    | `pattern/elements.js:3-19`                                                                                                         | tiles inside one texture                                                                   | the five library kinds, on the CPU                                                        | `layer.pattern.t` (`sceneContract.js:622`; origin of `rl.t` not traced)                                                       | CPU raster (`renderer.mjs:1646`)                                                                                       | with the pattern                                                                                                                                                                             | yes (`elements.js:12`)                                                                             |
| **`beastMotion.js`** (stub)                                                                            | `engine/beastMotion.js` (69 lines)                                                                                                 | nothing: no importer; `bodySpeedFromStance` returns `0.4 * scale` as a placeholder         | —                                                                                         | —                                                                                                                             | **not called** (grep: zero importers)                                                                                  | —                                                                                                                                                                                            | —                                                                                                  |

Movers that exist but are not time-sources in this sense (listed so none is a surprise): surge and parallax drift
(`engine/surge.js`, `engine/parallaxDrift.js`, applied `buildPlacements.js:668-690`); the diorama camera (`gl/parallax.mjs`,
`liveLoop.mjs:1127`); the distortion channel (`gl/itemDistort.mjs`); velocity smear and impact deform in `QUAD_VS`.

## The questions

### 1. How many distinct time bases, and how does each derive from loop time?

Six that move marks, plus one that does not:

1. **Loop time** (`loopTimeMs`), the root; stops on pause/hold.
2. **`kinemeTime`**, an anchored clock over loop seconds at rate `kinemeRate` × the `kinemeRate` audio route
   (`liveLoop.mjs:1074-1077`, `applyKinemeRateAudio` `kinemeRateAudio.mjs:32`). Feeds the GPU kinemes, region and cell
   kinemes, the assembled creature's gait, and the beast's crank and roam.
3. **`driverSec`**, a **second** anchored clock over the same loop seconds at rate `kinemeRate` **only**
   (`liveResolve.mjs:778`, `driverTimeSec` `kineme.js:309`). Feeds the CPU drivers, the rhythm field, and the moth's hover.
4. **Resolver-frame counters**: the moth's growth (`creature.js:46`), the dish creature (`dishCreature.js:413`), the posture
   flourish (`creaturePose.js:15`). One tick per resolver frame, snapshotted for takes.
5. **The travel integrator**: per-frame deltas (`liveResolve.mjs:824`), accumulated state.
6. **Boil step**: loop second snapped to 6–12 fps (`kineme.js:246-254`). In the live context it is built as `0`
   (`liveResolve.mjs:265`) and I found no setter; its only reader is the brush-wobble driver (question 4).

Not a mover's clock as far as I could find: the **musical clock** (`composition/clockLive.js:22`, `observeClock` at
`App.jsx:134`). The beat reaches the drivers through `beatDrive` (the THUMP pattern) instead.

**Finding:** clocks 2 and 3 can diverge. `kinemeTime` gets the audio route on the rate (`liveLoop.mjs:1076`);
`driverSec` does not (`liveResolve.mjs:778`). With the `kinemeRate` route assigned and non-zero, GPU kinemes and the
CPU drivers run at different rates. I did not run it.

### 2. Does a creature or beast part receive its asset's kineme and its region kinemes today?

**Yes by asset; no for the layer ROTATE spin.** Call chain:

- `expandCreatureInstances` runs inside `buildSceneContract` and rewrites `instances` (`sceneContract.js:704-742`),
  _before_ the kineme table is built.
- The kineme loop then walks **every** instance, parts included, and looks up `getKineme(map[inst.asset])` by the part's
  dealt asset (`sceneContract.js:762-777`), phase from `kinemePhase(inst.seedOffset, inst.key)`; each part has a unique key
  `` `${it.key}#${p.id}` `` (`creatureRig.js:382`) and keeps `seedOffset` (`...it`, `:379`).
- The region loop does the same by asset (`regionsForAsset(inst.asset, …)`, `sceneContract.js:~782-826`).
- The layer ROTATE spin does **not** reach parts: `spinning` is keyed by instance **object** (`sceneContract.js:544`,
  `:696`) and a part is a spread copy (`creatureRig.js:379`), so `spinning.get(part)` is empty; the body is the same
  object (`out.push(it)`, `:596`) and keeps it.

**Proof**, a throwaway probe (`/tmp`, not in the repo) on the real contract, using the `creatureRig.selfcheck.mjs` setup
(a blob creature with a head, two limbs and a knee, five stage assets):

```
no assetKineme      | body.kineme undefined | parts geo_tri_02:- line_squiggle_03:- geo_tri_02:- line_squiggle_03:- org_petal_01:- org_petal_01:-
assetKineme=stage   | body.kineme undefined | parts geo_tri_02:1 line_squiggle_03:1 geo_tri_02:1 line_squiggle_03:1 org_petal_01:1 org_petal_01:1
assetKineme+body    | body.kineme 2         | parts … :1 (same)
ROTATE spin 0.5     | body.kineme 1         | parts … :- (none)
regionAnim.assets: line_squiggle_03,flora_flower_01 | part assets: geo_tri_02,line_squiggle_03,org_petal_01
```

So: setting `assetKineme` for a part's dealt asset gives the part its slot; `line_squiggle_03` is both a dealt part
asset and a region-animated asset, so a part takes region kinemes; ROTATE spin reaches the body and **not** the parts.
Caveats: the probe used a rig creature, not a beast. A beast expands in the same function before the same loop
(`creatureRig.js:567`) but I did not probe it. Nothing in the repo's selfchecks pins any of this
(`creatureRig.selfcheck.mjs` only varies `kinemeTime`).

### 3. Is there a CPU reference of the `QUAD_VS` kineme kinds?

**No.** The math lives in GLSL only (`shaders.mjs:160-172`). It is measured by a real-WebGL2 browser selfcheck
(`gl/kineme.selfcheck.mjs` header, lines 7-9), and GL stills use the same shader. The only CPU evaluation of the vocabulary
is the PATTERN-track one (`pattern/elements.js:3-19`), a separate implementation with its own amplitudes (for example
`BOB_TILES`, `elements.js:24`), not a mirror.

### 4. `dWobble` "computed but … left unapplied": still true?

**Yes.** It is computed at `kineme.js:519`; the doc comments at `:438` and `:667` still say no consumer. A grep for
`dWobble` across `src` finds no reader outside `kineme.js` and two comments (`liveResolve.mjs:244`,
`curator/censusReport.mjs:469`). Also, the live context builds `boilStep: 0` (`liveResolve.mjs:265`) and I found no setter,
so even if applied, the brush-wobble driver would hold boil frame 0.

### 5. Which are LIVE?

By call chain from the running instrument:

| Source                            | Verdict                                                  | Chain                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GPU kineme                        | **LIVE**, sparse by default                              | `liveLoop.mjs:1073-1077` → contract → `renderer.mjs:1318` → `QUAD_VS`. Default assignments are six `mic_*` ornaments only (`kinemes.js:78`); the rest need `setAssetKineme` (`state/slices/globalSlice.js:1251`). I did not check the UI row                                                                       |
| CPU drivers                       | **LIVE, on by default**                                  | `liveResolve.mjs:1170` → `buildPlacements.js:605`; defaults breath 0.3, drift 0.5, palette-breath 0.12 (`layout-modes.js:219-222`)                                                                                                                                                                                 |
| Patterns                          | **LIVE**                                                 | same chain; default `DRIFT` (`layout-modes.js:223`)                                                                                                                                                                                                                                                                |
| Transport                         | **wired, off by default**                                | `transport: 'still'` (`layout-modes.js:232`); on only when the performer or a voice sets it                                                                                                                                                                                                                        |
| Region / cell kinemes             | **LIVE** where an asset has a region or strip assignment | `sceneContract.js:782-826`, `renderer.mjs:705`, `:854`                                                                                                                                                                                                                                                             |
| Moth                              | **LIVE** (a mark on a pin)                               | `liveResolve.mjs:754`, `:1836`                                                                                                                                                                                                                                                                                     |
| Dish creature                     | **LIVE** (gated by `dishAllowed`)                        | `liveResolve.mjs:755`, `:1870`                                                                                                                                                                                                                                                                                     |
| Assembled creature                | **LIVE**                                                 | `sceneContract.js:704` (every render path)                                                                                                                                                                                                                                                                         |
| Beast (rig + roam)                | **LIVE**                                                 | `creatureRig.js:415` via the contract                                                                                                                                                                                                                                                                              |
| `beastBuilder.createBeastBuilder` | **NOT LIVE**                                             | defined `beastBuilder.js:198`; no caller. Only `sanitizeMeasures` and constants are imported (`beastRig.js:19`, `beastTile.js:10`, `components/cultivate.model.mjs:40`). The header's "the builder counts every resolver frame" is not how the live beast is posed: it is posed at contract time from `kinemeTime` |
| `beastMotion.js`                  | **NOT LIVE** (dead stub; #2111)                          | zero importers                                                                                                                                                                                                                                                                                                     |
| Posture                           | **LIVE** through the moth and dish builders              | `creature.js`, `dishCreature.js` import it                                                                                                                                                                                                                                                                         |

## Overlaps and gaps

Four vocabularies is right, but the seams matter more than the count. **Overlaps:** two anchored clocks (`kinemeTime`,
`driverSec`) over the same loop time that differ only by the audio rate route; the same five kinds implemented twice (GLSL
and `pattern/elements.js`); rig parts reach kinemes by asset id, so a part's motion depends on which stage asset Davis
dealt it. **Gaps:** no CPU reference for the GLSL kinds, so stills, tests and any future Motion Core adapter have nothing to
compare against; parts take asset and region kinemes but not the layer ROTATE spin, and nothing tests either; the boil
clock is built at 0 and the wobble driver it serves is unapplied; instance kinemes have no shed rung; the dish creature and
the rig have no registry cost tier; the beast's frame-counted builder is dead code while the live beast is analytic in
`kinemeTime`. The moth's hover reads `driverSec` while the rig reads `kinemeTime`, so a moth and a rig creature in one
scene sit on different clocks.

## Not established

- Nothing was run on a canvas; the probe above is the only executed code.
- The clock-divergence finding (question 1) is from reading both call sites, not from running with the route assigned.
- Beast parts were not probed (question 2).
- The origin of `rl.t` for PATTERN tracks was not traced.
- Whether the per-asset kineme assignment has a performer-reachable UI row was not checked.
