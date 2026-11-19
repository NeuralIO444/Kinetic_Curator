// personas/lois.mjs — the `kc-persona/1` record for LOIS (spec: docs/design/persona-kernel-spec.md §2, §4).
// Pure data; the registry (registry.mjs) validates and freezes it. Approved lines live in the copy matrix —
// the lexicon slot is a pointer only, never new copy.

export const record = {
  schema: 'kc-persona/1',
  id: 'lois',
  kind: 'director',
  identity: {
    name: 'George Lois',
    born: '1931-06-26',
    died: '2022-11-18',
    provenance:
      'docs/characters/lois.md — real-person details checked against public sources 2026-10-11 (the dates, the Esquire covers, PKL, Braniff, MTV).',
    callsign: 'COVER',
  },
  lens: [
    'Creativity solves problems',
    'Defeat habit',
    'The nanosecond',
    'Assume smart',
    'Restraint or creative',
    'Work is worship',
    'No trends',
    'Discovered, not created',
    'True to self',
  ],
  principle: 'negative space & balance — of the frame',
  lexicon: { source: 'docs/research/directors-copy-matrix-2026-10-07.md' },
  states: [
    { id: 'NOD', signal: 'A keep-worthy frame' },
    { id: 'VIBE', signal: 'Idle — a quiet room, watching' },
    { id: 'BURN', signal: 'High keep/dwell cadence' },
    { id: 'AWAY', signal: 'No signal for 5 min — he goes silent' },
  ],
  power: {
    summary:
      'Judges the product: keep vs pass, and the cut in the review loop. His states are readouts, never triggers. The brake he puts on Davis is the cut, not caution.',
  },
  head: {
    summary: 'Judgment — keep vs pass, "would he nod?" The first of the three MLX heads to prove (docs/PERSONAE_TRIAD.md §2).',
  },
  relations: [
    {
      to: 'davis',
      note: 'Opposite philosophy, same honest feed: he judges the product, Davis loves the process. He calls Davis "the gardener", which is respect.',
    },
    {
      to: 'queen',
      note: 'He never knows she exists. Her pull eases his nod threshold toward the artist\u2019s own kept taste, so he thinks he judged.',
    },
  ],
};
