# Bio-Drives: Oxman's biology, peppered into the instrument

*Plan only — no code. September 17, 2026.*

Matt's direction: give the moth/creature systems behavior, instinct, desire, agency — mechanisms like build, destroy, mold, swell, leak. Explicitly **not** a dedicated tab; peppered around the existing instrument. Standing bars: systems that build systems (never kitchen sink), and the manifesto's Oxman gate — *does it grow, or does it stamp?*

## 0. Ground truth: the engine is already half-alive

Verified against main (`414fcfb`):

- **`behave.js`** — steering is weight rows, not force types: `cruise / flock / orbit / scatter`. The file's own header: *"Adding a profile is a row in BEHAVE, not a new force type."* New instincts are cheap rows.
- **`particles.js`** — SoA `ParticleSystem`: hot columns (`x,y,vx,vy,ax,ay,mass,scale,rotation,alpha,phase,u,seedOffset,assetIndex` + `alive/cgroup` + `color[]`, `spine[]`). Organism mode (`hype`) builds segmented spine bodies, `u` selects wing-ladder frames (2 shipped ladders: `wing-open`, `pair-2`), flap and turn-rate limiting already in the integration loop.
- **Birth and death already exist** — the contact integrator (`#167`) has `die` (marks dead, recycles into freelist) and `breed` (child at parents' midpoint, inherits one parent's costume/collide layer, deterministic). Building and destroying *agents* is done; the gap is building/destroying *the field*.
- **ACCUM** (`gl/sceneContract.js`) — feedback pass with `fade, optics, tunnel, prism, flow, echoes`. Drawing into it is already deposition; nothing erodes it.
- **Fields kernel** (`engine/kernel/field`) — scalar fields sampled O(1); `makeCaField` exists. A field channel is cheap infrastructure.
- **Palettes** (`data/palettes.js`) — data-driven; per-particle `color[]` assigned at init, never touched again.
- `bleed` in layout params is placement margin (off-canvas), **not** pigment bleed — the name is free for the real thing.

So the plan adds *drives*, not organs. Nothing here is a new renderer, a new panel, or a creature editor.

## 1. The six mechanisms that survived the bar

Each names its concrete touchpoint, where it peppers into the existing UI, and the family it unlocks. If it doesn't unlock a family, it died (see §2).

### 1. DRIVES — instinct/desire as a per-agent energy layer
- **What:** three slow variables per agent — *hunger* (seek density), *fatigue* (damp over time), *curiosity* (wander gain). They modulate the existing steering forces, nothing else. Organisms, not particles.
- **Touchpoint:** two new hot columns in `particles.js` (`energy`, `drive` — packed into the existing Float64 SoA; the inner loops already hoist columns). Modulation applied in the force pass where `windMul`/`attractMul` already multiply.
- **Peppered:** one slider in BUILD near the behave profiles — METABOLISM. No new panel. Profiles stay profiles.
- **Unlocks:** temperament voices (lively / drowsy / starving creatures), performances where the cast tires across a set. The substrate every other mechanism below reads.
- **Gate:** a *layer*, not a feature — energy → force modulation composes with any mode, any voice, any asset.

### 2. SCENT FIELD — the invisible shared substrate
- **What:** a coarse CPU grid (e.g. 64×36) that agents write to and read from: deposit, diffuse, decay. Never rendered directly; it steers behavior. Exactly like the spatial hash — infrastructure, not UI.
- **Touchpoint:** new module beside `engine/kernel/field/` (same `{ sample(nx,ny) }` contract the kernel already uses). O(1) reads in the neighbor loop.
- **Peppered:** no UI at all. It exists so LEAK and MOLD have somewhere to write.
- **Unlocks:** everything stigmergic — scent trails, territory, foraging. One system, two named mechanisms ride it.
- **Gate:** pure substrate. Systems that build systems, literally.

### 3. LEAK — agents bleeding scent and pigment
- **What:** agents deposit into the scent field (scent-leak, rides §2) and bleed palette color into neighbors (pigment-leak: per-agent color drifts toward the local average in the neighbor pass — ink in water).
- **Touchpoint:** scent deposit in `particles.js` update; color diffusion over the existing `color[]` column in the same neighbor walk the boids loop already does (no new pass).
- **Peppered:** a per-palette property (`leak: 0..1` in `data/palettes.js` — palettes are already data). Some palettes melt; most don't.
- **Unlocks:** palettes that *mix over time*, colonies that tint each other, Oxman's gradient materiality as a live process.
- **Gate:** color was assigned once at init and frozen — a stamp. Leak makes it grow.

### 4. MOLD — slime-mold branching toward attractors
- **What:** chemotaxis on the scent field: agents follow scent gradients, deposit scent, branch at low density. Physarum on a plate.
- **Touchpoint:** a new row in `BEHAVE` (`mold: { sep, ali, coh, chemotaxis, deposit }`) — the repo's own convention says profiles are rows, not force types. One new force term in the force pass, gated on the profile id.
- **Peppered:** appears as a behave profile next to cruise/flock/orbit/scatter. No new controls.
- **Unlocks:** the coral/vein/mycelium family; pairs with reaction-diffusion (already sequenced in the technique matrix) as the offline-grown counterpart.
- **Gate:** one row + one term; the scent field does the heavy lifting. The *combination* is the system.

### 5. GRAZE — destroy, of the field
- **What:** some agents erode ACCUM brightness beneath them — trails get sculpted, negative space gets carved. Build (deposit) is free; this is the missing half. Birth/death of agents exists (`die`/`breed`); this is death of *marks*.
- **Touchpoint:** ACCUM feedback shader (`gl/sceneContract.js` accum contract) gains an erode term; per-agent trait (grazer flag, one bit on `cgroup` or a new Uint8 column) set by voice preset.
- **Peppered:** rides the existing ACCUM controls; grazers are a voice-level trait, not a slider.
- **Unlocks:** predator/prey voices, carving voices (sculpting light out of fog), palimpsest performances where old trails are eaten.
- **Gate:** completes the stigmergy loop — deposit without erosion is a stamp that only accumulates. Erosion makes the field *alive*.

### 6. SWELL — breath pulsing tied to energy
- **What:** scale pulses with the drives layer: `scale *= 1 + breath · sin(phase + seedOffset)`, breath amplitude ∝ energy. Inhale/exhale across the cast; a tired creature breathes shallow.
- **Touchpoint:** the integration loop already rewrites `this.scale[i]` every step from mass (`minScale + mi·(maxScale−minScale)`) — swell multiplies that line. Wing flap already pulses via `u`; this is the body answering.
- **Peppered:** one slider — BREATH — next to body/flap/tight in BUILD. Works on dots, moths, stamps alike (it's scale, the most universal column).
- **Unlocks:** breathing voices, pulsing choruses, creatures that visibly tire. Composes with every asset ever authored.
- **Gate:** one line, universal. The cheapest mechanism on this list and the most visible.

## 2. Killed

- **A dedicated biology tab/panel.** Matt said no, and he's right — a tab would quarantine the biology instead of infusing it. Everything above lands in existing surfaces.
- **Per-verb sliders for all six mechanisms.** Kitchen sink. The plan exposes exactly two new sliders (METABOLISM, BREATH); mold is a profile row, leak is a palette property, scent is invisible, graze is a voice trait.
- **A creature designer/editor.** Creatures already emerge from assetIndex + spine + ladder + drives. An editor would be a new surface for something the system already expresses.
- **Literal biology simulation** (metabolism chemistry, DNA, genetics). Out of philosophy — we want the *vibe* (gradient materiality, growth, agency), not a petri-dish simulator. The manifesto's translation note covers this: take the principle, not the medium.
- **Scent rendered as a visible layer.** Tempting (pheromone trails *look* cool) but it's a second renderer for debug value — stamp, not system. It stays invisible infrastructure.

## 3. Sequencing (after the fix phases and #284)

1. **Drives layer** — the substrate; everything else reads energy.
2. **Scent field** — invisible infrastructure.
3. **Mold profile + graze** — the two field-sculpting behaviors (grow the field, eat the field).
4. **Pigment leak** — color diffusion in the neighbor pass.
5. **Swell/breath** — one line in the integration loop.
6. **Voices** — each mechanism ships with at least one authored voice demonstrating its family (feeds the #280 personas queue). A mechanism with no voice is a mechanism that didn't earn its keep.

## 4. Acceptance

- [ ] Creatures visibly tire, hunger, and wander differently (drives readable on stage, not just in code).
- [ ] A mold voice grows vein-like networks no static preset could stamp.
- [ ] A graze voice carves negative space out of accumulated trails.
- [ ] A leak palette melts over minutes; a non-leak palette stays frozen.
- [ ] No new panel, no new tab; at most two new sliders (METABOLISM, BREATH).
- [ ] Governor cost model updated for the scent field + graze pass (new load must declare its tier — the TE half of the manifesto).

## 5. A pinch of Haeckel (*Kunstformen der Natur*)

Matt, September 17, 2026: Oxman gives the creatures their behavior; Haeckel gives them their bodies. Seasoning, not a course.

- **Radial symmetry as a creature trait** — the moth-body builder's symmetry parameter extends from bilateral to N-fold radial (radiolarians, medusae). Symmetry as a trait on the spine/ladder system, not a new creature type.
- **Ornamental asset shelf** — a Haeckel-flavored canon shelf: lattice skeletons, radiolarian plates, medusa bells, all under the palette-token paint contract. Feeds the asset-authoring pipeline (#281).
- **Specimen-plate voices** — compositions arranged like Haeckel's plates: grids of symmetric organisms on dark ground, taxonomic and still. A voice family, and a natural fit for the print-desk contact sheets.
- **Plate palettes** — aged-lithograph treatment: warm paper blacks, ink sepia, faded cyanotype.

Filed as a comment on #287; implementation approach to be researched as a planning pass.
