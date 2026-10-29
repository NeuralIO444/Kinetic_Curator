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
2. **Fade/decay** — `accum.rgb` lerps toward the palette background
   (`mix(bg, rgb, keep)`; keep = 0.5^(1/FADE), where FADE is the slider's
   trail half-life in frames, 1..40 — #274 taper), sampled through the
   Phase A feedback transform (tunnel zoom/spin, prism drift). #287
   fade-to-paper: on light grounds (LITHOGRAPH, SEPIA PLATE) trails fall
   toward the paper instead of black; black grounds keep the old
   `rgb *= keep` exactly. #1800: the keep is spectral — a vec3 whose
   channels run on half-lives of FADE ×1.35 (R), ×1 (G), ×0.72 (B), so a
   trail's colour becomes its age (whites cool through amber into ember
   red as they die; on paper the mark warms as it falls). Green carries
   the slider's rate exactly; unit spread (all ratios 1) is the old
   scalar recipe bit-for-bit. The audio envelope and the spectrum warp
   still modulate the scalar keep and re-derive the vec3, so the spread
   ratios survive every gesture.
3. **Blur-over-time** (#169) — the incoming frame is blurred with a small
   separable gaussian (σ = 5px × optics) *before* compositing, so old marks
   go soft instead of merely transparent.
4. **Composite** — `accum = frame OVER accum` (premultiplied source-over).
5. **Bloom** (#169) — downsample the buffer to 1/4 (4×4 box), separable
   gaussian blur, add back: `accum.rgb += 0.55 × optics × blurred`.
6. **Halation** (#169) — the same downsampled buffer blurred *wider*, added
   back with a red/warm bias: `accum.rgb += 0.45 × optics × (1.0, 0.6, 0.35) × blurredWide`.
   #1803: the bias is no longer a constant — the tint is derived from the
   active palette (its luminance-weighted centroid, desaturated, energy
   pinned to the constant's), so a teal look halates cool and an amber
   look halates warm. The constant above survives as the fallback: no
   palette in the call, or a palette with no usable chroma spread
   (single-colour / monochrome), keeps the classic warm halation. The
   tint is derived, never typed — it appears in no panel and no project
   field.
   The reference look is the full 3σ gaussian kernel the JS mirror evaluates
   (#226): halation σ runs 11→33px on the quarter-res buffer, whose 3σ radius
   (up to 99 taps) exceeds the blur shader's 64-tap loop, so the GPU
   subdivides wide sigmas into multiple passes at σ/√n
   (`blurPassSigmas`) — repeated gaussians convolve back to the full kernel.
   The old truncated-at-64 kernel (narrower, weaker glow at high optics) was
   the artifact, not the look.
7. **Highlight soft-ceiling** (#1801) — each glow tier's add-back is shaped
   as it lands: identity at/below the knee (1.0), a smooth invertible
   shoulder above it, asymptoting at the ceiling (2.5) —
   `highlightSoftCeiling` in `accum.mjs`, baked into the glow shader. It
   replaces the hard clamp at 1.0 that pinned hot cores to flat white (the
   ratchet B1 warns about): the buffer stays HDR through the loop and hot
   cores keep their hue separation; ACES still runs only at the resolve
   (#532). Sub-knee content and the optics = 0 path are bit-identical to
   the pre-#1801 loop.

One amount drives steps 3/5/6: **optics** 0..1 — the GLOW slider next to
FADE in the toggle row (`layoutParams.accumulationOptics`, default 0).
optics = 0 reduces the recipe to fade + over; the optics passes are no-ops,
not a second engine. Everything is off by default: the recipe only runs when
the scene contract carries `accum.enabled`; a null `contract.accum` means a
plain `renderScene` with zero new passes.

## Age buffer (#1805)

Every pixel of trail light carries its own age — seconds of show time since
the newest light at that pixel — as data, independent of brightness. This
is ACCUM_VISION §2.7's "true version": not a brightness clock, not an
age-texture packed into a spare channel, but a dedicated field with its own
update rule.

- **Storage.** An R16F ping-pong at pair resolution, allocated ONLY when a
  step's recipe requests it (`ageBuffer: true` on the recipe params,
  `accum.ageBuffer` on the scene contract — the key is omitted unless
  requested, so an unrequested contract and its hash are unchanged). One
  target is 1/8 of the colour pair's bytes (2 B/px against the pair's
  16 B/px); an unrequested recipe allocates nothing and renders
  byte-identically.
- **Update (a twin `age` pass, twice per step).** After the fade: each
  pixel's age advances by the step's `dt` (the loop's clamped show-time
  step; stills pass their frame interval) while its faded light still
  differs from the ground by more than one 8-bit luminance step, sampled
  through the fade's own feedback transform so ages ride TUNNEL like the
  light does; where the light has died, the age is void (−1). After the
  over: wherever the incoming frame covered, the age resets to 0 — newest
  light wins, so re-lit and overlapped trails keep independent ages
  instead of inheriting the oldest. The JS mirror (`createAgeState` +
  `mirrorAccumStep`'s age block) is the float64 twin, proven equal within
  one frame over a 48-step GPU probe.
- **Cost.** The pass is registered tier 1 (`accum/age`) with the ACCUM
  family — a governor shed that drops ACCUM drops the age work with it —
  and carries a committed measurement row (wall-method relative standing
  at/below fade; see `measuredCosts.mjs`).
- **Consumers (v1).** The still CLI's `--age-out` writes the final age
  field as a false-colour PNG (fresh gold → amber → deep ember; void is
  ink; the ramp's deep end is the sequence duration). `?debug=age` mounts
  a backstage readout that requests the buffer live and paints the same
  ramp with the oldest living age and the lit fraction of the field.
  Nothing on the performer's surface changes; no look, voice or panel
  reads ages yet — that is future slices' work, now possible because the
  ages exist.
- **v1 limits, stated plainly.** The FEED pass does not advect the age
  field (flow moves colour; ages stay in buffer space this slice). Bloom
  light deposited by the glow starts aging from the step after it appears,
  not the step it lands. R16F precision bounds the age quantum (~1 ms at
  60 s ages) — far below one frame at any playable age.

## Trail grid (#1808 slice 1 — ACCUM as memory, rung 2's read surface)

Creatures steer on fields they sample on CPU, never on raw textures.
The trail grid is the buffer's coarse spatial read: a 32-column box
downsample (`gl/trailGrid.mjs`, pure) carrying, per cell, the mean
light energy, the mean colour — whose channel ratios are the spectral
fade's age proxy (#1800) — and, when the age buffer rides along, the
dominant age: the light-weighted mean age of the cell's living pixels
(AGE_VOID where no pixel in the cell carries one). Rows follow the
buffer's aspect, so cells stay square (32×22 at pair aspect, the #1183
contact-grid shape). The grid is stamped with the buffer's own step
count (steps since CLEAR, counted by `createAccum` — deterministic
state, never a wall clock), and `sampleTrailGrid` reads it nearest-cell
in buffer space: every sampled value is a real measured cell.

- **Sources.** The derivation is source-agnostic: the JS mirror's
  float64 state (the selfcheck's scripted scenes prove the grid against
  an independent box-filter reference of that buffer — energy exact,
  ages within one frame of the analytic truth) or the live object's
  `readTrail()` snapshot, `readAge()`'s twin (colour readback + the age
  field when requested). With no age source the grid's ages are void
  and consumers use the channel ratios — the issue's v1 substitute.
- **The one live consumer (slice 1).** `?debug=trailgrid` mounts a
  backstage readout beside the AGE view: the live loop names it as an
  age-buffer consumer (`ageBuffer: DEBUG_AGE || DEBUG_TRAILGRID`, no
  consumer = no allocation, as #1805), registers the ACCUM object on
  `gl/trailGridLive.mjs`, and the readout polls a snapshot a few times
  a second and paints the grid as a coarse thumbnail of the buffer with
  its stamp, peak cell and lit fraction. Derivation at pair size
  (1600×1100) measures ~37 ms in the sandbox — a backstage-poll cost in
  this slice, stated plainly; a steering consumer's cadence and budget
  are slice 2's device-harness question, not assumed here.
- **Not built (the issue's own slicing).** No steering consumes the
  grid yet: slice 2 (one ember-following drive on the moth) carries the
  issue's feel gate — it does not leave the runway without Matt playing
  it — and slice 3 (the sign flip) follows it. Nothing about creature
  motion changes in this slice; replay and creature gates are untouched
  by construction (no resolver input, no creature code).

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
  slider. In the still path this is the `--swell` flag. Since #1801 the
  ratchet is also bounded in the loop itself: the highlight soft-ceiling
  (recipe step 7) keeps hot cores under 2.5 with their hue separation
  intact, so a loud passage saturates gracefully instead of converging
  to flat white — SWELL stays the musical fader, no longer the only
  defence.

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

## Selective accumulation (#1806) — slice 1: the renderer seam

Phase C's "print-work killer feature" is sliced by its own spec:
(1) the renderer seam, (2) recipe wiring, (3) the BUILD flag + project
field. Slice 1 ships only the seam — no contract field, no flag, and
nothing in production calls it yet.

- **Who can feed:** only the light-source strata — content tracks and
  pattern tracks. MATH and FX strata never feed: they are transforms
  and finishes, and the buffer receives the selected strata's *pre-FX*
  light (the #520/#820 grain law, generalized). The one definition
  lives in renderer.mjs (`isAccumFeedLayer` / `accumFeedLayers`);
  slices 2 and 3 build on it, so the rule cannot drift between the
  recipe and the panel.
- **The seam:** `renderFrameInto` gains an `accumInput` mode — given a
  set of stratum ids it draws only those strata, through the same
  per-layer composite path (same placements, blends, mattes: the
  resolver's instances drawn again, never re-resolved), over
  transparent, with no FX wrap, no fold, and no finish chain.
  `createRenderer().renderAccumInput(payload, layerIds)` is the
  one-shot entry; the live renderer shares `renderFrameInto`, so
  slice 2 surfaces it there with one wrapper. With the mode off —
  every production caller today — the composite is byte-identical.
- **Proof** (`accumInput.selfcheck.mjs`): in data space (raw resolve —
  the buffer consumes the 16F texture, never a tonemapped picture) the
  subset renders fold, premultiplied source-over, onto the full
  composite pixel-for-pixel: subset = the full render masked to the
  selected strata's instances. Naming the FX stratum in the selection
  changes nothing, byte for byte; an empty selection is transparent.
  Stills: `docs/review/1806/`.

## The documented light-feel

The acceptance bar for a trail still:

- Trails **decay like phosphor** — light falls toward black, not toward
  transparency. (Era change, recorded deliberately: the 2D-canvas era faded
  alpha via `destination-in`; the GPU recipe fades light. On the dark page
  background they read the same; on export the light-decay is the sane one.)
- New ink **lands over** old light — the freshest frame is always the
  brightest thing in the buffer.
- With GLOW up, bright cores **bloom**: light bleeds softly outward and the
  core lifts past 1.0; the bleed takes the **look's colours** (halation,
  #1803 — warm on the fallback palette), never neutral gray.
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
