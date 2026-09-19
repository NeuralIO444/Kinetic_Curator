# Asset lab — species, not 205 cells

Deferred Studio idea. Haeckel plates + Oxman materials + a Spore-sized editor. The locker in ASSETS stays a locker ([ASSET_CHANNELS](ASSET_CHANNELS.md)). The lab is a **second room on the Studio plane** ([TWO_PLANES](TWO_PLANES.md)).

Do not implement instead of #387. Do not open a tile inspector under every blob.

## 1. The instinct, named

You select plates → send them to a lab → grow their biology → they run in KC-1 with different habits.

That is already half-built:

- Plates = SVG assets (organic row in the pool).
- Habits = `behave` profiles (cruise / flock / orbit / scatter) + flap + bio-drives (#287).
- Climate = FIELD / FEED / MOD on the **track**.
- Breeding = Evolve / Curator / seed — not a neural net per leaf.

Spore worked because you edited a **creature**, then dropped many instances into a world. You did not open 205 unique brains. Oxman / Haeckel worked because *form was metabolism*, not because each drawing had a timeline.

## 2. Object model

```text
plate     one SVG (what you see in the locker)
species   genome + default plates + tags     ← lab edits THIS
instance  index i on a track                 ← simulation
```

A species genome is data, not a plugin:

```text
species = {
  id, name,
  plates: [assetId…],          // locker still picks H/M/L
  face: 'none' | 'velocity',   // M1
  behave: 'flock' | 'cruise' | …
  flap: 0..1,
  metabolism: { hunger, mold, pigment },  // existing drives, scaled
  channels: { inkRole, accentRole },      // how R/G reads
}
```

Double-click a plate in Studio → lab opens **its species** (or asks to fork). You are editing the cell line, not one sprite.

Perform never opens the lab. The show packs species ids + enabled plates.

## 3. What "train / modify" means here

Not weights. Not CLIP per petal.

| Verb | Honest meaning |
|------|----------------|
| Grow | Tweak metabolism sliders, flap, face. Watch 20 instances in a dish. |
| Breed | Fork species. Cross two genomes = average + noise (Davis Evolve). Snapshot if you like it. |
| Train | Run Evolve in the dish for N breaths. Keep. No backprop. |
| Depth | R/G(/B) authored into the plate + flap phase. Not a z-extrude editor. |

The dish is a tiny KC-1: one track, one wind, clock optional. Same integrator. If the dish uses a second particle system, kill it.

## 4. Room

**TE.** One lab. One genome shape. Three sliders showing. Fork is DUP at species level. If the lab needs a tutorial, it is too big. 205 tiles that each open Spore is the death of the locker.

**Davis / Oxman.** The plate *is* the body plan. Veins on G, breath on flap, hunger on the integrator — that is material ecology. Do not hide a node graph behind "biology." A species that flocks vs a species that cruises is enough difference for a set. Two climates on four tracks do the rest.

**Spore lesson.** Creature editor was a *mode*. Galaxy was another. They shared a genome file. Studio lab / Perform show is that split. Do not let the editor run during the concert.

## 5. Roadmap

```text
now     spine A–C (the dish would lie if heading is still 10°/frame)
then    D (two-channel plates)
then    M1 face flag
later   L0  species.json next to voices — data only, no UI
        L1  Studio double-click → dish + 4 knobs + fork
        L2  pack species into a show
never   per-tile network, 3D voxel cell, PBR, liveLoop WASM, lab on Perform
```

L0 can wait until three flagship voices are honest. A species pack is DLC, same as costumes.

## 6. Do not

- Call H/M/L "DNA" and stop. That is a rename.
- Train a model on clicks in the locker.
- Give each organic SVG its own `behave` override before species exists (you will never find the knob).
- Grow geometry in the lab (new paths every breath). Plates stay authored SVG.
- Start L1 while #387 is open.
