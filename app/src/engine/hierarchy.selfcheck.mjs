// node src/engine/hierarchy.selfcheck.mjs
// #1206 / Phase 3 step 1 — parts attach, inherit, stay together, and a bad recipe terminates.
import assert from 'node:assert/strict';
import {
  computeWorldTransform,
  expandHierarchy,
  expansionFactor,
  hashScatter,
  HIER_MAX_DEPTH,
  HIER_GLOBAL_BUDGET,
  SURFACE,
} from './hierarchy.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const ROOT = { x: 500, y: 350, rot: 0, scaleX: 1, scaleY: 1, part: 'body', key: 'm1' };

// the pilot's three parts (Matt, 2026-10-11): a body, wings as limbs, scales as hands
const MOTH = {
  parts: {
    body: {
      asset: 'moth_body',
      anchors: { wingL: { dx: -15, dy: 10, dRot: -45 }, wingR: { dx: 15, dy: 10, dRot: 45 }, head: { dx: 0, dy: -30 } },
      localBounds: { x0: -10, y0: -40, x1: 10, y1: 40 },
      children: [
        { part: 'wing', anchor: 'wingL' },
        { part: 'wing', anchor: 'wingR' },
      ],
    },
    wing: {
      asset: 'moth_wing',
      localBounds: { x0: -60, y0: -40, x1: 60, y1: 40 },
      children: [{ part: 'scale', anchor: SURFACE, count: 40 }],
    },
    scale: { asset: 'moth_scale' },
  },
};

// 1. the transform: identity, rotation, per-axis scale, and the anchor's own rotation and scale
{
  const p = { x: 100, y: 200, rot: 0, scaleX: 1, scaleY: 1, depth: 0 };
  assert.deepEqual(computeWorldTransform(p, { dx: 10, dy: -5 }), {
    x: 110,
    y: 195,
    rot: 0,
    scaleX: 1,
    scaleY: 1,
    depth: 1,
  });
  const r90 = computeWorldTransform({ ...p, rot: 90 }, { dx: 10, dy: 0, dRot: 30 });
  assert.ok(near(r90.x, 100) && near(r90.y, 210), 'a 90 degree parent turns +x into +y');
  assert.equal(r90.rot, 120, 'child rotation adds');
  const sc = computeWorldTransform({ ...p, scaleX: 2, scaleY: 0.5 }, { dx: 10, dy: 10, dScaleX: 0.5, dScaleY: 3 });
  assert.ok(near(sc.x, 120) && near(sc.y, 205), 'the offset is scaled per axis by the parent');
  assert.equal(sc.scaleX, 1);
  assert.equal(sc.scaleY, 1.5, 'child scale multiplies the parent, per axis');
  assert.equal(computeWorldTransform({ ...p, depth: 2 }, {}).depth, 3);
}

// 2. THE MOTH: a body, two wings at its anchors, scales scattered on each wing
{
  const { items, truncated, problems } = expandHierarchy(ROOT, MOTH, { seed: 7 });
  assert.deepEqual(problems, []);
  assert.equal(truncated, false);
  assert.equal(items.length, 1 + 2 + 80, 'one body, two wings, forty scales on each');
  const [body, wingL] = items;
  assert.equal(body.assetId, 'moth_body');
  assert.deepEqual([body.x, body.y, body.rotation], [500, 350, 0]);
  assert.equal(wingL.assetId, 'moth_wing');
  assert.deepEqual([wingL.x, wingL.y, wingL.rotation], [485, 360, -45], 'the left wing sits at its anchor, rotated');
  const wingR = items.find((i) => i._hier.anchorId === 'wingR');
  assert.deepEqual([wingR.x, wingR.y, wingR.rotation], [515, 360, 45], 'the right wing mirrors it');
  // a parent comes before its children, children in declaration order
  assert.deepEqual(
    items.slice(0, 2).map((i) => i._hier.depth),
    [0, 1],
  );
  assert.ok(items.indexOf(wingL) < items.indexOf(wingR));
  const scalesL = items.filter((i) => i.assetId === 'moth_scale' && i._hier.path.startsWith('m1/wingL/'));
  assert.equal(scalesL.length, 40);
  for (const s of scalesL) {
    assert.equal(s._hier.depth, 2);
    assert.equal(s._hier.anchorId, SURFACE);
    assert.equal(s._hier.rootKey, 'm1');
    assert.equal(s.rotation, -45, "a scale inherits its wing's rotation");
    // undo the wing's transform: every scale lies inside the wing's own bounds
    const dx = s.x - wingL.x;
    const dy = s.y - wingL.y;
    const a = (45 * Math.PI) / 180; // inverse of -45
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    assert.ok(
      lx >= -60 - 1e-6 && lx <= 60 + 1e-6 && ly >= -40 - 1e-6 && ly <= 40 + 1e-6,
      `scale inside the wing (${lx.toFixed(1)}, ${ly.toFixed(1)})`,
    );
  }
  assert.equal(expansionFactor(MOTH, 'body'), 83, 'the factor is the item count, known before anything is placed');
}

// 3. the creature holds together: move, turn or grow the root and every part follows rigidly
{
  const base = expandHierarchy(ROOT, MOTH, { seed: 7 }).items;
  const moved = expandHierarchy({ ...ROOT, x: 900, y: 100 }, MOTH, { seed: 7 }).items;
  moved.forEach((m, k) => {
    assert.ok(near(m.x - base[k].x, 400, 1e-6) && near(m.y - base[k].y, -250, 1e-6), 'translation carries every part');
  });
  const turned = expandHierarchy({ ...ROOT, rot: 90 }, MOTH, { seed: 7 }).items;
  turned.forEach((t, k) => {
    const dx = base[k].x - 500;
    const dy = base[k].y - 350;
    assert.ok(
      near(t.x, 500 - dy, 1e-6) && near(t.y, 350 + dx, 1e-6),
      'a quarter turn of the root turns every part about it',
    );
    assert.ok(near(t.rotation, base[k].rotation + 90));
  });
  const grown = expandHierarchy({ ...ROOT, scaleX: 2, scaleY: 2 }, MOTH, { seed: 7 }).items;
  grown.forEach((g, k) => {
    assert.ok(
      near(g.x - 500, 2 * (base[k].x - 500), 1e-6) && near(g.y - 350, 2 * (base[k].y - 350), 1e-6),
      'doubling the root doubles every offset',
    );
    assert.equal(g.scaleX, 2 * base[k].scaleX);
  });
}

// 4. deterministic; the seed re-deals the scatter and nothing else
{
  const a = expandHierarchy(ROOT, MOTH, { seed: 7 }).items;
  assert.deepEqual(expandHierarchy(ROOT, MOTH, { seed: 7 }).items, a, 'same seed, same moth');
  const b = expandHierarchy(ROOT, MOTH, { seed: 8 }).items;
  assert.deepEqual(b.slice(0, 1), a.slice(0, 1), 'the body does not move with the seed');
  assert.deepEqual(
    b.filter((i) => i.assetId === 'moth_wing'),
    a.filter((i) => i.assetId === 'moth_wing'),
    'nor do the wings',
  );
  assert.notDeepEqual(
    b.filter((i) => i.assetId === 'moth_scale'),
    a.filter((i) => i.assetId === 'moth_scale'),
    'the scales are re-dealt',
  );
  // the two wings do not get the same scatter (the key includes the parent path)
  const L = a.filter((i) => i._hier.path.startsWith('m1/wingL/')).map((i) => [i.x - 485, i.y - 360]);
  const R = a.filter((i) => i._hier.path.startsWith('m1/wingR/')).map((i) => [i.x - 515, i.y - 360]);
  assert.notDeepEqual(L, R);
  // an injected scatter is used as given (step 4 passes the Poisson-disc set)
  const custom = expandHierarchy(ROOT, MOTH, {
    scatter: (key, count) => new Array(count).fill({ dx: 0, dy: 0 }),
  }).items;
  assert.ok(custom.filter((i) => i.assetId === 'moth_scale').every((s) => s._hier.path.includes('/scale#')));
  const pts = hashScatter(3)('k', 50, { x0: -5, y0: 2, x1: 5, y1: 4 });
  assert.ok(
    pts.every((p) => p.dx >= -5 && p.dx <= 5 && p.dy >= 2 && p.dy <= 4),
    'the default scatter stays inside the bounds',
  );
}

// 5. GUARDRAILS: a recipe that recurses forever, or asks for a million parts, terminates and says so
{
  const forever = {
    parts: {
      a: {
        asset: 'x',
        anchors: { n: { dx: 1, dy: 0 } },
        children: [
          { part: 'a', anchor: 'n' },
          { part: 'a', anchor: 'n' },
        ],
      },
    },
  };
  const r = expandHierarchy({ x: 0, y: 0, part: 'a' }, forever);
  assert.equal(r.truncated, true, 'the depth cap cut it');
  assert.equal(r.items.length, 2 ** (HIER_MAX_DEPTH + 1) - 1, 'a binary tree to the depth cap, then nothing');
  assert.ok(r.items.every((i) => i._hier.depth <= HIER_MAX_DEPTH));
  const deep = expandHierarchy({ x: 0, y: 0, part: 'a' }, forever, { maxDepth: 40 });
  assert.equal(deep.truncated, true);
  assert.equal(deep.items.length, HIER_GLOBAL_BUDGET, 'with no depth cap to save it, the item budget stops it');

  const swarm = {
    parts: {
      a: {
        asset: 'x',
        localBounds: { x0: 0, y0: 0, x1: 1, y1: 1 },
        children: [{ part: 'b', anchor: SURFACE, count: 1e9 }],
      },
      b: { asset: 'y' },
    },
  };
  let asked = 0;
  const big = expandHierarchy({ x: 0, y: 0, part: 'a' }, swarm, {
    scatter: (key, count) => {
      asked = count;
      return new Array(count).fill({ dx: 0, dy: 0 });
    },
  });
  assert.equal(big.items.length, HIER_GLOBAL_BUDGET, 'a billion scales become exactly the budget');
  assert.equal(big.truncated, true);
  assert.ok(
    asked < HIER_GLOBAL_BUDGET,
    `the sampler is never asked for more than the budget could hold (asked ${asked})`,
  );
  assert.equal(
    expandHierarchy({ x: 0, y: 0, part: 'a' }, swarm, { budget: 10 }).items.length,
    10,
    'a caller can lower the budget',
  );
  assert.equal(expansionFactor(swarm, 'a'), HIER_GLOBAL_BUDGET, 'the factor honours the same cap');
  assert.equal(expansionFactor(forever, 'a'), 2 ** (HIER_MAX_DEPTH + 1) - 1);
  assert.equal(expandHierarchy({ x: 0, y: 0, part: 'a' }, swarm, { budget: 0 }).items.length, 0);
}

// 6. recipe mistakes are named and skipped, never guessed
{
  const bad = {
    parts: {
      a: {
        asset: 'x',
        anchors: { ok: { dx: 1, dy: 1 } },
        children: [
          { part: 'ghost', anchor: 'ok' },
          { part: 'a2', anchor: 'nope' },
          { part: 'a2', anchor: SURFACE, count: 3 },
          { anchor: 'ok' },
        ],
      },
      a2: { asset: 'y' },
    },
  };
  const r = expandHierarchy({ x: 0, y: 0, part: 'a' }, bad);
  assert.equal(r.items.length, 1, 'only the root is drawn');
  assert.deepEqual(
    r.problems.sort(),
    [
      '"a": a surface child needs localBounds',
      '"a": child 3 names no part',
      '"a": no anchor "nope"',
      'unknown part "ghost"',
    ].sort(),
  );
  assert.deepEqual(expandHierarchy({ x: 0, y: 0, part: 'missing' }, bad), {
    items: [],
    truncated: false,
    problems: ['unknown part "missing"'],
  });
  assert.equal(
    expandHierarchy({ x: 0, y: 0, part: '__proto__' }, bad).items.length,
    0,
    'an inherited key is not a part',
  );
}

console.log('hierarchy.selfcheck: ok (#1206 step 1)');
