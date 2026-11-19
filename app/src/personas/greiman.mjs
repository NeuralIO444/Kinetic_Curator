// personas/greiman.mjs — the `kc-persona/1` record for the GREIMAN doctrine (spec: docs/design/persona-kernel-spec.md §2, §4).
// Pure data; the registry (registry.mjs) validates and freezes it. The `doctrine` slot is what curator/doctrines.mjs
// projects into DOCTRINES — since P5 (#2385) she is HYBRID, a doctrine like BLAST and SWISS GRIT. Her moves, her
// colour and her palette gravity live in curator/hybrid.mjs; her numbers in personas/tuning.json (greiman.knobs).

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
    name: 'HYBRID',
    modes: ['greiman'],
    title:
      'HYBRID — the digital pole: bitmap type, layered planes, a spectrum across a word, the float. Hand it the stage and every poem it deals lands in one of the four.',
    // What she owns beyond her mode (spec §4, Q13): PATTERN modes, and colour as the fifth principle.
    owns: { patternModes: ['GLYPH', 'TIDES'], principle: 'colour' },
  },
  principle: 'colour — the digital pole: bitmap type, layered planes, the spectrum across a word, the float',
  power: {
    summary:
      'Plays one of four moves per call (bitmap, planes, spectrum, float); owns PATTERN GLYPH and TIDES; leans her colour toward the kept palette (the Queen\u2019s old M3, same caps). A user palette lock always wins over her.',
  },
  states: [
    { id: 'bake', signal: 'the standing record names the bitmap move (raygun.bitmap)' },
    { id: 'layers', signal: 'the standing record names the planes move (raygun.planes)' },
    { id: 'spectrum', signal: 'the standing record names the spectrum move (raygun.spectrum)' },
  ],
  relations: [
    { to: 'ashworth', note: 'Agrees with SWISS GRIT on the grid.' },
    { to: 'carson', note: 'Pushes back on BLAST\u2019s raw chaos.' },
  ],
};
