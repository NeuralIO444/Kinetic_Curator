# Chapter looks — drafts for techno, pixel and organic (#2107)

Status: **drafts for Matt's yes.** Nothing here is wired: the records below are not in `data/styleLooks.js`, so no deal, deck or Canon pin changes. Ruled 2026-11-18 on #2107: Claude drafts 4 looks per style from the Canon baselines, Matt approves, then they land, and the chapter code follows.

Each look follows the house rules for style looks (`data/styleLooks.js` header): only existing layout params, no `multiply` blend, a paired palette, and no two looks in a group share a mode. Ids are checked unique against the current 70 looks.

## What landing them takes (after the yes)

- Add the 12 records to `STYLE_LOOKS` and give the three Canon styles a `lookGroup` (ranks 8–10, after Marks).
- Re-pin what counts looks: `styleLooks.selfcheck` (70 → 82), the Canon content hashes (`canon`, `canonMotion`), `canonSettings` (techno, pixel and organic gain looks to measure from, so their measured settings stop being null), `kineticScope`, the chapters `now` deck count, and `creatureRepipe`'s expansion pin (the creature deal draws from the look list). Each is a count or hash of the look table, not a behaviour change, but the Canon and creature pins move, so this is review lane.
- **Still short after this:** the chapter deck floor is 4 looks / **8 voices** / 14 assets. Voices today: techno 2 (`dark-glass`, `noise`), pixel 1 (`abacus`), organic 5 (`flow`, `ca`, `dla`, `eden`, `voronoi-cells`). The looks clear the look axis only. The voice axis is the open question on #2107.

## The drafts

### Techno — from the TDR baseline (MAXIMUM MINIMAL)

| Look | Mode | Marks | Palette | In plain words |
|---|---|---|---|---|
| **RAIL YARD** (`rail-yard`) | rails · 460 | geometric, scanlines, stamps | TRANSIT | Maximum minimal — hundreds of small flat marks locked to strict rails, nothing rotated, nothing faded. |
| **READOUT** (`readout`) | grid · 320 | stamps, geometric | TRANSIT | The panel at rest — a hard grid of icons and ticks, evenly spaced, read like a dashboard. |
| **CIRCUIT** (`circuit`) | truchet · 260 | linework, geometric | TRANSIT | Trace and junction — tiles that turn on the quarter until the field reads as a board. |
| **SCAN SWEEP** (`scan-sweep`) | stratified · 380 | scanlines, dots | TRANSIT | The refresh — thin scanlines in horizontal bands, sliding fast and never tilting. |

### Pixel — from the Menkman baseline (BLOCK TEAR)

| Look | Mode | Marks | Palette | In plain words |
|---|---|---|---|---|
| **BLOCK TEAR** (`block-tear`) | grid · 300 | stamps, dots | COMPRESSION (Menkman) | The codec torn open — hard square blocks on the grid, shoved out of line to the edges. |
| **EIGHT BIT** (`eight-bit`) | abacus · 220 | stamps, geometric | GLITCH | Counted squares — sprites stacked on the abacus rods, every mark whole and opaque. |
| **DITHER** (`dither`) | noise · 520 | dots, stamps | GLITCH | Error diffusion — a fine field of specks whose density, not their size, carries the tone. |
| **SPRITE LIFE** (`sprite-life`) | ca · 360 | stamps, dots | COMPRESSION (Menkman) | The grid that grows — a cellular automaton spreads square by square across the screen. |

### Organic — from the Oxman baseline (GROWN, PR #2364)

| Look | Mode | Marks | Palette | In plain words |
|---|---|---|---|---|
| **GROWN** (`grown`) | flow · 180 | organic, biosynthetic | GROWN (Oxman) | Material grown in place — soft blobs and lobes leaning along one slow current. |
| **COLONY** (`colony`) | dla · 240 | organic, biosynthetic | GROWN (Oxman) | The reef that accretes — pods and drops gathering branch by branch from a seed. |
| **CELL WALL** (`cell-wall`) | voronoi-cells · 150 | organic, floral | GROWN (Oxman) | Tissue under glass — each blob fills its own cell, walls shared, no two the same. |
| **ROOT RUN** (`root-run`) | colonize · 180 | organic, linework | GROWN (Oxman) | Roots finding food — tendrils colonise the ground toward what feeds them, then stop. |

## Records (exact, ready to paste into `STYLE_LOOKS`)

```json
[
  {
    "id": "rail-yard",
    "name": "RAIL YARD",
    "group": "techno",
    "desc": "Maximum minimal — hundreds of small flat marks locked to strict rails, nothing rotated, nothing faded. Pair with TRANSIT.",
    "categories": [
      "geometric",
      "scanlines",
      "stamps"
    ],
    "styles": [
      "techno",
      "swiss"
    ],
    "paletteShift": "zone",
    "paletteId": "transit",
    "params": {
      "blendMode": "normal",
      "mode": "rails",
      "count": 460,
      "scale": [
        0.3,
        0.9
      ],
      "rotate": [
        0,
        0
      ],
      "alpha": [
        100,
        100
      ],
      "zTiers": 3,
      "jitter": 0,
      "density": 100,
      "bleed": true,
      "mirror": false,
      "overlap": false,
      "displacement": 0,
      "lifeDrift": 0.08,
      "noiseSpeed": 0.6,
      "wind": 0.15,
      "behave": "cruise"
    }
  },
  {
    "id": "readout",
    "name": "READOUT",
    "group": "techno",
    "desc": "The panel at rest — a hard grid of icons and ticks, evenly spaced, read like a dashboard. Pair with TRANSIT.",
    "categories": [
      "stamps",
      "geometric"
    ],
    "styles": [
      "techno"
    ],
    "paletteShift": "band",
    "paletteId": "transit",
    "params": {
      "blendMode": "normal",
      "mode": "grid",
      "count": 320,
      "scale": [
        0.2,
        0.6
      ],
      "rotate": [
        0,
        0
      ],
      "alpha": [
        85,
        100
      ],
      "zTiers": 2,
      "jitter": 0,
      "density": 92,
      "bleed": false,
      "mirror": false,
      "overlap": false,
      "displacement": 0,
      "lifeDrift": 0.06,
      "noiseSpeed": 0.5,
      "wind": 0.1,
      "behave": "cruise"
    }
  },
  {
    "id": "circuit",
    "name": "CIRCUIT",
    "group": "techno",
    "desc": "Trace and junction — tiles that turn on the quarter until the field reads as a board. Pair with TRANSIT.",
    "categories": [
      "linework",
      "geometric"
    ],
    "styles": [
      "techno"
    ],
    "paletteShift": "zone",
    "paletteId": "transit",
    "params": {
      "blendMode": "normal",
      "mode": "truchet",
      "count": 260,
      "scale": [
        0.7,
        1
      ],
      "rotate": [
        0,
        0
      ],
      "alpha": [
        90,
        100
      ],
      "zTiers": 1,
      "jitter": 0,
      "density": 96,
      "bleed": true,
      "mirror": false,
      "overlap": true,
      "displacement": 0,
      "lifeDrift": 0.06,
      "noiseSpeed": 0.4,
      "wind": 0.1,
      "behave": "cruise"
    }
  },
  {
    "id": "scan-sweep",
    "name": "SCAN SWEEP",
    "group": "techno",
    "desc": "The refresh — thin scanlines in horizontal bands, sliding fast and never tilting. Pair with TRANSIT.",
    "categories": [
      "scanlines",
      "dots"
    ],
    "styles": [
      "techno"
    ],
    "paletteShift": "band",
    "paletteId": "transit",
    "params": {
      "blendMode": "normal",
      "mode": "stratified",
      "count": 380,
      "scale": [
        0.15,
        0.5
      ],
      "rotate": [
        0,
        0
      ],
      "alpha": [
        60,
        100
      ],
      "zTiers": 3,
      "jitter": 0,
      "density": 90,
      "bleed": true,
      "mirror": false,
      "overlap": true,
      "displacement": 0,
      "lifeDrift": 0.08,
      "noiseSpeed": 0.8,
      "wind": 0.3,
      "behave": "cruise"
    }
  },
  {
    "id": "block-tear",
    "name": "BLOCK TEAR",
    "group": "pixel",
    "desc": "The codec torn open — hard square blocks on the grid, shoved out of line to the edges. Pair with COMPRESSION.",
    "categories": [
      "stamps",
      "dots"
    ],
    "styles": [
      "pixel"
    ],
    "paletteShift": "split",
    "paletteId": "persona-menkman",
    "params": {
      "blendMode": "normal",
      "mode": "grid",
      "count": 300,
      "scale": [
        0.3,
        0.8
      ],
      "rotate": [
        0,
        0
      ],
      "alpha": [
        90,
        100
      ],
      "zTiers": 2,
      "jitter": 30,
      "density": 96,
      "bleed": true,
      "mirror": false,
      "overlap": true,
      "displacement": 80,
      "lifeDrift": 0.1,
      "noiseSpeed": 1,
      "wind": 0.2,
      "behave": "cruise"
    }
  },
  {
    "id": "eight-bit",
    "name": "EIGHT BIT",
    "group": "pixel",
    "desc": "Counted squares — sprites stacked on the abacus rods, every mark whole and opaque. Pair with GLITCH.",
    "categories": [
      "stamps",
      "geometric"
    ],
    "styles": [
      "pixel"
    ],
    "paletteShift": "zone",
    "paletteId": "glitch",
    "params": {
      "blendMode": "normal",
      "mode": "abacus",
      "count": 220,
      "scale": [
        0.5,
        1
      ],
      "rotate": [
        0,
        0
      ],
      "alpha": [
        100,
        100
      ],
      "zTiers": 2,
      "jitter": 0,
      "density": 90,
      "bleed": false,
      "mirror": false,
      "overlap": false,
      "displacement": 0,
      "lifeDrift": 0.06,
      "noiseSpeed": 0.3,
      "wind": 0.1,
      "behave": "cruise"
    }
  },
  {
    "id": "dither",
    "name": "DITHER",
    "group": "pixel",
    "desc": "Error diffusion — a fine field of specks whose density, not their size, carries the tone. Pair with GLITCH.",
    "categories": [
      "dots",
      "stamps"
    ],
    "styles": [
      "pixel"
    ],
    "paletteShift": "band",
    "paletteId": "glitch",
    "params": {
      "blendMode": "normal",
      "mode": "noise",
      "count": 520,
      "scale": [
        0.1,
        0.3
      ],
      "rotate": [
        0,
        0
      ],
      "alpha": [
        70,
        100
      ],
      "zTiers": 2,
      "jitter": 0,
      "density": 95,
      "bleed": true,
      "mirror": false,
      "overlap": true,
      "displacement": 10,
      "noiseFreq": 0.02,
      "lifeDrift": 0.08,
      "noiseSpeed": 0.6,
      "wind": 0.15,
      "behave": "cruise"
    }
  },
  {
    "id": "sprite-life",
    "name": "SPRITE LIFE",
    "group": "pixel",
    "desc": "The grid that grows — a cellular automaton spreads square by square across the screen. Pair with COMPRESSION.",
    "categories": [
      "stamps",
      "dots"
    ],
    "styles": [
      "pixel"
    ],
    "paletteShift": "split",
    "paletteId": "persona-menkman",
    "params": {
      "blendMode": "normal",
      "mode": "ca",
      "count": 360,
      "scale": [
        0.25,
        0.6
      ],
      "rotate": [
        0,
        0
      ],
      "alpha": [
        85,
        100
      ],
      "zTiers": 2,
      "jitter": 0,
      "density": 92,
      "bleed": false,
      "mirror": false,
      "overlap": true,
      "displacement": 0,
      "lifeDrift": 0.1,
      "noiseSpeed": 0.5,
      "wind": 0.1,
      "behave": "cruise"
    }
  },
  {
    "id": "grown",
    "name": "GROWN",
    "group": "organic",
    "desc": "Material grown in place — soft blobs and lobes leaning along one slow current. Pair with GROWN.",
    "categories": [
      "organic",
      "biosynthetic"
    ],
    "styles": [
      "organic"
    ],
    "paletteShift": "band",
    "paletteId": "persona-oxman",
    "params": {
      "blendMode": "normal",
      "mode": "flow",
      "count": 180,
      "scale": [
        0.4,
        1.3
      ],
      "rotate": [
        -180,
        180
      ],
      "alpha": [
        60,
        100
      ],
      "zTiers": 3,
      "jitter": 12,
      "density": 80,
      "bleed": true,
      "mirror": false,
      "overlap": true,
      "displacement": 14,
      "lifeDrift": 0.12,
      "noiseSpeed": 0.18,
      "wind": 0.2,
      "behave": "cruise"
    }
  },
  {
    "id": "colony",
    "name": "COLONY",
    "group": "organic",
    "desc": "The reef that accretes — pods and drops gathering branch by branch from a seed. Pair with GROWN.",
    "categories": [
      "organic",
      "biosynthetic"
    ],
    "styles": [
      "organic"
    ],
    "paletteShift": "zone",
    "paletteId": "persona-oxman",
    "params": {
      "blendMode": "normal",
      "mode": "dla",
      "count": 240,
      "scale": [
        0.3,
        1
      ],
      "rotate": [
        -180,
        180
      ],
      "alpha": [
        55,
        95
      ],
      "zTiers": 4,
      "jitter": 10,
      "density": 86,
      "bleed": true,
      "mirror": false,
      "overlap": true,
      "displacement": 10,
      "lifeDrift": 0.12,
      "noiseSpeed": 0.2,
      "wind": 0.15,
      "behave": "cruise",
      "growthRate": 4,
      "growthBranch": 0.8
    }
  },
  {
    "id": "cell-wall",
    "name": "CELL WALL",
    "group": "organic",
    "desc": "Tissue under glass — each blob fills its own cell, walls shared, no two the same. Pair with GROWN.",
    "categories": [
      "organic",
      "floral"
    ],
    "styles": [
      "organic"
    ],
    "paletteShift": "band",
    "paletteId": "persona-oxman",
    "params": {
      "blendMode": "normal",
      "mode": "voronoi-cells",
      "count": 150,
      "scale": [
        0.6,
        1.4
      ],
      "rotate": [
        -180,
        180
      ],
      "alpha": [
        70,
        100
      ],
      "zTiers": 2,
      "jitter": 8,
      "density": 88,
      "bleed": true,
      "mirror": false,
      "overlap": false,
      "displacement": 0,
      "lifeDrift": 0.1,
      "noiseSpeed": 0.14,
      "wind": 0.1,
      "behave": "cruise"
    }
  },
  {
    "id": "root-run",
    "name": "ROOT RUN",
    "group": "organic",
    "desc": "Roots finding food — tendrils colonise the ground toward what feeds them, then stop. Pair with GROWN.",
    "categories": [
      "organic",
      "linework"
    ],
    "styles": [
      "organic"
    ],
    "paletteShift": "zone",
    "paletteId": "persona-oxman",
    "params": {
      "blendMode": "normal",
      "mode": "colonize",
      "colonizeInfluence": 120,
      "colonizeKill": 12,
      "colonizeBranch": 0.45,
      "colonizeStep": 8,
      "count": 180,
      "scale": [
        0.4,
        1.4
      ],
      "rotate": [
        -180,
        180
      ],
      "alpha": [
        60,
        100
      ],
      "zTiers": 2,
      "jitter": 6,
      "density": 82,
      "bleed": false,
      "mirror": false,
      "overlap": true,
      "displacement": 4,
      "lifeDrift": 0.1,
      "noiseSpeed": 0.14,
      "wind": 0.12,
      "behave": "cruise"
    }
  }
]
```
