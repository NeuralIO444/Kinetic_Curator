// KC-1 chassis #339–#342. Node-only.
//   node src/engine/kernel/tracks/chassis.selfcheck.mjs
import assert from 'node:assert';
import { normalizeTrackGraph } from './trackGraph.js';
import {
  TRACK_LABELS,
  FX_LABELS,
  MAX_TRACKS,
  MAX_FX_SLOTS,
  TRACK_BASE_BYTES,
  dimmedTracks,
  dimmedFx,
  armedTrackCount,
  armedFxCount,
  slotCostBytes,
  workingSetBytes,
  canArmTrack,
  canArmFx,
  armTrack,
  armFx,
  addControlState,
  addFxControlState,
  trackLabel,
} from './chassis.js';

assert.deepStrictEqual(TRACK_LABELS, ['KC-1', 'KC-2', 'KC-3', 'KC-4']);
assert.deepStrictEqual(FX_LABELS, ['FX-1', 'FX-2', 'FX-3', 'FX-4']);
assert.strictEqual(MAX_TRACKS, 4);
assert.strictEqual(MAX_FX_SLOTS, 4);
assert.strictEqual(trackLabel(0), 'KC-1');

{
  const g = normalizeTrackGraph({});
  assert.strictEqual(armedTrackCount(g), 1);
  assert.strictEqual(dimmedTracks(g).length, 3);
  assert.strictEqual(slotCostBytes(false), 0);
  assert.strictEqual(workingSetBytes(g, {}), TRACK_BASE_BYTES);
  assert.deepStrictEqual(addControlState(g), { enabled: true, reason: null });
}

{
  const fx = { slots: [] };
  assert.strictEqual(armedFxCount(fx), 0);
  assert.strictEqual(dimmedFx(fx).length, 4);
  assert.deepStrictEqual(addFxControlState(fx), { enabled: true, reason: null });
}

// Arm KC-2 under SHOW.
{
  const g = normalizeTrackGraph({});
  const r = armTrack(g, {}, 1, 'SHOW');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.graph.tracks[1].armed, true);
  assert.strictEqual(armedTrackCount(r.graph), 2);
  assert.strictEqual(dimmedTracks(r.graph).length, 2);
}

// Already-armed track is never refused (governor does not mute live work).
{
  const g = normalizeTrackGraph({});
  const r = canArmTrack(g, {}, 0, 'LEAN');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.already, true);
}

// LEAN ceiling: 8MB. One track is ~16MB → cannot arm KC-2.
{
  const g = normalizeTrackGraph({});
  const r = canArmTrack(g, {}, 1, 'LEAN');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'TAPE FULL');
  assert.ok(/KC-2/.test(r.detail));
  const armed = armTrack(g, {}, 1, 'LEAN');
  assert.strictEqual(armed.graph.tracks[1].armed, false);
}

// FULL can take all 4 tracks (4 * ~16MB = 64MB, FULL is 48MB) — 4th may fail.
// 3 tracks = 48MB exactly on FULL (48MB cap) — 48 > 48 is false, so 3 fit.
{
  let g = normalizeTrackGraph({});
  g = armTrack(g, {}, 1, 'FULL').graph;
  g = armTrack(g, {}, 2, 'FULL').graph;
  assert.strictEqual(armedTrackCount(g), 3);
  const fourth = canArmTrack(g, {}, 3, 'FULL');
  // 4 * 16MB = 64MB > 48MB
  assert.strictEqual(fourth.ok, false);
  assert.strictEqual(fourth.reason, 'TAPE FULL');
}

// Cap of 4: add control disables with honest copy.
{
  const g = normalizeTrackGraph({
    tracks: [0, 1, 2, 3].map((i) => ({ armed: true, patch: { mode: 'off' } })),
  });
  const add = addControlState(g);
  assert.strictEqual(add.enabled, false);
  assert.strictEqual(add.reason, '4 tracks — the tape is full');
}

{
  let fx = { slots: [] };
  fx = armFx({}, fx, 0, 'FULL').fx;
  fx = armFx({}, fx, 1, 'FULL').fx;
  fx = armFx({}, fx, 2, 'FULL').fx;
  fx = armFx({}, fx, 3, 'FULL').fx;
  assert.strictEqual(armedFxCount(fx), 4);
  assert.deepStrictEqual(addFxControlState(fx), {
    enabled: false,
    reason: '4 FX — the tape is full',
  });
  const extra = canArmFx({}, fx, 4, 'FULL');
  assert.strictEqual(extra.ok, false);
}

console.log('kernel/tracks/chassis.selfcheck: OK (#339–#342 backend)');
