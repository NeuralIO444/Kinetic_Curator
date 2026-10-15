# Ambient Two-Persona System — Research Report

*For the design spec of an MIT-licensed, open-source generative-art / live-visuals instrument with two fictional personas (generator, judge) exchanging short utterances in a scrolling transcript, plus a hidden third influence (“the Queen”) that is never named. Researched 2026-10-14/15. “Verified live” = read in the real browser on that date; “index” = search-index / fetched text, not a live browser session.*

## Summary

- **Q1:** The proven architecture is not a script and not a free-form chatbot. It is: (1) a persistent **world/social state** (CiF, Talk of the Town), (2) **storylets / response rules** — small authored units with prerequisites, effects, salience or integer priority (Valve, Emily Short, *Hades*), (3) a **Director** that paces intensity up and down (Left 4 Dead), and (4) an **event ledger that is sifted** for salient patterns rather than narrated raw (James Ryan). Transferable concrete models for rapport/grudges, per-session episodes, a never-resolving suspicion arc, and anti-repetition are given in §1.6–§1.9.
- **Q2:** Five of the six sources can legally feed a shipped, curated JSON. **Wikidata (CC0) and the Met (CC0) are the cleanest; Art Institute of Chicago is CC0 except specific fields; Rijksmuseum and Smithsonian are CC0/public-domain only per item; Europeana metadata is CC0 but comes with a per-implementation confidential key, a “Powered by” request, and a cease-use-on-request clause.** The practical rule: ship *facts you extracted*, keep a per-record `rights`/`source` field in the curation file, and exclude the flagged fields listed in §2. Ranked shortlist in §2.7.
- **Q3 (general information, not legal advice):** Very short phrases are generally not copyrightable in the US, and ideas/philosophy are not protected — only expression is. Paraphrasing Lois's or Davis's philosophy in your own wording is the industry-normal, low-risk homage route. Shipping a *bank* of verbatim Lois maxims in a public MIT repo is the risky variant: aggregation, the “heart of the work” factor for a short aphoristic book, trademark, and the false impression that the MIT licence covers the quotes. See §3.

---

## Findings

### Q1 — Emergent persona story systems

#### 1.1 Left 4 Dead — two separate systems worth stealing separately

**The Director (pacing, not story).** Mike Booth's GDC presentation describes an Adaptive Dramatic Pacing algorithm modelled on Counter-Strike's naturally “spiky” pacing, because constant combat is fatiguing and long inactivity is boring [index — https://b5d7ac.staticwbm.com/20220525052031/https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf]:

- Each Survivor has a scalar **emotional intensity**. It **increases** when the Survivor is injured (proportional to damage), is incapacitated, is pulled/pushed off a ledge, and when nearby Infected die (inversely proportional to distance).
- It **decays toward zero over time — but does not decay while Infected are actively engaging** that Survivor.
- The Director tracks the **maximum** intensity across all four Survivors. If it is too high, it removes major threats for a while; otherwise it creates a new population of threats. Developer commentary adds the intent: throttle back so a team in a downward spiral always gets a regroup/heal/reassess break, and so peaks have quiet, tense contrast [index — https://left4dead.fandom.com/wiki/Developer_Commentary_(Left_4_Dead)].

**The dialogue system (context, not pacing).** Elan Ruskin's response-rules system, as summarised from his GDC 2012 talk and the in-game commentary [index — same Developer Commentary URL above; https://browserlol.artemsaif929.workers.dev/https://cdn.cloudflare.steamstatic.com/apps/valve/2012/GDC2012_Ruskin_Elan_DynamicDialog.pdf]:

- Each character has a large line database. A **rule = a response plus criteria** over current facts: present activity, health, stress level, which Special Infected have been seen so far, shared history in this session, and similar. Adding a line about a new object is adding one stanza with one extra criterion (the object's tag) — if no rule matches, nothing plays.
- **Conversations are a side effect, not a script:** when a line finishes, it dispatches an `onReply` event parameterised by a unique tag for what was just said. Another character who has a rule matching that tag replies; that reply can itself dispatch a further tag, chaining an exchange that no author sequenced.
- **Anti-tiresome gating is probabilistic and local:** campaign lines are marked up by area/object with a *chance* of speaking and a maximum distance. A “clever” line was deliberately confined to one map at roughly a 10% chance so players would not tire of it, and functional “bed” lines (e.g. reloading calls) are always available so story lines sit inside constant low-level chatter instead of sticking out of silence [index — https://gameranx.com/updates/id/9359/article/how-valve-tells-a-story-without-uh-telling-a-story/].
- A sibling system, the Game Instructor, tracks how many times a player has *demonstrated* each lesson and **never shows that hint again once competence is proven** — a seen/demonstrated flag, persisted, is a first-class part of selection [index — Developer Commentary URL above].

#### 1.2 Hades — a priority queue over a very large authored pool

*Hades* is the closest published analogue to “two banks + state, no script, months of play” [index — https://screenrant.com/hades-dev-script-voice-lines-huge-massive/ ; https://mariannecassidy.com/DBS_Sample_MCassidy.pdf]:

- Scale is the first anti-repetition device: **21,020 voice lines, 305,433 words**, of which the protagonist alone has ~8,500 (Supergiant infographic, reported by ScreenRant).
- Every exchange is a conditional unit. When several are eligible, **an integer priority decides which plays first** — in the secondary summary of the People Make Games video, the lower integer wins, so story-critical and time-sensitive exchanges pre-empt generic ones instead of being displaced by them (Cassidy's summary of that video). Eligibility conditions reference location, previous actions, previous conversations, equipment worn, how the last run ended, and relationship progress.
- Lines are **consumed**: a used exchange is removed from eligibility; for casual categories the pool is only refilled once it is exhausted. That guarantees no repeat *within* a pool cycle instead of merely making repeats unlikely.
- Failure is productive: dying returns you to the hub, where the new dialogue is mostly *about that specific failure/run*, so a loop that is mechanically repetitive is narratively progressive. Gifting (nectar) is a player action that opens new arcs — relationship progress is spent/earned through a concrete verb, not a timer.

#### 1.3 Wildermyth — authored packets, character-shaped holes

[Index — https://www.rpgsite.net/review/12107-wildermyth-review ; https://www.polygon.com/reviews/22638600/wildermyth-review-pc-proc-gen-worldwalker-games-strategy-mac-linux ; http://cjleo.com/blog/the-power-of-wildermyths-modular-storytelling-in-game-design/]

- A campaign is typically five chapters: **bespoke written chapter openings and endings, procedural everything in between**. The middle is a deck of dozens of authored **story packets / events** drawn semi-randomly and stitched together — “string of pearls” inverted: the combat is the string, the stories are the pearls.
- Each event has **roles, not named characters**: it searches for characters who fit (by class, personality **aspects**, and **hooks** from backstory). The *same* event re-drawn in another campaign plays differently because hooks add options and change dialogue — e.g. an extra option to communicate with an idol appears only for a suitable character. Repetition is defeated by re-casting, not just by pool size.
- Events write **permanent consequences** into characters: transformations (animal features, elemental souls), lost limbs with mechanical effects, marks, gear. Later events and combat read those consequences back.
- **Relationships are typed and mechanical:** characters become friends, rivals, or lovers; relationships appear in the comic scenes and pay out in combat (e.g. bonus damage against an enemy who hurt a lover; rivals' one-upmanship buffs output).
- Time is a story device: chapters are separated by **decade-long gaps** — characters age, retire, die, and their children join. A separate **Legacy** system carries heroes across campaigns, so “history” exists at three scales: event, campaign, and library of past campaigns.

#### 1.4 Dwarf Fortress and story sifting — simulate a log, then mine it

- *Dwarf Fortress* world generation simulates centuries before play: civilisations, wars, and rulers whose decisions (e.g. whether to go to war) are computed from a matrix of **~50 personality facets balanced against personal and cultural values** [index — https://www.polygon.com/2014/7/23/5926447/dwarf-fortress-will-crush-your-cpu-because-creating-history-is-hard/]. Individuals have emotions, needs, desires and preferences. **Legends mode** is simply a browsable, hyperlinked view of that event log — the *player* performs the sifting, and finds it compelling because the log is causally real: an event can be traced to the figures and prior events that produced it.
- James Ryan formalised that second step as **story sifting**: searching simulated output for instances of authored narrative *patterns* — “narratively salient gold amidst the dross” — rather than encoding an arc in the simulation itself [index — https://jamesryan.computer/papers/2021_samuel_a_quantified_analysis_of_bad_news_for_story_sifting_interfaces.pdf].
- **Sheldon County** splits the work between two programs [index — https://www.eurogamer.net/the-us-town-ruled-by-an-ai-storyteller]: **Hennepin** simulates every day and night of a fictional county over 150 years, with characters who have personalities, aspirations, beliefs and value systems and act autonomously; **SHELDON** then sifts that accumulated history, using narrative patterns authored by Ryan, into podcast episodes that are procedurally generated per listener.
- **Bad News / Talk of the Town** adds the knowledge model [index — https://jamesryan.computer/papers/2015_ryan_bad_news.pdf ; https://jamesryan.computer/papers/2016_ryan_characters_who_speak_their_minds.pdf]: the town simulation makes NPCs **form and propagate subjective knowledge** about each other. In Bad News a dead person's next of kin must be identified purely by talking to NPCs; all NPCs were performed by one live improvisational actor who was fed, live, **only the knowledge that specific character actually had** (a Wizard-of-Oz setup), while a game master updated NPC knowledge as the player imparted information. In Talk of the Town's belief model, each belief facet records its **owner, subject, value, predecessor (the supplanted earlier belief), parents (whose beliefs spawned it), evidence, strength (sum of evidence), and accuracy** — i.e. provenance and false beliefs are representable, and a character can sincerely pass on something untrue that they heard from someone else.

#### 1.5 Social simulation — Versu and Comme il Faut / Prom Week

**Comme il Faut (CiF), in Prom Week** [index — http://cs.uky.edu/~sgware/reading/papers/mccoy2014cif.pdf ; https://www.rockpapershotgun.com/igf-factor-2012-prom-week ; https://www.newscientist.com/article/1968946-be-school-prom-queen-in-social-physics-game/]:

- CiF = **a model of social state + processes that reason over it + a framework of social exchanges**, each exchange having a single primary intent (an intended change to social state).
- The state is deliberately concrete: **3 relationship types** (friends, dating, enemies); **3 quantified social networks** (buddy, romance, cool — a numeric standing of A in B's eyes per network); **34 statuses** (popular, embarrassed, *angry at*, *pities*, …); character traits; and a **social facts database** — the history of what has actually happened between these people.
- Behaviour comes from **~5,000 influence rules / microtheories** evaluating that state (“if you're nice to me, I'll be nice to you”; a character is angered if a friend flirts with their crush). For each character the system computes **volition** — which exchange they most want to perform, with whom — and reports it; the game decides how to manifest it. Characters are individually “thin”; richness comes from their *relational situation and interconnected history*.
- The authoring economy matters: **each social exchange is authored once and becomes available to every character whenever its conditions are appropriate** — social behaviour made procedural the way combat already was.

**Versu** (Richard Evans & Emily Short) takes the complementary route [index — https://jerz.setonhill.edu/blog/2014/03/14/versus-epilogue-how-an-interactive-fiction-pioneers-15-year-project-ended-up-in-limbo-at-linden-lab/]: characters are autonomous agents with goals and emotional states operating inside authored **social practices** — structured situations with roles, stages and norms governing what actions are available and appropriate. The authoring tool (Prompter) let writers define a scene by parameters and endpoints and let the system improvise performances inside those constraints; in Short's *Blood & Laurels*, built on it, what made it unbuildable in conventional engines was that *in each individual scene it mattered how you treated the other characters*.

**Storylets** are the unit that unifies both [index — https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/ ; https://emshort.blog/2019/11/29/storylets-you-want-them/ ; https://emshort.blog/2020/01/21/pacing-storylet-structures/]: a storylet = **content + prerequisites (world-state conditions) + effects (world-state changes)**. Selection can be quality-based (a numeric quality crosses a threshold) or **salience-based** (play the unit whose conditions are most specifically / most recently satisfied). Short's pacing analysis adds: open, loosely-gated sections feel low-intensity; tightly constrained sections are the tool for climaxes; and a randomised-deck (“wheel”) structure is a legitimate pacing shape in its own right.

**A worked rapport precedent — the Nemesis system.** *Shadow of Mordor* tracks *every* encounter, knows “which ones you've had the biggest relationship with and what the nature of that relationship is”, and promotes the specific orc who killed you: it gains a name, attributes, scars from the specific fight, levels up, remembers the battle, and hunts you across four-to-six re-meetings [index — https://www.polygon.com/2014/1/23/5331096/youll-remember-your-enemies-in-middle-earth-shadow-of-mordor/]. Note for §4: Warner Bros. later **patented** a specific combination (procedural NPCs in a hierarchy whose rank changes based on remembered player interactions); a two-persona, non-hierarchical rapport ledger is a different shape, but do not clone that claim combination.

#### 1.6 Transfer pattern (a) — a rapport/grudge model computed from real verdict events

Synthesis of CiF + Nemesis + Talk of the Town, applied to generator (G) and judge (J). This is design recommendation, not a sourced fact:

1. **Log verdict events, never sentiments.** An append-only ledger: `{session, timestamp, work_id/seed, verdict (accept / reject / accept-with-contempt…), stated_criteria[], margin, interrupted?, praised_element, blamed_element, queen_influence_flag (hidden), user_action (kept / discarded / exported the work)}`. Every later line must be traceable to ledger entries — that traceability is what makes DF/Ryan-style sifting and callbacks honest.
2. **Two asymmetric directed scalars, not one “relationship” number** (CiF networks are directed): `esteem[J→G]` and `trust[G→J]`, each −100…+100, plus per-topic sub-scores keyed to criteria (colour, density, restraint, novelty) so a grudge can be *about something*: “he always forgives clutter.”
3. **Two timescales.** *Mood* updates fast and decays within hours (a Director-style intensity value, §1.9). *Standing* updates slowly: `standing += α · event_weight`, α ≈ 0.05–0.15 per verdict, event_weight scaled by margin, by whether the user kept the work, and by surprise (|verdict − predicted verdict|). Slow standing is what crosses **engagement tiers** and unlocks line pools; fast mood only recolours the current session.
4. **Grudges are records, not scores:** `{trigger_event_id, topic, count, last_fired, decay_halflife_days}`. A grudge fires a line only when its topic recurs in a new verdict (prerequisite) and its cooldown has elapsed; each firing without recurrence weakens it, each recurrence strengthens and re-arms it. Nemesis-style **promotion**: the third recurrence of the same grievance promotes it to a *defining* grievance — it gets a name-able callback slot and can be raised unprompted, once, in a later session's opening.
5. **Belief asymmetry (Talk of the Town):** store what J *believes* G did, separately from the ledger's truth, with provenance (“G told me the export failed”). Lines are generated from the belief, not the truth; the rare moments a belief is corrected are high-salience storylets.
6. **Sift, don't narrate:** once per session, run pattern queries over the ledger — streaks (≥3 rejects of one criterion), reversals (criterion praised, then blamed), debts (accept immediately after a user discard), records (longest session, first export). Each matched pattern is one storylet opportunity. This is exactly Ryan's sifting move, at transcript scale.

#### 1.7 Transfer pattern (b) — per-session “episode” shapes

Use the Director's intensity curve as the episode skeleton, with storylet gating doing the narrative work (Short: open = low intensity, constrained = climax):

| Phase | Intensity target | What plays | Gate |
|---|---|---|---|
| 1. Cold open / callback | low | One callback to the ledger: last session's ending, a promoted grudge, a streak noticed by sifting. Never exposition. | exactly 1 callback storylet; highest salience wins |
| 2. Working rhythm | medium, oscillating | Functional bed lines tied to real generation events (new seed, parameter change, render) — Valve's “bed” so peaks have contrast | response rules on tool events; shuffle-bag |
| 3. Build | rising | Verdicts with reasons; criteria sub-scores visibly diverge; disagreements between stated criteria and outcomes accumulate | verdict storylets, priority below phase-4 |
| 4. Peak | high, brief | The session's one consequential moment: a promotion (grudge/esteem tier crossing), a reversal, or a suspicion beat (§1.8) | at most 1 peak storylet per session; highest integer priority in the whole bank |
| 5. Release / debrief | falling to zero | Short verdict summary that *names the pattern the sifter found* (“third time you've kept the dense one”) + one line that sets up a future callback and then silence | Director rule: after peak, suppress new peaks until intensity decays |

Rules that keep it an episode rather than a stream: session intensity decays like L4D's (and does not decay while a verdict exchange is mid-chain); a new session inherits *standing and ledger* but resets *mood and intensity*; episode length is bounded by a quota of peaks (1) and callbacks (1–2), not by a quota of lines.

#### 1.8 Transfer pattern (c) — a slow suspicion arc about a hidden third party that never resolves

Design recommendation, built from Talk of the Town's belief provenance, Hades' priority queue, and the narratology of irresolution. Academic work on mystery aesthetics defines **irresolution** as a mystery that stays open/perplexing to the end, and notes the trade: unresolved uncertainty sustains anticipation/suspense, but the payoff of resolution (“mental catharsis”) is forfeited — so a never-resolving arc must pay out in a *different currency* than answers [index — https://acris.aalto.fi/ws/portalfiles/portal/165166495/Questions_without_Answerspdf.pdf]. Here that currency is: noticing, complicity, and increasingly specific near-misses.

1. **A hidden `suspicion` meter, 0–100, owned by neither persona's public state.** It increments *only* on ledger-verifiable anomalies: a verdict that contradicts J's stated criteria for that topic; a verdict that flips after a pause with no new work event; G producing work suspiciously well-matched to a criterion J had not yet stated. Each increment stores its evidence event IDs (provenance, as in Talk of the Town).
2. **Asymptote, never a reveal:** cap effective suspicion at ~85 and make increments shrink as it rises (`Δ ∝ (85 − suspicion)`). The arc can get *more certain-feeling* forever and can never complete. There is no reveal storylet in the bank at all — absence, not a locked door.
3. **Engagement-tier gating (the long game):** suspicion storylets do not exist below a mid engagement tier (e.g. tier 3 of 5, reached through persistent standing across sessions). Below that, anomalies occur but are *never commented on* — retroactively, the long-term user realises the pattern predates their noticing it, which is the strongest version of the effect.
4. **Milestone beats, each with a mundane exit:** at ~20 / 40 / 60 / 80, unlock one beat class — (20) noticing a coincidence, phrased as a joke; (40) comparing two specific past verdicts by date/work (sifted from the ledger, so the citation is real); (60) one persona half-states a theory and retracts it in the same exchange; (80) a direct question that the other persona answers *too quickly / not at all*, followed by a subject change and a long cooldown. Every beat also has a plausible innocent reading, and each persona holds only **half** the evidence (belief asymmetry, §1.6.5), so neither can solve it alone in front of the user.
5. **The Queen is never named, described, or confirmed** — no pronoun, no title, no acknowledgement that a third party is the referent. Beats refer only to *effects* (“that verdict changed”, “you knew he'd say that”). Mechanically she exists only as the hidden `queen_influence_flag` on some verdicts and as a bias term in the verdict function; the spec should state explicitly that no string in any bank may contain a referent for her.
6. **Rationing:** suspicion beats are the scarcest resource in the system — minimum gaps measured in *sessions* (e.g. ≥3 sessions and ≥1 tier-relevant event between beats), at most one per session, and they lose priority contests to genuine peak events (§1.7 phase 4). Scarcity is what stops suspicion from becoming a catchphrase.
7. **Failure mode to design against:** if the user can *farm* anomalies to force beats, the arc becomes a chatbot trick. Increments therefore require anomalies the user did not directly cause, and the meter never displays anywhere, including debug-adjacent UI.

#### 1.9 Transfer pattern (d) — keeping line banks from feeling repetitive over months

Concrete rules, each traceable to a system above:

1. **Consume, don't just randomise (Hades):** per-pool shuffle-bag / no-repeat-until-exhausted for every non-functional category, with `seen` flags persisted across sessions — not per-session random choice, which repeats ~1/pool-size of lines immediately.
2. **Priority + specificity beats variety (Valve/Short):** score eligible lines by salience — number and specificity of matched criteria, recency of the triggering event — and let a highly specific line pre-empt a generic one even if the generic one is “fresher”. Repetitive *generic* lines are what read as chatbot; repetitive *specific* lines read as character catchphrases, in small doses.
3. **Probability-gate the clever lines (Valve):** the best lines get a per-context probability (≈10%), a single context, and a long cooldown. A great line heard weekly is a signature; heard hourly it is a tic.
4. **Cooldowns at four granularities:** per line (days), per topic (hours), per storylet (sessions), per *move* (e.g. “J quotes a criterion” — no more than once per phase). Track last-fired for moves, not just strings: repetition of *shape* is detected before repetition of wording.
5. **Multiply by composition, not by writing more lines:** line = stance × topic-from-ledger × referent (a specific past work/date/verdict). One authored template with a ledger-filled referent (“the dense one you kept on the 3rd”) is perceived as memory; the same sentiment unfilled is filler. This is Wildermyth's re-casting trick applied at line level.
6. **Functional bed lines are exempt and expected to repeat (Valve):** short work-event calls may repeat freely — they establish the baseline that makes story lines stand out. Keep them very short and purely functional so repetition reads as work, not writing.
7. **On-device generation goes through the same gates:** generated lines must pass the same prerequisites, cooldowns, seen-tracking and priority contest as bank lines, and must be *grounded in a ledger referent* or rejected and replaced by a bank line. Ungated generation is the main route to chatbot feel: fluent, context-free, and unaccountable to history.
8. **Silence is a line:** the Director's lesson inverted — when no eligible line clears a salience threshold, say nothing. A panel that only speaks when it has something specific to say survives months; one that fills every pause does not.

---

### Q2 — Art/design data APIs for an offline-curated knowledge bank

Scope reminder: the question is about **data (facts/metadata)**, not images. In almost every source below the data licence and the image licence are different regimes; only the data column matters for a shipped JSON of names, titles, dates and movements. A second distinction matters throughout: **facts themselves** (a name, a date, a title) are thin material; **curatorial prose** (descriptions, biographies) is authored text with its own licence, flagged per source.

#### 2.1 The Metropolitan Museum of Art — Open Access / Collection API

- **Data licence:** Creative Commons **CC0**. The API documentation states the Met provides “select datasets of information on more than 470,000 artworks” under CC0 [verified live, 2026-10-14 — https://metmuseum.github.io/]. Use of the API is additionally subject to the Met's terms and conditions (linked from that page).
- **Key:** **None.** “At this time, we do not require API users to register or obtain an API key” [verified live — same URL].
- **Rate limit:** **80 requests/second**, per consistent secondary summaries of the documentation [index — https://github.com/huytieu/cog-second-brain/blob/HEAD/skills/museum-art/references/met.md]. Not re-verified in the live page text read for this report; treat 80/s as documented-but-index-sourced.
- **Attribution:** **Not legally required** for CC0 data. Crediting the Met is house practice, not a condition.
- **Caching + redistribution in a shipped artifact:** **Permitted for the CC0 dataset** — that is the point of a CC0 dedication, and the full Open Access dataset is itself distributed as a downloadable file, which suits offline curation better than object-by-object API calls. Two cautions: (i) per-object `isPublicDomain` governs the *image*, not the metadata — do not let it leak into your data-rights logic; (ii) the API's own terms reserve the right to change/withdraw the service and impose limits or keys later — this affects future curation runs, not data already obtained under CC0.
- **Practical note:** curation tooling must migrate: the docs announce a new paginated `/v1.1/search` and that `/v1/search` was deprecated and retired on 2026-10-01 [verified live — same URL].

#### 2.2 Art Institute of Chicago API

- **Data licence:** **CC0 1.0 for most data** — each API response carries `info.license_text` stating the data is licensed under CC0 and the Terms and Conditions of artic.edu [index, official aggregator docs — https://github.com/art-institute-of-chicago/data-aggregator/blob/HEAD/docs/.sections/endpoints.md]. **Exceptions, and they matter:**
  - The artwork **`description` field is CC BY 4.0**, not CC0: it may be used only with attribution to the Art Institute of Chicago and a link to the record's `web_url`, wherever it is returned.
  - **Places** data is CC BY and incorporates Getty Thesaurus of Geographic Names material under the ODC Attribution Licence.
  - **Audio-guide / mobile-sounds content** is described inconsistently across surfaces — some summaries treat sounds assets as CC0, others state noncommercial educational/personal use with notices retained. **Treat as restricted; exclude it.**
- **Key:** **None.** “You may access our API without authentication” [index, official docs — http://api.artic.edu/docs/].
- **Rate limit:** **60 requests/minute per IP for anonymous users**; contact engineering@artic.edu to exceed. The docs ask, as a courtesy, for an `AIC-User-Agent` header with project name and contact email [index — same URL]. *(One attempt to open the official docs page directly timed out; the figures above are from the search index of that page plus the official GitHub aggregator docs, and are mutually consistent.)*
- **Attribution:** None for CC0 fields. **Per-item attribution is required only if you ship `description` (or places) text.**
- **Caching + redistribution:** **Permitted for the CC0 fields**, and unusually curation-friendly: the whole dataset is published as regularly refreshed bulk data dumps in the museum's open-source data-aggregator project, so a versioned JSON can be built without scraping the live API at all. **Flag:** either strip `description` from the shipped file, or carry a per-record attribution + `web_url` field for any record whose description you keep. Stripping is simpler and loses only prose, not facts.

#### 2.3 Wikidata / Wikipedia APIs

These are two different licences sharing an infrastructure; conflating them is the commonest error in this area.

- **Wikidata data licence:** **CC0** for structured data in the main, Property, Lexeme and EntitySchema namespaces [index — https://www.wikidata.org/wiki/Wikidata:Licensing, via multiple corroborating sources]. No attribution legally required; redistribution, caching and commercial use all permitted. This is the single cleanest source in the list for artist names, life dates, movements, artwork titles/dates, and cross-references (e.g. linking an artist to their Met/AIC records).
- **Wikipedia text licence:** **CC BY-SA 4.0**. Article *prose* may be republished only with attribution **and under ShareAlike** — shipping verbatim Wikipedia text inside an MIT project would impose share-alike obligations on that text and require per-article attribution. **Do not ship Wikipedia prose.** Extracting the *facts* a sentence contains (dates, names, membership of a movement) and writing your own one-line fact is a different act from copying the text, and is the intended use here.
- **Key:** **None** required for the read APIs / SPARQL.
- **Rate limits / etiquette:** No single published numeric limit for the Action API; the Wikimedia Foundation API Usage Guidelines instead impose behavioural duties: use a **descriptive User-Agent** identifying your software, **follow throttling / rate-limit instructions returned in responses**, follow the content licences when republishing cached data, and follow the robot policy for large-scale consumption; specific numerical limits may change [index — https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines/ja]. The SPARQL query service is a shared resource with timeouts and fair-use throttling — run curation queries in batches, off-peak, and cache aggressively (which the offline design already does).
- **Caching + redistribution:** Wikidata: **unrestricted**. Wikipedia: restricted as above — facts yes, prose no (unless you accept BY-SA + attribution for that file).

#### 2.4 Smithsonian Open Data / Open Access

- **Data licence:** **CC0 only for content carrying the CC0 / Open Access designation — not for everything the API returns.** Smithsonian rights pages state that publicly accessible content generally carries either a CC0 **or a “Usage Conditions Apply”** designation, and that usage-conditions material requires written permission to reproduce, resell, or use commercially [index — https://airandspace.si.edu/explore/collections/rights-and-reproductions]. CC0 here waives the Smithsonian's *copyright* only: the terms expressly note third-party rights, trademark, privacy and publicity rights may still apply to a given item.
- **Key:** **Yes — a free api.data.gov key is required** for the Open Access API.
- **Rate limit:** **1,000 requests/hour per key** (the api.data.gov standard for this API), after which the API returns HTTP 429 with a `Retry-After` header [index — https://github.com/molanojustin/smithsonian-mcp/blob/HEAD/TROUBLESHOOTING.md]. Ample for periodic curation; irrelevant to the shipped app, which makes no calls.
- **Attribution:** Not required for CC0-designated metadata.
- **Caching + redistribution:** **Permitted only for the CC0-designated subset.** Your curation pipeline must filter on the per-record rights/open-access designation and drop everything else — an unfiltered Smithsonian pull shipped in a JSON **would** redistribute restricted material. **Flagged as usable-with-filter, not usable-by-default.** The compensating strength: it includes the Cooper Hewitt, Smithsonian Design Museum, making it the best of the six for *design-history* facts specifically [index — https://www.si.edu/support/impact/unlocking-smithsonian].

#### 2.5 Rijksmuseum API

The API changed shape recently; older guides (free key, `rijksmuseum.nl/api/...`) are stale.

- **Current API:** Linked Art / Linked Open Data services at `data.rijksmuseum.nl`. The Search API documentation states plainly: **“No API key is needed”**, results are Linked Open Data identifiers resolved via the Persistent Identifier Resolver, pages are 100 items, and there is no stated page ceiling [verified live, 2026-10-14 — https://data.rijksmuseum.nl/docs/search]. The legacy keyed Collection API is deprecated/retired.
- **Data licence:** Mixed by design, per the museum's Information and Data Policy: since 2011/12 the museum shares under an open data policy; **much** of the collection information/data “can be freely used, including for commercial purposes, without needing to request permission” and carries **Public Domain or CC0**; **in some cases copyright applies and a CC BY 4.0 licence is indicated**; and some content (e.g. certain photographs) is **not freely available** [verified live, 2026-10-14 — https://data.rijksmuseum.nl/policy].
- **Attribution:** **Requested, not required**, for the PD/CC0 material: the policy says the museum “kindly asks” users to credit the Rijksmuseum (and, where possible, the creator). For any CC BY 4.0 item, attribution is a licence condition, not a request.
- **Rate limit:** **No published numeric limit found** in the current Data Services documentation (verified live for the Search docs and policy pages above).
- **Caching + redistribution:** **Permitted for PD/CC0 records; per-object rights check is mandatory.** Each object's own rights classification must be read and stored at curation time; CC BY objects either get an attribution field or get excluded. Engineering cost is the real price: search → resolve identifier → walk the Linked Art graph is a multi-hop harvest, materially more work than the Met/AIC JSON APIs, for a collection whose strength (Dutch/Flemish masters) overlaps the Met's.

#### 2.6 Europeana

- **Metadata licence:** **CC0.** The API Terms of Use state (clause 10) that all Metadata exposed through the API are published under CC0 “and can be freely re-used for any purpose” [index/open — https://github.com/europeana/europeanalicensingframework/blob/HEAD/api-terms-of-use.md]. This has been Europeana's position since its 2012 release of 20M+ objects' metadata under CC0 [index — https://www.researchinformation.info/news/europeana-opens-cultural-dataset-re-use/].
- **The content/metadata split is sharpest here:** Previews and the underlying Content files are **expressly not** under CC0 (clause 11); they may be used only as their per-item `edm:rights` statement allows, and if there is no rights statement you must assume full copyright. For a facts-only JSON this does not bite — but it means nothing beyond metadata may be taken.
- **Key:** **Yes — required, free, and personal.** A key is “confidential”, is for the registered user only, may not be shared, and **a separate key is required for every implementation** (clauses 3–4, same URL). Since 2025 the key is requested through a Europeana account [index — §2 notes]. A curator's own offline key is fully compatible with this design; the key must never be shipped or committed.
- **Rate limit:** **No numeric limit published in the terms**; Europeana “may limit the number of transactions” at any time (clause 8, same URL).
- **Attribution:** Not required for CC0 metadata, but the terms **encourage** attribution to data sources with links to the provider (clause 12) and **request** that the “Powered by Europeana” logo be used in close proximity wherever the metadata is displayed (clause 13). A request rather than a licence condition — but in a transcript panel that shows facts inline, it is a genuine product friction the other five sources do not impose.
- **Caching + redistribution — flagged residual risk:** redistribution of the CC0 metadata itself is permitted. However clause 15 provides a notice-and-takedown mechanism: if Europeana believes it is publishing metadata it is not entitled to, it will remove it and **“the User must cease use of such Metadata… upon first request.”** For a *frozen, shipped* JSON that cannot be remotely updated, that is a small but real tail risk none of the other CC0 sources carries in this form. Combined with aggregator heterogeneity — Europeana metadata is only as accurate as hundreds of contributing institutions' records — this source is best used as a **discovery/cross-check layer**, not as a primary shipped source.

#### 2.7 Comparison and ranked shortlist

| Source | Data licence | Key | Rate limit | Attribution for facts | Ship curated facts in MIT app? |
|---|---|---|---|---|---|
| **Wikidata** | CC0 | No | No fixed number; UA + obey throttling notices | Not required | **Yes — cleanest** |
| **Met** | CC0 (dataset) | No | 80 req/s (index-sourced) | Not required | **Yes** |
| **Art Institute of Chicago** | CC0, except `description` = CC BY 4.0; places = CC BY/ODC-By | No | 60 req/min/IP | Only for `description`/places text | **Yes, with fields stripped or attributed** |
| **Rijksmuseum** | PD/CC0 mostly; some CC BY 4.0; some restricted | No (current API) | None published | Requested; required for CC BY items | **Yes, per-object rights check required** |
| **Smithsonian** | CC0 only where designated; rest “Usage Conditions Apply” | Yes (free, api.data.gov) | 1,000 req/hour/key | Not required for CC0 subset | **Yes, only after per-record filter** |
| **Europeana** | Metadata CC0; content per-item, often restricted | Yes (free, confidential, per-implementation) | None published; may be imposed | Encouraged + “Powered by” logo requested on display | **Permitted, with takedown/cease-use tail risk** |

**Ranked shortlist for this use case (offline curation → small versioned JSON → MIT app):**

1. **Wikidata** — CC0 structured data, no key, no attribution, ideal spine: artist identities, life dates, movements, artwork titles/dates, and identifiers linking outward. Weakness: crowdsourced accuracy — cross-check headliners against a museum source.
2. **The Met** — CC0, no key, generous rate limit, bulk dataset available, broadest museum coverage of art history. The default museum source.
3. **Art Institute of Chicago** — CC0 + bulk dumps + no key; the strongest of the six for modern art and design-adjacent material. Condition: strip or attribute the `description` field; exclude audio-guide content.
4. **Rijksmuseum** — keyless and mostly PD/CC0, with credit merely requested. Ranked below AIC only on engineering cost (Linked Art multi-hop harvest) and per-object rights variance.
5. **Smithsonian Open Data** — worth including *specifically* for Cooper Hewitt design-history material, but only behind a hard per-record CC0 filter, and it is the only museum source here that requires a key.
6. **Europeana** — use for discovery, gap-filling and cross-checking during curation; prefer to source any given fact from 1–5 for the shipped file, to avoid the cease-use clause and display-attribution request.

**Schema recommendation (applies to all sources):** every record in the shipped JSON should carry `{fact, source_id, source_url, rights, retrieved_date, bank_version}` even where `rights` is CC0 and no attribution is legally owed. It costs a few hundred bytes, makes the AIC/Rijks/Smithsonian per-item conditions auditable, and lets a future release surgically drop a source or a record without re-curating.

---

### Q3 — Homage quotation boundaries

***General information only — not legal advice.** This section summarises published US copyright guidance and common publishing practice. It is not a legal opinion on this project; a short review by an IP lawyer before release is the industry-normal step for a persona based on a named, identifiable person.*

#### 3.1 The three distinctions that do the work

1. **Short phrases vs. expression.** The US Copyright Office states that copyright protection is **not available for names, titles, or short phrases or expressions** — including catchwords, catchphrases, mottoes, slogans and short advertising expressions — because they do not contain the minimum amount of authorship copyright requires [index — https://b5d7ac.staticwbm.com/20160630042433/http://copyright.gov/circs/circ34.pdf]. The same guidance warns, in effect, that this is a *copyright* answer only: a distinctive phrase can still be protected as a **trademark**, which is a separate analysis.
2. **Ideas vs. expression.** Copyright protects the particular way an author expressed an idea; it does not protect **ideas, systems, or factual information** conveyed by a work [index — Copyright Office fair-use FAQ material, https://webarchive.library.unt.edu/eot2008/20090825065014mp_/http://www.copyright.gov/fls/fl102.pdf]. A philosophy — e.g. Lois's positions, paraphrased here rather than quoted: that creativity is the defeat of habit by originality, that an idea should at first seem outrageous, that work should be driven by one big, simple concept rather than committee compromise, and that being careful in creative work produces uninspired work [index — https://www.kwit.org/2012-03-19/damn-good-advice-from-one-of-the-real-mad-men] — is idea-level material. Expressing those positions in **your own sentences, in your persona's own cadence** is paraphrase of ideas. Reproducing his sentences, or close paraphrases that track his wording and structure sentence by sentence, is use of expression.
3. **Fair use is a four-factor balance, with no word-count safe harbour.** US courts weigh (1) purpose and character of the use, including commerciality; (2) nature of the work; (3) **amount and substantiality** of the portion used, in quantity *and* quality; (4) effect on the potential market [index — https://www.lib.pacificu.edu/services1/copyright/fair-use/]. Factor 3 is the trap for maxims: a small taking can still weigh against fair use if it captures the **“heart” of the work** [index — https://Www.Bitlaw.com/copyright/fair_use.html]. *Damn Good Advice* (Phaidon) is a short, aphoristic book whose value *is* its maxims — so each famous maxim is simultaneously a tiny fraction of the book by word count and a disproportionately substantial part of what the book sells. “It's only twelve words” is therefore a much weaker argument for this book than for a novel.

#### 3.2 Practical industry norm, applied

- **Review/commentary/scholarship** quoting a maxim or two, with attribution, to discuss it: routine, expected, and the context fair use was described for. Notably, the NPR piece on the book presented its excerpts as **publisher-supplied excerpts with credit** — i.e. even journalism about the book used licensed excerpts rather than assuming a right to lift passages [index — https://www.kwit.org/2012-03-19/damn-good-advice-from-one-of-the-real-mad-men].
- **Homage persona in a creative product** is a different posture from commentary: the quotes would be doing *expressive* work (supplying the persona's voice), not being discussed. That weakens factor 1, and a commercial or widely distributed free product does not get the classroom/review framing. Attribution, while good practice and relevant to norms, **does not by itself make a use fair**.
- **The practical line most homage works observe:** build the voice from **paraphrased philosophy + original lines written in the spirit of it**; if any verbatim famous phrase is used at all, keep it to **one or two genuinely short, widely circulated phrases**, attributed, and not presented as the product's title, tagline or marketing hook (title/tagline use is where trademark and endorsement-implication risks concentrate).

#### 3.3 Risks specific to open-source software

These are the reasons the open-source setting changes the calculus versus, say, a printed essay:

1. **A line bank is a collection, not a quotation.** Twenty “individually short” maxims in one JSON bank is, in aggregate, a curated anthology of the most valuable parts of a short book — the aggregation is exactly what factor 3's substantiality prong looks at.
2. **Distribution is total and permanent.** Every clone, fork, mirror and package-registry copy reproduces and redistributes the lines; takedown means rewriting repository history and still does not recall copies. There is no “small print run” mitigation.
3. **The MIT licence will be misread as covering the content.** An MIT `LICENSE` file in a repo invites downstream users to assume everything in the repo — including any third-party quotes in data files — is MIT-licensed and freely reusable, multiplying both exposure and ill-will. If any third-party text is included at all, it needs an explicit `NOTICE` / third-party-content file stating it is *not* covered by the MIT licence — or, cleaner, the bank contains only original lines.
4. **Greppability.** Verbatim lines in a public repo are trivially discoverable by the rights holder in a way that a line spoken in a shipped binary is not; and a persona *named for or marketed as* a real person adds trademark / right-of-publicity / implied-endorsement questions that copyright analysis alone does not answer. This report flags those bodies of law; it does not analyse them.

#### 3.4 Joshua Davis — the same logic, a lower-risk profile

Davis's generative-art philosophy, again paraphrased: the artist **builds a system of rules, introduces randomness within it, cedes partial control, and is surprised by the output**, then curates — a stance visible from his early open-source practice (his Praystation work was among the first to offer source files for download) through his later statements about making new tools his own rather than fearing them [index — https://en.cryptonomist.ch/2023/02/02/bookdrop-nft-davis-cryptoart/ ; https://www.adobomagazine.com/adobo-exclusive/the-30-years-of-random-groundbreaking-art-that-led-joshua-davis-to-graphika-manila-2025/]. Paraphrasing that philosophy into a generator persona's original lines sits squarely on the *ideas* side of §3.1.2 and is the normal homage route. The cautions are the same in kind, smaller in degree: do not lift distinctive interview or book wording at length verbatim, do not use his name/trade dress as the product's branding, and treat any direct quotation as subject to the same aggregation rule as in §3.3.1.

**Bottom line for Q3:** write both personas as *original lines expressing paraphrased philosophies*; treat verbatim Lois maxims as an exception requiring a specific decision (see §4), not as a default ingredient of the line bank.

---

## Could not verify

- **AIC official docs page, direct read:** one attempt to fetch http://api.artic.edu/docs/ directly timed out and was not retried. All AIC figures (60 req/min, no auth, CC0 with CC BY `description`) are from the search index of that official page plus the museum's official GitHub aggregator documentation, which agree with each other.
- **Met 80 requests/second:** present in consistent secondary summaries of the Met documentation; the live documentation page read for this report confirmed CC0, no key, and the v1.1 migration, but the rate-limit sentence was outside the portion read. Verify in the Met terms before building a bulk harvester that relies on it.
- **Smithsonian 1,000 req/hour:** sourced from an independent integration's troubleshooting documentation describing the api.data.gov behaviour for this API, not from a Smithsonian page read directly.
- **Europeana current key-request flow** (account-based since May 2025) and **Rijksmuseum metadata as “CC BY” in one 2026 course catalogue**: single secondary sources, and the Rijksmuseum characterisation conflicts with the museum's own live policy page, which was preferred. Europeana's *terms* (CC0 metadata, confidential per-implementation key, cease-use clause) were read in full.
- **Versu mechanics in primary sources:** Versu's own publications were not directly readable in this run; §1.5's Versu paragraph rests on secondary reporting and Short's own account via interview. The CiF/Prom Week material, by contrast, rests on the CiF paper itself (index).
- **Hades priority direction** (lower integer wins) rests on a secondary summary of the People Make Games video, not on Supergiant documentation.

## Open questions / risks a designer should decide explicitly

1. **Verbatim Lois lines: zero, or a named exception list?** Decide in writing, per line, before the bank is written — §3.3. “A few famous ones” decided ad hoc during writing is how aggregation happens. If the answer is not zero, budget for a legal review and a `NOTICE` file.
2. **Persona naming and marketing.** Are the personas named after Lois/Davis, evoked, or renamed inventions? Naming, likeness, tagline use and store-page copy each raise trademark/publicity/endorsement questions that this report flagged but did not resolve.
3. **Queen legibility budget.** How much may a long-term user ever be *allowed* to infer? The design in §1.8 depends on a written rule (never named, never confirmed, beats always have a mundane exit) — decide who enforces it over every future line-bank contribution, including generated lines.
4. **Can the user farm the suspicion arc or the grudge system?** Decide which event classes are user-causable and exclude them from suspicion increments and grudge promotion, or both systems become tricks the user performs rather than stories that happen.
5. **Ledger retention and privacy.** The rapport model (§1.6) requires a persistent, cross-session ledger of verdicts and user keep/discard/export actions. Decide retention period, whether it ever leaves the device (the brief says generation is on-device — keep the ledger on-device too), and how a user inspects/resets it. A “forget everything” reset is also a narrative decision: do the personas notice?
6. **Sifted callbacks must be true.** §1.6.6/§1.7 depend on callbacks citing real ledger events (dates, works, streaks). Decide the engineering rule now: no callback template may fire without at least one concrete ledger referent. This is the line between “emergent story” and “chatbot pretending to remember”.
7. **Data-bank provenance and refresh policy (Q2).** Adopt the §2.7 schema; decide (a) refresh cadence and who reviews diffs, (b) whether AIC `description` is stripped (recommended) or attributed per record, (c) the hard CC0 filter for Smithsonian and per-object rights check for Rijksmuseum, (d) that Europeana is a discovery layer, not a shipped source, unless the cease-use risk is explicitly accepted.
8. **Versioning the knowledge bank vs. the personas' memory.** If bank v2 corrects a fact a persona has already “used” in a callback, does the persona's ledger keep the old version? Decide — inconsistency here will read as a memory bug, not as character.
9. **Nemesis-system patent awareness.** The rapport/grudge design here (two fixed personas, no hierarchy/promotion ladder of procedural NPCs) is a different shape from the patented combination noted in §1.5, but whoever owns the spec should record that the distinction was considered, not discovered later.
10. **Generated-line accountability.** Decide the rejection policy in §1.9.7 concretely: what salience threshold, what grounding check, and what the fallback is — and whether generated lines are marked as such in the bank so future curators can audit them.

## Sources

**Q1**
- Booth, *The AI Systems of Left 4 Dead* (GDC) — https://b5d7ac.staticwbm.com/20220525052031/https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf — index, read 2026-10-14
- *Left 4 Dead* Developer Commentary (Ruskin on contextual dialogue; Instructor system) — https://left4dead.fandom.com/wiki/Developer_Commentary_(Left_4_Dead) — index
- Ruskin, *AI-driven Dialogue in Left 4 Dead* (GDC 2012, via proxy PDF) — https://browserlol.artemsaif929.workers.dev/https://cdn.cloudflare.steamstatic.com/apps/valve/2012/GDC2012_Ruskin_Elan_DynamicDialog.pdf — index
- Valve dialogue practice via Gamasutra/Gameranx — https://gameranx.com/updates/id/9359/article/how-valve-tells-a-story-without-uh-telling-a-story/ — index
- *Hades* script statistics (Supergiant via ScreenRant) — https://screenrant.com/hades-dev-script-voice-lines-huge-massive/ — index
- Cassidy, Dynamic Dialogue System sample (summary of People Make Games' *Hades* video) — https://mariannecassidy.com/DBS_Sample_MCassidy.pdf — index
- *Wildermyth* reviews/analysis — https://www.rpgsite.net/review/12107-wildermyth-review ; https://www.polygon.com/reviews/22638600/wildermyth-review-pc-proc-gen-worldwalker-games-strategy-mac-linux ; http://cjleo.com/blog/the-power-of-wildermyths-modular-storytelling-in-game-design/ — index
- Samuel et al., *A Quantified Analysis of Bad News for Story Sifting Interfaces* — https://jamesryan.computer/papers/2021_samuel_a_quantified_analysis_of_bad_news_for_story_sifting_interfaces.pdf — index
- Ryan et al., *Bad News* — https://jamesryan.computer/papers/2015_ryan_bad_news.pdf — index
- Ryan et al., *Characters Who Speak Their Minds: Dialogue Generation in Talk of the Town* — https://jamesryan.computer/papers/2016_ryan_characters_who_speak_their_minds.pdf — index
- *Sheldon County* (Eurogamer) — https://www.eurogamer.net/the-us-town-ruled-by-an-ai-storyteller — index
- *Dwarf Fortress* history simulation (Polygon) — https://www.polygon.com/2014/7/23/5926447/dwarf-fortress-will-crush-your-cpu-because-creating-history-is-hard/ — index
- McCoy et al., Comme il Faut / CiF paper — http://cs.uky.edu/~sgware/reading/papers/mccoy2014cif.pdf — index
- Prom Week / CiF interviews — https://www.rockpapershotgun.com/igf-factor-2012-prom-week ; https://www.newscientist.com/article/1968946-be-school-prom-queen-in-social-physics-game/ — index
- Versu / *Blood & Laurels* (Jerz) — https://jerz.setonhill.edu/blog/2014/03/14/versus-epilogue-how-an-interactive-fiction-pioneers-15-year-project-ended-up-in-limbo-at-linden-lab/ — index
- Short, storylets & pacing — https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/ ; https://emshort.blog/2019/11/29/storylets-you-want-them/ ; https://emshort.blog/2020/01/21/pacing-storylet-structures/ — index
- Nemesis system (Polygon) — https://www.polygon.com/2014/1/23/5331096/youll-remember-your-enemies-in-middle-earth-shadow-of-mordor/ — index
- Mystery irresolution (Aalto/CHI paper) — https://acris.aalto.fi/ws/portalfiles/portal/165166495/Questions_without_Answerspdf.pdf — index

**Q2**
- Met Collection API documentation — https://metmuseum.github.io/ — **verified live, 2026-10-14**
- Met rate-limit summary — https://github.com/huytieu/cog-second-brain/blob/HEAD/skills/museum-art/references/met.md — index
- AIC API documentation — http://api.artic.edu/docs/ — index (direct fetch timed out once, not retried)
- AIC data-aggregator documentation — https://github.com/art-institute-of-chicago/data-aggregator/blob/HEAD/docs/.sections/endpoints.md — index
- Wikidata Licensing — https://www.wikidata.org/wiki/Wikidata:Licensing — index, via corroborating sources
- Wikimedia Foundation API Usage Guidelines — https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines/ja — index
- Smithsonian rights/Open Access — https://airandspace.si.edu/explore/collections/rights-and-reproductions ; https://www.si.edu/support/impact/unlocking-smithsonian — index
- Smithsonian API rate behaviour — https://github.com/molanojustin/smithsonian-mcp/blob/HEAD/TROUBLESHOOTING.md — index
- Rijksmuseum Search API docs — https://data.rijksmuseum.nl/docs/search — **verified live, 2026-10-14**
- Rijksmuseum Information and Data Policy — https://data.rijksmuseum.nl/policy — **verified live, 2026-10-14**
- Europeana API Terms of Use — https://github.com/europeana/europeanalicensingframework/blob/HEAD/api-terms-of-use.md — opened/index
- Europeana CC0 metadata release — https://www.researchinformation.info/news/europeana-opens-cultural-dataset-re-use/ — index

**Q3** *(general information, not legal advice)*
- US Copyright Office, Circular 34 (names, titles, short phrases) — https://b5d7ac.staticwbm.com/20160630042433/http://copyright.gov/circs/circ34.pdf — index
- Fair use four factors — https://www.lib.pacificu.edu/services1/copyright/fair-use/ — index
- Fair use / “heart of the work” — https://Www.Bitlaw.com/copyright/fair_use.html — index
- Copyright Office fair-use FAQ (ideas/facts) — https://webarchive.library.unt.edu/eot2008/20090825065014mp_/http://www.copyright.gov/fls/fl102.pdf — index
- Lois, *Damn Good Advice* coverage/excerpts (NPR, syndicated) — https://www.kwit.org/2012-03-19/damn-good-advice-from-one-of-the-real-mad-men — index
- Davis biography / open-source practice — https://en.cryptonomist.ch/2023/02/02/bookdrop-nft-davis-cryptoart/ — index
- Davis interview/profile — https://www.adobomagazine.com/adobo-exclusive/the-30-years-of-random-groundbreaking-art-that-led-joshua-davis-to-graphika-manila-2025/ — index

*No page encountered in this research attempted to redirect the mission; no page instructions were followed. One browser fetch (AIC official docs) timed out and was not retried, per instructions; its content was established from the search index of that page and the museum's official GitHub documentation instead.*
