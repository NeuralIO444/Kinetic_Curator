// deviceBudgets.selfcheck.mjs — #1639: the frame budgets judge a dataset the way the report says.
//
// Pins: the budget constants' shape (iPad never looser than desktop; caps are shares of a 60 fps
// frame, never the whole frame), the verdict bands including their exact boundaries, and the
// dataset classification the committed report is generated from — sorting, the base-recipe
// spread, the named bust/near/unmeasured lists, and failed rows carried as unmeasured with their
// error, never dropped and never mislabeled a cost bust.
import assert from 'node:assert/strict';
import { FRAME_BUDGETS, frameBudgetForDevice } from '../../data/quality.js';
import { classifyLabel, classifyDataset } from './deviceBudgets.mjs';

// the budgets themselves
for (const cls of ['desktop', 'ipad']) {
  const b = FRAME_BUDGETS[cls];
  assert.ok(b.renderCapMs < b.frameMs, `${cls}: the render cap is a share of the frame, never the frame`);
  assert.equal(b.targetFps, 60);
  assert.ok(b.nearBustRatio > 0 && b.nearBustRatio < 1);
}
assert.ok(FRAME_BUDGETS.ipad.renderCapMs < FRAME_BUDGETS.desktop.renderCapMs, 'iPad is the tighter class');
assert.equal(frameBudgetForDevice(true), FRAME_BUDGETS.ipad);
assert.equal(frameBudgetForDevice(false), FRAME_BUDGETS.desktop);

// verdict bands, on the desktop cap (8.0, near at 6.4)
const D = FRAME_BUDGETS.desktop;
assert.equal(classifyLabel(1, D).verdict, 'fits');
assert.equal(classifyLabel(D.renderCapMs * D.nearBustRatio - 0.01, D).verdict, 'fits');
assert.equal(
  classifyLabel(D.renderCapMs * D.nearBustRatio, D).verdict,
  'near-bust',
  'the near band includes its floor',
);
assert.equal(classifyLabel(D.renderCapMs, D).verdict, 'near-bust', 'exactly at the cap still fits — nothing spare');
assert.equal(classifyLabel(D.renderCapMs + 0.01, D).verdict, 'bust');
assert.equal(classifyLabel(null, D).verdict, 'unmeasured');
assert.equal(classifyLabel(NaN, D).verdict, 'unmeasured');
assert.ok(Math.abs(classifyLabel(16, D).multiple - 2) < 1e-9, 'the multiple is the label over the cap');

// dataset classification: ordering, spread, named lists, failed rows
{
  const ds = {
    environment: { renderer: 'test-renderer', swiftShader: true },
    method: { label: 'test label' },
    rows: [
      { id: 'grid-base', labelMs: 2 },
      { id: 'fits-both', labelMs: 3 },
      { id: 'desktop-near', labelMs: 7 },
      { id: 'ipad-bust', labelMs: 6 },
      { id: 'busts-both', labelMs: 40 },
      { id: 'heavy-failed', labelMs: null, error: 'payload too large for page memory' },
    ],
  };
  const c = classifyDataset(ds);
  assert.equal(c.environment.renderer, 'test-renderer', 'the environment stamp passes through');
  assert.equal(c.baseMs, 2);
  assert.deepEqual(
    c.rows.map((r) => r.id),
    ['busts-both', 'desktop-near', 'ipad-bust', 'fits-both', 'grid-base', 'heavy-failed'],
    'heaviest first, unmeasured last',
  );
  const byId = Object.fromEntries(c.rows.map((r) => [r.id, r]));
  assert.equal(byId['fits-both'].overBase, 1.5, 'the spread is measured against the base recipe');
  assert.equal(byId['fits-both'].ipad.verdict, 'fits');
  assert.equal(byId['desktop-near'].desktop.verdict, 'near-bust');
  assert.equal(
    byId['desktop-near'].ipad.verdict,
    'bust',
    'a desktop near-bust can be an iPad bust — the classes judge independently',
  );
  assert.equal(
    byId['ipad-bust'].desktop.verdict,
    'fits',
    'under the desktop near floor of 6.4, over the iPad cap entirely',
  );
  assert.deepEqual(c.busts.desktop, ['busts-both']);
  assert.deepEqual(c.busts.ipad, ['busts-both', 'desktop-near', 'ipad-bust']);
  assert.deepEqual(c.nearBusts.desktop, ['desktop-near']);
  assert.deepEqual(c.nearBusts.ipad, []);
  assert.deepEqual(c.unmeasured, ['heavy-failed']);
  assert.match(byId['heavy-failed'].failed, /payload too large/, 'the failed row keeps its error');
  assert.equal(
    byId['heavy-failed'].desktop.verdict,
    'unmeasured',
    'a harness failure is never reported as a cost bust',
  );
}

console.log('deviceBudgets.selfcheck: ok');
