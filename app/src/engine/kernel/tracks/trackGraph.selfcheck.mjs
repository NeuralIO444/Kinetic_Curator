// TrackGraph + delayed FEED (#345). Node-only.
import assert from 'node:assert';
import {
  MAX_TRACKS, FEED_POLICY, normalizePatch, normalizeTrackGraph, emptyTrack,
  activePatches, patchEdges, hasCycle, liveEdges, scheduleFrame,
  motionMetrics, applyMod, applyField, lumaToFlow, sampleFlow, applyFeed,
  feedTextureBytes, tapePreflight,
} from './trackGraph.js';

assert.strictEqual(MAX_TRACKS, 4);
assert.strictEqual(FEED_POLICY, 'delay-1');
assert.strictEqual(emptyTrack(0).armed, true);
assert.strictEqual(emptyTrack(2).armed, false);

{
  const g = normalizeTrackGraph({});
  assert.strictEqual(g.tracks.length, 4);
  assert.ok(g.tracks.every((t) => t.patch.mode === 'off'));
  assert.deepStrictEqual(activePatches(g), []);
}

{
  const p = normalizePatch({ from: 2, to: 2, mode: 'mod' });
  assert.strictEqual(p.from, 2);
  assert.notStrictEqual(p.to, 2);
}

{
  const g = normalizeTrackGraph({
    tracks: [
      { armed: true, patch: { mode: 'mod', to: 1 } },
      { armed: true, patch: { mode: 'field', to: 0 } },
    ],
  });
  assert.strictEqual(hasCycle(liveEdges(g)), true);
  assert.strictEqual(scheduleFrame(g).cyclic, true);
}

{
  const g = normalizeTrackGraph({
    tracks: [
      { armed: true, patch: { mode: 'feed', to: 1 } },
      { armed: true, patch: { mode: 'feed', to: 0 } },
    ],
  });
  assert.strictEqual(hasCycle(patchEdges(g)), true);
  assert.strictEqual(hasCycle(liveEdges(g)), false);
  assert.strictEqual(scheduleFrame(g).cyclic, false);
}

{
  const pts = [{ x: 0.25, y: 0.4, vx: 0.1, vy: 0 }, { x: 0.7, y: 0.2, vx: 0, vy: 0.2 }];
  const off = { mode: 'off', from: 0, to: 1 };
  assert.deepStrictEqual(applyField(pts, pts, off), pts);
  const field = lumaToFlow(new Float32Array([1, 0, 0, 1]), 2, 2);
  assert.deepStrictEqual(applyFeed(pts, field, off), pts);
  const knobs = { glow: 0.2, fade: 0.5, displace: 10 };
  assert.deepStrictEqual(applyMod(knobs, motionMetrics(pts), off), knobs);
}

{
  const quiet = motionMetrics([{ x: 0.5, y: 0.5, vx: 0, vy: 0 }]);
  const loud = motionMetrics([{ x: 0.5, y: 0.5, vx: 4, vy: 3 }]);
  const base = { glow: 0.1, fade: 0.4, displace: 0 };
  assert.ok(applyMod(base, loud, { mode: 'mod', strength: 1 }).glow > applyMod(base, quiet, { mode: 'mod', strength: 1 }).glow);
}

{
  const src = [{ x: 0.2, y: 0.5 }];
  const dst = [{ x: 0, y: 0.5 }];
  assert.ok(applyField(dst, src, { mode: 'field', strength: 2, polarity: 1 })[0].x > dst[0].x);
  assert.ok(applyField(dst, src, { mode: 'field', strength: 2, polarity: -1 })[0].x < dst[0].x);
}

{
  const w = 8;
  const h = 8;
  const luma = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) luma[y * w + x] = x / (w - 1);
  const field = lumaToFlow(luma, w, h);
  const mid = sampleFlow(field, 0.5, 0.5);
  assert.ok(mid.y < 0, `curl X-ramp should be -y, got ${mid.x},${mid.y}`);
  assert.ok(Math.abs(mid.y) > Math.abs(mid.x));
  const pts = [{ x: 0.5, y: 0.5 }];
  const moved = applyFeed(pts, field, { mode: 'feed', strength: 1 });
  assert.ok(moved[0].y < pts[0].y);
}

{
  const g = normalizeTrackGraph({
    tracks: [{ armed: true }, { armed: false, patch: { mode: 'feed', from: 1, to: 0 } }],
  });
  assert.strictEqual(activePatches(g).length, 0);
}

{
  const bytes = feedTextureBytes(1920, 1080);
  assert.strictEqual(bytes, Math.round(1920 * 0.25) * Math.round(1080 * 0.25) * 8);
  const g = normalizeTrackGraph({
    tracks: [{ armed: true, patch: { mode: 'feed', to: 1 } }, { armed: true }],
  });
  assert.strictEqual(tapePreflight(g, { frameW: 1920, frameH: 1080, budgetBytes: bytes + 1 }).tapeFull, false);
  assert.strictEqual(tapePreflight(g, { frameW: 1920, frameH: 1080, budgetBytes: bytes - 1 }).tapeFull, true);
}

console.log('kernel/tracks/trackGraph.selfcheck: OK (#345 delay-1 FEED, curl)');
