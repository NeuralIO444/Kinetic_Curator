# Tempo + chip taxonomy

*Plan only. Do not implement until engine spine **E** (#391) is merged.*
Parent context: [ENGINE_PLAN.md](ENGINE_PLAN.md), [SURFACES.md](SURFACES.md), [ROOM_REVIEW.md](ROOM_REVIEW.md), [AGENTS.md](../AGENTS.md).

Decided 2026-09-19 with Matt, amended same day after TE × Davis review:

- Internal metronome **always** (silence still has a beat).
- Transport lives in the **top bar**, next to color / MIX.
- Click a voiced chip → **wait for the next downbeat**, then wipe.
- Split the board into **systems / voices / presets**. Do not keep one fake grid.
- Default **90 BPM, running**.
- A voice keeps its `blendSeconds`; that duration **quantizes to whole beats**.
- **Performance deck is small.** Extra costumes → drawer / DLC (ROOM_REVIEW §5).
- Clock has a **slave bus**. MIX is listener one. LIFE gets the hook at T0 and the unit at T1b so BPM is not decorative.

## 1. The board today is three types in one skin

From `data/voices.js` + showcase presets + the screenshot:

| Kind | What it is | Examples | Load today |
|------|------------|----------|------------|
| **System** | Layout engine. Changes the sampler / integrator. Incomplete look. | stub chips: rand, grid, phi, rad, noise, strat, flow, rail, z, ca, orbit, abacus | Hard `mode=` write. Cut. |
| **Voice** | Complete state: palette + params + FX recipe + assets + `blendSeconds`. | Flagships: SWARM *Night Migration* (4s), HYPE *Chrome Parade* (~0.8s), MURM *Deep Water* (10s). `+` MY VOICES. | MIX lerp; enums snap at t=0.5. |
| **Preset / showcase** | Named costume. May ride a system + palette. Routed through MIX since #379. | SHOWCASE, CLASSIC ORIGIN, BIO-DRIVES, FUJIMOTO PRISM | MIX, same as voices when wired. |
| **Curator pick** | Taste reroll, not a chip type. | VOICE: COMPRESSION + Curator | Proposes. Performer hits a chip. Never silent-apply off-grid. |

`voices.js` already says this: three flagships are voiced; the twelve mode chips are **stubs**. The UI does not say that, so everything feels like a broken voice.

## 2. Split the UI to match

Performance deck after ROOM_REVIEW:

```text
SYSTEMS     swarm  hype  murm  grid  ca  orbit     [MORE]
VOICES      Night Migration   Chrome Parade   Deep Water   +
PRESETS     Origin   Smoke Study               [DRAWER]
```

Rules:

- A **system** click changes the engine. No promise of a full look. Does **not** wait for the downbeat.
- A **voice** or **house preset** click: arm → next downbeat → quantized wipe.
- MY VOICES stay under VOICES.
- Showcase / bio-drive / guest / persona rows leave the deck. Data stays; chrome goes to `dlc/` or a drawer. Do not author new named chips until T1 exists.
- Curator proposes. It does not own tempo.

## 3. The clock + slave bus

One transport, owned by the live loop (same place as spine A `dtSec`). Full mechanism: [ROOM_REVIEW §6](ROOM_REVIEW.md).

```text
bpm        default 90, running on launch
phase      0..1 inside the current beat
beatIndex  integer, never resets on a chip change
arm        null | { kind, id, startBeat, beatsMix }
```

Top bar: BPM, run/stop, four dots, NEXT when armed.

Stopped transport: voiced chips wipe now. LIFE phase **freezes**.

## 4. Quantized MIX

```text
beats = max(1, round(blendSeconds * bpm / 60))
durationSec = beats * 60 / bpm
```

At 90 BPM: Parade 1 beat, Migration 6, Deep Water 15.

Arm on click (`startBeat = beatIndex + 1`). Fire on integer beat, not `phase ~ 0`. Re-click before 1 retargets the arm. Re-click during wipe retargets the dissolve. Freeze `beatsMix` at click if BPM moves.

## 5. Slaves

| Listener | When |
|----------|------|
| Bar dots / NEXT | T0 |
| MIX start + duration | T1 |
| LIFE = beats per breath (default 4) | hook T0, unit T1b |
| Evolve / flap / ACCUM tap | T3 |
| Envelope ms / Curator auto | not slaved |

`hz = bpm / 60 / lifeBeats`. Per-agent phase still uses `seedOffset` so chests do not clap in unison.

## 6. Build order

```text
E    wipe exists                         (#391)
T0   clock + dots + empty slave bus
T1   voice/preset arm → next beat
T1b  LIFE unit = beats (same milestone)
T2   split SYSTEMS / VOICES / PRESETS; extras in drawer
T3   Evolve / flap / ACCUM on the bus
```

## 7. Do not

- Start this instead of #387.
- Put BPM only in STIMULI.
- Give stubs fake `blendSeconds`.
- Reset `beatIndex` on a chip.
- Detect live BPM in v1.
- Add showcase chips to the deck.
- A decorative metronome LIFE cannot hear.

## 8. Acceptance

- Launch: 90, running, four dots walking in silence.
- Parade = 1 beat wipe; Migration = 6; Deep Water = 15.
- Stopped: wipe-now; LIFE frozen.
- Grid system chip does not wait.
- Deck is small. Drawer holds the farm.
- LIFE at 4 beats = one breath per bar.
