# STAGING REPORT — Phase 2 S4: engraving shader

Branch `ember/skeleton-s4` on `d8009ee9` (S1 publish tip). LOCAL ONLY — no push, no PR.
Contract: Matt's S4 brief + `skeleton-creature-plan-2026-10-16.md` line 29 (body-space contour lines,
bending with the spine, `fwidth`-antialiased, soft multiply in the five-pass order) + the plan addendum.

> **Recovered build.** This staging completes a recovered build. Two previous S4 builders died in
> runtime restarts; their work survived uncommitted in this worktree and was audited file by file
> before anything was trusted. This file replaces the STAGING-REPORT.md found in the tree, which was
> S1's report (a leftover copy), not an S4 draft. Every claim below was re-run or re-read by the
> completing builder; where a recovered claim did not survive checking, the correction is recorded
> in the ledger and in §Corrections.

## Recovered-tree ledger — every file in the footprint, kept/reverted and why

AUDIT VERDICT: nothing reverted. Every change in the recovered tree ties to the engraving pass or to
its stride consequence; no orphan edits were found. Three things were MISSING and are completed here:
the selfcheck the code referenced did not exist, two stride-offset updates were half-done (below),
and the cost note described a bench that had never been written.

| File | Verdict | Why |
|---|---|---|
| `app/src/engine/engraveBody.mjs` (new) | KEEP | The slice itself: GLSL chunk + JS mirror + packer in the material-leaf pattern. Header's "golden render hash-stable" wording corrected to the frame-data hash the selfcheck actually pins. |
| `app/src/engine/creature.js` | KEEP | Engraving as the second skeleton consumer via `input.wantEngraving`; `frameSkeletons` publication still answers only to `wantSkeletons` — S1's gate is untouched. Stamps `engrave` on the true body item only (not the halo underlay, not wings/scales). |
| `app/src/gl/liveLoop.mjs` | KEEP (justified) | One-writer file; the only change is the `wantEngraving = true` opt on `createLiveLoop` + stamping it into the resolve input, mirroring `wantSkeletons` exactly. Default on because the finish is a shipped look; the shed path is flipping this input, the perfTier1 pattern. |
| `app/src/gl/sceneContract.js` | KEEP | `engrave` rides the contract only when an item carries it (absent = byte-identical contract) + validation (16 finite, count 2..6, spacing > 0). |
| `app/src/gl/renderer.mjs` | KEEP | Append-only stride growth 29 → 45 floats: the 16 engraving floats go after the #1585 params; every earlier offset unchanged; attrib locations 10–13 appended; `u_specN` and the draw count follow the stride. |
| `app/src/gl/shaders.mjs` | KEEP | `a_engA/B/C/P` at locations 10–13, `v_au` (body-space position) published by the VS, ENGRAVE_GLSL inlined, soft multiply applied in the body fragment behind the count gate. |
| `app/src/engine/kernel/costRegistry.mjs` | KEEP + corrected | Append-only S4 block at file end (stack discipline). The note claimed a SwiftShader bench in the selfcheck that did not exist; corrected to describe the bench that now exists (CPU pack, node) and to state plainly that no GPU sweep figure exists for an in-shader branch. |
| `app/src/engine/dishDeform.selfcheck.mjs` | KEEP + fixed | Length assertion updated 58 → 90 for the stride; the zeros assertion still pointed at pre-S4 floats 46..48 (fields that happened to be zero for the fixture). Fixed to the instance's real deform floats (45+21..23 = 66..68). See §Corrections. |
| `app/src/engine/plateBody.selfcheck.mjs` | KEEP | Stride assertions 29 → 45, all field offsets re-based on the stride; plate float itself unmoved at 24. Verified green. |
| `app/src/engine/stippleBody.selfcheck.mjs` | KEEP | Same mechanical stride update; verified green. |
| `app/src/engine/washBody.selfcheck.mjs` | KEEP | Same; verified green. |
| `app/src/gl/glassBevel.selfcheck.mjs` | KEEP | Stride + second/third instance indices re-based (49 → 65, 78 → 110); glass float unmoved at 20. Verified green. |
| `app/src/gl/regionLines.selfcheck.mjs` | KEEP | Packed-length + slice-offset stride updates; verified green. |
| `app/src/gl/regionPlayback.selfcheck.mjs` | KEEP | Same class of update; adjudication in §Verification. |
| `app/src/gl/sceneContract.selfcheck.mjs` | KEEP + fixed | Packed-length 58 → 90 and instance-2 x at 45 were updated; instance-2 y still asserted at the pre-S4 index 30. Fixed to 46. See §Corrections. |
| `app/src/engine/engraving.selfcheck.mjs` (new, completing builder) | ADDED | The suite the leaf header and cost note referenced; written by the completing builder (§Proof). |
| `app/selfcheck.manifest` | ADDED line | `node src/engine/engraving.selfcheck.mjs` appended at the END of the manifest (stack discipline), nothing reordered. |
| `STAGING-REPORT.md` | REPLACED | Was S1's report (leftover); replaced by this file. |

Completeness check on the stride: a recursive `grep` over `app/src` for stride pins (run after the
§Corrections ¶6 fix) confirms no file still hard-codes the 29-float instance stride or the 116-byte
stride; all other `packInstanceData` consumers use it opaquely, and all other `vertexAttribPointer`
sites belong to unrelated programmes with their own buffers. One historical comment in renderer.mjs
still says "(29-float stride)" — it describes the #1585 layout a_matP was appended under, and is
accurate as history.

## The slice

- **The field.** The skeleton's spine is a polyline of joints (spine bones' bases + head tip, tail →
  head). `engraveBody.mjs` converts the joints into the body item's own quad frame on the CPU
  (`engraveDataFor` — the exact inverse of the vertex stage's transform), and in the fragment the
  closest point on the polyline gives an arc-length coordinate `s`. Contour lines are the level sets
  of `s` at multiples of `spacing` (8 asset units): ruled ACROSS the body, perpendicular to the spine,
  so a pose that moves the joints bends the line field — the lines are a function of the joints, not
  of the bounding box. Ends feather via an end-fade window (−0.3..+0.1 spacings at the tail, mirrored
  at the head; gentle by its constants — ~84% fade AT the joint, measured and asserted as such).
- **Antialiasing.** `fwidth` on the line-distance field (core in GLSL ES 3.00) — one screen pixel of
  AA on every device, no baked width.
- **Composite order.** The multiply is applied inside the body item's own fragment, weighted by the
  body's coverage `o.a`, so the lines exist only inside the silhouette. In the five-pass target
  (back feathers → bent wings → body → ornaments → engraving) this places the darkening AT the body's
  draw in the item stream — and today's stream interleaves the creature's parts (halo, fore wings,
  body stamp, hind wing, marks…), so parts drawn after the body paint over the lines where they
  overlap it, and parts drawn before sit under the darkened body. **Integration point for the S2/S3
  publish rebases:** if the stack wants engraving strictly last over everything, the term moves to
  a post-pass at that rebase; as staged, the order is the item stream's, stated plainly rather than
  dressed as the five-pass ideal.
- **The gate.** A non-engraved instance packs zeros in the appended block; its count reads 0; the
  branch (`v_engP.x > 1.5`) never enters — the pre-S4 quad, bit for bit. The contract carries no
  `engrave` key unless an item is stamped. With `wantEngraving` off, the creature's drawn items are
  exactly the pre-S4 items (asserted).
- **Shipped constants** (`ENGRAVE_DEFAULTS`, named for Matt's review): spacing 8, width 1.5,
  strength 0.55. Joints carried: 6 (the moth spine yields 5–6).

## Precision findings — the kill criterion

Kill (Matt's): device precision divergence that highp/quantisation cannot fix → stop and report.
**Verdict: NOT triggered.** Every quantity in the field is O(10²) asset units in highp float32
(24-bit mantissa → absolute error ~1e-5 units, five orders below the line width); the field is dot
products + one `fract` — no sin-hash, no texture-size term, no mediump anywhere in the quad programme
(asserted in the selfcheck). The only cross-device variable is rasterisation inside the AA band,
where the output is a CONTINUOUS function of position: a sub-ulp input difference moves the factor
by < 1e-3, below the 16F→8-bit resolve step except for a pixel exactly on a rounding boundary — the
same class the sun/bevel terms already carry. Sandbox evidence: the engraved contract rendered twice
through the real renderer (headless Chromium, SwiftShader) produced the identical pixel hash
(`b7795239403d7df1`, sha256-truncated) on both runs. Real-device divergence can only be finally
excluded on hardware; nothing in the construction suggests a source for it.

## Cost

- Registered: `creature/engraving`, tier 0, memoryBytes 0, timeMs 0.05 — in the append-only S4 block
  in `kernel/costRegistry.mjs`. It is a gated branch inside the existing quad programme: no pass, no
  draw, no target, no bytes — the tier-0 precedent of the programme's other terms. The costTiers
  gate (green) requires a committed sweep measurement for any non-tier-0 declaration, and the #1622
  sweep harness drives whole programmes, not branches — so no GPU sweep figure exists for this term
  BY CONSTRUCTION, and the registry note says so. The honest re-tier path if the governor ever needs
  one: shed at the resolver input (`wantEngraving`), not at the pass list.
- CPU, measured (sandbox node, print-only bench inside `engraving.selfcheck`): the 4-creature pack
  (`engraveDataFor` × 4) costs **0.0284 ms/frame** — far inside the 2.0 ms frame budget, and it is
  the slice's only per-frame CPU.
- GPU, sandbox-indicative only: a SwiftShader render-timing comparison was attempted; under this
  sandbox's contention the numbers were noise (whole-frame renders, seconds-scale, deltas swinging
  both directions) and are NOT reported as evidence. The budget-bearing measurement is the real-GL
  pixel proof below; the 2.0 ms iPad-class verdict awaits hardware, as it does for every slice in
  this stack.

## Proof

- `engraving.selfcheck` (new): packer inverse-transform (identity/scale/rotation/world round-trip,
  padding, null cases) · the arc field (line centres at multiples of spacing, untouched between
  lines, end fade measured as built) · **the bend claim** (a grid of probes: moving the middle joint
  +24 in x changes the field at > ⅓ of probes; the shared tail joint agrees exactly) · GLSL↔JS parity
  by construction (same walk fragments, `fwidth` band, gate, no-mediump) · packer stride (45, earlier
  offsets unmoved, absent reads zeros) · contract validation · builder wiring (exactly ONE engraved
  item — the body stamp, not its halo underlay; 26 drawn items with the flag on or off; publication
  still `[null]` under `wantEngraving` alone) · **golden frame hash `59289882`** (FNV-1a over the
  seed-77 fixture moth's packed engraving) · CPU bench · determinism guard (no `Math.random` /
  `Date.now` / `performance.now` in `engraveBody.mjs`).
- Real GL (scratch bench through the parity `glDriver`, contracts built by the real pipeline with
  body instances cloned from a pipeline instance): engraved render sha256 `b7795239403d7df1`,
  **identical across two runs**; unengraved `21b2c472332a7a6d`; **19,243 of 700,000 pixels differ**;
  mean RGB **25.17 engraved vs 26.25 unengraved** — the finish fires in the real shader path and only
  ever darkens (soft multiply). Scratch file: `/tmp/s4-gl-bench3.mjs` (not part of the build).

## Corrections recorded (recovered claims that did not survive checking)

1. The recovered tree contained **no S4 staging report and no engraving selfcheck** — the leaf header
   and the cost registration both cite `engine/engraving.selfcheck.mjs`; it had never been written.
   Written by the completing builder; manifest line appended.
2. **dishDeform.selfcheck** zeros assertion pointed at pre-S4 floats 46..48 after the stride change
   (those indices now name instance 2's y/scales). The suite failed on the recovered tree; the
   assertion now names the instance's deform floats (66..68), which is what its text always claimed
   to check. Fixed in commit `baa1f7f3`; suite green.
3. **sceneContract.selfcheck** instance-2 y asserted at packed[30] (pre-S4 index). Suite failed on
   the recovered tree; fixed to packed[46] in `baa1f7f3`; suite green.
4. The cost note's "sandbox bench in engraving.selfcheck (SwiftShader)" described a bench that did
   not exist; the note now describes the CPU bench that does exist and labels the GPU figure an
   estimate with no sweep source. (§Cost.)
5. engraveBody's header claimed "the golden render is hash-stable"; what is pinned in-tree is the
   packed frame-data hash. Wording corrected; the pixel-hash stability was then ALSO proven in this
   session via the real-GL bench above (recorded here, scratch-side).
6. **atlas.skip.selfcheck** carried one more pre-S4 stride pin (`packed.length === 29` for a single
   instance) that the recovery audit's stride grep missed (its output was truncated before this
   file). The suite failed in adjudication; fixed to 45 in a follow-up commit, suite green, and a
   recursive re-grep over `app/src` confirms no stride pins remain anywhere.

## Verification

- Family (solo, this tree): creature, skeleton, engraving, plateBody, washBody, stippleBody,
  glassBevel, regionLines, costTiers, mathRandomGuard — PASS. dishDeform + sceneContract — PASS
  after the §Corrections fixes.
- `npm run build` — green. ESLint — clean on every touched file.
- Full manifest sweep (449 commands): run in two parts on this tree — part 1 (manifest lines 1–252):
  236 PASS / 11 FAIL; part 2 (253–449): 192 PASS / 10 FAIL. This sandbox was shared all session with
  several sibling builders and repeated Chromium benches, and runtime restarts killed two earlier
  builders mid-work — so every sweep FAIL was treated as a suspect, not a verdict, and adjudicated
  solo on this tree, with pristine-base runs for anything that still failed. Final accounting of all
  21 FAILs:
  - **3 were real S4-side selfcheck bugs** — dishDeform, sceneContract, atlas.skip (incomplete stride
    updates) — fixed in `baa1f7f3` / `3e3c3065`; all three green solo after the fix.
  - **11 pass solo on this tree**: parity, debug, cellKinemePlayback, regionBake, prospecting,
    variants, rasterFast, grainFinish, phase6, patternRender, lootScan (its "235 ms" assertion is a
    timing bound that flakes under load — green on both trees on a quieter run). exportStill is
    counted with the exceptions below instead.
  - **6 are proven base-identical sandbox exceptions** (solo runs on this tree AND on pristine
    `d8009ee9` in this session): `kernel/bake/swarmWasm` — identical assertion failure both trees
    (build-wasm.sh --verify; cargo absent); `gl/accum`, `fx/rollSafety`, `gl/composite`,
    `gl/canvasSizes`, `gl/regionPlayback` — non-completion at every bound tried on both trees
    (240–420 s, exit 124; accum OOM-kills on quieter runs, exit 137 on base in a sibling builder's
    independent base sweep). `gl/exportStill` joins them on convergent evidence: non-completion on
    this tree at 420 s and an OOM kill (exit 137) on pristine base in the same independent base
    sweep. CI is authoritative for all seven.
  - One sighting recorded honestly: regionPlayback once exited with a Node error banner in the
    first family run (before adjudication) — consistent with the resource kills its later runs
    showed on both trees; it never produced an assertion against this tree's code in any run.
  - Two base runs in the third adjudication round were void (their results were `cd` failures: a
    runtime restart had wiped the /tmp pristine worktree mid-session) and were re-run against a
    recreated pristine worktree in durable storage — patternRender and lootScan both PASS on base
    there, matching this tree.

## Design calls flagged

1. **`wantEngraving` defaults ON in `createLiveLoop`** (recovered builder's call, kept): the finish
   is a shipped look, not a debug surface, and S1's `wantSkeletons` default-off was for a debug
   consumer. The governor's shed path is the input flip. If Matt wants the finish opt-in until he
   has seen it on the moth, the default flips in one line — flagged, not hidden.
2. **Engraving composited at the body's draw, not as a separate fifth pass** (kept, §The slice):
   zero extra passes/draws is what makes the cost registration honest; the S2/S3 publish rebases are
   where a strict last-pass order would be decided if ornaments-over-body overlaps become visible.
3. `ENGRAVE_DEFAULTS` (spacing 8 / width 1.5 / strength 0.55) are the recovered builder's shipped
   constants, named in one place for Matt's eye at review; no ruling pinned them.
