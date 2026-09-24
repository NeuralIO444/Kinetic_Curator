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
