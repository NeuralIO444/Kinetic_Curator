# Persona DLC Roadmap — Kinetic_Curator

**Status:** Planning only. No code, no repo changes. Future expansion packs for the persona system, sequenced by how much new instrument plumbing each one honestly needs.

**Date:** September 19, 2026

## How to read this

The base instrument ships with 10 persona voices. Each DLC pack below is a set of 3–5 real, researched artists whose taste territory the base 10 doesn't cover. For every pack:

- **What Matt would see** — plain-language description of the look on screen.
- **New taste signals** — what this pack teaches the Curator to love or reject that it currently can't.
- **Honest instrument dependencies** — what the instrument would need built (or extended) before this pack's voices can actually express themselves. No hand-waving.
- **Curator fit** — whether the pack's signals are measurable from render parameters today (cheap: just taste weights + shaders) or need new instrumentation first.

The packs are sequenced into three waves. Wave 1 needs nothing new built. Waves 2 and 3 are gated on real instrument work, and the gates are named explicitly.

---

## What's already covered (the base 10)

Controlled chaos (Davis) · hard-edge color (Benjamin) · plotter systems (Molnár) · hypercube geometry (Mohr) · emergent software processes (Reas) · AI fluid/data imagery (Anadol) · glitch (Menkman) · material ecology (Oxman) · ornamental biology (Haeckel) · physics-based smoke (Stock)

**The gaps:** light and atmosphere as perception · human-in-the-loop reactivity · optical pattern and sacred geometry · audiovisual precision · monumental architectural form · fiber and weave · visionary maximalism · the observational nature eye.

---

## Wave 1 — ships as taste weights + shaders, no new plumbing

### Pack 1: Optics & Pattern (4 personas)

**Roster:** Bridget Riley · M.C. Escher · Eric Broug · Yayoi Kusama

**What Matt would see:** Paintings that vibrate. Waves and stripes that shimmer when you look at them (Riley), tilings where birds slowly become fish across the frame (Escher), intricate star-and-polygon geometry drawn with compass logic (Broug), and fields of dots so dense and obsessive they swallow the whole canvas (Kusama).

**New taste signals:**
- Optical vibration — high-contrast repeating bands tuned to shimmer at the edge of perception (Riley).
- Gradual metamorphosis — one motif continuously transforming into another across a tiling, figure/ground exchange (Escher).
- Compass geometry — star polygons, interlacing bands, and rotational symmetry constructed from circle intersections, never freehand (Broug).
- Engulfing repetition — a single mark (the dot, the net) repeated until it becomes environment rather than decoration (Kusama).

**Honest instrument dependencies:** Almost none. Interference-wave math, tiling engines, star-polygon generators, and instanced dot fields are all pure render math on parameters the engine already randomizes. The one governor note: Kusama-scale dot counts at the extreme end need a density ceiling so the frame budget survives — a clamp, not a feature.

**Curator fit:** Excellent today. Stripe frequency, tiling symmetry order, dot density, and contrast amplitude are all directly measurable from render parameters — the interim persona-weighted scorer can score these on day one.

---

## Wave 2 — gated on in-flight instrument work

### Pack 2: Atmosphere & Light (4 personas)

**Roster:** James Turrell · Olafur Eliasson · Dan Flavin · Carlos Cruz-Diez

**What Matt would see:** Color you walk into rather than look at. Edgeless fields of slowly shifting light with no visible source (Turrell), mist and refracted weather that changes as you move through it (Eliasson), plain fluorescent tubes whose colored glow repaints the whole room (Flavin), and color that refuses to sit still — shifting with your viewing angle and the light around it (Cruz-Diez).

**New taste signals:**
- Perceptual immersion — the frame as a light environment, edges dissolved, no object to focus on (Turrell).
- Viewer-dependent phenomena — the image is incomplete without a moving observer; color and form shift with position (Eliasson, Cruz-Diez).
- Constrained industrial light — a tiny vocabulary (tube, color, placement) producing total spatial transformation (Flavin).
- Unstable color — color treated as an event in time, not a property of a surface (Cruz-Diez).

**Honest instrument dependencies:** Two real ones. (1) **Slow temporal envelopes** — Turrell-scale transitions happen over minutes, not frames; the instrument's parameter motion is currently frame/beat-driven and would need a long-duration ramp lane. (2) **Viewer-position input** — Eliasson and Cruz-Diez need a pointer or camera hook so the image can respond to where the observer is. The existing glow pipeline covers the light-bloom side; volumetric mist blending would extend it.

**Curator fit:** Partial today. Color-field dominance and edge softness are measurable; viewer-dependence and minute-scale transitions are not — this pack gets smarter as the input and envelope lanes land.

**Gate:** Long-duration envelopes + a viewer-position input hook.

### Pack 3: Precision Machines (3 personas)

**Roster:** Ryoji Ikeda · Carsten Nicolai (Alva Noto) · Robert Henke

**What Matt would see:** The opposite of atmosphere — total control. Monochrome barcodes of data flickering in perfect sync with sound (Ikeda), reduced grids and waveforms pulsing like lab equipment (Nicolai), and laser-sharp vector lines drawing themselves in time with a beat (Henke).

**New taste signals:**
- Extreme monochrome discipline — black-and-white as a moral position, not a limitation (Ikeda).
- Audiovisual lock — every visual event synchronized to an audio event; the image is a score made visible (all three).
- Vector purity — thin, exact lines (laser logic) instead of shaded masses; no blur, no softness (Henke).
- Flicker as structure — rapid on/off alternation used compositionally, not decoratively (Nicolai).

**Honest instrument dependencies:** (1) **STIMULI SYNC** — this pack is the reason beat sync exists; it stays dull until tap-tempo/audio sync is real (that work is already spec'd to the STIMULI owner). (2) **Thin-line anti-aliased rendering** — vector-sharp lines need a line path the current soft-glow pipeline doesn't prioritize. (3) **Monochrome dither** — Ikeda-grade gradients in pure B&W want ordered dithering; the Dither idea is currently parked, and this pack is its honest use case if it's ever unparked.

**Curator fit:** Good once audio features exist. Beat-alignment, monochrome ratio, and line-vs-mass ratios become measurable the moment STIMULI ships; before that, only the monochrome discipline scores.

**Gate:** STIMULI SYNC (tap tempo / beat sync) landing in the real panel.

---

## Wave 3 — gated on major new instrument capabilities

### Pack 4: Playful Computation (4 personas)

**Roster:** John Maeda · Muriel Cooper · Zach Lieberman · Daito Manabe

**What Matt would see:** The instrument stops being a screen and starts being a conversation. Graphics that react to your voice, your hands, your movement (Maeda, Lieberman), information you can fly through like a landscape instead of reading (Cooper), bodies and drones choreographed by tracking data (Manabe).

**New taste signals:**
- Reactive computation — the work is unfinished until a human (or their movement, voice, breath) completes it (Maeda, Lieberman).
- Navigable information — typography and data as a space you move through continuously, not pages you flip (Cooper).
- Poetic imperfection in code — human wobble deliberately preserved inside computational precision (Maeda, Lieberman).
- Tracked choreography — machine vision turning bodies into control signals for light and motion (Manabe).

**Honest instrument dependencies:** The biggest of any pack. **Input-device plumbing** — microphone, camera, and expressive pointer input as first-class modulation sources — doesn't exist yet and is a project, not a tweak. This pack also leans on STIMULI audio mapping and would want gesture envelopes alongside the slow envelopes from Pack 2.

**Curator fit:** Weak until the inputs exist — reactivity can't be scored from static render parameters. This is a Wave 3 pack precisely because its taste is behavioral, not visual.

**Gate:** Input-device hooks (mic/camera/pointer as modulation sources) designed and built.

### Pack 5: Monumental Form (3 personas)

**Roster:** Michael Hansmeyer · Lebbeus Woods · Zaha Hadid

**What Matt would see:** Architecture that couldn't be drawn by hand. Columns subdivided by algorithm into millions of ornamental facets (Hansmeyer), dense dystopian line-drawings of cities under catastrophe (Woods), and buildings that flow like frozen liquid, ground becoming roof without a corner (Hadid).

**New taste signals:**
- Undrawable complexity — ornament at every scale simultaneously, from silhouette down to microscopic texture, generated by one recursive process (Hansmeyer).
- Visionary density — the drawing as an act of disobedience: dense, chaotic, answering questions no client asked (Woods).
- Continuous fluid surface — no walls, no corners; topography and structure as one unbroken parametric flow (Hadid).

**Honest instrument dependencies:** (1) A **subdivision geometry engine** — recursive facet generation at Hansmeyer scale is new geometry work. (2) **Governor cost-tier implications** — million-facet ornament is the most expensive thing any pack proposes; the shed order and cost tiers would need explicit handling so this pack degrades honestly instead of melting the frame budget. (3) Woods' line-density wants a high-density stroke renderer distinct from the vector path in Pack 3.

**Curator fit:** Measurable in proxy — facet/line density, curvature continuity, symmetry order — but the underlying geometry has to exist before the taste matters.

**Gate:** Subdivision geometry support + governor cost-tier sign-off for extreme facet counts.

### Pack 6: Fiber & Weave (3 personas)

**Roster:** Anni Albers · Sheila Hicks · Nervous System (Jessica Rosenkrantz)

**What Matt would see:** Thread treated as a serious language. Bauhaus weavings where the structure of warp and weft *is* the image (Albers), room-sized cascades of colored fiber pouring from the ceiling like waterfalls (Hicks), and forms that look grown rather than drawn — branching veins, ruffled coral edges, crystal dendrites (Nervous System).

**New taste signals:**
- Thread as meaning — pattern emerging from weaving structure itself, not applied on top of it (Albers).
- Fiber as architecture — soft material built into columns, walls, and landscapes; monumentality without hardness (Hicks).
- Simulated growth — differential growth, space-colonization, and reaction-diffusion as form generators (Nervous System).

**Honest instrument dependencies:** (1) A **strand/fiber render path** — curve instancing for thousands of threads — is new. (2) Growth simulations (differential growth, DLA, Gray-Scott) are best **baked offline** on the Mac Studio per the project's MLX-offline philosophy, then played back as assets — real-time simulation at this fidelity would fight the governor. Honest adjacency note: Nervous System's grown forms sit near Oxman's material ecology and Haeckel's ornamental biology; the differentiator is *simulation-driven* growth versus designed/observed growth, and the pack doc would need to say so.

**Curator fit:** Mixed. Weave-structure regularity and fiber color-storm density are parameter-measurable; growth-simulation quality needs the baked assets to exist first.

**Gate:** Fiber/strand rendering + an offline growth-simulation bake pipeline.

### Pack 7: Visionary Cosmos (4 personas)

**Roster:** Alex Grey · Android Jones · Luke Brown · Zdzisław Beksiński

**What Matt would see:** Maximalist cosmic figuration. Glowing anatomical bodies x-rayed into layers of nervous system, chakras, and light lattices (Grey); dense digital-psychedelic worlds built from layered pareidolia — faces and creatures emerging from abstract texture (Jones, Brown); and the shadow counterweight — meticulously rendered dystopian ruins, aftermath rather than event (Beksiński).

**New taste signals:**
- Anatomical transparency — the body shown in simultaneous layers: skin, nerve, energy, cosmos (Grey).
- Pareidolic density — abstraction that resolves into beings the longer you look; detail without rest (Jones, Brown).
- Dystopian aftermath — catastrophe already completed, rendered with devotional precision; beauty inside dread (Beksiński).
- Sacred geometry as connective tissue — lattices, toroids, and tessellations binding figure to cosmos (all).

**Honest instrument dependencies:** (1) **Detail-density compositing** — many layered transparent elements at high counts; a real stress test for the governor's cost tiers. (2) **Layered transparency ordering** — Grey-style x-ray needs disciplined depth compositing, not just additive glow. (3) A curation note, not a technical one: Beksiński's darkness is a genuine taste direction with real audience-splitting power — Matt decides whether the instrument goes there, and the pack's Avoids would need his explicit shaping.

**Curator fit:** Layer counts, symmetry, and anatomical-figure presence are measurable; "pareidolia that resolves" is not — this pack leans harder on the future MLX ranker than on the interim scorer.

**Gate:** Governor-verified dense compositing + Matt's explicit call on the dystopian register.

### Pack 8: The Observer's Eye (3 personas)

**Roster:** Thomas Shahan · Levon Biss · Don Komarechka

**What Matt would see:** The patience of looking closer than the naked eye allows. Jumping-spider portraits with individual leg spines resolved, shot on reversed lenses and focus-stacked from hundreds of frames (Shahan); insects lit section-by-section like sculptures, each portrait composited from ~8,000 photographs (Biss); snowflakes rendered as architecture, every crystal a unique engineered structure (Komarechka).

**New taste signals:**
- Extreme observational detail — resolution as devotion; the subject honored by how closely it's seen (all three).
- Section lighting — each part of the subject lit for its own texture, then composited (Biss).
- Patience framing — the image as the product of hours of stillness, not a decisive moment (all three).
- The alien in the familiar — backyard subjects revealed as other planets (Shahan).

**Honest instrument dependencies:** (1) This pack is **asset-led** — it wants photographic plates (macro imagery) more than new generative math, so it rides the asset-studio pipeline already in the locked scope. (2) A **focus-stack-like depth-of-field FX** would sell the macro register; if the FX layer system doesn't have true DOF, that's a new effect to spec. (3) Shares the slow-temporal lane with Pack 2 — the Observer's Eye moves at contemplative speed.

**Curator fit:** Detail density and DOF characteristics are measurable once the assets and FX exist; before that this pack is a direction, not a scorer.

**Gate:** Asset pipeline carrying photographic plates + a depth-of-field FX (or explicit decision not to).

---

## Wildcards — non-artist personas

These aren't visual artists, which is exactly why they're interesting: each one is a *method* disguised as a taste. Each is listed with what would make it shippable, because a wildcard without a shipping condition is just a poster.

### Wildcard 1: David Attenborough — The Observer

**The taste:** Restraint as spectacle. Wide frames held longer than feels comfortable, natural light, the reveal timed to the subject rather than the edit. Nothing hurried, nothing decorated.

**What Matt would see:** A curation voice that keeps wide, holds still, and refuses the frenetic — applied to generated frames, it would favor composed, patient, naturally-lit scenes and pass anything jittery or over-processed.

**What makes it shippable:** It's a *pacing and framing* rubric, not imagery — fully expressible as keep/pass weights on shot duration, frame density, and light naturalism. Shippable the moment the Curator scores temporal behavior (shares Pack 2's slow-envelope gate), needing no new visuals at all.

### Wildcard 2: John Cage — Chance Operations

**The taste:** The method is the art. I-Ching-derived decisions, prepared constraints, and — hardest of all — genuine silence treated as material rather than absence.

**What Matt would see:** A persona that doesn't pick favorites but *deals* them: constraint cards that force the instrument into combinations no taste would choose, with silence (true no-op frames) as a legitimate outcome.

**What makes it shippable:** Cage's entire practice is already parameterized — it's a constraint-generation system, which maps directly onto the Curator's parameter space. The instrument already treats silence as a true no-op (per the audio work), so the philosophical groundwork exists. Shippable as a "Cage deals the constraints" mode with zero new rendering.

### Wildcard 3: Brian Eno — The Studio as Instrument

**The taste:** Generative systems over composed objects. Oblique Strategies as a working method ("Honor thy error as a hidden intention"), ambient patience, the producer as gardener rather than architect — set up the conditions, then listen to what grows.

**What Matt would see:** A voice that favors slow emergence, limited palettes, systems left running — and, concretely, an Oblique-Strategies-style constraint deck for breaking creative deadlocks mid-performance.

**What makes it shippable:** Two shippable halves. The taste half (emergence, restraint, long durations) rides the same slow-envelope gate as Packs 2 and 8. The method half — a deck of Eno-style strategy cards that re-weight the Curator mid-session — is pure UI + weight logic, no new rendering. The deck is the nearer ship.

**Long-horizon wildcard (noted, not proposed):** *The Performer* — a persona trained on Matt's own keep/pass ledger until the Curator can play his taste back to him. This is the destination the whole taste system points at; it becomes shippable when the ledger has enough real decisions to train on, and it should never be faked with synthetic labels.

---

## Sequencing summary

| Wave | Packs | Personas | Gate |
|------|-------|----------|------|
| **Wave 1** | Optics & Pattern | 4 | None — taste weights + shaders |
| **Wave 2** | Atmosphere & Light, Precision Machines | 7 | Slow envelopes + viewer input; STIMULI SYNC |
| **Wave 3** | Playful Computation, Monumental Form, Fiber & Weave, Visionary Cosmos, The Observer's Eye | 17 | Input-device plumbing; subdivision geometry + governor sign-off; fiber rendering + offline bake; dense compositing + Matt's call on darkness; asset plates + DOF |

**Total: 8 packs, 28 personas, 3 wildcards.**

## Recommendation

**Ship Wave 1 — Optics & Pattern (Riley, Escher, Broug, Kusama) — first, because every one of its signals is pure render math on parameters the engine already randomizes, so it lands as taste weights and shaders with zero new instrument plumbing while covering the largest unserved territory in the base 10: optical vibration, tessellation, sacred geometry, and obsessive repetition.**

## Open questions for Matt

1. Does the dystopian register (Beksiński in Pack 7) belong in the instrument at all? This is a taste call only he can make.
2. Wave ordering assumes STIMULI SYNC ships before input-device plumbing — if the STIMULI owner's timeline slips, Precision Machines waits and Atmosphere & Light could move up alone.
3. The wildcards are methods, not looks — does he want any of them (especially the Cage constraint deck or the Eno strategy deck) ahead of artist packs?
4. Nervous System's adjacency to Oxman/Haeckel needs his eyes: simulation-grown vs designed-grown — distinct enough to be its own pack, or a flavor inside the bio-drives work already in scope?
