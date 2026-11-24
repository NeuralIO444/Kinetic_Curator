# STAGING REPORT — CULTURE Phase 5, slice C: the Strandbeest and the test drives

Branch `feat/culture-phase5c-strandbeest`, built on origin/main `f0e7a7b` (#2469, slice B merged) and rebased onto
`e653610` (#2470, #2471 — neither touches the dish) before publishing. The last slice of
Phase 5. Behind the `cultureDish` gate; zero live-stage change. No issue owns this slice. The parent epic (1863) stays
open, the parent epic (2109) stays open, the parent umbrella (1183) stays open: the coordinator decides on each from
the acceptance table below. Nothing here is merged.

## What shipped

1. **The Strandbeest as a CULTURE body** — `engine/cultureBody.mjs` gains the third plan, `strandbeest`: a beam of
   crank hubs (the head is the front hub, two spine hubs, an accent tail) and six hips, one either side of each hub —
   ordinary discs joined by ordinary overlap-rule links, one tree, exactly the body law every plan obeys. The plan
   carries a **linkage**: six legs (one per hip, socket order; even = bank A, left; odd = bank B, right) and the bone
   looks. Sockets: six, cap 6, every one born occupied by its hip (each socket is a throw on the one crank). A
   strandbeest body carries its thirteen Jansen measure genes; LOIS's body reading refuses a set the linkage cannot
   assemble as a **stillbirth** (hard fault, never a low score), and refuses out-of-range genes, the wrong leg count,
   a linkage on a plan that has none. Swimmers assemble exactly as before (no `linkage` key at all).
2. **The beast's muscle** — NEW `engine/cultureBeast.mjs`. The legs are Jansen linkages posed in **closed form** from
   each bank's crank phase (`beastBuilder.legPoints` → `jansenSolver.solvePose`, untouched): the bars are invisible
   bones carrying looks; nothing is simulated iteratively. Locomotion **is** the stance stroke (stride × advance × the
   banks' mean rate); steering **is** differential phase (the outer bank runs ahead). The drives are the citizens' one
   registry (wander, ground, rim: SENSES → DRIVES, `cultureMotion.mjs` untouched). Planted feet read the soil: living
   ground grips, dead ground slips (35 %). Velocity only; a chassis hold keeps the frame rigid at the crank's heading.
3. **The Lab** — `engine/cultureLab.mjs`: KINETIC deals the measure genes (`kineticMeasures`: the wild type leaned
   ±6 % on a new registered channel, `culture-linkage`, so no dish/moth draw moves); DAVIS's native strandbeest recipe;
   CURATOR's take sheet casts two strandbeests after the swimmers (slots come last: every earlier slot draws as before).
4. **The citizens' table** — `engine/cultureCitizens.mjs`: a linkage citizen walks (`stepCultureBeastMuscle`) instead
   of swimming; its crank (bank phases pA, pB; rates rA, rB) is hashed with its genes. A swimmer's entry and hash bytes
   are slice B's. The debug SVG draws bones.
5. **The gait over the beast** — `engine/cultureGait.mjs`: a strandbeest wears its Canon gait through the **beast
   adapter** (slice B's `cultureTreeOf('beast')`): its bones are the gait's nodes (beam root, each leg's twelve bars),
   TASTE reads bone footprints, LOIS's veto reads bone landings. Canon style: `swiss` (taste default, flagged).
   `cultureWorld.cultureCitizenAt` returns a strandbeest's `bones` (look, place, the gait's pose per node); its discs
   ride the root.
6. **The live-audio → room bridge** — NEW `curator/cultureRoomLive.js`: the room door slice B left unfed is fed from
   the existing analysis on the bus — `audio:energy`, `audio:silenceStart/End`, `audio:input`, and the loop clock's
   tempo off `clock:beat` / `clock:bar` — the same events the live gait's QUEEN hears (`curator/gaitLive.js`). Started
   ONLY by the gate's shell (`hooks/useCultureWorld.js runCultureShell`) after its refusal line, stopped in its cleanup.
   Gate off: nothing subscribes. Junk readings (unknown levels, tempos outside the door's [30, 300]) are ignored, never
   forced into the door.
7. **The test drives, engine side** — NEW `engine/cultureTestDrive.mjs`: T1 (`cultureTestDrive`: a Lab candidate on
   the bench wearing each of its style's Canon defaults on the beat, through the same adapters and evaluator; reduced
   motion holds the rest pose; the strandbeest walks in place) and T2 (`cultureMoodMultipliers`, `cultureMoodPresets`,
   `moodGait`: DRIVE genes → bounded driver-amount multipliers, neutral exactly 1 and the gait itself). Writes nothing.
8. Three new suites in the manifest after `useCultureWorld`: `cultureBeast` (9 groups), `cultureTestDrive` (5),
   `cultureRoomLive` (5). `kernel/rng.js` registers `culture-linkage`. One-writer files untouched; package files
   untouched (node_modules symlinked).

## Design calls (coordinator-style, recorded)

1. **The legs are bones, the frame is discs.** The CULTURE body law (discs + links, one tree, overlap rests) holds the
   hubs and hips; the epic's law (closed form, no physics runtime) holds the legs. A Jansen linkage is a closed-loop
   mechanism: as solver links it would need an iterative solve (forbidden) and would not be a tree. As bones it is
   exactly the epic's S3 ruling (Matt, 2026-11-03: "the bars are invisible bones").
2. **The dish reading of the profile (the epic's open D-B1).** The linkage is a side view; the dish is seen from above
   with no gravity. Each leg's plane is laid flat beside the beam: solver +x along the heading, solver *down* outward on
   the leg's own side. The stance stroke (the Jansen ovoid's flat bottom) is the outer rim of each leg's reach; the
   planted feet plant there and stroke back. Recorded; D-B1 stays Matt's (open question 1).
3. **Steering by braking the inner bank.** The outer bank holds the base rate, the inner one slows by 2·g·|s| and never
   runs backwards. beastRoam's 1 ± g swept too wide for a bounded dish — probed: 5 of 34 beasts walked off the dish in
   a minute; with inner-bank braking, 0 of 34 over 60 s and 100 s (a hard turn is a slow, tight one: radius track/2 at
   full lock). Still differential phase and nothing else (the epic's law 4).
4. **The heading is the crank's, in closed form.** It turns only by the banks' differential through planted feet,
   never by an outside twist. The first build read the heading off the body's axis; the dish's own physics (contacts
   between a body's overlapping discs, the flock) then twisted the beast ~10° a second-and-a-half with the banks equal.
   Now the chassis hold returns the body to the crank's heading: probed, the axis stands within 0.59° on average (5°
   worst) over 10 seeds × 60 s; the suite pins mean < 2°, worst < 15° over 20 seeds.
5. **A rigid chassis, uniformly heavy.** The chassis hold (each part ¼ of the way back to its rest place per step,
   × tone, centred on the living parts so it only reshapes, never drives) and every part at the head's mass (partMass 60,
   followThrough 0). With a light tail and hips the swarm's flocking — divided by mass — pushed the frame's own parts
   apart unevenly, a net drag that stalled the walk (probed: head speed a third of the closed form).
6. **Grip.** The planted feet transmit their mean grip's share of the stroke and of the turn (1 living, 0.35 dead);
   the frame is eased toward it by min(1, tone). No foot down: nothing holds it, it coasts (a limp is a look, law 3).
7. **The recipe, read by the plan** (`CULTURE_BEAST_DIAL_READING`, every dial accounted for — the moth's precedent: one
   recipe shape, each plan's anatomy reads it). thrust = ADVANCE (share of the stroke that becomes travel; 0 walks in
   place), paddle = TURN GAIN, tone = GRIP, timing = steps per crank turn, slowInOut = the crank's ease, arcs = the
   steering lock, followThrough = the masses, squash/secondary/exaggeration = the look. **anticipation is not read** (its
   gait is its geometry; no wind-up) — said, not faked.
8. **No desire, no crank.** The base crank rate scales with the desire's strength; a stopped crank is a beast that
   stands (beastRoam's own law). The swarm's flocking over its parts still nudges it a little (probed ≤ 1/5 of a walk).
9. **Stillbirths.** KINETIC deals every set as it falls (±6 % leans the deal to ~30 % stillborn); LOIS refuses them
   with the fault named; a slot whose sixteen auditions are all stillborn is refused and recorded with the cast's
   refusals (the epic's D-B4, "stillbirth visibility", is so far: recorded, not drawn). LOIS's praise never reads the
   gait score (law 3: it never gates).
10. **No free socket on the beast** (cap 6 = its six crank throws). The moth's free socket was Matt's specific ruling;
    open question 2 asks whether the beast wants one.
11. **The gait over a beast** wears its Canon gait through the beast adapter, bones as nodes; the discs take the root's
    pose. Canon style `swiss` (tight, pulse-led, snaps out and back) — a taste default, tunable.
12. **The bridge's tempo is the loop clock's** (`clock:beat`/`clock:bar` bpm — what the stage's gait clock counts),
    not `audio:tempo` (the analysis estimate the loop clock already follows). Room inputs are live; recording them into
    a take is carried (no world rides a take yet).
13. **T3 (the baby preview) is not built.** A citizen's child is a recipe blend (§2.8) and maybe a parts mix (§3.3,
    unruled): breeding is Phase 6. The issue's own path is `creatureBreed.breedCreature` over the WetLab bank — the
    WetLab creature's, not a citizen's. Carried. Citizens carry no DRIVE genes (their drives are the recipe's), so T2's
    mood is the bench's input, neutral by default — never invented from the recipe.

## Loud re-pins (each a changed law)

1. `cultureLab.selfcheck` g1: the plan list — was `['dish', 'moth']`; now `['dish', 'moth', 'strandbeest']` (the
   strandbeest is the third plan).
2. `cultureMoth.selfcheck` g4: the take sheet — was `[['dish', 3], ['moth', 2]]`, 5 slots; now adds
   `['strandbeest', 2]`, 7 slots (two strandbeests walk in after the swimmers). Both counts moved (5 → 7).

No tolerance weakened. Every other prior suite passes unmodified (useCultureWorld's slice-B ordering pin still passes:
dish, then moth, then strandbeest). The swimmers' worlds are byte-identical to origin/main — `cultureBeast` g8 pins
four world hashes computed on a pristine detached worktree at `f0e7a7b` (dish sheet and the 5B roster, seeds 7 and 42,
1,200 steps, the room on): 2889846307, 55187148, 1880458193, 3345345550.

## Verification

- **New suites green:** cultureBeast 9/9, cultureTestDrive 5/5, cultureRoomLive 5/5.
- **Neighbours unmodified and green:** cultureMotion 6/6, cultureCitizens 10/10, cultureGait 9/9, useCultureWorld 4/4,
  cultureWorld 5/5, kernel/rng; re-pinned cultureLab 8/8, cultureMoth 7/7.
- **Mutation tests: 25/25 killed** (each applied alone to a clean tree, the named suite run, the file restored; one
  first-round survivor was an equivalent mutation — reduced motion is guarded twice — and was re-cut to remove both
  guards, then killed):

  | Mutation | Killed by |
  |---|---|
  | stillbirth fault removed | cultureBeast g2 |
  | legs laid inward (profile sign) | cultureBeast g3 |
  | planted band flipped | cultureBeast g3 |
  | inner bank may run backwards | cultureBeast g7 |
  | steering brakes the wrong bank | cultureBeast g4 |
  | no desire still cranks | cultureBeast g4 |
  | advance ignored | cultureBeast g4 |
  | turn not by the differential | cultureBeast g4 |
  | dead ground grips fully | cultureBeast g6 |
  | chassis hold removed | cultureBeast g7 |
  | hash omits pA | cultureBeast g8 |
  | hash omits the genes | cultureBeast g8 |
  | beast gait through the rig adapter | cultureBeast g8 |
  | bones carry the root pose | cultureBeast g9 |
  | KINETIC leans twice as far | cultureBeast g2 |
  | bridge subscribes before the gate | cultureRoomLive g1 |
  | bridge never stopped | cultureRoomLive g2 |
  | bridge forces any tempo | cultureRoomLive g2 |
  | a new input keeps the old energy | cultureRoomLive g2 |
  | bridge ignores silence | cultureRoomLive g2 |
  | mood neutral copies the gait | cultureTestDrive g4 |
  | mood unbounded | cultureTestDrive g4 |
  | reduced motion ignored (both guards) | cultureTestDrive g2 |
  | bench always performs | cultureTestDrive g1 |
  | bench turns the crank under reduced motion | cultureTestDrive g2 |

- **Behaviour probe (the gated world, the full take sheet):** 20 seeds × 60 s and × 100 s — 34 strandbeests (6 slots
  refused by LOIS: dead ground or crowding), 0 died, 0 left the dish; path speed 12–38 px/s (median 21; the closed
  form at the native recipe ≈ 75 px/s straight, the drives turn it a lot). Chassis axis vs heading: mean 0.59°.
- **Lint** 0 errors (11 pre-existing warnings, all in untouched files). **format:check** clean. **Build** green.
- **Full manifest sweep** (3 parallel, 820 suites): **815 PASS / 5 FAIL**, log `sweep-culture-p5c.log` (committed),
  A/B appended. Each failure re-run alone against a pristine detached worktree at origin/main `f0e7a7b`:
  - **queenDeniability — mine, fixed.** My new comments in `hooks/useCultureWorld.js` (a surface file) and
    `curator/cultureRoomLive.js` named the persona; the sweep caught it (main passes). Both reworded; re-run alone:
    15 checks passed. (The rule: QUEEN/GOVERNOR never named on a rendered surface — hooks count.)
  - fieldsWasm, swarmWasm, composite — pass alone on both (parallel-load flakes / standing environmental).
  - rollSafety — fails alone on both, identically (standing: headless `page.evaluate: Target crashed`).
- **After the rebase:** the culture suites (beast, testDrive, roomLive, useCultureWorld, lab, moth, gait, citizens,
  motion, rng) and #2471's neighbours (surfaceRegistry, queenDeniability, queenChannel, queenLean) re-run green; lint,
  format:check and build re-run green.
- **Cost (sandbox median, gate on only):** a swarm step of the gated world with the room on: 0.47 ms with the 5B
  roster, 0.69 ms with the full take sheet (+2 strandbeests, their closed-form legs, their gait over 73 bones each). The
  feel source's registered cost tier is unchanged (registries pinned equal to main at gate off; it registers lazily).
- **Live stage byte-identical with the gate off**, A/B against a pristine detached worktree at origin/main `f0e7a7b`
  (`/tmp/p5c_stage.mjs`): every one of the 28 `LAYOUT_MODES` checked to resolve to a REAL sampler (no fallback), a fresh
  resolver per mode × 60 frames; sha256 of every frame's canonical JSON — all modes
  `3f43c59f5bc8edfd3681bf1b5bfc7d30a44e46d7f45aedeca6541df4eeb681ba`, every per-mode hash identical; serializeProject
  over the default store (`cultureDish` false) `9d7d6f7dd7d7f870022a337d1abf110d22516e39cf35038c2b341557497552fd`;
  the live gait evaluator (`gaitStage.poseConstruct`, every Canon style × kind × 32 beats)
  `ef4636852999efc078d2b99f3c0bf709cbfd57756ac38aa2f680e5073d68c6d3`; registries after importing the shell hook: 23
  motion sources, 56 cost tiers — identical on both. Re-run after the rebase against a pristine detached worktree at
  `e653610`: every hash identical again (and main's own unchanged by #2470/#2471). **No audio subscription with the gate off:** cultureRoomLive g1
  (a recording bus door sees zero subscriptions for every gate value but exactly `true`; real-bus events reach no world)
  and g5 (the source: the bridge starts only after the gate's refusal, once, and stops in the cleanup).

## Acceptance — per issue, met vs carried

**The parent epic 1863 (Strandbeest).** Acceptance: "a creature stands on the dish made of stage graphics, walks because
its measurements say so, roams because its home travels, and signs its path with a curve its family shares … remove the
body and there is no motion left."
| Line | Status |
|---|---|
| stands on the dish | MET — feet plant on the soil (living grips, dead slips); the soil judges its discs |
| made of stage graphics | PARTLY — graphic, assembled, each bone and disc carries a look from the plan's vocabulary; the per-stage *dealt* asset look is RULED to the render path (#2168 ruling, 2026-11-23) → carried |
| walks because its measurements say so | MET — closed-form legs from KINETIC's genes; stride from the genes' sweep |
| roams because its home travels | MET (CULTURE form) — the frame travels only by the stance stroke; the dish's rim is its range (no leash) |
| signs its path with a curve its family shares (S5 trails & kin) | CARRIED — not built in this program |
| remove the body and there is no motion left | MET — advance 0 walks in place, a stopped crank stands (suite g4) |
| laws 1–5 (closed form; feasibility before scoring; gait score never gates; one crank, differential steering; pinned branches) | MET |
| S3 ruling (bars are invisible bones, assets attach) | MET as bones with looks; asset-pool dealing carried with the render path |
| open D-B1…D-B4 | unruled; D-B1 read as "profile laid flat" (open question 1), D-B4 recorded-not-drawn |
| beast-to-beast push (#2129 note) | MET in the world's terms — beasts collide through the solver's mass-weighted contacts |

**The parent epic 2109 (Motion Core).** Done when: "A figure can be recorded whose legs walk on a gait or linkage, whose
ornaments move on stacked kinemes or a phrase, and whose parts break up and reassemble — all through one contract,
replaying identically in a take."
| Line | Status |
|---|---|
| legs walk on a gait or linkage | MET — the strandbeest's legs on its linkage; every citizen wears gaits |
| ornaments move on stacked kinemes or a phrase | MET in the dish — the Canon gait's per-depth drivers, picked per phrase, composed over the feel (composePose) |
| parts break up and reassemble | MET — the break-up fold by the wearer's tree (bones for the beast), LOIS's veto |
| one contract | MET — Motion Core poses (culture:feel + the gait), the one drive registry |
| replaying identically in a take | PARTLY — the world is deterministic and hashed (twin worlds bit-identical); a world does not ride a take yet, and the room's live inputs are not recorded → carried (takeover / take recording) |

**The parent umbrella 1183**, as the phasing doc defines Phase 5's bar: "one world, citizens living in it, behind the
gate" — MET: the gated world casts three plans (dish creatures, moths, strandbeests) that live, feel the fields and the
hand, stand on the soil, wear gaits on the live room's beat; gate off is byte-identical. The issue's own checkboxes were
met by the ground family (#1370/#1395/#1397/#1398, per its 2026-10-16 status comment); Matt kept it open as the umbrella
for FX-as-weather, MATH-as-forces and the rift — the coordinator's call.

**2342 (T1).** MET engine-side: a candidate wears each Canon default of its style on the gait clock (beats, the default
BPM with no audio) through the adapters; reduced motion shows the rest pose; nothing writes a take, the bank or the
stage. CARRIED: the WetLab preview-card toggle, one button per gait, the e2e (review-lane UI with copy — outside this
gated, copy-free slice), and the WetLab *creature* adapter path on the bench (citizens only here).
**2343 (T2).** MET: the pure, bounded, documented mapping applied only in the test drive; selfcheck bounded,
deterministic, neutral unchanged; the previews as data. CARRIED: the mood buttons (UI).
**2344 (T3).** CARRIED entire: breeding is Phase 6 for citizens; the WetLab `breedCreature` path and its e2e go with the
WetLab UI slice.
**2331.** Its done-when fixture shipped in slice B; this slice adds a living beast wearer and the live room so the QUEEN
picks for every wearer from the stage's own audio. CARRIED: wiring creature/beast tiles on the live stage (one-writer
files; takeover).
**2332.** Its three done-when fixtures shipped in slice B; unchanged here (beasts now damped and vetoed by bone).

## What Phase 6 carries

Feeding (beats as morsels — the bridge already hears the beats), fat and upkeep, starvation, predation, corpse decay,
looting and attaching (sockets declared on all three plans; the beast's cap is 6, none free), breeding (and with it
T3's baby preview), growth, any per-take cast policy beyond the Lab's fresh cast. Outside the program: the render path
(drawing citizens and bones, the dealt look), S5 trails, take recording of the world and its room, takeover.

## Open questions (multiple choice, recommendation first)

1. **The dish reading of a Strandbeest (the epic's D-B1).** (a) the profile laid flat beside the beam, feet planting at
   the outer rim — *built, recommended*; (b) a true side view (the beast drawn in profile on a top-down dish, height as
   scale or shadow); (c) a different reading.
2. **A free socket on the beast?** (a) none — cap 6, every socket a crank throw — *built, recommended*; (b) one free
   socket on the tail (like the moth), accepting any limb, worn passively.
3. **The epic's S5 trails line.** (a) the coordinator files S5 (trails & kin) as its own issue and the epic's CULTURE
   body is judged here — *recommended*; (b) the epic stays open until S5 lands.

## Surprises

- The swarm's flocking over a citizen's *own* discs is a real force: over light parts it drags; uneven masses turned
  it into a net backward push that stalled the walk. The beast's uniform mass fixes it; swimmers are unchanged.
- Contacts between a body's own overlapping discs (the overlap rule) inject impulses every step; with a measured
  heading that twisted the beast ~9°/s with its banks equal. The closed-form heading plus the chassis hold removed it.
- A wider rim reach made things *worse* (beasts trapped by the corners); the change was reverted, the shared rim drive
  is untouched.
