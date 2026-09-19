# Tempo + chip taxonomy

*Plan only. Do not implement until engine spine **E** (#391) is merged.*
Parent context: [ENGINE_PLAN.md](ENGINE_PLAN.md), [SURFACES.md](SURFACES.md), [AGENTS.md](../AGENTS.md).

Decided 2026-09-19 with Matt:

- Internal metronome **always** (silence still has a beat).
- Transport lives in the **top bar**, next to color / MIX.
- v1 slaved target = **chip / voice / preset MIX length** only.
- Click a voiced chip → **wait for the next downbeat**, then wipe.
- Split the board into **systems / voices / presets**. Do not keep one fake grid.
- Default **90 BPM, running**.
- A voice keeps its `blendSeconds`; that duration **quantizes to whole beats**.

## 1. The board today is three types in one skin

From `data/voices.js` + showcase presets + the screenshot:

| Kind | What it is | Examples | Load today |
|------|------------|----------|------------|
| **System** | Layout engine. Changes the sampler / integrator. Incomplete look. | stub chips: rand, grid, phi, rad, noise, strat, flow, rail, z, ca, orbit, abacus | Hard `mode=` write. Cut. |
| **Voice** | Complete state: palette + params + FX recipe + assets + `blendSeconds`. | Flagships: SWARM *Night Migration* (4s), HYPE *Chrome Parade* (~0.8s), MURM *Deep Water* (10s). `+` MY VOICES. | MIX lerp; enums snap at t=0.5. |
| **Preset / showcase** | Named costume. May ride a system + palette. Routed through MIX since #379. | SHOWCASE row (MURMURATION, NEON BROOD, SMOKE STUDY…), CLASSIC ORIGIN, BIO-DRIVES (HUNGER, MOLD BLOOM…), FUJIMOTO PRISM | MIX, same as voices when wired. |
| **Curator pick** | Taste reroll, not a chip type. | VOICE: COMPRESSION + Curator | Separate lane. Do not put on the beat grid in v1. |

`voices.js` already says this: three flagships are voiced; the twelve mode chips are **stubs**. The UI does not say that, so everything feels like a broken voice.

## 2. Split the UI to match

Three rows (or three labeled bands), not one mosaic:

```text
SYSTEMS     grid  swarm  hype  murm  ca  orbit  …     ← engines
VOICES      Night Migration   Chrome Parade   Deep Water   +
PRESETS     Smoke Study   Mold Bloom   Origin   …
```

Rules:

- A **system** click changes the engine. No promise of a full look. v1: still a mode write; after spine E it can wipe pixels, but it does **not** have to wait for the downbeat (engine change is a tool, not a song).
- A **voice** or **preset** click is a song change: arm → next downbeat → quantized wipe.
- MY VOICES stay under VOICES (`+` capture is a voice, not a system).
- Showcase / bio-drive / classic rows are PRESETS. If a preset is only a palette+count costume on swarm, it must name its system.
- Curator stays in the footer. It proposes a preset; it does not own tempo.

Do not invent a fourth chip type for BIO-DRIVES. Those are presets that happen to turn metabolism knobs.

## 3. The clock

One transport, owned by the live loop (same place as spine A `dtSec`).

```text
bpm        default 90, running on launch
phase      0..1 inside the current beat
bar        4/4 for v1, not user-facing yet
beatIndex  integer, never resets on a chip change
source     metronome always
           AUDIO ON later *nudges* BPM / phase — does not replace the clock
```

Top bar (always visible):

- BPM number (drag or tap-tempo later)
- running / stopped
- 4 beat dots (phase)
- optional tiny "NEXT" if a wipe is armed

STIMULI holds the deep row later (swing, reset-to-1, audio-follow). Not v1.

Stopped transport: voiced chips fall back to "wipe now" so the instrument is still usable while programming. Running is the performance default.

## 4. Quantized MIX

```text
beats = max(1, round(blendSeconds * bpm / 60))
durationSec = beats * 60 / bpm
```

At 90 BPM:

| Voice | authored | quantized |
|-------|----------|-----------|
| Chrome Parade ~0.8s | 0.8 | 1 beat = 0.667s |
| Night Migration 4s | 4 | 6 beats = 4.000s |
| Deep Water 10s | 10 | 15 beats = 10.000s |

Start: click arms. On the next downbeat (`phase` wraps 1→0), the wipe runs for `durationSec`. Re-click before the downbeat: retarget the armed voice (DJ). Re-click during the wipe: retarget; do not stack two mixes.

System chips do not enter this queue in v1.

## 5. What is not slaved in v1

Intentionally later (do not sneak them into the first clock PR):

- LIFE / breath LFO rate
- Davis Evolve / phrase
- flap / cruise pulse
- ACCUM optics taps
- audio envelope (ATTACK/DECAY stay ms)
- Curator rerolls

AUDIO OFF + metronome running is enough for a silent rehearsal. When AUDIO is on, envelope still keys off the signal; the clock keeps MIX honest.

## 6. Build order (after the spine)

```text
E   mode-chip pixel dissolve exists          (#391)
T0  clock object + top-bar BPM/dots          no consumer yet
T1  voice/preset clicks arm → next beat      uses E's wipe + quantized blendSeconds
T2  split SYSTEMS / VOICES / PRESETS UI      visual only + load-path dispatch
T3  (later) LIFE rate in beats, Evolve on 1
```

T0 may land beside spine C/D if it only *displays* time and nothing reads it. Prefer after E so the first consumer is real.

## 7. Do not

- Start this instead of #387.
- Put BPM only in STIMULI.
- Give every stub chip a fake `blendSeconds` so they all pretend to be voices.
- Reset `beatIndex` when a chip lands (that *is* a wild jump).
- Detect live BPM in v1.
- A second MIX slider. Voices already have signature length.

## 8. Acceptance

- Launch: 90, running, four dots walking in silence.
- SWARM → HYPE while running: wait, then a 1-beat Parade cut.
- SWARM → Night Migration: wait, then a 6-beat wipe at 90.
- Stopped transport: wipe starts on click.
- Grid system chip does not wait for the beat.
- SYSTEMS / VOICES / PRESETS are visually separate.
- No new panel. Bar control is small.
