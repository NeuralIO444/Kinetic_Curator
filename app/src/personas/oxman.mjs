// personas/oxman.mjs — the `kc-persona/1` record for the Neri Oxman voice persona (spec: docs/design/persona-kernel-spec.md §2).
// Pure data; the registry (registry.mjs) validates and freezes it. The taste vector below is the one
// curator/personaTastes.js used to carry inline — it lives here now and that file reads it back unchanged.

export const record = {
  schema: 'kc-persona/1',
  id: 'oxman',
  kind: 'voice',
  identity: {
    name: "Neri Oxman",
    born: null,
    died: null,
    provenance:
      'Distilled in curator/personaTastes.js from the persona source file (the persona files live outside the repo: ~/workspace/your_files/personas/neri-oxman.md). Dates are not stated in the repo.',
    callsign: "GROWN",
  },
  taste: {
    rationale:
      "Grown gradients varying by field logic; environmental responsiveness; never static, never assembled.",
    weights: {
      "opacityVariety": 0.5,
      "sizeVariety": 0.5,
      "coverage": 0.5,
      "flowEnergy": 0.5,
      "flowWarp": 0.4,
      "calm": -0.4,
      "markDensity": 0.4,
      "breathSwell": 0.6,
      "drift": 0.5,
      "windPush": 0.3
    },
    canonStyle: null,
  },
};
