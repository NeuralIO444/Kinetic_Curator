// stageChannel.selfcheck.mjs — #607 STAGE Phase B channel message shapes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STAGE_FRAME_CHANNEL, STAGE_CONTROL_CHANNEL, STAGE_MIRROR_FPS,
  STAGE_HEARTBEAT_TIMEOUT_MS, makeControlMessage, isControlMessage,
  isFrameMessage, makeCloseMessage, isCloseMessage,
} from './stageChannel.mjs';

test('#607 channel names are stable', () => {
  assert.equal(STAGE_FRAME_CHANNEL, 'kc-stage-frames');
  assert.equal(STAGE_CONTROL_CHANNEL, 'kc-stage-control');
  assert.ok(STAGE_MIRROR_FPS >= 15 && STAGE_MIRROR_FPS <= 60);
  assert.ok(STAGE_HEARTBEAT_TIMEOUT_MS >= 5000);
});

test('#607 control message sanitizes hostile input', () => {
  const m = makeControlMessage({ blackout: 1, testPattern: 'yes', mapping: 'cover', displayName: 'x'.repeat(500) });
  assert.equal(m.type, 'control');
  assert.equal(m.blackout, true);
  assert.equal(m.testPattern, true);
  assert.equal(m.mapping, 'fit', 'hostile mapping falls back to fit');
  assert.ok(m.displayName.length <= 80);
  assert.ok(isControlMessage(m));
  assert.equal(isControlMessage({ type: 'control' }), false, 'booleans required');
  assert.equal(isControlMessage(null), false);
});

test('#607 control message keeps the real mappings', () => {
  for (const mapping of ['fit', 'fill', '1:1']) {
    assert.equal(makeControlMessage({ mapping }).mapping, mapping);
  }
});

test('#607 frame guard needs a bitmap', () => {
  assert.equal(isFrameMessage({ type: 'frame', width: 100, height: 100, bitmap: {} }), true);
  assert.equal(isFrameMessage({ type: 'frame', width: 100, height: 100 }), false);
  assert.equal(isFrameMessage({ type: 'frame', width: NaN, height: 100, bitmap: {} }), false);
});

test('#607 close message round-trips', () => {
  const m = makeCloseMessage();
  assert.equal(isCloseMessage(m), true);
  assert.equal(isCloseMessage({ type: 'control' }), false);
});
