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

// Far pair beyond FIELD_RADIUS is a no-op (short-range by design).
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

// 400×400 must not visit n·m pairs.
{
  const n = 400;
  const src = [];
  const dst = [];
  for (let i = 0; i < n; i++) {
    src.push({ x: (i % 20) / 20, y: Math.floor(i / 20) / 20 });
    dst.push({ x: (i % 20) / 20 + 0.01, y: Math.floor(i / 20) / 20 + 0.01 });
  }
  const hash = buildPointHash(src);
  let checks = 0;
  for (const q of dst) checks += forNeighbors(hash, q.x, q.y, FIELD_RADIUS, () => {});
  const naive = n * n;
  assert.ok(checks < naive * 0.35, `hash checks ${checks} vs naive ${naive}`);
  applyField(dst, src, { mode: 'field', strength: 1 });
  console.log('kernel/tracks/fieldHash.selfcheck: OK', { checks, naive, radius: FIELD_RADIUS });
}
