import assert from 'node:assert/strict';
import { createFeedLive } from './feedLive.js';

const live = createFeedLive(400, 280);
assert.ok(live.w < 400 && live.h < 280, 'quarter-res');

const src = Array.from({ length: 40 }, (_, i) => ({ x: 0.2 + i * 0.01, y: 0.5, vx: 0, vy: 0 }));
const dst = [{ x: 0.25, y: 0.5 }];

live.pushSource(0, src);
const before = live.applyTo(dst, { mode: 'feed', from: 0, to: 1, strength: 1 });
assert.equal(before[0].x, 0.25, 'delay-1: first frame is identity');

live.pushSource(0, src);
const after = live.applyTo(dst, { mode: 'feed', from: 0, to: 1, strength: 1 });
assert.ok(Math.abs(after[0].x - 0.25) + Math.abs(after[0].y - 0.5) > 0, 'second frame pulls');

const off = live.applyTo(dst, { mode: 'off', from: 0, to: 1 });
assert.equal(off[0].x, 0.25, 'OFF is identity');

console.log('feedLive.selfcheck: OK', { w: live.w, h: live.h, pulled: after[0] });
