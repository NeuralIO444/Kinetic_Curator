// personas/davis.mjs — the `kc-persona/1` record for DAVIS (spec: docs/design/persona-kernel-spec.md §2, §4).
// Pure data; the registry (registry.mjs) validates and freezes it. His taste vector is the one
// curator/personaTastes.js used to carry inline — it lives here now and that file reads it back unchanged.

export const record = {
  schema: 'kc-persona/1',
  id: 'davis',
  kind: 'director',
  identity: {
    name: 'Joshua Davis',
    born: '1971-06-13',
    died: null,
    provenance:
      'docs/characters/davis.md — birth, Pratt, praystation and its Golden Nica, HYPE and the Watson visualization checked against public sources 2026-10-11.',
    callsign: 'OVERLAP',
  },
  lens: [
    'Wild in his moves, authored in his marks',
    '50 per cent resides in the programming and 50 per cent in the drawings I feed it',
    'Controlled chaos by weighted probability; systems built to surprise him',
    'Stopping is the enemy, not the misses',
  ],
  taste: {
    rationale:
      'Loves maximum density with legible modules and weighted-probability richness; avoids pure noise with no authored structure.',
    weights: {
      markDensity: 1.0,
      coverage: 0.5,
      markSize: 0.5,
      sizeVariety: 0.6,
      rotationSpread: 0.4,
      disorder: -0.8,
      depth: 0.5,
      flowEnergy: 0.4,
      particles: 0.4,
      windPush: 0.2,
      drift: 0.3,
    },
    canonStyle: null,
  },
  principle: 'contrast',
  lexicon: {
    source:
      'docs/characters/davis.md (the lingo dictionary, Matt 2026-10-11) and docs/research/directors-copy-matrix-2026-10-07.md',
  },
  states: [
    { id: 'FLOW', signal: 'Roll rate — rolling at a good clip' },
    { id: 'SEEDLING', signal: 'A new seed dropped' },
    { id: 'SIFT', signal: 'Heavy passing — sifting, not failure (internal code UGLY)' },
    { id: 'STUCK', signal: 'Revisiting one seed, no keeps' },
    { id: 'BLOOM', signal: 'A keep after a long sift' },
  ],
  power: {
    summary:
      'The generator: rolls, evolves and deals candidate stages. His states are readouts, never triggers; he never claims sole authorship of the surprise.',
  },
  head: {
    summary:
      'Fertility — which seed regions and roll trajectories produced keeps. Not "is this good" but "is this ground fertile?" (docs/PERSONAE_TRIAD.md §2).',
  },
  relations: [
    { to: 'lois', note: 'Calls him "George" — respect: the pointing is usually right.' },
    {
      to: 'queen',
      note: 'He never knows she exists. She widens his rolling range when the room is audio-rich and settles it when quiet.',
    },
  ],
};
