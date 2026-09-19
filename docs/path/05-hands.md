# 05 — Hands

*STIMULI is a shove on top of breath. It is not a second clock.*

After body + set spine. Research: STIMULI panel (AUDIO OFF, DEPTH/SCALE/ALPHA, LIFE, ATTACK/DECAY, LIN/EXP/LOG/PEAK, SWELL, BASS/MID/TREBLE/RMS), `audioBallistics.mjs`, useCanvasLife.

## What exists

- Mic / file analyser → raw bands + RMS + pulse.
- Envelope knobs are already musical (ms attack/decay, curves, swell).
- LIFE slider is a free LFO sharing the same tab as audio — two timebases in one row.
- Ballistics module ready; visible moths still get raw pulse.
- AUDIO OFF = idle. Nothing keeps time except whatever lifeT React is writing.

## Research take

Best visual instruments split **music time** from **signal time**. Clock = bars. Envelope = how hard the room hit you *this instant*. OP-1 tape does not replace the metronome when you yell at the mic.

KC-1's path: metronome always (layer 4). Envelope keys off the signal and dies to exact 0 in silence (already the ACCUM contract). LIFE leaves this tab's clock job — it becomes beats on the bar. STIMULI then reads as *hands*: how much the kick may shove scale/alpha/glow, how fast that shove attacks.

DEPTH/SCALE/ALPHA stay amount. ATTACK/DECAY stay ms. RESPONSE stays curve. Bands stay meters + optional amount. No BPM in this tab.

## Plan

1. Visible path uses `processBallistics` (layer 1). Keep silence = 0.
2. LIFE control either moves next to the bar or is clearly "breath length in beats." Do not leave a Hz slider under AUDIO OFF.
3. AUDIO ON does not pause the metronome or retune LIFE.
4. Optional later: audio *nudges* BPM (PLL). Not v1.

## Sticky test

Rehearse silent at 90, moths breathe. Arm AUDIO, kicks shove and decay; breath still on the bar. Kill the input: shove dies, breath continues. No panel added.

## Do not

Second transport in STIMULI. Detected-BPM replacing the bar. Envelope in beats.
