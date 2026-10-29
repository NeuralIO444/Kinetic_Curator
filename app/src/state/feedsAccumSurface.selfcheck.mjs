// feedsAccumSurface.selfcheck.mjs — #1834 (#1806 slice 3): the FEEDS
// ACCUM surface. Slices 1–2 built the seam and wired the recipe
// (accumInput / accumFeed suites); this suite proves the performer
// surface slice 3 adds:
//
// - the whole chain for real (busChain style): emitting
//   LAYER_TOGGLE_FEEDS_ACCUM on the stratum row's event flips the flag
//   on the store's document layer — the key appears as exactly `false`
//   and disappears again on re-enable (absence is the on state; the key
//   is never spelled `true` anywhere in the system).
// - the toggle is a layers undo entry; on FX/MATH strata it is a no-op
//   (they never feed — no key, no undo entry).
// - a duplicate inherits the flag, like every other stratum property.
// - project JSON round-trip, the slice's acceptance pin: serialize →
//   parse → apply → serialize keeps the layers byte-identical, the flag
//   rides only while off and only on the flagged stratum, and an all-on
//   project contains no `feedsAccum` anywhere (every existing project
//   saves exactly as it did before the flag existed).
// - load normalization edges: a spelled `true`, a hostile non-boolean,
//   and flags on FX/MATH layers all load as absence (on) — only exactly
//   `false` on a content/pattern layer survives, matching the scene
//   contract's law from slice 2.
// - the contract link: the round-tripped document builds the same
//   selection slice 2 proved — the flag reaches buildSceneContract and
//   accumFeedSelection names the feeding strata.
// - the collapsed BUILD block confesses the off state in words
//   ('no feed'), the #1409 dish-off rule.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Events, emit } from '../composition/eventBus.js';
import { wireEventBus } from '../composition/wireEventBus.js';
import { applyAction } from './applyAction.js';
import { useStore } from './store.js';
import { serializeProject, parseProject } from './projectDocument.js';
import { strataSummary } from '../panels/build/strataSummary.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const okAsync = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// The dispatch pipe coalesces per-frame streams on requestAnimationFrame;
// a microtask stands in for a frame in Node (busChain's setup).
globalThis.requestAnimationFrame = (fn) => {
  queueMicrotask(() => fn(performance.now()));
  return 1;
};
globalThis.cancelAnimationFrame = () => {};
wireEventBus(applyAction);

const S = () => useStore.getState();
const layerOf = (id) => S().layers.find((l) => l.id === id);
const undoDepth = () => S().historyUndoStack.length;

// A deterministic world, installed through the real load path: two
// content strata, a pattern stratum, an FX stratum, a MATH stratum.
const rawDoc = {
  version: 1,
  seed: 0xbeef,
  paletteId: 'praystation',
  layers: [
    { id: 'kc-a', name: 'A', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    { id: 'kc-b', name: 'B', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    { id: 'pt-1', name: 'P', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1 },
    {
      id: 'fx-1',
      name: 'F',
      type: 'fx',
      visible: true,
      layerBlendMode: 'normal',
      layerOpacity: 1,
      effects: [{ kind: 'invert', params: {} }],
    },
    { id: 'mt-1', name: 'M', type: 'math', visible: true, layerBlendMode: 'normal', layerOpacity: 1, effects: [] },
  ],
  activeLayerId: 'kc-a',
};
const parsed = parseProject(JSON.parse(JSON.stringify(rawDoc)));
assert.ok(parsed.ok, `fixture doc parses: ${parsed.error || ''}`);
const install = () => S().applyProject(parsed.doc);
install();
assert.deepEqual(
  S().layers.map((l) => l.id),
  ['kc-a', 'kc-b', 'pt-1', 'fx-1', 'mt-1'],
  'the fixture world is installed',
);

ok('bus chain: the row event flips the flag — key appears as false, disappears on re-enable, never true', () => {
  assert.ok(!('feedsAccum' in layerOf('kc-b')), 'starts keyless (on)');
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'kc-b' });
  assert.equal(layerOf('kc-b').feedsAccum, false, 'one tap: feedsAccum === false');
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'kc-b' });
  assert.ok(!('feedsAccum' in layerOf('kc-b')), 'second tap: the key is gone, not spelled true');
  assert.ok(!('feedsAccum' in layerOf('kc-a')), 'the neighbour stratum is untouched');
});

ok('the toggle is an undoable layers entry', () => {
  const before = undoDepth();
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'kc-b' });
  assert.equal(layerOf('kc-b').feedsAccum, false);
  assert.equal(undoDepth(), before + 1, 'one undo entry pushed');
  S().undo();
  assert.ok(!('feedsAccum' in layerOf('kc-b')), 'undo restores the on state (keyless)');
});

ok('FX/MATH strata: the toggle is a no-op — no key, no undo entry, no change', () => {
  for (const id of ['fx-1', 'mt-1']) {
    const before = undoDepth();
    const snapshot = JSON.stringify(layerOf(id));
    emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id });
    assert.ok(!('feedsAccum' in layerOf(id)), `${id}: no flag lands on an adjustment stratum`);
    assert.equal(JSON.stringify(layerOf(id)), snapshot, `${id}: layer unchanged`);
    assert.equal(undoDepth(), before, `${id}: no undo entry for a no-op`);
  }
});

ok('pattern stratum: the same chain toggles its flag', () => {
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'pt-1' });
  assert.equal(layerOf('pt-1').feedsAccum, false, 'pattern strata feed, so they can stop');
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'pt-1' });
  assert.ok(!('feedsAccum' in layerOf('pt-1')), 'and start again');
});

ok('a duplicate inherits the flag — content', () => {
  install(); // fresh world: 3 content-group strata, one duplicate fits the cap
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'kc-b' });
  S().duplicateLayer('kc-b');
  const copyB = S().layers.find((l) => l.id !== 'kc-b' && l.type === 'content' && l.feedsAccum === false);
  assert.ok(copyB, 'the content copy carries feedsAccum: false');
});

ok('a duplicate inherits the flag — pattern', () => {
  install();
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'pt-1' });
  S().duplicateLayer('pt-1');
  const copies = S().layers.filter((l) => l.type === 'pattern');
  assert.equal(copies.length, 2, 'pattern duplicated');
  assert.ok(
    copies.every((l) => l.feedsAccum === false),
    'the pattern copy carries the flag too',
  );
});

// --- project JSON round-trip ---------------------------------------------

ok('serialize: the flag is written only while off, only on the flagged stratum', () => {
  install(); // fresh world, all-on
  const clean = JSON.stringify(serializeProject(S()));
  assert.ok(!clean.includes('feedsAccum'), 'an all-on project contains no feedsAccum anywhere');
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'kc-a' });
  const flagged = JSON.stringify(serializeProject(S()));
  assert.equal(flagged.split('"feedsAccum"').length - 1, 1, 'exactly one feedsAccum key in the document');
  const doc = JSON.parse(flagged);
  assert.equal(doc.layers.find((l) => l.id === 'kc-a').feedsAccum, false);
  assert.ok(
    doc.layers.every((l) => l.id === 'kc-a' || !('feedsAccum' in l)),
    'no other stratum carries the key',
  );
});

ok('round-trip pin: serialize → parse → apply → serialize keeps the layers byte-identical', () => {
  const before = JSON.stringify(serializeProject(S()).layers);
  const wire = JSON.stringify(serializeProject(S()));
  const back = parseProject(JSON.parse(wire));
  assert.ok(back.ok, `re-parse ok: ${back.error || ''}`);
  S().applyProject(back.doc);
  const after = JSON.stringify(serializeProject(S()).layers);
  assert.equal(after, before, 'the layers survive the round trip byte for byte');
  assert.equal(layerOf('kc-a').feedsAccum, false, 'the flagged stratum is still off after load');
  assert.ok(!('feedsAccum' in layerOf('kc-b')), 'the feeding stratum is still keyless after load');
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'kc-a' }); // leave the world all-on
});

ok('normalize edges: only exactly false on content/pattern survives a load', () => {
  const hostile = {
    version: 1,
    seed: 99,
    layers: [
      { id: 'a', type: 'content', feedsAccum: true },
      { id: 'b', type: 'content', feedsAccum: 'no' },
      { id: 'c', type: 'content', feedsAccum: false },
      { id: 'p', type: 'pattern', feedsAccum: false },
      { id: 'f', type: 'fx', feedsAccum: false, effects: [] },
      { id: 'm', type: 'math', feedsAccum: false, effects: [] },
    ],
    activeLayerId: 'a',
  };
  const res = parseProject(JSON.parse(JSON.stringify(hostile)));
  assert.ok(res.ok, `hostile doc still parses: ${res.error || ''}`);
  const byId = Object.fromEntries(res.doc.layers.map((l) => [l.id, l]));
  assert.ok(!('feedsAccum' in byId.a), 'spelled true loads as absence (on)');
  assert.ok(!('feedsAccum' in byId.b), 'a non-boolean loads as absence (on)');
  assert.equal(byId.c.feedsAccum, false, 'content false survives');
  assert.equal(byId.p.feedsAccum, false, 'pattern false survives');
  assert.ok(!('feedsAccum' in byId.f), 'an FX flag is dropped — FX never feeds');
  assert.ok(!('feedsAccum' in byId.m), 'a MATH flag is dropped — MATH never feeds');
});

await okAsync('contract link: the round-tripped document derives the same selection slice 2 proved', async () => {
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'kc-b' });
  const wire = JSON.stringify(serializeProject(S()));
  const back = parseProject(JSON.parse(wire));
  assert.ok(back.ok);
  const { resolveLayers } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');
  const { buildSceneContract } = await import('../gl/sceneContract.js');
  const { accumFeedSelection } = await import('../gl/renderer.mjs');
  const caps = getRenderCaps('balanced', false);
  const contract = buildSceneContract({ doc: back.doc, resolvedLayers: resolveLayers(back.doc, { caps }), caps });
  const cB = contract.layers.find((l) => l.id === 'kc-b');
  const cA = contract.layers.find((l) => l.id === 'kc-a');
  assert.equal(cB.feedsAccum, false, 'the loaded flag reaches the contract');
  assert.ok(!('feedsAccum' in cA), 'the feeding stratum stays keyless in the contract');
  const expected = contract.compositeOrder.filter((id) => {
    const l = contract.layers.find((x) => x.id === id);
    return l && (l.type === 'content' || l.type === 'pattern') && l.feedsAccum !== false;
  });
  assert.deepEqual(accumFeedSelection(contract), expected, 'the selection is the feeding strata, in order');
  assert.ok(!expected.includes('kc-b'), 'kc-b is out of the selection');
  emit(Events.LAYER_TOGGLE_FEEDS_ACCUM, { id: 'kc-b' }); // restore
});

// --- the collapsed confession ----------------------------------------------

ok("the collapsed BUILD block confesses the off state ('no feed')", () => {
  const kc = {
    type: 'content',
    visible: true,
    layerBlendMode: 'normal',
    patch: { mode: 'off', to: null, strength: 0.16 },
  };
  assert.equal(strataSummary(kc, 'content', 80), 'wet 80%', 'unflagged line unchanged');
  assert.equal(
    strataSummary({ ...kc, feedsAccum: false }, 'content', 80),
    'no feed · wet 80%',
    'flagged content confesses ahead of the wet readout',
  );
  const pat = { type: 'pattern', pattern: { density: 9, mode: 'QUILT' } };
  assert.ok(!strataSummary(pat, 'content', 0).includes('no feed'), 'unflagged pattern unchanged');
  assert.ok(
    strataSummary({ ...pat, feedsAccum: false }, 'content', 0).endsWith(' · no feed'),
    'flagged pattern confesses',
  );
});

// --- source pins -------------------------------------------------------------

ok('source pins: the row offers the toggle only on non-adjustment strata; the setter deletes the key', () => {
  const stack = readFileSync(new URL('../panels/build/LayerStack.jsx', import.meta.url), 'utf8');
  assert.match(
    stack,
    /!adj && \(\s*<button[\s\S]{0,200}?layer\.feedsAccum === false \? ' feed-off'/,
    'the toggle renders only when !adj, struck when off',
  );
  assert.match(
    stack,
    /emit\(Events\.LAYER_TOGGLE_FEEDS_ACCUM, \{ id: layer\.id \}\)/,
    'the toggle emits the chain event',
  );
  const slice = readFileSync(new URL('./slices/layersSlice.js', import.meta.url), 'utf8');
  assert.match(slice, /toggleLayerFeedsAccum: \(id\) =>/, 'the store setter exists');
  assert.match(slice, /delete next\.feedsAccum/, 're-enable deletes the key (absence is the on state)');
});

console.log(`feedsAccumSurface.selfcheck: OK (${n} cases)`);
