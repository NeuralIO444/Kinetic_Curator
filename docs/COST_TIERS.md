# Measured cost tiers

Every visual effect in the WebGL renderer declares, right where it's
defined, how expensive it is: a **tier** (0–3), a rough memory estimate,
and a rough time estimate. A headless-Chromium harness then measures the
real GPU cost of every effect, and the build **fails** if a declaration
disagrees with reality. The governor — the thing that sheds work when the
frame rate drops — reads those declarations instead of carrying its own
hard-coded list of what's expensive.

## The tiers, in plain language

- **Tier 0 — structural, never shed.** The compositing passes that assemble
  the picture, plus the audio modulation (per-frame scalar math, effectively
  free). Shedding these would change what the piece *is*, so the governor
  never touches them. They are exempt from measurement.
- **Tier 1 — shed first.** The ACCUM chain (trails, echoes, blur, glow) and
  the mirror/gloss pass. When the frame rate drops, this whole chain goes
  off first, as one unit. It mixes cheap plumbing with the heaviest passes
  in the set — that's fine, because "shed first" is a priority claim, not a
  cost claim.
- **Tier 2 — quality scalers.** Effects whose cost can swing wildly with
  their settings (turbulence octaves, big blurs). They are allowed to be
  expensive — this is where heavy cost is expected to live — so they shed
  after tier 1, not before.
- **Tier 3 — cosmetic, must be cheap.** Small finishing effects. A tier-3
  declaration is a promise: "this is cheap." The build checks that promise
  against measurement.

Within a tier, more expensive effects shed before cheaper ones. Tier 0
always sorts last — it is never shed.

## The estimates

`memoryBytes` is the working memory a draw needs (render targets, ring
buffers); `timeMs` is the author's rough per-draw estimate. They are
planning numbers, not guarantees — the *measured* numbers are the ground
truth, and the build cross-checks the two so stale estimates get caught.

One declaration carries an extra rule: `accum/echo` has a **memory gate**
(`minWidth: 2048, maxTaps: 3`) — at 2K widths and above, its 4-tap echo
ring is capped to 3 taps because a full-res 16-bit ring target is heavy.
The gate lives in the declaration, and the build verifies the recipe code
enforces exactly the same cap.

## How the measurement works

`npm run measure-costs` launches headless Chromium (the same browser
automation the GPU selfchecks already use) and, for each of the 18 shader
effects:

1. renders it at 512×512 into 16-bit float targets,
2. at its **worst-case knob position** (the contract case tagged `costly`
   in the sweep tables — the governor sheds against the worst case, so the
   measurement does too),
3. with 8 warmup draws, then 3 batches × 30 draws, each draw forced through
   a 1×1 pixel readback (headless browsers otherwise skip work whose output
   is never read),
4. taking the **median** batch time as ms/draw.

The result is committed as `app/src/gl/effects/measuredCosts.mjs`
(re-bless it by re-running the command whenever a shader changes). The
build gate needs no GPU — it reads the committed file.

## The mapping rule (why the build fails)

Absolute milliseconds vary between GPUs, so the gate works on **ratios**:
each effect's measured ms divided by the median over all measured effects.
A different GPU re-measuring the file shifts every number together; the
ratios stay meaningful.

- Tier 3 (cosmetic) must land at **ratio ≤ 4×** the median — a warning is
  printed above 2.5×. A "cheap" effect that measures expensive fails the
  build with a message naming the effect, its declared tier, and its ratio.
- Tiers 0–2 carry no cost band: tier 1 is shed-first by priority (its passes
  range from the cheapest to the most expensive in the set), tier 2 is
  where heavy cost is allowed to live, tier 0 is structural and exempt.
- Every measured effect must have a declaration, and every declared
  non-tier-0 effect must have a measurement — nothing slips through
  undeclared or unmeasured.
- Registration is fail-closed: a duplicate id, a tier outside 0–3, or a
  negative estimate throws at import time.

The gate also runs a **negative test** on every build: it feeds the band
rule a synthetic mis-declared tier (a tier-3 effect at 100× the median)
and asserts the rule rejects it. If the rule ever stops catching lies, the
build breaks.

## The shed ladder (unchanged)

The governor's order of cuts is exactly what it was — only the *knowledge*
of what's expensive moved into the registry:

1. **Dynamic resolution** — render scale 1 → 0.75 → 0.5 → 0.33
2. **Quality tier** — high → balanced → performance
3. **Mirror/gloss/ACCUM** — the tier-1 chain off, as one unit (coverage now
   read from the registry, not hard-coded)
4. **Cost-aware asset thinning** — highest-cost assets drop first
5. **Render-only count clamp** — geometric decay 0.7× down to the 120 floor
   (e.g. 500 → 350 → 245 → 171 → 119)
6. **Freeze motion** (slowRender) — a still instrument beats a dead one
7. **Watchdog hard stop** — last resort

FX layers are never culled in normal operation (they compositing-cheap:
one extra FBO pair + one filter pass per wrap).

## Why this exists (guide / perform)

This is the **guide** and **perform** half of the instrument's loop. The
governor is the curator: it makes taste calls — what goes when the machine
can't keep up — and taste calls need honest, measured costs, not folklore.
Declaring cost next to each effect's definition keeps the knowledge where
the effect is authored; measuring it in CI keeps the declarations honest;
reading the registry in the governor means the shed logic can never drift
out of sync with what the effects actually cost.
