// personas/menkman.mjs — the `kc-persona/1` record for the Rosa Menkman voice persona (spec: docs/design/persona-kernel-spec.md §2).
// Pure data; the registry (registry.mjs) validates and freezes it. The taste vector below is the one
// curator/personaTastes.js used to carry inline — it lives here now and that file reads it back unchanged.

export const record = {
  schema: 'kc-persona/1',
  id: 'menkman',
  kind: 'voice',
  identity: {
    name: "Rosa Menkman",
    born: null,
    died: null,
    provenance:
      'Distilled in curator/personaTastes.js from the persona source file (the persona files live outside the repo: ~/workspace/your_files/personas/rosa-menkman.md). Dates are not stated in the repo.',
    callsign: "COMPRESSION",
  },
  taste: {
    rationale:
      "Rupture as material: the accident legible, feedback in the loop, seamless polish is the enemy.",
    weights: {
      "disorder": 0.8,
      "calm": -0.6,
      "flowEnergy": 0.5,
      "markDensity": 0.4,
      "rotationSpread": 0.4,
      "drift": 0.3,
      "flowRate": 0.4,
      "windPush": 0.3
    },
    canonStyle: null,
  },
};
