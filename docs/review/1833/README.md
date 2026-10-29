# #1806 slice 2 — recipe wiring: evidence

Slice 2 wires the slice-1 seam into the recipe: a content/pattern
stratum whose document layer carries `feedsAccum: false` stops feeding
the ACCUM buffer; everything else about its frame is unchanged.
Proof suite: `app/src/gl/accumFeed.selfcheck.mjs` (15 cases, node +
browser). Scene throughout: the slice-1 bench scene — two content
strata (`bg`, 8 instances; `top`, 11) under an invert FX stratum,
praystation palette, seed `0xc0ffee`, text-bearing assets disabled.

## Stills (480×336, harness renders of the real scene)

- `stage.png` — the stage frame: both strata, inverted by the FX
  stratum. The flagged-off stratum still renders here in full; the
  flag governs the buffer, never the stage.
- `buffer-all-feed.png` — 24-step trail still (fade 0.88, optics 0.6),
  no flags: the buffer holds the whole inverted composite — every
  mark trails, in inverted colours.
- `buffer-subset.png` — the same still with `top` flagged off: only
  the `bg` stratum's marks trail, in their raw pre-FX colours (the
  buffer eats pre-FX light). The `top` stratum's letterforms are
  absent. The two buffers differ on 34.9% of channels.

## Byte-level results (selfcheck, SwiftShader harness)

- **Default preserved:** a 12-step sequence over unflagged contracts
  is byte-identical to the same sequence with every flag spelled
  `feedsAccum: true` — and an unflagged contract is byte-identical
  to the pre-#1806 contract shape (the key exists only while off).
- **Zero trail:** with `top` flagged off (no-FX scene), the sequence
  buffer matches the buffer of the scene *without* `top` to a worst
  channel Δ of 1 LSB (resolve rounding; the suite allows 2).
- **Both off:** the buffer never leaves the begin background (uniform
  to the resolve's ±1 LSB Bayer dither, alpha opaque), identically
  for the FX and no-FX scenes — no FX light leaks into an unfed
  buffer.
- **Mirror parity:** the JS mirror (`mirrorAccumStep`) stepped on the
  full composite frame and on the subset frame each matches the GPU
  probe stepped on the same frames to ≤ 3 LSB — the recipe is the
  same recipe on both paths.
- **Matte ruling:** with `bg` flagged off and `top` feeding, matted
  by `bg`: the matted subset's alpha sum falls 320,746 → 36,619
  against the unmatted subset, never exceeds it (+2 LSB floor), and
  leaves **zero** light outside `bg`'s own footprint — the source
  lends its shape, never its light.

## Cost of the subset render (the slice's declared cost)

Method: page-side render loops in the parity harness
(`window.__kcRender` vs `window.__kcAccumInput`, one payload ferried
once, 2 warmups + 7 reps, medians), 512×512, the scene above.
SwiftShader (headless Chromium software GL): absolute wall times are
software-renderer numbers, roughly two orders above hardware — the
**ratio** is the portable figure. One full-render rep spiked to
2,021 ms under shared-machine load; medians are reported.

| render | median (ms, SwiftShader wall) |
|---|---|
| full composite (`__kcRender`) | 903.7 |
| subset, `bg` only (8 of 19 instances) | 641.9 |
| subset, `top` only (11 of 19 instances) | 664.7 |
| subset, both strata (no FX chain) | 777.9 |

Subset ÷ full ≈ **0.71** — the extra render costs about seven-tenths
of a full scene render of the same scene, placement-bound: it scales
with the *selected* strata's counts, which the governor already
budgets. Declared in the cost registry as `gl/accum-feed`, tier 0,
timeMs 3.5 — the author's estimate from the measured ratio against
the iPad render cap (`FRAME_BUDGETS.renderCapMs` = 5.0 ms,
`src/data/quality.js`): 0.71 × 5.0 ≈ 3.5 ms at 1080p iPad-class. A
hardware re-bless supersedes it. The governor sheds the cost as cut
1.47 (subset → composite: all strata trail until pressure lifts) —
the shed changes trails, never the presented frame.

Caveat: a heavier variant of the scene (103 instances) builds a
7344×6912 atlas (~200 MB) and crashed the harness page under load at
384×384 and 512×512, so the bench uses the 19-instance scene. The
atlas size is a property of the scene, not of the subset path (both
renders share one atlas).
