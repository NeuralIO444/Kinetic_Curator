// patchDiag — inline PATCH diagnostic state (#507).
//
// The resolver computes per-frame patch amounts (pull px, blend, MOD knobs)
// that die as locals. This module is their bulletin board: the patch block
// records one sample per patched layer per tick; the LayerStack polls at
// 1Hz (TapeCounter pattern) and renders one line per patched row.
//
// Pure + browser-safe (no imports — node-testable). No store traffic:
// per-frame values must never ride the store (rerender storm). Samples are
// keyed by layer id; the UI only reads layers it renders, so entries for
// removed layers are never read (bounded at content-track count — no prune
// path needed).

const samples = new Map(); // layerId -> sample

/** Still boundary, px/tick on raw item-velocity units (see isSourceStill). */
export const SOURCE_STILL_SPEED = 0.05;
export const SOURCE_STILL_AGITATION = 0.05;
/** Past this age a sample reads as held, not live (pause/slowRender/freeze). */
export const PATCH_DIAG_STALE_MS = 2000;

export function recordPatchSample(layerId, sample) {
  samples.set(layerId, { at: Date.now(), ...sample });
}

export function getPatchSample(layerId) {
  return samples.get(layerId) || null;
}

export function patchSampleAgeMs(layerId, now = Date.now()) {
  const s = samples.get(layerId);
  return s ? now - s.at : Infinity;
}

/**
 * A source with less motion than this drives nothing visible (see the
 * threshold derivation in the MOD-strength plan: every channel sub-visible
 * at the boundary). NaN coerces to 0 — an unreadable source reads still,
 * never throws.
 */
export function isSourceStill(speed, agitation) {
  return (Number(speed) || 0) < SOURCE_STILL_SPEED
    && (Number(agitation) || 0) < SOURCE_STILL_AGITATION;
}

const finite = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * Active patch pairs for the matrix overview (#509 phase 3): every content
 * layer with a live-pointing patch (mode on, target set, target not self).
 * Pure render of store state — liveness itself stays in the row lines (#507).
 */
export function activePatchPairs(layers) {
  const out = [];
  for (const l of layers || []) {
    if (!l || l.type === 'fx') continue;
    const p = l.patch;
    if (!p || p.mode === 'off' || !p.to || p.to === l.id) continue;
    out.push({ srcId: p.to, dstId: l.id, mode: p.mode, strength: finite(p.strength, 0.16) });
  }
  return out;
}

/**
 * One matrix row: `KC-2 → KC-1 · MOD · 0.50`. Ordinals passed in (never the
 * store); unknown ids read '?', never throw.
 */
export function formatMatrixRow({ srcId, dstId, mode, strength }, ordinals) {
  const get = (id) => (ordinals && ordinals.get(id)) ?? '?';
  return `KC-${get(srcId)} → KC-${get(dstId)} · ${String(mode).toUpperCase()} · ${finite(strength).toFixed(2)}`;
}

/**
 * One-line readout. Strength always 2dp; names are KC-n ordinals passed in
 * (this module never touches the store). Returns null when there is no
 * sample — the panel renders nothing, never "undefined".
 */
export function formatPatchLine({ srcN, dstN, mode, strength, sample, now }) {
  if (!sample) return null;
  const s = finite(strength).toFixed(2);
  const head = `KC-${srcN} → KC-${dstN} · ${String(mode).toUpperCase()} · ${s}`;
  const stale = now - sample.at > PATCH_DIAG_STALE_MS ? ' · held' : '';
  if (mode === 'field') {
    return `${head} · pull ${finite(sample.pullPx).toFixed(1)}px${stale}`;
  }
  if (mode === 'feed') {
    // Blend fraction = strength × 5% (amt = strength × 0.05 in liveResolve).
    return `${head} · blend ${(finite(strength) * 5).toFixed(1)}% · hop ${finite(sample.pullPx).toFixed(1)}px${stale}`;
  }
  if (mode === 'mod') {
    if (isSourceStill(sample.speed, sample.agitation)) {
      return `${head} · source still — strength held${stale}`;
    }
    // Nudge mirrors the resolver derivation exactly: min(4,displace) × 0.15.
    const nudge = Math.min(4, finite(sample.displace)) * 0.15;
    return `${head} · glow ${finite(sample.glow).toFixed(2)} · fade ${finite(sample.fade).toFixed(2)} · nudge ${nudge.toFixed(1)}px${stale}`;
  }
  return null;
}
