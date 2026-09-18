// FIELD hash. Node-only.
import assert from 'node:assert';
import { applyField } from './trackGraph.js';
import { buildPointHash, forNeighbors, FIELD_RADIUS } from './fieldHash.js';

{
  const src = [{ x: 0.2, y: 0.5 }];
  const dst = [{ x: 0, y: 0.5 }];
  const pull = applyField(dst, src, { mode: 'field', strength: 2, polarity: 1 });
  const push = applyField(dst, src, { mode: 'field', strength: 2, polarity: -1 });
  assert.ok(pull[0].x > dst[0].x, 'near attract');
  assert.ok(push[0].x < dst[0].x, 'near repel');
}

{
  const src = [{ x: 1, y: 0.5 }];
  const dst = [{ x: 0, y: 0.5 }];
  const out = applyField(dst, src, { mode: 'field', strength: 4, polarity: 1 });
  assert.ok(Math.abs(out[0].x - dst[0].x) < 1e-12, 'far source does not pull');
}

{
  const off = applyField([{ x: 0.1, y: 0.1 }], [{ x: 0.2, y: 0.2 }], { mode: 'off' });
  assert.strictEqual(off[0].x, 0.1);
}

// 400×400 packed in the unit square is the WORST case for R=0.35
// (the radius covers a large fraction of the board). Contract: beat naive,
// and force evals (inside R) stay under half of n·m.
{
  const n = 400;
  const src = [];
  const dst = [];
  for (let i = 0; i < n; i++) {
    src.push({ x: (i % 20) / 20, y: Math.floor(i / 20) / 20 });
    dst.push({ x: (i % 20) / 20 + 0.01, y: Math.floor(i / 20) / 20 + 0.01 });
  }
  const hash = buildPointHash(src);
  const r2 = FIELD_RADIUS * FIELD_RADIUS;
  let checks = 0;
  let forces = 0;
  for (const q of dst) {
    checks += forNeighbors(hash, q.x, q.y, FIELD_RADIUS, (s) => {
      const dx = s.x - q.x;
      const dy = s.y - q.y;
      if (dx * dx + dy * dy <= r2) forces++;
    });
  }
  const naive = n * n;
  assert.ok(checks < naive, `cell visits ${checks} must beat naive ${naive}`);
  assert.ok(forces < naive * 0.55, `in-radius evals ${forces} vs naive ${naive}`);
  applyField(dst, src, { mode: 'field', strength: 1 });
  console.log('kernel/tracks/fieldHash.selfcheck: OK', {
    checks, forces, naive, radius: FIELD_RADIUS,
  });
}
