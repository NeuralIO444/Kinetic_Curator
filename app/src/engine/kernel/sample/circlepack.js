// #1195 — circle-packing layout: largest-first tangent nesting, zero overlaps, extreme scale contrast.
//
// RADIUS PLUMBING (the design note the issue asked for). Packing needs each node's RADIUS before it can place it,
// and the placement pipeline applies sizes later (stage C, per frame). So the sampler packs in a nominal pixel space
// and hands the size back through the channel that already exists for per-point attributes:
//   * radius_i  = PACK_UNIT_PX * scale_i * depth_i, with scale_i = lo + (hi - lo) * u_i  (the BASE SCALE slider range,
//     passed in as ctx.packScale; the audio-modulated range is deliberately NOT used, so geometry is not re-packed
//     every frame) and depth_i the z-tier multiplier stage C applies;
//   * the sampler returns u_i in the `t` lane, and the orchestrator copies it into the unit-scale draw for this mode
//     (3 lines, the brush precedent), so stage C's `(lo + (hi-lo) * u) * depth` lands exactly on scale_i.
// geometrySignature gains the base scale range ONLY for this mode, so moving SCALE re-packs and no other mode's
// cache key changes.
//
// GUARANTEES: no two circles overlap and every circle lies on the plate, in the nominal space above. Jitter and
// displacement are ignored/unsupported for this mode (they would break the guarantee) — same discipline as Poisson.
// Circles that cannot find room at their slider size SHRINK (down to MIN_SHRINK of the slider minimum) rather than
// overlap or leave the plate; the shrink is reported through `t`, so the drawn size matches the packed size.
// Where the plate truly has no room (e.g. SCALE min == max cannot shrink, or far more nodes than fit) the circle is
// kept on the plate at the least-crowded spot and counted in the set's `overflow`: "no overlap where there is room".
//
// DETERMINISM: one dedicated stream `rngForChannel(seed, 'circlepack', seedOffsets)` (rides the spatial group); the
// whole set is built once per (seed, offsets, plate, count, scale range, tiers, unit) and cached; sampling is a lookup.
import { rngForChannel } from '../rng.js';
import { writeSampleColumns } from './columns.js';

/** Nominal radius in px of a node at scale 1.0 (tunable; asset silhouettes vary). */
export const PACK_UNIT_PX = 36;
/** Size distribution exponent: >1 makes few big anchors and many small fillers. */
export const PACK_SIZE_EXPONENT = 2.2;
/** Random tangent/free candidates tried per circle before it shrinks. */
export const PACK_TRIES = 48;
/** Shrink steps and factor when a circle cannot be placed at its size. */
export const PACK_SHRINK = 0.82;
export const PACK_MAX_SHRINKS = 12;
/** A circle never shrinks below this fraction of the slider minimum. */
export const PACK_MIN_SHRINK = 0.1;
const CACHE_SIZE = 6;
const _cache = new Map();
const EPS = 1e-9;

/** The z-tier depth multiplier stage C applies (placement.js: soa.depth). */
export function packDepth(i, tiers) {
  const t = Math.max(1, tiers | 0);
  return t > 1 ? 0.6 + ((i % t) / (t - 1)) * 0.8 : 1.0;
}

/**
 * Build the packing. Returns { x[], y[], r[], u[] } (one entry per index 0..count-1; index 0 is the largest).
 * u may fall below 0 for shrunk fillers (stage C's arithmetic keeps the scale positive, see PACK_MIN_SHRINK).
 */
export function circlePack({ seed, seedOffsets = null, w, h, count, lo, hi, tiers = 1, unit = PACK_UNIT_PX }) {
  const key = `${seed >>> 0}|${w}|${h}|${count}|${lo}|${hi}|${tiers}|${unit}|${seedOffsets ? JSON.stringify(seedOffsets) : ''}`;
  const hit = _cache.get(key);
  if (hit) return hit;
  const n = Math.max(0, count | 0);
  const span = hi - lo;
  const stream = rngForChannel(seed, 'circlepack', seedOffsets);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const rs = new Float64Array(n);
  const us = new Float64Array(n);

  // uniform spatial grid over placed circles (cell = the largest possible radius ⇒ a 3x3 sweep sees every neighbour)
  const maxR = Math.max(1, unit * Math.max(lo, hi) * 1.4);
  const cell = maxR * 2;
  const gw = Math.max(1, Math.ceil(w / cell));
  const gh = Math.max(1, Math.ceil(h / cell));
  const grid = Array.from({ length: gw * gh }, () => []);
  const cellOf = (x, y) => Math.min(gh - 1, Math.max(0, Math.floor(y / cell))) * gw + Math.min(gw - 1, Math.max(0, Math.floor(x / cell)));

  const fits = (x, y, r) => {
    if (x - r < 0 || x + r > w || y - r < 0 || y + r > h) return false;
    const cx = Math.min(gw - 1, Math.max(0, Math.floor(x / cell)));
    const cy = Math.min(gh - 1, Math.max(0, Math.floor(y / cell)));
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(gh - 1, cy + 1); gy++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(gw - 1, cx + 1); gx++) {
        for (const j of grid[gy * gw + gx]) {
          const d = Math.hypot(x - xs[j], y - ys[j]);
          if (d < r + rs[j] - EPS) return false;
        }
      }
    }
    return true;
  };

  let overflow = 0;
  const floorU = -(1 - PACK_MIN_SHRINK) * (lo / (span || 1)); // u at which scale = MIN_SHRINK * lo
  for (let k = 0; k < n; k++) {
    // heavy-tailed, rank-ordered: index 0 = hi, the tail approaches lo
    let u = Math.pow((n - k) / n, PACK_SIZE_EXPONENT);
    const depth = packDepth(k, tiers);
    let placedAt = false;
    for (let shrink = 0; shrink <= PACK_MAX_SHRINKS && !placedAt; shrink++) {
      const scale = (lo + span * u) * depth;
      const r = Math.max(0.5, unit * scale);
      if (2 * r > w || 2 * r > h) { // too big for the plate at all: shrink first
        u = Math.max(floorU, u - 0.5);
        continue;
      }
      // tangent candidates around random placed circles, then free random positions
      for (let t = 0; t < PACK_TRIES && !placedAt; t++) {
        let x;
        let y;
        if (k > 0 && t % 3 !== 2) {
          const j = Math.floor(stream() * k);
          const ang = stream() * Math.PI * 2;
          const d = rs[j] + r;
          x = xs[j] + Math.cos(ang) * d;
          y = ys[j] + Math.sin(ang) * d;
        } else {
          x = r + stream() * Math.max(0, w - 2 * r);
          y = r + stream() * Math.max(0, h - 2 * r);
        }
        if (fits(x, y, r)) {
          xs[k] = x; ys[k] = y; rs[k] = r; us[k] = u;
          grid[cellOf(x, y)].push(k);
          placedAt = true;
        }
      }
      if (!placedAt) u = Math.max(floorU, u - (1 - PACK_SHRINK) * (u - floorU) - 0.02);
    }
    if (!placedAt) {
      // The plate genuinely has no room for this circle at its smallest allowed size (a degenerate SCALE range with
      // min == max cannot shrink, or the count is more than the plate can hold). The guarantee is "no overlap WHERE
      // THERE IS ROOM", so say it plainly: put it at the least-crowded spot on the plate, keep it on the plate, and
      // count it in `overflow` (honest signal; the selfcheck asserts it is zero whenever the plate has room).
      const fs = Math.max(0.5 / unit, (lo + span * floorU) * depth);
      const r = unit * fs;
      let best = { x: Math.min(w - r, Math.max(r, w / 2)), y: Math.min(h - r, Math.max(r, h / 2)), pen: Infinity };
      for (let gy = 0; gy < 20; gy++) {
        for (let gx = 0; gx < 20; gx++) {
          const x = r + (gx / 19) * Math.max(0, w - 2 * r);
          const y = r + (gy / 19) * Math.max(0, h - 2 * r);
          let pen = 0;
          for (let j = 0; j < k; j++) {
            const over = r + rs[j] - Math.hypot(x - xs[j], y - ys[j]);
            if (over > pen) pen = over;
          }
          if (pen < best.pen) best = { x, y, pen };
        }
      }
      xs[k] = best.x; ys[k] = best.y; rs[k] = r; us[k] = floorU;
      grid[cellOf(best.x, best.y)].push(k);
      overflow += 1;
    }
  }
  const out = { x: xs, y: ys, r: rs, u: us, n, overflow };
  if (_cache.size >= CACHE_SIZE) _cache.delete(_cache.keys().next().value);
  _cache.set(key, out);
  return out;
}

export function clearCirclePackCache() {
  _cache.clear();
}

/** Sampler: (ctx) => { x, y, t }. A lookup into the cached packing; no jitter, no ctx.rng (exact guarantee). */
export function circlepack(ctx) {
  const { i, count, w, h, seed, seedOffsets, zTiers, packScale, packUnitPx } = ctx;
  const range = Array.isArray(packScale) && packScale.length === 2 && packScale.every(Number.isFinite) ? packScale : [0.4, 1.6];
  const lo = Math.min(range[0], range[1]);
  const hi = Math.max(range[0], range[1]);
  const set = circlePack({
    seed, seedOffsets, w, h, count, lo, hi, tiers: zTiers || 1,
    unit: Number.isFinite(packUnitPx) && packUnitPx > 0 ? packUnitPx : PACK_UNIT_PX,
  });
  const k = i < set.n ? i : set.n - 1;
  if (k < 0) {
    if (writeSampleColumns(ctx, w / 2, h / 2, 0.5)) return;
    return { x: w / 2, y: h / 2, t: 0.5 };
  }
  // t carries the unit-scale draw for this mode (see the plumbing note). Clamp NaN-proof.
  const t = set.u[k];
  if (writeSampleColumns(ctx, set.x[k], set.y[k], t)) return;
  return { x: set.x[k], y: set.y[k], t };
}
