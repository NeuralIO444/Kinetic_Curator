// risoField.selfcheck.mjs — RISO icon fields (#2008): the Martens deal and the
// cluster-disperse breathing. Pins: deal determinism, the anchored rest (t=0 is
// the dealt field exactly), cluster assignment honesty, and the Davis driver
// behaviour — the level eases, and when the driver DROPS the field relaxes
// toward the floor and keeps moving (never freezes, #721).
import assert from 'node:assert/strict';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const { dealRisoField, createBreathState, stepBreath, breatheFieldAt, RISO_CLUSTER_COUNT, BREATH_FLOOR, BREATH_PULL } =
  await import('./risoField.mjs');
const { risoIconId, RISO_ICON_SET_SIZE } = await import('./risoGrammar.mjs');

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

ok('deal determinism: same seed → same field; another seed deals another field', () => {
  const a = dealRisoField({ seed: 5, count: 60 });
  const b = dealRisoField({ seed: 5, count: 60 });
  assert.deepEqual(a, b);
  const c = dealRisoField({ seed: 6, count: 60 });
  assert.notDeepEqual(a.placements, c.placements);
});

ok('deal shape: dense grid inside the canvas, icons from the composed set, nearest cluster', () => {
  const f = dealRisoField({ seed: 9, count: 120, w: 1000, h: 700 });
  assert.equal(f.clusters.length, RISO_CLUSTER_COUNT);
  assert.equal(f.placements.length, 120);
  for (const p of f.placements) {
    assert.ok(p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 700, 'inside the canvas');
    assert.equal(p.assetId, risoIconId(9, p.iconIndex));
    assert.ok(p.iconIndex >= 0 && p.iconIndex < RISO_ICON_SET_SIZE);
    // nearest cluster, ties to the lowest index (the deal's own rule, re-derived)
    let want = 0;
    let best = Infinity;
    f.clusters.forEach((c, i) => {
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d < best) {
        best = d;
        want = i;
      }
    });
    assert.equal(p.cluster, want);
  }
});

ok('anchored rest: at t=0 the breathed field IS the dealt field, exactly', () => {
  const f = dealRisoField({ seed: 3, count: 40 });
  const st = createBreathState();
  const pos = breatheFieldAt(f, st);
  pos.forEach((q, i) => {
    assert.equal(q.x, f.placements[i].x);
    assert.equal(q.y, f.placements[i].y);
  });
});

ok('breathing moves the field and clusters contract/expand against their centres', () => {
  const f = dealRisoField({ seed: 3, count: 80 });
  const st = createBreathState();
  for (let i = 0; i < 120; i++) stepBreath(st, 1 / 30, 1); // 4 s at full drive
  assert.ok(st.level > 0.8, `level eased toward full drive (${st.level}; tau 2.5s over 4s reaches ~0.83)`);
  const pos = breatheFieldAt(f, st);
  const moved = pos.reduce((acc, q, i) => acc + dist(q, f.placements[i]), 0);
  assert.ok(moved > 0, 'the field breathes');
  const maxStep = Math.max(...pos.map((q, i) => dist(q, f.placements[i])));
  const maxDist = Math.max(...f.placements.map((p) => dist(p, f.clusters[p.cluster])));
  assert.ok(
    maxStep <= 2 * BREATH_PULL * maxDist + 1e-9,
    'displacement bounded by 2×BREATH_PULL of the cluster distance (the anchored sine difference peaks at 2)',
  );
});

ok('driver drop: the level relaxes toward the floor — and the field keeps moving (never freezes)', () => {
  const f = dealRisoField({ seed: 11, count: 60 });
  const st = createBreathState();
  for (let i = 0; i < 240; i++) stepBreath(st, 1 / 30, 1); // 8 s full drive
  const levelFull = st.level;
  // Driver drops to zero. Sample positions across the next 6 seconds.
  let prev = breatheFieldAt(f, st);
  let totalMotion = 0;
  let lastLevel = st.level;
  for (let i = 0; i < 180; i++) {
    stepBreath(st, 1 / 30, 0);
    const pos = breatheFieldAt(f, st);
    totalMotion += pos.reduce((acc, q, j) => acc + dist(q, prev[j]), 0);
    prev = pos;
    lastLevel = st.level;
  }
  assert.ok(lastLevel < levelFull, 'the level relaxed');
  assert.ok(lastLevel > BREATH_FLOOR, `the level approaches the floor asymptotically (${lastLevel} > ${BREATH_FLOOR})`);
  assert.ok(totalMotion > 0, 'the field kept breathing after the driver dropped — relaxed, not frozen');
});

ok('long after the drop the breath is gentle but still alive (floor, not zero)', () => {
  const f = dealRisoField({ seed: 11, count: 60 });
  const st = createBreathState();
  for (let i = 0; i < 240; i++) stepBreath(st, 1 / 30, 1);
  for (let i = 0; i < 3600; i++) stepBreath(st, 1 / 30, 0); // 120 s of silence
  assert.ok(Math.abs(st.level - BREATH_FLOOR) < 0.01, `level settled at the floor (${st.level})`);
  const a = breatheFieldAt(f, st);
  stepBreath(st, 0.5, 0);
  const b = breatheFieldAt(f, st);
  const motion = a.reduce((acc, q, j) => acc + dist(q, b[j]), 0);
  assert.ok(motion > 0, 'even settled at the floor, the phase advances and the field moves');
});

ok('junk drivers read as silence; the field is never mutated by breathing', () => {
  const f = dealRisoField({ seed: 2, count: 10 });
  const snapshot = JSON.stringify(f);
  const st = createBreathState();
  stepBreath(st, 1, 'loud');
  assert.equal(st.level, BREATH_FLOOR + (BREATH_FLOOR - BREATH_FLOOR), 'junk eased toward the floor target');
  breatheFieldAt(f, st);
  assert.equal(JSON.stringify(f), snapshot);
});

console.log(`risoField.selfcheck: ${n} checks passed`);
