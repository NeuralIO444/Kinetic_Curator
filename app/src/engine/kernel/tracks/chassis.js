/**
 * KC-1 chassis (#339–#342) — data only.
 *
 * #339 branding constants (UI still owns the paint).
 * #340 4 content tracks; dimmed = present, unarmed, zero cost.
 * #341 4 FX slots; same pattern.
 * #342 TAPE FULL pre-flight before arm. Never mutes an already-live track.
 */
import {
  MAX_TRACKS,
  normalizeTrackGraph,
  feedTextureBytes,
  activePatches,
} from './trackGraph.js';

export { MAX_TRACKS };

export const TRACK_LABELS = Object.freeze(['KC-1', 'KC-2', 'KC-3', 'KC-4']);
export const MAX_FX_SLOTS = 4;
export const FX_LABELS = Object.freeze(['FX-1', 'FX-2', 'FX-3', 'FX-4']);

/** Presenter names only — quality ids stay high/balanced/performance. */
export const BUDGET_CEILINGS = Object.freeze({
  FULL: { qualityId: 'high', bytes: 48 * 1024 * 1024 },
  SHOW: { qualityId: 'balanced', bytes: 24 * 1024 * 1024 },
  LEAN: { qualityId: 'performance', bytes: 8 * 1024 * 1024 },
});

/** Fixed working-set estimate for one armed content track at 1080p. */
export const TRACK_BASE_BYTES = 1920 * 1080 * 8; // one RGBA16F target
export const FX_BASE_BYTES = 1920 * 1080 * 8; // one extra composite target

export function trackLabel(id) {
  return TRACK_LABELS[id] || `KC-${(id | 0) + 1}`;
}

export function fxLabel(id) {
  return FX_LABELS[id] || `FX-${(id | 0) + 1}`;
}

export function normalizeFxSlots(raw) {
  const incoming = Array.isArray(raw) ? raw : raw?.slots;
  const list = Array.isArray(incoming) ? incoming : [];
  const slots = [];
  for (let i = 0; i < MAX_FX_SLOTS; i++) {
    const s = list[i] && typeof list[i] === 'object' ? list[i] : {};
    slots.push({
      id: i,
      armed: !!s.armed,
      label: FX_LABELS[i],
    });
  }
  return { slots };
}

export function dimmedTracks(graph) {
  return normalizeTrackGraph(graph).tracks.filter((t) => !t.armed);
}

export function dimmedFx(fx) {
  return normalizeFxSlots(fx).slots.filter((s) => !s.armed);
}

export function armedTrackCount(graph) {
  return normalizeTrackGraph(graph).tracks.filter((t) => t.armed).length;
}

export function armedFxCount(fx) {
  return normalizeFxSlots(fx).slots.filter((s) => s.armed).length;
}

/** Virtual slots cost nothing. */
export function slotCostBytes(armed) {
  return armed ? TRACK_BASE_BYTES : 0;
}

export function fxSlotCostBytes(armed) {
  return armed ? FX_BASE_BYTES : 0;
}

export function workingSetBytes(graph, fx, { frameW = 1920, frameH = 1080 } = {}) {
  const g = normalizeTrackGraph(graph);
  const f = normalizeFxSlots(fx);
  let bytes = 0;
  for (const t of g.tracks) if (t.armed) bytes += TRACK_BASE_BYTES;
  for (const s of f.slots) if (s.armed) bytes += FX_BASE_BYTES;
  const feeds = activePatches(g).filter((p) => p.mode === 'feed');
  bytes += feeds.length * feedTextureBytes(frameW, frameH);
  return bytes;
}

function ceilingOf(name) {
  const key = String(name || 'SHOW').toUpperCase();
  return BUDGET_CEILINGS[key] || BUDGET_CEILINGS.SHOW;
}

export function canArmTrack(graph, fx, trackId, ceiling = 'SHOW') {
  const g = normalizeTrackGraph(graph);
  const id = trackId | 0;
  if (id < 0 || id >= MAX_TRACKS) {
    return { ok: false, reason: 'TAPE FULL', detail: 'no such track' };
  }
  if (g.tracks[id].armed) return { ok: true, already: true, reason: null };
  const next = {
    tracks: g.tracks.map((t) => (t.id === id ? { ...t, armed: true } : t)),
  };
  const used = workingSetBytes(next, fx);
  const cap = ceilingOf(ceiling);
  if (used > cap.bytes) {
    return {
      ok: false,
      reason: 'TAPE FULL',
      detail: `${trackLabel(id)} exceeds ${String(ceiling).toUpperCase()} ceiling`,
      used,
      budget: cap.bytes,
    };
  }
  return { ok: true, reason: null, used, budget: cap.bytes };
}

export function canArmFx(graph, fx, fxId, ceiling = 'SHOW') {
  const f = normalizeFxSlots(fx);
  const id = fxId | 0;
  if (id < 0 || id >= MAX_FX_SLOTS) {
    return { ok: false, reason: 'TAPE FULL', detail: 'no such FX slot' };
  }
  if (f.slots[id].armed) return { ok: true, already: true, reason: null };
  const next = {
    slots: f.slots.map((s) => (s.id === id ? { ...s, armed: true } : s)),
  };
  const used = workingSetBytes(graph, next);
  const cap = ceilingOf(ceiling);
  if (used > cap.bytes) {
    return {
      ok: false,
      reason: 'TAPE FULL',
      detail: `${fxLabel(id)} exceeds ${String(ceiling).toUpperCase()} ceiling`,
      used,
      budget: cap.bytes,
    };
  }
  return { ok: true, reason: null, used, budget: cap.bytes };
}

export function armTrack(graph, fx, trackId, ceiling = 'SHOW') {
  const gate = canArmTrack(graph, fx, trackId, ceiling);
  const g = normalizeTrackGraph(graph);
  if (!gate.ok) return { ...gate, graph: g };
  if (gate.already) return { ...gate, graph: g };
  const id = trackId | 0;
  return {
    ...gate,
    graph: {
      ...g,
      tracks: g.tracks.map((t) => (t.id === id ? { ...t, armed: true } : t)),
    },
  };
}

export function armFx(graph, fx, fxId, ceiling = 'SHOW') {
  const gate = canArmFx(graph, fx, fxId, ceiling);
  const f = normalizeFxSlots(fx);
  if (!gate.ok) return { ...gate, fx: f };
  if (gate.already) return { ...gate, fx: f };
  const id = fxId | 0;
  return {
    ...gate,
    fx: {
      slots: f.slots.map((s) => (s.id === id ? { ...s, armed: true } : s)),
    },
  };
}

export function addControlState(graph) {
  const n = armedTrackCount(graph);
  if (n >= MAX_TRACKS) {
    return { enabled: false, reason: '4 tracks — the tape is full' };
  }
  return { enabled: true, reason: null };
}

export function addFxControlState(fx) {
  const n = armedFxCount(fx);
  if (n >= MAX_FX_SLOTS) {
    return { enabled: false, reason: '4 FX — the tape is full' };
  }
  return { enabled: true, reason: null };
}
