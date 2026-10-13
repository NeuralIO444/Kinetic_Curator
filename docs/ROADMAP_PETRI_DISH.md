# KC-1 Roadmap: Petri Dish, Affective Layer, Determinism

**Status:** the current phases roadmap. Ordered by Matt, 2026-10-11.
**Source:** Matt's draft of 2026-10-10 ("KC1_Roadmap_Petri_Dish_Affective"), revised with the six decisions recorded below.
**Scope:** desktop and iPad first. Live stage use is welcome but is not the design driver. No live AI inside the app.

One phase is open at a time. **Phase 4 is open** (status 2026-10-13): Phases 1, 2 and 3 are complete.

---

## Locked principles

- **One Petri Dish.** All systems are aware of each other. Layers are strata (density, oil/water separation, Z-depth), not Photoshop-style glass layers.
- **Assets are graphic creatures** that follow design laws. First-class systems: fields, attraction, hierarchy/appendages.
- **TE-style limit:** 4 bodies, 4 limbs, 4 hands. The base type never leaves the set.
- **Davis owns asset creation** and applies only small parametric shifts (scale, attachment angle, material bias) inside the four.
- **Deterministic and replayable, and the log is the authority.** Pin events, band changes, hierarchy decisions and parametric values are frame-indexed in the event log and are replayed as recorded. *(Decision 1.)*
- **Stress drives behaviour through threshold bands.** Full telemetry is recorded so the boundaries can be tuned later.
- **No timers with opinions, honest signals only, the Queen is never rendered.** Unchanged house law.

## The decisions (2026-10-11)

| # | Question | Decision |
|---|---|---|
| 1 | Replay recomputes a different band than the log | **The log wins.** Logged decisions replay as recorded; the stress number is telemetry only. Same file, same result on every machine. |
| 2 | "Instrument load" as a stress input | **Removed.** Load is the governor's job (it sheds detail). A slow device must not make different art. |
| 3 | The Queen "visibly restrained" in Tighten | **Felt, never shown.** Her restraint comes through the Directors (cooler lines, tighter ranges). Her contract is intact. |
| 4 | A second way to derive rooms | **Keep the existing rooms.** Dish pressure and taste pressure are extra inputs to the existing LOIS/Davis states; definitions stay (BURN = hot keep streak, AWAY = gone 5 minutes). |
| 5 | Taste pressure signal | **Rolls since the last keep, now.** The keeps-vs-passes ratio joins when the pass gesture (#1173) lands. No clock. |
| 6 | What comes first | **The dish spine.** The live instrument runs on the dish before the affective slice is built on it. |
| 7 | Does a replay copy the original machine's shed detail | **No: detail is per machine.** The file is the artist's intent. Sketch on a laptop, perform on a bigger machine, and it looks better. The governor's state is recorded as a note for testing only. This is the one exception to decision 1. |

---

## Phases

### Phase 1: the dish spine *(done 2026-10-11, #1353)*
The live instrument runs on the same dish the replayer steps. Today the log can record what happened but cannot reproduce the picture, because the live pipeline does not use the dish (the session-log finding, #1314). This is the same work "One Petri Dish" needs.

- The live loop steps the dish; the replayer and the instrument share one step path.
- A recorded session replays to matching frame hashes; the footer export can then honestly be called a performance.
- Layers become strata of one dish (#1183, sketch approved: [`design/dish-strata-sketch.md`](design/dish-strata-sketch.md)): colour lean first, then contact shadow and tile-edge nudge, then palette lock. The dish roster replaces the LAYERS mixer (#1203) once the dish is the source of truth.
- **Exit:** export a live session, import it, replay with the recorded governor note applied: the frame hashes match the live run. Normal playback is per machine (decision 7). Plan: [`design/dish-spine-plan.md`](design/dish-spine-plan.md).

Issues: #1353 (closed: all six steps of the plan on main, exit met), #1183 (the four ground effects GROUND / EDGE / SHADOW / SNAP shipped 2026-10-12, kept open as the one-dish umbrella), #1203 (closed), #1314.

### Phase 2: stress, bands, telemetry *(done 2026-10-11, #1354)*
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

### Phase 3: wet lab and hierarchy *(complete, 2026-10-13)*
- The asset panel is the bio wet lab.
- A **pin** marks a privileged location only (spore-like). It does not create a hierarchy immediately.
- A hierarchy (head + body + limbs) forms only when **both** are true: attraction strength or field value at the pin exceeds a band-modulated threshold, **and** neighbour/density pressure around the pin exceeds a band-modulated threshold.
- Limb count can change over the creature's life. Base types stay inside the TE four.
- New event types: `pin`, `hierarchy-form`.
- **Exit:** a pinned spore becomes a creature under the two conditions, replayably.

Issues: #1206, #1355. Plan: [`design/wet-lab-plan.md`](design/wet-lab-plan.md). Steps 1 (hierarchy core, #1377), 2 (pins + dish pressure, #1379/#1381, the ATTACH points #1380 and the pin's state mark #1421), 3 (the formation rule, #1400) and 4 (the moth, #1418) are built and merged (2026-10-13). Step 5 (limb count over a life, #1423: the crowd grows and sheds a second pair of wings) and the moth's hover (#1424) are merged too: Phase 3 is complete. #1419 found and fixed a long-standing defect on the way: the live canvas was drawn upside-down against scene coordinates, exports and the pointer.

### Phase 4: influences *(steps 1 to 5 built; step 6 waits)*
The three personae read the band and the room.

- **Davis:** parametric shifts (scale, attachment angle, material bias) inside the current base type. Range width follows the band and room. Event: `davis-shift`.
- **LOIS:** tightens or loosens Davis ranges according to the room; ranks or filters Curator suggestions by room.
- **Queen:** warms defaults toward recent keeps (an in-session ring buffer of the last N keeps) and biases the order of the four base types offered at a pinned head. Subtle and unsurfaced; in Tighten her restraint is carried by the Directors (decision 3). The 8-keep gate stands.
- Rooms stay as built (decision 4); dish pressure and taste pressure feed the existing states. Event: `matrix-room`.
- **Exit:** the same recorded session produces the same influences on replay.

Status: steps 1 to 5 built (traits #1427, Davis shifts #1428, room width #1437, the room reads the dish #1444, the birth leans toward the last 3 keeps #1451). Step 4: a crowded dish reads as Davis FLOW, a sparse one as SEEDLING, only when none of his own signals is true; the LOIS side (taste pressure) waits for the pass gesture (#1173). `matrix-room` is carried by the room field of each `davis-shift` record. Step 5 (Matt: N = 3, 5 if 3 swings): at a keep the living moths' traits go in a session ring; a later birth is rolled around a centre nudged 0.35 x the room's allowance toward their mean, behind the 8-keep gate, never shown. Exit: `gl/performanceCreatures.selfcheck.mjs` (the traits ride the resolver input, so a take replays the moths). **Step 6 (base types 2 to 4 and the Queen's order at a pinned head) waits for Matt's designs.**

Issues: #1145, #1356, #1173 (pass gesture: upgrades taste pressure). Plan (draft): [`design/influences-plan.md`](design/influences-plan.md). As built: [`design/creatures-spec.md`](design/creatures-spec.md). Audit: [`research/backend-audit-2026-10-13.md`](research/backend-audit-2026-10-13.md).

---

## Parallel lanes (do not block the phases)

- **iPad worker probe (#1312):** needs the real device.
- **Living motion samplers (#1194 to #1200):** layout modes, one PR each, in flight.
- **#1144:** done. Matt locked the refine spread at 0.10.
- **#1365:** in refine, keep and gently vary the palette instead of jumping to the persona's preset.

## Queue: Voices, Variants, DLC (design session of 2026-10-11, nothing built)

Queued by Matt on 2026-10-11 from a separate design session. Specs live in two open docs PRs that Matt merges:
**#1372** (`docs/DLC_PRESET_TYPES.md`, `docs/VARIANTS_SWISS_JAPAN.md`) and **#1374** (`docs/VOICES.md`). These wait
behind the phases unless Matt re-orders them.

| # | Item | What it is | Spec |
|---|---|---|---|
| Q1 | **Layout variants** | Long-press a mode tile for a SWISS / JAPAN / NONE sheet. A variant is a data-only param overlay: one undo step, a dot indicator, no new buttons. 14 modes x 2 variants specced. | #1372 |
| Q2 | **Selection discipline** | Deal without replacement, a variety cap, and neighbour anti-repeat. Fixes "the same assets in a yucky way" (cause: independent weighted draws per placement). New params flagged: `margin`, `rotateSnap`. | #1372 |
| Q3 | **Slot system** | Library (unlimited, on disk) versus slots (capped, in memory). Loading past the cap replaces, never appends. Enforced in the store. **16 Look slots, 4x4** (locked). | #1372 |
| Q4 | **DLC as preset types** | `kc-style/1` exists; add `kc-look/1`, `kc-voice/1`, `kc-variant/1`, and a `kc-pack/1` container. The loader lives in Pipeline IMPORT (kind-sniff, install to Library, quarantine). | #1372 |
| Q5 | **Trio affect** | The pill breathes red, the face drifts amber, the Queen's mark quickens, each mapped to live conviction; still when silent; static under reduced motion. Voice marks trail live suggestions in submenus. | #1374 |
| Q6 | **Voice slots** | 4 (the Trio plus one guest). Recommended, not yet locked. | #1374 |

**Locked in that session (Matt):** 16 Look slots; Looks are new preset groups (no new buttons); voices are his casting
call; the variant mechanic (long-press, dot, one undo); Styles scope stays strict (FX chain, blend, opacity);
install via Pipeline, play in Build/Director, enforce in the store; the Queen's KEEP/PASS verdicts and ledger
doctrine, never named, no tooltip.

**Open questions for Matt (from that session):** lock voice slots at 4; file the Queen's M1 to M5 sway lines; are
voice lines user-editable or canonical; when to start the code (its first phase is types and validation, no UI).

**To reconcile before these are built** *(both reconciled 2026-10-12)*:
- `VOICES.md` lists Davis's verdict as `UGLY`. On screen it now reads **SIFT** and he almost never says the word
  (#1373). The internal code is still `UGLY`.
- The Queen has an unnamed mark in the app today (`components/SwayMark.jsx`), and `VOICES.md` gives her KEEP/PASS
  verdicts. `docs/characters/queen.md` says she has "no face, no pill, no meter, no state". The character file is
  the one that is out of step and needs correcting: unnamed and never explained, yes; invisible, no.
- Phase 4 (#1356, influences) and the taste flywheel (#1173) overlap Q5 and the Queen's keep/pass doctrine. Build
  them as one design, not two.

## Out of scope this cycle

- Live AI or model inference inside the app.
- Playing a performance file back inside the running instrument. Files are for testing and sharing this cycle.
- The full 20-room copy matrix, new faces, and any Queen rendering.
- **New** taste.json import work (the shipped taste artifact and the open sway gate stay as they are).
- Stage-specific items (Syphon #608, the full MIDI-learn surface #617) unless they fall out naturally.
- WebGPU (#1298).
- Retroactive capture, "save the last few minutes" (#1367): needs state snapshots and in-app playback first.
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
