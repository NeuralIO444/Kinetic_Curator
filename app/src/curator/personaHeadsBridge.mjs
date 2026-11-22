// personaHeadsBridge — #2439 (Persona Adapters boot bridge): the pure half. The nightly trainer (A3, #2396)
// keeps a canonical taste file in the adapters data home; its `personas` section is the store's current state —
// the newest head per persona per kind, exactly as the trainer shipped it or a rollback (A4) left it. This
// module turns that file's text into an overlay for the loaded taste's personas section.
//
// Matt's rulings (2026-11-21): (1) the newest head loads, always — the nightly verify never gates this read
// (a version only exists because it beat the incumbent under A2's rules; verify stays a logged alarm);
// (2) a missing or unreadable store is a SILENT fallback — and damage is per entry: one malformed entry falls
// back alone, the rest still load (validatePersonasSection is all-or-nothing over a section, so entries are
// validated one at a time here); (3) boot-only — the caller reads once at app start, never again, so heads
// written mid-session take effect at the next launch, never between takes.
import { validatePersonasSection, PERSONA_HEAD_IDS } from './tasteHead.js';
import { relationsOverlay } from '../personas/chemistry.mjs';

/**
 * How a head is named on a surface: by callsign, always (the A4 launch note is callsigns only).
 * The governor's callsign is null by law — he is never named; his head is spoken of by its
 * instrument ("the cut"). The Queen has no entry here at all: she is not a head-holding seat in
 * the section this bridge reads, and she is never named anywhere.
 */
export const HEAD_CALLSIGNS = Object.freeze({
  governor: null,
  davis: 'OVERLAP',
  lois: 'COVER',
  carson: 'BLAST',
  greiman: 'HYBRID',
  ashworth: 'SWISS GRIT',
});

/** A stable fingerprint of a personas section's versions — "what is loaded", for change detection. */
export function headsFingerprint(section) {
  const parts = [];
  for (const id of PERSONA_HEAD_IDS) {
    const byKind = section && section[id];
    if (!byKind) continue;
    for (const kind of Object.keys(byKind).sort()) parts.push(`${id}/${kind}@${byKind[kind].version}`);
  }
  return parts.join('|');
}

/**
 * The entries in `after` that are new or carry a different version than in `before` — the head
 * changes a boot just landed. Both arguments are personas sections (or null).
 */
export function changedHeadEntries(before, after) {
  const out = [];
  for (const id of PERSONA_HEAD_IDS) {
    const byKind = after && after[id];
    if (!byKind) continue;
    for (const [kind, entry] of Object.entries(byKind)) {
      const prev = before && before[id] && before[id][kind];
      if (!prev || prev.version !== entry.version) out.push({ id, kind, entry });
    }
  }
  return out;
}

/**
 * The one-line launch note for a set of changed heads (A4): "<callsign> learned from N turns",
 * naming the most recently trained change. The governor's change is spoken of by its instrument.
 * Returns null when nothing changed.
 */
export function launchNoteLine(changed) {
  if (!changed || !changed.length) return null;
  const pick = [...changed].sort((a, b) =>
    String(b.entry.trainedAt || '').localeCompare(String(a.entry.trainedAt || '')),
  )[0];
  const name = HEAD_CALLSIGNS[pick.id];
  const who = name ?? (pick.id === 'governor' ? 'the cut' : pick.id);
  return `${who} learned from ${pick.entry.labeledTurns} turns`;
}

/**
 * The store file's text → a cleaned personas overlay { <id>: { <kind>: entry } }, or null when the file
 * carries nothing loadable. Entries are validated one at a time through the A1 validator, so a single
 * damaged entry falls back alone (ruling 2) instead of neutralizing the whole section.
 */
/**
 * #2398 (Adapters A5) — the same store file's relations section as a boot overlay: the learned
 * chemistry offsets, cleaned per entry by chemistry.mjs's lenient read (a bad pair or value
 * falls back alone, as a bad head entry does). Null when the file carries nothing usable.
 */
export function relationsOverlayFromStoreText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return relationsOverlay(raw.relations);
}

export function personasOverlayFromStoreText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const section = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.personas : null;
  if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
  const out = {};
  for (const [id, byKind] of Object.entries(section)) {
    if (!byKind || typeof byKind !== 'object' || Array.isArray(byKind)) continue;
    for (const [kind, entry] of Object.entries(byKind)) {
      const clean = validatePersonasSection({ [id]: { [kind]: entry } });
      if (clean) (out[id] ||= {})[kind] = clean[id][kind];
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Overlay the store's heads onto a personas section: the store wins per persona per kind (it holds the
 * newest), entries the store does not carry stay exactly as they are. Pure — neither input is mutated.
 */
export function mergePersonasSection(current, overlay) {
  if (!overlay) return current ?? null;
  const out = {};
  for (const [id, byKind] of Object.entries(current || {})) out[id] = { ...byKind };
  for (const [id, byKind] of Object.entries(overlay)) out[id] = { ...(out[id] || {}), ...byKind };
  return Object.keys(out).length ? out : null;
}
