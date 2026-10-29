# #1808 slice 1 — trail grid: measured evidence

The claim this slice makes is narrow: **the grid faithfully reads the
trail field** (steering is slice 2, gated on Matt playing it). Measured
two ways — the selfcheck's scripted scenes against an independent
reference, and the comet run below (a 16×16 white block crossing a
black 256×176 field diagonally over 48 steps, dt 1/30, keep 0.90,
spectral fade + age buffer on, through the recipe's own JS mirror).

## The comet, read by the grid

```
grid 32x22  stamp 48  hasAge true
peak energy 1.0000 @ cell (26,20) dominant age 0.000s
lit cells 15.9%  light-weighted mean age 0.265s

cells along the comet path (deposit step -> cell -> energy / dominant age):
  step 47  cell (26,20)  energy 1.0000  age 0.000s  b/g 1.000
  step 42  cell (24,18)  energy 0.6819  age 0.117s  b/g 0.867
  step 36  cell (21,16)  energy 0.3821  age 0.301s  b/g 0.691
  step 30  cell (18,14)  energy 0.2160  age 0.489s  b/g 0.548
  step 24  cell (15,12)  energy 0.1218  age 0.685s  b/g 0.431
  step 18  cell (12, 9)  energy 0.0631  age 0.917s  b/g 0.324
  step 12  cell ( 9, 7)  energy 0.0382  age 1.101s  b/g 0.259
  step  6  cell ( 6, 5)  energy 0.0231  age 1.289s  b/g 0.205
  step  0  cell ( 3, 3)  energy 0.0138  age 1.485s  b/g 0.161
```

The head is fresh (age 0, full energy) and every step back along the
path is older, dimmer, and bluer-dead (b/g falls 1.000 → 0.161) — the
grid's true ages and its colour-ratio proxy agree, which is what makes
the ratio fallback honest when no age buffer rides along. Ages sit
within a frame of the deposit arithmetic throughout (a cell's dominant
age is a light-weighted mean over its pixels, so it reads a shade
under the oldest deposit in it — the selfcheck pins the exact
relationship against the reference implementation).

## Energy map (top row = top of frame)

```
.........................##*....
.......................:####....
......................+####*....
.....................*####+.....
...................:*###*.......
..................:**#*+........
.................+****:.........
................+***+...........
..............:++**:............
.............:++++..............
.............:+++:...............
...........++++:................
.........::++:..................
........:::::...................
.......::::.....................
......::::......................
....:::::.......................
...::::.........................
..::::..........................
..::............................
................................
................................
```

(`.` <0.01, `:` <0.05, `+` <0.15, `*` <0.35, `#` above.)

## Accuracy + cost (from the verification runs)

- **Selfcheck** (`src/gl/trailGrid.selfcheck.mjs`, 7 cases): hand-
  computed cells exact (including the light-weighted dominant age,
  (0.9·1 + 0.1·3) = 1.2 case); scripted two-block scene — every cell's
  energy/means within 1e-9 of an independent box-filter reference of
  the mirror buffer, void pattern identical, ages within one frame of
  analytic (29 frames for the step-0 block, 9 for the step-20 block);
  colour-only read carries identical energies with void ages; sampler
  nearest-cell + clamped; empty buffer invents nothing.
- **Derivation cost:** ~37 ms per derive at pair size (1600×1100,
  fully lit worst case; ~45 ms measured under a second builder's load)
  in this sandbox. In this slice the only caller is the backstage
  readout's ~4 Hz poll. A steering cadence is slice 2's budget
  question, to be proven on the device harness, not assumed.
- **No stills:** the backstage view is a live readout; the honest
  evidence for a grid is the measured table above, not a picture of
  it. The view itself is `?debug=trailgrid` on the live app.
