// beastSettings.mjs — the beast's roam and trace, and Davis's role deal, as settings a person can reach (#1867, #1868, #1945).
//
// Until now these lived only as document fields (`doc.beastRoam`, `doc.beastTrace`, `doc.davisRoleDeal`) and `window.__KC_*`
// switches. The store holds a small settings object; `beastDocFields` turns it into exactly those document fields — and
// returns NOTHING while every setting is at its default, so an untouched instrument builds the very contract (and hash)
// it built before. Pure; the ranges mirror engine/beastRoam.js and engine/beastTrace.js (their sanitizers clamp anyway).

import { BEAST_ROAM } from './beastRoam.js';
import { BEAST_TRACE } from './beastTrace.js';

export const BEAST_SETTING_DEFAULTS = Object.freeze({
  roam: true, // false = the beast walks in place
  turnGain: BEAST_ROAM.turnGain, // how hard it turns
  trace: true, // false = the feet leave no trace
  traceAlpha: BEAST_TRACE.alpha, // how dark a fresh trace is
  traceFade: BEAST_TRACE.fade, // seconds a trace takes to fall by 1/e
  traceCount: BEAST_TRACE.count, // the most traces alive at once
  davisRoleDeal: true, // false = Davis deals by the old rule, not by role fit
});

export const BEAST_SETTING_RANGES = Object.freeze({
  turnGain: { min: 0, max: 1, step: 0.05 },
  traceAlpha: { min: 0, max: 1, step: 0.05 },
  traceFade: { min: 1, max: 30, step: 1 },
  traceCount: { min: 0, max: 24, step: 1 },
});

/** A settings object from anything: unknown keys dropped, numbers clamped, booleans strict, junk → the default. */
export function sanitizeBeastSettings(raw) {
  const out = { ...BEAST_SETTING_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of ['roam', 'trace', 'davisRoleDeal']) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  for (const [k, r] of Object.entries(BEAST_SETTING_RANGES)) {
    const v = Number(raw[k]);
    if (raw[k] != null && raw[k] !== '' && Number.isFinite(v)) out[k] = Math.min(r.max, Math.max(r.min, v));
  }
  out.traceCount = Math.round(out.traceCount);
  return out;
}

/** The document fields these settings stand for. Default settings → {} (no keys, the contract unchanged). */
export function beastDocFields(raw) {
  const s = sanitizeBeastSettings(raw);
  const d = BEAST_SETTING_DEFAULTS;
  const out = {};
  if (!s.roam) out.beastRoam = false;
  else if (s.turnGain !== d.turnGain) out.beastRoam = { turnGain: s.turnGain };
  if (!s.trace) out.beastTrace = false;
  else {
    const t = {};
    if (s.traceAlpha !== d.traceAlpha) t.alpha = s.traceAlpha;
    if (s.traceFade !== d.traceFade) t.fade = s.traceFade;
    if (s.traceCount !== d.traceCount) t.count = s.traceCount;
    if (Object.keys(t).length) out.beastTrace = t;
  }
  if (!s.davisRoleDeal) out.davisRoleDeal = false;
  return out;
}
