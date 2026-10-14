# FM-1 with KC-1 — research report and plan

**Status:** research closed 2026-10-05, **parked until the unit arrives.** Nothing here has been tested on hardware. **No issues are filed** and none should be until the arrival-day tests (section 8) are done. The FM-1 is a **trial**: a different controller may replace it (section 12).
**Evidence tags:** VERIFIED = a source was read. INFERRED = reasoned from sources. UNKNOWN = needs the unit.

**Sources**
- Official manual: https://manualf.oss-cn-hongkong.aliyuncs.com/manual/MIDI-KEYBOARD/FM-1-manual.pdf
- Official release notes: https://yms-file-store.oss-cn-hongkong.aliyuncs.com/software/releaseNote/firmware/FM-1.txt
- Official MIDI chart (the PDF Matt supplied)
- Elektronauts thread, pages 1–10: https://www.elektronauts.com/t/m-vave-fm-1/252170
- Synthanatomy review: https://synthanatomy.com/2026/07/m-vave-fm-1-review-low-budget-pocket-fm-ynthesizer-with-iconic-sounds.html
- KC-1 code on `origin/main` (98dca66)
- Not reached: cuvave.com (certificate error) and baudgirl.com (custom firmware; blocked from this network).

## 1. Summary

The plan was: use the FM-1 as a **silent keyboard of stage buttons for KC-1**, and use its **sequencer loop as the sound that drives STIMULI**. The manual shows those two halves cannot run together on one stock unit. The controller half is sound but needs more KC-1 work than expected: there is no way to bind a key in the UI today, and the layout needs a bank system. Three fixes in KC-1's audio input are worth doing whether or not the FM-1 is ever used.

**Resolved (section 5):** record the FM-1 loop once and play it through KC-1's file audio source. On stage the FM-1 is a silent controller only.

## 2. The device

| Fact | Value | Evidence |
|---|---|---|
| Engine | 6-operator DX7-style FM, 32 algorithms, 12 voices | VERIFIED (reviews) |
| Presets | 128, banks A–D | VERIFIED |
| Keys | 27, piano-style, sending notes 53–79 at octave 0 | VERIFIED (manual p12) |
| Sequencer | 16 steps, 16 patterns. ARP and SEQ are mutually exclusive. | VERIFIED (manual) |
| Audio out | One 3.5mm headphone jack, mirrored mono. No line out. | VERIFIED |
| Speaker | Mutes only when a plug is in the headphone jack | VERIFIED (manual p13) |
| USB audio | Not in the manual. Forum users confirm it on Windows and Android. | UNKNOWN on macOS |
| MIDI in | USB-C, Bluetooth, 3.5mm TRS | VERIFIED |
| Sends notes | From the keyboard, the arpeggiator **and the sequencer**, with velocity | VERIFIED (manual p13) |
| Sends knob CCs | No | VERIFIED (forum) |
| Sends clock / start / stop | Not documented | UNKNOWN, expected no |
| Local off | None. The global menu has MIDI channel, effect channel, bend range, reset, global velocity, glide. | VERIFIED (manual p7) |
| Velocity-sensitive keys | "Global Velocity 1–127" reads like a fixed or scaled value | UNKNOWN |
| Octave / transpose | Changes the notes sent: note = key + 53 + octave×12 + transpose | VERIFIED (manual p12) |

### What it receives (official chart)

- **Note channel** (default Omni): Note On/Off, Program Change, Pitch Bend, Aftertouch, CC1, CC64.
- **Effect channel** (default channel 2): CC 0–23 for the six effects. On this channel CC1 is Filter Type, not ModWheel.
- **Clock:** follows F8. Start (FA) and Continue (FB) both start from step 0. Stop (FC) stops. Needs SEQ SYNC turned on.
- **SysEx:** `F0 43 10 pp qq vv F7` writes one parameter, 0–155.

## 3. Can it be hacked?

Lightly, and this plan doesn't need it.

- The SysEx header is the Yamaha DX7 format, so the 156 parameters are very likely the DX7 voice parameters. INFERRED.
- Patch editors exist (fm1-editor.com, FM-1 Helper, DXcompanion) and import DX7 banks. VERIFIED.
- A custom firmware, "FM-1 VA", exists. Whether it adds local-off or MIDI changes is UNKNOWN (site not reached). No revert path was found. **Do not flash it before a gig.**
- The TRS MIDI port locks up above about 60 bytes per send. Use USB.

**Decision:** stock firmware, no SysEx.

## 4. Decisions (Matt, 2026-10-05) and how they hold up

| # | Decision | Verdict | Why |
|---|---|---|---|
| 1 | Controller first | **Holds** | It sends notes over USB as a standard MIDI device. Chrome or Edge only (section 6). |
| 2 | Keys silent | **At risk** | No local-off. Works by turning the volume down or plugging a dummy jack, which only works when the FM-1 is not the sound source. |
| 3 | Action keys + palette and voice pickers | **Broken as specified** | 27 keys, 43-plus targets. No picker targets exist. Needs banks. |
| 4 | Velocity on action keys | **At risk** | Unknown on the device, and KC-1 discards velocity today. |
| 5 | FM-1 sequencer loop drives STIMULI | **Broken alongside 2 and 3** | See section 5. |
| 6 | KC-1 sends clock later | **Holds, all unbuilt** | No MIDI output, no transport or phase on BEAT. #617 lists clock as out of scope. |
| 7 | Clock is the only thing KC-1 sends back | **Holds** | Clock, Start and Stop need no SysEx. |

## 5. The conflict that needs a decision

Three facts from the manual:

1. **The sequencer transmits its notes** on the same channel as the keys. A running loop would fire the palette pickers on every step.
2. **There is no local-off**, so the keys always sound.
3. **In SEQ mode the keys write notes into sequencer steps**, and the voice is bound to the pattern. The keys stop being free buttons.

So one stock FM-1 cannot be a silent controller and the live sound source at once. Options:

| Option | What it means | Cost |
|---|---|---|
| **A. Record the loop** | Record the FM-1 loop once and play it through KC-1's existing FILE audio source. The FM-1 is then a silent controller only. | None in code. The loop is no longer live. |
| **B. Two modes** | Either a controller set (volume down, sequencer stopped) or a sound set (sequencer running, KC-1 ignores its notes). Not both at once. | An "ignore notes" toggle in KC-1. |
| **C. Accept audible keys** | Keys sound over the loop as accents. | Still breaks: sequencer notes fire the pickers, and SEQ mode takes the keys. |
| **D. Second device** | A pad controller for control, the FM-1 for sound. | More hardware. |

**Decision (Matt, 2026-10-05): option A.** Record the loop and play it from KC-1's FILE source; the FM-1 is a silent controller. Option B stays as a possible later feature. C does not work.

One limit to know: with a FILE sidecar driving, the seven meter bands read 0 by design (`gl/bandFeed.mjs`), so routes on `band.*` inputs go quiet. Check on arrival day whether a plain recorded audio file (not a sidecar) feeds the bands.

## 6. What KC-1 has, and what is missing

Read on `origin/main`. Spot-checked: the audio constraints, the Tauri version, the MIDI section and the binding cap.

**MIDI**
- A Web MIDI engine is merged (#804). It opens **inputs only** and parses Note On/Off and CC. Clock, SysEx and pitch bend are ignored on purpose.
- Bindings are keyed `note:ch:n` / `cc:ch:n`, saved with the project, capped at 64 (`midi/map.mjs:9`).
- **There is no way to create a binding in the UI.** `MidiSection.jsx` lists and removes mappings only, and learn is a stub (#878). Until that changes, mapping means hand-editing a project file.
- Targets today: EVOLVE, NEW SEED, FAVORITE, SWELL, CLEAR, FREEZE (hold), the FEEL presets, five slider CCs, EVOLVE INTERVAL. **No palette, voice or shuffle target.**
- Triggers fire with no value (`midi/engine.mjs:51`), and `swellAccum()` takes no amount (`gl/liveLoop.mjs:1309`, a one-writer file). Velocity needs both changed.

**Audio input** (these matter with or without the FM-1)
- `hooks/useAudioInput.js:159` calls `getUserMedia` with no processing constraints, so Chrome's **echo cancellation, noise suppression and auto gain stay on**. They will pump and duck music.
- There is **no device-loss handling**: no track `ended` handler, no `devicechange` listener. An unplug mid-set leaves a silent analyser with no warning.
- The modulation analyser is a 256-point FFT. A mid-register FM line will land mostly in one band. INFERRED.

**Platform**
- The desktop shell is **Tauri 1.8, not Electron** (`src-tauri/Cargo.toml`). macOS WKWebView has no Web MIDI, so **MIDI works only in Chrome or Edge**, not in the native shell.

**Picker performance**
- Palette change: no atlas rebake; it is a frame crossfade over two beats. Read, not measured. A palette key during a voice blend cancels the blend (`layoutSlice.js:233`).
- Voice change: stepped mix with brief rebake holds. Mashing voice keys will hitch.

**Shuffle** has no target today. The word currently means the palette harmony reroll or `kineticRoll`; the beat-quantized SHUFFLE is the unbuilt #1042.

## 7. A key layout that fits 27 keys

16 white keys and 11 black keys. Stay at octave 0. Bank state lives in KC-1 and is shown on screen.

- **11 black keys, the same in every bank:** EVOLVE, NEW SEED, SWELL, FREEZE (hold), SHUFFLE, FAVORITE, PANIC/CLEAR, then four bank selects: PAL-A, PAL-B, PAL-C, VOICE.
- **16 white keys, pickers for the active bank:**
  - PAL-A: palettes 1–16
  - PAL-B: palettes 17–32
  - PAL-C: palettes 33–37, plus 11 slots for favorites
  - VOICE: 4 flagship voices, then up to 12 user voices

Do not use the unit's OCT buttons as banks. KC-1 cannot see the octave state, adjacent octaves overlap, and one stray press remaps every key.

## 8. Arrival-day test script

Ordered so the early tests decide the most. Tools: MIDI Monitor, Audio MIDI Setup, QuickTime, Chrome.

1. **MIDI Monitor, lowest and highest key.** Pass: notes 53 and 79. Record the transmit channel.
2. **Soft and hard hits.** Pass: velocity varies. Change Global Velocity and repeat. If constant, decision 4 is dead.
3. **Sequencer playing, hands off.** Do notes appear? Expected yes. Record the channel.
4. **Sequencer playing, press keys without REC.** Do they sound, send notes, or alter the pattern?
5. **OCT+ once, then OCT− and OCT+ together.** Do notes shift by 12, then reset? Does the octave survive a power cycle?
6. **Turn every knob, press PLAY and STOP.** Any CC or clock out? Expected none.
7. **Volume knob to zero.** Do notes still send? Does the USB audio level drop too?
8. **Audio MIDI Setup.** Does the FM-1 appear as an audio input? Record rate and channels. Check macOS did not switch its default output to it.
9. **QuickTime recording from the FM-1.** Listen for hum with the charger in and out, and clipping on four-note chords.
10. **KC-1 in Chrome, STIMULI source = FM-1.** Does the meter pump or duck on sustained notes? That confirms the audio-processing problem.
11. **Unplug USB mid-run.** MIDI status should say unplugged. Record what the audio meter does.
12. **Web MIDI test page:** send clock at 120 BPM, then Start, with SEQ SYNC on. Does it follow and start from step 0?
13. **Pair Bluetooth MIDI** in Audio MIDI Setup. Does it appear in Chrome? Judge latency by feel.
14. **Idle 30 minutes** on battery and on USB. Any auto-sleep? Time the boot. Do settings persist?

## 9. Proposed build order

**Nothing is filed, on Matt's instruction: hold everything until the unit is tested.** This is the order to file in afterwards. Each line is its own issue and PR; Matt orders them. Items 1 and 2 do not depend on the FM-1 at all and can be filed whenever Matt likes.

| # | Work | Size | Depends on |
|---|---|---|---|
| 1 | Unprocessed audio input (turn the three Chrome constraints off) | S | Nothing. Worth doing regardless. |
| 2 | Audio device loss and hot-plug, with an honest status | S | Nothing. Worth doing regardless. |
| 3 | Manual bind UI, or un-defer learn (#878) | M | The unit (tests 1–2) |
| 4 | Palette and voice picker targets; raise the binding cap | S | 3 |
| 5 | KC-1 bank layer + on-screen key legend | M | 4 |
| 6 | MIDI panic, an ignore-notes toggle, an "octave shifted" warning | S | 3 |
| 7 | Velocity to action targets | S/M | Test 2. Touches `liveLoop.mjs` (one-writer). |
| 8 | Shuffle target | S | Matt's definition, possibly #1042 |
| 9 | MIDI clock and Start out (worker-timed, timestamped sends) | L | Test 12, and re-scoping #617 |
| 10 | Shipped FM-1 default key map | S | 4, 5, tests 1 and 5 |

## 10. Decisions and what is still open

**Decided (Matt, 2026-10-05)**

| Topic | Decision |
|---|---|
| Silent keys vs live loop | Record the loop; FM-1 is a silent controller (option A) |
| Device | The FM-1 is a trial. Test first; switch to a pad controller if it fails the bar in section 12 |
| Shuffle key | PATTERN's SHUFFLE (#1042). The key stays unassigned until PATTERN lands |
| Browser | Chrome-only MIDI is acceptable. No native-shell MIDI work |
| Issues | None filed until the unit is tested, including the two audio fixes |
| Key layout | Section 7 stands as the starting proposal; revisit after feeling the keys |

**Still open**

1. Is the "MIDI clock is out of scope" rule on #617 lifted for clock **out**? Only matters at build item 9.
2. Everything marked UNKNOWN in section 2, settled by the tests in section 8.

## 11. Performer notes

- **Legend:** 27 unlabeled keys in the dark need an on-screen legend or a printed strip.
- **Fallback:** if the unit dies, the existing hotkeys and favorites 1–9 are the fallback. Rehearse it.
- **Levels:** set the device volume so four-note chords do not clip, then trim with STIMULI gain.
- **A pad controller is a better fit for 37 pickers** (a 64-pad grid can light in palette colours; an Akai LPD8 class device gives real velocity pads and knobs). The FM-1 still earns its place as a sound source and a spare 27-button board.

## 12. Trial bar: keep the FM-1 or switch

The FM-1 stays as the controller if these pass on arrival day:

| Test | Pass | If it fails |
|---|---|---|
| 1 | Keys send stable notes 53–79 | Not usable as a controller |
| 5 | Octave can be left at 0 and survives a power cycle | Usable, but one stray press breaks the map; needs the "octave shifted" warning |
| 2 | Velocity varies with how hard you hit | Drop decision 4, or switch device if velocity matters to you |
| 7 | Notes still send with the volume at zero | Silent control is not possible; switch device |
| Feel | Silicone keys are playable fast, in the dark | Switch device |

Candidates if it fails (not researched in depth; check before buying):

- **A 64-pad grid** (Launchpad Mini class): one pad per palette with no banks, and pads can light in palette colours. Lighting needs MIDI **out** from KC-1.
- **A small pad + knob controller** (Akai LPD8 class, or M-VAVE's own SMC-PAD): real velocity pads and CC knobs for the five slider targets KC-1 already has.

Either way the KC-1 work in section 9 (bind UI, picker targets, banks, legend, panic) is the same, so nothing there is wasted if the device changes.

