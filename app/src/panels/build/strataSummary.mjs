// strataSummary.mjs — the block stack's one-line amber param summary (#1203).
// Pure: each stratum type reduces its loudest 1–2 params to a short line shown
// when the block is collapsed ("pull 0.6 · heroes 3"). The expanded block shows
// the real controls instead, so the summary never has to be complete — just
// the fastest read of what the stratum is doing.

import { MATH_EFFECT_DEFS, formatMathParam } from '../../fx/mathFilters.js';
import { FX_EFFECT_DEFS } from '../../fx/fxFilters.js';
import { sanitizePattern } from '../../state/patternTrack.js';

/** Compact number: integers plain, floats trimmed ("18", "0.6", "0.35"). */
export function trimNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

const firstTwoParams = (entries) => entries.slice(0, 2);

/** MATH: the first op's first two knobs ("pull 0.6 · heroes 3"). */
function mathSummary(layer) {
  const op = (layer.effects || [])[0];
  if (!op) return '';
  const def = MATH_EFFECT_DEFS[op.kind];
  if (!def) return '';
  const parts = firstTwoParams(Object.entries(def.params)).map(([key, p]) => {
    const v = op.params?.[key] ?? p.def;
    return `${String(p.label).toLowerCase()} ${formatMathParam(op.kind, key, v)}`;
  });
  return parts.join(' · ');
}

/** FX: the first filled effect's first two knobs ("bands 18 · amount 12"). */
function fxSummary(layer) {
  const fx = (layer.effects || [])[0];
  if (fx) {
    const def = FX_EFFECT_DEFS[fx.kind];
    if (def) {
      const parts = firstTwoParams(Object.entries(def.params)).map(([key, p]) => {
        const v = fx.params?.[key] ?? p.def;
        return `${String(p.label).toLowerCase()} ${trimNum(v)}`;
      });
      if (parts.length) return parts.join(' · ');
    }
  }
  return '';
}

/** PATTERN: density + mode ("cells 9 · quilt"). */
function patternSummary(layer) {
  const p = sanitizePattern(layer.pattern);
  // #1834 — FEEDS ACCUM off confesses (the #1409 rule below): the stratum
  // still paints the stage but leaves no trails.
  return `cells ${p.density} · ${String(p.mode).toLowerCase()}${layer.feedsAccum === false ? ' · no feed' : ''}`;
}

/** CONTENT (KC): patch state, else blend, always wet ("screen · wet 80%"). */
function contentSummary(layer, wetPct, dishState) {
  const patch = layer.patch;
  const parts = [];
  if (patch && patch.mode && patch.mode !== 'off') parts.push(`patch ${patch.mode}`);
  // #1834 — FEEDS ACCUM off joins the confessions (#1409's rule: an OFF
  // choice the collapsed block must state): this stratum renders on stage
  // but feeds the trails buffer nothing.
  if (layer.feedsAccum === false) parts.push('no feed');
  // #1814 — WET interaction mode on joins the line the same way: an ON
  // choice the collapsed block must state (the mode is invisible in the
  // block's own chrome otherwise).
  if (layer.wetSoak === true) parts.push('wet soak');
  // #1409 — the dish state joins the line only when it says something:
  // OFF is an artistic choice the collapsed block must confess (this
  // stratum ghosts through its neighbours), and ON shows only when this
  // Look actually arms contacts (contact radius > 0). ON + radius 0 is
  // the silent default — the line stays exactly what it was pre-A3.
  if (dishState) {
    if (!dishState.on) parts.push('dish off');
    else if (dishState.armed) parts.push('dish on');
  }
  const blend = layer.layerBlendMode;
  if (blend && blend !== 'normal') parts.push(blend);
  parts.push(`wet ${wetPct}%`);
  return parts.slice(0, 2).join(' · ');
}

/**
 * @param {object} layer the stratum's layer record
 * @param {'math'|'fx'|'content'} fine the stratum's fine class (pattern → content)
 * @param {number} wetPct rounded wet percent for the wet-bearing summaries
 * @param {{on: boolean, armed: boolean}} [dishState] #1409 — the Look's dish
 *   state for CONTENT strata (omitted by FX/MATH/PATTERN callers)
 * @returns {string} the collapsed one-liner, or '' when there is nothing to say
 */
export function strataSummary(layer, fine, wetPct, dishState) {
  if (!layer) return '';
  if (fine === 'math') return mathSummary(layer);
  if (fine === 'fx') {
    const s = fxSummary(layer);
    return s || `wet ${wetPct}%`;
  }
  if (layer.type === 'pattern') return patternSummary(layer);
  return contentSummary(layer, wetPct, dishState);
}
