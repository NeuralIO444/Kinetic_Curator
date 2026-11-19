// personas/greiman.mjs — the `kc-persona/1` record for the GREIMAN doctrine (spec: docs/design/persona-kernel-spec.md §2, §4).
// Pure data; the registry (registry.mjs) validates and freezes it. Her doctrine record exists from P1, but
// curator/doctrines.mjs does NOT project her yet — she joins DOCTRINES in P5 (the HYBRID slice), so
// doctrineOfMode('greiman') stays null and default behaviour is byte-identical until then.

export const record = {
  schema: 'kc-persona/1',
  id: 'greiman',
  kind: 'doctrine',
  identity: {
    name: 'Greiman',
    born: null,
    died: null,
    provenance:
      'Named GREIMAN in the tree today (the `greiman` treatment mode). Her full name and dates are not stated anywhere in the repo — the Archive phase sources them; backstories are sourced fact, never invented (spec §4b).',
    callsign: 'HYBRID',
  },
  doctrine: {
    name: 'GREIMAN',
    modes: ['greiman'],
  },
  principle: 'colour — the digital pole: bitmap type, layered planes, the spectrum across a word, the float',
  relations: [
    { to: 'ashworth', note: 'Agrees with SWISS GRIT on the grid.' },
    { to: 'carson', note: 'Pushes back on BLAST\u2019s raw chaos.' },
  ],
};
