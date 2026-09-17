# ACCUM — Vision & Phased Plan

Planning pass only. No code changed. Audited against `main` at `052cb82`
(QA sweep #218 merged). Sources: `docs/ACCUM.md`, `app/src/gl/accum.mjs`
(the shared recipe), `app/src/hooks/useAccumulationBuffer.js` (legacy live
path), `app/src/gl/accumStill.mjs` + `parity/glDriver.mjs` (studio path),
`app/src/gl/sceneContract.js` (contract plumbing), `app/src/hooks/governorCuts.js`.

---

## 1. Where ACCUM is today (honest)

**The GPU recipe** (`app/src/gl/accum.mjs`, the single source of truth) runs
per frame on RGBA16F ping-pong textures:

1. Fade — `accum.rgb *= keep` (light decays toward black, like phosphor)
2. Blur-over-time — the incoming frame is softly blurred *before* compositing
3. Composite — new frame lands OVER the faded buffer (premultiplied source-over)
4. Bloom — downsampled buffer blurred and added back (bright cores bleed)
5. Halation — wider blur added back with a warm/red bias

One GLOW slider (`optics` 0..1) drives steps 2/4/5; FADE drives step 1.
Everything is off by default — the recipe only runs when the scene contract
carries `accum.enabled`. There is a JS float64 mirror of the recipe for
cross-checks, and a selfcheck suite.

**The two-tier reality.** The live interactive canvas does NOT run this
recipe. It still uses the legacy 2D-canvas path (`useAccumulationBuffer.js`:
serialize the SVG → draw it onto a canvas with `destination-in` alpha fade,
~20fps). The GPU recipe serves studio/still exports (`accumStill.mjs`
through headless Chromium: `--steps`, `--motion`, `--ramp`). Per the
share-or-refuse rule, the two paths share the recipe or the export refuses —
but the live loop only migrates when the live renderer goes WebGL (open
issue #224). **Nothing in this plan reaches the live canvas until #224
lands.** That is the single biggest sequencing truth in this document.

**What the user touches today:** an ACCUM toggle + FADE slider + GLOW slider
in the layout toggle row. The governor sheds ACCUM at perf tier 1 (FPS < 16)
— it's already classified as expendable under load.

**Known gaps:** #226 (GPU vs JS halation kernels diverge), #219 (REC can't
film the accum canvas — disabled while ACCUM is on).

---

## 2. The possibility space — 7 directions

Each direction: what it looks like on screen (plain language), then the
honest grounding in this codebase.

### 2.1 Feedback tunnels (zoom + rotate in the feedback loop)

**On screen:** motion doesn't just trail — it spirals. A moth crossing the
frame leaves a corkscrew light-tunnel winding into the distance. Turn the
amount up and stills become infinite corridors of receding light. This is
the single most iconic video-feedback look (the "point a camera at its own
monitor" effect), and it's one parameter away.

**Grounding:** the fade pass (`FADE_FS`) currently samples
`texture(u_src, v_cuv)`. Sample instead at an affine-transformed UV —
`uv = center + rot(angle) * (v_cuv - center) * zoom` — with `zoom ≈ 1.002`,
`angle ≈ 0.1°` per frame. One new program variant (or two uniforms on the
existing fade program), zero new textures, zero new targets. The classic
formalization (decay + rotation + magnification) is literally the textbook
video-feedback equation. Follows the existing param pattern:
`accumRecipeParams` → sanitize → contract additive field → JS mirror.

### 2.2 Chromatic feedback drift (RGB channels separate over time)

**On screen:** trails split into rainbow fringes that pull apart the longer
they live — like a prism smeared through time. White-hot motion leaves
red/cyan ghosts peeling off in opposite directions. Pairs ridiculously well
with the existing RGB-split FX.

**Grounding:** in the fade pass, sample R, G, B at three slightly different
UV offsets (radial from center, or directional). Three extra texture taps,
one `prism` amount uniform. Almost free — no new targets, no new programs.

### 2.3 Performable feedback gestures (freeze / clear / fade-swell)

**On screen:** the performer hits FREEZE mid-set and the trails hang in the
air like a paused explosion — new motion stops landing but the buffer holds.
CLEAR wipes the slate. A fade-swell breathes the trail length in and out.
ACCUM stops being a toggle and becomes an instrument.

**Grounding:** `begin()` already clears (it's the CLEAR gesture).
Freeze = skip the over pass for N frames while still fading (or hold `keep`
at 1.0 for a true hold) — a flag on `step()`, no new shaders. Fade-swell =
animate `keep` 0.88 → 0.99 → 0.88 over a gesture envelope — pure param
automation. Natural home: the Ghost Station panel's PERFORM section (see the Ghost Station consolidation plan). Easiest wow on this list.

### 2.4 Audio-reactive trail dynamics

**On screen:** the whole trail system breathes with the music. Kick drum
lands → trails punch longer and glow swells. Quiet passage → trails die fast
and the frame goes clean. The buffer becomes a visual lung for the set.

**Grounding:** the app already has `useAudioInput` (beat detection, RMS,
frequency bands) feeding the Ghost Station panel. What's missing is plumbing those
values into accum params per frame: `keep` and `optics` become
`base + audioModulation`. In studio this ships *now* (automation alongside
the existing `--ramp` mechanism — a `--audio` envelope baked per step). Live
needs #224. For a self-described live visual performance instrument, this
is the highest-meaning direction even if it's not the cheapest.

### 2.5 Flow-advected feedback (trails that curl like smoke)

**On screen:** trails stop fading in place and start *drifting* — they curl,
braid, and billow as they decay, like smoke in wind. A straight moth path
leaves a ribbon that slowly corkscrews as it dies.

**Grounding:** new FEED pass (or extend the fade pass): sample the feedback
texture at `uv + flow(uv) * strength`, where `flow()` is a small in-shader
noise field (~15 lines of hash-based value noise — procedural, no textures).
One `flowStrength` uniform. Honest note: the kernel's flow field (the one
placements bake against) is NOT a GL texture, so reusing "the same field"
would be architecture work — in-shader procedural noise is the real route,
and visually it's the same smoke. No new targets.

### 2.6 Echoes (multi-tap temporal ghosts)

**On screen:** instead of a smooth smear, motion leaves discrete afterimages
— a moth leaves 3 solid ghosts at fixed intervals, strobe-like, each
sharper than a fade trail. A completely different time-aesthetic from the
current recipe: staccato vs. legato.

**Grounding:** a ring buffer of K full-res feedback targets (accum-owned, or
K extra `bridge.layer('__accum_echo_N__')` pairs — the bridge lazily
allocates ping-pong pairs per id, so this fits the existing API). The over
pass mixes `frame(t)`, `frame(t-a)`, `frame(t-b)` with per-tap weights. Cost
is memory, not ALU: at live res (1000×700 RGBA16F ≈ 4.5 MB/target) trivial;
at 8K export (≈512 MB/target) a 4-tap ring is ~2 GB — **must gate tap count
by resolution** (e.g. K≤3 above 2K, or echoes studio-cap at 4K). The later
variant: slit-scan mode — per-column tap selection from a displacement map
(the 2001 stargate smear). Same infrastructure, one extra map.

### 2.7 Trail aging — phosphor heat grade

**On screen:** every trail is a temperature gradient. Fresh motion burns
white-hot, mid-age trails cool through amber, old trails sink into deep red
before dying to black. You read the *history* of the motion in color —
cooling embers instead of gray ghosts.

**Grounding (cheap, honest):** because fade multiplies `rgb *= keep` every
frame, trail age is already encoded as brightness. A tiny grade pass after
the over step maps luminance → hue ramp (bright = white, mid = amber, dim =
deep red). One fullscreen pass, one 1D ramp uniform — no new buffers. It is
technically a brightness-grade rather than true age, but for the common case
it reads identically. The *true* version (a dedicated age texture updated
in the fade pass, so overlapping trails keep independent ages) is a later
upgrade: one more full-res target + grade pass.

---

## 3. Phased plan (ordered by wow-per-effort)

### Phase A — now (single-pass changes, no new targets)

**A1. Feedback tunnels + chromatic drift.** Both live in the fade pass as
new uniforms (`tunnelZoom`, `tunnelSpin`, `prism`). Ship as one FEEDBACK
section: two sliders. Follows the exact existing pattern —
`accumRecipeParams()` gains the fields, `sanitizeAccum*` + contract additive
fields, JS mirror extended, selfcheck cases. New passes must no-op at 0
(the optics precedent).

**A2. Performable gestures.** FREEZE / CLEAR / FADE-SWELL as Ghost Station-panel
PERFORM actions. `begin()` is already CLEAR; freeze is a `step()` flag;
fade-swell is param automation. No shader work at all.

*Why first:* two sliders + three buttons, and the stills get dramatically
more interesting. Lowest cost, highest immediate wow.

### Phase B — next (new passes / targets, moderate)

**B1. Audio-reactive dynamics.** Studio first (`--audio` envelope alongside
`--ramp`), live when #224 lands. Modulates `keep`/`optics` (and later the
Phase-A amounts) from beat/RMS.

**B2. Flow-advected feedback.** New FEED pass with in-shader noise field,
one strength uniform. Self-contained in `accum.mjs`.

**B3. Echoes.** Ring buffer + multi-tap mix, with the resolution gate
(≥2K: cap taps; document the 8K ceiling). Slit-scan variant rides the same
infrastructure later.

*Why second:* each needs new GL objects and careful memory/perf behavior,
plus governor awareness (see open questions).

### Phase C — later (architecture)

- **Selective per-layer accumulation** — only chosen layers feed the accum
  input (moths trail, background stays clean — the print-work killer
  feature). Requires the renderer to produce a layer-masked frame for
  `accum.step()`; the frame input is currently the full composite. Real
  renderer work, not a feedback-pass tweak.
- **True age buffer** for trail aging (independent ages for overlapping
  trails).
- **Slit-scan mode** (needs B3's ring + a displacement map).
- **Live migration** (#224) — unlocks everything above on the live canvas.
  Until then, Phase A/B ship studio-first by design.

**Standing rules for all phases** (from the codebase's own conventions):
every new mode lives in the shared recipe (`accum.mjs` + JS mirror +
selfchecks) per share-or-refuse — no live-only or studio-only hacks. New
amounts default to 0/off. New passes no-op at 0 so the governor's shed
ladder stays meaningful.

---

## 4. Open questions for Matt

1. **Sequencing vs. the live canvas.** Phase A/B ship studio-first; the live
   canvas sees none of it until #224 (live WebGL loop). Acceptable — or
   should #224 jump the queue so the instrument plays what the stills see?
2. **Naming.** Working titles: TUNNEL (zoom/spin), PRISM (chromatic drift),
   FREEZE / CLEAR / SWELL, EMBERS (trail aging). In AE terms this is Echo
   meets CC Time Blend meets a feedback rig — what do you want the sliders
   called?
3. **Defaults.** Everything new defaults to 0/off like GLOW — or should
   tunnels ship with a whisper of default (e.g. zoom 1.001) so first-run
   stills already feel alive?
4. **Governor shed order.** ACCUM already sheds at tier 1. As passes pile
   up: shed order — optics first, then tunnels/prism, fade last? Or keep
   the whole buffer as one shed unit?
5. **Audio-reactive now or later?** Studio-only audio envelopes now, or hold
   the whole direction until #224 makes it playable live?
6. **Echoes at high res.** Cap taps above 2K, or cap echo stills at 4K?
   (8K × multi-tap ring does not fit in GPU memory.)
