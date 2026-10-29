# #1813 — wet-look display pass: review evidence

Issue: "WET: wet-look display pass — saturation, luminance skew, sheen".
Everything here is sandbox-measured (node, this VM); CI is authoritative
for the suites. The stills are rendered from the pass's JS mirror
(`shadeWetPixel`) through the resolve's ACES curve — the selfcheck pins
the GLSL to the mirror's shape formula-for-formula, so what the stills
show is what the shader computes; the live A/B on a real scene is the
review-lane read.

## What shipped

One fullscreen pass (`app/src/gl/wetLook.mjs`, drawn by the renderer as
`renderer/wetlook`) over the upscaled ACCUM presentation, in linear,
before the final resolve: where the shared wet field is wet, the
presented frame is remapped the way vision expects wetness to look
(Sawayama, Adelson & Nishida, J. Vision 2017):

1. **Saturation rises** — chroma scales about the pixel's own luma by
   `1 + 0.35·f`.
2. **Luminance skews** through an accelerating curve — on dark grounds
   the multiplier leans on `min(L, 1)`, so darks deepen most and
   brights (L ≥ 1) hold exactly; on light (paper) grounds a stronger
   bend reaches the bright ground itself, under a hard per-channel cap
   at the input value: **paper brightens never**, and the sheen is
   dark-ground only.
3. **Sheen** — a lift of `0.30·f·L^6` on the brightest wet pixels,
   gated by the pixel's own luminance (the frame's own highlights),
   never an added light source.

`f` is the regime ramp: the packed mask (× the frame's wetAmount, as
ACCUM's own wet shaders consume it) mapped through the wet-frame
service's named thresholds — 0 at/below **damp** (0.05), full at
**soaked** (0.8), smoothstep between. The pass reads regimes, never a
raw float interpreted ad hoc. The ground is the frame's own background,
parsed by the fade target's rule (`u_bg`'s path), steering the curve
per ground class.

**Placement and identity.** The renderer runs the pass inside
`presentUpscaled`, between the upscale and the resolve, only while the
loop arms it with a served field (the same wetStep/wetMask/wetAmount
the recipe consumed). Field not served → no pass runs. Pixel below
damp → the shader writes the sampled texel straight through, so dry
pixels are bit-exact and existing goldens hold. The pass is a pure
function of (frame, field sample, ground) — no clock, no state — so
#1815's warm-up stills can present the same field state through the
same math and match live exactly.

**No double-darkening.** The frame the pass reads already carries
#1812's edge-darkened pigment (the darkening lives in the deposited
pack's reflectance). The pass applies no rim or edge term of its own —
the selfcheck pins the shader free of any edge term.

**No new controls.** Strengths are recipe constants in `wetLook.mjs`
(the velocity-smear precedent), bound as uniforms; thresholds come
from `WET_REGIMES`. Nothing enters `DEFAULT_LAYOUT_PARAMS`.

## The acceptance wash (probe.json, still-*.png)

Three synthetic scene classes, two landed stamps (soaked cores, damp
halos, 16,797 wet pixels of 40,960), pass off vs on, measured on the
linear frame:

| scene | wet luma | wet saturation | dry Δ | max brighten |
|---|---|---|---|---|
| dark ground, saturated marks | 0.144 → 0.117 (−19%) | 1.085 → 1.335 (+23%) | 0 | 0.044 (sheen, highlights only) |
| light paper ground | 0.693 → 0.514 (−26%) | 0.258 → 0.335 (+30%) | 0 | **0 — never** |
| monochrome | 0.433 → 0.386 (−11%) | 0 → 0 (grey stays grey) | 0 | 0 |

Paper darkens *more* than the dark ground, per the issue's inversion;
the dark ground's only brightening is the sheen term on its brightest
wet pixels, which is the cue working as specced. The stills (off left,
on right) show it directly: on paper, the stamps pool dark around the
ink and the seal; on the dark ground, the marks inside the stamps
deepen and saturate while the bright dot holds.

## Cost (probe: registry declaration)

Registered as `renderer/wetlook`, tier 0 (presentation plumbing, never
shed — the upscale's class): one frame tap + one mask tap per output
pixel, 0.3 ms at 1080p declared as the author's estimate in the
upscale/resolve class, to be replaced by the device-harness sweep
measurement (the program rides `RENDERER_PROGRAMS`, so the sweep picks
it up automatically). It runs only while the field is served; disarmed
it costs exactly nothing.

## Decisions recorded

- **The pass consumes the field where the field is served** — the
  ACCUM presentation. Arming the pass as a field-*birthing* consumer
  (wet look with ACCUM off) would step the sim for display alone; that
  is a consumer-set decision for the #1814 family, not this slice.
- **Paper's "brightens never" is a clamp, not a curve property.** The
  first sweep of the selfcheck caught the saturation term lifting a
  dark saturated pixel's dominant channel by ~0.03·f on paper; the cap
  (`min(c, cIn)` per channel, light grounds only) makes the law hold
  by construction, at a cost of a whisper of saturation on dark inks.
- **The ramp tops out at soaked, not at wet.** Damp is where the
  effect starts; the named band above it (wet → soaked) is where it
  earns its full strength, so deep pools read wetter than damp edges.
