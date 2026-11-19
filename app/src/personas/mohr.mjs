// personas/mohr.mjs — the `kc-persona/1` record for the Manfred Mohr voice persona (spec: docs/design/persona-kernel-spec.md §2).
// Pure data; the registry (registry.mjs) validates and freezes it. The taste vector below is the one
// curator/personaTastes.js used to carry inline — it lives here now and that file reads it back unchanged.

export const record = {
  schema: 'kc-persona/1',
  id: 'mohr',
  kind: 'voice',
  identity: {
    name: "Manfred Mohr",
    born: null,
    died: null,
    provenance:
      'Distilled in curator/personaTastes.js from the persona source file (the persona files live outside the repo: ~/workspace/your_files/personas/manfred-mohr.md). Dates are not stated in the repo.',
    callsign: "MONO AXIS",
  },
  taste: {
    rationale:
      "Rational exhaustive variation on one motif; disturbance of symmetry for tension but never chaos; slow structural motion.",
    weights: {
      "disorder": -0.7,
      "rotationSpread": 0.3,
      "depth": 0.3,
      "flowEnergy": -0.3,
      "calm": 0.4,
      "markSize": -0.3,
      "windPush": -0.2,
      "drift": -0.3
    },
    canonStyle: null,
  },
};
