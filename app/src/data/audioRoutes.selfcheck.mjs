// node src/data/audioRoutes.selfcheck.mjs
//
// #790 PR2 — the scene's audio route table is real state: sanitized at the one
// trust boundary, saved in the project (export, autosave, both parse branches),
// undoable (including a routes-ONLY edit, the gap the sun's undo has), cleared by
// a doc without it, and read by the live loop. Plus a guard that every wiring
// site mentions the field, so the next miss is caught here instead of in a bug.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { sanitizeAudioRoutes, isDefaultRoutes } from './audioRoutes.js';
import { DEFAULT_ROUTES, MAX_ROUTES } from '../gl/audioRoutes.mjs';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { useStore } from '../state/store.js';
import { DEFAULT_LAYOUT_PARAMS } from './layout-modes.js';

const R = (input, target, depth) => ({ input, target, depth });
const custom = [R('band.air', 'render.glow', 0.5), R('band.sub', 'render.breath', 0.05)];

// ── sanitizer ────────────────────────────────────────────────────────────
for (const off of [undefined, null, 0, 'x', {}, true]) assert.strictEqual(sanitizeAudioRoutes(off), null, `${String(off)} → default`);
assert.deepStrictEqual(sanitizeAudioRoutes([]), [], '[] is kept: the user deleted every route');
assert.strictEqual(sanitizeAudioRoutes([null, 7, { input: 'nope', target: 'render.glow', depth: 1 }]), null, 'a non-empty table with nothing usable is garbage → default, not silence');
assert.strictEqual(sanitizeAudioRoutes(DEFAULT_ROUTES.map((r) => ({ ...r }))), null, 'the default table is stored as null');
assert.strictEqual(sanitizeAudioRoutes([...DEFAULT_ROUTES].reverse().map((r) => ({ ...r }))), null, 'in any order');
assert.strictEqual(isDefaultRoutes(DEFAULT_ROUTES), true);
assert.strictEqual(isDefaultRoutes(custom), false);
assert.deepStrictEqual(sanitizeAudioRoutes(custom), custom, 'a custom table round-trips');
{
  const t = sanitizeAudioRoutes([R('beat', 'render.scale', 1e9), R('beat', 'render.alpha', -1e9), R('mid', 'render.glow', NaN), R('mid', 'render.breath', 0.1), R('beat', 'render.scale', 0.2), R('beat', 'render.glow', 0.5), { input: 'beat', target: '__proto__', depth: 1 }]);
  assert.deepStrictEqual(t, [R('beat', 'render.scale', 3), R('beat', 'render.alpha', -60), R('mid', 'render.breath', 0.1), R('beat', 'render.glow', 0.5)],
    'depth clamps to the target ceiling (± for inverse), NaN/dup-pair/__proto__ dropped, first wins');
  const many = sanitizeAudioRoutes(Array.from({ length: 40 }, (_, i) => R('band.sub', ['render.scale', 'render.alpha', 'render.breath', 'render.glow'][i % 4], 0.01 * ((i % 7) + 1))));
  assert.ok(many.length <= MAX_ROUTES, 'capped');
  const out = sanitizeAudioRoutes(custom);
  out[0].depth = 99;
  assert.strictEqual(custom[0].depth, 0.5, 'sanitize never aliases its input');
}

// ── project document: omitted when default, saved when customised, both parse branches ──
const base = { seed: 7, seedOffsets: {}, paletteId: 'praystation', layoutParams: { ...DEFAULT_LAYOUT_PARAMS }, enabledAssets: {}, quality: 'balanced', autoQuality: true };
{
  assert.ok(!('audioRoutes' in serializeProject({ ...base, audioRoutes: null })), 'untouched piece: no key (byte-identical export)');
  assert.ok(!('audioRoutes' in serializeProject({ ...base })), 'absent field: no key');
  assert.deepStrictEqual(serializeProject({ ...base, audioRoutes: [] }).audioRoutes, [], '[] is written');
  const doc = serializeProject({ ...base, audioRoutes: custom });
  assert.deepStrictEqual(doc.audioRoutes, custom);
  const wire = JSON.parse(JSON.stringify(doc));
  const v1 = parseProject(wire);
  assert.ok(v1.ok && v1.doc.version === 1);
  assert.deepStrictEqual(v1.doc.audioRoutes, custom, 'v1 branch reads it');
  assert.deepStrictEqual(parseProject({ ...wire, audioRoutes: [] }).doc.audioRoutes, [], 'v1: [] survives');
  const legacy = parseProject({ seed: 1, layout: { mode: 'grid' }, audioRoutes: custom });
  assert.ok(legacy.ok);
  assert.deepStrictEqual(legacy.doc.audioRoutes, custom, 'legacy branch reads it');
  assert.strictEqual(parseProject({ ...wire, audioRoutes: 'hostile' }).doc.audioRoutes, null, 'hostile value → default table');
  assert.strictEqual(parseProject(JSON.parse(JSON.stringify(serializeProject(base)))).doc.audioRoutes, null, 'absent → default');
}

// ── store: set, undo/redo (incl. a routes-ONLY edit), apply clears ──
{
  const S = () => useStore.getState();
  useStore.setState({ audioRoutes: null, historyUndoStack: [], historyRedoStack: [] });
  S().setAudioRoutes(DEFAULT_ROUTES.map((r) => ({ ...r })));
  assert.strictEqual(S().audioRoutes, null, 'setting the default table stores null');
  assert.strictEqual(S().historyUndoStack.length, 0, 'and is not an edit');
  S().setAudioRoutes(custom);
  assert.deepStrictEqual(S().audioRoutes, custom);
  assert.strictEqual(S().historyUndoStack.length, 1, 'an edit is one undo step');
  S().setAudioRoutes(custom);
  assert.strictEqual(S().historyUndoStack.length, 1, 'repeating it is a no-op');
  S().undo();
  assert.strictEqual(S().audioRoutes, null, 'undo restores the default table');
  S().redo();
  assert.deepStrictEqual(S().audioRoutes, custom, 'redo brings it back');
  // the dedupe gap: a routes-only change right after a capture of otherwise-identical state must still record
  S().setAudioRoutes([]);
  S().setAudioRoutes(custom);
  assert.strictEqual(S().historyUndoStack.length, 3, 'two routes-only edits in a row are two undo steps (not deduped away)');
  S().undo();
  assert.deepStrictEqual(S().audioRoutes, [], 'undo walks back through [] …');
  S().undo();
  assert.deepStrictEqual(S().audioRoutes, custom, '… to the earlier table');
  // a doc without routes uses the default table; a doc with routes applies them
  S().applyProject({ ...parseProject({ version: 1, seed: 1, audioRoutes: custom }).doc });
  assert.deepStrictEqual(S().audioRoutes, custom, 'import applies the table');
  S().applyProject({ ...parseProject({ version: 1, seed: 1 }).doc });
  assert.strictEqual(S().audioRoutes, null, 'a doc without routes resets to the default table');
  useStore.setState({ audioRoutes: null, historyUndoStack: [], historyRedoStack: [] });
}

// ── wiring: the loop reads the table; every save/restore site knows the field ──
{
  const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  assert.ok(/audioRoutes\(shapedAudio, \{ depth, scaleMod: scaleModAmt, alphaMod: alphaModAmt \}, s\.audioRoutes\)/.test(src('../gl/liveLoop.mjs')), 'the live loop passes the scene table');
  const sites = {
    'state/projectDocument.js': 3,      // serialize + both parse branches
    'state/slices/globalSlice.js': 1,   // applyProject
    'state/slices/audioSlice.js': 2,    // default + setter
    'state/history.js': 3,              // capture + signature + restore (the sun missed the signature)
    'hooks/useProjectPayload.js': 2,    // destructure + serialize call
    'hooks/useProjectAutosave.js': 1,   // autosave trigger
    'panels/PipelinePanel.jsx': 3,      // selector + destructure + prop
    'panels/pipeline/DataExportRow.jsx': 2,
    'gl/workerLiveLoop.js': 1,          // worker serializer whitelist
    'panels/StimulusPanel.jsx': 3,      // the matrix reads it
    'panels/stimulus/ModMatrix.jsx': 2,
  };
  for (const [file, min] of Object.entries(sites)) {
    const n = (src(`../${file}`).match(/audioRoutes|sanitizeAudioRoutes/g) || []).length;
    assert.ok(n >= min, `${file} must wire audioRoutes (found ${n}, expected >= ${min})`);
  }
}
console.log('audioRoutes (state) selfcheck: OK');
