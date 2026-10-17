# STAGING REPORT — Phase 2 S7: the L-system growth

Branch `ember/skeleton-s7` on the S1 publish tip `d8009ee9`. LOCAL ONLY — no push, no PR.
Contract: Matt's skeleton-system brief + `skeleton-creature-plan-2026-10-16.md` (S7 slice text; addendum
rulings 4 — sprouting births — and the Tighten-prunes rule) + `docs/design/creatures-spec.md`.
Stack note: S2–S6 are staging concurrently; this slice is built against S1's committed interfaces only
(the bone shape, `skeletonHash`, the `'skeleton'` RNG channel, `transformSkeleton`) and touches no S1
file, so the coordinator's publish rebase has nothing of S1's to collide with.
(This file replaces the S1 staging report the worktree inherited from its base commit.)
Recovery note: two runtime restarts killed the first two builders on this slice (the original in
its sweep phase, the first recovery builder minutes in). The surviving tree was audited file by
file by the recovery builder — every draft claim below was re-run or re-measured before it was
kept; the code was committed before verification resumed so a further restart could not strand it.

## What shipped

- **`app/src/engine/lsystem.js`** (new) — a skeleton *generator* variant: the skeleton IS the tree.
  A classic Lindenmayer grammar — an axiom rewritten by production rules (`expandLSystem`), then read
  by a turtle — emits bones in exactly `skeleton.js`'s shape (same fields, same construction-order
  discipline, hashed by the imported `skeletonHash`, so S1's "same hash on both devices" discipline is
  S1's own function, not a re-implementation). The return is `buildSkeleton`'s shape:
  `{ plan: 'lsystem:<set>', creatureId, bones, headBone, hash }`.
  - **Rule sets are data** (`LSYSTEM_RULE_SETS`, frozen, in the plan-data idiom): `canopy` (paired limbs
    at every apex), `fern` (alternating single fronds — X leans on Y, Y leans on X), `spire` (a tall
    trunk, short paired twigs). The seed picks the set when the caller doesn't.
  - **Seeded creature parameters**, drawn once, in a fixed order, from the kernel RNG on the registered
    `'skeleton'` channel keyed `fnv1a('<creatureId>:lsystem')` — S1's `partStream` keying exactly:
    rule-set pick, generations 3–5, branch angle 16–30°, trunk step 11–16 box units, taper 0.68–0.78
    per bracket depth. `pose` overrides (`generations`, `angleDeg`, `stepLen`, `ratio`) apply AFTER the
    draws, so an override never shifts another parameter's draw.
- **Sprouting births (ruling 4)** — `sproutAmount(frameIndex, frames = SPROUT_FRAMES = 120)` is a pure
  function of the counted frame index; `growTreeSkeleton(skel, amount)` poses the grown tree at that
  amount. Bones sprout in growth (construction) order — the turtle emits a trunk segment, its branches,
  then the next trunk segment, which IS the order a tree grows — each bone swelling over an overlapped
  quarter of the sprout, smoothstepped. No clock is read anywhere: a birth replays identically on any
  device, and a recorded take carries the sprout exactly (the creatures-spec §2 rule).
- **Tighten prunes, as a pose** — `pruneTreeSkeleton(skel, band)` / the composed
  `poseTreeSkeleton(skel, { growth, band })`: branch bones shorten as a pure function of band,
  weighted by generation depth (0.3 + 0.7 × depth/maxDepth, re-derived from the parent chain), so the
  outermost twigs collapse to zero length (invisible) at full Tighten, first-generation limbs only
  shorten, and the trunk's factor is 1 at every band. Posing re-derives geometry by forward kinematics
  into a NEW skeleton (a bone's base is its parent's posed tip); the grown structure is never mutated.

## How tree bones map onto S1's bone shape

| S1 (moth) | S7 (tree) |
|---|---|
| spine bones, `chain: null`, side `C` | trunk bones, `trunk/<i>`, `chain: null`, side `C` |
| last spine bone: role `head`, marker `H`, `headBone` | last trunk bone: role `head`, marker `H`, `headBone` |
| chain root bones: role `limb`, marker `L` | each bracket group's first bone: role `limb`, marker `L`, id `branch/<n>/0` |
| chain bones `fore/L/0..2`, parented in sequence | branch bones `branch/<n>/<seg>`, parented in sequence; a sub-branch's root parents to the bone at its branch point |
| side `L`/`R` by construction half | side by the chain root's direction sign (`ux` → `R`/`L`/`C`); a whole chain keeps its root's side |
| parent precedes child | same — and for trees every bone's base is its parent's tip, roots included (a tree bone grows out of its parent's tip by construction) |

The selfcheck pins the shape literally: every tree bone's sorted key set deep-equals a real moth
bone's, and `transformSkeleton` places a tree unchanged in kind (root lands on the pin, scaled).

**Mirror discipline, where the rules call for it.** `canopy` and `spire` branch only in ± pairs from an
on-axis trunk (the trunk's heading is 0 at bracket depth 0 — turns exist only inside brackets), and
all variation is grammar-level (one angle, one taper per creature — no per-branch jitter), so paired
chain roots are mirror images by construction: measured deviation across every root pair of the golden
canopy tree is exactly 0, and the selfcheck asserts a mirror partner within 1e-9 for every left root in
both paired sets. `fern`'s rules call for alternating single fronds; it is marked `paired: false` in
the data and no mirror is claimed or asserted for it.

## Expansion caps — bounded and total

`LSYSTEM_CAPS` (exported): generations ≤ 6, expanded string ≤ 16,384 chars, bones ≤ 384, bracket
depth ≤ 12. Expansion is iterative rewriting; a round that would pass the string cap is sliced to the
cap and ends expansion (deterministic — the same input slices at the same character). The turtle is a
single pass over the capped string with a bounded stack; pushes past the depth cap are ignored in
pairs with their pops, unbalanced closes are ignored, and emission stops at the bone cap. The
selfcheck proves totality against hostile caller grammars (a 12× self-doubler truncates at the string
cap; an F-thicket at generations 99 stops at 384 bones; a self-erasing grammar returns zero bones and
a null head; lopsided brackets return normally).

## The sprout and prune proofs (selfcheck, golden seed 77 / creature `t0` / canopy)

- **Goldens:** canopy hash `83e330fb` (242 bones) · fern `ad8ec527` · spire `0317a960` · the seed's
  own pick at seed 77 is spire (`0317a960`) · canopy at seed 7 `581da44e`. Two independent builds
  deep-equal; seed, creature and pose each move the hash.
- **Sprout sequence** at counted frames [0, 15, 30, 60, 120, 300]:
  `e3ab9562, 0ff03aa3, 08320552, 1eeb773e, 83e330fb, 83e330fb` — identical on an independent regrow,
  settling on the grown hash from frame 120 (SPROUT_FRAMES) onward. Amount 0 ⇒ every length 0;
  amount 1 ⇒ the grown hash; at quarter growth the first bone is complete and the last has not started.
- **Prune-as-pose:** the grown skeleton's JSON is byte-identical before and after posing at bands
  [0, .25, .5, .75, 1] and its hash stays `83e330fb` throughout — band-invariance of the structure,
  asserted, not argued. Posed branch length falls strictly with band (1436.4 → 1190.8 → 945.2 → 699.6
  → 454.0 box units) while trunk length is constant (123.4). At band 1 the deepest generation
  (depth 5 on the golden tree) collapses below 1e-9 and first-generation roots keep > 25% of their
  length. One composed pose `{growth: .5, band: .5}` hashes identically to grow-then-prune in sequence.
- **Identity repose:** posing at `{growth: 1, band: 0}` reproduces the grown hash with max coordinate
  drift 4.6e-14 (the hash quantises to 1e-4, S1's trig-dust argument, so the drift can never split a
  hash between devices).

## Cost — CPU-only, stated plainly

This slice registers **no** GPU cost and adds nothing to `kernel/costRegistry.mjs`: no pass, no
shader, no draw. The generator and the poses are arithmetic over ≤ 384 bones (expansion + turtle at
birth; an FK pass per posed frame — microseconds at creature counts), exactly S1's posture.
Measured on this sandbox (CPU, contended — indicative only): growing the 242-bone golden canopy
costs ≈ 0.31 ms once, at birth; posing it (growth + prune composed) costs ≈ 0.020 ms per frame. A tree's
first GPU cost lands when a later slice skins or draws it; that slice registers the tier then. Trees
grow in the moth's box units but are not box-bounded (a spire's crown passes the box top) —
`transformSkeleton` scales a tree to its stage size like any skeleton, which is the consumer's call,
not the generator's.

## Parity and scope

Nothing existing changes: no S1 file is edited, the moth is untouched, no live builder grows trees
yet — like S6's rules file, this slice is the generator + pose layer with its parity suite; wiring a
tree creature into the resolver is a later integration step, not smuggled in here. No UI (freeze
honoured), no new panel, no clock reads — `mathRandomGuard` still reports its unchanged 15 files /
25 sites, and the suite's own source scan (skeleton.selfcheck §8's pattern) covers `lsystem.js`.

## Verification

- `node src/engine/lsystem.selfcheck.mjs` — OK (determinism + goldens, shape, mirror discipline,
  caps, sprout, prune-as-pose, placement, guard). Registered in `app/selfcheck.manifest` after
  `skeleton.selfcheck`.
- Family: skeleton, creature, kernel/rng, mathRandomGuard, runSelfcheck — OK.
- `npm run build` — green. ESLint — 0 errors on the touched files.
- Full manifest sweep: **449/449 suites recorded** — twice over (the coordinator's runners and the
  recovery builder's resilient continue-on-fail sweep agree exactly: 430 pass, 19 non-pass under
  sweep conditions). The suites below produced at least one non-pass record in some run; **every
  one is dispositioned with paired
  evidence on pristine base `d8009ee9`** (a detached worktree of the base commit, run under the
  same conditions). No exception is reachable from this diff: `app/src` is byte-identical to base
  except the two new files (`engine/lsystem.js`, `engine/lsystem.selfcheck.mjs`) — verified by a
  recursive diff of the whole tree.
  - *Identical failure on both trees (3):* **swarmWasm** (same AssertionError; the sandbox has no
    cargo, so the wasm build step cannot run anywhere here), **lootScan** (same duration
    assertion, line 163 — 466 ms build vs 476 ms base against its budget), **livingMotion**
    (same assertion, line 121 — 5.17 ms build vs 4.39 ms base against a 2 ms budget).
  - *Wall-clock flips both ways (2):* **vortex** (2 ms budget; three alternating solo rounds —
    build failed/passed at 15.0/5.4/3.7 ms, base failed 2 of its 3 rounds at 5.0/8.4/0.6 ms),
    **resolverProbe** (sweep FAIL on build, solo PASS on build, solo FAIL on base —
    "resolver mean with four creatures 10.561 ms (budget 5)").
  - *Cap artefact, passes solo on both trees (1):* **rasterFast** (sweep timeout at the 300 s
    cap; solo PASS build 354 s, base 406 s).
  - *Load-starved in one recovery sweep, passes solo on this tree (2):* **debug** (FAIL in the
    recovery builder's peak-load sweep; solo PASS on this tree, 48 cases OK, and PASS on base)
    and **miner** (300 s sweep timeout at load ~19; solo PASS on this tree — "miner.selfcheck:
    OK" — and PASS on base). Same load-lottery class as rasterFast; neither imports `lsystem.js`
    (nothing does except its own selfcheck — grep-verified).
  - *Non-completion on both trees (12):* **rollSafety**, **accum** (base OOM-killed, exit 137;
    build timeout), **composite**, **canvasSizes**, **patternRender**, **exportStill**,
    **regionPlayback**, **phase6**, **regionBake**, **grainFinish**, **variants**,
    **prospecting** — each recorded exit 124 (timeout kill) on build and on base alike in paired
    solo runs at 300–615 s caps. These are the sandbox's known heavy suites; CI is authoritative
    for them.
  - *Non-completion on identical code (1):* **cellKinemePlayback** — build capped at 420 s and
    again at 600 s; base completed once in 333 s during a load lull. The suite and everything it
    imports are byte-identical between the trees (see the recursive-diff note above), so
    completion here is purely a load lottery; sustained load was 14–19 all night (six sibling
    staging agents plus the coordinator verifying concurrently). CI is authoritative.
  - Incident note: the first sweep's output and a scratch base worktree under `/tmp` were wiped
    mid-run by a runtime restart. Records for the first 211 suites observed before the loss
    (only non-passes: swarmWasm, rollSafety) were re-proven afterwards by the paired solo runs
    above; all other sweep records were re-collected with runners logging into the workspace.

## Flagged design calls

1. **Local bone factory.** `skeleton.js` does not export its `makeBone`; rather than edit S1's file
   mid-stack (S2–S6 are building on it concurrently), `lsystem.js` carries a field-for-field copy and
   the selfcheck pins the key set against a real moth bone. If the stack later exports the factory,
   this copy should be deleted in favour of the import.
2. **No per-branch jitter.** Seeded variation is creature-level only (grammar, angle, step, taper,
   generations). Per-branch jitter would break the paired grammars' mirror-by-construction; if a
   wilder tree is ever wanted, jitter must be drawn per branch-PAIR (one draw, mirrored signs) to
   keep the discipline — noted here so the choice is visible, not accidental.
3. **Prune weight normalises to the tree's own depth** (deepest twig = weight 1). A shallow tree
   therefore prunes its only branch generation fully at band 1. The alternative (an absolute depth
   scale) would make deep trees barely prune; the relative scale keeps Tighten legible on every tree.
4. **`plan` is `lsystem:<set id>`** and the sprout length (120 frames) and growth window (0.25) are
   named constants in the module, tuned to the creatures-spec's counted-frames idiom (the moth grows
   in over 45); they are feel numbers for Matt's eye when trees reach the stage, not laws.
