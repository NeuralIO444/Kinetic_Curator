// node src/data/audioRoutes.selfcheck.mjs
//
// #790 PR2 — the scene's audio route table is real state: sanitized at the one
// trust boundary, saved in the project (export, autosave, both parse branches),
// undoable (including a routes-ONLY edit, the gap the sun's undo has), cleared by
// a doc without it, and read by the live loop. Plus a guard that every wiring
// site mentions the field, so the next miss is caught here instead of in a bug.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  sanitizeAudioRoutes, isDefaultRoutes, editableRoutes, nextRoute, patchRoute, removeRoute,
  routeDepthRange, defaultDepthFor, NEW_ROUTE_DEPTH,
} from './audioRoutes.js';
import { DEFAULT_ROUTES, MAX_ROUTES, ROUTE_INPUTS, ROUTE_TARGETS } from '../gl/audioRoutes.mjs';
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
  assert.ok(/audioRoutes\(shapedAudio, \{ depth, scaleMod: scaleModAmt, alphaMod: alphaModAmt \}, s\.audioRoutes, shapedBands\)/.test(src('../gl/liveLoop.mjs')), 'the live loop passes the scene table and the shaped bands');
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
// ── editing helpers (#790 PR4) ───────────────────────────────────────────
{
  const ed = editableRoutes(null);
  assert.deepStrictEqual(ed, DEFAULT_ROUTES.map((r) => ({ ...r })), 'editing the default starts from a copy of it');
  ed[0].depth = 99;
  assert.notStrictEqual(DEFAULT_ROUTES[0].depth, 99, 'and never aliases the frozen default');
  const mine = [R('band.air', 'render.glow', 0.5)];
  const copy = editableRoutes(mine);
  copy[0].depth = 1;
  assert.strictEqual(mine[0].depth, 0.5, 'editableRoutes copies a custom table too');

  // nextRoute: first free pair, preferring a clicked band, null when full
  assert.deepStrictEqual(nextRoute([], 'band.mud'), { input: 'band.mud', target: 'render.scale', depth: NEW_ROUTE_DEPTH['render.scale'] }, 'a clicked band starts on the first target');
  assert.deepStrictEqual(nextRoute([R('band.mud', 'render.scale', 0.1)], 'band.mud').target, 'render.alpha', '… then the next free one for that band');
  assert.strictEqual(nextRoute([], null).input, 'band.air', "'+ ROUTE' starts on AIR");
  const allMud = Object.keys(ROUTE_TARGETS).map((t) => R('band.mud', t, 0.01));
  assert.notStrictEqual(nextRoute(allMud, 'band.mud').input, 'band.mud', 'a band with every target taken moves on to another input');
  assert.strictEqual(nextRoute(Array.from({ length: MAX_ROUTES }, (_, i) => R(ROUTE_INPUTS[i % 12], Object.keys(ROUTE_TARGETS)[i % 4], 0.01))), null, 'full table: nothing to add');
  for (const t of Object.keys(ROUTE_TARGETS)) {
    const rg = routeDepthRange(t);
    assert.ok(rg.min === -rg.max && rg.step > 0, `${t} range is symmetric`);
    assert.ok(Math.abs(NEW_ROUTE_DEPTH[t]) <= rg.max, `${t}: a new route starts inside its range`);
  }
  assert.strictEqual(defaultDepthFor('beat', 'render.alpha'), 18, 'double-click resets to the default-table depth');
  assert.strictEqual(defaultDepthFor('band.air', 'render.scale'), NEW_ROUTE_DEPTH['render.scale'], 'or the new-route depth for a pair the default lacks');

  // patch / remove: immutable, refuse duplicates
  const t3 = [R('band.air', 'render.glow', 0.5), R('band.sub', 'render.breath', 0.05)];
  const patched = patchRoute(t3, 0, { depth: 0.9 });
  assert.strictEqual(patched[0].depth, 0.9);
  assert.strictEqual(t3[0].depth, 0.5, 'patch never mutates');
  assert.strictEqual(patchRoute(t3, 1, { input: 'band.air', target: 'render.glow' }), t3, 'a patch that duplicates another pair is refused');
  assert.strictEqual(patchRoute(t3, 9, { depth: 1 }), t3, 'patching a missing row is a no-op');
  assert.deepStrictEqual(removeRoute(t3, 0), [t3[1]]);
  assert.strictEqual(t3.length, 2, 'remove never mutates');
}

// ── store: the edit action (#790 PR4) ────────────────────────────────────
{
  const S = () => useStore.getState();
  useStore.setState({ audioRoutes: null, historyUndoStack: [], historyRedoStack: [] });
  // the first edit of the default customises it
  S().editAudioRoutes((t) => patchRoute(t, 0, { depth: 0.2 }));
  assert.ok(Array.isArray(S().audioRoutes) && S().audioRoutes.length === 7 && S().audioRoutes[0].depth === 0.2, 'first edit customises a copy of the default');
  assert.strictEqual(S().historyUndoStack.length, 1);
  // a no-op edit is not an edit
  S().editAudioRoutes((t) => t);
  assert.strictEqual(S().historyUndoStack.length, 1, 'no change → no undo step');
  // editing back to the default stores null again
  S().editAudioRoutes((t) => patchRoute(t, 0, { depth: 0.38 }));
  assert.strictEqual(S().audioRoutes, null, 'edited back to the default → null (RESET-equivalent)');
  S().undo(); S().undo();
  assert.strictEqual(S().audioRoutes, null);
  useStore.setState({ audioRoutes: null, historyUndoStack: [], historyRedoStack: [] });
  // slider drag: continuous ticks coalesce into ONE undo step; a discrete edit right after is its own step
  for (const d of [0.1, 0.12, 0.14, 0.16, 0.18]) S().editAudioRoutes((t) => patchRoute(t, 0, { depth: d }), true);
  assert.strictEqual(S().audioRoutes[0].depth, 0.18, 'the drag lands on its last value');
  assert.strictEqual(S().historyUndoStack.length, 1, 'a whole drag is one undo step');
  S().editAudioRoutes((t) => removeRoute(t, 1));
  assert.strictEqual(S().historyUndoStack.length, 2, 'a discrete edit is its own step');
  S().undo();
  assert.strictEqual(S().audioRoutes.length, 7, 'undo restores the removed route');
  S().undo();
  assert.strictEqual(S().audioRoutes, null, 'and undo of the drag restores the default');
  // delete every route: [] is kept (audio drives nothing) and is still undoable
  useStore.setState({ audioRoutes: null, historyUndoStack: [], historyRedoStack: [] });
  S().editAudioRoutes((t) => t.filter(() => false));
  assert.deepStrictEqual(S().audioRoutes, [], 'removing every route keeps [] (not the default)');
  S().setAudioRoutes(null);
  assert.strictEqual(S().audioRoutes, null, 'RESET');
  // add fills, caps, and refuses duplicates
  useStore.setState({ audioRoutes: null, historyUndoStack: [], historyRedoStack: [] });
  S().editAudioRoutes((t) => { const r = nextRoute(t); return r ? [...t, r] : t; });
  assert.strictEqual(S().audioRoutes.length, 8);
  for (let i = 0; i < 20; i++) S().editAudioRoutes((t) => { const r = nextRoute(t); return r ? [...t, r] : t; });
  assert.strictEqual(S().audioRoutes.length, MAX_ROUTES, 'adding stops at the cap');
  useStore.setState({ audioRoutes: null, historyUndoStack: [], historyRedoStack: [] });
}

// ── UI wiring (#790 PR4) ─────────────────────────────────────────────────
{
  const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const ui = src('../panels/stimulus/ModMatrix.jsx');
  for (const s of ['Route ${index + 1} input', 'Route ${index + 1} target', 'Route ${index + 1} depth', 'Remove route ${index + 1}', '+ ROUTE', 'CLEAR', 'RESET', 'frame glow', 'not routed:']) {
    assert.ok(ui.includes(s), `the matrix offers ${s}`);
  }
  assert.ok(/disabled=\{taken\(id, route\.target\)\}/.test(ui) && /disabled=\{taken\(route\.input, id\)\}/.test(ui), 'a duplicate pair cannot be picked');
  assert.ok(/onEdit\(\(t\) => patchRoute\(t, index, \{ depth: Number\(e\.target\.value\) \}\), true\)/.test(ui), 'the depth slider edits continuously (one undo step per drag)');
  assert.ok(/disabled=\{full\}/.test(ui) && /disabled=\{!custom\}/.test(ui), '+ ROUTE stops at the cap; RESET only when customised');
  assert.ok(/disabled=\{table\.length === 0\} onClick=\{\(\) => setAudioRoutes\(\[\]\)\}/.test(ui), 'CLEAR empties the table (start from scratch), greyed when already empty');
  const meter = src('../panels/stimulus/MeterHero.jsx');
  assert.ok(/editAudioRoutes\(\(t\) => \{ const n = nextRoute\(t, input\)/.test(meter) && /onClick=\{routeBand\}/.test(meter), 'a click on a meter band adds a route for that band');
}
console.log('audioRoutes (state) selfcheck: OK');
