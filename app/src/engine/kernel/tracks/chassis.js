/**
 * KC-1 chassis (#339–#342) — data only.
 * One tape: tapeState() = workingSetBytes + live-edge cycle.
 */
import {
  MAX_TRACKS,
  normalizeTrackGraph,
  feedTextureBytes,
  activePatches,
  liveEdges,
  hasCycle,
} from './trackGraph.js';

export { MAX_TRACKS };

export const TRACK_LABELS = Object.freeze(['KC-1', 'KC-2', 'KC-3', 'KC-4']);
export const MAX_FX_SLOTS = 4;
export const FX_LABELS = Object.freeze(['FX-1', 'FX-2', 'FX-3', 'FX-4']);

export const BUDGET_CEILINGS = Object.freeze({
  FULL: { qualityId: 'high', bytes: 48 * 1024 * 1024 },
  SHOW: { qualityId: 'balanced', bytes: 24 * 1024 * 1024 },
  LEAN: { qualityId: 'performance', bytes: 8 * 1024 * 1024 },
});

export const TRACK_BASE_BYTES = 8 * 1024 * 1024;
export const FX_BASE_BYTES = 8 * 1024 * 1024;

export function trackLabel(id) {
  return TRACK_LABELS[id] || `KC-${(id | 0) + 1}`;
}

export function fxLabel(id) {
  return FX_LABELS[id] || `FX-${(id | 0) + 1}`;
}

function ceilingKey(name) {
  const key = String(name || 'SHOW').toUpperCase();
  return BUDGET_CEILINGS[key] ? key : 'SHOW';
}

function ceilingOf(name) {
  return BUDGET_CEILINGS[ceilingKey(name)];
}

export function slotsHeld(ceiling, unitBytes = TRACK_BASE_BYTES) {
  const cap = ceilingOf(ceiling);
  return Math.max(0, Math.floor(cap.bytes / unitBytes));
}

export function missingRoomCopy(ceiling, unit = 'track') {
  const n = Math.min(MAX_TRACKS, slotsHeld(ceiling));
  const noun = n === 1 ? unit : `${unit}s`;
  return `${ceilingKey(ceiling)} holds ${n} ${noun}. Raise the ceiling or shed.`;
}

export function boardFullCopy(kind = 'track') {
  const n = kind === 'fx' ? MAX_FX_SLOTS : MAX_TRACKS;
  const noun = kind === 'fx' ? 'FX' : 'tracks';
  return `The board holds ${n} ${noun}. Shed one.`;
}

export function normalizeFxSlots(raw) {
  const incoming = Array.isArray(raw) ? raw : raw?.slots;
  const list = Array.isArray(incoming) ? incoming : [];
  const slots = [];
  for (let i = 0; i < MAX_FX_SLOTS; i++) {
    const s = list[i] && typeof list[i] === 'object' ? list[i] : {};
    slots.push({ id: i, armed: !!s.armed, label: FX_LABELS[i] });
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

export function slotCostBytes(armed) {
  return armed ? TRACK_BASE_BYTES : 0;
}

export function fxSlotCostBytes(armed) {
  return armed ? FX_BASE_BYTES : 0;
}

export function feedExtraBytes(graph, frameW = 1920, frameH = 1080) {
  const g = normalizeTrackGraph(graph);
  const feeds = activePatches(g).filter((p) => p.mode === 'feed');
  return feeds.length * feedTextureBytes(frameW, frameH);
}

export function workingSetBytes(graph, fx, { frameW = 1920, frameH = 1080 } = {}) {
  const g = normalizeTrackGraph(graph);
  const f = normalizeFxSlots(fx);
  let bytes = 0;
  for (const t of g.tracks) if (t.armed) bytes += TRACK_BASE_BYTES;
  for (const s of f.slots) if (s.armed) bytes += FX_BASE_BYTES;
  bytes += feedExtraBytes(g, frameW, frameH);
  return bytes;
}

/** Product tape. trackGraph.tapePreflight stays feed+cycle for the kernel. */
export function tapeState(graph, fx, { frameW = 1920, frameH = 1080, ceiling = 'SHOW' } = {}) {
  const used = workingSetBytes(graph, fx, { frameW, frameH });
  const cap = ceilingOf(ceiling);
  const cyclic = hasCycle(liveEdges(graph));
  const extraFeed = feedExtraBytes(graph, frameW, frameH);
  return {
    used,
    budget: cap.bytes,
    extraFeed,
    cyclic,
    tapeFull: used > cap.bytes || cyclic,
  };
}

export function canArmTrack(graph, fx, trackId, ceiling = 'SHOW') {
  const g = normalizeTrackGraph(graph);
  const id = trackId | 0;
  if (id < 0 || id >= MAX_TRACKS) {
    return { ok: false, reason: 'TAPE FULL', detail: boardFullCopy('track') };
  }
  if (g.tracks[id].armed) return { ok: true, already: true, reason: null };
  const next = { tracks: g.tracks.map((t) => (t.id === id ? { ...t, armed: true } : t)) };
  const tape = tapeState(next, fx, { ceiling });
  if (tape.tapeFull) {
    return {
      ok: false,
      reason: 'TAPE FULL',
      detail: tape.cyclic ? boardFullCopy('track') : missingRoomCopy(ceiling, 'track'),
      used: tape.used,
      budget: tape.budget,
    };
  }
  return { ok: true, reason: null, used: tape.used, budget: tape.budget };
}

export function canArmFx(graph, fx, fxId, ceiling = 'SHOW') {
  const f = normalizeFxSlots(fx);
  const id = fxId | 0;
  if (id < 0 || id >= MAX_FX_SLOTS) {
    return { ok: false, reason: 'TAPE FULL', detail: boardFullCopy('fx') };
  }
  if (f.slots[id].armed) return { ok: true, already: true, reason: null };
  const next = { slots: f.slots.map((s) => (s.id === id ? { ...s, armed: true } : s)) };
  const tape = tapeState(graph, next, { ceiling });
  if (tape.tapeFull) {
    return {
      ok: false,
      reason: 'TAPE FULL',
      detail: tape.cyclic ? boardFullCopy('fx') : missingRoomCopy(ceiling, 'FX'),
      used: tape.used,
      budget: tape.budget,
    };
  }
  return { ok: true, reason: null, used: tape.used, budget: tape.budget };
}

export function armTrack(graph, fx, trackId, ceiling = 'SHOW') {
  const gate = canArmTrack(graph, fx, trackId, ceiling);
  const g = normalizeTrackGraph(graph);
  if (!gate.ok || gate.already) return { ...gate, graph: g };
  const id = trackId | 0;
  return {
    ...gate,
    graph: { ...g, tracks: g.tracks.map((t) => (t.id === id ? { ...t, armed: true } : t)) },
  };
}

export function armFx(graph, fx, fxId, ceiling = 'SHOW') {
  const gate = canArmFx(graph, fx, fxId, ceiling);
  const f = normalizeFxSlots(fx);
  if (!gate.ok || gate.already) return { ...gate, fx: f };
  const id = fxId | 0;
  return {
    ...gate,
    fx: { slots: f.slots.map((s) => (s.id === id ? { ...s, armed: true } : s)) },
  };
}

export function addControlState(graph) {
  if (armedTrackCount(graph) >= MAX_TRACKS) {
    return { enabled: false, reason: boardFullCopy('track') };
  }
  return { enabled: true, reason: null };
}

export function addFxControlState(fx) {
  if (armedFxCount(fx) >= MAX_FX_SLOTS) {
    return { enabled: false, reason: boardFullCopy('fx') };
  }
  return { enabled: true, reason: null };
}
