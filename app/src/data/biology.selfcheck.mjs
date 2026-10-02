import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIOLOGY_DEFAULT, sanitizeBiology, stepBiology } from './biology.js';

test('#793 default policy is versioned', () => {
  assert.equal(BIOLOGY_DEFAULT.kind, 'kc-biology');
  assert.equal(BIOLOGY_DEFAULT.version, 1);
});

test('#793 hostile input falls back', () => {
  const p = sanitizeBiology({ birthRate: 9, popCap: -3, version: 99 });
  assert.equal(p.birthRate, 1);
  assert.equal(p.popCap, 8);
  assert.equal(p.version, 1);
});

test('#793 over cap does not grow; under floor regrows', () => {
  const over = stepBiology({ pop: 400, ageMean: 0.2 }, { popCap: 100, birthRate: 1 }, 1);
  assert.ok(over.pop <= 100);
  const under = stepBiology({ pop: 10, ageMean: 0.1 }, { popCap: 100, regrowBelow: 0.4, birthRate: 1 }, 1);
  assert.equal(under.regrow, true);
  assert.ok(under.pop > 10);
});

test('#793 never-static refuses a dead plate', () => {
  const s = stepBiology({ pop: 0, ageMean: 1 }, { neverStatic: true, popCap: 50 }, 0);
  assert.ok(s.pop >= 2);
});
