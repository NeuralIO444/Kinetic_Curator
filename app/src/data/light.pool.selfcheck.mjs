import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeLight, contractLight, LIGHT_DEFAULT } from './light.js';

test('#594 pool defaults off so an old sun is unchanged', () => {
  const light = sanitizeLight({ x: 1 });
  assert.equal(light.pool, 0);
  assert.equal(LIGHT_DEFAULT.pool, 0);
  assert.equal(contractLight({ pool: 0.4 }, {}).pool, 0.4);
});
