# LOIS

Terminal companion for a Kinetic Curator session. Side-quest
([#956](https://github.com/NeuralIO444/Kinetic_Curator/issues/956)).
Not the instrument. Nothing in `app/` is touched.

He is an affective mirror of the operator, not a pet. No hunger, no
starving critique, no folder he ranks. CRIT stays parked behind #954.

## Four rows, nothing else reflows

```
[ ✦ _ ✦ ]
GOLD
Favorited 9 seconds after the render. That's conviction.
last keep   seed 1842   mustard   9s ago    c copies
```

The face is the appraisal. The sentence cites a number. The chip keeps
the recipe — a clear does not clear him.

`?` is the field guide. Transitions play once (~14 fps), then hold.
Palette is ink `#1A1A1A`, cream `#F2EAD8`, signal red `#C8102E`,
mustard `#D9A441`. GOLD is mustard on ink. A terminal cannot do foil.

## Run

```bash
cd lois
pip install -e .
lois demo          # scripted session, every state has a cause
lois read journal.json
lois watch journal.json
lois play ./frames --journal journal.json
```

`watch` tails the file and shows the latest event. It does not replay.
`demo` replays a scripted session in memory. It does not write a file.

`play` marks `seed-1842.png` or `1842.png` when that seed was kept or
exported. `plate_99` is not a seed. He does not rank the unmarked.

## Journal

Timestamped events, milliseconds. The app does not write this yet —
wiring the honest feed (`app/src/curator/loisActivity.js`) to a file
would be instrument work, and this issue forbids that.

```json
{
  "version": 1,
  "events": [
    {"t": 0, "type": "curate"},
    {"t": 9000, "type": "favorite", "seed": 1842, "paletteId": "mustard", "msSinceSeed": 9000}
  ]
}
```

Event types: `activity`, `curate`, `roll`, `favorite`, `export`,
`recall`, `param`, `undo`, `fault`, `clear`, `layer_remove`, `dwell`,
`seed`, `return_seed`, `idle`.

A favorite with no `msSinceSeed` is a keep, not conviction. Legacy
time-of-day stamps stay uninvented.

## Checks

```bash
cd lois && PYTHONPATH=. python -m unittest tests.test_derive
```
