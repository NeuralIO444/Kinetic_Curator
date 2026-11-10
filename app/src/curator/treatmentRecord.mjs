// treatmentRecord.mjs — #2010 (RAY GUN line, slice 1: treatment bus records): a take carries its treatment ACTS.
//
// Ruled 2026-11-06 (D4, docs/design/raygun-headroom-2026-11-06.md §8d/§9 F8): the bus is built before the cross-system
// engines, so every engine flow is born LOG-ACCOUNTABLE — the fourth leg of the DISH LIFE admission test. This is the
// recording listener: the take's `treatments` section, fed by the bus (treatment:arm / :disarm / :verdict), keyed by
// frame — the gesture section's shape (gl/gestureRecord.mjs).
//
// THE RECORD IS NOT THE AUTHORITY. Unlike the gestures section, nothing replays FROM this: a treatment's replay
// authority is the record on the form (layoutParams.fieldForm.raygun), which already rides every resolver input the
// take holds. This section answers "who armed what, when, and why" — accountability, not state. Playback never
// consults it to apply anything (the constitution's line: the bus announces, it never carries state), and a take
// without the section plays exactly as before. `treatmentAt` folds it for READING (a scrub readout, a review) only.
//
// Events carry their cause: the bus envelope's meta.cause (performer | davis | director | lois | document). An event
// stamped `playback` is ignored — a take never records its own playback. Deliberate takes only: the retro ring
// carries none, like the other sections.

export const TREATMENT_RECORD_VERSION = 1;
/** Treatment acts are hand-fired or called a few times a minute. Far above any real take. */
export const TREATMENT_RECORD_MAX = 2000;
/** The surfaces a treatment can stand on. RAY GUN P3 widens this (creature / beast items); the record shape holds. */
export const TREATMENT_TARGETS = Object.freeze(['poem']);
/** Who may cause a treatment act. `document` = a change that came with the document (undo, a deal, a load). */
export const TREATMENT_CAUSES = Object.freeze(['performer', 'davis', 'director', 'lois', 'document']);

const KINDS = new Set(['arm', 'disarm', 'verdict']);
const isMode = (m) => typeof m === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(m);
const isSeed = (s) => Number.isInteger(s) && s >= 0 && s <= 0xffffffff;
const isTarget = (t) => TREATMENT_TARGETS.includes(t);
const isCause = (c) => TREATMENT_CAUSES.includes(c);

const isLife = (l) => l === 'bedrock' || l === 'seed';

/** A standing treatment record ({ mode, seed, life? }) as plain data, or null. `life` (#2010 P4) only when armed. */
export function treatmentState(r) {
  return r && typeof r === 'object' && isMode(r.mode) && isSeed(r.seed)
    ? { mode: r.mode, seed: r.seed, ...(isLife(r.life) ? { life: r.life } : {}) }
    : null;
}

/**
 * A bus payload + meta as one recordable entry (without the frame), or null:
 *   ['arm', target, mode, seed, cause] | ['disarm', target, mode, cause] | ['verdict', target, mode, verdict, cause]
 */
function entryOf(kind, p, meta) {
  if (!KINDS.has(kind) || !p || typeof p !== 'object') return null;
  const cause = meta && isCause(meta.cause) ? meta.cause : 'document';
  if (!isTarget(p.target) || !isMode(p.mode)) return null;
  // #2010 P4 — an arm carries the poem's `life` as a trailing field, only when armed: a life change alone is a re-arm
  // of the same mode and seed, and without it the log would read as a no-op. Entries without it are exactly as before.
  if (kind === 'arm')
    return isSeed(p.seed) ? ['arm', p.target, p.mode, p.seed, cause, ...(isLife(p.life) ? [p.life] : [])] : null;
  if (kind === 'disarm') return ['disarm', p.target, p.mode, cause];
  return isMode(p.verdict) ? ['verdict', p.target, p.mode, p.verdict, cause] : null;
}

/**
 * Recorder. `initial` is { [target]: { mode, seed } | null } — the treatments standing when the take begins, read
 * from the store (the one truth: the bus carries changes, not state). `getFrame()` is the take's current frame.
 * Feed it every treatment event off the bus: push(kind, payload, meta).
 */
export function createTreatmentRecorder({ initial = {}, getFrame = () => 0 } = {}) {
  const start = {};
  for (const t of TREATMENT_TARGETS) start[t] = treatmentState(initial && initial[t]);
  let lastFrame = 0;
  const events = [];
  return {
    push(kind, p, meta) {
      if (meta && meta.cause === 'playback') return; // a take never records its own playback
      const e = entryOf(kind, p, meta);
      if (!e || events.length >= TREATMENT_RECORD_MAX) return;
      const f = Math.max(lastFrame, getFrame() | 0); // frames only advance
      lastFrame = f;
      events.push([f, ...e]);
    },
    finish() {
      const init = {};
      for (const t of TREATMENT_TARGETS) init[t] = start[t] && { ...start[t] };
      return { version: TREATMENT_RECORD_VERSION, initial: init, events: events.map((e) => [...e]) };
    },
  };
}

/** Fail-closed shape check: the record, or null. */
export function checkTreatmentRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (r.version !== TREATMENT_RECORD_VERSION) return null;
  if (!r.initial || typeof r.initial !== 'object' || Array.isArray(r.initial)) return null;
  for (const t of Object.keys(r.initial)) {
    if (!isTarget(t)) return null;
    const v = r.initial[t];
    if (v !== null && !treatmentState(v)) return null;
    if (v && (v.life === undefined ? Object.keys(v).length !== 2 : Object.keys(v).length !== 3 || !isLife(v.life)))
      return null;
  }
  if (!Array.isArray(r.events) || r.events.length > TREATMENT_RECORD_MAX) return null;
  let prev = -1;
  for (const e of r.events) {
    if (!Array.isArray(e) || !Number.isInteger(e[0]) || e[0] < prev) return null;
    const [, kind, target, mode] = e;
    if (!KINDS.has(kind) || !isTarget(target) || !isMode(mode)) return null;
    if (
      kind === 'arm' &&
      ((e.length !== 6 && e.length !== 7) || !isSeed(e[4]) || !isCause(e[5]) || (e.length === 7 && !isLife(e[6])))
    )
      return null;
    if (kind === 'disarm' && (e.length !== 5 || !isCause(e[4]))) return null;
    if (kind === 'verdict' && (e.length !== 6 || !isMode(e[4]) || !isCause(e[5]))) return null;
    prev = e[0];
  }
  return r;
}

/**
 * READ-ONLY fold: the treatment standing on `target` at `frame`, as the log tells it ({ mode, seed } | null).
 * For readouts and reviews — never for playback (the form's own record is what replays).
 */
export function treatmentAt(record, target, frame) {
  let cur = record.initial && record.initial[target] ? { ...record.initial[target] } : null;
  for (const e of record.events) {
    if (e[0] > frame) break;
    if (e[2] !== target) continue;
    if (e[1] === 'arm') cur = { mode: e[3], seed: e[4], ...(e[6] ? { life: e[6] } : {}) };
    else if (e[1] === 'disarm') cur = null;
  }
  return cur;
}
