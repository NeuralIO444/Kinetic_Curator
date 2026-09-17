# Preset Library — Showcase (#220)

Ten opinionated presets, one per engine mode, each shipping **palette +
composition recipe + render proof**. Presets are the instrument's voice —
sliders are for tuning a preset you already love, not for finding one.

Conventions, all enforced:

- **Preset id = palette id.** Each preset pairs with the same-id catalog
  palette (`app/src/data/palettes.js`); the proof project JSON carries both.
- **One engine mode per preset** — swarm, hype, ca, flow, noise, layers,
  rails, radial, orbit, stratified — pulled from existing systems. No
  invented modes, no new assets.
- **Proofs are RENDER FINAL at 1400×980** via the headless export path
  (`node app/src/gl/exportStill.mjs docs/presets/<id>-project.json --out
  docs/presets/<id>-final.png --res 1400x980 --uncapped`), seed pinned in
  the project JSON. Re-render is deterministic for the same seed.

## The ten

### 1. MURMURATION — `swarm` (seed 7)

Dusk flock: cohesive boids (`swarmCohesion: 1.5, damping: 0.96`) over deep
indigo. `paletteShift: 'split'` keeps pale bodies against slate wings; one
ochre accent for the stray.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#f4f1de` | flock body |
| 2 | `#e0ddcf` | flock body (repeat) |
| 3 | `#8899bb` | slate wing |
| 4 | `#3d5a80` | deep wing |
| 5 | `#22303f` | shadow |
| 6 | `#d9a441` | the stray |

Ground: `#0d1626`. Proof: `docs/presets/murmuration-final.png`.

### 2. NEON BROOD — `hype` (seed 13)

Blacklight organism: moth·hype at full scatter, `zone` coloring so each
colony reads as one neon. Bleed on — the glow is the point.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#ff2fb3` | brood pink |
| 2 | `#00f5d4` | brood teal |
| 3 | `#fee440` | brood yellow |
| 4 | `#00bbf9` | brood blue |
| 5 | `#9b5de5` | brood violet |
| 6 | `#f15bb5` | brood magenta |

Ground: `#050505`. Proof: `docs/presets/neon-brood-final.png`.

### 3. PETRI BLOOM — `ca` (seed 21)

Agar colonies: mirrored cellular automaton, `band` coloring painting
concentric growth rings. Small scale (`0.25–0.7`), high density, no bleed —
colonies stay crisp.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#1d6a5a` | green colony |
| 2 | `#e36414` | orange colony |
| 3 | `#9a031e` | red colony |
| 4 | `#5f0f40` | plum colony |
| 5 | `#fb8b24` | amber edge |
| 6 | `#2a9d8f` | teal colony |

Ground: `#f4f1ea` (agar). Proof: `docs/presets/petri-bloom-final.png`.

### 4. RIVER DELTA — `flow` (seed 33)

Sediment drift: flow-field layout with `displacement: 30` curling the
bands; soft blobs marble over linework so the channels read continuous.
Bleed on.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#cdeac0` | sand bar |
| 2 | `#7fb3d5` | shallow water |
| 3 | `#2e86ab` | channel |
| 4 | `#a9d6e5` | silt |
| 5 | `#f4a259` | iron sediment |

Ground: `#0a2239` (deep water). Proof: `docs/presets/river-delta-final.png`.

### 5. STATIC BLOOM — `noise` (seed 42)

Phosphor interference: noise-warped dots at `displacement: 120`,
`noiseFreq: 0.01` — the field tears the dots into scanline ghosts.
`split` palette: greys carry the bloom, red/green are the interference
hits.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#e8e8e8` | phosphor white |
| 2 | `#9a9a9a` | phosphor grey |
| 3 | `#4d4d4d` | dark scan |
| 4 | `#ff3b30` | interference red |
| 5 | `#34c759` | interference green |

Ground: `#0d0d0f`. Proof: `docs/presets/static-bloom-final.png`.

### 6. STRATA — `layers` (seed 55)

Geological cut: layers mode mirrored, six z-tiers, `zone` coloring so
each tier reads as one sedimentary band. Near-still
(`lifeDrift: 0.05`) — this one is a wall piece.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#c9a227` | ochre seam |
| 2 | `#8b5a2b` | sienna bed |
| 3 | `#d8cfc0` | limestone |
| 4 | `#4a4e69` | shale |
| 5 | `#22223b` | basalt |

Ground: `#191410`. Proof: `docs/presets/strata-final.png`.

### 7. TRANSIT — `rails` (seed 77)

Metro diagram: rails with full rotation (`-90..90`), five-line zone
coloring on paper. Linework carries the network; the diamond stamps are
interchanges.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#e63946` | red line |
| 2 | `#1d3557` | blue line |
| 3 | `#f4a259` | orange line |
| 4 | `#2a9d8f` | green line |
| 5 | `#111111` | trunk line |

Ground: `#f5f2ea` (paper). Proof: `docs/presets/transit-final.png`.

### 8. SOLAR MAX — `radial` (seed 91)

Coronal storm: mirrored radial bloom, `band` coloring from corona white
through ember. `lifeDrift: 0.22` — this one wants to be performed, not
framed.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#ffd166` | corona |
| 2 | `#ef476f` | flare pink |
| 3 | `#f78c6b` | flare salmon |
| 4 | `#fff3b0` | white-hot core |
| 5 | `#fb8500` | ember |

Ground: `#1a0a00`. Proof: `docs/presets/solar-max-final.png`.

### 9. PERIHELION — `orbit` (seed 101)

Deep orbit burn: orbit rails on near-black, `split` palette — cold greys
carry the rings, one ember orange marks perihelion. Bleed on so the burn
glows.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#e0e1dd` | ring ice |
| 2 | `#778da9` | ring slate |
| 3 | `#415a77` | ring shadow |
| 4 | `#1b263b` | deep field |
| 5 | `#ff6b35` | perihelion burn |

Ground: `#04070f`. Proof: `docs/presets/perihelion-final.png`.

### 10. TIDEPOOL — `stratified` (seed 123)

Intertidal zones: mirrored stratified drift, `band` coloring across
algae/sand/anemone. Pale ground, bleed off — the bands stay crisp like
tidemarks.

| Slot | Hex | Role |
|------|-----|------|
| 1 | `#2a9d8f` | algae |
| 2 | `#e9c46a` | sand |
| 3 | `#e76f51` | anemone |
| 4 | `#264653` | kelp |
| 5 | `#f4a261` | shell |

Ground: `#eef4f1`. Proof: `docs/presets/tidepool-final.png`.

## Regenerating

All proofs: `node app/src/gl/exportStill.mjs docs/presets/<id>-project.json
--out docs/presets/<id>-final.png --res 1400x980 --uncapped`.

The project JSONs are generated from `app/src/data/presets.js` (preset id
group `showcase`) plus a per-preset asset allowlist — `presets.js` is the
single source of truth for params; the JSONs pin the seed, palette id, and
enabled assets for the headless render.

## Where presets live in the app

- Chips: `app/src/panels/layout/PresetBrowser.jsx` → new **Showcase** group
  (first group, before Classic).
- Params: `app/src/data/presets.js` (`COMPOSITION_PRESETS`, group
  `showcase`).
- Palettes: `app/src/data/palettes.js` (10 new catalog entries).
