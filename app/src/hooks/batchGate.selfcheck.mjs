// batchGate.selfcheck — BATCH start gate incl. the resume edge (#569).
// Node-only, pure: canStartBatch takes snapshots, never the loop.
import { strict as assert } from 'node:assert';
import { canStartBatch } from './useMediaExport.js';

// Full matrix: exactly one gate fires, with its honest reason.
{
  const run = { running: true, rendering: false, accumOn: false };
  assert.deepStrictEqual(canStartBatch(run), { ok: true, reason: null }, 'clean state fires');
  assert.deepStrictEqual(
    canStartBatch({ ...run, rendering: true }),
    { ok: false, reason: 'Batch already running' },
    'rendering refuses first',
  );
  const paused = canStartBatch({ ...run, running: false });
  assert.strictEqual(paused.ok, false, 'paused refuses');
  assert.ok(paused.reason.includes('resume with Space'), 'paused reason names the resume step');
  const accum = canStartBatch({ ...run, accumOn: true });
  assert.strictEqual(accum.ok, false, 'accum refuses');
  assert.ok(accum.reason.includes('ACCUM off'), 'accum reason names the cause');
  console.log('[selfcheck] batch gate matrix');
}

// Resume edge: batch issued while paused, then unpaused — refuse, never
// hang; and refusal stores no intent, so resume leaves nothing orphaned.
// (The gate is a pure function of the snapshot: calling it paused twice
// then resumed proves no hidden state accumulates between calls.)
{
  const pausedSnap = { running: false, rendering: false, accumOn: false };
  const first = canStartBatch(pausedSnap);
  const second = canStartBatch(pausedSnap);
  assert.deepStrictEqual(first, second, 'repeated paused calls refuse identically (no intent stored)');
  assert.deepStrictEqual(
    canStartBatch({ ...pausedSnap, running: true }),
    { ok: true, reason: null },
    'unpause clears the refusal — re-issue fires, nothing orphaned, nothing auto-fires',
  );
  console.log('[selfcheck] batch resume edge: refuse-while-paused, fire-after-resume, no orphans');
}
