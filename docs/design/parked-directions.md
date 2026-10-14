# Parked directions: clock, audio, replay, mind (reviewed against the repo)

Status: **design, nothing built.** Written 2026-10-13 from Matt's "KC-1 Parked Directions: Design & Scope" and a review
of the repo. This file is the reviewed version; where it differs from the original, the repo and Matt's answers win.

## What the repo already has

| Original section | Already here |
|---|---|
| 1. Clock | The loop clock (`gl/loopClock.js`, `loopTimeMs`, advanced per presented frame) and the BEAT master BPM (`gl/beatClock.mjs`, #950). A "no `Date.now`" selfcheck guards it (#807). No bar or beat events yet. |
| 2. Replay | **Mostly built in Phase 1.** `gl/performanceFile.mjs`: the resolver input log plus hash-chain checkpoints, a replayer that proves it, REC restarts the scene, export and import, `npm run verify:take`, and `gl/performanceCreatures.selfcheck.mjs`. Persona decisions (homes, formed, limbs, traits) already ride the recorded input, and the `stress` and `davis-shift` logs are in the take. **Missing:** playback UI, scrub, a bar index. |
| 3. Audio | Mic or file input with a sidecar (`hooks/useAudioInput.js`), METER with seven named bands, the route matrix, ballistics, beat detection and confidence, audio-loss handling. The Queen's mechanics already read beat confidence and attack peaks. **Missing:** discrete onset, tempo and silence events on the bus. |
| 4. Mind | The taste model is a trained **ranker** (`taste.json` v1: ridge head over SigLIP embeddings and 19 recipe features, fidelity 0.733, gate cleared 2026-10-08). It is not generative. No LLM exists in the repo. |

## Decisions (Matt, 2026-10-13)

1. **Musical time runs on the loop clock.** `bar`, `beat` and `phase` are derived from loop time and the BPM. Audio only nudges the tempo. The clock never depends on audio hardware, so replay stays exact with or without audio and on any machine. (`AudioContext.currentTime` is not the clock.)
2. **On-device models only, MLX first.** The "no live AI inside the app" principle is read as "no cloud AI". Models are allowed if they run on the Mac: MLX first, Apple Intelligence later behind the same interface through a Swift helper (Apple's model is not reachable from the web view). Every model decision is recorded so a replay never calls it, and a rule-based backend is the fallback forever. Matt confirmed the wording 2026-10-13 and moved the model path to Apple Intelligence first (#1463); the roadmap now reads "No cloud AI".
3. **The Queen eases the tempo, only while her mark shows.** The mark beside BEAT (`SwayMark`) is her presence. When audio gives a confident tempo she may ease the BEAT BPM toward it by a small bounded step per phrase, and only while her mark is visible. The button shows the new BPM. A BPM the artist sets by hand always wins and silences her. She stays unnamed.
4. **Replay is in the product:** load a take, play it back with the personas muted, scrub by bar.
5. **Her visibility is loosened for presence, not for naming** (2026-10-13, #1464): at higher tiers she moves through the Stimuli panel (the meter warms, drifts or leans) without a label. Tier 1 is near-silent and deniable. She is still never named on any surface.

## Corrections to the original

- **Event names** follow the repo's `family:camelCase` (`clock:beat`, `audio:onset`), not dotted names.
- **Event envelope:** the bus has no `meta` today. Adding `{ seq, loopMs, bar, beat, cause }` touches every emit (about 100 events). It should be an opt-in second argument, not a rewrite.
- **Ownership:** `composition/eventRegistry.js` records handlers, and emitters are derived by selfcheck. "One owner per family" would be a new audit rule.
- **`stage.req.*` and a stage manifest do not exist** here. Requests are the existing events into `wireEventBus`.
- **The hidden persona is the Queen** (`docs/characters/queen.md`, DS rule 10). The critic is LOIS.
- **Snapshots every 8 bars** become checkpoints per bar once the clock exists; the file already checkpoints per frame run.

## Build order

0. Finish "everything user-driven rides the bus" (families 5 to 8: voices, patterns and macros, beat and audio routes, taste and import).
1. **Musical time:** bar, beat and phase from the loop clock and `beatBpm`; `clock:beat` and `clock:bar` events; `emitOn('bar' | 'beat', ...)` quantised emit. Manual BPM already exists.
2. **Audio events:** onset (spectral flux), tempo with confidence, energy level with hysteresis, silence start and end, on the bus. Continuous features stay in the shared meter buffer (the bus carries decisions, not frames).
3. **The Queen's tempo ease** (decision 3) and her silence take-over.
4. **Replay playback:** load a take, mute personas, scrub by bar.
5. **Mind:** a `think(context)` interface on each persona with a rules backend first; a `kc-mind` MLX sidecar over localhost; a reply schema per persona; `mind:status`; at most one request in flight per persona and one decision per bar; a reply more than 2 bars late is dropped.
6. Apple Intelligence backend through a Swift helper.
7. **Mind 3, the personality layer (#1464):** hidden per-persona engagement scores (persisted on the machine, decaying over long absences, readable only in the dev panel's MIND tab), four tiers that govern how often and how strongly each persona shows herself and how long LOIS and Davis may speak, cool-down instead of demotion, the zodiac character (Davis Gemini, LOIS Cancer, the third Capricorn) modulated by one startup calendar reading, and the third's ghost on the Stimuli meter. Runs the same on the rules as on Apple; every shaping is recorded in the take (`traits`, mind record v2).

## Still open

- Which MLX model serves `mind` (the taste ranker cannot propose assets or judge a scene). Needs a model choice and an eval.
- Whether the Tauri bundle ships the sidecar, or it installs separately.
- ~~Confirm the amended wording of the roadmap's "no live AI" principle.~~ Done 2026-10-13: "No cloud AI".
