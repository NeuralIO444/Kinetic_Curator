# Chip lab — deferred

Same paradigm as [ASSET_LAB](ASSET_LAB.md). Studio double-click opens an editor. Perform plays the result. **Embargo:** [EMBARGO.md](EMBARGO.md) until spine C is felt.

## 1. Chips are not one type

[TEMPO_AND_CHIPS](TEMPO_AND_CHIPS.md):

| Chip | What double-click should mean |
|------|-------------------------------|
| **System** (grid, ca, stub swarm) | Edit the *engine recipe*: sampler + default behave + defaults. Advanced. Rare. |
| **Voice** (Night Migration …) | Edit the *complete state*: palette, params, FX, assets, `blendSeconds`. This is the real lab. |
| **Preset** (Smoke Study …) | Edit costume on top of a system. Fork → voice if it grows a signature duration. |
| **Species** (from asset lab) | Not a chip until packed into a voice. |

Perform deck only sees packed voices/presets. The lab is Studio.

## 2. Genome, not a second product

A voice already *is* a genome (`voices.js`: params + palette + fx + assets + blendSeconds). The missing piece is a **dish**: one track, same integrator, sliders that write that object, fork/save to MY VOICES.

```text
chip genome = {
  kind: 'system' | 'voice' | 'preset',
  host: mode,                 // chassis
  plates: enabled assets,
  species?: id,               // if asset lab exists
  behave, count, scale, …     // existing params
  palette, fx,
  blendSeconds,
  face / scroll?              // after M1/M2
}
```

Double-click SWARM → dish of Night Migration. Change hunger, face, plates. Save as MY VOICE or overwrite if yours. Flagships stay read-only unless forked.

Double-click `grid` → system recipe (dangerous). Default: "this is an engine, fork to a voice to give it a look." Do not let stubs pretend they are Migration.

## 3. Advanced systems

"Build more advanced systems" means **compose existing axes**, not a node graph.

Legal composition:

- system (sampler) + species + palette + FX + blendSeconds → new voice
- two species on two tracks in the dish (tape still 4)
- PATCH OFF/MOD/FIELD/FEED between those two tracks

Illegal:

- New force type in the lab
- Per-chip WASM, HarfBuzz, custom GLSL
- A system that only runs UNCAPPED

If the dish needs a fifth track, the system is unclonable ([SYNTHETIC_BIOLOGY](SYNTHETIC_BIOLOGY.md) burden).

## 4. Room

**TE.** One editor chrome for voice and species. Four to eight knobs visible; the rest behind MORE. Flagship keys stay factory-sealed. Fork is the only write.

**Davis.** A voice is DNA you can breed. The lab is Ghost Station with a lid: Evolve in the dish, SNAP if it sings, pack into the show. Do not author 28 new chips from the mosaic — author from the dish and hide the farm.

## 5. Order (after embargo)

```text
C felt     body honest
E + T1     wipe + clock so a saved voice can land on 1
P0         STUDIO / PERFORM label
L0         species.json + voices already exist as data
C1         Studio double-click voice → dish + fork to MY VOICES
C2         system double-click → "fork to voice" wizard
C3         two-track dish + PATCH (optional)
```

Hits tray becomes the show packer (TWO_PLANES P1). Do not add a second tray.

## 6. Do not

- Ship the editor on the Perform mosaic.
- Give stubs `blendSeconds` so they look voiced.
- Node graph.
- File C1 while #387 is open.
