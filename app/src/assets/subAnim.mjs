/**
 * subAnim.mjs — asset sub-animation: baked frame strips.
 *
 * Animation INSIDE an asset (a dial's needle sweeping while the dial body
 * stays put, chevrons chasing, a dot pulsing). The WebGL live loop never
 * rasterizes per frame, so sub-animation is pre-baked: each rig is sampled
 * at N evenly spaced times and every frame becomes its own atlas cell
 * (`<baseId>__f0 … __fN`). Per tick the worker only rewrites the instance's
 * asset id to the current frame id — a string swap, no geometry work.
 *
 * Pure module: no DOM, no canvas. Importable from the render worker AND
 * from node selfchecks.
 *
 * Rig format (on the asset): `sub: { frames, period, rig }`
 *   frames: number of baked frames (≥2)
 *   period: seconds per full loop
 *   rig:    [ { svg, anim }, … ] — anim kinds:
 *     spin  — rotate 360° per period (e.g. dial needle)
 *     osc   — rotate ±amp degrees sinusoidally
 *     pulse — scale 1±amp sinusoidally about (50,50)
 *     blink — hard on/off square wave; `phase` offsets the window (chevron chase)
 *     march — translate -x by up to `amp` units per period, wrapping;
 *             seamless when the motif repeats every `amp` units
 *   First rig entry may be { svg, anim: null } = static base layer.
 *   Layer `phase` is in periods (0.5 = half a period later).
 *
 * Governor: an animated asset bakes `frames` atlas cells, so its cost is
 * ~frames × the static cost. getAssetCost() in cost.js multiplies accordingly.
 */

import { PRIMITIVES, polyInner } from './primitives.js';

const R2 = (n) => {
  const r = Math.round(Number(n) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

export const frameId = (baseId, i) => `${baseId}__f${i}`;

const FRAME_SUFFIX_RE = /__f(\d+)$/;
/** Strip a baked frame suffix: 'anim_dial_01__f3' -> 'anim_dial_01'. */
export function baseAssetId(id) {
  return String(id).replace(FRAME_SUFFIX_RE, '');
}
/** Frame index embedded in an id, or -1 for a base (non-frame) id. */
export function frameIndexOf(id) {
  const m = FRAME_SUFFIX_RE.exec(String(id));
  return m ? Number(m[1]) : -1;
}

function normSub(sub) {
  const frames = Math.max(2, Math.floor(Number(sub?.frames) || 8));
  const period = Number(sub?.period) > 0 ? Number(sub.period) : 1.6;
  return { frames, period };
}

/** Transform string for one rig layer at time t (seconds). '' = static, 'HIDE' = blink-off. */
function layerTransform(anim, t, period) {
  if (!anim || !anim.kind) return '';
  const tt = t + (Number(anim.phase) || 0) * period;
  const amp = Number(anim.amp) || 0;
  switch (anim.kind) {
    case 'spin': {
      const deg = (((tt / period) * 360) % 360 + 360) % 360;
      return `rotate(${R2(deg)} 50 50)`;
    }
    case 'osc': {
      const deg = Math.sin((tt / period) * Math.PI * 2) * amp;
      return `rotate(${R2(deg)} 50 50)`;
    }
    case 'pulse': {
      const s = 1 + Math.sin((tt / period) * Math.PI * 2) * amp;
      return `translate(50 50) scale(${R2(s)}) translate(-50 -50)`;
    }
    case 'blink': {
      const on = ((((tt / period) % 1) + 1) % 1) < 0.5;
      return on ? '' : 'HIDE';
    }
    case 'march': {
      const span = amp > 0 ? amp : 100;
      const dx = -((((tt / period) * span) % span) + span) % span;
      return `translate(${R2(dx)} 0)`;
    }
    default:
      return '';
  }
}

/**
 * Sample a rig at time t (seconds) -> static SVG fragment string.
 * Same <g transform> composition pattern as AssetStudioModal's toSvg.
 */
export function sampleRig(rig, t, period) {
  if (!Array.isArray(rig) || rig.length === 0) return '';
  const p = Number(period) > 0 ? Number(period) : 1.6;
  return rig
    .map((layer) => {
      if (!layer || !layer.svg) return '';
      const tr = layerTransform(layer.anim, Number(t) || 0, p);
      if (tr === 'HIDE') return '';
      return tr ? `<g transform="${tr}">${layer.svg}</g>` : layer.svg;
    })
    .join('');
}

/** Expand an asset's rig into baked frames: [{ id: '<id>__fN', svg }, …]. [] when no rig. */
export function expandSubFrames(asset) {
  const sub = asset?.sub;
  if (!sub || !Array.isArray(sub.rig) || sub.rig.length === 0) return [];
  const { frames, period } = normSub(sub);
  const out = [];
  for (let i = 0; i < frames; i++) {
    out.push({ id: frameId(asset.id, i), svg: sampleRig(sub.rig, (i / frames) * period, period) });
  }
  return out;
}

/** Which frame index to show at time tSec (seconds), with a per-instance phase offset. */
export function frameIndexFor(sub, tSec, phase = 0) {
  const { frames, period } = normSub(sub);
  const tt = ((((Number(tSec) || 0) + (Number(phase) || 0)) % period) + period) % period;
  // Epsilon: binary float can land a hair below an exact frame boundary
  // (e.g. 0.2/1.6*8 = 0.9999999999); snap boundaries forward.
  return Math.floor((tt / period) * frames + 1e-6) % frames;
}

/**
 * Deterministic phase offset in [0, period) from instance identity, so
 * copies of one animated asset don't move in lockstep.
 */
export function phaseFor(sub, seedOffset, key) {
  const { period } = normSub(sub);
  const s = `${seedOffset ?? ''}:${key ?? ''}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (((h >>> 0) % 1000) / 1000) * period;
}

// ---------------------------------------------------------------------------
// Asset Studio bridge: studio parts -> rig. Pure (no DOM), so the filmstrip
// preview and the selfchecks share exactly the bake logic.
// ---------------------------------------------------------------------------

function axesOf(p) {
  return { sx: p.sx ?? p.scale ?? 1, sy: p.sy ?? p.scale ?? 1 };
}
/** Scale axes for a studio part (sx/sy with legacy `scale` fallback). */
export const partAxes = axesOf;

function innerForPart(p) {
  if (p.kind === 'poly') return polyInner(p.n);
  if (p.kind === 'merged') return p.svg || '';
  return PRIMITIVES[p.kind] || p.svg || '';
}

/** One studio part rendered to its static SVG fragment (transforms baked in). */
export function studioPartSvg(p) {
  const token = p.token === 'accent' ? 'var(--accent)' : 'var(--ink)';
  const paint = p.stroke
    ? `color: ${token}; fill: none; stroke: currentColor; stroke-width: 3`
    : `color: ${token}`;
  const { sx, sy } = axesOf(p);
  return `<g style="${paint}" transform="translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${sx} ${sy}) translate(-50 -50)">${innerForPart(p)}</g>`;
}

/** Studio parts -> rig layers. Parts whose anim kind is 'none'/missing become static layers. */
export function rigFromStudioParts(parts) {
  return (parts || []).map((p) => ({
    svg: studioPartSvg(p || {}),
    anim: p?.anim?.kind && p.anim.kind !== 'none'
      ? { kind: String(p.anim.kind), amp: Number(p.anim.amp) || 0, phase: Number(p.anim.phase) || 0 }
      : null,
  }));
}

/** True when at least one studio part carries a live anim kind. */
export function hasRig(parts) {
  return (parts || []).some((p) => p?.anim?.kind && p.anim.kind !== 'none');
}

const ANIM_KINDS = new Set(['none', 'spin', 'osc', 'pulse', 'blink', 'march']);

/**
 * Validate a `sub` rig coming from storage (project reload). Returns a clean
 * copy or null. Malformed rigs fail closed: the asset renders statically.
 */
export function validSubRig(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const frames = Math.floor(Number(sub.frames));
  const period = Number(sub.period);
  if (!Array.isArray(sub.rig) || sub.rig.length === 0) return null;
  if (!(frames >= 2 && frames <= 64)) return null;
  if (!(period > 0 && period <= 60)) return null;
  const rig = [];
  for (const l of sub.rig) {
    if (!l || typeof l.svg !== 'string' || !l.svg) return null;
    const a = l.anim;
    const anim = a && typeof a === 'object' && ANIM_KINDS.has(a.kind) && a.kind !== 'none'
      ? { kind: a.kind, amp: Number(a.amp) || 0, phase: Number(a.phase) || 0 }
      : null;
    rig.push({ svg: l.svg, anim });
  }
  if (!rig.some((l) => l.anim)) return null;
  return { frames, period, rig };
}
