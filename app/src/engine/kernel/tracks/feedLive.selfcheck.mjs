import assert from 'node:assert/strict';
import { createFeedLive } from './feedLive.js';

const live = createFeedLive(400, 280);
const src = Array.from({ length: 40 }, (_, i) => ({ x: 0.2 + i * 0.01, y: 0.5 }));
const dst = [{ x: 0.25, y: 0.5 }];

live.pushSource(0, src);
const first = live.applyTo(dst, { mode: 'feed', from: 0, to: 1, strength: 1 });
assert.equal(first[0].x, 0.25, 'delay-1: first frame is identity');
live.commit();

live.pushSource(0, src);
const second = live.applyTo(dst, { mode: 'feed', from: 0, to: 1, strength: 1 });
assert.ok(Math.abs(second[0].x - 0.25) + Math.abs(second[0].y - 0.5) > 0, 'second frame pulls');
live.commit();

const off = live.applyTo(dst, { mode: 'off', from: 0, to: 1 });
assert.equal(off[0].x, 0.25, 'OFF is identity');

console.log('feedLive.selfcheck: OK', { w: live.w, h: live.h, pulled: second[0] });
