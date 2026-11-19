// personas/stock.mjs — the `kc-persona/1` record for the Mark Stock voice persona (spec: docs/design/persona-kernel-spec.md §2).
// Pure data; the registry (registry.mjs) validates and freezes it. The taste vector below is the one
// curator/personaTastes.js used to carry inline — it lives here now and that file reads it back unchanged.

export const record = {
  schema: 'kc-persona/1',
  id: 'stock',
  kind: 'voice',
  identity: {
    name: "Mark Stock",
    born: null,
    died: null,
    provenance:
      'Distilled in curator/personaTastes.js from the persona source file (the persona files live outside the repo: ~/workspace/your_files/personas/mark-stock.md). Dates are not stated in the repo.',
    callsign: "VORTEX",
  },
  taste: {
    rationale:
      "One dominant flow event in deep negative space; real turbulence frozen at peak; fine filamentary detail.",
    weights: {
      "markDensity": -0.5,
      "particles": 0.6,
      "flowEnergy": 0.6,
      "flowWarp": 0.7,
      "attractors": -0.5,
      "coverage": -0.6,
      "calm": -0.3,
      "windPush": 0.4,
      "drift": 0.3
    },
    canonStyle: null,
  },
};
