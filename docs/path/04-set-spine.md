# 04 — Set spine

*The room keeps time. The deck is small enough to play in the dark.*

After #391 E. Specs: TEMPO_AND_CHIPS, ROOM_REVIEW §6. Not an implement ticket while #387 is open.

## What exists

- Voice `blendSeconds` (0.8 / 4 / 10) and a MIX driver. No metronome. LIFE is free Hz.
- Chip board is one mosaic: stubs + flagships + showcase + bio names + Curator footer.
- Davis Evolve / phrase clocks are a separate timebase.

## Research take

OP-Z / Ableton Session: one transport, clips wait for 1, duration in beats. Visual tools that skip this feel like PowerPoint. v1 we already chose next-downbeat + quantized `blendSeconds` + 90 running.

TE/Davis amendment: a BPM LED LIFE cannot hear is worse than no BPM. Slave bus on T0; LIFE unit at T1b (beats per breath, default 4). Freeze breath when transport stops.

Deck size is replay. Three voices you trust beat twenty-eight names you cannot tell apart.

## Plan

```text
T0   clock {bpm, running, phase, beatIndex} + dots + NEXT + empty bus
T1   voice/preset arm → startBeat = beatIndex+1; beatsMix = round(sec*bpm/60)
T1b  LIFE hz = bpm/60/lifeBeats; per-agent seedOffset phase
T2   SYSTEMS / VOICES / PRESETS split; extras in drawer
T3   Evolve / flap / ACCUM on the bus
```

Integer `beatIndex` is truth. Do not reset it on a chip. Freeze `beatsMix` at click.

## Sticky test

Silent rehearsal at 90 matches the club. Parade is a 1-beat cut, Migration 6, Deep Water 15. NEXT lamp before the wipe. LIFE at 4 = one breath per bar. Grid wrench does not wait.

## Do not

Kick-detect v1. Decorative dots. Fake `blendSeconds` on stubs. New showcase chips on the deck.
