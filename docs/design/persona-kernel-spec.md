# PERSONA KERNEL — one record for every persona (spec draft)

**Status:** SPEC COMPLETE for review — 18 questions ruled with Matt, 2026-11-18. No code yet.
**Lives at:** `docs/design/persona-kernel-spec.md`, label `personas`. Epic and phase issues: see §6.
**Audit base:** origin/main, 2026-11-18 10:56.

---

## 0. Rulings so far (Matt, 2026-11-18)

| # | Ruling |
|---|---|
| R1 | One unified persona system: every persona is a `kc-persona/1` record (§2). |
| R2 | The cast is real people, in code and docs (surface display policy unchanged unless ruled otherwise, §6 Q-open): **LOIS = George Lois · DAVIS = Joshua Davis · the QUEEN = Tina Turner · the GOVERNOR = David Bowie.** The Queen and the Governor stop being "whimsical, not a real person" / "inspired by". |
| R3 | CARSON, GREIMAN, ASHWORTH stay **doctrines** (named choosers, no faces, no room-matrix axis; the 11-06 D2 ruling stands). They get kernel records of kind `doctrine`. |
| R4 | GREIMAN gets her own doctrine (today the `greiman` mode is nobody's). |
| R6 | **Surface = callsigns (Q4, 2026-11-18).** Real names live in code and docs only (lineage). On screen: LOIS → **COVER**, DAVIS → **OVERLAP**, CARSON → **BLAST**, GREIMAN → **HYBRID**, ASHWORTH → **SWISS GRIT**; QUEEN and GOVERNOR never named. Full names, likenesses and caricatures never on screen. Voice personas keep their aliases. Every surface string that says LOIS/DAVIS/CARSON/ASHWORTH today is re-pointed (sweep issue). |
| R7 | **Doctrine scope (Q5, 2026-11-18): typography and layout** — the type itself, the graphic-design layout of the type, and the page layout of the stage (where things sit in the frame). Creatures and beasts are not doctrine territory unless ruled later. |
| R8 | **Doctrines have opinions:** BLAST, HYBRID and SWISS GRIT can agree or disagree with COVER (LOIS) and OVERLAP (DAVIS). Agreement is a *relation* between calls, not a new room-matrix axis (D2 holds: the 20 rooms are not multiplied). |
| R9 | **The whole cast is a jazz band that can freestyle** (§3b). |
| R10 | **The horns join the DIRECTORS chat (Q15, 2026-11-18)** — amends R3/D2: BLAST, HYBRID and SWISS GRIT get **unique animated icon faces**, **deep backstories**, **creative briefs** and **inspiration** they pull from, and they talk in the DIRECTORS panel beside COVER and OVERLAP. Still held: no likenesses (R6); faces are drawn from each persona's own design language, never a portrait; the 20-room matrix is not multiplied (horn faces read their own measured states, not room cross-products); every line is Matt-signed before it ships; backstories of real people are sourced fact, never invented. QUEEN and GOVERNOR stay out of the chat (invisible / instruments only). |
| R5 | Audit recommendations adopted: LOIS's "cautious" becomes **restraint**; balance is split (QUEEN balances the *people*, LOIS balances the *frame*); DAVIS is wild in his *moves*, never his *marks*. |

## 1. Why (the audit, 2026-11-18)

1. LOIS is "he" in the character file and "she" in ~30 code comments.
2. "LOIS the cautious one" (10-27) contradicts his own lens rule 5, "Cautious or creative: pick one".
3. "Balance" has two owners (Queen as balance-keeper, LOIS as the negative-space/balance principle).
4. DAVIS's taste vector avoids disorder (−0.8) while his conduct is "the wild man"; nothing says how both hold.
5. Queen docs stale: gate is open (fidelity 0.595), MIDI listening already in M5.
6. Queen's sway reaches LOIS/DAVIS only — not doctrines, not the principle owners.
7. GREIMAN mode has no doctrine; GREIMAN mode is thin (word float only).
8. Doctrines treat type only, against the 11-16 one-system ruling.
9. Canon has David Carson only; no Greiman or Ashworth baselines.
10. A persona is scattered over character files, `personaTastes.js` (source outside the repo), the copy matrix, MLX heads, `doctrines.mjs`. TE and TASTE have no character files.

## 2. The record — `kc-persona/1`

One record per persona, any kind. Every slot is optional except `id`, `kind`, `identity`.

| Slot | Holds | Today it lives in |
|---|---|---|
| `id`, `kind` | `director` · `listener` · `governor` · `doctrine` · `voice` · `judge` | — |
| `identity` | real person, dates, provenance (sources checked), surface alias | `docs/characters/*.md` |
| `lens` | the rules it judges by, as review questions | `LOIS_PERSONA.md`, character files |
| `taste` | 19-feature vector + Canon style id | `personaTastes.js`, `canon/styles.js` |
| `principle` | the one graphic-design principle it owns (rhythm / contrast / negative space & balance / hierarchy) | `one-force-seam.md` |
| `lexicon` | approved lines + lingo dictionary (Matt-signed only) | copy matrix, `davis.md` |
| `states` | its readable states and the measured signal behind each | character files, `loisFace`, `davisState` |
| `power` | what it may do, step size, cap, who can veto it | scattered: `mindConduct`, `roundTable`, `doctrines.mjs`, `queenLean` |
| `head` | its MLX / Mind head and gate | `PERSONAE_TRIAD.md` §2, `tasteGate` |
| `relations` | who it sways, who sways it, what it calls the others | character files |

## 3b. The band (R9)

**Casting (Q6, ruled 2026-11-18):**

| Seat | Persona (callsign) | Job |
|---|---|---|
| Rhythm section | QUEEN (Tina Turner) — unnamed | Sets the groove, never solos, felt in STIMULI |
| Bandleader | GOVERNOR (David Bowie) — unnamed | Counts in, calls endings, cuts a solo the room can't afford |
| Lead soloist | DAVIS (Joshua Davis) — OVERLAP | Always improvising |
| Arranger | LOIS (George Lois) — COVER | The head (the one idea) and the rests |
| Horn section | CARSON — BLAST · GREIMAN — HYBRID · ASHWORTH — SWISS GRIT | Trade solos on type and layout; answer soloist and arranger |


The cast plays together on the phrase clock, like a combo: a head (the dealt stage), solos (a persona owns the next move for a phrase), trading (call and response between personas), and the head again. Freestyle = improvising inside the chart, never off the clock.

- **The chart** = the phrase clock that already exists (beats, bars, 32-bar Trio ownership, double-tap hand-back).
- **A solo** = one persona owns the next move for a phrase, one small capped step (the 11-16 principle hand-off rule).
- **Trading** = a call answered by another persona: agree (build on it), disagree (answer with a counter-move or a cut), or lay out (rest).
- **Every turn is recorded** (who played, who answered, agree/disagree) so a take replays the conversation exactly.
- The artist is always the bandleader's boss: a lock or a keep wins over any solo.

## 3c. Built to tune later (Matt, 2026-11-18)

No persona number lives in code. Every knob sits in **one tuning table** (`personas/tuning.json`, versioned, `kc-persona-tuning/1`) that the pure modules read:

- per persona: solo length (phrases), step cap, agree / disagree / lay-out odds, heat, who it answers first;
- per relation: agreement bias between any two personas (e.g. BLAST → COVER leans disagree);
- band: how often a trade happens, how many horns may answer one call, when the bandleader cuts.

Rules: tuning changes *how much*, never *what is allowed* (powers, vetoes and laws stay in the record). The table ships with today's measured values so day one is byte-identical; a selfcheck pins its shape; DEV mode exposes it for live tuning, and a project never saves it (rig, not scene).

## 3. The Archive — what personas pull from

**Ruled (Q7, 2026-11-18): text only.** One Archive folder per persona:

- lens rules and Matt-signed lines (lexicon);
- its Canon baselines;
- text descriptions of the real person's key works and methods, with sources;
- Matt's rulings that touch it;
- what Matt kept while it was playing (from the take/keep ledger).

No images of real works ship. Reference plates, if any, stay in Matt's local Loot folder, read on-device only, never bundled.

**Brains:** every persona uses **Mind** (Apple Intelligence, default) and **MegaMind** (local Ollama, opt-in), never a cloud model. Retrieval = MegaMind's embeddings slot (semantic search over the Archive); Mind gets the retrieved snippets in its context window (4,096-token budget, so retrieval is top-k small).

### 3a. The Wire — a live design feed (ruled Q8, 2026-11-18)

An opt-in, read-only RSS/Atom shelf ("the Wire") the band can read for what's happening in design now.
- Off by default; per-machine switch; nothing about the user is ever sent anywhere (fetch only).
- Fetched at launch / idle, never during a take; stored as text (headline + summary + link + date).
- A take records which Wire items were in reach, so replay never re-fetches (determinism law).
- Wire items are *context*, never rulings: a persona may quote or riff on one, never change its lens or taste because of it.
- Starter feeds (each feed's URL verified at build time; a dead feed is dropped, not faked): CreativeApplications.Net, Fonts In Use, AIGA Eye on Design, It's Nice That, Colossal, Brand New. The list is tunable (rig, per machine).

## 4. Cast

### LOIS — George Lois (1931–2022)
Kind `director` (judge). Owns **negative space & balance (of the frame)**. Temperament: **restraint** — one idea, cut the rest. Brake on DAVIS stays, renamed in docs as the cut, not caution. **Pronoun (Q3, ruled 2026-11-18): he/him everywhere, close to the real George Lois.** Fix the ~30 "she" code comments (haiku issue).

### DAVIS — Joshua Davis (b. 1971)
Kind `director` (generator). Owns **contrast**. Wild in his moves (boldness order, `mindConduct`), authored in his marks (taste vector). Surface name DAVIS vs OVERLAP: **OPEN**.

### The QUEEN — Tina Turner (1939–2023)
Kind `listener`. Owns **rhythm**. Balances the *people* (sway equilibrium between Directors).
**Ruled (Q2, 2026-11-18):** she stays **invisible** — never named, no face, deniability law (#1188) unchanged. Her presence is **felt in the audio STIMULI panel** (the meter that looks listened-to, the warmth at its edge, the lean-in on audio return) — that panel is her home surface. Tina informs *how* she sways (rhythm, command, the warm comeback after silence), and her few lines keep the short lowercase register with Tina's warmth and confidence. Birth date becomes the real one (26 Nov 1939, Sagittarius); her balance comes from Tina, not the zodiac. **Sway reach (Q9, ruled 2026-11-18):** she sways the **whole band's timing, never content** — when a horn comes in, how long a solo breathes, how tight a trade sits to the beat. Existing bounds carry over (small, capped, relaxing, 8 keeps before any lean, never surfaced).
**Her own beats (Q9, ruled):** with no live audio in, she builds the groove herself from her own library. Today's base: `curator/beatLibrary.js` (`kc-beat/1`, patterns as data, 4 lanes × 16 steps, vibes, swing) + `beatPlayer.mjs` (pure, pattern × beat position → the seven band levels, replay-exact). It plays *silently* into the band feed today. Growth: she composes new patterns (seeded mutations inside a vibe), a bigger library.
**Audible (Q10, ruled 2026-11-18):** opt-in. Synthesized live from the pattern data (drum-machine voices: kick, snare, hats, bass) — no samples, no recordings, nothing to license. Off by default; she yields the moment live audio arrives; replay-exact in a take.
**Her eyes (draft, Q11):** today only LOIS has vision, and only on MegaMind (`megamindVision.mjs`, #1527: needs a vision-badged local model; deliberate press only; verdicts steer nothing). Mind (Apple Intelligence) is text-only in this repo; whether the on-device model can take images: unknown, to verify. **Ruled (Q11, 2026-11-18):** she gets vision via MegaMind under a narrow, named exception to "vision verdicts steer nothing": at most once per phrase (tunable), never per frame; a reading may move **only her timing sway**, never content; every reading is recorded so a take replays without the model; no vision model = she doesn't look.
**The seducer's privilege (Q11 follow-up, Matt):** she is a Queen — she has access to secrets and information, in the spirit of Robert Greene's *The Art of Seduction* (the seducer reads everyone and is read by no one). Her Archive carries the book's ideas as text in our own words (no quotation beyond a short line). **Scope (Q12, Matt delegated to Claude, 2026-11-18): reads everything inside KC-1, writes nothing.** Every persona's private state (COVER's verdicts and grudges, OVERLAP's skip trace and heat, horn calls, the Governor's budget and cuts); the ledgers (keeps, passes, takes, taste versions, dwell, time of night); the Archive, the Wire, her vision readings. Nothing outside KC-1 (no files, no other apps, no mic beyond STIMULI). She never tells — no surface, no readout, no log a performer can open; it shows only as how the room leans. Pipe: one read-only `queenView()` aggregator over existing getters; selfcheck fails if it imports a setter or dispatch.
**Her mark (Q18, ruled 2026-11-18):** moves out of the top bar into STIMULI as the faint warmth at the meter's edge — one trace, where she lives, still unnamed, no tooltip.

### The GOVERNOR — David Bowie (1947–2016)
Kind `governor`. Holds the frame; sheds in order, honestly. Date follows the Q2 pattern: the real one, **8 Jan 1947, Capricorn** (the 1977 "whimsical" date and "not a real person" line retire; *Low* stays as the constraint-as-method story).

### Doctrines — CARSON · GREIMAN · ASHWORTH
Kind `doctrine`. CARSON = hot geometry (carson, shot). ASHWORTH = process-first (grit). GREIMAN = **HYBRID**, the digital pole. **Ruled (Q13, 2026-11-18):** she plays (1) bitmap type — baked coarse-pixel glyph variants; (2) layered planes — type and shapes in translucent depth layers; (3) the digital spectrum — gradient colour across a word/block; (4) the float — today's `greiman` mode (diagonal step, snap, echo) kept. **And she owns** the PATTERN **GLYPH** mode (`pattern/glyph.js`), the PATTERN **TIDES** mode (`pattern/tides.js`; today hand-picked only, #1797) and **colour** (she is the colour principle owner — a fifth principle beside rhythm/contrast/negative space/hierarchy). Stance: agrees with SWISS GRIT on the grid, pushes back on BLAST's raw chaos. User palette locks always win over her. **Palette gravity (Q14, ruled 2026-11-18):** the Queen's M3 palette gravity moves to HYBRID — her colour moves lean toward Matt's kept palettes, same caps (+0.10 mix, relaxes over a phrase, beat-confidence gate). The Queen keeps timing only (M1, M2, M4, M5 re-read as timing/inclination; M3 leaves `queenLean.mjs`). Scope beyond type: **OPEN**.

## 4b. Per-persona dossier (R10)

Every visible persona (COVER, OVERLAP, BLAST, HYBRID, SWISS GRIT) carries, in its record + Archive:
- **Backstory** — the real person's life and work, sourced (provenance block), text only.
- **Creative brief** — what it is trying to do on the KC-1 stage: objective, its principle, what it never does, its one-line big idea. Matt-signed.
- **Inspiration** — the Archive shelf it pulls from (works, methods, Canon baselines, rulings, kept frames, Wire items in reach).
- **Face** — an animated icon built from its own mark, with states read from measured signals (house rule: no timer with an opinion).
- **Voice** — its lexicon; chat lines drafted by Claude, signed by Matt.

### Faces (Q16, ruled 2026-11-18)
Home: **THE ROOM** in the DIRECTORS panel (today: LOIS tile left — dot-matrix face, name, state; the `kc-voice/1` channel centre with TASTE meter and BUS; DAVIS tile right — kaleidoscope, name, state). Matt: make every face **different enough to read at a glance, each with its name under it** (same tile grammar: face, callsign label, state word).
- **BLAST** — one letter that tears and scatters with its heat; snaps whole when it lays out.
- **HYBRID** — a bitmap square cycling the spectrum; stacks into translucent layers when she builds on someone.
- **SWISS GRIT** — a perfect grid cell that misregisters and grits when it destroys; clean and square at rest.
- Labels follow R6: `lois` → **cover**, `davis` → **overlap** (lowercase, as the tiles set them today); horns' labels in their own colours, distinct from LOIS red / DAVIS amber.
- **Layout (Q17, ruled):** a strip of three smaller tiles directly under the `kc-voice/1` channel — BLAST · HYBRID · SWISS GRIT, same tile grammar; COVER and OVERLAP stay the big flanking tiles; on phone width the strip wraps under the channel.
- Each face reads measured state only (heat, call/answer/lay-out, owning a solo).

## 5. Open questions (asked one at a time)

- ~~Q2 — the Queen as Tina Turner~~ → ruled: invisible, felt in STIMULI.
- ~~Q3 — LOIS pronoun~~ → he/him.
- ~~Governor birth date~~ → real (8 Jan 1947), by the Q2 pattern.
- ~~Q4 — Surface display policy~~ → callsigns (R6).
- ~~Q5 — Doctrines beyond type~~ → typography + layout; opinions; jazz band (R7–R9).
- ~~Q6 — Band casting~~ → ruled; built tunable (§3c).
- ~~Q7 — The Archive~~ → text only; Mind + MegaMind.
- ~~Q8 — The Wire~~ → opt-in, starter list approved.
- ~~Q9 — Queen's sway reach~~ → whole band's timing; her own beats when no audio.
- ~~Q10 — Are her beats audible?~~ → yes, opt-in, synthesized.
- ~~Q11 — Queen's vision~~ → MegaMind, once per phrase, timing only.
- ~~Q12 — Queen's read-access~~ → reads all inside KC-1, writes nothing.
- ~~Q13 — HYBRID~~ → 1–4 + owns GLYPH, TIDES, colour.
- ~~Q14 — palette gravity~~ → moved to HYBRID.
- ~~Q15 — horns on screen~~ → they join the DIRECTORS chat with faces, backstories, briefs (R10).
- ~~Q16 — Horn faces~~ → approved; distinct, named, in THE ROOM.
- ~~Q17 — horn tiles~~ → strip under the channel.
- ~~Q18 — Queen's mark~~ → into STIMULI.

No design questions remain open. Copy (every chat line, brief, face state word) is drafted by Claude and ships only on Matt's sign-off.
- GREIMAN doctrine scope.

### Pipes decided by Claude (Matt delegated the plumbing, 2026-11-18)
- **Where records live:** `app/src/personas/` — one pure module per persona (`lois.mjs`, `davis.mjs`, `queen.mjs`, `governor.mjs`, `carson.mjs`, `greiman.mjs`, `ashworth.mjs`, plus the ten voice personas), a `registry.mjs` that validates every record against `kc-persona/1`, and `tuning.json` (§3c). `personaTastes.js` and `doctrines.mjs` become readers of the registry; their exports stay so nothing downstream breaks.
- **Archive on disk:** `app/src/personas/archive/<id>/*.md` (text only), embedded by MegaMind at build/idle, never at runtime per frame.
- **TE and TASTE:** get kernel records (TE kind `voice`-backend persona of the Mind trio; TASTE kind `judge`, owns hierarchy) so the band table can address them; no new character files, no copy.
- **Doc moves:** `docs/characters/*.md` stay as the human-readable view and are regenerated from / checked against the records by selfcheck.


## 6. Build phases (one PR per issue, QA + independent review, Matt merges)

Every phase lands byte-identical by default until its own switch is on, unless the phase is docs-only.

| Phase | Slice | Label |
|---|---|---|
| P0 | **Docs cleanup:** LOIS he/him in ~30 code comments; character files re-pointed to the real cast (Tina Turner, 26 Nov 1939; David Bowie, 8 Jan 1947); LOIS "cautious" → restraint; balance split (QUEEN = people, LOIS = frame); DAVIS wild in moves, not marks; stale Queen OPEN items closed (gate open, MIDI) | `model:haiku` |
| P1 | **Kernel:** `app/src/personas/` + `kc-persona/1` schema + `registry.mjs` + selfcheck; `personaTastes.js` and `doctrines.mjs` become readers; TE and TASTE records | `model:sonnet` |
| P2 | **Tuning table:** `tuning.json` (`kc-persona-tuning/1`) with today's values, DEV-mode live tuning, never saved in a project | `model:sonnet` |
| P3 | **Callsign sweep (R6):** every surface string → COVER / OVERLAP / BLAST / HYBRID / SWISS GRIT; a selfcheck bans real names on surfaces | `model:haiku` |
| P4 | **Archive:** text shelves per persona (backstory with provenance, brief, inspiration, rulings); MegaMind embedding retrieval; Mind context injection inside the 4,096-token budget | `model:sonnet` |
| P5 | **HYBRID doctrine:** `greiman` joins `doctrines.mjs` as HYBRID; bitmap bake pack; layered planes; spectrum colour; owns PATTERN GLYPH + TIDES + colour; Queen's M3 palette gravity moves to HYBRID | `model:sonnet` |
| P6 | **Doctrines on layout:** BLAST / HYBRID / SWISS GRIT propose type-layout and page-layout moves at the render seam (records + pure functions; creatures and beasts excluded) | `model:sonnet` |
| P7 | **The band:** phrase-clock solos, trades (agree / disagree / lay out), relation biases from the tuning table, every turn recorded in the take | `model:sonnet` |
| P8 | **THE ROOM:** horn strip under the channel, three animated faces, chat lines (drafted, Matt-signed); COVER / OVERLAP labels | `model:sonnet` |
| P9 | **The Queen:** whole-band timing sway; `queenView()` read-only aggregator; beat composer + audible synth (opt-in); vision exception via MegaMind (once per phrase, timing only, recorded); mark moved into STIMULI | `model:sonnet` |
| P10 | **The Wire:** opt-in RSS shelf, fetch at launch/idle, items recorded per take, starter feeds verified | `model:sonnet` |

Order: P0 → P1 → P2 → P3, then P4–P10 by Matt's pick (recommended next after P3: P7 the band, since every later persona slice plugs into it).
