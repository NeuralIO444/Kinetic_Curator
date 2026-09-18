// Eval Worker ABI. Node-only.
//   node src/engine/kernel/eval/evalWorker.selfcheck.mjs
import assert from 'node:assert';
import { evaluate } from '../evalContext.js';
import { createEvalHost, EVAL_WORKER_ABI } from './evalHost.js';
import { DEFAULT_LAYOUT_PARAMS } from '../../../data/layout-modes.js';

const ASSETS = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const PALETTE = { swatches: ['#111', '#222', '#333', '#444'] };
const CAPS = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };

function ctxOf(extra = {}) {
  const layoutParams = { ...DEFAULT_LAYOUT_PARAMS, mode: 'fibonacci', count: 80, ...extra.layoutParams };
  return {
    seed: extra.seed ?? 0x1a4f,
    layout: {
      layoutParams,
      canvasW: extra.canvasW ?? 1000,
      canvasH: extra.canvasH ?? 700,
      caGrid: null,
    },
    palette: extra.palette ?? PALETTE,
    assets: extra.assets ?? ASSETS,
    caps: CAPS,
    t: extra.t ?? 0,
  };
}

function sameItems(got, want, label) {
  assert.strictEqual(got.items.length, want.items.length, `${label}: count`);
  assert.strictEqual(got.safeCount, want.safeCount, `${label}: safeCount`);
  for (let i = 0; i < want.items.length; i++) {
    for (const k of ['x', 'y', 'scale', 'rotation', 'alpha', 'index', 't', 'assetId', 'color', 'key']) {
      assert.strictEqual(got.items[i][k], want.items[i][k], `${label}: [${i}].${k}`);
    }
  }
}

const host = createEvalHost();
try {
  const pong = await host.ping();
  assert.strictEqual(pong.abi, EVAL_WORKER_ABI);

  const base = ctxOf();
  const local = evaluate(base);
  const remote = await host.eval(base);
  sameItems({ items: remote.items, safeCount: remote.safeCount }, local, 'initial');

  const scaled = ctxOf({ layoutParams: { scale: [0.41, 1.63] } });
  sameItems(
    { items: (await host.eval(scaled)).items, safeCount: (await host.eval(scaled)).safeCount },
    evaluate(scaled),
    'scale modulated',
  );

  const moved = ctxOf({ seed: 0x9e3d, layoutParams: { mode: 'grid', count: 40, displacement: 20 } });
  const r = await host.eval(moved);
  sameItems({ items: r.items, safeCount: r.safeCount }, evaluate(moved), 'seed+mode+disp');

  // Two sessions must not share cache.
  const a = await host.eval(base, 'A');
  const b = await host.eval(ctxOf({ seed: 0x5150 }), 'B');
  assert.notStrictEqual(a.items[0].x, b.items[0].x);

  await host.reset('A');
  const a2 = await host.eval(base, 'A');
  sameItems({ items: a2.items, safeCount: a2.safeCount }, local, 'after reset');

  console.log('kernel/eval/evalWorker.selfcheck: OK', {
    abi: EVAL_WORKER_ABI,
    items: local.items.length,
  });
} finally {
  await host.close();
}
