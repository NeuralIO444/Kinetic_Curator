// patchDiag.selfcheck — inline PATCH diagnostic contract (#507).
// Node-only, pure module (no store, no GL).
import { strict as assert } from 'node:assert';
import {
  recordPatchSample,
  removePatchSample,
  patchDiagSampleCount,
  PATCH_DIAG_MAX_SAMPLES,
  getPatchSample,
  patchSampleAgeMs,
  isSourceStill,
  formatPatchLine,
  activePatchPairs,
  formatMatrixRow,
  SOURCE_STILL_SPEED,
  SOURCE_STILL_AGITATION,
  PATCH_DIAG_STALE_MS,
} from './patchDiag.mjs';

const at = (agoMs) => Date.now() - agoMs;
const sample = (over = {}) => ({ at: Date.now(), ...over });

// Formatting per mode matches the specified strings exactly.
{
  const f = formatPatchLine({ srcN: 2, dstN: 1, mode: 'field', strength: 0.16, sample: sample({ pullPx: 1.234 }), now: Date.now() });
  assert.strictEqual(f, 'KC-2 → KC-1 · FIELD · 0.16 · pull 1.2px', 'field line');
  const fe = formatPatchLine({ srcN: 3, dstN: 1, mode: 'feed', strength: 0.16, sample: sample({ pullPx: 0.44 }), now: Date.now() });
  assert.strictEqual(fe, 'KC-3 → KC-1 · FEED · 0.16 · blend 0.8% · hop 0.4px', 'feed line (0.16 × 5% = 0.8%)');
  const mm = formatPatchLine({
    srcN: 2, dstN: 1, mode: 'mod', strength: 0.5,
    sample: sample({ speed: 2, agitation: 3, glow: 0.12, fade: 0.03, displace: 2.5 }), now: Date.now(),
  });
  assert.strictEqual(mm, 'KC-2 → KC-1 · MOD · 0.50 · glow 0.12 · fade 0.03 · nudge 0.4px', 'mod line (min(4,2.5) × 0.15 = 0.375 → 0.4)');
  console.log('[selfcheck] patchDiag format lines');
}

// Still boundary + stale rule + null contract.
{
  assert.strictEqual(isSourceStill(0.0499, 0.0499), true, 'below boundary on both axes is still');
  assert.strictEqual(isSourceStill(0.05, 0), false, 'boundary speed is not still');
  assert.strictEqual(isSourceStill(0, 0.05), false, 'boundary agitation is not still');
  assert.strictEqual(isSourceStill(NaN, NaN), true, 'NaN metrics read still, never throw');
  const ms = formatPatchLine({
    srcN: 2, dstN: 1, mode: 'mod', strength: 0.5,
    sample: sample({ speed: 0, agitation: 0, glow: 0, fade: 0, displace: 0 }), now: Date.now(),
  });
  assert.strictEqual(ms, 'KC-2 → KC-1 · MOD · 0.50 · source still — strength held', 'still mod line');
  const held = formatPatchLine({
    srcN: 2, dstN: 1, mode: 'field', strength: 0.16,
    sample: { at: at(PATCH_DIAG_STALE_MS + 100), pullPx: 1 }, now: Date.now(),
  });
  assert.ok(held.endsWith('· held'), 'stale sample appends held');
  assert.strictEqual(formatPatchLine({ srcN: 1, dstN: 2, mode: 'feed', strength: 0.1, sample: null, now: Date.now() }), null, 'missing sample is null, never undefined');
  console.log('[selfcheck] patchDiag still/stale/null rules');
}

// Record/get/prune semantics + finiteness under adversarial input.
{
  recordPatchSample('lyr-x', { mode: 'feed', strength: 0.2, pullPx: 1 });
  assert.strictEqual(getPatchSample('lyr-x').pullPx, 1, 'record then get');
  recordPatchSample('lyr-x', { mode: 'feed', strength: 0.3, pullPx: 2 });
  assert.strictEqual(getPatchSample('lyr-x').pullPx, 2, 'record overwrites per layer id');
  assert.strictEqual(getPatchSample('nope'), null, 'unknown id is null');
  assert.strictEqual(patchSampleAgeMs('nope'), Infinity, 'unknown age is Infinity');
  const adv = formatPatchLine({
    srcN: 1, dstN: 2, mode: 'mod', strength: Infinity,
    sample: sample({ speed: NaN, agitation: Infinity, glow: NaN, fade: -3, displace: Infinity }), now: Date.now(),
  });
  assert.ok(!/NaN|Infinity/.test(adv), `adversarial input never prints NaN/Infinity (got ${adv})`);
  console.log('[selfcheck] patchDiag record semantics + finiteness');
}

// #509 phase 3 — matrix pairs + rows (config render, pure).
{
  const layers = [
    { id: 'a', type: 'content', patch: { mode: 'mod', to: 'b', strength: 0.5 } },
    { id: 'b', type: 'content', patch: { mode: 'off', to: null, strength: 0.16 } },
    { id: 'f', type: 'fx', patch: { mode: 'feed', to: 'a', strength: 1 } },
    { id: 'c', type: 'content', patch: { mode: 'feed', to: null, strength: 0.3 } },
    { id: 'd', type: 'content', patch: { mode: 'field', to: 'd', strength: 0.3 } },
  ];
  const pairs = activePatchPairs(layers);
  assert.deepStrictEqual(pairs, [{ srcId: 'b', dstId: 'a', mode: 'mod', strength: 0.5 }],
    'only live-pointing content patches pair (fx skipped, off/null-to/self skipped)');
  assert.deepStrictEqual(activePatchPairs(null), [], 'null layers pair nothing');
  const ord = new Map([['a', 1], ['b', 2]]);
  assert.strictEqual(
    formatMatrixRow(pairs[0], ord), 'KC-2 → KC-1 · MOD · 0.50', 'matrix row format');
  assert.strictEqual(
    formatMatrixRow({ srcId: 'x', dstId: 'a', mode: 'feed', strength: 0 }, new Map()),
    'KC-? → KC-? · FEED · 0.00', 'unknown ordinals read ?');
  console.log('[selfcheck] patchDiag matrix pairs + rows');
}

// #1246 — bound holds under add/remove cycles. Delete-on-remove is the
// primary bound; the cap is the backstop for id churn that never hits the
// remove hook (undo/project-load restore the layer list wholesale).
{
  const base = patchDiagSampleCount();
  // Small cycle: below the cap, the map tracks live layers exactly.
  const M = 20;
  const live = new Set();
  for (let i = 0; i < M; i++) {
    const id = `torture-${i}`;
    recordPatchSample(id, { mode: 'feed', strength: 0.2, pullPx: i });
    live.add(id);
    if (i % 2 === 0) { removePatchSample(id); live.delete(id); } // churn the hook path
  }
  assert.strictEqual(patchDiagSampleCount(), base + live.size,
    `map size tracks live layers exactly (got ${patchDiagSampleCount()}, want ${base + live.size})`);
  assert.strictEqual(getPatchSample('torture-0'), null, 'removed id is absent');
  assert.ok(getPatchSample('torture-1'), 'live id survives');
  // Large cycle: map size stays ≤ live layers even when churn overflows the cap.
  for (let i = 0; i < PATCH_DIAG_MAX_SAMPLES * 4; i++) {
    const id = `big-${i}`;
    recordPatchSample(id, { mode: 'feed', strength: 0.2, pullPx: i });
    live.add(id);
    if (i % 2 === 0) { removePatchSample(id); live.delete(id); }
  }
  assert.ok(patchDiagSampleCount() <= base + live.size,
    `map size stays ≤ live layers (got ${patchDiagSampleCount()}, live ${base + live.size})`);
  console.log('[selfcheck] patchDiag #1246 delete-on-remove bound');

  // Cap backstop: churn that never hits the remove hook stays bounded.
  const C = PATCH_DIAG_MAX_SAMPLES * 2;
  for (let i = 0; i < C; i++) recordPatchSample(`churn-${i}`, { mode: 'field', strength: 0.1, pullPx: i });
  assert.ok(patchDiagSampleCount() <= PATCH_DIAG_MAX_SAMPLES,
    `cap backstop holds (${patchDiagSampleCount()} ≤ ${PATCH_DIAG_MAX_SAMPLES})`);
  // A live patched layer records every tick, so recency refresh keeps the
  // artist's watched diagnostic out of the eviction path.
  recordPatchSample('watched', { mode: 'mod', strength: 0.5, pullPx: 1 });
  for (let i = 0; i < C; i++) {
    recordPatchSample(`churn2-${i}`, { mode: 'field', strength: 0.1, pullPx: i });
    recordPatchSample('watched', { mode: 'mod', strength: 0.5, pullPx: 1 });
  }
  assert.ok(getPatchSample('watched'), 'refreshed live layer survives churn eviction');
  assert.ok(patchDiagSampleCount() <= PATCH_DIAG_MAX_SAMPLES, 'cap still holds after refreshed churn');
  // Cleanup so later suites see the baseline map.
  for (let i = 0; i < M; i++) removePatchSample(`torture-${i}`);
  for (let i = 0; i < PATCH_DIAG_MAX_SAMPLES * 4; i++) removePatchSample(`big-${i}`);
  removePatchSample('watched');
  for (let i = 0; i < C; i++) { removePatchSample(`churn-${i}`); removePatchSample(`churn2-${i}`); }
  assert.ok(patchDiagSampleCount() <= base,
    `cleanup restores at most the baseline (got ${patchDiagSampleCount()}, base ${base})`);
  console.log('[selfcheck] patchDiag #1246 cap backstop + recency refresh');
}
