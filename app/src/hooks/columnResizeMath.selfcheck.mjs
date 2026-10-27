// columnResizeMath.selfcheck.mjs — audit standards, hooks tests slice 1
// (#1686). Characterization pins for useColumnResize's pure core,
// hand-derived from the hook's inline math BEFORE extraction: a divider
// drag shifts delta between the two neighbouring fractions, deficits
// are pushed to the other side, and when BOTH sides cannot hold the
// minimum the update is REJECTED (null) rather than clamped into an
// illegal layout.
import assert from 'node:assert';
import { resizeFractions } from './columnResizeMath.mjs';

const near = (a, b) => Math.abs(a - b) < 1e-9;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Plain drag: divider 0 moves +0.1 from the right column to the left.
{
  const next = resizeFractions([0.32, 0.34, 0.34], 0, 0.1, 0.2);
  assert.ok(next && near(next[0], 0.42) && near(next[1], 0.24) && near(next[2], 0.34),
    `plain drag shifts the delta: ${next}`);
  assert.ok(near(sum(next), 1), 'accepted resizes preserve the total');
}
// Dragging left past the minimum: the deficit comes back off the right.
{
  const next = resizeFractions([0.32, 0.34, 0.34], 0, -0.2, 0.2);
  assert.ok(next && near(next[0], 0.2) && near(next[1], 0.46) && near(next[2], 0.34),
    `left clamps at the minimum, right absorbs the deficit: ${next}`);
}
// Second divider: right would fall to 0.34 - 0.3 = 0.04, so it clamps
// at 0.2 and the middle gives the 0.16 deficit back: 0.64 - 0.16 = 0.48.
{
  const next = resizeFractions([0.32, 0.34, 0.34], 1, 0.3, 0.2);
  assert.ok(next && near(next[0], 0.32) && near(next[1], 0.48) && near(next[2], 0.2),
    `right side clamps at the minimum, middle returns the deficit: ${next}`);
}
// Both sides cannot hold the minimum (0.5/0.5 with min 0.6): rejected.
assert.strictEqual(resizeFractions([0.5, 0.5], 0, 0, 0.6), null,
  'an impossible minimum rejects the update instead of clamping illegally');
// The start array is never mutated.
{
  const start = [0.32, 0.34, 0.34];
  resizeFractions(start, 0, 0.1, 0.2);
  assert.deepStrictEqual(start, [0.32, 0.34, 0.34], 'input fractions are not mutated');
}

console.log('columnResizeMath.selfcheck: OK — column resize pure core pinned');
