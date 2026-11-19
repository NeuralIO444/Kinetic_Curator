// personas/tuning.mjs — the Persona tuning table, `kc-persona-tuning/1` (spec: docs/design/persona-kernel-spec.md
// §3c; #2382). Every persona number lives here, in tuning.json, and the pure modules read it through this
// module — no persona number is hard-coded in a consumer any more.
//
// Two layers:
//   TUNING_DEFAULTS — the shipped table, deep-frozen. Its measured values are today's: the numbers the code
//     ran with before this table existed (LOIS's brake, the Queen's M1–M8 magnitudes, Davis's caps), so the
//     default behaviour is byte-identical. The band fields (solo length, odds, answer order, relation biases,
//     trade rate, the bandleader's cut) ship null: the band is a later phase, no value has been measured or
//     ruled for them, and a null here says exactly that — unruled, not zero. Nothing reads them yet.
//   Session overrides — DEV-mode live edits, held in memory only. This table is RIG, never scene: it is not
//     persisted anywhere, never written into a project, and a reload returns the shipped defaults. An edit
//     lands only when the whole effective table still validates, and a leaf whose shipped value is null
//     cannot be edited — the rig tunes ruled numbers; it does not invent rulings.
//
// Tuning changes *how much*, never *what is allowed*: powers, vetoes and laws stay in the records
// (registry.mjs) and in the modules' structure. Validation problems are data, not a throw — the selfcheck
// pins TUNING_PROBLEMS empty, so drift fails CI instead of breaking the live instrument at import time.

import shipped from './tuning.json' with { type: 'json' };

export const TUNING_SCHEMA = 'kc-persona-tuning/1';

/** The band seats, in cast order — the personas the tuning table addresses. */
export const TUNING_SEATS = Object.freeze(['lois', 'davis', 'queen', 'governor', 'carson', 'greiman', 'ashworth']);

/** Each seat's band role (spec §3b), with its surface callsign where it has one — how a surface may
 * refer to a seat, in display case (casing is data here, per the casing-in-CSS rule). The rhythm
 * section's seat is listed by role only: she is never named on a surface. */
export const TUNING_SEAT_ROLES = Object.freeze({
  lois: 'ARRANGER · COVER',
  davis: 'LEAD SOLOIST · OVERLAP',
  queen: 'RHYTHM SECTION',
  governor: 'BANDLEADER',
  carson: 'HORN · BLAST',
  greiman: 'HORN · HYBRID',
  ashworth: 'HORN · SWISS GRIT',
});

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};
const deepClone = (o) => (o && typeof o === 'object' ? JSON.parse(JSON.stringify(o)) : o);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ── the shape (what the selfcheck pins) ────────────────────────────────────────────────────────────────
// Leaf tags: 'prob' a number in [0,1] · 'probPos' a number in (0,1] (a leaf the mechanics divide by) ·
// 'count' an integer ≥ 0 · 'num' a finite number ≥ 0 ·
// 'range' [lo, hi] with 0 ≤ lo < hi · 'opener' a spectrum opener { key, value: prob }.
const KNOB_SHAPES = {
  lois: {
    brake: { at: 'prob', max: 'prob' },
    flatRead: {
      biasSwing: 'prob',
      happyKeepRate: 'probPos',
      biasFullAtRolls: 'count',
      fluxHeld: 'prob',
      noiseFlat: 'prob',
      eps: 'prob',
      minLevel: 'prob',
      pinned: 'prob',
    },
    cutGates: { glance: 'prob', originality: 'prob', boldness: 'prob' },
  },
  davis: {
    boldBand: 'probPos',
    maxRoutes: 'count',
    backoff: { reverts: 'count', bars: 'count' },
    spectrumOpeners: { low: 'opener', mid: 'opener', high: 'opener' },
  },
  queen: {
    minKeeps: 'count',
    beatConfidence: 'prob',
    m1: { bias: 'prob', proximity: 'prob' },
    m2: { t0: 'prob', slope: 'prob', cap: 'prob', floor: 'prob' },
    m3: { drift: 'prob' },
    m4: { armMs: 'num', holdPct: 'prob' },
    m5: { gainPeak: 'num' },
    m6: { keeps: 'count', strength: 'prob' },
    m7: { confidence: 'prob', step: 'num', deadband: 'num', range: 'range' },
    m8: { wetStep: 'prob', wetDeadband: 'prob', evolveRange: 'range', evolveStep: 'num', evolveDeadband: 'num' },
  },
};
const OPENER_KEYS = Object.freeze(['scale', 'displace', 'colour']);
const BAND_FIELDS = Object.freeze(['soloLengthPhrases', 'stepCap', 'odds', 'heat', 'answersFirst']);
const ODDS_KEYS = Object.freeze(['agree', 'disagree', 'layOut']);

function checkLeaf(tag, v, at, problems) {
  if (tag === 'prob') {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) problems.push(`${at} must be a probability in [0, 1]`);
  } else if (tag === 'probPos') {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1) problems.push(`${at} must be a probability in (0, 1]`);
  } else if (tag === 'count') {
    if (!Number.isInteger(v) || v < 0) problems.push(`${at} must be an integer count ≥ 0`);
  } else if (tag === 'num') {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) problems.push(`${at} must be a finite number ≥ 0`);
  } else if (tag === 'range') {
    if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'number' || !Number.isFinite(x)) || v[0] < 0 || v[0] >= v[1])
      problems.push(`${at} must be a [lo, hi] range with 0 ≤ lo < hi`);
  } else if (tag === 'opener') {
    if (!isPlainObject(v) || !OPENER_KEYS.includes(v.key)) problems.push(`${at} must name a spectrum dial (${OPENER_KEYS.join('|')})`);
    else if (typeof v.value !== 'number' || !Number.isFinite(v.value) || v.value < 0 || v.value > 1)
      problems.push(`${at}.value must be a probability in [0, 1]`);
  }
}

function checkKnobs(shape, knobs, at, problems) {
  if (!isPlainObject(knobs)) {
    problems.push(`${at} must be an object`);
    return;
  }
  for (const key of Object.keys(knobs)) if (!(key in shape)) problems.push(`${at}.${key} is not a known knob (drift)`);
  for (const [key, sub] of Object.entries(shape)) {
    if (!(key in knobs)) {
      problems.push(`${at}.${key} is missing`);
    } else if (typeof sub === 'string') {
      checkLeaf(sub, knobs[key], `${at}.${key}`, problems);
    } else {
      checkKnobs(sub, knobs[key], `${at}.${key}`, problems);
    }
  }
}

function checkBandFields(section, at, problems) {
  for (const key of Object.keys(section))
    if (!BAND_FIELDS.includes(key) && key !== 'knobs') problems.push(`${at}.${key} is not a tuning field (drift)`);
  for (const field of BAND_FIELDS) if (!(field in section)) problems.push(`${at}.${field} is missing`);
  if ('soloLengthPhrases' in section && section.soloLengthPhrases !== null && !Number.isInteger(section.soloLengthPhrases))
    problems.push(`${at}.soloLengthPhrases must be null (unruled) or an integer number of phrases`);
  if (
    'stepCap' in section &&
    section.stepCap !== null &&
    (typeof section.stepCap !== 'number' || !Number.isFinite(section.stepCap) || section.stepCap < 0)
  )
    problems.push(`${at}.stepCap must be null (unruled) or a finite number ≥ 0`);
  if ('heat' in section && section.heat !== null && (typeof section.heat !== 'number' || section.heat < 0 || section.heat > 1))
    problems.push(`${at}.heat must be null (unruled) or a probability in [0, 1]`);
  if ('answersFirst' in section && section.answersFirst !== null && !TUNING_SEATS.includes(section.answersFirst))
    problems.push(`${at}.answersFirst must be null (unruled) or a band seat id`);
  if ('odds' in section) {
    const odds = section.odds;
    if (!isPlainObject(odds) || Object.keys(odds).sort().join() !== [...ODDS_KEYS].sort().join()) {
      problems.push(`${at}.odds must hold exactly ${ODDS_KEYS.join('/')}`);
    } else {
      const vals = ODDS_KEYS.map((k) => odds[k]);
      if (vals.some((v) => v === null) && vals.some((v) => v !== null))
        problems.push(`${at}.odds must be all null (unruled) or all numbers`);
      else if (vals.every((v) => typeof v === 'number')) {
        if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) problems.push(`${at}.odds must be probabilities in [0, 1]`);
        else if (Math.abs(vals.reduce((a, b) => a + b, 0) - 1) > 1e-9) problems.push(`${at}.odds must sum to 1`);
      } else if (!vals.every((v) => v === null)) problems.push(`${at}.odds must be null (unruled) or numbers`);
    }
  }
}

/** Problems with a candidate tuning table against `kc-persona-tuning/1` (empty array = valid). Pure. */
export function validateTuning(table) {
  const problems = [];
  if (!isPlainObject(table)) return ['table is not a plain object'];
  if (table.schema !== TUNING_SCHEMA) problems.push(`schema must be '${TUNING_SCHEMA}'`);
  for (const key of Object.keys(table))
    if (!['schema', 'personas', 'relations', 'band'].includes(key)) problems.push(`unknown top-level key '${key}' (drift)`);

  const personas = table.personas;
  if (!isPlainObject(personas)) problems.push('personas must be an object');
  else {
    for (const id of Object.keys(personas)) if (!TUNING_SEATS.includes(id)) problems.push(`personas.${id} is not a band seat (drift)`);
    for (const id of TUNING_SEATS) {
      if (!(id in personas)) {
        problems.push(`personas.${id} is missing`);
        continue;
      }
      const section = personas[id];
      if (!isPlainObject(section)) {
        problems.push(`personas.${id} must be an object`);
        continue;
      }
      checkBandFields(section, `personas.${id}`, problems);
      const shape = KNOB_SHAPES[id];
      if (shape) {
        if (!('knobs' in section)) problems.push(`personas.${id}.knobs is missing`);
        else checkKnobs(shape, section.knobs, `personas.${id}.knobs`, problems);
      } else if ('knobs' in section) problems.push(`personas.${id}.knobs is not expected (no measured knobs yet)`);
    }
  }

  const relations = table.relations;
  if (!isPlainObject(relations)) problems.push('relations must be an object');
  else {
    const want = [];
    for (const a of TUNING_SEATS) for (const b of TUNING_SEATS) if (a !== b) want.push(`${a}->${b}`);
    for (const key of Object.keys(relations)) if (!want.includes(key)) problems.push(`relations.${key} is not a seat pair (drift)`);
    for (const key of want) {
      if (!(key in relations)) problems.push(`relations.${key} is missing`);
      else if (relations[key] !== null && (typeof relations[key] !== 'number' || relations[key] < -1 || relations[key] > 1))
        problems.push(`relations.${key} must be null (unruled) or a bias in [-1, 1]`);
    }
  }

  const band = table.band;
  if (!isPlainObject(band)) problems.push('band must be an object');
  else {
    for (const key of Object.keys(band))
      if (!['tradeRate', 'maxHornsPerCall', 'bandleaderCut'].includes(key)) problems.push(`band.${key} is not a band field (drift)`);
    for (const key of ['tradeRate', 'maxHornsPerCall', 'bandleaderCut']) if (!(key in band)) problems.push(`band.${key} is missing`);
    if ('tradeRate' in band && band.tradeRate !== null && (typeof band.tradeRate !== 'number' || band.tradeRate < 0 || band.tradeRate > 1))
      problems.push('band.tradeRate must be null (unruled) or a probability in [0, 1]');
    if ('maxHornsPerCall' in band && band.maxHornsPerCall !== null && !Number.isInteger(band.maxHornsPerCall))
      problems.push('band.maxHornsPerCall must be null (unruled) or an integer');
    if (
      'bandleaderCut' in band &&
      band.bandleaderCut !== null &&
      (typeof band.bandleaderCut !== 'number' || band.bandleaderCut < 0 || band.bandleaderCut > 1)
    )
      problems.push('band.bandleaderCut must be null (unruled) or a probability in [0, 1]');
  }
  return problems;
}

/** The shipped table, deep-frozen: today's measured values, the unruled band fields null. */
export const TUNING_DEFAULTS = deepFreeze(deepClone(shipped));

/** The shipped table's drift report, computed once. personaTuning.selfcheck.mjs pins this empty. */
export const TUNING_PROBLEMS = Object.freeze(validateTuning(TUNING_DEFAULTS));

// ── session overrides (DEV rig) ─────────────────────────────────────────────────────────────────────────
const overrides = new Map(); // dotted path -> value
const listeners = new Set();
let effective = TUNING_DEFAULTS;

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const setPath = (obj, path, value) => {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
};

function rebuild() {
  if (overrides.size === 0) {
    effective = TUNING_DEFAULTS;
    return;
  }
  const next = deepClone(TUNING_DEFAULTS);
  for (const [path, value] of overrides) setPath(next, path, deepClone(value));
  effective = deepFreeze(next);
}

/** The table in force: the shipped defaults with any DEV session edits applied. Frozen. */
export function personaTuning() {
  return effective;
}

/** The value at a dotted path in the table in force (e.g. 'personas.lois.knobs.brake.at'). */
export function tuningValue(path) {
  return getPath(effective, path);
}

/** The shipped (default) value at a dotted path. */
export function tuningDefault(path) {
  return getPath(TUNING_DEFAULTS, path);
}

/** The session's edits, as a flat { path: value } object (empty = the shipped table is in force). */
export function tuningOverrides() {
  return Object.fromEntries(overrides);
}

/**
 * One DEV live edit. Lands only when the leaf is a ruled (non-null) shipped value, the new value is a
 * number (or a [lo, hi] range for a range leaf), and the whole effective table still validates.
 * Returns { ok: true } or { ok: false, problems } — a refused edit changes nothing.
 */
export function setTuningValue(path, value) {
  const def = getPath(TUNING_DEFAULTS, path);
  if (def === undefined) return { ok: false, problems: [`${path} is not in the table`] };
  if (def === null) return { ok: false, problems: [`${path} is unruled (null) — the rig tunes ruled numbers only`] };
  if (isPlainObject(def)) return { ok: false, problems: [`${path} is a section, not a value — edit a leaf`] };
  const candidate = new Map(overrides);
  candidate.set(path, value);
  const next = deepClone(TUNING_DEFAULTS);
  for (const [p, v] of candidate) setPath(next, p, deepClone(v));
  const problems = validateTuning(next);
  if (problems.length) return { ok: false, problems };
  overrides.set(path, deepClone(value));
  rebuild();
  for (const f of [...listeners]) f(path);
  return { ok: true };
}

/** Clear every session edit: the shipped table is in force again. */
export function resetTuning() {
  if (overrides.size === 0) return;
  overrides.clear();
  rebuild();
  for (const f of [...listeners]) f(null);
}

/** Subscribe to live edits (the DEV panel re-renders). The callback receives the edited path, or null on reset. */
export function onTuningChange(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}
