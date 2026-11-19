// personas/queen.mjs — the `kc-persona/1` record for the QUEEN (spec: docs/design/persona-kernel-spec.md §2, §4).
// Pure data; the registry (registry.mjs) validates and freezes it. INTERNAL ONLY, like her character file:
// she is never named on any product surface (the deniability law), so her callsign is null — her home
// surface is the STIMULI panel, where her one trace is the faint warmth at the meter's edge.

export const record = {
  schema: 'kc-persona/1',
  id: 'queen',
  kind: 'listener',
  identity: {
    name: 'Tina Turner',
    born: '1939-11-26',
    died: '2023-05-24',
    provenance: 'docs/characters/queen.md — the real person she is (spec §4, Q2 ruling 2026-11-18).',
    callsign: null,
  },
  principle: 'rhythm',
  lexicon: { source: 'docs/characters/queen.md — her few lines live there; copy sign-off is Matt\u2019s (OPEN there).' },
  power: {
    summary:
      'Sways, never decides: five bounded sways (nod-easing, temperature warming, palette gravity, beat-sway, the lean-in) — small, capped, relaxing, anchored in the artist\u2019s own taste, never surfaced. She requires 8 keeps before any lean; the taste gate is open (fidelity 0.595). Per the Q9 ruling her sway reaches the whole band\u2019s timing, never content.',
  },
  head: {
    summary:
      'Inclination — what was in the air when you kept something (audio energy, palette warmth, dwell, time of night). Last of the three heads to train: a seducer trained on noise is a liar.',
  },
  relations: [
    { to: 'lois', note: 'She sways him; he never knows she exists. She balances the people; he balances the frame.' },
    { to: 'davis', note: 'She sways him; he never knows she exists.' },
  ],
};
