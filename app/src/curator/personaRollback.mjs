// personaRollback — #2397 (Persona Adapters A4): the pure half of the DEV readout's rollback button.
// It mirrors the trainer's rollback (studio/train_persona_heads.py, A2 ruling Q5) exactly, over the
// same files: restore the entry's previous-version artifact from the store into the canonical taste;
// past version 1, remove the entry (pruning the persona, then the section, when they empty). Matt's
// A4 ruling: the rolled-back-from version retires for good — rollback only ever moves backward, and
// the trainer's versions only ever move forward, so it never returns. Effect at next launch (the
// boot-bridge law): this session keeps playing on the heads it loaded.
//
// A rollback that cannot restore EXACTLY does not run: no entry, a malformed shipped entry, or a
// missing/mismatched store artifact is a refusal, and a refusal touches nothing.
import { validatePersonasSection } from './tasteHead.js';

/** The taste file's canonical write (the trainer's form): sorted keys, indent 1. */
export function canonicalStringify(obj) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sort(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(obj), null, 1);
}

/** One history.jsonl line, the trainer's form: sorted keys, compact, newline-terminated. */
export function historyLine(record) {
  const sorted = {};
  for (const k of Object.keys(record).sort()) sorted[k] = record[k];
  return JSON.stringify(sorted) + '\n';
}

/** The trainer's timestamp form: UTC, seconds, Z. */
export const rollbackTimestamp = (d = new Date()) => d.toISOString().replace(/\.\d+Z$/, 'Z');

/**
 * Plan a rollback against parsed data. `taste` is the canonical taste object (mutated on success —
 * pass a copy if that matters); `artifactText` is the previous version's store file text (only read
 * when the current version is above 1). Returns { ok, record } or { ok: false, reason }.
 */
export function planRollback(taste, id, kind, artifactText, nowIso) {
  if (!taste || typeof taste !== 'object' || Array.isArray(taste))
    return { ok: false, reason: 'the canonical taste is unreadable' };
  const personas =
    taste.personas && typeof taste.personas === 'object' && !Array.isArray(taste.personas) ? taste.personas : {};
  const current = personas[id] && personas[id][kind];
  if (!current) return { ok: false, reason: `no shipped entry for ${id}|${kind} — nothing to roll back` };
  if (!validatePersonasSection({ [id]: { [kind]: current } })) {
    return { ok: false, reason: `the shipped entry for ${id}|${kind} is malformed — refusing to roll back` };
  }
  const version = current.version;
  const record = { ts: nowIso, action: 'rollback', id, kind, fromVersion: version };
  if (version <= 1) {
    delete personas[id][kind];
    if (!Object.keys(personas[id]).length) delete personas[id];
    if (!Object.keys(personas).length) delete taste.personas;
    record.toVersion = null;
    return { ok: true, record };
  }
  let prior;
  try {
    prior = JSON.parse(artifactText);
  } catch {
    return { ok: false, reason: `the store artifact for ${id}|${kind} v${version - 1} is unreadable` };
  }
  if (!prior || prior.version !== version - 1 || prior.kind !== kind) {
    return { ok: false, reason: `the store artifact for ${id}|${kind} v${version - 1} is missing or mismatched` };
  }
  personas[id][kind] = prior;
  record.toVersion = version - 1;
  return { ok: true, record };
}
