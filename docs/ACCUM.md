# ACCUM on GPU — the trail recipe (#190, absorbs #169)

ACCUM is the HYPE-style pixel feedback buffer: every frame fades the light
already in the buffer, then composites the new frame over it, so motion
leaves trails. Phase 4 moved the buffer from a 2D canvas to GPU ping-pong
textures and added the #169 optics (bloom / halation / blur-over-time) as
shader passes.

## Migration status (explicit, per #169's share-or-refuse rule)

> 2026-09-17 (#192): Phase 6 deliberately did **not** move the live loop to
> the GPU — the interactive canvas stays React/SVG. The two recipes below
> remain intentionally different; this document records the difference
> instead of hiding it. A live WebGL loop is a separate work order.

- **`studio.py render --accum`** runs the GPU recipe below via
  `app/src/gl/accumStill.mjs`. If Chromium/WebGL is unavailable it **refuses**
  (exit 3) rather than falling back to a different recipe.
- **The SVG live app** (`useAccumulationBuffer.js`) still uses the legacy
  2D-canvas feedback path. It is explicitly the OLD recipe, not the GPU one:
  it fades alpha (`destination-in`) while the GPU recipe fades light
  (`rgb *= keep`). The live loop migrates to the GPU recipe when the live
  renderer goes WebGL (a later phase); until then the two paths are
  intentionally different and this document records the difference instead
  of hiding it.

## The one recipe

`app/src/gl/accum.mjs` is the single source of truth. The future live loop
and `studio.py render --accum` (via `app/src/gl/accumStill.mjs`) run this
exact code — per #169's rule the two paths share the recipe or the export
refuses. There is intentionally no second implementation.

Per frame, on premultiplied RGBA16F, opaque buffer (`bridge.layer('__accum__')`
ping-pong, NEAREST):

0. **Echoes** (Phase B3) — the ring buffer's past taps are mixed into the
   incoming frame first (tap *i* = the frame from *i*+1 steps ago, additive
   ghosts, α clamped ≤ 1); the current frame is then pushed into the ring.
   Skipped at echoes = 0 (no ring, no mix pass).
1. **Feed** (Phase B2) — flow-advected feedback: the buffer is sampled at
   `uv + flowVec(uv) * strength` through an in-shader value-noise field, so
   trails curl as they decay. Skipped at flow = 0 (exact old buffer).
2. **Fade/decay** — `accum.rgb *= keep` (keep = 0.5^(1/FADE), where FADE
   is the slider's trail half-life in frames, 1..40 — #274 taper), sampled
   through the Phase A feedback transform (tunnel zoom/spin, prism drift).
3. **Blur-over-time** (#169) — the incoming frame is blurred with a small
   separable gaussian (σ = 5px × optics) *before* compositing, so old marks
   go soft instead of merely transparent.
4. **Composite** — `accum = frame OVER accum` (premultiplied source-over).
5. **Bloom** (#169) — downsample the buffer to 1/4 (4×4 box), separable
   gaussian blur, add back: `accum.rgb += 0.55 × optics × blurred`.
6. **Halation** (#169) — the same downsampled buffer blurred *wider*, added
   back with a red/warm bias: `accum.rgb += 0.45 × optics × (1.0, 0.6, 0.35) × blurredWide`.
   The reference look is the full 3σ gaussian kernel the JS mirror evaluates
   (#226): halation σ runs 11→33px on the quarter-res buffer, whose 3σ radius
   (up to 99 taps) exceeds the blur shader's 64-tap loop, so the GPU
   subdivides wide sigmas into multiple passes at σ/√n
   (`blurPassSigmas`) — repeated gaussians convolve back to the full kernel.
   The old truncated-at-64 kernel (narrower, weaker glow at high optics) was
   the artifact, not the look.

One amount drives steps 3/5/6: **optics** 0..1 — the GLOW slider next to
FADE in the toggle row (`layoutParams.accumulationOptics`, default 0).
optics = 0 reduces the recipe to fade + over; the optics passes are no-ops,
not a second engine. Everything is off by default: the recipe only runs when
the scene contract carries `accum.enabled`; a null `contract.accum` means a
plain `renderScene` with zero new passes.

## Phase A — feedback: TUNNEL + PRISM (light-tunnels + chromatic drift)

Step 1 (fade) samples the buffer through an affine feedback transform
before decaying. Two amounts, both 0/off by default — the FEEDBACK sliders
next to GLOW (`layoutParams.accumulationTunnel`,
`layoutParams.accumulationPrism`):

- **TUNNEL** 0..1 — per-frame zoom + spin about the canvas center, so motion
  spirals into light-tunnels. Zoom = 1 + 0.01·t per frame (27% over a
  24-frame still at full), spin = 0.01·t rad/frame (~14° over the still).
- **PRISM** 0..1 — radial RGB channel separation (chromatic drift). Red is
  sampled slightly outward, blue slightly inward, green stays centered:
  white trails split into rainbow fringes that widen with trail age. Push =
  0.001·pr UV per frame — tasteful below ~0.4, bold rainbows at long fades
  near 1 (fringe width ≈ push/(1−keep)).

At 0 both skip the transform branch entirely — exactly the old sample, no
float drift through the affine math (the optics no-op precedent). The
feedback textures are bridge-owned NEAREST ping-pong, so sub-texel shifts
quantize: the effect reads at still sizes (≥~500px) and is exact there —
GPU-vs-JS-mirror cross-checked in `accum.selfcheck.mjs`.

`studio.py render --accum` accepts `--tunnel` / `--prism` (or reads the
sliders from the project doc). The in-app RENDER ACCUM button captures the
live 2D buffer, so tunnel/prism are still-side only — the live canvas keeps
the legacy 2D path until the live WebGL loop lands (#224).

## Phase B — dynamics: AUDIO + FLOW + ECHOES

Three new amounts, all 0/off by default, all studio/still-path only (the
GPU recipe in `accumStill.mjs` + `studio.py render --accum`). Nothing here
touches the live React/SVG canvas — live wiring waits for the WebGL loop
(#224).

### B1. Audio-reactive dynamics

`--audio track.audio.json` feeds a per-step envelope that modulates `keep` /
`optics` and the Phase-A amounts through the shared recipe
(`applyAudioEnvelope` in `accum.mjs` — pure, mirrored, selfchecked; not a
studio-only hack). On screen: the trail system breathes with the music —
kick lands → trails punch longer and glow swells; quiet passage → trails
die fast and the frame goes clean.

**Sidecar format** — schema `kc-audio-envelope/1`, written by the offline
generator `python3 studio/audio_envelope.py track.mp3 -o track.audio.json`
(needs `pip install -e ".[audio]"` in `studio/`: librosa 1.0.0, pure-Python
arm64 wheels; `studio.py` itself stays stdlib-only and only reads the JSON):

```json
{
  "schema": "kc-audio-envelope/1",
  "source": "track.mp3",
  "sr": 22050, "hop_length": 512, "fps": 43.066,
  "duration": 237.4,
  "tempo_bpm": 128.04,
  "frames": [
    { "t": 0.0, "rms": 0.12, "flux": 0.05, "beat_phase": 0.0 },
    { "t": 0.5, "rms": 0.90, "flux": 0.83, "beat_phase": 0.47 }
  ],
  "beats": [0.47, 0.94, 1.41],
  "downbeats": []
}
```

- `frames`: fixed-rate grid (~43 fps at 22050 Hz / hop 512). `rms` 0..~1
  peak-normalized (loudness); `flux` 0..1 normalized onset strength
  (transient novelty); `beat_phase` 0..1 within the beat interval, 0 before
  the first beat.
- `beats`: absolute beat times in seconds (empty if tracking confidence
  is low). `downbeats`: reserved, empty for now — librosa does not do
  downbeats; the essentia upgrade path (below) fills it.
- The sidecar's `fps` is informational (the grid rate); the renderer
  ignores it and resamples onto its own frame times.

**Sampler** (`audioEnvelope.mjs`, shared by the still renderer): per step,
`t_i = (i / (steps-1)) * (steps / fps)`; `rms` and `flux` interpolate
linearly, `beat_phase` takes the nearest sample (avoids 0↔1 wrap
artifacts), and `beatPulse` is derived from `beats[]`: fires 1.0 at each
beat, decays linearly over one beat interval, 0 before the first beat.

**Ballistics** (#306, `audioBallistics.mjs`): the raw envelope never reaches
the mapping directly. Each sample first passes through an envelope follower
— attack and decay time constants (one-pole, per channel) — and then a
response curve: `linear` (unchanged), `exponential` (x² — suppresses
low-level jitter, loud hits land with weight; the live default),
`logarithmic` (lifts quiet swells so subtle music stays visible), or
`peak-hold` (snaps to the peak instantly, falls off linearly at
1/decayMs per ms — punchy attacks, smooth decays). This is what turns
jittery transient-snapping into a heavy, fluid weight on driven
scale/rotation. The live instrument reads attack/decay/curve from the
STIMULI panel (ENVELOPE); the studio still path takes
`--attack-ms` / `--decay-ms` / `--response` (defaults are the identity, so
existing renders are unchanged). Silence decays to exact zeros, so the
no-audio contract below holds on every path.

**Modulation** — three distinct gestures, one per signal:

- `rms` (the swell): `keep += 0.08 * rms` (≤ 0.99),
  `optics += (1 - optics) * swell * 0.3 * rms` — headroom-relative, so loud
  audio swells the glow toward the slider's ceiling instead of pegging it
  at 1.
- `flux` (the transient hit): `keep += 0.04 * flux` — hits punch the
  trails longer without swelling the glow.
- `beatPulse` (the on-the-one): `optics += (1 - optics) * swell * 0.1 * beatPulse` —
  glow pops on the beat without lengthening trails, and never pegs.
- tunnel zoom/spin and prism amounts scale × `(1 + 2*rms + flux + beatPulse)`.
- Silence (all zeros) returns the params unchanged — the no-audio path is
  exactly the old recipe.
- **SWELL** (0–1, default 1) is the audio→glow fader: it scales only the
  glow gesture. The known limitation — loud audio washing out the render
  at high glow — is now a control, not just a caution: bloom is an
  additive per-frame feedback (`accum.rgb += bloomAmount * blurred`), so
  big optics swings ratchet bright content toward white over a long
  sequence. If a loud passage blows out the highlights, pull SWELL down
  (0 = the music never touches the glow) instead of touching the GLOW
  slider. In the still path this is the `--swell` flag.

A missing or malformed sidecar warns on stderr and is a real no-op (renders
without audio); the pre-research sketch (bare `[{t, rms, beat}]`) is still
accepted as a legacy alias. Without `--accum`, `--audio` is ignored.

**Upgrade hooks.** Beat tracking is the classical DSP stack (spectral flux +
autocorrelation tempogram + DP tracking — the right weight class for aiming
a feedback slider; neural trackers are SOTA but overkill here). If librosa's
tracking ever feels too loose, essentia (2.1b6.dev1438+, which now ships
`macosx_15_0_arm64` wheels, cp314-only for now) is the documented upgrade:
swap the generator's beat stage and fill `downbeats`, which then drives a
bar-aware gesture from `beat_phase`. Live input (post-#224) is a separate
path: `sounddevice` callbacks into the same feature math is the recommended
first prototype; `AVAudioEngine` + Accelerate/vDSP only if a native macOS
app ever ships. SoundAnalysis is classification-only and has no beat
tracker; aubio is sdist-only on PyPI (compile friction); madmom is
unmaintained; AudioKit is Swift-only.

### B2. Flow-advected feedback

`--flow 0..1`. A new FEED pass runs on the accum buffer before the
fade/decay pass: the buffer is sampled at `uv + flow(uv) * strength`
through a small in-shader value-noise field (integer hash, no textures),
so trails curl, braid, and billow as they decay instead of fading in
place. Max displacement at flow = 1 is 0.03 UV (~30px on a 1000px canvas).
At 0 the pass is skipped entirely — the buffer is exactly the old one
(the optics no-op precedent).

The field is static per frame, but the buffer is re-advected every frame,
so motion ribbons corkscrew as they die. The warp is a forward warp
(`uv + vec(uv)`), not divergence-free: at high flow it dissipates a few
percent of light per frame on top of the fade — part of the billow look,
and it never creates light. The hash is integer-based so the
JS mirror reproduces the GPU field (float sin-hashes would diverge between
GPU float32 and JS float64); parity is cross-checked within a few LSB on
smooth content.

### B3. Echoes

`--echoes 0..4` (tap count). A ring buffer of K full-res 16F targets holds
past frames; the incoming frame is mixed with tap *i* = the frame from
*i+1* steps ago (delays 1..K), additive ghosts with decaying weights
`[0.5, 0.35, 0.25, 0.18]`. The live frame stays at weight 1.0. On screen:
motion leaves discrete afterimages — strobe-like, each sharper than a fade
trail. At 0 there is no ring and no mix pass — exactly the old composite.

**Resolution gate.** Each ring target is ~8 bytes/px, so taps are capped by
render width: **≥2048px wide → max 3 taps** (enforced in
`accumRecipeParams` via `echoWidth`, so GPU and mirror agree). The 8K
ceiling: at 7680×4320 one target is ~253 MB; 3 gated taps ≈ 760 MB plus the
ping-pong and scratch — it runs, but it is the heaviest thing the still
pipeline allocates. If Chromium refuses the allocation the render fails
loudly rather than rendering a different recipe.

## The documented light-feel

The acceptance bar for a trail still:

- Trails **decay like phosphor** — light falls toward black, not toward
  transparency. (Era change, recorded deliberately: the 2D-canvas era faded
  alpha via `destination-in`; the GPU recipe fades light. On the dark page
  background they read the same; on export the light-decay is the sane one.)
- New ink **lands over** old light — the freshest frame is always the
  brightest thing in the buffer.
- With GLOW up, bright cores **bloom**: light bleeds softly outward and the
  core lifts past 1.0; the bleed runs **warm** (halation), never neutral gray.
- With GLOW at 0, a bright pixel **does not bleed** — the buffer is exactly
  fade + over.

WEBM still does not sample this buffer (tab capture only); `studio --accum`
is the trail still. No kernel change: the generative kernel is untouched —
the recipe runs on rendered frames, never inside `evaluate()`.

## Verifying

- `node src/gl/accum.selfcheck.mjs` — recipe params, contract sanitization,
  JS-mirror sanity, and (with the Playwright browser) GPU-vs-mirror
  cross-checks through `parity/accumProbe.html` plus an end-to-end
  `renderAccumViaGL` trail still.
- `node src/gl/accumStill.mjs <project> --out t.png --steps 12 --optics 0.6`
  renders a real trail still through the shared recipe.
- `node src/gl/accumStill.mjs <project> --out t.png --steps 24 --flow 0.6 --echoes 2 --audio env.json`
  renders a Phase B still: flow-advected trails, 2 echo taps, audio-modulated
  fade/glow (see "Audio envelope sidecar" above for the env.json format).

## #309 — half-res feedback + velocity smear (the trail system)

Two changes, one idea: the trails stop being a fullscreen post-process and
live on the objects, at half the pixels.

**Half-res feedback pair.** The ACCUM ping-pong now runs at the composition
size, not the backing-store size. On the live instrument the bridge renders
at `dprScale` (up to 2 on retina), so the pair is half-resolution per axis —
a quarter of the pixels for every fullscreen pass in the recipe. The
incoming frame is resampled down to the pair's size first (manual bilinear
in `RESAMPLE_FS`, exact for any dprScale including fractional), and the
pair is upscaled for presentation (`UPSCALE_FS`, manual bilinear — soft,
not blocky). Stills/exports request their size at dpr 1, so the pair is
exactly the requested size there — no export quality change.

Echoes are untouched: same taps, same weights, same mix — they just run on
the pair-sized frame like everything else in the recipe.

**Velocity smear.** Each instance's per-frame displacement (scene units) is
tracked across frames — keyed on the contract's stable `layer|key` — and
packed into the instance buffer's two spare floats. `QUAD_VS` stretches each
quad along its own motion direction (6% per scene-unit of velocity, capped
at 2x length). Zero fullscreen passes; at rest the shader is exactly the
old path, so plain (non-ACCUM) rendering is pixel-identical. First
sightings get zero velocity and teleports/layout jumps clamp, so there are
no one-frame pops. The live loop and `renderAccumSequence` share the same
bookkeeping (`src/gl/velocitySmear.mjs`), so live and export smear alike.

The smear amount is a fixed recipe constant (`SMEAR_K`/`SMEAR_MAX` in
`renderer.mjs`) — deliberately no panel, no slider. The half-res softness
and the smear amount are the two things Matt's eyes need to judge, which is
why the work PR is marked NEEDS HIS EYES.
