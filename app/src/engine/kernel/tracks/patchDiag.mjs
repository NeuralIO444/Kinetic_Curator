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
// removed layers are never read.
//
// Boundedness (#1246): the primary bound is delete-on-layer-remove —
// `removePatchSample` is called from the store's `removeLayer` action, so a
// removed layer's sample dies with it. `PATCH_DIAG_MAX_SAMPLES` is the
// backstop for id churn that never hits the remove hook (undo/project-load
// restore the layer list wholesale); hitting the cap evicts the
// least-recently-recorded entry. Diagnostics only — eviction never touches
// simulation state.

const samples = new Map(); // layerId -> sample

/** Hard backstop on live samples entries (#1246). Live layer count is
 * capped (4 content + 4 fx + 4 math + pattern ≈ 13); 32 leaves headroom so
 * eviction only ever fires on hook-bypassing id churn, never on live ids. */
export const PATCH_DIAG_MAX_SAMPLES = 32;
/**
 * #1245 — unknown sampler-mode fallback diagnostics. Kept OUT of the patch
 * `samples` map: a fallback is not a patch sample, and writing there would
 * clobber the layer's live patch line. Keyed by layerId like `samples` so
 * the delete-on-layer-remove policy (#1246) covers both maps. The instrument
 * reads this to show which layer silently fell back to 'random' — console
 * alone is not visible on the desk.
 */
const samplerFallbacks = new Map(); // layerId -> { mode, at }

export function recordSamplerFallback(layerId, mode) {
  samplerFallbacks.set(layerId ?? '?', { mode: String(mode), at: Date.now() });
}

export function getSamplerFallback(layerId) {
  return samplerFallbacks.get(layerId ?? '?') || null;
}

/** Still boundary, px/tick on raw item-velocity units (see isSourceStill). */
export const SOURCE_STILL_SPEED = 0.05;
export const SOURCE_STILL_AGITATION = 0.05;
/** Past this age a sample reads as held, not live (pause/slowRender/freeze). */
export const PATCH_DIAG_STALE_MS = 2000;

export function recordPatchSample(layerId, sample) {
  // Refresh recency: a live patched layer records every tick, so the
  // eviction victim below is always an entry nobody is refreshing — a live
  // layer the artist is watching is never evicted.
  if (samples.has(layerId)) samples.delete(layerId);
  else if (samples.size >= PATCH_DIAG_MAX_SAMPLES) {
    // Map preserves insertion order: the first key is the least-recently-recorded.
    samples.delete(samples.keys().next().value);
  }
  samples.set(layerId, { at: Date.now(), ...sample });
}

/**
 * Layer-lifecycle hook (#1246): drop the sample when its layer is removed.
 * Called from the store's `removeLayer` action — the single removal funnel.
 */
export function removePatchSample(layerId) {
  samples.delete(layerId);
}

/** Live entry count — exposed for the #1246 bound torture test. */
export function patchDiagSampleCount() {
  return samples.size;
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
