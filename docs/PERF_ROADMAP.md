# Performance roadmap — remove, then earn back

*Plan only — no code. September 17, 2026. Grounded in main (`8b876d7`). Feature freeze is in effect: everything below is refinement of the existing renderer, no new features, no new panels. Approved by Matt 2026-09-17.*

The TE question for performance work is not "how do we make this faster" — it's **"what can we remove?"** A missing feature nobody can miss is a design choice; a slow feature everyone waits on is a bug. This roadmap deletes the instrument's most expensive effect outright, replaces it with cheaper systems that have their own aesthetic, and only then tunes what's left — against real numbers from the performance hardware, not the harness.

---

## 1. Where the cost actually is (measured, `gl/effects/measuredCosts.mjs`)

Harness-measured at 512×512, worst-case params — absolute ms are headless-harness numbers, **ratios** are what matter:

| effect | ms | note |
|---|---|---|
| accum/blur | 595.5 | the monster |
| builtin/blur | 590.5 | the monster's twin |
| everything else (16 effects) | 8.8 – 30.7 | grain 25, rgbSplit 26, displace 31, … |

**Blur is ~25–30× the cost of any other single effect.** The ACCUM feedback chain passes are individually cheap (add 19, feed 23, fade 16, echo 16, copy 9, over 10, down 3.5) but numerous — the chain as a whole is the second cost center.

The TE answer to "blur is 30× everything else" is not a faster blur. It's: **the instrument doesn't have blur.** The cost center gets deleted, not optimized — and the glow aesthetic it provided gets rebuilt from systems that are cheap by construction. That's P2.

### What's genuinely cheap (don't "optimize")
- FX compositing: 10–50× headroom, correctly never shed (#192 killed the FX-cull ladder — do not resurrect it).
- Tier 3 cosmetic ops (invert, posterize, scanlines…): ~10–25ms each, shed-last is correct.
- Audio modulation: effectively free scalar math (tier 0).
- Echo taps (ACCUM Phase B): discrete ghost frames, no feedback loop — the strobe/afterimage vibe already exists at near-zero cost.

### What's load-bearing (don't disturb)
- The staged placement cache and per-layer placement caches.
- Atlas resolution independence.
- Quarter-resolution bloom scratch buffers.
- Persistent targets; `preserveDrawingBuffer:false` plus explicit readback.
- GPU timer queries; the cost-tier registry and CI gate.

---

## 2. The roadmap (polish only, ordered)

### P1. #298 — M3 cost-model calibration
The measurement gate. Run `measure-costs` on Matt's Mac Studio, re-bless `measuredCosts.mjs`, run the MLX cost-model runbook for the weights. Process, not code. Every cost number the renderer and governor reason from was measured on a headless harness — whether blur-vs-ACCUM ranks the same on the actual performance hardware is unverified. **Nothing tunes until real numbers land.** This is Matt's machine time.

### P2. #308 — the glow system (blur is removed, not optimized)
Gaussian blur leaves the instrument as a deliberate design choice. Its glow/softness role is rebuilt from three systems that are cheap by construction and have their own aesthetic:
- **Mip-chain bloom** — the hardware already builds the mipmap chain; sampling a smaller mip *is* a blur. Near-free glow, slightly dreamier than gaussian, which suits the instrument.
- **Stipple diffusion** — glow scattered as fading dots. Pointillist instead of airbrushed. This one isn't just fast, it's ours: Haeckel's engraving language and Davis's print logic. The limitation becomes the aesthetic.
- **Chromatic offset** — slight RGB channel shift at edges. Reads as softness and glow, near-zero cost.

Scope: remove the gaussian blur passes (including the full-res frame blur in `accum.mjs`); the three systems above cover the aesthetic. Matt's eyes judge whether anything was lost — nothing returns unless he misses it (the earn-back rule, §4).

### P3. #309 — the trail system
Faster trails with their own vibe, replacing full-res frame-feedback trails:
- **Half-res ACCUM feedback** — run the feedback pair at logical size, upscale on present. Trails are temporally low-frequency; quarter the pixels for a near-identical look. Matt's eyes confirm the softness tradeoff.
- **Velocity smear** — stretch instances along their own motion direction. Motion blur with zero fullscreen passes; the trails live on the objects, not the frame.
- Echo taps already cover the strobe/afterimage vibe — no work needed there.

Sequence P3 after P1: the half-res tradeoff is tuned against the M3 numbers, not harness ratios.

### P4. Headroom levers — CPU/GC wins, no visual change, land anytime
From the renderer headroom exploration (kept in working files until it earns a doc of its own):
1. **Stop rebuilding/sorting the atlas key every frame.** Hundreds of combo strings are rebuilt and sorted every tick just to detect changes. Recompute only when source inputs change. CPU/garbage-collection win, zero visual change.
2. **Pool per-layer instance arrays.** New `Float32Array` storage is allocated per layer per frame. Grow-once/reuse pooling cuts GC jitter.
3. **Move per-frame GL error draining behind a diagnostic/debug path.** `getError()` can force CPU↔GPU synchronization on some drivers. Needs M3 measurement (P1) before claiming an Apple-silicon benefit.

These three are independent of the measurement gate and of each other — they can land whenever a builder has a clean branch.

### P5. Governor TE (#292, #294–297) — the honest limiter readout on top
The governor is the curator: one tape counter, performer-chosen budget ceiling, FPS headroom needle. The full plan is `docs/GOVERNOR_TE_ROADMAP.md`. It sits on top of this roadmap — once the renderer is cheaper by construction, the governor's job is defending a budget the performer chose, not apologizing for a blur tax.

---

## 3. Killed

- **#299 — blur-first intermediate cut.** Superseded by P2. It was a ladder rung for shedding blur radii / turbulence octaves — but blur no longer exists, so there is nothing to shed. Closed, not parked: do not resurrect it if blur ever earns its way back (it won't get a dedicated rung either).
- **Predictive frame caching / pre-warming.** Rejected outright by Matt 2026-09-17 — fully dead, no code, no measurement, no memo. The staged placement cache already provides the useful part without speculative prediction. Do not reopen unless he explicitly reverses it.
- **Optimizing gaussian blur.** The whole point of P2 is that the fastest blur is no blur. Any proposal to make blur cheaper instead of removing it fails the TE question.

---

## 4. Sequencing

P1 (M3 calibration, Matt's machine) → P2 (glow system) + P3 (trail system, tuned against P1's numbers) → P5 (governor readout on top). P4 (the three CPU/GC levers) lands anytime on clean branches — it's independent of everything.

The last step of every item is the same: **Matt's eyes judge.** Measure → build against real numbers → his eyes. That's the whole gate.

---

## Pillar note (TE)

*What can we remove?* The instrument gets faster the TE way: by deciding what it doesn't have. Gaussian blur is gone as a design choice, not a casualty — and the stipple that replaces it is more Kinetic_Curator than blur ever was. **Earn-back rule:** nothing cut or removed returns unless a performer reaches for it mid-set and it's not there, or Matt's eyes miss it on the demo. That's the only gate back.
