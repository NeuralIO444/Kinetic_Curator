# The spectral path: how #1482 lands in this codebase

**Written for Matt, to approve the shape before any code.** Status: design, nothing built. 2026-10-14.
The research and the full wish-list are in issue #1482. This is the part that answers *how, in what order, and what
it costs you*, checked against what the repo already does.

## In one paragraph
Today audio reaches the picture as **seven numbers** (the bands) that nudge things. The spectral path adds a
**picture of the sound**: 128 narrow frequency bins, sent to the renderer as a tiny texture every frame, so the marks
themselves can be driven by *which* frequency they sit on. Bands modulate, spectrum structures. It is **additive**:
nothing about today's audio changes unless you switch the new thing on.

## What is already there, and what that means

| Today | What it means for this |
|---|---|
| The meter reads one analyser (FFT 2048, byte data, the browser's own smoothing) and turns it into 7 bands. | Those 7 bands drive your routes and feel. Changing that analyser would change how everything feels, so **v1 leaves it alone** and adds a second, separate analyser. |
| The renderer draws every mark as one instanced quad; the vertex shader already takes 8 per-instance inputs (the last is the impact deform). | The spectrum does not need a new per-instance input: it is a **texture the vertex shader looks up**, using the instance's index, angle, position or a hash of it. |
| The scene contract (what the renderer is handed) carries audio-derived numbers as plain fields and rejects anything malformed. | The spectrum rides it as **one optional key per layer**, absent when off, so every existing frame and its hash is exactly what it was. |
| A take records the resolver's inputs (which already include the audio-driven scale and alpha) but not raw audio. | A spectrum that only changes the *render* is not in a take. See decision 2. |
| The Queen's set (#1475) writes into the band levels, not the analyser. | Her beats would give the spectrum nothing to show. See decision 3. |
| Every costly renderer feature declares a cost tier the governor can shed. | The spectrum texture and its shader branch get one, shed before body counts, like deform. |

## What you will see

1. **A spectrum readout in STIMULI**: 128 log-spaced bins, a peak line and a waveform strip, so you see what the engine hears (read-only, beside the MOTION strip).
2. **A SPECTRUM section in STIMULI** with a few plain controls: *what drives it* (INDEX, ANGLE, POSITION, HASH: which frequency a mark listens to) and three amounts (SCALE, DISPLACE, COLOUR). Off by default. One global setting in v1; per-layer is a follow-on.
3. **Marks that listen**: with it on, a mark's size, offset and colour-ramp position follow its frequency. Silence relaxes everything back to the always-alive motion, as the design law requires.

## The build, one PR at a time

| # | PR | Visible? | What it proves |
|---|---|---|---|
| P1 | **The analysis core**, pure: log binning (128 bins, 30 Hz to 16 kHz), perceptual tilt, a dB window to 0..1, per-bin attack and release (frame-rate independent), a peak hold, and a "deviation from normal" mode. No wiring. | No | Synthetic tones land in the right bins; ballistics are the same at 30 and 144 fps; silence is exactly zero. |
| P2 | **The live feed**: a second analyser (float dB, no browser smoothing) behind the meter's tap, the spectrum holder, and the STIMULI readout. | Yes (readout) | Nothing in today's feel moved: bands and routes read the same numbers as before. |
| P3 | **The renderer**: the texture, the uniforms, the vertex-shader lookup with four mapping modes for scale, displacement and colour, the optional contract key, the cost tier. | Yes (the marks) | A browser GPU test like the contact shadow's: a known spectrum moves known marks; off is byte-identical. |
| P4 | **FX feedback warp** (the MilkDrop move): previous frame warped by the music. | Yes | Its own issue; the largest and the riskiest. |
| P5 | **Re-derive the 7 bands from the same core** so the matrix and the structure can never disagree. | A feel change | Needs an A/B with you; never silent. |

P1 to P3 are the issue's "v1". P4 and P5 are separate decisions.

## Decisions I need from you

1. **Additive second analyser (my recommendation) or replace the meter's analyser now?** Additive costs a little more CPU (one extra FFT) and changes nothing you have tuned. Replace gives "one core" immediately but moves every band's feel before you have heard it.
2. **Should a take record the spectrum so playback looks the same?** Without it, a take plays back with the same layout, motion and moths, but the marks do not listen (the take has no audio). With a compact record (32 bins, 8-bit, about 115 KB for a minute, gzipped smaller) playback is faithful. My recommendation: **record it**, as a section like the BPM, so a take is a true performance.
3. **Should the Queen's beats drive the spectrum?** She writes 7 band levels. We can smooth those into 128 bins (cheap, deterministic) so her set structures the picture too. My recommendation: **yes**, it is what makes the ladder (ambiance, her set, your audio) feel like one instrument.
4. **Where does the readout live?** Options: a new strip under the METER (my recommendation: nothing existing changes), or upgrade the METER hero itself to show 128 bins with the 7 named bands as groups (more honest, but it changes a control you use).
5. **Is the FX feedback warp (P4) part of this, or its own issue?** My recommendation: its own issue, after you have lived with P1 to P3.

## What it will cost

- **CPU**: about 0.5 ms a frame in JavaScript (one 1024-float read, sparse sums, 128 ballistics, a 4 KiB upload). No readbacks.
- **GPU**: one small texture and one gated branch in the vertex shader, skipped at amount 0.
- **Latency**: 40 to 60 ms, which is the FFT window, not the code.
- **iPad**: the cost tier lets the governor shed it first, and the second analyser can drop to fftSize 1024.

## Risks, plainly

- The renderer and `liveLoop.mjs` are one-writer files. The plan avoids `liveLoop` the way playback did: the feed rides a tiny holder like the MOTION readout, and the renderer change stays inside the quad shader and its uniform plumbing.
- Browser analysers differ a little between Chrome and Safari; the tilt and window are constants, tuned on your machine, and the selfcheck pins the maths, not the room.
- A live-only visual does not reproduce in exports (stills and renders). That matches how audio already behaves (BUGLIST: audio is live-only), and is stated on the section.
