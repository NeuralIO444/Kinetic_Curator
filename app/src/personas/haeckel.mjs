// personas/haeckel.mjs — the `kc-persona/1` record for the Ernst Haeckel voice persona (spec: docs/design/persona-kernel-spec.md §2).
// Pure data; the registry (registry.mjs) validates and freezes it. The taste vector below is the one
// curator/personaTastes.js used to carry inline — it lives here now and that file reads it back unchanged.

export const record = {
  schema: 'kc-persona/1',
  id: 'haeckel',
  kind: 'voice',
  identity: {
    name: "Ernst Haeckel",
    born: null,
    died: null,
    provenance:
      'Distilled in curator/personaTastes.js from the persona source file (the persona files live outside the repo: ~/workspace/your_files/personas/ernst-haeckel.md). Dates are not stated in the repo.',
    callsign: "SPECIMEN",
  },
  taste: {
    rationale:
      "Perfect symmetry as organizing law; dense fine detail on a stripped void ground; only slow ornamental breathing.",
    weights: {
      "disorder": -1,
      "markDensity": 0.7,
      "particles": 0.5,
      "coverage": -0.6,
      "sizeVariety": 0.4,
      "flowEnergy": -0.6,
      "calm": 0.6,
      "breathSwell": 0.7,
      "windPush": -0.4,
      "drift": -0.2
    },
    canonStyle: 'engraved',
  },
};
