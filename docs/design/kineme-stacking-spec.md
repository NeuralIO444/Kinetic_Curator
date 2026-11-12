# Kineme stacking — a compound kineme of two kinds on one mark (#2117, Motion Core P5)

Status: **spec**. Step 1 of #2117. Matt's ruling on the issue: a mark plays exactly **two** kinemes at once. This spec is for a
stack of exactly two; a stack of one is today's behaviour byte for byte; three is not ordered and is not designed here.
Where the issue says "stop for Matt's ruling", Matt's "spec and build" order is the go-ahead: the build follows on the
options marked **Recommend** below, and every one of them is cheap to change before the build merges.

Sources read at `d837323`: `data/kinemes.js`, `gl/sceneContract.js` (kinemeFields), `gl/shaders.mjs` (QUAD_VS kineme block, smear),
`gl/renderer.mjs` (`INSTANCE_STRIDE`, `packInstanceData`, `expandRegionInstances`), `engine/motionCore/{index,kinemeSources}.js`,
`data/cellKinemes.js`, `engine/kineme.js`.

## 0. What a mark plays today

One instance carries one **slot** (`inst.kineme`, 1-based, 0 = still → instance float 18, `a_inst4.z`) and one **phase**
(`inst.kinemePhase` → float 19, `a_inst4.w`). The slot indexes one shared table (`u_kineme[16]`, entries `(kind, period, amp)`).
QUAD_VS evaluates one kind per instance and writes one of four accumulators: `kDeg` (spin, osc), `c` (pulse), `kVis` (blink),
`kOff` (bob, scatter). Stacking means two kinds write those same accumulators in one pass.

## 1. Record shape and how it is referred to

**A stack is a library entry with its own id, in the same id namespace as the single kinemes.**

```js
// data/kinemes.js — a second frozen list, beside KINEMES
export const KINEME_STACKS = Object.freeze([
  { id: "rock+bob", stack: ["rock", "bob"] },
  // …the starter set, §6
]);
```

- `getKineme(id)` resolves a stack id to `{ id, kind: 'stack', stack: [a, b] }` (members resolved to their library records).
  `KINEMES` itself is **not** changed, so nothing that hashes or lists the single library moves (the Canon motion pin hashes
  the library; a separate `KINEME_STACKS` list needs its own Canon descriptor, as scatter did in #2143).
- `assetKineme` and the region maps keep their shape: `{ mic_arrow: 'rock+bob' }`. The value is a string id, exactly as now.
  **An old document loads unchanged** because it only ever holds single ids; a new document that names a stack id loads in an
  old build as an unknown id, which `sanitizeAssetKineme` already drops (the mark is then still — the same degrade as any
  unknown id).
- **Sanitizer** (`sanitizeAssetKineme`): accept a stack id iff it is in `KINEME_STACKS`. Stack **members** are validated when the
  list is built (a selfcheck, not runtime): two distinct ids, both in `KINEMES`, neither `regionOnly` (no scatter in a stack:
  it needs a region's centroid direction) and neither `bend` (its id is a region signal). Ids are explicit library entries, not
  a parsed `a+b` string, so `bob+rock`, `rock+rock` and `rock+scatter` are unknown ids, not errors.
- **A stack of one is the single id.** There is no one-element stack record; `'rock'` stays `'rock'`. So "a stack of one equals
  today byte for byte" holds by construction, and the selfcheck proves it on the contract and on the packed buffer.

## 2. Composition order

Scale, then rotate, then translate — the order QUAD_VS already runs for one kineme, and `composePose` (Motion Core) for two.

| Stage       | QUAD_VS today                    | Stack of two                       | `composePose`              |
| ----------- | -------------------------------- | ---------------------------------- | -------------------------- |
| 1 scale     | pulse: `c *= 1 + amp·wav`        | both pulse terms multiply onto `c` | `sx = p.sx · q.sx` (same)  |
| 2 rotate    | `th = radians(a_inst1.x + kDeg)` | `kDeg` = sum of both rotations     | `dRot = p.dRot + q.dRot`   |
| 3 translate | `world = a_inst0.xy + rr + kOff` | `kOff` = sum of both offsets       | `dx/dy` add                |
| visibility  | `v_opacity = a_inst1.y · kVis`   | `kVis` = product of both           | `dAlpha` add (hidden = −1) |

Scale-then-rotate-then-translate is a fixed pipeline, so the **order of the two entries does not matter**: every accumulator
combines by a commutative operation (add, or multiply). `rock+bob` and `bob+rock` are the same motion. (The only difference
is float: `(c·sa)·sb` in the shader against `c·(sa·sb)` for `composePose` can differ by one ulp — the CPU reference mirrors the
shader's order and the selfcheck compares with a one-ulp tolerance, never a looser one.)

## 3. Phase

**Recommend: one phase per mark** — the existing `kinemePhase(seedOffset, key)`, read by both entries.
Reasons: it keeps the "copies of one asset never move in lockstep" property, needs no second hash, costs no bytes, and the two
entries still differ because they have **different periods** (the starter compounds are chosen so the periods are not
commensurate: rock 2.4 s against bob 3.0 s drifts through a 12 s pattern). One phase per stack entry would buy independent
offsets at the price of a second per-instance float (§4) for a variation the periods already give.

Anchor law, stated honestly (as `kinemeSources.js` already does): a **phased** mark starts part-way through its cycle by design,
so a compound is exactly rest at motion time 0 only for a phase-0 node — the same probe (`anchorNodes`) the single sources use.
With motion off (reduced motion, freeze rung) the table does not ride on the contract and the mark sits at rest, stack or not.

## 4. GPU cost — two options, one recommended

**Recommend B: a second table, no new per-instance data.**

- **A. A second slot + phase per instance.** Two new floats (`kinemeB`, `kinemePhaseB`) at byte 204 → `INSTANCE_STRIDE` 51 → 53,
  one new vertex attribute (location 16, `vec2`), `packInstanceData` and `expandRegionInstances` copy two more fields, and the
  stride pins in `itemDistort` and `glassBevel` selfchecks move (as in #2143). Cost: +8 bytes × every instance, on every
  scene, to serve marks that mostly do not stack.
- **B. A compound table entry.** The table gains a parallel array `u_kinemeB[16]` (`vec3`, same `(kind, period, amp)` layout; a
  zero kind = no second entry). A single kineme's slot has `u_kinemeB = (0,0,0)`. A stack takes **one** slot whose A half is
  its first member and B half its second; the instance still carries one slot and one phase. **No instance-buffer change:
  stride stays 51, `packInstanceData` and `expandRegionInstances` are untouched, no pin moves.** The cost is 16 more uniform
  `vec3` (16 vectors of the vertex uniform budget — WebGL2 guarantees 256; the build checks what QUAD_VS already uses) and
  one extra branch in the vertex shader, **gated on `kindB > 0`**, so every instance that is still or single-kineme never
  enters it (the same discipline as the `a_inst4.z > 0.5` gate).

B is smaller, leaves the stride (and every scene's buffer) alone, and keeps "goldens identical for scenes with no compound" true
trivially: with no stack the contract carries no `kinemeB`, the uniform is not uploaded, and the shader branch never runs.

**Table pressure.** A stack takes one of the 16 slots (not two), and two marks with the same stack share it. A compound over the
16-slot cap is dropped to rest exactly like an over-cap single kineme today (`continue` — `ponytail` comment already in place).

**Cost tier and shedding.** The per-frame work is shader ALU on instances that stack plus one 16×vec3 uniform upload only while
a stack exists. It registers `motionCore/kineme-stack` (tier 0, shader-only, like the rig adapter's tier) in
`engine/kernel/costRegistry.mjs`. It sheds with the **existing** ladder and no new rung: reduced motion and the freeze rung already
stop the kineme time and drop the table off the contract, which takes both halves with it; there is no separate B-only shed
(shedding half of a compound would change its character, not its cost).

## 5. Interaction with the neighbours

- **Layer ROTATE spin.** "An asset with its own kineme keeps it; every other mark takes the layer's ROTATE spin." A stack is an
  own kineme, so a stacked mark does **not** also take the layer spin — the stack replaces it rather than adding a third motion
  (three is not ordered). To keep a turn _and_ something else, use a stack that contains `spin` (`pulse+spin`, `spin+bob`).
  Unchanged: a mark with no own kineme takes the spin with phase 0.
- **Region kinemes.** A region that has its own assigned kineme still takes its own slot (as today, `expandRegionInstances`:
  `slot > 0 ? slot : it.kineme`). A region with none inherits the mark's slot — which may be the stack — and the mark's phase.
  **v1 does not allow a stack as a region assignment** (`regionKinemes` keeps single ids); a stacked region is a follow-up if Matt
  wants one. `scatter` (region-only, #2116) is excluded from stacks (§1) and so cannot meet a stack.
- **Cell kinemes** (`CELL_KINEMES`, a baked UV strip). They move the UV window, not the quad, on an independent channel with
  their own cost class; they compose with a stack freely (a spec-bar can pulse+spin while its bars chase) and are untouched.
- **CPU drivers** (`engine/kineme.js` breath / drift / pulse). They act on placements on the CPU **before** the pack, in scene
  units, additive to position and scale; the stack acts afterwards in the shader on the packed instance. They never read the
  slot, so neither knows about the other and nothing changes.
- **Transport stretch** (the #309 velocity smear). In the shader the smear acts on `rr` after the scale and rotation and before
  `kOff` is added, so a stacked mark's stretch follows its composed (scaled, rotated) shape and the stack's translation is then
  added on top, exactly as for one bob. No change to the smear code; the stack's `c` and `kDeg` are inputs to it as today.

## 6. Starter set — proposals for Matt

Four compounds, each pairing two **different** accumulators so neither half hides the other, with incommensurate periods:

| Id            | Members      | Reads as                                 | Periods (s) |
| ------------- | ------------ | ---------------------------------------- | ----------- |
| `rock+bob`    | rock, bob    | a buoy: sways while it rides up and down | 2.4 / 3.0   |
| `pulse+spin`  | pulse, spin  | a beacon: breathes while it turns        | 1.6 / 4.0   |
| `pulse+blink` | pulse, blink | an indicator: swells and flickers        | 1.6 / 1.0   |
| `spin+bob`    | spin, bob    | a slow orbiter: turns while it floats    | 4.0 / 3.0   |

Not proposed: two kinemes that write the **same** accumulator (`rock+spin`, both rotation: they sum into one muddy turn) —
legal under the sanitizer, but the starter set keeps to the clear pairings. These are proposals: ids, members and the count are
Matt's call, and each is one line in `KINEME_STACKS`.

## 7. Build plan (step 2, a separate PR with `Closes #2117`)

1. `data/kinemes.js`: `KINEME_STACKS`, `getKineme` resolves a stack, `sanitizeAssetKineme` accepts a stack id; Canon motion
   descriptor for the stack list.
2. `gl/sceneContract.js`: a stack takes one slot; the contract carries `kinemeB` (parallel table) **only when a stack exists**.
3. `gl/shaders.mjs` + `gl/renderer.mjs`: `u_kinemeB[16]`, the gated second-entry branch, one uniform upload.
4. `engine/motionCore/kinemeSources.js`: sources `kineme:<a>+<b>` = the two members through `composePose`; `anchorNodes` probe.
5. Cost tier `motionCore/kineme-stack`.

Selfchecks (one new suite, one manifest line): a stack of one equals the single kineme byte for byte (contract and packed
buffer); rest at t = 0 (phase-0 node, anchor probe); document round-trip (`assetKineme` with a stack id survives save/load; an
old doc is unchanged; an unknown stack id is dropped); shed behaviour (over the 16-slot cap, and motion off drops both
halves). **Acceptance:** every golden hash identical for every scene with no compound.

## 8. Open for Matt (none block the build)

- The four ids in §6 (and whether `pulse+blink` earns its place).
- Region assignments of a stack (§5) — left out of v1.
- A stack replaces the layer ROTATE spin on its mark (§5) — the alternative, a stacked mark also spinning, would be a third kineme.
