// personas/reas.mjs — the `kc-persona/1` record for the Casey Reas voice persona (spec: docs/design/persona-kernel-spec.md §2).
// Pure data; the registry (registry.mjs) validates and freezes it. The taste vector below is the one
// curator/personaTastes.js used to carry inline — it lives here now and that file reads it back unchanged.

export const record = {
  schema: 'kc-persona/1',
  id: 'reas',
  kind: 'voice',
  identity: {
    name: "Casey Reas",
    born: null,
    died: null,
    provenance:
      'Distilled in curator/personaTastes.js from the persona source file (the persona files live outside the repo: ~/workspace/your_files/personas/casey-reas.md). Dates are not stated in the repo.',
    callsign: "PROCESS FIELD",
  },
  taste: {
    rationale:
      "Simple elements + behaviors in continuous motion; full-surface field, no focal center, no finished state.",
    weights: {
      "flowEnergy": 0.8,
      "coverage": 0.6,
      "markDensity": 0.5,
      "markSize": -0.4,
      "swarmDrive": 0.6,
      "attractors": 0.4,
      "calm": -0.5,
      "opacityVariety": -0.3,
      "windPush": 0.6,
      "drift": 0.6,
      "flowRate": 0.4
    },
    canonStyle: null,
  },
};
