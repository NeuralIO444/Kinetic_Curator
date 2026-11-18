// node src/state/projectDocument.fields.selfcheck.mjs
// #2321 (recipes-v3-spec §3.1) — every key serializeProject can write has a scene/rig/meta class.
//
// Two guards:
//  1. STATIC (complete): scan serializeProject's own source for every key it can write and require the class
//     table to match it exactly — an unclassified key AND a stale table entry both fail, by name.
//  2. RUNTIME (sound): serialize a dressed state and require every key it actually emits to be classed. This
//     catches a key the scan's patterns could not see (a spread, a computed key). It reaches only the keys that
//     simple fixtures survive the document sanitizers for, so guard 1 is the one that proves completeness.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serializeProject, sceneOf, DOC_FIELD_CLASS } from './projectDocument.js';

const SRC = readFileSync(fileURLToPath(new URL('./projectDocument.js', import.meta.url)), 'utf8');

/** Every key the body of `serializeProject` in `src` can write: the opening literal's keys plus `doc.<key> =`. */
function serializedKeys(src) {
  const start = src.indexOf('export function serializeProject(');
  assert.ok(start >= 0, 'serializeProject found');
  const end = src.indexOf('\n}\n', start);
  assert.ok(end > start, 'serializeProject body found');
  const body = src
    .slice(start, end)
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '')) // comments never name a key
    .join('\n');
  const keys = new Set();
  const lit = /const doc = \{([\s\S]*?)\n  \};/.exec(body);
  assert.ok(lit, 'opening literal found');
  for (const m of lit[1].matchAll(/^    ([A-Za-z]+):/gm)) keys.add(m[1]);
  for (const m of body.matchAll(/\bdoc\.([A-Za-z]+)\s*=(?!=)/g)) keys.add(m[1]);
  return keys;
}

function diffAgainstTable(keys) {
  const table = new Set(Object.keys(DOC_FIELD_CLASS));
  return {
    unclassified: [...keys].filter((k) => !table.has(k)).sort(),
    stale: [...table].filter((k) => !keys.has(k)).sort(),
  };
}

// The table itself: only the three classes.
for (const [k, c] of Object.entries(DOC_FIELD_CLASS))
  assert.ok(c === 'scene' || c === 'rig' || c === 'meta', `${k} has a valid class (${c})`);
assert.ok(Object.isFrozen(DOC_FIELD_CLASS), 'the table is frozen');

// 1. static — the scan and the table agree, both ways.
{
  const keys = serializedKeys(SRC);
  assert.ok(keys.size >= 35, `the scan found the document's keys (${keys.size})`);
  const { unclassified, stale } = diffAgainstTable(keys);
  assert.deepStrictEqual(
    unclassified,
    [],
    `serializeProject writes unclassified key(s): ${unclassified.join(', ')} — add them to DOC_FIELD_CLASS`,
  );
  assert.deepStrictEqual(
    stale,
    [],
    `DOC_FIELD_CLASS names key(s) serializeProject no longer writes: ${stale.join(', ')}`,
  );
}

// The guard has teeth: a key injected into serializeProject is named; a removed one is reported stale.
{
  const injected = SRC.replace('  return doc;\n}\n', '  doc.fakeInjectedKey = 1;\n  return doc;\n}\n');
  assert.notStrictEqual(injected, SRC, 'injection applied');
  assert.deepStrictEqual(diffAgainstTable(serializedKeys(injected)).unclassified, ['fakeInjectedKey']);
  const dropped = SRC.replace('  if (state.constructLead === true) doc.constructLead = true;', '  if (false) {}');
  assert.notStrictEqual(dropped, SRC, 'removal applied');
  assert.deepStrictEqual(diffAgainstTable(serializedKeys(dropped)).stale, ['constructLead']);
}

// 2. runtime — every key a dressed state really emits is classed.
const dressed = {
  seed: 7,
  seedOffsets: { a: 1 },
  paletteId: 'praystation',
  layoutParams: { mode: 'grid' },
  enabledAssets: { a: true },
  quality: 'performance',
  autoQuality: false,
  projectTitle: 'T',
  assetWeightOverrides: { a: 2 },
  paletteOverrides: { praystation: { 0: '#ff0000' } },
  paletteLocks: [0, 1],
  light: { azimuth: 0.3, elevation: 0.5, intensity: 0.8 },
  world: { ground: '#112233', ink: '#eeeeee' },
  constructLead: true,
  canvasW: 1080,
  canvasH: 1920,
  canvasFps: 30,
  canvasPresetId: 'story',
  stageMode: 'live',
  midiBanks: [
    { name: 'A', map: {} },
    { name: 'B', map: { cc1: 'x' } },
  ],
  midiActiveBank: 1,
  mathMacros: [{ id: 'm1' }],
};
const emitted = Object.keys(serializeProject(dressed));
for (const k of emitted) assert.ok(k in DOC_FIELD_CLASS, `serializeProject emitted unclassified key "${k}"`);
const single = Object.keys(
  serializeProject({ ...dressed, midiBanks: undefined, midiActiveBank: undefined, midiMap: { cc1: 'x' } }),
);
for (const k of single) assert.ok(k in DOC_FIELD_CLASS, `serializeProject emitted unclassified key "${k}"`);

// sceneOf: exactly the scene keys, none of the rig, and the rulings hold.
{
  const scene = sceneOf(dressed);
  for (const k of Object.keys(scene))
    assert.strictEqual(DOC_FIELD_CLASS[k], 'scene', `${k} is in sceneOf, so it must be scene`);
  for (const k of [
    'title',
    'audioRoutes',
    'paletteLocks',
    'kits',
    'assetTags',
    'quality',
    'autoQuality',
    'canvasFps',
    'stageMode',
    'midiBanks',
    'mathMacros',
    'version',
  ])
    assert.ok(!(k in scene), `${k} never rides a recipe`);
  for (const k of [
    'canvasW',
    'canvasH',
    'canvasPresetId',
    'constructLead',
    'seed',
    'paletteOverrides',
    'light',
    'world',
  ])
    assert.ok(k in scene, `${k} rides a recipe`);
  assert.strictEqual(scene.canvasW, 1080);
  // Same normalizers as a save: sceneOf is a strict subset of the serialized document, value for value.
  const full = serializeProject(dressed);
  for (const [k, v] of Object.entries(scene)) assert.deepStrictEqual(v, full[k], `${k} matches the save`);
}

console.log(
  `projectDocument.fields.selfcheck: OK (${Object.keys(DOC_FIELD_CLASS).length} classed, ${emitted.length} emitted)`,
);
