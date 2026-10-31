// node src/engine/kernel/sample/streamline.selfcheck.mjs
// #1794 — streamline trace acceptance: registration + tier, determinism
// (replay law), trace structure (starts at nodes, step spacing, arrival),
// dealing bounds, and the column-writing protocol.
import assert from 'node:assert';
import {
  streamline,
  buildStreamlines,
  clearStreamlineCache,
  STREAMLINE_TRACES,
  STREAMLINE_STEPS,
  STREAMLINE_STEP,
} from './streamline.js';
import { getSampler, getSamplerDecl, listSamplers } from './registry.js';

let checks = 0;
const ok = (fn) => {
  fn();
  checks++;
};

const W = 800;
const H = 800;

// --- registered, declared, tier 2 ----------------------------------------------
ok(() => {
  assert.strictEqual(typeof getSampler('streamline'), 'function', 'streamline must be registered');
  assert.ok(listSamplers().includes('streamline'), 'streamline in listSamplers');
  const decl = getSamplerDecl('streamline');
  assert.strictEqual(decl.costTier, 2, 'streamline declares tier 2 (cached-structure build)');
  assert.deepStrictEqual(decl.writes, ['points', 'points.t', 'points.rot01']);
});

// --- the traces are deterministic and count-independent --------------------------
ok(() => {
  clearStreamlineCache();
  const a = buildStreamlines({ seed: 4242, w: W, h: H });
  clearStreamlineCache();
  const b = buildStreamlines({ seed: 4242, w: W, h: H });
  assert.strictEqual(a.traces.length, b.traces.length);
  for (let t = 0; t < a.traces.length; t++) {
    assert.deepStrictEqual(a.traces[t].pts, b.traces[t].pts, `trace ${t} identical across builds`);
    assert.strictEqual(a.traces[t].arrived, b.traces[t].arrived);
  }
  clearStreamlineCache();
  const c = buildStreamlines({ seed: 777, w: W, h: H });
  assert.notDeepStrictEqual(a.traces[0].pts, c.traces[0].pts, 'different seed = different drawing');
});

// --- sampler determinism: same (seed, count, plate) deals identical points -------
ok(() => {
  const deal = (seed, count) => {
    const pts = [];
    for (let i = 0; i < count; i++) {
      pts.push(streamline({ i, count, w: W, h: H, seed, seedOffsets: null }));
    }
    return pts;
  };
  assert.deepStrictEqual(deal(99, 300), deal(99, 300), 'same inputs = same points (replay law)');
});

// --- trace structure: starts at nodes, fixed step spacing, bounded length ---------
ok(() => {
  clearStreamlineCache();
  const { traces, field } = buildStreamlines({ seed: 4242, w: W, h: H });
  assert.strictEqual(traces.length, STREAMLINE_TRACES);
  let totalPts = 0;
  for (const tr of traces) {
    assert.ok(tr.pts.length >= 1, 'every trace has at least its seed point');
    assert.ok(tr.pts.length <= STREAMLINE_STEPS + 1, 'trace length bounded by the step budget');
    totalPts += tr.pts.length;
    // Starts within one field radius of its origin node.
    const nx = field.points[tr.node * 2] * W;
    const ny = field.points[tr.node * 2 + 1] * H;
    const d0 = Math.hypot(tr.pts[0].x - nx, tr.pts[0].y - ny);
    assert.ok(d0 <= field.radius * Math.max(W, H), `trace starts at its node (d ${d0})`);
    // Consecutive points are one step apart (square plate: normalized step
    // == px step), and rot01 agrees with the segment direction. The FINAL
    // segment may be shorter: leaving the plate clamps the last point onto
    // the boundary.
    for (let s = 1; s < tr.pts.length; s++) {
      const dx = tr.pts[s].x - tr.pts[s - 1].x;
      const dy = tr.pts[s].y - tr.pts[s - 1].y;
      const d = Math.hypot(dx, dy);
      const isFullStep = Math.abs(d - STREAMLINE_STEP) < 1e-6;
      if (s < tr.pts.length - 1) {
        assert.ok(isFullStep, `step spacing is the named step (${d})`);
      } else {
        assert.ok(d <= STREAMLINE_STEP + 1e-6 && d >= 0, `final segment within one step (${d})`);
      }
      // rot01 is the direction of travel INTO the point; it agrees with
      // the segment geometry wherever the segment is a true step (a
      // boundary-clamped final segment keeps the travel direction, not
      // the clamped chord's).
      if (isFullStep) {
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const expect = (((deg % 360) + 540) % 360) / 360;
        assert.ok(Math.abs(tr.pts[s].rot01 - expect) < 1e-9, 'rot01 is the trace tangent');
      }
    }
    for (const p of tr.pts) {
      assert.ok(p.rot01 >= 0 && p.rot01 < 1, 'rot01 in 0..1');
    }
  }
  assert.ok(totalPts > STREAMLINE_TRACES * 10, 'traces are real lines, not stubs');
});

// --- arrival: at least some traces connect to a source ------------------------------
ok(() => {
  clearStreamlineCache();
  const { traces, field } = buildStreamlines({ seed: 4242, w: W, h: H });
  const arrived = traces.filter((t) => t.arrived);
  assert.ok(arrived.length > 0, 'some traces arrive at a source');
  // Traces that start on a source are arrived by birth (and may be a
  // single point); the doorstep assertion is for traces that TRAVELLED.
  for (const tr of arrived.filter((t) => t.pts.length > 1)) {
    const last = tr.pts[tr.pts.length - 1];
    let near = Infinity;
    for (const s of field.sources) {
      const d = Math.hypot(last.x - field.points[s * 2] * W, last.y - field.points[s * 2 + 1] * H);
      if (d < near) near = d;
    }
    assert.ok(near <= STREAMLINE_STEP, `arrived trace ends at a source (d ${near})`);
  }
});

// --- dealing stays on the plate, t spans the trace -----------------------------------
ok(() => {
  for (let i = 0; i < 500; i++) {
    const p = streamline({ i, count: 500, w: W, h: H, seed: 99, seedOffsets: null });
    assert.ok(p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H, `point ${i} on the plate`);
    assert.ok(p.t >= 0 && p.t <= 1, 't in 0..1');
    assert.ok(p.rot01 >= 0 && p.rot01 < 1, 'rot01 in 0..1');
  }
});

// --- column-writing protocol ------------------------------------------------------------
ok(() => {
  const lanes = { x: new Float64Array(4), y: new Float64Array(4), t: new Float64Array(4), rot01: new Float64Array(4) };
  const ctx = { i: 3, count: 40, w: W, h: H, seed: 99, seedOffsets: null, out: lanes, row: 2 };
  const ret = streamline(ctx);
  assert.strictEqual(ret, undefined, 'column mode returns undefined');
  const legacy = streamline({ i: 3, count: 40, w: W, h: H, seed: 99, seedOffsets: null });
  assert.strictEqual(lanes.x[2], legacy.x, 'column x matches legacy return');
  assert.strictEqual(lanes.y[2], legacy.y, 'column y matches legacy return');
  assert.strictEqual(lanes.t[2], legacy.t, 'column t matches legacy return');
  assert.strictEqual(lanes.rot01[2], legacy.rot01, 'column rot01 matches legacy return');
});

// --- knob clamps hold the perf bounds ------------------------------------------------------
ok(() => {
  clearStreamlineCache();
  const built = buildStreamlines({ seed: 5, w: W, h: H, traces: 8, steps: 20, step: 6 });
  assert.strictEqual(built.traces.length, 8);
  for (const tr of built.traces) assert.ok(tr.pts.length <= 21, 'steps knob bounds trace length');
  // Absurd ctx knobs are clamped by the sampler to the named caps.
  const p = streamline({
    i: 0,
    count: 10,
    w: W,
    h: H,
    seed: 5,
    seedOffsets: null,
    streamlineTraces: 100000,
    streamlineSteps: 100000,
    streamlineStep: -3,
  });
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'clamped knobs still place');
});

console.log(`streamline.selfcheck: OK (${checks} checks)`);
