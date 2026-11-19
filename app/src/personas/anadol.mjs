// personas/anadol.mjs — the `kc-persona/1` record for the Refik Anadol voice persona (spec: docs/design/persona-kernel-spec.md §2).
// Pure data; the registry (registry.mjs) validates and freezes it. The taste vector below is the one
// curator/personaTastes.js used to carry inline — it lives here now and that file reads it back unchanged.

export const record = {
  schema: 'kc-persona/1',
  id: 'anadol',
  kind: 'voice',
  identity: {
    name: "Refik Anadol",
    born: null,
    died: null,
    provenance:
      'Distilled in curator/personaTastes.js from the persona source file (the persona files live outside the repo: ~/workspace/your_files/personas/refik-anadol.md). Dates are not stated in the repo.',
    callsign: "LATENT DRIFT",
  },
  taste: {
    rationale:
      "Everything in ceaseless flow; full-bleed with no center; never still, never a frozen frame.",
    weights: {
      "flowEnergy": 1,
      "flowWarp": 0.8,
      "coverage": 0.8,
      "markDensity": 0.5,
      "disorder": -0.4,
      "calm": -0.8,
      "particles": 0.5,
      "drift": 0.8,
      "windPush": 0.6,
      "flowRate": 0.6,
      "breathSwell": 0.4
    },
    canonStyle: null,
  },
};
