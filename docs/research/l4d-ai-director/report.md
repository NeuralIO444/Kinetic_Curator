# The Left 4 Dead "AI Director" — Deep Technical & Design Report

**Research date:** 2026-10-08. **Basis:** index-sourced documents — Mike Booth's GDC-2009-era deck "The AI Systems of Left 4 Dead" (mirrored text; primary PDF fetch failed, see note), Valve developer commentary (L4D & L4D2, compiled from in-game commentary nodes), the community "The Director" wiki page (cross-checked against the Booth deck where they overlap), press interviews with Booth/Chet Faliszek/Doug Lombardi/Erik Johnson, and community console-variable documentation. Nothing in this report comes from live in-game observation; all live-confirmed numbers are community-documented.

## Summary

The AI Director is not an enemy AI — it is a *supervisory controller* that sits above all moment-to-moment AI and modulates **drama** rather than difficulty directly. Its core loop, stated explicitly in Booth's talk: (1) estimate a per-survivor scalar called **emotional intensity** (damage taken, near-kills, incapacitation; decays over time only when not in combat); (2) track the **max** intensity across the 4 survivors; (3) if max intensity is too high, **remove major threats** and grant a forced **Relax** period (~30–45 s); otherwise **build up** pressure with a procedurally generated population of threats. Placement is governed by the nav mesh's **flow distance** (travel distance from start safe room), **potential visibility**, and an **Active Area Set** — so the Director reasons about "ahead vs. behind the group" and "out of sight" rather than using fixed spawn points. It controls commons, specials, bosses (Tank/Witch via designer-placed Threat zones), panic/horde events, item population (and in L4D2, item *identity*), the per-player procedural **Music Director**, and (L4D2) weather, alarms, and path layout. Design intent: replayability via "structured unpredictability" (small team couldn't hand-author 20+ maps), dramatic peaks/valleys modeled on Counter-Strike's natural spiky pacing, and a fairness floor — the system *refuses* to let random streaks produce death spirals, and Booth later codified the fairness intuition as "deck of cards, not dice." Known failure modes: perceived unfairness when RNG streaks land badly, expert-level cruelty, the system reducing to "horde if you camp," and competitive players finding the spawn rotation too unreliable to be fair.

---

## 1. What the Director controls

### Enemy population (the main lever)
- **Four threat classes, frequency-tiered** (Booth deck): Wanderers (high frequency — wandering commons that attack when alerted), Mobs (medium — 20–30 enraged commons that periodically rush), Special Infected (medium — individuals with special abilities that harass), Bosses (low frequency — Tank/Witch force strategy changes), plus Weapon Caches (low) and Scavenge Items (medium: pipe bombs, Molotovs, pain pills, extra pistols). Source: Booth deck (index); URL below.
- **Commons:** Director-created cap — max **30 commons** spawned by the Director at once; it will not spawn more until that count returns to 0 (community wiki; console var `z_common_limit`). Source: https://left4dead.fandom.com/wiki/The_Director (index, read 2026-10-08).
- **Wanderers vs. mobs placement geometry** (Booth deck): Wanderers are spawned **ahead** of the team (only in nav areas at or beyond the team's flow distance — "EXIT/ENTER" rules); **75% of mobs come from behind** (areas at or behind the team's flow distance), because wanderers and specials/bosses are usually engaged ahead. Mobs are 10–30 commons, spawned behind or to the side, hunting the nearest survivor immediately. Sources: Booth deck (index); wiki (index).
- **Special Infected:** spawned at individually randomized intervals, in AAS (Active Area Set) areas not visible to any survivor, with class-specific placement — Boomers **ahead** (slow, can't chase), Smokers **above** the team. Campaign mode culls specials too far from survivors. Wiki notes limits: `z_special_spawn_interval 45`, per-type limits (`z_hunter_limit`, `z_gas_limit`, `z_exploding_limit`), total cap `z_minion_limit 3`. Specials do not spawn during Tank fights (except Versus/mutations) unless survivors flee. Sources: Booth deck (index); wiki (index); console cvars page https://left4dead.fandom.com/wiki/Console_commands (index, read 2026-10-08).
- **Punishing stillness:** if no valid mob spawn spot exists, mobs are **queued** until survivors leave the area — camping is punished with a larger mob. Also Boomer vomit triggers one horde per vomited survivor (max four). Sources: wiki (index); wiki "Tactics" page https://left4dead.fandom.com/wiki/Tactics (index).
- **Invisible housekeeping:** enemies spawn out of sight and de-spawn when survivors move out of range; the Director de-spawns idle infected to free capacity for incoming mobs (observable tell: an area suddenly empty of idle infected often means a Witch/Tank is near). Source: wiki (index).

### Boss placement (Tank / Witch)
- Designer-authored **Threat zones** (nav attribute `THREAT`, bit 14): the Director may only spawn Tanks/Witches there — same areas every run. L4D2 biases idle Witches toward unavoidable spots on the main path. Versus adds a **Flow Limit** preventing bosses too close to each other or safe zones (not present in co-op, where Tank+Witch doubles are possible); no two Tanks in a row without a break. `director_tank_bypass_max_flow_travel` — if survivors get this far past a passive Tank, it is alerted. Sources: wiki (index); Valve Developer Community navbits table https://developer.valvesoftware.com/wiki/Template:L4D_series_navbits_table (index).

### Panic / horde events and crescendos
- **Panic events:** triggered horde rushes — alarmed cars (L4D1 cars fixed; see L4D2), startled witches, Boomer vomit, or directorial whim. **`director_force_panic_event`** console command spawns a mega-mob; `director_panic_forever 1` makes it endless. Sources: wiki; console cvars page (index).
- **Crescendo events:** scripted set-pieces (loud noise/trigger) where the Director changes spawn rules — e.g., endless hordes that only stop on an event trigger. **Gauntlet crescendos** (L4D2, e.g., Dead Center bus station): instead of hold-out, players *run through* the event to a deactivation point — explicitly designed to counter corner-camping (Aaron Barber, L4D2 dev commentary). Source: L4D2 commentary compilation https://gamefaqs.gamespot.com/pc/643926-left-4-dead-2-death-toll/faqs/58357 (index).
- **"Quieting the Director":** during crescendo events, finales, and Tank fights, no common/special spawns at all (timers keep counting so they resume instantly after). Sources: wiki (index).

### Finale behavior
- Director can rewrite spawn rules per event: special spawn limit/rate (Dead Center finale), mob rate/size (Dark Carnival 4 onslaught), forced boss spawns (The Sacrifice finale's numerous Tanks). Finales summon a Tank after two hordes are defeated; the finale state cannot advance until the Tank dies; after the second Tank and rescue arrival, Tanks and hordes stream together; holding out eventually yields endless no-cooldown Tanks. Source: wiki (index).

### Item / weapon spawning
- On map load the Director populates items from pre-placed points, limiting duplicates of the same item near each other. It can swap items based on team state: low health → health kits at upcoming spawn points; pain pills in first-aid cabinets convert to **Medkits** (low health, not "black and white") or **Defibrillators** (someone about to die) — only **ahead** of the furthest point reached, governed by cvar `director_convert_pills_critical_health`; the chance drops as more players already carry kits. Some items are always static (e.g., silenced SMG at Dead Center hotel crescendo). L4D1: designers placed individual items and the Director chose *which instance* of each type to spawn. Sources: wiki (index); L4D2 commentary — Ryan Thorlakson (index).

### Procedural music (the Music Director)
- A **second, separate Director** runs client-side per player, building a unique multi-track mix from what that player has *experienced* (not their emotional state, per composer Tim Larkin — "keeping the music interesting" so players leave it on; "we keep it appropriate to each player's situation, and highly personalized"). Dead spectators hear the mix of the teammate they're watching. L4D2 added a "Bacteria" system (minimalist, adaptive) plus per-campaign regional flavor (banjo/Dixie clusters for Dead Center, slide guitar/harmonica for Hard Rain, scraping fiddle for Swamp Fever, swing-band-gone-wrong for The Parish). Each campaign has distinct tones for Build Up, Relax, and incoming attacks — music is the main readable channel for the Director's hidden state. Sources: L4D dev commentary https://left4dead.fandom.com/wiki/Developer_Commentary_(Left_4_Dead) (index); L4D2 commentary compilation (index).

---

## 2. What it measures

### The hidden scalar: Survivor "Intensity" (a.k.a. stress)
Per-survivor scalar, tracked continuously (Booth deck + wiki agree):
- **Increases:** damage taken (proportional to damage), incapacitation (immediate max), being pulled/pushed off a ledge, each nearby infected killed (inversely proportional to distance — close kills count more).
- **Decreases:** decays toward zero over time — **but does NOT decay while any infected is actively engaging that survivor**.
- **Excluded:** friendly fire and long-range sniping kills add nothing.
- **Aggregation:** the Director tracks the **max** intensity across the four survivors, not the average — the single most-stressed player drives the global pacing state. Sources: Booth deck (index); wiki (index).

### What else it reads
- **Position / flow distance:** each survivor's nav-area flow distance (travel distance from start safe room) defines "ahead vs. behind" and team ordering; used for spawn placement and for the Versus flow limit on bosses. Source: Booth deck (index).
- **Team state:** health levels (drives medkit/pill conversion), black-and-white (one-down) status, incapacitation, whether survivors are grouped in the event area (determines whether the Director "quiets" during events). Source: wiki (index).
- **Skill/performance proxies:** movement and accuracy ("If the team is functioning well as a unit and ploughing through the game, it's going to rain on your head" — Doug Lombardi, Eurogamer). Map-level: "distance equals difficulty" — the Director uses prior-map performance to pick longer vs. shorter routes in L4D2 (Faliszek). It does *not* build a persistent player model — Stray Bombay's later critique: "It knew next to nothing about the player or their experiences." Sources: https://www.eurogamer.net/fi-left4dead-pc-9?page=2 (index); https://primagames.com/news/interview-valves-chet-faliszek (index); https://www.nme.com/news/left-4-dead-veterans-reveal-ai-director-2-0-3097693 (index).
- **What it pointedly does NOT use:** no health-as-skill model, no long-term learning across sessions in L4D1/L4D2 (Faliszek later speculated about cross-session directors at Stray Bombay). 

### Difficulty as gain-scheduling
Difficulty presets act as outer-loop gains on the Director: higher difficulty increases mob spawn rate and how fast commons return during Relax (L4D2 re-populates wanderers during Relax faster at higher difficulty); L4D2 Versus pins dynamic map changes and item placement identical across team swaps for fairness. Within each preset there's "the equivalent of a volume control" (Lombardi). Sources: wiki (index); Eurogamer interview (index).

---

## 3. The pacing model

### The four-phase cycle (canonical)
1. **Build Up** — leaving the safe zone: commons/specials spawn normally, mobs at regular cadence (1–4 min intervals depending on difficulty).
2. **Peak** — max team intensity: infected spawning normally **halts**; panic events / special attacks / Tank land here.
3. **Relax** — ~**30–45 seconds** of no Wanderer/Mob/Special spawns (L4D2 lets wanderers creep back in, faster at higher difficulty). Ends early if survivors start moving. Purpose-built recovery window: heal, regroup, reassess.
4. Return to Build Up.
- Transition logic (Booth deck): estimate intensity per survivor → take max → if too high, **remove major threats for a while** → else **create an interesting population of threats**. The wiki's phase description matches: Peak when survivors at max intensity; Relax after. Experienced players can *read* the phase from music cues (unique Build Up / Relax / incoming-attack tones per campaign). Sources: Booth deck (index); wiki (index); gamestack secondary summary https://github.com/rondorkerin/gamestack/blob/HEAD/docs/research/round1-universal/U6-pacing-and-player-journey.md (index).

### When it pushes vs. when it backs off
- **Push:** intensity below ceiling + Build Up phase → populate threats per structured-unpredictability rules; team progressing fast / performing well → heavier pressure ("pour it on you"); camping → queued mobs; boomer vomit / alarm triggers → punishment hordes.
- **Back off:** max intensity at ceiling → Peak (spawning halts), then forced Relax; struggling team → Director eases pressure and gets generous with healing items; L4D2 weather gated to good performance ("If you're just barely hanging on, the Director's not going to send a storm at you to finish you off" — Faliszek).
- **Refuses coasting:** even a team doing badly at 1 HP won't get a free walk — "it would want to keep the game interesting, and not just let you walk it with 1 health point, because that's not exciting" (Faliszek on L4D1). The ideal drama target, per Babbar: the team limps into the checkpoint chased by the horde. Sources: Prima/Eurogamer Faliszek interviews (index); L4D dev commentary (Babbar node) (index).

### Documented timing values (all community/index-level, not from a Valve spec sheet)
| Value | Source |
|---|---|
| Relax duration ~30–45 s; ends early on movement | wiki (index) |
| Mob interval 1–4 min, difficulty-scaled | wiki (index) |
| `z_special_spawn_interval` default 45 s | wiki console cvars (index) |
| Director common cap `z_common_limit` default 30 | wiki console cvars (index) |
| Special cap `z_minion_limit` default 3 total | wiki console cvars (index) |

---

## 4. Implementation details

### Spatial substrate: nav mesh + flow fields
- **Navigation mesh:** "walkable space" repurposed from Counter-Strike bot pathfinding into a general spatial-reasoning substrate. Director queries include: has area A ever been seen by B? Is area X potentially visible from area Y? Give me a spot near the survivors visible to none of them. How far (travel distance) to reach area X? Source: Booth deck (index).
- **Flow distance:** travel distance from the starting safe room to each nav area; following the increasing gradient always leads to the exit. Defines the **Escape Route** (shortest start→exit path). Used as the population metric (denser ahead), and to answer "ahead or behind the survivor group." Debug: `z_show_flow_delta`. Sources: Booth deck (index); Valve Developer Community https://developer.valvesoftware.com:443/w/index.php?title=Sorting_out_navigation_flow&oldid=141919 (index).
- **Potential visibility:** areas marked `OBSCURED` (bit 12) tell the Director it can spawn there any time out of sight; `EMPTY` (bit 1) = no wanderers but specials/hordes OK — critical for proper horde spawning in custom maps. Threat zones (`THREAT`, bit 14), `NO_MOBS` (bit 13), `BATTLESTATION`/`BATTLEFIELD`/`FINALE`/`CHECKPOINT`/`ESCAPE_ROUTE`/`RESCUE_*` all steer director queries. Source: Valve navbits table (index); modding discussion https://steamcommunity.com/app/550/discussions/3/627456486197224029/?l=czech (index).
- **Active Area Set (AAS):** the moving window of nav areas near the survivors. Wanderer population is stored as a simple **count N per area**, randomly determined at map (re)start from **Escape Route length × desired density**; when an area enters the AAS, N infected are created (if possible); when it leaves, or when a pending mob needs members, wanderers are deleted and N re-banked; N is zeroed when an area becomes visible to any survivor or when the Director enters Relax. This is the actual "population table" mechanism — per-area budgets, not per-spawn dice rolls. Source: Booth deck (index).

### Tuning surface
- Designers tune via nav attributes, Threat zones, per-map event scripts, difficulty cvars, and the item-spawn entities — one code change re-populates all maps (Booth: a tweak "automatically populates all 20 of our maps, and all future maps we or our fans create"). Debug: `director_debug` (live view of the Director's "thought process"), `director_debug_scavenge_items`, `z_debug`, `z_show_flow_delta`. Sources: Booth deck (index); dev commentary (index); wiki (index).
- Fairness by construction: deck-of-cards sampling without replacement (Booth's later formulation for Demeo, describing the lesson learned) — guarantees no event can repeat 17 times in a row; versus-mode deterministic mirroring (same spawns, items, paths for both teams). Sources: https://www.pcgamer.com/left-4-dead-creator-on-the-boom-in-co-op-games-there-still-arent-enough/ (index); wiki (index).

---

## 5. Left 4 Dead 2 additions

1. **AI Director 2.0 scope expansion:** weather effects, world objects, and pathways — not just enemy counts (Engadget 2009; Valve's The Passing announcement). Source: https://www.engadget.com/2009-06-01-valve-details-left-4-dead-2-melee-combat-ai-director-2-0.html (index); https://hothardware.com/news/valve-introduces-left-4-dead-2-the-passing-dlc-new-weekly-mutations (index).
2. **Dynamic weather (Hard Rain):** torrential rain + fog + lightning + audio DSP changes, triggered randomly when doing well; obscures vision and muffles voices, forcing the team to bunch up defensively — "much like a Crescendo Event, but entirely under director control, it can happen any time, any place" (Tim Larkin, L4D2 commentary). Source: L4D2 commentary compilation (index).
3. **Dynamic pathing:** Dead Center (alarm on red cars post-crescendo; alternate mall paths — security door vs. toy store window, fixed to toy store in Versus); Dark Carnival (spawned fence forcing detour); The Parish cemetery (graves reposition to lengthen routes when doing well). Faliszek: director picks longer paths when you're ahead, short straight lines when you're behind ("distance equals difficulty"). Versus keeps all changes identical across team swaps. Sources: wiki (index); Faliszek interviews (index).
4. **Dynamic alarms:** L4D1 alarmed cars were fixed-position (memorizable); L4D2 lets the Director choose which cars in a group are alarmed, *or none* (Jason Mitchell, L4D2 commentary). Source: L4D2 commentary compilation (index).
5. **Gauntlet crescendos:** run-through events (Dead Center bus station, Coaster Rush, Parish Bridge finale) that counter corner-camping — progress only happens while moving. Source: L4D2 commentary (Aaron Barber) (index); Steam guide https://steamcommunity.com/sharedfiles/filedetails/?l=schinese&id=2274775774 (index).
6. **Item spawning upgrade:** `weapon_item_spawn` entity — Director now decides *whether* an item spawns and *what type* (L4D1 only chose which pre-typed instance spawned). Sources: Ryan Thorlakson, L4D2 commentary (index).
7. **New specials as director vocabulary:** Charger, Spitter, Jockey designed around combos that punish clumping — "the best survivor teams stick close together," so the new specials attack the optimal formation itself (Tom Leonard). Uncommon commons per campaign with mechanics (fireproof CEDA, etc.). Sources: L4D2 commentary (index).
8. **Relax no longer fully safe:** wanderers may spawn during Relax, ramping with difficulty. Source: wiki (index).

---

## 6. Design philosophy

**Why build it (Booth, dev commentary):** small team + AI strength → bet on procedural content generation; infinite replayability from clever code instead of hand-authored content. The core "shoot lots of zombies" loop was a known-fun constant, which de-risked experimenting with procedural dramatic pacing. One system change propagates to all 20 maps and all future fan maps — the Director is a **force multiplier for level design**. Source: L4D dev commentary (index).

**What experience it targets (Johnson/Eurogamer, relaying Booth's first demo):** literal on-screen "bars that measured player stress" — stress is the controlled variable, not kills or progress. 'Combat fatigue' from playtesting single-player games: doing the same thing over and over gets boring *or* too stressful and "the game feels cheap." So the Director varies amplitude — never high-amplitude events back-to-back. Source: https://www.eurogamer.net/fi-left4dead-pc (index).

**Drama over fairness-theater (Babbar, dev commentary):** the stress tracker was born from observed death spirals — random bad dice rolls wiping teams that couldn't regroup. Breaks exist for three stated reasons: battle fatigue, regroup/heal/reassess, and *contrast* — "big, exciting battles are only exciting if there are also periods of quiet, creepy tension." Ideal: "limping in and being chased by the horde" into the checkpoint. Source: L4D dev commentary (index).

**Experience-first AI (Erik Johnson, Eurogamer):** Booth's approach is "thinking about it from a player experience perspective, and not in terms of IQ level" — what the player should feel, not what would outsmart them. Source: https://www.eurogamer.net/left-4-dead-interview (index).

**Fairness as deck-not-dice (Booth, 2021 RPS/PC Gamer):** "You don't want to, behind the scenes, roll the die on individual things. You want to make a virtual deck of cards, shuffle it and deal it out… it's not possible to get the terrible thing happening 17 times in a row." Source: PC Gamer (index).

**Never boring, never free (Faliszek):** the director keeps the game interesting even when you're losing — it won't let you walk it at 1 HP "because that's not exciting"; but it also won't kick you when you're down — storms/extra punishment are reserved for when you're doing well. "The best experience is just sneaking in by the skin of your teeth." Sources: Prima/Eurogamer/Destructoid interviews (index).

**Known criticisms / failure modes:**
- **Perceived unfairness:** RNG streaks can stack specials + mob + tank simultaneously ("absolute asshole" director anecdotes); players attribute to malice what is partly independent rolls interacting (techspot forum thread (index); https://www.techspot.com/community/topics/left-4-dead-ash-hole-director.136191/).
- **Malevolent-personality reading:** Eurogamer's 2008 review notes the director "gets annoyed" when you dawdle and on Expert shows "open cruelty" (Tank at your weakest, Witch by the exit). Invisibility cuts both ways — players invent intent. Source: https://www.eurogamer.net/left-4-dead-review?page=2 (index).
- **Reduces to a camping tax:** gamecritics review argues the Director in practice "boils down to sending an additional charging horde of zombies after the player if they stay in one place for more than a minute," and that level-to-level encounters are "mind-numbingly similar" — the pacing is dynamic but the *vocabulary* is small. Source: https://gamecritics.com/daniel-weissenberger/left-4-dead-review/ (index).
- **Shallow player model:** Stray Bombay's founding critique — the original is "careful tuning and random chance," and "knew next to nothing about the player or their experiences"; their AI Director 2.0 (The Anacrusis) was motivated by adding actual player modeling. Source: NME (index).
- **Competitive unfairness:** the L4D2 special-spawn rotation is unreliable enough that the competitive community wrote a SourceMod FIFO plugin to guarantee consistent, fair SI spawn order. Source: https://github.com/aoc-gamers/l4d2-fix-spawn-order (index).
- **Weakest-link aggregation:** driving the whole game off the *max* intensity survivor can feel punishing to the other three when one player is reckless — an inherent cost of max-pooling.

---

## 7. Portable lessons (for a supervisory layer over a live generative-art performance)

1. **Control a hidden affective scalar, not the output directly.** The Director never scripts "spawn X at time T"; it estimates *intensity* and modulates probabilities/budgets. For a performance instrument: estimate a performer/audience "energy" scalar from observable events (input density, error rate, tempo drift, silence length) and let that drive gain decisions — the performer should never be able to point at a timestamp where "the AI did something."
2. **Decay only when disengaged.** Intensity doesn't decay while infected are actively engaging — disengagement is measured by absence of engagement, not wall-clock time. Port: your energy/fatigue estimate should freeze while the performer is actively driving material, and only relax during genuine lulls.
3. **Max-pool, don't average.** The most-stressed survivor sets the global state. For multi-channel or multi-performer setups, the hottest channel should dominate the supervisory response — averages wash out the moments that matter.
4. **Threat removal is as much a lever as threat addition.** The Director's most distinctive move is *taking things away* (halting spawns at Peak, forced Relax). A supervisory art layer should have "subtractive" moves — thinning layers, pulling back effects, muting stems — not just additive ones.
5. **Budgeted populations, not dice rolls.** Wanderer counts per nav area are pre-budgeted from route length × density; mobs queue. Translate: allocate per-section "intensity budgets" for the performance (e.g., N accent events per movement), dealt out like cards so nothing can cluster 17 times in a row and nothing can be absent forever.
6. **Spatialize the state (flow distance).** The Director reasons about ahead/behind/out-of-sight along a flow field. For a performance: define a "flow" coordinate for the set (position in the score/arc) and place interventions relative to it — build material *ahead* of the performer's current position, resolve consequences *behind*.
7. **Never spawn in view.** All placement is visibility-gated. Port: all supervisory moves should be masked — applied during transitions, under cover of performer-initiated changes, or in perceptual "blind spots" (e.g., during loud passages, adjust quiet-layer gains).
8. **Announce state through a dedicated channel (the Music Director).** The main Director is invisible, but its state is *readable* through the music system's phase tones. Your system needs one legible channel (a subtle visual meter, a distinct sonic motif) that tells the performer "I'm in Relax now" without exposing the machinery.
9. **Difficulty = gain scheduling on the same controller.** Don't build separate controllers per "mode"; keep one pacing loop and schedule its gains (mob rate, relax repopulation speed) by a coarse mode setting — exactly how difficulty presets scale the Director's parameters.
10. **"Distance equals difficulty."** The cheapest difficulty lever is *path length*, not event density. For performance: when energy is high, extend the arc (longer build); when fatigued, shorten the path to the next release.
11. **Refuse both death spirals and free walks.** Clamp both ends: guarantee recovery windows (no high-amplitude events back-to-back — Booth's explicit rule) *and* guarantee minimum engagement (never let it coast at 1 HP). Two-sided clamping is what makes it feel "fair" rather than merely "easy."
12. **Design the vocabulary, not the script.** L4D2's lesson: expanding the Director's *verbs* (weather, alarms, path changes, new specials that punish the optimal formation) added more variety than any tuning of spawn rates. Invest in distinct, combinable intervention types.

---

## Stealable patterns

1. **Intensity scalar** — one decaying number per channel/performer: += on load events (dense input, errors, loud passages), −= over time, frozen while engaged. The single hidden state everything else reads.
2. **Max-pool aggregation** — the hottest channel sets the global mode; no averaging away the crisis.
3. **Relax timers** — forced recovery windows (~30–45 s equivalent, scaled to medium) during which no new interventions may trigger; ends early if the performer re-engages hard.
4. **Peak halt** — when intensity hits ceiling, *stop adding* and let the current material resolve before any new supervisory action.
5. **Intensity budgets** — per-section caps on intervention counts, pre-allocated from section length × desired density; queued rather than dropped when no valid slot exists.
6. **Deck-not-dice** — sample interventions without replacement from a shuffled deck; reshuffle when exhausted. Guarantees no 17-in-a-row clustering and no permanent absence.
7. **Flow-relative placement** — index the performance on a flow coordinate (score position/arc phase); schedule builds *ahead* of the current position and resolutions *behind* it.
8. **Visibility gating** — only apply gain/structure changes in perceptual blind spots (transitions, loud passages, performer-initiated changes); never mid-gesture.
9. **Queuing as punishment** — if the performer stalls (no progression), queue pending interventions so forward motion releases them — gentle pressure to keep the arc moving.
10. **State-announce channel** — one dedicated, legible signal (visual motif / sonic cue) that broadcasts the supervisor's current phase (Build/Peak/Relax) without exposing internals — the Music Director pattern.
11. **Two-sided clamping** — hard floors and ceilings on intervention rate: never two high-amplitude events back-to-back; never a fully passive stretch beyond N seconds.
12. **Gain-scheduled modes** — one pacing loop, with coarse presets (e.g., "rehearsal / set / headline") that scale the loop's rates, caps, and relax durations instead of separate logic.

---

## Could not verify

- **Exact intensity formula/thresholds/curves.** Booth's deck states the algorithm qualitatively (proportional increases, decay, max-pooling) but no public source gives the actual numeric thresholds or the "too high" cutoff. Community cvars (`z_common_limit`, `z_minion_limit`, `z_special_spawn_interval`, `director_convert_pills_critical_health`) are documented but are caps/rates, not the intensity math. Would require decompiled server code or the original PDF's missing slides (the mirrored PDF fetch failed — see below).
- **Primary PDF.** The canonical source `https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf` and its Wayback mirror both failed to fetch in this environment (transport timeout); content above is reconstructed from the search engine's extracted text of the mirror plus corroborating secondary sources. Flagged as `index` throughout.
- **Whether L4D2's director tracks cross-map history numerically** (Faliszek says maps reconfigure "based on how you do in the previous map" — the mechanism/quantification isn't documented publicly).
- **Survivor-separation as an explicit measured variable.** Widely asserted by players (director punishes lone wolves), but no primary or wiki source documents a separation metric; the observed behavior is consistent with specials targeting stragglers via flow-distance/visibility queries rather than an explicit separation term. Treat as unconfirmed.

## Sources

- Mike Booth, "The AI Systems of Left 4 Dead" (GDC-2009-era talk deck) — mirror text: https://b5d7ac.staticwbm.com/20220525052031/https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf — read 2026-10-08 via index extract (primary fetch failed). `index`
- "The Director" — Left 4 Dead Wiki: https://left4dead.fandom.com/wiki/The_Director — read 2026-10-08. `index`
- Developer Commentary (L4D) — nodes by Mike Booth, Gautam Babbar, Vitaliy Genkin, Tim Larkin: https://left4dead.fandom.com/wiki/Developer_Commentary_(Left_4_Dead) — read 2026-10-08. `index`
- Developer Commentary (L4D2) compilation (Aaron Barber, Jason Mitchell, Ryan Thorlakson, Tim Larkin, Tom Leonard, Ted Backman, Scott Dalton): https://gamefaqs.gamespot.com/pc/643926-left-4-dead-2-death-toll/faqs/58357 — read 2026-10-08. `index`
- Console commands / director cvars: https://left4dead.fandom.com/wiki/Console_commands — read 2026-10-08. `index`
- Valve Developer Community — nav attributes table: https://developer.valvesoftware.com/wiki/Template:L4D_series_navbits_table — read 2026-10-08. `index`
- Valve Developer Community — navigation flow: https://developer.valvesoftware.com:443/w/index.php?title=Sorting_out_navigation_flow&oldid=141919 — read 2026-10-08. `index`
- Chet Faliszek interview (Prima Games): https://primagames.com/news/interview-valves-chet-faliszek — read 2026-10-08. `index`
- Chet Faliszek interview (Eurogamer): https://www.eurogamer.net/valves-chet-faliszek-interview — read 2026-10-08. `index`
- Chet Faliszek interview (Destructoid): https://www.destructoid.com/interview-left-4-dead-2-writer-chet-faliszek/ — read 2026-10-08. `index`
- Faliszek/Voll on long-horizon directors (PCGamesInsider): https://www.pcgamesinsider.biz/interviews-and-opinion/68711/behind-the-scenes-on-valve-and-riot-vets-chet-faliszek-and-kimberly-volls-new-co-op-centric-studio-stray-bombay/ — read 2026-10-08. `index`
- Doug Lombardi / Erik Johnson interview (Eurogamer): https://www.eurogamer.net/left-4-dead-interview and https://www.eurogamer.net/fi-left4dead-pc-9?page=2 — read 2026-10-08. `index`
- Mike Booth deck-of-cards fairness (PC Gamer): https://www.pcgamer.com/left-4-dead-creator-on-the-boom-in-co-op-games-there-still-arent-enough/ — read 2026-10-08. `index`
- Stray Bombay "AI Director 2.0" critique (NME): https://www.nme.com/news/left-4-dead-veterans-reveal-ai-director-2-0-3097693 — read 2026-10-08. `index`
- AI Director 2.0 announcement (Engadget): https://www.engadget.com/2009-06-01-valve-details-left-4-dead-2-melee-combat-ai-director-2-0.html — read 2026-10-08. `index`
- Eurogamer L4D review (director cruelty observations): https://www.eurogamer.net/left-4-dead-review?page=2 — read 2026-10-08. `index`
- gamecritics L4D review (repetition critique): https://gamecritics.com/daniel-weissenberger/left-4-dead-review/ — read 2026-10-08. `index`
- Escapist on L4D vs Back 4 Blood directors: https://www.escapistmagazine.com/back-4-blood-game-director-lacks-tension-left-4-dead-ai-director/ — read 2026-10-08. `index`
- Player "unfair director" thread: https://www.techspot.com/community/topics/left-4-dead-ash-hole-director.136191/ — read 2026-10-08. `index`
- Competitive FIFO spawn plugin (spawn-order unreliability): https://github.com/aoc-gamers/l4d2-fix-spawn-order — read 2026-10-08. `index`
- Secondary pacing summary: https://github.com/rondorkerin/gamestack/blob/HEAD/docs/research/round1-universal/U6-pacing-and-player-journey.md — read 2026-10-08. `index`

Note: per the copyright-handling rules observed during research, direct quotations are kept brief/paraphrased; the 50-word-per-work limit was respected throughout.
