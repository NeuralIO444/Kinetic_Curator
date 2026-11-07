# RAY GUN HEADROOM — what else the illegible pole can be, and what a shared treatment engine means for the whole system

**Date:** 2026-11-06 · **Status:** Research + scoping only. No code, no commits, no issues filed.
**Prompt (Matt, 2026-11-06):** "for the raygun, what else can we do? is there more head room and technology room as far as replicating the actual raygun aesthetic?" — plus: (a) RAY GUN work automatically reaching other tools/engines, working with the Davis Director; (b) two more directors in the DIRECTORS panel, or a fifth layer ("instead of a 4 way table we have a 5"); (c) the poem, short or long, interacting with the Game of Life; (d) a more advanced tear/distortion/displace engine for type that also serves assets and creatures; (e) "i want the kin, curator and raygun to work with creatures, wetlab, the math and fx layers, the whole system should be bidirectional and available to all, is the Core API bus being updated?"; (f) "we should definitely make sure we do a sweep of what we have — add creatures, wetlab, screen beasts, poem, type."
**Audit base:** fresh detached worktree at origin/main **8e85f860** (`~/workspace/kc-raygun-research`), 2026-11-06. Every claim below names its file. The #2006 review-loop slice 1 build (in `~/workspace/kc-2006-build`, uncommitted at audit time) was read for the bus question only.
**Sources:** the Monster Children interview with Chris Ashworth ("Under the (Ray) Gun", published 2023-04-10, fetched 2026-11-06); the five images Matt pasted (contents-collage cover; Carson interior spreads incl. "DRIVING / SADE"; a Blah Blah Blah cover; the taped "Ray G—un 53" mechanical); the tree at 8e85f860.

---

## 1. The aesthetic inventory — what Ray Gun actually did to type

Two phases, two different machines. Conflating them is the current build's main gap: KC-1's RAY GUN ships three modes that are all, mechanically, variations of *one* phase (Carson's geometry), while the Ashworth phase — a *system* for producing chaos from order — has no mode at all.

### 1a. The Carson phase (art director 1992–94): intuitive cut-and-paste chaos

| # | Technique (mechanical name) | What is done to the type | Grounding |
|---|---|---|---|
| C1 | **Per-glyph geometric chaos** | Every letter gets its own baseline step, size, rotation; words stay barely segmented | Pasted spreads; contents cover |
| C2 | **Glyph substitution as contempt** | A whole text set in the wrong character set entirely (Dingbats), so it cannot be read at all | **Article-supported:** Ashworth recounts Carson setting a boring Bryan Ferry interview in Dingbats "so no one could read it" |
| C3 | **Edge and gutter cropping** | Giant words run off the page edge and are destroyed across the gutter; letters are amputated by the format itself | Pasted spread: "DRIVING / SADE" |
| C4 | **Column overprint** | Columns of body text printed over/under giant display type; two text systems occupying the same space, each degrading the other | Pasted spreads |
| C5 | **Face and case mixing in one stack** | Names set in mixed faces, mixed cases, mixed sizes as a single compositional stack | Pasted contents cover (RAY GUN / KRAFTWERK / TRENT REZNOR / BJÖRK…) |
| C6 | **Halftone interplay** | Halftone-screened photographs under and through the type; the dot screen is part of the texture of the page | Pasted contents cover |
| C7 | **Photocopy degradation** | Images and type carry xerox generation loss — blown contrast, eaten edges, toner noise | Blah Blah Blah cover: masthead type layered over a photocopied face |

*Attribution correction, for the record:* the Blah Blah Blah cover is not Carson's later work. The article states Ashworth's studio **Substance** won the Blah Blah Blah pitch from Marvin Jarrett/MTV and designed its five issues in **1996**, before Ashworth took Ray Gun. C7 belongs to the bridge between the phases — which makes it more useful, not less: degradation is where Carson's chaos and Ashworth's system meet.

### 1b. The Ashworth phase (art director from 1997, 15 issues in 18 months): "Swiss Grit"

Ashworth names his own aesthetic in the article: **"Swiss Grit — a hybrid of freeform with a Swiss aesthetic"** — Swiss college training fused with the freer American work he admired (*Beach Culture*, *Emigre*). The mechanical difference from Carson: **the grid comes first, and the destruction is done *to* the grid, by rule.**

| # | Technique (mechanical name) | What is done to the type | Grounding |
|---|---|---|---|
| A1 | **Grid-then-destroy** | Type is first set on a strict modular Swiss grid — one face, tight discipline — then a subset of elements is violated: shifted exactly one module, dropped a row, overprinted. The legibility of the *system* is what makes the violations read as violence rather than mess | **Article-supported** (Swiss Grit definition; Swiss training). This is the phase's signature move |
| A2 | **No template, fresh system per issue** | "Every time I did an issue, I would start again. I didn't have any grids or templates or anything" — the grid is *drawn for the piece*, then broken for the piece; the destruction parameters are part of the composition, not a house style | **Article-supported** (direct quote) |
| A3 | **Paste-up / tape mechanicals** | Letters physically taped onto the sheet; tape strips, crumpled paper, and misregistration are composition elements, not accidents | Pasted image: the "Ray G—un 53" mechanical — taped letters on crumpled paper. **Article-supported as practice:** Ashworth's current work is hands-on paper construction, "sticking bits of paper together" |
| A4 | **Weathering as finish** | Surfaces are left to age, fade, and acquire damage; "at one point it looked sterile and crisp… over time it takes on a life of its own." Imperfection is a *time* process applied to a finished composition | **Article-supported** (direct quotes on found/weathered work) |
| A5 | **Systematic grit** | Degradation applied as a *process with parameters* (photocopy generations, grit, contrast crush) across a whole item — Carson's chaos is gestural; Ashworth's dirt is a machine setting | Article (Swiss Grit) + the Blah Blah Blah cover's uniform xerox treatment |

**The one-line summary of the inventory:** Carson = *geometry* (move the letters). Ashworth = *systems* (set it perfectly, then run a destructive process over it, and let the process be the style). KC-1 today ships Carson's half as pure geometry, and neither phase's *shape* destruction, *process* destruction, or *composition* destruction at all.

---

## 2. Census — what the tree has today (the sweep)

State key: **shipped** = on main 8e85f860 and live · **partial** = core shipped, later slices designed/ruled but unbuilt · **parked** = designed, waiting on queue/Matt's word · **paper** = spec only.

### 2a. Creatures (WetLab-assembled creature records)

| Module | State | What it can already do |
|---|---|---|
| `engine/assetAttach.js` + `autoAttach.js` | shipped | ATTACH points on any basic asset shape — plain / **H** (head) / **L** (limb). Tap cycles plain → H → L → gone; one H per asset. This is the WetLab authoring atom |
| `engine/creatureAssembler.js` (#1849, epic #1848) | shipped | Shape + attach points → a **creature record**: body = the shape, head = H, limbs = L points, plus a **genome block** — genes `{family, id, value, source}` across **FORM / LOOK / VOICE / MATERIAL / DRIVE**. Born inheritable; carries Look + Voice references into the real decks |
| `engine/creatureRig.js` (#1851) | shipped | The rig: head/limbs are **invisible bones** (Spine/Godot-style cut-out rig); visible parts are **dealt from the stage's own pool** (the creature is made of the room's material and redresses when the stage changes); rigid FK chains; **Davis deals which asset rides which bone; LOIS's gait table (LOIS_GAITS) sets the motion** |
| `engine/skeleton.js` + `engine/creature.js` + `creaturePose.js` / `kineme.js` | shipped | The skeleton frame (spine + bone chains, seeded `skeleton` channel) under the original creature, the **moth** (#1355/#1206): body/wing/feather-fan hierarchy built from a formed pin; parts resolve into ordinary renderer items — "the renderer never learns a hierarchy exists" |
| `engine/dishCreature.js` | shipped | A real dynamic dish body (XPBD links) whose roam wanders around its pin |
| `curator/creatureCitizen.js`, `engine/creatureBreed.js`, `curator/creatureBreeding.js` | shipped | Injection through the normal asset path (the "no longer a sticker" build) and breeding under the merge law; mutation at the ruled lively rate (~1 gene in 8) |
| Creature cost + gates (`kernel/creatureCost`, `gl/creatureGate`, `gl/performanceCreatures`) | shipped | Creatures are governor-priced; **the governor sheds creature count first** |

### 2b. Screen beasts — a distinct system: the Strandbeests

**The phrase "screen beasts" appears nowhere in the tree** (grep across `app/src` and `docs/`: zero hits). What the tree has is **beasts**: `engine/beastTile.js` states the distinction itself — *"A beast is not a creature RECORD (no attach points, no genome block, no breeding…); it is an ordinary wet-lab pool tile carrying `rig.linkage`."* So: same bestiary, **two different machines** — creatures are assembled records with genomes; beasts are linkage walkers carried as pool tiles.

| Module | State | What it can already do |
|---|---|---|
| `engine/jansenMeasures.js` | shipped (#1962 BEAST S1) | The 13 Jansen linkage lengths (a–m; holy numbers 38.0, 41.5, …) as gene-like measures with per-link legal ranges (link **k**'s band is narrow — ±2% breaks assembly) |
| `engine/jansenSolver.js` + `beastBuilder.js` | shipped (S2) | Closed-form linkage solver (13 lengths + crank angle → every joint, five two-circle intersections, pinned branch rules); **feasibility gate**: a genome that can't assemble at any crank angle is a stillbirth and is never minted |
| `engine/beastRig.js` | shipped | `poseLinkage` — the linkage posed per crank angle; multi-leg bodies phase legs 120° apart |
| `engine/beastTile.js` | shipped (S3b) | **ASSEMBLE A BEAST** in the WetLab: seeded measures dealt inside the gate; the tile's thumbnail is the linkage at rest; placed on stage it expands at contract time (`creatureRig.expandBeast`). Same seed + ordinal → same animal; a re-press never banks a duplicate |
| `engine/beastTrace.js`, `beastRoam` (formation-side) | shipped / partial | The beast draws its own foot-path curve as it roams the dish — the curve is a graphic asset. Depositing the trace *into* the dish (field coupling #1814/#1841) is a named follow-up, not built |
| `components/BeastSettings.jsx`, `panels/beastReadout*` | shipped | The beast's stage settings + readout surface |
| Full strandbeest epic (#1863, slices #1864–#1868; spec `docs/design/strandbeest-epic-spec-2026-10-29.md`) | **partial** | The Oct-29 spec says "drafted, not filed, not scheduled", but code evidence shows the BEAST slices landed later under #1962 (measures, gate, rig, tile). What remains unbuilt: measure-gene **breeding** (the tile header defers it to "their own slice"), trace-into-dish coupling, the tiered bestiary (lambda/Klann lesser walkers) |

### 2c. WetLab (the editor where creatures and beasts are made)

| Module | State | What it can already do |
|---|---|---|
| `panels/WetLab.jsx` + `wetLabLogic.mjs` | shipped | The lab panel: shape editing, attach-point authoring, **"Assemble a creature from this shape"** (dealt off the project seed), **ASSEMBLE A BEAST**, creature/beast assembly notes surfaced in-panel |
| Attach editing (`assetAttach.js`) | shipped | The ruled gesture: tap cycles plain → H → L → gone; tapping empty shape adds a plain point; promoting a point to H demotes any other H |
| `engine/regionBake` / studio baking (`gl/resvgRasterPool`, `assets/resvgFont.mjs`) | shipped | The lab's render/bake path — assets are baked to raster/path data in the studio pipeline, a different renderer from the live GL stage (this matters for treatment previews, §7) |

### 2d. Poem (the FIELD system)

| Module | State | What it can already do |
|---|---|---|
| Poet decks (`poets/greenleaf.js` = Whittier, `teijo.js`, `rosselli.js`, `gibson.js`) | shipped | Four poets' text corpora; FIELD-eligible families are swiss / bauhaus / japanese (`TYPE_NATIVE_FAMILIES`) |
| `poets/fieldForm.js` — the door (`gateFieldForm`) | shipped | Judges every stored form: **faces are form-level and face-bound** — base face (one charset: caps/digits/lowercase/punct), serif face, plate face, native (kana∪kanji judged as one set). Faces never compose; native outranks face/plate. Doors: em ∈ (0.01, 0.3], count ≤ 200, centres on dish, silence is legal |
| `poets/placement.js` — the floor (`fieldFormStamps`) | shipped | Places a form along its line boxes: justified rows, stamps capped so a whole word's ink stays inside, serif face lays a two-line **plate** with a break; per-stamp width via `stampWidthEm` (ink-width fractions) |
| `poets/rayGunForm.js` — the treatment (#2003) | shipped | §3 details it. Pure geometry over the placed list, driven by a `{mode, seed}` record on the form; treated list never stored, recomputed per draw; glyph identity (`ch`/`assetId`) untouchable by its own floor law |
| `poets/poemRow.mjs` + `components/PoemRow.jsx` | shipped | The performer's poem surface: token chips with live states; **KEEP banking** (`keepKey` — deliberately **marker-blind**: whisper/serif/plate/raygun markers do not change what banks); whisper/serif/plate/raygun cycling per poem |
| `curator/fieldDirector.js` + `fieldEval.js` | shipped | The Director's FIELD calls at pick time: `choosePoet` / `dealPoet` — poet, script, serif/face, plate, and (silence-first) whether a poem stands at all |
| `curator/fieldReview.mjs` (#2006 slice 1) | **partial — building now** | The shadow review: measures landed field items, judges (LOIS/DAVIS verdicts, Mind backend), does not yet act. In `kc-2006-build`, uncommitted at audit time |
| DISH LIFE culture (`engine/dishLife.mjs`, `dishLifeSeed.mjs`, `dishLifeField.mjs`) | **partial** — Phase 1 shipped (PR #1995) | A Generations-family culture (B3/S234, 8 states) seeded from the stage's marks, evolving during play, publishing `field.level` / `field.activity`; **bedrock law**: locked/held cells are terrain, never alive. Phase 2 consumers (scale modulation first; FIELD glyph breathing, pattern modes, CONTENT backgrounds) are fully scoped and ruled (2026-11-06) but unbuilt; coupling starts at 0, Matt raises it |

### 2e. Type (the stamp system)

| Module | State | What it can already do |
|---|---|---|
| Stamp packs (`data/assets/assets-*.js`; generators at repo-root `scripts/gen-*.mjs`, opentype.js → path data) | shipped | **753 catalogue assets.** Faces: Anton base (`typ_*`), PT Serif (`typ_s_*`), Fraunces plate (`typ_f_*` — variable font instanced at bake: opsz 144 / wght 400), kana (`typ_k_*`), kanji (`typ_j_*`), ornaments (`typ_o_*`). Glyphs are baked SVG path data centred on a 100×100 viewBox; **fonts are never shipped or loaded at runtime** (the FONT RULING). Poem-only packs are contained by per-pack selfchecks on every surface |
| Registers | shipped | **WHISPER** (alpha × WHISPER_ALPHA, top of the layer's alpha range), **serif** (face + plate break), **plate** (#2005: Fraunces + measure discipline — PLATE_MEASURE 0.66, PLATE_TRACK 0.26, plus the **room**: non-form marks inside the plate's measured ink zone are quieted to PLATE_ROOM_ALPHA, restored exactly next build), **raygun** (the treatment) |
| The render seam (`engine/buildPlacements.js` FIELD block) | shipped | Field items are built from the drawn (treated) form, coloured by the layer's colour strategy, and **join the item list before the overlap sort and the mirror/material flag loop** — mirror (4-state), glass, and materials treat poem stamps as ordinary marks. The SoA lean/snap/weather pass deliberately does **not** move field items ("a held form is not loose marks") |
| Sleight of Hand (`engine/kernel/itemMorph.mjs`) | shipped | Planned transitions between item lists: **SMEAR** (stretch along motion, carried by the velocity-smear shader via synthetic vx/vy), **BREATHE**, **FADE**; joiner/leaver pairing for items that arrive/leave. This is the delivery vehicle #2006's repairs will ride |

---

## 3. Gap analysis — what ships today vs the inventory

### What today's RAY GUN actually is

`poets/rayGunForm.js` is a **pure geometry transform**: given the placed stamp list and a `{mode, seed}` record, it returns a new list in which stamps may differ only in **x, y, rotation, em**. `ch` and `assetId` are untouchable (floor law #1 in the module). Three modes:

- **CARSON** — per-glyph, word-correlated: baseline step ±0.25 em, jitter ±0.25 em, tilt ±12° plus glyph rotation ±13° (±25° total), scale 0.6–1.8× with 1–2 *heroes* per form at 2.2–3.0×, a tracking random walk (step ±0.22 em, clamped ±0.3), an edge-push (p=0.4, up to 0.5 em toward the dish edge), and misregistration duplicates (p=0.12, offset (0.1, 0.06) em — the double-print).
- **GREIMAN** — per-word-block rigid transforms: whole words scale 0.7–1.6×, rotate 5–20°, ride one shared diagonal step (the code calls it the "Weingart step"), float ±0.3 em, snap to a 0.05 grid at p=0.4 (the "bitmap nod"), whole-word echo at p=0.5 (0.62 scale).
- **SHOT** — an epicentre blast: exponential falloff (σ=0.38), glyphs grow ×(1+1.6f), swirl up to ±110°, ghosts left at the falloff's high end.

Floors on all modes: words stay *recoverable* at CARSON/GREIMAN (word cells are segmented from placement geometry — tracking 0.16 / space-advance 0.58 constants; grid/square layouts segmented by pitch), the first line is protected (FIRST_LINE_FACTOR 0.5), and the result re-passes the door (em bounds, count ≤ 200, centres on dish). SHOT is the only mode licensed to actually lose the words.

### The gaps, by absence class

| Inventory technique | Status today | Absence class |
|---|---|---|
| C1 per-glyph chaos | **Ships** (CARSON) | — |
| Word-block transform + echo | **Ships** (GREIMAN) | — |
| Radial destruction | **Ships** (SHOT) | — |
| Misregistration / double-print | **Ships** (CARSON duplicates; GREIMAN echo) | — |
| C3 edge cropping | **Half** — the edge-push moves glyphs toward the edge, but centres are then clamped on-dish, so ink is never actually amputated by the format; the gutter does not exist as a destroyer | Composition-side |
| A1 grid-then-destroy (Swiss Grit) | **Absent** — no mode first *imposes* a strict grid; GREIMAN's floats start from the poem's own justified layout, so the violations have no discipline to violate | Composition-side |
| Torn / cut glyph shapes | **Absent** — stamps are atomic baked paths; the treatment cannot change a glyph's shape, only its transform | **Bake-side** |
| C7/A5 photocopy generation loss | **Absent** — no erosion, toner noise, or contrast-crush variant of any glyph exists anywhere (bake or render) | **Bake-side** (or render-side texture, unbuilt for type) |
| C5 face-mixing mid-word | **Absent** — faces are form-level and face-bound at the door; a stored form is judged against ONE affirmed charset. A mixed-face stamp list is mechanically representable (assetId encodes the face) but the door would refuse the form | **Law-blocked** (at the door) — with a draw-side loophole, §4 |
| C4 column overprint | **Absent** — one form stands per layer; two text systems cannot occupy the same space. Ghosts/echoes are the same form doubled, not a second text | Composition-side |
| C6 halftone interplay | **Absent for type** — no halftone material reads type; the FX stratum has a fullscreen DITHER, and shapes have their own dither, but nothing screens the poem against an image | Render-side |
| A3 tape / paste-up artifacts | **Absent** — no tape strips, no paste-up furniture in the type system (tape-like marks exist generically in the asset pool, not as a treatment) | Bake-side / composition-side |
| A4 weathering over time | **Absent** — a treated form is a pure function of (form, record); it cannot *age*. Nothing in the treatment has a time axis | Render-side (a state axis the form schema doesn't carry) |
| Per-glyph ink variation | **Absent** — field items take one alpha (layer range top, or whisper ×WHISPER_ALPHA for the whole form); stamps carry no alpha field | Render-side |
| C2 glyph substitution (Dingbats) | **Forbidden by the treatment's own floor law** (`ch`/`assetId` identity). A substitution act would have to live at the poet/deck level, not in rayGunForm | Law-blocked (by design — this floor is what keeps a treatment a treatment) |

**The shape of the gap:** everything that ships is *where the letters are*. Everything absent is *what the letters are* (shape, face, degradation), *what process runs over them* (grid-destroy, weathering, halftone), or *what shares their space* (overprint, the Life). That is exactly the headroom question's answer in one line — and it splits cleanly into a bake-side lever and a render-side lever, because the FONT RULING already decided the terms: glyph **shape** changes must be baked variants; **geometry/texture** at render is the other lever.

---

## 4. Technology room — existing engines that could be pointed at type

Each entry: the mechanism, what pointing it at type takes, the iPad-class GPU cost class, and the determinism story. (KC-1's stated perf target is iPad-class GPUs; the governor prices every effect through `gl/kernel/costRegistry` cost tiers — MATH kinds already register as `math/<kind>`.)

### 4.1 The bake pipeline — variant capacity (the shape lever)

`scripts/gen-*.mjs` (repo root) parse fonts with opentype.js and write stamp packs as path data (`app/src/data/assets/assets-*.js`). The plate generator instances a *variable* font at bake (Fraunces opsz 144 / wght 400) — proof the pipeline already does font-level processing, not just outline dumps. Any **path operation at bake is free at runtime**: a torn variant (clip the glyph path along a seeded tear line, offset the two halves), a degraded variant (erode/dilate the outline, bite noise out of edges — photocopy generation loss as geometry), a pre-mixed "drawer" face (each letter from whichever face — see §4.3). Costs: catalogue size (each variant pack ≈ +50 stamps, against the current 753) and the standing per-pack containment sweep (poem-only packs are pinned on ~7 surfaces by selfcheck — slices 1–3 are the template). Determinism: static data; perfect replay by construction.

### 4.2 FX shaders — DISPLACE and TEAR already exist (the texture lever)

`gl/effects/fxShaders.mjs` exports a shader-effect library whose kinds include **`displace`** (fractal-noise displacement map over the rendered texture — feTurbulence/feDisplacementMap lineage, seeded, with a domain-warp option so "edges boil rather than wobble") and **`tear`** (horizontal scanline slice-tears: banded rows shear left/right, X-only), plus dither, edge, grade, halo, haze, scanlines, sharpen, solarize. The MATH stratum's kinds (`gl/effects/mathShaders.mjs`) are by contrast pure tone math — gain, lift, contrast, saturate, threshold, quantize, knee, tempTint, vignette, channelMix, hueRotate — **no spatial operation exists in MATH at all**.

Honest state of play: these FX kinds are **layer-composite texture passes** (they sample the rendered texture `u_tex`). An FX stratum standing in the composite chain already deforms the poem's *pixels* when the poem's layer passes under it — but as weather over the whole frame: the pass has no notion of glyphs, words, or the poem as an addressable target, and the poem cannot ask for it, aim it, or record that it happened. Cost class: fullscreen pass per FX item — the expensive class on iPad GPUs, already governor-priced. Determinism: seeded uniforms (displace's seed is a parameter) — replayable as document state.

### 4.3 Face-mixing — the door loophole (a law question, not an engine question)

The door judges *stored* forms against one face's charset. But a treatment's output is **never stored** — `rayGunForm` recomputes the treated list per draw, and the review loop's exemption for treated forms already rests on this. A draw-side rule change — "a treated stamp keeps its `ch`; its `assetId` may move to *the same letter's* variant in another poem-only face" — would give CARSON true contents-cover face-mixing with zero new packs and zero door change. The cost is amending rayGunForm's floor law #1 (glyph identity), which is Matt's law to amend. The alternative honours the floor literally: bake a pre-mixed drawer pack (§4.1) and let the door affirm *it* as a face. Both are scoped in §10 (decision D1).

### 4.4 The velocity-smear carrier — per-item distortion at zero pass cost

`gl/velocitySmear.mjs` (#309): per-instance displacement is packed into the instance buffer (`a_inst2.zw`) and the vertex shader stretches each quad along its own motion — "motion blur with zero fullscreen passes". Sleight's SMEAR move already drives it with synthetic velocities for item transitions. This is the existing proof that **per-item spatial distortion can ride the instance pipeline**: a shear/melt channel for individual items (type stamps, creature parts, beast stamps alike — all are instances by the time the seam is done) without a single fullscreen pass. Cost class: per-vertex arithmetic at KC-1's item counts ≈ free. Determinism: a pure function of the item list + the record driving it.

### 4.5 Fields that type could read — fieldMap and the DISH culture

Two field systems already publish spatially-varying data. (1) `engine/fieldMap.mjs` (#1199): a layout-level field (noise | density) driving channels **weight | saturation | scale** with amount (dry/wet) and curves (linear | smooth | stepped) — read during placement; it has **no position channel** and field items are placed after it. (2) The DISH culture (§2d) publishes `field.level` / `field.activity` per frame, with the ruled consumer contract — consumers read, nothing writes back. Type reading either field at the seam (scale breathing, saturation pull, a position nudge from activity) is mechanically a resolve-time lookup, the same shape as the plate room's zone test. Cost: one lookup per item per frame. Determinism: both fields are functions of recorded state (the culture's seed is stamped on the input — `fieldStamp` — precisely so replay re-derives it).

### 4.6 The CA engines (see §5)

Two cellular automata exist, with different jobs: `engine/ca-engine.js` (pure Conway Life, toroidal 40×28, seeded grid) consumed as a **layout mode** — the layer's own marks ride live cells, stepped on phrase beats via davis/layout tick hooks; and the DISH culture (Generations-family), which is a *field publisher*, not a layout. The poem touches neither today: field items are appended after placement with fixed geometry.

### 4.7 Sleight of Hand — treatment *changes* can be performed, not cut

A treatment arming mid-performance replaces one item list with another (same stamps, new transforms). Field item keys are stable (`field-<poet>-<piece>-<j>`), and stamp-index identity is exact across an adjustment (established by the #2006 scoping) — so `itemMorph` can SMEAR/BREATHE a form from plain to blasted over ~1 s instead of snapping. This is how a Carson arm or an Ashworth destroy could *arrive* on stage as a performed event. Cost: one morph plan per change. Determinism: morph plans are seeded per their module's contract.

### 4.8 The Director's call pattern — the decision shape already exists

`fieldDirector.choosePoet` / `dealPoet` is the template for any treatment decision: a pick-time call, affirmed against the room, carried on the dealt record (`form.raygun = {mode, seed}` rode in exactly this way, drawn from the registered curate stream — `POEM_RAYGUN_BASE 0x70000` + a tap counter, never from drum clocks). Any new treatment (a doctrine choosing mode + heat, a Life interaction arming) is the same shape: **decision → record → pure function at draw**. Models may score/order the choice; they never gate it (standing law).

---

## 5. The poem ↔ Game of Life question

First, a disambiguation the code forces: "the Game of Life" in KC-1 is **two** systems (§4.6). The one that "already acts as a background element" is closest to the DISH culture (it lives on the dish, evolves under the performance, publishes fields) — but the classic Conway engine also exists as a layout the marks can ride. The designs below name which automaton each uses. The hard parts are shared, so they come first.

### The honest hard parts

1. **Time axes.** The poem is dealt once (pick-time, static geometry). Both automata are *stepped state*. Any interaction is therefore a state channel, and state channels in KC-1 are legal only when they are **functions of recorded inputs** (seed + step count off musical/loop time) — the culture already proves the pattern (its seed is stamped on the take's input; the loop re-derives the field). An interaction that mutates the *form* mid-performance breaks replay: the form is document state, and only deal-time writes are recorded.
2. **The one-way contract.** The dish system's standing rule (in `dishLife.mjs`'s own header, restated for the culture): *nothing writes another system's state; consumers read fields*. A poem writing into a live grid mid-frame would be the first write-back in the system. The legal write moments are the boundaries that already exist: **deal time** (the seed is a pure function of the composition) and the culture's ruled **cycle re-seed** (Phase 3: periodic re-seed from the stage, ruled 2026-11-06).
3. **The legibility law.** If the Life eats the words by default, the failure mode Matt banned (the loud middle rotting into jank) gets a biological excuse. Erosion must be an **armed, recorded treatment** — a member of the raygun record family — so the review-loop exemption stays legible: destruction the record names is sanctioned; destruction that merely *happens* is jank, and #2006 would (rightly) judge it.
4. **Feedback.** Poem seeds culture → culture breathes poem (the scoped DISH consumer) → if the breathing ever feeds a re-seed, the loop compounds. The ruled Phase-3 re-seed must sample the **untreated** composition (or the plain form's cells), never the field the poem itself induced.

### Designs — short poems

A short poem (a word, a line — a stamp count in the teens) is the right size to be a *citizen* of the grid:

- **S1 · Poem as seed (the Life does the Ray Gun).** At deal time, the form's stamps enter the culture seed through the existing machinery (`dishLifeSeed.mjs` accepts *any* mark list — x, y, scale, alpha → coverage → top-coverage cells in the seed band). The culture blooms from the words; its 8-state decay tails eat them over cycles. The poem stands plain while young and is progressively destroyed by its own garden. Armed as a treatment record; off by default. *Ownership:* the poem donates its geometry at the boundary; the culture owns the aftermath.
- **S2 · Poem as bedrock (life flows around the words).** The culture's bedrock law already makes locked/held cells terrain. A standing poem's cells join the terrain: colonies break against the words and flow around them; the words stay exactly as dealt. This is the legibility-preserving direction — the poem as coastline. For HELD poems this is arguably already the contract (held = locked = terrain); for dealt poems it should be armed, not ambient (decision D3).
- **S3 · Poem as walls (Conway layout mode).** In the CA layout, glyph cells are permanent walls in `caGrid`: gliders die on the letterforms, colonies pool in the counters of letters. The layer's marks ride the living cells *around* the words. Mechanically: the grid gains a wall mask stamped at deal time from the form's cells — the same stamp-at-boundary pattern.

### Designs — long poems

A long poem (multi-line, near the 200-stamp door) is the wrong size to be a citizen; it is a *landscape*:

- **L1 · Poem as terrain / habitat.** The culture seeds **along the lines** — the seed band follows the poem's rows, so growth starts in the text's margins and inter-line gaps, maturing (the culture's B3/S234 rules mature into maze-like states around gen 60–100) into a maze the poem's lines structure. The poem doesn't move; the dish becomes legible *through* it.
- **L2 · The poem as the seed field's geography.** Instead of walls, the poem's coverage field biases the culture's *activity* (dense text = rich soil: higher birth neighbourhood), so the culture is visibly more alive where the words are — read back through the already-scoped consumer (glyph breathing by local activity), the poem glows where its own garden thrives. This is the bidirectional loop, closed **only at cycle boundaries** (hard part 4).
- **L3 · Erosion as a long-form treatment.** For a long poem, S1's eat-the-words is too total; instead the culture's decay states *annotate* the text over time — stamps whose cells are in late decay states take the degraded bake variants (§4.1) — weathering (A4) with a biological clock. The most Ashworth design in this doc: a perfect setting, destroyed by a process, over time.

**Who owns whom, in one line:** neither. The poem owns its geometry; the automata own their state; the only legal meetings are at **boundaries** (deal, cycle re-seed) where geometry is stamped into state, and at **reads** (fields biasing the draw) where state never touches geometry's record. Anything else makes one of them a sticker on the other — the poem becomes a texture for the Life, or the Life becomes a screensaver behind the poem.

---

## 6. Directors and layers — what the "4 way table" is, and what a fifth seat would cost

Matt's phrase has two plausible referents in the tree. Both readings are addressed; they have opposite answers.

### 6a. Reading one: the DIRECTORS panel

What exists today (`src/panels/davis/`, `panels/LoisPill.jsx`, `src/curator/`):

- **The Director** (`curator/director.js`, `fieldDirector.js`) — the dealer: pick-time calls for compositions and for FIELD (poet, script, face, plate, treatment). It acts by writing records; it has no seat of its own in the panel.
- **DAVIS** (`davisSlice`, `DavisPanel`, `CandidateTray`) — the generator: evolves and rolls candidate stages, deals hands; its phrase beats also step the CA grid.
- **LOIS** (`loisJudge` / `loisCut` / `loisRank`, `LoisPill`, `loisActivity`, `loisTicker`) — the judge: verdicts, cuts, the tape. LOIS already *acts* (a cut removes a dealt hand) — she is the precedent that a persona can hold a real power, scoped and logged.
- **TE** — the third Mind persona (the Mind trio: LOIS / DAVIS / TE, with the Apple Intelligence helper as default backend, rules as silent fallback; `mind:req` / `mind:reply` bus events carry their traffic).
- **The room** (`curator/directorsMatrix.js` + `directorTable.js`) — 20 rooms = LOIS states (NOD / VIBE / BURN / AWAY) × Davis states (FLOW / SEEDLING / UGLY / STUCK / BLOOM), each room a row of gains (tempo bias, KINETIC/LOIS weights, sway allowance, intensity budget, tilt limit). The matrix is **readout only** — "nothing here acts"; the gains table is what acts. The matrix copy is Matt-signed verbatim text, re-parsed by selfcheck.
- The **Queen** exists in the table as a sway actor (gated neutral).

**What "two more directors" would concretely cost:** a persona in this system is (i) a doctrine — a set of calls it may make, (ii) a surface — panel seat, pill, tape voice, and (iii) if it joins the room, a **multiplication of the matrix**: rooms are a cross-product, so one new axis of states doesn't add a row, it multiplies the signed copy, the gains table, and every room-verdict text — all Matt-signed material. That is the most expensive kind of change in KC-1 relative to its behavioural yield.

**What Matt actually wants from the idea** (per his (a)): destruction *doctrines* with names and temperaments, callable by the existing machinery — a Carson who arms chaos hot and a Ashworth who sets-then-destroys. That shape already exists in the tree and costs a fraction: **a doctrine is a caller profile inside the Director's existing treatment call** (§4.8) — a named chooser of mode + parameters + arming policy, seated in the DIRECTORS *motion* surface the way travel amounts already are, reviewed by LOIS through #2006, with **no new matrix axis**. DAVIS unattended can call the Ashworth doctrine; the performer can pin Carson. Same theatre, no new constitution.

### 6b. Reading two: the strata stack ("a 5 instead of a 4 way table")

The stack as ruled by Matt (2026-10-15) and coded (`state/slices/layersSlice.js`, `ADD_TYPES = ['content', 'fx', 'math', 'pattern']`, `strataSummary.mjs`): **bottom = exactly 2 CONTENT strata, locked; above, 1 MATH; above, 1 FX** — four strata, each holding at most 4 active items. A fifth stratum (say a dedicated TYPE/TREATMENT stratum) would:

- **Amend Matt's own 2026-10-15 ruling**, and collide with the repo's standing `AGENTS.md` line — *"No new panel. No fifth track."* Both must be named in any proposal that does it.
- Buy: an addressable home for treatments as first-class layer citizens (their own items, params, solo/mute).
- Cost: the strata summary, the layer patch/link system, the governor's per-stratum accounting, and every "exactly four" pin in the suite family — plus a conceptual cost: treatments are not a *source* of marks; they are a property of marks. A stratum full of treatments with no marks of its own is a category error the current record-architecture already solves better.
- **Verdict: not needed.** The treatment record (on the form today; on any item record under §10 P3) already gives addressability — per-form, per-creature, per-item — finer-grained than a stratum could. The 4-way table stays 4.

**Recommendation (both readings):** doctrines, not directors; records, not a stratum. (§10 P5 carries the doctrine slice; decision D2 puts the alternative to Matt plainly.)

---

## 7. Blast radius, whole-system — what a shared treatment capability touches

The architectural crux first: **there is exactly one place where type, creature parts, beast stamps, and ordinary marks are already the same thing — the item list at the render seam** (`buildPlacements` → `liveResolve` → renderer). A capability built *there* (or in the bake/record layer that feeds it) is whole-system for free. A capability built in `poets/` is type-only forever, no matter how it is named. Per surface (census names, §2):

| Surface | What changes | What breaks / risks | Cost |
|---|---|---|---|
| **Type / poem** (`poets/rayGunForm`, `fieldForm`, `placement`) | Treatment gains shape/process axes (variants, grid-destroy, fields); the `{mode, seed}` record grows a versioned shape | The #2006 exemption must stay legible: every new destruction axis must be *named in the record*, or the review loop will read sanctioned destruction as jank. Door floors re-pinned per axis | The selfcheck family re-pins (the #2003/#2005 pattern: ~7 surfaces per poem-only feature) |
| **Creatures** (`creatureAssembler`, `creatureRig`, `creatureBreed`) | Parts are pool assets drawn as items — a seam-level distortion reaches a creature **with no creature-code change**. A record-level treatment on the creature record itself is a bigger step: creature records have their own genome law | **Scope tripwire:** if a treatment ever becomes a *gene*, it enters breeding and the ~1-in-8 mutation — offspring could be born destroyed. That may be a feature ("a torn bloodline") but it is a ruling, not a default. Genome/sanitize law must explicitly keep treatments OUT of the genome until Matt rules otherwise | Seam-level: zero. Record-level: assembler + citizen + sanitize re-pins |
| **Screen beasts** (`beastTile`, `beastRig`, `jansenSolver`) | Beast stamps are items → seam distortion reaches them. **But** a beast's geometry *is* its gait: the closed-form pose pipeline must not be distorted upstream of the solver — distortion applies to the *stamps the pose emits*, never to joints/measures | Distorting measures = a different genome, and the feasibility gate (stillbirth law) owns that territory. A treatment that moved joints would silently mint unassemblable animals | Zero if the seam-only rule is kept; forbidden otherwise |
| **WetLab** (`panels/WetLab.jsx`, `wetLabLogic`, `assetAttach`) | The authoring surface could **preview** treatments (run the treatment over a sample form / the tile) and could *author* treatment records on creature records | Preview fidelity: the lab renders through the studio bake path (resvg/region bake), the stage through GL — a preview can lie about GL-only effects (fullscreen passes especially). Previews must be scoped to bake/geometry treatments, or labelled | One preview surface; the treatment modules are pure, so the lab can import and run them directly |
| **MATH stratum** (`mathShaders`, macro knobs, `fieldMap`) | Today MATH cannot touch type except globally (tone ops in the composite) and via the layout `fieldMap` (weight/saturation/scale — no position channel). A **type-aimed MATH item** would be a new kind whose output is a *field the resolve samples for field items*. The ruled precedent exists: the field-mod pointer already aims a MATH item at the bottom CONTENT stratum | A position channel for field items breaks the "held form is not loose marks" doctrine unless it is treatment-gated (armed records only) — unarmed poems must be bit-identical | One new shader kind + resolve sampling + a cost tier (`math/<kind>` pattern exists) |
| **FX stratum** (`fxShaders` — displace/tear/…) | FX already deforms type pixels at composite — unaddressed. **Zoning** an FX pass to the poem (the plate-room zone machinery in `buildPlacements` already computes a poem ink zone per build) would let DISPLACE/TEAR be *aimed*: weather becomes a weapon | FX passes are fullscreen; a masked pass needs the zone as a mask input (one extra texture or a stencil derived from the item pass). If zoning ships, "FX over the poem" becomes a recordable act — it must land in the treatment record family or #2006 sees unaccounted destruction | Moderate: pass plumbing + mask; governor already prices the passes |
| **Stage render seam** (`buildPlacements`, `liveResolve`, renderer) | Where P3 (§10) lives: a per-item distortion channel (smear-carrier pattern) + field reads for armed items | The seam is the hottest code in the repo; every item pays any per-item cost. Shed behaviour must be defined (below). Frame determinism: seam reads must be functions of the item list + records + stamped fields only | Per-item arithmetic ≈ free; the risk is correctness surface, not GPU |
| **Book / KEEP** (`poemRow.keepKey`, `curator/shelf`) | `keepKey` is marker-blind by law (whisper/raygun don't change what banks). A shared treatment record format lets a KEEP bank a *treated* thing uniformly (treated poem today; treated creature later) | If treatments ever *did* enter the key, old keeps would re-key — the marker-blind law should extend to the shared format explicitly | Zero if the law is carried; the shelf ("core API", §8) is the natural home for a treatments surface |
| **Replay / determinism** | Treatments as records + pure functions replay exactly (raygun proves it). Field-read interactions replay via the stamped-seed pattern. **Bus events do not replay** (§8) — nothing load-bearing may ride them | Any per-frame write into a form/record breaks the take. The stamp-at-boundary + read-only-fields pattern is the whole discipline | Design discipline, enforced by selfchecks on the record shapes |
| **Governor / shed order** (`costRegistry`, `liveResolve` shed ladder, `sceneContract`) | Every new pass/channel registers a cost tier (precedents: `math/<kind>` tiers; the creature section; tier-2 pigment shed; tier-3 motion freeze = identity) | The shed order must answer: in a GPU crunch, does treatment fidelity shed *before* creature count (today's first shed)? A shared distortion whose shed turns the poem plain mid-performance could read as a #2006-visible change — shed must land on treatment *heat*, not on/off, where possible | One tier registration + a shed rule per new cost |

---

## 8. The Core API bus — Matt's direct question: is it being updated?

**Short answer: no in-flight work updates it, and the honest state is that KC-1 has *two* things that answer to the name, both partial, neither of them a general treatment bus.**

### 8a. The event bus (the pub/sub that exists)

`src/composition/eventBus.js` + `eventRegistry.js` + `wireEventBus.js`:

- A typed in-process bus (`on` / `off` / `emit` / `once`) with **~150 typed events** — `davis:*`, `layout:*`, `assets:*`, `layer:*`, `fx:*`, `math:*`, `pattern:*`, `palette:*`, `voice:*`, `keep:add`, `dice:cast`, `mind:decision/request/status`, `mind:req/reply/route`, `director:room`, `clock:beat/bar`, `dish:density`, `audio:*`, `attach:clear`. Panels emit; `wireEventBus` routes through a dispatch pipe into store actions; the registry maps **every** event to its handler (or to `null` + a note) and a selfcheck fails on drift.
- The opt-in envelope (#1457/#1458) stamps `seq` (a plain counter, **reset per take**), `cause`, and a **musical stamp** (loopMs / bar / beat / phase / bpm); `emitOn('beat' | 'bar')` quantizes releases to the clock. Pending cap 64 with a drop counter (dev-surface only).
- **There are no `field:` / `poem:` / `raygun:` / `creature:` / `beast:` events.** Creature and beast assembly ride direct store actions (assembly notes live in slice state), not the bus.
- By the registry's own stated design, **per-frame and governor writes (beat pulse, audio bands, FPS, shed ladder, morph) stay direct — "telemetry, not user decisions"** — and request/reply is deliberately not events (direct getters/setters for that).

### 8b. "The core API" (the named surface that exists)

`src/curator/shelf.mjs` — specced 2026-10-14 (`docs/research/keeps-machinery-spec-2026-10-14.md` §10, written when Matt asked "core api visible?"): a named surface `stage() / collection() / crown() / fill(seed) / swap() / export() / history()`. **Shipped in its store-free half** (K1–K4): the exported `shelf` object carries `stage, collection, tierOf, stageFits, routeCrown, swap, fill, export, history`; `davisSlice` owns the writes, consumers read through the shelf. Its domain is **Keeps/Looks only** — it is not, and was never built as, a general capability bus. The spec's own framing: *"kc-voice/1 and the bus remain the only seams"* — the bus for signals, named surfaces for capabilities.

### 8c. Is anything updating it now?

- **#2006 slice 1 (building now):** its diff touches `selfcheck.manifest`, `state/slices/layoutSlice.js`, and adds `curator/fieldReview.mjs` + its selfcheck. **No eventBus / eventRegistry / wireEventBus / shelf files.** The review loop rides records + the store, per the pattern.
- **DISH LIFE Phase 1 (merged):** zero bus involvement — the culture stamps its seed on the take's input and publishes fields through the engine. Its phases 2–4 are scoped the same way.
- **Verdict: the bus is stable, not stale** — it is simply not the layer where the current work lives, because the current work is state-and-records work, and the bus is a signal layer.

### 8d. Can it carry bidirectional treatment traffic?

Split the traffic by kind, because the bus's character decides:

- **Signals — yes, well.** Arms, disarms, verdicts, "the Ashworth doctrine was called by DAVIS on bar 12" — typed, caused, musically stamped, beat-quantized. The bus even has the accountability precedent: `loisActivity` records `KINETIC_TAP` events into an activity log. An arm event + a recording listener that stamps it into the take's input log would make bus traffic **log-accountable** — the one leg of the admission test (§9) the bus doesn't natively have.
- **Data / state — no, by design.** The bus is fire-and-forget; payloads may be non-serializable (a function rides `AUDIO_ROUTES_EDIT`; the code admits in-process only); nothing on the bus is recorded into a take, and `seq` resets per take. KC-1's replay authority is **recorded state + stamps**, never event history. Any design that *needs* the bus to remember is broken on arrival.
- **The actual KC-1 pattern for "capabilities available to all"** is what the shelf + rayGunForm already demonstrate: **pure modules with record-shaped inputs**, imported by whoever needs them, plus **published fields** read at the seam (the dish culture), plus **bus signals** for theatre and UI. "Bidirectional and available to all" is achievable in this grammar — §9 writes it as flows; §10 P5 scopes the bus slice itself (typed treatment events + the take-log listener + a named `treatments` surface on the shelf pattern). **Sequence: treatments first, bus records once there is traffic to record** — with one exception argued in D4.

---

## 9. Bidirectionality design — every flow, its direction, and its contract

**Proposal: a shared capability bus adopts DISH LIFE's four-part admission test.** Any flow below that cannot show (1) **seeded/replayable**, (2) **sheddable**, (3) **lock-respecting**, (4) **log-accountable** does not ship. Flows are stated as *caller → capability* (invocation, record-shaped) or *publisher ⇒ reader* (field/state, read-only).

| # | Flow | Direction | Determinism / replay contract | Admission test |
|---|---|---|---|---|
| F1 | Director / DAVIS / performer **calls** the treatment engine (rayGunForm + successors) | Caller → pure module; result lands as a **record on the form** (today's `{mode, seed}`) | Stream drawn from a registered channel base (the `POEM_RAYGUN_BASE` pattern — one base per consumer, never shared clocks) | ✓ all four: seeded stream; sheds by record removal; held/kept forms sovereign; the record *is* the log |
| F2 | WetLab **authors** a treatment record (on a creature record or a sample form) and previews it | Authoring-time write → document record → seam reads | Record lives in the document; preview runs the same pure module | ✓ — with the §7 fidelity caveat: previews are honest for bake/geometry treatments, labelled for GL-only ones |
| F3 | MATH item **publishes a field** ⇒ field items read it at the resolve | MATH ⇒ type (one-way, read-only) | The field is a pure function of layer params (document state) | ✓ if treatment-gated: unarmed forms bit-identical (lock-respecting = the held-form doctrine); sheddable as a `math/<kind>` tier |
| F4 | FX item **aimed by the poem zone** | Seam computes the zone (per build, from item geometry) ⇒ FX pass consumes it as a mask | Zone is derived from document state each build; nothing stored | ✓ — the zone computation is the same one the plate room already performs and restores exactly |
| F5 | DISH culture **publishes level/activity** ⇒ type reads (glyph breathing, scale) | Culture ⇒ type (one-way) | Culture state is a function of the stamped seed (`fieldStamp` on the input) + step count | ✓ — this is the scoped DISH LIFE consumer contract itself (coupling-gated; coupling 0 = the flow is closed) |
| F6 | Poem **stamps into** the culture seed / CA walls | Poem → automaton state, **at boundaries only** (deal; ruled cycle re-seed) | The stamp is a pure function of the composition at the boundary; the re-seed samples the **untreated** composition | ✓ if boundary-only. **✗ FLAGGED:** any mid-performance write from the poem into a live grid breaks seeded/replayable and the one-way contract — designs S1/S3/L1 are legal *only* in their boundary form |
| F7 | Creature/beast state **biases** type (a roaming beast's trace field ⇒ nearby glyphs lean/fade) | Beast ⇒ published trace/density field ⇒ type reads | The trace field must be derived from recorded state (the beast's seed + crank/step counts are), never from wall-clock | ⚠️ conditional ✓ — legal only through a *published field* (F5's shape). **✗ FLAGGED:** type reading live creature objects directly (positions off the roam state) couples replay to the roam's frame history — the field indirection is mandatory |
| F8 | Bus **signals** for arms/verdicts (treatment:arm etc.) | Any caller → bus → UI/tape + a listener stamps the take's input log | Signals are theatre; the **record** (F1) remains the replay authority — replay must never consult the event log | ✓ only with the recording listener (§8d); without it the flow fails log-accountable and must not carry anything load-bearing |
| F9 | KINETIC/CURATOR (the shelf pattern) exposing `treatments` | Named surface: `arm / disarm / read` over the same records | The surface owns no state; writes go through the owning slice (the shelf precedent) | ✓ — this is the "core API" shape KC-1 already trusts |

**The one-sentence constitution:** capabilities are *called* (records in, pure functions out), state is *published* (fields, read-only), signals are *announced* (bus, recorded by a listener, never load-bearing) — and nothing per-frame ever writes another system's state.

---

## 10. Scoped proposals — in slice order

### P1 · TORN & XEROXED — bake-side glyph variants, and the treatment learns to substitute *variants*
**What:** The generators gain variant passes over the existing faces: **torn** (path clipped on a seeded tear line, halves offset), **degraded** (outline erode/bite — photocopy generation loss as geometry), each as new poem-only stamp packs in the standing containment pattern. `rayGunForm` gains a variant-substitution step inside its draw: keyed by (seed, stamp index) off the treatment stream, a stamp's `assetId` may move to *its own letter's* torn/degraded variant — `ch` never changes, the stored form never changes, the door never sees it.
**Touches:** `scripts/gen-*.mjs` (variant passes), new `assets-*` packs, `poets/rayGunForm.js` (+ its floor law, amended per D1), containment selfchecks on the slices 1–3 pattern.
**Law:** FONT RULING (variants are baked — no runtime shape work); poem-only containment; #2006 exemption named in the record.
**Size:** **M**. **Matt sees:** CARSON and SHOT where letters are actually *ripped and xeroxed*, not just moved — the Blah Blah Blah texture enters the pole.

### P2 · SWISS GRIT — the Ashworth mode
**What:** A fourth treatment mode, A1/A2 mechanized: the form is first **re-set on a strict modular grid** (positions snapped to a coarse module, disciplined tracking — a Swiss base state computed inside the draw), then destruction is applied as **ruled violations** off the treatment stream: a seeded subset of glyphs shifted exactly one module, one row overprinted onto its neighbour (offset duplicate at full weight — C4 in miniature), one column dropped a module. Per A2, the grid module itself is drawn per-record from the stream (no house template).
**Touches:** `poets/rayGunForm.js` (new mode), `poets/poemRow.mjs` (mode cycle — POEM_RAYGUN_BASE stream already serves any mode), its selfcheck.
**Law:** word recoverability floor (the grit reads *because* the grid is recoverable); treated-list-never-stored.
**Size:** **M** (S if the grid base reuses placement pitch data cleanly). **Matt sees:** a poem set like a Swiss poster — then systematically wronged. The missing half of the magazine.

### P3 · THE SHARED DISTORTION CHANNEL — per-item tear/displace at the seam (the engine for type, assets, and creatures)
**What:** A per-item spatial distortion carried the way velocity smear already carries stretch: a distortion record on an item list (shear/melt/tear-by-bands parameters, seeded) consumed in the resolve as per-instance vertex data — **zero fullscreen passes**. Producers: `rayGunForm` gains a DISTORT stage for type (glyphs shear and melt per-instance); creature and beast items are eligible *by being items* (their records may carry the same record shape later, under F2/F9). Companion half-slice: **FX zoning** — DISPLACE/TEAR passes accept the poem zone (already computed for the plate room) as a mask, so the existing fullscreen tears can be aimed at the poem and recorded.
**Touches:** `gl/velocitySmear.mjs` (carrier pattern), `engine/kernel/itemMorph.mjs` (delivery), `gl/liveResolve.mjs` (channel + shed tier), `engine/buildPlacements.js` (field items carry the record; zone mask export), `gl/effects/fxShaders.mjs` (mask input), `gl/kernel/costRegistry` (new tier).
**Law:** beast geometry rule (§7 — distortion applies to emitted stamps, never joints/measures); treatments stay OUT of the creature genome until ruled; shed lands on distortion *heat*, not on/off.
**Size:** **L**. **Matt sees:** type that melts and tears *in the material*, the same melt available to a creature's wing or a beast's trace — one engine, every citizen. This is Matt's (d), built at the only address where "available to all" is true.

### P4 · POEM ↔ LIFE — boundary-stamped interaction on the dish rails
**What:** Two armed treatments in the raygun record family, per §5: **BEDROCK** (a standing poem's cells join the culture's terrain — life flows around the words; HELD poems join automatically under the existing locked-element law) and **SEED** (at deal, the form's stamps enter the culture seed via `dishLifeSeed`; the garden blooms from the words and its decay eats them — for Conway layout mode, the same stamp writes glyph walls into `caGrid`). Long-poem form: SEED follows the lines (L1) rather than the whole field. Re-seeds sample the untreated composition (hard part 4).
**Touches:** `engine/dishLifeSeed.mjs` / `dishLifeField.mjs` (seed admission for field items), `engine/ca-engine.js` + layout CA consumer (wall mask at deal), `poets/rayGunForm.js` record family (the arming record), `curator/fieldDirector.js` (the call), #2006 exemption naming.
**Law:** one-way contract (boundaries + reads only); DISH LIFE four-part test per flow (§9 F5/F6); coupling discipline unchanged.
**Size:** **M**. **Matt sees:** a short poem planted in the dish grows a garden that devours it; a long poem becomes the coastline the culture breaks against.

### P5 · DOCTRINES + THE TREATMENT BUS RECORDS — Carson and Ashworth as callers; the bus learns to log
**What:** (i) Two named **doctrines** inside the Director's treatment call — **CARSON** (arms hot: geometry modes, high heat, heroes) and **ASHWORTH** (arms Swiss Grit + degradation, process-first) — choosable by the performer, callable by DAVIS unattended, reviewed by LOIS via #2006; seated as doctrine rows in the DIRECTORS motion surface, **no new personas, no new matrix axis, no fifth stratum** (unless D2 rules otherwise). (ii) The bus slice: typed `treatment:*` events (arm/disarm/verdict) added to `eventBus` + `eventRegistry`, a **recording listener** stamping arms into the take's input log (log-accountable), and a named `treatments` surface on the shelf pattern (`curator/shelf` sibling) exposing arm/disarm/read to KINETIC/CURATOR/WetLab callers (F8/F9).
**Touches:** `curator/fieldDirector.js` (doctrines), `composition/eventBus.js` + `eventRegistry.js` (typed events + drift selfcheck), a take-log listener, `curator/shelf.mjs` pattern (new surface), DIRECTORS motion surface.
**Law:** models score/order, never gate; the record remains the replay authority — the bus announces, it does not carry state (§8d).
**Size:** **M** (doctrines S; bus records M). **Matt sees:** the DIRECTORS surface gains two temperaments he can hand a stage to — and every treatment act in a performance is on the take's log, named and caused.

**Order rationale:** P1–P2 are type-only and ride the shipped record architecture (value now, no new plumbing). P5's bus half sits **between** the type-only engines and the cross-system ones (P3–P4) in value, but is listed last because its doctrines want P2's Ashworth mode to exist; if Matt rules bus-first (D4), P5(ii) splits off and goes first without disturbing the rest.

---

## 11. Open decisions for Matt (four — one question each)

**D1 — Face-mixing inside a treatment.** *May a treated stamp's `assetId` move, at draw time only, to the same letter's version in another poem-only face (Anton ↔ serif ↔ plate) — amending rayGunForm's glyph-identity floor to "keeps its `ch`; its face may move" — or should mixing be baked as a pre-mixed "drawer" pack the door affirms as a face of its own, or no face-mixing at all?*
Options: (a) draw-time face swap · (b) baked drawer pack · (c) none.
**Recommendation: (a)** — the treated list is never stored, so the door law is untouched; every existing mode gains the contents-cover stack for free; (b) remains available later as a curated face.

**D2 — Directors or doctrines; four strata or five.** *Should Carson and Ashworth arrive as two new director personas in the DIRECTORS panel (new room-matrix axis, new signed copy and gains) plus a possible fifth stratum for treatments — amending your 2026-10-15 strata ruling — or as named doctrines the existing Director/DAVIS can call, with treatments carried by records and no new stratum?*
Options: (a) personas + consider a 5th stratum · (b) doctrines, stack stays 4.
**Recommendation: (b)** — the panel cost of personas is a multiplication of signed material for the same behaviour; doctrines deliver the temperaments, and the record architecture already gives treatments a finer address than a stratum could.

**D3 — Poem ↔ Life: armed or ambient.** *When a poem stands on a dish with a live culture, should interaction be armed-only (BEDROCK and SEED both ride treatment records, off by default), or should a standing poem be terrain by default — with HELD poems joining the culture's existing bedrock law for locked elements either way?*
Options: (a) armed-only, held poems excepted · (b) bedrock-by-default for all standing poems, SEED armed-only.
**Recommendation: (a)** — default-on terrain silently changes every shipped dish that has both a poem and a culture; arming keeps the act named, logged, and review-exempt-legible.

**D4 — Bus sequencing.** *Should the treatment bus records (typed `treatment:*` events + the take-log listener + the named `treatments` surface) be built BEFORE the new cross-system engines (P3/P4), so their flows are born log-accountable — or after P1/P2 land, accepting that P3/P4 design against the §9 contract and adopt the bus when it arrives?*
Options: (a) bus records first (split P5(ii) ahead of P3) · (b) treatments first, bus between P2 and P3 (the §10 order).
**Recommendation: (b)** — the §9 admission test disciplines P3/P4 on paper at zero build cost; the bus built second records real traffic instead of anticipated traffic. (a) is the right call only if Matt wants the bus itself reviewed as a standalone piece first.

---

*End of research doc. Audit worktree: `~/workspace/kc-raygun-research` at origin/main 8e85f860. No code written, no commits, no GitHub writes.*

---

## Rulings (Matt, 2026-11-06, recorded by the coordinator)

- **D1 RULED: (a) draw-time face swap.** A treated stamp keeps its `ch`; its face may move at draw time only (Anton ↔ serif ↔ plate). The stored form and the door law are untouched; the rayGunForm glyph floor is amended to "keeps its `ch`; its face may move." The baked drawer pack (b) remains available later as a curated face.
- **D2 RULED: (b) doctrines, stack stays 4.** Carson and Ashworth arrive as named doctrines the existing Director/DAVIS can call — no new personas in the DIRECTORS panel, no fifth stratum; the 2026-10-15 strata ruling stands unamended.
- **D3 RULED: (a) armed-only.** Poem ↔ Life interaction rides treatment records and is off by default (BEDROCK and SEED both armed); HELD poems join the culture's bedrock law for locked elements either way.
- **D4 RULED: (a) bus records first** — against the research recommendation. The treatment bus records (typed `treatment:*` events + the take-log listener + the named `treatments` surface, split out of P5 as its records half) are built BEFORE the new cross-system engines (P3/P4), so the bus is reviewed as a standalone piece and every engine flow is born log-accountable. RAY GUN line fully scoped 2026-11-06: bus records → P1 Torn & Xeroxed → P2 Swiss Grit → P3 Shared Distortion Channel → P4 Poem ↔ Life → P5 doctrines remainder. Filing awaits Matt's word.
