// node src/state/tapeBudget.selfcheck.mjs
// #342 — tape pre-flight: the shared fill-% helper, and the arm gate
// (addLayer/addFxLayer/duplicateLayer) that uses it to refuse a new
// track/FX slot rather than let the governor silently degrade the render.
import assert from 'node:assert';
import { tapeFillPct, isTapeFull, FRAME_BUDGET_MS, TAPE_FULL_PCT } from './tapeBudget.js';
import { useStore } from './store.js';

// --- tapeFillPct / isTapeFull: pure, no store involved ---------------------
assert.strictEqual(tapeFillPct({}), 0, 'no data at all -> 0%, never a false full');
assert.strictEqual(tapeFillPct({ fps: 0, stageTimings: {} }), 0, 'zero fps, no gpu timing -> 0%');
assert.strictEqual(isTapeFull({}), false, 'no data -> not full');

const at60fps = tapeFillPct({ fps: 60, stageTimings: {} });
assert.ok(Math.abs(at60fps - 100) < 1, `60fps with no GPU timing reads ~100% (rAF-implied), got ${at60fps}`);

const gpuOver = tapeFillPct({ fps: 60, stageTimings: { gpuFrame: FRAME_BUDGET_MS * 1.5 } });
assert.ok(Math.abs(gpuOver - 150) < 1, `GPU timing overrides the fps fallback when present, got ${gpuOver}`);
assert.strictEqual(isTapeFull({ fps: 60, stageTimings: { gpuFrame: FRAME_BUDGET_MS * 1.5 } }), true);

const gpuUnder = tapeFillPct({ fps: 5, stageTimings: { gpuFrame: FRAME_BUDGET_MS * 0.5 } });
assert.ok(Math.abs(gpuUnder - 50) < 1, 'GPU timing wins over a stale/low fps reading too');
assert.strictEqual(isTapeFull({ stageTimings: { gpuFrame: FRAME_BUDGET_MS } }), true, `exactly ${TAPE_FULL_PCT}% counts as full`);
assert.strictEqual(isTapeFull({ stageTimings: { gpuFrame: FRAME_BUDGET_MS * 0.99 } }), false, 'just under counts as not full');

// isTapeFull must NOT use the fps-derived fallback: at exactly 60fps (the
// common steady state, and globalSlice's own initial default) that fallback
// is mathematically pinned to ~100% regardless of real cost — gating on it
// would refuse the very first track at app boot, before any GPU frame has
// actually reported. tapeFillPct (the display number) still uses the
// fallback; isTapeFull (the gate) must not.
assert.strictEqual(tapeFillPct({ fps: 60, stageTimings: {} }), 100, 'display estimate reads ~full at 60fps with no GPU data (expected, informational)');
assert.strictEqual(isTapeFull({ fps: 60, stageTimings: {} }), false, 'the gate ignores that estimate and does not refuse on it');
assert.strictEqual(isTapeFull({ fps: 60, stageTimings: null }), false, 'same, with stageTimings entirely absent (fresh app boot)');

// --- arm gate: addLayer / addFxLayer / duplicateLayer refuse at tape-full --
const { getState, setState } = useStore;

function resetLayersToOne() {
  setState({
    layers: [{ id: 'kc-1', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: 1, strength: 0.16 } }],
    activeLayerId: 'kc-1',
    layerSnapshots: {},
  });
}

// Headroom: normal operation, adding a track works exactly as before.
setState({ fps: 60, stageTimings: {} });
resetLayersToOne();
getState().addLayer();
assert.strictEqual(getState().layers.filter((l) => l.type !== 'fx').length, 2, 'headroom: addLayer succeeds');

// Tape full: the same action is refused, not silently downgraded.
setState({ fps: 0, stageTimings: { gpuFrame: FRAME_BUDGET_MS * 2 } }); // 200% — well past full
resetLayersToOne();
getState().addLayer();
assert.strictEqual(getState().layers.filter((l) => l.type !== 'fx').length, 1, 'tape full: addLayer refuses (count unchanged)');

getState().addFxLayer();
assert.strictEqual(getState().layers.filter((l) => l.type === 'fx').length, 0, 'tape full: addFxLayer refuses too');

const before = getState().layers.length;
getState().duplicateLayer('kc-1');
assert.strictEqual(getState().layers.length, before, 'tape full: duplicateLayer refuses too');

// Recovery: once headroom returns, the same actions succeed again.
setState({ fps: 60, stageTimings: {} });
getState().addLayer();
assert.strictEqual(getState().layers.filter((l) => l.type !== 'fx').length, 2, 'headroom returns: addLayer succeeds again');

// Cleanup: leave the store as this file found it (a fresh module-level
// singleton — other selfchecks in the same run share it).
resetLayersToOne();
setState({ fps: 60, stageTimings: {} });

console.log('tapeBudget.selfcheck: OK (#342)', { at60fps: Math.round(at60fps) });
