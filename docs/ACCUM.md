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

1. **Fade/decay** — `accum.rgb *= keep` (keep = FADE, 0..0.99).
2. **Blur-over-time** (#169) — the incoming frame is blurred with a small
   separable gaussian (σ = 5px × optics) *before* compositing, so old marks
   go soft instead of merely transparent.
3. **Composite** — `accum = frame OVER accum` (premultiplied source-over).
4. **Bloom** (#169) — downsample the buffer to 1/4 (4×4 box), separable
   gaussian blur, add back: `accum.rgb += 0.55 × optics × blurred`.
5. **Halation** (#169) — the same downsampled buffer blurred *wider*, added
   back with a red/warm bias: `accum.rgb += 0.45 × optics × (1.0, 0.6, 0.35) × blurredWide`.

One amount drives steps 2/4/5: **optics** 0..1 — the GLOW slider next to
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
