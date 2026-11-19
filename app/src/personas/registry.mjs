// personas/registry.mjs — the Persona Kernel registry (spec: docs/design/persona-kernel-spec.md §2, §5; #2381).
//
// One `kc-persona/1` record per persona lives in this folder as a pure module; this registry gathers them,
// validates every record against the schema, and deep-freezes them. Validation problems are DATA, not a
// throw: personaKernel.selfcheck.mjs asserts the list is empty, so drift fails the selfcheck (and CI)
// instead of breaking the live instrument at import time.
//
// Slot law (spec §2): every slot is optional except `id`, `kind`, `identity`. Unknown slots are drift.
// A record's `lexicon` is a pointer to Matt-signed copy — records never carry new lines.

import { record as lois } from './lois.mjs';
import { record as davis } from './davis.mjs';
import { record as queen } from './queen.mjs';
import { record as governor } from './governor.mjs';
import { record as carson } from './carson.mjs';
import { record as greiman } from './greiman.mjs';
import { record as ashworth } from './ashworth.mjs';
import { record as te } from './te.mjs';
import { record as taste } from './taste.mjs';
import { record as molnar } from './molnar.mjs';
import { record as mohr } from './mohr.mjs';
import { record as benjamin } from './benjamin.mjs';
import { record as reas } from './reas.mjs';
import { record as haeckel } from './haeckel.mjs';
import { record as oxman } from './oxman.mjs';
import { record as stock } from './stock.mjs';
import { record as anadol } from './anadol.mjs';
import { record as menkman } from './menkman.mjs';

export const PERSONA_SCHEMA = 'kc-persona/1';

export const PERSONA_KINDS = Object.freeze(['director', 'listener', 'governor', 'doctrine', 'voice', 'judge']);

const SLOTS = new Set([
  'schema',
  'id',
  'kind',
  'identity',
  'lens',
  'taste',
  'principle',
  'lexicon',
  'states',
  'power',
  'head',
  'relations',
  'doctrine',
]);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDateOrNull = (v) => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** Problems with one record against `kc-persona/1` (empty array = valid). Pure. */
export function validatePersonaRecord(record) {
  const problems = [];
  const at = (msg) => problems.push(`${record && record.id ? record.id : '?'}: ${msg}`);
  if (!isPlainObject(record)) return ['record is not a plain object'];
  if (record.schema !== PERSONA_SCHEMA) at(`schema must be '${PERSONA_SCHEMA}'`);
  if (typeof record.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(record.id)) at('id must be a lowercase slug');
  if (!PERSONA_KINDS.includes(record.kind)) at(`kind must be one of ${PERSONA_KINDS.join('|')}`);
  for (const key of Object.keys(record)) if (!SLOTS.has(key)) at(`unknown slot '${key}'`);

  const identity = record.identity;
  if (!isPlainObject(identity)) {
    at('identity slot is required and must be an object');
  } else {
    if (typeof identity.name !== 'string' || !identity.name) at('identity.name must be a non-empty string');
    if (!isDateOrNull(identity.born)) at('identity.born must be an ISO date or null');
    if (!isDateOrNull(identity.died)) at('identity.died must be an ISO date or null');
    if (typeof identity.provenance !== 'string' || !identity.provenance)
      at('identity.provenance must be a non-empty string');
    if (!(identity.callsign === null || (typeof identity.callsign === 'string' && identity.callsign)))
      at('identity.callsign must be a non-empty string or null (null = never named on a surface)');
  }

  if (record.lens !== undefined) {
    if (!Array.isArray(record.lens) || record.lens.some((l) => typeof l !== 'string' || !l))
      at('lens must be an array of non-empty strings');
  }
  if (record.taste !== undefined) {
    const t = record.taste;
    if (!isPlainObject(t)) at('taste must be an object');
    else {
      if (typeof t.rationale !== 'string' || !t.rationale) at('taste.rationale must be a non-empty string');
      if (!isPlainObject(t.weights) || !Object.keys(t.weights).length) at('taste.weights must be a non-empty object');
      else
        for (const [k, v] of Object.entries(t.weights))
          if (typeof v !== 'number' || !Number.isFinite(v) || v < -1 || v > 1)
            at(`taste.weights.${k} must be a number in [-1, 1]`);
      if (!(t.canonStyle === null || (typeof t.canonStyle === 'string' && t.canonStyle)))
        at('taste.canonStyle must be a Canon style id or null');
    }
  }
  if (record.principle !== undefined && (typeof record.principle !== 'string' || !record.principle))
    at('principle must be a non-empty string');
  if (record.lexicon !== undefined) {
    if (!isPlainObject(record.lexicon) || typeof record.lexicon.source !== 'string' || !record.lexicon.source)
      at('lexicon must be a pointer: { source } naming where the signed copy lives — never new lines');
  }
  if (record.states !== undefined) {
    if (
      !Array.isArray(record.states) ||
      record.states.some((s) => !isPlainObject(s) || typeof s.id !== 'string' || !s.id || typeof s.signal !== 'string')
    )
      at('states must be an array of { id, signal }');
  }
  for (const slot of ['power', 'head']) {
    if (record[slot] !== undefined) {
      if (!isPlainObject(record[slot]) || typeof record[slot].summary !== 'string' || !record[slot].summary)
        at(`${slot} must be { summary }`);
    }
  }
  if (record.relations !== undefined) {
    if (
      !Array.isArray(record.relations) ||
      record.relations.some((r) => !isPlainObject(r) || typeof r.to !== 'string' || !r.to || typeof r.note !== 'string')
    )
      at('relations must be an array of { to, note }');
  }
  if (record.doctrine !== undefined) {
    const d = record.doctrine;
    if (!isPlainObject(d)) at('doctrine must be an object');
    else {
      if (typeof d.name !== 'string' || !d.name) at('doctrine.name must be a non-empty string');
      if (!Array.isArray(d.modes) || !d.modes.length || d.modes.some((m) => typeof m !== 'string' || !m))
        at('doctrine.modes must be a non-empty array of mode ids');
      if (new Set(d.modes).size !== d.modes.length) at('doctrine.modes must be unique');
      if (d.title !== undefined && typeof d.title !== 'string') at('doctrine.title must be a string');
      if (d.owns !== undefined) {
        const o = d.owns;
        if (!isPlainObject(o)) at('doctrine.owns must be an object');
        else {
          if (
            o.patternModes !== undefined &&
            (!Array.isArray(o.patternModes) || o.patternModes.some((m) => typeof m !== 'string' || !m))
          )
            at('doctrine.owns.patternModes must be an array of pattern mode names');
          if (o.principle !== undefined && (typeof o.principle !== 'string' || !o.principle))
            at('doctrine.owns.principle must be a non-empty string');
        }
      }
    }
  }
  return problems;
}

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

const RECORDS = [
  lois,
  davis,
  queen,
  governor,
  carson,
  greiman,
  ashworth,
  te,
  taste,
  molnar,
  mohr,
  benjamin,
  reas,
  haeckel,
  oxman,
  stock,
  anadol,
  menkman,
];

/** Every persona record, in cast order, deep-frozen. */
export const PERSONAS = Object.freeze(RECORDS.map((r) => deepFreeze(r)));

const BY_ID = new Map(PERSONAS.map((r) => [r.id, r]));

export function getPersona(id) {
  return BY_ID.get(id) ?? null;
}

export function personaIds() {
  return PERSONAS.map((r) => r.id);
}

/** Problems with the registry as a whole: per-record schema drift, duplicate ids, dangling relations. */
export function validatePersonaRegistry(records = PERSONAS) {
  const problems = [];
  for (const r of records) problems.push(...validatePersonaRecord(r));
  const ids = new Set();
  for (const r of records) {
    if (ids.has(r.id)) problems.push(`${r.id}: duplicate record id`);
    ids.add(r.id);
  }
  for (const r of records)
    for (const rel of r.relations ?? [])
      if (!ids.has(rel.to)) problems.push(`${r.id}: relation points at unknown persona '${rel.to}'`);
  return problems;
}

/** The registry's drift report, computed once. personaKernel.selfcheck.mjs pins this empty. */
export const PERSONA_PROBLEMS = Object.freeze(validatePersonaRegistry());
