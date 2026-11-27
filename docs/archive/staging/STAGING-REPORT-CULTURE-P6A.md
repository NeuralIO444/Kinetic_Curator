# STAGING REPORT — CULTURE Phase 6, slice A: the ecology turns on — life and death

Branch `feat/culture-phase6a-life-death`, built on origin/main `75985b0` (#2472, slice 5C merged) and rebased onto
`f260b74` (#2476 docs, #2478 constructs on the stage — neither touches the dish) before publishing. Behind the
`cultureDish` gate; zero live-stage change. No issue owns this slice; the parent umbrella (1183) and the test-drive
issues stay as they are. Nothing here is merged. Session: https://claude.ai/code/session_01EoZUDnFJMovETsv13jZSbR

## What shipped

1. **NEW `app/src/engine/cultureEcology.mjs`** — the ecology: feeding, fat and upkeep, starvation, predation, corpse
   decay and removal, looting and attaching, the worn body LOIS reads, the life read, and its hash.
2. **`app/src/engine/cultureWorld.mjs`** — the world carries `world.ecology`; the cast enrols one life per citizen; the
   step runs the food sense before the muscle, rehomes carried limbs with the body, lands the beats and runs the contacts
   (eating, predation, looting) after the gait, and runs metabolism every world step before the soil (which still judges
   last). Two read doors: `cultureMorsels(world)`, `cultureCitizenLife(world, i)`; `cultureCitizenAt` now carries the
   life and the carried limbs. `cultureWorldHash` folds `cultureEcologyHash` whole (appended last). Header: THE ECOLOGY.
3. **`app/src/engine/cultureMotion.mjs`** — the senses carry `food` only when the ecology handed the citizen one; the
   desire adds exactly the hunger pull. With no food the senses object and the desire are slice C's, bit for bit.
4. **`app/src/engine/cultureCitizens.mjs`** — `CULTURE_CITIZEN_CAUSES` = `['', 'soil', 'starvation', 'predation']`.
5. **`app/src/engine/kernel/rng.js`** — registers `culture-morsel` (spatial).
6. **NEW suite `cultureEcology.selfcheck.mjs`** (9 groups), one manifest line after `cultureRoomLive`.

One-writer files untouched (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js` not in the diff). Package files untouched
(node_modules symlinked). No hook, bridge, surface or copy change: QUEEN/GOVERNOR appear only in engine comments.

## The law this builds (Matt's rulings, quoted from the tasking and the spec)

Death by STARVATION and PREDATION only (§4 Q1). Creatures eat BEATS — the Queen's audible beats are the feeding; beats
land as morsels (§2.5, §3.1). A dead body DECAYS in the dish and its LIMBS CAN BE LOOTED; a looted limb ATTACHES, sockets
limited by the PLAN, every carried limb costs fat upkeep, a looted limb keeps its ORIGINAL look (§2.9, §2.10). Life is
the soil (Phase 4's dead-ground wither is kept, the soil law, not a new cause). Moth 5 sockets (4 + 1 free, any kind the
plan uses); strandbeest 6 crank throws, none free; dish creature as in 5A (4, two free).

## Defaults used (coordinator's build-time table — constants, recorded)

| Constant | Value | In code |
|---|---|---|
| Fat per beat morsel | +10 | `CULTURE_MORSEL_FAT` (2,400 ticks) |
| Upkeep | 1 fat/s a body + 0.5 fat/s a carried limb | `CULTURE_UPKEEP_BODY_FAT_S`, `CULTURE_UPKEEP_LIMB_FAT_S` (2 / 1 ticks a step) |
| Starvation | fat 0 sustained 5 s | `CULTURE_STARVE_S` (600 steps) |
| Dead-ground wither | 4 s (Phase 4, unchanged) | `CULTURE_SOIL_WITHER_S` |
| Decay | body 30 s, limbs lootable throughout (while the part stands — the soil may wither it first) | `CULTURE_CORPSE_S` (3,600 steps) |
| Predation | attacker fat < 30 and size ratio ≥ 1.2 | `CULTURE_PREDATION_FAT`, `CULTURE_PREDATION_RATIO` |
| Sim | 120 Hz | `CULTURE_ECOLOGY_STEP_HZ` (pinned = `CULTURE_STEP_HZ`) |
| Sensory range | 3 body-lengths | `cultureSenseRange` (5A's) |

Builder's defaults (not in the table; tunable, all named constants): birth fat **50** (between the hungry line 30 and
6B's breeding line 60); fat cap **100** (a full citizen neither seeks nor eats; the morsel stays for others); a morsel
spoils after **10 s** (§3.1 "uneaten morsels decay"); at most **64** standing (a beat on a full dish displaces the
oldest, counted); a head eats a morsel within its radius + **6 px**; morsels land **240 px** inside the border; the
hunger pull weighs **2 × (1 − fat/100)** in the drives' units.

## Design calls (decided and recorded)

1. **Where the beats come from: the gait clock while the room is audible.** The room bridge (5C) already feeds the
   world's room (energy, silence, the loop clock's bpm) and the gait layer counts beats from it. A morsel lands for
   every whole beat that clock crosses while the room has a reading and is not silent. With no reading, a silent room,
   an uncast dish, or the gate off: no morsels. The room is a recorded input of the world, so feeding is deterministic;
   the beat clock is the world's, not a live event stream (no `clock:beat` timing enters the sim).
2. **Placement:** uniform inside a 240 px margin, drawn from the registered `culture-morsel` channel at (world seed,
   morsel serial). The spec's "near the source that played it" has no source in the dish yet (open question 5).
3. **Fat in integer ticks (1/240 fat).** At 120 Hz every law is integer-exact: 2 ticks a step for a body, 1 for a
   carried limb, 2,400 a morsel. No float drift; boundary tests are exact.
4. **"Carried limb" = a LOOTED limb.** The born limbs are the body's and its 1 fat/s covers them (the tasking: a looted
   limb "adds 0.5 fat/s"). A looted limb lost later (the soil) stops costing.
5. **Starvation clock:** fat is read after the step's upkeep; at 0 the clock counts (the step it reaches 0 is step 1),
   any step ending with fat restarts it; 600 sustained kills. An unfed citizen cast at step 0 dies at world step 6,599.
6. **Size (predation) = summed disc area (π r²) of the living parts in the table, born and carried.** What the dish's
   physics sees. A strandbeest's legs are bones, not discs, so its size is its beam and hips (~900 px²·π vs ~2,300 for
   a dish creature): beasts are prey to hungry swimmers (see the stats; open question 3).
7. **Contact = the attacker's (or looter's) HEAD disc overlapping any living part** of the other. The head is the mouth.
   One kill and one loot per citizen per swarm step, in cast order; prey/corpse in cast order.
8. **Predation feeds no fat.** The ruled food web is beats; the predator's reward is the corpse's limbs (open question 1).
   No hunting drive was added: kills happen on contact while foraging.
9. **The hunger pull is the ecology's law, not a recipe dial.** DAVIS's recipe shape and every recipe hash are unchanged;
   with no food sensed the desire is the drives' bit for bit (open question 2).
10. **Death and the corpse.** Any death (soil, starvation, predation) leaves a corpse: no muscle, no age, no gait (as 5A
    already did for soil), its parts still ordinary bodies the dish can push. Its look fades in data: the read door's
    `life.decay` rises 0 → 1 over 30 s and every part's `pose.dAlpha` is lowered by it. At exactly 30 s its last parts
    (born and carried) are gone (alive 0, soil clocks cleared). Limbs lootable until then — **while the part stands**:
    the soil still judges a corpse's parts (Phase 4's law), so on dead ground a corpse's limb can wither before 30 s,
    and a withered limb root is no longer lootable.
11. **Looting re-deals the limb.** The corpse's limb (its living chain from the root) is appended as fresh slots on the
    looter — each part its ORIGINAL radius, look (shape + tone role) and mass — laid out from the socket's host along the
    socket's angle at the overlap rule, moving with the host, joined by fresh links; the corpse's slots are retired
    (bodies and links are append-only; a link to a dead body was already skipped by the solver). The corpse's socket is
    empty after. The limb takes the looter's first FREE socket of its PLAN (plan order, plan cap) that accepts its kind —
    the moth's free socket accepts any kind the moth plan uses (wing, antenna), as ruled in 5B. A socket whose occupant
    root is gone (the soil — the only limb loss the dish has; none was invented) is free again: re-socketing.
12. **LOIS reads the worn body** (`cultureWornBody` → `cultureBodyFaults`, the plan's cap and sockets) before any attach;
    a fault there is a law broken upstream and is refused LOUDLY (thrown), never silently skipped. A table with no room
    refuses the loot quietly but counted (`lootsNoRoom`).
13. **A looted limb is worn, not driven.** It does not paddle (and a looted leg does not walk); it swings on its links
    (open question 4). Its parts appear in the layout after the born parts, each with `looted: { socket, kind, from }`.
14. **Order.** Food sense before the muscle; carried limbs rehomed with the body before the solver; after the gait:
    beats land → eating → predation → looting on the settled frame; metabolism every world step before the soil.
15. **Dormant over an uncast world** (the gait layer's precedent): no lives, no morsels, no step counted — an uncast
    world's STATE is identical to before this slice; its hash VALUE moves by the constant fold of the empty ecology's
    hash (`cultureWorldHash` always folds it). cultureCitizens g1, unmodified, proves the state against an independent
    replay (its replay world carries the same empty ecology, so the two hashes agree). *(Wording corrected in the QA
    follow-up: the first draft said "hashes exactly as before", which is false.)*

## Mutation tests — 37/37 killed (each applied alone to a clean tree, the named suite run, the file restored)

| Mutation | Killed by |
|---|---|
| morsel +10 → +9 (constant) | cultureEcology g1 |
| eating feeds a morsel less one fat | cultureEcology g2 "+10 fat, exactly" |
| body upkeep 1 tick a step (0.5 fat/s) | cultureEcology g4 |
| looted limb upkeep 2 ticks (1 fat/s) | cultureEcology g4 |
| looted limb pays no upkeep | cultureEcology g4 |
| born limbs charged as carried | cultureEcology g4 |
| starvation at > 600 (off by one) | cultureEcology g4/g5 |
| starvation span 6 s | cultureEcology g1 |
| starvation clock never resets | cultureEcology g5 |
| predation fat ≤ 30 | cultureEcology g6 "fat exactly 30: no kill" |
| predation ignores hunger | cultureEcology g6 |
| predation ratio > 1.2 | cultureEcology g6 "ratio exactly 1.2: a kill" |
| predation ignores size | cultureEcology g6 "ratio 1.19: no kill" |
| predation: the bigger dies | cultureEcology g6 |
| size counts dead parts | cultureEcology g6 |
| corpse removed at > 30 s | cultureEcology g7 |
| corpse persists 20 s | cultureEcology g1 |
| corpse never removed | cultureEcology g7 |
| loot: any kind accepted | cultureEcology g8 (moth on a dish corpse → LOIS refuses loudly) |
| loot: the ANY socket takes any kind at all | cultureEcology g8 |
| loot: occupied sockets offered | cultureEcology g8 |
| loot: cap from the life, not the plan | cultureEcology g8 |
| loot: LOIS gate skipped | cultureEcology g8 "over-plan refused loudly" |
| loot: looter's look instead of the original | cultureEcology g8 "its ORIGINAL look" |
| loot: corpse keeps its limb | cultureEcology g8 |
| loot: the dead loot | cultureEcology g8 "the dead loot nothing" |
| a silent room lands beats | cultureEcology g2 |
| morsels on the cast channel | cultureEcology g2 |
| full citizens eat | cultureEcology g2 |
| eating: first head, not nearest | cultureEcology g2 |
| sense range ⅔ | cultureEcology g3 |
| hunger pull dropped from the desire | cultureEcology g3 |
| metabolism not dormant when uncast | cultureEcology g1 (and cultureCitizens g1) |
| world hash drops the ecology | cultureEcology g9 |
| ecology hash drops fat | cultureEcology g9 |
| ecology hash drops morsel x | cultureEcology g9 |
| ecology hash drops a socket's occupant | cultureEcology g9 |

Masked survivors found and fixed during the run (the earlier slices' warning held): (a) a moth fixture placed its head
6 px short of the dish corpse, so "a moth takes no dish limb" passed for the wrong reason and two kind mutations survived
— the fixture now asserts contact first; (b) predation had a redundant hunger guard in the step as well as in the law —
the step's copy was removed so the law has one guard; (c) "cap from the life" was masked by LOIS — a test now offers a
forged socket as the only free one and expects no loot and no throw; (d) "the dead loot" survived — a test now lays one
corpse's head on another.

## Loud re-pins (each a changed law; no tolerance weakened)

1. **cultureCitizens g3** ("it lives", 3 seeds × 60 s, no room): an unfed citizen now dies inside the minute. Was:
   alive at 60 s, the soil-immune twin alive, age = the layer's step. Now: each citizen not killed by the soil died by
   the new law — starvation exactly at world step 6,599 (or earlier if it looted and paid upkeep) or predation with a
   named killer; the soil-immune twin never dies of the soil and does not outlive the minute; age = swarm steps of its
   life. Swim speed and the 3× / 1.5× comparisons unchanged. Not fed.
2. **cultureMoth g5** (10 seeds × 60 s): same change of law. Measurements (rim, reach, every part held) are taken while
   the moth lives; speed over its life; at the end every moth died by the new law (starvation on its step when it looted
   nothing). Not fed.
3. **cultureBeast g7** (20 seeds × 60 s): same; the chassis axis and walk are measured while the beast lives; speed over
   its life. Thresholds unchanged.
4. **cultureBeast g8** (the absolute pins): was four whole world hashes, room on, "slice B's to the bit". Under the new
   law the world hash folds the ecology and an audible room feeds. Now: (a) room OFF, six sheets × seeds — the swarm,
   citizens and gait hashes equal origin/main `75985b0` (computed on a pristine detached worktree), i.e. the body table,
   the citizens and the gait are main's to the bit when nothing is fed; (b) room ON — four whole world hashes re-pinned
   to this slice's values (3241583243, 1396512032, 1755287174, 548154483).
5. **cultureBeast g9** (gait never moves a body): an audible room now moves bodies through feeding. The comparison runs
   the room-on world with its morsels cleared each step (nothing sensed, nobody hungry in 10 s) — bit-identical bodies
   and cranks to the no-room world; a new assertion pins that the fed world does differ (the ecology, not the gait).
6. **cultureGait g6** (no room: the layout is the feel layer bit for bit): the read door now also carries `life`; the
   comparison strips that one key and asserts it is present. Every feel-layer key unchanged.

## Verification

- New suite `cultureEcology` 9/9. Neighbours green: cultureWorld, cultureFluid, cultureLife, cultureSwarm, cultureSolver,
  cultureFields, cultureHand, cultureSoil, cultureMotion, cultureLab, cultureTestDrive, useCultureWorld,
  cultureRoomLive, kernel/rng (+scratch), motionCore, costTiers, the culture parity and host suites; re-pinned
  cultureCitizens 10/10, cultureMoth 7/7, cultureGait 9/9, cultureBeast 9/9.
- Lint 0 errors (11 pre-existing warnings, untouched files). format:check clean. Build green.
- **Full manifest sweep** (3 parallel, 822 suites): **817 PASS / 5 FAIL**, log `sweep-culture-p6a.log` (committed), A/B
  appended. Each failure re-run alone against a pristine detached worktree at origin/main `75985b0`: **rollSafety** fails
  alone on both, identically (standing: headless Target crashed); **composite**, **accum** (rc 137 SIGKILL in the
  sweep), **livingMotion**, **resolverProbe** pass alone on both (parallel-load flakes). None touches this diff.
- **Live stage byte-identical with the gate off**, A/B against a pristine detached worktree at origin/main `75985b0`
  (the 5C probe): all 28 layout modes resolve to a real sampler, a fresh resolver per mode × 60 frames — all modes
  `3f43c59f5bc8edfd3681bf1b5bfc7d30a44e46d7f45aedeca6541df4eeb681ba`, every per-mode hash identical;
  serializeProject (cultureDish false) `9d7d6f7dd7d7f870022a337d1abf110d22516e39cf35038c2b341557497552fd`; live gait
  `ef4636852999efc078d2b99f3c0bf709cbfd57756ac38aa2f680e5073d68c6d3`; 23 motion sources, 56 cost tiers — identical on
  both, and identical to 5C's recorded values. No bus subscription with the gate off: the hook and the bridge are
  untouched (cultureRoomLive g1/g5 and useCultureWorld green, unmodified).
- **After the rebase onto `f260b74`:** every culture suite, kernel/rng and #2478's constructStagePool re-run green; lint,
  format:check and build re-run green; the gate-off probe re-run against a fresh detached worktree at `f260b74` — every
  hash identical to the values above (main's own unchanged by #2476/#2478).
- **Cost** (sandbox median, seed 7, take sheet, room on, a world step after 5 s): main 425 µs, this branch 416 µs —
  no measurable cost (noise).

## Behaviour (the gated world, the full take sheet, 20 seeds × 60 s)

| Room | Cast | Alive at 60 s | Soil | Starvation | Predation | Loots | Morsels landed / eaten / spoiled | Corpses gone |
|---|---|---|---|---|---|---|---|---|
| mid, 120 bpm | 131 | 128 | 2 | 1 | 0 | 0 | 2,380 / 1,040 / 1,042 | 1 |
| no reading (unfed) | 131 | 0 | 0 | 91 | 40 | 16 | 0 / 0 / 0 | 21 |
| low, 40 bpm, 120 s (lean) | 131 | 74 | 0 | 33 | 24 | 17 | 1,580 / 1,047 / 451 | 47 |

By plan, lean room: dish 40/57 alive (3 starved, 14 preyed), moth 34/40 (5, 1), strandbeest **0/34** (25 starved, 9
preyed). Unfed: strandbeests were 20 of the 40 predation victims. Breeding/growth are 6B, so there are no births beyond
the cast.

## For Matt — RULED (Matt, 2026-11-24)

1. RULED: **a kill gives no fat** — the food web is beats only (as built).
2. RULED: **a strandbeest's planted feet eat too** — built in the QA follow-up (below).
3. RULED: **hunger becomes a DAVIS drive, blended by breeding, in 6B** — not here; 6A keeps it as the ecology's law.
4. RULED: **morsels land uniformly** (as built).
5. RULED: **looted limbs are worn only** (as built).
6. "Carried limb = looted limb" (design call 4) stands as the coordinator's reading of the ruling.

## Open questions as first filed (all now ruled above)

1. **Does a kill feed the predator?** (a) no — the food web is beats, as ruled (built); (b) +10, like a morsel;
   (c) the prey's remaining fat. **Recommend (a)**: the limbs are the reward; feeding on kills would make predation the
   main food source in quiet rooms.
2. **Should hunger be a DAVIS recipe dial?** (a) the ecology's fixed law (built; recipes unchanged); (b) a `hunger`
   drive in the recipe — inherited and blended in 6B's breeding; re-pins every recipe and citizen hash. **Recommend (b)
   in 6B**, when recipes start blending; (a) until then.
3. **Strandbeests can't keep fed and are everyone's prey.** In a lean room all 34 starve; unfed, they are half the kills.
   (a) leave it (the ecology's verdict on a slow plodder); (b) a beast's planted feet eat too (its feet are where it
   touches the dish); (c) its size counts its leg bones (its visible size). **Recommend (b)** — it keeps the beast's
   "walks because its measurements say so" and gives it its own way to feed; (c) can follow if it is still preyed on.
4. **Does a looted limb work?** (a) worn only — it swings, never paddles or walks (built); (b) it paddles/walks like a
   born limb of its kind. **Recommend (a) for now**, (b) with growth in 6B.
5. **Where does a beat land?** (a) uniformly inside the dish (built); (b) biased toward living ground (fertility feeds
   the ecology, §5.2); (c) near a source once the dish has sources. **Recommend (a)** until the dish has sources.

## QA follow-up (one PR after the merge of the slice — it follows the slice's QA and records Matt's rulings)

1. **RULED and built — a strandbeest's planted feet eat too.** A foot is *planted* exactly when the existing stance band
   says so (`cultureBeastFeet(...).planted`, the band slice C already walks on — no new band). A planted foot eats a
   morsel within its hip disc's radius + the morsel's reach (`CULTURE_MORSEL_RADIUS`), the same +10 as a head; a swinging
   foot eats nothing. The mouths are dealt in a canonical order (`cultureMouths`: per living citizen in cast order, its
   head, then each planted foot in leg order); each morsel goes to the NEAREST mouth that reaches it, and an exact tie to
   the first in that order — the earlier citizen, a citizen's head before its feet, the earlier leg
   (`cultureMouthReaching`). A full citizen's mouths pass (one guard, in the chooser). Sensing is unchanged (the head).
2. **The hash covers every piece of new state, now proven.** cultureEcology g9 also changes morsel y and serial, a
   socket's slot and slot count, a carried part's radius, look shape and look tone, and a socket's id — each must move
   the world hash.
3. **Wording:** design call 15 (an uncast world: state identical, the hash value moves by the constant fold) and the
   corpse's "lootable throughout" (while the part stands; the soil may wither it first).
4. **Mutation tests — 46/46 killed** on the final code (the slice's 37, re-anchored where the eating code moved, plus 9):

   | Mutation | Killed by |
   |---|---|
   | feet never eat | cultureEcology g10 (its mouths: head, then each planted foot) |
   | a swinging foot eats | cultureEcology g10 |
   | a mouth tie goes to the later mouth | cultureEcology g10 "a tie: the earlier citizen" |
   | foot reach doubled | cultureEcology g10 "beyond the foot's reach" |
   | full citizens eat (the one fullness guard removed) | cultureEcology g2 |
   | eating: the first mouth, not the nearest | cultureEcology g2 |
   | ecology hash drops morsel y | cultureEcology g9 |
   | ecology hash drops socket slots | cultureEcology g9 |
   | ecology hash drops a carried part's radius | cultureEcology g9 |
   | ecology hash drops a carried part's look shape | cultureEcology g9 |
   | ecology hash drops a carried part's look tone | cultureEcology g9 |

   (While re-anchoring, the fullness guard was found twice — in the mouth list and in the chooser — which would have
   masked a mutation of either; it now stands once, in the chooser.)
5. **Behaviour, re-run (the full take sheet, 20 seeds):**

   | Room | Cast | Alive | Soil | Starved | Preyed | Loots | Morsels landed / eaten |
   |---|---|---|---|---|---|---|---|
   | mid, 120 bpm, 60 s | 131 | 128 | 2 | 0 | 1 | 0 | 2,380 / 1,061 |
   | none (unfed), 60 s | 131 | 0 | 0 | 91 | 40 | 16 | 0 / 0 (unchanged: no beats, no feet eat) |
   | low, 40 bpm, 120 s | 131 | 71 | 0 | 33 | 27 | 16 | 1,580 / 1,034 |

   Strandbeests, lean room: **2/34 alive** (was 0/34) — 24 starved (was 25), 8 preyed (was 9). Fed room: 31/34 alive,
   none starved (was 1). The feet help a little; the beast's slow, wide-turning walk still rarely puts a planted foot on a
   morsel in a lean room, and its small disc area still makes it prey. Swimmers in the lean room: dish 37/57 alive (17
   preyed), moth 32/40 — the beasts' extra eating shifts who is hungry when, so the totals move a little. Iteration
   material, not a blocker.
6. **Re-pins: none.** Every prior suite passes unmodified (cultureBeast g8's room-on pins are swimmer-only sheets, so the
   feet do not reach them; g9's fed world still differs from the unfed).
7. **Verification:** cultureEcology 10/10; every culture suite, kernel/rng green; lint 0 errors; format:check clean;
   build green; gate-off live stage byte-identical to origin/main `72ad5e3` (all modes `3f43c59f…eb681ba`,
   serializeProject `9d7d6f7d…7552fd`, live gait `ef463685…68c6d3`, 23 motion sources, 56 cost tiers).

## What 6B carries

Breeding (§3.3 — fat ≥ 60 and growth stage ≥ 2, body parts mixed as well as recipes, breeding costs fat) and with it
births beyond the cast and T3's baby preview; growth (§3.4, XP — eating, looting, surviving a lean period are natural XP
sources now that they exist as events); per-take Lab casting changes; and, RULED, hunger as a DAVIS drive blended by
breeding.
