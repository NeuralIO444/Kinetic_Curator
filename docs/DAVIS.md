# Ghost Station clock

A generative composition-machine in the lineage of early-2000s generative art. Hand assets in (P02 / Illustrator), rule + chance out (seed, modes, evolve), keep the hit (F / favorites / farm). Not anyone's pixels — homage to the practice, not the pictures.

## Panel (P07)

| Control | Role |
|---|---|
| Evolve | Gate. TIME uses INTERVAL. BEAT uses audio edges. |
| Phrase | Clock. RESET / CYCLE / CA wraps via `tickPhraseBeat` (`app/src/state/phraseTick.js`). |
| CLOCK AUDIO | Needs Stimulus audio. Subtitle `waiting for beat` if armed and silent. |
| CLOCK METRO | Internal pulse at BPM. No mic. |
| Hits | Archive. Farm prints editions. |

CA wrap only paints when layout mode is Cellular. INTERVAL is inert on BEAT.

## Not this panel
Motion source (webcam energy is still 0). Boolean subtract. SoA. Studio video ACCUM.

## Docs vs Wiki vs Discussions
Keep this file in `docs/` so it versions with `main`. A GitHub Wiki is a second git repo and will drift. Discussions are fine for operator notes once enabled in repo settings — they are not the spec.
