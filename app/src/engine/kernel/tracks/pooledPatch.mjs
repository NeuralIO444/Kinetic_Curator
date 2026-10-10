// pooledPatch.mjs — #1251: pooled numeric FIELD/FEED resolve path.
//
// The object path in gl/liveResolve.mjs allocates ~5x(M+N) small objects per
// frame on the FIELD/FEED block: toNorm maps (x2), the applyField/applyFeed
// result maps, sampleFlow's per-point {x,y}, then the clampHop item map.
// This module runs the same math over reused Float64Array scratch: the only
// per-frame allocations left are the final item objects (fresh objects are
// load-bearing — buildPlacements' itemPool aliases cached item objects across
// frames and the morph ledger holds last frame's array, so in-place mutation
// would corrupt both) plus the two tiny per-layer diagnostic objects the
// object path also makes.
//
// Bit-identical contract: every floating-point op runs in the same order as
// the object path (trackGraph.applyField/applyFeed + liveResolve's
// toNorm/clampHop), including the ~1ulp (x/W)*W round-trip inside clampHop
// and the #1236 no-op behavior (the normalized coords pass through unchanged
// and the clampHop item map still runs). Pinned by pooledPatch.selfcheck.mjs:
// any drift fails the suite.
//
// Selectable: liveResolve.mjs keeps the object path as the default and uses
// this module only when input.pooledPatch === true. Default behavior is
// untouched — byte-identical defaults.
//
// Stays behind the kernel API: imports only trackGraph.js, never GL.
import { FIELD_RADIUS, FIELD_SOFT, normalizePatch } from './trackGraph.js';

// Must match gl/liveResolve.mjs's clampHop HOP_MAX_PX.
const HOP_MAX_PX = 4;

function ensureCap(arr, n) {
  if (arr.length >= n) return arr;
  let cap = arr.length || 64;
  while (cap < n) cap *= 2;
  return new Float64Array(cap);
}

export function createPooledPatch() {
  // Grow-only scratch, reused across frames. Sized in doubles (2 per point).
  let srcFlat = new Float64Array(64);
  let tgtFlat = new Float64Array(64);
  let outFlat = new Float64Array(64);

  // Zero-alloc: fills flat[0..2n) with toNorm values. Same op order as the
  // object path's (it) => ({ x: (Number(it.x)||0)/W, y: (Number(it.y)||0)/H }).
  function normInto(items, W, H, flat) {
    const n = items ? items.length : 0;
    for (let k = 0; k < n; k++) {
      const it = items[k];
      flat[2 * k] = (Number(it.x) || 0) / W;
      flat[2 * k + 1] = (Number(it.y) || 0) / H;
    }
    return n;
  }

  // The fused clampHop item pass. Allocates the fresh item objects — the
  // floor (see header). Float ops mirror clampHop exactly:
  //   dx = q.x*W - it.x; dy = q.y*H - it.y; hypot; clamp at 4px;
  //   { ...it, x: it.x+dx, y: it.y+dy }
  // and the pullPx accumulator mirrors the object path's mean-hop sum,
  // including its divisor (Math.max(1, n)).
  function applyPulled(items, pulled, n, W, H) {
    const out = new Array(n);
    let sumPx = 0;
    for (let k = 0; k < n; k++) {
      const it = items[k];
      let dx = pulled[2 * k] * W - it.x;
      let dy = pulled[2 * k + 1] * H - it.y;
      const m = Math.hypot(dx, dy);
      if (m > HOP_MAX_PX) { dx *= HOP_MAX_PX / m; dy *= HOP_MAX_PX / m; }
      const nx = it.x + dx;
      const ny = it.y + dy;
      sumPx += Math.hypot(nx - it.x, ny - it.y);
      out[k] = { ...it, x: nx, y: ny };
    }
    return { items: out, pullPx: sumPx / Math.max(1, n) };
  }

  // Numeric applyField. Mirrors trackGraph.applyField op-for-op, writing the
  // pulled normalized coords into reused outFlat instead of allocating a
  // per-point {x, y} array.
  function applyFieldItems(tgtItems, srcItems, patch, W, H) {
    const p = normalizePatch(patch);
    const nT = tgtItems ? tgtItems.length : 0;
    const nS = srcItems ? srcItems.length : 0;
    srcFlat = ensureCap(srcFlat, 2 * nS);
    tgtFlat = ensureCap(tgtFlat, 2 * nT);
    outFlat = ensureCap(outFlat, 2 * nT);
    normInto(srcItems, W, H, srcFlat);
    normInto(tgtItems, W, H, tgtFlat);
    // #1236 parity: the object path returns the normalized target array
    // UNCHANGED on the no-op path (mode off, strength 0, empty source) and
    // still runs the clampHop item map over it — copy the norm coords
    // through so the fused pass sees the same values.
    if (p.mode !== 'field' || !p.strength || nS === 0) {
      outFlat.set(tgtFlat.subarray(0, 2 * nT));
    } else {
      const gain = 0.002 * p.strength * p.polarity;
      const r2 = FIELD_RADIUS * FIELD_RADIUS;
      for (let k = 0; k < nT; k++) {
        const qx = tgtFlat[2 * k] || 0;
        const qy = tgtFlat[2 * k + 1] || 0;
        let ax = 0;
        let ay = 0;
        for (let j = 0; j < nS; j++) {
          const dx = (srcFlat[2 * j] || 0) - qx;
          const dy = (srcFlat[2 * j + 1] || 0) - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const den = d2 + FIELD_SOFT;
          ax += dx / den;
          ay += dy / den;
        }
        outFlat[2 * k] = qx + ax * gain;
        outFlat[2 * k + 1] = qy + ay * gain;
      }
    }
    return applyPulled(tgtItems, outFlat, nT, W, H);
  }

  // Numeric applyFeed. Mirrors trackGraph.applyFeed with sampleFlow inlined
  // op-for-op, writing straight into outFlat — no per-point {x,y}, no
  // closures. The field wrapper is the SoA { u, v } columns (post-#1308);
  // the bilinear read matches sampleFlow's mix ops exactly. The #1236 no-op contract (mode off, strength 0, no delay
  // history) copies the normalized coords through, exactly like
  // feedLive.applyTo returning its input array.
  function applyFeedItems(tgtItems, feedLive, patch, W, H) {
    const p = normalizePatch(patch);
    const nT = tgtItems ? tgtItems.length : 0;
    tgtFlat = ensureCap(tgtFlat, 2 * nT);
    outFlat = ensureCap(outFlat, 2 * nT);
    normInto(tgtItems, W, H, tgtFlat);
    const delay = feedLive ? feedLive.delay : null;
    if (p.mode !== 'feed' || !p.strength || !delay || !delay.hasHistory(p.from)) {
      outFlat.set(tgtFlat.subarray(0, 2 * nT));
    } else {
      const field = delay.field(p.from);
      const amt = p.strength * p.polarity;
      const fw = field ? field.w : 0;
      const fh = field ? field.h : 0;
      // #1308 — the delay field is now SoA: deinterleaved { u, v } columns,
      // byte-identical values to the old interleaved flow (same float32
      // stores, pinned by feedColumns.golden.json). The bilinear read below
      // is the same op order trackGraph.sampleFlow uses on those columns.
      const u = field ? field.u : null;
      const v = field ? field.v : null;
      for (let k = 0; k < nT; k++) {
        const qx = tgtFlat[2 * k] || 0;
        const qy = tgtFlat[2 * k + 1] || 0;
        let fx = 0;
        let fy = 0;
        if (field && fw && fh && u && v) {
          const x = Math.max(0, Math.min(fw - 1, qx * (fw - 1)));
          const y = Math.max(0, Math.min(fh - 1, qy * (fh - 1)));
          const x0 = Math.floor(x);
          const y0 = Math.floor(y);
          const x1 = Math.min(fw - 1, x0 + 1);
          const y1 = Math.min(fh - 1, y0 + 1);
          const tx = x - x0;
          const ty = y - y0;
          const i00 = y0 * fw + x0;
          const i10 = y0 * fw + x1;
          const i01 = y1 * fw + x0;
          const i11 = y1 * fw + x1;
          const fx0 = u[i00] + (u[i10] - u[i00]) * tx;
          const fy0 = v[i00] + (v[i10] - v[i00]) * tx;
          const fx1 = u[i01] + (u[i11] - u[i01]) * tx;
          const fy1 = v[i01] + (v[i11] - v[i01]) * tx;
          fx = fx0 + (fx1 - fx0) * ty;
          fy = fy0 + (fy1 - fy0) * ty;
        }
        outFlat[2 * k] = qx + fx * amt;
        outFlat[2 * k + 1] = qy + fy * amt;
      }
    }
    return applyPulled(tgtItems, outFlat, nT, W, H);
  }

  // Pooled FEED write side: rasterize item x/y straight into the delay
  // slot's staging buffer via feedLive.pushSourceItems, skipping the
  // per-frame toNorm object map. Zero allocation on this path.
  function pushItems(feedLive, trackId, items, W, H) {
    if (feedLive && typeof feedLive.pushSourceItems === 'function') {
      feedLive.pushSourceItems(trackId | 0, items, W, H);
    }
  }

  return { applyFieldItems, applyFeedItems, pushItems };
}
