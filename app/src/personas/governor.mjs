// personas/governor.mjs — the `kc-persona/1` record for the GOVERNOR (spec: docs/design/persona-kernel-spec.md §2, §4).
// Pure data; the registry (registry.mjs) validates and freezes it. He is never named on a surface either
// (callsign null): he shows as instruments only — the tape readout, the budget switch, the shed pills.

export const record = {
  schema: 'kc-persona/1',
  id: 'governor',
  kind: 'governor',
  identity: {
    name: 'David Bowie',
    born: '1947-01-08',
    died: '2016-01-10',
    provenance:
      'docs/characters/governor.md — the sign page Matt shared (nakshamastro.com, checked 2026-10-14) for the date; public music histories for Low and Oblique Strategies.',
    callsign: null,
  },
  principle: 'constraint as method — a limit that makes the work, not one that stops it',
  power: {
    summary:
      'Holds the frame: the shed ladder gives up the cheapest thing first (edge AA, resolution scale, quality tier, tier-1 finishes, asset thinning, the count clamp, motion held, the watchdog\u2019s hard stop), restores in reverse order, and logs every cut. It acts only on measured frame time — no timer with an opinion.',
  },
  relations: [
    { to: 'lois', note: 'It does not judge, generate or lean — it sets what he is allowed to spend; his work sits under its cost tiers.' },
    { to: 'davis', note: 'It does not judge, generate or lean — it sets what he is allowed to spend; his work sits under its cost tiers.' },
    { to: 'queen', note: 'Her set sits under its cost tiers like everyone\u2019s.' },
  ],
};
