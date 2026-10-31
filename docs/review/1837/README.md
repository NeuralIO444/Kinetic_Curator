# #1837 — ember-following drive on the moth (ACCUM rung 2, slice 2)

The moth grazes the light it lives beside. Under a look that declares an
ember weight, each moth reads the trail grid (slice 1's 32×22 read of the
ACCUM buffer) and drifts — capped at ~33 px/s × weight, on a 5-cell
leash — toward the cells whose light is **mid-age**: laid down a moment
ago, still warm. Fresh light (still being drawn, including the moth's
own) and old light (faded to paper) are worth nothing. One drive, one
creature type, declared in look data (`trailEmber` on DUSK FLOCK, 0.6);
the sign flip for a second type is slice 3 (#1838), not built here.

## The drive, measured in data space

One moth, pin at (500, 350); one ember (age 2.1 s, the window's peak)
centred at (675, 350). Distance from the moth's drawn body to the ember
centre, through the real builder (`engine/creature.js` +
`engine/emberDrive.mjs`), every 60 frames:

```
frame:           0   60  120  180  240  300  360  420  480  540  600
weight 0 (off): 175  175  175  175  175  175  175  175  175  175  175
weight 0.6 (on): 175  155  135  115   95   76   56   36   25   25   25
```

Off — no weight, no grid, or the governor's shed — the moth never leaves
its pin: the pre-slice moth, bit for bit (the suite proves the off
tracks identical). On, it closes steadily and settles on the ember.
Fresh light at the same spot draws nothing at all (suite-pinned): the
window's fresh deadband (0.5 s) is what the moth's own body falls under,
so the drive cannot read its own light as food.

## Non-collapse (the #1808 bound)

10-minute soak, simulated buffer (strokes land around the dish every
4–8 s, age, and fade with a 7.7 s half-life; each moth's own drawn light
keeps its cell young), 6 moths on clustered dish pins, weight 0.6,
occupancy counted on the grid:

- **worst streak of one cell holding >40% of the moths: 3.9 s** (bound: 30 s)
- max drift from a pin: 148 px (leash: 250 px) · mean drift: 37.7 px

The damping is the drive's own shape, in three modes: climb a slope,
graze where it smells (hold), and — no slope, nothing underfoot — walk
home. A camp needs food; food is mid-age light; mid-age light dies in
seconds. The first soak run (gradient-only, no deadband) failed at a
70 s streak: the moths camped on their own deposits. The deadband +
walk-home modes are the fix, and the soak now passes with 7× headroom.
The suite (`src/engine/emberDrive.selfcheck.mjs`, 14 cases) pins all of
it, plus 2,000-frame replay-exactness with steering on.

## Cadence + budget (the grid derivation)

Steering derives the grid at most once per 15 ACCUM steps
(`TRAIL_STEER_EVERY`, the buffer statistics' beat) — ~4 Hz; embers live
for seconds and the grid's stamp (the buffer's own step count) labels
its staleness. Slice 1's derivation was backstage-only at ~37 ms; this
slice first made it exact-but-faster (banded loop, dead-pixel skip —
**bit-identical output**, proven against the original implementation
over randomized scenes at seven buffer sizes):

```
pair size 1600×1100, ms per derive, paired run in this sandbox
                        before    after
fully lit, with age      28.3     22.3
fully lit, colour only   21.6     15.0
16% lit, with age        21.9     14.2
2% lit, with age         24.4      9.8
```

Worst case ≈ 22 ms every 15 steps ≈ 1.5 ms/frame amortized, before the
readback (`readTrail()`'s full-buffer readPixels), whose cost is a
device number: per the #1807/#1808 precedent, the on-device figure is
measured on the #1695 device harness, not in this sandbox. When the
instrument is under pressure the governor sheds steering (cut 1.48)
before the buffer itself, so the feed is the first thing the show
stops paying for. The GPU grid reduction slice 1 named remains the
named future optimisation; it did not land here.

## The governor rung

Cut 1.48, in the ACCUM family order: after the selective feed (1.47),
before the creature count (1.5), long before ACCUM itself (cut 3). The
population stays on stage whole — the grid freezes, borrowed offsets
walk home, the moths fall back to today's drives. The badge reports it
(`ember steering held`, shedSummary), the restore table brings it back
whole, and a shed frame replays shed because the shed rides the
resolver input like every governor overlay.
