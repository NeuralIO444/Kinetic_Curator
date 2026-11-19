// personas/carson.mjs — the `kc-persona/1` record for the CARSON doctrine (spec: docs/design/persona-kernel-spec.md §2, §4).
// Pure data; the registry (registry.mjs) validates and freezes it. The `doctrine` slot is what
// curator/doctrines.mjs projects into DOCTRINES — name, modes and title are the values it has always carried.

export const record = {
  schema: 'kc-persona/1',
  id: 'carson',
  kind: 'doctrine',
  identity: {
    name: 'David Carson',
    born: null,
    died: null,
    provenance:
      'The Canon `grunge` style record\u2019s identity.figures (app/src/data/canon/styles.js); docs/design/raygun-headroom-2026-11-06.md. Dates are not stated in the repo.',
    callsign: 'BLAST',
  },
  doctrine: {
    name: 'CARSON',
    modes: ['carson', 'shot'],
    title:
      'CARSON — arms hot: the geometry modes with the distortion channel (carson, shot). Hand it the stage and every poem it deals lands blasted.',
  },
  principle: 'hot geometry — move the letters',
  relations: [
    {
      to: 'lois',
      note: 'A named chooser inside the Director\u2019s treatment call; LOIS reviews its landings through the review loop.',
    },
  ],
};
