# Kineme break-up — regions that leave home and come back (Motion Core P4, #2116, step 1)

Status: **SPEC ONLY — nothing is built.** This stops for Matt's approval of the numbers (§9). Epic #2109; phase 0 (the motion
map, `motion-map.md`) is merged and phase 2a (#2113, the CPU reference) is merged, so step 2 is unblocked once this is approved.
Paths are under `app/src/`. Every claim below was re-read on `main` @ `312da5c`; none of it was run except the throwaway
float32 check in §8 (not committed).

## 0. Rulings this spec follows (Matt, 2026-11-11, on #2116)

- Build **scatter, assemble, orbit**, in that order: scatter, orbit, assemble. **Slip / shear was considered and is not
  ordered** — it is left out of the build list.
- **Assemble triggers:** a new Look landing (a KINETIC or CURATOR press), a Book chapter landing, an audio onset (a strong hit
  scatters the pieces; they reassemble on the next downbeat). A keep is not a trigger.
- **Audio limit:** at most one scatter per bar, only on high-strength onsets; the strength threshold is an exported constant;
  bars are counted from `clock:bar` and survive a clock restart.
- Trigger time comes from the loop / musical clock, never the wall clock. Reduced motion and the region-freeze rung hold rest.

## 1. What exists today (verified)

- A mark's sub-shapes are **regions**: records with a bbox (`x0,y0,x1,y1`, 0..1 of the 100-unit box) and an ink `area`
  (`data/regionKinemes.js`), at most `REGION_TAG_CAP = 12` per asset. Each assigned region takes one library kineme id
  (`regionAssignmentFor`).
- The contract resolves the assignment into `regionAnim.assets[asset][regionId] = slot` (`gl/sceneContract.js:784-831`; slot
  0 = assigned but over budget, so it renders merged at rest). Region slots share the **same 16-slot `u_kineme` table** as
  instance kinemes (`KINEME_TABLE_MAX = 16`, `data/kinemes.js:64`; the cap check is `sceneContract.js:761` and `:811`).
- At pack time `expandRegionInstances` (`gl/renderer.mjs:705`) turns a mark into a remainder instance plus **one ordinary
  instance per region**: the region's cell, placed on the region's pivot `geo.px/py` (the mark's affine applied, so the
  instance already sits at the region centroid), carrying `kineme` = slot and `kinemePhase` = `kinemePhase(asset, regionId)`
  (floats 18/19 of the 49-float stride).
- `QUAD_VS` evaluates a kineme from `a_inst4.zw` (`gl/shaders.mjs:160-171`): `ph = fract(u_kinemeTime / per + phase)`, and the
  kind switch (spin / osc / pulse / blink / bob) writes `kDeg`, `c` (scale), `kVis`, or `kOff` (a scene-units offset). **The
  shader has no idea where the mark's centre is.** That is the whole problem for scatter.
- Governor: `regionAnimBudget(doc)` is 0 under reduced motion and under the freeze rung (`regionKinemesFrozen`: `perfTier1`
  and `quality === 'performance'`), else the device budget (12 desktop / 8 iPad-class, `data/quality.js`). `regionCollapseShed`
  (freeze plus `assetThin | perfClamp | slowRender`) drops the regions entirely and the pack draws the single original quad.

## 2. The three kinds

Notation: `B` = the mark's box side in scene units, `100 · max(scaleX, scaleY)` of the mark. `phase` = `regionKinemePhase(asset,
regionId)` ∈ {0, 0.001 … 0.999} (`kinemePhase` returns `(h % 1000) / 1000`). `t` = `u_kinemeTime`. `per` and `amp` are the
kineme's table fields. All three are **translates**: they write `kOff`, the existing offset the bob already uses.

**Direction `d`** (for scatter / assemble): the unit vector from the mark's centre to the region's pivot, in the mark's own
frame, rotated by the mark's rotation, y-down, computed at pack time from `geo.px/py` — the region's ink centroid, rounded to the 200-grid
(`assets/regionPartition.js:169`), not its bbox centre. If the pivot is within 1 unit of (50, 50) the direction is undefined, so use the hashed angle
`2π · phase`.

### 2.1 scatter — periodic, out and back

```
u   = fract(t / per − phase · R)          R = 0.4   (ripple spread)
e   = u < W ? 0.5 · (1 − cos(2π · u / W)) : 0     W = 0.6   (active window; the rest of the period is hold)
off = d · B · amp · e
```

- **Units:** `amp` is a fraction of the mark's box side. `amp = 0.18` ⇒ a piece peaks 18% of the mark's width from home.
- **Ripple:** each piece's cycle is delayed by `phase · R` of a period, so pieces leave in a ripple.
- **Anchor law:** with `W + R ≤ 1` every piece is in its hold window at `t = 0`, so `e` is exactly 0 for every phase (the
  delay form `−phase · R`, not the `+phase` the existing kinemes use, is what makes this hold; §8).
- **Peak** at `u = W/2`, `e = 1`.

### 2.2 orbit — periodic, a small circle through home

```
θ   = 2π · fract(t / per)
off = B · amp · Rot(2π · phase) · (cos θ − 1, sin θ)
```

- A circle of radius `B · amp` that **passes through home** (centre at distance `B · amp` from it), leaning at an angle set
  by the region's phase, so neighbouring pieces circle in different directions. At `t = 0`, `θ = 0` and the offset is
  `(0, 0)` exactly.
- Needs **no direction**, so it needs no per-instance packing. `amp = 0.06`.
- A negative `amp` turns it the other way (the spin kineme's convention, `kinemes.js` `spinKineme`).

### 2.3 assemble — one-shot, triggered

Two timestamps on the kineme clock ride in one uniform, `u_break = (tOut, tIn)` (seconds; `−1e30` = never):

```
settle (tIn ≥ tOut):  e = 1 − ease((t − tIn − phase · S · per) / per)      ease(x) = 1 − (1 − clamp(x,0,1))³ ; S = 0.5
scatter (tOut > tIn): e = ease((t − tOut) / K)                              K = 0.12 s  (the audio kick)
off = d · B · amp · e
```

- `per` is the **settle duration**; `amp = 0.30`; `per = 1.6 s`.
- Pieces decelerate into place (cubic ease-out), in a ripple of `S · per` across phases. Once `t − tIn ≥ (1 + S) · per`, `e` is
  exactly 0 and stays 0, so a settled scene is byte-identical to no break-up.
- **No trigger ever fired** (`tIn = tOut = −1e30`): `e = 0` at every `t`, rest.
- The audio path uses both: an onset sets `tOut` (pieces fly out in `K`), the next downbeat sets `tIn` (they settle in).
- Landing (Look or chapter) sets `tIn` only, but starts the pieces **displaced**: the picture is arriving. See §6 for the
  `t = 0` question this raises.

## 3. Cost, packing, table budget

- **No new instance.** Region instances already exist; break-up changes a translate on them. A scatter / assemble region costs
  exactly what a bob region costs (one `sin` or `cos` and a few multiplies, gated on the slot).
- **Table:** three more library entries (`scatter`, `orbit`, `assemble`) take **at most 3 of the 16 slots**, and only when a scene
  assigns them (the table is built per frame from what is used). Worst case today: the library's 6 + 3 = 9 distinct ids ≤ 16;
  the `KINEME_TABLE_MAX = 16` cap is enough, and its existing "over the cap → slot 0, region renders at rest" fallback is the
  behaviour at the limit. No texture table is needed.
- **Kinds:** `KINEME_KINDS` gains `scatter: 6, orbit: 7, assemble: 8`. The shader switch gains three branches inside the
  existing `a_inst4.z > 0.5` gate, so **a still instance never enters** — every existing scene stays bit-for-bit.
- **Cost tier:** the adapter's existing `motionCore/kineme-adapter` (tier 0, #2113) covers the new sources; the GPU work is a
  translate inside the quad pass and sheds with the existing region ladder (below).

### The question the issue asks: new `KINEME_KINDS` entry, or a per-instance centroid direction?

**Both.** The kind is a `KINEME_KINDS` entry evaluated in `QUAD_VS`, but the direction cannot be derived in the shader, so
scatter and assemble need it packed. **Orbit alone is shader-only.**

- **New attribute `a_brk` (vec2): the vector `d · B`** in scene units, appended at the tail of the instance record: float
  offsets 49–50, **`INSTANCE_STRIDE` 49 → 51**, `layout(location=15) in vec2 a_brk` at byte 196. This follows the repo's own
  append pattern (every earlier offset unchanged; compare #2010 P3's 45 → 49). All non-region instances and every other producer
  write 0.
- Shader: `kOff += a_brk * amp * e;` — `amp` stays the table's, `B` and `d` ride in the vector.
- **Why not reuse a spare channel:** the free-looking ones are taken (`a_inst2.zw` is the smear velocity, `a_def` the impact deform,
  `a_dist` the distortion record); `a_inst4.xy` is `v_accent`'s tail. A new 2-float tail is the least invasive.
- **Tests that pin the stride** (`gl/itemDistort.selfcheck.mjs:113`, `gl/glassBevel.selfcheck.mjs:70`) assert `INSTANCE_STRIDE ===
49`; step 2's first PR updates those two expectations in the same change (a deliberate pin, not a golden hash). The
  alternative that keeps the stride at 49 is to compute `d · B` in the shader from a mark-centre uniform, which cannot work for
  per-mark centres, so I rule it out.
- The VBO grows 4% per instance for every scene. If that is unwelcome, the fallback is packing `a_brk` only into region
  instances through a second, instanced-divisor-1 buffer that is empty for scenes with no break-up. I recommend the plain append.

## 4. Where the data comes from, and which assets

- Assignment stays `regionKinemes` (record default under the doc's override) — a region id maps to a kineme id, exactly as
  today. The three new ids are library entries (`data/kinemes.js`), so `sanitizeRegionKinemes` accepts them without change.
- **Whole-mark assignment of scatter / assemble would be inert** (`a_brk` is 0 on a non-region instance, so the offset is
  0). Recommend a `regionOnly: true` flag on those two records and `sanitizeAssetKineme` dropping them, so the UI cannot
  silently accept a no-op. Orbit needs no flag: it works on a whole mark.
- **No family-wide default** in the first PR (the issue's rule): assets are assigned only where Matt names them.

## 5. Freeze, collapse, reduced motion, a mark with no tagged regions

All of these fall out of the existing ladder with **no new code path**:

- **Reduced motion** and the **freeze rung** (`regionKinemesFrozen`): `regionAnimBudget` is 0, so every assigned region has slot
  0 and **inherits the mark's own kineme** (`expandRegionInstances`, the `slot > 0 ? slot : it.kineme` branch). Pieces sit at
  home, rest.
- **Collapse** (`regionCollapseShed`): `regionAnim.shed` is true and the pack takes the exact single-quad path; no region
  exists, so nothing can leave home.
- A **mark with no tagged regions** has no `regionAnim` entry and is not expanded: untouched. `a_brk` is 0 there.
- The trigger uniform `u_break` is sent **only when** a scene uses an `assemble` region **and** a trigger has fired, so every
  scene that does not use the new kinds has the contract it has today (hash and all).

## 6. The trigger: what starts it and how a take replays it

**The events already exist** — no new bus event, panel or surface:

| Trigger                       | Source decision                                                                                        | Records                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| New Look (KINETIC press)      | `kinetic:tap` (`KineticButton.jsx:120`)                                                                | a **settle**                        |
| New Look (CURATOR press)      | `layout:curate` (`CuratorBar.jsx:186`) and `layout:preset` (`:136`)                                    | a **settle**                        |
| Book chapter landing          | the chapter walk: `scopedChapterLook` bumps `state.kineticLanding.seq` (`state/slices/layoutSlice.js`) | a **settle**                        |
| Strong audio hit              | `audio:onset` `{ strength, band }` (`composition/audioLive.js`)                                        | a **scatter** (`tOut`), gated below |
| Next downbeat after a scatter | `clock:bar` `{ bar, bpm }`                                                                             | a **settle** (`tIn`)                |

Not a trigger: a keep.

**Coalescing.** A press can emit more than one of these (a KINETIC press can emit `kinetic:tap` and also deal a chapter landing). The recorder collapses
every landing within the same resolver frame to one settle.

**How the start time is recorded, so a take replays it.** The bus decisions carry no motion time, and `liveLoop.mjs` /
`liveResolve.mjs` are one-writer files. Proposal (recommended): a tiny stateful fold, `engine/motionCore/breakTrigger.js`, built
exactly like `createKinemeClock` (`data/kinemes.js`, with `snapshotState` / `restoreState`):

- Event handlers do not touch time: they bump a monotone **recorded input**, `breakSeq` (`{ out: n, in: m }` counters,
  plus the `bar` of the last scatter), in the store — the same kind of recorded decision as `kineticLanding.seq`.
- Where the contract is built, the fold is called with `(doc.breakSeq, doc.kinemeTime)`; the **first frame it sees a new counter
  value stamps `t0 = doc.kinemeTime`**. `u_break = (tOut, tIn)` is then the fold's output. Given the same recorded frames the
  fold gives the same stamps, so a take replays it; its state is snapshotted with the clock's.
- Stamps are therefore on the **kineme clock** (which already stops on pause and follows `kinemeRate`), never the wall clock.
  This is the one piece that needs the one-writer owner's eye: it reads a doc field the loop already builds.
- **The `t = 0` question (Matt's call, §9 #5):** a Look landing starts displaced, so on the first frame after the trigger the
  pieces are out. Stills and exports never carry `breakSeq`, so **a still is rest, byte-identical to today**. The anchor law
  ("motion time 0 = rest") holds for every scene with no trigger; a landing on the very first frame of a take is displaced by
  design.

**The audio limiter.**

```js
export const BREAK_ONSET_STRENGTH = 0.8; // proposal; Matt tunes by ear
```

- `audio:onset.strength` is `clamp01((flux − thr) / 0.2 + 0.25)` (`gl/audioEvents.mjs:135`): a hit exactly at threshold reads
  0.25, one 0.15 above it reads 1.0. A cutoff of 0.8 means "flux at least 0.11 over threshold": a clear hit, not every
  flicker. Marked as a number to tune.
- **At most one scatter per bar:** the limiter keeps the last scatter's `bar` (from `clock:bar`, which is 0-based and counts
  downbeats); an onset in the same bar is ignored. A **clock restart** resets `bar` to a smaller value, so the limiter treats
  `bar < lastScatterBar` as a new count (it does not wait for the old number to be reached again), and a restart also clears
  any pending scatter so pieces are not left out.
- A scatter with no following downbeat reassembles on the next `clock:bar` regardless; if the clock is not running (no
  `clock:bar`) the scatter holds for at most `2 · per` and settles on its own, so pieces are never stranded.

## 7. Selfcheck plan for step 2 (one kind per PR)

For each kind: the CPU reference (the #2113 adapter; the table is `kinemeSources.js`) gives the exact curve and a pinned
table of `(per, amp, phase, t) → offset`; rest at `t = 0` for **all 1000 phases**; reduced-motion, freeze and collapse hold
rest; a mark with no tagged regions is untouched; every existing golden is identical for scenes without the new kind; the stride
pins are updated once (scatter's PR). Live-canvas before / after captures in the PR.

## 8. What I measured

A throwaway float32 emulation (not committed) of §2's formulas, over all 1000 phases:

```
rest violations at t=0 (1000 phases): { scatter: 0, orbit: 0 }   scatter peak envelope max 1.0000
no trigger, t=0: 0   settled long after: 0   just after settle trigger: 1
```

I did not run the shader or the live canvas. The `+phase` convention the existing kinemes use does **not** give rest at `t = 0`
for phased instances (`sin(2π · phase) ≠ 0`); that is by design for a bob and wrong for a piece that must start home, which is
why scatter uses the delay form.

## 9. Numbers for Matt to approve (feel is his)

1. **scatter:** `per = 3.2 s`, `amp = 0.18` of the mark's box, `W = 0.6` (out-and-back takes 60% of the period), ripple `R = 0.4`.
2. **orbit:** `per = 4 s`, `amp = 0.06`; one sense by default, negative `amp` reverses.
3. **assemble:** `per = 1.6 s` settle, `amp = 0.30`, ripple `S = 0.5`, audio kick `K = 0.12 s`, cubic ease-out.
4. **`BREAK_ONSET_STRENGTH = 0.8`**, one scatter per bar.
5. **Does a landing start displaced on its first frame** (recommended: yes, stills never do), or fade the offset in?
6. **`regionOnly`** for scatter / assemble (recommended) versus an inert no-op on whole marks.
7. **Stride 49 → 51** (recommended) versus the second-buffer fallback.

Build order after approval: scatter, then orbit, then assemble. One kind per PR.
