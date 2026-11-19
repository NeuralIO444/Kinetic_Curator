// personas/te.mjs — the `kc-persona/1` record for TE (spec: docs/design/persona-kernel-spec.md §2, §5).
// Pure data; the registry (registry.mjs) validates and freezes it. TE is not a real person and gets no
// character file and no copy (spec §5): it is the third Mind persona — the constraint philosophy the
// instrument itself holds — recorded so the band table can address it.

export const record = {
  schema: 'kc-persona/1',
  id: 'te',
  kind: 'voice',
  identity: {
    name: 'TE',
    born: null,
    died: null,
    provenance:
      'The third Mind persona (the Mind trio: LOIS / DAVIS / TE) — docs/design/raygun-headroom-2026-11-06.md §6a. Not a real person.',
    callsign: 'TE',
  },
  principle: 'the visible limit — limitations you can see and trust; frozen history renders discrete',
  relations: [
    { to: 'lois', note: 'One of the Mind trio with LOIS and Davis — the consulted minds behind mind:req / mind:reply.' },
    { to: 'davis', note: 'One of the Mind trio with LOIS and Davis — the consulted minds behind mind:req / mind:reply.' },
  ],
};
