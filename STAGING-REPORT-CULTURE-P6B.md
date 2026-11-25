# STAGING REPORT — CULTURE Phase 6, slice B: breeding, growth, and casting per take

Branch `feat/culture-phase6b-breeding`, built on origin/main `dcc1ac6` (#2512, the 6A follow-up), origin/main
`079c1f2` merged in before publishing. Behind the
`cultureDish` gate; zero live-stage change. No issue owns this slice; the umbrella (1183) and the test-drive issues stay
as they are (T3's WetLab UI still waits on Matt's copy). Nothing here is merged.
Session: https://claude.ai/code/session_01EoZUDnFJMovETsv13jZSbR

## What shipped

1. **NEW `app/src/engine/cultureBreed.mjs`** — the laws, pure: the ruled constants, the breeding law
   (`cultureBreedAllowed`), the recipe blend, growth stage and scale, and **`cultureBabyPreview`** — the one deal a birth
   and a preview share (T3, engine only).
2. **`app/src/engine/cultureBody.mjs`** — `mixCultureBodies` (per-part coin flip; the linkage whole), `growCultureBody`,
   `cultureBodiesKin`.
3. **`app/src/engine/cultureMotion.mjs`** — **hunger is a drive** in the registry (`drives.hunger`, bounds [0, 4]), last
   in order; `CULTURE_NATIVE_HUNGER = 2`. The 6A pull in `cultureDesire` is gone.
4. **`app/src/engine/cultureLab.mjs`** — every native recipe carries `hunger: 2`; DAVIS's hunger lean is 0 on its own
   draw index (no earlier draw moves); LOIS's temperament reads the 16 temperament dials; `loisPraise` exported (the
   same formula, recorded on babies).
5. **`app/src/engine/cultureEcology.mjs`** — the senses carry `{ x, y, emptiness }`; each life carries stage, meals,
   its born body (genotype), its first joint, its parents, its children; eating counts meals and grows the citizen at
   once (`growCultureCitizen`); tallies births / refused / capped / no-room / grown; the hash folds all of it.
6. **`app/src/engine/cultureWorld.mjs`** — the cast's deal factored into `dealCultureMember` (the cast hashes as
   before), **`stepCultureBreeding`** (last of the contacts on the settled frame), and the preview read door
   **`cultureBabyPreviewOf(world, a, b)`** (reads only).
7. **`app/src/engine/cultureTestDrive.mjs`** — T3 on the bench: `cultureTestDriveBaby(a, b, opts)` previews the child and
   drives it on its parents' gait (same kind, beats, mood). No panel, no copy.
8. **`app/src/engine/cultureBeast.mjs`** — the dial reading accounts for the new gene.
9. **`app/src/engine/kernel/rng.js`** — registers `culture-breed` (spatial).
10. **NEW suite `cultureBreed.selfcheck.mjs`** (10 groups), one manifest line after `cultureEcology`.

One-writer files untouched (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js` not in the diff). Package files
untouched. No hook, bridge, surface or copy change; QUEEN/GOVERNOR appear only in engine comments.

## Matt's rulings applied (2026-11-24)

- BREEDING TRIGGER: two eligible citizens of the SAME PLAN touch (6A's contact) → a baby. Eligible = fat ≥ 60 and
  growth stage ≥ 2.
- BIRTH COST: each parent pays 25 fat; the baby is born with 50.
- BODY MIX: per part a coin flip picks the parent of that part's look AND size; the recipe is a BLEND; looted limbs are
  NOT inherited; the baby must pass LOIS (plan-capped sockets) — a refusal means no birth.
- HUNGER is a DAVIS drive (recipe gene), blended by breeding; it replaces the 6A ecology-law pull; the natives carry a
  value that reproduces 6A exactly (proven, below).
- GROWTH: stage 1 at birth (cast or bred), +1 every 5 morsels eaten, cap 3; a modest per-stage size scale feeding
  predation's ratio.
- BABY PREVIEW (T3): engine only, pure, deterministic. Per-take Lab casting verified and pinned.

## Defaults used

| Constant | Value | In code |
|---|---|---|
| Breeding eligibility | fat ≥ 60, stage ≥ 2 | `CULTURE_BREED_FAT`, `CULTURE_BREED_STAGE` |
| Birth cost | 25 fat a parent | `CULTURE_BIRTH_COST_FAT` |
| Baby fat | 50 | `CULTURE_BABY_FAT` |
| Growth | +1 stage per 5 morsels, cap 3 | `CULTURE_GROWTH_MEALS`, `CULTURE_GROWTH_STAGE_MAX` |
| Native hunger gene | 2 (6A's pull weight) | `CULTURE_NATIVE_HUNGER` |

Builder's defaults (recorded, tunable): **per-stage scale ×1.08** on every radius (`CULTURE_GROWTH_STAGE_SCALE`; area
×1.1664 a stage, so one stage alone stays under predation's 1.2, two stages ×1.36 cross it); **at most 32 living**
(`CULTURE_POPULATION_CAP`); hunger gene bounds **[0, 4]**; DAVIS's hunger lean at cast **0**
(`CULTURE_DAVIS_HUNGER_LEAN`).

## Design calls (decided and recorded)

1. **Hunger as a drive, bit-exact.** `hunger` joins the drive registry LAST, returning (direction to the sensed morsel) ×
   emptiness; the recipe weight multiplies it. 6A added direction × (2 × emptiness) after the drives; ×2 is exact in
   IEEE arithmetic, so (d × e) × 2 = d × (2 × e) to the bit and the sum order is unchanged.
2. **The cast is exactly 6A's.** DAVIS's 16 temperament dials keep their draw indices; the hunger gene takes index 16
   and a lean of 0, so a cast citizen carries the native gene. LOIS's temperament reads the 16 temperament dials only
   (averaging over 17 would rescale praise and could flip a slot's pick). Proven: the swarm (every body) and gait hashes
   equal origin/main `dcc1ac6` to the bit — unfed over 60 s, and fed up to the step before the first growth (below).
3. **Contact = 6A's, either way.** A pair touches when either head disc overlaps any living part of the other.
4. **Order and one birth a parent a step.** Breeding runs last on the settled frame (beats → eating (and growth) →
   predation → looting → breeding). Each living citizen in cast order takes the first touching, allowed partner in cast
   order; both are done for the step. Newborns wait until the next step.
5. **Where the baby is born.** At the parents' heads' midpoint, held inside the cast's staging margin (1.5
   body-lengths); facing a drawn heading; dealt exactly like a cast member (rest pose, recipe masses, links at declared
   rests, seed from the world seed and its index — the cast's own formula, counted on).
6. **The genotype.** Breeding reads each parent's BORN body (`life.bornBody`): looted limbs are worn, never inherited,
   and growth is not inherited either (a grown parent passes on its born size). The baby is born at stage 1, at its own
   birth size.
7. **The body mix.** Same plan means the same part tree, so part k of one parent is part k of the other. Each part's
   radius and look come whole from one parent; the joints are re-dealt at the overlap rule from the new radii (LOIS checks
   rests against radii). A strandbeest's linkage — one crank, one measure set for all six legs (law 4) — is one more part
   with one flip: its genes and its bone scale come whole from that parent. A swimmer's `scale` (read only by the hash) is
   its head's parent's.
8. **The recipe blend.** Every dial is the parents' mean; TIMING rounded to whole steps (DAVIS's own rule); named
   `<plan>/bred`.
9. **LOIS gates the baby** on the body's faults (plan cap, sockets, tree, rests, vocabulary) and the recipe reading.
   Praise is recorded on the baby (the cast's formula at the birth spot) but gates nothing: the bar is the cast's.
10. **A refused birth costs nothing.** LOIS refusal, the living cap, or a full table → no birth, no fat paid, counted
    (`birthsRefused`, `birthsCapped`, `birthsNoRoom`). The pair is done for that step.
11. **Growth is physical.** On the morsel that earns a stage, the citizen's body becomes its born body × 1.08^(stage−1):
    every born disc radius and born joint rest in the tables, its braces, its length (so its sensory range), its scale
    (so a beast's bones). Masses are kept. Carried (looted) limbs keep their size. A born limb's recorded size follows
    growth, so a looter takes it at the size it had.
12. **The preview is the birth.** `cultureBabyPreview(a, b, { seed, serial })` is the one deal; the world calls it with
    (world seed, birth serial). `cultureBabyPreviewOf(world, a, b)` previews the next birth exactly and changes nothing.
13. **Casting per take.** The Lab already casts once per world (a second cast is refused) and the shell builds a new
    world per gate-on run / seed. Now pinned: after a lived take with births, growth and loot, the next take's world
    hashes exactly as a pristine cast; no babies, all stage 1, fat 50, no looted sockets, born bodies ungrown; the shell's
    second run is a new world with a fresh ecology.
14. **Determinism.** Births draw only on `culture-breed` at (world seed, birth serial × 64 + k); twin worlds with births
    are bit-identical; everything new is in `cultureEcologyHash` (stage, meals, joint record, parents, children, the born
    body's radii and looks, the five tallies), and the grown body and the gene reach the hash through the citizens hash.

## Mutation tests — 44/44 killed (each applied alone to a clean copy, `cultureBreed` run, the file restored)

| Mutation | Killed by |
|---|---|
| same-plan check dropped | g2 "different plans: never" |
| fat ≥ 60 → > 60 | g2 "fat exactly 60 and stage exactly 2: allowed" |
| fat line 59 (constant) | g1 |
| stage ≥ 2 → > 2 | g2 |
| stage line 1 (constant) | g1 |
| parent A pays 24 | g2 "parent A paid exactly 25" |
| parent B pays nothing | g2 "parent B paid exactly 25" |
| cost 26 (constant) | g1 |
| baby fat 60 (the deal) | g2 "the baby is born with 50 fat" |
| baby fat 51 (constant) | g1 |
| part size averaged, not flipped | g3 "the size is exactly one parent's" |
| part look always parent A | g3 "and the look the same parent's" |
| flip inverted vs the draw | g3 "the flip is the channel's draw" |
| linkage always parent A | g3 "the linkage whole from one parent" |
| recipe = parent A's | g4 "the parents' mean" |
| timing not rounded | g4 |
| looted limbs inherited (worn body) | g3 (the structures differ → refused) |
| growth inherited (grown body) | g3 "a parent's BORN size" |
| LOIS gate skipped in the world | g5 "LOIS refuses the baby: no birth" |
| LOIS ignores body faults | g5 |
| a refusal charges the parents | g5 "a refused birth costs parent A nothing" |
| growth every 4 morsels | g1 (stage table) |
| growth constant 6 | g1 |
| stage cap 4 | g1 |
| stage scale 1.1 | g1 |
| growth leaves the table radii | g6 "part 0 ×1.08" |
| growth leaves the joints | g6 "joint 0 at the grown rest" |
| growth grows carried limbs | g6 (looter) |
| the hunger weight ignores the gene | g7 "gene 0: the food is ignored" |
| the hunger drive ignores emptiness | g7 (fed bodies leave 6A's) |
| DAVIS leans the hunger gene | g7 "the cast carries the native gene" |
| native hunger 2.5 | g7 |
| the preview door mutates the world | g8 "previewing changes nothing" |
| the preview writes a parent | g8 (frozen parents) |
| the preview ignores the serial | g3 |
| a second cast allowed | g9 "no second cast" |
| hash drops stage | g10 |
| hash drops births | g10 |
| hash drops a born part's radius | g10 |
| hash drops parent A | g10 |
| population cap > not ≥ | g5 "at the living cap: no birth" |
| two births a parent a step | g2 "the third paid nothing" |
| contact one way only | g2 "A breeds with B, touched by B's head" |
| the dead breed | g2 |

Masked survivors found and fixed (the earlier slices' warning held again): (a) **contact one way only** survived — the
cast-order loop visits both orders, so the symmetric check is visible only in WHICH partner is chosen; a test now places
B's head on A's tail while A's head touches C and expects A × B. (b) **growth grows carried limbs** survived — the guard
`s.looted || s.bornLocal < 0 || …` had a redundant clause masking the first; it now stands as `s.looted || !s.slots.length`.
(c) **hash drops parent A** survived — the hash test swapped the parents, which a hash of either one alone also sees;
each parent is now poked alone.

## Loud re-pins (each a changed law; no tolerance weakened)

1. **cultureMotion g1** — was: a `hunger` dial refused as unknown ("no hunger drive yet"). Now hunger is a dial; a
   recipe WITHOUT it is refused; an unknown dial (`thirst`) is still refused by name.
2. **cultureMotion g3** — the registry is `['wander', 'ground', 'rim', 'hunger']` (was three).
3. **cultureLab g5** — LOIS's praise formula in the test reads the 16 temperament dials (the hunger gene skipped).
4. **cultureEcology g3** — the sensed food carries `emptiness` (was `pull` = weight × emptiness) and the cast carries
   gene 2; the desire assertions are unchanged and still pass to the bit.
5. **cultureCitizens / cultureGait fixtures** — the inert test recipe names the hunger gene at 0 (a recipe must name
   every dial). Inert as before; every assertion unchanged.
6. **cultureBeast g8** — (a) room off: the citizens hash moves by the gene (was 4206198939, 3805670001, 2382023884,
   2589181518, 331514779, 3816371860 → now 2760788251, 2284435313, 4286813388, 3374000142, 3500107867, 193247732); the
   **swarm and gait hashes are unchanged** from origin/main. (b) room on: the world hashes are re-pinned (was 3241583243,
   1396512032, 1755287174, 548154483 → now 3778793516, 2137699268, 896174862, 1577957186), and **new pins** assert the
   swarm hashes (1751784904, 1765348224, 3176631088, 1328351648) and gait hashes equal origin/main `dcc1ac6`'s — computed
   on a pristine detached worktree — with nobody grown or bred in those 10 s.

## The 6A proof (the hunger gene reproduces 6A exactly)

Computed on a pristine detached worktree at origin/main `dcc1ac6` and on this branch (cultureBreed g7, cultureBeast g8):

- **Unfed** (no room), the full take sheet, 60 s: swarm hash seed 7 `3213499357`, seed 42 `1364707529` — identical.
  (No morsel → no meal → no growth; fat ≤ 50 → no breeding.)
- **Fed** (mid, 120 bpm), the full take sheet: identical to 6A's bodies up to the step before the first growth (seed 7:
  step 1,975 `774063707`; seed 42: step 1,835 `1179149084`); at the growth step itself the bodies leave 6A's
  (6A 3615503007 / 1254146995) — the new law, as it should.
- Room on, 10 s, the cast and 5B sheets, and the take sheet (seeds 7, 42): swarm and gait hashes identical to 6A.

No unavoidable difference: the only bytes that move before growth/breeding are the hashes that fold the new gene and
the new state.

## Behaviour (the gated world, the full take sheet, 20 seeds × 120 s)

| Room | Cast | Births | Soil | Starved | Preyed | Peak living (one dish) | Alive at 120 s | Stage 1 / 2 / 3 (alive) | Loots | Growth events |
|---|---|---|---|---|---|---|---|---|---|---|
| none (unfed) | 130 | 0 | 0 | 89 | 41 | 7 | 0 | 0 / 0 / 0 | 16 | 0 |
| low, 40 bpm | 130 | 6 | 0 | 26 | 35 | 8 | 75 | 3 / 12 / 60 | 19 | 151 |
| mid, 120 bpm | 130 | 138 | 2 | 6 | 13 | 16 | 247 | 56 / 52 / 139 | 16 | 338 |

No birth was refused by LOIS, the cap (32) or the table in any run. Mid room: 128 of the 138 babies alive at 120 s; 17
grandchildren (a bred parent's child); 4 of 138 births came on the very next swarm step after the same parent's previous
birth (a parent above 85 fat — see open question 2). Unfed, nobody eats, so nobody grows or breeds: the table matches
6A's. Body table at 120 s (mid, seed 0): 158 of 2,048 slots, 144 of 4,096 links.

**Cost** (sandbox, mid room, seed 7, median of 600 frames at ~100 s): origin/main 0.75 ms a frame (7 living), this
branch 1.11 ms (11 living) — the population is larger; the cap bounds it.

## Verification

- New suite `cultureBreed` 10/10 (13 s). Every culture suite green: cultureWorld, cultureFluid, cultureLife,
  cultureSwarm, cultureSolver, cultureFields, cultureHand, cultureSoil, cultureMotion, cultureLab, cultureCitizens,
  cultureMoth, cultureGait, cultureBeast, cultureTestDrive, cultureEcology, cultureRoomLive, useCultureWorld,
  kernel/rng, the culture parity and host suites.
- Lint 0 errors (11 pre-existing warnings, untouched files). format:check clean. Build green.
- **Full manifest sweep** (3 parallel): **825 suites: 823 PASS / 2 FAIL**, log `sweep-culture-p6b.log` (committed), A/B
  appended. Each failure re-run alone against a pristine detached worktree at origin/main `dcc1ac6`: **rollSafety**
  fails alone on both, identically (standing: headless Target crashed); **accum** (rc 137 SIGKILL in the sweep) passes
  alone on both. Neither touches this diff.
- **Live stage byte-identical with the gate off**, A/B against a pristine detached worktree at origin/main `dcc1ac6`
  (the 5C/6A probe): 28 of 28 layout modes resolve to a real sampler, a fresh resolver per mode × 60 frames — all modes
  `3f43c59f5bc8edfd3681bf1b5bfc7d30a44e46d7f45aedeca6541df4eeb681ba`, every per-mode hash identical;
  serializeProject (cultureDish false) `9d7d6f7dd7d7f870022a337d1abf110d22516e39cf35038c2b341557497552fd`; live gait
  `ef4636852999efc078d2b99f3c0bf709cbfd57756ac38aa2f680e5073d68c6d3`; 23 motion sources, 56 cost tiers — identical on
  both, and identical to 6A's recorded values. No bus subscription with the gate off: the hook and the bridge are
  untouched (cultureRoomLive and useCultureWorld green, unmodified).

- **After merging origin/main `079c1f2`** (#2513, #2515, #2516, #2517 — none touches the dish): every culture suite,
  kernel/rng and the project-document suites re-run green (31/31); lint, format:check and build green; the gate-off
  probe re-run against a fresh detached worktree at `079c1f2` — every hash identical to the values above.

## Open questions (multiple choice + recommendation)

1. **The hunger gene never varies yet.** Every native carries 2 and DAVIS does not lean it (the ruled exact-6A
   reproduction), and breeding is within a plan, so every blend is 2 + 2 → 2. (a) leave it (built; the gene and the
   blend are wired and tested with forged parents); (b) DAVIS leans the hunger gene ±15 % at cast like every other dial
   (the draw index is reserved, `CULTURE_DAVIS_HUNGER_LEAN`): variation that breeding then blends, but the cast stops
   being 6A's in hunger (re-pins); (c) different native values per plan (still inert within a plan). **Recommend (b)**
   once Matt has seen the dish with breeding, as one constant change.
2. **"Parents drop below 60, so no instant re-breeding" holds only below 85 fat.** A parent at 100 pays 25 and stands at
   75, still eligible; if the pair still touches next step it breeds again (4 of 138 births in the mid room). (a) the
   letter of the ruling (built: one birth a parent a step); (b) a short rest after a birth (e.g. 5 s); (c) the cost
   leaves a parent at most 59. **Recommend (a)** — it is rare and self-limiting; (b) if the twins read wrong.
3. **A refused birth costs nothing** (built). (a) nothing (built); (b) the parents pay anyway (a failed pregnancy).
   **Recommend (a)** — LOIS never refused a natural baby in 60 runs; the refusal is a guard, not an ecology.
4. **Growth keeps masses.** (a) masses kept at birth's (built); (b) mass scales with area. **Recommend (a)** until
   iteration shows the grown bodies swim wrong.

## Surprises

- The ruled "parents drop below 60" assumption fails above 85 fat (question 2).
- The 6A hunger pull reproduces bit-exactly only because the native weight is a power of two (design call 1); a native
  gene of, say, 2.5 would differ in the last bit — the mutation table shows it caught.

## CULTURE program

With this slice, **Phase 6 of the CULTURE phasing doc is complete**: feeding, fat, starvation and predation, death,
decay and looting (6A), and breeding with body parts mixed as well as recipes, growth, and the Lab's casting per take
(6B). Every phase 0–6 of `docs/design/culture-phasing.md` has shipped behind the gate. Takeover (retiring the gate) is
not in this program and is not touched.
