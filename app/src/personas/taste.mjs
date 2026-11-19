// personas/taste.mjs — the `kc-persona/1` record for TASTE (spec: docs/design/persona-kernel-spec.md §2, §5).
// Pure data; the registry (registry.mjs) validates and freezes it. TASTE is not a person and gets no
// character file and no copy (spec §5): it is the taste system itself, recorded as kind `judge` —
// it owns hierarchy — so the band table can address it.

export const record = {
  schema: 'kc-persona/1',
  id: 'taste',
  kind: 'judge',
  identity: {
    name: 'TASTE',
    born: null,
    died: null,
    provenance: 'The taste system itself (curator/taste.js, curator/tasteGate.js) — not a person.',
    callsign: 'TASTE',
  },
  lens: ['Scores a candidate by the weighted distance of its 19 measured features against a persona\u2019s distilled Loves/Avoids'],
  principle: 'hierarchy',
  relations: [
    { to: 'lois', note: 'His judgment head is trained on the same keep events TASTE scores (docs/PERSONAE_TRIAD.md §2).' },
    { to: 'queen', note: 'She never lowers the taste gate: she requires 8 keeps before any lean, and the gate is open (fidelity 0.595).' },
  ],
};
