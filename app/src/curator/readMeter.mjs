// readMeter.mjs — #1627 S2: the three-reads meter (census family).
//
// Every Look should read at three levels — (1) big shapes: silhouette,
// hero marks; (2) secondary: second exposure, MATH rhythm, the ground;
// (3) fine detail: dust, stipple, grain, motes in the light. This meter
// makes "bald", "mud" and "top-heavy" MEASUREMENTS, not vibes: a
// scale-band measure over the composed still's raster (the E4 /
// matstill precedent — censusReport composes the still, rasterizes it
// with Resvg, and hands the pixels here). This module is the pure half:
// pixels in, band shares out. No imports, no clock, no RNG — the same
// raster always meters the same, bit for bit.
//
// Method — a variance pyramid, three bands, one currency (energy):
//   A0  the ink-energy map: alpha × luminance, 0..1 per pixel.
//   G1  A0 box-downsampled ×2, G2 ×4, G3 ×8 (each re-upsampled to full
//       size by nearest-cell replication for the differences below).
//   fine = mean((A0 − G1)²)        detail that one halving erases:
//                                  grain, stipple, dust, 1–2 px marks.
//   mid  = mean((G1 − G3)²)        structure at 2–8 px: the second
//                                  exposure's texture, rhythm, ground.
//   big  = variance of G3          silhouette / hero mass at ≥8 px:
//                                  how much the coarse map itself varies.
// The three are commensurate (all are mean squared deviations of the
// same map at different scales), so their SHARES are honest fractions
// of the picture's total read energy. A bald Look (all top, no detail)
// has fine ≈ 0; a mud Look (all dust, no silhouette) has big ≈ 0
// because its coarse map is a flat field; a top-heavy Look spends
// almost everything at the coarse scale.
//
// Verdicts are thresholds ON THE SHARES, named here once (the census
// discipline: a tunable lives in the open, telemetry tunes it):
//   fine share < BALD_FINE_MAX            → 'bald' (fine-starved)
//   big  share < MUD_BIG_MAX              → 'mud' (no big read)
//   big  share > TOP_HEAVY_BIG_MIN        → 'top-heavy'
//   otherwise                             → 'balanced'
// A raster with no ink at all meters 'empty' — never a fake balance.
//
// IN-APP APPROXIMATION: none, on purpose. A params-space proxy (mark
// size → big, particle count → fine) would be a vibe wearing the
// meter's name; the honest in-app surface is the census readout
// (censusReadout.readsView reshapes these measured rows, it does not
// recompute them). Node-side only until a real in-app raster exists.

/** Fine share below this reads as bald: the detail level is missing.
 *  Measured scale (corpus, 2026-10-20): flat-mark scenes meter fine at
 *  0.005–0.016; a scene with a real fine level (stipple body, speck
 *  dust) meters 0.04–0.06. 0.03 sits between, ~2× from either side. */
export const BALD_FINE_MAX = 0.03;
/** Big share below this reads as mud: no silhouette survives the blur.
 *  Measured: the speck-field corpus scene meters big at 0.055; the
 *  balanced scene at 0.80 — the bar sits an order below the balance. */
export const MUD_BIG_MAX = 0.08;
/** Big share above this reads as top-heavy: everything is silhouette.
 *  Checked BEFORE bald: a frame that is ≥93% coarse energy is
 *  top-heavy even though it is also fine-starved (measured: top-heavy
 *  corpus 0.968, bald corpus 0.894, balanced 0.80). */
export const TOP_HEAVY_BIG_MIN = 0.93;

/** Box-downsample a Float64 map by an integer factor (edge cells clip). */
function downsample(map, w, h, factor) {
  const ow = Math.max(1, Math.floor(w / factor));
  const oh = Math.max(1, Math.floor(h / factor));
  const out = new Float64Array(ow * oh);
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      let s = 0;
      let n = 0;
      for (let dy = 0; dy < factor; dy++) {
        const y = oy * factor + dy;
        if (y >= h) break;
        for (let dx = 0; dx < factor; dx++) {
          const x = ox * factor + dx;
          if (x >= w) break;
          s += map[y * w + x];
          n++;
        }
      }
      out[oy * ow + ox] = n ? s / n : 0;
    }
  }
  return { map: out, w: ow, h: oh };
}

/** Nearest-cell upsample of a downsampled map back to (w, h). */
function upsample(src, w, h, factor) {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.h - 1, Math.floor(y / factor));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.w - 1, Math.floor(x / factor));
      out[y * w + x] = src.map[sy * src.w + sx];
    }
  }
  return out;
}

const meanSqDiff = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return a.length ? s / a.length : 0;
};

/** The verdict for a set of shares — the meter's whole opinion. */
export function readVerdict(shares) {
  if (!shares || !(shares.big + shares.mid + shares.fine > 0)) return 'empty';
  if (shares.big > TOP_HEAVY_BIG_MIN) return 'top-heavy';
  if (shares.fine < BALD_FINE_MAX) return 'bald';
  if (shares.big < MUD_BIG_MAX) return 'mud';
  return 'balanced';
}

/**
 * Meter one raster.
 * @param pixels RGBA byte buffer (Uint8Array/Uint8ClampedArray), length w*h*4
 * @returns { big, mid, fine, shares:{big,mid,fine}, total, verdict, mean }
 *   big/mid/fine are the raw band energies (mean squared deviations);
 *   shares are their fractions of the total; mean is the mean ink
 *   energy of the frame (0 on an empty raster).
 */
export function readMeter(pixels, w, h) {
  const width = w | 0;
  const height = h | 0;
  if (!pixels || width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    return { big: 0, mid: 0, fine: 0, shares: { big: 0, mid: 0, fine: 0 }, total: 0, verdict: 'empty', mean: 0 };
  }
  const n = width * height;
  const a0 = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const alpha = pixels[o + 3] / 255;
    const lum = (0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]) / 255;
    const e = alpha * lum;
    a0[i] = e;
    mean += e;
  }
  mean /= n;
  if (mean === 0) {
    return { big: 0, mid: 0, fine: 0, shares: { big: 0, mid: 0, fine: 0 }, total: 0, verdict: 'empty', mean: 0 };
  }
  const g1s = downsample(a0, width, height, 2);
  const g3s = downsample(a0, width, height, 8);
  const g1 = upsample(g1s, width, height, 2);
  const g3 = upsample(g3s, width, height, 8);
  const fine = meanSqDiff(a0, g1);
  const mid = meanSqDiff(g1, g3);
  // Big = the coarse map's own variance around the frame mean: a flat
  // coarse map (mud, or a blank) carries no silhouette, however much
  // fine energy sits on top of it.
  let big = 0;
  for (let i = 0; i < n; i++) {
    const d = g3[i] - mean;
    big += d * d;
  }
  big /= n;
  const total = big + mid + fine;
  const shares = total > 0 ? { big: big / total, mid: mid / total, fine: fine / total } : { big: 0, mid: 0, fine: 0 };
  const r6 = (v) => +v.toFixed(6);
  return {
    big: r6(big),
    mid: r6(mid),
    fine: r6(fine),
    shares: { big: r6(shares.big), mid: r6(shares.mid), fine: r6(shares.fine) },
    total: r6(total),
    mean: r6(mean),
    verdict: readVerdict(shares),
  };
}
