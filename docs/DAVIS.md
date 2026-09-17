# Ghost Station clock

A generative composition-machine in the lineage of early-2000s generative art. Hand assets in (P02 / Illustrator), rule + chance out (seed, modes, evolve), keep the hit (F / favorites / farm). Not anyone's pixels — homage to the practice, not the pictures.

## Panel (P07)

| Control | Role |
|---|---|
| Evolve | Gate. TIME uses INTERVAL. BEAT uses audio edges. |
| Phrase | Clock. RESET / CYCLE / CA wraps via `tickPhraseBeat` (`app/src/state/phraseTick.js`). |
| BEAT router | Resolves the beat collision: one mic attack driving both the phrase clock (CLOCK=AUDIO) and evolve (SOURCE=BEAT). Chips PHRASE / EVOLVE / BOTH — shown only while both sides are armed. BOTH is recommended: the clock ticks first, then the gate fires on the post-phrase state. Logic is pure in `app/src/state/beatArbiter.js` (`routeBeat`). |
| CLOCK AUDIO | Needs Stimulus audio. Subtitle `waiting for beat` if armed and silent. |
| CLOCK METRO | Internal pulse at BPM. No mic. |
| Hits | Archive. Farm prints editions. |
| ACCUM gestures | Appear when ACCUM is on. FREEZE holds the trail buffer mid-air (toggles to THAW); CLEAR wipes it to the background; SWELL breathes FADE up and back over ~2.4s. They play the live 2D buffer (`useAccumulationBuffer`), not the GPU still recipe. |

CA wrap only paints when layout mode is Cellular. INTERVAL is inert on BEAT.

## Beat collision, resolved
Before the router, one mic attack drove two consumers with no arbitration:
`onBeat` fired evolve and bumped `beatPulse`, which the phrase loop watched
to tick — evolve first, phrase after a re-render, and on a saturated pulse
the phrase silently skipped while evolve still fired. Now the attack enters
once in `App.jsx onBeat` and `routeBeat` decides: PHRASE (clock only),
EVOLVE (gate only), or BOTH (clock resolves first, gate fires on the
post-wrap state). `slowRender` / `batchPaused` gate both sides, same as the
TIME interval. One spike, fixed order, never a race on `seed`.

## Not this panel
Motion source (webcam energy is still 0). Boolean subtract. SoA. Studio video ACCUM.

## Docs vs Wiki vs Discussions
Keep this file in `docs/` so it versions with `main`. A GitHub Wiki is a second git repo and will drift. Discussions are fine for operator notes once enabled in repo settings — they are not the spec.
