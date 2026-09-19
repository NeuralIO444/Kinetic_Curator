# Room review — Teenage Engineering × Joshua Davis on KC-1

*Review of current `main` + ENGINE_PLAN + TEMPO_AND_CHIPS. Not a patch. 2026-09-19.*

Two chairs. They want the best instrument in the room, so they are not polite. Full argument lives in the session; this file is what changes the roadmap.

Companions: [ENGINE_PLAN.md](ENGINE_PLAN.md) · [TEMPO_AND_CHIPS.md](TEMPO_AND_CHIPS.md) · [SURFACES.md](SURFACES.md) · [AGENTS.md](../AGENTS.md).

## 1. Verdict in one page

They do **not** fight the spine. A → B → C → D → E → F stays.

They fight a decorative metronome and a board that pretends wrenches are songs.

| They both sign | They fight |
|----------------|------------|
| A then B before anything pretty | When LIFE hears the clock (T1 vs T3) |
| Split SYSTEMS / VOICES / PRESETS | How many finished voices before DLC |
| Never reset `beatIndex` or placement identity | Curator on-beat vs hidden in a set |
| One MIX machine, hold pixels, no second swarm | How loud the bar dots are |
| Wire or kill dead knobs (`motionSmoothing`, unused `curl2`) | PATCH density vs weather |
| Four tracks is the product | |
| Flagship `blendSeconds` stay character, quantized | |
| Matt plays feel. No agent-closed motion bugs | |

**Roadmap change:** park costumes. Finish three voices on a body that keeps time. Do not ship more showcase chips onto the performance deck.

## 2. TE, compressed

The limit is already the slogan. The mosaic does not believe it. Three chip kinds, one plastic. STIMULI is a second clock. `motionSmoothing` is a dead encoder. #381 hex-stepping is a scar, not a feature. A full-beat wait at 90 without dots + NEXT is latency.

Keep 4+4. Finish tape preflight. SYSTEMS = switches. VOICES = three big keys. PRESETS = drawer. Bar clock = BPM, run/stop, four dots. Spine A/B before tint. LIFE must have a hook on the clock object the day the dots exist, or do not show BPM.

## 3. Davis, compressed

A murmuration that becomes a grid at MIX t=0.5 is a farm, not a set. Stubs that look like flagships train the performer to distrust the board. Four tracks without shared weather are four windows. Bio-drives are the terrarium and they are dressed like a filter bank. Quantized MIX is right; LIFE that cannot hear 90 BPM makes the moths a screensaver. Curator off the grid will jump the set. Play Night Migration at 30 vs 60 — if the animal changes, A failed.

Hold the outgoing framebuffer. Voices stay complete DNA. Finish three systems with one canonical voice each before inventing a fourth climate.

## 4. What this does to the roadmap

### Unchanged

- Spine **#387 → #392**, one letter in flight. Coding agent still starts at A.
- Tape lane (#383 / #342, #341) stays the other writer.
- Matt-only: #374, #346, #298.

### Changed

| Before | After this review |
|--------|-------------------|
| T0 clock with **no consumer** | T0 clock **plus a slave bus**. MIX is the first listener. LIFE is wired as a listener even if the slider still reads Hz until T1b. |
| T3 = first time LIFE hears tempo | **T1b** (same milestone as voiced-chip arming): LIFE rate can be beats-per-cycle. Default 4 beats = one breath. Slider stays; unit changes. |
| Showcase / bio-drive / persona rows stay on the deck | **Performance deck = systems + 3 flagships + MY VOICES + one or two house presets.** The rest → drawer / DLC. |
| Curator off-grid forever | Curator **proposes**. Performer hits the chip. If we ever auto-apply, it waits for 1. No silent reroll. |
| More voices authored in parallel with A–B | **Authoring freeze** on new showcase chips until E + T1 exist. |

### Still later (not cancelled)

- Evolve on bar 1, flap on beat, ACCUM taps on beat.
- Audio PLL onto the metronome.
- Swing, tap tempo, 4/4 UI.
- Kernel v2 EvalContext, gallery, MIDI.

## 5. Costumes → DLC / drawer

Yes. Put costumes away. Do not delete the data.

The repo already has `dlc/pack-01-the-cuts/`. Use that pattern.

### Stay on the performance deck (core)

| Slot | Why |
|------|-----|
| SYSTEMS row (short) | swarm, hype, murm, grid, ca, orbit — engines. Hide the rest of the stubs behind a `MORE` or LAYOUT tab. |
| VOICES × 3 | Night Migration, Chrome Parade, Deep Water |
| MY VOICES `+` | User capture |
| House presets × 2 | ORIGIN (classic zero), SMOKE STUDY (ACCUM voice already earned #284) |

### Drawer now, DLC pack later (do not author more until T1)

| Pack (proposed) | Moves off the deck |
|-----------------|--------------------|
| **Already in tree:** `dlc/pack-01-the-cuts` | Keep as DLC, not chrome |
| **Showcase farm** | NEON BROOD, PETRI BLOOM, RIVER DELTA, STATIC BLOOM, STRATA, TRANSIT, SOLAR MAX, PERIHELION, MURMURATION-the-row |
| **Bio climate** | HUNGER, MOLD BLOOM, GRAZERS, PIGMENT LEAK, BREATHING, CORAL GARDEN, PLATE-* |
| **Guest / remix** | FUJIMOTO PRISM, GHOST-LINEAGE / ABACUS TOTEM |
| **Persona / Curator skins** | COMPRESSION and the 10-voice persona pack — propose, do not occupy keys |

Engine features those presets *use* (metabolism sliders, ACCUM flow, Haeckel assets) **stay in core**. We are parking *labels on the deck*, not ripping bio-drives out of `particles.js`.

Rule for agents: a new named chip is DLC unless Matt says it is the fourth flagship.

## 6. Clock slave mechanism

One publisher. Many listeners. No second timebase in STIMULI.

### Publisher (`liveLoop`, next to spine-A `dtSec`)

```text
clock = {
  bpm,            // 90 default
  running,        // true on launch
  beatSec,        // 60 / bpm
  phase,          // 0..1 inside the beat
  beatIndex,      // int, never reset on chip/voice
  barIndex,       // beatIndex >> 2  (4/4, not shown v1)
  dtSec,
}
arm = null | { kind, id, startBeat, beatsMix }
```

Advance only when `running`:

```text
phase += dtSec / beatSec
while phase >= 1: phase -= 1; beatIndex += 1
```

Stopped: `phase` holds. Listeners that need "now" (stopped wipe) bypass the arm queue.

### Slave bus

A listener registers `{ id, everyBeats, offsetBeats, onBeat }` or reads `clock` each frame.

| Listener | v1 | Formula |
|----------|----|---------|
| **MIX duration** | yes (T1) | `beatsMix = max(1, round(blendSeconds * bpm / 60))` |
| **MIX start** | yes (T1) | arm `startBeat = beatIndex + 1`; fire when `beatIndex >= startBeat` |
| **Bar dots / NEXT** | yes (T0) | display `phase`, `arm` |
| **LIFE / breath** | hook T0, unit T1b | `hz = bpm / 60 / lifeBeats` default `lifeBeats = 4` |
| Evolve / phrase | T3 | fire when `beatIndex % 16 === 0` |
| flap / cruise | T3 | phase = `clock.phase` or 2-beat |
| ACCUM tap | T3 | optional; silence still no-ops the *audio* path |
| envelope ms | never | ATTACK/DECAY stay milliseconds of signal |
| Curator auto | never unless on-1 | propose only |

Integer `beatIndex` is the downbeat. Do not use `phase < 1e-3`.

### LIFE slaving (the TE/Davis fix)

Today LIFE is a free LFO written into React at ~30 Hz. After T1b:

- Slider meaning: **beats per breath** (1, 2, 4, 8) or a continuous 1–16 with snap.
- Phase per agent: `fract((clock.beatIndex + clock.phase + seedOffset_i) / lifeBeats)` — still a field, not a metronome of identical chests.
- Transport stopped: freeze LIFE phase (hold breath) or free-run; **freeze** is the TE choice. Spec: freeze.
- AUDIO ON does not replace this. Envelope still hits scale/alpha. Breath stays on the metronome so a silent rehearsal and a loud set share a spine.

### BPM change while armed

Freeze `beatsMix` and `startBeat` at click. Mid-wipe, freeze `durationSec`. Next arm uses new BPM. Dragging 90→72 does not retune a waiting Parade cut.

### What the slave is not

- Not a kick detector in v1.
- Not Ableton nearest-window (phase > 0.85 starts now). Honest wait + NEXT lamp.
- Not a second `Date.now()` in STIMULI.
- Not `setLifeT` from React. The loop owns phase; UI reads it.

Selfcheck vectors: 90 BPM + 4s → 6 beats; 0.8s → 1 beat; two arms before 1 → last id wins; `beatIndex` after a voice land === before + mix beats; LIFE at 4 beats → one cycle per bar at 4/4.

## 7. Agent rules (additive)

- Do not implement this file. Spine A (#387) is still the only coding ticket.
- Do not add showcase chips.
- Do not start T0 until E exists **unless** T0 is display-only dots with a no-op bus — still prefer after E.
- DLC packs are data. They must not touch `liveLoop.mjs`.

## 8. Acceptance when the room would come back

- Three voices, two house presets, a short SYSTEM row. Everything else in a drawer.
- 90 running, dots walking in silence, NEXT when a voice is armed.
- Parade cut is one beat; Migration is six; Deep Water is fifteen.
- LIFE at default 4 breaths with the bar, not against it.
- 30 fps flock is the same animal as 60.
- No decorative BPM.
