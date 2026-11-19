// personas/ashworth.mjs — the `kc-persona/1` record for the ASHWORTH doctrine (spec: docs/design/persona-kernel-spec.md §2, §4).
// Pure data; the registry (registry.mjs) validates and freezes it. The `doctrine` slot is what
// curator/doctrines.mjs projects into DOCTRINES — name, modes and title are the values it has always carried.

export const record = {
  schema: 'kc-persona/1',
  id: 'ashworth',
  kind: 'doctrine',
  identity: {
    name: 'Chris Ashworth',
    born: null,
    died: null,
    provenance:
      'docs/design/raygun-headroom-2026-11-06.md — the Monster Children interview ("Under the (Ray) Gun", 2023-04-10); Ray Gun art director from 1997. Dates are not stated in the repo.',
    callsign: 'SWISS GRIT',
  },
  doctrine: {
    name: 'SWISS GRIT',
    modes: ['grit'],
    title:
      'SWISS GRIT — arms process-first: Swiss Grit, the grid first and the destruction by rule. Hand it the stage and every poem it deals is set perfectly, then run through the machine.',
  },
  principle: 'process-first — set it perfectly, then run a destructive process over it, by rule',
  relations: [
    {
      to: 'lois',
      note: 'A named chooser inside the Director\u2019s treatment call; LOIS reviews its landings through the review loop.',
    },
  ],
};
