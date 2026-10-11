# KC-1 Roadmap: Petri Dish, Affective Layer, Determinism

**Status:** the current phases roadmap. Ordered by Matt, 2026-10-11.
**Source:** Matt's draft of 2026-10-10 ("KC1_Roadmap_Petri_Dish_Affective"), revised with the six decisions recorded below.
**Scope:** desktop and iPad first. Live stage use is welcome but is not the design driver. No live AI inside the app.

One phase is open at a time. Phase 1 is open.

---

## Locked principles

- **One Petri Dish.** All systems are aware of each other. Layers are strata (density, oil/water separation, Z-depth), not Photoshop-style glass layers.
- **Assets are graphic creatures** that follow design laws. First-class systems: fields, attraction, hierarchy/appendages.
- **TE-style limit:** 4 bodies, 4 limbs, 4 hands. The base type never leaves the set.
- **Davis owns asset creation** and applies only small parametric shifts (scale, attachment angle, material bias) inside the four.
- **Deterministic and replayable, and the log is the authority.** Pin events, band changes, hierarchy decisions and parametric values are frame-indexed in the event log and are replayed as recorded. *(Decision 1.)*
- **Stress drives behaviour through threshold bands.** Full telemetry is recorded so the boundaries can be tuned later.
- **No timers with opinions, honest signals only, the Queen is never rendered.** Unchanged house law.

## The six decisions (2026-10-11)

| # | Question | Decision |
|---|---|---|
| 1 | Replay recomputes a different band than the log | **The log wins.** Logged decisions replay as recorded; the stress number is telemetry only. Same file, same result on every machine. |
| 2 | "Instrument load" as a stress input | **Removed.** Load is the governor's job (it sheds detail). A slow device must not make different art. |
| 3 | The Queen "visibly restrained" in Tighten | **Felt, never shown.** Her restraint comes through the Directors (cooler lines, tighter ranges). Her contract is intact. |
| 4 | A second way to derive rooms | **Keep the existing rooms.** Dish pressure and taste pressure are extra inputs to the existing LOIS/Davis states; definitions stay (BURN = hot keep streak, AWAY = gone 5 minutes). |
| 5 | Taste pressure signal | **Rolls since the last keep, now.** The keeps-vs-passes ratio joins when the pass gesture (#1173) lands. No clock. |
| 6 | What comes first | **The dish spine.** The live instrument runs on the dish before the affective slice is built on it. |

---

## Phases

### Phase 1: the dish spine *(open)*
The live instrument runs on the same dish the replayer steps. Today the log can record what happened but cannot reproduce the picture, because the live pipeline does not use the dish (the session-log finding, #1314). This is the same work "One Petri Dish" needs.

- The live loop steps the dish; the replayer and the instrument share one step path.
- A recorded session replays to matching frame hashes; the footer export can then honestly be called a performance.
- Layers become strata of one dish (#1183); the dish roster replaces the LAYERS mixer (#1203) once the dish is the source of truth.
- **Exit:** export a live session, import it, replay: the frame hashes match the live run.

Issues: the dish-spine issue (new), #1183, #1203, #1314.

### Phase 2: stress, bands, telemetry
Stress is a weighted sum of three honest signals, re-weighted after decision 2:

| Input | Weight | Measured as |
|---|---|---|
| Performer activity | 0.38 | Input events per window (frame-indexed) |
| Dish pressure | 0.38 | Normalized neighbour count or attraction strength in a small radius around pinned heads |
| Taste pressure | 0.24 | Rolls since the last keep (decision 5); keeps-vs-passes later |

| Band | Threshold | Davis ranges | Queen warming | Type-order bias | Hierarchy formation | LOIS ranking |
|---|---|---|---|---|---|---|
| Relax | < 0.28 | Widest | Active | Strongest | Easiest | Most permissive |
| Normal | 0.28 to 0.72 | Default | Default | Moderate | Normal | Neutral |
| Tighten | > 0.72 | Narrowest | Normal rate, restraint felt through the Directors | Reduced | Harder | More critical |

- Light smoothing over a few frames, and hysteresis on the band edges.
- Log **band changes**, plus the quantized stress value **only when it changes** (per-frame logging would bloat the file).
- A stress/band readout exists as a **dev-only** overlay (URL flag), never as shipped chrome.
- **Exit:** bands change deterministically from a recorded log, and the telemetry is enough to retune thresholds.

### Phase 3: wet lab and hierarchy
- The asset panel is the bio wet lab.
- A **pin** marks a privileged location only (spore-like). It does not create a hierarchy immediately.
- A hierarchy (head + body + limbs) forms only when **both** are true: attraction strength or field value at the pin exceeds a band-modulated threshold, **and** neighbour/density pressure around the pin exceeds a band-modulated threshold.
- Limb count can change over the creature's life. Base types stay inside the TE four.
- New event types: `pin`, `hierarchy-form`.
- **Exit:** a pinned spore becomes a creature under the two conditions, replayably.

Issues: #1206, the wet-lab pin issue (new).

### Phase 4: influences
The three personae read the band and the room.

- **Davis:** parametric shifts (scale, attachment angle, material bias) inside the current base type. Range width follows the band and room. Event: `davis-shift`.
- **LOIS:** tightens or loosens Davis ranges according to the room; ranks or filters Curator suggestions by room.
- **Queen:** warms defaults toward recent keeps (an in-session ring buffer of the last N keeps) and biases the order of the four base types offered at a pinned head. Subtle and unsurfaced; in Tighten her restraint is carried by the Directors (decision 3). The 8-keep gate stands.
- Rooms stay as built (decision 4); dish pressure and taste pressure feed the existing states. Event: `matrix-room`.
- **Exit:** the same recorded session produces the same influences on replay.

Issues: #1145, the influences issue (new), #1173 (pass gesture: upgrades taste pressure).

---

## Parallel lanes (do not block the phases)

- **iPad worker probe (#1312):** needs the real device.
- **Living motion samplers (#1194 to #1200):** layout modes, one PR each, in flight.
- **#1144 close-out:** lock the refine spread value once Matt has tuned it.

## Out of scope this cycle

- Live AI or model inference inside the app.
- The full 20-room copy matrix, new faces, and any Queen rendering.
- **New** taste.json import work (the shipped taste artifact and the open sway gate stay as they are).
- Stage-specific items (Syphon #608, the full MIDI-learn surface #617) unless they fall out naturally.
- WebGPU (#1298).
- Numeric fine-tuning of the hysteresis gap, range multipliers, dish-pressure radius or limb-change rules. Telemetry sets them later.
- The design-system and UI items not named above (#1121, #1124, #1127, #1204, #1262) keep their existing order and wait for this cycle.

## Open tunables (telemetry will inform)

- Hysteresis gap and smoothing window (frames).
- Davis range scale in Relax versus Tighten.
- Radius and metric for dish pressure.
- How limb count changes over a creature's life.
- N for the recent-keeps ring buffer (must respect the 8-keep gate).

## Already done (was in the draft)

- The FEED/FIELD allocation work is finished (#1307, #1308).
- The replay event-log library and the performance-file format are merged (#1335, #1339); the session-log export is #1349.
