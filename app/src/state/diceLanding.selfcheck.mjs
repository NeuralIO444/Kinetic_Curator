// node src/state/diceLanding.selfcheck.mjs
//
// Audit fix 3e (#1675) — the state slices' dice, proven to land in the take.
//
// layoutSlice / layersSlice / davisSlice roll Math.random for performer
// dice (seed bumps, the kinetic rolls, pattern shuffles, the EVOLVE
// palette deal). Unlike the engine defaults removed in slices 3a–3d,
// these rolls are MEANT to be recorded: replayability comes from the
// stored state + seed (#710), not from the pass itself. That doctrine
// was asserted in comments and the mathRandomGuard catalogue; this suite
// enforces it. For every dice action it asserts the dealt value is
// identical in three places: the store, the serializeProject document,
// and the document after a parseProject round-trip. If a roll ever
// starts escaping the take, this suite fails.
import assert from 'node:assert';
import { useStore } from './store.js';
import { serializeProject, parseProject } from './projectDocument.js';

const S = () => useStore.getState();
const realRandom = Math.random;

function roundTrip() {
  const doc = serializeProject(S());
  const parsed = parseProject(doc);
  return { doc, doc2: parsed && parsed.doc ? parsed.doc : parsed };
}

function lands(name, storeVal, pick) {
  const { doc, doc2 } = roundTrip();
  assert.deepStrictEqual(pick(doc), storeVal, `${name}: document must carry the dealt value`);
  assert.deepStrictEqual(pick(doc2), storeVal, `${name}: value must survive the parse round-trip`);
}

// ── layoutSlice: bumpSeed / mutateSeedOffset ────────────────────────────────
S().bumpSeed();
lands('bumpSeed -> seed', S().seed, (d) => d.seed);
for (const group of ['spatial', 'color']) {
  S().mutateSeedOffset(group);
  lands(`mutateSeedOffset(${group})`, S().seedOffsets[group], (d) => d.seedOffsets?.[group]);
}

// ── layoutSlice: kineticRoll ────────────────────────────────────────────────
S().kineticRoll();
lands('kineticRoll -> seed', S().seed, (d) => d.seed);
lands('kineticRoll -> paletteId', S().paletteId, (d) => d.paletteId);

// ── layersSlice: addPatternLayer / shufflePattern ───────────────────────────
S().addPatternLayer('QUILT');
const patLayer = () => S().layers.find((l) => l.type === 'pattern');
assert.ok(patLayer(), 'pattern layer exists');
lands('addPatternLayer -> pattern.seed', patLayer().pattern.seed,
  (d) => (d.layers || []).find((l) => l.id === patLayer().id)?.pattern?.seed);
S().shufflePattern(patLayer().id);
lands('shufflePattern -> pattern.seed', patLayer().pattern.seed,
  (d) => (d.layers || []).find((l) => l.id === patLayer().id)?.pattern?.seed);

// ── layoutSlice: kineticRulesPass pattern roll (die must observably fire) ───
// The pass deals pattern layers from mkRng(die(0x7fffffff)). With the die
// stubbed, the dealt seeds are whatever the roll produced — the proof is
// that they are in the document, not what they are.
try {
  Math.random = () => 0.999;
  S().kineticRulesPass();
} finally {
  Math.random = realRandom;
}
lands('kineticRulesPass -> pattern seeds', S().layers.map((l) => l.pattern?.seed ?? null),
  (d) => (d.layers || []).map((l) => l.pattern?.seed ?? null));

// ── layoutSlice: kineticWeatherPass (sun + optics dice, stubbed die) ────────
S().setLight({ x: 10, y: 20, intensity: 0.5, ambient: 0.4 });
try {
  Math.random = () => 0.999;
  S().kineticWeatherPass();
} finally {
  Math.random = realRandom;
}
assert.ok(S().light, 'weather pass keeps a light');
assert.strictEqual(S().light.x, -500 + ((0.999 * 2001) | 0), 'weather die moved the sun (x)');
assert.ok(Math.abs(S().light.intensity - (0.3 + 0.999 * 0.7)) < 0.01,
  `weather die set intensity, got ${S().light.intensity}`);
assert.ok(Math.abs(S().light.ambient - (0.2 + 0.999 * 0.5)) < 0.01,
  `weather die set ambient, got ${S().light.ambient}`);
assert.ok(Math.abs(S().layoutParams.accumulationOptics - 0.999 * 0.25) < 0.01,
  `weather die set accumulationOptics, got ${S().layoutParams.accumulationOptics}`);
lands('kineticWeatherPass -> light', S().light, (d) => d.light);
lands('kineticWeatherPass -> accumulationOptics', S().layoutParams.accumulationOptics,
  (d) => d.layoutParams?.accumulationOptics);

// ── layersSlice: addLayer (id identity + snapshot seed) ─────────────────────
const before = S().layers.length;
S().addLayer();
assert.strictEqual(S().layers.length, before + 1, 'addLayer added a layer');
const newLayer = S().layers[S().layers.length - 1];
lands('addLayer -> layer id', newLayer.id,
  (d) => (d.layers || []).find((l) => l.id === newLayer.id)?.id);
lands('addLayer -> snapshot seed', S().seed, (d) => d.seed);

// ── layoutSlice: randomizeParam (paramUtils dice button, audit 3f) ──────────
// randomizeKey's default Math.random is intentional (paramUtils documents
// the split: CURATE passes a seeded stream, dice buttons keep the die).
// What 3e/3f require is that the roll LANDS: through the #1550 validating
// door into layoutParams, and from there into the document.
{
  const before = { ...S().layoutParams };
  try {
    Math.random = () => 0.999;
    S().randomizeParam('density');
    S().randomizeParam('count');
  } finally {
    Math.random = realRandom;
  }
  assert.ok(S().layoutParams.density !== before.density || S().layoutParams.count !== before.count,
    'randomizeParam rolls at least one of the two keys under a stubbed die');
  lands('randomizeParam -> layoutParams', S().layoutParams, (d) => d.layoutParams);
}

// ── davisSlice: EVOLVE palette deal (evolveTarget 'all') ────────────────────
useStore.setState({ evolveTarget: 'all', morphEvolve: false, lockedParams: {} });
S().triggerEvolve();
lands('triggerEvolve(all) -> paletteId', S().paletteId, (d) => d.paletteId);
lands('triggerEvolve(all) -> seed', S().seed, (d) => d.seed);

console.log('diceLanding.selfcheck: OK — every state-slice die lands in the serialized take');
