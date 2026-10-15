// node src/state/projectWatch.selfcheck.mjs
// The autosave must wake for every field the project document saves. This derives the list from projectDocument.js and
// from behaviour, so a saved field that nobody watches fails here rather than costing someone an edit on close.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => mem.delete(k) };
const { PROJECT_STATE_KEYS, projectDirty } = await import('./projectWatch.mjs');
const { serializeProject } = await import('./projectDocument.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

ok('every store field serializeProject reads is watched (derived from the source, so a new one cannot slip past)', () => {
  const code = src('./projectDocument.js');
  const body = code.slice(code.indexOf('export function serializeProject'), code.indexOf('export function', code.indexOf('export function serializeProject') + 10));
  const read = new Set([...body.matchAll(/\bstate\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
  assert.ok(read.size >= 20, `found ${read.size} fields read`); // a floor, so an empty scan cannot pass vacuously
  // the canvas spec is read as a whole object (sanitizeCanvasSpec(state)): its five fields stand in for it
  const canvas = ['canvasW', 'canvasH', 'canvasFps', 'canvasPresetId', 'stageMode'];
  for (const k of [...read, ...canvas]) assert.ok(PROJECT_STATE_KEYS.includes(k), `${k} is saved but not watched`);
});

ok('nothing is watched that the document does not read (a stray key would write on every unrelated change)', () => {
  const code = src('./projectDocument.js');
  const body = code.slice(code.indexOf('export function serializeProject'), code.indexOf('export function', code.indexOf('export function serializeProject') + 10));
  const canvas = new Set(['canvasW', 'canvasH', 'canvasFps', 'canvasPresetId', 'stageMode']);
  for (const k of PROJECT_STATE_KEYS) assert.ok(canvas.has(k) || new RegExp(`\\bstate\\.${k}\\b`).test(body), `${k} is watched but never serialized`);
  assert.equal(new Set(PROJECT_STATE_KEYS).size, PROJECT_STATE_KEYS.length, 'no duplicates');
});

ok('by behaviour: changing each watched field changes the saved document, and wakes the autosave', () => {
  const base = {
    seed: 1, seedOffsets: {}, paletteId: 'praystation', layoutParams: {}, enabledAssets: {}, quality: 'balanced', autoQuality: true,
    assetWeightOverrides: {}, projectTitle: '', paletteOverrides: null, paletteLocks: {}, customAssets: [], light: null,
    assetKineme: {}, assetStill: {}, assetAttach: {}, creatureCount: 0, audioRoutes: null, midiMap: {}, mathMacros: [],
    layers: null, activeLayerId: null, layerSnapshots: {},
    canvasW: 1000, canvasH: 700, canvasFps: 60, canvasPresetId: 'custom', stageMode: 'preview',
  };
  const changed = {
    seed: 2, seedOffsets: { spatial: 3 }, paletteId: 'bone', layoutParams: { count: 99 }, enabledAssets: { a: true }, quality: 'performance',
    autoQuality: false, assetWeightOverrides: { a: 'heavy' }, projectTitle: 'Night', paletteLocks: { 0: true }, creatureCount: 4,
    canvasW: 1920, canvasH: 1080, canvasFps: 30, stageMode: 'fullscreen', midiMap: { 'note:1:36': { target: 'evolve' } },
  };
  const woke = [];
  for (const [k, v] of Object.entries(changed)) {
    const next = { ...base, [k]: v };
    assert.equal(projectDirty(next, base), true, `${k} wakes the autosave`);
    woke.push(k);
  }
  assert.ok(woke.length >= 15);
  // the field was invisible before this change: the 12 the old subscriber watched
  const OLD = ['seed', 'paletteId', 'quality', 'layoutParams', 'enabledAssets', 'assetWeightOverrides', 'assetKineme', 'audioRoutes', 'midiMap', 'customAssets', 'layers', 'paletteOverrides'];
  const newlyWatched = PROJECT_STATE_KEYS.filter((k) => !OLD.includes(k));
  assert.ok(newlyWatched.includes('seedOffsets') && newlyWatched.includes('projectTitle') && newlyWatched.includes('canvasW') && newlyWatched.includes('light') && newlyWatched.includes('mathMacros'));
  assert.equal(newlyWatched.length, PROJECT_STATE_KEYS.length - OLD.length);
  assert.ok(serializeProject({ ...base, projectTitle: 'Night' }).title === 'Night', 'and the title really is in the document');
});

ok('an unrelated change does not wake it', () => {
  const s = { seed: 1, layoutParams: {}, ephemeral: 1, persistStatus: 'ok', isRendering: false };
  assert.equal(projectDirty({ ...s, isRendering: true, persistStatus: 'unsaved', ephemeral: 2 }, s), false);
  assert.equal(projectDirty(null, s), false); assert.equal(projectDirty(s, undefined), false);
});

ok('wired: the subscriber uses the list, and a pending change is written when the page hides or closes', () => {
  const hook = src('../hooks/useProjectAutosave.js');
  assert.match(hook, /import \{ projectDirty \} from '\.\.\/state\/projectWatch\.mjs'/);
  assert.match(hook, /if \(!projectDirty\(state, prev\)\) return;/);
  assert.ok(!/state\.paletteOverrides === prev\.paletteOverrides/.test(hook), 'the hand-kept dozen is gone');
  assert.match(hook, /window\.addEventListener\('pagehide', flush\)/);
  assert.match(hook, /document\.addEventListener\('visibilitychange', onVisibility\)/);
  assert.match(hook, /visibilityState === 'hidden'\) flush\(\)/);
  assert.match(hook, /const flush = \(\) => \{ if \(firstChangeAt\.current != null \|\| timer\.current\) doWrite\(\); \};/, 'only a pending change is flushed');
});

console.log(`projectWatch.selfcheck: ${n} checks passed`);
