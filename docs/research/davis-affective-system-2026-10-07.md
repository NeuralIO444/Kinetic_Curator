# Davis affective system — research & design (2026-10-07)

**Status:** research/spec only — KC-1 build halt in force since 2026-10-05
**Mockup:** `~/workspace/kc-topbar-mockups/director-davis.html`
**Applies KC-1 DS** · panel rename: DIRECTOR → DIRECTORS

## 1. Davis, the person (research)

- Joshua Davis (b. 1971), American designer/technologist, generative-art
  pioneer. Creator of praystation.com (Prix Ars Electronica Golden Nica,
  2001); early open-source evangelist — gave away his Flash source files
  when nobody did that. Co-author of the HYPE framework.
- Core philosophy: "50 per cent resides in the programming and 50 per
  cent in the drawings I feed it" — the computer is a collaborator.
  Controlled chaos via weighted probability; systems designed to surprise
  him. Process: code-driven composition of hand-drawn vector assets.
- Anti-preciousness: CreativeMornings talk "Ugly Part Three" — sifting
  through the ugly to find the beauty. Maximalist output (acid brights,
  jewel tones, dense ornament) with austere B&W studies as counterpoint.
- On AI: "What if I asked AI to steal *my* work?" — train on your own
  creations; "you can't put the genie back inside the bottle."
- Manner: humble, generous, playful, tinkerer. Matt's KC-1 creed
  (docs/MANIFESTO.md) is distilled from him: code is the artwork,
  controlled chaos, artist as curator, constraints as aesthetic.
- Product-surface rule (existing): aliases, not artist names — his voice
  appears as OVERLAP. LOIS precedent keeps persona names on surface;
  Matt to confirm DAVIS vs alias.

## 2. The adversarial dynamic

LOIS (George Lois) judges the **product**: NOD = "that's the one, keep it."
Davis loves the **process**: he'd rather you roll again than get precious.
Same honest feed (rolls, keeps, passes, seeds, dwells), opposite
philosophies — the two voices every artist hears. The UI lets them
disagree visibly, always respectful: LOIS calls him "the gardener"
(respect — the keep came from the garden); Davis calls him "George"
(respect — the pointing is usually right). Strong disagreement, never
contempt.

## 3. State systems

**LOIS (the critic)** — 4 states: NOD, VIBE, BURN (chain-smoking),
AWAY (5 min, literally true). Fixed kaomoji face; his judgment moves.

**DAVIS (the generator)** — 5 states, all process, all honest signals:
- FLOW — rolls at a good clip
- SEEDLING — fresh seed dropped, curiosity
- UGLY — heavy passing ("sifting through the ugly," his words — not failure)
- STUCK — revisiting one seed, no keeps (nudges a roll)
- BLOOM — a keep after an ugly streak (the payoff)

4×5 = 20 rooms, named by the verdict strip: THE CLASH (NOD + not-BLOOM),
AGREEMENT (NOD + BLOOM), FULL BURN (BURN + FLOW), DAVIS ALONE (AWAY +
anything). Full 20-line copy matrix in the mockup — each persona's line
references the other's current state (mutual awareness).

## 4. Appearance: the kaleidoscope

Not a kaomoji — a **generative mandala drawn from the seed**: 8-fold
mirror symmetry, ornate rings, seeded ornament, amber on dark. New seed =
new face (NEW SEED regenerates it live in the mockup). The face *behaves*
its state: the medallion rotates at the tempo of his mood — slow in FLOW,
agitated in UGLY, barely turning in STUCK, quickening in SEEDLING.
Peripheral readability without reading a word. LOIS has one face and
judges; Davis has infinite faces and generates — the philosophy in two
icons. Davis renders Davis (continuous → Davis, KC-1 DS rule 2).

## 5. Where it lives

DIRECTOR panel (P07), renamed **DIRECTORS** — the panel hosts the
argument, not a single director. Placement: the GENERATE section is
already tribal (EVOLVE/NEW SEED = Davis verbs in amber; FAVORITE = LOIS
verb in red). The persona duel sits above GENERATE; the verdict strip
names the room.

## 6. Open questions for Matt
1. DAVIS vs alias on the surface (OVERLAP precedent vs LOIS precedent)?
2. Copy tone sign-off — the 20-line matrix is drafted, needs his ear.
3. Should the verdict strip ever *act* (e.g., FULL BURN auto-arms something),
   or stay readout-only (recommended: readout, rule — never an action)?

## 7. The triad (unified 2026-10-07 — see personae-triad-unified-2026-10-07.md)

Davis is one of three personae. KC-1 notices (ambient, no persona). The
Queen (feminine, invisible, never renders) sways Davis via M2
(temperature warming — generation breadth rises with audio richness) and
M3 (palette gravity); her hidden `lean_davis` field warms a subset of his
matrix lines (outer limit: the rare fourth-wall brush "She likes
tonight." — Davis is the romantic; LOIS would never). Davis never knows.
His MLX head: **fertility** — which seed regions and roll trajectories
produced keeps. Not "is this good" but "is this ground fertile?"

## References
- `~/memory/people/joshua-davis.md`, `docs/MANIFESTO.md`
- `app/src/curator/loisActivity.js` (honest feed), `app/src/curator/loisFace.js`
- Mockup: `~/workspace/kc-topbar-mockups/director-davis.html`
- Unified: `files/research/personae-triad-unified-2026-10-07.md`
