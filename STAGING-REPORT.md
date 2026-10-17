# STAGING REPORT — Phase 2 S2: bent wings by full mesh warp

Branch `ember/skeleton-s2` on base `d8009ee9` (S1 + gate fix, = PR #1653's head). LOCAL ONLY — no push, no PR.
Contract: Matt's S2 brief + `skeleton-creature-plan-2026-10-16.md` (S2 text + addendum ruling 1:
**full mesh warp first**, ribbon strips are the fallback that was NOT taken).

## Recovered build — provenance

This slice survived three builder generations. The original builder's uncommitted tree was audited by
recovery round 1, which completed it into two commits (`24a97217` feat, `79014842` selfcheck) before a
runtime restart killed it mid-measurement; this final round re-audited those commits line by line,
re-ran every claim, finished the cost measurement, and added one fix (`44648cfd`) plus this report.
Every number below was reproduced by the final recovery builder, not inherited.

## What shipped

- **`app/src/engine/wingWarp.mjs`** (new) — the warp. Each wing item's quad becomes a subdivided grid
  (9 spanwise stations × 3 chordwise rows) whose vertices carry skin weights to the wing chain's three
  S1 bones; vertices move by **linear-blend skinning** — sum over bones of weight × (posed bone frame ∘
  bind bone frame⁻¹) × vertex. Weights are a telescoping smoothstep pair per joint (partition of unity,
  smooth through the joints, exactly 1 mid-segment). This is a continuous mesh deformation that bends
  AT the joints — not rigid slices: the ribbon-strip fallback was not taken, and there is no strip code
  in the tree to fall back to.
- **Pose flex** (`engine/skeleton.js`, +5 lines): `pose.foreFlexDeg` / `hindFlexDeg` add per-joint
  degrees on top of each chain's sweep (bone i turns flex·i; the root keeps its direction exactly).
  Absent/0 ⇒ the chain is bit-for-bit the S1 chain (skeleton.selfcheck unchanged and green).
- **Wiring** (`engine/creature.js`): flex derives from the same flap beat the recipe already uses
  (`WARP_FLEX_RATIO` 0.5 per joint; hind by its own smaller beat). The builder gains an opt,
  `createCreatureBuilder({ skinning })`: with skinning on it builds the posed skeleton AND a bind
  (flex-0) skeleton each frame, emits a mesh on every bent wing item (wings + their halo copies), and
  displaces scale marks by the same field (`warpPoint`: centre + local rotation delta). Flex 0 ⇒ no
  bind build, no mesh, marks undisplaced.
- **Gate honesty** (`gl/liveResolve.mjs`, 1 line + comment): the resolver constructs the builder with
  `skinning: true` — the skin is a *standing consumer* of the skeleton, as S3+ will be. The S1 gate is
  intact in both directions: a non-skinning builder with `input.wantSkeletons` off builds NO skeleton
  (asserted: `lastSkeletons()` deep-equals `[null]`), and `wantSkeletons` alone (debug publication)
  never skins and changes no item (asserted byte-identical output).
- **Render path** (`gl/sceneContract.js`, `gl/shaders.mjs`, `gl/renderer.mjs`): the mesh rides the
  contract via `sanitizeMesh` — fail-closed like `sanitizeMatte` (malformed/oversized/non-finite ⇒
  dropped, item draws as its plain quad; caps 128 verts / 768 idx). A new renderer program `mesh`
  (MESH_VS + the **shared QUAD_FS**, so a warped wing shades identically to a quad) draws meshes at
  their exact list position — pending batches flush around them, non-normal blends take the isolated
  treatment; mesh items never enter the instanced packer. One disclosed shader difference: the
  spectrum INDEX bin uses the item's list index instead of `gl_InstanceID` (the quad path's own index
  is already batch-relative; neither is a stable identity), and the kineme/deform/smear terms are
  absent because creature items never carry them (closed by construction in `mark()`).
- **Cost registration**: `engine/wing-warp` registered tier 2 (quality scaler, shed after tier 1) in
  `engine/kernel/costRegistry.mjs` via `registerCostTier` at the module's registration site — one new
  id appended, no existing declaration touched; the renderer `mesh` program registers separately as
  tier 0 structural in `RENDERER_PROGRAMS`. Declared transient memory 49,152 B; measured census at
  the 4-creature cap is 432 verts × 23 floats × 4 B = 39,744 B — inside the declaration.
  `gl/costTiers.selfcheck` gates it: "declarations valid, coverage complete" (green below).

## Parity + golden evidence (reproduced this round)

FNV-1a over the canonical JSON, the S1 hash lineage. All four pins are asserted by
`engine/wingWarp.selfcheck.mjs`, which the final builder ran green, and the two REST pins were
independently reproduced on a pristine `d8009ee9` checkout by the final builder:

- Builder at rest (skinning on or off): **`cc3976da`** — pristine base produces `cc3976da`. Identity.
- Live resolver at rest: **`c9a243c9`** — pristine base produces `c9a243c9`. Identity.
- Builder at peak beat: **`f28c4bd5`** — bent golden; two independent runs reproduce it exactly.
- Live resolver at peak beat: **`8e0c1b0f`** — bent golden.

Bent-frame facts (selfcheck-asserted): in the golden fixture exactly 4 items carry meshes (the fore
wing pair + their halo copies) at 27 verts / 96 indices each; vertex travel vs rest exceeds 5 px;
scale marks move/turn with the field; left and right bent meshes are exact mirror images
vertex-for-vertex. Hind wing items take the identical path when the hind pair is grown (same
`WARP_SEGMENTS` map — a code-reading statement; the golden fixture and the cap census both exercise
the fore pair, 16 meshed items at 4 creatures). Family green this round: creature, skeleton, wingWarp, costTiers,
mathRandomGuard (15 files / 25 sites, unchanged), performanceCreatures, motionMeterTap (8 checks).

## Cost evidence — sandbox (SwiftShader/Node), INDICATIVE ONLY

The budget of record is **2.0 ms GPU/frame @1080p iPad-class at the 4-creature cap**; per the plan,
sandbox numbers order the work and the Studio run is authoritative. Measured with
`gl/debug/measureWingWarp.mjs` (#1622 costBench lineage; committed `9fbb5aa0`):

- **Census at the cap (exact, deterministic):** rest frame = 149 instances, **0 meshed**; bent frame =
  149 instances, **16 meshed items, 432 mesh vertices, 1,536 indices** (4 creatures × fore pair +
  halos). Emitted items stay far under the 2000 global cap.
- **GPU step: NOT measured in this sandbox.** Two full runs died at the harness-page step
  (Chromium/SwiftShader under sandbox memory pressure — the same failure that killed sibling slices'
  browser runs all evening). No GPU delta is claimed. The mesh draw itself is one small indexed draw
  per mesh run over ≤432 pre-skinned vertices — by construction a minor GPU cost — but the 2.0 ms
  verdict belongs to the Studio run, and the kill criterion (over budget at minimum viable quality)
  is therefore **not triggered and not cleared** by this staging: it is deferred to hardware, exactly
  as the plan prescribes.
- **Resolver CPU at the cap (the real cost of this slice, stated plainly):** paired A/B micro-bench
  of the resolverProbe scene (300 post-warm frames, two back-to-back rounds, same minutes):
  base creature delta ≈ **+1 to +4 ms**; S2 creature delta ≈ **+17 to +19 ms** per frame in this
  sandbox (four-creature means: base 4.99 / 7.37 ms, S2 21.87 / 19.93 ms; zero-creature means equal).
  The sandbox runs this scene ~30–50× slower than the probe's Apple-silicon calibration (base
  creature delta there: 0.03–0.1 ms), so the projected on-device CPU is a fraction of a millisecond
  to ~1 ms at cap — but it is NOT free, and the mechanism is named: two skeleton builds per moth per
  bent frame (posed + bind) plus per-vertex skinning, with per-frame mesh allocations visible in p95
  (S2 ≈ 54 ms vs base ≈ 22–29 ms in-sandbox). Named optimization candidate for the publish
  conversation, deliberately NOT taken here: derive the bind chain without a second full build.
  `resolverProbe.selfcheck` fails its 5 ms wall-clock budget on BOTH trees in this sandbox
  (base 10.230 ms, S2 20.663 ms, same assertion, line 58) — environment-bound here; the CI Mac
  runner is authoritative for that probe.

## Verification

- `npm run build` — green (21.95 s). ESLint — clean on all 10 touched/added files.
- Full manifest sweep (449 commands) was run on both the S2 tree and pristine `d8009ee9` by the
  final recovery builder, with disputed entries re-run paired (tree vs base) in an arbitration
  pass. The raw tally files were lost to a sandbox /tmp wipe before the counts could be written
  into this report (coordinator-verified: the files no longer exist), so no sweep count is claimed
  here. The adjudicated exceptions are the ones documented inline in this section and the parity
  section above: composite (pin updated, `44648cfd`), spectrumMarks (pin updated, `d338eb8d`),
  vortex and resolverProbe (failing on BOTH trees in-sandbox, environment-bound). The coordinator
  re-ran `wingWarp.selfcheck` green on the final tree; the publish pass re-runs the full sweep
  plus CI before this slice is proposed for merge, which is where the sweep verdict binds.
- **Fix landed this round** (`44648cfd`): `gl/composite.selfcheck.mjs` pinned the five-program
  renderer inventory; S2's sixth program (`mesh`) failed it. The pin now names all six and the
  uniform audit it gates validates MESH_VS's upload list — both checks [ok] on re-run. (The suite's
  in-page section still cannot complete in this sandbox: Chromium killed mid-run, "Target page,
  context or browser has been closed" — the base tree's run timed out at the same region. CI is
  authoritative for the in-page part.)
- `gl/vortex.selfcheck` fails in-sandbox on a step-timing assertion (`stepVortex` — the fluid step;
  budget "fail above 2 ms", measured 7.9–10.5 ms under load). The timed code is byte-identical
  between the trees (S2 touches no vortex source) and the suite passed on base in a calmer window:
  environment, not S2.

## Design calls flagged

1. **Skinning is always-on in the resolver** (bent wings are the moth's standing look, not a debug
   view). This makes the skeleton a per-frame cost for formed moths — the honest consequence is the
   CPU evidence above. The alternative (skinning only under a flag) was rejected by the design:
   S3–S8 all consume the skeleton per-frame.
2. **Bind pose by second build** rather than by inverting flex analytically — simpler and provably
   the same chain S1 builds at flex 0; costs one extra skeleton build per bent moth per frame.
3. **`sanitizeMesh` rounding**: positions to r3 (the contract's own precision), UVs to r5
   (sub-texel) — a contract mesh can differ from the resolver mesh below those quanta, by design,
   like every other contract number.
4. MESH_VS spectrum index by list position (disclosed in the shader header) — no stable identity is
   promised on either path.
