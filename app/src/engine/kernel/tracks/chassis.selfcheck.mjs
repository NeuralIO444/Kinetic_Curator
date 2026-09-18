// KC-1 chassis #339–#342. Node-only.
import assert from 'node:assert';
import { normalizeTrackGraph } from './trackGraph.js';
import {
  TRACK_LABELS, FX_LABELS, MAX_TRACKS, MAX_FX_SLOTS, TRACK_BASE_BYTES,
  dimmedTracks, dimmedFx, armedTrackCount, armedFxCount, slotCostBytes,
  workingSetBytes, canArmTrack, canArmFx, armTrack, armFx,
  addControlState, addFxControlState, trackLabel, missingRoomCopy, boardFullCopy,
} from './chassis.js';

assert.deepStrictEqual(TRACK_LABELS, ['KC-1', 'KC-2', 'KC-3', 'KC-4']);
assert.deepStrictEqual(FX_LABELS, ['FX-1', 'FX-2', 'FX-3', 'FX-4']);
assert.strictEqual(MAX_TRACKS, 4);
assert.strictEqual(MAX_FX_SLOTS, 4);
assert.strictEqual(trackLabel(0), 'KC-1');
assert.strictEqual(missingRoomCopy('LEAN'), 'LEAN holds 1 track. Raise the ceiling or shed.');
assert.strictEqual(boardFullCopy('track'), 'The board holds 4 tracks. Shed one.');

{
  const g = normalizeTrackGraph({});
  assert.strictEqual(armedTrackCount(g), 1);
  assert.strictEqual(dimmedTracks(g).length, 3);
  assert.strictEqual(slotCostBytes(false), 0);
  assert.strictEqual(workingSetBytes(g, {}), TRACK_BASE_BYTES);
}

assert.strictEqual(armedFxCount({}), 0);
assert.strictEqual(dimmedFx({}).length, 4);

{
  const r = armTrack(normalizeTrackGraph({}), {}, 1, 'SHOW');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.graph.tracks[1].armed, true);
}

{
  const r = canArmTrack(normalizeTrackGraph({}), {}, 0, 'LEAN');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.already, true);
}

{
  const r = canArmTrack(normalizeTrackGraph({}), {}, 1, 'LEAN');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'TAPE FULL');
  assert.strictEqual(r.detail, missingRoomCopy('LEAN'));
  assert.strictEqual(armTrack(normalizeTrackGraph({}), {}, 1, 'LEAN').graph.tracks[1].armed, false);
}

{
  let g = normalizeTrackGraph({});
  g = armTrack(g, {}, 1, 'SHOW').graph;
  g = armTrack(g, {}, 2, 'SHOW').graph;
  assert.strictEqual(canArmTrack(g, {}, 3, 'SHOW').ok, false);
  assert.strictEqual(canArmTrack(g, {}, 3, 'SHOW').detail, missingRoomCopy('SHOW'));
}

{
  const g = normalizeTrackGraph({
    tracks: [0, 1, 2, 3].map(() => ({ armed: true, patch: { mode: 'off' } })),
  });
  assert.deepStrictEqual(addControlState(g), {
    enabled: false,
    reason: boardFullCopy('track'),
  });
}

{
  let fx = {};
  for (const i of [0, 1, 2, 3]) fx = armFx({}, fx, i, 'FULL').fx;
  assert.strictEqual(armedFxCount(fx), 4);
  assert.deepStrictEqual(addFxControlState(fx), {
    enabled: false,
    reason: boardFullCopy('fx'),
  });
  assert.strictEqual(canArmFx({}, fx, 4, 'FULL').ok, false);
}

console.log('kernel/tracks/chassis.selfcheck: OK (#339–#342 backend)');
