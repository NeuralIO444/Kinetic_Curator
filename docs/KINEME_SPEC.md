# KINEME — the living-motion spec

**Status:** SPEC ONLY. No build, no issues, no PRs. Written for Matt's approval — plain language, no code.

Kineme (Matt's pick — like *phoneme* is the smallest unit of speech, a kineme is the smallest unit of motion) is the system that keeps KC-1 alive. It is the "living motion" dynamic: everything on the canvas breathes, wobbles, and boils, subtly, forever. It lives in the **Director** panel — that's the product-surface name. (No artist names on the surface.)

## What kineme IS

Kineme does not add new visuals. It animates parameters that already exist — wobble, jitter, breath, drift, pulse — so a finished piece keeps moving instead of sitting still. One system, one clock, every driver.

**The v1 drivers** (the things kineme moves):

| Driver | What it animates | Per-instance? |
|---|---|---|
| Breath | slow scale swell on each mark | yes — every mark breathes on its own phase |
| Drift | slow position wander | yes |
| Pulse | rhythmic scale thump | yes |
| Brush wobble | the hand-drawn trail wobble + edge boil | yes — the first new consumer, waiting on this spec |

**What "amount" means:** each driver has its own amount knob. Amount 0 means today's render, exactly — bit-for-bit, the noise math is skipped entirely, not multiplied by zero. Above 0, the driver comes alive, scaled in units that make sense for that driver (wobble reach as a fraction of the edge band, pulse as scale depth, etc.). Small amounts read as "hand"; large amounts read as "boil."

**The one rule:** a driver dropping out never freezes the piece. If audio goes silent, the audio-driven motion relaxes away and the rest keeps breathing. The canvas is never static because a driver quit — it relaxes to whatever drivers remain.

## The time path

Three pieces, shared by the live canvas and the still/print path:

1. **Loop time.** One clock, in seconds, shared with phrases, morphs, and the sequencer. Every kineme driver reads this same time — that is what keeps the whole piece in one groove.
2. **Per-instance phase.** Each mark gets its own phase from an arithmetic hash of its seed (two decorrelated values: one offsets where in the noise field the mark samples, one offsets which boil frame it lands on). Copies of the same asset never pulse in lockstep. The hash is sine-free on purpose — the classic sine hash breaks down on weaker GPUs.
3. **The boil clock.** The hand-drawn "boiling line" look comes from quantizing time: the wobble holds still, then jumps to a new configuration, like animation shot on twos. Formula in prose: boil time = the loop time snapped down to the nearest boil frame. **Position taken: 8 frames per second default** — the classic hand-drawn rate (After Effects' default for this exact look). The exposed range is 6–12: 6 is an obvious boil, 12 is a subtle quiver. Smooth drivers (breath, drift) skip the boil clock and read raw loop time.

## Freeze semantics

Freeze holds time. Full stop.

- When the piece freezes (tab loses the loop clock, user hits hold), the loop-time uniform stops advancing. Every driver — boil, breath, drift, pulse — holds its exact pose. The boil holds its current drawing; it does not snap back to a clean frame.
- Resume continues from the held instant. No pop, no jump to a new noise configuration, no restart.
- This matches the sequencer contract Matt already approved (hold and resume).

## Governor interaction

When the governor sheds load to protect the frame rate, kineme degrades in tiers — and it **freezes or pins, never resets**:

- **Tier 1 — hold the boil.** The boil clock stops advancing (zero extra cost — it's one rounding operation on an already-uploaded value). The piece holds its current wobbled pose.
- **Tier 2 — hold all kineme.** Loop time stops advancing for kineme evaluation. Breath, drift, pulse all hold their pose.
- **Tier 3 — pin cell drivers.** Any cell/strip-based motion pins to its rest cell. The pose is static but defined.
- **Tier 4 — zero the amounts.** Amounts go to 0, which is today's render exactly (the hard gate, bit-for-bit).

The contract that matters: shedding never touches the seed or the phase. When load eases, motion resumes **from the held pose**, not from zero — the piece wakes up where it fell asleep. There is one governor registry entry for the whole kineme system, not per-driver multipliers.

## The still / print path

A living piece becomes a still by evaluating the exact same kineme path at one frozen instant.

- **Which instant:** deterministic from the seed. The still time is derived by hashing the project seed into a moment within one boil period — so the same project always prints the same frame, and different seeds print different (but equally good) moments. Reseed the piece, get a new still; reprint the same seed, get the identical still.
- Amounts apply normally: a still with wobble amount up shows the wobbled edge at that instant, not the clean frame.
- No separate stills code path — the baker calls the same evaluator with a fixed time. One implementation, two callers.

## Driver API — the contract for future drivers

Brush wobble is the first driver built against this spec; others follow the same shape. A driver declares:

- **An id** — a stable name the project file references.
- **Which existing parameter(s) it animates** — kineme never invents render features; it moves knobs that already exist.
- **What its amount means** — in real units for that driver (fraction of edge band, scale depth, degrees of rock), plus its sane range.
- **Phase mode** — per-instance (own phase from the seed hash) or global (loop time only, everything moves together).
- **Boil or smooth** — whether it reads the quantized boil clock or raw loop time.
- **Its cost tier** — declared once, so the governor knows what it's allowed to shed.

The engine guarantees every driver, in return:

- The shared loop-time value, live and still.
- Per-instance phase from the seed hash, decorrelated.
- Amount 0 = today's render exactly (hard gate).
- Freeze holds time; resume continues (never resets, never pops).
- Governor shed = freeze → pin → zero, in that order, never a reset; recovery resumes from the held pose.
- Stills evaluate deterministically from the seed.

## What kineme is NOT

- Not a new render feature. No new shaders features, no new assets, no atlas changes. It moves existing knobs.
- Not the asset system. The old frame-strip approach baked animation into assets and died there; kineme is decoupled by design.
- Not a second clock. One loop time for phrases, morphs, the sequencer, and kineme.

## Resolved decisions (Matt, 2026-10-03)

1. **Both** — global RATE knob plus per-driver amounts.
2. **8 fps** boil default (6–12 exposed).
3. **Stepped only** — no smooth shimmer in v1.
4. **Free-running** — no beat-sync in v1.
5. **Seed-derived** still instant — no moment-scrubbing in v1.
6. **Curated four** — breath, drift, pulse, brush wobble.
7. **Own taxonomy row** — kineme is a system, not a parameter tweak.
8. **Curator does not modulate kineme** — the curator judges (keep/pass), the artist performs. No live coupling.

## Open questions for Matt (answered above)

Answer these and the spec is buildable. My recommendation is under each — your call stands.

1. **One master RATE knob in Director plus per-driver amounts, or per-driver amounts only?**
   *Recommend: both — a global RATE as the one-hand "how alive is this" control, per-driver amounts for taste.*

2. **Boil default: 8 fps or 12?**
   *Recommend: 8 — the classic hand-drawn rate; 6–12 stays exposed for the obvious-to-subtle range.*

3. **Boil always stepped (quantized), or offer a smooth shimmer mode too?**
   *Recommend: stepped only for v1 — the stepping IS the hand-drawn look; smooth is a follow-on.*

4. **Kineme rates: free-running seconds, or beat-synced to the phrase BPM?**
   *Recommend: free-running for v1 — boil is film-fps based and breath is organic; beat-sync later if a piece wants it.*

5. **Still instant: seed-derived (deterministic), or let the artist scrub and pick the moment?**
   *Recommend: seed-derived for v1 — every print is reproducible; moment-picking is a real feature for later.*

6. **v1 driver set: expose everything kineme can move, or a curated few?**
   *Recommend: curated — breath, drift, pulse, brush wobble. The rest join as they're tuned, not before.*

7. **In the UI taxonomy: does kineme get its own row, or sit under the existing Motion axis?**
   *Recommend: its own row — it's the living-motion dynamic, distinct from placement motion.*
