# STIMULI + PLAY affective-computing research — code archaeology (2026-10-07)

**Scope:** facts only. No design proposals. Repo: `~/workspace/kc-main-review` (main @ `031f5df`), app under `app/src/`.
**Method:** LIVE-or-cut — every signal below was traced to a real call chain. Dead code is marked dead.

---

## 1. STIMULI panel map

**Panel:** `app/src/panels/StimulusPanel.jsx` (tag P06, title "STIMULI"). Subcomponents in `app/src/panels/stimulus/`:
- `SourceControls.jsx` — mic/file/monitor/gain, device list, lost/denied notices
- `MeterHero.jsx` — the hero meter, reads the meter tap directly (rAF, no store)
- `ModMatrix.jsx` — route table (#790) + **AUTO setup (#980, shipped)**
- `FeelPicker.jsx` — feel macros
- `ReactivityControls.jsx` — 8 raw sliders behind ADVANCED (#615)

**Audio engine** (`app/src/hooks/`, `app/src/gl/`):
- `useAudioInput.js` — owns the AudioContext graph + rAF `analyze()` loop. Callbacks: `onStimulus(shapedRms)`, `onBands({bass,mid,treble,rms})`, `onBeat()`, `onDenied(bool)`, `onLost(label)`.
- `audioInputConstraints.mjs` — **#1052 shipped**: `RAW_AUDIO` (echoCancellation/noiseSuppression/autoGainControl all false); `processingStillOn(settings)` reports what the browser kept on anyway.
- `audioLoss.mjs` — **#1053 shipped**: `classifyAudioError` (denied vs lost), `lostLine(name)`, `audioInputs(devices)`, `selectedInputMissing(source, devices)`.
- `audioMeterTap.js` — module-level meter tap; `readMeterBandLevels()` returns 7 named bands (sub, bass, mud, mids, edge, pres, air) or **null** when audio is off (never a frozen ghost).
- `useBeatDecay.js` — `beatPulse *= 0.90` per rAF frame (~100ms half-life); skips store writes once settled.
- `gl/audioBallistics.mjs` — **#306**: envelope follower (attack/decay + response curve) shapes everything the eye sees; **beat detection stays on RAW rms** so the clock keeps snap.
- `gl/stimuliAuto.mjs` — **#980 shipped**: `absorbPeaks`, `autoSetupRoutes`, `inputEnergy`, `retuneRoutes`, `deadRouteIndexes`. AUTO listens 1.5s (cap 8s), writes a starter route table from live bands, says "nothing to route" on silence and changes nothing.
- `gl/meterBands.mjs`, `gl/bandFeed.mjs` — meter FFT (finer analyser, meter-only).

**State** (`app/src/state/slices/audioSlice.js`): `audioEnabled`, `audioDenied`, `audioLost` (#1053, `{name}|null`), `audioSource {type: device|file, id}`, `audioLastFile`, `audioGain`, `audioMonitor`, `audioBands {bass,mid,treble,rms}`, `beatPulse`, `audioStimulus`, `audioRoutes` (#790, scene-level), `audioSidecar` (#618), `audioSidecarNote`.

**MIDI** (`app/src/midi/engine.mjs`, `app/src/hooks/useMidi.js`, `app/src/state/slices/midiSlice.js`): states `off|connecting|ready|no-devices|denied|unsupported`; `midiLast` = last raw message (for the monitor line); hot-plug handled, holds released on unplug.

**Verified shipped:** #1052 (raw constraints + honest still-on reporting), #1053 (loss classification + `audioLost` + graph shutdown so the meter reads zero), #980 (AUTO listen-and-route with silent-input refusal).

---

## 2. PLAY panel map

**Panel:** `app/src/panels/PlayPanel.jsx` (tag P04, title "PLAY"). Sections:
- `davis/QueueTransport.jsx` — **#966**: HITS setlist autoplay. `queuePlaying`, `queueIndex`, `queueSource` (TIME|BEAT), `queueSecondsPerHit`, `queueBeatsPerHit`; BEAT mode follows `beatBpm` (120 fallback). Advancing reuses deterministic recall (or morph path) — sequencing, not rendering.
- `davis/EvolveControls.jsx` — `evolveMode`, `evolveSource` (incl. BEAT), `evolveTarget`, `evolveInterval`.
- `davis/BeatRouter.jsx` — shown on beat collision (evolve on BEAT + phrase on AUDIO clock).
- `davis/MorphControls.jsx` — `morphEvolve`, `morphDurationMs`, `morphing`.
- `davis/PhraseControls.jsx` — `phraseEnabled/Length/Mode/Beat`, `phraseClock` (audio|metro|euclid), `euclidBeats/Steps/Rotate`, `beatBpm`, `phraseProgress`.

**Beat ordering:** `app/src/state/beatArbiter.js` — `routeBeat(state)` pure function: one audio attack → ordered decision `{tickPhrase, fireEvolve}`. Phrase (clock) resolves before evolve (gate). Gated off under `slowRender`/`batchPaused`.

**Phrase clocks** (`app/src/hooks/usePhraseLoop.js`): AUDIO (mic attacks via arbiter), METRO (loop-time accumulator, not wall clock — #808), EUCLID (same interval). All respect freeze gates.

**Transport:** `globalSlice.running`/`setRunning`; App.jsx `onPlayMe` sets running + audio + evolve. `BeatButton.jsx` (`beatBpm`, tap tempo, UX-4).

---

## 3. Honest signal table

| Signal | Source (file + symbol) | Live? | Cadence |
|---|---|---|---|
| `audioStimulus` (ballistics-shaped rms) | `audioSlice.setAudioStimulus` ← App.jsx `onAudioStimulus` ← `useAudioInput.analyze` | LIVE | rAF ~60Hz |
| `audioBands {bass,mid,treble,rms}` (shaped) | `audioSlice.setAudioBands` ← `onAudioBands` | LIVE | rAF |
| `beatPulse` | `audioSlice` ← App.jsx `onBeat` (+0.55, cap 1); decayed `useBeatDecay` 0.90/frame | LIVE | event + rAF decay |
| beat → phrase tick / evolve fire | `beatArbiter.routeBeat` → `tickPhraseBeat()` / `triggerEvolve()` | LIVE | event (attack) |
| 7 named meter bands | `audioMeterTap.readMeterBandLevels()` (MeterHero rAF) | LIVE | on-demand; null when off |
| `audioEnabled` / `audioDenied` / `audioLost` | `audioSlice`; `useAudioInput` catch + `track.onended` | LIVE | event |
| device list + plug/unplug | `StimulusPanel` `enumerateDevices()` + `devicechange` | LIVE | event |
| `audioSource` (device/file) | `audioSlice.setAudioSource` | LIVE | event |
| `midiStatus`, `midiLast` | `midiSlice` ← `midi/engine.mjs` via `useMidi` | LIVE | event |
| `phraseBeat`, `phraseClock`, `beatBpm` | layoutSlice; `usePhraseLoop`; `BeatButton` | LIVE | beat / interval / event |
| `queuePlaying`, `queueIndex`, `queueSource` | `state/queueTransport.js` | LIVE | event + hold timer |
| `running` (transport) | `globalSlice.setRunning` | LIVE | event |
| `evolveMode/Source/Target/Interval`, `morphing` | davisSlice / layoutSlice | LIVE | event |
| `seed`, `seedRevisit` | store; `loisActivity.noteSeed` | LIVE | event |
| rolls / keeps / undos / dwells / favorites / recalls / exports / idleMs / away / burning | `curator/loisActivity.js` (event bus + passive store subscription; wall-clock lives here, never in the store) | LIVE | event |
| keeps ledger (200 cap) | davisSlice `KEEPS_KEY='kc:keeps:v1'` | LIVE | event (`captureFavorite`) |
| favorites (200 cap) | davisSlice `FAVORITES_KEY='kc:favorites:v1'` | LIVE | event |
| `evolveSeen`, `evolveRun` | davisSlice (`withEvolveStats`) | LIVE | per evolve tick |

**Dead (do not use):** VIDEO stimulus input — removed (#310: "dead control, nothing reads motionEnergy"). `motionEnergy` help stub deleted.

---

## 4. Taste-system read path (the two-ledger rule)

- **Keeps ledger:** `davisSlice.js` — `captureFavorite(state, paletteId)` is the ONE capture site (seed, seedOffsets #305, full-epoch ISO timestamp, `config {layout, palette{id}, assets}`). Persisted `kc:keeps:v1` (200 max). Favorites imply keeps (`keepsFromKeeps`, #996).
- **Keep record shape:** `{seed, seedOffsets?, timestamp, config:{layout: layoutParams, palette:{id}, assets:[ids]}}`. **No session context** — no audio energy, BPM, or dwell recorded at keep time.
- **Passes:** studio sidecars (`render.mjs --emit-normalized`) + manual labeling sessions — a separate labeling effort, not app telemetry.
- **Shared feature language:** `curator/recipeFeatures.js` (`FEATURES_VERSION=2`) — one pure function both ledgers call; term rule mirrored in `tasteHead.js`, asserted by `tasteTerms.fixture.json`.
- **Curator priority** (`curator/curate.js` `getActiveCurator()`): MLX head → persona scorer (`taste.js`, 19 honest param features) → null curator (declines → honest dice roll, UI says "curator untrained").
- **Behavior feed:** `loisActivity.snapshot()` — rolls/keeps last 5m, undos last 10s, dwell windows `{seed, comp, ms}`, `msSinceSeed` + `paletteId` per favorite.

---

## 5. Dishonest-data blacklist

Grep over hooks/curator/stimulus/PLAY found **no simulated signals** — the "fake" hits are all explicit honest boundaries. Preserve these:
- `taste.js`: **no palette feature** — "Palette is NOT randomized by the Curator… that would be a fake signal."
- #618 sidecar: FILE source → bands read **0**, not a live-FFT guess ("the panel says so"). An affective layer must not read bands-as-silence for file sources.
- Meter tap null = idle; never a frozen ghost (`setAudioMeterTap(null)` on teardown).
- `nullCurator` declines; UI says "curator untrained" — never fake curation.
- `audioLost` shuts the graph so the meter reads **zero**, not a frozen last value.
- Legacy `HH:MM:SS` favorite timestamps → `parseFavoriteTimestamp` returns **null** (date unknown), never invented.
- `selectedInputMissing`: empty device list = "not enumerated yet", not "everything is gone".
- **Frame-rate caveat:** `beatPulse` decay (0.90/frame) assumes ~60fps; beat threshold is raw-rms spike > 0.15; `audioStimulus` is ballistics-shaped (attack 25ms/decay 320ms defaults), not raw level.

---

## 6. iPad constraints (from code)

- **Web MIDI: unsupported on Safari** — `midi/engine.mjs` reports `unsupported` honestly ("use Chrome or Edge"). #617 MIDI learn **cannot work on iPad Safari**; needs a BLE-MIDI path or alternative.
- **AudioContext:** `window.AudioContext || window.webkitAudioContext` fallback present; iOS requires a user gesture (the AUDIO toggle is one — OK) and suspends on lock/background.
- **getUserMedia:** works on iPad Safari; device labels hidden until permission granted (existing `selectedInputMissing` handles the not-enumerated state).
- **Touch targets:** `.range-row` / sliders are 44px min-height (`styles/controls.css`) — meets the 44pt guideline. No canvas picking exists (phase-2 item, un-blocks KINEME per-instance work).
- **Perf:** dual analysers (256 + `METER_FFT_SIZE`) at rAF are light; the binding constraint is the GL instance budget (shed tiers), not the audio path.

---

## 7. ADDENDUM — one MLX taste model per persona? (Matt's question)

### 7.1 Current taste.json shape

```json
{
  "kind": "kc-taste", "version": 1, "featuresVersion": 2,
  "model": "mlx-community/siglip-so400m-patch14-384", "dims": 1152,
  "probe": {"weights": [...1152...], "bias": 0, "C": 0},   // dropped by the app
  "manifest": [{"png": "...", "sha256": "..."}],            // content hashes, never images
  "labels": {"likes": 0, "passes": 0},
  "cv": {...}, "trainedAt": "2026-…Z",
  "head": {"terms": {"system=swarm": 0.12, …}, "num": {"markDensity": 0.3, …},
           "bias": 0, "fidelity": 0, "fitOn": 0},
  "lois": {                                                  // optional second head (#954)
    "labels": {"favorites": 0, "keeps": 0},
    "head": {...same shape...}, "probe": {...}
  }
}
```

### 7.2 Where it's produced and consumed

- **Produced:** Mac Studio only. `studio/curator.py` — `embed` (SigLIP 1152-dim) → `label`/`apply-sheet` (keep/pass) → `train` (logistic probe, ROC-AUC gate > 0.6) → distil ridge head over recipe features → `taste.json`. The `lois` head is attached by `attach_lois()` (#954).
- **Consumed:** Pipeline → IMPORT TASTE → `curator/tasteStore.js` `importTaste()` (validates via `tasteHead.validateTaste`, keeps only heads — probe weights dropped) → `localStorage kc:taste:v1` → `curate.js getActiveCurator()` → `makeMlxCurator()` (active only if `fidelity ≥ 0.3`, `HEAD_MIN_FIDELITY`). Readouts: `tasteSummary()`, `loisSummary()`, `scoreBoldness()` (CRIT), `retrainNudge()` (50 keeps).
- **Status: #762 is OPEN (hardware-blocked). No taste.json has ever been produced.** The entire MLX path — including the Lois head — is code-complete but unproven. #926 (richer features if fidelity < 0.3) is OPEN but contingent on a real failed run.

### 7.3 One artifact with three heads vs three separate models

**The codebase already chose:** one artifact, N heads. The `lois` section is the precedent (#954, closed): same file, same `FEATURES_VERSION`, same `featureTerms` rule, one import path, one validation gate, one retrain nudge. Assessment:

- **For one artifact:** heads are tiny (ridge over ≤4000 terms + numerics) — marginal cost of a head is ~KB once labels exist. One artifact guarantees all heads trained on the same feature version and label snapshot; one import/validate/UI surface; the retrain nudge covers all heads at once.
- **Against three separate models:** 3× runbook runs, 3× imports, 3× version-skew risk (a head trained on features v2 vs app on v3 silently degrades — the validator catches it only per-file), 3× storage/UX. No technical benefit: heads don't interact at train time.
- **Data sparsity (the real constraint):** every head slices the same small pool. Caps: 200 keeps, 200 favorites. Main head needs ≥20 likes + ≥20 passes (runbook minimum; passes require a separate labeling session). Lois head needs **both** favorites **and** kept-not-favorited (`curator.py:440` refuses otherwise) — if Matt stars 10% of keeps, that's ~20 vs ~180, imbalanced but trainable; if he rarely stars, the positive class collapses. A third head needs per-keep context rows that **don't exist yet** (see 7.4). #926 exists precisely because even the single main head may not clear 0.3.
- **Verdict:** one artifact, up to three heads is the right shape — it matches the shipped precedent. But it multiplies the label burden on a pool that hasn't produced one proven head yet. **Prove LOIS first (#762 → #926 gate);** a third head before the first head clears 0.3 is premature.

### 7.4 Distinct training targets per persona (from the same keep events)

| Persona | Target | Labels available today? | Source |
|---|---|---|---|
| **LOIS** (judgment) | favorites (1) vs kept-but-not-favorited (0) — "boldness" | **YES** — code shipped (#954): `attach_lois()` in `curator.py:369`, consumed by `scoreBoldness()` / CRIT. Untrained only for lack of a run. | `kc:keeps:v1` + `kc:favorites:v1` |
| **Davis** (fertility) | which seed regions / trajectories were fertile — e.g. keeps-per-roll by seed, dwell→keep conversion, evolve runs that produced keeps | **NO pipeline** — derivable signals exist (`loisActivity`: rolls ts, keeps ts, dwells `{seed,comp,ms}`, `seedRevisit`; davisSlice `evolveSeen`/`evolveRun`) but no label derivation exists in `curator.py` | would need new labeling code |
| **Queen** (inclination) | session-context correlations at keep time — audio energy, BPM, palette, dwell length when a keep happened | **NO data** — keep records carry no session context (`captureFavorite` records recipe only). `loisActivity` has `msSinceSeed` + `paletteId` per favorite, but nothing is snapshotted at keep time | would need new instrumentation at the ONE capture site (`davisSlice.captureFavorite`) + new context features in `recipeFeatures` (→ `FEATURES_VERSION` bump) |

### 7.5 Consumption constraint (for the design agent)

Existing consumption points are `pick()` (curate.js — chooses the winner, visible) and `scoreBoldness()` (CRIT readout, visible). A Queen head that scored candidates through either channel would be *caught rendering*, violating her persona contract ("the seducer is never caught"). Any Queen head needs a deniable consumption channel — flagged, not solved here.
