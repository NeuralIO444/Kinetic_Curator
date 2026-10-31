// node src/engine/kernel/field/nodeField.selfcheck.mjs
// #1794 — node-influence field: determinism, graph + propagation shape,
// the flow rule, the field contract, and the registry entry.
import assert from 'node:assert';
import {
  createNodeField,
  NODE_FIELD_COUNT,
  NODE_FIELD_SOURCES,
  NODE_FIELD_DECAY,
  NODE_FIELD_RADIUS,
} from './nodeField.js';
import { FIELDS } from './registry.js';

let checks = 0;
const ok = (fn) => {
  fn();
  checks++;
};

// --- determinism -----------------------------------------------------------
ok(() => {
  const a = createNodeField(1234);
  const b = createNodeField(1234);
  assert.deepStrictEqual([...a.points], [...b.points], 'same seed = same nodes');
  assert.deepStrictEqual([...a.influence], [...b.influence], 'same seed = same influence');
  assert.deepStrictEqual([...a.flow], [...b.flow], 'same seed = same flow');
  const c = createNodeField(9999);
  assert.notDeepStrictEqual([...a.points], [...c.points], 'different seed = different nodes');
});

// --- defaults + shape --------------------------------------------------------
ok(() => {
  const f = createNodeField(42);
  assert.strictEqual(f.kind, 'nodes');
  assert.strictEqual(f.count, NODE_FIELD_COUNT);
  assert.strictEqual(f.radius, NODE_FIELD_RADIUS);
  assert.strictEqual(f.sources.length, NODE_FIELD_SOURCES);
  for (let j = 0; j < f.count; j++) {
    const x = f.points[j * 2];
    const y = f.points[j * 2 + 1];
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `node ${j} in unit space`);
  }
});

// --- graph: connected, symmetric, every node linked --------------------------
ok(() => {
  const f = createNodeField(42);
  const deg = new Array(f.count).fill(0);
  for (const [a, b] of f.edges) {
    deg[a]++;
    deg[b]++;
    assert.notStrictEqual(a, b, 'no self edges');
  }
  for (let j = 0; j < f.count; j++) assert.ok(deg[j] >= 1, `node ${j} has a link`);
  // BFS from node 0 reaches every node — the graph is one system.
  const adj = Array.from({ length: f.count }, () => []);
  for (const [a, b] of f.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const n = queue.shift();
    for (const m of adj[n]) {
      if (!seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
    }
  }
  assert.strictEqual(seen.size, f.count, 'graph is connected');
});

// --- propagation: sources are 1, influence is decay^distance ------------------
ok(() => {
  const f = createNodeField(42);
  for (const s of f.sources) assert.strictEqual(f.influence[s], 1, 'source influence is 1');
  // BFS distance from the nearest source predicts influence exactly:
  // influence = decay ^ distance (max-propagation fixed point).
  const adj = Array.from({ length: f.count }, () => []);
  for (const [a, b] of f.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const dist = new Array(f.count).fill(Infinity);
  const queue = [];
  for (const s of f.sources) {
    dist[s] = 0;
    queue.push(s);
  }
  while (queue.length) {
    const n = queue.shift();
    for (const m of adj[n]) {
      if (dist[m] === Infinity) {
        dist[m] = dist[n] + 1;
        queue.push(m);
      }
    }
  }
  for (let j = 0; j < f.count; j++) {
    const expect = Math.pow(NODE_FIELD_DECAY, dist[j]);
    assert.ok(Math.abs(f.influence[j] - expect) < 1e-9, `node ${j}: influence ${f.influence[j]} = decay^${dist[j]}`);
    assert.ok(f.influence[j] > 0, `node ${j} reached by propagation`);
  }
});

// --- flow rule: toward the highest-influence neighbour ------------------------
ok(() => {
  const f = createNodeField(42);
  const adj = Array.from({ length: f.count }, () => []);
  for (const [a, b] of f.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  // The documented tie-break is lowest index among equals (influence takes
  // only decay^distance values, so ties are common) — walk neighbours in
  // ascending index order, exactly as the implementation does.
  for (const list of adj) list.sort((p, q2) => p - q2);
  for (let j = 0; j < f.count; j++) {
    const fm = Math.hypot(f.flow[j * 2], f.flow[j * 2 + 1]);
    if (f.sources.includes(j)) {
      // A source is a sink: no higher-influence neighbour, zero flow.
      assert.strictEqual(fm, 0, `source node ${j} flow is zero (sink)`);
      continue;
    }
    let best = -1;
    for (const m of adj[j]) {
      if (f.influence[m] > f.influence[j] && (best < 0 || f.influence[m] > f.influence[best])) best = m;
    }
    assert.ok(best >= 0, `non-source node ${j} has a higher neighbour`);
    const dx = f.points[best * 2] - f.points[j * 2];
    const dy = f.points[best * 2 + 1] - f.points[j * 2 + 1];
    const m = Math.hypot(dx, dy);
    const dot = (f.flow[j * 2] * dx) / m + (f.flow[j * 2 + 1] * dy) / m;
    assert.ok(dot > 0.999, `node ${j} flow aims at its strongest neighbour (dot ${dot})`);
    assert.ok(Math.abs(fm - 1) < 1e-9, `node ${j} flow is a unit vector`);
  }
});

// --- scalar contract: 0..1 everywhere, peaks at sources -----------------------
ok(() => {
  const f = createNodeField(42);
  for (let gy = 0; gy <= 20; gy++) {
    for (let gx = 0; gx <= 20; gx++) {
      const v = f.sample(gx / 20, gy / 20);
      assert.ok(v >= 0 && v <= 1, `sample in 0..1 (${v})`);
      const vec = f.sampleVector(gx / 20, gy / 20);
      assert.ok(Number.isFinite(vec.x) && Number.isFinite(vec.y), 'vector finite');
    }
  }
  for (const s of f.sources) {
    const v = f.sample(f.points[s * 2], f.points[s * 2 + 1]);
    assert.ok(v > 0.9, `sample at a source reads ~1 (${v})`);
  }
});

// --- vector field: at a node, flow reads that node's flow ----------------------
ok(() => {
  const f = createNodeField(42);
  // A non-source node with a clear strongest neighbour: the blended vector
  // at its position must lean the same way as its own flow.
  let tested = 0;
  for (let j = 0; j < f.count; j++) {
    if (f.sources.includes(j)) continue;
    const vec = f.sampleVector(f.points[j * 2], f.points[j * 2 + 1]);
    const m = Math.hypot(vec.x, vec.y);
    assert.ok(m > 0, `vector nonzero at node ${j}`);
    const dot = (vec.x * f.flow[j * 2] + vec.y * f.flow[j * 2 + 1]) / m;
    assert.ok(dot > 0.5, `vector at node ${j} leans with its flow (dot ${dot})`);
    tested++;
  }
  assert.ok(tested > 0);
});

// --- dead zone: tiny radius leaves most of the plate unsampled ------------------
ok(() => {
  const f = createNodeField(42, { radius: 0.01, minSpacing: 0 });
  // Sample a coarse grid; at least some points must be outside all support.
  let zeros = 0;
  for (let gy = 0; gy <= 10; gy++) {
    for (let gx = 0; gx <= 10; gx++) {
      if (f.sample(gx / 10, gy / 10) === 0) zeros++;
    }
  }
  assert.ok(zeros > 0, 'dead zones exist at small radius');
  const vec = f.sampleVector(0.001, 0.001);
  assert.ok(Number.isFinite(vec.x) && Number.isFinite(vec.y));
});

// --- empty field -----------------------------------------------------------------
ok(() => {
  const f = createNodeField(42, { count: 0 });
  assert.strictEqual(f.count, 0);
  assert.strictEqual(f.sample(0.5, 0.5), 0, 'empty field samples 0');
  const vec = f.sampleVector(0.5, 0.5);
  assert.strictEqual(vec.x, 0);
  assert.strictEqual(vec.y, 0);
});

// --- single node --------------------------------------------------------------------
ok(() => {
  const f = createNodeField(42, { count: 1 });
  assert.strictEqual(f.count, 1);
  assert.strictEqual(f.influence[0], 1, 'a lone node is its own source');
  assert.strictEqual(f.edges.length, 0);
  const v = f.sample(f.points[0], f.points[1]);
  assert.ok(v > 0.9, 'sample at the lone node reads ~1');
});

// --- a source pulls inward: the vector near a source points AT it -------------------
// (A sink contributing its zero node-flow to the blend would numerically
// repel: its falloff weight dilutes every neighbour's onward flow near the
// heart. Sources contribute radial inflow instead — pinned here.)
ok(() => {
  const f = createNodeField(42);
  for (const s of f.sources) {
    const sx = f.points[s * 2];
    const sy = f.points[s * 2 + 1];
    // A point a short way off the heart, still well inside its radius.
    const px = Math.min(0.999, sx + 0.03);
    const py = sy;
    if (px === sx) continue;
    const v = f.sampleVector(px, py);
    const m = Math.hypot(v.x, v.y);
    assert.ok(m > 1e-9, 'near a source the field is not a dead zone');
    const dot = (v.x / m) * ((sx - px) / Math.abs(sx - px)) + (v.y / m) * 0;
    assert.ok(dot > 0.5, `near source ${s} the flow points at the heart (dot ${dot.toFixed(2)})`);
  }
});

// --- registry: 'nodes' is a declared field, create matches the free function --------
ok(() => {
  const decl = FIELDS.get('nodes');
  assert.ok(decl, 'nodes field registered');
  assert.strictEqual(decl.costTier, 0, 'fields ride tier 0 (family rate)');
  const via = decl.create(777, { count: 9 });
  const free = createNodeField(777, { count: 9 });
  assert.strictEqual(via.kind, 'nodes');
  assert.deepStrictEqual([...via.points], [...free.points]);
  assert.strictEqual(via.sample(0.3, 0.6), free.sample(0.3, 0.6));
});

console.log(`nodeField.selfcheck: OK (${checks} checks)`);
