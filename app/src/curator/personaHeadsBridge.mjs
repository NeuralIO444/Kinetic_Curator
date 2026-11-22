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
import { validatePersonasSection } from './tasteHead.js';

/**
 * The store file's text → a cleaned personas overlay { <id>: { <kind>: entry } }, or null when the file
 * carries nothing loadable. Entries are validated one at a time through the A1 validator, so a single
 * damaged entry falls back alone (ruling 2) instead of neutralizing the whole section.
 */
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
