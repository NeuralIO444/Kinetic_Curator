/**
 * TrackGraph — KC-1 coupling kernel (#343 MOD / #344 FIELD / #345 FEED).
 *
 * FEED encoding is curl (see feedOps.js). Delay-1: sample field, then push.
 */
import { lumaToFlow as encodeLuma } from './feedOps.js';

export const MAX_TRACKS = 4;
export const PATCH_MODES = Object.freeze(['off', 'mod', 'field', 'feed']);
export const FEED_POLICY = 'delay-1';
export const FEED_SCALE = 0.25;

export function lumaToFlow(luma, w, h, op) {
  return encodeLuma(luma, w, h, op);
}

export function clampTrackId(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_TRACKS - 1, v | 0));
}

export function normalizePatch(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const mode = PATCH_MODES.includes(src.mode) ? src.mode : 'off';
  const from = clampTrackId(src.from);
  let to = clampTrackId(src.to);
  if (to === from) to = (from + 1) % MAX_TRACKS;
  const strength = Number.isFinite(Number(src.strength)) ? Number(src.strength) : 1;
  const polarity = src.polarity === -1 || src.polarity === 'repel' ? -1 : 1;
  return {
    from,
    to,
    mode: mode === 'off' ? 'off' : mode,
    strength: Math.max(0, Math.min(4, strength)),
    polarity,
  };
}

export function emptyTrack(id) {
  return {
    id: clampTrackId(id),
    armed: id === 0,
    patch: normalizePatch({ from: id, to: (clampTrackId(id) + 1) % MAX_TRACKS, mode: 'off' }),
  };
}

export function normalizeTrackGraph(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const incoming = Array.isArray(src.tracks) ? src.tracks : [];
  const tracks = [];
  for (let i = 0; i < MAX_TRACKS; i++) {
    const t = incoming[i] && typeof incoming[i] === 'object' ? incoming[i] : {};
    const patch = normalizePatch({ ...t.patch, from: i, to: t.patch?.to ?? (i + 1) % MAX_TRACKS });
    tracks.push({
      id: i,
      armed: i === 0 ? true : !!t.armed,
      patch,
    });
  }
  return { tracks, feedPolicy: FEED_POLICY };
}

export function activePatches(graph) {
  const g = normalizeTrackGraph(graph);
  return g.tracks.map((t) => t.patch).filter((p) => p.mode !== 'off' && g.tracks[p.from].armed);
}

export function patchEdges(graph) {
  return activePatches(graph).map((p) => ({ from: p.from, to: p.to, mode: p.mode }));
}

export function hasCycle(edges) {
  const adj = new Map();
  for (let i = 0; i < MAX_TRACKS; i++) adj.set(i, []);
  for (const e of edges) adj.get(e.from).push(e.to);
  const state = new Map();
  function dfs(n) {
    const s = state.get(n) || 0;
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(n, 1);
    for (const m of adj.get(n)) if (dfs(m)) return true;
    state.set(n, 2);
    return false;
  }
  for (let i = 0; i < MAX_TRACKS; i++) if (dfs(i)) return true;
  return false;
}

export function liveEdges(graph) {
  return patchEdges(graph).filter((e) => e.mode !== 'feed');
}

export function scheduleFrame(graph) {
  const g = normalizeTrackGraph(graph);
  const live = liveEdges(g);
  const cyclic = hasCycle(live);
  const feeds = activePatches(g).filter((p) => p.mode === 'feed');
  return {
    order: g.tracks.map((t) => t.id),
    live,
    feeds,
    cyclic,
    feedPolicy: FEED_POLICY,
  };
}

export function motionMetrics(points) {
  const pts = Array.isArray(points) ? points : [];
  const n = pts.length;
  if (!n) return { cx: 0.5, cy: 0.5, vx: 0, vy: 0, speed: 0, agitation: 0, density: 0 };
  let sx = 0, sy = 0, svx = 0, svy = 0, energy = 0;
  for (const p of pts) {
    sx += Number(p.x) || 0;
    sy += Number(p.y) || 0;
    const vx = Number(p.vx) || 0;
    const vy = Number(p.vy) || 0;
    svx += vx;
    svy += vy;
    energy += vx * vx + vy * vy;
  }
  return {
    cx: sx / n,
    cy: sy / n,
    vx: svx / n,
    vy: svy / n,
    speed: Math.hypot(svx / n, svy / n),
    agitation: Math.sqrt(energy / n),
    density: n / MAX_TRACKS,
  };
}

export function applyMod(knobs, metrics, patch) {
  const p = normalizePatch(patch);
  if (p.mode !== 'mod') return { ...knobs };
  const m = metrics || motionMetrics([]);
  const k = knobs && typeof knobs === 'object' ? { ...knobs } : {};
  const amt = p.strength * p.polarity;
  if (Number.isFinite(k.glow)) k.glow = clamp01((k.glow ?? 0) + m.agitation * amt * 0.25);
  if (Number.isFinite(k.fade)) k.fade = clamp01((k.fade ?? 0) + m.speed * amt * 0.15);
  if (Number.isFinite(k.displace)) k.displace = Math.max(0, (k.displace ?? 0) + m.agitation * amt * 8);
  return k;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function applyField(targetPts, sourcePts, patch) {
  const p = normalizePatch(patch);
  if (p.mode !== 'field') return targetPts.map((q) => ({ ...q }));
  const src = Array.isArray(sourcePts) ? sourcePts : [];
  if (!src.length) return targetPts.map((q) => ({ ...q }));
  const gain = 0.002 * p.strength * p.polarity;
  return targetPts.map((q) => {
    let ax = 0, ay = 0;
    for (const s of src) {
      const dx = (Number(s.x) || 0) - (Number(q.x) || 0);
      const dy = (Number(s.y) || 0) - (Number(q.y) || 0);
      const d2 = dx * dx + dy * dy + 1e-4;
      ax += dx / d2;
      ay += dy / d2;
    }
    return { ...q, x: (Number(q.x) || 0) + ax * gain, y: (Number(q.y) || 0) + ay * gain };
  });
}

export function sampleFlow(field, u, v) {
  if (!field || !field.w || !field.h) return { x: 0, y: 0 };
  const x = Math.max(0, Math.min(field.w - 1, u * (field.w - 1)));
  const y = Math.max(0, Math.min(field.h - 1, v * (field.h - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.w - 1, x0 + 1);
  const y1 = Math.min(field.h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i = (xx, yy) => (yy * field.w + xx) * 2;
  const mix = (a, b, t) => a + (b - a) * t;
  const fx0 = mix(field.flow[i(x0, y0)], field.flow[i(x1, y0)], tx);
  const fy0 = mix(field.flow[i(x0, y0) + 1], field.flow[i(x1, y0) + 1], tx);
  const fx1 = mix(field.flow[i(x0, y1)], field.flow[i(x1, y1)], tx);
  const fy1 = mix(field.flow[i(x0, y1) + 1], field.flow[i(x1, y1) + 1], tx);
  return { x: mix(fx0, fx1, ty), y: mix(fy0, fy1, ty) };
}

export function applyFeed(targetPts, field, patch) {
  const p = normalizePatch(patch);
  if (p.mode !== 'feed') return targetPts.map((q) => ({ ...q }));
  const amt = p.strength * p.polarity;
  return targetPts.map((q) => {
    const f = sampleFlow(field, Number(q.x) || 0, Number(q.y) || 0);
    return { ...q, x: (Number(q.x) || 0) + f.x * amt, y: (Number(q.y) || 0) + f.y * amt };
  });
}

export function feedTextureBytes(frameW, frameH) {
  const w = Math.max(1, Math.round((frameW || 0) * FEED_SCALE));
  const h = Math.max(1, Math.round((frameH || 0) * FEED_SCALE));
  return w * h * 8;
}

export function tapePreflight(graph, { frameW = 1920, frameH = 1080, budgetBytes = Infinity } = {}) {
  const g = normalizeTrackGraph(graph);
  const feeds = activePatches(g).filter((p) => p.mode === 'feed');
  const extra = feeds.length * feedTextureBytes(frameW, frameH);
  const live = liveEdges(g);
  return {
    extraBytes: extra,
    feedCount: feeds.length,
    cyclic: hasCycle(live),
    tapeFull: extra > budgetBytes || hasCycle(live),
  };
}
