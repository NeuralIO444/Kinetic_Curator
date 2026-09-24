// layersPatch.selfcheck — PATCH settings state contract (#506).
// Node-only, via the real store (qaRegression.selfcheck.mjs pattern:
// useStore.setState seeds deterministic layers, then call the action).
import { strict as assert } from 'node:assert';
import { useStore } from './store.js';

function seedTwoTracks() {
  useStore.setState({
    layers: [
      { id: 'kc-a', name: 'KC-1', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } },
      { id: 'kc-b', name: 'KC-2', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } },
    ],
    activeLayerId: 'kc-a',
  });
}
const patchOf = (id) => useStore.getState().layers.find((l) => l.id === id).patch;

// Fresh + initial layers carry the off/null/0.16 default.
{
  seedTwoTracks();
  assert.deepStrictEqual(patchOf('kc-a'), { mode: 'off', to: null, strength: 0.16 }, 'default patch');
  console.log('[selfcheck] layersPatch defaults');
}

// Strength clamps to [0,1]; missing preserves previous (?? falls through
// null/undefined only — NaN passes through Number() and stores NaN, which
// the resolver's patchStrength guards back to 0.16; documented, not hidden).
{
  seedTwoTracks();
  const { setLayerPatch } = useStore.getState();
  setLayerPatch('kc-a', { mode: 'mod', to: 'kc-b', strength: 2 });
  assert.strictEqual(patchOf('kc-a').strength, 1, 'strength clamps high');
  setLayerPatch('kc-a', { mode: 'mod', to: 'kc-b', strength: -1 });
  assert.strictEqual(patchOf('kc-a').strength, 0, 'strength clamps low');
  setLayerPatch('kc-a', { mode: 'field', to: 'kc-b' });
  assert.strictEqual(patchOf('kc-a').strength, 0, 'missing preserves previous (0)');
  setLayerPatch('kc-a', { mode: 'field', to: 'kc-b', strength: NaN });
  assert.ok(Number.isNaN(patchOf('kc-a').strength), 'NaN stores NaN (resolver guards to 0.16)');
  console.log('[selfcheck] layersPatch strength bounds');
}

// Mode whitelist + stable-id target (self/dangling fall back to previous).
{
  seedTwoTracks();
  const { setLayerPatch } = useStore.getState();
  setLayerPatch('kc-a', { mode: 'wobble', to: 'kc-b', strength: 0.5 });
  assert.strictEqual(patchOf('kc-a').mode, 'off', 'garbage mode becomes off');
  setLayerPatch('kc-a', { mode: 'feed', to: 'kc-b', strength: 0.5 });
  assert.strictEqual(patchOf('kc-a').to, 'kc-b', 'valid target kept');
  setLayerPatch('kc-a', { mode: 'feed', to: 'kc-a', strength: 0.5 });
  assert.strictEqual(patchOf('kc-a').to, 'kc-b', 'self target falls back to previous');
  setLayerPatch('kc-a', { mode: 'feed', to: 'gone', strength: 0.5 });
  assert.strictEqual(patchOf('kc-a').to, 'kc-b', 'dangling target falls back to previous');
  console.log('[selfcheck] layersPatch mode + target guards');
}

// Removing the last content track is refused: the fallback would otherwise
// make an FX track the active layer (FX is never active — projectNormalize
// enforces the same on load). FX tracks and non-last content tracks still go.
{
  useStore.setState(useStore.getInitialState());
  useStore.getState().addFxLayer();
  const [kc, fx] = useStore.getState().layers.map((l) => l.id);
  useStore.getState().removeLayer(kc);
  let s = useStore.getState();
  assert.strictEqual(s.layers.length, 2, 'last content track cannot be removed');
  assert.strictEqual(s.activeLayerId, kc, 'active layer stays the content track');
  s.removeLayer(fx);
  s = useStore.getState();
  assert.deepStrictEqual(s.layers.map((l) => l.id), [kc], 'FX track still removable');
  console.log('[selfcheck] layersPatch last-content-track guard');
}

// Removing a track clears other layers' patch.to that pointed at it (same rule
// as projectNormalize on load: to -> null, mode unchanged). Unrelated targets stay.
{
  useStore.setState(useStore.getInitialState());
  useStore.setState({
    layers: ['kc-a', 'kc-b', 'kc-c'].map((id, i) => ({ id, name: `KC-${i + 1}`, visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } })),
    activeLayerId: 'kc-a',
  });
  const { setLayerPatch, removeLayer } = useStore.getState();
  setLayerPatch('kc-a', { mode: 'field', to: 'kc-b', strength: 0.5 });
  setLayerPatch('kc-c', { mode: 'mod', to: 'kc-a', strength: 0.5 });
  removeLayer('kc-b');
  assert.strictEqual(patchOf('kc-a').to, null, 'patch to a removed track is cleared');
  assert.strictEqual(patchOf('kc-a').mode, 'field', 'mode is left alone');
  assert.strictEqual(patchOf('kc-c').to, 'kc-a', 'patch to a surviving track is untouched');
  console.log('[selfcheck] layersPatch removal clears dead target');
}

// Solo (KC_HANDOFF T6): solo among KC tracks only — FX tracks are never hidden by
// it — and un-solo restores the visibility the user had before soloing.
{
  const L = (id, type, visible = true) => ({ id, name: id, type, visible, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } });
  const vis = () => Object.fromEntries(useStore.getState().layers.map((l) => [l.id, l.visible]));
  useStore.setState(useStore.getInitialState());
  useStore.setState({ layers: [L('kc-a', 'content'), L('kc-b', 'content', false), L('kc-c', 'content'), L('fx-1', 'fx')], activeLayerId: 'kc-a', soloStash: null });
  const { soloLayer } = useStore.getState();

  soloLayer('kc-a');
  assert.deepStrictEqual(vis(), { 'kc-a': true, 'kc-b': false, 'kc-c': false, 'fx-1': true }, 'solo hides other KC tracks, leaves FX alone');
  soloLayer('kc-a');
  assert.deepStrictEqual(vis(), { 'kc-a': true, 'kc-b': false, 'kc-c': true, 'fx-1': true }, 'un-solo restores the pre-solo visibility (kc-b stays hidden)');

  const before = vis();
  soloLayer('fx-1');
  assert.deepStrictEqual(vis(), before, 'soloing an FX track is a no-op');

  // No stash (e.g. a loaded doc that was saved mid-solo): un-solo falls back to all KC visible.
  useStore.setState({ layers: [L('kc-a', 'content'), L('kc-b', 'content', false), L('fx-1', 'fx')], soloStash: null });
  soloLayer('kc-a');
  assert.deepStrictEqual(vis(), { 'kc-a': true, 'kc-b': true, 'fx-1': true }, 'stash-less un-solo shows every KC track');
  console.log('[selfcheck] layersPatch solo content-only + restore');
}
