// TrackGraph + delayed FEED (#345). Node-only.
//   node src/engine/kernel/tracks/trackGraph.selfcheck.mjs
import assert from 'node:assert';
import {
  MAX_TRACKS,
  FEED_POLICY,
  normalizePatch,
  normalizeTrackGraph,
  emptyTrack,
  activePatches,
  patchEdges,
  hasCycle,
  liveEdges,
  scheduleFrame,
  motionMetrics,
  applyMod,
  applyField,
  lumaToFlow,
  sampleFlow,
  applyFeed,
  feedTextureBytes,
  tapePreflight,
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
  const g = normalizeTrackGraph({
    tracks: [
      { armed: true, patch: { mode: 'feed', to: 1, strength: 1 } },
      { armed: true },
    ],
  });
  assert.strictEqual(g.tracks[0].patch.from, 0);
  assert.strictEqual(g.tracks[0].patch.to, 1);
  assert.strictEqual(g.tracks[0].patch.mode, 'feed');
  assert.strictEqual(g.tracks[1].armed, true);
}

// Self-patch collapses to a different target (no A→A).
{
  const p = normalizePatch({ from: 2, to: 2, mode: 'mod' });
  assert.strictEqual(p.from, 2);
  assert.notStrictEqual(p.to, 2);
}

// Cycle on live (MOD/FIELD) edges.
{
  const g = normalizeTrackGraph({
    tracks: [
      { armed: true, patch: { mode: 'mod', to: 1 } },
      { armed: true, patch: { mode: 'field', to: 0 } },
    ],
  });
  assert.strictEqual(hasCycle(patchEdges(g)), true);
  assert.strictEqual(hasCycle(liveEdges(g)), true);
  assert.strictEqual(scheduleFrame(g).cyclic, true);
}

// FEED A→B + FEED B→A is a stored cycle but NOT a live-edge cycle.
{
  const g = normalizeTrackGraph({
    tracks: [
      { armed: true, patch: { mode: 'feed', to: 1 } },
      { armed: true, patch: { mode: 'feed', to: 0 } },
    ],
  });
  assert.strictEqual(hasCycle(patchEdges(g)), true);
  assert.strictEqual(hasCycle(liveEdges(g)), false);
  const sch = scheduleFrame(g);
  assert.strictEqual(sch.cyclic, false);
  assert.strictEqual(sch.feedPolicy, 'delay-1');
  assert.deepStrictEqual(sch.order, [0, 1, 2, 3]);
  assert.strictEqual(sch.feeds.length, 2);
}

// OFF identity for apply*.
{
  const pts = [{ x: 0.25, y: 0.4, vx: 0.1, vy: 0 }, { x: 0.7, y: 0.2, vx: 0, vy: 0.2 }];
  const off = { mode: 'off', from: 0, to: 1 };
  assert.deepStrictEqual(applyField(pts, pts, off), pts);
  const field = lumaToFlow(new Float32Array([1, 0, 0, 1]), 2, 2);
  assert.deepStrictEqual(applyFeed(pts, field, off), pts);
  const knobs = { glow: 0.2, fade: 0.5, displace: 10 };
  assert.deepStrictEqual(applyMod(knobs, motionMetrics(pts), off), knobs);
}

// MOD moves knobs when agitated.
{
  const quiet = motionMetrics([{ x: 0.5, y: 0.5, vx: 0, vy: 0 }]);
  const loud = motionMetrics([{ x: 0.5, y: 0.5, vx: 4, vy: 3 }]);
  assert.ok(loud.agitation > quiet.agitation);
  const base = { glow: 0.1, fade: 0.4, displace: 0 };
  const a = applyMod(base, quiet, { mode: 'mod', from: 0, to: 1, strength: 1 });
  const b = applyMod(base, loud, { mode: 'mod', from: 0, to: 1, strength: 1 });
  assert.ok(b.glow > a.glow);
}

// FIELD attract vs repel.
{
  const src = [{ x: 1, y: 0.5 }];
  const dst = [{ x: 0, y: 0.5 }];
  const pull = applyField(dst, src, { mode: 'field', strength: 2, polarity: 1 });
  const push = applyField(dst, src, { mode: 'field', strength: 2, polarity: -1 });
  assert.ok(pull[0].x > dst[0].x, 'attract moves toward source');
  assert.ok(push[0].x < dst[0].x, 'repel moves away');
}

// FEED: a luma ramp in X produces +dx on the interior.
{
  const w = 8;
  const h = 8;
  const luma = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) luma[y * w + x] = x / (w - 1);
  const field = lumaToFlow(luma, w, h);
  const mid = sampleFlow(field, 0.5, 0.5);
  assert.ok(mid.x > 0, `expected +dx from X ramp, got ${mid.x}`);
  const pts = [{ x: 0.5, y: 0.5 }];
  const moved = applyFeed(pts, field, { mode: 'feed', strength: 1 });
  assert.ok(moved[0].x > pts[0].x);
  const back = applyFeed(pts, field, { mode: 'off' });
  assert.strictEqual(back[0].x, 0.5);
}

// Unarmed source does not emit a patch.
{
  const g = normalizeTrackGraph({
    tracks: [
      { armed: false, patch: { mode: 'feed', to: 1 } },
      { armed: true },
    ],
  });
  // track 0 is forced armed in normalize? id 0 is always armed.
  assert.strictEqual(g.tracks[0].armed, true);
}

{
  const g = normalizeTrackGraph({
    tracks: [
      { armed: true },
      { armed: false, patch: { mode: 'feed', from: 1, to: 0 } },
    ],
  });
  assert.strictEqual(g.tracks[1].armed, false);
  assert.strictEqual(activePatches(g).length, 0);
}

// Tape: FEED costs a quarter-res RGBA16F target per active feed.
{
  const bytes = feedTextureBytes(1920, 1080);
  assert.strictEqual(bytes, Math.round(1920 * 0.25) * Math.round(1080 * 0.25) * 8);
  const g = normalizeTrackGraph({
    tracks: [{ armed: true, patch: { mode: 'feed', to: 1 } }, { armed: true }],
  });
  const ok = tapePreflight(g, { frameW: 1920, frameH: 1080, budgetBytes: bytes + 1 });
  assert.strictEqual(ok.tapeFull, false);
  assert.strictEqual(ok.feedCount, 1);
  const full = tapePreflight(g, { frameW: 1920, frameH: 1080, budgetBytes: bytes - 1 });
  assert.strictEqual(full.tapeFull, true);
}

console.log('kernel/tracks/trackGraph.selfcheck: OK (#345 delay-1 FEED)');
